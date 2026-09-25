// First-person walker.
//
// Movement model, deliberately not a physics engine:
//   * horizontal   - a capsule whose BOTTOM sits at (feet + stepUp) is pushed
//                    out of the collision mesh, so walls and furniture block
//                    and you slide along them, while anything shorter than
//                    stepUp is simply stepped over.
//   * vertical     - a ray straight down finds the surface under the feet.
//                    The camera eases toward it, which is what makes the
//                    chunky voxel stairs feel like stairs rather than a lift.
//   * ledges       - a move that would drop further than maxDrop is refused,
//                    so you cannot walk off the landing into the hall.
import * as THREE from 'three';
import { CONFIG } from '../config/config.js';

const P = CONFIG.player;

const _seg = new THREE.Line3();
const _box = new THREE.Box3();
const _triPoint = new THREE.Vector3();
const _capPoint = new THREE.Vector3();
const _push = new THREE.Vector3();
const _ray = new THREE.Ray();
const _down = new THREE.Vector3(0, -1, 0);
const _cand = new THREE.Vector3();
const FOOT = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class Walker {
  constructor(bvh, camera, stairsBVH = null) {
    this.bvh = bvh;
    this.stairsBVH = stairsBVH;
    this.camera = camera;

    this.feet = new THREE.Vector3(...P.spawn);
    this.smoothY = this.feet.y;
    this.yaw = P.spawnYaw;
    this.pitch = P.spawnPitch;

    this.target = null;          // current leg of the walk
    this.path = [];              // remaining legs after this one
    this.speed = 0;
    this.bobPhase = 0;
    this.stuckFor = 0;
    this.replans = 0;
    this.sinceReplan = 0;
    this.goal = null;
    this.onReplan = null;
    this.keys = new Set();
    this.userLooking = false;    // set while dragging, read by the UI
    // Bumped on every actual look() call. `userLooking` is a 1.6-SECOND flag
    // main.js holds down after a drag, which is far too blunt for "is the
    // visitor steering the camera right now?" — pick a floor within a second
    // and a half of looking around and anything gated on it never runs at
    // all. Code that has to know whether a drag happened *since some moment*
    // compares this counter instead. See guide.js.
    this.lookSeq = 0;
    this.fov = P.fov;
    // Multiplier on the walk speed. The stairs shortcut raises it while it is
    // carrying the visitor up, so the climb doesn't outstay its welcome.
    this.speedScale = 1;

    // Seated mode (the desk chair). While `seat` is set the walker does not
    // walk: the camera eases into the chair and stays there, but looking
    // around is still entirely free.
    this.seat = null;
    this.seatT = 0;

    // Guided ride (the stairs shortcut). See `ride()`.
    this.riding = null;

    const g = this.groundAt(this.feet);
    if (g !== null) { this.feet.y = g; this.smoothY = g; }
  }

  // ---- queries ------------------------------------------------------------

  probe(x, y, z, tree = this.bvh) {
    if (!tree) return null;
    _ray.origin.set(x, y, z);
    _ray.direction.copy(_down);
    const hit = tree.raycastFirst(_ray, THREE.DoubleSide, 0, 400);
    return hit ? hit.point.y : null;
  }

  /**
   * Is the surface at (x, y, z) part of a staircase? Sampled across the same
   * footprint as groundAt, because the height that won there may have come
   * from the edge of a tread rather than from dead centre.
   */
  onStairs(x, y, z) {
    if (!this.stairsBVH) return true;   // no stair list: allow the big step
    const top = y + 0.4;
    let h = this.probe(x, top, z, this.stairsBVH);
    if (h !== null && Math.abs(h - y) < 0.3) return true;
    const r = P.radius * 0.7;
    for (const [ox, oz] of FOOT) {
      h = this.probe(x + ox * r, top, z + oz * r, this.stairsBVH);
      if (h !== null && Math.abs(h - y) < 0.3) return true;
    }
    return false;
  }

  doorwayAt(x, y, z) {
    for (const d of CONFIG.doorways ?? []) {
      const b = d.box;
      if (x > b.x[0] && x < b.x[1] && y > b.y[0] && y < b.y[1] && z > b.z[0] && z < b.z[1]) return d;
    }
    return null;
  }

  /**
   * Height of the walkable surface under `p`, or null if there is none.
   * Five samples across the foot rather than one, so a hairline crack between
   * two floor tiles is not mistaken for a hole in the world.
   */
  groundAt(p, fromY = null) {
    const base = fromY === null ? p.y : fromY;
    const top = base + P.stepUp + 0.05;
    let best = this.probe(p.x, top, p.z);
    const r = P.radius * 0.7;
    for (const [ox, oz] of FOOT) {
      const h = this.probe(p.x + ox * r, top, p.z + oz * r);
      if (h !== null && (best === null || h > best)) best = h;
    }
    // A doorway sits on the edge of its floor slab, so for the width of the
    // wall there is nothing underfoot. Bridge it at the threshold height.
    const d = this.doorwayAt(p.x, base, p.z);
    if (d && d.floor !== undefined && (best === null || Math.abs(best - d.floor) > 0.6)) return d.floor;
    return best;
  }

  /** True while the visitor is inside a doorway that has no real opening cut. */
  inDoorway(p) { return this.doorwayAt(p.x, p.y, p.z) !== null; }

  /** Push a candidate feet position out of any geometry it is inside. */
  resolveHorizontal(p) {
    if (this.inDoorway(p)) return p;   // walk through — see CONFIG.doorways
    const R = P.radius;
    const lo = p.y + P.stepUp + R;
    const hi = p.y + P.bodyTop - R;
    _seg.start.set(p.x, Math.min(lo, hi), p.z);
    _seg.end.set(p.x, Math.max(lo, hi), p.z);

    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      _box.makeEmpty();
      _box.expandByPoint(_seg.start);
      _box.expandByPoint(_seg.end);
      _box.min.addScalar(-R); _box.max.addScalar(R);

      this.bvh.shapecast({
        intersectsBounds: (b) => b.intersectsBox(_box),
        intersectsTriangle: (tri) => {
          const d = tri.closestPointToSegment(_seg, _triPoint, _capPoint);
          if (d >= R) return false;
          _push.copy(_capPoint).sub(_triPoint);
          _push.y = 0;                       // horizontal push only
          const len = _push.length();
          if (len < 1e-6) return false;
          _push.multiplyScalar((R - d) / len);
          _seg.start.add(_push);
          _seg.end.add(_push);
          moved = true;
          return false;
        },
      });
      if (!moved) break;
    }
    p.x = _seg.start.x;
    p.z = _seg.start.z;
    return p;
  }

  /** True if `p` (already resolved) has valid, reachable ground. */
  settle(p, fromY) {
    const g = this.groundAt(p, fromY);
    if (g === null) return false;             // nothing to stand on
    if (fromY - g > P.maxDrop) return false;  // ledge
    const rise = g - fromY;
    if (rise > P.stepSmall && !this.onStairs(p.x, g, p.z) &&
        !this.doorwayAt(p.x, fromY, p.z)) return false;   // not a step, a sofa
    p.y = g;
    return true;
  }

  /** Slide-aware step. Returns true if the walker actually moved. */
  attemptMove(dx, dz) {
    const from = this.feet;
    const tries = [[dx, dz], [dx, 0], [0, dz]];
    for (const [ax, az] of tries) {
      if (ax === 0 && az === 0) continue;
      _cand.set(from.x + ax, from.y, from.z + az);
      this.resolveHorizontal(_cand);
      if (this.settle(_cand, from.y)) {
        const gained = Math.hypot(_cand.x - from.x, _cand.z - from.z);
        from.copy(_cand);
        return gained;
      }
    }
    return 0;
  }

  // ---- per-frame ----------------------------------------------------------

  update(dt) {
    if (this.seat) { this.updateSeated(dt); return; }
    if (this.riding) { this.updateRide(dt); return; }

    const desired = new THREE.Vector2(0, 0);

    // Keyboard is an optional extra; click-to-move is the primary control.
    if (P.enableKeyboard && this.keys.size) {
      const f = new THREE.Vector2(-Math.sin(this.yaw), -Math.cos(this.yaw));
      const r = new THREE.Vector2(Math.cos(this.yaw), -Math.sin(this.yaw));
      if (this.keys.has('w')) desired.add(f);
      if (this.keys.has('s')) desired.sub(f);
      if (this.keys.has('d')) desired.add(r);
      if (this.keys.has('a')) desired.sub(r);
      if (desired.lengthSq() > 0) { desired.normalize(); this.stop(); }
    }

    let arriving = 1;
    if (!desired.lengthSq() && this.target) {
      const dx = this.target.x - this.feet.x;
      const dz = this.target.z - this.feet.z;
      const dist = Math.hypot(dx, dz);
      const last = this.path.length === 0;
      if (dist < (last ? P.arriveDist : P.cornerDist)) {
        this.target = this.path.length ? this.path.shift() : null;
        this.stuckFor = 0;
      } else {
        desired.set(dx / dist, dz / dist);
        // Only ease to a stop on the final leg; corners are taken at speed.
        arriving = last ? THREE.MathUtils.clamp(dist / P.slowRadius, 0.18, 1) : 1;
      }
    }

    const wants = desired.lengthSq() > 0;
    const goal = wants ? P.walkSpeed * this.speedScale * arriving : 0;
    this.speed += (goal - this.speed) * Math.min(1, dt * P.accel);
    if (this.speed < 0.02) this.speed = 0;

    let travelled = 0;
    if (this.speed > 0 && wants) {
      const step = this.speed * dt;
      travelled = this.attemptMove(desired.x * step, desired.y * step);

      // Give up on a target we cannot reach instead of grinding into a wall.
      if (travelled < step * 0.25) {
        this.stuckFor += dt;
        if (this.stuckFor > 0.45) {
          this.stuckFor = 0;
          // Ask for a fresh route from where we actually are. Only if that
          // keeps failing do we skip the leg and, eventually, give up.
          if (this.onReplan && this.goal && this.replans < 3) {
            this.replans++;
            this.onReplan(this.goal);
          } else {
            this.target = this.path.length ? this.path.shift() : null;
            if (!this.target) { this.speed = 0; this.goal = null; this.replans = 0; }
          }
        }
      } else {
        this.stuckFor = 0;
        this.sinceReplan = (this.sinceReplan ?? 0) + travelled;
        if (this.sinceReplan > 1.5) { this.replans = 0; this.sinceReplan = 0; }
      }

      // The camera used to turn itself toward the walking direction here.
      // It is off by default now (P.autoTurn = 0): where you look is only
      // ever where you dragged. Set autoTurn above 0 to bring it back.
      if (P.autoTurn > 0 && !this.userLooking && travelled > 0) {
        const want = Math.atan2(-desired.x, -desired.y);
        let d = want - this.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        this.yaw += d * Math.min(1, dt * P.autoTurn);
      }
    }

    // Ease the eye height toward the floor: this is the stair climb.
    const climbing = this.feet.y - this.smoothY;
    this.smoothY += climbing * Math.min(1, dt * P.heightSmooth);

    // Head bob, a little heavier when climbing.
    if (travelled > 0) {
      this.bobPhase += dt * P.bobSpeed * (0.7 + this.speed / P.walkSpeed);
    } else {
      this.bobPhase += dt * 1.4;
    }
    const bobScale = travelled > 0 ? 1 : 0.12;
    const bob = Math.sin(this.bobPhase) * P.bobAmount * bobScale * (1 + Math.max(0, climbing) * 0.9);

    this.camera.position.set(this.feet.x, this.smoothY + P.eyeHeight + bob, this.feet.z);
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = Math.sin(this.bobPhase * 0.5) * 0.0035 * (travelled > 0 ? 1 : 0);

    this.moving = travelled > 0;
  }

  // ---- guided ride --------------------------------------------------------
  //
  // Being taken up the stairs is NOT a normal walk. The walkable map joins
  // some stair nodes with a rise the walker is allowed to fall down but not
  // to climb, so asking it to walk a route up two flights stalls partway
  // and gives up. A ride sidesteps all of it: the feet simply follow the
  // route as a polyline at a fixed speed, with no collision and no ground
  // probe, and the usual height smoothing still makes it feel like stairs.
  // Normal walking resumes, settled onto real ground, at the far end.

  /** Glide along a list of world points. `points` should start ahead of us. */
  ride(points, speed = 11) {
    if (!points || !points.length) return;
    this.stop();
    this.keys.clear();
    this.riding = {
      pts: [this.feet.clone(), ...points.map((p) => p.clone())],
      seg: 0, t: 0, speed,
    };
  }

  /**
   * A point `dist` further along the ride than we are now, for the camera to
   * face. Looking a few units ahead rather than at the next node is what keeps
   * the view steady on stairs, where the route is a chain of short treads: aim
   * at the next node and the yaw twitches on every step.
   */
  rideAim(dist = 3) {
    const r = this.riding;
    if (!r) return null;
    let seg = r.seg, t = r.t, remain = dist;
    while (seg < r.pts.length - 1) {
      const a = r.pts[seg], b = r.pts[seg + 1];
      const len = a.distanceTo(b);
      const left = len * (1 - t);
      if (left >= remain || seg === r.pts.length - 2) {
        const u = Math.min(1, t + remain / (len || 1));
        return a.clone().lerp(b, u);
      }
      remain -= left; seg++; t = 0;
    }
    return r.pts[r.pts.length - 1].clone();
  }

  /** How far is left to go on the current ride (0 when not riding). */
  rideRemaining() {
    const r = this.riding;
    if (!r) return 0;
    let d = 0;
    for (let s = r.seg; s < r.pts.length - 1; s++) {
      const len = r.pts[s].distanceTo(r.pts[s + 1]);
      d += s === r.seg ? len * (1 - r.t) : len;
    }
    return d;
  }

  /** Abandon the ride wherever it has got to. */
  stopRide() {
    if (!this.riding) return;
    this.riding = null;
    const g = this.groundAt(this.feet, this.feet.y + 0.6);
    if (g !== null) this.feet.y = g;
  }

  updateRide(dt) {
    const r = this.riding;
    let move = r.speed * dt;

    while (move > 0 && r.seg < r.pts.length - 1) {
      const a = r.pts[r.seg];
      const b = r.pts[r.seg + 1];
      const len = a.distanceTo(b);
      if (len < 1e-5) { r.seg++; r.t = 0; continue; }
      const remain = len * (1 - r.t);
      if (move < remain) { r.t += move / len; move = 0; }
      else { move -= remain; r.seg++; r.t = 0; }
    }

    if (r.seg >= r.pts.length - 1) {
      this.feet.copy(r.pts[r.pts.length - 1]);
      this.stopRide();
    } else {
      this.feet.lerpVectors(r.pts[r.seg], r.pts[r.seg + 1], r.t);
    }

    // Same height easing as walking, so the climb reads as steps rather than
    // as a lift, plus a little bob so it doesn't feel like a dolly track.
    this.smoothY += (this.feet.y - this.smoothY) * Math.min(1, dt * P.heightSmooth);
    this.bobPhase += dt * P.bobSpeed * 0.85;
    const bob = Math.sin(this.bobPhase) * P.bobAmount * 0.8;

    this.camera.position.set(this.feet.x, this.smoothY + P.eyeHeight + bob, this.feet.z);
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = 0;
    this.moving = true;
    this.speed = 0;
  }

  // ---- seated -------------------------------------------------------------

  /**
   * Drop into a fixed viewpoint (the desk chair). The camera eases from
   * wherever it is now to `eye`, and the view swings around to `yaw`/`pitch`
   * over the same beat. Once seated, dragging still looks around freely.
   */
  sit({ eye, yaw, pitch = 0, speed = 1.5 }) {
    this.stop();
    this.keys.clear();
    this.seat = {
      eye: new THREE.Vector3(...eye),
      from: this.camera.position.clone(),
      yawFrom: this.yaw,
      yawTo: this.yaw + shortestTurn(this.yaw, yaw),
      pitchFrom: this.pitch,
      pitchTo: pitch,
      speed,
    };
    this.seatT = 0;
  }

  /** Get up. The walker resumes from wherever its feet were left. */
  stand() {
    this.seat = null;
    this.seatT = 0;
    this.smoothY = this.feet.y;
  }

  get seated() { return this.seat !== null; }
  /** True once the sit-down animation has finished. */
  get seatedStill() { return this.seat !== null && this.seatT >= 1; }

  updateSeated(dt) {
    const s = this.seat;
    if (s.speed > 0 && this.seatT < 1) {
      this.seatT = Math.min(1, this.seatT + dt * s.speed);
      const e = this.seatT * this.seatT * (3 - 2 * this.seatT);   // smoothstep
      this.camera.position.lerpVectors(s.from, s.eye, e);
      // Only steer the view while sitting down; after that it is all yours.
      this.yaw = THREE.MathUtils.lerp(s.yawFrom, s.yawTo, e);
      this.pitch = THREE.MathUtils.lerp(s.pitchFrom, s.pitchTo, e);
    } else {
      this.seatT = 1;
      this.camera.position.copy(s.eye);
    }
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = 0;
    this.moving = false;
    this.speed = 0;
  }

  /** Walk straight at a world point, ignoring the navigation graph. */
  moveTo(point) {
    this.path = [];
    this.target = point.clone();
    this.stuckFor = 0;
  }

  /** Follow a route from the navigation graph. */
  follow(points, goal = null) {
    if (!points || !points.length) return;
    this.path = points.map((p) => p.clone());
    this.goal = (goal ?? points[points.length - 1]).clone();
    this.target = this.path.shift();
    this.stuckFor = 0;
  }

  stop() { this.path = []; this.target = null; this.goal = null; this.replans = 0; }

  /**
   * Session 53: true while a click-to-walk is carrying the visitor THROUGH
   * a spot on the way somewhere else — i.e. there is a walk goal and it is
   * not within `r` of (x, z). Walk-in triggers (a star's stand spot, a
   * seat's box, the foot of the stairs) ask this first, so the view never
   * swings round to something you only happened to walk past. Where you
   * clicked is where you go. Keyboard walking has no goal, so it still
   * triggers them the old way.
   */
  passingThrough(x, z, r = 1) {
    const g = this.goal;
    if (!g || (!this.target && !this.path.length)) return false;
    return Math.hypot(g.x - x, g.z - z) > r + 0.3;
  }

  /**
   * Pure 1:1 look. Yaw is unbounded — spin as far as you like. Pitch stops a
   * hair short of vertical only because going past it would turn the world
   * upside down; there is no other range, and no zoom anywhere.
   */
  look(dxPixels, dyPixels) {
    if (dxPixels || dyPixels) this.lookSeq++;
    // Session 54: drag direction is flippable per axis (CONFIG.player
    // lookInvertX / lookInvertY) — Apoorva wants it the other way round.
    const sx = P.lookInvertX ? -1 : 1, sy = P.lookInvertY ? -1 : 1;
    this.yaw -= sx * dxPixels * P.lookSpeed;
    this.pitch = THREE.MathUtils.clamp(this.pitch - sy * dyPixels * P.lookSpeed, -P.pitchLimit, P.pitchLimit);
  }
}

/** Signed shortest angular distance from a to b. */
function shortestTurn(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// ---------------------------------------------------------------------------
//  Session 72: the garden butterfly.
//
//  Apoorva's ask: "the butterfly flies around in the garden, sometimes sits
//  on rose bushes, mostly flutters in the garden."
//
//  The model is the rigged butterfly she added to MeraGHAR.blend (armature
//  `Butterfly`, six skinned meshes). It is exported on its own to
//  `src/assets/butterfly.glb` rather than riding along inside MeraGHAR.glb:
//    - it is ~200 units across in the .blend (imported at FBX scale), and
//      inside the house GLB it would be merged into the collider and nav map;
//    - main.js strips any `Butterfly` node out of the house model before the
//      collider is built (CONFIG.butterfly.stripFromHouse), so a later
//      re-export of MeraGHAR.glb with the butterfly still in it is harmless.
//
//  The wings are flapped procedurally, not with the rig's own actions:
//  `metarig|!` carries its own root motion (it climbs ~200 units), and
//  `metarig|2`/`|3` are single beats at one fixed speed. Rotating the two
//  `upper_arm` bones about the body's long axis gives one control for both a
//  fast flight flap and a slow open/close while perched.
//
//  Behaviour is a small state machine:
//    fly      wander between random points inside CONFIG.butterfly.flyBox,
//             with a fluttery wobble on top of the path
//    approach fly to a point above a rose-bush landing spot, then drop onto it
//    perched  sit, wings slowly opening and closing, then take off again
//             (early, if the visitor walks right up to it)
//    takeoff  lift straight up off the bush, then back to fly
//  Landing spots are found at load by raycasting straight down onto the top
//  of each rose bush, so they sit on the actual foliage, not the bbox.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { findByName } from '../util/util.js';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const DEG = Math.PI / 180;

const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));

export class Butterfly {
  /**
   * @param {object} o
   * @param {THREE.Scene} o.scene
   * @param {THREE.Object3D} o.root   the house model (for the rose bushes)
   * @param {{feet: THREE.Vector3}} [o.walker]
   * @param {object} o.opts           CONFIG.butterfly
   */
  constructor({ scene, root, walker, opts }) {
    this.opts = opts;
    this.walker = walker;
    this.ready = false;
    this.state = 'fly';
    this.t = 0;
    this.stateT = 0;
    this.stateDur = rand(...opts.flyTime);

    this.pos = new THREE.Vector3(...opts.start);
    this.vel = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.bank = 0;
    this.flapPhase = 0;
    this.wing = 0;            // current wing angle, radians, + = up
    this.spot = null;
    this.lastSpot = null;
    this.wobble = 1;          // 1 in flight, 0 when perched

    this.obj = new THREE.Group();
    this.obj.name = 'ButterflyActor';
    this.obj.visible = false;
    scene.add(this.obj);

    this.spots = this._findSpots(root);
    this._pickFlyTarget();

    new GLTFLoader().load(opts.url, (gltf) => this._onLoad(gltf.scene),
      undefined, (err) => console.warn('[butterfly] could not load', opts.url, err));
  }

  _onLoad(model) {
    const o = this.opts;
    // Pivot at the feet: the legs' lowest point is y 0.1, the body sits at
    // z -5 (model units, before scaling) — so a perched butterfly's `pos`
    // is exactly the leaf it is standing on.
    model.scale.setScalar(o.scale);
    model.position.set(0, -o.pivot[1] * o.scale, -o.pivot[2] * o.scale);
    model.traverse((m) => {
      if (!m.isMesh) return;
      m.castShadow = false;
      m.receiveShadow = false;
      m.frustumCulled = false;   // skinned bounds don't follow the bones
    });
    this.obj.add(model);
    this.obj.updateMatrixWorld(true);

    // Each wing root flaps about the body's long axis (model +Z, the way the
    // head points). Work that axis out in each bone's parent space once, at
    // rest, so the per-frame rotation is a single premultiply.
    this.wings = [];
    const bodyAxis = new THREE.Vector3(0, 0, 1);
    for (const [name, sign] of [['upper_arm.L', 1], ['upper_arm.R', -1]]) {
      const bone = findByName(model, name);
      if (!bone) { console.warn(`[butterfly] no bone "${name}"`); continue; }
      const parentQ = new THREE.Quaternion();
      bone.parent.getWorldQuaternion(parentQ);
      const local = bodyAxis.clone().applyQuaternion(parentQ.invert()).normalize();
      this.wings.push({ bone, sign, rest: bone.quaternion.clone(), axis: local });
    }
    this.ready = true;
    this.obj.visible = true;
    this._pose(0);
  }

  // ---- landing spots ------------------------------------------------------
  _findSpots(root) {
    const spots = [];
    const ray = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const box = new THREE.Box3();
    for (const name of this.opts.roseBushes) {
      const bush = findByName(root, name);
      if (!bush) { console.warn(`[butterfly] no rose bush "${name}"`); continue; }
      bush.updateWorldMatrix(true, true);
      box.setFromObject(bush);
      const h = box.max.y - box.min.y;
      let found = 0;
      for (let i = 0; i < 40 && found < this.opts.spotsPerBush; i++) {
        const x = lerp(box.min.x, box.max.x, rand(0.25, 0.75));
        const z = lerp(box.min.z, box.max.z, rand(0.25, 0.75));
        ray.set(_v.set(x, box.max.y + 1, z), down);
        const hit = ray.intersectObject(bush, true)[0];
        if (!hit || hit.point.y < box.min.y + h * 0.7) continue;   // only the top of the bush
        spots.push({ bush: name, p: hit.point.clone() });
        found++;
      }
    }
    if (!spots.length) console.warn('[butterfly] no landing spots found — it will only fly');
    return spots;
  }

  _pickFlyTarget() {
    const b = this.opts.flyBox;
    // Prefer a point a decent distance away, so it roams the whole garden
    // instead of dithering in one spot.
    for (let i = 0; i < 6; i++) {
      this.target.set(rand(...b.x), rand(...b.y), rand(...b.z));
      if (this.target.distanceTo(this.pos) > 3) break;
    }
  }

  _setState(s) {
    this.state = s;
    this.stateT = 0;
    const o = this.opts;
    if (s === 'fly') { this.stateDur = rand(...o.flyTime); this._pickFlyTarget(); }
    if (s === 'perched') this.stateDur = rand(...o.perchTime);
    if (s === 'takeoff') {
      this.target.copy(this.pos).add(_v.set(rand(-0.4, 0.4), o.takeoffLift, rand(-0.4, 0.4)));
    }
    if (s === 'approach') {
      const pool = this.spots.filter((sp) => sp !== this.lastSpot);
      this.spot = pool[Math.floor(Math.random() * pool.length)] ?? this.spots[0];
      this.lastSpot = this.spot;
      this.hoverDone = false;
    }
  }

  // ---- per frame ----------------------------------------------------------
  update(dt) {
    if (!this.ready) return;
    const o = this.opts;
    this.t += dt;
    this.stateT += dt;

    let speed = o.speed, flapHz = o.flapHz, steer = o.steer;

    switch (this.state) {
      case 'fly': {
        if (this.pos.distanceTo(this.target) < 0.6) this._pickFlyTarget();
        if (this.stateT > this.stateDur) {
          if (this.spots.length && Math.random() < o.landChance) this._setState('approach');
          else this._setState('fly');
        }
        break;
      }
      case 'approach': {
        const sp = this.spot.p;
        if (!this.hoverDone) {
          this.target.copy(sp).add(_v.set(0, o.hoverAbove, 0));
          if (this.pos.distanceTo(this.target) < 0.25) this.hoverDone = true;
          if (this.pos.distanceTo(this.target) < 1.5) speed *= 0.6;
        } else {
          // Settle straight down onto the leaf, slowing as it gets close.
          this.target.copy(sp);
          const d = this.pos.distanceTo(sp);
          speed = Math.max(0.12, Math.min(o.speed * 0.4, d * 1.2));
          steer *= 2;
          if (d < 0.03) { this.pos.copy(sp); this.vel.set(0, 0, 0); this._setState('perched'); }
        }
        break;
      }
      case 'perched': {
        const f = this.walker?.feet;
        const tooClose = f && Math.hypot(f.x - this.pos.x, f.z - this.pos.z) < o.spookRadius;
        if (this.stateT > this.stateDur || (tooClose && this.stateT > 0.6)) this._setState('takeoff');
        break;
      }
      case 'takeoff': {
        speed *= 0.8;
        flapHz *= 1.25;
        if (this.pos.distanceTo(this.target) < 0.25 || this.stateT > 2) this._setState('fly');
        break;
      }
    }

    // --- movement
    if (this.state !== 'perched') {
      _v.subVectors(this.target, this.pos);
      const d = _v.length();
      if (d > 1e-4) _v.multiplyScalar(Math.min(speed, d / Math.max(dt, 1e-3)) / d);
      this.vel.x = damp(this.vel.x, _v.x, steer, dt);
      this.vel.y = damp(this.vel.y, _v.y, steer, dt);
      this.vel.z = damp(this.vel.z, _v.z, steer, dt);
      this.pos.addScaledVector(this.vel, dt);
    }

    // Wobble fades out as it comes in to land, back in on takeoff.
    const wantWobble = this.state === 'perched' || (this.state === 'approach' && this.hoverDone) ? 0 : 1;
    this.wobble = damp(this.wobble, wantWobble, 4, dt);

    // --- heading: face where it's going; hold still once perched
    const hv = Math.hypot(this.vel.x, this.vel.z);
    if (this.state !== 'perched' && hv > 0.05) {
      const want = Math.atan2(this.vel.x, this.vel.z);
      let dy = want - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw += dy * (1 - Math.exp(-5 * dt));
      this.bank = damp(this.bank, THREE.MathUtils.clamp(-dy * 0.8, -0.5, 0.5), 5, dt);
    } else {
      this.bank = damp(this.bank, 0, 5, dt);
      // A perched butterfly turns a little now and then.
      if (this.state === 'perched') this.yaw += Math.sin(this.t * 0.4) * 0.15 * dt;
    }
    const climb = this.state === 'perched' ? 0 : Math.atan2(this.vel.y, Math.max(hv, 0.2));
    this.pitch = damp(this.pitch, THREE.MathUtils.clamp(-climb * 0.5, -0.5, 0.5), 5, dt);

    // --- wings
    if (this.state === 'perched') {
      // Mostly held up together, slowly opening to bask, with the odd quick
      // twitch — the way a butterfly sits on a flower.
      const s = 0.5 + 0.5 * Math.sin(this.t * (2 * Math.PI / o.perchWingPeriod));
      const target = lerp(o.wingUp, o.wingBask, s * s);
      this.wing = damp(this.wing, target, 6, dt);
      this.flapPhase = 0;
    } else {
      const landing = this.state === 'approach' && this.hoverDone;
      this.flapPhase += dt * flapHz * (landing ? 0.7 : 1) * 2 * Math.PI;
      // Flap is shaped rather than a pure sine: a quick downstroke and a
      // slightly lazier upstroke, plus the odd glide.
      const glide = Math.max(0, Math.sin(this.t * 0.9 + 1.3)) > 0.93;
      const s = Math.sin(this.flapPhase);
      const shaped = Math.sign(s) * Math.pow(Math.abs(s), 0.7);
      const target = glide ? o.wingGlide : lerp(o.wingDown, o.wingUp, 0.5 + 0.5 * shaped);
      this.wing = glide ? damp(this.wing, target, 8, dt) : target;
    }

    this._pose(dt);
  }

  _pose() {
    const o = this.opts;
    // Flutter: a butterfly's path bobs with every wingbeat and wanders side
    // to side, rather than gliding along a smooth curve.
    const w = this.wobble;
    const bob = Math.sin(this.flapPhase + 0.6) * o.bob * w;
    const sway = (Math.sin(this.t * 2.3) + Math.sin(this.t * 3.7 + 1.1) * 0.6) * o.sway * w;
    const lift = Math.sin(this.t * 1.7 + 0.4) * o.sway * 0.8 * w;
    // Sway is sideways relative to the heading.
    const sx = Math.cos(this.yaw), sz = -Math.sin(this.yaw);
    this.obj.position.set(this.pos.x + sx * sway, this.pos.y + bob + lift, this.pos.z + sz * sway);
    this.obj.rotation.set(this.pitch, this.yaw, this.bank, 'YXZ');

    for (const wg of this.wings ?? []) {
      _q.setFromAxisAngle(_axis.copy(wg.axis), wg.sign * this.wing);
      wg.bone.quaternion.copy(wg.rest).premultiply(_q);
    }
  }
}

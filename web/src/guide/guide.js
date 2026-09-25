// ---------------------------------------------------------------------------
//  Getting around the vertical bits.
//
//  Three flights, clicked one landing at a time, is the least fun part of the
//  house. So:
//
//    * Standing near the foot of the stairs offers the two places worth
//      going — Studio (1st floor) and Work life (2nd floor). Picking one
//      walks the visitor up automatically, along the same route the walkable
//      map would have found, just driven for them and a little quicker, and
//      leaves them on the landing looking at the closed door.
//    * The upstairs doors no longer swing open by themselves. A label sits on
//      the door; clicking the label — or the door itself — opens it, and it
//      stays open.
//    * On the 1st floor landing — but not once you've stepped into the
//      studio itself — an option on the right takes you up to the 2nd.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { CONFIG } from '../config/config.js';
import { glassifyChip, glassifyPanel } from '../glassify/glassify.js';

const G = CONFIG.stairsGuide;
const ROOM_BOUNDS = Object.fromEntries(CONFIG.rooms.map((r) => [r.id, r.bounds]));
const inBounds = (b, p) => !!b &&
  p.x > b.x[0] && p.x < b.x[1] && p.y > b.y[0] && p.y < b.y[1] && p.z > b.z[0] && p.z < b.z[1];
const _v = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _to = new THREE.Vector3();

export class Guide {
  constructor({ scene, camera, walker, nav, doors, ui, onGoTo }) {
    this.camera = camera;
    this.walker = walker;
    this.nav = nav;
    this.doors = doors;
    this.ui = ui;
    this.onGoTo = onGoTo;

    this.travellingTo = null;   // destination def while being carried up
    this.faceRide = false;      // steer the view along the route, whole ride
    this.rideSeq = -1;          // walker.lookSeq when the ride started
    this.faceYaw = null;        // one-shot turn (the stairs, then the door)
    this.facePitch = null;
    this.faceFor = 0;
    this.faceSeq = -1;
    this.activeDoor = null;     // door def whose label is currently showing
    this.chooserOpen = false;
    this.arriveLook = null;     // what the ride should end up looking at
    this.arrivePitch = null;
    this.noFootFace = false;    // just ridden down to the foot: don't spin round to the stairs
    // Session 59: arriving on a landing keeps the "Take me to" stack out of
    // the way while you face the door you came up for. Holds the floorOpts
    // entry it applies to; cleared by turning away from that door, or by
    // stepping into the room (coming back out then shows it straight away).
    this.landingQuiet = null;
    this.lastPlace = null;      // 'landing:<i>' | 'room:<i>' | null, last frame

    this.buildChooser();

    // Same subtle real-glass treatment as the rest of the HUD (see
    // glassify.js) — the chooser is a panel, the door label a chip.
    glassifyPanel(ui.choose);
    glassifyChip(ui.doorTag);

    ui.doorTag.addEventListener('click', () => {
      if (this.activeDoor) this.openDoor(this.activeDoor.name);
    });
  }

  /** The cards for a menu (list of destination keys); rebuilt only on change. */
  buildChooser(keys = G.footMenu) {
    const id = keys.join();
    if (this.menuId === id) return;
    this.menuId = id;
    const list = this.ui.chooseList;
    list.innerHTML = '';
    for (const k of keys) {
      const d = k === G.groundDest.key ? G.groundDest : G.destinations.find((x) => x.key === k);
      if (!d) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dest';
      b.innerHTML = `<b>${d.label}</b><span>${d.sub}</span>`;
      b.addEventListener('click', () => this.travel(d));
      list.appendChild(b);
      // No glassifyChip(b) here: these sit inside #choose, which is itself
      // glass, and an element with backdrop-filter is a backdrop root — the
      // child would have only its parent's box to sample, so the call was
      // inert (verified: cranking a nested chip's displacement from -6 to
      // -260 changed zero pixels). They are dressed as glass in CSS instead.
    }
  }

  // -------------------------------------------------------------------------

  /** Door leaves the pointer can hit right now (closed manual doors only). */
  get targets() {
    const out = [];
    for (const it of this.doors.items) {
      if (it.def.manual && !it.forced && it.leaf) out.push(it.leaf);
    }
    return out;
  }

  /** main.js hands us whatever the pointer hit; we say whether we used it. */
  activate(object) {
    const name = object?.userData?.doorName;
    if (!name) return false;
    return this.openDoor(name);
  }

  openDoor(name) {
    const did = this.doors.open(name);
    if (did) {
      this.activeDoor = null;
      this.ui.doorTag.classList.remove('show');
    }
    return did;
  }

  /**
   * Take the visitor to a destination. The walkable map gives the route —
   * which is what makes the camera follow the actual treads rather than
   * cutting through the stairwell — but the walker RIDES it rather than
   * walking it, because some stair links can be descended and not climbed
   * and a physical walk stalls halfway up.
   */
  travel(dest) {
    const goal = new THREE.Vector3(...dest.point);
    const route = this.nav.findPath(this.walker.feet, goal) ?? [];
    const pts = route.map((p) => p.clone());
    // `snap` destinations stop at the last walkable node instead of having the
    // raw goal appended. A room's `point` is a spot on a floor and is safe to
    // walk onto; a story marker's is a sparkle hovering over a table, and
    // walking to it literally would put the visitor inside the furniture.
    if (!dest.snap && (!pts.length || pts[pts.length - 1].distanceTo(goal) > 0.15)) pts.push(goal);
    // Session 47: decide up front what the ride ends looking at, so the last
    // stretch can turn toward it (update()) instead of arriving facing along
    // the route and then swinging round.
    //   * `face` — an explicit point (the bedroom's desk star, a story marker)
    //   * otherwise the door, but ONLY for a landing stop (stairs chooser),
    //     where you stand in front of it. A room picked off the map is BEHIND
    //     its door by the time you arrive, so facing the door there meant
    //     turning your back on the room — the "sees the desk, then turns
    //     round to the door" bug.
    const doorIt = this.doors.byName.get(dest.door);
    this.arriveLook = dest.face
      ? (dest.face.isVector3 ? dest.face.clone() : new THREE.Vector3(...dest.face))
      : (dest.via !== 'map' && doorIt ? doorIt.centre.clone() : null);
    this.arrivePitch = dest.facePitch ?? 0;
    this.rideSeq = this.walker.lookSeq;
    if (!pts.length) { this.arrive(dest); return; }
    this.walker.ride(pts, dest.speed ?? G.rideSpeed);
    this.travellingTo = dest;
    this.setChooser(false);

    // Whatever the visitor happened to be looking at when they clicked — often
    // a wall, since the chooser doesn't care which way you're facing — the view
    // is now steered along the route for the WHOLE ride (see update()), not
    // just nudged once at the start. Climbing the stairs while facing sideways
    // was the single most disorienting thing in the walkthrough.
    this.faceRide = true;
    this.rideSeq = this.walker.lookSeq;
    this.faceYaw = null;

    this.onGoTo?.(dest);
  }

  /** The visitor took over — clicked somewhere themselves. */
  cancelTravel() {
    if (!this.travellingTo) return;
    const dest = this.travellingTo;
    this.travellingTo = null;
    this.faceRide = false;
    this.faceYaw = null;
    this.walker.stopRide();
    dest.onCancel?.();
  }

  arrive(dest) {
    this.travellingTo = null;
    this.faceRide = false;
    // Square up on whatever travel() decided we end up looking at (see
    // there). A door's pitch is forced level rather than aimed at its centre
    // — from two units away a door centre is well below eye level. If the
    // visitor dragged the view during the ride, leave their view alone.
    const look = this.arriveLook;
    const dragged = this.walker.lookSeq !== this.rideSeq;
    this.arriveLook = null;
    if (look && !dragged) this.faceAt(look, 1.2, this.arrivePitch);
    // Rode down to the foot of the stairs: the chooser shows up again, but
    // don't turn the visitor back round to face the flight they just left.
    this.noFootFace = true;
    dest.onArrive?.();
  }

  // ---- steering the view ---------------------------------------------------

  /**
   * Ease the view to a yaw (and optionally a pitch) over `seconds`.
   *
   * Released the moment the visitor actually drags — but note that is
   * `walker.lookSeq` changing, NOT `walker.userLooking`. userLooking stays
   * true for 1.6s after a drag ends, so gating on it meant that looking
   * around and *then* picking a floor — the completely normal order of
   * events — cancelled the turn before it took a single frame. That is why
   * "the ride keeps your old facing" survived a fix that looked correct.
   */
  faceTo(yaw, pitch, seconds) {
    this.faceYaw = yaw;
    this.facePitch = pitch;
    this.faceFor = seconds;
    this.faceSeq = this.walker.lookSeq;
  }

  /** Same, aimed at a world point. */
  faceAt(point, seconds, pitch = null) {
    _to.copy(point).sub(this.walker.feet);
    const flat = Math.hypot(_to.x, _to.z);
    if (flat < 1e-3) return;
    const p = pitch !== null
      ? pitch
      : Math.atan2(point.y - (this.walker.smoothY + CONFIG.player.eyeHeight), flat);
    this.faceTo(Math.atan2(-_to.x, -_to.z), p, seconds);
  }

  setChooser(on, face = false) {
    if (this.chooserOpen === on) return;
    this.chooserOpen = on;
    this.ui.choose.classList.toggle('show', on);
    // The walking hint lives in the same corner.
    if (on) {
      this.ui.hint.classList.remove('show');
      // Walking up to the stairs turns you to face them. This is the other
      // half of the fix: rather than only correcting the view once a floor is
      // picked, the flight is already square in front of you by the time the
      // chooser appears — so "take me up" continues the view you already have
      // instead of snapping to a new one. A drag cancels it like anything else.
      // Session 53: and not while a click-walk is only passing the stairs
      // on its way somewhere else (kitchen -> garden runs right past them).
      const w = this.walker;
      const g = w.goal;
      const passing = !!g && (w.target || w.path.length) &&
        !(g.x > G.foot.x[0] && g.x < G.foot.x[1] && g.z > G.foot.z[0] && g.z < G.foot.z[1]);
      const f = face && !this.noFootFace && !passing && G.footFace;
      if (f) this.faceTo(f.yaw, f.pitch ?? 0, f.seconds ?? 1.1);
    }
  }

  // -------------------------------------------------------------------------

  update(dt) {
    const w = this.walker;

    // Seated at the desk: the whole thing gets out of the way.
    if (w.seated) {
      this.setChooser(false);
      this.ui.doorTag.classList.remove('show');
      this.activeDoor = null;
      return;
    }

    // ---- being carried up ------------------------------------------------
    if (this.travellingTo && !w.riding) this.arrive(this.travellingTo);

    // Keep the view pointed the way we are actually going, for the whole
    // climb: up the first flight, round the half-landing, on up the second.
    // The aim point sits a few units ahead along the route rather than on the
    // next node, or the yaw would twitch once per stair tread. The instant the
    // visitor drags for themselves, we let go and never take it back.
    if (this.travellingTo && w.riding && this.faceRide) {
      if (w.lookSeq !== this.rideSeq) {
        this.faceRide = false;
      } else {
        // Last few units: look at where we're going to end up looking, not
        // along the route — no swing round the landing before the door.
        const final = this.arriveLook &&
          w.rideRemaining() < (G.arriveFaceDist ?? 5) ? this.arriveLook : null;
        const aim = final ?? w.rideAim(G.rideLookAhead ?? 3.2);
        if (aim) {
          _to.copy(aim).sub(w.feet);
          _to.y = 0;
          // Ignore an aim point we are practically standing on — in the last
          // half-metre of the route its direction flips about wildly.
          if (_to.lengthSq() > (final ? 1e-3 : 0.36)) {
            const want = Math.atan2(-_to.x, -_to.z);
            let d = want - w.yaw;
            while (d > Math.PI) d -= Math.PI * 2;
            while (d < -Math.PI) d += Math.PI * 2;
            w.yaw += d * Math.min(1, dt * (G.rideTurn ?? 6));
          }
        }
        // …and level the view off, so a visitor who was studying the ceiling
        // isn't carried up the stairs still studying the ceiling.
        const p = G.ridePitch ?? 0;
        w.pitch += (p - w.pitch) * Math.min(1, dt * (G.ridePitchEase ?? 2.2));
      }
    }

    if (this.faceYaw !== null && this.faceFor > 0) {
      if (w.lookSeq !== this.faceSeq) { this.faceYaw = null; }
      else {
        this.faceFor -= dt;
        let d = this.faceYaw - w.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        w.yaw += d * Math.min(1, dt * 5);
        let dp = 0;
        if (this.facePitch !== null) {
          dp = this.facePitch - w.pitch;
          w.pitch += dp * Math.min(1, dt * 4.5);
        }
        if (this.faceFor <= 0 || (Math.abs(d) < 0.01 && Math.abs(dp) < 0.01)) this.faceYaw = null;
      }
    }

    // ---- the chooser at the foot of the stairs ---------------------------
    const f = w.feet;
    const atFoot =
      f.x > G.foot.x[0] && f.x < G.foot.x[1] &&
      f.y > G.foot.y[0] && f.y < G.foot.y[1] &&
      f.z > G.foot.z[0] && f.z < G.foot.z[1];
    // One panel, one place, on every floor; only the cards differ.
    const menu = G.floorOpts.find((m) => f.y > m.level[0] && f.y < m.level[1]);
    const onLanding = !!menu && !inBounds(ROOM_BOUNDS[menu.except], f);
    if (!atFoot) this.noFootFace = false;
    const quiet = this.updateLandingQuiet(menu, onLanding);
    const keys = atFoot ? G.footMenu : (onLanding && !quiet) ? menu.buttons.map((b) => b.to) : null;
    if (keys) this.buildChooser(keys);
    this.setChooser(!!keys && !this.travellingTo, atFoot);

    // ---- the label on a closed manual door -------------------------------
    this.updateDoorTag();
  }

  /**
   * Session 59 — "on entry keep it clean." Reaching a landing from the
   * stairs (the chooser ride, or walking up yourself) you are there to go
   * through its door, so the stack stays hidden while you face it. It
   * shows once you turn away (looking back down, or up to the next flight)
   * and — never having been quiet — when you walk back out of the room.
   * Returns true while the stack should stay hidden.
   */
  updateLandingQuiet(menu, onLanding) {
    const i = menu ? G.floorOpts.indexOf(menu) : -1;
    const place = !menu ? null : onLanding ? `landing:${i}` : `room:${i}`;
    const prev = this.lastPlace;
    this.lastPlace = place;
    if (!onLanding) {
      // Inside the room, or off this floor: nothing to hide, and the next
      // time a landing is reached it's decided afresh below.
      if (place !== prev) this.landingQuiet = null;
      return false;
    }
    // Just stepped onto this landing. From its own room → show (you're
    // coming out). From anywhere else (the stairs) → quiet.
    if (place !== prev) this.landingQuiet = prev === `room:${i}` ? null : menu;
    if (this.landingQuiet !== menu) return false;
    // Still riding up, or still turning to the door on arrival: stay quiet.
    if (this.travellingTo || this.faceYaw !== null) return true;
    const w = this.walker;
    // Still walking (up the last treads, across the landing): you face
    // wherever you're going, which says nothing about wanting the menu.
    if (w.riding || w.target || w.path?.length || w.keys?.size) return true;
    const door = this.doors.byName.get(menu.door);
    if (!door) { this.landingQuiet = null; return false; }
    _to.copy(door.centre).sub(w.feet);
    let d = Math.atan2(-_to.x, -_to.z) - w.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    // Turned well away from the door (~70°+): show it, and keep showing it.
    if (Math.abs(d) > (G.landingQuietTurn ?? 1.2)) { this.landingQuiet = null; return false; }
    return true;
  }

  updateDoorTag() {
    const cam = this.camera;
    let best = null, bestD = Infinity;

    for (const it of this.doors.items) {
      const def = it.def;
      if (!def.manual || it.forced || !def.near) continue;
      const f = this.walker.feet;
      if (!(f.x > def.near.x[0] && f.x < def.near.x[1] &&
            f.y > def.near.y[0] && f.y < def.near.y[1] &&
            f.z > def.near.z[0] && f.z < def.near.z[1])) continue;
      const d = it.centre.distanceTo(cam.position);
      if (d < bestD) { bestD = d; best = it; }
    }

    const tag = this.ui.doorTag;
    if (!best || bestD > G.labelRange) {
      this.activeDoor = null;
      tag.classList.remove('show');
      return;
    }

    // Only when the door is actually in front of you — turn your back on it
    // and the label goes away rather than clinging to the edge of the screen.
    cam.getWorldDirection(_fwd);
    _to.copy(best.tagAnchor).sub(cam.position);
    if (_to.dot(_fwd) <= 0) {
      this.activeDoor = null;
      tag.classList.remove('show');
      return;
    }

    // Project the anchor, then pin it just inside the frame. Standing right
    // under a tall door, the anchor can still fall off the bottom; pinning it
    // keeps the label reachable instead of making you back away to find it.
    _v.copy(best.tagAnchor).project(cam);
    const EDGE = 0.86;
    const x = Math.max(-EDGE, Math.min(EDGE, _v.x));
    const y = Math.max(-EDGE, Math.min(EDGE, _v.y));

    this.activeDoor = best.def;
    tag.textContent = best.def.label ?? 'Open the door';
    tag.style.left = `${(x * 0.5 + 0.5) * innerWidth}px`;
    tag.style.top = `${(-y * 0.5 + 0.5) * innerHeight}px`;
    tag.classList.add('show');
  }
}

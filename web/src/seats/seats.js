// ---------------------------------------------------------------------------
//  Seats — furniture you fall into by walking up to it.
//
//  The bedroom desk (desk.js) proved the feeling Apoorva wants: the moment the
//  view drops into the chair, the room stops being a model you are flying
//  through and becomes somewhere you are. This module gives the rest of the
//  house the same thing, minus the click:
//
//    * walk near the sofa            -> you sit down on it, facing the TV
//    * walk into the garden corner   -> you settle into the hanging chair,
//                                       and it swings
//    * walk up to the studio chair   -> you sit, and it rocks
//    * walk up to the bed            -> you lie down, looking up at the stars
//
//  No star, no prompt, no click: proximity IS the interaction. Everything is
//  configured in CONFIG.seats — each entry is a `near` box (walk into it and
//  it happens), the seated eye position, and where it faces.
//
//  Two rules keep this from turning into flypaper:
//
//    1. A seat you just got up from is DISARMED until you have walked back out
//       of its box. Otherwise standing up would drop you straight back in,
//       because your feet never left the sofa.
//    2. Nothing auto-seats you while you are already seated, being carried up
//       the stairs, or busy at the desk.
//
//  Getting up: the Stand up button, Esc, or simply clicking somewhere to walk
//  (main.js routes all three here).
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { CONFIG } from '../config/config.js';
import { playSfx } from '../sfx/sfx.js';
import { findByName } from '../util/util.js';

const SEATS = CONFIG.seats ?? [];

/** Which CONFIG.rooms box a point is in (first match), or null. */
function roomAt(x, y, z) {
  for (const r of CONFIG.rooms ?? []) {
    const b = r.bounds;
    if (x > b.x[0] && x < b.x[1] && y > b.y[0] && y < b.y[1] && z > b.z[0] && z < b.z[1]) return r.id;
  }
  return null;
}

function inBox(p, b) {
  return !!b &&
    p.x > b.x[0] && p.x < b.x[1] &&
    p.y > b.y[0] && p.y < b.y[1] &&
    p.z > b.z[0] && p.z < b.z[1];
}

export class Seats {
  /**
   * @param {object}   o
   * @param {THREE.Camera} o.camera
   * @param {Walker}   o.walker
   * @param {Function} o.isBusy   — true while something else owns the view
   *                                (the desk walking you to its chair, say)
   * @param {Function} o.onState  — (def|null, previousDef) whenever this changes
   */
  constructor({ camera, walker, isBusy = () => false, onState = null }) {
    this.camera = camera;
    this.walker = walker;
    this.isBusy = isBusy;
    this.onState = onState;

    this.active = null;     // the seat def we are currently in
    this.t = 0;             // seconds in the seat, drives the swing/rock
    this.disarmed = new Set();   // ids that need you to walk away first
    this.meshes = [];            // Session 48: { def, room, objects[] } — clickable furniture
  }

  /**
   * Session 48: every seat can also be CLICKED, not just walked into. The
   * furniture meshes named in each def's `meshes` (config.js) get tagged
   * with `userData.seatId`; main.js's pickInteractive() tests them and
   * useInteractive() routes the hit to request().
   */
  bindMeshes(root) {
    for (const def of SEATS) {
      const objects = [];
      for (const name of def.meshes ?? []) {
        const o = findByName(root, name);
        if (!o) { console.warn(`[seats] "${def.id}": no mesh named "${name}"`); continue; }
        o.traverse((m) => { if (m.isMesh) m.userData.seatId = def.id; });
        objects.push(o);
      }
      if (objects.length) this.meshes.push({ def, room: roomAt(...def.eye), objects });
    }
  }

  /** Clickable seats right now: the ones in the room you're standing in
   *  (the pointer ray isn't occlusion-tested, so this keeps you from
   *  clicking the bed through the bedroom floor), minus the one you're in. */
  get targets() {
    if (this.active) return [];
    const f = this.walker.feet;
    const here = roomAt(f.x, f.y, f.z);
    const out = [];
    for (const s of this.meshes) if (s.room === here) out.push(...s.objects);
    return out;
  }

  /**
   * A seat was clicked. Right there already: sit. Otherwise walk to its
   * `approach` spot (always inside its `near` box), and the ordinary
   * walk-into-it rule in update() sits you down when you arrive. Re-arms
   * the seat first, so a seat you just got up from answers a click at once.
   */
  request(id, goTo) {
    const def = SEATS.find((s) => s.id === id);
    if (!def) return false;
    if (this.active?.id === id) return true;
    this.disarmed.delete(id);
    if (inBox(this.walker.feet, def.near) && !this.walker.seated) { this.sitOn(def); return true; }
    if (!def.approach) return false;
    goTo?.(new THREE.Vector3(...def.approach));
    return true;
  }

  get seated() { return this.active !== null; }

  sitOn(def) {
    this.active = def;
    this.t = 0;
    this.disarmed.add(def.id);
    playSfx(def.sfx);
    this.walker.sit({
      eye: def.eye,
      yaw: def.yaw,
      pitch: def.pitch ?? 0,
      speed: def.sitSpeed ?? 1.4,
    });
    this.onState?.(def, null);
  }

  /** Get up. Returns false if we weren't sitting on anything of ours. */
  standUp() {
    if (!this.active) return false;
    const def = this.active;
    this.active = null;
    this.t = 0;
    this.walker.stand();
    // Session 48: a seat can name where you end up standing (`standAt`)
    // instead of wherever your feet were left. The sofa uses it — its
    // approach spot is the strip right in front of the TV, and getting up
    // there (Esc out of the TV star) put your face in the screen.
    if (def.standAt) {
      const w = this.walker;
      w.stop?.();
      w.feet.set(...def.standAt);
      const g = w.groundAt?.(w.feet, def.standAt[1] + 0.6);
      if (g != null) w.feet.y = g;
      w.smoothY = w.feet.y;
      if (def.standYaw != null) w.yaw = def.standYaw;
      w.pitch = 0;
    }
    this.onState?.(null, def);
    return true;
  }

  // -------------------------------------------------------------------------

  update(dt) {
    const w = this.walker;
    const f = w.feet;

    // A seat re-arms the moment you are properly clear of it.
    if (this.disarmed.size) {
      for (const id of [...this.disarmed]) {
        if (this.active?.id === id) continue;
        const def = SEATS.find((s) => s.id === id);
        if (!def || !inBox(f, def.near)) this.disarmed.delete(id);
      }
    }

    if (this.active) {
      // Somebody else took the view off us (the desk, or a map ride).
      if (!w.seated) {
        const def = this.active;
        this.active = null;
        this.onState?.(null, def);
        return;
      }
      this.t += dt;
      this.applyMotion(this.active);
      return;
    }

    if (w.seated || w.riding || this.isBusy()) return;

    for (const def of SEATS) {
      if (this.disarmed.has(def.id) || !inBox(f, def.near)) continue;
      // Session 53: a click-walk only passing through this seat's box (its
      // goal is somewhere else) doesn't get grabbed and sat down.
      if (w.goal && (w.target || w.path.length) && !inBox(w.goal, def.near)) continue;
      // Session 23: being walked to a star elsewhere — don't grab the
      // visitor on the way past (the rocking chair sits right on the route
      // to the studio's camera table).
      if (this.isBusy(def)) continue;
      this.sitOn(def);
      return;
    }
  }

  /**
   * The swing on the garden chair and the rock on the studio one.
   *
   * The walker rewrites camera.position/rotation from scratch every frame
   * (see updateSeated), so this can simply add its offset on top afterwards —
   * main.js calls us straight after walker.update for exactly that reason.
   */
  applyMotion(def) {
    const m = def.motion;
    if (!m) return;
    const cam = this.camera;
    // Don't start swinging until you have actually landed in the seat.
    const ease = Math.min(1, this.walker.seatT);
    if (ease <= 0) return;

    const speed = m.speed ?? 1.1;
    const s = Math.sin(this.t * speed);
    const fwdX = -Math.sin(def.yaw);
    const fwdZ = -Math.cos(def.yaw);

    // A pendulum swings forward and back, rises slightly at both ends of the
    // arc (hence the doubled frequency on y), and tips you with it.
    cam.position.x += fwdX * (m.amount ?? 0.25) * ease * s;
    cam.position.z += fwdZ * (m.amount ?? 0.25) * ease * s;
    cam.position.y += (m.rise ?? 0.05) * ease * (1 - Math.cos(this.t * speed * 2)) * 0.5;
    cam.rotation.x += (m.tilt ?? 0.02) * ease * s;
    if (m.roll) cam.rotation.z += m.roll * ease * s;
  }
}

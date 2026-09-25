// ---------------------------------------------------------------------------
//  The kitchen oven — "freshly baked".
//
//  A double oven under the hob on the kitchen's west wall. In Blender the two
//  door fronts were split off the merged `Kitchen` mesh (the same face-split
//  recipe as the moka pot lid) and given a body, a dark cavity, a rack and a
//  warm lamp each. What's inside, straight out of MeraGHAR.glb:
//
//    Oven Door L / R   the door leaves, origin on the BOTTOM hinge
//    Oven Cavity L / R the dark interior + rack + lamp (static)
//    Cupcake Tray      in the left oven, carrying Cupcake 1..4
//    Cookie Tray       in the right oven, carrying Cookie 1..6
//    Oven Steam L1..3, R1..3   little puffs that rise off the trays
//
//  One glTF clip, `OvenOpen` (~3 s): both doors drop open, the trays slide
//  out onto the open doors, the steam puffs rise and fade. There is no
//  separate "close" clip in the model (only `OvenOpen` ships), so closing is
//  the same clip run backwards on the same AnimationMixer — a standard
//  three.js trick and the reason `toggle()` never calls `.reset()` when it
//  reverses: reset() would snap `time` back to 0 and undo the direction.
//
//  It is fired by the `dessert` story star the FIRST time (story.onReveal in
//  main.js): the doors open on their own while the popup says its lines, and
//  the view leans down in front of the oven the same way the coffee table
//  borrows `Walker.sit`. Session 30: after that, the oven is a normal click
//  target (`targets`, wired into main.js's pickInteractive/useInteractive the
//  same way doors and the guide's own targets are) — clicking it toggles the
//  doors shut or open again, no lean, no popup, just the doors.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { CONFIG } from '../config/config.js';
import { playSfx } from '../sfx/sfx.js';
import { findByName } from '../util/util.js';

const C = CONFIG.oven ?? {};

export class Oven {
  /**
   * @param {object} o
   * @param {THREE.Object3D} o.root                 the loaded gltf scene
   * @param {THREE.AnimationClip[]} o.animations    gltf.animations
   * @param {Walker} o.walker
   */
  constructor({ root, animations, walker }) {
    this.walker = walker;
    this.onLean = null;        // (leaning:boolean) => void, set by main.js
    this.opened = false;       // has the star opened it at least once?
    this.doorsOpen = false;    // current toggle state, once opened
    this._leaning = false;

    // The click target for toggling, once the star has opened the oven the
    // first time — see main.js's pickInteractive/useInteractive.
    this.doors = [];
    for (const name of C.doorNames ?? ['Oven Door L', 'Oven Door R']) {
      const o = findByName(root, name);
      if (o) { o.userData.ovenTarget = true; this.doors.push(o); }
      else console.warn(`[oven] no object named "${name}" — the click-to-toggle target is missing it`);
    }

    // The trays and what is on them: once they are out, poke them for a
    // little "nom nom" (see nibble()).
    this.treats = [];
    for (const name of C.treatNames ?? ['Cupcake Tray', 'Cookie Tray']) {
      const o = findByName(root, name);
      if (o) { o.traverse((m) => { m.userData.ovenTreat = true; }); this.treats.push(o); }
      else console.warn(`[oven] no object named "${name}" — it can't be nibbled`);
    }
    this.onSay = null;         // (text) => void, set by main.js
    this._bites = 0;

    this.mixer = new THREE.AnimationMixer(root);
    let clip = (animations ?? []).find((c) => c.name === (C.clip ?? 'OvenOpen'));
    if (!clip) {
      console.warn('[oven] clip "OvenOpen" missing from the model — re-export MeraGHAR.glb');
      this.action = null;
    } else {
      // The clip was baked at its place on the Blender timeline: every key
      // sits between ~16.7 s and ~19.7 s, so from t=0 nothing moved for 17
      // seconds (the "doesn't open the first time" bug — and closing had to
      // scrub all the way back through the dead time). Shift it to start at 0.
      const t0 = Math.min(...clip.tracks.map((t) => t.times[0]));
      // Clone the tracks first: several of them share ONE `times` array
      // (same glTF accessor), so shifting in place moved it once per track
      // and threw the keys negative — the trays and steam vanished.
      if (t0 > 0.001) {
        const tracks = clip.tracks.map((t) => { const c = t.clone(); c.shift(-t0); return c; });
        clip = new THREE.AnimationClip(clip.name, -1, tracks);
      }
      this.action = this.mixer.clipAction(clip);
      this.action.setLoop(THREE.LoopOnce, 1);
      this.action.clampWhenFinished = true;
    }
  }

  /** Click targets: the doors always, the treats only while the doors are open. */
  get targets() { return this.doorsOpen ? [...this.doors, ...this.treats] : this.doors; }

  /** Touch a cupcake or cookie: "nom, nom" twice, then "so yumm", and round again. */
  nibble() {
    if (!this.opened || !this.doorsOpen) return false;
    this._bites = (this._bites + 1) % 3;
    const S = C.nibble ?? {};
    this.onSay?.(this._bites === 0 ? (S.third ?? 'This is so yumm!') : (S.first ?? 'Nom, nom.'));
    return true;
  }

  /** Doors open, trays out, steam — the star's own first-touch moment.
   *  Safe to call more than once; only the first call does anything. */
  play() {
    if (this.opened) return false;
    this.opened = true;
    this.doorsOpen = true;
    if (this.action) { this.action.timeScale = 1; this.action.reset(); this.action.play(); }
    playSfx(C.sfx ?? 'oven');
    if (C.lean) this.leanIn();
    return true;
  }

  /**
   * Click the oven once it has been found: shut the doors, or open them
   * again — the ordinary interaction, no lean, no popup. Does nothing until
   * the star has played it once (`opened`), same convention as `coffee.arm()`
   * gating the coffee table until its own star is found.
   */
  toggle() {
    if (!this.opened || !this.action) return false;
    this.action.timeScale = this.doorsOpen ? -1 : 1;
    this.action.paused = false;
    this.action.play();
    this.doorsOpen = !this.doorsOpen;
    playSfx(C.sfx ?? 'oven');
    return true;
  }

  get leaning() { return this._leaning && this.walker?.seated; }

  /** Crouch in front of the oven (the same `Walker.sit` the chairs use). */
  leanIn() {
    const L = C.lean;
    if (!L || !this.walker || this._leaning) return false;
    this._leaning = true;
    this.walker.sit({ eye: L.eye, yaw: L.yaw, pitch: L.pitch ?? -0.4, speed: L.speed ?? 1.4 });
    this.onLean?.(true);
    return true;
  }

  /** Back on your feet. Returns false if we weren't leaning. */
  standUp() {
    if (!this._leaning) return false;
    this._leaning = false;
    this.walker.stand();
    this.onLean?.(false);
    return true;
  }

  update(dt) {
    if (this.opened) this.mixer.update(dt);
  }
}

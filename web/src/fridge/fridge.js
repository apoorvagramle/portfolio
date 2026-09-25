// The fridge — the tall unit at the east end of the kitchen (glTF node
// `Fridge`, one whole unsplit mesh).
//
// The `fridge` story line says "Nope. You can't open that." and, the moment
// it appears, the whole unit now physically tips over: a nervous wobble, a
// slow creeping lean, gravity taking over, and a slam against the east wall
// with two small rebounds before it comes to rest leaning there. Session 78:
// once the visitor walks away it eases back upright (see update()), so the
// kitchen is back to normal.
// The crash is `sfx.fridgeTumble` (~3.6 s, its first impact lands at 1.40 s —
// the timeline below is keyed to that).
//
// How it moves: the mesh is re-parented under a pivot group placed on its
// bottom-east edge (`attach` keeps its world transform), and the pivot's
// rotation.z is driven. Rotating about -z tips the top toward +x (east).
// East was chosen because forward (-z) lands on the visitor's standing spot
// and west (-x) hits the kitchen counters.
//
// Caveat: the walk collider is baked once at load, so the fridge's old
// footprint stays solid — you can't walk into where it stood.
import * as THREE from 'three';
import { CONFIG } from '../config/config.js';
import { playSfx } from '../sfx/sfx.js';
import { findByName } from '../util/util.js';

const C = CONFIG.fridge ?? {};

export class Fridge {
  /** @param {{ root: THREE.Object3D }} o the loaded gltf scene */
  constructor({ root }) {
    this.mesh = findByName(root, C.mesh ?? 'Fridge');
    this.t = 0;
    this.active = false;
    this.done = false;
    this.pivot = null;
    if (!this.mesh) { console.warn('[fridge] no object named "Fridge" — nothing to tumble'); return; }
    this.mesh.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(this.mesh);
    this.hinge = new THREE.Vector3(box.max.x, box.min.y, (box.min.z + box.max.z) / 2);
    this.phiStop = C.maxAngle ?? 0.76; // ~43.6°: the top corner meets the east wall
    // Session 78: it doesn't stay down for good any more. Once the visitor
    // has walked `resetDist` away from it (horizontally, or changed floor),
    // it eases back upright.
    this.centre = new THREE.Vector3(); box.getCenter(this.centre);
    this.resetDist = C.resetDist ?? 7.5;
    this.resetSec = C.resetSec ?? 0.9;
    this.righting = false; this.rt = 0;
  }

  /** Topple. */
  tumble() {
    if (!this.mesh || this.active || this.done || this.righting) return false;
    if (!this.pivot) {
      const parent = this.mesh.parent;
      this.pivot = new THREE.Group();
      this.pivot.name = 'FridgePivot';
      parent.add(this.pivot);
      parent.updateWorldMatrix(true, false);
      this.pivot.position.copy(parent.worldToLocal(this.hinge.clone()));
      this.pivot.updateMatrixWorld(true);
      this.pivot.attach(this.mesh);
    }
    this.t = 0;
    this.active = true;
    playSfx(C.sfx ?? 'fridgeTumble');
    return true;
  }

  /** Tip angle (radians, 0 = upright) at time t. */
  angle(t) {
    const stop = this.phiStop;
    if (t < 0.6) {
      return 0.02 * Math.sin(2 * Math.PI * t / 0.4) * (1 - t / 0.6) + 0.05 * (t / 0.6) ** 2;
    }
    if (t < 1.4) {
      const phi0 = 0.05, v0 = 0.167, s = t - 0.6;
      const a = 2 * (stop - phi0 - v0 * 0.8) / 0.64;
      return phi0 + v0 * s + 0.5 * a * s * s;
    }
    if (t < 1.68) return stop - 0.10 * Math.sin(Math.PI * (t - 1.4) / 0.28);
    if (t < 1.84) return stop - 0.03 * Math.sin(Math.PI * (t - 1.68) / 0.16);
    return stop;
  }

  /** @param {THREE.Vector3} [visitor] the visitor's feet, for the reset */
  update(dt, visitor) {
    if (this.active) {
      this.t += dt;
      this.pivot.rotation.z = -this.angle(this.t);
      if (this.t >= 1.84) { this.active = false; this.done = true; }
      return;
    }
    if (this.done && visitor) {
      const far = Math.hypot(visitor.x - this.centre.x, visitor.z - this.centre.z) > this.resetDist
        || Math.abs(visitor.y - (this.hinge.y)) > 4;
      if (far) { this.done = false; this.righting = true; this.rt = 0; }
    }
    if (this.righting) {
      this.rt = Math.min(1, this.rt + dt / this.resetSec);
      const e = this.rt * this.rt * (3 - 2 * this.rt);
      this.pivot.rotation.z = -this.phiStop * (1 - e);
      if (this.rt >= 1) { this.righting = false; this.pivot.rotation.z = 0; }
    }
  }
}

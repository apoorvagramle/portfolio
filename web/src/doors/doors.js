// Doors. Each leaf is re-parented onto a pivot placed on its hinge edge, so
// rotating the pivot swings the door properly instead of spinning it around
// its own centre.
//
// Two kinds:
//   * automatic — swings open when the visitor walks into its `trigger` box
//     and closes again behind them. (Session 47: nothing uses this any more —
//     every door is manual now; the code path stays for any future def.)
//   * manual (`manual: true`) — ignores proximity entirely. A label appears
//     on it when you are near, you click it open, and it stays open. The two
//     upstairs doors work this way, so arriving at a landing is a moment
//     rather than something that just happens to you.
import * as THREE from 'three';
import { CONFIG } from '../config/config.js';
import { findByName } from '../util/util.js';
import { playSfx } from '../sfx/sfx.js';

export class Doors {
  /** @param {Function} [onOpen] called with the door def the first time a
   *  manual door is opened — the hook the discovery tracker hangs off. */
  constructor(scene, root, onOpen) {
    this.onOpen = onOpen;
    this.items = [];
    this.holdClosed = false;   // Session 26: set by the porch intro
    this.byName = new Map();
    const box = new THREE.Box3();

    for (const def of CONFIG.doors) {
      const leaf = findByName(root, def.name);
      if (!leaf) { console.warn(`[doors] no mesh named "${def.name}"`); continue; }

      box.setFromObject(leaf);
      const hingeX = def.hingeAxis === 'z'
        ? (def.hingeAt === 'min' ? box.min.x : box.max.x)
        : (box.min.x + box.max.x) / 2;
      const hingeZ = def.hingeAxis === 'x'
        ? (def.hingeAt === 'min' ? box.min.z : box.max.z)
        : (box.min.z + box.max.z) / 2;

      const pivot = new THREE.Object3D();
      pivot.name = `${def.name}__pivot`;
      pivot.position.set(hingeX, 0, hingeZ);
      scene.add(pivot);

      // `widen` (config.js) closes a small leaf/frame mismatch — some doors
      // (the front door, at least) sit a hair short of their wall opening on
      // the free edge, which reads as a sliver of the frame/outside showing
      // through it, worst when backlit. `stretch` sits at the hinge itself
      // (pivot's own origin, un-rotated at this point), so scaling it along
      // the door's width axis grows the leaf only on the free edge — the
      // hinge edge, at stretch's origin, doesn't move.
      let leafParent = pivot;
      let stretch = null;
      if (def.widen) {
        stretch = new THREE.Object3D();
        stretch.name = `${def.name}__stretch`;
        pivot.add(stretch);
        leafParent = stretch;
      }
      leafParent.attach(leaf);   // attach() keeps the leaf exactly where it is
      // Scale AFTER attaching: attach() sets leaf's local transform to match
      // its current world position under stretch's (still-identity) scale —
      // setting the scale first would have attach() cancel it right back out.
      if (stretch) stretch.scale[def.hingeAxis === 'x' ? 'z' : 'x'] = def.widen;

      // Anything stuck onto the leaf in Blender as its own object (the
      // caution sign + tape on the studio door) rides along with it, so it
      // swings open with the door instead of hanging in the empty doorway.
      for (const extra of def.attach ?? []) {
        const m = findByName(root, extra);
        if (m) pivot.attach(m);
        else console.warn(`[doors] "${def.name}": no mesh named "${extra}" to attach`);
      }

      const centre = box.getCenter(new THREE.Vector3());
      // Where a screen label should sit. Not the middle of the leaf: standing
      // a couple of units away, the middle of a 5-unit door is well below the
      // bottom of the frame. Three quarters of the way up puts it just under
      // eye level, where you are already looking.
      const tagAnchor = new THREE.Vector3(
        centre.x,
        box.min.y + (box.max.y - box.min.y) * (def.labelHeight ?? 0.74),
        centre.z
      );

      const item = { def, pivot, leaf, angle: 0, open: false, forced: false, centre, tagAnchor };
      leaf.userData.doorName = def.name;
      this.items.push(item);
      this.byName.set(def.name, item);
      this.byName.set(leaf.name, item);
    }
  }

  /** Open a manual door and leave it open. Returns true if it did anything. */
  open(name) {
    const it = this.byName.get(name);
    if (!it || !it.def.manual || it.forced) return false;
    // Session 47: leaves sharing a `group` (the two garden-gate leaves) open
    // together — a click on either one is a click on the gate.
    const leaves = it.def.group
      ? this.items.filter((o) => o.def.group === it.def.group)
      : [it];
    for (const o of leaves) o.forced = true;
    this.onOpen?.(it.def);
    return true;
  }

  isOpen(name) {
    const it = this.byName.get(name);
    return !!it && it.forced;
  }

  update(feet, dt) {
    let changed = false;
    for (const it of this.items) {
      const wasOpen = it.open;
      if (it.def.manual) {
        // Session 57: `closeInside` — a box on the far side of the door.
        // Stepping INTO it (from outside it) while the door is open swings
        // the door shut behind you: the front door closes once you're in.
        // Only on that outside -> inside step, so opening it again from
        // inside (to go back out) doesn't slam it in your face.
        const ci = it.def.closeInside;
        if (ci) {
          const inside =
            feet.x > ci.x[0] && feet.x < ci.x[1] &&
            feet.y > ci.y[0] && feet.y < ci.y[1] &&
            feet.z > ci.z[0] && feet.z < ci.z[1];
          if (inside && it.wasInside === false && it.forced) it.forced = false;
          it.wasInside = inside;
        }
        it.open = it.forced;
      } else {
        const t = it.def.trigger;
        it.open =
          feet.x > t.x[0] && feet.x < t.x[1] &&
          feet.y > t.y[0] && feet.y < t.y[1] &&
          feet.z > t.z[0] && feet.z < t.z[1];
      }
      // Session 26: while the porch intro is up the automatic (front) doors
      // stay shut, whatever the trigger box says; main.js lifts it on the choice.
      if (this.holdClosed && !it.def.manual) it.open = false;
      // The swing sound, once per open — a door def can name its own clip
      // (the front door's doorbell) and otherwise gets the generic creak.
      if (it.open && !wasOpen) playSfx(it.def.sfx ?? 'doorOpen');
      const want = it.open ? it.def.openAngle : 0;
      const next = it.angle + (want - it.angle) * Math.min(1, dt * CONFIG.doorSpeed);
      if (Math.abs(next - it.angle) > 1e-4) {
        it.angle = next;
        it.pivot.rotation.y = next;
        changed = true;
      }
    }
    return changed;   // used to refresh the static shadow map
  }
}

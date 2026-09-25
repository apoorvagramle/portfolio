// item-labels.js — little name tags over things in the house on hover.
//
// First use: the studio table under the `social` ("editing") star — hover
// the iPad, the tripod or the camera while you're standing near the table
// and a glass chip names it ("iPad", "Tripod", "Insta360 GO 3S"). Only
// while you're near: from across the room the table is just a table.
//
// Session 30: the music-wall group (the stool) also carries a short
// `description` per item, and opts into `allowSeated: true` — every other
// group stays hidden while the visitor is seated (that hasn't changed; see
// `hover()`'s `seated` argument), but the whole point of the stool is
// looking at the wall while sitting on it, so this one group keeps working
// then. A tag with a description renders two lines instead of the plain
// pill; see index.html's `#itemTag`/`.tagTitle`/`.tagDesc`.
//
// Everything lives in CONFIG.itemLabels: which spot you must be near, how
// near, and the Blender object names → the words to show. Adding another
// labelled thing is a config line, not code.
import * as THREE from 'three';
import { CONFIG } from '../config/config.js';
import { findByName } from '../util/util.js';

const _box = new THREE.Box3();
const _v = new THREE.Vector3();
const _up = new THREE.Vector3();

export class ItemLabels {
  /**
   * @param {Object} o
   * @param {THREE.Object3D} o.root      the loaded house
   * @param {THREE.Camera}   o.camera
   * @param {Object}         o.walker    for .feet
   * @param {THREE.Mesh}     o.collider  the merged collision mesh — used so a
   *                                     tag never shows through a wall
   */
  constructor({ root, camera, walker, collider }) {
    this.camera = camera;
    this.walker = walker;
    this.collider = collider;
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.groups = [];
    this.active = null;   // { item, anchor }

    for (const g of CONFIG.itemLabels?.groups ?? []) {
      const items = [];
      for (const it of g.items ?? []) {
        const obj = findByName(root, it.name);
        if (!obj) { console.warn(`[itemLabels] no object named "${it.name}"`); continue; }
        // Anchor the tag just above the top-centre of the object.
        _box.setFromObject(obj);
        const anchor = new THREE.Vector3(
          (_box.min.x + _box.max.x) / 2, _box.max.y + (it.lift ?? 0.06), (_box.min.z + _box.max.z) / 2);
        items.push({ ...it, obj, anchor });
      }
      if (items.length) this.groups.push({ ...g, items });
    }

    this.el = document.createElement('div');
    this.el.id = 'itemTag';
    this.el.setAttribute('role', 'tooltip');
    document.body.appendChild(this.el);
  }

  /** Is the visitor close enough to this group for its tags to wake up? */
  near(g) {
    const f = this.walker.feet;
    const [x, y, z] = g.near;
    if (Math.abs(f.y - y) > (g.levelTolerance ?? 1.6)) return false;
    return Math.hypot(f.x - x, f.z - z) <= (g.radius ?? 4.5);
  }

  /** Pointer hover. `seated` is whether the visitor is currently sat down
   *  (seats.js/desk.js/coffee.js/oven.js) — a group only stays live while
   *  seated if it opts in with `allowSeated: true` (the music wall, so the
   *  stool can actually be used for the thing it's for). Returns true when a
   *  tag is showing (the caller then hides the floor marker). */
  hover(clientX, clientY, seated = false) {
    // Session 49: `requires` (a story star id) keeps a group asleep until
    // that star is collected — main.js supplies `unlocked`.
    const live = this.groups.filter((g) => (!seated || g.allowSeated) && this.near(g) &&
      (!g.requires || !!this.unlocked?.(g.requires)));
    if (!live.length) { this.hide(); return false; }

    this.camera.updateMatrixWorld();
    this.ndc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);

    const items = live.flatMap((g) => g.items);
    const hits = this.ray.intersectObjects(items.map((i) => i.obj), true);
    if (!hits.length) { this.hide(); return false; }
    const hit = hits[0];
    const item = items.find((i) => i.obj === hit.object || isChildOf(hit.object, i.obj));
    if (!item) { this.hide(); return false; }

    // Something solid in between (a wall, the other side of the table)?
    if (this.collider) {
      this.ray.firstHitOnly = true;
      const block = this.ray.intersectObject(this.collider, false)[0];
      this.ray.firstHitOnly = false;
      if (block && block.distance < hit.distance - 0.12) { this.hide(); return false; }
    }

    // Session 70: the guitar and ukulele hang high on the wall (their tops
    // sit ~3 units above eye level), so their top-centre anchor lands above
    // the top of the screen and the tag was being drawn off-screen — the
    // "hover doesn't work" bug. When the usual anchor isn't comfortably on
    // screen, pin the tag just above the spot the pointer is on instead.
    const anchor = this.onScreen(item.anchor) ? item.anchor
      : hit.point.clone().add(_up.set(0, item.lift ?? 0.06, 0));

    if (this.active?.item !== item) {
      if (item.description) {
        this.el.textContent = '';
        const title = document.createElement('span');
        title.className = 'tagTitle';
        title.textContent = item.label;
        const desc = document.createElement('span');
        desc.className = 'tagDesc';
        desc.textContent = item.description;
        this.el.append(title, desc);
        this.el.classList.add('withDesc');
      } else {
        this.el.textContent = item.label;
        this.el.classList.remove('withDesc');
      }
      this.active = { item, anchor };
    }
    this.active.anchor = anchor;
    this.el.classList.add('show');
    this.place();
    return true;
  }

  /** Would a tag pinned at `p` actually be visible — in front of the
   *  camera, and with room above it for the tag itself? */
  onScreen(p) {
    _v.copy(p).project(this.camera);
    return _v.z < 1 && Math.abs(_v.x) < 0.95 && _v.y < 0.75 && _v.y > -1;
  }

  hide() {
    if (!this.active) return;
    this.active = null;
    this.el.classList.remove('show');
  }

  /** Keep the tag pinned over its object as the camera moves. */
  place() {
    if (!this.active) return;
    _v.copy(this.active.anchor ?? this.active.item.anchor).project(this.camera);
    if (_v.z > 1) { this.hide(); return; }
    this.el.style.left = `${(_v.x * 0.5 + 0.5) * innerWidth}px`;
    this.el.style.top = `${(-_v.y * 0.5 + 0.5) * innerHeight}px`;
  }

  update() {
    if (!this.active) return;
    const g = this.groups.find((gr) => gr.items.includes(this.active.item));
    if (!g || !this.near(g)) { this.hide(); return; }
    this.place();
  }
}

function isChildOf(o, parent) {
  for (let p = o.parent; p; p = p.parent) if (p === parent) return true;
  return false;
}

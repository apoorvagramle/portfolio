// ---------------------------------------------------------------------------
//  The kitchen coffee station — "make your own coffee".
//
//  Everything you can touch is a real object on the little table by the west
//  wall of the kitchen, straight out of MeraGHAR.glb:
//
//    Moka Pot   an Empty whose origin is the SPOUT (the east rim), with the
//               body, lid, chamber coffee and the brewing spurts under it
//    Milk       an Empty whose origin is the carton's top pouring edge
//    Frother    an Empty whose origin is the whisk TIP
//    Mug_1..3   three mugs, origin at the base; each carries a `Liquid` box
//               (scale.y = how full) and a `Foam` box on the rim
//
//  The motion was authored in Blender and comes in as four glTF clips:
//
//    MokaBrew   lid swings open on its handle-side hinge, coffee rises in the
//               chamber while it spurts out of the funnel, lid closes (3 s)
//    MokaPour   body tilts ~66° about the spout, holds, comes back (2.4 s)
//    MilkPour   same for the carton, about its top edge (2.4 s)
//    Froth      whisk spins, wand wobbles (2 s, looped while frothing)
//
//  Only the CHILDREN are animated. The Empties at the top are moved from
//  here, so a carried pot can be dragged anywhere and still play its clip.
//
//  The gesture model, in the visitor's hands rather than the scene's:
//
//    tap the pot            -> it brews (MokaBrew). Nothing else to do.
//    drag a mug             -> it slides along the tabletop, and stays there.
//    drag pot/milk/frother  -> it lifts and follows the pointer at its own
//                              depth. Hold it over a mug for a beat and it
//                              pours (or froths) BY ITSELF, then floats back
//                              to where it lives. Let go anywhere else and it
//                              just goes home.
//
//  Session 73: no longer any order — CONFIG.coffee.steps is the recipe
//  (mug → milk → froth → brew → coffee), shown one step at a time on the
//  card under the Coffee Corner poster; anything out of turn shakes and the
//  current step is repeated. Once the cup is done it's free play again.
//
//  (Pre-73:) Any order. The only physical rules: an unbrewed pot has nothing to pour,
//  and there is nothing to froth in a mug with no milk in it. A mug with
//  coffee, milk and foam is the finished cup — `onDone` fires once.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { CONFIG } from '../config/config.js';
import { findByName } from '../util/util.js';

const C = CONFIG.coffee ?? {};

const TABLE = C.table ?? { x: [-17.15, -15.05], z: [-15.3, -10.95], top: 3.34 };
const HOLD_TO_POUR = C.holdToPour ?? 0.35;     // seconds over a mug before it pours
const TAP_MS = 260, TAP_PX = 7;

const COLOR_COFFEE = new THREE.Color(C.coffeeColor ?? 0x2a1509);
const COLOR_LATTE  = new THREE.Color(C.latteColor  ?? 0x9a6a45);
const COLOR_MILK   = new THREE.Color(C.milkColor   ?? 0xf3ede2);

const easeOut = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
const smooth  = (t) => t * t * (3 - 2 * t);

// Session 73: latte art. Frothing leaves the foam plain white — no mark at
// all (Apoorva: "when milk is frothed, only let white foam appear"). The
// heart only forms when the coffee goes in: it blooms out from its centre
// over the pour (`drawFoam`'s `k`, 0..1). A filled heart on a small pixel
// grid, drawn crisp (NearestFilter) to match the voxel look of the house.
// Every mug gets its own little canvas, redrawn only when the heart grows.
const FOAM_PX = 32;
const FOAM_WHITE = '#fbf8f2';
const HEART_INK = '#6b3f22';
const HEART_MASK = (() => {
  // Classic heart curve (x² + y² − 1)³ − x²y³ ≤ 0, sampled on the grid.
  const N = FOAM_PX, out = [];
  for (let py = 0; py < N; py++) {
    for (let px = 0; px < N; px++) {
      const x = ((px + 0.5) / N - 0.5) * 3.4;
      const y = (0.5 - (py + 0.5) / N) * 3.4 + 0.2;
      const a = x * x + y * y - 1;
      if (a * a * a - x * x * y * y * y <= 0) out.push([px, py, Math.hypot(x, y - 0.25)]);
    }
  }
  const maxR = Math.max(...out.map((p) => p[2]));
  return out.map(([x, y, r]) => [x, y, r / maxR]);
})();

function makeFoamCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = FOAM_PX;
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return { canvas, tex, drawn: -1 };
}

/** Plain white foam (k = 0), with a heart grown to `k` of its full size. */
function drawFoam(f, k) {
  const q = Math.round(k * 20) / 20;   // redraw in 5% steps, not every frame
  if (q === f.drawn) return;
  f.drawn = q;
  const ctx = f.canvas.getContext('2d');
  ctx.fillStyle = FOAM_WHITE;
  ctx.fillRect(0, 0, FOAM_PX, FOAM_PX);
  if (q > 0) {
    ctx.fillStyle = HEART_INK;
    for (const [x, y, r] of HEART_MASK) if (r <= q) ctx.fillRect(x, y, 1, 1);
  }
  f.tex.needsUpdate = true;
}

// MokaPour, MilkPour and Froth all came back from the glTF export with their
// ORIGINAL absolute frame position still baked into their timeline, rather
// than rebased to start at 0 — because the four clips shared one NLA
// timeline in the .blend (`claude/coffee-interaction-spec.md`: MokaBrew
// 1–72, MokaPour 101–158, MilkPour 201–258, Froth 301–348, all at 24fps),
// and the exporter merged same-named tracks across objects without
// re-zeroing each one. So MilkPour's clip.duration came out as 10.75s, but
// the carton only actually moves in the LAST 2.375s of it (8.375s→10.75s,
// i.e. frames 201→258) — everything before that is a dead hold at the
// upright pose. Only MokaBrew (frame 1, ≈0s) happened to already start
// near zero, which is why it was the one clip that looked right.
//
// Using the raw clip.duration anywhere (playback speed, the fill/tilt-sync
// math in startPour) was timing everything off that 10.75s, so the fill
// would already be running while the carton was still sitting in its dead
// hold, upright, several seconds before it visibly tips — the "wrong
// orientation" / "takes forever" Apoorva saw. Trimming the padding off here
// once, at load, means every consumer (`clip.duration`, looping) just sees
// the real ~2.4s of content, the way it would have if the export had
// rebased it in the first place.
const CLIP_PAD_START = { MokaPour: 101 / 24, MilkPour: 201 / 24, Froth: 301 / 24 };
function trimClipPadding(clip) {
  const startSec = CLIP_PAD_START[clip.name];
  if (!startSec) return clip;   // MokaBrew and anything unlisted: already zero-based
  const tracks = clip.tracks.map((track) => {
    const size = track.getValueSize();
    const times = track.times;
    let i0 = 0;
    while (i0 < times.length && times[i0] < startSec) i0++;
    if (i0 > 0) i0--;           // keep one keyframe at/just before the cut, so the held pose carries over
    const newTimes = [], newValues = [];
    for (let i = i0; i < times.length; i++) {
      newTimes.push(Math.max(0, times[i] - startSec));
      for (let k = 0; k < size; k++) newValues.push(track.values[i * size + k]);
    }
    return new track.constructor(track.name, newTimes, newValues);
  });
  return new THREE.AnimationClip(clip.name, clip.duration - startSec, tracks);
}

export class Coffee {
  /**
   * @param {object} o
   * @param {THREE.Scene}   o.scene
   * @param {THREE.Object3D} o.root      the loaded gltf scene
   * @param {THREE.AnimationClip[]} o.animations   gltf.animations
   * @param {THREE.Camera}  o.camera
   * @param {Walker}        o.walker
   * @param {Function}      [o.onHint]  (text|null) => void — the thought bubble
   * @param {Function}      [o.onDone]  () => void — the cup is finished
   */
  constructor({ scene, root, animations, camera, walker, onHint = null, onDone = null }) {
    this.scene = scene; this.camera = camera; this.walker = walker;
    this.onHint = onHint; this.onDone = onDone;
    this.armed = false;          // nothing responds until the coffee star is found
    this.done = false;
    this.time = 0;

    this.ray = new THREE.Raycaster();
    this.ray.firstHitOnly = false;
    this.ndc = new THREE.Vector2();
    this.plane = new THREE.Plane();
    this.hit = new THREE.Vector3();

    // ---- animation ---------------------------------------------------------
    this.mixer = new THREE.AnimationMixer(root);
    this.clips = {};
    for (const clip of animations ?? []) this.clips[clip.name] = trimClipPadding(clip);
    const missing = ['MokaBrew', 'MokaPour', 'MilkPour', 'Froth'].filter((n) => !this.clips[n]);
    if (missing.length) console.warn('[coffee] clips missing from the model:', missing, '— re-export MeraGHAR.glb');

    // ---- the tools ----------------------------------------------------------
    const tool = (id, name, opts) => {
      const node = findByName(root, name);
      if (!node) { console.warn(`[coffee] no object named "${name}" — re-export the model`); return null; }
      node.updateWorldMatrix(true, false);
      const home = node.position.clone();
      const t = { id, node, home, homeYaw: node.rotation.y, ...opts, state: 'idle', over: null, overT: 0, anim: null };
      // Interactive meshes get their own material so a hover glow can't leak
      // onto the beans (they share palette.015 with the pot in Blender).
      t.meshes = [];
      node.traverse((m) => {
        if (!m.isMesh) return;
        m.material = m.material.clone();
        m.userData.coffeeTool = id;
        t.meshes.push(m);
      });
      return t;
    };

    this.pot     = tool('pot',     'Moka Pot', { clip: 'MokaPour', pours: 'coffee', lift: 0.45, streamColor: COLOR_COFFEE });
    this.milk    = tool('milk',    'Milk',     { clip: 'MilkPour', pours: 'milk',   lift: 0.35, streamColor: COLOR_MILK });
    this.frother = tool('frother', 'Frother',  { clip: 'Froth',    pours: 'froth',  lift: 0.40 });
    this.tools = [this.pot, this.milk, this.frother].filter(Boolean);
    this.brewed = false;
    this.brewing = false;

    if (this.pot && this.clips.MokaBrew) {
      this.brewAction = this.mixer.clipAction(this.clips.MokaBrew);
      this.brewAction.setLoop(THREE.LoopOnce, 1);
      this.brewAction.clampWhenFinished = true;
    }
    for (const t of this.tools) {
      if (!this.clips[t.clip]) continue;
      t.action = this.mixer.clipAction(this.clips[t.clip]);
      if (t.id === 'frother') { t.action.setLoop(THREE.LoopRepeat, Infinity); }
      else { t.action.setLoop(THREE.LoopOnce, 1); t.action.clampWhenFinished = true; }
    }

    // ---- the mugs -------------------------------------------------------------
    this.mugs = [];
    for (const name of C.mugs ?? ['Mug_1', 'Mug_2', 'Mug_3']) {
      const node = findByName(root, name);
      if (!node) { console.warn(`[coffee] no mug named "${name}"`); continue; }
      const liquid = findByName(node, `${name} Liquid`);
      const foam   = findByName(node, `${name} Foam`);
      if (!liquid || !foam) { console.warn(`[coffee] ${name} has no Liquid/Foam children`); continue; }
      liquid.material = liquid.material.clone();
      liquid.geometry.computeBoundingBox();
      foam.geometry.computeBoundingBox();
      // The foam box gets one material PER FACE (+x, -x, +y, -y, +z, -z), not
      // one shared material — texturing all six faces the same (the first
      // attempt at this) put the heart on the flat vertical side walls too,
      // and up close — the coffee.reveal camera looks almost straight down
      // at it — that read as a solid cream block sitting on the mug rather
      // than a foam surface with a mark on top, which is what Apoorva
      // flagged as "doesn't look like a cappuccino at all".
      //
      // That per-face material array needs `geometry.groups` (one group per
      // face pointing at a material index) and real per-face UVs to work at
      // all. Blender's glTF export only writes those when the source mesh
      // had them, and this box never did (no texture on it in Blender, so
      // no UV map, no material slots) — `foam.geometry.groups` comes back
      // `[]` and there's no `uv` attribute. With an empty group list,
      // three.js's renderer has nothing to draw the mesh with at all, which
      // is the actual "doesn't look like a cappuccino" bug: the foam box
      // was invisible the whole time, and every screenshot was just the
      // coffee liquid (or the mug's own rim) showing through where the foam
      // should have been. Swapping in a plain THREE.BoxGeometry of the same
      // size gets both for free — its default face groups and 0..1 per-face
      // UVs are exactly what the material array below expects.
      {
        const bb = foam.geometry.boundingBox;
        const size = new THREE.Vector3().subVectors(bb.max, bb.min);
        const center = new THREE.Vector3().addVectors(bb.max, bb.min).multiplyScalar(0.5);
        const boxGeom = new THREE.BoxGeometry(size.x, size.y, size.z);
        boxGeom.translate(center.x, center.y, center.z);
        foam.geometry.dispose();
        foam.geometry = boxGeom;
        foam.geometry.computeBoundingBox();
      }
      const foamSide = foam.material.clone();
      const foamTop = foam.material.clone();
      const foamArt = makeFoamCanvas();
      drawFoam(foamArt, 0);
      foamTop.map = foamArt.tex;
      foamTop.color.set(0xffffff);
      foamSide.map = null;
      foamSide.color.set(FOAM_WHITE);
      foamTop.needsUpdate = true;
      foamSide.needsUpdate = true;
      foam.material = [foamSide, foamSide, foamTop, foamSide, foamSide, foamSide];
      // Rim height above the mug's origin — measured off the mug's own mesh.
      const box = new THREE.Box3().setFromObject(node);
      node.updateWorldMatrix(true, false);
      const rim = box.max.y - node.getWorldPosition(new THREE.Vector3()).y;
      // An invisible cylinder so "is the pointer over this mug" is easy. Just
      // the mug's own footprint and not much taller than its rim: the three
      // mugs sit 0.6 apart and overlap on screen from the room, so a fat
      // target would hide the mug behind it.
      const hit = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, rim + 0.25, 12),
        new THREE.MeshBasicMaterial({ visible: false, depthWrite: false })
      );
      hit.position.set(liquid.position.x, (rim + 0.25) / 2, liquid.position.z);
      hit.userData.coffeeMug = name;
      node.add(hit);
      const m = {
        name, node, liquid, foam, hit, rim,
        floorY: liquid.position.y,                       // local, above the base
        fullH:  liquid.geometry.boundingBox.max.y,       // liquid mesh height at scale 1
        level: 0, coffee: 0, milk: 0, foamLevel: 0, heart: 0, foamArt,
        home: node.position.clone(),
        baseRz: node.rotation.z,
      };
      m.liquid.scale.y = 0.02;
      this.mugs.push(m);
    }
    // Each mug's body mesh is a drag handle too.
    for (const m of this.mugs) {
      m.meshes = [];
      m.node.traverse((o) => { if (o.isMesh && o !== m.hit && o !== m.liquid && o !== m.foam) { o.material = o.material.clone(); o.userData.coffeeMug = m.name; m.meshes.push(o); } });
    }

    // ---- the pouring stream — one thin box, recoloured per pour ----------------
    this.stream = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 1, 0.06).translate(0, -0.5, 0),   // hangs down from its origin
      new THREE.MeshStandardMaterial({ color: COLOR_COFFEE, roughness: 0.4 })
    );
    this.stream.visible = false;
    scene.add(this.stream);

    // ---- Session 73: the recipe, one step at a time ------------------------
    // 0 pick up a mug · 1 pour milk · 2 froth · 3 tap the moka pot · 4 pour
    // the coffee · 5 done. Only the current step's thing answers; anything
    // else shakes and the step is said again (Apoorva: "if user is trying to
    // do something else, it should resist"). `myMug` is whichever mug was
    // picked up in step 0 — every pour after that has to go into it.
    this.steps = C.steps ?? [];
    this.step = 0;
    this.myMug = null;
    this.onStep = null;      // (index, total, text) => void — the card under the poster (main.js)

    this.drag = null;        // { kind: 'tool'|'mug', item, start:{x,y,t}, moved, depth }
    this.hovered = null;
    this._leaning = false;
    this.onLean = null;      // (leaning: boolean) => void, set by main.js — the Step back button
  }

  // -------------------------------------------------------------------------
  //  Story hooks
  // -------------------------------------------------------------------------

  /** The coffee star was found: from now on the table answers to the pointer. */
  arm() {
    if (this.armed) return;
    this.armed = true;
  }

  /** Called by main.js when the star's popup closes, so the hint isn't buried under it. */
  hint(text = this.stepText() ?? C.hint ?? 'MAKE YOUR COFFEE.') {
    if (!this.armed || this.done) return;
    this.onHint?.(text);
  }

  // -------------------------------------------------------------------------
  //  Session 73: the steps
  // -------------------------------------------------------------------------

  get guided() { return this.steps.length > 0 && !this.done; }

  stepText(i = this.step) { return this.steps[i] ?? null; }

  /** Move on to step `i`, tell the card and the thought bubble. */
  setStep(i) {
    if (i === this.step) return;
    this.step = i;
    this.onStep?.(i, this.steps.length, this.stepText(i));
    if (this.stepText(i)) this.onHint?.(this.stepText(i));
  }

  /** Is this the thing the current step wants touched? */
  allowed(p) {
    if (!this.guided) return true;
    if (p.kind === 'mug') return this.step === 0;
    const want = [null, this.milk, this.frother, this.pot, this.pot][this.step];
    return p.item === want;
  }

  /** "Not that one" — shake it and repeat what to do now. */
  resist(p) {
    this.nudge(p.item);
    const H = C.hints ?? {};
    const t = this.stepText();
    this.onHint?.(t ? `${H.oneStep ?? 'One step at a time!'} ${t}` : null);
  }

  // -------------------------------------------------------------------------
  //  Leaning in
  //
  //  Standing, the eye (4.0) is barely above the tabletop (3.34): you see the
  //  mugs edge-on and never see a cup fill. So the table borrows the desk's
  //  trick — the view rises and tilts down over it (`CONFIG.coffee.lean`,
  //  through the same Walker.sit the chairs use). "Step back", Esc, or a
  //  click on the floor puts you back on your feet where you were standing.
  // -------------------------------------------------------------------------

  get leaning() { return this._leaning && this.walker?.seated; }

  leanIn() {
    const L = C.lean;
    if (!L || !this.walker || this._leaning) return false;
    this._leaning = true;
    // Cinematic: first drop to a low, level view along the tabletop, then
    // (update below) rise and tilt down into the making-coffee view.
    if (L.start) {
      this._stage = 1; this._stageWait = L.startHold ?? 0.5;
      this.walker.sit({ eye: L.start.eye, yaw: L.yaw, pitch: L.start.pitch ?? 0, speed: L.start.speed ?? 0.9 });
    } else {
      this._stage = 2;
      this.walker.sit({ eye: L.eye, yaw: L.yaw, pitch: L.pitch ?? -0.6, speed: L.speed ?? 1.4 });
    }
    this.onLean?.(true);
    return true;
  }

  /** Back on your feet. Returns false if we weren't leaning. */
  standUp() {
    if (!this._leaning) return false;
    this._revealHold = null;
    this._leaning = false; this._stage = 0;
    if (this.drag) { this.pointerUp(); }
    this.walker.stand();
    this.onLean?.(false);
    return true;
  }

  /**
   * The finished cup, close up. From the ordinary lean-in eye the mugs'
   * own rims hide whatever is inside them — fine for pouring, but it means
   * the foam (and the latte-art heart on it) never actually comes into
   * view. So the moment a cup is done, look almost straight down at THAT
   * mug for a couple of seconds, then ease back to the normal lean.
   * `C.reveal` is worked out fresh from the mug's world position (any of
   * the three mugs may be the one that got used), same yaw/pitch
   * conventions as `seats`/`lean`; set `C.reveal` to null to skip this.
   */
  revealCup(mug) {
    const R = C.reveal;
    if (!R || !this.walker) return;
    // Aim at the actual liquid SURFACE, not the mug's base origin — the base
    // is down near the table, and a look-at that low points the camera at
    // the inside of the near wall from anywhere close by, which is all the
    // first version of this showed. `offset` is added on top of that.
    const base = mug.node.getWorldPosition(new THREE.Vector3());
    const liquidY = base.y + mug.floorY + mug.fullH * Math.max(0.02, mug.level);
    const target = new THREE.Vector3(base.x, liquidY, base.z);
    const off = R.offset ?? [0, 1.3, 0.6];
    const eye = new THREE.Vector3(base.x + off[0], liquidY + off[1], base.z + off[2]);
    const dir = new THREE.Vector3().subVectors(target, eye);
    const horiz = Math.hypot(dir.x, dir.z);
    const yaw = Math.atan2(-dir.x, -dir.z);
    const pitch = Math.atan2(dir.y, horiz);
    this.walker.sit({ eye: eye.toArray(), yaw, pitch, speed: R.speed ?? 1.3 });
    // A countdown ticked in update(dt), like brewTimer/nudge elsewhere in
    // this file — not setTimeout. Everything else about this interaction
    // (the pours, the froth loop) is driven off the same simulated dt that
    // MERAGHAR.step()/simulate() advance, so a real-wall-clock timer here
    // would drift out of step with it (and did, while testing this fix:
    // fast-forwarding several seconds of simulated time only takes a few
    // real milliseconds to execute, so the setTimeout this replaced could
    // fire and snap the camera back to the wide view before the simulated
    // hold was anywhere near over).
    this._revealHold = (R.holdMs ?? 2200) / 1000;
  }

  get targets() {
    if (!this.armed) return [];
    const out = [];
    for (const t of this.tools) out.push(...t.meshes);
    for (const m of this.mugs) out.push(...m.meshes);
    return out;
  }

  /** True while a drag owns the pointer — main.js hands every move/up to us. */
  get dragging() { return !!this.drag; }

  // -------------------------------------------------------------------------
  //  Picking
  // -------------------------------------------------------------------------

  castAt(clientX, clientY, objects) {
    this.camera.updateMatrixWorld();
    this.ndc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hits = this.ray.intersectObjects(objects, false);
    return hits.length ? hits[0] : null;
  }

  /** What the pointer is on: { kind:'tool', item } | { kind:'mug', item } | null. */
  pick(clientX, clientY) {
    if (!this.armed) return null;
    const hit = this.castAt(clientX, clientY, this.targets);
    if (!hit) return null;
    const ud = hit.object.userData;
    if (ud.coffeeTool) {
      const t = this.tools.find((x) => x.id === ud.coffeeTool);
      return t && t.state === 'idle' ? { kind: 'tool', item: t } : null;
    }
    if (ud.coffeeMug) {
      const m = this.mugs.find((x) => x.name === ud.coffeeMug);
      return m ? { kind: 'mug', item: m } : null;
    }
    return null;
  }

  /** Hover: returns true when the pointer is over something grabbable. */
  hover(clientX, clientY) {
    if (!this.armed) { this.setHover(null); return false; }
    const p = this.drag ? null : this.pick(clientX, clientY);
    this.setHover(p?.item ?? null);
    return !!p;
  }

  setHover(item) {
    if (this.hovered === item) return;
    const glow = (it, on) => { for (const m of it.meshes ?? []) { if (m.material.emissive) { m.material.emissive.setHex(0xffffff); m.material.emissiveIntensity = on ? 0.16 : 0; } } };
    if (this.hovered) glow(this.hovered, false);
    this.hovered = item;
    if (item) glow(item, true);
  }

  // -------------------------------------------------------------------------
  //  Pointer — main.js routes here first while armed
  // -------------------------------------------------------------------------

  /** Is the pointer on the tabletop (the ray meets y = table top inside its bounds)? */
  overTable(clientX, clientY) {
    const T = C.table;
    if (!T) return false;
    this.camera.updateMatrixWorld();
    this.ndc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), -T.top);
    const pt = this.ray.ray.intersectPlane(pl, new THREE.Vector3());
    return !!pt && pt.x >= T.x[0] - 0.3 && pt.x <= T.x[1] + 0.3 && pt.z >= T.z[0] && pt.z <= T.z[1];
  }

  pointerDown(clientX, clientY) {
    if (!this.armed || this.drag) return false;
    const p = this.pick(clientX, clientY);
    if (!p) {
      // Touching the bare tabletop counts too: the star is gone once found,
      // so the table itself is the way back in.
      if (C.lean && !this._leaning && this.overTable(clientX, clientY)) { this.leanIn(); return true; }
      return false;
    }
    // Reaching for something from down on the floor: come up to the table
    // first. The grab itself waits — a drag plane worked out from a camera
    // that is still on its way up would send the object anywhere.
    if (C.lean && !this._leaning) { this.leanIn(); return true; }
    if (this._leaning && (this._stage < 2 || this.walker.seatT < 1)) return true;
    if (!this.allowed(p)) { this.resist(p); return true; }
    this.walker?.stop?.();
    const node = p.item.node;
    // Tools follow the pointer at their own depth (a plane facing the camera
    // through the object); mugs slide on the tabletop.
    const depth = node.getWorldPosition(new THREE.Vector3());
    this.drag = { ...p, start: { x: clientX, y: clientY, t: performance.now() }, moved: false, anchor: depth, off: new THREE.Vector3() };
    if (p.kind === 'tool') {
      this.planeFacingCamera(depth);
    } else {
      // Mugs slide on the table, but the visitor sees that table almost
      // edge-on (eye 4.0, tabletop 3.34), so a ray onto the tabletop itself
      // skates metres for every pixel. Drag on a plane tilted halfway toward
      // the camera instead — pointer up still means "further back" — and
      // keep only the x/z of where it lands.
      const n = new THREE.Vector3();
      this.camera.getWorldDirection(n);
      n.multiplyScalar(-0.8).y += 1;
      this.plane.setFromNormalAndCoplanarPoint(n.normalize(), depth);
    }
    if (this.castPlane(clientX, clientY)) this.drag.off.copy(depth).sub(this.hit);
    return true;
  }

  pointerMove(clientX, clientY) {
    const d = this.drag;
    if (!d) return;
    if (!d.moved && Math.hypot(clientX - d.start.x, clientY - d.start.y) > TAP_PX) {
      d.moved = true;
      if (d.kind === 'tool') { d.item.state = 'held'; d.item.over = null; d.item.overT = 0; }
      else {
        this.playSfx('mugMove');
        // Step 1 done: this is YOUR mug now.
        if (this.guided && this.step === 0) { this.myMug = d.item; this.setStep(1); }
      }
    }
    if (!d.moved) return;
    if (d.kind === 'tool') this.moveTool(d, clientX, clientY);
    else this.moveMug(d, clientX, clientY);
  }

  pointerUp() {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    const quick = performance.now() - d.start.t < TAP_MS;
    if (!d.moved) {
      if (quick && d.kind === 'tool' && d.item === this.pot) this.brew();
      return;
    }
    if (d.kind === 'tool') {
      const t = d.item;
      if (t.state !== 'held') return;
      // Dropped straight onto a mug counts too — no need to hover and wait.
      if (t.over && this.canPour(t, t.over)) this.startPour(t, t.over);
      else this.goHome(t);      // let go anywhere else: it drifts back home
    } else {
      this.settleMug(d.item);
    }
  }

  // -------------------------------------------------------------------------

  planeFacingCamera(through) {
    const n = new THREE.Vector3();
    this.camera.getWorldDirection(n);
    this.plane.setFromNormalAndCoplanarPoint(n, through);
  }

  castPlane(clientX, clientY) {
    this.camera.updateMatrixWorld();
    this.ndc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    return !!this.ray.ray.intersectPlane(this.plane, this.hit);
  }

  moveTool(d, clientX, clientY) {
    const t = d.item;
    if (!this.castPlane(clientX, clientY)) return;
    const target = this.hit.clone().add(d.off);
    // Lift it a little the moment it's picked up — reads as "in your hand".
    target.y += t.lift;
    t.node.position.copy(target);
    // Over a mug? Only the mug hit-cylinders are tested, so the carried tool
    // can't shadow the thing under it.
    const hit = this.castAt(clientX, clientY, this.mugs.map((m) => m.hit));
    const mug = hit ? this.mugs.find((m) => m.hit === hit.object) : null;
    if (mug !== t.over) { t.over = mug; t.overT = 0; }
  }

  moveMug(d, clientX, clientY) {
    const m = d.item;
    if (!this.castPlane(clientX, clientY)) return;
    const target = this.hit.clone().add(d.off);
    target.x = THREE.MathUtils.clamp(target.x, TABLE.x[0], TABLE.x[1]);
    target.z = THREE.MathUtils.clamp(target.z, TABLE.z[0], TABLE.z[1]);
    target.y = m.home.y + 0.12;
    m.node.position.lerp(target, 0.5);
  }

  settleMug(m) {
    m.settle = { from: m.node.position.clone(), to: m.node.position.clone().setY(m.home.y), t: 0 };
  }

  // -------------------------------------------------------------------------
  //  The four actions
  // -------------------------------------------------------------------------

  brew() {
    if (!this.pot || !this.brewAction || this.brewing) return;
    if (this.guided && this.step !== 3) { this.resist({ item: this.pot }); return; }
    if (this.brewed) { this.nudge(this.pot); return; }
    this.brewing = true;
    this.brewAction.reset().play();
    this.playSfx('brew');
    this.brewTimer = this.clips.MokaBrew.duration;
  }

  /** Can this tool do anything to this mug right now? */
  canPour(t, mug) {
    if (this.guided && this.myMug && mug !== this.myMug) return false;
    if (t.pours === 'coffee') return this.brewed && mug.level < 0.98;
    if (t.pours === 'milk')   return mug.level < 0.98;
    if (t.pours === 'froth')  return mug.milk > 0.05 && mug.foamLevel < 0.98;
    return false;
  }

  startPour(t, mug) {
    t.state = 'pouring';
    t.over = null; t.overT = 0;
    this.setHover(null);
    if (this.drag?.item === t) this.drag = null;    // the scene has taken over
    const from = t.node.position.clone();
    const rimW = this.mugRimWorld(mug);
    // Where it pours from: spout / carton edge a little above the rim; the
    // frother's tip goes INTO the cup, down to the liquid.
    const to = rimW.clone();
    if (t.pours === 'froth') to.y = this.liquidTopWorld(mug) + 0.02;
    else to.y += 0.28;
    // Which way round it tips. The body hangs off the spout along local -x,
    // so yaw decides where it ends up relative to the mug. Pot and carton go
    // to the visitor's LEFT: seen from above (the lean-in view) that shows
    // the whole tilted profile beside the cup, where "away from the camera"
    // only showed its underside. The frother just leans toward the camera.
    const cam = this.camera.position;
    const dx = cam.x - to.x, dz = cam.z - to.z;
    const yaw = t.pours === 'froth' ? Math.atan2(-dz, dx) : Math.atan2(-dx, -dz);
    // The tilt starts NOW, while it is still gliding in — a pot held upright
    // with its spout over a mug would have its base through the tabletop,
    // and you tip a moka pot as you bring it over anyway.
    //
    // The clips as exported turned out to be far longer than the ~2.4s (2.6s
    // for Froth) the whole interaction was designed and tuned around —
    // MilkPour is actually 10.75s, MokaPour 6.58s, Froth 14.5s (only
    // MokaBrew, at 3.0s, came out right). Using the raw clip length as `dur`
    // (the old code) meant the fill/foam math below — which assumes the
    // clip's own tilt keyframes land around the 0.5s.."dur"-0.5s mark —
    // was completely out of step with where those keyframes actually sit in
    // a 10-second clip: the liquid level would already be rising while the
    // carton on screen was still standing upright, several seconds before
    // it visibly tips. That's the "wrong orientation" / "takes forever"
    // Apoorva saw. Rather than a Blender re-export, play the clip at
    // whatever speed lands it on the INTENDED length, and use that intended
    // length for the timing math, so the visual tilt and the fill are back
    // in sync.
    const dur = t.pours === 'froth' ? (C.frothSeconds ?? 2.6) : (C.pourSeconds ?? 2.4);
    const rawDur = this.clips[t.clip]?.duration;
    t.action?.reset().play();
    if (t.action) t.action.timeScale = rawDur ? rawDur / dur : 1;
    this.playSfx(t.pours === 'froth' ? 'froth' : 'pour');
    // How much this pour will actually add, decided ONCE up front and capped
    // to whatever room is left in the mug. Working this out frame-by-frame
    // (the old code) meant a nearly-full mug hit its cap partway through the
    // flowing window: the level stopped climbing but the tool kept tilting
    // for the rest of the animation, which read as the pour freezing mid-way
    // and then "resuming" into the tilt-back. Spreading the capped amount
    // evenly across the whole window instead means it always finishes right
    // as the tilt-back begins.
    const target = t.pours === 'coffee' ? (C.coffeeFill ?? 0.55) : (C.milkFill ?? 0.40);
    const pourAmount = Math.min(target, Math.max(0, 0.98 - mug.level));
    t.anim = { phase: 'pour', from, to, yawFrom: t.node.rotation.y, yawTo: yaw, t: 0, dur, mug, pourAmount };
  }

  finishPour(t) {
    const mug = t.anim.mug;
    t.action?.stop();
    this.stream.visible = false;
    if (t.pours === 'coffee') {
      // The pot is empty again — brew it once more if you want another cup.
      this.brewed = false;
      this.brewAction?.stop();
    }
    this.playSfx(null);
    this.goHome(t);
    if (this.guided && mug === this.myMug) {
      if (t.pours === 'milk' && this.step === 1) this.setStep(2);
      else if (t.pours === 'froth' && this.step === 2) this.setStep(3);
    }
    if (t.pours === 'coffee') mug.heart = 1;
    this.checkDone(mug);
  }

  goHome(t) {
    t.state = 'returning';
    t.over = null; t.overT = 0;
    t.anim = { phase: 'home', from: t.node.position.clone(), to: t.home.clone(), yawFrom: t.node.rotation.y, yawTo: t.homeYaw, t: 0 };
  }

  /** A little shake — "nothing to do here". */
  nudge(t) {
    t.nudge = 0.001;
  }

  /** Why the shake, in the thought bubble. Strings live in CONFIG.coffee.hints. */
  explain(t, mug) {
    const H = C.hints ?? {};
    let text = null;
    if (this.guided && this.myMug && mug !== this.myMug) text = H.notYourMug ?? 'Into the mug you picked up!';
    else if (t.pours === 'coffee' && !this.brewed) text = H.needBrew;
    else if (t.pours === 'froth' && mug.milk <= 0.05) text = H.needMilk;
    else if (mug.level >= 0.98) text = H.full;
    if (text) this.onHint?.(text);
  }

  checkDone(mug) {
    if (this.done) return;
    if (mug.coffee > 0.05 && mug.milk > 0.05 && mug.foamLevel > 0.9) {
      this.step = this.steps.length;
      this.onStep?.(this.step, this.steps.length, C.stepsDone ?? null);
      this.done = true;
      this.onHint?.(null);
      this.revealCup(mug);
      setTimeout(() => this.onDone?.(), C.doneDelay ?? 900);
    }
  }

  playSfx(name) {
    const src = name ? C.sfx?.[name] : null;
    this.sfx?.pause();
    this.sfx = null;
    if (!src) return;
    const a = new Audio(src); a.volume = C.sfxVolume ?? 0.8; a.play().catch(() => {});
    this.sfx = a;
  }

  // -------------------------------------------------------------------------
  //  Geometry helpers
  // -------------------------------------------------------------------------

  mugRimWorld(m) {
    // The liquid box isn't always dead-centre on the mug's own origin (the
    // Blender pivot), so its x/z is a LOCAL offset off `m.node`. Adding that
    // offset straight to the node's world position — the old code — only
    // works while the mug is perfectly unrotated; it's what was landing the
    // pour a little off to one side. Ask the liquid mesh for its own world
    // position instead, which folds in the mug's rotation correctly, and
    // only borrow the node's world Y for the rim height (that offset really
    // is vertical-only).
    m.node.updateWorldMatrix(true, false);
    const p = m.liquid.getWorldPosition(new THREE.Vector3());
    p.y = m.node.getWorldPosition(new THREE.Vector3()).y + m.rim;
    return p;
  }

  liquidTopWorld(m) {
    const p = m.node.getWorldPosition(new THREE.Vector3());
    return p.y + m.floorY + m.fullH * Math.max(0.02, m.level);
  }

  // -------------------------------------------------------------------------
  //  Per-frame
  // -------------------------------------------------------------------------

  update(dt) {
    this.time += dt;
    this.mixer.update(dt);

    // Somebody else took the view (a map ride, the desk): we're not leaning any more.
    if (this._leaning && !this.walker?.seated) { this._leaning = false; this._stage = 0; this.onLean?.(false); }
    if (this._leaning && this._stage === 1 && this.walker.seatT >= 1) {
      this._stageWait -= dt;
      if (this._stageWait <= 0) {
        this._stage = 2;
        const L = C.lean;
        this.walker.sit({ eye: L.eye, yaw: L.yaw, pitch: L.pitch ?? -0.6, speed: L.speed ?? 0.8 });
      }
    }

    if (this.brewing) {
      this.brewTimer -= dt;
      if (this.brewTimer <= 0) {
        this.brewing = false; this.brewed = true;
        if (this.guided && this.step === 3) this.setStep(4);
      }
    }

    if (this._revealHold != null) {
      this._revealHold -= dt;
      if (this._revealHold <= 0) {
        this._revealHold = null;
        if (this._leaning && this.walker.seated) {
          const L = C.lean;
          if (L) this.walker.sit({ eye: L.eye, yaw: L.yaw, pitch: L.pitch ?? -0.6, speed: L.speed ?? 0.8 });
        }
      }
    }

    // A tool held still over a mug pours by itself.
    for (const t of this.tools) {
      if (t.state === 'held' && t.over) {
        t.overT += dt;
        if (t.overT >= HOLD_TO_POUR) {
          if (this.canPour(t, t.over)) this.startPour(t, t.over);
          else { this.nudge(t); this.explain(t, t.over); t.overT = -1.0; }    // shake, say why, wait a second before asking again
        }
      }
      if (t.anim) this.stepAnim(t, dt);
      if (t.nudge != null) {
        t.nudge += dt;
        const k = Math.sin(t.nudge * 40) * Math.max(0, 0.45 - t.nudge) * 0.35;
        t.node.rotation.z = k;
        if (t.nudge > 0.45) { t.nudge = null; t.node.rotation.z = 0; }
      }
    }

    for (const m of this.mugs) {
      if (m.nudge != null) {
        m.nudge += dt;
        m.node.rotation.z = m.baseRz + Math.sin(m.nudge * 40) * Math.max(0, 0.45 - m.nudge) * 0.25;
        if (m.nudge > 0.45) { m.nudge = null; m.node.rotation.z = m.baseRz; }
      }
      if (m.settle) {
        m.settle.t = Math.min(1, m.settle.t + dt * 4);
        m.node.position.lerpVectors(m.settle.from, m.settle.to, easeOut(m.settle.t));
        if (m.settle.t >= 1) m.settle = null;
      }
      // Liquid + foam follow their targets smoothly, whatever set them.
      m.liquid.scale.y = Math.max(0.02, m.level);
      const milkFrac = m.coffee + m.milk > 0 ? m.milk / (m.coffee + m.milk) : 0;
      m.liquid.material.color.copy(COLOR_COFFEE).lerp(COLOR_LATTE, milkFrac).lerp(COLOR_MILK, Math.max(0, milkFrac - 0.85) * 4);
      const f = Math.max(0.001, m.foamLevel);
      m.foam.scale.set(f, f, f);
      drawFoam(m.foamArt, m.foamLevel > 0.5 ? m.heart : 0);
    }
  }

  stepAnim(t, dt) {
    const a = t.anim;
    if (a.phase === 'pour') {
      a.t += dt;
      const mug = a.mug;
      // Glide into place over the first 0.4 s (the clip is tilting in meanwhile).
      const e = smooth(Math.min(1, a.t / 0.4));
      t.node.position.lerpVectors(a.from, a.to, e);
      t.node.rotation.y = THREE.MathUtils.lerp(a.yawFrom, a.yawTo, e);
      // The clips tilt in over ~0.5 s and tilt back over the last ~0.5 s: that
      // middle window is when liquid actually moves.
      const w0 = 0.5, w1 = a.dur - 0.5;
      const flowing = a.t > w0 && a.t < w1;
      if (t.pours === 'froth') {
        if (flowing) mug.foamLevel = Math.min(1, mug.foamLevel + dt / (w1 - w0));
        // The whisk sits at the liquid surface, which is where the foam grows.
        this.stream.visible = false;
      } else {
        if (flowing) {
          const add = (dt / (w1 - w0)) * a.pourAmount;
          mug.level = Math.min(0.98, mug.level + add);
          if (t.pours === 'coffee') {
            mug.coffee += add;
            // The heart blooms on the foam as the coffee goes in.
            if (mug.foamLevel > 0.5) mug.heart = Math.min(1, mug.heart + dt / (w1 - w0));
          } else mug.milk += add;
          // Milk poured onto foam knocks it down a little — it's a cartoon, but
          // it stops a frothed cup looking untouched after a second pour.
          if (t.pours === 'milk') mug.foamLevel = Math.max(0, mug.foamLevel - dt * 0.6);
        }
        // The stream: from the spout straight down to the liquid.
        this.stream.visible = flowing;
        if (flowing) {
          const top = t.node.getWorldPosition(new THREE.Vector3());
          this.stream.position.copy(top);
          this.stream.material.color.copy(t.streamColor);
          this.stream.scale.y = Math.max(0.05, top.y - this.liquidTopWorld(mug));
        }
      }
      if (a.t >= a.dur) this.finishPour(t);
      return;
    }
    if (a.phase === 'home') {
      a.t = Math.min(1, a.t + dt / 0.7);
      const e = smooth(a.t);
      t.node.position.lerpVectors(a.from, a.to, e);
      t.node.rotation.y = THREE.MathUtils.lerp(a.yawFrom, a.yawTo, e);
      if (a.t >= 1) { t.anim = null; t.state = 'idle'; }
    }
  }
}

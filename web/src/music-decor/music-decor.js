// ---------------------------------------------------------------------------
//  Music Corner note-wall chain reaction (23 Sep 2026, corrected 24 Sep).
//
//  Apoorva: "the lights turn on on the music symbol for the decor piece in
//  music. the symbol should glow up, and it should be like a flow, first
//  symbol glows, it turns off and simultaneously 2nd symbol starts, like a
//  chain reaction. also this should trigger user clicks on any music
//  instrument." Then, once she'd actually seen it: "the lights were
//  supposed to be a chain, and not the lines. right now you have light up
//  all of it, we just need to light up the symbols (grey), not the lines
//  (black). and each symbol lights up and turns off just when the next
//  symbol glows. no two symbols glow together. i can see 5 symbols."
//
//  `Decor` (MeraGHAR.glb, Music Corner / studio) is a wavy five-line staff
//  with five note glyphs sitting on it — but it's ONE mesh, one material
//  (`palette.072`, a 256x1 baked colour strip), and topologically a single
//  connected piece: the staff itself never breaks. That rules out
//  star-lights.js's trick of flood-filling the whole mesh to find separate
//  "stars" (it did that for the strings-and-stars curtain — see that
//  file's header — and gets exactly one component back here, not five).
//
//  What DOES separate the five notes: colour. The staff's dark stripes and
//  each note's light body are two different offsets into the palette
//  strip — confirmed live over the Blender MCP connection: every "note"
//  face samples the palette at UV.x ≈ 0.1738, every "staff line" face at
//  UV.x ≈ 0.1582, no other values used on this mesh at all, and nothing in
//  between. That's a clean, constant-per-face signal already sitting in
//  the mesh's own UV data — no need to load or sample the actual palette
//  PNG at runtime to tell them apart, just compare each vertex's own UV.x
//  against a threshold roughly halfway between those two numbers
//  (`detectNotes`'s `uThreshold`, default 0.166).
//
//  The first version of this (23 Sep) skipped that distinction — every
//  vertex got bucketed into a band by world Y alone, staff line included,
//  which is exactly why Apoorva saw the whole thing light up rather than
//  just the five note bodies. `detectNotes` below fixes this at the root:
//  it welds vertices by position (same trick as star-lights.js's
//  `detectStars`) and flood-fills only the LIGHT-coloured triangles —
//  never unioning across a dark (staff) vertex — so a dark vertex can
//  never end up in a note's island, and never gets a valid band index.
//  Reproduces the exact five islands found live in Blender, but as a pure
//  function over the real loaded geometry (position + UV), not hardcoded
//  numbers — so it stays correct if the mesh is ever reshaped. See
//  claude/session-46-music-decor-fix.md for the before/after and the exact
//  UV numbers.
//
//  The glow itself is a plain emissive patch on Decor's own material
//  (onBeforeCompile, same recipe as star-lights.js's glow-only branch) —
//  nothing here casts light onto the rest of the room, unlike the bedroom
//  stars. Built right after `starLights` in main.js's setup() on purpose:
//  see the comment over that line for why glow modules that patch their
//  own material have to go last, in the order they want to win.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { CONFIG } from '../config/config.js';
import { findByName } from '../util/util.js';

/**
 * Find the individual note glyphs on the wavy staff mesh, by colour.
 * Pure function over world-space positions + per-vertex UV.x + triangle
 * indices (mirrors star-lights.js's `detectStars`), so it can be tested
 * outside the browser and re-derives the right answer if the mesh changes.
 *
 *  - classify every vertex "light" (a note's own body) or "dark" (a staff
 *    line) by its own UV.x — a solid, constant-per-face signal on this
 *    mesh's baked palette texture, not something that needs the actual
 *    image;
 *  - weld vertices by position, then flood-fill triangles, but ONLY ever
 *    union two vertices that are BOTH light — a dark vertex, or an edge
 *    that touches one, never joins a note's island;
 *  - group the resulting light-only components, order them along world Y
 *    (left to right on the wall) for a stable band index.
 *
 * @param {Float32Array|number[]} P    world positions, xyz packed
 * @param {Float32Array|number[]} UVX  each vertex's own UV.x
 * @param {Uint32Array|number[]|null} I  triangle indices (null = non-indexed)
 * @returns {{ bandOf: Int16Array, bandCount: number }} per-vertex band index
 *          (-1 = not part of any note — a staff-line vertex, never glows)
 */
export function detectNotes(P, UVX, I, opts = {}) {
  const U_THRESHOLD = opts.uThreshold ?? 0.166;   // between dark ~0.158 and light ~0.174
  const WELD = opts.weld ?? 0.001;

  const n = P.length / 3;
  const isLight = new Uint8Array(n);
  for (let i = 0; i < n; i++) isLight[i] = UVX[i] > U_THRESHOLD ? 1 : 0;

  // --- weld by position ----------------------------------------------------
  const weld = new Map();
  const wid = new Int32Array(n);
  let nw = 0;
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(P[i * 3] / WELD)},${Math.round(P[i * 3 + 1] / WELD)},${Math.round(P[i * 3 + 2] / WELD)}`;
    let w = weld.get(k);
    if (w === undefined) { w = nw++; weld.set(k, w); }
    wid[i] = w;
  }

  // --- union-find, light-only edges -----------------------------------------
  const parent = new Int32Array(nw);
  for (let i = 0; i < nw; i++) parent[i] = i;
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };

  const triCount = I ? I.length / 3 : n / 3;
  for (let t = 0; t < triCount; t++) {
    const a = I ? I[t * 3] : t * 3, b = I ? I[t * 3 + 1] : t * 3 + 1, c = I ? I[t * 3 + 2] : t * 3 + 2;
    if (isLight[a] && isLight[b]) union(wid[a], wid[b]);
    if (isLight[b] && isLight[c]) union(wid[b], wid[c]);
    if (isLight[a] && isLight[c]) union(wid[a], wid[c]);
  }

  // --- group light vertices by component, order left-to-right by Y ---------
  const islands = new Map();   // root -> { sumY, count }
  for (let i = 0; i < n; i++) {
    if (!isLight[i]) continue;
    const r = find(wid[i]);
    let g = islands.get(r);
    if (!g) { g = { sumY: 0, count: 0 }; islands.set(r, g); }
    g.sumY += P[i * 3 + 1];
    g.count++;
  }
  const order = [...islands.entries()]
    .map(([root, g]) => ({ root, y: g.sumY / g.count }))
    .sort((a, b) => a.y - b.y);
  const bandOfRoot = new Map(order.map((o, idx) => [o.root, idx]));

  const bandOf = new Int16Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    if (!isLight[i]) continue;
    bandOf[i] = bandOfRoot.get(find(wid[i]));
  }
  return { bandOf, bandCount: order.length };
}

export class MusicDecor {
  /**
   * @param {Object} o
   * @param {THREE.Object3D} o.root   the loaded house
   * @param {THREE.Scene}    o.scene  for the note halos (optional)
   */
  constructor({ root, scene }) {
    const C = CONFIG.musicDecor;
    this.enabled = !!C;
    if (!this.enabled) return;
    this.C = C;
    this.t = 0;
    this.running = false;
    // Session 70: `play()` loops the chain for as long as "Tum hi ho" plays;
    // `stop()` fades whichever note is lit out over `fadeOut` seconds.
    this.looping = false;
    this.fade = 1;
    this.fading = false;

    // ---- instrument click targets ------------------------------------------
    // Guitar / Ukulele / Keyboard — the same three objects CONFIG.itemLabels'
    // `musicWall` group already labels on hover. Tag every mesh under each
    // (not just the named object itself, in case it's a small group) so a
    // raycast hit anywhere on the instrument's own geometry reads back the
    // tag main.js's useInteractive() is looking for.
    this.targets = [];
    for (const name of C.triggers ?? []) {
      const obj = findByName(root, name);
      if (!obj) { console.warn(`[music-decor] no object named "${name}"`); continue; }
      obj.traverse((o) => {
        if (!o.isMesh) return;
        o.userData.musicTarget = true;
        this.targets.push(o);
      });
    }

    // ---- find the notes on Decor, by colour ---------------------------------
    this.N = 0;
    // Per band: current brightness, 0..1 — driven entirely by update(). Built
    // before the mesh loop below: patch() closes over `this.uniforms`, and
    // it's called from inside that loop, so it has to already exist.
    this.uBands = { value: [] };
    this.uniforms = {
      uBands: this.uBands,
      uBandGlow: { value: C.glow ?? 1.6 },
      // Session 70 (Apoorva: "that light is v dim, make it brighter"): while
      // lit, the note's own paint is pulled towards the neon colour too, so
      // the studio's cyan wash plus the emissive read as one saturated LED
      // instead of grey paint with a blue cast.
      uBandTint: { value: C.tint ?? 0.75 },
      // An explicit additive tint, not the note's own (near-white) palette
      // colour amplified — an LED lighting up reads as its own colour, not
      // as "the same grey paint but brighter". Matches the studio's own
      // cyan (session-38-studio-lighting.md).
      uBandColor: { value: new THREE.Color(C.color ?? 0x0dafff) },
    };

    const decor = findByName(root, C.mesh ?? 'Decor');
    this.meshes = [];
    const noteStats = [];   // per band: world-space sum / min / max, for the halos
    if (!decor) {
      console.warn(`[music-decor] no mesh named "${C.mesh}"`);
    } else {
      decor.updateWorldMatrix(true, true);
      decor.traverse((o) => {
        if (!o.isMesh) return;
        const pos = o.geometry.attributes.position;
        const uv = o.geometry.attributes.uv;
        if (!uv) { console.warn('[music-decor] Decor has no UV data — can\'t tell notes from staff lines'); return; }

        const P = new Float32Array(pos.count * 3);
        const UVX = new Float32Array(pos.count);
        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
          P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z;
          UVX[i] = uv.getX(i);
        }
        const idxAttr = o.geometry.index;
        const { bandOf, bandCount } = detectNotes(P, UVX, idxAttr ? idxAttr.array : null);
        this.N = Math.max(this.N, bandCount);
        for (let i = 0; i < pos.count; i++) {
          const b = bandOf[i];
          if (b < 0) continue;
          const k = C.reverse ? bandCount - 1 - b : b;
          const st = noteStats[k] ??= { sum: new THREE.Vector3(), n: 0, box: new THREE.Box3() };
          v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
          st.sum.add(v); st.n++; st.box.expandByPoint(v);
        }
        console.log(`[music-decor] ${bandCount} note${bandCount === 1 ? '' : 's'} found on "${C.mesh ?? 'Decor'}"`);

        // Session 50: `reverse` runs the chain the other way along the wall
        // (Apoorva: the direction was backwards). Staff-line -1s stay -1.
        const idxs = C.reverse
          ? Float32Array.from(bandOf, (b) => (b >= 0 ? bandCount - 1 - b : b))
          : Float32Array.from(bandOf);
        o.geometry.setAttribute('aBandIdx', new THREE.BufferAttribute(idxs, 1));
        // A private material copy, patched below — never the shared one
        // other objects might reference. See the file header for why this
        // has to happen after star-lights.js's own "patch every material
        // in the house" pass, not before it.
        o.material = o.material.clone();
        this.meshes.push(o);
      });
      this.uBands.value = new Array(this.N).fill(0);
      for (const o of this.meshes) this.patch(o.material, this.N);
      if (scene && C.halo && this.N) this.halo = this.makeHalos(scene, noteStats, this.N);
    }
  }

  /** Session 70: a soft additive bloom quad over each note (same recipe as
   *  star-lights.js's star halos), riding that note's own brightness — this
   *  is what makes a lit note read as GLOWING rather than just recoloured.
   *  Pulled a little towards the camera so the wall never clips it. */
  makeHalos(scene, stats, N) {
    const H = this.C.halo;
    const pos = [], corner = [], idx = [], size = [], index = [];
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const ext = new THREE.Vector3();
    let q = 0;
    for (let b = 0; b < N; b++) {
      const st = stats[b];
      if (!st?.n) continue;
      const c = st.sum.clone().divideScalar(st.n);
      st.box.getSize(ext);
      const r = Math.max(ext.x, ext.y, ext.z) * 0.5 * (H.scale ?? 2.2);
      for (let k = 0; k < 4; k++) {
        pos.push(c.x, c.y, c.z); corner.push(...corners[k]); idx.push(b); size.push(r);
      }
      const o = q * 4;
      index.push(o, o + 1, o + 2, o, o + 2, o + 3);
      q++;
    }
    if (!q) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aCorner', new THREE.Float32BufferAttribute(corner, 2));
    g.setAttribute('aBandIdx', new THREE.Float32BufferAttribute(idx, 1));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
    g.setIndex(index);
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uBands: this.uBands,
        uLift: { value: H.lift ?? 0.35 },
        uColor: { value: new THREE.Color(this.C.color ?? 0x0dafff).multiplyScalar(H.strength ?? 0.9) },
      },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        attribute vec2 aCorner;
        attribute float aBandIdx;
        attribute float aSize;
        uniform float uBands[${N}];
        uniform float uLift;
        varying vec2 vC;
        varying float vW;
        void main() {
          vC = aCorner;
          vW = uBands[ int( aBandIdx + 0.5 ) ];
          vec4 mv = modelViewMatrix * vec4( position, 1.0 );
          mv.xy += aCorner * aSize;
          mv.z += uLift;
          gl_Position = projectionMatrix * mv;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `
        #include <common>
        #include <logdepthbuf_pars_fragment>
        uniform vec3 uColor;
        varying vec2 vC;
        varying float vW;
        void main() {
          #include <logdepthbuf_fragment>
          float a = pow( saturate( 1.0 - length( vC ) ), 2.0 ) * vW;
          if ( a <= 0.001 ) discard;
          gl_FragColor = vec4( uColor * a, 1.0 );
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.name = 'MusicDecor_halos';
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  }

  patch(mat, N) {
    const U = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, U);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>',
          `#include <common>\nattribute float aBandIdx;\nuniform float uBands[${N}];\n` +
          'varying float vBand;\n')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
  // aBandIdx is -1 for a staff-line vertex — never look it up as a band,
  // or int(-1 + 0.5) truncates to 0 and it would wrongly borrow band 0's
  // brightness (this is exactly the "whole thing lights up" bug from the
  // first version — see the file header).
  vBand = aBandIdx > -0.5 ? uBands[ int( aBandIdx + 0.5 ) ] : 0.0;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uBandColor;\nuniform float uBandGlow;\nuniform float uBandTint;\nvarying float vBand;\n')
        .replace('#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n' +
          '  diffuseColor.rgb = mix( diffuseColor.rgb, uBandColor, saturate( vBand ) * uBandTint );\n' +
          '  totalEmissiveRadiance += uBandColor * vBand * uBandGlow;');
    };
    // Every band's brightness lives in `this.uniforms` (shared by reference
    // across every Decor sub-mesh's own material) — update() only ever
    // touches that one array, so all of Decor stays in lockstep.
    mat.customProgramCacheKey = () => `musicdecor2:${N}`;
    mat.needsUpdate = true;
  }

  /** One pass of the chain, first note to last. */
  trigger() {
    if (!this.enabled || !this.N) return false;
    this.t = 0;
    this.looping = false;
    this.fade = 1; this.fading = false;
    this.running = true;
    return true;
  }

  /** Session 70: loop the chain until stop() — runs for as long as the
   *  instrument song ("Tum hi ho") plays. The last note hands straight back
   *  to the first, same no-overlap handoff as between any two notes. */
  play() {
    if (!this.trigger()) return false;
    this.looping = true;
    return true;
  }

  /** Song over (ended, or stopped): fade the lit note out, don't start more. */
  stop() {
    if (!this.running) return;
    this.looping = false;
    this.fading = true;
  }

  update(dt) {
    if (!this.enabled || !this.running) return;
    const C = this.C;
    this.t += dt;
    if (this.halo) this.halo.visible = true;
    // `stagger` == `width`: each note's own pulse starts at 0, peaks, and is
    // back to 0 by the time the next one starts — a clean handoff, never two
    // notes lit at once. (Apoorva: "each symbol lights up and turns off just
    // when the next symbol glows. no two symbols glow together.")
    const width = C.width ?? 0.45;
    const stagger = C.stagger ?? width;
    const arr = this.uBands.value;
    // Looping: wrap the clock once a full pass is done — note N-1's window
    // ends exactly where note 0's begins, so the chain never stutters.
    if (this.looping) this.t %= this.N * stagger;
    if (this.fading) {
      this.fade -= dt / (C.fadeOut ?? 0.35);
      if (this.fade <= 0) {
        arr.fill(0);
        this.running = false; this.fading = false; this.fade = 1;
        if (this.halo) this.halo.visible = false;
        return;
      }
    }
    let anyLive = false;
    for (let i = 0; i < this.N; i++) {
      const local = this.t - i * stagger;
      if (local < 0 || local > width) { arr[i] = 0; continue; }
      anyLive = true;
      arr[i] = Math.sin(Math.PI * (local / width)) * this.fade;   // smooth up-then-down, never spills past its own window
    }
    if (!this.looping && !anyLive && this.t > (this.N - 1) * stagger + width) {
      this.running = false;
      if (this.halo) this.halo.visible = false;
    }
  }
}

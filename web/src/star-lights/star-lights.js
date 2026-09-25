// ---------------------------------------------------------------------------
//  Bedroom star curtain — every star is its own light (23 Sep 2026).
//
//  `Stars` in MeraGHAR.glb is one merged mesh: strings hanging off the wall
//  above the bed with little stars threaded on them. At load this module
//  finds each individual star in that mesh, then:
//
//   1. LIGHT — patches the house's own lit materials (everything under the
//      GLB root) with a small diffuse-only loop over the stars: each star
//      lights whatever faces it, with inverse-square falloff, from where it
//      actually hangs. Clipped to CONFIG.starLights.box, and skipped
//      entirely (one uniform branch) whenever the bedroom's lights are
//      faded out, so the rest of the house pays ~nothing for it.
//   2. GLOW — each star's own body glows (emissive), per star.
//   3. HALO — a soft additive bloom sprite around each star.
//   4. TWINKLE — every star gets its own slow clock, and its light, glow
//      and halo all ride it together, so the pools of light on the wall
//      breathe star by star.
//
//  It also owns the bedside lamp's shade/bulb glow (just the shade — the
//  base stays unlit), which rides the bedroom's fade the same way. The
//  lamp's actual light is an ordinary PointLight in CONFIG.rooms.
//
//  Everything fades with the bedroom (rooms.levelOf) and with the Stars
//  mesh's own opacity, so when mars.js fades the real stars out for the
//  Mars ceiling story, their light goes with them.
//
//  Why not 37 THREE.PointLights: see the CONFIG.starLights header.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { CONFIG } from '../config/config.js';
import { findByName } from '../util/util.js';

const MAX_STARS = 64;   // uniform-array cap; the curtain has 37

/**
 * Find the individual stars in a merged "stars on strings" mesh.
 * Pure function over world-space positions + triangle indices, so it can
 * be tested outside the browser.
 *
 *  - weld vertices by position and flood-fill triangles → one component per
 *    string (a string and its stars touch, so they come out together);
 *  - slice each string along Y: slices wider than a bare string are star;
 *    each run of wide slices is one star, centred on its bounding box.
 *  - a component too short to be a string is taken as a single star.
 *
 * @param {Float32Array|number[]} P  world positions, xyz packed
 * @param {Uint32Array|number[]|null} I  triangle indices (null = non-indexed)
 * @returns {{ centers: number[][], starOf: Int16Array }}  star centres and,
 *          per vertex, the index of the star it belongs to (-1 = string)
 */
export function detectStars(P, I, opts = {}) {
  const BIN = opts.bin ?? 0.02;        // slice height
  const WIDE = opts.wide ?? 0.15;      // a slice wider than this is star, not string
  const GAP = opts.gap ?? 0.12;        // merge runs closer than this
  const MINRUN = opts.minRun ?? 0.2;   // ignore wide runs shorter than this
  const RADIUS = opts.radius ?? 0.4;   // vertices within this of a centre belong to that star

  const n = P.length / 3;

  // --- weld + union-find over triangles -----------------------------------
  const weld = new Map();
  const wid = new Int32Array(n);
  let nw = 0;
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(P[i * 3] * 1000)},${Math.round(P[i * 3 + 1] * 1000)},${Math.round(P[i * 3 + 2] * 1000)}`;
    let w = weld.get(k);
    if (w === undefined) { w = nw++; weld.set(k, w); }
    wid[i] = w;
  }
  const parent = new Int32Array(nw);
  for (let i = 0; i < nw; i++) parent[i] = i;
  const find = (x) => {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
  const triCount = I ? I.length / 3 : n / 3;
  for (let t = 0; t < triCount; t++) {
    const a = I ? I[t * 3] : t * 3, b = I ? I[t * 3 + 1] : t * 3 + 1, c = I ? I[t * 3 + 2] : t * 3 + 2;
    union(wid[a], wid[b]); union(wid[a], wid[c]);
  }
  const comps = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(wid[i]);
    let list = comps.get(r);
    if (!list) comps.set(r, (list = []));
    list.push(i);
  }

  // --- per string: find the stars along it --------------------------------
  const centers = [];
  const starOf = new Int16Array(n).fill(-1);
  for (const verts of comps.values()) {
    let y0 = Infinity, y1 = -Infinity;
    for (const v of verts) { const y = P[v * 3 + 1]; if (y < y0) y0 = y; if (y > y1) y1 = y; }

    const found = [];   // [cx, cy, cz] for this component
    const bbox = (lo, hi) => {
      let ax = Infinity, bx = -Infinity, ay = Infinity, by = -Infinity, az = Infinity, bz = -Infinity, cnt = 0;
      for (const v of verts) {
        const y = P[v * 3 + 1];
        if (y < lo || y > hi) continue;
        const x = P[v * 3], z = P[v * 3 + 2];
        if (x < ax) ax = x; if (x > bx) bx = x;
        if (y < ay) ay = y; if (y > by) by = y;
        if (z < az) az = z; if (z > bz) bz = z;
        cnt++;
      }
      return cnt ? [(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2] : null;
    };

    if (y1 - y0 < 0.8) {
      // Short enough to be a single loose star rather than a string.
      const c = bbox(-Infinity, Infinity);
      if (c) found.push(c);
    } else {
      const nb = Math.ceil((y1 - y0) / BIN) + 1;
      const mnx = new Float32Array(nb).fill(Infinity), mxx = new Float32Array(nb).fill(-Infinity);
      const mnz = new Float32Array(nb).fill(Infinity), mxz = new Float32Array(nb).fill(-Infinity);
      for (const v of verts) {
        const b = Math.min(nb - 1, Math.floor((P[v * 3 + 1] - y0) / BIN));
        const x = P[v * 3], z = P[v * 3 + 2];
        if (x < mnx[b]) mnx[b] = x; if (x > mxx[b]) mxx[b] = x;
        if (z < mnz[b]) mnz[b] = z; if (z > mxz[b]) mxz[b] = z;
      }
      const runs = [];
      let start = -1;
      for (let b = 0; b <= nb; b++) {
        const wide = b < nb && mxx[b] >= mnx[b] &&
          Math.max(mxx[b] - mnx[b], mxz[b] - mnz[b]) > WIDE;
        if (wide && start < 0) start = b;
        if (!wide && start >= 0) { runs.push([y0 + start * BIN, y0 + b * BIN]); start = -1; }
      }
      const merged = [];
      for (const r of runs) {
        const last = merged[merged.length - 1];
        if (last && r[0] - last[1] < GAP) last[1] = r[1]; else merged.push([r[0], r[1]]);
      }
      for (const [a, b] of merged) {
        if (b - a < MINRUN) continue;
        const c = bbox(a - 0.05, b + 0.05);
        if (c) found.push(c);
      }
    }

    // Each vertex of this component belongs to its nearest star, if close.
    const base = centers.length;
    for (const c of found) centers.push(c);
    if (!found.length) continue;
    for (const v of verts) {
      let best = -1, bestD = RADIUS * RADIUS;
      for (let s = 0; s < found.length; s++) {
        const dx = P[v * 3] - found[s][0], dy = P[v * 3 + 1] - found[s][1], dz = P[v * 3 + 2] - found[s][2];
        const d = dx * dx + dy * dy + dz * dz;
        if (d < bestD) { bestD = d; best = s; }
      }
      if (best >= 0) starOf[v] = base + best;
    }
  }
  return { centers, starOf };
}

// A deterministic 0..1 hash so each star's twinkle is the same every visit.
function hash01(i, salt) {
  const s = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

export class StarLights {
  constructor({ scene, root, rooms }) {
    const C = CONFIG.starLights;
    this.enabled = !!C;
    if (!this.enabled) return;
    this.C = C;
    this.rooms = rooms;
    this.t = 0;

    // ---- find the stars --------------------------------------------------
    const starsObj = findByName(root, C.mesh ?? 'Stars');
    this.starMeshes = [];
    let centers = [];
    if (!starsObj) {
      console.warn(`[star-lights] no mesh named "${C.mesh}"`);
    } else {
      starsObj.updateWorldMatrix(true, true);
      starsObj.traverse((o) => {
        if (!o.isMesh) return;
        const g = o.geometry;
        const pos = g.attributes.position;
        const P = new Float32Array(pos.count * 3);
        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
          P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z;
        }
        const res = detectStars(P, g.index ? g.index.array : null);
        const base = centers.length;
        const idx = new Float32Array(pos.count);
        for (let i = 0; i < pos.count; i++) idx[i] = res.starOf[i] >= 0 ? res.starOf[i] + base : -1;
        g.setAttribute('aGlowIdx', new THREE.BufferAttribute(idx, 1));
        centers = centers.concat(res.centers);
        this.starMeshes.push(o);
      });
    }
    if (centers.length > MAX_STARS) {
      console.warn(`[star-lights] ${centers.length} stars found, lighting the first ${MAX_STARS}`);
      centers = centers.slice(0, MAX_STARS);
    }
    this.centers = centers;
    const N = Math.max(1, centers.length);
    console.log(`[star-lights] ${centers.length} stars in "${C.mesh}"`);

    // Per star: xyz = world position, w = how lit it is right now (0..1).
    this.uStars = { value: Array.from({ length: N }, (_, i) =>
      centers[i] ? new THREE.Vector4(...centers[i], 0) : new THREE.Vector4(0, -9999, 0, 0)) };
    // Per star twinkle clock — speed 0.5..1.3 rad/s, random phase.
    this.speed = centers.map((_, i) => 0.5 + 0.8 * hash01(i, 1));
    this.phase = centers.map((_, i) => Math.PI * 2 * hash01(i, 2));

    const col = new THREE.Color(C.color ?? 0xffc98a);   // linear, like any three.js light color
    const box = C.box;
    this.uniforms = {
      uStars: this.uStars,
      uStarOn: { value: 0 },
      uStarColor: { value: col.clone().multiplyScalar(C.intensity ?? 1.6) },
      uStarSoft: { value: C.soft ?? 0.8 },
      uStarRange: { value: C.range ?? 20 },
      uStarBoxMin: { value: new THREE.Vector3(box.x[0], box.y[0], box.z[0]) },
      uStarBoxMax: { value: new THREE.Vector3(box.x[1], box.y[1], box.z[1]) },
      uStarGlow: { value: C.glow ?? 2.2 },
      uLampGlow: { value: 0 },
    };

    // ---- the lamp's shade: glow attribute on its top part only ------------
    this.lampMeshes = [];
    if (C.lamp?.mesh) {
      const lamp = findByName(root, C.lamp.mesh);
      if (!lamp) console.warn(`[star-lights] no lamp mesh "${C.lamp.mesh}"`);
      else {
        lamp.updateWorldMatrix(true, true);
        const bb = new THREE.Box3().setFromObject(lamp);
        const cut = bb.min.y + (bb.max.y - bb.min.y) * (C.lamp.shadeFrom ?? 0.3);
        lamp.traverse((o) => {
          if (!o.isMesh) return;
          const pos = o.geometry.attributes.position;
          const idx = new Float32Array(pos.count);
          const v = new THREE.Vector3();
          for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
            idx[i] = v.y >= cut ? -2 : -1;   // -2 = lamp shade, -1 = no glow
          }
          o.geometry.setAttribute('aGlowIdx', new THREE.BufferAttribute(idx, 1));
          this.lampMeshes.push(o);
        });
      }
    }

    // ---- patch every lit material in the house ----------------------------
    // Materials are shared between meshes, so patch each one once. The glow
    // meshes (stars, lamp) get their own material copy with the extra glow
    // hook — mars.js already gave Stars a private copy, the lamp gets one here.
    const glowMeshes = new Set([...this.starMeshes, ...this.lampMeshes]);
    for (const m of this.lampMeshes) m.material = m.material.clone();
    const done = new Set();
    root.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const mat of mats) {
        if (!mat || done.has(mat)) continue;
        if (!(mat.isMeshStandardMaterial || mat.isMeshLambertMaterial || mat.isMeshPhongMaterial)) continue;
        done.add(mat);
        this.patch(mat, N, glowMeshes.has(o));
      }
    });

    // ---- halos: one camera-facing bloom quad per star ---------------------
    if (centers.length && C.halo) this.halo = this.makeHalos(scene, centers, col, N);
  }

  patch(mat, N, glow) {
    const U = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, U);
      const decl =
        `uniform vec4 uStars[${N}];\n` +
        'uniform float uStarOn;\nuniform vec3 uStarColor;\nuniform float uStarSoft;\n' +
        'uniform float uStarRange;\nuniform vec3 uStarBoxMin;\nuniform vec3 uStarBoxMax;\n';

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${decl}${glow ? 'varying float vGlow;\n' : ''}`)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  if ( uStarOn > 0.0 ) {
    // View -> world without an inverse: the view matrix is a rigid transform
    // (same trick three's own probe-grid lighting uses).
    vec3 sWP = ( ( vec4( geometryPosition, 1.0 ) - viewMatrix[ 3 ] ) * viewMatrix ).xyz;
    vec3 sWN = transformNormalByInverseViewMatrix( geometryNormal, viewMatrix );
    vec3 sIn = smoothstep( uStarBoxMin - 0.3, uStarBoxMin, sWP ) * ( 1.0 - smoothstep( uStarBoxMax, uStarBoxMax + 0.3, sWP ) );
    float sMask = sIn.x * sIn.y * sIn.z;
    if ( sMask > 0.0 ) {
      float sIrr = 0.0;
      for ( int i = 0; i < ${N}; i ++ ) {
        vec4 s = uStars[ i ];
        vec3 L = s.xyz - sWP;
        float d2 = dot( L, L );
        float d = sqrt( d2 );
        float ndl = max( dot( sWN, L / max( d, 1e-4 ) ), 0.0 );
        float win = pow2( saturate( 1.0 - pow4( d / uStarRange ) ) );
        sIrr += s.w * ndl * win / ( d2 + uStarSoft );
      }
      reflectedLight.directDiffuse += sIrr * sMask * uStarOn * uStarColor * RECIPROCAL_PI * material.diffuseColor;
    }
  }`);

      if (glow) {
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>',
            `#include <common>\nattribute float aGlowIdx;\nuniform vec4 uStars[${N}];\n` +
            'uniform float uStarGlow;\nuniform float uLampGlow;\nvarying float vGlow;\n')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
  vGlow = aGlowIdx > -0.5 ? uStars[ int( aGlowIdx + 0.5 ) ].w * uStarGlow
        : ( aGlowIdx < -1.5 ? uLampGlow : 0.0 );`);
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <emissivemap_fragment>',
            '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * vGlow;');
      }
    };
    mat.customProgramCacheKey = () => `starlights:${N}:${glow ? 1 : 0}`;
    mat.needsUpdate = true;
  }

  makeHalos(scene, centers, col, N) {
    const H = this.C.halo;
    const count = centers.length;
    const pos = new Float32Array(count * 4 * 3);
    const corner = new Float32Array(count * 4 * 2);
    const idx = new Float32Array(count * 4);
    const index = [];
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let s = 0; s < count; s++) {
      for (let k = 0; k < 4; k++) {
        const v = s * 4 + k;
        pos.set(centers[s], v * 3);
        corner.set(corners[k], v * 2);
        idx[v] = s;
      }
      const b = s * 4;
      index.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    g.setAttribute('aGlowIdx', new THREE.BufferAttribute(idx, 1));
    g.setIndex(index);

    const m = new THREE.ShaderMaterial({
      uniforms: {
        uStars: this.uStars,
        uSize: { value: H.size ?? 0.7 },
        uColor: { value: col.clone().multiplyScalar(H.strength ?? 0.45) },
      },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        attribute vec2 aCorner;
        attribute float aGlowIdx;
        uniform vec4 uStars[${N}];
        uniform float uSize;
        varying vec2 vC;
        varying float vW;
        void main() {
          vC = aCorner;
          vW = uStars[ int( aGlowIdx + 0.5 ) ].w;
          vec4 mv = modelViewMatrix * vec4( position, 1.0 );
          mv.xy += aCorner * uSize;
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
          float r = length( vC );
          float a = pow( saturate( 1.0 - r ), 2.2 ) * vW;
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
    mesh.name = 'StarLights_halos';
    mesh.frustumCulled = false;   // 37 quads; its bounds would be the centres only
    mesh.renderOrder = 2;
    scene.add(mesh);
    return mesh;
  }

  /** Stars mesh's current opacity × visibility — mars.js fades it. */
  starsFade() {
    let f = 1;
    for (const o of this.starMeshes) {
      if (!o.visible) return 0;
      const m = o.material;
      if (m?.transparent) f = Math.min(f, m.opacity ?? 1);
    }
    return f;
  }

  update(dt) {
    if (!this.enabled) return;
    this.t += dt;
    const level = this.rooms?.levelOf(this.C.room) ?? 0;
    const on = level * this.starsFade();
    const tw = this.C.twinkle ?? 0.3;
    const arr = this.uStars.value;
    for (let i = 0; i < this.centers.length; i++) {
      const s = 0.5 + 0.5 * Math.sin(this.t * this.speed[i] + this.phase[i]);
      arr[i].w = on * (1 - tw * s);
    }
    this.uniforms.uStarOn.value = on > 0.001 ? 1 : 0;
    this.uniforms.uLampGlow.value = level * (this.C.lamp?.glow ?? 1.4);
    if (this.halo) this.halo.visible = on > 0.001;
  }
}

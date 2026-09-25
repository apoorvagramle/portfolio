// ---------------------------------------------------------------------------
//  The ✦ in glass — real refracting glass stars for the world.
//
//  This replaces `sparkle.js` for everything in the 3D scene: the story
//  markers, the easter eggs, the star over the desk chair and the planting
//  previews. The navbar's ✨ is untouched — that one is a DOM element with a
//  `backdrop-filter` displacement map, a different mechanism entirely.
//
//  Where the old marker was a *painting* of glass (a canvas billboard with a
//  gradient body, a rim and a fake sheen), this one is glass: an extruded
//  four-point star with a bevelled edge, a `MeshPhysicalMaterial` at
//  `transmission: 1`, and dispersion and iridescence on top. It genuinely
//  bends the room behind it — the house is real geometry, so three's
//  transmission pass has something to sample, which is exactly what the
//  navbar star can never have.
//
//  Ported from the "Glass Sparkle Workbench" artifact, 2D profile. The shape
//  and material numbers below are that workbench's settings; the workbench is
//  still the place to dial them (its "Copy these settings" button hands back
//  this same set of keys).
//
//  Two things worth knowing before tuning:
//
//    * One transmission pass, not one per star. three re-renders the scene
//      once a frame for refraction no matter how many transmissive objects
//      are on screen — but it *is* a second full pass over ~188k triangles.
//      Room gating (story.js) keeps that to the frames where a star is
//      actually visible, and `transmission: 0` here turns it off entirely if
//      it ever costs too much.
//    * A flat star goes edge-on twice per revolution. That is geometry, not a
//      bug — so these do not turntable. They face the camera and *sway*
//      (`sway` below, ±26°), which travels the highlights across the facets
//      without ever letting the silhouette thin out. Five sessions of "the
//      stars aren't visible" is enough; nothing here is allowed to vanish for
//      half a second at a time.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { CONFIG } from '../config/config.js';

/** Defaults, overridable per-house from `CONFIG.glassStar` (optional). */
const GLASS = {
  // --- shape (workbench "2D star") -----------------------------------------
  points: 4,
  taper: 0.26,          // point length
  tipWidth: 0.075,      // point sharpness
  depth: 0.03,          // extrusion, × radius
  bevelSize: 0.042,     // edge roll, × radius
  bevelThickness: 0.17, // how far the two faces sit apart, × radius
  bevelSegments: 5,
  curveSegments: 28,

  // --- glass ---------------------------------------------------------------
  transmission: 1,
  thickness: 1.1,               // × radius
  roughness: 0.05,
  ior: 1.62,
  dispersion: 3.2,
  iridescence: 0.5,
  clearcoat: 1,
  clearcoatRoughness: 0.04,
  envMapIntensity: 1.6,
  attenuationDistance: 3,       // × radius
  // The tint rides on the glass body (attenuation) rather than the surface
  // colour, which is what keeps it reading as a coloured gem instead of
  // painted plastic. A little emissive of the same tint is the one legibility
  // aid the glass gets on its own body — the house is lit dead flat, and pure
  // clear glass over a light bedroom wall is nearly nothing.
  emissiveIntensity: 0.22,
  // Session 23: story stars are CLEAR glass now (Apoorva: "transparent, not
  // yellow"). This is the self-glow a clear one keeps — just enough that it
  // doesn't vanish into a light wall.
  clearEmissive: 0.10,   // 24c: 0.06 → 0.10 so a candle tint actually reads

  // --- the pool of light it sits in ----------------------------------------
  // sparkle.js's bloom, kept. Glass alone is a smudge from across a room;
  // this is what makes it a find. Additive, so it never darkens the floor
  // (the Session 9 "grime patch" failure mode).
  halo: true,
  haloScale: 2.9,       // × radius
  haloOpacity: 0.42,
  clearHaloOpacity: 0.30,   // a clear star's halo is white, so a touch less of it

  // --- sparkle (Session 24d: "make it a lil sparkly") ----------------------
  // Tiny four-point glints that wink on and off around each star, plus a
  // soft flare that breathes at its heart. Additive, camera-facing, riding on
  // the halo so they always sit square to the view. 0 glints turns it off.
  glints: 5,            // winking glints per star
  glintSize: 0.7,       // × radius, at full wink
  glintSpread: 1.25,    // × radius — how far out from the centre they appear
  glintRate: 0.55,      // winks per second, roughly, per glint
  coreFlare: 1.5,       // × radius — the breathing cross-flare at the centre (0 = off)

  // --- idle motion ---------------------------------------------------------
  // The roll axis is never touched: the ✦ stays upright, always. The old
  // billboard's `rotateZ` lean is deliberately gone — a star that tips is
  // wrong, and the sway alone travels the highlights.
  sway: 0.45,           // radians, side to side. cos(26°) ≈ 0.9 of the face
  swaySpeed: 0.5,
  lean: 0,              // roll. Leave at 0.
  drift: 0.07,          // the faintest nod, to keep the glints moving
  ...(CONFIG.glassStar ?? {}),
};

// ---------------------------------------------------------------------------
//  Geometry — one four-point star, cached per radius.
// ---------------------------------------------------------------------------
function starShape(radius) {
  const { points, taper, tipWidth } = GLASS;
  const shape = new THREE.Shape();
  const step = (Math.PI * 2) / points;
  const tipAt = (i) => {
    const a = Math.PI / 2 + i * step;
    return { x: Math.cos(a) * radius, y: Math.sin(a) * radius, a };
  };
  for (let i = 0; i < points; i++) {
    const t0 = tipAt(i), t1 = tipAt(i + 1);
    const d0 = { x: Math.cos(t0.a), y: Math.sin(t0.a) };
    const d1 = { x: Math.cos(t1.a), y: Math.sin(t1.a) };
    const p = { x: d1.x - d0.x, y: d1.y - d0.y };
    const n = Math.hypot(p.x, p.y) || 1; p.x /= n; p.y /= n;
    // Both control points pulled in toward the centre — that is what pinches
    // the flanks concave instead of leaving a plain kite.
    const c1 = { x: d0.x * taper * radius + p.x * tipWidth * radius,
                 y: d0.y * taper * radius + p.y * tipWidth * radius };
    const c2 = { x: d1.x * taper * radius - p.x * tipWidth * radius,
                 y: d1.y * taper * radius - p.y * tipWidth * radius };
    if (i === 0) shape.moveTo(t0.x, t0.y);
    shape.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, t1.x, t1.y);
  }
  shape.closePath();
  return shape;
}

const geometries = new Map();
function geometryFor(radius) {
  const key = radius.toFixed(3);
  if (geometries.has(key)) return geometries.get(key);
  const g = new THREE.ExtrudeGeometry(starShape(radius), {
    depth: GLASS.depth * radius,
    curveSegments: GLASS.curveSegments,
    bevelEnabled: true,
    bevelSize: GLASS.bevelSize * radius,
    bevelThickness: GLASS.bevelThickness * radius,
    bevelOffset: 0,
    bevelSegments: GLASS.bevelSegments,
    steps: 1,
  });
  g.center();
  geometries.set(key, g);
  return g;
}

// ---------------------------------------------------------------------------
//  Environment — the glints. A procedural studio, prefiltered once.
//
//  There is no .hdr file to ship: strip lights and two coloured kickers are
//  drawn straight into a float equirect, then run through PMREM. It is the
//  only light these stars have (the house itself is lit flat by design, with
//  no shadows and no point lights), so without it they read as grey plastic.
// ---------------------------------------------------------------------------
const LIGHTS = [
  { u: 0.24,  v: 0.14, du: 0.10,  dv: 0.12, rgb: [1, 1, 1],          power: 16,  soft: 0.55 },
  { u: 0.40,  v: 0.18, du: 0.018, dv: 0.32, rgb: [1, 1, 1],          power: 34,  soft: 0.20 },
  { u: 0.455, v: 0.22, du: 0.008, dv: 0.26, rgb: [1, 1, 1],          power: 26,  soft: 0.25 },
  { u: 0.60,  v: 0.12, du: 0.012, dv: 0.20, rgb: [1, 1, 1],          power: 20,  soft: 0.25 },
  { u: 0.74,  v: 0.32, du: 0.07,  dv: 0.14, rgb: [1, 0.70, 0.40],    power: 6,   soft: 0.60 },
  { u: 0.92,  v: 0.60, du: 0.09,  dv: 0.13, rgb: [0.45, 0.65, 1],    power: 7,   soft: 0.70 },
  { u: 0.10,  v: 0.84, du: 0.28,  dv: 0.14, rgb: [0.7, 0.78, 1],     power: 2.5, soft: 0.90 },
];

let env = null;
const pending = new Set();   // materials made before the renderer showed up

function buildEnvironment(renderer) {
  const W = 512, H = 256;
  const skyTop = [0.30, 0.40, 0.66], skyBottom = [0.02, 0.03, 0.06], horizon = 0.52;
  const data = new Float32Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);
    const k = t < horizon ? t / horizon : 1;
    const dim = t < horizon ? 1 : 0.35;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const s = 0.5 + 0.5 * Math.cos(u * Math.PI * 2 * 14);
      const h = 0.5 + 0.5 * Math.cos(t * Math.PI * 2 * 7);
      const band = Math.exp(-Math.pow((t - horizon) * 40, 2)) * 1.2;
      const p = 1 + 1.0 * (s * 0.72 + h * 0.28) + band;
      const i = (y * W + x) * 4;
      data[i]     = (skyTop[0] * (1 - k) + skyBottom[0] * k) * dim * p;
      data[i + 1] = (skyTop[1] * (1 - k) + skyBottom[1] * k) * dim * p;
      data[i + 2] = (skyTop[2] * (1 - k) + skyBottom[2] * k) * dim * p;
      data[i + 3] = 1;
    }
  }
  for (const L of LIGHTS) {
    for (let y = 0; y < H; y++) {
      const vy = y / H;
      for (let x = 0; x < W; x++) {
        let ux = x / W - L.u;
        if (ux > 0.5) ux -= 1; else if (ux < -0.5) ux += 1;
        const d = Math.max(Math.abs(ux) / L.du, Math.abs(vy - L.v) / L.dv);
        if (d >= 1) continue;
        const e = d < 1 - L.soft ? 1 : 1 - (d - (1 - L.soft)) / L.soft;
        const f = e * e * (3 - 2 * e), i = (y * W + x) * 4;
        data[i]     += L.rgb[0] * L.power * f;
        data[i + 1] += L.rgb[1] * L.power * f;
        data[i + 2] += L.rgb[2] * L.power * f;
      }
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.needsUpdate = true;
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const rt = pmrem.fromEquirectangular(tex);
  tex.dispose(); pmrem.dispose();
  return rt.texture;
}

/**
 * Hand the module the renderer so it can prefilter its environment.
 *
 * Safe to call after stars already exist — anything built earlier picks the
 * environment up here — and safe never to call at all, in which case the
 * stars simply have no reflections to show. Call it once, from main.js.
 */
export function initGlassStars(renderer) {
  if (env) return env;
  try {
    env = buildEnvironment(renderer);
  } catch (err) {
    console.warn('[glass-star] no environment; stars will be dull', err);
    return null;
  }
  for (const m of pending) { m.envMap = env; m.needsUpdate = true; }
  pending.clear();
  return env;
}

// ---------------------------------------------------------------------------
//  The halo — sparkle.js's bloom, kept as an additive billboard behind.
// ---------------------------------------------------------------------------
const haloTextures = new Map();
function haloTexture(hex) {
  if (haloTextures.has(hex)) return haloTextures.get(hex);
  const S = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const c = new THREE.Color(hex).lerp(new THREE.Color(0xffffff), 0.3);
  const [r, g, b] = [c.r, c.g, c.b].map((v) => Math.round(v * 255));
  const grad = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0,    `rgba(${r},${g},${b},0.95)`);
  grad.addColorStop(0.28, `rgba(${r},${g},${b},0.34)`);
  grad.addColorStop(0.62, `rgba(${r},${g},${b},0.08)`);
  grad.addColorStop(1,    `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  haloTextures.set(hex, tex);
  return tex;
}

const _inv = new THREE.Quaternion();

// A thin four-point flare with a hot core — the "twinkle" shape.
let flareTex = null;
function flareTexture() {
  if (flareTex) return flareTex;
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const m = S / 2;
  const core = g.createRadialGradient(m, m, 0, m, m, m * 0.35);
  core.addColorStop(0, 'rgba(255,255,255,1)');
  core.addColorStop(0.4, 'rgba(255,244,220,0.55)');
  core.addColorStop(1, 'rgba(255,230,190,0)');
  g.fillStyle = core; g.fillRect(0, 0, S, S);
  // Two long, thin rays (a cross), each fading to nothing at the tip.
  for (const [w, h] of [[S, S * 0.045], [S * 0.045, S]]) {
    const grad = w > h
      ? g.createLinearGradient(0, 0, S, 0)
      : g.createLinearGradient(0, 0, 0, S);
    grad.addColorStop(0, 'rgba(255,240,210,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.95)');
    grad.addColorStop(1, 'rgba(255,240,210,0)');
    g.fillStyle = grad;
    g.fillRect(m - w / 2, m - h / 2, w, h);
  }
  flareTex = new THREE.CanvasTexture(c);
  flareTex.colorSpace = THREE.SRGBColorSpace;
  return flareTex;
}

/** Deterministic little random so every star's glints differ but don't reshuffle. */
function rand(seed) { const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

/**
 * A glass star for the world. Drop-in replacement for `makeSparkle`.
 *
 * @param {number} size  tip radius in world units (same number the old
 *   billboard took as its half-width, so sizes carry over unchanged).
 * @param {number} hex   tint. Rides on the glass body, not its surface.
 * @param {Object} [opts]
 * @param {boolean} [opts.occlude=true]  depth-test against the house. Off only
 *   for a star that has to read through furniture it hovers over (the desk).
 * @returns {THREE.Mesh} with `mesh.poseStar(camera, t, phase)` — call that
 *   each frame instead of copying the camera quaternion by hand; it faces the
 *   star at the camera, sways it, and keeps the halo square to the view.
 */
export function makeGlassStar(size, hex = 0xffffff, opts = {}) {
  const occlude = opts.occlude !== false;
  const tint = new THREE.Color(hex);
  if (opts.clear == null) opts = { ...opts, clear: tint.r > 0.97 && tint.g > 0.97 && tint.b > 0.97 };

  const material = new THREE.MeshPhysicalMaterial({
    metalness: 0,
    transparent: true,
    color: 0xffffff,
    transmission: GLASS.transmission,
    thickness: GLASS.thickness * size,
    roughness: GLASS.roughness,
    ior: GLASS.ior,
    dispersion: GLASS.dispersion,
    iridescence: GLASS.iridescence,
    iridescenceIOR: 1.30,
    clearcoat: GLASS.clearcoat,
    clearcoatRoughness: GLASS.clearcoatRoughness,
    envMapIntensity: GLASS.envMapIntensity,
    attenuationColor: tint.clone(),
    attenuationDistance: GLASS.attenuationDistance * size,
    emissive: tint.clone(),
    // A clear star (white tint) gets only a breath of self-glow — any more
    // and colourless glass reads as frosted/milky instead of transparent.
    emissiveIntensity: opts.clear ? GLASS.clearEmissive : GLASS.emissiveIntensity,
    // depthWrite stays off, as it did for the billboards: two stars in line
    // shouldn't punch holes in each other, and the transmission pass reads
    // the opaque depth buffer either way.
    depthWrite: false,
    depthTest: occlude,
    side: THREE.DoubleSide,
  });
  material.iridescenceThicknessRange = [120, 420];
  if (env) material.envMap = env; else pending.add(material);

  const mesh = new THREE.Mesh(geometryFor(size), material);
  mesh.rotation.order = 'ZXY';
  mesh.userData.sparkle = true;   // kept: main.js and story.js both look for it

  if (GLASS.halo) {
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(size * GLASS.haloScale, size * GLASS.haloScale),
      new THREE.MeshBasicMaterial({
        map: haloTexture(hex),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: occlude,
        toneMapped: false,
        opacity: GLASS.haloOpacity,
      })
    );
    halo.renderOrder = -1;
    mesh.add(halo);
    mesh.userData.halo = halo;

    // The sparkle: children of the halo, so they share its camera-square pose.
    const glints = [];
    const tintHex = '#' + tint.clone().lerp(new THREE.Color(0xffffff), 0.3).getHexString();
    const mkFlare = (sz) => new THREE.Mesh(
      new THREE.PlaneGeometry(sz, sz),
      new THREE.MeshBasicMaterial({
        map: flareTexture(), color: tintHex, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, depthTest: occlude, toneMapped: false, opacity: 0,
      })
    );
    const seed0 = Math.random() * 1000;
    for (let i = 0; i < GLASS.glints; i++) {
      const f = mkFlare(size * GLASS.glintSize);
      const a = rand(seed0 + i) * Math.PI * 2;
      const r = size * GLASS.glintSpread * (0.45 + 0.55 * rand(seed0 + i + 50));
      f.position.set(Math.cos(a) * r, Math.sin(a) * r, 0.01);
      f.userData.phase = rand(seed0 + i + 100) * 10;
      f.userData.rate = GLASS.glintRate * (0.7 + 0.6 * rand(seed0 + i + 150));
      f.renderOrder = 2;
      halo.add(f); glints.push(f);
    }
    let core = null;
    if (GLASS.coreFlare > 0) {
      core = mkFlare(size * GLASS.coreFlare);
      core.position.z = 0.02; core.renderOrder = 2;
      halo.add(core);
    }
    mesh.userData.glints = glints;
    mesh.userData.core = core;
  }

  /**
   * Face it at the camera, sway it, and pull the halo back square to the view.
   *
   * @param {THREE.Camera} camera
   * @param {number} t      running seconds
   * @param {number} phase  per-star offset, so a room full of stars doesn't
   *   sway in lockstep. Story.js passes the marker's x.
   */
  mesh.userData.haloOpacity = opts.clear ? GLASS.clearHaloOpacity : GLASS.haloOpacity;
  mesh.poseStar = function poseStar(camera, t = 0, phase = 0) {
    this.quaternion.copy(camera.quaternion);
    this.rotateY(Math.sin(t * GLASS.swaySpeed + phase) * GLASS.sway);
    this.rotateX(Math.sin(t * 0.37 + phase * 1.7) * GLASS.drift);
    this.rotateZ(Math.sin(t * 0.7 + phase) * GLASS.lean);
    const halo = this.userData.halo;
    if (halo) {
      halo.quaternion.copy(camera.quaternion).premultiply(_inv.copy(this.quaternion).invert());
      halo.material.opacity = this.material.opacity * this.userData.haloOpacity;
      const o = this.material.opacity;
      // Each glint winks: a sharp peak of a slow sine, so it is mostly off
      // and flashes briefly — scale and brightness together, with a small spin.
      for (const g of this.userData.glints ?? []) {
        const w = Math.pow(Math.max(0, Math.sin(t * g.userData.rate * Math.PI * 2 + g.userData.phase)), 5);
        g.material.opacity = o * w;
        g.scale.setScalar(0.25 + 0.75 * w);
        g.rotation.z = w * 0.5;
        g.visible = w > 0.01;
      }
      const c = this.userData.core;
      if (c) {
        const b = 0.55 + 0.45 * Math.pow(0.5 + 0.5 * Math.sin(t * 2.3 + phase), 3);
        c.material.opacity = o * 0.45 * b;
        c.scale.setScalar(0.8 + 0.3 * b);
        c.rotation.z = Math.sin(t * 0.4 + phase) * 0.15;
      }
    }
  };

  return mesh;
}


// ---------------------------------------------------------------------------
//  The easter-egg coin — Session 24: "The Question Coin", as designed.
//
//  Ported from Apoorva's "The Question Coin" artifact ("struck in liquid
//  glass"): a thick glass coin with a milled (reeded) rim, a ? cut into
//  both faces in relief — lit from the upper left, shadow to the lower
//  right — spinning slowly on its vertical axis with a small forward tilt.
//
//  Three layers, so each can be what it is:
//    * body   the glass itself — the same transmissive material as the
//             stars, tinted gold through its body (attenuation), which is
//             what the artifact's "gold-tinted glass" faces are.
//    * faces  a thin decal on each side carrying the ? relief and the inner
//             ring, drawn like the artifact's .glyph (white at low alpha
//             with a bright top-left edge and a dark bottom-right edge).
//    * reeds  72 flutes around the rim, alternating bright/dim.
//
//  Same contract as makeGlassStar: `mesh.material.opacity` drives every
//  fade (faces, reeds and halo follow it) and `mesh.poseStar(camera, t,
//  phase)` animates it — here a turntable spin, like the artifact (a coin
//  has a rim, so edge-on still reads as a coin, unlike the flat star).
// ---------------------------------------------------------------------------
const COIN = {
  thick: 0.16,          // × radius — the artifact's 24px on a 300px coin
  spinSeconds: 6,       // one revolution, as in the artifact
  tilt: -9 * Math.PI / 180,
  tint: 0xf3c35a,       // gold, carried by the glass body
  reeds: 72,
  ...(CONFIG.questionCoin ?? {}),
};

let coinFaceTex = null;
function coinFaceTexture() {
  if (coinFaceTex) return coinFaceTex;
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const mid = S / 2;
  g.clearRect(0, 0, S, S);
  // Soft top-left sheen across the face (the artifact's radial highlight).
  const sheen = g.createRadialGradient(S * 0.3, S * 0.24, 0, S * 0.3, S * 0.24, S * 0.56);
  sheen.addColorStop(0, 'rgba(255,255,255,0.30)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sheen;
  g.beginPath(); g.arc(mid, mid, mid - 2, 0, Math.PI * 2); g.fill();
  // Inner rings: a bright hairline, then a fainter one inset.
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = S * 0.006;
  g.beginPath(); g.arc(mid, mid, mid - S * 0.012, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.30)'; g.lineWidth = S * 0.008;
  g.beginPath(); g.arc(mid, mid, mid - S * 0.05, 0, Math.PI * 2); g.stroke();
  // The ? in relief: dark bottom-right, bright top-left, pale body.
  g.font = `700 ${Math.round(S * 0.52)}px Poppins, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const ty = mid + S * 0.01;
  g.fillStyle = 'rgba(40,24,6,0.55)';   g.fillText('?', mid + S * 0.012, ty + S * 0.014);
  g.fillStyle = 'rgba(255,255,255,0.95)'; g.fillText('?', mid - S * 0.009, ty - S * 0.009);
  g.fillStyle = 'rgba(255,238,200,0.55)'; g.fillText('?', mid, ty);
  coinFaceTex = new THREE.CanvasTexture(c);
  coinFaceTex.colorSpace = THREE.SRGBColorSpace;
  coinFaceTex.anisotropy = 4;
  return coinFaceTex;
}

let reedTex = null;
function reedTexture() {
  if (reedTex) return reedTex;
  const W = COIN.reeds * 4, H = 16, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  for (let i = 0; i < COIN.reeds; i++) {
    const grad = g.createLinearGradient(0, 0, 0, H);
    const a = i % 2 ? 0.45 : 1;
    grad.addColorStop(0, `rgba(255,255,255,${0.05 * a})`);
    grad.addColorStop(0.44, `rgba(255,255,255,${0.62 * a})`);
    grad.addColorStop(0.58, `rgba(214,226,248,${0.34 * a})`);
    grad.addColorStop(1, `rgba(255,255,255,${0.04 * a})`);
    g.fillStyle = grad;
    g.fillRect(i * 4, 0, 4, H);
  }
  reedTex = new THREE.CanvasTexture(c);
  reedTex.colorSpace = THREE.SRGBColorSpace;
  return reedTex;
}

export function makeQuestionCoin(size = 0.3, opts = {}) {
  const occlude = opts.occlude !== false;
  const thick = size * COIN.thick;
  const tint = new THREE.Color(COIN.tint);

  // The glass body — the stars' own material recipe, gold through the body.
  const body = new THREE.MeshPhysicalMaterial({
    metalness: 0, transparent: true, color: 0xfff4dc,
    transmission: GLASS.transmission, thickness: thick * 3, roughness: 0.06,
    ior: 1.5, dispersion: 1.2, iridescence: 0.25, iridescenceIOR: 1.3,
    clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.4,
    attenuationColor: tint, attenuationDistance: size * 0.9,
    emissive: tint.clone(), emissiveIntensity: 0.14,
    depthWrite: false, depthTest: occlude, side: THREE.DoubleSide,
  });
  if (env) body.envMap = env; else pending.add(body);

  const geo = new THREE.CylinderGeometry(size, size, thick, 72, 1, false).rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geo, body);
  // XYZ (the default): the 9° tilt is applied outside the spin, so the coin
  // turns about a tipped axle rather than wobbling — as the artifact's
  // .tilt wraps .coin.
  mesh.rotation.order = 'XYZ';
  mesh.userData.sparkle = true;
  mesh.userData.coin = true;

  const faceMat = new THREE.MeshBasicMaterial({
    map: coinFaceTexture(), transparent: true, depthWrite: false, depthTest: occlude, toneMapped: false,
  });
  const front = new THREE.Mesh(new THREE.CircleGeometry(size * 0.995, 64), faceMat);
  front.position.z = thick / 2 + size * 0.004;
  const back = new THREE.Mesh(new THREE.CircleGeometry(size * 0.995, 64), faceMat);
  back.rotation.y = Math.PI; back.position.z = -front.position.z;
  const reedMat = new THREE.MeshBasicMaterial({
    map: reedTexture(), transparent: true, depthWrite: false, depthTest: occlude, toneMapped: false,
    side: THREE.DoubleSide,
  });
  const reeds = new THREE.Mesh(
    new THREE.CylinderGeometry(size * 1.004, size * 1.004, thick, 72, 1, true).rotateX(Math.PI / 2), reedMat);
  mesh.add(front, back, reeds);

  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(size * 3.0, size * 3.0),
    new THREE.MeshBasicMaterial({
      map: haloTexture(0xffd27a), transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: occlude, toneMapped: false, opacity: 0.2,
    })
  );
  halo.renderOrder = -1;
  mesh.add(halo);
  mesh.userData.halo = halo;
  mesh.userData.haloOpacity = 0.2;

  // Spin on its own vertical axis, tipped forward 9° — the artifact's motion.
  // `phase` offsets each coin so two in one room aren't in lockstep.
  mesh.poseStar = function poseCoin(camera, t = 0, phase = 0) {
    this.rotation.set(COIN.tilt, (t / COIN.spinSeconds) * Math.PI * 2 + phase, 0);
    const o = this.material.opacity;
    faceMat.opacity = o; reedMat.opacity = o;
    halo.quaternion.copy(camera.quaternion).premultiply(_inv.copy(this.quaternion).invert());
    halo.material.opacity = o * this.userData.haloOpacity;
  };
  return mesh;
}

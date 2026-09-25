// ---------------------------------------------------------------------------
//  The bedroom's Mars ceiling — story: mars, CONFIG.bedStory.
//
//  Lying on the bed reveals the `mars` easter egg (main.js's onSeatState).
//  This module turns the ceiling above the bed into a cartoon space film.
//
//  Session 34: replaced the old five-beat, cross-faded slideshow with
//  Apoorva's "Mars Ceiling Film" (mars-film.jsx, made in Claude Design): ONE
//  continuous scene drawn as a pure function of a single clock, `T`, with a
//  virtual camera (shake, tilt, pan) instead of scenes that swap. Sections
//  (CONFIG.mars.scenes) are only named slices of that clock:
//
//    Cruise       stars streak past; Mars is a dot far ahead
//    Astronomer   the warp slows and Mars grows
//    StudyStars   Mars fills the view; Earth appears as a pale dot
//    Landing      floating physics equations, a bumpy crooked touchdown
//    Detour       the ship, the astronaut climbs out, trips, a DETOUR sign pops
//    LookingUp    the astronaut sits and the camera tilts up to the sky
//    Wonder       twinkling sky, a wave, a shooting star
//    Settle       Mars drops away and the sky resolves into the navy ceiling
//
//  The film's own captions are NOT drawn — the story HUD's typewriter
//  (CONFIG.story `mars` lines) carries the script. The film runs on its own
//  clock, started when that HUD starts, and keeps going after the HUD has
//  finished typing. It ends by itself (graceful `settle` fade to the real
//  ceiling) or, if the visitor stands up first, the quick `exit` fade.
//
//  Same trick as tv.js: a Canvas2D overlay plane positioned over the ceiling
//  above the bed (CONFIG.mars.plane), cross-fading against the real `Stars`
//  mesh (the hanging star strings) so exactly one of "real ceiling" /
//  "cartoon sky" shows at a time.
//
//  Driven from main.js's step(): `mars.sync(dt, hudActive, onBed)`.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { CONFIG } from '../config/config.js';
import { findByName } from '../util/util.js';

const M = CONFIG.mars;

// The film's own 1200x1000 space; the canvas is scaled to it.
const W = 1200, H = 1000, CX = 600, CY = 430;
const INK = '#f6efe4', AMBER = '#ffd166', BLUE = '#b9d7ff', MARS = '#d4643f', MARS_D = '#a8432d',
  MARS_L = '#e8875f', NAVY = '#1a1642', CRATER = '#b5502f', METAL = '#bfb3a2', VISOR = '#2a2160';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// The film's three motion helpers (see mars-film.jsx MOTION): enter, pop, drift.
const linear = (t) => t;
const easeInQuad = (t) => t * t;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
const MOTION = { enter: easeInOutCubic, pop: easeOutBack, drift: easeInOutSine };
function ease01(t, dur) { return dur <= 0 ? 1 : easeInOutCubic(clamp(t / dur, 0, 1)); }
const lerp = (a, b, t) => a + (b - a) * t;

// interpolate(ts, vs, ease)(T): piecewise, clamped at both ends.
function tw(T, ts, vs, ease = MOTION.enter) {
  if (T <= ts[0]) return vs[0];
  if (T >= ts[ts.length - 1]) return vs[vs.length - 1];
  for (let i = 0; i < ts.length - 1; i++) {
    if (T >= ts[i] && T <= ts[i + 1]) {
      const span = ts[i + 1] - ts[i];
      const k = span === 0 ? 0 : (T - ts[i]) / span;
      return vs[i] + (vs[i + 1] - vs[i]) * ease(k);
    }
  }
  return vs[vs.length - 1];
}

// Section cue table, derived from CONFIG.mars.scenes (the film's scene list).
const SCENES = M.scenes ?? [];
const C = {};
let TOTAL = 0;
for (const [name, dur] of SCENES) { if (!(name in C)) C[name] = TOTAL; TOTAL += dur; }

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const STARS = (() => {
  const r = rng(7), cols = [AMBER, INK, '#ffc98a', BLUE];
  return Array.from({ length: 160 }, () => ({ x: (r() - 0.5) * 2.4, y: (r() - 0.5) * 2, z: r(), c: cols[Math.floor(r() * 4)], s: 1 + r() * 2.5, ph: r() * 6 }));
})();
const CRATERS = (() => {
  const r = rng(11);
  return Array.from({ length: 22 }, () => ({ a: r(), d: 0.15 + r() * 0.8, w: 0.04 + r() * 0.08 }));
})();

// ---- canvas helpers --------------------------------------------------------
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
const rr = (ctx, x, y, w, h, r, fill) => { roundRect(ctx, x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); };
const disc = (ctx, x, y, r, fill) => { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); };
const oval = (ctx, x, y, rx, ry, fill) => { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); };
function ellipseGradient(ctx, cx, cy, rx, ry, stops, box) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(rx || 1, ry || 1);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (const [off, col] of stops) g.addColorStop(off, col);
  ctx.fillStyle = g;
  ctx.fillRect(-box, -box, box * 2, box * 2);
  ctx.restore();
}

// ---- the astronaut (film's <Astro>; 100x130 box, pivot at the feet) --------
function drawAstro(ctx, x, y, s = 1, rot = 0, wave = 0) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate((rot * Math.PI) / 180); ctx.scale(s, s); ctx.translate(-50, -126);
  rr(ctx, 22, 56, 56, 40, 12, METAL);
  rr(ctx, 14, 60, 16, 30, 8, INK);
  ctx.save();
  ctx.translate(78, 62); ctx.rotate((-wave * Math.PI) / 180); ctx.translate(-78, -62);
  rr(ctx, 70, 60, 16, 30, 8, INK); rr(ctx, 70, 84, 16, 10, 5, AMBER);
  ctx.restore();
  rr(ctx, 14, 84, 16, 10, 5, AMBER);
  rr(ctx, 32, 96, 15, 24, 7, INK); rr(ctx, 53, 96, 15, 24, 7, INK);
  rr(ctx, 30, 114, 19, 12, 6, AMBER); rr(ctx, 51, 114, 19, 12, 6, AMBER);
  rr(ctx, 30, 54, 40, 46, 16, INK);
  rr(ctx, 42, 68, 16, 6, 3, AMBER);
  disc(ctx, 50, 32, 28, INK);
  oval(ctx, 52, 34, 19, 17, VISOR);
  oval(ctx, 45, 27, 5, 3.5, BLUE);
  disc(ctx, 47, 37, 2.2, INK); disc(ctx, 58, 37, 2.2, INK);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(48, 43); ctx.quadraticCurveTo(52.5, 46.5, 57, 43); ctx.stroke();
  ctx.restore();
}

// ---- the film's layers, each a pure function of T --------------------------
function drawStarfield(ctx, T) {
  const dist = tw(T, [0, C.Astronomer, C.StudyStars, C.Landing, C.Landing + 2], [0, 5, 6.6, 7.1, 7.2], linear);
  const speed = tw(T, [0, 0.8, C.Astronomer, C.StudyStars, C.Landing, C.Landing + 2], [0, 1, 1, 0.35, 0.1, 0], MOTION.drift);
  const twinkle = T > C.Landing + 2;
  ctx.save();
  ctx.lineCap = 'round';
  for (const st of STARS) {
    const z = (((st.z - dist) % 1) + 1) % 1 * 0.95 + 0.05;
    const z2 = Math.min(1, z + speed * 0.06);
    const px = CX + st.x / z * 260, py = CY + st.y / z * 260;
    const qx = CX + st.x / z2 * 260, qy = CY + st.y / z2 * 260;
    const op = clamp((1 - z) * 1.6, 0, 1) * (twinkle ? 0.55 + 0.45 * Math.sin(T * 2 + st.ph) : 1);
    if (op <= 0.003) continue;
    const r = st.s * (1.3 - z);
    ctx.globalAlpha = op;
    if (speed > 0.05) {
      ctx.strokeStyle = st.c; ctx.lineWidth = r * 0.9;
      ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(px, py); ctx.stroke();
    }
    disc(ctx, px, py, r, st.c);
  }
  ctx.restore();
}

function drawSkyStars(ctx, T, pan) {
  ctx.save();
  ctx.translate(0, -pan * 0.6);
  for (let i = 0; i < 110; i++) {
    const s = STARS[i];
    ctx.globalAlpha = clamp(0.5 + 0.5 * Math.sin(T * 1.8 + s.ph), 0, 1);
    disc(ctx, (s.x / 2.4 + 0.5) * W, (s.y / 2 + 0.5) * 620 - 200, s.s * 0.8, s.c);
  }
  ctx.restore();
}

function drawMars(ctx, T) {
  const r = tw(T, [0, C.Astronomer, C.StudyStars, C.Landing, C.Landing + 3], [16, 70, 300, 1400, 9000], easeInQuad);
  const top = tw(T, [0, C.Astronomer, C.StudyStars, C.Landing, C.Landing + 3], [330, 300, 260, 560, 620], MOTION.enter);
  const cx = tw(T, [0, C.StudyStars, C.Landing], [760, 650, 600]);
  const cy = top + r;
  const spin = T * 4;
  disc(ctx, cx, cy, r * 1.08, 'rgba(232,135,95,0.12)');
  const g = ctx.createRadialGradient(cx - r + 0.76 * r, cy - r + 0.6 * r, 0, cx - r + 0.76 * r, cy - r + 0.6 * r, 1.6 * r);
  g.addColorStop(0, MARS_L); g.addColorStop(0.55, MARS); g.addColorStop(1, MARS_D);
  disc(ctx, cx, cy, r, g);
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  for (const k of CRATERS) {
    const a = (k.a * 360 + spin) * Math.PI / 180;
    const x = cx + Math.cos(a) * r * k.d * 0.9, y = cy - Math.abs(Math.sin(a)) * r * k.d * 0.9 + r * 0.1;
    const w = r * k.w;
    oval(ctx, x, y, w, w * 0.6, MARS_D);
    oval(ctx, x, y - w * 0.12, w, w * 0.5, CRATER);
  }
  ctx.restore();
}

function drawGround(ctx, T) {
  const op = tw(T, [C.Landing + 1.5, C.Landing + 3], [0, 1]);
  if (op <= 0) return;
  ctx.save(); ctx.globalAlpha = op;
  ctx.fillStyle = MARS; ctx.fillRect(-200, 620, W + 400, 800);
  ctx.fillStyle = MARS_L; ctx.fillRect(-200, 620, W + 400, 10);
  for (const [x, y, rx, ry, dy1, dy2] of [[220, 760, 120, 22, 754, 18], [960, 700, 70, 12, 697, 10], [760, 880, 150, 26, 873, 21]]) {
    oval(ctx, x, y, rx, ry, MARS_D); oval(ctx, x, dy1, rx, dy2, CRATER);
  }
  disc(ctx, 420, 660, 9, MARS_D); disc(ctx, 1080, 820, 14, MARS_D); disc(ctx, 90, 680, 7, MARS_D);
  ctx.restore();
}

function drawPhysicsGag(ctx, T) {
  const op = tw(T, [C.Landing + 0.3, C.Landing + 1, C.Landing + 4.2, C.Landing + 5], [0, 1, 1, 0]);
  if (op <= 0) return;
  const eqs = [['F = ma', 260, 170, -12], ['E = mc²', 480, 120, 8], ['∫ v dt', 330, 300, 6], ['Σ', 820, 210, -9], ['ΔV = ?', 700, 330, -5], ['√(GM/r)', 880, 420, 12]];
  ctx.save(); ctx.globalAlpha = op;
  ctx.fillStyle = INK; ctx.font = `34px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  eqs.forEach(([t, x, y, r], i) => {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(((r + Math.sin(T + i) * 4) * Math.PI) / 180);
    ctx.fillText(t, 0, Math.sin(T * 1.6 + i) * 10);
    ctx.restore();
  });
  ctx.fillStyle = AMBER;
  ctx.font = '700 80px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText('?', 560, 240 + Math.sin(T * 3) * 8);
  ctx.font = '700 52px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText('?', 630, 200 + Math.cos(T * 3) * 8);
  ctx.restore();
}

function drawShip(ctx, T) {
  const op = tw(T, [C.Detour, C.Detour + 0.8], [0, 1]);
  if (op <= 0) return;
  ctx.save(); ctx.globalAlpha = op;
  oval(ctx, 250, 640, 170, 16, 'rgba(168,67,45,0.7)');
  ctx.strokeStyle = METAL; ctx.lineWidth = 12; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(150, 560); ctx.lineTo(110, 636); ctx.moveTo(350, 560); ctx.lineTo(390, 636); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(120, 580); ctx.quadraticCurveTo(120, 330, 250, 250); ctx.quadraticCurveTo(380, 330, 380, 580); ctx.closePath();
  ctx.fillStyle = INK; ctx.fill();
  ctx.beginPath(); ctx.moveTo(120, 580); ctx.lineTo(380, 580); ctx.lineTo(380, 600); ctx.quadraticCurveTo(250, 620, 120, 600); ctx.closePath();
  ctx.fillStyle = METAL; ctx.fill();
  disc(ctx, 250, 380, 46, VISOR);
  ctx.beginPath(); ctx.arc(250, 380, 46, 0, Math.PI * 2); ctx.strokeStyle = METAL; ctx.lineWidth = 10; ctx.stroke();
  ctx.globalAlpha = op * 0.8; disc(ctx, 236, 366, 10, BLUE); ctx.globalAlpha = op;
  rr(ctx, 282, 450, 70, 120, 14, VISOR);
  ctx.beginPath(); ctx.moveTo(232, 250); ctx.quadraticCurveTo(250, 200, 268, 250); ctx.closePath(); ctx.fillStyle = MARS; ctx.fill();
  ctx.strokeStyle = METAL; ctx.lineWidth = 6; ctx.lineCap = 'butt';
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(352 + i * 8, 500 + i * 36); ctx.lineTo(380 + i * 8, 500 + i * 36); ctx.stroke(); }
  ctx.restore();
}

function drawWalker(ctx, T) {
  const t0 = C.Detour + 0.8;
  if (T < t0 || T > C.Settle + 1.5) return;
  const op = tw(T, [C.Settle, C.Settle + 1.5], [1, 0]);
  const x = tw(T, [t0, t0 + 1, t0 + 2, t0 + 2.6, C.LookingUp], [320, 400, 560, 640, 660]);
  const hop = T < t0 + 1 ? -Math.sin(clamp(T - t0, 0, 1) * Math.PI) * 60 : T < t0 + 2 ? -Math.abs(Math.sin((T - t0 - 1) * Math.PI * 2)) * 26 : 0;
  const baseY = tw(T, [t0, t0 + 1], [560, 640]);
  const trip = tw(T, [t0 + 2, t0 + 2.4, t0 + 3.2, t0 + 3.8], [0, -95, -95, 0], MOTION.pop);
  const sit = T > C.LookingUp ? tw(T, [C.LookingUp, C.LookingUp + 0.8], [0, 1]) : 0;
  const wave = T > C.Wonder - 1 && T < C.Wonder + 2 ? 40 + Math.sin(T * 8) * 30 : 0;
  const s = 1.3 * (1 - sit * 0.08);
  ctx.save(); ctx.globalAlpha = op;
  oval(ctx, x, 646, 40, 7, 'rgba(168,67,45,0.6)');
  drawAstro(ctx, x, baseY + hop + sit * 14, s, trip, wave);
  ctx.restore();
}

function drawDust(ctx, T, at, x, y) {
  const p = clamp((T - at) / 1.2, 0, 1);
  if (p <= 0 || p >= 1) return;
  ctx.save(); ctx.globalAlpha = 1 - p; ctx.fillStyle = MARS_L;
  for (const d of [-1, -0.4, 0.4, 1]) {
    ctx.beginPath();
    ctx.arc(x + d * 60 * p * 1.6, y - 18 * p - Math.abs(d) * 6, 10 + 24 * p * (1 - Math.abs(d) * 0.3), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawDetourSign(ctx, T) {
  const p = clamp(tw(T, [C.Detour + 3.6, C.Detour + 4.2], [0, 1], MOTION.pop), 0, 1.2);
  const op = tw(T, [C.LookingUp + 1, C.LookingUp + 2], [1, 0]);
  if (p <= 0 || op <= 0) return;
  const wob = -4 + Math.sin(T * 5) * 2 * (1 - clamp(T - C.Detour - 4.2, 0, 1));
  ctx.save(); ctx.globalAlpha = op;
  ctx.translate(900, 640); ctx.scale(1, p); ctx.rotate((wob * Math.PI) / 180);
  ctx.strokeStyle = 'rgba(246,239,228,0.6)'; ctx.lineWidth = 3; ctx.setLineDash([8, 12]);
  ctx.beginPath(); ctx.moveTo(-280, 0); ctx.quadraticCurveTo(-160, -40, -80, -10); ctx.quadraticCurveTo(0, 20, 80, -70); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#c9a06a'; ctx.fillRect(-5, -110, 10, 110);
  rr(ctx, -90, -150, 180, 52, 8, AMBER);
  ctx.fillStyle = NAVY; ctx.font = `700 26px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
  ctx.fillText('DETOUR →', 0, -114);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.restore();
}

function drawEarthDot(ctx, T) {
  const op = tw(T, [C.StudyStars, C.StudyStars + 1, C.Settle + 1, C.Settle + 2.5], [0, 1, 1, 0]);
  if (op <= 0) return;
  ctx.save(); ctx.globalAlpha = op;
  disc(ctx, 220, 170, 18, 'rgba(159,211,255,0.2)'); disc(ctx, 220, 170, 7, '#9fd3ff');
  ctx.restore();
}

function drawShootingStar(ctx, T, at) {
  const p = clamp((T - at) / 0.9, 0, 1);
  if (p <= 0 || p >= 1) return;
  const x = 380 + p * 520, y = 120 + p * 170;
  ctx.save();
  ctx.globalAlpha = Math.sin(p * Math.PI); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - 120, y - 40); ctx.lineTo(x, y); ctx.stroke();
  ctx.restore();
}

/** One frame of the film at authored time T, in the film's 1200x1000 space. */
function drawFilm(ctx, T) {
  // camera: shake on touchdown, tilt when landing crooked, pan up to the sky
  const td = C.Landing + 2.6;
  const shake = T > td && T < td + 0.6 ? Math.sin(T * 60) * 10 * (1 - (T - td) / 0.6) : 0;
  const tilt = tw(T, [td - 0.2, td, td + 0.5, C.Detour], [0, -7, -5, 0], MOTION.drift);
  const pan = tw(T, [C.LookingUp + 0.6, C.Wonder + 0.5, C.Settle + 1, C.Settle + 3], [0, 150, 150, 900], MOTION.drift);
  const ceilMix = tw(T, [C.Settle + 1, C.Settle + 3.5], [0, 1]);

  ellipseGradient(ctx, 600, 450, 900, 750, [[0, '#1d1b4c'], [1, '#0e1028']], 1.5);
  if (ceilMix > 0.001) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, NAVY); g.addColorStop(1, '#2a2160');
    ctx.save(); ctx.globalAlpha = ceilMix; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
  }

  ctx.save();
  ctx.translate(shake, pan + shake * 0.5);
  ctx.translate(CX, 620); ctx.rotate((tilt * Math.PI) / 180); ctx.translate(-CX, -620);
  if (T > C.Detour) drawSkyStars(ctx, T, pan); else drawStarfield(ctx, T);
  drawEarthDot(ctx, T);
  drawShootingStar(ctx, T, C.Wonder + 1);
  drawShootingStar(ctx, T, C.Settle + 0.6);
  if (T < C.Landing + 3.2) drawMars(ctx, T);
  drawGround(ctx, T);
  drawDust(ctx, T, td - 0.1, 600, 700);
  drawShip(ctx, T);
  drawDetourSign(ctx, T);
  drawWalker(ctx, T);
  drawDust(ctx, T, C.Detour + 1.8, 400, 650);
  drawDust(ctx, T, C.Detour + 3.2, 600, 650);
  ctx.restore();

  drawPhysicsGag(ctx, T);
}

// ---------------------------------------------------------------------------

export class Mars {
  constructor(scene) {
    const P = M.plane;
    const w = P.x[1] - P.x[0], d = P.z[1] - P.z[0];

    this.canvas = document.createElement('canvas');
    this.canvas.width = M.canvas.width; this.canvas.height = M.canvas.height;
    this.g = this.canvas.getContext('2d');

    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.minFilter = THREE.LinearFilter; this.tex.magFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;

    const mat = new THREE.MeshBasicMaterial({
      map: this.tex, transparent: true, opacity: 0, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    // Flat, facing down at whoever is lying under it. DoubleSide covers any
    // sign error in this rotation rather than risking an invisible plane.
    this.mesh.rotation.set(Math.PI / 2, 0, 0);   // bed view looks toward -z (yaw 0): canvas top -> +z, right -> +x
    this.mesh.position.set((P.x[0] + P.x[1]) / 2, P.y, (P.z[0] + P.z[1]) / 2);
    // The room dims while the film plays and the light comes back after it.
    this.dimEl = document.createElement('div');
    this.dimEl.style.cssText = 'position:fixed;inset:0;z-index:30;pointer-events:none;background:#04050d;opacity:0';
    document.body.appendChild(this.dimEl);
    this.mesh.name = 'Mars_Ceiling_overlay';
    this.mesh.visible = false;
    scene.add(this.mesh);

    // The real hanging-star-strings mesh above the bed — faded out while the
    // overlay is up, faded back in as it settles. Cloned materials so this
    // doesn't fight anything else that touches `Stars`.
    this.stars = findByName(scene, M.starsMesh ?? 'Stars');
    if (this.stars) {
      this.stars.traverse((o) => {
        if (!o.material) return;
        o.material = o.material.clone();
        o.material.transparent = true;
      });
    }

    this.playing = false;    // the film clock is running
    this.T = 0;              // film time in seconds (frozen while fading out)
    this._hud = false;       // last frame's trigger, for edge detection
    this.reveal = 0;         // 0 = real ceiling showing, 1 = overlay opaque
    this._revFrom = 0; this._revTo = 0; this._revDur = null; this._revT = 0;
  }

  startRevealTo(target, dur) {
    this._revFrom = this.reveal; this._revTo = target; this._revDur = dur; this._revT = 0;
  }
  stepReveal(dt) {
    if (this._revDur == null) return;
    this._revT += dt;
    const p = ease01(this._revT, this._revDur);
    this.reveal = lerp(this._revFrom, this._revTo, p);
    if (p >= 1) this._revDur = null;
  }
  setStarsOpacity(v) {
    if (!this.stars) return;
    // The real Stars mesh hangs as physical 3D strings, so a flat overlay
    // can't occlude it from every angle — fade it at `starsFadeMul`× the
    // overlay's speed so it's gone well before the cartoon sky is prominent.
    // `v` is the stars' target opacity (1 - reveal); the fast fade runs on
    // what's been taken away, (1 - v).
    const fast = Math.max(0, 1 - (1 - v) * (M.starsFadeMul ?? 2));
    this.stars.traverse((o) => { if (o.material) o.material.opacity = fast; });
    this.stars.visible = fast > 0.01;
  }

  draw(T) {
    const ctx = this.g, S = this.canvas.width / W;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.save();
    ctx.scale(S, S);
    drawFilm(ctx, T);
    ctx.restore();
    this.tex.needsUpdate = true;
  }

  /**
   * Called every frame from main.js's step().
   *   hudActive  true while the mars story HUD is the one running. Its rising
   *              edge starts the film; after that the film runs by itself.
   *   onBed      false once the visitor has stood up — cuts the film short
   *              with the quick `exit` fade.
   */
  sync(dt, hudActive, onBed = true) {
    if (hudActive && !this._hud && !this.playing) {
      this.playing = true; this.T = 0;
      this.startRevealTo(1, M.dissolve ?? 1.4);
    }
    this._hud = !!hudActive;

    if (this.playing) {
      this.T += dt * (M.speed ?? 1);
      if (!onBed) { this.playing = false; this.startRevealTo(0, M.exit ?? 0.6); }
      else if (this.T >= TOTAL) { this.T = TOTAL; this.playing = false; this.startRevealTo(0, M.settle ?? 1.8); }
    }
    this.stepReveal(dt);
    this.mesh.material.opacity = this.reveal;
    this.mesh.visible = this.playing || this.reveal > 0.001;
    this.setStarsOpacity(1 - this.reveal);
    this.dimEl.style.opacity = String(this.reveal * (M.dim ?? 0.6));
    if (this.mesh.visible) this.draw(this.T);
  }
}

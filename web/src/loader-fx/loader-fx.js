// loader-fx.js — the loading screen builds the house (Session 69b).
//
// While MeraGHAR.glb downloads and main.js builds the scene, a voxel copy
// of the same house assembles itself, block by block, from the ground up,
// slowly turning on a turntable. The blocks are the real house: its
// surface, voxelized offline from MeraGHAR.glb with the model's own
// colours (house-voxels.js, about 70 KB). So what builds here is the house
// you're about to walk into, not a generic one.
//
// The build follows the real progress: the download drives most of it,
// setup creeps it on, and finish() lays the last blocks. Then dusk falls,
// the windows light up one by one, and the camera swings round to the
// front door and comes down to eye level. That's roughly the porch
// camera's framing, so when the loader fades, the blocks dissolve into the
// real porch shot. Click or press a key to skip the ending.
//
// It's drawn on a plain 2D canvas with no three.js, so it runs while
// three.js itself is still downloading. It's loaded as its own module,
// before main.js. With prefers-reduced-motion it shows the finished house,
// still.

import { HOUSE } from './house-voxels.js';

// ---- tuning -----------------------------------------------------------------
const SPIN = 0.16;            // rad/s — the turntable
const ELEV = 0.52;            // rad — how far above the house we look from while it builds
const DROP = 5;               // blocks fall from this many blocks up
const DROP_T = 0.42;          // s — one block's fall
const BUILD_MAX = 2600;       // blocks/s at most, so even a fast load reads as building (~4 s for the house)
const DOOR = [-17.1, 2.6, -23.25];   // the front door (Door node), world units
const PORCH_VIEW_H = 16;      // world units visible top to bottom at the end ≈ the porch shot
const SORT_BUCKETS = 4096;    // depth buckets for the far-to-near counting sort (a bucket is ~0.02 of a block)
const LIGHT = norm([-0.55, 0.8, -0.35]);   // sun from the south-west, fixed in the world

function norm(v) { const l = Math.hypot(...v); return v.map((x) => x / l); }
const clamp01 = (k) => Math.max(0, Math.min(1, k));
const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const lerp = (a, b, k) => a + (b - a) * k;
const angLerp = (a, b, k) => { const d = ((b - a) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI; return a + d * k; };

// ---- decode the house -------------------------------------------------------
function decode(h) {
  const bin = atob(h.data);
  const n = bin.length / 5;
  const P = h.pitch, [ox, oy, oz] = h.origin, [DX, DY, DZ] = h.dims;
  const X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n);
  const col = new Uint8Array(n), flag = new Uint8Array(n), mask = new Uint8Array(n);
  const gi = new Int32Array(n * 3);
  const occ = new Uint8Array(DX * DY * DZ);
  const at = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= DX || y >= DY || z >= DZ ? 0 : occ[(x * DY + y) * DZ + z]);
  for (let i = 0; i < n; i++) {
    const x = bin.charCodeAt(i * 5), y = bin.charCodeAt(i * 5 + 1), z = bin.charCodeAt(i * 5 + 2);
    gi[i * 3] = x; gi[i * 3 + 1] = y; gi[i * 3 + 2] = z;
    X[i] = ox + (x + 0.5) * P; Y[i] = oy + (y + 0.5) * P; Z[i] = oz + (z + 0.5) * P;
    col[i] = bin.charCodeAt(i * 5 + 3); flag[i] = bin.charCodeAt(i * 5 + 4);
    occ[(x * DY + y) * DZ + z] = 1;
  }
  // which of the 6 faces are exposed: +x -x +y -y +z -z
  for (let i = 0; i < n; i++) {
    const x = gi[i * 3], y = gi[i * 3 + 1], z = gi[i * 3 + 2];
    mask[i] = (!at(x + 1, y, z) ? 1 : 0) | (!at(x - 1, y, z) ? 2 : 0) | (!at(x, y + 1, z) ? 4 : 0) |
              (!at(x, y - 1, z) ? 8 : 0) | (!at(x, y, z + 1) ? 16 : 0) | (!at(x, y, z - 1) ? 32 : 0);
  }
  return { n, P, X, Y, Z, col, flag, mask, gy: (i) => gi[i * 3 + 1] };
}

// face shading, fixed in the world so the light doesn't swing with the turntable
const FACES = [
  { bit: 1,  n: [1, 0, 0] }, { bit: 2,  n: [-1, 0, 0] },
  { bit: 4,  n: [0, 1, 0] }, { bit: 8,  n: [0, -1, 0] },
  { bit: 16, n: [0, 0, 1] }, { bit: 32, n: [0, 0, -1] },
];
for (const f of FACES) {
  const d = f.n[0] * LIGHT[0] + f.n[1] * LIGHT[1] + f.n[2] * LIGHT[2];
  f.shade = 0.58 + 0.42 * Math.max(0, d) + (f.n[1] > 0 ? 0.04 : 0);
  // the 4 corners of this face, as ±1 offsets from the block's centre
  const [a, b, c] = f.n;
  const axis = a ? 0 : b ? 1 : 2, s = a || b || c;
  const u = axis === 0 ? 1 : 0, v = axis === 2 ? 1 : 2;
  f.corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([p, q]) => {
    const o = [0, 0, 0]; o[axis] = s; o[u] = p; o[v] = q; return o;
  });
}

class HouseLoader {
  constructor(root) {
    this.root = root;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    root.classList.add('fx');
    root.insertAdjacentHTML('afterbegin', '<canvas id="lfxStage" aria-hidden="true"></canvas>');
    this.canvas = root.querySelector('#lfxStage');
    this.ctx = this.canvas.getContext('2d');
    this.bar = root.querySelector('#bar');

    const H = this.h = decode(HOUSE);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < H.n; i++) {
      x0 = Math.min(x0, H.X[i]); x1 = Math.max(x1, H.X[i]);
      y0 = Math.min(y0, H.Y[i]); y1 = Math.max(y1, H.Y[i]);
      z0 = Math.min(z0, H.Z[i]); z1 = Math.max(z1, H.Z[i]);
    }
    this.centre = [(x0 + x1) / 2, (y0 + y1) / 2 - 2, (z0 + z1) / 2];
    this.radius = Math.hypot(x1 - x0, z1 - z0) / 2;
    this.height = y1 - y0;

    // Build order: bottom layer first, and within a layer a soft random
    // sweep, so it reads as being laid, not printed.
    const order = Array.from({ length: H.n }, (_, i) => i);
    const jit = new Float32Array(H.n);
    for (let i = 0; i < H.n; i++) jit[i] = Math.random() * 0.9 + (H.X[i] - x0) / (x1 - x0) * 0.3;
    order.sort((a, b) => (H.gy(a) + jit[a]) - (H.gy(b) + jit[b]));
    this.order = order;
    this.placedAt = new Float32Array(H.n).fill(-1);
    this.placed = 0;

    this.pal = HOUSE.pal.map((h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]);
    this.windows = [];
    for (let i = 0; i < H.n; i++) if (H.flag[i] === 1) this.windows.push(i);
    this.winDelay = new Float32Array(H.n);
    for (const i of this.windows) this.winDelay[i] = Math.random() * 0.9;

    this.idx = new Uint32Array(H.n);
    this.sorted = new Uint32Array(H.n);
    this.keys = new Uint16Array(H.n);
    this.counts = new Uint32Array(SORT_BUCKETS + 1);
    this.m = 0;
    this.depth = new Float32Array(H.n);
    this.q = 1;                 // render scale; drops if the machine can't hold the frame rate
    this._n = 0;
    this.yaw = 0.75;
    this.fit = this.fit.bind(this);
    addEventListener('resize', this.fit);
    this.fit();
    if (this.reduced) { this.placed = H.n; this.placedAt.fill(-99); }
    this.raf = requestAnimationFrame((t) => this.tick(t));
  }

  fit() {
    const dpr = Math.min(1.5, devicePixelRatio || 1) * (this.q ?? 1);
    this.canvas.width = Math.round(innerWidth * dpr);
    this.canvas.height = Math.round(innerHeight * dpr);
    this.W = this.canvas.width; this.H = this.canvas.height;
  }

  /** main.js: the house is ready. Resolves when the loader can lift. */
  finish() {
    if (this._done) return this._done;
    this._done = new Promise((res) => { this._resolve = res; });
    this.finishing = performance.now() / 1000;
    const skip = () => { this.skipped = true; };
    addEventListener('pointerdown', skip, { once: true });
    addEventListener('keydown', skip, { once: true });
    if (this.reduced) { const r = this._resolve; this._resolve = null; r(); }
    return this._done;
  }

  /** How far the build should be: the download drives most of it, setup the rest. */
  target(now) {
    if (this.finishing) return 1;
    const pct = parseFloat(this.bar?.style.width) || 0;
    if (pct < 100) return 0.82 * pct / 100;
    if (!this.setupStart) this.setupStart = now;     // downloaded; main.js is setting up
    return 0.82 + 0.15 * (1 - Math.exp(-(now - this.setupStart) / 2.5));
  }

  tick(ms) {
    const now = ms / 1000;
    // Last resort on a very slow machine: draw every other frame, which leaves
    // the main thread to the model download and parse. (Not during the ending.)
    if (this.half && this.endAt == null && (this._skip = !this._skip)) {
      this.raf = requestAnimationFrame((t) => this.tick(t));
      return;
    }
    const rawDt = now - (this._last ?? now);
    const dt = Math.min(0.05, rawDt); this._last = now;
    this._n++;
    // A slow machine (the GLB is also being parsed on this same thread) gets a
    // smaller canvas, then a halved frame rate: the blocks are chunky and the
    // turntable slow, so both still read fine.
    if (!this.reduced && rawDt > 0) {
      this._ema = this._ema == null ? rawDt : this._ema * 0.9 + rawDt * 0.1;
      if (this._n > 30 && !this.half) {
        if (this._ema > (this.q <= 0.5 ? 0.05 : 0.034)) {
          this._ema = null; this._n = 0;
          if (this.q > 0.5) { this.q = Math.max(0.5, this.q - 0.25); this.fit(); } else this.half = true;
        }
      }
    }
    const H = this.h;

    // --- build ---
    const want = Math.round(this.target(now) * H.n);
    const rate = this.finishing ? BUILD_MAX * 1.6 : BUILD_MAX;
    const upto = Math.min(want, this.placed + Math.max(1, Math.round(rate * dt)));
    for (; this.placed < upto; this.placed++) this.placedAt[this.order[this.placed]] = now;

    // --- the ending: dusk, windows, swing round to the door ---
    const built = this.placed >= H.n;
    if (this.finishing && built && this.endAt == null) this.endAt = now + DROP_T;
    const e = this.endAt != null ? now - this.endAt : -1;
    const dusk = e < 0 ? 0 : clamp01(e / 0.8);
    const cam = e < 0 ? 0 : easeInOut(clamp01((e - 1.1) / 2.2));

    // --- camera ---
    if (!this.reduced && e < 0) this.yaw += SPIN * dt;
    if (e >= 0 && this.yawAtEnd == null) this.yawAtEnd = this.yaw;
    const fitScale = Math.min(this.W / (this.radius * 2.2), this.H / (this.height * 1.4 + this.radius * 0.75));
    const endScale = Math.min(this.H / PORCH_VIEW_H, this.W / (PORCH_VIEW_H * 1.4));   // tall phones: frame by width
    const yaw = e < 0 ? this.yaw : angLerp(this.yawAtEnd, -Math.PI / 2, cam);
    const elev = lerp(ELEV, 0.02, cam);
    const scale = fitScale * Math.pow(endScale / fitScale, cam);   // a steady zoom, not a lurch
    const tx = lerp(this.centre[0], DOOR[0], cam), ty = lerp(this.centre[1], DOOR[1], cam), tz = lerp(this.centre[2], DOOR[2], cam);
    const cy = Math.cos(yaw), sy = Math.sin(yaw), ce = Math.cos(elev), se = Math.sin(elev);
    const cx0 = this.W / 2, cy0 = this.H * lerp(0.53, 0.5, cam);

    // --- sort far to near ---
    // The turntable is slow, so the order only needs refreshing every few
    // frames (or sooner when the camera really moves, as in the ending). It's
    // a counting sort on quantised depth: O(n), where a comparator sort of
    // ~10k blocks every frame was the main cost.
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    const P = H.P;
    const moved = this._sy == null || Math.abs(yaw - this._sy) > 0.01 || Math.abs(elev - this._se) > 0.01 ||
      Math.abs(tx - this._stx) + Math.abs(ty - this._sty) + Math.abs(tz - this._stz) > 0.05;
    if (moved || this._n % 3 === 0) {
      this._sy = yaw; this._se = elev; this._stx = tx; this._sty = ty; this._stz = tz;
      const depth = this.depth, idx0 = this.idx;
      let n0 = 0, dmin = Infinity, dmax = -Infinity;
      for (let i = 0; i < H.n; i++) {
        if (this.placedAt[i] < -50 && !this.reduced) continue;
        if (this.placedAt[i] < 0 && this.placedAt[i] > -50) continue;
        const dx = H.X[i] - tx, dz = H.Z[i] - tz;
        const d = (dx * sy + dz * cy) * ce + (H.Y[i] - ty) * se;
        depth[i] = d;
        if (d < dmin) dmin = d;
        if (d > dmax) dmax = d;
        idx0[n0++] = i;
      }
      const counts = this.counts, keys = this.keys, out = this.sorted;
      counts.fill(0);
      const kk = (SORT_BUCKETS - 1) / Math.max(1e-6, dmax - dmin);
      for (let j = 0; j < n0; j++) { const b = ((depth[idx0[j]] - dmin) * kk) | 0; keys[j] = b; counts[b + 1]++; }
      for (let b = 1; b <= SORT_BUCKETS; b++) counts[b] += counts[b - 1];
      for (let j = 0; j < n0; j++) out[counts[keys[j]]++] = idx0[j];
      this.m = n0;
    }
    const m = this.m, idx = this.sorted;

    // corner offsets of each visible face, for this view
    const half = P * 0.5 * 1.04;       // a hair over half, so neighbouring faces overlap: no seams
    const faces = [];
    let seen = 0;                       // side faces turned toward us, as bits
    let visMask = 0;                    // every face turned toward us, as bits
    for (const f of FACES) {
      const [a, b, c] = f.n;
      if ((a * sy + c * cy) * ce + b * se <= 0.001) continue;      // facing away
      if (!b) seen |= f.bit;
      visMask |= f.bit;
      faces.push({
        bit: f.bit, shade: f.shade,
        pts: f.corners.map(([x, y, z]) => {
          const ox = x * half, oy = y * half, oz = z * half;
          return [(ox * cy - oz * sy) * scale, ((ox * sy + oz * cy) * se - oy * ce) * scale];
        }),
      });
    }

    const pal = this.pal, dim = 1 - dusk * 0.3;
    for (let j = 0; j < m; j++) {
      const i = idx[j];
      if (!(H.mask[i] & visMask)) continue;     // buried from this side: nothing to draw
      const k = this.reduced ? 1 : clamp01((now - this.placedAt[i]) / DROP_T);
      const fall = (1 - easeOut(k)) * DROP * P;
      const dx = H.X[i] - tx, dy = H.Y[i] + fall - ty, dz = H.Z[i] - tz;
      const sx = cx0 + (dx * cy - dz * sy) * scale;
      const sy2 = cy0 + ((dx * sy + dz * cy) * se - dy * ce) * scale;
      if (sx < -200 || sx > this.W + 200 || sy2 < -200 || sy2 > this.H + 200) continue;
      const [r, g, b] = pal[H.col[i]];
      // windows (and the porch lamp) light one by one; then the front door glows, the last to light
      const lit = e < 0 ? 0 : H.flag[i] === 1 ? clamp01((e - 0.35 - this.winDelay[i]) / 0.25)
        : H.flag[i] === 2 ? 0.8 * clamp01((e - 1.4) / 0.6) : 0;
      ctx.globalAlpha = k < 1 ? 0.3 + 0.7 * k : 1;
      for (const f of faces) {
        if (!(H.mask[i] & f.bit)) continue;
        const s = f.shade * dim;
        ctx.fillStyle = `rgb(${lerp(r * s, 255, lit) | 0},${lerp(g * s, 212, lit) | 0},${lerp(b * s, 138, lit) | 0})`;
        const p = f.pts;
        ctx.beginPath();
        ctx.moveTo(sx + p[0][0], sy2 + p[0][1]);
        ctx.lineTo(sx + p[1][0], sy2 + p[1][1]);
        ctx.lineTo(sx + p[2][0], sy2 + p[2][1]);
        ctx.lineTo(sx + p[3][0], sy2 + p[3][1]);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // a soft glow round each lit window
    if (e >= 0.3) {
      ctx.globalCompositeOperation = 'lighter';
      const rad = P * scale * 1.7;
      for (const i of this.windows) {
        const lit = clamp01((e - 0.35 - this.winDelay[i]) / 0.25);
        if (!lit || !(H.mask[i] & seen)) continue;     // only panes on the side facing us glow
        const dx = H.X[i] - tx, dy = H.Y[i] - ty, dz = H.Z[i] - tz;
        const sx = cx0 + (dx * cy - dz * sy) * scale;
        const sy2 = cy0 + ((dx * sy + dz * cy) * se - dy * ce) * scale;
        const g = ctx.createRadialGradient(sx, sy2, 0, sx, sy2, rad);
        g.addColorStop(0, `rgba(255,186,105,${0.13 * lit})`); g.addColorStop(1, 'rgba(255,186,105,0)');
        ctx.fillStyle = g; ctx.fillRect(sx - rad, sy2 - rad, rad * 2, rad * 2);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    this.root.style.setProperty('--lfx-dusk', dusk.toFixed(3));
    this.root.style.setProperty('--lfx-cam', cam.toFixed(3));

    // done once the camera is at the door, or right away on a skip
    if (this._resolve && (e > 3.4 || (this.skipped && now - this.finishing > 0.2))) {
      const r = this._resolve; this._resolve = null; r();
    }

    if (this.root.classList.contains('gone')) {
      this._goneAt ??= now;
      if (now - this._goneAt > 1) return;          // faded out: stop drawing
    }
    this.raf = requestAnimationFrame((t) => this.tick(t));
  }
}

const root = document.getElementById('loader');
if (root) window.MeraLoader = new HouseLoader(root);

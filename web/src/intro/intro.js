// intro.js — the porch intro.
//
// Three parts, usable separately:
//   IntroOverlay  – DOM: typewriter beats in DotGothic16, then the two-column
//                   "hire / explore" choice. No three.js in here.
//   PorchGreeter  – three.js: Apoorva's waving pixel sprite standing on the
//                   porch, billboarded to face the camera (yaw only).
//   IntroCamera   – holds the camera on a pulled-back porch shot during the
//                   intro, then eases it back to wherever the walker has it.
//
// startIntro() wires all three and is what main.js calls.
// Everything tunable lives in CONFIG.porchIntro (config.js). Wired in main.js, Session 26.

import { glassifyPanel } from '../glassify/glassify.js';
import { playSfx, typeTick } from '../sfx/sfx.js';

// ───────────────────────── frame clock (shared) ─────────────────────────
// Frames in greeting_spritesheet.png, left to right.
export const FRAME = { IDLE: 0, RAISE: 1, WAVE_A: 2, WAVE_B: 3 };

export class FrameClock {
  constructor(onFrame) { this.onFrame = onFrame; this.queue = []; this.t = 0; this.frame = -1; this.set(FRAME.IDLE); }
  set(f) { if (f !== this.frame) { this.frame = f; this.onFrame(f); } }
  // Raise the hand, wave `times` back-and-forths, lower it.
  wave(times = 3, { raise = 0.11, swing = 0.23 } = {}) {
    const q = [[FRAME.RAISE, raise]];
    for (let i = 0; i < times; i++) q.push([FRAME.WAVE_A, swing], [FRAME.WAVE_B, swing]);
    q.push([FRAME.RAISE, raise], [FRAME.IDLE, 0]);
    this.queue = q; this.t = 0; this.set(q[0][0]);
  }
  get waving() { return this.queue.length > 0; }
  update(dt) {
    if (!this.queue.length) return;
    this.t += dt;
    while (this.queue.length && this.t >= this.queue[0][1]) {
      this.t -= this.queue[0][1]; this.queue.shift();
      if (this.queue.length) this.set(this.queue[0][0]);
    }
    if (!this.queue.length) this.set(FRAME.IDLE);
  }
}

// ───────────────────────────── the copy ─────────────────────────────
// Straight quotes on purpose: DotGothic16 draws ’ and … full-width (CJK), which
// leaves a big gap in "I’m".
// size: xl = the big lines, lg = "just a bit smaller than big",
//       md = normal, sm = small, sub = the subtitle-ish line.
export const INTRO_BEATS = [
  [
    { text: "Hey, I'm", size: 'xl' },
    { text: '*Apoorva Gramle.*', size: 'xl' },
    { text: 'Welcome home.', size: 'sub' },
  ],
  [
    { text: 'Okay... before you come in,', size: 'sm' },
    { text: 'there are a few *house rules*.', size: 'sm' },
    { text: '*HOUSE RULES*', size: 'xl', gap: true },
    { text: 'Collect the *stars*.', size: 'lg', reveal: 'word' },
    { text: 'Keep your *eyes open*.', size: 'lg', reveal: 'word' },
    { text: "And *don't rush*.", size: 'lg', reveal: 'word' },
  ]
];

export const INTRO_CHOICES = [
  { id: 'hire',    img: 'src/assets/icons/bag.png', title: 'Wanna hire me?', sub: 'Start with my work.' },
  { id: 'explore', img: 'src/assets/icons/mag.png', title: 'Explore',        sub: "See what I'm like beyond the résumé" },
];

// ───────────────────────────── styles ─────────────────────────────
const FONT_HREF = 'https://fonts.googleapis.com/css2?family=DotGothic16&display=swap';

// *word* in a line = highlighted in pink.
function parseMarks(text) {
  return text.split('*').map((t, i) => ({ chars: Array.from(t), hl: i % 2 === 1 })).filter((s) => s.chars.length);
}
function charAt(row, k) {
  for (const s of row.segs) { if (k < s.chars.length) return s.chars[k]; k -= s.chars.length; }
  return '';
}
// Draw a line with its first n characters shown; the rest is laid out but
// transparent, so wrapping never jumps while it types.
function paint(row, n) {
  const frag = document.createDocumentFragment();
  const add = (str, cls) => { if (!str) return; const s = document.createElement('span'); s.className = cls; s.textContent = str; frag.append(s); };
  const rest = [];
  let left = n;
  for (const s of row.segs) {
    const k = Math.max(0, Math.min(left, s.chars.length));
    add(s.chars.slice(0, k).join(''), s.hl ? 'hl' : 'tx');
    rest.push([s.chars.slice(k).join(''), s.hl]);
    left -= s.chars.length;
  }
  const caret = document.createElement('i'); caret.className = 'caret'; frag.append(caret);
  for (const [t, hl] of rest) add(t, hl ? 'rest hl' : 'rest');
  row.p.replaceChildren(frag);
}

// Word-reveal tokenizer: any word carrying a '*' anywhere is pink, and the
// asterisks are stripped for display. Handles multi-word phrases like
// "*eyes open*" naturally, since each word keeps its own marker.
function wordTokens(text) {
  return text.split(' ').filter(Boolean).map((raw) => ({ text: raw.replace(/\*/g, ''), hl: raw.includes('*') }));
}

function ensureFontAndStyle() {
  if (!document.querySelector(`link[href="${FONT_HREF}"]`)) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = FONT_HREF; document.head.append(l);
  }
}

// ───────────────────────────── overlay ─────────────────────────────
export class IntroOverlay {
  constructor({ beats = INTRO_BEATS, choices = INTRO_CHOICES, typeMs = 42, linePauseMs = 420,
                beatFadeMs = 280, wordDelayMs = 110, hintText = null, onBeat = () => {}, onChoicesShown = () => {} } = {}) {
    Object.assign(this, { beats, choices, typeMs, linePauseMs, beatFadeMs, wordDelayMs, onBeat, onChoicesShown });
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.coarse = matchMedia('(pointer: coarse)').matches;
    this.hintText = hintText || (this.coarse ? 'tap to continue' : 'click or press space to continue');
    this.typing = false; this.skip = false; this._wake = null; this.beat = -1; this.atChoice = false;
  }

  // Resolves with the chosen id ('hire' | 'explore').
  run() {
    ensureFontAndStyle();
    const root = this.root = document.createElement('div');
    root.className = 'intro';
    root.innerHTML = `<div class="intro-scrim"></div><div class="intro-dim"></div>
      <div class="intro-text" aria-live="polite"></div>
      <div class="intro-choice" hidden role="group" aria-label="Where to start"></div>
      <div class="intro-hint"></div>`;
    document.body.append(root);
    this.textEl = root.querySelector('.intro-text');
    this.hintEl = root.querySelector('.intro-hint');
    this.hintEl.textContent = this.hintText;
    this.choiceEl = root.querySelector('.intro-choice');
    for (const c of this.choices) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = `intro-tile ${c.id}`; b.dataset.id = c.id;
      b.innerHTML = `<span class="t-icon" aria-hidden="true"><img src="${c.img}" alt="" draggable="false"></span>` +
        `<span class="t-title"></span><span class="t-sub"></span><span class="t-hem" aria-hidden="true"></span>`;
      b.querySelector('.t-title').textContent = c.title;
      b.querySelector('.t-sub').textContent = c.sub;
      this.choiceEl.append(b);
    }

    this._onPointer = (e) => { if (!e.target.closest('.intro-tile')) this.advance(); };
    this._onKey = (e) => {
      if (e.target?.closest?.('#introEdit')) return;   // typing in the ?introedit panel
      e.stopPropagation();
      if (this.atChoice) { this.choiceKey(e); return; }
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); this.usedKeys = true; this.advance(); }
    };
    root.addEventListener('pointerdown', this._onPointer);
    window.addEventListener('keydown', this._onKey, true);

    return new Promise((resolve) => {
      this._resolve = resolve;
      this.choiceEl.addEventListener('click', (e) => {
        const b = e.target.closest('.intro-tile'); if (!b || this.chosen) return;
        this.chosen = true;
        this.finish(); resolve(b.dataset.id);
      });
      this.nextBeat();
    });
  }

  /** Session 54: pick a choice from outside the overlay (the navbar map,
   *  used before the visitor has picked Hire me / Explore). */
  choose(id) {
    if (this.chosen || !this._resolve) return false;
    this.chosen = true;
    this.finish();
    this._resolve(id);
    return true;
  }

  advance() {
    if (this.atChoice || this.turning) return;
    if (this.typing) { this.skip = true; this._wake?.(); return; }
    this.nextBeat();
  }

  wait(ms) {
    if (this.skip || this.reduced) return Promise.resolve();
    return new Promise((r) => { const id = setTimeout(done, ms); function done() { clearTimeout(id); r(); } this._wake = done; });
  }

  charDelay(ch) {
    if (ch === '…') return this.typeMs * 6;
    if ('.!?'.includes(ch)) return this.typeMs * 5;
    if (',;:'.includes(ch)) return this.typeMs * 3;
    return this.typeMs;
  }

  async nextBeat() {
    this.hintEl.classList.remove('show');
    this.beat++;
    if (this.beat >= this.beats.length) return this.showChoices();
    this.turning = true;
    if (this.beat > 0) {
      // The typewriter carriage-return sits in the gap between verses.
      this.textEl.classList.add('out');
      playSfx('typewriterScroll');
      await new Promise(r => setTimeout(r, this.reduced ? 0 : Math.max(this.beatFadeMs, 900)));
    }
    this.onBeat(this.beat);
    this.turning = false;
    await this.typeBeat(this.beats[this.beat]);
    this.hintEl.classList.add('show');
  }

  async typeBeat(lines) {
    this.textEl.textContent = ''; this.textEl.classList.remove('out');
    this.typing = true; this.skip = false;
    const rows = lines.map((l) => {
      const p = document.createElement('p');
      p.className = `s-${l.size}${l.gap ? ' gap' : ''}`;
      this.textEl.append(p);
      if (l.reveal === 'word') return { p, mode: 'word', text: l.text };
      const segs = parseMarks(l.text);
      const row = { p, mode: 'char', segs, len: segs.reduce((n, s) => n + s.chars.length, 0) };
      paint(row, 0);
      return row;
    });
    for (const r of rows) {
      r.p.classList.add('on');
      if (r.mode === 'word') {
        await this.typeWordRow(r);
      } else {
        for (let i = 1; i <= r.len && !this.skip && !this.reduced; i++) {
          paint(r, i);
          typeTick(charAt(r, i - 1));   // keystroke lands with the letter
          await this.wait(this.charDelay(charAt(r, i - 1)));
        }
        paint(r, r.len);
      }
      if (r !== rows[rows.length - 1]) { r.p.classList.remove('on'); await this.wait(this.linePauseMs); }
    }
    this.typing = false; this.skip = false;
  }

  // Pops each word in one at a time — a snappier rhythm than the letter
  // typewriter, which suits a short list like the house rules.
  async typeWordRow(r) {
    const words = wordTokens(r.text);
    const frag = document.createDocumentFragment();
    const spans = words.map((w, i) => {
      const s = document.createElement('span');
      s.className = 'w' + (w.hl ? ' hl' : '');
      s.textContent = w.text;
      frag.append(s);
      if (i < words.length - 1) frag.append(document.createTextNode(' '));
      return s;
    });
    r.p.replaceChildren(frag);
    for (const s of spans) {
      if (this.skip || this.reduced) { spans.forEach((x) => x.classList.add('in')); break; }
      s.classList.add('in');
      typeTick();
      await this.wait(this.wordDelayMs);
    }
  }

  showChoices() {
    this.atChoice = true;
    this.textEl.classList.add('out');
    this.root.classList.add('choosing');
    this.choiceEl.hidden = false;
    // Liquid glass on each card — the house's shared panel tuning (glassify.js).
    this.glass = [...this.choiceEl.querySelectorAll('.intro-tile')].map((t) => glassifyPanel(t));
    requestAnimationFrame(() => requestAnimationFrame(() => this.choiceEl.classList.add('show')));
    this.root.style.cursor = 'default';
    this.tiles = [...this.choiceEl.querySelectorAll('.intro-tile')];
    this.tiles.forEach((t, i) => t.addEventListener('pointerenter', () => this.select(i)));
    this.select(0);
    this.onChoicesShown();
  }

  /** Move the selection ring (hover and keys share it). */
  select(i, focus = false) {
    const n = this.tiles.length;
    this.sel = ((i % n) + n) % n;
    this.tiles.forEach((t, k) => t.classList.toggle('sel', k === this.sel));
    if (focus) this.tiles[this.sel].focus({ preventScroll: true });
  }

  choiceKey(e) {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'a' || k === 'A') { e.preventDefault(); this.select(this.sel - 1, true); }
    else if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'd' || k === 'D') { e.preventDefault(); this.select(this.sel + 1, true); }
    else if (k === 'Tab') { e.preventDefault(); this.select(this.sel + (e.shiftKey ? -1 : 1), true); }
    else if (k === 'Enter' || k === ' ') { e.preventDefault(); this.tiles[this.sel].click(); }
  }

  finish() {
    window.removeEventListener('keydown', this._onKey, true);
    this.root.removeEventListener('pointerdown', this._onPointer);
    this.root.classList.add('gone');
    this.choiceEl.classList.remove('show');
    setTimeout(() => { this.glass?.forEach((g) => g?.destroy?.()); this.root.remove(); }, 700);
  }
}

// ───────────────────────────── the greeter (sprite, extruded) ─────────────────────────────
// Projects a mesh's world bounding box onto the canvas, in CSS pixels.
function projectRect(THREE, obj, camera, rect) {
  obj.updateWorldMatrix(true, false);
  const box = new THREE.Box3().setFromObject(obj);
  if (!isFinite(box.min.x)) return null;
  const corners = [
    [box.min.x, box.min.y, box.min.z], [box.max.x, box.min.y, box.min.z],
    [box.min.x, box.max.y, box.min.z], [box.max.x, box.max.y, box.min.z],
    [box.min.x, box.min.y, box.max.z], [box.max.x, box.min.y, box.max.z],
    [box.min.x, box.max.y, box.max.z], [box.max.x, box.max.y, box.max.z],
  ];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const v = new THREE.Vector3();
  for (const c of corners) {
    v.set(c[0], c[1], c[2]).project(camera);
    const x = (v.x + 1) / 2 * rect.width + rect.left;
    const y = (1 - v.y) / 2 * rect.height + rect.top;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return { left: minX, top: minY, width: maxX - minX, height: maxY - minY, right: maxX, bottom: maxY };
}

// Session 26d: back to first principles — this is exactly the original flat
// sprite (same frames, same anchor math), just given a light, even thickness
// by building it as a slab (one box) instead of a single-sided plane. Same
// texture, same four frames (idle/raise/waveA/waveB), same alpha-mask hit
// test — the only thing that changed is the geometry has real depth now, so
// she isn't paper-thin. No per-pixel decomposition, no separate rigged arm.
export class PorchGreeter {
  constructor(THREE, scene, cfg) {
    this.THREE = THREE; this.cfg = cfg;
    const tex = new THREE.TextureLoader().load(cfg.sprite);
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace; else tex.encoding = THREE.sRGBEncoding;
    tex.repeat.set(1 / cfg.frames, 1);
    this.tex = tex;

    const frontMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, toneMapped: false, fog: false });
    // A plain flat 2D sprite: one plane, no thickness.
    this.height = cfg.height;
    this.mesh = new THREE.Mesh(this.makeGeo(cfg.height), frontMat);
    this.mesh.position.set(...cfg.pos);
    this.mesh.rotation.y = cfg.yaw ?? 0;
    this.mesh.name = 'PorchGreeter';
    scene.add(this.mesh);

    this.clock = new FrameClock((f) => { tex.offset.x = f / cfg.frames; });

    // Alpha mask for hover / click hit tests, so the empty corners of the
    // frame (and the empty space where the raised arm goes) don't count.
    this.mask = null;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      this.mask = { w: img.width, a: g.getImageData(0, 0, img.width, img.height).data };
    };
    img.src = cfg.sprite;
    this.ray = new THREE.Raycaster(); this.ndc = new THREE.Vector2();
  }
  /** A thin box sized so her feet-to-hair height is `height` world units, origin between the feet. */
  makeGeo(height) {
    const cfg = this.cfg;
    const h = height * (cfg.frameH / cfg.figurePx);        // box height incl. the 1px margins
    const w = h * (cfg.frameW / cfg.frameH);
    const geo = new this.THREE.PlaneGeometry(w, h);
    geo.translate((0.5 - cfg.anchorU) * w, h / 2 - h * (cfg.footPx / cfg.frameH), 0);
    return geo;
  }
  setHeight(height) {
    const old = this.mesh.geometry;
    this.mesh.geometry = this.makeGeo(height); old.dispose(); this.height = height;
  }
  wave(times) { this.clock.wave(times, this.cfg.waveTiming); }
  /** Is this screen point on her (an opaque pixel of the current frame)? */
  hit(clientX, clientY, camera, rect) {
    if (!this.mesh.visible) return false;
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, camera);
    const h = this.ray.intersectObject(this.mesh, false)[0];
    if (!h || !h.uv) return false;
    if (!this.mask) return true;
    const px = Math.min(this.cfg.frameW - 1, Math.floor(h.uv.x * this.cfg.frameW)) + this.clock.frame * this.cfg.frameW;
    const py = Math.min(this.cfg.frameH - 1, Math.floor((1 - h.uv.y) * this.cfg.frameH));
    return this.mask.a[(py * this.mask.w + px) * 4 + 3] > 100;
  }
  update(dt) {
    this.clock.update(dt);
    // Fixed pose (cfg.yaw) — real thickness only reads as thickness if she
    // doesn't spin to face the camera, unlike the old billboard plane.
  }
}

// ───────────────────────────── camera ─────────────────────────────
// Call apply(camera) AFTER walker.update() every frame. While the intro is
// up it replaces the walker's pose with the porch shot; when release() is
// called it eases from the porch shot back to the walker's live pose.
export class IntroCamera {
  constructor(THREE, cfg, camera) {
    this.THREE = THREE;
    const eye = new THREE.Vector3(...cfg.cameraEye);
    const look = new THREE.Vector3(...cfg.cameraLook);

    // Flatten the perspective: a wide gameplay FOV close up reads as a
    // "tilted"/converging shot on a static porch portrait. Pulling the
    // camera back and narrowing the FOV by the same dolly-zoom ratio keeps
    // her the same size on screen but straightens the verticals. Generic —
    // computed off whatever FOV the walker camera actually has right now,
    // not a hand-tuned number, so it adapts to any device/aspect.
    this.fov = cfg.introFov ?? null;
    this.fov0 = camera?.fov ?? null;
    let pos = eye;
    if (this.fov && this.fov0) {
      // k>1 pushes the eye further past its original spot, away from `look`
      // (narrower fov = same framing needs more distance) — a plain lerp
      // would need the *original* eye as its own endpoint, so this builds
      // the result in a fresh vector rather than overwriting `eye` first.
      const k = Math.tan(THREE.MathUtils.degToRad(this.fov0) / 2) / Math.tan(THREE.MathUtils.degToRad(this.fov) / 2);
      pos = new THREE.Vector3().lerpVectors(look, eye, k);
    }

    // A plain dolly-in on top of the flatten above — introZoom > 1 moves
    // the eye that fraction closer to `look`, so everything in the shot
    // (her, the door, the porch) grows together and stays centred, rather
    // than changing what's centred.
    if (cfg.introZoom && cfg.introZoom !== 1) {
      pos = new THREE.Vector3().lerpVectors(look, pos, 1 / cfg.introZoom);
    }

    this.pos = pos;
    const m = new THREE.Matrix4().lookAt(this.pos, look, new THREE.Vector3(0, 1, 0));
    this.quat = new THREE.Quaternion().setFromRotationMatrix(m);
    this.returnSec = cfg.returnSec;
    this.k = 1; this.releasing = false; this.done = false;
    this.engaging = false; this.engageSec = 1.6;
    this._p = new THREE.Vector3(); this._q = new THREE.Quaternion();
  }
  release(instant = false) { this.releasing = true; this.engaging = false; if (instant) this.k = 0; }
  // Session 81: the tutorial runs in the walker's own view first; the porch
  // shot then eases IN from wherever the walker is standing (the mirror image
  // of release()).
  engage(sec = 1.6, instant = false) {
    this.done = false; this.releasing = false;
    this.engaging = !instant; this.engageSec = sec; this.k = instant ? 1 : 0;
  }
  apply(camera, dt) {
    if (this.done) return;
    if (this.k === 1 && !this.engaging && this.fov && camera.fov !== this.fov) { camera.fov = this.fov; camera.updateProjectionMatrix(); }
    if (this.releasing) this.k = Math.max(0, this.k - dt / this.returnSec);
    if (this.engaging) { this.k = Math.min(1, this.k + dt / this.engageSec); if (this.k >= 1) this.engaging = false; }
    const e = this.k * this.k * (3 - 2 * this.k);               // smoothstep, same feel both ends
    // Ease the lens with the position — leaving the narrow intro FOV on until
    // the end made the walk-in look zoomed, then pop wide in one frame.
    if ((this.releasing || this.engaging) && this.fov && this.fov0) {
      camera.fov = this.fov0 + (this.fov - this.fov0) * e;
      camera.updateProjectionMatrix();
    }
    this._p.copy(camera.position); this._q.copy(camera.quaternion);   // the walker's pose
    camera.position.lerpVectors(this._p, this.pos, e);
    camera.quaternion.copy(this._q).slerp(this.quat, e);
    camera.updateMatrixWorld();
    if (this.releasing && this.k === 0) {
      this.done = true;
      if (this.fov && this.fov0 && camera.fov !== this.fov0) { camera.fov = this.fov0; camera.updateProjectionMatrix(); }
    }
  }
}

// ───────────────────────────── orchestration ─────────────────────────────
// const intro = startIntro({ THREE, scene, camera, cfg: CONFIG.intro });
//   intro.blocking          – OR this into the same gates Story.blocking uses
//   intro.update(dt)        – every frame, AFTER walker.update()
//   intro.choice            – Promise<'hire' | 'explore'>
export function startIntro({ THREE, scene, camera, canvas, cfg, deferred = false }) {
  // ?introedit — the in-page editor (intro-edit.js). What it saves lives in
  // localStorage and only applies in edit mode, until it's written into
  // config.js / INTRO_BEATS for real.
  const editing = new URLSearchParams(location.search).has('introedit');
  let saved = null;
  if (editing) { try { saved = JSON.parse(localStorage.getItem('porchIntroEdit') || 'null'); } catch { saved = null; } }
  if (saved) cfg = { ...cfg, ...(saved.pos ? { pos: saved.pos } : {}), ...(saved.height ? { height: saved.height } : {}) };
  const beats = saved?.beats || INTRO_BEATS;
  const greeter = new PorchGreeter(THREE, scene, cfg);
  const cam = new IntroCamera(THREE, cfg, camera);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = () => matchMedia('(max-width:760px), (max-aspect-ratio: 4/5)').matches;
  const state = { blocking: true, greeter };
  // Session 81 — `deferred`: don't take the camera yet. The visitor keeps the
  // walker's view (and the controls) for the tutorial; Apoorva stays hidden
  // until state.engage() brings the porch shot in, and only then does begin()
  // start the text.
  if (deferred) { cam.done = true; state.blocking = false; greeter.mesh.visible = false; }
  state.engage = (sec = 1.6) => {
    greeter.mesh.visible = true;
    cam.engage(sec, reduced);
    state.blocking = true;
  };

  const overlay = new IntroOverlay({
    beats,
    typeMs: cfg.typeMs, linePauseMs: cfg.linePauseMs, beatFadeMs: cfg.beatFadeMs, wordDelayMs: cfg.wordDelayMs,
    onBeat: (i) => {
      if (i === 0) setTimeout(() => greeter.wave(cfg.waveTimes), cfg.firstWaveDelayMs);
    },
    onChoicesShown: () => greeter.wave(1),
  });

  // The camera + sprite are set up straight away (so there's never a frame of
  // the walker's view before the porch shot); the text only starts on begin().
  let resolveChoice;
  state.choice = new Promise((r) => { resolveChoice = r; });
  state.begin = () => overlay.run().then((id) => {
    cam.release(reduced);
    resolveChoice(id);
  });

  // Session 54: see IntroOverlay.choose().
  state.choose = (id) => overlay.choose(id);

  if (editing) import('../intro-edit/intro-edit.js').then((m) => m.attachEditor({ THREE, camera, canvas, greeter, overlay, beats }));

  // Hover over her or click her (during the intro or any time after) and she
  // waves. One wave at a time, with a short breather between them.
  let hovering = false, lastWave = 0;
  const rect = () => canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
  const tryWave = () => {
    const now = performance.now();
    if (greeter.clock.waving || now - lastWave < 700) return;
    lastWave = now; greeter.wave(cfg.hoverWaves ?? 2);
  };
  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const over = greeter.hit(e.clientX, e.clientY, camera, rect());
    if (over && !hovering) tryWave();
    hovering = over;
    if (canvas) canvas.classList.toggle('over-greeter', over);
  }, { passive: true });
  addEventListener('pointerdown', (e) => {
    if (greeter.hit(e.clientX, e.clientY, camera, rect())) tryWave();
  }, { passive: true, capture: true });

  state.update = (dt) => {
    greeter.update(dt);
    cam.apply(camera, dt);
    state.blocking = !cam.done;          // stays blocked until the camera is back in the walker's hands
    // Tuck the text in right beside her, following wherever she actually is
    // (matters if she's later moved with the ?introedit sliders/drag).
    if (overlay.textEl && !overlay.atChoice && !mobile()) {
      const r = projectRect(THREE, greeter.mesh, camera, rect());
      if (r) {
        overlay.textEl.style.left = `${Math.round(r.right + 10)}px`;
        overlay.textEl.style.right = '18px';
        overlay.textEl.style.width = 'auto';
      }
    } else if (overlay.textEl && !overlay.atChoice) {   // once choices show, freeze it so it fades in place
      overlay.textEl.style.left = ''; overlay.textEl.style.right = ''; overlay.textEl.style.width = '';
    }
  };
  return state;
}

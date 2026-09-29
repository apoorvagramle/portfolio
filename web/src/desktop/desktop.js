// ---------------------------------------------------------------------------
//  The desktop that runs on the bedroom monitor.
//
//  It is drawn into an offscreen canvas which desk.js hands to the monitor
//  mesh as a texture, so this file knows nothing about three.js: it draws a
//  frame, it collects the rectangles that can be clicked, and it is told
//  where the pointer is in its own coordinates.
//
//  Layout is done in a fixed 1600 x 720 space — the same 2.22 : 1 as the
//  monitor glass in the model (2.0 x 0.9 units) — and the canvas is SCALE
//  times bigger than that so the text stays sharp when you lean in.
//
//  Everything you'd actually want to change (names, projects, links) is in
//  portfolio.js. This file is only how it looks.
// ---------------------------------------------------------------------------
import { PORTFOLIO as P } from '../portfolio/portfolio.js';
import { playSfx } from '../sfx/sfx.js';

export const VW = 1600, VH = 720;   // layout units
const SCALE = 1.28;                 // canvas pixels per layout unit
const BAR = 44;                     // taskbar height
const BOOT_TIME = 2.0;              // seconds from power-on to desktop

// Site-wide typography, ported onto the canvas: Coda for body copy,
// Bitcount Grid Single for anything bold (headers, names, titles —
// txt()/measure() switch to it automatically whenever w >= 600), Space
// Mono kept as a minimal accent on the one small highlight badge
// ([PHOTO]) that explicitly asks for MONO.
const FONT = "'Coda', ui-sans-serif, system-ui, sans-serif";
const FONT_MAJOR = "'Bitcount Grid Single', ui-monospace, monospace";
const MONO = "'Space Mono', ui-monospace, monospace";

const C = {
  ink:      '#1d1d22',
  body:     '#5a5765',
  rule:     '#e2e0dc',
  paper:    '#ffffff',
  side:     '#e6ecf6',
  sideEdge: '#cfd6e2',
  sideInk:  '#31445f',
  muted:    '#6a7c99',
  frame:    '#3b4450',
  frameEdge:'#22282f',
  menu:     '#eceae6',
  menuInk:  '#3b3b42',
  link:     '#1f4f9c',
  linkHot:  '#3f7ad6',
  gold:     '#f0c766',
  goldDeep: '#d9a53f',
  goldEdge: '#a37f2c',
  green:    '#a9d98f',
  cream:    '#f6efe4',
};

// The desktop icons, in the order they sit on the wallpaper. `meta` is the
// line the window's DETAILS sidebar shows under the title.
const SECTIONS = [
  { id: 'resume',     label: 'Resume',      icon: 'doc',    title: 'Resume.pdf',
    meta: () => `PDF Document · ${P.resume.size || '—'}` },
  { id: 'projects',   label: 'Projects',    icon: 'folder', title: 'Projects',
    meta: () => `${P.projects.items.length} items` },
  { id: 'skills',     label: 'Skills',      icon: 'folder', title: 'Skills',
    meta: () => `${P.skills.length} categor${P.skills.length === 1 ? 'y' : 'ies'}` },
  { id: 'experience', label: 'Experience',  icon: 'folder', title: 'Experience',
    meta: () => P.experience.sub },
  { id: 'education',  label: 'Education',   icon: 'folder', title: 'Education',
    meta: () => 'B.E. ECE, RVCE' },
  { id: 'contact',    label: 'Contact',     icon: 'mail',   title: 'Contact',
    meta: () => `${P.contact.length} items` },
  { id: 'bin',        label: 'Recycle Bin', icon: 'bin',    title: 'Recycle Bin',
    meta: () => `${P.bin.items.length} items` },
];

const TINT = {
  gold:  ['#f0c766', '#d9a53f', '#a37f2c'],
  blue:  ['#8fb4e8', '#4c76ba', '#2b4f88'],
  green: ['#a9d98f', '#6aa84f', '#4b7a37'],
};

export class Desktop {
  /** `onOpen(url)` is called when something with a link is clicked, and
   *  `onPowerOff()` when the start menu's "Turn off computer" is picked. */
  constructor({ onOpen, onPowerOff } = {}) {
    this.onOpen = onOpen ?? (() => {});
    this.onPowerOff = onPowerOff ?? (() => {});

    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(VW * SCALE);
    this.canvas.height = Math.round(VH * SCALE);
    this.g = this.canvas.getContext('2d');
    this.g.scale(SCALE, SCALE);     // set once — everything below is layout units

    this.phase = 'off';        // off | boot | ready
    this.bootT = 0;
    this.win = null;           // open window's section id
    this.minimized = false;
    this.maxed = false;
    this.scroll = {};          // per-window scroll offset
    this.contentH = {};        // per-window content height, for clamping
    this.startOpen = false;
    this.binEmptied = false;
    this.hover = null;         // id of the region under the pointer
    this.toast = null;
    this.clock = '';
    this.clockAt = -1e9;
    this.hits = [];
    this.clip = null;
    this.dirty = true;

    // Optional photo for the card — loaded lazily, redrawn when it arrives.
    this.photo = null;
    if (P.photo) {
      const img = new Image();
      img.onload = () => { this.photo = img; this.dirty = true; };
      img.src = P.photo;
    }

    // Session 79: the résumé window shows the actual rendered page, not a
    // hand-typeset summary — same lazy-load-then-redraw pattern as `photo`.
    // `resumeImgFailed` lets paneResume() fall back to the old text summary
    // if the image is missing or 404s, instead of drawing a blank sheet.
    this.resumeImg = null;
    this.resumeImgFailed = false;
    if (P.resume.image) {
      const img = new Image();
      img.onload = () => { this.resumeImg = img; this.dirty = true; };
      img.onerror = () => { this.resumeImgFailed = true; this.dirty = true; };
      img.src = P.resume.image;
    }
  }

  // ---- machine state ------------------------------------------------------

  turnOn() {
    if (this.phase !== 'off') return;
    this.phase = 'boot';
    this.bootT = 0;
    this.dirty = true;
  }

  turnOff() {
    this.phase = 'off';
    this.win = null;
    this.startOpen = false;
    this.hover = null;
    this.dirty = true;
  }

  get on() { return this.phase !== 'off'; }
  get booted() { return this.phase === 'ready'; }

  update(dt) {
    if (this.phase === 'off') return;
    if (this.phase === 'boot') {
      this.bootT += dt;
      this.dirty = true;                       // the boot bar is animating
      if (this.bootT >= BOOT_TIME) { this.phase = 'ready'; this.bootT = 0; }
    }
    if (this.toast) {
      this.toast.t -= dt;
      if (this.toast.t <= 0) { this.toast = null; }
      this.dirty = true;
    }
    // The clock only ever shows minutes, so once every ten seconds is plenty.
    const now = performance.now();
    if (now - this.clockAt > 10000) {
      this.clockAt = now;
      const d = new Date();
      let h = d.getHours();
      const ap = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      const s = `${h}:${String(d.getMinutes()).padStart(2, '0')} ${ap}`;
      if (s !== this.clock) { this.clock = s; this.dirty = true; }
    }
  }

  /** Draws only when something changed. True means the texture needs uploading. */
  render() {
    if (!this.dirty || this.phase === 'off') return false;
    this.dirty = false;
    this.hits = [];
    const g = this.g;
    g.save();
    g.clearRect(0, 0, VW, VH);
    if (this.phase === 'boot') this.drawBoot();
    else this.drawDesktop();
    g.restore();
    return true;
  }

  // ---- pointer ------------------------------------------------------------

  /** Returns true if the pointer is over something clickable. */
  pointerMove(x, y) {
    const h = this.phase === 'ready' ? this.at(x, y) : null;
    const id = h && h.id !== 'desktop' ? h.id : null;
    if (id !== this.hover) { this.hover = id; this.dirty = true; }
    return !!id;
  }

  pointerOut() {
    if (this.hover !== null) { this.hover = null; this.dirty = true; }
  }

  click(x, y) {
    if (this.phase !== 'ready') return false;
    const h = this.at(x, y);
    if (h) playSfx('portfolioClick');
    this.act(h ? h.id : 'desktop');
    return true;
  }

  wheel(x, y, dy) {
    if (this.phase !== 'ready' || !this.win || this.minimized) return false;
    const key = this.win;
    const pane = this.paneRect();
    if (x < pane.x || x > pane.x + pane.w || y < pane.y || y > pane.y + pane.h) return false;
    const max = Math.max(0, (this.contentH[key] ?? 0) - pane.h);
    const from = this.scroll[key] ?? 0;
    const next = Math.min(max, Math.max(0, from + dy * 0.6));
    if (next === from) return false;
    this.scroll[key] = next;
    this.dirty = true;
    return true;
  }

  /** Esc: back out one layer. False means "nothing left to close". */
  escape() {
    if (this.startOpen) { this.startOpen = false; this.dirty = true; return true; }
    if (this.win) { this.win = null; this.dirty = true; return true; }
    return false;
  }

  at(x, y) {
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const r = this.hits[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
    }
    return null;
  }

  act(id) {
    if (id !== 'start' && this.startOpen) { this.startOpen = false; this.dirty = true; }
    this.dirty = true;

    if (id === 'start') { this.startOpen = !this.startOpen; return; }
    if (id === 'off') { this.onPowerOff(); return; }
    if (id === 'win:close') { this.win = null; return; }
    if (id === 'win:min') { this.minimized = true; return; }
    if (id === 'win:max') { this.maxed = !this.maxed; return; }
    if (id === 'bin:empty') { this.binEmptied = true; return; }
    if (id === 'task') { this.minimized = !this.minimized; return; }

    if (id && id.startsWith('open:')) {
      const key = id.slice(5);
      this.win = key;
      this.minimized = false;
      this.scroll[key] = this.scroll[key] ?? 0;
      return;
    }
    if (id && id.startsWith('url:')) {
      const url = id.slice(4);
      if (url) this.onOpen(url);
      else this.say('No link set for that one yet — see portfolio.js');
    }
  }

  say(text) { this.toast = { text, t: 3.2 }; this.dirty = true; }

  // ---- drawing helpers ----------------------------------------------------

  hit(x, y, w, h, id) {
    const c = this.clip;
    if (c) {                                    // inside a scrolling pane
      const x0 = Math.max(x, c.x), y0 = Math.max(y, c.y);
      const x1 = Math.min(x + w, c.x + c.w), y1 = Math.min(y + h, c.y + c.h);
      if (x1 <= x0 || y1 <= y0) return;
      this.hits.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, id });
      return;
    }
    this.hits.push({ x, y, w, h, id });
  }

  rect(x, y, w, h, fill, stroke) {
    const g = this.g;
    if (fill) { g.fillStyle = fill; g.fillRect(x, y, w, h); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
  }

  /** Rounded rectangle. Pass fill/stroke, or neither to leave the path open
   *  for a gradient fill by the caller. */
  round(x, y, w, h, r, fill, stroke) {
    const g = this.g;
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); }
  }

  vgrad(x, y, w, h, stops) {
    const g = this.g;
    const grad = g.createLinearGradient(x, y, x, y + h);
    for (const [at, col] of stops) grad.addColorStop(at, col);
    g.fillStyle = grad;
    g.fillRect(x, y, w, h);
  }

  /** Fills the current path with a top-to-bottom gradient over y..y+h. */
  fillGrad(y, h, from, to) {
    const g = this.g;
    const grad = g.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, from);
    grad.addColorStop(1, to);
    g.fillStyle = grad;
    g.fill();
  }

  txt(s, x, y, o = {}) {
    const g = this.g;
    const w = o.w ?? 400;
    const fam = o.font ?? (w >= 600 ? FONT_MAJOR : FONT);
    g.font = `${w} ${o.size ?? 15}px ${fam}`;
    g.fillStyle = o.color ?? C.ink;
    g.textAlign = o.align ?? 'left';
    if ('letterSpacing' in g) g.letterSpacing = o.spacing ?? '0px';
    g.fillText(s, x, y);
    if ('letterSpacing' in g) g.letterSpacing = '0px';
    g.textAlign = 'left';
  }

  measure(s, size, weight = 400) {
    this.g.font = `${weight} ${size}px ${weight >= 600 ? FONT_MAJOR : FONT}`;
    return this.g.measureText(s).width;
  }

  /** Word-wrapped paragraph. Returns the y just under the last line. */
  para(s, x, y, maxW, o = {}) {
    const size = o.size ?? 15, lh = o.lh ?? size * 1.55;
    const words = String(s).split(/\s+/);
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (this.measure(test, size, o.w ?? 400) > maxW && line) {
        this.txt(line, x, y, o);
        y += lh;
        line = word;
      } else line = test;
    }
    if (line) { this.txt(line, x, y, o); y += lh; }
    return y;
  }

  /** A rounded label chip, as used for skills and project tags. */
  chip(label, x, y, o = {}) {
    const size = o.size ?? 14;
    const w = this.measure(label, size) + 20;
    const h = o.h ?? 26;
    this.round(x, y, w, h, 3, C.side, C.sideEdge);
    this.txt(label, x + 10, y + h / 2 + size * 0.36, { size, color: C.sideInk });
    return w;
  }

  // ---- boot ---------------------------------------------------------------

  drawBoot() {
    const g = this.g;
    this.rect(0, 0, VW, VH, '#0e0e14');
    const cx = VW / 2, cy = VH / 2;
    this.txt('Apoorva', cx - 4, cy - 46, { size: 34, w: 700, color: C.cream, align: 'right' });
    this.txt('PC', cx - 2, cy - 46, { size: 34, w: 700, color: C.green });
    this.txt('Loading the professional version of me…', cx, cy + 4,
      { size: 17, color: '#b9b6c4', align: 'center' });

    const bw = 300, bh = 12, bx = cx - bw / 2, by = cy + 36;
    this.round(bx, by, bw, bh, 6, '#1b1b25', '#33333f');
    g.save();
    this.round(bx, by, bw, bh, 6);
    g.clip();
    // A highlight sweeping across, the same as the page's own loading bar.
    const t = (this.bootT % 1.1) / 1.1;
    const hx = bx - 78 + t * (bw + 78);
    const grad = g.createLinearGradient(hx, 0, hx + 78, 0);
    grad.addColorStop(0, 'rgba(169,217,143,0)');
    grad.addColorStop(1, '#a9d98f');
    g.fillStyle = grad;
    g.fillRect(hx, by, 78, bh);
    g.restore();

    // ...and the real progress underneath it, so the wait reads as finite.
    this.rect(bx, by + bh + 12, bw * Math.min(1, this.bootT / BOOT_TIME), 2, 'rgba(169,217,143,.55)');
  }

  // ---- desktop ------------------------------------------------------------

  drawDesktop() {
    // The wallpaper itself is the "click here to dismiss the start menu"
    // target, so it goes in first and everything else lands on top of it.
    this.hits.push({ x: 0, y: 0, w: VW, h: VH, id: 'desktop' });
    this.drawWallpaper();
    this.drawCard();
    this.drawIcons();
    if (this.win && !this.minimized) this.drawWindow();
    this.drawTaskbar();
    if (this.startOpen) this.drawStartMenu();
    if (this.toast) this.drawToast();
  }

  drawWallpaper() {
    const g = this.g;
    this.vgrad(0, 0, VW, VH, [[0, '#8b85b0'], [0.46, '#736d99'], [1, '#615c86']]);

    // Two hills and a flat band along the bottom — the XP posture, in our
    // own colours.
    const horizon = VH - BAR;
    g.save();
    g.beginPath(); g.rect(0, 0, VW, horizon); g.clip();
    const hill = (cx, cy, rx, ry, col) => {
      g.beginPath();
      g.ellipse(cx, cy, rx, ry, 0, Math.PI, 0);
      g.closePath();
      g.fillStyle = col; g.fill();
    };
    hill(330, horizon - 62, 500, 230, '#5f5a84');
    hill(1290, horizon - 54, 460, 185, '#575279');
    this.rect(0, horizon - 86, VW, 86, '#4e4a6d');
    this.rect(0, horizon - 88, VW, 2, 'rgba(255,255,255,.10)');
    g.restore();

    // Scanlines and a vignette: this is a CRT on a desk in a bedroom, and the
    // faint texture is what sells it as a screen rather than a poster.
    g.fillStyle = 'rgba(255,255,255,.030)';
    for (let y = 0; y < VH; y += 4) g.fillRect(0, y, VW, 1);
    g.fillStyle = 'rgba(0,0,0,.040)';
    for (let y = 2; y < VH; y += 4) g.fillRect(0, y, VW, 2);

    const vig = g.createRadialGradient(VW / 2, VH * 0.42, VH * 0.25, VW / 2, VH * 0.42, VW * 0.72);
    vig.addColorStop(0, 'rgba(255,255,255,.06)');
    vig.addColorStop(1, 'rgba(0,0,0,.26)');
    g.fillStyle = vig;
    g.fillRect(0, 0, VW, VH);
  }

  // The card sitting on the wallpaper: photo, name, what you do.
  drawCard() {
    const g = this.g;
    const x = 46, y = 38, w = 436;
    const px = x + 20, py = y + 22, pw = 108, ph = 132;
    const rowY = [py + ph + 46, py + ph + 76, py + ph + 106];
    const h = rowY[2] + (P.tagline ? 64 : 24) - y;

    this.rect(x, y, w, h, 'rgba(28,27,38,.62)', 'rgba(255,255,255,.16)');

    // photo, or the hatched placeholder until one is set
    this.rect(px, py, pw, ph, '#f3f1ee', 'rgba(0,0,0,.35)');
    if (this.photo) {
      g.save();
      g.beginPath(); g.rect(px + 4, py + 4, pw - 8, ph - 8); g.clip();
      // Session 77: a transparent pixel-art cut-out (the finale's face) gets a
      // passport-blue backdrop and crisp, unsmoothed pixels. A real photo is
      // opaque, so the backdrop is simply painted over.
      g.fillStyle = '#a9cbe8'; g.fillRect(px + 4, py + 4, pw - 8, ph - 8);
      g.imageSmoothingEnabled = false;
      const s = Math.max((pw - 8) / this.photo.width, (ph - 8) / this.photo.height);
      const iw = this.photo.width * s, ih = this.photo.height * s;
      g.drawImage(this.photo, px + 4 + (pw - 8 - iw) / 2, py + 4 + (ph - 8 - ih) / 2, iw, ih);
      g.restore();
    } else {
      this.rect(px + 4, py + 4, pw - 8, ph - 8, '#d9d5dd');
      g.save();
      g.beginPath(); g.rect(px + 4, py + 4, pw - 8, ph - 8); g.clip();
      g.strokeStyle = 'rgba(29,29,34,.12)'; g.lineWidth = 6;
      for (let i = -ph; i < pw; i += 12) {
        g.beginPath(); g.moveTo(px + i, py + ph); g.lineTo(px + i + ph, py); g.stroke();
      }
      g.restore();
      const lw = this.measure('[PHOTO]', 12) + 12;
      this.rect(px + (pw - lw) / 2, py + ph - 32, lw, 21, '#f3f1ee');
      this.txt('[PHOTO]', px + pw / 2, py + ph - 17,
        { size: 12, color: '#4b4655', align: 'center', font: MONO });
    }

    // name block
    const tx = px + pw + 20;
    this.txt(P.machine, tx, py + 16, { size: 11, color: 'rgba(243,241,238,.6)', spacing: '2.2px' });
    this.txt(P.first, tx, py + 56, { size: 30, w: 700, color: '#f7f5f2' });
    this.txt(P.last, tx, py + 90, { size: 30, w: 700, color: '#f7f5f2' });
    this.txt(P.role, tx, py + 124, { size: 17, w: 700, color: C.green });

    this.rect(x, py + ph + 18, w, 1, 'rgba(255,255,255,.14)');

    P.facts.forEach((f, i) => {
      if (!f.value || i > 2) return;
      this.txt(f.label, px, rowY[i], { size: 11, color: 'rgba(240,238,235,.55)', spacing: '1.5px' });
      this.txt(f.value, px + 106, rowY[i], { size: 15, color: '#f0eeeb' });
    });

    if (P.tagline) {
      this.rect(x, rowY[2] + 24, w, 1, 'rgba(255,255,255,.14)');
      this.txt(P.tagline, px, rowY[2] + 50, { size: 15, color: 'rgba(240,238,235,.8)' });
    }
  }

  // ---- icons --------------------------------------------------------------

  iconCell(i) {
    const COL = 104, GAP = 14, ROW = 108;
    const x0 = VW - 40 - (COL * 2 + GAP);
    return { x: x0 + (i % 2) * (COL + GAP), y: 40 + ((i / 2) | 0) * ROW, w: COL, h: ROW - 6 };
  }

  drawIcons() {
    const g = this.g;
    SECTIONS.forEach((s, i) => {
      const c = this.iconCell(i);
      const id = 'open:' + s.id;
      const selected = this.win === s.id || this.hover === id;
      if (selected) {
        this.rect(c.x, c.y, c.w, c.h, 'rgba(47,95,168,.42)');
        g.save();
        g.setLineDash([2, 2]);
        g.strokeStyle = 'rgba(255,255,255,.65)';
        g.lineWidth = 1;
        g.strokeRect(c.x + 0.5, c.y + 0.5, c.w - 1, c.h - 1);
        g.restore();
      }
      this.drawIconArt(s.icon, c.x + (c.w - 58) / 2, c.y + 10, 58);
      g.save();
      g.shadowColor = 'rgba(0,0,0,.85)';
      g.shadowOffsetY = 1;
      g.shadowBlur = 3;
      this.txt(s.label, c.x + c.w / 2, c.y + 88, { size: 13, color: '#fff', align: 'center' });
      g.restore();
      this.hit(c.x, c.y, c.w, c.h, id);
    });
  }

  /** The icon artwork, drawn into an s x s box at (x, y). */
  drawIconArt(kind, x, y, s) {
    const g = this.g;
    const u = s / 46;                       // the art is laid out on a 46px grid
    if (kind === 'doc') {
      this.rect(x + 6 * u, y + 1 * u, 34 * u, 44 * u, '#fbfaf8', '#8d8a93');
      this.rect(x + 11 * u, y + 26 * u, 24 * u, 13 * u, '#c33a2e');
      this.rect(x + 11 * u, y + 8 * u, 18 * u, 2 * u, '#a8a5ae');
      this.rect(x + 11 * u, y + 14 * u, 22 * u, 2 * u, '#a8a5ae');
      this.rect(x + 11 * u, y + 20 * u, 14 * u, 2 * u, '#a8a5ae');
    } else if (kind === 'folder') {
      this.round(x + 2 * u, y + 7 * u, 20 * u, 10 * u, 2, C.goldDeep);
      this.round(x + 2 * u, y + 12 * u, 42 * u, 30 * u, 2);
      this.fillGrad(y + 12 * u, 30 * u, C.gold, C.goldDeep);
      g.strokeStyle = C.goldEdge; g.lineWidth = 1; g.stroke();
    } else if (kind === 'mail') {
      this.rect(x + 2 * u, y + 12 * u, 42 * u, 26 * u, '#fbfaf8', '#8d8a93');
      g.strokeStyle = '#c9c6ce'; g.lineWidth = Math.max(1, 1.6 * u);
      g.beginPath();
      g.moveTo(x + 3 * u, y + 13 * u); g.lineTo(x + 23 * u, y + 27 * u); g.lineTo(x + 43 * u, y + 13 * u);
      g.stroke();
    } else if (kind === 'bin') {
      this.rect(x + 12 * u, y + 4 * u, 22 * u, 5 * u, '#9ca3ad', '#6f7681');
      this.round(x + 9 * u, y + 10 * u, 28 * u, 32 * u, 3);
      this.fillGrad(y + 10 * u, 32 * u, '#c3c9d2', '#939aa5');
      g.strokeStyle = '#6f7681'; g.lineWidth = 1; g.stroke();
      for (const dx of [15, 22, 29]) this.rect(x + dx * u, y + 15 * u, 3 * u, 22 * u, 'rgba(255,255,255,.5)');
    }
  }

  // ---- window -------------------------------------------------------------

  winRect() {
    if (this.maxed) return { x: 0, y: 0, w: VW, h: VH - BAR };
    return { x: 210, y: 58, w: 1180, h: 560 };
  }

  paneRect() {
    const r = this.winRect();
    const top = r.y + 3 + 32 + 28;
    return { x: r.x + 3 + 190, y: top, w: r.w - 6 - 190, h: r.y + r.h - 4 - top };
  }

  drawWindow() {
    const g = this.g;
    const r = this.winRect();
    const sec = SECTIONS.find((s) => s.id === this.win);
    if (!sec) return;

    // frame + drop shadow
    g.save();
    g.shadowColor = 'rgba(14,13,20,.5)';
    g.shadowBlur = 34;
    g.shadowOffsetY = 14;
    this.round(r.x, r.y, r.w, r.h, 7, C.frame, C.frameEdge);
    g.restore();

    // ---- title bar
    const tx = r.x + 3, ty = r.y + 3, tw = r.w - 6, th = 32;
    g.save();
    g.beginPath();
    g.moveTo(tx + 5, ty);
    g.arcTo(tx + tw, ty, tx + tw, ty + th, 5);
    g.lineTo(tx + tw, ty + th);
    g.lineTo(tx, ty + th);
    g.lineTo(tx, ty + 5);
    g.arcTo(tx, ty, tx + tw, ty, 5);
    g.closePath();
    g.clip();
    this.vgrad(tx, ty, tw, th, [[0, '#5f88c9'], [0.48, '#3866ac'], [1, '#2c5799']]);
    g.restore();

    this.drawIconArt(sec.icon, tx + 8, ty + 7, 18);
    g.save();
    g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowOffsetY = 1; g.shadowBlur = 2;
    this.txt(sec.title, tx + 34, ty + 21, { size: 15, w: 700, color: '#fff' });
    g.restore();

    const btn = (bx, id, draw, base = ['#7fa2d8', '#4c76ba'], edge = '#2b4f88') => {
      const hot = this.hover === id;
      this.round(bx, ty + 5, 25, 21, 3);
      this.fillGrad(ty + 5, 21, hot ? lighten(base[0]) : base[0], hot ? lighten(base[1]) : base[1]);
      g.strokeStyle = edge; g.lineWidth = 1; g.stroke();
      draw(bx + 12.5, ty + 15.5);
      this.hit(bx, ty + 5, 25, 21, id);
    };
    const bx0 = tx + tw - 3 - 25;
    btn(bx0, 'win:close', (cx, cy) => {
      g.strokeStyle = '#fff'; g.lineWidth = 2; g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx - 4, cy - 4); g.lineTo(cx + 4, cy + 4);
      g.moveTo(cx + 4, cy - 4); g.lineTo(cx - 4, cy + 4);
      g.stroke();
    }, ['#e0745f', '#c1402c'], '#8d2b1c');
    btn(bx0 - 28, 'win:max', (cx, cy) => {
      g.strokeStyle = '#fff'; g.lineWidth = 1.5;
      g.strokeRect(cx - 5, cy - 4.5, 10, 9);
      g.fillStyle = '#fff'; g.fillRect(cx - 5, cy - 4.5, 10, 3);
    });
    btn(bx0 - 56, 'win:min', (cx, cy) => { g.fillStyle = '#fff'; g.fillRect(cx - 5, cy + 3, 10, 2.5); });

    // ---- menu bar (decoration — the window has no menus to open)
    const my = ty + th;
    this.rect(tx, my, tw, 28, C.menu);
    let mx = tx + 14;
    for (const label of ['File', 'Edit', 'View', 'Help']) {
      this.txt(label, mx, my + 19, { size: 14, color: C.menuInk });
      mx += this.measure(label, 14) + 22;
    }

    // ---- body
    const by = my + 28, bh = r.y + r.h - by - 4;
    this.rect(tx, by, tw, bh, C.paper, C.frameEdge);

    // sidebar
    this.rect(tx, by, 190, bh, C.side);
    this.rect(tx + 189, by, 1, bh, C.sideEdge);
    this.txt('DETAILS', tx + 18, by + 30, { size: 12, w: 700, color: C.muted, spacing: '1.3px' });
    this.txt(sec.title, tx + 18, by + 60, { size: 14, color: C.sideInk });
    this.para(sec.meta(), tx + 18, by + 84, 154, { size: 14, color: C.muted, lh: 20 });
    this.rect(tx + 18, by + 122, 154, 1, C.sideEdge);
    this.txt('Apoorva-PC', tx + 18, by + 148, { size: 14, color: C.muted });
    this.txt('Local Disk (C:)', tx + 18, by + 170, { size: 14, color: C.muted });

    // content pane, clipped and scrolled
    const pane = this.paneRect();
    const sc = this.scroll[this.win] ?? 0;
    g.save();
    g.beginPath(); g.rect(pane.x, pane.y, pane.w, pane.h); g.clip();
    this.clip = pane;
    const end = this.drawPane(this.win, pane.x + 30, pane.y + 34 - sc, pane.w - 62);
    this.clip = null;
    g.restore();

    const contentH = end - (pane.y - sc) + 26;
    this.contentH[this.win] = contentH;
    if (contentH > pane.h) this.drawScrollbar(pane, sc, contentH);
  }

  drawScrollbar(pane, sc, contentH) {
    const x = pane.x + pane.w - 9, h = pane.h - 12;
    this.round(x, pane.y + 6, 5, h, 2.5, 'rgba(29,29,34,.08)');
    const th = Math.max(30, h * (pane.h / contentH));
    const t = contentH > pane.h ? (sc / (contentH - pane.h)) * (h - th) : 0;
    this.round(x, pane.y + 6 + t, 5, th, 2.5, 'rgba(49,68,95,.45)');
  }

  /** Dispatches to one section's content. Returns the y it finished at. */
  drawPane(id, x, y, w) {
    switch (id) {
      case 'resume':     return this.paneResume(x, y, w);
      case 'projects':   return this.paneProjects(x, y, w);
      case 'skills':     return this.paneSkills(x, y, w);
      case 'experience': return this.paneExperience(x, y, w);
      case 'education':  return this.paneEducation(x, y, w);
      case 'contact':    return this.paneContact(x, y, w);
      case 'bin':        return this.paneBin(x, y, w);
      default:           return y;
    }
  }

  /** Section heading, with an optional standfirst under it. */
  head(title, x, y, w, sub) {
    this.txt(title, x, y, { size: 23, w: 700 });
    if (!sub) return y + 30;
    return this.para(sub, x, y + 30, Math.min(w, 620), { size: 15, color: C.body, lh: 23 }) + 10;
  }

  paneResume(x, y, w) {
    // toolbar
    this.rect(x, y - 18, w, 34, '#f2f1ee', '#d3d0cb');
    this.txt(`Page 1 of ${P.resume.pages}`, x + 12, y + 4, { size: 14, color: '#4b4855' });
    this.txt('100%', x + 160, y + 4, { size: 14, color: '#4b4855' });
    const bw = 132, bx = x + w - bw - 8, byy = y - 13;
    const id = 'url:' + (P.resume.url ?? '');
    const hot = this.hover === id;
    this.round(bx, byy, bw, 24, 3);
    this.fillGrad(byy, 24, hot ? '#7ba0dc' : '#5f88c9', hot ? '#3a6cb4' : '#2c5799');
    this.g.strokeStyle = '#24487d'; this.g.lineWidth = 1; this.g.stroke();
    this.txt('Download PDF', bx + bw / 2, byy + 17, { size: 14, color: '#fff', align: 'center' });
    this.hit(bx, byy, bw, 24, id);

    // the sheet
    const sy = y + 34, sw = Math.min(w, 640);
    const sheetX = x;

    // Session 79: the real résumé page, once it has loaded — this is what
    // "directly display the résumé" means, rather than the old hand-
    // typeset summary below. Falls back to that summary if `resume.image`
    // is unset or fails to load, so the window is never left blank.
    if (this.resumeImg) {
      const img = this.resumeImg;
      const sh = sw * (img.height / img.width);
      this.rect(sheetX, sy, sw, sh, '#fdfcfa', '#d3d0cb');
      this.g.drawImage(img, sheetX, sy, sw, sh);
      const note = 'Download opens the PDF itself.';
      this.txt(note, x, sy + sh + 30, { size: 14, color: C.muted });
      return sy + sh + 40;
    }
    if (P.resume.image && !this.resumeImgFailed) {
      // Still loading — a plain placeholder sheet, not a flash of the
      // summary text that would just be replaced a moment later.
      const sh = 700;
      this.rect(sheetX, sy, sw, sh, '#fdfcfa', '#d3d0cb');
      this.txt('Loading…', sheetX + 34, sy + 40, { size: 15, color: C.muted });
      return sy + sh + 40;
    }

    let ty = sy + 52;
    this.txt(`${P.first} ${P.last}`.trim(), sheetX + 34, ty, { size: 24, w: 700 });
    ty += 26;
    this.txt(P.role, sheetX + 34, ty, { size: 15, color: C.muted });
    ty += 14;
    this.rect(sheetX + 34, ty, sw - 68, 1, C.rule);
    ty += 32;
    for (const block of P.resume.summary) {
      this.txt(block.head, sheetX + 34, ty, { size: 11, w: 700, color: C.muted, spacing: '1.3px' });
      ty += 22;
      for (const line of block.lines) {
        ty = this.para(line, sheetX + 34, ty, sw - 68, { size: 15, color: '#4b4855', lh: 23 });
      }
      ty += 16;
    }
    const sh = Math.max(400, ty - sy + 24);
    // the page is drawn behind what we just measured out
    const g = this.g;
    g.save();
    g.globalCompositeOperation = 'destination-over';
    this.rect(sheetX, sy, sw, sh, '#fdfcfa', '#d3d0cb');
    g.restore();

    const note = P.resume.url
      ? 'Download opens the PDF itself.'
      : 'Set resume.url in portfolio.js and Download opens the real file.';
    this.txt(note, x, sy + sh + 30, { size: 14, color: C.muted });
    return sy + sh + 40;
  }

  paneProjects(x, y, w) {
    let cy = this.head('Projects', x, y, w, P.projects.intro);
    for (const it of P.projects.items) {
      this.rect(x, cy, w, 1, C.rule);
      cy += 24;
      const tint = TINT[it.tint] ?? TINT.gold;
      this.round(x, cy - 4, 44, 44, 3);
      this.fillGrad(cy - 4, 44, tint[0], tint[1]);
      this.g.strokeStyle = tint[2]; this.g.lineWidth = 1; this.g.stroke();

      const tx = x + 62, tw = w - 62;
      const id = 'url:' + (it.url ?? '');
      const linked = !!it.url;
      this.txt(it.name, tx, cy + 14, {
        size: 18, w: 700, color: linked ? (this.hover === id ? C.linkHot : C.link) : C.ink,
      });
      if (linked) this.hit(tx, cy - 4, this.measure(it.name, 18, 700), 24, id);
      let ty = this.para(it.blurb, tx, cy + 40, Math.min(tw, 560), { size: 15, color: C.body, lh: 23 });
      ty += 6;
      let chipX = tx;
      for (const tag of it.tags) chipX += this.chip(tag, chipX, ty, { size: 13, h: 24 }) + 7;
      cy = ty + 24 + 20;
    }
    this.rect(x, cy, w, 1, C.rule);
    return cy + 6;
  }

  paneSkills(x, y, w) {
    const cy = this.head('Skills', x, y, w) + 14;
    const colW = (w - 40) / 2;
    const bottom = [cy, cy];
    P.skills.forEach((group, i) => {
      const col = i % 2;
      const gx = x + col * (colW + 40);
      let gy = bottom[col];
      this.txt(group.head, gx, gy, { size: 12, w: 700, color: C.muted, spacing: '1.4px' });
      gy += 12;
      this.rect(gx, gy, colW, 1, C.rule);
      gy += 22;
      let chipX = gx;
      for (const item of group.items) {
        const cw = this.measure(item, 15) + 20;
        if (chipX > gx && chipX + cw > gx + colW) { chipX = gx; gy += 36; }
        chipX += this.chip(item, chipX, gy, { size: 15, h: 28 }) + 7;
      }
      bottom[col] = gy + 28 + 34;
    });
    return Math.max(bottom[0], bottom[1]);
  }

  paneExperience(x, y, w) {
    const g = this.g;
    let cy = this.head('Experience', x, y, w);
    this.txt(P.experience.sub, x, cy + 2, { size: 15, color: C.muted });
    cy += 36;
    const railX = x + 6;
    const startY = cy;
    const dots = [];
    for (const it of P.experience.items) {
      this.txt(it.when, railX + 28, cy, { size: 14, color: C.muted });
      this.txt(it.what, railX + 28, cy + 28, { size: 18, w: 700 });
      const end = this.para(it.blurb, railX + 28, cy + 54, Math.min(w - 40, 580),
        { size: 15, color: C.body, lh: 23 });
      dots.push({ y: cy - 5, current: !!it.current });
      cy = end + 28;
    }
    // The rail goes in behind the dots, so it is drawn after them and pushed
    // underneath.
    g.save();
    g.globalCompositeOperation = 'destination-over';
    this.rect(railX - 1, startY - 5, 2, (dots[dots.length - 1]?.y ?? startY) - startY + 5, C.sideEdge);
    g.restore();
    for (const d of dots) {
      const r = d.current ? 6 : 5;
      g.beginPath(); g.arc(railX, d.y, r + 2, 0, Math.PI * 2);
      g.fillStyle = C.paper; g.fill();
      g.beginPath(); g.arc(railX, d.y, r, 0, Math.PI * 2);
      g.fillStyle = d.current ? '#6aa84f' : '#9aa3b2'; g.fill();
      g.strokeStyle = d.current ? '#4b7a37' : '#7a8494'; g.lineWidth = 1; g.stroke();
    }
    return cy;
  }

  paneEducation(x, y, w) {
    let cy = this.head('Education', x, y, w) + 10;
    const cardW = Math.min(w, 700);
    const cardH = 132;
    this.round(x, cy, cardW, cardH, 3, C.side, C.sideEdge);
    this.txt('DEGREE', x + 24, cy + 32, { size: 12, w: 700, color: C.muted, spacing: '1.4px' });
    const end = this.para(P.education.degree, x + 24, cy + 66, cardW - 48, { size: 23, w: 700, lh: 30 });
    this.txt(P.education.where, x + 24, end + 14, { size: 16, color: '#3b3b42' });
    cy += cardH + 36;

    const colW = (w - 40) / 2;
    let bottom = cy;
    P.education.columns.forEach((col, i) => {
      const gx = x + i * (colW + 40);
      let gy = cy;
      this.txt(col.head, gx, gy, { size: 12, w: 700, color: C.muted, spacing: '1.4px' });
      gy += 12;
      this.rect(gx, gy, colW, 1, C.rule);
      gy += 28;
      for (const item of col.items) { this.txt(item, gx, gy, { size: 16, color: '#4b4855' }); gy += 27; }
      bottom = Math.max(bottom, gy);
    });
    return bottom + 6;
  }

  paneContact(x, y, w) {
    let cy = this.head('Contact', x, y, w) + 6;
    const rowW = Math.min(w, 640);
    for (const row of P.contact) {
      this.rect(x, cy, rowW, 1, C.rule);
      cy += 32;
      this.txt(row.label, x, cy, { size: 13, color: C.muted, spacing: '1.2px' });
      const id = 'url:' + (row.url ?? '');
      const linked = !!row.url;
      const vx = x + 150;
      this.txt(row.value, vx, cy, {
        size: 18, color: linked ? (this.hover === id ? C.linkHot : C.link) : C.ink,
      });
      if (linked) {
        const tw = this.measure(row.value, 18);
        if (this.hover === id) this.rect(vx, cy + 5, tw, 1, C.linkHot);
        this.hit(vx, cy - 18, tw, 26, id);
      }
      cy += 22;
    }
    this.rect(x, cy, rowW, 1, C.rule);
    return cy + 6;
  }

  paneBin(x, y, w) {
    const rowW = Math.min(w, 700);
    this.rect(x, y - 18, rowW, 34, '#f2f1ee', '#d3d0cb');
    const n = this.binEmptied ? 0 : P.bin.items.length;
    this.txt(`${n} items`, x + 12, y + 4, { size: 14, color: '#4b4855' });
    if (!this.binEmptied) {
      const label = 'Empty Recycle Bin';
      const lw = this.measure(label, 14);
      this.txt(label, x + rowW - lw - 12, y + 4, {
        size: 14, color: this.hover === 'bin:empty' ? C.linkHot : C.link,
      });
      this.hit(x + rowW - lw - 14, y - 13, lw + 4, 24, 'bin:empty');
    }
    let cy = y + 38;
    if (this.binEmptied) {
      this.txt('Emptied. Those were load-bearing, probably.', x, cy + 14, { size: 16, color: C.body });
      return cy + 40;
    }
    for (const it of P.bin.items) {
      this.rect(x, cy, rowW, 1, C.rule);
      cy += 28;
      this.txt(it.name, x + 4, cy, { size: 16 });
      this.txt(it.size, x + rowW - 4, cy, { size: 14, color: C.muted, align: 'right' });
      cy += 14;
    }
    this.rect(x, cy, rowW, 1, C.rule);
    this.txt(P.bin.note, x, cy + 36, { size: 15, color: C.body });
    return cy + 46;
  }

  // ---- taskbar ------------------------------------------------------------

  drawTaskbar() {
    const g = this.g;
    const y = VH - BAR;
    this.vgrad(0, y, VW, BAR, [[0, '#4a5a75'], [0.12, '#33405a'], [0.92, '#2a3550'], [1, '#1f2740']]);
    this.rect(0, y, VW, 1, 'rgba(255,255,255,.22)');

    // start
    const sw = 118;
    g.save();
    g.beginPath();
    g.moveTo(0, y + 1);
    g.lineTo(sw - 12, y + 1);
    g.arcTo(sw, y + 1, sw, y + 13, 12);
    g.lineTo(sw, y + BAR - 13);
    g.arcTo(sw, y + BAR, sw - 12, y + BAR, 12);
    g.lineTo(0, y + BAR);
    g.closePath();
    g.clip();
    const hot = this.hover === 'start' || this.startOpen;
    this.vgrad(0, y + 1, sw, BAR - 1, hot
      ? [[0, '#93c477'], [0.45, '#6ba354'], [1, '#4d8036']]
      : [[0, '#7fae63'], [0.45, '#5b8f45'], [1, '#43712f']]);
    g.restore();
    const gx = 14, gy = y + BAR / 2 - 9;
    for (const [dx, dy, a] of [[0, 0, .95], [10, 0, .75], [0, 10, .75], [10, 10, .95]]) {
      g.globalAlpha = a;
      this.rect(gx + dx, gy + dy, 8, 8, '#f4f2ee');
    }
    g.globalAlpha = 1;
    g.save();
    g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowOffsetY = 1; g.shadowBlur = 2;
    this.txt('start', gx + 26, y + BAR / 2 + 6, { size: 17, w: 700, color: '#fff' });
    g.restore();
    this.hit(0, y, sw, BAR, 'start');

    // the open window's button
    if (this.win) {
      const sec = SECTIONS.find((s) => s.id === this.win);
      const bx = sw + 12, bw = 214, bh = 28, byy = y + (BAR - bh) / 2;
      const active = !this.minimized;
      this.round(bx, byy, bw, bh, 3);
      this.fillGrad(byy, bh, active ? '#5a7098' : '#44557a', active ? '#3b4d70' : '#2e3d5c');
      g.strokeStyle = 'rgba(255,255,255,.2)'; g.lineWidth = 1; g.stroke();
      this.drawIconArt(sec.icon, bx + 8, byy + 7, 14);
      this.txt(sec.title, bx + 30, byy + 19, { size: 14, color: '#fff' });
      this.hit(bx, byy, bw, bh, 'task');
    }

    // tray
    const trayW = 30 + P.tray.length * 42 + 96;
    const trx = VW - trayW;
    this.vgrad(trx, y + 1, trayW, BAR - 1, [[0, '#3f6fa8'], [0.4, '#2f5b93'], [1, '#26497b']]);
    this.rect(trx, y + 1, 1, BAR - 1, 'rgba(255,255,255,.2)');
    let ix = trx + 16;
    for (const t of P.tray) {
      const id = 'url:' + (t.url ?? '');
      const byy = y + (BAR - 32) / 2;
      this.round(ix, byy, 32, 32, 3,
        this.hover === id ? 'rgba(255,255,255,.30)' : 'rgba(255,255,255,.14)',
        'rgba(255,255,255,.28)');
      this.drawTrayGlyph(t.kind, ix + 16, byy + 16);
      this.hit(ix, byy, 32, 32, id);
      ix += 42;
    }
    this.rect(ix + 6, y + 9, 1, BAR - 18, 'rgba(255,255,255,.25)');
    this.txt(this.clock, VW - 18, y + BAR / 2 + 6, { size: 15, color: '#fff', align: 'right' });
  }

  drawTrayGlyph(kind, cx, cy) {
    const g = this.g;
    g.strokeStyle = '#f3f1ee';
    g.fillStyle = '#f3f1ee';
    g.lineWidth = 1.8;
    if (kind === 'mail') {
      g.strokeRect(cx - 10, cy - 7, 20, 14);
      g.beginPath();
      g.moveTo(cx - 10, cy - 7); g.lineTo(cx, cy + 2); g.lineTo(cx + 10, cy - 7);
      g.stroke();
    } else if (kind === 'instagram') {
      this.round(cx - 9, cy - 9, 18, 18, 5, null, '#f3f1ee');
      g.beginPath(); g.arc(cx, cy, 4.5, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(cx + 5.5, cy - 5.5, 1.2, 0, Math.PI * 2); g.fill();
    } else if (kind === 'linkedin') {
      this.txt('in', cx, cy + 6, { size: 17, w: 700, color: '#f3f1ee', align: 'center' });
    } else if (kind === 'github') {
      g.beginPath(); g.arc(cx, cy - 1, 8.5, 0, Math.PI * 2); g.stroke();
      g.fillRect(cx - 2, cy + 6, 4, 5);
    }
  }

  // ---- start menu ---------------------------------------------------------

  drawStartMenu() {
    const g = this.g;
    const w = 264, itemH = 32;
    const h = 46 + SECTIONS.length * itemH + 14 + 38;
    const x = 6, y = VH - BAR - h - 6;

    g.save();
    g.shadowColor = 'rgba(10,10,16,.5)'; g.shadowBlur = 26; g.shadowOffsetY = 8;
    this.round(x, y, w, h, 6, '#f4f3f0', C.frameEdge);
    g.restore();

    g.save();
    g.beginPath();
    g.moveTo(x + 6, y);
    g.arcTo(x + w, y, x + w, y + 46, 6);
    g.lineTo(x + w, y + 46);
    g.lineTo(x, y + 46);
    g.lineTo(x, y + 6);
    g.arcTo(x, y, x + w, y, 6);
    g.closePath();
    g.clip();
    this.vgrad(x, y, w, 46, [[0, '#5f88c9'], [1, '#2c5799']]);
    g.restore();
    this.txt(`${P.first} ${P.last}`.trim(), x + 16, y + 29, { size: 16, w: 700, color: '#fff' });

    SECTIONS.forEach((s, i) => {
      const iy = y + 46 + i * itemH;
      const id = 'open:' + s.id;
      if (this.hover === id) this.rect(x + 1, iy, w - 2, itemH, 'rgba(47,95,168,.16)');
      this.drawIconArt(s.icon, x + 12, iy + 6, 20);
      this.txt(s.label, x + 44, iy + 21, { size: 15, color: C.ink });
      this.hit(x + 1, iy, w - 2, itemH, id);
    });

    const sy = y + 46 + SECTIONS.length * itemH + 7;
    this.rect(x + 12, sy, w - 24, 1, '#d8d5d0');
    const oy = sy + 8;
    if (this.hover === 'off') this.rect(x + 1, oy, w - 2, 30, 'rgba(193,64,44,.12)');
    g.strokeStyle = '#c1402c'; g.lineWidth = 2; g.lineCap = 'round';
    g.beginPath(); g.arc(x + 23, oy + 16, 7, -Math.PI * 0.36, Math.PI * 1.36); g.stroke();
    g.beginPath(); g.moveTo(x + 23, oy + 6); g.lineTo(x + 23, oy + 15); g.stroke();
    this.txt('Turn off computer', x + 44, oy + 21, { size: 15, color: C.ink });
    this.hit(x + 1, oy, w - 2, 30, 'off');
  }

  drawToast() {
    const g = this.g;
    const t = this.toast;
    g.globalAlpha = Math.min(1, t.t / 0.4);
    const tw = this.measure(t.text, 15) + 36;
    const x = (VW - tw) / 2, y = VH - BAR - 56;
    this.round(x, y, tw, 34, 17, 'rgba(16,19,26,.82)', 'rgba(246,239,228,.24)');
    this.txt(t.text, VW / 2, y + 22, { size: 15, color: C.cream, align: 'center' });
    g.globalAlpha = 1;
  }
}

/** Nudge a hex colour toward white — used for the hovered window buttons. */
function lighten(hex, amount = 0.18) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
}

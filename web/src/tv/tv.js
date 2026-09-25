// ---------------------------------------------------------------------------
//  The living-room TV's screen.
//
//  Session 3 proved a canvas texture can be drawn onto a mesh for the desk's
//  Monitor_Screen — but that mesh was first split out of the desktop model in
//  Blender so it had its own clean UVs. The TV in MeraGHAR.glb never got that
//  treatment (still one solid voxel object, single material, no screen face
//  — see story-todo.md), and Blender's MCP server isn't reachable to do it
//  now. So this screen is a SEPARATE overlay plane, not a mesh lookup: sized
//  and positioned from CONFIG.tv.screen (see config.js for how those numbers
//  were derived, and the note that they're computed, not yet eyeballed live).
//
//  The animation itself — Episode Complete → autoplay → a montage of the
//  night → 6AM → the personal caption — is a straight Canvas2D port of the
//  "COASTLINE" composition Apoorva designed as a Claude Design prototype
//  (animations-v3.jsx / tv-screen-scene.jsx). No React, no DOM: everything
//  below is ctx.fillRect/ctx.fillText, driven by one local clock, the same
//  way desktop.js draws the bedroom monitor.
//
//  Off until the visitor discovers the `tv` story star (main.js calls
//  play() from story.js's onReveal), then loops the full sequence
//  continuously — the "still watching" beat replays every lap, same as a
//  TV genuinely left on.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { CONFIG } from '../config/config.js';
import { playSfx } from '../sfx/sfx.js';

const T = CONFIG.tv;

// ---- timing helpers (ported from animations-v3.jsx / tv-screen-scene.jsx) -

const Easing = {
  easeOutCubic:   (t) => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  easeInOutQuad:  (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
};
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
function animate({ from = 0, to = 1, start = 0, end = 1, ease = Easing.easeInOutCubic }) {
  return (t) => {
    if (t <= start) return from;
    if (t >= end) return to;
    return from + (to - from) * ease((t - start) / (end - start));
  };
}
function band(t, start, end, fade = 0.2) {
  fade = Math.min(fade, (end - start) / 2);
  if (t < start || t > end) return 0;
  // the opening card has no fade-in, so the loop seam matches its last frame
  if (start > 0.001 && t < start + fade) return clamp((t - start) / fade, 0, 1);
  if (t > end - fade) return clamp((end - t) / fade, 0, 1);
  return 1;
}
function flash(t, at, half = 0.28) { return clamp(1 - Math.abs(t - at) / half, 0, 1); }
const pop = (t, at, dur = 0.3) => { const x = clamp((t - at) / dur, 0, 1); return Math.sin(x * Math.PI); };

// ---- the authored scene list (OM_SCENES from the design prototype) --------

const SCENES = [
  { name: 'Episode End', dur: 2.2 },
  { name: 'Autoplay', dur: 0.6 },
  { name: 'Montage', dur: 1.8 },
  { name: '6AM', dur: 1.8 },
  { name: 'Voice Moment', dur: 2.6 },
];
export const CUES = (() => {
  const t = {}; let acc = 0;
  for (const s of SCENES) { t[s.name] = acc; acc += s.dur; }
  t.total = acc;
  return t;
})();

// Session 30: down from 5 episodes (+ a 6th, E9, only ever flashed at the
// very end) to 3 — Apoorva's own read was "it is a lil too much that so many
// episodes go on, maybe 3-4 is ok". `buildCards()`/`minutesAt()` below are
// written against `EPISODES.length`, not a hardcoded chunk count, so this
// array is the one thing to edit to retune it again.
//
// Session 32: `minutes` is now "minutes since 9:00 PM", not since midnight —
// Apoorva's ask was for the night to start at 11 PM, not 1 AM. 120 = 11:00
// PM, 540 = 6:00 AM (9pm + 9h), evenly split at 330 = 2:30 AM. See
// `clockDigitsAt()` below for how a value on this scale becomes an actual
// HH:MM + AM/PM reading.
const EPISODES = [
  { minutes: 120, title: 'S2 · E4 — The Long Way Round' },
  { minutes: 330, title: 'S2 · E5 — Low Tide' },
  { minutes: 540, title: 'S2 · E6 — Static' },
];
const HUES = [206, 256, 18];
// The one still-further flash after "Voice Moment" starts, same role E9 had.
const NEXT_UP = { title: 'S2 · E9 — Departures, Pt. 2', hue: 224 };

function buildCards() {
  // The TV shows the design's three cards: the opener, ONE quick montage
  // cut (m0), and the 6AM card. `chunkDur` is only for minutesAt() — the
  // hall clock still walks through every EPISODES entry across the montage.
  const chunks = EPISODES.length - 1;
  const chunkDur = (CUES['6AM'] - CUES.Montage) / chunks;
  const list = [
    { key: 'ep0', hue: HUES[0], title: EPISODES[0].title, start: 0, end: CUES.Montage, mainText: 'JUST ONE MORE EPISODE.', buttonLabel: 'NEXT EPISODE', ringWindow: [CUES.Autoplay, CUES.Autoplay + 0.9], popAt: CUES.Autoplay + 0.9 },
    { key: 'm0', hue: HUES[1], title: EPISODES[1].title, start: CUES.Montage, end: CUES['6AM'], buttonLabel: 'NEXT EPISODE', chunk: true, ringWindow: [CUES.Montage + 0.8, CUES.Montage + 1.3], popAt: CUES.Montage + 1.3 },
    { key: 'sixam', hue: HUES[2], title: EPISODES[2].title, start: CUES['6AM'], end: CUES['Voice Moment'], mainText: 'ONE EPISODE LEFT.', buttonLabel: 'Last episode', ringWindow: [CUES['6AM'] + 0.7, CUES['6AM'] + 1.3], popAt: CUES['6AM'] + 1.3 },
  ];
  return { chunkDur, list };
}
const CARDS = buildCards();

// How "night" the house should feel while this plays, 1..0. Tracks the same
// clock as the screen: full night through the small hours, then eases out
// as `minutesAt` crosses 5 AM (480 minutes since 9 PM) to 0 right at 6 AM
// (540) — the cue for the hall lamp/room dimming (main.js) to fade back up
// to day, same moment the "6AM" card lands on screen.
export function nightLevelAt(t) {
  const m = minutesAt(t);
  return 1 - clamp((m - 480) / (540 - 480), 0, 1);
}

export function minutesAt(t) {
  const { chunkDur } = CARDS;
  const chunks = EPISODES.length - 1;
  if (t < CUES.Montage) return EPISODES[0].minutes;
  if (t < CUES['6AM']) {
    const i = clamp(Math.floor((t - CUES.Montage) / chunkDur), 0, chunks - 1);
    const segStart = CUES.Montage + i * chunkDur, segEnd = segStart + chunkDur;
    return animate({ from: EPISODES[i].minutes, to: EPISODES[i + 1].minutes, start: segStart, end: segEnd, ease: Easing.easeInOutCubic })(t);
  }
  return EPISODES[EPISODES.length - 1].minutes;
}

// Named hours the sequence passes through, in order, each as a 12-hour
// clock reading. Used by clockDigitsAt() below to turn a `minutesAt()`
// value into HH:MM + AM/PM.
const NAMED_HOURS = [
  { hours12: 11, isPM: true },   // 11 PM — EPISODES[0]
  { hours12: 12, isPM: false },  // 12 AM (midnight)
  { hours12: 1, isPM: false },   // 1 AM
  { hours12: 2, isPM: false },   // 2 AM
  { hours12: 3, isPM: false },   // 3 AM
  { hours12: 4, isPM: false },   // 4 AM
  { hours12: 5, isPM: false },   // 5 AM
  { hours12: 6, isPM: false },   // 6 AM — EPISODES[last], held here forever
];
const HOUR_ORIGIN = EPISODES[0].minutes;   // where "11 PM" sits on this timeline

/**
 * The clock's four rolling digits (HH:MM) plus AM/PM, from the same
 * `minutesAt()` timeline both the TV's corner clock and the hall's
 * HallClock share.
 *
 * Two digits for the hour, not one: the old corner clock only ever showed
 * 1-6, a single digit that could just count up. Once the range starts at
 * 11 PM, "12" needs two digits, and 11 -> 12 -> 1 genuinely *decreases* at
 * the hour — plain incrementing math can't roll through that smoothly.
 * Instead this linearly interpolates each digit between its value at the
 * start of the current named hour and its value at the start of the next
 * one, which handles the normal counting-up hours and that one
 * counting-down hour with the same formula: drawOdometerDigit doesn't care
 * which way `value` is moving, only where it currently sits, so a
 * decreasing interpolation rolls just as smoothly as an increasing one.
 */
export function clockDigitsAt(minutesSince9pm) {
  const maxM = HOUR_ORIGIN + (NAMED_HOURS.length - 1) * 60;
  if (minutesSince9pm >= maxM) {
    const last = NAMED_HOURS[NAMED_HOURS.length - 1];
    return { hourTens: Math.floor(last.hours12 / 10), hourOnes: last.hours12 % 10, minuteTens: 0, minuteOnes: 0, isPM: last.isPM };
  }
  const m = Math.max(HOUR_ORIGIN, minutesSince9pm);
  const idx = Math.floor((m - HOUR_ORIGIN) / 60);
  const frac = (m - HOUR_ORIGIN - idx * 60) / 60;
  const cur = NAMED_HOURS[idx], next = NAMED_HOURS[idx + 1];

  const curTens = Math.floor(cur.hours12 / 10), curOnes = cur.hours12 % 10;
  const nextTens = Math.floor(next.hours12 / 10), nextOnes = next.hours12 % 10;
  const minuteAbs = frac * 60;   // continuous 0..<60 minutes into the current named hour

  return {
    hourTens: curTens + (nextTens - curTens) * frac,
    hourOnes: curOnes + (nextOnes - curOnes) * frac,
    minuteTens: minuteAbs / 10,
    minuteOnes: minuteAbs,
    isPM: cur.isPM,
  };
}

const QUOTE = "I'm a sucker for a good story… and all the craft behind it.";

// ---- Canvas2D drawing (1920x1080-authored coordinates, scaled by S) -------

const ORIG_W = 1920;
// Site-wide typography, ported onto the TV's canvas: Coda for subtitles/
// captions, Bitcount Grid Single for the headline moments and the NEXT
// button, Space Mono kept as a minimal accent on the rolling-clock
// digits and the EPISODE COMPLETE badge.
const FONT = "'Coda', ui-sans-serif, system-ui, sans-serif";
const FONT_MAJOR = "'Bitcount Grid Single', ui-monospace, monospace";
const MONO = "'Space Mono', ui-monospace, monospace";

function ellipseGradient(g, cx, cy, rx, ry, stops) {
  g.save();
  g.translate(cx, cy);
  g.scale(rx || 1, ry || 1);
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (const [off, col] of stops) grad.addColorStop(off, col);
  g.fillStyle = grad;
  g.fillRect(-1, -1, 2, 2);
  g.restore();
}

function drawBackdrop(g, w, h, S, hue, opacity) {
  if (opacity <= 0.001) return;
  g.save();
  g.globalAlpha = opacity;
  ellipseGradient(g, w * 0.30, h * 0.18, w * 0.62, h * 0.62, [
    [0, `oklch(32% 0.05 ${hue})`],
    [0.55, `oklch(13% 0.02 ${hue})`],
    [1, `oklch(6% 0.012 ${hue})`],
  ]);
  g.filter = `blur(${38 * S}px)`;
  const glowY = h * 0.54, glowH = 150 * S;
  const bandGrad = g.createLinearGradient(0, glowY, 0, glowY + glowH);
  bandGrad.addColorStop(0, 'transparent');
  bandGrad.addColorStop(0.5, `oklch(58% 0.08 ${hue} / 0.32)`);
  bandGrad.addColorStop(1, 'transparent');
  g.fillStyle = bandGrad;
  g.fillRect(-w * 0.1, glowY, w * 1.2, glowH);

  // The design blurs each glow by its own amount: 38px band, 90px top-right
  // orb, 80px bottom-left orb (tv-screen-scene.jsx Backdrop).
  g.filter = `blur(${90 * S}px)`;
  g.beginPath();
  g.fillStyle = `oklch(55% 0.09 ${hue} / 0.30)`;
  g.arc(w * 0.62 + 230 * S, h * -0.08 + 230 * S, 230 * S, 0, Math.PI * 2);
  g.fill();
  g.filter = `blur(${80 * S}px)`;
  g.beginPath();
  g.fillStyle = `oklch(45% 0.07 ${hue} / 0.22)`;
  g.arc(w * 0.04 + 160 * S, h * 0.58 + 160 * S, 160 * S, 0, Math.PI * 2);
  g.fill();
  g.filter = 'none';
  g.restore();
}

function drawLowerGradient(g, w, h) {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0.38, 'transparent');
  grad.addColorStop(0.66, 'rgba(4,4,6,0.55)');
  grad.addColorStop(1, 'rgba(2,2,3,0.92)');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
}

export function drawOdometerDigit(g, x, y, value, S, size) {
  const boxW = size * 0.62;
  const v = ((value % 10) + 10) % 10;
  g.save();
  g.beginPath();
  g.rect(x, y, boxW, size);
  g.clip();
  g.fillStyle = 'rgba(244,241,234,0.9)';
  g.font = `700 ${size}px ${MONO}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 0; i <= 10; i++) {
    const top = i * size - v * size;
    if (top < -size || top > size) continue;
    const digit = i % 10;
    g.fillText(String(digit), x + boxW / 2, y + top + size / 2 + size * 0.03);
  }
  g.restore();
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function drawNextButton(g, w, h, S, cfg, ringP, scale, glow, accent) {
  g.save();
  // Session 30: padding and label size both up ~25% — Apoorva flagged the
  // NEXT EPISODE button as too small to read/tap at a glance. Position math
  // below is all in terms of btnW/btnH, which grow from these, so nothing
  // else needed to move.
  const padX = 44 * S, padY = 22 * S;
  g.font = `700 ${25 * S}px ${FONT_MAJOR}`;
  const textW = g.measureText(cfg.buttonLabel.toUpperCase()).width;
  const btnW = textW + padX * 2 + 32 * S;
  const btnH = 25 * S + padY * 2 + 4 * S;
  const x = w - 96 * S - btnW * scale;
  const y = h - 140 * S - btnH * scale;
  g.translate(x + btnW / 2, y + btnH / 2);
  g.scale(scale, scale);
  g.translate(-btnW / 2, -btnH / 2);

  if (glow > 0) {
    g.shadowColor = accent;
    g.shadowBlur = 30 * S * glow;
  }
  roundRect(g, 0, 0, btnW, btnH, btnH / 2);
  g.fillStyle = 'rgba(16,16,19,0.85)';
  g.fill();
  g.shadowBlur = 0;
  g.lineWidth = 1;
  g.strokeStyle = glow > 0 ? accent : 'rgba(255,255,255,0.16)';
  g.stroke();

  g.save();
  roundRect(g, 0, 0, btnW, btnH, btnH / 2);
  g.clip();
  g.globalAlpha = 0.22;
  g.fillStyle = accent;
  g.fillRect(0, 0, btnW * clamp(ringP, 0, 1), btnH);
  g.restore();

  g.globalAlpha = 1;
  g.fillStyle = '#fff';
  g.font = `${20 * S}px ${FONT_MAJOR}`;
  g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText('▶', padX * 0.5, btnH / 2);
  g.font = `700 ${25 * S}px ${FONT_MAJOR}`;
  g.fillText(cfg.buttonLabel.toUpperCase(), padX * 0.5 + 32 * S, btnH / 2 + 1 * S);
  g.restore();
}

function drawCard(g, w, h, S, cfg, t, showName, accent) {
  const op = band(t, cfg.start, cfg.key === 'sixam' ? CUES['Voice Moment'] : cfg.end, 0.5);
  if (op <= 0.001) return;
  const dur = cfg.end - cfg.start;
  const progress = cfg.mainText
    ? 0.82 + 0.18 * clamp((t - cfg.start) / Math.max(dur - 0.6, 0.1), 0, 1)
    : animate({ from: 0, to: 1, start: cfg.start + dur * 0.15, end: cfg.start + dur * 0.8 })(t);
  const ringP = clamp((t - cfg.ringWindow[0]) / (cfg.ringWindow[1] - cfg.ringWindow[0]), 0, 1);
  const bump = pop(t, cfg.popAt, 0.32);
  const scale = 1 + 0.07 * bump;
  const glow = ringP > 0.02 ? 0.25 + ringP * 0.65 : 0;
  const flashOp = cfg.chunk ? flash(t, cfg.start + 0.25, 0.55) : 0;

  g.save();
  g.globalAlpha = op;

  if (cfg.chunk && flashOp > 0.001) {
    g.save();
    g.globalAlpha = op * flashOp;
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.textAlign = 'center';
    g.font = `600 ${20 * S}px ${FONT_MAJOR}`;
    g.fillText(showName.toUpperCase(), w * 0.5, h * 0.42 - 10 * S);
    g.font = `500 ${26 * S}px ${FONT}`;
    g.globalAlpha = op * flashOp * 0.85;
    g.fillText(cfg.title, w * 0.5, h * 0.42 + 22 * S);
    g.restore();
  }

  // Stacked bottom-up, mirroring the CSS column (bottom-anchored, content
  // growing upward): the subtitle's baseline is fixed, and the headline +
  // kicker sit progressively higher above it.
  g.textAlign = 'left';
  const left = 96 * S;
  const subtitleY = h - 172 * S;
  g.fillStyle = 'rgba(255,255,255,0.68)';
  g.font = `${24 * S}px ${FONT}`;
  g.fillText(`${showName} — ${cfg.title}`, left, subtitleY);

  let kickerY;
  if (cfg.mainText) {
    const mainY = subtitleY - 24 * S * 1.3 - 16 * S;
    g.fillStyle = '#f4f1ea';
    g.font = `700 ${64 * S}px ${FONT_MAJOR}`;
    g.fillText(cfg.mainText, left, mainY);
    kickerY = mainY - 64 * S * 1.05 - 14 * S;
  } else {
    kickerY = subtitleY - 24 * S * 1.3 - 10 * S;
  }
  g.fillStyle = accent;
  g.font = `700 ${20 * S}px ${MONO}`;
  g.fillText('EPISODE COMPLETE', left, kickerY);

  // progress bar
  const barY = h - 112 * S, barLeft = 96 * S, barRight = w - 340 * S;
  g.fillStyle = 'rgba(255,255,255,0.16)';
  roundRect(g, barLeft, barY, barRight - barLeft, 4 * S, 2 * S);
  g.fill();
  g.fillStyle = accent;
  roundRect(g, barLeft, barY, (barRight - barLeft) * progress, 4 * S, 2 * S);
  g.fill();

  if (!cfg.chunk) {
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.font = `${18 * S}px ${FONT}`;
    const rowY = h - 76 * S;
    const label1 = '↺ REPLAY';
    g.fillText(label1, left, rowY);
    g.fillText('☰ EPISODES', left + g.measureText(label1).width + 32 * S, rowY);
  }

  drawNextButton(g, w, h, S, cfg, ringP, scale, glow, accent);
  g.restore();
}

function drawFrame(g, w, h, t, showName, accent) {
  const S = w / ORIG_W;
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#050608';
  g.fillRect(0, 0, w, h);

  for (const cfg of CARDS.list) {
    const end = cfg.key === 'sixam' ? 20.5 : cfg.end;
    drawBackdrop(g, w, h, S, cfg.hue, band(t, cfg.start, end, 0.5));
  }
  drawLowerGradient(g, w, h);

  for (const cfg of CARDS.list) drawCard(g, w, h, S, cfg, t, showName, accent);

  const e9FlashOp = flash(t, CUES['Voice Moment'] + 0.08, 0.15);
  if (e9FlashOp > 0.001) {
    g.save();
    g.globalAlpha = e9FlashOp;
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.textAlign = 'center';
    g.font = `600 ${20 * S}px ${FONT_MAJOR}`;
    g.fillText(showName, w * 0.5, h * 0.40 - 10 * S);
    g.font = `500 ${26 * S}px ${FONT}`;
    g.globalAlpha = e9FlashOp * 0.85;
    g.fillText(NEXT_UP.title, w * 0.5, h * 0.40 + 22 * S);
    g.restore();
  }

  const dim = animate({ from: 0, to: 0.5, start: CUES['Voice Moment'] + 0.15, end: CUES['Voice Moment'] + 0.65, ease: Easing.easeOutCubic })(t);
  if (dim > 0.001) { g.fillStyle = `rgba(0,0,0,${dim})`; g.fillRect(0, 0, w, h); }

  const cutBoundaries = [CUES.Montage, CUES['6AM'], CUES['Voice Moment']];
  const cutFlash = Math.max(...cutBoundaries.map((b) => flash(t, b, 0.08))) * 0.12;
  if (cutFlash > 0.001) { g.fillStyle = `rgba(255,255,255,${cutFlash})`; g.fillRect(0, 0, w, h); }

  const captionStart = CUES['Voice Moment'] + 0.1;
  const captionOp = animate({ start: captionStart, end: captionStart + 0.3, ease: Easing.easeOutCubic })(t);
  if (captionOp > 0.001) {
    const typedChars = Math.floor(clamp((t - captionStart - 0.05) / 0.9, 0, 1) * QUOTE.length);
    const typing = typedChars < QUOTE.length;
    g.save();
    g.globalAlpha = captionOp;
    g.fillStyle = '#f4f1ea';
    g.font = `italic ${60 * S}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    const shown = `"${QUOTE.slice(0, typedChars)}${typing && Math.floor(t * 2) % 2 ? '|' : ''}"`;
    wrapText(g, shown, w * 0.5, h * 0.5, w - 400 * S, 60 * S * 1.4);
    g.restore();
  }
}

function wrapText(g, text, cx, cy, maxWidth, lineHeight) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (g.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
    else line = test;
  }
  if (line) lines.push(line);
  const startY = cy - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((l, i) => g.fillText(l, cx, startY + i * lineHeight));
}

// ---------------------------------------------------------------------------

export class TVScreen {
  constructor(scene) {
    const S = T.screen;
    const w = S.zMax - S.zMin, h = S.yMax - S.yMin;

    this.canvas = document.createElement('canvas');
    this.canvas.width = T.canvas.width;
    this.canvas.height = T.canvas.height;
    this.g = this.canvas.getContext('2d');

    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
    if (S.flipX) { this.tex.wrapS = THREE.RepeatWrapping; this.tex.repeat.x = -1; this.tex.offset.x = 1; }

    const mat = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    this.mesh.position.set(S.x, (S.yMin + S.yMax) / 2, (S.zMin + S.zMax) / 2);
    this.mesh.rotation.y = Math.PI / 2;   // normal -> +X, toward the room
    this.mesh.name = 'TV_Screen_overlay';
    scene.add(this.mesh);

    this.on = false;
    this.t = 0;
    this.nightDone = false;   // latched at the first 6 AM — the night plays once, never again
  }

  /** 1..0 — how "night" the room should feel right now (main.js reads this
   *  to dim the house and light the hall lamp while the TV is playing). 0
   *  before the TV has ever been switched on. */
  get nightLevel() {
    return this.on && !this.nightDone ? nightLevelAt(this.t) : 0;
  }

  /** Fired from story.js's onReveal('tv'), and (Session 48) again every
   *  time the visitor sits back down on the sofa once the star is found. */
  play() {
    if (this.on) return;
    this.on = true;
    this.t = 0;
    this.nightDone = false;   // a fresh sit-down gets the whole night again
    playSfx('netflixTudum');
    this.mesh.material.map = this.tex;
    // The screen's "off" look is a black panel, which it gets from
    // material.color. But MeshBasicMaterial MULTIPLIES map by color, so
    // leaving it black multiplies the texture down to nothing too — the
    // sequence drew every frame and still rendered as a dead black rectangle.
    // Once there is something to show, the base colour has to go white.
    this.mesh.material.color.setHex(0xffffff);
    this.mesh.material.needsUpdate = true;
  }

  /** Session 48: screens are only on while you're using them. Getting up
   *  off the sofa switches the TV back to its black "off" panel (and with
   *  `on` false, nightLevel drops to 0, so the room lights come back too). */
  stop() {
    if (!this.on) return;
    this.on = false;
    this.t = 0;
    this.mesh.material.map = null;
    this.mesh.material.color.setHex(0x000000);
    this.mesh.material.needsUpdate = true;
  }

  update(dt) {
    if (!this.on) return;
    this.t += dt;
    if (this.t >= CUES['6AM']) this.nightDone = true;   // sunrise: lamp off, house stays bright
    if (this.t >= CUES.total) this.t -= CUES.total;   // loop the whole sequence
    drawFrame(this.g, this.canvas.width, this.canvas.height, this.t, T.showName, T.accent);
    this.tex.needsUpdate = true;
  }
}

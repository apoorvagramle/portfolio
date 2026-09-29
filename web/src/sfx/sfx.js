// ---------------------------------------------------------------------------
//  A tiny sound-effect player, shared by every module that needs one.
//
//  Clips live in `CONFIG.sfx` (id -> { src, volume } or { variants, volume })
//  — the same "empty/missing src means not recorded yet, not an error"
//  convention as `backgroundMusic.src` and `story.js`'s `voice.src`. That
//  means a call site can be wired up before the file exists, and a clip can
//  be dropped or renamed later without anything throwing.
//
//  An id with a `variants` array (footstep, footstepGrass — 19 Sep 2026)
//  picks one at random on every call instead of a single fixed `src`, so a
//  repeated cue (steps in particular) doesn't sound like the same sample on
//  a loop.
//
//  `playSfx` clones the underlying <audio> on every call, so two overlapping
//  plays (a door that reopens before its first clunk finishes, a fast
//  double-click) don't cut each other off. `startLoop` / `stopLoop` are for
//  the one ambient case (the garden room) — at most one instance per id.
// ---------------------------------------------------------------------------
import { CONFIG } from '../config/config.js';

const templates = new Map();   // resolved src -> HTMLAudioElement, built once per src

function templateFor(src, volume) {
  if (templates.has(src)) return templates.get(src);
  const audio = new Audio(new URL(src, document.baseURI).href);
  audio.preload = 'auto';
  audio.volume = volume ?? 0.8;
  templates.set(src, audio);
  return audio;
}

/** Resolve an sfx id to a concrete src for this call — a random pick from
 *  `variants` when present, else the plain `src`, else null (not configured
 *  yet). */
function pick(id) {
  const def = CONFIG.sfx?.[id];
  if (!def) return null;
  if (def.variants?.length) {
    return { src: def.variants[Math.floor(Math.random() * def.variants.length)], volume: def.volume };
  }
  if (def.src) return { src: def.src, volume: def.volume };
  return null;
}

// Web Audio path: every clip is fetched and decoded once, up front, so a play
// is an instant buffer start. Cloning an <audio> element (the old approach)
// could re-fetch or start late and get dropped, which made cues miss at random.
// The element path below stays as the fallback until a buffer is ready.
const AC = window.AudioContext || window.webkitAudioContext;
const ctx = AC ? new AC() : null;
const buffers = new Map();   // resolved src -> AudioBuffer
const loading = new Set();

function resolve(src) { return new URL(src, document.baseURI).href; }

function loadBuffer(src) {
  const url = resolve(src);
  if (!ctx || buffers.has(url) || loading.has(url)) return;
  loading.add(url);
  fetch(url)
    .then((r) => r.arrayBuffer())
    .then((data) => ctx.decodeAudioData(data))
    .then((buf) => buffers.set(url, buf))
    .catch(() => {})   // stay on the element fallback
    .finally(() => loading.delete(url));
}

function preloadAll() {
  for (const def of Object.values(CONFIG.sfx ?? {})) {
    if (def?.src) loadBuffer(def.src);
    for (const v of def?.variants ?? []) loadBuffer(v);
  }
}
preloadAll();

function unlock() { if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {}); }
for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
  addEventListener(ev, unlock, { capture: true, passive: true });
}

// ---------------------------------------------------------------------------
//  Ducking the background bed.
//
//  Bug (Sept 2026, reported after hosting): the garden's ambient loop and
//  the house music played on top of each other with nothing coordinating
//  them, and on a phone's single speaker that reads as a mush rather than
//  two distinct sounds. The instrument song already solved this for itself
//  by pausing the house music outright — everything else here should duck
//  it (fade it down, not stop it) while it plays and let it back up when
//  it's done, which is what main.js actually wires to its own background
//  track via `onDuck` below.
//
//  Sources register a token while they're audible and release it when
//  they're not; the bed only comes back once every token has been
//  released. `typewriterKey` is deliberately excluded — it fires on nearly
//  every line of narration anywhere in the house, and ducking the music
//  for each keystroke would make it pump constantly rather than fixing an
//  actual clash.
// ---------------------------------------------------------------------------
const NO_DUCK = new Set(['typewriterKey']);
const duckSources = new Set();
const duckListeners = new Set();

function notifyDuck() {
  const active = duckSources.size > 0;
  for (const fn of duckListeners) fn(active);
}

/** Register something that should duck the background bed while it's
 *  audible. Returns a release function — call it when the sound stops.
 *  Safe to call from several sources at once; the bed only comes back once
 *  every one of them has released. */
export function duck(token) {
  duckSources.add(token);
  notifyDuck();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    duckSources.delete(token);
    notifyDuck();
  };
}

/** Subscribe to duck state changes: `cb(true)` when something starts
 *  playing over the bed, `cb(false)` once everything has released it.
 *  Returns an unsubscribe function. */
export function onDuck(cb) {
  duckListeners.add(cb);
  return () => duckListeners.delete(cb);
}

/** Start a decoded clip; returns the source node, or null if not decoded yet. */
function playBuffer(src, volume, loop = false) {
  const buf = ctx && buffers.get(resolve(src));
  if (!buf) return null;
  unlock();
  const source = ctx.createBufferSource();
  source.buffer = buf;
  source.loop = loop;
  const gain = ctx.createGain();
  gain.gain.value = volume ?? 0.8;
  source.connect(gain).connect(ctx.destination);
  source.start(0);
  return source;
}

/** Fire a one-shot sound effect by id. A silent no-op for an id with no src
 *  (or variants) configured yet, or no id at all — safe to call
 *  speculatively. */
export function playSfx(id, { volume } = {}) {
  if (!id) return;
  const chosen = pick(id);
  if (!chosen) return;
  const vol = volume ?? chosen.volume ?? 0.8;
  if (playBuffer(chosen.src, vol)) return;
  loadBuffer(chosen.src);
  const template = templateFor(chosen.src, chosen.volume);
  const node = template.cloneNode(true);
  node.volume = vol;
  node.play().catch(() => {});   // browsers can refuse before the first gesture
}

let tickTimer = 0;
/** Keyboard typing while a character lands: the clip loops as long as ticks
 *  keep coming and stops shortly after the last one. */
export function typeTick(ch = 'x') {
  if (/\s/.test(ch)) return;
  startLoop('typewriterKey');
  clearTimeout(tickTimer);
  tickTimer = setTimeout(() => stopLoop('typewriterKey'), 180);
}

const loops = new Map();   // id -> the playing Audio node, at most one per id

/** Start a looping ambient clip by id. Safe to call repeatedly — a second
 *  call while it's already running does nothing. Ducks the background bed
 *  for as long as it plays (see `duck` above), except `typewriterKey`. */
export function startLoop(id, { volume } = {}) {
  if (!id || loops.has(id)) return;
  const chosen = pick(id);
  if (!chosen) return;
  const vol = volume ?? chosen.volume ?? 0.8;
  const release = NO_DUCK.has(id) ? null : duck(`loop:${id}`);
  const src = playBuffer(chosen.src, vol, true);
  if (src) { loops.set(id, { pause: () => { src.stop(); release?.(); } }); return; }
  loadBuffer(chosen.src);
  const template = templateFor(chosen.src, chosen.volume);
  const node = template.cloneNode(true);
  node.loop = true;
  node.volume = vol;
  node.play().catch(() => {});
  loops.set(id, { pause: () => { node.pause(); release?.(); } });
}

/** Stop a loop started with `startLoop`. Safe to call if it isn't playing. */
export function stopLoop(id) {
  const entry = loops.get(id);
  if (!entry) return;
  entry.pause();
  loops.delete(id);
}

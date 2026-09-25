// ---------------------------------------------------------------------------
//  Procedurally-generated footstep sounds — no recorded clip needed.
//
//  Apoorva doesn't have a footstep or grass recording to hand, so rather
//  than waiting on that, footsteps.js can just synthesize both with the Web
//  Audio API: shape a shared noise buffer with a filter and a short
//  envelope, a little differently every call so it doesn't loop like one
//  exact sample on repeat. If real recordings show up later in
//  CONFIG.sfx.footstep / footstepGrass, footsteps.js prefers those and this
//  file goes quiet on its own — see the `src` check there.
//
//    floor  — a soft low thud: heavily low-passed noise plus a short
//             pitched-down sine "knock" underneath it.
//    grass  — a brighter, longer rustle: high-passed then band-passed noise,
//             no low end at all.
// ---------------------------------------------------------------------------

let ctx = null;
let noiseBuffer = null;

function getCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  return ctx;
}

/** One second of white noise, built once and reused (sliced short per call
 *  via each BufferSource's own start/stop) — cheaper than making fresh
 *  random data on every single step. */
function getNoiseBuffer(c) {
  if (noiseBuffer) return noiseBuffer;
  const seconds = 1;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buf;
  return buf;
}

/** Attack/hold/decay on a GainNode, in seconds, peaking at `peak`. */
function envelope(gainNode, t, attack, hold, decay, peak) {
  const g = gainNode.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(0.0001, t);
  g.linearRampToValueAtTime(peak, t + attack);
  g.setValueAtTime(peak, t + attack + hold);
  g.exponentialRampToValueAtTime(0.0001, t + attack + hold + decay);
}

/** A soft, low thud — bare floor underfoot. */
export function playFootstepFloor({ volume = 0.35 } = {}) {
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime;

  // The "tap": noise, low-passed hard enough to read as a thud, not a hiss.
  const src = c.createBufferSource();
  src.buffer = getNoiseBuffer(c);
  const filt = c.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = 240 + Math.random() * 90;
  filt.Q.value = 0.6;
  const gain = c.createGain();
  src.connect(filt).connect(gain).connect(c.destination);
  envelope(gain, t, 0.001, 0.008, 0.09, volume);
  src.start(t);
  src.stop(t + 0.14);

  // A little body under the tap — a short, falling sine "knock".
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(90 + Math.random() * 20, t);
  osc.frequency.exponentialRampToValueAtTime(52, t + 0.08);
  const oscGain = c.createGain();
  osc.connect(oscGain).connect(c.destination);
  envelope(oscGain, t, 0.001, 0.004, 0.07, volume * 0.55);
  osc.start(t);
  osc.stop(t + 0.1);
}

/** A brighter, longer rustle — walking through grass. */
export function playFootstepGrass({ volume = 0.35 } = {}) {
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime;

  const src = c.createBufferSource();
  src.buffer = getNoiseBuffer(c);
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 800;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2000 + Math.random() * 900;
  bp.Q.value = 0.8;
  const gain = c.createGain();
  src.connect(hp).connect(bp).connect(gain).connect(c.destination);
  envelope(gain, t, 0.002, 0.015, 0.17, volume);
  src.start(t);
  src.stop(t + 0.22);
}

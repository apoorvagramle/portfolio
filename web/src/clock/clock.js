// ---------------------------------------------------------------------------
//  The hall's `Clock.001` — a second, bigger read of the TV's own rolling
//  clock (tv.js), so the time is visible "on the side" while watching rather
//  than only in the TV's small corner readout.
//
//  Same trick as tv.js's screen: `Clock.001` is one merged voxel mesh, its
//  "12:38" digits carved as real relief geometry (not a texture) on a single
//  palette material — no clean UVs to draw on, and no separate digit meshes
//  to key. So this is a SEPARATE overlay plane sat just in front of the
//  carved face (CONFIG.clock.screen — see config.js for how those numbers
//  were measured off Clock.001 in Blender), not a texture on the mesh
//  itself.
//
//  Session 32: the overlay is visible from the start now, not just once
//  play() fires — Apoorva's ask was that the resting face ("stale", before
//  the TV star is found) read the same as the rolling one, not the old
//  carved relief in one style and a completely different flat-digit look
//  once it wakes up. So the plane is drawn once at construction with a
//  frozen idle time (the sequence's own opening minute, 11:00 PM — the
//  exact reading the rolling clock would show first anyway), in the
//  identical drawFace() the live animation uses, and the carved face
//  underneath is hidden for good the moment the app loads. Background is
//  `#5C5347` (Apoorva's pick, over tv.js's near-black) — this sits in the
//  room, not on a screen, so it reads as a lit dial rather than a dead TV
//  panel.
//
//  Driven by the exact same `minutesAt()`/`clockDigitsAt()`/`CUES` tv.js
//  uses for its own corner clock — imported, not re-derived — so the two
//  displays are always showing the same moment, not just visually similar
//  ones. `play()` is fired from the same story.js `onReveal('tv')` moment
//  that starts the TV, and this loops in lockstep with it for the same
//  reason: a clock that ran on its own timer would drift out of sync with
//  the TV's, one frame at a time, until the two disagreed.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { CONFIG } from '../config/config.js';
import { minutesAt, drawOdometerDigit, clockDigitsAt, CUES } from '../tv/tv.js';

const C = CONFIG.clock;
const MONO = "'Space Mono', ui-monospace, monospace";

function drawFace(g, w, h, minutesAbs) {
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#5C5347';
  g.fillRect(0, 0, w, h);

  const { hourTens, hourOnes, minuteTens, minuteOnes, isPM } = clockDigitsAt(minutesAbs);

  // Sized to fill the face with a little breathing room, same odometer
  // digits tv.js's corner clock uses (drawOdometerDigit), just laid out
  // centered and large instead of tucked in a corner. Four digit boxes now
  // (HH:MM, not H:MM) since the night starts at 11 PM.
  const size = h * 0.55;
  const boxW = size * 0.62;
  const gap = size * 0.05;
  const colonW = size * 0.16;
  const totalW = boxW * 4 + gap * 2 + colonW;
  let x = (w - totalW) / 2;
  const y = (h - size) / 2;

  drawOdometerDigit(g, x, y, hourTens, 1, size);
  x += boxW;
  drawOdometerDigit(g, x, y, hourOnes, 1, size);
  x += boxW + gap;

  g.fillStyle = 'rgba(244,241,234,0.9)';
  g.font = `700 ${size * 0.8}px ${MONO}`;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillText(':', x + colonW / 2, y + size * 0.72);
  x += colonW + gap;

  drawOdometerDigit(g, x, y, minuteTens, 1, size);
  x += boxW;
  drawOdometerDigit(g, x, y, minuteOnes, 1, size);
  x += boxW + gap;

  g.fillStyle = 'rgba(244,241,234,0.6)';
  g.font = `${size * 0.24}px ${MONO}`;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.fillText(isPM ? 'PM' : 'AM', x, y + size * 0.72);
}

export class HallClock {
  constructor(scene) {
    const S = C.screen;
    const w = S.zMax - S.zMin, h = S.yMax - S.yMin;

    this.canvas = document.createElement('canvas');
    this.canvas.width = C.canvas.width;
    this.canvas.height = C.canvas.height;
    this.g = this.canvas.getContext('2d');

    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
    if (S.flipX) { this.tex.wrapS = THREE.RepeatWrapping; this.tex.repeat.x = -1; this.tex.offset.x = 1; }

    const mat = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    this.mesh.position.set(S.x, (S.yMin + S.yMax) / 2, (S.zMin + S.zMax) / 2);
    this.mesh.rotation.y = Math.PI / 2;   // normal -> +X, toward the room (same as tv.js)
    this.mesh.name = 'Hall_Clock_overlay';
    scene.add(this.mesh);

    // Drawn once, right away, so the resting look is the same flat-digit
    // style as the rolling animation — never the old carved relief. Frozen
    // on the sequence's own opening minute (60 = 1:00 AM) until play() takes
    // over, so there's no visible jump the moment it starts rolling.
    drawFace(this.g, this.canvas.width, this.canvas.height, minutesAt(0));
    this.tex.needsUpdate = true;

    this.on = false;
    this.t = 0;
  }

  /** Fired from story.js's onReveal('tv'), right alongside tv.play(). */
  play() {
    if (this.on) return;
    this.on = true;
    this.t = 0;
  }

  /** Session 48: back to its resting 1:00 AM face when the TV goes off. */
  stop() {
    if (!this.on) return;
    this.on = false;
    this.t = 0;
    drawFace(this.g, this.canvas.width, this.canvas.height, minutesAt(0));
    this.tex.needsUpdate = true;
  }

  update(dt) {
    if (!this.on) return;
    this.t += dt;
    if (this.t >= CUES.total) this.t -= CUES.total;   // loop with the TV sequence
    drawFace(this.g, this.canvas.width, this.canvas.height, minutesAt(this.t));
    this.tex.needsUpdate = true;
  }
}

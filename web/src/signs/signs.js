// ---------------------------------------------------------------------------
//  Two static poster/label planes — canvas-texture rectangles, same trick as
//  tv.js / clock.js (a flat overlay plane rather than new Blender geometry),
//  but neither one animates: drawn once, left alone.
//
//    1. "High creativity zone ahead" — Door.001, the studio door. Mounted on
//       its landing face, below the existing Caution sign/tape (session-27
//       — real Blender meshes attached to the same door pivot). This poster
//       is JS-only, so it rides along the same way: after Doors builds the
//       pivot, this module attaches the mesh to it too, preserving whatever
//       world transform it was given — see doors.js's own `attach` list for
//       the mesh version of the same idea.
//    2. "Home coffee setup" — the kitchen's west wall (Wall.001), above the
//       coffee table (CONFIG.coffee.table). Static, no parent.
//
//  Both rectangles are deliberately plain: solid card background, a border,
//  bold centered text — no gradients, no rounding. CONFIG.signs holds the
//  measurements (each one noted where it came from — Blender MCP bboxes on
//  MeraGHAR.glb, or the neighbouring CONFIG block it had to clear).
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { CONFIG } from '../config/config.js';

function wrapLines(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawPoster(canvas, def) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;

  ctx.fillStyle = def.bg ?? '#f6efe4';
  ctx.fillRect(0, 0, w, h);

  const border = def.borderWidth ?? Math.round(w * 0.018);
  ctx.strokeStyle = def.border ?? '#1a1642';
  ctx.lineWidth = border;
  ctx.strokeRect(border / 2, border / 2, w - border, h - border);

  ctx.fillStyle = def.ink ?? '#1a1642';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = def.fontSize ?? Math.round(w * 0.09);
  ctx.font = `700 ${size}px ui-sans-serif, system-ui, sans-serif`;
  const lines = wrapLines(ctx, (def.text ?? '').toUpperCase(), w * 0.8);
  const lineH = size * 1.2;
  const startY = h / 2 - ((lines.length - 1) * lineH) / 2;
  lines.forEach((line, i) => ctx.fillText(line, w / 2, startY + i * lineH));
}

// Session 71: a poster can be Apoorva's own artwork (`image`, a path
// relative to index.html) instead of the drawn text card — the plane shows
// the image as-is, same size/placement rules as before.
const loader = new THREE.TextureLoader();
function makeImagePoster(def, width, height) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  loader.load(new URL(def.image, document.baseURI).href, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    if (def.flipX) { tex.wrapS = THREE.RepeatWrapping; tex.repeat.x = -1; tex.offset.x = 1; }
    mat.map = tex;
    mat.needsUpdate = true;
  }, undefined, () => console.warn(`[signs] could not load ${def.image}`));
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  mesh.name = def.name ?? 'Poster';
  return mesh;
}

function makePosterMesh(def, width, height) {
  if (def.image) return makeImagePoster(def, width, height);
  const canvas = document.createElement('canvas');
  canvas.width = def.canvas?.width ?? 900;
  canvas.height = def.canvas?.height ?? Math.round((canvas.width * height) / width);
  drawPoster(canvas, def);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  if (def.flipX) { tex.wrapS = THREE.RepeatWrapping; tex.repeat.x = -1; tex.offset.x = 1; }

  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  mesh.name = def.name ?? 'Poster';
  return mesh;
}

// ---------------------------------------------------------------------------
//  Session 73: the recipe card under the Coffee Corner poster. One step at a
//  time (coffee.js decides which), in the house's own heading face (Bitcount
//  Grid Single, `--font-major`) — "STEP 2 OF 5" small on top, the step
//  itself big underneath, five little progress pips. Redrawn only when the
//  step changes (and once more when the web font finishes loading, since a
//  canvas can't restyle itself the way HTML text does).
// ---------------------------------------------------------------------------
const STEP_FONT = "'Bitcount Grid Single', ui-monospace, monospace";

function drawStepCard(canvas, def, state) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const ink = def.ink ?? '#4a2c1a';
  const accent = def.accent ?? '#c8743a';
  ctx.fillStyle = def.bg ?? '#f4e4c6';
  ctx.fillRect(0, 0, w, h);
  const b = Math.round(h * 0.035);
  ctx.strokeStyle = ink; ctx.lineWidth = b;
  ctx.strokeRect(b / 2, b / 2, w - b, h - b);

  const { index, total, text } = state;
  const done = index >= total;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Kicker
  ctx.fillStyle = accent;
  ctx.font = `700 ${Math.round(h * 0.13)}px ${STEP_FONT}`;
  ctx.fillText(done ? (def.doneKicker ?? 'ALL DONE') : `STEP ${index + 1} OF ${total}`, w / 2, h * 0.17);

  // The step itself — shrink until it fits in three lines.
  const body = (text ?? '').replace(/^\s*\d+\.\s*/, '');
  let size = Math.round(h * 0.2), lines;
  for (; size > 18; size -= 2) {
    ctx.font = `600 ${size}px ${STEP_FONT}`;
    lines = wrapLines(ctx, body, w * 0.88);
    if (lines.length * size * 1.18 <= h * 0.56) break;
  }
  ctx.fillStyle = ink;
  const lineH = size * 1.18;
  const mid = h * 0.54;
  lines.forEach((l, i) => ctx.fillText(l, w / 2, mid + (i - (lines.length - 1) / 2) * lineH));

  // Progress pips
  const r = h * 0.035, gap = r * 3.4;
  const x0 = w / 2 - ((total - 1) * gap) / 2, y = h * 0.88;
  for (let i = 0; i < total; i++) {
    ctx.beginPath();
    ctx.arc(x0 + i * gap, y, r, 0, Math.PI * 2);
    if (i < index || done) { ctx.fillStyle = ink; ctx.fill(); }
    else if (i === index) { ctx.fillStyle = accent; ctx.fill(); }
    else { ctx.lineWidth = r * 0.45; ctx.strokeStyle = ink; ctx.stroke(); }
  }
}

export class Signs {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../doors/doors.js').Doors} [doors] — passed so the
   *   studio-door poster can ride Door.001's pivot the way the Caution
   *   sign/tape do. If omitted (or Door.001 isn't found), that poster is
   *   just left at its closed-door world position, unparented.
   */
  constructor(scene, doors) {
    const S = CONFIG.signs;
    if (!S) return;

    if (S.studioDoor) {
      const d = S.studioDoor;
      const width = d.width, height = d.yMax - d.yMin;
      const mesh = makePosterMesh(d, width, height);
      mesh.position.set(d.x, (d.yMin + d.yMax) / 2, d.z);
      mesh.rotation.y = Math.PI;   // normal -> -Z, toward the landing (see header)
      scene.add(mesh);
      const door = doors?.byName?.get('Door.001');
      if (door) door.pivot.attach(mesh);   // swings with the door, like the caution items
      else console.warn('[signs] Door.001 not found — studio poster left unparented');
    }

    if (S.coffeeSteps) {
      const c = S.coffeeSteps;
      const width = c.zMax - c.zMin, height = c.yMax - c.yMin;
      const canvas = document.createElement('canvas');
      canvas.width = c.canvas?.width ?? 1200;
      canvas.height = Math.round((canvas.width * height) / width);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height),
        new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      mesh.name = c.name ?? 'CoffeeSteps';
      mesh.position.set(c.x, (c.yMin + c.yMax) / 2, (c.zMin + c.zMax) / 2);
      mesh.rotation.y = Math.PI / 2;   // faces the room, same as the poster above it
      scene.add(mesh);
      this.stepCard = { canvas, tex, def: c, state: { index: 0, total: 1, text: '' } };
      const redraw = () => { drawStepCard(canvas, c, this.stepCard.state); tex.needsUpdate = true; };
      this.stepCard.redraw = redraw;
      redraw();
      // The web font may land after the first draw — draw again when it does.
      document.fonts?.load?.(`600 40px ${STEP_FONT}`).then(redraw).catch(() => {});
      document.fonts?.ready?.then(redraw);
      document.fonts?.addEventListener?.('loadingdone', redraw);
    }

    if (S.coffeeWall) {
      const c = S.coffeeWall;
      const width = c.zMax - c.zMin, height = c.yMax - c.yMin;
      const mesh = makePosterMesh(c, width, height);
      mesh.position.set(c.x, (c.yMin + c.yMax) / 2, (c.zMin + c.zMax) / 2);
      mesh.rotation.y = Math.PI / 2;   // normal -> +X, toward the room — same as tv.js
      scene.add(mesh);
    }
  }

  /** Session 73: coffee.js's current recipe step → the card under the poster. */
  setCoffeeStep(index, total, text) {
    if (!this.stepCard) return;
    this.stepCard.state = { index, total, text };
    this.stepCard.redraw();
  }
}

// ---------------------------------------------------------------------------
//  The ✨ — one sparkle, drawn once, used everywhere.
//
//  The navbar's star is a sheet of real liquid glass: a clip-path'd element
//  with a displacement map on its backdrop-filter. Nothing in a WebGL scene
//  can borrow that — `backdrop-filter` is a compositor trick and the house is
//  not a DOM backdrop. So what the in-world stars share with it is the
//  *material*, not the mechanism: the same three-sparkle silhouette, the same
//  warm tint over a see-through body, the same bright-to-amber rim, the same
//  upper-left sheen and catchlights, the same amber bloom around the edge.
//  Side by side they read as the same object; only the navbar one actually
//  bends what is behind it.
//
//  Everything is painted into one canvas per tint and cached, so sixteen story
//  markers cost one texture, not sixteen.
// ---------------------------------------------------------------------------
import * as THREE from 'three';

// Same geometry as the navbar star, in the same 24-unit design space: three
// four-point sparkles whose quadratic controls sit at their own centre, which
// is what pinches the sides concave. Change these and change index.html.
const SPARKLES = [
  { cx: 9.0,  cy: 13.5, r: 7.8 },
  { cx: 18.2, cy: 6.2,  r: 4.4 },
  { cx: 18.8, cy: 17.8, r: 3.0 },
];

// The texture is mostly halo. 24 units of sparkle sit in the middle of a
// wider box so the bloom and the dark contour have room to fall off without
// clipping at the canvas edge — `size` below is the half-width of the ART, so
// widening the box does not silently shrink every star that already exists.
const BOX = 34;      // design units across the texture — 24 of art, 10 of margin
const PAD = (BOX - 24) / 2;
const SIZE = 384;    // texture pixels
const cache = new Map();

function trace(ctx, k) {
  ctx.beginPath();
  for (const { cx, cy, r } of SPARKLES) {
    const x = (cx + PAD) * k, y = (cy + PAD) * k, R = r * k;
    ctx.moveTo(x, y - R);
    ctx.quadraticCurveTo(x, y, x + R, y);
    ctx.quadraticCurveTo(x, y, x, y + R);
    ctx.quadraticCurveTo(x, y, x - R, y);
    ctx.quadraticCurveTo(x, y, x, y - R);
  }
}

/** "rgba(r,g,b,a)" from a THREE.Color mixed toward white or black. */
function shade(color, towardWhite, alpha) {
  const c = color.clone();
  if (towardWhite > 0) c.lerp(new THREE.Color(0xffffff), towardWhite);
  if (towardWhite < 0) c.lerp(new THREE.Color(0x000000), -towardWhite);
  const [r, g, b] = [c.r, c.g, c.b].map((v) => Math.round(v * 255));
  return `rgba(${r},${g},${b},${alpha})`;
}

function texture(hex) {
  if (cache.has(hex)) return cache.get(hex);

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  const k = SIZE / BOX;
  const tint = new THREE.Color(hex);

  // 1. the bloom — the shape stamped through a wide coloured shadow, so the
  //    star sits in its own pool of light rather than being cut out of black
  ctx.save();
  // Tight on purpose. A wider, heavier bloom was tried and washed a grey
  // patch across the floorboards around every star — glow, not fog. Nudged
  // up slightly this pass (2.6→3.1, alpha .6→.72) — still a pool, not fog,
  // but with more punch at a normal standing distance.
  ctx.shadowColor = shade(tint, 0.25, 0.95);
  ctx.shadowBlur = 3.1 * k;
  ctx.fillStyle = shade(tint, 0.3, 0.72);
  for (let i = 0; i < 2; i++) { trace(ctx, k); ctx.fill(); }
  ctx.restore();

  // 2. the body — still translucent enough to be glass, but dense enough to
  //    hold its own colour over a busy wall. Densified this pass — a light
  //    bedroom wall was still reading through it enough to flatten the shape.
  const body = ctx.createLinearGradient(4 * k, 2 * k, 24 * k, 27 * k);
  body.addColorStop(0,    shade(tint, 0.82, 0.95));
  body.addColorStop(0.45, shade(tint, 0.16, 0.85));
  body.addColorStop(1,    shade(tint, -0.22, 0.9));
  ctx.save();
  trace(ctx, k);
  ctx.clip();
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // 3. the sheen the glass catches along its upper-left faces
  ctx.fillStyle = shade(tint, 0.95, 0.42);
  ctx.beginPath();
  ctx.moveTo(-4 * k, 13 * k); ctx.lineTo(17 * k, -6 * k);
  ctx.lineTo(23 * k, 0); ctx.lineTo(2 * k, 19 * k);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(tint, 0.85, 0.13);
  ctx.beginPath();
  ctx.moveTo(-2 * k, 25 * k); ctx.lineTo(13 * k, 13 * k);
  ctx.lineTo(16 * k, 16 * k); ctx.lineTo(1 * k, 28 * k);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  // 4. a dark keyline just outside the rim. The house is lit flat and its
  //    rooms are every colour, so a pale star on a pale bedroom wall vanished
  //    with only a coloured glow to separate it. A crisp contour fixes that
  //    where a soft dark halo does not: the halo was tried first and read as
  //    a smudge of dirt on the floor around every star. Widened and darkened
  //    again this pass (1.0→1.4, -0.78→-0.85, .62→.8) — still a hairline at
  //    marker scale, but it now holds against a light wall from across a room.
  ctx.lineJoin = 'round';
  ctx.strokeStyle = shade(tint, -0.85, 0.8);
  ctx.lineWidth = 1.4 * k;
  trace(ctx, k);
  ctx.stroke();

  // 5. the rim — bright where the light lands, saturated where it doesn't
  const rim = ctx.createLinearGradient(4 * k, 2 * k, 20 * k, 25 * k);
  rim.addColorStop(0,    shade(tint, 0.98, 1));
  rim.addColorStop(0.55, shade(tint, 0.6, 0.78));
  rim.addColorStop(1,    shade(tint, 0.02, 1));
  ctx.strokeStyle = rim;
  ctx.lineWidth = 0.75 * k;
  trace(ctx, k);
  ctx.stroke();

  // 6. two catchlights
  ctx.fillStyle = shade(tint, 0.96, 0.9);
  for (const [cx, cy, r] of [[7.1, 11.4, 0.95], [17.6, 5.3, 0.55]]) {
    ctx.beginPath();
    ctx.arc((cx + PAD) * k, (cy + PAD) * k, r * k, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  cache.set(hex, tex);
  return tex;
}

/**
 * A billboard sparkle for the world.
 *
 * @param {number} size   half-width of the sparkle itself, in world units.
 *   The plane is wider than that — it carries the halo — but `size` is
 *   measured on the art, so changing BOX never resizes existing stars.
 * @param {number} hex    tint; the whole gem is built from it
 * @param {Object} [opts]
 * @param {boolean} [opts.occlude=true]  depth-test against the house. Off only
 *   for a star that has to read through a piece of furniture it hovers over.
 * @returns {THREE.Mesh} face it at the camera each frame with
 *   `mesh.quaternion.copy(camera.quaternion)`.
 */
export function makeSparkle(size, hex = 0xffd166, opts = {}) {
  const w = size * 2 * (BOX / 24);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, w),
    new THREE.MeshBasicMaterial({
      map: texture(hex),
      transparent: true,
      // depthWrite stays off either way: these are billboards, and writing
      // depth would let one sparkle punch a hole in another behind it.
      depthWrite: false,
      depthTest: opts.occlude !== false,
      toneMapped: false,
      side: THREE.DoubleSide,
    })
  );
  mesh.userData.sparkle = true;
  return mesh;
}

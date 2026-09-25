// The gate in the garden arch.
//
// The arch came out of Blender as one welded mesh — `Arch`: two posts, the
// curved head, and, filling the opening, a two-leaf picket gate. There is no
// separate node for the gate, so there is nothing to hinge, and because the
// leaves ride in the arch's geometry they also sit in the collider: a solid
// picket wall across the only way into the garden.
//
// Rather than send the model back through Blender, the leaves are carved out
// here, at load. Every triangle of `Arch` whose centre falls inside
// `CONFIG.gardenGate.box` is lifted into a new mesh — left of `splitX` into
// one leaf, right of it into the other — and dropped from the arch's index.
// What comes out is two ordinary meshes wearing the arch's own material,
// named so that the rest of the house can treat them as it treats any other
// door: `CONFIG.doors` hinges and swings them, `CONFIG.colliderExclude`
// keeps them out of the walls (the same trick the front door uses, so the
// opening stays walkable whichever way the gate happens to be leaning).
//
// The split is by world-space box rather than by vertex index, so it survives
// a re-export from Blender as long as the gate stays where it is. If the box
// ever catches nothing, the arch is left exactly as it was and the doors
// simply warn about two missing leaves — nothing breaks.
import * as THREE from 'three';
import { CONFIG } from '../config/config.js';
import { findByName } from '../util/util.js';

/**
 * Carve the gate leaves out of the arch mesh.
 * @returns {THREE.Mesh[]|null} the two leaves, or null if there was nothing
 *   to split (no arch, or the box caught no geometry).
 */
export function splitGardenGate(root) {
  const def = CONFIG.gardenGate;
  if (!def) return null;

  const arch = findByName(root, def.mesh);
  if (!arch?.isMesh || !arch.geometry?.attributes?.position) {
    console.warn(`[gate] no mesh named "${def.mesh}" — the arch keeps its gate`);
    return null;
  }

  const geo = arch.geometry;
  const pos = geo.attributes.position;
  arch.updateWorldMatrix(true, false);
  const mw = arch.matrixWorld;

  // Work through an explicit index, so the same loop handles both an indexed
  // geometry (what the glb actually gives) and a soup of loose triangles.
  const src = geo.index?.array ?? null;
  const triCount = (src ? src.length : pos.count) / 3;
  const at = (i) => (src ? src[i] : i);

  const { x: bx, y: by, z: bz } = def.box;
  const keep = [];
  const left = [];
  const right = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();

  for (let t = 0; t < triCount; t++) {
    const i0 = at(t * 3), i1 = at(t * 3 + 1), i2 = at(t * 3 + 2);
    a.fromBufferAttribute(pos, i0).applyMatrix4(mw);
    b.fromBufferAttribute(pos, i1).applyMatrix4(mw);
    c.fromBufferAttribute(pos, i2).applyMatrix4(mw);
    // The centre decides, not the corners: a picket that straddles the line
    // between the leaves goes whole to one side instead of being sliced.
    const cx = (a.x + b.x + c.x) / 3;
    const cy = (a.y + b.y + c.y) / 3;
    const cz = (a.z + b.z + c.z) / 3;
    const inGate =
      cx > bx[0] && cx < bx[1] &&
      cy > by[0] && cy < by[1] &&
      cz > bz[0] && cz < bz[1];
    const bucket = !inGate ? keep : (cx < def.splitX ? left : right);
    bucket.push(i0, i1, i2);
  }

  if (!left.length || !right.length) {
    console.warn('[gate] CONFIG.gardenGate.box caught no gate on one side — arch left alone');
    return null;
  }

  // Build the leaves first; only once both exist is it safe to take those
  // triangles off the arch.
  const leaves = [
    makeLeaf(arch, left, def.leaves[0]),
    makeLeaf(arch, right, def.leaves[1]),
  ];
  geo.setIndex(keep);
  for (const leaf of leaves) (arch.parent ?? root).add(leaf);
  return leaves;
}

/** A standalone mesh holding just `indices` of the arch, in the arch's own
 *  local space and under the arch's transform — so it lands exactly where
 *  that part of the arch already was. */
function makeLeaf(arch, indices, name) {
  const src = arch.geometry;

  // Compact the vertices this leaf actually uses. Sharing the arch's buffers
  // would be cheaper, but then the leaf's bounding box would be the whole
  // arch's — and doors.js sizes the hinge off that box.
  const remap = new Map();
  const order = [];
  const idx = new Array(indices.length);
  for (let i = 0; i < indices.length; i++) {
    const v = indices[i];
    let n = remap.get(v);
    if (n === undefined) { n = order.length; remap.set(v, n); order.push(v); }
    idx[i] = n;
  }

  const geo = new THREE.BufferGeometry();
  for (const key of Object.keys(src.attributes)) {
    const attr = src.attributes[key];
    const size = attr.itemSize;
    const out = new Float32Array(order.length * size);
    for (let i = 0; i < order.length; i++) {
      for (let k = 0; k < size; k++) out[i * size + k] = attr.getComponent(order[i], k);
    }
    geo.setAttribute(key, new THREE.BufferAttribute(out, size));
  }
  geo.setIndex(idx);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();

  const mesh = new THREE.Mesh(geo, arch.material);
  mesh.name = name;
  mesh.position.copy(arch.position);
  mesh.quaternion.copy(arch.quaternion);
  mesh.scale.copy(arch.scale);
  mesh.castShadow = arch.castShadow;
  mesh.receiveShadow = arch.receiveShadow;
  return mesh;
}

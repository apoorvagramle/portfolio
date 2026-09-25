// Merges every static mesh in the house into one world-space geometry and
// builds a BVH over it. That single tree answers both questions the walker
// asks every frame: "what is under my feet?" and "am I inside a wall?".
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { CONFIG } from '../config/config.js';
import { nameSet } from '../util/util.js';

export function buildCollider(root) {
  const excluded = nameSet([...CONFIG.colliderExclude, ...(CONFIG.hide ?? [])]);
  const parts = [];
  let vertexCount = 0;
  let indexCount = 0;

  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    if (excluded.has(o.name)) return;
    const pos = o.geometry.attributes.position;
    const idx = o.geometry.index;
    parts.push({ mesh: o, pos, idx });
    vertexCount += pos.count;
    indexCount += idx ? idx.count : pos.count;
  });

  const positions = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(indexCount);
  const v = new THREE.Vector3();
  let vo = 0; // vertex write offset (in vertices)
  let io = 0; // index write offset

  for (const { mesh, pos, idx } of parts) {
    const m = mesh.matrixWorld;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      positions[(vo + i) * 3 + 0] = v.x;
      positions[(vo + i) * 3 + 1] = v.y;
      positions[(vo + i) * 3 + 2] = v.z;
    }
    if (idx) {
      for (let i = 0; i < idx.count; i++) indices[io + i] = idx.getX(i) + vo;
      io += idx.count;
    } else {
      for (let i = 0; i < pos.count; i++) indices[io + i] = i + vo;
      io += pos.count;
    }
    vo += pos.count;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingBox();

  const bvh = new MeshBVH(geometry);
  geometry.boundsTree = bvh;

  // A second, tiny tree holding only the staircases, so the walker can tell a
  // stair riser (climbable) from the arm of a sofa (not).
  const stairNames = nameSet(CONFIG.stairMeshes ?? []);
  const stairs = parts.filter((p) => stairNames.has(p.mesh.name));
  const stairsBVH = stairs.length ? new MeshBVH(mergeParts(stairs)) : null;

  // An invisible mesh so the standard Raycaster (BVH-accelerated) can be used
  // for click-to-move picking.
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ visible: false }));
  mesh.matrixAutoUpdate = false;
  mesh.name = '__collider';

  return { mesh, bvh, stairsBVH, geometry, triangleCount: indexCount / 3 };
}

/** Merge a subset of the collected parts into one world-space geometry. */
function mergeParts(parts) {
  let vCount = 0, iCount = 0;
  for (const { pos, idx } of parts) { vCount += pos.count; iCount += idx ? idx.count : pos.count; }
  const positions = new Float32Array(vCount * 3);
  const indices = new Uint32Array(iCount);
  const v = new THREE.Vector3();
  let vo = 0, io = 0;
  for (const { mesh, pos, idx } of parts) {
    const m = mesh.matrixWorld;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      positions[(vo + i) * 3] = v.x; positions[(vo + i) * 3 + 1] = v.y; positions[(vo + i) * 3 + 2] = v.z;
    }
    if (idx) { for (let i = 0; i < idx.count; i++) indices[io + i] = idx.getX(i) + vo; io += idx.count; }
    else { for (let i = 0; i < pos.count; i++) indices[io + i] = i + vo; io += pos.count; }
    vo += pos.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setIndex(new THREE.BufferAttribute(indices, 1));
  return g;
}

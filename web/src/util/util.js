// Blender names like "Door.001" arrive from the GLTF loader as "Door001",
// because three strips characters it reserves for animation paths. These
// helpers let the config keep using the names you see in Blender.
const RESERVED = /[\[\]\.:\/]/g;

export function sanitizeName(name) {
  return name.replace(/\s/g, '_').replace(RESERVED, '');
}

export function findByName(root, name) {
  const wanted = sanitizeName(name);
  let found = null;
  root.traverse((o) => {
    if (found) return;
    if (o.name === name || o.name === wanted || o.userData?.name === name) found = o;
  });
  return found;
}

/** Build a Set that matches either spelling, for fast membership tests. */
export function nameSet(names) {
  const s = new Set();
  for (const n of names) { s.add(n); s.add(sanitizeName(n)); }
  return s;
}

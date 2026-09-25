// Renderer, camera, sky and the (currently flat) lighting rig.
import * as THREE from 'three';
import { CONFIG } from '../config/config.js';

const W = CONFIG.world;

/**
 * How many device pixels to render per CSS pixel.
 *
 * Browser zoom changes devicePixelRatio, so at 80–90% zoom the scene is drawn
 * at fewer samples per unit of world — which is exactly when the voxel edges
 * start to crawl and read as "chunky". Rendering above the display ratio
 * supersamples that back down. Recomputed on every resize, because changing
 * the browser's zoom fires one.
 */
function targetPixelRatio() {
  if (CONFIG.lowres) return 1;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  return Math.min(W.maxPixelRatio ?? 2.5, dpr * (W.superSample ?? 1.5));
}

// Two WebGLRenderer construction flags that can't be part of any runtime
// quality ladder: changing either after the fact means destroying the
// renderer and re-uploading every geometry and texture (a multi-second black
// screen), so the choice has to be made once, here, before the first frame.
//
// `logarithmicDepthBuffer` is the more expensive of the two on weak
// hardware: it writes gl_FragDepth per fragment, which disables early-Z
// rejection on tile-based/integrated GPUs — costly on an overdraw-heavy
// interior scene like this house, on top of what `antialias` already costs.
// claude/mobile-interaction-spec.md worked this out in detail but only ever
// gated it on touch input; a weak laptop iGPU pays the same price with a
// mouse, so this checks hardwareConcurrency instead of pointer type.
//
// Dropping the log depth buffer brings back the z-fighting it exists to fix
// (siding over wall skin, roof deck under fascia) unless the depth range is
// tightened to compensate — same near/far the spec doc landed on.
const LOW_END = (navigator.hardwareConcurrency ?? 4) <= 4;

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: !LOW_END, powerPreference: 'high-performance',
    logarithmicDepthBuffer: !LOW_END,
  });
  if (LOW_END) console.log('[MeraGHAR] low-end render tier: no antialiasing, linear depth buffer');
  renderer.setPixelRatio(targetPixelRatio());
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = W.exposure ?? 1.0;

  if (W.shadows) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
  }

  const scene = new THREE.Scene();
  scene.background = makeSkyTexture();
  scene.fog = new THREE.Fog(W.fogColor, W.fogNear, W.fogFar);

  const nearClip = LOW_END ? 1.4 : W.near;
  const farClip = LOW_END ? 210 : W.far;
  const camera = new THREE.PerspectiveCamera(CONFIG.player.fov, innerWidth / innerHeight, nearClip, farClip);
  camera.rotation.order = 'YXZ';

  // ---- lens ---------------------------------------------------------------
  // Three.js measures fov top-to-bottom, so the width you get depends on the
  // screen: fine on a laptop, a letterbox on a phone held upright. With
  // CONFIG.player.lensDiag set, the lens is measured corner-to-corner instead
  // (the way phone lenses are), and every screen shape gets the same lens.
  // null = the original fixed vertical `fov`.
  function applyLens() {
    // A hidden or minimised window reports 0x0; keep the last good shape
    // rather than letting NaN into the projection.
    if (!(innerWidth > 0 && innerHeight > 0)) return;
    camera.aspect = innerWidth / innerHeight;
    const d = CONFIG.player.lensDiag;
    if (d) {
      const tDiag = Math.tan(THREE.MathUtils.degToRad(d) / 2);
      const tV = tDiag / Math.sqrt(1 + camera.aspect * camera.aspect);
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(tV));
    } else {
      camera.fov = CONFIG.player.fov;
    }
    camera.updateProjectionMatrix();
  }
  applyLens();

  // ---- lighting ------------------------------------------------------------
  // Deliberately three lights and nothing else: a sky/ground hemisphere, a
  // flat ambient fill so no interior surface can fall into shadow, and one
  // soft sun purely so the exterior still has some shape. Every lamp, every
  // point light and the indoor dimming are gone until the lighting design is
  // actually decided.
  const hemi = new THREE.HemisphereLight(W.hemiSky, W.hemiGround, W.hemiOutdoor);
  scene.add(hemi);

  const ambient = new THREE.AmbientLight(0xffffff, W.ambientOutdoor);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(W.sunColor, W.sunIntensity);
  sun.position.set(...W.sunPos);
  sun.target.position.set(-8, 8, -18);
  scene.add(sun, sun.target);

  if (W.shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(W.shadowMapSize, W.shadowMapSize);
    const r = W.shadowRadius;
    const c = sun.shadow.camera;
    c.left = -r; c.right = r; c.top = r; c.bottom = -r;
    c.near = 20; c.far = 400;
    c.updateProjectionMatrix();
    sun.shadow.bias = -0.0009;
    sun.shadow.normalBias = 0.06;
  }

  // Visual-only ground so the world does not end in sky. It is deliberately
  // NOT part of the collision mesh, which keeps the visitor on the front path.
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(W.groundRadius, 64).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: W.groundColor, roughness: 1, metalness: 0 })
  );
  ground.position.y = -0.24;
  ground.receiveShadow = W.shadows;
  scene.add(ground);

  addEventListener('resize', () => {
    applyLens();
    renderer.setPixelRatio(targetPixelRatio());
    renderer.setSize(innerWidth, innerHeight);
  });

  // With flat lighting there is nothing to blend — the house is lit the same
  // inside and out. Kept as a hook so the indoor/outdoor falloff can come
  // straight back when the real lighting pass happens.
  let indoorBlend = 0;
  function updateIndoor(feet, dt) {
    if (W.flatLighting) return;
    const I = W.interior;
    const inside =
      feet.x > I.x[0] && feet.x < I.x[1] &&
      feet.y > I.y[0] && feet.y < I.y[1] &&
      feet.z > I.z[0] && feet.z < I.z[1] ? 1 : 0;
    indoorBlend += (inside - indoorBlend) * Math.min(1, dt * 2.5);
    hemi.intensity = THREE.MathUtils.lerp(W.hemiOutdoor, W.hemiIndoor, indoorBlend);
    ambient.intensity = THREE.MathUtils.lerp(W.ambientOutdoor, W.ambientIndoor, indoorBlend);
    sun.intensity = THREE.MathUtils.lerp(W.sunIntensity, W.sunIntensity * 0.35, indoorBlend);
  }

  return { renderer, scene, camera, sun, hemi, ambient, updateIndoor, applyLens };
}

function makeSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0.00, W.skyTop);
  g.addColorStop(0.55, W.skyMid);
  g.addColorStop(1.00, W.skyBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ipad.js — the studio table iPad shows Apoorva's Instagram (Session 61).
//
// The iPad in MeraGHAR.glb is a voxel mesh (`Ipad`) with a dark screen
// face on its local -Y side. Measured off the GLB: the dark voxels cover
// local x -2.9…3.0, z -4.75…-0.25, at y = -0.3. The node is rotated 120°
// about X, so local -Y points up-and-south toward a visitor standing at
// the table, and local z = -5 is the TOP of the screen. Seen from the
// front, local -X is to the viewer's RIGHT, which is why the u coordinates
// below run from +x to -x.
//
// Rather than repaint the voxel palette, a thin quad is parented to that
// node, a hair in front of the screen face, carrying a screenshot of the
// profile (assets/ipad/instagram-screen.jpg: her profile header + the top
// of the post grid). Unlit and not tone-mapped, so it reads as a lit
// screen in the neon-dark studio.
//
// Clicking the screen or the iPad opens the profile in a new tab —
// main.js's pickInteractive() takes `targets`, useInteractive() sees
// `userData.ipadLink`. Only offered while the visitor is in the studio,
// since raycasts against targets ignore walls and floors.
//
// The texture (~320 KB) is only fetched once the visitor first goes
// upstairs (feet above y 5), so it costs nothing on the initial load.
import * as THREE from 'three';
import { CONFIG } from '../config/config.js';
import { findByName } from '../util/util.js';

const TEX_SRC = 'src/assets/ipad/instagram-screen.jpg';

export class IpadScreen {
  constructor({ root, walker }) {
    const cfg = CONFIG.ipadScreen ?? {};
    this.walker = walker;
    this.url = cfg.url ?? 'https://www.instagram.com/artistic_brains_/';
    this.room = CONFIG.rooms.find((r) => r.id === (cfg.room ?? 'studio'))?.bounds ?? null;
    this.node = findByName(root, cfg.mesh ?? 'Ipad');
    this.screen = null;
    this.loading = false;
    if (!this.node) { console.warn('[ipad] no mesh named "Ipad"'); return; }

    // Screen rectangle in the node's local frame (see header).
    const [x0, x1] = cfg.x ?? [-2.78, 2.88];     // viewer's right, left
    const [zt, zb] = cfg.z ?? [-4.68, -0.32];    // top, bottom
    const y = cfg.y ?? -0.33;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([
      x1, y, zt,   x0, y, zt,   x1, y, zb,   x0, y, zb,   // TL, TR, BL, BR
    ], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0, 0, 1, 0], 2));
    g.setIndex([0, 2, 1, 1, 2, 3]);
    g.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(g, mat);
    m.name = 'IpadInstagramScreen';
    m.visible = false;                 // until the texture has arrived
    m.userData.ipadLink = this.url;
    this.node.add(m);
    this.screen = m;
    this.node.traverse((o) => { if (o.isMesh) o.userData.ipadLink = this.url; });
  }

  inStudio() {
    const b = this.room, f = this.walker?.feet;
    return !!b && !!f && f.x > b.x[0] && f.x < b.x[1] && f.y > b.y[0] && f.y < b.y[1] && f.z > b.z[0] && f.z < b.z[1];
  }

  /** Clickable things right now: the iPad (and its screen), studio only. */
  get targets() {
    if (!this.node || !this.inStudio()) return [];
    return [this.node];
  }

  /** Open the profile. Called from a pointerup, so pop-up blockers allow it. */
  open() {
    window.open(this.url, '_blank', 'noopener');
    return true;
  }

  update() {
    if (!this.screen || this.loading) return;
    if ((this.walker?.feet?.y ?? 0) < 5) return;
    this.loading = true;
    new THREE.TextureLoader().load(TEX_SRC, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      this.screen.material.map = tex;
      this.screen.material.needsUpdate = true;
      this.screen.visible = true;
    }, undefined, () => console.warn('[ipad] could not load', TEX_SRC));
  }
}

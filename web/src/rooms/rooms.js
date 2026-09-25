// Room lighting. The first room box containing the visitor's feet is the
// active one: its lamps fade up, everything else fades back down to dark.
import * as THREE from 'three';
import { CONFIG } from '../config/config.js';
import { findByName } from '../util/util.js';

const WARM = new THREE.Color(0xffc98a);

export class Rooms {
  // `world.hemi` / `world.ambient` are the flat fill lights scene.js builds
  // (createWorld's return value). Optional — pass nothing and rooms just
  // behave as before (name label + lamp fades only).
  constructor(scene, root, onEnter, world = {}) {
    this.onEnter = onEnter;
    this.active = null;
    this.rooms = [];
    // Rooms flagged `forced: true` (config.js) skip the walk-in/walk-out box
    // check entirely — their level is driven from outside instead, via
    // `setLevel(id, 0..1)`. The TV's night lamp uses this: it isn't tied to
    // where the visitor is standing, only to how far the TV's own clock has
    // gotten into the night.
    this.forced = new Map();

    // Snapshotted once: with `CONFIG.world.flatLighting` true, scene.js's
    // updateIndoor() never touches these, so they stay at the constant
    // hemiOutdoor/ambientOutdoor values it set them to at startup — safe to
    // treat as "the normal, everything's-flat level" and scale down from.
    this.hemi = world.hemi ?? null;
    this.ambient = world.ambient ?? null;
    this.baseHemi = this.hemi?.intensity ?? 0;
    this.baseAmbient = this.ambient?.intensity ?? 0;

    for (const def of CONFIG.rooms) {
      // A light with `target` is a focused pool (e.g. the living-room lamp
      // aimed down at the sofa) instead of an even, room-filling glow.
      const lights = def.lights.map((l) => {
        let light;
        if (l.target) {
          light = new THREE.SpotLight(l.color, 0, l.distance ?? 24, l.angle ?? Math.PI / 6, l.penumbra ?? 0.4, l.decay ?? 2);
          light.position.set(...l.pos);
          light.target.position.set(...l.target);
          scene.add(light.target);
        } else {
          light = new THREE.PointLight(l.color, 0, l.distance ?? 24, 2);
          light.position.set(...l.pos);
        }
        light.userData.max = l.intensity;
        scene.add(light);
        return light;
      });

      // Lamp meshes get their own material copy so lighting one lamp does not
      // light every object that happens to share a material.
      const glow = [];
      for (const name of def.emissive ?? []) {
        const obj = findByName(root, name);
        if (!obj) { console.warn(`[rooms] no mesh named "${name}"`); continue; }
        obj.traverse((o) => {
          if (!o.isMesh) return;
          o.material = o.material.clone();
          o.material.emissive = new THREE.Color().copy(WARM);
          o.material.emissiveIntensity = 0;
          glow.push(o.material);
        });
      }

      this.rooms.push({ def, lights, glow, level: 0 });
    }

    // A few things glow whether or not you are in the room (the bedroom's
    // glow-in-the-dark stars, for instance).
    this.always = [];
    for (const name of CONFIG.alwaysEmissive ?? []) {
      const obj = findByName(root, name);
      obj?.traverse((o) => {
        if (o.isMesh) { o.material.emissive = new THREE.Color().copy(WARM); o.material.emissiveIntensity = 0.35; }
      });
    }
  }

  /** How far a room's lighting is faded in right now (0..1, smoothstepped
   *  exactly like its lamps) — for lights that live outside this class, e.g.
   *  the bedroom's star curtain (star-lights.js). */
  levelOf(id) {
    const r = this.rooms.find((x) => x.def.id === id);
    if (!r) return 0;
    return r.level * r.level * (3 - 2 * r.level);
  }

  /** Drive a `forced: true` room's level directly (0..1), bypassing the
   *  position check — see the constructor note. */
  setLevel(id, v) {
    this.forced.set(id, v);
  }

  contains(def, p) {
    const b = def.bounds;
    return p.x > b.x[0] && p.x < b.x[1] &&
           p.y > b.y[0] && p.y < b.y[1] &&
           p.z > b.z[0] && p.z < b.z[1];
  }

  update(feet, dt) {
    let current = null;
    for (const r of this.rooms) {
      if (r.def.forced) continue;
      if (this.contains(r.def, feet)) { current = r; break; }
    }

    if (current !== this.active) {
      this.active = current;
      this.onEnter?.(current?.def ?? null);
    }

    const k = Math.min(1, dt * CONFIG.lightFade);
    // Only rooms with ambientScale < 1 (the studio, so far) pull this below
    // 1 — everywhere else keeps the flat fill exactly as before. Summing
    // each active room's pull means a mid-transition cross-fade (leaving
    // one dim room while entering another) blends rather than snapping.
    let ambientScale = 1;
    for (const r of this.rooms) {
      const want = r.def.forced ? (this.forced.get(r.def.id) ?? 0) : (r === current ? 1 : 0);
      if (Math.abs(r.level - want) > 0.001) r.level += (want - r.level) * k;
      const eased = r.level * r.level * (3 - 2 * r.level);   // smoothstep
      for (const l of r.lights) l.intensity = l.userData.max * eased;
      for (const m of r.glow) m.emissiveIntensity = eased;
      const scale = r.def.ambientScale ?? 1;
      if (scale < 1) ambientScale -= eased * (1 - scale);
    }
    ambientScale = Math.max(0, ambientScale);
    if (this.hemi) this.hemi.intensity = this.baseHemi * ambientScale;
    if (this.ambient) this.ambient.intensity = this.baseAmbient * ambientScale;
  }
}

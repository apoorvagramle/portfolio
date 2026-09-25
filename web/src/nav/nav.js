// Walkable-space map + A*.
//
// Click-to-move only feels right if clicking somewhere across the house
// actually takes you there — around the stair well, up two flights, through a
// doorway — rather than walking into the nearest wall and giving up. So at
// load time we flood-fill the space the walker can actually stand in, using
// the same ground probe and capsule test the walker uses, and keep it as a
// graph. Levels fall out for free: the probe starts from the height you are
// already at, so the hall floor and the landing above it become separate
// nodes in the same column, joined only by the stairs.
import * as THREE from 'three';
import { CONFIG } from '../config/config.js';

const P = CONFIG.player;
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();

const MAX_SKIP = 8;   // waypoints a single smoothed leg may absorb
const SIDE = 0.25;    // how wide a corridor a smoothed leg must have

const DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

export class Nav {
  constructor(walker, cell = 0.7, maxNodes = 90000) {
    this.walker = walker;
    this.cell = cell;
    this.maxNodes = maxNodes;
    this.nodes = new Map();     // key -> node
    this.columns = new Map();   // "i,j" -> node[]
  }

  key(i, j, y) { return `${i},${j},${Math.round(y * 2)}`; }

  addNode(i, j, y) {
    const k = this.key(i, j, y);
    let n = this.nodes.get(k);
    if (n) return n;
    n = { k, i, j, y, x: i * this.cell, z: j * this.cell, edges: [] };
    this.nodes.set(k, n);
    const ck = `${i},${j}`;
    const col = this.columns.get(ck);
    if (col) col.push(n); else this.columns.set(ck, [n]);
    return n;
  }

  /** Can the walker stand at (x, z) coming from height fromY? Returns y or null. */
  standable(x, z, fromY) {
    const w = this.walker;
    _p.set(x, fromY, z);
    const g = w.groundAt(_p, fromY);
    if (g === null) return null;
    if (fromY - g > P.maxDrop) return null;
    const rise = g - fromY;
    if (rise > P.stepUp) return null;
    if (rise > P.stepSmall && !w.onStairs(x, g, z) && !w.doorwayAt(x, fromY, z)) return null;
    _q.set(x, g, z);
    const bx = _q.x, bz = _q.z;
    w.resolveHorizontal(_q);
    if (Math.abs(_q.x - bx) > 0.04 || Math.abs(_q.z - bz) > 0.04) return null;
    return g;
  }

  /** Flood-fill outward from where the visitor starts. */
  build(start) {
    const t0 = performance.now();
    const c = this.cell;
    const i0 = Math.round(start.x / c);
    const j0 = Math.round(start.z / c);
    const y0 = this.standable(i0 * c, j0 * c, start.y);
    if (y0 === null) { this.ready = false; return this; }

    const root = this.addNode(i0, j0, y0);
    const queue = [root];
    let head = 0;

    while (head < queue.length && this.nodes.size < this.maxNodes) {
      const n = queue[head++];
      for (const [di, dj] of DIRS) {
        const ni = n.i + di, nj = n.j + dj;
        const y = this.standable(ni * c, nj * c, n.y);
        if (y === null) continue;
        const k = this.key(ni, nj, y);
        const existed = this.nodes.has(k);
        const m = this.addNode(ni, nj, y);
        if (!n.edges.includes(m.k)) n.edges.push(m.k);
        if (!m.edges.includes(n.k)) m.edges.push(n.k);
        if (!existed) queue.push(m);
      }
    }

    this.ready = true;
    this.buildMs = Math.round(performance.now() - t0);
    return this;
  }

  /** Closest reachable node to a world point, searching outward from it. */
  nearest(point, maxRings = 6) {
    const c = this.cell;
    const ci = Math.round(point.x / c);
    const cj = Math.round(point.z / c);
    let best = null, bestD = Infinity;
    for (let r = 0; r <= maxRings; r++) {
      for (let di = -r; di <= r; di++) {
        for (let dj = -r; dj <= r; dj++) {
          if (r > 0 && Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const col = this.columns.get(`${ci + di},${cj + dj}`);
          if (!col) continue;
          for (const n of col) {
            const d = (n.x - point.x) ** 2 + (n.z - point.z) ** 2 + ((n.y - point.y) * 2.5) ** 2;
            if (d < bestD) { bestD = d; best = n; }
          }
        }
      }
      // Nearest ring with a node ON THIS FLOOR wins. Session 78: a ring that
      // only has nodes a floor below/above (the hall under the 2nd-floor
      // landing, once the landing railing made the landing's edge
      // unwalkable) used to win outright, so the 2nd-floor ride was routed
      // through the hall and then flew straight up to the landing.
      if (best && Math.abs(best.y - point.y) < 2.5) return best;
    }
    return best;
  }

  /** A* between two world points. Returns an array of Vector3, or null. */
  findPath(from, to) {
    if (!this.ready) return null;
    const a = this.nearest(from, 3);
    const b = this.nearest(to, 4);
    if (!a || !b) return null;
    if (a === b) return [new THREE.Vector3(b.x, b.y, b.z)];

    const h = (n) => Math.hypot(n.x - b.x, n.z - b.z) + Math.abs(n.y - b.y) * 1.4;
    const open = new Heap();
    const g = new Map([[a.k, 0]]);
    const cameFrom = new Map();
    const closed = new Set();
    open.push(a, h(a));

    let found = false;
    let guard = 0;
    while (open.size && guard++ < 200000) {
      const n = open.pop();
      if (n === b) { found = true; break; }
      if (closed.has(n.k)) continue;
      closed.add(n.k);
      const gn = g.get(n.k);
      for (const mk of n.edges) {
        const m = this.nodes.get(mk);
        if (!m || closed.has(mk)) continue;
        const step = Math.hypot(m.x - n.x, m.z - n.z) + Math.abs(m.y - n.y) * 1.2;
        const gm = gn + step;
        if (g.has(mk) && g.get(mk) <= gm) continue;
        g.set(mk, gm);
        cameFrom.set(mk, n);
        open.push(m, gm + h(m));
      }
    }
    if (!found) return null;

    const raw = [];
    for (let n = b; n; n = cameFrom.get(n.k)) raw.push(n);
    raw.reverse();
    return this.smooth(from, raw, to);
  }

  /** Drop waypoints we can walk straight past, so the route reads as a walk. */
  smooth(from, nodes, goal) {
    const out = [];
    let anchor = new THREE.Vector3(from.x, from.y, from.z);
    let i = 0;
    while (i < nodes.length) {
      let j = Math.min(nodes.length - 1, i + MAX_SKIP);
      for (; j > i; j--) {
        if (this.clearLine(anchor, nodes[j])) break;
      }
      const n = nodes[j];
      const v = new THREE.Vector3(n.x, n.y, n.z);
      out.push(v);
      anchor = v;
      i = j + 1;
    }
    // Finish on the exact point that was clicked when it is right there.
    const last = out[out.length - 1];
    if (last && Math.hypot(goal.x - last.x, goal.z - last.z) < this.cell * 1.6) {
      last.set(goal.x, goal.y, goal.z);
    }
    return out;
  }

  /**
   * Can the walker go straight from a to b? Tested as a narrow corridor
   * rather than a hairline, because a leg that is only just clear falls apart
   * the moment collision nudges the walker off the centre line. Legs are also
   * never allowed to short-cut across a doorway: precision matters most in
   * exactly the places a straight line is most tempting.
   */
  clearLine(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const dist = Math.hypot(dx, dz);
    const steps = Math.ceil(dist / (this.cell * 0.75));
    if (steps <= 1) return true;
    const px = (-dz / dist) * SIDE, pz = (dx / dist) * SIDE;
    const w = this.walker;
    let y = a.y;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const x = a.x + dx * t, z = a.z + dz * t;
      if (dist > 2.2 && w.doorwayAt(x, y, z)) return false;
      const g = this.standable(x, z, y);
      if (g === null) return false;
      if (this.standable(x + px, z + pz, y) === null) return false;
      if (this.standable(x - px, z - pz, y) === null) return false;
      y = g;
    }
    return Math.abs(y - b.y) < P.stepUp;
  }
}

/** Small binary heap; the graph is a few thousand nodes, this is plenty. */
class Heap {
  constructor() { this.items = []; this.prio = []; }
  get size() { return this.items.length; }
  push(item, p) {
    this.items.push(item); this.prio.push(p);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prio[parent] <= this.prio[i]) break;
      this.swap(i, parent); i = parent;
    }
  }
  pop() {
    const top = this.items[0];
    const item = this.items.pop(), p = this.prio.pop();
    if (this.items.length) {
      this.items[0] = item; this.prio[0] = p;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let s = i;
        if (l < this.items.length && this.prio[l] < this.prio[s]) s = l;
        if (r < this.items.length && this.prio[r] < this.prio[s]) s = r;
        if (s === i) break;
        this.swap(i, s); i = s;
      }
    }
    return top;
  }
  swap(a, b) {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.prio[a], this.prio[b]] = [this.prio[b], this.prio[a]];
  }
}

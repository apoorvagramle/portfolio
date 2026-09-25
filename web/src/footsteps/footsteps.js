// ---------------------------------------------------------------------------
//  Footsteps — one cue per stride while the visitor is actually walking on
//  their own two feet.
//
//  Ticks on ground covered, not on a timer: `CONFIG.footsteps.stride` world
//  units accumulate from `walker.speed * dt` each frame, and crossing that
//  threshold fires one step and resets. That keeps the cadence honest at any
//  speed — easing into a corner slows the steps down instead of the walk
//  looking slower than it sounds.
//
//  Silent while seated, mid-ride (the stairs/map shortcut), or standing
//  still. Swaps to the grass cue the instant the current room is the
//  garden (`rooms.active`); every other room gets the plain footstep.
//
//  `playSfx('footstep' | 'footstepGrass')` does the rest: each id resolves
//  to a pool of 5 rendered variants in CONFIG.sfx (sfx.js picks one at
//  random per call), so consecutive steps don't repeat the same sample.
// ---------------------------------------------------------------------------
import { CONFIG } from '../config/config.js';
import { playSfx } from '../sfx/sfx.js';

const F = CONFIG.footsteps ?? {};
const STRIDE = F.stride ?? 1.15;

export class Footsteps {
  /**
   * @param {Walker} walker
   * @param {Rooms}  rooms   read for `rooms.active` — which room the
   *                         visitor is currently standing in
   */
  constructor({ walker, rooms }) {
    this.walker = walker;
    this.rooms = rooms;
    this.dist = 0;
  }

  update(dt) {
    const w = this.walker;
    // Not real walking: reset so a stopped visitor doesn't bank distance and
    // fire an out-of-place step the moment they start moving again.
    const walking = !!w && w.moving && !w.seated && !w.riding;
    const inGarden = walking && this.rooms?.active?.def?.id === 'garden';
    if (!walking) { this.dist = 0; return; }

    this.dist += w.speed * dt;
    if (this.dist < STRIDE) return;
    this.dist = 0;

    playSfx(inGarden ? 'footstepGrass' : 'footstep');
  }
}

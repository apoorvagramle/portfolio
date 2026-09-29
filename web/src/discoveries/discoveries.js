// ---------------------------------------------------------------------------
//  What the visitor has found.
//
//  The star in the navbar is not a click-counter — it is the progress bar for
//  the house. `CONFIG.discoveries.core` is the list that counts toward the
//  total shown on the button (n/10). `CONFIG.discoveries.secrets` is a second,
//  uncounted list: the small things that are meant to feel like a private
//  find, so they never make the visitor feel they are behind.
//
//  Everything is driven by one call:
//
//      discoveries.collect('room:garden')
//
//  It is safe to call as often as you like — only the first time counts. The
//  places it is called from today are in main.js (room entry, the desk, the
//  upstairs doors, the stairs ride); as more of the house gets built, add an
//  id to the list in config.js and call collect() where it happens.
//
//  Progress is per-visit on purpose. Coming back to the house and finding the
//  count already full would take away the only reason to walk around it.
// ---------------------------------------------------------------------------
import { CONFIG } from '../config/config.js';

export class Discoveries {
  constructor(onCollect) {
    this.onCollect = onCollect;      // (def, self) => void — drives the toast
    this.found = new Set();

    const D = CONFIG.discoveries ?? { core: [], secrets: [] };
    this.core = (D.core ?? []).map((d) => ({ ...d, secret: false }));
    this.secrets = (D.secrets ?? []).map((d) => ({ ...d, secret: true }));

    this.byId = new Map();
    for (const d of [...this.core, ...this.secrets]) this.byId.set(d.id, d);
  }

  /** How many of the counted ones are in the bag. */
  get count() {
    let n = 0;
    for (const d of this.core) if (this.found.has(d.id)) n++;
    return n;
  }

  get total() { return this.core.length; }

  /** Secrets found so far — shown separately, never part of n/total. */
  has(id) { return this.found.has(id); }

  /**
   * Mark something found. Returns true only the first time, so callers can
   * fire a sound or an animation without keeping their own flag.
   */
  collect(id) {
    if (!id || this.found.has(id)) return false;
    const def = this.byId.get(id);
    if (!def) return false;          // not on either list: ignore quietly
    this.found.add(id);
    console.log(`[discoveries] +${id} → ${this.count}/${this.total}`);
    this.onCollect?.(def, this);
    return true;
  }

  /** For the panel behind the star. Unfound entries keep their label hidden. */
  list() {
    return this.core.map((d) => ({
      id: d.id,
      label: this.found.has(d.id) ? d.label : null,
      found: this.found.has(d.id),
    }));
  }
}

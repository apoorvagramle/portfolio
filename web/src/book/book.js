// book.js — the garden star's book (Session 63).
//
// Apoorva's brief: sitting in the garden's hanging chair opens the garden
// star, and its lines type top-left as usual. While they type, you "pick
// up" the pink book lying on the little table. Once the last line has
// finished, the book opens. The poem goes inside later (CONFIG `book` on
// the `garden` story entry). Until then the pages show a soft placeholder.
//
// Two halves, one module:
//
//   1. The 3D pick-up. The real `Book` mesh from MeraGHAR.glb rises off
//      Table.002 in a small arc, turns to face you and comes to rest in
//      front of the seated camera, a touch low and to the right (clear of
//      the HUD box), turned slightly so its page edge shows. It follows the camera from then on, so the chair's
//      swing carries it too. The mesh is wrapped in a pivot at its own
//      bounding-box centre, so its odd glTF origin/negative scale never
//      matters. On the way back it lands on the table and is re-parented
//      with its exact original transform, so repeated reads can't drift it.
//
//   2. The open book. Once the lines are done (story.js's advanceHud →
//      requestOpen), a full-screen overlay takes over from the 3D book:
//      the closed pink cover comes up, then swings open on its spine to a
//      two-page spread. Esc / × / the chip close it (story.js close()): the
//      cover shuts, the overlay fades and the 3D book goes back to the table.
//      Same veil, × and Esc chip as the letter (letter.css's .ltr-close /
//      .ltr-esc are reused so the popups stay one family).
//
// Standing up at any point before the book is open (Esc / Stand up) puts
// the book straight back and cancels the open.
//
//   3. Lyrics (Session 64, pages in 65). The poem is written into the book
//      like a notebook: the title heads the left page, the lines run down
//      it and on down the right page, and the page turns when both are full.
//      But it isn't all there at once. Like Spotify's lyrics view, the line
//      Apoorva is reading is in full ink, the next one is faint, the one
//      she just finished is fading, older ones are a faint ghost, and later
//      ones are hidden. It follows her recording (`book.audio`), using one
//      start time per line (`book.times`, in seconds). When the reading
//      ends, every line comes back, with "back" / "turn the page" to go
//      through the poem and "hear it again" to replay it. Clicking a line
//      jumps the recording there. With no recording, the lines move on at a
//      steady pace instead.
//
//      Timing tool: open the site with ?booktime, sit, and let the book
//      open. The recording plays, and you tap Space (or click the page) the
//      moment each line starts. After the last line, the `times` array
//      appears on screen and is copied to the clipboard, ready to paste
//      into config.js. Press R to start over.

import * as THREE from 'three';
import { findByName } from '../util/util.js';
import { duck } from '../sfx/sfx.js';

// Bug (reported after hosting, mobile): the poem's reading never started —
// the recording's play() was silently refused. The star that opens this
// book can be found just by walking near it (story.js's reveal(), proximity
// path), not only by a tap, so the play() call three timers deep in
// _openOverlay() below isn't reliably still "in" a user gesture by the time
// it fires, and mobile browsers (iOS Safari in particular) can then refuse
// it outright. The fix mirrors sfx.js's own AudioContext-unlock idiom: a
// blocked play() is remembered here and retried on the visitor's very next
// tap/key anywhere on the page, which — since the book is now open in front
// of them — arrives within a moment either way.
const pendingPlays = new Set();
function retryPendingPlays() {
  if (!pendingPlays.size) return;
  for (const a of pendingPlays) {
    a.play().then(() => pendingPlays.delete(a)).catch(() => {});
  }
}
for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
  addEventListener(ev, retryPendingPlays, { capture: true, passive: true });
}

const MARKUP = `
  <button class="ltr-close" data-el="btnClose" aria-label="Close the book">&times;</button>
  <div class="bk-stage">
    <div class="bk-book" data-el="book">
      <div class="bk-page bk-right">
        <div class="bk-ribbon" aria-hidden="true"></div>
        <div class="bk-pgc" data-el="pgR"></div>
        <button class="bk-btn bk-again" data-el="btnAgain" type="button">&#8635; hear it again</button>
        <button class="bk-btn bk-fwd" data-el="btnFwd" type="button" aria-label="Turn the page">turn the page &rsaquo;</button>
        <span class="bk-folio" data-el="folioR">2</span>
      </div>
      <div class="bk-cover" data-el="cover">
        <div class="bk-face bk-front" aria-hidden="true">
          <div class="bk-plate"><span>poems</span></div>
          <div class="bk-sprig"></div>
        </div>
        <div class="bk-face bk-back bk-page bk-left">
          <div class="bk-pgc" data-el="pgL"></div>
          <button class="bk-btn bk-back-btn" data-el="btnBack" type="button" aria-label="Turn back a page">&lsaquo; back</button>
          <span class="bk-folio" data-el="folioL">1</span>
        </div>
      </div>
    </div>
  </div>
  <div class="bk-timer" data-el="timer" aria-live="polite"></div>
  <button class="ltr-esc" data-el="btnEsc" type="button" aria-label="Close the book">
    <span class="ltr-esc-key"><kbd>Esc</kbd> to close</span>
    <span class="ltr-esc-touch">Tap here to close</span>
  </button>
`;

// Timings. Kept in sync with book.css.
const SHOW_MS = 450;      // overlay + closed cover fade/scale in, then the cover opens
const COVER_MS = 1100;    // .bk-cover's rotate transition
const FADE_MS = 380;      // the veil's own fade
const START_MS = SHOW_MS + COVER_MS + 250;   // cover fully open → the reading starts
const TURN_MS = 900;      // .bk-leaf's rotate transition (a page turn)
const TURN_LEAD = 0.55;   // s — start turning this long before the next page's first line
const SINGLE_MAX_W = 560; // px — at or under this width, one page at a time
const REDUCED = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Lyrics.
const PACE = 3.4;         // s per line when there's no recording and no times
const TAIL = 4;           // s the last line holds when there's no recording
const PLACEHOLDER = [     // until the real poem is in config.js
  'Line one of the poem goes here.',
  'Then line two,',
  'and line three, lit as you read it.',
  '',
  'A blank line starts a new stanza.',
  'The poem goes here.',
];

// Timing tool (?booktime).
const TIMING = typeof location !== 'undefined' && new URLSearchParams(location.search).has('booktime');

const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);   // easeInOutCubic

export class GardenBook {
  /**
   * @param {object} o
   * @param {THREE.Scene} o.scene
   * @param {THREE.Object3D} o.root      the loaded glTF scene
   * @param {THREE.Camera} o.camera
   * @param {() => boolean} o.isHeld     true while the visitor is still in the seat the book belongs to
   * @param {() => void} [o.onRequestClose]  the × / Esc chip, routed through story.close()
   * @param {object} [o.opts]            CONFIG.gardenBook overrides
   */
  constructor({ scene, root, camera, isHeld, onRequestClose = null, opts = {} }) {
    this.scene = scene;
    this.camera = camera;
    this.isHeld = isHeld ?? (() => true);
    this.onRequestClose = onRequestClose;
    this.o = {
      mesh: 'Book',
      delay: 0.55,        // s — let the sit-down ease settle first
      liftTime: 1.7,      // s — table to hands
      returnTime: 1.1,    // s — hands to table
      arc: 0.7,           // how far above the straight line the book rises mid-lift
      hold: [0.45, -0.2, -3.3],    // camera space: right, down, in front
      tilt: -0.32,        // rad about the camera's x — top leans away, like reading on your lap
      turn: 0.3,          // rad about the camera's y — turned a little so the page edge shows
      bob: 0.018,         // idle breathing while held
      ...opts,
    };

    this.state = 'rest';  // rest | lifting | held | reading | returning
    this.t = 0;
    this.pendingOpen = null;
    this.isOpen = false;   // the overlay — what story.js's `blocking` asks
    this._built = false;
    this._timers = [];

    this.mesh = findByName(root, this.o.mesh);
    if (!this.mesh) { console.warn(`[book] no mesh named "${this.o.mesh}"`); return; }

    // Rest pose, captured once: the mesh's own local TRS (restored exactly on
    // return) and a pivot at its world bounding-box centre.
    this.home = {
      parent: this.mesh.parent,
      position: this.mesh.position.clone(),
      quaternion: this.mesh.quaternion.clone(),
      scale: this.mesh.scale.clone(),
    };
    this.mesh.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(this.mesh);
    this.restPos = box.getCenter(new THREE.Vector3());
    this.restQuat = new THREE.Quaternion();   // pivot is identity at rest
    this.pivot = new THREE.Group();
    this.pivot.name = 'BookPivot';

    // Pivot orientation in the camera's frame while held: the cover (world
    // +Y at rest) turns to face you (camera +Z), the book's long side (world
    // Z at rest) stands upright (camera +Y), then a small tilt back.
    const basis = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 1, 0),
    );
    this.holdLocalQuat = new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.o.turn)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.o.tilt))
      .multiply(new THREE.Quaternion().setFromRotationMatrix(basis));

    // Scratch.
    this._camPos = new THREE.Vector3();
    this._camQuat = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._fromPos = new THREE.Vector3();
    this._fromQuat = new THREE.Quaternion();
  }

  /** Is the 3D book in (or on its way to) the visitor's hands? */
  get holding() { return this.state === 'lifting' || this.state === 'held' || this.state === 'reading'; }

  /** The HUD just started: lift the book off the table. */
  pickUp() {
    if (!this.mesh || this.state !== 'rest') return false;
    this.scene.add(this.pivot);
    this.pivot.position.copy(this.restPos);
    this.pivot.quaternion.copy(this.restQuat);
    this.pivot.scale.set(1, 1, 1);
    this.pivot.updateMatrixWorld(true);
    this.pivot.attach(this.mesh);          // keeps its world transform
    this.pivot.visible = true;
    this.state = 'lifting';
    this.t = -this.o.delay;
    return true;
  }

  /** The HUD finished: open the book as soon as it's in hand (now, or on arrival). */
  requestOpen(content) {
    if (!this.mesh) return false;
    if (this.state === 'rest') this.pickUp();   // e.g. reopened from a click on the book
    if (!this.holding) return false;
    this.pendingOpen = content ?? {};
    if (this.state === 'held') this._openOverlay();
    return true;
  }

  /** Put the book back on the table (standing up, or after reading). */
  putBack() {
    if (!this.mesh || this.state === 'rest' || this.state === 'returning') return;
    this.pendingOpen = null;
    this.pivot.visible = true;
    this._fromPos.copy(this.pivot.position);
    this._fromQuat.copy(this.pivot.quaternion);
    this.state = 'returning';
    this.t = 0;
  }

  /** Camera-space hold pose → world, into this._p / this._q. */
  _holdPose(time) {
    this.camera.updateMatrixWorld();
    this.camera.matrixWorld.decompose(this._camPos, this._camQuat, this._p);
    const [x, y, z] = this.o.hold;
    const bob = Math.sin(time * 1.6) * this.o.bob;
    this._p.set(x, y + bob, z).applyQuaternion(this._camQuat).add(this._camPos);
    this._q.copy(this._camQuat).multiply(this.holdLocalQuat);
  }

  /** Per frame, after the seats have moved the camera. Returns true while the book moved. */
  update(dt) {
    if (!this.mesh || this.state === 'rest') return false;
    const now = performance.now() / 1000;

    // Got up before the book was open: straight back to the table.
    if ((this.state === 'lifting' || this.state === 'held') && !this.isHeld()) this.putBack();

    if (this.state === 'lifting') {
      this.t += dt;
      if (this.t < 0) return false;
      const k = Math.min(1, this.t / this.o.liftTime);
      const e = ease(k);
      this._holdPose(now);
      this.pivot.position.lerpVectors(this.restPos, this._p, e);
      this.pivot.position.y += Math.sin(Math.PI * e) * this.o.arc;
      this.pivot.quaternion.slerpQuaternions(this.restQuat, this._q, e);
      if (k >= 1) {
        this.state = 'held';
        if (this.pendingOpen) this._openOverlay();
      }
      return true;
    }
    if (this.state === 'held' || this.state === 'reading') {
      this._holdPose(now);
      this.pivot.position.copy(this._p);
      this.pivot.quaternion.copy(this._q);
      return false;
    }
    if (this.state === 'returning') {
      this.t += dt;
      const k = Math.min(1, this.t / this.o.returnTime);
      const e = ease(k);
      this.pivot.position.lerpVectors(this._fromPos, this.restPos, e);
      this.pivot.position.y += Math.sin(Math.PI * e) * this.o.arc * 0.5;
      this.pivot.quaternion.slerpQuaternions(this._fromQuat, this.restQuat, e);
      if (k >= 1) this._landed();
      return true;
    }
    return false;
  }

  _landed() {
    const h = this.home;
    h.parent.add(this.mesh);
    this.mesh.position.copy(h.position);
    this.mesh.quaternion.copy(h.quaternion);
    this.mesh.scale.copy(h.scale);
    this.mesh.updateMatrixWorld(true);
    this.scene.remove(this.pivot);
    this.state = 'rest';
  }

  // ------------------------------------------------------------------
  //  The open book (DOM overlay)
  // ------------------------------------------------------------------

  _ensureBuilt() {
    if (this._built) return;
    this._built = true;
    const root = document.createElement('div');
    root.id = 'bkVeil';
    root.innerHTML = MARKUP;
    document.body.appendChild(root);
    this.root = root;
    const el = {};
    root.querySelectorAll('[data-el]').forEach((n) => { el[n.getAttribute('data-el')] = n; });
    this.el = el;
    el.btnClose.addEventListener('click', () => this.onRequestClose?.());
    el.btnEsc.addEventListener('click', () => this.onRequestClose?.());
    el.btnAgain.addEventListener('click', () => this._play(0));
    el.btnFwd.addEventListener('click', () => this._turnTo(this.spread + 1));
    el.btnBack.addEventListener('click', () => this._turnTo(this.spread - 1));
    // Click a line to jump the reading there (Spotify does the same).
    // In timing mode, a click on a page marks the next line instead.
    const onPage = (e) => {
      if (e.target.closest('.bk-btn')) return;
      if (TIMING) { this._tap(); return; }
      const ln = e.target.closest('.bk-ln');
      if (!ln || !this.ly) return;
      this._play(this.ly.times[+ln.dataset.i]);
    };
    el.pgL.addEventListener('click', onPage);
    el.pgR.addEventListener('click', onPage);
    this._onKey = (e) => {
      if (!TIMING || !this.isOpen) return;
      if (e.code === 'Space') { e.preventDefault(); e.stopPropagation(); this._tap(); }
      else if (e.code === 'KeyR') { e.preventDefault(); e.stopPropagation(); this._timeStart(); }
    };
    window.addEventListener('keydown', this._onKey, true);
    // A new window size means a new page size: lay the poem out again.
    let rz = 0;
    window.addEventListener('resize', () => {
      if (!this.isOpen || !this.ly) return;
      clearTimeout(rz);
      rz = setTimeout(() => this._paginate(), 150);
    });
  }

  _fill(content) {
    const title = (content.title ?? '').trim();
    const poem = (content.poem ?? '').trim();
    this.placeholder = !poem;
    this.root.classList.toggle('bk-placeholder', !poem);

    // Lines: every non-empty line is one lyric line; blank lines between
    // them mark a new stanza (a ruled line of space above that line).
    const raw = poem ? poem.split('\n') : PLACEHOLDER;
    const lines = [];
    let gap = false;
    for (const r of raw) {
      const t = r.trim();
      if (!t) { gap = lines.length > 0; continue; }
      lines.push({ text: t, gap });
      gap = false;
    }

    // Start times: from config, else a steady pace. Missing entries carry on
    // at the same pace from the last one given.
    const given = Array.isArray(content.times) ? content.times.filter((n) => Number.isFinite(n)) : [];
    if (given.length && given.length !== lines.length) {
      console.warn(`[book] ${lines.length} lines but ${given.length} times — filling the rest at ${PACE}s a line`);
    }
    const times = lines.map((_, i) => (i < given.length ? given[i] : (given.length ? given[given.length - 1] + (i - given.length + 1) * PACE : i * PACE)));

    // The heading that opens page 1: title, then "— Apoorva".
    const head = document.createElement('div');
    head.className = 'bk-head';
    head.innerHTML = '<div class="bk-title"></div><div class="bk-by"></div><div class="bk-note"></div>';
    // Session 67: the byline and a small bracketed note under it both come
    // from config (`book.by`, `book.note`). No note = no note line.
    head.children[1].textContent = '— ' + ((content.by ?? '').trim() || 'Apoorva');
    const note = (content.note ?? '').trim();
    head.children[2].textContent = note ? `(${note})` : '';
    head.children[2].hidden = !note;
    head.firstChild.textContent = title || 'Untitled';
    head.firstChild.classList.toggle('placeholder', !title);
    this.headEl = head;

    this.lnEls = lines.map((l, i) => {
      const d = document.createElement('div');
      d.className = 'bk-ln' + (l.gap ? ' gap' : '');
      d.dataset.i = i;
      d.textContent = l.text;
      return d;
    });

    // The recording (optional).
    const src = (content.audio ?? '').trim();
    if (this.audio) { this.audio.pause(); pendingPlays.delete(this.audio); this.audio = null; }
    if (src) {
      // Loaded as a blob, not streamed: the dev server (serve.py) doesn't
      // answer range requests, and without them Chrome can't seek, so a
      // click on a line would jump back to the start. A blob always seeks.
      const a = new Audio();
      a.preload = 'auto';
      if (!this._blobs) this._blobs = new Map();
      const cached = this._blobs.get(src);
      if (cached) a.src = cached;
      else {
        fetch(src)
          .then((r) => { if (!r.ok) throw new Error(r.status); return r.blob(); })
          .then((blob) => {
            const url = URL.createObjectURL(blob);
            this._blobs.set(src, url);
            if (this.audio !== a) return;
            const at = a._pendingAt;
            a.src = url;
            if (at != null) {
              a.currentTime = at;
              a.play().catch(() => pendingPlays.add(a));   // retried on the next tap — see the header note
            }
          })
          .catch(() => { a.dispatchEvent(new Event('error')); });
      }
      a.volume = content.volume ?? 1;
      a.addEventListener('ended', () => this._finish());
      a.addEventListener('error', () => {
        console.warn(`[book] couldn't load the recording "${src}" — reading at a steady pace instead`);
        if (this.audio === a) { this.audio = null; if (this.ly?.playing) this._play(this._now()); }
      });
      this.audio = a;
    }

    this.ly = { lines, times, end: times[times.length - 1] + TAIL, active: -2, playing: false, t0: 0, done: false };
    this.root.classList.remove('lyrics-done', 'lyrics-on');
    this.spread = 0;
    this._paginate();
    this._paint(-1);
  }

  // ---- pages ------------------------------------------------------------
  //
  // The poem flows like a real notebook: the title heads the left page, the
  // lines follow it down that page, carry on down the right page, and when
  // both are full the next lines go over the page (a spread is a left page
  // and a right page). A line too long for the page wraps, with its
  // continuation indented. Pagination is measured, so it holds for any
  // screen size and redoes itself on resize.

  _paginate() {
    // Phones: one page at a time, full width, so the handwriting stays
    // readable. The cover still swings open, then steps aside (book.css).
    this.per = window.innerWidth <= SINGLE_MAX_W ? 1 : 2;
    this.root.classList.toggle('single', this.per === 1);
    // One-page mode: "back" lives on the page you can see.
    (this.per === 1 ? this.el.pgR : this.el.pgL).parentNode.appendChild(this.el.btnBack);
    const box = this.el.pgR;
    // Measure in a copy of the right page's content box, off to the side.
    const probe = box.cloneNode(false);
    probe.removeAttribute('data-el');
    probe.style.cssText = 'visibility:hidden;pointer-events:none;';
    box.parentNode.appendChild(probe);
    const cap = probe.clientHeight;
    const lh = parseFloat(getComputedStyle(probe).lineHeight) || 32;
    const rows = Math.max(1, Math.floor(cap / lh + 0.01));
    const hOf = (node) => { probe.appendChild(node); const h = node.offsetHeight; probe.removeChild(node); return Math.round(h / lh); };

    const pages = [[]];
    // The heading ends on a ruled line (then one blank row if there's no
    // note): pad it out to a whole number of rows, since the small note can
    // wrap to any height.
    this.headEl.style.paddingBottom = '0px';
    probe.appendChild(this.headEl);
    const hh = this.headEl.offsetHeight;
    probe.removeChild(this.headEl);
    const hasNote = !this.headEl.children[2]?.hidden;   // the note already breathes; no extra blank row
    this.headEl.style.paddingBottom = `${Math.ceil(hh / lh - 0.01) * lh - hh + (hasNote ? 0 : lh)}px`;
    let used = hOf(this.headEl);
    // Session 68: on a two-page spread the left page is a title page, just
    // the heading, sitting a little above the middle on a ruled line, and the
    // poem starts at the top of the right page. On a phone (one page at a
    // time) the heading stays at the top of page 1 with the poem under it,
    // so the reading doesn't open on a page turn.
    this.headEl.style.marginTop = '0px';
    if (this.per === 2) {
      this.headEl.style.marginTop = `${Math.max(0, Math.round((rows - used) * 0.4)) * lh}px`;
      pages.push([]);
      used = 0;
    }
    this.lnEls.forEach((ln, i) => {
      let h = hOf(ln);
      let page = pages[pages.length - 1];
      // A stanza gap at the top of a page is dropped: the page break is the gap.
      const gapRows = ln.classList.contains('gap') ? 1 : 0;
      if (used + gapRows + h > rows && page.length) {
        pages.push(page = []);
        used = 0;
      }
      ln.classList.toggle('top', used === 0);
      used += (used === 0 ? 0 : gapRows) + h;
      page.push(i);
    });
    probe.remove();
    if (this.per === 2 && pages.length % 2) pages.push([]);
    this.pages = pages;
    this.spreadOf = [];
    pages.forEach((p, k) => p.forEach((i) => { this.spreadOf[i] = Math.floor(k / this.per); }));
    this.spreads = pages.length / this.per;

    this._endTurn(true);
    const i = this.ly?.active ?? -1;
    this._render(i >= 0 ? this.spreadOf[i] : Math.min(this.spread ?? 0, this.spreads - 1));
  }

  /** Page numbers (0-based) on spread `s`: [left, right]. One-page mode has no left. */
  _sides(s) { return this.per === 2 ? [2 * s, 2 * s + 1] : [-1, s]; }

  /** Put spread `s`'s lines on the static page(s). */
  _render(s) {
    this.spread = s;
    const [l, r] = this._sides(s);
    this._fillOne(this.el.pgL, l, this.el.folioL);
    this._fillOne(this.el.pgR, r, this.el.folioR);
    this._navState();
  }

  _navState() {
    this.root.classList.toggle('can-back', this.spread > 0);
    this.root.classList.toggle('can-fwd', this.spread < this.spreads - 1);
  }

  /** A copy of page `k` for the turning leaf (same classes, so the ink matches). */
  _pageCopy(k) {
    const box = document.createElement('div');
    box.className = 'bk-pgc';
    if (k < 0) return box;
    if (k === 0) box.appendChild(this.headEl.cloneNode(true));
    for (const i of this.pages[k] ?? []) box.appendChild(this.lnEls[i].cloneNode(true));
    return box;
  }

  /**
   * Go to spread `s`. One spread forward or back turns a leaf on the spine,
   * the way the cover opened. Anything further just changes the pages.
   */
  _turnTo(s) {
    s = Math.max(0, Math.min(this.spreads - 1, s));
    if (s === this.spread && !this._leaf) return;
    if (this._leaf) this._endTurn();
    const from = this.spread;
    if (Math.abs(s - from) !== 1 || REDUCED()) { this._render(s); return; }

    const fwd = s > from;
    const leaf = document.createElement('div');
    leaf.className = 'bk-leaf ' + (fwd ? 'fwd' : 'rev');
    leaf.innerHTML = '<div class="bk-face bk-page bk-right bk-lf-front"></div><div class="bk-face bk-page bk-left bk-back bk-lf-back"></div>';
    const [front, back] = leaf.children;
    const folio = (n) => { const f = document.createElement('span'); f.className = 'bk-folio'; f.textContent = n; return f; };
    // Forward: the leaf is the current right page, and its back is the next left page.
    // Back: the leaf is the current left page lifting off, and its front is the previous right page.
    // (One-page mode: the leaf's back is blank, it's turning away out of view.)
    const [fl, fr] = this._sides(from);
    const [tl, tr] = this._sides(s);
    const fk = fwd ? fr : tr;
    const bk = fwd ? tl : fl;
    front.append(this._pageCopy(fk), folio(fk + 1));
    back.append(this._pageCopy(bk));
    if (bk >= 0) back.append(folio(bk + 1));
    leaf.style.transform = fwd ? 'rotateY(0deg)' : 'rotateY(-180deg)';
    this.el.book.appendChild(leaf);
    this._leaf = leaf;

    // What's under the leaf changes now; what it uncovers changes when it lands.
    this.spread = s;
    if (fwd) this._fillOne(this.el.pgR, tr, this.el.folioR);
    else if (tl >= 0) this._fillOne(this.el.pgL, tl, this.el.folioL);
    this._navState();
    void leaf.offsetWidth;   // commit the start pose before the transition
    leaf.classList.add('turning');
    leaf.style.transform = fwd ? 'rotateY(-180deg)' : 'rotateY(0deg)';
    this._turnTimer = setTimeout(() => this._endTurn(), TURN_MS);
  }

  _fillOne(box, k, folioEl) {
    box.textContent = '';
    folioEl.textContent = k >= 0 ? k + 1 : '';
    if (k < 0) return;
    if (k === 0) box.appendChild(this.headEl);
    for (const i of this.pages[k] ?? []) box.appendChild(this.lnEls[i]);
  }

  _endTurn(quiet = false) {
    clearTimeout(this._turnTimer);
    if (!this._leaf) return;
    this._leaf.remove();
    this._leaf = null;
    if (!quiet) this._render(this.spread);
  }

  // ---- the reading --------------------------------------------------------

  /** Seconds into the reading. */
  _now() {
    if (this.audio) return this.audio.currentTime;
    return (performance.now() - this.ly.t0) / 1000;
  }

  /** Start (or jump) the reading at `at` seconds. */
  _play(at = 0) {
    if (!this.ly || !this.isOpen) return;
    const ly = this.ly;
    ly.done = false;
    ly.playing = true;
    this.root.classList.remove('lyrics-done');
    this.root.classList.add('lyrics-on');
    if (this.audio) {
      const a = this.audio;
      // Ducks the house music (and the garden's own ambient loop) for as
      // long as the recording plays — see sfx.js's `duck`/`onDuck` — instead
      // of the two mixing under the poem, which is what was reported.
      this._releaseDuck ??= duck('book-poem');
      if (!a.src) { a._pendingAt = at; }   // still fetching: starts when it lands
      else {
        try { a.currentTime = at; } catch { /* not ready yet */ }
        a.play().catch((err) => {
          console.warn('[book] recording could not play:', err?.message ?? err);
          pendingPlays.add(a);   // one retry on the visitor's next tap/key
        });
      }
    } else {
      ly.t0 = performance.now() - at * 1000;
    }
    let i = -1;
    while (i + 1 < ly.times.length && ly.times[i + 1] <= at) i++;
    this._paint(i);
    this._follow(i, at);
    this._loop();
  }

  _loop() {
    cancelAnimationFrame(this._raf);
    const tick = () => {
      const ly = this.ly;
      if (!ly || !ly.playing || !this.isOpen) return;
      const t = this._now();
      let i = -1;
      while (i + 1 < ly.times.length && ly.times[i + 1] <= t) i++;
      if (i !== ly.active) this._paint(i);
      this._follow(i, t);
      if (!this.audio && t >= ly.end) { this._finish(); return; }
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  /** Keep the page with the reading on it open, turning a little ahead of the next page's first line. */
  _follow(i, t) {
    const ly = this.ly;
    let k = Math.max(0, i);
    if (i + 1 < ly.times.length && ly.times[i + 1] - t < TURN_LEAD) k = i + 1;
    const s = this.spreadOf[k] ?? 0;
    if (s !== this.spread && !this._leaf) this._turnTo(s);
  }

  /** Light line `i`: the one before fading, the next one faint, older ones a ghost, later ones hidden. */
  _paint(i) {
    this.ly.active = i;
    this.lnEls.forEach((el, k) => {
      el.classList.toggle('now', k === i);
      el.classList.toggle('next', k === i + 1);
      el.classList.toggle('past', k === i - 1);
      el.classList.toggle('read', k < i - 1);
    });
  }

  /** The reading is over: every line comes back, and the page buttons appear. */
  _finish() {
    const ly = this.ly;
    if (!ly || ly.done) return;
    ly.done = true;
    ly.playing = false;
    cancelAnimationFrame(this._raf);
    this._releaseDuck?.();
    this._releaseDuck = null;
    if (TIMING) { this._timeDone(); }
    this.root.classList.add('lyrics-done');
    this.root.classList.remove('lyrics-on');
  }

  _stop() {
    cancelAnimationFrame(this._raf);
    if (this.ly) this.ly.playing = false;
    if (this.audio) { this.audio._pendingAt = null; this.audio.pause(); pendingPlays.delete(this.audio); }
    this._releaseDuck?.();
    this._releaseDuck = null;
  }

  // ---- timing tool (?booktime) -----------------------------------------

  _timeStart() {
    if (!this.ly) return;
    this._marks = [];
    this.el.timer.classList.add('show');
    this.el.timer.textContent = `Timing: tap Space (or click the page) as each line starts. 0 / ${this.ly.lines.length}.  R restarts.`;
    // Nothing lights up on its own while timing. The taps drive it.
    this._stop();
    this.ly.done = false;
    this._paint(-1);
    this._turnTo(0);
    this.root.classList.remove('lyrics-done');
    this.root.classList.add('lyrics-on');
    if (this.audio) {
      if (!this.audio.src) this.audio._pendingAt = 0;
      else { this.audio.currentTime = 0; this.audio.play().catch(() => {}); }
    } else {
      this.ly.t0 = performance.now();
      this.el.timer.textContent += '  (No recording set, so the times are from a stopwatch.)';
    }
  }

  _tap() {
    if (!this._marks || !this.ly || this.ly.done) return;
    const t = Math.round((this.audio ? this.audio.currentTime : (performance.now() - this.ly.t0) / 1000) * 100) / 100;
    this._marks.push(t);
    const i = this._marks.length - 1;
    this._paint(i);
    if (this.spreadOf[i] !== this.spread) this._turnTo(this.spreadOf[i]);
    const n = this.ly.lines.length;
    this.el.timer.textContent = `Timing: ${this._marks.length} / ${n}  (last mark ${t}s).  R restarts.`;
    if (this._marks.length >= n) this._timeDone();
  }

  _timeDone() {
    if (!this._marks || this._marks.length < this.ly.lines.length) return;
    this.ly.done = true;
    const out = `times: [${this._marks.join(', ')}],`;
    console.log('[book] paste into config.js → garden → book:\n' + out);
    navigator.clipboard?.writeText(out).catch(() => {});
    this.el.timer.textContent = `Done. Copied to the clipboard, paste it into config.js:  ${out}`;
    this._marks = null;
    this.root.classList.add('lyrics-done');
    this.root.classList.remove('lyrics-on');
  }

  _clearTimers() { for (const id of this._timers) clearTimeout(id); this._timers = []; }

  _openOverlay() {
    const content = this.pendingOpen ?? {};
    this.pendingOpen = null;
    this._ensureBuilt();
    this._clearTimers();
    this.isOpen = true;
    this.state = 'reading';
    this.root.classList.remove('opened');
    // The layout is measured, so wait for the book's font (Special Elite) before filling.
    const fontsReady = document.fonts?.load ? document.fonts.load("24px 'Special Elite'").catch(() => {}) : Promise.resolve();
    fontsReady.then(() => { if (this.isOpen) this._fill(content); });
    requestAnimationFrame(() => {
      this.root.classList.add('show');
      // The 3D book hands over to the drawn one once the veil is up.
      this._timers.push(setTimeout(() => { if (this.state === 'reading') this.pivot.visible = false; }, 250));
      this._timers.push(setTimeout(() => this.root.classList.add('opened'), SHOW_MS));
      // Once the cover has swung open, the reading starts.
      this._timers.push(setTimeout(() => {
        const go = () => { if (TIMING) this._timeStart(); else this._play(0); };
        if (this.ly) go(); else fontsReady.then(() => this.isOpen && go());
      }, START_MS));
    });
  }

  /** Esc / × / the chip, via story.js close(). Shut the cover, fade, put the book back. */
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this._clearTimers();
    this._stop();
    this._endTurn();
    this._marks = null;
    this.el.timer.classList.remove('show');
    const wasOpen = this.root.classList.contains('opened');
    this.root.classList.remove('opened');
    // Shut on page 1, like a real book.
    this._timers.push(setTimeout(() => this.spreads && this._render(0), wasOpen ? COVER_MS * 0.5 : 0));
    this._timers.push(setTimeout(() => {
      this.root.classList.remove('show');
      this.pivot.visible = true;
      this._timers.push(setTimeout(() => this.putBack(), FADE_MS * 0.5));
    }, wasOpen ? COVER_MS * 0.8 : 0));
  }
}

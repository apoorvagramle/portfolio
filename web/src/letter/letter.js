// letter.js — the world map star's envelope + letter reveal (Session 41,
// revised Session 42 to use Apoorva's real envelope photos, Session 43 to
// tune where the letter rests, Session 45 to add the zoom-to-centre).
//
// Apoorva's brief: a brown envelope comes up when the map star is found;
// tapping it opens the flap and the letter slides out (front side,
// assets/letter/front.png — the postcard-style travel note); clicking the
// letter turns it over to the back (assets/letter/back.png, the Rajasthan
// photo); Esc puts it back in the envelope and it vanishes.
//
// Session 42: swapped the CSS-drawn envelope for Apoorva's own two photos
// ("letter close.webp" / "letter open.png", dropped at the top of the
// project folder). Those two source photos were NOT the same size or the
// same crop — 475x350 vs 360x360, different framing — so laid side by side
// as-is the envelope would visibly change size the instant it opened. Both
// were re-exported (trimmed to their real alpha bounds, the open one scaled
// so the envelope body is the same width as the closed one, then both
// composited bottom-aligned onto an identical 486x506 canvas) before being
// placed at assets/letter/envelope-closed.png and envelope-open.png — see
// claude/session-42-envelope-photos.md for the exact numbers. Same trick a
// sprite sheet uses: mismatched source photos, one consistent canvas.
//
// "The letter should slowly slide from inside to outside" (Apoorva, in
// review): the letter is a real, genuinely hidden object now, not a faded-
// in one. `.ltr-letter-mask` is an overflow:hidden window whose bottom edge
// sits at the envelope's mouth (roughly where the open photo's flap crease
// sits); the letter lives inside it and slides on `bottom`, starting far
// enough below the window that it's fully clipped away, ending well above
// it. There's no opacity fade doing the hiding — the clip is what makes it
// look like it's rising up and out of the envelope rather than fading into
// existence in front of it. Session 43 nudged where it settles once risen —
// see claude/session-43-letter-position.md — so it overlaps down over the
// envelope's flap/body rather than floating clear above it.
//
// Session 45: "enlarge the letter... after it comes out, it is zoomed in,
// like the letter becomes bigger and is in the center of screen." A third
// stage on top of the rise: a beat after the letter finishes coming out of
// the envelope (small, at its Session-43 resting spot), it grows and
// re-centres itself on the screen — `.zoomed` on #ltrVeil, timed by
// `_zoomIn()` below rather than left to chance, so it always happens the
// same way. The flip (front/back) still works in either size. Esc reverses
// all three stages in order — turn back to front if flipped, shrink back
// down to the small resting spot, THEN slide back into the envelope — see
// claude/session-45-letter-zoom.md for the exact geometry (why `bottom` on
// the zoomed letter is a big negative percentage, not a small positive
// one — it's centring on the envelope, which is itself roughly centred on
// the screen, not "10% more" of the small resting position).
//
// Self-contained like timeline.js: builds its own DOM the first time
// open() is called — no index.html markup needed, just its stylesheet
// link (letter.css, added next to timeline.css). story.js owns the
// trigger and the freeze/blocking contract — see the `letter: true`
// branch in reveal(), the `letterOpen` getter, and `blocking`.
//
// Unlike the art timeline, this deliberately does NOT take over the
// narration: Apoorva wants the top-left typewriter (#storyHud) still
// typing the map star's lines while the envelope is up, so reveal() calls
// startHud() alongside letter.open() rather than instead of it. That
// "parallel" behaviour falls out for free — Story.update() calls
// updateHud() unconditionally, never gated on `blocking` — so nothing
// here needs to know about the HUD at all.

const ENV_CLOSED_SRC = 'src/assets/letter/envelope-closed.png';
const ENV_OPEN_SRC = 'src/assets/letter/envelope-open.png';
const FRONT_SRC = 'src/assets/letter/front.png';
const BACK_SRC = 'src/assets/letter/back.png';

// How long the CSS transitions actually take (letter.css) — kept in sync
// here so open()'s auto-zoom and close()'s staged retract (flip back to
// front, shrink back down, THEN slide back into the envelope, THEN fade
// the whole thing out) wait exactly as long as the animations they're
// chaining, rather than cutting one off early or leaving a dead pause.
const RISE_MS = 1500;      // .2s transition-delay + 1.3s rise, .ltr-letter's `.opened` state
const ZOOM_PAUSE_MS = 350; // a beat to let it land before it starts growing
const ZOOM_MS = 900;       // .zoomed's own (faster) transition duration
const FLIP_MS = 620;
const SLIDE_CLOSE_MS = 1050;   // matches .ltr-letter's `.closing` duration
const VEIL_FADE_MS = 420;      // extra pause so the slide fully lands before the veil itself fades

const MARKUP = `
  <button class="ltr-close" data-el="btnClose" aria-label="Close the letter">&times;</button>
  <div class="ltr-scene">
    <div class="ltr-envelope" data-el="envelope" role="button" tabindex="0" aria-label="Open the envelope">
      <img class="ltr-env-img ltr-env-closed" src="${ENV_CLOSED_SRC}" alt="A closed brown envelope" draggable="false">
      <img class="ltr-env-img ltr-env-open" src="${ENV_OPEN_SRC}" alt="" draggable="false">
      <div class="ltr-letter-mask" data-el="mask">
        <div class="ltr-letter" data-el="letter" role="button" tabindex="0" aria-label="Turn the letter over">
          <div class="ltr-letter-inner" data-el="letterInner">
            <div class="ltr-letter-face ltr-letter-front">
              <img src="${FRONT_SRC}" alt="A letter from Apoorva about her travels" draggable="false">
            </div>
            <div class="ltr-letter-face ltr-letter-back">
              <img src="${BACK_SRC}" alt="The back of the letter — a photo from Rajasthan" draggable="false">
            </div>
          </div>
        </div>
      </div>
    </div>
    <p class="ltr-hint" data-el="hint">Tap the envelope</p>
  </div>
  <button class="ltr-esc" data-el="btnEsc" type="button" aria-label="Close the letter">
    <span class="ltr-esc-key"><kbd>Esc</kbd> to close</span>
    <span class="ltr-esc-touch">Tap here to close</span>
  </button>
`;

export class Letter {
  constructor(opts = {}) {
    this.onRequestClose = opts.onRequestClose || null;
    this.isOpen = false;
    this._built = false;
    this.phase = 'sealed';   // sealed | open | zoomed — how far out the letter is
    this.flipped = false;    // front | back — independent of phase
    this._closeTimer = null;
    this._zoomTimer = null;
  }

  _ensureBuilt() {
    if (this._built) return;
    this._built = true;

    const root = document.createElement('div');
    root.id = 'ltrVeil';
    root.innerHTML = MARKUP;
    document.body.appendChild(root);
    this.root = root;

    const el = {};
    root.querySelectorAll('[data-el]').forEach((n) => { el[n.getAttribute('data-el')] = n; });
    this.el = el;

    el.btnClose.addEventListener('click', () => this.onRequestClose?.());
    // Session 57: Esc always worked here but nothing on screen said so —
    // this chip sits at the bottom through every stage (the hint above it
    // fades once the letter zooms) and is itself a close button on a phone.
    el.btnEsc.addEventListener('click', () => this.onRequestClose?.());
    el.envelope.addEventListener('click', () => this._openEnvelope());
    el.envelope.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._openEnvelope(); }
    });
    // The letter sits inside the envelope's own click target — stop a tap
    // on it from also re-firing _openEnvelope() once it's already out.
    el.letter.addEventListener('click', (e) => { e.stopPropagation(); this._toggleFlip(); });
    el.letter.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); this._toggleFlip(); }
    });
  }

  _openEnvelope() {
    if (this.phase !== 'sealed') return;
    this.phase = 'open';
    this.root.classList.add('opened');
    this.el.hint.textContent = 'Click the letter to turn it over';
    this.el.letter.setAttribute('aria-label', 'Turn the letter over');
    // The rise-out-of-the-envelope finishes on its own (CSS-timed); once
    // it's landed, give it a short beat, then grow it and bring it to the
    // middle of the screen. Not tied to a click — Apoorva's ask was "after
    // it comes out", not "after it's clicked".
    clearTimeout(this._zoomTimer);
    this._zoomTimer = window.setTimeout(() => this._zoomIn(), RISE_MS + ZOOM_PAUSE_MS);
  }

  _zoomIn() {
    if (this.phase !== 'open') return;
    this.phase = 'zoomed';
    this.root.classList.add('zoomed');
  }

  _toggleFlip() {
    if (this.phase === 'sealed') return;
    this.flipped = !this.flipped;
    this.root.classList.toggle('flipped', this.flipped);
    this.el.hint.textContent = this.flipped ? 'Click to turn it back' : 'Click the letter to turn it over';
    this.el.letter.setAttribute('aria-label', this.flipped ? 'Turn the letter back over' : 'Turn the letter over');
  }

  /** Bring the envelope up, always starting sealed shut. */
  open() {
    this._ensureBuilt();
    clearTimeout(this._closeTimer);
    clearTimeout(this._zoomTimer);
    this.isOpen = true;
    this.phase = 'sealed';
    this.flipped = false;
    this.root.classList.remove('opened', 'zoomed', 'unzooming', 'flipped', 'closing');
    this.el.hint.textContent = 'Tap the envelope';
    this.el.envelope.setAttribute('aria-label', 'Open the envelope');
    this.el.letter.setAttribute('aria-label', 'Turn the letter over');
    // Next frame, so the entrance actually transitions in rather than
    // snapping straight to .show (same trick timeline.js's #tlVeil uses).
    requestAnimationFrame(() => this.root.classList.add('show'));
  }

  /** Esc (or the corner ×), routed here via story.js's close(). Reverses
   *  whichever stage it's in, in order: flip back to front first if it was
   *  turned over, then shrink back down from the zoomed, centred size (if
   *  it got there), then slide the letter back into the envelope, then
   *  fade the whole scene out — each stage timed to match letter.css
   *  exactly, so the next stage never starts before the last one lands. */
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    // Session 49: drop focus off the envelope/letter so no focus ring
    // lingers on them while the close animation plays.
    if (this.root?.contains(document.activeElement)) document.activeElement.blur();
    clearTimeout(this._closeTimer);
    clearTimeout(this._zoomTimer);
    const { root } = this;
    const wasFlipped = this.flipped;
    const wasZoomed = this.phase === 'zoomed';
    const wasOpen = this.phase !== 'sealed';
    this.phase = 'sealed';
    this.flipped = false;

    if (!wasOpen) { root.classList.remove('show'); return; }

    const retract = () => {
      root.classList.remove('zoomed', 'unzooming');   // defensive — should already be off by now
      root.classList.add('closing');     // letter slides back down, envelope re-seals
      this._closeTimer = window.setTimeout(() => {
        root.classList.remove('show', 'opened', 'zoomed', 'closing');
      }, SLIDE_CLOSE_MS + VEIL_FADE_MS);
    };
    const unzoom = () => {
      // `.unzooming`, not just dropping `.zoomed`: shrinking straight back
      // to `.opened`'s own rule would inherit its transition-delay (meant
      // for the very first rise out of the envelope) — see letter.css's
      // comment on `.unzooming` for why that's wrong here.
      root.classList.remove('zoomed');
      root.classList.add('unzooming');
      this._closeTimer = window.setTimeout(() => {
        root.classList.remove('unzooming');
        retract();
      }, ZOOM_MS);
    };

    const afterFlip = wasZoomed ? unzoom : retract;
    if (wasFlipped) {
      root.classList.remove('flipped');
      this._closeTimer = window.setTimeout(afterFlip, FLIP_MS);
    } else {
      afterFlip();
    }
  }
}

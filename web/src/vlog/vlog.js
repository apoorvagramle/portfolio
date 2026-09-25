// vlog.js — the studio table star's camera vlog (Session 57).
//
// Apoorva's brief: when the `social` star (the folding desk with the
// camera, tripod and iPad) is found, her camera vlog pops up with the
// viewfinder layer (REC dot, battery, corner brackets, "ARTISTIC_BRAINS_")
// laid over it, while the star's lines type out at the same time. After
// that, clicking the Camera on the desk opens the vlog again and plays it.
// Esc (or the ×, or the "Esc to close" chip) puts it away.
//
// Same contract as letter.js: self-contained, builds its own DOM the first
// time open() is called, and story.js owns the trigger and the
// freeze/blocking rules (`vlog: true` in reveal()/revisit(), the `vlogOpen`
// getter, `blocking`).
//
// The star's lines: the usual top-left HUD would sit on the video's own
// top-left corner (the REC dot) and under this veil, so while the vlog is up
// the typed text shows as a caption under the video instead. story.js's
// paintHud() pushes each frame of the typewriter here via setCaption();
// clicking the caption does the same as clicking the HUD (finish the line,
// or skip to the next). On a revisit there's no HUD running, so no caption.
//
// The source clip was 4K HEVC 10-bit HLG (iPhone-style HDR) — Chrome on
// Windows won't play HEVC without a paid extension, so it was tone-mapped
// to SDR and re-encoded as 1280x720 H.264 (assets/vlog/camera-vlog.mp4).
// Plays once, then stops (Session 60). No audio track in the source, so it plays muted, which also means
// autoplay is never blocked.

const VIDEO_SRC = 'src/assets/vlog/camera-vlog.mp4';
const LAYER_SRC = 'src/assets/vlog/video-layer.png';
const FADE_MS = 380;   // matches #vlgVeil's opacity transition in vlog.css

const MARKUP = `
  <button class="vlg-close" data-el="btnClose" type="button" aria-label="Close the vlog">&times;</button>
  <div class="vlg-stage">
    <div class="vlg-frame">
      <video class="vlg-video" data-el="video" src="${VIDEO_SRC}" muted playsinline preload="none"></video>
      <img class="vlg-layer" src="${LAYER_SRC}" alt="" draggable="false">
      <button class="vlg-play" data-el="btnPlay" type="button" aria-label="Pause">
        <svg class="vlg-ico-pause" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>
        <svg class="vlg-ico-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>
      </button>
    </div>
    <div class="vlg-caption-slot">
      <p class="vlg-caption" data-el="caption" hidden><span data-el="captionText"></span></p>
    </div>
  </div>
  <button class="vlg-esc" data-el="btnEsc" type="button" aria-label="Close">
    <span class="vlg-esc-key"><kbd>Esc</kbd> to close</span>
    <span class="vlg-esc-touch">Tap to close</span>
  </button>
`;

export class Vlog {
  constructor(opts = {}) {
    this.onRequestClose = opts.onRequestClose || null;
    this.onCaptionClick = opts.onCaptionClick || null;
    this.isOpen = false;
    this._built = false;
    this._hideTimer = null;
  }

  _ensureBuilt() {
    if (this._built) return;
    this._built = true;
    const root = document.createElement('div');
    root.id = 'vlgVeil';
    root.innerHTML = MARKUP;
    document.body.appendChild(root);
    this.root = root;
    const el = {};
    root.querySelectorAll('[data-el]').forEach((n) => { el[n.getAttribute('data-el')] = n; });
    this.el = el;
    el.btnClose.addEventListener('click', () => this.onRequestClose?.());
    el.btnEsc.addEventListener('click', () => this.onRequestClose?.());
    el.caption.addEventListener('click', () => this.onCaptionClick?.());
    // Session 58: a play/pause button in the frame's bottom-left corner
    // (inside the viewfinder bracket). Tapping the picture still toggles too.
    const toggle = () => { const v = el.video; if (v.paused) v.play().catch(() => {}); else v.pause(); };
    root.querySelector('.vlg-frame').addEventListener('click', toggle);
    el.btnPlay.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
    const sync = () => {
      const paused = el.video.paused;
      root.classList.toggle('paused', paused);
      el.btnPlay.setAttribute('aria-label', paused ? 'Play' : 'Pause');
    };
    el.video.addEventListener('play', sync);
    el.video.addEventListener('pause', sync);
    // Session 60: no loop — it plays once and stops on its last frame,
    // showing the play button. Play from there starts it over.
    el.video.addEventListener('ended', sync);
  }

  /** Bring the vlog up and play it from the start. `caption: true` (the
   *  first find, when the star's lines type underneath) reserves the
   *  caption's space up front, so the video never shifts as lines grow. */
  open({ caption = false } = {}) {
    this._ensureBuilt();
    this.root.classList.toggle('has-caption', caption);
    clearTimeout(this._hideTimer);
    this.isOpen = true;
    const v = this.el.video;
    v.preload = 'auto';
    try { v.currentTime = 0; } catch { /* not loaded yet — starts at 0 anyway */ }
    v.play().catch(() => {});
    this.setCaption(null);
    document.body.classList.add('vlog-open');
    requestAnimationFrame(() => this.root.classList.add('show'));
  }

  /** The star's typewriter line, mirrored under the video. null hides it. */
  setCaption(text, typing = false) {
    if (!this._built) return;
    const { caption, captionText } = this.el;
    if (text == null || !this.isOpen) { caption.hidden = true; caption.classList.remove('typing'); return; }
    caption.hidden = false;
    captionText.textContent = text;
    caption.classList.toggle('typing', typing);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    if (this.root.contains(document.activeElement)) document.activeElement.blur();
    this.root.classList.remove('show');
    document.body.classList.remove('vlog-open');
    this.setCaption(null);
    clearTimeout(this._hideTimer);
    this._hideTimer = window.setTimeout(() => { this.el.video.pause(); }, FADE_MS);
  }
}

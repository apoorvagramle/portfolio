// sunset.js — the garden `sunsets` coin (Session 75).
//
// Apoorva's brief: finding the sunsets coin puts a sun high in the sky.
// The visitor drags it down, and as it sinks one of her own sunset photos
// fades in over the sky (no colour grading, only her photo). Once the photo
// is fully there, tapping it opens the rest of her sunsets.
//
// How it plays:
//   drag     The sun sits high, a little right of where it will set. Grab
//            it (or drag anywhere, which helps on a phone) and pull down. The
//            sun slides along a short arc toward the horizon and the photo's
//            opacity follows it. Dragging back up fades the photo out again.
//            Letting go past AUTO_AT sinks the sun the rest of the way on its own.
//   set      The sun has gone. Its end point is the sun IN the photo
//            (HERO.sun, measured on sunset-1), so it sets into the picture.
//            The photo is at full opacity, the star's lines type top-left
//            (onSet -> story.startHud), and a "tap the sunset" hint appears.
//   gallery  One photo at a time, full-bleed like the first one (no frames),
//            crossfading. Arrows, arrow keys, swipe or the dots move
//            through them.
//
// Same contract as vlog.js / letter.js: self-contained, builds its own DOM
// on first open(), and story.js owns the trigger and the freeze/blocking
// rules (`sunset: true` in the def, the `sunsetOpen` getter, `blocking`,
// close()). Esc, the × or the chip close it at any point.

const DIR = 'src/assets/sunsets/';
// The first photo is the one that "sets". `sun` is where the sun sits in it,
// as fractions of the image's width/height (measured: the bright disc behind
// the pylon, ~0.48, ~0.60).
const HERO = { src: DIR + 'sunset-1.webp', sun: [0.483, 0.603] };
const PHOTOS = [1, 2, 3, 4, 5].map((n) => DIR + `sunset-${n}.webp`);

const AUTO_AT = 0.78;        // let go past this and it finishes by itself
const SET_SPEED = 0.9;       // progress/sec for the auto-finish
const SUN_ON_SCREEN_Y = 0.64; // where on screen the photo's sun is lined up (fraction of height)
const FADE_MS = 420;

const MARKUP = `
  <div class="sun-dusk"></div>
  <div class="sun-photo-wrap" data-el="photoWrap">
    <img class="sun-photo" data-el="photo" src="${HERO.src}" alt="A sunset behind a power pylon" draggable="false">
  </div>
  <div class="sun-orb" data-el="orb" aria-hidden="true"><i></i></div>
  <p class="sun-hint" data-el="hint">Drag the sun down</p>
  <button class="sun-tap" data-el="tap" type="button">Tap the sunset to see more</button>

  <div class="sun-gallery" data-el="gallery" aria-roledescription="carousel" aria-label="Apoorva's sunsets">
    <div class="sun-slides" data-el="slides"></div>
    <button class="sun-nav sun-prev" data-el="prev" type="button" aria-label="Previous sunset">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>
    </button>
    <button class="sun-nav sun-next" data-el="next" type="button" aria-label="Next sunset">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>
    </button>
    <div class="sun-dots" data-el="dots"></div>
  </div>

  <button class="sun-close" data-el="btnClose" type="button" aria-label="Close the sunsets">&times;</button>
  <button class="sun-esc" data-el="btnEsc" type="button" aria-label="Close">
    <span class="sun-esc-key"><kbd>Esc</kbd> to close</span>
    <span class="sun-esc-touch">Tap to close</span>
  </button>
`;

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

export class Sunset {
  constructor(opts = {}) {
    this.onRequestClose = opts.onRequestClose || null;
    this.onSet = opts.onSet || null;    // the sun has gone down (fires once per open)
    this.isOpen = false;
    this.state = 'idle';               // drag | setting | set | gallery
    this.p = 0;                        // 0 = sun high, 1 = set
    this.index = 0;
    this._built = false;
    this._hideTimer = null;
    this._raf = 0;
  }

  _ensureBuilt() {
    if (this._built) return;
    this._built = true;
    const root = document.createElement('div');
    root.id = 'sunVeil';
    root.innerHTML = MARKUP;
    document.body.appendChild(root);
    this.root = root;
    const el = {};
    root.querySelectorAll('[data-el]').forEach((n) => { el[n.getAttribute('data-el')] = n; });
    this.el = el;

    el.btnClose.addEventListener('click', () => this.onRequestClose?.());
    el.btnEsc.addEventListener('click', () => this.onRequestClose?.());

    // --- the drag -------------------------------------------------------
    // Anywhere on the veil works, not only the sun itself: a sun is a small
    // thing to hit with a thumb, and "pull the sky down" reads the same.
    root.addEventListener('pointerdown', (e) => {
      if (this.state !== 'drag' || e.target.closest('button')) return;
      e.preventDefault();
      root.setPointerCapture(e.pointerId);
      this._drag = { id: e.pointerId, y0: e.clientY, p0: this.p };
      root.classList.add('dragging');
    });
    root.addEventListener('pointermove', (e) => {
      const d = this._drag;
      if (!d || d.id !== e.pointerId) return;
      const span = Math.max(1, this.path.y1 - this.path.y0);
      this.setProgress(d.p0 + (e.clientY - d.y0) / span);
      if (this.p > 0.04) root.classList.add('moved');
    });
    const release = (e) => {
      const d = this._drag;
      if (!d || d.id !== e.pointerId) return;
      this._drag = null;
      root.classList.remove('dragging');
      if (this.p >= AUTO_AT) this._finish();
    };
    root.addEventListener('pointerup', release);
    root.addEventListener('pointercancel', release);

    // --- set -> gallery -------------------------------------------------
    const toGallery = () => { if (this.state === 'set') this.openGallery(1); };
    el.photoWrap.addEventListener('click', toGallery);
    el.tap.addEventListener('click', toGallery);

    // --- gallery ----------------------------------------------------------
    el.slides.innerHTML = PHOTOS.map((src, i) => `
      <figure class="sun-slide" data-i="${i}">
        <img data-src="${src}" alt="Sunset ${i + 1} of ${PHOTOS.length}" draggable="false">
      </figure>`).join('');
    el.dots.innerHTML = PHOTOS.map((_, i) => `<button type="button" data-i="${i}" aria-label="Sunset ${i + 1}"></button>`).join('');
    el.prev.addEventListener('click', () => this.show(this.index - 1));
    el.next.addEventListener('click', () => this.show(this.index + 1));
    el.dots.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) this.show(+b.dataset.i); });
    // Swipe.
    el.gallery.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      this._swipe = { id: e.pointerId, x0: e.clientX, y0: e.clientY };
    });
    el.gallery.addEventListener('pointerup', (e) => {
      const s = this._swipe; this._swipe = null;
      if (!s || s.id !== e.pointerId) return;
      const dx = e.clientX - s.x0, dy = e.clientY - s.y0;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) this.show(this.index + (dx < 0 ? 1 : -1));
    });

    this._onKey = (e) => {
      if (!this.isOpen || this.state !== 'gallery') return;
      if (e.code === 'ArrowRight') this.show(this.index + 1);
      else if (e.code === 'ArrowLeft') this.show(this.index - 1);
    };
    addEventListener('keydown', this._onKey);
    this._onResize = () => { if (this.isOpen) { this._layout(); this._paint(); } };
    addEventListener('resize', this._onResize);
  }

  // Where the photo sits (cover-fitted, shifted so its sun lands at a nice
  // spot on screen) and the arc the sun travels along to get there.
  _layout() {
    const img = this.el.photo;
    const W = innerWidth, H = innerHeight;
    const iw = img.naturalWidth || 1350, ih = img.naturalHeight || 1800;
    const s = Math.max(W / iw, H / ih);
    const dw = iw * s, dh = ih * s;
    const ox = Math.max(0, Math.min(dw - W, HERO.sun[0] * dw - W * 0.5));
    const oy = Math.max(0, Math.min(dh - H, HERO.sun[1] * dh - H * SUN_ON_SCREEN_Y));
    img.style.width = `${dw}px`; img.style.height = `${dh}px`;
    img.style.transform = `translate(${-ox}px, ${-oy}px)`;
    const x1 = HERO.sun[0] * dw - ox, y1 = HERO.sun[1] * dh - oy;
    const size = Math.max(72, Math.min(130, Math.min(W, H) * 0.14));
    this.path = {
      x0: x1 + Math.min(W * 0.14, 170), y0: Math.max(size * 0.9 + 20, H * 0.14),
      x1, y1, size,
    };
  }

  setProgress(p) {
    this.p = clamp01(p);
    this._paint();
    if (this.p >= 1 && this.state !== 'set' && this.state !== 'gallery') this._landed();
  }

  _paint() {
    const { x0, y0, x1, y1, size } = this.path;
    const p = this.p;
    // A shallow arc: it drifts left as it drops, the way a real one slides
    // toward the horizon.
    const e = 1 - (1 - p) * (1 - p);
    const x = mix(x0, x1, e), y = mix(y0, y1, p);
    const scale = mix(1, 0.62, p);
    const o = this.el.orb;
    o.style.width = o.style.height = `${size}px`;
    o.style.transform = `translate(${x - size / 2}px, ${y - size / 2}px) scale(${scale})`;
    // The sun warms as it sinks and melts into the photo's own sun at the end.
    o.style.setProperty('--warm', p.toFixed(3));
    o.style.opacity = String(1 - smooth(0.84, 1, p));
    // The photo comes up slowly at first, then fills in as the sun nears the
    // horizon.
    this.el.photoWrap.style.opacity = String(Math.pow(p, 1.35));
    this.root.style.setProperty('--dusk', p.toFixed(3));
    this.el.hint.style.transform = `translate(${x}px, ${y + size * 0.5 * scale + 18}px) translateX(-50%)`;
  }

  _finish() {
    if (this.state !== 'drag') return;
    this.state = 'setting';
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      this.setProgress(this.p + SET_SPEED * dt * (1.15 - this.p * 0.6));
      if (this.state === 'setting' && this.isOpen) this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  _landed() {
    cancelAnimationFrame(this._raf);
    this.state = 'set';
    this.root.classList.add('set');
    this.onSet?.();
    // Start fetching the others now; they're small (~70–140 KB each).
    this.el.slides.querySelectorAll('img[data-src]').forEach((img) => { img.src = img.dataset.src; img.removeAttribute('data-src'); });
    clearTimeout(this._tapTimer);
    this._tapTimer = setTimeout(() => { if (this.state === 'set') this.root.classList.add('can-tap'); }, 1400);
  }

  openGallery(i = 0) {
    this.state = 'gallery';
    this.root.classList.remove('can-tap');
    this.root.classList.add('gallery');
    this.show(i, true);
  }

  show(i, instant = false) {
    const n = PHOTOS.length;
    this.index = ((i % n) + n) % n;
    const slides = this.el.slides.children;
    const was = this._cur;
    this._cur = this.index;
    clearTimeout(this._prevTimer);
    for (const s of slides) s.classList.remove('prev');
    if (!instant && was != null && was !== this.index) {
      slides[was].classList.add('prev');
      this._prevTimer = setTimeout(() => slides[was].classList.remove('prev'), 750);
    }
    for (let k = 0; k < slides.length; k++) {
      const on = k === this.index;
      slides[k].classList.toggle('on', on);
      slides[k].setAttribute('aria-hidden', on ? 'false' : 'true');
      if (instant) slides[k].style.transition = 'none';
    }
    if (instant) requestAnimationFrame(() => { for (const s of slides) s.style.transition = ''; });
    [...this.el.dots.children].forEach((d, k) => d.classList.toggle('on', k === this.index));
  }

  open() {
    this._ensureBuilt();
    clearTimeout(this._hideTimer);
    clearTimeout(this._tapTimer);
    cancelAnimationFrame(this._raf);
    this.isOpen = true;
    this.state = 'drag';
    this.p = 0;
    this._drag = null;
    this._cur = null;
    this.root.classList.remove('set', 'can-tap', 'gallery', 'moved', 'dragging');
    const go = () => {
      if (!this.isOpen) return;
      this._layout(); this._paint();
    };
    go();
    if (!this.el.photo.complete) this.el.photo.addEventListener('load', go, { once: true });
    document.body.classList.add('sunset-open');
    requestAnimationFrame(() => this.root.classList.add('show'));
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    cancelAnimationFrame(this._raf);
    clearTimeout(this._tapTimer);
    this._drag = null;
    if (this.root.contains(document.activeElement)) document.activeElement.blur();
    this.root.classList.remove('show');
    document.body.classList.remove('sunset-open');
    this._hideTimer = setTimeout(() => {
      this.state = 'idle';
      this.root.classList.remove('set', 'can-tap', 'gallery', 'moved');
    }, FADE_MS);
  }
}

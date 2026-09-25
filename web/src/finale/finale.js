// ---------------------------------------------------------------------------
//  Session 74/75 — the last word.
//
//  Once every counted star is found AND the last one's interaction has played
//  out (the caller's `isIdle()` — no HUD typing, no full-screen takeover, the
//  coffee cup finished if that was the last star), wait a second, then raise
//  one centred liquid-glass card: Apoorva's sign-off, left-aligned, her pixel
//  self sitting in the bottom-right corner — waves hello once as the card
//  lands, and again whenever she is hovered (or tapped). Confetti + the
//  `confetti` sfx go off on landing.
//
//  Closing it either sends the visitor back to the porch (a page reload, which
//  is the only honest "start over" in a house with this much one-way staging —
//  the TV night, the open oven, the coffee cup, the collected stars — and
//  progress is per-visit by design, see discoveries.js) or just lets them keep
//  wandering. Set `CONFIG.finale.restart = false` to make the primary button a
//  plain close.
//
//      const finale = new Finale({ isIdle: () => boolean });
//      finale.arm(lastStarId);   // when the count hits the total
//      finale.update(dt);        // every frame
//      finale.isOpen             // OR into blocked()
// ---------------------------------------------------------------------------
import { CONFIG } from '../config/config.js';
import { glassifyPanel } from '../glassify/glassify.js';
import { playSfx } from '../sfx/sfx.js';

// wave.png: four 90x68 (x4) frames of the porch sprite, cut from the chest up
// with no backdrop — idle, hand raised, wave A, wave B (same order as
// intro.js's FRAME).
const FRAMES = { IDLE: 0, RAISE: 1, WAVE_A: 2, WAVE_B: 3 };

const DEFAULTS = {
  delaySec: 1,           // beat after the last interaction before the card appears
  restart: true,         // primary button reloads the page (back to the porch intro)
  sprite: new URL('../assets/finale/wave.png', import.meta.url).href,
  firstWaveMs: 1500,     // after the card opens
  // Each entry is one paragraph; `\n` is a real line break. `font` picks the
  // face per line: 'major' = Bitcount Grid (primary), 'body' = Coda
  // (secondary). One entry may list one font per line.
  lines: [
    { text: 'Wow, you actually found them all.', font: ['major'], cls: 'lead' },
    { text: 'I really like trying new things.\nI pick them up, figure them out, and somehow, whatever I touch becomes art.', font: ['body'] },
    { text: 'And I guess that’s what makes my work Apoorva too —\nunique, extraordinary, like never before.', font: ['body', 'body'] },
    { text: 'And yeah… to sum me up:', font: ['body'] },
    { text: 'Jack of all trades, master of none,\nthough oftentimes better than master of one.', font: ['major', 'major'], cls: 'quote' },
  ],
  signOff: 'Signing Off,',
  name: 'Apoorva Gramle',
  restartLabel: 'Back to the porch',
  stayLabel: 'Keep exploring',
};

const CONFETTI_COLORS = ['#ffd166', '#ff5d73', '#6fb8e6', '#7fc98c', '#f2dfa8', '#c79bff', '#ffffff'];

export class Finale {
  constructor({ isIdle, opts } = {}) {
    this.opts = { ...DEFAULTS, ...(CONFIG.finale ?? {}), ...(opts ?? {}) };
    this.isIdle = isIdle ?? (() => true);
    this.armed = false;
    this.shown = false;
    this.isOpen = false;
    this.wait = 0;
    this.lastId = null;
    this.frame = 0;
    this.waveTimer = null;
    this.build();
  }

  build() {
    const o = this.opts;
    const veil = document.createElement('div');
    veil.id = 'finaleVeil';

    const card = document.createElement('div');
    card.id = 'finale';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', 'A note from Apoorva');

    const text = document.createElement('div');
    text.className = 'finaleText';
    let i = 0;
    for (const l of o.lines) {
      const p = document.createElement('p');
      if (l.cls) p.className = l.cls;
      p.style.setProperty('--i', i++);
      // one span per line so each can take its own font
      l.text.split('\n').forEach((line, k, all) => {
        const s = document.createElement('span');
        s.className = `ln ${(l.font ?? ['body'])[k] ?? (l.font ?? ['body']).at(-1)}`;
        s.textContent = line;
        p.appendChild(s);
        if (k < all.length - 1) p.appendChild(document.createElement('br'));
      });
      text.appendChild(p);
    }

    const bottom = document.createElement('div');
    bottom.className = 'finaleBottom';

    const left = document.createElement('div');
    left.className = 'finaleLeft';
    const sign = document.createElement('p');
    sign.className = 'sign';
    sign.style.setProperty('--i', i++);
    const off = document.createElement('span'); off.className = 'soff'; off.textContent = o.signOff;
    const nm = document.createElement('span'); nm.className = 'name'; nm.textContent = o.name;
    sign.append(off, nm);

    const btns = document.createElement('div');
    btns.className = 'finaleBtns';
    this.goBtn = document.createElement('button');
    this.goBtn.type = 'button';
    this.goBtn.textContent = o.restart ? o.restartLabel : o.stayLabel;
    this.goBtn.addEventListener('click', () => this.finish(true));
    btns.appendChild(this.goBtn);
    if (o.restart) {
      this.stayBtn = document.createElement('button');
      this.stayBtn.type = 'button';
      this.stayBtn.className = 'quiet';
      this.stayBtn.textContent = o.stayLabel;
      this.stayBtn.addEventListener('click', () => this.finish(false));
      btns.appendChild(this.stayBtn);
    }
    left.append(sign, btns);

    // Her, bottom-right, straight on the card's bottom edge.
    const photo = document.createElement('div');
    photo.className = 'finalePhoto';
    photo.setAttribute('role', 'img');
    photo.setAttribute('aria-label', 'Apoorva, waving');
    photo.style.setProperty('--i', i++);
    photo.style.backgroundImage = `url("${o.sprite}")`;
    photo.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') this.wave(2); });
    photo.addEventListener('pointerdown', () => this.wave(2));
    this.photo = photo;
    this.setFrame(FRAMES.IDLE);

    bottom.append(left, photo);
    card.append(text, bottom);
    document.body.append(veil, card);
    this.veil = veil; this.card = card;
    glassifyPanel(card);

    addEventListener('keydown', (e) => {
      if (this.isOpen && e.code === 'Escape') { e.stopImmediatePropagation(); this.finish(false); }
    }, true);
  }

  setFrame(f) {
    this.frame = f;
    this.photo.style.backgroundPosition = `${(f * 100) / 3}% 0`;
  }

  /** Raise the hand, wave `times` back-and-forths, lower it. One at a time. */
  wave(times = 2) {
    if (this.waveTimer || !this.isOpen) return;
    const seq = [[FRAMES.RAISE, 110]];
    for (let i = 0; i < times; i++) seq.push([FRAMES.WAVE_A, 230], [FRAMES.WAVE_B, 230]);
    seq.push([FRAMES.RAISE, 110], [FRAMES.IDLE, 0]);
    let k = 0;
    const next = () => {
      this.setFrame(seq[k][0]);
      const d = seq[k][1];
      k++;
      if (k >= seq.length) { this.waveTimer = null; return; }
      this.waveTimer = setTimeout(next, d);
    };
    next();
  }

  /** Every counted star is in the bag. `id` is the one that just completed it. */
  arm(id) {
    if (this.shown) return;
    this.armed = true;
    this.lastId = id ?? null;
    this.wait = 0;
  }

  update(dt) {
    if (!this.armed || this.shown) return;
    if (!this.isIdle(this.lastId)) { this.wait = 0; return; }
    this.wait += dt;
    if (this.wait >= this.opts.delaySec) this.open();
  }

  open() {
    if (this.shown) return;
    this.shown = true; this.isOpen = true;
    this.veil.classList.add('show');
    this.card.classList.add('show');
    this.goBtn.focus({ preventScroll: true });
    playSfx('confetti');
    this.confetti();
    setTimeout(() => this.wave(2), this.opts.firstWaveMs);
  }

  finish(restart) {
    if (!this.isOpen) return;
    if (restart && this.opts.restart) {
      // Fade out first so the reload doesn't read as a crash.
      this.card.classList.remove('show'); this.veil.classList.add('solid');
      setTimeout(() => location.reload(), 450);
      return;
    }
    this.isOpen = false;
    this.card.classList.remove('show');
    this.veil.classList.remove('show');
    clearTimeout(this.waveTimer); this.waveTimer = null;
  }

  // -- confetti ------------------------------------------------------------
  //  Two cannons low on either side firing up and inwards, plus a light rain
  //  from the top. A throwaway full-screen canvas: it removes itself when the
  //  last piece has left the screen.
  confetti() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cv = document.createElement('canvas');
    cv.id = 'finaleConfetti';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = innerWidth, H = innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    document.body.appendChild(cv);
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);

    const rnd = (a, b) => a + Math.random() * (b - a);
    const pieces = [];
    const mk = (x, y, vx, vy, delay) => pieces.push({
      x, y, vx, vy, delay,
      w: rnd(6, 11), h: rnd(9, 16), rot: rnd(0, 6.28), vr: rnd(-7, 7),
      flip: rnd(0, 6.28), vf: rnd(4, 9), round: Math.random() < 0.22,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    });
    const speed = Math.max(H, 600);
    for (const side of [0, 1]) {
      const base = side ? -Math.PI * 0.66 : -Math.PI * 0.34;   // up and inwards
      for (let n = 0; n < 70; n++) {
        const a = base + rnd(-0.38, 0.38), s = speed * rnd(0.7, 1.45);
        mk(side ? W + 8 : -8, H * 0.92, Math.cos(a) * s, Math.sin(a) * s, rnd(0, 0.18));
      }
    }
    for (let n = 0; n < 70; n++) mk(rnd(0, W), -20, rnd(-40, 40), rnd(20, 120), rnd(0.2, 2.2));

    let last = performance.now(), t = 0;
    const gravity = speed * 1.25, terminal = speed * 0.32;
    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05); last = now; t += dt;
      g.clearRect(0, 0, W, H);
      let alive = 0;
      for (const p of pieces) {
        if (t < p.delay) { alive++; continue; }
        p.vy += gravity * dt;
        p.vx *= Math.pow(0.16, dt);
        // ease the fall toward a flutter-y terminal speed
        if (p.vy > terminal) p.vy += (terminal - p.vy) * (1 - Math.pow(0.08, dt));
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.rot += p.vr * dt; p.flip += p.vf * dt;
        if (p.y > H + 30) continue;
        alive++;
        g.save();
        g.translate(p.x, p.y); g.rotate(p.rot);
        g.scale(1, Math.abs(Math.cos(p.flip)) * 0.9 + 0.1);
        g.fillStyle = p.color;
        if (p.round) { g.beginPath(); g.arc(0, 0, p.w * 0.5, 0, 6.283); g.fill(); }
        else g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        g.restore();
      }
      if (alive && t < 9) requestAnimationFrame(tick); else cv.remove();
    };
    requestAnimationFrame(tick);
  }
}

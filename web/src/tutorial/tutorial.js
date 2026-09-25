// ---------------------------------------------------------------------------
//  Session 80/81 — the walk-through, before the intro.
//
//  Runs the moment the loader lifts, in the visitor's own first-person view on
//  the front path, BEFORE Apoorva's porch intro — so everybody knows how to
//  get around before anything else happens. A small glass note sits top-left
//  (where the story lines type, so it trains the eye to look there) and
//  teaches one thing at a time, each step ticking over when the visitor
//  actually does it:
//
//     1  MOVE   click the circle / W A S D       -> done after a few steps walked
//     2  LOOK   drag to look around              -> done on the first real drag
//     3  STAR   a star appears just ahead; the view walks up to it; it pops
//
//  The pop hands over to `onDone` (main.js), which brings the porch shot in
//  and starts the intro text. Skip jumps straight to `onDone`. Never counts
//  toward the eight discoveries.
//
//      const tut = new Tutorial({ THREE, scene, camera, walker, goTo, isBusy });
//      tut.start({ onDone });   // when the visitor first gets control
//      tut.update(dt);          // every frame
//      tut.noteLook();          // from the pointer-drag branch
// ---------------------------------------------------------------------------
import { CONFIG } from '../config/config.js';
import { glassifyChip } from '../glassify/glassify.js';
import { makeGlassStar } from '../glass-star/glass-star.js';
import { playSfx } from '../sfx/sfx.js';

const DEFAULTS = {
  walkDist: 1.6,              // world units walked to finish "move"
  doneHoldMs: 650,            // beat a finished step stays ticked
  starY: 3.0,                 // star height above the floor
  pathZ: -23.25,              // the front path's centre line (the door's z)
  starAhead: 4.0,             // how far ahead of the visitor, along the path, the star appears
  pathMinX: -31.0, pathMaxX: -24.6,   // keep it on the path, short of the porch
  starSize: 0.55,
  standOff: 0.9,              // the view stops this far short of the star
  arriveDist: 1.25,           // horizontal distance at which the star pops
  starDelaySec: 0.9,          // star fades in this long before the view starts walking
  afterPopSec: 0.7,           // pop -> onDone
};

export class Tutorial {
  constructor({ THREE, scene, camera, walker, goTo, isBusy, opts = {} }) {
    this.THREE = THREE; this.scene = scene; this.camera = camera;
    this.walker = walker; this.goTo = goTo;
    this.isBusy = isBusy ?? (() => false);
    this.o = { ...DEFAULTS, ...(CONFIG.tutorial ?? {}), ...opts };
    this.coarse = matchMedia('(pointer: coarse)').matches;
    this.started = false; this.finished = false;
    this.onDone = null;
    this.i = -1; this.t = 0; this.wait = 0; this.done = false;
    this.looked = false; this.startPos = null;
    this.time = 0;
    this.star = null; this.burst = null; this.popped = false;
    this.lastCheck = 0; this.lastPos = null;

    this.steps = [
      { id: 'move',
        html: this.coarse
          ? '<b>Tap</b> the circle to walk there'
          : '<b>Click</b> the circle to walk there <span>·</span> or use <b>W A S D</b>' },
      { id: 'look', html: '<b>Drag</b> to look around' },
      { id: 'star',  html: 'Collect <b>✦ stars</b> — the tracker up top keeps count' },
    ];

    const el = document.createElement('div');
    el.id = 'tutorial';
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<span class="tutStep"></span><span class="tutText"></span>' +
      '<button type="button" class="tutSkip">Skip</button>';
    document.body.appendChild(el);
    this.el = el;
    this.stepEl = el.querySelector('.tutStep');
    this.textEl = el.querySelector('.tutText');
    el.querySelector('.tutSkip').addEventListener('click', (e) => { e.stopPropagation(); this.skip(); });
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.glass = glassifyChip(el);
  }

  start({ onDone } = {}) {
    if (this.started) return;
    this.started = true;
    this.onDone = onDone ?? null;
    this.go(0);
  }

  go(i) {
    if (i >= this.steps.length) { this.finish(); return; }
    this.i = i; this.t = 0; this.wait = 0; this.done = false;
    const s = this.steps[i];
    this.stepEl.textContent = `${i + 1}/${this.steps.length}`;
    this.textEl.innerHTML = s.html;
    this.el.classList.remove('ok');
    if (s.id === 'move') this.startPos = this.walker.feet?.clone?.() ?? null;
    if (s.id === 'look') this.looked = false;
    if (s.id === 'star') this.spawnStar();
  }

  complete() {
    if (this.done) return;
    this.done = true;
    this.el.classList.add('ok');
    this.wait = this.o.doneHoldMs / 1000;
  }

  noteLook() { if (this.started && !this.finished && this.steps[this.i]?.id === 'look') this.looked = true; }

  // ---- the star ----------------------------------------------------------
  spawnStar() {
    // Session 83: the star appears in whatever direction the visitor is
    // FACING right now (along the path), a few strides off — not at a fixed
    // spot that might be behind them, where they'd never notice it.
    const f = this.walker.feet;
    const dir = this.camera.getWorldDirection(new this.THREE.Vector3());
    this.dirX = Math.abs(dir.x) < 0.25 ? 1 : Math.sign(dir.x);   // side-on: default east, toward the door
    const x = Math.min(this.o.pathMaxX, Math.max(this.o.pathMinX, f.x + this.dirX * this.o.starAhead));
    if (Math.abs(x - f.x) < 2) this.dirX = -this.dirX;       // pinned against the path's end: use the other side
    const x2 = Math.min(this.o.pathMaxX, Math.max(this.o.pathMinX, f.x + this.dirX * this.o.starAhead));
    this.starPos = [x2, f.y + this.o.starY, this.o.pathZ];
    const star = makeGlassStar(this.o.starSize, 0xffffff, { clear: true });
    star.position.set(...this.starPos);
    star.material.opacity = 0; star.visible = true;
    this.scene.add(star);
    this.star = star;
    this.starT = 0; this.walking = false; this.popped = false;
    this.lastPos = null; this.lastCheck = 0;
  }

  /** Where the view stops: a little short of the star, on the visitor's side. */
  standPoint(f) {
    const p = this.starPos;
    const side = f.x <= p[0] ? -1 : 1;
    return new this.THREE.Vector3(p[0] + side * this.o.standOff, f.y, p[2]);
  }

  horiz() {
    const f = this.walker.feet, p = this.starPos;
    return Math.hypot(f.x - p[0], f.z - p[2]);
  }

  pop() {
    if (this.popped) return;
    this.popped = true;
    this.burst = 0.0001;
    playSfx('star');
    this.el.classList.add('ok');
    setTimeout(() => this.finish(), this.o.afterPopSec * 1000);
  }

  updateStar(dt) {
    const s = this.star;
    if (!s) return;
    this.starT += dt;
    if (this.burst != null) {
      this.burst += dt;
      const t = Math.min(1, this.burst / 0.34), e = 1 - (1 - t) ** 3;
      s.scale.setScalar(1 + e * 1.6);
      s.material.opacity = Math.max(0, 1 - e);
      s.poseStar(this.camera, this.time, this.starPos[0]);
      if (t >= 1) { this.scene.remove(s); this.star = null; this.burst = null; }
      return;
    }
    s.material.opacity += (1 - s.material.opacity) * Math.min(1, dt * 4);
    s.position.y = this.starPos[1] + Math.sin(this.time * 1.6) * 0.05;
    s.poseStar(this.camera, this.time, this.starPos[0]);
    s.scale.setScalar(1 + Math.sin(this.time * 2.1) * 0.06);
    if (this.popped) return;

    // After a beat to see it, the view walks up to it — and keeps at it if
    // something interrupts the walk (a keypress, a click elsewhere).
    if (this.starT >= this.o.starDelaySec) {
      const d = this.horiz();
      if (d <= this.o.arriveDist) { this.pop(); return; }
      const f = this.walker.feet;
      if (!this.walking) {
        this.walking = true; this.lastCheck = this.starT; this.lastPos = f.clone();
        this.goTo(this.standPoint(f));
      } else if (this.starT - this.lastCheck > 1.5) {
        // Stalled (walker not going anywhere)? send it again.
        if (this.lastPos && f.distanceTo(this.lastPos) < 0.05) {
          this.goTo(this.standPoint(f));
        }
        this.lastCheck = this.starT; this.lastPos = f.clone();
      }
    }
  }

  skip() {
    if (this.finished) return;
    this.popped = true;
    if (this.star) { this.scene.remove(this.star); this.star = null; }
    this.finish();
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    this.el.classList.remove('show');
    setTimeout(() => this.el.remove(), 800);
    const cb = this.onDone; this.onDone = null;
    cb?.();
  }

  update(dt) {
    if (!this.started) return;
    this.time += dt;
    // the star's pop plays out even after the note has gone
    if (this.star) this.updateStar(dt);
    if (this.finished) return;
    if (this.isBusy()) { this.el.classList.remove('show'); return; }
    this.el.classList.add('show');
    if (this.done) {
      this.wait -= dt;
      if (this.wait <= 0) this.go(this.i + 1);
      return;
    }
    this.t += dt;
    const id = this.steps[this.i].id;
    if (id === 'move') {
      const p = this.walker.feet;
      if (p && this.startPos && p.distanceTo(this.startPos) >= this.o.walkDist) this.complete();
      else if (!this.startPos && p) this.startPos = p.clone();
    } else if (id === 'look') {
      if (this.looked) this.complete();
    }
    // 'star' step ends via pop() -> finish()
  }
}

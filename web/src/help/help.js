// ---------------------------------------------------------------------------
// Session 85 — the "?" button at the foot of the navbar.
//
// The walk-through note ("Drag to look around · click the star…") is gone; in
// its place a "?" opens a small glass card that says how to get around. It
// reads the device once per open: a touch screen gets the finger gestures, a
// mouse-and-keyboard machine gets drag / W A S D / click. Click "?" again,
// press Esc, or click anywhere else to close it.
// ---------------------------------------------------------------------------
import { glassifyChip } from '../glassify/glassify.js';

const DESKTOP = [
  ['Drag', 'look around'],
  ['W A S D', 'or the arrow keys, to walk'],
  ['Click the ground', 'to walk to the circle'],
  ['Click a glowing ✦ star', 'to open it'],
  ['Esc', 'to stand up or step back'],
];
const MOBILE = [
  ['Drag', 'with one finger to look around'],
  ['Tap the ground', 'to walk to that spot'],
  ['Tap a glowing ✦ star', 'to open it'],
  ['Back / ✕', 'to step out of a scene'],
];

export class Help {
  constructor({ button, isTouch } = {}) {
    this.button = button;
    this.isTouch = isTouch ?? (() => !!window.matchMedia?.('(pointer: coarse)')?.matches);
    const el = document.createElement('div');
    el.id = 'helpCard';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'How to move around');
    document.body.appendChild(el);
    this.el = el;
    this.open = false;
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    if (button) {
      button.addEventListener('click', (e) => { e.stopPropagation(); this.toggle(); });
      button.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
    window.addEventListener('keydown', (e) => { if (this.open && e.code === 'Escape') this.hide(); });
    // Any press outside the card or the button closes it (capture, so the
    // scene's own handlers still run as normal afterwards).
    window.addEventListener('pointerdown', (e) => {
      if (!this.open) return;
      if (this.el.contains(e.target) || this.button?.contains(e.target)) return;
      this.hide();
    }, true);
    this.glass = glassifyChip(el);
  }

  render() {
    const touch = this.isTouch();
    const rows = (touch ? MOBILE : DESKTOP)
      .map(([k, v]) => `<li><b>${k}</b><span>${v}</span></li>`).join('');
    this.el.innerHTML = `<h3>${touch ? 'On your phone' : 'On your computer'}</h3><ul>${rows}</ul>`;
  }

  show() { this.render(); this.open = true; this.el.classList.add('show'); this.button?.setAttribute('aria-expanded', 'true'); this.button?.classList.remove('nudge'); }
  hide() { this.open = false; this.el.classList.remove('show'); this.button?.setAttribute('aria-expanded', 'false'); }
  toggle() { this.open ? this.hide() : this.show(); }
}

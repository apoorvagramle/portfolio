// ---------------------------------------------------------------------------
//  One "subtle" tuning of liquid-glass.js, reused on every popup and panel in
//  the HUD — the hint, the thought bubble, the story popup, the music
//  toggle, the stand-up button, the stairs chooser and its destination
//  buttons, the door label, the "go up a floor" option, and (since all
//  popups were brought onto this one shared tuning) the star/contact
//  popovers, the toast, and the house-map dialog too. Only the navbar's own
//  three icon buttons and the ✨ gem keep their own tuning in navbar.js —
//  those are chrome, not popups — so every popup in the house reads as one
//  material at one strength.
//
//  "Subtle" on purpose: nothing in the HUD should out-shimmer the ✨ that is
//  actually the point of the house. Per the liquid-glass.js contract, calling
//  this sets `backdrop-filter` inline, so the element's own CSS must not also
//  set it — see the removed rules in index.html's stylesheet comment.
//
//  `blur` is what carries legibility, not opacity. The house is mostly
//  light-walled and the type is cream, so with the thin tints these panels
//  now use (see the GLASS DRESSING block in index.html), the interior blur
//  is the only thing keeping text off a busy backdrop. If content ever
//  smears, raise it here — never by making the background opaque again,
//  which is exactly what was hiding the refraction before.
//
//  Do NOT call these on an element that sits inside another glassed element:
//  an element with backdrop-filter is a backdrop root, so the child has only
//  its ancestor's box to sample and the effect is inert. Chips on a panel
//  get CSS dressing instead.
// ---------------------------------------------------------------------------
import { liquidGlass } from '../liquid-glass/liquid-glass.js';

// Small pill/button-shaped elements: hint, prompt, musicToggle, standup,
// doorTag, floorOpt, and each stairs-chooser destination button.
const CHIP = { scale: -30, chroma: 2, border: 0.2, mapBlur: 7, blur: 8, saturate: 1.4, fallbackBlur: 12 };

// Larger panels with real content inside: the story popup, the stairs
// chooser. Softer bulge, heavier interior blur than a chip — the same
// reasoning navbar.js gives for its dialog-sized glass (starPop/mapDialog):
// a chip-strength bulge across a wide panel drags the backdrop and puts a
// seam through the middle of whatever text is sitting on it.
const PANEL = { scale: -38, chroma: 3, border: 0.13, mapBlur: 11, blur: 12, saturate: 1.45, fallbackBlur: 15 };

/** Glass a small chip/pill element. No-op (and safe to call) if el is null. */
export function glassifyChip(el) {
  return el ? liquidGlass(el, CHIP) : null;
}

/** Glass a larger panel/dialog element. No-op (and safe to call) if el is null. */
export function glassifyPanel(el) {
  return el ? liquidGlass(el, PANEL) : null;
}

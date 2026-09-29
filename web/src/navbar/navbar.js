// ---------------------------------------------------------------------------
//  The navbar — three glass buttons in the top-right corner.
//
//    map      opens a cut-away picture of the whole house (Session 55 — one
//             dollhouse view, floors stacked, no floor tabs), with a small
//             ✦ per story star in each room and a ? coin wherever a secret
//             is hidden. Pick a room,
//             press the button, and you are taken there along the walkable
//             map — the same ride the stairs chooser uses, so the camera
//             follows real floors and treads rather than cutting through
//             walls. A destination behind a manual door opens that door on
//             the way, because you have already said where you want to be.
//    star     how much of the house you have found (see discoveries.js).
//             Clicking it lists what you've got; the ones you haven't are
//             left blank rather than spoiled.
//    contact  a small popover with the ways to get in touch.
//
//  The glass is real refraction, not a blur: `liquid-glass.js` builds a
//  displacement map per element and drives it through backdrop-filter, so
//  the house behind each button bends at the rim. Chromium only — Safari and
//  Firefox fall back to frosted automatically, which is why nothing here
//  depends on the refraction to be legible.
// ---------------------------------------------------------------------------
import { CONFIG } from '../config/config.js';
import { liquidGlass } from '../liquid-glass/liquid-glass.js';
import { glassifyChip, glassifyPanel } from '../glassify/glassify.js';
import { playSfx } from '../sfx/sfx.js';

const N = CONFIG.navbar;
const SVGNS = 'http://www.w3.org/2000/svg';

// Session 55: the map's two little markers, drawn to match the real things
// in the house — the story star is a four-point glass sparkle, the secret is
// a round gold coin with a ? on it (glass-star.js's makeQuestionCoin).
const STAR_SVG = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 .6 7.25 4.75 11.4 6 7.25 7.25 6 11.4 4.75 7.25.6 6 4.75 4.75Z"/></svg>';
const COIN_SVG = '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5.1"/><text x="6" y="8.55" text-anchor="middle">?</text></svg>';

/** #rrggbb -> "r,g,b", so tints can be written once and used at any alpha. */
function rgbOf(hex) {
  const h = hex.replace('#', '');
  const s = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(s, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

export class Navbar {
  /**
   * @param {Object}   opts
   * @param {Object}   opts.ui          elements, from main.js
   * @param {Object}   opts.discoveries the star's source of truth
   * @param {Function} opts.onGoToRoom  (roomDef) => void — does the travelling
   */
  constructor({ ui, discoveries, onGoToRoom, getMarks }) {
    this.ui = ui;
    this.discoveries = discoveries;
    this.onGoToRoom = onGoToRoom;
    // Session 55: () => { [roomId]: { stars: [found…], coins: [found…] } },
    // read fresh every time the map opens (main.js builds it from story.js).
    this.getMarks = getMarks;

    this.rooms = N.floors.flatMap((f) => f.rooms).filter((r) => r.sect);
    this.roomEls = new Map();
    this.selected = null;
    this.glass = [];
    this.toastTimer = 0;

    this.starWrap = ui.navbar.querySelector('.starWrap');
    this.gemEl = this.starWrap?.querySelector('.starGem') ?? null;

    this.paintTints();
    this.buildPlan();
    this.buildContact();
    this.paintStar();
    this.bind();
    this.applyGlass();
    this.placeStar();
    addEventListener('resize', () => this.placeStar());
    // Web fonts landing can change #starCount's height, and so the button's
    // — re-pin once they're in and whenever the button itself resizes, so
    // the ✨ never drifts off it (Session 25).
    document.fonts?.ready?.then(() => this.placeStar());
    if (window.ResizeObserver && this.ui.navStar) {
      new ResizeObserver(() => this.placeStar()).observe(this.ui.navStar);
    }
  }

  // -- setup ----------------------------------------------------------------

  /** Everything colour-ish is a CSS custom property, set once from config. */
  paintTints() {
    const root = document.documentElement.style;
    root.setProperty('--nav-map', rgbOf(N.tints.map));
    root.setProperty('--nav-star', rgbOf(N.tints.star));
    root.setProperty('--nav-contact', rgbOf(N.tints.contact));
    root.setProperty('--nav-accent', rgbOf(N.accent));
    root.setProperty('--nav-accent-hex', N.accent);
  }

  /**
   * Session 55: the whole house in one picture. Rooms are buttons laid out
   * by their `sect` rect; the roofs, ground line and floor names are an SVG
   * underneath them, drawn in the same % space (viewBox 0 0 100 100,
   * non-uniform, so it stretches with the panel exactly as the rooms do).
   */
  buildPlan() {
    const panel = this.ui.mapPanel;
    const P = N.plan ?? {};

    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'mapPlan');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    for (const roof of P.roofs ?? []) {
      const poly = document.createElementNS(SVGNS, 'polygon');
      poly.setAttribute('points', roof.map((p) => p.join(',')).join(' '));
      poly.setAttribute('class', 'mapRoof');
      svg.appendChild(poly);
    }
    if (P.ground != null) {
      const line = document.createElementNS(SVGNS, 'line');
      line.setAttribute('x1', '0'); line.setAttribute('x2', '100');
      line.setAttribute('y1', P.ground); line.setAttribute('y2', P.ground);
      line.setAttribute('class', 'mapGround');
      svg.appendChild(line);
    }
    panel.appendChild(svg);

    // Floor names float in the open sky above the garden, level with their row.
    for (const fl of P.floorLabels ?? []) {
      const t = document.createElement('div');
      t.className = 'mapFloorName';
      t.textContent = fl.text;
      t.style.left = `${P.floorLabelX ?? 3}%`;
      t.style.top = `${fl.y}%`;
      panel.appendChild(t);
    }

    for (const room of this.rooms) {
      const [l, t, w, h] = room.sect;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `mapRoom${room.id === 'garden' ? ' outdoor' : ''}${room.id === 'porch' ? ' porch' : ''}`;
      el.style.left = `${l}%`;
      el.style.top = `${t}%`;
      el.style.width = `${w}%`;
      el.style.height = `${h}%`;
      el.innerHTML = `<span class="name">${room.label}</span><span class="marks"></span>`;
      el.addEventListener('click', () => this.select(room));
      panel.appendChild(el);
      this.roomEls.set(room.id, el);
    }

    this.ui.mapKey.innerHTML =
      `<span class="mkStar">${STAR_SVG}</span>star` +
      `<span class="mkCoin">${COIN_SVG}</span>secret`;
    this.paintMarks();
    this.select(null);
  }

  /** One ✦ per star in the room (hollow once found), and one coin per
   *  secret (faded once found). Session 56: coins are counted too now. A room
   *  with `marksFrom` gathers the marks of the rooms listed there. */
  paintMarks() {
    const marks = this.getMarks?.() ?? {};
    for (const [id, el] of this.roomEls) {
      const room = this.rooms.find((r) => r.id === id);
      const m = { stars: [], coins: [] };
      for (const src of room?.marksFrom ?? [id]) {
        m.stars.push(...(marks[src]?.stars ?? []));
        m.coins.push(...(marks[src]?.coins ?? []));
      }
      const box = el.querySelector('.marks');
      let html = '';
      for (const found of m.stars) {
        html += `<span class="mkStar${found ? ' got' : ''}" title="${found ? 'Star found' : 'A star'}">${STAR_SVG}</span>`;
      }
      for (const found of m.coins) {
        html += `<span class="mkCoin${found ? ' got' : ''}" title="${found ? 'Secret found' : 'Something hidden here'}">${COIN_SVG}</span>`;
      }
      box.innerHTML = html;
      box.hidden = !html;
    }
  }

  buildContact() {
    const c = N.contact ?? {};
    const rows = [];
    if (c.email) rows.push(`<a href="mailto:${c.email}">${c.email}</a>`);
    const links = (c.links ?? []).map((l) => `<a href="${l.url}" target="_blank" rel="noopener">${l.label}</a>`);
    if (links.length) rows.push(links.join('<span class="dot">·</span>'));
    this.ui.contactBody.innerHTML = rows.map((r) => `<div class="row">${r}</div>`).join('');
  }

  bind() {
    const ui = this.ui;

    // One shared click cue for every real button belonging to the navbar —
    // the three main buttons plus the map dialog and the two popovers, which
    // are separate top-level overlays in the DOM (siblings of #navbar, not
    // children of it), hence checking all four roots rather than just
    // ui.navbar. Simpler than adding the same call at every listener below.
    document.body.addEventListener('click', (e) => {
      if (e.target.closest('#navbar button, #mapWrap button, #starPop button, #contactPop button')) {
        playSfx('click');
      }
    }, true);

    ui.navMap.addEventListener('click', () => this.setMap(true));
    ui.mapClose.addEventListener('click', () => this.setMap(false));
    ui.mapWrap.addEventListener('click', (e) => { if (e.target === ui.mapWrap) this.setMap(false); });
    ui.mapGo.addEventListener('click', () => {
      if (!this.selected) return;
      const room = this.selected;
      this.setMap(false);
      this.onGoToRoom?.(room);
    });

    ui.navStar.addEventListener('click', () => this.setPop('star', !this.starOpen));
    ui.navContact.addEventListener('click', () => this.setPop('contact', !this.contactOpen));
    ui.starClose.addEventListener('click', () => this.setPop('star', false));
    ui.contactClose.addEventListener('click', () => this.setPop('contact', false));

    // A click anywhere else in the world closes whatever popover is open.
    addEventListener('pointerdown', (e) => {
      if (this.starOpen && !ui.starPop.contains(e.target) && !ui.navStar.contains(e.target)) this.setPop('star', false);
      if (this.contactOpen && !ui.contactPop.contains(e.target) && !ui.navContact.contains(e.target)) this.setPop('contact', false);
    }, true);

    addEventListener('keydown', (e) => {
      if (e.code !== 'Escape') return;
      // Only swallow Esc while something of ours is showing — otherwise it
      // still belongs to the desk (stand up / close a window).
      if (this.mapOpen) { this.setMap(false); e.stopImmediatePropagation(); }
      else if (this.starOpen || this.contactOpen) {
        this.setPop('star', false); this.setPop('contact', false);
        e.stopImmediatePropagation();
      }
    }, true);
  }

  /** Glass on every surface. Small buttons get a gentler bulge than the
   *  dialog: a -112 displacement across 52px would swallow the icon. */
  applyGlass() {
    const btn = { scale: -46, chroma: 3, border: 0.18, mapBlur: 6, blur: 2, saturate: 1.6 };
    this.glass.push(liquidGlass(this.ui.navMap, btn));
    this.glass.push(liquidGlass(this.ui.navStar, btn));
    this.glass.push(liquidGlass(this.ui.navContact, btn));
    if (this.ui.musicToggle) this.glass.push(liquidGlass(this.ui.musicToggle, btn));

    // The ✨ is its own piece of glass: a 28px sheet clipped to the
    // three-sparkle silhouette (the clip-path lives in index.html), so the
    // house bends inside the star rather than inside a rounded square.
    //
    // It sits *beside* the buttons in the DOM, not inside #navStar, because
    // an element with backdrop-filter is a backdrop root — nested inside the
    // button, the gem had only the button's own box to sample and its
    // refraction was completely inert. See the stylesheet note.
    //
    // Two departures from the usual settings, both because the element is
    // small and star-shaped rather than a rounded rectangle:
    //   `border` is large, so the map's neutral interior shrinks to nothing
    //     and the bulge spans the whole sparkle. The library's default puts
    //     refraction in a rim band around a *rectangle*, and the clip-path
    //     throws that band away.
    //   `scale` is tiny for the same reason — with the displacement covering
    //     the whole shape, anything past about -12 stops reading as glass and
    //     starts reading as a solid smear of whatever colour was behind it.
    if (this.gemEl) {
      this.glass.push(liquidGlass(this.gemEl, {
        scale: -9, chroma: 2, border: 0.3, mapBlur: 9,
        blur: 0.4, saturate: 1.55, radius: 8, fallbackBlur: 5,
      }));
    }
  }

  /** Pin the floating ✨ over the star button. It can't be a child of the
   *  button (see applyGlass), so its position is copied from it — on build,
   *  and again whenever the layout can have moved. */
  placeStar() {
    const wrap = this.starWrap;
    const btn = this.ui.navStar;
    if (!wrap || !btn) return;
    const slot = btn.querySelector('.starSlot');
    const top = btn.offsetTop + (slot ? slot.offsetTop : 8);
    wrap.style.top = `${top}px`;
    wrap.style.left = `${btn.offsetLeft + (btn.offsetWidth - wrap.offsetWidth) / 2}px`;
    // These are popups like any other in the HUD, so they take the same
    // shared "subtle" glassify.js presets as the story popup and stairs
    // chooser, rather than their own stronger bespoke tuning — the whole
    // overlay should read as one material at one strength. Only the navbar's
    // own three buttons and the ✨ gem (applyGlass, above) keep a different
    // tuning, because those are chrome, not popups.
    this.glass.push(glassifyPanel(this.ui.contactPop));
    this.glass.push(glassifyPanel(this.ui.starPop));
    this.glass.push(glassifyChip(this.ui.toast));
    this.glass.push(glassifyPanel(this.ui.mapDialog));
  }

  // -- state ----------------------------------------------------------------

  select(room) {
    this.selected = room;
    for (const el of this.roomEls.values()) el.classList.remove('on');

    const ring = this.ui.mapRing;
    if (!room) {
      ring.style.display = 'none';
      this.ui.mapHint.textContent = 'Select a room to take you there';
      this.ui.mapGo.disabled = true;
      return;
    }

    this.roomEls.get(room.id)?.classList.add('on');

    const [l, t, w, h] = room.sect;
    ring.style.display = 'block';
    ring.style.left = `${l}%`;
    ring.style.top = `${t}%`;
    ring.style.width = `${w}%`;
    ring.style.height = `${h}%`;

    this.ui.mapHint.textContent = `Go to ${room.label.toLowerCase()}`;
    this.ui.mapGo.disabled = false;
  }

  setMap(on) {
    if (this.mapOpen === on) return;
    this.mapOpen = on;
    this.ui.mapWrap.classList.toggle('show', on);
    if (on) {
      this.setPop('star', false);
      this.setPop('contact', false);
      this.paintMarks();   // stars found since last time turn hollow
      this.select(null);
    }
  }

  setPop(which, on) {
    const el = which === 'star' ? this.ui.starPop : this.ui.contactPop;
    const key = which === 'star' ? 'starOpen' : 'contactOpen';
    if (this[key] === on) return;
    this[key] = on;
    if (on) {
      const other = which === 'star' ? 'contact' : 'star';
      this.setPop(other, false);
      if (which === 'star') this.paintStarList();
    }
    el.classList.toggle('show', on);
  }

  /** Get out of the way entirely — used while the visitor is at the desk. */
  setHidden(hidden) {
    this.ui.navbar.classList.toggle('away', hidden);
    if (hidden) { this.setMap(false); this.setPop('star', false); this.setPop('contact', false); }
  }

  // -- the star -------------------------------------------------------------

  paintStar() {
    this.ui.starCount.textContent = `${this.discoveries.count}/${this.discoveries.total}`;
  }

  paintStarList() {
    // Ones you haven't found get a blank rule rather than their name — the
    // point of the list is to show how much house is left, not to spoil it.
    const rows = this.discoveries.list().map((d, i) => (
      d.found
        ? `<li class="got"><i>${i + 1}</i><span>${d.label}</span></li>`
        : `<li><i>${i + 1}</i><span class="blank" title="Not found yet"></span></li>`
    ));
    this.ui.starList.innerHTML = rows.join('');
    this.ui.starExtra.textContent = this.discoveries.count === this.discoveries.total
      ? 'You found the important bits. …though I left a few things lying around.'
      : '';
  }

  /** Called by main.js whenever something new is found. A secret doesn't
   *  move the n/total count (it isn't one of the counted stars), so it gets
   *  its own line instead of repeating the star toast with an unchanged
   *  number — back-to-back finds (sitting down, then powering the desk on)
   *  would otherwise look like the same notification firing twice. */
  onCollect(def) {
    this.paintStar();
    if (this.starOpen) this.paintStarList();
    this.ui.toastText.textContent = def.secret
      ? 'Found something hidden'
      : `Another piece found · ${this.discoveries.count}/${this.discoveries.total}`;
    this.ui.toast.classList.add('show');
    this.toastTimer = 2.4;
  }

  update(dt) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.ui.toast.classList.remove('show');
    }
  }
}

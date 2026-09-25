// Small, optional moments around the house. These sit above the navigation
// system: visitors can wander straight through, or stop for a little story.
//
// Two kinds, set by `type` in CONFIG.story:
//
//   star       a full-size ✨, part of the counted progress route.
//   easterEgg  Session 13: also a ✨ now, just a smaller, dimmer one — still
//              reads as a lesser find than a star, but no longer invisible.
//              It does NOT touch the discovery counter (see reveal()) — the
//              "secret, not an objective" feel comes from that, and from the
//              toned-down mark, not from hiding it outright any more.
//
// Session 23 — how a star is FOUND changed (Apoorva's brief):
//
//   * Stars are small, clear glass; easter eggs are small gold coins with a
//     ? on them (glass-star.js's makeQuestionCoin). Each one is planted ON the
//     thing it is about — the TV star on the sofa, the map star on the map,
//     the coffee star over the coffee table — so the marker itself is what
//     draws you over.
//   * Tapping a marker no longer opens anything. The visitor WALKS there
//     first, turns to face the thing, and only then does the popup / action
//     start. Where a star belongs to a seat (`seat:` in its def — the TV →
//     the sofa, the garden → the hanging chair, the art journey → the
//     rocking chair, Mars → the bed) you are walked to that seat, sat down,
//     and it fires once you have landed.
//   * `from: ['sofa']` lets a star be opened straight from a seat without
//     getting up — the world map, seen from the sofa.
//   * Walking into a star's `at` spot on your own does the same thing as
//     tapping it: face it, then open. The marker's own position no longer
//     collects anything — it is often on a wall or a tabletop you can't
//     walk through.
//
// Three rules the markers follow, all added in Session 8:
//
//   * Session 16: the ✦ is now real refracting glass (see glass-star.js) —
//     an extruded four-point star with a transmissive MeshPhysicalMaterial,
//     so it bends the room behind it instead of painting a picture of glass
//     the way the old canvas billboard did. Tinted per item, sized down for
//     easter eggs (see `isEgg` below). The navbar's ✨ is a DOM element and
//     is deliberately left alone.
//   * They are depth-tested AND only live in the room they belong to, so they
//     no longer shine through walls, floors and closed doors from the other
//     side of the house. The room is worked out from the marker's own
//     position against CONFIG.rooms unless the item names one. Both kinds
//     are gated the same way, so the TV can't be found through the kitchen
//     wall.
//   * Session 17: a popup is MODAL and sits in the CENTRE of the screen. While
//     one is open the house is frozen — see `blocking` and `freeze()` below,
//     the #storyVeil element, and the `blocked()` gate on every input handler
//     in main.js. Beats can now be `{ text, said, note }` (see `beatOf`), and
//     a script can end in `choices` instead of a Next button, which is how the
//     intro asks "hire me / get to know me". `openScript()` opens one that has
//     no marker behind it at all: the intro, the house rules, the ending.
//   * Session 29 (19 Sep 2026) — Apoorva's script rewrite came with a UX
//     change too: a star's script is no longer this modal card. It plays
//     through `startHud()`/`updateHud()`/`paintHud()` instead — a small
//     top-left subtitle, typed out character by character, while the
//     visitor keeps walking, looking around, and watching whatever the star
//     just triggered (the TV turning on, the oven opening...). `this.hud` is
//     deliberately separate from `this.open`: `blocking` only ever looks at
//     `this.open`/the timeline, so nothing about the HUD freezes the walker
//     or blocks a click-to-move. Each beat auto-advances once it's been
//     fully typed and held long enough to read; clicking the HUD box either
//     finishes the current line instantly or, once it's finished, skips
//     straight to the next one. `openScript()` and the old modal panel are
//     kept for the few places a deliberate "stop and choose" screen still
//     makes sense: the intro, the house rules, and the ending.
//   * Session 11: these are coins, not buttons. Walking near a visible marker
//     collects it on the spot — no click, no ride first. A click still works
//     too (useInteractive's fallback in main.js), and collects instantly the
//     same way, since being able to click it means you're already close.
import * as THREE from 'three';
import { CONFIG } from '../config/config.js';
import { makeGlassStar, makeQuestionCoin } from '../glass-star/glass-star.js';
import { Timeline } from '../timeline/timeline.js';
import { Letter } from '../letter/letter.js';
import { Vlog } from '../vlog/vlog.js';
import { Sunset } from '../sunset/sunset.js';
import { playSfx, typeTick } from '../sfx/sfx.js';

/** Which room box a point falls in, or null for stairs/outside. */
function roomAt(p) {
  const x = p.x ?? p[0], y = p.y ?? p[1], z = p.z ?? p[2];
  for (const def of CONFIG.rooms ?? []) {
    const b = def.bounds;
    if (x > b.x[0] && x < b.x[1] &&
        y > b.y[0] && y < b.y[1] &&
        z > b.z[0] && z < b.z[1]) return def.id;
  }
  return null;
}

export class Story {
  /**
   * @param {Function} [onApproach] no longer used to reach a star (Session 11
   *   made collection proximity-based, see `update()`) — kept only because
   *   removing the parameter would shift every later constructor argument.
   *   Pass null.
   */
  constructor(scene, camera, discoveries, ui, onApproach, walker, onChoice = null) {
    this.scene = scene; this.camera = camera; this.discoveries = discoveries; this.ui = ui;
    this.onApproach = onApproach;
    this.walker = walker;
    this.onChoice = onChoice;   // (choice) => void, for the intro's buttons
    this.onClose = null;        // set by main.js
    this.onReveal = null;       // (id) => void, set by main.js — fires from reveal()
    this.items = []; this.open = null; this.beat = 0; this.time = 0;
    this.hud = null;       // Session 29 — the non-blocking top-left typewriter; see startHud()
    this.room = null;      // room the visitor is in, recomputed every frame
    this.pending = null;   // kept for API compat; nothing sets this any more
    // The art star's beat opens a full-screen paint-tube timeline instead of
    // the normal small text panel (see `reveal()` below) — its own module
    // because it's a different shape of thing (a mini-app, not a script),
    // per art-timeline-spec.md. One instance, reused every time it opens.
    this.timeline = new Timeline({ onRequestClose: () => this.close() });
    // Session 41 — the map star's envelope + letter. Unlike the timeline
    // this does NOT replace the HUD narration (reveal() still calls
    // startHud() for a `letter` item) — see letter.js's header comment.
    this.letter = new Letter({ onRequestClose: () => this.close() });
    // Session 57 — the studio table star's camera vlog. Like the letter, the
    // star's lines still type alongside it (reveal() calls startHud()), shown
    // as a caption under the video — see paintHud() and vlog.js.
    this.vlog = new Vlog({ onRequestClose: () => this.close(), onCaptionClick: () => this.hudSkip() });
    // Session 75 — the garden `sunsets` coin: drag the sun down, her photo
    // fades in, tap it for the rest. The coin's lines type once it has set.
    this.sunset = new Sunset({
      onRequestClose: () => this.close(),
      onSet: () => { const it = this.items.find((x) => x.def.sunset); if (it?.def.lines?.length) this.startHud(it.def); },
    });
    for (const def of CONFIG.story ?? []) {
      const isEgg = def.type === 'easterEgg';
      // Bigger than it looks like it needs to be. At 0.62 — the size the old
      // flat marker used — a star across the room is a smudge you walk past,
      // and these are the whole point of the house. Session 9's 0.95 was
      // still getting lost against light walls from a normal standing
      // distance, so it's up again to 1.3 — checked against the biggest
      // rooms in CONFIG.rooms and it doesn't crowd anything at that size.
      // Easter eggs default smaller and dimmer (see `maxOpacity` in
      // `update()`) — still findable, but reads as a lesser thing than a
      // full star even before you've collected it.
      // Session 23: small, and planted on the object. A clear glass star for
      // a star, a gold ? coin for a secret. `def.size` still overrides.
      const marker = isEgg
        ? makeQuestionCoin(def.size ?? CONFIG.storyMarkers?.eggSize ?? 0.28)
        : makeGlassStar(def.size ?? CONFIG.storyMarkers?.starSize ?? 0.4, CONFIG.storyMarkers?.starTint ?? 0xffffff, { clear: true });
      marker.position.set(...def.pos); marker.userData.storyTarget = def.id;
      // Start invisible either way: update() fades every item up once the
      // visitor is in its room.
      marker.material.opacity = 0; marker.visible = false;
      scene.add(marker);
      // The tap target stays generous even though the marker shrank — a
      // 0.4 star is a small thing to hit with a thumb.
      const hit = new THREE.Mesh(new THREE.SphereGeometry(def.hitRadius ?? CONFIG.storyMarkers?.hitRadius ?? 0.7, 16, 12), new THREE.MeshBasicMaterial({ visible: false, depthWrite: false }));
      hit.position.copy(marker.position); hit.userData.storyTarget = def.id; scene.add(hit);
      this.items.push({
        def, marker, hit, found: false,
        room: def.room ?? roomAt(def.pos),
        // The floor the marker belongs to: the stand point's height if it
        // has one, else the seat approach's, else the marker minus ~2.5.
        floorY: def.at?.stand?.[1]
          ?? (CONFIG.seats ?? []).find((s) => s.id === (def.seat ?? def.at?.seat))?.approach?.[1]
          ?? (def.pos[1] - 2.5),
        isEgg,
      });
    }
    ui.storyNext.addEventListener('click', () => this.next());
    ui.storyClose.addEventListener('click', () => this.close());
    // Session 29: clicking the HUD box finishes the line, or — once it's
    // already fully typed — skips straight to the next beat. This box is
    // small and top-left, so this never eats a click-to-move tap anywhere
    // else on the canvas.
    ui.storyHud?.addEventListener('click', () => this.hudSkip());
  }

  /**
   * Not yet found, and on the visitor's floor — the test for both eye and
   * pointer. Session 24: no longer "in its own room". Apoorva wants the
   * kitchen stars visible from the hall, and the markers are depth-tested,
   * so walls and closed doors still hide them — the old room gate was only
   * ever there for when they shone through walls. The floor band keeps a
   * bedroom star from being tapped through the studio ceiling.
   */
  here(item) {
    if (item.found) return false;
    const f = this.walker?.feet ?? this.camera.position;
    return Math.abs(f.y - item.floorY) < (CONFIG.storyMarkers?.floorBand ?? 5.5);
  }

  /**
   * Session 17: a popup is MODAL. While one is open the visitor cannot walk,
   * look, click the floor, use the navbar or press a key — main.js asks this
   * at the top of every input handler, and the full-screen veil under the
   * panel eats anything that gets past it. The only way on is the button.
   */
  get blocking() { return !!this.open || this.timeline.isOpen || this.letter.isOpen || this.vlog.isOpen || this.sunset.isOpen || !!this.framing || !!this.book?.isOpen; }

  /** So main.js's Escape handling can close the timeline too — see reveal(). */
  get timelineOpen() { return this.timeline.isOpen; }

  /** Same, for the map star's envelope — see reveal(). */
  get letterOpen() { return this.letter.isOpen; }

  /** Same, for the studio table's camera vlog (Session 57). */
  get vlogOpen() { return this.vlog.isOpen; }

  /** Same, for the garden sunsets (Session 75). */
  get sunsetOpen() { return this.sunset.isOpen; }

  /** Same, for the garden book (Session 63). `this.book` is set by main.js. */
  get bookOpen() { return !!this.book?.isOpen; }

  /** Stop dead the moment a popup opens, so nobody drifts behind the veil. */
  freeze() {
    const w = this.walker;
    if (!w) return;
    w.keys?.clear?.();
    w.stop?.();
  }

  /**
   * Open a script that has no marker behind it — the intro, the house rules,
   * the ending. Same panel, same blocking, just nothing to collect.
   */
  openScript(def) {
    if (!def || this.open) return false;
    this.open = { def }; this.beat = 0;
    this.freeze();
    this.paint();
    return true;
  }

  get targets() {
    // Session 23: still tappable mid-approach — tapping another star just
    // re-aims the walk at that one.
    if (this.blocking) return [];
    return this.items.filter((x) => this.here(x)).map((x) => x.hit);
  }

  /**
   * Which room the visitor is standing in, worked out fresh every frame.
   *
   * This used to be pushed in from main.js's `showRoomLabel`, which is driven
   * by Rooms' *change* event — and that is a trap: the walker spawns at
   * x -27, outside every room box, so `current` and `active` are both null,
   * no change is ever detected, the callback never fires, and every marker
   * stayed hidden for the whole visit. Asking the question directly each
   * frame cannot get stuck.
   */
  currentRoom() {
    return roomAt(this.walker?.feet ?? this.camera.position);
  }

  /** Kept so main.js's existing call is harmless; update() is the authority. */
  setRoom(id) { this.room = id; }

  /**
   * Tapped. Session 23: never opens on the spot. Walk to it, face it, THEN
   * open — or, for a seat star, walk to the seat and sit; `update()` fires it
   * once you have landed. Returns true if the tap was ours.
   */
  activate(id) {
    const item = this.items.find((x) => x.def.id === id);
    if (!item || !this.here(item)) return false;
    const def = item.def;
    const seatNow = this.seats?.active?.id ?? null;

    // Already where it wants you: sitting in its seat, or in a seat it can be
    // opened from. No walk, no getting up. `direct: true` (the world map)
    // never walks at all — tap it and it opens, wherever you are.
    if (def.direct || (seatNow && (def.seat === seatNow || (def.from ?? []).includes(seatNow)))) {
      this.pending = null;
      return this.reveal(id);
    }

    // Session 39: a `snap` star (the coffee table) skips the walk and the
    // turn entirely. The tap puts your feet at its `at.stand` spot and opens
    // it on the spot; whatever it triggers (coffee.js's lean) moves the view
    // straight to where the interaction happens, in one move.
    if (def.snap) {
      this.seats?.standUp();
      this.coffee?.standUp?.(); this.oven?.standUp?.();
      this.placeAt(item);
      return this.reveal(id);
    }

    // Anything else means getting up and going over.
    this.seats?.standUp();
    this.coffee?.standUp?.(); this.oven?.standUp?.();
    const stand = this.standFor(item);
    if (!stand) return this.reveal(id);
    this.pending = item;
    this.approach = { item, stand, phase: 'walk', t: 0, look: this.walker?.lookSeq ?? 0 };
    this.goTo?.(stand);
    return true;
  }

  /**
   * Session 39: would tapping this star open it without moving you? True for
   * `direct` stars and for stars that open from the seat you are in. main.js
   * uses it to ignore every other star while you are inside an interaction —
   * in there you stay put until Esc or the button takes you out.
   */
  opensInPlace(id) {
    const item = this.items.find((x) => x.def.id === id);
    if (!item) return false;
    const def = item.def;
    const seatNow = this.seats?.active?.id ?? null;
    return !!(def.direct || (seatNow && (def.seat === seatNow || (def.from ?? []).includes(seatNow))));
  }

  /** Session 39: put the visitor's feet on a star's `at.stand` spot at once —
   *  no walk — so stepping back out of its interaction lands you right there. */
  placeAt(item) {
    const w = this.walker;
    const s = item.def.at?.stand;
    if (!w || !s) return;
    w.stop?.();
    w.keys?.clear?.();
    w.feet.set(...s);
    const g = w.groundAt?.(w.feet, s[1]);
    if (g != null) w.feet.y = g;
    w.smoothY = w.feet.y;
  }

  /** Where to stand for an item: its own `at`, or its seat's `approach`. */
  standFor(item) {
    const def = item.def;
    const seatId = Story.seatOf(def);
    if (seatId) {
      const seat = (CONFIG.seats ?? []).find((s) => s.id === seatId);
      const a = seat?.approach;
      return a ? new THREE.Vector3(...a) : null;
    }
    return def.at?.stand ? new THREE.Vector3(...def.at.stand) : null;
  }

  /**
   * The seat a star is reached through: its own `seat` (it fires when you sit
   * there) or `at.seat` (tapping it sits you there first, then it opens —
   * the world map, via the sofa).
   */
  static seatOf(def) { return def.seat ?? def.at?.seat ?? null; }

  /** The seat the current approach is heading for, or null. */
  approachSeat() { return this.approach ? Story.seatOf(this.approach.item.def) : null; }

  /**
   * Session 48: the thing a star lives on, clicked again after the star
   * itself has been collected (the `Worldmap` mesh, for the map star — see
   * `revisit` in config.js and main.js's pickInteractive). Before the star
   * is found it just does what tapping the star does; after, it brings the
   * letter back up — no HUD lines, no counting, the star stays collected.
   */
  revisit(id) {
    const item = this.items.find((x) => x.def.id === id);
    if (!item) return false;
    if (!item.found) return this.activate(id);
    if (this.blocking) return false;
    if (item.def.letter) { this.freeze(); this.letter.open(); return true; }
    // Session 57: the Camera on the studio table — the vlog again, no lines.
    if (item.def.vlog) { this.freeze(); this.vlog.open(); return true; }
    if (item.def.timeline) { this.freeze(); this.timeline.open(item.def); return true; }
    // Session 63: the garden book, clicked again — only from the hanging
    // chair (it's picked up from there). Standing, the click seats you first.
    if (item.def.book) {
      if (this.seats?.active?.id !== item.def.seat) return this.seats?.request(item.def.seat, this.goTo) ?? false;
      return this.book?.requestOpen(item.def.book) ?? false;
    }
    return false;
  }

  /** The visitor steered off mid-approach. Put the star back. */
  cancel() { this.pending = null; this.approach = null; }

  /**
   * Collected — by walking near it (see `update()`) or by clicking it.
   * The marker doesn't just vanish: it pops, coin-style, over the next few
   * frames (`update()`'s burst branch), while the story opens right away.
   */
  reveal(id) {
    const item = this.items.find((x) => x.def.id === id);
    if (!item || item.found) return false;
    this.pending = null; this.approach = null;
    item.found = true; item.hit.visible = false;
    item.burst = 0.0001;   // >0 so update() treats it as "popping", not idle
    // A def can name its own clip (the mars egg has one); otherwise a full
    // star and an easter egg get their own generic finds — a bigger sound
    // for the bigger thing.
    playSfx(item.def.sfx ?? (item.isEgg ? 'pop' : 'star'));
    // Only deliberate star moments can register with the main progress UI.
    if (item.def.type === 'star' && item.def.discovery) this.discoveries?.collect(item.def.discovery);
    // Lets main.js hang scene-specific staging (the TV screen turning on,
    // and whatever comes next) off a particular beat's id, without story.js
    // needing to know what any of them look like.
    this.onReveal?.(item.def.id);
    // The art star takes over the whole screen with the paint timeline
    // instead of the usual small panel — `this.open` stays null on this
    // path (see `blocking`/`targets`/`close()`, which all check
    // `this.timeline.isOpen` too) since none of the normal-panel state
    // (beat, paintChoices, #story/#storyVeil) applies here. This is still a
    // deliberate full-screen takeover, so it still freezes the walker.
    if (item.def.timeline) { this.freeze(); this.timeline.open(item.def); return true; }
    // Session 41: the map star's envelope. This DOES freeze the walker
    // (the letter takes over the view, the same way the timeline does),
    // but — unlike the timeline — the beat text still plays through the
    // usual top-left typewriter, in parallel; see letter.js's header note.
    if (item.def.letter) { this.freeze(); this.letter.open(); this.startHud(item.def); return true; }
    // Session 57: the studio table's camera vlog — same shape as the letter.
    if (item.def.vlog) { this.freeze(); this.vlog.open({ caption: true }); this.startHud(item.def); return true; }
    // Session 75: the sunsets coin. No lines yet — they type once the sun
    // has been dragged down (sunset.js's onSet, wired in the constructor).
    // The view first glides to the one fixed sunset view (def.sunset.pov),
    // wherever it was when the coin was found — see updateFraming().
    if (item.def.sunset) { this.freeze(); this.frameThen(item.def.sunset, () => this.sunset.open()); return true; }
    // Session 63: the garden star. The lines type as usual (no freeze — you're
    // seated anyway) while the book is picked up off the table; advanceHud()
    // opens it once the last line is done.
    if (item.def.book) { this.startHud(item.def); this.book?.pickUp(); return true; }
    // Session 29: everything else is ambient — the top-left typewriter,
    // not the modal. No freeze; the visitor keeps walking.
    this.startHud(item.def);
    return true;
  }

  /**
   * A beat is a plain string, or `{ text, said, note }`:
   *   said  — a spoken line. Rendered in quotes under an "Apoorva" label.
   *   note  — the stage direction / the interaction that isn't built yet.
   *           Shown in a dashed box so it reads as a marker, not as copy.
   * `\n` inside `text` is a real line break (#storyText is white-space: pre-line).
   */
  static beatOf(raw) {
    if (raw == null) return { text: '' };
    return typeof raw === 'string' ? { text: raw } : raw;
  }

  paint() {
    const { def } = this.open;
    const ui = this.ui;
    const beat = Story.beatOf(def.lines[this.beat]);
    const last = this.beat === def.lines.length - 1;
    const choices = last ? (def.choices ?? null) : null;

    ui.storyKicker.textContent = def.kicker ?? 'A small thing';
    if (ui.storySaid) ui.storySaid.hidden = !beat.said;
    ui.storyText.textContent = beat.text ?? '';
    if (ui.storyNote) {
      ui.storyNote.textContent = beat.note ?? '';
      ui.storyNote.hidden = !beat.note;
    }
    if (ui.storyStep) {
      ui.storyStep.textContent = def.lines.length > 1 ? `${this.beat + 1} / ${def.lines.length}` : '';
    }
    this.paintChoices(choices);
    ui.storyNext.textContent = last ? (def.endLabel ?? 'Keep exploring') : 'Next';
    // A script that ENDS in choices can't be dismissed at all — not on the
    // choice screen and not on the beats leading up to it, or the visitor
    // could Esc past the intro and never be asked. `Next` still walks it;
    // only the last beat swaps that for the choices themselves.
    ui.storyNext.hidden = !!choices;
    ui.storyClose.hidden = !!def.choices;
    ui.storyVeil?.classList.add('show');
    ui.story.classList.add('show'); if (def.stars) this.setStars(true);
    // The walking hint and the thought bubble sit at almost exactly this
    // spot (bottom 34px / 86px against this panel's 82px). They used to be
    // hidden behind an opaque panel; now that it is real glass they show
    // straight through it as a dark smear with ghost text in it. Only one
    // of the three has anything to say at a time anyway.
    this.ui.hint?.classList.remove('show');
    this.ui.prompt?.classList.remove('show');
    if (this.beat === 0) this.playVoice(def.voice);
  }
  /** Build the intro-style choice buttons. Pass null to clear them. */
  paintChoices(choices) {
    const host = this.ui.storyChoices;
    if (!host) return;
    host.textContent = '';
    host.hidden = !choices?.length;
    if (!choices?.length) return;
    for (const c of choices) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'storyChoice';
      const label = document.createElement('b');
      label.textContent = c.label ?? '';
      const sub = document.createElement('i');
      sub.textContent = c.sub ?? '';
      b.append(label, sub);
      b.addEventListener('click', () => this.choose(c));
      host.appendChild(b);
    }
  }

  /**
   * A choice either hands straight on to another script in the same panel
   * (`then: 'houseRules'` -> CONFIG.houseRules) or closes and lets main.js act
   * on it (`go: 'bedroom'` -> ride there).
   */
  choose(c) {
    const next = c?.then ? CONFIG[c.then] : null;
    if (next) { this.open = { def: next }; this.beat = 0; this.paint(); }
    else this.close();
    this.onChoice?.(c);
  }

  next() { if (!this.open) return; if (this.beat < this.open.def.lines.length - 1) { this.beat++; this.paint(); } else this.close(); }

  close() {
    if (this.timeline.isOpen) { this.timeline.close(); this.onClose?.(); return; }
    if (this.letter.isOpen) { this.letter.close(); this.onClose?.(); return; }
    if (this.vlog.isOpen) { this.vlog.close(); this.onClose?.(); return; }
    if (this.framing) { this.framing = null; this.onClose?.(); return; }
    if (this.sunset.isOpen) { this.sunset.close(); this.hud = null; this.paintHud(); this.onClose?.(); return; }
    if (this.book?.isOpen) { this.book.close(); this.onClose?.(); return; }
    if (!this.open) return;
    this.setStars(false);
    this.open = null;
    this.paintChoices(null);
    this.ui.story.classList.remove('show');
    this.ui.storyVeil?.classList.remove('show');
    this.onClose?.();
  }

  showEnding() {
    if (this.endingShown || this.open) return;
    this.endingShown = true;
    this.openScript({
      kicker: 'So... yeah.',
      lines: ["That's probably the closest I can get to showing you what goes on in my head.", "I'm Apoorva.", 'Come back anytime.'],
      voice: { src: '', transcript: '', delay: 350, volume: 1 },
    });
  }
  playVoice(voice) {
    // Voice is authored content. Empty sources deliberately do nothing until
    // Apoorva's recording is supplied in the corresponding config entry.
    if (!voice?.src) return;
    this.voice?.pause();
    const audio = new Audio(voice.src);
    audio.volume = Math.max(0, Math.min(1, voice.volume ?? 1));
    this.voice = audio;
    window.setTimeout(() => { if (this.voice === audio) audio.play().catch(() => {}); }, voice.delay ?? 0);
  }

  // ---------------------------------------------------------------------
  //  Session 29 — the non-blocking top-left typewriter.
  //
  //  `this.hud` is `{ def, beat, chars, phase, hold }`:
  //    def    the script (same shape `lines`/`voice` as the modal used —
  //           any CONFIG.story entry, or CONFIG.coffeeDone).
  //    beat   index into def.lines.
  //    chars  how many characters of the current beat are shown so far
  //           (a float — see updateHud — floored when it's actually drawn).
  //    phase  'type' while still typing, 'hold' while resting on the fully
  //           typed line before auto-advancing.
  //    hold   seconds spent in 'hold' so far.
  //
  //  Deliberately NOT `this.open` — `blocking` never looks at `this.hud`,
  //  so none of main.js's input gates or the walker freeze apply. A star's
  //  `voice` (garden only, as of the Session 28 rewrite) still plays via
  //  the existing playVoice() on beat 0, same as before.
  // ---------------------------------------------------------------------

  startHud(def) {
    this.hud = { def, beat: 0, chars: 0, phase: 'type', hold: 0 };
    this.playVoice(def.voice);
    this.paintHud();
  }

  /** Characters per second the line types at, and how long a fully-typed
   *  line rests before auto-advancing — both tunable without touching code. */
  static hudTiming() {
    const h = CONFIG.storyHud ?? {};
    return { cps: h.charsPerSec ?? 46, minHold: h.minHold ?? 1.1, perWord: h.perWord ?? 0.30 };
  }

  updateHud(dt) {
    const h = this.hud;
    if (!h) return;
    const beat = Story.beatOf(h.def.lines[h.beat]);
    const full = [...(beat.text ?? '')];   // spread, not .length — keeps emoji/surrogate pairs intact
    const { cps, minHold, perWord } = Story.hudTiming();
    if (h.phase === 'type') {
      const before = Math.floor(h.chars);
      h.chars = Math.min(full.length, h.chars + cps * dt);
      const after = Math.floor(h.chars);
      if (after > before) typeTick(full[after - 1]);
      this.paintHud();
      if (h.chars >= full.length) { h.phase = 'hold'; h.hold = 0; }
      return;
    }
    h.hold += dt;
    const words = (beat.text ?? '').trim().split(/\s+/).filter(Boolean).length;
    const holdFor = Math.max(minHold, words * perWord);
    if (h.hold >= holdFor) this.advanceHud();
  }

  advanceHud() {
    const h = this.hud;
    if (!h) return;
    if (h.beat >= h.def.lines.length - 1) {
      this.hud = null;
      this.paintHud();
      // Session 63: the garden star's lines are done — open the book (if it's
      // still in hand; standing up mid-script already put it back).
      if (h.def.book && this.book?.holding) { this.freeze(); this.book.requestOpen(h.def.book); }
      // Same "a script just finished" signal the modal's close() used to
      // send — main.js hangs the coffee hint/lean-in and the walking hint
      // off this, regardless of which UI actually showed the text.
      this.onClose?.();
      return;
    }
    h.beat += 1; h.chars = 0; h.phase = 'type'; h.hold = 0;
    playSfx('typewriterScroll');   // the carriage roll between verses
    this.paintHud();
  }

  /** Click on the HUD box: finish the line if it's still typing, otherwise
   *  skip straight to the next beat instead of waiting out the hold. */
  hudSkip() {
    const h = this.hud;
    if (!h) return;
    const beat = Story.beatOf(h.def.lines[h.beat]);
    const full = [...(beat.text ?? '')];
    if (h.phase === 'type' && h.chars < full.length) {
      h.chars = full.length; h.phase = 'hold'; h.hold = 0;
      this.paintHud();
      return;
    }
    this.advanceHud();
  }

  paintHud() {
    const ui = this.ui;
    if (!ui.storyHud) return;
    const h = this.hud;
    if (!h) { ui.storyHud.classList.remove('show', 'typing'); this.vlog?.setCaption(null); return; }
    const beat = Story.beatOf(h.def.lines[h.beat]);
    const full = [...(beat.text ?? '')];
    const shown = full.slice(0, Math.floor(h.chars)).join('');
    if (ui.storyHudText) ui.storyHudText.textContent = shown;
    ui.storyHud.classList.add('show');
    ui.storyHud.classList.toggle('typing', h.phase === 'type' && h.chars < full.length);
    // Session 57: while the vlog is up, the same line shows under the video.
    if (this.vlog?.isOpen) this.vlog.setCaption(shown, h.phase === 'type' && h.chars < full.length);
  }
  setStars(on) {
    if (!this.starField && on) {
      const positions = [];
      for (let i = 0; i < 54; i++) { const a = i * 2.399963, r = .18 + Math.sqrt(i / 54) * 5.2; positions.push(-9 + Math.cos(a) * r, 23.7, -6 + Math.sin(a) * r); }
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      this.starField = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xfff1ba, size: .12, transparent: true, opacity: .95, depthWrite: false }));
      this.scene.add(this.starField);
    }
    if (this.starField) this.starField.visible = on;
  }

  /**
   * Session 23: walking into a star's `at` spot on your own is as good as
   * tapping it. Seat stars skip this — the seat itself is their trigger.
   * Still gated on the marker having actually been on screen for a moment
   * (`seenT`, Session 12's fix) and never mid-ride or while seated.
   */
  walkedInto(item, visitor, dt) {
    const def = item.def;
    if (def.seat || !def.at?.stand || this.approach || this.blocking) return false;
    if (this.walker?.riding || this.walker?.seated) return false;
    if (item.seenT < 0.4) return false;
    const [sx, sy, sz] = def.at.stand;
    const r = def.at.r ?? 1.0;
    if (Math.abs(visitor.y - sy) > 2.5) return false;
    if (Math.hypot(visitor.x - sx, visitor.z - sz) > r) return false;
    // Session 53: just walking past it on the way to somewhere you clicked.
    if (this.walker?.passingThrough?.(sx, sz, r)) return false;
    // Session 39: a snap star doesn't do the slow turn-to-face first.
    if (def.snap) { this.walker?.stop?.(); return this.reveal(def.id); }
    this.pending = item;
    this.approach = { item, stand: new THREE.Vector3(sx, sy, sz), phase: 'face', t: 0, look: this.walker?.lookSeq ?? 0 };
    this.walker?.stop?.();
    return true;
  }

  /**
   * The walk → face → open chain, and the seat trigger.
   *
   *   walk  until the walker has run out of route. Close enough → face.
   *         Gave up far away (blocked) → drop it; the star stays.
   *   face  ease the view onto `at.yaw`/`at.pitch` (~0.6 s), then reveal.
   *         A drag during the turn hands the view back and opens straight away.
   *
   * Seat stars: whatever seat you are in, once the sit-down has landed and
   * held for a beat, any unfound star bound to that seat opens.
   */
  /**
   * Which way to face on arrival: `at.yaw`/`at.pitch` if the config gives
   * them, otherwise straight at the marker from standing eye height.
   * (yaw: +PI/2 looks west, 0 south, PI north, -PI/2 east.)
   */
  aimFor(item) {
    const at = item.def.at ?? {};
    const f = this.walker?.feet;
    let { yaw, pitch } = at;
    if ((yaw == null || pitch == null) && f) {
      const [px, py, pz] = item.def.pos;
      const dx = px - f.x, dz = pz - f.z;
      const eye = f.y + (CONFIG.player?.eyeHeight ?? 3.4);
      if (yaw == null) yaw = Math.atan2(-dx, -dz);
      if (pitch == null) pitch = Math.max(-0.9, Math.min(0.9, Math.atan2(py - eye, Math.hypot(dx, dz))));
    }
    return { yaw, pitch };
  }

  updateApproach(dt) {
    if (this.blocking) return;
    const w = this.walker;
    const seatNow = this.seats?.active?.id ?? null;
    if (seatNow && w?.seatedStill) {
      this.seatHeld = (this.seatHeld ?? 0) + dt;
      if (this.seatHeld > (CONFIG.storyMarkers?.seatDelay ?? 0.45)) {
        // The star you tapped your way here for goes first (the map, when
        // you were walked to the sofa for it); otherwise whatever star
        // belongs to this seat (the TV).
        const want = this.approach?.item;
        const item = (want && !want.found && Story.seatOf(want.def) === seatNow)
          ? want
          : this.items.find((x) => !x.found && x.def.seat === seatNow);
        if (item) { this.reveal(item.def.id); return; }
      }
    } else this.seatHeld = 0;

    const a = this.approach;
    if (!a || !w) return;
    if (a.item.found) { this.approach = null; return; }
    if (a.phase === 'walk') {
      const seatId = Story.seatOf(a.item.def);
      if (seatId) {
        // Sat down on the way (the seat's own `near` box caught you) — the
        // seat branch above takes it from here.
        if (seatNow === seatId) return;
        if (w.target || w.path?.length || w.riding) return;
        // Arrived but the seat didn't take you (you had only just stood up
        // from it, so it was disarmed). Sit down deliberately.
        const seat = (CONFIG.seats ?? []).find((s) => s.id === seatId);
        const f = w.feet;
        if (seat && !this.seats?.active && Math.hypot(f.x - a.stand.x, f.z - a.stand.z) < 2.2) this.seats?.sitOn(seat);
        else if (!this.seats?.active) this.cancel();
        return;
      }
      if (w.target || w.path?.length || w.riding) return;
      const f = w.feet;
      if (Math.hypot(f.x - a.stand.x, f.z - a.stand.z) > 2.2) { this.cancel(); return; }
      a.phase = 'face'; a.t = 0; a.look = w.lookSeq ?? 0;
      a.yaw0 = w.yaw; a.pitch0 = w.pitch;
    }
    if (a.phase === 'face') {
      const at = this.aimFor(a.item);
      if (a.yaw0 == null) { a.yaw0 = w.yaw; a.pitch0 = w.pitch; }
      const dragged = (w.lookSeq ?? 0) !== a.look;
      a.t += dt / (CONFIG.storyMarkers?.faceTime ?? 0.6);
      const t = Math.min(1, a.t);
      const e = t * t * (3 - 2 * t);
      if (!dragged && at.yaw != null) {
        let d = (at.yaw - a.yaw0) % (Math.PI * 2);
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        w.yaw = a.yaw0 + d * e;
        if (at.pitch != null) w.pitch = a.pitch0 + (at.pitch - a.pitch0) * e;
      }
      if (t >= 1 || dragged) this.reveal(a.item.def.id);
    }
  }

  /**
   * Session 75: glide the walker to a fixed viewpoint, then run `done`.
   * `cfg.pov` = { pos: [x, y, z], yaw, pitch } (radians), `cfg.glide` secs.
   * Counts as `blocking` while it runs, so nothing can steer mid-glide.
   */
  frameThen(cfg, done) {
    const w = this.walker;
    const pov = cfg?.pov;
    if (!w || !pov) { done(); return; }
    let dy = (pov.yaw - w.yaw) % (Math.PI * 2);
    if (dy > Math.PI) dy -= Math.PI * 2;
    if (dy < -Math.PI) dy += Math.PI * 2;
    this.framing = {
      t: 0, dur: Math.max(0.2, cfg.glide ?? 1.1), done,
      x0: w.feet.x, z0: w.feet.z, x1: pov.pos[0], z1: pov.pos[2],
      yaw0: w.yaw, yaw1: w.yaw + dy, pitch0: w.pitch, pitch1: pov.pitch ?? 0,
    };
  }

  updateFraming(dt) {
    const f = this.framing, w = this.walker;
    if (!f || !w) return;
    f.t = Math.min(1, f.t + dt / f.dur);
    const e = f.t * f.t * (3 - 2 * f.t);
    w.feet.x = f.x0 + (f.x1 - f.x0) * e;
    w.feet.z = f.z0 + (f.z1 - f.z0) * e;
    w.yaw = f.yaw0 + (f.yaw1 - f.yaw0) * e;
    w.pitch = f.pitch0 + (f.pitch1 - f.pitch0) * e;
    if (f.t >= 1) { this.framing = null; f.done(); }
  }

  update(dt) {
    this.time += dt;
    this.updateFraming(dt);
    this.room = this.currentRoom();
    const visitor = this.walker?.feet ?? this.camera.position;
    for (const item of this.items) {
      // Just collected — pop it out over ~0.3s instead of snapping it away.
      // A coin that just disappears reads as a bug; one that flares and
      // shrinks reads as collected. `visible` is forced true every frame of
      // the burst (not just set once) — Session 12: in a small room the
      // fade-in and the proximity trigger could land in the same frame or
      // two, so the marker was sometimes still at near-zero opacity, right on
      // the edge of the visible/not-visible threshold, when reveal() fired.
      // Forcing it here means the flash is guaranteed to render regardless of
      // what the fade-in had or hadn't reached.
      if (item.burst != null) {
        item.burst += dt;
        const t = Math.min(1, item.burst / 0.34);
        const ease = 1 - (1 - t) * (1 - t) * (1 - t); // easeOutCubic
        item.marker.visible = true;
        item.marker.scale.setScalar(1 + ease * 1.6);
        item.marker.material.opacity = Math.max(0, 1 - ease);
        // After the opacity, not before — poseStar reads it to keep the halo
        // in step with the body as the burst fades out.
        item.marker.poseStar(this.camera, this.time, item.def.pos[0]);
        if (t >= 1) { item.marker.visible = false; item.burst = null; }
        continue;
      }

      if (item.found) continue;
      const inRoom = this.here(item);
      item.hit.visible = inRoom;

      // Fade rather than snap, so stepping through a doorway doesn't pop a
      // star into existence in the corner of your eye. Easter eggs fade to a
      // lower ceiling (0.55) than stars (1) — Session 13: still visible and
      // findable, just quieter, so a full star still reads as the bigger
      // moment even standing right next to a secret.
      const m = item.marker.material;
      const maxOpacity = 1;   // Session 23: the coin is its own 'lesser' look
      m.opacity += ((inRoom ? maxOpacity : 0) - m.opacity) * Math.min(1, dt * 6);
      item.marker.visible = m.opacity > 0.02;

      // How long it's actually been rendered on screen, not just "technically
      // in the room" — this is the real fix for Session 12's report. A small
      // room (the porch is ~5.5 units across) can put the visitor within
      // collecting distance of the marker on the very first frame it's in
      // the room, before the opacity fade has produced anything a person
      // could actually see. Gating collection on a minimum dwell time, not
      // just distance, guarantees there's a real window to see the star
      // before it can be picked up — the same way a coin in a platformer is
      // always drawn for at least a frame or two before you can touch it.
      item.seenT = item.marker.visible ? (item.seenT ?? 0) + dt : 0;

      if (!item.marker.visible) continue;

      item.marker.position.y = item.def.pos[1] + Math.sin(this.time * 1.6 + item.def.pos[2]) * .05;
      // Face the camera, sway, lean and drift — all of it inside poseStar now
      // (glass-star.js), because a solid star has to keep its own highlights
      // travelling and must never turn far enough to go edge-on. It is still
      // a lean rather than a full spin: this is jewellery, not a coin on a
      // spindle.
      item.marker.poseStar(this.camera, this.time, item.def.pos[0]);
      item.marker.scale.setScalar(1 + Math.sin(this.time * 2.1 + item.def.pos[2]) * .06);
      item.hit.position.copy(item.marker.position);

      item.walkIn = this.walkedInto(item, visitor, dt);
    }
    this.updateApproach(dt);
    this.updateHud(dt);
    if (this.starField?.visible) this.starField.material.opacity = .72 + Math.sin(this.time * 2) * .2;
  }
}

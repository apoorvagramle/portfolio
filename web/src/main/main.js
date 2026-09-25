import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';

import { CONFIG } from '../config/config.js';
import { createWorld } from '../scene/scene.js';
import { buildCollider } from '../collider/collider.js';
import { Walker } from '../player/player.js';
import { Doors } from '../doors/doors.js';
import { splitGardenGate } from '../garden-gate/garden-gate.js';
import { Rooms } from '../rooms/rooms.js';
import { Nav } from '../nav/nav.js';
import { Desk } from '../desk/desk.js';
import { TVScreen } from '../tv/tv.js';
import { HallClock } from '../clock/clock.js';
import { Mars } from '../mars/mars.js';
import { Coffee } from '../coffee/coffee.js';
import { Oven } from '../oven/oven.js';
import { Fridge } from '../fridge/fridge.js';
import { Seats } from '../seats/seats.js';
import { Guide } from '../guide/guide.js';
import { Discoveries } from '../discoveries/discoveries.js';
import { Navbar } from '../navbar/navbar.js';
import { Story } from '../story/story.js';
import { startIntro, INTRO_CHOICES } from '../intro/intro.js';
import { findByName } from '../util/util.js';
import { glassifyChip, glassifyPanel } from '../glassify/glassify.js';
import { makeGlassStar, makeQuestionCoin, initGlassStars } from '../glass-star/glass-star.js';
import { startLoop, stopLoop, playSfx } from '../sfx/sfx.js';
import { Footsteps } from '../footsteps/footsteps.js';
import { ItemLabels } from '../item-labels/item-labels.js';
import { Signs } from '../signs/signs.js';
import { StarLights } from '../star-lights/star-lights.js';
import { MusicDecor } from '../music-decor/music-decor.js';
import { IpadScreen } from '../ipad/ipad.js';
import { GardenBook } from '../book/book.js';
import { Butterfly } from '../butterfly/butterfly.js';
import { Finale } from '../finale/finale.js';
import { Tutorial } from '../tutorial/tutorial.js';

// Let the ordinary Raycaster use the BVH (used for click-to-move picking).
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const ui = {
  loader:   document.getElementById('loader'),
  bar:      document.getElementById('bar'),
  status:   document.getElementById('status'),
  hint:     document.getElementById('hint'),
  room:     document.getElementById('room'),
  debug:    document.getElementById('debug'),
  prompt:   document.getElementById('prompt'),
  standup:  document.getElementById('standup'),
  choose:     document.getElementById('choose'),
  chooseList: document.getElementById('chooseList'),
  doorTag:    document.getElementById('doorTag'),
  story:      document.getElementById('story'),
  storyVeil:  document.getElementById('storyVeil'),
  storyHud:     document.getElementById('storyHud'),
  storyHudText: document.getElementById('storyHudText'),
  storyKicker: document.getElementById('storyKicker'),
  storySaid:  document.getElementById('storySaid'),
  storyText:  document.getElementById('storyText'),
  storyNote:  document.getElementById('storyNote'),
  storyChoices: document.getElementById('storyChoices'),
  storyStep:  document.getElementById('storyStep'),
  storyNext:  document.getElementById('storyNext'),
  storyClose: document.getElementById('storyClose'),
  musicToggle: document.getElementById('musicToggle'),

  // navbar
  navbar:       document.getElementById('navbar'),
  navMap:       document.getElementById('navMap'),
  navStar:      document.getElementById('navStar'),
  navContact:   document.getElementById('navContact'),
  starCount:    document.getElementById('starCount'),
  starPop:      document.getElementById('starPop'),
  starList:     document.getElementById('starList'),
  starExtra:    document.getElementById('starExtra'),
  starClose:    document.getElementById('starClose'),
  contactPop:   document.getElementById('contactPop'),
  contactBody:  document.getElementById('contactBody'),
  contactClose: document.getElementById('contactClose'),
  toast:        document.getElementById('toast'),
  toastText:    document.getElementById('toastText'),
  mapWrap:      document.getElementById('mapWrap'),
  mapDialog:    document.getElementById('mapDialog'),
  mapClose:     document.getElementById('mapClose'),
  mapKey:       document.getElementById('mapKey'),   // Session 55: star / secret legend
  mapPanel:     document.getElementById('mapPanel'),
  mapRing:      document.getElementById('mapRing'),
  mapHint:      document.getElementById('mapHint'),
  mapGo:        document.getElementById('mapGo'),
};

// The rest of the HUD gets the same real liquid-glass refraction the navbar
// uses, just tuned subtler (see glassify.js) — so the whole overlay reads as
// one material instead of "navbar has real glass, everything else is CSS
// blur." Static elements are glassed once, here, before anything shows.
glassifyChip(ui.hint);
glassifyChip(ui.prompt);
glassifyChip(ui.storyHud);
glassifyPanel(ui.story);
// musicToggle is a navbar button now — Navbar.applyGlass() glasses it.
glassifyChip(ui.standup);

const canvas = document.getElementById('view');
const { renderer, scene, camera, hemi, ambient, updateIndoor, applyLens } = createWorld(canvas);

// The glass stars need a renderer to prefilter their environment — it is the
// only light they have, since the house itself is lit flat with no shadows.
// Safe to call before any star exists; anything built later picks it up.
initGlassStars(renderer);

let fridge, walker, doors, rooms, nav, desk, tv, hallClock, mars, coffee, oven, seats, guide, story, colliderMesh, discoveries, navbar, footsteps, itemLabels, signs, starLights, musicDecor, ipad, gardenBook, butterfly, finale, tutorial;
let marker, ready = false;
let intro = null;   // Session 26: the porch intro (src/intro.js)

// Background music is started by a real visitor gesture, rather than on
// page load, because browsers block autoplay with sound. It lives outside the
// walkthrough's ready state so an early click still unlocks it.
//
// `preload` is deliberately 'none': with 'auto' the browser starts fetching
// this file the moment the page loads, competing for bandwidth/disk I/O with
// MeraGHAR.glb during the exact window that matters most. play() itself
// loads on demand, and it is never called before the visitor's first
// gesture anyway.
const backgroundMusic = new Audio(new URL(CONFIG.backgroundMusic?.src ?? '', document.baseURI).href);
backgroundMusic.loop = true;
backgroundMusic.preload = 'none';
backgroundMusic.volume = CONFIG.backgroundMusic?.volume ?? 0.24;
let backgroundMusicStarted = false;

function startBackgroundMusic() {
  if (!CONFIG.backgroundMusic?.src) return;
  backgroundMusic.play().then(() => {
    backgroundMusicStarted = true;
    paintMusicToggle();
  }).catch((error) => {
    backgroundMusicStarted = false;
    paintMusicToggle();
    console.warn('[MeraGHAR] background music could not start', error);
  });
}

function paintMusicToggle() {
  if (!ui.musicToggle) return;
  // Icon button in the navbar (Session 25): the two SVGs inside swap on .on.
  const on = !backgroundMusic.paused;
  ui.musicToggle.classList.toggle('on', on);
  ui.musicToggle.setAttribute('aria-pressed', String(on));
  ui.musicToggle.setAttribute('aria-label', on ? 'Turn music off' : 'Turn music on');
  ui.musicToggle.title = on ? 'Music: on' : 'Music: off';
}

addEventListener('pointerdown', startBackgroundMusic, { once: true, capture: true });
addEventListener('keydown', startBackgroundMusic, { once: true, capture: true });
ui.musicToggle.addEventListener('click', () => {
  // Turning the house music back on mid-song ends the song first.
  if (backgroundMusic.paused && !instrumentSong.paused) stopInstrumentSong(false);
  if (backgroundMusic.paused) startBackgroundMusic();
  else { backgroundMusic.pause(); paintMusicToggle(); }
});
backgroundMusic.addEventListener('play', paintMusicToggle);
backgroundMusic.addEventListener('pause', paintMusicToggle);
backgroundMusic.addEventListener('error', () => console.warn('[MeraGHAR] background music failed to load', backgroundMusic.error));

// Session 70: "Tum hi ho" (CONFIG.musicDecor.song) — clicking any instrument
// on the music wall plays it. The house music goes quiet for the song and
// comes back after (only if it was on to begin with), and the neon note wall
// runs its chain on a loop for exactly as long as the song plays. Clicking an
// instrument again while it plays stops it.
const instrumentSong = new Audio(new URL(CONFIG.musicDecor?.song?.src ?? '', document.baseURI).href);
instrumentSong.preload = 'none';
instrumentSong.volume = CONFIG.musicDecor?.song?.volume ?? 0.9;
let songResumesBg = false;

function playInstrumentSong() {
  if (!CONFIG.musicDecor?.song?.src) return musicDecor.trigger();
  if (!instrumentSong.paused) { stopInstrumentSong(); return true; }
  songResumesBg = !backgroundMusic.paused;
  backgroundMusic.pause();
  instrumentSong.currentTime = 0;
  musicDecor.play();
  instrumentSong.play().catch((error) => {
    console.warn('[MeraGHAR] instrument song could not start', error);
    stopInstrumentSong();
  });
  return true;
}

/** End the song (or react to it having ended): lights fade out, and the
 *  house music comes back if the song was what silenced it. */
function stopInstrumentSong(resumeBg = true) {
  if (!instrumentSong.paused) instrumentSong.pause();
  musicDecor?.stop();
  if (resumeBg && songResumesBg) startBackgroundMusic();
  songResumesBg = false;
}
instrumentSong.addEventListener('ended', () => stopInstrumentSong());
instrumentSong.addEventListener('error', () => {
  console.warn('[MeraGHAR] instrument song failed to load', instrumentSong.error);
  stopInstrumentSong();
});

// ---------------------------------------------------------------------------
//  Load
// ---------------------------------------------------------------------------
const loader = new GLTFLoader();
loader.load(
  CONFIG.MODEL_URL,
  (gltf) => { setup(gltf.scene, gltf.animations); },
  (e) => {
    if (e.lengthComputable && e.total) {
      const pct = Math.round((e.loaded / e.total) * 100);
      ui.bar.style.width = pct + '%';
      ui.status.textContent = `loading the house — ${pct}%`;
    } else {
      ui.status.textContent = `loading the house — ${(e.loaded / 1048576).toFixed(1)} MB`;
    }
  },
  (err) => {
    console.error(err);
    ui.status.innerHTML =
      `couldn't load <code>${CONFIG.MODEL_URL}</code>.<br>` +
      `Make sure you opened this through a local server (see README), not as a file:// path.`;
  }
);

const TEX_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'];

// Yields one frame so a DOM change made just before it (a status line, a
// progress bar) actually reaches the screen before the next chunk of
// synchronous work starts. setup() used to run start-to-finish as one
// unbroken function call — the loader's percentage would hit 100% and then
// the tab would go unresponsive for however long the collision mesh, BVH and
// walkable-map build took (well over a second on the full house), with the
// loading screen frozen the whole time because nothing ever got a chance to
// paint. Breaking setup() at its heaviest steps with `await nextFrame()`
// doesn't make any of that work faster, but it turns "the page is stuck" into
// a status line that visibly keeps changing.
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

async function setup(root, animations = []) {
  ui.status.textContent = 'working out where the walls are…';
  await nextFrame();

  // Before anything else looks at the model: split the two gate leaves out of
  // the welded `Arch` mesh, so they exist as real objects by the time the
  // traverse below hands out shadows, the collider skips them by name, and
  // Doors goes looking for them (see garden-gate.js and CONFIG.gardenGate).
  splitGardenGate(root);

  // Session 72: the garden butterfly lives in its own GLB (butterfly.js).
  // If the house is ever re-exported with the Blender rig still in it, drop
  // that copy here — it is ~200 units across at FBX scale and would end up
  // in the collider and the walkable map.
  for (const name of CONFIG.butterfly?.stripFromHouse ?? []) {
    const o = findByName(root, name);
    if (o) { o.removeFromParent(); console.log(`[butterfly] removed "${name}" from the house model`); }
  }

  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const seenTextures = new Set();

  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = CONFIG.world.shadows;
    o.receiveShadow = CONFIG.world.shadows;
    // Do NOT force FrontSide here. Roof slopes, siding and other single-sided
    // surfaces would vanish when seen from behind — which is what made the
    // roof disappear and show sky from underneath.
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (CONFIG.world.forceDoubleSided) m.side = THREE.DoubleSide;
      // Up close (the garden especially) low-res textures with no mipmaps or
      // anisotropic filtering read as hard, chunky pixel blocks. Smooth them.
      for (const key of TEX_KEYS) {
        const tex = m[key];
        if (!tex || seenTextures.has(tex)) continue;
        seenTextures.add(tex);
        tex.anisotropy = maxAniso;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = true;
        tex.needsUpdate = true;
      }
    }
  });
  for (const name of CONFIG.hide ?? []) {
    const o = findByName(root, name);
    if (o) o.visible = false;
  }
  thinNeon(root);
  insetGables(root);

  // `Door` (the front-door leaf that actually sits in the wall opening —
  // see CONFIG.doors and Session 6b in the project doc) came out of Blender
  // with a placeholder white material (`palette.080`) instead of a real
  // door skin. `ExteriorDoor_Hall` — the leaf `Door` replaced, still in the
  // scene but hidden — has the correct dark wood material (`Ref_Door`), so
  // borrow it until this can be fixed properly in Blender.
  const frontDoor = findByName(root, 'Door');
  const frontDoorRef = findByName(root, 'ExteriorDoor_Hall');
  if (frontDoor && frontDoorRef?.material) {
    frontDoor.material = Array.isArray(frontDoorRef.material)
      ? frontDoorRef.material.map((m) => m.clone())
      : frontDoorRef.material.clone();
  }

  for (const [name, hex] of Object.entries(CONFIG.recolor ?? {})) {
    const o = findByName(root, name);
    if (!o?.material) continue;
    const tint = (mat) => {
      const m = mat.clone();
      m.map = null;               // palette texture holds the old colour
      m.color = new THREE.Color(hex);
      m.needsUpdate = true;
      return m;
    };
    o.material = Array.isArray(o.material) ? o.material.map(tint) : tint(o.material);
  }

  scene.add(root);

  ui.status.textContent = 'building the walls…';
  await nextFrame();

  // Merges every static mesh into one world-space geometry and builds a BVH
  // over it (~199k triangles) — the single most expensive synchronous step
  // in this function, and the one most worth a status line of its own.
  const built = buildCollider(root);
  colliderMesh = built.mesh;
  scene.add(colliderMesh);

  walker = new Walker(built.bvh, camera, built.stairsBVH);

  // The star in the navbar counts these. Everything that can be found calls
  // discoveries.collect(id) — see config.js for the list.
  discoveries = new Discoveries((def) => {
    navbar?.onCollect(def);
    // Session 74: the last counted star arms the sign-off card (finale.js).
    if (discoveries.count === discoveries.total) finale?.arm(def.id);
  });

  doors = new Doors(scene, root, (def) => {
    // Session 47: every door is manual now, but only the two upstairs ones
    // count toward the secret.
    if (def.name === 'Door.001' || def.name === 'Door.002') discoveries.collect('door:upstairs');
  });

  // Two plain poster/label rectangles (CONFIG.signs) — the studio-door one
  // rides Door.001's pivot so it swings with the door, the same way the
  // Caution sign/tape (real Blender meshes) do; see signs.js.
  signs = new Signs(scene, doors);

  rooms = new Rooms(scene, root, showRoomLabel, { hemi, ambient });
  footsteps = new Footsteps({ walker, rooms });

  ui.status.textContent = 'mapping the floor…';
  await nextFrame();

  // Flood-fills every spot the visitor can stand in (~2,100 of them) — the
  // other big synchronous cost, per the README about a second on its own.
  nav = new Nav(walker, CONFIG.player.navCell).build(walker.feet);
  walker.onReplan = (goal) => {
    const route = nav.findPath(walker.feet, goal);
    if (route && route.length) walker.follow(route, goal); else walker.stop();
  };

  desk = new Desk(scene, root, camera, walker);
  desk.onState = onDeskState;

  // The TV's screen is a plane overlaid on the wall-mounted TV, not part of
  // its mesh (see CONFIG.tv) — off until the `tv` story star is discovered,
  // then loops the "one more episode" sequence.
  tv = new TVScreen(scene);

  // The hall's Clock.001 gets the same rolling readout as the TV's own
  // corner clock, bigger and "on the side" of the sofa — off until the same
  // `tv` star fires it (see story.onReveal below), then stays locked to the
  // TV's own clock (see CONFIG.clock / clock.js).
  hallClock = new HallClock(scene);

  // The bedroom's Mars ceiling — the overlay that draws in over the real
  // ceiling/Stars mesh above the bed. Off until the `mars` popup is the one
  // open (see mars.sync() in step() below); story.js doesn't know it exists.
  mars = new Mars(scene);

  // The kitchen coffee station: moka pot, milk, frother and three mugs you
  // can actually pick up (see coffee.js). Its clips — the lid, the brew, the
  // two pours and the froth — were authored in Blender and ride in with the
  // model as `gltf.animations`. Nothing answers to the pointer until the
  // `coffee` story star has been found (story.onReveal below).
  coffee = new Coffee({
    scene, root, animations, camera, walker,
    onHint: (text) => { if (text) showThought(text, 6); else ui.prompt.classList.remove('show'); },
    // Session 29: this is ambient conversation, not a choice screen — the
    // café half of the coffee story now types itself top-left like every
    // other star, instead of opening the modal card.
    onDone: () => { if (CONFIG.coffeeDone) story.startHud(CONFIG.coffeeDone); },
  });
  // Session 73: the recipe card under the Coffee Corner poster follows the
  // step coffee.js is on (signs.js, CONFIG.signs.coffeeSteps).
  coffee.onStep = (i, n, text) => signs?.setCoffeeStep(i, n, text);
  signs?.setCoffeeStep(0, coffee.steps.length, coffee.stepText(0));
  // Leaning over the table borrows the seats' "Stand up" button.
  coffee.onLean = (leaning) => {
    if (leaning) {
      ui.standup.innerHTML = `${CONFIG.coffee?.lean?.standLabel ?? 'Step back'} <span style="opacity:.5">Esc</span>`;
      ui.standup.classList.add('show');
      ui.hint.classList.remove('show');
    } else if (!seats?.seated && desk?.state !== 'seated' && desk?.state !== 'on') {
      ui.standup.classList.remove('show');
    }
  };

  // The double oven under the hob (see oven.js). Its one clip — doors drop
  // open, the trays of cupcakes and cookies slide out, steam — rides in with
  // the model too, and fires when the `dessert` star is found (below).
  oven = new Oven({ root, animations, walker });
  fridge = new Fridge({ root });
  oven.onSay = (text) => showThought(text, 2);
  oven.onLean = (leaning) => {
    if (leaning) {
      ui.standup.innerHTML = `${CONFIG.oven?.lean?.standLabel ?? 'Step back'} <span style="opacity:.5">Esc</span>`;
      ui.standup.classList.add('show');
      ui.hint.classList.remove('show');
    } else if (!seats?.seated && !coffee?.leaning && desk?.state !== 'seated' && desk?.state !== 'on') {
      ui.standup.classList.remove('show');
    }
  };

  // Sofa, garden swing, studio rocking chair, bed — all of them seat you for
  // simply walking up to them. The desk owns the view during its own click →
  // walk → sit chain, so it gets first refusal.
  seats = new Seats({
    camera, walker,
    // With a seat passed in: is a tapped star walking the visitor somewhere
    // OTHER than this seat? Then walk on by. (Session 23)
    isBusy: (def) => desk.state === 'walking' || desk.state === 'sitting' ||
      (!!def && !!story?.approach && story.approachSeat() !== def.id),
    onState: onSeatState,
  });

  guide = new Guide({
    scene, camera, walker, nav, doors, ui,
    onGoTo: (dest) => {
      ui.hint.classList.remove('show');
      // The same ride carries both the stairs chooser and the map, so only
      // the stairs themselves count as having taken the stairs.
      if (dest?.via !== 'map') discoveries.collect('stairs');
    },
  });

  // Session 54: the navbar works from the start, even over the porch intro.
  // Taking a room off the map mid-intro counts as picking "Explore": the
  // intro closes, the camera eases back to the walker, and THEN the ride
  // starts (starting it straight away scrambled the view — see the hire flow).
  navbar = new Navbar({ ui, discoveries, getMarks: mapMarks, onGoToRoom: (room) => {
    if (intro?.blocking) intro.choose?.('explore');
    const go = () => {
      if (intro?.blocking) { requestAnimationFrame(go); return; }
      goToRoom(room);
    };
    go();
  } });
  // Session 11: stars are coins now — walking near a visible one collects it
  // (see story.js's update()), so there's no "go stand by it first" step to
  // wire up here any more.
  //
  // Session 17: the last argument handles the intro's choice buttons.
  //   go:   ride to that room on the house map ("Hire me" -> the bedroom desk)
  //   then: handled inside story.js, another script in the same panel
  story = new Story(scene, camera, discoveries, ui, null, walker, (choice) => {
    if (!choice?.go) return;
    const room = mapRoom(choice.go);
    if (room) goToRoom(room);
  });
  // Session 23: tapping a star walks you to it (or sits you in its seat)
  // before anything opens — story.js drives that, so it needs the router,
  // the seats, and the two kitchen leans it may have to step you out of.
  story.seats = seats;
  story.goTo = goTo;
  // Session 48: clickable furniture (every seat) and clickable star hosts
  // (the world map, after its star is collected) — see pickInteractive().
  seats.bindMeshes(root);
  for (const def of CONFIG.story ?? []) {
    if (!def.revisit) continue;
    const objects = [];
    for (const name of def.revisit) {
      const o = findByName(root, name);
      if (!o) { console.warn(`[revisit] "${def.id}": no mesh named "${name}"`); continue; }
      o.traverse((m) => { if (m.isMesh) m.userData.storyRevisit = def.id; });
      objects.push(o);
    }
    if (objects.length) revisitHosts.push({ id: def.id, room: def.room, objects });
  }
  story.coffee = coffee;
  story.oven = oven;
  // Session 74: every star found -> a beat after the last interaction has
  // played out, one centred glass card with the sign-off (finale.js). "Played
  // out" = nothing typing top-left, no full-screen takeover, no ride, and —
  // if the coffee star was the last — the cup actually finished.
  // Session 81: the walk-through that runs BEFORE the porch intro (tutorial.js).
  tutorial = new Tutorial({
    THREE, scene, camera, walker, goTo,
    isBusy: () => blocked() || !!story.hud || walker.seated || walker.riding,
  });
  finale = new Finale({
    isIdle: (lastId) => !story.hud && !story.blocking && !story.book?.holding && !intro?.blocking && !walker.riding && !walker.seated &&
      !(lastId === 'star:coffee' && coffee.armed && !coffee.done),
  });
  // Session 63: the garden star's book — picked up off the little table while
  // its lines type, opened once they finish (see book.js / story.js).
  gardenBook = new GardenBook({
    scene, root, camera,
    isHeld: () => seats?.active?.id === 'orb',
    onRequestClose: () => story.close(),
    opts: CONFIG.gardenBook ?? {},
  });
  story.book = gardenBook;
  // Session 72: a butterfly flutters round the garden and now and then
  // settles on a rose bush (see butterfly.js / CONFIG.butterfly).
  if (CONFIG.butterfly) butterfly = new Butterfly({ scene, root, walker, opts: CONFIG.butterfly });
  // The walking hint waits until the intro is out of the way — before that it
  // is just one more thing on screen behind a modal.
  let hintShown = false;
  story.onReveal = (id) => {
    if (id === 'tv') { tv.play(); hallClock.play(); }
    // Session 39: straight to the table view the moment the star is found —
    // the line types top-left while you're already looking down at the table.
    if (id === 'coffee') { coffee.arm(); coffee.leanIn(); }
    // The oven opens while the popup talks: the crouch-down view frames it
    // through the panel, and the doors stay open for good afterwards.
    if (id === 'dessert') oven.play();
    // "You can't open that" — and the fridge topples over.
    if (id === 'fridge') fridge.tumble();
  };
  let coffeeHinted = false;
  story.onClose = () => {
    // The coffee star's popup just said "make your coffee"; once it is out
    // of the way, the same words sit in the thought bubble while you do.
    if (coffee.armed && !coffeeHinted && !story.blocking) { coffeeHinted = true; coffee.hint(); }
    if (hintShown || story.blocking || tutorial?.started) return;
    hintShown = true;
    setTimeout(() => {
      if (walker.seated || walker.riding || story.blocking) return;
      ui.hint.classList.add('show');
    }, 350);
  };

  marker = makeMarker();
  scene.add(marker);

  // Hover name tags on things (the iPad, tripod and camera on the studio
  // table) — see item-labels.js and CONFIG.itemLabels.
  itemLabels = new ItemLabels({ root, camera, walker, collider: colliderMesh });
  // Session 49: a label group with `requires: '<story id>'` only wakes up
  // once that star has been collected (the music wall waits for `music`).
  itemLabels.unlocked = (id) => !!story?.items?.find((x) => x.def.id === id)?.found;

  // The bedroom's star curtain: every star on the strings above the bed is
  // its own light (star-lights.js, CONFIG.starLights). Built near the end of
  // setup on purpose — it patches the house's materials, so everything that
  // clones a material of its own (mars.js's Stars copy, coffee.js's mugs,
  // rooms.js's lamps) has to have done that first, and it has to land before
  // the renderer.compile() warm-up below so no shader compiles twice.
  starLights = new StarLights({ scene, root, rooms });

  // The Music Corner's note-wall chain reaction (music-decor.js,
  // CONFIG.musicDecor). Built right after starLights, not before: it clones
  // and patches Decor's own material for itself, and starLights' own "patch
  // every lit material in the house" pass above would otherwise land on
  // that same material afterwards and silently overwrite this patch with
  // its own (harmless to Decor either way, but it'd erase the note glow).
  // Nothing past this point in setup() may touch materials again.
  musicDecor = new MusicDecor({ root, scene });
  // Session 61: the studio iPad shows the Instagram profile and opens it on
  // click. Its screen is a new MeshBasicMaterial quad (not a patch of any
  // existing material), so building it after the note wall is safe.
  ipad = new IpadScreen({ root, walker });

  console.log(`[MeraGHAR] collision mesh: ${built.triangleCount.toLocaleString()} triangles`);
  console.log(`[MeraGHAR] walkable map: ${nav.nodes.size.toLocaleString()} spots in ${nav.buildMs} ms`);

  // Small console handle for tuning: MERAGHAR.teleport({pos:[x,y,z], yaw:0})
  window.MERAGHAR = {
    THREE, scene, camera, renderer, walker, doors, rooms, nav, desk, seats, guide,
    discoveries, navbar, story, coffee, oven, fridge, tv, hallClock, mars, starLights, butterfly, config: CONFIG,
    step,                                  // advance the simulation by dt seconds
    // Freeze the walker and fly the camera anywhere — handy for inspecting
    // the model:  MERAGHAR.freecam([x,y,z], [lookAtX, lookAtY, lookAtZ])
    freecam(pos, at) {
      walker.frozen = !!pos;
      if (pos) { camera.position.set(...pos); camera.lookAt(new THREE.Vector3(...at)); }
    },
    simulate(seconds, dt = 1 / 60) { for (let t = 0; t < seconds; t += dt) step(dt); },
    teleport({ pos, yaw, pitch }) {
      if (pos) {
        walker.feet.set(...pos);
        const g = walker.groundAt(walker.feet, pos[1]);
        if (g !== null) walker.feet.y = g;
        walker.smoothY = walker.feet.y;
        walker.target = null;
      }
      if (yaw !== undefined) walker.yaw = yaw;
      if (pitch !== undefined) walker.pitch = pitch;
      renderer.shadowMap.needsUpdate = true;
      return walker.feet.toArray().map((n) => +n.toFixed(2));
    },
  };
  window.__teleport = (s) => window.MERAGHAR.teleport(s);
  // MERAGHAR.lens(120) / MERAGHAR.lens(null) — set the lens from the console.
  window.MERAGHAR.lens = (d) => { if (d !== undefined) setLens(d); return CONFIG.player.lensDiag; };

  ui.status.textContent = 'warming up the view…';
  await nextFrame();

  // Three.js compiles each material's shader program lazily, on the first
  // frame that draws it. With ~90+ distinct materials in this scene, that
  // first frame used to land right as the loader disappeared — a stutter (or
  // outright freeze on slower GPUs) exactly when the house should already be
  // visible. Forcing it here spends that same cost under the loading screen
  // instead, where a frozen moment reads as "still loading" rather than
  // "broken".
  renderer.compile(scene, camera);

  // Keep the loading screen up until the rest is ready too — fonts, the
  // porch greeter + intro icons, and the background music buffered — so the
  // intro starts complete instead of popping in (silent, unstyled) piece by
  // piece. Capped so a slow or blocked asset (offline fonts, say) can never
  // strand the visitor on the loader.
  ui.status.textContent = 'tuning the music…';
  const imageReady = (src) => new Promise((res) => {
    const im = new Image(); im.onload = im.onerror = () => res(); im.src = src;
  });
  const musicReady = new Promise((res) => {
    if (!CONFIG.backgroundMusic?.src) return res();
    backgroundMusic.addEventListener('canplaythrough', () => res(), { once: true });
    backgroundMusic.addEventListener('error', () => res(), { once: true });
    backgroundMusic.preload = 'auto';
    backgroundMusic.load();
  });
  // Session 70: fetch the instrument song in the background (not awaited —
  // it only has to be ready by the time someone reaches the music wall).
  if (CONFIG.musicDecor?.song?.src) { instrumentSong.preload = 'auto'; instrumentSong.load(); }
  await Promise.race([
    Promise.all([
      document.fonts?.ready ?? Promise.resolve(),
      imageReady(CONFIG.porchIntro?.sprite ?? ''),
      ...INTRO_CHOICES.map((c) => imageReady(c.img)),
      musicReady,
    ]),
    new Promise((res) => setTimeout(res, 10000)),
  ]);

  ready = true;
  if (CONFIG.startDebug) ui.debug.classList.add('show');
  if (CONFIG.startDesk) desk.sitNow();
  renderer.shadowMap.needsUpdate = true;
  const skipIntro = new URLSearchParams(location.search).has('nointro');
  // The porch camera goes on BEFORE the loader lifts, so the first thing seen
  // is the porch shot, not a flash of the walker's view.
  if (!skipIntro && CONFIG.porchIntro) {
    doors.holdClosed = true;     // the front door stays shut until the choice
    intro = startIntro({ THREE, scene, camera, canvas, cfg: CONFIG.porchIntro, deferred: true });
    window.MERAGHAR.intro = intro;
    intro.update(0);
  }
  // Session 69: the loader's ending (loader-fx.js): the last prop goes, the
  // door slides in, she waves and walks through, and light floods out. It
  // resolves once the flood is full, so the fade below goes from that light
  // straight into the porch shot. A click or key skips it.
  await window.MeraLoader?.finish?.();
  ui.loader.classList.add('gone');
  // Try to start the music as soon as the house is up. Browsers only allow
  // this on a returning/engaged visitor; on a cold visit it's rejected and
  // the first click/key listener above starts it instead.
  startBackgroundMusic();
  // Section 1 of the final story. It is modal, so nothing in the house can be
  // touched until the visitor picks "Hire me" or "Get to know me" — which is
  // the whole point of opening on it. `?nointro` skips it while tuning.
  // Session 26: the porch intro (src/intro.js) replaces the old intro and
  // house-rules popups — zoomed-out porch shot, Apoorva waving by the door,
  // typewriter lines, then the two-column hire / explore choice.
  setTimeout(() => {
    if (intro) {
      // Session 81: the tutorial goes first, in the visitor's own view. When
      // its star pops, the porch shot eases in and the intro text starts.
      tutorial.start({
        onDone: () => {
          intro.engage(1.6);
          setTimeout(() => intro.begin(), 1100);
        },
      });
      intro.choice.then((id) => {
        // Session 77: the tutorial (Session 81) leaves the walker wherever its
        // star was, facing wherever they last looked — often away from the
        // house — and the porch shot's release eases back into THAT pose, so
        // the view swung round the wrong way after the choice. The porch shot
        // is still fully on at this moment (release has only just started),
        // so put the walker back on the spawn spot facing the door, unseen:
        // the release is the old short push-in toward the house again.
        const P = CONFIG.player;
        walker.stop(); walker.keys?.clear?.();
        walker.feet.set(...P.spawn);
        const g = walker.groundAt(walker.feet, P.spawn[1] + 0.6);
        if (g !== null) walker.feet.y = g;
        walker.smoothY = walker.feet.y;
        walker.yaw = P.spawnYaw; walker.pitch = P.spawnPitch;
        doors.holdClosed = false;
        // Session 47: the front door is click-only now (CONFIG.doors); the
        // choice button IS the click, so it swings open as the camera moves in.
        doors.open('Door');
        playSfx('doorBell');       // the only time the bell rings
        if (id === 'hire') {
          // Session 47: wait for the intro camera to land back in the walker
          // before starting the ride. Starting it straight away had the
          // camera still blending from the porch shot while the walker was
          // already through the door and onto the stairs — the half-open
          // door and the climb both looked scrambled through that blend.
          const room = mapRoom('bedroom');
          const go = () => {
            if (intro?.blocking) { requestAnimationFrame(go); return; }
            if (room) goToRoom(room, { speed: CONFIG.stairsGuide.hireSpeed });
          };
          go();
          return;
        }
      });
      return;
    }
    if (walker.seated || story.blocking) return;
    ui.hint.classList.add('show');     // ?nointro — no intro, no walk-through
  }, 700);
}

/**
 * Session 47: make the studio's neon lettering a tad thinner, in place, at
 * load (CONFIG.neonThin). The sign is bevelled tube geometry, possibly split
 * into several primitives (one per neon colour) and with split vertices along
 * hard edges, so: weld every vertex by world position across all of its
 * meshes, average the normals of each welded spot, and move every copy of
 * that spot by the same amount — inward along the normal's in-plane (x/y)
 * part. Identical moves for coincident vertices means no cracks. The round
 * sides of each tube move the most, the flat faces barely at all, so the
 * stroke narrows without the letter's face caving in.
 */
function thinNeon(root) {
  const cfg = CONFIG.neonThin;
  if (!cfg?.amount) return;
  const obj = findByName(root, cfg.mesh);
  if (!obj) { console.warn(`[neonThin] no object named "${cfg.mesh}"`); return; }
  root.updateWorldMatrix(true, true);
  const meshes = [];
  obj.traverse((o) => { if (o.isMesh && o.geometry?.attributes?.position) meshes.push(o); });
  const q = (v) => `${Math.round(v.x * 2e4)},${Math.round(v.y * 2e4)},${Math.round(v.z * 2e4)}`;
  const sums = new Map();
  const world = [];   // per mesh: Float32Array of world positions + keys
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  for (const m of meshes) {
    const g = m.geometry;
    if (!g.attributes.normal) g.computeVertexNormals();
    const pos = g.attributes.position, nor = g.attributes.normal;
    const nm = new THREE.Matrix3().getNormalMatrix(m.matrixWorld);
    const keys = new Array(pos.count), wp = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      const k = q(v);
      keys[i] = k; wp[i * 3] = v.x; wp[i * 3 + 1] = v.y; wp[i * 3 + 2] = v.z;
      const s = sums.get(k);
      if (s) { s.x += n.x; s.y += n.y; s.z += n.z; s.c++; }
      else sums.set(k, { x: n.x, y: n.y, z: n.z, c: 1 });
    }
    world.push({ keys, wp });
  }
  const inv = new THREE.Matrix4();
  meshes.forEach((m, mi) => {
    const g = m.geometry;
    const pos = g.attributes.position;
    const { keys, wp } = world[mi];
    inv.copy(m.matrixWorld).invert();
    for (let i = 0; i < pos.count; i++) {
      const s = sums.get(keys[i]);
      const len = Math.hypot(s.x, s.y, s.z) || 1;
      // Sign faces ±z, so the stroke's width lives in world x/y.
      v.set(
        wp[i * 3]     - (s.x / len) * cfg.amount,
        wp[i * 3 + 1] - (s.y / len) * cfg.amount,
        wp[i * 3 + 2]
      ).applyMatrix4(inv);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    g.computeBoundingBox();
    g.computeBoundingSphere();
  });
}

/**
 * Session 48: push the gable-end triangles of a roof mesh (CONFIG.gableInset)
 * a little way into the roof, off the plane the siding boards and rake trim
 * share with them — that shared plane is what flickered. Only triangles whose
 * world normal is (anti)parallel to x move; the geometry is de-indexed first
 * so the roof slopes sharing their corner vertices stay exactly where they are.
 */
function insetGables(root) {
  const cfg = CONFIG.gableInset;
  if (!cfg?.inset) return;
  const obj = findByName(root, cfg.mesh);
  if (!obj) { console.warn(`[gableInset] no object named "${cfg.mesh}"`); return; }
  root.updateWorldMatrix(true, true);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const n = new THREE.Vector3(), v = new THREE.Vector3();
  const inv = new THREE.Matrix4();
  let moved = 0;
  obj.traverse((m) => {
    if (!m.isMesh || !m.geometry?.attributes?.position) return;
    if (m.geometry.index) m.geometry = m.geometry.toNonIndexed();
    const pos = m.geometry.attributes.position;
    inv.copy(m.matrixWorld).invert();
    for (let i = 0; i + 2 < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      b.fromBufferAttribute(pos, i + 1).applyMatrix4(m.matrixWorld);
      c.fromBufferAttribute(pos, i + 2).applyMatrix4(m.matrixWorld);
      n.subVectors(b, a).cross(v.subVectors(c, a)).normalize();
      if (Math.abs(n.x) < 0.99) continue;
      // Inward = toward the middle of the house in x, whichever end this is.
      const cx = (a.x + b.x + c.x) / 3;
      const dir = cx < -7.5 ? 1 : -1;
      for (const [k, p] of [[i, a], [i + 1, b], [i + 2, c]]) {
        p.x += dir * cfg.inset;
        p.applyMatrix4(inv);
        pos.setXYZ(k, p.x, p.y, p.z);
      }
      moved++;
    }
    pos.needsUpdate = true;
    m.geometry.computeBoundingBox();
    m.geometry.computeBoundingSphere();
  });
  if (!moved) console.warn('[gableInset] no gable triangles found');
}

/**
 * Session 55: what the house map marks in each room — one entry per story
 * star (true once found) and per secret coin, keyed by the room each sits in
 * (story.js works that out from the marker's position).
 */
function mapMarks() {
  const out = {};
  for (const it of story?.items ?? []) {
    if (!it.room) continue;
    const m = out[it.room] ??= { stars: [], coins: [] };
    if (it.def.type === 'star' && it.def.discovery) m.stars.push(!!it.found);
    else if (it.def.type === 'easterEgg') m.coins.push(!!it.found);
  }
  // Session 56: the bedroom desk star ("the professional me") is its own
  // thing (desk.js), not a story star — but it's a star in the bedroom, so
  // the map shows it. Found once you've sat down at the desk.
  (out.bedroom ??= { stars: [], coins: [] }).stars.unshift(!!discoveries?.has('desk:sit'));
  return out;
}

/** A room on the house map, by id, whichever floor it is on. */
function mapRoom(id) {
  for (const floor of CONFIG.navbar?.floors ?? []) {
    const room = (floor.rooms ?? []).find((r) => r.id === id);
    if (room) return room;
  }
  return null;
}

// ---------------------------------------------------------------------------
//  Click-to-move picking
// ---------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
raycaster.firstHitOnly = false;   // needs every hit, to see past uncut doorways
const ndc = new THREE.Vector2();

function pick(clientX, clientY) {
  camera.updateMatrixWorld();
  ndc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObject(colliderMesh, false);
  // Skip anything inside an uncut doorway so you can click through to the room
  // beyond. Once CONFIG.doorways is empty this is just hits[0].
  const hit = hits.find((h) => !walker.inDoorway(h.point));
  if (!hit) return null;
  const n = hit.face ? hit.face.normal.clone() : new THREE.Vector3(0, 1, 0);

  // Session 25: only something you could actually stand on counts. Walls
  // and ceilings used to be accepted too (a wall meant "stop just in front
  // of it"), which put the floor reticle on walls and up on the roof from
  // outside — so now the pointer has to be on an upward-facing surface.
  if (n.y <= 0.55) return null;
  const point = hit.point.clone();

  const g = walker.groundAt(point, point.y);
  if (g === null) return null;
  point.y = g;

  // Reject anything the walkable map itself would not agree is a floor —
  // this is what keeps the cursor off tabletops, the TV, sofa cushions, and
  // other upward-facing furniture that a raw normal check can't tell apart
  // from an actual floor.
  const near = nav.nearest(point, 3);
  if (!near) return null;
  const flat = Math.hypot(near.x - point.x, near.z - point.z);
  if (flat > CONFIG.player.navCell * 1.6 || Math.abs(near.y - point.y) > 0.5) return null;

  // Session 25: ...and it has to be on the SAME side of any wall as that
  // walkable spot. A roof eave or the top of a wall can sit at the same
  // height as a floor just inside, and within a cell of it — so the checks
  // above let the reticle land on the roof. A chest-height ray from the
  // walkable spot to the point catches the wall in between.
  if (!reachable(near, point)) return null;

  return point;
}

const reachRay = new THREE.Raycaster();
reachRay.firstHitOnly = true;
const _from = new THREE.Vector3(), _to = new THREE.Vector3(), _dir = new THREE.Vector3();
function reachable(node, point) {
  _from.set(node.x, node.y + 0.9, node.z);
  _to.set(point.x, point.y + 0.9, point.z);
  _dir.subVectors(_to, _from);
  const dist = _dir.length();
  if (dist < 0.05) return true;
  reachRay.set(_from, _dir.divideScalar(dist));
  reachRay.far = dist;
  const hit = reachRay.intersectObject(colliderMesh, false)[0];
  return !hit || walker.inDoorway(hit.point);
}

/** Route there through the walkable map; fall back to a straight line. */
function goTo(point) {
  const route = nav.findPath(walker.feet, point);
  if (route && route.length) { walker.follow(route, point); return true; }
  walker.moveTo(point);
  return true;
}

/**
 * Picked a room off the house map. This is a ride, not a cut: the route
 * comes from the walkable map so the camera follows real floors and treads,
 * exactly as the stairs chooser does — you just don't have to steer.
 *
 * A room behind one of the manual upstairs doors needs that door open for a
 * route through to exist, so we open it here. Choosing the room off a map is
 * already the visitor saying they mean to be in it; making them click the
 * leaf as well would only be a toll booth.
 */
function goToRoom(room, opts = {}) {
  if (!ready) return;
  if (room.door) doors.open(room.door);
  desk?.standUp();
  seats?.standUp();
  guide.travel({
    key: room.id,
    label: room.label,
    point: room.point,
    door: room.door,
    face: room.face,
    facePitch: room.facePitch,
    speed: opts.speed,
    via: 'map',
  });
  ui.hint.classList.remove('show');
}

/**
 * Anything in the world the pointer can act on: the desk's star and power
 * pad, and any closed manual door. Returns the object that was hit, or null.
 */
function pickInteractive(clientX, clientY) {
  const targets = [...(desk?.targets ?? []), ...(guide?.targets ?? []), ...(story?.targets ?? []), ...(oven?.targets ?? []), ...(musicDecor?.targets ?? []), ...(ipad?.targets ?? []),
    ...(seats?.targets ?? []), ...revisitTargets()];
  if (!targets.length) return null;
  camera.updateMatrixWorld();
  ndc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(targets, true);
  return hits.length ? hits[0].object : null;
}

/** Session 48: star hosts (the world map) clickable from their own room,
 *  while no popup / letter / timeline is up. */
const revisitHosts = [];
function revisitTargets() {
  if (!story || story.blocking) return [];
  const here = story.currentRoom();
  const out = [];
  for (const h of revisitHosts) if (!h.room || h.room === here) out.push(...h.objects);
  return out;
}

/**
 * Where the pointer lands on the monitor, once the machine is on — in the
 * desktop's own coordinates. Null when the pointer isn't on the glass.
 */
function pickScreen(clientX, clientY) {
  if (!desk?.screenLive) return null;
  camera.updateMatrixWorld();
  ndc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return desk.screenPick(raycaster);
}

/** Route a hit object to whoever owns it. */
function useInteractive(object) {
  // Session 39: inside an interaction (a seat, the desk chair, leaning over
  // the coffee table or the oven) you stay exactly where you are. Only things
  // that act without moving you still answer: a star that opens from where
  // you are, the oven doors, the desk's power button. Everything else waits
  // until Esc or the Stand up / Step back button takes you out.
  if (walker.seated) {
    const id = object.userData.storyTarget;
    const ok = (id && story.opensInPlace(id)) ||
      (object.userData.storyRevisit && story.opensInPlace(object.userData.storyRevisit)) ||
      object.userData.ovenTreat || object.userData.ovenTarget || object.userData.ipadLink ||
      (object.userData.deskTarget && (desk.state === 'seated' || desk.state === 'on'));
    if (!ok) return false;
  }
  guide.cancelTravel();
  // A story star decides for itself whether you need to get up — the world
  // map can be opened straight from the sofa (Session 23, `from:` in config).
  if (object.userData.storyTarget) return story.activate(object.userData.storyTarget);
  // Session 48: the world map itself (after its star is gone) — the letter again.
  // Session 57: the studio Camera — the vlog again.
  if (object.userData.storyRevisit) return story.revisit(object.userData.storyRevisit);
  // The oven, once the star has opened it once: click it again to shut the
  // doors, or open them back up. No walk, no getting up — same as knocking
  // on a door leaf.
  if (object.userData.ovenTreat) return oven.nibble();
  if (object.userData.ovenTarget) return oven.toggle();
  story.cancel();
  // Anything else you can click is somewhere else in the room, so get out of
  // whatever you were sitting on first.
  seats.standUp();
  if (object.userData.deskTarget) return desk.activate(object.userData.deskTarget, goTo);
  // Session 48: a chair / the sofa / the bed, clicked — sit in it (walking
  // over first if needed). Same thing as walking into it.
  if (object.userData.seatId) return seats.request(object.userData.seatId, goTo);
  // Any instrument on the Music Corner wall (Guitar/Ukulele/Keyboard) —
  // just kicks off the note-wall chain reaction, no walk, nothing else
  // changes about where you're standing.
  // Session 70: …and plays "Tum hi ho", the lights looping along with it.
  if (object.userData.musicTarget) return playInstrumentSong();
  // Session 61: the studio iPad — open the Instagram profile in a new tab.
  if (object.userData.ipadLink) return ipad.open();
  return guide.activate(object);
}

function makeMarker() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.62, 0.95, 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false })
  );
  const dot = new THREE.Mesh(
    new THREE.CircleGeometry(0.18, 20).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false })
  );
  g.add(ring, dot);
  g.renderOrder = 999;
  g.visible = false;
  return g;
}

// ---------------------------------------------------------------------------
//  Input — drag to look, click/tap to walk.
//
//  Looking around is 1:1 with the pointer and has no range of its own: drag
//  as far as you want, in either direction. There is no zoom of any kind —
//  no wheel, no pinch — so the field of view never changes under you.
// ---------------------------------------------------------------------------
const pointers = new Map();
let dragStart = null, dragged = false, lookHold = 0;

/**
 * Session 17: while a story popup is open the house is frozen. The visitor
 * cannot walk, look, click the floor or press a key until they close it — the
 * veil under the panel already eats pointer events that would reach the canvas
 * or the navbar, and this is the belt to that pair of braces (a key, a pointer
 * already captured when the popup opened, a wheel over the monitor).
 */
function blocked() { return !!story?.blocking || !!intro?.blocking || !!finale?.isOpen; }

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// While a coffee-station drag owns the pointer, nothing else sees it: no look,
// no floor click. Cleared on release, or if the popup that ends the sequence
// opens mid-drag (blocked() then drops the release).
let coffeeDrag = null;

canvas.addEventListener('pointerdown', (e) => {
  if (!ready || blocked()) return;
  canvas.setPointerCapture(e.pointerId);
  // Something on the coffee table under the pointer? It's a grab, not a look.
  if (coffeeDrag === null && pointers.size === 0 && coffee?.pointerDown(e.clientX, e.clientY)) {
    coffeeDrag = e.pointerId;
    canvas.style.cursor = 'grabbing';
    ui.hint.classList.remove('show');
    return;
  }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) {
    dragStart = { x: e.clientX, y: e.clientY, t: performance.now() };
    dragged = false;
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (!ready) return;
  if (blocked()) { marker.visible = false; itemLabels?.hide(); return; }
  if (coffeeDrag === e.pointerId) { coffee.pointerMove(e.clientX, e.clientY); return; }
  const prev = pointers.get(e.pointerId);

  if (!prev) {                       // hovering with a mouse
    updateMarker(e.clientX, e.clientY);
    return;
  }
  itemLabels?.hide();

  const dx = e.clientX - prev.x;
  const dy = e.clientY - prev.y;
  prev.x = e.clientX; prev.y = e.clientY;

  // Two fingers look around exactly like one. Pinch does nothing: no zoom.
  if (dragStart && (Math.abs(e.clientX - dragStart.x) > 5 || Math.abs(e.clientY - dragStart.y) > 5)) dragged = true;
  if (dragged) {
    walker.look(dx, dy);
    tutorial?.noteLook();
    walker.userLooking = true;
    lookHold = 1.6;
    marker.visible = false;
  }
});

function endPointer(e) {
  if (!ready) return;
  if (coffeeDrag === e.pointerId) {
    coffeeDrag = null;
    canvas.style.cursor = 'crosshair';
    if (!blocked()) coffee.pointerUp();
    return;
  }
  const had = pointers.delete(e.pointerId);
  // A pointer that went down before the popup opened must not act on release.
  if (blocked()) { if (pointers.size === 0) dragStart = null; return; }
  if (!had) return;
  if (pointers.size === 0 && dragStart) {
    const quick = performance.now() - dragStart.t < 500;
    if (!dragged && quick) {
      // The desktop first (while you are sitting at a running machine, a
      // click on the glass belongs to it), then objects you can act on,
      // then the floor.
      const onScreen = pickScreen(e.clientX, e.clientY);
      const target = onScreen ? null : pickInteractive(e.clientX, e.clientY);
      if (onScreen) {
        desk.clickScreen(onScreen);
      } else if (target) {
        useInteractive(target);
        ui.hint.classList.remove('show');
      } else if (walker.seated) {
        // Session 39: and now not even that. Inside an interaction a click on
        // empty space does nothing at all — you stay put, you can still drag
        // to look around, and only Esc or the Stand up / Step back button
        // gets you out (Apoorva: a stray click shouldn't throw you out of
        // the coffee table and walk you off somewhere else).
        //
        // Session 32: this used to also walk you to wherever the click
        // landed, in the same motion as standing up — "up, and over there"
        // in one click. On the sofa that meant a click anywhere near the TV
        // (an easy accident — it fills a lot of the view) picked a floor
        // point right against it and walked you up close enough to fill the
        // screen, reading as an unwanted zoom. Standing up is now the whole
        // reaction to this click; where to walk is a separate, deliberate
        // second click on the floor, same as everywhere else in the house.
      } else {
        const p = pick(e.clientX, e.clientY);
        if (p) {
          guide.cancelTravel();     // the visitor is steering again
          story.cancel();           // ...and has changed their mind about a star
          goTo(p); flash(p);
          ui.hint.classList.remove('show');
        }
      }
    }
    dragStart = null;
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointerleave', () => { itemLabels?.hide(); if (marker) marker.visible = false; });
canvas.addEventListener('pointercancel', endPointer);

// Scrolling never changes the field of view. The one thing it does do is
// scroll a window on the desktop, when that is what is under the pointer.
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (!ready || blocked()) return;
  const onScreen = pickScreen(e.clientX, e.clientY);
  if (onScreen) desk.wheelScreen(onScreen, e.deltaY);
}, { passive: false });

function updateMarker(x, y) {
  if (!ready) return;
  const onScreen = pickScreen(x, y);
  if (desk?.screenLive) {
    // Over the monitor the pointer behaves like a mouse on a desktop: an
    // arrow, and a hand over anything you can click.
    const overSomething = desk.hoverScreen(onScreen);
    if (onScreen) {
      marker.visible = false;
      canvas.style.cursor = overSomething ? 'pointer' : 'default';
      return;
    }
  }
  const picked = pickInteractive(x, y);
  if (picked) {
    marker.visible = false;
    // Session 49: an instrument on the music wall is BOTH clickable (the
    // note-wall glow, music-decor.js) and labelled (CONFIG.itemLabels'
    // music group). Making it clickable had this branch hide its name tag;
    // keep the tag for anything that has one, and the pointer cursor too.
    // Session 57: same for the studio Camera, now clickable (the vlog).
    if (!((picked.userData.musicTarget || picked.userData.storyRevisit || picked.userData.ipadLink) && itemLabels?.hover(x, y, walker.seated))) itemLabels?.hide();
    canvas.style.cursor = 'pointer';
    return;
  }
  // The coffee table: a hand over anything you can pick up.
  if (coffee?.hover(x, y)) {
    marker.visible = false;
    itemLabels?.hide();
    canvas.style.cursor = 'grab';
    return;
  }
  // A named thing near you (the iPad, tripod, camera, or — Session 30 — the
  // instruments on the music wall, hovered from the stool): show its tag,
  // and don't offer to walk onto it. `hover()` itself decides whether a
  // seated visitor still qualifies per-group (CONFIG.itemLabels groups[].
  // allowSeated); it hides its own tag when nothing qualifies, so there is
  // no separate unconditional hide-while-seated any more.
  if (itemLabels?.hover(x, y, walker.seated)) {
    marker.visible = false;
    canvas.style.cursor = 'default';
    return;
  }
  canvas.style.cursor = 'crosshair';
  // Sitting on the sofa or the swing, the floor marker still tracks — clicking
  // it stands you up and walks you there. Only the desk locks the floor off.
  // Session 39: no floor marker at all while inside an interaction — a click
  // there no longer does anything, so it shouldn't offer to.
  if (walker.seated) { marker.visible = false; return; }
  const p = pick(x, y);
  if (p) { marker.position.set(p.x, p.y + 0.08, p.z); marker.visible = true; }
  else marker.visible = false;
}

let flashes = [];
function flash(p) {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(0.3, 0.5, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false })
  );
  m.position.set(p.x, p.y + 0.09, p.z);
  m.renderOrder = 1000;
  scene.add(m);
  flashes.push({ m, t: 0 });
}

// Lens from the console, for tuning: MERAGHAR.lens(96) / MERAGHAR.lens(null).
function setLens(d) { CONFIG.player.lensDiag = d || null; applyLens(); }

const keyMap = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', ArrowUp: 'w', ArrowLeft: 'a', ArrowDown: 's', ArrowRight: 'd' };
addEventListener('keydown', (e) => {
  if (!ready) return;
  // Esc is the one key a popup answers to: it closes it, exactly like the
  // Close button — and only then does the next Esc get you out of a chair.
  // A screen with choices on it has no Close, so Esc does nothing there.
  if (blocked()) {
    // The art timeline and the map's envelope have no #story panel/close
    // button of their own to check storyClose.hidden against, so they're
    // asked directly.
    if (e.code === 'Escape' && (story.timelineOpen || story.letterOpen || story.vlogOpen || story.sunsetOpen || story.bookOpen || !ui.storyClose.hidden)) story.close();
    return;
  }
  if (e.code === 'KeyH') ui.debug.classList.toggle('show');
  if (e.code === 'KeyP') plant('star');
  if (e.code === 'KeyO') plant('easterEgg');
  // Esc backs out one layer at a time: the desktop's start menu, then its
  // open window, and only then out of the chair.
  if (e.code === 'Escape') { if (!desk.escape() && !seats.standUp() && !coffee.standUp()) oven.standUp(); return; }
  if (walker.seated) return;
  const k = keyMap[e.code];
  if (k) { walker.keys.add(k); walker.userLooking = true; lookHold = 1.0; story.cancel(); }
});
addEventListener('keyup', (e) => { const k = keyMap[e.code]; if (k && walker) walker.keys.delete(k); });

// ---------------------------------------------------------------------------
//  Planting — a debug tool, not part of the experience.
//
//  CONFIG.story's positions were being guessed and tuned blind from outside
//  the house, which is exactly why the last few passes kept missing (a
//  marker legible in a big room, invisible or mistimed in a small one).
//  Press P for a star or O for an easter egg, anywhere in the house (H shows
//  the readout that goes with it), to drop the *real* sparkle art, at real
//  size, exactly at your feet — so a spot is only ever picked while actually
//  standing in it and looking at it, never off a number. Each press:
//
//    1. Adds a permanent (session-only) preview marker to the scene, sized
//       and dimmed to match its kind (see sparkle sizing in story.js), so
//       you can walk around it, see it against the actual wall/lighting, and
//       decide right there whether the spot and height are right.
//    2. Prints a ready-to-paste CONFIG.story line to the browser console
//       (F12 → Console) with the position and type already filled in.
//    3. Adds a line to the H debug readout listing everything planted so far
//       this session, so a screenshot of that panel is enough to hand back
//       a whole batch of spots at once — no console needed if that's easier.
//
//  None of this is wired to rooms, discoveries, or collection — it's pure
//  placement scouting. Once a batch of spots is confirmed, they get copied
//  into CONFIG.story by hand (or handed back for that) with the real kicker/
//  lines text, same as any other entry there.
// ---------------------------------------------------------------------------
const planted = [];
const previewMarkers = [];
function plant(type) {
  const isEgg = type === 'easterEgg';
  const f = walker.feet;
  const pos = [f.x, f.y + 2.2, f.z].map((n) => Math.round(n * 100) / 100);
  const room = rooms.active?.def.id ?? '—';
  const kind = isEgg ? 'egg' : 'star';
  const id = `${kind}-${planted.filter((p) => p.kind === kind).length + 1}`;

  // Same size/tint convention story.js uses for the real thing, so the
  // preview is an honest preview, not just a placeholder dot.
  const preview = isEgg
    ? makeQuestionCoin(CONFIG.storyMarkers?.eggSize ?? 0.28)
    : makeGlassStar(CONFIG.storyMarkers?.starSize ?? 0.4, CONFIG.storyMarkers?.starTint ?? 0xffffff, { clear: true });
  preview.position.set(...pos);
  preview.material.opacity = 1;
  scene.add(preview);
  previewMarkers.push(preview);

  const line = `{ id: '${id}', type: '${type}', pos: [${pos.join(', ')}], kicker: '', lines: [''] },  // room: ${room}`;
  planted.push({ id, kind, pos, room, line });
  console.log('[plant]', line);
}

// ---------------------------------------------------------------------------
//  Desk prompts
// ---------------------------------------------------------------------------
const PROMPTS = {
  invite:  'Click the star to sit down',
  walking: '',
  sitting: '',
  seated:  'Alright. Time for the serious stuff. Click the power button.',
  booting: '',
  on:      'Click around the desktop',
};

// Prompts that are advice rather than an instruction fade out on their own.
const PROMPT_HOLD = { on: 6 };
let promptTimer = 0;

function onDeskState(state) {
  const text = PROMPTS[state] ?? '';
  ui.prompt.textContent = text;
  ui.prompt.classList.toggle('show', !!text);
  promptTimer = PROMPT_HOLD[state] ?? 0;
  const atDesk = state !== 'invite' && state !== 'walking';
  // The button is shared with seats.js, which relabels it, so set it back.
  if (atDesk) ui.standup.innerHTML = 'Stand up <span style="opacity:.5">Esc</span>';
  ui.standup.classList.toggle('show', atDesk);
  // The walking hint and the stand-up button share the bottom of the screen.
  if (atDesk) ui.hint.classList.remove('show');
  // The desktop is a screen inside a screen — the navbar steps aside for it.
  navbar?.setHidden(atDesk);

  if (state === 'seated') discoveries?.collect('desk:sit');
  if (state === 'on') discoveries?.collect('desk:on');
}

/**
 * Sofa / garden swing / rocking chair / bed. Unlike the desk there is no
 * invite and no click: walking up to one is the whole interaction, so all this
 * has to do is put the "Stand up" button on screen and say something once.
 */
function onSeatState(def, prev) {
  // Session 48: the TV (and the hall clock that runs with it) is only on
  // while you're on the sofa. Found the TV star already? Sitting back down
  // turns it on again; getting up — Esc, the button, a click, a map ride —
  // switches both off. (The first time, story.onReveal('tv') turns it on.)
  if (prev?.id === 'sofa' && def?.id !== 'sofa') { tv?.stop(); hallClock?.stop(); }
  if (def?.id === 'sofa' && story?.items?.find((x) => x.def.id === 'tv')?.found) {
    tv?.play(); hallClock?.play();
  }
  ui.standup.innerHTML =
    `${def?.standLabel ?? 'Stand up'} <span style="opacity:.5">Esc</span>`;
  ui.standup.classList.toggle('show', !!def);
  if (def) {
    ui.hint.classList.remove('show');
    if (def.prompt) showThought(def.prompt);
    // Ids that aren't on either list in config.js are ignored, so this costs
    // nothing until seats are worth counting.
    discoveries?.collect(`seat:${def.id}`);
    // Session 23: the bed → Mars hookup that used to live here is now the
    // general rule — any story entry with `seat: '<id>'` opens once you have
    // landed in that seat (story.js, updateApproach). Mars has `seat: 'bed'`.
  } else if (promptTimer > 0) {
    promptTimer = Math.min(promptTimer, 0.4);
  }
}

// The one button serves both: the desk chair first, then anything else you
// might be sitting on.
ui.standup.addEventListener('click', () => {
  if (!desk?.standUp() && !seats?.standUp() && !coffee?.standUp()) oven?.standUp();
});

// ---------------------------------------------------------------------------
//  Room label
// ---------------------------------------------------------------------------
let labelTimer = 0;
function showRoomLabel(def) {
  // The story ✨ only show themselves in the room they belong to, and this is
  // already the one place that knows which room that is.
  story?.setRoom(def?.id ?? null);
  // The garden is the one room with its own ambient bed (birds/outdoors) —
  // starts the moment you step in, stops the moment you leave. Everywhere
  // else stays as quiet as it was before this.
  if (def?.id === 'garden') startLoop('gardenAmbience'); else stopLoop('gardenAmbience');
  if (!def) { ui.room.classList.remove('show'); return; }
  ui.room.textContent = def.label;
  ui.room.classList.add('show');
  labelTimer = 2.6;
  // Walking into a room for the first time is a discovery in its own right.
  // Ids not on the list in config.js are ignored, so passing every room
  // through here costs nothing.
  discoveries?.collect(`room:${def.id}`);
  const line = { landing2: 'Halfway between making things and figuring things out.', landing3: 'Back to the serious stuff.' }[def.id];
  if (line) showThought(line);
}

function showThought(text, hold = 3.2) {
  ui.prompt.textContent = text;
  ui.prompt.classList.add('show');
  promptTimer = hold;
}

// ---------------------------------------------------------------------------
//  Loop
// ---------------------------------------------------------------------------
let last = performance.now();
let fps = 60, warmup = 3;

/** One simulation step. Split out from rendering so it can be driven
 *  deterministically from the console or a test:  MERAGHAR.step(1/60). */
function step(dt) {
  if (lookHold > 0) { lookHold -= dt; if (lookHold <= 0) walker.userLooking = false; }

  if (!walker.frozen) walker.update(dt);
  const doorsMoved = doors.update(walker.feet, dt);
  // One-shot night: starts when the TV star fires, lamp on and house dim,
  // and ends for good at the TV's 6 AM (tv.js latches `nightDone`).
  rooms.setLevel('tvNight', tv.nightLevel);
  rooms.update(walker.feet, dt);
  footsteps.update(dt);
  desk.update(dt);
  tv.update(dt);
  hallClock.update(dt);
  // Session 29: the mars easter egg plays through the non-blocking HUD now,
  // not the old modal (see story.js) — mars.js keys its ceiling animation
  // off story.hud instead of story.open/story.beat.
  // Session 34: the ceiling film runs on its own clock (started by the HUD,
  // ended by the film itself or by standing up from the bed).
  mars.sync(dt, story.hud?.def?.id === 'mars', seats?.active?.id === 'bed');
  // After rooms (bedroom fade) and mars (the Stars mesh's own fade).
  starLights.update(dt);
  musicDecor.update(dt);
  ipad?.update();
  coffee.update(dt);
  oven.update(dt);
  fridge?.update(dt, walker.feet);
  // After walker.update, which rewrites the camera transform every frame —
  // the swing and the rock are added on top of it.
  seats.update(dt);
  // Session 63: after the seats — the held book follows the swinging camera.
  const bookMoved = gardenBook?.update(dt) ?? false;
  butterfly?.update(dt);
  guide.update(dt);
  story.update(dt);
  finale?.update(dt);
  tutorial?.update(dt);
  navbar.update(dt);
  // Session 26: the porch intro is the last camera writer — it holds the
  // pulled-back porch shot, then eases back into the walker's view.
  intro?.update(dt);
  updateIndoor(walker.feet, dt);

  if (doorsMoved || bookMoved || warmup > 0) { renderer.shadowMap.needsUpdate = true; if (warmup > 0) warmup--; }

  // The floor reticle is an invitation to click somewhere. While a popup is
  // open there is nowhere to click, so it goes away.
  if (story.blocking || intro?.blocking) { marker.visible = false; itemLabels?.hide(); }
  itemLabels?.update();
  if (marker.visible) {
    const s = 1 + Math.sin(performance.now() * 0.004) * 0.06;
    marker.scale.setScalar(s);
  }
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i];
    f.t += dt;
    f.m.scale.setScalar(1 + f.t * 5);
    f.m.material.opacity = Math.max(0, 0.9 - f.t * 1.8);
    if (f.t > 0.6) { scene.remove(f.m); f.m.geometry.dispose(); f.m.material.dispose(); flashes.splice(i, 1); }
  }
  for (const p of previewMarkers) p.poseStar(camera, performance.now() / 1000, p.position.x);

  if (labelTimer > 0) { labelTimer -= dt; if (labelTimer <= 0) ui.room.classList.remove('show'); }
  if (promptTimer > 0) { promptTimer -= dt; if (promptTimer <= 0) ui.prompt.classList.remove('show'); }

  if (ui.debug.classList.contains('show')) {
    const f = walker.feet;
    let text =
      `x ${f.x.toFixed(2)}   y ${f.y.toFixed(2)}   z ${f.z.toFixed(2)}\n` +
      `room  ${rooms.active?.def.id ?? '—'}\n` +
      `yaw ${(walker.yaw * 180 / Math.PI).toFixed(0)}°   pitch ${(walker.pitch * 180 / Math.PI).toFixed(0)}°\n` +
      `desk  ${desk.state}   seat ${seats.active?.id ?? '—'}\n` +
      `doors ${doors.items.map((d) => (d.open ? '●' : '○')).join(' ')}\n` +
      `found ${discoveries.count}/${discoveries.total}\n` +
      `${fps.toFixed(0)} fps` +
      `\n\nP: plant a star here    O: plant an easter egg here`;
    if (planted.length) {
      text += `\n— planted this session (${planted.length}) —\n` +
        planted.map((p) => `${p.id}  [${p.pos.join(', ')}]  ${p.room}`).join('\n');
    }
    ui.debug.textContent = text;
  }
}

renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  fps += (1 / Math.max(dt, 1e-4) - fps) * 0.05;
  if (ready) step(dt);
  renderer.render(scene, camera);
});

// ---------------------------------------------------------------------------
//  MeraGHAR — walkthrough configuration
//  Everything you are likely to want to tweak lives in this file.
//  Coordinates are in Blender/GLB world units.  1 unit ~= 0.435 m
//  (a door leaf is 4.6 units tall = ~2 m), so:
//     ground floor walking surface  y = 0.0  (wooden strip y = 0.2)
//     second floor (studio)         y = 7.72
//     third floor  (bedroom)        y = 15.21
//  Press H in the browser to see your live coordinates + current room.
//
//  Re-measured 8 Sep 2026 against the updated MeraGHAR.blend — the staircase
//  now runs up the EAST side and both upstairs doors moved along BWall1
//  (studio door x -1.06..1.44, bedroom door x -13.68..-10.92).
// ---------------------------------------------------------------------------

export const CONFIG = {

  // Path to the exported model, relative to web/index.html.
  // It points one level up so that re-exporting MeraGHAR.glb from Blender
  // updates the site with no extra copying.
  MODEL_URL: '../MeraGHAR.glb',

  // Ambient music starts on the visitor's first click/tap/key press. Starting
  // it from a real interaction keeps it compatible with browser autoplay
  // policies while still making it feel like part of entering the house.
  //
  // Disabled for now (17 Sep 2026) — the placeholder track doesn't fit the
  // house; `startBackgroundMusic()` in main.js no-ops when `src` is empty.
  // Drop the real file's path back in here to turn it back on.
  backgroundMusic: {
    src: '../Sound%20Effect/Boy_Loop.ogg',
    volume: 0.015,   // 40% down from 0.04
  },

  // -------------------------------------------------------------------------
  //  One-shot interaction sounds (sfx.js), Apoorva's "Sound Effect" folder
  //  (18 Sep 2026) — one clip per object, named after what it's for. Every
  //  id below is read by exactly one call site; see that file for which.
  //  Empty/missing ids are silently ignored (same convention as
  //  `backgroundMusic.src` and `voice.src`), so nothing breaks if a clip is
  //  ever renamed or removed.
  //
  //  One clip is filed here but not wired to anything yet, because the
  //  interaction itself isn't built: `fridgeClose` (the fridge's "tug, it
  //  won't open" — story-todo.md). Drop the id into its call site once that
  //  exists.
  // -------------------------------------------------------------------------
  sfx: {
    doorBell:      { src: '../Sound%20Effect/door%20bell.mp3',      volume: 0.6 },
    doorOpen:      { src: '../Sound%20Effect/door%20opening.mp3',   volume: 0.6 },
    fridgeClose:   { src: '../Sound%20Effect/fridge%20close.mp3',   volume: 0.6 },   // not wired yet — fridge isn't built
    fridgeTumble:  { src: '../Sound%20Effect/fridge%20tumble.mp3',  volume: 0.8 },   // the fridge topples over (fridge.js) — impact lands 1.4 s in
    gardenGate:    { src: '../Sound%20Effect/garden%20arch%20gate.mp3', volume: 0.6 }, // the arch gate — see `gardenGate` and `doors` below
    gardenAmbience:{ src: '../Sound%20Effect/garden.mp3',           volume: 0.22 },
    mars:          { src: '../Sound%20Effect/mars.mp3',             volume: 0.7 },
    pop:           { src: '../Sound%20Effect/pop.mp3',              volume: 0.7 },
    star:          { src: '../Sound%20Effect/star.mp3',             volume: 0.7 },
    confetti:      { src: '../Sound%20Effect/confetti.mp3',         volume: 0.7 },   // the sign-off card (finale.js)
    deskChair:     { src: '../Sound%20Effect/desk%20chair.mp3',     volume: 0.6 },
    desktopOn:     { src: '../Sound%20Effect/desktop%20turning%20on.mp3', volume: 0.6 },
    rockingChair:  { src: '../Sound%20Effect/rocking%20chair.mp3',  volume: 0.35 },
    bed:           { src: '../Sound%20Effect/bed.mp3',              volume: 0.6 },
    oven:          { src: '../Sound%20Effect/oven.mp3',             volume: 0.7 },
    netflixTudum:  { src: '../Sound%20Effect/netflix-tudum.mp3',    volume: 0.7 },
    click:         { src: '../Sound%20Effect/click.mp3',            volume: 0.5 },
    portfolioClick:{ src: '../Sound%20Effect/portfolio%20click%20sound.mp3', volume: 0.5 },

    // 19 Sep 2026 — footsteps.js. No recordings for either yet, so both are
    // synthesized on the fly (footstep-synth.js) until real clips land here —
    // the moment a `src` is filled in, footsteps.js prefers it over the synth
    // automatically, no other change needed.
    footstep: { volume: 0.35, variants: [1, 2, 3, 4, 5].map((n) => `../Sound%20Effect/footstep%20floor%20${n}.mp3`) },
    footstepGrass: { src: '../Sound%20Effect/walking%20on%20grass.mp3', volume: 0.35 },   // 1s, played on every step in the garden

    // Porch intro text — both have their silences trimmed out.
    // One keystroke per character (typeTick in sfx.js), sliced from the typing recording.
    typewriterKey: { src: '../Sound%20Effect/keyboard%20typing.mp3', volume: 0.4 },   // looped while text types (typeTick in sfx.js)
    typewriterScroll: { src: '../Sound%20Effect/typing%20spacebar.mp3', volume: 0.5 },   // between verses
  },

  // -------------------------------------------------------------------------
  //  Footsteps (footsteps.js) — one cue per `stride` units of ground actually
  //  covered, not per real second, so the cadence holds whether the visitor
  //  is easing to a stop or striding across a big room. Swaps to the grass
  //  clip the instant `rooms.active` says the garden; every other room gets
  //  the plain one. Never plays while seated, mid-ride, or standing still.
  // -------------------------------------------------------------------------
  footsteps: {
    stride: 1.15,   // world units between each step sound
  },

  // -------------------------------------------------------------------------
  //  Player / camera
  //
  //  Looking around is now PURELY the mouse/finger: there is no auto-turn
  //  toward the walking direction, no automatic tilt on stairs, and no zoom
  //  at all. Drag as far as you like; the view goes exactly that far.
  // -------------------------------------------------------------------------
  player: {
    spawn:      [-27.0, 0.05, -23.25],  // on the front path, facing the door
    spawnYaw:   -Math.PI / 2,           // -90deg = looking east, at the house
    spawnPitch: -0.04,

    // Was 4.0 — Apoorva: the POV felt "a little above" eye level. Lowered
    // alone (18 Sep 2026); nothing else in this file changed this pass.
    eyeHeight:  3.4,    // ~1.48 m
    bodyTop:    4.35,   // top of the collision capsule
    radius:     0.85,   // how wide the visitor is
    stepUp:     2.6,    // max rise auto-climbed ON STAIRS (a riser here is ~2.2)
    stepSmall:  0.75,   // max rise anywhere else, so sofas and tables aren't climbable
    maxDrop:    3.7,    // bigger drops are refused - stops you falling off ledges

    walkSpeed:  5.2,    // units/sec (~2.2 m/s)
    accel:      22,     // how fast walk speed is reached
    arriveDist: 0.35,   // considered "arrived" this close to the target
    cornerDist: 0.55,   // ...and this close to an intermediate corner
    navCell:    0.7,    // walkable-map resolution; smaller = tighter routes, slower load
    slowRadius: 2.2,    // starts easing to a stop this far out

    heightSmooth: 9.0,  // lower = softer stair climbing, higher = snappier
    bobAmount:  0.075,  // head bob while walking
    bobSpeed:   9.5,

    // 0 = the camera NEVER turns itself. The direction you look is only ever
    // the direction you dragged it. (Was 1.6, which quietly pulled the view
    // back toward the walking direction and read as "the view has a range".)
    autoTurn:   0,

    // Likewise: no automatic downward tilt while climbing stairs.
    stairTilt:  0,

    lookSpeed:  0.0026, // drag sensitivity
    // Session 54: drag-to-look runs the opposite way to before — drag left
    // and the view turns right (like grabbing the world and pulling it).
    // Flip either back to false to restore the old direction on that axis.
    lookInvertX: true,
    lookInvertY: true,
    // Just under vertical. Straight up and straight down both work; the only
    // thing prevented is tipping over the top, which would invert the world.
    pitchLimit: Math.PI / 2 - 0.02,
    fov:        62,     // fixed — zoom is gone entirely (used when lensDiag is null)

    // Lens, measured corner to corner like a phone camera's; replaces `fov`
    // when set (null = the old fixed vertical 62). 96 ≈ a phone's 0.75x
    // (19.5mm equiv) — Apoorva's pick, 19 Sep 2026. Same lens on every screen
    // shape: ~57° tall × ~88° wide on a 16:9 laptop (was 62° × 94°, i.e. a
    // touch tighter now), ~90° tall × ~50° wide on a phone held upright (was
    // 62° × 31°). Rough scale: 80 = 1x, 101 = the old laptop view, 120 = 0.5x.
    lensDiag:   96,

    enableKeyboard: true, // optional WASD / arrows, never required
  },

  // -------------------------------------------------------------------------
  //  Doors — swing open when the visitor comes near, close behind them.
  //
  //  hingeAxis : 'x' for a door whose leaf is thin along X (it lives in a
  //              north/south wall and hinges on a Z edge), 'z' for the reverse.
  //  hingeAt   : 'min' | 'max' — which edge of the leaf the hinges are on.
  //  openAngle : rotation in radians. FLIP THE SIGN if a door swings the
  //              wrong way — that is the only thing you should need to change.
  //  trigger   : box the visitor has to enter for the door to open.
  // -------------------------------------------------------------------------
  doors: [
    {
      // The front door. Swings out over the porch.
      //
      // Two leaves used to share this doorway: `Door` (which sits exactly
      // in the hole cut through `Wall.001`) and `ExteriorDoor_Hall` (which
      // floats ~0.8 units west of the wall's outer face, never actually in
      // the opening — see "Session 6b" in the project doc for the
      // glb-measured proof). Apoorva decided one front door reads better
      // than a front-door + storm-door pair, so `ExteriorDoor_Hall` is now
      // hidden (see `hide` below) and `Door` — the leaf that actually fills
      // the wall opening — is the one that swings.
      name: 'Door',
      hingeAxis: 'x', hingeAt: 'min', openAngle: -Math.PI / 2,
      // Session 47: manual, like every other door now. Its old proximity
      // trigger box (x -32..-13, z -28..-18.5) reached well into the hall, so
      // just walking hall -> kitchen along the west side swung the front door
      // open. Apoorva: doors respond to clicks only, never to distance. The
      // porch intro opens it on the hire/explore choice (main.js) — that is a
      // click too — and otherwise a label appears when you're near and you
      // click it open. It stays open.
      // Session 49: no floating "Open the door" label on this one (Apoorva) —
      // it has no `near` box, so guide.js never shows a tag for it. Clicking
      // the leaf itself still opens it.
      manual: true,
      // Session 57: and it swings shut behind you once you're in. This box is
      // the ground floor indoors, starting a couple of units past the front
      // wall (Wall.001's inside face is x ≈ -17.41) so you're clear of the
      // leaf's swing before it moves. Click it to open it again.
      closeInside: { x: [-15.4, 2.9], y: [-2, 5.5], z: [-35.7, 0.7] },
      // The leaf sits a hair short of the frame opening on its free (latch)
      // edge — visible in-browser as a thin sliver of the frame/outside
      // showing through, worst when backlit. Stretches the leaf 8% wider,
      // anchored at the hinge (doors.js), to close it.
      widen: 1.08,
      // No doorbell here — it's played once by main.js when the intro zooms in.
    },
    {
      // 1st floor: stair landing -> art / music studio. At the EAST end of
      // BWall1, straight off the top of the first flight.
      // `manual` = this one does NOT open as you approach. A label appears on
      // it and the visitor clicks it open; it then stays open.
      name: 'Door.001', manual: true,
      hingeAxis: 'z', hingeAt: 'max', openAngle: Math.PI / 2,
      // Session 27: the caution sign + tape Apoorva put on the landing face
      // of this door in MeraGHAR.blend. Separate objects in the .glb, so
      // they're carried on the door's pivot (doors.js) and swing with it.
      attach: ['Caution sign', 'Caution tape'],
      label: 'Open the door',
      near: { x: [-6.0, 5.0], y: [6.0, 13.2], z: [-20.0, -12.0] },
    },
    {
      // 2nd floor: stair landing -> bedroom, at the WEST end of BWall1.
      name: 'Door.002', manual: true,
      hingeAxis: 'z', hingeAt: 'max', openAngle: Math.PI / 2,
      label: 'Open the door',
      near: { x: [-18.0, -7.0], y: [13.5, 21.0], z: [-20.0, -12.0] },
    },
    // The two leaves of the garden gate, carved out of the `Arch` mesh at
    // load by garden-gate.js (see `gardenGate` below). Automatic, like the
    // front door: they swing away from you as you come up to the arch and
    // fall shut again behind you, from either side. Both leaves open into
    // the garden (-z) so nothing swings back into the archway itself.
    {
      name: 'GardenGate_L',
      hingeAxis: 'z', hingeAt: 'min', openAngle: Math.PI * 0.47,
      // Session 47: click-to-open like every door (was a proximity trigger,
      // x -5.5..1.5, z -40..-32). `group` makes a click on either leaf open
      // both (doors.js). Picking the garden off the map opens it too.
      manual: true, group: 'gardenGate',
      label: 'Open the gate',
      near: { x: [-5.5, 1.5], y: [-2, 6], z: [-40.0, -32.0] },
      sfx: 'gardenGate',
    },
    {
      name: 'GardenGate_R',
      hingeAxis: 'z', hingeAt: 'max', openAngle: -Math.PI * 0.47,
      manual: true, group: 'gardenGate',
      label: 'Open the gate',
      near: { x: [-5.5, 1.5], y: [-2, 6], z: [-40.0, -32.0] },
      // Both leaves move together, so only the left one is allowed to make a
      // noise — otherwise the clip plays twice over itself. `false` isn't
      // nullish, so it passes the `??` below and playSfx ignores it.
      sfx: false,
    },
  ],
  // Doors without their own `sfx` above play `CONFIG.sfx.doorOpen` — see
  // doors.js's `update()`, where the sound fires on the open transition.

  doorSpeed: 3.2,      // how fast doors swing (higher = faster)

  // -------------------------------------------------------------------------
  //  The garden gate — how garden-gate.js finds it inside the arch.
  //
  //  `Arch` is one welded mesh: posts, curved head, and a two-leaf picket
  //  gate filling the opening. `box` is the world-space volume that holds the
  //  gate and nothing else — between the inside faces of the two posts
  //  (x -3.66 … -0.32), below the top of the pickets, and on the garden face
  //  of the arch, where the gate hangs in line with the fence. Every triangle
  //  whose centre lands in there becomes gate; `splitX` (the middle of the
  //  opening) decides which leaf. Everything else stays arch.
  //
  //  Measured off MeraGHAR.glb — if the arch is ever moved or rebuilt in
  //  Blender, these are the six numbers to re-measure.
  // -------------------------------------------------------------------------
  gardenGate: {
    mesh:   'Arch',
    box:    { x: [-3.62, -0.36], y: [-2, 2.45], z: [-36.80, -35.95] },
    splitX: -1.98,
    leaves: ['GardenGate_L', 'GardenGate_R'],   // must match the `doors` entries
  },

  // -------------------------------------------------------------------------
  //  Stairs — the "take me up" shortcut.
  //
  //  Climbing three flights a click at a time is hard work, so standing near
  //  the foot of the stairs offers the two places worth going instead. Picking
  //  one walks the visitor up for them — it is the same route the walkable map
  //  would have taken, just driven automatically and a bit quicker — and drops
  //  them on the landing facing the closed door.
  // -------------------------------------------------------------------------
  stairsGuide: {
    // Standing anywhere in here offers the choice.
    foot: { x: [-3.4, 3.4], y: [-2, 3.4], z: [-30.0, -23.6] },

    rideSpeed: 11,     // units/sec while the camera is being carried up
    // Session 47: the "Hire me" ride from the porch to the bedroom desk is
    // a bit quicker than a normal ride — recruiters are here for the desk.
    hireSpeed: 15,
    // In the last this-many units of a ride that ends looking at something
    // (the door on a landing, the desk star in the bedroom), the view stops
    // following the route and turns to that target instead — so you arrive
    // already looking at it rather than swinging round the landing and then
    // snapping to it (guide.js).
    arriveFaceDist: 5.0,

    // Walking into `foot` (above) turns the view to face up the first flight,
    // so the stairs are square in front of you before the chooser is even
    // read. The flight climbs northward (+z), hence yaw = PI; pitch is a
    // whisker up so the treads lead the eye rather than filling the frame.
    // Set to null to leave the visitor's view alone on approach.
    footFace: { yaw: Math.PI, pitch: 0.06, seconds: 1.1 },

    // Destination keys offered by the chooser at the foot of the stairs.
    // `ground` is deliberately left out here — see groundDest below, which
    // drives the separate "go down" buttons instead.
    footMenu: ['studio', 'work'],

    destinations: [
      {
        key: 'studio',
        label: 'Studio',
        sub: '1st floor',
        // On Platform1, facing the studio door.
        point: [0.0, 7.92, -16.30],
        door: 'Door.001',
      },
      {
        key: 'work',
        label: 'Work life',
        sub: '2nd floor',
        // On Platform2, facing the bedroom door. Session 78: was z -17.00,
        // which is now inside the landing railing's north run
        // (Landing_Railing, z -17.25..-16.84) — moved onto the open landing.
        point: [-12.60, 15.18, -15.40],
        door: 'Door.002',
      },
    ],

    // ---- the view during the ride ----------------------------------------
    // The camera used to keep whatever direction the visitor happened to be
    // facing when they picked a floor — pick "Studio" while looking at a wall
    // and you were carried up the stairs still looking at that wall. Now the
    // view is steered along the route for the whole ride: it turns to face
    // the flight as it starts, follows it round the half-landing, and only
    // lets go when the visitor drags for themselves.
    rideLookAhead: 3.2,   // aim this far ahead along the route (world units)
    rideTurn:      6.0,   // how hard the yaw is pulled toward that aim
    ridePitch:     0.0,   // and the pitch levelled off toward this
    ridePitchEase: 2.2,

    // While the visitor is on the 1st floor landing — but not once they've
    // stepped into the studio itself, see guide.js — this sits on the right
    // of the screen so the 2nd floor is one click away. fromLevel is just
    // the Y gate; the studio-exclusion is a room-bounds check in guide.js
    // since the studio shares this Y range with the landing.
    // Not in the chooser: the foot of the stairs, for the "go down" buttons.
    // `snap` stops at the last walkable node rather than the raw point.
    groundDest: { key: 'ground', label: 'Ground floor', sub: 'Down', point: [0.0, 0.05, -26.5], snap: true },

    // The same right-hand stack on every landing, so the buttons never move
    // around. `level` is the Y gate, `except` the room (sharing that Y range)
    // where it hides, i.e. once you have stepped through the door.
    floorOpts: [
      // Session 59: `door` is the landing's own door. Arriving on a landing
      // (ridden up, or walked up the stairs) keeps the stack hidden while
      // you face that door; it shows once you turn away from it, or when
      // you come back out through it. See guide.js `landingQuiet`.
      { level: [5.0, 12.9],  except: 'studio', door: 'Door.001',
        buttons: [
          { to: 'work',   label: 'Go up to the 2nd floor' },
          { to: 'ground', label: 'Go down to the ground floor' },
        ] },
      { level: [12.9, 26.0], except: 'bedroom', door: 'Door.002',
        buttons: [
          { to: 'studio', label: 'Go down to the 1st floor' },
          { to: 'ground', label: 'Go down to the ground floor' },
        ] },
    ],

    // How close (and how much in front of you) a manual door has to be for its
    // label to appear.
    labelRange: 15,
  },

  // -------------------------------------------------------------------------
  //  Rooms — the first room whose box contains the visitor's feet wins.
  //  Rooms only drive the name that fades in at the top of the screen, plus
  //  whichever of `lights` / `emissive` / `ambientScale` a room defines.
  //  Every room still defaults to the flat, evenly-lit look (see `world`
  //  below) — lighting is being brought in one room at a time, starting
  //  with the studio (22 Sep 2026: neon sign is that room's light source).
  // -------------------------------------------------------------------------
  rooms: [
    { id: 'porch',   label: 'The porch',
      bounds: { x: [-24.0, -18.55], y: [-2, 5.5], z: [-26.2, -20.4] },
      lights: [], emissive: [] },

    { id: 'living',  label: 'Living room',
      bounds: { x: [-18.4, 2.9], y: [-2, 5.5], z: [-35.7, -21.9] },
      lights: [], emissive: [] },

    { id: 'hall',    label: 'Hall',
      bounds: { x: [-18.4, 2.9], y: [-2, 5.5], z: [-21.9, -14.6] },
      lights: [], emissive: [] },

    { id: 'kitchen', label: 'Kitchen',
      bounds: { x: [-18.4, 2.9], y: [-2, 5.5], z: [-14.6, 0.7] },
      lights: [], emissive: [] },

    { id: 'garden',  label: 'The garden',
      bounds: { x: [-19.8, 4.9], y: [-2, 6], z: [-50.6, -35.7] },
      lights: [], emissive: [] },

    { id: 'landing2', label: 'Landing',
      bounds: { x: [-18.4, 2.9], y: [5.0, 12.9], z: [-22.0, -13.42] },
      lights: [], emissive: [] },

    // The neon sign (`NeonSign_Text`, Neon_Pink/Neon_Cyan materials, world
    // x -14.86..-1.62, y 12.50..13.95, z -0.59..-0.41 — flush on the south
    // wall) is already self-lit in the GLB itself (KHR_materials_emissive_
    // strength = 8 on both materials, which GLTFLoader maps straight to
    // emissiveIntensity), so the sign glowing is free. What was missing is
    // the sign actually LIGHTING the room: emissive materials don't cast
    // light onto anything else in three.js, so these two PointLights (one
    // per neon colour, matched to the materials' own emissiveFactor, pulled
    // ~4 units off the wall into the room, and ~2 below the sign — at the
    // sign's own height they only made hot spots on the ceiling, seen in the
    // first headless render 23 Sep) are what make it read as the
    // room's light source. `ambientScale` dims the flat hemi/ambient fill
    // to 16% while inside the studio so the neon glow is what's actually
    // doing the lighting rather than just sitting on top of a lit room —
    // first-pass numbers, eyeball and nudge in the browser.
    { id: 'studio',  label: 'Art & music studio',
      bounds: { x: [-18.4, 2.9], y: [5.0, 12.9], z: [-13.42, 0.7] },
      // Session 47: brighter — Apoorva wanted the neon colour to actually
      // wash the room. Was intensity 12 / distance 22 / ambientScale 0.16.
      ambientScale: 0.2,
      lights: [
        { color: 0xff076f, pos: [-4.0, 11.2, -4.2], intensity: 22, distance: 28 },  // Neon_Pink
        { color: 0x0dafff, pos: [-12.4, 11.2, -4.2], intensity: 22, distance: 28 }, // Neon_Cyan
      ],
      emissive: [] },

    { id: 'landing3', label: 'Landing',
      bounds: { x: [-18.4, 2.9], y: [12.9, 26], z: [-22.0, -13.42] },
      lights: [], emissive: [] },

    // Bedroom (23 Sep 2026): lit by the bedside lamp and the star curtain
    // above the bed — every one of those stars is its own light (see
    // `starLights` below; they aren't three.js PointLights, so they don't
    // appear here). The one real PointLight is the lamp: its bulb sits inside
    // the shade of `Lamp` (world x -11.9..-11.2, shade y 17.62..18.52, z
    // -1.42..-0.72, on the SideTable left of the bed). The shade's glow is
    // star-lights.js's job too, so `emissive` stays empty — rooms.js would
    // light the whole lamp, base included.
    { id: 'bedroom', label: 'Bedroom',
      bounds: { x: [-18.4, 2.9], y: [12.9, 26], z: [-13.42, 0.7] },
      ambientScale: 0.24,
      lights: [
        { color: 0xffb46b, pos: [-11.55, 18.0, -1.07], intensity: 6, distance: 12 },  // bedside lamp bulb
      ],
      emissive: [] },

    // The living room's floor lamp (`Lamp.001`, standing by the sofa — bbox
    // x -9.20..-3.60, y -0.13..6.64, z -35.31..-32.15) doubles as the "it's
    // late" cue for the TV: not tied to walking into a box like every room
    // above, but to how far into the TV's own night the visitor has watched
    // (tv.js's `nightLevel`, 1 through the small hours, easing to 0 right at
    // its 6 AM card). `forced: true` tells rooms.js to skip the position
    // check and take its level from `rooms.setLevel('tvNight', …)` instead
    // (main.js, right before rooms.update()). ambientScale dims the whole
    // house's flat fill along with it, so the lamp reads as the one thing
    // still lighting the room rather than sitting on top of a bright one.
    { id: 'tvNight', label: '', forced: true,
      bounds: { x: [0, 0], y: [0, 0], z: [0, 0] },
      ambientScale: 0.12,
      lights: [
        // A spotlight, not a point light: pours down from the lamp's shade
        // and pools on the sofa (cushion top y 1.70, near box centred
        // roughly [-10.7, -29.0] — see CONFIG.seats.sofa) rather than
        // washing the whole room evenly, so it reads as *that* lamp lighting
        // *that* seat.
        { color: 0xffb46b, pos: [-6.32, 6.1, -33.65], target: [-10.2, 1.6, -29.3],
          intensity: 22, distance: 18, angle: 0.55, penumbra: 0.55, decay: 2 },
      ],
      emissive: ['Lamp.001'] },
  ],

  lightFade: 2.2,        // room lights fade in/out this fast

  // Meshes that glow whether or not you are in the room.
  alwaysEmissive: [],

  // -------------------------------------------------------------------------
  //  Bedroom star curtain (star-lights.js) — 23 Sep 2026.
  //
  //  `Stars` is ONE merged mesh: 8 strings hanging off the south wall above
  //  the bed (x -11.02..-4.87, y 19.58..24.49, ~1 unit in front of the wall's
  //  inner face at z -0.32), 37 little stars threaded on them. star-lights.js
  //  finds each star in that mesh at load (so it survives the strings being
  //  moved or re-strung in Blender) and makes every one an actual light: it
  //  lights the wall, ceiling, bed and floor from its own position, glows,
  //  and twinkles on its own clock, so the pools on the wall breathe star by
  //  star.
  //
  //  Why not 37 three.js PointLights: three runs every point light's full
  //  PBR maths for every pixel of every surface in the house, in every room,
  //  and 37 of them busts phones' shader uniform limits outright (mobile is a
  //  hard requirement). These are a cheap diffuse-only light loop patched
  //  into the house's own materials, switched off entirely outside the
  //  bedroom, and clipped to `box` so they never leak through the floor into
  //  the studio or out onto the landing.
  // -------------------------------------------------------------------------
  starLights: {
    room: 'bedroom',
    mesh: 'Stars',
    color: 0xffc98a,      // warm fairy-light gold (the stars' own texture is 255,204,128)
    intensity: 2.8,       // per star, same units as a three.js PointLight
    soft: 1.4,            // softens the hot spot right behind each star (d² + soft)
    range: 20,            // each star's light fades to nothing by this distance
    twinkle: 0.3,         // 0 = steady; 0.3 = each star dips to 70% on its own slow clock
    glow: 1.1,            // how bright each star's own body glows (past ~1.5 they wash out to white)
    halo: { size: 0.7, strength: 0.45 },   // soft bloom sprite around each star
    // Where the star light is allowed to land (world units, soft 0.3 edge):
    // the bedroom from just under its floor to just over its ceiling.
    box: { x: [-18.6, 3.2], y: [14.9, 25.6], z: [-13.45, 0.8] },
    // The bedside lamp's shade + bulb glow (its light is the PointLight in
    // the bedroom room entry above). `shadeFrom` = fraction of the lamp's
    // height where the glow starts — measured off the mesh: base 0..0.14,
    // shade from 0.36.
    lamp: { mesh: 'Lamp', shadeFrom: 0.3, glow: 1.4 },
  },

  // -------------------------------------------------------------------------
  //  The bedroom desk — the "sit down and open the portfolio" interaction.
  //
  //  The chair waits at `inviteAngle` (turned toward whoever just came
  //  through the bedroom door) with a star hovering over the seat. Click the
  //  star: you walk to `standPoint`, the view drops into the chair, the chair
  //  swings straight, and you are looking at the desk. The power button on
  //  the front of the tower then wakes the machine up.
  // -------------------------------------------------------------------------
  desk: {
    chairParts:  ['Chair', 'ChairWheels'],
    inviteAngle: -15 * Math.PI / 180,   // "pulled out, waiting for you"
    swingSpeed:  2.4,                   // how fast it straightens as you sit

    // Marker over the seat. Still 0.62 — the pre-Session-9 size — because it
    // was never touched by the contrast pass on story.js's markers. Bumped to
    // 0.9 so it reads at the same strength as the rest of the house; it's
    // viewed close-up from the doorway so it doesn't need 1.3.
    // Session 23: clear glass and small, like every other star now.
    star:        { pos: [-14.13, 18.75, -5.70], size: 0.46, color: 0xffd9a0 },   // same candle tint as the story stars

    // Where the visitor stands before dropping into the chair.
    standPoint:  [-14.10, 15.21, -8.80],

    // Seated eye position + the direction it faces (straight at the monitor).
    // Sitting back in the chair rather than nose-to-glass: the monitor is
    // 2.0 units wide and this leaves it filling a comfortable slice of the view.
    seat:        { eye: [-13.35, 19.05, -5.92], yaw: Math.PI / 2, pitch: 0.02 },
    sitSpeed:    1.5,                   // seconds-ish for the whole sit-down

    // Leaning in to the monitor once it's powered on (desk.js's `lean()` /
    // `screenEye()`) and back out again on power-off / standing up.
    leanSpeed:   1.8,                   // seconds-ish for the lean-in transition
    leanMin:     0.5,                   // never lean closer than this, whatever the math says
    // Fraction of the view the screen should fill once leaned in — not 1.0,
    // so there's a little breathing room and the whole glass stays in frame
    // on any aspect ratio.
    screenFill:  { width: 0.92, height: 0.92 },
    // Emissive strength of the screen once it's lit — the canvas draws as
    // pure emission (see desk.js's `screenLit()`), so this is what makes the
    // desktop actually visible rather than reading as a dark, undriven panel.
    screenGlow:  1.15,

    // Objects split out of the desktop mesh in Blender this session.
    screenMesh:  'Monitor_Screen',      // was a green plane; now black when idle
    powerMesh:   'Power_Button',        // small pad on the front of the tower
    powerHalo:   { radius: 0.30, color: 0xffb347 },
  },

  // -------------------------------------------------------------------------
  //  The living-room TV — Session 18: the "one more episode" screen (tv.js).
  //
  //  Unlike the desk (Session 3 split `Monitor_Screen` out of the desktop
  //  mesh in Blender), the `TV` node in MeraGHAR.glb is still one solid
  //  voxel object — single material, no separate screen face — because the
  //  Blender face-separation story-todo.md asks for hasn't happened yet
  //  (Blender's MCP server wasn't reachable this session either). Rather
  //  than block on that, the screen is a SEPARATE overlay plane, sized and
  //  positioned from measurements instead of split out of the mesh:
  //
  //    `TV` mesh world bounds, parsed straight from MeraGHAR.glb: x
  //    -16.73…-15.84, y 2.13…5.31, z -31.21…-26.43.
  //
  //    The screen rectangle inside that box came from
  //    `TV screen design request/uploads/TV.obj` — the original MagicaVoxel
  //    export of this same model, from before Blender's Z-up→Y-up
  //    conversion, which still keeps the screen as its own flat quad (a
  //    second palette color — the only two-color region in the file).
  //    Converting that quad's fraction of the model's local bounding box
  //    into world space gives the numbers below. Two things back this up:
  //    the derived rectangle comes out at ~1.67:1 (a real TV is 16:9 ≈
  //    1.78:1), and the room is east of the TV (the sofa's `seats[]` entry
  //    looks west at it from x -8.9), which is why the screen sits at the
  //    mesh's max-x edge with its normal on +X.
  //
  //  NOT visually verified in a running browser — nudge these (or flipX) if
  //  the screen doesn't sit flush against the bezel once you load the app.
  // -------------------------------------------------------------------------
  tv: {
    screen: {
      // Depth. The `TV` mesh occupies x -16.73…-15.84 (parsed off the .glb),
      // and it is one solid voxel block — it never got split in Blender, so
      // there is no recessed screen face to sit inside of (see tv.js's
      // header). The face that looks at the room is its MAX x, -15.84, so
      // the overlay has to sit just in front of that. It was -16.15 up to
      // 18 Sep 2026, which is 0.3 units INSIDE the block: the screen was
      // being drawn every frame, correctly, entirely hidden by the TV's own
      // front face. That is why the TV looked dead.
      x: -15.80,
      yMin: 2.48, yMax: 5.14,  // height range (bottom bezel reads thicker than top)
      zMin: -31.03, zMax: -26.60,
      flipX: false,             // flip if the image reads mirrored from the room
    },
    canvas: { width: 1200, height: 717 },   // ~16:9, matches the screen rect above
    showName: 'COASTLINE',
    accent: '#e8b464',
  },

  // -------------------------------------------------------------------------
  //  The hall's `Clock.001` — Session 31: a second, bigger read of the TV's
  //  own rolling clock (tv.js), so it's visible "on the side" while watching
  //  rather than only in the TV's small corner. Same trick as CONFIG.tv:
  //  `Clock.001` is one merged voxel mesh (334 polys, single `palette.030`
  //  material, its "12:38" digits carved as real relief geometry, not a
  //  texture) — no clean UVs to draw on, so this is a separate overlay plane
  //  sat just in front of the carved face, not a texture on the mesh itself.
  //  The old carved digits stay under it, permanently hidden once the
  //  overlay switches on (see clock.js's play()).
  //
  //  Numbers below came from Blender directly (get_object_detail_summary +
  //  a per-polygon normal/area pass on Clock.001, object at Blender xyz
  //  [-16.243, 33.399, 4.071], scale 0.6366, rotation zero): 268 of its 334
  //  faces share one normal, (+1,0,0) in Blender-X — that's the carved
  //  display face, at Blender x -15.925 (the mesh's max-x edge), spanning
  //  Blender y 32.444…34.354 and z 4.071…4.899. Converted through Blender's
  //  standard export axis swap (glTF/three x=Blender x, y=Blender z,
  //  z=-Blender y — the same swap noted in CONFIG.tv's own derivation):
  //  face x -15.925, y 4.071…4.899, z -34.354…-32.444, normal +X — which is
  //  why this uses the exact same `rotation.y = Math.PI/2` the TV screen
  //  does. x below is nudged +0.03 out from the face, same "just in front,
  //  not inside" reasoning as CONFIG.tv.screen.x.
  //
  //  NOT visually verified in a running browser — nudge x/flipX if the
  //  overlay doesn't sit flush, or reads mirrored.
  // -------------------------------------------------------------------------
  clock: {
    screen: {
      x: -15.895,
      yMin: 4.071, yMax: 4.899,
      zMin: -34.354, zMax: -32.444,
      flipX: false,
    },
    canvas: { width: 960, height: 416 },   // matches the face's ~2.31:1 aspect
  },

  // -------------------------------------------------------------------------
  //  Two poster/label planes (signs.js) — Session 34. Plain rectangles, same
  //  canvas-texture-overlay trick as CONFIG.tv/CONFIG.clock, but static (no
  //  play()/sync(), just drawn once).
  //
  //  NOT visually verified in a running browser yet — nudge x/flipX on
  //  either one if it sits inside the wall/door, floats off it, or the text
  //  reads mirrored (see signs.js header for which way each is meant to face).
  // -------------------------------------------------------------------------
  signs: {
    // "High creativity zone ahead" — Door.001's landing face (measured off
    // the same Door.001 the caution sign/tape ride: x -1.057…1.443,
    // z -13.642…-13.242 in this game's axes — see session-27-cleanup.md).
    // Landing is the more-negative-z side (stairsGuide's studio point is at
    // z -16.30), so the poster sits just proud of the leaf's min-z face.
    // Centered under the caution tape (y 11.41…12.00) with clearance, well
    // above the door's own bottom (y 7.66) — a comfortable read height.
    studioDoor: {
      // Session 71: Apoorva's own poster art replaces the text card. Sits
      // right under the Caution sign (x -0.24…0.608, bottom y 10.766),
      // centred on it, A4-landscape (1587/2245). z is just proud of the
      // leaf's landing face (z -13.442; the old -13.66 floated off it — that
      // was the handle's depth). Bottom kept above the handle (y 9.66…9.76,
      // x -0.76…-0.36, sticking out to z -13.642) so it never pokes through.
      name: 'Poster_HighCreativityZone',
      image: 'src/assets/signs/creativity-zone.jpg',
      x: 0.184, z: -13.462,
      // Session 78: a new, wider banner (2245x907 = 2.475:1). Height is
      // yMax-yMin, so it is worked out from the width to keep the art
      // undistorted: 1.5 x 0.606. Top edge stays where it was, under the
      // Caution sign; x -0.566…0.934 sits well inside the leaf (-1.057…1.443).
      yMin: 10.094, yMax: 10.70,
      width: 1.5,
      flipX: false,
    },
    // "Coffee corner" — the kitchen's west wall (Wall.001; its room-facing
    // edge measured at x ≈ -17.413), above the coffee table (CONFIG.coffee.
    // table — table top y 3.34, z -15.3…-10.95) and below the floor of the
    // room above (Floor.003, min y ≈ 7.27), clear of the mugs/moka pot (their
    // tallest point, the Moka Lid, ≈ y 4.83). Session 71: Apoorva's own
    // poster art, widened to its A4-landscape shape (nothing else on that
    // stretch of wall — re-checked off MeraGHAR.glb).
    // Session 73: lowered 0.38 ("place it a lil below"), which also brings
    // its bottom edge into the lean-in view (that view's top edge meets the
    // wall at about y 5.0).
    coffeeWall: {
      name: 'Poster_HomeCoffeeSetup',
      image: 'src/assets/signs/coffee-corner.jpg',
      x: -17.38,
      zMin: -14.045, zMax: -12.205,
      yMin: 4.62, yMax: 5.92,
      flipX: false,
    },
    // Session 73: the recipe card right under it — shows the CURRENT step of
    // CONFIG.coffee.steps only (coffee.js moves it on). Sized to the
    // poster's width; sits in the strip of wall that's visible from the
    // lean-in view over the pot/frother (they hide the wall below ~y 3.5).
    coffeeSteps: {
      name: 'CoffeeSteps_Card',
      x: -17.38,
      zMin: -14.045, zMax: -12.205,
      yMin: 3.92, yMax: 4.56,
      bg: '#f4e4c6', ink: '#4a2c1a', accent: '#c8743a',
      doneKicker: 'ENJOY',
      canvas: { width: 1200 },
    },
  },

  // -------------------------------------------------------------------------
  //  Seats — furniture that seats you just for walking up to it (seats.js).
  //
  //  The desk chair proved the feeling; these give the rest of the house the
  //  same thing with no star and no click. Walk into a seat's `near` box and
  //  the view eases into `eye`, facing `yaw`/`pitch`. Getting up puts you back
  //  on your feet exactly where you were standing, and the seat will not grab
  //  you again until you have walked out of its box.
  //
  //  All coordinates measured off MeraGHAR.glb (upward faces of each mesh):
  //    Sofa          cushion top y 1.70, back along its east edge (x ~ -7),
  //                  so it faces west, at the TV on the far wall.
  //    Chair.001     the garden hanging chair, seat top y 2.00, opening west
  //                  toward the little table with the book and the coffee.
  //    Rocking chair studio, seat top y 9.46 (Session 63, was 9.80), back at its south edge, facing
  //                  north at the art table.
  //    Bed           mattress top y 16.90, headboard at the north end (z ~ -0.5),
  //                  and the `Stars` mesh hangs at y 19.6-24.5 right above it —
  //                  which is why lying down looks up and slightly north.
  //
  //  Tuning: press H for the live x/y/z readout, stand where you want the
  //  sitter's body to be, and read the numbers off. `eye` is roughly the seat
  //  surface + 1.7 (a seated head), or + 1.4 for lying down.
  //
  //  yaw: -PI/2 looks east, +PI/2 west, 0 south (-z), PI north (+z).
  // -------------------------------------------------------------------------
  seats: [
    {
      id: 'sofa', label: 'the sofa',
      // Session 17: the west edge was -15.0, and that turned out to be the
      // exact problem the note here warned about. The TV and the world map
      // hang on the west wall (x ≈ -16); the only floor in front of them is
      // the strip between the TV table (ends x -15.41) and the sofa (starts
      // x -12.53) — and the old box covered all of it, so you were seated
      // before you could ever walk into the TV or map star. Pulled back to
      // -13.4 (the sofa's face plus the walker radius), which is the number
      // this comment already proposed. The sofa still catches you when you
      // actually walk up to it; the TV wall is now yours to reach.
      near:  { x: [-13.4, -8.0], y: [-1.0, 3.5], z: [-33.5, -24.5] },
      eye:   [-8.90, 3.50, -29.30],
      yaw:   Math.PI / 2,        // west, at the TV
      // Session 23: tipped up a touch (was -0.03) so the world map above
      // the TV is in the same shot — its star is tappable from here.
      pitch: 0.08,
      // Session 23: where a tapped star walks you to reach this seat (the
      // floor strip in front of it, as close as the walker's radius allows).
      approach: [-13.30, 0.05, -29.30],
      // Session 48: getting up lands you on the open floor just north of
      // the sofa (Sofa mesh z max -25.29), not back on `approach` — that is
      // the strip right under the TV, which read as "far too zoomed in"
      // after Esc'ing out of the TV star. Facing roughly back at the TV.
      standAt: [-9.00, 0.05, -23.60],
      standYaw: 1.0,
      // Session 48: clicking any of these sits you down (seats.js request()).
      meshes: ['Sofa', 'LeafPillow', 'Pillow.001'],
      sitSpeed: 1.5,
      prompt: 'Sit for a bit. The TV works.',
      standLabel: 'Stand up',
    },
    {
      id: 'orb', label: 'the hanging chair',
      near:  { x: [-6.0, 1.0], y: [-1.0, 3.5], z: [-48.0, -41.5] },
      eye:   [-2.55, 3.80, -44.35],
      approach: [-5.20, 0.05, -42.60],   // just north of the little table
      meshes: ['Chair.001'],
      yaw:   Math.PI / 2,        // west, at the garden table
      pitch: -0.04,
      sitSpeed: 1.3,
      // A proper slow swing — this is the one seat where the motion is the
      // point, so it is the largest arc of the three.
      motion: { speed: 1.05, amount: 0.45, rise: 0.08, tilt: 0.030 },
      prompt: 'This chair has exactly one job.',
      standLabel: 'Get up',
    },
    {
      id: 'studioChair', label: 'the rocking chair',
      near:  { x: [-10.4, -5.0], y: [6.5, 10.5], z: [-8.6, -2.6] },
      // Session 63: chair scaled down — seat top now y 9.46 (was 9.80), seat
      // centre x -7.32 / z -4.39, so the seated eye drops and moves with it.
      eye:   [-7.35, 11.21, -4.60],
      approach: [-7.50, 7.77, -7.50],    // behind the chair, south side
      meshes: ['Rocking chair'],
      yaw:   Math.PI,            // north, at the art table
      pitch: -0.05,
      sitSpeed: 1.5,
      motion: { speed: 1.55, amount: 0.17, rise: 0.025, tilt: 0.022 },
      prompt: 'Rocking chair. Obviously.',
      standLabel: 'Stand up',
      sfx: 'rockingChair',   // id into CONFIG.sfx, played once on sitting down
    },
    {
      id: 'bed', label: 'the bed',
      near:  { x: [-12.0, -2.6], y: [14.5, 19.5], z: [-10.0, -0.3] },
      eye:   [-6.95, 18.30, -2.60],
      approach: [-11.30, 15.26, -5.00],  // bedside, west of the bed
      meshes: ['Bed', 'Pillow', 'Pillow2', 'HeadRest'],
      // Lying head-north, gazing up toward the feet: the ceiling fills the
      // screen and the hanging `Stars` strings (z -1.9…-0.9, i.e. above and
      // BEHIND the head) sit out of frame. Keep pitch <= ~1.2 or their tips
      // creep into the top edge; mars.plane/mesh rotation assume this yaw.
      yaw:   0,
      pitch: 1.15,               // ~66 degrees up
      pose:  'lie',
      sitSpeed: 1.1,
      prompt: 'Look up.',
      standLabel: 'Get up',
      sfx: 'bed',
    },
    // Session 30 added a `musicStool` seat here — walk near the stool, get
    // auto-sat-down, camera pivots to the instrument wall. Apoorva's
    // Session 31 call: that "walk close and it takes over your view" felt
    // wrong for this spot, so the seat is gone again. The stool is still a
    // normal static prop in the model; it just doesn't grab the visitor any
    // more. The `music` star below is back to a plain floor trigger, and the
    // instrument tags (CONFIG.itemLabels' `musicWall` group) already worked
    // off plain walk-up proximity before Session 30 touched this, so nothing
    // there needed to change.
  ],

  // -------------------------------------------------------------------------
  //  World / atmosphere
  // -------------------------------------------------------------------------
  world: {
    // FLAT LIGHTING PASS. Every lamp, every point light and the indoor/outdoor
    // dimming are switched off for now; the house is simply, evenly lit so
    // rooms read clearly while the actual lighting design is still open.
    // Set flatLighting: false to bring the indoor/outdoor blend back.
    flatLighting: true,

    // The house interior box (only used when flatLighting is false).
    interior: { x: [-18.6, 3.7], y: [-1, 40], z: [-36.2, 0.6] },

    sunPos:        [-120, 95, -110],
    sunColor:      0xfff4e6,
    sunIntensity:  1.35,     // enough to give the exterior some form
    hemiSky:       0xd9e6f5,
    hemiGround:    0x9c8f78,
    hemiOutdoor:   1.05,
    hemiIndoor:    1.05,     // same value: no dimming when you step inside
    ambientOutdoor: 0.95,
    ambientIndoor:  0.95,
    exposure:       0.95,

    // Blender exports single-sided materials when "Backface Culling" is on.
    forceDoubleSided: true,

    // ---- sharpness -------------------------------------------------------
    // Zooming the browser out packs more of the world into the same pixels,
    // which is where the "still looks chunky" comes from — it is aliasing,
    // not texture resolution. Rendering above the display's own pixel ratio
    // supersamples that away. 1.5 is the sweet spot; drop to 1.0 (or add
    // ?lowres to the URL) if the frame rate suffers.
    superSample:    1.5,
    maxPixelRatio:  2.5,

    // Depth precision for surfaces that sit almost on top of each other.
    near: 0.5,
    far:  320,

    skyTop:    '#8fbcec',
    skyMid:    '#cfe0f2',
    skyBottom: '#eee2cf',
    groundColor: 0x7a8a5e,   // visual-only ground disc under the world
    groundRadius: 170,
    fogColor:  0xd2e0ee,
    fogNear:   120,
    fogFar:    300,

    shadows: false,      // off with the rest of the lighting, for now
    shadowMapSize: 2048,
    shadowRadius: 60,
  },

  // -------------------------------------------------------------------------
  //  The navbar — map / star / contact, top-right corner (Session 6).
  //  See "Session 6" in the project doc for the full story. Rebuilt 10 Sep
  //  2026 after an editing mistake wiped this block along with `discoveries`
  //  below; the map `rect` percentages here are freshly derived from
  //  `rooms[].bounds` (each room's position within the house footprint,
  //  x -24.0..4.9 / z -50.6..0.7) rather than recovered from the original
  //  design file, so they are geometrically consistent but worth a look —
  //  walk the map once and nudge any room that reads oddly.
  // -------------------------------------------------------------------------
  navbar: {
    accent: '#9184d9',   // the design's purple — one string if this should change
    tints: { map: '#ffc98a', star: '#ffd166', contact: '#ffc98a' },

    contact: {
      email: 'gramleapoorva@gmail.com',
      links: [
        { label: 'Instagram', url: 'https://www.instagram.com/artistic_brains_/' },
        { label: 'LinkedIn', url: 'https://www.linkedin.com/in/apoorva-gramle-882a32209/' },
        { label: 'GitHub', url: 'https://github.com/apoorvagramle' },
      ],
    },

    // Session 55: the map is ONE picture of the whole house now — a
    // dollhouse-style cut-away seen from the west side (south/garden on the
    // left, kitchen on the right, floors stacked), instead of three floor
    // tabs. Each room's `sect: [left, top, width, height]` (in % of the map
    // panel) places it in that picture; `rect` and `ghost` below are the old
    // per-floor plan and are no longer drawn. `plan` is the outline around
    // the rooms: the two roofs, the ground line, the floor names.
    plan: {
      roofs: [
        [[53.8, 20.0], [77.0, 3.5], [100.2, 20.0]],   // the tall roof over the back
        [[26.8, 58.0], [55.2, 43.0], [55.2, 58.0]],    // the low roof over the living room
      ],
      ground: 79.4,          // y of the ground line
      floorLabels: [
        { text: '2nd floor', y: 29.4 },
        { text: '1st floor', y: 48.4 },
      ],
      floorLabelX: 3,
    },

    floors: [
      {
        key: 'ground', label: 'Ground floor',
        rooms: [
          { id: 'porch',   label: 'The porch',    rect: [0.0, 47.6, 18.9, 11.3], sect: [46.0, 81.5, 14.0, 11.0],  point: [-21.28, 0.05, -23.30] },
          // Was [-7.75, 0.05, -28.80], which is inside the sofa's own
          // footprint — the map ride was delivering people into the furniture.
          // This lands on clear floor just north of it instead.
          // Session 56: on the map the living room and the hall are one room,
          // "Hall" (Apoorva: "living room is the hall"). `living` stays here
          // for mapRoom() lookups but has no `sect`, so it isn't drawn; the
          // hall spans both and shows the living room's stars too (`marksFrom`).
          { id: 'living',  label: 'Living room',  rect: [19.4, 29.0, 73.7, 26.9], point: [-13.20, 0.05, -23.90] },
          { id: 'hall',    label: 'Hall',         rect: [19.4, 56.0, 73.7, 14.2], sect: [28.4, 58.0, 40.8, 21.0], point: [-7.75, 0.05, -18.25],
            marksFrom: ['living', 'hall'] },
          { id: 'kitchen', label: 'Kitchen',      rect: [19.4, 70.2, 73.7, 29.8], sect: [69.4, 58.0, 30.0, 21.0], point: [-7.75, 0.05, -6.95] },
          { id: 'garden',  label: 'The garden',   rect: [14.5, 0.0, 85.5, 29.0], sect: [0.6, 58.0, 27.6, 21.0],  point: [-7.45, 0.05, -43.15], door: 'GardenGate_L' },
        ],
      },
      {
        key: 'floor1', label: '1st floor',
        // Only the back half of the footprint is built up here — the ghost
        // draws the full ground-floor outline behind it for orientation.
        ghost: [0, 0, 100, 100],
        rooms: [
          // Session 56: landings are off the map (no `sect`); the studio and
          // bedroom take the whole width of their floor.
          { id: 'landing2', label: 'Landing',            rect: [19.4, 55.8, 73.7, 16.7], point: [0.0, 7.92, -16.30] },
          // Moved west off the room's centre: the old point landed inside the
          // rocking chair's seat box (CONFIG.seats), so picking "studio" off
          // the map sat you down the instant you arrived.
          { id: 'studio',   label: 'Art & music studio', rect: [19.4, 72.5, 73.7, 27.5], sect: [55.2, 39.0, 44.2, 18.8], point: [-12.20, 7.72, -7.60], door: 'Door.001' },
        ],
      },
      {
        key: 'floor2', label: '2nd floor',
        ghost: [0, 0, 100, 100],
        rooms: [
          { id: 'landing3', label: 'Landing',   rect: [19.4, 55.8, 73.7, 16.7], point: [-12.60, 15.18, -17.00] },
          // Session 47: `face` — arrive looking at the desk star (CONFIG.desk.star),
          // not turned back round to the door you just came through.
          { id: 'bedroom',  label: 'Bedroom',    rect: [19.4, 72.5, 73.7, 27.5], sect: [55.2, 20.0, 44.2, 18.8], point: [-14.10, 15.21, -8.80], door: 'Door.002',
            face: [-14.13, 18.75, -5.70], facePitch: -0.12 },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  //  Discoveries — what the star in the navbar tracks.
  //
  //  Session 17: `core` is now exactly the eight story stars from the final
  //  script, so the counter reads n/8 and the house rule "Find the stars"
  //  means literally that. The nine rooms and the stairs used to be counted
  //  here; they are gone from both lists, which means `collect('room:…')` and
  //  `collect('stairs')` are ignored quietly (see discoveries.js) — no count,
  //  no toast. Nothing else had to change.
  //
  //  Easter eggs are deliberately never registered (story.js only collects for
  //  `type: 'star'` entries that carry a `discovery` id), so a secret never
  //  reads as another box to tick.
  // -------------------------------------------------------------------------
  discoveries: {
    core: [
      { id: 'star:tv',      label: 'Just one more episode' },
      { id: 'star:map',     label: "There's a lot I haven't seen yet" },
      { id: 'star:coffee',  label: 'A good cup' },
      { id: 'star:dessert', label: 'The quicker, the better' },
      { id: 'star:garden',  label: 'Words, and a few good lines' },
      { id: 'star:social',  label: 'The creative playground' },
      { id: 'star:art',     label: 'The whole art journey' },
      { id: 'star:music',   label: "I can't really live without it" },
      // Session 82: the star over the bedroom desk chair counts too (it used to
      // be an uncounted secret, so the sign-off card could pop while it was
      // still hovering there). Sitting down is what collects it.
      { id: 'desk:sit',     label: 'The professional me' },
    ],
    secrets: [
      { id: 'desk:on',      label: 'Woke the machine up' },
      { id: 'door:upstairs', label: 'Opened a door upstairs' },
    ],
  },

  // -------------------------------------------------------------------------
  //  THE PORCH INTRO (Session 26) — replaces the old `intro` + `houseRules`
  //  popups on load (those two blocks below are kept, just no longer opened).
  //  src/intro.js: pulled-back porch shot, Apoorva's pixel sprite waving by
  //  the front door, DotGothic16 typewriter lines, then the two-column
  //  "Wanna hire me? / Explore" choice. Copy lives in intro.js (INTRO_BEATS).
  // -------------------------------------------------------------------------
  porchIntro: {
    // Session 26d: the original flat sprite (same 4 frames: idle, raise,
    // wave A, wave B), just given a light, even thickness — a thin box
    // instead of a single-sided plane. No per-pixel rebuild, no separate
    // rigged arm; the frames already draw the arm in every pose, exactly
    // like before.
    sprite: 'src/assets/greeting_spritesheet.png',   // 4 frames, left to right
    frames: 4, frameW: 92, frameH: 219,
    figurePx: 217,          // feet-to-hair height inside a frame
    footPx: 1,              // transparent rows under the feet
    anchorU: 0.69,          // body centre across the frame (wave arm hangs off the left)
    yaw: -Math.PI / 2,      // faces -X (toward the camera/visitor) — a flat 2D sprite, fixed pose
    height: 4.2,            // world units, feet to top of hair (front door is 4.6; walker eye is 3.4)
    pos: [-22.55, 0.20, -24.95],   // on Porch_Step (top y 0.20), out in front of the left post Porch_PostS (x -22.06…-21.64) so it can't hide her

    // The zoomed-out shot. Spawn eye is [-27, 3.45, -23.25]; this sits ~3.8
    // further back on the grass past Path_Front, level and dead-on (same y
    // + z for eye and look = no tilt). z matches the front doorway's own
    // centre (doorways[0].box.z is [-24.60,-21.90]) so the door — and she,
    // just past it — land centred rather than pushed to one side; the text
    // still finds the open space beside her (see startIntro in intro.js).
    cameraEye:  [-30.8, 3.4, -23.25],
    cameraLook: [-18.5, 3.4, -23.25],
    // Session 26b: flattens the "tilted"/converging-lines look of a wide
    // gameplay lens shot up close — see IntroCamera in intro.js for the math.
    introFov: 30,
    introZoom: 1.18,         // a further plain dolly-in on top of the flatten
    returnSec: 3.6,         // slow ease from the porch shot in toward the door, into the walker's view

    typeMs: 26, linePauseMs: 260, beatFadeMs: 220,   // quicker to read
    waveTimes: 3, firstWaveDelayMs: 500,
    hoverWaves: 2,          // waves when you hover over or click her
    wordDelayMs: 105,       // house-rules bullets: ms between each word popping in
    waveTiming: { raise: 0.11, swing: 0.23 },
  },

  // -------------------------------------------------------------------------
  //  THE INTRO — section 1 of the final story, shown on load.
  //
  //  This is a blocking popup: the veil under it eats every click and key, so
  //  nothing in the house can be touched until a choice is made. `choices`
  //  only render on the LAST beat of a script.
  //
  //    then: '<key>'   open CONFIG[<key>] as the next script in the same popup
  //    go:   '<room>'  main.js rides the visitor to that map room and closes
  //
  //  NOTE ON SPELLING: the script sheet writes "Apurva"; every other string in
  //  the app (and the ending) says "Apoorva", so that is what is used here.
  //  One search-and-replace if that is the wrong way round.
  // -------------------------------------------------------------------------
  intro: {
    kicker: 'Welcome home',
      lines: [
        { text: 'I like having a little space where nothing needs my attention.\n\nA book, some coffee, a bit of green.', note: 'Sit in the orb chair first — the coffee and the book are already beside it.' },
        { text: 'Sometimes I write here too.\n\nIt is nice to make something without needing it to go anywhere.', note: 'The book opens. The poem can follow in Apoorva’s voice.' },
      ],
    choices: [
      { id: 'hire', label: 'Wanna hire me?', sub: 'Start with my work.', go: 'bedroom' },
      { id: 'know', label: 'Explore', sub: "See what I'm like beyond the résumé", then: 'houseRules' },
    ],
  },

  // Section 2 — shown straight after "Explore".
  houseRules: {
    kicker: 'House rules',
    endLabel: 'Let me in',
    lines: [
      'Find the stars.\n\nSome tell you about me. Some are just mine.',
    ],
  },

  // -------------------------------------------------------------------------
  //  THE STORY — sections 3 onward of the final script, one entry per star.
  //
  //  Session 28 (19 Sep 2026): the copy was rewritten — humanized, and the
  //  art journey condensed. Session 29, same day: HOW it's shown changed too.
  //  Every star/egg's script now types itself out top-left, non-blocking
  //  (story.js's startHud()/updateHud()/paintHud()) instead of opening a
  //  modal card. A beat is either a plain string or an object:
  //
  //      'PLAIN ON-SCREEN TEXT'                 typed out as-is
  //      { text: '…', note: '…' }               `note` is a code comment for
  //                                             US — which interaction this
  //                                             beat lines up with. It is
  //                                             NOT shown to the visitor any
  //                                             more (there's no dashed box
  //                                             in the HUD — see story.js).
  //
  //  `said` is gone: every star is "Voice: None" now except `garden`, which
  //  keeps a `voice` field (Apoorva reading the poem — still unrecorded).
  //  `\n` inside a beat is a real line break (`white-space: pre-line` on
  //  #storyHudText), so a block of on-screen lines stays one beat instead of
  //  one click each.
  //
  //  `note` is still worth reading before touching a beat's text or timing —
  //  it says what's supposed to be happening in the scene while that line
  //  types (the TV's clock sliding, the oven opening, the map zooming...).
  //  See `claude/story-todo.md` for which of those are actually built.
  //
  //  POSITIONS. Apoorva's own P/O plants are kept exactly where she put them:
  //  star-3/4 (kitchen), egg-2 (fridge), star-5 (garden), star-6/7/8 (studio),
  //  egg-3 (bedroom). Four things changed, all flagged:
  //
  //    * the old porch plant [-22.29, 2.56, -23.21] is retired — the final
  //      script has no porch star, its content became the intro popup above.
  //      Kept here in case it wants to come back.
  //    * `tv` and `map` are NEW positions, measured off MeraGHAR.glb rather
  //      than planted: the TV is at x -16.7…-15.8, z -31.2…-26.4 and the
  //      Worldmap hangs on the same west wall directly above it (y 5.6…8.9).
  //      Apoorva's two living-room plants sat on and behind the sofa, which is
  //      where you look FROM, not at. Walk up and confirm.
  //    * `rug` (the Marvel easter egg) is NEW too — the script asks for one and
  //      nothing was planted. It sits on Rug.001 (the studio rug, x -15.9…-9.8,
  //      z -11.2…-5.2), pulled away from the music star so the two can't be
  //      collected in the same step.
  //    * the studio pair was the wrong way round in the old comments: the
  //      instruments (Guitar/Ukulele/Keyboard/Speaker/Stool) are all at
  //      x ≈ -17, so star-8 is MUSIC and star-7, by the Art_Table and the
  //      rocking chair, is the ART JOURNEY.
  //
  //  `room:` is set explicitly on the two wall stars because the map star
  //  hangs above the living room's own y ceiling (5.5) and roomAt() would
  //  otherwise never place it.
  // -------------------------------------------------------------------------
  // Session 23 — the look and reach of every story marker.
  //   starSize   tip radius of the clear glass ✦ (was 1.3 — far too big)
  //   eggSize    radius of the gold ? coin (was a 0.75 star)
  //   hitRadius  invisible tap target around each — kept thumb-sized
  //   faceTime   seconds to turn and face a star on arrival
  //   seatDelay  seconds seated before a seat's star opens
  storyMarkers: { starSize: 0.46, eggSize: 0.32,   // Session 24b: +15%
    // Session 24c: a slight candle-light warmth in the clear glass. Carried
    // by the glass body + a whisper of glow, not paint. 0xffffff = clear.
    starTint: 0xffd9a0,
    hitRadius: 0.7, faceTime: 0.6, seatDelay: 0.45,
    // Session 24: markers show on the visitor's whole floor, not just their
    // own room (walls still hide them — they are depth-tested). This is how
    // far above/below the feet still counts as "the same floor".
    floorBand: 5.5 },

  story: [
    // Session 23 — every marker is planted ON the thing it is about, and
    // nothing opens on the tap. Two ways a star is reached:
    //
    //   at: { stand: [x,y,z], r, yaw, pitch }
    //       tapping walks you to `stand`, turns you to face it (yaw/pitch,
    //       or straight at the marker if left out), then opens. Walking
    //       within `r` of `stand` on your own does the same.
    //   seat: '<CONFIG.seats id>'
    //       it belongs to that seat: tapping walks you there (the seat's
    //       `approach`) and sits you down, and landing in the seat — however
    //       you got there — opens it.
    //   at: { seat: '<id>' }  reached THROUGH a seat without being its
    //       trigger (the map: tap → walked to the sofa → sat → map opens).
    //   from: ['<seat id>']   tappable from that seat with no walk at all.
    //
    // Positions measured off MeraGHAR.glb mesh bounds. Retune any of them
    // in-house with P / O (plant) and H (readout) as before.
    //
    // --- HALL / living room -------------------------------------------------
    {
      id: 'tv', type: 'star', discovery: 'star:tv', room: 'living',
      // On the sofa cushion (Sofa y 0.13…2.96, seat plane 1.70). Walk up to
      // the sofa → you sit, facing the TV → this opens and the TV turns on.
      // Session 24b: nearer the cushions (LeafPillow x -9.74…-8.35,
      // z -28.29…-26.63), just in front of them.
      pos: [-10.05, 2.60, -27.90],
      seat: 'sofa',
      kicker: 'The TV',
      // Session 28 (19 Sep 2026) — humanized script rewrite. Voice: None.
      lines: [
        { text: 'I have a weakness for “one more episode.”\nSomehow, it’s always suddenly morning.\nYeah… I’ve never been very good at stopping at one.' },
      ],
    },
    {
      id: 'map', type: 'star', discovery: 'star:map', room: 'living',
      // ON the map (Worldmap: x -16.87…-16.78, y 5.58…8.86, z -31.77…-25.06),
      // roughly where India sits on a standard world map — move it with P if
      // the art disagrees. From the sofa it is in shot, and a tap opens it
      // straight away; from anywhere else a tap walks you to the sofa first
      // (the only spot the map reads well from — standing under it you are
      // craning 60° up).
      pos: [-16.55, 7.50, -29.60],
      // Session 24: the one star you never walk to — tap it (from the sofa,
      // where it is in shot, or anywhere else) and the popup just opens.
      direct: true,
      // Session 48: the map itself is clickable too. Once the star has been
      // collected (and so is gone), clicking `Worldmap` brings the envelope
      // back up — main.js's pickInteractive / story.revisit().
      revisit: ['Worldmap'],
      // Session 41: BUILT — see claude/session-41-map-letter.md. Tapping the
      // star brings up a brown envelope (letter.js); tapping the envelope
      // opens it and the (real, photographed) letter slides out; clicking
      // the letter flips it to the back. Esc puts it away. This replaces
      // the two "map zooms in / pulls back" notes that used to sit on the
      // beats below — same idea (something happens while the text plays),
      // built as the envelope instead of a camera move on `Worldmap`.
      letter: true,
      kicker: 'The world map',
      // Session 28 — humanized script rewrite. Voice: None.
      lines: [
        { text: 'I love going somewhere I’ve never been.\nThere’s always something new to see, try, or completely get lost in.\nAnd somehow, I always come back wanting another trip.' },
      ],
    },

    // --- KITCHEN ------------------------------------------------------------
    {
      id: 'coffee', type: 'star', discovery: 'star:coffee',
      // Hovering over the coffee table (Table top y 3.34, x -17.32…-14.88),
      // between the milk and the mugs — visible from the kitchen doorway.
      // Arriving turns you to the table, the same way the lean faces it.
      // Session 24: beside the coffee table, a little in front of it (the
      // table's open face is its east edge, x -14.88).
      // Dropped to eye level (stand point floor y 0.05 + P.eyeHeight 3.4 ≈
      // 3.45) — was 4.30, floating noticeably above where you're looking.
      pos: [-14.30, 3.45, -13.60],
      at: { stand: [-13.10, 0.05, -13.00], r: 1.0, yaw: 1.49, pitch: -0.35 },
      // Session 39: no walk-over, no turn, no "talk first, then drift up".
      // Tapping the star (or walking into `at.stand`) puts you at the table
      // and the view goes straight to `CONFIG.coffee.lean` in one move,
      // while the line types itself top-left.
      snap: true,
      kicker: 'The coffee station',
      // Session 19: the mini-game is built (coffee.js). This popup is only the
      // opening line; closing it hands the table over to the visitor, and the
      // rest of the script — `coffeeDone` below — opens by itself once a mug
      // has coffee, milk and foam in it.
      // Session 28 — humanized script rewrite. Voice: None. The physical
      // interaction stays the star; the note is the only instruction left.
      lines: [
        { text: 'Coffee is a bit of a ritual for me.\nI like making it almost as much as drinking it.' },
      ],
    },
    {
      id: 'dessert', type: 'star', discovery: 'star:dessert',
      // On the counter right above the double oven (counter top y 2.94,
      // oven x -17.2…-15.86, z -7.46…-2.64).
      // Session 24: in the middle of the kitchen floor (the clear area
      // between the island and the oven wall). Reaching it turns you to the
      // oven, which opens.
      pos: [-10.00, 3.20, -5.40],
      at: { stand: [-10.60, 0.05, -5.40], r: 0.9, yaw: Math.PI / 2, pitch: -0.3 },
      kicker: 'Desserts',
      // Session 28 — humanized script rewrite. Voice: None. Down from four
      // beats to two so it doesn't read as an information card.
      lines: [
        { text: 'I don’t really enjoy cooking for that long, but desserts are definitely the exception.\nIt started with mug cakes — now I’m always up for a sweet.' },
      ],
    },
    {
      id: 'fridge', type: 'easterEgg',
      // A ? coin stuck to the fridge door like a magnet (Fridge x -5.25…-2.13,
      // y to 6.3, front face z -3.19).
      // Session 24b: at the fridge's right-hand front corner, just proud of
      // its face (z -3.19) — reads as belonging to the fridge, and is in view
      // from the kitchen (its east side, where it was, is hidden).
      pos: [-2.45, 3.60, -3.60],
      at: { stand: [-2.60, 0.05, -5.60], r: 0.9 },
      kicker: 'The fridge',
      // Session 28 — humanized script rewrite. Voice: None. Spontaneous, so
      // it stays as two quick lines rather than one full sentence.
      lines: [
        { text: 'Nope. You can’t open that. There’s too much dessert in there — I’m not letting you eat it.' },
      ],
    },

    // --- GARDEN -------------------------------------------------------------
    {
      id: 'garden', type: 'star', discovery: 'star:garden',
      // On the book on the little table (Book y 2.27…2.54). It belongs to the
      // hanging chair next to it: sit → it opens, book and coffee in view.
      // Session 24: beside the little table, on the hanging-chair side.
      pos: [-4.40, 2.70, -43.40],
      seat: 'orb',
      room: 'garden',
      kicker: 'The garden',
      // Session 63: the book on the little table (book.js). While these lines
      // type, it's picked up off the table into your hands; once the last
      // one is done it opens. Clicking the Book again from the chair reopens
      // it. Paste the poem into `poem` (line breaks as \n, or a template
      // string) and its title into `title` — both empty = placeholder pages.
      // Session 64 — lyrics: the page shows the poem Spotify-style, lighting
      // each line as she reads it. `audio` = her recording (same path style
      // as the sfx, e.g. '../Sound%20Effect/poem.mp3'). `times` = when each
      // line starts, in seconds, one per non-empty line of `poem`. Get them
      // with ?booktime (tap Space as each line starts; it copies the array).
      // No audio = lines move on at a steady pace. Use this, not voice.src.
      // Session 65: her poem, "The Dream Chaser", with her own reading. The
      // times were worked out from the recording itself (forced alignment of
      // this exact text to the audio, snapped to where her voice starts), one
      // per line, 35 in all. If a line is ever edited, re-time it with
      // ?booktime.
      book: {
        title: 'The Dream Chaser',
        by: 'Shri Shri Apoorva Kumari',
        // Shown small, in brackets, under the byline (book.js adds the brackets).
        note: "this is the first thing i ever wrote, not sure if its poem, or what is it. wrote this when i was in 12th",
        audio: '../Sound%20Effect/The%20Dream%20Chaser.m4a',
        poem: `
        The clouds in the blue sky
        and the birds is chirping around
        Their sweet sound and the blowing wind,
        which makes my hair sway,
        gives a wide smile on this sad face.
        The cloud moving, happily from a place to another.
        The small birds flying and dancing with all the charm.
        The cool wind making my brain cooler,
        but the soul remains restless.
        The outer face showing a smile, tries to convince the soul
        but fake smiles aren't enough.
        The brain who's into the dreams
        The soul says, I have no wings.
        But the dreams don't want to leave their place,
        and the brain wants them to get in pace.
        He wants the dream to be the reality.
        The restless soul even wants them,
        but says he has no wings.
        But this cool wind makes the brain reply the soul,
        Who asked for the wings? We'll walk and go.
        I am not a dreamer.
        I am born to be a dream chaser.
        We'll start walking and then run in this race.
        if you still can't, we'll crawl up and get the pace.
        Completion of this dream will get you the wings
        It's just about working for a few weeks.
        The day that would be reality will be the day you shine the brightest.
        The shine won't be of the moon,
        that's the Lord sun shining up there,
        making the dark nights of the people around into a charming day.
        So, hey dear sad face, let's start up and get the things in place.
        Let's try harder and not losing up in the way,
        because I am a dream chaser, not a dreamer in any way.
        Let's make the soul smile and brain get his dreams.
        Let's work harder and chase the dream.
        `,
        times: [
          0.01, 1.43, 3.41, 5.69, 7.61, 10.55, 13.21,
          17.03, 19.37, 22.03, 25.15, 28.03, 30.13, 33.07,
          35.67, 38.35, 40.75, 42.99, 45.23, 48.15, 51.33,
          52.19, 54.97, 58.23, 62.25, 65.07, 68.09, 72.73,
          74.45, 77.79, 81.55, 86.09, 88.93, 92.87, 96.51,
        ],
      },
      revisit: ['Book'],
      // Session 28 — humanized script rewrite. This is the one star that
      // keeps a voice: Apoorva reads the piece. Down to three slower beats
      // on purpose — "this is where I'd slow down a little."
      // NB: playVoice() only fires on beat 0 (see story.js `paint()`), so
      // right now voice.src would play the moment this star opens, not on
      // the "want to hear one?" beat below where the script wants it. Worth
      // a small story.js change (fire on the last beat instead) before a
      // recording is actually dropped into voice.src.
      lines: [
        { text: 'I love gardens.\nI think I feel the most peaceful here, especially after a long day.\nAnd sometimes, I write.' },
        { text: 'Actually… want to hear one? →' },
      ],
      voice: { src: '', transcript: '', delay: 350, volume: 1 },
    },

    // --- STUDIO -------------------------------------------------------------
    {
      id: 'social', type: 'star', discovery: 'star:social',
      // Over the folding desk with the camera, tripod and iPad (desk top
      // y 10.38, x -3.78…-0.29, z -3.12…-0.33).
      // Session 24: beside the table rather than above it — just off its
      // front (south) edge, at tabletop height.
      pos: [-2.00, 10.50, -3.70],
      at: { stand: [-2.00, 7.77, -5.60], r: 1.0 },
      // Session 57: finding this star pops up Apoorva's camera vlog
      // (vlog.js — the clip with the REC/viewfinder layer over it) while the
      // lines below type underneath it. After that, clicking the `Camera`
      // on the desk plays the vlog again. Esc closes it. `room` keeps the
      // Camera from being clickable through the floor/walls from elsewhere.
      vlog: true,
      revisit: ['Camera'],
      room: 'studio',
      kicker: 'The studio table',
      // Session 28 — humanized script rewrite. Voice: None.
      lines: [
        { text: 'I’ve always loved capturing things — there’s just something about getting the shot right.\nAnd then I get to edit it, which is honestly my favourite part.' },
        { text: 'Somehow, that turned into videos, art, and way too many ideas for social media.\nI think I’m here because I love the whole process.' },
      ],
    },
    {
      id: 'art', type: 'star', discovery: 'star:art',
      // On the art table, over the paint and brush. It belongs to the
      // rocking chair that faces it: sit → the paint-tube timeline opens.
      // Session 24b: just behind the rocking chair's backrest (the chair
      // faces north, so its back is the south side you see walking in).
      // Session 63: the chair was scaled down (seat top 9.80 -> 9.46, backrest
      // rear now z -5.66, top y 11.71), so the star moved in to sit ~0.5
      // behind the smaller backrest, centred on it (was [-7.45, 10.80, -6.90]).
      pos: [-7.05, 10.75, -6.15],
      seat: 'studioChair',
      kicker: 'Oh. You found the beginning.',
      // Built (see timeline.js / art-timeline-spec.md): walking up to this
      // star opens the full-screen paint-tube timeline instead of the
      // lines below. Session 28 — humanized script rewrite condensed `lines`
      // from the original 32 beats down to these 11, grouped into the same
      // 8 named sections (AGE 4 / GROWING UP / AFTER 10TH / COLLEGE /
      // FREELANCING / THE IPAD / ANIMATION / NOW) the timeline already uses.
      // `lines` is still the fallback if `timeline` is ever unset for
      // debugging — worth checking timeline.js's own section grouping still
      // lines up with this text next time it's touched. Voice: None.
      timeline: true,
      lines: [
        { text: 'I started drawing when I was four.\nAnd somehow, I never really stopped.' },
        { text: 'I’ve tried almost every way of making something — and I still keep finding another one to try.' },
      ],
    },
    {
      id: 'music', type: 'star', discovery: 'star:music',
      // Over the keyboard (Keyboard top y 9.96, x -17.37…-16.16). Session 27:
      // the guitar moved to z -7.04…-5.67 and the ukulele to -8.51…-7.43 to
      // make room for the musical-notes `Decor` on the wall (z -13.16…-7.46).
      pos: [-16.40, 10.50, -8.20],
      // Session 30 moved this onto the `musicStool` seat (sit down to open,
      // same as the sofa/TV). Session 31: Apoorva didn't want the walk-close-
      // and-get-sat-down behaviour at all, so this is back to the plain floor
      // trigger it had before — walk up and face it, same as every other
      // non-seat star. The text (below) and the instrument labels on the wall
      // are unchanged; only how you reach the star changed.
      at: { stand: [-13.20, 7.77, -8.10], r: 0.8 },
      kicker: 'Music',
      // Session 28 — humanized script rewrite. Voice: None.
      lines: [
        { text: 'Music has always been around me, so naturally I wanted to learn a little of everything.\nThe problem is… I never get very good at any of them 😭\nBut I always come back to it.' },
      ],
    },
    {
      id: 'rug', type: 'easterEgg',
      // A ? coin lying low over the far half of the rug (Rug.001 x -15.86…-9.82,
      // z -11.19…-5.15), away from the music star's spot.
      pos: [-12.60, 8.35, -10.20],
      at: { stand: [-11.50, 7.77, -7.60], r: 0.8 },
      kicker: 'The rug',
      // Session 28 — humanized script rewrite. Voice: None.
      lines: [
        { text: 'Ah, you found the Marvel corner.\nIron Man is still first. Spider-Man can have second.' },
      ],
    },

    // --- BEDROOM ------------------------------------------------------------
    // The professional portfolio is the desk (desk.js), not a star. This is
    // the Mars easter egg, and main.js also fires it when you lie down on the
    // bed — which is how the script asks for it.
    {
      id: 'mars', type: 'easterEgg', stars: true,
      sfx: 'mars',   // overrides the default egg "pop" — this one gets its own cue
      // A ? coin on the bed. Lying down (walk up to the bed) opens it.
      pos: [-6.90, 17.75, -5.20],
      seat: 'bed',
      kicker: 'Look up',
      // Session 28 — humanized script rewrite. Voice: None. Down from six
      // beats to five; kept the more personal, slower tone since this is an
      // actual childhood memory.
      lines: [
        { text: 'When I was a kid, I used to tell people I’d be the first person to walk on Mars.\nI wanted to be an astronaut.' },
        { text: 'But as I grew up, I realised physics and I weren’t exactly best friends.\nSo I drifted a little away from that dream.' },
        { text: 'Still, I love looking up. I guess some things never really leave you.' },
      ],
    },

    // Session 51: the sneaky way in. Out on the west side of the house the
    // garden fence (Fence_Pickets, west run at x -19.58…-19.42, from
    // z -36.10 south) stops just short of the house's SW corner (x -18.53,
    // z -36.02) — a gap you can see the garden through. A ? coin sits in
    // that gap, low, like it was dropped on the way through. `stand` is the
    // nearest walkable spot outside it (walkable-map node -19.6, -35.0).
    {
      id: 'fenceGap', type: 'easterEgg',
      pos: [-19.00, 1.60, -36.20],
      at: { stand: [-19.60, 0.05, -35.00], r: 0.9 },
      kicker: 'The back way',
      // Apoorva's own words, 25 Sep 2026.
      lines: [
        { text: 'Trying to sneak in like a little thief? Nice find, Sherlock.\n\nI’m glad you’re getting the hang of this. There’s a whole house waiting for you.' },
      ],
    },

    // Session 63: a second garden secret, on the grass just past the west
    // end of the garden Shelf (x -15.33…-11.45, z -39.10…-37.81), in front
    // of the hedge and rose trees — where Apoorva tapped. Floats low like
    // the fence-gap coin. Sits inside the garden room box, so the house map
    // picks it up on its own (garden now shows two coins).
    // PLACEHOLDER copy — sunsets. Swap in Apoorva's own words.
    {
      id: 'sunsets', type: 'easterEgg',
      pos: [-14.00, 1.50, -40.50],
      // yaw/pitch: the walk-up already turns toward the sunset view below.
      at: { stand: [-12.60, 0.05, -41.00], r: 0.9, yaw: 1.74, pitch: 0.06 },
      // Session 75: drag the sun down -> her sunset photo fades in -> tap it
      // for the rest (sunset.js). The lines below type once the sun has set.
      // `pov`: wherever the visitor is when the coin is found, the view
      // glides to this fixed spot first (shelf on the left, looking west over
      // the roses and the fence, mostly sky), and only then does the sun
      // appear. Tune it: press H in the house for the x/z/yaw/pitch readout
      // (the readout's yaw/pitch are in degrees; these are radians).
      sunset: { pov: { pos: [-12.20, 0.05, -41.40], yaw: 1.74, pitch: 0.06 }, glide: 1.1 },
      kicker: 'Sunsets',
      lines: [
        { text: 'Some days, I think I spend the whole day waiting for sunset.\nEspecially on the bad ones — a sunset walk somehow makes everything feel a little lighter.' },
      ],
    },

    // Retired with the final script — the porch beat became the intro popup.
    // Apoorva's plant, kept in case a porch star wants to come back:
    // { id: 'star-1', type: 'star', pos: [-22.29, 2.56, -23.21], kicker: 'The porch', lines: ['Come in.', "I've been expecting you."] },
  ],

  // -------------------------------------------------------------------------
  //  Hover name tags (item-labels.js). Session 25: standing near the studio
  //  table (the `social` / editing star), hovering the iPad, the tripod or
  //  the camera shows a small glass chip naming it. `near` is the table's
  //  centre (x, floor y, z); tags only wake up within `radius` of it, on the
  //  same floor. `name` is the object's Blender name.
  // -------------------------------------------------------------------------
  // Session 61: the studio iPad's screen (ipad.js) — a screenshot of the
  // Instagram profile; clicking the iPad opens `url` in a new tab.
  ipadScreen: { mesh: 'Ipad', room: 'studio', url: 'https://www.instagram.com/artistic_brains_/' },

  itemLabels: {
    groups: [
      {
        id: 'studioTable',
        near: [-2.00, 7.77, -1.70],
        radius: 5.0,
        items: [
          { name: 'Ipad',   label: 'iPad', description: 'Tap to open my Instagram, @artistic_brains_' },
          { name: 'Tripod', label: 'Tripod' },
          { name: 'Camera', label: 'Insta360 GO 3S' },
        ],
      },
      // Session 30: the instrument wall by the music stool — plain walk-up
      // proximity, same as the studio table above. (Session 30 briefly tied
      // this to a `musicStool` seat and needed `allowSeated` so the tags kept
      // working while sitting; Session 31 removed that seat, so `allowSeated`
      // is inert now but harmless left in.) Each item carries a short
      // `description`, Apoorva's own words, rendered as the tag's second
      // line.
      {
        id: 'musicWall',
        // Session 49: tags only once the music star has been collected.
        requires: 'music',
        near: [-15.20, 7.77, -8.19],
        radius: 4.5,
        allowSeated: true,
        items: [
          { name: 'Guitar',   label: 'Guitar',   description: 'Learnt this for about 6 months — I know the basics.' },
          { name: 'Ukulele',  label: 'Ukulele',   description: "The instrument I love. It's the easiest one." },
          { name: 'Keyboard', label: 'Keyboard',  description: 'Bought this one and struggled so much syncing my left hand.' },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  //  Music Corner note-wall chain reaction (music-decor.js) — 23 Sep 2026,
  //  corrected 24 Sep after Apoorva actually saw it run.
  //  Apoorva: clicking any instrument on the wall should light up the
  //  musical-notes wall decor (`Decor`) one note at a time, each turning off
  //  exactly as the next turns on — "like a flow... a chain reaction" —
  //  and only the grey note symbols, never the black staff lines.
  //
  //  `Decor` is one connected mesh (a wavy five-line staff with five note
  //  glyphs on it, one baked `palette.072` material) — not five separate
  //  objects, and not five separate topological islands either, because the
  //  staff itself never breaks. The first version of this banded ALL of
  //  Decor's vertices by world Y alone, staff lines included, which is
  //  exactly why the whole mesh lit up instead of just the five notes.
  //
  //  What DOES separate a note from the staff is colour, not position: the
  //  staff's dark stripes and each note's light body are two different,
  //  constant offsets into the same 256x1 baked palette strip — confirmed
  //  live off the real mesh over the Blender MCP connection: every "note"
  //  face samples the palette at UV.x ≈ 0.17383, every "staff line" face at
  //  UV.x ≈ 0.15820, no other values anywhere on this mesh. music-decor.js's
  //  `detectNotes` uses that UV.x split (not the mesh's Y position) to
  //  classify every vertex light/dark, then flood-fills only across
  //  light-to-light edges so a staff-line vertex can never join a note's
  //  island and never glows. See claude/session-46-music-decor-fix.md for
  //  the full before/after and the exact numbers (session-44's doc still
  //  describes the superseded Y-banding approach).
  //
  //  `triggers` are the three objects CONFIG.itemLabels' `musicWall` group
  //  already labels on hover — the actual playable instruments, not the
  //  speaker or the stool. Widen this list if Apoorva wants those to count
  //  as a trigger too.
  //
  //  Colour matches the room: the studio's neon sign washes the music
  //  corner in its cyan half (session-38-studio-lighting.md,
  //  `0x0dafff` Neon_Cyan) — this reuses that exact colour rather than
  //  introducing a third one.
  //
  //  `stagger` is deliberately left unset so it falls back to `width` in
  //  music-decor.js's `update()` (`C.stagger ?? width`) — the two MUST be
  //  equal, never `stagger < width`, or consecutive notes overlap mid-glow.
  //  Apoorva was explicit: "each symbol lights up and turns off just when
  //  the next symbol glows. no two symbols glow together." Don't add a
  //  `stagger` value here unless it's set equal to `width`.
  // -------------------------------------------------------------------------
  musicDecor: {
    mesh: 'Decor',
    triggers: ['Guitar', 'Ukulele', 'Keyboard'],
    color: 0x0dafff,   // Neon_Cyan, same as the studio's own light
    // Session 70: Apoorva — "that light is v dim, make it brighter when it
    // glows". Was glow 1.6 with no tint and no halo.
    glow: 3.2,          // emissive strength of a lit note
    tint: 0.75,         // 0..1: how far a lit note's own paint shifts to the neon colour
    halo: { scale: 2.2, strength: 0.9, lift: 0.35 },   // soft bloom quad per note (scale × the note's own size)
    fadeOut: 0.35,      // seconds for the lit note to fade when the song ends
    // Session 70: clicking any instrument plays this; the house music pauses
    // for it and the chain above loops until it ends (main.js).
    song: { src: '../Sound%20Effect/Tum%20hi%20ho.m4a', volume: 0.9 },
    width: 0.45,         // seconds each note's own up/down pulse lasts — also
                          // the gap before the next one starts (see comment above)
    reverse: false,      // Session 54: back to the original order (Session 50's
                         // flip was a misunderstanding — the "direction" Apoorva
                         // meant was the drag-to-look direction, see player.lookInvert*)
  },

  // Superseded in Session 23 by `seat: 'bed'` on the mars entry — kept only
  // so nothing that still reads it breaks.
  bedStory: 'mars',

  // -------------------------------------------------------------------------
  //  The bedroom's Mars ceiling (mars.js) — Session 22. Apoorva's Claude
  //  Design storyboard for the `mars` easter egg above gave beat-by-beat art
  //  direction. Rather than splitting Ceiling/Stars apart in Blender, this is
  //  a Canvas2D overlay plane over the ceiling patch above the bed, same
  //  trick as CONFIG.tv, cross-fading against the real `Stars` mesh (the
  //  hanging star strings) as the sequence starts and ends.
  //
  //  `plane` was sized to the BED CAMERA'S OWN FRUSTUM measured at this
  //  height, not to the real ceiling's extent — deliberately, per Session 22:
  //  a plane any bigger pushes whole beats (the "study stars" astronaut, most
  //  of all) outside the view entirely, at the cost of a visible margin of
  //  real grey ceiling around the art. Session 30: Apoorva asked for the
  //  opposite trade — "visible on the whole ceiling", the real `Stars` mesh
  //  never showing through — so the margin lost. New bounds are the real
  //  `Stars` mesh's own world footprint (x [-11.02,-4.87], z [-1.91,-0.87],
  //  parsed off MeraGHAR.glb) centred and padded out to the canvas's 720x600
  //  (1.2) ratio so the art still doesn't stretch; re-check live and pull
  //  it back in if a beat's edge content now clips off-screen (see the
  //  header's "roughly 9.1 × 4.9" note on how the old size was derived, if
  //  this needs re-deriving from the actual camera frustum instead).
  //  `y` sits just under the real `Ceiling` mesh (24.86…25.33, parsed off
  //  the .glb) so it reads as painted on it.
  // -------------------------------------------------------------------------
  mars: {
    // Session 32: sized to the new bed view (looking up toward the feet,
    // see seats 'bed') — the whole ceiling from the headboard to the far wall.
    plane: { x: [-14.65, 0.75], y: 24.6, z: [-13.0, -0.2] },
    dim: 0.45,         // how dark the screen goes under the story (0 = off); it fades in with the sky and back out with the settle
    canvas: { width: 900, height: 750 },   // the storyboard's own 720x600, upscaled for crispness
    starsMesh: 'Stars',
    dissolve: 1.4,     // beat 0 — the field blooming in as the real Stars mesh fades out
    // Session 30: the real Stars mesh (the hanging star strings) hangs down
    // off the ceiling as actual 3D geometry, not a flat ceiling decal — a
    // flat overlay plane can't reliably occlude it from every angle, so
    // rather than fading it out in lockstep with the overlay's own reveal
    // (which left it visibly lingering — "the star lightings should not be
    // visible"), it now fades at `starsFadeMul`× the overlay's speed, fully
    // gone well before the cartoon sky becomes prominent. See mars.js's
    // setStarsOpacity().
    starsFadeMul: 2.2,
    // Session 34: the five-beat slideshow is replaced by the continuous
    // "Mars Ceiling Film" (mars.js). It runs on its own clock, started by the
    // story HUD and independent of the script's beat count. `scenes` is the
    // film's outline — [name, seconds] — and mars.js derives its cue times
    // from it; total is 36s. `speed` scales the clock. `settle` is the
    // graceful fade back to the real ceiling when the film ends; `exit` the
    // quick one when the visitor stands up first.
    scenes: [
      ['Cruise', 5], ['Astronomer', 4], ['StudyStars', 4], ['Landing', 5],
      ['Detour', 5], ['LookingUp', 4], ['Wonder', 4], ['Settle', 5],
    ],
    speed: 1,
    settle: 1.8,
    exit: 0.6,
  },

  // -------------------------------------------------------------------------
  //  The coffee station (coffee.js) — Session 19.
  //
  //  The `coffee` star above only says "MAKE YOUR COFFEE." When that popup
  //  closes the table by the kitchen's west wall is live: tap the moka pot to
  //  brew it, drag it (or the milk, or the frother) over a mug and it does its
  //  thing by itself, drag the mugs around if you like. Any order. When one
  //  mug has coffee + milk + foam, `coffeeDone` opens — the rest of the
  //  script — and the table stays playable afterwards.
  //
  //  Everything here is a tunable, not a switch: the objects and the four
  //  animation clips (MokaBrew, MokaPour, MilkPour, Froth) live in
  //  MeraGHAR.glb and were authored in MeraGHAR.blend.
  // -------------------------------------------------------------------------
  coffee: {
    hint: 'MAKE YOUR COFFEE.',          // the thought bubble while the table is live
    // Session 73: the recipe, one step at a time — on the card under the
    // Coffee Corner poster (CONFIG.signs.coffeeSteps) and in the thought
    // bubble. Only the current step's thing responds; anything else shakes
    // and the step is repeated. Apoorva's wording. Order is fixed in
    // coffee.js (mug, milk, frother, moka pot tap, coffee pour), so reword
    // freely but keep five, in this order.
    steps: [
      'To make coffee, first pick up a mug.',
      'Pour milk into your mug.',
      'Use the frother to froth your milk for a creamy, silky texture.',
      'Touch the moka pot to get some coffee.',
      'Pour it into the mug.',
    ],
    stepsDone: 'Your coffee is ready. Enjoy!',
    // Leaning over the table. Standing, the eye (4.0) is barely above the
    // tabletop (3.34) and the mugs hide everything; this raises the view and
    // tilts it down, the way the desk chair leans you into the monitor. Same
    // conventions as `seats`: yaw +PI/2 looks west (at the wall the table is
    // against), pitch is radians, negative = down. Set `lean: null` to stay
    // at walking height.
    lean: {
      // Session 39: the two-stage "low look along the tabletop, hold, then
      // rise" is gone (Apoorva: "we don't need weird transitions"). One
      // quick move from wherever you were straight to this view. `speed` is
      // 1/seconds: 2.4 ≈ 0.4s. Raise it for an even harder cut.
      eye:   [-13.4, 5.7, -12.9],
      yaw:   1.49,
      pitch: -0.66,
      speed: 2.4,
      standLabel: 'Step back',
    },
    // Said (in the same bubble) when a tool is held over a mug and shakes
    // instead of pouring. Placeholders — reword freely, or set to '' for
    // the shake alone.
    hints: {
      needBrew: 'Nothing in it yet. Tap the pot first.',
      needMilk: 'Milk first, then froth.',
      full:     "That one's full.",
      oneStep:  'One step at a time!',          // Session 73: out-of-turn touch, followed by the current step
      notYourMug: 'Into the mug you picked up!',
    },
    mugs: ['Mug_1', 'Mug_2', 'Mug_3'],   // Blender names; any of them can be the cup
    // The tabletop mugs may be dragged across (world units, glTF axes).
    table: { x: [-17.15, -15.05], z: [-15.3, -10.95], top: 3.34 },
    holdToPour: 0.35,     // seconds a tool must hover over a mug before it pours
    coffeeFill: 0.55,     // how much of a mug one pot fills
    milkFill:   0.40,     // how much one milk pour adds
    // Session 34/35: MokaPour/MilkPour/Froth all came back from Blender far
    // longer than intended (MilkPour is actually 10.75s, MokaPour 6.58s,
    // Froth 14.5s — only MokaBrew's 3.0s matched). `pourSeconds` is the
    // length a coffee/milk pour is SUPPOSED to take; coffee.js plays the
    // real clip at whatever speed lands it on this number, rather than
    // timing the fill/tilt math off the clip's own (bloated) duration —
    // that mismatch was also why the carton looked like it was still
    // standing upright with milk already coming out of it.
    pourSeconds: 2.4,
    frothSeconds: 2.6,    // how long the frother works the cup (same fix, off Froth's real 14.5s)
    doneDelay: 900,       // ms between the foam settling and the popup
    // Session 35: from the ordinary lean-in eye, a mug's own rim hides its
    // contents — fine for pouring blind, but the foam (and the latte-art
    // heart on it) never actually came into view, which is what Apoorva
    // meant by "the latte art at the end is not visible." The moment a cup
    // is done, coffee.js looks almost straight down at THAT mug (whichever
    // of the three it was) from `offset` world-units away, holds for
    // `holdMs`, then eases back to `lean`. Set to null to skip the reveal.
    reveal: {
      // Session 35 first tried [0, 1.3, 0.6] — close enough that the foam's
      // flat box faces and the mug's blocky rim stopped reading as a cup at
      // all ("doesn't look like a cappuccino"). This is a straight-down
      // look (small x/z so it clears the pot/milk/frother's home spots,
      // which all sit roughly north of every mug — a horizontal approach
      // from that side put them right behind the mug in frame) from far
      // enough out that the low-poly foam/mug reads the way it does in the
      // ordinary lean view, just close enough to actually see the heart.
      offset: [0, 2.4, 0.15],
      speed: 1.3,
      holdMs: 2200,
    },
    coffeeColor: 0x2a1509,
    latteColor:  0x9a6a45,
    milkColor:   0xf3ede2,
    // Interaction sounds. Empty = silent, same convention as `voice`.
    sfx: {
      brew:    '../Sound%20Effect/moka%20pot.mp3',
      pour:    '../Sound%20Effect/coffee%20pouring.mp3',
      froth:   '../Sound%20Effect/frother.mp3',
      mugMove: '../Sound%20Effect/moving%20the%20coffe%20mug.mp3',
    },
    sfxVolume: 0.8,
  },

  // -------------------------------------------------------------------------
  //  The oven (oven.js) — Session 20.
  //
  //  The double oven under the hob (west wall of the kitchen, glTF x ≈ -15.9,
  //  z -7.5…-2.6). Finding the `dessert` star plays the `OvenOpen` clip from
  //  MeraGHAR.glb once: both doors drop open on their bottom hinges, the
  //  cupcake tray (left) and cookie tray (right) slide out, steam rises. The
  //  doors then stay open. `lean` crouches the view in front of it while the
  //  popup talks, same conventions as `coffee.lean` (yaw +PI/2 looks west,
  //  pitch negative = down); set it to null to keep the walking view.
  // -------------------------------------------------------------------------
  oven: {
    clip: 'OvenOpen',
    sfx: 'oven',   // id into CONFIG.sfx — the door clunk + tray slide, one clip
    lean: {
      // Back and up a little, aimed at the hob: the popup covers the middle
      // of the screen, so the open ovens are framed in the band beneath it.
      eye:   [-12.5, 3.0, -5.05],
      yaw:   1.571,
      pitch: -0.35,
      speed: 1.3,
      standLabel: 'Step back',
    },
  },

  // Opens by itself when the cup is finished (coffee.js → main.js). Session
  // 28: the opening line about home coffee now lives on the `coffee` star
  // itself, so this is just the café half of the thought. Voice: None.
  coffeeDone: {
    kicker: 'The coffee station',
    lines: [
      { text: 'But I still love finding good cafés.\nI definitely spend more money on them than I should.' },
    ],
  },


  // Meshes excluded from the collision mesh (they still render).
  // Door leaves so a swinging door can never trap the visitor; the chair
  // because it moves; the screen and power pad because they are click
  // targets, not obstacles.
  colliderExclude: [
    'Door', 'Door.001', 'Door.002',
    // The gate leaves, same reasoning as the door leaves above: a swinging
    // slab makes a poor wall, and the arch is the only way into the garden,
    // so the walker would have been stopped dead by a gate that hadn't quite
    // finished opening. The posts and the head of the arch still collide —
    // they stay in `Arch`.
    'GardenGate_L', 'GardenGate_R',
    'Chair', 'ChairWheels', 'Monitor_Screen', 'Power_Button',
    // Ride on the studio door (see `attach` on Door.001) — same reasoning
    // as the leaves: the tape spans the whole doorway at head height.
    'Caution sign', 'Caution tape',
  ],

  // Meshes not rendered at all.
  // `ExteriorDoor_Hall` — the redundant front-door leaf that was never
  // actually in the wall opening, see the note in `doors` above. `hide`
  // already excludes from collision too (collider.js), so it doesn't need
  // to also be in colliderExclude.
  // Runtime colour overrides, by mesh name — applied on load, replacing the
  // mesh's Blender palette colour. Rug.002 is the living-room/hall rug (was
  // off-white); it's now a darker shade of the walls' dusty purple (#554A76).
  recolor: {
    'Rug.002': '#3B3154',
  },

  hide: ['ExteriorDoor_Hall'],

  // Session 47: "ARTISTIC_BRAINS_" neon sign reads a tad bold. The sign is
  // baked, bevelled tube geometry (session-32), so rather than re-export the
  // GLB, main.js squeezes the tubes at load: every vertex moves inward along
  // the in-plane (x/y) part of its smoothed normal by `amount` world units.
  // The round bevel's sides move the full amount, the flat front/back faces
  // barely move, so strokes get thinner without the letters caving in.
  // Checked in a headless render: 0.045 per side takes strokes from ~28px
  // to ~25px at a normal viewing distance (roughly 10-12% thinner) with
  // clean edges and no artifacts. 0.02 was barely visible. 0 turns it off.
  neonThin: { mesh: 'NeonSign_Text', amount: 0.045 },

  // Session 48: the triangular gable ends of the low roof over the hall /
  // living room flickered (z-fighting), from outside and from inside. Each
  // end of `Roof_Hall_Low` is a triangle at exactly x -20.03 / 5.10 — the
  // same plane as the inner faces of the `Siding_Gables` boards and the
  // `Rake_S_*` trim that sit over it (measured in MeraGHAR.blend). main.js
  // pushes just those two triangles `inset` units into the roof, so the
  // boards and trim sit cleanly in front from outside, and the triangle
  // cleanly hides them from inside. Slopes are untouched.
  gableInset: { mesh: 'Roof_Hall_Low', inset: 0.06 },

  // -------------------------------------------------------------------------
  //  Thresholds.
  //
  //  All three doorways ARE properly cut through the model now (verified by
  //  raycasting the .blend: the only thing in the way is the door leaf
  //  itself, which is excluded from collision). These boxes remain because a
  //  doorway still sits on the *edge* of its floor slab — for the thickness
  //  of the wall there is a hairline of nothing underfoot, and without a
  //  threshold height the walker reads that as a hole and refuses to cross.
  // -------------------------------------------------------------------------
  doorways: [
    { id: 'front',   floor: 0.00,  box: { x: [-18.75, -17.20], y: [-2, 5.2],    z: [-24.60, -21.90] } },
    { id: 'studio',  floor: 7.72,  box: { x: [-1.30, 1.68],    y: [7.4, 12.6],  z: [-13.75, -12.95] } },
    { id: 'bedroom', floor: 15.21, box: { x: [-13.90, -10.70], y: [14.9, 20.5], z: [-13.75, -12.95] } },
    // The garden arch is a real cut opening and its clear height is now
    // 4.43–5.13 against a 4.35 capsule, so this is only here to keep the
    // margin at the very edges comfortable.
    { id: 'arch',    floor: 0.00,  box: { x: [-3.50, -0.70],   y: [-2, 5.4],    z: [-37.00, -34.10] } },
  ],

  // Only these may be climbed a full `stepUp` at a time. Everything else is
  // limited to `stepSmall`, which is what stops the visitor from strolling up
  // onto the sofa or the kitchen counter.
  stairMeshes: [
    'Stairs', 'Stairs.001', 'Platform1', 'Platform2', 'Porch_Step',
  ],

  // -------------------------------------------------------------------------
  //  Session 72: the garden butterfly (butterfly.js). Mostly flutters round
  //  the garden; now and then lands on top of a rose bush for a few seconds.
  //  Garden, world space: grass x -19.4..4.4, z -50..-34.5, ground y 0.
  //  Rose bush tops are at y ~3.5; the eye is at 3.4.
  // -------------------------------------------------------------------------
  // Session 79: the fridge tips over east and leans on the wall (fridge.js).
  fridge: { mesh: 'Fridge', sfx: 'fridgeTumble', maxAngle: 0.76 },

  butterfly: {
    url: './src/assets/butterfly.glb',
    stripFromHouse: ['Butterfly'],       // the Blender rig, if it's ever in MeraGHAR.glb
    // Model units -> world. The wings span ~125.6 model units, so 0.0048
    // gives ~0.6 units (~26 cm): storybook-big, so it reads from the path.
    scale: 0.0048,
    pivot: [0, 0.1, -5],                 // model point that sits on the leaf (between the feet)
    start: [-9, 3.4, -42],
    // Where it wanders. Kept clear of the trees and the swing chair (east,
    // x > -4), the shelf and birdhouse (north, z > -39.4) and the lamp
    // (west); above the little table (y 2.7).
    flyBox: { x: [-15.0, -4.6], y: [2.6, 4.6], z: [-46.3, -39.8] },
    // RoseBush.003 is left out: it sits behind the swing chair and the tree,
    // so every path to it would go through them.
    roseBushes: ['RoseBush', 'RoseBush.001', 'RoseBush.002', 'RoseBush.004', 'RoseBush.005'],
    spotsPerBush: 3,
    speed: 1.5,           // units/s cruising
    steer: 2.2,           // how quickly it turns toward where it's going
    flapHz: 7,            // wingbeats per second in flight
    flyTime: [9, 18],     // seconds of flying before it thinks about landing
    landChance: 0.35,     // ...and the odds it does (otherwise it keeps flying)
    perchTime: [4, 8],    // seconds sat on a bush
    spookRadius: 2.2,     // walk this close and it takes off early
    hoverAbove: 0.7,      // hovers this far above the spot before settling
    takeoffLift: 1.0,
    bob: 0.06,            // up-down per wingbeat
    sway: 0.18,           // side-to-side wander
    // Wing angles, radians, relative to the modelled pose (wings ~38° up).
    wingUp: 46 * Math.PI / 180,     // nearly vertical, wings almost touching
    wingDown: -44 * Math.PI / 180,  // just below flat
    wingGlide: -22 * Math.PI / 180,
    wingBask: -34 * Math.PI / 180,  // perched, opened out flat
    perchWingPeriod: 3.2,
  },
};

// Quick URL switches, handy on a slow machine or when profiling:
//   ?lowres      render at 1x pixel ratio (turns the supersampling off)
//   ?debug       open the coordinate readout straight away
const q = new URLSearchParams(location.search);
if (q.has('lowres')) CONFIG.lowres = true;
if (q.has('debug')) CONFIG.startDebug = true;

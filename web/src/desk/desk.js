// ---------------------------------------------------------------------------
//  The bedroom desk.
//
//  Flow:
//    invite  — the chair sits turned out ~15°, a star hovers over the seat
//    sitting — you walk to the chair, the view drops into it and the chair
//              swings straight as you land
//    seated  — you are looking at the desk; the tower's power pad pulses
//    booting — power pressed: you lean in to the monitor while it wakes
//    on      — the desktop is up and you can use it (see desktop.js)
//
//  Getting up again: Esc, or the button at the bottom of the screen. Esc
//  backs out of the desktop one layer at a time first — start menu, then the
//  open window — so it never throws you out of the chair by surprise.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { CONFIG } from '../config/config.js';
import { findByName } from '../util/util.js';
import { Desktop, VW, VH } from '../desktop/desktop.js';
import { makeGlassStar } from '../glass-star/glass-star.js';
import { playSfx } from '../sfx/sfx.js';
import { track } from '../analytics/analytics.js';

const BEDROOM = CONFIG.rooms.find((r) => r.id === 'bedroom')?.bounds ?? null;

const D = CONFIG.desk;

export class Desk {
  constructor(scene, root, camera, walker) {
    this.scene = scene;
    this.camera = camera;
    this.walker = walker;
    this.state = 'invite';
    this.t = 0;
    this.onState = null;          // set by main.js, drives the on-screen hints

    // ---- chair, on a pivot so it can swing -------------------------------
    const parts = D.chairParts.map((n) => findByName(root, n)).filter(Boolean);
    if (parts.length !== D.chairParts.length) {
      console.warn('[desk] missing chair parts:', D.chairParts);
    }
    this.chairPivot = null;
    if (parts.length) {
      const box = new THREE.Box3();
      for (const p of parts) box.expandByObject(p);
      const c = box.getCenter(new THREE.Vector3());
      const pivot = new THREE.Object3D();
      pivot.name = 'Chair__pivot';
      pivot.position.set(c.x, box.min.y, c.z);
      scene.add(pivot);
      for (const p of parts) pivot.attach(p);   // attach() keeps them in place
      pivot.rotation.y = D.inviteAngle;
      this.chairPivot = pivot;
    }
    this.chairAngle = D.inviteAngle;

    // ---- the star over the seat ------------------------------------------
    // Same glass ✦ as the story markers (glass-star.js), but this one
    // keeps `occlude: false`. It hovers about a unit above the seat, which
    // puts its lower half behind the chair back from most of the room, and a
    // "click me to sit down" prompt that the chair eats is no prompt at all.
    // Nothing leaks through walls as a result: the star only exists in the
    // `invite` state, and the `inBedroom` gate below hides it — and its click
    // target — the moment the visitor steps out of the room.
    this.star = makeGlassStar(D.star.size, D.star.color, { occlude: false, clear: true });
    this.star.position.set(...D.star.pos);
    this.star.renderOrder = 1200;
    scene.add(this.star);

    // A slightly larger invisible disc so the star is easy to hit.
    this.starHit = new THREE.Mesh(
      new THREE.CircleGeometry(D.star.size * 1.7, 16),
      new THREE.MeshBasicMaterial({ visible: false, depthTest: false })
    );
    this.starHit.position.copy(this.star.position);
    this.starHit.userData.deskTarget = 'star';
    scene.add(this.starHit);

    // ---- the machine ------------------------------------------------------
    this.desktop = new Desktop({
      // Session 79: every clickable link on the desktop — the résumé
      // download, project/contact links, everything with a `url` in
      // portfolio.js — funnels through here, so this one hook covers all
      // of them.
      onOpen: (url) => { track('desktop_link_click', { url }); window.open(url, '_blank', 'noopener'); },
      onPowerOff: () => this.powerOff(),
    });

    // ---- screen ----------------------------------------------------------
    this.screen = findByName(root, D.screenMesh);
    if (this.screen) {
      this.screen.material = this.screen.material.clone();
      const m = this.screen.material;
      m.color.setHex(0x000000);          // idle = black, not the old green
      m.emissive = new THREE.Color(0x000000);
      m.emissiveIntensity = 1;
      m.roughness = 0.35;
      m.metalness = 0;
      m.toneMapped = false;

      this.screenTex = new THREE.CanvasTexture(this.desktop.canvas);
      this.screenTex.colorSpace = THREE.SRGBColorSpace;
      this.screenTex.minFilter = THREE.LinearFilter;
      this.screenTex.magFilter = THREE.LinearFilter;
      this.screenTex.generateMipmaps = false;
      // The screen quad's UVs run bottom-up relative to the way you see it
      // from the chair, so the canvas lands upside down. Flip V here rather
      // than in Blender, so re-exporting the model can't undo it.
      this.screenTex.wrapT = THREE.RepeatWrapping;
      this.screenTex.repeat.y = -1;
      this.screenTex.offset.y = 1;

      this.screenBox = new THREE.Box3().setFromObject(this.screen);
    } else {
      console.warn(`[desk] no mesh named "${D.screenMesh}" — re-export the model`);
    }

    // ---- power pad on the front of the tower ------------------------------
    this.power = findByName(root, D.powerMesh);
    this.halo = null;
    if (this.power) {
      this.power.material = this.power.material.clone();
      this.power.material.emissive = new THREE.Color(0xffb347);
      this.power.material.emissiveIntensity = 0;

      const box = new THREE.Box3().setFromObject(this.power);
      const c = box.getCenter(new THREE.Vector3());
      this.halo = makePowerHalo(D.powerHalo.radius, D.powerHalo.color);
      this.halo.position.set(box.max.x + 0.05, c.y, c.z);
      this.halo.rotation.y = Math.PI / 2;   // face east, toward the chair
      this.halo.visible = false;
      this.halo.renderOrder = 1200;
      scene.add(this.halo);

      this.powerHit = new THREE.Mesh(
        new THREE.CircleGeometry(D.powerHalo.radius * 2.2, 16),
        new THREE.MeshBasicMaterial({ visible: false, depthTest: false })
      );
      this.powerHit.position.copy(this.halo.position);
      this.powerHit.position.x += 0.02;
      this.powerHit.rotation.y = Math.PI / 2;
      this.powerHit.userData.deskTarget = 'power';
      this.powerHit.visible = false;
      scene.add(this.powerHit);
    } else {
      console.warn(`[desk] no mesh named "${D.powerMesh}" — re-export the model`);
    }

    this.setState('invite');
  }

  // -------------------------------------------------------------------------

  /**
   * True while the visitor is standing in the bedroom.
   *
   * The desk ✨ is drawn without depth testing so the chair back can't eat it
   * (see the constructor), which is exactly what let it shine through the
   * closed bedroom door from the landing outside. Session 4 recorded a gate
   * for this; it is not in the code — presumably lost in the Session 7
   * config/rebuild — so here it is again, and this time both the star's
   * visibility and its click target hang off it.
   */
  get inBedroom() {
    const b = BEDROOM;
    if (!b) return true;
    const f = this.walker.feet;
    return f.x > b.x[0] && f.x < b.x[1] &&
           f.y > b.y[0] && f.y < b.y[1] &&
           f.z > b.z[0] && f.z < b.z[1];
  }

  /** Meshes the pointer should be tested against, for this state. */
  get targets() {
    if (this.state === 'invite') return this.inBedroom ? [this.starHit] : [];
    if (this.state === 'seated') return this.powerHit ? [this.powerHit] : [];
    return [];
  }

  /** True while the pointer should be talking to the desktop, not the room. */
  get screenLive() {
    return !!this.screen && this.walker.seated && this.desktop.on;
  }

  setState(s) {
    this.state = s;
    this.t = 0;
    this.star.visible = s === 'invite';
    this.starHit.visible = s === 'invite';
    if (this.halo) this.halo.visible = s === 'seated';
    if (this.powerHit) this.powerHit.visible = s === 'seated';
    this.onState?.(s);
  }

  /**
   * Something in `targets` was clicked. `walkTo` is main.js's router, used to
   * get the visitor over to the chair before they drop into it.
   */
  activate(target, walkTo) {
    if (target === 'star' && this.state === 'invite') {
      this.setState('walking');
      const p = new THREE.Vector3(...D.standPoint);
      const arrived = walkTo(p);
      // If the route failed outright, just sit down from where we are.
      if (!arrived) this.beginSit();
      return true;
    }
    if (target === 'power' && this.state === 'seated') {
      this.powerOn();
      return true;
    }
    return false;
  }

  beginSit() {
    this.setState('sitting');
    playSfx('deskChair');
    this.walker.sit({
      eye: D.seat.eye,
      yaw: D.seat.yaw,
      pitch: D.seat.pitch,
      speed: D.sitSpeed,
    });
  }

  powerOn() {
    if (this.desktop.on) return;
    this.desktop.turnOn();
    playSfx('desktopOn');
    if (this.power) this.power.material.emissiveIntensity = 1.4;
    this.setState('booting');
    this.lean(true);
  }

  /** The start menu's "Turn off computer" — the screen goes dark and you are
   *  back to sitting at a desk with a switched-off machine. */
  powerOff() {
    this.desktop.turnOff();
    this.screenDark();
    this.setState('seated');
    this.lean(false);
  }

  standUp() {
    if (this.state === 'invite' || this.state === 'walking') return false;
    this.walker.stand();
    // Session 48: getting up switches the machine off — screens are only on
    // while you're using them. Sitting back down gets the power pad again.
    if (this.desktop.on) {
      this.desktop.turnOff();
      this.screenDark();
      if (this.power) this.power.material.emissiveIntensity = 0;
    }
    // The chair swings back out, star and all, ready to be sat in again.
    this.setState('invite');
    return true;
  }

  /** Esc, routed: close whatever the desktop has open, else get up. */
  escape() {
    if (this.screenLive && this.desktop.escape()) return true;
    return this.standUp();
  }

  /** ?desk — straight into the chair with the machine already on, for
   *  working on the screen itself without walking the house first. */
  sitNow() {
    this.walker.feet.set(...D.standPoint);
    this.walker.smoothY = this.walker.feet.y;
    this.beginSit();
    this.walker.seatT = 1;
    this.walker.updateSeated(0);
    this.setState('seated');
    this.powerOn();
  }

  // ---- leaning in ---------------------------------------------------------

  /**
   * Sitting back in the chair the monitor is a small rectangle across the
   * room, which is fine for "there is a computer there" and useless for
   * reading. Turning it on leans you in until the screen fills the view —
   * far enough back that the whole screen still fits whatever shape the
   * browser window happens to be.
   */
  lean(inward) {
    if (!this.screen) return;
    const eye = inward ? this.screenEye() : new THREE.Vector3(...D.seat.eye);
    const c = this.screenBox.getCenter(new THREE.Vector3());
    const dir = c.clone().sub(eye);
    this.walker.sit({
      eye: eye.toArray(),
      yaw: Math.atan2(-dir.x, -dir.z),
      pitch: Math.asin(THREE.MathUtils.clamp(dir.y / (dir.length() || 1), -1, 1)),
      speed: inward ? D.leanSpeed : D.leanSpeed * 1.4,
    });
  }

  /** Where to sit so the whole screen fits comfortably in the viewport. */
  screenEye() {
    const box = this.screenBox;
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    // The glass is a flat quad: the axis with no thickness is the one we back
    // away along, in whichever direction the chair is on.
    const axis = size.x < size.z ? 'x' : 'z';
    const w = axis === 'x' ? size.z : size.x;
    const h = size.y;

    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const aspect = this.camera.aspect || 1.6;
    const dW = (w / D.screenFill.width) / (2 * tanV * aspect);
    const dH = (h / D.screenFill.height) / (2 * tanV);
    const d = Math.max(dW, dH, D.leanMin);

    const eye = c.clone();
    eye[axis] += Math.sign(D.seat.eye[axis === 'x' ? 0 : 2] - c[axis]) * d;
    return eye;
  }

  // ---- the screen as a pointer surface ------------------------------------

  /** Where a ray lands on the monitor, in the desktop's own coordinates. */
  screenPick(raycaster) {
    if (!this.screenLive) return null;
    const hit = raycaster.intersectObject(this.screen, false)[0];
    if (!hit || !hit.uv) return null;
    // u runs left→right and v top→bottom as the screen is seen from the
    // chair, which is exactly how the canvas is laid out.
    return { x: hit.uv.x * VW, y: hit.uv.y * VH };
  }

  /** True when the point is over something the desktop would react to. */
  hoverScreen(p) {
    if (!p) { this.desktop.pointerOut(); return false; }
    return this.desktop.pointerMove(p.x, p.y);
  }

  clickScreen(p) { return this.desktop.click(p.x, p.y); }
  wheelScreen(p, dy) { return this.desktop.wheel(p.x, p.y, dy); }

  /** A screen is a light, not a lit surface: the canvas goes on as emission
   *  only, with the diffuse colour left black. Room light then can't wash it
   *  out, and the colours arrive exactly as they were drawn. */
  screenLit() {
    const m = this.screen.material;
    if (m.emissiveMap === this.screenTex) return;
    m.map = null;
    m.emissiveMap = this.screenTex;
    m.emissive = new THREE.Color(0xffffff);
    m.emissiveIntensity = D.screenGlow;
    m.color.setHex(0x000000);
    m.needsUpdate = true;
  }

  screenDark() {
    if (!this.screen) return;
    const m = this.screen.material;
    m.map = null;
    m.emissiveMap = null;
    m.emissive.setHex(0x000000);
    m.color.setHex(0x000000);
    m.needsUpdate = true;
  }

  // -------------------------------------------------------------------------

  update(dt) {
    this.t += dt;

    // Chair swings between the invite angle and square-to-the-desk.
    if (this.chairPivot) {
      const sittingIn = this.state !== 'invite' && this.state !== 'walking';
      const want = sittingIn ? 0 : D.inviteAngle;
      this.chairAngle += (want - this.chairAngle) * Math.min(1, dt * D.swingSpeed);
      this.chairPivot.rotation.y = this.chairAngle;
    }

    // Star: only in the bedroom, then face the camera, bob and lean.
    const inviting = this.state === 'invite' && this.inBedroom;
    this.star.visible = inviting;
    this.starHit.visible = inviting;
    if (this.star.visible) {
      this.star.position.y = D.star.pos[1] + Math.sin(this.t * 1.8) * 0.16;
      this.star.poseStar(this.camera, this.t, 0.6);
      const s = 1 + Math.sin(this.t * 2.6) * 0.07;
      this.star.scale.setScalar(s);
      this.starHit.position.copy(this.star.position);
      this.starHit.quaternion.copy(this.camera.quaternion);
    }

    // Once the walk to the chair is done, drop in.
    if (this.state === 'walking' && !this.walker.target && !this.walker.path.length) {
      this.beginSit();
    }

    if (this.state === 'sitting' && this.walker.seatedStill) {
      // Sitting down in front of a machine that is already running: go
      // straight back to using it rather than asking for power again.
      if (this.desktop.on) { this.setState('on'); this.lean(true); }
      else this.setState('seated');
    }

    // The power pad breathes while it waits to be pressed, and stays lit once
    // the machine is running.
    if (this.power) {
      if (this.state === 'seated') {
        const pulse = 0.45 + Math.sin(this.t * 3.0) * 0.35;
        this.power.material.emissiveIntensity = pulse;
        if (this.halo) this.halo.material.opacity = 0.35 + pulse * 0.4;
      } else if (!this.desktop.on) {
        this.power.material.emissiveIntensity = 0;
      }
    }

    // The desktop runs on its own clock; pixels are only pushed up to the
    // texture when it has actually redrawn something.
    if (this.desktop.on) {
      this.desktop.update(dt);
      if (this.desktop.render()) {
        this.screenLit();
        this.screenTex.needsUpdate = true;
      }
      if (this.state === 'booting' && this.desktop.booted) this.setState('on');
    }
  }
}

// ---------------------------------------------------------------------------

function makePowerHalo(radius, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 9;
  g.lineCap = 'round';
  // the standard power glyph: a broken ring with a stem
  g.beginPath();
  g.arc(64, 68, 34, -Math.PI * 0.36, Math.PI * 1.36);
  g.stroke();
  g.beginPath();
  g.moveTo(64, 22);
  g.lineTo(64, 62);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({
      map: tex, color, transparent: true, opacity: 0.7,
      depthTest: false, depthWrite: false, toneMapped: false,
    })
  );
}

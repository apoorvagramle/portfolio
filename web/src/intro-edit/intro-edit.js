// intro-edit.js — open the site with ?introedit to place Apoorva's sprite and
// rewrite the intro copy right in the page.
//
//   drag her        — click-drag her in the scene to move her on the ground
//   sliders         — height, left/right, forward/back
//   text box        — the intro lines (format explained in the panel)
//
// Everything saves to localStorage ('porchIntroEdit') as you go, and only
// applies when ?introedit is in the URL — visitors never see a half-finished
// edit. When it looks right, the values get written into CONFIG.porchIntro
// (pos, height) and INTRO_BEATS in intro.js.

export const EDIT_KEY = 'porchIntroEdit';

export function loadEdit() {
  try { return JSON.parse(localStorage.getItem(EDIT_KEY) || 'null'); } catch { return null; }
}
function saveEdit(e) {
  try { localStorage.setItem(EDIT_KEY, JSON.stringify(e)); } catch { /* private mode */ }
  if (window.MERAGHAR) window.MERAGHAR.introEdit = e;
}

export function beatsToText(beats) {
  return beats.map((b) => b.map((l) => `${l.gap ? '+' : ''}${l.size} | ${l.text}`).join('\n')).join('\n---\n');
}
export function textToBeats(txt) {
  return txt.split(/\n\s*---\s*\n/).map((block) => block.split('\n').map((s) => s.trim()).filter(Boolean).map((line) => {
    const m = line.match(/^(\+?)\s*(xl|lg|md|sm|sub)\s*\|\s*(.*)$/i);
    if (!m) return { text: line, size: 'md' };
    const out = { text: m[3], size: m[2].toLowerCase() };
    if (m[1]) out.gap = true;
    return out;
  })).filter((b) => b.length);
}

// Ground height under the sprite (feet on the grass, the step or the deck).
// Numbers from the porch meshes in MeraGHAR.blend (glTF axes).
function groundY(x, z) {
  if (x > -22.3 && x < -18.53 && z > -25.7 && z < -20.8) return 0.36;   // Porch_Deck
  if (x > -23.4 && x <= -22.3 && z > -24.95 && z < -21.55) return 0.2;  // Porch_Step
  return 0;
}


export function attachEditor({ THREE, camera, canvas, greeter, overlay, beats }) {
  const edit = loadEdit() || {};
  const st = {
    pos: greeter.mesh.position.toArray().map((v) => +v.toFixed(3)),
    height: +greeter.height.toFixed(3),
    beats: edit.beats || beats,
  };
  const persist = () => { saveEdit({ ...st }); };
  persist();

  overlay.root.classList.add('editing');

  const panel = document.createElement('div');
  panel.id = 'introEdit';
  panel.innerHTML = `
    <h3>Intro editor <button type="button" data-act="min" style="float:right;padding:2px 8px">–</button></h3>
    <div class="body">
      <small>Drag her in the scene, or use the sliders. Saves as you go.</small>
      <label>Height <input type="range" data-k="h" min="2.5" max="6" step="0.05"><output data-o="h"></output></label>
      <label>Left ↔ right <input type="range" data-k="z" min="-28" max="-18" step="0.05"><output data-o="z"></output></label>
      <label>Near ↔ far <input type="range" data-k="x" min="-28" max="-18.7" step="0.05"><output data-o="x"></output></label>
      <div class="row"><button type="button" data-act="wave">Wave</button></div>
      <hr>
      <h3>Intro text</h3>
      <small>One line per row: <b>size | text</b>. Sizes: xl lg md sm sub.
        <b>*word*</b> = pink. A <b>+</b> before the size adds space above.
        <b>---</b> on its own row starts the next screen. Space advances the intro.</small>
      <textarea spellcheck="false"></textarea>
      <div class="row">
        <button type="button" class="pink" data-act="apply">Apply text &amp; replay</button>
        <button type="button" data-act="copy">Copy settings</button>
        <button type="button" data-act="reset">Reset all</button>
      </div>
      <div class="msg"></div>
    </div>`;
  document.body.append(panel);
  panel.addEventListener('keydown', (e) => e.stopPropagation());
  panel.addEventListener('pointerdown', (e) => e.stopPropagation());

  const $ = (s) => panel.querySelector(s);
  const msg = (t) => { $('.msg').textContent = t; clearTimeout(msg.t); msg.t = setTimeout(() => { $('.msg').textContent = ''; }, 2600); };
  const ta = $('textarea');
  ta.value = beatsToText(st.beats);

  const sliders = { h: $('[data-k=h]'), z: $('[data-k=z]'), x: $('[data-k=x]') };
  const outs = { h: $('[data-o=h]'), z: $('[data-o=z]'), x: $('[data-o=x]') };
  const syncUI = () => {
    sliders.h.value = st.height; sliders.z.value = st.pos[2]; sliders.x.value = st.pos[0];
    outs.h.textContent = st.height.toFixed(2); outs.z.textContent = st.pos[2].toFixed(2); outs.x.textContent = st.pos[0].toFixed(2);
  };
  const place = (x, z) => {
    st.pos = [+x.toFixed(3), groundY(x, z), +z.toFixed(3)];
    greeter.mesh.position.set(...st.pos);
  };
  syncUI();

  sliders.h.addEventListener('input', () => { st.height = +(+sliders.h.value).toFixed(3); greeter.setHeight(st.height); syncUI(); persist(); });
  sliders.z.addEventListener('input', () => { place(st.pos[0], +sliders.z.value); syncUI(); persist(); });
  sliders.x.addEventListener('input', () => { place(+sliders.x.value, st.pos[2]); syncUI(); persist(); });

  panel.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'min') panel.classList.toggle('min');
    if (act === 'wave') greeter.wave(2);
    if (act === 'apply') {
      st.beats = textToBeats(ta.value);
      if (!st.beats.length) { msg('Nothing to show — add some lines.'); return; }
      persist(); location.reload();
    }
    if (act === 'copy') {
      const json = JSON.stringify({ pos: st.pos, height: st.height, beats: textToBeats(ta.value) }, null, 2);
      try { await navigator.clipboard.writeText(json); msg('Copied.'); } catch { msg('Copy blocked — saved in the browser anyway.'); }
    }
    if (act === 'reset') {
      if (!confirm('Reset the sprite and text to what is saved in the code?')) return;
      try { localStorage.removeItem(EDIT_KEY); } catch { /* ignore */ }
      location.reload();
    }
  });

  // Drag her across the ground.
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(), hitP = new THREE.Vector3();
  const grab = new THREE.Vector3();
  let dragging = false;
  const rect = () => canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
  const groundPoint = (e) => {
    const r = rect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    plane.set(new THREE.Vector3(0, 1, 0), -greeter.mesh.position.y);
    return ray.ray.intersectPlane(plane, hitP) ? hitP : null;
  };
  canvas?.classList.add('edit-drag');
  addEventListener('pointerdown', (e) => {
    if (e.target.closest?.('#introEdit, .intro-tile')) return;
    if (!greeter.hit(e.clientX, e.clientY, camera, rect())) return;
    const p = groundPoint(e); if (!p) return;
    dragging = true; grab.copy(greeter.mesh.position).sub(p);
    canvas?.classList.add('dragging-greeter');
    e.stopPropagation(); e.preventDefault();
  }, { capture: true });
  addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const p = groundPoint(e); if (!p) return;
    place(Math.min(-18.7, p.x + grab.x), p.z + grab.z); syncUI();
  }, { capture: true });
  addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false; canvas?.classList.remove('dragging-greeter'); persist(); msg('Saved.');
  }, { capture: true });

  return st;
}

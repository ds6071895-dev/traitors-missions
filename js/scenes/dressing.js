/* ------------------------------------------------------------------
   dressing.js — the room where you decide who you are.

   A turntable, a key light and one figure, cycling through the three
   things you will actually see it do all night: standing about,
   walking, and reacting. Showing the walk here is the point — a coat
   colour is a still image, but the thing you are choosing is a person
   who moves, and picking one from a mannequin is picking blind.

   Every control is a `<select>`. That is not laziness: `UINav` cycles
   a select with left and right, so the whole screen is dialable on a
   gamepad, tappable on a phone and typeable on a keyboard without one
   line of input code in this file.
------------------------------------------------------------------ */
const Dressing = (() => {

  const el = (id) => document.getElementById(id);

  let view = null, scene = null, camera = null;
  let fig = null, turntable = null;
  let draft = null;
  let back = 'play';
  let clock = 0, cycle = 0;

  /* ---------------- the studio ---------------- */

  function build() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#0b1018');
    scene.fog = new THREE.Fog('#0b1018', 6, 16);

    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);

    /* Three lights, and the rim is the one doing the work: a flat-
       shaded figure against a dark ground has no silhouette without
       something behind it. */
    const key = new THREE.DirectionalLight('#fff2d8', 2.0);
    key.position.set(2.4, 3.4, 3.0);
    const fill = new THREE.DirectionalLight('#9fc4e8', 0.65);
    fill.position.set(-3.0, 1.6, 1.4);
    const rim = new THREE.DirectionalLight('#ffd08a', 1.5);
    rim.position.set(-1.4, 2.2, -3.4);
    scene.add(key, fill, rim, new THREE.HemisphereLight('#4a6a8c', '#14181f', 0.85));

    turntable = new THREE.Group();
    scene.add(turntable);

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.25, 0.10, 24),
      new THREE.MeshLambertMaterial({ color: '#1a2230', flatShading: true }));
    disc.position.y = -0.05;
    turntable.add(disc);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.16, 0.026, 6, 32),
      new THREE.MeshLambertMaterial({ color: '#f2c14e', flatShading: true }));
    ring.position.y = 0.005;
    ring.rotation.x = Math.PI * 0.5;
    turntable.add(ring);

    view = { scene, camera };
    return view;
  }

  function dressFigure() {
    if (fig) { turntable.remove(fig); Figure.dispose(fig); fig = null; }
    fig = Figure.build({ look: draft, long: false });
    turntable.add(fig);
  }

  /* ---------------- the loop ----------------
     Idle, then a walk, then a wave, then round again. Each state runs
     long enough to read and short enough that nobody has to wait for
     the bit they wanted to see. */

  const BEATS = [
    { name: 'idle', dur: 3.2 },
    { name: 'walk', dur: 4.0 },
    { name: 'wave', dur: 2.4 },
  ];

  function frame(dt) {
    clock += dt;
    cycle += dt;
    let i = 0, acc = 0;
    for (; i < BEATS.length; i++) {
      if (cycle < acc + BEATS[i].dur) break;
      acc += BEATS[i].dur;
    }
    if (i >= BEATS.length) { cycle = 0; i = 0; }
    const beat = BEATS[i].name;

    if (fig) {
      Figure.setLocomotion(fig, beat === 'walk' ? 1.55 : 0, 0);
      Figure.setCheering(fig, beat === 'wave');
      Figure.setSpeaking(fig, false);
      // the turntable only turns while they are walking, so the walk
      // gets seen from every side and the idle stays readable
      turntable.rotation.y += dt * (beat === 'walk' ? 0.55 : 0.12);
      Figure.lookAt(fig, camera.position, { pitch: true });
      Figure.update(fig, dt, clock);
    }

    camera.position.set(0.62, 1.22, 3.15);
    camera.lookAt(0, 0.98, 0);
    Input.endFrame();
  }

  /* ---------------- the controls ---------------- */

  function buildRows() {
    const wrap = el('dress-rows');
    wrap.innerHTML = '';
    for (const row of Look.ROWS) {
      const line = document.createElement('div');
      line.className = 'dress-row';

      const label = document.createElement('span');
      label.className = 'dr-label';
      label.textContent = row.label;
      line.appendChild(label);

      const sel = document.createElement('select');
      sel.className = 'dr-select';
      sel.setAttribute('data-nav', '');
      sel.setAttribute('aria-label', row.label);
      row.list.forEach((item, i) => {
        const o = document.createElement('option');
        o.value = String(i);
        o.textContent = row.show ? row.show(i) : (row.label + ' ' + (i + 1));
        sel.appendChild(o);
      });
      sel.value = String(draft[row.key]);
      sel.addEventListener('change', () => {
        draft[row.key] = parseInt(sel.value, 10) || 0;
        dressFigure();
        paintSwatches();
      });
      line.appendChild(sel);

      if (row.swatch) {
        const sw = document.createElement('span');
        sw.className = 'dr-swatch';
        sw.dataset.key = row.key;
        line.appendChild(sw);
      }
      wrap.appendChild(line);
    }
    paintSwatches();
  }

  function paintSwatches() {
    for (const row of Look.ROWS) {
      if (!row.swatch) continue;
      const sw = document.querySelector('.dr-swatch[data-key="' + row.key + '"]');
      if (sw) sw.style.background = row.swatch(draft[row.key]);
    }
  }

  function syncSelects() {
    const sels = el('dress-rows').querySelectorAll('.dr-select');
    Look.ROWS.forEach((row, i) => { if (sels[i]) sels[i].value = String(draft[row.key]); });
    paintSwatches();
  }

  /* ---------------- lifecycle ---------------- */

  function enter(data) {
    back = (data && data.from) || 'play';
    draft = Look.normalise(Look.get());
    clock = 0; cycle = 0;
    if (!view) build();
    Engine.setView(view, frame);
    dressFigure();
    el('dress-name').value = Look.getName();
    buildRows();
    UINav.scan();
  }

  function commit() {
    Look.setName(el('dress-name').value);
    Look.save(draft);
    // the lobby may be open behind this; two other people are looking
    // at whatever we last told them
    if (Party.connected) Party.setProfile(Look.profile());
  }

  /* The menus behind this are drawn over the attract-mode ocean, and
     the studio took the view. Hand it back on the way out or the front
     door comes up on a black screen. */
  function exit() {
    commit();
    /* The menus behind this are drawn over the attract-mode ocean and
       the studio took the view, so hand it back — unless a night has
       started underneath us, in which case the show owns the view and
       putting an ocean in it would be the last thing anybody sees. */
    if (typeof Show === 'undefined' || !Show.running) Game.showAttract();
  }

  function init() {
    el('dress-save').onclick = () => { commit(); Screens.show(back); };
    el('dress-back').onclick = () => { commit(); Screens.show(back); };
    el('dress-random').onclick = () => {
      draft = Look.random();
      dressFigure();
      syncSelects();
    };
    el('dress-name').addEventListener('change', () => Look.setName(el('dress-name').value));

    Screens.register('dressing', { enter, exit });
  }

  function dispose() {
    if (fig) { Figure.dispose(fig); fig = null; }
    if (scene) Engine.disposeObject(scene);
    scene = null; camera = null; view = null; turntable = null;
  }

  return { init, dispose };
})();

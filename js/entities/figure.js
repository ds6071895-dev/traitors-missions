/* ------------------------------------------------------------------
   figure.js — the people.

   This file is the front door and nothing else. The person is built in
   three other places:

     figure-skeleton.js  the bones: real arms, short legs
     figure-body.js      the surfaces: a jacket, trousers, a face, hands
                         and hair, lofted and skinned onto those bones,
                         six draw calls a person and cached by build
     figure-anim.js      how they move — a gait that plants its feet,
                         sitting that actually sits, a face that talks,
                         eyes that look, and acts from figure-clips.js

   Everything the scenes already called is still here with the same
   meaning: `build`, `update`, `setSeated`, `setSpeaking`,
   `setLocomotion`, `setHolding`, `throwNow`, `throwProgress`,
   `THROW_AT`, `handAt`, `headAt`, `lookAt`, `setCheering`, `flinch`,
   `dispose` and `paletteFor`. New: `act` and `stopAct` for the clips,
   `setMood`, `pointAt`, `reachTo`, and `lod` for detail by distance.

   Appearance is still a `look` from `look.js`, resolved to colours
   before it arrives, or a `palette` for Claudia, who was never in the
   lobby. Colour is painted per person onto shared geometry, so eight
   contestants in two builds share two sets of buffers.
------------------------------------------------------------------ */
const Figure = (() => {

  const PALETTES = {
    claudia: { coat: '#14161d', trim: '#8d1230', skin: '#e9c3a4', hair: '#241a16',
               boot: '#0d0e12', legs: '#15161b', accent: '#c9a227', fabric: 'tweed' },
    green:   { coat: '#2f5d4a', trim: '#8fc0a0', skin: '#dfae86', hair: '#3b2a1e',
               boot: '#241f1a', accent: '#9fd6b4' },
    rust:    { coat: '#7a3b28', trim: '#d59a6a', skin: '#f0cfb0', hair: '#6d4a2a',
               boot: '#2b2119', accent: '#e0a86a' },
    slate:   { coat: '#3b4757', trim: '#9fb4c9', skin: '#c99a76', hair: '#181410',
               boot: '#20262e', accent: '#b8cde0' },
    plum:    { coat: '#4c2a4e', trim: '#c095c4', skin: '#e6bd9c', hair: '#2a1c22',
               boot: '#241a26', accent: '#d6a8da' },
    ochre:   { coat: '#7d6524', trim: '#dcc06a', skin: '#d9a67e', hair: '#4a3418',
               boot: '#2a2416', accent: '#efd694' },
    navy:    { coat: '#1f2f5a', trim: '#8fa6e0', skin: '#b98260', hair: '#140f0c',
               boot: '#161b29', accent: '#a9c0ff' },
    crimson: { coat: '#6e1a24', trim: '#e2838c', skin: '#efc6a6', hair: '#c28a4a',
               boot: '#24151a', accent: '#ff9aa4' },
    teal:    { coat: '#1d5a5c', trim: '#84d0cc', skin: '#8f5e42', hair: '#1a1210',
               boot: '#152324', accent: '#8ef0e6' },
  };
  const CAST_PALETTES = ['green', 'rust', 'slate', 'plum', 'ochre', 'navy', 'crimson', 'teal'];

  /* Trousers and eyes are not lobby choices; they are picked from a
     stable hash of the look, so everybody's screen agrees on them. */
  const TROUSERS = ['#2b2e35', '#3a3631', '#25272c', '#3d4149', '#33302c'];
  const IRIS = ['#3b2a1e', '#5a3d24', '#4f6f8f', '#5b7a52', '#6b5a3a', '#2e2219', '#6a7f96'];
  const SCLERA = '#e8e2d8', PUPIL = '#0b0a0a', MOUTH = '#4a1c22', TEETH = '#e6e0d2', GLINT = '#ffffff';

  const THROW_AT = 0.68;
  /* The toy proportions: the head grown to about a quarter of the
     height and lifted clear of the collar, a hand and a shoe a size up
     to go with it. The whole person is then scaled so the top of the
     head is still the height asked for — so the body under the big head
     is a smaller one, which is most of what makes it read as cute. */
  const HEAD_SCALE = 1.95, HEAD_LIFT = 0.035, HAND_SCALE = 1.22, FOOT_SCALE = 1.12;
  const SKY = FigureSkeleton.YR;
  const TOP = SKY.head + HEAD_LIFT + (SKY.crown - SKY.head) * HEAD_SCALE;
  const EYE_AT = (SKY.head + HEAD_LIFT + (SKY.eye - SKY.head) * HEAD_SCALE) / TOP;
  const SEAT_DROP = Math.max(0, SKY.hip - FigureSkeleton.SEAT.hip);

  /* Legacy: the head's size, for anything that sat things on the old one. */
  const HEAD = { cy: 0.075, rx: 0.075, ry: 0.115, rz: 0.098 };

  function hashOf(o) {
    const str = JSON.stringify(o);
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  const quality = () => {
    try { return GameState.data.settings.quality || 'medium'; } catch (e) { return 'medium'; }
  };

  /* ---------------- building one ---------------- */

  function build(opts = {}) {
    const o = Object.assign({ palette: null, look: null, height: 1.72, long: false,
                              hair: 'short', girth: 1 }, opts);

    let C;
    if (o.look) {
      C = Look.resolve(o.look);
    } else {
      const P = PALETTES[o.palette] || PALETTES.claudia;
      C = { coat: P.coat, trim: P.trim, skin: P.skin, hairColour: P.hair, boot: P.boot,
            legs: P.legs, accent: P.accent, hair: o.hair, hat: 'none', scarf: 'none',
            fabric: P.fabric || 'waxed', height: o.height, girth: o.girth, face: 'oval' };
    }
    const h = hashOf(o.look || { palette: o.palette, hair: o.hair, height: o.height });
    const claudia = !o.look && o.palette === 'claudia';
    const spec = {
      girth: C.girth || 1, long: !!o.long || claudia, hair: C.hair || 'short',
      hat: C.hat || 'none', scarf: C.scarf || 'none', face: C.face || 'oval',
      fringe: claudia, brooch: claudia,
    };

    const low = quality() === 'low';
    const level = low ? 1 : 0;
    const surf = FigureBody.surfaces(spec, level);

    /* -------- bones -------- */
    const root = new THREE.Group();
    const sk = FigureSkeleton.build(spec.girth, surf.eyeZ);
    root.add(sk.by.pelvis);
    root.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(sk.bones);
    /* The bind is already taken, so these only grow the head (hair,
       hats, eyes and all) about the top of the neck, and the hands and
       shoes about the wrist and ankle. */
    sk.by.head.scale.setScalar(HEAD_SCALE);
    sk.by.head.position.y += HEAD_LIFT;
    for (const [k] of FigureSkeleton.SIDES) {
      sk.by['hand_' + k].scale.setScalar(HAND_SCALE);
      sk.by['foot_' + k].scale.setScalar(FOOT_SCALE);
    }

    /* -------- colour -------- */
    const col = (hex) => new THREE.Color(hex);
    const coat = col(C.coat), trim = col(C.trim);
    const darker = (c, k) => c.clone().multiplyScalar(k);
    const paint = {
      skin: [col('#ffffff')],
      coat: [coat, trim, darker(coat, 0.42), darker(coat, 0.7)],
      legs: [col(C.legs || TROUSERS[h % TROUSERS.length]), col(C.boot || '#241f1a'), col('#14100d')],
      hair: [col('#ffffff')],
      features: [col(SCLERA), col(IRIS[(h >>> 3) % IRIS.length]), col(PUPIL), col(MOUTH), col(TEETH),
                 darker(col(IRIS[(h >>> 3) % IRIS.length]), 0.45), col(GLINT)],
      accent: [col(C.accent), trim],
    };

    /* -------- materials -------- */
    const mat = (colour, rough, extra = {}) => low
      ? new THREE.MeshLambertMaterial(Object.assign({ color: colour, vertexColors: true }, extra))
      : new THREE.MeshStandardMaterial(Object.assign({ color: colour, roughness: rough, metalness: 0,
                                                      vertexColors: true }, extra));
    const M = {
      // smooth and soft, like a painted toy: no pores, a little glow
      skin: mat(C.skin, 0.80, low ? {} : { emissive: col(C.skin).multiplyScalar(0.09) }),
      coat: mat('#ffffff', 0.88, spec.long ? { side: THREE.DoubleSide } : {}),
      legs: mat('#ffffff', 0.82),
      hair: mat(C.hairColour, 0.62, { side: THREE.DoubleSide }),
      features: mat('#ffffff', 0.18),
      accent: mat('#ffffff', 0.85, { side: THREE.DoubleSide }),
    };

    /* -------- meshes -------- */
    const meshes = {};
    const painted = { 0: {}, 1: {} };
    for (const k of Object.keys(M)) {
      const g = surf.parts[k];
      if (!g) continue;
      painted[level][k] = FigureBody.painted(g, paint[k]);
      const mesh = new THREE.SkinnedMesh(painted[level][k], M[k]);
      mesh.name = 'figure-' + k;
      mesh.bind(skeleton);
      // generous, so a raised arm or a seated pose is never culled
      mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0.12), 1.3);
      root.add(mesh);
      meshes[k] = mesh;
    }

    /* -------- texture -------- */
    let textured = false;
    if (typeof FigureMaterials !== 'undefined') {
      const F = FigureMaterials;
      // softer weaves than before, and none on the skin
      F.material(M.coat, C.fabric || 'waxed', 0.45);
      F.material(M.legs, 'twill', 0.35);
      F.material(M.hair, C.hair === 'braids' || C.hair === 'bun' ? 'wavy' : 'hair', 0.35);
      F.material(M.accent, spec.scarf === 'sash' ? 'tartan' : 'cable', 0.55);
      textured = F.dress(root) && !F.failed;
    }

    /* -------- state -------- */
    const d = root.userData;
    d.rig = { bones: sk.bones, by: sk.by, bind: sk.bind, skeleton, meshes,
              head: sk.by.head,
              arms: { l: { hand: sk.by.hand_l }, r: { hand: sk.by.hand_r } } };
    d.anim = FigureAnim.create(root);
    d.mats = M;
    d.spec = spec;
    d.paint = paint;
    d.painted = painted;
    d.level = level;
    d.h = C.height;
    d.girth = spec.girth;
    d.figureTextured = textured;
    d.seatDrop = SEAT_DROP;
    d.speaking = 0; d.speakWant = 0;
    d.seated = 0; d.seatWant = 0;
    d.holding = 0; d.holdWant = 0;
    d.cheering = 0; d.cheerWant = 0;
    d.lean = 0; d.leanWant = 0;
    d.moveCmd = 0;
    d.yawWant = 0; d.pitchWant = 0;
    d.throwT = -1; d.throwDur = 0.9; d.throwPhase = 0;
    d.mood = 'calm';
    d.voiceLevel = null;

    root.scale.setScalar((C.height || FigureSkeleton.H0) / TOP);
    return root;
  }

  /* ---------------- instructions ---------------- */

  /* `opts`: { table } puts the hands on a table rather than in the lap,
     { instant } is already sat (a scene that opens seated), and
     { hip, hipZ, footZ, footX } fit a seat that is not a castle chair. */
  function setSeated(fig, on, opts) {
    if (!fig || !fig.userData.rig) return;
    const d = fig.userData;
    d.seatWant = on ? 1 : 0;
    if (opts) d.seatOpts = Object.assign({}, d.seatOpts || {}, opts);
    if (on) d.chair = !(opts && opts.chair === false);
    if (opts && opts.instant) d.anim.seatT = on ? 1 : 0;
    // the root has just been moved back onto the seat; the body stays put
    if (opts && opts.fromFront) { d.anim.chairW = 1; d.anim.lastPos = null; }
  }

  /* About to walk away from a chair: the body is standing in front of
     it, so move the root out to where the body is. Returns how far. */
  function leaveChair(fig) {
    const d = fig && fig.userData;
    if (!d || !d.anim || !d.chair) return 0;
    const k = d.anim.chairW * 0.30 * (fig.scale.y || 1);
    fig.position.x += Math.sin(fig.rotation.y) * k;
    fig.position.z += Math.cos(fig.rotation.y) * k;
    d.chair = false; d.anim.chairW = 0; d.anim.lastPos = null;
    return k;
  }

  /* `level` is an optional 0..1 voice loudness; with it the jaw follows
     the voice, without it the jaw makes up syllables. */
  function setSpeaking(fig, on, level) {
    if (!fig) return;
    fig.userData.speakWant = on ? 1 : 0;
    fig.userData.voiceLevel = on && typeof level === 'number' ? level : null;
  }

  /* `speed` in metres per second. The gait reads the figure's real
     movement as well, so this mostly matters for walking on the spot. */
  function setLocomotion(fig, speed, turn) {
    if (!fig || !fig.userData.rig) return;
    fig.userData.moveCmd = Math.max(0, speed || 0);
    fig.userData.leanWant = U.clamp(turn || 0, -1, 1);
  }

  const setCheering = (fig, on) => { if (fig) fig.userData.cheerWant = on ? 1 : 0; };
  const flinch = (fig, amount = 1) => { if (fig && amount > 0.3) act(fig, 'flinch'); };
  const setMood = (fig, mood) => { if (fig) fig.userData.mood = FigureClips.MOODS[mood] ? mood : 'calm'; };

  /* An act from figure-clips.js; returns how long it runs. `opts`:
     { target } for a hand-over, { hold, loop, speed }. */
  function act(fig, name, opts) {
    if (!fig || !fig.userData.anim) return 0;
    return FigureAnim.startAct(fig.userData.anim, name, opts || {});
  }
  function stopAct(fig, name) {
    if (fig && fig.userData.anim) FigureAnim.stopAct(fig.userData.anim, name);
  }

  /* Point the right arm at a place in the world, or stop (null). */
  function pointAt(fig, target) {
    if (fig) fig.userData.pointAt = target ? target.clone() : null;
  }
  /* Reach the right hand toward a place in the world, or stop (null). */
  function reachTo(fig, target) {
    if (fig) fig.userData.reachAt = target ? target.clone() : null;
  }

  /* Turn to face a point, from the eyes back to the chest. Yaw always;
     pitch only with `{ pitch: true }`, for callers passing an eye
     position rather than a spot on the floor. */
  function lookAt(fig, target, opts) {
    if (!fig || !target) return;
    const dx = target.x - fig.position.x, dz = target.z - fig.position.z;
    fig.userData.yawWant = Math.atan2(dx, dz) - fig.rotation.y;
    if (!opts || !opts.pitch) { fig.userData.pitchWant = 0; return; }
    const dy = (target.y || 0) - (fig.position.y + (fig.userData.h || 1.72) * EYE_AT);
    const flat = Math.hypot(dx, dz) || 0.0001;
    fig.userData.pitchWant = U.clamp(Math.atan2(dy, flat), -0.45, 0.45);
  }

  /* ---------------- carrying ---------------- */

  function setHolding(fig, on) { if (fig) fig.userData.holdWant = on ? 1 : 0; }

  function throwNow(fig, dur = 0.9) {
    if (!fig) return;
    fig.userData.throwT = 0;
    fig.userData.throwDur = Math.max(0.2, dur);
  }

  function throwProgress(fig) {
    if (!fig || fig.userData.throwT < 0) return -1;
    return fig.userData.throwT / fig.userData.throwDur;
  }

  const _hand = new THREE.Vector3();
  /* Where something held sits: in the fingers, a hand's length past the
     wrist. */
  function handAt(fig, out, side = 'r') {
    const v = out || new THREE.Vector3();
    if (!fig || !fig.userData.rig) return v;
    fig.updateMatrixWorld(true);
    const b = fig.userData.rig.by['hand_' + side];
    _hand.set(0, -0.075, 0.012);
    return v.copy(b.localToWorld(_hand));
  }

  function headAt(fig, out) {
    const v = out || new THREE.Vector3();
    if (!fig || !fig.userData.rig) return v;
    fig.updateMatrixWorld(true);
    return fig.userData.rig.head.getWorldPosition(v);
  }

  /* ---------------- the frame ---------------- */

  function update(fig, dt, t) {
    if (!fig || !fig.userData.rig) return;
    FigureAnim.update(fig, dt, t);
  }

  /* Detail by distance: the near figure gets the fine surfaces, the far
     one the coarse, and past twenty metres nobody's eyes are worth
     drawing. */
  const _w = new THREE.Vector3();
  function lod(fig, camera) {
    const d = fig && fig.userData;
    if (!d || !d.rig || !camera) return;
    const dist = fig.getWorldPosition(_w).distanceTo(camera.position);
    const q = quality();
    const want = q === 'low' ? 1 : dist > (q === 'high' ? 16 : 10) ? 1 : 0;
    if (want !== d.level) {
      const surf = FigureBody.surfaces(d.spec, want);
      for (const k in d.rig.meshes) {
        if (!d.painted[want][k] && surf.parts[k]) d.painted[want][k] = FigureBody.painted(surf.parts[k], d.paint[k]);
        if (d.painted[want][k]) d.rig.meshes[k].geometry = d.painted[want][k];
      }
      d.level = want;
    }
    if (d.rig.meshes.features) d.rig.meshes.features.visible = dist < 22;
  }

  function dispose(fig) {
    if (!fig) return;
    const d = fig.userData;
    if (d.painted) for (const lv in d.painted) for (const k in d.painted[lv]) d.painted[lv][k].dispose();
    if (d.rig && d.rig.skeleton) d.rig.skeleton.dispose();
    Engine.disposeObject(fig);
  }

  // a stable palette per player, so the same name is the same coat
  function paletteFor(index) { return CAST_PALETTES[index % CAST_PALETTES.length]; }

  return { build, update, setSeated, HEAD, setSpeaking, setLocomotion,
           setCheering, flinch, lookAt, dispose, paletteFor, lod,
           setHolding, throwNow, throwProgress, handAt, headAt, THROW_AT,
           act, stopAct, setMood, pointAt, reachTo, leaveChair,
           PALETTES, CAST_PALETTES, SEAT_DROP };
})();

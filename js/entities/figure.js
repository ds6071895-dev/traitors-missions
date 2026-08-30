/* ------------------------------------------------------------------
   figure.js — the people.

   Built the way everything else here is built: primitives in a flat-
   shaded Lambert, a palette argument, and no imported models. A figure
   is about 1.8 m and reads at ten metres, which is the only distance
   any of these scenes ever puts you at.

   The rig is four handles — hips, chest, head, and two shoulders — and
   the animation is deliberately small. A person standing on a hill in
   the wind is mostly still; it is the *little* asymmetric motion that
   sells them as alive, and anything more starts to look like a puppet.
   Only one thing is large: while a figure is speaking, its free hand
   moves, because a presenter who talks with a locked body reads as a
   photograph with audio over it.
------------------------------------------------------------------ */
const Figure = (() => {

  const lam = (col) => new THREE.MeshLambertMaterial({ color: col, flatShading: true });

  const PALETTES = {
    claudia: { coat: '#14161d', trim: '#8d1230', skin: '#e9c3a4', hair: '#241a16',
               boot: '#0d0e12', glove: '#2a1016', accent: '#c9a227' },
    green:   { coat: '#2f5d4a', trim: '#8fc0a0', skin: '#dfae86', hair: '#3b2a1e',
               boot: '#241f1a', glove: '#3a4a42', accent: '#9fd6b4' },
    rust:    { coat: '#7a3b28', trim: '#d59a6a', skin: '#f0cfb0', hair: '#6d4a2a',
               boot: '#2b2119', glove: '#5a3324', accent: '#e0a86a' },
    slate:   { coat: '#3b4757', trim: '#9fb4c9', skin: '#c99a76', hair: '#181410',
               boot: '#20262e', glove: '#4a5766', accent: '#b8cde0' },
    plum:    { coat: '#4c2a4e', trim: '#c095c4', skin: '#e6bd9c', hair: '#2a1c22',
               boot: '#241a26', glove: '#5d3a5f', accent: '#d6a8da' },
    ochre:   { coat: '#7d6524', trim: '#dcc06a', skin: '#d9a67e', hair: '#4a3418',
               boot: '#2a2416', glove: '#5c4a1c', accent: '#efd694' },
  };

  const CAST_PALETTES = ['green', 'rust', 'slate', 'plum', 'ochre'];

  /* A tapered coat rather than a cylinder: the flare at the hem is most
     of what makes a box of primitives read as somebody wearing
     something, and it catches the wind sway at the bottom where the eye
     expects to see it. */
  function coatGeometry(o) {
    const g = new THREE.CylinderGeometry(o.shoulder, o.hem, o.bodyH, 9, 3, true);
    g.translate(0, o.bodyH * 0.5, 0);
    return g;
  }

  function build(opts = {}) {
    const o = Object.assign({
      palette: 'claudia',
      height: 1.80,
      long: true,           // a long coat, or a jacket and trousers
      hair: 'long',         // long | short | bun
    }, opts);

    const P = PALETTES[o.palette] || PALETTES.claudia;
    const s = o.height / 1.80;

    const M = {
      coat: lam(P.coat), trim: lam(P.trim), skin: lam(P.skin), hair: lam(P.hair),
      boot: lam(P.boot), glove: lam(P.glove), accent: lam(P.accent),
    };

    const root = new THREE.Group();
    const hips = new THREE.Group();
    root.add(hips);

    const legH = o.long ? 0.72 : 0.86;

    // legs, mostly hidden under a long coat but they hold the stance
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, legH, 6), M.boot);
      leg.position.set(side * 0.115, legH * 0.5, 0);
      hips.add(leg);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.075, 0.27), M.boot);
      foot.position.set(side * 0.115, 0.04, 0.05);
      hips.add(foot);
    }

    const chest = new THREE.Group();
    chest.position.y = legH * (o.long ? 0.42 : 0.96);
    hips.add(chest);

    const bodyH = o.long ? 1.14 : 0.72;
    const body = new THREE.Mesh(coatGeometry({ shoulder: 0.215, hem: o.long ? 0.33 : 0.20, bodyH }), M.coat);
    chest.add(body);

    // a lapel down the front, in the trim colour, which is the whole
    // silhouette's only detail and does a lot of work
    const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.075, bodyH * 0.66, 0.03), M.trim);
    lapel.position.set(0, bodyH * 0.66, 0.185);
    chest.add(lapel);

    const shoulders = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.215, 0.14, 9), M.coat);
    shoulders.position.y = bodyH - 0.03;
    chest.add(shoulders);

    // arms hang off their own pivots so a gesture is a rotation, not a
    // rebuild
    const arms = {};
    for (const [key, side] of [['l', -1], ['r', 1]]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.235, bodyH - 0.03, 0);
      chest.add(pivot);
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.055, 0.40, 6), M.coat);
      upper.position.y = -0.20;
      pivot.add(upper);
      const fore = new THREE.Group();
      fore.position.y = -0.40;
      pivot.add(fore);
      const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.046, 0.36, 6), M.coat);
      lower.position.y = -0.18;
      fore.add(lower);
      const hand = new THREE.Mesh(new THREE.IcosahedronGeometry(0.062, 0), M.glove);
      hand.position.y = -0.38;
      fore.add(hand);
      pivot.rotation.z = side * 0.07;
      arms[key] = { pivot, fore, hand, side };
    }

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.068, 0.09, 6), M.skin);
    neck.position.y = bodyH + 0.06;
    chest.add(neck);

    const head = new THREE.Group();
    head.position.y = bodyH + 0.11;
    chest.add(head);

    const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.125, 1), M.skin);
    skull.scale.set(0.92, 1.1, 0.95);
    skull.position.y = 0.11;
    head.add(skull);

    if (o.hair === 'long') {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.142, 9, 7, 0, 6.283, 0, Math.PI * 0.62), M.hair);
      h.position.y = 0.115;
      h.scale.set(1, 1.05, 1.02);
      head.add(h);
      for (const side of [-1, 1]) {
        const fall = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.30, 0.10), M.hair);
        fall.position.set(side * 0.105, -0.03, -0.012);
        fall.rotation.z = side * 0.06;
        head.add(fall);
      }
    } else if (o.hair === 'bun') {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.138, 9, 7, 0, 6.283, 0, Math.PI * 0.58), M.hair);
      h.position.y = 0.118;
      head.add(h);
      const bun = new THREE.Mesh(new THREE.IcosahedronGeometry(0.072, 0), M.hair);
      bun.position.set(0, 0.14, -0.13);
      head.add(bun);
    } else {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.134, 9, 7, 0, 6.283, 0, Math.PI * 0.5), M.hair);
      h.position.y = 0.125;
      head.add(h);
    }

    root.userData.rig = { hips, chest, head, arms, body, skull };
    root.userData.mats = M;
    root.userData.h = o.height * (o.long ? 1 : 1);
    root.userData.phase = Math.random() * 6.283;
    root.userData.speaking = 0;
    root.userData.seated = 0;
    root.userData.aim = new THREE.Vector3();
    root.userData.yawWant = 0;
    root.userData.yawNow = 0;
    root.userData.holdWant = 0;      // something in the right hand
    root.userData.holding = 0;
    root.userData.throwT = -1;       // -1 is "not throwing"
    root.userData.throwDur = 0.9;
    root.userData.throwPhase = 0;    // -1 wound up .. +1 followed through
    root.scale.setScalar(s);
    return root;
  }

  /* Sitting is done to the rig rather than by building a second figure:
     drop the hips, fold the legs under the coat by tipping them, and
     bring the arms in. It is a pose, not a model. */
  function setSeated(fig, on) {
    if (!fig || !fig.userData.rig) return;
    fig.userData.seated = on ? 1 : 0;
    const r = fig.userData.rig;
    r.hips.position.y = on ? -0.42 : 0;
    r.hips.children.forEach(c => { if (c !== r.chest) c.visible = !on; });
    r.arms.l.pivot.rotation.x = on ? -0.55 : 0;
    r.arms.r.pivot.rotation.x = on ? -0.55 : 0;
    r.arms.l.fore.rotation.x = on ? -0.85 : 0;
    r.arms.r.fore.rotation.x = on ? -0.85 : 0;
  }

  // turn to face a point in world space, from the neck up
  function lookAt(fig, target) {
    if (!fig || !target) return;
    const dx = target.x - fig.position.x, dz = target.z - fig.position.z;
    fig.userData.yawWant = Math.atan2(dx, dz) - fig.rotation.y;
  }

  function setSpeaking(fig, on) {
    if (fig) fig.userData.speakWant = on ? 1 : 0;
  }

  /* ---------------- carrying something ----------------
     Claudia has to hold a pouch up so everyone can see it and then put
     it in the fire, and a pouch that floats to the flames on its own is
     the difference between a ceremony and a screensaver. `hold` is a
     pose the right arm eases into; `throwNow` is a one-shot clock over
     a wind-up and a release that `update` drives, and `handAt` is where
     the thing in that hand actually is this frame. */

  function setHolding(fig, on) { if (fig) fig.userData.holdWant = on ? 1 : 0; }

  function throwNow(fig, dur = 0.9) {
    if (!fig) return;
    fig.userData.throwT = 0;
    fig.userData.throwDur = Math.max(0.2, dur);
  }

  /* Two fractions of the throw clock, and they are not the same one.
     `WIND` is where the arm stops going back and starts coming
     through; `THROW_AT` is where whatever it is holding leaves it,
     which is later — a hand lets go as it swings past, not at the top
     of the backswing. Releasing on `WIND` throws the thing backwards. */
  const WIND = 0.52;
  const THROW_AT = 0.68;

  function throwProgress(fig) {
    if (!fig || fig.userData.throwT < 0) return -1;
    return fig.userData.throwT / fig.userData.throwDur;
  }

  function handAt(fig, out, side = 'r') {
    const v = out || new THREE.Vector3();
    if (!fig || !fig.userData.rig) return v;
    fig.updateMatrixWorld(true);
    return fig.userData.rig.arms[side].hand.getWorldPosition(v);
  }

  function update(fig, dt, t) {
    if (!fig || !fig.userData.rig) return;
    const d = fig.userData;
    const r = d.rig;
    const ph = d.phase;

    d.speaking = U.damp(d.speaking, d.speakWant || 0, 6, dt);
    const sp = d.speaking;

    // weight shifting from one foot to the other, very slowly
    const sway = Math.sin(t * 0.42 + ph) * 0.5 + Math.sin(t * 0.71 + ph * 1.7) * 0.5;
    r.hips.rotation.z = sway * 0.018;
    r.chest.rotation.z = -sway * 0.026;
    r.chest.rotation.y = Math.sin(t * 0.31 + ph * 2.1) * 0.05;

    // breathing, in the chest and nowhere else
    const breath = Math.sin(t * 1.15 + ph) * 0.5 + 0.5;
    r.body.scale.set(1 + breath * 0.012, 1, 1 + breath * 0.016);

    // the head keeps its own time, and turns to whatever it was told to
    d.yawNow = U.angLerp(d.yawNow, d.yawWant, 1 - Math.exp(-4.5 * dt));
    r.head.rotation.y = d.yawNow + Math.sin(t * 0.53 + ph * 3.3) * 0.06 + sp * Math.sin(t * 2.3 + ph) * 0.05;
    r.head.rotation.x = Math.sin(t * 0.37 + ph * 1.3) * 0.03 - sp * 0.04
                        + sp * Math.sin(t * 3.1 + ph) * 0.035;

    // the gesturing hand: one arm only, and never the same beat twice
    const g = sp * (0.55 + Math.sin(t * 2.05 + ph) * 0.45);
    const seat = d.seated ? 1 : 0;

    /* The throw runs on its own clock so it can be started once and
       forgotten. It is deliberately not symmetrical: the wind-up takes
       half the time and the release is over in a moment, because an arm
       that goes back as slowly as it comes forward is a wave. */
    d.holding = U.damp(d.holding || 0, d.holdWant || 0, 7, dt);
    let th = 0;
    if (d.throwT >= 0) {
      d.throwT += dt;
      const k = d.throwT / d.throwDur;
      if (k >= 1) { d.throwT = -1; }
      else if (k < WIND) th = -Math.sin((k / WIND) * Math.PI * 0.5);
      else th = Math.sin(((k - WIND) / (1 - WIND)) * Math.PI);
    }
    d.throwPhase = th;
    const hold = d.holding;
    const back = Math.max(0, -th);      // wound up behind her shoulder
    const thru = Math.max(0, th);       // and coming through it

    r.arms.r.pivot.rotation.x = U.lerp(0, -0.55, seat) - g * 0.62
                              - hold * 1.15 + back * 1.05 - thru * 2.05;
    r.arms.r.pivot.rotation.z = 0.07 - g * 0.20 - hold * 0.10 - thru * 0.18;
    r.arms.r.fore.rotation.x = U.lerp(0, -0.85, seat) - g * 0.75
                             - Math.sin(t * 3.4 + ph) * g * 0.28
                             - hold * 0.62 + back * 0.85 - thru * 0.45;
    r.arms.l.pivot.rotation.x = U.lerp(0, -0.55, seat) - g * 0.16 - hold * 0.30;
    r.arms.l.pivot.rotation.z = -0.07 + g * 0.05;
    r.arms.l.fore.rotation.x = U.lerp(0, -0.85, seat) - g * 0.22 - hold * 0.30;

    // the whole body leans into the throw, or it is a hand on a stick
    r.chest.rotation.x = -hold * 0.06 + back * 0.16 - thru * 0.26;
  }

  function dispose(fig) {
    if (!fig) return;
    Engine.disposeObject(fig);
    const M = fig.userData.mats || {};
    for (const k in M) M[k].dispose();
  }

  // a stable palette per player, so the same name is the same coat
  function paletteFor(index) { return CAST_PALETTES[index % CAST_PALETTES.length]; }

  return { build, update, setSeated, setSpeaking, lookAt, dispose, paletteFor,
           setHolding, throwNow, throwProgress, handAt, THROW_AT,
           PALETTES, CAST_PALETTES };
})();

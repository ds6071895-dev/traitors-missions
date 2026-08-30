/* ------------------------------------------------------------------
   figure.js — the people.

   Still primitives in a flat-shaded Lambert with no imported models,
   because that is the whole game's look and importing a rigged mesh
   for three contestants would make everything else look like
   placeholder. What changed is everything that was wrong with them.

   The old rig had four handles and two rigid cylinders for legs, which
   meant a figure could stand, sit and gesture but could never take a
   step — and a person who slides is worse than a person who is still.
   This one is a proper chain: hips, spine, chest, neck, head, arms
   with elbows, and legs with knees and ankles. Everything below is
   built so `update` can drive a real walk cycle out of one number.

   The other fix is the head. There was nothing above the neck but a
   skin-coloured icosahedron; at any distance closer than the ten
   metres the old comment assumed, that reads as a mannequin. There is
   now a brow, eyes that blink, and a nose — three small meshes that do
   more for "alive" than any amount of body motion.

   Appearance is a `look` from `look.js`: enumerated choices resolved to
   colours before they arrive. `palette` is still accepted, because
   Claudia is not a contestant and does not get dressed in a lobby.

   The animation rule is unchanged and still right: a person standing
   in the wind is mostly still, and it is the small asymmetric motion
   that sells them. Everything large here is driven by something the
   figure is actually doing — walking, speaking, drawing, throwing.
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

  const EYE_DARK = '#171a1f';

  /* ---------------- pieces ---------------- */

  /* A tapered coat rather than a cylinder: the flare at the hem is most
     of what makes a box of primitives read as somebody wearing
     something, and it catches the sway at the bottom where the eye
     expects to see it. */
  function coatGeometry(shoulder, hem, h) {
    const g = new THREE.CylinderGeometry(shoulder, hem, h, 10, 3, true);
    g.translate(0, h * 0.5, 0);
    return g;
  }

  function limb(rTop, rBot, len, seg = 6) {
    const g = new THREE.CylinderGeometry(rTop, rBot, len, seg);
    g.translate(0, -len * 0.5, 0);
    return g;
  }

  function buildHair(style, M, head, g) {
    const add = (mesh) => { head.add(mesh); return mesh; };
    const cap = (r, sweep, y) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(r, 10, 7, 0, Math.PI * 2, 0, sweep), M.hair);
      m.position.y = y;
      return add(m);
    };
    if (style === 'bald') {
      const stubble = cap(0.128 * g, Math.PI * 0.42, 0.118 * g);
      stubble.scale.set(1, 0.55, 1);
      return;
    }
    if (style === 'crop')  { cap(0.132 * g, Math.PI * 0.46, 0.122 * g); return; }
    if (style === 'short') { cap(0.136 * g, Math.PI * 0.54, 0.118 * g); return; }

    if (style === 'bob') {
      cap(0.142 * g, Math.PI * 0.60, 0.115 * g);
      for (const side of [-1, 1]) {
        const fall = add(new THREE.Mesh(
          new THREE.BoxGeometry(0.072 * g, 0.20 * g, 0.115 * g), M.hair));
        fall.position.set(side * 0.104 * g, 0.02 * g, -0.008 * g);
        fall.rotation.z = side * 0.05;
      }
      return;
    }
    if (style === 'long') {
      cap(0.144 * g, Math.PI * 0.62, 0.115 * g);
      for (const side of [-1, 1]) {
        const fall = add(new THREE.Mesh(
          new THREE.BoxGeometry(0.070 * g, 0.32 * g, 0.105 * g), M.hair));
        fall.position.set(side * 0.106 * g, -0.05 * g, -0.010 * g);
        fall.rotation.z = side * 0.06;
      }
      const back = add(new THREE.Mesh(
        new THREE.BoxGeometry(0.19 * g, 0.30 * g, 0.075 * g), M.hair));
      back.position.set(0, -0.03 * g, -0.098 * g);
      return;
    }
    if (style === 'bun') {
      cap(0.138 * g, Math.PI * 0.56, 0.118 * g);
      const bun = add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.070 * g, 0), M.hair));
      bun.position.set(0, 0.145 * g, -0.125 * g);
      return;
    }
    if (style === 'tail') {
      cap(0.138 * g, Math.PI * 0.54, 0.118 * g);
      const tail = add(new THREE.Mesh(limb(0.048 * g, 0.026 * g, 0.30 * g, 6), M.hair));
      tail.position.set(0, 0.10 * g, -0.128 * g);
      tail.rotation.x = -0.55;
      return;
    }
    if (style === 'braids') {
      cap(0.140 * g, Math.PI * 0.56, 0.116 * g);
      for (const side of [-1, 1]) {
        const braid = add(new THREE.Mesh(limb(0.040 * g, 0.024 * g, 0.30 * g, 5), M.hair));
        braid.position.set(side * 0.108 * g, 0.09 * g, -0.030 * g);
        braid.rotation.z = side * 0.20;
        braid.rotation.x = -0.12;
      }
    }
  }

  function buildHat(style, M, head, g) {
    if (!style || style === 'none') return null;
    const hat = new THREE.Group();
    head.add(hat);
    if (style === 'beanie') {
      const c = new THREE.Mesh(
        new THREE.SphereGeometry(0.148 * g, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.52),
        M.accent);
      c.position.y = 0.122 * g;
      hat.add(c);
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.150 * g, 0.150 * g, 0.048 * g, 10), M.trim);
      band.position.y = 0.118 * g;
      hat.add(band);
    } else if (style === 'flat') {
      const crown = new THREE.Mesh(
        new THREE.CylinderGeometry(0.150 * g, 0.140 * g, 0.062 * g, 9), M.accent);
      crown.position.y = 0.196 * g;
      crown.rotation.x = -0.10;
      hat.add(crown);
      const peak = new THREE.Mesh(
        new THREE.BoxGeometry(0.20 * g, 0.020 * g, 0.135 * g), M.accent);
      peak.position.set(0, 0.176 * g, 0.140 * g);
      peak.rotation.x = -0.16;
      hat.add(peak);
    } else if (style === 'wide') {
      const crown = new THREE.Mesh(
        new THREE.CylinderGeometry(0.118 * g, 0.132 * g, 0.130 * g, 10), M.accent);
      crown.position.y = 0.232 * g;
      hat.add(crown);
      const brim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.255 * g, 0.255 * g, 0.018 * g, 12), M.accent);
      brim.position.y = 0.172 * g;
      hat.add(brim);
    } else if (style === 'band') {
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(0.132 * g, 0.020 * g, 5, 12), M.accent);
      band.position.y = 0.148 * g;
      band.rotation.x = Math.PI * 0.5;
      hat.add(band);
    }
    return hat;
  }

  function buildNeckwear(style, M, chest, y, g) {
    if (!style || style === 'none') return;
    if (style === 'scarf') {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.085 * g, 0.038 * g, 5, 12), M.accent);
      ring.position.y = y;
      ring.rotation.x = Math.PI * 0.5;
      chest.add(ring);
      const tail = new THREE.Mesh(
        new THREE.BoxGeometry(0.085 * g, 0.28 * g, 0.040 * g), M.accent);
      tail.position.set(0.055 * g, y - 0.16 * g, 0.090 * g);
      tail.rotation.z = 0.10;
      chest.add(tail);
    } else if (style === 'sash') {
      const sash = new THREE.Mesh(
        new THREE.BoxGeometry(0.098 * g, 0.62 * g, 0.030 * g), M.accent);
      sash.position.set(0, y - 0.30 * g, 0.150 * g);
      sash.rotation.z = 0.42;
      chest.add(sash);
    } else if (style === 'cowl') {
      const cowl = new THREE.Mesh(
        new THREE.CylinderGeometry(0.135 * g, 0.105 * g, 0.150 * g, 10, 1, true), M.accent);
      cowl.position.y = y - 0.02 * g;
      chest.add(cowl);
    }
  }

  /* ---------------- the figure ---------------- */

  function build(opts = {}) {
    const o = Object.assign({
      palette: null,
      look: null,
      height: 1.78,
      long: true,          // a long coat, or a jacket and trousers
      hair: 'short',
      girth: 1,
    }, opts);

    /* Two ways in, one set of colours out. A contestant arrives as a
       `look` from the dressing room; Claudia arrives as a palette
       name, because she was never in the lobby. */
    let C;
    if (o.look) {
      C = Look.resolve(o.look);
      o.height = C.height;
      o.girth = C.girth;
      o.hair = C.hair;
    } else {
      const P = PALETTES[o.palette] || PALETTES.claudia;
      C = { coat: P.coat, trim: P.trim, skin: P.skin, hairColour: P.hair,
            boot: P.boot, glove: P.glove, accent: P.accent,
            hair: o.hair, hat: 'none', scarf: 'none',
            height: o.height, girth: o.girth };
    }

    const M = {
      coat: lam(C.coat), trim: lam(C.trim), skin: lam(C.skin),
      hair: lam(C.hairColour), boot: lam(C.boot), glove: lam(C.glove),
      accent: lam(C.accent), dark: lam(EYE_DARK),
    };

    const g = C.girth || 1;                    // lateral scale only
    const s = (C.height || 1.78) / 1.78;

    const root = new THREE.Group();
    const hips = new THREE.Group();
    hips.position.y = o.long ? 0.86 : 0.92;
    root.add(hips);

    /* -------- legs --------
       Two joints each, which is the entire reason a walk is possible.
       Under a long coat only the shins show, but the chain is the same
       either way so nothing has to know which coat it is wearing. */
    const legs = {};
    const thighH = 0.44, shinH = 0.42;
    for (const [key, side] of [['l', -1], ['r', 1]]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.098 * g, 0, 0);
      hips.add(pivot);

      const thigh = new THREE.Mesh(limb(0.082 * g, 0.070 * g, thighH), M.boot);
      pivot.add(thigh);

      const knee = new THREE.Group();
      knee.position.y = -thighH;
      pivot.add(knee);

      const shin = new THREE.Mesh(limb(0.068 * g, 0.055 * g, shinH), M.boot);
      knee.add(shin);

      const ankle = new THREE.Group();
      ankle.position.y = -shinH;
      knee.add(ankle);

      const foot = new THREE.Mesh(
        new THREE.BoxGeometry(0.115 * g, 0.070, 0.255), M.boot);
      foot.position.set(0, -0.030, 0.052);
      ankle.add(foot);

      const cuff = new THREE.Mesh(
        new THREE.CylinderGeometry(0.078 * g, 0.072 * g, 0.075, 7), M.trim);
      cuff.position.y = -shinH + 0.045;
      knee.add(cuff);

      legs[key] = { pivot, knee, ankle, side };
    }

    /* -------- torso -------- */
    const spine = new THREE.Group();
    hips.add(spine);

    const chest = new THREE.Group();
    spine.add(chest);

    const bodyH = o.long ? 1.02 : 0.66;
    const body = new THREE.Mesh(
      coatGeometry(0.205 * g, (o.long ? 0.30 : 0.205) * g, bodyH), M.coat);
    chest.add(body);

    // the coat closes: a placket down the front and a belt across it
    const lapel = new THREE.Mesh(
      new THREE.BoxGeometry(0.070 * g, bodyH * 0.72, 0.030), M.trim);
    lapel.position.set(0, bodyH * 0.60, 0.176 * g);
    chest.add(lapel);

    const belt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.196 * g, 0.198 * g, 0.070, 10), M.boot);
    belt.position.y = bodyH * 0.30;
    chest.add(belt);

    const buckle = new THREE.Mesh(
      new THREE.BoxGeometry(0.062 * g, 0.052, 0.028), M.accent);
    buckle.position.set(0, bodyH * 0.30, 0.190 * g);
    chest.add(buckle);

    // a shoulder yoke, which is what stops the torso reading as a tube
    const yoke = new THREE.Mesh(
      new THREE.CylinderGeometry(0.222 * g, 0.208 * g, 0.150, 10), M.coat);
    yoke.position.y = bodyH - 0.040;
    chest.add(yoke);

    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.104 * g, 0.126 * g, 0.090, 9, 1, true), M.trim);
    collar.position.y = bodyH + 0.038;
    chest.add(collar);

    buildNeckwear(C.scarf, M, chest, bodyH + 0.020, g);

    /* -------- arms -------- */
    const arms = {};
    const upperH = 0.38, foreH = 0.34;
    for (const [key, side] of [['l', -1], ['r', 1]]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.224 * g, bodyH - 0.030, 0);
      chest.add(pivot);

      const upper = new THREE.Mesh(limb(0.062 * g, 0.052 * g, upperH), M.coat);
      pivot.add(upper);

      const fore = new THREE.Group();
      fore.position.y = -upperH;
      pivot.add(fore);

      const lower = new THREE.Mesh(limb(0.050 * g, 0.043 * g, foreH), M.coat);
      fore.add(lower);

      const cuff = new THREE.Mesh(
        new THREE.CylinderGeometry(0.052 * g, 0.048 * g, 0.062, 7), M.trim);
      cuff.position.y = -foreH + 0.036;
      fore.add(cuff);

      const hand = new THREE.Mesh(new THREE.IcosahedronGeometry(0.058, 0), M.glove);
      hand.position.y = -foreH - 0.038;
      hand.scale.set(1, 1.15, 0.82);
      fore.add(hand);

      pivot.rotation.z = side * 0.065;
      arms[key] = { pivot, fore, hand, side };
    }

    /* -------- head --------
       The face is three small meshes and it is the single biggest
       change in this file. Nothing about it is detailed; it just has
       to have somewhere to look from. */
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.056, 0.070, 0.105, 7), M.skin);
    neck.position.y = bodyH + 0.052;
    chest.add(neck);

    const head = new THREE.Group();
    head.position.y = bodyH + 0.104;
    chest.add(head);

    const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.124, 1), M.skin);
    skull.scale.set(0.94 * g, 1.10, 0.98);
    skull.position.y = 0.112;
    head.add(skull);

    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.150, 0.078, 0.140), M.skin);
    jaw.position.set(0, 0.048, 0.014);
    head.add(jaw);

    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.168, 0.030, 0.048), M.skin);
    brow.position.set(0, 0.146, 0.092);
    head.add(brow);

    const eyes = {};
    for (const [key, side] of [['l', -1], ['r', 1]]) {
      const socket = new THREE.Group();
      socket.position.set(side * 0.050, 0.116, 0.098);
      head.add(socket);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.023, 7, 5), M.dark);
      socket.add(eye);
      eyes[key] = eye;
    }

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.062, 4), M.skin);
    nose.position.set(0, 0.088, 0.106);
    nose.rotation.x = Math.PI * 0.5;
    head.add(nose);

    buildHair(C.hair, M, head, 1);
    const hat = buildHat(C.hat, M, head, 1);

    /* -------- state -------- */
    root.userData.rig = { hips, spine, chest, head, arms, legs, body, skull,
                          eyes, brow, hat, yoke };
    root.userData.mats = M;
    root.userData.h = C.height;
    root.userData.stand = hips.position.y;
    root.userData.phase = Math.random() * 6.283;
    root.userData.stride = Math.random() * 6.283;

    root.userData.speaking = 0;   root.userData.speakWant = 0;
    root.userData.seated = 0;     root.userData.seatWant = 0;
    root.userData.moving = 0;     root.userData.moveWant = 0;
    root.userData.running = 0;    root.userData.runWant = 0;
    root.userData.lean = 0;       root.userData.leanWant = 0;
    root.userData.aiming = 0;     root.userData.aimWant = 0;
    root.userData.cheering = 0;   root.userData.cheerWant = 0;
    root.userData.holding = 0;    root.userData.holdWant = 0;
    root.userData.flinch = 0;
    root.userData.blink = 2 + Math.random() * 4;
    root.userData.yawWant = 0;    root.userData.yawNow = 0;
    root.userData.pitchWant = 0;  root.userData.pitchNow = 0;
    root.userData.throwT = -1;
    root.userData.throwDur = 0.9;
    root.userData.throwPhase = 0;

    root.scale.setScalar(s);
    return root;
  }

  /* ---------------- poses and instructions ---------------- */

  /* Sitting is done to the rig rather than by building a second
     figure: drop the hips, fold the legs under the coat, bring the
     arms in. With knees in the chain it is now an actual sit rather
     than a pair of hidden cylinders. */
  function setSeated(fig, on) {
    if (fig && fig.userData.rig) fig.userData.seatWant = on ? 1 : 0;
  }

  function setSpeaking(fig, on) {
    if (fig) fig.userData.speakWant = on ? 1 : 0;
  }

  /* One number in, a walk out. `speed` is metres per second as the
     caller understands it; anything at or above `run` is a run. */
  function setLocomotion(fig, speed, turn, run) {
    if (!fig || !fig.userData.rig) return;
    const d = fig.userData;
    const top = run || 5.2;
    const v = Math.max(0, speed || 0);
    d.moveWant = U.clamp(v / 1.6, 0, 1);
    d.runWant = U.clamp((v - 2.0) / (top - 2.0), 0, 1);
    d.leanWant = U.clamp(turn || 0, -1, 1);
  }

  const setAiming = (fig, on) => { if (fig) fig.userData.aimWant = on ? 1 : 0; };
  const setCheering = (fig, on) => { if (fig) fig.userData.cheerWant = on ? 1 : 0; };
  const flinch = (fig, amount = 1) => {
    if (fig) fig.userData.flinch = Math.max(fig.userData.flinch || 0, amount);
  };

  /* Turn to face a point in world space, from the neck up.

     Yaw always; pitch only when asked for. Most callers hand this a
     seat or a prop position, which sits on the ground — tilting to
     meet those would have everybody in the show staring at the grass.
     `{ pitch: true }` is for callers passing an actual eye position. */
  function lookAt(fig, target, opts) {
    if (!fig || !target) return;
    const dx = target.x - fig.position.x, dz = target.z - fig.position.z;
    fig.userData.yawWant = Math.atan2(dx, dz) - fig.rotation.y;
    if (!opts || !opts.pitch) { fig.userData.pitchWant = 0; return; }
    const dy = (target.y || 0) - (fig.position.y + (fig.userData.h || 1.78) * 0.92);
    const flat = Math.hypot(dx, dz) || 0.0001;
    fig.userData.pitchWant = U.clamp(Math.atan2(dy, flat), -0.45, 0.45);
  }

  /* ---------------- carrying something ----------------
     Claudia has to hold a pouch up so everyone can see it and then put
     it in the fire, and a pouch that floats to the flames on its own is
     the difference between a ceremony and a screensaver. */

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

  function headAt(fig, out) {
    const v = out || new THREE.Vector3();
    if (!fig || !fig.userData.rig) return v;
    fig.updateMatrixWorld(true);
    return fig.userData.rig.head.getWorldPosition(v);
  }

  /* ---------------- the frame ---------------- */

  function update(fig, dt, t) {
    if (!fig || !fig.userData.rig) return;
    const d = fig.userData;
    const r = d.rig;
    const ph = d.phase;

    d.speaking = U.damp(d.speaking, d.speakWant || 0, 6, dt);
    d.seated   = U.damp(d.seated,   d.seatWant   || 0, 7, dt);
    d.moving   = U.damp(d.moving,   d.moveWant   || 0, 9, dt);
    d.running  = U.damp(d.running,  d.runWant    || 0, 7, dt);
    d.lean     = U.damp(d.lean,     d.leanWant   || 0, 5, dt);
    d.aiming   = U.damp(d.aiming,   d.aimWant    || 0, 8, dt);
    d.cheering = U.damp(d.cheering, d.cheerWant  || 0, 6, dt);
    d.holding  = U.damp(d.holding,  d.holdWant   || 0, 7, dt);
    d.flinch   = Math.max(0, (d.flinch || 0) - dt * 3.2);

    const sp = d.speaking, seat = d.seated, mv = d.moving * (1 - seat);
    const rn = d.running, aim = d.aiming * (1 - seat), joy = d.cheering;

    /* -------- the walk --------
       Stride frequency rises with speed, which is most of why a cheap
       cycle reads as walking rather than as a metronome. */
    const freq = 4.4 + rn * 3.4;
    d.stride += dt * freq * (0.25 + mv * 0.75);
    const st = d.stride;
    const swing = Math.sin(st);
    const gait = mv * (0.55 + rn * 0.45);

    for (const [key, sign] of [['l', 1], ['r', -1]]) {
      const L = r.legs[key];
      const s2 = swing * sign;
      // thigh drives the stride; the knee only bends on the way through
      const thigh = s2 * 0.62 * gait;
      const bend = Math.max(0, -s2) * (0.95 + rn * 0.55) * gait;
      L.pivot.rotation.x = U.lerp(thigh, -1.42, seat);
      L.knee.rotation.x = U.lerp(-bend - gait * 0.10, -1.55, seat);
      L.ankle.rotation.x = U.lerp(bend * 0.45 - thigh * 0.20, 0.45, seat);
    }

    // hips bob twice per stride and roll once, which is the difference
    // between walking and being carried
    const bob = Math.abs(Math.cos(st)) * 0.052 * gait;
    r.hips.position.y = d.stand - U.lerp(bob, 0.46, seat);
    r.hips.rotation.z = swing * 0.052 * gait + Math.sin(t * 0.42 + ph) * 0.012 * (1 - mv);
    r.hips.rotation.y = -swing * 0.075 * gait;

    // weight shifting from one foot to the other while standing still
    const sway = (Math.sin(t * 0.42 + ph) * 0.5 + Math.sin(t * 0.71 + ph * 1.7) * 0.5)
                 * (1 - mv);
    r.spine.rotation.z = -sway * 0.026 - d.lean * 0.16 * mv;
    r.spine.rotation.y = swing * 0.085 * gait + Math.sin(t * 0.31 + ph * 2.1) * 0.05 * (1 - mv);
    r.spine.rotation.x = mv * (0.10 + rn * 0.16) - joy * 0.10 + d.flinch * 0.22;

    // breathing, in the chest and nowhere else
    const breath = Math.sin(t * (1.15 + rn * 1.6) + ph) * 0.5 + 0.5;
    r.body.scale.set(1 + breath * 0.014, 1, 1 + breath * 0.018);

    /* -------- head -------- */
    d.yawNow = U.angLerp(d.yawNow, d.yawWant, 1 - Math.exp(-4.5 * dt));
    d.pitchNow = U.damp(d.pitchNow, d.pitchWant, 4.5, dt);
    r.head.rotation.y = d.yawNow + Math.sin(t * 0.53 + ph * 3.3) * 0.06 * (1 - mv)
                      + sp * Math.sin(t * 2.3 + ph) * 0.05;
    r.head.rotation.x = -d.pitchNow + Math.sin(t * 0.37 + ph * 1.3) * 0.03 - sp * 0.04
                      + sp * Math.sin(t * 3.1 + ph) * 0.035
                      - swing * 0.02 * gait - joy * 0.22 + d.flinch * 0.30;
    r.head.rotation.z = -swing * 0.028 * gait;

    // a blink is two frames of a squashed sphere and it is worth more
    // than any of the body motion above it
    d.blink -= dt;
    const lid = d.blink < 0 ? 1 : 0;
    if (d.blink < -0.11) d.blink = 2.2 + Math.random() * 4.5;
    r.eyes.l.scale.y = r.eyes.r.scale.y = lid ? 0.12 : 1;

    /* -------- arms --------
       One arm gestures while speaking, both counter-swing while
       walking, both come up to aim, and the right one owns the throw. */
    const gest = sp * (0.55 + Math.sin(t * 2.05 + ph) * 0.45) * (1 - aim);

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
    const back = Math.max(0, -th);
    const thru = Math.max(0, th);

    for (const [key, sign] of [['l', -1], ['r', 1]]) {
      const A = r.arms[key];
      const counter = -swing * sign * 0.52 * gait;
      const base = U.lerp(0, -0.62, seat) + counter;

      let x = base;
      let z = A.side * 0.065 + mv * A.side * 0.10;
      let fx = U.lerp(0, -0.92, seat) - Math.abs(counter) * 0.55 - mv * 0.30;

      // aiming: the bow arm goes out straight, the string arm folds in
      if (aim > 0.001) {
        const outX = key === 'l' ? -1.48 : -1.30;
        const outZ = key === 'l' ? -0.34 : 0.52;
        const outF = key === 'l' ? -0.10 : -1.55;
        x = U.lerp(x, outX, aim);
        z = U.lerp(z, outZ, aim);
        fx = U.lerp(fx, outF, aim);
      }

      if (joy > 0.001) {
        x = U.lerp(x, -2.35, joy);
        z = U.lerp(z, A.side * 0.42, joy);
        fx = U.lerp(fx, -0.35 - Math.sin(t * 7 + ph + key.charCodeAt(0)) * 0.25, joy);
      }

      if (key === 'r') {
        x += -gest * 0.62 - hold * 1.15 + back * 1.05 - thru * 2.05;
        z += -gest * 0.20 - hold * 0.10 - thru * 0.18;
        fx += -gest * 0.75 - Math.sin(t * 3.4 + ph) * gest * 0.28
              - hold * 0.62 + back * 0.85 - thru * 0.45;
      } else {
        x += -gest * 0.16 - hold * 0.30;
        z += gest * 0.05;
        fx += -gest * 0.22 - hold * 0.30;
      }

      A.pivot.rotation.x = x;
      A.pivot.rotation.z = z;
      A.fore.rotation.x = fx;
    }

    // the whole body leans into the throw, or it is a hand on a stick
    r.chest.rotation.x = -hold * 0.06 + back * 0.16 - thru * 0.26 - aim * 0.06;
    r.chest.rotation.y = aim * 0.30;
    r.chest.rotation.z = sway * 0.018;
  }

  function dispose(fig) {
    if (!fig) return;
    Engine.disposeObject(fig);
    const M = fig.userData.mats || {};
    for (const k in M) M[k].dispose();
  }

  // a stable palette per player, so the same name is the same coat
  function paletteFor(index) { return CAST_PALETTES[index % CAST_PALETTES.length]; }

  return { build, update, setSeated, setSpeaking, setLocomotion, setAiming,
           setCheering, flinch, lookAt, dispose, paletteFor,
           setHolding, throwNow, throwProgress, handAt, headAt, THROW_AT,
           PALETTES, CAST_PALETTES };
})();

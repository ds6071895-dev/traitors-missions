/* ------------------------------------------------------------------
   figure.js — the people.

   Still primitives in Lambert with no imported models, because that is
   the whole game's look and importing a rigged mesh for three
   contestants would make everything else look like placeholder. What
   changed is everything that was wrong with them.

   The shading is now split, and it is the single change that stopped
   these reading as blocks. Clothes are flat-shaded and coarse — a coat
   is made of panels and looks right made of facets. Skin and hair are
   smooth-shaded and finely segmented, because a face has no flat
   surfaces anywhere and every facet on one is a fault line. Twelve
   sides of a cylinder was the old budget everywhere; it is twenty-two
   now, and the head is finer than that.

   The old rig had four handles and two rigid cylinders for legs, which
   meant a figure could stand, sit and gesture but could never take a
   step — and a person who slides is worse than a person who is still.
   This one is a proper chain: hips, spine, chest, neck, head, arms
   with elbows, and legs with knees and ankles. Everything below is
   built so `update` can drive a real walk cycle out of one number.

   The other fix is the head, twice over. First there was nothing above
   the neck but a skin-coloured icosahedron. Then there was a brow, two
   dark beads and a four-sided cone, which was better and still not a
   face: the eyes were sunk into the skull to the iris, the brow was a
   shelf, and the nose had edges you could count. The dressing room
   puts you two metres from all of that.

   It is a face now. A smooth cranium with cheeks, a jaw and a chin
   under it; eyes with a white, an iris and a pupil, and a lid that
   rolls down over them to blink; ears; a nose with a bridge and a tip;
   and a mouth that opens while its owner is speaking — which is how
   you tell, across a round table, who has the floor.

   And then the proportions, which were the thing everyone could see
   and nobody could name. Three faults, all of them at once:

   - The figure was not the height it said it was. A `height` of 1.78
     built something 2.23 metres tall, because the parts were sized by
     eye and never added up. Everything framed against it — a 1.60
     standing camera, a 1.22 seated one, Claudia's face at `y + 1.52` —
     was therefore framed on a chest.
   - The torso was one cylinder from the belt to the collar, and a
     cylinder is as deep as it is wide. Front on it was narrow; from
     the side it was the same narrow. There was no waist and no chest,
     so there was no body — just a pipe with a coat colour.
   - The coat did not hang. It started at the hip joint and went
     upwards, which left boot-coloured legs running all the way to the
     waist and a long tube above them.

   So the skeleton below is a table of metres, every one of them a
   fraction of 1.78, and the figure is scaled to the height it was
   asked for at the end. The torso is three sections — chest, waist,
   skirt — each flattened on Z, and the coat's hem is below the belt
   where a hem goes. The head is 15% over life size and the shoulders
   are a little broad, because flat-shaded primitives at anatomically
   exact proportions read as a coat-hanger.

   Appearance is a `look` from `look.js`: enumerated choices resolved to
   colours before they arrive. `palette` is still accepted, because
   Claudia is not a contestant and does not get dressed in a lobby.

   The animation rule is unchanged and still right: a person standing
   in the wind is mostly still, and it is the small asymmetric motion
   that sells them. Everything large here is driven by something the
   figure is actually doing — walking, speaking, drawing, throwing.
------------------------------------------------------------------ */
const Figure = (() => {

  /* Two shadings, on purpose.

     `lam` is the flat-shaded one everything wore until now, and the
     clothes keep it: a coat made of facets reads as a coat made of
     panels, which is what a coat is. `lamS` is smooth, and it is for
     skin and hair — the two things on a person that have no flat
     surfaces anywhere and looked, faceted, like they had been carved
     out of something. The segment counts went up with it; a smooth
     normal on twelve sides is a smooth normal on a nut. */
  const lam  = (col) => new THREE.MeshLambertMaterial({ color: col, flatShading: true });
  const lamS = (col) => new THREE.MeshLambertMaterial({ color: col });

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

  const EYE_DARK  = '#171a1f';
  const EYE_WHITE = '#efe9e0';   // never pure white; a real one is not
  const EYE_IRIS  = '#4a3626';
  const MOUTH_COL = '#43242a';

  /* How far the lid is unrolled: nothing when the eye is open, all of
     it when shut. Written down rather than inlined because the blink
     reads them and so does the build. */
  const LID_OPEN = 0.05;
  const LID_SHUT = 1.00;
  const MOUTH_SHUT = 0.26;       // the mouth's resting Y scale

  /* ---------------- the skeleton ----------------
     Every number below is metres at a height of 1.78, and the figure
     is then scaled by whatever height it was actually asked for. That
     matters more than it looks: the hill, the round table and the fire
     are all built at human scale — a chair seat at 0.46, a table rim
     at 0.74, a standing camera at 1.60 — and a figure that is not
     actually the height it says it is has every one of those framings
     slightly wrong, which is why Claudia used to be shot from the
     collarbone up.

     The proportions are close to a real body and then pushed two ways
     on purpose: the head is a little large and the shoulders a little
     broad, because a flat-shaded figure with anatomically correct
     versions of both reads as a coat-hanger at any distance. */

  const H0        = 1.78;      // the height every measurement here is of
  const ANKLE     = 0.098;     // ankle joint, above the ground
  const KNEE      = 0.534;
  const HIP       = 0.952;     // and so the hip group's standing height

  /* above the hips */
  const SHOULDER  = 0.500;     // arm pivots, and the top of the torso
  const HEAD_AT   = 0.545;     // the head group's origin, roughly the jaw

  const THIGH = HIP - KNEE;                 // 0.418
  const SHIN  = KNEE - ANKLE;               // 0.436

  /* Sitting is the same chain, and the numbers are not taste: put the
     thigh out level and the shin straight down and there is exactly
     one height the hips can be for the feet to reach the floor. The
     old figure guessed 0.46, which folded the shins up under the seat
     — invisible under a long coat at the round table, and wrong the
     moment anybody sits anywhere else.

     `SEAT_TILT` is a shade past level, because in a chair the knee
     ends up slightly above the hip. That lands the hips 5cm over the
     0.46 seat the round table builds, which is where a person is. */
  const SEAT_TILT = -1.62;
  const SEAT_HIP  = ANKLE + SHIN + THIGH * Math.cos(SEAT_TILT);
  const SEAT_DROP = HIP - SEAT_HIP;         // ≈ 0.439

  /* Half-widths at girth 1. The torso is flattened on Z by `SQUASH`,
     so the first number is half the *width* and the depth follows. */
  const YOKE   = 0.252;        // across the shoulders
  const CHEST  = 0.224;
  const WAIST  = 0.196;
  const HEM_J  = 0.214;        // a jacket stops at the hip
  const HEM_C  = 0.300;        // a coat flares past it
  const SQUASH = 0.66;

  const HEAD_SCALE = 1.15;     // the head, over its anatomical size

  /* ---------------- pieces ---------------- */

  /* The torso, and the two things it has to get right.

     A cylinder is round, and a person is not: a chest is about twice
     as wide as it is deep, and a figure built out of round sections is
     a stack of pipes from every angle at once. `squash` flattens the
     section on Z, and it is the single change that does most of the
     work here.

     The other is that it hangs. `bottom` and `top` are heights either
     side of the hip joint, so a long coat has a hem *below* the waist
     the way a coat does, rather than a cylinder that starts at the
     belt and only ever goes up. */
  function shellGeometry(rTop, rBot, bottom, top, squash) {
    const h = top - bottom;
    const g = new THREE.CylinderGeometry(rTop, rBot, h, 22, 3, true);
    g.translate(0, bottom + h * 0.5, 0);
    g.scale(1, 1, squash);
    return g;
  }

  function limb(rTop, rBot, len, seg = 12) {
    const g = new THREE.CylinderGeometry(rTop, rBot, len, seg);
    g.translate(0, -len * 0.5, 0);
    return g;
  }

  function buildHair(style, M, head, g) {
    const add = (mesh) => { head.add(mesh); return mesh; };
    const cap = (r, sweep, y) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(r, 24, 16, 0, Math.PI * 2, 0, sweep), M.hair);
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
          new THREE.SphereGeometry(0.060 * g, 16, 12), M.hair));
        fall.scale.set(0.62, 1.85, 1.00);
        fall.position.set(side * 0.100 * g, 0.030 * g, -0.008 * g);
        fall.rotation.z = side * 0.05;
      }
      return;
    }
    if (style === 'long') {
      cap(0.144 * g, Math.PI * 0.62, 0.115 * g);
      for (const side of [-1, 1]) {
        const fall = add(new THREE.Mesh(
          new THREE.SphereGeometry(0.058 * g, 16, 12), M.hair));
        fall.scale.set(0.62, 2.85, 0.94);
        fall.position.set(side * 0.102 * g, -0.040 * g, -0.010 * g);
        fall.rotation.z = side * 0.06;
      }
      const back = add(new THREE.Mesh(
        new THREE.SphereGeometry(0.100 * g, 18, 14), M.hair));
      back.scale.set(0.98, 1.55, 0.42);
      back.position.set(0, -0.020 * g, -0.092 * g);
      return;
    }
    if (style === 'bun') {
      cap(0.138 * g, Math.PI * 0.56, 0.118 * g);
      const bun = add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.070 * g, 2), M.hair));
      bun.position.set(0, 0.145 * g, -0.125 * g);
      return;
    }
    if (style === 'tail') {
      cap(0.138 * g, Math.PI * 0.54, 0.118 * g);
      const tail = add(new THREE.Mesh(limb(0.048 * g, 0.026 * g, 0.30 * g, 14), M.hair));
      tail.position.set(0, 0.10 * g, -0.128 * g);
      tail.rotation.x = -0.55;
      return;
    }
    if (style === 'braids') {
      cap(0.140 * g, Math.PI * 0.56, 0.116 * g);
      for (const side of [-1, 1]) {
        const braid = add(new THREE.Mesh(limb(0.040 * g, 0.024 * g, 0.30 * g, 12), M.hair));
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
        new THREE.SphereGeometry(0.148 * g, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.52),
        M.accent);
      c.position.y = 0.122 * g;
      hat.add(c);
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.150 * g, 0.150 * g, 0.048 * g, 22), M.trim);
      band.position.y = 0.118 * g;
      hat.add(band);
    } else if (style === 'flat') {
      const crown = new THREE.Mesh(
        new THREE.CylinderGeometry(0.150 * g, 0.140 * g, 0.062 * g, 20), M.accent);
      // clear of the hair underneath it, which it was not
      crown.position.y = 0.230 * g;
      crown.rotation.x = -0.10;
      hat.add(crown);
      const peak = new THREE.Mesh(
        new THREE.BoxGeometry(0.20 * g, 0.020 * g, 0.135 * g), M.accent);
      peak.position.set(0, 0.204 * g, 0.140 * g);
      peak.rotation.x = -0.16;
      hat.add(peak);
    } else if (style === 'wide') {
      const crown = new THREE.Mesh(
        new THREE.CylinderGeometry(0.118 * g, 0.132 * g, 0.130 * g, 20), M.accent);
      crown.position.y = 0.232 * g;
      hat.add(crown);
      const brim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.255 * g, 0.255 * g, 0.018 * g, 26), M.accent);
      brim.position.y = 0.172 * g;
      hat.add(brim);
    } else if (style === 'band') {
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(0.132 * g, 0.020 * g, 8, 26), M.accent);
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
        new THREE.TorusGeometry(0.085 * g, 0.038 * g, 10, 24), M.accent);
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
        new THREE.CylinderGeometry(0.135 * g, 0.105 * g, 0.150 * g, 22, 1, true), M.accent);
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
      coat: lam(C.coat), trim: lam(C.trim), boot: lam(C.boot),
      glove: lam(C.glove), accent: lam(C.accent),
      skin: lamS(C.skin), hair: lamS(C.hairColour),
      white: lamS(EYE_WHITE), iris: lamS(EYE_IRIS), mouth: lamS(MOUTH_COL),
      dark: lam(EYE_DARK),
    };

    const g = C.girth || 1;                    // lateral scale only
    const s = (C.height || H0) / H0;

    const root = new THREE.Group();
    const hips = new THREE.Group();
    hips.position.y = HIP;
    root.add(hips);

    /* -------- legs --------
       Two joints each, which is the entire reason a walk is possible.
       Under a long coat only the shins show, but the chain is the same
       either way so nothing has to know which coat it is wearing.

       They are deliberately thicker than a stick: a leg the width of
       the arm above it is the classic way a figure made of cylinders
       ends up looking starved. */
    const legs = {};
    const thighH = THIGH, shinH = SHIN;
    for (const [key, side] of [['l', -1], ['r', 1]]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.092 * g, 0, 0);
      hips.add(pivot);

      const thigh = new THREE.Mesh(limb(0.101 * g, 0.079 * g, thighH, 14), M.boot);
      pivot.add(thigh);

      const knee = new THREE.Group();
      knee.position.y = -thighH;
      pivot.add(knee);

      // a calf, then an ankle: a shin that tapers all the way down is
      // the other half of the same starved look
      const shin = new THREE.Mesh(limb(0.079 * g, 0.058 * g, shinH, 14), M.boot);
      knee.add(shin);
      const calf = new THREE.Mesh(
        new THREE.SphereGeometry(0.072 * g, 14, 10), M.boot);
      calf.scale.set(1, 1.35, 1.1);
      calf.position.set(0, -shinH * 0.30, -0.014);
      knee.add(calf);

      const ankle = new THREE.Group();
      ankle.position.y = -shinH;
      knee.add(ankle);

      const foot = new THREE.Mesh(
        new THREE.BoxGeometry(0.118 * g, 0.062, 0.245), M.boot);
      foot.position.set(0, -0.066, 0.058);
      ankle.add(foot);
      const toe = new THREE.Mesh(
        new THREE.BoxGeometry(0.104 * g, 0.050, 0.070), M.boot);
      toe.position.set(0, -0.062, 0.176);
      ankle.add(toe);

      const cuff = new THREE.Mesh(
        new THREE.CylinderGeometry(0.090 * g, 0.084 * g, 0.082, 16), M.trim);
      cuff.position.y = -shinH + 0.052;
      knee.add(cuff);

      legs[key] = { pivot, knee, ankle, side };
    }

    /* -------- torso --------
       Three sections rather than one tube, because the whole reason the
       old figure read as a pole was that it was a single cylinder from
       the belt to the collar: chest, then a waist that comes in, then
       the skirt of the coat going back out. Every one of them is
       flattened on Z, so the body has a front and a side. */
    const spine = new THREE.Group();
    hips.add(spine);

    const chest = new THREE.Group();
    spine.add(chest);

    const hem = (o.long ? HEM_C : HEM_J) * g;
    const hemY = o.long ? -0.40 : -0.155;       // where the coat stops
    const waistY = 0.115;                       // the narrowest point

    const body = new THREE.Mesh(
      shellGeometry(CHEST * g, WAIST * g, waistY, SHOULDER, SQUASH), M.coat);
    chest.add(body);

    const skirt = new THREE.Mesh(
      shellGeometry(WAIST * g, hem, hemY, waistY, SQUASH), M.coat);
    chest.add(skirt);

    /* The shoulders. A cap over each one as well as the yoke across
       them: an arm that leaves a flat wall is the other thing that
       makes a primitive figure look assembled rather than built. */
    const yoke = new THREE.Mesh(
      shellGeometry(YOKE * g, CHEST * g, SHOULDER - 0.135, SHOULDER + 0.030, SQUASH),
      M.coat);
    chest.add(yoke);

    for (const side of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.088 * g, 16, 11), M.coat);
      cap.scale.set(1.05, 0.92, 0.86);
      cap.position.set(side * (YOKE - 0.082) * g, SHOULDER - 0.018, 0);
      chest.add(cap);
    }

    // the coat closes: a placket down the front and a belt across it
    const lapel = new THREE.Mesh(
      new THREE.BoxGeometry(0.078 * g, SHOULDER - hemY - 0.10, 0.030), M.trim);
    lapel.position.set(0, (SHOULDER + hemY) * 0.5 + 0.05, CHEST * g * SQUASH * 0.94);
    chest.add(lapel);

    const belt = new THREE.Mesh(
      shellGeometry((WAIST + 0.010) * g, (WAIST + 0.012) * g,
                    waistY - 0.036, waistY + 0.036, SQUASH), M.boot);
    chest.add(belt);

    const buckle = new THREE.Mesh(
      new THREE.BoxGeometry(0.068 * g, 0.056, 0.028), M.accent);
    buckle.position.set(0, waistY, WAIST * g * SQUASH + 0.012);
    chest.add(buckle);

    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.108 * g, 0.150 * g, 0.088, 20, 1, true), M.trim);
    collar.position.y = SHOULDER + 0.062;
    collar.scale.z = 0.82;
    chest.add(collar);

    buildNeckwear(C.scarf, M, chest, SHOULDER + 0.040, g);

    /* -------- arms --------
       Long enough that the fingertips reach mid-thigh, which is where
       a hanging hand actually is and the easiest proportion in a
       figure to get wrong. */
    const arms = {};
    const upperH = 0.300, foreH = 0.262;
    for (const [key, side] of [['l', -1], ['r', 1]]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * (YOKE - 0.055) * g, SHOULDER - 0.052, 0);
      chest.add(pivot);

      const upper = new THREE.Mesh(limb(0.076 * g, 0.060 * g, upperH, 14), M.coat);
      pivot.add(upper);

      const fore = new THREE.Group();
      fore.position.y = -upperH;
      pivot.add(fore);

      const lower = new THREE.Mesh(limb(0.062 * g, 0.048 * g, foreH, 14), M.coat);
      fore.add(lower);

      const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.062 * g, 14, 10), M.coat);
      elbow.scale.setScalar(0.98);
      fore.add(elbow);

      const cuff = new THREE.Mesh(
        new THREE.CylinderGeometry(0.058 * g, 0.055 * g, 0.066, 16), M.trim);
      cuff.position.y = -foreH + 0.038;
      fore.add(cuff);

      const hand = new THREE.Mesh(new THREE.IcosahedronGeometry(0.066, 2), M.glove);
      hand.position.y = -foreH - 0.046;
      hand.scale.set(0.95, 1.20, 0.78);
      fore.add(hand);

      pivot.rotation.z = side * 0.085;
      arms[key] = { pivot, fore, hand, side };
    }

    /* -------- head --------
       The face is the thing everybody looks at and it was six flat
       boxes and a four-sided cone. Two eyes buried in the skull to the
       iris, a brow that was a shelf of skin, and a nose you could
       count the sides of — at any distance closer than a wide shot it
       stopped reading as a person, which is exactly the distance the
       dressing room puts you at.

       So it is built properly now: a smooth cranium, cheeks and a
       chin under it, eyes that are eyes — white, iris, pupil, and a
       lid that comes down over them rather than a pupil squashing
       flat — a nose with a bridge and a tip, ears, and a mouth that
       opens when the person it belongs to is talking.

       Everything here is still small and still cheap; there is no
       texture and no skinning. The change is entirely in the shapes
       being the right shapes, and in the skin being smooth-shaded
       while the coat stays faceted. That contrast is doing real work:
       a face wants curvature, a garment does not mind creases. */
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.068, 0.092, 0.098, 16), M.skin);
    neck.position.y = SHOULDER + 0.036;
    neck.scale.z = 0.88;
    chest.add(neck);

    const head = new THREE.Group();
    head.position.y = HEAD_AT;
    chest.add(head);

    /* `hd` scales every piece of the head together — including the
       hair and the hat, which is why those two take it as an argument
       rather than assuming 1. Girth only reaches the head at a
       fraction of its strength: a broad build is broad in the
       shoulders, not in the skull. */
    const hd = HEAD_SCALE;
    const hg = 1 + (g - 1) * 0.35;

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.124 * hd, 24, 18), M.skin);
    skull.scale.set(0.95 * hg, 1.06, 1.00);
    skull.position.y = 0.112 * hd;
    head.add(skull);

    /* Cheeks and jaw, then the chin in front of them. Three overlapping
       ellipsoids and no seam anywhere, because they are all the same
       smooth material and Lambert does not care where one ends. */
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.104 * hd, 20, 14), M.skin);
    jaw.scale.set(0.94 * hg, 0.78, 0.96);
    jaw.position.set(0, 0.052 * hd, 0.014 * hd);
    head.add(jaw);

    const chin = new THREE.Mesh(new THREE.SphereGeometry(0.050 * hd, 14, 10), M.skin);
    chin.scale.set(0.92 * hg, 0.86, 0.86);
    chin.position.set(0, 0.010 * hd, 0.058 * hd);
    head.add(chin);

    // a brow that only just breaks the surface: a shadow line, not a shelf
    const brow = new THREE.Mesh(new THREE.SphereGeometry(0.100 * hd, 18, 12), M.skin);
    brow.scale.set(1.02 * hg, 0.30, 0.62);
    brow.position.set(0, 0.158 * hd, 0.058 * hd);
    head.add(brow);

    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.034 * hd, 12, 9), M.skin);
      ear.scale.set(0.34, 1.00, 0.72);
      ear.position.set(side * 0.115 * hd * hg, 0.104 * hd, 0.004 * hd);
      head.add(ear);
    }

    /* The eyes, and this is where most of the work went.

       An eyeball is a ball, so the obvious build is a sphere at the
       front of the head. It does not work: the skull is an ellipsoid
       and it curves away hard at exactly the width the eyes sit at, so
       a sphere placed far enough forward for the iris to clear the
       surface has its outer rim standing a centimetre proud of the
       temple. That is what "the faces look weird" is. Burying it far
       enough to fix that is what the old face did, and then only the
       dark bead of the iris showed.

       So the eye is an almond lying in the skull's own tangent plane
       at that point — turned out along the curve, tipped up with it,
       and set back into the surface by slightly less than its own
       thickness. The whole rim then sits flush and only the middle of
       the eye stands proud, by about four millimetres, which is what
       an eye does.

       Lying along the curve means the socket faces out by twenty-six
       degrees, which is roughly what a real one does and would be a
       wall-eyed stare if the iris were centred in it. It is not: the
       iris is offset towards the nose by the amount that cancels it,
       so the gaze reads straight ahead. Eyes have been drawn this way
       for as long as faces have been drawn at all. */
    const EYE_YAW   =  0.452;    // the skull's own outward normal, there
    const EYE_PITCH = -0.107;
    const eyes = {}, lids = {};
    for (const [key, side] of [['l', -1], ['r', 1]]) {
      const socket = new THREE.Group();
      socket.position.set(side * (0.0490 * hg - 0.0018) * hd,
                          0.1266 * hd, 0.1081 * hd);
      socket.rotation.y = side * EYE_YAW;
      socket.rotation.x = EYE_PITCH;
      head.add(socket);

      const white = new THREE.Mesh(new THREE.SphereGeometry(0.030 * hd, 18, 14), M.white);
      white.scale.set(1, 0.627, 0.267);
      socket.add(white);

      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.0132 * hd, 16, 12), M.iris);
      iris.scale.set(1, 1, 0.42);
      iris.position.set(side * -0.0060 * hd, 0, 0.0062 * hd);
      socket.add(iris);

      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0062 * hd, 12, 10), M.dark);
      pupil.scale.set(1, 1, 0.42);
      pupil.position.set(side * -0.0060 * hd, 0, 0.0098 * hd);
      socket.add(pupil);

      // one catchlight, which is the cheapest thing on this figure and
      // the difference between eyes and holes
      const shine = new THREE.Mesh(new THREE.SphereGeometry(0.0032 * hd, 8, 6), M.white);
      shine.scale.set(1, 1, 0.40);
      shine.position.set(side * -0.0094 * hd, 0.0042 * hd, 0.0118 * hd);
      socket.add(shine);

      /* The lid. A pivot along the top of the eye with a flap of skin
         hanging from it, rolled up to nothing when open — so a blink
         is a lid coming down, not the eyeball flattening and springing
         back, which was the old one and was the tell that this was a
         puppet. */
      const lid = new THREE.Group();
      lid.position.set(0, 0.0192 * hd, 0.0042 * hd);
      lid.scale.y = LID_OPEN;
      socket.add(lid);
      const flap = new THREE.Mesh(new THREE.SphereGeometry(0.0330 * hd, 16, 12), M.skin);
      flap.scale.set(1, 0.68, 0.24);
      flap.position.set(0, -0.0224 * hd, 0.0024 * hd);
      lid.add(flap);

      eyes[key] = socket;
      lids[key] = lid;
    }

    /* A nose, rather than a cone with four sides you could count. */
    const nose = new THREE.Group();
    nose.position.set(0, 0.088 * hd, 0.098 * hd);
    head.add(nose);
    const bridge = new THREE.Mesh(new THREE.SphereGeometry(0.030 * hd, 14, 10), M.skin);
    bridge.scale.set(0.60, 1.30, 1.10);
    bridge.position.set(0, 0.026 * hd, -0.004 * hd);
    nose.add(bridge);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.026 * hd, 14, 10), M.skin);
    tip.scale.set(0.90, 0.78, 1.05);
    tip.position.set(0, 0, 0.014 * hd);
    nose.add(tip);

    /* And a mouth, which is the one piece here that moves for a reason
       other than looking alive: `setSpeaking` opens it, so the person
       who currently has the floor is readable from across the room
       without anybody having to read a label. */
    const mouth = new THREE.Group();            // hinged along the top lip
    mouth.position.set(0, 0.0398 * hd, 0.1005 * hd);
    head.add(mouth);
    const lips = new THREE.Mesh(new THREE.SphereGeometry(0.030 * hd, 16, 10), M.mouth);
    lips.scale.set(1.05 * hg, MOUTH_SHUT, 0.42);
    lips.position.y = -0.030 * MOUTH_SHUT * hd;
    mouth.add(lips);

    buildHair(C.hair, M, head, hd);
    const hat = buildHat(C.hat, M, head, hd);

    /* -------- state -------- */
    root.userData.rig = { hips, spine, chest, head, arms, legs, body, skull,
                          eyes, lids, brow, mouth, hat, yoke };
    root.userData.mats = M;
    root.userData.h = C.height;
    root.userData.stand = hips.position.y;
    root.userData.seatDrop = SEAT_DROP;
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
    root.userData.lidNow = 0;     // 0 open, 1 shut — damped, so it rolls
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
      /* Seated: thigh out, shin down, foot flat. The knee angle is the
         thigh's, negated — that is what "the shin is vertical" means
         in a chain, and it is why it is written as `-SEAT_TILT`
         rather than as a second number that has to be kept in step. */
      L.pivot.rotation.x = U.lerp(thigh, SEAT_TILT, seat);
      L.knee.rotation.x = U.lerp(-bend - gait * 0.10, -SEAT_TILT, seat);
      L.ankle.rotation.x = U.lerp(bend * 0.45 - thigh * 0.20, 0.02, seat);
    }

    // hips bob twice per stride and roll once, which is the difference
    // between walking and being carried
    const bob = Math.abs(Math.cos(st)) * 0.052 * gait;
    r.hips.position.y = d.stand - U.lerp(bob, d.seatDrop || 0.42, seat);
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
    r.body.scale.set(1 + breath * 0.013, 1, 1 + breath * 0.020);

    /* -------- head -------- */
    d.yawNow = U.angLerp(d.yawNow, d.yawWant, 1 - Math.exp(-4.5 * dt));
    d.pitchNow = U.damp(d.pitchNow, d.pitchWant, 4.5, dt);
    r.head.rotation.y = d.yawNow + Math.sin(t * 0.53 + ph * 3.3) * 0.06 * (1 - mv)
                      + sp * Math.sin(t * 2.3 + ph) * 0.05;
    r.head.rotation.x = -d.pitchNow + Math.sin(t * 0.37 + ph * 1.3) * 0.03 - sp * 0.04
                      + sp * Math.sin(t * 3.1 + ph) * 0.035
                      - swing * 0.02 * gait - joy * 0.22 + d.flinch * 0.30;
    r.head.rotation.z = -swing * 0.028 * gait;

    /* A blink, and it is still worth more than any of the body motion
       above it. The difference now is that a lid comes down over the
       eye and is damped on the way, so it rolls shut and snaps open
       the way one does, rather than the eyeball flattening for two
       frames and springing back. */
    d.blink -= dt;
    const shut = d.blink < 0 ? 1 : 0;
    if (d.blink < -0.11) d.blink = 2.2 + Math.random() * 4.5;
    d.lidNow = U.damp(d.lidNow, shut, 30, dt);
    r.lids.l.scale.y = r.lids.r.scale.y =
      LID_OPEN + (LID_SHUT - LID_OPEN) * d.lidNow;

    /* The mouth opens while this person is talking. It is a small
       thing on a small mesh and it is the only way, across a table of
       three, to see who is speaking without reading a name. */
    if (r.mouth) {
      /* Hinged at the top lip, so it opens downwards the way a jaw
         does rather than growing in both directions from the middle. */
      const flap = 0.5 + 0.5 * Math.sin(t * 11.5 + ph * 2.7)
                       + 0.35 * Math.sin(t * 19.3 + ph);
      r.mouth.scale.y = 1 + sp * U.clamp(flap, 0, 1.2) * 1.15;
    }

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

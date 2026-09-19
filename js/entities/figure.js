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

   Then it was a face built like a real one — cranium, jaw, chin and
   brow as separate balls, eyes with a white, an iris and a lid a
   millimetre apart — and it looked like a stranger. The balls made a
   lumpy egg and the layered eyes were a stare.

   So it is stylised now, and on purpose. One smooth reshaped head;
   two glossy dark eyes with a catchlight each and a blink that
   squeezes them to a line; brows in the hair colour; a round nose;
   and a mouth that opens while its owner is speaking — which is how
   you tell, across a round table, who has the floor.

   The body went the same way. Anatomical proportions on flat-shaded
   primitives read as a coat-hanger on a stick, so it is chunky: about
   five and three-quarter heads tall, sloping shoulders, a deep torso,
   thick limbs and big hands and feet. The skeleton below is a table of
   metres at 1.72 and the figure is scaled to the height it was asked
   for, so a `height` is the height you get.

   And it is closed. Every torso section has a top and a bottom, and
   everything with an open edge — a collar, a cap peak, a head of hair
   — is double-sided. The old sections were open tubes, so any camera
   above head height looked straight down into a hollow body.

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
  const lamD = (col) => new THREE.MeshLambertMaterial({ color: col, flatShading: true,
                                                        side: THREE.DoubleSide });
  const lamSD = (col) => new THREE.MeshLambertMaterial({ color: col, side: THREE.DoubleSide });

  const PALETTES = {
    claudia: { coat: '#14161d', trim: '#8d1230', skin: '#e9c3a4', hair: '#241a16',
               boot: '#0d0e12', glove: '#2a1016', accent: '#c9a227', fabric: 'tweed' },
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
    // a wetsuit, for the water: dark neoprene with a high-vis trim,
    // because a diver nobody can pick out of blue water is not a diver
    diver:   { coat: '#123044', trim: '#39e6ff', skin: '#e2b894', hair: '#221a15',
               boot: '#0b1a26', glove: '#1c4358', accent: '#f2c14e', fabric: 'neoprene' },
  };

  const CAST_PALETTES = ['green', 'rust', 'slate', 'plum', 'ochre'];

  const EYE_DARK  = '#1c1f26';
  const EYE_SHINE = '#f4f1ea';   // never pure white
  const MOUTH_COL = '#5a2a30';

  /* How far a blink squeezes the eye: all the way to a line, rather
     than to nothing, because a lid is still there when it is shut. */
  const BLINK_SHUT = 0.08;

  /* ---------------- the skeleton ----------------
     Every number below is metres at a height of 1.72, and the figure
     is then scaled by whatever height it was actually asked for, so a
     `height` is the height you get — the round table, the fire and the
     cameras are all framed against it.

     The proportions are stylised on purpose and in one direction:
     chunky. About five and three-quarter heads tall, a torso deeper
     than a real one, sloping shoulders, thick limbs and big hands and
     feet. A flat-shaded figure at anatomical proportions reads as a
     coat-hanger on a stick at any distance — which is exactly what the
     last version did — and a sturdy one reads as a person. */

  const H0        = 1.72;      // the height every measurement here is of
  const ANKLE     = 0.090;     // ankle joint, above the ground
  const KNEE      = 0.505;
  const HIP       = 0.860;     // and so the hip group's standing height

  /* above the hips */
  const SHOULDER  = 0.450;     // arm pivots sit just under this
  const HEAD_AT   = 0.480;     // the head group's origin, just under the chin

  const THIGH = HIP - KNEE;                 // 0.355
  const SHIN  = KNEE - ANKLE;               // 0.415

  /* Sitting is the same chain: thigh out level, shin straight down,
     and there is exactly one height the hips can be for the feet to
     reach the floor. `SEAT_TILT` is a shade past level, because in a
     chair the knee ends up slightly above the hip. */
  const SEAT_TILT = -1.62;
  const SEAT_HIP  = ANKLE + SHIN + THIGH * Math.cos(SEAT_TILT);
  const SEAT_DROP = HIP - SEAT_HIP;

  /* Half-widths at girth 1. Depth is width times `SQUASH`, and girth
     reaches depth at a little over half strength — a broad build is
     broad front and back as well, just not as much. */
  const YOKE   = 0.270;        // across the shoulders, where the arms hang
  const NECKLINE = 0.150;      // the top of the shoulder slope
  const WAIST  = 0.235;
  const HEM_J  = 0.250;        // a jacket stops at the hip
  const HEM_C  = 0.310;        // a coat flares past it
  const SQUASH = 0.76;

  /* The head, in its own group's metres: an ellipsoid centred `cy`
     above the group origin, reshaped so the lower half comes in to a
     jaw. Everything that sits on a head — hair, hats, a helmet, a dive
     mask — is placed from these numbers rather than guessing. */
  const HEAD = { cy: 0.215, rx: 0.140, ry: 0.150, rz: 0.140 };

  /* ---------------- pieces ---------------- */

  /* A torso section. Closed at both ends: an open one is a hole the
     size of the shoulders that any camera above head height looks
     straight down into, and with single-sided faces the far wall of
     the body is not there either. */
  function shellGeometry(rTop, rBot, bottom, top, squash) {
    const h = top - bottom;
    const g = new THREE.CylinderGeometry(rTop, rBot, h, 22, 3, false);
    g.translate(0, bottom + h * 0.5, 0);
    g.scale(1, 1, squash);
    return g;
  }

  function limb(rTop, rBot, len, seg = 14) {
    const g = new THREE.CylinderGeometry(rTop, rBot, len, seg);
    g.translate(0, -len * 0.5, 0);
    return g;
  }

  /* The head's surface, from a direction. One function, used to build
     the head and then to put every feature on it — which is how the
     eyes come to sit flush instead of floating or sinking. */
  function headPoint(H, x, y, z, out) {
    const l = Math.hypot(x, y, z) || 1;
    x /= l; y /= l; z /= l;
    const low = Math.max(0, -y);
    const taper = 1 - 0.24 * low * low;                   // the jaw
    const face = 1 - 0.07 * Math.max(0, z) * Math.max(0, z); // a flatter front
    return (out || new THREE.Vector3()).set(
      x * H.rx * taper, H.cy + y * H.ry, z * H.rz * taper * face);
  }

  function headNormal(H, x, y, z, out) {
    const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
    const d = new THREE.Vector3(x, y, z).normalize();
    const up = Math.abs(d.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const t1 = new THREE.Vector3().crossVectors(up, d).normalize();
    const t2 = new THREE.Vector3().crossVectors(d, t1);
    const e = 1e-3;
    headPoint(H, d.x, d.y, d.z, _a);
    headPoint(H, d.x + t1.x * e, d.y + t1.y * e, d.z + t1.z * e, _b).sub(_a);
    headPoint(H, d.x + t2.x * e, d.y + t2.y * e, d.z + t2.z * e, _c).sub(_a);
    const n = (out || new THREE.Vector3()).crossVectors(_b, _c).normalize();
    if (n.dot(d) < 0) n.negate();
    return n;
  }

  function headGeometry(H) {
    const g = new THREE.SphereGeometry(1, 32, 24);
    const p = g.attributes.position, nrm = g.attributes.normal;
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      headPoint(H, x, y, z, v);
      headNormal(H, x, y, z, n);
      p.setXYZ(i, v.x, v.y, v.z);
      nrm.setXYZ(i, n.x, n.y, n.z);
    }
    g.computeBoundingSphere();
    return g;
  }

  /* A group sitting on the head's surface at a direction, facing out
     along the surface normal. `sink` pushes it in (negative lifts). */
  function onHead(H, head, dir, sink = 0) {
    const p = headPoint(H, dir[0], dir[1], dir[2]);
    const n = headNormal(H, dir[0], dir[1], dir[2]);
    const g = new THREE.Group();
    g.position.copy(p).addScaledVector(n, -sink);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    head.add(g);
    return g;
  }

  /* Hair is a shell over the head's own ellipsoid, rolled back so the
     hairline sits high at the front and low at the nape. `t` is its
     thickness, `sweep` how far down it comes and `tilt` how far back
     it is rolled. */
  function buildHair(style, M, head, H) {
    const add = (mesh) => { head.add(mesh); return mesh; };
    const blob = (sx, sy, sz, x, y, z) => {
      const m = add(new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), M.hair));
      m.scale.set(sx, sy, sz);
      m.position.set(x, y, z);
      return m;
    };
    const cap = (t, sweep, tilt) => {
      const m = add(new THREE.Mesh(
        new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, sweep), M.hair));
      m.scale.set(H.rx + t, H.ry + t, H.rz + t);
      m.position.set(0, H.cy, -t * 0.25);
      m.rotation.x = -tilt;
      return m;
    };
    const side = H.rx * 0.97 + 0.012;

    if (style === 'bald')  { cap(0.004, Math.PI * 0.40, 0.40); return; }
    if (style === 'crop')  { cap(0.008, Math.PI * 0.45, 0.45); return; }
    if (style === 'short') { cap(0.014, Math.PI * 0.48, 0.45); return; }
    if (style === 'bob') {
      cap(0.018, Math.PI * 0.56, 0.72);
      for (const s of [-1, 1]) blob(0.030, 0.100, 0.090, s * side, H.cy - 0.035, -0.022);
      return;
    }
    if (style === 'long') {
      cap(0.020, Math.PI * 0.58, 0.74);
      for (const s of [-1, 1]) blob(0.030, 0.165, 0.092, s * side, H.cy - 0.085, -0.030);
      blob(H.rx * 0.92, 0.170, 0.050, 0, H.cy - 0.085, -(H.rz * 0.86 + 0.010));
      return;
    }
    if (style === 'bun') {
      cap(0.014, Math.PI * 0.50, 0.45);
      const bun = blob(0.058, 0.058, 0.058, 0, H.cy + 0.100, -(H.rz * 0.75 + 0.030));
      bun.userData.metric = [0.30, 0.18];
      return;
    }
    if (style === 'tail') {
      cap(0.014, Math.PI * 0.50, 0.45);
      const tail = add(new THREE.Mesh(limb(0.044, 0.024, 0.28, 14), M.hair));
      tail.position.set(0, H.cy + 0.060, -(H.rz + 0.004));
      tail.rotation.x = 0.35;
      return;
    }
    if (style === 'braids') {
      cap(0.016, Math.PI * 0.54, 0.66);
      for (const s of [-1, 1]) {
        const braid = add(new THREE.Mesh(limb(0.036, 0.022, 0.30, 12), M.hair));
        braid.position.set(s * H.rx * 0.90, H.cy - 0.020, -0.040);
        braid.rotation.z = s * 0.12;
        braid.rotation.x = 0.10;
      }
    }
  }

  /* Hats sit on the same ellipsoid, a little outside the thickest
     hair, inside a group rolled with them where they are worn tilted. */
  function buildHat(style, M, head, H) {
    if (!style || style === 'none') return null;
    const hat = new THREE.Group();
    hat.position.y = H.cy;
    head.add(hat);
    const out = 0.026;
    const ex = H.rx + out, ey = H.ry + out, ez = H.rz + out;
    const across = (y) => Math.sqrt(Math.max(0, 1 - (y / ey) * (y / ey)));

    if (style === 'beanie') {
      hat.rotation.x = -0.12;
      const sweep = Math.PI * 0.42;
      const c = new THREE.Mesh(
        new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, sweep), M.accent);
      c.scale.set(ex, ey, ez);
      hat.add(c);
      const lo = Math.cos(sweep) * ey - 0.010, hi = lo + 0.048;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(
        ex * across(hi) + 0.006, ex * across(lo) + 0.006, hi - lo, 24), M.trim);
      band.position.y = (lo + hi) * 0.5;
      band.scale.z = ez / ex;
      hat.add(band);
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.036, 14, 10), M.trim);
      pom.position.y = ey + 0.018;
      hat.add(pom);
    } else if (style === 'flat') {
      hat.rotation.x = 0.12;
      const sweep = Math.PI * 0.5;
      const crown = new THREE.Mesh(
        new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, sweep), M.accent);
      crown.scale.set(H.rx + 0.032, 0.150, H.rz + 0.040);
      crown.position.y = 0.030;
      hat.add(crown);
      const peak = new THREE.Mesh(new THREE.CylinderGeometry(
        0.105, 0.105, 0.012, 16, 1, false, -Math.PI * 0.5, Math.PI), M.accent);
      peak.scale.z = 0.78;
      peak.position.set(0, 0.034, H.rz * 0.80);
      peak.rotation.x = 0.10;
      hat.add(peak);
    } else if (style === 'wide') {
      const at = 0.075;
      const crown = new THREE.Mesh(
        new THREE.CylinderGeometry(0.118, 0.150, 0.130, 20), M.accent);
      crown.position.y = at + 0.065;
      hat.add(crown);
      const brim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.260, 0.260, 0.014, 28), M.accent);
      brim.position.y = at + 0.004;
      hat.add(brim);
      const ribbon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.144, 0.149, 0.026, 20), M.trim);
      ribbon.position.y = at + 0.026;
      hat.add(ribbon);
    } else if (style === 'band') {
      const at = 0.070;
      const band = new THREE.Mesh(new THREE.TorusGeometry(
        H.rx * Math.sqrt(1 - (at / H.ry) * (at / H.ry)) + 0.020, 0.016, 8, 28), M.accent);
      band.position.y = at;
      band.rotation.x = Math.PI * 0.5;
      hat.add(band);
    }
    return hat;
  }

  /* ---------------- the figure ---------------- */

  function build(opts = {}) {
    const o = Object.assign({
      palette: null,
      look: null,
      height: 1.72,
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
            fabric: P.fabric || 'waxed',
            height: o.height, girth: o.girth };
    }

    /* Trim, accent and hair are double-sided: they are the materials
       with open edges on them — a collar ring, a cap peak, the rim of a
       head of hair — and single-sided, an open edge is a hole. */
    const M = {
      coat: lam(C.coat), trim: lamD(C.trim), boot: lam(C.boot), legs: lam(C.boot),
      glove: lam(C.glove), accent: lamD(C.accent), sash: lamD(C.accent),
      skin: lamS(C.skin), hair: lamSD(C.hairColour),
      eye: new THREE.MeshPhongMaterial({ color: EYE_DARK, shininess: 90,
                                         specular: '#5a5f68' }),
      shine: new THREE.MeshBasicMaterial({ color: EYE_SHINE }),
      mouth: lamS(MOUTH_COL),
    };

    const g = C.girth || 1;                    // width
    const gz = 1 + (g - 1) * 0.6;              // and depth, at a little over half
    const SQ = SQUASH * gz / g;                // shell squash that gets there
    const s = (C.height || H0) / H0;
    const zOf = (r) => r * SQUASH * gz;        // front of a section of half-width r

    const root = new THREE.Group();
    const hips = new THREE.Group();
    hips.position.y = HIP;
    root.add(hips);

    /* -------- legs --------
       Two joints each, which is the entire reason a walk is possible.
       Thick on purpose: a leg the width of the arm above it is the
       quickest way a figure made of cylinders ends up looking starved. */
    const legs = {};
    for (const [key, side] of [['l', -1], ['r', 1]]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.100 * g, 0, 0);
      hips.add(pivot);

      const thigh = new THREE.Mesh(limb(0.108 * g, 0.088 * g, THIGH, 16), M.legs);
      pivot.add(thigh);
      // a round top, so the leg turns in the hip rather than out of a cut
      const seatBall = new THREE.Mesh(new THREE.SphereGeometry(0.108 * g, 16, 10), M.legs);
      pivot.add(seatBall);

      const knee = new THREE.Group();
      knee.position.y = -THIGH;
      pivot.add(knee);

      const kneeBall = new THREE.Mesh(new THREE.SphereGeometry(0.088 * g, 14, 10), M.legs);
      knee.add(kneeBall);
      const shin = new THREE.Mesh(limb(0.086 * g, 0.066 * g, SHIN, 16), M.legs);
      knee.add(shin);
      const calf = new THREE.Mesh(new THREE.SphereGeometry(0.078 * g, 14, 10), M.legs);
      calf.scale.set(1, 1.35, 1.05);
      calf.position.set(0, -SHIN * 0.30, -0.012);
      knee.add(calf);

      const ankle = new THREE.Group();
      ankle.position.y = -SHIN;
      knee.add(ankle);

      // a chunky boot: a block with a rounded toe and a cuff above it
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.130 * g, 0.076, 0.230), M.boot);
      foot.position.set(0, -0.052, 0.040);
      ankle.add(foot);
      const toe = new THREE.Mesh(new THREE.SphereGeometry(0.066 * g, 16, 10), M.boot);
      toe.scale.set(1, 0.60, 1.05);
      toe.position.set(0, -0.052, 0.150);
      ankle.add(toe);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(
        0.082 * g, 0.078 * g, 0.120, 16), M.boot);
      shaft.position.y = 0.012;
      ankle.add(shaft);

      legs[key] = { pivot, knee, ankle, side };
    }

    /* -------- torso --------
       Four closed sections: the skirt of the jacket, a waist, a chest
       that widens to the arms, and a sloping shoulder that comes back
       in to the neck. Every one flattened on Z so the body has a front
       and a side, and every one closed, so there is nowhere a camera
       can see into it. */
    const spine = new THREE.Group();
    hips.add(spine);

    const chest = new THREE.Group();
    spine.add(chest);

    const hem = o.long ? HEM_C : HEM_J;
    const hemY = o.long ? -0.38 : -0.140;       // where the coat stops
    const waistY = 0.100;                        // the narrowest point
    const armY = SHOULDER - 0.060;               // widest, under the arms
    const neckY = SHOULDER + 0.035;              // top of the shoulder slope

    const body = new THREE.Mesh(
      shellGeometry(YOKE * g, WAIST * g, waistY, armY, SQ), M.coat);
    chest.add(body);

    const skirt = new THREE.Mesh(
      shellGeometry(WAIST * g, hem * g, hemY, waistY, SQ), M.coat);
    chest.add(skirt);

    const yoke = new THREE.Mesh(
      shellGeometry(NECKLINE * g, YOKE * g, armY, neckY, SQ), M.coat);
    chest.add(yoke);

    for (const side of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.096 * g, 16, 11), M.coat);
      cap.scale.set(1.0, 0.92, 0.92 * gz / g);
      cap.position.set(side * (YOKE - 0.068) * g, SHOULDER - 0.050, 0);
      chest.add(cap);
    }

    /* A strip down the front of a tapered section, lying on it. The
       cylinder has a vertex exactly at the front, so a box tilted to
       the taper touches the whole way down rather than floating off at
       one end. */
    const placket = (y0, r0, y1, r1, w, mat) => {
      const z0 = zOf(r0 * g), z1 = zOf(r1 * g);
      const len = Math.hypot(y1 - y0, z1 - z0);
      const m = new THREE.Mesh(new THREE.BoxGeometry(w * g, len, 0.022), mat);
      m.position.set(0, (y0 + y1) * 0.5, (z0 + z1) * 0.5 + 0.006);
      m.rotation.x = Math.atan2(z1 - z0, y1 - y0);
      chest.add(m);
      return m;
    };
    placket(waistY, WAIST, armY, YOKE, 0.072, M.trim);
    placket(hemY + 0.02, hem, waistY, WAIST, 0.072, M.trim);

    const belt = new THREE.Mesh(
      shellGeometry((WAIST + 0.010) * g, (WAIST + 0.012) * g,
                    waistY - 0.034, waistY + 0.034, SQ), M.boot);
    chest.add(belt);

    const buckle = new THREE.Mesh(
      new THREE.BoxGeometry(0.068 * g, 0.056, 0.024), M.accent);
    buckle.position.set(0, waistY, zOf((WAIST + 0.012) * g) + 0.010);
    chest.add(buckle);

    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.104 * g, 0.136 * g, 0.070, 22, 1, true), M.trim);
    collar.position.y = neckY + 0.030;
    collar.scale.z = SQ;
    chest.add(collar);

    /* The front of the chest at a height, for anything worn on it: a
       bib, a tank, a sash. Linear between the sections, because the
       sections are. */
    const frontZ = (y) => {
      if (y <= waistY) {
        const k = U.clamp((y - hemY) / (waistY - hemY), 0, 1);
        return zOf(U.lerp(hem, WAIST, k) * g);
      }
      const k = U.clamp((y - waistY) / (armY - waistY), 0, 1);
      return zOf(U.lerp(WAIST, YOKE, k) * g);
    };

    if (C.scarf === 'scarf') {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.100 * g, 0.036 * g, 10, 24), M.accent);
      ring.position.y = neckY + 0.022;
      ring.rotation.x = Math.PI * 0.5;
      ring.scale.y = SQ;                        // y is depth, once it is lying down
      chest.add(ring);
      const tail = new THREE.Mesh(
        new THREE.BoxGeometry(0.078 * g, 0.26, 0.034), M.accent);
      tail.position.set(0.058 * g, SHOULDER - 0.110, frontZ(SHOULDER - 0.110) + 0.024);
      tail.rotation.z = 0.08;
      chest.add(tail);
    } else if (C.scarf === 'sash') {
      /* A band that goes round the body rather than a plank laid across
         its front, which floated off both sides of a round chest. */
      const tilt = 0.55;
      const at = SHOULDER - 0.200;
      const wrap = new THREE.Group();
      wrap.position.y = at;
      wrap.rotation.z = tilt;
      chest.add(wrap);
      // cut on the slant, a body's section is an ellipse that is longer
      // along the slope by 1/cos of it and exactly as deep as before
      const rx = (YOKE * 0.97 * g + 0.016) / Math.cos(tilt);
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(rx, rx, 0.075, 36, 1, true), M.sash);
      band.scale.z = (zOf(YOKE * 0.97 * g) + 0.016) / rx;
      wrap.add(band);
    } else if (C.scarf === 'cowl') {
      const cowl = new THREE.Mesh(
        new THREE.CylinderGeometry(0.130 * g, 0.150 * g, 0.140, 22, 1, true), M.accent);
      cowl.position.y = neckY + 0.040;
      cowl.scale.z = SQ;
      chest.add(cowl);
    }

    /* -------- arms --------
       Long enough that the fingertips reach mid-thigh, which is where
       a hanging hand actually is, and thick enough to belong to the
       body they hang off. */
    const arms = {};
    const upperH = 0.270, foreH = 0.230;
    for (const [key, side] of [['l', -1], ['r', 1]]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * (YOKE - 0.062) * g, SHOULDER - 0.070, 0);
      chest.add(pivot);

      const upper = new THREE.Mesh(limb(0.084 * g, 0.070 * g, upperH, 16), M.coat);
      pivot.add(upper);

      const fore = new THREE.Group();
      fore.position.y = -upperH;
      pivot.add(fore);

      const lower = new THREE.Mesh(limb(0.070 * g, 0.058 * g, foreH, 16), M.coat);
      fore.add(lower);

      const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.070 * g, 14, 10), M.coat);
      fore.add(elbow);

      const cuff = new THREE.Mesh(
        new THREE.CylinderGeometry(0.064 * g, 0.062 * g, 0.060, 16), M.trim);
      cuff.position.y = -foreH + 0.030;
      fore.add(cuff);

      // a mitten of a hand: big, soft and round, the stylised way
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.060 * g, 16, 12), M.glove);
      hand.position.y = -foreH - 0.048;
      hand.scale.set(0.92, 1.18, 0.78);
      fore.add(hand);
      const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.024 * g, 10, 8), M.glove);
      thumb.position.set(-side * 0.040 * g, -foreH - 0.030, 0.026);
      fore.add(thumb);

      pivot.rotation.z = side * 0.085;
      arms[key] = { pivot, fore, hand, side };
    }

    /* -------- head --------
       One smooth, reshaped ellipsoid rather than five overlapping balls
       — the old skull, jaw, chin and brow made a lumpy egg that read as
       a stranger's face — with simple stylised features on it: two
       glossy dark eyes with a catchlight each, brows in the hair
       colour, a small round nose, ears, and a mouth that opens while
       its owner is talking. There is no eye-white, iris and lid stacked
       a millimetre apart any more; that stack was the stare. */
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.064, 0.074, 0.130, 16), M.skin);
    neck.position.y = SHOULDER + 0.050;
    neck.scale.z = 0.90;
    chest.add(neck);

    const head = new THREE.Group();
    head.position.y = HEAD_AT;
    chest.add(head);

    // girth reaches the skull only faintly: a broad build is broad in
    // the shoulders, not in the head
    const hg = 1 + (g - 1) * 0.35;
    const H = { cy: HEAD.cy, rx: HEAD.rx * hg, ry: HEAD.ry, rz: HEAD.rz };

    const skull = new THREE.Mesh(headGeometry(H), M.skin);
    skull.userData.metric = [0.90, 0.47];
    head.add(skull);

    for (const side of [-1, 1]) {
      const ear = onHead(H, head, [side, 0.02, -0.06], 0.006);
      const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 9), M.skin);
      lobe.scale.set(0.70, 1.00, 0.36);
      ear.add(lobe);
    }

    const EYE_X = 0.34, EYE_UP = 0.00;
    const eyes = {}, blinks = [], brows = [];
    for (const [key, side] of [['l', -1], ['r', 1]]) {
      const socket = onHead(H, head, [side * EYE_X, EYE_UP, 1], 0.005);
      const blink = new THREE.Group();
      socket.add(blink);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 18, 14), M.eye);
      eye.scale.set(0.76, 1.0, 0.36);
      eye.userData.keepLOD = true;
      blink.add(eye);
      // one catchlight, from the same side on both, and it is the
      // difference between eyes and holes
      const shine = new THREE.Mesh(new THREE.SphereGeometry(0.0058, 8, 6), M.shine);
      shine.scale.set(1, 1, 0.4);
      shine.position.set(0.0072, 0.0100, 0.0088);
      shine.userData.keepLOD = true;
      blink.add(shine);
      eyes[key] = socket;
      blinks.push(blink);

      const bs = onHead(H, head, [side * 0.35, 0.33, 1], -0.003);
      const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.0078, 0.034, 4, 8), M.hair);
      brow.rotation.z = Math.PI * 0.5 - side * 0.12;
      brow.scale.z = 0.6;
      bs.add(brow);
      brows.push(brow);
    }

    const noseAt = onHead(H, head, [0, -0.20, 1], -0.006);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.023, 14, 10), M.skin);
    nose.scale.set(1.0, 0.82, 0.80);
    noseAt.add(nose);

    /* The mouth is hinged along its top edge, so opening it grows it
       downwards the way a jaw does. */
    const mouth = onHead(H, head, [0, -0.50, 1], 0.001);
    const lips = new THREE.Mesh(new THREE.CapsuleGeometry(0.0085, 0.030, 4, 10), M.mouth);
    lips.rotation.z = Math.PI * 0.5;
    lips.scale.z = 0.5;
    lips.position.y = -0.0085;
    mouth.add(lips);

    buildHair(C.hair, M, head, H);
    const hat = buildHat(C.hat, M, head, H);

    /* Where a helmet or a mask goes, in head-group metres: the front of
       the face at eye height and the eye line itself. */
    const eyeP = headPoint(H, EYE_X, EYE_UP, 1);
    const faceP = headPoint(H, 0, EYE_UP, 1);
    const headDims = { cy: H.cy, rx: H.rx, ry: H.ry, rz: H.rz,
                       eyeY: eyeP.y, faceZ: faceP.z };

    /* -------- texture --------
       The weave for each material, if the atlas is on this page at all.
       Coat fabric is chosen per coat colour in `look.js`. */
    let textured = false;
    if (typeof FigureMaterials !== 'undefined') {
      const F = FigureMaterials;
      F.material(M.coat, C.fabric || 'waxed', 0.70);
      F.material(M.trim, 'rib', 0.60);
      F.material(M.legs, C.fabric === 'neoprene' ? 'neoprene' : 'twill', 0.55);
      F.material(M.boot, 'leather', 0.50);
      F.material(M.glove, 'suede', 0.55);
      F.material(M.accent, 'cable', 0.65);
      F.material(M.sash, 'tartan', 0.75);
      F.material(M.hair, C.hair === 'braids' || C.hair === 'bun' ? 'wavy' : 'hair', 0.55);
      F.material(M.skin, 'skin', 0.15);
      textured = F.dress(root) && !F.failed;
    }

    /* -------- state -------- */
    root.userData.rig = { hips, spine, chest, head, arms, legs, body, skull,
                          eyes, blinks, brows, mouth, hat, yoke,
                          headDims, frontZ, backZ: (y) => -frontZ(y) };
    root.userData.mats = M;
    root.userData.h = C.height;
    root.userData.girth = g;
    root.userData.figureTextured = textured;
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
    /* Swimming. `swim` is how much of the body the water has, `swimPhase`
       is the stroke clock — owned by the swimmer, because the kick and
       the body wave are the same event — and `tuck` folds the arms in
       around whatever is being carried. */
    root.userData.swim = 0;       root.userData.swimWant = 0;
    root.userData.swimPhase = 0;
    root.userData.swimEffort = 0; root.userData.swimEffortWant = 0;
    root.userData.tuck = 0;       root.userData.tuckWant = 0;
    /* How steeply they are aiming, which is a separate number from
       whether they are aiming at all. A figure shooting at a bird
       forty degrees up and standing bolt upright is the pose that
       makes a third-person archer look like a mannequin holding a
       stick, so the whole chest goes with the shot. */
    root.userData.aimPitch = 0;   root.userData.aimPitchWant = 0;
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

  /* The same idea for water. One phase and one effort in, a dolphin
     kick out — and, exactly like `setLocomotion`, this only ever writes
     the *wants*. `update` does the damping, so a caller cannot fight
     the rig's own smoothing by posing joints from outside it.

     `phase` is the stroke clock rather than a free-running timer: the
     swimmer advances it through a full turn per kick and idles it in
     the glide, so the body wave and the thrust are the same event. */
  function setSwim(fig, phase, effort, tuck) {
    if (!fig || !fig.userData.rig) return;
    const d = fig.userData;
    d.swimWant = 1;
    d.swimPhase = phase || 0;
    d.swimEffortWant = U.clamp(effort || 0, 0, 1);
    d.tuckWant = U.clamp(tuck || 0, 0, 1);
  }
  const setSwimming = (fig, on) => { if (fig) fig.userData.swimWant = on ? 1 : 0; };

  /* `pitch` is optional and is the shooter's own aim pitch in radians,
     positive for up — the same number their camera is using. Passing it
     tilts the torso and the head into the shot; leaving it out is the
     old behaviour and stays upright. */
  const setAiming = (fig, on, pitch) => {
    if (!fig) return;
    fig.userData.aimWant = on ? 1 : 0;
    if (pitch === undefined) return;
    const p = U.clamp(pitch, -0.6, 1.15);
    fig.userData.aimPitchWant = p;
    /* The chest is already carrying most of the angle, so the neck
       only makes up the difference. Giving the head the whole of it as
       well is how you get an archer looking over the top of their own
       bow. */
    fig.userData.pitchWant = U.clamp(p * 0.45, -0.45, 0.45);
  };
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
    d.aimPitch = U.damp(d.aimPitch, d.aimPitchWant || 0, 8, dt);
    d.cheering = U.damp(d.cheering, d.cheerWant  || 0, 6, dt);
    d.holding  = U.damp(d.holding,  d.holdWant   || 0, 7, dt);
    d.swim       = U.damp(d.swim,       d.swimWant       || 0, 6, dt);
    d.swimEffort = U.damp(d.swimEffort, d.swimEffortWant || 0, 10, dt);
    d.tuck       = U.damp(d.tuck,       d.tuckWant       || 0, 8, dt);
    d.flinch   = Math.max(0, (d.flinch || 0) - dt * 3.2);

    const sw = d.swim;
    const sp = d.speaking, seat = d.seated, mv = d.moving * (1 - seat) * (1 - sw);
    const rn = d.running, aim = d.aiming * (1 - seat) * (1 - sw), joy = d.cheering;
    const swPh = d.swimPhase || 0, swEff = d.swimEffort || 0, tuck = d.tuck || 0;

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
      let px = U.lerp(thigh, SEAT_TILT, seat);
      let kx = U.lerp(-bend - gait * 0.10, -SEAT_TILT, seat);
      let ax = U.lerp(bend * 0.45 - thigh * 0.20, 0.02, seat);

      /* The dolphin kick. Both legs together with a hair of lag between
         them — dead symmetry reads as a machine — and the knee only
         folds on the recovery half, which is the half that does no
         work. The ankle stays pointed the whole way through, because a
         flexed foot in a fin is a brake. */
      if (sw > 0.001) {
        const k = Math.sin(swPh - (key === 'l' ? 0 : 0.14));
        const amp = 0.26 + 0.66 * swEff;
        px = U.lerp(px, k * amp, sw);
        kx = U.lerp(kx, -Math.max(0, -k) * (0.45 + 0.95 * swEff) - 0.06, sw);
        ax = U.lerp(ax, 0.42 + k * 0.22, sw);
      }
      L.pivot.rotation.x = px;
      L.knee.rotation.x = kx;
      L.ankle.rotation.x = ax;
    }

    // hips bob twice per stride and roll once, which is the difference
    // between walking and being carried
    const bob = Math.abs(Math.cos(st)) * 0.052 * gait;
    r.hips.position.y = d.stand - U.lerp(bob, d.seatDrop || 0.42, seat) * (1 - sw);
    r.hips.rotation.z = swing * 0.052 * gait + Math.sin(t * 0.42 + ph) * 0.012 * (1 - mv);
    r.hips.rotation.y = -swing * 0.075 * gait;
    /* The wave runs hips -> spine -> chest with a lag at each joint,
       which is the whole of why an undulation reads as a body rather
       than as three hinges moving at once. */
    if (sw > 0.001) {
      r.hips.rotation.x = U.lerp(r.hips.rotation.x || 0,
                                 Math.sin(swPh) * (0.08 + 0.16 * swEff), sw);
      r.hips.rotation.z = U.lerp(r.hips.rotation.z, 0, sw);
      r.hips.rotation.y = U.lerp(r.hips.rotation.y, 0, sw);
    } else if (r.hips.rotation.x) r.hips.rotation.x = 0;

    // weight shifting from one foot to the other while standing still
    const sway = (Math.sin(t * 0.42 + ph) * 0.5 + Math.sin(t * 0.71 + ph * 1.7) * 0.5)
                 * (1 - mv);
    r.spine.rotation.z = -sway * 0.026 - d.lean * 0.16 * mv;
    r.spine.rotation.y = swing * 0.085 * gait + Math.sin(t * 0.31 + ph * 2.1) * 0.05 * (1 - mv);
    r.spine.rotation.x = mv * (0.10 + rn * 0.16) - joy * 0.10 + d.flinch * 0.22;
    if (sw > 0.001) {
      r.spine.rotation.x = U.lerp(r.spine.rotation.x,
        Math.sin(swPh - 0.55) * (0.07 + 0.15 * swEff) + tuck * 0.30, sw);
      r.spine.rotation.z = U.lerp(r.spine.rotation.z, 0, sw);
      r.spine.rotation.y = U.lerp(r.spine.rotation.y, 0, sw);
    }

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
    for (const b of r.blinks) b.scale.y = 1 - (1 - BLINK_SHUT) * d.lidNow;

    /* The mouth opens while this person is talking. It is a small
       thing on a small mesh and it is the only way, across a table of
       three, to see who is speaking without reading a name. */
    if (r.mouth) {
      /* Hinged at the top lip, so it opens downwards the way a jaw
         does rather than growing in both directions from the middle. */
      const flap = 0.5 + 0.5 * Math.sin(t * 11.5 + ph * 2.7)
                       + 0.35 * Math.sin(t * 19.3 + ph);
      r.mouth.scale.y = 1 + sp * U.clamp(flap, 0, 1.2) * 1.6;
    }
    // and the brows go up with it, a little, which is most of what
    // makes a speaking face look like it means it
    for (const b of r.brows) b.position.y = sp * (0.003 + 0.002 * Math.sin(t * 1.7 + ph));

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

      /* Swimming: the arms lock out overhead — which, once the whole
         figure is prone, is straight down the line of travel — and are
         pulled through on the working half of the stroke. Carrying
         folds them back in around whatever is in them. */
      if (sw > 0.001) {
        const pull = Math.max(0, Math.sin(swPh)) * swEff;
        const sx = -2.70 + pull * 2.05 + tuck * 1.55;
        const sz = A.side * (0.07 + pull * 0.28) + tuck * A.side * 0.22;
        const sfx = -0.06 - pull * 0.52 - tuck * 1.05;
        x = U.lerp(x, sx, sw);
        z = U.lerp(z, sz, sw);
        fx = U.lerp(fx, sfx, sw);
      }

      A.pivot.rotation.x = x;
      A.pivot.rotation.z = z;
      A.fore.rotation.x = fx;
    }

    /* The whole body leans into the throw, or it is a hand on a stick —
       and an archer leans back into a steep shot rather than craning a
       neck at it. */
    r.chest.rotation.x = -hold * 0.06 + back * 0.16 - thru * 0.26 - aim * 0.06
                         - aim * (d.aimPitch || 0) * 0.55;
    r.chest.rotation.y = aim * 0.30;
    r.chest.rotation.z = sway * 0.018;
    if (sw > 0.001) {
      r.chest.rotation.x = U.lerp(r.chest.rotation.x,
        Math.sin(swPh - 1.05) * (0.06 + 0.12 * swEff) + tuck * 0.22, sw);
      r.chest.rotation.y = U.lerp(r.chest.rotation.y, 0, sw);
      /* Head up out of the streamline: a diver looks where they are
         going, and a figure staring at the sand for three minutes is
         the single fastest way to make this read as a corpse. */
      r.head.rotation.x = U.lerp(r.head.rotation.x, -0.62 - d.pitchNow * 0.4, sw);
      r.head.rotation.z = U.lerp(r.head.rotation.z, 0, sw);
    }
  }

  function dispose(fig) {
    if (!fig) return;
    Engine.disposeObject(fig);
    const M = fig.userData.mats || {};
    for (const k in M) M[k].dispose();
  }

  // a stable palette per player, so the same name is the same coat
  function paletteFor(index) { return CAST_PALETTES[index % CAST_PALETTES.length]; }

  return { build, update, setSeated, HEAD, setSpeaking, setLocomotion, setAiming,
           setSwim, setSwimming,
           setCheering, flinch, lookAt, dispose, paletteFor,
           setHolding, throwNow, throwProgress, handAt, headAt, THROW_AT,
           PALETTES, CAST_PALETTES };
})();

/* ------------------------------------------------------------------
   predators.js — the thing in the water with you.

   The dive has always been a negotiation with your own greed: one
   more chest, one more metre, one more second. Every risk in it was
   something *you* did. That is a good mechanic and it is a quiet one,
   because nothing in the loch ever disagrees with you — the water
   simply lets you drown yourself at a rate you choose.

   A shark disagrees with you. It is the one thing down here with an
   opinion about where you are, and the whole design of it is
   arranged around three rules:

     1. **It never kills you.** A run that ends because an animal
        decided so is a run you did not lose, and this mission's
        entire social layer rests on a blackout being *your* fault and
        arguable. A strike costs air and knocks a chest out of your
        hands. What kills you is being forty metres down with a
        quarter of a bar left afterwards — which is still, exactly, a
        decision you made.

     2. **It is attracted to what you are winning.** Sight is a radius
        multiplied by how much noise you are making, and noise is
        thrashing and gold. Working the trench with four chests, on
        the beat, at full effort is the loudest thing in the loch, and
        it is also the best three seconds you will have all night.
        Those being the same three seconds is the point.

     3. **You can fight it off.** A kick, into it, inside touching
        distance, turns it away. It is the only defensive move in the
        mission and it costs exactly what a stroke costs — so the
        answer to a shark is to swim *at* it, which is a much better
        thing to have learned than to swim away from it.

   Nothing in here knows about money, air or blackouts. It reports
   that it hit somebody; the mission decides what that was worth.
------------------------------------------------------------------ */
const PredatorKit = (() => {

  const TUNE = {
    cruise:     3.6,    // patrolling, metres a second
    stalk:      6.2,    // interested
    charge:    13.0,    // committed — faster than a diver on the beat
    turn:       1.9,    // radians a second, patrolling
    turnStalk:  2.6,
    turnCharge: 3.6,    // sharp enough to be dodged, not sharp enough to be fair

    /* Two ranges and a cone, which between them are the whole of "it
       has seen you". The cone is what makes swimming behind one work,
       and the short omnidirectional range is what stops that being a
       free pass — you can hide from its eyes, not from its nose. */
    sight:     36,
    cone:      0.30,    // cosine of the half-angle: about seventy degrees
    sense:     13,

    strikeAt:   2.4,    // touching distance
    commit:     1.15,   // seconds of stalking before it comes
    missAfter:  2.8,    // ...and how long a charge has to connect in
    veer:       3.6,    // seconds of peeling away after a strike or a kick
    fendRange:  4.2,    // how close a kick has to land to turn one
    cool:       1.2,    // seconds after a strike before it can strike again

    leash:    110,      // how far from its water it will follow
    minDepth:   3.4,    // it never comes to the surface after you
    floorGap:   1.3,    // ...nor ploughs the sand
  };

  const _v = new THREE.Vector3();
  const _w = new THREE.Vector3();
  const _look = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);

  /* =============== the body ===============

     Grey on top, white underneath, and a silhouette that has to read
     through thirty metres of blue water: a shark seen from the far
     side of the loch is a shape, and every detail that is not the
     shape is a detail you are paying for and nobody is seeing.

     But it is also, twice a run, a shape eight feet from your mask —
     and up there the thing has to hold together. So it is built out
     of its own profile rather than out of a squashed ball, for one
     reason above all the others: the tail hangs off a pivot at the
     wrist, and a pivot only reads as a joint if the body is actually
     *thin* where it is. A scaled icosahedron is not — it is still
     most of a metre across at the wrist — so the caudal swung away
     from a stump and the animal read as two objects that happened to
     be near each other. A profile that tapers to almost nothing puts
     the hinge somewhere a hinge belongs.

     Everything else here is the same argument at a smaller scale: the
     snout is the front of the body rather than a cone stuck on it — a
     cone whose base is wider than the head it grows out of is the
     single most obviously broken thing a fish can have — the fins are
     thin blades rather than squashed pyramids, and the mouth opens on
     a hinge under the head, where a shark's mouth is, instead of a
     dark cone growing out of the point of its face.

     Two materials, four meshes, and a few hundred triangles. */

  /* Half-width, half-height and how far off the centreline the section
     sits, at thirteen stations from the nose to the wrist. Read it as a
     side and a top view of a shark, because that is what it is. */
  const PROFILE = [
    // t      half-width  half-height  centre
    [0.000,   0.012,      0.014,       0.030],
    [0.040,   0.080,      0.092,       0.012],
    [0.100,   0.142,      0.172,      -0.008],
    [0.180,   0.198,      0.252,      -0.018],
    [0.280,   0.230,      0.300,      -0.010],
    [0.380,   0.234,      0.306,       0.000],
    [0.480,   0.216,      0.286,       0.010],
    [0.580,   0.186,      0.247,       0.018],
    [0.690,   0.148,      0.198,       0.026],
    [0.790,   0.108,      0.146,       0.030],
    [0.880,   0.072,      0.100,       0.032],
    [0.950,   0.050,      0.072,       0.034],
    [1.000,   0.038,      0.056,       0.034],
  ];
  const NOSE = 2.05, WRIST = -1.20;   // where the profile begins and ends
  const SEGS = 10;                    // sections round; faceted on purpose
  const BELLY = 0.82;                 // how much flatter the underside is

  /* The profile read at any station, and — the only thing anything
     outside this file needs from it — where the underside of the animal
     is at a given z. The mouth is built off that rather than off a
     constant, because a shark's jaw follows the line of its belly and a
     flat plate across a curved head is a plate you can see through. */
  function profileAt(t) {
    const k = U.clamp(t, 0, 1);
    for (let i = 1; i < PROFILE.length; i++) {
      if (k > PROFILE[i][0] && i < PROFILE.length - 1) continue;
      const a = PROFILE[i - 1], b = PROFILE[i];
      const f = U.clamp((k - a[0]) / (b[0] - a[0] || 1), 0, 1);
      return { hw: U.lerp(a[1], b[1], f), hh: U.lerp(a[2], b[2], f),
               off: U.lerp(a[3], b[3], f) };
    }
    return { hw: PROFILE[0][1], hh: PROFILE[0][2], off: PROFILE[0][3] };
  }
  function bellyAt(z) {
    const p = profileAt((NOSE - z) / (NOSE - WRIST));
    return p.off - p.hh * BELLY;
  }

  /* One tapered tube, with the countershading baked into the vertices.
     The belly is flattened because a shark in section is a teardrop
     rather than an ellipse, and the flat underside is most of why the
     white reads as a *side* of the animal rather than as a highlight. */
  function bodyGeometry(s, back, belly) {
    const pos = [], col = [], idx = [];
    const c = new THREE.Color();

    const ring = (row) => {
      const [t, hw, hh, off] = row;
      const z = (NOSE - t * (NOSE - WRIST)) * s;
      const base = pos.length / 3;
      for (let i = 0; i < SEGS; i++) {
        const a = (i / SEGS) * Math.PI * 2;
        const sa = Math.sin(a), ca = Math.cos(a);
        pos.push(hw * sa * s, (off + hh * ca * (ca > 0 ? 1 : BELLY)) * s, z);
        /* The line between the two colours is a *line*, not a fade:
           countershading on a real animal has an edge to it, and that
           edge is what makes the shape legible against the light. */
        c.copy(belly).lerp(back, U.smoothstep(-0.30, 0.18, ca));
        col.push(c.r, c.g, c.b);
      }
      return base;
    };

    let prev = ring(PROFILE[0]);
    for (let r = 1; r < PROFILE.length; r++) {
      const cur = ring(PROFILE[r]);
      for (let i = 0; i < SEGS; i++) {
        const j = (i + 1) % SEGS;
        idx.push(prev + i, cur + i, cur + j, prev + i, cur + j, prev + j);
      }
      prev = cur;
    }

    // ...and the two caps, so nothing is open to the water
    const cap = (row, base, sign) => {
      const z = (NOSE - row[0] * (NOSE - WRIST)) * s + sign * 0.05 * s;
      const centre = pos.length / 3;
      pos.push(0, row[3] * s, z);
      c.copy(belly).lerp(back, 0.5);
      col.push(c.r, c.g, c.b);
      for (let i = 0; i < SEGS; i++) {
        const j = (i + 1) % SEGS;
        if (sign > 0) idx.push(centre, base + j, base + i);
        else idx.push(centre, base + i, base + j);
      }
    };
    cap(PROFILE[0], 0, 1);
    cap(PROFILE[PROFILE.length - 1], prev, -1);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /* A fin: a flat polygon given in the animal's own (z, y) plane,
     pushed out to a thickness in x. A blade rather than a squashed
     cone, because a fin *is* a blade — and a cone flattened until it is
     one has a base you can see from underneath.

     The winding is decided from the polygon's own signed area rather
     than assumed, so a fin can be authored nose-first or tail-first and
     still have its faces pointing outwards. Getting that wrong costs
     you one whole side of every fin on the animal, and it does it
     silently. */
  function finGeometry(pts, thick, colour) {
    const pos = [], col = [], idx = [];
    const n = pts.length;
    const h = thick / 2;
    let area = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      area += a[1] * b[0] - b[1] * a[0];
    }
    const flip = area < 0;
    for (const x of [h, -h]) {
      for (const p of pts) { pos.push(x, p[1], p[0]); col.push(colour.r, colour.g, colour.b); }
    }
    const tri = (a, b, c) => (flip ? idx.push(a, c, b) : idx.push(a, b, c));
    for (let i = 1; i < n - 1; i++) {
      tri(0, i, i + 1);                    // the +x face
      tri(n, n + i + 1, n + i);            // ...and the −x one
    }
    for (let i = 0; i < n; i++) {          // and the rim round the outside
      const j = (i + 1) % n;
      tri(i, n + i, n + j);
      tri(i, n + j, j);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /* A row of teeth, as one geometry: little wedges on the bow of a jaw,
     which at two metres is the difference between a mouth and a dark
     line. They are the last thing anybody sees before a strike, so they
     are worth their forty triangles.

     `y0`/`y1` are the corner and the point of the jaw, so the row
     follows the belly line instead of cutting across it. */
  function teethGeometry(s, o) {
    const parts = [];
    for (let i = 0; i < o.n; i++) {
      const u = o.n === 1 ? 0 : (i / (o.n - 1)) * 2 - 1;   // −1 corner … +1 corner
      const bow = Math.cos(u * Math.PI / 2);               // 1 at the point
      const t = new THREE.ConeGeometry(0.026 * s, 0.085 * s, 3);
      if (!o.up) t.rotateX(Math.PI);
      t.translate(u * o.halfW * s,
                  U.lerp(o.y0, o.y1, bow) * s,
                  U.lerp(o.z0, o.z1, bow) * s);
      parts.push(t);
    }
    const g = Sky.mergeGeometries(parts);
    for (const p of parts) p.dispose();
    return g;
  }

  function paint(geo, colour) {
    const p = geo.attributes.position;
    const cc = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      cc[i * 3] = colour.r; cc[i * 3 + 1] = colour.g; cc[i * 3 + 2] = colour.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    return geo;
  }

  /* Where the mouth is: the corner of the jaw, the point of it, and the
     hinge between them. All three read off `bellyAt`, so the mouth
     moves if the profile ever does. */
  const JAW_BACK = 1.08, JAW_FRONT = 1.74;

  function sharkMesh(rng, size) {
    const s = size;
    const back = new THREE.Color('#33485a');
    const belly = new THREE.Color('#e8f1f4');
    const dark = new THREE.Color('#1b0d12');
    const bone = new THREE.Color('#f2f4ea');
    const eye  = new THREE.Color('#07090c');

    const yBack = bellyAt(JAW_BACK), yFront = bellyAt(JAW_FRONT);

    /* ---- the body, and every blade welded to it ---- */
    const shell = [bodyGeometry(s, back, belly)];

    // the first dorsal, which is the whole animal as far as a diver
    // glancing over their shoulder is concerned
    shell.push(finGeometry([[0.58, 0.24], [0.16, 1.00], [-0.62, 0.30], [-0.30, 0.16]]
                           .map(p => [p[0] * s, p[1] * s]), 0.075 * s, back));
    // the second, and the anal fin under it: small, and between them
    // what stops the back half reading as a bare tube
    shell.push(finGeometry([[-0.74, 0.15], [-0.90, 0.34], [-1.06, 0.17], [-0.94, 0.12]]
                           .map(p => [p[0] * s, p[1] * s]), 0.05 * s, back));
    shell.push(finGeometry([[-0.72, -0.13], [-0.90, -0.30], [-1.04, -0.15], [-0.92, -0.11]]
                           .map(p => [p[0] * s, p[1] * s]), 0.05 * s, back));

    for (const side of [1, -1]) {
      /* The pectorals: swept back and angled *down*. That downward set
         is the line that says "this is going somewhere", and it is the
         one thing that separates the silhouette from a fish. */
      const pec = finGeometry([[0.86, 0.02], [0.16, 0.00], [-0.34, 1.00], [0.16, 1.02]]
                              .map(p => [p[0] * s, p[1] * s]), 0.055 * s, back);
      pec.rotateZ(-side * (Math.PI / 2 + 0.24));
      pec.translate(side * 0.17 * s, -0.13 * s, 0);
      shell.push(pec);

      const pel = finGeometry([[-0.42, 0.02], [-0.72, 0.00], [-0.86, 0.42], [-0.58, 0.44]]
                              .map(p => [p[0] * s, p[1] * s]), 0.04 * s, back);
      pel.rotateZ(-side * (Math.PI / 2 + 0.55));
      pel.translate(side * 0.10 * s, -0.09 * s, 0);
      shell.push(pel);
    }

    const bodyGeo = Sky.mergeGeometries(shell);
    for (const g of shell) g.dispose();

    /* ---- the head: eyes, gills, and the roof of the mouth. All dark,
       all one mesh. This is the half of the animal that only exists for
       the two seconds it is close enough to matter. ---- */
    const headParts = [];
    for (const side of [1, -1]) {
      const e = new THREE.IcosahedronGeometry(0.048 * s, 0);
      e.translate(side * 0.180 * s, 0.045 * s, 1.34 * s);
      headParts.push(paint(e, eye));
      for (let i = 0; i < 5; i++) {          // five slits, raked back
        const gsl = new THREE.BoxGeometry(0.014 * s, 0.170 * s, 0.020 * s);
        gsl.rotateX(0.30);
        gsl.translate(side * 0.212 * s, -0.02 * s, (0.80 - i * 0.10) * s);
        headParts.push(paint(gsl, dark));
      }
    }
    /* The roof of the mouth, following the belly line and standing a
       centimetre proud of it, so the shut mouth is a dark seam under
       the snout rather than something you only find out about when it
       opens. */
    const palate = finGeometry(
      [[JAW_BACK, yBack - 0.03], [JAW_FRONT, yFront - 0.03],
       [JAW_FRONT, yFront + 0.02], [JAW_BACK, yBack + 0.02]].map(p => [p[0] * s, p[1] * s]),
      0.30 * s, dark);
    headParts.push(palate);
    headParts.push(paint(teethGeometry(s, {
      n: 9, up: false, halfW: 0.140,
      z0: JAW_BACK + 0.04, z1: JAW_FRONT - 0.05,
      y0: yBack - 0.035, y1: yFront - 0.035,
    }), bone));
    const headGeo = Sky.mergeGeometries(headParts);
    for (const g of headParts) g.dispose();

    /* ---- and the lower jaw, on a hinge at the corner of the mouth. It
       is shut for the whole mission except in the second and a half
       before a strike, and that is the only warning the animal gives
       you that is not a change of speed. ---- */
    const jawParts = [];
    const dz = JAW_FRONT - JAW_BACK, dy = yFront - yBack;
    jawParts.push(finGeometry(
      [[0, -0.055], [dz, dy - 0.055], [dz, dy + 0.005], [0, 0.005]]
        .map(p => [p[0] * s, p[1] * s]), 0.26 * s, dark));
    jawParts.push(paint(teethGeometry(s, {
      n: 9, up: true, halfW: 0.126,
      z0: 0.04, z1: dz - 0.05,
      y0: -0.030, y1: dy - 0.030,
    }), bone));
    const jawGeo = Sky.mergeGeometries(jawParts);
    for (const g of jawParts) g.dispose();

    /* ---- the tail, on its own pivot at the wrist ---- */
    const caudalGeo = finGeometry(
      [[0.06, 0.05], [-0.30, 0.52], [-1.34, 1.18], [-0.84, 0.13],
       [-0.96, -0.62], [-0.34, -0.30], [0.06, -0.09]].map(p => [p[0] * s, p[1] * s]),
      0.06 * s, back);

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const darkMat = new THREE.MeshLambertMaterial({
      vertexColors: true, flatShading: true,
      emissive: '#2a0a10', emissiveIntensity: 0.35,
    });

    const g = new THREE.Group();
    g.add(new THREE.Mesh(bodyGeo, mat));
    g.add(new THREE.Mesh(headGeo, darkMat));

    const jaw = new THREE.Object3D();
    jaw.position.set(0, yBack * s, JAW_BACK * s);
    jaw.add(new THREE.Mesh(jawGeo, darkMat));
    g.add(jaw);

    const tailPivot = new THREE.Object3D();
    tailPivot.position.set(0, 0.034 * s, WRIST * s);
    tailPivot.add(new THREE.Mesh(caudalGeo, mat));
    g.add(tailPivot);

    void rng;
    return { group: g, tailPivot, jaw,
             geos: [bodyGeo, headGeo, jawGeo, caudalGeo], mats: [mat, darkMat] };
  }

  /* =============== the animals =============== */

  /* `o`:
       count      how many
       radius     the reef's own radius
       heightAt   the floor
       ceilingAt  the roof, where there is one — a shark in a cave has
                  to obey the same lid the diver does, or it swims out
                  through the rock it just chased you under
       dens       the places worth guarding, in order of how badly they
                  want guarding: `{ x, z, R, mouth:{x,z} }`. The first
                  sharks are given one each and never really leave it.
                  A cave is one of these; so is a sealed hold.
       caves      the old name for the same list, still honoured
       wreck      where the middle tier is, which is where the food is
       onEvent    (kind, shark) — 'notice' | 'charge' | 'strike' | 'fend'
  */
  function build(scene, rng, o = {}) {
    const count = o.count === undefined ? 4 : o.count;
    const R = o.radius || 190;
    const heightAt = o.heightAt || (() => -30);
    const ceilingAt = o.ceilingAt || null;
    const dens = o.dens || o.caves || [];
    const onEvent = o.onEvent || (() => {});

    const sharks = [];
    for (let i = 0; i < count; i++) {
      /* The first sharks live on the dens, because a den is wherever
         the mission's worst decision gets made — the mouth of a cave,
         the hatch of a hold — and those should be guarded by the
         mission's worst news. The rest work the slope and the trench,
         which is where the money is. */
      const den = i < dens.length ? dens[i] : null;
      let hx, hz;
      if (den) { hx = den.mouth.x; hz = den.mouth.z; }
      else {
        for (let tries = 0; tries < 40; tries++) {
          const a = rng() * Math.PI * 2;
          const r = U.lerp(R * 0.34, R * 0.92, Math.sqrt(rng()));
          hx = Math.cos(a) * r; hz = Math.sin(a) * r;
          if (heightAt(hx, hz) < -14) break;
        }
      }
      const size = rng.range(1.5, 2.35) * (den ? 1.15 : 1);
      const built = sharkMesh(rng, size);
      built.group.frustumCulled = false;
      scene.add(built.group);

      const sh = {
        id: i, size, den,
        home: { x: hx, z: hz, r: den ? 34 : 52 },
        pos: new THREE.Vector3(hx, heightAt(hx, hz) + 6, hz),
        fwd: new THREE.Vector3(Math.cos(rng() * 6.28), 0, Math.sin(rng() * 6.28)).normalize(),
        want: new THREE.Vector3(),
        wander: new THREE.Vector3(hx, heightAt(hx, hz) + 6, hz),
        wanderT: rng() * 4,
        state: 'patrol', timer: 0, cool: 0, speed: TUNE.cruise,
        beat: rng() * 6.28, menace: 0,
        mesh: built,
        // what the shoal is told about: a position and a radius
        x: hx, y: 0, z: hz, r: 22,
      };
      sharks.push(sh);
    }

    /* One place decides how far away a shark can tell you are there,
       and it reads three things: how much noise the mission says you
       are making, whether it is looking at you, and whether you are
       both under the same roof — inside a cave there is no such thing
       as far enough away. */
    function notices(sh, d, toDiver, noise, sameCave) {
      if (sameCave) return true;
      if (d < TUNE.sense * noise) return true;
      if (d > TUNE.sight * noise) return false;
      return sh.fwd.dot(toDiver) > TUNE.cone;
    }

    function setState(sh, state) {
      if (sh.state === state) return;
      sh.state = state;
      sh.timer = 0;
      if (state === 'stalk') onEvent('notice', sh);
      if (state === 'charge') onEvent('charge', sh);
    }

    return {
      sharks,
      /* The single number the HUD wants: how much trouble you are in,
         from nought to one. Nothing else needs to know how many
         animals there are or what any of them is doing. */
      menace: 0,
      closest: null,

      /* Something loud happened *here*. The mission calls this when a
         diver starts putting a boot through a hold's hatch, which is
         the one noise in the loch that is not a diver swimming — and
         the answer to it has to be every animal that can hear it
         turning round, not a slow drift in on the noise multiplier.

         It wakes them rather than sending them: a woken shark stalks,
         and stalking is a circle that closes. The diver still gets the
         second and a half they are owed, they just get it while they
         are holding onto a hatch with both hands. */
      alert(x, z, r) {
        const r2 = r * r;
        for (const sh of sharks) {
          if (sh.state === 'charge' || sh.cool > 0) continue;
          const dx = sh.pos.x - x, dz = sh.pos.z - z;
          if (dx * dx + dz * dz > r2) continue;
          if (sh.state !== 'stalk') setState(sh, 'stalk');
        }
      },

      /* `ctx`:
           diver    the diver's position, or null while nobody is in
                    the water — during the countdown, or after the bell
           safe     true when the diver is at the surface, on their
                    feet or otherwise not worth crossing the loch for
           noise    1 is a diver doing nothing; gold and effort raise it
           fend     the diver kicked this frame
           facing   the direction they kicked in
      */
      update(dt, ctx = {}) {
        const step = Math.min(dt, 0.05);
        const diver = ctx.diver || null;
        const safe = !!ctx.safe;
        const noise = U.clamp(ctx.noise === undefined ? 1 : ctx.noise, 0.5, 3.2);
        let worst = 0, worstShark = null;

        for (const sh of sharks) {
          sh.timer += step;
          sh.cool = Math.max(0, sh.cool - step);

          let d = 1e9;
          let sameCave = false;
          if (diver && !safe) {
            _v.subVectors(diver, sh.pos);
            d = _v.length();
            if (d > 1e-4) _v.multiplyScalar(1 / d);
            if (sh.den) {
              const dd = Math.hypot(diver.x - sh.den.x, diver.z - sh.den.z);
              sameCave = dd < sh.den.R;
            }
          }

          /* ---- the kick that turns one away. Checked before anything
             else, because a diver who has just swum at a shark has
             earned the outcome regardless of what it was about to
             do. ---- */
          if (ctx.fend && diver && d < TUNE.fendRange
              && (sh.state === 'stalk' || sh.state === 'charge')) {
            const away = ctx.facing ? ctx.facing.dot(_v) : 1;
            if (away > 0.1) {
              setState(sh, 'veer');
              sh.cool = TUNE.cool;
              onEvent('fend', sh);
            }
          }

          switch (sh.state) {
            case 'patrol': {
              sh.speed = U.damp(sh.speed, TUNE.cruise, 2, step);
              sh.wanderT -= step;
              if (sh.wanderT <= 0) {
                sh.wanderT = 4 + Math.random() * 5;
                const a = Math.random() * Math.PI * 2;
                const r = sh.home.r * (0.35 + Math.random() * 0.65);
                const wx = sh.home.x + Math.cos(a) * r, wz = sh.home.z + Math.sin(a) * r;
                sh.wander.set(wx, heightAt(wx, wz) + 3 + Math.random() * 9, wz);
              }
              sh.want.subVectors(sh.wander, sh.pos);
              if (diver && !safe && sh.cool <= 0 && notices(sh, d, _v, noise, sameCave)) {
                setState(sh, 'stalk');
              }
              break;
            }
            case 'stalk': {
              sh.speed = U.damp(sh.speed, TUNE.stalk, 2.2, step);
              if (!diver || safe || d > TUNE.leash
                  || (!sameCave && !notices(sh, d, _v, noise * 1.35, false))) {
                setState(sh, 'patrol');
                sh.want.subVectors(sh.wander, sh.pos);
                break;
              }
              /* It does not come straight in. It circles, closing, on
                 an offset that crosses your line — which is what gives
                 you the second and a half you need to see it and turn
                 into it. */
              _w.set(-_v.z, 0, _v.x).multiplyScalar(6.5 * (sh.id % 2 ? 1 : -1));
              sh.want.copy(diver).add(_w).sub(sh.pos);
              if (sh.timer > TUNE.commit && d < TUNE.sight * 0.8) setState(sh, 'charge');
              break;
            }
            case 'charge': {
              sh.speed = U.damp(sh.speed, TUNE.charge, 3.4, step);
              if (!diver || safe) { setState(sh, 'veer'); break; }
              // it swims at where you will be, not at where you are
              sh.want.copy(diver).sub(sh.pos);
              if (d < TUNE.strikeAt + sh.size * 0.5 && sh.cool <= 0) {
                sh.cool = TUNE.cool;
                onEvent('strike', sh);
                setState(sh, 'veer');
              } else if (sh.timer > TUNE.missAfter) {
                setState(sh, 'veer');
              }
              break;
            }
            default: {                    // veer
              sh.speed = U.damp(sh.speed, TUNE.stalk * 0.85, 2, step);
              if (diver) sh.want.copy(sh.pos).sub(diver);
              else sh.want.subVectors(sh.wander, sh.pos);
              sh.want.y += 2;
              if (sh.timer > TUNE.veer) setState(sh, 'patrol');
              break;
            }
          }

          /* ---- steering. A heading that turns towards a want at a
             fixed rate, rather than a velocity that is set: an animal
             that can change direction instantly is a cursor. ---- */
          if (sh.want.lengthSq() < 1e-6) sh.want.copy(sh.fwd);
          sh.want.normalize();
          const turn = (sh.state === 'charge' ? TUNE.turnCharge
                      : sh.state === 'stalk' ? TUNE.turnStalk : TUNE.turn) * step;
          sh.fwd.addScaledVector(sh.want, turn * 2.2).normalize();

          sh.pos.addScaledVector(sh.fwd, sh.speed * step);

          /* ---- and the two lids. The sand, and — inside a cave — the
             same roof that has the diver trapped. A shark that can
             leave through the ceiling makes the cave's whole risk a
             lie. ---- */
          const floor = heightAt(sh.pos.x, sh.pos.z) + TUNE.floorGap + sh.size * 0.4;
          if (sh.pos.y < floor) { sh.pos.y = floor; sh.fwd.y = Math.abs(sh.fwd.y) * 0.5; }
          let lid = -TUNE.minDepth;
          if (ceilingAt) {
            const roof = ceilingAt(sh.pos.x, sh.pos.z);
            if (roof < 1e8) lid = Math.min(lid, roof - 1.1 - sh.size * 0.4);
          }
          if (sh.pos.y > lid) { sh.pos.y = lid; sh.fwd.y = -Math.abs(sh.fwd.y) * 0.5; }
          // and the edge of the world, which turns them rather than walls them
          const rr = Math.hypot(sh.pos.x, sh.pos.z);
          if (rr > R * 1.02) {
            sh.fwd.x -= (sh.pos.x / rr) * step * 2.4;
            sh.fwd.z -= (sh.pos.z / rr) * step * 2.4;
            sh.fwd.normalize();
          }

          /* ---- the body follows the heading, and the tail beats.

             The order matters and it used to be wrong. `lookAt` writes
             a quaternion; adding to `rotation.z` afterwards edits the
             Euler decomposition of that quaternion, which is a roll
             about the *world* z axis rather than about the animal —
             fine while it is swimming flat and a visible wobble the
             moment it is nose-down into a cave, which is exactly when
             anybody is looking at one. `rotateZ` is a local turn, so it
             is a roll however the thing is pointing.

             The sway is the tail's beat carried forward through the
             body at a lag: the caudal sweeps, the animal rolls into the
             sweep a beat later, and the head yaws a little against it.
             Three sine waves out of one phase, and it is most of the
             difference between an animal and an arrow. ---- */
          const g = sh.mesh.group;
          g.position.copy(sh.pos);
          _look.copy(sh.pos).add(sh.fwd);
          g.up.copy(_up);
          g.lookAt(_look);
          sh.beat += step * (2.4 + sh.speed * 0.85);
          const sweep = 0.34 + 0.30 * U.clamp(sh.speed / TUNE.charge, 0, 1);
          sh.mesh.tailPivot.rotation.y = Math.sin(sh.beat) * sweep;
          g.rotateY(Math.sin(sh.beat - 1.1) * 0.055);
          g.rotateZ(Math.sin(sh.beat - 0.55) * 0.085);
          /* The jaw. A hinge, opening as it commits and shutting the
             instant it has, so the warning is a shape you see coming
             rather than a thing you notice on the replay. */
          sh.mesh.jaw.rotation.x = U.damp(sh.mesh.jaw.rotation.x,
            sh.state === 'charge' ? 0.62 : 0, 7, step);

          // ---- what everybody else reads off it
          sh.x = sh.pos.x; sh.y = sh.pos.y; sh.z = sh.pos.z;
          sh.r = sh.state === 'charge' ? 30 : 20;
          const near = diver ? U.clamp(1 - d / 42, 0, 1) : 0;
          sh.menace = sh.state === 'charge' ? 0.55 + near * 0.45
                    : sh.state === 'stalk' ? near * 0.6
                    : 0;
          if (sh.menace > worst) { worst = sh.menace; worstShark = sh; }
        }

        this.menace = worst;
        this.closest = worstShark;
      },

      dispose() {
        for (const sh of sharks) {
          Engine.disposeObject(sh.mesh.group);
          for (const g of sh.mesh.geos) g.dispose();
          for (const m of sh.mesh.mats) m.dispose();
        }
        sharks.length = 0;
      },
    };
  }

  return { build, sharkMesh, TUNE };
})();

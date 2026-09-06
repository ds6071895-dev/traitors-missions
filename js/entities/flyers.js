/* ------------------------------------------------------------------
   flyers.js — everything that flies, and how it flies.

   A flyer is a type (what it looks like, what it is worth, how big a
   sphere an arrow has to find) plus a behaviour (what it does with the
   air). Keeping those apart is what lets a round say "ravens, but
   diving" or "lanterns, but in a gale" without a new creature.

   Nothing here knows about scoring, rounds or money. It reports that it
   was hit and it falls out of the sky; the mission decides what that
   was worth.
------------------------------------------------------------------ */
const FlyerKit = (() => {

  const lam = (c, opts) => new THREE.MeshLambertMaterial(
    Object.assign({ color: c, flatShading: true }, opts || {}));

  /* =============== bodies =============== */

  // A bird: body, head, beak, tail and two wings on pivots. The wings are
  // the only moving part, and they are most of what makes it read as alive.
  function birdMesh(o) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(o.size, 0), lam(o.body));
    body.scale.set(1, 0.82, 1.7);
    g.add(body);

    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(o.size * 0.55, 0), lam(o.body));
    head.position.set(0, o.size * 0.42, -o.size * 1.5);
    g.add(head);

    const beak = new THREE.Mesh(new THREE.ConeGeometry(o.size * 0.2, o.size * 0.7, 4), lam(o.beak));
    beak.rotation.x = -Math.PI / 2;
    beak.position.set(0, o.size * 0.34, -o.size * 2.1);
    g.add(beak);

    const tail = new THREE.Mesh(new THREE.ConeGeometry(o.size * 0.5, o.size * 1.5, 4), lam(o.body));
    tail.rotation.x = Math.PI / 2;
    tail.scale.set(1, 1, 0.25);
    tail.position.set(0, 0, o.size * 2.1);
    g.add(tail);

    const wings = [];
    for (const s of [1, -1]) {
      const pivot = new THREE.Object3D();
      pivot.position.set(s * o.size * 0.5, o.size * 0.2, 0);
      const wing = new THREE.Mesh(new THREE.BoxGeometry(o.size * 2.6, o.size * 0.12, o.size * 1.5),
                                  lam(o.wing || o.body));
      wing.position.x = s * o.size * 1.3;
      // a kink at the wrist, so a wing is not a plank
      const tip = new THREE.Mesh(new THREE.BoxGeometry(o.size * 1.5, o.size * 0.1, o.size * 0.9),
                                 lam(o.wing || o.body));
      tip.position.set(s * o.size * 3.0, 0, o.size * 0.25);
      tip.rotation.z = -s * 0.22;
      pivot.add(wing, tip);
      g.add(pivot);
      wings.push({ pivot, side: s });
    }
    g.userData.wings = wings;
    return g;
  }

  function lanternMesh(o) {
    const g = new THREE.Group();
    const paper = new THREE.Mesh(new THREE.CylinderGeometry(o.size, o.size * 0.78, o.size * 1.9, 7),
                                 lam(o.body, { emissive: o.glow, emissiveIntensity: 0.9 }));
    g.add(paper);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(o.size * 0.55, o.size * 0.85, o.size * 0.35, 7),
                               lam('#6b4a2c'));
    cap.position.y = o.size * 1.1;
    g.add(cap);
    const flame = new THREE.Mesh(new THREE.IcosahedronGeometry(o.size * 0.42, 0),
                                 new THREE.MeshBasicMaterial({ color: o.glow }));
    flame.position.y = -o.size * 0.3;
    g.add(flame);
    g.userData.flame = flame;
    return g;
  }

  function clayMesh(o) {
    const g = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(o.size, o.size * 0.75, o.size * 0.34, 9),
                                lam(o.body));
    g.add(disc);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(o.size * 0.95, o.size * 0.1, 4, 9), lam(o.rim));
    rim.rotation.x = Math.PI / 2;
    g.add(rim);
    return g;
  }

  function batMesh(o) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(o.size, 0), lam(o.body));
    body.scale.set(0.8, 1, 1.3);
    g.add(body);
    const ears = new THREE.Mesh(new THREE.ConeGeometry(o.size * 0.3, o.size * 0.8, 3), lam(o.body));
    ears.position.set(0, o.size * 0.9, -o.size * 0.4);
    g.add(ears);
    const wings = [];
    for (const s of [1, -1]) {
      const pivot = new THREE.Object3D();
      const shape = new THREE.Mesh(new THREE.BoxGeometry(o.size * 3.2, o.size * 0.08, o.size * 1.8),
                                   lam(o.wing));
      shape.position.x = s * o.size * 1.6;
      pivot.add(shape);
      g.add(pivot);
      wings.push({ pivot, side: s });
    }
    g.userData.wings = wings;
    return g;
  }

  function waspMesh(o) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const seg = new THREE.Mesh(new THREE.IcosahedronGeometry(o.size * (1 - i * 0.15), 0),
                                 lam(i % 2 ? '#1b1b1f' : o.body));
      seg.position.z = i * o.size * 0.9;
      g.add(seg);
    }
    const wings = [];
    for (const s of [1, -1]) {
      const pivot = new THREE.Object3D();
      const w = new THREE.Mesh(new THREE.BoxGeometry(o.size * 1.9, o.size * 0.05, o.size * 0.7),
                               new THREE.MeshBasicMaterial({ color: '#dff3ff', transparent: true, opacity: 0.5 }));
      w.position.x = s * o.size;
      pivot.add(w);
      g.add(pivot);
      wings.push({ pivot, side: s });
    }
    g.userData.wings = wings;
    return g;
  }

  function mothMesh(o) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(o.size * 0.7, 0),
                                new THREE.MeshBasicMaterial({ color: o.glow }));
    g.add(body);
    const wings = [];
    for (const s of [1, -1]) {
      const pivot = new THREE.Object3D();
      const w = new THREE.Mesh(new THREE.BoxGeometry(o.size * 1.8, o.size * 0.06, o.size * 1.2),
                               lam(o.body, { emissive: o.glow, emissiveIntensity: 0.7 }));
      w.position.x = s * o.size * 0.9;
      pivot.add(w);
      g.add(pivot);
      wings.push({ pivot, side: s });
    }
    g.userData.wings = wings;
    g.userData.flame = body;
    return g;
  }

  function scrollMesh(o) {
    const g = new THREE.Group();
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(o.size * 0.5, o.size * 0.5, o.size * 1.6, 7),
                                lam('#efe3c4'));
    roll.rotation.z = Math.PI / 2;
    g.add(roll);
    const ribbon = new THREE.Mesh(new THREE.TorusGeometry(o.size * 0.55, o.size * 0.12, 4, 8),
                                  lam('#e5133f'));
    ribbon.rotation.y = Math.PI / 2;
    g.add(ribbon);
    return g;
  }

  /* ---------------- a charm ----------------

     The owl fight drops these, and they have one job: to be obviously
     not quarry and obviously worth an arrow, from any distance and
     against a wood full of birds. So a charm is a lit core inside two
     rings turning against each other, in a colour nothing else in the
     wood uses, with a light of its own — and it climbs, so a charm you
     ignore is a charm that leaves. */
  function boonMesh(o) {
    const g = new THREE.Group();
    const S = o.size || 1;
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(S * 0.46, 0),
                                new THREE.MeshBasicMaterial({ color: o.glow }));
    g.add(core);
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(S * 0.72, 0),
                                 lam(o.color, { emissive: o.color, emissiveIntensity: 0.7,
                                                transparent: true, opacity: 0.5 }));
    g.add(shell);
    // TorusGeometry begins in the XY plane. Rotate one ring into XZ and
    // the other into YZ so the charm reads as a cage from every angle.
    for (const ax of ['x', 'y']) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(S * 1.0, S * 0.08, 4, 12),
                                  lam(o.color, { emissive: o.color, emissiveIntensity: 0.9 }));
      ring.rotation[ax] = Math.PI / 2;
      g.add(ring);
    }
    const light = new THREE.PointLight(o.glow, 2.2, 24, 2);
    g.add(light);
    g.userData.flame = core;          // the flyer already pulses this for us
    return g;
  }

  /* A four-legged animal: body, neck, head, four legs on pivots and a
     tail. The legs are the whole trick — a deer that slides across the
     grass reads as a bug, and four swinging boxes read as a deer. */
  function quadMesh(o) {
    const g = new THREE.Group();
    const S = o.size;
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(S, 0), lam(o.body));
    body.scale.set(0.9, 0.95, 1.9);
    body.position.y = S * (o.legLen || 1.1);
    g.add(body);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.3, S * 0.4, S * (o.neck ?? 1.1), 5),
                                lam(o.body));
    neck.position.set(0, S * ((o.legLen || 1.1) + (o.neck ?? 1.1) * 0.42), -S * 1.5);
    neck.rotation.x = -0.45;
    g.add(neck);

    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(S * 0.52, 0), lam(o.body));
    head.scale.set(0.85, 0.85, 1.25);
    head.position.set(0, S * ((o.legLen || 1.1) + (o.neck ?? 1.1) * 0.85), -S * 1.95);
    g.add(head);
    if (o.snout) {
      const snout = new THREE.Mesh(new THREE.ConeGeometry(S * 0.24, S * 0.6, 4), lam(o.snoutCol || o.body));
      snout.rotation.x = -Math.PI / 2;
      snout.position.copy(head.position).add(new THREE.Vector3(0, -S * 0.1, -S * 0.55));
      g.add(snout);
    }
    for (const s of [1, -1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(S * 0.16, S * (o.ear || 0.5), 4), lam(o.body));
      ear.position.copy(head.position).add(new THREE.Vector3(s * S * 0.3, S * 0.45, 0));
      ear.rotation.z = s * 0.35;
      g.add(ear);
    }
    if (o.antlers) {
      for (const s of [1, -1]) {
        for (let i = 0; i < 3; i++) {
          const tine = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.05, S * 0.07, S * (0.7 - i * 0.14), 4),
                                      lam('#c8b48a'));
          tine.position.copy(head.position)
            .add(new THREE.Vector3(s * S * (0.22 + i * 0.16), S * (0.75 + i * 0.12), S * i * 0.16));
          tine.rotation.z = s * (0.3 + i * 0.2);
          g.add(tine);
        }
      }
    }
    const tail = new THREE.Mesh(new THREE.ConeGeometry(S * 0.22, S * (o.tail || 0.7), 4),
                                lam(o.tailCol || o.body));
    tail.rotation.x = 2.4;
    tail.position.set(0, S * ((o.legLen || 1.1) + 0.35), S * 1.7);
    g.add(tail);

    const legs = [];
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        const pivot = new THREE.Object3D();
        pivot.position.set(sx * S * 0.55, S * (o.legLen || 1.1), sz * S * 0.95);
        const leg = new THREE.Mesh(
          new THREE.CylinderGeometry(S * 0.13, S * 0.1, S * (o.legLen || 1.1), 4), lam(o.legCol || o.body));
        leg.position.y = -S * (o.legLen || 1.1) * 0.5;
        pivot.add(leg);
        g.add(pivot);
        legs.push({ pivot, phase: (sx * sz > 0 ? 0 : Math.PI) });
      }
    }
    g.userData.legs = legs;
    return g;
  }

  // a bottle on a stump: the oldest target in the world
  function bottleMesh(o) {
    const g = new THREE.Group();
    const S = o.size;
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.85, S * 1.0, S * 1.5, 7), lam('#5a4130'));
    stump.position.y = -S * 1.5;
    g.add(stump);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.5, S * 0.55, S * 1.3, 7),
                                lam(o.body, { transparent: true, opacity: 0.85 }));
    body.position.y = -S * 0.1;      // sitting on the stump, not hovering over it
    g.add(body);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.18, S * 0.3, S * 0.7, 6),
                                lam(o.body, { transparent: true, opacity: 0.85 }));
    neck.position.y = S;
    g.add(neck);
    return g;
  }

  // a bell hung from a branch, which swings and rings
  function bellMesh(o) {
    const g = new THREE.Group();
    const S = o.size;
    // a gallows frame, so the bell hangs off something instead of hanging
    // in the air off nothing
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.06, S * 0.06, S * 1.4, 4), lam('#6b5a3c'));
    rope.position.y = S * 1.1;
    g.add(rope);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.12, S * 0.12, S * 2.2, 5), lam('#5a4130'));
    arm.rotation.z = Math.PI / 2;
    arm.position.set(-S * 1.0, S * 1.8, 0);
    g.add(arm);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.17, S * 0.22, S * 5.4, 6), lam('#5a4130'));
    post.position.set(-S * 2.0, -S * 0.9, 0);
    g.add(post);
    const brace = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.09, S * 0.09, S * 1.3, 4), lam('#5a4130'));
    brace.rotation.z = -0.78;
    brace.position.set(-S * 1.55, S * 1.35, 0);
    g.add(brace);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.35, S * 0.9, S * 1.2, 8), lam(o.body));
    g.add(bell);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(S * 0.88, S * 0.12, 4, 10), lam(o.rim || o.body));
    lip.rotation.x = Math.PI / 2;
    lip.position.y = -S * 0.55;
    g.add(lip);
    return g;
  }

  /* ---------------- the Great Owl ----------------

     The boss gets built properly, because it is the only thing in the
     wood you look at for a whole minute: a layered ruff, a facial disc
     with two lit eyes, fingered wingtips, a fanned tail, and a heavy
     iron lantern gripped in its talons.

     The four things that can actually be hurt are parts of the bird —
     lantern, eyes, talons, then chest — rather than markers hung off it,
     and each one is only open during its own phase of the fight.
     `userData.weak` is how the mission finds them. */
  function owlMesh(o) {
    const g = new THREE.Group();
    const S = o.size;
    const dark = lam(o.wing), plume = lam(o.body);
    const pale = lam('#e6d7b4'), horn = lam('#f2c14e');

    // ---- body: a barrel with three layers of feather over it ----
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(S, 1), plume);
    body.scale.set(1.0, 1.15, 1.2);
    g.add(body);
    for (let i = 0; i < 3; i++) {
      const ruff = new THREE.Mesh(
        new THREE.ConeGeometry(S * (1.02 - i * 0.13), S * 0.5, 9, 1, true),
        i % 2 ? dark : plume);
      ruff.position.y = S * (-0.55 + i * 0.5);
      ruff.rotation.y = i * 0.35;
      g.add(ruff);
    }

    // the pale chest plate — the last thing you have to hit
    const chest = new THREE.Mesh(new THREE.IcosahedronGeometry(S * 0.62, 1), pale);
    chest.scale.set(1.1, 1.25, 0.55);
    chest.position.set(0, -S * 0.1, -S * 0.92);
    g.add(chest);

    // ---- head: facial disc, eyes, beak, ear tufts ----
    const head = new THREE.Group();
    head.position.set(0, S * 0.92, -S * 0.5);
    g.add(head);

    const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(S * 0.72, 1), plume);
    skull.scale.set(1.05, 0.95, 0.95);
    head.add(skull);

    const eyes = [];
    for (const side of [1, -1]) {
      // the disc of feathers each eye sits in
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.4, S * 0.34, S * 0.14, 10), pale);
      disc.rotation.x = Math.PI / 2;
      disc.position.set(side * S * 0.3, S * 0.06, -S * 0.62);
      head.add(disc);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(S * 0.22, 10, 8),
                                 new THREE.MeshBasicMaterial({ color: '#ffb02e' }));
      eye.position.set(side * S * 0.3, S * 0.06, -S * 0.70);
      head.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(S * 0.10, 8, 6),
                                   new THREE.MeshBasicMaterial({ color: '#120c04' }));
      pupil.position.set(side * S * 0.3, S * 0.06, -S * 0.82);
      head.add(pupil);
      eyes.push(eye);
    }
    const beak = new THREE.Mesh(new THREE.ConeGeometry(S * 0.17, S * 0.55, 4), horn);
    beak.rotation.x = -Math.PI / 2;
    beak.position.set(0, -S * 0.18, -S * 0.82);
    head.add(beak);
    for (const side of [1, -1]) {
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(S * 0.17, S * 0.85, 4), dark);
      tuft.position.set(side * S * 0.42, S * 0.72, -S * 0.1);
      tuft.rotation.z = side * 0.42;
      tuft.rotation.x = -0.25;
      head.add(tuft);
    }

    // ---- wings: arm, forearm, and four fingered primaries ----
    const wings = [];
    for (const side of [1, -1]) {
      const pivot = new THREE.Object3D();
      pivot.position.set(side * S * 0.75, S * 0.35, 0);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(S * 2.4, S * 0.34, S * 2.5), dark);
      arm.position.x = side * S * 1.2;
      pivot.add(arm);
      const fore = new THREE.Object3D();
      fore.position.x = side * S * 2.4;
      pivot.add(fore);
      const outer = new THREE.Mesh(new THREE.BoxGeometry(S * 2.2, S * 0.26, S * 1.9), dark);
      outer.position.set(side * S * 1.1, 0, S * 0.2);
      fore.add(outer);
      for (let i = 0; i < 4; i++) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(S * 1.5, S * 0.14, S * 0.34), dark);
        f.position.set(side * S * 2.9, 0, S * (0.75 - i * 0.42));
        f.rotation.y = side * (0.2 - i * 0.16);
        fore.add(f);
      }
      g.add(pivot);
      wings.push({ pivot, side, fore });
    }

    // ---- tail fan ----
    const tail = new THREE.Group();
    tail.position.set(0, -S * 0.1, S * 1.1);
    for (let i = -2; i <= 2; i++) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(S * 0.34, S * 0.12, S * 1.9), dark);
      f.position.set(i * S * 0.3, 0, S * 0.85);
      f.rotation.y = i * 0.13;
      tail.add(f);
    }
    g.add(tail);

    // ---- legs, talons, and the lantern they are carrying ----
    const talons = new THREE.Group();
    talons.position.set(0, -S * 1.05, -S * 0.2);
    for (const side of [1, -1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.13, S * 0.16, S * 0.6, 5), plume);
      leg.position.set(side * S * 0.35, S * 0.1, 0);
      talons.add(leg);
      for (let i = 0; i < 3; i++) {
        const claw = new THREE.Mesh(new THREE.ConeGeometry(S * 0.07, S * 0.42, 4), horn);
        const a = -0.6 + i * 0.6;
        claw.position.set(side * S * 0.35 + Math.sin(a) * S * 0.18, -S * 0.28, Math.cos(a) * S * 0.18);
        claw.rotation.x = Math.PI - 0.5;
        claw.rotation.z = Math.sin(a) * 0.5;
        talons.add(claw);
      }
    }
    g.add(talons);

    const lantern = new THREE.Group();
    lantern.position.set(0, -S * 1.85, -S * 0.2);
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(S * 0.22, S * 0.05, 4, 9), lam('#3b3f4a'));
    hoop.position.y = S * 0.55;
    lantern.add(hoop);
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.42, S * 0.5, S * 0.9, 6),
                                lam('#ffdf9b', { emissive: '#ff8a3c', emissiveIntensity: 1.1 }));
    lantern.add(cage);
    for (const yy of [0.48, -0.48]) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.3, S * 0.55, S * 0.2, 6), lam('#3b3f4a'));
      cap.position.y = S * yy;
      lantern.add(cap);
    }
    const flame = new THREE.Mesh(new THREE.IcosahedronGeometry(S * 0.24, 0),
                                 new THREE.MeshBasicMaterial({ color: '#ffd166' }));
    lantern.add(flame);
    const glow = new THREE.PointLight('#ff9c42', 3.0, 34, 2);
    lantern.add(glow);
    g.add(lantern);

    g.userData.wings = wings;
    g.userData.flame = flame;
    g.userData.head = head;
    // the four things that can be hurt, in the order the fight opens them
    g.userData.talons = talons;
    g.userData.weak = {
      lantern: { obj: lantern, radius: S * 0.9, label: 'THE LANTERN' },
      eyes: { obj: head, radius: S * 0.85, label: 'THE EYES', lights: eyes },
      talons: { obj: talons, radius: S * 0.8, label: 'THE TALONS' },
      chest: { obj: chest, radius: S * 1.0, label: 'THE HEART' },
    };
    return g;
  }

  /* =============== the roster =============== */

  const TYPES = {
    raven: {
      id: 'raven', name: 'Raven', points: 100, hp: 1, radius: 2.1, size: 0.9,
      speed: [15, 21], flap: 7.5, wingAmp: 0.75,
      mesh: () => birdMesh({ size: 0.9, body: '#20232c', wing: '#14161d', beak: '#f2c14e' }),
      death: 'feathers', deathColor: '#2a2d38',
    },
    dove: {
      id: 'dove', name: 'Dove', points: 0, hp: 1, radius: 1.35, size: 0.9,
      speed: [12, 17], flap: 6.5, wingAmp: 0.8, guard: true,
      mesh: () => birdMesh({ size: 0.9, body: '#f6f7fb', wing: '#e2e8f2', beak: '#f2a04e' }),
      death: 'feathers', deathColor: '#ffffff',
    },
    lantern: {
      id: 'lantern', name: 'Lantern', points: 150, hp: 1, radius: 2.4, size: 1.35,
      speed: [2.5, 4.5], flap: 0,
      mesh: () => lanternMesh({ size: 1.35, body: '#ffdf9b', glow: '#ff8a3c' }),
      death: 'embers', deathColor: '#ff9c42',
    },
    clay: {
      id: 'clay', name: 'Clay', points: 220, hp: 1, radius: 2.0, size: 1.15,
      speed: [24, 32], flap: 0, spin: 9,
      mesh: () => clayMesh({ size: 1.15, body: '#e5133f', rim: '#2b2f3a' }),
      death: 'shards', deathColor: '#e5133f',
    },
    bat: {
      id: 'bat', name: 'Bat', points: 260, hp: 1, radius: 1.7, size: 0.72,
      speed: [15, 20], flap: 13, wingAmp: 1.05,
      mesh: () => batMesh({ size: 0.72, body: '#3a2b3f', wing: '#5a3d55' }),
      death: 'feathers', deathColor: '#5a3d55',
    },
    moth: {
      id: 'moth', name: 'Moth', points: 320, hp: 1, radius: 1.5, size: 0.65,
      speed: [6, 9], flap: 15, wingAmp: 0.9, glowing: true,
      mesh: () => mothMesh({ size: 0.65, body: '#cbb7ff', glow: '#9ce7ff' }),
      death: 'embers', deathColor: '#9ce7ff',
    },
    goose: {
      id: 'goose', name: 'Goose', points: 140, hp: 1, radius: 2.6, size: 1.25,
      speed: [17, 22], flap: 5, wingAmp: 0.65,
      mesh: () => birdMesh({ size: 1.25, body: '#6d6250', wing: '#4a4235', beak: '#1b1b1f' }),
      death: 'feathers', deathColor: '#7a6f5a',
    },
    wasp: {
      id: 'wasp', name: 'Wasp', points: 110, hp: 1, radius: 1.5, size: 0.6,
      speed: [11, 15], flap: 30, wingAmp: 0.5, stings: true,
      mesh: () => waspMesh({ size: 0.6, body: '#f2c14e' }),
      death: 'shards', deathColor: '#f2c14e',
    },
    gilded: {
      id: 'gilded', name: 'Gilded Raven', points: 1400, hp: 1, radius: 1.9, size: 0.9,
      speed: [20, 26], flap: 11, wingAmp: 0.85, glowing: true,
      mesh: () => birdMesh({ size: 0.9, body: '#ffd166', wing: '#e0a12a', beak: '#fff3cf' }),
      death: 'gold', deathColor: '#ffd166',
    },
    messenger: {
      id: 'messenger', name: 'Messenger', points: 280, hp: 1, radius: 2.0, size: 0.85,
      speed: [18, 23], flap: 9, wingAmp: 0.8, drops: 'scroll',
      mesh: () => birdMesh({ size: 0.85, body: '#8a94a6', wing: '#6b7484', beak: '#f2c14e' }),
      death: 'feathers', deathColor: '#8a94a6',
    },
    scroll: {
      id: 'scroll', name: 'Scroll', points: 500, hp: 1, radius: 1.8, size: 0.85,
      speed: [0, 0], flap: 0,
      mesh: () => scrollMesh({ size: 0.85 }),
      death: 'gold', deathColor: '#efe3c4',
    },
    /* ---- the wood's own residents: these are not sent by a round,
       they live here, and there is always something worth a shot ---- */
    deer: {
      id: 'deer', name: 'Deer', points: 300, hp: 1, radius: 2.6, size: 1.0,
      speed: [4, 7], ground: true, ride: 0, flee: 26,
      mesh: () => quadMesh({ size: 1.0, body: '#a9784a', legCol: '#7c5432', tailCol: '#efe3c4',
                             antlers: true, snout: true, ear: 0.6 }),
      death: 'feathers', deathColor: '#a9784a',
    },
    fox: {
      id: 'fox', name: 'Fox', points: 380, hp: 1, radius: 1.9, size: 0.62,
      speed: [7, 11], ground: true, ride: 0, flee: 20,
      mesh: () => quadMesh({ size: 0.62, body: '#d2662a', legCol: '#3a2a22', tailCol: '#f0e6dc',
                             snout: true, snoutCol: '#2b2320', tail: 1.5, neck: 0.7, legLen: 0.85 }),
      death: 'feathers', deathColor: '#d2662a',
    },
    rabbit: {
      id: 'rabbit', name: 'Rabbit', points: 260, hp: 1, radius: 1.5, size: 0.38,
      speed: [6, 10], ground: true, ride: 0, flee: 15, hop: true,
      mesh: () => quadMesh({ size: 0.38, body: '#a89984', legCol: '#8d7f6c', tailCol: '#ffffff',
                             ear: 1.5, neck: 0.4, legLen: 0.7, tail: 0.4 }),
      death: 'feathers', deathColor: '#a89984',
    },
    boar: {
      id: 'boar', name: 'Boar', points: 420, hp: 2, radius: 2.4, size: 0.85,
      speed: [8, 12], ground: true, ride: 0, charges: true,
      mesh: () => quadMesh({ size: 0.85, body: '#4a3d3a', legCol: '#2b2320', snout: true,
                             snoutCol: '#6b5a52', neck: 0.5, legLen: 0.8, tail: 0.5 }),
      death: 'feathers', deathColor: '#4a3d3a',
    },
    pheasant: {
      id: 'pheasant', name: 'Pheasant', points: 340, hp: 1, radius: 2.0, size: 0.7,
      speed: [5, 8], flap: 9, wingAmp: 0.9, ground: true, ride: 0, flush: 22,
      mesh: () => birdMesh({ size: 0.7, body: '#b8452b', wing: '#7a5230', beak: '#f2c14e' }),
      death: 'feathers', deathColor: '#b8452b',
    },
    bottle: {
      id: 'bottle', name: 'Bottle', points: 200, hp: 1, radius: 1.3, size: 0.55,
      speed: [0, 0], prop: true, sit: 1.24,
      mesh: () => bottleMesh({ size: 0.55, body: '#3f8f6a' }),
      death: 'shards', deathColor: '#7fd6a8',
    },
    bell: {
      id: 'bell', name: 'Bell', points: 240, hp: 1, radius: 1.6, size: 0.7,
      speed: [0, 0], prop: true, swings: true, sit: 2.52, foot: 1.4,
      mesh: () => bellMesh({ size: 0.7, body: '#c9a227', rim: '#8a6c12' }),
      death: 'gold', deathColor: '#ffd166',
    },
    /* ---- the four charms the owl fight puts in the air ----
       They are worth nothing at all in money, and everything in the
       eight seconds after you hit one. */
    charmEmber: {
      id: 'charmEmber', name: 'Ember Charm', points: 0, hp: 1, radius: 2.1, size: 1.0,
      speed: [1.8, 2.6], flap: 0, spin: 2.4, glowing: true,
      boon: 'ember', boonName: 'EMBER ARROWS', boonBlurb: 'every arrow pierces and bites twice',
      mesh: () => boonMesh({ size: 1.0, color: '#ff7a2f', glow: '#ffd166' }),
      death: 'embers', deathColor: '#ff9c42',
    },
    charmBreath: {
      id: 'charmBreath', name: 'Hawk Charm', points: 0, hp: 1, radius: 2.1, size: 1.0,
      speed: [1.8, 2.6], flap: 0, spin: 2.4, glowing: true,
      boon: 'breath', boonName: "HAWK'S BREATH", boonBlurb: 'hold your breath as long as you like',
      mesh: () => boonMesh({ size: 1.0, color: '#39e6ff', glow: '#d8fbff' }),
      death: 'embers', deathColor: '#39e6ff',
    },
    charmNerve: {
      id: 'charmNerve', name: 'Nerve Charm', points: 0, hp: 1, radius: 2.1, size: 1.0,
      speed: [1.8, 2.6], flap: 0, spin: 2.4, glowing: true,
      boon: 'nerve', boonName: 'IRON NERVE', boonBlurb: 'the clean window opens twice as wide',
      mesh: () => boonMesh({ size: 1.0, color: '#3ddc84', glow: '#ccffe4' }),
      death: 'embers', deathColor: '#3ddc84',
    },
    charmPurse: {
      id: 'charmPurse', name: 'Purse Charm', points: 0, hp: 1, radius: 2.1, size: 1.0,
      speed: [1.8, 2.6], flap: 0, spin: 2.4, glowing: true,
      boon: 'purse', boonName: 'GOLDEN HOUR', boonBlurb: 'everything pays double',
      mesh: () => boonMesh({ size: 1.0, color: '#ffd166', glow: '#fff3cf' }),
      death: 'gold', deathColor: '#ffd166',
    },

    owl: {
      id: 'owl', name: 'The Great Owl', points: 900, hp: 99, radius: 5.6, size: 2.6,
      speed: [13, 18], flap: 2.4, wingAmp: 0.62, boss: true,
      // it is eight metres across the wings: it needs its own headroom
      // over the ground, and a short lead so it never becomes scenery
      floor: 9, leash: 88, ceiling: 54,
      mesh: () => owlMesh({ size: 2.6, body: '#6b543a', wing: '#3f3122' }),
      death: 'feathers', deathColor: '#6b543a',
    },
  };


  /* The dove has to be readable as a dove from further away than you can
     see that it is white, because the whole point of it is that you have
     to decide before you loose. So it carries a sign. */
  let _markTex = null;
  function markTexture() {
    if (_markTex) return _markTex;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    x.clearRect(0, 0, 128, 128);
    x.strokeStyle = '#ff2a55';
    x.lineWidth = 13;
    x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = 8;
    x.beginPath(); x.arc(64, 64, 46, 0, 6.28); x.stroke();
    x.beginPath(); x.moveTo(32, 32); x.lineTo(96, 96); x.stroke();
    _markTex = new THREE.CanvasTexture(c);
    return _markTex;
  }
  function guardMark() {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({
      map: markTexture(), color: '#ffffff', transparent: true,
      depthTest: false, depthWrite: false, sizeAttenuation: false,
    }));
    m.renderOrder = 8;
    m.scale.set(0.055, 0.055, 1);      // a constant size on screen
    return m;
  }

  /* =============== behaviours ===============
     Each one is (flyer, dt, ctx) and does nothing but steer. */

  /* Wherever the fight sends it, the owl stays a thing in your sky.
     Every boss behaviour finishes here: a ring it is steered back inside
     and a ceiling it is held under, both measured from *you*. Without
     this a dive that goes long, or a pull-out that keeps climbing, ends
     with the boss a dot over the treeline — or past the world bounds
     entirely, which reads as it simply vanishing. */
  function bossKeep(f, dt, ctx) {
    const leash = f.leash ?? f.type.leash ?? 88;
    const dx = f.pos.x - ctx.player.x, dz = f.pos.z - ctx.player.z;
    const r = Math.hypot(dx, dz) || 1e-3;
    if (r > leash) {
      // the further out it is the harder it turns, so coming back reads
      // as a wingover rather than a handbrake
      const k = U.clamp((r - leash) / 26, 0, 1);
      const pull = f.speed * 2.0;
      const a = 1 - Math.exp(-3.2 * k * dt);
      f.vel.x += (-dx / r * pull - f.vel.x) * a;
      f.vel.z += (-dz / r * pull - f.vel.z) * a;
      f.head = Math.atan2(f.vel.x, f.vel.z);
      // and a hard stop far outside it, so nothing can ever outrun it
      const hard = leash * 1.6;
      if (r > hard) {
        f.pos.x = ctx.player.x + dx / r * hard;
        f.pos.z = ctx.player.z + dz / r * hard;
      }
    }
    const ceil = ctx.player.y + (f.ceiling ?? f.type.ceiling ?? 54);
    if (f.pos.y > ceil) { f.pos.y = ceil; if (f.vel.y > 0) f.vel.y *= -0.25; }
  }

  const BEHAVIOURS = {
    // a straight line with a bob and a lazy curve — the bread and butter
    cruise(f, dt) {
      f.head += f.curve * dt;
      const sp = f.speed;
      f.vel.set(Math.sin(f.head) * sp, Math.cos(f.bobT) * f.bob * 2.2, Math.cos(f.head) * sp);
      f.bobT += dt * 1.7;
      f.bank = -f.curve * 1.5;
    },
    // orbit a point, which keeps quarry in play far longer than a flyover
    circle(f, dt, ctx) {
      f.ang += (f.speed / Math.max(6, f.orbit)) * dt * f.dir;
      const cx = f.centre.x + Math.cos(f.ang) * f.orbit;
      const cz = f.centre.z + Math.sin(f.ang) * f.orbit;
      const cy = f.centre.y + Math.sin(f.ang * 2 + f.phase) * f.bob * 3;
      f.vel.set((cx - f.pos.x) / Math.max(dt, 1e-3), (cy - f.pos.y) / Math.max(dt, 1e-3),
                (cz - f.pos.z) / Math.max(dt, 1e-3));
      f.head = Math.atan2(f.vel.x, f.vel.z);
      f.bank = 0.45 * f.dir;
    },
    // flip the heading on a timer: small, fast and genuinely annoying
    zigzag(f, dt) {
      f.zig -= dt;
      if (f.zig <= 0) { f.zig = 0.3 + Math.random() * 0.5; f.head += (Math.random() - 0.5) * 2.2; }
      const sp = f.speed;
      f.vel.set(Math.sin(f.head) * sp, Math.sin(f.bobT * 3.1) * f.bob * 5, Math.cos(f.head) * sp);
      f.bobT += dt * 2.4;
      f.bank = Math.sin(f.bobT * 3.1) * 0.5;
    },
    // straight up, wandering with the wind
    drift(f, dt, ctx) {
      f.bobT += dt;
      f.spinA += (f.type.spin || 0) * dt;
      f.vel.set(ctx.wind.x * 2.4 + Math.sin(f.bobT * 0.7 + f.phase) * 1.4,
                f.speed,
                ctx.wind.z * 2.4 + Math.cos(f.bobT * 0.6 + f.phase) * 1.4);
      f.bank = 0;
    },
    // thrown: gravity does the rest
    arc(f, dt) {
      f.vel.y -= 11 * dt;
      f.spinA += (f.type.spin || 0) * dt;
      f.bank = 0;
    },
    // straight at the player, then past them
    dive(f, dt, ctx) {
      const to = ctx.tmp.copy(ctx.player).sub(f.pos);
      const d = to.length();
      if (d > 8 && !f.committed) {
        to.normalize();
        f.vel.lerp(to.multiplyScalar(f.speed), 1 - Math.exp(-2.4 * dt));
      } else {
        f.committed = true;                      // past you now, keep going
        f.vel.y += 6 * dt;
      }
      f.head = Math.atan2(f.vel.x, f.vel.z);
      f.bank = 0.2;
    },
    // hold a slot behind a leader
    formation(f, dt, ctx) {
      const lead = f.leader;
      if (!lead || !lead.alive) { BEHAVIOURS.cruise(f, dt, ctx); return; }
      const tx = lead.pos.x + Math.sin(lead.head + Math.PI) * f.slot.z + Math.cos(lead.head) * f.slot.x;
      const tz = lead.pos.z + Math.cos(lead.head + Math.PI) * f.slot.z - Math.sin(lead.head) * f.slot.x;
      f.vel.set((tx - f.pos.x) * 1.8, (lead.pos.y + f.slot.y - f.pos.y) * 1.8, (tz - f.pos.z) * 1.8);
      f.head = lead.head;
      f.bank = lead.bank;
    },
    /* Wandering on the ground: a few seconds in one direction, a pause to
       look up, then off again. Anything with legs uses this until it has a
       reason not to. */
    graze(f, dt, ctx) {
      f.wanderT -= dt;
      if (f.wanderT <= 0) {
        f.wanderT = 1.6 + Math.random() * 3.4;
        f.resting = Math.random() < 0.4;
        if (!f.resting) f.head += (Math.random() - 0.5) * 2.6;
      }
      const sp = f.resting ? 0 : f.speed * 0.4;
      f.vel.set(Math.sin(f.head) * sp, 0, Math.cos(f.head) * sp);
      f.gait += dt * sp * 1.4;
    },
    // and running from you once you are too close for its liking
    flee(f, dt, ctx) {
      const away = ctx.tmp.copy(f.pos).sub(ctx.player);
      away.y = 0;
      const d = away.length();
      if (d > f.type.flee * 2.2) { f.spooked = false; BEHAVIOURS.graze(f, dt, ctx); return; }
      away.normalize();
      f.head = Math.atan2(away.x, away.z);
      const sp = f.speed * (f.spooked ? 1.5 : 1);
      f.vel.set(away.x * sp, 0, away.z * sp);
      f.gait += dt * sp * 1.5;
      // a rabbit bounds rather than runs, and the hop is the whole charm
      if (f.type.hop) f.hopT = (f.hopT || 0) + dt * 7;
    },
    // props do not move; a bell only swings
    still(f, dt) {
      f.vel.set(0, 0, 0);
      if (f.type.swings) f.bank = Math.sin(f.age * 1.6 + f.phase) * 0.22;
    },
    /* The owl flies three different ways over the course of the fight,
       and the mission switches between them. Circling is where you get
       your shots at the lantern; the dive is the only time the eyes come
       round to face you; the hover is where it stops running and dares
       you to hit it in the chest. */
    /* Circling has to be *steered*, not placed. `circle` puts a flyer on
       an exact point of an exact ring every frame, which is fine for a
       raven that has never been anywhere else — but the owl leaves the
       ring to dive, and snapping it back onto the ring afterwards reads
       as a teleport. So this one works out where the owl already is and
       flies it round from there. */
    bossCircle(f, dt, ctx) {
      const c = f.centre;
      c.x = U.damp(c.x, ctx.player.x, 0.7, dt);
      c.z = U.damp(c.z, ctx.player.z, 0.7, dt);
      c.y = U.damp(c.y, f.cruiseY, 1.1, dt);
      f.orbit = U.damp(f.orbit, f.orbitTarget, 0.6, dt);

      let dx = f.pos.x - c.x, dz = f.pos.z - c.z;
      let r = Math.hypot(dx, dz);
      if (r < 1e-3) { dx = 1; dz = 0; r = 1; }
      f.ang = Math.atan2(dz, dx);
      const ux = dx / r, uz = dz / r;                 // outward
      const tx = -uz * f.dir, tz = ux * f.dir;        // the way round

      const sp = f.speed;
      const pull = U.clamp((f.orbit - r) * 0.55, -sp * 0.8, sp * 0.8);
      const want = ctx.tmp.set(tx * sp - ux * pull,
                               (c.y - f.pos.y) * 0.9,
                               tz * sp - uz * pull);
      f.vel.lerp(want, 1 - Math.exp(-2.6 * dt));
      f.head = Math.atan2(f.vel.x, f.vel.z);
      f.bank = 0.4 * f.dir;
      f.flapRate = 1.0;
      bossKeep(f, dt, ctx);
    },
    /* The pass. It comes at a point a little over your head rather than
       at your boots — a bird this size aimed at the floor arrives in the
       floor, and the ground clamp then drags it through the dirt — and
       it pulls out at a fixed top speed towards its own cruising height.
       (It used to multiply its speed every frame while climbing away,
       which is how a boss ends up somewhere over the next county.) */
    bossDive(f, dt, ctx) {
      const cap = f.speed * 2.4;
      const to = ctx.tmp.set(ctx.player.x - f.pos.x,
                             (ctx.player.y + 5.5) - f.pos.y,
                             ctx.player.z - f.pos.z);
      const d = to.length();
      if (d > 12 && !f.committed) {
        f.vel.lerp(to.multiplyScalar(cap / (d || 1)), 1 - Math.exp(-3.2 * dt));
      } else {
        f.committed = true;
        // pull up hard, wings hammering — but only back up to the height
        // it fights from, and never faster than it can fly
        const wantY = Math.max(ctx.player.y + 22, f.cruiseY);
        f.vel.y = U.damp(f.vel.y, U.clamp((wantY - f.pos.y) * 1.2, -8, 24), 3.2, dt);
        f.vel.x *= 1 - Math.min(1, 0.5 * dt);
        f.vel.z *= 1 - Math.min(1, 0.5 * dt);
      }
      if (f.vel.lengthSq() > cap * cap) f.vel.setLength(cap);
      f.head = Math.atan2(f.vel.x, f.vel.z);
      f.bank = U.clamp(-f.vel.y * 0.05, -0.5, 0.5);
      f.flapRate = 2.4;
      bossKeep(f, dt, ctx);
    },
    bossHover(f, dt, ctx) {
      // hangs in front of you, beating, daring you
      const want = ctx.tmp.copy(ctx.player);
      want.y += f.hoverUp ?? 16;
      const back = Math.atan2(f.pos.x - ctx.player.x, f.pos.z - ctx.player.z);
      const rad = f.hoverDist ?? 34;
      want.x += Math.sin(back) * rad;
      want.z += Math.cos(back) * rad;
      // steer towards the slot at a speed a bird could actually fly: a
      // straight proportional pull covers a hundred metres in a blink and
      // reads as the owl blinking across the sky
      want.sub(f.pos).multiplyScalar(1.1);
      const cap = f.speed * 2.4;
      if (want.lengthSq() > cap * cap) want.setLength(cap);
      f.vel.lerp(want, 1 - Math.exp(-2.2 * dt));
      f.vel.y += Math.sin(f.age * 2.4) * 6 * dt;
      // always facing you: the chest is the target, so it has to be shown
      const toP = ctx.tmp.copy(ctx.player).sub(f.pos);
      f.head = Math.atan2(toP.x, toP.z);
      f.bank = Math.sin(f.age * 1.8) * 0.12;
      f.flapRate = 3.4;
      bossKeep(f, dt, ctx);
    },
    /* The talon run. It picks a lane that crosses your front rather
       than a line that ends at your face, flies it flat out, and takes
       the next one from wherever it came out of the last — so the fight
       moves across the whole clearing and you are turning, tracking and
       leading a thing the size of a shed. This is the phase the aim
       assist used to make trivial, which is exactly why it exists now
       that there isn't one. */
    bossSweep(f, dt, ctx) {
      const cap = f.speed * 2.2;
      let need = !f.lane;
      if (f.lane) {
        const dx = f.pos.x - f.lane.x, dz = f.pos.z - f.lane.z;
        if (dx * dx + dz * dz < 18 * 18) need = true;      // arrived; take the next
      }
      if (need) {
        // Take a lane through the clearing to the opposite side. A small
        // alternating lateral offset keeps consecutive passes distinct,
        // while still bringing the owl close enough to feel dangerous.
        let ux = f.pos.x - ctx.player.x, uz = f.pos.z - ctx.player.z;
        const len = Math.hypot(ux, uz) || 1;
        ux /= len; uz /= len;
        f.laneSide = f.laneSide === 1 ? -1 : 1;
        const r = f.sweepDist ?? 46;
        const offset = f.laneSide * (9 + Math.random() * 5);
        f.lane = {
          x: ctx.player.x - ux * r - uz * offset,
          z: ctx.player.z - uz * r + ux * offset,
        };
      }
      const want = ctx.tmp.set(f.lane.x - f.pos.x,
                               (ctx.player.y + (f.sweepUp ?? 12)) - f.pos.y,
                               f.lane.z - f.pos.z);
      want.setLength(cap);
      f.vel.lerp(want, 1 - Math.exp(-2.8 * dt));
      if (f.vel.lengthSq() > cap * cap) f.vel.setLength(cap);
      f.head = Math.atan2(f.vel.x, f.vel.z);
      // bank out of the *rate* of turn, which is what a wingover looks like
      const turn = U.wrapAngle(f.head - (f._prevHead ?? f.head));
      f._prevHead = f.head;
      f.bank = U.damp(f.bank, U.clamp(-turn / Math.max(dt, 1e-3) * 0.5, -0.9, 0.9), 6, dt);
      f.flapRate = 2.6;
      bossKeep(f, dt, ctx);
    },
    /* The call. It climbs, stops, and hammers its wings while whatever
       it is calling arrives — a long, obvious, deliberately unhittable
       beat that tells you to deal with the sky instead. */
    bossCall(f, dt, ctx) {
      const want = ctx.tmp.set(ctx.player.x - f.pos.x,
                               (ctx.player.y + (f.callUp ?? 34)) - f.pos.y,
                               ctx.player.z - f.pos.z);
      const flat = Math.hypot(want.x, want.z) || 1e-3;
      const rad = f.callDist ?? 54;
      want.x -= want.x / flat * rad;
      want.z -= want.z / flat * rad;
      want.multiplyScalar(0.9);
      const cap = f.speed * 1.6;
      if (want.lengthSq() > cap * cap) want.setLength(cap);
      f.vel.lerp(want, 1 - Math.exp(-2.0 * dt));
      const toP = ctx.tmp.set(ctx.player.x - f.pos.x, 0, ctx.player.z - f.pos.z);
      f.head = Math.atan2(toP.x, toP.z);
      f.bank = 0;
      f.flapRate = 4.5;
      bossKeep(f, dt, ctx);
    },
    /* Enraged: it will not hold still and it will not go away. It slides
       round you at arm's length, rising and falling, always facing you,
       which makes the chest a target that is never in the same place
       twice but is always *there*. */
    bossRage(f, dt, ctx) {
      f.rageA = (f.rageA ?? Math.atan2(f.pos.x - ctx.player.x, f.pos.z - ctx.player.z))
                + dt * (f.rageRate ?? 0.9) * f.dir;
      const rad = f.hoverDist ?? 30;
      const want = ctx.tmp.set(
        ctx.player.x + Math.sin(f.rageA) * rad - f.pos.x,
        (ctx.player.y + (f.hoverUp ?? 15) + Math.sin(f.age * 1.9) * 6) - f.pos.y,
        ctx.player.z + Math.cos(f.rageA) * rad - f.pos.z);
      want.multiplyScalar(1.4);
      const cap = f.speed * 2.6;
      if (want.lengthSq() > cap * cap) want.setLength(cap);
      f.vel.lerp(want, 1 - Math.exp(-3.0 * dt));
      const toP = ctx.tmp.set(ctx.player.x - f.pos.x, 0, ctx.player.z - f.pos.z);
      f.head = Math.atan2(toP.x, toP.z);
      f.bank = Math.sin(f.age * 3.1) * 0.22;
      f.flapRate = 4.0;
      bossKeep(f, dt, ctx);
    },
    // staggered: dead in the air for a beat, wings loose
    bossStagger(f, dt, ctx) {
      f.vel.multiplyScalar(1 - Math.min(1, 2.4 * dt));
      f.vel.y += Math.sin(f.age * 9) * 3 * dt;
      f.bank = Math.sin(f.age * 12) * 0.3;
      f.flapRate = 0.35;
      if (ctx) bossKeep(f, dt, ctx);
    },
    boss(f, dt, ctx) { BEHAVIOURS.bossCircle(f, dt, ctx); },
  };

  /* =============== a flyer =============== */

  class Flyer {
    constructor(type, opts) {
      this.type = type;
      this.behaviour = opts.behaviour || 'cruise';
      this.pos = new THREE.Vector3().copy(opts.pos);
      this.vel = new THREE.Vector3();
      this.speed = opts.speed ?? U.lerp(type.speed[0], type.speed[1], Math.random());
      this.head = opts.head ?? 0;
      this.curve = opts.curve ?? 0;
      this.bob = opts.bob ?? 0.6;
      this.bobT = Math.random() * 10;
      this.phase = Math.random() * 6.28;
      this.zig = 0.3;
      this.ang = opts.ang ?? 0;
      this.dir = opts.dir ?? 1;
      this.orbit = opts.orbit ?? 40;
      this.orbitTarget = opts.orbitTarget ?? this.orbit;
      this.centre = opts.centre ? opts.centre.clone() : new THREE.Vector3(0, this.pos.y, 0);
      this.slot = opts.slot || { x: 0, y: 0, z: 0 };
      this.leader = opts.leader || null;
      this.spinA = 0;
      this.bank = 0;
      this.attackT = opts.attackT ?? 5;
      this.attacking = false;
      this.committed = false;

      this.hp = opts.hp ?? type.hp;
      this.value = opts.value ?? type.points;
      this.guard = !!type.guard;
      this.alive = true;
      this.dying = false;
      this.dead = false;
      this.escaped = false;
      this.age = 0;
      this.life = opts.life ?? 999;
      this.scale = opts.scale ?? 1;
      this.mesh = type.mesh();
      this.mesh.scale.setScalar(this.scale);
      this.mesh.position.copy(this.pos);
      this.mark = this.guard ? guardMark() : null;
      this.wings = this.mesh.userData.wings || null;
      this.legs = this.mesh.userData.legs || null;
      this.weak = this.mesh.userData.weak || null;
      this.weakName = null;          // which part is open right now
      this.cruiseY = this.pos.y;
      this.flapRate = 1;
      this._wp = new THREE.Vector3();
      this.flap = Math.random() * 6.28;
      this.gait = Math.random() * 10;
      this.wanderT = Math.random() * 2;
      this.resting = false;
      this.flushed = false;
      this.hitFlash = 0;
      if (type.ground) this.behaviour = 'graze';
      if (type.prop) this.behaviour = 'still';
    }

    // Arrows are tested against a sphere that grows a little with range.
    // A raven at 140 m is four pixels across; asking for pixel accuracy
    // there is not difficulty, it is a lottery.
    hitRadius(from) {
      const d = from ? this.pos.distanceTo(from) : 0;
      // Forgiving with range, because a raven at 120 m is a handful of
      // pixels and pixel-hunting is not the game — but only just. This
      // used to be twice as generous, back when the bow also solved the
      // lead for you; two layers of the same forgiveness stacked up to a
      // bow that hit whatever was roughly over there, and a playtester
      // said as much. The lead is yours again, so the sphere is the only
      // help left and it stays modest.
      // The dove is the exception the other way — it keeps the tightest
      // sphere of anything, because being punished for a hit you did not
      // really make is the worst thing a shooting gallery can do.
      const grow = this.type.guard ? 340 : 240;
      return this.type.radius * this.scale * (1 + d / grow);
    }

    // a pheasant sitting in the grass until you are nearly on top of it,
    // and then very much not
    _flush(ctx) {
      this.flushed = true;
      this.behaviour = 'cruise';
      const away = ctx.tmp.copy(this.pos).sub(ctx.player);
      away.y = 0; away.normalize();
      this.head = Math.atan2(away.x, away.z);
      this.speed = Math.max(this.speed, 16);
      this.bob = 1.4;
      this.value = Math.round(this.value * 1.5);   // worth more on the wing
      this.pos.y += 1.2;
      AudioBus.play('flush', {});
      if (ctx.onFlush) ctx.onFlush(this);
    }

    /* Where an arrow has to land to hurt this thing. For everything in
       the wood that is its middle; for the owl it is whichever part the
       fight has opened, which is also where the focus lead marker points. */
    aimPoint(out) {
      const v = out || this._wp;
      const w = this.weak && this.weakName && this.weak[this.weakName];
      if (!w) return v.copy(this.pos);
      return w.obj.getWorldPosition(v);
    }

    // did that arrow land on the open part, or just on a very cross bird?
    weakRadius(w) {
      // Generous enough that a shot which visibly went into the lantern
      // counts as one, and no more than that. Nothing aims at the open
      // part on your behalf any more, so this is where the whole boss
      // fight is decided: too wide and every arrow that clips the bird
      // is a hit, too tight and the owl is a lottery at sixty metres.
      return w.radius * this.scale * 1.55;
    }
    /* The arrow's own segment against the open weak point. The body has a
       hit sphere many metres across, so the point where an arrow *enters*
       that sphere can be nowhere near the eyes it was aimed at; what
       matters is whether the arrow flew through the eyes, and that is a
       question about the whole segment. */
    weakSegHit(from, seg, len) {
      if (!this.weak) return true;
      const w = this.weakName && this.weak[this.weakName];
      if (!w) return false;
      const p = w.obj.getWorldPosition(this._wp);
      const r = this.weakRadius(w);
      if (p.distanceTo(from) <= r) return true;
      // closest approach of the segment to the weak point
      const mx = p.x - from.x, my = p.y - from.y, mz = p.z - from.z;
      const t = U.clamp((mx * seg.x + my * seg.y + mz * seg.z) / (len * len), 0, 1);
      const cx = from.x + seg.x * t - p.x;
      const cy = from.y + seg.y * t - p.y;
      const cz = from.z + seg.z * t - p.z;
      return Math.hypot(cx, cy, cz) <= r;
    }

    /* Wings, legs, flame and the hit flash — everything about a flyer
       that is animation rather than decision. It is its own method
       because a client that is not simulating the flock still has to
       draw one: on a guest, the host says where every bird is and this
       is the only part that still runs locally. */
    animateParts(dt) {
      if (this.wings) {
        this.flap += dt * (this.type.flap || 0) * (this.flapRate || 1);
        const a = Math.sin(this.flap) * (this.type.wingAmp || 0.7);
        for (const w of this.wings) w.pivot.rotation.z = -w.side * a;
      }
      if (this.legs) {
        // diagonal pairs, and a bound instead of a walk for the hoppers
        const swing = this.type.hop && this.hopT
          ? Math.sin(this.hopT) * 0.9 : Math.sin(this.gait * 3) * 0.55;
        for (const l of this.legs) l.pivot.rotation.x = Math.sin(this.gait * 3 + l.phase) * 0.55;
        if (this.type.hop && this.hopT) {
          this.mesh.position.y += Math.max(0, Math.sin(this.hopT)) * 0.7;
          for (const l of this.legs) l.pivot.rotation.x = swing;
        }
      }
      if (this.mesh.userData.flame) {
        const s = 1 + Math.sin(this.age * 9 + this.phase) * 0.18;
        this.mesh.userData.flame.scale.setScalar(s);
      }
      if (this.hitFlash > 0) {
        this.hitFlash -= dt;
        this.mesh.visible = Math.floor(this.hitFlash * 40) % 2 === 0;
        if (this.hitFlash <= 0) this.mesh.visible = true;
      }
    }

    /* ---- puppetry ----
       What a bird looks like on a client that is not deciding where it
       goes. `netState` is what the host sends, `netApply` is a guest
       being told where it should be, and `netBlend` is the frame in
       between — which is most of them.

       Three things this has to get right, all of which it used to get
       wrong:

       - It has to be small. A snapshot is sent for every flyer in the
         wood many times a second, and a wood has fifty things in it.
         Seventeen significant figures per axis was three quarters of
         the bandwidth of the whole mission, and past a certain point a
         data channel does not get slower — it gets *behind*, and every
         claim and every kill queued behind it goes with it.
       - It has to be blended. The comment here used to say the mission
         held two states and interpolated them. It did not: `netApply`
         wrote the position straight into the mesh, so a guest saw
         every bird teleport fifteen times a second and any late packet
         as a stutter.
       - It has to keep the dove's mark on the dove. Only `update` moved
         it, and a puppet never runs `update`, so the one bird in the
         mission you must not shoot was the one bird with no warning on
         it if you were not the host. */

    netState() {
      const r = this.mesh.rotation;
      const st = { i: this.netId,
                   x: U.r2(this.pos.x), y: U.r2(this.pos.y), z: U.r2(this.pos.z),
                   b: U.r2(r.y) };
      /* Pitch and roll are zero for everything with feet and for most
         of what has wings, and an omitted key is a key that costs
         nothing. The reader defaults them back to zero. */
      if (r.x) st.a = U.r2(r.x);
      if (r.z) st.c = U.r2(r.z);
      if (this.dying) st.d = 1;
      return st;
    }

    /* Where it has been told to be. What it is doing between here and
       there is `netBlend`'s problem, and how long it has to get there
       is measured rather than assumed — the host sends the quarry far
       more often than it sends the deer. */
    netApply(st) {
      if (!st) return;
      const from = this._netFrom
        || (this._netFrom = { x: 0, y: 0, z: 0, a: 0, b: 0, c: 0 });
      const r = this.mesh.rotation;
      from.x = this.pos.x; from.y = this.pos.y; from.z = this.pos.z;
      from.a = r.x; from.b = r.y; from.c = r.z;
      this._netTo = { x: st.x, y: st.y, z: st.z,
                      a: st.a || 0, b: st.b || 0, c: st.c || 0 };
      this._netSpan = U.clamp(this._netSince || 0.07, 0.03, 0.9);
      this._netSince = 0;
      this._netT = 0;
      /* Velocity is not sent — it is the slope of the two snapshots,
         and it has to exist on a guest because the lead marker is
         worked out from it. Without this every bird read as hovering,
         and the dot that tells you where to hold sat on top of a bird
         that had already left. */
      const to = this._netTo, sp = this._netSpan;
      this.vel.set((to.x - from.x) / sp, (to.y - from.y) / sp, (to.z - from.z) / sp);
      if (st.h !== undefined) this.hp = st.h;
      if (st.d && !this.dying) { this.dying = true; this.mark && (this.mark.visible = false); }
    }

    /* One frame of being somebody else's bird. Overrun to 1.35 of a
       span so a snapshot that is a little late carries on flying
       instead of stopping dead in the air waiting for it. */
    netBlend(dt) {
      this._netSince = (this._netSince || 0) + dt;
      this.age += dt;
      const to = this._netTo;
      if (to) {
        this._netT = (this._netT || 0) + dt;
        const k = U.clamp(this._netT / (this._netSpan || 0.07), 0, 1.35);
        const f = this._netFrom;
        this.pos.set(U.lerp(f.x, to.x, k), U.lerp(f.y, to.y, k), U.lerp(f.z, to.z, k));
        this.mesh.position.copy(this.pos);
        this.mesh.rotation.set(U.angLerp(f.a, to.a, k), U.angLerp(f.b, to.b, k),
                               U.angLerp(f.c, to.c, k));
      }
      if (this.mark) {
        this.mark.position.copy(this.pos);
        this.mark.position.y += this.type.radius * this.scale * 1.5 + 1.2;
      }
      this.animateParts(dt);
    }

    hit(power) {
      if (!this.alive || this.dying) return false;
      this.hp -= 1;
      this.hitFlash = 0.16;
      if (this.hp <= 0) { this.kill(); return true; }
      return false;
    }

    kill() {
      this.dying = true;
      this.deathT = this.type.death === 'feathers' ? 1.5 : 0.001;
      // birds tumble out of the sky; everything else is simply gone
      this.vel.multiplyScalar(0.35);
      this.vel.y = Math.min(this.vel.y, 1);
      this.tumble = (Math.random() - 0.5) * 9;
    }

    update(dt, ctx) {
      this.age += dt;
      if (this.dying) {
        if (this.mark) this.mark.visible = false;
        this.deathT -= dt;
        this.vel.y -= 22 * dt;
        this.pos.addScaledVector(this.vel, dt);
        this.mesh.position.copy(this.pos);
        this.mesh.rotation.z += this.tumble * dt;
        this.mesh.rotation.x += this.tumble * 0.7 * dt;
        if (this.deathT <= 0 || this.pos.y < ctx.heightAt(this.pos.x, this.pos.z)) {
          this.alive = false; this.dead = true;
        }
        return;
      }

      // Anything with feet decides for itself whether it is grazing or
      // running: coming close enough to a deer that it bolts is the whole
      // pleasure of a deer being in the wood at all.
      if (this.type.ground && !this.flushed) {
        const d = this.pos.distanceTo(ctx.player);
        if (this.type.flush && d < this.type.flush) this._flush(ctx);
        else if (this.type.charges) this.behaviour = d < 34 ? 'dive' : 'graze';
        else if (this.type.flee) this.behaviour = d < this.type.flee ? 'flee' : 'graze';
      }

      (BEHAVIOURS[this.behaviour] || BEHAVIOURS.cruise)(this, dt, ctx);
      this.pos.addScaledVector(this.vel, dt);

      if (this.type.ground && !this.flushed) {
        // walkers ride the ground rather than swim through it
        this.pos.y = ctx.heightAt(this.pos.x, this.pos.z) + (this.type.ride || 0);
        // and they stay in the clearing where they can be seen
        const r = Math.hypot(this.pos.x - ctx.home.x, this.pos.z - ctx.home.z);
        if (r > (ctx.roam || 130)) {
          const back = Math.atan2(ctx.home.x - this.pos.x, ctx.home.z - this.pos.z);
          this.head = U.angLerp(this.head, back, 0.2);
        }
      } else {
        // keep out of the ground and under the ceiling. Big things need
        // more clearance than a raven: the owl's wings are eight metres
        // across, and three metres of headroom is it ploughing a furrow.
        const gy = ctx.heightAt(this.pos.x, this.pos.z) + (this.type.floor || 3);
        if (this.pos.y < gy) { this.pos.y = gy; if (this.vel.y < 0) this.vel.y = 0; }
      }

      this.mesh.position.copy(this.pos);
      if (this.mark) {
        this.mark.position.copy(this.pos);
        this.mark.position.y += this.type.radius * this.scale * 1.5 + 1.2;
      }
      /* Which way it is pointing.

         Every model in here is built facing −Z: beak, chest and snout at
         the front of the group, tail at the back. `head` is a compass
         bearing — 0 is +Z — so the yaw that puts the *face* along the
         bearing is `head + PI`. Without that half turn every bird in the
         wood flies tail first, which is only obvious on the one thing you
         look at properly: an owl that dives at you back-of-head first.

         The order matters as much as the angles. In YXZ the yaw is taken
         in the world, the pitch in the yawed frame (so a climb is a climb
         whichever way it is heading, not a roll) and the bank about the
         model's own length. */
      this.mesh.rotation.set(0, 0, 0);
      this.mesh.rotation.order = 'YXZ';
      if (this.type.spin) {
        this.mesh.rotation.y = this.spinA;
        this.mesh.rotation.z = Math.PI * 0.12;
      } else {
        this.mesh.rotation.y = this.head + Math.PI;
        // banking into the turn, not out of it: +Z roll lifts the right
        // wing, and a rising heading is a turn to the left
        this.mesh.rotation.z = -U.clamp(this.bank, -1, 1);
        // nose follows the climb, which is what makes a dive look like one
        const climb = Math.atan2(this.vel.y, Math.hypot(this.vel.x, this.vel.z) || 1);
        this.mesh.rotation.x = U.clamp(climb, -0.9, 0.9) * 0.7;
      }

      /* And, for the owl, where it is *looking*. An owl's head turns
         nearly the whole way round, and this one uses all of it: the eyes
         stay on you while it circles, so the round you spend shooting at
         its lantern is a round spent being watched. It costs one rotation
         and it is most of the character of the fight. */
      if (this.mesh.userData.head && ctx.player) {
        const h = this.mesh.userData.head;
        h.rotation.order = 'YXZ';
        const dx = ctx.player.x - this.pos.x, dz = ctx.player.z - this.pos.z;
        const flat = Math.hypot(dx, dz) || 1e-3;
        const want = Math.atan2(dx, dz) + Math.PI;          // same convention
        // relative to the body, and only as far round as a neck will go
        const relY = U.clamp(U.wrapAngle(want - (this.head + Math.PI)), -2.7, 2.7);
        const relX = U.clamp(Math.atan2(ctx.player.y - (this.pos.y + this.type.size * 0.9),
                                        flat) - this.mesh.rotation.x, -0.7, 0.7);
        // damped numerically rather than by shortest angle: from hard left
        // to hard right an owl unwinds through the front, it does not
        // whip round through its own shoulders
        h.rotation.y = U.damp(h.rotation.y, relY, 4.5, dt);
        h.rotation.x = U.damp(h.rotation.x, relX, 4.5, dt);
      }

      this.animateParts(dt);

      // gone: too far, too old, or it has flown off the top
      // ...but a boss never wanders off on its own. It *is* the round;
      // an owl that ages out or crosses the world bounds mid-fight is an
      // owl that vanishes. Only the mission may retire it.
      const r = Math.hypot(this.pos.x, this.pos.z);
      if (!this.type.boss) {
        if (this.life !== 999 && this.age > this.life) this.escaped = true;
        if (r > ctx.bounds || this.pos.y > 230) this.escaped = true;
      }
      if (this.escaped) this.alive = false;
    }
  }

  /* =============== the flock =============== */

  class Flock {
    constructor(scene) {
      this.scene = scene;
      this.list = [];
      this._tmp = new THREE.Vector3();
    }

    spawn(typeId, opts = {}) {
      const type = TYPES[typeId];
      if (!type) return null;
      const f = new Flyer(type, opts);
      /* A stable name for one bird across three machines. The host
         hands them out; a guest is told which one it is being sent. */
      f.netId = opts.netId !== undefined ? opts.netId : (this._nextId = (this._nextId || 0) + 1);
      f.typeId = typeId;
      this.scene.add(f.mesh);
      if (f.mark) this.scene.add(f.mark);
      this.list.push(f);
      return f;
    }

    byNetId(id) { return this.list.find(f => f.netId === id) || null; }

    remove(f) {
      const i = this.list.indexOf(f);
      if (i < 0) return;
      Engine.disposeObject(f.mesh);
      if (f.mark) Engine.disposeObject(f.mark);
      this.list.splice(i, 1);
    }

    // ctx: { heightAt, player, wind, bounds, onGone(flyer) }
    update(dt, ctx) {
      /* A guest does not simulate the flock at all. It is told where
         every bird is a few times a second and its only job is to fly
         them between those messages — which is why `animateParts` had
         to come out of `update`. */
      if (this.puppet) {
        for (const f of this.list) f.netBlend(dt);
        return;
      }
      ctx.tmp = this._tmp;
      for (let i = this.list.length - 1; i >= 0; i--) {
        const f = this.list[i];
        f.update(dt, ctx);
        if (!f.alive) {
          if (ctx.onGone) ctx.onGone(f);
          Engine.disposeObject(f.mesh);
          if (f.mark) Engine.disposeObject(f.mark);
          this.list.splice(i, 1);
        }
      }
    }

    get active() { return this.list.filter(f => !f.dying); }
    get count() { return this.list.reduce((n, f) => n + (f.dying ? 0 : 1), 0); }

    clear() {
      for (const f of this.list) {
        Engine.disposeObject(f.mesh);
        if (f.mark) Engine.disposeObject(f.mark);
      }
      this.list.length = 0;
    }
    dispose() { this.clear(); }
  }

  return { TYPES, BEHAVIOURS, Flyer, Flock, birdMesh, lanternMesh };
})();


/* ---- what dying sounds like ---- */

AudioBus.define('flyer-hit', (c, dest, o) => {
  const t = c.currentTime;
  const pitch = o.pitch || 1;
  // the thud of a hit, pitched by how big the thing was
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(320 * pitch, t);
  osc.frequency.exponentialRampToValueAtTime(90 * pitch, t + 0.14);
  osc.connect(g); g.connect(dest);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.24, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  osc.start(t); osc.stop(t + 0.3);
  const n = AudioBus.noiseSource();
  if (n) {
    const f = c.createBiquadFilter(), ng = c.createGain();
    f.type = 'bandpass'; f.frequency.setValueAtTime(1400 * pitch, t); f.Q.value = 1.1;
    n.connect(f); f.connect(ng); ng.connect(dest);
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.16, t + 0.008);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    n.start(t); n.stop(t + 0.28);
  }
});

AudioBus.define('flyer-pop', (c, dest, o) => {
  const t = c.currentTime;
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(900, t);
  osc.frequency.exponentialRampToValueAtTime(180, t + 0.09);
  osc.connect(g); g.connect(dest);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.22, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  osc.start(t); osc.stop(t + 0.2);
});

AudioBus.define('flyer-shatter', (c, dest) => {
  const t = c.currentTime;
  const n = AudioBus.noiseSource();
  if (!n) return;
  const f = c.createBiquadFilter(), g = c.createGain();
  f.type = 'highpass'; f.frequency.setValueAtTime(2200, t);
  n.connect(f); f.connect(g); g.connect(dest);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.3, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  n.start(t); n.stop(t + 0.36);
});

// a pheasant going up out of the grass: all panic and wingbeat
AudioBus.define('flush', (c, dest) => {
  const t = c.currentTime;
  for (let i = 0; i < 5; i++) {
    const at = t + i * 0.075;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(700 - i * 60 + Math.random() * 120, at);
    osc.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.09, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
    osc.start(at); osc.stop(at + 0.09);
  }
  const n = AudioBus.noiseSource();
  if (!n) return;
  const f = c.createBiquadFilter(), ng = c.createGain();
  f.type = 'bandpass'; f.frequency.setValueAtTime(900, t); f.Q.value = 0.7;
  n.connect(f); f.connect(ng); ng.connect(dest);
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.14, t + 0.02);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  n.start(t); n.stop(t + 0.6);
});

// birdsong, so the wood is not silent between waves
AudioBus.define('birdsong', (c, dest, o) => {
  const t = c.currentTime;
  const base = 900 + Math.random() * 1400;
  const notes = 2 + ((Math.random() * 3) | 0);
  for (let i = 0; i < notes; i++) {
    const osc = c.createOscillator(), g = c.createGain();
    const at = t + i * 0.09;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(base * (1 + i * 0.12), at);
    osc.frequency.exponentialRampToValueAtTime(base * (1.3 + i * 0.1), at + 0.05);
    osc.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.035 * (o.volume ?? 1), at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
    osc.start(at); osc.stop(at + 0.14);
  }
});

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

  /* =============== the body =============== */

  /* Grey on top, white underneath, and nothing else: a shark read
     through thirty metres of blue water is a silhouette, and every
     detail that is not the silhouette is a detail you are paying for
     and nobody is seeing. The tail is the one moving part, on a pivot,
     and it beats faster the harder the animal is working — which is
     the tell that tells you it has stopped patrolling. */
  function sharkMesh(rng, size) {
    const parts = [];
    const s = size;

    const body = new THREE.IcosahedronGeometry(0.5 * s, 1);
    body.scale(0.62, 0.78, 2.35);
    parts.push(body);

    const snout = new THREE.ConeGeometry(0.30 * s, 1.15 * s, 7);
    snout.rotateX(-Math.PI / 2);
    snout.translate(0, -0.03 * s, 1.55 * s);
    parts.push(snout);

    // the dorsal, which is the whole animal as far as the eye is concerned
    const dorsal = new THREE.ConeGeometry(0.30 * s, 0.85 * s, 3);
    dorsal.scale(0.28, 1, 1.5);
    dorsal.translate(0, 0.62 * s, -0.05 * s);
    parts.push(dorsal);

    for (const side of [1, -1]) {
      const pec = new THREE.ConeGeometry(0.22 * s, 0.86 * s, 3);
      pec.scale(0.30, 1, 1.2);
      pec.rotateZ(side * (Math.PI / 2 - 0.34));
      pec.translate(side * 0.50 * s, -0.20 * s, 0.42 * s);
      parts.push(pec);
    }
    const pelvic = new THREE.ConeGeometry(0.16 * s, 0.42 * s, 3);
    pelvic.scale(0.30, 1, 1.2);
    pelvic.rotateX(Math.PI);
    pelvic.translate(0, -0.42 * s, -0.75 * s);
    parts.push(pelvic);

    const geo = Sky.mergeGeometries(parts);
    for (const p of parts) p.dispose();

    const p = geo.attributes.position;
    const cols = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    const back = new THREE.Color('#3f5769'), belly = new THREE.Color('#e4eef2');
    for (let i = 0; i < p.count; i++) {
      const up = U.clamp(p.getY(i) / (0.55 * s) * 0.5 + 0.5, 0, 1);
      c.copy(belly).lerp(back, Math.pow(up, 0.7));
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, mat));

    // the tail, on its own pivot at the wrist
    const tailPivot = new THREE.Object3D();
    tailPivot.position.set(0, 0, -1.15 * s);
    const caudalParts = [];
    const upper = new THREE.ConeGeometry(0.26 * s, 1.20 * s, 3);
    upper.scale(0.26, 1, 1);
    upper.rotateX(-1.32);
    upper.translate(0, 0.34 * s, -0.55 * s);
    caudalParts.push(upper);
    const lower = new THREE.ConeGeometry(0.20 * s, 0.72 * s, 3);
    lower.scale(0.26, 1, 1);
    lower.rotateX(1.9);
    lower.translate(0, -0.22 * s, -0.40 * s);
    caudalParts.push(lower);
    const caudal = Sky.mergeGeometries(caudalParts);
    for (const q of caudalParts) q.dispose();
    const cp = caudal.attributes.position;
    const ccols = new Float32Array(cp.count * 3);
    for (let i = 0; i < cp.count; i++) {
      ccols[i * 3] = back.r; ccols[i * 3 + 1] = back.g; ccols[i * 3 + 2] = back.b;
    }
    caudal.setAttribute('color', new THREE.BufferAttribute(ccols, 3));
    caudal.computeVertexNormals();
    tailPivot.add(new THREE.Mesh(caudal, mat));
    g.add(tailPivot);

    /* The jaw. It is shut for the whole mission except in the second
       and a half before a strike, and that is the only warning the
       animal gives you that is not a change of speed. */
    const jaw = new THREE.Mesh(
      new THREE.ConeGeometry(0.26 * s, 0.55 * s, 6),
      new THREE.MeshLambertMaterial({ color: '#2a0e12', flatShading: true,
                                      emissive: '#3d1218', emissiveIntensity: 0.5 }));
    jaw.rotation.x = Math.PI / 2;
    jaw.position.set(0, -0.20 * s, 1.42 * s);
    jaw.scale.setScalar(0.01);
    g.add(jaw);

    void rng;
    return { group: g, tailPivot, jaw, geos: [geo, caudal], mats: [mat, jaw.material] };
  }

  /* =============== the animals =============== */

  /* `o`:
       count      how many
       radius     the reef's own radius
       heightAt   the floor
       ceilingAt  the roof, where there is one — a shark in a cave has
                  to obey the same lid the diver does, or it swims out
                  through the rock it just chased you under
       caves      the cave list; the first ones get a resident
       wreck      where the middle tier is, which is where the food is
       onEvent    (kind, shark) — 'notice' | 'charge' | 'strike' | 'fend'
  */
  function build(scene, rng, o = {}) {
    const count = o.count === undefined ? 4 : o.count;
    const R = o.radius || 190;
    const heightAt = o.heightAt || (() => -30);
    const ceilingAt = o.ceilingAt || null;
    const caves = o.caves || [];
    const onEvent = o.onEvent || (() => {});

    const sharks = [];
    for (let i = 0; i < count; i++) {
      /* The first sharks live at the cave mouths, because the caves
         are where the mission's worst decision is made and they should
         be guarded by the mission's worst news. The rest work the
         slope and the trench, which is where the money is. */
      const den = i < caves.length ? caves[i] : null;
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

          // ---- the body follows the heading, and the tail beats
          const g = sh.mesh.group;
          g.position.copy(sh.pos);
          _look.copy(sh.pos).add(sh.fwd);
          g.up.copy(_up);
          g.lookAt(_look);
          sh.beat += step * (2.4 + sh.speed * 0.85);
          sh.mesh.tailPivot.rotation.y = Math.sin(sh.beat) * 0.52;
          g.rotation.z += Math.sin(sh.beat) * 0.06;
          sh.mesh.jaw.scale.setScalar(U.damp(sh.mesh.jaw.scale.x,
            sh.state === 'charge' ? 1 : 0.01, 6, step));

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

/* ------------------------------------------------------------------
   skier.js — the skier: gravity does the driving, you do the keeping.

   This is the only vehicle in the game with no throttle. The boat has
   an engine and the diver has a kick; a skier has a mountain, and every
   decision is about not giving back what it just gave you. So the whole
   file is organised around one number — how much of your velocity is
   pointing where your skis are pointing — because that is what skiing
   is:

     * a carve holds the edge, the velocity follows the skis, and you
       keep nearly all of it
     * a skid breaks the edge, the velocity carries on the old way, and
       the snow charges you for the difference
     * a check breaks it on purpose, which is how you survive a corner
       you came into too hot

   `slip` is that difference in metres a second, and it is the single
   input to the spray, the sound, the trench in the snow and the speed
   you lose. One number, four channels, and none of them can disagree
   with each other about how hard you are working.

   The other half is the air, and it is deliberately the same modal
   button the boat uses, for the same reason: you are holding something
   down almost all the time, so the trick key cannot be a key you are
   already holding for another purpose.

     on snow, held    -> crouch, storing a pop
     on snow, let go  -> that pop, right now. An ollie off anything.
     in the air, held -> steering spins, tuck/brake flips
     in the air, let go -> the rotation snaps to the nearest whole turn,
                           which is the only thing that makes a landing
                           winnable

   Timing the release to land on a kicker's lip is the deepest thing in
   the mission and it is never explained anywhere: it just pays, every
   time, and players find it.

   The third half is what the mountain does without being asked. Leave a
   lip with real air under you and the skier throws a trick out of the
   book on its own — a grab off a roller, a cork off a kicker, a triple
   off a cornice — sized to the hang time and re-aimed at the snow every
   sub-step so it is always round by the time the skis get there. The
   trick key still overrides it, from wherever the rotation had got to,
   and holding it is still how you get the one *you* wanted. Nobody has
   to learn a button to look good; the players who learn it look better.

   Physics runs on fixed sub-steps. At forty metres a second a dropped
   frame is three metres of travel, and three metres is the far side of
   a tree.
------------------------------------------------------------------ */
class Skier {

  static TUNE = {
    /* --- what the mountain gives you ---
       An arcade g: real gravity on a sixteen-degree pitch is a crawl,
       and the whole mission is the feeling of a hill being too steep. */
    gravity:      21.5,
    liftG:        18.0,   // ...and what you fall at once you are off it

    /* --- what it takes back ---
       Deliberately light. The mountain used to charge for simply being
       on it: a stood-up skier settled at about eighty-eight and a tucked
       one at a hundred and forty, and every one of the sixty kickers on
       the hill was a tax, because the snow took the speed back before
       the next one arrived. These numbers are about a quarter kinder
       across the board, which moves the whole run up a gear and — the
       part that matters — means what you lose is what *you* did: a
       skid, a check, a landing you did not get square. */
    tuckDrag:     0.0021, // quadratic, folded up small
    standDrag:    0.0062, // ...and stood up in the wind
    linDrag:      0.034,  // the snow itself, which does not care how you sit
    topSpeed:     66,     // only a reference for the HUD and the camera

    // --- turning ---
    turnRate:     1.62,   // rad/s at the sweet spot
    turnLowSpeed: 0.46,   // ...and what is left of it at full pelt
    tuckTurn:     0.42,   // a tuck is a promise not to turn
    brakeTurn:    1.85,   // a check turns hard, and pays for it
    grip:         6.4,    // how fast slip bleeds off — the edge, basically
    brakeGrip:    0.30,   // ...and how completely a check throws it away
    /* A skid is still expensive, just less than half as expensive as it
       was. The check is the exception and keeps nearly all of its bite,
       because the one thing that must not get faster is the brake: if
       stopping is cheap then arriving too hot is free. */
    scrub:        0.105,  // speed lost per m/s of slip
    scrubQuad:    0.024,  // ...rising, so a big skid really hurts
    brakeScrub:   0.175,  // and the flat cost of dragging both edges

    // --- the pop ---
    popCharge:    0.30,   // seconds of held crouch to a full one
    popVy:        10.4,   // m/s straight up at full charge
    holdPop:      0.34,   // what you get for never letting go
    popCd:        0.16,

    /* --- the pads ---
       A boost ramp accelerates you the whole way up its run-up and then
       throws you off the lip harder for it, which is the difference
       between a kicker you use to do a trick and a kicker you use to go
       faster. `rampBoost` is m/s² at full strength; the ceiling is what
       stops a chain of them from turning into an unsteerable projectile. */
    rampBoost:    25,
    boostCeil:    62,     // m/s the pads will not push you past
    rampPop:      3.4,    // ...and extra m/s up the lip gives you for it
    trickLift:    7.0,    // ...and the most a lip will find to fit a trick in
    spinnerLift:  7.0,    // what passing through a ring is worth, straight up

    // --- the air ---
    airDrag:      0.0016,
    airYawGain:   1.9,    // steering, off the snow and not tricking
    airSpinRate:  9.4,    // rad/s: a full 360 in two thirds of a second
    airFlipRate:  6.8,    // rad/s: a flip in nine hundred milliseconds
    airRollRate:  8.2,    // rad/s of cork, when a trick asks for one
    autoAir:      0.58,   // hang time below which nothing is thrown
    autoFill:     0.84,   // ...and the fraction of the flight it uses up
    landTolerance: 1.00,  // radians off true before a landing starts costing
    driftTolerance: 1.15, // ...and radians of sideways before it is a crash
    launchK:      1.00,   // the ground must fall away faster than this × g
    launchSpeed:  7,
    relaunchCd:   0.10,

    // --- putting it down badly ---
    crashSpeed:   11,     // impact into a tree above this puts you over
    crashTime:    1.45,   // ...and how long you are a passenger for
    hardVy:       40,     // the drop above which even a clean landing hurts

    skiHalf:      1.10,   // half a ski, for sampling the snow under it
    radius:       1.05,   // and how wide you are, to a tree
    eye:          1.62,
    subStep:      1 / 90,
  };

  /* The four things a landing can be. Kept as a table because the HUD,
     the audio, the money and the flow ladder all want to agree about
     which one just happened, and a chain of `if`s in four files is how
     they stop agreeing. */
  static LANDINGS = [
    { id: 'crash',  min: -1,   keep: 0.00, flow: -99, name: 'CRASH',    pay: 0 },
    { id: 'sketchy', min: 0.20, keep: 0.82, flow: -1,  name: 'SKETCHY',  pay: 0.4 },
    { id: 'clean',  min: 0.44, keep: 0.98, flow: 1,   name: 'CLEAN',    pay: 1.0 },
    /* A stomp *pays* speed rather than merely not costing it. Landing
       one has always been the best-feeling thing in the mission and it
       used to be worth exactly nothing to the rest of the run. */
    { id: 'stomped', min: 0.76, keep: 1.06, flow: 2,   name: 'STOMPED!', pay: 1.4 },
  ];

  /* =============== tricks ===============

     There is no list of tricks. There was one, briefly, and it was
     wrong for the reason every list of tricks is wrong: a table of
     sixteen named moves is sixteen things a player can exhaust, and
     the moment they have seen all sixteen the mountain has stopped
     surprising them.

     So a trick is composed on the spot instead. Three axes, a random
     number of whole turns on each, a grab or not, and a name generated
     from whatever came out — which means "CORK 1080 TAIL" is not an
     entry in a table, it is a description of a thing that just
     happened and might not happen again for an hour.

     Whole turns, always. Yaw is free — nothing downstream reads which
     way the body is pointing — but a flip or a cork that lands on a
     fraction is a landing that is already lost, so fractions are simply
     never generated.

     Nothing is locked and nothing is earned. Every jump can produce
     anything, and when what it produced is too big for the jump, the
     ramp finds the height rather than the trick being refused. */

  static NTH = ['', '', 'DOUBLE ', 'TRIPLE ', 'QUAD ', 'FIVE '];

  /* The name, generated. The rules are the ones a commentator would
     use: a cork is an off-axis spin so it takes the degrees with it, a
     flip with a spin in it is a rodeo one way and a misty the other,
     and anything with all three axes going at once is a bio. */
  static nameTrick(sp, fl, ro, grab, front) {
    const N = Skier.NTH;
    const deg = sp * 360;
    let base;
    if (fl && ro) base = sp ? 'BIO ' + deg
                : (Math.max(fl, ro) > 1 ? N[Math.max(fl, ro)] + 'BIO'
                                        : 'CORKED ' + (front ? 'FRONTFLIP' : 'BACKFLIP'));
    else if (ro)  base = sp ? (ro > 1 ? N[ro] + 'CORK ' : 'CORK ') + deg
                            : N[ro] + 'LINCOLN LOOP';
    else if (fl)  base = sp ? (fl > 1 ? N[fl] + 'MISTY ' : (front ? 'MISTY ' : 'RODEO ')) + deg
                            : N[fl] + (front ? 'FRONTFLIP' : 'BACKFLIP');
    else if (sp)  base = String(deg);
    else          base = grab ? 'GRAB' : 'AIR';
    if (grab && (sp + fl + ro)) base += grab === 2 ? ' TAIL' : ' MUTE';
    return base;
  }

  static gradeOf(q) {
    let out = Skier.LANDINGS[0];
    for (const g of Skier.LANDINGS) if (q >= g.min) out = g;
    return out;
  }

  constructor(opts = {}) {
    this.tune = Object.assign({}, Skier.TUNE, opts.tune || {});
    this.snow = opts.snow || { grip: 1, glide: 1, spray: 1, landing: 1 };

    this.group = new THREE.Group();     // physics: where you are, how you sit
    this.mesh = new THREE.Group();      // cosmetics: everything that wobbles
    this.group.add(this.mesh);

    this.fig = null;
    this.gear = null;
    if (opts.figure !== false) {
      this.fig = Figure.build(opts.look ? { look: opts.look, long: false }
                                        : { palette: opts.palette || 'claudia', long: false });
      this.mesh.add(this.fig);
      this.gear = Skier.addGear(this.fig, opts.paint || {}, opts.look || null);
    }

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector2();     // world XZ
    this.vy = 0;
    this.heading = 0;
    this.yawVel = 0;
    this.speed = 0;
    this.airborne = false;
    this.grounded = true;
    this.airTime = 0;
    this.lastAirTime = 0;
    this.airHeight = 0;                 // how far above the snow, this flight
    this.peakHeight = 0;

    // the one number the whole mission reads
    this.slip = 0;
    this.edge = 0;                      // -1..1, which edge and how hard
    this.carve = 0;                     // 0..1, how cleanly
    this.tuck = 0;
    this.braking = 0;
    this.crouch = 0;
    this.airRoll = 0; this.airPitch = 0; this.airYaw = 0;
    this.grab = 0;                      // 0..1, how deep a hand is on a ski
    this.boost = 0;                     // 0..1+, the pad under you right now
    this._auto = null;                  // the trick the mountain threw, if any
    /* Its own generator, so the same run throws the same tricks off the
       same lips on every machine in a party. `Math.random` here would
       have been three different mountains in one lobby. */
    this._tSeed = ((opts.trickSeed ?? 0x9e3779b9) >>> 0) || 1;
    this.roll = 0; this.pitch = 0;
    this.lean = 0; this.squat = 0; this.fold = 0;

    this.crashed = false;
    this.crashT = 0;
    this.crashReason = null;
    this.tumble = 0;

    // one-frame events, cleared at the top of every update
    this.launched = 0; this.landed = 0; this.popped = 0;
    this.bumped = null; this.crashedNow = null; this.lastTrick = null;

    this.groundY = 0;
    this._gyPrev = 0;
    this.sv = 0;
    this.relaunchT = 0;
    this.popT = 0;
    this.wasTrick = false;
    this.alive = true;

    this._n = { nx: 0, ny: 1, nz: 0, gx: 0, gz: 0 };
    this._fwd = new THREE.Vector2(0, 1);
    this._right = new THREE.Vector2(1, 0);
    this._e = new THREE.Euler();
    this._prevSpeed = 0;
  }

  /* Skis, poles, a helmet and goggles, hung off the rig's own joints so
     they move with the body rather than beside it. The skis are the
     important ones: they are what the eye reads the whole mission off,
     so they are long, bright and edged in a second colour that catches
     the light when the ski goes on edge. */
  static addGear(fig, paint = {}, look = null) {
    const rig = fig.userData && fig.userData.rig;
    if (!rig) return null;
    const L = look ? Look.resolve(look) : null;
    const accent = paint.accent || (L && L.accent) || '#ffd166';
    const trim = paint.trim || (L && L.trim) || '#e5133f';
    const lam = (c, extra) => new THREE.MeshLambertMaterial(
      Object.assign({ color: c, flatShading: true }, extra || {}));

    const skiMat = lam(accent);
    const edgeMat = lam('#e8f6ff', { emissive: '#bfe9ff', emissiveIntensity: 0.25 });
    const dark = lam('#1a1f28');
    const glass = lam(paint.glass || '#4fd8ff', {
      emissive: '#1fa6cc', emissiveIntensity: 0.55,
      transparent: true, opacity: 0.86,
    });

    const skis = {};
    for (const key of ['l', 'r']) {
      const ank = rig.legs[key] && rig.legs[key].ankle;
      if (!ank) continue;
      const holder = new THREE.Group();
      holder.position.set(0, -0.10, 0.02);
      ank.add(holder);

      const ski = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.035, 1.72), skiMat);
      ski.position.set(0, 0, 0.16);
      holder.add(ski);
      // the tip, turned up, which is most of what makes a box read as a ski
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.032, 0.26), skiMat);
      tip.position.set(0, 0.045, 1.06);
      tip.rotation.x = -0.42;
      holder.add(tip);
      // a bright steel edge along the base
      const skiEdge = new THREE.Mesh(new THREE.BoxGeometry(0.126, 0.014, 1.70), edgeMat);
      skiEdge.position.set(0, -0.022, 0.16);
      holder.add(skiEdge);
      const bind = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.075, 0.30), dark);
      bind.position.set(0, 0.05, 0.04);
      holder.add(bind);
      skis[key] = holder;
    }

    const poles = {};
    for (const key of ['l', 'r']) {
      const hand = rig.arms[key] && rig.arms[key].hand;
      if (!hand) continue;
      const pole = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.011, 1.24, 5), dark);
      shaft.position.set(0, -0.52, 0);
      pole.add(shaft);
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.022, 0.15, 6), lam(trim));
      grip.position.set(0, 0.03, 0);
      pole.add(grip);
      const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.018, 8), lam(trim));
      basket.position.set(0, -1.02, 0);
      pole.add(basket);
      pole.position.set(0, -0.03, 0.02);
      pole.rotation.x = 1.15;
      hand.add(pole);
      poles[key] = pole;
    }

    // helmet and goggles: they hide the face, which is exactly right for
    // somebody doing a hundred and thirty on a mountain
    const head = rig.head;
    let goggles = null;
    if (head) {
      const helm = new THREE.Mesh(new THREE.SphereGeometry(0.128, 14, 10,
        0, Math.PI * 2, 0, Math.PI * 0.62), lam(trim));
      helm.position.set(0, 0.028, 0);
      helm.scale.set(1.06, 1.14, 1.10);
      head.add(helm);
      goggles = new THREE.Mesh(new THREE.BoxGeometry(0.225, 0.085, 0.055), glass);
      goggles.position.set(0, 0.018, 0.098);
      head.add(goggles);
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.238, 0.045, 0.205), lam('#20252e'));
      strap.position.set(0, 0.022, 0.005);
      head.add(strap);
    }

    // a race bib, so three skiers on one mountain are three people
    if (rig.chest) {
      const bib = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.30, 0.035), lam(accent));
      bib.position.set(0, 0.22, 0.115);
      rig.chest.add(bib);
    }

    return { skis, poles, goggles, mats: [skiMat, edgeMat, dark, glass] };
  }

  place(x, z, heading, world) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0);
    this.vy = 0;
    this.heading = heading;
    this.yawVel = 0;
    this.speed = 0;
    this.airborne = false; this.grounded = true;
    this.airTime = 0; this.airRoll = this.airPitch = this.airYaw = 0;
    this.roll = this.pitch = 0;
    this.slip = 0; this.edge = 0; this.carve = 0;
    this.tuck = 0; this.braking = 0; this.crouch = 0;
    this.crashed = false; this.crashT = 0; this.tumble = 0;
    this.grab = 0; this.boost = 0; this._auto = null;
    this.sv = 0;
    const gy = this.sampleGround(x, z, Math.sin(heading), Math.cos(heading), world);
    this.groundY = gy;
    this._gyPrev = gy;
    this.pos.y = gy;
    this.group.position.copy(this.pos);
  }

  get speed01() { return U.clamp(this.speed / this.tune.topSpeed, 0, 1.4); }
  get kmh() { return this.speed * 3.6; }

  /* The snow under a ski, not under a point. Averaging along the ski's
     own length is the difference between a mogul field you can read and
     one that machine-guns you into the air. */
  sampleGround(x, z, fx, fz, world) {
    const face = world && world.face;
    if (!face) return 0;
    const L = this.tune.skiHalf;
    return (face.heightAt(x - fx * L, z - fz * L)
          + face.heightAt(x, z)
          + face.heightAt(x + fx * L, z + fz * L)) / 3;
  }

  /* ---------------------------------------------------------------
     `ctl` is a plain object, never Input: the mission owns the
     keyboard and this owns the skiing.

       steer     -1..1
       throttle  1 = tuck, -1 = check/brake
       trick     bool — held on the snow is a crouch, held in the air
                 is a rotation, and the release is the interesting half
  --------------------------------------------------------------- */
  update(dt, ctl, world) {
    if (!(dt > 0)) return;
    this.launched = 0; this.landed = 0; this.popped = 0;
    this.threw = 0; this.spun = 0;
    this.bumped = null; this.crashedNow = null; this.lastTrick = null;

    const step = this.tune.subStep;
    let left = Math.min(dt, 0.25);
    while (left > 1e-5) {
      const h = Math.min(step, left);
      this._step(h, ctl, world);
      left -= h;
    }
    this._cosmetics(dt);
  }

  _step(dt, ctl, world) {
    const T = this.tune;
    const SN = this.snow;
    this.relaunchT = Math.max(0, this.relaunchT - dt);
    this.popT = Math.max(0, this.popT - dt);

    /* ---- a crash is a passenger seat, not a pause ----
       You keep sliding, because you are on a mountain and gravity has
       not stopped caring. Bleeding the velocity to nothing instead —
       which is what this did first — meant every fall cost twelve
       seconds: a second and a half on the floor and ten more building
       back up to speed from a standstill on a slope. Sliding out of it
       at eight or nine metres a second is both what actually happens
       and a punishment a run can survive. */
    if (this.crashed) {
      this.crashT -= dt;
      this.tumble += dt * (6 + this.speed * 0.5);
      const fc = world && world.face;
      if (fc) {
        const nc = fc.normalAt(this.pos.x, this.pos.z, this._n);
        const mm = nc.gx * nc.gx + nc.gz * nc.gz;
        const kk = T.gravity / (1 + mm);
        this.vel.x += kk * nc.gx * dt;
        this.vel.y += kk * nc.gz * dt;
      }
      this.vel.multiplyScalar(Math.exp(-0.85 * dt));
      this.speed = this.vel.length();
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.y * dt;
      const gyC = this.sampleGround(this.pos.x, this.pos.z, 0, 1, world);
      this.groundY = gyC;
      this.pos.y = U.damp(this.pos.y, gyC, 12, dt);
      if (this.crashT <= 0) {
        this.crashed = false;
        this.tumble = 0;
        this.crouch = 0;
        this.airRoll = this.airPitch = this.airYaw = 0;
        this._gyPrev = gyC;
        this.sv = 0;
      }
      return;
    }

    const steer = U.clamp(ctl.steer ?? 0, -1, 1);
    const thr = U.clamp(ctl.throttle ?? 0, -1, 1);
    const trick = !!ctl.trick;

    // ---- posture: tuck and check, both damped so they read as a body ----
    const wantTuck = this.airborne ? this.tuck * 0.9 : Math.max(0, thr);
    const wantBrake = this.airborne ? 0 : Math.max(0, -thr);
    this.tuck = U.damp(this.tuck, wantTuck, 7, dt);
    this.braking = U.damp(this.braking, wantBrake, 12, dt);

    // ---- the ground ----
    this._fwd.set(Math.sin(this.heading), Math.cos(this.heading));
    this._right.set(this._fwd.y, -this._fwd.x);
    const face = world && world.face;
    const n = face ? face.normalAt(this.pos.x, this.pos.z, this._n) : this._n;

    /* ---- the trick button ----
       On the snow it is a crouch you are storing; the frame you let go
       of it, that store becomes an ollie off whatever you are stood on.

       In the air it is one press, one trick, and that is the whole of
       it. It used to be a held modality — hold it and steer to spin,
       hold it and tuck to flip, let go to snap square — which is a fine
       system and which almost nobody ever operated, because it asks a
       player to perform fine motor control during the one second of the
       mission when the camera is moving fastest and the ground is a
       long way off. Now the press composes something and lands it, and
       the skill it asks for is the one it should have been asking for
       all along: getting to the lip fast, with height, pointing
       somewhere worth pointing. */
    if (!this.airborne) {
      if (trick) this.crouch = Math.min(1, this.crouch + dt / T.popCharge);
      else if (this.wasTrick && this.crouch > 0.10 && this.popT <= 0) {
        this._launch(world, this.crouch, true);
      } else this.crouch = U.damp(this.crouch, 0, 9, dt);
    } else if (trick && !this.wasTrick) {
      this.throwTrick();
    }
    this.wasTrick = trick;

    // ---- steering ----
    const sp = this.vel.length();
    this.speed = sp;
    const speedFactor = U.smoothstep(0, 4.5, sp)
                      * U.lerp(1, T.turnLowSpeed, U.clamp(sp / T.topSpeed, 0, 1));
    /* Steering stays live in the air. With the rotation no longer bound
       to the same key, A and D get their real job back: pointing the
       skis at wherever the landing is going to be. */
    const post = this.airborne
      ? T.airYawGain
      : U.lerp(1, T.tuckTurn, this.tuck) * U.lerp(1, T.brakeTurn, this.braking);
    const targetYaw = -steer * T.turnRate * speedFactor * post;
    this.yawVel = U.damp(this.yawVel, targetYaw, 9, dt);
    this.heading += this.yawVel * dt;
    if (this.airborne) this.airYaw += this.yawVel * dt;
    this._fwd.set(Math.sin(this.heading), Math.cos(this.heading));
    this._right.set(this._fwd.y, -this._fwd.x);

    /* ---- the edge ----
       Recomputed in the *new* basis, which is where the slip comes
       from: the skis have turned and the velocity has not, so whatever
       is left over sideways is exactly how much the edge is being asked
       to hold. Nothing here is a fudge term. */
    let vf = this.vel.x * this._fwd.x + this.vel.y * this._fwd.y;
    let vl = this.vel.x * this._right.x + this.vel.y * this._right.y;

    if (!this.airborne) {
      // gravity, along the snow. On a plane of gradient m the horizontal
      // acceleration is g·grad/(1+|grad|²) — no more, and a lot less than
      // the g people expect, which is why `gravity` is not 9.81.
      const m2 = n.gx * n.gx + n.gz * n.gz;
      const k = T.gravity / (1 + m2);
      const ax = k * n.gx, az = k * n.gz;
      vf += (ax * this._fwd.x + az * this._fwd.y) * dt;
      vl += (ax * this._right.x + az * this._right.y) * dt;

      // the edge holds, or it does not
      const grip = T.grip * SN.grip * U.lerp(1, T.brakeGrip, this.braking);
      vl *= Math.exp(-grip * dt);

      // ...and the snow charges for whatever it did not hold
      const slip = Math.abs(vl);
      const scrub = (T.scrub * slip + T.scrubQuad * slip * slip
                     + T.brakeScrub * sp * this.braking) / Math.max(SN.glide, 0.2);
      vf -= Math.sign(vf || 1) * scrub * dt;

      /* ---- the pads ----
         Along the skis, not along the ramp, which is what makes driving
         up the middle of one worth more than clipping its corner: the
         pad gives you metres per second and you decide which direction
         they point. It fades out towards the ceiling so a run that
         strings six of them together asymptotes instead of leaving the
         mountain entirely. */
      const bAmt = face && face.boostAmount ? face.boostAmount(this.pos.x, this.pos.z) : 0;
      this.boost = bAmt;
      if (bAmt > 0.02 && vf > -0.5) {
        vf += T.rampBoost * bAmt * dt
            * (1 - U.smoothstep(T.boostCeil * 0.72, T.boostCeil, Math.abs(vf)));
      }

      // and drag: the tuck is the single biggest dial a player owns
      const q = U.lerp(T.standDrag, T.tuckDrag, this.tuck) / Math.max(SN.glide, 0.2);
      vf -= Math.sign(vf || 1) * (T.linDrag * Math.abs(vf) / SN.glide + q * vf * vf) * dt;
      if (vf < 0) vf *= Math.exp(-4 * dt);       // you do not ski backwards
    } else {
      this.airTime += dt;
      vf -= Math.sign(vf || 1) * T.airDrag * vf * vf * dt;
      vl *= Math.exp(-0.35 * dt);
      // the trail off a pad outlives the pad by half a second
      this.boost = U.damp(this.boost, 0, 5, dt);
    }

    this.slip = U.damp(this.slip, Math.abs(vl), 14, dt);
    this.edge = U.damp(this.edge, U.clamp(-this.yawVel * 1.5, -1, 1), 10, dt);
    // a clean carve is a lot of turn for very little slip
    this.carve = U.clamp(Math.abs(this.yawVel) * 1.4 - this.slip * 0.075, 0, 1)
               * (this.airborne ? 0 : 1);

    this.vel.set(this._fwd.x * vf + this._right.x * vl,
                 this._fwd.y * vf + this._right.y * vl);
    this.speed = this.vel.length();

    // ---- move ----
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;

    if (world) this._collide(dt, world);

    // ---- vertical: on the snow, or off it ----
    const gy = this.sampleGround(this.pos.x, this.pos.z, this._fwd.x, this._fwd.y, world);
    this.groundY = gy;
    const svRaw = (gy - this._gyPrev) / dt;
    this._gyPrev = gy;
    this.sv = U.damp(this.sv, svRaw, 24, dt);

    if (!this.airborne) {
      /* Do we leave? Geometrically, not by differentiating a spike: the
         snow behind is what the ski is riding and the snow ahead is
         where it is going, and if the curvature between them demands a
         downward acceleration bigger than gravity, then the mountain
         has stopped being able to hold us and we are flying.

           a = v² · d(slope)/ds

         which is frame-rate independent, reads correctly off a cliff
         and off a two-metre roller, and needs no fudge factor. */
      const back = Math.max(1.5, this.speed * 0.05);
      const ahead = Math.max(1.8, this.speed * 0.06);
      const gB = this.sampleGround(this.pos.x - this._fwd.x * back * 2,
                                   this.pos.z - this._fwd.y * back * 2, this._fwd.x, this._fwd.y, world);
      const gb = this.sampleGround(this.pos.x - this._fwd.x * back,
                                   this.pos.z - this._fwd.y * back, this._fwd.x, this._fwd.y, world);
      const gA = this.sampleGround(this.pos.x + this._fwd.x * ahead,
                                   this.pos.z + this._fwd.y * ahead, this._fwd.x, this._fwd.y, world);
      const slopeBack = (gb - gB) / back;
      const slopeAhead = (gA - gy) / ahead;
      this._slopeBack = slopeBack;
      this._slopeAhead = slopeAhead;
      const curv = (slopeAhead - slopeBack) / (back + ahead);
      const demand = this.speed * this.speed * curv;
      if (demand < -T.gravity * T.launchK && this.speed > T.launchSpeed
          && this.relaunchT <= 0) {
        this._launch(world, this.crouch * T.holdPop, false);
      } else {
        this.pos.y = gy;
        this.vy = this.sv;
      }
    }

    if (this._auto && this.airborne) this._advanceTrick(dt, gy);

    if (this.airborne) {
      this.vy -= T.liftG * dt;
      this.pos.y += this.vy * dt;
      this.airHeight = this.pos.y - gy;
      this.peakHeight = Math.max(this.peakHeight, this.airHeight);
      if (this.pos.y <= gy) {
        this.pos.y = gy;
        this._touchdown(world, n);
      }
    }
    this.grounded = !this.airborne;

    // ---- attitude ----
    if (!this.airborne) {
      const nRight = n.nx * this._right.x + n.nz * this._right.y;
      const nFwd = n.nx * this._fwd.x + n.nz * this._fwd.y;
      // stand square to the snow, then lean into the turn on top of it
      const tRoll = Math.atan2(nRight, n.ny) * 0.85
                  - U.clamp(this.yawVel * this.speed * 0.019, -0.62, 0.62);
      const tPitch = -Math.atan2(nFwd, n.ny) * 0.92;
      this.roll = U.damp(this.roll, U.clamp(tRoll, -0.95, 0.95), 8, dt);
      this.pitch = U.damp(this.pitch, U.clamp(tPitch, -0.85, 0.85), 7.5, dt);
    } else {
      // no clamp in the air: a rotation has to be able to wind past a
      // half turn or a flip stalls on its back
      const arc = U.clamp(-this.vy * 0.020, -0.34, 0.34);
      /* Fifteen rather than eleven: a double cork moves its target at
         eight radians a second and a lazy follow was landing the body a
         fifth of a turn behind the trick it had just done — which the
         landing grade then read, correctly, as sideways. */
      this.roll = U.damp(this.roll, this.yawVel * 0.20 + this.airRoll, 15, dt);
      this.pitch = U.damp(this.pitch, arc * (this.airPitch !== 0 ? 0.3 : 1) + this.airPitch, 15, dt);
    }
  }

  /* Leaving the snow, from a lip or from your own legs. `pop` is how
     much of the stored crouch is being spent — a full one on a release,
     a third of one if you never let go, which is the whole timing
     game in one argument. */
  _launch(world, pop, ollie, lift = 0) {
    const T = this.tune;
    const slope = this._slopeBack ?? 0;
    const fromRamp = Math.max(0, this.speed * slope);
    const fromLegs = T.popVy * U.clamp(pop, 0, 1);
    /* What you left, if you left anything. A pad's boost has been going
       into speed the whole way up the run-up; the lip is where the last
       of it turns into height, which is the only reason to aim at the
       middle of one rather than clip the edge. */
    const face = world && world.face;
    const ramp = face && face.rampUnder ? face.rampUnder(this.pos.x, this.pos.z) : null;
    const bst = ramp && ramp.boost ? U.clamp(ramp.boost, 0, 2) : 0;

    this.airborne = true;
    this.airTime = 0;
    this.airHeight = 0;
    this.peakHeight = 0;
    this.vy = (ollie ? Math.max(fromRamp, this.speed * slope) : this.speed * slope)
            + fromLegs + T.rampPop * bst + lift;
    this.relaunchT = T.relaunchCd;
    this.popT = T.popCd;
    this.launched = Math.max(0.05, U.clamp(this.vy / 16, 0, 1.4));
    this.popped = U.clamp(pop, 0, 1);
    this.crouch = 0;
    this.airRoll = this.airPitch = this.airYaw = 0;
    this.grab = 0;

    /* ---- how long this is going to last ----
       Not 2v/g: the snow is running away underneath at `sink` metres a
       second the whole time, and on a thirty per cent pitch at forty
       that is more airtime than the launch itself provided. Solving

         ½gt² = (v + sink)·t

       is the whole of it, and getting this right is the difference
       between a trick book that lands and one that guesses. */
    const sink = Math.max(0, -(this._slopeAhead ?? 0)) * this.speed;
    let air = U.clamp(2 * (this.vy + sink) / T.liftG, 0, 5);
    this._auto = null;

    if (air >= T.autoAir) {
      const tk = this._composeTrick(air * T.autoFill);

      /* ---- the lip finds the room ----
         Nothing filters what gets composed by how big the jump was, so
         a triple cork can come up off a two-metre roller — and rather
         than spin it at thirty radians a second and call that a trick,
         the ramp simply sends you higher. Solve the hang time the trick
         wants back into a launch speed and top up towards it, capped,
         and weighted by the pad under the lip: a boost ramp finds nine
         metres a second for a big one, a bare roller finds half that.

         This is the line that makes the kickers feel like the point of
         the mountain. You come off one, something enormous unfolds, and
         the reason it had room to unfold is the ramp. */
      if (tk.need > air * T.autoFill) {
        const want = (tk.need / T.autoFill) * T.liftG * 0.5 - sink;
        const room = T.trickLift * (0.45 + 0.55 * U.clamp(bst, 0, 1.6));
        this.vy = U.clamp(want, this.vy, this.vy + room);
        air = U.clamp(2 * (this.vy + sink) / T.liftG, 0, 5);
        this.launched = Math.max(0.05, U.clamp(this.vy / 16, 0, 1.4));
      }
      this._start(tk, air * T.autoFill);
    }
    this.lastAirEst = air;
  }

  // the skier's own LCG: one number in, one number out, no globals, so
  // three machines in a party throw the same tricks off the same lips
  _roll01() {
    this._tSeed = (Math.imul(this._tSeed, 1664525) + 1013904223) >>> 0;
    return this._tSeed / 4294967296;
  }

  /* Three axes, weighted towards the small end, then trimmed to what
     `budget` seconds can actually turn at a rate the eye can follow.
     The trimming is what lets the composer be greedy: it can ask for a
     quad cork off a kerb and get back a 360, without anything having
     had to know how big the kerb was. */
  _composeTrick(budget) {
    const T = this.tune;
    const r = () => this._roll01();
    // pow(x, bias) with bias > 1 skews low: mostly ones and twos, and
    // the big ones stay rare enough to still be an event
    const draw = (max, bias) => Math.min(max, Math.floor(Math.pow(r(), bias) * (max + 1)));
    const fit = (n, rate) => Math.max(0, Math.min(n, Math.floor(budget * rate / U.TAU + 0.04)));

    let sp = fit(draw(4, 1.35), T.airSpinRate);
    let fl = fit(draw(2, 2.30), T.airFlipRate);
    let ro = fit(draw(2, 2.55), T.airRollRate);
    const front = r() < 0.32;
    // a grab is the answer to a jump with no room for anything else, so
    // it is likeliest exactly when nothing else fitted
    const grab = (sp + fl + ro) === 0 ? (r() < 0.55 ? 2 : 1)
               : (r() < 0.42 ? (r() < 0.4 ? 2 : 1) : 0);

    const need = Math.max(sp * U.TAU / T.airSpinRate,
                          fl * U.TAU / T.airFlipRate,
                          ro * U.TAU / T.airRollRate, 0.18);
    return {
      spins: sp, flips: fl, rolls: ro, grab, need,
      yaw: sp * (r() < 0.5 ? 1 : -1),
      pitch: fl * (front ? 1 : -1),
      roll: ro * (r() < 0.5 ? 1 : -1),
      name: Skier.nameTrick(sp, fl, ro, grab, front),
    };
  }

  /* Start one, from wherever the body already is. The targets are the
     current rotation rounded to a whole turn plus the turns asked for,
     which is the bit that makes re-throwing mid-flight seamless: a new
     trick thrown a third of the way through the last one absorbs that
     third rather than snapping through it. */
  _start(tk, budget) {
    const y0 = this.airYaw, p0 = this.airPitch, r0 = this.airRoll;
    const whole = (v) => Math.round(v / U.TAU) * U.TAU;
    this._auto = {
      y0, p0, r0,
      y1: whole(y0) + tk.yaw * U.TAU,
      p1: whole(p0) + tk.pitch * U.TAU,
      r1: whole(r0) + tk.roll * U.TAU,
      spins: tk.spins, flips: tk.flips, rolls: tk.rolls,
      front: tk.pitch > 0, grab: tk.grab, name: tk.name,
      dur: Math.max(0.22, Math.min(budget, tk.need * 1.35)),
      t: 0,
    };
    this.threw = 1;
    return this._auto;
  }

  /* Pressing it again, while something is already turning. It adds to
     what is going round rather than restarting it, which is the whole
     difference between a button that does something and a button that
     cancels itself: mashing this used to compose a fresh trick out of
     the two tenths of a second that were left, and two tenths of a
     second buys a grab, so a player leaning on the key got thirty
     grabs in a row and concluded the key was broken.

     It rebases on the way through — the pose you are in becomes the new
     start — so the rotation never steps backwards when the clock it is
     measured against changes underneath it. */
  _addTurn(budget) {
    const T = this.tune;
    const a = this._auto;
    const dur = Math.max(0.20, budget);
    const dir = (v, base) => Math.sign(v - base) || 1;

    /* Room is measured against what is *left to turn*, not against the
       size of the trick. The difference matters: a 720 that is already
       three quarters round has almost no rotation outstanding, so there
       is room to add to it — and asking whether a 1080 fits in the
       remaining quarter second, which is what the size test asks, would
       always have said no. Getting this wrong is a landing that arrives
       mid-flip, so it is worth the six lines. */
    const fits = (y1, p1, r1) =>
      Math.abs(y1 - this.airYaw) / T.airSpinRate <= dur
      && Math.abs(p1 - this.airPitch) / T.airFlipRate <= dur
      && Math.abs(r1 - this.airRoll) / T.airRollRate <= dur;

    const picks = [];
    if (fits(a.y1 + U.TAU * dir(a.y1, a.y0), a.p1, a.r1)) picks.push(0);
    if (fits(a.y1, a.p1 + U.TAU * (a.front ? 1 : -1), a.r1)) picks.push(1);
    if (fits(a.y1, a.p1, a.r1 + U.TAU * dir(a.r1, a.r0))) picks.push(2);
    if (!picks.length) {
      // no room for another turn: the only thing left to add is style
      if (a.grab === 2) return null;
      a.grab = a.grab ? 2 : 1;
    } else {
      const k = picks[Math.min(picks.length - 1, Math.floor(this._roll01() * picks.length))];
      if (k === 0) { a.spins++; a.y1 += U.TAU * dir(a.y1, a.y0); }
      if (k === 1) { a.flips++; a.p1 += U.TAU * (a.front ? 1 : -1); }
      if (k === 2) { a.rolls++; a.r1 += U.TAU * dir(a.r1, a.r0); }
    }
    a.y0 = this.airYaw; a.p0 = this.airPitch; a.r0 = this.airRoll;
    a.t = 0;
    a.dur = dur;
    a.name = Skier.nameTrick(a.spins, a.flips, a.rolls, a.grab, a.front);
    this.threw = 1;
    return a;
  }

  /* The button, in the air. One press, one trick — no held modality, no
     axis to steer, nothing to learn. It composes from the air you have
     left, so mashing it near the snow gets you a grab and pressing it
     at the top of a cliff drop gets you something absurd, and either
     way it lands. */
  throwTrick() {
    const T = this.tune;
    if (!this.airborne) return null;
    const drop = Math.max(0, this.pos.y - this.groundY);
    const tG = (this.vy + Math.sqrt(Math.max(0, this.vy * this.vy + 2 * T.liftG * drop)))
             / T.liftG;
    const budget = Math.max(0.20, tG * T.autoFill);
    const a = this._auto;
    if (a && a.t < a.dur) return this._addTurn(budget);
    return this._start(this._composeTrick(budget), budget);
  }

  /* A spinner: it hands you speed, height and a fresh trick, which is
     the whole reason to aim at one rather than past it. */
  spinnerHit(power = 1) {
    const T = this.tune;
    const p = U.clamp(power, 0, 2);
    this.vel.multiplyScalar(1 + 0.10 * p);
    this.speed = this.vel.length();
    if (this.airborne) {
      this.vy += T.spinnerLift * p;
      this.throwTrick();
    }
    this.spun = 1;
  }

  /* An automatic rotation is aimed at the snow rather than at a
     stopwatch. Every sub-step it re-solves, ballistically and against
     the ground height actually under it right now, how long is left
     before touchdown — and shortens the trick to fit inside that.

     That one line is what makes any of this landable. A jump that came
     up short does not put you down halfway through a backflip; it makes
     you check the rotation and get it round, which is also what a skier
     would do about it. The player never sees the mechanism and never
     has to: tricks simply land. */
  _advanceTrick(dt, gy) {
    const T = this.tune;
    const a = this._auto;
    const drop = Math.max(0, this.pos.y - gy);
    const tG = (this.vy + Math.sqrt(Math.max(0, this.vy * this.vy + 2 * T.liftG * drop)))
             / T.liftG;
    /* The floor is not there to be tidy. The body follows the rotation
       through a damper, and a trick checked into six hundredths of a
       second leaves that damper a fifth of a turn behind at touchdown —
       which the landing then grades, correctly and unfairly, as
       sideways. Sixteen hundredths is about what the damper can track. */
    a.dur = Math.max(a.t + 0.16, Math.min(a.dur, a.t + tG * T.autoFill));
    a.t = Math.min(a.dur, a.t + dt);

    /* Part-eased, not smoothstepped. A full smoothstep peaks at one and
       a half times the average rate, which on a 1080 is a rotation the
       eye reads as a glitch; this peaks at about one and a quarter and
       still reads as a body winding up and checking out of it. */
    const x = a.dur > 0 ? U.clamp(a.t / a.dur, 0, 1) : 1;
    const u = U.lerp(x, x * x * (3 - 2 * x), 0.45);
    this.airYaw = U.lerp(a.y0, a.y1, u);
    this.airPitch = U.lerp(a.p0, a.p1, u);
    this.airRoll = U.lerp(a.r0, a.r1, u);
    // the hand comes off the ski before the skis come back to the snow
    const want = (a.grab && x < 0.82) ? (a.grab === 2 ? 1.0 : 0.62) : 0;
    this.grab = U.damp(this.grab, want, 9, dt);
  }

  _touchdown(world, n) {
    const T = this.tune;
    const SN = this.snow;
    const air = this.airTime;
    const impact = Math.abs(this.vy);

    const offRoll = Math.abs(U.wrapAngle(this.roll));
    const offPitch = Math.abs(U.wrapAngle(this.pitch));
    const level = 1 - U.clamp(Math.max(offRoll, offPitch) / T.landTolerance, 0, 1);

    // where the velocity is pointing, against where the skis are
    const vAng = Math.atan2(this.vel.x, this.vel.y);
    const drift = Math.abs(U.wrapAngle(vAng - this.heading));
    const square = 1 - U.clamp(drift / T.driftTolerance, 0, 1);

    // and how hard it came down, which powder forgives and ice does not
    const soft = 1 - U.smoothstep(T.hardVy, T.hardVy * 1.9, impact) * (1.5 - SN.landing * 0.6);

    let q = U.clamp(level * 0.55 + square * 0.45, 0, 1) * U.clamp(soft, 0, 1);
    q *= U.lerp(0.86, 1.06, U.clamp(SN.landing, 0, 1.6) / 1.6);
    if (air < 0.20) q = Math.max(q, 0.80);        // a hop is not a trick to blow

    const grade = Skier.gradeOf(q);
    const spins = Math.abs(this.airYaw) / U.TAU;
    const flips = Math.abs(this.airPitch) / U.TAU;
    const rolls = Math.abs(this.airRoll) / U.TAU;

    this.lastTrick = {
      air, impact, quality: q, grade,
      height: this.peakHeight,
      // the name the book gave it, if the mountain threw it and the
      // player left it alone — otherwise the mission builds one
      name: this._auto ? this._auto.name : null,
      grabbed: this._auto ? !!this._auto.grab : false,
      spins: Math.floor(spins + 0.06),
      flips: Math.floor(flips + 0.06),
      rolls: Math.floor(rolls + 0.06),
      spinFrac: spins, flipFrac: flips, rollFrac: rolls,
      landed: grade.id !== 'crash',
      stomped: grade.id === 'stomped',
      dir: this.airYaw >= 0 ? 1 : -1,
    };

    this.airborne = false;
    this.lastAirTime = air;
    this.landed = U.clamp(impact / 24, 0.05, 1.4);
    this.relaunchT = T.relaunchCd;
    this.roll = U.wrapAngle(this.roll);
    this.pitch = U.wrapAngle(this.pitch);
    this.airYaw = this.airRoll = this.airPitch = 0;
    this._auto = null;
    this.grab = 0;
    this.airTime = 0;
    this.vy = 0;
    this.squat = Math.min(0.85, this.squat + this.landed * 0.7);
    this._gyPrev = this.pos.y;
    this.sv = 0;

    if (grade.id === 'crash') { this._crash('LANDING'); return; }
    // a bad landing is speed you gave back, which is worse than it sounds
    const vf = this.vel.x * this._fwd.x + this.vel.y * this._fwd.y;
    const kept = vf * grade.keep;
    this.vel.set(this._fwd.x * kept, this._fwd.y * kept);
    this.speed = Math.abs(kept);
  }

  _crash(reason) {
    if (this.crashed) return;
    this.crashed = true;
    this.crashedNow = reason || 'CRASH';
    this.crashReason = this.crashedNow;
    this.crashT = this.tune.crashTime;
    this.airborne = false;
    this.tumble = 0;
    this.vel.multiplyScalar(0.45);
    this.speed = this.vel.length();
    this.vy = 0;
    this.slip = 0; this.carve = 0; this.crouch = 0;
    this.airYaw = this.airRoll = this.airPitch = 0;
    this._auto = null;
    this.grab = 0;
  }

  /* Trees, rocks and the sides of the valley. A tree at speed is a
     crash; a tree at walking pace is a shove, because the alternative
     is a run that ends because you were tidying up your line. */
  _collide(dt, world) {
    const T = this.tune;
    if (world.colliders) {
      const clear = this.pos.y - this.groundY;
      for (const c of world.colliders) {
        if (c.kind === 'rock' && this.airborne && clear > c.r * 1.6) continue;
        const dx = this.pos.x - c.x, dz = this.pos.z - c.z;
        const rr = c.r + T.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 > rr * rr) continue;
        const d = Math.sqrt(d2) || 1e-3;
        const nx = dx / d, nz = dz / d;
        this.pos.x = c.x + nx * rr;
        this.pos.z = c.z + nz * rr;
        const vn = this.vel.x * nx + this.vel.y * nz;
        if (vn >= 0) continue;
        const force = -vn;
        this.bumped = { kind: c.kind, force, x: c.x, z: c.z };
        if (force > T.crashSpeed) { this._crash(c.kind === 'tree' ? 'TREE' : 'ROCK'); return; }
        this.vel.x -= nx * vn * 1.5;
        this.vel.y -= nz * vn * 1.5;
        this.vel.multiplyScalar(U.lerp(1, 0.55, U.clamp(force / T.crashSpeed, 0, 1)));
      }
    }
    // the edge of the built world, as a wall you scrape along
    const face = world.face;
    if (face) {
      const cx = face.cxAt(this.pos.z);
      const lat = this.pos.x - cx;
      const lim = face.edge - 14;
      if (Math.abs(lat) > lim) {
        const s = Math.sign(lat);
        this.pos.x = cx + s * lim;
        const vn = this.vel.x * s;
        if (vn > 0) {
          this.vel.x -= s * vn * 1.3;
          this.vel.multiplyScalar(0.86);
          this.bumped = { kind: 'wall', force: vn, x: this.pos.x, z: this.pos.z };
        }
      }
    }
  }

  /* =============== the body ===============
     Everything below is a lie told at sixty frames a second and none of
     it touches the physics. It is also most of what a player thinks the
     physics is. */
  _cosmetics(dt) {
    const accel = (this.speed - this._prevSpeed) / Math.max(dt, 1e-4);
    this._prevSpeed = this.speed;

    this.squat = U.damp(this.squat, 0, 6.5, dt);
    this.lean = U.damp(this.lean,
      U.clamp(-this.yawVel * this.speed * 0.014, -0.34, 0.34), 6, dt);
    // how folded up: a tuck, a stored pop, and a landing all fold you
    const wantFold = U.clamp(this.tuck * 0.75 + this.crouch * 0.9
                     + this.squat * 0.8 + this.braking * 0.30, 0, 1.5);
    this.fold = U.damp(this.fold, wantFold, 11, dt);

    this.group.position.copy(this.pos);
    this._e.set(this.pitch, this.heading, this.roll, 'YXZ');
    this.group.quaternion.setFromEuler(this._e);

    if (this.crashed) {
      // a yard sale: the whole body tumbles and the mesh does the lying
      this.mesh.rotation.set(this.tumble * 1.5, this.tumble * 0.8, this.tumble * 1.15);
      this.mesh.position.y = -0.35 - Math.sin(this.tumble * 2) * 0.12;
    } else {
      /* The spin lives here, on the cosmetic group, and not on the
         physics one. It was on neither: `airYaw` was being counted at
         touchdown and paid for, and the body it belonged to never
         turned an inch — every spin in the mission was a number in the
         corner of the screen. Yaw is safe to lie about because nothing
         downstream reads it: the skis still point along `heading`, the
         edge is still computed in that basis, and a landing is still
         graded on roll, pitch and drift. */
      this.mesh.rotation.set(0, this.airYaw, this.lean * 0.55);
      this.mesh.position.y = -this.squat * 0.22;
    }

    const fig = this.fig;
    if (!fig || !fig.userData.rig) return;
    const r = fig.userData.rig;
    const f = this.fold;
    const air = this.airborne ? 1 : 0;
    // a grab is knees up and a hand down, and it is the single cheapest
    // thing in the file that makes a jump look like a trick
    const gr = this.grab;

    /* The stance. A skier is a hinge: ankles, knees, hips and shoulders
       all fold in the same direction, and how far they fold is the
       single thing that tells you whether somebody is racing or
       surviving. */
    for (const key of ['l', 'r']) {
      const L = r.legs[key];
      if (!L) continue;
      const side = key === 'l' ? -1 : 1;
      L.pivot.rotation.x = -0.30 - f * 0.78 - gr * 0.34;
      L.pivot.rotation.z = side * (0.035 + f * 0.05) - this.edge * 0.10 * side
                         + side * gr * 0.16;
      L.knee.rotation.x = 0.52 + f * 1.02 + gr * 0.85;
      L.ankle.rotation.x = 0.10 + f * 0.10 - this.pitch * 0.30 + gr * 0.20;
      // the outside ski takes the load in a turn: it goes on edge harder
      const load = U.clamp(-this.yawVel * side * 1.4, -0.4, 0.55);
      if (this.gear && this.gear.skis[key]) {
        this.gear.skis[key].rotation.z = U.damp(this.gear.skis[key].rotation.z,
          this.edge * 0.42 + load * 0.30, 12, dt);
        this.gear.skis[key].rotation.x = air ? -0.22 : 0;
      }
    }
    r.hips.position.y = fig.userData.stand - f * 0.26;
    r.hips.rotation.z = this.lean * 0.22;
    if (r.spine) r.spine.rotation.x = -(0.16 + f * 0.34);
    if (r.chest) {
      r.chest.rotation.x = -(0.14 + f * 0.30) + air * 0.10;
      r.chest.rotation.y = -this.yawVel * 0.16;
    }
    // the head stays looking down the hill however folded the rest is
    if (r.head) {
      r.head.rotation.x = (0.30 + f * 0.62) * 0.80 - this.pitch * 0.4;
      r.head.rotation.y = U.clamp(-this.yawVel * 0.30, -0.4, 0.4);
    }

    for (const key of ['l', 'r']) {
      const A = r.arms[key];
      if (!A) continue;
      const side = key === 'l' ? -1 : 1;
      // hands forward and low in a tuck, out and wide in the air
      // the trailing hand reaches for the ski; the other one counters
      const reach = key === 'r' ? gr : gr * 0.30;
      A.pivot.rotation.x = -0.55 - f * 0.55 + air * 0.25 + reach * 1.15;
      A.pivot.rotation.z = side * (0.16 + f * 0.10) - air * side * 0.42
                         + side * reach * 0.30;
      A.fore.rotation.x = -0.95 - f * 0.55 + air * 0.30 + reach * 0.55;
      if (this.gear && this.gear.poles[key]) {
        const p = this.gear.poles[key];
        p.rotation.x = U.damp(p.rotation.x, 1.15 + f * 0.55 + air * 0.30, 9, dt);
        p.rotation.z = U.damp(p.rotation.z, side * (0.18 + air * 0.30), 9, dt);
      }
    }
  }

  /* Where the snow comes off, in world space: the inside edge of
     whichever ski is doing the work. The mission asks for this every
     frame and turns it into spray, so it has to be a real place on the
     body rather than the middle of the skier. */
  edgePoint(out = new THREE.Vector3()) {
    const side = this.edge >= 0 ? 1 : -1;
    const off = 0.42 * side;
    out.set(this.pos.x + this._right.x * off - this._fwd.x * 0.5,
            this.pos.y + 0.05,
            this.pos.z + this._right.y * off - this._fwd.y * 0.5);
    return out;
  }

  get fwd() { return this._fwd; }
  get right() { return this._right; }

  dispose() {
    if (this.gear) { for (const m of this.gear.mats) m.dispose(); this.gear = null; }
    if (this.fig) Figure.dispose(this.fig);
    this.fig = null;
  }
}

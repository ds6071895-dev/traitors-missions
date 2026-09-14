/* Gravity-driven skiing. Manual rotations, bounded assistance and rail contacts. */
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

    // --- the air ---
    airDrag:      0.0016,
    airYawGain:   1.9,    // steering, off the snow and not tricking
    airSpinRate:  9.4,    // rad/s: a full 360 in two thirds of a second
    airFlipRate:  6.8,    // rad/s: a flip in nine hundred milliseconds
    airRollRate:  8.2,    // rad/s of cork, when a trick asks for one
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
    this.grinding = null; this.switch = false; this._rotation = null; this._grabTime = 0; this.wasTrick = false; this._lipCharge = 0;
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
    if (world.surfaces && world.surfaces.near(z).length) {
      const surface = world.surfaces.query(x, z, this.pos.y);
      this.surfaceId = surface.id; this.surfaceMaterial = surface.material;
      if (surface.id !== 'snow') return surface.height;
    }
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
    this.threw = 0; this.spun = 0; this.grindExit = 0; this.grindEntered = false;
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
    this.protection = Math.max(0, (this.protection || 0) - dt);
    this.railCooldown = Math.max(0, (this.railCooldown || 0) - dt);
    if (this.grinding) { this._grindStep(dt, ctl, world); return; }
    this.relaunchT = Math.max(0, this.relaunchT - dt);
    this.popT = Math.max(0, this.popT - dt);
    this._bufferT = Math.max(0, (this._bufferT || 0) - dt);

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
        const z = this._crashZ;
        const x = fc ? fc.cxAt(z) : this.pos.x;
        this.place(x, z, fc ? Math.atan(fc.cxSlopeAt(z)) : 0, world);
        this.vel.set(Math.sin(this.heading) * 10, Math.cos(this.heading) * 10);
        this.speed = 10; this.protection = 1.1;
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
    const n = world.surfaces && world.surfaces.near(this.pos.z).length
      ? world.surfaces.query(this.pos.x, this.pos.z, this.pos.y).normal
      : face ? face.normalAt(this.pos.x, this.pos.z, this._n) : this._n;

    // Ground: charge/release. Air: hold with directional input, release to align.
    if (!this.airborne) {
      if (this._bufferT > 0) { this._bufferT = 0; this._launch(world, .55, true); }
      if (trick) this.crouch = Math.min(1, this.crouch + dt / T.popCharge);
      else if (this.wasTrick && this.crouch > 0.10 && this.popT <= 0) {
        this._launch(world, this.crouch, true);
      } else this.crouch = U.damp(this.crouch, 0, 9, dt);
    } else {
      if (!trick && this.wasTrick && this.airTime < .10 && this._lipCharge > .1) {
        this.vy += T.popVy * this._lipCharge; this._lipCharge = 0;
      }
      if (trick) this._airHeld = (this._airHeld || 0) + dt;
      if (!trick && this.wasTrick && this.vy < 0 && this.airHeight < 2 && this._airHeld > .12) this._bufferT = .14;
      SkiTricks.step(this, dt, { ...ctl, steer, throttle: thr });
    }
    this.wasTrick = trick;

    // ---- steering ----
    const sp = this.vel.length();
    this.speed = sp;
    const speedFactor = U.lerp(.45, 1, U.smoothstep(0, 4.5, sp))
                      * U.lerp(1, T.turnLowSpeed, U.clamp(sp / T.topSpeed, 0, 1));
    /* Steering stays live in the air. With the rotation no longer bound
       to the same key, A and D get their real job back: pointing the
       skis at wherever the landing is going to be. */
    const post = this.airborne
      ? T.airYawGain
      : U.lerp(1, T.tuckTurn, this.tuck) * U.lerp(1, T.brakeTurn, this.braking);
    const targetYaw = this.airborne ? 0 : -steer * T.turnRate * speedFactor * post;
    this.yawVel = U.damp(this.yawVel, targetYaw, 9, dt);
    this.heading += this.yawVel * dt;

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

    const previous = { x: this.pos.x, y: this.pos.y, z: this.pos.z };
    // ---- move ----
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;

    const solid = world && world.surfaces && world.surfaces.solidContact(previous, this.pos, T.radius);
    if (solid) {
      const t = Math.max(0, solid.t - .001);
      this.pos.x = U.lerp(previous.x, this.pos.x, t); this.pos.z = U.lerp(previous.z, this.pos.z, t);
      this._crash('BUILDING'); return;
    }
    if (world && world.surfaces && world.surfaces.edge(previous, this.pos)) {
      this.pos.x = previous.x; this.pos.z = previous.z;
      this._crash('PLATFORM EDGE'); return;
    }
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



    if (this.airborne) {
      this.vy -= T.liftG * dt;
      this.pos.y += this.vy * dt;
      this.airHeight = this.pos.y - gy;
      this.peakHeight = Math.max(this.peakHeight, this.airHeight);
      if (world.surfaces) {
        const ceiling = world.surfaces.underside(previous, this.pos);
        if (ceiling !== null) { this.pos.y = ceiling; this.vy = Math.min(0, this.vy); }
        const rail = this.vy < 0 && world.surfaces.railAt(previous, this.pos, this.heading + this.airYaw, this.railCooldown);
        if (rail && Math.abs(SkiTricks.wrap(this.airPitch, U.TAU)) < .55 && Math.abs(SkiTricks.wrap(this.airRoll, U.TAU)) < .55) {
          this._enterRail(rail); return;
        }
      }
      if (this.pos.y <= gy) {
        this.pos.y = gy;
        this._touchdown(world, n);
      }
    }
    if (!this.airborne && !this.crashed && world.surfaces && this.speed > 5) {
      const rail=world.surfaces.railAt(previous,this.pos,this.heading,this.railCooldown,true);
      if(rail) {this._enterRail(rail);return;}
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
    this._lipCharge = ollie ? 0 : this.crouch * (1 - T.holdPop);
    this.crouch = 0;
    this.airRoll = this.airPitch = this.airYaw = 0;
    this.grab = 0;

    this._auto = null;
    this._rotation = null; this._grabTime = 0; this._airHeld = 0;
    this.lastAirEst = Math.max(0, 2 * this.vy / T.liftG);
  }

  // Rings reward route choice; they never change a ballistic trajectory.
  spinnerHit() { this.spun = 1; }

  _enterRail(contact) {
    this.switch = Math.abs(Math.round(this.airYaw/Math.PI))%2 ? !this.switch : !!this.switch;
    this.grinding=contact.rail; this.grindBalance=0; this.grindDistance=0; this._grindAge=0;
    this.grindEntered=true; this.pos.x=contact.x; this.pos.y=contact.y; this.heading=contact.angle;
    this.airborne=false; this.grounded=false; this.airRoll=this.airPitch=this.airYaw=0;
    this.roll=0; this.pitch=0; this.vy=0; this.squat=.35;
  }

  _grindStep(dt, ctl, world) {
    const rail=this.grinding;
    this._grindAge=(this._grindAge||0)+dt;
    // Half a second to let go of the approach steering. Neutral input settles balance.
    const input=this._grindAge<.5 ? 0 : (ctl.steer||0);
    this.grindBalance += (input*1.15 + Math.sin(this.pos.z*.12)*.12 - this.grindBalance*.85)*dt;
    if(Math.abs(this.grindBalance)>1) {this.grinding=null;this._crash('RAIL BALANCE');return;}
    if(ctl.trick)this.crouch=Math.min(1,this.crouch+dt/this.tune.popCharge);
    const exit=!ctl.trick&&this.wasTrick&&this.crouch>.1;
    this.wasTrick=!!ctl.trick;
    const previous={x:this.pos.x,y:this.pos.y,z:this.pos.z};
    let a=rail.points[0],b=rail.points[1];
    for(let i=1;i<rail.points.length;i++){a=rail.points[i-1];b=rail.points[i];if(this.pos.z<b.z)break;}
    const slope=(b.y-a.y)/(b.z-a.z), bend=(b.x-a.x)/(b.z-a.z);
    this.speed=U.clamp(this.speed+(2.8-this.speed*.018)*dt,8,52);
    this.pos.z=Math.min(rail.points[rail.points.length-1].z,this.pos.z+this.speed*dt/Math.hypot(1,slope,bend));
    for(let i=1;i<rail.points.length;i++){a=rail.points[i-1];b=rail.points[i];if(this.pos.z<=b.z)break;}
    const u=U.clamp((this.pos.z-a.z)/(b.z-a.z),0,1);
    this.pos.x=U.lerp(a.x,b.x,u);this.pos.y=U.lerp(a.y,b.y,u);
    this.grindDistance+=Math.hypot(this.pos.x-previous.x,this.pos.y-previous.y,this.pos.z-previous.z);
    this.heading=Math.atan2(b.x-a.x,b.z-a.z);
    this.vel.set(Math.sin(this.heading)*this.speed,Math.cos(this.heading)*this.speed);
    this.roll=U.damp(this.roll,this.grindBalance*.28,8,dt);
    this.pitch=Math.atan2(-(b.y-a.y),Math.hypot(b.x-a.x,b.z-a.z))*.55;
    this.fold=U.damp(this.fold,.6+Math.abs(this.grindBalance)*.2,8,dt);
    if(exit||this.pos.z>=rail.points[rail.points.length-1].z) {
      this.grindExit=this.grindDistance;this.grinding=null;this.railCooldown=.25;
      this._slopeBack=(b.y-a.y)/(b.z-a.z);
      this._launch(world,exit?this.crouch:.22,true);
    }
  }

  _touchdown(world, n) {
    const T = this.tune;
    const SN = this.snow;
    const air = this.airTime;
    const impact = Math.abs(this.vy);

    const offRoll = Math.abs(U.wrapAngle(this.airRoll));
    const offPitch = Math.abs(U.wrapAngle(this.airPitch));
    const level = 1 - U.clamp(Math.max(offRoll, offPitch) / T.landTolerance, 0, 1);

    // where the velocity is pointing, against where the skis are
    const vAng = Math.atan2(this.vel.x, this.vel.y);
    const drift = Math.abs(SkiTricks.wrap(vAng - this.heading - this.airYaw, Math.PI));
    const square = 1 - U.clamp(drift / T.driftTolerance, 0, 1);

    // and how hard it came down, which powder forgives and ice does not
    const soft = 1 - U.smoothstep(T.hardVy, T.hardVy * 1.9, impact) * (1.5 - SN.landing * 0.6);

    let q = U.clamp(level * 0.55 + square * 0.45, 0, 1) * U.clamp(soft, 0, 1);
    q *= U.lerp(0.86, 1.06, U.clamp(SN.landing, 0, 1.6) / 1.6);
    if (Math.max(offRoll, offPitch) > 1.0 || drift > 1.0) q = 0;
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

    Object.assign(this.lastTrick, SkiTricks.describe(this));
    this.switch = Math.abs(Math.round(this.airYaw / Math.PI)) % 2 !== 0 ? !this.switch : !!this.switch;
    this.landingReason = grade.id === 'crash' ? (level < .5 ? 'Incomplete rotation' : 'Skis across travel') : grade.id === 'sketchy' ? 'Late alignment' : this.switch ? 'Clean switch landing' : 'Skis aligned';
    this.lastTrick.reason = this.landingReason;
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
    this._crashZ = this.pos.z;
    this.grinding = null;
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
    if (this.protection > 0) return;
    if (world.colliders) {
      const clear = this.pos.y - this.groundY;
      for (const c of world.colliders) {
        if (c.kind === 'rock' && this.airborne && clear > c.r * 1.6) continue;
        const px = this.pos.x - this.vel.x * dt, pz = this.pos.z - this.vel.y * dt;
        const mx = this.pos.x - px, mz = this.pos.z - pz;
        const u = U.clamp(((c.x - px) * mx + (c.z - pz) * mz) / Math.max(1e-9, mx * mx + mz * mz), 0, 1);
        const dx = px + mx * u - c.x, dz = pz + mz * u - c.z;
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
    const wantFold = this.grinding ? .65 : U.clamp(this.tuck * 0.75 + this.crouch * 0.9
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
      this.mesh.rotation.set(0, this.airYaw + (this.switch ? Math.PI : 0), this.lean * 0.55);
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

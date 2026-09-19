/* ------------------------------------------------------------------
   boat.js — the raceboat: a lofted planing hull + arcade physics.

   The hull is generated properly: a table of stations swept along the
   centreline, each one a real section curve (deep-V bottom, hard chine,
   flared topsides). Every fitting on top of it is placed by asking the
   hull where its deck actually is, so nothing floats.

   The feel comes from three things stacked on top of plain driving:
     * surfing  — the wave gradient under the hull adds or steals speed
     * launches — a rising crest throws the boat into a real ballistic arc
     * landings — flat landings pay out boost, belly-flops cost speed
------------------------------------------------------------------ */
class Boat {

  static TUNE = {
    accel:        30,     // m/s^2 at full throttle
    reverse:      11,
    boostAccel:   58,
    topSpeed:     46,
    boostTop:     70,
    linDrag:      0.55,
    quadDrag:     0.0128,
    turnRate:     1.62,   // rad/s at the sweet spot
    turnLowSpeed: 0.36,
    gripLambda:   3.4,    // how fast sideways slide bleeds off
    surfGain:     56,     // wave-gradient acceleration
    gravity:      15.5,
    draft:       -0.25,   // where the model's designed waterline rides
    launchSurf:   1.50,   // fraction of g the surface must fall at to throw us clear
    launchSpeed:  17,
    hullRadius:   3.2,
    hullLength:   4.2,    // half-length used when averaging the surface
    minLaunchVy:  3.0,    // don't leave the water for a hop nobody would see
    relaunchCd:   0.3,    // no chattering straight back into the air
    // --- air control: nothing here does anything while the hull is wet ---
    airYawGain:   2.4,    // spin authority once the water lets go
    airRollRate:  7.0,    // rad/s of barrel roll — a turn in ~0.9 s
    airPitchRate: 5.4,    // rad/s of flip — a turn in ~1.2 s
    landTolerance: 1.05,  // how far off level you may land before it costs you
  };

  /* ---------------- hull geometry definition ----------------
     Everything downstream (fittings, spray anchors, the camera) reads
     these, so the whole boat resizes from one place. ------------- */
  static HULL = {
    sternZ:  -4.90,
    bowZ:     5.35,
    halfBeam: 1.82,
    crown:    0.18,        // how much the deck domes up at the centreline
    stations: 30,
    ringPts:  17,
    cockpit: { z0: -3.15, z1: 1.60, widthFrac: 0.60, floorY: 0.60, lip: 0.13 },
  };

  static f(z) {
    const H = Boat.HULL;
    return U.clamp((z - H.sternZ) / (H.bowZ - H.sternZ), 0, 1);
  }
  static beamF(f) {
    const H = Boat.HULL;
    return H.halfBeam * (0.88 + 0.12 * U.smoothstep(0, 0.35, f))
         * (1 - Math.pow(Math.max(0, (f - 0.42) / 0.58), 2.0));
  }
  static keelF(f) {
    return -0.64 + 1.46 * Math.pow(Math.max(0, (f - 0.52) / 0.48), 2.1)
         - 0.05 * U.smoothstep(0.30, 0, f);
  }
  static deckF(f) {
    return 1.26 + 0.64 * Math.pow(Math.max(0, (f - 0.32) / 0.68), 1.9)
         + 0.08 * U.smoothstep(0.28, 0, f);
  }
  static chineF(f) { return U.lerp(Boat.keelF(f), Boat.deckF(f), 0.30) + 0.04; }

  // one point on a station's section curve; u = 0 at the keel, 1 at the sheer
  static section(f, u, out = {}) {
    const w = Boat.beamF(f), k = Boat.keelF(f);
    const c = Boat.chineF(f), d = Boat.deckF(f);
    const knuckle = c + (d - c) * 0.10;
    if (u <= 0.56) {                                   // deep-V bottom
      const t = u / 0.56;
      out.x = w * 0.962 * t;
      out.y = k + (c - k) * Math.pow(t, 1.12);
    } else if (u <= 0.66) {                            // chine knuckle
      const t = (u - 0.56) / 0.10;
      out.x = w * (0.962 + 0.038 * t);
      out.y = U.lerp(c, knuckle, Math.sin(t * Math.PI * 0.5));
    } else {                                           // flared topside
      const t = (u - 0.66) / 0.34;
      out.x = w * U.lerp(1.0, 1.045, Math.pow(t, 1.3));
      out.y = U.lerp(knuckle, d, Math.pow(t, 0.95));
    }
    return out;
  }

  // deck height at a point on the deck (x measured out from the centreline)
  static deckAt(z, x = 0) {
    const f = Boat.f(z);
    const w = Math.max(Boat.beamF(f) * 1.045, 0.02);
    const t = U.clamp(Math.abs(x) / w, 0, 1);
    return Boat.deckF(f) + Boat.HULL.crown * (1 - t * t);
  }
  static beamAt(z) { return Boat.beamF(Boat.f(z)); }
  static cockpitHalfAt(z) { return Boat.beamAt(z) * Boat.HULL.cockpit.widthFrac; }

  constructor(opts = {}) {
    this.tune = Object.assign({}, Boat.TUNE, opts.tune || {});
    this.group = new THREE.Group();
    this.mesh = Boat.buildMesh(opts.paint || {}, opts.visualProfile);
    this.group.add(this.mesh);

    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector2(0, 0);      // world XZ velocity
    this.heading = 0;
    this.yawVel = 0;
    this.vy = 0;
    this.airborne = false;
    this.airTime = 0;
    this.lastAirTime = 0;
    this.roll = 0; this.pitch = 0;
    // rotation banked during a single flight; read on landing, then cleared
    this.airYaw = 0; this.airRoll = 0; this.airPitch = 0;
    this.lastTrick = null;                    // set on the frame we touch down
    this.boost = 1;                           // 0..1 meter
    this.boosting = false;
    this.wasBoosting = false;
    this.boostStarted = false;                // set on the frame boost kicks in
    this.surf = 0;                            // -1..1, how hard we're surfing
    this.speed = 0;
    this.throttleIn = 0; this.steerIn = 0;
    this.impact = 0;                          // set on the frame we hit something
    this.landed = 0;                          // set on the frame we touch down
    this.lastWaveY = 0;
    this.surfVel = 0;
    this.grounded = true;
    this.alive = true;
    this.trim = 0;                            // visual bow lift under power
    this.squat = 0;                           // visual body dip on landings
    this.lean = 0;                            // extra body roll into a turn
    this._prevSpeed = 0;

    this._surface = {};
    this._fwd = new THREE.Vector2();
    this._right = new THREE.Vector2();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._up = new THREE.Vector3();

    // engine wash / afterburner glow, scaled by boost
    this.visualProfile = opts.visualProfile;
    this.flame = opts.visualProfile === 'highland' ? BoatVisual.exhaust() : Boat.buildFlame();
    this.group.add(this.flame);
  }

  reset(x, z, heading) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0);
    this.heading = heading;
    this.yawVel = 0; this.vy = 0;
    this.airborne = false; this.airTime = 0;
    this.roll = this.pitch = 0;
    this.airYaw = this.airRoll = this.airPitch = 0;
    this.lastTrick = null;
    this._tricking = false;
    this.trim = this.squat = this.lean = 0;
    this.boost = 1; this.boosting = false; this.wasBoosting = false;
    this.speed = 0; this.surf = 0;
    this.lastWaveY = this.hullHeight(x, z, Math.sin(heading), Math.cos(heading));
    this.surfVel = 0;
    this.pos.y = this.lastWaveY;
  }

  get speed01() { return U.clamp(this.speed / this.tune.topSpeed, 0, 1.6); }

  // Average the surface along the hull instead of at a single point, so short
  // chop passes underneath and only real swell moves the boat.
  hullHeight(x, z, fx, fz) {
    const L = this.tune.hullLength;
    let sum = 0;
    for (const k of [-1, -0.5, 0, 0.5, 1]) sum += Water.sampleHeight(x + fx * L * k, z + fz * L * k);
    return sum / 5;
  }

  update(dt, ctl, world) {
    if (dt <= 0) return;
    const T = this.tune;
    this.impact = 0; this.landed = 0; this.boostStarted = false;
    this.lastTrick = null;
    this.relaunchTimer = Math.max(0, (this.relaunchTimer || 0) - dt);

    const throttle = U.clamp(ctl.throttle ?? 0, -1, 1);
    const steer = U.clamp(ctl.steer ?? 0, -1, 1);
    this.throttleIn = throttle; this.steerIn = steer;

    // ---- boost meter -------------------------------------------------
    const wantBoost = !!ctl.boost && this.boost > 0.02 && !this.airborne;
    this.boosting = wantBoost;
    if (wantBoost && !this.wasBoosting) this.boostStarted = true;
    this.wasBoosting = wantBoost;
    if (wantBoost) this.boost = Math.max(0, this.boost - dt * 0.40);

    // ---- surface under the hull -------------------------------------
    const surf = Water.sampleSurface(this.pos.x, this.pos.z, this._surface);

    this._fwd.set(Math.sin(this.heading), Math.cos(this.heading));
    this._right.set(this._fwd.y, -this._fwd.x);

    // ---- steering ----------------------------------------------------
    const sp = Math.hypot(this.vel.x, this.vel.y);
    this.speed = sp;
    // hard to turn from a standstill, and it tightens up as you slow from top speed
    const speedFactor = U.smoothstep(0, 6, sp) * U.lerp(1, T.turnLowSpeed, U.clamp(sp / T.boostTop, 0, 1));

    // Off the water, boost becomes the trick button. It is deliberately modal:
    // most players hold throttle the whole way down the channel, so if throttle
    // alone meant "flip" every launch would tumble by accident.
    //
    //   boost held          -> throttle flips, steering rolls
    //   boost released      -> the rotation snaps to the nearest whole turn,
    //                          which is what makes a landing winnable at all
    //   no boost            -> steering is an ordinary flat spin
    const tricking = this.airborne && !!ctl.boost;
    if (tricking) {
      this.airRoll += steer * T.airRollRate * dt;
      this.airPitch += throttle * T.airPitchRate * dt;
    } else if (this.airborne && this._tricking) {
      // Round, not floor: let go a third of the way in and the hull simply
      // unwinds to level, so an aborted trick costs you nothing but height.
      this.airRoll = Math.round(this.airRoll / U.TAU) * U.TAU;
      this.airPitch = Math.round(this.airPitch / U.TAU) * U.TAU;
    }
    this._tricking = tricking;

    const yawAuth = this.airborne ? (tricking ? 0 : T.airYawGain) : 1;
    const targetYaw = -steer * T.turnRate * speedFactor * yawAuth;
    this.yawVel = U.damp(this.yawVel, targetYaw, 7.5, dt);
    this.heading += this.yawVel * dt;
    if (this.airborne) this.airYaw += this.yawVel * dt;
    this._fwd.set(Math.sin(this.heading), Math.cos(this.heading));
    this._right.set(this._fwd.y, -this._fwd.x);

    // ---- longitudinal forces ----------------------------------------
    let vf = this.vel.x * this._fwd.x + this.vel.y * this._fwd.y;
    let vl = this.vel.x * this._right.x + this.vel.y * this._right.y;

    if (!this.airborne) {
      const drive = throttle >= 0 ? throttle * T.accel : throttle * T.reverse;
      vf += drive * dt;
      if (this.boosting) vf += T.boostAccel * dt;

      // surfing: project the surface normal onto our heading. Pointing down
      // the face of a wave is free speed; climbing one costs you.
      const grad = -(surf.nx * this._fwd.x + surf.nz * this._fwd.y) / Math.max(surf.ny, 0.25);
      this.surf = U.clamp(grad * 2.2, -1, 1);
      vf += grad * T.surfGain * dt * U.smoothstep(2, 14, Math.abs(vf));

      // drag, with a higher ceiling while boosting
      const top = this.boosting ? T.boostTop : T.topSpeed;
      const over = Math.max(0, Math.abs(vf) - top);
      vf -= Math.sign(vf) * (T.linDrag * Math.abs(vf) + T.quadDrag * vf * vf + over * 3.2) * dt;

      vl *= Math.exp(-T.gripLambda * dt);
      // a little outward slide in hard turns keeps corners playful
      vl += -this.yawVel * vf * 0.22 * dt;
    } else {
      this.airTime += dt;
      this.surf = U.damp(this.surf, 0, 4, dt);
      vf -= Math.sign(vf) * (0.16 * Math.abs(vf)) * dt;   // thin air drag
      vl *= Math.exp(-0.5 * dt);
    }

    this.vel.set(this._fwd.x * vf + this._right.x * vl, this._fwd.y * vf + this._right.y * vl);
    this.speed = Math.hypot(this.vel.x, this.vel.y);

    // ---- move ---------------------------------------------------------
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;

    // ---- collisions ----------------------------------------------------
    if (world) this._collide(dt, world);

    // ---- vertical ------------------------------------------------------
    const newWave = this.hullHeight(this.pos.x, this.pos.z, this._fwd.x, this._fwd.y);
    const rawSurfVel = (newWave - this.lastWaveY) / dt;
    this.lastWaveY = newWave;
    const prevSurfVel = this.surfVel;
    // smooth it: the raw derivative is spiky at speed and would launch us constantly
    this.surfVel = U.damp(this.surfVel, rawSurfVel, 22, dt);
    const surfAcc = (this.surfVel - prevSurfVel) / dt;
    const surfaceVel = this.surfVel;

    if (!this.airborne) {
      // the surface is dropping away faster than gravity — we're off the crest
      if (surfAcc < -T.gravity * T.launchSurf && surfaceVel > T.minLaunchVy
          && this.speed > T.launchSpeed && throttle > -0.2 && this.relaunchTimer <= 0) {
        this.airborne = true;
        this.airTime = 0;
        this.vy = surfaceVel;
      } else {
        this.pos.y = newWave + T.draft;
        this.vy = surfaceVel;
      }
    }
    if (this.airborne) {
      this.vy -= T.gravity * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= newWave + T.draft) {
        this.pos.y = newWave + T.draft;
        this.airborne = false;
        this.landed = Math.min(1, Math.abs(this.vy) / 14);
        this.relaunchTimer = T.relaunchCd;
        this.lastAirTime = this.airTime;
        // How level are we *really*? Wrapping matters: a hull that has rolled
        // through a full 360 is dead flat again, and landing it should pay.
        const offRoll = Math.abs(U.wrapAngle(this.roll));
        const offPitch = Math.abs(U.wrapAngle(this.pitch));
        const flat = 1 - U.clamp(Math.max(offRoll, offPitch) / T.landTolerance, 0, 1);
        if (this.airTime > 0.45) {
          this.boost = U.clamp(this.boost + this.airTime * 0.20 * flat, 0, 1);
        }
        this.lastTrick = {
          air: this.airTime,
          rolls: Math.floor(Math.abs(this.airRoll) / U.TAU),
          flips: Math.floor(Math.abs(this.airPitch) / U.TAU),
          spins: Math.floor(Math.abs(this.airYaw) / U.TAU),
          flat,
          landed: flat > 0.35,          // did we put it down, or bin it?
        };
        // take the short way back to level rather than unwinding three turns
        this.roll = U.wrapAngle(this.roll);
        this.pitch = U.wrapAngle(this.pitch);
        this.airYaw = this.airRoll = this.airPitch = 0;
        this._tricking = false;
        const lossFactor = U.lerp(0.55, 0.97, flat);
        const nvf = (this.vel.x * this._fwd.x + this.vel.y * this._fwd.y) * lossFactor;
        this.vel.set(this._fwd.x * nvf, this._fwd.y * nvf);
        this.vy = 0;
        this.airTime = 0;
        this.squat = Math.min(0.55, this.squat + this.landed * 0.55);
      }
    }
    this.grounded = !this.airborne;

    // ---- attitude -------------------------------------------------------
    // ride the wave normal when wet, hold a nose-up arc when flying
    let tRoll, tPitch;
    if (!this.airborne) {
      const nRight = surf.nx * this._right.x + surf.nz * this._right.y;
      const nFwd = surf.nx * this._fwd.x + surf.nz * this._fwd.y;
      tRoll = Math.atan2(nRight, surf.ny) * 0.85 + this.yawVel * this.speed * 0.028;
      tPitch = -Math.atan2(nFwd, surf.ny) * 0.9 - U.clamp(this.speed / this.tune.topSpeed, 0, 1) * 0.10
               + (this.boosting ? -0.05 : 0);
      this.roll = U.damp(this.roll, U.clamp(tRoll, -0.75, 0.75), 6.5, dt);
      this.pitch = U.damp(this.pitch, U.clamp(tPitch, -0.7, 0.7), 6.0, dt);
    } else {
      // no clamp while flying — the banked rotation has to be able to wind
      // past a half turn or a barrel roll would stall on its back.
      // The cosmetic lean and nose-up arc are held right down here: at full
      // strength they are most of a radian, which would swallow the whole
      // landing tolerance and make a completed rotation impossible to put down.
      const arc = U.clamp(-this.vy * 0.035, -0.5, 0.5);
      tRoll = this.yawVel * 0.25 + this.airRoll;
      tPitch = arc * (this.airPitch !== 0 ? 0.35 : 1) + this.airPitch;
      this.roll = U.damp(this.roll, tRoll, 11, dt);
      this.pitch = U.damp(this.pitch, tPitch, 11, dt);
    }

    // ---- apply transform -------------------------------------------------
    this.group.position.copy(this.pos);
    this._e.set(this.pitch, this.heading, this.roll, 'YXZ');
    this.group.quaternion.setFromEuler(this._e);

    // ---- body english: the hull leans and squats on its own --------------
    const accel = (this.speed - this._prevSpeed) / dt;
    this._prevSpeed = this.speed;
    const wantTrim = U.clamp(accel * 0.006 + (this.boosting ? 0.10 : 0)
                     + this.speed01 * 0.05, -0.10, 0.16);
    this.trim = U.damp(this.trim, this.airborne ? 0.05 : wantTrim, 4.0, dt);
    this.squat = U.damp(this.squat, 0, 7.0, dt);
    this.lean = U.damp(this.lean, U.clamp(-this.yawVel * this.speed * 0.012, -0.22, 0.22), 5.5, dt);
    this.mesh.rotation.set(-this.trim, 0, this.lean);
    this.mesh.position.y = -this.squat;

    // ---- flame -----------------------------------------------------------
    const fl = this.boosting ? 1 : (this.throttleIn > 0 ? 0.20 + this.speed01 * 0.16 : 0.05);
    const s = U.damp(this.visualProfile === 'highland' ? (this._exhaustStrength ?? .05) : this.flame.scale.z, fl, 14, dt);
    this._exhaustStrength = s;
    this.flame.scale.set(0.6 + s * 0.85, 0.6 + s * 0.85, s);
    if (this.visualProfile === 'highland') this.flame.scale.set(1, 1, 1);
    this.flame.visible = s > 0.08;
    this.flame.material.opacity = U.clamp(s * 0.95, 0, 1);
  }

  _collide(dt, world) {
    const T = this.tune;
    // rocks
    if (world.colliders) {
      const clearance = this.pos.y - this.lastWaveY;
      for (const c of world.colliders) {
        if (this.airborne && clearance > c.r) continue;   // sailing over it
        const dx = this.pos.x - c.x, dz = this.pos.z - c.z;
        const rr = c.r + T.hullRadius;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr) {
          const d = Math.sqrt(d2) || 0.001;
          const nx = dx / d, nz = dz / d;
          this.pos.x = c.x + nx * rr;
          this.pos.z = c.z + nz * rr;
          const vn = this.vel.x * nx + this.vel.y * nz;
          if (vn < 0) {
            const force = U.clamp(-vn / 26, 0, 1);
            this.impact = Math.max(this.impact, U.clamp(force, 0.05, 1));
            this.vel.x -= nx * vn * 1.4;
            this.vel.y -= nz * vn * 1.4;
            this.vel.multiplyScalar(U.lerp(1.0, 0.66, force));
          }
        }
      }
    }
    // channel walls
    if (world.path) {
      const f = world.path.frame(this.pos.x, this.pos.z, world.hint ?? -1, world._frame || {});
      world.hint = f.index;
      world.lastFrame = f;
      const limit = f.half - T.hullRadius;
      if (Math.abs(f.lateral) > limit) {
        const side = Math.sign(f.lateral);
        const t = f.tangent;
        const nx = -t.z * side, nz = t.x * side;      // outward normal
        const over = Math.abs(f.lateral) - limit;
        this.pos.x -= nx * over;
        this.pos.z -= nz * over;
        const vn = this.vel.x * nx + this.vel.y * nz;
        if (vn > 0) {
          const force = U.clamp(vn / 26, 0, 1);
          this.impact = Math.max(this.impact, U.clamp(force, 0.05, 1));
          // kill the into-the-wall component so you slide along the cliff
          this.vel.x -= nx * vn * 1.08;
          this.vel.y -= nz * vn * 1.08;
          this.vel.multiplyScalar(U.lerp(1.0, 0.72, force));
        }
      }
    }
  }

  addBoost(v) { this.boost = U.clamp(this.boost + v, 0, 1); }

  /* ================= mesh ================= */

  static buildMesh(paint = {}, visualProfile, detail = 'player') {
    return visualProfile === 'highland'
      ? BoatVisual.build(paint, () => Boat.buildLegacyMesh({stripe:'#742f35', stripe2:'#58292e', accent:'#b89a61', deck:'#cdbb92', deckDk:'#a28c69', ...paint}), detail)
      : Boat.buildLegacyMesh(paint);
  }

  static buildLegacyMesh(paint) {
    const P = Object.assign({
      hull:    '#f7f9fc',
      hullLo:  '#e6edf5',
      stripe:  '#e5133f',
      stripe2: '#b70d31',
      accent:  '#ffc23c',
      bottom:  '#123a5c',
      bottomLo:'#0c2b45',
      boot:    '#0d1c2b',
      deck:    '#f6e3c2',
      deckDk:  '#e0c79c',
      rail:    '#2b3a4a',
      dark:    '#2b3d4f',
      inner:   '#33485f',
      glass:   '#8fe9ff',
      chrome:  '#c8d4e0',
    }, paint);

    const H = Boat.HULL;
    const pos = [], col = [];
    const c = new THREE.Color();
    const tri = (a, b, cc, hex) => {
      // skip degenerate slivers (they only ever produce shading noise)
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = cc[0] - a[0], vy = cc[1] - a[1], vz = cc[2] - a[2];
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      if (cx * cx + cy * cy + cz * cz < 1e-12) return;
      pos.push(a[0], a[1], a[2], b[0], b[1], b[2], cc[0], cc[1], cc[2]);
      if (hex instanceof THREE.Color) c.copy(hex); else c.set(hex);
      for (let i = 0; i < 3; i++) col.push(c.r, c.g, c.b);
    };
    const quad = (a, b, cc, d, hex) => { tri(a, b, cc, hex); tri(a, cc, d, hex); };

    /* ---- stations ------------------------------------------------- */
    const N = H.stations, R = H.ringPts;
    const fs = [];
    for (let i = 0; i < N; i++) fs.push(i / (N - 1));
    const zOf = f => U.lerp(H.sternZ, H.bowZ, f);

    // ring[i][j] = { x, y } for station i, section sample j
    const rings = fs.map(f => {
      const arr = [];
      for (let j = 0; j < R; j++) arr.push(Boat.section(f, j / (R - 1), {}));
      return arr;
    });

    const cHull = new THREE.Color(P.hull), cHullLo = new THREE.Color(P.hullLo);
    const cBot = new THREE.Color(P.bottom), cBotLo = new THREE.Color(P.bottomLo);
    const cStripe = new THREE.Color(P.stripe), cStripe2 = new THREE.Color(P.stripe2);
    const tmp = new THREE.Color();

    // paint a hull facet from its height, both in world terms (the waterline
    // bands) and relative to its own station (the sheer stripe)
    const hullCol = (y, f, out) => {
      const k = Boat.keelF(f), d = Boat.deckF(f);
      const t = U.clamp((y - k) / Math.max(d - k, 0.01), 0, 1);
      if (y < -0.02) {
        out.copy(cBotLo).lerp(cBot, U.smoothstep(-0.62, 0.0, y));
      } else if (y < 0.13) {
        out.set(P.boot);
      } else if (y < 0.30) {
        out.set(P.accent);
      } else if (t > 0.90) {
        out.copy(cStripe2).lerp(cStripe, U.smoothstep(0.90, 1.0, t));
      } else {
        out.copy(cHullLo).lerp(cHull, U.smoothstep(0.25, 0.85, t));
      }
      return out;
    };

    /* ---- hull shell ------------------------------------------------- */
    for (const side of [1, -1]) {
      for (let i = 0; i < N - 1; i++) {
        const f0 = fs[i], f1 = fs[i + 1];
        const z0 = zOf(f0), z1 = zOf(f1);
        const A = rings[i], B = rings[i + 1];
        for (let j = 0; j < R - 1; j++) {
          const a0 = [A[j].x * side, A[j].y, z0];
          const a1 = [A[j + 1].x * side, A[j + 1].y, z0];
          const b0 = [B[j].x * side, B[j].y, z1];
          const b1 = [B[j + 1].x * side, B[j + 1].y, z1];
          const my = (A[j].y + A[j + 1].y + B[j].y + B[j + 1].y) / 4;
          hullCol(my, (f0 + f1) / 2, tmp);
          if (side > 0) quad(a0, b0, b1, a1, tmp);
          else quad(a0, a1, b1, b0, tmp);
        }
      }
    }

    const shellEnd = pos.length / 3;
    /* ---- deck ------------------------------------------------------- */
    const CK = H.cockpit;
    const inCockpit = z => z > CK.z0 && z < CK.z1;
    const innerX = (f) => {
      const z = zOf(f);
      if (!inCockpit(z)) return 0;
      // pinch the opening closed toward each end so the coaming reads as a curve
      const e = Math.min(U.smoothstep(CK.z0, CK.z0 + 0.75, z), U.smoothstep(CK.z1, CK.z1 - 0.75, z));
      return Boat.beamF(f) * CK.widthFrac * e;
    };
    const deckY = (f, x) => {
      const w = Math.max(Boat.beamF(f) * 1.045, 0.02);
      const t = U.clamp(Math.abs(x) / w, 0, 1);
      return Boat.deckF(f) + H.crown * (1 - t * t);
    };

    const DSPAN = 4;
    for (const side of [1, -1]) {
      for (let i = 0; i < N - 1; i++) {
        const f0 = fs[i], f1 = fs[i + 1];
        const z0 = zOf(f0), z1 = zOf(f1);
        const o0 = rings[i][R - 1].x, o1 = rings[i + 1][R - 1].x;
        const i0 = innerX(f0), i1 = innerX(f1);
        for (let j = 0; j < DSPAN; j++) {
          const t0 = j / DSPAN, t1 = (j + 1) / DSPAN;
          const xa0 = U.lerp(o0, i0, t0), xa1 = U.lerp(o0, i0, t1);
          const xb0 = U.lerp(o1, i1, t0), xb1 = U.lerp(o1, i1, t1);
          const A0 = [xa0 * side, deckY(f0, xa0), z0];
          const A1 = [xa1 * side, deckY(f0, xa1), z0];
          const B0 = [xb0 * side, deckY(f1, xb0), z1];
          const B1 = [xb1 * side, deckY(f1, xb1), z1];
          // the outermost strip is the rubbing rail; the rest is deck
          const colr = j === 0 ? P.rail
            : (j === 1 ? P.deckDk : P.deck);
          if (side > 0) quad(A0, B0, B1, A1, colr);
          else quad(A0, A1, B1, B0, colr);
        }
      }
    }

    const deckEnd = pos.length / 3;
    /* ---- cockpit tub ------------------------------------------------- */
    const floorY = CK.floorY;
    for (const side of [1, -1]) {
      for (let i = 0; i < N - 1; i++) {
        const f0 = fs[i], f1 = fs[i + 1];
        const z0 = zOf(f0), z1 = zOf(f1);
        const i0 = innerX(f0), i1 = innerX(f1);
        if (i0 < 0.02 && i1 < 0.02) continue;
        const dy0 = deckY(f0, i0), dy1 = deckY(f1, i1);
        // coaming lip, then the wall down to the sole
        const L0 = [i0 * side, dy0 + CK.lip, z0], L1 = [i1 * side, dy1 + CK.lip, z1];
        const T0 = [i0 * side, dy0, z0], T1 = [i1 * side, dy1, z1];
        if (side > 0) quad(T0, T1, L1, L0, P.rail); else quad(T0, L0, L1, T1, P.rail);
        const W0 = [i0 * 0.93 * side, floorY, z0], W1 = [i1 * 0.93 * side, floorY, z1];
        if (side > 0) quad(L0, W0, W1, L1, P.inner); else quad(L0, L1, W1, W0, P.inner);
        // sole
        const F0 = [0, floorY, z0], F1 = [0, floorY, z1];
        if (side > 0) quad(W0, F0, F1, W1, P.dark); else quad(W0, W1, F1, F0, P.dark);
      }
    }
    // close the cockpit's fore and aft ends
    for (const zEnd of [CK.z0 + 0.02, CK.z1 - 0.02]) {
      const f = Boat.f(zEnd);
      const xi = Math.max(innerX(f), 0.35);
      const dy = deckY(f, xi) + CK.lip;
      quad([-xi, dy, zEnd], [xi, dy, zEnd], [xi, floorY, zEnd], [-xi, floorY, zEnd], P.inner);
    }

    const tubEnd = pos.length / 3;
    /* ---- transom ----------------------------------------------------- */
    {
      const A = rings[0], z = zOf(0);
      for (let j = 0; j < R - 1; j++) {
        const my = (A[j].y + A[j + 1].y) / 2;
        hullCol(my, 0.0, tmp);
        quad([-A[j].x, A[j].y, z], [A[j].x, A[j].y, z],
             [A[j + 1].x, A[j + 1].y, z], [-A[j + 1].x, A[j + 1].y, z], tmp);
      }
      // and the transom's slice of deck
      const o = A[R - 1].x, xi = innerX(0);
      quad([-o, deckY(0, o), z], [o, deckY(0, o), z],
           [xi, deckY(0, xi), z], [-xi, deckY(0, xi), z], P.deck);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const hull = new THREE.Mesh(g, new THREE.MeshLambertMaterial({
      vertexColors: true, flatShading: true, side: THREE.DoubleSide,
    }));
    hull.name = 'hull';
    g.addGroup(0, shellEnd, 0);
    g.addGroup(shellEnd, deckEnd - shellEnd, 1);
    g.addGroup(deckEnd, tubEnd - deckEnd, 2);
    g.addGroup(tubEnd, pos.length / 3 - tubEnd, 0);

    const grp = new THREE.Group();
    grp.add(hull);

    const lam = (color, extra) => new THREE.MeshLambertMaterial(Object.assign(
      { color, flatShading: true }, extra || {}));
    // helper: drop a mesh so its underside sits exactly on the deck
    const onDeck = (mesh, z, x, height, sink = 0.04) => {
      mesh.position.set(x, Boat.deckAt(z, x) + height / 2 - sink, z);
      return mesh;
    };

    /* ---- fittings, every one of them seated on real geometry --------- */

    // engine box on the aft deck — a low, raked wedge rather than a crate
    const cowlZ = -3.85, cowlH = 0.46;
    const cowlGeo = new THREE.BoxGeometry(2.0, cowlH, 1.7, 2, 1, 2);
    {
      const cp = cowlGeo.attributes.position;
      for (let i = 0; i < cp.count; i++) {
        const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i);
        if (y > 0) cp.setXYZ(i, x * 0.78, y, z * 0.80 - 0.10);   // taper the top
      }
      cowlGeo.computeVertexNormals();
    }
    const cowl = new THREE.Mesh(cowlGeo, lam(P.stripe));
    onDeck(cowl, cowlZ, 0, cowlH, 0.14);
    cowl.rotation.x = -0.05;
    cowl.name = 'engine-cowl';
    grp.add(cowl);
    const cowlTop = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.10, 1.15), lam(P.accent));
    cowlTop.position.set(0, cowl.position.y + cowlH / 2 + 0.02, cowlZ - 0.08);
    cowlTop.rotation.x = -0.05;
    grp.add(cowlTop);
    for (const sx of [-0.56, 0.56]) {                       // intake scoops
      const sc = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.62), lam(P.dark));
      sc.position.set(sx, cowl.position.y + cowlH / 2 - 0.03, cowlZ + 0.34);
      sc.rotation.x = -0.14;
      grp.add(sc);
    }
    // a bench across the back of the cockpit, so the tub is not just a pit
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.18, 0.55), lam(P.stripe));
    bench.position.set(0, floorY + 0.34, CK.z0 + 0.42);
    bench.name = 'bench';
    grp.add(bench);
    const benchLeg = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.34, 0.42), lam(P.inner));
    benchLeg.position.set(0, floorY + 0.17, CK.z0 + 0.42);
    grp.add(benchLeg);

    // console + wheel, standing on the cockpit sole
    const consZ = 1.02;
    const cons = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.52, 0.42), lam(P.dark));
    cons.position.set(0, floorY + 0.26, consZ);
    cons.rotation.x = 0.16;
    grp.add(cons);
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.3), lam('#0f1a26'));
    dash.position.set(0, floorY + 0.53, consZ - 0.03);
    grp.add(dash);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.045, 8, 18), lam('#161f2a'));
    wheel.position.set(0, floorY + 0.68, consZ - 0.18);
    wheel.rotation.x = 1.15;
    wheel.name = 'wheel';
    grp.add(wheel);

    // seats on the sole
    for (const sx of [-0.55, 0.55]) {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.16, 0.6), lam(P.stripe));
      base.position.set(sx, floorY + 0.30, 0.05);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.22, 10), lam(P.dark));
      post.position.set(sx, floorY + 0.11, 0.05);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.52, 0.14), lam(P.stripe));
      back.position.set(sx, floorY + 0.62, -0.24);
      back.rotation.x = -0.14;
      base.name = 'seat'; back.name = 'seat-back';
      grp.add(base, post, back);
    }

    // windshield: base points read straight off the deck curve
    {
      const zB = CK.z1 + 0.06, zT = CK.z1 - 0.62;
      const xb = Boat.cockpitHalfAt(zB) + 0.16, xt = xb * 0.72;
      const yb0 = Boat.deckAt(zB, 0) + 0.02;
      const yb1 = Boat.deckAt(zB, xb) + 0.02;
      const yt = yb0 + 0.66;
      const wp = [];
      const pushTri = (a, b, cc) => wp.push(a[0], a[1], a[2], b[0], b[1], b[2], cc[0], cc[1], cc[2]);
      const BL = [-xb, yb1, zB], BR = [xb, yb1, zB], BC = [0, yb0, zB];
      const TL = [-xt, yt, zT], TR = [xt, yt, zT], TC = [0, yt + 0.05, zT];
      pushTri(BL, BC, TC); pushTri(BL, TC, TL);
      pushTri(BC, BR, TR); pushTri(BC, TR, TC);
      const wsGeo = new THREE.BufferGeometry();
      wsGeo.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
      wsGeo.computeVertexNormals();
      const ws = new THREE.Mesh(wsGeo, new THREE.MeshLambertMaterial({
        color: P.glass, transparent: true, opacity: 0.42, side: THREE.DoubleSide,
        flatShading: true, emissive: '#2b7f9e', emissiveIntensity: 0.3, depthWrite: false,
      }));
      ws.renderOrder = 2;
      grp.add(ws);
      // frame along the top edge, sitting on the glass
      const frame = new THREE.Mesh(new THREE.BoxGeometry(xt * 2 + 0.1, 0.07, 0.09), lam(P.chrome));
      frame.position.set(0, yt + 0.03, zT);
      frame.name = 'windscreen-frame';
      grp.add(frame);
    }

    // grab rails down the side decks
    for (const side of [1, -1]) {
      for (const z of [-1.9, -0.6]) {
        const x = Boat.cockpitHalfAt(z) + (Boat.beamAt(z) - Boat.cockpitHalfAt(z)) * 0.55;
        const y = Boat.deckAt(z, x);
        const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.5, 8), lam(P.chrome));
        rail.position.set(x * side, y + 0.10, z);
        rail.rotation.z = Math.PI / 2;
        rail.rotation.y = Math.PI / 2;
        grp.add(rail);
      }
    }

    // foredeck hatch + bow cleat, both flush to the crown
    {
      const hz = 3.15;
      const hatch = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.07, 1.1), lam(P.deckDk));
      hatch.position.set(0, Boat.deckAt(hz, 0) + 0.02, hz);
      hatch.name = 'hatch';
      grp.add(hatch);
      const cz = 4.35;
      const cleat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.10, 0.16), lam(P.chrome));
      cleat.position.set(0, Boat.deckAt(cz, 0) + 0.05, cz);
      grp.add(cleat);
    }

    // stem cap — a short wedge lying along the foredeck crown, its base
    // buried in the deck so no seam shows
    {
      const sz = 4.55;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.85, 4), lam(P.accent));
      const y0 = Boat.deckAt(sz, 0), y1 = Boat.deckAt(sz + 0.7, 0);
      cap.position.set(0, (y0 + y1) / 2 - 0.10, sz + 0.28);
      cap.rotation.x = Math.PI / 2 - Math.atan2(y1 - y0, 0.7);
      cap.rotation.y = Math.PI / 4;
      grp.add(cap);
    }

    // nav lights on the bow sheer
    for (const side of [1, -1]) {
      const nz = 4.05;
      const nx = Boat.beamAt(nz) * 1.0;
      const lightCol = side > 0 ? '#3ddc84' : '#ff3b5c';
      const nl = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8),
        new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: lightCol, emissiveIntensity: 1.4, flatShading: true }));
      nl.position.set(nx * side, Boat.deckAt(nz, nx) + 0.06, nz);
      grp.add(nl);
    }

    // exhausts through the transom
    for (const sx of [-0.78, 0.78]) {
      const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.3, 12), lam(P.dark));
      ex.position.set(sx, 0.30, H.sternZ + 0.06);
      ex.rotation.x = Math.PI / 2;
      grp.add(ex);
    }

    // stern flag, pole planted on the aft deck
    {
      const pz = H.sternZ + 0.45;
      const deckTop = Boat.deckAt(pz, 0);
      const poleH = 1.7;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, poleH, 8), lam(P.rail));
      pole.position.set(0, deckTop + poleH / 2 - 0.06, pz);
      grp.add(pole);
      const flagGeo = new THREE.PlaneGeometry(0.86, 0.52, 12, 4);
      flagGeo.translate(0.43, 0, 0);
      const flag = new THREE.Mesh(flagGeo, new THREE.MeshLambertMaterial({
        color: P.stripe, side: THREE.DoubleSide, flatShading: true,
      }));
      flag.position.set(0.03, deckTop + poleH - 0.34, pz);
      flag.name = 'flag';
      grp.add(flag);
      grp.userData.flag = flag;
    }

    return grp;
  }

  static buildFlame() {
    const g = new THREE.ConeGeometry(0.52, 3.0, 10, 1, true);
    g.rotateX(Math.PI / 2);
    g.translate(0, 0.28, -6.4);
    const m = new THREE.MeshBasicMaterial({
      color: '#7ff3ff', transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.visible = false;
    return mesh;
  }


  // gentle cloth wave on the stern flag
  animateFlag(t) {
    if (this.visualProfile === 'highland') BoatVisual.animate(this, t);
    const flag = this.mesh.userData.flag;
    if (!flag) return;
    const p = flag.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      p.setZ(i, Math.sin(x * 6.5 - t * 9 + this.speed01 * 2) * 0.10 * (x / 0.86)
                + Math.sin(y * 4 - t * 6) * 0.03 * (x / 0.86));
    }
    p.needsUpdate = true;
  }
}

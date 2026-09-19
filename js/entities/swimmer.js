/* ------------------------------------------------------------------
   swimmer.js — the diver: one shaped kick, then a long glide.

   Everything about how the dive feels lives in this file, and it is
   deliberately the only thing phase one of the mission ships, because
   a swim that is not right cannot be rescued later by a nicer reef.

   The stroke is a *shape*, not a shove. A kick ramps in and out over a
   quarter of a second and then lets go entirely, and the glide that
   follows is where you actually steer. An instantaneous velocity add
   reads as a teleport; a burst you can feel arrive is what makes the
   water feel like water.

   Three things then stack on top of plain swimming:

     * the chain — a stroke landed on the beat is faster, cheaper in
       air and worth more money, so swimming well and swimming
       musically become the same act
     * the carve — the sideways part of your momentum does not
       evaporate when you turn, it is fed back into the direction you
       are now pointing, so a good line keeps its speed
     * the breath — one bar, drained by depth, by effort and by
       whatever gold you are holding, and it is the only clock that
       matters

   The physics runs on fixed sub-steps. That is not caution: it makes a
   twenty-frame second and a hundred-and-twenty-frame second produce
   the same swim, which is the difference between a game that can be
   learned and one that cannot.
------------------------------------------------------------------ */
class Swimmer {

  static TUNE = {
    // --- the stroke: one shaped kick, then a long glide ---
    kickAccel:    34,     // m/s^2 at the peak of a kick
    kickTime:     0.26,   // how long one kick pushes for
    strokeCd:     0.30,   // no mashing: minimum seconds between strokes

    // --- the glide: low drag is the whole point ---
    glideDrag:    0.52,   // m/s^2 of plain deceleration while gliding
    quadDrag:     0.024,  // and the term that sets the ceiling
    kickDrag:     1.35,   // higher while the kick is firing, so it reads as effort
    topSpeed:     11.0,   // m/s on an unchained stroke
    flowTop:      16.5,   // m/s with the chain lit
    vertBias:     0.86,   // vertical thrust is slightly weaker than horizontal
    buoyancy:     0.0,    // m/s^2 of drift; a diver is trimmed neutral
    carryBuoy:   -0.34,   // and gold is not. Each chest pulls you down.
    /* ...except in the top two metres, where a wetsuit has not yet
       compressed and genuinely holds you up. Without this a diver at
       rest is pushed under by every passing crest and has no way back:
       `up` goes false, the gasp never lands, and floating on the
       surface — the thing the whole mission is a round trip to — is
       something the physics cannot actually do. It is gone by the time
       you are two metres down, so no part of the dive profile moves. */
    surfaceLift:  2.6,    // m/s^2 up, at the surface
    surfaceLiftTo: 1.8,   // ...and the depth it has faded out by
    gravity:      9.81,   // m/s^2, once you are properly out of the water
    airDrag:      0.10,   // and how little the air holds you back
    jumpDrag:     0.25,   // fraction of the water's quadratic drag, in air

    /* --- the beach ---
       The other half of the diver, and the half the mission is a round
       trip to. Swimming and walking are genuinely different verbs: one
       is a shaped impulse into a long glide, the other is a velocity
       you own outright and lose the instant you stop asking for it.
       Trying to express the second in the first's language is what
       makes a swimmer on land feel like a boat on gravel.

       You are on your feet whenever the ground under you is within
       `wadeDepth` of the surface, so the last few metres of the swim
       home turn into a wade and then into a walk without a button, a
       prompt or a cut. */
    wadeDepth:    1.25,   // ground this near the surface is standable
    standSpeed:   5.4,    // ...but not while you are still travelling
    standLockT:   0.45,   // seconds after a jump that you cannot re-plant
    /* The three numbers the walk home is made of. They multiply, so
       they were tuned together rather than one at a time: a laden
       wade at 0.62 x 0.52 was two metres a second, which is nine
       seconds of trudging on a twenty-second trip, and the best part
       of the mission became the part everybody waited through. */
    walkTop:      6.6,    // m/s flat out on dry shingle, empty-handed
    walkWade:     0.72,   // ...and the fraction of it you keep knee-deep
    walkCarry:    0.58,   // ...and the fraction left with your hands full
    walkLambda:   9.0,    // how sharply the legs take up a new heading
    walkStop:     12.0,   // and how sharply they give it back
    footing:      14.0,   // m/s^2 holding you down while you are on your feet
    jumpUp:       6.4,    // m/s of a standing jump
    jumpOut:      4.2,    // ...and how much of it goes where you are looking
    /* And past a certain depth neither are you. A suit compresses, the
       air in it stops holding you up, and below about twenty metres a
       freediver falls. It is the real thing and it is also the whole
       shape of the mission: going down is free, coming back is what
       costs you, so "one more?" is always a question about the climb. */
    sinkFrom:     16,     // metres at which the water stops holding you up
    sinkTo:       40,     // and where the fall is at full strength
    sinkAccel:   -1.35,   // m/s^2 down there

    // --- steering: you steer the glide, not the kick ---
    turnRate:     2.30,   // rad/s the body will swing towards your aim
    turnLowSpeed: 0.55,   // how much of it survives at top speed
    kickTurn:     0.40,   // steering authority *during* a kick
    aimGain:      7.0,    // rad/s of swing per radian you are off your aim
    aimLambda:    12,     // and how sharply the body takes that up
    gripLambda:   2.6,    // how fast sideways slide bleeds off
    carve:        0.62,   // ...and how much of it comes back as forward speed
    pitchRate:    1.90,   // rad/s of climb/dive
    pitchClamp:   1.35,   // ~77 degrees; you cannot swim straight up forever
    scull:        3.4,    // m/s^2 of hands-only drift, for lining a chest up

    // --- the beat lock ---
    window:       0.12,   // +/- seconds around the beat that counts as on-beat
    flowGain:     0.34,   // flow added per on-beat stroke
    flowDecay:    0.55,   // flow lost per second once the beat has gone
    flowMiss:     0.35,   // what is left of the chain after an off-beat stroke
    flowKick:     1.34,   // thrust multiplier at full chain
    flowAirScale: 0.70,   // an on-beat stroke costs this fraction of the air

    // --- breath ---
    airDrain:     0.018,  // fraction of the bar per second at the surface, at rest
    airStroke:    0.007,  // and per stroke
    pressureRef:  26,     // metres per extra atmosphere of drain
    carryDrain:   0.18,   // extra drain per chest carried
    carryDrag:    0.11,   // extra drag per chest carried
    carryKick:    0.09,   // longer kick per chest carried
    gaspRefill:   2.2,    // lambda on the refill once your head is out
    /* ...and how much of that survives a deep dive. A freediver back
       from forty metres does not simply breathe in and go again: the
       surface interval is a real part of the sport, and it is the only
       thing that stops the trench being the answer to every question.
       A shelf trip is back in the water in a second and a half; a
       trench trip has to float for five, in front of everybody. */
    intervalDeep: 45,     // metres at which the interval is at its longest
    intervalKeep: 0.28,   // fraction of the refill rate left at that depth

    // --- the body ---
    bodyRadius:   0.55,   // what the seabed and the wreck collide against
    surfaceY:    -0.55,   // where the head rides when floating
    /* ...and how far under that still counts as having your head out.
       Without a band this is a knife edge: the sea is moving, so a
       diver floating on it spends most frames a few centimetres under
       their own clamp, and anything gated on "at the surface" — the
       banking, the gasp, the recovery from a blackout — silently never
       happens. */
    surfaceBand:  0.40,
    bumpSpeed:    5.0,    // m/s into a rock before it counts as a bump

    // the physics sub-step. Fixed, so the same swim happens at any
    // frame rate; 120 Hz is well under the shortest thing in here
    // (a 0.26 s kick) and costs two integrations a frame at 60.
    step:         1 / 120,
  };

  constructor(opts = {}) {
    this.tune = Object.assign({}, Swimmer.TUNE, opts.tune || {});

    this.group = new THREE.Group();       // physics: position + attitude
    this.mesh = new THREE.Group();        // cosmetics: everything that wobbles
    this.group.add(this.mesh);

    this.fig = null;
    if (opts.figure !== false) {
      this.fig = Figure.build(opts.look ? { look: opts.look, long: false }
                                        : { palette: opts.palette || 'diver', long: false });
      /* Stand the figure up along +Z and roll it face-down. The group's
         forward is +Z, so after this the diver is prone and pointing
         where they are going, and every joint the rig already has
         carries on meaning what it meant. */
      this.fig.rotation.x = Math.PI / 2;
      this.fig.position.y = 0;
      this.mesh.add(this.fig);
      Swimmer.addGear(this.fig, opts.paint || {});
    }

    this.pos = new THREE.Vector3(0, -2, 0);
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.yawAim = 0; this.pitchAim = 0;
    this.yawVel = 0; this.pitchVel = 0;

    this.speed = 0;
    this.air = 1;
    /* How much of a bar you actually have. One for a fresh diver, and
       the only thing a mission with no clock in it can take away — The
       Deep shrinks this every trip, which is what eventually ends a
       mode that has no bell. */
    this.airMax = 1;
    this.flow = 0;
    this.carried = 0;
    this.kickT = 0;
    this.kickDur = this.tune.kickTime;
    this.strokeT = 0;
    this.wasStroke = false;
    this.depth = 0;
    this.up = true;              // is the head out of the water right now
    this.aloft = false;          // ...and is the whole body out of it
    this.onLand = false;         // stood on ground above the tideline
    /* On your feet: the walking state, which is a different verb from
       swimming and not simply "touching the bottom". You enter it by
       arriving on ground that is within a wade of the surface and you
       leave it by jumping, by the ground falling away, or by being
       knocked off it — never halfway. */
    this.onFoot = false;
    this.wading = false;         // ...and doing it with water round your knees
    this.grounded = false;       // resting on the floor, wet or dry
    this.landMix = 0;            // 0 prone in the water, 1 upright on the sand
    this.walkSpeed = 0;          // flat ground speed, for the gait
    this.standLock = 0;          // ...and the grace after a jump
    this.underT = 0;             // seconds since it last was
    this.chainIdle = 0;          // seconds since the last stroke that landed
    this.chainGrace = 0.85;      // ...and how long the chain survives without one
    this.holdDeep = 0;           // the deepest point of the breath you are on
    this.swimPhase = 0;

    // one-frame events, cleared at the top of every update
    this.stroked = false; this.onBeat = false; this.surfaced = false;
    this.blackout = false; this.bumped = false; this.grabbed = false;
    /* The waterline, both ways. `splashed` is a body arriving in the
       loch from the air and `launched` is one leaving it, and the
       mission turns both into spray — they are the two loudest moments
       in a trip and neither of them used to make a sound. */
    this.splashed = 0; this.launched = 0; this.jumped = false;
    this.landed = 0;             // ...and hitting the shingle, in m/s
    /* Under a roof. Not an event — a state, held for as long as there
       is rock over your head, because everything that reads it wants
       to know "can this diver still float home" rather than "did they
       just bump something". */
    this.roofed = false;
    this.beatOff = 0;            // how far off the beat the last stroke was
    /* Blacking out is a one-frame event, so something has to remember
       that it has already happened on this breath. Without it the flag
       has to be raised on the *crossing* to zero — and there is more
       than one way to spend the last of a bar. See `_step`. */
    this.drowned = false;

    // cosmetics, all damped and never set directly
    this.effort = 0; this.lean = 0; this.curl = 0; this.trail = 0;
    this.grabT = 0;              // the tuck after a pickup, in seconds

    this._fwd = new THREE.Vector3(0, 0, 1);
    this._up = new THREE.Vector3(0, 1, 0);
    this._right = new THREE.Vector3(1, 0, 0);
    this._lat = new THREE.Vector3();
    this._e = new THREE.Euler();
  }

  /* Mask, fins and a belt, hung off the rig's own joints so they move
     with it rather than beside it. Cheap, and it is the difference
     between a person in the water and a diver. */
  static addGear(fig, paint = {}) {
    const rig = fig.userData && fig.userData.rig;
    if (!rig) return;
    const lam = (c, extra) => new THREE.MeshLambertMaterial(
      Object.assign({ color: c, flatShading: true }, extra || {}));
    const suit = lam(paint.suit || '#123044');
    const glass = lam(paint.glass || '#8ff0ff', {
      transparent: true, opacity: 0.55, emissive: '#2aa9c4', emissiveIntensity: 0.35,
    });
    const fin = lam(paint.fin || '#f2c14e');

    // placed from the head the figure has, so the mask is on the face
    // at eye height rather than wherever the last head's eyes were
    const H = rig.headDims || Figure.HEAD;
    const eyeY = H.eyeY !== undefined ? H.eyeY : H.cy;
    const faceZ = H.faceZ !== undefined ? H.faceZ : H.rz;
    const mask = new THREE.Mesh(new THREE.BoxGeometry(H.rx * 1.55, 0.085, 0.05), glass);
    mask.position.set(0, eyeY, faceZ + 0.008);
    rig.head.add(mask);
    const strap = new THREE.Mesh(new THREE.CylinderGeometry(
      H.rx + 0.012, H.rx + 0.012, 0.034, 20, 1, true),
      lam(paint.suit || '#123044', { side: THREE.DoubleSide }));
    strap.position.y = eyeY + 0.004;
    strap.scale.z = (H.rz + 0.012) / (H.rx + 0.012);
    rig.head.add(strap);

    for (const key of ['l', 'r']) {
      const ank = rig.legs[key] && rig.legs[key].ankle;
      if (!ank) continue;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.03, 0.46), fin);
      blade.position.set(0, -0.02, 0.20);
      blade.rotation.x = 0.12;
      ank.add(blade);
    }

    // a tank on the yoke, because the breath bar has to be a thing you
    // can see on the other two divers as well as read on your own HUD
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.40, 10), suit);
    tank.position.set(0, 0.26, (rig.backZ ? rig.backZ(0.26) : -0.14) - 0.045);
    if (rig.chest) rig.chest.add(tank);
  }

  /* -------------------------------------------------------------- */

  /* `ctl` is a plain object, never Input — the mission owns the
     keyboard and the touch pads, and this owns the swimming.

       move   {x, y}   sculling: strafe / forward trim, -1..1
       yaw    radians the aim moved this frame (mouse or stick)
       pitch  the same, positive is down the way a mouse is
       stroke bool, a rising edge fires a kick
       beat   { sinceBeat, spb } from the score, or null for no chain
  */
  update(dt, ctl, world) {
    if (!(dt > 0)) return;
    const T = this.tune;
    /* `grabbed` is raised by the mission *after* this ran, so it has to
       be turned into something with a duration before it is cleared or
       the tuck it is supposed to trigger never happens. */
    if (this.grabbed) this.grabT = 0.35;
    this.grabT = Math.max(0, this.grabT - dt);
    this.stroked = false; this.onBeat = false; this.surfaced = false;
    this.blackout = false; this.bumped = false; this.grabbed = false;
    this.splashed = 0; this.launched = 0; this.jumped = false; this.landed = 0;

    const c = ctl || {};
    // ---- aim. The mouse is 1:1 with where you are pointing; the body
    // is what has to catch up, and that is where speed costs agility.
    this.yawAim -= (c.yaw || 0);
    this.pitchAim = U.clamp(this.pitchAim - (c.pitch || 0), -T.pitchClamp, T.pitchClamp);

    // ---- the stroke gate, once per frame: a rising edge, not a hold
    this.strokeT = Math.max(0, this.strokeT - dt);
    const want = !!c.stroke;
    if (want && !this.wasStroke && this.strokeT <= 0) {
      /* The same button, and deliberately so. On the sand it is a jump
         and in the water it is a kick, and the only thing the player
         ever learns is "this is how you go". A jump is free — it costs
         no air, because standing on a beach is not a breath-hold. */
      if (this.onFoot) this._jump();
      else if (this.air > 0) this._fire(c.beat);
    }
    this.wasStroke = want;

    // ---- physics, on fixed sub-steps
    let left = dt;
    const h0 = T.step;
    let guard = 0;
    while (left > 1e-6 && guard++ < 240) {
      const h = Math.min(h0, left);
      this._step(h, c, world);
      left -= h;
    }

    this._cosmetics(dt);
  }

  /* A kick starts here and is then integrated by the sub-steps, so the
     impulse a stroke delivers is the same whatever the frame rate. */
  _fire(beat) {
    const T = this.tune;
    this.stroked = true;
    this.strokeT = T.strokeCd;
    this.kickDur = T.kickTime * (1 + T.carryKick * this.carried);
    // a tap that lands mid-kick still counts, and still shortens the glide
    this.kickT = Math.max(this.kickT, this.kickDur);
    this.swimPhase = 0;

    // how far off the beat we were, folded into [-spb/2, +spb/2]
    let off = 0;
    if (beat && beat.spb > 0) {
      const spb = beat.spb;
      off = ((beat.sinceBeat % spb) + spb) % spb;
      if (off > spb * 0.5) off -= spb;
    }
    this.beatOff = off;
    this.onBeat = !!beat && Math.abs(off) <= T.window;

    /* The chain holds while you keep landing them and bleeds the moment
       you stop, which is why the decay is fed by an idle timer rather
       than run every frame: a diver swimming perfectly on the beat is
       *at* full flow, not oscillating a fifth of the way below it. */
    if (this.onBeat) {
      this.flow = Math.min(1, this.flow + T.flowGain);
      this.chainIdle = 0;
      if (beat && beat.spb > 0) this.chainGrace = beat.spb * 1.35;
    } else if (beat) {
      this.flow *= T.flowMiss;   // a missed beat costs most of it, not all
      this.chainIdle = 0;
    }

    const pressure = 1 + Math.max(0, this.depth) / T.pressureRef;
    this.air = Math.max(0, this.air
      - T.airStroke * pressure * (this.onBeat ? T.flowAirScale : 1));
  }

  /* Off the shingle. A jump goes mostly up and partly where you are
     looking, so a standing player hops and a sprinting one arcs out
     over the water — which is what makes going back in at the end of
     every trip an act rather than a fade. */
  _jump() {
    const T = this.tune;
    const cp = Math.cos(this.pitch);
    this.vel.y = T.jumpUp;
    this.vel.x += Math.sin(this.yaw) * cp * T.jumpOut;
    this.vel.z += Math.cos(this.yaw) * cp * T.jumpOut;
    this.onFoot = false;
    this.grounded = false;
    this.jumped = true;
    this.standLock = T.standLockT;
    this.strokeT = T.strokeCd;
  }

  _step(h, c, world) {
    const T = this.tune;
    const v = this.vel;
    this.standLock = Math.max(0, this.standLock - h);

    // ---- attitude: the body swings towards the aim, slower at speed
    const sp0 = v.length();
    const fast = U.clamp(sp0 / T.flowTop, 0, 1);
    const auth = (this.kickT > 0 ? T.kickTurn : 1) * U.lerp(1, T.turnLowSpeed, fast);

    const dYaw = U.wrapAngle(this.yawAim - this.yaw);
    const maxYaw = T.turnRate * auth;
    this.yawVel = U.damp(this.yawVel, U.clamp(dYaw * T.aimGain, -maxYaw, maxYaw),
                         T.aimLambda, h);
    this.yaw += this.yawVel * h;

    const dPitch = this.pitchAim - this.pitch;
    const maxPitch = T.pitchRate * auth;
    this.pitchVel = U.damp(this.pitchVel, U.clamp(dPitch * T.aimGain, -maxPitch, maxPitch),
                           T.aimLambda, h);
    this.pitch = U.clamp(this.pitch + this.pitchVel * h, -T.pitchClamp, T.pitchClamp);

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this._fwd.set(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp);
    /* cross(forward, up), which is the diver's actual right hand rather
       than the perpendicular that happens to be easiest to write. It is
       the difference between pressing D and going right and pressing D
       and going left, and nothing else in the file would have told you. */
    this._right.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));

    /* ================= on your feet =================

       A complete alternative to everything below it, and the reason it
       is written as an early return rather than as a pile of `if
       (!onFoot)` guards: walking is not swimming with different
       numbers. There is no glide, no carve, no buoyancy and no soft
       ceiling — there is a direction you are asking for, legs that
       take it up in about a tenth of a second, and gravity holding you
       on the ground. Everything you are carrying makes it slower, so
       the last twenty metres of a four-chest trip are a trudge and the
       walk back down empty-handed is a sprint. */
    if (this.onFoot) {
      const mvL = c.move || null;
      const ax = mvL ? mvL.x : 0, ay = mvL ? mvL.y : 0;
      const mag = Math.min(1, Math.hypot(ax, ay));
      const top = T.walkTop
        * U.lerp(1, T.walkCarry, U.clamp(this.carried / 4, 0, 1))
        * (this.wading ? T.walkWade : 1);
      if (mag > 0.02) {
        // flat: you walk where you are looking, not where you are aiming
        const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
        const rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
        const dx = rx * ax + fx * ay, dz = rz * ax + fz * ay;
        const dl = Math.hypot(dx, dz) || 1;
        v.x = U.damp(v.x, (dx / dl) * top * mag, T.walkLambda, h);
        v.z = U.damp(v.z, (dz / dl) * top * mag, T.walkLambda, h);
      } else {
        v.x = U.damp(v.x, 0, T.walkStop, h);
        v.z = U.damp(v.z, 0, T.walkStop, h);
      }
      // and the ground keeps you: strong enough to hold you down through
      // a wade, weak enough that a jump still clears it
      v.y -= T.footing * h;
      this.pos.addScaledVector(v, h);
      this.speed = v.length();
      this.walkSpeed = Math.hypot(v.x, v.z);
      this._collide(h, world);
      this._breathe(h);
      this.chainIdle += h;
      if (this.flow > 0 && this.chainIdle > this.chainGrace) {
        this.flow = Math.max(0, this.flow - T.flowDecay * h);
      }
      return;
    }
    this.walkSpeed = U.damp(this.walkSpeed, 0, 6, h);

    // ---- the kick.
    // The shape is sin(pi*u) over the kick, and the impulse across a
    // sub-step is its exact integral rather than a sample of it, so the
    // total a stroke delivers never depends on where the steps landed.
    if (this.kickT > 0) {
      const dur = this.kickDur;
      const u0 = 1 - this.kickT / dur;
      const rem = Math.max(0, this.kickT - h);
      const u1 = 1 - rem / dur;
      const imp = dur * (Math.cos(Math.PI * u0) - Math.cos(Math.PI * u1)) / Math.PI;
      const gain = U.lerp(1, T.flowKick, this.flow) * T.kickAccel * imp;
      v.x += this._fwd.x * gain;
      v.y += this._fwd.y * gain * T.vertBias;
      v.z += this._fwd.z * gain;
      this.kickT = rem;
    }

    // ---- sculling: hands only, for lining a chest up without a stroke
    const mv = c.move || null;
    if (mv && (mv.x || mv.y)) {
      const s = T.scull * h;
      v.x += (this._right.x * mv.x + this._fwd.x * mv.y) * s;
      v.y += this._fwd.y * mv.y * s * T.vertBias;
      v.z += (this._right.z * mv.x + this._fwd.z * mv.y) * s;
    }

    /* ---- buoyancy, or the lack of it.
       Out of the water entirely — off the shingle bank at the start of
       a run, or thrown clear by a swell — you are a body with a mass
       and the water is not holding any of it. In it, the lift at the
       top and the squeeze at the bottom are the two ends of the same
       ramp, and gold is dead weight wherever you are holding it. */
    if (this.aloft) {
      v.y -= T.gravity * h;
    } else {
      const lift = T.surfaceLift * (1 - U.smoothstep(0, T.surfaceLiftTo, this.depth));
      const sink = T.sinkAccel * U.smoothstep(T.sinkFrom, T.sinkTo, this.depth);
      v.y += (T.buoyancy + lift + T.carryBuoy * this.carried + sink) * h;
    }

    // ---- drag, with the boat's soft ceiling on top of it
    let spd = v.length();
    if (spd > 1e-4) {
      const lam = this.aloft
        ? T.airDrag
        : (this.kickT > 0 ? T.kickDrag : T.glideDrag) + T.carryDrag * this.carried;
      const quad = T.quadDrag * (this.aloft ? T.jumpDrag : 1);
      const top = U.lerp(T.topSpeed, T.flowTop, this.flow);
      const over = this.aloft ? 0 : Math.max(0, spd - top);
      const next = Math.max(0, spd - (lam + quad * spd * spd + over * 8) * h);
      v.multiplyScalar(next / spd);
      spd = next;
    }

    // ---- grip and carve.
    // Sideways slide bleeds off, and most of what it loses is handed to
    // the direction you are now pointing. That is what makes a turn
    // held through a glide feel like a line rather than a cost.
    if (spd > 1e-4) {
      const vf = v.dot(this._fwd);
      this._lat.copy(v).addScaledVector(this._fwd, -vf);
      const latBefore = this._lat.length();
      const keep = Math.exp(-T.gripLambda * h);
      this._lat.multiplyScalar(keep);
      const recovered = (latBefore - latBefore * keep) * T.carve;
      v.copy(this._lat).addScaledVector(this._fwd, vf + recovered);
    }

    // ---- move
    this.pos.addScaledVector(v, h);
    this.speed = v.length();

    // ---- the world pushes back
    this._collide(h, world);

    this._breathe(h);

    // ---- the chain bleeds once the beat has gone past unanswered
    this.chainIdle += h;
    if (this.flow > 0 && this.chainIdle > this.chainGrace) {
      this.flow = Math.max(0, this.flow - T.flowDecay * h);
    }

    // ---- the body's own wave: one full cycle per kick, idling in the glide
    const rate = this.kickT > 0 ? (U.TAU / Math.max(0.05, this.kickDur))
                                : U.TAU * (0.30 + 0.045 * this.speed);
    this.swimPhase += rate * h;
  }

  /* ---- breath.
     The blackout is raised on *being* empty rather than on the step
     that emptied you, and latched so it happens once. It used to be
     raised on the crossing, which quietly missed the commonest way a
     deep diver actually runs out: a stroke costs air too, and at
     thirty metres it costs more than a whole frame of drain. Spend the
     last of the bar on a kick rather than on time and the flag never
     fired — no drop, no float, no drowning. The diver simply lay on
     the sand with an empty bar and no way to kick off it for the rest
     of the run.

     Its own method because there are two ways through a sub-step now
     and both of them have to breathe. A diver stood on the shingle is
     filling their lungs, and that is most of why the walk home is
     worth having. */
  _breathe(h) {
    const T = this.tune;
    const pressure = 1 + Math.max(0, this.depth) / T.pressureRef;
    const carry = 1 + T.carryDrain * this.carried;
    if (!this.up) {
      this.air = Math.max(0, this.air - T.airDrain * pressure * carry * h);
      if (this.air <= 0 && !this.drowned) { this.drowned = true; this.blackout = true; }
      this.holdDeep = Math.max(this.holdDeep, this.depth);
    } else {
      // a gasp is fast, but it is not instant — and the deeper the dive
      // you have just come off, the longer you are stuck up here
      const lam = T.gaspRefill
        * U.lerp(1, T.intervalKeep, U.smoothstep(8, T.intervalDeep, this.holdDeep));
      this.air = U.damp(this.air, this.airMax, lam, h);
      // one lungful re-arms it; you do not get two blackouts off one breath
      if (this.air > 0.06) this.drowned = false;
      if (this.air > this.airMax * 0.985) this.holdDeep = 0;
    }
  }

  _collide(h, world) {
    const T = this.tune;
    const w = world || {};
    const r = T.bodyRadius;

    /* The surface. It used to be a lid you could never leave through,
       which was right when the loch had no edges — and wrong the moment
       it got a beach, because a diver stood on the shingle was being
       clamped to fifty-five centimetres under a sea that was not there.

       So the lid only exists where there is water beneath it. Over the
       shore the ground is above the tideline, the lid is lifted, and a
       body out of the water is simply a body: it falls, it lands, and
       it can be thrown off a bank into the loch. */
    const sy = w.surfaceAt ? w.surfaceAt(this.pos.x, this.pos.z) : 0;
    const cap = sy + T.surfaceY;
    const gy = w.heightAt ? w.heightAt(this.pos.x, this.pos.z) + r : -1e9;
    const dryLand = gy > cap;
    /* Shallow enough to stand up in. This is the number that turns the
       swim home into a walk home without a prompt: the ground comes up
       to meet you, your feet find it, and you are wading before you
       have decided to be. */
    const standable = gy > cap - T.wadeDepth;

    const wasAloft = this.aloft;
    if (!dryLand && this.pos.y >= cap) {
      this.pos.y = cap;
      if (this.vel.y > 0) this.vel.y *= -0.12;
    }
    this.aloft = this.pos.y > cap + 0.05;
    /* The waterline, crossed. Both directions are events the mission
       turns into spray, and the speed is carried with them because a
       body falling in off the bank and a head easing up through the
       surface are the same crossing at very different volumes. */
    if (wasAloft && !this.aloft) this.splashed = Math.abs(this.vel.y) + this.speed * 0.35;
    else if (!wasAloft && this.aloft) this.launched = Math.abs(this.vel.y);
    // ...and a diver stood in the shallows is breathing whatever their
    // collision centre thinks: they are a person, not a sphere, and a
    // person stood in a metre of water has their head in the air.
    this.up = this.aloft || this.onFoot || this.pos.y >= cap - T.surfaceBand;
    if (this.up) {
      if (this.underT > 0.05) this.surfaced = true;
      this.underT = 0;
    } else {
      this.underT += h;
    }
    this.depth = Math.max(0, sy - this.pos.y);

    // the seabed — and, past the tideline, the beach
    if (w.heightAt) {
      if (this.pos.y < gy) {
        const fall = -this.vel.y;
        if (this.vel.y < -T.bumpSpeed) this.bumped = true;
        this.pos.y = gy;
        if (this.vel.y < 0) this.vel.y *= (this.aloft ? -0.02 : -0.15);
        // sand is not a wall: it scrubs you off rather than stopping you.
        // On your feet it is your own legs doing the work, so it does not.
        if (!this.onFoot) {
          const scrub = this.aloft ? 6.5 : 2.2;
          this.vel.x *= Math.exp(-scrub * h);
          this.vel.z *= Math.exp(-scrub * h);
        }
        this.grounded = true;
        this.onLand = standable;
        /* Arriving on the shingle. You get on your feet the moment the
           ground under you is shallow enough to stand in, and the
           landing is reported once so the mission can put a crunch and
           a puff of shingle under it. */
        if (standable && !this.onFoot) {
          this.onFoot = true;
          if (fall > 1.2) this.landed = fall;
          /* Arriving carries a swimmer's momentum, and a swimmer moves
             twice as fast as a walker: without this you land on the
             shingle and skate up it. Keep a little of it — coming in
             hot should still put you further up the beach. */
          const flat = Math.hypot(this.vel.x, this.vel.z);
          const capV = T.walkTop * 1.25;
          if (flat > capV) { this.vel.x *= capV / flat; this.vel.z *= capV / flat; }
        }
      } else if (this.pos.y > gy + 0.14) {
        this.grounded = false;
        this.onLand = false;
        this.onFoot = false;
      }
      /* ...and finding your feet from the water, which is the handover
         that actually matters. A floating diver never reaches the sand
         — the surface lift holds them a body's length above it — so
         waiting for a collision means you can only ever stand up on
         dry land, and the wade the whole trip home ends in never
         happens. Instead: if the ground is shallow enough to stand in,
         your head is out, and it is within reach of your feet, you
         stand. It reads as arriving. */
      /* ...and the two guards that stop it from being a nuisance. A
         diver travelling at eight metres a second does not put their
         feet down — they glide over the shallows, which is what makes
         swimming home *past* the shelf a real option — and the half
         second after a jump belongs to the jump, or wading back out
         would plant you again before you had left. */
      if (!this.onFoot && standable && !this.jumped && !this.aloft
          && this.standLock <= 0 && this.speed < T.standSpeed
          && this.vel.y < 1.0 && this.pos.y - gy < T.wadeDepth) {
        this.pos.y = gy;
        this.vel.y = Math.min(this.vel.y, 0);
        this.grounded = true;
        this.onFoot = true;
        this.onLand = true;
      }
      // and the ground falling away underneath you puts you back in the water
      if (this.onFoot && !standable) { this.onFoot = false; this.onLand = false; }
    }
    this.wading = this.onFoot && !dryLand;

    /* ---- the roof.
       The open sea has one rule that every other rule in this swim
       leans on: whatever else goes wrong, *up* works. Stop kicking and
       you rise; black out and you rise; run the bar to nothing at
       forty metres and the water still hands you back to the surface.

       A cave takes that away, and it is the only thing in the mission
       that does. Under a lid the ceiling is the cap — buoyancy pins
       you against rock instead of carrying you home, and the only
       direction out is sideways, on whatever breath you have left.
       Four lines, and they are the entire reason a cave is worth
       eleven thousand pounds. */
    if (w.ceilingAt) {
      const roof = w.ceilingAt(this.pos.x, this.pos.z);
      const lid = roof - r;
      this.roofed = roof < 1e8 && this.pos.y > lid - 2.5;
      if (roof < 1e8 && this.pos.y > lid) {
        if (this.vel.y > T.bumpSpeed) this.bumped = true;
        this.pos.y = lid;
        if (this.vel.y > 0) this.vel.y *= -0.12;
      }
    }

    // the wreck and the boulders, as upright cylinders
    if (w.colliders) {
      for (const cd of w.colliders) {
        if (cd.y0 !== undefined && this.pos.y < cd.y0) continue;
        if (cd.y1 !== undefined && this.pos.y > cd.y1) continue;
        const dx = this.pos.x - cd.x, dz = this.pos.z - cd.z;
        const rr = cd.r + r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d, nz = dz / d;
        this.pos.x = cd.x + nx * rr;
        this.pos.z = cd.z + nz * rr;
        const into = this.vel.x * nx + this.vel.z * nz;
        if (into < 0) {
          if (-into > T.bumpSpeed) this.bumped = true;
          // slide along it, keeping most of the speed you had
          this.vel.x -= nx * into * 1.15;
          this.vel.z -= nz * into * 1.15;
        }
      }
    }

    // and the edge of the reef: a current that turns you back rather
    // than an invisible wall you can pin yourself against
    if (w.radius) {
      const d = Math.hypot(this.pos.x, this.pos.z);
      if (d > w.radius) {
        const nx = this.pos.x / d, nz = this.pos.z / d;
        const push = U.smoothstep(w.radius, w.radius + 20, d) * 9.0;
        this.vel.x -= nx * push * h;
        this.vel.z -= nz * push * h;
      }
    }
  }

  /* Everything here is damped towards a want and nothing is written
     straight, because a cosmetic that snaps is the one thing an
     onlooker will notice before the physics. */
  _cosmetics(dt) {
    const T = this.tune;
    const sp01 = U.clamp(this.speed / T.flowTop, 0, 1);
    this.effort = U.damp(this.effort, this.kickT > 0 ? 1 : 0.12 + sp01 * 0.2, 8, dt);
    this.lean = U.damp(this.lean, U.clamp(-this.yawVel * (0.35 + sp01 * 0.5), -0.5, 0.5), 5, dt);
    this.curl = U.damp(this.curl,
      this.grabT > 0 ? 1 : U.clamp(this.carried / 4, 0, 1) * 0.35, 9, dt);
    this.trail = U.damp(this.trail, this.kickT > 0 ? 1 : sp01 * 0.35, 6, dt);
    /* Standing up. The rig is built along +Y and rolled a quarter turn
       face-down to swim, so coming ashore is that quarter turn played
       backwards — and because it is damped rather than switched, a
       diver arriving in the shallows *gets to their feet* over about a
       third of a second instead of popping upright. The mesh drops by
       a body radius at the same time, so the feet land on the sand
       rather than hovering at the collision centre. */
    this.landMix = U.damp(this.landMix, this.onFoot ? 1 : 0, 7, dt);

    this.group.position.copy(this.pos);
    /* The sign on the pitch is not a taste call.
       Three's YXZ euler turns a *positive* X rotation into a nose-down
       body, while the physics above reads a positive pitch as swimming
       *up* (`_fwd.y = sin(pitch)`). Left matched, the diver's body
       pointed the opposite way to their travel — at full pitch that is
       a hundred and fifty degrees out, which is a diver swimming to the
       surface while lying on their back looking at the sand. */
    const land = this.landMix;
    this._e.set(-this.pitch * (1 - land), this.yaw, this.lean * (1 - land), 'YXZ');
    this.group.quaternion.setFromEuler(this._e);
    this.mesh.position.y = -T.bodyRadius * land;

    if (this.fig) {
      this.fig.rotation.x = (Math.PI / 2) * (1 - land);
      if (this.onFoot) {
        Figure.setSwimming(this.fig, false);
        Figure.setLocomotion(this.fig, this.walkSpeed, -this.yawVel * 0.5, T.walkTop);
        Figure.setHolding(this.fig, this.carried > 0);
      } else {
        Figure.setSwim(this.fig, this.swimPhase, this.effort, this.curl);
        Figure.setHolding(this.fig, false);
      }
      Figure.update(this.fig, dt, this.swimPhase * 0.16);
    }
  }

  /* Pose the body from whatever is currently in `pos`, `yaw`, `flow`
     and the rest, without running any physics. This is how a *remote*
     diver is drawn: their machine owns the swimming, this machine owns
     nothing but the picture. */
  renderPose(dt) { this._cosmetics(dt); }

  get speed01() { return U.clamp(this.speed / this.tune.flowTop, 0, 1); }
  get alive() { return this.air > 0; }

  /* Placing a diver: used by the mission at the start of a run and
     after a blackout, and it has to clear the momentum too or you
     respawn still travelling. */
  place(x, y, z, yaw = 0) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.yaw = this.yawAim = yaw;
    this.pitch = this.pitchAim = 0;
    this.yawVel = this.pitchVel = 0;
    this.kickT = 0; this.strokeT = 0; this.flow = 0;
    this.underT = 0; this.up = true; this.speed = 0; this.holdDeep = 0;
    this.aloft = false; this.onLand = false; this.drowned = false;
    this.onFoot = false; this.wading = false; this.grounded = false;
    this.walkSpeed = 0; this.standLock = 0;
    this.splashed = 0; this.launched = 0; this.jumped = false; this.landed = 0;
    this.air = Math.min(this.air, this.airMax);
    this.group.position.copy(this.pos);
  }

  dispose() {
    if (this.fig) Figure.dispose(this.fig);
    this.fig = null;
  }
}

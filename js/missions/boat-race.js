/* ------------------------------------------------------------------
   boat-race.js — Mission 01: Boat Race.

   Blast down a walled sea channel, thread every gate, ride the swell
   for speed, and bank whatever you earn into the prize pot.

   Every run is a *setup*, not a fixed course: a seed picks the channel,
   the weather and the sea; a mode picks whether the clock counts down
   for money or up for a time; a modifier drawn from a hand of three
   bends the rules in exchange for a bigger payout. Two runs are only
   ever the same race if you asked for the same race.

   Most of what makes it feel good still lives in `_updateCamera` and the
   little `hitStop` / `timeScale` pair: the physics is arcade-simple,
   the *response* to it is where the weight comes from.
------------------------------------------------------------------ */
class BoatRaceMission {

  static CONFIG = {
    seed: 20260829,         // only a fallback — a run normally brings its own
    // Average gap between gates; the real one breathes with the corners.
    // Twice what it was: half as many rings down the same channel, so a
    // gate is a thing you set up for rather than one you fall through.
    hoopSpacing: 300,
    hoopRadius: 12.5,
    hoopRadiusScale: 1,
    hoopHeight: 7.6,        // ring centre above the waterline
    riskChance: 0.42,       // how often a gate gets a second, harder ring
    riskRadiusScale: 0.80,
    riskInset: 4.0,         // how close to the wall the risk ring sits
    riskMult: 3,            // and what it pays for going there
    startTime: 80,
    trialLimit: 300,        // a time trial still has to end sometime
    // What a gate buys you. Tuned so a clean line finishes with time in hand
    // and a sloppy one does not: three quarters of the gates threaded should
    // be a photo finish, not a formality.
    timePerHoop: 6.8,
    timePerfectBonus: 1.2,
    missPenalty: 3.0,       // ...and what fumbling one costs, in seconds
    trialMissPenalty: 2.0,
    // ---- the home stretch ----
    // The last stretch of the channel is where the run is decided: the rings
    // tighten, nearly every gate grows a gold one, and they pay double —
    // but they buy you no more clock than the easy ones did.
    finalFrom: 0.62,        // where it starts, as a fraction of the channel
    finalMult: 2,           // what a gate in it is worth
    finalRingScale: 0.82,   // and how much of a ring is left by then
    finalRiskChance: 0.85,
    trialGain: 3.0,         // seconds *off* the clock per ring, in time trial
    trialPerfectBonus: 1.0,
    moneyPerHoop: 250,
    moneyScale: 1,
    perfectMult: 1.6,
    finishBonus: 2500,
    timeBonusPerSecond: 120,
    boostPerHoop: 0.26,
    maxCombo: 12,
    comboWindow: 9,         // the chain now dies of old age, not just of misses
    rockCount: 72,
    trickMoney: 300,        // per completed rotation, if you land it
    trickCap: 1400,         // most a single landing can pay
    grazeDist: 7,           // how close to rock or wall counts as nerve
    grazeMoney: 150,
    grazeStep: 0.5,
    ghostRate: 0.1,         // 10 Hz is plenty for a boat this size
    // a party's poses: quicker than MissionNet's default, because a boat
    // at sixty knots covers four metres between two of those
    poseRate: 1 / 20,
  };

  static MODES = {
    prize: {
      id: 'prize', name: 'Prize Run',
      blurb: 'The clock counts down. Rings buy you time and fill the pot.',
      // a `b` of null is the first run on this channel; money earned on a
      // run that ended early is still money, so a DNF can hold the record
      better: (a, b) => (a.earned || 0) > (b ? (b.earned || 0) : -1),
    },
    trial: {
      id: 'trial', name: 'Time Trial',
      blurb: 'The clock counts up and every ring knocks seconds off it. One number to beat.',
      // a run that stopped halfway has no time, however small the clock says
      better: (a, b) => {
        if (!a.completed) return false;
        if (!b || !b.completed) return true;
        return (a.finalTime || 1e9) < (b.finalTime || 1e9);
      },
    },
  };

  /* Time of day is a dial of its own, not just something the seed happens
     to deal. `auto` walks the clock on one hour every run, so back-to-back
     races alternate day and night instead of repeating the same afternoon
     — which is what a default seed used to give you all day long. */
  static TOD = [
    { id: 'auto',  name: 'Auto',  blurb: 'The clock moves on an hour every run.' },
    { id: 'day',   name: 'Day',   blurb: 'Daylight, whatever the channel drew.' },
    { id: 'night', name: 'Night', blurb: 'Moonlight. Harder to read, and it pays for it.' },
  ];

  // 0 is no medal; the run's own par is worked out from the course it got
  static MEDALS = [
    null,
    { id: 1, name: 'Bronze', color: '#c98c52' },
    { id: 2, name: 'Silver', color: '#c9d4de' },
    { id: 3, name: 'Gold', color: '#ffd166' },
    { id: 4, name: 'Author', color: '#39e6ff' },
  ];

  /* =================== a run's setup ===================
     All of this is static so the briefing screen can show you exactly
     what you are about to race without building a world first. */

  /* The full shape of what a run reports, in one place, so that a
     counter cannot exist at the start of a race and quietly not exist
     after a restart. */
  static freshStats() {
    return {
      // the line
      place: 1, of: 1, finishGap: 0, finished: false, elapsed: 0,
      // the meter, which everybody can see all race
      boostSpentEarly: 0, boostAtSplit: 0, boostAtFinish: 1,
      boostInLastThird: 0, ledAtSplit: false,
      // the gates
      goldDeclined: 0, goldTaken: 0, perfects: 0, gatesMissed: 0,
      wideGates: [], buoysClipped: 0,
      // the strip
      leadTime: 0, longestStop: 0,
    };
  }

  static normalise(opts = {}) {
    const seed = Number.isFinite(opts.seed)
      ? (Math.floor(opts.seed) >>> 0) || BoatRaceMission.CONFIG.seed
      : U.dailySeed();
    return {
      seed,
      mode: opts.mode === 'trial' ? 'trial' : 'prize',
      tod: BoatRaceMission.TOD.some(t => t.id === opts.tod) ? opts.tod : 'auto',
      modId: opts.modId || null,
      ghost: opts.ghost !== false,
      daily: seed === U.dailySeed(),
    };
  }

  // the same seed always deals the same three cards
  static hand(seed) {
    return Modifiers.draw(U.makeRng((seed ^ 0x2545f491) >>> 0), 3);
  }

  static configFor(mod) {
    const C = Object.assign({}, BoatRaceMission.CONFIG);
    if (mod && mod.config) Object.assign(C, mod.config);
    return C;
  }

  /* Where the auto clock currently stands. It lives in the save rather than
     in the setup, so it keeps moving whichever channel you race — and a
     retry of the run you just did comes back at a different hour. */
  static autoTime() {
    const cur = GameState.settings.raceTime;
    return Conditions.CYCLE.includes(cur) ? cur : Conditions.CYCLE[0];
  }

  static advanceTime() {
    GameState.settings.raceTime = Conditions.nextTime(BoatRaceMission.autoTime());
    GameState.save();
  }

  /* The sea is not the seed's to choose: every race is run on a storm sea
     now — it is the water this boat was built for, and a run that drew glass
     was a different, duller game. Forced last, so nothing can deal its way
     out of it. The hour comes from the setup's own dial; a modifier that
     names an hour (Night Run) still outranks it, because that one was
     chosen on purpose and paid for. */
  static conditionsFor(o, mod) {
    const base = Conditions.forSeed(o.seed);
    const time = o.tod === 'night' ? 'night'
               : o.tod === 'day' ? Conditions.dayTime(base.time)
               : BoatRaceMission.autoTime();
    return Object.assign(base, { time }, (mod && mod.cond) || {}, { sea: 'storm' });
  }

  // everything the setup UI needs, without touching the GPU
  static preview(opts) {
    const o = BoatRaceMission.normalise(opts);
    const mod = Modifiers.byId(o.modId);
    const cond = BoatRaceMission.conditionsFor(o, mod);
    const key = GameState.runKey(o.mode, o.seed, o.modId);
    const rec = GameState.runRecord('boat-race', key);
    return {
      opts: o,
      mod,
      cond,
      name: U.courseName(o.seed),
      conditionText: Conditions.describe(cond),
      hand: BoatRaceMission.hand(o.seed),
      mode: BoatRaceMission.MODES[o.mode],
      payout: Conditions.payout(cond) * (mod ? mod.payout : 1),
      key,
      record: rec,
      bestText: rec.best
        ? (o.mode === 'trial' ? U.clockTime(rec.best.finalTime || 0)
                              : U.money(rec.best.earned || 0))
        : null,
      hasGhost: !!GameState.getGhost('boat-race', key),
    };
  }

  constructor(opts = {}) {
    this.opts = BoatRaceMission.normalise(opts);
    this.seed = this.opts.seed;
    this.mode = this.opts.mode;
    this.modeDef = BoatRaceMission.MODES[this.mode];
    this.mod = Modifiers.byId(this.opts.modId);
    this.flags = Object.assign({}, this.mod && this.mod.flags);
    this.C = BoatRaceMission.configFor(this.mod);
    this.cond = BoatRaceMission.conditionsFor(this.opts, this.mod);
    this.payout = Conditions.payout(this.cond) * (this.mod ? this.mod.payout : 1);
    this.courseName = U.courseName(this.seed);
    this.key = GameState.runKey(this.mode, this.seed, this.opts.modId);

    this.rng = U.makeRng(this.seed);
    this.state = 'idle';          // idle | countdown | racing | finished | failed
    // build() scales this by how long the channel it drew actually is
    this.startTime = this.C.startTime;
    this.time = this.startTime;
    this.deduct = 0;              // seconds knocked off the time-trial clock
    this.money = 0;
    this.combo = 0;
    this.comboT = 0;
    this.bestCombo = 0;
    /* ---- the other two ----
       The channel is a pure function of the seed, so all three clients
       built the same water and nobody has to send any of it. What does
       go on the wire is where each boat is, and that is all. There is
       deliberately no contact between hulls: three clients arbitrating
       a collision is a desync with a splash on it, and racing wheel to
       wheel does not need one to work. */
    this.party = !!opts.party;
    this._seaEpoch = null;        // performance.now() at the shared start
    this.roster = (opts.players || []).filter(p => !p.local);
    this.meId = ((opts.players || []).find(p => p.local) || {}).id || 'you';
    this.agenda = opts.agenda || null;
    this.peers = new Map();
    this.finishes = new Map();
    this._buoyHit = new Set();
    this._fieldT = 0;

    /* Everything the agenda deck can ask a question about. Collected
       whether or not there is an agenda tonight, because a statistic
       that only appears when somebody has a task to do is a statistic
       that tells everyone there is a task. */
    this.stats = BoatRaceMission.freshStats();
    this._splitTaken = false;
    this._stopT = 0;              // the stall being timed right now
    this._prevBoost = 1;          // to measure the meter going down

    this.gatesHit = 0;
    this.perfects = 0;
    this.riskHits = 0;
    this.stretchHits = 0;
    this.tricks = 0;
    this.trickMoney = 0;
    this.grazeMoney = 0;
    this.grazeT = 0;
    this.elapsed = 0;
    this.countdown = 3.999;
    this.shake = 0;
    this.fovKick = 0;
    this.hitStop = 0;             // frames of near-freeze on a big moment
    this.timeScale = 1;
    this.timeScaleTarget = 1;
    this.camDip = 0;              // camera drops on a heavy landing
    this.camPush = 0;             // camera falls back when the boost lights
    this.hint = -1;
    this._inStretch = false;      // has the home stretch announced itself yet
    this._featureSeen = new Set();
    this._frame = {};
    this._surf = {};
    this._tmpV = new THREE.Vector3();
    this._prevPos = new THREE.Vector3();
    this._wasAir = false;

    // ghost state
    this.ghost = null;            // the recording we are racing against
    this.ghostT = 0;
    this.ghostDelta = null;
    this.rec = { x: [], y: [], z: [], yaw: [], s: [] };
    this._recAcc = 0;
  }

  /* =================== build =================== */

  build() {
    const C = this.C;
    const scene = new THREE.Scene();
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 20000);
    this.camera = camera;
    this.baseFov = 62;
    scene.add(camera);

    // ---- weather first: the mountain haze is baked against the fog colour,
    // ---- so the sky has to know what time it is before it is built ----
    const applied = Conditions.apply(this.cond);
    BoatScenery.atmosphere(this.cond);
    document.body.classList.add('boat-race-active');
    const fog = (this.mod && this.mod.fog) || applied.time.fog;
    const wFog = (this.mod && this.mod.waterFog) || applied.time.waterFog;
    scene.fog = new THREE.Fog(Sky.PALETTE.fog, fog.near, fog.far);
    scene.add(Conditions.lights(this.cond));
    this.environmentMap = BoatScenery.environment(scene, this.cond);

    // ---- world ----
    const sky = Sky.build(scene, U.makeRng(this.seed + 7));
    BoatScenery.sky(scene, sky);
    Water.build(scene, { visualProfile: 'highland' });
    // Water.build resets to calm, so the sea state has to go on afterwards
    Conditions.apply(this.cond);
    BoatScenery.atmosphere(this.cond);
    Water.setFog(wFog.near, wFog.far, Sky.PALETTE.fog);

    // The shape of the channel is part of the seed too: a short tight gully
    // and a long open reach should not just be the same course repainted.
    const shape = U.makeRng(this.seed + 61);
    this.path = CourseKit.makePath(U.makeRng(this.seed + 3), {
      segments: shape.int(13, 20),
      segmentLength: shape.range(205, 285),
      halfWidth: shape.range(56, 84),
      widthVary: shape.range(12, 30),
      step: 8,
    });
    // ...so the clock has to know how far it is being asked to cover
    this.startTime = Math.round(C.startTime * U.clamp(this.path.total / 4200, 0.82, 1.30));
    this.time = this.startTime;

    // the throats and bays the path drew for itself are announced as you
    // reach them, so a change in the water reads as a change in the job
    this._featureSeen = new Set();

    this.gates = this._buildGates();
    this.hoops = this.gates.flatMap(g => g.rings);
    const avoid = this.hoops.map(h => ({ x: h.x, z: h.z, r: h.radius + 14 }));

    this.cliffs = CourseKit.buildCliffs(this.path, U.makeRng(this.seed + 11), {
      stride: 1, baseHeight: 30, heightVary: 52, trees: true, visualProfile: 'highland',
    });
    scene.add(this.cliffs);

    const rocks = CourseKit.buildRocks(this.path, U.makeRng(this.seed + 23), {
      count: C.rockCount, avoid, detail: 2, visualProfile: 'highland',
    });
    this.rocks = rocks.mesh;
    this.colliders = rocks.colliders;
    this.rockFoam = rocks.update;
    scene.add(this.rocks, rocks.foam);

    this.shoreFoam = CourseKit.buildShoreFoam(this.path, { spacing: BoatMaterials.low() ? 28 : 17, visualProfile: 'highland' });
    scene.add(this.shoreFoam.mesh);

    this.buoys = CourseKit.buildBuoys(this.path, { spacing: 135 });
    scene.add(this.buoys.mesh);
    this._buildPeers(scene);

    this.startGate = this._buildGateArch(6, '#22d3ee', 'START');
    this.finishGate = this._buildGateArch(this.path.total - 22, '#ffd166', 'FINISH');
    scene.add(this.startGate, this.finishGate);
    BoatScenery.equipment(this);
    this.landmarks = BoatScenery.landmarks(this);

    // ---- boat ----
    this.boat = new Boat({ visualProfile: 'highland', tune: (this.mod && this.mod.tune) || {} });
    scene.add(this.boat.group);
    const p0 = this.path.at(0);
    this.boat.reset(p0.point.x, p0.point.z, Math.atan2(p0.tangent.x, p0.tangent.z));
    this._prevPos.copy(this.boat.pos);

    // ---- the ghost of your best run on this exact setup ----
    if (this.opts.ghost) this._buildGhost();

    // ---- fx ----
    this.fx = new FXSystem(scene, camera, document.getElementById('world-labels'), { sprayMax: BoatMaterials.low() ? 280 : 850, sparkMax: BoatMaterials.low() ? 140 : 380, wake: { conform: true, segments: BoatMaterials.low() ? 64 : 128, life: 4.5 } });
    this.presentation = new BoatFeedback(scene, this.seed, this.cond);
    const sprayMat = this.fx.spray.points.material;
    let liveSpray = true; sprayMat.addEventListener('dispose', () => { liveSpray = false; });
    BoatMaterials.load('spray').ready.then(e => { if (liveSpray && e.texture) sprayMat.uniforms.uMap.value = e.texture; });
    const fireRing = this.fx.rings.fire.bind(this.fx.rings);
    this.fx.rings.fire = (...args) => { if (!BoatMaterials.reduced()) fireRing(...args); };

    this.boostFx = new BoatBoost(scene, this.boat.group, this.fx, '#7ff3ff');
    this._dressPeers(scene);

    this.world = { colliders: this.colliders, path: this.path, hint: -1, _frame: {} };

    // riptide always shoves you the same way down a given channel
    this.ripSign = U.makeRng(this.seed + 77)() < 0.5 ? -1 : 1;

    this.targets = this._computeTargets();
    this._cacheHud();
    /* Which touch overlay belongs to this mission. The shootout says so
       in its own `build`; this one used to rely on being handed the
       default, which is true from the front door and not true after a
       scene — the hill, the table and the fire all switch the pad to
       walking, and only their own dispose puts it back. Saying it here
       makes the boat's controls a fact about the boat rather than a
       fact about what happened to run before it. */

    this._camPos = new THREE.Vector3().copy(this.boat.pos).add(new THREE.Vector3(0, 10, -24));
    this._camLook = new THREE.Vector3().copy(this.boat.pos);
    this._camRoll = 0;
    this.boat.group.position.copy(this.boat.pos);
    this.boat.group.rotation.y = this.boat.heading;
    this._updateHoopVisuals(0, 0);
    this.buoys.update();

    return { scene, camera };
  }

  /* -------- gates --------
     A gate is a plane across the channel holding one or two rings: a safe
     one near the middle of the water, and sometimes a gold one tucked
     against the wall that pays three times as much. That second ring is
     what turns "follow the corridor" into "choose a line". */

  _buildGates() {
    const C = this.C;
    const rng = U.makeRng(this.seed + 101);
    const gates = [];
    const riskCandidates = [];
    const baseR = C.hoopRadius * C.hoopRadiusScale;
    const riskR = baseR * C.riskRadiusScale;

    this._lampGeo = new THREE.IcosahedronGeometry(0.85, 1);
    this._hoopFrameMat = new THREE.MeshLambertMaterial({
      vertexColors: true, flatShading: true,
    });
    this._hoopGeos = [this._lampGeo];

    /* One kit of geometry per size of ring on the course — the two the
       ordinary gates use and the tighter pair the home stretch uses. Rings
       are sized by *building* them smaller rather than by scaling the group,
       because the group carries the pylons down to their pontoons and a
       scaled gate would float its floats above the water. Everything that
       never changes colour is shared, so a gate is a handful of draw calls
       however many of them the channel has. */
    this._ringKit = {};
    const kit = (name, radius, tube) => {
      const ring = new THREE.TorusGeometry(radius, tube, 14, 52);
      const glow = new THREE.TorusGeometry(radius, radius * 0.23, 8, 42);
      const frame = this._buildHoopFrame(radius);
      this._hoopGeos.push(ring, glow, frame);
      this._ringKit[name] = { ring, glow, frame, radius };
    };
    kit('safe', baseR, 0.85);
    kit('risk', riskR, 0.8);
    kit('finalSafe', baseR * C.finalRingScale, 0.85);
    kit('finalRisk', riskR * C.finalRingScale, 0.8);

    // the weave that makes you drive is seeded, so no two channels phrase
    // their gates the same way
    const w1 = rng.range(0.8, 1.5), w2 = rng.range(0.3, 0.7);
    const p1 = rng.range(0, 6.28), p2 = rng.range(0, 6.28);

    this.gateMultSum = 0;         // what par has to expect the course to pay
    let s = 200, idx = 0;
    while (s < this.path.total - 150) {
      const at = this.path.at(s);
      // the last stretch of the channel is the one that decides the run
      const final = s / this.path.total >= C.finalFrom;
      const feat = this.path.featureAt ? this.path.featureAt(s) : null;
      const kind = final ? 'finalSafe' : 'safe';
      const riskKind = final ? 'finalRisk' : 'risk';
      const safeR = this._ringKit[kind].radius;
      const rR = this._ringKit[riskKind].radius;

      const sway = Math.sin(idx * w1 + p1) * 0.5 + Math.sin(idx * w2 + p2) * 0.22;
      const gate = {
        index: idx, s, final, feature: feat ? feat.kind : null,
        cx: at.point.x, cz: at.point.z,
        nx: at.tangent.x, nz: at.tangent.z,   // gate plane normal = travel direction
        state: 'pending', rings: [],
      };

      // How far off the centreline the safe ring is allowed to sit. A throat
      // has no room to weave in and the ring goes down the middle of it; a
      // bay has more room than is any use, so the weave is capped rather
      // than left to put the ring somewhere you would never look.
      const amp = U.clamp(at.half - safeR - 18, 0, 62);
      const safeLat = sway * amp;
      gate.rings.push(this._makeRing(gate, at, safeLat, kind));

      // hard against the opposite wall from wherever the safe line went
      const side = sway >= 0 ? -1 : 1;
      const riskLat = side * (at.half - rR - C.riskInset);
      let chance = final ? Math.max(C.riskChance, C.finalRiskChance) : C.riskChance;
      if (feat && feat.kind === 'bay') chance += 0.25;
      // ...but only where the two rings are actually two lines. In a throat
      // they would overlap, and a gold ring you cannot miss is not a choice.
      const room = Math.abs(riskLat - safeLat) > safeR + rR + 2;
      const candidate = {
        gate, at, riskLat, riskKind, room, added: false,
        // Emergency two-line layout for an exceptionally narrow seed.
        forcedSafeLat: -side * (at.half - safeR - 1),
        forcedRiskLat: side * (at.half - rR - 1),
      };
      riskCandidates.push(candidate);
      if (room && (this.flags.allRisk || rng() < chance)) {
        gate.rings.push(this._makeRing(gate, at, riskLat, riskKind));
        candidate.added = true;
      }

      this.gateMultSum += final ? C.finalMult : 1;
      gates.push(gate);
      idx++;
      // Gates bunch up through the bends and stretch out on the straights, so
      // the course has phrasing — a run-up, a flurry, a breather — instead of
      // a metronome. A throat comes at you faster than that; a bay is the
      // breather before whatever is next.
      const curv = this._curvature(s);
      let step = U.lerp(C.hoopSpacing * 1.5, C.hoopSpacing * 0.68, curv);
      if (feat) step *= feat.kind === 'narrows' ? 0.74 : 1.18;
      if (final) step *= 0.86;
      s += step;
    }

    /* One agenda asks the player to refuse three genuinely optional gold
       rings. Random decoration must not be allowed to make that instruction
       impossible, so sparse seeds are topped up from gates that already
       proved they have room for two distinct lines. */
    let riskChoices = riskCandidates.reduce((n, c) => n + (c.added ? 1 : 0), 0);
    for (const c of riskCandidates.filter(x => x.room)) {
      if (riskChoices >= 3) break;
      if (c.added) continue;
      c.gate.rings.push(this._makeRing(c.gate, c.at, c.riskLat, c.riskKind));
      c.added = true;
      riskChoices++;
    }
    for (const c of riskCandidates.filter(x => !x.room)) {
      if (riskChoices >= 3) break;
      const safe = c.gate.rings.find(h => !h.risk);
      this._moveRing(safe, c.at, c.forcedSafeLat);
      c.gate.rings.push(this._makeRing(c.gate, c.at, c.forcedRiskLat, c.riskKind));
      riskChoices++;
    }
    return gates;
  }

  _moveRing(h, at, lat) {
    if (!h) return;
    const nx = -at.tangent.z, nz = at.tangent.x;
    const x = at.point.x + nx * lat, z = at.point.z + nz * lat;
    h.x = x; h.z = z; h.lat = lat;
    if (h.pos && typeof h.pos.set === 'function') h.pos.set(x, h.pos.y || 0, z);
  }

  // radians of heading change across a 180 m window centred on s
  _rawCurvature(s) {
    const a = this.path.at(Math.max(0, s - 90)).tangent;
    const b = this.path.at(Math.min(this.path.total, s + 90)).tangent;
    return Math.acos(U.clamp(a.x * b.x + a.z * b.z, -1, 1));
  }

  // 0 on a straight, 1 in the tightest bend *this* channel has. Normalising
  // against the course's own maximum is what makes the phrasing survive a
  // seed that happens to draw a gentle path.
  _curvature(s) {
    if (!this._curvMax) {
      let max = 0.02;
      for (let p = 0; p <= this.path.total; p += 25) max = Math.max(max, this._rawCurvature(p));
      this._curvMax = max;
    }
    return U.clamp(this._rawCurvature(s) / this._curvMax, 0, 1);
  }

  _makeRing(gate, at, lat, variant) {
    const C = this.C;
    const K = this._ringKit[variant];
    const radius = K.radius;
    const risk = variant === 'risk' || variant === 'finalRisk';
    const final = variant === 'finalSafe' || variant === 'finalRisk';
    const nx = -at.tangent.z, nz = at.tangent.x;
    const x = at.point.x + nx * lat, z = at.point.z + nz * lat;

    // gold is still the ring against the rocks; violet is the home stretch,
    // so the stretch that pays double is one you can see coming
    const idle = risk ? '#e9b45a' : '#5abcbf';
    const glowIdle = risk ? '#ffca4d' : '#72d8dc';
    const group = new THREE.Group();
    const ring = new THREE.Mesh(K.ring,
      new THREE.MeshLambertMaterial({
        color: risk ? '#7a4c05' : (final ? '#3b2a6b' : '#0e7d92'), emissive: idle,
        emissiveIntensity: 1.5, flatShading: true,
      }));
    const glow = new THREE.Mesh(K.glow,
      new THREE.MeshBasicMaterial({
        color: glowIdle, transparent: true, opacity: 0.22,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
    glow.renderOrder = 3;
    const frame = new THREE.Mesh(K.frame, this._hoopFrameMat);
    const lamp = new THREE.Mesh(this._lampGeo, new THREE.MeshLambertMaterial({
      color: '#ffffff', emissive: idle, emissiveIntensity: 1.6, flatShading: true,
    }));
    lamp.position.set(0, radius + 1.6, 0);
    group.add(ring, glow, frame, lamp);
    group.rotation.y = Math.atan2(at.tangent.x, at.tangent.z);
    this.scene.add(group);

    const h = {
      gate, kind: risk ? 'risk' : 'safe', risk, final,
      mult: final ? C.finalMult : 1,
      x, z, lat,
      baseRadius: radius, radius,
      idle, glowIdle, group, ring, glow, lamp,
      state: 'pending', flash: 0, height: C.hoopHeight + (risk ? 0.8 : 0),
      pos: new THREE.Vector3(x, 0, z),
    };
    return h;
  }

  // pylons down to their pontoons, plus the blades that make the gate legible
  // from a long way up the channel
  _buildHoopFrame(radius) {
    const C = this.C;
    const parts = [];
    const paint = (geo, hex) => {
      const g = geo.index ? geo.toNonIndexed() : geo;
      const col = new THREE.Color(hex);
      const n = g.attributes.position.count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
      g.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
      g.computeVertexNormals();
      return g;
    };
    for (const side of [-1, 1]) {
      const post = new THREE.CylinderGeometry(0.55, 1.0, C.hoopHeight, 14);
      post.translate(side * (radius + 0.9), -C.hoopHeight / 2, 0);
      parts.push(paint(post, '#667b78'));
      const float = new THREE.IcosahedronGeometry(2.3, 2);
      float.translate(side * (radius + 1.6), -C.hoopHeight, 0);
      parts.push(paint(float, '#ac9771'));
    }
    for (let b = 0; b < 8; b++) {
      const a = (b / 8) * Math.PI * 2 + Math.PI / 8;
      const bl = new THREE.BoxGeometry(0.5, 1.7, 0.5);
      bl.rotateZ(a - Math.PI / 2);
      bl.translate(Math.cos(a) * (radius + 1.1), Math.sin(a) * (radius + 1.1), 0);
      parts.push(paint(bl, '#bda471'));
    }
    return Sky.mergeGeometries(parts);
  }

  _bannerTexture(text, color) {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#1b3035'; g.fillRect(0, 0, 1024, 256);
    g.fillStyle = color;
    g.fillRect(0, 0, 1024, 9); g.fillRect(0, 247, 1024, 9);
    g.fillStyle = '#c3a16b';
    for (const x of [28, 954]) { g.fillRect(x, 36, 42, 184); }
    g.fillStyle = '#ece6d2';
    g.font = '600 136px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 512, 136);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  _buildGateArch(s, color, label) {
    const at = this.path.at(s);
    const nx = -at.tangent.z, nz = at.tangent.x;
    const w = Math.min(at.half * 0.92, 58);
    const grp = new THREE.Group();
    const postMat = new THREE.MeshLambertMaterial({ color, flatShading: true });
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.6, 26, 14), postMat);
      post.position.set(at.point.x + nx * w * side, 9, at.point.z + nz * w * side);
      grp.add(post);
      const collar = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.4, 8, 20),
        new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }));
      collar.rotation.x = Math.PI / 2;
      collar.position.set(at.point.x + nx * w * side, 17, at.point.z + nz * w * side);
      grp.add(collar);
      const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(2.8, 2),
        new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: color, emissiveIntensity: 0.9, flatShading: true }));
      ball.position.set(at.point.x + nx * w * side, 23, at.point.z + nz * w * side);
      grp.add(ball);
    }
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 2, 6.5),
      new THREE.MeshBasicMaterial({ map: this._bannerTexture(label, color), side: THREE.DoubleSide })
    );
    banner.position.set(at.point.x, 19.5, at.point.z);
    banner.rotation.y = Math.atan2(at.tangent.x, at.tangent.z) + Math.PI;
    grp.add(banner);
    grp.userData.s = s;
    return grp;
  }

  /* -------- ghost --------
     The recording is your own best run on this exact setup: same seed, same
     mode, same modifier. Anything else would be a lie about where you are. */

  /* -------- the other two boats --------
     Painted from the look each of them chose in the dressing room, so
     the boat coming past you is recognisably a person rather than a
     colour. Solid, unlike the ghost: these are not information, they
     are two people you are racing. */
  _buildPeers(scene) {
    if (!this.party) return;
    for (const p of this.roster) {
      const look = p.look ? Look.resolve(p.look) : null;
      const accent = look ? look.accent : '#f2c14e';
      const coat = look ? look.coat : '#3b4757';
      const mesh = Boat.buildMesh({
        hull: coat, hullLo: coat, stripe: accent, stripe2: accent,
        bottom: '#1d2b34', bottomLo: '#16222a',
        deck: '#cfd9e2', deckDk: '#9fb0bd', accent, glass: '#e8fbff',
      }, 'highland', 'peer');
      const group = new THREE.Group();
      group.add(mesh);
      group.visible = false;
      scene.add(group);
      /* Two boats in the same channel in the same evening light are two
         boats, and the strip only tells you which of them is winning.
         The name goes over the cabin, where you read it off the boat
         you are actually behind. A channel is long, so it fades a long
         way out rather than at the length of a clearing. */
      const tag = Nametag.make(p.name, { accent, near: 220, far: 900 });
      scene.add(tag);
      this.peers.set(p.id, { group, tag, accent, name: p.name, s: 0, boost: 1, speed: 0,
                             seen: false, snaps: [], gap: null, jit: 0, ivl: this.C.poseRate * 1000,
                             delay: 0.12, err: new THREE.Vector3(), errH: 0,
                             base: null, wake: null, boostFx: null, sprayAcc: 0 });
    }
  }

  // the wake and the afterburner each other boat trails; built once the
  // mission's fx exist, which is after the hulls
  _dressPeers(scene) {
    for (const peer of this.peers.values()) {
      peer.wake = new WakeRibbon(scene, {
        conform: true, segments: BoatMaterials.low() ? 40 : 80, life: 3.6,
      });
      peer.boostFx = new BoatBoost(scene, peer.group, this.fx, peer.accent);
    }
  }

  /* What goes on the wire. Beyond the transform: the sender's own clock
     (`t`), so a pose is placed at the moment it was *taken* rather than
     the moment the network got round to delivering it; the velocity,
     so the curve between two poses bends the way the boat was actually
     going; and the height above the sea (`dy`) rather than a bare y,
     because the sea is shared (see `_tickSea`) and a boat drawn on
     *our* swell at its own ride height sits on our water exactly. */
  _sendPose() {
    const b = this.boat;
    const f = this.world.lastFrame;
    const r2 = (v) => Math.round(v * 100) / 100;
    return {
      t: Math.round(performance.now()),
      x: r2(b.pos.x), y: r2(b.pos.y), z: r2(b.pos.z),
      vx: r2(b.vel.x), vz: r2(b.vel.y),
      dy: r2(b.pos.y - Water.sampleHeight(b.pos.x, b.pos.z)),
      h: r2(b.heading), p: r2(b.pitch), r: r2(b.roll),
      s: f ? f.s : 0, b: b.boost, v: b.speed,
      bo: b.boosting ? 1 : 0, a: b.airborne ? 1 : 0,
    };
  }

  /* Every pose is filed against *our* clock at the moment its sender
     took it: their timestamp plus the smallest gap between the two
     clocks the link has shown so far. The quickest packet is the
     truest one, so a slow packet slots in where it belongs instead of
     where it landed — that difference is the stutter. */
  _takePeerPose(id, p) {
    const peer = this.peers.get(id);
    if (!peer || !p) return;
    const now = performance.now();
    const sent = typeof p.t === 'number' ? p.t : now;
    const gap = now - sent;
    if (peer.gap === null || gap < peer.gap) peer.gap = gap;
    peer.jit = U.lerp(peer.jit, gap - peer.gap, 0.12);
    const at = sent + peer.gap;
    const last = peer.snaps[peer.snaps.length - 1];
    if (last && at <= last.at) return;             // overtaken by a newer one
    if (last) peer.ivl = U.lerp(peer.ivl, U.clamp(at - last.at, 10, 500), 0.1);
    peer.snaps.push({ at, p });
    if (peer.snaps.length > 20) peer.snaps.shift();
    peer.s = p.s || 0;
    peer.boost = p.b === undefined ? 1 : p.b;
    peer.speed = p.v || 0;
  }

  /* Where a pose puts a boat at local time `at`, carrying on along its
     velocity for a quarter of a second past the newest one we have. */
  _peerAhead(snap, at, out) {
    const p = snap.p;
    const e = U.clamp((at - snap.at) / 1000, 0, 0.25);
    out.x = p.x + (p.vx || 0) * e;
    out.z = p.z + (p.vz || 0) * e;
    out.dy = p.dy;
    out.y = p.y;
    out.h = p.h; out.p = p.p; out.r = p.r;
    out.bo = p.bo; out.a = p.a;
    return out;
  }

  // a Hermite curve between two poses, steered by their velocities, so a
  // boat carving a corner is drawn carving it rather than cutting it
  _peerBetween(A, B, at, out) {
    const a = A.p, b = B.p;
    const span = Math.max(1, B.at - A.at);
    const u = U.clamp((at - A.at) / span, 0, 1);
    const T = span / 1000;
    if (a.vx !== undefined && b.vx !== undefined) {
      const u2 = u * u, u3 = u2 * u;
      const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u;
      const h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
      out.x = h00 * a.x + h10 * T * a.vx + h01 * b.x + h11 * T * b.vx;
      out.z = h00 * a.z + h10 * T * a.vz + h01 * b.z + h11 * T * b.vz;
    } else {
      out.x = U.lerp(a.x, b.x, u);
      out.z = U.lerp(a.z, b.z, u);
    }
    out.dy = a.dy === undefined || b.dy === undefined ? undefined : U.lerp(a.dy, b.dy, u);
    out.y = U.lerp(a.y, b.y, u);
    out.h = U.angLerp(a.h, b.h, u);
    out.p = U.lerp(a.p, b.p, u);
    out.r = U.lerp(a.r, b.r, u);
    const near = u < 0.5 ? a : b;
    out.bo = near.bo; out.a = near.a;
    return out;
  }

  _updatePeers(dt) {
    if (!this.party) return;
    MissionNet.update(dt);
    const now = performance.now();
    const top = this.boat.tune.topSpeed;
    const raw = this._peerRaw || (this._peerRaw = {});
    const old = this._peerOld || (this._peerOld = {});
    for (const [id, peer] of this.peers) {
      const sn = peer.snaps;
      if (!sn.length || !MissionNet.seen(id)) {
        peer.group.visible = false; Nametag.hide(peer.tag);
        if (peer.boostFx) peer.boostFx.update(dt, { x: 0, y: 0, z: 0, heading: 0, boosting: false, airborne: true });
        if (peer.wake) peer.wake.update(dt);
        continue;
      }
      peer.seen = true;
      peer.group.visible = true;

      /* Drawn a little in the past — one send interval plus whatever
         the link's lateness has been lately — so there is nearly always
         a pose on either side of the moment being drawn. The delay
         drifts rather than jumps, and the clock-gap estimate is let
         creep upward so a link that got slower is re-learnt. */
      peer.gap += dt * 2;
      const want = U.clamp(peer.ivl + peer.jit * 2.5 + 25, 80, 320) / 1000;
      peer.delay = U.damp(peer.delay, want, 1.5, dt);
      const at = now - peer.delay * 1000;

      let j = 0;
      while (j < sn.length && sn[j].at <= at) j++;
      let base = null;
      if (j === 0) this._peerAhead(sn[0], sn[0].at, raw);
      else if (j === sn.length) { base = sn[sn.length - 1]; this._peerAhead(base, at, raw); }
      else this._peerBetween(sn[j - 1], sn[j], at, raw);

      /* The curve is continuous by construction. The one seam is a late
         pose ending a stretch of running ahead on velocity: the boat
         was guessed somewhere and is now known to be somewhere else.
         That difference is eased out over a few frames, not drawn. */
      if (peer.base && peer.base !== base) {
        this._peerAhead(peer.base, at, old);
        peer.err.x += old.x - raw.x;
        peer.err.z += old.z - raw.z;
        peer.errH += U.angLerp(raw.h, old.h, 1) - raw.h;
      }
      peer.base = base;
      const ease = Math.exp(-9 * dt);
      peer.err.multiplyScalar(ease);
      peer.errH *= ease;
      if (peer.err.lengthSq() > 30 * 30) { peer.err.set(0, 0, 0); peer.errH = 0; }

      const x = raw.x + peer.err.x, z = raw.z + peer.err.z;
      const sea = Water.sampleHeight(x, z);
      const y = raw.dy === undefined ? raw.y : sea + raw.dy;
      const h = raw.h + peer.errH;
      peer.group.position.set(x, y, z);
      peer.group.rotation.set(raw.p, h, raw.r, 'YXZ');
      Nametag.show(peer.tag, x, y + 2.9, z, this.camera);

      const airborne = !!raw.a;
      const lit = peer.boostFx.update(dt, { x, y, z, heading: h, boosting: !!raw.bo, airborne, water: sea });
      // the thump carries, if they lit it right beside you
      if (lit && Math.hypot(x - this.boat.pos.x, z - this.boat.pos.z) < 70) AudioBus.play('boostpop');
      this._peerWake(peer, dt, x, y, z, h, airborne, top);
    }
  }

  // foam behind them and spray off the bow, a lighter version of our own
  _peerWake(peer, dt, x, y, z, h, airborne, top) {
    const fx = Math.sin(h), fz = Math.cos(h);
    const rx = fz, rz = -fx;
    const sp = peer.speed || 0;
    const s01 = U.clamp(sp / top, 0, 1.6);
    if (!airborne && sp > 0.5) {
      peer.wake.push(x + fx * Boat.HULL.sternZ, z + fz * Boat.HULL.sternZ, rx, rz,
                     1.5 + s01 * 1.7, U.clamp(sp / 14, 0, 1));
    }
    peer.wake.update(dt);
    const dx = x - this.boat.pos.x, dz = z - this.boat.pos.z;
    if (airborne || sp < 4 || BoatMaterials.reduced() || dx * dx + dz * dz > 260 * 260) return;
    peer.sprayAcc += (2 + s01 * 18) * dt;
    while (peer.sprayAcc >= 1) {
      peer.sprayAcc -= 1;
      const side = Math.random() < 0.5 ? -1 : 1;
      const zc = 2.4 + Math.random() * 1.6;
      const ox = fx * zc + rx * side * (Boat.beamAt(zc) + 0.5);
      const oz = fz * zc + rz * side * (Boat.beamAt(zc) + 0.5);
      this.fx.spray.emit(
        x + ox, y - 0.3, z + oz,
        rx * side * (6 + Math.random() * 8) + fx * sp * 0.22,
        2.2 + Math.random() * 3 + s01 * 3,
        rz * side * (6 + Math.random() * 8) + fz * sp * 0.22,
        0.55 + Math.random() * 0.8, 0.3 + Math.random() * 0.34);
    }
  }

  /* -------- the strip everybody can see --------
     Position down the channel and, crucially, the boost meter. One of
     the agenda cards is "burn the whole meter before halfway", and this is
     the only reason anybody could ever catch it. */
  _updateField(dt) {
    /* Marking the task is a keypress, and a keypress is an edge that
       only exists inside a frame. The strip below is throttled to a few
       times a second, which is fine for a scoreboard and would drop
       most of a button press, so the poll goes above the throttle and
       the drawing stays below it. */
    if (this.agenda) RoomUI.pollMark();
    this._fieldT -= dt;
    if (this._fieldT > 0) return;
    this._fieldT = 0.2;
    /* The task chip is not part of the strip and does not need three
       people to be worth drawing — a rehearsal deals a card too, and a
       Traitor who cannot see how their own task is going is playing a
       different game from the one the verdict is about to judge. */
    if (this.agenda) this._agendaCheckpoint();
 RoomUI.showAgenda();
    if (!this.party) return;

    const f = this.world.lastFrame;
    const rows = [{ playerId: this.meId, name: 'You', s: f ? f.s : 0,
                    boost: this.boat.boost, done: this.state !== 'racing' }];
    for (const [id, peer] of this.peers) {
      rows.push({ playerId: id, name: peer.name, s: peer.s, boost: peer.boost,
                  done: this.finishes.has(id), dim: !peer.seen });
    }
    rows.sort((a, b) => b.s - a.s);
    RoomUI.showField(rows.map((r, i) => ({
      playerId: r.playerId, name: r.name,
      value: r.done ? 'in' : ('P' + (i + 1)),
      meter: r.boost, dim: r.dim,
    })));
  }

  /* -------- buoys --------
     Clipping one knocks it, splashes and makes a noise, which is the
     whole point: it is the loudest tell in the deck and the easiest
     thing in the world to do by accident. */
  _checkBuoys() {
    if (this.state !== 'racing') return;
    const items = this.buoys && this.buoys.items;
    if (!items) return;
    const bx = this.boat.pos.x, bz = this.boat.pos.z;
    for (let i = 0; i < items.length; i++) {
      if (this._buoyHit.has(i)) continue;
      const it = items[i];
      const dx = bx - it.x, dz = bz - it.z;
      if (dx * dx + dz * dz > 16) continue;          // 4m
      this._buoyHit.add(i);
      this.stats.buoysClipped++;
      AudioBus.play('miss');
      this.fx.labels.add('BUOY', new THREE.Vector3(it.x, this.boat.pos.y + 2, it.z),
        { className: 'bad', life: 1.0, rise: 6 });
      this.fx.sparks.emit(it.x, this.boat.pos.y + 1, it.z,
        (Math.random() - 0.5) * 6, 6 + Math.random() * 5, (Math.random() - 0.5) * 6,
        1.6, 0.8, new THREE.Color('#cfe9ff'));
    }
  }

  _buildGhost() {
    const data = GameState.getGhost('boat-race', this.key);
    if (!data || !data.n) return;
    this.ghost = data;

    const mesh = Boat.buildMesh({
      hull: '#9fe9ff', hullLo: '#7fd3ef', stripe: '#39e6ff', stripe2: '#1ea8c9',
      bottom: '#1d5f7d', bottomLo: '#164a63', deck: '#bff0ff', deckDk: '#93d8ec',
      accent: '#d8f6ff', glass: '#e8fbff',
    }, 'highland', 'ghost');
    // one shared translucent treatment, so the ghost reads as information
    // rather than as a second boat you might crash into
    mesh.traverse(o => {
      if (!o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        m.transparent = true;
        m.opacity = 0.34;
        m.depthWrite = false;
        m.fog = true;
      }
      o.renderOrder = 2;
    });
    this.ghostGroup = new THREE.Group();
    this.ghostGroup.add(mesh);
    this.ghostGroup.visible = false;
    this.scene.add(this.ghostGroup);
  }

  // where was the ghost at race-clock `t`?
  _ghostAt(t, out) {
    const g = this.ghost;
    const f = U.clamp(t / g.dt, 0, g.n - 1);
    const i = Math.floor(f), j = Math.min(i + 1, g.n - 1), a = f - i;
    out.x = U.lerp(g.x[i], g.x[j], a);
    out.y = U.lerp(g.y[i], g.y[j], a);
    out.z = U.lerp(g.z[i], g.z[j], a);
    out.yaw = U.angLerp(g.yaw[i], g.yaw[j], a);
    return out;
  }

  // and how long did it take the ghost to reach the point we are at now?
  // `s` is monotonic down the channel, so a plain scan from a remembered
  // index is both correct and free.
  _ghostTimeAt(s) {
    const g = this.ghost;
    let i = this._ghostScan || 0;
    while (i < g.n - 1 && g.s[i] < s) i++;
    this._ghostScan = i;
    if (i === 0) return 0;
    const s0 = g.s[i - 1], s1 = g.s[i];
    const a = s1 > s0 ? (s - s0) / (s1 - s0) : 0;
    return (i - 1 + U.clamp(a, 0, 1)) * g.dt;
  }

  /* -------- medals --------
     Par comes from the course you actually drew, not from a global number,
     so a short twisty channel and a long open one are both worth a gold. */

  _computeTargets() {
    const C = this.C;
    const gates = this.gates.length;
    const swell = Conditions.resolve(this.cond).sea.swell;
    if (this.mode === 'trial') {
      // A clean line holds a bit under three quarters of top speed — less of
      // it the bigger the sea, because a storm spends half the run in the air
      // and the other half climbing. Then it banks the gate deductions.
      const speed = U.clamp(33 - 3.4 * (swell - 1), 25, 35);
      // gateMultSum, not the gate count: the home stretch knocks twice as
      // much off the clock as the rest of the channel does
      const par = Math.max(25, this.path.total / speed - this.gateMultSum * C.trialGain * 2.4);
      return { kind: 'time', par, cuts: [par * 1.30, par * 1.12, par, par * 0.88] };
    }
    // per gate: the base ring, a healthy multiplier, and the gold rings and
    // close calls a good line picks up on the way past — plus an allowance
    // for tricks that scales with the sea, because a big swell hands you far
    // more launches to spin off and par has to expect you to take them
    const par = (this.gateMultSum * C.moneyPerHoop * C.moneyScale * 4.4
                 + gates * C.trickMoney * C.moneyScale * 1.7 * swell
                 + C.finishBonus
                 + this.startTime * C.timeBonusPerSecond * 0.30) * this.payout;
    return { kind: 'money', par, cuts: [par * 0.45, par * 0.70, par * 0.95, par * 1.20] };
  }

  _medalFor(score) {
    const t = this.targets;
    let medal = 0;
    for (let i = 0; i < t.cuts.length; i++) {
      const got = t.kind === 'time' ? score <= t.cuts[i] : score >= t.cuts[i];
      if (got) medal = i + 1;
    }
    return medal;
  }

  _cacheHud() {
    const q = id => document.getElementById(id);
    this.hud = {
      root: q('hud'),
      speed: q('hud-speed'), speedBar: q('hud-speed-bar'),
      time: q('hud-time'), timeLabel: q('hud-time-label'), money: q('hud-money'),
      combo: q('hud-combo'), comboWrap: q('hud-combo-wrap'), comboBar: q('hud-combo-bar'),
      boost: q('hud-boost-fill'), boostWrap: q('hud-boost'),
      progress: q('hud-progress-fill'),
      hoops: q('hud-hoops'),
      ghost: q('hud-ghost'),
      setup: q('hud-setup'),
      center: q('center-msg'),
      vignette: q('speed-vignette'),
      flash: q('screen-flash'),
      surf: q('surf-indicator'),
    };
    if (this.hud.timeLabel) {
      this.hud.timeLabel.textContent = this.mode === 'trial' ? 'Elapsed' : 'Time';
    }
    if (this.hud.setup) {
      const bits = [this.courseName, Conditions.describe(this.cond)];
      if (this.mod) bits.push(this.mod.name);
      this.hud.setup.innerHTML = bits
        .map((b, i) => `<span class="${i === 0 ? 'hs-name' : 'hs-tag'}">${b}</span>`).join('');
    }
    if (this.hud.ghost) this.hud.ghost.classList.toggle('show', !!this.ghost);
  }

  /* =================== lifecycle =================== */

  cinematic() { return MissionCinematics.forMission(this.def.id, this); }

  updateEnvironment(dt, t, camera) {
    Sky.update(dt, camera.position, t);
    this._tickSea(dt);
    Water.follow(camera.position.x, camera.position.z);
    this.boat.group.position.y = Water.sampleHeight(this.boat.pos.x, this.boat.pos.z) + this.boat.tune.draft;
    this.boat.animateFlag(t);
    this._updateHoopVisuals(dt, t);
    this.buoys.update();
    this.shoreFoam.update(dt);
    this.presentation.update(dt, this.boat);
  }

  start() {
    Input.setTouchMode('drive');
    this.state = this.party ? 'waiting' : 'countdown';
    this.countdown = 3.999;
    this.engineSnd = BoatFeedback.audio();
    this.ambSnd = AudioBus.ambience();
    this.ambSnd.set(.12);
    this._startMusic();
    this._lastBeep = 4;
    Screens.show('hud');
    this._setCenter('', '');
    if (this.party) {
      MissionNet.attach('boat-race');
      this._offEvents = MissionNet.on('event', (d, from) => this._onPeerEvent(d, from));
      this._offPose = MissionNet.on('pose', (id, p) => this._takePeerPose(id, p));
      this._agendaCheckpoint();
      RoomUI.showAgenda();
      this._setCenter('READY', 'Waiting for everybody…', 'count');
      MissionNet.waitForStart().then(() => {
        if (!this.scene || this.state !== 'waiting') return;
        this._seaEpoch = performance.now();
        this.state = 'countdown';
        this.countdown = 3.999;
        this._lastBeep = 4;
        this._setCenter('', '');
      });
    }
  }

  /* The sea, in a shared race, is not allowed to be anybody's own.

     The swell is a pure function of time, and every machine used to
     keep its own — seconds since that page happened to load, slowed
     further by every hit-stop and finish-line exhale on that machine
     alone. So the crest under one boat was a trough under the same
     boat on the next screen, and peers sat in or floated over water
     that was not there. In a party the swell is instead pinned to one
     clock that all three start together: held still until the host
     releases the gate, then wall-clock seconds since it did. Wall
     clock, not frame time, so a dropped frame or a hit-stop cannot
     knock one client's sea out of step. The ripples keep their own
     time, so a held swell still shimmers. */
  _tickSea(dt) {
    Water.update(dt);
    if (!this.party) return;
    Water.setWaveTime(this._seaEpoch == null ? 0 : (performance.now() - this._seaEpoch) / 1000);
  }

  /* The score. It opens on a low tremolo while the lights count down,
     plays the count with them, and drops the band on GO. After that the
     gear follows the boat — see `_updateMusic`. */
  _startMusic() {
    if (this.music) this.music.stop(0.3);
    this.music = Music.boat();
    this._musicGear = -1;
    this._musicDownT = 0;
  }

  _updateMusic(dt) {
    const m = this.music;
    if (!m || this.state !== 'racing') return;
    const b = this.boat;
    /* Faster is louder. Boost and the home stretch are always the top
       of the band; dropping a gear has to be earned for a few seconds,
       or every wobble through a ring would be a key change. */
    let want = b.speed01 < 0.45 ? 0 : b.speed01 < 0.8 ? 1 : b.speed01 < 1.05 ? 2 : 3;
    if (b.boosting) want = 3;
    if (this._inStretch) want = Math.max(2, want);
    if (want > this._musicGear) {
      this._musicGear = want; this._musicDownT = 0;
      m.setGear(want, 1.2);
    } else if (want < this._musicGear) {
      this._musicDownT += dt;
      if (this._musicDownT > 3) { this._musicGear = want; this._musicDownT = 0; m.setGear(want, 2); }
    } else this._musicDownT = 0;
    m.setIntensity(U.clamp(0.72 + Math.min(this.combo, 8) * 0.04 + (this._inStretch ? 0.2 : 0), 0, 1.3));
  }

  /* Finishing is the one thing every client has to agree about, and it
     needs no arbitration: everybody hears everybody cross, and a place
     is just how many crossed first. Anyone who never finishes is last,
     which is also true. */
  _onPeerEvent(d, from) {
    if (!d || d.kind !== 'finish') return;
    /* Identity comes from the wire, never from a claim inside it. */
    this.finishes.set(from, d.t);
  }

  _placeNow() {
    const mine = this.elapsed;
    let ahead = 0, best = -Infinity;
    for (const [id, t] of this.finishes) {
      if (id === this.meId) continue;
      if (t < mine) { ahead++; best = Math.max(best, t); }
    }
    return { place: ahead + 1, of: this.peers.size + 1,
             gap: best === -Infinity ? 0 : Math.max(0, mine - best) };
  }

  /* -------- what the deck asks about --------
     Every one of these is also on the shared strip at the moment it is
     being recorded, which is the whole design of the deck: the task is
     never done privately, only done well. Gathered on every run,
     Traitor or not, for the same reason as everything else here — a
     counter that only exists when there is a task announces the task.

     `where` is distance down the channel, which is the number the strip
     is drawn from, so "in front" here means in front there. */
  _trackAgenda(dt) {
    const st = this.stats;
    const fr = this.world.lastFrame;
    const where = fr ? fr.s : 0;
    const total = this.path.total || 1;

    // the meter, in the two halves of the channel the cards care about
    const spent = Math.max(0, this._prevBoost - this.boat.boost);
    if (where < total * 0.5) st.boostSpentEarly += spent;
    if (this.boat.boosting && where > total * (2 / 3)) st.boostInLastThird += dt;
    this._prevBoost = this.boat.boost;

    // the standing, live, off the same positions the strip is drawn
    // from — so the private chip and the public strip never disagree
    let ahead = 0;
    for (const [, p] of this.peers) if (p.s > where) ahead++;
    if (this.peers.size) { st.place = ahead + 1; st.of = this.peers.size + 1; }
    const inFront = this.peers.size > 0 && ahead === 0;
    if (inFront) st.leadTime += dt;

    // the last split: what you brought to it, and whether you led into it
    if (!this._splitTaken && where > total * (2 / 3)) {
      this._splitTaken = true;
      st.boostAtSplit = this.boat.boost;
      st.ledAtSplit = inFront;
    }

    /* A boat that has stopped. Kept as the longest single stall rather
       than a total, because three tenths of a second six times is
       traffic, and one whole second is a decision somebody made. */
    const openWater = where > total * 0.05 && where < total * 0.95;
    if (openWater && this.boat.speed < 3) {
      this._stopT += dt;
      st.longestStop = Math.max(st.longestStop, this._stopT);
    } else this._stopT = 0;

    st.elapsed = this.elapsed;
    st.perfects = this.perfects;
    st.goldTaken = this.riskHits;
  }

  /* The private chip on your own HUD: the task, how far along it is,
     and — the half that makes this deck worth playing — whether the
     alibi is still standing. Nobody else has this element, let alone
     this text: `Session.myAgenda()` is null for everybody who is not a
     Traitor. */
  /* The deck is voice, so there is nothing in `this.stats` left for
     the chip to read. This is still called every time the chip is
     drawn for one reason: it tells the deck when the run has stopped,
     and that is the deadline on marking the card. A task you did not
     mark while the microphone was still open is a task you did not do,
     and this is the line that shuts the window. */
  _agendaCheckpoint() {
    const card = this.agenda;
    if (!card || typeof Agendas === 'undefined') return;
    const over = this.state === 'finished' || this.state === 'failed';
    Agendas.state(card.id, null, over);
  }

  dispose() {
    clearTimeout(this._reportT);
    if (this._offEvents) { this._offEvents(); this._offEvents = null; }
    if (this._offPose) { this._offPose(); this._offPose = null; }
    RoomUI.hideAgenda();
    if (this.party) RoomUI.hideField();
    clearTimeout(this._flashT);
    clearTimeout(this._stretchT);
    if (this.engineSnd) this.engineSnd.stop();
    if (this.ambSnd) this.ambSnd.stop();
    if (this.music) { this.music.stop(0.8); this.music = null; }
    if (this.fx) this.fx.dispose();
    if (this.presentation) this.presentation.dispose();
    document.body.classList.remove('boat-race-active', 'boat-reduced-motion');
    for (const g of this._hoopGeos || []) g.dispose();
    if (this._hoopFrameMat) this._hoopFrameMat.dispose();
    if (this.environmentMap) this.environmentMap.dispose();
    Engine.disposeObject(this.scene);
    Sky.resetPreset();
    Water.setVisualProfile();
    Water.setPalette(Water.DEFAULTS);
    Water.setSeaState({ swell: 1, chop: 1, wind: 0 });
    Water.setFog(340, 3600, Sky.PALETTE.fog);
    this.scene = null;
    if (this.hud) {
      // these three live outside the screens, so nothing else will hide
      // them on the way out: leave them lit and the next mission inherits
      // a SURFING badge over the top of its own game
      this.hud.vignette.style.opacity = 0;
      this.hud.vignette.classList.remove('boost');
      if (this.hud.surf) {
        this.hud.surf.style.opacity = 0;
        this.hud.surf.classList.remove('on');
      }
      this.hud.flash.style.opacity = 0;
      if (this.hud.ghost) this.hud.ghost.classList.remove('show');
      if (this.hud.setup) this.hud.setup.innerHTML = '';
      this._setCenter('', '');
    }
  }

  restart() {
    clearTimeout(this._reportT);
    this.reported = false;
    this.result = null;
    this.state = 'countdown';
    this.countdown = 3.999;
    this.time = this.startTime;
    this.deduct = 0;
    this.money = 0; this.combo = 0; this.comboT = 0; this.bestCombo = 0;
    this._splitTaken = false;
    this._stopT = 0;
    this._prevBoost = 1;
    this._buoyHit = new Set();
    this.stats = BoatRaceMission.freshStats();
    this.gatesHit = 0; this.perfects = 0; this.riskHits = 0; this.stretchHits = 0;
    this.tricks = 0; this.trickMoney = 0; this.grazeMoney = 0; this.grazeT = 0;
    this._airHints = 0;
    this._inStretch = false;
    this._featureSeen = new Set();
    clearTimeout(this._stretchT);
    this.elapsed = 0;
    this.hint = -1; this.world.hint = -1;
    this.hitStop = 0; this.timeScale = 1; this.timeScaleTarget = 1;
    this.camDip = 0; this.camPush = 0; this.shake = 0;
    this._lastBeep = 4;
    this._startMusic();
    this.ghostT = 0; this.ghostDelta = null; this._ghostScan = 0;
    this.rec = { x: [], y: [], z: [], yaw: [], s: [] };
    this._recAcc = 0;
    if (this.ghostGroup) this.ghostGroup.visible = false;
    for (const g of this.gates) g.state = 'pending';
    for (const h of this.hoops) {
      h.state = 'pending'; h.flash = 0; h.radius = h.baseRadius;
      h.group.scale.setScalar(1);
      h.ring.material.emissive.set(h.idle);
      h.lamp.material.emissive.set(h.idle);
      h.glow.material.color.set(h.glowIdle);
    }
    const p0 = this.path.at(0);
    this.boat.reset(p0.point.x, p0.point.z, Math.atan2(p0.tangent.x, p0.tangent.z));
    this._prevPos.copy(this.boat.pos);
    this.fx.wake.clear();
    if (this.boostFx) this.boostFx.reset();
    this.presentation.clear();
    this.fx.labels.clear();
    this._setCenter('', '');
  }

  /* =================== per-frame =================== */

  update(rawDt, t) {
    if (!this.scene) return;
    if (Engine.isPaused()) {
      if (this.engineSnd) this.engineSnd.set(this.boat, true);
      if (this.music) this.music.setPaused(true);
      return;
    }
    if (this.music) this.music.setPaused(false);

    if (Input.pressed('pause') && this.state === 'racing') {
      this._pause();
      return;
    }
    if (Input.pressed('mute')) AudioBus.toggleMute();

    // ---- time dilation: a beat of near-freeze on impact, a long slow
    // ---- exhale over the finish line
    let dt = rawDt;
    if (this.hitStop > 0) {
      this.hitStop -= rawDt;
      dt = rawDt * 0.08;
    } else {
      this.timeScale = U.damp(this.timeScale, this.timeScaleTarget, 4.0, rawDt);
      dt = rawDt * this.timeScale;
    }

    this._tickSea(dt);
    Water.follow(this.boat.pos.x, this.boat.pos.z);

    if (this.state === 'countdown') this._updateCountdown(rawDt);

    // position the rings on the swell *before* testing this frame's crossings
    this._updateHoopVisuals(dt, t);

    const racing = this.state === 'racing';
    const ctl = racing
      ? {
          throttle: Input.throttle(),
          steer: Input.steer(),
          boost: Input.held('boost'),
        }
      : { throttle: 0, steer: 0, boost: false };

    // during the countdown you idle in place; after the finish you coast
    if (this.state === 'finished' || this.state === 'failed') {
      ctl.throttle = 0;
      this.boat.update(dt, ctl, this.world);
    } else if (racing) {
      this._prevPos.copy(this.boat.pos);
      if (this.flags.riptide) this._applyRiptide(dt);
      this.boat.update(dt, ctl, this.world);
    } else {
      this.boat.update(dt * 0.2, ctl, this.world);
      this._prevPos.copy(this.boat.pos);
    }
    this.boat.animateFlag(t);

    if (racing) {
      // a first run's tutorial holds the clock until the controls are learnt
      const clk = (typeof Tutorial !== 'undefined' && Tutorial.holdsClock()) ? 0 : dt;
      this.elapsed += clk;
      if (this.mode === 'prize') this.time -= clk;
      this._trackAgenda(dt);
      this._updateCombo(dt);
      this._checkGates();
      this._checkBuoys();
      this._checkGraze(dt);
      this._checkStretch();
      this._checkFeature();
      this._recordGhost(dt);
      this._checkFinish();
      if (this.mode === 'prize' && this.time <= 0) { this.time = 0; this._fail("TIME'S UP"); }
      if (this.mode === 'trial' && this.elapsed > this.C.trialLimit) this._fail('TOO SLOW');
    }
    this._updateGhost(dt);
    this._updatePeers(dt);
    this._updateField(rawDt);
    /* The whole time there is anybody to see, not only while the clock
       is running. Sending only during the race meant two boats that
       did not exist until GO and froze on the water the moment their
       driver crossed the line — and the line is exactly where three
       people are looking at each other. */
    if (this.party && this.state !== 'idle' && this.state !== 'waiting') {
      MissionNet.pose(rawDt, () => this._sendPose(), this.C.poseRate);
    }

    this.buoys.update();
    if (this.rockFoam) this.rockFoam(dt);
    if (this.shoreFoam) this.shoreFoam.update(dt);
    this._spawnFx(dt);
    this.fx.update(dt);
    this.presentation.update(dt, this.boat);
    this._updateCamera(rawDt);
    Sky.update(dt, this.camera.position, t);
    this._updateAudio();
    this._updateMusic(rawDt);
    this._updateHud(rawDt);
  }

  _updateCountdown(dt) {
    this.countdown -= dt;
    const n = Math.ceil(this.countdown);
    if (n < this._lastBeep && n >= 0) {
      this._lastBeep = n;
      if (n > 0) {
        AudioBus.play('countdown', {});
        if (this.music) this.music.stinger('count', { n });
        this._setCenter(String(n), '', 'count');
      } else {
        AudioBus.play('countdown', { go: true });
        if (this.music) {
          this.music.stinger('go');
          this.music.setGear(0, 0.1);
          this._musicGear = 0;
        }
        this._setCenter('GO!', '', 'go');
        this.fovKick = 10;
        setTimeout(() => this._setCenter('', ''), 700);
      }
    }
    if (this.countdown <= 0) {
      this.state = 'racing';
      this.boat.boost = 1;
      // the "burn it early" card measures the meter going down, so the
      // first frame of the race must not read as a meter already spent
      this._prevBoost = this.boat.boost;
    }
  }

  /* -------- the shape of a run --------
     A race that is the same job from the start line to the finish is one you
     have finished after two goes. These two are the beats: the water changes
     under you, and then the last stretch turns the screw. */

  _checkStretch() {
    if (this._inStretch) return;
    const f = this.world.lastFrame;
    if (!f || f.s < this.path.total * this.C.finalFrom) return;
    this._inStretch = true;
    this._setCenter('HOME STRETCH', `Tighter rings · gates pay ×${this.C.finalMult}`, 'go');
    this._flash(0.28, '#b98cff');
    this.fovKick = Math.min(this.fovKick + 8, 16);
    AudioBus.play('perfect', { combo: 6 });
    if (this.music) this.music.stinger('boost', { at: 'beat' });
    clearTimeout(this._stretchT);
    this._stretchT = setTimeout(() => {
      if (this.state === 'racing') this._setCenter('', '');
    }, 1600);
  }

  // the throats and bays name themselves as you reach them
  _checkFeature() {
    const f = this.world.lastFrame;
    if (!f) return;
    const feat = this.path.featureAt ? this.path.featureAt(f.s) : null;
    if (!feat || this._featureSeen.has(feat)) return;
    this._featureSeen.add(feat);
    this.fx.labels.add(feat.name.toUpperCase(),
      this._tmpV.copy(this.boat.pos).setY(this.boat.pos.y + 6),
      { className: 'air', life: 1.3, rise: 9 });
  }

  // a cross-current, always the same way down a given channel
  _applyRiptide(dt) {
    const f = this.world.lastFrame;
    if (!f) return;
    const nx = -f.tangent.z * this.ripSign, nz = f.tangent.x * this.ripSign;
    const push = this.flags.riptide * dt;
    this.boat.vel.x += nx * push;
    this.boat.vel.y += nz * push;
  }

  /* -------- the chain --------
     It used to break only on a miss, which made hanging back the safe play.
     Now it also dies of old age, so the correct move is to keep moving. */

  _touchCombo() {
    this.comboT = this.C.comboWindow;
  }

  _updateCombo(dt) {
    if (this.combo <= 0) return;
    this.comboT -= dt;
    if (this.comboT > 0) return;
    this.combo = 0;
    this.comboT = 0;
    this.fx.labels.add('CHAIN COLD', this._tmpV.copy(this.boat.pos).setY(this.boat.pos.y + 3),
      { className: 'bad', life: 1.1, rise: 7 });
    AudioBus.play('miss');
  }

  /* -------- gate detection --------
     One plane test per gate, then a lateral test per ring on it. Doing it
     per gate is what lets a pair of rings share a crossing: taking either
     one clears the gate, and the one you did not take is skipped rather
     than counted against you. */

  _checkGates() {
    const f = this.world.lastFrame;
    const s = f ? f.s : 0;
    const px = this._prevPos.x, pz = this._prevPos.z, py = this._prevPos.y;
    const cx = this.boat.pos.x, cz = this.boat.pos.z, cy = this.boat.pos.y;

    for (const gate of this.gates) {
      if (gate.state !== 'pending') continue;
      if (Math.abs(gate.s - s) > 420) continue;

      const dPrev = (px - gate.cx) * gate.nx + (pz - gate.cz) * gate.nz;
      const dCur = (cx - gate.cx) * gate.nx + (cz - gate.cz) * gate.nz;

      if (dPrev < 0 && dCur >= 0) {
        // where exactly did we cross the gate's plane?
        const a = dPrev / (dPrev - dCur || 1e-6);
        const ix = U.lerp(px, cx, a), iy = U.lerp(py, cy, a), iz = U.lerp(pz, cz, a);
        const rx = -gate.nz, rz = gate.nx;

        /* Score every ring on the plane, then keep the best pass.

           The test used to be the boat's centre point inside the ring, so
           a hull that was visibly half through the hoop scored nothing.
           It is now the hull: any of it inside the ring's opening counts.
           A ring the centre is truly inside still beats one the hull only
           grazes, so the graze allowance can never steal a pass from the
           ring beside it — and within each of those, a risk ring outranks
           the safe one it shares a gate with. */
        const beam = Boat.HULL.halfBeam, top = 2.2, keel = 0.64;
        let best = null;
        for (const h of gate.rings) {
          const dLat = (ix - h.x) * rx + (iz - h.z) * rz;
          const dVert = iy - h.pos.y;
          // the point of the hull's box (beam wide, keel to cabin top)
          // nearest the ring's centre, and whether it is in the opening
          const nLat = Math.max(0, Math.abs(dLat) - beam);
          const nVert = dVert < 0 ? Math.min(0, dVert + top) : Math.max(0, dVert - keel);
          if (Math.hypot(nLat, nVert) >= h.radius - 0.4) continue;
          const inside = Math.hypot(dLat, dVert) < h.radius;
          // centring is measured against the ring's sweet spot — roughly
          // where a hull actually rides through it
          const sweet = Math.hypot(dLat, (dVert + h.height * 0.62) * 0.7);
          const cand = { h, sweet, inside };
          if (!best) best = cand;
          else if (inside !== best.inside) { if (inside) best = cand; }
          else if (h.risk !== best.h.risk) { if (h.risk) best = cand; }
          else if (sweet < best.sweet) best = cand;
        }
        if (best) this._hitRing(best.h, best.sweet);
        else {
          /* Missed, but *how* missed matters. Going round the outside
             of the marker is one of the tasks, so it is counted
             separately from clipping the frame — and it is the version
             the other two can actually see from behind you. */
          const latC = (ix - gate.cx) * rx + (iz - gate.cz) * rz;
          const wide = Math.abs(latC) > (gate.rings[0].radius * 1.35);
          if (wide) this.stats.wideGates.push(gate.i === undefined ? gate.s : gate.i);
          this._missGate(gate);
        }
      } else if (dCur > 55) {
        this._missGate(gate);
      }
    }
  }

  _hitRing(h, radialDist) {
    const C = this.C;
    const gate = h.gate;
    gate.state = 'hit';
    h.state = 'hit';
    h.flash = 1;
    this.gatesHit++;
    this.combo = Math.min(this.combo + 1, C.maxCombo);
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this._touchCombo();

    // anything else on this gate was a road not taken, not a miss
    for (const other of gate.rings) {
      if (other === h || other.state !== 'pending') continue;
      /* A gold ring you were lined up for and did not take. It is the
         difference between a cheap run and an unlucky one, and it is
         the only trace the cold-gold card leaves. */
      if (other.risk && !h.risk) this.stats.goldDeclined++;
      this._dimRing(other, 'skipped');
    }

    const perfect = radialDist < h.radius * 0.30;
    if (perfect) this.perfects++;
    if (h.risk) this.riskHits++;
    if (h.final) this.stretchHits++;
    const mult = 1 + Math.floor(this.combo / 2) * 0.5;
    const risk = h.risk ? C.riskMult : 1;
    const amount = Math.round(C.moneyPerHoop * C.moneyScale * mult * risk * h.mult
                              * (perfect ? C.perfectMult : 1));
    this.money += amount;

    if (this.mode === 'trial') {
      this.deduct += (C.trialGain + (perfect ? C.trialPerfectBonus : 0)) * risk * h.mult;
    } else {
      // Deliberately *not* multiplied by h.mult: the home stretch pays double
      // and buys you nothing. That is the squeeze — the clock you arrive with
      // is the clock you finish on.
      this.time += (C.timePerHoop + (perfect ? C.timePerfectBonus : 0)) * (h.risk ? 1.6 : 1);
    }
    this.boat.addBoost((C.boostPerHoop + (perfect ? 0.1 : 0)) * (h.risk ? 1.5 : 1));

    const col = h.risk ? '#ffb020' : (perfect ? '#ffd166' : '#3ddc84');
    h.ring.material.emissive.set(col);
    h.lamp.material.emissive.set(col);
    h.glow.material.color.set(col);

    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, h.group.rotation.y, 0));
    this.fx.rings.fire(h.pos, q, h.radius * 0.9, h.radius * 2.5, 0.55,
      perfect || h.risk ? '#ffd166' : '#7dfcd0');
    if (perfect || h.risk) {
      // a second, slower ring so a perfect visibly outranks a good one
      this.fx.rings.fire(h.pos, q, h.radius * 0.4, h.radius * 3.4, 0.9, '#fff3c4');
      this.hitStop = Math.max(this.hitStop, h.risk ? 0.07 : 0.055);
    }

    // what this particular ring was worth over a plain one, so a gold ring in
    // the home stretch says ×6 rather than lying about half of itself
    const ringMult = risk * h.mult;
    const tag = ringMult > 1 ? `${h.risk ? 'RISK' : 'STRETCH'} ×${ringMult}  `
                             : (perfect ? 'PERFECT  ' : '');
    this.fx.labels.add(tag + U.money(amount) + (mult > 1 ? `  ×${mult}` : ''), h.pos, {
      className: h.risk ? 'perfect' : (perfect ? 'perfect' : 'good'), life: 1.5, rise: 11,
    });

    this.fovKick = Math.min(this.fovKick + (perfect || h.risk ? 7.0 : 4.0), 14);
    this._flash(perfect || h.risk ? 0.34 : 0.18, h.risk ? '#ffb020' : (perfect ? '#ffd166' : '#7dfcd0'));
    AudioBus.play('boat-cue', { kind: h.risk ? 'risk' : perfect ? 'perfect' : 'safe' });
    if (this.music && (perfect || h.risk)) this.music.stinger('perfect');
    AudioBus.play('whoosh', { amount: 0.6 + this.boat.speed01 * 0.7 });
    Input.haptic(perfect ? 24 : 12);

    // sparks through the ring
    const c = new THREE.Color(h.risk ? '#ffb020' : (perfect ? '#ffd166' : '#7dfcd0'));
    const n = BoatMaterials.reduced() ? 0 : BoatMaterials.low() ? 12 : perfect || h.risk ? 32 : 18;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = h.radius * (0.7 + Math.random() * 0.4);
      const rx = -h.gate.nz, rz = h.gate.nx;
      this.fx.sparks.emit(
        h.x + rx * Math.cos(a) * rr, h.pos.y + Math.sin(a) * rr, h.z + rz * Math.cos(a) * rr,
        rx * Math.cos(a) * 8 + (Math.random() - 0.5) * 5,
        Math.sin(a) * 8 + 2,
        rz * Math.cos(a) * 8 + (Math.random() - 0.5) * 5,
        1.8 + Math.random() * 1.8, 0.6 + Math.random() * 0.55, c);
    }
  }

  _dimRing(h, state) {
    h.state = state;
    const missed = state === 'miss';
    h.ring.material.emissive.set(missed ? '#8a3242' : '#3c4a55');
    h.lamp.material.emissive.set(missed ? '#8a3242' : '#3c4a55');
    h.glow.material.color.set(missed ? '#ff5470' : '#5d6f7d');
    h.glow.material.opacity = 0.07;
  }

  /* A missed gate used to cost nothing but the chain, which is why a prize
     run could not really be lost: the clock only ever went up. Now it bites,
     and a run you have been sloppy in is a run you can run out of. */
  _missGate(gate) {
    const C = this.C;
    gate.state = 'miss';
    this.stats.gatesMissed++;
    for (const h of gate.rings) if (h.state === 'pending') this._dimRing(h, 'miss');
    const at = gate.rings[0].pos;

    if (this.state === 'racing') {
      const cost = this.mode === 'trial' ? C.trialMissPenalty : C.missPenalty;
      if (this.mode === 'trial') this.deduct -= cost;
      else this.time = Math.max(0, this.time - cost);
      this.fx.labels.add(`MISSED  −${cost.toFixed(0)}s`
                         + (this.combo >= 3 ? '  CHAIN LOST' : ''), at,
        { className: 'bad', life: 1.3, rise: 8 });
      this._flash(0.2, '#ff5470');
      AudioBus.play('miss');
    }
    this.combo = 0;
    this.comboT = 0;
  }

  /* -------- nerve --------
     Running the wall or shaving a rock at speed pays, because the safest
     line down the middle should not also be the most profitable one. */

  _checkGraze(dt) {
    const C = this.C;
    const b = this.boat;
    const f = this.world.lastFrame;
    if (!f || b.airborne || b.speed < 22) { this.grazeT = 0; return; }

    let gap = f.half - Math.abs(f.lateral);
    for (const c of this.colliders) {
      const dx = b.pos.x - c.x, dz = b.pos.z - c.z;
      if (Math.abs(dx) > 60 || Math.abs(dz) > 60) continue;
      gap = Math.min(gap, Math.hypot(dx, dz) - c.r - b.tune.hullRadius);
    }
    if (gap > C.grazeDist || gap < 0) { this.grazeT = 0; return; }

    this.grazeT += dt;
    if (this.grazeT < C.grazeStep) return;
    this.grazeT -= C.grazeStep;
    const amount = Math.round(C.grazeMoney * C.moneyScale * (1 + b.speed01 * 0.8));
    this.money += amount;
    this.grazeMoney += amount;
    this.boat.addBoost(0.04);
    this.fx.labels.add('CLOSE!  ' + U.money(amount),
      this._tmpV.copy(b.pos).setY(b.pos.y + 3.4), { className: 'good', life: 1.0, rise: 8 });
    AudioBus.play('whoosh', { amount: 1 });
  }

  /* -------- ghost -------- */

  _recordGhost(dt) {
    const C = this.C;
    this._recAcc += dt;
    if (this._recAcc < C.ghostRate) return;
    this._recAcc -= C.ghostRate;
    const b = this.boat, f = this.world.lastFrame;
    const r = this.rec;
    // one decimal is a centimetre or so at this scale, and keeps the
    // recording small enough to sit in localStorage without thought
    r.x.push(Math.round(b.pos.x * 10) / 10);
    r.y.push(Math.round(b.pos.y * 10) / 10);
    r.z.push(Math.round(b.pos.z * 10) / 10);
    r.yaw.push(Math.round(b.heading * 1000) / 1000);
    r.s.push(Math.round((f ? f.s : 0) * 10) / 10);
  }

  _updateGhost(dt) {
    if (!this.ghost || !this.ghostGroup) return;
    if (this.state === 'racing') this.ghostT += dt;
    const g = this.ghost;
    const done = this.ghostT >= (g.n - 1) * g.dt;
    this.ghostGroup.visible = this.state !== 'idle' && !done;
    if (!this.ghostGroup.visible) return;
    const p = this._ghostAt(this.ghostT, this._ghostPos || (this._ghostPos = {}));
    this.ghostGroup.position.set(p.x, p.y, p.z);
    this.ghostGroup.rotation.y = p.yaw;

    const f = this.world.lastFrame;
    if (f && this.state === 'racing') this.ghostDelta = this.elapsed - this._ghostTimeAt(f.s);
  }

  _checkFinish() {
    const f = this.world.lastFrame;
    if (!f) return;
    if (f.s >= this.path.total - 26) this._finish();
  }

  /* -------- end states -------- */

  _clock() {
    return this.mode === 'trial'
      ? Math.max(0, this.elapsed - this.deduct)
      : Math.max(0, this.time);
  }

  _finish() {
    if (this.state !== 'racing') return;
    this.state = 'finished';
    /* The line, as the deck sees it: what was left in the meter when
       you crossed it, and how long it took you. Recorded on every run,
       because a statistic that only appears in a party is one that
       appears exactly when somebody has a task. */
    this.stats.boostAtFinish = this.boat.boost;
    this.stats.elapsed = this.elapsed;
    this.stats.finished = true;
    if (this.party) {
      MissionNet.event({ kind: 'finish', t: this.elapsed });
      const pl = this._placeNow();
      this.stats.place = pl.place;
      this.stats.of = pl.of;
      this.stats.finishGap = pl.gap;
    }
    const C = this.C;
    const trial = this.mode === 'trial';
    const finalTime = trial ? this._clock() : 0;
    // in a prize run the clock you saved pays; in a trial, beating par does
    const timeBonus = trial
      ? Math.round(Math.max(0, this.targets.par - finalTime) * C.timeBonusPerSecond)
      : Math.round(this.time * C.timeBonusPerSecond);
    const raw = this.money + C.finishBonus + timeBonus;
    const earned = Math.round(raw * this.payout);
    const medal = this._medalFor(trial ? finalTime : earned);

    AudioBus.play('finish');
    if (this.music) {
      // a fanfare for a win or a solo run; something smaller for a place
      this.music.stinger(this.stats.place > 1 ? 'finish-low' : 'finish');
      this.music.setGear(0, 2);
      this.music.setIntensity(0.6);
    }
    this._setCenter('COURSE COMPLETE',
      trial ? U.clockTime(finalTime) : U.money(earned), 'go');
    // a long slow exhale over the line
    this.timeScaleTarget = 0.35;
    this.fovKick = 12;
    this._confetti();
    this.result = this._buildResult({
      completed: true, earned, raw, timeBonus, finalTime, medal,
      finishBonus: C.finishBonus,
    });
    this._reportT = setTimeout(() => this._report(), 1900);
  }

  _confetti() {
    const b = this.boat;
    const cols = ['#ffd166', '#e5133f', '#3ddc84', '#39e6ff', '#ffffff'];
    for (let i = 0, n = BoatMaterials.reduced() ? 0 : BoatMaterials.low() ? 55 : 120; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 6 + Math.random() * 22;
      const c = new THREE.Color(cols[(Math.random() * cols.length) | 0]);
      this.fx.sparks.emit(
        b.pos.x + (Math.random() - 0.5) * 8, b.pos.y + 2 + Math.random() * 5,
        b.pos.z + (Math.random() - 0.5) * 8,
        Math.cos(a) * sp, 8 + Math.random() * 16, Math.sin(a) * sp,
        1.4 + Math.random() * 1.8, 1.6 + Math.random() * 1.4, c);
    }
  }

  _fail(headline) {
    if (this.state !== 'racing') return;
    this.state = 'failed';
    // never crossing the line is last, which is both simple and true
    this.stats.place = this.peers.size + 1;
    this.stats.of = this.peers.size + 1;
    this.stats.finished = false;
    AudioBus.play('miss');
    if (this.music) {
      this.music.stinger('fail');
      this.music.setGear(0, 2);
      this.music.setIntensity(0.5);
    }
    this._setCenter(headline || "TIME'S UP", '', 'bad');
    this.timeScaleTarget = 0.5;
    // half the rings still count — unless you took the modifier that says
    // they do not
    const kept = this.flags.allOrNothing ? 0 : Math.round(this.money * 0.5 * this.payout);
    this.result = this._buildResult({
      completed: false, earned: kept, raw: this.money, timeBonus: 0,
      finalTime: this.mode === 'trial' ? this._clock() : 0, medal: 0, finishBonus: 0,
      reason: headline || "TIME'S UP",
    });
    this._reportT = setTimeout(() => this._report(), 1800);
  }

  _buildResult(part) {
    return Object.assign({
      mode: this.mode,
      modeName: this.modeDef.name,
      seed: this.seed,
      courseName: this.courseName,
      conditionText: Conditions.describe(this.cond),
      modId: this.opts.modId,
      modName: this.mod ? this.mod.name : null,
      payout: this.payout,
      key: this.key,
      hoopMoney: this.money,
      trickMoney: this.trickMoney,
      grazeMoney: this.grazeMoney,
      timeLeft: Math.max(0, this.time),
      elapsed: this.elapsed,
      hoops: this.gatesHit,
      totalHoops: this.gates.length,
      perfects: this.perfects,
      riskHits: this.riskHits,
      stretchHits: this.stretchHits,
      tricks: this.tricks,
      bestCombo: this.bestCombo,
      par: this.targets.par,
      targetKind: this.targets.kind,
      place: this.stats.place,
      of: this.stats.of,
      stats: Object.assign({}, this.stats,
                           { perfects: this.perfects, goldTaken: this.riskHits,
                             elapsed: this.elapsed }),
    }, part);
  }

  _report() {
    if (this.reported || !this.result) return;
    this.reported = true;
    const r = this.result;

    // one hour on, so the next run — including a straight retry of this one —
    // is not the race you have just finished, repainted
    if (this.opts.tod === 'auto') BoatRaceMission.advanceTime();

    // per-course record, keyed by the whole setup
    const { isBest } = GameState.recordRun('boat-race', this.key, r, this.modeDef.better);
    r.courseBest = isBest;
    r.ghostDelta = this.ghost && this.ghostDelta !== null ? this.ghostDelta : null;

    // a ghost is only worth keeping if it actually got to the end and beat
    // whatever was there before
    if (r.completed && isBest && this.rec.x.length > 4) {
      GameState.saveGhost('boat-race', this.key, {
        dt: this.C.ghostRate, n: this.rec.x.length,
        x: this.rec.x, y: this.rec.y, z: this.rec.z, yaw: this.rec.yaw, s: this.rec.s,
        time: this.mode === 'trial' ? r.finalTime : this.elapsed,
      });
    }
    Missions.complete(r);
  }

  _pause() {
    if (this.engineSnd) this.engineSnd.set(this.boat, true);
    Engine.setPaused(true);
    document.getElementById('pause-restart').hidden = !!this.party;
    Screens.show('pause');
  }

  /* -------- visuals -------- */

  _updateHoopVisuals(dt, t) {
    const bx = this.boat.pos.x, bz = this.boat.pos.z;
    // "Closing In": the rings tighten as the chain grows, so the run gets
    // harder exactly as it gets valuable
    const shrink = this.flags.shrinkRings
      ? U.lerp(1, 0.62, this.combo / this.C.maxCombo) : 1;

    for (const h of this.hoops) {
      const d2 = (h.x - bx) ** 2 + (h.z - bz) ** 2;
      const near = d2 < 1100 * 1100;
      h.group.visible = near;
      if (!near) continue;
      if (h.state === 'pending') h.radius = h.baseRadius * shrink;
      Water.sampleSurface(h.x, h.z, this._surf);
      const y = this._surf.height + h.height;
      h.group.position.set(h.x, y, h.z);
      h.pos.set(h.x, y, h.z);
      h.group.rotation.z = Math.atan2(this._surf.nx, this._surf.ny) * 0.35;
      h.group.rotation.x = -Math.atan2(this._surf.nz, this._surf.ny) * 0.2;
      if (h.state === 'pending') {
        const beat = h.risk ? 4.6 : (h.final ? 3.8 : 3);
        const pulse = BoatMaterials.reduced() ? .65 : .65 + Math.sin(t * beat + h.gate.index) * .12;
        h.ring.material.emissiveIntensity = pulse;
        h.lamp.material.emissiveIntensity = 0.8 + pulse;
        h.glow.material.opacity = 0.025 + pulse * 0.025;
        const s = (1 + (BoatMaterials.reduced() ? 0 : Math.sin(t * beat + h.gate.index) * 0.005)) * shrink;
        h.group.scale.setScalar(s);
      } else if (h.flash > 0) {
        h.flash = Math.max(0, h.flash - dt * 1.6);
        h.ring.material.emissiveIntensity = BoatMaterials.reduced() ? .65 : .7 + h.flash * .7;
        h.lamp.material.emissiveIntensity = BoatMaterials.reduced() ? .8 : .7 + h.flash;
        h.glow.material.opacity = BoatMaterials.reduced() ? .03 : .04 + h.flash * .12;
        h.group.scale.setScalar(1 + (BoatMaterials.reduced() ? 0 : h.flash * 0.025));
      }
    }
  }

  /* -------- tricks --------
     The boat banks whatever rotation it managed while it was off the water;
     all the mission has to decide is whether the landing was worth paying
     for. Bailing costs you the chain, which is the whole risk. */

  _scoreTrick(tk) {
    if (!tk) return;
    const spins = tk.rolls + tk.flips + tk.spins;
    if (spins < 1) return;
    const b = this.boat;
    const at = this._tmpV.copy(b.pos).setY(b.pos.y + 4);

    if (!tk.landed) {
      this.fx.labels.add('BAILED', at, { className: 'bad', life: 1.3, rise: 8 });
      AudioBus.play('miss');
      this.combo = 0;
      this.comboT = 0;
      this.shake = Math.min(this.shake + 0.8, 1.6);
      return;
    }

    this.tricks += spins;
    // rolls are worth more than flat spins because they are much easier to
    // put down badly. The cap matters: a heavy sea launches you constantly,
    // and without it a storm run out-earns everything else in the game by
    // simply spinning down the channel.
    const weight = tk.rolls * 1.6 + tk.flips * 1.4 + tk.spins * 1.0;
    const amount = Math.min(this.C.trickCap * this.C.moneyScale,
      Math.round(this.C.trickMoney * this.C.moneyScale * weight * tk.flat
                 * (1 + Math.floor(this.combo / 2) * 0.25)));
    this.money += amount;
    this.trickMoney += amount;
    this.boat.addBoost(0.14 * weight);
    this._touchCombo();          // style keeps the chain alive

    const names = [];
    if (tk.rolls) names.push(tk.rolls > 1 ? `${tk.rolls}× BARREL ROLL` : 'BARREL ROLL');
    if (tk.flips) names.push(tk.flips > 1 ? `${tk.flips}× FLIP` : 'FLIP');
    if (tk.spins) names.push(tk.spins > 1 ? `${tk.spins}× SPIN` : 'SPIN');
    this.fx.labels.add(names.join(' + ') + '  ' + U.money(amount), at,
      { className: 'perfect', life: 1.7, rise: 13 });
    AudioBus.play('boat-cue', { kind: 'landing' });
    this._flash(0.3, '#ffd166');
    this.fovKick = Math.min(this.fovKick + 6, 16);
  }

  _spawnFx(dt) {
    const b = this.boat;
    const sp = b.speed;
    this.fx.sparks.points.visible = !BoatMaterials.reduced();
    const fx = Math.sin(b.heading), fz = Math.cos(b.heading);
    const rx = fz, rz = -fx;
    const H = Boat.HULL;

    // ---- boost ----------------------------------------------------------
    // the jet, the streak and the shockwave are `BoatBoost`, the same one
    // the other two boats wear; what is only yours is the kick in the seat
    this.boostFx.update(dt, {
      x: b.pos.x, y: b.pos.y, z: b.pos.z, heading: b.heading,
      boosting: b.boosting, airborne: b.airborne, water: b.lastWaveY,
    });
    if (b.boostStarted) {
      AudioBus.play('boostpop');
      AudioBus.play('boost');
      if (this.music) this.music.stinger('boost');
      this.fovKick = Math.min(this.fovKick + 9, 17);
      this.camPush = 1;
      this.shake = Math.min(this.shake + 0.34, 1.2);
      this._flash(0.2, '#7ff3ff');
      Input.haptic(20);
    }

    // ---- takeoff --------------------------------------------------------
    if (b.airborne && !this._wasAir) {
      AudioBus.play('air', { amount: 1 });
      this.fovKick = Math.min(this.fovKick + 4, 14);
      // teach the trick button on the first couple of launches, then stop —
      // in a heavy sea you leave the water constantly and a hint on every
      // crest stops being a hint
      if (this.state === 'racing' && this.tricks === 0 && (this._airHints || 0) < 2) {
        this._airHints = (this._airHints || 0) + 1;
        this.fx.labels.add('AIR — hold boost to spin', this._tmpV.copy(b.pos).setY(b.pos.y + 5),
          { className: 'air', life: 0.8, rise: 6 });
      }
      for (let i = 0; i < 24; i++) {
        const a = Math.random() * Math.PI * 2;
        this.fx.spray.emit(
          b.pos.x + Math.cos(a) * 2.4, b.pos.y - 0.4, b.pos.z + Math.sin(a) * 2.4,
          Math.cos(a) * (4 + Math.random() * 7), 2 + Math.random() * 5,
          Math.sin(a) * (4 + Math.random() * 7),
          0.7 + Math.random() * 1.0, 0.5 + Math.random() * 0.4);
      }
    }
    this._wasAir = b.airborne;

    if (sp < 0.5) return;

    // wake ribbon behind the transom
    if (!b.airborne) {
      const sx = b.pos.x + fx * H.sternZ, sz = b.pos.z + fz * H.sternZ;
      this.fx.wake.push(sx, sz, rx, rz, 1.5 + b.speed01 * 1.7, U.clamp(sp / 14, 0, 1));
    }

    // bow spray — scales hard with speed, and erupts on impact with a face
    const rate = b.airborne ? 0 : (3 + b.speed01 * 40) * (b.boosting ? 1.5 : 1);
    this._sprayAcc = (this._sprayAcc || 0) + rate * dt;
    while (this._sprayAcc >= 1) {
      this._sprayAcc -= 1;
      const side = Math.random() < 0.5 ? -1 : 1;
      // thrown sideways off the chine, clear of the hull
      const zc = 2.4 + Math.random() * 1.6;
      const ox = fx * zc + rx * side * (Boat.beamAt(zc) + 0.5);
      const oz = fz * zc + rz * side * (Boat.beamAt(zc) + 0.5);
      this.fx.spray.emit(
        b.pos.x + ox, b.pos.y - 0.30, b.pos.z + oz,
        rx * side * (6 + Math.random() * 9) + b.vel.x * 0.22 + (Math.random() - 0.5) * 2,
        2.2 + Math.random() * 3.4 + b.speed01 * 3.0,
        rz * side * (6 + Math.random() * 9) + b.vel.y * 0.22 + (Math.random() - 0.5) * 2,
        0.55 + Math.random() * 0.85, 0.32 + Math.random() * 0.36);
    }

    // rooster tail from the drive
    if (!b.airborne && sp > 16) {
      for (let i = 0; i < 2; i++) {
        this.fx.spray.emit(
          b.pos.x - fx * 5.6 + (Math.random() - 0.5) * 1.6, b.pos.y + 0.05,
          b.pos.z - fz * 5.6 + (Math.random() - 0.5) * 1.6,
          -fx * (4 + Math.random() * 7) + (Math.random() - 0.5) * 3.5,
          4.5 + Math.random() * 6 + b.speed01 * 7,
          -fz * (4 + Math.random() * 7) + (Math.random() - 0.5) * 3.5,
          0.7 + Math.random() * 1.2, 0.5 + Math.random() * 0.55);
      }
    }

    // boost sparks
    if (b.boosting) {
      this.fx.sparks.emit(
        b.pos.x - fx * 6.0 + (Math.random() - 0.5) * 1.4, b.pos.y + 0.5,
        b.pos.z - fz * 6.0 + (Math.random() - 0.5) * 1.4,
        -fx * 12 + (Math.random() - 0.5) * 5, 1 + Math.random() * 3,
        -fz * 12 + (Math.random() - 0.5) * 5,
        0.10 + Math.random() * 0.2, 0.18 + Math.random() * 0.12,
        { r: 0.18, g: 0.3, b: 0.32 });
    }

    // a rolling hull throws a corkscrew of spray off its own rotation
    if (b.airborne && Math.abs(b.airRoll) > 0.4) {
      const a = b.roll;
      this.fx.sparks.emit(
        b.pos.x + Math.cos(a) * 2.2, b.pos.y + Math.sin(a) * 2.2, b.pos.z,
        (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4,
        0.5 + Math.random() * 0.8, 0.3 + Math.random() * 0.3,
        { r: 1, g: 0.86, b: 0.45 });
    }

    // landing splash
    if (b.landed > 0) {
      const amt = b.landed;
      AudioBus.play('splash', { amount: 0.5 + amt });
      this.shake = Math.min(this.shake + amt * 0.6, 1.4);
      this.camDip = Math.min(this.camDip + amt * 1.6, 2.4);
      if (amt > 0.45) this.hitStop = Math.max(this.hitStop, 0.03 * amt);
      Input.haptic(18);
      for (let i = 0; i < 22 + amt * 30; i++) {
        const a = Math.random() * Math.PI * 2, r = 2.2 + Math.random() * 3.2;
        this.fx.spray.emit(
          b.pos.x + Math.cos(a) * r, b.pos.y - 0.3, b.pos.z + Math.sin(a) * r,
          Math.cos(a) * (6 + Math.random() * 11) * amt,
          3.5 + Math.random() * 10 * amt,
          Math.sin(a) * (6 + Math.random() * 11) * amt,
          0.8 + Math.random() * 1.3, 0.55 + Math.random() * 0.55);
      }
      this.fx.rings.fire(
        new THREE.Vector3(b.pos.x, b.pos.y - 0.3, b.pos.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)),
        2.5, 13 + amt * 11, 0.55, '#cdf3ff');
      if (this.state === 'racing') {
        if (b.lastAirTime > 0.8) {
          const bonus = Math.min(1200, Math.round(b.lastAirTime * 260 * this.C.moneyScale));
          this.money += bonus;
          this.fx.labels.add(`AIR!  ${U.money(bonus)}`, this._tmpV.copy(b.pos).setY(b.pos.y + 4),
            { className: 'air', life: 1.4, rise: 10 });
          AudioBus.play('boat-cue', { kind: 'surf' });
          this._flash(0.2, '#7dfcd0');
        }
        this._scoreTrick(b.lastTrick);
      }
    }

    // impacts
    this._impactCd = Math.max(0, (this._impactCd || 0) - dt);
    if (b.impact > 0.32 && this._impactCd <= 0) {
      this._impactCd = 0.35;
      AudioBus.play('crash', { amount: b.impact });
      this.shake = Math.min(this.shake + b.impact * 1.2, 1.8);
      this.hitStop = Math.max(this.hitStop, 0.05 * b.impact);
      this._flash(b.impact * 0.35, '#ff5470');
      Input.haptic(30);
      if (this.combo >= 2) {
        this.fx.labels.add('COMBO LOST', this._tmpV.copy(b.pos).setY(b.pos.y + 3),
          { className: 'bad', life: 1.0, rise: 6 });
      }
      this.combo = 0;
      this.comboT = 0;
      for (let i = 0; i < 26; i++) {
        this.fx.spray.emit(
          b.pos.x + (Math.random() - 0.5) * 4, b.pos.y + Math.random() * 2.5,
          b.pos.z + (Math.random() - 0.5) * 4,
          (Math.random() - 0.5) * 17, 3.5 + Math.random() * 9, (Math.random() - 0.5) * 17,
          0.8 + Math.random() * 1.2, 0.45 + Math.random() * 0.45);
      }
      // Glass Cannon: one real hit and that is the run
      if (this.flags.oneCrash && b.impact > 0.5 && this.state === 'racing') {
        this._fail('WRECKED');
      }
    }
  }

  _updateCamera(dt) {
    const b = this.boat;
    const cam = this.camera;
    const reduced = BoatMaterials.reduced();
    const portrait = cam.aspect < .8;
    if (reduced) { this.camPush = 0; this.camDip = 0; this.shake = 0; this.fovKick = 0; }

    // pull back and drop as you go faster
    const sp01 = U.clamp(b.speed / b.tune.topSpeed, 0, 1.4);
    this.camPush = U.damp(this.camPush, 0, 2.6, dt);
    this.camDip = U.damp(this.camDip, 0, 4.5, dt);
    const dist = U.lerp(portrait ? 22 : 16.5, portrait ? 28 : 22, U.clamp(sp01, 0, 1)) + this.camPush * 1.2;
    const height = U.lerp(portrait ? 8.5 : 6.8, portrait ? 10 : 8.2, U.clamp(sp01, 0, 1)) + (b.airborne ? 1.4 : 0) - this.camDip * .45;

    const finishAngle = this.state === 'finished' && !reduced ? .36 : 0;
    const fx = Math.sin(b.heading + finishAngle), fz = Math.cos(b.heading + finishAngle);
    const want = this._tmpV.set(
      b.pos.x - fx * dist, b.pos.y + height, b.pos.z - fz * dist);

    // never let the camera clip below the swell
    const wy = Water.sampleHeight(want.x, want.z) + 3.0;
    if (want.y < wy) want.y = wy;

    const lam = this.state === 'countdown' ? 3.5 : 6.5;
    this._camPos.x = U.damp(this._camPos.x, want.x, lam, dt);
    this._camPos.y = U.damp(this._camPos.y, want.y, lam * 0.85, dt);
    this._camPos.z = U.damp(this._camPos.z, want.z, lam, dt);

    // look a little ahead of the bow so corners open up early
    const lookAhead = 12 + sp01 * 18;
    const anticipation = reduced ? 0 : U.clamp(b.yawVel * 3, -2, 2);
    const lx = b.pos.x + fx * lookAhead + fz * anticipation, lz = b.pos.z + fz * lookAhead - fx * anticipation;
    const ly = b.pos.y + 3.0 + (b.airborne ? 1.2 : 0);
    this._camLook.x = U.damp(this._camLook.x, lx, 7.5, dt);
    this._camLook.y = U.damp(this._camLook.y, ly, 6, dt);
    this._camLook.z = U.damp(this._camLook.z, lz, 7.5, dt);

    cam.position.copy(this._camPos);

    // shake: event shake, plus a constant fine rattle once you're really moving
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.2);
      const s = this.shake * this.shake * .16;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s;
    }
    const rattle = (reduced ? 0 : .3) * U.smoothstep(0.55, 1.25, sp01) * (b.boosting ? 0.16 : 0.09) * (b.airborne ? 0.2 : 1);
    if (rattle > 0.001) {
      cam.position.x += (Math.random() - 0.5) * rattle;
      cam.position.y += (Math.random() - 0.5) * rattle;
    }

    cam.lookAt(this._camLook);
    // bank the camera a touch with the boat — sells the turn. A barrel roll
    // only leans the camera a fraction of the way round, or the horizon
    // would spin and the landing would be unreadable.
    const airLean = !reduced && b.airborne ? U.wrapAngle(b.roll) * 0.018 : 0;
    this._camRoll = reduced ? 0 : U.damp(this._camRoll, -b.roll * (b.airborne ? 0 : .035) - airLean - b.yawVel * .025, 5, dt);
    cam.rotateZ(this._camRoll);

    // FOV: speed + boost + hoop punch
    this.fovKick = U.damp(this.fovKick, 0, 4.5, dt);
    const targetFov = this.baseFov + (reduced ? 0 : sp01 * 5 + (b.boosting ? 2 : 0) + this.fovKick * .18);
    cam.fov = reduced ? this.baseFov : U.damp(cam.fov, targetFov, 4, dt);
    cam.updateProjectionMatrix();
  }

  _updateAudio() {
    if (!this.engineSnd) return;
    const b = this.boat;
    const sp01 = U.clamp(b.speed / b.tune.boostTop, 0, 1);
    this.engineSnd.set(b);
  }

  _flash(amount, color) {
    if (BoatMaterials.reduced()) return;
    const f = this.hud.flash;
    f.style.background = color;
    f.style.opacity = String(U.clamp(amount, 0, 0.6));
    clearTimeout(this._flashT);
    this._flashT = setTimeout(() => { f.style.opacity = '0'; }, 60);
  }

  _setCenter(big, small, cls) {
    const c = this.hud.center;
    if (!big && !small) { c.classList.remove('show'); c.innerHTML = ''; return; }
    c.className = 'center-msg show ' + (cls || '');
    c.innerHTML = `<div class="big">${big}</div>` + (small ? `<div class="small">${small}</div>` : '');
  }

  _updateHud(dt) {
    const h = this.hud, b = this.boat;
    document.body.classList.toggle('boat-reduced-motion', BoatMaterials.reduced());
    const kn = Math.round(b.speed * 1.94384);       // m/s -> knots
    h.speed.textContent = kn;
    h.speedBar.style.width = U.clamp(b.speed / b.tune.boostTop, 0, 1) * 100 + '%';

    if (this.mode === 'trial') {
      h.time.textContent = U.clockTime(this._clock());
      h.time.classList.add('trial');
      h.time.classList.remove('urgent');
    } else {
      const tm = Math.max(0, this.time);
      h.time.textContent = (tm < 10 ? tm.toFixed(1) : Math.ceil(tm).toString());
      h.time.classList.toggle('urgent', tm < 10);
    }

    h.money.textContent = U.money(Math.round(this.money * this.payout));
    h.hoops.textContent = `${this.gatesHit}/${this.gates.length}`;

    h.comboWrap.classList.toggle('on', this.combo >= 2);
    h.combo.textContent = '×' + (1 + Math.floor(this.combo / 2) * 0.5);
    if (h.comboBar) {
      const left = this.combo > 0 ? U.clamp(this.comboT / this.C.comboWindow, 0, 1) : 0;
      h.comboBar.style.width = (left * 100) + '%';
      h.comboBar.classList.toggle('low', left < 0.3);
    }

    h.boost.style.width = (b.boost * 100) + '%';
    h.boostWrap.classList.toggle('active', b.boosting);
    h.boostWrap.classList.toggle('empty', b.boost < 0.05);

    const f = this.world.lastFrame;
    const prog = f ? U.clamp(f.s / this.path.total, 0, 1) : 0;
    h.progress.style.width = (prog * 100) + '%';

    // the split against your own best run on this exact channel
    if (h.ghost && this.ghost) {
      const d = this.ghostDelta;
      if (d === null || this.state !== 'racing') {
        h.ghost.textContent = '—';
        h.ghost.className = 'hud-ghost show';
      } else {
        h.ghost.textContent = (d >= 0 ? '+' : '−') + Math.abs(d).toFixed(2);
        h.ghost.className = 'hud-ghost show ' + (d <= 0 ? 'ahead' : 'behind');
      }
    }

    // speed vignette + surf glow
    const sp01 = U.clamp((b.speed - 20) / (b.tune.boostTop - 20), 0, 1);
    h.vignette.style.opacity = String(BoatMaterials.reduced() ? 0 : sp01 * 0.3);
    h.vignette.classList.toggle('boost', b.boosting);
    // written every frame, not only while surfing: the opacity is inline,
    // so it wins over the stylesheet, and a badge that is only ever turned
    // *on* stays lit for the rest of the run — and, before it was cleared
    // in dispose(), for the rest of the session
    const surfing = b.surf > 0.22 && !b.airborne;
    h.surf.classList.toggle('on', surfing);
    h.surf.style.opacity = surfing ? String(U.clamp(b.surf, 0, 1) * 0.9) : '0';
  }
}

/* ---- register with the game ---- */
Missions.register({
  id: 'boat-race',
  name: 'Boat Race',
  tagline: 'Thread the rings. Ride the swell. Bank the pot.',
  description:
    'A walled sea channel through the highlands, drawn fresh from whatever seed you pick. ' +
    'Every gate you thread adds to the prize pot and buys you time — and the gold ring ' +
    'tucked against the rocks pays three times as much as the safe one. Ride down the face ' +
    'of a wave for free speed, launch off the crests, roll it in the air, and keep the chain ' +
    'alive for a bigger multiplier. The channel narrows to a throat and opens into open '
    + 'water on the way down, and the last stretch of it — tighter rings, gold on nearly '
    + 'every gate, double money and not a second of extra clock — is where the run is won.',
  icon: '01',
  maxPrize: 60000,
  players: '1-3',
  duration: '~2 min',
  order: 0,
  setup: true,                      // this mission has a pre-race setup panel
  setupLabels: { course: 'Channel', modifier: 'Modifier' },
  todOptions: BoatRaceMission.TOD,
  preview: (opts) => BoatRaceMission.preview(opts),
  modes: BoatRaceMission.MODES,
  medals: BoatRaceMission.MEDALS,
  create: (opts) => new BoatRaceMission(opts),
  better: (a, b) => (a.earned || 0) > (b.earned || 0),

  tips: [
    '<b>Ride the swell.</b> Point down the face of a wave and you gain speed for free.',
    '<b>Launch the crests.</b> Air time refills your boost — land flat to keep it.',
    '<b>Spin it.</b> Hold <kbd>Space</kbd> in the air to trick: throttle flips, steering '
      + 'rolls. Let go and the hull snaps to the nearest whole turn — that is the landing. '
      + 'Hold too long and you bin it and lose the chain.',
    '<b>Take the gold ring.</b> The one against the rocks pays three times the safe one.',
    '<b>Arrive with time in hand.</b> The last stretch pays double and buys you no clock '
      + 'at all — and every gate you fumble costs you three seconds.',
    '<b>Read the water.</b> The channel throttles down to a throat and opens into rock-'
      + 'strewn bays. Both are named as you reach them.',
    '<b>Keep moving.</b> The chain goes cold on a timer, not just on a miss.',
    '<b>Run the wall.</b> Shaving rock or cliff at speed pays while you hold it.',
  ],
  keys: ['<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> drive',
         '<kbd>Space</kbd> boost / roll'],

  // the scoreboard, in this mission's own nouns
  /* What this client tells the other two about its own run. Every card
     in the boat-race deck moves one of these columns, and — this is the
     half the new deck turns on — every card's alibi moves a *second*
     one the other way. Last place next to an empty Led column is a
     confession; last place next to the longest Led on the board is a
     heartbreak. The columns do not accuse anybody. They just make both
     readings available. */
  report: (r) => {
    const st = r.stats || {};
    return {
      earned: r.earned,
      completed: r.completed,
      place: r.place || null,
      columns: ['Place', 'Gates', 'Gold', 'Led', 'Stalled', 'Boost left'],
      cells: [
        r.place ? 'P' + r.place : '—',
        r.hoops + '/' + r.totalHoops,
        String(r.riskHits || 0),
        (st.leadTime || 0).toFixed(0) + 's',
        (st.longestStop || 0).toFixed(1) + 's',
        Math.round((st.boostAtFinish === undefined ? 1 : st.boostAtFinish) * 100) + '%',
      ],
      stats: st,
    };
  },

  resultRows: (r) => {
    const trial = r.mode === 'trial';
    const rows = [
      ['Gates threaded', `${r.hoops}/${r.totalHoops}`],
      ['Perfect passes', String(r.perfects)],
    ];
    if (r.riskHits) rows.push(['Gold rings taken', String(r.riskHits)]);
    if (r.stretchHits) rows.push(['Home-stretch gates', String(r.stretchHits)]);
    if (r.tricks) rows.push(['Rotations landed', String(r.tricks)]);
    rows.push(['Best multiplier', '×' + (1 + Math.floor(r.bestCombo / 2) * 0.5)]);
    if (trial) rows.push(['Final time', U.clockTime(r.finalTime || 0)],
                         ['Par for this channel', U.clockTime(r.par || 0)]);
    rows.push(null, ['Ring earnings', U.money(r.hoopMoney)]);
    if (r.trickMoney) rows.push(['Air tricks', U.money(r.trickMoney)]);
    if (r.grazeMoney) rows.push(['Close calls', U.money(r.grazeMoney)]);
    if (r.finishBonus) rows.push(['Finish bonus', U.money(r.finishBonus)]);
    if (r.timeBonus) {
      rows.push([trial ? 'Under par' : `Time bonus (${r.timeLeft.toFixed(1)}s)`,
                 U.money(r.timeBonus)]);
    }
    if (r.payout && Math.abs(r.payout - 1) > 0.005) {
      const why = [r.conditionText, r.modName].filter(Boolean).join(' · ');
      rows.push([`Conditions ×${r.payout.toFixed(2)}`, why]);
    }
    if (!r.completed) rows.push(['Did not finish', r.earned ? '½ earnings' : 'nothing banked']);
    return rows;
  },
});

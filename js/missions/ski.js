/* ------------------------------------------------------------------
   ski.js — Mission 04: The Descent.

   One face of a mountain, top to bottom, and the only mission in the
   game with no throttle in it. The boat has an engine and the diver has
   a kick; here the hill is the engine and every decision you make is
   about how much of what it gave you you are prepared to hand back.

   So there is one currency and everything feeds it. `flow` is a ladder
   of six rungs and it is the multiplier on every pound the run pays:
   carving cleanly climbs it, air climbs it, threading a hoop climbs it,
   skiing close enough to a tree to hear it climbs it — and going slowly,
   skidding, or putting it in the snow throws it away. Money is metres
   travelled times the rung you are on, which means the whole mission
   reduces to one sentence a player works out in about nine seconds:

       go down fast and never stop doing things.

   Everything else is a way of feeding that. The hoops buy clock. The
   kickers buy rungs. The shortcuts buy both and cost nerve. The trees
   buy rungs and cost everything.

   The three beats of a run are the mountain's, not the mission's:
   `MountainKit` deals a running order of sections, finds the bends
   worth cutting, and cuts them. This file never learns what a gully
   is — it asks the face where the snow is and puts hoops over the
   parts of it that are in the air.

   As with the boat race, the arcade physics is in the entity and the
   *weight* is in here: `_updateCamera`, the `hitStop`/`timeScale` pair,
   and the fact that the band stops playing for the length of every
   jump.
------------------------------------------------------------------ */
class SkiMission {

  static CONFIG = {
    seed: 20260903,

    // ---- the mountain ----
    top: 1180,
    sections: 5,             // ...between the cornice and the runout
    chutes: 5,               // how many shortcuts to go looking for
    rampSpacing: 56,         // and how thickly to litter the rest with kickers
    rampScale: 1,
    rampBoost: 1,            // how hard the pads on them push

    /* ---- the park ----
       Two things that are not the mountain, and the only two dials
       that matter about them: how far apart they are. Every one of them
       is off by default in exactly one card and doubled in another,
       which is the deck's whole job. */
    padSpacing: 34,          // boost pads, which is the densest thing on the hill
    spinnerSpacing: 240,
    spinnerScale: 1,

    spinnerMoney: 520,
    spinnerFlow: 0.30,
    treeScale: 1,
    rockCount: 95,

    // ---- the clock ----
    /* Tuned against measured descents rather than guessed. A mountain
       takes a competent run about two minutes, and the boat race's rule
       applies here too, one notch kinder: threading *half* the ground
       gates should get you to the bottom and three quarters should get
       you there with a time bonus. Base clock plus 0.5 × gates ×
       timePerHoop lands within a few seconds of the measured run time
       on every seed tried, which is the number this is set from. */
    startTime: 96,
    trialLimit: 320,
    timePerHoop: 5.2,
    timeStompBonus: 1.4,     // ...and what putting it down properly is worth
    missPenalty: 1.6,
    crashPenalty: 3.0,
    trialGain: 2.6,
    trialMissPenalty: 1.4,
    trialCrashPenalty: 2.5,

    // ---- the hoops ----
    hoopRadius: 7.6,
    hoopRadiusScale: 1,
    gateSpacing: 150,        // ground gates down the groomed run
    goldChance: 0.40,
    goldMult: 3,
    goldOffset: 1.75,        // how far off the line a gold one sits, in radii
    moneyPerHoop: 90,
    perfectMult: 1.55,       // ...through the middle of one

    /* ---- the descent itself ----
       The only income that never stops, and the reason the mission
       does not turn into a hoop-collecting game with a mountain
       painted behind it. Metres travelled, weighted by how quickly,
       multiplied by the rung. */
    moneyPerMetre: 2.20,
    speedFloor: 16,          // below this the run pays nothing at all
    speedFull: 46,           // ...and here it pays everything

    // ---- the ladder ----
    flowLevels: 6,
    flowDecay: 0.088,        // per second, on the bar
    flowIdleDecay: 0.42,     // ...and per second while you are crawling
    flowCarve: 0.30,         // per second of clean carving
    flowAir: 0.50,           // per second off the snow
    /* Tucking a straight line is conservative skiing, not bad skiing,
       so it climbs the ladder — slowly. At 0.16 against a decay of
       0.088 a straight-liner gains a rung every fourteen seconds and a
       carver gains one every five, which is the gap the whole economy
       rests on. Any lower and the meter simply never moved for a
       cautious player, which read as broken rather than as strict. */
    flowTuck: 0.16,          // per second tucked and quick
    flowGraze: 0.55,         // per second inside a tree
    flowHoop: 0.24,
    flowPerfect: 0.36,
    flowChute: 0.60,
    flowLevelKeep: 0.62,     // where the bar restarts when you drop a rung

    // ---- the air ----
    trickAir: 140,           // per second of hang time past the first half
    trickSpin: 190,          // per completed rotation
    trickFlip: 300,          // ...and a flip is worth more, because it is
    trickRoll: 260,          // ...and a cork is the hardest axis to land on
    trickGrab: 140,          // a hand on a ski, which costs you nothing but style
    trickHeight: 30,         // per metre of peak height past the first four
    /* The cap is applied *after* the meter, not before it. The other way
       round — which is how this was first written — a capped trick at
       six times money was worth twenty-five thousand pounds and a single
       good jump paid for a third of the mountain. */
    trickCap: 2400,          // most one landing can pay, meter included
    stompMult: 1.50,

    // ---- the wood ----
    grazeDist: 5.4,
    grazeMoney: 130,
    grazeStep: 0.42,         // seconds of contact per payment

    // ---- the shortcuts ----
    chuteBase: 1100,         // for getting out of the far end of one
    chuteBail: -0.35,        // ...and the fraction of it you forfeit if you bail

    // ---- the bottom ----
    finalFrom: 0.74,         // where the last stretch starts
    finalMult: 2,
    finishBonus: 3400,
    timeBonusPerSecond: 145,

    // ---- the wall of snow, if a card dealt one ----
    avStart: -300,
    avSpeed: 27.5,
    avAccel: 0.10,

    ghostRate: 0.1,
  };

  static MODES = {
    prize: {
      id: 'prize', name: 'Prize Run',
      blurb: 'The clock counts down. Hoops buy it back and the meter decides what it is worth.',
      better: (a, b) => (a.earned || 0) > (b ? (b.earned || 0) : -1),
    },
    trial: {
      id: 'trial', name: 'Time Trial',
      blurb: 'The clock counts up and every hoop knocks seconds off it. One number to beat.',
      better: (a, b) => {
        if (!a.completed) return false;
        if (!b || !b.completed) return true;
        return (a.finalTime || 1e9) < (b.finalTime || 1e9);
      },
    },
  };

  /* The hour is a dial of its own rather than something the seed
     happens to deal, for the boat race's reason: back-to-back runs on a
     default seed used to be the same afternoon all day long. */
  static TOD = [
    { id: 'auto',  name: 'Auto',  blurb: 'The light moves on an hour every run.' },
    { id: 'day',   name: 'Day',   blurb: 'Daylight, whatever the mountain drew.' },
    { id: 'night', name: 'Night', blurb: 'Lit gates on a black hill. It pays for itself.' },
  ];

  static MEDALS = [
    null,
    { id: 1, name: 'Bronze', color: '#c98c52' },
    { id: 2, name: 'Silver', color: '#c9d4de' },
    { id: 3, name: 'Gold', color: '#ffd166' },
    { id: 4, name: 'Author', color: '#39e6ff' },
  ];

  /* Everything a run reports, in one place, so a counter cannot exist
     at the top of the mountain and quietly not exist after a restart.
     Written on every run whether or not anybody was dealt a task —
     a statistic that only appears when somebody has an agenda is a
     statistic that announces there is one. */
  static freshStats() {
    return {
      // the line
      finished: false, elapsed: 0, place: 1, of: 1, finishGap: 0,
      vertical: 0, topSpeed: 0, avgSpeed: 0,
      // the ladder, which everybody can see all run
      peakFlow: 1, flowAtFinish: 1, timeAtTop: 0, timeAtOne: 0,
      // the mountain
      hoops: 0, gatesMissed: 0, golds: 0, goldsDeclined: 0, perfects: 0,
      airTime: 0, biggestAir: 0, tricks: 0, stomps: 0, landings: 0,
      // the park
      spinners: 0, boosts: 0,
      // the shortcuts, which are the loudest thing on the board
      chutesTaken: [], chutesPassed: [], chutesBailed: 0, chuteMetres: 0,
      // and the ways it goes wrong
      crashes: 0, trees: 0, slowestStretch: 0, straightLined: 0,
    };
  }

  static normalise(opts = {}) {
    const seed = Number.isFinite(opts.seed)
      ? (Math.floor(opts.seed) >>> 0) || SkiMission.CONFIG.seed
      : U.dailySeed();
    return {
      seed,
      mode: opts.mode === 'trial' ? 'trial' : 'prize',
      tod: SkiMission.TOD.some(t => t.id === opts.tod) ? opts.tod : 'auto',
      modId: opts.modId || null,
      ghost: opts.ghost !== false,
      daily: seed === U.dailySeed(),
    };
  }

  // the same seed always deals the same three cards
  static hand(seed) {
    return SkiTwists.draw(U.makeRng((seed ^ 0x6b43a9f1) >>> 0), 3);
  }

  static configFor(mod) {
    const C = Object.assign({}, SkiMission.CONFIG);
    if (mod && mod.config) Object.assign(C, mod.config);
    return C;
  }

  static autoTime() {
    const cur = GameState.settings.skiTime;
    return Conditions.CYCLE.includes(cur) ? cur : Conditions.CYCLE[1];
  }

  static advanceTime() {
    GameState.settings.skiTime = Conditions.nextTime(SkiMission.autoTime());
    GameState.save();
  }

  /* The snow is the seed's to choose and the hour is not. A card that
     names either still outranks both, because that one was picked on
     purpose and paid for. */
  static conditionsFor(o, mod) {
    const base = SkiConditions.forSeed(o.seed);
    const time = o.tod === 'night' ? 'night'
               : o.tod === 'day' ? Conditions.dayTime(base.time)
               : SkiMission.autoTime();
    return Object.assign(base, { time }, (mod && mod.cond) || {});
  }

  // everything the setup screen needs, without touching the GPU
  static preview(opts) {
    const o = SkiMission.normalise(opts);
    const mod = SkiTwists.byId(o.modId);
    const cond = SkiMission.conditionsFor(o, mod);
    const key = GameState.runKey(o.mode, o.seed, o.modId);
    const rec = GameState.runRecord('ski', key);
    /* The running order, worked out from the seed alone. It is the
       single most useful thing the briefing can show, because the
       difference between two mountains is not the scenery — it is
       whether the glades come before or after the cliffs. */
    const face = new MountainKit.Face(U.makeRng((o.seed ^ 0x51a3f7) >>> 0),
      { top: SkiMission.CONFIG.top, sections: SkiMission.configFor(mod).sections });
    return {
      opts: o,
      mod,
      cond,
      name: U.courseName(o.seed),
      conditionText: SkiConditions.describe(cond),
      hand: SkiMission.hand(o.seed),
      mode: SkiMission.MODES[o.mode],
      payout: SkiConditions.payout(cond) * (mod ? mod.payout : 1),
      key,
      record: rec,
      route: face.sections.map(s => s.name),
      vertical: Math.round(face.top - face.baseY(face.total)),
      length: Math.round(face.total),
      // the running order, for the briefing's one spare line
      shape: face.sections.map(s => `<i>${s.name}</i>`).join('<b>›</b>')
           + `<span class="cs-vert">${Math.round(face.top - face.baseY(face.total))}m vertical</span>`,
      bestText: rec.best
        ? (o.mode === 'trial' ? U.clockTime(rec.best.finalTime || 0)
                              : U.money(rec.best.earned || 0))
        : null,
      hasGhost: !!GameState.getGhost('ski', key),
    };
  }

  constructor(opts = {}) {
    this.opts = SkiMission.normalise(opts);
    this.seed = this.opts.seed;
    this.mode = this.opts.mode;
    this.modeDef = SkiMission.MODES[this.mode];
    this.mod = SkiTwists.byId(this.opts.modId);
    this.flags = Object.assign({}, this.mod && this.mod.flags);
    this.C = SkiMission.configFor(this.mod);
    this.cond = SkiMission.conditionsFor(this.opts, this.mod);
    this.snow = SkiConditions.resolve(this.cond).snow;
    this.payout = SkiConditions.payout(this.cond) * (this.mod ? this.mod.payout : 1);
    this.courseName = U.courseName(this.seed);
    this.key = GameState.runKey(this.mode, this.seed, this.opts.modId);

    this.rng = U.makeRng(this.seed);
    this.state = 'idle';        // idle | waiting | countdown | running | finished | failed
    this.startTime = this.C.startTime;
    this.time = this.startTime;
    this.deduct = 0;
    this.money = 0;
    this.elapsed = 0;
    this.countdown = 3.999;

    // ---- the ladder ----
    this.flow = 0;
    this.flowLevel = 1;
    this.peakFlow = 1;

    // ---- everything the results screen counts ----
    this.hoopsHit = 0;
    this.perfects = 0;
    this.golds = 0;
    this.tricks = 0;
    this.stomps = 0;
    this.crashes = 0;
    this.hoopMoney = 0;
    this.trickMoney = 0;
    this.grazeMoney = 0;
    this.chuteMoney = 0;
    this.descentMoney = 0;
    this.vertical = 0;
    this.topSpeed = 0;
    this.airTotal = 0;
    this.biggestAir = 0;
    this.chutesDone = 0;

    // ---- the other two ----
    this.party = !!opts.party;
    this.roster = (opts.players || []).filter(p => !p.local);
    const me = (opts.players || []).find(p => p.local) || {};
    this.meId = me.id || 'you';
    this.myLook = me.look || (typeof GameState !== 'undefined' && GameState.data
                              ? GameState.data.look : null) || null;
    this.agenda = opts.agenda || null;
    this.peers = new Map();
    this.finishes = new Map();
    this._fieldT = 0;

    this.stats = SkiMission.freshStats();
    this._grazeT = 0;
    this._boostT = 0;
    this._slowT = 0;
    this._straightT = 0;
    this._atTopT = 0;
    this._atOneT = 0;
    this._distAcc = 0;

    // ---- the feel ----
    this.shake = 0;
    this.fovKick = 0;
    this.hitStop = 0;
    this.timeScale = 1;
    this.timeScaleTarget = 1;
    this.camDip = 0;
    this.camPush = 0;
    this._inFinal = false;
    this._seenSection = new Set();
    this._curChute = null;
    this._chuteEnterZ = 0;

    // ---- the wall of snow, if a card dealt one ----
    this.avZ = this.C.avStart;
    this.avOn = !!this.flags.avalanche;

    this._tmpV = new THREE.Vector3();
    this._tmpV2 = new THREE.Vector3();
    this._prevPos = new THREE.Vector3();
    this._frame = {};
    this._norm = {};
    this._camPos = new THREE.Vector3();
    this._camLook = new THREE.Vector3();
    this._camRoll = 0;

    // ghost state
    this.ghost = null;
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

    const camera = new THREE.PerspectiveCamera(64, 1, 0.4, 24000);
    this.camera = camera;
    this.baseFov = 64;
    scene.add(camera);

    // ---- the light first: the haze on the far peaks is baked into
    // ---- vertex colours against the fog colour of the hour ----
    const applied = SkiConditions.apply(this.cond);
    const fog = (this.mod && this.mod.fog) || applied.time.fog;
    scene.fog = new THREE.Fog(Sky.PALETTE.fog, fog.near * 0.75, fog.far * 0.92);
    scene.add(SkiConditions.lights(this.cond));
    Sky.build(scene, U.makeRng(this.seed + 7));

    // ---- the mountain ----
    this.face = MountainKit.makeFace(U.makeRng((this.seed ^ 0x51a3f7) >>> 0),
      { top: C.top, sections: C.sections });
    this.chutes = MountainKit.findChutes(this.face, U.makeRng(this.seed + 31),
      { count: C.chutes });
    MountainKit.buildRamps(this.face, U.makeRng(this.seed + 53),
      { spacing: C.rampSpacing, boost: C.rampBoost });

    /* "Send It" is a card about the mountain rather than about the
       skier, so it moves the mountain: every lip on it grows, and
       everything downstream — the hoop placement, the air, the landings
       — follows from that without knowing the card exists. */
    if (C.rampScale !== 1) {
      for (const r of this.face.ramps) {
        if (r.kind === 'bank') continue;
        r.h *= C.rampScale;
        r.len *= U.lerp(1, C.rampScale, 0.45);
      }
    }

    // ---- the park ----
    MountainKit.buildPads(this.face, U.makeRng(this.seed + 59),
      { spacing: C.padSpacing, boost: C.rampBoost });
    MountainKit.buildSpinners(this.face, U.makeRng(this.seed + 67),
      { spacing: C.spinnerSpacing, scale: C.spinnerScale });

    // the clock has to know how much mountain it is being asked to cover
    this.startTime = Math.round(C.startTime * U.clamp(this.face.total / 2900, 0.82, 1.30));
    this.time = this.startTime;
    this.vertTotal = this.face.top - this.face.baseY(this.face.total);

    scene.add(MountainKit.buildTerrain(this.face, this.rng));

    this.windU = {
      time: { value: 0 },
      wind: { value: new THREE.Vector3(Math.cos(this.cond.windDir || 0),
                                       Math.sin(this.cond.windDir || 0), 0.55) },
    };
    this.trees = MountainKit.buildTrees(this.face, U.makeRng(this.seed + 71),
      { uniforms: this.windU, scale: C.treeScale });
    if (this.trees.mesh) scene.add(this.trees.mesh);

    this.rocks = MountainKit.buildRocks(this.face, U.makeRng(this.seed + 97),
      { count: C.rockCount });
    scene.add(this.rocks.mesh);

    this.markers = MountainKit.buildMarkers(this.face, { spacing: 34 });
    scene.add(this.markers.group);

    this.spinnerMesh = MountainKit.buildSpinnerMeshes(this.face);
    scene.add(this.spinnerMesh);
    this.spinners = this.face.spinners;

    /* Colliders, bucketed down the fall line. Nine hundred trunks
       tested ninety times a second is a slideshow; the dozen inside a
       hundred and twenty metres of you is a list. */
    this._buildColliderIndex([...this.trees.colliders, ...this.rocks.colliders]);

    // ---- the hoops ----
    this.gates = this._buildGates();
    this.hoops = this.gates.flatMap(g => g.rings);
    for (const g of this.gates) scene.add(g.group);

    // ---- the shortcuts announce themselves ----
    this.chuteGates = this.chutes.map(c => {
      const g = MountainKit.buildChuteGate(this.face, c, '#ffd166');
      scene.add(g);
      return { c, group: g };
    });

    this.startArch = this._buildArch(6, '#39e6ff', 1.0);
    this.finishArch = this._buildArch(this.face.total - 10, '#ffd166', 1.35);
    scene.add(this.startArch, this.finishArch);

    // ---- the skier ----
    const feel = Object.assign({}, (this.mod && this.mod.tune) || {});
    this.skier = new Skier({
      look: this.myLook,
      snow: this.snow,
      tune: feel,
    });
    scene.add(this.skier.group);
    this.skier.place(this.face.cxAt(0), 0, 0, { face: this.face });
    this._prevPos.copy(this.skier.pos);

    this._buildPeers(scene);
    if (this.opts.ghost) this._buildGhost(scene);

    // ---- fx: the trench is the ribbon, lying in the snow ----
    this.fx = new FXSystem(scene, camera, document.getElementById('world-labels'), {
      sprayMax: 1500,
      spray: { drag: 1.9, gravity: 15 },
      wake: {
        segments: 120, life: 2.4, lift: 0.06, color: '#9dc6e8', alpha: 0.42,
        heightAt: (x, z) => this.face.heightAt(x, z),
      },
    });

    // ---- falling snow, if the hour or the card asked for any ----
    const flakes = this.cond.flakes || (this.snow.id === 'powder' ? 0.7 : 0);
    this.snowfall = flakes > 0
      ? MountainKit.buildSnowfall(scene, Math.round(700 * flakes),
          { size: 0.42 + flakes * 0.12, opacity: 0.45 + flakes * 0.18 })
      : null;

    if (this.avOn) this._buildAvalanche(scene);

    this.world = { face: this.face, colliders: [] };
    this.targets = this._computeTargets();
    this._cacheHud();

    /* Which touch overlay belongs to this mission, said here rather
       than inherited: the hill, the table and the fire all switch the
       pad to walking, and only their own dispose puts it back. */
    Input.setTouchMode('drive');
    /* Two buttons on the mountain rather than the boat's one. A skier
       holds the tuck for most of a run and steers the whole time, and
       a single stick cannot do both — pushing it forward to stay folded
       up costs you half the steering lock exactly when you are going
       fast enough to need it. So the tuck comes off the stick and
       becomes a button your thumb can sit on. */
    Input.setDrivePad({ main: 'POP', aux: 'TUCK' });

    this._camPos.copy(this.skier.pos).add(new THREE.Vector3(0, 8, -14));
    this._camLook.copy(this.skier.pos);
    return { scene, camera };
  }

  /* -------- colliders, indexed down the hill -------- */

  _buildColliderIndex(list) {
    const B = 60;
    const n = Math.ceil((this.face.total + 400) / B) + 4;
    this._colB = B;
    this._colBuckets = Array.from({ length: n }, () => []);
    for (const c of list) {
      const i = U.clamp(Math.floor((c.z + 200) / B), 0, n - 1);
      this._colBuckets[i].push(c);
    }
  }

  _collidersNear(z) {
    const i = U.clamp(Math.floor((z + 200) / this._colB), 0, this._colBuckets.length - 1);
    const out = this._colBuckets[i].slice();
    if (i > 0) out.push(...this._colBuckets[i - 1]);
    if (i + 1 < this._colBuckets.length) out.push(...this._colBuckets[i + 1]);
    return out;
  }

  /* -------- the hoops --------

     Two kinds, and the difference between them is the whole reason the
     mission has a jump button. A ground gate is an arch across the
     groomed run and it is a line problem; an air hoop is hung in space
     off the end of a kicker and it is a *timing* problem, because the
     only way through it is to have popped at the lip.

     The air ones are not placed by eye. Each kicker is asked what it
     would throw a skier of ordinary speed, the ballistic arc is solved,
     and the hoop goes at three quarters of the way to the apex — near
     enough the top that a weak launch drops under it, far enough short
     that a big one does not sail over. Which means a card that makes
     every kicker bigger moves every hoop with it, for free. */

  _buildGates() {
    const C = this.C;
    const rng = U.makeRng(this.seed + 131);
    const face = this.face;
    const gates = [];
    const R = C.hoopRadius * C.hoopRadiusScale;

    const push = (z, rings, kind, route) => {
      if (!rings.length) return;
      const g = { z, rings, kind, route: route || null, state: 'pending',
                  index: gates.length, group: new THREE.Group() };
      for (const r of rings) { r.gate = g; g.group.add(r.group); }
      gates.push(g);
    };

    // ---- air hoops, one off every lip worth leaving ----
    for (const r of face.ramps) {
      if (r.kind === 'bank' || r.kind === 'roller') continue;
      if (r.gapLand) continue;
      if (r.kind === 'drop' && r.h < 4.2 && !r.mouth) continue;
      if (r.kind !== 'drop' && r.h < 3.2 && !r.big) continue;
      const inChute = r.chute || null;
      const c = Math.cos(r.ax), s = Math.sin(r.ax);
      const lipX = r.x + s * r.len, lipZ = r.z + c * r.len;
      if (lipZ > face.total - 60) continue;
      const lipY = face.heightAt(r.x + s * r.len * 0.94, r.z + c * r.len * 0.94);

      /* What the mountain would actually throw somebody. The first
         version of this guessed the approach speed off the gradient
         with a made-up straight line and guessed nearly twice too high,
         so every hoop on the hill sat thirty metres beyond and four
         above an arc that had already landed. It is solved properly
         now: the speed a skier settles at on this pitch is where drag
         balances gravity,

             lin·v + quad·v² = g·grade/(1+grade²)

         and the hoop goes on the ballistic arc that speed produces. It
         costs one square root per kicker, once, and it means a card
         that makes every lip bigger moves every hoop with it for free. */
      const grade = face.gradeAt(lipZ);
      const pull = Skier.TUNE.gravity * grade / (1 + grade * grade);
      const A = Skier.TUNE.tuckDrag, B = Skier.TUNE.linDrag;
      const vTerm = (-B + Math.sqrt(B * B + 4 * A * pull)) / (2 * A);
      const v = U.clamp(vTerm * 0.72, 14, 42);
      const slope = r.kind === 'drop' ? 0.06 : (r.h * 1.55) / r.len;
      const vy = v * slope + Skier.TUNE.popVy * 0.55;
      const g = Skier.TUNE.liftG;
      const ta = vy / g;
      const rise = (vy * vy) / (2 * g);
      const dist = U.clamp(v * ta * 0.62, 8, 40);
      const hx = lipX + s * dist, hz = lipZ + c * dist;
      if (hz > face.total - 40) continue;
      const hy = lipY + U.clamp(rise * 0.80, 2.2, 15) + (r.kind === 'drop' ? -r.h * 0.45 : 0);

      const rings = [];
      const gold = rng() < (inChute ? 0.62 : C.goldChance);
      rings.push(this._makeRing(hx, hy, hz, R, false, true, inChute));
      if (gold) {
        // the gold one sits off the natural line: you have to have
        // steered in the air, or hit the lip off-centre on purpose
        const off = (rng() < 0.5 ? -1 : 1) * R * C.goldOffset;
        rings.push(this._makeRing(hx + c * off, hy + R * 0.42, hz, R * 0.86, true, true, inChute));
      }
      push(hz, rings, 'air', inChute);
    }

    // ---- ground gates down the groomed run ----
    for (let z = 130; z < face.total - 90; z += C.gateSpacing * rng.range(0.82, 1.18)) {
      // never at the mouth of a shortcut: that is a decision, not a gate
      /* Nothing at the mouth of a shortcut — that is a decision, not a
         gate — and nothing on top of another *ground* gate. Air hoops
         deliberately do not count as a clash: they hang metres above
         the snow off to one side, and treating them as one was quietly
         deleting two thirds of the gates on the mountain, which are
         also two thirds of the clock. */
      let clash = false;
      for (const ch of face.chutes) if (Math.abs(z - ch.z0) < 70) clash = true;
      for (const g of gates) {
        if (g.kind === 'ground' && Math.abs(g.z - z) < 52) clash = true;
      }
      if (clash) continue;
      const half = face.halfAt(z);
      const lat = rng.range(-0.20, 0.20) * half;
      const x = face.cxAt(z) + lat;
      const y = face.heightAt(x, z) + R * 0.86;
      const rings = [this._makeRing(x, y, z, R, false, false, null)];
      if (rng() < C.goldChance) {
        // ...and the gold one is out by the trees, where the run is not
        const side = lat >= 0 ? -1 : 1;
        const gx = face.cxAt(z) + side * half * rng.range(0.86, 1.05);
        rings.push(this._makeRing(gx, face.heightAt(gx, z) + R * 0.80, z, R * 0.88, true, false, null));
      }
      push(z, rings, 'ground', null);
    }

    // ---- and the chutes get a line of their own, all of it gold ----
    for (const ch of face.chutes) {
      const n = 2 + Math.round(ch.hard * 2);
      for (let i = 0; i < n; i++) {
        const z = U.lerp(ch.z0 + 60, ch.z1 - 40, (i + 0.5) / n);
        if (gates.some(g => g.route === ch && Math.abs(g.z - z) < 40)) continue;
        const x = face.chuteX(ch, z) + rng.range(-0.3, 0.3) * ch.half;
        const y = face.heightAt(x, z) + R * 0.88;
        push(z, [this._makeRing(x, y, z, R * 0.92, true, false, ch)], 'ground', ch);
      }
    }

    gates.sort((a, b) => a.z - b.z);
    gates.forEach((g, i) => { g.index = i; });
    return gates;
  }

  /* One hoop. A torus is the wrong shape for something you have to
     judge the middle of at forty metres a second, so it is a ring with
     a bright rim, a lamp behind it and a soft disc of glow — three cues
     for the same edge, which is what makes it readable in fog, at
     night, and against snow. */
  _makeRing(x, y, z, radius, gold, air, chute) {
    const colour = gold ? '#ffd166' : (chute ? '#b98cff' : '#39e6ff');
    if (!this._ringGeos) this._ringGeos = {};
    const key = radius.toFixed(2);
    if (!this._ringGeos[key]) {
      this._ringGeos[key] = {
        torus: new THREE.TorusGeometry(radius, radius * 0.075, 8, 26),
        disc: new THREE.RingGeometry(radius * 0.90, radius * 1.02, 30),
        glow: new THREE.CircleGeometry(radius * 0.97, 26),
      };
    }
    const G = this._ringGeos[key];
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({
      color: colour, emissive: colour, emissiveIntensity: 1.4, flatShading: true,
    });
    const ring = new THREE.Mesh(G.torus, mat);
    group.add(ring);
    const lampMat = new THREE.MeshBasicMaterial({
      color: colour, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const lamp = new THREE.Mesh(G.disc, lampMat);
    group.add(lamp);
    const glowMat = new THREE.MeshBasicMaterial({
      color: colour, transparent: true, opacity: 0.10, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const glow = new THREE.Mesh(G.glow, glowMat);
    group.add(glow);
    group.position.set(x, y, z);
    return {
      x, y, z, radius, baseRadius: radius, gold: !!gold, air: !!air, chute: chute || null,
      group, ring, lamp, glow, mat, lampMat, glowMat,
      state: 'pending', flash: 0,
    };
  }

  /* A banner across the run, for the two places that are not a gate:
     where it starts and where it stops. */
  _buildArch(z, colour, scale = 1) {
    const face = this.face;
    const half = face.halfAt(z) * 1.06;
    const cx = face.cxAt(z);
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({
      color: colour, emissive: colour, emissiveIntensity: 1.3, flatShading: true,
    });
    const H = 11 * scale;
    const postGeo = new THREE.CylinderGeometry(0.55 * scale, 0.75 * scale, H, 7);
    postGeo.translate(0, H / 2, 0);
    for (const side of [-1, 1]) {
      const x = cx + side * half;
      const p = new THREE.Mesh(postGeo, mat);
      p.position.set(x, face.heightAt(x, z), z);
      group.add(p);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 2, 1.9 * scale, 0.9), mat);
    bar.position.set(cx, face.heightAt(cx, z) + H * 0.92, z);
    group.add(bar);
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(half * 2, H * 0.92),
      new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.09,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    banner.position.set(cx, face.heightAt(cx, z) + H * 0.46, z);
    group.add(banner);
    group.userData = { geos: [postGeo, bar.geometry, banner.geometry],
                       mats: [mat, banner.material] };
    return group;
  }

  /* -------- the wall of snow --------
     One card deals this and it changes the shape of every decision on
     the mountain: with it behind you a shortcut stops being greed and
     becomes arithmetic. It is a plane, a rolling cloud and a noise —
     no collision, no physics, and no way to fight it. You are either
     in front of it or the run is over. */
  _buildAvalanche(scene) {
    const face = this.face;
    const W = face.edge * 2.4;
    const group = new THREE.Group();
    const wallMat = new THREE.MeshBasicMaterial({
      color: '#eef7ff', transparent: true, opacity: 0.88,
      side: THREE.DoubleSide, depthWrite: false, fog: true,
    });
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(W, 260), wallMat);
    wall.position.y = 70;
    group.add(wall);
    // a rolling front, so it reads as snow moving rather than a curtain
    const lumps = [];
    const lumpGeo = new THREE.IcosahedronGeometry(20, 1);
    const lumpMat = new THREE.MeshLambertMaterial({
      color: '#ffffff', flatShading: true, transparent: true, opacity: 0.95,
    });
    const lumpMesh = new THREE.InstancedMesh(lumpGeo, lumpMat, 90);
    const d = new THREE.Object3D();
    const lrng = U.makeRng(this.seed + 909);
    for (let i = 0; i < 90; i++) {
      const it = { x: lrng.range(-W * 0.48, W * 0.48), y: lrng.range(-4, 46),
                   z: lrng.range(-56, 22), s: lrng.range(0.5, 1.9),
                   sp: lrng.range(0.5, 1.6), ph: lrng() * U.TAU };
      lumps.push(it);
      d.position.set(it.x, it.y, it.z);
      d.scale.setScalar(it.s);
      d.updateMatrix();
      lumpMesh.setMatrixAt(i, d.matrix);
    }
    lumpMesh.instanceMatrix.needsUpdate = true;
    lumpMesh.frustumCulled = false;
    group.add(lumpMesh);
    group.visible = false;
    scene.add(group);
    this.avalanche = { group, wall, lumpMesh, lumps, d, geos: [wall.geometry, lumpGeo],
                       mats: [wallMat, lumpMat] };
  }

  _updateAvalanche(dt) {
    if (!this.avOn || !this.avalanche) return;
    const C = this.C;
    if (this.state === 'running') {
      this.avZ += (C.avSpeed + this.elapsed * C.avAccel) * dt;
    }
    const a = this.avalanche;
    const face = this.face;
    const z = this.avZ;
    a.group.visible = z > -220 && z < this.skier.pos.z + 260;
    if (!a.group.visible) return;
    a.group.position.set(face.cxAt(z), face.heightAt(face.cxAt(z), z), z);
    for (let i = 0; i < a.lumps.length; i++) {
      const it = a.lumps[i];
      it.ph += dt * it.sp * 2.2;
      a.d.position.set(it.x + Math.sin(it.ph) * 5, it.y + Math.cos(it.ph * 0.7) * 6, it.z);
      a.d.rotation.set(it.ph * 0.4, it.ph * 0.25, 0);
      a.d.scale.setScalar(it.s * (1 + Math.sin(it.ph * 0.6) * 0.14));
      a.d.updateMatrix();
      a.lumpMesh.setMatrixAt(i, a.d.matrix);
    }
    a.lumpMesh.instanceMatrix.needsUpdate = true;

    const gap = this.skier.pos.z - z;
    this.avGap = gap;
    if (this.state === 'running') {
      // it announces itself before it arrives, in the two channels a
      // player is already using: the screen shakes and the band climbs
      if (gap < 130) this.shake = Math.max(this.shake, U.clamp((130 - gap) / 130, 0, 1) * 0.8);
      if (gap <= 0) this._fail('BURIED');
    }
  }

  /* -------- the other two -------- */

  _buildPeers(scene) {
    if (!this.party) return;
    for (const p of this.roster) {
      const sk = new Skier({
        look: p.look || null,
        palette: p.look ? null : Figure.paletteFor(p.seat || 1),
        snow: this.snow,
      });
      sk.group.visible = false;
      scene.add(sk.group);
      this.peers.set(p.id, { skier: sk, name: p.name, z: 0, flow: 1, speed: 0,
                             seen: false, air: false });
    }
  }

  _sendPose() {
    const s = this.skier;
    return {
      x: s.pos.x, y: s.pos.y, z: s.pos.z,
      h: s.heading, p: s.pitch, r: s.roll,
      f: this.flowLevel, v: s.speed, a: s.airborne ? 1 : 0,
      c: s.crashed ? 1 : 0, t: s.fold,
    };
  }

  _updatePeers(dt) {
    if (!this.party) return;
    MissionNet.update(dt);
    for (const [id, peer] of this.peers) {
      const iv = MissionNet.at(id);
      if (!iv) { peer.skier.group.visible = false; continue; }
      const a = iv.a, b = iv.b, k = iv.k;
      const sk = peer.skier;
      peer.seen = true;
      sk.group.visible = true;
      sk.pos.set(U.lerp(a.x, b.x, k), U.lerp(a.y, b.y, k), U.lerp(a.z, b.z, k));
      sk.heading = U.angLerp(a.h, b.h, k);
      sk.pitch = U.lerp(a.p, b.p, k);
      sk.roll = U.lerp(a.r, b.r, k);
      sk.airborne = !!b.a;
      sk.crashed = !!b.c;
      sk.speed = b.v || 0;
      sk.fold = U.lerp(sk.fold, b.t || 0, 1 - Math.exp(-9 * dt));
      if (sk.crashed) sk.tumble += dt * 7;
      sk._cosmetics(dt);
      peer.z = b.z || 0;
      peer.flow = b.f === undefined ? 1 : b.f;
      peer.speed = b.v || 0;
    }
  }

  /* The strip everybody can see. Position down the mountain and — the
     half that makes the deck playable — the rung of the ladder each
     person is on, live. Two of the Traitor's cards are about that
     number going somewhere it should not, and this is the only reason
     anybody could ever catch one. */
  _updateField(dt) {
    /* Marking the task is a keypress and a pad button, and both of
       those are edges that only exist inside a frame. The strip below
       is throttled to a few times a second, which is fine for a
       scoreboard and would drop most of a button press, so the poll
       goes above the throttle and the drawing stays below it. */
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
    const rows = [{ playerId: this.meId, name: 'You', z: this.skier.pos.z,
                    flow: this.flowLevel, done: this.state !== 'running' }];
    for (const [id, peer] of this.peers) {
      rows.push({ playerId: id, name: peer.name, z: peer.z, flow: peer.flow,
                  done: this.finishes.has(id), dim: !peer.seen });
    }
    rows.sort((a, b) => b.z - a.z);
    RoomUI.showField(rows.map((r, i) => ({
      playerId: r.playerId, name: r.name,
      value: r.done ? 'in' : ('P' + (i + 1)),
      meter: U.clamp((r.flow - 1) / (this.C.flowLevels - 1), 0, 1),
      dim: r.dim,
    })));
  }

  _placeNow() {
    const mine = this.finishes.has(this.meId)
      ? this.finishes.get(this.meId) : this.elapsed;
    let ahead = 0, best = Infinity;
    for (const [, t] of this.finishes) if (t < mine) { ahead++; best = Math.min(best, t); }
    return { place: ahead + 1, of: this.peers.size + 1,
             gap: isFinite(best) ? Math.max(0, mine - best) : 0 };
  }

  _onPeerEvent(d, from) {
    if (!d) return;
    if (d.kind === 'finish') this.finishes.set(from, d.t || 0);
  }

  /* -------- the ghost of your own best line -------- */

  _buildGhost(scene) {
    const g = GameState.getGhost('ski', this.key);
    if (!g || !g.n) return;
    this.ghost = g;
    const sk = new Skier({ look: this.myLook, snow: this.snow });
    sk.group.traverse(o => {
      if (!o.material) return;
      const m = Array.isArray(o.material) ? o.material : [o.material];
      for (const mm of m) {
        mm.transparent = true; mm.opacity = 0.24; mm.depthWrite = false;
      }
    });
    sk.group.visible = false;
    scene.add(sk.group);
    this.ghostSkier = sk;
  }

  _ghostAt(t, out) {
    const g = this.ghost;
    const f = U.clamp(t / g.dt, 0, g.n - 1);
    const i = Math.floor(f), k = f - i, j = Math.min(i + 1, g.n - 1);
    out.x = U.lerp(g.x[i], g.x[j], k);
    out.y = U.lerp(g.y[i], g.y[j], k);
    out.z = U.lerp(g.z[i], g.z[j], k);
    out.yaw = U.angLerp(g.yaw[i], g.yaw[j], k);
    return out;
  }

  // how long the ghost took to reach this far down the hill
  _ghostTimeAt(z) {
    const g = this.ghost;
    if (!g || !g.s) return 0;
    for (let i = 1; i < g.n; i++) {
      if (g.s[i] >= z) {
        const a = g.s[i - 1], b = g.s[i];
        const k = b === a ? 0 : (z - a) / (b - a);
        return (i - 1 + k) * g.dt;
      }
    }
    return (g.n - 1) * g.dt;
  }

  _recordGhost(dt) {
    this._recAcc += dt;
    if (this._recAcc < this.C.ghostRate) return;
    this._recAcc = 0;
    const r = this.rec, s = this.skier;
    r.x.push(U.r3(s.pos.x)); r.y.push(U.r3(s.pos.y)); r.z.push(U.r3(s.pos.z));
    r.yaw.push(U.r3(s.heading));
    r.s.push(Math.round(s.pos.z * 10) / 10);
  }

  _updateGhost(dt) {
    if (!this.ghost || !this.ghostSkier) return;
    if (this.state === 'running') this.ghostT += dt;
    const g = this.ghost;
    const done = this.ghostT >= (g.n - 1) * g.dt;
    this.ghostSkier.group.visible = this.state !== 'idle' && !done;
    if (!this.ghostSkier.group.visible) return;
    const p = this._ghostAt(this.ghostT, this._ghostPos || (this._ghostPos = {}));
    this.ghostSkier.group.position.set(p.x, p.y, p.z);
    this.ghostSkier.group.rotation.y = p.yaw;
    if (this.state === 'running') {
      this.ghostDelta = this.elapsed - this._ghostTimeAt(this.skier.pos.z);
    }
  }

  /* -------- what a good run on this mountain looks like --------
     Worked out from the mountain rather than from a table, because a
     four-thousand-metre bowl and a three-thousand-metre gully are not
     the same job and a fixed par would call one of them easy. */
  _computeTargets() {
    const C = this.C;
    const face = this.face;
    /* Par is the run this mountain pays for being skied well, worked
       out the way the run actually pays rather than from a table: three
       and a half rungs of meter held most of the way down, two thirds
       of the reachable hoops, half the shortcuts and a dozen landings.
       Because it reads the mountain it just drew, a short mean gully
       and a long open bowl get honest medals instead of the same one. */
    const FLOW = 3.5;
    const golds = this.hoops.filter(h => h.gold).length;
    const safe = this.hoops.length - golds;
    const hoopPay = (safe * 0.45 + golds * 0.30 * C.goldMult) * C.moneyPerHoop * FLOW;
    // the last stretch pays double, so the effective mountain is longer
    const descent = face.total * (1 + (1 - C.finalFrom) * (C.finalMult - 1))
                  * C.moneyPerMetre * 0.82 * FLOW;
    const chute = this.chutes.length * 0.5 * C.chuteBase * 1.8;
    const tricks = 12 * 900;
    const raw = (hoopPay + descent + chute + tricks + C.finishBonus) * this.payout;
    const par = face.total / 30;              // thirty metres a second, near enough
    return this.mode === 'trial'
      ? { kind: 'time', par, cuts: [par * 1.28, par * 1.14, par * 1.02, par * 0.92] }
      : { kind: 'money', par: raw,
          cuts: [raw * 0.55, raw * 0.78, raw * 1.0, raw * 1.25] };
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

  /* =================== the HUD =================== */

  _cacheHud() {
    const q = id => document.getElementById(id);
    this.hud = {
      money: q('sk-money'), gain: q('sk-gain'),
      flow: q('sk-flow'), flowBar: q('sk-flow-bar'), flowWrap: q('sk-flow-wrap'),
      pips: q('sk-pips'),
      time: q('sk-time'), timeLabel: q('sk-time-label'), ghost: q('sk-ghost'),
      hoops: q('sk-hoops'), progress: q('sk-progress-fill'),
      section: q('sk-section'), vert: q('sk-vert'),
      speed: q('sk-speed'), speedBar: q('sk-speed-bar'),
      air: q('sk-air'), airRot: q('sk-air-rot'), airH: q('sk-air-h'),
      chute: q('sk-chute'), chuteName: q('sk-chute-name'),
      chuteGain: q('sk-chute-gain'), chuteArrow: q('sk-chute-arrow'),
      slide: q('sk-avalanche'), slideBar: q('sk-avalanche-bar'),
      center: q('sk-center'), setup: q('sk-setup'),
      vignette: q('sk-vignette'), flash: q('sk-flash'), lines: q('sk-lines'),
      pop: q('sk-pop'), popFill: q('sk-pop-fill'),
    };
    const h = this.hud;
    if (h.timeLabel) h.timeLabel.textContent = this.mode === 'trial' ? 'Elapsed' : 'Time';
    if (h.setup) {
      const bits = [this.courseName, SkiConditions.describe(this.cond)];
      if (this.mod) bits.push(this.mod.name);
      h.setup.innerHTML = bits
        .map((b, i) => `<span class="${i === 0 ? 'hs-name' : 'hs-tag'}">${b}</span>`).join('');
    }
    if (h.pips) {
      h.pips.innerHTML = '';
      for (let i = 0; i < this.C.flowLevels; i++) {
        const el = document.createElement('i');
        h.pips.appendChild(el);
      }
    }
    if (h.ghost) h.ghost.classList.toggle('show', !!this.ghost);
    if (h.slide) h.slide.classList.toggle('show', !!this.avOn);
  }

  /* =================== lifecycle =================== */

  start() {
    this.state = this.party ? 'waiting' : 'countdown';
    this.countdown = 3.999;
    this._lastBeep = 4;
    this.windSnd = AudioBus.wind();
    this.carveSnd = SkiAudio.carve();
    this.score = Music.descent();
    if (this.score && this.score.setGear) this.score.setGear(0, 0.5);
    Screens.show('hud-ski');
    this._setCenter('', '');
    if (this.party) {
      MissionNet.attach('ski');
      this._offEvents = MissionNet.on('event', (d, from) => this._onPeerEvent(d, from));
      this._agendaCheckpoint();
      RoomUI.showAgenda();
      this._setCenter('READY', 'Waiting for everybody…', 'count');
      MissionNet.waitForStart().then(() => {
        if (this.state === 'waiting') { this.state = 'countdown'; this._setCenter('', ''); }
      });
    }
  }

  _updateCountdown(dt) {
    this.countdown -= dt;
    const n = Math.ceil(this.countdown);
    if (n < this._lastBeep && n >= 0) {
      this._lastBeep = n;
      if (n > 0) {
        AudioBus.play('countdown', {});
        this._setCenter(String(n), '', 'count');
      } else {
        AudioBus.play('countdown', { go: true });
        this._setCenter('DROP IN', '', 'go');
        this.fovKick = 14;
        Input.rumble(0.6, 220);
        setTimeout(() => this._setCenter('', ''), 800);
      }
    }
    if (this.countdown <= 0) {
      this.state = 'running';
      // a shove off the lip, so nobody has to stand about on a cornice
      this.skier.vel.set(Math.sin(this.skier.heading) * 8, Math.cos(this.skier.heading) * 8);
    }
  }

  /* =================== per-frame =================== */

  update(rawDt, t) {
    if (!this.scene) return;
    if (Engine.isPaused()) return;
    if (Input.pressed('pause') && this.state === 'running') { this._pause(); return; }
    if (Input.pressed('mute')) AudioBus.toggleMute();

    // ---- time dilation: a beat of near-freeze when it goes wrong, and
    // ---- a long slow exhale over the line ----
    let dt = rawDt;
    if (this.hitStop > 0) {
      this.hitStop -= rawDt;
      dt = rawDt * 0.09;
    } else {
      this.timeScale = U.damp(this.timeScale, this.timeScaleTarget, 4.0, rawDt);
      dt = rawDt * this.timeScale;
    }

    if (this.state === 'countdown') this._updateCountdown(rawDt);

    const running = this.state === 'running';
    const s = this.skier;
    const noBrake = !!this.flags.noBrake;
    const ctl = running
      ? {
          steer: Input.steer(),
          throttle: noBrake ? Math.max(0, Input.throttle()) : Input.throttle(),
          trick: Input.held('boost'),
        }
      : { steer: 0, throttle: 0, trick: false };

    this.world.colliders = this._collidersNear(s.pos.z);

    if (running) {
      this._prevPos.copy(s.pos);
      s.update(dt, ctl, this.world);
    } else if (this.state === 'finished' || this.state === 'failed') {
      s.update(dt, { steer: 0, throttle: 0.4, trick: false }, this.world);
    } else {
      // on the cornice, waiting: still standing, still breathing
      s.update(dt * 0.35, ctl, this.world);
      this._prevPos.copy(s.pos);
    }

    if (running) {
      this.elapsed += dt;
      if (this.mode === 'prize') this.time -= dt;
      this._trackFlags(dt);
      this._updateFlow(dt);
      this._earnDescent(dt);
      this._checkChutes();
      this._checkGates();
      this._checkSpinners();
      this._checkGraze(dt);
      this._checkEvents(dt);
      this._checkSection();
      this._checkFinal();
      this._checkStuck(dt);
      this._recordGhost(dt);
      if (s.pos.z >= this.face.total) this._finish();
      if (this.mode === 'prize' && this.time <= 0) { this.time = 0; this._fail("TIME'S UP"); }
      if (this.mode === 'trial' && this.elapsed > this.C.trialLimit) this._fail('TOO SLOW');
    }

    this._updateAvalanche(dt);
    this._updateGhost(dt);
    this._updatePeers(dt);
    this._updateField(rawDt);
    if (this.party && this.state !== 'idle' && this.state !== 'waiting') {
      MissionNet.pose(rawDt, () => this._sendPose());
    }

    MountainKit.updateSpinners(this.spinnerMesh, dt);
    this._updateRings(dt, t);
    this._spawnFx(dt);
    this.fx.update(dt);
    if (this.windU) this.windU.time.value += dt;
    if (this.snowfall) this.snowfall.update(dt, this.camera.position,
      { x: Math.cos(this.cond.windDir || 0) * 0.6, z: Math.sin(this.cond.windDir || 0) * 0.6 });
    this._updateCamera(rawDt);
    Sky.update(dt, this.camera.position, t);
    this._updateAudio(rawDt);
    this._updateHud(rawDt);
  }

  /* -------- the ladder --------
     One meter, six rungs, and it is the multiplier on every pound the
     mountain pays. Everything that is skiing well feeds it and
     everything that is not drains it, which is what lets the whole
     mission be explained in one sentence and still have a ceiling. */

  _updateFlow(dt) {
    const C = this.C, s = this.skier;
    if (s.crashed) return;
    const fast = U.clamp((s.speed - C.speedFloor) / (C.speedFull - C.speedFloor), 0, 1);
    let gain = 0;
    if (s.airborne) gain += C.flowAir;
    else {
      gain += C.flowCarve * s.carve * (0.4 + fast * 0.6);
      gain += C.flowTuck * s.tuck * fast;
    }
    if (this._grazing) gain += C.flowGraze;
    if (this._curChute) gain += C.flowChute * 0.25;
    const decay = s.speed < C.speedFloor ? C.flowIdleDecay : C.flowDecay;
    this.flow += (gain - decay) * dt;

    while (this.flow >= 1) {
      if (this.flowLevel >= C.flowLevels) { this.flow = 1; break; }
      this.flow -= 1;
      this.flowLevel++;
      this._flowUp();
    }
    while (this.flow < 0) {
      if (this.flowLevel <= 1) { this.flow = 0; break; }
      this.flowLevel--;
      this.flow += C.flowLevelKeep;
      this._flowDown();
    }
    this.peakFlow = Math.max(this.peakFlow, this.flowLevel);
    if (this.flowLevel >= C.flowLevels) this._atTopT += dt;
    if (this.flowLevel <= 1) this._atOneT += dt;
  }

  _flowUp() {
    AudioBus.play('perfect', { combo: this.flowLevel * 2 });
    this.fx.labels.add('×' + this.flowLevel, this._tmpV.copy(this.skier.pos).setY(this.skier.pos.y + 3.4),
      { className: 'air', life: 1.1, rise: 10 });
    this._flash(0.10 + this.flowLevel * 0.02, '#8ef0ff');
    Input.rumble(0.28, 90);
    this._setMusicGear();
  }

  _flowDown() {
    AudioBus.play('miss');
    this._setMusicGear();
  }

  _setMusicGear() {
    if (!this.score || !this.score.setGear) return;
    const gears = (Music.SKI_GEARS || []).length || 5;
    const g = Math.round((this.flowLevel - 1) / Math.max(1, this.C.flowLevels - 1) * (gears - 1));
    this.score.setGear(g, 1.6);
    if (this.score.setIntensity) this.score.setIntensity(0.6 + this.flow * 0.4);
  }

  // what stretch of the run is worth right now
  get _mult() {
    return this._inFinal ? this.C.finalMult : 1;
  }

  _earnDescent(dt) {
    const C = this.C, s = this.skier;
    if (s.crashed) return;
    const fast = U.clamp((s.speed - C.speedFloor) / (C.speedFull - C.speedFloor), 0, 1.2);
    if (fast <= 0) return;
    const metres = s.speed * dt;
    const m = metres * C.moneyPerMetre * (0.28 + 0.72 * fast) * this.flowLevel * this._mult;
    this.money += m;
    this.descentMoney += m;
  }

  /* -------- the rescue --------
     A mountain this file did not draw and cannot inspect can always,
     in principle, produce a bowl: enough terms summed over enough
     seeds and one of them eventually closes. The known cause of that
     is fixed in `mountain.js`, but "we fixed the one we found" is not
     a guarantee, and the failure mode is the worst one a mission has —
     a run that has not ended and cannot continue, with a clock running.

     So there is a floor under it. Sit still on the snow for three
     seconds with the run live and the mountain puts you back on the
     piste twenty metres downhill, moving, and says so. It costs you the
     three seconds and whatever the meter had, which is punishment
     enough for the far more common way to trigger it: stopping. */
  _checkStuck(dt) {
    const s = this.skier;
    if (s.crashed || s.airborne || s.speed > 2.5) { this._stuckT = 0; return; }
    this._stuckT = (this._stuckT || 0) + dt;
    if (this._stuckT < 3) return;
    this._stuckT = 0;
    const z = s.pos.z + 20;
    const x = this.face.cxAt(z);
    s.place(x, z, Math.atan(this.face.cxSlopeAt(z)), this.world);
    s.vel.set(Math.sin(s.heading) * 10, Math.cos(s.heading) * 10);
    s.speed = 10;
    this.flow = 0;
    this.flowLevel = Math.max(1, this.flowLevel - 1);
    this._setMusicGear();
    this._prevPos.copy(s.pos);
    this.fx.wake.clear();
    AudioBus.play('boostpop');
    this._setCenter('BACK ON THE PISTE', 'you had stopped', 'bad');
    clearTimeout(this._stuckMsgT);
    this._stuckMsgT = setTimeout(() => {
      if (this.state === 'running') this._setCenter('', '');
    }, 1200);
  }

  _trackFlags(dt) {
    const s = this.skier, st = this.stats;
    const dz = Math.max(0, s.pos.z - this._prevPos.z);
    const dy = Math.max(0, this._prevPos.y - s.pos.y);
    this.vertical += dy;
    this.topSpeed = Math.max(this.topSpeed, s.speed);
    if (s.airborne) { this.airTotal += dt; this.biggestAir = Math.max(this.biggestAir, s.airHeight); }
    st.vertical = Math.round(this.vertical);
    st.topSpeed = this.topSpeed;
    st.elapsed = this.elapsed;
    st.airTime = this.airTotal;
    st.biggestAir = this.biggestAir;
    st.peakFlow = this.peakFlow;
    st.timeAtTop = this._atTopT;
    st.timeAtOne = this._atOneT;
    st.avgSpeed = this.elapsed > 0 ? s.pos.z / this.elapsed : 0;

    // the two things a Traitor's deck asks about that nothing else counts
    if (s.speed < 12 && !s.crashed) { this._slowT += dt; }
    else this._slowT = 0;
    st.slowestStretch = Math.max(st.slowestStretch, this._slowT);
    // "straight-lined": going quickly and doing nothing at all with it
    if (!s.airborne && !s.crashed && s.speed > 26 && s.carve < 0.06 && !this._grazing) {
      this._straightT += dt;
    } else this._straightT = 0;
    st.straightLined = Math.max(st.straightLined, this._straightT);
  }

  /* -------- the hoops --------
     One test per gate, and it is a plane test in z because the mountain
     descends along z. That is the whole dividend of the face being one
     axis: there is no nearest-point search anywhere in this mission,
     and a gate can be scored exactly rather than within a frame of it. */

  _checkGates() {
    const s = this.skier;
    const pz = this._prevPos.z, cz = s.pos.z;
    for (const gate of this.gates) {
      if (gate.state !== 'pending') continue;
      if (gate.z > cz + 4) break;                    // the list is sorted
      if (gate.z < pz - 60) { gate.state = 'skipped'; this._dimGate(gate); continue; }
      if (!(pz < gate.z && cz >= gate.z)) continue;

      /* A gate belongs to a route. The groomed run's gates do not count
         against you while you are in a shortcut and the shortcut's do
         not count while you are on the run — which is what makes taking
         one a trade rather than a free lunch. */
      const live = gate.route === null ? !this._curChute : gate.route === this._curChute;
      if (!live) { gate.state = 'skipped'; this._dimGate(gate); continue; }

      /* An air hoop hung off a kicker is an *opportunity*, not a gate.
         Sailing past one on the snow because you did not take that jump
         is a line choice; charging it seconds and a rung of meter for
         every kicker on the mountain it did not use turned sixty free
         invitations into sixty ways to be punished. Ground gates still
         count both ways — those are across the run and you had to have
         gone round one on purpose. */
      if (gate.kind === 'air' && !s.airborne) {
        gate.state = 'skipped'; this._dimGate(gate); continue;
      }

      const a = (gate.z - pz) / Math.max(cz - pz, 1e-6);
      const ix = U.lerp(this._prevPos.x, s.pos.x, a);
      const iy = U.lerp(this._prevPos.y, s.pos.y, a);

      let best = null;
      for (const h of gate.rings) {
        const d = Math.hypot(ix - h.x, iy - h.y);
        if (d >= h.radius) continue;
        if (!best) best = { h, d };
        else if (h.gold !== best.h.gold) { if (h.gold) best = { h, d }; }
        else if (d < best.d) best = { h, d };
      }
      if (best) { this._hitRing(gate, best.h, best.d); continue; }

      /* An air hoop belongs to one lip. Being off the ground somewhere
         else on the mountain when its plane goes past is not a fumbled
         hoop, it is a different jump — so it only counts against you if
         you were near enough to have been going for it. */
      if (gate.kind === 'air') {
        let near = Infinity;
        for (const h of gate.rings) {
          near = Math.min(near, Math.hypot(ix - h.x, iy - h.y) / h.radius);
        }
        if (near > 2.6) { gate.state = 'skipped'; this._dimGate(gate); continue; }
      }
      this._missGate(gate);
    }
  }

  /* ---- the spinners ----
     Same plane test as a hoop, and for the same reason: the mountain
     runs along z, so a ring can be scored exactly rather than within a
     frame of it. The difference is that a spinner is never a miss.
     Nothing on this mountain punishes you for not having flown through
     a hoop that was six metres off the ground; it just pays, hard, when
     you do. */
  _checkSpinners() {
    if (!this.spinners || !this.spinners.length) return;
    const C = this.C;
    const s = this.skier;
    const pz = this._prevPos.z, cz = s.pos.z;
    if (cz <= pz) return;
    for (const sp of this.spinners) {
      if (sp.taken || sp.z <= pz || sp.z > cz) continue;
      const a = (sp.z - pz) / Math.max(cz - pz, 1e-6);
      const ix = U.lerp(this._prevPos.x, s.pos.x, a);
      const iy = U.lerp(this._prevPos.y, s.pos.y, a);
      const d = Math.hypot(ix - sp.x, iy - sp.y);
      if (d >= sp.r) continue;

      sp.taken = true;
      this.stats.spinners++;
      /* Through the middle is worth more than through the edge, which
         is the only thing that makes a spinner an aiming problem rather
         than a wide open door. */
      const centred = 1 - U.clamp(d / sp.r, 0, 1);
      const power = 0.75 + centred * 0.75;
      s.spinnerHit(power);
      const m = C.spinnerMoney * power * this.flowLevel * this._mult;
      this.money += m;
      this.trickMoney += m;
      this.flow += C.spinnerFlow * power;
      this.camPush = Math.min(1, this.camPush + 0.5);
      this.fx.labels.add('SPINNER  ' + U.money(Math.round(m * this.payout)),
        this._tmpV.set(sp.x, sp.y + 1.6, sp.z),
        { className: 'gold', life: 1.3, rise: 14 });
      AudioBus.play('perfect', { combo: this.flowLevel * 2 });
      Input.rumble(0.55, 170);
      this._flash(0.16, '#ffd9a0');
    }
  }

  _hitRing(gate, h, d) {
    const C = this.C;
    gate.state = 'hit';
    h.state = 'hit';
    h.flash = 1;
    const perfect = d < h.radius * 0.36;
    const mult = (h.gold ? C.goldMult : 1) * (perfect ? C.perfectMult : 1);
    const m = C.moneyPerHoop * mult * this.flowLevel * this._mult;
    this.money += m;
    this.hoopMoney += m;
    this.hoopsHit++;
    if (perfect) this.perfects++;
    if (h.gold) this.golds++;
    else if (gate.rings.some(r => r.gold)) this.stats.goldsDeclined++;
    this.stats.hoops = this.hoopsHit;
    this.stats.perfects = this.perfects;
    this.stats.golds = this.golds;

    // the clock, which is the reason to bother at all
    if (this.mode === 'trial') this.deduct += C.trialGain * (perfect ? 1.35 : 1);
    else this.time += C.timePerHoop * (perfect ? 1.28 : 1);

    this.flow += perfect ? C.flowPerfect : C.flowHoop;
    if (h.gold) this.flow += C.flowHoop * 0.5;

    // dim whatever else was on this plane: you cannot have both
    for (const r of gate.rings) if (r !== h && r.state === 'pending') r.state = 'skipped';

    AudioBus.play(perfect ? 'perfect' : 'hoop', { combo: this.flowLevel * 2 });
    if (h.air) AudioBus.play('whoosh', { amount: 1.1 });
    Input.rumble(perfect ? 0.5 : 0.3, perfect ? 150 : 90);
    this.fovKick = Math.min(this.fovKick + (perfect ? 6 : 3), 14);
    const label = (h.gold ? 'GOLD ' : '') + (perfect ? 'PERFECT' : '') || 'HOOP';
    this.fx.labels.add(
      (perfect ? 'PERFECT ' : '') + U.money(Math.round(m * this.payout)),
      this._tmpV.set(h.x, h.y + 1.6, h.z),
      { className: h.gold ? 'gold' : 'good', life: 1.15, rise: 11 });
    this.fx.rings.fire(this._tmpV.set(h.x, h.y, h.z), this.camera.quaternion,
      h.radius * 0.85, h.radius * 2.4, 0.5, h.gold ? '#ffd166' : '#8ef0ff');
    if (perfect) this._flash(0.18, h.gold ? '#ffd166' : '#8ef0ff');
  }

  _missGate(gate) {
    const C = this.C;
    gate.state = 'missed';
    for (const r of gate.rings) if (r.state === 'pending') r.state = 'missed';
    this._dimGate(gate);
    this.stats.gatesMissed++;
    if (this.mode === 'trial') this.deduct -= C.trialMissPenalty;
    else this.time -= C.missPenalty;
    this.flow -= 0.30;
    AudioBus.play('miss');
    this.fx.labels.add('MISSED', this._tmpV.copy(this.skier.pos).setY(this.skier.pos.y + 2.4),
      { className: 'bad', life: 1.0, rise: 8 });
  }

  _dimGate(gate) {
    for (const r of gate.rings) if (r.state === 'pending') r.state = 'skipped';
  }

  /* Rings breathe while they are waiting and flare when they are taken.
     Only the ones you could possibly see are touched: three hundred
     hoops updated every frame down a four-kilometre mountain is most of
     a frame budget spent on things behind you. */
  _updateRings(dt, t) {
    const sz = this.skier.pos.z;
    for (const h of this.hoops) {
      const near = h.z > sz - 90 && h.z < sz + 620;
      if (h.group.visible !== near) h.group.visible = near;
      if (!near) continue;
      if (h.state === 'pending') {
        const beat = h.gold ? 4.4 : 3.0;
        const pulse = 1.05 + Math.sin(t * beat + h.z * 0.07) * (h.gold ? 0.5 : 0.32);
        h.mat.emissiveIntensity = pulse;
        h.lampMat.opacity = 0.10 + pulse * 0.05;
        h.glowMat.opacity = 0.06 + pulse * 0.05;
        h.group.scale.setScalar(1 + Math.sin(t * beat + h.z * 0.07) * 0.014);
      } else if (h.flash > 0) {
        h.flash = Math.max(0, h.flash - dt * 1.7);
        h.mat.emissiveIntensity = 0.6 + h.flash * 3.0;
        h.lampMat.opacity = 0.05 + h.flash * 0.5;
        h.glowMat.opacity = 0.04 + h.flash * 0.4;
        h.group.scale.setScalar(1 + h.flash * 0.10);
      } else {
        h.mat.emissiveIntensity = 0.12;
        h.lampMat.opacity = 0.05;
        h.glowMat.opacity = 0.02;
        h.group.scale.setScalar(1);
      }
    }
  }

  /* -------- the shortcuts --------
     The only decision on this mountain you make with your eyes rather
     than your hands, so most of the work here is telling you it is
     coming, in time, once, and then never mentioning it again. */

  _checkChutes() {
    const s = this.skier;
    const inC = this.face.inChute(s.pos.x, s.pos.z);
    if (inC && !this._curChute) this._enterChute(inC);
    else if (!inC && this._curChute) this._leaveChute();

    // ...and the card for whichever one is next
    let show = null;
    for (const c of this.chutes) {
      if (c.taken || c.passed) continue;
      const d = c.z0 - s.pos.z;
      if (d < -30) { c.passed = true; this.stats.chutesPassed.push(c.name); continue; }
      if (d < 300) { show = { c, d }; break; }
    }
    this._chutePrompt = this._curChute ? null : show;
  }

  _enterChute(c) {
    this._curChute = c;
    this._chuteEnterZ = this.skier.pos.z;
    c.entered = true;
    this.flow += this.C.flowChute * 0.5;
    AudioBus.play('boostpop');
    this._flash(0.20, '#ffd166');
    this.fovKick = Math.min(this.fovKick + 9, 16);
    Input.rumble(0.5, 200);
    this._setCenter(c.name.toUpperCase(),
      'saves ' + Math.round(c.gain) + 'm · gates pay ×3', 'go');
    clearTimeout(this._chuteT);
    this._chuteT = setTimeout(() => {
      if (this.state === 'running') this._setCenter('', '');
    }, 1500);
  }

  _leaveChute() {
    const c = this._curChute;
    this._curChute = null;
    if (!c) return;
    const out = this.skier.pos.z >= c.z1 - 8;
    if (out) {
      c.taken = true;
      this.chutesDone++;
      const bounty = this.flags.chuteBounty || 1;
      const m = this.C.chuteBase * (1 + c.hard) * bounty;
      this.money += m;
      this.chuteMoney += m;
      this.stats.chutesTaken.push(c.name);
      this.stats.chuteMetres += Math.round(c.gain);
      this.flow += this.C.flowChute;
      if (this.mode === 'trial') this.deduct += this.C.trialGain * 2;
      else this.time += this.C.timePerHoop * 1.8;
      AudioBus.play('finish');
      Input.rumble(0.7, 280);
      this._flash(0.24, '#ffd166');
      this.fx.labels.add(c.name.toUpperCase() + '  ' + U.money(Math.round(m * this.payout)),
        this._tmpV.copy(this.skier.pos).setY(this.skier.pos.y + 4),
        { className: 'gold', life: 1.6, rise: 12 });
    } else {
      // bailed out of the side of it, which costs the rung it bought
      this.stats.chutesBailed++;
      this.flow -= 0.45;
      AudioBus.play('miss');
      this.fx.labels.add('BAILED', this._tmpV.copy(this.skier.pos).setY(this.skier.pos.y + 2.6),
        { className: 'bad', life: 1.1, rise: 8 });
    }
  }

  /* -------- the wood pays --------
     Skiing inside the trees is the only income on the mountain that is
     purely nerve: there is no gate to aim at and nothing to time, just
     a distance you are choosing to hold. */
  _checkGraze(dt) {
    const C = this.C, s = this.skier;
    if (s.airborne || s.crashed || s.speed < C.speedFloor) {
      this._grazing = false; this._grazeT = 0; return;
    }
    let near = false;
    for (const c of this.world.colliders) {
      if (c.kind !== 'tree') continue;
      const dx = s.pos.x - c.x, dz = s.pos.z - c.z;
      if (dx * dx + dz * dz < (C.grazeDist + c.r) * (C.grazeDist + c.r)) { near = true; break; }
    }
    this._grazing = near;
    if (!near) { this._grazeT = 0; return; }
    this._grazeT += dt;
    while (this._grazeT >= C.grazeStep) {
      this._grazeT -= C.grazeStep;
      const m = C.grazeMoney * this.flowLevel * this._mult;
      this.money += m;
      this.grazeMoney += m;
      this.stats.trees++;
      AudioBus.play('money', { index: this.stats.trees });
      this.fx.labels.add('TREES', this._tmpV.copy(s.pos).setY(s.pos.y + 2.2),
        { className: 'good', life: 0.75, rise: 7 });
    }
  }

  /* -------- what the skier did this frame --------
     Launches, landings and crashes all arrive as one-frame flags on the
     entity, which keeps the physics honest and puts every consequence —
     money, clock, ladder, camera, band — in one readable place. */
  _checkEvents(dt) {
    const s = this.skier;
    /* ---- the pads ----
       One report per pad rather than one per frame: the boost is a
       continuous force and announcing it continuously would be sixty
       labels and a solid tone. The cooldown is a little longer than the
       longest run-up on the hill, so a pad you cross the corner of and
       a pad you drive the length of both say it exactly once. */
    this._boostT = Math.max(0, (this._boostT || 0) - dt);
    const b = s.boost || 0;
    if (b > 0.22 && this._boostT <= 0 && !s.crashed) {
      this._boostT = 0.9;
      const amt = U.clamp(b, 0, 1.8);
      this.camPush = Math.min(1, this.camPush + 0.30 * amt);
      AudioBus.play('boostpop', { amount: U.clamp(amt, 0.3, 1.4) });
      this.flow += 0.05 * amt;
      Input.rumble(0.22, 70);
      if (b > 0.95) {
        this.fx.labels.add('BOOST', this._tmpV.copy(s.pos).setY(s.pos.y + 2.2),
          { className: 'air', life: 0.7, rise: 14 });
      }
    }

    /* Every trick announces itself at the moment it is thrown rather
       than when it lands, because half of what makes a big one feel big
       is the second and a half of knowing what is coming. */
    if (s.threw && s._auto && s._auto.name !== 'AIR') {
      this.fx.labels.add(s._auto.name, this._tmpV.copy(s.pos).setY(s.pos.y + 3.0),
        { className: 'air', life: 1.0, rise: 16 });
    }

    if (s.launched) this._onLaunch(s);
    if (s.lastTrick) this._onLanding(s.lastTrick);
    if (s.crashedNow) this._onCrash(s.crashedNow);
    if (s.bumped && s.bumped.force > 3 && !s.crashed) {
      AudioBus.play('crash', { amount: U.clamp(s.bumped.force / 14, 0.2, 0.8) });
      Input.rumble(0.3, 90);
      this.shake = Math.max(this.shake, U.clamp(s.bumped.force / 16, 0, 0.6));
      this.flow -= 0.12;
    }
  }

  _onLaunch(s) {
    this.camPush = Math.min(1, this.camPush + 0.55);
    AudioBus.play('air', { amount: U.clamp(s.launched, 0.3, 1.6) });
    if (s.popped > 0.55) {
      AudioBus.play('boostpop');
      this.fx.labels.add('POP!', this._tmpV.copy(s.pos).setY(s.pos.y + 2),
        { className: 'air', life: 0.8, rise: 12 });
      this.flow += 0.06;
    }
    /* The band gets out of the way for the length of the jump. Air is
       the only quiet a ski run has, and a score that played through it
       would have thrown away the best beat in the mission. */
    if (this.score && this.score.duck && s.launched > 0.45) {
      this.score.duck(0.28, 1.1);
    }
  }

  _onLanding(tk) {
    const C = this.C;
    const s = this.skier;
    this.camDip = Math.min(1, this.camDip + U.clamp(tk.impact / 20, 0.1, 1));
    this.stats.landings++;

    if (!tk.landed) return;                 // the crash path handles the rest

    /* What counts as a trick. Hang time and height alone used to, and
       on a mountain with sixty kickers on it that meant forty little
       hops a run, each paying a few hundred pounds times the meter —
       seventy per cent of the whole economy, earned by holding one key
       and steering straight. Rotation is the money now; height only
       pays once there is enough of it to have been a decision, and a
       hop off a roller pays nothing but still feeds the meter, which is
       the correct reward for it. */
    const worthIt = tk.spins >= 1 || tk.flips >= 1 || tk.rolls >= 1
                 || tk.grabbed || tk.height >= 6;
    if (tk.air > 0.30 && worthIt) {
      let m = tk.spins * C.trickSpin
            + tk.flips * C.trickFlip
            + (tk.rolls || 0) * C.trickRoll
            + (tk.grabbed ? C.trickGrab : 0)
            + Math.max(0, tk.air - 0.5) * C.trickAir
            + Math.max(0, tk.height - 4) * C.trickHeight;
      m *= tk.grade.pay;
      if (tk.stomped) m *= C.stompMult;
      m = Math.min(m * this.flowLevel * this._mult, C.trickCap);
      this.money += m;
      this.trickMoney += m;
      this.tricks++;
      this.stats.tricks = this.tricks;
      if (tk.stomped) {
        this.stomps++;
        this.stats.stomps = this.stomps;
        if (this.mode === 'trial') this.deduct += C.timeStompBonus * 0.6;
        else this.time += C.timeStompBonus;
      }
      this.flow += tk.grade.flow * 0.16;

      const name = SkiMission.trickName(tk);
      this.fx.labels.add(name + '  ' + U.money(Math.round(m * this.payout)),
        this._tmpV.copy(s.pos).setY(s.pos.y + 3.4),
        { className: tk.stomped ? 'gold' : 'air', life: 1.5, rise: 13 });
      AudioBus.play(tk.stomped ? 'perfect' : 'hoop', { combo: this.flowLevel * 2 });
      SkiAudio.play('land', { amount: U.clamp(tk.impact / 22, 0.3, 1.4) });
      Input.rumble(tk.stomped ? 0.8 : 0.45, tk.stomped ? 260 : 140);
      if (tk.stomped) {
        this._flash(0.22, '#ffe9a8');
        this.hitStop = 0.055;
      }
    } else {
      // it still fed the meter on the way up; it just does not pay
      SkiAudio.play('land', { amount: 0.35 + U.clamp(tk.impact / 40, 0, 0.5) });
    }
  }

  /* The book's own name for it if the mountain threw it and the player
     left it alone, because "CORK 360" is a thing to be pleased about
     and "360 · FLIP" is a readout. Anything the player steered
     themselves gets described rather than named — they know what they
     did, and half the appeal of taking over is that the result is not
     in any book. */
  static trickName(tk) {
    const parts = [];
    if (tk.name) parts.push(tk.name);
    else {
      if (tk.spins >= 1) parts.push((tk.spins * 360) + '°');
      if (tk.flips >= 1) parts.push(tk.flips > 1 ? (tk.flips + '× FLIP') : 'FLIP');
      if (tk.rolls >= 1) parts.push(tk.rolls > 1 ? (tk.rolls + '× CORK') : 'CORK');
      if (!parts.length) {
        if (tk.height > 9) parts.push('BIG AIR');
        else if (tk.air > 1.0) parts.push('AIR');
        else parts.push('HOP');
      }
    }
    if (tk.stomped) parts.push('STOMPED');
    return parts.join(' · ');
  }

  _onCrash(reason) {
    const C = this.C;
    const s = this.skier;
    this.crashes++;
    this.stats.crashes = this.crashes;
    /* Three rungs, not all of them. Emptying the ladder was the honest
       reading of "falling over throws it away" and it made one tree at
       the top of the mountain worth more than everything the run did
       afterwards — so a good player's correct move became to stop
       trying, which is the opposite of what this meter is for. */
    this.flow = 0;
    this.flowLevel = Math.max(1, this.flowLevel - 3);
    this._setMusicGear();
    if (this.mode === 'trial') this.deduct -= C.trialCrashPenalty;
    else this.time -= C.crashPenalty;
    this.hitStop = 0.10;
    this.shake = 1;
    this.timeScaleTarget = 0.55;
    clearTimeout(this._slowmoT);
    this._slowmoT = setTimeout(() => { this.timeScaleTarget = 1; }, 620);
    AudioBus.play('crash', { amount: 1.2 });
    SkiAudio.play('yardsale');
    Input.rumble(1, 420);
    this._flash(0.26, '#ff6a6a');
    const label = reason === 'TREE' ? 'TREE!' : reason === 'ROCK' ? 'ROCK!' : 'DOWN';
    this._setCenter(label,
      this.flags.oneCrash ? '' : '−' + C.crashPenalty.toFixed(0) + 's · −3 rungs', 'bad');
    clearTimeout(this._crashT);
    this._crashT = setTimeout(() => {
      if (this.state === 'running') this._setCenter('', '');
    }, 1300);
    // a burst of everything you were carrying, thrown down the hill
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * U.TAU;
      const sp = 4 + Math.random() * 16;
      this.fx.spray.emit(s.pos.x, s.pos.y + 0.6 + Math.random() * 1.4, s.pos.z,
        Math.cos(a) * sp, 3 + Math.random() * 11, Math.sin(a) * sp,
        1.2 + Math.random() * 2.2, 0.8 + Math.random(), MountainKit.COL.snowLit);
    }
    if (this.flags.oneCrash) this._fail('GLASS CANNON');
  }

  /* -------- the shape of a run --------
     The mountain deals its own running order, so all this does is name
     each section as you arrive in it and turn the screw on the last
     stretch of it. Both beats are the boat race's, and they work here
     for the same reason: a run that is the same job from the top to the
     bottom is one you have finished after two goes. */

  _checkSection() {
    const sec = this.face.sectionAt(this.skier.pos.z);
    if (!sec || this._seenSection.has(sec)) return;
    this._seenSection.add(sec);
    this.section = sec;
    if (sec.id === 'cornice') return;             // you are already in it
    this.fx.labels.add(sec.name.toUpperCase(),
      this._tmpV.copy(this.skier.pos).setY(this.skier.pos.y + 5),
      { className: 'air', life: 1.7, rise: 9 });
    AudioBus.play('hoop', { combo: 4 });
  }

  _checkFinal() {
    if (this._inFinal) return;
    if (this.skier.pos.z < this.face.total * this.C.finalFrom) return;
    this._inFinal = true;
    this._setCenter('LAST STRETCH', `Everything pays ×${this.C.finalMult}`, 'go');
    this._flash(0.26, '#b98cff');
    this.fovKick = Math.min(this.fovKick + 9, 16);
    AudioBus.play('perfect', { combo: 8 });
    Input.rumble(0.55, 240);
    if (this.score && this.score.setIntensity) this.score.setIntensity(1.2);
    clearTimeout(this._finalT);
    this._finalT = setTimeout(() => {
      if (this.state === 'running') this._setCenter('', '');
    }, 1600);
  }

  /* =================== end states =================== */

  _clock() {
    return this.mode === 'trial'
      ? Math.max(0, this.elapsed - this.deduct)
      : Math.max(0, this.time);
  }

  _finish() {
    if (this.state !== 'running') return;
    this.state = 'finished';
    const C = this.C;
    this.stats.finished = true;
    this.stats.elapsed = this.elapsed;
    this.stats.flowAtFinish = this.flowLevel;
    if (this.party) {
      MissionNet.event({ kind: 'finish', t: this.elapsed });
      const pl = this._placeNow();
      this.stats.place = pl.place;
      this.stats.of = pl.of;
      this.stats.finishGap = pl.gap;
    }
    const trial = this.mode === 'trial';
    const finalTime = trial ? this._clock() : 0;
    const timeBonus = trial
      ? Math.round(Math.max(0, this.targets.par - finalTime) * C.timeBonusPerSecond)
      : Math.round(Math.max(0, this.time) * C.timeBonusPerSecond);
    const raw = this.money + C.finishBonus + timeBonus;
    const earned = Math.round(raw * this.payout);
    const medal = this._medalFor(trial ? finalTime : earned);

    AudioBus.play('finish');
    if (this.score && this.score.setGear) this.score.setGear(0, 3);
    this._setCenter('DOWN', trial ? U.clockTime(finalTime) : U.money(earned), 'go');
    this.timeScaleTarget = 0.35;
    this.fovKick = 14;
    Input.rumble(0.9, 460);
    this._confetti();
    this.result = this._buildResult({
      completed: true, earned, raw, timeBonus, finalTime, medal,
      finishBonus: C.finishBonus,
    });
    this._reportT = setTimeout(() => this._report(), 1900);
  }

  _fail(headline) {
    if (this.state !== 'running') return;
    this.state = 'failed';
    this.stats.finished = false;
    this.stats.place = this.peers.size + 1;
    this.stats.of = this.peers.size + 1;
    this.stats.flowAtFinish = this.flowLevel;
    AudioBus.play('miss');
    if (this.score && this.score.setGear) this.score.setGear(0, 2);
    this._setCenter(headline || "TIME'S UP", '', 'bad');
    this.timeScaleTarget = 0.5;
    // half of what the mountain paid is still money — unless the card
    // you took says it is not
    const kept = this.flags.allOrNothing ? 0 : Math.round(this.money * 0.5 * this.payout);
    this.result = this._buildResult({
      completed: false, earned: kept, raw: this.money, timeBonus: 0,
      finalTime: this.mode === 'trial' ? this._clock() : 0, medal: 0, finishBonus: 0,
      reason: headline || "TIME'S UP",
    });
    this._reportT = setTimeout(() => this._report(), 1800);
  }

  _confetti() {
    const s = this.skier;
    const cols = ['#ffd166', '#e5133f', '#3ddc84', '#39e6ff', '#ffffff'];
    for (let i = 0; i < 240; i++) {
      const a = Math.random() * U.TAU;
      const sp = 6 + Math.random() * 24;
      const c = new THREE.Color(cols[(Math.random() * cols.length) | 0]);
      this.fx.sparks.emit(
        s.pos.x + (Math.random() - 0.5) * 9, s.pos.y + 2 + Math.random() * 6,
        s.pos.z + (Math.random() - 0.5) * 9,
        Math.cos(a) * sp, 9 + Math.random() * 18, Math.sin(a) * sp,
        1.4 + Math.random() * 1.9, 1.6 + Math.random() * 1.5, c);
    }
  }

  _buildResult(part) {
    return Object.assign({
      mode: this.mode,
      modeName: this.modeDef.name,
      seed: this.seed,
      courseName: this.courseName,
      conditionText: SkiConditions.describe(this.cond),
      modId: this.opts.modId,
      modName: this.mod ? this.mod.name : null,
      payout: this.payout,
      key: this.key,
      hoopMoney: this.hoopMoney,
      trickMoney: this.trickMoney,
      grazeMoney: this.grazeMoney,
      chuteMoney: this.chuteMoney,
      descentMoney: this.descentMoney,
      timeLeft: Math.max(0, this.time),
      elapsed: this.elapsed,
      hoops: this.hoopsHit,
      totalHoops: this.gates.length,
      perfects: this.perfects,
      golds: this.golds,
      tricks: this.tricks,
      stomps: this.stomps,
      crashes: this.crashes,
      peakFlow: this.peakFlow,
      chutes: this.chutesDone,
      totalChutes: this.chutes.length,
      chuteMetres: this.stats.chuteMetres,
      vertical: Math.round(this.vertical),
      verticalTotal: Math.round(this.vertTotal),
      topSpeed: this.topSpeed,
      airTime: this.airTotal,
      biggestAir: this.biggestAir,
      spinners: this.stats.spinners,
      route: this.face.sections.map(s => s.name),
      par: this.targets.par,
      targetKind: this.targets.kind,
      place: this.stats.place,
      of: this.stats.of,
      stats: Object.assign({}, this.stats),
    }, part);
  }

  _report() {
    if (this.reported || !this.result) return;
    this.reported = true;
    const r = this.result;
    if (this.opts.tod === 'auto') SkiMission.advanceTime();
    const { isBest } = GameState.recordRun('ski', this.key, r, this.modeDef.better);
    r.courseBest = isBest;
    r.ghostDelta = this.ghost && this.ghostDelta !== null ? this.ghostDelta : null;
    if (r.completed && isBest && this.rec.x.length > 4) {
      GameState.saveGhost('ski', this.key, {
        dt: this.C.ghostRate, n: this.rec.x.length,
        x: this.rec.x, y: this.rec.y, z: this.rec.z, yaw: this.rec.yaw, s: this.rec.s,
        time: this.mode === 'trial' ? r.finalTime : this.elapsed,
      });
    }
    Missions.complete(r);
  }

  _pause() {
    Engine.setPaused(true);
    document.getElementById('pause-restart').hidden = !!this.party;
    Screens.show('pause');
  }

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

  /* =================== the feel ===================

     Everything from here down is a lie told sixty times a second, and
     it is also most of what a player thinks the physics is. */

  _updateCamera(dt) {
    const s = this.skier, cam = this.camera;
    const sp01 = U.clamp(s.speed / s.tune.topSpeed, 0, 1.3);
    const air = s.airborne ? 1 : 0;

    this.camPush = U.damp(this.camPush, 0, 2.6, dt);
    this.camDip = U.damp(this.camDip, 0, 4.6, dt);
    this.shake = U.damp(this.shake, 0, 3.0, dt);
    this.fovKick = U.damp(this.fovKick, 0, 3.4, dt);

    const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
    const dist = 9.2 + sp01 * 8.0 + this.camPush * 3.6 + air * 2.4;
    const high = 3.6 + sp01 * 1.5 + air * 2.0;

    const wx = s.pos.x - fx * dist;
    const wz = s.pos.z - fz * dist;
    /* The camera lives above whichever is higher — the skier, or the
       snow it is standing over. On a face this steep the ground behind
       you is a long way above your head, and a camera that only knew
       about the skier spent every steep pitch inside the mountain. */
    let wy = Math.max(s.pos.y + high, this.face.heightAt(wx, wz) + 2.6);

    const lag = s.crashed ? 2.6 : U.lerp(6.0, 3.6, sp01);
    this._camPos.x = U.damp(this._camPos.x, wx, lag, dt);
    this._camPos.y = U.damp(this._camPos.y, wy, lag * 1.35, dt);
    this._camPos.z = U.damp(this._camPos.z, wz, lag, dt);

    // look down the hill rather than at the back of a helmet
    const reach = 10 + sp01 * 20;
    this._tmpV.set(s.pos.x + fx * reach,
                   s.pos.y + 1.6 - air * 2.4 - this.camDip * 2.0,
                   s.pos.z + fz * reach);
    this._camLook.x = U.damp(this._camLook.x, this._tmpV.x, 6, dt);
    this._camLook.y = U.damp(this._camLook.y, this._tmpV.y, 5, dt);
    this._camLook.z = U.damp(this._camLook.z, this._tmpV.z, 6, dt);

    cam.position.copy(this._camPos);
    if (this.shake > 0.001) {
      const k = this.shake * this.shake * 1.3;
      cam.position.x += (Math.random() - 0.5) * k;
      cam.position.y += (Math.random() - 0.5) * k;
      cam.position.z += (Math.random() - 0.5) * k * 0.6;
    }
    cam.up.set(0, 1, 0);
    cam.lookAt(this._camLook);
    // and the horizon tips into the turn, which is the single cheapest
    // thing in the file and the one people describe as "the speed"
    const wantRoll = U.clamp(-s.yawVel * 0.16 - s.lean * 0.32, -0.26, 0.26);
    this._camRoll = U.damp(this._camRoll, s.crashed ? 0 : wantRoll, 5, dt);
    cam.rotateZ(this._camRoll);

    const targetFov = this.baseFov + sp01 * 15 + air * 3 + s.tuck * 4 + this.fovKick;
    cam.fov = U.damp(cam.fov, targetFov, 7, dt);
    cam.updateProjectionMatrix();
  }

  /* The snow coming off the edge. One number drives it — `slip` — so
     the plume, the trench, the hiss and the speed you are losing can
     never disagree about how hard you are working. */
  _spawnFx(dt) {
    const s = this.skier;
    const C = MountainKit.COL;
    if (s.crashed) {
      this._sprayAcc = 0;
      if (s.speed > 3) {
        this.fx.spray.emit(s.pos.x, s.pos.y + 0.4, s.pos.z,
          (Math.random() - 0.5) * 7, 2 + Math.random() * 5, (Math.random() - 0.5) * 7,
          1.5 + Math.random(), 0.6, C.snowLit);
      }
      return;
    }
    if (s.airborne || s.speed < 5) { this._sprayAcc = 0; return; }

    // the trench, lying in the snow behind you
    this.fx.wake.push(s.pos.x, s.pos.z, s.right.x, s.right.y,
      0.52 + s.slip * 0.045, U.clamp(0.35 + s.slip * 0.11, 0, 1.5));

    const rate = (s.slip * 3.0 + s.speed * 0.10) * (this.snow.spray || 1);
    this._sprayAcc = (this._sprayAcc || 0) + rate * dt;
    let n = 0;
    while (this._sprayAcc >= 1 && n < 14) {
      this._sprayAcc -= 1; n++;
      this.skier.edgePoint(this._tmpV);
      const side = s.edge >= 0 ? 1 : -1;
      const back = 3 + Math.random() * 7;
      const out = (2 + Math.random() * 5) * side + s.slip * 0.5 * side;
      const up = 2.5 + Math.random() * 5 + s.slip * 0.55;
      this.fx.spray.emit(
        this._tmpV.x + (Math.random() - 0.5) * 0.7,
        this._tmpV.y + Math.random() * 0.3,
        this._tmpV.z + (Math.random() - 0.5) * 0.7,
        -s.fwd.x * back + s.right.x * out,
        up,
        -s.fwd.y * back + s.right.y * out,
        0.7 + Math.random() * 1.5, 0.45 + Math.random() * 0.55,
        Math.random() < 0.25 ? C.ice : C.snowLit);
    }
    // and a plume on the frame you put it back down
    if (s.landed > 0.15) {
      const k = Math.round(20 + s.landed * 55);
      for (let i = 0; i < k; i++) {
        const a = Math.random() * U.TAU;
        const sp = 3 + Math.random() * 13 * s.landed;
        this.fx.spray.emit(s.pos.x, s.pos.y + 0.25, s.pos.z,
          Math.cos(a) * sp, 2 + Math.random() * 9 * s.landed, Math.sin(a) * sp,
          1.0 + Math.random() * 2.0, 0.55 + Math.random() * 0.7, C.snowLit);
      }
    }
  }

  _updateAudio(dt) {
    const s = this.skier;
    const sp01 = U.clamp(s.speed / s.tune.topSpeed, 0, 1.2);
    if (this.windSnd) this.windSnd.set(U.clamp(sp01 * 0.95 + (s.airborne ? 0.22 : 0), 0, 1));
    if (this.carveSnd) {
      const on = !s.airborne && !s.crashed && this.state !== 'idle';
      this.carveSnd.set(on ? sp01 : 0,
        on ? U.clamp(s.slip / 9, 0, 1) : 0,
        (this.snow && this.snow.spray) || 1);
    }
  }

  _flash(amount, color) {
    const f = this.hud.flash;
    if (!f) return;
    f.style.background = color;
    f.style.opacity = String(U.clamp(amount, 0, 0.6));
    clearTimeout(this._flashT);
    this._flashT = setTimeout(() => { f.style.opacity = '0'; }, 70);
  }

  _setCenter(big, small, cls) {
    const c = this.hud.center;
    if (!c) return;
    if (!big && !small) { c.classList.remove('show'); c.innerHTML = ''; return; }
    c.className = 'center-msg show ' + (cls || '');
    c.innerHTML = `<div class="big">${big}</div>` + (small ? `<div class="small">${small}</div>` : '');
  }

  _updateHud(dt) {
    const h = this.hud, s = this.skier, C = this.C;
    if (!h.money) return;

    h.money.textContent = U.money(Math.round(this.money * this.payout));

    // the ladder: a rung count, a bar towards the next one, and six pips
    h.flow.textContent = '×' + this.flowLevel;
    h.flowBar.style.width = U.clamp(this.flow, 0, 1) * 100 + '%';
    h.flowWrap.classList.toggle('hot', this.flowLevel >= 4);
    h.flowWrap.classList.toggle('max', this.flowLevel >= C.flowLevels);
    if (h.pips) {
      const pips = h.pips.children;
      for (let i = 0; i < pips.length; i++) {
        pips[i].className = i < this.flowLevel ? 'on' : '';
      }
    }

    if (this.mode === 'trial') {
      h.time.textContent = U.clockTime(this._clock());
      h.time.classList.add('trial');
      h.time.classList.remove('urgent');
    } else {
      const tm = Math.max(0, this.time);
      h.time.textContent = tm < 10 ? tm.toFixed(1) : Math.ceil(tm).toString();
      h.time.classList.toggle('urgent', tm < 10);
    }

    h.hoops.textContent = String(this.hoopsHit);
    if (h.vert) h.vert.textContent = Math.round(this.vertical) + 'm';
    const prog = U.clamp(s.pos.z / this.face.total, 0, 1);
    h.progress.style.width = prog * 100 + '%';
    h.progress.classList.toggle('final', this._inFinal);
    if (h.section) {
      const sec = this.face.sectionAt(s.pos.z);
      h.section.textContent = sec ? sec.name : '';
    }

    const kmh = Math.round(s.speed * 3.6);
    h.speed.textContent = kmh;
    h.speedBar.style.width = U.clamp(s.speed / s.tune.topSpeed, 0, 1) * 100 + '%';
    h.speedBar.classList.toggle('tuck', s.tuck > 0.5);

    // the pop meter: only on screen while there is one stored
    if (h.pop) {
      const show = !s.airborne && s.crouch > 0.02;
      h.pop.classList.toggle('show', show);
      if (show) h.popFill.style.width = U.clamp(s.crouch, 0, 1) * 100 + '%';
    }

    /* The air panel. It exists to answer the only question anybody has
       while they are off the ground: how far round am I, and is that a
       whole number yet. The needle going green *is* the landing cue. */
    if (h.air) {
      const flying = s.airborne;
      h.air.classList.toggle('show', flying);
      if (flying) {
        const spin = Math.abs(s.airYaw) / U.TAU;
        const flip = Math.abs(s.airPitch) / U.TAU;
        const roll = Math.abs(s.airRoll) / U.TAU;
        /* Yaw is out of the needle. It is the one axis a landing does
           not care about, and leaving it in meant the light stayed red
           through the middle of a 540 that was going to land perfectly
           well — which is the needle lying about the only thing it is
           for. */
        const off = Math.min(Math.abs(flip - Math.round(flip)), 0.5)
                  + Math.min(Math.abs(roll - Math.round(roll)), 0.5);
        const name = s._auto ? s._auto.name : null;
        const deg = Math.round(spin * 360 / 45) * 45;
        h.airRot.textContent = name
          || ((deg ? deg + '°' : '') + (Math.round(flip) ? ' ·FLIP' : '')) || 'AIR';
        h.airH.textContent = s.airHeight.toFixed(1) + 'm';
        h.air.classList.toggle('true', off < 0.09);
      }
    }

    // the shortcut card
    if (h.chute) {
      const p = this._chutePrompt;
      h.chute.classList.toggle('show', !!p);
      if (p) {
        const mid = p.c.z0 + (p.c.z1 - p.c.z0) * 0.42;
        const side = this.face.chuteX(p.c, mid) - this.face.cxAt(mid);
        h.chuteName.textContent = p.c.name;
        h.chuteGain.textContent = 'saves ' + Math.round(p.c.gain) + 'm';
        h.chuteArrow.textContent = side < 0 ? '◀' : '▶';
        h.chute.classList.toggle('near', p.d < 120);
      }
    }

    // and the wall of snow, if a card dealt one
    if (h.slide && this.avOn) {
      const gap = U.clamp(this.avGap === undefined ? 999 : this.avGap, 0, 400);
      h.slideBar.style.width = (100 - U.clamp(gap / 300, 0, 1) * 100) + '%';
      h.slide.classList.toggle('close', gap < 130);
    }

    if (h.ghost && this.ghost) {
      const d = this.ghostDelta;
      if (d === null || this.state !== 'running') {
        h.ghost.textContent = '—';
        h.ghost.className = 'sk-ghost show';
      } else {
        h.ghost.textContent = (d >= 0 ? '+' : '−') + Math.abs(d).toFixed(2);
        h.ghost.className = 'sk-ghost show ' + (d <= 0 ? 'ahead' : 'behind');
      }
    }

    const sp01 = U.clamp((s.speed - 14) / (s.tune.topSpeed - 14), 0, 1);
    if (h.vignette) h.vignette.style.opacity = String(sp01 * 0.8);
    if (h.lines) {
      h.lines.style.opacity = String(U.clamp((sp01 - 0.42) * 1.5, 0, 1) * 0.55);
      h.lines.classList.toggle('on', sp01 > 0.5);
    }
  }

  /* =================== teardown =================== */

  dispose() {
    clearTimeout(this._reportT);
    clearTimeout(this._flashT);
    clearTimeout(this._chuteT);
    clearTimeout(this._crashT);
    clearTimeout(this._finalT);
    clearTimeout(this._slowmoT);
    clearTimeout(this._stuckMsgT);
    if (this._offEvents) { this._offEvents(); this._offEvents = null; }
    RoomUI.hideAgenda();
    if (this.party) RoomUI.hideField();
    if (this.windSnd) this.windSnd.stop();
    if (this.carveSnd) this.carveSnd.stop();
    if (this.score && this.score.stop) this.score.stop(1.2);
    if (this.fx) this.fx.dispose();
    if (this.snowfall) this.snowfall.dispose();
    if (this.skier) this.skier.dispose();
    for (const [, p] of this.peers) p.skier.dispose();
    if (this.ghostSkier) this.ghostSkier.dispose();
    if (this.trees) { if (this.trees.geo) this.trees.geo.dispose(); if (this.trees.mat) this.trees.mat.dispose(); }
    for (const g of [this.spinnerMesh]) {
      if (!g) continue;
      Engine.disposeObject(g);
      for (const m of g.userData.mats || []) m.dispose();
    }
    if (this.markers) {
      this.markers.geo.dispose();
      for (const m of this.markers.mats) m.dispose();
    }
    for (const key in (this._ringGeos || {})) {
      const G = this._ringGeos[key];
      G.torus.dispose(); G.disc.dispose(); G.glow.dispose();
    }
    for (const arch of [this.startArch, this.finishArch]) {
      if (!arch || !arch.userData) continue;
      for (const g of arch.userData.geos || []) g.dispose();
      for (const m of arch.userData.mats || []) m.dispose();
    }
    if (this.avalanche) {
      for (const g of this.avalanche.geos) g.dispose();
      for (const m of this.avalanche.mats) m.dispose();
    }
    Engine.disposeObject(this.scene);
    Sky.resetPreset();
    this.scene = null;

    Input.setDrivePad(null);

    // these live outside the screens, so nothing else hides them on the
    // way out: leave them lit and the next mission inherits a speed
    // vignette over the top of its own game
    if (this.hud) {
      if (this.hud.vignette) this.hud.vignette.style.opacity = 0;
      if (this.hud.lines) { this.hud.lines.style.opacity = 0; this.hud.lines.classList.remove('on'); }
      if (this.hud.flash) this.hud.flash.style.opacity = 0;
      if (this.hud.ghost) this.hud.ghost.classList.remove('show');
      if (this.hud.air) this.hud.air.classList.remove('show');
      if (this.hud.chute) this.hud.chute.classList.remove('show');
      if (this.hud.pop) this.hud.pop.classList.remove('show');
      if (this.hud.slide) this.hud.slide.classList.remove('show');
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
    this._lastBeep = 4;
    this.time = this.startTime;
    this.deduct = 0;
    this.elapsed = 0;
    this.money = 0;
    this.flow = 0; this.flowLevel = 1; this.peakFlow = 1;
    this.hoopsHit = 0; this.perfects = 0; this.golds = 0;
    this.tricks = 0; this.stomps = 0; this.crashes = 0; this.chutesDone = 0;
    this.hoopMoney = this.trickMoney = this.grazeMoney = 0;
    this.chuteMoney = this.descentMoney = 0;
    this.vertical = 0; this.topSpeed = 0; this.airTotal = 0; this.biggestAir = 0;
    this.stats = SkiMission.freshStats();
    this._grazing = false; this._grazeT = 0; this._slowT = 0; this._straightT = 0;
    this._boostT = 0;
    if (this.spinners) for (const sp of this.spinners) {
      sp.taken = false;
      if (sp.obj) sp.obj.scale.setScalar(1);
    }
    this._atTopT = 0; this._atOneT = 0;
    this._inFinal = false;
    this._stuckT = 0;
    this._seenSection = new Set();
    this._curChute = null;
    this._chutePrompt = null;
    this.avZ = this.C.avStart;
    this.ghostT = 0;
    this.ghostDelta = null;
    this.rec = { x: [], y: [], z: [], yaw: [], s: [] };
    this._recAcc = 0;
    this.hitStop = 0; this.timeScale = 1; this.timeScaleTarget = 1;
    this.shake = 0; this.fovKick = 0; this.camDip = 0; this.camPush = 0;
    for (const c of this.chutes) { c.taken = false; c.entered = false; c.passed = false; }
    for (const g of this.gates) {
      g.state = 'pending';
      for (const r of g.rings) { r.state = 'pending'; r.flash = 0; r.group.scale.setScalar(1); }
    }
    this.skier.place(this.face.cxAt(0), 0, 0, this.world);
    this._prevPos.copy(this.skier.pos);
    this.fx.wake.clear();
    this.fx.labels.clear();
    this._setMusicGear();
    this._setCenter('', '');
  }
}


/* ------------------------------------------------------------------
   SkiAudio — the two sounds no other mission needed.

   The important one is `carve`, and it is the reason the mission sounds
   like skiing rather than like driving. It is two bands of the same
   noise: a low rush that tracks plain speed, and a bright hiss that
   tracks *slip* — so a clean carve at eighty is quiet and a skid at
   forty is enormous, which is exactly the relationship the physics has
   and exactly the one a player has to learn.

   It goes silent off the snow. That silence is doing more work than any
   other sound in the file: air is quiet, so a landing is loud, so a
   landing is an event.
------------------------------------------------------------------ */
const SkiAudio = (() => {

  function carve() {
    const ctx = AudioBus.ctx;
    const dest = AudioBus.bus('sfx');
    if (!AudioBus.ready || !ctx || !dest) return { set() {}, stop() {} };
    const t = ctx.currentTime;

    const gain = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };

    // the base: everything you can hear at all is this, low-passed
    const n1 = AudioBus.noiseSource();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 0.6;
    const g1 = gain(0.0001);
    n1.connect(lp); lp.connect(g1); g1.connect(dest); n1.start(t);

    // the edge: a narrow band that only opens up when the ski is sliding
    const n2 = AudioBus.noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 1.1;
    const g2 = gain(0.0001);
    n2.connect(bp); bp.connect(g2); g2.connect(dest); n2.start(t);

    return {
      /* speed01 = 0..1, slip01 = 0..1, and spray scales how loud this
         snow is. */
      set(speed01, slip01, spray = 1) {
        const tt = ctx.currentTime;
        const sp = U.clamp(speed01, 0, 1), sl = U.clamp(slip01, 0, 1);
        g1.gain.setTargetAtTime(0.0001 + 0.085 * sp * sp * spray, tt, 0.10);
        lp.frequency.setTargetAtTime(380 + sp * 2100, tt, 0.10);
        g2.gain.setTargetAtTime(
          0.0001 + 0.115 * sl * (0.35 + sp * 0.65) * spray, tt, 0.07);
        bp.frequency.setTargetAtTime(1500 + sl * 3400 + sp * 900, tt, 0.08);
        bp.Q.setTargetAtTime(1.1 + sl * 1.6, tt, 0.12);
      },
      stop() {
        const tt = ctx.currentTime;
        g1.gain.setTargetAtTime(0.0001, tt, 0.10);
        g2.gain.setTargetAtTime(0.0001, tt, 0.10);
        setTimeout(() => { try { n1.stop(); n2.stop(); } catch (e) {} }, 500);
      },
    };
  }

  const play = (name, opts) => AudioBus.play(name, opts);
  return { carve, play };
})();

/* The whump. Two layers, because a landing is a thud you feel and a
   burst of snow you hear, and either one alone reads as a bug. */
AudioBus.define('land', (c, dest, o = {}) => {
  const t = c.currentTime;
  const amt = U.clamp(o.amount ?? 1, 0.2, 1.6);
  const os = c.createOscillator(), g = c.createGain();
  os.type = 'sine';
  os.frequency.setValueAtTime(150 * amt, t);
  os.frequency.exponentialRampToValueAtTime(38, t + 0.24);
  os.connect(g); g.connect(dest);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.42 * amt, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
  os.start(t); os.stop(t + 0.4);

  const n = AudioBus.noiseSource();
  if (!n) return;
  const f = c.createBiquadFilter(), ng = c.createGain();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(3200 * amt, t);
  f.frequency.exponentialRampToValueAtTime(300, t + 0.30);
  n.connect(f); f.connect(ng); ng.connect(dest);
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.30 * amt, t + 0.010);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
  n.start(t); n.stop(t + 0.5);
});

/* Going over. A long tumbling scrape rather than a bang: you do not
   hit a mountain, you slide down one badly for a second and a half. */
AudioBus.define('yardsale', (c, dest) => {
  const t = c.currentTime;
  const n = AudioBus.noiseSource();
  if (!n) return;
  const f = c.createBiquadFilter(), g = c.createGain();
  f.type = 'bandpass'; f.Q.value = 0.7;
  f.frequency.setValueAtTime(1800, t);
  f.frequency.exponentialRampToValueAtTime(220, t + 1.1);
  n.connect(f); f.connect(g); g.connect(dest);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.34, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.10, t + 0.55);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.35);
  n.start(t); n.stop(t + 1.5);
  // and the two thumps of a body arriving
  for (const [when, amt] of [[0, 1], [0.16, 0.6]]) {
    const os = c.createOscillator(), og = c.createGain();
    os.type = 'sine';
    os.frequency.setValueAtTime(130, t + when);
    os.frequency.exponentialRampToValueAtTime(40, t + when + 0.22);
    os.connect(og); og.connect(dest);
    og.gain.setValueAtTime(0.0001, t + when);
    og.gain.exponentialRampToValueAtTime(0.36 * amt, t + when + 0.008);
    og.gain.exponentialRampToValueAtTime(0.0001, t + when + 0.30);
    os.start(t + when); os.stop(t + when + 0.36);
  }
});


/* ---- register with the game ---- */
Missions.register({
  id: 'ski',
  name: 'The Descent',
  tagline: 'The hill does the driving. All you do is not give it back.',
  description:
    'One face of a highland mountain, drawn fresh from whatever seed you pick: a cornice '
    + 'to drop off, five stretches of mountain in an order you have not seen before, and a '
    + 'flat runout at the bottom where the run is actually decided. There is no throttle. '
    + 'Gravity is the engine and every decision you make is about how much of what it gave '
    + 'you you are prepared to hand back — a clean carve keeps nearly all of it, a skid '
    + 'gives it away, and a tree takes the lot. '
    + 'One meter runs the whole thing. Carve well, get air, thread a hoop or ski close '
    + 'enough to the wood to hear it and the meter climbs a rung; crawl, skid or fall over '
    + 'and it drops. Whatever rung you are on multiplies every pound the mountain pays, so '
    + 'the entire mission is one sentence: go down fast and never stop doing things. '
    + '<kbd>Space</kbd> is the whole game. Hold it to crouch, let go to pop — and let go '
    + 'exactly as the lip leaves your feet and you will go somewhere. '
    + 'You do not have to touch it to look good, though. Leave a lip with real air under '
    + 'you and the skier throws a trick on its own — a grab, a cork, a flat spin, a triple '
    + '— made up on the spot from three axes rather than picked off a list, so there is '
    + 'nothing to unlock and nothing to run out of. Press <kbd>Space</kbd> again in the '
    + 'air and it adds another turn to whatever is already going round, for as long as '
    + 'there is room to land it. '
    + 'The mountain is built for it. Blue and amber bars on the snow are boost pads and '
    + 'there are hundreds: drive down the middle of one and it pushes you the whole way '
    + 'along it. Spinners turn in the air over the fall line: get to one, through the middle, '
    + 'and it pays, shoves you and hands you a fresh trick on the way past. '
    + 'The mountain is littered with kickers, hips, rollers and cliffs, and it is cut '
    + 'through by shortcuts: straight lines down the fall line where the groomed run '
    + 'traverses, marked from a long way up, worth real seconds and full of gold hoops. '
    + 'They also go through the trees.',
  icon: '04',
  maxPrize: 88000,
  players: '1-3',
  duration: '~2 min',
  order: 3,
  setup: true,
  hudScreen: 'hud-ski',
  setupLabels: { course: 'Mountain', modifier: 'Conditions' },
  todOptions: SkiMission.TOD,
  preview: (opts) => SkiMission.preview(opts),
  modes: SkiMission.MODES,
  medals: SkiMission.MEDALS,
  create: (opts) => new SkiMission(opts),
  better: (a, b) => (a.earned || 0) > (b.earned || 0),

  tips: [
    '<b>There is no throttle.</b> <kbd>W</kbd> is a tuck — less drag, more speed, and '
      + 'almost no steering. <kbd>S</kbd> is a check: it turns hard and scrubs hard. Most '
      + 'of a good run is spent in neither.',
    '<b>Carve, do not skid.</b> Turning costs you speed in proportion to how much the ski '
      + 'is sliding sideways, not to how far round you turned. A long clean arc is nearly '
      + 'free. A panic turn is not.',
    '<b>Hold <kbd>Space</kbd>, then let go at the lip.</b> Holding it crouches and stores '
      + 'a pop; releasing spends it, right then, off whatever you are stood on. Time the '
      + 'release to the last metre of a kicker and you will double the jump.',
    '<b>Every jump throws a trick.</b> Off any real lip the skier makes one up and lands it '
      + 'for you. Nothing is locked and nothing is a list — a double cork can come up off '
      + 'your first kicker, and the lip finds the height to fit it in.',
    '<b>Space again in the air adds a turn.</b> Each press puts another rotation on '
      + 'whatever is already going round, as long as there is still air to land it in. '
      + 'Lean on it off a cliff and see what comes out.',
    '<b>Aim at the blue.</b> The barred stripes on the snow are boost pads. They accelerate '
      + 'you the whole way along and turn what is left into height off the lip, so the '
      + 'middle of one is worth a lot more than the corner. The amber ones are the big '
      + 'ones, and the meanest are down the shortcuts.',
    '<b>Spinners are never a miss.</b> The turning rings are above the snow, so getting '
      + 'through one means arriving already in the air, off something, on purpose. Through '
      + 'the middle pays most, and it hands you a fresh trick on the way out.',
    '<b>The meter is the money.</b> Six rungs, and whatever rung you are on multiplies '
      + 'everything: hoops, tricks, trees and every metre of the descent. Going slowly is '
      + 'the only thing that empties it faster than falling over.',
    '<b>Take the shortcuts.</b> When the run traverses, the line straight down the fall '
      + 'line is shorter — that is what the lit gate is telling you. Every hoop inside one '
      + 'is gold, and getting out of the bottom of one pays again.',
    '<b>The trees pay.</b> Skiing inside the wood earns while you hold it. So does hitting '
      + 'one, in the other direction.',
    '<b>Arrive with speed.</b> The runout at the bottom is nearly flat and pays double. '
      + 'Whatever you are carrying when you reach it is all you are getting.',
  ],
  keys: ['<kbd>A</kbd><kbd>D</kbd> carve', '<kbd>W</kbd> tuck · <kbd>S</kbd> check',
         '<kbd>Space</kbd> pop · again in the air for another turn'],

  /* What this client tells the other two about its own run. Every card
     in the ski deck moves one of these columns and every card's alibi
     moves a second one the other way — a bottom-of-the-board meter next
     to the most vertical on the mountain is a bad day, and the same
     meter next to the least is a decision. The columns do not accuse
     anybody. They make both readings available. */
  report: (r) => {
    const st = r.stats || {};
    return {
      earned: r.earned,
      completed: r.completed,
      place: r.place || null,
      columns: ['Place', 'Hoops', 'Cuts', 'Best meter', 'Air', 'Down'],
      cells: [
        r.place ? 'P' + r.place : '—',
        String(r.hoops || 0),
        (r.chutes || 0) + '/' + (r.totalChutes || 0),
        '×' + (st.peakFlow || 1),
        (st.airTime || 0).toFixed(1) + 's',
        r.completed ? 'yes' : 'no',
      ],
      stats: st,
    };
  },

  resultRows: (r) => {
    const trial = r.mode === 'trial';
    const rows = [
      ['Vertical', `${r.vertical}m of ${r.verticalTotal}m`],
      ['Hoops threaded', String(r.hoops)],
    ];
    if (r.golds) rows.push(['Gold hoops', String(r.golds)]);
    if (r.perfects) rows.push(['Through the middle', String(r.perfects)]);
    if (r.totalChutes) {
      rows.push(['Shortcuts taken', `${r.chutes}/${r.totalChutes}`
        + (r.chuteMetres ? ` · ${r.chuteMetres}m cut` : '')]);
    }
    if (r.tricks) rows.push(['Tricks landed', String(r.tricks)
      + (r.stomps ? ` (${r.stomps} stomped)` : '')]);
    if (r.biggestAir) rows.push(['Biggest air', r.biggestAir.toFixed(1) + 'm'
      + ` · ${(r.airTime || 0).toFixed(1)}s off the snow`]);
    if (r.spinners) rows.push(['Spinners', String(r.spinners)]);
    rows.push(['Top speed', Math.round(r.topSpeed * 3.6) + ' km/h']);
    rows.push(['Best meter', '×' + r.peakFlow]);
    if (r.crashes) rows.push(['Times down', String(r.crashes)]);
    if (trial) rows.push(['Final time', U.clockTime(r.finalTime || 0)],
                         ['Par for this mountain', U.clockTime(r.par || 0)]);
    rows.push(null);
    if (r.descentMoney) rows.push(['The descent', U.money(Math.round(r.descentMoney))]);
    if (r.hoopMoney) rows.push(['Hoops', U.money(Math.round(r.hoopMoney))]);
    if (r.trickMoney) rows.push(['Air', U.money(Math.round(r.trickMoney))]);
    if (r.chuteMoney) rows.push(['Shortcuts', U.money(Math.round(r.chuteMoney))]);
    if (r.grazeMoney) rows.push(['In the trees', U.money(Math.round(r.grazeMoney))]);
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

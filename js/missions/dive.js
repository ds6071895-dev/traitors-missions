/* ------------------------------------------------------------------
   dive.js — Mission 03: The Dive.

   Two verbs, three minutes, and one decision you make every two
   seconds: *one more?*

   You salvage off a wreck in a sunlit sea loch. Everything you surface
   with is money. Everything you black out holding falls where you are
   and lies there, lit, for anyone — including the other two — to pick
   up. That single rule is the whole mission:

   - **Drowning looks exactly like ambition.** Every way a Traitor can
     lose money here is also what the best diver at the table does.
     Coming up empty is what greed looks like from the outside.
   - **A Traitor's loss is somebody else's gain.** The money does not
     vanish, it moves. "The pot is short" stops being evidence.
   - **The run is short and restarts instantly**, so the loop repeats
     sixty times a night rather than twice.

   And under that, the thing that makes it worth playing for a
   hundredth time: **you swim on the beat.** A stroke landed inside the
   window is faster, cheaper in air and worth more money, and three of
   them in a row light a chain that turns the whole reef into a
   different, faster place. Off the beat still works perfectly well. It
   is a ceiling, not a gate.
------------------------------------------------------------------ */
class DiveMission {

  static CONFIG = {
    seed: 20260901,           // only a fallback; a run brings its own
    runTime: 180,             // three minutes
    reefRadius: 190,          // compact enough that a trip is 6-20s

    /* The three tiers. `top`/`bottom` are the seabed depths a chest of
       that tier is placed between, and they line up with the terraces
       ReefKit cuts, so "which tier am I working" and "where am I" are
       the same question. */
    tiers: [
      { id: 'shelf',  top:   0, bottom: -16, chests: 14, value:  380,
        colour: '#ffd166', name: 'Shelf', respawn: 8 },
      { id: 'wreck',  top: -16, bottom: -34, chests:  9, value: 1450,
        colour: '#ff9f4a', name: 'Wreck', respawn: 13 },
      /* The trench pays eleven times the shelf and comes back a third
         as often. Both halves of that matter: the value is what makes
         it worth drowning for, and the respawn is what stops it being
         the answer to every question — a diver who works nothing but
         the deep runs out of deep. */
      { id: 'trench', top: -34, bottom: -60, chests:  5, value: 3800,
        colour: '#39e6ff', name: 'Trench', respawn: 26 },
    ],

    /* ---- the caves ----
       The trench pays eleven times the shelf because it is deep. The
       caves pay three times the trench because they are deep *and*
       they have a lid on them, and a lid is a different kind of
       expensive: in open water your own body is a way home, and under
       a roof it is not. Everything else about a cave chest is a
       trench chest — the same grab, the same drag in your hands — so
       the only thing you are buying with the money is the swim back
       out of the door you came in by, on the air you have left.

       Five of them in the whole loch and half a minute to come back,
       so a cave is somewhere you go once or twice in a run rather
       than a better tier to live in. */
    cave: {
      chests: 5, value: 11500, colour: '#c77dff', respawn: 30, name: 'Cave',
    },
    /* ---- the holds ----

       The one thing in the loch you cannot simply pick up.

       Every wreck on the slope has a strongroom hatch bolted to her
       plating, and behind it is more money than anything else in the
       mission pays in one go. It does not open because you swam to it.
       It opens because you put a boot through it — four of them, on
       the verb you already have, while the bar goes down and while
       every animal that can hear steel being kicked comes to see what
       is making that noise.

       That is the whole design, and it is the mission's argument told
       backwards. Everywhere else the risk is silent and private: you
       drown yourself, quietly, at a rate you chose. A hold is *loud*.
       You cannot break one open discreetly, you cannot break one open
       quickly, and on a beach with two other people on it you cannot
       break one open without everybody knowing exactly where you are
       and what you are about to be holding.

       Three or four to a loch and they never come back inside a run,
       so a hold is a plan rather than a tier — and a hold somebody
       else already emptied is the most eloquent thing on the seabed.

       `value` is per chest and it is scaled by how deep the hull lies,
       because the shallow trawler would otherwise be strictly better
       than the deep ones and nobody would ever swim past her. */
    holds: {
      hits:      4,          // boots through the hatch
      air:       0.055,      // ...and what each one costs
      din:       2.0,        // how far the noise carries, as a noise multiplier
      wake:      95,         // ...and the radius of animals it turns round
      chests:    3,          // what comes out
      /* Priced against the two things you could have done with the same
         twenty-five seconds. A four-chest trench carry is about fifteen
         thousand and a two-chest cave trip is about twenty-three, and a
         hold sits between them: better money than the trench for the
         same swim, worse money than a roof, and the only one of the
         three that arrives all at once in front of an audience. */
      value:     4200,       // each, before the depth scaling
      deepGain:  0.018,      // ...which is this much again per metre down
      colour:   '#ff5d8f',
      name:     'Hold',
      range:     4.0,        // how close a boot has to land
      cool:      0.30,       // seconds between blows, so it cannot be spammed
    },

    /* ---- the sharks ----
       Seven, and the first ones live on the dens — the cave mouths and
       the hatches, which are the two places in the loch where somebody
       is about to do something stupid. See predators.js for why they
       cannot kill you and why the answer to one is to swim at it. */
    sharks:      8,
    biteAir:     0.16,     // fraction of the bar a strike costs you
    biteAirEmpty:0.07,     // ...and what it costs when your hands are empty

    carryMax:    4,        // chests in hand before you must surface
    grabRange:   3.0,      // metres; grabbing is automatic inside this
    flowMoney:   0.55,     // extra fraction of value at full chain
    sweepSpeed:  7.0,      // m/s through a chest that counts as not stopping for it
    sweepMoney:  1.20,     // ...and what taking one that way is worth
    /* Surfacing is not banking. Everything you come up with has to be
       carried back to the shingle and put on the pile, and until it is
       on the pile it is not money — it is four chests in the hands of
       somebody the other two can watch swimming home. That is the
       whole reason the shore exists: it puts a *journey* between
       having it and keeping it, in front of an audience. */
    /* And "ashore" is now a *place*, not a radius round the waterline.
       There is a lit ring on the shingle with the pile in the middle of
       it, you have to be stood in it on your own two feet, and it is
       the brightest thing in the loch from every depth. Wading in with
       your head out no longer pays: the last few metres are a walk up
       a beach carrying four boxes, in front of everybody, and that walk
       is the best fifteen seconds in the mission. */
    dropRange:   6.6,      // metres of lit shingle that count as the drop
    bankTime:    0.15,     // seconds stood in it before it counts
    /* The haul. Land a trip without blacking out and the next one is
       worth a little more, up to a fifth again after five — which is
       what turns sixty separate trips into one run with a shape. It is
       reset by a blackout and by nothing else, so the question the
       mission asks ("one more?") gets sharper the better the night is
       going. */
    haulStep:    0.045,
    haulMax:     5,
    respawn:     11,       // fallback, if a tier does not name its own
    blackoutHold: 3.0,     // the forced float after you black out
    moneyScale:  1,
    baseFov:     58,
    ghostRate:   0.1,
    /* What a good three minutes looks like, measured against a scripted
       diver rather than guessed: working the shelf all run is about a
       third of this, the wreck is a comfortable gold, and only somebody
       living in the trench on the beat gets past 1.6x it.

       It came down from thirty thousand when the shore went in. A trip
       is no longer over the moment your head is out of the water — it
       is over when you are stood on the shingle — and that is fifteen
       to forty seconds of swimming a run that used to be free. */
    par:         24000,
  };

  static MODES = {
    salvage: {
      id: 'salvage', name: 'Salvage',
      blurb: 'Three minutes. Everything you surface with is money.',
      better: (a, b) => (a.earned || 0) > (b ? (b.earned || 0) : -1),
    },
    deep: {
      id: 'deep', name: 'The Deep',
      blurb: 'No clock. The trench refills, the air comes back slower every '
           + 'trip, and it ends when you black out.',
      better: (a, b) => (a.earned || 0) > (b ? (b.earned || 0) : -1),
    },
  };

  static MEDALS = [
    null,
    { id: 1, name: 'Bronze', color: '#c98c52' },
    { id: 2, name: 'Silver', color: '#c9d4de' },
    { id: 3, name: 'Gold', color: '#ffd166' },
    { id: 4, name: 'Author', color: '#39e6ff' },
  ];

  /* =================== a run's setup =================== */

  static normalise(opts = {}) {
    const seed = Number.isFinite(opts.seed)
      ? (Math.floor(opts.seed) >>> 0) || DiveMission.CONFIG.seed
      : U.dailySeed();
    return {
      seed,
      mode: opts.mode === 'deep' ? 'deep' : 'salvage',
      modId: opts.modId || null,
      ghost: opts.ghost !== false,
      daily: seed === U.dailySeed(),
      quality: typeof DivePresentation !== 'undefined'
        ? DivePresentation.resolve(opts.quality) : 'medium',
    };
  }

  static hand(seed) {
    return DiveTwists.draw(U.makeRng((seed ^ 0x2545f491) >>> 0), 3);
  }

  static configFor(twist) {
    const C = Object.assign({}, DiveMission.CONFIG);
    if (twist && twist.config) Object.assign(C, twist.config);
    return C;
  }

  static conditionsFor(seed, twist) {
    return Object.assign(DiveConditions.forSeed(seed), (twist && twist.cond) || {});
  }

  // everything the briefing needs, without building a reef first
  static preview(opts) {
    const o = DiveMission.normalise(opts);
    const twist = DiveTwists.byId(o.modId);
    const cond = DiveMission.conditionsFor(o.seed, twist);
    const key = GameState.runKey(o.mode, o.seed, o.modId);
    const rec = GameState.runRecord('dive', key);
    return {
      opts,
      mod: twist,
      cond,
      name: U.courseName(o.seed),
      conditionText: DiveConditions.describe(cond),
      hand: DiveMission.hand(o.seed),
      mode: DiveMission.MODES[o.mode],
      payout: DiveConditions.payout(cond) * (twist ? twist.payout : 1),
      key,
      record: rec,
      bestText: rec.best ? U.money(rec.best.earned || 0) : null,
      hasGhost: !!GameState.getGhost('dive', key),
      tiers: (() => {
        const C = DiveMission.configFor(twist);
        const rows = C.tiers.map(t => t.name + ' ' + U.money(t.value));
        // the caves go on the briefing beside the tiers, because a
        // number that big has to be visible before the run and not
        // discovered forty metres down
        if (C.cave && C.cave.chests) rows.push(C.cave.name + ' ' + U.money(C.cave.value));
        // ...and so does the hold, for the same reason and more so: it
        // is the only price on this card you cannot pay by swimming
        if (C.holds && C.holds.chests) {
          rows.push(C.holds.name + ' ' + U.money(C.holds.value) + ' ×' + C.holds.chests);
        }
        return rows;
      })(),
    };
  }

  /* Every card in the dive deck reads this and nothing else, so it is
     the contract between the mission and the deck. Gathered on every
     run, Traitor or not — a counter that only exists when somebody has
     a task is a counter that announces there is one.

     Half of these are tells and half are alibis, and every card needs
     one of each: an empty trip is a confession beside a shallow
     deepest and the best swimming of the night beside a deep one. */
  static freshStats() {
    return {
      banked: 0, lost: 0, recovered: 0,
      deepest: 0, trips: 0, emptyTrips: 0, blackouts: 0,
      /* How many trips actually made it onto the pile, and the longest
         run of them without blacking out. Both are tells and both are
         alibis: a night of five landings and no blackouts is the best
         diving at the table, and a night of one landing and four
         blackouts is either the worst or a Traitor, and nothing on the
         card can tell you which. */
      landings: 0, bestHaul: 0,
      peakCarry: 0, peakCarryValue: 0,
      tierBanked: { shelf: 0, wreck: 0, trench: 0, cave: 0, hold: 0 },
      trenchTrips: 0, trenchEmpty: 0,
      /* The caves, and the animals. Both halves of the same card: a
         night with cave money on it is a night somebody took the roof
         seriously, and a night with four bites and nothing to show is
         either the worst diving at the table or a very good excuse. */
      caveTrips: 0, caveChests: 0, deepestCave: 0,
      /* And the holds, which are the loudest thing anybody does down
         there. A night with a hold on it is a night somebody stood
         still on the bottom for four kicks with the whole loch coming
         to look — you cannot do it quietly and you cannot do it by
         accident, so it is the one line on the card that is never an
         alibi. */
      holdHits: 0, holdsOpened: 0, hoardChests: 0, deepestHold: 0,
      bites: 0, fended: 0, biteLost: 0,
      strokes: 0, onBeat: 0, bestFlowRun: 0,
      lastMinuteBanked: 0, finalCarry: 0, finalCarryValue: 0,
      passedDrops: 0,
      surfaceTime: 0, submergedTime: 0,
      maxOtherDeepest: 0, maxOtherBanked: 0, maxOtherPeakCarry: 0,
      otherTrips: 0, finished: false, topOfField: false,
      /* The tide. How much of the night was spent riding a race home,
         how many breaths were taken under a roof, how many chests were
         taken at speed without stopping, and what the flood paid. */
      raceTime: 0, pocketBreaths: 0, sweeps: 0, floodBanked: 0,
    };
  }

  constructor(opts = {}) {
    this.opts = DiveMission.normalise(opts);
    this.seed = this.opts.seed;
    this.mode = this.opts.mode;
    this.modeDef = DiveMission.MODES[this.mode];
    this.twist = DiveTwists.byId(this.opts.modId);
    this.flags = Object.assign({}, this.twist && this.twist.flags);
    this.C = DiveMission.configFor(this.twist);
    this.cond = DiveMission.conditionsFor(this.seed, this.twist);
    this.payout = DiveConditions.payout(this.cond) * (this.twist ? this.twist.payout : 1);
    this.reefName = U.courseName(this.seed);
    this.key = GameState.runKey(this.mode, this.seed, this.opts.modId);
    this.rng = U.makeRng(this.seed);

    /* ---- three divers, one reef ----
       The reef is a pure function of the seed, so none of it goes on
       the wire. The *chests* cannot be: two people reaching for the
       same one is the only contested call in the mission, so the host
       owns which chests exist and who has them, and everything else —
       where each diver is, their air, their chain — is client-owned
       and broadcast fifteen times a second. Being able to watch
       somebody circle the trench with four chests in their hands is
       the whole point of the field strip. */
    this.party = !!opts.party;
    this.isHost = !!opts.host;
    this.roster = (opts.players || []).filter(p => !p.local);
    const me = (opts.players || []).find(p => p.local) || {};
    this.meId = me.id || 'you';
    this.myLook = me.look || (typeof GameState !== 'undefined' && GameState.data
                              ? GameState.data.look : null) || null;
    this.agenda = opts.agenda || null;
    this.peers = new Map();
    this.scores = new Map();
    this._claims = new Map();
    this._netAcc = 0;
    this._fieldT = 0;

    this.state = 'idle';    // idle | waiting | countdown | live | finished
    this._resetRun();

    this._tmpV = new THREE.Vector3();
    this._tmpV2 = new THREE.Vector3();
    /* A ring lying flat on the sea rather than facing the lens. The
       splash reads as a disturbance *of the water* from any angle, and
       from the beach that is the only way it reads at all. */
    if (!DiveMission._FLAT) {
      DiveMission._FLAT = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(-Math.PI / 2, 0, 0));
    }
    this._camPos = new THREE.Vector3();
    this._camLook = new THREE.Vector3();
    this._band = { colour: new THREE.Color(), near: 0, far: 0, caustic: 0, vignette: 0 };
    this._ctl = { move: { x: 0, y: 0 }, yaw: 0, pitch: 0, stroke: false, beat: null };
    this._beat = { spb: 0.625, sinceBeat: 0 };
  }

  _resetRun() {
    this.money = 0;
    /* What the purse *says*, which chases what it holds rather than
       being it. Four chests landing one after another put four rising
       numbers on the screen, and a counter that jumped to the total on
       the first of them threw away three of them. */
    this._moneyShown = 0;
    this.carry = [];              // the chests in your hands, in grab order
    this.elapsed = 0;
    this.timeLeft = this.C.runTime;
    this.countdown = 3.999;
    this._lastBeep = 4;
    this.bankT = 0;
    this.out = false;             // blacked out: no control until you are up
    this.holdT = 0;               // ...and then a forced float, in seconds
    this.deepest = 0;
    this.tripDeepest = 0;
    this.tripTook = 0;
    this.inTrip = false;
    this.flowRun = 0;
    this.bestFlowRun = 0;
    this.chainLit = false;
    this.shake = 0;
    this.camKick = 0;
    this.camGasp = 0;
    this.fovKick = 0;
    this.hitStop = 0;
    this.reported = false;
    this.result = null;
    this.rec = { t: [], m: [] };
    this._recAcc = 0;
    this.ghostDelta = null;
    this._localBeatT = 0;
    this.bankLog = [];            // (when, how much), for the rolling last minute
    this._shownCap = null;
    this._nextChestId = 1;
    this._tierT = (this.C || DiveMission.CONFIG).tiers.map(() => 0);
    this._bubbleAcc = 0;
    this._gear = -1;
    this._muffle = 0;
    this._toldShore = false;
    /* The haul, the chests in the air on their way to the pile, and
       the two little clocks that make the beach and the surface feel
       like events rather than states. */
    this.haul = 0;
    this.bestHaul = 0;
    this._flying = [];
    this._tripTiers = 0;       // which tiers this trip has already visited
    this._wet = 0;             // seconds of water still on the lens
    this._dropHot = 0;         // how loudly the drop zone is calling you
    this._shownWet = -1;
    /* The caves and the animals. All of it is per-run state: a restart
       must put you back outside, unwatched, with nothing chasing you. */
    this._caveT = 0;
    this._caveT2 = 0;
    this._inCave = null;
    this._caveSaid = 0;
    /* The holds. `_din` is how much noise the hatch you are kicking is
       still making, which is the only thing in the mission that raises
       your profile without you swimming anywhere. */
    this._din = 0;
    this._priseCool = 0;
    this._toldHold = false;
    this._toldDin = false;
    this._washOut = false;
    this._threat = 0;
    this._fend = false;
    this._sharkList = null;
    this._paletteAt = undefined;
    this._skyOn = undefined;
    this._camRoll = 0;
    /* The tide. Per run, because a restart is still water again. */
    this.stage = DiveTide.STAGES[0];
    this._stageSaid = null;
    this._inPocket = false;
    this._raceK = 0;           // how much of a race you are in, damped, for the HUD
    this._toldRace = false;
    this._streamT = 0;         // how long the kick has been held down
    this.stats = DiveMission.freshStats();
    if (this.music) { this.music.stop(0.4); this.music = null; }
  }

  /* =================== build =================== */

  build() {
    const C = this.C;
    const scene = new THREE.Scene();
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(C.baseFov, 1, 0.1, 20000);
    this.camera = camera;
    scene.add(camera);

    /* Order matters, and it is the order the boat race already had to
       learn: the water is a global singleton whose `build()` resets
       both palette and sea state, so the dive's colours can only go on
       *after* it — and `DiveConditions.apply` has to run before
       `Sky.build` would, if we were building one. */
    scene.fog = new THREE.Fog(ReefKit.BANDS[0].fog, ReefKit.BANDS[0].near,
                              ReefKit.BANDS[0].far);
    Water.build(scene);
    this.applied = DiveConditions.apply(this.cond);
    scene.add(DiveConditions.lights(this.cond));
    this.graphics = DivePresentation.presets[this.opts.quality];
    this._rig = DivePresentation.lights(scene, this.graphics);

    /* There is a sky now, and there has to be. The mission used to be
       built on the assumption that the camera never left the water, so
       the ceiling *was* the horizon and a sky would only ever have been
       a bright hole above a blue rectangle. The moment your head can
       come out — and it must, because that is where the shore is —
       the absence of one is the single most obvious thing on screen.

       `Sky.build` also brings the far ridge and two rings of peaks with
       it, which is most of the highland backdrop for four draw calls,
       and it has to run after `DiveConditions.apply` has set the hour. */
    Sky.build(scene, U.makeRng(this.seed + 11), { birds: true });

    this.vis = DiveConditions.visibility(this.cond);
    Water.setFog(ReefKit.BANDS[0].near, ReefKit.BANDS[0].far * this.vis,
                 ReefKit.BANDS[0].fog);

    this.reef = ReefKit.build(scene, U.makeRng(this.seed + 3), {
      radius: C.reefRadius,
      kelp: this.flags.shoal ? 520 : 620,
      shafts: 9,
      floorRings: this.graphics.rings,
      floorSectors: this.graphics.sectors,
    });
    /* Shadow: the solid things cast, and the ground and the solid things
       catch it. Nothing that sways casts — the shadow pass would draw
       the kelp where it was, not where the current has put it. */
    if (this.graphics.shadow) {
      this.reef.group.traverse(o => {
        if (!o.isMesh) return;
        if (['seabed', 'rocks', 'wreck', 'caves'].includes(o.name)) o.receiveShadow = true;
        if (['rocks', 'wreck', 'caves'].includes(o.name)) o.castShadow = true;
      });
    }
    this._fogCap = ReefKit.maxFogFar(C.reefRadius);
    /* Where the land is, and the two points on it the whole mission
       hangs off: the shingle you jump from, and the tideline in front
       of it that counts as ashore. */
    this.shore = this.reef.shore;
    const cur = DiveConditions.currentVector(this.cond);
    this.reef.setCurrent(cur.x, cur.z, cur.strength);

    this.shoal = ReefKit.buildShoal(scene, U.makeRng(this.seed + 21), {
      count: this.flags.shoal ? 520 : 320,
      radius: C.reefRadius * 0.8,
      heightAt: this.reef.heightAt,
      home: this.reef.wreck.at,
    });

    /* ---- and the thing the fish are afraid of.
       Built after the reef because it needs the caves — the first
       sharks den at their mouths — and after the shoal because the
       shoal is handed the animals as threats every frame, which is
       what makes an empty patch of water in front of you mean
       something. */
    /* The dens: every doorway and every hatch in the loch, interleaved
       so neither kind ends up unguarded when there are more dens than
       animals. A hold with nothing living on it is a free four kicks,
       and a free four kicks is not a decision. One shark is always left
       over to work the open slope, because a reef where the only danger
       is standing on the two things you might want is a reef you can
       read off a map. */
    const holdDens = (this.reef.wrecks || []).filter(w => w.hold).map(w => ({
      x: w.hold.x, z: w.hold.z, R: 13,
      mouth: { x: w.hold.x + w.hold.nx * 5.5, z: w.hold.z + w.hold.nz * 5.5,
               y: w.hold.y + 1.5 },
    }));
    const caveDens = this.reef.caves.list;
    const dens = [];
    for (let i = 0; i < Math.max(holdDens.length, caveDens.length); i++) {
      if (i < holdDens.length) dens.push(holdDens[i]);
      if (i < caveDens.length) dens.push(caveDens[i]);
    }

    this.sharks = PredatorKit.build(scene, U.makeRng(this.seed + 37), {
      count: this.flags.noSharks ? 0 : C.sharks,
      radius: C.reefRadius,
      heightAt: this.reef.heightAt,
      ceilingAt: (x, z) => this.reef.caves.ceilingAt(x, z),
      dens: dens.slice(0, Math.max(0, C.sharks - 1)),
      onEvent: (kind, sh) => this._onShark(kind, sh),
    });
    this._threat = 0;         // the HUD's copy of how much trouble you are in
    this._threatSaid = 0;

    // ---- the diver
    this.swimmer = new Swimmer({
      tune: Object.assign({}, (this.twist && this.twist.tune) || {}),
      look: this.myLook,
      palette: 'diver',
      paint: { suit: '#123044', fin: '#f2c14e' },
    });
    scene.add(this.swimmer.group);
    if (this.graphics.shadow) this.swimmer.group.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this._placeAshore();

    /* ---- the tide: three races off the seed, and the stage off the
       clock. See `js/dive/tide.js` for why the way home is the mission. */
    this.tide = DiveTide.build(this.seed, C.reefRadius, this.shore.ang);
    this.feedback = DiveFeedback.build(scene, this.tide, this.reef, this.graphics);
    this.world = {
      heightAt: this.reef.heightAt,
      /* The sea — or, under a roof while the ebb holds, the air trapped
         against the rock. The swimmer cannot tell them apart, which is
         the point: it floats, gasps and breathes in a pocket exactly as
         it does under the sky. */
      surfaceAt: (x, z) => {
        const p = DiveTide.pocketAt(this.caves, this.stage, x, z);
        return p === null ? Water.sampleHeight(x, z) : p;
      },
      currentAt: (pos, out) => DiveTide.currentAt(this.tide, this.stage,
                                                  pos.x, pos.y, pos.z, 0, out),
      chop: this.stage.chop,
      colliders: this.reef.colliders,
      radius: C.reefRadius,
      /* The one line that makes a cave a cave. Everything else about
         them is scenery and money; this is the rule. */
      ceilingAt: (x, z) => this.reef.caves.ceilingAt(x, z),
    };
    this.caves = this.reef.caves;
    this._caveT = 0;          // how far inside one you are, 0..1, damped
    this._inCave = null;      // ...and which

    // ---- the money
    this._buildChestKit();
    // ...and where four of it rides on the way home
    this._pack = this._carryPack(this.swimmer);
    this.chests = [];
    for (let t = 0; t < C.tiers.length; t++) {
      for (let i = 0; i < C.tiers[t].chests; i++) this._spawnChest(t);
    }
    // ...and the caves, which are stocked out of the trench's tier so
    // every band, tape and music gear downstream keeps working
    for (let i = 0; i < C.cave.chests; i++) {
      this._spawnChest(C.tiers.length - 1, null, { cave: true });
    }
    this._caveT2 = 0;         // the caves' own respawn clock

    // ...and the things you have to break rather than pick up, plus the
    // lights over the doors. Both want the chest kit's glow texture, so
    // both come after it.
    this._buildHolds();
    this._buildCaveMarks();

    this._buildPeers(scene);

    this.fx = {
      bubbles: new ParticleField(scene, 700, { drag: 1.5, gravity: -3.2 }),
      /* Both pools grew when the landing did. Four chests arriving one
         after another is five rings and a hundred and sixteen sparks
         inside half a second, on top of whatever the splash that got
         them there is still spending — at the old sizes the flourish
         quietly ate the spray that preceded it. */
      sparks: new ParticleField(scene, 680, { drag: 1.2, gravity: -1.2, additive: true }),
      rings: new RingBurst(scene, 22),
      labels: new FloatingLabels(document.getElementById('world-labels'), camera),
      update(dt) {
        this.bubbles.update(dt); this.sparks.update(dt);
        this.rings.update(dt); this.labels.update(dt);
      },
      dispose() {
        this.bubbles.dispose(); this.sparks.dispose();
        this.rings.dispose(); this.labels.dispose();
      },
    };

    /* The mooring buoy: the one thing on the open surface, and the
       thing that tells you which way home is when you are forty metres
       down. It used to sit on the origin because the origin was home;
       home is the beach now, so it is moored on the way in — line up
       the buoy and the pile and you are swimming the right way. */
    this.buoy = DiveMission._buildBuoy();
    this.buoyAt = {
      x: this.shore.tide.x - this.shore.nx * 34,
      z: this.shore.tide.z - this.shore.nz * 34,
    };
    this.buoy.position.set(this.buoyAt.x, 0, this.buoyAt.z);
    scene.add(this.buoy);

    // and the pile, which is what all of this is for — stood in the
    // ring of light that is the only place it can be put down
    this._buildPile();
    this._buildDrop();

    if (this.opts.ghost) {
      const g = GameState.getGhost('dive', this.key);
      this.ghost = g && g.m && g.m.length > 1 ? g : null;
    } else this.ghost = null;

    this._cacheHud();

    /* Framed on the diver rather than on the origin, which used to be
       the same thing and no longer is: the diver is stood on the
       shingle now, and a camera that begins eight metres off the middle
       of the loch spends the whole countdown flying to catch up. */
    const sw0 = this.swimmer;
    this._camPos.set(sw0.pos.x + this.shore.nx * 7.5,
                     sw0.pos.y + 2.6,
                     sw0.pos.z + this.shore.nz * 7.5);
    this._camLook.copy(sw0.pos).addScaledVector(
      new THREE.Vector3(-this.shore.nx, 0, -this.shore.nz), 12);
    this.surfaceMix = 1;
    camera.position.copy(this._camPos);



    return { scene, camera };
  }

  /* -------- chests --------
     One geometry, three materials, and a pool of meshes big enough for
     every chest plus every pile anybody drops. Chests are the only
     thing in the mission you look for, so they get a glow sprite each:
     a chest you cannot see from ten metres away in blue water is a
     chest that does not exist. */
  _buildChestKit() {
    const parts = [];
    const box = new THREE.BoxGeometry(0.9, 0.52, 0.62);
    box.translate(0, 0.26, 0);
    parts.push(box);
    const lid = new THREE.CylinderGeometry(0.31, 0.31, 0.9, 10, 1, false, 0, Math.PI);
    lid.rotateZ(Math.PI / 2);
    lid.translate(0, 0.52, 0);
    parts.push(lid);
    for (const dx of [-0.28, 0.28]) {
      const band = new THREE.BoxGeometry(0.10, 0.66, 0.66);
      band.translate(dx, 0.30, 0);
      parts.push(band);
    }
    const geo = Sky.mergeGeometries(parts);
    geo.computeVertexNormals();
    this._chestGeo = geo;
    for (const p of parts) p.dispose();

    this._chestMats = this.C.tiers.map(t => new THREE.MeshLambertMaterial({
      color: t.colour, flatShading: true,
      emissive: t.colour, emissiveIntensity: 0.55,
    }));
    /* And a fourth, on the end, for what comes out of the caves. It is
       the only violet thing in a mission made of gold and cyan, and it
       burns twice as hot as the trench does — a diver climbing the
       slope with one of these under their arm should be visible from
       the beach, because that is a person who went under a roof. */
    this._chestMats.push(new THREE.MeshLambertMaterial({
      color: this.C.cave.colour, flatShading: true,
      emissive: this.C.cave.colour, emissiveIntensity: 1.05,
    }));
    /* And a fifth, for what comes out of a hold. It is the only rose
       thing in the mission and it exists for one reason: a diver
       walking up the shingle with three of these is a diver who put a
       boot through a hatch on the far side of the reef, and the two
       people watching from the water should be able to tell that from
       the colour rather than from being told. */
    this._chestMats.push(new THREE.MeshLambertMaterial({
      color: this.C.holds.colour, flatShading: true,
      emissive: this.C.holds.colour, emissiveIntensity: 1.05,
    }));
    // banded timber under the paint: a chest, not a glowing brick
    for (const m of this._chestMats) DiveMaterials.patch(m, 'timber', 0.7);
    this._glowTex = Sky.glowTexture('rgba(255,255,255,0.95)', 'rgba(255,220,140,0.45)');
  }

  /* Which of the five materials a chest wears. Cave salvage and hold
     spoils are both trench chests as far as every tier, band and stat
     is concerned — the violet and the rose are paint, not extra tiers —
     so the one place that difference exists is here. */
  _chestMat(c) {
    return this._chestMats[DiveMission._packIndex(c)];
  }

  // ...and the same answer as a slot index, for the wire and the body
  static _packIndex(c) {
    if (c && c.hoard) return 4;
    if (c && c.cave) return 3;
    return U.clamp((c && c.tier) | 0, 0, 2);
  }

  /* ---- what is in your hands, on you ----

     The entire mission is a question about how much you are carrying,
     and until now the answer lived in four pips on a HUD. Nobody
     watching you could see it, which is a strange thing for a game
     whose whole social layer is *watching somebody swim home rich*.

     So the chests go on the body: hung off the rig's chest joint, so
     they tuck when the arms tuck and roll when the body rolls, and
     coloured by tier — a diver climbing out of the trench with two
     cyan boxes under them is the most legible thing in the loch. Six
     slots, because The Hoard exists. */
  static CARRY_SLOTS = [
    [-0.17,  0.19, 0.25], [0.17,  0.19, 0.25],
    [-0.18,  0.01, 0.28], [0.18,  0.01, 0.28],
    [-0.16, -0.16, 0.25], [0.16, -0.16, 0.25],
  ];

  _carryPack(sw) {
    const rig = sw.fig && sw.fig.userData && sw.fig.userData.rig;
    if (!rig || !rig.chest) return null;
    const pack = [];
    for (let i = 0; i < 6; i++) {
      const s = DiveMission.CARRY_SLOTS[i];
      const m = new THREE.Mesh(this._chestGeo, this._chestMats[0]);
      m.position.set(s[0], s[1], s[2]);
      m.rotation.set(Math.PI / 2, (i % 2 ? 1 : -1) * 0.22, (i % 3) * 0.14 - 0.14);
      m.scale.setScalar(0.40);
      m.visible = false;
      rig.chest.add(m);
      pack.push(m);
    }
    return pack;
  }

  /* Show `n` of them, in the tiers given. Used for the local diver off
     `this.carry` and for every peer off what their machine sent. */
  _showCarried(pack, tiers) {
    if (!pack) return;
    for (let i = 0; i < pack.length; i++) {
      const t = tiers && tiers[i];
      pack[i].visible = t !== undefined && t !== null;
      if (pack[i].visible) {
        pack[i].material = this._chestMats[U.clamp(t | 0, 0, this._chestMats.length - 1)];
      }
    }
  }

  /* `opts.cave` places it under a roof instead of on the open floor,
     and paints and prices it accordingly. It is deliberately not a
     fourth tier: everything downstream — the depth bands, the tape,
     the music gears, the stats — keeps working because a cave chest
     *is* a trench chest that happens to be somewhere worse. */
  _spawnChest(tierIndex, at, opts = {}) {
    const C = this.C;
    const tier = C.tiers[tierIndex];
    const cave = !!opts.cave;
    /* Spoils out of a hold. They wear the cave's violet and count as
       cave salvage everywhere it matters — the body, the pile, the
       wire — because they *are* the same box; the flag exists for one
       thing only, which is that the ground must not treat three chests
       somebody let out of a wreck as three chests missing from the
       caves and quietly mint them again. */
    const hoard = !!opts.hoard;
    let x = 0, z = 0, y = 0;
    if (at) { x = at.x; z = at.z; y = at.y; }
    else if (cave) {
      /* Inside one, and never right by the mouth: the whole point of
         the money being in there is that you have to commit to the
         chamber to reach it. */
      const caves = this.reef.caves.list;
      if (!caves.length) return null;
      const s = caves[(this.rng() * caves.length) | 0];
      for (let tries = 0; tries < 60; tries++) {
        const a = this.rng() * U.TAU;
        const r = s.R * U.lerp(0.12, 0.72, Math.sqrt(this.rng()));
        const px = s.x + Math.cos(a) * r, pz = s.z + Math.sin(a) * r;
        const h = this.reef.heightAt(px, pz);
        let clear = true;
        for (const cd of this.reef.colliders) {
          if ((cd.x - px) ** 2 + (cd.z - pz) ** 2 < (cd.r + 1.6) ** 2) { clear = false; break; }
        }
        if (!clear) continue;
        x = px; z = pz; y = h + 0.35;
        break;
      }
      if (y === 0) return null;
    }
    else {
      // rejection-sample the tier's depth band off the floor function,
      // then sit the chest on the sand clear of any collider
      /* The bearing is drawn from the seaward half-turn measured off the
         shore normal. Half of this reef is a hillside now, and sampling
         the whole disc would spend most of its two hundred and forty
         tries proposing chests on a mountain. */
      const sea = this.shore.ang + Math.PI;
      for (let tries = 0; tries < 240; tries++) {
        const a = sea + U.lerp(-1.62, 1.62, this.rng());
        const r = U.lerp(6, C.reefRadius * 0.96, Math.sqrt(this.rng()));
        const px = Math.sin(a) * r, pz = Math.cos(a) * r;
        const h = this.reef.heightAt(px, pz);
        if (h > tier.top || h <= tier.bottom) continue;
        let clear = true;
        for (const cd of this.reef.colliders) {
          if ((cd.x - px) ** 2 + (cd.z - pz) ** 2 < (cd.r + 2.2) ** 2) { clear = false; break; }
        }
        if (!clear) continue;
        x = px; z = pz; y = h + 0.35;
        break;
      }
      // the reef always has shelf; if a tier came up empty the chest is
      // simply not placed rather than dropped at the origin
      if (y === 0) return null;
    }

    const colour = hoard ? C.holds.colour : cave ? C.cave.colour : tier.colour;
    const mesh = new THREE.Mesh(this._chestGeo,
                                this._chestMat({ tier: tierIndex, cave, hoard }));
    mesh.position.set(x, y, z);
    mesh.rotation.y = this.rng() * U.TAU;
    if (cave) mesh.scale.setScalar(1.22);
    this.scene.add(mesh);

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._glowTex, color: colour, transparent: true,
      opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    glow.scale.setScalar(cave ? 7.2 : 3.4 + tierIndex * 1.1);
    glow.position.set(x, y + 0.4, z);
    glow.renderOrder = 5;
    this.scene.add(glow);

    /* A chest somebody dropped gets a second marker that ignores fog
       and depth entirely. It is the mission's one rule — *whatever you
       black out holding lies there for anybody* — and until now that
       rule was invisible past twenty metres of blue water, which meant
       it was a rule about a thing nobody could find. One sprite makes
       a blackout something the whole loch can see happen. */
    /* Cave salvage gets one too, and gets it from birth rather than
       only once somebody has dropped it. It is the mission telling you
       there is eleven thousand pounds under that rock from the other
       side of the loch, which is the only honest way to sell a risk:
       show it to them, and let them decide. */
    let far = null;
    if (at || cave) {
      far = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this._glowTex, color: colour, transparent: true,
        opacity: 0.55, depthWrite: false, depthTest: false, fog: false,
        blending: THREE.AdditiveBlending,
      }));
      far.scale.setScalar(cave ? 3.2 : 2.4);
      far.position.set(x, y + 1.1, z);
      far.renderOrder = 39;
      this.scene.add(far);
    }

    const chest = {
      id: this._nextChestId++, tier: tierIndex, cave, hoard,
      value: cave ? C.cave.value : tier.value,
      x, y, z, mesh, glow, far, mult: 1, dropped: !!at, taken: false,
      phase: this.rng() * U.TAU, depth: -y,
    };
    this.chests.push(chest);
    return chest;
  }


  /* =================== the holds ===================

     Everything else in the loch is a decision about *distance*: how
     far down, how far out, how far back with how much left. A hold is
     a decision about standing still.

     It is a steel hatch bolted to the plating of a sunk hull, and it
     opens for exactly one thing — the kick, which is the same verb
     that turns a shark away and the same verb that swims. Four of
     them, inside touching distance, each one costing a slice of the
     bar and each one ringing across the whole loch. You cannot do it
     on the move and you cannot do it quietly, and the animal that
     lives on the hatch is already looking at you before the first one
     lands.

     What comes out is three chests at once, which is most of a full
     carry arriving in your hands in a second and a half at the exact
     moment there is something behind you. That is the entire point:
     the mission's question is *one more?*, and a hold is the only
     place that asks it with the answer already in your arms. */

  /* One hatch, as geometry: a steel ring let into the plating, a dished
     door inside it on a hinge, and a locking wheel on the front of the
     door. All three are the same two materials, and the door is a child
     of a pivot so breaking it open is a rotation rather than a swap. */
  _buildHoldKit() {
    const ringParts = [];
    const ring = new THREE.TorusGeometry(1.28, 0.20, 6, 16);
    ringParts.push(ring);
    for (let i = 0; i < 10; i++) {              // the bolts round the rim
      const a = (i / 10) * U.TAU;
      const b = new THREE.IcosahedronGeometry(0.11, 0);
      b.translate(Math.cos(a) * 1.28, Math.sin(a) * 1.28, 0.16);
      ringParts.push(b);
    }
    const back = new THREE.CylinderGeometry(1.20, 1.20, 0.16, 14);
    back.rotateX(Math.PI / 2);
    back.translate(0, 0, -0.24);
    ringParts.push(back);
    this._holdRingGeo = Sky.mergeGeometries(ringParts);
    this._holdRingGeo.computeVertexNormals();
    for (const g of ringParts) g.dispose();

    const doorParts = [];
    const plate = new THREE.CylinderGeometry(1.14, 1.14, 0.22, 14);
    plate.rotateX(Math.PI / 2);
    doorParts.push(plate);
    // the wheel: a rim and four spokes, and it is the part that turns
    const wheel = new THREE.TorusGeometry(0.56, 0.09, 5, 14);
    wheel.translate(0, 0, 0.24);
    doorParts.push(wheel);
    for (let i = 0; i < 4; i++) {
      const sp = new THREE.BoxGeometry(1.06, 0.10, 0.10);
      sp.rotateZ((i / 4) * Math.PI);
      sp.translate(0, 0, 0.24);
      doorParts.push(sp);
    }
    this._holdDoorGeo = Sky.mergeGeometries(doorParts);
    this._holdDoorGeo.computeVertexNormals();
    for (const g of doorParts) g.dispose();

    this._holdMats = [
      new THREE.MeshLambertMaterial({ color: '#5c6a72', flatShading: true }),
      /* The door lights up as it loses. Emissive rather than a colour
         change, because the one thing a diver forty metres down needs
         to know about a hatch is how many more times they have to hit
         it, and a thing getting hotter says that without a number. */
      new THREE.MeshLambertMaterial({
        color: '#7d6a63', flatShading: true,
        emissive: this.C.holds.colour, emissiveIntensity: 0,
      }),
    ];
  }

  /* Where they are, which is decided by the reef rather than here: one
     on the plating of every hull she left on the slope. The mission
     only picks how much each is worth, and that is a function of how
     deep the hull lies — a hatch at ten metres and a hatch at forty
     are the same four kicks, so if they paid the same nobody would
     ever swim past the shallow one. */
  _buildHolds() {
    this.holds = [];
    const H = this.C.holds;
    const wrecks = (this.reef && this.reef.wrecks) || [];
    if (!wrecks.length) return;
    this._buildHoldKit();

    for (let i = 0; i < wrecks.length; i++) {
      const at = wrecks[i].hold;
      if (!at) continue;
      const depth = Math.max(0, -at.y);
      const face = Math.atan2(at.nx, at.nz);

      const group = new THREE.Group();
      group.position.set(at.x, at.y, at.z);
      group.rotation.y = face;

      group.add(new THREE.Mesh(this._holdRingGeo, this._holdMats[0]));
      /* The hinge is on the rim, not on the middle, so when it goes it
         goes *sideways* — a door swinging off a wreck, which is a much
         better two hundred milliseconds than a plate fading out. */
      const hinge = new THREE.Object3D();
      hinge.position.set(-1.16, 0, 0.02);
      const door = new THREE.Mesh(this._holdDoorGeo, this._holdMats[1]);
      door.position.set(1.16, 0, 0);
      hinge.add(door);
      group.add(hinge);
      this.scene.add(group);

      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this._glowTex, color: H.colour, transparent: true,
        opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      glow.scale.setScalar(6.0);
      glow.position.set(at.x, at.y + 0.3, at.z);
      glow.renderOrder = 5;
      this.scene.add(glow);

      /* And the marker that ignores fog, depth and rock, the same way
         cave salvage does — for the same reason. A hold nobody can find
         is a mechanic nobody plays. */
      const far = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this._glowTex, color: H.colour, transparent: true,
        opacity: 0.5, depthWrite: false, depthTest: false, fog: false,
        blending: THREE.AdditiveBlending,
      }));
      far.position.set(at.x, at.y + 1.6, at.z);
      far.renderOrder = 38;
      this.scene.add(far);

      this.holds.push({
        id: i, x: at.x, y: at.y, z: at.z, face, depth,
        hp: H.hits, hpMax: H.hits, open: false, openT: 0,
        value: Math.round(H.value * (1 + depth * H.deepGain)),
        group, hinge, door, glow, far,
        phase: this.rng() * U.TAU, hit: 0, spin: 0,
      });
    }
  }

  /* The beacons over the cave mouths.

     The caves have always been the best decision in the mission and
     for a long time almost nobody made one, and the reason turned out
     to have nothing at all to do with the risk being badly priced: a
     chamber seen from thirty metres out is a dark lump among sixty
     other dark lumps, and a door you cannot find is a door nobody
     opens. The rock now has a lit arch of anemones round its mouth for
     the near view, and this is the far one — a violet smudge over
     every doorway in the loch that fog and rock cannot hide, fading
     out as you arrive so that what you are actually looking at when
     you get there is the cave. */
  _buildCaveMarks() {
    this.caveMarks = [];
    const list = (this.caves && this.caves.list) || [];
    for (const cave of list) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this._glowTex, color: this.C.cave.colour, transparent: true,
        opacity: 0.4, depthWrite: false, depthTest: false, fog: false,
        blending: THREE.AdditiveBlending,
      }));
      s.position.set(cave.mouth.x, cave.mouth.y + 3.0, cave.mouth.z);
      s.renderOrder = 37;
      this.scene.add(s);
      this.caveMarks.push({ s, cave, phase: this.rng() * U.TAU });
    }
  }

  /* Per frame: the pulse on everything unopened, the door swinging on
     everything that has just gone, and the noise dying away. */
  _tickHolds(dt) {
    this._din = Math.max(0, this._din - dt * 1.7);
    this._priseCool = Math.max(0, this._priseCool - dt);

    for (const mk of (this.caveMarks || [])) {
      mk.phase += dt * 1.3;
      const d = this.camera.position.distanceTo(mk.s.position);
      mk.s.scale.setScalar(U.clamp(1.6 + d * 0.045, 2.0, 11));
      // gone by the time you are at the door: the arch takes over there
      mk.s.material.opacity = (0.22 + 0.16 * (0.5 + 0.5 * Math.sin(mk.phase)))
                            * U.clamp((d - 14) / 26, 0, 1);
    }

    for (const h of (this.holds || [])) {
      h.phase += dt * (h.open ? 2.2 : 1.4);
      const pulse = 0.5 + 0.5 * Math.sin(h.phase);
      h.hit = Math.max(0, h.hit - dt * 3.2);

      if (h.open) {
        h.openT = Math.min(1, h.openT + dt * 2.4);
        // out and back on its hinge, then hanging off the hull
        h.hinge.rotation.y = -U.smoothstep(0, 1, h.openT) * 2.15;
        h.glow.material.opacity = 0.10 + 0.10 * pulse;
        h.glow.scale.setScalar(4.0);
        h.far.material.opacity = 0;
        h.far.visible = false;
        this._holdMats[1].emissiveIntensity = 0;
        continue;
      }

      /* Unopened: it breathes, and the door glows hotter the closer it
         is to going. The emissive is on the shared material, so it is
         driven off whichever hatch is being worked rather than off all
         of them — nothing else is being hit, so nothing else moves. */
      const worked = 1 - h.hp / h.hpMax;
      /* The wheel comes round a quarter turn per blow. It is bolted to
         a wreck, so nothing about the hatch drifts or bobs — the only
         thing that moves before it goes is the lock, and that is the
         point: you can see how far through it you are from behind. */
      h.spin = U.damp(h.spin, worked * 2.4, 4, dt);
      h.door.rotation.z = h.spin;
      h.glow.scale.setScalar(5.4 + worked * 3.6 + pulse * 0.5);
      h.glow.material.opacity = 0.34 + worked * 0.34 + 0.18 * pulse + h.hit * 0.5;

      const fd = this.camera.position.distanceTo(h.far.position);
      h.far.scale.setScalar(U.clamp(1.4 + fd * 0.040, 1.8, 10));
      h.far.material.opacity = (0.26 + 0.26 * pulse) * U.clamp(fd / 16, 0.25, 1);
    }

    /* Told once, the first time a diver is close enough to a hatch for
       it to be a question. The mission teaches everything else by
       putting it in front of you and letting you find out — but a
       sealed door is the one thing down here that does nothing at all
       when you swim into it, and a mechanic whose entire tell is "keep
       doing the thing that appeared not to work" needs one sentence. */
    if (!this._toldHold && this.state === 'live' && !this.out) {
      const sw = this.swimmer;
      for (const h of (this.holds || [])) {
        if (h.open) continue;
        const dx = h.x - sw.pos.x, dy = h.y - sw.pos.y, dz = h.z - sw.pos.z;
        if (dx * dx + dy * dy + dz * dz > 11 * 11) continue;
        this._toldHold = true;
        AudioBus.play('dv-cave');
        this._banner('A SEALED HOLD', 'Swim at it and kick. Four should do it', 'good');
        break;
      }
    }

    /* One material, one number: whichever hatch was hit most recently
       is the one that is hot. */
    if (this._holdMats) {
      let hot = 0;
      for (const h of (this.holds || [])) {
        if (h.open) continue;
        hot = Math.max(hot, (1 - h.hp / h.hpMax) * 0.9 + h.hit * 0.8);
      }
      this._holdMats[1].emissiveIntensity = hot;
    }
  }

  /* A kick that landed on steel instead of on water.

     Called off the same stroke that fends a shark, because there is no
     second button and there was never going to be one — you swim at
     the hatch and you keep swimming at it. Which means the two verbs
     collide by design: the animal is on the hatch, and every kick you
     spend on the door is a kick you did not spend turning it away. */
  _priseCheck() {
    if (!this.holds || !this.holds.length) return;
    if (this.state !== 'live' || this.out) return;
    if (this._priseCool > 0) return;
    const H = this.C.holds;
    const sw = this.swimmer;
    const face = this._facingVec();

    let best = null, bestD = H.range * H.range;
    for (const h of this.holds) {
      if (h.open) continue;
      const dx = h.x - sw.pos.x, dy = h.y - sw.pos.y, dz = h.z - sw.pos.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > bestD) continue;
      // and you have to be swimming *at* it, the same test the shark gets
      const d = Math.sqrt(d2) || 1;
      if ((dx * face.x + dy * face.y + dz * face.z) / d < 0.15) continue;
      best = h; bestD = d2;
    }
    if (best) this._prise(best);
  }

  _prise(h) {
    const H = this.C.holds;
    const sw = this.swimmer;
    this._priseCool = H.cool;
    h.hp--;
    h.hit = 1;
    this.stats.holdHits++;
    sw.air = Math.max(0.02, sw.air - H.air);

    /* The noise. This is the mechanic — a hatch being kicked is the
       only sound in the loch that is not a diver swimming, it carries
       to the far side of the reef, and it does not care whether you
       are carrying anything. */
    this._din = H.din;
    if (this.sharks && this.sharks.alert) this.sharks.alert(h.x, h.z, H.wake);

    this.camKick = Math.min(this.camKick + 1.1, 1.8);
    this.shake = Math.min(1.0, this.shake + 0.35);
    this.hitStop = Math.max(this.hitStop, 0.07);
    AudioBus.play('dv-prise', { n: h.hpMax - h.hp });
    Input.haptic(24);

    this._tmpV.set(h.x, h.y + 0.2, h.z);
    this.fx.rings.fire(this._tmpV, this.camera.quaternion, 0.7, 5.4, 0.4, H.colour);
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * U.TAU;
      this.fx.sparks.emit(h.x, h.y + 0.2, h.z,
        Math.cos(a) * 4.5, 1 + Math.random() * 3.5, Math.sin(a) * 4.5,
        0.22 + Math.random() * 0.24, 0.45 + Math.random() * 0.4,
        DiveMission._SPARK);
    }

    if (h.hp <= 0) { this._crackHold(h); return; }

    this.fx.labels.add(h.hp + ' more', this._tmpV, { life: 0.9, rise: 4 });
    if (!this._toldDin) {
      this._toldDin = true;
      this._banner('THE HOLD',
                   'Keep kicking. Everything in the loch can hear you', 'bad');
    }
  }

  /* And it goes. Three chests on the sand in front of a door hanging
     off its hinge, which is the most money the mission ever puts in
     one place — and the loudest possible advertisement that somebody
     is about to be carrying it. */
  _crackHold(h) {
    const H = this.C.holds;
    h.open = true;
    h.openT = 0;
    this.stats.holdsOpened++;
    this.stats.deepestHold = Math.max(this.stats.deepestHold, Math.round(h.depth));

    this.hitStop = 0.16;
    this.shake = Math.min(1.0, this.shake + 0.9);
    this.camKick = 1.8;
    this.fovKick = Math.max(this.fovKick, 8);
    AudioBus.play('dv-hold');
    if (this.music) this.music.stinger('chain');
    this._flash(0.32, 'rgba(255,150,190,0.45)');

    this._tmpV.set(h.x, h.y + 0.4, h.z);
    this.fx.rings.fire(this._tmpV, this.camera.quaternion, 0.9, 12.0, 0.7, H.colour);
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * U.TAU;
      this.fx.sparks.emit(h.x, h.y + 0.4, h.z,
        Math.cos(a) * 7, 2 + Math.random() * 5, Math.sin(a) * 7,
        0.3 + Math.random() * 0.4, 0.7 + Math.random() * 0.6,
        DiveMission._SPARK);
    }

    /* The spoils. They spill onto the sand in front of the hatch as
       *dropped* chests, which is deliberate: the mission's one rule is
       that anything lying lit on the floor belongs to whoever reaches
       it, and a hold nobody has come back for yet is that rule with
       three thousand pounds standing on it. */
    const spilled = [];
    for (let i = 0; i < H.chests; i++) {
      const a = h.face + U.lerp(-1.1, 1.1, this.rng());
      const r = 1.8 + this.rng() * 2.6;
      const x = h.x + Math.sin(a) * r, z = h.z + Math.cos(a) * r;
      const y = this.reef.heightAt(x, z) + 0.35;
      const c = this._spawnChest(this.C.tiers.length - 1, { x, y, z },
                                 { cave: true, hoard: true });
      if (!c) continue;
      c.value = h.value;
      spilled.push(c);
      if (this.party) {
        MissionNet.event({ kind: 'drop', tier: c.tier, value: c.value,
                           cave: 1, hoard: 1, x, y, z });
      }
    }
    if (this.party) MissionNet.event({ kind: 'hold', id: h.id });

    this.fx.labels.add(U.money(h.value * spilled.length), this._tmpV,
                       { className: 'gold', life: 1.6, rise: 6 });
    this._banner('THE HOLD IS OPEN',
                 U.money(h.value * spilled.length) + ' on the sand — now get it home',
                 'perfect');
  }

  /* A hold somebody else broke. Only the door and the light: the
     chests arrive as `drop` events on their own, and the host's next
     snapshot is what makes them real. */
  _openHoldRemote(id) {
    const h = (this.holds || []).find(x => x.id === id);
    if (!h || h.open) return;
    h.hp = 0;
    h.open = true;
    h.openT = 0;
    AudioBus.play('dv-hold');
  }

  /* A retry bolts every door shut again. The hulls do not move — the
     reef is a pure function of the seed and always was — so this is
     the doors and nothing else. */
  _resetHolds() {
    for (const h of (this.holds || [])) {
      h.hp = h.hpMax;
      h.open = false;
      h.openT = 0;
      h.hit = 0;
      h.spin = 0;
      h.hinge.rotation.y = 0;
      h.far.visible = true;
      h.far.material.opacity = 0.5;
      h.glow.material.opacity = 0.55;
    }
    if (this._holdMats) this._holdMats[1].emissiveIntensity = 0;
  }

  _disposeHolds() {
    for (const h of (this.holds || [])) {
      this.scene.remove(h.group);
      this.scene.remove(h.glow);
      this.scene.remove(h.far);
      h.glow.material.dispose();
      h.far.material.dispose();
    }
    this.holds = [];
    for (const mk of (this.caveMarks || [])) {
      this.scene.remove(mk.s);
      mk.s.material.dispose();
    }
    this.caveMarks = [];
    if (this._holdRingGeo) { this._holdRingGeo.dispose(); this._holdRingGeo = null; }
    if (this._holdDoorGeo) { this._holdDoorGeo.dispose(); this._holdDoorGeo = null; }
    if (this._holdMats) { for (const m of this._holdMats) m.dispose(); this._holdMats = null; }
  }
  /* =================== the pile ===================

     The scoreboard, as an object in the world. Every chest that counts
     is standing on the shingle where the other two can see it, and a
     run's whole story — four cheap ones and a nervous hour, or one
     trench trip that paid for the night — is legible from the water at
     forty metres. A number on a HUD cannot do that.

     It is pooled: one geometry, three materials, and a cap on how many
     boxes are ever drawn. Past the cap the mound keeps its shape and
     stops adding meshes, because nobody counts a hundred and forty
     chests and everybody notices a frame rate. */
  static PILE_CAP = 84;

  _buildPile() {
    const sh = this.shore;
    this.pile = { group: new THREE.Group(), items: [], n: 0 };
    this.pile.group.position.set(sh.landing.x, sh.landing.y, sh.landing.z);
    this.scene.add(this.pile.group);

    /* A lantern on a pole over it. It is the only warm light in a
       mission made entirely of cyan, it is visible from the trench, and
       it is the answer to "which way is the beach" at every depth. */
    /* Draped, for the same reason the eight torches on the rim are:
       the landing pad is flat *enough*, not flat, and a three-metre
       post pinned to the middle's height is a post standing on air the
       moment the ground under it dips. */
    const postY = this.reef.heightAt(sh.landing.x - 2.4, sh.landing.z) - sh.landing.y;
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.12, 4.0, 6),
      new THREE.MeshLambertMaterial({ color: '#4a3b2c', flatShading: true }));
    post.position.set(-2.4, postY + 1.8, 0);
    const lamp = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.34, 0),
      new THREE.MeshLambertMaterial({ color: '#ffe9a8', flatShading: true,
                                      emissive: '#ffb347', emissiveIntensity: 1.0 }));
    lamp.position.set(-2.4, postY + 3.6, 0);
    this._lampGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._glowTex, color: '#ffd166', transparent: true,
      opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this._lampGlow.scale.setScalar(9);
    this._lampGlow.position.copy(lamp.position);
    this._lampGlow.renderOrder = 5;
    /* And it actually lights the shingle. One point light is the whole
       cost, and it buys the shot the mission is a round trip to: coming
       up out of cold blue water into a warm pool of light with your own
       gold stacked in it. Everything else in this loch is cyan. */
    this._lampLight = new THREE.PointLight('#ffc46a', 2.6, 26, 1.6);
    this._lampLight.position.copy(lamp.position);
    this.pile.group.add(post, lamp, this._lampGlow, this._lampLight);
    this._lamp = lamp;
  }

  /* =================== the drop ===================

     The one place in the loch that counts, and the loudest thing in
     it. It used to be a radius round the tideline with no picture at
     all: a diver forty metres down, holding four thousand pounds,
     could not see where home was, and the HUD answered them with a
     number of metres — which is an instrument reading, not a place.

     So it is a *place* now. A ring of light on the shingle with the
     pile standing in the middle of it, eight lit stakes round the rim,
     a column of gold going up out of it, and — the part that does the
     real work — a marker that ignores fog and depth entirely, so from
     the bottom of the trench in silt-out water there is still one warm
     point on the screen and it is the way home.

     Everything in here brightens with what is in your hands. Swimming
     home empty it is a lamp on a beach; swimming home with four
     chests it is a lighthouse. */
  _buildDrop() {
    const sh = this.shore;
    const R = this.C.dropRange;
    const g = new THREE.Group();
    g.position.set(sh.landing.x, sh.landing.y + 0.05, sh.landing.z);
    this.scene.add(g);

    const gold = '#ffd166';
    const add = (geo, opts) => new THREE.Mesh(geo, new THREE.MeshBasicMaterial(
      Object.assign({ color: gold, transparent: true, depthWrite: false,
                      blending: THREE.AdditiveBlending }, opts || {})));

    /* The pool of light the pile stands in, and the rim that is the
       line you have to be inside. Both are laid *on the shingle* — the
       ground under the landing is flattened but it is not a table, and
       a flat disc floating a hand's breadth over a beach is the one
       piece of a scene everybody's eye finds. Each vertex is dropped
       onto `heightAt`, which costs a couple of hundred samples once. */
    /* The mesh is laid flat with `rotation.x = -PI/2`, which sends the
       geometry's local (x, y, z) to a world offset of (x, z, -y). So
       the ground sample is taken at (x, -y) and the answer is written
       into the vertex's *z*. Getting either of those the wrong way
       round produces a ring that follows some other patch of beach. */
    const baseY = sh.landing.y + 0.05;
    const drape = (geo, lift) => {
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const wx = sh.landing.x + p.getX(i);
        const wz = sh.landing.z - p.getY(i);
        p.setZ(i, this.reef.heightAt(wx, wz) - baseY + lift);
      }
      p.needsUpdate = true;
      geo.computeVertexNormals();
      return geo;
    };
    const pool = add(drape(new THREE.CircleGeometry(R, 44), 0.10), { opacity: 0.16 });
    pool.rotation.x = -Math.PI / 2;
    pool.renderOrder = 3;

    const rim = add(drape(new THREE.RingGeometry(R - 0.42, R, 64), 0.14),
                    { opacity: 0.85, side: THREE.DoubleSide });
    rim.rotation.x = -Math.PI / 2;
    rim.renderOrder = 4;

    /* And a second ring that runs outwards from the middle over and
       over. A static circle is a decal; a circle that keeps arriving at
       the rim is an instruction, and nobody has ever had to be told
       what it means. */
    const call = add(new THREE.RingGeometry(R - 0.30, R, 64), { opacity: 0.5, side: THREE.DoubleSide });
    call.rotation.x = -Math.PI / 2;
    // it scales, so it cannot be draped; it sits a hand over the
    // highest shingle in the ring instead, which comes to the same
    // thing on a pad this flat and costs sixteen samples
    let crest = -1e9;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * U.TAU;
      crest = Math.max(crest, this.reef.heightAt(sh.landing.x + Math.cos(a) * R * 0.7,
                                                 sh.landing.z + Math.sin(a) * R * 0.7));
    }
    call.position.y = Math.max(0.03, crest - (sh.landing.y + 0.05) + 0.08);
    call.renderOrder = 4;

    /* The column. `fog: false` is the whole point of it — the mission's
       fog closes to twenty metres in the trench, and a beam that obeyed
       it would be invisible from exactly the place you most need to see
       it from. */
    const beamGeo = new THREE.CylinderGeometry(R * 0.86, R * 0.5, 54, 22, 1, true);
    const beamTex = DiveMission._beamTexture();
    const beam = add(beamGeo, {
      opacity: 0.13, side: THREE.DoubleSide, fog: false, map: beamTex,
    });
    beam.position.y = 27;
    beam.renderOrder = 3;

    g.add(pool, rim, call, beam);

    /* Eight torches round the rim, because a ring of light with
       nothing making it reads as a decal. They are the only built
       thing on the beach and they say somebody works here.

       And they are *stood in the shingle*, which they were not. The
       pad under the landing is flattened to eighty-five per cent, not
       to a table, so the ground at six and a half metres out is still
       doing whatever the coast noise felt like — and eight posts
       pinned to one hard-coded height meant half of them hung in the
       air over the beach and the other half were buried to the flame.
       Everything else in this group is draped onto `heightAt`; these
       are now too, and the post is long enough and sunk far enough
       that no amount of shingle underneath one can leave a gap.

       The fix is worth the paragraph because it is the class of bug
       that survives for months: nothing about it is wrong until the
       beach profile is touched, and then it is wrong everywhere at
       once and nobody can say when it started. */
    const postGeo = new THREE.CylinderGeometry(0.055, 0.09, 2.2, 5);
    const postMat = new THREE.MeshLambertMaterial({ color: '#4a3b2c', flatShading: true });
    const bulbGeo = new THREE.IcosahedronGeometry(0.17, 0);
    const bulbMat = new THREE.MeshLambertMaterial({
      color: '#ffe9a8', flatShading: true, emissive: '#ffb347', emissiveIntensity: 1.1 });
    this._bulbMat = bulbMat;
    this._flames = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * U.TAU + 0.2;
      const px = Math.cos(a) * R, pz = Math.sin(a) * R;
      // where the beach actually is under this one, in the group's own
      // local space — the group sits at the landing, five centimetres up
      const gy = this.reef.heightAt(sh.landing.x + px, sh.landing.z + pz) - baseY;
      const post = new THREE.Mesh(postGeo, postMat);
      // sunk a third of a metre, so a torch on a rise still has a foot
      post.position.set(px, gy + 0.78, pz);
      post.rotation.z = Math.sin(a * 3.1) * 0.06;
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(px, gy + 1.82, pz);
      /* And they are torches now rather than bulbs on sticks: a small
         additive flame over each one that breathes with the rest of
         the ring. Eight sprites is nothing, and it is the difference
         between a lit circle and a circle somebody lit. */
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this._glowTex, color: '#ffb347', transparent: true,
        opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      flame.scale.setScalar(1.5);
      flame.position.set(px, gy + 1.95, pz);
      flame.renderOrder = 6;
      this._flames.push({ s: flame, ph: i * 1.37 });
      g.add(post, bulb, flame);
    }

    /* The marker. Depth-tested off and fog off, so it draws over the
       hillside, over the silt and over forty metres of blue water. It
       is the only thing in the mission allowed to do that, and it earns
       it: without it the whole shore rule is a guessing game. */
    const mark = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._glowTex, color: gold, transparent: true, opacity: 0.8,
      depthWrite: false, depthTest: false, fog: false,
      blending: THREE.AdditiveBlending,
    }));
    mark.scale.setScalar(7);
    mark.position.set(0, 13, 0);
    mark.renderOrder = 40;
    g.add(mark);

    this.drop = { group: g, pool, rim, call, beam, mark, R, tex: beamTex,
                  geos: [pool.geometry, rim.geometry, call.geometry, beamGeo,
                         postGeo, bulbGeo],
                  mats: [pool.material, rim.material, call.material, beam.material,
                         postMat, bulbMat, mark.material] };
    this._callT = 0;
  }

  /* A vertical fade, for the column. One column of pixels is enough:
     the cylinder's UVs run 0 at the bottom to 1 at the top. */
  static _beamTexture() {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 64;
    const x = c.getContext('2d');
    const grd = x.createLinearGradient(0, 64, 0, 0);
    grd.addColorStop(0.00, 'rgba(255,255,255,1)');
    grd.addColorStop(0.35, 'rgba(255,255,255,0.42)');
    grd.addColorStop(1.00, 'rgba(255,255,255,0)');
    x.fillStyle = grd;
    x.fillRect(0, 0, 4, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /* How far the diver is from the middle of the drop, flat. */
  _dropDist() {
    const l = this.shore.landing;
    return Math.hypot(this.swimmer.pos.x - l.x, this.swimmer.pos.z - l.z);
  }

  /* Stood in it, on your feet. Both halves matter: the ring is where,
     and being on your feet is the walk up the shingle that the whole
     rule exists to buy. Floating in the shallows with your head out is
     not landing anything. */
  _inDrop() {
    const sw = this.swimmer;
    return (sw.onFoot || sw.onLand) && this._dropDist() <= this.C.dropRange;
  }

  /* The drop, breathing. Everything here is driven by two numbers —
     how much gold is in your hands and how close you are — so the
     beach is quiet while you are working the reef and is shouting by
     the time you are swimming home rich. */
  _tickDrop(dt, t) {
    const d = this.drop;
    if (!d) return;
    const held = this._carryValue();
    const want = U.clamp(held / 4200, 0, 1) * 0.75
               + (this.carry.length ? 0.25 : 0)
               + (this._inDrop() ? 0.6 : 0);
    this._dropHot = U.damp(this._dropHot, Math.min(1.4, want), 3, dt);
    const hot = this._dropHot;

    const breathe = 0.5 + 0.5 * Math.sin(t * (1.5 + hot * 2.2));
    d.rim.material.opacity = 0.45 + 0.45 * breathe + hot * 0.25;
    d.pool.material.opacity = 0.10 + 0.10 * breathe + hot * 0.18;
    d.beam.material.opacity = 0.07 + 0.05 * breathe + hot * 0.16;

    // the call ring: out from the middle to the rim, again and again,
    // faster the more you are carrying
    this._callT += dt * (0.42 + hot * 0.75);
    const k = this._callT % 1;
    d.call.scale.setScalar(0.08 + k * 0.95);
    d.call.material.opacity = (1 - k) * (0.30 + hot * 0.55);

    /* The marker holds a roughly constant size on screen rather than
       shrinking to a pixel from the trench, which is the difference
       between a landmark and a speck. */
    const dist = this.camera.position.distanceTo(d.group.position);
    d.mark.scale.setScalar(U.clamp(2.2 + dist * 0.075, 3, 26));
    d.mark.material.opacity = (0.35 + 0.45 * breathe + hot * 0.35)
                            * U.clamp(dist / 26, 0.25, 1);

    // one material behind all eight lamps, so the rim breathes together
    if (this._bulbMat) {
      this._bulbMat.emissiveIntensity = 0.7 + 0.45 * breathe + hot * 0.55;
    }
    /* ...and each flame on its own phase over the top of it, because
       eight torches breathing in perfect unison is a light rig and
       eight torches breathing nearly together is a beach. */
    if (this._flames) {
      for (const f of this._flames) {
        const fl = 0.5 + 0.5 * Math.sin(t * 5.6 + f.ph) * Math.sin(t * 2.3 + f.ph * 1.7);
        f.s.material.opacity = 0.42 + 0.30 * fl + hot * 0.28;
        f.s.scale.setScalar(1.25 + 0.35 * fl + hot * 0.5);
      }
    }
    if (this._lampLight) this._lampLight.distance = 26 + hot * 16;
  }

  /* Where the nth chest on the pile sits: courses of seven, each one
     ringed a little tighter than the course below it, so what grows out
     of the shingle is a tapering stack of salvage crates rather than a
     heap of boxes at one height. Twelve courses is four metres — tall
     enough to see from the water, which is the entire job. */
  static _pileSpot(n) {
    const PER = 7;
    const course = Math.floor(n / PER), k = n % PER;
    const a = (k / PER) * U.TAU + course * 0.62;
    const rad = Math.max(0.18, 1.35 - course * 0.085);
    return { x: Math.cos(a) * rad, y: 0.1 + course * 0.33, z: Math.sin(a) * rad,
             rot: a + Math.PI / 2 };
  }

  _addToPile(chests) {
    if (!this.pile) return;
    for (const c of chests) {
      const n = this.pile.n++;
      if (n >= DiveMission.PILE_CAP) continue;
      const spot = DiveMission._pileSpot(n);
      const mesh = new THREE.Mesh(this._chestGeo, this._chestMat(c));
      mesh.position.set(spot.x, spot.y, spot.z);
      mesh.rotation.set(U.lerp(-0.14, 0.14, Math.random()), spot.rot,
                        U.lerp(-0.14, 0.14, Math.random()));
      // it lands rather than appearing: a quarter second of drop
      mesh.userData.drop = 1;
      mesh.userData.restY = spot.y;
      this.pile.group.add(mesh);
      this.pile.items.push(mesh);
    }
  }

  _clearPile() {
    for (const f of this._flying) this.scene.remove(f.mesh);
    this._flying.length = 0;
    if (!this.pile) return;
    for (const m of this.pile.items) this.pile.group.remove(m);
    this.pile.items.length = 0;
    this.pile.n = 0;
  }

  _tickPile(dt, t) {
    this._tickFlights(dt);
    if (!this.pile) return;
    for (const m of this.pile.items) {
      const d = m.userData.drop;
      if (!d) continue;
      m.userData.drop = Math.max(0, d - dt * 4);
      m.position.y = m.userData.restY + m.userData.drop * m.userData.drop * 2.4;
    }
    /* The pad says what the button currently does. It is the same
       button either way, but a pad labelled KICK while you are stood
       on gravel is a lie told sixty times a run. */
    if (Input.isTouch && this.hud && this.hud.kick) {
      const jump = !!(this.swimmer && this.swimmer.onFoot);
      if (jump !== this._padJump) {
        this._padJump = jump;
        this.hud.kick.textContent = jump ? 'JUMP' : 'KICK';
      }
    }
    if (this._lamp) {
      // a lamp that breathes, so the beach is never a still photograph
      /* ...and one that gets brighter as the heap under it does, so a
         run going well is visibly lighting up its own beach. Twenty
         chests in and the landing is the brightest thing in the loch
         from anywhere on the reef. */
      const rich = U.clamp((this.pile.n || 0) / 26, 0, 1);
      const f = 0.85 + 0.15 * Math.sin(t * 2.3) + 0.06 * Math.sin(t * 7.1) + rich * 0.5;
      this._lamp.material.emissiveIntensity = f;
      this._lampGlow.material.opacity = 0.55 + 0.3 * f;
      this._lampGlow.scale.setScalar(8.4 + f * 1.4 + rich * 3);
      this._lampLight.intensity = 2.2 + f * 0.7 + rich * 1.6;
    }
  }

  /* Standing on the beach, facing the loch, with the pile at your back.
     Used at the top of a run and by `restart`. */
  _placeAshore() {
    const sh = this.shore;
    const x = sh.landing.x - sh.nx * 3.2, z = sh.landing.z - sh.nz * 3.2;
    const y = this.reef.heightAt(x, z) + this.swimmer.tune.bodyRadius;
    // yaw is measured so that (sin yaw, cos yaw) is forward; seaward is -n
    this.swimmer.place(x, y, z, Math.atan2(-sh.nx, -sh.nz));
    this.swimmer.pitchAim = this.swimmer.pitch = -0.22;
  }

  /* The jump. Three seconds of standing on the shingle looking at the
     water, and then you are in it — a real launch off the bank rather
     than a fade, because the first thing a mission does is tell you
     what kind of mission it is. */
  _leapIn() {
    const sh = this.shore;
    const sw = this.swimmer;
    if (!sw.onLand && !sw.aloft) return;
    /* Off your feet first, or the walk takes the velocity straight back
       off you: standing on the shingle is a state with its own physics
       now, and it does not believe in anything it did not ask for. */
    sw.onFoot = false;
    sw.grounded = false;
    sw.vel.set(-sh.nx * 9.6, 4.2, -sh.nz * 9.6);
    sw.pitchAim = -0.55;
    this.camKick = 0.8;
    this.fovKick = 5;
    AudioBus.play('dv-shingle', { power: 0.8 });
    this._shingle(sw.pos.x, sw.pos.y, sw.pos.z, 0.8);
  }

  _removeChest(chest) {
    const i = this.chests.indexOf(chest);
    if (i >= 0) this.chests.splice(i, 1);
    if (chest.mesh) { this.scene.remove(chest.mesh); }
    if (chest.glow) {
      this.scene.remove(chest.glow);
      chest.glow.material.dispose();
    }
    if (chest.far) {
      this.scene.remove(chest.far);
      chest.far.material.dispose();
    }
    chest.mesh = null; chest.glow = null; chest.far = null;
  }

  static _buildBuoy() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 9),
      new THREE.MeshLambertMaterial({ color: '#e5133f', flatShading: true,
                                      emissive: '#5a0714', emissiveIntensity: 0.4 }));
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.4, 6),
      new THREE.MeshLambertMaterial({ color: '#f2f7ff', flatShading: true }));
    mast.position.y = 1.7;
    const flag = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 0.05),
      new THREE.MeshLambertMaterial({ color: '#ffd166', flatShading: true,
                                      side: THREE.DoubleSide }));
    flag.position.set(0.5, 3.0, 0);
    // a chain down to the sand, so the buoy is a landmark you can follow
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 26, 5),
      new THREE.MeshLambertMaterial({ color: '#6f8090', flatShading: true }));
    chain.position.y = -13;
    g.add(body, mast, flag, chain);
    return g;
  }

  _buildPeers(scene) {
    if (!this.party) return;
    for (const p of this.roster) {
      const sw = new Swimmer({
        look: p.look || null,
        palette: p.look ? null : Figure.paletteFor(p.seat || 1),
        paint: { suit: '#123044', fin: '#7dfcd0' },
      });
      sw.group.visible = false;
      scene.add(sw.group);
      /* Down here everybody is a silhouette in a wetsuit and the water
         eats colour before it eats shape, so the name is the only way
         to tell whose torch that is. It fades fast: the reef has thirty
         metres of visibility and a label hanging in the dark beyond
         that would be sonar rather than eyesight. */
      const look = p.look ? Look.resolve(p.look) : null;
      const tag = Nametag.make(p.name,
        { accent: look ? look.accent : '#7dfcd0', near: 14, far: 46 });
      scene.add(tag);
      this.peers.set(p.id, {
        sw, tag, name: p.name, seen: false, pos: new THREE.Vector3(),
        air: 1, carried: 0, value: 0, deepest: 0, money: 0, trips: 0,
        pack: this._carryPack(sw),
      });
      this.scores.set(p.id, 0);
    }
  }

  _cacheHud() {
    const q = id => document.getElementById(id);
    this.hud = {
      money: q('dv-money'), gain: q('dv-gain'),
      chain: q('dv-chain'), chainWrap: q('dv-chain-wrap'), chainBar: q('dv-chain-bar'),
      time: q('dv-time'), timeLabel: q('dv-time-label'),
      depth: q('dv-depth'), tier: q('dv-tier'),
      tape: q('dv-tape'), tapeMark: q('dv-tape-mark'),
      breath: q('dv-breath'), breathFill: q('dv-breath-fill'), breathLbl: q('dv-breath-lbl'),
      ring: q('dv-ring'), ringPulse: q('dv-ring-pulse'),
      carry: q('dv-carry'), carryVal: q('dv-carry-val'),
      compass: q('dv-compass'), compNeedle: q('dv-comp-needle'),
      compRing: q('dv-comp-ring'), compLbl: q('dv-comp-lbl'),
      haul: q('dv-haul'), wet: q('dv-wet'),
      pressure: q('dv-pressure'), threat: q('dv-threat'),
      banner: q('dv-banner'), hint: q('dv-hint'),
      kick: document.querySelector('#touch-dive .kick-pad'),
      setup: q('dv-setup'),
      center: q('dv-center'), flash: q('screen-flash'),
    };
    const h = this.hud;
    if (h.setup) {
      const bits = [this.reefName, DiveConditions.describe(this.cond)];
      if (this.twist) bits.push(this.twist.name);
      h.setup.innerHTML = bits
        .map((b, i) => `<span class="${i === 0 ? 'hs-name' : 'hs-tag'}">${b}</span>`).join('');
    }
    if (h.carry) {
      h.carry.innerHTML = '';
      this._pips = [];
      for (let i = 0; i < this.C.carryMax; i++) {
        const el = document.createElement('i');
        h.carry.appendChild(el);
        this._pips.push(el);
      }
    }
    if (h.ring) h.ring.classList.toggle('off', !!this.flags.noBeat);
    /* The tape's bands are drawn from the tiers rather than hard-coded,
       so a twist that moves the trench moves the picture of it too. */
    const tiers = this.C.tiers;
    this.tapeMax = Math.min(60, -tiers[tiers.length - 1].bottom);
    if (h.tape) {
      let at = 0;
      for (let i = 0; i < tiers.length; i++) {
        const band = h.tape.querySelector('.b' + i);
        if (!band) continue;
        const to = Math.min(1, -tiers[i].bottom / this.tapeMax);
        band.style.top = (at * 100).toFixed(2) + '%';
        band.style.height = ((to - at) * 100).toFixed(2) + '%';
        band.style.background = 'linear-gradient(180deg,' + tiers[i].colour + 'aa,'
                              + tiers[i].colour + '44)';
        at = to;
      }
    }
    if (h.timeLabel) h.timeLabel.textContent = this.mode === 'deep' ? 'Down' : 'Time';
    this._shownStage = null;
  }

  /* =================== lifecycle =================== */

  cinematic() { return MissionCinematics.forMission(this.def.id, this); }

  updateEnvironment(dt, t, camera) {
    Sky.update(dt, camera.position, t);
    Water.update(dt);
  }

  start() {
    this._previousPixelRatio = Engine.renderer.getPixelRatio();
    const applyResolution = () => Engine.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, this.graphics.resolution));
    applyResolution(); this._offResolution = Engine.onResize(applyResolution);
    Input.setMouseAim(true);
    Input.setTouchMode('swim');
    this._aimOn = true;
    this._unlockWatch = Input.onLockChange((locked) => {
      if (!locked && this.state === 'live' && !Input.isTouch) this._pause();
    });
    if (this.party) {
      MissionNet.attach('dive');
      this._offEvents = MissionNet.on('event', (d, from) => this._onNetEvent(d, from));
      this._agendaCheckpoint();
      RoomUI.showAgenda();
    }
    this.state = this.party ? 'waiting' : 'countdown';
    this.countdown = 3.999;
    this._lastBeep = 4;
    this._startMusic();
    Screens.show('hud-dive');
    this._setCenter('', '');
    this._banner(this.reefName, DiveConditions.describe(this.cond));
    if (this.hud.hint) {
      /* Everything after the first clause is the same on every machine;
         the first clause is how you look around, and on a browser with
         no pointer lock to take there is no click to tell anybody to
         make. A thumb needs none of it — the pads say what they do. */
      this.hud.hint.innerHTML =
        (Input.aimReady ? 'Move the mouse to look' : 'Click to swim')
        + ' · <kbd>Space</kbd> kicks and jumps · walk it up the beach into the light';
      this.hud.hint.classList.toggle('show', !Input.isTouch);
    }
    if (this.party) {
      this._setCenter('READY', 'Waiting for everybody…', 'count');
      MissionNet.waitForStart().then(() => {
        if (!this.scene || this.state !== 'waiting') return;
        this.state = 'countdown';
        this.countdown = 3.999;
        this._lastBeep = 4;
        this._setCenter('', '');
      });
    }
  }

  restart() {
    clearTimeout(this._reportT);
    for (const c of this.chests.slice()) this._removeChest(c);
    this.chests = [];
    this.fx.labels.clear();
    // before the reset, which hands `_flying` a fresh array and would
    // otherwise leave the last run's chests hanging over the beach
    this._clearPile();
    this._resetRun();
    this.rng = U.makeRng(this.seed);
    for (let t = 0; t < this.C.tiers.length; t++) {
      for (let i = 0; i < this.C.tiers[t].chests; i++) this._spawnChest(t);
    }
    for (let i = 0; i < this.C.cave.chests; i++) {
      this._spawnChest(this.C.tiers.length - 1, null, { cave: true });
    }
    this._caveT2 = 0;
    this._resetHolds();
    this._placeAshore();
    this.swimmer.airMax = 1;
    this.swimmer.air = 1;
    this.swimmer.carried = 0;
    this._paintCarry();          // and the boxes come off the body
    // The Deep's escalation lives on the tune, so a retry has to undo it
    this.swimmer.tune.gaspRefill = ((this.twist && this.twist.tune) || {}).gaspRefill
                                   || Swimmer.TUNE.gaspRefill;
    this._startMusic();
    this.state = 'countdown';
    this._setCenter('', '');
    this._banner(this.reefName, DiveConditions.describe(this.cond));
  }

  _startMusic() {
    if (this.music) { this.music.stop(0.25); this.music = null; }
    this.music = Music.dive();
    this.music.setGear(0, 0.1);
    this.music.setIntensity(0.55);
  }

  dispose() {
    clearTimeout(this._reportT);
    clearTimeout(this._flashT);
    clearTimeout(this._bannerT);
    clearTimeout(this._gainT);
    if (this._offEvents) { this._offEvents(); this._offEvents = null; }
    for (const peer of this.peers.values()) peer.sw.dispose();
    this.peers.clear();
    RoomUI.hideAgenda();
    if (this.party) RoomUI.hideField();
    if (this.music) { this.music.stop(0.4); this.music = null; }
    if (this._unlockWatch) this._unlockWatch();
    Input.setMouseAim(false);
    Input.setTouchMode('drive');
    if (this.swimmer) this.swimmer.dispose();
    if (this.shoal) this.shoal.dispose();
    if (this.sharks) { this.sharks.dispose(); this.sharks = null; }
    this._disposeHolds();
    if (this.reef) this.reef.dispose();
    if (this.fx) this.fx.dispose();
    for (const c of this.chests.slice()) this._removeChest(c);
    this.chests = [];
    for (const f of this._flying) this.scene.remove(f.mesh);
    this._flying.length = 0;
    if (this.drop) {
      for (const g of this.drop.geos) g.dispose();
      for (const m of this.drop.mats) m.dispose();
      if (this._flames) { for (const f of this._flames) f.s.material.dispose(); }
      this._flames = null;
      // the marker shares the chest kit's glow, which is disposed below
      this.drop.tex.dispose();
      this.drop = null;
    }
    if (this._chestGeo) this._chestGeo.dispose();
    if (this._chestMats) for (const m of this._chestMats) m.dispose();
    if (this._glowTex) this._glowTex.dispose();
    Engine.disposeObject(this.scene);

    /* The water is a global singleton and *nothing else in the repo
       puts its palette back*. A dive that does not restore it leaves
       cobalt trench water in the attract screen, the boat race and
       every mission after it. */
    if (this._rig) { this._rig.restore(); this._rig = null; }
    if (this._offResolution) { this._offResolution(); this._offResolution = null; }
    if (this._previousPixelRatio !== undefined) Engine.renderer.setPixelRatio(this._previousPixelRatio);
    Water.setPalette(Water.DEFAULTS);
    Water.setFog(340, 3600, Sky.PALETTE.fog);
    Water.setSeaState({ swell: 1, chop: 1, wind: 0 });
    Sky.resetPreset();

    this.scene = null;
    if (this.hud) {
      if (this.hud.pressure) this.hud.pressure.style.opacity = 0;
      if (this.hud.threat) {
        this.hud.threat.style.opacity = 0;
        this.hud.threat.classList.remove('near');
      }
      if (this.hud.flash) this.hud.flash.style.opacity = 0;
      if (this.hud.setup) this.hud.setup.innerHTML = '';
      if (this.hud.banner) this.hud.banner.classList.remove('show');
      if (this.hud.hint) this.hud.hint.classList.remove('show');
      if (this.hud.gain) this.hud.gain.classList.remove('show');
      if (this.hud.chainWrap) this.hud.chainWrap.classList.remove('on');
      if (this.hud.carry) this.hud.carry.innerHTML = '';
      if (this.hud.compass) this.hud.compass.classList.remove('show', 'home', 'laden');
      if (this.hud.haul) this.hud.haul.classList.remove('on', 'capped');
      if (this.hud.wet) this.hud.wet.style.opacity = '0';
      this._setCenter('', '');
    }
  }

  /* =================== per-frame =================== */

  update(rawDt, t) {
    if (!this.scene) return;
    if (Engine.isPaused()) {
      if (this._aimOn) { Input.setMouseAim(false); this._aimOn = false; }
      if (this.music) this.music.setPaused(true);
      return;
    }
    if (this.music) this.music.setPaused(false);
    const wantAim = this.state === 'countdown' || this.state === 'live';
    if (wantAim && !this._aimOn) { Input.setMouseAim(true); this._aimOn = true; }
    if (!wantAim && this._aimOn) { Input.setMouseAim(false); this._aimOn = false; }

    if (Input.pressed('pause') && this.state !== 'finished') { this._pause(); return; }
    if (Input.pressed('mute')) AudioBus.toggleMute();

    // a beat of hit-stop on a blackout, and nowhere else: the one
    // moment in the mission that is worth freezing
    let dt = rawDt;
    if (this.hitStop > 0) { this.hitStop -= rawDt; dt = rawDt * 0.10; }
    dt = Math.min(dt, 0.1);
    this._lastDt = dt;

    Water.update(dt);
    Water.follow(this.camera.position.x, this.camera.position.z);
    this._localBeatT += dt;

    if (this.state === 'countdown') this._tickCountdown(rawDt);
    if (this.state === 'live') {
      // a first run's tutorial holds the clock until the controls are learnt
      this.elapsed += (typeof Tutorial !== 'undefined' && Tutorial.holdsClock()) ? 0 : dt;
      if (this.mode === 'salvage') {
        this.timeLeft = Math.max(0, this.C.runTime - this.elapsed);
        if (this.timeLeft <= 0) { this._finish('THE BELL'); }
      }
    }

    this._readControls(dt);
    this.swimmer.update(dt, this._ctl, this.world);
    this._tickTide(dt, t);
    this._afterSwim(dt);
    this._tickCave(dt);
    this._tickHolds(dt);
    this._tickSharks(dt);
    this._tickChests(dt);
    this._updateCamera(dt);
    this._updateDepth(dt);
    this._updateMusic(dt);
    this.reef.update(dt, this.camera.position);
    if (this._rig) this._rig.follow(this.swimmer.pos);
    Sky.update(dt, this.camera.position, t);
    this._tickPile(dt, t);
    this._tickDrop(dt, t);
    if (this.shoal) {
      this.shoal.update(dt, this.swimmer.pos, this.camera.position, this._sharkList);
    }
    this.fx.update(dt);
    this.buoy.position.y = Water.sampleHeight(0, 0);
    this._updatePeers(dt, t);
    this._netTick(dt);
    this._trackAgenda(dt);
    this._recordGhost(dt);
    this._paintHud();
  }

  _tickCountdown(dt) {
    this.countdown -= dt;
    const n = Math.ceil(this.countdown);
    if (n !== this._lastBeep && n >= 0) {
      this._lastBeep = n;
      if (n > 0) { AudioBus.play('countdown'); this._setCenter(String(n), '', 'count'); }
    }
    if (this.countdown <= 0) {
      this.state = 'live';
      this.elapsed = 0;
      AudioBus.play('go');
      this._setCenter('DIVE', '', 'go');
      this._leapIn();
      setTimeout(() => { if (this.state === 'live') this._setCenter('', ''); }, 700);
    }
  }

  /* One verb and a look. Everything else on the pad and the keyboard
     is a nudge: `move` is sculling, which exists purely so that lining
     a chest up at forty metres is not a fight with your own momentum. */
  _readControls(dt) {
    const c = this._ctl;
    const live = this.state === 'live' || this.state === 'countdown';
    const aim = Input.aimDelta();
    const stick = Input.aimStick();
    // deliberately the shootout's own numbers: the hands that learned to
    // aim a bow in this game should not have to learn a second mouse
    const SENS = 0.0022, STICK = 2.3;
    c.yaw = live ? (aim.x * SENS + stick.x * STICK * dt) : 0;
    c.pitch = live ? (aim.y * SENS + stick.y * STICK * dt) : 0;
    const mv = Input.moveAxes();
    c.move.x = live ? mv.x : 0;
    c.move.y = live ? mv.y : 0;
    // a blacked-out diver does not stroke, does not steer and does not
    // let go of anything: they are cargo until they are back
    if (this.out) { c.yaw = 0; c.pitch = 0; c.move.x = 0; c.move.y = 0; }
    c.stroke = live && this.state === 'live' && !this.out && Input.held('fire');
    /* Held rather than tapped, the kick becomes a streamline: a fifth
       of a second of holding it is the difference between the two, which
       is longer than any tap and shorter than anybody notices waiting. */
    this._streamT = c.stroke ? this._streamT + dt : 0;
    c.stream = this._streamT > 0.2;
    /* Back on the stick is the flare, and it takes the stick with it:
       a backwards scull was a nudge nobody used, and a brake is the
       thing a cave mouth or a hatch actually asks you for. */
    c.flare = live && !this.out && !this.swimmer.onFoot && c.move.y < -0.55;
    if (c.flare) c.move.y = 0;
    c.beat = this.flags.noBeat ? null : this._beatNow();
  }

  /* Where the bar is. The score is the authority when there is one —
     it is the thing the player can actually hear — but a muted player,
     or one whose browser has not unlocked audio yet, still has to be
     able to play the mechanic. So a local metronome at the same tempo
     stands in, and the swap is invisible because the tempo never moves. */
  _beatNow() {
    const live = this.music && this.music.beat ? this.music.beat() : null;
    if (live) { this._beat.spb = live.spb; this._beat.sinceBeat = live.sinceBeat; }
    else {
      const spb = 60 / 96;
      this._beat.spb = spb;
      this._beat.sinceBeat = this._localBeatT % spb;
    }
    return this._beat;
  }

  /* Everything the swimmer raised this frame, answered. */
  _afterSwim(dt) {
    const sw = this.swimmer;
    const st = this.stats;
    const live = this.state === 'live';

    if (sw.stroked) {
      st.strokes++;
      /* Every kick under water is also a kick *at* whatever is in
         front of you. There is no second button and there was never
         going to be one: the answer to a shark is the verb you already
         have, aimed. See rule three in predators.js. */
      if (!sw.up) { this._fend = true; this._priseCheck(); }
      // the hint has done its job the moment anybody kicks
      if (this.hud.hint) this.hud.hint.classList.remove('show');
      AudioBus.play('dv-stroke', { power: 0.5 + sw.flow * 0.5 });
      this.camKick = Math.min(this.camKick + (sw.onBeat ? 0.9 : 0.5), 1.8);
      if (sw.onBeat) {
        st.onBeat++;
        this.flowRun++;
        this.bestFlowRun = Math.max(this.bestFlowRun, this.flowRun);
        st.bestFlowRun = this.bestFlowRun;
        Input.haptic(8);
      } else this.flowRun = 0;
    }
    // the chain lighting is worth a sound exactly once per chain
    if (sw.flow >= 0.999 && !this.chainLit) {
      this.chainLit = true;
      if (this.music) this.music.stinger('chain');
      this._banner('IN THE FLOW', 'Everything you take is worth more', 'perfect');
    } else if (sw.flow < 0.55) this.chainLit = false;

    // bubbles off every kick, and a thin stream while you glide
    if (sw.trail > 0.02) this._bubbles(dt, sw);
    this._footfall(dt, sw);

    const depth = sw.depth;
    this.deepest = Math.max(this.deepest, depth);
    if (live) {
      st.deepest = Math.round(this.deepest * 10) / 10;
      if (!sw.up) { st.submergedTime += dt; this.tripDeepest = Math.max(this.tripDeepest, depth); }
      else st.surfaceTime += dt;
    }

    if (sw.bumped) {
      this.shake = Math.min(0.7, this.shake + 0.35);
      AudioBus.play('dv-bump');
    }

    /* ---- the waterline, both ways.
       The two loudest moments in a trip, and until now neither of them
       put a single particle on the screen. Coming up is the bright
       release the whole breath-hold is for; going back in off the
       shingle at a sprint is the moment the next one starts. Both get
       a ring on the water, a fan of spray and a lungful of noise. */
    if (sw.surfaced) {
      this.camGasp = 1;
      this._wet = 1;
      AudioBus.play('dv-gasp');
      this._splash(sw.pos.x, sw.pos.z, 0.7 + U.clamp(sw.speed / 9, 0, 0.8), '#dff9ff');
      this._flash(0.16, 'rgba(220,250,255,0.75)');
    }
    if (sw.splashed > 0.6) {
      const p = U.clamp(sw.splashed / 9, 0.35, 1.7);
      this._wet = 1;
      this.camKick = Math.min(this.camKick + p * 0.7, 1.8);
      AudioBus.play('dv-splash', { power: p });
      this._splash(sw.pos.x, sw.pos.z, p, '#eaffff');
    }
    // and the crunch of arriving on gravel
    if (sw.landed > 1.2) {
      this.camKick = Math.min(this.camKick + U.clamp(sw.landed / 12, 0.1, 0.7), 1.8);
      AudioBus.play('dv-shingle', { power: U.clamp(sw.landed / 9, 0.3, 1) });
      this._shingle(sw.pos.x, sw.pos.y, sw.pos.z, U.clamp(sw.landed / 8, 0.3, 1));
    }
    if (sw.jumped) {
      AudioBus.play('dv-shingle', { power: 0.45 });
      this._shingle(sw.pos.x, sw.pos.y, sw.pos.z, 0.4);
    }
    this._wet = Math.max(0, this._wet - dt * 0.62);

    /* ---- the tiers, met on the way down.
       Descending used to be dead air: thirty metres of holding one
       button with nothing happening until a chest came into range. Now
       each tier announces itself the first time you enter it on a
       trip — a note, the band on the tape lighting, and what it is
       worth — so going down has a shape and arriving in the trench
       feels like arriving somewhere. */
    if (live && !sw.up && !this.out) {
      const ti = this._tierAt(depth);
      const bit = 1 << ti;
      if (ti > 0 && !(this._tripTiers & bit) && depth > -this.C.tiers[ti].top + 1.5) {
        this._tripTiers |= bit;
        const T = this.C.tiers[ti];
        AudioBus.play('dv-tier', { tier: ti });
        this._banner(T.name.toUpperCase(), U.money(Math.round(T.value * this.payout))
                     + ' a chest', ti === 2 ? 'perfect' : '');
        if (this.hud.tape) {
          this.hud.tape.classList.remove('lit0', 'lit1', 'lit2');
          void this.hud.tape.offsetWidth;
          this.hud.tape.classList.add('lit' + ti);
        }
      }
    }

    /* ---- coming back from a blackout.
       You have no air, so you cannot kick, so left to the physics you
       would simply lie on the sand until the bell. What actually
       happens to an unconscious freediver is that they float, and that
       is also the right thing for the mission: the diver drifts up out
       of your hands, breaks the surface, and is then held there —
       helpless, on the strip, in front of two people who have just
       watched a pile of gold land on the floor. */
    if (this.out) {
      // an unconscious diver is not stood in the shallows: they float,
      // wherever they happened to be when the lights went out
      sw.onFoot = false;
      if (!sw.up) {
        /* ...unless there is rock over you, and then it does not work
           at all. A limp body under a cave roof rises half a metre and
           stops, and it would lie there against the ceiling until the
           bell — which is not a risk, it is a broken run.

           So it washes out instead: the chamber has a current through
           it, the body goes with it, and what everybody watches is a
           diver drifting out of a cave mouth face down and only then
           starting to rise. It is the best shot in the mission and it
           is also the fairest possible answer, because the cave still
           costs you every second of it. */
        const out = this._washOut && this.caves
          ? this.caves.escape(sw.pos.x, sw.pos.z) : null;
        if (out) {
          sw.vel.x = U.damp(sw.vel.x, out.x * 5.5, 3.0, dt);
          sw.vel.z = U.damp(sw.vel.z, out.z * 5.5, 3.0, dt);
          sw.vel.y = U.damp(sw.vel.y, 1.8, 2.5, dt);
        } else {
          sw.vel.y = U.damp(sw.vel.y, 5.2, 2.5, dt);
          sw.vel.x *= Math.exp(-1.6 * dt);
          sw.vel.z *= Math.exp(-1.6 * dt);
        }
        sw.pitchAim = U.damp(sw.pitchAim, 1.25, 3, dt);
        sw.yawAim = sw.yaw;
      } else {
        this.holdT -= dt;
        if (this.holdT <= 0) {
          this.out = false;
          this._washOut = false;
          this._setCenter('', '');
          this._banner('BACK', 'Whatever you dropped is still down there, lit', 'bad');
        }
      }
    }

    /* Surfacing ends the trip. *Coming ashore* is what pays.
       They used to be the same event, and separating them is the whole
       of the shore: your head coming out means you lived, and it means
       the reef knows how deep you went — but the gold in your hands is
       still gold in your hands, in open water, in front of two people,
       for as long as it takes you to swim it home. */
    if (sw.up && !this._inPocket) {
      // a trip ends when you get your head out, whether or not you got
      // anything — out, under the sky: a breath under a roof is half-time
      if (this.inTrip && this.tripDeepest > 3) this._endTrip();
    } else if (!this.inTrip && depth > 3) {
      this.inTrip = true; this.tripDeepest = depth; this.tripTook = 0;
      this._tripTiers = 0;
    }

    if (this._inDrop()) {
      this.bankT += dt;
      if (this.bankT >= this.C.bankTime && this.carry.length && live) this._bank();
    } else {
      this.bankT = 0;
    }

    // ---- blacking out
    if (sw.blackout && live) this._blackout();

    sw.carried = this.carry.length;
    // Buddy Line: two divers inside five metres share a bar, which turns
    // the whole mission into a conversation about who is next to whom
    if (this.flags.sharedAir) this._buddyAir(dt);
  }

  /* =================== the tide ===================

     The clock's half of `js/dive/tide.js`: which stage the run is in,
     whether your head is in a pocket or in the sky, and whether the
     water you are in is taking you home. */
  _tickTide(dt, t) {
    const sw = this.swimmer, st = this.stats;
    const live = this.state === 'live';
    // the tide stops with the bell, where it was; before the start it is still
    const stage = DiveTide.stageAt(live || this.state === 'finished' ? this.elapsed : 0,
                                   this.C.runTime);
    // every frame, not on the change: a restart puts the stage back to
    // still water without ever passing through a change
    this.world.chop = stage.chop;
    if (stage !== this.stage) {
      const was = this.stage;
      this.stage = stage;
      /* The flood coming in over a pocket you are breathing in is the
         one moment in the mission the roof takes the air back. It does
         not take it all: you keep what is in your lungs, and the door
         is where it always was. */
      if (was.pockets && !stage.pockets && this._inCave) {
        this._banner('THE POCKET IS GONE', 'Out the way you came in, on the breath you have', 'bad');
      }
    }
    if (live && this._stageSaid !== stage.id) {
      this._stageSaid = stage.id;
      if (stage.id !== 'still' || this.elapsed < 1) {
        this._banner(stage.title, stage.line, stage.id === 'flood' ? 'perfect' : 'good');
      }
      if (stage.id !== 'still') {
        if (this.music) this.music.stinger('boon');
        AudioBus.play('dv-tier', { tier: stage.id === 'flood' ? 2 : 1 });
        this.camKick = Math.min(this.camKick + 0.6, 1.8);
      }
    }

    // ---- the pocket
    const pocket = stage.pockets && !!this._inCave && sw.up && !sw.onFoot
      && DiveTide.pocketAt(this.caves, stage, sw.pos.x, sw.pos.z) !== null;
    if (pocket && !this._inPocket && live) {
      st.pocketBreaths++;
      if (st.pocketBreaths === 1) {
        this._banner('AIR', 'A breath under the roof. The door has not moved', 'good');
      }
    }
    this._inPocket = pocket;

    // ---- the races
    const k = sw.inCurrent || 0;
    this._raceK = U.damp(this._raceK, k, 4, dt);
    if (k > 0.3 && !sw.up && live && !this.out) {
      st.raceTime += dt;
      /* A race is a rhythm of its own: riding one holds the chain the
         way landing strokes on the beat does, and feeds it a little, so
         the best line home is also the one that arrives in the flow. */
      sw.chainIdle = 0;
      sw.flow = Math.min(1, sw.flow + 0.10 * dt);
      if (!this._toldRace && stage.race >= 1) {
        this._toldRace = true;
        this._banner('TIDE RACE', 'Kick with it. Nothing in the loch gets you home faster', 'good');
      }
    }

    if (this.feedback) this.feedback.update(dt, t, stage, this.camera.position, sw, this._raceK);
  }

  /* =================== the caves ===================

     Two numbers a frame, and everything else in the mission reads
     them: which chamber you are under, and how far in. The fog closes,
     the music drops a gear, the sharks stop needing to see you, and
     the compass keeps pointing at a beach you currently cannot swim
     straight up to. */
  _tickCave(dt) {
    if (!this.caves) return;
    const sw = this.swimmer;
    const hit = this.caves.at(sw.pos.x, sw.pos.y, sw.pos.z);
    const was = this._inCave;
    this._inCave = hit ? hit.cave : null;
    this._caveT = U.damp(this._caveT, hit ? hit.t : 0, 3.4, dt);

    /* One announcement per entry, and not one per frame spent hovering
       on the line: the chamber's edge is a hard radius, so a diver
       parked in the doorway would otherwise re-enter it sixty times a
       second. */
    this._caveSaid = Math.max(0, (this._caveSaid || 0) - dt);
    if (this._inCave && this._inCave !== was && this._caveSaid <= 0
        && this.state === 'live' && !this.out) {
      this._caveSaid = 5;
      this.stats.caveTrips++;
      AudioBus.play('dv-cave');
      if (this.music) this.music.stinger('boon');
      this._banner('UNDER THE ROOF',
                   'There is no up in here. The way out is the way in', 'bad');
      this.camKick = Math.min(this.camKick + 0.8, 1.8);
      this.stats.deepestCave = Math.max(this.stats.deepestCave,
                                        Math.round(sw.depth * 10) / 10);
    }
  }

  /* =================== the animals ===================

     The mission's whole half of the contract with predators.js: how
     loud you are, whether you are worth crossing the loch for, and
     what a strike costs. Nothing about the animals themselves is in
     here and nothing about money is in there. */
  _tickSharks(dt) {
    if (!this.sharks) return;
    const sw = this.swimmer;
    const live = this.state === 'live';

    /* ---- noise. Rule two of predators.js, as one line: what gets you
       noticed is exactly what a good run looks like. Four chests, on
       the beat, at full effort, in a cave is the loudest a diver can
       be and it is also the best money in the mission. ---- */
    const noise = 1
                + this.carry.length * 0.26
                + sw.effort * 0.42
                + this._caveT * 0.55
                /* ...and steel. This is the only term that is not about
                   how well the dive is going: a hatch rings whether you
                   are carrying anything or not, which is what makes
                   breaking one a *decision* rather than a bonus on top
                   of a good run. */
                + this._din
                // ...and the flood, which is the loch itself getting louder
                + this.stage.din;

    /* ...and what makes you not worth the swim. A head out of the
       water, feet on the sand, or the first couple of metres under it:
       the shallows are safe, and they are safe *visibly*, so the swim
       home with four chests is a swim towards somewhere nothing
       follows you. */
    // (a pocket is not the shallows: your head is out, but you are
    // twenty metres down in a room with one door and a shark on it)
    const safe = !live || this.out || (sw.up && !this._inPocket) || sw.onFoot
               || (sw.depth < 3.0 && !this._inPocket);

    this.sharks.update(dt, {
      diver: live ? sw.pos : null,
      safe,
      noise,
      fend: this._fend,
      facing: this._facingVec(),
    });
    this._fend = false;

    // the HUD's copy, damped so a shark crossing behind a rock does
    // not strobe the edge of the screen
    this._threat = U.damp(this._threat, safe ? 0 : this.sharks.menace, 5, dt);

    // what the fish are running from
    this._sharkList = this.sharks.sharks;
  }

  /* Where the diver is pointing, pitch and all, as a unit vector. Used
     for one thing: deciding whether a kick was *at* the animal. */
  _facingVec() {
    const sw = this.swimmer;
    const cp = Math.cos(sw.pitch);
    return this._tmpV2.set(Math.sin(sw.yaw) * cp, Math.sin(sw.pitch), Math.cos(sw.yaw) * cp);
  }

  /* Everything an animal can do to a run, in one place.

     A strike never takes the run. It takes air — which at forty metres
     is the same thing said politely — and it knocks one chest out of
     your hands onto the sand, lit, exactly the way a blackout does.
     That second half matters more than the first: it means a shark is
     not a punishment, it is a *transfer*, and the money it costs you
     is money somebody else can go and pick up. In a party that is the
     whole reason to keep one on screen. */
  _onShark(kind, sh) {
    if (kind === 'notice') {
      // one growl per animal per approach, and only when it is close
      // enough to matter: the loch is not a horror film
      if (this._threat < 0.25) AudioBus.play('dv-shark');
      return;
    }
    if (kind === 'charge') {
      AudioBus.play('dv-shark', { close: 1 });
      if (this.music) this.music.stinger('hurt');
      return;
    }
    if (kind === 'fend') {
      this.stats.fended++;
      // turning an animal is the best-timed kick in the mission, and it
      // feeds the chain like one
      this.swimmer.flow = Math.min(1, this.swimmer.flow + 0.35);
      this.swimmer.chainIdle = 0;
      AudioBus.play('dv-fend');
      this.camKick = Math.min(this.camKick + 0.9, 1.8);
      this.fx.rings.fire(this._tmpV.copy(sh.pos), this.camera.quaternion,
                         0.5, 5.0, 0.45, '#bff4ff');
      this.fx.labels.add('OFF!', this._tmpV.copy(sh.pos), { life: 0.8, rise: 4 });
      Input.haptic(20);
      return;
    }
    if (kind !== 'strike') return;
    if (this.state !== 'live' || this.out) return;

    const sw = this.swimmer;
    const st = this.stats;
    st.bites++;
    this.hitStop = 0.14;
    this.shake = Math.min(1.0, this.shake + 0.85);
    this.camKick = Math.min(this.camKick + 1.6, 1.8);
    this.fovKick = Math.max(this.fovKick, 7);
    this._flash(0.4, 'rgba(255,120,120,0.6)');
    AudioBus.play('dv-bite');
    if (this.music) this.music.stinger('hurt');

    // it knocks you off your line as well as out of your breath
    sw.vel.addScaledVector(this._tmpV.copy(sw.pos).sub(sh.pos).setY(0.6).normalize(), 5.5);
    sw.flow = 0;
    this.flowRun = 0;

    const hadHands = this.carry.length > 0;
    sw.air = Math.max(0.02, sw.air - (hadHands ? this.C.biteAir : this.C.biteAirEmpty));

    if (!hadHands) {
      this._banner('HIT', 'It took a lungful and nothing else', 'bad');
      return;
    }

    /* One chest, and it is the one you picked up last — the chest you
       reached one metre too far for is the chest it takes off you. */
    const c = this.carry.pop();
    sw.carried = this.carry.length;
    const worth = Math.round(c.value * this.payout);
    st.lost += worth;
    st.biteLost += worth;

    let x = sw.pos.x, z = sw.pos.z;
    for (let tries = 0; tries < 8; tries++) {
      const a = Math.random() * U.TAU, r = 1.6 + Math.random() * 2.6;
      x = sw.pos.x + Math.cos(a) * r; z = sw.pos.z + Math.sin(a) * r;
      if (this.reef.heightAt(x, z) < -1.2) break;
    }
    const y = Math.max(this.reef.heightAt(x, z) + 0.35, sw.pos.y - 5);
    const nc = this._spawnChest(c.tier, { x, y, z }, { cave: c.cave });
    if (nc) { nc.value = c.value; nc.cave = c.cave; }
    if (this.party) {
      MissionNet.event({ kind: 'drop', tier: c.tier, value: c.value,
                         cave: c.cave ? 1 : 0, x, y, z });
    }
    this._banner('IT TOOK ONE', U.money(worth) + ' on the floor', 'bad');
    this._paintCarry();
  }

  /* Footsteps, measured in metres rather than in seconds, so they land
     with the gait at every speed and a diver stood still makes none.
     A stride in the shallows throws water and one on dry shingle
     throws gravel — the same three lines, twice, and between them they
     are most of why the walk up the beach feels like a walk up a beach
     rather than a camera sliding over a texture. */
  _footfall(dt, sw) {
    if (!sw.onFoot || sw.walkSpeed < 0.6) { this._stepAcc = 0.9; return; }
    this._stepAcc = (this._stepAcc || 0) + sw.walkSpeed * dt;
    const stride = sw.wading ? 1.35 : 1.55;
    if (this._stepAcc < stride) return;
    this._stepAcc = 0;
    const p = sw.pos;
    const pw = U.clamp(sw.walkSpeed / this.swimmer.tune.walkTop, 0.25, 1);
    if (sw.wading) {
      AudioBus.play('dv-splash', { power: 0.24 * pw });
      const y = Water.sampleHeight(p.x, p.z);
      for (let i = 0; i < 9; i++) {
        const a = Math.random() * U.TAU;
        this.fx.sparks.emit(p.x + Math.cos(a) * 0.35, y, p.z + Math.sin(a) * 0.35,
          Math.cos(a) * 2.2 * pw, 1.4 + Math.random() * 2.6 * pw, Math.sin(a) * 2.2 * pw,
          0.13 + Math.random() * 0.18, 0.32 + Math.random() * 0.3,
          DiveMission._SPRAY);
      }
    } else {
      AudioBus.play('dv-shingle', { power: 0.22 * pw });
      this._shingle(p.x, p.y, p.z, 0.22 * pw);
    }
  }

  _bubbles(dt, sw) {
    this._bubbleAcc = (this._bubbleAcc || 0) + dt * (6 + sw.trail * 46);
    const p = sw.pos;
    while (this._bubbleAcc >= 1) {
      this._bubbleAcc -= 1;
      const s = 0.10 + Math.random() * 0.22 * (0.4 + sw.trail);
      this.fx.bubbles.emit(
        p.x + (Math.random() - 0.5) * 1.1,
        p.y + (Math.random() - 0.5) * 0.7,
        p.z + (Math.random() - 0.5) * 1.1,
        (Math.random() - 0.5) * 1.4 - sw.vel.x * 0.12,
        0.4 + Math.random() * 0.8,
        (Math.random() - 0.5) * 1.4 - sw.vel.z * 0.12,
        s, 1.6 + Math.random() * 2.2,
        DiveMission._BUBBLE);
    }
  }

  static _BUBBLE = { r: 0.85, g: 0.98, b: 1.0 };
  static _SPRAY = { r: 0.92, g: 1.0, b: 1.0 };
  static _GRIT = { r: 0.72, g: 0.66, b: 0.56 };

  /* A body crossing the waterline. A ring flat on the sea and a fan of
     droplets thrown up out of it — the ring is what sells it from the
     shore and the droplets are what sell it from inside. `power` is
     roughly how hard: a head easing up is 0.7, a diver arriving off a
     sprinting jump is nearer two. */
  _splash(x, z, power, colour) {
    const y = Water.sampleHeight(x, z);
    this._tmpV.set(x, y + 0.05, z);
    this.fx.rings.fire(this._tmpV, DiveMission._FLAT, 0.4, 3 + power * 7,
                       0.45 + power * 0.25, colour || '#eaffff');
    const n = Math.round(14 + power * 26);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * U.TAU;
      const out = (0.6 + Math.random() * 2.6) * power;
      this.fx.sparks.emit(x + Math.cos(a) * 0.5, y + 0.1, z + Math.sin(a) * 0.5,
        Math.cos(a) * out * 2.2, (1.6 + Math.random() * 4.4) * power, Math.sin(a) * out * 2.2,
        0.16 + Math.random() * 0.26, 0.45 + Math.random() * 0.55,
        DiveMission._SPRAY);
    }
  }

  /* ...and one hitting the beach. Shingle, not water: it goes sideways
     and dies fast, which is the whole difference between gravel and a
     splash in two numbers. */
  _shingle(x, y, z, power) {
    const n = Math.round(8 + power * 16);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * U.TAU;
      this.fx.sparks.emit(x + Math.cos(a) * 0.4, y - 0.3, z + Math.sin(a) * 0.4,
        Math.cos(a) * (1.5 + Math.random() * 3) * power,
        (0.8 + Math.random() * 2.2) * power,
        Math.sin(a) * (1.5 + Math.random() * 3) * power,
        0.12 + Math.random() * 0.18, 0.3 + Math.random() * 0.35,
        DiveMission._GRIT);
    }
  }

  /* -------- the money -------- */

  _tickChests(dt) {
    const sw = this.swimmer;
    const C = this.C;
    const live = this.state === 'live';
    const room = this.carry.length < C.carryMax;
    for (let i = this.chests.length - 1; i >= 0; i--) {
      const c = this.chests[i];
      if (!c.mesh) continue;
      c.phase += dt * (c.dropped ? 2.4 : 1.1);
      // a dropped pile sits on the sand and *glows*, because it is an
      // invitation and everybody at the table has to be able to take it
      const bob = Math.sin(c.phase) * (c.dropped ? 0.18 : 0.09);
      c.mesh.position.y = c.y + bob;
      c.mesh.rotation.y += dt * (c.dropped ? 0.5 : 0.18);
      c.glow.position.y = c.y + 0.4 + bob;
      const pulse = 0.5 + 0.5 * Math.sin(c.phase * 1.7);
      c.glow.material.opacity = (c.dropped ? 0.75 : 0.5) + 0.28 * pulse;
      if (c.far) {
        // held at a readable size on screen, the way the drop marker is
        const fd = this.camera.position.distanceTo(c.far.position);
        c.far.scale.setScalar(U.clamp(1.1 + fd * 0.035, 1.4, 9));
        c.far.material.opacity = (0.30 + 0.30 * pulse) * U.clamp(fd / 14, 0.2, 1);
      }

      // an unconscious diver takes nothing and notices nothing — including
      // the pile they are drifting up through, which is their own
      if (!live || this.out) continue;
      const dx = sw.pos.x - c.x, dy = sw.pos.y - (c.y + 0.3), dz = sw.pos.z - c.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > C.grabRange * C.grabRange) continue;
      if (!room) {
        // swum past a pile you could not carry: half of one agenda card
        if (c.dropped && !c._passed) { c._passed = true; this.stats.passedDrops++; }
        continue;
      }
      this._grab(c);
    }

    this._tickRespawn(dt);
  }

  /* The reef keeps a population, not a queue.

     A tier is short when it has fewer chests in it than it is meant to,
     and it fills the gap on its own clock — the shelf quickly, the
     trench slowly. Counting *every* chest of that tier, dropped piles
     included, is what makes the whole thing conserve: money taken off
     the reef comes back, and money dropped on the floor was never taken
     off it, so it does not. Without that a blackout would mint gold,
     and "the pot is short" would stop meaning anything at all — which
     is the one sentence this mission cannot afford to lose. */
  _tickRespawn(dt) {
    if (this.party && !this.isHost) return;
    const C = this.C;
    const have = C.tiers.map(() => 0);
    let caved = 0;
    for (const c of this.chests) {
      if (c.hoard) continue;                       // a hold's spoils are nobody's population
      if (c.cave) caved++; else have[c.tier]++;
    }
    for (let t = 0; t < C.tiers.length; t++) {
      if (have[t] >= C.tiers[t].chests) { this._tierT[t] = 0; continue; }
      this._tierT[t] += dt;
      if (this._tierT[t] < this._respawnFor(t)) continue;
      this._tierT[t] = 0;
      this._spawnChest(t);
    }
    /* The caves keep their own population on their own clock, and it
       is a slow one — half a minute, so a cleared cave stays cleared
       long enough for the decision to have been worth making.

       Counted apart from the trench, and by exactly the same rule the
       tiers use: everything violet still in the world counts, dropped
       piles included. A cave chest knocked out of somebody's hands by
       a shark is still cave money in the loch, so the ground does not
       replace it — which is what keeps "there was more of it than
       there is now" a sentence about a person rather than about the
       spawner. */
    if (caved < C.cave.chests && this.caves && this.caves.list.length) {
      this._caveT2 = (this._caveT2 || 0) + dt;
      if (this._caveT2 >= C.cave.respawn) {
        this._caveT2 = 0;
        this._spawnChest(C.tiers.length - 1, null, { cave: true });
      }
    } else this._caveT2 = 0;
  }

  _grab(c) {
    // in a party the host decides who got there first; locally the
    // pickup happens now and is rolled back if it turns out it did not,
    // because a hesitation on every grab would ruin the whole feel
    if (this.party && !this.isHost) {
      if (this._claims.has(c.id)) return;
      this._claims.set(c.id, c);
      MissionNet.event({ kind: 'claim', chestId: c.id }, Party.hostId);
    } else if (this.party && this.isHost) {
      MissionNet.event({ kind: 'claimResult', chestId: c.id, playerId: this.meId, ok: true });
    }
    this._takeChest(c);
  }

  _takeChest(c) {
    const sw = this.swimmer;
    c.mult = 1 + this.C.flowMoney * sw.flow;
    /* The clean sweep: a chest taken at speed, without stopping for it.
       Auto-grab means taking one was never a skill; taking one *well*
       now is — plan the line, arrive fast, and it pays and feeds the
       chain. Stopping on top of it and picking it up still works. */
    const sweep = !!sw.speed && sw.speed > this.C.sweepSpeed && !sw.onFoot;
    if (sweep) {
      c.mult *= this.C.sweepMoney;
      sw.flow = Math.min(1, sw.flow + 0.25);
      sw.chainIdle = 0;
      if (this.stats) this.stats.sweeps++;
      if (this.fx) this.fx.labels.add('CLEAN', this._tmpV.copy(sw.pos), { life: 0.7, rise: 3 });
    }
    // ...and the flood, which pays for what it costs
    if (this.stage) c.mult *= this.stage.pay;
    this.carry.push(c);
    this.tripTook++;
    sw.carried = this.carry.length;
    sw.grabbed = true;
    const st = this.stats;
    st.peakCarry = Math.max(st.peakCarry, this.carry.length);
    st.peakCarryValue = Math.max(st.peakCarryValue, this._carryValue());
    /* Told once, at the only moment it is the question in front of you:
       the first time your hands are full and none of it is money yet. */
    if (this.carry.length >= this.C.carryMax && !this._toldShore) {
      this._toldShore = true;
      this._banner('HANDS FULL', 'None of it counts until you are stood in the light', 'good');
    }
    if (c.dropped) st.recovered += Math.round(c.value * this.payout);
    if (c.hoard) {
      /* Out of a hold rather than out of a chamber, so the line is not
         about the roof: there is no door to find, there is just three
         of these on the sand, a shark that heard every blow, and the
         longest swim home in the mission. */
      st.hoardChests++;
      this._banner('OUT OF THE HOLD',
                   U.money(Math.round(c.value * c.mult * this.payout))
                   + ' — and everything down here knows', 'perfect');
      this.hitStop = Math.max(this.hitStop, 0.09);
    } else if (c.cave) {
      st.caveChests++;
      this._banner('CAVE SALVAGE',
                   U.money(Math.round(c.value * c.mult * this.payout))
                   + ' — now find the door', 'perfect');
      this.hitStop = Math.max(this.hitStop, 0.09);
    }

    const colour = c.cave ? this.C.cave.colour : this.C.tiers[c.tier].colour;
    this._tmpV.set(c.x, c.y + 0.6, c.z);
    this.fx.rings.fire(this._tmpV, this.camera.quaternion, 0.6,
                       c.cave ? 6.0 : 4.2, 0.5, colour);
    this.fx.labels.add(U.money(Math.round(c.value * c.mult * this.payout)), this._tmpV,
      { className: (c.cave || c.tier === 2) ? 'gold' : '', life: 1.1, rise: 5 });
    for (let i = 0; i < (c.cave ? 26 : 14); i++) {
      const a = Math.random() * U.TAU;
      this.fx.sparks.emit(c.x, c.y + 0.4, c.z,
        Math.cos(a) * 3, 1 + Math.random() * 3, Math.sin(a) * 3,
        0.28 + Math.random() * 0.3, 0.6 + Math.random() * 0.5,
        DiveMission._SPARK);
    }
    /* Each chest in a carry is a step up the scale, so filling your
       hands is a four-note phrase that resolves — and the fourth note,
       the one that costs you the most air and most nearly drowns you,
       is the one at the top of it. */
    AudioBus.play('dv-grab', { tier: c.tier, n: this.carry.length - 1 });
    if (c.tier === 2 && !c.cave && this.music) this.music.stinger('boon');
    Input.haptic(16);
    this.camKick = Math.min(this.camKick + 0.6 + 0.12 * this.carry.length, 1.8);
    // and the last one lands with a beat of hit-stop on it
    if (this.carry.length >= this.C.carryMax) {
      this.hitStop = 0.11;
      this.fovKick = Math.max(this.fovKick, 4);
    }
    this._removeChest(c);
    this._paintCarry();
  }

  static _SPARK = { r: 1, g: 0.92, b: 0.6 };

  /* Which tier a depth is in. The numbers live in CONFIG and a twist
     may move them, so nothing else in the file is allowed to know that
     the wreck starts at sixteen metres. */
  _tierAt(depth) {
    const t = this.C.tiers;
    const y = -Math.max(0, depth);
    for (let i = 0; i < t.length; i++) if (y > t[i].bottom) return i;
    return t.length - 1;
  }

  _respawnFor(tier) {
    const t = this.C.tiers[tier];
    return (t && t.respawn) || this.C.respawn;
  }

  _carryValue() {
    let v = 0;
    for (const c of this.carry) v += c.value * c.mult;
    return Math.round(v * this.payout);
  }

  /* Surfacing. Everything in your hands turns into money, one chest at
     a time, loudest first — a cascade rather than a number changing,
     because the whole reason to take a fourth chest is this moment. */
  _bank() {
    const list = this.carry.slice();
    this.carry.length = 0;
    this.swimmer.carried = 0;
    if (!list.length) return;

    // Salvage Rights: only the deepest chest of the trip banks at all
    let paying = list;
    if (this.flags.deepestOnly) {
      let best = list[0];
      for (const c of list) if (c.depth > best.depth) best = c;
      paying = [best];
    }

    /* The haul. A trip landed without blacking out makes the next one
       worth a little more, and the number is only ever spent here — so
       the thing you are protecting when you decide not to take a
       fourth chest is not just the four chests. */
    const mult = 1 + this.C.haulStep * Math.min(this.haul, this.C.haulMax);

    /* Cheapest first, so the haul is a *rising* phrase rather than a
       diminuendo. It used to be sorted the other way round, and the
       best moment in the mission was arriving in the wrong order. */
    let total = 0;
    paying.sort((a, b) => a.value - b.value);
    paying.forEach((c, i) => {
      const cash = Math.round(c.value * c.mult * mult * this.payout * this.C.moneyScale);
      total += cash;
      /* Cave salvage and hold spoils are trench chests everywhere
         except on the card, where they are the two columns that say
         where somebody actually went: under a roof, or through a
         door. Kept apart because they are opposite kinds of alibi —
         a cave is a quiet decision and a hold is one the whole loch
         watched somebody make. */
      const id = c.hoard ? 'hold' : c.cave ? 'cave' : this.C.tiers[c.tier].id;
      this.stats.tierBanked[id] = (this.stats.tierBanked[id] || 0) + cash;
      this._throwOnPile(c, i, cash);
    });
    this.money += total;
    if (this.stage && this.stage.id === 'flood') this.stats.floodBanked += total;
    this.haul++;
    this.bestHaul = Math.max(this.bestHaul, this.haul);
    this.stats.bestHaul = this.bestHaul;
    this.stats.landings = (this.stats.landings || 0) + 1;
    /* Only while it is still moving. A banner on every landing for
       three minutes is wallpaper; five of them, each one saying a
       larger number, is a run going well. */
    const steps = Math.min(this.haul, this.C.haulMax);
    if (steps >= 1 && this.haul <= this.C.haulMax) {
      this._banner('HAUL ×' + this.haul,
                   '+' + Math.round(this.C.haulStep * steps * 100) + '% on the next one',
                   steps >= this.C.haulMax ? 'perfect' : 'good');
    }
    this.stats.banked = Math.round(this.money);
    /* "The last minute" has to be a rolling window rather than a test
       against the clock, because The Deep has no clock — and a card
       that reads `lastMinuteBanked === 0` would otherwise be free in
       one mode and a real task in the other. */
    this.bankLog.push({ t: this.elapsed, v: total });

    /* Everything that paid goes on the pile, so a run's story is
       standing on the beach rather than living in a number.

       There is one pile, not three. Every diver's landings go on the
       same heap because they all go in the same pot — a pile that only
       counted your own would be a picture of a number nobody is playing
       for, and the whole point of putting the score in the world is
       that the other two can read it from the water. */
    if (this.party) {
      MissionNet.event({ kind: 'landed',
                         tiers: paying.map(c => DiveMission._packIndex(c)) });
    }
    this._paintCarry();
  }

  /* ---- putting one down ----

     The chest leaves your hands, turns over once in the air and lands
     on the heap. It is a tenth of a second of animation and it is the
     entire reason to have taken a fourth chest: the money arrives as
     four separate physical events with four rising notes under them,
     instead of as a number that used to change all at once while you
     were still walking.

     The spot is reserved at launch rather than at landing, so four
     chests in the air already know they are going to stack. */
  _throwOnPile(chest, i, cash) {
    const sw = this.swimmer;
    const spot = DiveMission._pileSpot(this.pile ? this.pile.n + i : i);
    const L = this.shore.landing;
    const mesh = new THREE.Mesh(this._chestGeo, this._chestMat(chest));
    mesh.position.set(sw.pos.x, sw.pos.y + 0.4, sw.pos.z);
    mesh.rotation.y = Math.random() * U.TAU;
    this.scene.add(mesh);
    this._flying.push({
      mesh, chest, cash, step: i,
      t: -i * 0.13,                       // ...and they go one after another
      dur: 0.38,
      x0: sw.pos.x, y0: sw.pos.y + 0.4, z0: sw.pos.z,
      x1: L.x + spot.x, y1: L.y + spot.y, z1: L.z + spot.z,
      spin: (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 3),
      rot: spot.rot,
    });
  }

  /* Everything in the air, moved on. Called from `_tickPile`, which is
     already the one place the beach is animated from. */
  _tickFlights(dt) {
    if (!this._flying.length) return;
    let landed = 0;
    for (let i = this._flying.length - 1; i >= 0; i--) {
      const f = this._flying[i];
      f.t += dt;
      if (f.t < 0) continue;
      const k = U.clamp(f.t / f.dur, 0, 1);
      f.mesh.position.set(
        U.lerp(f.x0, f.x1, k),
        U.lerp(f.y0, f.y1, k) + Math.sin(k * Math.PI) * (1.5 + k * 0.4),
        U.lerp(f.z0, f.z1, k));
      f.mesh.rotation.y += f.spin * dt;
      f.mesh.rotation.x = Math.sin(k * Math.PI) * 0.8;
      if (k < 1) continue;

      this.scene.remove(f.mesh);
      this._flying.splice(i, 1);
      this._addToPile([f.chest]);
      landed++;
      AudioBus.play('dv-bank', { step: f.step, haul: this.haul });
      this._gain(f.cash);
      this._tmpV.set(f.x1, f.y1 + 0.5, f.z1);
      const cc = f.chest.hoard ? this.C.holds.colour
               : f.chest.cave ? this.C.cave.colour
               : this.C.tiers[f.chest.tier].colour;
      this.fx.rings.fire(this._tmpV, DiveMission._FLAT, 0.3, 3.4 + f.step * 1.1, 0.45, cc);
      this.fx.labels.add('+' + U.money(f.cash), this._tmpV, {
        className: (f.chest.cave || f.chest.hoard || f.chest.tier === 2) ? 'gold' : '',
        life: 1.0, rise: 4,
      });
      for (let s = 0; s < 18; s++) {
        const a = Math.random() * U.TAU;
        this.fx.sparks.emit(f.x1, f.y1 + 0.3, f.z1,
          Math.cos(a) * 4, 1.5 + Math.random() * 5, Math.sin(a) * 4,
          0.24 + Math.random() * 0.35, 0.7 + Math.random() * 0.7,
          DiveMission._SPARK);
      }
      this.camKick = Math.min(this.camKick + 0.35, 1.8);
      Input.haptic(14);
    }
    /* The last one on the heap gets the flourish, and only the last
       one: four flourishes in a row is not four times as good. */
    if (landed && !this._flying.length) {
      const top = this.shore.landing.y + 0.4
                + Math.min(this.pile ? this.pile.n : 0, DiveMission.PILE_CAP) * 0.047;
      this._tmpV.set(this.shore.landing.x, top + 1.0, this.shore.landing.z);
      this.fx.rings.fire(this._tmpV, DiveMission._FLAT, 1.0, 13, 0.75, '#ffd166');
      for (let s = 0; s < 44; s++) {
        const a = Math.random() * U.TAU;
        this.fx.sparks.emit(this._tmpV.x, this._tmpV.y, this._tmpV.z,
          Math.cos(a) * 7, 2 + Math.random() * 7, Math.sin(a) * 7,
          0.3 + Math.random() * 0.4, 0.9 + Math.random() * 0.9,
          DiveMission._SPARK);
      }
      this._flash(0.22, 'rgba(255,225,150,0.85)');
      if (this.music) this.music.stinger('boon');
      this.camKick = Math.min(this.camKick + 0.8, 1.8);
    }
  }

  /* Nothing may be left in the air when the bell goes: the money is
     already in the purse, and a chest frozen two metres over the heap
     is the last thing anybody sees. */
  _landAll() {
    for (const f of this._flying) { f.t = f.dur; }
    this._tickFlights(0);
  }

  _endTrip() {
    this.inTrip = false;
    const st = this.stats;
    st.trips++;
    /* The Deep has no bell, so the thing that ends it has to be you.
       Every trip the surface interval gets a little longer *and the bar
       itself gets shorter* — which is what a night of repeated deep
       dives actually does to a body, and is the only honest way to end
       a mode that never rings. The trench goes out of reach first, then
       the wreck, and eventually one ordinary decision drowns you. */
    if (this.mode === 'deep') {
      const base = Swimmer.TUNE.gaspRefill;
      this.swimmer.tune.gaspRefill = Math.max(base * 0.28,
                                              base * Math.pow(0.955, st.trips));
      this.swimmer.airMax = Math.max(0.28, Math.pow(0.962, st.trips));
    }
    const deep = this.tripDeepest;
    const deepTier = this._tierAt(deep) === this.C.tiers.length - 1;
    if (deepTier) st.trenchTrips++;
    if (this.tripTook === 0) {
      st.emptyTrips++;
      if (deepTier) st.trenchEmpty++;
    }
    this.tripDeepest = 0;
    this.tripTook = 0;
  }

  /* Blacking out. Everything you are holding lands where you are, lit,
     and stays there — it does not decay and it is worth full value to
     whoever picks it up, including the other two. That is the rule the
     entire mission is built backwards from. */
  _blackout() {
    const sw = this.swimmer;
    const st = this.stats;
    st.blackouts++;
    this.hitStop = 0.22;
    this.shake = 1.0;
    this.out = true;
    this.holdT = this.C.blackoutHold;
    /* Decided here, once, rather than tested every frame while the
       body is drifting: did the lights go out under a roof? Only then
       does the wash-out apply, so a blackout in open water twenty
       metres from a cave is not quietly nudged sideways by one. */
    this._washOut = !!(sw.roofed || this._inCave);
    /* And the haul goes with it. That is the whole cost of greed in one
       line: not just the four chests on the sand, but the run you had
       going. It is also the reason a Traitor throwing a dive still
       looks exactly like a Traitor having a bad night. */
    this.haul = 0;
    AudioBus.play('dv-drown');
    if (this.music) this.music.stinger('hurt');
    this._flash(0.55, 'rgba(200,240,255,0.9)');
    this._setCenter('BLACKED OUT', this.carry.length
      ? U.money(this._carryValue()) + ' on the floor' : '', 'bad');

    const dropped = this.carry.slice();
    this.carry.length = 0;
    sw.carried = 0;
    let lost = 0;
    for (const c of dropped) {
      lost += Math.round(c.value * this.payout);
      let x = sw.pos.x, z = sw.pos.z;
      for (let tries = 0; tries < 8; tries++) {
        const a = Math.random() * U.TAU, r = 1.4 + Math.random() * 2.2;
        x = sw.pos.x + Math.cos(a) * r; z = sw.pos.z + Math.sin(a) * r;
        // it falls where you fell, but never up onto the shingle
        if (this.reef.heightAt(x, z) < -1.2) break;
      }
      const y = Math.max(this.reef.heightAt(x, z) + 0.35, sw.pos.y - 4);
      const nc = this._spawnChest(c.tier, { x, y, z }, { cave: c.cave });
      if (nc) { nc.value = c.value; nc.cave = c.cave; }
      if (this.party) {
        MissionNet.event({ kind: 'drop', tier: c.tier, value: c.value,
                           cave: c.cave ? 1 : 0, x, y, z });
      }
    }
    st.lost += lost;
    this._paintCarry();

    // and you float, helpless, for three seconds while they watch
    sw.vel.multiplyScalar(0.2);
    sw.flow = 0;
    if (this.mode === 'deep') this._finish('YOU RAN OUT OF AIR');
  }

  /* Buddy Line: within five metres of another diver you are both
     breathing off the same bar, which makes standing next to somebody a
     decision rather than a coincidence. */
  _buddyAir(dt) {
    const range = this.flags.sharedAir;
    let near = false;
    for (const peer of this.peers.values()) {
      if (!peer.seen) continue;
      if (peer.pos.distanceTo(this.swimmer.pos) <= range) { near = true; break; }
    }
    if (near) this.swimmer.air = Math.min(1, this.swimmer.air + dt * 0.012);
  }

  /* -------- the camera --------
     Cloned from the boat race's chase camera, which is the best feel
     work in the house: a speed dolly, per-axis damping with the
     vertical lagging the horizontal, a look-ahead that opens up as you
     go faster, and two impulse channels that are added to and damped to
     zero rather than being set.

     The one thing deliberately not carried over is the rattle. Shake is
     for impacts; a swimmer who vibrates in open water reads as a bug,
     so it only happens when you hit something or when the lights go
     out. */
  _updateCamera(dt) {
    const sw = this.swimmer;
    const cam = this.camera;
    const sp01 = U.clamp(sw.speed / sw.tune.flowTop, 0, 1.2);

    this.camKick = U.damp(this.camKick, 0, 3.0, dt);
    this.camGasp = U.damp(this.camGasp, 0, 4.0, dt);
    this.fovKick = U.damp(this.fovKick, 0, 4.5, dt);

    /* On the beach the shot is a different shot. A swim camera hangs
       level with a prone body and looks along it; a walk camera has to
       sit over a standing one's shoulder or the whole trip home is
       filmed from a diver's ankles. It is one lerp on the two numbers
       the chase already had, driven by the same `landMix` the body
       stands up on, so the handover happens once and in one place. */
    const land = sw.landMix || 0;
    const dist = U.lerp(4.2, 6.8, U.clamp(sp01, 0, 1)) + this.camKick * 0.55 + land * 1.1;
    const height = U.lerp(1.5, 2.3, U.clamp(sp01, 0, 1)) + this.camGasp * 0.8 + land * 1.5;

    const cp = Math.cos(sw.pitch), sp = Math.sin(sw.pitch);
    const fx = Math.sin(sw.yaw) * cp, fy = sp, fz = Math.cos(sw.yaw) * cp;
    const want = this._tmpV.set(
      sw.pos.x - fx * dist,
      sw.pos.y - fy * dist * 0.7 + height,
      sw.pos.z - fz * dist);

    /* The camera used to be nailed under the surface — "from above, the
       whole mission is a blue rectangle" — and that was true right up
       until the loch got a shore worth looking at. It is also what made
       every gasp a lie: the diver breathed in and the screen stayed
       drowned.

       So the lid lifts with the diver's own head. It is damped rather
       than switched, because a camera that teleports through the
       surface is worse than one that never crosses it, and it only
       lifts as far as the shot already wants to go — the chase camera's
       natural height at the surface is about a metre and a half up, so
       nothing has to be re-framed for the air. */
    this.surfaceMix = U.damp(this.surfaceMix || 0,
                             (sw.up || sw.onLand) ? 1 : 0, 5.5, dt);
    /* ...and it has to go away entirely once you are stood on the
       beach. The shingle at the landing is two and a half metres above
       the loch, so a lid measured off the sea sits *below* a standing
       diver's head: the shot the whole trip home is for — walking up
       into the light with your arms full — was framed from their
       knees. `landMix` is the same number the body stands up on, so
       the lid lifts exactly as the diver does. */
    const wy = Water.sampleHeight(want.x, want.z) - 0.35;
    const lid = wy + this.surfaceMix * 4.2 + land * 60;
    if (want.y > lid) want.y = lid;
    const floor = this.reef.heightAt(want.x, want.z) + 1.1;
    if (want.y < floor) want.y = floor;

    const lam = this.state === 'countdown' ? 3.5 : 7.0;
    this._camPos.x = U.damp(this._camPos.x, want.x, lam, dt);
    this._camPos.y = U.damp(this._camPos.y, want.y, lam * 0.85, dt);
    this._camPos.z = U.damp(this._camPos.z, want.z, lam, dt);
    cam.position.copy(this._camPos);

    const ahead = 6 + sp01 * 11;
    this._camLook.x = U.damp(this._camLook.x, sw.pos.x + fx * ahead, 7.5, dt);
    this._camLook.y = U.damp(this._camLook.y, sw.pos.y + fy * ahead, 6, dt);
    this._camLook.z = U.damp(this._camLook.z, sw.pos.z + fz * ahead, 7.5, dt);

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.2);
      const s = this.shake * this.shake * 0.9;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s;
    }

    cam.lookAt(this._camLook);
    // both terms lean the same way into a turn, which is the one thing
    // the boat race's version of this line has to be read carefully for
    this._camRoll = U.damp(this._camRoll || 0, sw.lean * 0.35 - sw.yawVel * 0.10, 5, dt);
    cam.rotateZ(this._camRoll);

    /* FOV. Speed and the chain open it up; depth closes it. They are
       deliberately opposite so the two read apart — going fast feels
       wide, going deep feels tight, and doing both at once feels like
       exactly what it is. */
    const tight = U.smoothstep(10, 46, sw.depth) * 7;
    const want2 = this.C.baseFov + sp01 * 11 + sw.flow * 5 + this.fovKick - tight;
    cam.fov = U.damp(cam.fov, want2, 7, dt);
    cam.updateProjectionMatrix();
  }

  /* The depth ramp: one lerp through ReefKit.BANDS, driving the scene
     fog, the water's own fog, the caustic strength and the pressure
     vignette together. Both ends of it are bright. */
  _updateDepth(dt) {
    const cam = this.camera.position;
    /* Signed, and measured against the moving sea rather than against
       zero: negative is a lens in the air. The ramp carries straight on
       through the surface into the air band, which is what turns
       breaking the surface into an *event* — the fog opens from twenty
       metres to two and a half thousand, the turquoise goes to sky, the
       caustics go out, and all of it happens in the third of a second
       it takes to cross the waterline. */
    const surf = Water.sampleHeight(cam.x, cam.z);
    const camDepth = surf - cam.y;
    const b = ReefKit.bandAt(camDepth, this._band);
    const fog = this.scene.fog;
    // visibility is a property of the water; it does not dim the air
    /* ...and never past the rim. `maxFogFar` is the furthest any fog
       can reach from anywhere a diver can be and still hide the edge of
       the floor; the bands sit well inside it, and this is what keeps a
       future palette edit from reopening the hole the loch used to have. */
    const far = Math.min(b.far * U.lerp(this.vis, 1, b.air), this._fogCap || Infinity);
    fog.color.lerp(b.colour, 1 - Math.exp(-5 * dt));
    fog.near = U.damp(fog.near, b.near, 5, dt);
    fog.far = U.damp(fog.far, far, 5, dt);
    Water.setFog(fog.near, fog.far * 2.4, fog.color);
    this.reef.setCaustic(U.damp(this.reef.uniforms.caustic.value, b.caustic, 4, dt));
    /* ---- and the roof, which is the only thing in this mission
       allowed to take the light away.

       The file's founding rule is that the water is never dark, and it
       still is not: this closes the fog to a room's worth and drags
       the colour towards the rock, and it only ever happens under a
       lid you chose to swim under. It is *why* a cave is frightening
       and it is bounded by the fact that you can always see the mouth
       you came in by. */
    if (this._caveT > 0.005) {
      const k = this._caveT;
      fog.color.lerp(DiveMission._CAVE_FOG, k * 0.8);
      fog.near = U.lerp(fog.near, 3, k);
      fog.far = U.lerp(fog.far, 46, k);
      Water.setFog(fog.near, fog.far * 2.4, fog.color);
    }

    /* The sea is a different colour depending on which side of it you
       are, and only one shader draws it. Repainting it is two uniform
       writes, and skipping the ones that would not move keeps it off
       the frame budget entirely while you are down. */
    if (Math.abs(b.air - (this._paletteAt === undefined ? -1 : this._paletteAt)) > 0.01) {
      this._paletteAt = b.air;
      Water.setPalette(DiveConditions.paletteFor(b.air));
    }
    /* Above the waterline the sky is the horizon. Below it the *water*
       is, and the sky has to go — see `Sky.setVisible`. The scene's
       background takes over at exactly the fog colour the reef is
       fading into, so where the seabed runs out there is more water
       rather than a bright line. The switch happens within a metre of
       the surface, where the near water plane already fills the upper
       half of the shot, so there is nothing to see it in. */
    const inAir = b.air > 0.35;
    if (inAir !== this._skyOn) {
      this._skyOn = inAir;
      Sky.setVisible(inAir);
    }
    this.scene.background = inAir ? null : fog.color;
    this.air01 = b.air;

    // the vignette is cyan-white, not black: pressure, not darkness
    const el = this.hud.pressure;
    if (el) {
      const air = 1 - this.swimmer.air;
      const v = U.clamp(b.vignette * 0.8 + air * air * 0.75 + this._caveT * 0.35, 0, 1);
      el.style.opacity = v.toFixed(3);
    }
  }

  static _CAVE_FOG = new THREE.Color('#12202c');

  _updateMusic(dt) {
    if (!this.music) return;
    const sw = this.swimmer;
    // surface, then one gear per tier: the arrangement is the depth
    const gear = sw.depth < 3 ? 0 : this._tierAt(sw.depth) + 1;
    if (gear !== this._gear) { this._gear = gear; this.music.setGear(gear, 1.6); }
    /* Air and gold, together. The trip home used to be the quietest
       part of a run and it is the part with the most at stake in it:
       four chests in your hands in open water. Now the score leans on
       you the whole way back, and lets go the moment you put them
       down — which is the release the pile is for. */
    const hands = U.clamp(this.carry.length / this.C.carryMax, 0, 1);
    this.music.setIntensity(0.46 + (1 - sw.air) * 0.7 + hands * 0.34);
    /* The muffle closes over the first two metres, which makes every
       surface break a bright release — sixty times a run, on a loop
       that is thirty seconds long. It is the single best moment in the
       mission and it costs one filter node. */
    const cam = this.camera.position;
    const camY = cam.y - Water.sampleHeight(cam.x, cam.z);
    const want = U.smoothstep(-0.2, -2.5, camY);
    if (Math.abs(want - (this._muffle || 0)) > 0.02) {
      this._muffle = want;
      this.music.setMuffle(want, 0.18);
    }
  }

  /* -------- the HUD -------- */

  _paintHud() {
    const h = this.hud;
    const sw = this.swimmer;
    if (!h) return;

    if (h.money) {
      const gap = this.money - this._moneyShown;
      this._moneyShown = Math.abs(gap) < 1 ? this.money
        : U.damp(this._moneyShown, this.money, 11, this._lastDt || 0.016);
      h.money.textContent = U.money(Math.round(this._moneyShown));
      h.money.classList.toggle('rising', Math.abs(gap) >= 1);
    }

    /* The breath bar: the mission, drawn once. The *cap* is drawn too —
       in The Deep the bar itself shrinks, and a bar that simply stopped
       filling with no explanation would read as a bug. */
    if (h.breathFill) {
      h.breathFill.style.transform = 'scaleX(' + U.clamp(sw.air, 0, 1).toFixed(3) + ')';
      h.breath.classList.toggle('low', sw.air < 0.28);
      h.breath.classList.toggle('critical', sw.air < 0.12);
      if (sw.airMax !== this._shownCap) {
        this._shownCap = sw.airMax;
        h.breath.style.setProperty('--cap', sw.airMax.toFixed(3));
        h.breath.classList.toggle('capped', sw.airMax < 0.995);
      }
    }

    // the beat ring: the entire teaching mechanism for the chain
    if (h.ring && !this.flags.noBeat) {
      const b = this._beat;
      const k = U.clamp(b.sinceBeat / b.spb, 0, 1);
      const near = Math.min(b.sinceBeat, b.spb - b.sinceBeat);
      const hot = near <= sw.tune.window;
      // contracts towards the beat, then snaps open on it
      h.ringPulse.style.transform = 'translate(-50%,-50%) scale(' + (1.45 - k * 0.45).toFixed(3) + ')';
      h.ring.classList.toggle('hot', hot);
      h.ring.classList.toggle('lit', sw.flow > 0.05);
      h.ringPulse.style.opacity = (0.35 + 0.45 * (1 - k)).toFixed(2);
    }

    if (h.chainWrap && h.chain && h.chainBar) {
      h.chainWrap.classList.toggle('on', sw.flow > 0.02);
      h.chain.textContent = '×' + (1 + this.C.flowMoney * sw.flow).toFixed(2);
      h.chainBar.style.width = (sw.flow * 100).toFixed(1) + '%';
      h.chainBar.classList.toggle('full', sw.flow > 0.98);
    }

    if (h.depth) h.depth.textContent = Math.round(sw.depth) + 'm';
    const tierIdx = this._tierAt(sw.depth);
    if (h.tier) {
      /* Under a roof the tape stops reporting the tier and reports the
         roof, because while you are in there the tier is not the thing
         that is about to matter. */
      const T = this.C.tiers[tierIdx];
      const cave = !!this._inCave;
      h.tier.textContent = cave ? this.C.cave.name : T.name;
      h.tier.style.color = cave ? this.C.cave.colour : T.colour;
    }
    if (h.tapeMark) {
      const frac = U.clamp(sw.depth / this.tapeMax, 0, 1);
      h.tapeMark.style.top = (frac * 100).toFixed(1) + '%';
    }

    /* ---- the animal.
       One element and one number. It is a rim rather than a label,
       and it is on the *edges* of the screen rather than the middle,
       because what it has to do is make you turn round — and a warning
       you have to read is a warning you have already been bitten by.
       The word only arrives once it has committed. */
    if (h.threat) {
      const th = this._threat;
      h.threat.style.opacity = th.toFixed(3);
      const say = th > 0.6;
      if (say !== this._threatSaid) {
        this._threatSaid = say;
        h.threat.classList.toggle('near', say);
      }
    }

    if (h.time) {
      h.time.textContent = this.mode === 'deep'
        ? U.clockTime(this.elapsed)
        : Math.ceil(this.timeLeft);
      h.time.classList.toggle('low', this.mode === 'salvage' && this.timeLeft <= 20);
    }
    /* The clock's label is the tide, because the tide is what the
       clock now means: a third of the run is still, a third is the ebb
       and the last third is the flood. */
    if (h.timeLabel && this.stage && this._shownStage !== this.stage.id) {
      this._shownStage = this.stage.id;
      h.timeLabel.textContent = this.stage.name;
      h.timeLabel.classList.toggle('flood', this.stage.id === 'flood');
    }
    /* The compass.

       It used to be "\u2191 shore 42m", which is an instrument reading: it
       tells you the answer to a question nobody was asking. You never
       wanted to know how far away home was, you wanted to know *which
       way*, and a number cannot say that at forty metres in silt with
       the beach behind a hillside.

       So: a needle in a dial, pointing at the drop relative to where
       you are looking, with the ring round it closing as you get
       nearer and going gold the moment you are stood in it. No units,
       no digits, nothing to read \u2014 you glance at it and turn. */
    if (h.compass) {
      const home = this._inDrop();
      const carrying = this.carry.length > 0;
      const show = carrying || sw.depth > 2.5 || this._dropDist() > this.C.dropRange * 2;
      h.compass.classList.toggle('show', show && this.state !== 'finished');
      h.compass.classList.toggle('home', home);
      h.compass.classList.toggle('laden', carrying);
      if (show) {
        const L = this.shore.landing;
        // bearing to the drop, measured against the way the camera is
        // pointing, so "up" on the dial is always "straight ahead"
        const bearing = Math.atan2(L.x - sw.pos.x, L.z - sw.pos.z);
        const vx = this._camLook.x - this.camera.position.x;
        const vz = this._camLook.z - this.camera.position.z;
        const view = (vx * vx + vz * vz) > 1e-6 ? Math.atan2(vx, vz) : sw.yaw;
        const rel = U.wrapAngle(bearing - view);
        // the pivot is baked into the stylesheet; this only ever turns it
        if (h.compNeedle) {
          h.compNeedle.style.transform = 'rotate(' + (rel * 180 / Math.PI).toFixed(1) + 'deg)';
        }
        // the ring closes over the last forty metres: a picture of
        // "nearly there" that never has to be read
        const d = this._dropDist();
        const near = 1 - U.clamp((d - this.C.dropRange) / 46, 0, 1);
        if (h.compRing) h.compRing.style.setProperty('--near', near.toFixed(3));
        if (h.compLbl) h.compLbl.textContent = home ? 'DROP' : (carrying ? 'HOME' : 'SHORE');
      }
    }

    if (h.carryVal) {
      const v = this._carryValue();
      h.carryVal.textContent = v ? U.money(v) : '—';
      h.carryVal.classList.toggle('held', v > 0);
    }

    /* The haul, which only exists on screen while it is worth
       something. It sits under the purse because it is a property of
       the purse, not of the swim. */
    if (h.haul) {
      const on = this.haul > 1;
      h.haul.classList.toggle('on', on);
      if (on) {
        const steps = Math.min(this.haul, this.C.haulMax);
        h.haul.textContent = '×' + (1 + this.C.haulStep * steps).toFixed(2) + ' haul';
        h.haul.classList.toggle('capped', steps >= this.C.haulMax);
      }
    }

    /* Water on the lens. It costs one opacity write and it is the
       single cheapest thing in the file that says "you were just under
       there" — the surface break stops being a fog change and becomes
       something that happened to you. */
    if (h.wet) {
      const w = Math.round(U.clamp(this._wet, 0, 1) * 100) / 100;
      if (w !== this._shownWet) { this._shownWet = w; h.wet.style.opacity = String(w * 0.85); }
    }
  }

  _paintCarry() {
    this._showCarried(this._pack, this.carry.map(c => DiveMission._packIndex(c)));
    if (!this._pips) return;
    for (let i = 0; i < this._pips.length; i++) {
      const c = this.carry[i];
      const el = this._pips[i];
      el.className = c ? 'on' : '';
      el.style.background = c ? this.C.tiers[c.tier].colour : '';
    }
  }

  _gain(amount) {
    const h = this.hud;
    if (!h || !h.gain) return;
    h.gain.textContent = '+' + U.money(amount);
    h.gain.classList.remove('show');
    void h.gain.offsetWidth;
    h.gain.classList.add('show');
    clearTimeout(this._gainT);
    this._gainT = setTimeout(() => h.gain.classList.remove('show'), 1100);
  }

  _flash(amount, color) {
    const f = this.hud.flash;
    if (!f) return;
    f.style.background = color;
    f.style.opacity = String(U.clamp(amount, 0, 0.8));
    clearTimeout(this._flashT);
    this._flashT = setTimeout(() => { f.style.opacity = '0'; }, 90);
  }

  _banner(title, sub, tone) {
    const b = this.hud.banner;
    if (!b) return;
    b.innerHTML = '<b>' + title + '</b>' + (sub ? '<span>' + sub + '</span>' : '');
    b.className = 'dv-banner show' + (tone ? ' ' + tone : '');
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => b.classList.remove('show'), 2400);
  }

  _setCenter(big, small, cls) {
    const c = this.hud.center;
    if (!c) return;
    if (!big && !small) { c.classList.remove('show'); c.innerHTML = ''; return; }
    c.className = 'center-msg show ' + (cls || '');
    c.innerHTML = `<div class="big">${big}</div>`
                + (small ? `<div class="small">${small}</div>` : '');
  }

  _pause() {
    Engine.setPaused(true);
    Input.setMouseAim(false);
    this._aimOn = false;
    document.getElementById('pause-restart').hidden = !!this.party;
    Screens.show('pause');
  }

  /* -------- the ghost --------
     Money against the clock, sampled ten times a second. The dive has
     no racing line to replay, so what a ghost is here is your own
     earning curve — which is the thing you are actually trying to
     beat. */
  _recordGhost(dt) {
    if (this.state !== 'live') return;
    this._recAcc += dt;
    if (this._recAcc < this.C.ghostRate) return;
    this._recAcc = 0;
    this.rec.t.push(U.r3(this.elapsed));
    this.rec.m.push(Math.round(this.money));
    if (this.ghost) {
      const i = Math.min(this.ghost.m.length - 1,
                         Math.floor(this.elapsed / (this.ghost.dt || 0.1)));
      this.ghostDelta = this.money - (this.ghost.m[i] || 0);
    }
  }

  /* =================== the deck's telemetry =================== */

  /* Honest functions over the state they are given, so the tests can
     drive them with a hand-built `this` and never instantiate a
     mission. Everything a card reads is written here or in the events
     above; nothing is computed at the end. */
  _trackAgenda(dt) {
    if (this.state !== 'live') return;
    const st = this.stats;
    st.lastMinuteBanked = this._bankedSince(this.elapsed - 60);
    st.finalCarry = this.carry.length;
    st.finalCarryValue = this._carryValue();
    st.banked = Math.round(this.money);
    let maxD = 0, maxB = 0, maxC = 0, trips = 0;
    for (const peer of this.peers.values()) {
      maxD = Math.max(maxD, peer.deepest || 0);
      maxB = Math.max(maxB, peer.money || 0);
      maxC = Math.max(maxC, peer.value || 0);
      trips += peer.trips || 0;
    }
    st.maxOtherDeepest = maxD;
    st.maxOtherBanked = maxB;
    st.maxOtherPeakCarry = maxC;
    st.otherTrips = trips;
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

  /* =================== three divers =================== */

  _sendPose() {
    const sw = this.swimmer;
    return {
      x: U.r3(sw.pos.x), y: U.r3(sw.pos.y), z: U.r3(sw.pos.z),
      h: U.r3(sw.yaw), p: U.r3(sw.pitch),
      u: U.r3(sw.swimPhase % U.TAU), e: U.r3(sw.effort),
      f: U.r3(sw.flow), a: U.r3(sw.air),
      c: this.carry.length, v: this._carryValue(),
      ct: this.carry.map(c => DiveMission._packIndex(c)),
      m: Math.round(this.money), d: Math.round(this.deepest),
      tr: this.stats.trips,
    };
  }

  _netTick(dt) {
    /* The strip needs a party; the task chip does not. A rehearsal
       deals a card too, and a Traitor who cannot see how their own task
       is going is playing a different game from the one the verdict is
       about to judge. */
    if (!this.party) { this._field(dt); return; }
    MissionNet.pose(dt, () => this._sendPose());
    if (this.isHost) {
      this._netAcc += dt;
      if (this._netAcc >= 0.4) {
        this._netAcc = 0;
        // a full snapshot of what exists, rather than deltas: a dropped
        // packet then costs one late chest instead of a phantom one
        MissionNet.event({ kind: 'reef', state: this.state, chests: this.chests.map(c => ({
          i: c.id, t: c.tier, x: U.r3(c.x), y: U.r3(c.y), z: U.r3(c.z),
          d: c.dropped ? 1 : 0, v: c.value, c: c.cave ? 1 : 0,
          h: c.hoard ? 1 : 0,
        })) });
      }
    }
    this._field(dt);
  }

  _updatePeers(dt, t) {
    if (!this.party) return;
    MissionNet.update(dt);
    for (const [id, peer] of this.peers) {
      const iv = MissionNet.at(id);
      if (!iv) {
        peer.sw.group.visible = false; peer.seen = false;
        Nametag.hide(peer.tag);
        continue;
      }
      const a = iv.a, b = iv.b, k = iv.k;
      peer.seen = true;
      peer.sw.group.visible = true;
      const x = U.lerp(a.x, b.x, k), y = U.lerp(a.y, b.y, k), z = U.lerp(a.z, b.z, k);
      Nametag.show(peer.tag, x, y + 1.4, z, this.camera);
      peer.sw.pos.set(x, y, z);
      peer.sw.yaw = U.angLerp(a.h, b.h, k);
      peer.sw.pitch = U.lerp(a.p || 0, b.p || 0, k);
      peer.sw.swimPhase = b.u || 0;
      peer.sw.effort = U.lerp(a.e || 0, b.e || 0, k);
      peer.sw.flow = b.f || 0;
      peer.sw.carried = b.c || 0;
      this._showCarried(peer.pack, b.ct || null);
      peer.sw.air = b.a === undefined ? 1 : b.a;
      peer.sw.renderPose(dt);
      peer.pos.set(x, y, z);
      peer.air = peer.sw.air;
      peer.carried = b.c || 0;
      peer.value = b.v || 0;
      peer.money = b.m || 0;
      peer.deepest = b.d || 0;
      peer.trips = b.tr || 0;
      this.scores.set(id, b.m || 0);
    }
  }

  /* The strip. It carries what everybody is *holding* as well as what
     they have banked, live — which is what turns circling a greedy
     diver into a real tactic and makes every one of this deck's alibis
     something the other two watched rather than read afterwards. */
  _field(dt) {
    /* Marking the task is a keypress, and a keypress is an edge that
       only exists inside a frame. The strip below is throttled to a few
       times a second, which is fine for a scoreboard and would drop
       most of a button press, so the poll goes above the throttle and
       the drawing stays below it. */
    if (this.agenda) RoomUI.pollMark();
    this._fieldT -= dt;
    if (this._fieldT > 0) return;
    this._fieldT = 0.25;
    if (this.agenda) this._agendaCheckpoint();
 RoomUI.showAgenda();
    if (!this.party) return;

    const mine = Math.round(this.money);
    const rows = [{ playerId: this.meId, name: 'You', m: mine,
                    held: this._carryValue(), air: this.swimmer.air, dim: false }];
    for (const [id, peer] of this.peers) {
      rows.push({ playerId: id, name: peer.name, m: peer.money,
                  held: peer.value, air: peer.air, dim: !peer.seen });
    }
    rows.sort((a, b) => b.m - a.m || String(a.playerId).localeCompare(String(b.playerId)));
    this.stats.topOfField = rows.length > 1
      && rows.every(r => r.playerId === this.meId || mine > r.m);
    RoomUI.showField(rows.map(r => ({
      playerId: r.playerId, name: r.name, dim: r.dim,
      value: U.money(r.m) + (r.held ? '  +' + U.money(r.held) : ''),
      meter: r.air,
    })));
  }

  _onNetEvent(d, from) {
    if (!d) return;
    const authoritative = d.kind === 'reef' || d.kind === 'claimResult';
    if (authoritative && this.isHost) return;
    if (authoritative && !this.isHost && Party.hostId && from !== Party.hostId) return;

    if (d.kind === 'reef') { this._applyReef(d); return; }

    /* Somebody else got theirs ashore. Nothing about the *money* comes
       off this — each client owns its own purse and the field strip
       already carries the numbers — it is purely the heap growing on
       the beach where everyone can see whose run is going well. */
    if (d.kind === 'landed') {
      // slot three is cave salvage and slot four is a hold's: see `_packIndex`
      const last = this.C.tiers.length - 1;
      const tiers = Array.isArray(d.tiers) ? d.tiers : [];
      this._addToPile(tiers
        .filter(t => t >= 0 && t <= this.C.tiers.length + 1)
        .map(t => (t > this.C.tiers.length ? { tier: last, cave: true, hoard: true }
                 : t === this.C.tiers.length ? { tier: last, cave: true }
                 : { tier: t })));
      return;
    }

    if (d.kind === 'drop') {
      // a pile somebody else lost. The host will confirm it on the next
      // snapshot; showing it now is what makes a blackout legible.
      const c = this._spawnChest(d.tier, { x: d.x, y: d.y, z: d.z },
                                 { cave: !!d.cave, hoard: !!d.hoard });
      if (c) { c.value = d.value; c.cave = !!d.cave; c.hoard = !!d.hoard; }
      return;
    }

    /* Somebody put a boot through a hatch on the far side of the reef.
       The door swings on every screen, because a hold that is open is
       the single most useful thing anybody can know about the loch —
       there is money on the sand over there and somebody is standing
       over it. */
    if (d.kind === 'hold') { this._openHoldRemote(d.id | 0); return; }

    if (d.kind === 'claimResult') {
      const mine = this._claims.get(d.chestId);
      if (!mine) return;
      this._claims.delete(d.chestId);
      if (d.playerId === this.meId) return;         // we got it; nothing to undo
      // somebody else was first: give it back, quietly
      const i = this.carry.findIndex(c => c.id === d.chestId);
      if (i >= 0) {
        this.carry.splice(i, 1);
        this.swimmer.carried = this.carry.length;
        this._paintCarry();
        this.fx.labels.add('TAKEN', this._tmpV.copy(this.swimmer.pos),
                           { className: 'bad', life: 0.8, rise: 5 });
      }
      return;
    }

    if (d.kind === 'claim' && this.isHost) {
      const c = this.chests.find(x => x.id === d.chestId);
      const ok = !!c;
      MissionNet.event({ kind: 'claimResult', chestId: d.chestId,
                         playerId: ok ? from : null, ok });
      if (ok) this._removeChest(c);
      return;
    }
  }

  /* A guest spawns anything it has not seen and drops anything that has
     stopped arriving. Spawn-on-sight rather than spawn events, because
     it is self-healing: a guest that misses a message recovers on the
     next snapshot rather than hunting a chest that is not there. */
  _applyReef(d) {
    if (!Array.isArray(d.chests)) return;
    const keep = new Set();
    for (const st of d.chests) {
      keep.add(st.i);
      let c = this.chests.find(x => x.id === st.i);
      if (!c) {
        c = this._spawnChest(st.t, { x: st.x, y: st.y, z: st.z },
                             { cave: !!st.c, hoard: !!st.h });
        if (!c) continue;
        c.id = st.i;
        c.value = st.v;
        c.cave = !!st.c;
        c.hoard = !!st.h;
        c.dropped = !!st.d;
        // never hand out an id the host has already used
        if (st.i >= this._nextChestId) this._nextChestId = st.i + 1;
      }
    }
    for (let i = this.chests.length - 1; i >= 0; i--) {
      const c = this.chests[i];
      // never delete one this client is holding a claim on: the answer
      // to that claim is what decides it
      if (!keep.has(c.id) && !this._claims.has(c.id)) this._removeChest(c);
    }
    if (d.state === 'finished' && this.state === 'live') this._finish('THE BELL');
  }

  /* =================== end states =================== */

  _finish(reason) {
    if (this.state === 'finished') return;
    this.state = 'finished';
    const st = this.stats;
    st.finished = true;
    st.finalCarry = this.carry.length;
    st.finalCarryValue = this._carryValue();
    st.banked = Math.round(this.money);
    st.lastMinuteBanked = this._bankedSince(this.elapsed - 60);
    st.bestHaul = this.bestHaul;
    this._landAll();
    if (this.inTrip) this._endTrip();
    if (this.music) { this.music.setMuffle(0, 0.6); this.music.stop(1.2); this.music = null; }
    Input.setMouseAim(false);
    this._aimOn = false;

    const earned = Math.round(this.money);
    const medal = this._medalFor(earned);
    AudioBus.play('finish');
    this._setCenter(reason || 'THE BELL', U.money(earned), 'go');
    this._confetti();
    this.result = this._buildResult({ completed: true, earned, medal, reason });
    this._reportT = setTimeout(() => this._report(), 2000);
  }

  _bankedSince(t) {
    let v = 0;
    for (const b of this.bankLog) if (b.t >= t) v += b.v;
    return v;
  }

  _medalFor(earned) {
    const par = this.C.par;
    if (earned >= par * 1.6) return 4;
    if (earned >= par) return 3;
    if (earned >= par * 0.66) return 2;
    if (earned >= par * 0.35) return 1;
    return 0;
  }

  _confetti() {
    const p = this.camera.position;
    const cols = ['#ffd166', '#39e6ff', '#7dfcd0', '#ff9f4a', '#ffffff'];
    for (let i = 0; i < 180; i++) {
      const a = Math.random() * U.TAU, sp = 3 + Math.random() * 12;
      this.fx.sparks.emit(
        p.x + (Math.random() - 0.5) * 6, p.y + Math.random() * 4, p.z + (Math.random() - 0.5) * 6,
        Math.cos(a) * sp, 2 + Math.random() * 8, Math.sin(a) * sp,
        0.3 + Math.random() * 0.5, 1.4 + Math.random() * 1.2,
        new THREE.Color(cols[(Math.random() * cols.length) | 0]));
    }
  }

  _buildResult(part) {
    const st = this.stats;
    return Object.assign({
      mode: this.mode,
      modeName: this.modeDef.name,
      seed: this.seed,
      courseName: this.reefName,
      conditionText: DiveConditions.describe(this.cond),
      modId: this.opts.modId,
      modName: this.twist ? this.twist.name : null,
      payout: this.payout,
      key: this.key,
      elapsed: this.elapsed,
      par: this.C.par,
      deepest: st.deepest,
      trips: st.trips,
      emptyTrips: st.emptyTrips,
      blackouts: st.blackouts,
      lost: st.lost,
      recovered: st.recovered,
      peakCarry: st.peakCarry,
      peakCarryValue: st.peakCarryValue,
      strokes: st.strokes,
      onBeat: st.onBeat,
      beatPct: st.strokes ? st.onBeat / st.strokes : 0,
      bestFlowRun: st.bestFlowRun,
      landings: st.landings,
      bestHaul: st.bestHaul,
      tierBanked: st.tierBanked,
      caveTrips: st.caveTrips,
      caveChests: st.caveChests,
      holdsOpened: st.holdsOpened,
      holdHits: st.holdHits,
      deepestHold: st.deepestHold,
      bites: st.bites,
      fended: st.fended,
      biteLost: st.biteLost,
      landed: this.pile ? this.pile.n : 0,
      stats: Object.assign({}, st),
    }, part);
  }

  _report() {
    if (this.reported || !this.result) return;
    this.reported = true;
    const r = this.result;
    const { isBest } = GameState.recordRun('dive', this.key, r, this.modeDef.better);
    r.courseBest = isBest;
    r.ghostDelta = this.ghost && this.ghostDelta !== null ? this.ghostDelta : null;
    if (isBest && this.rec.m.length > 3) {
      GameState.saveGhost('dive', this.key, {
        dt: this.C.ghostRate, t: this.rec.t, m: this.rec.m, earned: r.earned,
      });
    }
    Missions.complete(r);
  }
}


/* ==================================================================
   The dive's own noises. Everything here is water: nothing has a hard
   attack, and every one of them is filtered, because a dry click forty
   metres down is the fastest way to take somebody out of the loch.
   ================================================================== */

AudioBus.define('dv-stroke', (c, dest, o = {}) => {
  const t = c.currentTime;
  const n = AudioBus.noiseSource();
  if (!n) return;
  const f = c.createBiquadFilter(), g = c.createGain();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(260, t);
  f.frequency.exponentialRampToValueAtTime(900 + 600 * (o.power || 0.5), t + 0.16);
  f.Q.value = 0.8;
  n.connect(f); f.connect(g); g.connect(dest);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.10 + 0.08 * (o.power || 0.5), t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.30);
  n.start(t); n.stop(t + 0.34);
});

AudioBus.define('dv-grab', (c, dest, o = {}) => {
  const t = c.currentTime;
  /* The tier picks the register and the chest in your hands picks the
     degree, so a full carry off the trench is a rising figure that
     ends high. Pentatonic on purpose: there is no wrong order to pick
     four chests up in, so there must be no wrong note. */
  const STEP = [1, 9 / 8, 4 / 3, 3 / 2, 5 / 3, 2];
  const base = [392, 523.25, 784][U.clamp(o.tier | 0, 0, 2)]
             * STEP[U.clamp(o.n | 0, 0, 5)];
  [1, 1.5].forEach((m, i) => {
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(base * m, t + i * 0.05);
    osc.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0.0001, t + i * 0.05);
    g.gain.exponentialRampToValueAtTime(0.13, t + i * 0.05 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.05 + 0.55);
    osc.start(t + i * 0.05); osc.stop(t + i * 0.05 + 0.6);
  });
});

/* A chest landing on the heap. Two voices a fifth apart with a knock
   under them, because a box of salvage hitting a box of salvage is a
   thump before it is a chime — and the whole figure climbs a step for
   every trip you have landed in a row, so a run going well is audibly
   in a higher key than the one that started it. */
AudioBus.define('dv-bank', (c, dest, o = {}) => {
  const t = c.currentTime;
  const step = U.clamp(o.step | 0, 0, 5);
  const lift = Math.pow(2, U.clamp(o.haul | 0, 0, 6) / 12);
  const f = [659.25, 783.99, 987.77, 1174.66, 1318.5, 1567.98][step] * lift;
  [[1, 0.16, 0.7], [1.5, 0.07, 0.5]].forEach(([m, amp, tail], i) => {
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = i ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(f * m, t);
    osc.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + tail);
    osc.start(t); osc.stop(t + tail + 0.1);
  });
  // the wood
  const k = c.createOscillator(), kg = c.createGain(), kf = c.createBiquadFilter();
  k.type = 'triangle';
  k.frequency.setValueAtTime(190, t);
  k.frequency.exponentialRampToValueAtTime(78, t + 0.09);
  kf.type = 'lowpass'; kf.frequency.value = 1200;
  k.connect(kf); kf.connect(kg); kg.connect(dest);
  kg.gain.setValueAtTime(0.0001, t);
  kg.gain.exponentialRampToValueAtTime(0.11, t + 0.006);
  kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  k.start(t); k.stop(t + 0.22);
});

/* Hitting the water from the air. Broadband, fast, and *bright* at the
   front — the one moment in the mission where the muffle has not
   closed yet, so it gets to be the loudest thing you hear. */
AudioBus.define('dv-splash', (c, dest, o = {}) => {
  const t = c.currentTime;
  const p = U.clamp(o.power === undefined ? 1 : o.power, 0.2, 2);
  const n = AudioBus.noiseSource();
  if (!n) return;
  const f = c.createBiquadFilter(), g = c.createGain();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(1800 + 900 * p, t);
  f.frequency.exponentialRampToValueAtTime(220, t + 0.42);
  f.Q.value = 0.7;
  n.connect(f); f.connect(g); g.connect(dest);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.10 + 0.14 * p, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
  n.start(t); n.stop(t + 0.6);
  // the body of it, under the spray
  const o2 = c.createOscillator(), g2 = c.createGain();
  o2.type = 'sine';
  o2.frequency.setValueAtTime(150, t);
  o2.frequency.exponentialRampToValueAtTime(48, t + 0.3);
  o2.connect(g2); g2.connect(dest);
  g2.gain.setValueAtTime(0.0001, t);
  g2.gain.exponentialRampToValueAtTime(0.09 * p, t + 0.02);
  g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  o2.start(t); o2.stop(t + 0.45);
});

/* Shingle. Short, dry, high — deliberately the only sound in the whole
   mission with no water in it, because that is exactly what arriving
   on the beach is meant to feel like. */
AudioBus.define('dv-shingle', (c, dest, o = {}) => {
  const t = c.currentTime;
  const p = U.clamp(o.power === undefined ? 1 : o.power, 0.2, 1.4);
  const n = AudioBus.noiseSource();
  if (!n) return;
  const f = c.createBiquadFilter(), g = c.createGain();
  f.type = 'highpass';
  f.frequency.setValueAtTime(1400, t);
  n.connect(f); f.connect(g); g.connect(dest);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.07 + 0.07 * p, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16 + 0.1 * p);
  n.start(t); n.stop(t + 0.3);
});

/* Arriving in a tier. One low bell that gets lower and longer the
   deeper the tier is, so the trench announces itself as a room rather
   than as a number changing on a tape. */
AudioBus.define('dv-tier', (c, dest, o = {}) => {
  const t = c.currentTime;
  const i = U.clamp(o.tier | 0, 0, 2);
  const f = [261.63, 196, 130.81][i];
  const tail = 1.1 + i * 0.7;
  [1, 2, 3].forEach((m, k) => {
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f * m, t);
    osc.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11 / (k + 1), t + 0.03 + k * 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + tail);
    osc.start(t); osc.stop(t + tail + 0.1);
  });
});

/* The one sound in the mission that is *air*, and it is deliberately
   the brightest thing in the mix: after thirty seconds of lowpassed
   everything, a lungful is a release. */
AudioBus.define('dv-gasp', (c, dest) => {
  const t = c.currentTime;
  const n = AudioBus.noiseSource();
  if (!n) return;
  const f = c.createBiquadFilter(), g = c.createGain();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(500, t);
  f.frequency.exponentialRampToValueAtTime(2400, t + 0.22);
  f.Q.value = 1.2;
  n.connect(f); f.connect(g); g.connect(dest);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.22, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
  n.start(t); n.stop(t + 0.6);
});

AudioBus.define('dv-drown', (c, dest) => {
  const t = c.currentTime;
  const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
  o.type = 'sine';
  o.frequency.setValueAtTime(180, t);
  o.frequency.exponentialRampToValueAtTime(38, t + 1.5);
  f.type = 'lowpass';
  f.frequency.setValueAtTime(900, t);
  f.frequency.exponentialRampToValueAtTime(120, t + 1.4);
  o.connect(f); f.connect(g); g.connect(dest);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.30, t + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
  o.start(t); o.stop(t + 1.8);
  const n = AudioBus.noiseSource();
  if (!n) return;
  const nf = c.createBiquadFilter(), ng = c.createGain();
  nf.type = 'lowpass'; nf.frequency.value = 700;
  n.connect(nf); nf.connect(ng); ng.connect(dest);
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.14, t + 0.10);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
  n.start(t); n.stop(t + 1.3);
});

/* Something big, moving. Not a roar and not a sting: a low swell that
   rises and goes past, which is the only honest noise a large animal
   makes in water. `close` opens the filter and drops the pitch, so the
   same sound is a rumour at thirty metres and a fact at five. */
AudioBus.define('dv-shark', (c, dest, o = {}) => {
  const t = c.currentTime;
  const close = U.clamp(o.close || 0, 0, 1);
  const osc = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(44 - close * 12, t);
  osc.frequency.exponentialRampToValueAtTime(30 - close * 10, t + 1.1);
  f.type = 'lowpass';
  f.frequency.setValueAtTime(140 + close * 260, t);
  f.frequency.exponentialRampToValueAtTime(70, t + 1.2);
  f.Q.value = 2.2;
  osc.connect(f); f.connect(g); g.connect(dest);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.10 + 0.16 * close, t + 0.28);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
  osc.start(t); osc.stop(t + 1.4);
  // the water it is pushing in front of it
  const n = AudioBus.noiseSource();
  if (!n) return;
  const nf = c.createBiquadFilter(), ng = c.createGain();
  nf.type = 'bandpass';
  nf.frequency.setValueAtTime(180, t);
  nf.frequency.exponentialRampToValueAtTime(520 + close * 500, t + 0.7);
  nf.Q.value = 0.6;
  n.connect(nf); nf.connect(ng); ng.connect(dest);
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.05 + 0.07 * close, t + 0.35);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
  n.start(t); n.stop(t + 1.2);
});

/* The strike. The only genuinely hard attack in the mission, and it is
   allowed to be, because it is the only thing down here that happens
   *to* you rather than because of you. */
AudioBus.define('dv-bite', (c, dest) => {
  const t = c.currentTime;
  const n = AudioBus.noiseSource();
  if (n) {
    const f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(140, t + 0.30);
    f.Q.value = 0.9;
    n.connect(f); f.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.30, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    n.start(t); n.stop(t + 0.5);
  }
  const o = c.createOscillator(), g2 = c.createGain(), f2 = c.createBiquadFilter();
  o.type = 'square';
  o.frequency.setValueAtTime(96, t);
  o.frequency.exponentialRampToValueAtTime(34, t + 0.26);
  f2.type = 'lowpass'; f2.frequency.value = 420;
  o.connect(f2); f2.connect(g2); g2.connect(dest);
  g2.gain.setValueAtTime(0.0001, t);
  g2.gain.exponentialRampToValueAtTime(0.26, t + 0.01);
  g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.40);
  o.start(t); o.stop(t + 0.45);
});

/* A kick landing on two hundred kilos of fish. It is the only
   *victorious* noise in the mission that is not money, so it goes up
   rather than down. */
AudioBus.define('dv-fend', (c, dest) => {
  const t = c.currentTime;
  const n = AudioBus.noiseSource();
  if (n) {
    const f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(1700, t + 0.24);
    f.Q.value = 1.1;
    n.connect(f); f.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    n.start(t); n.stop(t + 0.4);
  }
  [523.25, 784].forEach((f, i) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t + i * 0.06);
    o.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0.0001, t + i * 0.06);
    g.gain.exponentialRampToValueAtTime(0.10, t + i * 0.06 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.06 + 0.34);
    o.start(t + i * 0.06); o.stop(t + i * 0.06 + 0.4);
  });
});

/* A boot landing on a hatch. The loudest thing in the mission and the
   only one that is not made of water: a low clang with a long metal
   tail on it, tuned a step higher each time so four blows are a phrase
   that is obviously going somewhere. `n` is which blow this is.

   It is deliberately ugly next to everything else down here. The whole
   argument of a hold is that you cannot do it discreetly, and a sound
   that fits the mix would be a sound that lets you. */
AudioBus.define('dv-prise', (c, dest, o = {}) => {
  const t = c.currentTime;
  const n = U.clamp((o.n | 0), 0, 5);
  const base = 116 * Math.pow(2, n / 12);

  // the blow: a filtered noise burst, short and hard
  const ns = AudioBus.noiseSource();
  if (ns) {
    const f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(1500, t);
    f.frequency.exponentialRampToValueAtTime(300, t + 0.12);
    f.Q.value = 0.8;
    ns.connect(f); f.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.30, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    ns.start(t); ns.stop(t + 0.26);
  }
  // ...and the plate ringing after it, which is the part that carries
  [1, 2.76, 5.4].forEach((mult, i) => {
    const os = c.createOscillator(), g = c.createGain();
    os.type = i ? 'sine' : 'triangle';
    os.frequency.setValueAtTime(base * mult, t);
    os.frequency.exponentialRampToValueAtTime(base * mult * 0.97, t + 0.7);
    os.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.20 / (i + 1.4), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.62 - i * 0.14);
    os.start(t); os.stop(t + 0.75);
  });
});

/* And the hatch going. The clang resolved: the same plate, an octave
   up, opening into the only major chord in the mission — because this
   is the one moment down here that is unambiguously good news, and it
   is immediately the worst position anybody has been in all run. */
AudioBus.define('dv-hold', (c, dest) => {
  const t = c.currentTime;
  const ns = AudioBus.noiseSource();
  if (ns) {
    const f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(2400, t);
    f.frequency.exponentialRampToValueAtTime(220, t + 0.5);
    f.Q.value = 0.7;
    ns.connect(f); f.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.34, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
    ns.start(t); ns.stop(t + 0.7);
  }
  [174.61, 261.63, 349.23, 523.25].forEach((f, i) => {
    const os = c.createOscillator(), g = c.createGain();
    os.type = i > 1 ? 'triangle' : 'sine';
    os.frequency.setValueAtTime(f, t + i * 0.045);
    os.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0.0001, t + i * 0.045);
    g.gain.exponentialRampToValueAtTime(0.16, t + i * 0.045 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.045 + 1.0);
    os.start(t + i * 0.045); os.stop(t + i * 0.045 + 1.1);
  });
});

/* Crossing under the lip of a cave. A room tone: the same note the
   trench arrives on, an octave down, with the top taken off it —
   which is what a ceiling does to sound and what this mission has
   spent three minutes teaching you to hear as *deeper*. */
AudioBus.define('dv-cave', (c, dest) => {
  const t = c.currentTime;
  [65.4, 98, 130.81].forEach((f, i) => {
    const o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
    o.type = i ? 'sine' : 'triangle';
    o.frequency.setValueAtTime(f, t);
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(200, t + 1.8);
    o.connect(lp); lp.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.13 / (i + 1), t + 0.12 + i * 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    o.start(t); o.stop(t + 2.5);
  });
});

AudioBus.define('dv-bump', (c, dest) => {
  const t = c.currentTime;
  const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
  o.type = 'triangle';
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(52, t + 0.20);
  f.type = 'lowpass'; f.frequency.value = 600;
  o.connect(f); f.connect(g); g.connect(dest);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.30);
  o.start(t); o.stop(t + 0.35);
});


/* ---- register with the game ---- */
Missions.register({
  id: 'dive',
  name: 'The Dive',
  tagline: 'Walk it into the light and it is yours. Black out and it is anybody’s.',
  description:
    'A sunlit highland sea loch: a coral shelf, a broken trawler on the slope, a trench '
    + 'past it, and three rock caves cut into the deep water that are worth three times '
    + 'the trench and have a roof on them. There are sharks, they notice noise and gold, '
    + 'and a kick in the face turns one round. '
    + 'There is one lit ring on the shingle, you can see it from the bottom of the trench, '
    + 'and nothing you take is money until you are stood inside it. So every trip is the '
    + 'same round: dive, fill your hands, climb, swim home, wade in, and walk it up the '
    + 'beach past two people watching. Three minutes, one breath at a time. Black out and '
    + 'every chest in your hands drops where you are and lies there, lit, for anybody to '
    + 'take. One button does everything: in the water it is a kick, on the sand it is a '
    + 'jump, and in the water it has a beat — land it in the window and you swim faster, '
    + 'breathe cheaper and get paid more. Land trip after trip without drowning and the '
    + 'haul pays more every time, which is exactly what makes the next one harder to '
    + 'walk away from. And the tide turns twice: the ebb opens tide races along the floor '
    + 'that carry you home and leaves air under every cave roof; the flood takes the air '
    + 'back and pays a third more for everything.',
  icon: '03',
  maxPrize: 96000,
  players: '1-3',
  duration: '3 min',
  order: 2,
  setup: true,
  hudScreen: 'hud-dive',
  setupLabels: { course: 'Loch', modifier: 'Tide' },
  preview: (opts) => DiveMission.preview(opts),
  modes: DiveMission.MODES,
  medals: DiveMission.MEDALS,
  create: (opts) => new DiveMission(opts),
  better: (a, b) => (a.earned || 0) > (b.earned || 0),

  tips: [
    '<b>One button.</b> <kbd>Space</kbd> is a kick. It is a shaped burst and then a long '
      + 'glide, and the glide is where you steer — so the good players stroke less often '
      + 'than you would think.',
    '<b>Swim on the beat.</b> There is a ring in the middle of the screen that tightens to '
      + 'the music. Kick as it closes and the stroke chains: faster, cheaper in air, and '
      + 'every chest you take while it is lit is worth up to half again.',
    '<b>Going down is free.</b> Past about twenty metres the water stops holding you up '
      + 'and you fall. Stop kicking and save the air for the climb — the climb is the '
      + 'expensive half of every dive.',
    '<b>Four is a decision.</b> Every chest in your hands costs drag, air and a longer '
      + 'kick, and pulls you down. The fourth one is the one that drowns people.',
    '<b>The ring is the bank.</b> Surfacing keeps you alive; it does not keep the gold. '
      + 'Nothing counts until you are stood in the lit ring on the shingle with it, and '
      + 'the walk up the beach is the part everybody watches.',
    '<b>Follow the compass, not the coast.</b> The needle by your hands points at the '
      + 'ring, and its dial closes as you get near. Come ashore anywhere else and you '
      + 'have a long walk along a beach carrying boxes.',
    '<b>You walk out of the water.</b> Your feet find the bottom on their own in the '
      + 'shallows and the same button becomes a jump — so run down the shingle and dive '
      + 'back in rather than wading out.',
    '<b>Gold is heavy on land too.</b> A full carry walks at half speed. The trip up the '
      + 'beach is the slowest part of a rich trip and the fastest part of a poor one.',
    '<b>The way home is along the floor.</b> The surface runs a chop that gets worse all '
      + 'run. Three tide races run shoreward along the bottom — chevrons on the sand and '
      + 'silt streaming over them. Kick down one and nothing is faster; it is also the '
      + 'whole way home under water, on the breath you came up with.',
    '<b>The tide turns twice.</b> Still water first: learn the reef. Then the ebb: the races '
      + 'open and every cave holds a pocket of air under its roof. Then the flood: the '
      + 'pockets go, and every chest is worth a third again.',
    '<b>Breathe under the roof.</b> During the ebb the middle of every cave has air in it — '
      + 'you can see the shimmer from the door. Come up into it and you breathe. When the '
      + 'flood comes in, it is gone, whoever is in there.',
    '<b>Hold the kick to streamline.</b> Tap <kbd>Space</kbd> to stroke; hold it and you '
      + 'lock out — no thrust, a fraction of the drag. Hold the line, then break it for a '
      + 'stroke on the beat.',
    '<b>Pull back to brake.</b> <kbd>S</kbd> flares: you stop hard and turn sharp. It costs '
      + 'a little air. It is what a cave mouth and a hatch are for.',
    '<b>Take them without stopping.</b> A chest taken at speed is a clean sweep: it pays a '
      + 'fifth more and feeds the chain. Plan the line through the tier.',
    '<b>The haul is the real score.</b> Every trip you land without blacking out makes '
      + 'the next one worth more, up to a fifth again. Drowning does not just cost you '
      + 'what is in your hands, it costs you the run you had going.',
    '<b>Blacking out does not end the run.</b> It drops everything you were holding on the '
      + 'floor, lit, where anybody can take it — and floats you helplessly for three '
      + 'seconds while they do.',
    '<b>The trench pays fourteen times the shelf.</b> It is also the only tier you cannot '
      + 'reach and return from unless you are swimming well.',
    '<b>The caves have no up in them.</b> Violet salvage is worth three trench chests, and '
      + 'it is under a rock lid: you cannot float out, you have to swim out of the mouth '
      + 'you came in by. Black out in there and your body washes out on its own — slowly, '
      + 'in front of everybody.',
    '<b>Look for the violet lights.</b> Every cave mouth in the loch has one hanging over '
      + 'it and every sealed hold has one on it, and neither of them cares about fog, '
      + 'depth or rock. If you are wondering where the money is, it is under a light.',
    '<b>Break into the holds.</b> Each wreck on the slope has a hatch bolted to her side. '
      + 'It does not open because you swam to it — you kick it in, four times, and each '
      + 'blow costs air and rings across the whole loch. Three chests come out at once, '
      + 'and there is always something living on the hatch.',
    '<b>You cannot rob a wreck quietly.</b> Kicking steel makes you the loudest thing in '
      + 'the water whether your hands are full or empty, and every animal that can hear '
      + 'it turns round. A hold is a plan, not an opportunity.',
    '<b>Sharks hear what you are winning.</b> Thrashing and a full carry get you noticed '
      + 'from twice as far, and they will follow you out of a cave. They will not follow '
      + 'you into the shallows.',
    '<b>Kick at it.</b> There is no second button. A stroke landed inside touching '
      + 'distance, pointed at the animal, turns it away — so the answer to a shark is to '
      + 'swim straight at it, and the answer to two is not to be down there.',
    '<b>A bite is not a death.</b> It costs you a lungful and the last chest you picked '
      + 'up, which drops on the sand, lit, for anybody. What kills you is being forty '
      + 'metres down afterwards.',
    '<b>Somebody else’s pile is worth full price.</b> If you see a glow on the sand '
      + 'that you did not put there, that is a diver who got greedy.',
    '<b>The lamp on the beach is north.</b> The ring, the column of light over it and the '
      + 'mark above that are the only warm things in the loch, and none of them care how '
      + 'deep you are or how thick the water is. If you can see it, you know the way home.',
  ],
  keys: ['<kbd>Space</kbd> kick / jump', 'hold <kbd>Space</kbd> streamline',
         '<kbd>Mouse</kbd> steer', '<kbd>S</kbd> brake',
         '<kbd>W</kbd><kbd>A</kbd><kbd>D</kbd> scull / walk'],

  /* The columns the boat argues about afterwards. Every card in this
     deck moves one of these, and every card's alibi moves another the
     other way — which is why "lost on the floor" and "deepest" are
     both on it. A big number in the first column beside the biggest
     number in the fourth is the best diving anybody did all night.
     Beside a small one it is a conversation. */
  report: (r) => {
    const st = r.stats || {};
    return {
      earned: r.earned,
      completed: r.completed,
      columns: ['Money', 'On the floor', 'Recovered', 'Deepest', 'Trips',
                'Empty', 'Blackouts', 'Biggest carry'],
      cells: [
        U.money(r.earned || 0),
        U.money(st.lost || 0),
        U.money(st.recovered || 0),
        Math.round(st.deepest || 0) + 'm',
        String(st.trips || 0),
        String(st.emptyTrips || 0),
        String(st.blackouts || 0),
        U.money(st.peakCarryValue || 0),
      ],
      stats: st,
    };
  },

  resultRows: (r) => {
    const rows = [
      ['Trips', String(r.trips)],
      ['Deepest', Math.round(r.deepest) + ' m'],
      ['On the beat', `${Math.round((r.beatPct || 0) * 100)}% of ${r.strokes} strokes`],
      ['Longest chain', String(r.bestFlowRun || 0) + ' strokes'],
      ['Biggest carry', `${r.peakCarry} chests · ${U.money(r.peakCarryValue || 0)}`],
      ['Longest haul', (r.bestHaul || 0) + ' trips landed in a row'],
    ];
    const tb = r.tierBanked || {};
    rows.push(null,
      ['Shelf', U.money(tb.shelf || 0)],
      ['Wreck', U.money(tb.wreck || 0)],
      ['Trench', U.money(tb.trench || 0)]);
    // the caves and the animals only appear on a card that earned them
    if (tb.cave) rows.push(['Caves', U.money(tb.cave)]);
    if (tb.hold) rows.push(['Holds', U.money(tb.hold)]);
    if (r.caveTrips) rows.push(['Went under a roof', String(r.caveTrips) + '×']);
    if (r.holdsOpened) rows.push(['Broke into a hold', String(r.holdsOpened) + '×'
                                  + (r.deepestHold ? ' · deepest ' + r.deepestHold + 'm' : '')]);
    else if (r.holdHits) rows.push(['Kicked a hatch and walked away',
                                    String(r.holdHits) + ' blow'
                                    + (r.holdHits === 1 ? '' : 's')]);
    if (r.landed) rows.push(['Landed on the pile', String(r.landed) + ' chest'
                             + (r.landed === 1 ? '' : 's')]);
    if (r.blackouts) rows.push(['Blacked out', String(r.blackouts) + '×']);
    if (r.bites) rows.push(['Bitten', String(r.bites) + '× · ' + U.money(r.biteLost || 0)
                            + ' taken off you']);
    if (r.fended) rows.push(['Kicked one off', String(r.fended) + '×']);
    if (r.lost) rows.push(['Left on the floor', U.money(r.lost)]);
    if (r.recovered) rows.push(['Taken off the floor', U.money(r.recovered)]);
    if (r.payout && Math.abs(r.payout - 1) > 0.005) {
      const why = [r.conditionText, r.modName].filter(Boolean).join(' · ');
      rows.push([`Conditions ×${r.payout.toFixed(2)}`, why]);
    }
    return rows;
  },
});

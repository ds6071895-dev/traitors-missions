/* ------------------------------------------------------------------
   shootout.js — Mission 02: Shootout.

   You stand on a hunter's stand in a clearing with a bow that draws in
   half a second, and the wood sends things past you in waves. Ten
   rounds, each with its own rule, ending with something large and
   annoyed.

   The three things that make a run:

   - The half second. Full draw at 0.50s, and a short window after it
     where the loose is *clean*: worth half again as much, and the arrow
     carries on through whatever it hits. Everything else in the design
     is arranged so that window is the interesting decision.
   - The chain. Every hit raises the multiplier; a miss, a dove or four
     quiet seconds drop it. So the correct play is always to keep
     shooting, which is also the fun one.
   - The draw of the run. The seed picks the wood, the weather, which
     rounds you get and in what order, and the hand of three twist cards
     you choose one of. Two runs are only the same run if you asked.
------------------------------------------------------------------ */
class ShootoutMission {

  static _UP = new THREE.Vector3(0, 1, 0);

  static CONFIG = {
    seed: 20260829,           // only a fallback; a run brings its own

    // scoring
    moneyPerPoint: 0.6,       // £ per point of quarry — the one dial that
                              // keeps a great run here worth about what a
                              // great run in the boat race is worth
    moneyScale: 1,            // reserved for twists that change the payout
    chainStep: 0.25,          // per link
    chainCap: 16,             // so the multiplier tops out at x5
    chainWindow: 4.0,         // seconds before the chain goes cold
    cleanBonus: 1.5,          // what a clean loose multiplies a kill by
    longShotFrom: 80,         // metres past which distance starts paying
    longShotPer: 0.006,       // extra multiplier per metre past that
    doveCost: 400,
    doveTime: 2.0,
    stingCost: 150,
    roundClearBonus: 400,
    roundTimeBonus: 50,       // per second of round clock left when cleared
    perfectRoundBonus: 1200,
    bossBounty: 5000,
    bossHitMoney: 400,        // what landing one on an open weak point pays

    // the bow's supporting cast
    breathMax: 3.4,           // seconds of focus
    breathRegen: 0.34,        // per second, when you are not using it
    focusTime: 0.58,          // how far time slows while focusing
    baseFov: 64,

    /* Aim assist: removed from the shot, kept for the thumb.

       It used to solve the whole interception for you inside a six
       degree cone. Every version of it was too much — the cones came
       down from seventeen degrees to six, the falloff curve was turned
       inside out — and a playtester still said the bow was doing the
       shooting, which it was. So the lead is yours. An arrow leaves
       where you pointed it, and nothing bends it but gravity and the
       weather. There is no hidden cone, snap, magnetic target, or
       interception correction left in the shot path, and there is not
       one on any platform.

       What `assist` below does is a different thing in a different
       place: it is a *sensitivity curve on the drag*, on touch only,
       and it never runs on the arrow. A mouse resolves about a tenth of
       a degree; a thumb dragging on glass resolves nearer a whole one,
       which is roughly the width of a pigeon at forty metres. So near a
       bird the drag is scaled down — the thumb still does all the
       moving, it just moves less per millimetre — and while the thumb
       is actually travelling a small share of that travel is turned
       towards the bird. Three things keep it from becoming the old
       assist: it aims at the *bird*, never at the intercept, so the
       lead, the drop and the wind are all still yours to hold; it is
       capped as a fraction of your own movement, so a still thumb is
       never moved for you and holding a lead is never fought; and it
       ignores doves, because being pulled onto the one bird that costs
       you money is not help. */
    assist: {
      touchOnly: true,
      cone: 0.075,            // ≈ 4.3° — the crosshair is nearly on it already
      slow: 0.42,             // at dead centre a drag counts for 58% of itself
      pull: 0.55,             // rad/s ceiling on the turn towards the bird
      share: 0.35,            // and never more than a third of your own turn
      idle: 0.06,             // rad/s of your own input below which nothing pulls
      minRange: 6,            // point blank needs no help
      maxRange: 170,
    },

    /* What is left is *information*. The
       reticle still names what it is pointed at and still shouts about a
       dove, because knowing a dove is in front of you is the decision;
       the deliberately easier Steady Hand card can also paint an
       intercept mark that you must put the crosshair on yourself. A
       standard run receives no lead solution at all. */
    lockCone: 0.055,          // ≈ 3.2°, for naming what you are looking at
    doveCone: 0.18,           // doves get called out from much further off
    focusLockScale: 1.30,     // focus makes target names easier to acquire
    leadMark: false,          // enabled only by the Steady Hand card
    leadCone: 0.16,           // how far off centre the mark will follow

    // walking about
    eyeHeight: 1.72,
    walkSpeed: 7.4,
    sprintSpeed: 13.0,
    drawWalk: 0.44,           // how much of your speed a drawn bow costs
    moveAccel: 12,
    roamRadius: 96,           // how far from the stand you may wander
    bobRate: 8.6,
    bobAmp: 0.075,
    sprintFov: 9,

    // the wood's own residents, always there to be shot at
    wildlife: 15,
    props: 16,
    respawnTime: 9,

    // the world
    countScale: 1,
    intervalScale: 1,
    speedScale: 1,
    rangeScale: 1,
    forestRadius: 440,
    /* How close a bird has to have come before letting it go is
       something you did rather than something that happened at the far
       end of the wood. Roughly the range at which a shot is a real
       decision. */
    escapeRange: 110,
    lives: 3,                 // gauntlet only
    ghostRate: 0.2,
  };

  static MODES = {
    prize: {
      id: 'prize', name: 'Prize Run',
      blurb: 'Ten rounds and the owl at the end of them. Everything you hit is money.',
      better: (a, b) => (a.earned || 0) > (b ? (b.earned || 0) : -1),
    },
    gauntlet: {
      id: 'gauntlet', name: 'Gauntlet',
      blurb: 'Three lives, waves that never stop, and a score to beat.',
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

  /* How often the host tells the other two where things are. The
     quarry rate is what a bird crossing a clearing needs; the wood's
     own rate is what a deer needs, which is far less. Both are blended
     between on the receiving end, so these are how often the *truth*
     arrives rather than how smoothly anything moves. */
  static QUARRY_HZ = 15;
  static HOME_HZ = 3;

  /* =================== a run's setup =================== */

  static normalise(opts = {}) {
    const seed = Number.isFinite(opts.seed)
      ? (Math.floor(opts.seed) >>> 0) || ShootoutMission.CONFIG.seed
      : U.dailySeed();
    return {
      seed,
      mode: opts.mode === 'gauntlet' ? 'gauntlet' : 'prize',
      modId: opts.modId || null,
      ghost: opts.ghost !== false,
      bossRush: opts.bossRush === true,
      daily: seed === U.dailySeed(),
    };
  }

  static hand(seed) {
    return ShootoutTwists.draw(U.makeRng((seed ^ 0x7f4a7c15) >>> 0), 3);
  }

  static configFor(twist) {
    const C = Object.assign({}, ShootoutMission.CONFIG);
    if (twist && twist.config) Object.assign(C, twist.config);
    return C;
  }

  static conditionsFor(seed, twist) {
    return Object.assign(ForestConditions.forSeed(seed), (twist && twist.cond) || {});
  }

  // everything the briefing needs, without building a wood first
  static preview(opts) {
    const o = ShootoutMission.normalise(opts);
    const twist = ShootoutTwists.byId(o.modId);
    const cond = ShootoutMission.conditionsFor(o.seed, twist);
    const key = GameState.runKey(o.mode, o.seed, o.modId);
    const rec = GameState.runRecord('shootout', key);
    const sched = o.mode === 'prize' ? ShootoutRounds.schedule(o.seed) : null;
    return {
      opts,
      mod: twist,
      cond,
      name: U.forestName(o.seed),
      conditionText: ForestConditions.describe(cond),
      hand: ShootoutMission.hand(o.seed),
      mode: ShootoutMission.MODES[o.mode],
      payout: ForestConditions.payout(cond) * (twist ? twist.payout : 1),
      key,
      record: rec,
      bestText: rec.best ? U.money(rec.best.earned || 0) : null,
      hasGhost: !!GameState.getGhost('shootout', key),
      // the run's own card: which rounds, in which order
      rounds: sched ? sched.map(r => r.def.name) : null,
    };
  }

  constructor(opts = {}) {
    this.opts = ShootoutMission.normalise(opts);
    this.seed = this.opts.seed;
    this.mode = this.opts.mode;
    this.modeDef = ShootoutMission.MODES[this.mode];
    this.twist = ShootoutTwists.byId(this.opts.modId);
    this.flags = Object.assign({}, this.twist && this.twist.flags);
    this.C = ShootoutMission.configFor(this.twist);
    this.cond = ShootoutMission.conditionsFor(this.seed, this.twist);
    this.payout = ForestConditions.payout(this.cond) * (this.twist ? this.twist.payout : 1);
    this.forestName = U.forestName(this.seed);
    this.key = GameState.runKey(this.mode, this.seed, this.opts.modId)
             + (this.opts.bossRush ? ':boss' : '');
    this.rng = U.makeRng(this.seed);

    /* ---- three archers, one wood ----
       The forest is a pure function of the seed so nobody sends any of
       it, but the flock cannot be: birds react to whoever is nearest,
       and "nearest" is different on three machines. So the host
       simulates the flock and the other two are told where every bird
       is twenty times a second. It is the only way three people can
       watch the same bird get away — which four of the eight agenda
       cards depend on. */
    this.party = !!opts.party;
    this.isHost = !!opts.host;
    this.roster = (opts.players || []).filter(p => !p.local);
    this.meId = ((opts.players || []).find(p => p.local) || {}).id || 'you';
    this.agenda = opts.agenda || null;
    this.peers = new Map();
    this.scores = new Map();
    this._claims = new Map();
    this._nearest = new Map();    // netId -> the closest anybody got to it
    this._netAcc = 0;
    this._homeAcc = 0;
    this._fieldT = 0;

    this.state = 'idle';        // idle | countdown | live | between | finished | failed
    this._resetRun();

    this._tmpV = new THREE.Vector3();
    this._tmpV2 = new THREE.Vector3();
    this._assistTo = new THREE.Vector3();
    /* Decided once, here, rather than read per frame: a run does not
       change input device halfway through, and a mouse must never pay
       for the scan. */
    this._assistOn = !!this.C.assist
                     && (!this.C.assist.touchOnly || Input.isTouch);
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._q = new THREE.Quaternion();
  }

  _resetRun() {
    const C = this.C;
    this.yaw = 0; this.pitch = 0.12;
    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3();
    this.bobT = 0;
    this.speed01 = 0;
    this.sprinting = false;
    this.stepPhase = 0;
    this._respawn = [];
    if (this._claims) this._claims.clear();
    if (this._nearest) this._nearest.clear();
    this.boss = null;
    if (this.music) { this.music.stop(0.4); this.music = null; }
    this.lockT = 0; this.lockName = ''; this.lockGuard = false;
    this.lockTarget = null;
    // the charms the owl fight hands out, as seconds remaining
    this.buffs = { ember: 0, breath: 0, nerve: 0, purse: 0 };
    this.buffOn = false;
    this.boonsTaken = 0;
    this.money = 0;
    this.penalty = 0;
    this.bonusMoney = 0;
    this.bossMoney = 0;
    this.chain = 0;
    this.chainT = 0;
    this.bestChain = 0;
    this.shots = 0; this.hits = 0; this.kills = 0;
    this.cleanShots = 0; this.cleanHits = 0;
    this.doves = 0; this.escapes = 0; this.stings = 0;
    this.roundsCleared = 0; this.perfectRounds = 0;
    this.bossesDown = 0;
    this.lives = C.lives;
    this.breath = C.breathMax;
    this.focusing = false;
    this.elapsed = 0;
    this.roundIndex = -1;
    this.round = null;
    this.arrowsLeft = this.flags.quiver || Infinity;
    this.countdown = 3.999;
    this._lastBeep = 4;
    this.hitStop = 0;
    this.timeScale = 1;
    this.timeScaleTarget = 1;
    this.recoil = 0;
    this.shake = 0;
    this.fovKick = 0;
    this.reported = false;
    this.result = null;
    this.rec = { t: [], m: [] };
    this._recAcc = 0;
    this.ghostDelta = null;
    this._songT = 2;

    /* Everything the shootout deck asks about. Gathered on every run,
       Traitor or not — a counter that only exists when somebody has a
       task is a counter that announces there is one.

       The second half of these are the alibis: the money strip, the
       chain, and what you did with the round after you walked back in.
       A card is only worth dealing if both halves are measurable. */
    this.stats = { escapedNearMe: 0, missed: 0, perfectsLate: 0, lateShots: 0,
                   roundsOffLine: 0, offLineT: 0, roundT: 0,
                   doves: 0, bestChain: 0, topOfField: false,
                   doveRecovered: false, doveRecoverT: 0,
                   cleanRoundAfterWalk: false, finished: false };
    this._doveMark = null;        // the dip on the strip, waiting to be paid back
    this._walkPending = false;    // a round was sat out; the next one answers for it
    this._roundShots = 0;
    this._roundMisses = 0;
    this._lastRound = null;
    this._agendaRoundSeen = -1;
  }

  /* =================== build =================== */

  build() {
    const C = this.C;
    const scene = new THREE.Scene();
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(C.baseFov, 1, 0.1, 20000);
    this.camera = camera;
    scene.add(camera);

    // weather before sky, for the same reason as the boat race: the haze
    // in the distant peaks is baked against the fog colour of the day
    const applied = ForestConditions.apply(this.cond);
    const fog = (this.twist && this.twist.fog) || applied.weather.fog;
    scene.fog = new THREE.Fog(Sky.PALETTE.fog, fog.near, fog.far);
    const lighting = ForestConditions.lights(this.cond);
    lighting.children[0].color.lerp(new THREE.Color('#ffe2af'), .18);
    lighting.children[2].groundColor.set('#314c3f');
    scene.add(lighting);
    this.applied = applied;

    Sky.build(scene, U.makeRng(this.seed + 13), { birds: false });

    this.forest = ForestKit.build(scene, U.makeRng(this.seed + 3), {
      visualProfile: 'shootout', visualSeed: this.seed, precip: applied.weather.precip,
      radius: C.forestRadius,
      clearing: 15,
      // low enough to walk on and off: a raised hide made sense when you
      // were bolted to it, and is a three-metre drop now that you are not
      standHeight: 0.75,
      moteColor: applied.weather.precip === 'snow' ? '#ffffff'
               : applied.weather.precip === 'rain' ? '#a8c8e8' : '#d6e8a6',
      motes: applied.weather.precip ? 420 : 220,
      moteFall: applied.weather.precip === 'rain' ? 22
              : applied.weather.precip === 'snow' ? 2.4 : 1.1,
    });
    const wind = ForestConditions.windVector(this.cond);
    this.wind = wind;
    this.forest.setWind(wind.x, wind.z, wind.strength);

    // where you start, and where your eye is above your feet
    this.pos.set(0, this.forest.walkAt(0, 0), 0);
    camera.position.set(0, this.pos.y + C.eyeHeight, 0);

    this.bow = new Bow({ tune: (this.twist && this.twist.tune) || {} });
    this.bow.build(camera);
    // Iron Nerve widens this and then puts it back; the run's own value
    // has to be remembered before anything is allowed to touch it
    this._basePerfect = this.bow.tune.perfectWindow;
    this.arrows = new ArrowSystem(scene, this.bow.tune);
    this.arrows.setWind(wind.x, wind.z, wind.strength);

    this.flock = new FlyerKit.Flock(scene);
    // a guest renders the flock; it does not decide anything about it
    this.flock.puppet = this.party && !this.isHost;
    this._buildPeers(scene);

    // the effects bundle — the boat's FXSystem drags a wake ribbon along
    // with it, and a wake needs water
    this.fx = {
      bits: new ParticleField(scene, 900, { drag: 1.2, gravity: 9, buoyant: false }),
      sparks: new ParticleField(scene, 420, { drag: 0.9, gravity: 2.5, additive: true }),
      rings: new RingBurst(scene, 12),
      labels: new FloatingLabels(document.getElementById('world-labels'), camera),
      update(dt) { this.bits.update(dt); this.sparks.update(dt); this.rings.update(dt); this.labels.update(dt); },
      dispose() { this.bits.dispose(); this.sparks.dispose(); this.rings.dispose(); this.labels.dispose(); },
    };

    this.visualFx = new ShootoutFeedback(scene, this.seed);
    this._buildResidents();

    if (this.mode === 'prize') {
      const fullSchedule = ShootoutRounds.schedule(this.seed);
      this.schedule = this.opts.bossRush ? fullSchedule.slice(-1) : fullSchedule;
    } else this.schedule = null;
    this.roundCount = this.schedule ? this.schedule.length : 0;
    this.targets = this.C.baseFov;   // placeholder, replaced below
    this.par = this._computePar();

    if (this.opts.ghost) {
      const g = GameState.getGhost('shootout', this.key);
      this.ghost = g && g.t && g.t.length > 1 ? g : null;
    } else this.ghost = null;

    this._cacheHud();



    return { scene, camera };
  }

  /* Par is worked out from the rounds this seed actually drew, so a run
     of long-range rounds is not held to the same number as a run of
     lantern flurries. */
  _computePar() {
    if (!this.schedule) return 40000;
    const C = this.C;
    let quarry = 0, bonus = 0;
    for (const r of this.schedule) {
      const d = r.def;
      const types = d.spawn.types;
      let avg = 0;
      for (const t of types) avg += (FlyerKit.TYPES[t] || { points: 100 }).points;
      avg /= types.length;
      const count = Math.round(d.count * C.countScale);
      quarry += avg * count * ((d.rule && d.rule.valueMult) || 1);
      bonus += C.roundClearBonus;
      if (d.kind === 'boss') bonus += C.bossBounty;
    }
    // An author's run takes nearly everything, holds a chain around x2.6,
    // cleans a good half of its looses and clears rounds with time to
    // spare — which is what these two coefficients are.
    return Math.round((quarry * C.moneyPerPoint * 2.9 + bonus * 1.7)
                      * C.moneyScale * this.payout);
  }

  _medalFor(earned) {
    const cuts = [0.42, 0.62, 0.82, 1.0].map(f => this.par * f);
    let medal = 0;
    for (let i = 0; i < cuts.length; i++) if (earned >= cuts[i]) medal = i + 1;
    return medal;
  }

  /* =================== HUD =================== */

  _cacheHud() {
    const q = id => document.getElementById(id);
    this.hud = {
      root: document.querySelector('.sh-hud'),
      money: q('sh-money'), docked: q('sh-docked'),
      chain: q('sh-chain'), chainWrap: q('sh-chain-wrap'), chainBar: q('sh-chain-bar'),
      round: q('sh-round'), roundName: q('sh-round-name'), roundBar: q('sh-round-bar'),
      left: q('sh-left'), acc: q('sh-acc'), pace: q('sh-pace'),
      reticle: q('sh-reticle'), lock: q('sh-lock'),
      hitmark: q('sh-hitmark'), loose: q('sh-loose'),
      draw: q('sh-draw'), drawFill: q('sh-draw-fill'),
      breath: q('sh-breath'), breathFill: q('sh-breath-fill'),
      quiver: q('sh-quiver'), quiverVal: q('sh-quiver-val'),
      lives: q('sh-lives'),
      banner: q('sh-banner'),
      boss: q('sh-boss'), bossPhase: q('sh-boss-phase'), bossPips: q('sh-boss-pips'),
      bossStages: q('sh-boss-stages'), boons: q('sh-boons'), lead: q('sh-lead'),
      hint: q('sh-hint'),
      focus: q('sh-focus'),
      rush: q('sh-rush'),
      setup: q('sh-setup'),
      center: q('center-msg'),
      flash: q('screen-flash'),
    };
    const h = this.hud;
    if (h.setup) {
      const bits = [this.forestName, ForestConditions.describe(this.cond)];
      if (this.twist) bits.push(this.twist.name);
      h.setup.innerHTML = bits
        .map((b, i) => `<span class="${i === 0 ? 'hs-name' : 'hs-tag'}">${b}</span>`).join('');
    }
    if (h.quiver) h.quiver.classList.toggle('show', !!this.flags.quiver);
    if (h.draw) h.draw.classList.toggle('hidden', !!this.flags.hideDraw);
    if (h.lives) h.lives.classList.toggle('show', this.mode === 'gauntlet');
    if (h.breath) h.breath.classList.toggle('off', !!this.flags.noFocus);
    if (h.pace) h.pace.classList.toggle('show', !!this.ghost);
  }

  /* =================== lifecycle =================== */

  cinematic() { return MissionCinematics.forMission(this.def.id, this); }

  updateEnvironment(dt, t, camera) {
    Sky.update(dt, camera.position, t);
    if (this.forest) this.forest.update(dt, camera.position, t);
  }

  start() {
    Input.setMouseAim(true);
    Input.setTouchMode('aim');
    this._aimOn = true;
    this._unlockWatch = Input.onLockChange((locked) => {
      // losing the pointer mid-round is a pause, not a free hit
      if (!locked && this.state === 'live' && !Input.isTouch) this._pause();
    });
    if (this.party) {
      MissionNet.attach('shootout');
      this._offEvents = MissionNet.on('event', (d, from) => this._onNetEvent(d, from));
      this._agendaCheckpoint();
      RoomUI.showAgenda();
    }
    this.state = this.party ? 'waiting' : 'countdown';
    this.countdown = 3.999;
    this._lastBeep = 4;
    this.windSnd = AudioBus.wind();
    if (this.windSnd) this.windSnd.set(this.wind.strength);
    this._startStageMusic();
    Screens.show('hud-shoot');
    this._setCenter('', '');
    this._banner(this.forestName, ForestConditions.describe(this.cond));
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
    this.flock.clear();
    this.arrows.clear();
    this.fx.labels.clear();
    if (this.visualFx) this.visualFx.clear();
    this._resetRun();
    this.pos.set(0, this.forest.walkAt(0, 0), 0);
    this._buildResidents();
    this._startStageMusic();
    this.state = 'countdown';
    this._setCenter('', '');
    this._banner(this.forestName, ForestConditions.describe(this.cond));
    if (this.hud.focus) this.hud.focus.style.opacity = 0;
  }

  // The ordinary rounds carry a leaner version of the owl score: drums,
  // bass, pad and a restrained horn line. It stays on one musical clock
  // between rounds so every new wave can lift the arrangement without a
  // hard restart. The owl still gets the full choir and the biggest gears.
  _startStageMusic() {
    if (this.music) { this.music.stop(0.25); this.music = null; }
    this.music = Music.stage();
    this.music.setGear(0, 0.1);
    this.music.setIntensity(0.52);
  }

  dispose() {
    clearTimeout(this._reportT);
    clearTimeout(this._flashT);
    clearTimeout(this._bannerT);
    clearTimeout(this._boonT2);
    if (this._offEvents) { this._offEvents(); this._offEvents = null; }
    for (const peer of this.peers.values()) {
      Figure.dispose(peer.fig);
      if (peer.bow) Engine.disposeObject(peer.bow);
    }
    this.peers.clear();
    RoomUI.hideAgenda();
    if (this.party) RoomUI.hideField();
    if (this.music) { this.music.stop(0.4); this.music = null; }
    if (this.windSnd) this.windSnd.stop();
    if (this._unlockWatch) this._unlockWatch();
    Input.setMouseAim(false);
    Input.setTouchMode('drive');
    if (this.bow) this.bow.dispose();
    if (this.arrows) this.arrows.dispose();
    if (this.flock) this.flock.dispose();
    if (this.fx) this.fx.dispose();
    if (this.visualFx) this.visualFx.dispose();
    if (this.forest) this.forest.dispose();
    Engine.disposeObject(this.scene);
    Sky.resetPreset();
    this.scene = null;
    if (this.hud) {
      if (this.hud.focus) this.hud.focus.style.opacity = 0;
      if (this.hud.flash) this.hud.flash.style.opacity = 0;
      if (this.hud.setup) this.hud.setup.innerHTML = '';
      if (this.hud.banner) this.hud.banner.classList.remove('show');
      if (this.hud.boss) this.hud.boss.className = 'sh-boss';
      if (this.hud.boons) { this.hud.boons.innerHTML = ''; this._boonKey = null; }
      if (this.hud.lead) this.hud.lead.classList.remove('show');
      if (this.hud.hitmark) this.hud.hitmark.className = 'sh-hitmark';
      if (this.hud.loose) this.hud.loose.className = 'sh-loose';
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
    const wantAim = this.state === 'countdown' || this.state === 'live'
                    || this.state === 'between';
    if (wantAim && !this._aimOn) { Input.setMouseAim(true); this._aimOn = true; }
    if (!wantAim && this._aimOn) { Input.setMouseAim(false); this._aimOn = false; }

    if (Input.pressed('pause') && this.state !== 'finished') { this._pause(); return; }
    if (Input.pressed('mute')) AudioBus.toggleMute();

    // focus: the world slows, the view narrows, the breath drains
    const wantFocus = !this.flags.noFocus && Input.held('focus') && this.breath > 0.05
                      && this.state === 'live';
    this.focusing = wantFocus;
    // a hawk's breath does not run out
    if (wantFocus && this.buffs.breath <= 0) this.breath = Math.max(0, this.breath - rawDt);
    else if (!wantFocus || this.buffs.breath > 0) {
      this.breath = Math.min(this.C.breathMax, this.breath + rawDt * this.C.breathRegen
                             * (this.buffs.breath > 0 ? 6 : 1));
    }

    // hit-stop first, then the focus dilation, then whatever the run wants
    let dt = rawDt;
    if (this.hitStop > 0) {
      this.hitStop -= rawDt;
      dt = rawDt * 0.06;
    } else {
      const target = this.timeScaleTarget * (wantFocus ? this.C.focusTime : 1);
      this.timeScale = U.damp(this.timeScale, target, 7.0, rawDt);
      dt = rawDt * this.timeScale;
    }
    /* The bow runs on its own clock. Holding your breath is *meant* to
       slow your draw along with the world — that is the trade. Hit-stop
       is not: it is a forty-millisecond freeze to punctuate a kill, and
       freezing the draw with it means every hit in a chain costs you a
       beat of the next shot. That is felt immediately and reads as the
       bow being sluggish, which is the last thing this mission can afford. */
    const bowDt = this.hitStop > 0 ? rawDt
                : rawDt * (wantFocus ? this.C.focusTime : 1);

    this._updateAim(rawDt);
    this._updateMove(rawDt);

    if (this.state === 'countdown') this._updateCountdown(rawDt);
    if ((!this.party || this.isHost)
        && (this.state === 'live' || this.state === 'between')) this._updateRound(dt);

    this._updateBuffs(rawDt);
    this._lockScan(rawDt);
    this._updateLead();
    this._updateBow(bowDt);
    this._updateArrows(dt);
    this._updateFlock(dt);
    this._broadcastFlock(rawDt);
    this._updatePeers(rawDt, t);
    this._updateField(rawDt);
    this._trackLine(dt);
    /* Poses go out for the whole time there is anybody to see. Sending
       them only while a round was live left two archers frozen through
       every countdown, every gap between rounds and the whole of the
       scoreboard — which is most of the minute either side of the
       thing they were sent for. */
    if (this.party && this.state !== 'idle' && this.state !== 'waiting') {
      MissionNet.pose(rawDt, () => this._sendPose());
    }

    if (this.state === 'live') {
      this.elapsed += dt;
      this._trackDove();
      this._updateChain(dt);
      this._recordGhost(dt);
      this._updateGhost();
    }

    if (!this.party || this.isHost) this._updateResidents(dt);
    if (this.state === 'live' && (!this.party || this.isHost)) this._updateBoss(dt);

    // the wood keeps living between rounds
    this._songT -= dt;
    if (this._songT <= 0) {
      this._songT = 3 + Math.random() * 7;
      AudioBus.play('birdsong', { bus: 'ambience', volume: this.state === 'live' ? 0.5 : 1 });
    }

    this.forest.update(dt, this.camera.position);
    this.fx.update(dt);
    if (this.visualFx) this.visualFx.update(dt);
    for (const f of this.flock.list) {
      const detail = f.mesh.userData.detail;
      if (detail) detail.visible = f.pos.distanceToSquared(this.camera.position) < 110 * 110;
    }
    Sky.update(dt, this.camera.position, t);
    this._updateCamera(rawDt);
    this._updateHud(rawDt);
  }

  _updateCountdown(dt) {
    this.countdown -= dt;
    const n = Math.ceil(this.countdown);
    if (n < this._lastBeep && n >= 0) {
      this._lastBeep = n;
      if (n > 0) { AudioBus.play('countdown', {}); this._setCenter(String(n), '', 'count'); }
      else {
        AudioBus.play('countdown', { go: true });
        this._setCenter('NOCK UP', '', 'go');
        setTimeout(() => this._setCenter('', ''), 700);
      }
    }
    if (this.countdown <= 0) {
      this.state = 'between';
      this.betweenT = 0.2;
    }
  }

  /* -------- aiming -------- */

  _updateAim(dt) {
    const sens = this.focusing ? 0.0016 : 0.0022;
    const d = Input.aimDelta();
    const s = Input.aimStick();
    const rate = (this.focusing ? 1.5 : 2.3) * dt;
    let dYaw = -(d.x * sens + s.x * rate);
    let dPitch = -(d.y * sens + s.y * rate);

    if (this._assistOn) {
      const a = this._aimAssist(dt, dYaw, dPitch);
      dYaw = a.yaw; dPitch = a.pitch;
    }

    this.yaw += dYaw;
    this.pitch += dPitch;
    this.pitch = U.clamp(this.pitch, -0.55, 1.15);

    // the bow's own wander rides on top of where you are pointing
    const sw = this.bow ? this.bow.sway : { x: 0, y: 0 };
    this.aimYaw = this.yaw + sw.x;
    this.aimPitch = this.pitch + sw.y - this.recoil;
  }

  /* -------- the thumb's half of the aim --------

     Two effects, both of them acting on the drag you just made and
     neither of them on the arrow you are about to loose.

     `slow` is stickiness: inside the cone your drag is scaled down,
     hardest at dead centre, back to full at the rim. It moves the
     crosshair nowhere on its own — it only stops a thumb overshooting
     a bird it had already found.

     `pull` is a magnet, and it is deliberately a weak one. It turns
     towards the bird itself, so every metre of lead is still yours to
     judge; it is capped at a share of the movement you are making, so
     a thumb held still is never turned, and a thumb held still *ahead*
     of a bird — which is what taking a lead looks like — is left
     completely alone; and it skips doves, which you are supposed to be
     deciding about rather than tracking.

     Touch only, by `assist.touchOnly`: a mouse does not need it and a
     party where one player is on glass is exactly where it earns its
     keep. */
  _aimAssist(dt, dYaw, dPitch) {
    const out = { yaw: dYaw, pitch: dPitch };
    const A = this.C.assist;
    if (!A || this.state !== 'live' || this.flags.noAssist) return out;
    if (!this.flock || !this.flock.list) return out;

    // where you are pointing, before the bow's own sway is added: the
    // sway is what you are fighting, not something to aim the help at
    const eye = this.camera.position;
    const dir = this._dirFrom(this.yaw, this.pitch);
    let best = null, bestAng = A.cone;
    for (const f of this.flock.list) {
      if (f.dying || !f.alive || f.guard) continue;
      if (f.type.boss && !f.weakName) continue;
      const anchor = f.type.boss ? f.aimPoint(this._tmpV2) : f.pos;
      const to = this._tmpV.copy(anchor).sub(eye);
      const dist = to.length();
      if (dist < A.minRange || dist > A.maxRange) continue;
      const ang = Math.acos(U.clamp(to.divideScalar(dist).dot(dir), -1, 1));
      if (ang < bestAng) { bestAng = ang; best = this._assistTo.copy(to); }
    }
    if (!best) return out;

    const near = 1 - bestAng / A.cone;           // 1 on the bird, 0 at the rim
    out.yaw *= 1 - A.slow * near;
    out.pitch *= 1 - A.slow * near;

    /* Yaw is measured on a circle that shrinks as you look up, so both
       errors are put into real angles before they are compared, and the
       answer is put back into yaw at the end. */
    const cp = Math.max(0.2, Math.cos(this.pitch));
    const ey = U.wrapAngle(Math.atan2(-best.x, -best.z) - this.yaw) * cp;
    const ep = Math.asin(U.clamp(best.y, -1, 1)) - this.pitch;
    const err = Math.hypot(ey, ep);
    const own = Math.hypot(dYaw * cp, dPitch);
    if (err < 1e-5 || own < A.idle * dt) return out;

    const step = Math.min(A.pull * dt * near, own * A.share, err);
    out.yaw += (ey / err) * step / cp;
    out.pitch += (ep / err) * step;
    return out;
  }

  /* -------- walking --------
     You are not bolted to the stand. Walking changes every shot you take —
     the lead changes, the angle changes, and a bird that was behind a tree
     is not any more — so it has to feel like walking: weight, a bob that
     grows with speed, and a bow that will not let you run flat out. */
  _updateMove(dt) {
    const C = this.C;
    const live = this.state === 'live' || this.state === 'between'
                 || this.state === 'countdown';
    const mv = live ? Input.moveAxes() : { x: 0, y: 0 };
    const drawing = this.bow.state === 'drawing';

    this.sprinting = live && !drawing && Input.held('sprint') && mv.y > 0.2;
    let top = this.sprinting ? C.sprintSpeed : C.walkSpeed;
    if (drawing) top *= C.drawWalk;
    if (this.focusing) top *= 0.55;

    // move relative to where you are looking
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const wishX = (-sy * mv.y) + (cy * mv.x);
    const wishZ = (-cy * mv.y) - (sy * mv.x);
    this.vel.x = U.damp(this.vel.x, wishX * top, C.moveAccel, dt);
    this.vel.z = U.damp(this.vel.z, wishZ * top, C.moveAccel, dt);

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // trunks are solid: push out of anything you walked into
    for (const c of this.forest.colliders) {
      const dx = this.pos.x - c.x, dz = this.pos.z - c.z;
      const rr = c.r + 0.75;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        this.pos.x = c.x + (dx / d) * rr;
        this.pos.z = c.z + (dz / d) * rr;
      }
    }
    // and there is only so far into the wood worth going
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > C.roamRadius) {
      this.pos.x *= C.roamRadius / r;
      this.pos.z *= C.roamRadius / r;
    }
    this.pos.y = U.damp(this.pos.y, this.forest.walkAt(this.pos.x, this.pos.z), 14, dt);

    const speed = Math.hypot(this.vel.x, this.vel.z);
    this.speed01 = U.clamp(speed / C.sprintSpeed, 0, 1);

    // the bob, and a footfall at the bottom of each step
    this.bobT += dt * C.bobRate * (0.6 + this.speed01) * U.clamp(speed / 2, 0, 1);
    const step = Math.floor(this.bobT / Math.PI);
    if (step !== this.stepPhase && speed > 1.4) {
      this.stepPhase = step;
      AudioBus.play('step', { amount: 0.45 + this.speed01 * 0.55 });
    }
  }

  _updateCamera(dt) {
    const C = this.C;
    const reduced = ShootoutMaterials.reduced();
    this.recoil = U.damp(this.recoil, 0, 9, dt);
    this.shake = U.damp(this.shake, 0, 5.5, dt);
    this.fovKick = U.damp(this.fovKick, 0, 6, dt);

    const shakeX = !reduced && this.shake ? (Math.random() - 0.5) * this.shake * 0.03 : 0;
    const shakeY = !reduced && this.shake ? (Math.random() - 0.5) * this.shake * 0.03 : 0;

    // the walk cycle, in the camera and in the hand holding the bow
    const amp = (reduced ? 0 : C.bobAmp) * this.speed01 * (this.sprinting ? 1.5 : 1);
    const bobY = Math.abs(Math.sin(this.bobT)) * amp * 2 - amp;
    const bobX = Math.sin(this.bobT * 0.5) * amp * 1.2;
    this.camera.position.set(this.pos.x + bobX * 0.35,
                             this.pos.y + C.eyeHeight + bobY,
                             this.pos.z);
    if (this.bow) this.bow.setBob(-bobX * 0.9, -bobY * 1.1);

    this.camera.rotation.set(0, 0, 0);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.aimYaw + shakeX;
    this.camera.rotation.x = this.aimPitch + shakeY;
    this.camera.rotation.z = reduced ? 0 : Math.sin(this.bobT * 0.5) * 0.016 * this.speed01;

    // No zoom: holding your breath slows the world and steadies the bow,
    // and that is all it does. A field of view that moves under you while
    // you are trying to lead a bird is a fight, not a feature.
    const wantFov = C.baseFov + (reduced ? 0 : this.fovKick + (this.sprinting ? C.sprintFov : 0));
    if (Math.abs(this.camera.fov - wantFov) > 0.01) {
      this.camera.fov = U.damp(this.camera.fov, wantFov, 12, dt);
      this.camera.updateProjectionMatrix();
    }
  }

  /* -------- the bow -------- */

  _updateBow(dt) {
    const live = this.state === 'live';
    const holding = live && Input.held('fire') && this.arrowsLeft > 0;
    const r = this.bow.update(dt, holding, { steady: this.focusing });
    if (r.loosed) this._loose(r.loosed);

    // out of arrows is a state you should be able to see without looking
    if (live && this.arrowsLeft <= 0 && Input.pressed('fire')) {
      AudioBus.play('miss');
      this._flash(0.12, 'rgba(255,90,120,0.5)');
    }
  }

  _loose(shot) {
    this.shots++;
    this._roundShots++;
    if (shot.perfect) this.cleanShots++;
    if (this.roundIndex >= 3) {
      this.stats.lateShots++;
      if (shot.perfect) this.stats.perfectsLate++;
    }
    if (this.arrowsLeft !== Infinity) this.arrowsLeft--;
    this.recoil = 0.028 + shot.power * 0.03;
    this.fovKick = 0.25 + shot.power * 0.45;
    this._looseRing(shot.perfect);
    Input.haptic(8);

    const spread = this.flags.twinShot ? [-0.012, 0.012] : [0];
    // No aim assist: every arrow leaves in the exact direction the player
    // chose. Gravity, wind and target motion take over from here.
    const aimed = this._dirFrom(this.aimYaw, this.aimPitch);
    for (const off of spread) {
      const dir = off === 0 ? aimed.clone()
        : aimed.clone().applyAxisAngle(ShootoutMission._UP, off);
      // far enough in front of the eye that a full-size arrow does not
      // spend its first frame drawn across the whole screen
      const origin = this.camera.position.clone()
        .addScaledVector(dir, 1.5)
        .add(this._right.set(Math.cos(this.aimYaw), 0, -Math.sin(this.aimYaw)).multiplyScalar(0.22));
      origin.y -= 0.12;
      const s = Object.assign({}, shot);
      if (this.flags.alwaysPierce || this.buffs.ember > 0) s.pierce = Math.max(s.pierce, 1);
      this.arrows.fire(origin, dir, s);
      /* An arrow that only exists on the machine that loosed it is a
         bow that, to everybody else, does nothing at all. This is the
         one piece of the shootout that was never on the wire, and its
         absence is why two other archers read as scenery. It is a
         handful of bytes per shot and it is not arbitrated by anyone:
         what the arrow *hit* is decided where it was fired. */
      if (this.party) {
        MissionNet.event({
          kind: 'shot',
          o: [U.r3(origin.x), U.r3(origin.y), U.r3(origin.z)],
          v: [U.r3(dir.x), U.r3(dir.y), U.r3(dir.z)],
          s: Math.round(shot.speed),
          w: U.r3(shot.power),
          c: shot.perfect ? 1 : 0,
        });
      }
    }
    // a shot that finds nothing still has to be answered for
    this._pendingShot = { perfect: shot.perfect, hit: false };
    this._shotQueue = this._shotQueue || [];
    this._shotQueue.push(this._pendingShot);
  }

  /* What the crosshair is over, worked out every frame with nothing at
     stake. This is the half of the old aim assist that survived: it does
     not touch a single arrow, it only tells you what you are pointed at
     — and, far more importantly, when that thing is a dove.

     The dove cone stays wide on purpose. Warning you costs nothing now
     that nothing is being aimed for you, and having to decide *before*
     you draw is the whole of what a dove is for. */
  _lockScan(dt) {
    const C = this.C;
    this.lockT = Math.max(0, this.lockT - dt);
    if (this.lockT > 0) return;
    this.lockName = ''; this.lockGuard = false;
    this.lockTarget = null;
    if (this.state !== 'live') return;
    const eye = this.camera.position;
    const dir = this._dirFrom(this.aimYaw, this.aimPitch);
    const wide = this.focusing ? C.focusLockScale : 1;
    const near = C.lockCone * wide;
    let bestAng = near, best = null;
    for (const f of this.flock.list) {
      if (f.dying || !f.alive) continue;
      if (f.type.boss && !f.weakName) continue;
      const anchor = f.type.boss ? f.aimPoint(this._tmpV2) : f.pos;
      const to = this._tmpV.copy(anchor).sub(eye);
      const dist = to.length();
      if (dist < 3) continue;
      const cone = f.guard ? C.doveCone : near;
      const ang = Math.acos(U.clamp(to.divideScalar(dist).dot(dir), -1, 1));
      if (ang > cone) continue;
      if (f.guard) { best = f; break; }          // a dove outranks everything
      if (ang < bestAng) { bestAng = ang; best = f; }
    }
    if (!best) return;
    this.lockTarget = best;
    this.lockGuard = !!best.guard;
    this.lockName = best.guard ? 'DOVE — HOLD'
      : (best.type.boss ? ((best.weak[best.weakName] || {}).label || best.type.name)
                        : best.type.name);
  }

  /* -------- the intercept mark --------

     Hold your breath and the bow will *show* you the lead it will not
     take for you: a mark on the point in the air where the arrow and the
     bird would meet, drop and wind included. You still have to put the
     crosshair on it, against a target that is moving and a hand that
     sways, and you are paying breath for the privilege — which is a
     skill you can practise, rather than a cone that shoots for you.

     It is drawn as a HUD dot rather than a sprite because it has to sit
     on top of the fog and the trees: a mark you cannot see through a
     branch is a mark that lies to you at exactly the wrong moment. */
  _updateLead() {
    const C = this.C;
    const el = this.hud && this.hud.lead;
    if (!el) return;
    const show = C.leadMark && this.focusing && this.state === 'live'
                 && !this.flags.noLead;
    if (!show) { if (this._leadOn) { el.classList.remove('show'); this._leadOn = false; } return; }

    const eye = this.camera.position;
    const dir = this._dirFrom(this.aimYaw, this.aimPitch);
    // while you are drawing it answers for the arrow you are holding;
    // otherwise for the full loose you are about to take
    const pw = this.bow.state === 'drawing' ? Math.max(this.bow.power, 0.35) : 1;
    const speed = U.lerp(this.bow.tune.speedMin, this.bow.tune.speedMax, Math.pow(pw, 0.85));
    let pick = null, pickAng = C.leadCone;
    for (const f of this.flock.list) {
      if (f.dying || !f.alive || f.guard) continue;
      if (f.type.boss && !f.weakName) continue;
      const anchor = f.type.boss ? f.aimPoint(this._tmpV2) : f.pos;
      const to = this._tmpV.copy(anchor).sub(eye);
      const dist = to.length();
      if (dist < 6) continue;
      const ang = Math.acos(U.clamp(to.divideScalar(dist).dot(dir), -1, 1));
      if (ang < pickAng) { pickAng = ang; pick = { f, dist }; }
    }
    if (!pick) { el.classList.remove('show'); this._leadOn = false; return; }

    const aim = this._interceptOf(pick.f, pick.dist, speed);
    const p = aim.project(this.camera);
    // behind you, or off the edge: a mark parked against the frame is a
    // mark pointing at the wrong thing
    if (p.z > 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1) {
      el.classList.remove('show'); this._leadOn = false; return;
    }
    el.style.left = ((p.x * 0.5 + 0.5) * 100) + '%';
    el.style.top = ((-p.y * 0.5 + 0.5) * 100) + '%';
    el.classList.add('show');
    el.classList.toggle('far', pick.dist > this.C.longShotFrom);
    this._leadOn = true;
  }

  /* Where to hold to hit `f` with an arrow leaving now at `speed`: four
     passes at the time of flight, then the drop and the wind on top. The
     assist used to do this and then fly the arrow there itself; now it
     does it and draws a dot. */
  _interceptOf(f, dist, speed, out) {
    const eye = this.camera.position;
    const anchor = f.type.boss ? f.aimPoint(this._tmpV2) : f.pos;
    const aim = out || new THREE.Vector3();
    let tof = dist / speed;
    for (let i = 0; i < 4; i++) {
      aim.copy(anchor).addScaledVector(f.vel, tof);
      tof = aim.distanceTo(eye) / speed;
    }
    aim.y += 0.5 * this.bow.tune.gravity * tof * tof;
    aim.x -= this.wind.x * this.bow.tune.windScale * tof * tof * 0.5;
    aim.z -= this.wind.z * this.bow.tune.windScale * tof * tof * 0.5;
    return aim;
  }

  _dirFrom(yaw, pitch) {
    const cp = Math.cos(pitch);
    return this._fwd.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp).clone();
  }

  _updateArrows(dt) {
    this.arrows.update(dt, {
      targets: this.flock.list,
      heightAt: (x, z) => this.forest.heightAt(x, z),
      colliders: this.forest.colliders,
      eye: this.camera.position,
      onHit: (target, arrow, info) => this._onHit(target, arrow, info),
      onLand: (arrow, what) => this._onLand(arrow, what),
    });
  }

  /* The reticle answering back. Both of these restart their animation by
     hand: the class goes off, the layout is read to flush it, and the
     class goes back on — otherwise a second hit inside a third of a
     second gets no mark at all, which is exactly when you want one. */
  _hitMark(kind) {
    const el = this.hud && this.hud.hitmark;
    if (!el) return;
    el.className = 'sh-hitmark';
    void el.offsetWidth;
    el.className = 'sh-hitmark show' + (kind ? ' ' + kind : '');
  }

  _looseRing(clean) {
    const el = this.hud && this.hud.loose;
    if (!el) return;
    el.className = 'sh-loose';
    void el.offsetWidth;
    el.className = 'sh-loose go' + (clean ? ' clean' : '');
  }

  /* -------- hits and misses -------- */

  _onHit(target, arrow, info) {
    const rule = (this.round && this.round.def.rule) || {};
    // "only a clean loose counts" — a soft arrow goes straight through
    if ((rule.cleanOnly || this.flags.cleanOnly) && !arrow.perfect) {
      this.fx.labels.add('TOO SOFT', target.pos, { className: 'bad', life: 0.8, rise: 6 });
      return false;                            // not consumed: keep flying
    }
    // a guest asks; the host answers. See `_claimHit`.
    if (this.party && !this.isHost) return this._claimHit(target, arrow, info);

    if (target.guard) { this._dove(target, info); return true; }

    // a charm is not quarry: it is eight seconds of something
    if (target.type.boon) {
      this.hits++;
      if (arrow.perfect) this.cleanHits++;
      this._takeBoon(target, info);
      return true;
    }

    // the owl is not killed by arrows in the body; it is killed by arrows
    // in whichever part the fight has opened
    if (target.type.boss) {
      const B = this.boss;
      const open = B && B.open && B.staggerT <= 0 && target.weakName;
      // against the arrow's own flight, not against where it happened to
      // clip the owl's very large body sphere
      const seg = this._tmpV.copy(arrow.pos).sub(arrow.prev);
      const len = seg.length();
      if (open && target.weakSegHit(arrow.prev, seg, Math.max(len, 1e-4))) {
        const at = target.aimPoint(new THREE.Vector3());
        this.hits++;
        if (arrow.perfect) this.cleanHits++;
        this._bossHurt(target, { point: at, dist: at.distanceTo(this.camera.position) });
      } else {
        AudioBus.play('boss-clang', {});
        this._hitMark('dull');
        this._burst(info.point, 10, '#9aa6b8', 5);
        this.fx.labels.add(open ? 'MISSED THE MARK' : 'ARMOURED', info.point,
                           { className: 'bad', life: 0.9, rise: 6 });
        this.shake = Math.max(this.shake, 1.2);
      }
      return true;
    }

    const killed = target.hit(arrow.power);
    if (arrow.perfect) this.cleanHits++;
    this.hits++;
    if (killed) this._award(target, arrow, info);
    else this._hitMark('');
    return true;
  }

  _award(target, arrow, info) {
    const C = this.C;
    if (this.party && this.isHost) {
      MissionNet.event({ kind: 'kill', i: target.netId, playerId: this.meId,
                         points: target.value || 0 });
    }
    const rule = (this.round && this.round.def.rule) || {};
    this.kills++;
    this.chain = Math.min(this.chain + 1, C.chainCap);
    this.chainT = C.chainWindow;
    this.bestChain = Math.max(this.bestChain, this.chain);
    // a deer is not one of the round's quarry, however satisfying it was
    if (this.round && !target.resident && !target.isAdd) {
      this.round.killed = Math.min(this.round.total, this.round.killed + 1);
    }

    const dist = info.point.distanceTo(this.camera.position);
    const chainMult = this._chainMult();
    const cleanMult = arrow.perfect ? C.cleanBonus : 1;
    const longMult = 1 + Math.max(0, dist - C.longShotFrom) * C.longShotPer;
    const roundMult = (rule.valueMult || 1) * (rule.pierceDouble && arrow.hits > 1 ? 2 : 1);
    const value = target.value * C.moneyPerPoint
                * chainMult * cleanMult * longMult * roundMult * C.moneyScale
                * this._boonPay();
    this.money += value;

    // arrows back for a clean loose, when arrows are finite
    if (arrow.perfect && this.flags.quiverPerClean && this.arrowsLeft !== Infinity) {
      this.arrowsLeft += this.flags.quiverPerClean;
    }

    // the readout, in the order you care about it
    const tags = [];
    if (arrow.perfect) tags.push('CLEAN');
    if (arrow.hits > 1) tags.push('THROUGH');
    if (dist > C.longShotFrom + 40) tags.push('LONG');
    const label = U.money(Math.round(value * this.payout));
    this.fx.labels.add(tags.length ? `${label}  ${tags.join(' · ')}` : label, info.point, {
      className: arrow.perfect ? 'perfect' : (tags.length ? 'air' : 'good'),
      life: 1.4, rise: 10,
    });

    this._hitMark(arrow.perfect ? 'kill clean' : 'kill');
    this._deathFx(target, info, arrow.perfect);
    this.hitStop = Math.max(this.hitStop, arrow.perfect ? 0.085 : 0.045);
    this.shake = Math.max(this.shake, arrow.perfect ? 2.4 : 1.2);
    if (arrow.perfect) this._flash(0.16, 'rgba(255,209,102,0.55)');
    if (this._shotQueue && this._shotQueue.length) this._shotQueue[this._shotQueue.length - 1].hit = true;

    // a messenger lets go of what it was carrying
    if (target.type.drops) {
      const drop = this.flock.spawn(target.type.drops, {
        pos: target.pos, behaviour: 'arc', life: 6,
      });
      if (drop) {
        drop.vel.set(target.vel.x * 0.2, 1.5, target.vel.z * 0.2);
        this.fx.labels.add('SCROLL!', drop.pos, { className: 'perfect', life: 1.1, rise: 8 });
      }
    }
  }

  /* =================== the Great Owl ===================

     A boss is only a boss if it changes, and this one changes four
     times. It circles out of reach with a lantern in its talons and
     calls ravens down on you; it drops the light and starts making
     passes, and the only moment its eyes face you is the moment it is
     coming straight at your head; then it hunts you properly, crossing
     the clearing at twelve metres with its talons out; and finally it
     stops running altogether, hangs in your face beating its wings hard
     enough to shove you backwards, and dares you to put five arrows
     through its chest while bats pour past.

     Three things run underneath all four phases:

     - It calls. Every phase has a summon on a timer: the owl climbs,
       hangs there hammering its wings while it screeches, and a ring of
       birds arrives. It cannot be hurt while it is calling, which makes
       the call a beat where the right answer is to deal with the sky.
     - The wood answers. Charms rise out of the trees in waves — on every
       stagger and on a timer — and each is eight or twelve seconds of
       something real: arrows that pierce and bite twice, a breath that
       never runs out, a clean window twice as wide, or double money.
       They climb, so a charm you ignore is a charm that leaves.
     - The score. `Music.boss()` is told which phase this is, and the
       gear it changes into is what a phase of this fight sounds like.

     Between phases it is staggered and untouchable for a beat, which is
     what gives the fight its rhythm — and what tells you, without a line
     of text, that the thing you just did worked. */

  static BOSS_PHASES = [
    { key: 'lantern', name: 'THE LANTERN', need: 3, gear: 0, flight: 'circle',
      call: 'It will not come down while it is carrying that light.',
      add: 'raven', addN: 3, addEvery: 9, boonEvery: 14 },
    { key: 'eyes', name: 'THE EYES', need: 3, gear: 1, flight: 'stare',
      call: 'Its eyes only face you when it does. Hold your nerve.',
      add: 'raven', addN: 3, addEvery: 10, boonEvery: 15 },
    { key: 'talons', name: 'THE TALONS', need: 4, gear: 2, flight: 'sweep',
      call: 'It is hunting you now. Hit it as it comes in.',
      add: 'bat', addN: 4, addEvery: 8, boonEvery: 13 },
    { key: 'chest', name: 'THE HEART', need: 5, gear: 3, flight: 'rage',
      call: 'No more running. Put five through it.',
      add: 'bat', addN: 4, addEvery: 5.5, boonEvery: 11 },
  ];

  /* What a charm is worth. Every one of these is a real change to the
     bow or the purse for a handful of seconds, because a powerup that
     you cannot feel is a collectible, and this fight has enough to look
     at already. */
  static BOONS = {
    ember:  { name: 'EMBER ARROWS',  time: 10, color: '#ff9c42',
              blurb: 'every arrow pierces, and bites the owl twice' },
    breath: { name: "HAWK'S BREATH", time: 12, color: '#39e6ff',
              blurb: 'your breath does not run out' },
    nerve:  { name: 'IRON NERVE',    time: 12, color: '#3ddc84',
              blurb: 'the clean window opens twice as wide' },
    purse:  { name: 'GOLDEN HOUR',   time: 10, color: '#ffd166',
              blurb: 'everything pays double' },
  };
  static BOON_KINDS = ['charmEmber', 'charmBreath', 'charmNerve', 'charmPurse'];

  _beginBoss(f) {
    // the whole fight is fought inside a ring you can see across: it
    // circles at thirty metres up and eighty out, never further
    f.cruiseY = this.pos.y + 30;
    f.orbit = 78;
    f.orbitTarget = 78;
    f.behaviour = 'bossCircle';
    f.weakName = null;
    this.boss = {
      flyer: f, phase: -1, hits: 0, t: 0, addT: 6, gustT: 0, boonT: 10,
      callT: 0, calls: 0, open: false, staggerT: 0, cycleT: 0,
      diving: false, down: false,
      /* The screech, and the beat before the fight starts. On the
         mission's own clock rather than a `setTimeout`, because the
         mission's clock is the one that stops when the game is paused
         and slows when somebody holds their breath — and because the
         browser throttles timers in a background tab, which is a state
         a shared run reaches whenever somebody alt-tabs to answer a
         message. A fight that will not begin is not a recoverable one. */
      introT: 2.6,
    };
    this._banner('THE GREAT OWL', 'It has been watching you all evening', 'boss');
    AudioBus.play('owl-screech', {});
    this.shake = Math.max(this.shake, 5);
    // Hand the musical clock from the lighter hunt arrangement to the
    // full boss score. The crossfade is short enough to feel like the
    // owl has kicked the door in, without stacking two bass lines.
    if (this.music) { this.music.stop(0.55); this.music = null; }
    // the score comes in under the screech, one gear below the fight, so
    // the first phase change is already a lift
    this.music = Music.boss();
    this.music.setGear(0, 0.1);
    this.music.setIntensity(0.75);
  }

  _bossPhase(i) {
    const B = this.boss;
    if (!B || !B.flyer.alive) return;
    const P = ShootoutMission.BOSS_PHASES[i];
    B.phase = i;
    B.hits = 0;
    B.cycleT = 0;
    B.callT = 0;
    B.diving = false;
    B.staggerT = 0;
    B.addT = P.addEvery * 0.55;
    B.boonT = P.boonEvery * 0.6;
    B.flyer.weakName = P.key;
    B.open = true;
    B.stare = P.flight === 'stare';
    this._bossFly(P.flight);
    this._banner(P.name, P.call, 'boss');
    AudioBus.play('owl-screech', { pitch: 1 + i * 0.1 });
    if (this.music) {
      this.music.setGear(P.gear, i === 3 ? 0.4 : 2);
      this.music.setIntensity(0.8 + i * 0.07);
      this.music.stinger('phase');
    }
  }

  /* One place that knows how each phase flies, so a phase change, the
     end of a call and the end of a dive all put the owl back into the
     same air rather than three subtly different versions of it. */
  _bossFly(kind) {
    const f = this.boss.flyer;
    f.lane = null;
    if (kind === 'circle') {
      f.behaviour = 'bossCircle'; f.orbitTarget = 52; f.cruiseY = this.pos.y + 24;
    } else if (kind === 'stare') {
      f.behaviour = 'bossHover'; f.hoverDist = 38; f.hoverUp = 17;
    } else if (kind === 'sweep') {
      f.behaviour = 'bossSweep'; f.sweepDist = 48; f.sweepUp = 13;
    } else if (kind === 'rage') {
      f.behaviour = 'bossRage'; f.hoverDist = 29; f.hoverUp = 14; f.rageRate = 1.0;
    } else if (kind === 'call') {
      f.behaviour = 'bossCall'; f.callDist = 54; f.callUp = 34;
    }
  }

  _updateBoss(dt) {
    const B = this.boss;
    if (!B) return;
    const f = B.flyer;
    if (!f.alive || f.dying) { if (!B.down) this._bossDown(); return; }
    B.t += dt;
    const P = ShootoutMission.BOSS_PHASES[B.phase] || null;

    // the eyes light up only while it is looking at you
    if (f.weak && f.weak.eyes.lights) {
      const lit = B.phase === 1 && B.open && B.staggerT <= 0;
      for (const e of f.weak.eyes.lights) {
        e.material.color.set(lit ? '#ff3355' : '#ffb02e');
        e.scale.setScalar(lit ? 1.35 + Math.sin(B.t * 12) * 0.15 : 1);
      }
    }
    if (f.weak && f.weak.lantern.obj.visible && B.phase >= 1) f.weak.lantern.obj.visible = false;

    if (B.staggerT > 0) {
      B.staggerT -= dt;
      f.behaviour = 'bossStagger';
      if (B.staggerT <= 0) {
        if (B.phase + 1 >= ShootoutMission.BOSS_PHASES.length) this._bossDown();
        else this._bossPhase(B.phase + 1);
      }
      return;
    }
    if (B.phase < 0) {
      B.introT -= dt;
      if (B.introT <= 0) this._bossPhase(0);
      return;
    }
    if (!P) return;

    B.cycleT += dt;

    /* The call. It breaks whatever the phase was doing: the owl climbs
       out of the fight, hangs there hammering, and the sky fills. There
       is nothing to shoot on the owl for those two seconds, which is the
       point — the answer to a call is the thing it called. */
    if (B.callT > 0) {
      B.callT -= dt;
      if (B.callT <= 0) {
        B.open = true;
        B.cycleT = 0;
        B.stare = P.flight === 'stare';
        this._bossFly(P.flight);
      }
    } else {
      B.addT -= dt;
      if (B.addT <= 0) {
        B.addT = P.addEvery;
        this._bossCall(P);
      } else {
        this._bossFlightUpdate(dt, P, B, f);
      }
    }

    // the wood's answer, on its own clock
    B.boonT -= dt;
    if (B.boonT <= 0) {
      B.boonT = P.boonEvery;
      this._boonWave(B.phase >= 2 ? 2 : 1);
    }

    // one place decides whether there is anything to shoot at, so the
    // reticle, the mark and the arrows all agree about it
    f.weakName = (B.open && B.staggerT <= 0) ? P.key : null;

    // and the score keeps up with how close the phase is to breaking
    if (this.music) {
      const through = P.need ? B.hits / P.need : 0;
      this.music.setIntensity(0.8 + B.phase * 0.05 + through * 0.2);
    }
  }

  /* Each phase's own flying, once the calls and the staggers have had
     their say. */
  _bossFlightUpdate(dt, P, B, f) {
    /* Phase 2: the stare. It hangs in front of you with its eyes lit and
       dares you to take the shot — that is the window, and it is a long,
       obvious one. Then it loses patience and comes at you, and while it
       is coming there is nothing to hit; you get out of the way, it pulls
       up, and it turns round and stares at you again. */
    if (P.flight === 'stare') {
      if (B.stare && B.cycleT > 5.2) {
        B.stare = false; B.open = false; B.diving = true; B.cycleT = 0;
        f.behaviour = 'bossDive'; f.committed = false;
        AudioBus.play('owl-screech', { pitch: 1.2 });
        if (this.music) this.music.duck(0.4, 0.8);
        this._banner('IT IS COMING', 'GET OUT OF THE WAY', 'bad');
        this.shake = Math.max(this.shake, 3);
      } else if (!B.stare && B.cycleT > 2.6) {
        B.stare = true; B.open = true; B.diving = false; B.cycleT = 0;
        this._bossFly('stare');
        AudioBus.play('owl-screech', { pitch: 0.95 });
        this._banner('IT IS LOOKING AT YOU', 'THE EYES', 'boss');
      }
      return;
    }

    /* Phase 3: the talon runs. The talons are only worth an arrow while
       it is actually coming at you — the shot is a crossing target at
       forty metres, which is the hardest honest shot in the mission and
       the reason the phase is here. On the wheel-around it is shielded,
       and that is the beat you use to reload your nerve. */
    if (P.flight === 'sweep') {
      const to = this._tmpV.copy(this.camera.position).sub(f.pos);
      const closing = to.normalize().dot(f.vel) > 2;
      const near = f.pos.distanceTo(this.camera.position) < 70;
      const open = closing && near;
      if (open !== B.open) {
        B.open = open;
        if (open) AudioBus.play('owl-screech', { pitch: 1.35 });
      }
      // a pass that goes over your head is a pass you felt
      const d = f.pos.distanceTo(this.camera.position);
      if (d < 22 && (!f._sweepFx || this.elapsed - f._sweepFx > 1.4)) {
        f._sweepFx = this.elapsed;
        this.shake = Math.max(this.shake, 3.4);
        AudioBus.play('owl-gust', {});
        const away = this._tmpV2.copy(this.pos).sub(f.pos);
        away.y = 0; away.normalize();
        this.vel.x += away.x * 3.2;
        this.vel.z += away.z * 3.2;
      }
      return;
    }

    /* Phase 4: every wingbeat is a gust that shoves you back a step, and
       it will not stop moving. */
    if (P.flight === 'rage') {
      B.gustT -= dt;
      if (B.gustT <= 0) {
        B.gustT = 1.5;
        const away = this._tmpV.copy(this.pos).sub(f.pos);
        away.y = 0; away.normalize();
        this.vel.x += away.x * 5.5;
        this.vel.z += away.z * 5.5;
        this.shake = Math.max(this.shake, 2.6);
        AudioBus.play('owl-gust', {});
        this.fx.rings.fire(f.pos, this.camera.quaternion, 2, 26, 0.5, '#8899aa');
      }
    }
  }

  /* -------- it calls something down -------- */

  _bossCall(P) {
    const B = this.boss;
    const f = B.flyer;
    B.calls++;
    B.callT = 2.1;
    B.open = false;
    B.diving = false;
    B.stare = false;
    f.weakName = null;
    this._bossFly('call');
    AudioBus.play('owl-screech', { pitch: 0.86 });
    if (this.music) this.music.stinger('summon');
    this._banner('IT IS CALLING THEM', P.add === 'bat' ? 'BATS' : 'RAVENS', 'bad');
    this.shake = Math.max(this.shake, 2.2);
    this.fx.rings.fire(f.pos, this.camera.quaternion, 3, 34, 0.7, '#ff8fa3');

    // they arrive out of the ring the owl is calling over, and come at you
    const n = P.addN + (B.phase >= 2 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      setTimeout(() => {
        if (this.state !== 'live' || !this.boss || this.boss.down) return;
        const add = this._spawnOne(P.add, 'dive', {
          mode: 'swarm', ang: a, dist: 62 + Math.random() * 26,
          height: 18 + Math.random() * 16, life: 30,
        });
        if (add) {
          add.isAdd = true;
          add.bossMinion = true;
          this.fx.labels.add('▼', add.pos, { className: 'bad', life: 0.7, rise: 4 });
        }
      }, 260 + i * 170);
    }
  }

  /* -------- charms -------- */

  /* A wave of them, rising out of the trees around you. They are spread
     right round the clearing on purpose: taking all four means turning
     your back on the owl, which is a decision rather than a pickup. */
  _boonWave(n, why) {
    if (this.state !== 'live') return;
    const kinds = ShootoutMission.BOON_KINDS.slice();
    let made = 0;
    for (let i = 0; i < n; i++) {
      const kind = kinds.splice((Math.random() * kinds.length) | 0, 1)[0]
                || ShootoutMission.BOON_KINDS[(Math.random() * 4) | 0];
      const f = this._spawnOne(kind, 'drift', {
        mode: 'rise',
        ang: Math.random() * Math.PI * 2,
        dist: 26 + Math.random() * 34,
        height: 3 + Math.random() * 4,
        life: 15,
      });
      if (!f) continue;
      f.isAdd = true;                       // never quarry, never holds a round open
      f.guardFree = true;
      made++;
      const B = ShootoutMission.BOONS[f.type.boon];
      this.fx.labels.add(B ? B.name : 'CHARM', f.pos,
                         { className: 'air', life: 1.6, rise: 7 });
    }
    if (!made) return;
    AudioBus.play('boon-rise', {});
    if (this.music) this.music.stinger('boon');
    this._banner('THE WOOD OFFERS SOMETHING', why || 'SHOOT THE CHARMS', 'bonus');
  }

  _takeBoon(target, info) {
    const kind = target.type.boon;
    const B = ShootoutMission.BOONS[kind];
    target.kill();
    this._deathFx(target, info, true);
    if (!B) return;
    // taking one while it is already running adds to it rather than
    // replacing it: a second charm must never be worth less than the first
    this.buffs[kind] = Math.max(this.buffs[kind] || 0, 0) + B.time;
    if (kind === 'breath') this.breath = this.C.breathMax;
    this.boonsTaken++;
    this._hitMark('boss');
    this._burst(info.point, 42, B.color, 11);
    this.fx.rings.fire(info.point, this.camera.quaternion, 0.5, 6, 0.5, B.color);
    this.fx.labels.add(B.name, info.point, { className: 'perfect', life: 1.6, rise: 10 });
    this._setCenter(B.name, B.blurb.toUpperCase(), 'go');
    clearTimeout(this._boonT2);
    this._boonT2 = setTimeout(() => this._setCenter('', ''), 1400);
    this._flash(0.22, 'rgba(255,255,255,0.35)');
    this.hitStop = Math.max(this.hitStop, 0.07);
    AudioBus.play('boon-take', {});
    if (this.music) this.music.stinger('boon');
    // a charm keeps the chain alive; it is a hit, and it took an arrow
    this.chainT = this.C.chainWindow;
  }

  /* What the charms actually do. Three of them are read where they
     matter — the drain in `update`, the pierce in `_loose`, the payout in
     `_award` — and the fourth is a number in the bow, so it is written
     here every frame rather than toggled, which means it cannot get
     stuck open if a run ends mid-charm. */
  _updateBuffs(dt) {
    let any = false;
    for (const k of Object.keys(this.buffs)) {
      if (this.buffs[k] > 0) {
        this.buffs[k] = Math.max(0, this.buffs[k] - dt);
        if (this.buffs[k] > 0) any = true;
        else {
          AudioBus.play('boon-end', {});
          this.fx.labels.add(ShootoutMission.BOONS[k].name + ' — GONE', this.camera.position,
                             { className: 'bad', life: 0.9, rise: 4 });
        }
      }
    }
    this.buffOn = any;
    if (this.bow) {
      this.bow.tune.perfectWindow = this._basePerfect * (this.buffs.nerve > 0 ? 2.2 : 1);
    }
  }

  // what a hit is worth right now, before anything else multiplies it
  _boonPay() { return this.buffs.purse > 0 ? 2 : 1; }

  // a weak point taking an arrow: the whole point of the fight
  _bossAuthorityHit(target, bite) {
    const B = this.boss;
    if (!B) return;
    B.hits += bite;
    const P = ShootoutMission.BOSS_PHASES[B.phase] || { need: 99 };
    if (B.hits >= P.need) this._bossStagger();
  }

  _bossHurt(target, info, affectWorld = true) {
    const B = this.boss;
    const C = this.C;
    // an ember arrow bites twice, which is what makes the charm worth
    // turning your back on the owl for
    const bite = this.buffs.ember > 0 ? 2 : 1;
    if (affectWorld && B) B.hits += bite;
    const P = B ? (ShootoutMission.BOSS_PHASES[B.phase] || { need: 99, name: '' })
                : { need: 99, name: 'THE GREAT OWL' };
    const pay = C.bossHitMoney * this._chainMult() * C.moneyScale * this._boonPay() * bite;
    this.money += pay;
    this.chain = Math.min(this.chain + 1, C.chainCap);
    this.chainT = C.chainWindow;
    this.bestChain = Math.max(this.bestChain, this.chain);

    this.fx.labels.add(`${U.money(Math.round(pay * this.payout))}  ${P.name}`, info.point,
                       { className: 'perfect', life: 1.3, rise: 9 });
    this._hitMark('boss');
    this._burst(info.point, 46, '#ffd166', 12);
    this.fx.rings.fire(info.point, this.camera.quaternion, 0.5, 5.5, 0.45, '#ffd166');
    this.hitStop = Math.max(this.hitStop, 0.09);
    this.shake = Math.max(this.shake, 3.4);
    this._flash(0.2, 'rgba(255,209,102,0.5)');
    AudioBus.play('boss-hurt', {});
    if (this.music) this.music.stinger('hurt');

    if (affectWorld && B && B.hits >= P.need) this._bossStagger();
  }

  _bossStagger() {
    const B = this.boss;
    const f = B.flyer;
    B.staggerT = 2.4;
    B.open = false;
    B.callT = 0;
    f.weakName = null;
    f.lane = null;
    this.hitStop = Math.max(this.hitStop, 0.14);
    this.timeScaleTarget = 0.45;
    setTimeout(() => { if (this.state === 'live') this.timeScaleTarget = 1; }, 900);
    this.shake = Math.max(this.shake, 7);
    this._flash(0.4, 'rgba(255,209,102,0.6)');
    AudioBus.play('owl-screech', { pitch: 0.8 });
    this._banner('STAGGERED', '', 'perfect');
    if (this.music) this.music.stinger('stagger');

    // the lantern goes, and it goes somewhere you can shoot it
    if (B.phase === 0 && f.weak) {
      const p = f.weak.lantern.obj.getWorldPosition(new THREE.Vector3());
      f.weak.lantern.obj.visible = false;
      this._burst(p, 70, '#ff9c42', 16);
      const drop = this.flock.spawn('lantern', { pos: p, behaviour: 'arc', life: 8 });
      if (drop) {
        drop.isAdd = true;
        drop.vel.set((Math.random() - 0.5) * 6, 2, (Math.random() - 0.5) * 6);
        this.fx.labels.add('IT DROPPED THE LIGHT', p, { className: 'perfect', life: 1.6, rise: 7 });
      }
    }
    // every stagger pays a wave of charms: the reward for breaking a
    // phase is being better armed for the next one
    setTimeout(() => {
      if (this.state === 'live' && this.boss && !this.boss.down) {
        this._boonWave(B.phase >= 1 ? 3 : 2, 'IT DROPPED ITS GRIP ON THE WOOD');
      }
    }, 700);
  }

  _bossDown() {
    const B = this.boss;
    if (!B || B.down) return;
    B.down = true;
    if (this.round) this.round.killed = this.round.total;
    const f = B.flyer;
    f.weakName = null;
    if (f.alive && !f.dying) f.kill();
    f.deathT = 3.2;
    f.tumble = 3.6;
    this.timeScaleTarget = 0.35;
    setTimeout(() => { if (this.state === 'live') this.timeScaleTarget = 1; }, 2600);
    this.hitStop = Math.max(this.hitStop, 0.2);
    this.shake = Math.max(this.shake, 9);
    this._flash(0.55, 'rgba(255,209,102,0.7)');
    AudioBus.play('owl-death', {});
    this._banner('THE GREAT OWL IS DOWN', '', 'perfect');
    this._burst(f.pos, 160, '#6b543a', 20);
    // the score turns major over the body and then gets out of the way
    if (this.music) {
      this.music.stinger('down');
      this.music.stop(3.6);
      this.music = null;
    }
    // clear the sky of everything it called in
    for (const a of this.flock.list) if (a.isAdd && !a.dying) a.escaped = true;
  }

  // a fistful of particles, used by everything dramatic
  _burst(p, n, colour, speed) {
    const c = new THREE.Color(colour);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, sp = 2 + Math.random() * speed;
      this.fx.sparks.emit(p.x, p.y, p.z,
        Math.cos(a) * sp, 2 + Math.random() * speed * 0.7, Math.sin(a) * sp,
        0.8 + Math.random() * 1.4, 0.8 + Math.random() * 1.1, c);
    }
  }

  _dove(target, info) {
    const C = this.C;
    const mult = this.flags.doveMult || 1;
    const cost = C.doveCost * mult;
    /* The dip, timed from here. Everybody's row on the strip is their
       money less their fines, so a dove is the one event in this wood
       that makes a number go backwards where two other people can see
       it — and the only way past that is to put it back before they
       have finished reading it. */
    this._doveMark = { at: this._net(), t: this.elapsed };
    this.stats.doveRecovered = false;
    this.stats.doveRecoverT = 0;
    this.penalty += cost;
    this.doves++;
    this.stats.doves = this.doves;
    this.chain = 0; this.chainT = 0;
    if (this.round) this.round.time = Math.max(0, this.round.time - C.doveTime);
    target.kill();
    this._hitMark('bad');
    this._deathFx(target, info, false);
    this.fx.labels.add(`−${U.money(cost)}  DOVE · PROTECTED`, info.point,
                       { className: 'bad', life: 1.9, rise: 8 });
    this._docked(cost, 'DOVE');
    this._flash(0.5, 'rgba(229,19,63,0.75)');
    this.shake = Math.max(this.shake, 5);
    this.hitStop = Math.max(this.hitStop, 0.1);
    AudioBus.play('dove', {});
    this._setCenter('THAT WAS A DOVE',
                    `−${U.money(Math.round(cost * this.payout))} · CHAIN LOST`, 'bad');
    clearTimeout(this._doveT);
    this._doveT = setTimeout(() => this._setCenter('', ''), 1500);

    if (this.flags.suddenDeath) this._fail('YOU SHOT A DOVE');
    else if (this.mode === 'gauntlet') this._loseLife('A DOVE');
  }

  _onLand(arrow, what) {
    /* Where it landed, said out loud. A miss with no mark on it is a
       shot that simply evaporated, and half of learning the lead is
       seeing how far short or wide the last one went. */
    AudioBus.play('shootout-surface', { surface: what });
    this._burst(arrow.pos, what === 'tree' ? 7 : 9,
                what === 'tree' ? '#6b543a' : '#8a7a5c', 4.5);
    /* Somebody else's arrow burying itself in a trunk is their miss,
       and it is counted on their machine. Counting it here as well
       would put another archer's bad afternoon on your board — and,
       on a Traitor's card, would hand them ten misses they never made. */
    if (arrow.remote) return;
    if (arrow.hits === 0) { this.stats.missed++; this._roundMisses++; this._miss(); }
  }

  _miss() {
    const rule = (this.round && this.round.def.rule) || {};
    if (rule.noChainBreak) return;
    if (this.chain > 0) {
      this.chain = Math.max(0, this.chain - (this.flags.missPenalty || 1) * 2);
      AudioBus.play('miss');
      this._flash(0.1, 'rgba(120,140,160,0.4)');
    }
  }

  _chainMult() {
    return 1 + Math.min(this.chain, this.C.chainCap) * this.C.chainStep;
  }

  _updateChain(dt) {
    if (this.chain <= 0) return;
    this.chainT -= dt;
    if (this.chainT <= 0) {
      this.chain = Math.max(0, this.chain - 2);
      this.chainT = this.C.chainWindow;
      if (this.chain === 0) AudioBus.play('miss');
    }
  }

  /* -------- the flock -------- */

  /* =================== three archers ===================
     Everything in this block exists because the wood now has two other
     people standing in it. None of it runs at all in solo practice. */

  _buildPeers(scene) {
    if (!this.party) return;
    for (const p of this.roster) {
      const fig = p.look ? Figure.build({ look: p.look, long: false })
                         : Figure.build({ palette: Figure.paletteFor(p.seat || 1),
                                          long: false });
      fig.visible = false;
      scene.add(fig);
      /* The bow lives in the scene rather than in the figure's hand,
         and is put back into the hand every frame. The arm chain is a
         walk cycle with an aim pose lerped over it — a bow parented
         into it would point wherever the elbow happened to be, and
         where somebody is pointing is the one thing you actually have
         to be able to read off another archer. So the grip is placed
         at the hand, which keeps it held, and the bow is turned to
         face the aim that came off the wire, which keeps it honest. */
      const bow = Bow.buildWorld();
      bow.visible = false;
      scene.add(bow);
      /* Two figures in a wood at dusk, both drawing bows. Which of them
         is which is the question every one of this deck's alibis is
         about — "I was standing next to them when it got away" is not a
         claim anybody can check without a name over a head. */
      const look = p.look ? Look.resolve(p.look) : null;
      const tag = Nametag.make(p.name,
        { accent: look ? look.accent : '#f2c14e', near: 45, far: 190 });
      scene.add(tag);
      this.peers.set(p.id, { fig, bow, tag, name: p.name, seen: false,
                             pos: new THREE.Vector3(), yaw: 0, draw: 0, speed: 0 });
      this.scores.set(p.id, 0);
    }
  }

  /* What you are worth right now: everything taken, less every fine.
     This is the number on the strip, and it is deliberately the one
     that can fall — a dove or a sting takes it backwards in front of
     two other people, which is what makes those cards a risk instead
     of a chore. */
  _net() { return Math.max(0, this.money - this.penalty); }

  /* `d` is how far the string is back, 0 to 1, and it is the whole
     reason anybody can tell an archer lining one up from an archer
     standing there. It used to read `this.bow.draw`, which is not a
     property a `Bow` has ever had: it was `undefined` on every packet,
     which is `0`, which is "nobody is ever drawing". */
  _sendPose() {
    return {
      x: this.pos.x, y: this.pos.y, z: this.pos.z,
      h: this.aimYaw, p: this.aimPitch,
      d: this.bow ? U.clamp(this.bow.charge || 0, 0, 1) : 0,
      v: this.speed01 * (this.sprinting ? 5.4 : 2.6),
      m: Math.round(this._net()),
    };
  }

  _updatePeers(dt, t) {
    if (!this.party) return;
    MissionNet.update(dt);
    for (const [id, peer] of this.peers) {
      const iv = MissionNet.at(id);
      if (!iv) {
        peer.fig.visible = false; peer.bow.visible = false;
        Nametag.hide(peer.tag);
        continue;
      }
      const a = iv.a, b = iv.b, k = iv.k;
      peer.seen = true;
      peer.fig.visible = true;
      peer.bow.visible = true;
      const x = U.lerp(a.x, b.x, k), z = U.lerp(a.z, b.z, k);
      /* The sender's Y is its actual foot height. In particular it uses
         ForestKit.walkAt(), which includes the starting platform and
         follows terrain with the same smoothing as the player sees.
         Recomputing raw heightAt() here put remote players through the
         deck and made their legs clip on slopes. */
      const y = Number.isFinite(a.y) && Number.isFinite(b.y)
        ? U.lerp(a.y, b.y, k)
        : this.forest.walkAt(x, z);
      peer.fig.position.set(x, y, z);
      /* A figure faces where it is aiming, which is what makes a person
         thirty metres away readable as "about to shoot that bird" — and
         readable as not bothering, which matters more. */
      const yaw = U.angLerp(a.h, b.h, k);
      const pitch = U.lerp(a.p || 0, b.p || 0, k);
      const draw = U.clamp(U.lerp(a.d || 0, b.d || 0, k), 0, 1);
      peer.fig.rotation.y = yaw + Math.PI;
      peer.yaw = yaw;
      peer.draw = draw;
      /* Aiming is not "the button is down". It is how far the string
         has come back, and it is the difference between an archer you
         can read and two people standing in a wood. */
      Figure.setAiming(peer.fig, draw > 0.02, pitch);
      Figure.setLocomotion(peer.fig, b.v || 0, 0);
      Figure.update(peer.fig, dt, t);
      /* After `update`, so the hand being asked for is this frame's. */
      Figure.handAt(peer.fig, this._tmpV, 'l');
      Bow.poseWorld(peer.bow, this._tmpV.x, this._tmpV.y, this._tmpV.z,
                    yaw, pitch, draw);
      peer.pos.set(x, peer.fig.position.y, z);
      Nametag.show(peer.tag, x, peer.fig.position.y + 2.05, z, this.camera);
      this.scores.set(id, b.m || 0);
    }
  }

  /* Somebody else's arrow, put in the air here. It flies under the
     same physics — the wind and the gravity are the same numbers on
     all three machines — so it lands where they saw it land without a
     single further packet. It is deliberately inert: it does not test
     the flock, it does not count as a miss, and it cannot take a bird
     off anybody. It is a shot you can watch. */
  _remoteShot(d) {
    if (!this.arrows || !d || !Array.isArray(d.o) || !Array.isArray(d.v)) return;
    const dir = this._tmpV2.set(d.v[0] || 0, d.v[1] || 0, d.v[2] || 0);
    if (dir.lengthSq() < 1e-6) return;
    dir.normalize();
    const origin = new THREE.Vector3(d.o[0] || 0, d.o[1] || 0, d.o[2] || 0);
    this.arrows.fire(origin, dir, {
      speed: U.clamp(d.s || 90, 20, 260),
      perfect: !!d.c,
      power: U.clamp(d.w || 0.5, 0, 1),
      pierce: 0,
      remote: true,
    });
    /* Heard from where it was fired. A loose forty metres away that is
       as loud as your own is worse than silence — it puts an archer in
       your ear who is not standing next to you. */
    const far = origin.distanceTo(this.camera.position);
    AudioBus.play('bow-loose', {
      power: U.clamp(0.85 * (1 - far / 95), 0.2, 0.85),
      perfect: false,
    });
  }

  /* -------- the flock, over the wire --------
     A full snapshot rather than deltas: a snapshot means a dropped
     packet costs one blend instead of leaving a guest with a bird
     nobody can see.

     What it is not is one snapshot of everything at one rate. A wood
     has about fifty things in it and only a dozen of them are in play;
     the rest are deer grazing at walking pace and bottles on stumps
     that have not moved since the run began. Sending all fifty at full
     precision fifteen times a second came to a hundred and forty
     kilobytes a second per guest, which is not a slow connection, it
     is a *backed-up* one — and the whole mission shares that channel,
     so every claim, every kill and every phase of the owl queued up
     behind a stream of stationary bottles and arrived seconds late.
     That is what "the birds and the owl are desynced" actually was.

     So there are two cadences. The quarry — what is being shot at, the
     owl, and whatever it called down — goes at `QUARRY_HZ`. The wood's
     own residents go at `HOME_HZ`, because a deer covers a metre and a
     half between those and the guest interpolates it anyway. Together
     with two decimal places instead of seventeen it comes to about a
     fifth of what it was. */

  _flockState(f) {
    const st = f.netState();
    st.t = f.typeId;
    if (f.scale !== 1) st.s = f.scale;
    /* What a bird *is* cannot be read off its transform, and a guest
       that does not know gets it wrong in ways you can see: a resident
       counted as quarry, an owl's raven that walks through you without
       a strike. One integer, three facts. */
    const flags = (f.resident ? 1 : 0) | (f.isAdd ? 2 : 0) | (f.bossMinion ? 4 : 0);
    if (flags) st.f = flags;
    /* A boss's open weak point is gameplay state, not decoration. A
       guest cannot infer it from the transform snapshot because only
       the host advances the boss brain. */
    if (f.type.boss) st.w = f.weakName || null;
    return st;
  }

  _worldState() {
    const R = this.round;
    const B = this.boss;
    return {
      state: this.state,
      roundIndex: this.roundIndex,
      betweenT: this.betweenT || 0,
      round: R ? { time: R.time, killed: R.killed, spawned: R.spawned,
                   escaped: R.escaped, doves: R.doves } : null,
      lastRound: this._lastRound,
      /* `diving` was the one field of the owl's state that never
         travelled, which meant a guest could not be run down by it:
         the pass that costs you your chain is gated on it, and on a
         guest it was permanently undefined. */
      boss: B ? { phase: B.phase, hits: B.hits, open: B.open, down: B.down,
                  staggerT: B.staggerT, diving: !!B.diving } : null,
    };
  }

  _broadcastFlock(dt) {
    if (!this.party || !this.isHost) return;
    this._netAcc += dt;
    this._homeAcc += dt;
    const quarry = this._netAcc >= 1 / ShootoutMission.QUARRY_HZ;
    /* A deer somebody has just shot is falling, and a fall drawn three
       times a second is a fall that stutters — it tumbles fast enough
       that the blend between two of those would take the short way
       round the wrong way. So while anything in the wood is dying, the
       wood goes out as often as the quarry does. */
    const dying = this.flock.list.some(f => f.resident && f.dying);
    const homeHz = dying ? ShootoutMission.QUARRY_HZ : ShootoutMission.HOME_HZ;
    const home = this._homeAcc >= 1 / homeHz;
    if (!quarry && !home) return;

    const msg = { kind: 'flock', world: this._worldState() };
    if (quarry) {
      this._netAcc = 0;
      msg.a = [];
      for (const f of this.flock.list) if (!f.resident) msg.a.push(this._flockState(f));
    }
    if (home) {
      this._homeAcc = 0;
      msg.r = [];
      for (const f of this.flock.list) if (f.resident) msg.r.push(this._flockState(f));
    }
    MissionNet.event(msg);
  }

  /* A guest spawns anything it has not seen before and drops anything
     that has stopped arriving. Spawn-on-sight rather than spawn events
     because it is self-healing: a guest that misses a spawn message
     recovers on the next snapshot instead of missing a bird all round.

     Reaping is per list, not per message. A quarry snapshot says
     nothing about the deer and a resident snapshot says nothing about
     the ravens, so each one may only drop its own kind — dropping
     everything it did not mention would delete the entire wood fifteen
     times a second. */
  _applyFlock(msg) {
    if (!this.party || this.isHost || !this.flock || !msg) return;
    if (msg.a) this._applyFlockList(msg.a, false);
    if (msg.r) this._applyFlockList(msg.r, true);
    this._applyWorldState(msg.world);
  }

  _applyFlockList(list, residents) {
    const keep = new Set();
    for (const st of list) {
      keep.add(st.i);
      let f = this.flock.byNetId(st.i);
      if (!f) {
        f = this.flock.spawn(st.t, {
          netId: st.i, pos: new THREE.Vector3(st.x, st.y, st.z), scale: st.s || 1,
        });
        if (!f) continue;
      }
      const flags = st.f || 0;
      f.resident = !!(flags & 1);
      f.isAdd = !!(flags & 2);
      f.bossMinion = !!(flags & 4);
      f.netApply(st);
      if (f.type.boss) f.weakName = st.w || null;
    }
    for (let i = this.flock.list.length - 1; i >= 0; i--) {
      const f = this.flock.list[i];
      if (!!f.resident !== !!residents) continue;
      if (!keep.has(f.netId)) this.flock.remove(f);
    }
  }

  _applyWorldState(world) {
    if (!world || this.isHost) return;
    if (this.state === 'failed') return;
    /* The host owns round outcomes, but each device owns its player's
       movement and arrows. Finalize that local agenda telemetry when the
       host announces the round result; otherwise a guest can never complete
       the long-walk card. */
    const last = world.lastRound;
    if (last && last.index > this._agendaRoundSeen) {
      if (this.round && this.round.index === last.index) {
        this._finishRoundAgenda(!!last.cleared);
      }
      /* The host has announced the round's result. Everything the
         bonus is worked out from came with it, so this client can pay
         itself — with its own charms applied, because the charms are
         the half of the sum that is not shared. */
      this._awardRound(last);
      this._agendaRoundSeen = last.index;
    }
    if (world.roundIndex >= 0 && world.roundIndex !== this.roundIndex
        && this.state !== 'finished' && this.state !== 'failed') {
      this._beginRound(world.roundIndex);
    }
    if (this.round && world.round) {
      this.round.time = world.round.time;
      this.round.killed = world.round.killed;
      this.round.spawned = world.round.spawned;
      this.round.escaped = world.round.escaped;
      this.round.doves = world.round.doves;
    }
    if (!world.round) this.round = null;

    /* Guests render the host's owl rather than running a second boss
       brain. Keep the HUD, aim marker and hit feedback on the same
       phase as the authority snapshot. */
    if (world.boss) {
      const flyer = this.flock.list.find(f => f.type.boss) || null;
      const hadBoss = !!this.boss;
      const previous = this.boss && this.boss.phase;
      const wasDown = !!(this.boss && this.boss.down);
      this.boss = Object.assign({}, this.boss || {}, world.boss, { flyer });
      if (flyer && !world.boss.open) flyer.weakName = null;
      if (!hadBoss) {
        if (this.music) { this.music.stop(0.55); this.music = null; }
        this.music = Music.boss();
        this.music.setGear(Math.max(0, world.boss.phase), 0.1);
        this.music.setIntensity(0.75);
        AudioBus.play('owl-screech', {});
        this._banner('THE GREAT OWL', 'It has been watching you all evening', 'boss');
      }
      if (previous !== undefined && previous !== world.boss.phase
          && world.boss.phase >= 0) {
        const P = ShootoutMission.BOSS_PHASES[world.boss.phase];
        if (P) {
          this._banner(P.name, P.call, 'boss');
          if (this.music) {
            this.music.setGear(P.gear, world.boss.phase === 3 ? 0.4 : 2);
            this.music.setIntensity(0.8 + world.boss.phase * 0.07);
            this.music.stinger('phase');
          }
        }
      }
      if (!wasDown && world.boss.down) {
        AudioBus.play('owl-death', {});
        this._banner('THE GREAT OWL IS DOWN', '', 'perfect');
        if (this.music) {
          this.music.stinger('down');
          this.music.stop(3.6);
          this.music = null;
        }
      }
    } else {
      this.boss = null;
    }
    if (world.state === 'finished') {
      if (this.state !== 'finished' && this.state !== 'failed') this._finish();
      return;
    }
    if (world.state === 'failed') {
      this._fail('THE SHARED RUN ENDED');
      return;
    }
    if (world.state === 'live' || world.state === 'between') {
      this.state = world.state;
      this.betweenT = world.betweenT;
    }
  }

  _onNetEvent(d, from) {
    if (!d) return;
    const authoritative = d.kind === 'flock' || d.kind === 'kill'
      || d.kind === 'escaped' || d.kind === 'claimResult';
    if (authoritative && this.isHost) return;
    if (authoritative && !this.isHost && Party.hostId && from !== Party.hostId) return;
    if (d.kind === 'flock') { this._applyFlock(d); return; }

    /* A bird got away, and the host has already worked out whose it
       was. It used to be broadcast as a position for each client to
       judge for itself, which sounds fairer and is not: three people
       standing in one clearing all answer that question the same way,
       so every escape belonged to all three of them at once. */
    if (d.kind === 'escaped') {
      if (d.who === this.meId) this.stats.escapedNearMe++;
      return;
    }

    if (d.kind === 'shot') { this._remoteShot(d); return; }

    /* A wasp or a raven reached somebody. It cost them, on their own
       machine, and it costs the wood the bird — which only the host
       can do, because only the host is simulating it. */
    if (d.kind === 'spent' && this.isHost) {
      const f = this.flock.byNetId(d.i);
      if (f && f.alive && !f.dying) f.kill();
      return;
    }

    if (d.kind === 'kill') return; // the sender's net score arrives in its 20 Hz pose

    if (d.kind === 'claimResult') {
      if (d.playerId === this.meId) this._applyClaimResult(d);
      return;
    }

    /* A guest says it hit something; the host is the one that decides
       whether it did. This is the only contested call in the mission
       and it is the only one arbitrated. */
    if (d.kind === 'claim' && this.isHost) {
      const f = this.flock.byNetId(d.i);
      if (!f || f.dying || !f.alive) return;
      const rule = (this.round && this.round.def.rule) || {};
      let effect = 'hit';
      if ((rule.cleanOnly || this.flags.cleanOnly) && !d.perfect) {
        effect = 'reject';
      } else if (f.guard) {
        effect = 'dove';
        f.kill();
        if (this.round) this.round.time = Math.max(0, this.round.time - this.C.doveTime);
        if (this.flags.suddenDeath) this._fail('A DOVE WAS SHOT');
      } else if (f.type.boon) {
        effect = 'boon';
        f.kill();
      } else if (f.type.boss) {
        const B = this.boss;
        const a = d.a || [], b = d.b || [];
        let fromV, seg;
        if (Array.isArray(d.la) && Array.isArray(d.lb)) {
          /* Sent in the owl's frame, so it is measured against this
             owl wherever this owl now is. */
          fromV = f.mesh.localToWorld(
            new THREE.Vector3(+d.la[0] || 0, +d.la[1] || 0, +d.la[2] || 0));
          seg = f.mesh.localToWorld(
            new THREE.Vector3(+d.lb[0] || 0, +d.lb[1] || 0, +d.lb[2] || 0)).sub(fromV);
        } else {
          fromV = new THREE.Vector3(+a[0] || 0, +a[1] || 0, +a[2] || 0);
          seg = new THREE.Vector3((+b[0] || 0) - fromV.x,
                                  (+b[1] || 0) - fromV.y,
                                  (+b[2] || 0) - fromV.z);
        }
        const len = seg.length();
        const open = B && B.open && B.staggerT <= 0 && f.weakName;
        if (!open || !f.weakSegHit(fromV, seg, Math.max(len, 1e-4))) effect = 'reject';
        else {
          effect = 'boss';
          this._bossAuthorityHit(f, d.bite > 1 ? 2 : 1);
        }
      } else {
        const killed = f.hit(U.clamp(+d.power || 1, 0.05, 4));
        effect = killed ? 'kill' : 'hit';
        if (killed && this.round && !f.resident && !f.isAdd) {
          this.round.killed = Math.min(this.round.total, this.round.killed + 1);
        }
      }
      const p = f.pos;
      MissionNet.event({ kind: 'claimResult', playerId: from, i: d.i, effect,
                         x: p.x, y: p.y, z: p.z, points: f.value || 0 }, from);
      return;
    }
  }

  /* On a guest, a hit is a request rather than a result: the arrow is
     consumed and the local feedback plays at once, because a bow that
     waits for a round trip before it feels like it hit anything feels
     broken — but nothing about the bird changes here. */
  _claimHit(target, arrow, info) {
    this._claims.set(target.netId, {
      target,
      arrow: { perfect: !!arrow.perfect, power: arrow.power || 1, hits: arrow.hits || 1 },
      info: { point: info.point.clone ? info.point.clone() : new THREE.Vector3(info.point.x, info.point.y, info.point.z) },
    });
    const claim = { kind: 'claim', i: target.netId,
                    perfect: !!arrow.perfect, power: arrow.power || 1,
                    bite: this.buffs.ember > 0 ? 2 : 1,
                    a: [arrow.prev.x, arrow.prev.y, arrow.prev.z],
                    b: [arrow.pos.x, arrow.pos.y, arrow.pos.z] };
    /* The owl is the one target where *where* you hit it decides
       whether it counts, and it is also the fastest thing in the wood
       — so by the time a claim reaches the host, the host's owl has
       moved on from the one the guest was aiming at, and a shot
       straight through the open eye is thrown out as a miss. That is
       the whole of "the owl does not work in multiplayer".

       So the arrow is sent in the owl's *own* frame as well. The host
       puts those two points back into the world through its own owl,
       which rotates the shot with the bird: a line through the eye
       stays a line through the eye however far the fight has flown
       between the two machines. */
    if (target.type.boss && target.mesh) {
      const la = target.mesh.worldToLocal(this._tmpV.copy(arrow.prev));
      claim.la = [U.r3(la.x), U.r3(la.y), U.r3(la.z)];
      const lb = target.mesh.worldToLocal(this._tmpV2.copy(arrow.pos));
      claim.lb = [U.r3(lb.x), U.r3(lb.y), U.r3(lb.z)];
    }
    MissionNet.event(claim, Party.hostId);
    this._hitMark('');
    return true;
  }

  _applyClaimResult(d) {
    const claim = this._claims.get(d.i);
    this._claims.delete(d.i);
    if (!claim) return;
    const target = claim.target;
    const arrow = claim.arrow;
    const info = claim.info;
    if (d.x !== undefined) info.point.set(d.x, d.y, d.z);

    if (d.effect === 'reject') {
      this.fx.labels.add('NOT COUNTED', info.point, { className: 'bad', life: 0.8, rise: 6 });
      return;
    }
    if (d.effect === 'dove') { this._dove(target, info); return; }
    this.hits++;
    if (arrow.perfect) this.cleanHits++;
    if (d.effect === 'boon') { this._takeBoon(target, info); return; }
    if (d.effect === 'boss') { this._bossHurt(target, info, false); return; }
    if (d.effect === 'kill') { this._award(target, arrow, info); return; }
    this._hitMark('');
  }

  _updateField(dt) {
    /* Marking the task is a keypress, and a keypress is an edge that
       only exists inside a frame. The strip below is throttled to a few
       times a second, which is fine for a scoreboard and would drop
       most of a button press, so the poll goes above the throttle and
       the drawing stays below it. */
    if (this.agenda) RoomUI.pollMark();
    this._fieldT -= dt;
    if (this._fieldT > 0) return;
    this._fieldT = 0.25;
    /* The task chip is not part of the strip and does not need three
       people to be worth drawing — a rehearsal deals a card too, and a
       Traitor who cannot see how their own task is going is playing a
       different game from the one the verdict is about to judge. */
    if (this.agenda) this._agendaCheckpoint();
 RoomUI.showAgenda();
    if (!this.party) return;

    const mine = Math.round(this._net());
    const rows = [{ playerId: this.meId, name: 'You', m: mine }];
    for (const [id, peer] of this.peers) {
      rows.push({ playerId: id, name: peer.name, m: this.scores.get(id) || 0,
                  dim: !peer.seen });
    }
    rows.sort((a, b) => b.m - a.m || String(a.playerId).localeCompare(String(b.playerId)));
    // top of the strip, as the strip itself has it — the alibi for two
    // of the four cards in this deck is exactly this row being first
    this.stats.topOfField = rows.length > 1
      && rows.every(r => r.playerId === this.meId || mine > r.m);
    RoomUI.showField(rows.map(r => ({
      playerId: r.playerId, name: r.name, value: U.money(r.m), dim: r.dim,
    })));
  }

  /* The task, how far along it is, and whether the alibi is standing
     up right now — read from the same stats the host will judge on, so
     the chip can never promise something the verdict disagrees with. */
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

  /* Paying back a dove. The clock runs from the shot and stops the
     instant the strip is above where it was — eight seconds being about
     as long as anybody watches a number that moved. */
  _trackDove() {
    const m = this._doveMark;
    if (!m) return;
    const st = this.stats;
    st.doveRecoverT = Math.max(0, this.elapsed - m.t);
    if (this._net() > m.at) {
      st.doveRecovered = st.doveRecoverT <= 8;
      this._doveMark = null;
    }
  }

  /* -------- agenda telemetry --------
     Time spent away from the shooting line, per round. "The line" is
     the clearing everybody starts in; wandering off it is visible on
     the field strip as a marker that has stopped moving with the rest. */
  _trackLine(dt) {
    if (this.state !== 'live') return;
    this.stats.roundT += dt;
    if (Math.hypot(this.pos.x, this.pos.z) > 46) this.stats.offLineT += dt;
    // the chain is half of one card's alibi, and a chip that only learned
    // about it at the end of the night would be no use to anybody
    this.stats.bestChain = this.bestChain;
  }

  /* -------- whose bird was that --------

     "Let five birds leave the clearing past you" was, before this,
     impossible. A bird only ever counts as escaped when it crosses the
     world bounds, four hundred metres out, and the escape was credited
     to anyone standing within seventy metres of *that* — which is
     nobody, ever. The card was undoable, and a Traitor dealt it was
     exposed at the round table for a task the wood would not let them
     perform.

     What "past you" has to mean is how close it came while it was
     worth shooting at, and it has to belong to one person: three
     archers in one clearing are all within seventy metres of every
     bird in the round, so a shared count would have made the card free
     for everybody instead of impossible for everybody. So the host —
     which is the only client that knows where all three people are —
     tracks each bird's closest approach and to whom, and the bird that
     gets away is charged to the archer who had the best look at it. */
  _trackNearest() {
    if (!this.party || !this.isHost) return;
    for (const f of this.flock.list) {
      if (!f.alive || f.dying || f.resident || f.guard || f.isAdd || f.type.boss) continue;
      let bestD = Infinity, bestId = null;
      const consider = (x, z, id) => {
        const d = Math.hypot(f.pos.x - x, f.pos.z - z);
        if (d < bestD) { bestD = d; bestId = id; }
      };
      consider(this.pos.x, this.pos.z, this.meId);
      for (const [id, peer] of this.peers) {
        if (peer.seen) consider(peer.pos.x, peer.pos.z, id);
      }
      const was = this._nearest.get(f.netId);
      if (!was || bestD < was.d) this._nearest.set(f.netId, { d: bestD, id: bestId });
    }
  }

  /* How near it came, and to whom — or nothing, if the host never had
     a frame with everybody's position in it. */
  _escapedFrom(netId) {
    const n = this._nearest.get(netId);
    this._nearest.delete(netId);
    return n && n.d <= this.C.escapeRange ? n.id : null;
  }

  _updateFlock(dt) {
    this._trackNearest();
    this.flock.update(dt, {
      heightAt: (x, z) => this.forest.heightAt(x, z),
      player: this.camera.position,
      wind: { x: this.wind.x, z: this.wind.z },
      bounds: this.C.forestRadius * 0.98,
      onFlush: (f) => this.fx.labels.add('FLUSHED!', f.pos,
                                         { className: 'air', life: 1, rise: 9 }),
      home: this._home || (this._home = new THREE.Vector3(0, 0, 0)),
      roam: 130,
      onGone: (f) => {
        if (f.resident) {
          // the wood restocks itself
          this._respawn.push({ kind: f.homeKind, t: this.C.respawnTime * (0.6 + Math.random()) });
          return;
        }
        // what the owl called in, and what the wood offered, are both
        // the boss's business: neither is quarry you let get away
        if (f.escaped && !f.guard && !f.isAdd && this.round) {
          this.round.escaped++;
          this.escapes++;
          /* Told to everybody, with a name on it. Only the host can put
             the name there, because only the host knows where all three
             of them were standing while that bird was in the air. */
          if (this.party) {
            const who = this._escapedFrom(f.netId);
            MissionNet.event({ kind: 'escaped', i: f.netId, who,
                               x: f.pos.x, z: f.pos.z });
            if (who === this.meId) this.stats.escapedNearMe++;
          }
        } else if (this.party) {
          this._nearest.delete(f.netId);
        }
      },
    });

    // wasps that get to you, and an owl that runs you down
    if (this.state !== 'live') return;
    for (const f of this.flock.list) {
      if (f.dying || !f.alive || f._spent) continue;
      const d = f.pos.distanceTo(this.camera.position);
      if (f.type.stings && d < 4.5) { this._sting(f); }
      else if (f.bossMinion && d < 4.8) this._bossMinionPass(f);
      // it holds nine metres of air under it now, so the pass is judged
      // by how close it came to your head rather than to your boots
      else if (f.type.boss && this.boss && this.boss.diving && d < 12) this._bossPass(f);
    }
  }

  /* A wasp that reaches you, or a raven the owl sent, spends itself on
     you — and it has to be spent on *everybody's* copy of it, not just
     the one in front of the person it reached. The host owns the
     flock, so a guest takes the hit locally, which is what the moment
     has to feel like, and asks the host to take the bird out of the
     air. The bird then dies once, on all three machines, instead of
     dying on one of them and flying on for the other two. */
  _spend(f) {
    /* Locally it is over either way: the guest must not ask twice
       while the answer is in flight, and the host has already killed
       it. */
    f._spent = true;
    if (!this.party || this.isHost) { f.kill(); return; }
    MissionNet.event({ kind: 'spent', i: f.netId }, Party.hostId);
  }

  _sting(f) {
    this._spend(f);
    this.stings++;
    this.penalty += this.C.stingCost;
    if (this.round) this.round.time = Math.max(0, this.round.time - 1.2);
    this._flash(0.32, 'rgba(242,193,78,0.55)');
    this.shake = Math.max(this.shake, 4);
    AudioBus.play('flyer-hit', { pitch: 1.7 });
    this.fx.labels.add(`−${U.money(this.C.stingCost)}  STUNG`, f.pos,
                       { className: 'bad', life: 1.3, rise: 6 });
    this._docked(this.C.stingCost, 'STUNG');
  }

  /* A raven or bat the owl called is not set dressing. Letting one reach
     you costs a little round time and knocks the chain backwards, so the
     summon creates a real target-priority decision without turning every
     add into a second life system. */
  _bossMinionPass(f) {
    this._spend(f);
    this.chain = Math.max(0, this.chain - 2);
    this.chainT = this.C.chainWindow;
    if (this.round) this.round.time = Math.max(0, this.round.time - 0.75);
    const away = this._tmpV.copy(this.pos).sub(f.pos);
    away.y = 0;
    if (away.lengthSq() > 0.001) away.normalize();
    this.vel.x += away.x * 2.5;
    this.vel.z += away.z * 2.5;
    this._flash(0.24, 'rgba(120,40,90,0.5)');
    this.shake = Math.max(this.shake, 2.8);
    AudioBus.play('flyer-hit', { pitch: f.type.id === 'bat' ? 1.4 : 0.75 });
    this.fx.labels.add(`${f.type.name.toUpperCase()} STRIKE`, f.pos,
                       { className: 'bad', life: 1.0, rise: 5 });
  }

  _bossPass(f) {
    if (f._passT && this.elapsed - f._passT < 2) return;
    f._passT = this.elapsed;
    this.chain = 0;
    this._flash(0.42, 'rgba(20,10,0,0.8)');
    this.shake = Math.max(this.shake, 7);
    this.hitStop = Math.max(this.hitStop, 0.08);
    AudioBus.play('crash', { amount: 0.8 });
    if (this.round) this.round.time = Math.max(0, this.round.time - 2);
    if (this.mode === 'gauntlet') this._loseLife('THE OWL GOT PAST YOU');
  }

  /* -------- rounds -------- */

  _updateRound(dt) {
    if (this.state === 'between') {
      this.betweenT -= dt;
      if (this.betweenT <= 0) this._beginRound(this.roundIndex + 1);
      return;
    }
    const R = this.round;
    if (!R) return;

    // A boss round's clock is only the remaining time-bonus window. Once
    // it is spent, the fight carries on until the owl is actually down.
    R.time = R.def.kind === 'boss' ? Math.max(0, R.time - dt) : R.time - dt;
    R.spawnT -= dt;

    if (R.spawned < R.total && R.spawnT <= 0) {
      const batch = R.def.batch;
      const n = Math.min(R.total - R.spawned,
                         batch[0] + ((Math.random() * (batch[1] - batch[0] + 1)) | 0));
      this._spawnWave(n);
      const iv = R.def.interval;
      R.spawnT = U.lerp(iv[0], iv[1], Math.random()) * this.C.intervalScale;
    }

    // residents live here and adds are the boss's problem: neither of them
    // should hold a round open
    const quarryLeft = this.flock.list.some(f => !f.dying && !f.resident && !f.isAdd);
    if (R.def.kind === 'boss') {
      if (this.boss && this.boss.down && !quarryLeft) this._endRound(true);
      return;
    }
    if (R.spawned >= R.total && !quarryLeft) this._endRound(true);
    else if (R.time <= 0) this._endRound(!quarryLeft);
  }

  _beginRound(index) {
    const sched = this.mode === 'prize'
      ? this.schedule[index]
      : ShootoutRounds.endless(this.seed, index);
    if (!sched) { this._finish(); return; }

    this.roundIndex = index;
    this._roundShots = 0;
    this._roundMisses = 0;
    const d = sched.def;
    this.round = {
      def: d,
      sched,
      index,
      total: Math.max(1, Math.round(d.count * this.C.countScale
                                    * (d.kind === 'boss' ? 1 : sched.scale > 1 ? 1 + (sched.scale - 1) * 0.5 : 1))),
      spawned: 0,
      killed: 0,
      escaped: 0,
      doves: 0,
      time: d.duration,
      duration: d.duration,
      spawnT: 0.6,
      wave: 0,
      waveShape: null,
      guardSpawned: 0,
      facing: sched.facing,
      speedScale: this.C.speedScale * (1 + (sched.scale - 1) * 0.5) * (d.spawn.speed || 1),
    };
    this.state = 'live';
    const roundLabel = this.mode === 'prize'
      ? `ROUND ${index + 1} / ${this.roundCount}` : `WAVE ${index + 1}`;
    // Non-boss rounds finally introduce their actual rule and flavour;
    // the owl keeps its existing entrance sequence untouched.
    this._banner(d.kind === 'boss' ? roundLabel : d.name,
                 d.kind === 'boss' ? d.name : `${roundLabel} · ${d.blurb}`,
                 d.kind);
    AudioBus.play(d.kind === 'boss' ? 'boss-call' : 'round-start', {});

    // Gauntlet carries on after an owl, whose score has deliberately
    // faded out. Bring the hunt arrangement back for the next ordinary wave.
    if (d.kind !== 'boss' && !this.music) this._startStageMusic();
    if (d.kind !== 'boss' && this.music) {
      // Tier two stops at gear one: it gets the horn and a stronger pulse,
      // but saves the choir, double kick and fastest tempo for the owl.
      const gear = d.kind === 'bonus' ? 1 : Math.min(1, d.tier || 0);
      const intensity = d.kind === 'bonus' ? 0.82 : 0.58 + (d.tier || 0) * 0.11;
      this.music.setGear(gear, 1.25);
      this.music.setIntensity(intensity);
      this.music.stinger(d.kind === 'bonus' ? 'bonus-round' : 'round');
    }

    /* "a gilded raven in every round" is a card, not a round — and it
       is a *spawn*, so only the host may do it. A guest that spawned
       its own had a bird with a name nobody else's wood knew, which
       the next snapshot then deleted. */
    if (this.flags.gildedEveryRound && d.kind === 'normal'
        && (!this.party || this.isHost)) {
      this._spawnOne('gilded', 'circle', {
        mode: 'orbit', dist: 55, height: 26, ang: sched.facing + 1.2, life: d.duration,
      });
    }
  }

  _endRound(cleared) {
    const R = this.round;
    if (!R) return;

    this._finishRoundAgenda(cleared);

    /* What the round was worth, as a set of numbers rather than as a
       block of code only the host can reach. Everything in it is
       already the same on all three machines — the clock, the kill
       count and the escapes are synchronised — so the same sum can be
       done on each of them, and the one part that is personal (your own
       charms) stays personal. */
    const done = {
      cleared: !!cleared,
      perfect: !!cleared && R.escaped === 0 && R.killed >= R.total,
      boss: R.def.kind === 'boss',
      timeLeft: Math.max(0, R.time),
      killed: R.killed,
      total: R.total,
    };
    this._lastRound = Object.assign({ index: R.index }, done);
    this._awardRound(done);

    if (!cleared) {
      /* The two ways a lost round can end a run. They stay here rather
         than in the shared award because they are decisions about the
         run, and only the authority makes those — a guest's own ending
         arrives as `world.state`. */
      if (this.flags.suddenDeath) { this._fail('A ROUND GOT AWAY'); return; }
      if (this.mode === 'gauntlet' && R.killed < R.total * 0.5) {
        this._loseLife('TOO MANY GOT AWAY');
        if (this.state === 'failed') return;
      }
    }

    // clear the sky before the next wave arrives
    for (const f of this.flock.list) if (!f.dying && !f.resident) f.escaped = true;
    if (this.flags.quiver) this.arrowsLeft = this.flags.quiver;

    this.round = null;
    this.boss = null;
    if (this.mode === 'prize' && this.roundIndex >= this.schedule.length - 1) {
      this._finish();
      return;
    }
    this.state = 'between';
    this.betweenT = 2.0;
  }

  /* Paying for a finished round, on every machine that played it.

     This used to live inside `_endRound`, and `_endRound` is reached
     only by the host: a guest got no clear bonus, no perfect bonus and
     no bounty on the owl, and no banner to say a round had even ended.
     Over ten rounds that is several thousand pounds between two people
     who played identically — on the strip both of them are staring at,
     which is the one number three agenda cards are judged against. */
  _awardRound(done) {
    const C = this.C;
    if (!done.cleared) {
      AudioBus.play('miss');
      this._banner('ROUND OVER', `${done.killed} of ${done.total}`, 'fail');
      return;
    }
    this.roundsCleared++;
    const boonPay = this._boonPay();
    const timeBonus = Math.round(done.timeLeft * C.roundTimeBonus);
    let bonus = (C.roundClearBonus + timeBonus) * C.moneyScale * boonPay;
    if (done.perfect) {
      bonus += C.perfectRoundBonus * C.moneyScale * boonPay;
      this.perfectRounds++;
    }
    if (done.boss) {
      const bounty = C.bossBounty * C.moneyScale * boonPay;
      bonus += bounty; this.bossesDown++; this.bossMoney += bounty;
    }
    this.bonusMoney += bonus;
    this.money += bonus;
    AudioBus.play(done.perfect ? 'round-perfect' : 'round-clear', {});
    this._banner(done.perfect ? 'PERFECT ROUND' : 'ROUND CLEAR',
                 U.money(Math.round(bonus * this.payout)), done.perfect ? 'perfect' : 'clear');
    this.timeScaleTarget = 0.55;
    setTimeout(() => { if (this.state === 'live' || this.state === 'between') this.timeScaleTarget = 1; }, 700);
  }

  _finishRoundAgenda(cleared) {
    /* A whole round spent off the line. "Most of it" is four fifths,
       which is loose enough that walking to a better angle is not a
       task and tight enough that sitting one out is. */
    const walked = this.stats.roundT > 4
                   && this.stats.offLineT > this.stats.roundT * 0.8;
    if (walked) this.stats.roundsOffLine++;
    this.stats.roundT = 0;
    this.stats.offLineT = 0;
    /* The round after a walk. Coming back and clearing one without
       putting a single arrow in the trees is the only answer to "where
       were you" that nobody follows up, so it is the alibi on that card
       — and it has to be the *next* round, not any round, or it would
       be a thing that happened to be true rather than a thing you did. */
    if (this._walkPending) {
      if (cleared && this._roundShots >= 3 && this._roundMisses === 0) {
        this.stats.cleanRoundAfterWalk = true;
      }
      this._walkPending = false;
    }
    if (walked) this._walkPending = true;
  }

  _loseLife(why) {
    this.lives--;
    this._banner('LIFE LOST', why, 'fail');
    if (this.lives <= 0) this._fail('OUT OF LIVES');
  }

  /* -------- the wood's own residents --------
     Rounds come and go; deer, foxes and rabbits live here. So do the
     bottles on the stumps and the bells hung off the branches. They are
     worth money, they keep a chain alive between waves, and they mean
     there is never a moment with nothing worth shooting at. */

  _buildResidents() {
    const C = this.C;
    const rng = U.makeRng(this.seed + 909);
    const kinds = ['deer', 'deer', 'fox', 'rabbit', 'rabbit', 'boar', 'pheasant', 'pheasant'];
    for (let i = 0; i < C.wildlife; i++) {
      this._spawnResident(kinds[(rng() * kinds.length) | 0], rng);
    }
    for (let i = 0; i < C.props; i++) {
      this._spawnResident(rng() < 0.55 ? 'bottle' : 'bell', rng);
    }
  }

  _spawnResident(kind, rng = Math.random) {
    const r = typeof rng === 'function' ? rng : Math.random;
    const type = FlyerKit.TYPES[kind];
    if (!type) return null;
    const a = r() * Math.PI * 2;
    const prop = !!type.prop;
    // props sit where you can see them; animals start further out
    const dist = prop ? U.lerp(16, 62, Math.sqrt(r())) : U.lerp(34, 105, Math.sqrt(r()));
    const x = Math.cos(a) * dist, z = Math.sin(a) * dist;
    // A stump or a gallows post standing on a slope has to be sunk to its
    // *lowest* corner, or one leg of it hangs in the air — so sample a
    // ring the width of the thing and take the worst of it, then bury it
    // a little, because sunk is invisible and floating is not.
    const foot = type.foot || 0.8;
    let ground = this.forest.heightAt(x, z);
    for (let i = 0; i < 6; i++) {
      const b = (i / 6) * Math.PI * 2;
      ground = Math.min(ground,
        this.forest.heightAt(x + Math.cos(b) * foot, z + Math.sin(b) * foot));
    }
    const sit = type.sit !== undefined ? type.sit - 0.12 : (type.ride || 0);
    const f = this.flock.spawn(kind, {
      pos: new THREE.Vector3(x, ground + sit, z),
      behaviour: prop ? 'still' : 'graze',
      head: r() * Math.PI * 2,
      life: 999,
    });
    if (f) {
      f.resident = true;
      f.homeKind = kind;
      // a resident never counts as one that got away
      f.guardFree = true;
    }
    return f;
  }

  _updateResidents(dt) {
    for (let i = this._respawn.length - 1; i >= 0; i--) {
      this._respawn[i].t -= dt;
      if (this._respawn[i].t <= 0) {
        this._spawnResident(this._respawn[i].kind);
        this._respawn.splice(i, 1);
      }
    }
  }

  /* -------- putting things in the air -------- */

  _spawnWave(n) {
    const R = this.round;
    const spec = R.def.spawn;
    const shapes = R.def.waves && R.def.waves.length ? R.def.waves : ['scatter'];
    const waveNo = R.wave || 0;
    const shape = shapes[waveNo % shapes.length];
    R.wave = waveNo + 1;
    R.waveShape = shape;
    if (spec.mode === 'formation') { R.spawned += this._spawnFormation(n); return; }
    const spawn = (typeId, slot) => {
      const place = this._wavePlacement(shape, waveNo, slot, n, spec);
      return this._spawnOne(typeId, spec.behaviour, {
        ang: place.ang,
        dist: place.dist,
        height: place.height,
        mode: place.mode,
        behaviour: place.behaviour,
        head: place.head,
        dir: place.dir,
        curve: place.curve,
        speedMult: place.speedMult,
        life: R.time + 4,
      });
    };
    for (let i = 0; i < n && R.spawned < R.total; i++) {
      /* A dove is extra, never a replacement for quarry. Guarantee one by
         the final batch of any guard round so the dove agenda cannot lose
         to random chance. Keeping it extra also bounds the loop when a
         hostile RNG returns "dove" forever. */
      const guardChance = R.def.guards || 0;
      const finalBatch = R.spawned + (n - i) >= R.total;
      const guard = guardChance > 0
        && (Math.random() < guardChance || (!R.guardSpawned && finalBatch));
      if (guard) {
        const dove = spawn('dove', i + n);
        if (dove) R.guardSpawned++;
      }
      const typeAt = shape === 'relay' || shape === 'roulette'
        ? (waveNo + i) % spec.types.length
        : (Math.random() * spec.types.length) | 0;
      if (spawn(spec.types[typeAt], i)) R.spawned++;
    }
  }

  /* Every round has a short authored sequence of wave shapes. The targets
     and rules still define the round, while this layer changes where a
     wave enters, how tightly it flies and whether it crosses or charges.
     That makes the same round escalate instead of replaying one dice roll. */
  _wavePlacement(shape, waveNo, i, n, spec) {
    const u = n <= 1 ? 0.5 : i / (n - 1);
    const side = (i + waveNo) % 2 ? 1 : -1;
    const midDist = (spec.dist[0] + spec.dist[1]) * 0.5;
    const midHeight = (spec.height[0] + spec.height[1]) * 0.5;
    const o = {
      ang: this._spawnAngle(spec, i),
      dist: U.lerp(spec.dist[0], spec.dist[1], Math.random()),
      height: U.lerp(spec.height[0], spec.height[1], Math.random()),
      mode: spec.mode,
      behaviour: spec.behaviour,
      head: undefined,
      dir: undefined,
      curve: undefined,
      speedMult: 1,
    };

    if (shape === 'parade' || shape === 'salvo') {
      o.ang = this.round.facing + (u - 0.5) * 0.28;
      o.dist = midDist;
      o.height = midHeight + (i - (n - 1) * 0.5) * (shape === 'salvo' ? 1.8 : 0.8);
      o.speedMult = shape === 'salvo' ? 1.12 : 1;
    } else if (shape === 'high-low') {
      o.ang = this.round.facing + side * 0.34;
      o.height = i % 2 ? spec.height[1] : spec.height[0];
    } else if (shape === 'split' || shape === 'pincer') {
      o.ang = this.round.facing + side * Math.max(0.62, (spec.arc || 1.5) * 0.46);
      o.dist = midDist + side * (spec.dist[1] - spec.dist[0]) * 0.12;
      if (shape === 'pincer') {
        o.mode = 'swarm'; o.behaviour = 'dive'; o.speedMult = 1.08;
      }
    } else if (shape === 'crosscut') {
      o.ang = this.round.facing + (i % 2) * Math.PI + (u - 0.5) * 0.35;
      o.dist = midDist;
      o.height = midHeight + side * 4;
    } else if (shape === 'cascade' || shape === 'echelon') {
      o.ang = this.round.facing + (u - 0.5) * (spec.arc || 1.4) * 0.7;
      o.height = U.lerp(spec.height[1], spec.height[0], u);
      o.dist = U.lerp(spec.dist[0], spec.dist[1], shape === 'echelon' ? u : 1 - u);
    } else if (shape === 'rush' || shape === 'dive') {
      o.ang = this.round.facing + (u - 0.5) * (spec.arc || 1.8);
      o.dist = spec.dist[0] + (spec.dist[1] - spec.dist[0]) * 0.25;
      o.mode = 'swarm'; o.behaviour = 'dive'; o.speedMult = shape === 'rush' ? 1.18 : 1.05;
    } else if (shape === 'spiral' || shape === 'constellation') {
      const spread = shape === 'spiral' ? Math.PI * 2 : (spec.arc || Math.PI * 2);
      o.ang = this.round.facing + waveNo * 0.72 + u * spread;
      o.dist = U.lerp(spec.dist[0], spec.dist[1], shape === 'spiral'
        ? ((waveNo + i) % 4) / 3 : Math.random());
      o.height = U.lerp(spec.height[0], spec.height[1], (i * 0.618 + waveNo * 0.23) % 1);
    } else if (shape === 'curtain' || shape === 'fan') {
      o.ang = this.round.facing + (u - 0.5) * (spec.arc || 2.4);
      o.dist = midDist;
      o.height = shape === 'fan' ? U.lerp(spec.height[0], spec.height[1], u) : midHeight;
    } else if (shape === 'counter' || shape === 'orbit' || shape === 'tighten') {
      o.ang = this.round.facing + u * Math.PI * 2;
      o.dir = shape === 'counter' ? side : (waveNo % 2 ? -1 : 1);
      o.dist = shape === 'tighten' ? spec.dist[0] : midDist;
      o.height = midHeight + side * 3;
      o.speedMult = shape === 'tighten' ? 1.18 : 1;
    } else if (shape === 'relay') {
      o.ang = this.round.facing + side * 0.48 + (u - 0.5) * 0.2;
      o.height = midHeight + i * 2.5;
      o.curve = side * Math.max(0.08, spec.curve || 0);
    } else if (shape === 'roulette') {
      const behaviours = ['cruise', 'zigzag', 'dive'];
      o.behaviour = behaviours[(waveNo + i) % behaviours.length];
      if (o.behaviour === 'dive') o.mode = 'swarm';
      o.ang = this.round.facing + (u - 0.5) * (spec.arc || 3);
    }
    return o;
  }

  _spawnAngle(spec, i) {
    const R = this.round;
    let base = R.facing;
    if (spec.mode === 'cross') base += (i % 2) * Math.PI;
    return base + (Math.random() - 0.5) * (spec.arc || 1.5);
  }

  _spawnOne(typeId, behaviour, o) {
    const R = this.round;
    const spec = (R && R.def.spawn) || {};
    const mode = o.mode || spec.mode || 'sweep';
    const range = (o.dist || 70) * this.C.rangeScale * (this.flags.rangeScale || 1);
    const ang = o.ang ?? Math.random() * 6.28;
    // around wherever you are standing now, not around where you started
    const cx = this.pos.x, cz = this.pos.z;
    const x = cx + Math.cos(ang) * range, z = cz + Math.sin(ang) * range;
    const ground = this.forest.heightAt(x, z);
    const y = ground + (o.height ?? 24);
    const speed = (FlyerKit.TYPES[typeId].speed[0]
      + Math.random() * (FlyerKit.TYPES[typeId].speed[1] - FlyerKit.TYPES[typeId].speed[0]))
      * (R ? R.speedScale : 1) * (o.speedMult || 1);

    const opts = {
      pos: new THREE.Vector3(x, y, z),
      behaviour: o.behaviour || behaviour,
      speed,
      life: o.life || 30,
      curve: o.curve ?? ((spec.curve || 0) * (Math.random() < 0.5 ? -1 : 1)),
    };

    if (mode === 'sweep' || mode === 'cross') {
      // crossing the view rather than flying at it: the shot that has to
      // be led is the one worth taking
      const side = Math.random() < 0.5 ? 1 : -1;
      opts.head = o.head ?? (ang + Math.PI + side * (Math.PI / 2) * U.lerp(0.55, 1.0, Math.random()));
    } else if (mode === 'orbit' || mode === 'boss') {
      opts.behaviour = mode === 'boss' ? 'boss' : 'circle';
      opts.centre = new THREE.Vector3(cx, y, cz);
      opts.orbit = range;
      opts.orbitTarget = mode === 'boss' ? Math.max(34, range * 0.62) : range;
      opts.ang = ang;
      opts.dir = o.dir ?? (Math.random() < 0.5 ? 1 : -1);
      opts.attackT = 6;
    } else if (mode === 'rise') {
      opts.behaviour = 'drift';
      opts.pos.y = ground + (o.height ?? 3);
      opts.speed = speed;
    } else if (mode === 'swarm') {
      opts.behaviour = 'dive';
      opts.head = ang + Math.PI;
    }

    const f = this.flock.spawn(typeId, opts);
    if (!f) return null;
    if (f.type.boss) this._beginBoss(f);

    if (mode === 'launch') {
      // thrown up and inwards, the way a trap throws a clay
      f.behaviour = 'arc';
      const to = this._tmpV.set(cx - x, 0, cz - z).normalize();
      const sp = speed;
      f.vel.set(to.x * sp, 14 + Math.random() * 6, to.z * sp);
    }
    if (mode === 'swarm') f.vel.set(-Math.cos(ang) * speed, 0, -Math.sin(ang) * speed);
    return f;
  }

  // returns how many birds actually went up, so the round can count them
  _spawnFormation(n) {
    const R = this.round;
    const spec = R.def.spawn;
    const shape = R.waveShape || 'vee';
    const ang = this._spawnAngle(spec, 0);
    const lead = this._spawnOne(spec.types[0], 'cruise', {
      ang, dist: U.lerp(spec.dist[0], spec.dist[1], Math.random()),
      height: U.lerp(spec.height[0], spec.height[1], Math.random()),
      mode: 'sweep', life: R.time + 6,
    });
    if (!lead) return 0;
    let made = 1;
    for (let i = 1; i < n; i++) {
      const s = shape === 'echelon' ? 1 : (i % 2 ? 1 : -1);
      const rank = shape === 'echelon' ? i : Math.ceil(i / 2);
      const gap = shape === 'break' ? 7 : 5;
      const lift = shape === 'break' ? 1.7 : 0.8;
      const f = this.flock.spawn(spec.types[0], {
        pos: lead.pos.clone().add(new THREE.Vector3(s * rank * gap, rank * lift, rank * gap)),
        behaviour: 'formation',
        leader: lead,
        slot: { x: s * rank * gap, y: rank * lift, z: rank * gap },
        life: R.time + 6,
      });
      if (f) { f.head = lead.head; made++; }
    }
    return made;
  }

  /* -------- effects -------- */

  _deathFx(target, info, clean) {
    const kind = target.type.death;
    const col = new THREE.Color(target.type.deathColor || '#ffffff');
    const p = info ? info.point : target.pos;
    if (this.visualFx && (kind === 'feathers' || kind === 'shards')) this.visualFx.burst(p, target.type);
    if (target.type.id === 'bell') AudioBus.play('shootout-surface', { surface: 'bell' });
    const n = kind === 'feathers' ? 26 : kind === 'embers' ? 34 : 30;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, sp = 2 + Math.random() * (kind === 'shards' ? 16 : 7);
      const vy = kind === 'embers' ? 2 + Math.random() * 6 : 1 + Math.random() * 7;
      const field = kind === 'feathers' ? this.fx.bits : this.fx.sparks;
      field.emit(p.x, p.y, p.z,
        Math.cos(a) * sp, vy, Math.sin(a) * sp,
        kind === 'feathers' ? 0.8 + Math.random() * 0.9 : 0.5 + Math.random() * 0.8,
        kind === 'feathers' ? 1.4 + Math.random() : 0.6 + Math.random() * 0.7,
        col);
    }
    if (kind === 'gold' || clean) {
      this.fx.rings.fire(p, this.camera.quaternion, 0.4, clean ? 4.5 : 3,
                         0.4, kind === 'gold' ? '#ffd166' : '#ffffff');
    }
    AudioBus.play(kind === 'shards' ? 'flyer-shatter'
                : kind === 'embers' || kind === 'gold' ? 'flyer-pop' : 'flyer-hit',
                { pitch: 1 / (target.type.size * 1.6 + 0.4) });
  }

  /* -------- ghost pace -------- */

  _recordGhost(dt) {
    this._recAcc += dt;
    if (this._recAcc < this.C.ghostRate) return;
    this._recAcc = 0;
    this.rec.t.push(Math.round(this.elapsed * 10) / 10);
    this.rec.m.push(Math.round(this.money));
  }

  _updateGhost() {
    if (!this.ghost) { this.ghostDelta = null; return; }
    const t = this.ghost.t, m = this.ghost.m;
    // where your best run had got to by now
    let i = this._ghostI || 0;
    while (i < t.length - 1 && t[i + 1] <= this.elapsed) i++;
    this._ghostI = i;
    const was = m[Math.min(i, m.length - 1)];
    this.ghostDelta = Math.round(this.money - was);
  }

  /* -------- end states -------- */

  _finish() {
    if (this.state === 'finished' || this.state === 'failed') return;
    this.state = 'finished';
    const mine = Math.round(this._net());
    this.stats.topOfField = this.peers.size > 0
      && [...this.peers.keys()].every(id => mine > (this.scores.get(id) || 0));
    this.stats.finished = true;
    if (this.music) { this.music.stop(1.2); this.music = null; }
    // hand the mouse back before the scoreboard arrives
    Input.setMouseAim(false);
    this._aimOn = false;
    const earned = Math.round(Math.max(0, this.money - this.penalty) * this.payout);
    const medal = this._medalFor(earned);
    AudioBus.play('finish');
    this._setCenter('THE WOOD IS QUIET', U.money(earned), 'go');
    this.timeScaleTarget = 0.4;
    this._confetti();
    this.result = this._buildResult({ completed: true, earned, medal });
    this._reportT = setTimeout(() => this._report(), 2000);
  }

  _fail(reason) {
    if (this.state === 'finished' || this.state === 'failed') return;
    this.state = 'failed';
    this.stats.finished = false;
    if (this.music) { this.music.stop(1.2); this.music = null; }
    // hand the mouse back before the scoreboard arrives
    Input.setMouseAim(false);
    this._aimOn = false;
    AudioBus.play('miss');
    this._setCenter(reason || 'RUN OVER', '', 'bad');
    this.timeScaleTarget = 0.45;
    // what you have banked is yours, less what the doves cost
    const earned = Math.round(Math.max(0, this.money - this.penalty) * this.payout
                              * (this.flags.suddenDeath ? 0.5 : 1));
    this.result = this._buildResult({
      completed: false, earned, medal: 0, reason: reason || 'RUN OVER',
    });
    this._reportT = setTimeout(() => this._report(), 1900);
  }

  _confetti() {
    const p = this.camera.position;
    const cols = ['#ffd166', '#e5133f', '#3ddc84', '#39e6ff', '#ffffff'];
    for (let i = 0; i < 200; i++) {
      const a = Math.random() * 6.28, sp = 5 + Math.random() * 18;
      this.fx.sparks.emit(
        p.x + (Math.random() - 0.5) * 6, p.y + 2 + Math.random() * 4, p.z + (Math.random() - 0.5) * 6,
        Math.cos(a) * sp, 7 + Math.random() * 14, Math.sin(a) * sp,
        1.2 + Math.random() * 1.6, 1.5 + Math.random() * 1.2,
        new THREE.Color(cols[(Math.random() * cols.length) | 0]));
    }
  }

  _buildResult(part) {
    const acc = this.shots ? this.hits / this.shots : 0;
    return Object.assign({
      mode: this.mode,
      modeName: this.opts.bossRush ? 'Boss Hunt' : this.modeDef.name,
      bossRush: this.opts.bossRush,
      seed: this.seed,
      courseName: this.forestName,
      conditionText: ForestConditions.describe(this.cond),
      modId: this.opts.modId,
      modName: this.twist ? this.twist.name : null,
      payout: this.payout,
      key: this.key,
      quarryMoney: Math.round(this.money - this.bonusMoney),
      bonusMoney: Math.round(this.bonusMoney - this.bossMoney),
      bossMoney: this.bossMoney,
      penalty: this.penalty,
      kills: this.kills,
      shots: this.shots,
      accuracy: acc,
      cleanShots: this.cleanShots,
      cleanHits: this.cleanHits,
      doves: this.doves,
      escapes: this.escapes,
      stings: this.stings,
      bestChain: this.bestChain,
      bestMult: 1 + Math.min(this.bestChain, this.C.chainCap) * this.C.chainStep,
      rounds: this.roundIndex + 1,
      roundsTotal: this.mode === 'prize' ? this.roundCount : this.roundIndex + 1,
      roundsCleared: this.roundsCleared,
      perfectRounds: this.perfectRounds,
      bossesDown: this.bossesDown,
      boonsTaken: this.boonsTaken,
      elapsed: this.elapsed,
      par: this.par,
      stats: Object.assign({}, this.stats,
                           { doves: this.doves, bestChain: this.bestChain,
                             kills: this.kills }),
    }, part);
  }

  _report() {
    if (this.reported || !this.result) return;
    this.reported = true;
    const r = this.result;
    const { isBest } = GameState.recordRun('shootout', this.key, r, this.modeDef.better);
    r.courseBest = isBest;
    r.ghostDelta = this.ghost && this.ghostDelta !== null ? this.ghostDelta : null;
    if (isBest && this.rec.t.length > 3) {
      GameState.saveGhost('shootout', this.key, {
        dt: this.C.ghostRate, t: this.rec.t, m: this.rec.m, earned: r.earned,
      });
    }
    Missions.complete(r);
  }

  _pause() {
    Engine.setPaused(true);
    Input.setMouseAim(false);
    this._aimOn = false;
    document.getElementById('pause-restart').hidden = !!this.party;
    Screens.show('pause');
  }

  /* -------- HUD -------- */

  _flash(amount, color) {
    const f = this.hud.flash;
    if (!f || ShootoutMaterials.reduced()) return;
    f.style.background = color;
    f.style.opacity = String(U.clamp(amount, 0, 0.8));
    clearTimeout(this._flashT);
    this._flashT = setTimeout(() => { f.style.opacity = '0'; }, 70);
  }

  /* Everything that takes money off you says so the same way: the purse
     itself flinches, and the amount hangs under it in red. Losing money
     quietly is the one thing a shooting gallery must never do. */
  _docked(amount, what) {
    const h = this.hud;
    if (!h || !h.docked) return;
    h.docked.textContent = '−' + U.money(Math.round(amount * this.payout)) + '  ' + what;
    h.docked.classList.remove('show');
    void h.docked.offsetWidth;
    h.docked.classList.add('show');
    h.money.classList.remove('hurt');
    void h.money.offsetWidth;
    h.money.classList.add('hurt');
    clearTimeout(this._dockT);
    this._dockT = setTimeout(() => {
      h.docked.classList.remove('show');
      h.money.classList.remove('hurt');
    }, 1600);
  }

  _setCenter(big, small, cls) {
    const c = this.hud.center;
    if (!c) return;
    if (!big && !small) { c.classList.remove('show'); c.innerHTML = ''; return; }
    c.className = 'center-msg show ' + (cls || '');
    c.innerHTML = `<div class="big">${big}</div>` + (small ? `<div class="small">${small}</div>` : '');
  }

  _banner(title, sub, cls) {
    const b = this.hud.banner;
    if (!b) return;
    b.className = 'sh-banner show ' + (cls || '');
    b.innerHTML = `<div class="sb-title">${title}</div><div class="sb-sub">${sub || ''}</div>`;
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => b.classList.remove('show'), 1900);
  }

  _updateHud(dt) {
    const h = this.hud, C = this.C;
    if (h.root) h.root.classList.toggle('reduce-motion', ShootoutMaterials.reduced());
    if (!h.money) return;
    const shown = Math.round(Math.max(0, this.money - this.penalty) * this.payout);
    h.money.textContent = U.money(shown);

    const mult = this._chainMult();
    h.chainWrap.classList.toggle('on', this.chain > 0);
    h.chain.textContent = '×' + mult.toFixed(2).replace(/\.?0+$/, '');
    const left = this.chain > 0 ? U.clamp(this.chainT / C.chainWindow, 0, 1) : 0;
    h.chainBar.style.width = (left * 100) + '%';
    h.chainBar.classList.toggle('low', left < 0.3);

    // the round pill
    const R = this.round;
    if (this.mode === 'prize') {
      h.round.textContent = R ? `ROUND ${R.index + 1}/${this.roundCount}` : '—';
    } else {
      h.round.textContent = R ? `WAVE ${R.index + 1}` : '—';
    }
    h.roundName.textContent = R ? R.def.name : (this.state === 'between' ? 'Next wave…' : '');
    h.roundBar.style.width = R ? U.clamp(R.time / R.duration, 0, 1) * 100 + '%' : '0%';
    h.roundBar.classList.toggle('low', !!R && R.time < 5);

    h.left.textContent = R ? `${R.killed}/${R.total}` : '—';
    h.acc.textContent = this.shots ? Math.round((this.hits / this.shots) * 100) + '%' : '—';

    // the draw, as a ring around the reticle and a bar under it
    const b = this.bow;
    const drawing = b.state === 'drawing';
    h.drawFill.style.width = (b.charge * 100) + '%';
    h.draw.classList.toggle('on', drawing);
    h.draw.classList.toggle('perfect', b.perfect);
    h.draw.classList.toggle('strain', (b.strain || 0) > 0.15);
    h.reticle.className = 'sh-reticle'
      + (b.perfect ? ' perfect' : '')
      + (drawing ? ' drawing' : '')
      + (b.state === 'nocking' ? ' nocking' : '')
      + (this.focusing ? ' focus' : '')
      + (this.lockName ? (this.lockGuard ? ' lock lock-bad' : ' lock') : '');
    if (h.lock) h.lock.textContent = this.lockName || '';
    // the reticle opens with sway and closes as the draw comes good
    const spread = 14 + (1 - b.charge) * 16 + (b.strain || 0) * 26;
    h.reticle.style.setProperty('--spread', spread.toFixed(1) + 'px');

    h.breathFill.style.width = (this.breath / C.breathMax * 100) + '%';
    h.breath.classList.toggle('using', this.focusing);
    if (h.focus) h.focus.style.opacity = this.focusing ? '1' : '0';
    if (h.rush) h.rush.style.opacity = this.sprinting ? String(0.3 + this.speed01 * 0.45) : '0';

    if (this.flags.quiver) h.quiverVal.textContent = String(Math.max(0, this.arrowsLeft));
    if (this.mode === 'gauntlet' && h.lives) {
      h.lives.innerHTML = '';
      for (let i = 0; i < C.lives; i++) {
        const d = document.createElement('i');
        d.className = 'sh-life' + (i < this.lives ? ' on' : '');
        h.lives.appendChild(d);
      }
    }

    if (h.pace && this.ghost) {
      const d = this.ghostDelta;
      if (d === null || this.state !== 'live') { h.pace.textContent = '—'; h.pace.className = 'sh-pace show'; }
      else {
        h.pace.textContent = (d >= 0 ? '+' : '−') + U.money(Math.abs(d));
        h.pace.className = 'sh-pace show ' + (d >= 0 ? 'ahead' : 'behind');
      }
    }

    // the owl's bar: which part is open, and how much of it is left
    if (h.boss) {
      const B = this.boss;
      const on = !!(B && B.phase >= 0 && !B.down);
      h.boss.className = 'sh-boss' + (on ? ' show' : '')
        + (on && B.staggerT > 0 ? ' stagger' : '') + (on && B.open ? ' open' : '');
      if (on) {
        const P = ShootoutMission.BOSS_PHASES[B.phase];
        h.bossPhase.textContent = B.staggerT > 0 ? 'STAGGERED'
          : B.open ? P.name + ' — OPEN' : P.name + ' — SHIELDED';
        if (h.bossPips.childElementCount !== P.need) {
          h.bossPips.innerHTML = '';
          for (let i = 0; i < P.need; i++) {
            const d = document.createElement('i');
            d.className = 'sb-pip';
            h.bossPips.appendChild(d);
          }
        }
        [...h.bossPips.children].forEach((el, i) => {
          el.classList.toggle('on', i < P.need - B.hits);
        });
        // and which of the four fights this is
        if (h.bossStages) {
          const n = ShootoutMission.BOSS_PHASES.length;
          if (h.bossStages.childElementCount !== n) {
            h.bossStages.innerHTML = '';
            for (let i = 0; i < n; i++) {
              const d = document.createElement('i');
              d.className = 'sb-stage';
              h.bossStages.appendChild(d);
            }
          }
          [...h.bossStages.children].forEach((el, i) => {
            el.className = 'sb-stage' + (i < B.phase ? ' done' : i === B.phase ? ' now' : '');
          });
        }
      }
    }

    this._updateBoonHud();

    if (h.hint) {
      /* "Click to aim" is only true where there is a pointer to take.
         `aimReady` is false in exactly that case — never for a thumb,
         and never on a browser with no pointer lock to offer, which
         used to leave this burning on an iPad for the whole round. */
      const need = !Input.aimReady && this.state !== 'finished';
      h.hint.classList.toggle('show', need);
    }
  }

  /* The charms you are holding. The row is rebuilt only when the *set*
     of them changes, and the bars inside it are written every frame —
     rebuilding four chips at sixty hertz throws away the animation that
     tells you a new one arrived. */
  _updateBoonHud() {
    const el = this.hud && this.hud.boons;
    if (!el) return;
    const live = Object.keys(this.buffs).filter(k => this.buffs[k] > 0);
    const key = live.join(',');
    if (key !== this._boonKey) {
      this._boonKey = key;
      el.innerHTML = '';
      this._boonEls = {};
      for (const k of live) {
        const B = ShootoutMission.BOONS[k];
        const chip = document.createElement('div');
        chip.className = 'sh-boon';
        chip.style.setProperty('--bc', B.color);
        chip.innerHTML = `<b>${B.name}</b><span class="bt"><i></i></span>`;
        el.appendChild(chip);
        this._boonEls[k] = chip;
      }
    }
    for (const k of live) {
      const chip = this._boonEls && this._boonEls[k];
      if (!chip) continue;
      const left = U.clamp(this.buffs[k] / ShootoutMission.BOONS[k].time, 0, 1);
      chip.querySelector('.bt > i').style.width = (left * 100) + '%';
      chip.classList.toggle('low', this.buffs[k] < 2.5);
    }
  }
}

/* ---- sounds this mission owns ---- */

AudioBus.define('dove', (c, dest) => {
  const t = c.currentTime;
  [[440, 0], [330, 0.09], [220, 0.19]].forEach(([f, d]) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t + d);
    o.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0.0001, t + d);
    g.gain.exponentialRampToValueAtTime(0.16, t + d + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.3);
    o.start(t + d); o.stop(t + d + 0.4);
  });
});

// a footfall: a soft thump with a little leaf-litter on top
AudioBus.define('step', (c, dest, o) => {
  const t = c.currentTime, amt = U.clamp(o.amount ?? 0.6, 0.1, 1);
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(110 + Math.random() * 30, t);
  osc.frequency.exponentialRampToValueAtTime(48, t + 0.09);
  osc.connect(g); g.connect(dest);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.06 * amt, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
  osc.start(t); osc.stop(t + 0.18);
  const n = AudioBus.noiseSource();
  if (!n) return;
  const f = c.createBiquadFilter(), ng = c.createGain();
  f.type = 'bandpass'; f.frequency.setValueAtTime(2600 + Math.random() * 900, t); f.Q.value = 0.8;
  n.connect(f); f.connect(ng); ng.connect(dest);
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.05 * amt, t + 0.006);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
  n.start(t); n.stop(t + 0.16);
});

/* The owl. A screech is a rising, wavering shriek with grit in it; the
   gust is a slab of low noise; the death is the screech falling apart. */
AudioBus.define('owl-screech', (c, dest, o) => {
  const t = c.currentTime, p = o.pitch || 1;
  const osc = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(420 * p, t);
  osc.frequency.exponentialRampToValueAtTime(980 * p, t + 0.14);
  osc.frequency.exponentialRampToValueAtTime(300 * p, t + 0.85);
  const lfo = c.createOscillator(), lg = c.createGain();
  lfo.type = 'sine'; lfo.frequency.value = 17; lg.gain.value = 60 * p;
  lfo.connect(lg); lg.connect(osc.frequency);
  f.type = 'bandpass'; f.frequency.value = 1500 * p; f.Q.value = 1.4;
  osc.connect(f); f.connect(g); g.connect(dest);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.3, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
  osc.start(t); lfo.start(t); osc.stop(t + 1.1); lfo.stop(t + 1.1);
  const n = AudioBus.noiseSource();
  if (!n) return;
  const nf = c.createBiquadFilter(), ng = c.createGain();
  nf.type = 'bandpass'; nf.frequency.setValueAtTime(2400 * p, t); nf.Q.value = 0.9;
  n.connect(nf); nf.connect(ng); ng.connect(dest);
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.12, t + 0.06);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
  n.start(t); n.stop(t + 0.9);
});

AudioBus.define('owl-gust', (c, dest) => {
  const t = c.currentTime;
  const n = AudioBus.noiseSource();
  if (!n) return;
  const f = c.createBiquadFilter(), g = c.createGain();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(1200, t);
  f.frequency.exponentialRampToValueAtTime(180, t + 0.5);
  n.connect(f); f.connect(g); g.connect(dest);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.34, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  n.start(t); n.stop(t + 0.7);
});

/* A charm rising is a bell that opens upwards; taking one is the same
   bell arriving; losing one is it closing again. Three shapes of the
   same sound, so a run of charms reads as one system. */
AudioBus.define('boon-rise', (c, dest) => {
  const t = c.currentTime;
  [523.25, 659.25, 987.77].forEach((f, i) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f, t + i * 0.1);
    o.frequency.linearRampToValueAtTime(f * 1.02, t + i * 0.1 + 0.5);
    o.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0.0001, t + i * 0.1);
    g.gain.exponentialRampToValueAtTime(0.11, t + i * 0.1 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.1 + 0.9);
    o.start(t + i * 0.1); o.stop(t + i * 0.1 + 1);
  });
});

AudioBus.define('boon-take', (c, dest) => {
  const t = c.currentTime;
  [659.25, 987.77, 1318.5, 1975.5].forEach((f, i) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = i > 1 ? 'sine' : 'triangle';
    o.frequency.setValueAtTime(f, t + i * 0.045);
    o.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0.0001, t + i * 0.045);
    g.gain.exponentialRampToValueAtTime(0.16 / (i * 0.5 + 1), t + i * 0.045 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.045 + 0.7);
    o.start(t + i * 0.045); o.stop(t + i * 0.045 + 0.8);
  });
});

AudioBus.define('boon-end', (c, dest) => {
  const t = c.currentTime;
  [987.77, 659.25].forEach((f, i) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f, t + i * 0.07);
    o.frequency.exponentialRampToValueAtTime(f * 0.75, t + i * 0.07 + 0.35);
    o.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0.0001, t + i * 0.07);
    g.gain.exponentialRampToValueAtTime(0.07, t + i * 0.07 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.07 + 0.4);
    o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.5);
  });
});

AudioBus.define('boss-hurt', (c, dest) => {
  const t = c.currentTime;
  [[880, 0], [1320, 0.05]].forEach(([hz, d]) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'square'; o.frequency.setValueAtTime(hz, t + d);
    o.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0.0001, t + d);
    g.gain.exponentialRampToValueAtTime(0.16, t + d + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.22);
    o.start(t + d); o.stop(t + d + 0.3);
  });
});

AudioBus.define('boss-clang', (c, dest) => {
  const t = c.currentTime;
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'square';
  o.frequency.setValueAtTime(240, t);
  o.frequency.exponentialRampToValueAtTime(120, t + 0.1);
  o.connect(g); g.connect(dest);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.1, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  o.start(t); o.stop(t + 0.2);
});

AudioBus.define('owl-death', (c, dest) => {
  const t = c.currentTime;
  const osc = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(760, t);
  osc.frequency.exponentialRampToValueAtTime(90, t + 1.9);
  f.type = 'lowpass'; f.frequency.setValueAtTime(2600, t);
  f.frequency.exponentialRampToValueAtTime(320, t + 1.9);
  osc.connect(f); f.connect(g); g.connect(dest);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.32, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.1);
  osc.start(t); osc.stop(t + 2.3);
  const o2 = c.createOscillator(), g2 = c.createGain();
  o2.type = 'sine';
  o2.frequency.setValueAtTime(70, t + 1.6);
  o2.frequency.exponentialRampToValueAtTime(28, t + 2.3);
  o2.connect(g2); g2.connect(dest);
  g2.gain.setValueAtTime(0.0001, t + 1.6);
  g2.gain.exponentialRampToValueAtTime(0.4, t + 1.68);
  g2.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
  o2.start(t + 1.6); o2.stop(t + 2.5);
});

AudioBus.define('round-start', (c, dest) => {
  const t = c.currentTime;
  [523.25, 783.99].forEach((f, i) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(f, t + i * 0.09);
    o.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0.0001, t + i * 0.09);
    g.gain.exponentialRampToValueAtTime(0.15, t + i * 0.09 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.4);
    o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.5);
  });
});

AudioBus.define('round-clear', (c, dest) => {
  const t = c.currentTime;
  [523.25, 659.25, 783.99].forEach((f, i) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(f, t + i * 0.08);
    o.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0.0001, t + i * 0.08);
    g.gain.exponentialRampToValueAtTime(0.18, t + i * 0.08 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.08 + 0.5);
    o.start(t + i * 0.08); o.stop(t + i * 0.08 + 0.6);
  });
});

AudioBus.define('round-perfect', (c, dest) => {
  const t = c.currentTime;
  [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f, t + i * 0.07);
    o.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0.0001, t + i * 0.07);
    g.gain.exponentialRampToValueAtTime(0.17, t + i * 0.07 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.07 + 0.7);
    o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.8);
  });
});

AudioBus.define('boss-call', (c, dest) => {
  const t = c.currentTime;
  const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(110, t);
  o.frequency.exponentialRampToValueAtTime(55, t + 1.2);
  f.type = 'lowpass'; f.frequency.setValueAtTime(600, t);
  o.connect(f); f.connect(g); g.connect(dest);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.3, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
  o.start(t); o.stop(t + 1.5);
});

/* ---- register with the game ---- */
Missions.register({
  id: 'shootout',
  name: 'Shootout',
  tagline: 'Half a second of draw. Everything else is in the air.',
  description:
    'A clearing in a wood that the seed drew, with a low stand in the middle of it and a bow '
    + 'that comes to full draw in half a second. Ten rounds of quarry come through — ravens, '
    + 'lanterns, clays, bats, a flight of geese, whatever this run dealt — and the owl at the '
    + 'end of them. Let go inside the window at full draw and the loose is clean: worth half '
    + 'again, and it goes straight through and takes the next one too. Miss, and the chain '
    + 'you have been building goes with it. And never, ever shoot the white dove.',
  icon: '02',
  maxPrize: 75000,
  players: '1-3',
  duration: '~3 min',
  order: 1,
  quickStart: {
    label: 'Fight Owl', icon: '◉', title: 'Jump straight to The Great Owl',
    opts: { mode: 'prize', bossRush: true, ghost: false },
  },
  setup: true,
  hudScreen: 'hud-shoot',
  setupLabels: { course: 'Wood', modifier: 'Twist' },
  preview: (opts) => ShootoutMission.preview(opts),
  modes: ShootoutMission.MODES,
  medals: ShootoutMission.MEDALS,
  create: (opts) => new ShootoutMission(opts),
  better: (a, b) => (a.earned || 0) > (b.earned || 0),

  tips: [
    '<b>Walk it.</b> <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> moves you around the '
      + 'clearing and <kbd>Q</kbd> runs. A drawn bow slows you down, so pick your ground '
      + 'before you pull.',
    '<b>The wood is full.</b> Deer, foxes, rabbits, pheasants that burst out of the grass, '
      + 'bottles on stumps and bells in the trees — all of it is worth money, all of it '
      + 'keeps the chain alive, and it all comes back.',
    '<b>Half a second.</b> Full draw at 0.50s. Let go in the window straight after and it '
      + 'is a <i>clean loose</i>: half again the money, and the arrow carries on through '
      + 'whatever it hits.',
    '<b>Hold your breath.</b> <kbd>Right mouse</kbd> slows the world and steadies your hand '
      + 'while it lasts. It runs out, and it comes back slowly.',
    '<b>Lead your shot.</b> Arrows are real: they take time to arrive, drop, and move with '
      + 'the wind. Nothing bends them towards a target. The easier Steady Hand card can '
      + 'reveal an intercept mark; a standard run leaves the whole lead to you.',
    '<b>Keep the chain.</b> Every hit raises the multiplier. A miss, a dove, or four quiet '
      + 'seconds and it falls away.',
    '<b>Never the dove.</b> The white one costs you money, seconds and the whole chain.',
    '<b>Clear the round early.</b> Every second left on the round clock is paid for, and a '
      + 'round where nothing got away pays again on top.',
  ],
  keys: ['<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move · <kbd>Q</kbd> run',
         '<kbd>Mouse</kbd> aim', '<kbd>Hold</kbd> draw, release to loose',
         '<kbd>RMB</kbd> steady'],

  /* The columns the wood argues about afterwards. Every card in this
     deck moves one of these — and every card's alibi moves another one
     the other way, so the same row reads as a confession or as the best
     shooting anybody did all night depending on how it was earned. Ten
     misses beside a chain of twelve is a style. Ten beside a chain of
     three is a conversation. */
  report: (r) => {
    const st = r.stats || {};
    return {
      earned: r.earned,
      completed: r.completed,
      columns: ['Money', 'Kills', 'Best chain', 'Missed', 'Escaped', 'Doves', 'Off line'],
      cells: [
        U.money(r.earned || 0),
        String(r.kills || 0),
        '×' + String(st.bestChain || 0),
        String(st.missed || 0),
        String(st.escapedNearMe || 0),
        String(st.doves || 0),
        String(st.roundsOffLine || 0),
      ],
      stats: st,
    };
  },

  resultRows: (r) => {
    const rows = [
      ['Quarry taken', String(r.kills)],
      ['Accuracy', `${Math.round(r.accuracy * 100)}% of ${r.shots} arrows`],
      ['Clean looses', `${r.cleanShots}${r.shots ? ` (${Math.round(r.cleanShots / r.shots * 100)}%)` : ''}`],
      ['Best multiplier', '×' + r.bestMult.toFixed(2).replace(/\.?0+$/, '')],
      ['Rounds cleared', `${r.roundsCleared}/${r.roundsTotal}`],
    ];
    if (r.perfectRounds) rows.push(['Perfect rounds', String(r.perfectRounds)]);
    if (r.boonsTaken) rows.push(['Owl charms taken', String(r.boonsTaken)]);
    if (r.escapes) rows.push(['Got away', String(r.escapes)]);
    if (r.doves) rows.push(['Doves shot', String(r.doves)]);
    rows.push(null, ['Quarry earnings', U.money(r.quarryMoney)]);
    if (r.bonusMoney) rows.push(['Round bonuses', U.money(r.bonusMoney)]);
    if (r.bossMoney) rows.push(['Bounty on the owl', U.money(r.bossMoney)]);
    if (r.penalty) rows.push(['Penalties', '−' + U.money(r.penalty)]);
    if (r.payout && Math.abs(r.payout - 1) > 0.005) {
      const why = [r.conditionText, r.modName].filter(Boolean).join(' · ');
      rows.push([`Conditions ×${r.payout.toFixed(2)}`, why]);
    }
    if (!r.completed) rows.push(['Run ended early', r.reason || '']);
    return rows;
  },
});

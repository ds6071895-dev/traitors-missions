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

    // Aim assist. Leading a bird by eye with a projectile that drops is a
    // lovely idea and a miserable game, so the bow does the maths: point
    // at the quarry — at the bird itself, not at where it is going — and
    // the arrow is loosed at the interception. The cone is measured to
    // the thing you are looking at, which is the only measurement that
    // matches what you think you are doing. Inside `assistFull` the shot
    // is handed over completely; out to `assistSoft` it is bent most of
    // the way, so a shot you had no business taking still misses.
    assistFull: 0.30,         // radians ≈ 17°
    assistSoft: 0.62,         // ≈ 36°
    assistSteady: 1.45,       // how much wider the cone is while focusing
    assistLockMs: 260,        // how long the reticle keeps showing a lock

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
    this.key = GameState.runKey(this.mode, this.seed, this.opts.modId);
    this.rng = U.makeRng(this.seed);

    this.state = 'idle';        // idle | countdown | live | between | finished | failed
    this._resetRun();

    this._tmpV = new THREE.Vector3();
    this._tmpV2 = new THREE.Vector3();
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
    this.boss = null;
    this.lockT = 0; this.lockName = ''; this.lockGuard = false;
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
    scene.add(ForestConditions.lights(this.cond));
    this.applied = applied;

    Sky.build(scene, U.makeRng(this.seed + 13), { birds: false });

    this.forest = ForestKit.build(scene, U.makeRng(this.seed + 3), {
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
    this.arrows = new ArrowSystem(scene, this.bow.tune);
    this.arrows.setWind(wind.x, wind.z, wind.strength);

    this.flock = new FlyerKit.Flock(scene);

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

    this._buildResidents();

    this.schedule = this.mode === 'prize' ? ShootoutRounds.schedule(this.seed) : null;
    this.roundCount = this.schedule ? this.schedule.length : 0;
    this.targets = this.C.baseFov;   // placeholder, replaced below
    this.par = this._computePar();

    if (this.opts.ghost) {
      const g = GameState.getGhost('shootout', this.key);
      this.ghost = g && g.t && g.t.length > 1 ? g : null;
    } else this.ghost = null;

    this._cacheHud();

    Input.setMouseAim(true);
    Input.setTouchMode('aim');
    this._aimOn = true;
    this._unlockWatch = Input.onLockChange((locked) => {
      // losing the pointer mid-round is a pause, not a free hit
      if (!locked && this.state === 'live' && !Input.isTouch) this._pause();
    });

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
      money: q('sh-money'), docked: q('sh-docked'),
      chain: q('sh-chain'), chainWrap: q('sh-chain-wrap'), chainBar: q('sh-chain-bar'),
      round: q('sh-round'), roundName: q('sh-round-name'), roundBar: q('sh-round-bar'),
      left: q('sh-left'), acc: q('sh-acc'), pace: q('sh-pace'),
      reticle: q('sh-reticle'), lock: q('sh-lock'),
      draw: q('sh-draw'), drawFill: q('sh-draw-fill'),
      breath: q('sh-breath'), breathFill: q('sh-breath-fill'),
      quiver: q('sh-quiver'), quiverVal: q('sh-quiver-val'),
      lives: q('sh-lives'),
      banner: q('sh-banner'),
      boss: q('sh-boss'), bossPhase: q('sh-boss-phase'), bossPips: q('sh-boss-pips'),
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

  start() {
    this.state = 'countdown';
    this.countdown = 3.999;
    this._lastBeep = 4;
    this.windSnd = AudioBus.wind();
    if (this.windSnd) this.windSnd.set(this.wind.strength);
    Screens.show('hud-shoot');
    this._setCenter('', '');
    this._banner(this.forestName, ForestConditions.describe(this.cond));
  }

  restart() {
    clearTimeout(this._reportT);
    this.flock.clear();
    this.arrows.clear();
    this.fx.labels.clear();
    this._resetRun();
    this.pos.set(0, this.forest.walkAt(0, 0), 0);
    this._buildResidents();
    this.state = 'countdown';
    this._setCenter('', '');
    this._banner(this.forestName, ForestConditions.describe(this.cond));
    if (this.hud.focus) this.hud.focus.style.opacity = 0;
  }

  dispose() {
    clearTimeout(this._reportT);
    clearTimeout(this._flashT);
    clearTimeout(this._bannerT);
    if (this.windSnd) this.windSnd.stop();
    if (this._unlockWatch) this._unlockWatch();
    Input.setMouseAim(false);
    Input.setTouchMode('drive');
    if (this.bow) this.bow.dispose();
    if (this.arrows) this.arrows.dispose();
    if (this.flock) this.flock.dispose();
    if (this.fx) this.fx.dispose();
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
      this._setCenter('', '');
    }
  }

  /* =================== per-frame =================== */

  update(rawDt, t) {
    if (!this.scene) return;
    if (Engine.isPaused()) {
      if (this._aimOn) { Input.setMouseAim(false); this._aimOn = false; }
      return;
    }
    const wantAim = this.state === 'countdown' || this.state === 'live'
                    || this.state === 'between';
    if (wantAim && !this._aimOn) { Input.setMouseAim(true); this._aimOn = true; }
    if (!wantAim && this._aimOn) { Input.setMouseAim(false); this._aimOn = false; }

    if (Input.pressed('restart') && (this.state === 'live' || this.state === 'failed'
                                     || this.state === 'between')) {
      this.restart();
    }
    if (Input.pressed('pause') && this.state !== 'finished') { this._pause(); return; }
    if (Input.pressed('mute')) AudioBus.toggleMute();

    // focus: the world slows, the view narrows, the breath drains
    const wantFocus = !this.flags.noFocus && Input.held('focus') && this.breath > 0.05
                      && this.state === 'live';
    this.focusing = wantFocus;
    if (wantFocus) this.breath = Math.max(0, this.breath - rawDt);
    else this.breath = Math.min(this.C.breathMax, this.breath + rawDt * this.C.breathRegen);

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

    this._updateAim(rawDt);
    this._updateMove(rawDt);

    if (this.state === 'countdown') this._updateCountdown(rawDt);
    if (this.state === 'live' || this.state === 'between') this._updateRound(dt);

    this._lockScan(rawDt);
    this._updateBow(dt);
    this._updateArrows(dt);
    this._updateFlock(dt);

    if (this.state === 'live') {
      this.elapsed += dt;
      this._updateChain(dt);
      this._recordGhost(dt);
      this._updateGhost();
    }

    this._updateResidents(dt);
    if (this.state === 'live') this._updateBoss(dt);

    // the wood keeps living between rounds
    this._songT -= dt;
    if (this._songT <= 0) {
      this._songT = 3 + Math.random() * 7;
      AudioBus.play('birdsong', { bus: 'ambience', volume: this.state === 'live' ? 0.5 : 1 });
    }

    this.forest.update(dt, this.camera.position);
    this.fx.update(dt);
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
    this.yaw -= d.x * sens + s.x * rate;
    this.pitch -= d.y * sens + s.y * rate;
    this.pitch = U.clamp(this.pitch, -0.55, 1.15);

    // the bow's own wander rides on top of where you are pointing
    const sw = this.bow ? this.bow.sway : { x: 0, y: 0 };
    this.aimYaw = this.yaw + sw.x;
    this.aimPitch = this.pitch + sw.y - this.recoil;
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
    this.recoil = U.damp(this.recoil, 0, 9, dt);
    this.shake = U.damp(this.shake, 0, 5.5, dt);
    this.fovKick = U.damp(this.fovKick, 0, 6, dt);

    const shakeX = this.shake ? (Math.random() - 0.5) * this.shake * 0.03 : 0;
    const shakeY = this.shake ? (Math.random() - 0.5) * this.shake * 0.03 : 0;

    // the walk cycle, in the camera and in the hand holding the bow
    const amp = C.bobAmp * this.speed01 * (this.sprinting ? 1.5 : 1);
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
    this.camera.rotation.z = Math.sin(this.bobT * 0.5) * 0.016 * this.speed01;

    // No zoom: holding your breath slows the world and steadies the bow,
    // and that is all it does. A field of view that moves under you while
    // you are trying to lead a bird is a fight, not a feature.
    const wantFov = C.baseFov + this.fovKick + (this.sprinting ? C.sprintFov : 0);
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
    if (shot.perfect) this.cleanShots++;
    if (this.arrowsLeft !== Infinity) this.arrowsLeft--;
    this.recoil = 0.028 + shot.power * 0.03;
    this.fovKick = 1.6 + shot.power * 2.4;
    Input.rumble(0.25 + shot.power * 0.3, 90);
    Input.haptic(8);

    const spread = this.flags.twinShot ? [-0.012, 0.012] : [0];
    const solved = this._assist(this._dirFrom(this.aimYaw, this.aimPitch), shot.speed);
    for (const off of spread) {
      const dir = off === 0 ? solved.clone()
        : solved.clone().applyAxisAngle(ShootoutMission._UP, off);
      const origin = this.camera.position.clone()
        .addScaledVector(dir, 0.9)
        .add(this._right.set(Math.cos(this.aimYaw), 0, -Math.sin(this.aimYaw)).multiplyScalar(0.22));
      origin.y -= 0.12;
      const s = Object.assign({}, shot);
      if (this.flags.alwaysPierce) s.pierce = Math.max(s.pierce, 1);
      this.arrows.fire(origin, dir, s);
    }
    // a shot that finds nothing still has to be answered for
    this._pendingShot = { perfect: shot.perfect, hit: false };
    this._shotQueue = this._shotQueue || [];
    this._shotQueue.push(this._pendingShot);
  }

  /* Point the arrow at where the quarry is going to be.

     The cone is measured to the quarry *itself* — not to the lead — so
     that "I was pointing right at it" and "the assist helped" mean the
     same thing. Having picked whatever is nearest the middle of the
     crosshair, we solve the interception properly: where it will be when
     an arrow at this speed could get there, how much higher you have to
     hold for the drop, and how far the wind will carry it. Doves are
     never solved for; the assist will not shoot a dove on your behalf. */
  /* The same cone, run every frame with nothing at stake, purely so the
     reticle can tell you what the bow has decided it is looking at — and,
     just as importantly, when that thing is a dove. */
  _lockScan(dt) {
    const C = this.C;
    this.lockT = Math.max(0, this.lockT - dt);
    if (this.lockT > 0) return;
    this.lockName = ''; this.lockGuard = false;
    if (this.state !== 'live') return;
    const eye = this.camera.position;
    const dir = this._dirFrom(this.aimYaw, this.aimPitch);
    const wide = this.focusing ? C.assistSteady : 1;
    const soft = C.assistSoft * wide;
    let bestAng = soft, best = null;
    for (const f of this.flock.list) {
      if (f.dying || !f.alive) continue;
      if (f.type.boss && !f.weakName) continue;
      const anchor = f.type.boss ? f.aimPoint(this._tmpV2) : f.pos;
      const to = this._tmpV.copy(anchor).sub(eye);
      const dist = to.length();
      if (dist < 3) continue;
      // a dove is called out from further away than anything else, because
      // knowing it is there is the entire point
      const cone = f.guard ? soft * 1.4 : soft;
      const ang = Math.acos(U.clamp(to.divideScalar(dist).dot(dir), -1, 1));
      if (ang > cone) continue;
      if (f.guard ? ang < soft * 1.4 : ang < bestAng) {
        if (f.guard) { best = f; bestAng = -1; break; }
        bestAng = ang; best = f;
      }
    }
    if (!best) return;
    this.lockGuard = !!best.guard;
    this.lockName = best.guard ? 'DOVE — HOLD'
      : (best.type.boss ? ((best.weak[best.weakName] || {}).label || best.type.name)
                        : best.type.name);
  }

  _assist(dir, speed) {
    const C = this.C;
    this.lockName = '';
    if (this.flags.noAssist) return dir;
    const eye = this.camera.position;
    const wide = this.focusing ? C.assistSteady : 1;
    const full = C.assistFull * wide;
    const soft = C.assistSoft * wide;
    let pick = null, pickAng = soft, pickScore = 1e9;

    for (const f of this.flock.list) {
      if (f.dying || !f.alive || f.guard) continue;
      // on the owl this is whichever part the fight has opened, not the
      // middle of it — and if nothing is open there is nothing to solve
      if (f.type.boss && !f.weakName) continue;
      const anchor = f.type.boss ? f.aimPoint(this._tmpV2).clone() : f.pos;
      const to = this._tmpV.copy(anchor).sub(eye);
      const dist = to.length();
      if (dist < 3) continue;
      const ang = Math.acos(U.clamp(to.divideScalar(dist).dot(dir), -1, 1));
      if (ang > soft) continue;
      // nearest the crosshair wins, with a light nudge towards whatever
      // is closer to you when two things are about equally central
      const score = ang + dist * 0.00035;
      if (score < pickScore) { pickScore = score; pickAng = ang; pick = { f, anchor, dist }; }
    }
    if (!pick) return dir;

    // where it will be when an arrow at this speed could get there
    const { f, anchor } = pick;
    let tof = pick.dist / speed;
    const aim = new THREE.Vector3();
    for (let i = 0; i < 4; i++) {
      aim.copy(anchor).addScaledVector(f.vel, tof);
      tof = aim.distanceTo(eye) / speed;
    }
    // and how much higher you have to hold to get it there
    aim.y += 0.5 * this.bow.tune.gravity * tof * tof;
    aim.x -= this.wind.x * this.bow.tune.windScale * tof * tof * 0.5;
    aim.z -= this.wind.z * this.bow.tune.windScale * tof * tof * 0.5;
    const want = aim.sub(eye).normalize();

    // hand it over completely inside the inner cone, and ease off outside
    // it rather than falling off a cliff
    let k = 1;
    if (pickAng > full) {
      const t = 1 - (pickAng - full) / Math.max(1e-4, soft - full);
      k = t * (2 - t);                     // ease-out: still generous at the rim
    }
    if (k > 0.55) {
      this.lockName = f.type.boss ? (f.weak[f.weakName] || {}).label || '' : f.type.name;
      this.lockT = C.assistLockMs / 1000;
    }
    return dir.lerp(want, k).normalize();
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

  /* -------- hits and misses -------- */

  _onHit(target, arrow, info) {
    const rule = (this.round && this.round.def.rule) || {};
    // "only a clean loose counts" — a soft arrow goes straight through
    if ((rule.cleanOnly || this.flags.cleanOnly) && !arrow.perfect) {
      this.fx.labels.add('TOO SOFT', target.pos, { className: 'bad', life: 0.8, rise: 6 });
      return false;                            // not consumed: keep flying
    }

    if (target.guard) { this._dove(target, info); return true; }

    // the owl is not killed by arrows in the body; it is killed by arrows
    // in whichever part the fight has opened
    if (target.type.boss) {
      this.hits++;
      if (arrow.perfect) this.cleanHits++;
      const B = this.boss;
      const open = B && B.open && B.staggerT <= 0 && target.weakName;
      // against the arrow's own flight, not against where it happened to
      // clip the owl's very large body sphere
      const seg = this._tmpV.copy(arrow.pos).sub(arrow.prev);
      const len = seg.length();
      if (open && target.weakSegHit(arrow.prev, seg, Math.max(len, 1e-4))) {
        const at = target.aimPoint(new THREE.Vector3());
        this._bossHurt(target, { point: at, dist: at.distanceTo(this.camera.position) });
      } else {
        AudioBus.play('boss-clang', {});
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
    return true;
  }

  _award(target, arrow, info) {
    const C = this.C;
    const rule = (this.round && this.round.def.rule) || {};
    this.kills++;
    this.chain = Math.min(this.chain + 1, C.chainCap);
    this.chainT = C.chainWindow;
    this.bestChain = Math.max(this.bestChain, this.chain);
    // a deer is not one of the round's quarry, however satisfying it was
    if (this.round && !target.resident) {
      this.round.killed = Math.min(this.round.total, this.round.killed + 1);
    }

    const dist = info.point.distanceTo(this.camera.position);
    const chainMult = this._chainMult();
    const cleanMult = arrow.perfect ? C.cleanBonus : 1;
    const longMult = 1 + Math.max(0, dist - C.longShotFrom) * C.longShotPer;
    const roundMult = (rule.valueMult || 1) * (rule.pierceDouble && arrow.hits > 1 ? 2 : 1);
    const value = target.value * C.moneyPerPoint
                * chainMult * cleanMult * longMult * roundMult * C.moneyScale;
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

    this._deathFx(target, info, arrow.perfect);
    this.hitStop = Math.max(this.hitStop, arrow.perfect ? 0.085 : 0.045);
    this.shake = Math.max(this.shake, arrow.perfect ? 2.4 : 1.2);
    Input.rumble(arrow.perfect ? 0.6 : 0.35, 110);
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

     A boss is only a boss if it changes. This one is three fights: it
     circles out of reach carrying a lantern and sending ravens at you;
     it drops the lantern and starts making passes, and the only moment
     its eyes face you is the moment it is coming straight at your head;
     and then it stops running altogether, hangs in the air beating its
     wings hard enough to shove you backwards, and dares you to put an
     arrow through its chest while bats pour past.

     Between phases it is staggered and untouchable for a beat, which is
     what gives the fight its rhythm — and what tells you, without a line
     of text, that something you did worked. */

  static BOSS_PHASES = [
    { key: 'lantern', name: 'THE LANTERN', need: 3,
      call: 'It will not come down while it is carrying that light.' },
    { key: 'eyes', name: 'THE EYES', need: 3,
      call: 'Its eyes only face you when it does. Hold your nerve.' },
    { key: 'chest', name: 'THE HEART', need: 4,
      call: 'No more running. Put one through it.' },
  ];

  _beginBoss(f) {
    f.cruiseY = this.pos.y + 40;
    f.orbit = 120;
    f.orbitTarget = 120;
    f.behaviour = 'bossCircle';
    f.weakName = null;
    this.boss = {
      flyer: f, phase: -1, hits: 0, t: 0, addT: 5, gustT: 0,
      open: false, staggerT: 0, cycleT: 0, diving: false, down: false,
    };
    this._banner('THE GREAT OWL', 'It has been watching you all evening', 'boss');
    AudioBus.play('owl-screech', {});
    this.shake = Math.max(this.shake, 5);
    setTimeout(() => { if (this.boss && this.boss.phase === -1) this._bossPhase(0); }, 2600);
  }

  _bossPhase(i) {
    const B = this.boss;
    if (!B || !B.flyer.alive) return;
    const P = ShootoutMission.BOSS_PHASES[i];
    B.phase = i;
    B.hits = 0;
    B.cycleT = 0;
    B.diving = false;
    B.staggerT = 0;
    B.flyer.weakName = P.key;
    B.open = true;
    B.stare = i === 1;
    const f = B.flyer;
    if (i === 0) { f.behaviour = 'bossCircle'; f.orbitTarget = 58; f.cruiseY = this.pos.y + 26; }
    if (i === 1) { f.behaviour = 'bossHover'; f.hoverDist = 44; f.hoverUp = 19; }
    if (i === 2) { f.behaviour = 'bossHover'; f.hoverDist = 34; f.hoverUp = 15; }
    this._banner(P.name, P.call, 'boss');
    AudioBus.play('owl-screech', { pitch: 1 + i * 0.12 });
  }

  _updateBoss(dt) {
    const B = this.boss;
    if (!B) return;
    const f = B.flyer;
    if (!f.alive || f.dying) { if (!B.down) this._bossDown(); return; }
    B.t += dt;

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
    if (B.phase < 0) return;

    B.cycleT += dt;

    /* Phase 2: the stare. It hangs in front of you with its eyes lit and
       dares you to take the shot — that is the window, and it is a long,
       obvious one. Then it loses patience and comes at you, and while it
       is coming there is nothing to hit; you get out of the way, it pulls
       up, and it turns round and stares at you again. */
    if (B.phase === 1) {
      if (B.stare && B.cycleT > 5.2) {
        B.stare = false; B.open = false; B.diving = true; B.cycleT = 0;
        f.behaviour = 'bossDive'; f.committed = false;
        AudioBus.play('owl-screech', { pitch: 1.2 });
        this._banner('IT IS COMING', 'GET OUT OF THE WAY', 'bad');
        this.shake = Math.max(this.shake, 3);
      } else if (!B.stare && B.cycleT > 2.6) {
        B.stare = true; B.open = true; B.diving = false; B.cycleT = 0;
        f.behaviour = 'bossHover'; f.hoverDist = 44; f.hoverUp = 19;
        AudioBus.play('owl-screech', { pitch: 0.95 });
        this._banner('IT IS LOOKING AT YOU', 'THE EYES', 'boss');
      }
    }

    // phase 3: every wingbeat is a gust that shoves you back a step
    if (B.phase === 2) {
      B.gustT -= dt;
      if (B.gustT <= 0) {
        B.gustT = 1.5;
        const away = this._tmpV.copy(this.pos).sub(f.pos);
        away.y = 0; away.normalize();
        this.vel.x += away.x * 5.5;
        this.vel.z += away.z * 5.5;
        this.shake = Math.max(this.shake, 2.6);
        AudioBus.play('owl-gust', {});
      }
    }

    // and all through it, something else in the air to worry about
    B.addT -= dt;
    if (B.addT <= 0) {
      B.addT = B.phase === 2 ? 2.6 : 6.5;
      const kind = B.phase === 2 ? 'bat' : 'raven';
      for (let i = 0; i < (B.phase === 2 ? 2 : 2); i++) {
        const a = Math.random() * Math.PI * 2;
        const add = this._spawnOne(kind, 'cruise', {
          mode: 'sweep', ang: a, dist: 60 + Math.random() * 40,
          height: 16 + Math.random() * 18, life: 26,
        });
        if (add) add.isAdd = true;
      }
    }

    // one place decides whether there is anything to shoot at, so the
    // reticle, the aim assist and the arrows all agree about it
    const P = ShootoutMission.BOSS_PHASES[B.phase];
    f.weakName = (B.open && B.staggerT <= 0 && P) ? P.key : null;
  }

  // a weak point taking an arrow: the whole point of the fight
  _bossHurt(target, info) {
    const B = this.boss;
    const C = this.C;
    if (!B) return;
    B.hits++;
    const P = ShootoutMission.BOSS_PHASES[B.phase] || { need: 99, name: '' };
    const pay = C.bossHitMoney * this._chainMult() * C.moneyScale;
    this.money += pay;
    this.chain = Math.min(this.chain + 1, C.chainCap);
    this.chainT = C.chainWindow;
    this.bestChain = Math.max(this.bestChain, this.chain);

    this.fx.labels.add(`${U.money(Math.round(pay * this.payout))}  ${P.name}`, info.point,
                       { className: 'perfect', life: 1.3, rise: 9 });
    this._burst(info.point, 46, '#ffd166', 12);
    this.fx.rings.fire(info.point, this.camera.quaternion, 0.5, 5.5, 0.45, '#ffd166');
    this.hitStop = Math.max(this.hitStop, 0.09);
    this.shake = Math.max(this.shake, 3.4);
    this._flash(0.2, 'rgba(255,209,102,0.5)');
    Input.rumble(0.7, 160);
    AudioBus.play('boss-hurt', {});

    if (B.hits >= P.need) this._bossStagger();
  }

  _bossStagger() {
    const B = this.boss;
    const f = B.flyer;
    B.staggerT = 2.4;
    B.open = false;
    f.weakName = null;
    this.hitStop = Math.max(this.hitStop, 0.14);
    this.timeScaleTarget = 0.45;
    setTimeout(() => { if (this.state === 'live') this.timeScaleTarget = 1; }, 900);
    this.shake = Math.max(this.shake, 7);
    this._flash(0.4, 'rgba(255,209,102,0.6)');
    Input.rumble(1, 420);
    AudioBus.play('owl-screech', { pitch: 0.8 });
    this._banner('STAGGERED', '', 'perfect');

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
  }

  _bossDown() {
    const B = this.boss;
    if (!B || B.down) return;
    B.down = true;
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
    Input.rumble(1, 700);
    AudioBus.play('owl-death', {});
    this._banner('THE GREAT OWL IS DOWN', '', 'perfect');
    this._burst(f.pos, 160, '#6b543a', 20);
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
    this.penalty += cost;
    this.doves++;
    this.chain = 0; this.chainT = 0;
    if (this.round) this.round.time = Math.max(0, this.round.time - C.doveTime);
    target.kill();
    this._deathFx(target, info, false);
    this.fx.labels.add(`−${U.money(cost)}  DOVE · PROTECTED`, info.point,
                       { className: 'bad', life: 1.9, rise: 8 });
    this._docked(cost, 'DOVE');
    this._flash(0.5, 'rgba(229,19,63,0.75)');
    this.shake = Math.max(this.shake, 5);
    this.hitStop = Math.max(this.hitStop, 0.1);
    Input.rumble(0.9, 320);
    AudioBus.play('dove', {});
    this._setCenter('THAT WAS A DOVE',
                    `−${U.money(Math.round(cost * this.payout))} · CHAIN LOST`, 'bad');
    clearTimeout(this._doveT);
    this._doveT = setTimeout(() => this._setCenter('', ''), 1500);

    if (this.flags.suddenDeath) this._fail('YOU SHOT A DOVE');
    else if (this.mode === 'gauntlet') this._loseLife('A DOVE');
  }

  _onLand(arrow, what) {
    // a shot that hit nothing at all is what breaks a chain
    if (arrow.hits === 0) this._miss();
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

  _updateFlock(dt) {
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
        if (f.escaped && !f.guard && this.round) {
          this.round.escaped++;
          this.escapes++;
        }
      },
    });

    // wasps that get to you, and an owl that runs you down
    if (this.state !== 'live') return;
    for (const f of this.flock.list) {
      if (f.dying || !f.alive) continue;
      const d = f.pos.distanceTo(this.camera.position);
      if (f.type.stings && d < 4.5) { this._sting(f); }
      else if (f.type.boss && this.boss && this.boss.diving && d < 9) this._bossPass(f);
    }
  }

  _sting(f) {
    f.kill();
    this.stings++;
    this.penalty += this.C.stingCost;
    if (this.round) this.round.time = Math.max(0, this.round.time - 1.2);
    this._flash(0.32, 'rgba(242,193,78,0.55)');
    this.shake = Math.max(this.shake, 4);
    Input.rumble(0.7, 200);
    AudioBus.play('flyer-hit', { pitch: 1.7 });
    this.fx.labels.add(`−${U.money(this.C.stingCost)}  STUNG`, f.pos,
                       { className: 'bad', life: 1.3, rise: 6 });
    this._docked(this.C.stingCost, 'STUNG');
  }

  _bossPass(f) {
    if (f._passT && this.elapsed - f._passT < 2) return;
    f._passT = this.elapsed;
    this.chain = 0;
    this._flash(0.42, 'rgba(20,10,0,0.8)');
    this.shake = Math.max(this.shake, 7);
    this.hitStop = Math.max(this.hitStop, 0.08);
    Input.rumble(1, 420);
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

    R.time -= dt;
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
      else if (R.time <= 0) this._endRound(false);
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
      facing: sched.facing,
      speedScale: this.C.speedScale * (1 + (sched.scale - 1) * 0.5) * (d.spawn.speed || 1),
    };
    this.state = 'live';
    this._banner(
      this.mode === 'prize' ? `ROUND ${index + 1} / ${this.roundCount}` : `WAVE ${index + 1}`,
      d.name, d.kind);
    AudioBus.play(d.kind === 'boss' ? 'boss-call' : 'round-start', {});

    // "a gilded raven in every round" is a card, not a round
    if (this.flags.gildedEveryRound && d.kind === 'normal') {
      this._spawnOne('gilded', 'circle', {
        mode: 'orbit', dist: 55, height: 26, ang: sched.facing + 1.2, life: d.duration,
      });
    }
  }

  _endRound(cleared) {
    const R = this.round;
    if (!R) return;
    const C = this.C;
    const perfect = cleared && R.escaped === 0 && R.killed >= R.total;

    if (cleared) {
      this.roundsCleared++;
      const timeBonus = Math.round(Math.max(0, R.time) * C.roundTimeBonus);
      let bonus = (C.roundClearBonus + timeBonus) * C.moneyScale;
      if (perfect) { bonus += C.perfectRoundBonus * C.moneyScale; this.perfectRounds++; }
      if (R.def.kind === 'boss') {
        const bounty = C.bossBounty * C.moneyScale;
        bonus += bounty; this.bossesDown++; this.bossMoney += bounty;
      }
      this.bonusMoney += bonus;
      this.money += bonus;
      AudioBus.play(perfect ? 'round-perfect' : 'round-clear', {});
      this._banner(perfect ? 'PERFECT ROUND' : 'ROUND CLEAR',
                   U.money(Math.round(bonus * this.payout)), perfect ? 'perfect' : 'clear');
      this.timeScaleTarget = 0.55;
      setTimeout(() => { this.timeScaleTarget = 1; }, 700);
    } else {
      AudioBus.play('miss');
      this._banner('ROUND OVER', `${R.killed} of ${R.total}`, 'fail');
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
    if (spec.mode === 'formation') { R.spawned += this._spawnFormation(n); return; }
    for (let i = 0; i < n; i++) {
      // a dove is not quarry, so it never counts against the round's tally
      const guard = Math.random() < (R.def.guards || 0);
      const typeId = guard ? 'dove' : spec.types[(Math.random() * spec.types.length) | 0];
      const f = this._spawnOne(typeId, spec.behaviour, {
        ang: this._spawnAngle(spec, i),
        dist: U.lerp(spec.dist[0], spec.dist[1], Math.random()),
        height: U.lerp(spec.height[0], spec.height[1], Math.random()),
        mode: spec.mode,
        life: R.time + 4,
      });
      if (f && !guard) R.spawned++;
      // and a dove sent instead of quarry still owes you the quarry
      if (guard) i--;
      if (R.spawned >= R.total) break;
    }
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
      * (R ? R.speedScale : 1);

    const opts = {
      pos: new THREE.Vector3(x, y, z),
      behaviour,
      speed,
      life: o.life || 30,
      curve: (spec.curve || 0) * (Math.random() < 0.5 ? -1 : 1),
    };

    if (mode === 'sweep' || mode === 'cross') {
      // crossing the view rather than flying at it: the shot that has to
      // be led is the one worth taking
      const side = Math.random() < 0.5 ? 1 : -1;
      opts.head = ang + Math.PI + side * (Math.PI / 2) * U.lerp(0.55, 1.0, Math.random());
    } else if (mode === 'orbit' || mode === 'boss') {
      opts.behaviour = mode === 'boss' ? 'boss' : 'circle';
      opts.centre = new THREE.Vector3(cx, y, cz);
      opts.orbit = range;
      opts.orbitTarget = mode === 'boss' ? Math.max(34, range * 0.62) : range;
      opts.ang = ang;
      opts.dir = Math.random() < 0.5 ? 1 : -1;
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
    const ang = this._spawnAngle(spec, 0);
    const lead = this._spawnOne(spec.types[0], 'cruise', {
      ang, dist: U.lerp(spec.dist[0], spec.dist[1], Math.random()),
      height: U.lerp(spec.height[0], spec.height[1], Math.random()),
      mode: 'sweep', life: R.time + 6,
    });
    if (!lead) return 0;
    let made = 1;
    for (let i = 1; i < n; i++) {
      const s = i % 2 ? 1 : -1;
      const rank = Math.ceil(i / 2);
      const f = this.flock.spawn(spec.types[0], {
        pos: lead.pos.clone().add(new THREE.Vector3(s * rank * 5, rank * 0.6, rank * 5)),
        behaviour: 'formation',
        leader: lead,
        slot: { x: s * rank * 5, y: rank * 0.8, z: rank * 5 },
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
    // hand the mouse back before the scoreboard arrives
    Input.setMouseAim(false);
    this._aimOn = false;
    const earned = Math.round(Math.max(0, this.money - this.penalty) * this.payout);
    const medal = this._medalFor(earned);
    AudioBus.play('finish');
    this._setCenter('THE WOOD IS QUIET', U.money(earned), 'go');
    this.timeScaleTarget = 0.4;
    Input.rumble(0.8, 420);
    this._confetti();
    this.result = this._buildResult({ completed: true, earned, medal });
    this._reportT = setTimeout(() => this._report(), 2000);
  }

  _fail(reason) {
    if (this.state === 'finished' || this.state === 'failed') return;
    this.state = 'failed';
    // hand the mouse back before the scoreboard arrives
    Input.setMouseAim(false);
    this._aimOn = false;
    AudioBus.play('miss');
    this._setCenter(reason || 'RUN OVER', 'Press R to try again', 'bad');
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
      modeName: this.modeDef.name,
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
      elapsed: this.elapsed,
      par: this.par,
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
    Screens.show('pause');
  }

  /* -------- HUD -------- */

  _flash(amount, color) {
    const f = this.hud.flash;
    if (!f) return;
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
      }
    }

    if (h.hint) {
      const need = !Input.pointerLocked && !Input.isTouch && this.state !== 'finished';
      h.hint.classList.toggle('show', need);
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
  players: 'Solo',
  duration: '~3 min',
  order: 1,
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
    '<b>Lead them.</b> Arrows are real — they take time to arrive and they drop. Aim where '
      + 'the bird is going, and further ahead the softer you drew.',
    '<b>Keep the chain.</b> Every hit raises the multiplier. A miss, a dove, or four quiet '
      + 'seconds and it falls away.',
    '<b>Never the dove.</b> The white one costs you money, seconds and the whole chain.',
    '<b>Clear the round early.</b> Every second left on the round clock is paid for, and a '
      + 'round where nothing got away pays again on top.',
  ],
  keys: ['<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move · <kbd>Q</kbd> run',
         '<kbd>Mouse</kbd> aim', '<kbd>Hold</kbd> draw, release to loose',
         '<kbd>RMB</kbd> steady', '<kbd>R</kbd> restart'],

  resultRows: (r) => {
    const rows = [
      ['Quarry taken', String(r.kills)],
      ['Accuracy', `${Math.round(r.accuracy * 100)}% of ${r.shots} arrows`],
      ['Clean looses', `${r.cleanShots}${r.shots ? ` (${Math.round(r.cleanShots / r.shots * 100)}%)` : ''}`],
      ['Best multiplier', '×' + r.bestMult.toFixed(2).replace(/\.?0+$/, '')],
      ['Rounds cleared', `${r.roundsCleared}/${r.roundsTotal}`],
    ];
    if (r.perfectRounds) rows.push(['Perfect rounds', String(r.perfectRounds)]);
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

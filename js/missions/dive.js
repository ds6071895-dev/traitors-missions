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

    carryMax:    4,        // chests in hand before you must surface
    grabRange:   3.0,      // metres; grabbing is automatic inside this
    flowMoney:   0.55,     // extra fraction of value at full chain
    /* Surfacing is not banking. Everything you come up with has to be
       carried back to the shingle and put on the pile, and until it is
       on the pile it is not money — it is four chests in the hands of
       somebody the other two can watch swimming home. That is the
       whole reason the shore exists: it puts a *journey* between
       having it and keeping it, in front of an audience. */
    bankTime:    0.35,     // seconds ashore before it counts
    landRange:   11,       // metres from the tideline that count as ashore
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
    par:         21000,
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
      tiers: DiveMission.configFor(twist).tiers.map(t => t.name + ' ' + U.money(t.value)),
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
      peakCarry: 0, peakCarryValue: 0,
      tierBanked: { shelf: 0, wreck: 0, trench: 0 },
      trenchTrips: 0, trenchEmpty: 0,
      strokes: 0, onBeat: 0, bestFlowRun: 0,
      lastMinuteBanked: 0, finalCarry: 0, finalCarryValue: 0,
      passedDrops: 0,
      surfaceTime: 0, submergedTime: 0,
      maxOtherDeepest: 0, maxOtherBanked: 0, maxOtherPeakCarry: 0,
      otherTrips: 0, finished: false, topOfField: false,
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
    this._camPos = new THREE.Vector3();
    this._camLook = new THREE.Vector3();
    this._band = { colour: new THREE.Color(), near: 0, far: 0, caustic: 0, vignette: 0 };
    this._ctl = { move: { x: 0, y: 0 }, yaw: 0, pitch: 0, stroke: false, beat: null };
    this._beat = { spb: 0.625, sinceBeat: 0 };
  }

  _resetRun() {
    this.money = 0;
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
    this._paletteAt = undefined;
    this._skyOn = undefined;
    this._camRoll = 0;
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
      rocks: 54,
      kelp: this.flags.shoal ? 520 : 620,
      shafts: 9,
    });
    /* Where the land is, and the two points on it the whole mission
       hangs off: the shingle you jump from, and the tideline in front
       of it that counts as ashore. */
    this.shore = this.reef.shore;
    const cur = DiveConditions.currentVector(this.cond);
    this.reef.setCurrent(cur.x, cur.z, cur.strength);

    this.shoal = ReefKit.buildShoal(scene, U.makeRng(this.seed + 21), {
      count: this.flags.shoal ? 260 : 130,
      radius: C.reefRadius * 0.8,
      heightAt: this.reef.heightAt,
      home: this.reef.wreck.at,
    });

    // ---- the diver
    this.swimmer = new Swimmer({
      tune: Object.assign({}, (this.twist && this.twist.tune) || {}),
      look: this.myLook,
      palette: 'diver',
      paint: { suit: '#123044', fin: '#f2c14e' },
    });
    scene.add(this.swimmer.group);
    this._placeAshore();

    this.world = {
      heightAt: this.reef.heightAt,
      surfaceAt: (x, z) => Water.sampleHeight(x, z),
      colliders: this.reef.colliders,
      radius: C.reefRadius,
    };

    // ---- the money
    this._buildChestKit();
    this.chests = [];
    for (let t = 0; t < C.tiers.length; t++) {
      for (let i = 0; i < C.tiers[t].chests; i++) this._spawnChest(t);
    }

    this._buildPeers(scene);

    this.fx = {
      bubbles: new ParticleField(scene, 700, { drag: 1.5, gravity: -3.2 }),
      sparks: new ParticleField(scene, 420, { drag: 1.2, gravity: -1.2, additive: true }),
      rings: new RingBurst(scene, 14),
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

    // and the pile, which is what all of this is for
    this._buildPile();

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

    Input.setMouseAim(true);
    Input.setTouchMode('swim');
    this._aimOn = true;
    this._unlockWatch = Input.onLockChange((locked) => {
      if (!locked && this.state === 'live' && !Input.isTouch) this._pause();
    });

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
    this._glowTex = Sky.glowTexture('rgba(255,255,255,0.95)', 'rgba(255,220,140,0.45)');
  }

  _spawnChest(tierIndex, at) {
    const C = this.C;
    const tier = C.tiers[tierIndex];
    let x = 0, z = 0, y = 0;
    if (at) { x = at.x; z = at.z; y = at.y; }
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

    const mesh = new THREE.Mesh(this._chestGeo, this._chestMats[tierIndex]);
    mesh.position.set(x, y, z);
    mesh.rotation.y = this.rng() * U.TAU;
    this.scene.add(mesh);

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._glowTex, color: tier.colour, transparent: true,
      opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    glow.scale.setScalar(3.4 + tierIndex * 1.1);
    glow.position.set(x, y + 0.4, z);
    glow.renderOrder = 5;
    this.scene.add(glow);

    const chest = {
      id: this._nextChestId++, tier: tierIndex, value: tier.value,
      x, y, z, mesh, glow, mult: 1, dropped: !!at, taken: false,
      phase: this.rng() * U.TAU, depth: -y,
    };
    this.chests.push(chest);
    return chest;
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
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.12, 3.4, 6),
      new THREE.MeshLambertMaterial({ color: '#4a3b2c', flatShading: true }));
    post.position.set(-2.4, 1.7, 0);
    const lamp = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.34, 0),
      new THREE.MeshLambertMaterial({ color: '#ffe9a8', flatShading: true,
                                      emissive: '#ffb347', emissiveIntensity: 1.0 }));
    lamp.position.set(-2.4, 3.4, 0);
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
      const mesh = new THREE.Mesh(this._chestGeo, this._chestMats[c.tier]);
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
    if (!this.pile) return;
    for (const m of this.pile.items) this.pile.group.remove(m);
    this.pile.items.length = 0;
    this.pile.n = 0;
  }

  _tickPile(dt, t) {
    if (!this.pile) return;
    for (const m of this.pile.items) {
      const d = m.userData.drop;
      if (!d) continue;
      m.userData.drop = Math.max(0, d - dt * 4);
      m.position.y = m.userData.restY + m.userData.drop * m.userData.drop * 2.4;
    }
    if (this._lamp) {
      // a lamp that breathes, so the beach is never a still photograph
      const f = 0.85 + 0.15 * Math.sin(t * 2.3) + 0.06 * Math.sin(t * 7.1);
      this._lamp.material.emissiveIntensity = f;
      this._lampGlow.material.opacity = 0.55 + 0.3 * f;
      this._lampGlow.scale.setScalar(8.4 + f * 1.4);
      this._lampLight.intensity = 2.2 + f * 0.7;
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
    sw.vel.set(-sh.nx * 8.4, 3.6, -sh.nz * 8.4);
    sw.pitchAim = -0.55;
    this.camKick = 0.8;
    this.fovKick = 5;
    AudioBus.play('dv-stroke', { power: 1 });
  }

  /* How far you are from being ashore, in metres, measured flat. The
     tideline point rather than the pile: you have to get out of the
     water, not climb the beach. */
  _shoreDist() {
    const t = this.shore.tide;
    return Math.hypot(this.swimmer.pos.x - t.x, this.swimmer.pos.z - t.z);
  }

  _ashore() {
    const sw = this.swimmer;
    return (sw.up || sw.onLand) && this._shoreDist() <= this.C.landRange;
  }

  _removeChest(chest) {
    const i = this.chests.indexOf(chest);
    if (i >= 0) this.chests.splice(i, 1);
    if (chest.mesh) { this.scene.remove(chest.mesh); }
    if (chest.glow) {
      this.scene.remove(chest.glow);
      chest.glow.material.dispose();
    }
    chest.mesh = null; chest.glow = null;
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
      this.peers.set(p.id, {
        sw, name: p.name, seen: false, pos: new THREE.Vector3(),
        air: 1, carried: 0, value: 0, deepest: 0, money: 0, trips: 0,
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
      carry: q('dv-carry'), carryVal: q('dv-carry-val'), shore: q('dv-shore'),
      pressure: q('dv-pressure'), banner: q('dv-banner'), hint: q('dv-hint'),
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
  }

  /* =================== lifecycle =================== */

  start() {
    if (this.party) {
      MissionNet.attach('dive');
      this._offEvents = MissionNet.on('event', (d, from) => this._onNetEvent(d, from));
      RoomUI.showAgenda(this._agendaProgress());
    }
    this.state = this.party ? 'waiting' : 'countdown';
    this.countdown = 3.999;
    this._lastBeep = 4;
    this._startMusic();
    Screens.show('hud-dive');
    this._setCenter('', '');
    this._banner(this.reefName, DiveConditions.describe(this.cond));
    if (this.hud.hint) this.hud.hint.classList.toggle('show', !Input.isTouch);
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
    this._resetRun();
    this.rng = U.makeRng(this.seed);
    for (let t = 0; t < this.C.tiers.length; t++) {
      for (let i = 0; i < this.C.tiers[t].chests; i++) this._spawnChest(t);
    }
    this._clearPile();
    this._placeAshore();
    this.swimmer.airMax = 1;
    this.swimmer.air = 1;
    this.swimmer.carried = 0;
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
    if (this.party) { RoomUI.hideField(); RoomUI.hideAgenda(); }
    if (this.music) { this.music.stop(0.4); this.music = null; }
    if (this._unlockWatch) this._unlockWatch();
    Input.setMouseAim(false);
    Input.setTouchMode('drive');
    if (this.swimmer) this.swimmer.dispose();
    if (this.shoal) this.shoal.dispose();
    if (this.reef) this.reef.dispose();
    if (this.fx) this.fx.dispose();
    for (const c of this.chests.slice()) this._removeChest(c);
    this.chests = [];
    if (this._chestGeo) this._chestGeo.dispose();
    if (this._chestMats) for (const m of this._chestMats) m.dispose();
    if (this._glowTex) this._glowTex.dispose();
    Engine.disposeObject(this.scene);

    /* The water is a global singleton and *nothing else in the repo
       puts its palette back*. A dive that does not restore it leaves
       cobalt trench water in the attract screen, the boat race and
       every mission after it. */
    Water.setPalette(Water.DEFAULTS);
    Water.setFog(340, 3600, Sky.PALETTE.fog);
    Water.setSeaState({ swell: 1, chop: 1, wind: 0 });
    Sky.resetPreset();

    this.scene = null;
    if (this.hud) {
      if (this.hud.pressure) this.hud.pressure.style.opacity = 0;
      if (this.hud.flash) this.hud.flash.style.opacity = 0;
      if (this.hud.setup) this.hud.setup.innerHTML = '';
      if (this.hud.banner) this.hud.banner.classList.remove('show');
      if (this.hud.hint) this.hud.hint.classList.remove('show');
      if (this.hud.gain) this.hud.gain.classList.remove('show');
      if (this.hud.chainWrap) this.hud.chainWrap.classList.remove('on');
      if (this.hud.carry) this.hud.carry.innerHTML = '';
      if (this.hud.shore) this.hud.shore.classList.remove('show', 'home');
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

    Water.update(dt);
    Water.follow(this.camera.position.x, this.camera.position.z);
    this._localBeatT += dt;

    if (this.state === 'countdown') this._tickCountdown(rawDt);
    if (this.state === 'live') {
      this.elapsed += dt;
      if (this.mode === 'salvage') {
        this.timeLeft = Math.max(0, this.C.runTime - this.elapsed);
        if (this.timeLeft <= 0) { this._finish('THE BELL'); }
      }
    }

    this._readControls(dt);
    this.swimmer.update(dt, this._ctl, this.world);
    this._afterSwim(dt);
    this._tickChests(dt);
    this._updateCamera(dt);
    this._updateDepth(dt);
    this._updateMusic(dt);
    this.reef.update(dt, this.camera.position);
    Sky.update(dt, this.camera.position, t);
    this._tickPile(dt, t);
    if (this.shoal) this.shoal.update(dt, this.swimmer.pos, this.camera.position);
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
      Input.rumble(0.35, 90);
    }

    // ---- the surface: bank, gasp, and the bright release
    if (sw.surfaced) {
      this.camGasp = 1;
      AudioBus.play('dv-gasp');
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
      if (!sw.up) {
        sw.vel.y = U.damp(sw.vel.y, 5.2, 2.5, dt);
        sw.vel.x *= Math.exp(-1.6 * dt);
        sw.vel.z *= Math.exp(-1.6 * dt);
        sw.pitchAim = U.damp(sw.pitchAim, 1.25, 3, dt);
        sw.yawAim = sw.yaw;
      } else {
        this.holdT -= dt;
        if (this.holdT <= 0) {
          this.out = false;
          this._setCenter('', '');
          this._banner('BACK', 'Whatever you dropped is still down there', 'bad');
        }
      }
    }

    /* Surfacing ends the trip. *Coming ashore* is what pays.
       They used to be the same event, and separating them is the whole
       of the shore: your head coming out means you lived, and it means
       the reef knows how deep you went — but the gold in your hands is
       still gold in your hands, in open water, in front of two people,
       for as long as it takes you to swim it home. */
    if (sw.up) {
      // a trip ends when you get your head out, whether or not you got anything
      if (this.inTrip && this.tripDeepest > 3) this._endTrip();
    } else if (!this.inTrip && depth > 3) {
      this.inTrip = true; this.tripDeepest = depth; this.tripTook = 0;
    }

    if (this._ashore()) {
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
      c.glow.material.opacity = (c.dropped ? 0.75 : 0.5)
        + 0.28 * (0.5 + 0.5 * Math.sin(c.phase * 1.7));

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
    for (const c of this.chests) have[c.tier]++;
    for (let t = 0; t < C.tiers.length; t++) {
      if (have[t] >= C.tiers[t].chests) { this._tierT[t] = 0; continue; }
      this._tierT[t] += dt;
      if (this._tierT[t] < this._respawnFor(t)) continue;
      this._tierT[t] = 0;
      this._spawnChest(t);
    }
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
      this._banner('HANDS FULL', 'None of it counts until it is on the pile', 'good');
    }
    if (c.dropped) st.recovered += Math.round(c.value * this.payout);

    this._tmpV.set(c.x, c.y + 0.6, c.z);
    this.fx.rings.fire(this._tmpV, this.camera.quaternion, 0.6, 4.2, 0.5,
                       this.C.tiers[c.tier].colour);
    this.fx.labels.add(U.money(Math.round(c.value * c.mult * this.payout)), this._tmpV,
      { className: c.tier === 2 ? 'gold' : '', life: 1.1, rise: 5 });
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * U.TAU;
      this.fx.sparks.emit(c.x, c.y + 0.4, c.z,
        Math.cos(a) * 3, 1 + Math.random() * 3, Math.sin(a) * 3,
        0.28 + Math.random() * 0.3, 0.6 + Math.random() * 0.5,
        DiveMission._SPARK);
    }
    AudioBus.play('dv-grab', { tier: c.tier });
    if (c.tier === 2 && this.music) this.music.stinger('boon');
    Input.haptic(16);
    this.camKick = Math.min(this.camKick + 0.6, 1.8);
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

    let total = 0;
    paying.sort((a, b) => b.value - a.value);
    paying.forEach((c, i) => {
      const cash = Math.round(c.value * c.mult * this.payout * this.C.moneyScale);
      total += cash;
      const tier = this.C.tiers[c.tier];
      this.stats.tierBanked[tier.id] = (this.stats.tierBanked[tier.id] || 0) + cash;
      setTimeout(() => {
        if (!this.scene) return;
        AudioBus.play('dv-bank', { step: i });
        this._gain(cash);
      }, i * 150);
    });
    this.money += total;
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
    this._addToPile(paying);
    if (this.party) {
      MissionNet.event({ kind: 'landed', tiers: paying.map(c => c.tier) });
    }

    const pileTop = this.pile
      ? this.shore.landing.y + 0.4 + Math.min(this.pile.n, DiveMission.PILE_CAP) * 0.047
      : this.swimmer.pos.y + 1.2;
    this._tmpV.set(this.shore.landing.x, pileTop + 1.0, this.shore.landing.z);
    this.fx.rings.fire(this._tmpV, this.camera.quaternion, 1.0, 10, 0.7, '#ffd166');
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * U.TAU;
      this.fx.sparks.emit(this._tmpV.x, this._tmpV.y, this._tmpV.z,
        Math.cos(a) * 7, 2 + Math.random() * 6, Math.sin(a) * 7,
        0.3 + Math.random() * 0.4, 0.9 + Math.random() * 0.8,
        DiveMission._SPARK);
    }
    this._paintCarry();
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
    AudioBus.play('dv-drown');
    if (this.music) this.music.stinger('hurt');
    Input.rumble(0.9, 500);
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
      const nc = this._spawnChest(c.tier, { x, y, z });
      if (nc) nc.value = c.value;
      if (this.party) {
        MissionNet.event({ kind: 'drop', tier: c.tier, value: c.value, x, y, z });
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

    const dist = U.lerp(4.2, 6.8, U.clamp(sp01, 0, 1)) + this.camKick * 0.55;
    const height = U.lerp(1.5, 2.3, U.clamp(sp01, 0, 1)) + this.camGasp * 0.8;

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
    const wy = Water.sampleHeight(want.x, want.z) - 0.35;
    const lid = wy + this.surfaceMix * 4.2;
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
    const far = b.far * U.lerp(this.vis, 1, b.air);
    fog.color.lerp(b.colour, 1 - Math.exp(-5 * dt));
    fog.near = U.damp(fog.near, b.near, 5, dt);
    fog.far = U.damp(fog.far, far, 5, dt);
    Water.setFog(fog.near, fog.far * 2.4, fog.color);
    this.reef.setCaustic(U.damp(this.reef.uniforms.caustic.value, b.caustic, 4, dt));
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
      const v = U.clamp(b.vignette * 0.8 + air * air * 0.75, 0, 1);
      el.style.opacity = v.toFixed(3);
    }
  }

  _updateMusic(dt) {
    if (!this.music) return;
    const sw = this.swimmer;
    // surface, then one gear per tier: the arrangement is the depth
    const gear = sw.depth < 3 ? 0 : this._tierAt(sw.depth) + 1;
    if (gear !== this._gear) { this._gear = gear; this.music.setGear(gear, 1.6); }
    this.music.setIntensity(0.5 + (1 - sw.air) * 0.8);
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

    if (h.money) h.money.textContent = U.money(this.money);

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
      const T = this.C.tiers[tierIdx];
      h.tier.textContent = T.name;
      h.tier.style.color = T.colour;
    }
    if (h.tapeMark) {
      const frac = U.clamp(sw.depth / this.tapeMax, 0, 1);
      h.tapeMark.style.top = (frac * 100).toFixed(1) + '%';
    }

    if (h.time) {
      h.time.textContent = this.mode === 'deep'
        ? U.clockTime(this.elapsed)
        : Math.ceil(this.timeLeft);
      h.time.classList.toggle('low', this.mode === 'salvage' && this.timeLeft <= 20);
    }
    /* Holding gold is now a *place* problem, so the panel that shows
       what is in your hands has to show how far it is from counting.
       It turns gold when you are close enough for it to bank, which is
       the only feedback the rule needs. */
    if (h.shore) {
      const carrying = this.carry.length > 0;
      h.shore.classList.toggle('show', carrying);
      if (carrying) {
        const d = this._shoreDist();
        const home = this._ashore();
        h.shore.classList.toggle('home', home);
        h.shore.textContent = home ? 'ASHORE' : '\u2191 shore ' + Math.round(d) + 'm';
      }
    }

    if (h.carryVal) {
      const v = this._carryValue();
      h.carryVal.textContent = v ? U.money(v) : '—';
      h.carryVal.classList.toggle('held', v > 0);
    }
  }

  _paintCarry() {
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

  _agendaProgress() {
    const card = this.agenda;
    if (!card) return '';
    if (typeof Agendas === 'undefined') return card.hud || '';
    return Agendas.state(card.id, this.stats) || card.hud || '';
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
      m: Math.round(this.money), d: Math.round(this.deepest),
      tr: this.stats.trips,
    };
  }

  _netTick(dt) {
    if (!this.party) return;
    MissionNet.pose(dt, () => this._sendPose());
    if (this.isHost) {
      this._netAcc += dt;
      if (this._netAcc >= 0.4) {
        this._netAcc = 0;
        // a full snapshot of what exists, rather than deltas: a dropped
        // packet then costs one late chest instead of a phantom one
        MissionNet.event({ kind: 'reef', state: this.state, chests: this.chests.map(c => ({
          i: c.id, t: c.tier, x: U.r3(c.x), y: U.r3(c.y), z: U.r3(c.z),
          d: c.dropped ? 1 : 0, v: c.value,
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
      if (!iv) { peer.sw.group.visible = false; peer.seen = false; continue; }
      const a = iv.a, b = iv.b, k = iv.k;
      peer.seen = true;
      peer.sw.group.visible = true;
      const x = U.lerp(a.x, b.x, k), y = U.lerp(a.y, b.y, k), z = U.lerp(a.z, b.z, k);
      peer.sw.pos.set(x, y, z);
      peer.sw.yaw = U.angLerp(a.h, b.h, k);
      peer.sw.pitch = U.lerp(a.p || 0, b.p || 0, k);
      peer.sw.swimPhase = b.u || 0;
      peer.sw.effort = U.lerp(a.e || 0, b.e || 0, k);
      peer.sw.flow = b.f || 0;
      peer.sw.carried = b.c || 0;
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
    this._fieldT -= dt;
    if (this._fieldT > 0) return;
    this._fieldT = 0.25;
    if (this.agenda) RoomUI.showAgenda(this._agendaProgress());

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
      const tiers = Array.isArray(d.tiers) ? d.tiers : [];
      this._addToPile(tiers
        .filter(t => t >= 0 && t < this.C.tiers.length)
        .map(t => ({ tier: t })));
      return;
    }

    if (d.kind === 'drop' && !this.isHost) {
      // a pile somebody else lost. The host will confirm it on the next
      // snapshot; showing it now is what makes a blackout legible.
      const c = this._spawnChest(d.tier, { x: d.x, y: d.y, z: d.z });
      if (c) c.value = d.value;
      return;
    }
    if (d.kind === 'drop' && this.isHost) {
      const c = this._spawnChest(d.tier, { x: d.x, y: d.y, z: d.z });
      if (c) c.value = d.value;
      return;
    }

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
        c = this._spawnChest(st.t, { x: st.x, y: st.y, z: st.z });
        if (!c) continue;
        c.id = st.i;
        c.value = st.v;
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
    if (this.inTrip) this._endTrip();
    if (this.music) { this.music.setMuffle(0, 0.6); this.music.stop(1.2); this.music = null; }
    Input.setMouseAim(false);
    this._aimOn = false;

    const earned = Math.round(this.money);
    const medal = this._medalFor(earned);
    AudioBus.play('finish');
    this._setCenter(reason || 'THE BELL', U.money(earned), 'go');
    Input.rumble(0.8, 420);
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
      tierBanked: st.tierBanked,
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
  const base = [392, 523.25, 784][U.clamp(o.tier | 0, 0, 2)];
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

AudioBus.define('dv-bank', (c, dest, o = {}) => {
  const t = c.currentTime;
  const step = U.clamp(o.step | 0, 0, 5);
  const f = [659.25, 783.99, 987.77, 1174.66, 1318.5, 1567.98][step];
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(f, t);
  osc.connect(g); g.connect(dest);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.16, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
  osc.start(t); osc.stop(t + 0.8);
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
  tagline: 'Get it to the shore and it is yours. Black out and it is anybody’s.',
  description:
    'A sunlit highland sea loch with a broken trawler on the slope and a trench past it. '
    + 'You jump off the shingle, and nothing counts until you carry it back there and put '
    + 'it on the pile — so every chest you take is a decision about the swim home. Three '
    + 'minutes, one breath at a time. Black out and every chest in your hands drops where '
    + 'you are and lies there, lit, for anybody to take, including the other two. There '
    + 'is no button but the stroke, and the stroke has a beat: land it in the window and '
    + 'you swim faster, breathe cheaper and get paid more. The shelf is easy money. The '
    + 'trench is one round trip if you are on the beat, and a long walk home if you are not.',
  icon: '03',
  maxPrize: 85000,
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
    '<b>The shore is the bank.</b> Surfacing keeps you alive; it does not keep the gold. '
      + 'Nothing counts until you carry it back to the shingle and it goes on the pile, '
      + 'and the swim home is the part everybody watches.',
    '<b>Swim home on the surface.</b> Your bar refills up there and the water is thinner, '
      + 'so the fast way back from the trench is straight up first and along after.',
    '<b>Blacking out does not end the run.</b> It drops everything you were holding on the '
      + 'floor, lit, where anybody can take it — and floats you helplessly for three '
      + 'seconds while they do.',
    '<b>The trench pays fourteen times the shelf.</b> It is also the only tier you cannot '
      + 'reach and return from unless you are swimming well.',
    '<b>Somebody else’s pile is worth full price.</b> If you see a glow on the sand '
      + 'that you did not put there, that is a diver who got greedy.',
    '<b>The lamp on the beach is north.</b> It is the only warm light in the loch and it '
      + 'is visible from the bottom of the trench. If you can see it, you know the way home.',
  ],
  keys: ['<kbd>Space</kbd> kick', '<kbd>Mouse</kbd> steer',
         '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> scull'],

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
    ];
    const tb = r.tierBanked || {};
    rows.push(null,
      ['Shelf', U.money(tb.shelf || 0)],
      ['Wreck', U.money(tb.wreck || 0)],
      ['Trench', U.money(tb.trench || 0)]);
    if (r.landed) rows.push(['Landed on the pile', String(r.landed) + ' chest'
                             + (r.landed === 1 ? '' : 's')]);
    if (r.blackouts) rows.push(['Blacked out', String(r.blackouts) + '×']);
    if (r.lost) rows.push(['Left on the floor', U.money(r.lost)]);
    if (r.recovered) rows.push(['Taken off the floor', U.money(r.recovered)]);
    if (r.payout && Math.abs(r.payout - 1) > 0.005) {
      const why = [r.conditionText, r.modName].filter(Boolean).join(' · ');
      rows.push([`Conditions ×${r.payout.toFixed(2)}`, why]);
    }
    return rows;
  },
});

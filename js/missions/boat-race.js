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
    hoopSpacing: 150,       // average; the real gap breathes with the corners
    hoopRadius: 12.5,
    hoopRadiusScale: 1,
    hoopHeight: 7.6,        // ring centre above the waterline
    riskChance: 0.42,       // how often a gate gets a second, harder ring
    riskRadiusScale: 0.80,
    riskInset: 4.0,         // how close to the wall the risk ring sits
    riskMult: 3,            // and what it pays for going there
    startTime: 80,
    trialLimit: 300,        // a time trial still has to end sometime
    timePerHoop: 3.4,
    timePerfectBonus: 1.2,
    trialGain: 1.5,         // seconds *off* the clock per ring, in time trial
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

  static normalise(opts = {}) {
    const seed = Number.isFinite(opts.seed)
      ? (Math.floor(opts.seed) >>> 0) || BoatRaceMission.CONFIG.seed
      : U.dailySeed();
    return {
      seed,
      mode: opts.mode === 'trial' ? 'trial' : 'prize',
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

  static conditionsFor(seed, mod) {
    return Object.assign(Conditions.forSeed(seed), (mod && mod.cond) || {});
  }

  // everything the setup UI needs, without touching the GPU
  static preview(opts) {
    const o = BoatRaceMission.normalise(opts);
    const mod = Modifiers.byId(o.modId);
    const cond = BoatRaceMission.conditionsFor(o.seed, mod);
    const key = GameState.runKey(o.mode, o.seed, o.modId);
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
      record: GameState.runRecord('boat-race', key),
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
    this.cond = BoatRaceMission.conditionsFor(this.seed, this.mod);
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
    this.gatesHit = 0;
    this.perfects = 0;
    this.riskHits = 0;
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
    const fog = (this.mod && this.mod.fog) || applied.time.fog;
    const wFog = (this.mod && this.mod.waterFog) || applied.time.waterFog;
    scene.fog = new THREE.Fog(Sky.PALETTE.fog, fog.near, fog.far);
    scene.add(Conditions.lights(this.cond));

    // ---- world ----
    Sky.build(scene, U.makeRng(this.seed + 7));
    Water.build(scene);
    // Water.build resets to calm, so the sea state has to go on afterwards
    Conditions.apply(this.cond);
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

    this.gates = this._buildGates();
    this.hoops = this.gates.flatMap(g => g.rings);
    const avoid = this.hoops.map(h => ({ x: h.x, z: h.z, r: h.radius + 14 }));

    this.cliffs = CourseKit.buildCliffs(this.path, U.makeRng(this.seed + 11), {
      stride: 1, baseHeight: 30, heightVary: 52, trees: true,
    });
    scene.add(this.cliffs);

    const rocks = CourseKit.buildRocks(this.path, U.makeRng(this.seed + 23), {
      count: C.rockCount, avoid, detail: 2,
    });
    this.rocks = rocks.mesh;
    this.colliders = rocks.colliders;
    this.rockFoam = rocks.update;
    scene.add(this.rocks, rocks.foam);

    this.shoreFoam = CourseKit.buildShoreFoam(this.path, { spacing: 17 });
    scene.add(this.shoreFoam.mesh);

    this.buoys = CourseKit.buildBuoys(this.path, { spacing: 135 });
    scene.add(this.buoys.mesh);

    this.startGate = this._buildGateArch(6, '#22d3ee', 'START');
    this.finishGate = this._buildGateArch(this.path.total - 22, '#ffd166', 'FINISH');
    scene.add(this.startGate, this.finishGate);

    // ---- boat ----
    this.boat = new Boat({ tune: (this.mod && this.mod.tune) || {} });
    scene.add(this.boat.group);
    const p0 = this.path.at(0);
    this.boat.reset(p0.point.x, p0.point.z, Math.atan2(p0.tangent.x, p0.tangent.z));
    this._prevPos.copy(this.boat.pos);

    // ---- the ghost of your best run on this exact setup ----
    if (this.opts.ghost) this._buildGhost();

    // ---- fx ----
    this.fx = new FXSystem(scene, camera, document.getElementById('world-labels'));

    this.world = { colliders: this.colliders, path: this.path, hint: -1, _frame: {} };

    // riptide always shoves you the same way down a given channel
    this.ripSign = U.makeRng(this.seed + 77)() < 0.5 ? -1 : 1;

    this.targets = this._computeTargets();
    this._cacheHud();
    this._camPos = new THREE.Vector3().copy(this.boat.pos).add(new THREE.Vector3(0, 10, -24));
    this._camLook = new THREE.Vector3().copy(this.boat.pos);
    this._camRoll = 0;

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
    const baseR = C.hoopRadius * C.hoopRadiusScale;
    const riskR = baseR * C.riskRadiusScale;

    this._ringGeo = new THREE.TorusGeometry(baseR, 0.85, 14, 56);
    this._glowGeo = new THREE.TorusGeometry(baseR, 2.9, 8, 44);
    this._riskRingGeo = new THREE.TorusGeometry(riskR, 0.8, 14, 48);
    this._riskGlowGeo = new THREE.TorusGeometry(riskR, 2.6, 8, 40);
    this._lampGeo = new THREE.IcosahedronGeometry(0.85, 1);

    // Everything that never changes colour — pylons, pontoons and the rim
    // blades — is one geometry shared by every ring. Twenty-six gates used to
    // cost fourteen draw calls each.
    const frameGeo = this._buildHoopFrame(baseR);
    const riskFrameGeo = this._buildHoopFrame(riskR);
    const frameMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this._hoopGeos = [this._ringGeo, this._glowGeo, this._riskRingGeo,
                      this._riskGlowGeo, this._lampGeo, frameGeo, riskFrameGeo];
    this._hoopFrameMat = frameMat;
    this._frameGeos = { safe: frameGeo, risk: riskFrameGeo };

    // the weave that makes you drive is seeded, so no two channels phrase
    // their gates the same way
    const w1 = rng.range(0.8, 1.5), w2 = rng.range(0.3, 0.7);
    const p1 = rng.range(0, 6.28), p2 = rng.range(0, 6.28);

    let s = 200, idx = 0;
    while (s < this.path.total - 150) {
      const at = this.path.at(s);
      const nx = -at.tangent.z, nz = at.tangent.x;

      const sway = Math.sin(idx * w1 + p1) * 0.5 + Math.sin(idx * w2 + p2) * 0.22;
      const gate = {
        index: idx, s,
        cx: at.point.x, cz: at.point.z,
        nx: at.tangent.x, nz: at.tangent.z,   // gate plane normal = travel direction
        state: 'pending', rings: [],
      };

      gate.rings.push(this._makeRing(gate, at, sway * (at.half - baseR - 18), baseR, 'safe'));

      const wantRisk = this.flags.allRisk || rng() < C.riskChance;
      if (wantRisk) {
        // hard against the opposite wall from wherever the safe line went
        const side = sway >= 0 ? -1 : 1;
        const lat = side * (at.half - riskR - C.riskInset);
        gate.rings.push(this._makeRing(gate, at, lat, riskR, 'risk'));
      }

      gates.push(gate);
      idx++;
      // Gates bunch up through the bends and stretch out on the straights, so
      // the course has phrasing — a run-up, a flurry, a breather — instead of
      // a metronome.
      const curv = this._curvature(s);
      s += U.lerp(C.hoopSpacing * 1.5, C.hoopSpacing * 0.68, curv);
    }
    return gates;
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

  _makeRing(gate, at, lat, radius, kind) {
    const C = this.C;
    const risk = kind === 'risk';
    const nx = -at.tangent.z, nz = at.tangent.x;
    const x = at.point.x + nx * lat, z = at.point.z + nz * lat;

    const idle = risk ? '#f5b625' : '#25e0f5';
    const group = new THREE.Group();
    const ring = new THREE.Mesh(risk ? this._riskRingGeo : this._ringGeo,
      new THREE.MeshLambertMaterial({
        color: risk ? '#7a4c05' : '#0e7d92', emissive: idle,
        emissiveIntensity: 1.5, flatShading: true,
      }));
    const glow = new THREE.Mesh(risk ? this._riskGlowGeo : this._glowGeo,
      new THREE.MeshBasicMaterial({
        color: risk ? '#ffca4d' : '#39e6ff', transparent: true, opacity: 0.22,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
    glow.renderOrder = 3;
    const frame = new THREE.Mesh(this._frameGeos[kind], this._hoopFrameMat);
    const lamp = new THREE.Mesh(this._lampGeo, new THREE.MeshLambertMaterial({
      color: '#ffffff', emissive: idle, emissiveIntensity: 1.6, flatShading: true,
    }));
    lamp.position.set(0, radius + 1.6, 0);
    group.add(ring, glow, frame, lamp);
    group.rotation.y = Math.atan2(at.tangent.x, at.tangent.z);
    this.scene.add(group);

    const h = {
      gate, kind, risk, x, z, lat,
      baseRadius: radius, radius,
      idle, group, ring, glow, lamp,
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
      parts.push(paint(post, '#e5133f'));
      const float = new THREE.IcosahedronGeometry(2.3, 2);
      float.translate(side * (radius + 1.6), -C.hoopHeight, 0);
      parts.push(paint(float, '#ffd166'));
    }
    for (let b = 0; b < 8; b++) {
      const a = (b / 8) * Math.PI * 2 + Math.PI / 8;
      const bl = new THREE.BoxGeometry(0.5, 1.7, 0.5);
      bl.rotateZ(a - Math.PI / 2);
      bl.translate(Math.cos(a) * (radius + 1.1), Math.sin(a) * (radius + 1.1), 0);
      parts.push(paint(bl, '#ffd166'));
    }
    return Sky.mergeGeometries(parts);
  }

  _bannerTexture(text, color) {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = color; g.fillRect(0, 0, 1024, 256);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let i = 0; i < 1024; i += 128) g.fillRect(i, 0, 64, 256);
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.fillRect(0, 0, 1024, 18); g.fillRect(0, 238, 1024, 18);
    g.fillStyle = '#12202e';
    g.font = 'bold 148px system-ui, sans-serif';
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

  _buildGhost() {
    const data = GameState.getGhost('boat-race', this.key);
    if (!data || !data.n) return;
    this.ghost = data;

    const mesh = Boat.buildMesh({
      hull: '#9fe9ff', hullLo: '#7fd3ef', stripe: '#39e6ff', stripe2: '#1ea8c9',
      bottom: '#1d5f7d', bottomLo: '#164a63', deck: '#bff0ff', deckDk: '#93d8ec',
      accent: '#d8f6ff', glass: '#e8fbff',
    });
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
      const par = Math.max(25, this.path.total / speed - gates * C.trialGain * 2.4);
      return { kind: 'time', par, cuts: [par * 1.30, par * 1.12, par, par * 0.88] };
    }
    // per gate: the base ring, a healthy multiplier, and the gold rings and
    // close calls a good line picks up on the way past — plus an allowance
    // for tricks that scales with the sea, because a big swell hands you far
    // more launches to spin off and par has to expect you to take them
    const par = (gates * C.moneyPerHoop * C.moneyScale * 4.4
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

  start() {
    this.state = 'countdown';
    this.countdown = 3.999;
    this.engineSnd = AudioBus.engine();
    this.ambSnd = AudioBus.ambience();
    this._lastBeep = 4;
    Screens.show('hud');
    this._setCenter('', '');
  }

  dispose() {
    clearTimeout(this._reportT);
    clearTimeout(this._flashT);
    if (this.engineSnd) this.engineSnd.stop();
    if (this.ambSnd) this.ambSnd.stop();
    if (this.fx) this.fx.dispose();
    for (const g of this._hoopGeos || []) g.dispose();
    if (this._hoopFrameMat) this._hoopFrameMat.dispose();
    Engine.disposeObject(this.scene);
    Sky.resetPreset();
    this.scene = null;
    if (this.hud) {
      this.hud.vignette.style.opacity = 0;
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
    this.gatesHit = 0; this.perfects = 0; this.riskHits = 0;
    this.tricks = 0; this.trickMoney = 0; this.grazeMoney = 0; this.grazeT = 0;
    this._airHints = 0;
    this.elapsed = 0;
    this.hint = -1; this.world.hint = -1;
    this.hitStop = 0; this.timeScale = 1; this.timeScaleTarget = 1;
    this.camDip = 0; this.camPush = 0; this.shake = 0;
    this._lastBeep = 4;
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
      h.glow.material.color.set(h.risk ? '#ffca4d' : '#39e6ff');
    }
    const p0 = this.path.at(0);
    this.boat.reset(p0.point.x, p0.point.z, Math.atan2(p0.tangent.x, p0.tangent.z));
    this._prevPos.copy(this.boat.pos);
    this.fx.wake.clear();
    this.fx.labels.clear();
    this._setCenter('', '');
  }

  /* =================== per-frame =================== */

  update(rawDt, t) {
    if (!this.scene) return;
    if (Engine.isPaused()) return;

    if (Input.pressed('restart') && (this.state === 'racing' || this.state === 'failed')) {
      this.restart();
    }
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

    Water.update(dt);
    Water.follow(this.boat.pos.x, this.boat.pos.z);

    if (this.state === 'countdown') this._updateCountdown(rawDt);

    // position the rings on the swell *before* testing this frame's crossings
    this._updateHoopVisuals(dt, t);

    const racing = this.state === 'racing';
    const ctl = racing
      ? {
          throttle: Input.throttle(),
          steer: Input.steer(),
          boost: Input.held('boost') && !(this.flags.noBoost && !this.boat.airborne),
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
      this.elapsed += dt;
      if (this.mode === 'prize') this.time -= dt;
      this._updateCombo(dt);
      this._checkGates();
      this._checkGraze(dt);
      this._recordGhost(dt);
      this._checkFinish();
      if (this.mode === 'prize' && this.time <= 0) { this.time = 0; this._fail("TIME'S UP"); }
      if (this.mode === 'trial' && this.elapsed > this.C.trialLimit) this._fail('TOO SLOW');
    }
    this._updateGhost(dt);

    this.buoys.update();
    if (this.rockFoam) this.rockFoam(dt);
    if (this.shoreFoam) this.shoreFoam.update(dt);
    this._spawnFx(dt);
    this.fx.update(dt);
    this._updateCamera(rawDt);
    Sky.update(dt, this.camera.position, t);
    this._updateAudio();
    this._updateHud(rawDt);
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
        this._setCenter('GO!', '', 'go');
        this.fovKick = 10;
        Input.rumble(0.5, 200);
        setTimeout(() => this._setCenter('', ''), 700);
      }
    }
    if (this.countdown <= 0) {
      this.state = 'racing';
      this.boat.boost = this.flags.noBoost ? 0 : 1;
    }
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

        // score every ring on the plane, then keep the best pass: a risk
        // ring always outranks the safe one it shares a gate with
        let best = null;
        for (const h of gate.rings) {
          const dLat = (ix - h.x) * rx + (iz - h.z) * rz;
          const dVert = iy - h.pos.y;
          if (Math.hypot(dLat, dVert) >= h.radius) continue;
          // centring is measured against the ring's sweet spot — roughly
          // where a hull actually rides through it
          const sweet = Math.hypot(dLat, (dVert + h.height * 0.62) * 0.7);
          if (!best) best = { h, sweet };
          else if (h.risk !== best.h.risk) { if (h.risk) best = { h, sweet }; }
          else if (sweet < best.sweet) best = { h, sweet };
        }
        if (best) this._hitRing(best.h, best.sweet);
        else this._missGate(gate);
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
      if (other !== h && other.state === 'pending') this._dimRing(other, 'skipped');
    }

    const perfect = radialDist < h.radius * 0.30;
    if (perfect) this.perfects++;
    if (h.risk) this.riskHits++;
    const mult = 1 + Math.floor(this.combo / 2) * 0.5;
    const risk = h.risk ? C.riskMult : 1;
    const amount = Math.round(C.moneyPerHoop * C.moneyScale * mult * risk
                              * (perfect ? C.perfectMult : 1));
    this.money += amount;

    if (this.mode === 'trial') {
      this.deduct += (C.trialGain + (perfect ? C.trialPerfectBonus : 0)) * risk;
    } else {
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

    const tag = h.risk ? `RISK ×${C.riskMult}  ` : (perfect ? 'PERFECT  ' : '');
    this.fx.labels.add(tag + U.money(amount) + (mult > 1 ? `  ×${mult}` : ''), h.pos, {
      className: h.risk ? 'perfect' : (perfect ? 'perfect' : 'good'), life: 1.5, rise: 11,
    });

    this.fovKick = Math.min(this.fovKick + (perfect || h.risk ? 7.0 : 4.0), 14);
    this._flash(perfect || h.risk ? 0.34 : 0.18, h.risk ? '#ffb020' : (perfect ? '#ffd166' : '#7dfcd0'));
    AudioBus.play(perfect || h.risk ? 'perfect' : 'hoop', { combo: this.combo });
    AudioBus.play('whoosh', { amount: 0.6 + this.boat.speed01 * 0.7 });
    Input.rumble(perfect || h.risk ? 0.55 : 0.3, perfect ? 170 : 100);
    Input.haptic(perfect ? 24 : 12);

    // sparks through the ring
    const c = new THREE.Color(h.risk ? '#ffb020' : (perfect ? '#ffd166' : '#7dfcd0'));
    const n = perfect || h.risk ? 52 : 30;
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

  _missGate(gate) {
    gate.state = 'miss';
    for (const h of gate.rings) if (h.state === 'pending') this._dimRing(h, 'miss');
    const at = gate.rings[0].pos;
    if (this.combo >= 3) {
      this.fx.labels.add('COMBO LOST', at, { className: 'bad', life: 1.2, rise: 7 });
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
    this._setCenter('COURSE COMPLETE',
      trial ? U.clockTime(finalTime) : U.money(earned), 'go');
    // a long slow exhale over the line
    this.timeScaleTarget = 0.35;
    this.fovKick = 12;
    Input.rumble(0.8, 420);
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
    for (let i = 0; i < 220; i++) {
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
    AudioBus.play('miss');
    this._setCenter(headline || "TIME'S UP", 'Press R to try again', 'bad');
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
      tricks: this.tricks,
      bestCombo: this.bestCombo,
      par: this.targets.par,
      targetKind: this.targets.kind,
    }, part);
  }

  _report() {
    if (this.reported || !this.result) return;
    this.reported = true;
    const r = this.result;

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
    Engine.setPaused(true);
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
        const beat = h.risk ? 4.6 : 3;
        const pulse = 1.1 + Math.sin(t * beat + h.gate.index) * (h.risk ? 0.45 : 0.3);
        h.ring.material.emissiveIntensity = pulse;
        h.lamp.material.emissiveIntensity = 0.8 + pulse;
        h.glow.material.opacity = 0.14 + pulse * 0.11;
        const s = (1 + Math.sin(t * beat + h.gate.index) * 0.012) * shrink;
        h.group.scale.setScalar(s);
      } else if (h.flash > 0) {
        h.flash = Math.max(0, h.flash - dt * 1.6);
        h.ring.material.emissiveIntensity = 0.7 + h.flash * 2.6;
        h.lamp.material.emissiveIntensity = 0.7 + h.flash * 2.6;
        h.glow.material.opacity = 0.08 + h.flash * 0.36;
        h.group.scale.setScalar(1 + h.flash * 0.06);
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
    AudioBus.play('perfect', { combo: Math.min(this.combo + spins, 8) });
    this._flash(0.3, '#ffd166');
    this.fovKick = Math.min(this.fovKick + 6, 16);
    Input.rumble(0.6, 220);
  }

  _spawnFx(dt) {
    const b = this.boat;
    const sp = b.speed;
    const fx = Math.sin(b.heading), fz = Math.cos(b.heading);
    const rx = fz, rz = -fx;
    const H = Boat.HULL;

    // ---- boost ignition -------------------------------------------------
    if (b.boostStarted) {
      AudioBus.play('boostpop');
      AudioBus.play('boost');
      this.fovKick = Math.min(this.fovKick + 8, 16);
      this.camPush = 1;
      this.shake = Math.min(this.shake + 0.30, 1.2);
      Input.rumble(0.7, 220);
      this.fx.rings.fire(
        this._tmpV.set(b.pos.x - fx * 5.4, b.pos.y + 0.4, b.pos.z - fz * 5.4),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, b.heading, 0)),
        1.5, 16, 0.45, '#7ff3ff');
      for (let i = 0; i < 40; i++) {
        this.fx.sparks.emit(
          b.pos.x - fx * 5.6 + (Math.random() - 0.5) * 2, b.pos.y + 0.4,
          b.pos.z - fz * 5.6 + (Math.random() - 0.5) * 2,
          -fx * (14 + Math.random() * 16) + (Math.random() - 0.5) * 7,
          1 + Math.random() * 5,
          -fz * (14 + Math.random() * 16) + (Math.random() - 0.5) * 7,
          0.7 + Math.random() * 1.0, 0.35 + Math.random() * 0.3,
          { r: 0.55, g: 0.95, b: 1 });
      }
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
        0.6 + Math.random() * 0.9, 0.28 + Math.random() * 0.24,
        { r: 0.55, g: 0.95, b: 1 });
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
      Input.rumble(U.clamp(amt, 0.2, 1), 140);
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
          AudioBus.play('perfect', { combo: 2 });
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
      Input.rumble(U.clamp(b.impact, 0.3, 1), 260);
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

    // pull back and drop as you go faster
    const sp01 = U.clamp(b.speed / b.tune.topSpeed, 0, 1.4);
    this.camPush = U.damp(this.camPush, 0, 2.6, dt);
    this.camDip = U.damp(this.camDip, 0, 4.5, dt);
    const dist = U.lerp(14.5, 20.5, U.clamp(sp01, 0, 1)) + this.camPush * 3.0;
    const height = U.lerp(5.2, 6.8, U.clamp(sp01, 0, 1)) + (b.airborne ? 2.2 : 0) - this.camDip;

    const fx = Math.sin(b.heading), fz = Math.cos(b.heading);
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
    const lx = b.pos.x + fx * lookAhead, lz = b.pos.z + fz * lookAhead;
    const ly = b.pos.y + 3.0 + (b.airborne ? 1.2 : 0);
    this._camLook.x = U.damp(this._camLook.x, lx, 7.5, dt);
    this._camLook.y = U.damp(this._camLook.y, ly, 6, dt);
    this._camLook.z = U.damp(this._camLook.z, lz, 7.5, dt);

    cam.position.copy(this._camPos);

    // shake: event shake, plus a constant fine rattle once you're really moving
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.2);
      const s = this.shake * this.shake * 1.7;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s;
    }
    const rattle = U.smoothstep(0.55, 1.25, sp01) * (b.boosting ? 0.16 : 0.09) * (b.airborne ? 0.2 : 1);
    if (rattle > 0.001) {
      cam.position.x += (Math.random() - 0.5) * rattle;
      cam.position.y += (Math.random() - 0.5) * rattle;
    }

    cam.lookAt(this._camLook);
    // bank the camera a touch with the boat — sells the turn. A barrel roll
    // only leans the camera a fraction of the way round, or the horizon
    // would spin and the landing would be unreadable.
    const airLean = b.airborne ? U.wrapAngle(b.roll) * 0.12 : 0;
    this._camRoll = U.damp(this._camRoll, -b.roll * (b.airborne ? 0 : 0.30) - airLean
                           - b.yawVel * 0.11, 5, dt);
    cam.rotateZ(this._camRoll);

    // FOV: speed + boost + hoop punch
    this.fovKick = U.damp(this.fovKick, 0, 4.5, dt);
    const targetFov = this.baseFov + sp01 * 13 + (b.boosting ? 8 : 0) + this.fovKick;
    cam.fov = U.damp(cam.fov, targetFov, 7, dt);
    cam.updateProjectionMatrix();
  }

  _updateAudio() {
    if (!this.engineSnd) return;
    const b = this.boat;
    const sp01 = U.clamp(b.speed / b.tune.boostTop, 0, 1);
    this.engineSnd.set(sp01, Math.max(0, b.throttleIn) + (b.boosting ? 0.4 : 0),
      b.airborne ? 1 : 0);
  }

  _flash(amount, color) {
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
    h.vignette.style.opacity = String(sp01 * 0.85);
    h.vignette.classList.toggle('boost', b.boosting);
    const surfing = b.surf > 0.22 && !b.airborne;
    h.surf.classList.toggle('on', surfing);
    if (surfing) h.surf.style.opacity = String(U.clamp(b.surf, 0, 1) * 0.9);
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
    'alive for a bigger multiplier.',
  icon: '01',
  maxPrize: 60000,
  players: 'Solo',
  duration: '~2 min',
  order: 0,
  setup: true,                      // this mission has a pre-race setup panel
  preview: (opts) => BoatRaceMission.preview(opts),
  modes: BoatRaceMission.MODES,
  medals: BoatRaceMission.MEDALS,
  create: (opts) => new BoatRaceMission(opts),
  better: (a, b) => (a.earned || 0) > (b.earned || 0),
});

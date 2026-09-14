/* ------------------------------------------------------------------
   mountain.js — reusable "one face of a mountain" world kit.

   `CourseKit` builds a channel you drive along and `ForestKit` builds a
   place you stand in. This builds the third shape: a face you fall
   down. It is the only one of the three where the ground is the engine,
   so the whole kit is organised around one promise —

       every metre of this mountain is a pure function of (x, z)

   — because that is what lets the skier, the mesh, the trees, the
   ramps and three separate clients all agree about where the snow is
   without any of them talking to each other.

   The face descends along +Z. That is not a simplification, it is the
   thing that makes the rest cheap: progress is `z`, the fall line is
   `-dy/dz`, and there is never a point on the mountain that could
   belong to two parts of the run. A winding path would have bought a
   nicer minimap and cost a nearest-point search in every one of the
   forty thousand places this file asks how high the snow is.

   The run winds anyway — the *piste* does, inside a face that does not.
   `cx(z)` traverses up to seventy metres either side of the fall line,
   which is what makes a shortcut possible at all: the groomed way round
   a bend is longer than the line straight down it, and the line
   straight down it goes through the trees.

   Height is a sum, and every term is somebody's job:

     base    the descent profile — steeps, benches, the runout
     folds   long ridges and gullies running down the face
     rolls   the shorter stuff you get air off
     groom   the piste is smoother than the snow either side of it
     bank    a berm along each edge of the piste, to carve up and launch
     chutes  the shortcuts, cut through the wood as gullies
     ramps   every kicker, hip, roller and cliff, as terrain
     walls   the valley sides, which are why the run is a run

   Nothing here is a separate collision object. A kicker is not a mesh
   sitting on snow, it is snow — so the thing you see, the thing you
   ski, the thing three clients each build from the seed and the thing
   the camera avoids clipping are all the same eleven lines of maths.
------------------------------------------------------------------ */
const MountainKit = (() => {

  const COL = {
    snow:      new THREE.Color('#f4fbff'),
    snowLit:   new THREE.Color('#ffffff'),
    snowDeep:  new THREE.Color('#c2dcf2'),
    shade:     new THREE.Color('#9dc0e0'),
    ice:       new THREE.Color('#bfe6f5'),
    rock:      new THREE.Color('#5c6478'),
    rockDark:  new THREE.Color('#3f4658'),
    rockWarm:  new THREE.Color('#6d6558'),
    pine:      new THREE.Color('#1f4d3a'),
    pineDeep:  new THREE.Color('#163828'),
    pineSnow:  new THREE.Color('#dff0ff'),
    bark:      new THREE.Color('#3a2b22'),
    piste:     new THREE.Color('#ffffff'),
    chute:     new THREE.Color('#e4f2ff'),
    /* The run-up of a boost ramp. It has to be readable at two hundred
       metres and through a whiteout, and it is the only saturated thing
       on a white mountain, which is the whole point of it: you should
       be steering at these from a long way up. */
    boost:     new THREE.Color('#22c8ff'),
    boostHot:  new THREE.Color('#ffb020'),
  };

  const fbm2 = (x, z, o, s) => ForestKit.fbm2(x, z, o, s);

  /* =============== the shape of a descent ===============

     A run that is one gradient from top to bottom is a run you have
     understood in ten seconds. These are the pieces it is made of, and
     the seed deals a hand of them: what changes between two mountains
     is not the scenery, it is what the ground asks you to do and in
     what order.

     `grade` is rise over run — 0.30 is a shade over sixteen degrees,
     which does not sound like much until it is under you at forty
     metres a second. `half` is how wide the groomed piste is, and it
     is the single biggest dial on how a section feels: the same
     gradient through a twenty-metre gully and a seventy-metre face are
     not the same place. */

  const SECTIONS = [
    { id: 'face',   name: 'The Face',    grade: [0.23, 0.29], half: [48, 64],
      trees: 0.30, ramps: 1.00, rolls: 1.00, bank: 3.4, weight: 3,
      blurb: 'Open, fast, and nowhere to hide a bad line.' },
    { id: 'steeps', name: 'The Steeps',  grade: [0.35, 0.44], half: [30, 42],
      trees: 0.18, ramps: 0.75, rolls: 1.25, bank: 4.6, weight: 3,
      blurb: 'It falls away under you. Everything happens sooner than you planned.' },
    { id: 'glades', name: 'The Glades',  grade: [0.20, 0.26], half: [56, 76],
      trees: 1.00, ramps: 0.55, rolls: 0.80, bank: 2.6, weight: 3,
      blurb: 'Trees in the run. Thread them at speed and the meter climbs.' },
    { id: 'gully',  name: 'The Gully',   grade: [0.25, 0.31], half: [22, 32],
      trees: 0.40, ramps: 1.25, rolls: 0.70, bank: 8.5, weight: 2,
      blurb: 'Walls both sides. Ride them round the corners instead of turning.' },
    { id: 'cliffs', name: 'The Cliffs',  grade: [0.29, 0.37], half: [42, 58],
      trees: 0.22, ramps: 1.70, rolls: 0.85, bank: 3.0, weight: 2, drops: true,
      blurb: 'Steps in the mountain. Every one of them is air if you arrive quick enough.' },
    { id: 'shelf',  name: 'The Shelf',   grade: [0.11, 0.16], half: [62, 82],
      trees: 0.35, ramps: 1.40, rolls: 0.55, bank: 2.2, weight: 2,
      blurb: 'Nearly flat. Whatever speed you brought is all you are getting.' },
    { id: 'bowl',   name: 'The Bowl',    grade: [0.26, 0.33], half: [66, 88],
      trees: 0.12, ramps: 1.10, rolls: 1.40, bank: 6.0, weight: 2,
      blurb: 'A wide open bowl with sides you can run all the way up.' },
  ];

  // the two that are never dealt, because a run has to start and stop
  const OPENER = { id: 'cornice', name: 'The Cornice', grade: [0.40, 0.48], half: [26, 36],
                   trees: 0.10, ramps: 0.40, rolls: 0.60, bank: 5.0,
                   blurb: 'Straight off the top. There is no gentle way into this.' };
  const CLOSER = { id: 'runout', name: 'The Runout',  grade: [0.075, 0.115], half: [54, 74],
                   trees: 0.25, ramps: 1.20, rolls: 0.45, bank: 2.4,
                   blurb: 'Flat, and the finish is a long way down it. This is where the run is won.' };

  const byId = (id) => SECTIONS.find(s => s.id === id) || null;

  /* =============== the face =============== */

  const YSTEP = 6;              // arc of the descent profile table

  class Face {
    constructor(rng, opts = {}) {
      this.rng = rng;
      this.top = opts.top ?? 1180;

      /* ---- the running order ----
         Opener and closer are fixed; the middle is drawn without
         replacement so no mountain is the same section twice running,
         which is the failure that makes a generated course read as
         wallpaper. */
      const bag = SECTIONS.flatMap(s => Array(s.weight).fill(s));
      const mid = [];
      const used = new Set();
      const wantMid = opts.sections ?? 5;
      for (let guard = 0; mid.length < wantMid && guard < 200; guard++) {
        const s = bag[(rng() * bag.length) | 0];
        if (used.has(s.id) && used.size < SECTIONS.length) continue;
        if (mid.length && mid[mid.length - 1].id === s.id) continue;
        used.add(s.id);
        mid.push(s);
        if (used.size >= SECTIONS.length) used.clear();
      }

      this.sections = (opts.authored || [OPENER, ...mid, CLOSER]).map((s, i, all) => {
        const first = i === 0, last = i === all.length - 1;
        /* Measured, not guessed. At the lengths this first shipped with
           a full descent took three and a half minutes of real skiing,
           which is twice what the briefing promises and about ninety
           seconds past the point where a run stops being a run and
           becomes a commute. These give roughly two minutes at the pace
           the physics actually produces. */
        const len = s.length || (first ? rng.range(220, 290)
                  : last ? rng.range(380, 480)
                  : rng.range(300, 440));
        return {
          def: s, id: s.id, name: s.name, blurb: s.blurb,
          z0: 0, z1: 0, len,
          grade: rng.range(s.grade[0], s.grade[1]),
          half: rng.range(s.half[0], s.half[1]),
          trees: s.trees, ramps: s.ramps, rolls: s.rolls,
          bank: s.bank, drops: !!s.drops,
        };
      });
      let acc = 0;
      for (const s of this.sections) { s.z0 = acc; acc += s.len; s.z1 = acc; }
      this.total = acc;

      /* ---- the descent, as a table ----
         Gradient is authored per section and blended across the joins,
         then integrated once. Sampling the integral is a lerp; sampling
         the gradient directly would have put a step in the mountain at
         every section boundary and a launch ramp nobody placed. */
      const n = Math.ceil(this.total / YSTEP) + 2;
      this.yTab = new Float64Array(n);
      this.gTab = new Float64Array(n);
      let y = this.top;
      for (let i = 0; i < n; i++) {
        const z = i * YSTEP;
        const g = this._rawGrade(z);
        this.gTab[i] = g;
        this.yTab[i] = y;
        y -= g * YSTEP;
      }
      this.bottom = y;

      /* ---- the piste's own wander, which is the entire reason a
         shortcut can exist ----

         The amplitudes are large on purpose and it took measuring to
         find out how large. A traverse only makes the groomed way round
         longer than the line straight down it by

             arc/chord ≈ 1 + ⟨x′²⟩/2

         so a gentle wander — seventy metres over four hundred, which
         *looks* like plenty on a map — buys about three metres over a
         four-hundred-metre span and no shortcut on this mountain would
         ever have been worth taking. At these numbers the mean squared
         traverse is around 0.14 and the same span saves nearer thirty,
         which is a real decision with a real number on it.

         The *wavelength* matters as much as the amplitude and for a
         different reason: arc length only pulls away from the chord
         over a full period of traverse, so a mountain with one lazy
         bend in it has at most one shortcut on it. `l` here is the
         sine's scale, and the wavelength is 2πl — six times longer,
         which is worth writing down because getting that wrong is
         exactly how the first three attempts at this ended up with a
         piste whose entire run was less than one traverse. At these
         numbers a bend comes round every five hundred metres or so and
         a mountain has three or four cuttable corners on it.

         It also means the run genuinely switchbacks, which is what
         makes carving matter: a piste you can point straight down is
         one nobody ever has to turn on. */
      this.w1 = { a: rng.range(34, 48), l: rng.range(74, 98), p: rng() * U.TAU };
      this.w2 = { a: rng.range(8, 15), l: rng.range(32, 50), p: rng() * U.TAU };

      // ---- noise seeds, so two mountains are two mountains ----
      this.sFold = rng() * 900;
      this.sRoll = rng() * 900;
      this.sMog  = rng() * 900;
      this.sPaint = rng() * 900;

      this.wallAt = opts.wall ?? 148;      // where the valley sides start
      this.wallH = opts.wallHeight ?? 105;
      this.edge = opts.edge ?? 205;        // and where the built world stops

      this.ramps = [];
      this.chutes = [];
      /* The park furniture. None of it is terrain: a pad does not move
         the snow and a spinner is in the air, so they are plain lists
         the skier queries rather than two more things `heightAt` has to
         add up sixty thousand times. */
      this.pads = [];
      this.spinners = [];
      this._bucket = null;                 // ramps, indexed by z, built on seal
      this._padBucket = null;
      this._chuteBucket = null;
    }

    /* Gradient with the joins smoothed over sixty metres either side.
       Without the blend a bench that follows a steep is a compression
       hard enough to launch a skier straight into the trees. */
    _rawGrade(z) {
      const list = this.sections;
      let cur = list[list.length - 1];
      for (const s of list) { if (z < s.z1) { cur = s; break; } }
      let g = cur.grade;
      const BLEND = 60;
      if (z < cur.z0 + BLEND) {
        const prev = list[list.indexOf(cur) - 1];
        if (prev) g = U.lerp(prev.grade, g, U.smoothstep(cur.z0 - BLEND, cur.z0 + BLEND, z));
      } else if (z > cur.z1 - BLEND) {
        const nxt = list[list.indexOf(cur) + 1];
        if (nxt) g = U.lerp(g, nxt.grade, U.smoothstep(cur.z1 - BLEND, cur.z1 + BLEND, z));
      }
      return g;
    }

    sectionAt(z) {
      const list = this.sections;
      for (const s of list) if (z < s.z1) return s;
      return list[list.length - 1];
    }

    // the descent profile: height of the fall line at z, before anything
    baseY(z) {
      const t = U.clamp(z, -400, this.total + 600) / YSTEP;
      const i = Math.floor(t);
      if (i < 0) return this.yTab[0] - (z) * this.gTab[0];
      const last = this.yTab.length - 1;
      if (i >= last) return this.yTab[last] - (z - last * YSTEP) * this.gTab[last];
      return U.lerp(this.yTab[i], this.yTab[i + 1], t - i);
    }

    gradeAt(z) {
      const i = U.clamp(Math.round(z / YSTEP), 0, this.gTab.length - 1);
      return this.gTab[i];
    }

    // where the groomed run is, and how wide
    cxAt(z) {
      return Math.sin(z / this.w1.l + this.w1.p) * this.w1.a
           + Math.sin(z / this.w2.l + this.w2.p) * this.w2.a;
    }

    /* The traverse, as a gradient. A shortcut is worth taking exactly
       when this is large, so the generator reads it rather than
       guessing where the bends are. */
    cxSlopeAt(z) {
      return Math.cos(z / this.w1.l + this.w1.p) * this.w1.a / this.w1.l
           + Math.cos(z / this.w2.l + this.w2.p) * this.w2.a / this.w2.l;
    }

    halfAt(z) {
      const list = this.sections;
      let cur = list[list.length - 1];
      for (const s of list) { if (z < s.z1) { cur = s; break; } }
      let h = cur.half;
      const BLEND = 90;
      const i = list.indexOf(cur);
      if (z < cur.z0 + BLEND && list[i - 1]) {
        h = U.lerp(list[i - 1].half, h, U.smoothstep(cur.z0 - BLEND, cur.z0 + BLEND, z));
      } else if (z > cur.z1 - BLEND && list[i + 1]) {
        h = U.lerp(h, list[i + 1].half, U.smoothstep(cur.z1 - BLEND, cur.z1 + BLEND, z));
      }
      return h;
    }

    bankAt(z) {
      const s = this.sectionAt(z);
      return s.bank;
    }

    /* How broken the snow is allowed to be here, and it is not a look —
       it is a hard constraint. Terrain noise contributes gradient of its
       own, and if that gradient can exceed the pitch it is sitting on
       then the mountain has *uphills* in it: a skier on a bench or in
       the runout coasts into one at fourteen metres a second, decelerates
       at six, and stops. It happened, it was reproducible, and from
       inside the run it read as the physics being broken rather than as
       a hill being flat.

       So roughness scales with the gradient. A forty-per-cent pitch gets
       the full rolling, broken face; the runout gets a quarter of it and
       is therefore always, provably, downhill. It is also simply true:
       benches are smooth and steeps are not. */
    roughAt(z) {
      return U.clamp(this.gradeAt(z) / 0.30, 0.26, 1.15);
    }

    /* ---- the shortcuts ----
       A chute is a straight line between two points on the piste, which
       is only a shortcut because the piste between them is not straight.
       It is stored as a corridor rather than a mesh, so the trees, the
       terrain, the ramps and the "am I in it" test all read the same
       four numbers. */
    addChute(c) { this.chutes.push(c); this._chuteBucket = null; return c; }

    chuteX(c, z) {
      const u = U.clamp((z - c.z0) / (c.z1 - c.z0), 0, 1);
      return U.lerp(c.x0, c.x1, u);
    }

    /* How much of a chute is at this point: 1 in the middle of it,
       tapering out at the sides and fading in and out at the ends so
       neither mouth is a wall. */
    chuteAmount(c, x, z) {
      if (z < c.z0 - 30 || z > c.z1 + 30) return 0;
      const u = U.clamp((z - c.z0) / (c.z1 - c.z0), 0, 1);
      const along = U.smoothstep(0, 0.09, u) * (1 - U.smoothstep(0.90, 1, u));
      if (along <= 0) return 0;
      const lat = Math.abs(x - this.chuteX(c, z));
      return along * (1 - U.smoothstep(c.half * 0.72, c.half * 1.25, lat));
    }

    inChute(x, z) {
      for (const c of this.chutes) {
        if (z < c.z0 || z > c.z1) continue;
        if (Math.abs(x - this.chuteX(c, z)) < c.half) return c;
      }
      return null;
    }

    /* ---- ramps ----
       Every kicker, hip, roller and cliff step on the mountain, held in
       one list and turned into terrain by `rampY`. They are bucketed by
       z on seal because `heightAt` runs tens of thousands of times while
       the mesh is built and once per frame per skier after that. */
    addRamp(r) {
      r.c = Math.cos(r.ax || 0);
      r.s = Math.sin(r.ax || 0);
      this.ramps.push(r);
      this._bucket = null;
      return r;
    }

    seal() {
      const B = 120;
      const n = Math.ceil((this.total + 400) / B) + 2;
      const fresh = () => Array.from({ length: n }, () => []);
      const file = (list, into, pad) => {
        for (const r of list) {
          const z0 = r.z - r.len * 1.4 - pad, z1 = r.z + r.len * 1.6 + pad;
          const i0 = U.clamp(Math.floor(z0 / B), 0, n - 1);
          const i1 = U.clamp(Math.floor(z1 / B), 0, n - 1);
          for (let i = i0; i <= i1; i++) into[i].push(r);
        }
      };
      this._bucket = fresh();
      this._padBucket = fresh();
      file(this.ramps, this._bucket, 20);
      file(this.pads, this._padBucket, 12);
      this._B = B;
      return this;
    }

    /* ---- boost pads ----
       A pad is a ramp with the ramp taken away: no lip, no height, no
       terrain of any kind — just a stretch of snow that gives you speed
       for driving down it. They exist because a mountain where every
       accelerator is also a jump is a mountain you cannot go fast on
       without leaving the ground, and going fast is the point. */
    addPad(p) {
      p.c = Math.cos(p.ax || 0);
      p.s = Math.sin(p.ax || 0);
      this.pads.push(p);
      this._padBucket = null;
      return p;
    }

    addSpinner(sp) { this.spinners.push(sp); return sp; }

    _padsNear(z) {
      if (!this._padBucket) this.seal();
      const i = U.clamp(Math.floor(z / this._B), 0, this._padBucket.length - 1);
      return this._padBucket[i];
    }

    /* One ramp's contribution. `u` runs along the ramp and `v` across
       it; the profile is convex so the lip is the steepest part of it,
       which is what makes hitting a kicker fast feel different from
       rolling over it slowly. */
    rampY(r, x, z) {
      const dx = x - r.x, dz = z - r.z;
      const u = (dz * r.c + dx * r.s) / r.len;
      if (u < -0.22 || u > (r.tail ?? 1.18)) return 0;
      const v = (-dz * r.s + dx * r.c) / r.wide;
      const av = Math.abs(v);
      if (av > 1.25) return 0;
      const across = 1 - U.smoothstep(0.60, 1.18, av);
      let h;
      if (r.kind === 'drop') {
        /* A step *down*: flat, then the floor leaves — and then, over
           the back half of its tail, the mountain comes back up to meet
           you. That second half is not decoration. Without it the
           terrain snapped from `-h` straight back to zero at the end of
           the tail, which is a vertical wall across the landing of
           every cliff on the hill: a skier dropped in, could not climb
           out, and the run simply stopped. It is a bench under a
           cliff now, which is also what it looks like from the top. */
        h = -r.h * U.smoothstep(0, 0.22, u)
                 * (1 - U.smoothstep((r.tail ?? 1.18) * 0.55, (r.tail ?? 1.18) * 0.98, u));
      } else if (r.kind === 'roller') {
        // no lip at all — a swell in the snow you can pop off or ignore
        h = r.h * Math.sin(U.clamp(u, 0, 1) * Math.PI);
      } else if (r.kind === 'bank') {
        // a wall on one side, highest at the far edge
        h = r.h * U.smoothstep(0, 0.30, u) * (1 - U.smoothstep(0.72, 1.05, u))
              * U.clamp(v * r.side, 0, 1.15);
        return h;
      } else {
        // kicker and hip: a convex run-up that ends in nothing
        const uu = U.clamp(u, 0, 1);
        h = r.h * Math.pow(uu, 1.55);
        if (u > 1) h = 0;                          // the lip
        if (u < 0) h = r.h * 0;
      }
      return h * across;
    }

    /* The lip slope of a ramp, which is what a launch is made of.
       Analytic rather than sampled: at speed the sample either side of
       the lip lands past the end of the ramp and reads as flat. */
    rampSlope(r) {
      if (r.kind === 'drop') return 0;
      if (r.kind === 'roller') return 0;
      return (r.h * 1.55) / r.len;
    }

    /* ---- boost ----
       How much of a boost ramp is under this point, 0..1 and a bit.
       Only the run-up counts, not the tail: a pad you collect after the
       lip is a pad you cannot aim at, and the whole appeal of these is
       that they are a line you commit to from a hundred metres up.

       Same u/v as `rampY` so the paint, the terrain and the acceleration
       cannot disagree about where the blue bit is. */
    boostAmount(x, z) {
      let m = 0;
      const pads = this._padsNear(z);
      for (let i = 0; i < pads.length; i++) {
        const p = pads[i];
        const dx = x - p.x, dz = z - p.z;
        const u = (dz * p.c + dx * p.s) / p.len;
        if (u < 0 || u > 1) continue;
        const av = Math.abs((-dz * p.s + dx * p.c) / p.wide);
        if (av > 1.02) continue;
        // a hard edge along the pad and a soft one across it: you should
        // be able to feel exactly where you fell off the side of one
        const w = p.boost * (1 - U.smoothstep(0.72, 1.00, av))
                          * U.smoothstep(0, 0.05, u) * (1 - U.smoothstep(0.94, 1.0, u));
        if (w > m) m = w;
      }
      const near = this._rampsNear(z);
      for (let i = 0; i < near.length; i++) {
        const r = near[i];
        if (!r.boost) continue;
        const dx = x - r.x, dz = z - r.z;
        const u = (dz * r.c + dx * r.s) / r.len;
        if (u < -0.10 || u > 1.04) continue;
        const v = (-dz * r.s + dx * r.c) / r.wide;
        const av = Math.abs(v);
        if (av > 1.02) continue;
        // fades in off the bottom and out at the sides, so clipping the
        // corner of one pays a fraction rather than all of it
        const w = r.boost * U.smoothstep(-0.10, 0.14, u)
                          * (1 - U.smoothstep(0.58, 1.00, av));
        if (w > m) m = w;
      }
      return m;
    }

    /* The lip you just left, if you left one. Used at the moment of
       launch to decide how big the jump is allowed to be and whether it
       is worth throwing a trick off. */
    rampUnder(x, z) {
      let best = null, bw = 0;
      const near = this._rampsNear(z);
      for (let i = 0; i < near.length; i++) {
        const r = near[i];
        if (r.kind === 'bank') continue;
        const dx = x - r.x, dz = z - r.z;
        const u = (dz * r.c + dx * r.s) / r.len;
        if (u < 0.10 || u > (r.tail ?? 1.18)) continue;
        const v = (-dz * r.s + dx * r.c) / r.wide;
        const av = Math.abs(v);
        if (av > 1.05) continue;
        const w = (r.h || 1) * (1 - U.smoothstep(0.60, 1.05, av));
        if (w > bw) { bw = w; best = r; }
      }
      return best;
    }

    _rampsNear(z) {
      if (!this._bucket) this.seal();
      const i = U.clamp(Math.floor(z / this._B), 0, this._bucket.length - 1);
      return this._bucket[i];
    }

    /* =============== the whole height, in one place =============== */
    heightAt(x, z) {
      const cx = this.cxAt(z);
      const lat = x - cx;
      const alat = Math.abs(lat);
      const half = this.halfAt(z);

      let y = this.baseY(z);
      const rough = this.roughAt(z);

      // ---- the folds: ridges and gullies running down the face ----
      y += fbm2(x * 0.0018, z * 0.0013, 3, this.sFold) * 13.5 * rough;

      // ---- how groomed is here? the piste is, and so are the chutes ----
      let groom = 1 - U.smoothstep(half * 0.80, half * 1.55, alat);
      for (const c of this.chutes) groom = Math.max(groom, this.chuteAmount(c, x, z));

      /* ---- the fold the run lies in ----
         Without this the fall line is due down-mountain while the piste
         traverses across it, so gravity spends the whole run dragging
         you off the side of the thing you are meant to be skiing. A
         shallow parabola bends the fall line onto the run: gentle in
         the middle where you want to be free to move about, firm at the
         edges where the mountain should feel like it would rather you
         came back.

         It is centred on the *piste*, always — never on whichever route
         happens to be strongest here. Recentring it on a chute was the
         obvious thing to write and it put a five-metre step around the
         rim of every shortcut, because the parabola jumps by the square
         of the offset the moment the chute's influence fades. One of
         those steps, sitting against a berm, closed a basin a skier
         could coast into and never leave. The chutes hold their own
         line with their trough instead, which is deep enough to win and
         is continuous everywhere. */
      y += Math.min(lat * lat * 0.0016, 120);

      // ---- rolls: the short stuff you get air off ----
      const rollAmp = this.sectionAt(z).rolls;
      y += fbm2(x * 0.0080, z * 0.0064, 2, this.sRoll) * 3.2 * rollAmp * rough
           * U.lerp(1, 0.55, groom);

      // ---- moguls, only where nothing has flattened them ----
      const mog = Math.sin(x * 0.19 + fbm2(x * 0.03, z * 0.03, 2, this.sMog) * 4)
                * Math.sin(z * 0.155 + this.sMog);
      y += mog * 1.05 * rough * (1 - groom);

      // ---- deep snow off the sides sits proud of the packed run ----
      y += U.smoothstep(half * 0.9, half * 2.4, alat) * 1.6;

      // ---- the berm along each edge of the piste ----
      const bank = this.bankAt(z);
      y += bank * U.smoothstep(half * 0.62, half * 1.02, alat)
                * (1 - U.smoothstep(half * 1.02, half * 1.85, alat));

      // ---- the chutes: a gully cut through the wood ----
      for (const c of this.chutes) {
        const a = this.chuteAmount(c, x, z);
        if (a <= 0) continue;
        const clat = (x - this.chuteX(c, z)) / c.half;
        // a trough with lips: it holds a line without being a pipe
        y -= a * c.depth * (1 - U.clamp(clat * clat, 0, 1));
        y += a * c.depth * 0.55 * U.smoothstep(0.80, 1.30, Math.abs(clat));
      }


      // ---- everything anybody placed ----
      const near = this._rampsNear(z);
      for (let i = 0; i < near.length; i++) y += this.rampY(near[i], x, z);

      // ---- the valley sides ----
      if (alat > this.wallAt) {
        const t = U.smoothstep(this.wallAt, this.wallAt + 78, alat);
        y += this.wallH * t * t
           + fbm2(x * 0.02, z * 0.014, 3, this.sFold + 41) * 16 * t;
      }
      return y;
    }

    /* Central differences over a two-metre span. Two metres rather than
       ten centimetres on purpose: a ski is two metres long, so this is
       the slope the ski actually sits on rather than the slope of the
       single mogul under its middle. */
    normalAt(x, z, out = {}) {
      const d = 1.0;
      const hx = this.heightAt(x + d, z) - this.heightAt(x - d, z);
      const hz = this.heightAt(x, z + d) - this.heightAt(x, z - d);
      const nx = -hx / (2 * d), nz = -hz / (2 * d);
      const inv = 1 / Math.hypot(nx, nz, 1);
      out.nx = nx * inv; out.ny = inv; out.nz = nz * inv;
      // the fall line, as a gradient: positive means downhill is +z
      out.gz = -hz / (2 * d);
      out.gx = -hx / (2 * d);
      return out;
    }

    /* Where a skier is, in the run's own language. There is no search
       in it — that is the whole reason the face descends along one
       axis — so every consumer can afford to call it every frame. */
    frame(x, z, out = {}) {
      const cx = this.cxAt(z);
      out.s = z;
      out.cx = cx;
      out.lat = x - cx;
      out.half = this.halfAt(z);
      out.onPiste = Math.abs(out.lat) <= out.half;
      out.chute = this.inChute(x, z);
      out.section = this.sectionAt(z);
      out.t = U.clamp(z / this.total, 0, 1);
      return out;
    }
  }

  function makeFace(rng, opts) { return new Face(rng, opts); }

  /* =============== the shortcuts ===============

     A shortcut is not a decoration on the run, it is an argument with
     it: the piste says "round this way", the chute says "straight
     down", and the chute is right whenever the piste has swung far
     enough out that the chord across the bend is shorter than the
     groomed way round.

     So they are not placed, they are *found*. The generator walks the
     traverse looking for bends worth cutting and measures each one —
     `gain` is real metres saved, computed against the piste's own arc
     length, which is why the briefing can promise a number and the
     clock can keep the promise. */

  function findChutes(face, rng, opts = {}) {
    const want = opts.count ?? 5;
    const minGain = opts.minGain ?? 24;
    const z0Min = face.sections[0].z1 + 60;
    const z1Max = face.total - 220;

    // the piste's own length between two heights, walked at four metres
    const pisteLen = (a, b) => {
      let L = 0, px = face.cxAt(a);
      for (let z = a + 4; z <= b; z += 4) {
        const x = face.cxAt(z);
        L += Math.hypot(x - px, 4);
        px = x;
      }
      return L;
    };

    /* Spans are swept rather than picked from a short list. Whether a
       given bend is worth cutting depends on where in the traverse it
       starts as much as on how long it is — a span of half a period
       ends up displaced sideways and its chord is barely shorter than
       the piste — so the only honest way to find the good ones is to
       try a lot of lengths at a lot of places and measure. It is a few
       hundred thousand evaluations of one sine, once, at build time. */
    const SPANS = [];
    for (let sp = 220; sp <= 700; sp += 60) SPANS.push(sp);

    const found = [];
    for (let z = z0Min; z < z1Max; z += 30) {
      for (const span of SPANS) {
        const zb = z + span;
        if (zb > z1Max) continue;
        const xa = face.cxAt(z), xb = face.cxAt(zb);
        const chord = Math.hypot(xb - xa, span);
        const gain = pisteLen(z, zb) - chord;
        if (gain < minGain) continue;
        // how far the chute strays from the groomed run at its widest —
        // that is what makes it a different place rather than a wide line
        let stray = 0;
        for (let u = 0.1; u <= 0.9; u += 0.05) {
          const zz = z + span * u;
          stray = Math.max(stray, Math.abs(U.lerp(xa, xb, u) - face.cxAt(zz)));
        }
        found.push({ z0: z, z1: zb, x0: xa, x1: xb, gain, stray, span,
                     rate: gain / span });
      }
    }

    /* Picked round-robin by length rather than straight off the top of
       the list. Sorting by raw gain and taking the first five hands you
       five copies of the longest span there is, because a longer bend
       always saves more — and a mountain whose every shortcut is a
       seven-hundred-metre commitment has one shortcut on it, offered
       five times. Going round the span sizes in turn gives a run a
       short sharp one, a medium one and a long one. */
    /* How efficient a bend has to be before cutting it is a shortcut
       rather than a long detour that happened to end up in front. It
       relaxes if the mountain this seed drew is simply a straighter one:
       every mountain gets at least a couple of shortcuts, because they
       are half of what a run *is* here and "your seed drew none" is not
       a difficulty, it is a missing feature. */
    let cut = 0.048;
    while (cut > 0.014 && found.filter(f => f.rate >= cut).length < want * 3) cut -= 0.005;
    const kept = found.filter(f => f.rate >= cut);

    // three buckets rather than one list per exact length, so a run
    // gets a short sharp cut, a medium one and a long committing one
    const bucket = (sp) => (sp < 340 ? 0 : sp < 500 ? 1 : 2);
    const lists = [[], [], []];
    for (const f of kept) lists[bucket(f.span)].push(f);
    for (const l of lists) l.sort((a, b) => b.gain - a.gain);

    const out = [];
    const picked = [];
    for (let pass = 0; picked.length < want && pass < 40; pass++) {
      let any = false;
      for (const list of lists) {
        if (picked.length >= want) break;
        while (list.length) {
          const f = list.shift();
          if (picked.some(c => f.z0 < c.z1 + 45 && f.z1 > c.z0 - 45)) continue;
          picked.push(f);
          any = true;
          break;
        }
      }
      if (!any) break;
    }

    picked.sort((a, b) => a.z0 - b.z0);
    for (const f of picked) {
      const hard = U.clamp((f.gain - 30) / 90, 0, 1);
      const c = face.addChute({
        z0: f.z0, z1: f.z1, x0: f.x0, x1: f.x1,
        half: rng.range(15, 23) + hard * 4,
        depth: rng.range(4.2, 7.4),
        gain: f.gain,
        stray: f.stray,
        hard,
        // what it is worth is what it saves, plus a bounty for the nerve
        pay: 1.6 + hard * 1.9,
        name: CHUTE_NAMES[(rng() * CHUTE_NAMES.length) | 0],
        gap: hard > 0.45 && rng() < 0.7,     // ...and does it have a hole in it
        taken: false, entered: false,
      });
      out.push(c);
    }
    // no two of them called the same thing
    const seen = new Set();
    for (const c of out) {
      let n = c.name, i = 2;
      while (seen.has(n)) n = c.name + ' ' + ['II', 'III', 'IV'][i++ - 2];
      c.name = n; seen.add(n);
    }
    return out;
  }

  const CHUTE_NAMES = [
    'Keeper’s Cut', 'The Larder', 'Deadman’s', 'The Poacher',
    'Widow’s Line', 'The Shortcut', 'Corbie Chute', 'The Gralloch',
    'Traitor’s Gate', 'The Bothy Line', 'Cauldron', 'The Snare',
  ];

  /* =============== ramps ===============

     Tons of them, and deliberately so: a mountain with six kickers on
     it is a mountain you learn, and a mountain with ninety is one you
     read. What stops that being noise is that they are not scattered —
     each section asks for its own density and its own kinds, so the
     Cliffs are steps and the Shelf is kickers and the Gully is banks,
     and none of it had to be placed by hand. */

  function buildRamps(face, rng, opts = {}) {
    const spacing = opts.spacing ?? 58;
    const out = [];
    /* `boost` is the one number that turns a lump of snow into a thing
       worth steering at: the run-up accelerates you while you are on it
       and the lip throws you higher for it. It lives on the ramp rather
       than in the skier so the paint, the physics and the ramp are the
       same object, and a card that scales the mountain scales this too. */
    const bScale = opts.boost ?? 1;
    const boost = (lo, hi) => rng.range(lo, hi) * bScale;

    const travel = (z) => Math.atan(face.cxSlopeAt(z));

    for (const sec of face.sections) {
      const density = sec.ramps * (opts.scale ?? 1);
      const n = Math.max(0, Math.round((sec.len / spacing) * density));
      for (let i = 0; i < n; i++) {
        const z = sec.z0 + sec.len * ((i + 0.5) / Math.max(1, n))
                + rng.range(-spacing * 0.28, spacing * 0.28);
        if (z < 40 || z > face.total - 90) continue;
        const half = face.halfAt(z);
        const lat = rng.range(-0.72, 0.72) * half;
        const x = face.cxAt(z) + lat;

        const roll = rng();
        let kind = 'kicker';
        if (sec.drops && roll < 0.34) kind = 'drop';
        else if (roll < 0.52) kind = 'roller';
        else if (roll < 0.74) kind = 'hip';
        if ((sec.id === 'gully' || sec.id === 'bowl') && rng() < 0.30) kind = 'bank';

        const g = face.gradeAt(z);
        if (kind === 'drop') {
          out.push(face.addRamp({
            kind, x, z, ax: travel(z), len: rng.range(10, 16),
            wide: rng.range(26, 48), h: rng.range(3.4, 8.5) * (0.7 + g), tail: 3.2,
          }));
        } else if (kind === 'roller') {
          /* A roller is the one you do not have to jump, so it is the
             one that most wants a pad on it: it pays a player who is
             skiing a fast line rather than a player who is stopping to
             set up a trick. */
          out.push(face.addRamp({
            kind, x, z, ax: travel(z), len: rng.range(26, 44),
            wide: rng.range(24, 46), h: rng.range(1.6, 3.4),
            boost: boost(0.42, 0.78),
          }));
        } else if (kind === 'bank') {
          out.push(face.addRamp({
            kind, x, z, ax: travel(z), len: rng.range(60, 110),
            wide: half * 1.25, h: rng.range(3.5, 6), side: lat >= 0 ? 1 : -1,
          }));
        } else {
          const big = rng() < 0.34;
          out.push(face.addRamp({
            kind, x, z,
            ax: travel(z) + (kind === 'hip' ? rng.range(0.26, 0.46) * (rng() < 0.5 ? -1 : 1) : 0),
            len: big ? rng.range(26, 38) : rng.range(15, 26),
            wide: rng.range(20, 34),
            h: (big ? rng.range(3.6, 6.2) : rng.range(1.9, 3.6)) * (0.8 + g * 0.9),
            big,
            boost: big ? boost(0.90, 1.35) : boost(0.50, 0.85),
          }));
        }
      }
    }

    /* The chutes get their own, denser and meaner, because a shortcut
       that is only shorter is a shortcut nobody would ever film. */
    for (const c of face.chutes) {
      const n = Math.round((c.z1 - c.z0) / 78);
      for (let i = 0; i < n; i++) {
        const u = (i + 0.6) / (n + 0.4);
        const z = U.lerp(c.z0, c.z1, u);
        const x = face.chuteX(c, z) + rng.range(-0.45, 0.45) * c.half;
        const kind = rng() < 0.32 ? 'drop' : (rng() < 0.3 ? 'roller' : 'kicker');
        out.push(face.addRamp({
          kind, x, z, ax: travel(z),
          len: kind === 'drop' ? rng.range(9, 14) : rng.range(18, 30),
          wide: c.half * rng.range(1.5, 2.2),
          h: kind === 'drop' ? rng.range(4.5, 9.5) : rng.range(2.6, 5.4),
          tail: kind === 'drop' ? 3.0 : 1.18,
          chute: c,
          boost: kind === 'drop' ? 0 : boost(1.10, 1.60),
        }));
      }
      /* The mouth: a cornice you drop off to get in at all. A shortcut
         you can dribble into is one you take by accident. */
      out.push(face.addRamp({
        kind: 'drop', x: c.x0, z: c.z0 + 26, ax: travel(c.z0),
        len: 12, wide: c.half * 2.4, h: 3.2 + c.hard * 5.5, tail: 3.0, chute: c, mouth: true,
      }));
      /* And, on the hard ones, a hole. It is always preceded by the
         kicker that clears it, so the line exists — it is just a line
         you have to have committed to a hundred metres earlier. */
      if (c.gap) {
        const zg = U.lerp(c.z0, c.z1, 0.62);
        out.push(face.addRamp({
          kind: 'kicker', x: face.chuteX(c, zg - 34), z: zg - 34, ax: travel(zg),
          len: 24, wide: c.half * 2.0, h: 4.6, chute: c, gapKicker: true,
          // the one ramp on the mountain you are not allowed to arrive
          // at slowly, so it is also the biggest pad on it
          boost: 1.9 * bScale,
        }));
        out.push(face.addRamp({
          kind: 'drop', x: face.chuteX(c, zg), z: zg, ax: travel(zg),
          len: 10, wide: c.half * 2.4, h: 13, tail: 2.2, chute: c, gap: true,
        }));
        // the far bank of it, which is the thing you are aiming at
        out.push(face.addRamp({
          kind: 'roller', x: face.chuteX(c, zg + 30), z: zg + 30, ax: travel(zg),
          len: 30, wide: c.half * 2.2, h: 12.4, chute: c, gapLand: true,
        }));
      }
    }
    face.seal();
    return out;
  }

  /* =============== the park ===============

     Two things the mountain grows that are not the mountain: pads
     that give you speed for nothing but a line, and spinners that give
     you a trick for a line you had to plan. They are separate lists
     rather than two more `kind`s of ramp because neither touches the
     snow: `heightAt` is the hottest function in the mission and adding
     four hundred more objects to it to move the ground by zero metres
     would have been the most expensive way possible of doing nothing.

     Density is the whole design here. One boost pad on a mountain is a
     secret; four hundred of them is a surface you *read*, and reading
     the surface at fifty metres a second is the thing this mission is
     actually about. */

  function buildPads(face, rng, opts = {}) {
    const spacing = opts.spacing ?? 34;
    const scale = opts.boost ?? 1;
    if (scale <= 0 || spacing <= 0) return [];
    const out = [];
    const travel = (z) => Math.atan(face.cxSlopeAt(z));

    for (const sec of face.sections) {
      const n = Math.max(0, Math.round(sec.len / spacing));
      for (let i = 0; i < n; i++) {
        const z = sec.z0 + sec.len * ((i + 0.5) / Math.max(1, n))
                + rng.range(-spacing * 0.4, spacing * 0.4);
        if (z < 30 || z > face.total - 40) continue;
        const half = face.halfAt(z);
        /* Pads come in twos and threes across the run, not one down the
           middle. A single pad on the fall line is a pad you cannot
           miss and therefore never chose; two either side of it is a
           decision about which half of the piste you are skiing. */
        const lanes = 1 + (rng() < 0.55 ? 1 : 0) + (rng() < 0.28 ? 1 : 0);
        const spread = rng.range(0.20, 0.78);
        for (let k = 0; k < lanes; k++) {
          const lat = (lanes === 1 ? rng.range(-0.55, 0.55)
                                   : U.lerp(-spread, spread, k / (lanes - 1))) * half;
          out.push(face.addPad({
            x: face.cxAt(z) + lat, z, ax: travel(z),
            len: rng.range(22, 46),
            wide: rng.range(3.6, 6.4),
            boost: rng.range(0.55, 1.15) * scale,
          }));
        }
      }
    }

    // and a dense strip of them down every shortcut, because the whole
    // proposition of a chute is that it is the fast way
    for (const c of face.chutes) {
      const n = Math.round((c.z1 - c.z0) / 40);
      for (let i = 0; i < n; i++) {
        const z = U.lerp(c.z0, c.z1, (i + 0.5) / Math.max(1, n));
        out.push(face.addPad({
          x: face.chuteX(c, z) + rng.range(-0.3, 0.3) * c.half, z, ax: travel(z),
          len: rng.range(26, 44), wide: c.half * rng.range(0.35, 0.6),
          boost: rng.range(1.10, 1.70) * scale, chute: c,
        }));
      }
    }
    face.seal();
    return out;
  }

  function buildSpinners(face, rng, opts = {}) {
    const spacing = opts.spacing ?? 240;
    const scale = opts.scale ?? 1;
    if (scale <= 0 || spacing <= 0) return [];
    const out = [];
    for (const sec of face.sections) {
      const n = Math.max(0, Math.round((sec.len / spacing) * scale));
      for (let i = 0; i < n; i++) {
        const z = sec.z0 + sec.len * ((i + 0.5) / Math.max(1, n))
                + rng.range(-spacing * 0.25, spacing * 0.25);
        if (z < 120 || z > face.total - 140) continue;
        const half = face.halfAt(z);
        const x = face.cxAt(z) + rng.range(-0.45, 0.45) * half;
        const r = rng.range(5.2, 8.0);
        out.push(face.addSpinner({
          x, z, r,
          /* High enough that you have to be flying and the bottom of
             the ring is clear of the snow, low enough that any real
             kicker gets you there. */
          y: face.heightAt(x, z) + r * 0.80 + rng.range(2.6, 5.2),
          spin: rng.range(0.9, 2.2) * (rng() < 0.5 ? -1 : 1),
          phase: rng() * U.TAU,
          taken: false,
        }));
      }
    }
    return out;
  }

  /* =============== the park, as things you can see ===============
     One instanced ring for the spinners: hundreds of separate meshes
     would be hundreds of draw calls. */

  function buildSpinnerMeshes(face) {
    const group = new THREE.Group();
    group.name = 'spinners';
    if (!face.spinners.length) return group;
    const mat = new THREE.MeshLambertMaterial({
      color: '#ffb020', emissive: '#ff7a00', emissiveIntensity: 0.85, flatShading: true,
    });
    const vane = new THREE.MeshLambertMaterial({
      color: '#39e6ff', emissive: '#1fa6cc', emissiveIntensity: 0.7,
      flatShading: true, transparent: true, opacity: 0.75,
    });
    for (const sp of face.spinners) {
      const g = new THREE.Group();
      g.position.set(sp.x, sp.y, sp.z);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(sp.r, 0.42, 6, 22), mat);
      g.add(ring);
      // four blades, which is what makes the rotation legible at all:
      // a plain torus spinning about its own axis looks like a still one
      for (let i = 0; i < 4; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(sp.r * 1.5, 0.5, 0.16), vane);
        b.rotation.z = i * Math.PI / 4;
        g.add(b);
      }
      g.userData.spin = sp.spin;
      g.userData.sp = sp;
      sp.obj = g;
      group.add(g);
    }
    group.userData.mats = [mat, vane];
    return group;
  }

  // turned by the mission, once a frame, in one place
  function updateSpinners(group, dt) {
    if (!group) return;
    for (const g of group.children) {
      g.rotation.z += (g.userData.spin || 1) * dt;
      const sp = g.userData.sp;
      if (sp && sp.taken) g.scale.setScalar(U.damp(g.scale.x, 0.001, 6, dt));
    }
  }

  /* =============== the mesh ===============

     A ribbon, sampled in the run's own coordinates rather than the
     world's: the columns are fractions of the piste's half-width, so a
     twenty-metre gully gets four-metre triangles and an eighty-metre
     bowl gets eleven-metre ones, and neither of them wastes a vertex.
     A world-space grid fine enough for the gully would have been four
     times this mesh, most of it in trees nobody skis. */

  const FRACS = [0, 0.16, 0.32, 0.48, 0.64, 0.80, 1.0, 1.22, 1.5];
  const OUTER = [0.10, 0.24, 0.42, 0.62, 0.82, 1.0];

  function latColumns(half, edge) {
    const out = [0];
    const rim = half * 1.5;
    for (let i = 1; i < FRACS.length; i++) out.push(FRACS[i] * half, -FRACS[i] * half);
    for (const f of OUTER) {
      const l = rim + f * Math.max(20, edge - rim);
      out.push(l, -l);
    }
    return out.sort((a, b) => a - b);
  }

  function buildTerrain(face, rng, opts = {}) {
    const step = opts.step ?? 6.5;
    const z0 = opts.z0 ?? -70;
    const z1 = opts.z1 ?? face.total + 140;
    const rows = Math.ceil((z1 - z0) / step);
    const edge = face.edge;

    const pos = [], col = [];
    const c = new THREE.Color();
    const cB = new THREE.Color();       // scratch: this runs per triangle
    const sPaint = face.sPaint;

    /* The paint. Snow is the hardest thing in the game to colour: it is
       white, so every cue has to come from somewhere other than hue.
       Three do the work — the slope (rock comes through where snow
       cannot sit), the aspect (a face turned from the sun is blue, not
       grey), and the corduroy, which is the one that tells a player at
       a glance where the run is. */
    const paint = (x, z, y, slope, lat, half, groom, chute, boost) => {
      const a = Math.abs(lat);
      c.copy(COL.snow);
      // hollows hold blue shade, ridges catch the light
      const shade = U.clamp(fbm2(x * 0.012, z * 0.009, 3, sPaint) * 0.6 + 0.45, 0, 1);
      c.lerp(COL.shade, shade * 0.42).lerp(COL.snowLit, (1 - shade) * 0.30);
      // wind crust and old snow off the sides of the run
      c.lerp(COL.snowDeep, U.smoothstep(half * 1.1, half * 2.6, a) * 0.35);
      // anything this steep is not holding snow, it is rock
      c.lerp(COL.rock, U.smoothstep(0.78, 1.35, slope));
      c.lerp(COL.rockDark, U.smoothstep(1.30, 2.10, slope));
      // the groomed run, and the corduroy on it
      if (groom > 0.02) {
        const cord = 0.5 + 0.5 * Math.sin(lat * 0.62);
        c.lerp(COL.piste, groom * 0.55);
        c.offsetHSL(0, 0, (cord - 0.5) * 0.035 * groom);
        // ice where it has been scraped: the inside of every bend
        const ice = U.smoothstep(0.55, 0.95, a / Math.max(half, 1)) * groom;
        c.lerp(COL.ice, ice * 0.30);
      }
      if (chute > 0.02) c.lerp(COL.chute, chute * 0.35);
      /* The boost ramps. Barred rather than flat — a solid blue wedge
         reads as a hole in the mountain, and the bars give the eye
         something to measure the run-up against on the way in. The
         biggest ones go amber, because a pad worth two of the others
         should not look like the others. */
      if (boost > 0.02 && !face.authoredTextures) {
        const bar = 0.55 + 0.45 * Math.sin(z * 0.22 + x * 0.045);
        const hot = U.clamp((boost - 0.85) / 0.75, 0, 1);
        cB.copy(COL.boost).lerp(COL.boostHot, hot);
        c.lerp(cB, U.clamp(boost, 0, 1) * (0.34 + bar * 0.40));
      }
      // and a fine patchiness, so a seven-metre triangle is not a seven-metre triangle
      const patch = fbm2(x * 0.11, z * 0.09, 2, sPaint + 17);
      c.offsetHSL(patch * 0.004, patch * 0.03, patch * 0.030);
      /* Snow faces straight up into a sun rig built for a sea. Left at
         face value every one of these clips to white and the whole
         mountain becomes a silhouette of itself. */
      return c.multiplyScalar(0.52);
    };

    // one row of samples, in world space, carrying what the paint needs
    const rowAt = (z) => {
      const cx = face.cxAt(z), half = face.halfAt(z);
      const lats = latColumns(half, edge);
      return lats.map(lat => {
        const x = cx + lat;
        let groom = 1 - U.smoothstep(half * 0.80, half * 1.55, Math.abs(lat));
        let chute = 0;
        for (const ch of face.chutes) chute = Math.max(chute, face.chuteAmount(ch, x, z));
        groom = Math.max(groom, chute);
        return { x, z, y: face.heightAt(x, z), lat, half, groom, chute,
                 boost: face.boostAmount(x, z) };
      });
    };

    let prev = rowAt(z0);
    const tri = (a, b, d) => {
      const e1x = b.x - a.x, e1y = b.y - a.y, e1z = b.z - a.z;
      const e2x = d.x - a.x, e2y = d.y - a.y, e2z = d.z - a.z;
      const nx = e1y * e2z - e1z * e2y;
      const ny = e1z * e2x - e1x * e2z;
      const nz = e1x * e2y - e1y * e2x;
      const len = Math.hypot(nx, ny, nz) || 1;
      const slope = Math.hypot(nx, nz) / len / Math.max(Math.abs(ny) / len, 0.08);
      const m = { x: (a.x + b.x + d.x) / 3, y: (a.y + b.y + d.y) / 3, z: (a.z + b.z + d.z) / 3 };
      const cl = paint(m.x, m.z, m.y, slope,
                       (a.lat + b.lat + d.lat) / 3, a.half,
                       (a.groom + b.groom + d.groom) / 3,
                       (a.chute + b.chute + d.chute) / 3,
                       (a.boost + b.boost + d.boost) / 3);
      for (const p of [a, b, d]) {
        pos.push(p.x, p.y, p.z);
        col.push(cl.r, cl.g, cl.b);
      }
    };

    for (let i = 1; i <= rows; i++) {
      const z = z0 + i * step;
      const cur = rowAt(z);
      const n = Math.min(prev.length, cur.length);
      for (let k = 0; k < n - 1; k++) {
        // wound so the normals point at the sky: the other way round the
        // whole mountain is face-culled and you ski through the floor
        tri(prev[k], cur[k], cur[k + 1]);
        tri(prev[k], cur[k + 1], prev[k + 1]);
      }
      prev = cur;
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({
      vertexColors: true, flatShading: true,
    }));
    mesh.name = 'mountain';
    mesh.frustumCulled = false;
    return mesh;
  }

  /* =============== the wood ===============

     Alpine pines rather than the wood's: narrower, darker, and with
     snow on them, because a tree with a white top reads as an obstacle
     at two hundred metres and a green one reads as scenery. */

  function pineGeometry(rng) {
    const parts = [];
    const trunk = new THREE.CylinderGeometry(0.22, 0.42, 4.2, 5);
    trunk.translate(0, 2.1, 0);
    parts.push(ForestKit.paintGeo(trunk.toNonIndexed(), COL.bark));
    const tiers = [[2.7, 6.0, 4.4], [2.15, 5.4, 7.6], [1.6, 4.6, 10.4], [0.9, 3.0, 12.9]];
    tiers.forEach(([rad, h, y], i) => {
      const cone = new THREE.ConeGeometry(rad, h, 10, 2);
      cone.translate(0, y, 0);
      // the top two tiers carry the snow
      const col = i >= 2 ? COL.pineSnow.clone().lerp(COL.pine, 0.35)
                         : COL.pine.clone().lerp(COL.pineDeep, 0.4);
      parts.push(ForestKit.paintGeo(cone.toNonIndexed(), col));
    });
    // a cap of settled snow on the crown
    const cap = new THREE.ConeGeometry(1.0, 1.9, 7, 1);
    cap.translate(0, 13.4, 0);
    parts.push(ForestKit.paintGeo(cap.toNonIndexed(), COL.pineSnow));
    for (const p of parts) p.computeVertexNormals();
    return Sky.mergeGeometries(parts);
  }

  /* Where the trees are is where the run is not, which is why this
     takes the piste and the chutes rather than a radius. Three bands:
     the odd one standing in the run to be threaded, a thick edge that
     tells you where the run stops, and a wall of wood behind it holding
     the horizon up. */
  function buildTrees(face, rng, opts = {}) {
    const uniforms = opts.uniforms || { time: { value: 0 }, wind: { value: new THREE.Vector3(0.2, 0, 0.4) } };
    const spots = [];
    const cell = 10;
    const taken = new Map();
    const free = (x, z, minD) => {
      const i0 = Math.floor((x - minD) / cell), i1 = Math.floor((x + minD) / cell);
      const j0 = Math.floor((z - minD) / cell), j1 = Math.floor((z + minD) / cell);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const list = taken.get(i + ',' + j);
        if (!list) continue;
        for (const p of list) if ((p.x - x) ** 2 + (p.z - z) ** 2 < minD * minD) return false;
      }
      return true;
    };
    const mark = (x, z) => {
      const k = Math.floor(x / cell) + ',' + Math.floor(z / cell);
      if (!taken.has(k)) taken.set(k, []);
      taken.get(k).push({ x, z });
    };

    // nothing grows in a chute, on a takeoff or on a pad
    const clearOf = (x, z) => {
      if (face.clearLine && face.clearLine(x, z)) return false;
      for (const c of face.chutes) if (face.chuteAmount(c, x, z) > 0.16) return false;
      for (const r of face._rampsNear(z)) {
        if (r.kind === 'bank') continue;
        const dx = x - r.x, dz = z - r.z;
        const u = (dz * r.c + dx * r.s) / r.len;
        const v = (-dz * r.s + dx * r.c) / r.wide;
        if (u > -0.7 && u < 2.6 && Math.abs(v) < 1.7) return false;
      }
      if (face.boostAmount(x, z) > 0.01) return false;
      return true;
    };

    /* `scale` is the dial two of the twists pull on, and it only moves
       the wood that is in your way: doubling the trees you have to
       thread is a card, and doubling the ones holding up the horizon is
       a frame-rate bug. */
    const scale = opts.scale ?? 1;
    const bands = [
      // in the run itself — thin, and the whole reason the Glades exist
      { lo: 0.10, hi: 0.94, per: 260, minD: 15, s: [0.85, 1.25], dens: scale },
      // the edge: this is what a player actually steers by
      { lo: 0.98, hi: 2.30, per: 46, minD: 8.5, s: [0.9, 1.5], dens: Math.min(scale, 1.3) },
      // and the wall of wood behind it
      { lo: 2.30, hi: 6.50, per: 34, minD: 10.5, s: [1.0, 1.8], dens: 1 },
    ];

    const zEnd = face.total + 60;
    for (const b of bands) {
      for (let z = -40; z < zEnd; z += 12) {
        const sec = face.sectionAt(z);
        const half = face.halfAt(z);
        const density = (sec.def.region ? sec.trees : b.lo < 0.95 ? sec.trees : 1) * b.dens;
        const tries = Math.max(0, Math.round((12 / b.per) * 120 * density));
        for (let i = 0; i < tries; i++) {
          const side = rng() < 0.5 ? -1 : 1;
          const lat = side * U.lerp(b.lo, b.hi, Math.sqrt(rng())) * half;
          if (Math.abs(lat) > face.edge - 12) continue;
          const x = face.cxAt(z) + lat;
          const zz = z + rng.range(0, 12);
          if (!free(x, zz, b.minD / Math.max(1, Math.sqrt(b.dens)))) continue;
          if (!clearOf(x, zz)) continue;
          const y = face.heightAt(x, zz);
          mark(x, zz);
          spots.push({ x, z: zz, y, lat, half,
                       s: rng.range(b.s[0], b.s[1]), rot: rng() * U.TAU });
        }
      }
    }

    const geo = pineGeometry(rng);
    const mat = ForestKit.windMaterial(uniforms, 3.0, 13.0, 0.55);
    const tint = new THREE.Color();
    const mesh = ForestKit.instance(geo, mat, spots, rng, (c, sp, r) => {
      tint.copy(COL.snowLit).lerp(COL.pine, 0.55 + r() * 0.35);
      c.copy(tint).offsetHSL(r.range(-0.02, 0.02), r.range(-0.05, 0.05), r.range(-0.05, 0.05));
    });

    /* Only the ones you could actually hit are colliders. A hundred and
       forty thousand trunks tested every frame is a slideshow; the four
       hundred within reach of the run is a list you can walk. */
    const colliders = spots
      .filter(sp => Math.abs(sp.lat) < sp.half * 2.9)
      .map(sp => ({ x: sp.x, z: sp.z, r: 0.72 * sp.s, kind: 'tree' }));

    return { mesh, geo, mat, spots, colliders };
  }

  /* Rock, where the mountain is too steep to hold snow. Half-buried, so
     a two-metre boulder is a one-metre obstacle and looks like it grew
     there rather than landed. */
  function buildRocks(face, rng, opts = {}) {
    const count = opts.count ?? 90;
    const geos = [];
    const colliders = [];
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const z = rng.range(60, face.total - 60);
      const half = face.halfAt(z);
      const side = rng() < 0.5 ? -1 : 1;
      const lat = side * U.lerp(0.55, 3.0, Math.sqrt(rng())) * half;
      if (Math.abs(lat) > face.edge - 20) continue;
      const x = face.cxAt(z) + lat;
      let skip = false;
      for (const ch of face.chutes) if (face.chuteAmount(ch, x, z) > 0.3) skip = true;
      if (skip) continue;
      const r = rng.range(1.3, 4.2);
      if (face.clearLine && face.clearLine(x, z, r)) continue;
      const g = new THREE.IcosahedronGeometry(r, 1);
      g.scale(rng.range(0.8, 1.4), rng.range(0.5, 0.9), rng.range(0.8, 1.4));
      g.rotateY(rng() * U.TAU);
      g.rotateX(rng.range(-0.3, 0.3));
      g.translate(x, face.heightAt(x, z) - r * 0.34, z);
      c.copy(COL.rock).lerp(COL.rockWarm, rng() * 0.4)
        .lerp(COL.snowLit, rng() * 0.30).multiplyScalar(0.55);
      geos.push(ForestKit.paintGeo(g.index ? g.toNonIndexed() : g, c));
      colliders.push({ x, z, r: r * 0.85, kind: 'rock' });
    }
    if (!geos.length) return { mesh: new THREE.Group(), colliders };
    const merged = Sky.mergeGeometries(geos);
    merged.computeVertexNormals();
    const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({
      vertexColors: true, flatShading: true,
    }));
    mesh.frustumCulled = false;
    return { mesh, colliders };
  }

  /* The poles. Cheap, and the single most useful object on the
     mountain: at speed you are not reading the snow, you are reading
     the two lines of sticks that tell you where it turns. */
  function buildMarkers(face, opts = {}) {
    const spacing = opts.spacing ?? 34;
    const group = new THREE.Group();
    const geo = new THREE.CylinderGeometry(0.10, 0.13, 3.2, 5);
    geo.translate(0, 1.6, 0);
    const matA = new THREE.MeshLambertMaterial({ color: '#ff8a3d', flatShading: true,
      emissive: '#ff6a1a', emissiveIntensity: 0.35 });
    const matB = new THREE.MeshLambertMaterial({ color: '#39a7ff', flatShading: true,
      emissive: '#1d6fd0', emissiveIntensity: 0.35 });
    const n = Math.floor(face.total / spacing);
    const meshA = new THREE.InstancedMesh(geo, matA, n + 2);
    const meshB = new THREE.InstancedMesh(geo, matB, n + 2);
    const d = new THREE.Object3D();
    let a = 0, b = 0;
    for (let i = 0; i <= n; i++) {
      const z = i * spacing;
      const half = face.halfAt(z), cx = face.cxAt(z);
      for (const side of [-1, 1]) {
        const x = cx + side * half;
        d.position.set(x, face.heightAt(x, z) - 0.2, z);
        d.rotation.set(0, 0, 0);
        d.scale.setScalar(1);
        d.updateMatrix();
        if (side < 0) meshA.setMatrixAt(a++, d.matrix);
        else meshB.setMatrixAt(b++, d.matrix);
      }
    }
    meshA.count = a; meshB.count = b;
    meshA.instanceMatrix.needsUpdate = true;
    meshB.instanceMatrix.needsUpdate = true;
    meshA.frustumCulled = false; meshB.frustumCulled = false;
    group.add(meshA, meshB);
    return { group, geo, mats: [matA, matB] };
  }

  /* The mouth of a shortcut, lit, and visible from a long way up the
     run. It is the only thing on this mountain whose whole job is to be
     a decision: everything else is snow, and this is a question. */
  function buildChuteGate(face, c, colour = '#ffd166') {
    const group = new THREE.Group();
    const half = c.half;
    const y = face.heightAt(c.x0, c.z0);
    const mat = new THREE.MeshLambertMaterial({
      color: colour, emissive: colour, emissiveIntensity: 1.5, flatShading: true,
    });
    const post = new THREE.CylinderGeometry(0.42, 0.52, 8.5, 6);
    post.translate(0, 4.25, 0);
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(post, mat);
      p.position.set(c.x0 + side * (half + 2.5), face.heightAt(c.x0 + side * (half + 2.5), c.z0), c.z0);
      group.add(p);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry((half + 3) * 2, 1.5, 0.7), mat);
    bar.position.set(c.x0, y + 8.0, c.z0);
    group.add(bar);
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry((half + 3) * 2, 9),
      new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.10,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    glow.position.set(c.x0, y + 4.4, c.z0);
    group.add(glow);
    group.userData = { post, mat, bar: bar.geometry, glow: glow.geometry, glowMat: glow.material };
    return group;
  }

  /* Falling snow, as a box that follows the camera. Cheap, and it is
     half of what "whiteout" means — the other half is the fog. */
  function buildSnowfall(scene, count = 900, opts = {}) {
    if (count <= 0) return null;
    const box = opts.box ?? 130;
    const pos = new Float32Array(count * 3);
    const spd = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * box * 2;
      pos[i * 3 + 1] = Math.random() * box;
      pos[i * 3 + 2] = (Math.random() - 0.5) * box * 2;
      spd[i] = 2.2 + Math.random() * 3.4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const mat = new THREE.PointsMaterial({
      color: '#ffffff', size: opts.size ?? 0.55, transparent: true,
      opacity: opts.opacity ?? 0.75, depthWrite: false, sizeAttenuation: true,
    });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    scene.add(pts);
    let t = 0;
    return {
      points: pts,
      update(dt, cam, wind) {
        t += dt;
        const wx = (wind && wind.x) || 0, wz = (wind && wind.z) || 0;
        for (let i = 0; i < count; i++) {
          const i3 = i * 3;
          pos[i3] += (wx * 3 + Math.sin(t * 0.7 + i) * 0.5) * dt;
          pos[i3 + 1] -= spd[i] * dt;
          pos[i3 + 2] += wz * 3 * dt;
          // wrap around the camera rather than respawning: a flake that
          // pops into existence in front of you is the one thing the
          // eye is guaranteed to catch
          const dx = pos[i3] - cam.x, dy = pos[i3 + 1] - cam.y, dz = pos[i3 + 2] - cam.z;
          if (dy < -box * 0.35) pos[i3 + 1] += box;
          else if (dy > box * 0.75) pos[i3 + 1] -= box;
          if (dx > box) pos[i3] -= box * 2; else if (dx < -box) pos[i3] += box * 2;
          if (dz > box) pos[i3 + 2] -= box * 2; else if (dz < -box) pos[i3 + 2] += box * 2;
        }
        g.attributes.position.needsUpdate = true;
      },
      dispose() { Engine.disposeObject(pts); },
    };
  }

  return { COL, SECTIONS, Face, makeFace, findChutes, buildRamps, buildTerrain,
           buildPads, buildSpinners, buildSpinnerMeshes,
           updateSpinners,
           buildTrees, buildRocks, buildMarkers, buildChuteGate, buildSnowfall,
           pineGeometry, CHUTE_NAMES, byId };
})();


/* ------------------------------------------------------------------
   SkiConditions — the weather dial for a mountain.

   Time of day is borrowed wholesale from `Conditions.TIMES`, exactly as
   the wood borrows it: a sky preset and a light rig are not nautical
   and they are not alpine either, and two copies of "what does dusk
   look like" would have drifted apart inside a week.

   The second dial is the one neither the sea nor the wood has, and it
   is the most important number in the mission: what the snow is. It is
   not a filter. `grip` is how much lateral force an edge holds before
   it lets go, and `glide` is how little the snow takes back — so ice
   really is fast and really will not hold a turn, and powder really
   does forgive a landing and really will not let you accelerate. The
   same run on ice and on powder is two different runs.
------------------------------------------------------------------ */
const SkiConditions = (() => {

  const SNOW = [
    { id: 'packed', name: 'Packed powder', weight: 3, payout: 1.00,
      grip: 1.00, glide: 1.00, spray: 1.00, landing: 1.00,
      blurb: 'Groomed and grippy. Whatever happens is your fault.' },
    { id: 'powder', name: 'Fresh powder', weight: 2, payout: 1.12,
      grip: 1.26, glide: 0.82, spray: 1.85, landing: 1.45,
      blurb: 'Deep and soft. It holds any turn you ask for and it eats your speed.' },
    { id: 'spring', name: 'Spring snow', weight: 2, payout: 1.05,
      grip: 1.08, glide: 0.93, spray: 1.30, landing: 1.15,
      blurb: 'Heavy and forgiving. Slow off the top, quick once it steepens.' },
    { id: 'hard', name: 'Hardpack', weight: 2, payout: 1.16,
      grip: 0.84, glide: 1.12, spray: 0.70, landing: 0.85,
      blurb: 'Fast, and it lets go a fraction before you expect it to.' },
    { id: 'ice', name: 'Boilerplate ice', weight: 1, payout: 1.38,
      grip: 0.58, glide: 1.24, spray: 0.35, landing: 0.62,
      blurb: 'You do not turn on this, you negotiate with it. Nothing lands soft.' },
    { id: 'crust', name: 'Breakable crust', weight: 1, payout: 1.30,
      grip: 0.92, glide: 0.88, spray: 1.55, landing: 0.90,
      blurb: 'A skin over deep snow. It holds until it does not.' },
  ];

  const byId = (id) => SNOW.find(s => s.id === id) || null;

  function weightedPick(list, rng) {
    let total = 0;
    for (const x of list) total += x.weight;
    let r = rng() * total;
    for (const x of list) { r -= x.weight; if (r <= 0) return x; }
    return list[list.length - 1];
  }

  function forSeed(seed) {
    const rng = U.makeRng((seed ^ 0x1b873593) >>> 0);
    return {
      time: weightedPick(Conditions.TIMES, rng).id,
      snow: weightedPick(SNOW, rng).id,
      windDir: rng() * U.TAU,
    };
  }

  function resolve(cond) {
    const c = cond || {};
    return {
      time: Conditions.TIMES.find(t => t.id === c.time) || Conditions.TIMES[0],
      snow: byId(c.snow) || SNOW[0],
      windDir: c.windDir || 0,
      flakes: c.flakes ?? 0,
    };
  }

  /* What the rest of the range looks like from up here. Every sky
     preset in the game paints its distant peaks green below the
     snowline, because every mission that has used one so far has been
     at sea level looking up at them. From nine hundred metres you are
     level with those peaks and above that snowline, so the greens are
     simply wrong — and it is the single most visible thing in the
     frame, because a ski run is mostly horizon.

     Overriding it here rather than adding a sixth sky to
     `Conditions.TIMES` keeps one description of what dusk is: this
     changes what the mountains are wearing, not what hour it is. */
  const ALPINE = {
    peakRock: '#7b8aa6', peakGrass: '#eaf6ff', peakHaze: 0.46,
    nearRock: '#6c7a94', nearGrass: '#dcecfb', nearHaze: 0.26,
  };
  const NIGHT_ALPINE = {
    peakRock: '#39456a', peakGrass: '#9fb8dd', peakHaze: 0.48,
    nearRock: '#313c5c', nearGrass: '#8aa4cc', nearHaze: 0.28,
  };

  // must run before Sky.build(), like both of its cousins
  function apply(cond) {
    const r = resolve(cond);
    const alpine = r.time.id === 'night' ? NIGHT_ALPINE : ALPINE;
    Sky.setPreset(Object.assign({}, r.time.sky, alpine));
    return r;
  }

  const lights = (cond) => Conditions.lights({ time: resolve(cond).time.id });
  const describe = (cond) => {
    const r = resolve(cond);
    return r.snow.name + ' · ' + r.time.name;
  };
  const payout = (cond) => {
    const r = resolve(cond);
    return r.snow.payout * r.time.payout;
  };
  const windVector = (cond) => {
    const r = resolve(cond);
    return { x: Math.cos(r.windDir) * 0.5, z: Math.sin(r.windDir) * 0.5, strength: 0.5 };
  };

  return { SNOW, ALPINE, forSeed, resolve, apply, lights, describe, payout, windVector, byId };
})();

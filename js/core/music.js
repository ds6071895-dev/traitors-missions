/* ------------------------------------------------------------------
   music.js — a procedural score, written at runtime.

   There are no audio files anywhere in this game, so a score has to be
   *played* rather than loaded. This is the conductor: a clock that
   wakes every forty milliseconds, looks a third of a second into the
   future, and books every note that falls inside that window against
   the Web Audio clock. Scheduling ahead is the whole trick — notes
   fired from requestAnimationFrame arrive whenever the frame arrives,
   which is audibly not a beat.

   What it plays lives next door:

     music/mix.js          the room, the desk, the seating
     music/instruments.js  the orchestra, one function per player
     music/build.js        the crescendo before an answer
     music/mood.js         what the castle's music is allowed to know
     music/themes.js       the tunes and the chords under them
     music/stingers.js     the hits
     music/cues.js         every cue's sections: how the band plays it

   A cue is a set of named **sections**. `section('ballot')` switches
   arrangement on the next bar line (or beat, or now), and everything
   the game already said — `setGear(i)`, `setIntensity`, `stinger`,
   `duck`, `setMuffle`, `beat()` — still means what it meant: a gear is
   just a section chosen by number.
------------------------------------------------------------------ */
const Music = (() => {

  const ROOT = 36.708;        // D1 — everything is a ratio off this
  const LOOKAHEAD = 0.34;     // seconds of future booked at a time
  const TICK = 40;            // ms between wakeups
  const EPS = 0.0001;
  const SILENCE_MAX = 9;      // seconds a dramatic silence may hold before the band comes back on its own
  const TALK_DUCK = 0.28;     // the most the band may sit at while somebody talks
  /* Live oscillators before optional notes are skipped. A laptop has
     room for a bigger orchestra than a phone does; anything with a
     touch screen, or without the cores, gets the smaller one. */
  let BUDGET = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency >= 8
                && !(navigator.maxTouchPoints > 1)) ? 160 : 110;
  const LIFTS = [0, 2, 0, 3, 0, 2, 5, 0];   // semitones, one per sixteen bars

  /* A run of the game has a seed, and the variations a score plays are
     drawn from it: which pattern this phrase, which instrument takes
     the tune, which fill. Hashed rather than rolled, so the same seed
     is the same performance and a test can listen to it twice. */
  const SESSION = ((Date.now() & 0xffffff) ^ Math.floor(Math.random() * 0x7fffffff)) | 0;
  function hash(a, b, c) {
    let h = (a | 0) ^ 0x9e3779b9;
    h = Math.imul(h ^ (b | 0), 0x85ebca6b); h ^= h >>> 13;
    h = Math.imul(h ^ (c | 0), 0xc2b2ae35); h ^= h >>> 16;
    return h >>> 0;
  }
  function strHash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h | 0;
  }

  const PROGRESSIONS = MusicCues.PROGRESSIONS;
  const MOTIFS = MusicCues.MOTIFS;
  const CUES = MusicCues.CUES;
  const STINGERS = MusicCues.STINGERS;

  const hz = (semi) => ROOT * Math.pow(2, semi / 12);

  // a bar is a chord, or two for half a bar each
  const halfBar = (bar) => Array.isArray(bar[0]);
  function chordAt(prog, bar, s, steps) {
    const b = prog[((bar % prog.length) + prog.length) % prog.length];
    return halfBar(b) ? (s < steps / 2 ? b[0] : b[1]) : b;
  }

  // chord tone i, with 3.. meaning the octave above and -1 the fifth below
  function tone(chord, i) {
    const n = chord.length;
    const k = ((i % n) + n) % n;
    return chord[k] + 12 * Math.floor(i / n);
  }

  /* A section's form: which part of it a bar is in. `form` is a string
     of part letters, one per `phrase` bars (spaces are for reading), or
     a list of such strings, one picked per variant. `local` is how far
     into its run of the same letter the bar is, so a part with its own
     progression starts that progression at the top. */
  function formAt(sec, bar, variant) {
    let f = sec.form;
    if (!f) return null;
    if (Array.isArray(f)) f = f[((variant | 0) % f.length + f.length) % f.length];
    const letters = f.replace(/\s+/g, '');
    const phrase = sec.phrase || 4;
    const i = Math.floor(bar / phrase) % letters.length;
    const part = letters[i];
    let k = i;
    while (k > 0 && letters[k - 1] === part) k--;
    return { part, local: bar - (Math.floor(bar / phrase) - (i - k)) * phrase };
  }

  function pitchesFor(L, chord, s) {
    if (L.abs != null) return [L.abs];
    const p = L.pick;
    if (p == null) return [null];
    if (p === 'root') return [chord[0]];
    if (p === 'top') return [chord[chord.length - 1]];
    if (p === 'third') return [chord[1]];
    if (p === 'chord') return chord.slice();
    const i = p[s % p.length];
    return i == null ? [] : [tone(chord, i)];
  }

  class Score {
    constructor(cueName, opts = {}) {
      this.ctx = AudioBus.ctx;
      this.dest = AudioBus.bus('music');
      this.ok = !!(this.ctx && this.dest && CUES[cueName]);
      if (!this.ok) return;

      const cue = this.cue = CUES[cueName];
      this.cueName = cueName;
      this.sections = cue.sections;
      this.names = Object.keys(cue.sections);
      this.gearNames = cue.gears || this.names;
      /* The old gear tables, for anything that reads `gears[i].bpm`.
         `beat()` below is the only reader left. */
      this.gears = this.gearNames.map(n => this.sections[n]);
      this.level = opts.level != null ? opts.level : cue.level;
      this.profile = { level: this.level, progression: cue.prog || null };

      const c = this.ctx;
      this.out = c.createGain();
      this.out.gain.value = EPS;

      /* The voices of the table. When anybody is talking into a
         microphone the band steps back; this node is that step, and it
         is separate from `out` so a duck under Claudia and a duck under
         a player cannot fight over one gain. */
      this.talk = c.createGain();
      this.talk.gain.value = 1;

      /* One lowpass between the mix and the desk, wide open until
         somebody asks for it. It is what the surface of the water
         sounds like from underneath, and it costs one node. */
      this.muffle = c.createBiquadFilter();
      this.muffle.type = 'lowpass';
      this.muffle.frequency.value = 20000;
      this.out.connect(this.talk);
      this.talk.connect(this.muffle);
      this.muffle.connect(MusicMix.master(c, this.dest));

      // the room: a real convolution, fed from a send, returning into out
      this.conv = c.createConvolver();
      this.conv.buffer = MusicMix.impulse(c, cue.room || 'hall');
      this.conv.connect(this.out);
      this._bus();

      this._voices = [];

      this.seed = opts.seed != null ? opts.seed | 0 : SESSION;
      this.tension = 0.5;
      this._tens = null;
      this.flags = {};
      this._tf = {};
      this._var = {};
      this._leg = {};
      this._build = null;
      this._holdUntil = 0;
      this._ended = 0;

      this.variant = opts.variant | 0;
      const first = this._resolve(opts.section && this.sections[opts.section] ? opts.section : this.gearNames[0]);
      this.secName = first;
      this.sec = this.sections[first];
      this.secStep = 0;
      this.gear = Math.max(0, this.gearNames.indexOf(first));
      this.bpm = this.sec.bpm;
      this.bpmFrom = this.sec.bpm;
      this.bpmT = 1;
      this.glide = 1;
      this.born = {};
      this.prevLayers = null;
      this.key = opts.key | 0;
      this.intensity = 1;
      this.step = 0;
      this.next = 0;
      this.paused = false;
      this.silent = false;
      this.timer = null;
      this._switch = null;
      this._pendingProg = null;
      this._pendingKey = null;
      this.progOverride = null;
      this._talking = false;
      this.speakDuck = true;
    }

    /* ---------------- plumbing the instruments use ---------------- */

    /* Everything the band plays goes through `pre` (dry) and `send`
       (to the room) on its way to `out`. They are a pair that can be
       thrown away: see `_flush`. */
    _bus() {
      const c = this.ctx;
      this.pre = c.createGain();
      this.pre.gain.value = 1;
      this.pre.connect(this.out);
      this.send = c.createGain();
      this.send.gain.value = this.cue.reverb != null ? this.cue.reverb : 0.3;
      this.send.connect(this.conv);
      this._fams = {};
      this._wets = {};
      this._choirs = {};
    }

    /* Cut every note that is sounding or booked, for good. Turning the
       band down does not do that: a string held for a bar is still
       there when the band comes back up, and a hit that lands on top of
       the tail of what it interrupted is not a hit. So the old buses
       are faded and dropped with everything still plugged into them,
       and the band gets new ones. */
    _flush(fade = 0.04) {
      const t = this.ctx.currentTime;
      const old = [this.pre, this.send];
      for (const g of old) {
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0, t + fade);
      }
      setTimeout(() => old.forEach(g => { try { g.disconnect(); } catch (e) {} }), (fade + 0.5) * 1000);
      this._bus();
      // and they no longer count against the budget: the band after a hit is a whole band
      this._voices = [];
    }

    /* A side bus: the same score — its key, its room, its budget — with
       an output of its own, so what plays through it (a build, mostly)
       can be cut without cutting the band. `tone` puts a lowpass on it
       for the caller to open. */
    _side(o = {}) {
      const c = this.ctx;
      const B = Object.create(this);
      B._fams = {}; B._wets = {}; B._choirs = {};
      B.exit = c.createGain();
      B.exit.gain.value = 1;
      B.exit.connect(this.out);
      B.pre = c.createGain();
      B.pre.gain.value = 1;
      if (o.tone) {
        B.tone = c.createBiquadFilter();
        B.tone.type = 'lowpass';
        B.tone.Q.value = 0.7;
        B.tone.frequency.value = o.tone;
        B.pre.connect(B.tone);
        B.tone.connect(B.exit);
      } else B.pre.connect(B.exit);
      B.send = c.createGain();
      B.send.gain.value = this.send.gain.value;
      B.send.connect(this.conv);
      // one orchestra, one budget
      B.alloc = (n, end, pri) => this.alloc(n, end, pri);
      return B;
    }

    fam(name) {
      if (!this._fams[name]) this._fams[name] = MusicMix.family(this.ctx, name, this.pre);
      return this._fams[name];
    }

    /* The formant bank for a vowel. `voice` is 'm' or 'w': the men's
       throat is longer and they stand on the left, the women on the
       right; with neither, it is the whole choir in the middle. */
    choirIn(vowel, voice) {
      const key = vowel + (voice || '');
      if (!this._choirs[key]) {
        const seat = voice === 'm' ? { scale: 0.87, pan: -0.3 } : voice === 'w' ? { scale: 1.06, pan: 0.3 } : {};
        this._choirs[key] = MusicMix.formant(this.ctx, vowel, this.fam('choir'), seat);
      }
      return this._choirs[key];
    }

    // room for the bigger orchestra: the bow noise, the extra desks
    get rich() { return BUDGET >= 150; }

    /* The pads step back under a big drum, for `len` seconds, by
       `depth` of their level. Booked on the audio clock like a note,
       so it lands with the drum that asked for it. */
    pump(t, depth = 0.3, len = 0.26) {
      const d = U.clamp(depth, 0, 0.8);
      for (const k in this._fams) {
        const g = this._fams[k].padDuck;
        if (!g) continue;
        g.gain.setValueAtTime(1, t);
        g.gain.linearRampToValueAtTime(1 - d, t + 0.02);
        g.gain.linearRampToValueAtTime(1, t + Math.max(0.08, len));
      }
    }

    wet(amount) {
      const k = Math.round(U.clamp(amount, 0, 1.5) * 20) / 20;
      if (!this._wets[k]) {
        const g = this.ctx.createGain();
        g.gain.value = k;
        g.connect(this.send);
        this._wets[k] = g;
      }
      return this._wets[k];
    }

    /* The budget. Every note says how many oscillators it costs and
       when it ends; a note with priority above zero is skipped rather
       than played once the orchestra is already that big. A phone
       with a busy boss fight loses a hi-hat, not a frame. */
    alloc(n, end, pri = 1) {
      const now = this.ctx.currentTime;
      let live = 0;
      const keep = [];
      for (const v of this._voices) if (v[0] > now) { keep.push(v); live += v[1]; }
      this._voices = keep;
      if (pri && live + n > BUDGET) return false;
      this._voices.push([end, n]);
      return true;
    }

    // the key, plus the lift the phrase has climbed to (see `_play`)
    hz(semi) { return hz(semi + this.key + (this.lift || 0)); }

    get voices() {
      const now = this.ctx.currentTime;
      return this._voices.reduce((a, v) => a + (v[0] > now ? v[1] : 0), 0);
    }

    _prog() {
      return this.progOverride || PROGRESSIONS[this.sec.prog] || PROGRESSIONS.dread;
    }

    /* The chord for a bar: an override wins, then the part's own
       progression if the form gives it one, then the section's. */
    _chord(bar, s, steps) {
      const F = !this.progOverride && this.sec.progs ? formAt(this.sec, bar, this.variant) : null;
      const own = F && this.sec.progs[F.part] && PROGRESSIONS[this.sec.progs[F.part]];
      return own ? chordAt(own, F.local, s, steps) : chordAt(this._prog(), bar, s, steps);
    }

    // the chord under the next note to be booked
    chordNow() {
      const steps = this.sec.steps || 16;
      const bar = Math.floor(this.secStep / steps);
      return this._chord(bar, this.secStep % steps, steps);
    }

    /* Which part of the form the band is in now, or null. */
    get part() {
      const F = formAt(this.sec, Math.floor(this.secStep / (this.sec.steps || 16)), this.variant);
      return F ? F.part : null;
    }

    /* Another arrangement of the same moment. A section can list `alt`
       sections; the variant picks the original or one of them, so the
       third day in the castle does not sound like the first. */
    setVariant(n) { this.variant = n | 0; }

    _resolve(name) {
      const sec = this.sections[name];
      if (!sec || !sec.alt || !sec.alt.length) return name;
      const n = this.variant % (sec.alt.length + 1);
      const alt = n > 0 ? sec.alt[n - 1] : name;
      return this.sections[alt] ? alt : name;
    }

    get sectionName() { return this.secName; }

    /* ---------------- the transport ---------------- */

    start() {
      if (!this.ok || this.timer) return this;
      const c = this.ctx;
      this.next = c.currentTime + 0.08;
      this.t0 = this.next;              // where beat one actually landed
      this.out.gain.cancelScheduledValues(c.currentTime);
      this.out.gain.setValueAtTime(EPS, c.currentTime);
      this.out.gain.exponentialRampToValueAtTime(this.level, c.currentTime + 1.6);
      this.timer = setInterval(() => this._pump(), TICK);
      return this;
    }

    /* Switch arrangement. `at` is 'now' (the next sixteenth), 'beat' or
       'bar'; `glide` is how long the tempo and the new layers take to
       arrive; `fill` books a reverse cymbal that ends on the downbeat
       the section starts on. Returns false if this cue has no such
       section, which is how a shared caller (reveal.js) knows to fall
       back to the old gear-and-progression move. */
    section(name, o = {}) {
      if (!this.ok || !this.sections[name]) return false;
      name = this._resolve(name);
      if (name === this.secName && !this._switch && !o.force) return true;
      const at = o.at || 'bar';
      this._switch = { name, at, glide: o.glide != null ? o.glide : 1.5 };
      if (o.keepProg !== true) this._clearOverride = true;
      /* How the band gets there. A caller can say; otherwise the cue
         may know (`trans`: 'from>to' or '*>to'); otherwise it just
         changes, as it always did. */
      const T = this._gridTime(at === 'bar' ? (this.sec.steps || 16) : at === 'beat' ? 4 : 1, false);
      const tr = this.cue.trans || {};
      const via = o.via !== undefined ? o.via
        : tr[this.secName + '>' + name] || tr['*>' + name] || null;
      if (via) this._transition(via, T);
      else if (o.fill) MusicInst.revCymbal(this, T, Math.min(1.8, T - this.ctx.currentTime - 0.02), 0.8);
      const gi = this.gearNames.findIndex(g => this._resolve(g) === name);
      if (gi >= 0) this.gear = gi;
      return true;
    }

    /* The bar before a change of section, written rather than faded.

         fill    toms falling onto the downbeat behind a reverse cymbal
         riser   a riser and the cymbal, for a lift
         swell   the chord it is leaving, crescendo, and the floor drops
         cut     the band stops for a beat, and comes back on the one

       Each needs room to happen in: a change that is already upon us
       just changes. */
    _transition(via, T) {
      const I = MusicInst;
      const now = this.ctx.currentTime;
      const lead = T - now;
      if (lead < 0.3) return;
      const sps = this._sps();
      if (via === 'fill') {
        I.revCymbal(this, T, Math.min(1.8, lead - 0.02), 0.8);
        for (let k = 4; k >= 1; k--) {
          const t = T - k * sps;
          if (t > now + 0.03) I.tom(this, t, 0, 0, 0.45 + 0.13 * (4 - k), { pri: 0, f: 170 - 22 * (4 - k) });
        }
        I.crash(this, T, 0, 0, 0.45);
        I.taiko(this, T, 0, 0, 0.8, { pri: 0 });
      } else if (via === 'riser') {
        const len = Math.min(2.4, lead - 0.02);
        const r = I.shepard(this, T - len, this.hz(12), len, 0.7);
        setTimeout(() => { try { r.stop(0.06); } catch (e) {} }, lead * 1000);
        I.revCymbal(this, T, Math.min(1.8, len), 0.8);
        I.crash(this, T, 0, 0, 0.4);
      } else if (via === 'swell') {
        const len = Math.min(2.4, lead - 0.02);
        const ch = this.chordNow();
        for (const s of ch) {
          I.strings(this, T - len, this.hz(36 + s), len, 0.7, { art: 'swell', fam: 'hiStr', pri: 0 });
        }
        I.choir(this, T - len, this.hz(36 + ch[0]), len * 0.7, 0.5, { pri: 0, a: len * 0.6, rel: 0.3, vowel: 'oo' });
        I.boom(this, T, 0, 0, 0.6, { len: 2.2 });
      } else if (via === 'cut') {
        const gap = Math.min(lead - 0.05, sps * 4);
        const g = this.out.gain;
        if (gap < 0.12 || this.silent || this.paused) return;
        // added to whatever is already booked (a fade in, a duck coming back), not instead of it
        g.setValueAtTime(Math.max(EPS, this.level), T - gap);
        g.exponentialRampToValueAtTime(EPS, T - gap + 0.03);
        g.setValueAtTime(EPS, T - 0.004);
        g.linearRampToValueAtTime(this.level, T + 0.01);
        this._holdUntil = T;
        I.taiko(this, T, 0, 0, 0.9, { pri: 0 });
        I.boom(this, T, 0, 0, 0.5, { len: 1.8 });
      }
    }

    /* A gear is a section by number. A phase change crossfades over a
       couple of beats; the enrage snaps. */
    setGear(i, glide = 2) {
      if (!this.ok) return;
      i = U.clamp(i | 0, 0, this.gearNames.length - 1);
      const name = this._resolve(this.gearNames[i]);
      this.gear = i;
      if (name === this.secName && !this._switch) return;
      const at = glide < 0.3 ? 'now' : glide < 1 ? 'beat' : 'bar';
      this._switch = { name, at, glide: Math.max(0.25, glide) };
    }

    /* How wound up the moment is, from 0 (nothing is happening) to 1
       (everything is). One knob for the game to turn: layers come and
       go with it (`tens: [lo, hi]`, faded over a bar, never switched),
       and the ones marked `int` play harder. It moves over `secs`, so a
       scene can say where the tension is going and let the band walk
       there. */
    setTension(v, secs = 1.5) {
      if (!this.ok) return;
      const to = U.clamp(v, 0, 1);
      if (!(secs > 0)) { this.tension = to; this.intensity = 0.6 + 0.8 * to; this._tens = null; return; }
      this._tens = { from: this.tension, to, t0: this.ctx.currentTime, dur: secs };
    }

    /* What is true in the game that the band should know about, by
       name: 'sealed' (shut in a room with one other person), 'followed',
       and the private ones a Traitor carrying the poison hears. A layer
       with `flag` plays while its flag is up and `unless` while it is
       down, faded in and out over a bar like a band of tension. A layer
       marked `private` plays only while `flags.private` is up, and stops
       the instant it goes down, without a fade: that flag is dropped
       whenever your own microphone is open, so nobody else in the room
       can hear what only you should. */
    setFlag(name, on) { if (this.ok) this.flags[name] = !!on; }
    setFlags(o) { if (this.ok && o) for (const k in o) this.flags[k] = !!o[k]; }

    /* The old knob, kept for the fire: 0.6 is slack, 1 is normal, 1.4
       is everything. It is the same knob as the tension, read off a
       different scale. */
    setIntensity(v) {
      this.intensity = U.clamp(v, 0, 1.5);
      this.tension = U.clamp((this.intensity - 0.6) / 0.8, 0, 1);
      this._tens = null;
    }

    // semitones above D, from the next bar line
    setKey(k) { if (this.ok) this._pendingKey = k | 0; }

    /* Where the beat is *right now*, as opposed to where the sequencer
       has got to booking it. Exact arithmetic off the moment the score
       started, so only meaningful for a cue that promises its tempo
       will not move — which is exactly the one that asks. */
    beat() {
      if (!this.ok || !this.t0) return null;
      const spb = 60 / this.sec.bpm;
      const since = ((this.ctx.currentTime - this.t0) % spb + spb) % spb;
      return { spb, sinceBeat: since, toBeat: spb - since };
    }

    /* How much water is between the listener and the band. Exponential,
       because hearing is. */
    setMuffle(v, time = 0.25) {
      if (!this.ok || !this.muffle) return;
      const k = U.clamp(v, 0, 1);
      const hz2 = 20000 * Math.pow(420 / 20000, k);
      const t = this.ctx.currentTime;
      this.muffle.frequency.cancelScheduledValues(t);
      this.muffle.frequency.setValueAtTime(Math.max(20, this.muffle.frequency.value), t);
      this.muffle.frequency.exponentialRampToValueAtTime(Math.max(20, hz2), t + time);
    }

    setPaused(v) {
      if (!this.ok || this.paused === v) return;
      this.paused = v;
      const t = this.ctx.currentTime;
      this.out.gain.cancelScheduledValues(t);
      this.out.gain.setTargetAtTime(v || this.silent ? EPS : this.level, t, 0.12);
      if (!v) this.next = this._snap(Math.max(this.next, t + 0.06));
    }

    /* A cue with a locked tempo keeps its grid through a pause: the
       dive's stroke window is read off `t0`, and a resume that started
       the band again half a sixteenth late would move every beat the
       player is swimming to. */
    _snap(T) {
      if (!this.cue.lockTempo || !this.t0) return T;
      const sps = 60 / this.sec.bpm / 4;
      return this.t0 + Math.ceil((T - this.t0) / sps - 1e-6) * sps;
    }

    // duck under a screech or a line without losing the beat
    duck(amount = 0.35, time = 0.9) {
      if (!this.ok || this.paused || this.silent) return;
      // a breath before a hit is not to be ducked into, or out of
      if (this.ctx.currentTime < this._holdUntil) return;
      const lift = this.sec.duckLift || 0;
      const a = amount + (1 - amount) * lift;
      const t = this.ctx.currentTime;
      this.out.gain.cancelScheduledValues(t);
      this.out.gain.setValueAtTime(Math.max(EPS, this.out.gain.value), t);
      this.out.gain.exponentialRampToValueAtTime(Math.max(0.02, this.level * a), t + 0.08);
      this.out.gain.exponentialRampToValueAtTime(this.level, t + Math.max(0.2, time));
    }

    /* True silence — not a duck. The second between the throw and the
       colour is the most important one in the game, and a band at
       seven percent is still a band. The clock keeps counting through
       it so whatever comes back comes back on the grid. */
    silence(on = true) {
      if (!this.ok) return;
      const t = this.ctx.currentTime;
      // the breath before a hit ends itself, on the hit
      if (!on && !this.silent && t < this._holdUntil) return;
      this.silent = !!on;
      this._silentAt = t;
      this.out.gain.cancelScheduledValues(t);
      this.out.gain.setValueAtTime(Math.max(EPS, this.out.gain.value), t);
      if (on) this.out.gain.exponentialRampToValueAtTime(EPS, t + 0.06);
      else if (!this.paused) this.out.gain.linearRampToValueAtTime(this.level, t + 0.012);
    }

    // players talking push the band down; see `_pump`
    speakerDuck(on) {
      this.speakDuck = !!on;
      if (!on && this.ok) {
        this._talking = false;
        this.talk.gain.setTargetAtTime(1, this.ctx.currentTime, 0.4);
      }
    }

    /* Change the chords without stopping. The swap lands on the next
       bar line, because a chord that changes halfway through one is a
       mistake rather than a modulation. */
    setProgression(id) {
      const next = PROGRESSIONS[id];
      if (!this.ok || !next) return;
      this.profile.progression = id;
      this._pendingProg = next;
    }

    /* The riser for a held beat, in the band so it can be cut with the
       band. Returns a handle with `stop()`. */
    riser(dur = 3.4) {
      if (!this.ok) return { stop() {} };
      if (this.silent) this.silence(false);
      return MusicInst.shepard(this, this.ctx.currentTime + 0.02, this.hz(12), dur, 1);
    }

    /* The crescendo before an answer: see `music/build.js`. One at a
       time; a new one takes over from the last. */
    build(o = {}) {
      if (!this.ok) return MusicBuild.DEAD;
      if (this._build) this._build.cancel(0.2);
      if (this.silent) this.silence(false);
      // what the band does underneath, if the cue has a bed for it
      if (o.bed && this.sections[o.bed]) this.section(o.bed, { at: 'beat', glide: 0.3, via: null });
      this._build = MusicBuild.start(this, o);
      return this._build;
    }

    /* The hit after a breath. Everything sounding is cut — not turned
       down, cut — the band holds its breath for `breath` seconds, and
       then the stinger and the section named in `then` start on the
       same instant, with the sequencer's bar one on it. Returns how
       long the breath is, so the picture can land with the sound. */
    strike(sting, o = {}) {
      if (!this.ok) return 0;
      const c = this.ctx, now = c.currentTime;
      const breath = Math.max(0, o.breath != null ? o.breath : 0.4);
      const T = now + breath + 0.02;
      if (this._build) this._build.cancel(0.04);
      this._flush(0.04);

      // the sequencer starts again on the hit, at the top of a bar
      const then = o.then && this.sections[o.then] ? this._resolve(o.then) : null;
      this._switch = null;
      if (then) {
        this._enter({ name: then, glide: o.glide != null ? o.glide : 0.3 }, T);
        const gi = this.gearNames.findIndex(g => this._resolve(g) === then);
        if (gi >= 0) this.gear = gi;
        this.bpm = this.sec.bpm; this.bpmT = 1;
      } else this.secStep = 0;
      this.next = T;
      this.t0 = T;
      // `end`: the hit is the last thing this score plays, and it is left to ring
      this._ended = o.end ? T - 0.001 : 0;

      // true silence until T, and the whole band back on it
      const g = this.out.gain;
      this.silent = false;
      this._holdUntil = T;
      g.cancelScheduledValues(now);
      g.setValueAtTime(Math.max(EPS, g.value), now);
      if (breath > 0.05) {
        g.exponentialRampToValueAtTime(EPS, now + 0.04);
        g.setValueAtTime(EPS, T - 0.004);
      }
      g.linearRampToValueAtTime(this.paused ? EPS : this.level, T + 0.01);

      const fn = sting && STINGERS[sting];
      if (fn) fn(this, T, o);
      return T - now;
    }

    /* The end of a scene, written. The band plays up to the next bar
       line and lands on the key — low strings, and according to how
       big the moment was either a drum and the horns or a harp and a
       bell — and lets it ring, instead of being faded out mid-phrase.
       Returns the seconds until the last chord lands. */
    coda(o = {}) {
      if (!this.ok || this._ended) return 0;
      const I = MusicInst;
      const now = this.ctx.currentTime;
      const T = Math.max(now + 0.03, this._gridTime(o.at === 'beat' ? 4 : (this.sec.steps || 16), false));
      this._ended = T;
      this._switch = null;
      if (this._build) this._build.cancel(0.3);
      const big = o.big != null ? o.big : (this.sec.energy || 0) >= 3;
      const ring = o.ring != null ? o.ring : 2.8;
      const chord = o.major ? [0, 4, 7] : [0, 3, 7];
      I.strings(this, T, this.hz(12), ring, 0.9, { art: 'sustain', a: 0.05, rel: 1.2, fam: 'cello', pri: 0, voices: 3 });
      for (const s of chord) {
        I.strings(this, T, this.hz(36 + s), ring * 0.8, 0.45, { art: 'sustain', a: 0.08, rel: 1.2, fam: 'hiStr', pri: 0 });
      }
      if (big) {
        I.timpani(this, T, this.hz(12), 0, 1.0, { pri: 0 });
        I.taiko(this, T, 0, 0, 0.9, { pri: 0 });
        I.crash(this, T, 0, 0, 0.6);
        [0, 7, 12].forEach(s => I.brass(this, T, this.hz(24 + s), ring * 0.6, 0.7, { pri: 0 }));
      } else {
        chord.concat(12).forEach((s, i) => I.harp(this, T + i * 0.07, this.hz(36 + s), 1.5, 0.5, { pri: 0 }));
        I.bell(this, T + 0.3, this.hz(48 + 7), 0, 0.3, { pri: 0 });
      }
      const lead = T - now;
      setTimeout(() => this.stop(ring * 0.7), (lead + ring * 0.45) * 1000);
      return lead;
    }

    stop(fade = 1.2) {
      if (!this.ok) return;
      LIVE.delete(this);
      if (this._build) this._build.cancel(Math.min(0.3, fade));
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
      const t = this.ctx.currentTime;
      this.out.gain.cancelScheduledValues(t);
      this.out.gain.setValueAtTime(Math.max(EPS, this.out.gain.value), t);
      this.out.gain.exponentialRampToValueAtTime(EPS, t + Math.max(0.05, fade));
      setTimeout(() => {
        try { this.out.disconnect(); } catch (e) {}
        try { this.talk.disconnect(); } catch (e) {}
        try { this.muffle.disconnect(); } catch (e) {}
        try { this.conv.disconnect(); } catch (e) {}
      }, (fade + 3) * 1000);
    }

    /* -------- punctuation --------
       Stingers are played on top of whatever the loop is doing — now,
       because the thing they mark has already happened, or on the next
       beat or bar when they are *announcing* something. A stinger lifts
       a silence: it is the thing the silence was waiting for. */
    stinger(kind, o = {}) {
      if (!this.ok) return;
      const fn = STINGERS[kind];
      if (!fn) return;
      if (this.silent) this.silence(false);
      const at = o.at;
      const t = at === 'bar' ? this._gridTime(this.sec.steps || 16, true)
              : at === 'beat' ? this._gridTime(4, true)
              : this.ctx.currentTime + 0.01;
      fn(this, t, o);
    }

    /* -------- the clock -------- */

    _sps() { return 60 / this.bpm / 4; }

    /* The audio time of the next grid line `unit` sixteenths wide.
       `booked` walks back through the lookahead first, so a stinger
       asked for now lands on the next beat you will *hear*, not the
       next one the sequencer has yet to book. */
    _gridTime(unit, booked) {
      const sps = this._sps();
      const soon = this.ctx.currentTime + 0.025;
      let s = this.secStep, T = this.next;
      if (booked) while (s > 0 && T - sps >= soon) { T -= sps; s--; }
      let guard = 0;
      while (((s % unit) + unit) % unit !== 0 && guard++ < 64) { T += sps; s++; }
      return T;
    }

    _pump() {
      if (!this.ok || this.paused) return;
      const now = this.ctx.currentTime;
      /* A silence is a held breath — a second or two before an answer —
         and the stinger that answers it is what lets go. A beat whose
         answer never came (a reveal recovered from state, a ceremony cut
         short) must not leave the band off for the rest of the night. */
      if (this.silent && now - (this._silentAt || now) > SILENCE_MAX) this.silence(false);

      // the tension walks to where it was sent
      if (this._tens) {
        const k = U.clamp((now - this._tens.t0) / this._tens.dur, 0, 1);
        this.tension = U.lerp(this._tens.from, this._tens.to, k);
        this.intensity = 0.6 + 0.8 * this.tension;
        if (k >= 1) this._tens = null;
      }
      if (this._build) this._build.pump(now);

      /* Anybody you can hear — a player, an AI, Claudia — and the band
         steps back for as long as they talk, in every scene: the music
         is under the game, never on top of the people in it. */
      if (this.speakDuck) {
        let loud = false;
        try {
          loud = (typeof VoiceChat !== 'undefined' && VoiceChat.talkers && VoiceChat.talkers().length > 0)
            || (typeof Voice !== 'undefined' && !!Voice.speaking);
        } catch (e) {}
        if (loud !== this._talking) {
          this._talking = loud;
          this.talk.gain.setTargetAtTime(loud ? Math.min(this.sec.talkDuck || TALK_DUCK, TALK_DUCK) : 1,
                                         now, loud ? 0.08 : 0.8);
        }
      }

      // a tab that was in the background comes back with the audio clock
      // far ahead of where the sequencer got to; catch up rather than
      // spraying every missed note at once
      if (this.next < now - 0.5) this.next = this._snap(now + 0.05);
      let guard = 0;
      while (this.next < now + LOOKAHEAD && guard++ < 64) {
        this._play(this.next);
        this.next += this._sps();
        this.step++;
        if (this.bpmT < 1) {
          this.bpmT = Math.min(1, this.bpmT + this._sps() / this.glide);
          this.bpm = U.lerp(this.bpmFrom, this.sec.bpm, this.bpmT);
        }
      }
    }

    _enter(sw, t) {
      const prev = this.sec;
      const next = this.sections[sw.name];
      const had = new Set((prev.layers || []).map(l => l.id));
      this.born = {};
      for (const l of next.layers) if (!had.has(l.id)) this.born[l.id] = t;
      this.glide = sw.glide;
      this.bpmFrom = this.bpm;
      this.bpmT = next.bpm === this.bpm ? 1 : 0;
      this.sec = next;
      this.secName = sw.name;
      this.secStep = 0;
      this._tf = {};
      this._var = {};
      this._leg = {};
      if (this._clearOverride) { this.progOverride = null; this._clearOverride = false; }
    }

    /* One of `k` alternatives for a layer, for the `n`th phrase (or
       pass, or fill): drawn from the seed, and never the one it played
       last time. `plainFirst` makes the first one the original — a tune
       is stated before it is varied. */
    _pickVar(L, tag, k, n, plainFirst) {
      if (k <= 1) return 0;
      const key = L.id + tag;
      const was = this._var[key];
      if (was && was.n === n) return was.i;
      if (L._h == null) L._h = strHash(L.id + ':' + L.inst);
      let i = plainFirst && n === 0 ? 0 : hash(this.seed, L._h ^ tag.charCodeAt(0), n) % k;
      if (was && i === was.i) i = (i + 1 + hash(this.seed, L._h, n * 7 + 3) % (k - 1)) % k;
      this._var[key] = { n, i };
      return i;
    }

    _play(t) {
      const sw = this._switch;
      if (sw) {
        const unit = sw.at === 'now' ? 1 : sw.at === 'beat' ? 4 : (this.sec.steps || 16);
        if (this.secStep % unit === 0) { this._switch = null; this._enter(sw, t); }
      }
      const steps = this.sec.steps || 16;
      const s = this.secStep % steps;
      if (s === 0) {
        if (this._pendingProg) { this.progOverride = this._pendingProg; this._pendingProg = null; }
        if (this._pendingKey != null) { this.key = this._pendingKey; this._pendingKey = null; }
        /* Every sixteen bars the whole band lifts — up a tone, back,
           up a minor third, back — so a section that runs for minutes
           keeps climbing instead of going round. */
        const b16 = Math.floor(Math.floor(this.secStep / steps) / 16);
        this.lift = LIFTS[b16 % LIFTS.length];
      }
      // a coda has been played: nothing is booked past the last chord
      if (!this.silent && !(this._ended && t >= this._ended - 1e-6)) {
        const bar = Math.floor(this.secStep / steps);
        const chord = this._chord(bar, s, steps);
        const F = this.sec.form ? formAt(this.sec, bar, this.variant) : null;
        for (const L of this.sec.layers) {
          if (L.parts && F && L.parts.indexOf(F.part) < 0) continue;
          this._layer(L, s, bar, chord, t, steps);
        }
      }
      this.secStep++;
    }

    _layer(L0, s, bar, chord, t, steps) {
      /* A layer that belongs to a band of tension fades in and out of
         it over a bar. The fade is kept moving through the rests, so a
         layer that plays once a bar still arrives over one. */
      let tf = 1;
      if (L0.private && !this.flags.private) { this._tf[L0.id] = 0; return; }
      if (L0.tens || L0.flag || L0.unless || L0.private) {
        const F = this.flags;
        let want = 1;
        if (L0.tens && !(this.tension >= L0.tens[0] && this.tension <= L0.tens[1])) want = 0;
        if (L0.flag && !F[L0.flag]) want = 0;
        if (L0.unless && F[L0.unless]) want = 0;
        let cur = this._tf[L0.id];
        if (cur == null) cur = want;
        else if (cur < want) cur = Math.min(1, cur + 1 / steps);
        else if (cur > want) cur = Math.max(0, cur - 1 / steps);
        this._tf[L0.id] = cur;
        if (cur < 0.03) return;
        tf = cur;
      }
      if (L0.minInt != null && this.intensity < L0.minInt) return;
      if (L0.maxInt != null && this.intensity > L0.maxInt) return;
      if (L0.when && !L0.when(bar)) return;

      const phrase = Math.floor(bar / (this.sec.phrase || 4));
      /* Who has the tune this phrase. `rotate` is a list of overrides —
         another instrument, another octave — taken in turn, starting
         wherever the seed says, so a tune that comes round again comes
         round on somebody else. */
      let L = L0;
      if (L0.rotate) {
        if (!L0._rot) L0._rot = L0.rotate.map(r => Object.assign({}, L0, r, { rotate: null, _rot: null }));
        L = L0._rot[(phrase + (this.seed >>> 3)) % L0._rot.length];
      }

      let v, pitches, len;
      if (L.motif) {
        const M0 = MOTIFS[L.motif];
        if (!M0) return;
        // each pass through the tune may be a variant of it; the first is plain
        const M = L.vary && M0.vars
          ? M0.vars[this._pickVar(L0, 'm', M0.vars.length, Math.floor(this.secStep / M0.len), true)] : M0;
        const n = M.at[this.secStep % M.len];
        if (!n) return;
        v = n.v; pitches = [n.s]; len = n.d;
      } else {
        /* A pool of patterns, one a phrase; and on the last bar of a
           phrase, a fill instead, if the layer has any. */
        let pat = L.pat, pk = L;
        const fe = L.fillEvery || 4;
        if (L.fills && bar % fe === fe - 1) {
          pat = L.fills[this._pickVar(L0, 'f', L.fills.length, Math.floor(bar / fe))];
        } else if (L.pats) {
          const i = this._pickVar(L0, 'p', L.pats.length, phrase);
          pat = L.pats[i];
          if (L.picks) pk = { pick: L.picks[i % L.picks.length], abs: L.abs };
        }
        v = pat[s % pat.length];
        if (!v) return;
        pitches = pitchesFor(pk, chord, s);
        len = L.len || 1;
      }

      v *= L.gain * tf;
      if (L.int) v *= this.intensity;
      // nobody plays two notes exactly alike
      if (!L.exact) {
        if (L0._h == null) L0._h = strHash(L0.id + ':' + L0.inst);
        v *= 0.93 + 0.14 * (hash(this.seed, L0._h, this.step) / 4294967296);
      }
      const born = this.born[L.id];
      if (born != null) v *= U.clamp((t - born) / this.glide, 0.08, 1);
      if (v < 0.02) return;

      const dur = len * this._sps() * 0.96;
      const inst = MusicInst[L.inst];
      if (!inst) return;
      const base = 12 * (L.oct || 0);
      for (const p of pitches) {
        const f = p == null ? null : this.hz(p + base);
        /* A legato line is told where it is coming from, so the
           instrument can slide rather than start again — but only if
           the last note really did run up to this one. */
        let o = L;
        if (L.legato && f && pitches.length === 1) {
          const was = this._leg[L.id];
          if (was && was.f !== f && t - was.end < 0.14) o = Object.assign({}, L, { from: was.f });
          this._leg[L.id] = { f, end: t + dur };
        }
        inst(this, t, f, dur, v, o);
      }
    }
  }

  // a score that does nothing, for when there is no audio context at all
  const SILENT = {
    ok: false,
    start() { return this; }, setGear() {}, setIntensity() {}, setPaused() {},
    duck() {}, stinger() {}, stop() {}, setProgression() {}, setMuffle() {},
    section() { return false; }, setKey() {}, silence() {}, speakerDuck() {},
    riser() { return { stop() {} }; }, chordNow() { return [0, 3, 7]; },
    beat() { return null; }, setVariant() {}, part: null,
    setTension() {}, build() { return MusicBuild.DEAD; }, strike() { return 0; }, coda() { return 0; },
    setFlag() {}, setFlags() {}, flags: {},
  };

  /* Every score that is currently playing. Claudia has to be able to
     duck whatever is under her without knowing what it is, and a scene
     change has to be able to stop a score somebody else started. */
  const LIVE = new Set();

  function begin(s) {
    if (!s.ok) return SILENT;
    LIVE.add(s);
    return s.start();
  }

  function play(cue, opts) {
    if (!AudioBus.ready) return SILENT;
    return begin(new Score(cue, opts));
  }

  function duckAll(amount = 0.4, time = 0.9) { LIVE.forEach(s => s.duck(amount, time)); }
  function stopAll(fade = 1.0) { LIVE.forEach(s => s.stop(fade)); LIVE.clear(); }
  function pauseAll(v) { LIVE.forEach(s => s.setPaused(v)); }

  // switch every live score that has this section; true if any did
  function sectionAll(name, o) {
    let any = false;
    LIVE.forEach(s => { if (s.section(name, o)) any = true; });
    return any;
  }

  function stingerAll(kind, o) { LIVE.forEach(s => s.stinger(kind, o)); return LIVE.size > 0; }

  /* ---------------- the cues ---------------- */

  /* the front door: an overture that starts as the theme and becomes
     an anthem when the caller lifts it — see `main.js` */
  /* `variant` is how many times the front door has been visited: each
     visit gets the next of its three arrangements (see `main.js`). */
  const title = (o = {}) => play('title', { section: 'gate', variant: o.variant });
  // Explore: the castle with nothing at stake
  const explore = () => play('explore', { section: 'roam' });
  // the hill: the main title
  const ceremony = () => play('ceremony');
  /* the day in the castle: driving, and faster when the bell goes.
     `variant` picks the day's arrangement and `key` moves it, so no two
     days in a run sound the same — see `dayMusic` */
  const tasks = (o = {}) => play('tasks', { section: 'work', variant: o.variant, key: o.key, seed: o.seed });
  // the fire
  // `variant` picks the night's arrangement of the verdicts; the fire never moves key
  const finale = (o = {}) => play('finale', { section: 'arrival', variant: o.variant, seed: o.seed });
  const verdict = finale;
  // the castle: the round table and the night
  const roundtable = (o = {}) => play('roundtable', { section: 'gather', variant: o.variant, key: o.key, seed: o.seed });
  const murder = (section = 'nightfall', o = {}) => play('murder', { section, variant: o.variant, key: o.key, seed: o.seed });

  /* The day's arrangement and key, from the run seed and the day: the
     same night for everybody in it, a different one tomorrow. The key
     only ever moves the castle cues, never the fire, whose pouches
     climb from D on purpose. */
  const DAY_KEYS = [0, 2, -2, 1, -3];
  function dayMusic(seed, day) {
    // the start is the seed's; each day after it moves on by one, so
    // no two days running get the same arrangement
    const h = Math.imul((seed | 0) ^ 0x6d75, 0x85ebca6b) >>> 0;
    const d = Math.max(0, day | 0);
    return { variant: (h >>> 7) % 6 + d, key: DAY_KEYS[d % DAY_KEYS.length],
             seed: (h ^ Math.imul(d + 1, 0x9e3779b1)) | 0 };
  }

  /* The key a scene plays in, so that a night is not all D minor. The
     day keeps its own key (above); the night drops a major third into
     the dark, a long way from the morning; breakfast is back in the
     day's key, pretending; the round table is a fourth up, and goes up
     a semitone each time it cannot decide; the fire is home, in D,
     where every verdict ends. Returns what `dayMusic` does, keyed for
     the scene. */
  const SCENE_KEYS = { day: 0, night: -4, breakfast: 0, table: 5, fire: null };
  function sceneMusic(scene, seed, day, o = {}) {
    const dm = dayMusic(seed, day);
    const off = SCENE_KEYS[scene];
    if (off === null) return Object.assign({}, dm, { key: 0 });
    let key = (scene === 'table' ? 0 : dm.key) + (off || 0) + (o.revote | 0);
    // keep the basses on the instrument: nothing below the G under D
    while (key < -7) key += 12;
    while (key > 7) key -= 12;
    return Object.assign({}, dm, { key });
  }

  /* Which verdict the night earned, as music. From *your* seat: a
     Faithful whose Traitor got away hears the Traitor's anthem, because
     that is what happened to them. `sting` is the hit that opens it;
     `credits` is what plays under the verdict panel afterwards. */
  function verdictCue(o = {}) {
    if (o.won && o.role === 'traitor') {
      return { section: 'verdictTraitor', credits: 'creditsTraitor', sting: 'traitor-win' };
    }
    if (o.won) return { section: 'verdictWin', credits: 'creditsWin', sting: 'win' };
    if (o.role !== 'traitor' && o.reason !== 'you-burned') {
      return { section: 'verdictTraitor', credits: 'creditsTraitor', sting: 'traitor-win' };
    }
    return { section: 'verdictLoss', credits: 'creditsLoss', sting: 'lose' };
  }

  return { title, ceremony, tasks, verdict, finale, play, explore,
           roundtable, murder, dayMusic, sceneMusic, SCENE_KEYS, formAt,
           duckAll, stopAll, pauseAll, sectionAll, stingerAll, verdictCue,
           Score, SILENT, PROGRESSIONS, STINGERS, CUES, hash,
           get budget() { return BUDGET; }, setBudget(n) { BUDGET = Math.max(40, n | 0); },
           get live() { return LIVE; } };
})();

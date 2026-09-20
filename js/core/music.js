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
     music/cues.js         the theme, the chords, every cue's sections
                           and every stinger

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
  const BUDGET = 110;         // live oscillators before optional notes are skipped

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
      this.send = c.createGain();
      this.send.gain.value = cue.reverb != null ? cue.reverb : 0.3;
      this.conv = c.createConvolver();
      this.conv.buffer = MusicMix.impulse(c, cue.room || 'hall');
      this.send.connect(this.conv);
      this.conv.connect(this.out);

      this._fams = {};
      this._wets = {};
      this._choirs = {};
      this._voices = [];

      const first = opts.section && this.sections[opts.section] ? opts.section : this.gearNames[0];
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
      this.key = 0;
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
      this.speakDuck = false;
    }

    /* ---------------- plumbing the instruments use ---------------- */

    fam(name) {
      if (!this._fams[name]) this._fams[name] = MusicMix.family(this.ctx, name, this.out);
      return this._fams[name];
    }

    choirIn(vowel) {
      if (!this._choirs[vowel]) this._choirs[vowel] = MusicMix.formant(this.ctx, vowel, this.fam('choir'));
      return this._choirs[vowel];
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

    hz(semi) { return hz(semi + this.key); }

    get voices() {
      const now = this.ctx.currentTime;
      return this._voices.reduce((a, v) => a + (v[0] > now ? v[1] : 0), 0);
    }

    _prog() {
      return this.progOverride || PROGRESSIONS[this.sec.prog] || PROGRESSIONS.dread;
    }

    // the chord under the next note to be booked
    chordNow() {
      const steps = this.sec.steps || 16;
      const bar = Math.floor(this.secStep / steps);
      return chordAt(this._prog(), bar, this.secStep % steps, steps);
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
      if (name === this.secName && !this._switch && !o.force) return true;
      const at = o.at || 'bar';
      this._switch = { name, at, glide: o.glide != null ? o.glide : 1.5 };
      if (o.keepProg !== true) this._clearOverride = true;
      if (o.fill) {
        const T = this._gridTime(at === 'bar' ? (this.sec.steps || 16) : at === 'beat' ? 4 : 1, false);
        MusicInst.revCymbal(this, T, Math.min(1.8, T - this.ctx.currentTime - 0.02), 0.8);
      }
      const gi = this.gearNames.indexOf(name);
      if (gi >= 0) this.gear = gi;
      return true;
    }

    /* A gear is a section by number. A phase change crossfades over a
       couple of beats; the enrage snaps. */
    setGear(i, glide = 2) {
      if (!this.ok) return;
      i = U.clamp(i | 0, 0, this.gearNames.length - 1);
      const name = this.gearNames[i];
      this.gear = i;
      if (name === this.secName && !this._switch) return;
      const at = glide < 0.3 ? 'now' : glide < 1 ? 'beat' : 'bar';
      this._switch = { name, at, glide: Math.max(0.25, glide) };
    }

    // an extra shove on top of the arrangement: how hard it is going
    setIntensity(v) { this.intensity = U.clamp(v, 0, 1.5); }

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
      this.silent = !!on;
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

    stop(fade = 1.2) {
      if (!this.ok) return;
      LIVE.delete(this);
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

      if (this.speakDuck && typeof VoiceChat !== 'undefined' && VoiceChat.loudest) {
        let loud = false;
        try { loud = !!VoiceChat.loudest(0.1); } catch (e) {}
        if (loud !== this._talking) {
          this._talking = loud;
          this.talk.gain.setTargetAtTime(loud ? (this.sec.talkDuck || 0.35) : 1,
                                         now, loud ? 0.08 : 0.6);
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
      if (this._clearOverride) { this.progOverride = null; this._clearOverride = false; }
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
      }
      if (!this.silent) {
        const bar = Math.floor(this.secStep / steps);
        const chord = chordAt(this._prog(), bar, s, steps);
        for (const L of this.sec.layers) this._layer(L, s, bar, chord, t);
      }
      this.secStep++;
    }

    _layer(L, s, bar, chord, t) {
      if (L.minInt != null && this.intensity < L.minInt) return;
      if (L.maxInt != null && this.intensity > L.maxInt) return;
      if (L.when && !L.when(bar)) return;

      let v, pitches, len;
      if (L.motif) {
        const M = MOTIFS[L.motif];
        const n = M && M.at[this.secStep % M.len];
        if (!n) return;
        v = n.v; pitches = [n.s]; len = n.d;
      } else {
        v = L.pat[s % L.pat.length];
        if (!v) return;
        pitches = pitchesFor(L, chord, s);
        len = L.len || 1;
      }

      v *= L.gain;
      if (L.int) v *= this.intensity;
      const born = this.born[L.id];
      if (born != null) v *= U.clamp((t - born) / this.glide, 0.08, 1);
      if (v < 0.02) return;

      const dur = len * this._sps() * 0.96;
      const inst = MusicInst[L.inst];
      if (!inst) return;
      const base = 12 * (L.oct || 0);
      for (const p of pitches) {
        const f = p == null ? null : this.hz(p + base);
        inst(this, t, f, dur, v, L);
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
    beat() { return null; },
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

  // the owl: the whole orchestra, one layer per phase
  const boss = () => play('boss');
  // the hunt between owls: lighter, with a horn from the trees
  const stage = () => play('stage');
  /* the front door: an overture that starts as the theme and becomes
     an anthem when the caller lifts it — see `main.js` */
  const title = () => play('title', { section: 'gate' });
  // the hill: the main title
  const ceremony = () => play('ceremony');
  /* The dive. It has to be a factory rather than `new Music.Score`: a
     Score built outside this module is not in `LIVE`, and `duckAll` —
     which voice.js calls every time Claudia speaks — would sail past. */
  const dive = () => play('dive');
  // the descent: five gears, and the only one with a kick drum
  const descent = () => play('descent');
  // the boat race, which used to have no music at all
  const boat = () => play('boat', { section: 'count' });
  // the fire
  const finale = () => play('finale', { section: 'arrival' });
  const verdict = finale;
  const journey = (returning = false) => play('journey', { section: returning ? 'home' : 'out' });

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

  const sectionsOf = (cue) => CUES[cue] ? (CUES[cue].gears || Object.keys(CUES[cue].sections)) : [];
  const SKI_GEARS = sectionsOf('descent').map(n => CUES.descent.sections[n]);
  const DIVE_GEARS = sectionsOf('dive').map(n => CUES.dive.sections[n]);
  const GEARS = sectionsOf('boss').map(n => CUES.boss.sections[n]);

  return { title, journey, boss, stage, ceremony, verdict, finale, dive, descent, boat, play,
           duckAll, stopAll, pauseAll, sectionAll, stingerAll, verdictCue,
           Score, SILENT, GEARS, DIVE_GEARS, SKI_GEARS, PROGRESSIONS, STINGERS, CUES,
           get live() { return LIVE; } };
})();

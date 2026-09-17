/* ------------------------------------------------------------------
   music.js — a procedural score, written at runtime.

   There are no audio files anywhere in this game, so a boss theme has
   to be *played* rather than loaded. This is a small step sequencer: a
   clock that wakes up every forty milliseconds, looks a third of a
   second into the future, and books every note that falls inside that
   window with the Web Audio clock. Scheduling ahead is the whole trick —
   notes fired from requestAnimationFrame arrive whenever the frame
   arrives, which is audibly not a beat.

   A score is layers over one chord loop: drums, a bass gallop, a pad,
   the horn theme, and a choir on top. Which layers are switched on, and
   how fast the whole thing runs, is what a phase of the fight *is*. So
   the music does not merely accompany the boss; it is told what the
   boss is doing and answers, and the player hears the fight change one
   beat before they see it.
------------------------------------------------------------------ */
const Music = (() => {

  const ROOT = 36.708;        // D1 — everything is a ratio off this
  const LOOKAHEAD = 0.34;     // seconds of future booked at a time
  const TICK = 40;            // ms between wakeups

  const hz = (semi) => ROOT * Math.pow(2, semi / 12);

  /* Eight bars of D minor that keep leaning somewhere and never quite
     resolving, which is what makes a loop feel like a fight rather than
     a song. The last bar is the dominant, so bar eight always wants bar
     one — the loop point stops being a seam. */
  const PROGRESSIONS = {
    // the fight: eight bars that keep leaning and never resolve
    dread: [
      [0, 3, 7],        // i     Dm
      [0, 3, 7],        // i
      [8, 12, 15],      // VI    Bb
      [5, 8, 12],       // iv    Gm
      [0, 3, 7],        // i
      [10, 14, 17],     // VII   C
      [8, 12, 15],      // VI    Bb
      [7, 11, 14],      // V     A  (harmonic minor: a major five)
    ],

    /* The hill. Same key, opposite argument: it opens onto the relative
       major and keeps going up, so the loop feels like a view rather
       than a threat. Bar eight is the subdominant rather than the
       dominant — it comes home instead of demanding something. */
    hymn: [
      [8, 12, 15],      // VI    Bb   — the wide one, first
      [3, 7, 10],       // III   F
      [5, 8, 12],       // iv    Gm
      [10, 14, 17],     // VII   C
      [8, 12, 15],      // VI    Bb
      [0, 3, 7],        // i     Dm
      [10, 14, 17],     // VII   C
      [5, 8, 12],       // iv    Gm
    ],

    /* The dive. Open fifths with the third left out, so it floats
       instead of resolving — the water is not deciding anything, it is
       just very deep and very bright. Same key as everything else, and
       every bar is an add9 or a sus, which is the whole trick: nothing
       in here ever tells you whether it is happy about the depth. */
    tide: [
      [0,  7, 14],           // D5 add9   — no third at all
      [0,  7, 14],
      [8, 12, 19],           // Bb add9
      [3,  7, 10],           // F
      [5, 12, 17],           // Gm11
      [10, 14, 21],          // C add9
      [8, 12, 15],           // Bb
      [3, 10, 14],           // Fsus2
    ],

    /* The descent. The only loop in the game that is *going* somewhere,
       because the mission it belongs to is the only one where standing
       still is not an option the player has.

       It is built to fall forwards. There is no third in the tonic —
       an open fifth, so the mountain never says whether this is going
       well — and bars three to eight are a plain Bb–C–Gm–C turn, which
       is the oldest driving loop there is and works for exactly the
       reason it always has: the C at the end of bar eight is the one
       chord that cannot sit still, so the loop point stops being a
       seam and starts being a shove. */
    descent: [
      [0,  7, 12],      // D5        — open, no third: the drop-in
      [0,  7, 12],
      [8, 12, 15],      // VI    Bb
      [10, 14, 17],     // VII   C
      [5,  8, 12],      // iv    Gm
      [10, 14, 17],     // VII   C
      [8, 12, 15],      // VI    Bb
      [10, 14, 19],     // VII   Cadd9 — never lands, so eight falls into one
    ],

    /* The fire. Two chords, held, a semitone apart at the top — the
       oldest trick there is for "something is about to be decided". */
    verdict: [
      [0, 3, 7],        // i     Dm
      [0, 3, 7],
      [0, 4, 7],        // I     D  (picardy, and it is not a kindness)
      [0, 3, 7],
      [8, 12, 15],      // VI    Bb
      [8, 12, 15],
      [7, 11, 14],      // V     A
      [7, 11, 14],
    ],
  };
  const CHORDS = PROGRESSIONS.dread;   // the default, and the old behaviour

  /* One bar of sixteenths per layer. The numbers are velocities, and a
     zero is a rest — patterns rather than code, so the difference
     between "circling" and "enraged" is a table edit. */
  const PATTERNS = {
    kick:   [1, 0, 0, 0, .55, 0, 0, .4, 1, 0, 0, 0, .55, 0, .7, 0],
    kickDbl:[1, 0, .5, 0, .7, 0, .5, .4, 1, 0, .5, 0, .7, .5, .8, .6],
    tom:    [0, 0, 0, .5, 0, 0, 0, 0, 0, 0, .5, 0, 0, .7, 0, .8],
    hat:    [0, .3, 0, .35, 0, .3, 0, .35, 0, .3, 0, .35, 0, .3, 0, .45],
    bass:   [1, 0, .7, .7, 0, .8, 0, .7, 1, 0, .7, 0, .8, 0, .7, .6],
  };
  // where the bass sits against the bar's chord, in scale steps
  const BASSNOTE = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -5, 0, 0, 3, 5];

  /* The theme. Sixteen sixteenths — one bar — of horn, stated over the
     tonic and answered a fourth up when the loop comes round again. */
  const THEME = [
    { s: 12, d: 3 }, { s: 15, d: 1 }, { s: 14, d: 2 }, { s: 12, d: 2 },
    { s: 19, d: 3 }, { s: 17, d: 1 }, { s: 15, d: 2 }, { s: 12, d: 2 },
  ];

  // the theme by the sixteenth it starts on, worked out once
  const THEME_AT = (() => {
    const m = {};
    let at = 0;
    for (const n of THEME) { m[at] = n; at += n.d; }
    return m;
  })();

  /* Four gears. `layers` are gains, so a layer at 0 is silent but still
     costs nothing, and the conductor can fade one in over a bar rather
     than switching it on mid-note. */
  const GEARS = [
    { bpm: 84,  kick: .55, tom: .35, hat: 0,   bass: .8,  pad: .55, theme: 0,   choir: 0,  double: false },
    { bpm: 96,  kick: .8,  tom: .55, hat: .35, bass: 1,   pad: .6,  theme: .75, choir: 0,  double: false },
    { bpm: 112, kick: .9,  tom: .7,  hat: .5,  bass: 1,   pad: .6,  theme: .9,  choir: .4, double: false },
    { bpm: 132, kick: 1,   tom: .85, hat: .6,  bass: 1,   pad: .7,  theme: 1,   choir: .8, double: true },
  ];

  /* The dive's four gears, and the one thing that makes them different
     from every other set in this file: **the tempo does not move.**
     The player's stroke window is a beat, so an accelerando between
     phases would silently change the game's timing under their hands.
     Depth adds and removes layers instead, at ninety-six all night. */
  const DIVE_GEARS = [
    { bpm: 96, kick: 0,   tom: 0,   hat: 0,   bass: .55, pad: .9, theme: 0,   choir: .35, double: false },
    { bpm: 96, kick: .5,  tom: .25, hat: .2,  bass: .85, pad: .8, theme: .5,  choir: .45, double: false },
    { bpm: 96, kick: .75, tom: .5,  hat: .4,  bass: 1,   pad: .7, theme: .8,  choir: .6,  double: false },
    { bpm: 96, kick: .9,  tom: .7,  hat: .55, bass: 1,   pad: .6, theme: 1,   choir: .9,  double: true  },
  ];

  /* The descent's five gears, and the one thing that makes them
     different from the dive's: **the tempo is meant to move.** Nothing
     in the skiing is locked to a beat, so the gearbox is free to be
     what a gearbox is for — the band speeds up as the flow ladder
     climbs, and a player at five times money is listening to a
     different, faster piece of music than the one they dropped in to.

     There are five rather than four because the ladder has six rungs
     and a gear change every rung would be a rev limiter. */
  const SKI_GEARS = [
    { bpm: 92,  kick: 0,   tom: 0,   hat: .20, bass: .50, pad: .95, theme: 0,   choir: .35, double: false },
    { bpm: 104, kick: .50, tom: .20, hat: .35, bass: .80, pad: .88, theme: .35, choir: .35, double: false },
    { bpm: 118, kick: .80, tom: .45, hat: .50, bass: 1,   pad: .74, theme: .70, choir: .45, double: false },
    { bpm: 132, kick: .95, tom: .65, hat: .60, bass: 1,   pad: .62, theme: .95, choir: .68, double: true  },
    { bpm: 148, kick: 1,   tom: .85, hat: .72, bass: 1,   pad: .55, theme: 1,   choir: .95, double: true  },
  ];

  class Score {
    constructor(opts = {}) {
      this.ctx = AudioBus.ctx;
      this.dest = AudioBus.bus('music');
      this.ok = !!(this.ctx && this.dest);
      if (!this.ok) return;

      // The same orchestra can play the hunt and the owl without making
      // every raven feel like the end of the world. Stage music holds back
      // the choir, horn and room size; the boss profile uses the full mix.
      this.profile = Object.assign({
        level: 0.9, theme: 1, choir: 1, pad: 1, percussion: 1, reverb: 0.28,
        progression: 'dread',
      }, opts);
      this.chords = PROGRESSIONS[this.profile.progression] || CHORDS;
      /* A score brings its own gearbox if it has one. Without this the
         four gears at the top of the file are the only tempi in the
         game, and a score that has to hold one BPM across a phase
         change — which is what a beat-locked mechanic needs — cannot
         be written at all. */
      this.gears = this.profile.gears || GEARS;

      this.out = this.ctx.createGain();
      this.out.gain.value = 0.0001;

      /* One lowpass between the mix and the bus, sitting wide open
         until somebody asks for it. It is what the surface of the
         water sounds like from underneath, and it costs one node. */
      this.muffle = this.ctx.createBiquadFilter();
      this.muffle.type = 'lowpass';
      this.muffle.frequency.value = 20000;
      this.out.connect(this.muffle);
      this.muffle.connect(this.dest);

      // one shared plate of reverb-ish delay, because a horn in a wood
      // that stops dead the moment it stops sounding is a horn in a box
      this.send = this.ctx.createGain();
      this.send.gain.value = this.profile.reverb;
      const delay = this.ctx.createDelay(0.5);
      delay.delayTime.value = 0.19;
      const fb = this.ctx.createGain();
      fb.gain.value = 0.34;
      const damp = this.ctx.createBiquadFilter();
      damp.type = 'lowpass'; damp.frequency.value = 2200;
      this.send.connect(delay); delay.connect(damp); damp.connect(fb);
      fb.connect(delay); damp.connect(this.out);

      this.gear = 0;
      this.gearFrom = 0;
      this.gearMix = 1;          // 0..1 across a gear change
      this.intensity = 1;
      this.step = 0;             // sixteenths since the score started
      this.next = 0;             // audio time of the next step
      this.paused = false;
      this.timer = null;
    }

    start() {
      if (!this.ok || this.timer) return this;
      this.next = this.ctx.currentTime + 0.08;
      this.t0 = this.next;              // where beat one actually landed
      this.out.gain.cancelScheduledValues(this.ctx.currentTime);
      this.out.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      this.out.gain.exponentialRampToValueAtTime(this.profile.level, this.ctx.currentTime + 1.6);
      this.timer = setInterval(() => this._pump(), TICK);
      return this;
    }

    /* Which gear, and how long to take getting there. A phase change
       crossfades over a couple of beats; the enrage snaps. */
    setGear(i, glide = 2) {
      if (!this.ok) return;
      i = U.clamp(i | 0, 0, this.gears.length - 1);
      if (i === this.gear) return;
      this.gearFrom = this.gear;
      this.gear = i;
      this.gearMix = 0;
      this.glide = Math.max(0.25, glide);
    }

    // an extra shove on top of the gear: how hard the fight is going
    setIntensity(v) { this.intensity = U.clamp(v, 0, 1.5); }

    /* Where the bar is *right now*, as opposed to where the sequencer
       has got to booking it. `this.next` is up to a third of a second
       into the future by design, so it cannot be read as a clock; at a
       constant tempo the phase is exact arithmetic off the moment the
       score started instead. Only meaningful for a score with its own
       gears, which is exactly what promises the tempo will not move. */
    beat() {
      if (!this.ok || !this.t0) return null;
      const spb = 60 / this.gears[this.gear].bpm;
      const since = ((this.ctx.currentTime - this.t0) % spb + spb) % spb;
      return { spb, sinceBeat: since, toBeat: spb - since };
    }

    /* How much water is between the listener and the band. Exponential,
       because hearing is: a linear sweep through a lowpass sounds like
       a knob being turned rather than like going under. */
    setMuffle(v, time = 0.25) {
      if (!this.ok || !this.muffle) return;
      const k = U.clamp(v, 0, 1);
      const hz2 = 20000 * Math.pow(420 / 20000, k);
      const t = this.ctx.currentTime;
      this.muffle.frequency.cancelScheduledValues(t);
      this.muffle.frequency.setValueAtTime(
        Math.max(20, this.muffle.frequency.value), t);
      this.muffle.frequency.exponentialRampToValueAtTime(Math.max(20, hz2), t + time);
    }

    setPaused(v) {
      if (!this.ok || this.paused === v) return;
      this.paused = v;
      const t = this.ctx.currentTime;
      this.out.gain.cancelScheduledValues(t);
      this.out.gain.setTargetAtTime(v ? 0.0001 : this.profile.level, t, 0.12);
      if (!v) this.next = Math.max(this.next, t + 0.06);
    }

    // duck under a screech or a banner without losing the beat
    duck(amount = 0.35, time = 0.9) {
      if (!this.ok || this.paused) return;
      const t = this.ctx.currentTime;
      this.out.gain.cancelScheduledValues(t);
      this.out.gain.setValueAtTime(Math.max(0.0001, this.out.gain.value), t);
      this.out.gain.exponentialRampToValueAtTime(Math.max(0.02, amount), t + 0.08);
      this.out.gain.exponentialRampToValueAtTime(this.profile.level, t + time);
    }

    /* Change what the band is playing without stopping it. The swap
       lands on the next bar line, because a chord that changes halfway
       through one is a mistake rather than a modulation. */
    setProgression(id) {
      const next = PROGRESSIONS[id];
      if (!next || next === this.chords) return;
      this.profile.progression = id;
      this._pending = next;
    }

    stop(fade = 1.2) {
      if (!this.ok) return;
      LIVE.delete(this);
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
      const t = this.ctx.currentTime;
      this.out.gain.cancelScheduledValues(t);
      this.out.gain.setValueAtTime(Math.max(0.0001, this.out.gain.value), t);
      this.out.gain.exponentialRampToValueAtTime(0.0001, t + fade);
      setTimeout(() => {
        try { this.out.disconnect(); } catch (e) {}
        try { if (this.muffle) this.muffle.disconnect(); } catch (e) {}
      }, (fade + 0.4) * 1000);
    }

    /* -------- the clock -------- */

    _gearNow(key) {
      const a = this.gears[this.gearFrom][key], b = this.gears[this.gear][key];
      return typeof a === 'number' ? U.lerp(a, b, this.gearMix) : (this.gearMix > 0.5 ? b : a);
    }

    _pump() {
      if (!this.ok || this.paused) return;
      const now = this.ctx.currentTime;
      // a tab that was in the background comes back with the audio clock
      // hours ahead of where the sequencer got to; catch up rather than
      // spraying every missed note at once
      if (this.next < now - 0.5) this.next = now + 0.05;
      let guard = 0;
      while (this.next < now + LOOKAHEAD && guard++ < 64) {
        const bpm = U.lerp(this.gears[this.gearFrom].bpm, this.gears[this.gear].bpm, this.gearMix);
        const spb = 60 / bpm / 4;              // seconds per sixteenth
        this._play(this.step, this.next);
        this.next += spb;
        this.step++;
        if (this.gearMix < 1) this.gearMix = Math.min(1, this.gearMix + spb / this.glide);
      }
    }

    _play(step, t) {
      const s = step % 16;
      if (s === 0 && this._pending) { this.chords = this._pending; this._pending = null; }
      const bar = Math.floor(step / 16) % this.chords.length;
      const chord = this.chords[bar];
      const root = chord[0];
      const I = this.intensity;
      const dbl = this._gearNow('double');

      const percussion = this.profile.percussion;
      const kick = (dbl ? PATTERNS.kickDbl : PATTERNS.kick)[s] * this._gearNow('kick') * I * percussion;
      if (kick > 0.02) this._kick(t, kick);
      const tom = PATTERNS.tom[s] * this._gearNow('tom') * I * percussion;
      if (tom > 0.02) this._tom(t, tom, 128 + (s % 4) * 22);
      const hat = PATTERNS.hat[s] * this._gearNow('hat') * I * percussion;
      if (hat > 0.02) this._hat(t, hat);

      const bass = PATTERNS.bass[s] * this._gearNow('bass') * I;
      if (bass > 0.02) this._bass(t, hz(root + 12 + BASSNOTE[s]), 0.16, bass);

      // the pad lands on the bar, and holds it
      if (s === 0) {
        const pad = this._gearNow('pad') * this.profile.pad;
        if (pad > 0.02) this._pad(t, chord.map(c => hz(c + 36)), (60 / this.gears[this.gear].bpm) * 4.2, pad);
      }

      // the theme, stated low and answered a fourth up two bars later
      const theme = this._gearNow('theme') * this.profile.theme;
      const note = THEME_AT[s];
      if (theme > 0.02 && note) {
        const lift = (bar % 4) >= 2 ? 5 : 0;
        const spb = 60 / U.lerp(this.gears[this.gearFrom].bpm, this.gears[this.gear].bpm, this.gearMix) / 4;
        this._horn(t, hz(note.s + 36 + lift), note.d * spb * 0.95, theme);
      }

      // and voices, two octaves up, on the half bar
      const choir = this._gearNow('choir') * this.profile.choir;
      if (choir > 0.02 && (s === 0 || s === 8)) {
        const spb = 60 / this.gears[this.gear].bpm / 4;
        this._choir(t, hz(chord[(s ? 2 : 1)] + 48), spb * 7.5, choir);
      }
    }

    /* -------- voices -------- */

    _env(g, t, a, d, peak, hold = 0) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t + a);
      if (hold) g.gain.setValueAtTime(Math.max(0.0001, peak), t + a + hold);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + d);
    }

    _kick(t, v) {
      const c = this.ctx;
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.16);
      o.connect(g); g.connect(this.out);
      this._env(g, t, 0.004, 0.24, 0.5 * v);
      o.start(t); o.stop(t + 0.4);
    }

    // a war drum: pitched noise with a body under it
    _tom(t, v, f) {
      const c = this.ctx;
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.22);
      o.connect(g); g.connect(this.out); g.connect(this.send);
      this._env(g, t, 0.005, 0.3, 0.3 * v);
      o.start(t); o.stop(t + 0.5);
      const n = AudioBus.noiseSource();
      if (!n) return;
      const nf = c.createBiquadFilter(), ng = c.createGain();
      nf.type = 'bandpass'; nf.frequency.value = f * 2.4; nf.Q.value = 0.9;
      n.connect(nf); nf.connect(ng); ng.connect(this.out);
      this._env(ng, t, 0.003, 0.12, 0.16 * v);
      n.start(t); n.stop(t + 0.25);
    }

    _hat(t, v) {
      const c = this.ctx;
      const n = AudioBus.noiseSource();
      if (!n) return;
      const f = c.createBiquadFilter(), g = c.createGain();
      f.type = 'highpass'; f.frequency.value = 6500;
      n.connect(f); f.connect(g); g.connect(this.out);
      this._env(g, t, 0.002, 0.055, 0.075 * v);
      n.start(t); n.stop(t + 0.12);
    }

    _bass(t, f, dur, v) {
      const c = this.ctx;
      const o = c.createOscillator(), o2 = c.createOscillator();
      const g = c.createGain(), lp = c.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t);
      o2.type = 'square'; o2.frequency.setValueAtTime(f / 2, t); o2.detune.value = 6;
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(240 + 1400 * v, t);
      lp.frequency.exponentialRampToValueAtTime(180, t + dur);
      o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(this.out);
      this._env(g, t, 0.006, dur, 0.22 * v);
      o.start(t); o2.start(t); o.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
    }

    // three detuned saws through a slow filter: the bed everything sits on
    _pad(t, freqs, dur, v) {
      const c = this.ctx;
      const g = c.createGain(), lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(500, t);
      lp.frequency.linearRampToValueAtTime(1500, t + dur * 0.4);
      lp.frequency.linearRampToValueAtTime(400, t + dur);
      lp.connect(g); g.connect(this.out); g.connect(this.send);
      for (const f of freqs) {
        for (const det of [-7, 7]) {
          const o = c.createOscillator();
          o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.detune.value = det;
          o.connect(lp); o.start(t); o.stop(t + dur + 0.2);
        }
      }
      this._env(g, t, 0.5, dur * 0.6, 0.055 * v, dur * 0.3);
    }

    // the horn: a saw with a bite on the front and vibrato behind it
    _horn(t, f, dur, v) {
      const c = this.ctx;
      const o = c.createOscillator(), o2 = c.createOscillator();
      const g = c.createGain(), lp = c.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t);
      o2.type = 'sawtooth'; o2.frequency.setValueAtTime(f, t); o2.detune.value = -11;
      const vib = c.createOscillator(), vg = c.createGain();
      vib.type = 'sine'; vib.frequency.value = 5.4; vg.gain.value = f * 0.006;
      vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(700, t);
      lp.frequency.linearRampToValueAtTime(2600, t + 0.08);
      lp.frequency.linearRampToValueAtTime(1100, t + dur);
      o.connect(lp); o2.connect(lp); lp.connect(g);
      g.connect(this.out); g.connect(this.send);
      this._env(g, t, 0.05, dur * 0.5, 0.15 * v, dur * 0.5);
      o.start(t); o2.start(t); vib.start(t);
      o.stop(t + dur + 0.3); o2.stop(t + dur + 0.3); vib.stop(t + dur + 0.3);
    }

    _choir(t, f, dur, v) {
      const c = this.ctx;
      const g = c.createGain(), bp = c.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = f * 1.6; bp.Q.value = 1.6;
      bp.connect(g); g.connect(this.out); g.connect(this.send);
      for (const [type, det, m] of [['triangle', 0, 1], ['sine', 9, 1], ['sine', -9, 2]]) {
        const o = c.createOscillator();
        o.type = type; o.frequency.setValueAtTime(f * m, t); o.detune.value = det;
        o.connect(bp); o.start(t); o.stop(t + dur + 0.3);
      }
      const vib = c.createOscillator(), vg = c.createGain();
      vib.type = 'sine'; vib.frequency.value = 4.8; vg.gain.value = 3.5;
      vib.connect(vg); vg.connect(bp.frequency);
      vib.start(t); vib.stop(t + dur + 0.3);
      this._env(g, t, 0.6, dur * 0.5, 0.085 * v, dur * 0.35);
    }

    /* -------- punctuation --------
       Stingers are played *now*, on top of whatever the loop is doing,
       because the thing they are marking has already happened. */
    stinger(kind) {
      if (!this.ok) return;
      const t = this.ctx.currentTime + 0.01;
      if (kind === 'phase') {
        this._horn(t, hz(24), 0.9, 1.1);
        this._horn(t + 0.02, hz(31), 0.9, 0.9);
        this._tom(t, 1, 96); this._tom(t + 0.16, 0.8, 128);
      } else if (kind === 'stagger') {
        // the fight stops for a beat and so does the score
        this.duck(0.22, 1.5);
        this._tom(t, 1, 84);
        this._choir(t, hz(36), 1.8, 1.2);
        this._choir(t + 0.04, hz(43), 1.8, 0.9);
        this._crash(t, 0.7);
      } else if (kind === 'summon') {
        this._choir(t, hz(35), 1.4, 1.0);       // a flat second under the root
        this._tom(t, 0.9, 70);
        this._tom(t + 0.12, 0.7, 70);
      } else if (kind === 'boon') {
        [0, 7, 12, 16].forEach((s, i) => this._choir(t + i * 0.07, hz(s + 48), 1.1, 0.7));
      } else if (kind === 'hurt') {
        this._tom(t, 0.9, 150);
      } else if (kind === 'down') {
        // the one place the mode turns: a major third over the tonic
        this._crash(t, 1);
        this._tom(t, 1, 70);
        [0, 4, 7, 12].forEach((s, i) => {
          this._horn(t + i * 0.09, hz(s + 24), 2.6, 1.1);
          this._choir(t + i * 0.09, hz(s + 48), 2.8, 1.0);
        });
        this._bass(t, hz(12), 2.4, 1);
      } else if (kind === 'round') {
        // A compact two-note lift: enough to make a new round arrive on a
        // beat, deliberately short of the boss phase fanfare.
        this._tom(t, 0.55 * this.profile.percussion, 118);
        this._horn(t + 0.03, hz(24), 0.5, 0.42 * this.profile.theme);
        this._horn(t + 0.05, hz(31), 0.5, 0.32 * this.profile.theme);
      } else if (kind === 'reveal') {
        /* The pouch has answered. Everything the band has, at once, and
           then a sub that is still going when the crash has gone — the
           room is meant to be ringing while she says the name, so the
           tails are long and the attack is not. */
        this._crash(t, 1.3);
        this._tom(t, 1, 56);
        this._tom(t + 0.085, 0.9, 44);
        [0, 7, 12, 19].forEach((sm, i) => {
          this._horn(t + i * 0.032, hz(sm + 24), 3.2, 1.2 * this.profile.theme);
          this._choir(t + i * 0.045, hz(sm + 48), 3.6, 1.1 * this.profile.choir);
        });
        this._bass(t, hz(0), 3.8, 1.25);
        this._bass(t + 0.02, hz(12), 3.2, 0.85);
      } else if (kind === 'riser-end') {
        // the top of a riser: a single dry hit, so the sweep has somewhere
        // to arrive rather than just stopping
        this._tom(t, 0.9, 64);
        this._crash(t, 0.5);
      } else if (kind === 'chain') {
        /* The dive, at full flow. A short rising figure in fifths on
           the choir with a hat under it — deliberately not a fanfare:
           it has to land inside a bar the player is still swimming to,
           four or five times a run, without ever becoming the thing
           they are listening for instead of the beat. */
        [0, 7, 12, 19].forEach((sm, i) => this._choir(t + i * 0.055, hz(sm + 48), 0.85, 0.55));
        this._hat(t, 0.6);
        this._hat(t + 0.11, 0.45);
      } else if (kind === 'bonus-round') {
        [24, 28, 31, 36].forEach((s, i) =>
          this._horn(t + i * 0.065, hz(s), 0.62, 0.38 * this.profile.theme));
        this._tom(t, 0.48 * this.profile.percussion, 142);
      }
    }

    _crash(t, v) {
      const c = this.ctx;
      const n = AudioBus.noiseSource();
      if (!n) return;
      const f = c.createBiquadFilter(), g = c.createGain();
      f.type = 'highpass'; f.frequency.value = 3200;
      n.connect(f); f.connect(g); g.connect(this.out); g.connect(this.send);
      this._env(g, t, 0.01, 1.6, 0.16 * v);
      n.start(t); n.stop(t + 1.8);
    }
  }

  // a score that does nothing, for when there is no audio context at all
  const SILENT = {
    start() { return this; }, setGear() {}, setIntensity() {}, setPaused() {},
    duck() {}, stinger() {}, stop() {}, setProgression() {}, setMuffle() {},
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

  function duckAll(amount = 0.4, time = 0.9) { LIVE.forEach(s => s.duck(amount, time)); }
  function stopAll(fade = 1.0) { LIVE.forEach(s => s.stop(fade)); LIVE.clear(); }
  function pauseAll(v) { LIVE.forEach(s => s.setPaused(v)); }

  function boss() {
    if (!AudioBus.ready) return SILENT;
    return begin(new Score());
  }

  function stage() {
    if (!AudioBus.ready) return SILENT;
    return begin(new Score({
      level: 0.58,
      theme: 0.58,
      choir: 0,
      pad: 0.82,
      percussion: 0.72,
      reverb: 0.18,
    }));
  }

  /* The hill and the table. Almost no drums — a beat under a welcome
     makes it a trailer — but the room is enormous and the choir is up,
     which is what makes a landscape feel like an occasion. */
  function ceremony() {
    if (!AudioBus.ready) return SILENT;
    return begin(new Score({
      level: 0.50,
      theme: 0.30,
      choir: 0.55,
      pad: 1.0,
      percussion: 0.16,
      reverb: 0.46,
      progression: 'hymn',
    }));
  }

  /* The dive. The only score in the game the player is *inside*: the
     stroke window is a beat, so the tempo cannot move and the gears
     only add and remove layers. The plate is enormous — 0.52 against
     the shootout's 0.18 — because underwater *is* reverb, and the
     percussion is held back because the kick is a metronome the player
     is swimming to rather than a drummer showing off.

     It has to be a factory rather than `new Music.Score(...)` from the
     mission: a Score built outside this module is not in `LIVE`, and
     `duckAll` — which voice.js calls every time Claudia speaks — would
     sail straight past it. */
  function dive() {
    if (!AudioBus.ready) return SILENT;
    return begin(new Score({
      level: 0.62,
      theme: 0.50,
      choir: 0.80,
      pad: 1.0,
      percussion: 0.60,
      reverb: 0.52,
      progression: 'tide',
      gears: DIVE_GEARS,
    }));
  }

  /* The descent. Wide, fast, and built to be interrupted: the mission
     ducks it for the length of every jump, so the band drops away when
     the snow does and slams back in on the landing. That is not a
     flourish — air is the only quiet moment a ski run has, and a score
     that carried on through it would have thrown away the best beat in
     the mission.

     The plate is small. A mountain is not a cave, and reverb on a loop
     this quick is mud. */
  function descent() {
    if (!AudioBus.ready) return SILENT;
    return begin(new Score({
      level: 0.66,
      theme: 0.70,
      choir: 0.62,
      pad: 0.92,
      percussion: 0.92,
      reverb: 0.20,
      progression: 'descent',
      gears: SKI_GEARS,
    }));
  }

  /* The fire. Everything, and it climbs. */
  function verdict() {
    if (!AudioBus.ready) return SILENT;
    return begin(new Score({
      level: 0.86,
      theme: 0.72,
      choir: 1.0,
      pad: 0.9,
      percussion: 1.0,
      reverb: 0.34,
      progression: 'verdict',
    }));
  }

  function journey(returning=false) {
    if (!AudioBus.ready) return SILENT;
    const gears=GEARS.map((g,i)=>({...g,bpm:returning?66+i*2:82+i*4,
      kick:returning?.12:.36,tom:.12,hat:0,bass:.5,pad:.8,theme:.55,choir:.3}));
    return begin(new Score({level:returning?.32:.46,theme:.6,choir:.3,pad:.9,
      percussion:returning?.2:.45,reverb:.28,progression:'hymn',gears}));
  }
  return { journey, boss, stage, ceremony, verdict, dive, descent, duckAll, stopAll, pauseAll,
           Score, GEARS, DIVE_GEARS, SKI_GEARS, PROGRESSIONS };
})();

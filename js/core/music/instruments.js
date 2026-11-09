/* ------------------------------------------------------------------
   music/instruments.js — the orchestra, one function per player.

   Every instrument has the same signature:

       (S, t, f, dur, v, o)

   S    the score playing it (its context, its families, its budget)
   t    audio time the note starts
   f    frequency in Hz (ignored by the unpitched ones)
   dur  seconds the note is held for — the tail is the instrument's own
   v    velocity, roughly 0..1.5
   o    options: the layer spec it came from, so `art`, `fam`, `wet`,
        `vowel` and friends ride along without a second argument list

   Nothing here knows about bars, chords or the game. That is `cues.js`.
   What this file knows is how a note should *start* and *stop*, which
   is most of what makes a synthesized cello sound like a cello: a bow
   has an attack and a vibrato that arrives late; a horn gets brighter
   as it gets louder; a timpani drops in pitch as it rings.
------------------------------------------------------------------ */
const MusicInst = (() => {

  const EPS = 0.0001;
  const rand = (a) => (Math.random() * 2 - 1) * a;

  /* Attack, hold, release — exponential, because hearing is. `hold`
     is how long the note sits at `sus * peak` before it lets go. */
  function ahr(g, t, a, hold, rel, peak, sus = 1) {
    const p = Math.max(EPS, peak);
    g.gain.setValueAtTime(EPS, t);
    g.gain.exponentialRampToValueAtTime(p, t + Math.max(0.002, a));
    if (sus !== 1) g.gain.exponentialRampToValueAtTime(Math.max(EPS, p * sus), t + a + Math.max(0.01, hold * 0.5));
    g.gain.setValueAtTime(Math.max(EPS, p * sus), t + a + hold);
    g.gain.exponentialRampToValueAtTime(EPS, t + a + hold + Math.max(0.02, rel));
    return t + a + hold + rel;
  }

  // one-shot percussive envelope
  function hit(g, t, a, decay, peak) {
    g.gain.setValueAtTime(EPS, t);
    g.gain.exponentialRampToValueAtTime(Math.max(EPS, peak), t + a);
    g.gain.exponentialRampToValueAtTime(EPS, t + a + decay);
    return t + a + decay;
  }

  function osc(c, type, f, t, det = 0) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (det) o.detune.setValueAtTime(det, t);
    return o;
  }

  function route(S, node, o, defFam, defWet) {
    node.connect(S.fam((o && o.fam) || defFam));
    const wet = o && o.wet != null ? o.wet : defWet;
    if (wet > 0.01) node.connect(S.wet(wet));
  }

  /* A bowed vibrato: nothing for the first quarter second, then it
     arrives — which is the single cheapest thing that stops a held saw
     sounding like a test tone. */
  function vibrato(c, t, f, dur, depth, rate, targets) {
    if (dur < 0.35) return null;
    const lfo = osc(c, 'sine', rate + rand(0.3), t);
    const vg = c.createGain();
    vg.gain.setValueAtTime(0, t);
    vg.gain.setValueAtTime(0, t + 0.22);
    vg.gain.linearRampToValueAtTime(f * depth, t + 0.7);
    lfo.connect(vg);
    for (const x of targets) vg.connect(x.frequency);
    lfo.start(t);
    return lfo;
  }

  /* ---------------- strings ----------------
     An ensemble, not a violin: several saws, each a few cents off and
     drifting, through a lowpass that follows the bow. Articulations:

       sustain   a slow bow, vibrato late
       swell     starts almost silent and crescendos to the release
       tremolo   an amplitude flutter at twelve-ish Hz — the dread
       spic      short, off the string: the ostinato

     Three things make it a section rather than a synth pad. A long
     chord in the violins' register is split across two desks, one each
     side of the conductor, so it has width. A line marked legato comes
     with `from` — the pitch it is leaving — and slides onto its note
     without lifting the bow. And on a machine with the room for it, a
     short note starts with the scrape of the hair on the string. */
  function strings(S, t, f, dur, v, o = {}) {
    const art = o.art || 'sustain';
    const n = o.voices || (art === 'spic' ? 2 : 3);
    const c = S.ctx;
    const long = art !== 'spic';
    const slur = long && o.from > 0 && art === 'sustain';
    let a, rel, sus = 1;
    if (art === 'spic') { a = 0.006; rel = 0.09; dur = Math.min(dur, 0.12); }
    else if (art === 'swell') { a = Math.max(0.2, dur * 0.8); rel = 0.5; dur = Math.max(0.05, dur - a); }
    else if (art === 'tremolo') { a = 0.12; rel = 0.35; }
    else { a = o.a || (slur ? 0.07 : 0.22); rel = o.rel || 0.55; sus = 0.85; }
    if (!S.alloc(n + (long ? 2 : 0) + (o.oct8 ? 1 : 0), t + a + dur + rel, o.pri)) return;

    const bright = o.bright || 1;
    const peak = (o.peak || 0.05) * v / Math.sqrt(n);
    const end = t + a + dur + rel;
    const wet = o.wet != null ? o.wet : 0.35;
    const wide = long && n >= 3 && !o.fam && f >= 180;

    let trem = null;
    if (art === 'tremolo') {
      trem = osc(c, 'sine', (o.rate || 12) + rand(0.8), t);
      trem.start(t); trem.stop(end + 0.05);
    }

    // one desk: a filter that follows the bow, an envelope, a seat
    const desk = (fam, share) => {
      const g = c.createGain(), lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.Q.value = 0.6;
      if (art === 'spic') {
        lp.frequency.setValueAtTime(Math.min(12000, f * 9 + 900 * v) * bright, t);
        lp.frequency.exponentialRampToValueAtTime(Math.max(200, f * 3), t + 0.14);
      } else if (art === 'swell') {
        lp.frequency.setValueAtTime(Math.max(200, f * 2), t);
        lp.frequency.exponentialRampToValueAtTime(Math.min(12000, f * (5 + 5 * v) * bright), t + a);
      } else {
        lp.frequency.setValueAtTime(Math.max(200, f * 2.5), t);
        lp.frequency.exponentialRampToValueAtTime(Math.min(12000, f * (4 + 4 * v) * bright), t + a + 0.1);
      }
      ahr(g, t, a, dur, rel, peak * share, sus);
      lp.connect(g);
      let tail = g;
      if (trem) {
        const tg = c.createGain(); tg.gain.value = 0.55;
        const tdepth = c.createGain(); tdepth.gain.value = 0.45;
        trem.connect(tdepth); tdepth.connect(tg.gain);
        g.connect(tg); tail = tg;
      }
      tail.connect(S.fam(fam));
      if (wet > 0.01) tail.connect(S.wet(wet));
      return lp;
    };
    const home = o.fam || (f < 180 ? 'cello' : 'hiStr');
    const A = desk(home, 1);
    const B = wide ? desk('vln2', 1) : A;

    const spread = (o.spread || 1) * 9;
    const oscs = [];
    for (let i = 0; i < n; i++) {
      const det = (n === 1 ? 0 : (i / (n - 1) * 2 - 1) * spread) + rand(3);
      const x = osc(c, 'sawtooth', slur ? o.from : f, t, det);
      // the slide onto the note: quick, and only ever from where the line was
      if (slur) x.frequency.exponentialRampToValueAtTime(f, t + 0.085);
      // each desk drifts a little on its own
      if (long) x.detune.linearRampToValueAtTime(det + rand(5), end);
      x.connect(wide && i % 2 ? B : A); oscs.push(x);
    }
    // the octave above, for a line that has to carry
    if (o.oct8) {
      const x = osc(c, 'sawtooth', f * 2, t, rand(4));
      const xg = c.createGain(); xg.gain.value = 0.35;
      x.connect(xg); xg.connect(A);
      x.start(t); x.stop(end + 0.05);
    }
    const vib = long && art !== 'tremolo' ? vibrato(c, t + (slur ? 0.09 : 0), f, a + dur, 0.0045, 5.2, oscs) : null;
    for (const x of oscs) { x.start(t); x.stop(end + 0.05); }
    if (vib) vib.stop(end + 0.05);

    // the hair on the string
    if (art === 'spic' && S.rich && v > 0.45) {
      const nz = AudioBus.noiseSource();
      if (nz) {
        const bp = c.createBiquadFilter(), ng = c.createGain();
        bp.type = 'bandpass'; bp.frequency.value = Math.min(6000, f * 5); bp.Q.value = 0.9;
        nz.connect(bp); bp.connect(ng);
        hit(ng, t, 0.002, 0.035, 0.035 * v);
        ng.connect(S.fam(home));
        nz.start(t); nz.stop(t + 0.06);
      }
    }
  }

  /* ---------------- pizzicato & harp ----------------
     A pluck is mostly transient: a triangle with its octave, a lowpass
     that shuts in a tenth of a second, and a decay. The harp is the same
     gesture left to ring. */
  function pizz(S, t, f, dur, v, o = {}) {
    const c = S.ctx;
    const harp = !!o.harp;
    const decay = o.decay || (harp ? 1.5 : 0.42);
    if (!S.alloc(2, t + decay, o.pri)) return;
    const g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = harp ? 0.5 : 1.2;
    lp.frequency.setValueAtTime(Math.min(12000, f * (harp ? 14 : 10)), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(160, f * (harp ? 3 : 1.6)), t + (harp ? 0.5 : 0.16));
    const a = osc(c, 'triangle', f, t), b = osc(c, harp ? 'sine' : 'sine', f * 2, t, rand(4));
    const bg = c.createGain(); bg.gain.value = harp ? 0.35 : 0.28;
    a.connect(lp); b.connect(bg); bg.connect(lp); lp.connect(g);
    const end = hit(g, t, 0.003, decay, (o.peak || (harp ? 0.09 : 0.14)) * v);
    route(S, g, o, harp ? 'harp' : 'pizz', harp ? 0.4 : 0.28);
    a.start(t); b.start(t); a.stop(end + 0.05); b.stop(end + 0.05);
  }

  function harp(S, t, f, dur, v, o = {}) { pizz(S, t, f, dur, v, Object.assign({ harp: true }, o)); }

  /* ---------------- brass ----------------
     A horn is a sawtooth whose filter follows the breath: louder is
     brighter, and the front of the note overshoots before it settles.
     The family chain puts a waveshaper after it, which is the rasp.

     `soft` is the horn section proper — round, behind the band, with
     the fundamental under it and no rasp. `art` is how the note is
     blown: 'sfz' hits, drops away and grows back to where it started,
     which is the sound of something about to happen; 'swell' comes
     from nothing and is at its loudest as it stops. */
  function brass(S, t, f, dur, v, o = {}) {
    const c = S.ctx;
    const slow = !!o.slow, soft = !!o.soft;
    const art = o.art || 'norm';
    let a = o.a || (slow ? 0.35 : soft ? 0.09 : 0.045 + 0.04 * (1.2 - Math.min(1.2, v)));
    const rel = o.rel || (slow ? 0.9 : soft ? 0.4 : 0.28);
    if (art === 'swell') { a = Math.max(0.15, dur * 0.85); dur = Math.max(0.05, dur - a); }
    if (!S.alloc(3, t + a + dur + rel, o.pri)) return;
    const g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = slow ? 3 : soft ? 0.8 : 1.4;
    const vv = Math.min(1.3, v);
    const top = Math.min(11000, f * (soft ? 1.5 + 2.6 * vv : 2.4 + 5.5 * vv));
    const peak = (o.peak || 0.06) * v;
    const end = t + a + dur + rel;
    lp.frequency.setValueAtTime(Math.max(120, f * 1.1), t);
    if (art === 'sfz' && dur > 0.4) {
      // the hit, the drop, and the long way back
      lp.frequency.exponentialRampToValueAtTime(top, t + 0.04);
      lp.frequency.exponentialRampToValueAtTime(Math.max(160, top * 0.3), t + 0.2);
      lp.frequency.exponentialRampToValueAtTime(top, t + a + dur);
      g.gain.setValueAtTime(EPS, t);
      g.gain.exponentialRampToValueAtTime(Math.max(EPS, peak), t + 0.035);
      g.gain.exponentialRampToValueAtTime(Math.max(EPS, peak * 0.28), t + 0.2);
      g.gain.exponentialRampToValueAtTime(Math.max(EPS, peak * 1.05), t + a + dur);
      g.gain.exponentialRampToValueAtTime(EPS, end);
    } else {
      lp.frequency.exponentialRampToValueAtTime(top, t + a + (slow ? 0.3 : 0.03));
      lp.frequency.exponentialRampToValueAtTime(Math.max(160, top * (art === 'swell' ? 0.9 : 0.55)), t + a + dur);
      ahr(g, t, a, dur, rel, peak, art === 'swell' ? 1 : 0.8);
    }
    const x1 = osc(c, 'sawtooth', f, t, -5 + rand(2)), x2 = osc(c, 'sawtooth', f, t, 5 + rand(2));
    x1.connect(lp); x2.connect(lp); lp.connect(g);
    const srcs = [x1, x2];
    if (soft) {
      // the body of a horn is its fundamental
      const x3 = osc(c, 'sine', f, t);
      const bg = c.createGain(); bg.gain.value = 0.55;
      x3.connect(bg); bg.connect(lp);
      srcs.push(x3);
    }
    const vib = vibrato(c, t, f, a + dur, 0.0035, 5.0, [x1, x2]);
    route(S, g, o, soft ? 'horn' : 'brass', soft ? 0.42 : 0.3);
    for (const x of srcs) { x.start(t); x.stop(end + 0.05); }
    if (vib) vib.stop(end + 0.05);
  }

  // the horn section: the tune when it is noble rather than angry
  function horn(S, t, f, dur, v, o = {}) {
    brass(S, t, f, dur, v, Object.assign({}, o, { soft: true }));
  }

  // trombones and a tuba: the note and the octave under it, with the rasp up
  function lowBrass(S, t, f, dur, v, o = {}) {
    const q = Object.assign({}, o, { fam: 'lowBrass' });
    brass(S, t, f, dur, v, q);
    brass(S, t, f / 2, dur, v * 0.75, q);
  }

  /* The braam: a low brass cluster that opens slowly, with the octave
     under it. The trailer noise, done with three horns. */
  function braam(S, t, f, dur, v, o = {}) {
    const q = Object.assign({}, o, { slow: true, peak: 0.075, pri: 0, wet: 0.45 });
    brass(S, t, f, dur, v, q);
    brass(S, t + 0.01, f * 1.4983, dur, v * 0.8, q);
    brass(S, t + 0.02, f / 2, dur, v * 0.9, q);
    strings(S, t, f / 2, dur, v * 0.8, { art: 'sustain', a: 0.08, fam: 'cello', pri: 0, voices: 2 });
  }

  /* ---------------- choir ----------------
     Two detuned saws per voice into a shared formant bank for the
     vowel. The banks are per score, per vowel, and per half of the
     choir: the men's formants sit lower and they stand on the left,
     the women on the right, so a chord across both is as wide as the
     stalls. A note is just its sources and an envelope.

     `morph: [from, to]` opens the mouth over the length of the note —
     oo to ah is the sound of a crescendo that means it. */
  function choir(S, t, f, dur, v, o = {}) {
    const c = S.ctx;
    const a = o.a || 0.4, rel = o.rel || 0.9;
    if (!S.alloc(3, t + a + dur + rel, o.pri)) return;
    const g = c.createGain();
    const x1 = osc(c, 'sawtooth', f, t, -7 + rand(3)), x2 = osc(c, 'sawtooth', f, t, 7 + rand(3));
    x1.connect(g); x2.connect(g);
    const end = ahr(g, t, a, dur, rel, (o.peak || 0.07) * v, 0.9);
    const vib = vibrato(c, t, f, a + dur, 0.005, 4.7, [x1, x2]);
    const voice = f < 235 ? 'm' : 'w';
    if (o.morph) {
      const ga = c.createGain(), gb = c.createGain();
      ga.gain.setValueAtTime(1, t); ga.gain.linearRampToValueAtTime(0.05, t + a + dur);
      gb.gain.setValueAtTime(0.05, t); gb.gain.linearRampToValueAtTime(1, t + a + dur);
      g.connect(ga); g.connect(gb);
      ga.connect(S.choirIn(o.morph[0], voice)); gb.connect(S.choirIn(o.morph[1], voice));
    } else g.connect(S.choirIn(o.vowel || 'ah', voice));
    const wet = o.wet != null ? o.wet : 0.55;
    if (wet > 0.01) g.connect(S.wet(wet));
    x1.start(t); x2.start(t); x1.stop(end + 0.05); x2.stop(end + 0.05);
    if (vib) vib.stop(end + 0.05);
  }

  /* The chant: the choir in syllables rather than held chords. Each
     one is short and hard and on a different vowel from the last, with
     a consonant on the front of it — nonsense Latin, which is the only
     kind a trailer has ever needed. Every note booked for the same
     instant sings the same syllable. */
  const SYLLABLES = ['ah', 'oh', 'eh', 'ah', 'oo', 'eh'];
  function chant(S, t, f, dur, v, o = {}) {
    const c = S.ctx;
    const first = S._chantT !== t;
    if (first) { S._chantT = t; S._chantN = ((S._chantN | 0) + 1) % SYLLABLES.length; }
    const hold = Math.min(dur, o.hold || 0.2);
    if (!S.alloc(2, t + hold + 0.2, o.pri)) return;
    const g = c.createGain();
    const x1 = osc(c, 'sawtooth', f, t, -9 + rand(3)), x2 = osc(c, 'sawtooth', f, t, 9 + rand(3));
    x1.connect(g); x2.connect(g);
    const end = ahr(g, t, 0.018, hold, 0.12, (o.peak || 0.1) * v, 0.8);
    g.connect(S.choirIn(o.vowel || SYLLABLES[S._chantN | 0], f < 235 ? 'm' : 'w'));
    const wet = o.wet != null ? o.wet : 0.5;
    if (wet > 0.01) g.connect(S.wet(wet));
    x1.start(t); x2.start(t); x1.stop(end + 0.05); x2.stop(end + 0.05);
    // the consonant: one for the whole chord
    if (first) {
      const nz = AudioBus.noiseSource();
      if (nz) {
        const bp = c.createBiquadFilter(), ng = c.createGain();
        bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 1.2;
        nz.connect(bp); bp.connect(ng);
        hit(ng, t, 0.002, 0.03, 0.05 * v);
        ng.connect(S.fam('choir'));
        nz.start(t); nz.stop(t + 0.06);
      }
    }
  }

  /* ---------------- drums ---------------- */

  // a timpani: sine that drops onto its pitch, its fifth partial, a skin
  function timpani(S, t, f, dur, v, o = {}) {
    const c = S.ctx;
    const decay = o.decay || 1.7;
    if (!S.alloc(3, t + decay, o.pri)) return;
    const g = c.createGain();
    const a = osc(c, 'sine', f * 1.3, t);
    a.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    const b = osc(c, 'sine', f * 1.5, t);
    const bg = c.createGain(); hit(bg, t, 0.003, decay * 0.4, 0.35);
    a.connect(g); b.connect(bg); bg.connect(g);
    const end = hit(g, t, 0.004, decay, (o.peak || 0.42) * v);
    route(S, g, o, 'perc', 0.4);
    a.start(t); b.start(t); a.stop(end + 0.05); b.stop(end + 0.05);
    const n = AudioBus.noiseSource();
    if (n) {
      const bp = c.createBiquadFilter(), ng = c.createGain();
      bp.type = 'bandpass'; bp.frequency.value = 380; bp.Q.value = 1.1;
      n.connect(bp); bp.connect(ng);
      hit(ng, t, 0.002, 0.08, 0.18 * v);
      route(S, ng, o, 'perc', 0.3);
      n.start(t); n.stop(t + 0.15);
    }
  }

  // a roll that crescendos into nothing — the hit is the caller's
  function timpaniRoll(S, t, f, len, v, o = {}) {
    const n = Math.max(3, Math.floor(len * 13));
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      timpani(S, t + (i / n) * len + rand(0.006), f, 0, v * (0.18 + 0.7 * k * k),
              Object.assign({}, o, { decay: 0.35, pri: 0 }));
    }
  }

  // a taiko: lower, drier, more skin
  function taiko(S, t, f, dur, v, o = {}) {
    const c = S.ctx;
    const fr = o.f || f || 62;
    if (!S.alloc(3, t + 0.95, o.pri)) return;
    const g = c.createGain();
    const a = osc(c, 'sine', fr * 2.2, t);
    a.frequency.exponentialRampToValueAtTime(fr, t + 0.07);
    const b = osc(c, 'triangle', fr * 1.6, t);
    const bg = c.createGain(); hit(bg, t, 0.002, 0.18, 0.4);
    a.connect(g); b.connect(bg); bg.connect(g);
    const end = hit(g, t, 0.003, 0.85, (o.peak || 0.5) * v);
    route(S, g, o, 'perc', 0.45);
    a.start(t); b.start(t); a.stop(end + 0.05); b.stop(end + 0.05);
    const n = AudioBus.noiseSource();
    if (n) {
      const lp = c.createBiquadFilter(), ng = c.createGain();
      lp.type = 'lowpass'; lp.frequency.value = 1300;
      n.connect(lp); lp.connect(ng);
      hit(ng, t, 0.002, 0.13, 0.26 * v);
      route(S, ng, o, 'perc', 0.4);
      n.start(t); n.stop(t + 0.2);
    }
  }

  // the floor falling out: a sub sweep with rumble under it
  function boom(S, t, f, dur, v, o = {}) {
    const c = S.ctx;
    const len = o.len || 2.8;
    if (!S.alloc(2, t + len, 0)) return;
    const g = c.createGain();
    const a = osc(c, 'sine', 120, t);
    a.frequency.exponentialRampToValueAtTime(28, t + len * 0.7);
    a.connect(g);
    const end = hit(g, t, 0.006, len, (o.peak || 0.62) * v);
    route(S, g, o, 'sub', 0.2);
    a.start(t); a.stop(end + 0.05);
    const n = AudioBus.noiseSource();
    if (n) {
      const lp = c.createBiquadFilter(), ng = c.createGain();
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(420, t);
      lp.frequency.exponentialRampToValueAtTime(90, t + len * 0.6);
      n.connect(lp); lp.connect(ng);
      hit(ng, t, 0.004, len * 0.7, 0.3 * v);
      route(S, ng, o, 'perc', 0.35);
      n.start(t); n.stop(t + len);
    }
  }

  function kick(S, t, f, dur, v, o = {}) {
    const c = S.ctx;
    if (!S.alloc(1, t + 0.4, o.pri)) return;
    const g = c.createGain();
    const a = osc(c, 'sine', 160, t);
    a.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    a.connect(g);
    const end = hit(g, t, 0.003, 0.3, (o.peak || 0.55) * v);
    route(S, g, o, 'perc', 0.05);
    a.start(t); a.stop(end + 0.05);
  }

  function snare(S, t, f, dur, v, o = {}) {
    const c = S.ctx;
    if (!S.alloc(2, t + 0.3, o.pri)) return;
    const n = AudioBus.noiseSource();
    if (!n) return;
    const bp = c.createBiquadFilter(), g = c.createGain();
    bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 0.7;
    n.connect(bp); bp.connect(g);
    hit(g, t, 0.002, 0.2, (o.peak || 0.2) * v);
    const b = osc(c, 'triangle', 190, t), bg = c.createGain();
    b.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    b.connect(bg); bg.connect(g);
    hit(bg, t, 0.002, 0.1, 0.5);
    route(S, g, o, 'perc', 0.3);
    n.start(t); n.stop(t + 0.3); b.start(t); b.stop(t + 0.2);
  }

  function hat(S, t, f, dur, v, o = {}) {
    const c = S.ctx;
    if (!S.alloc(1, t + 0.1, o.pri == null ? 2 : o.pri)) return;
    const n = AudioBus.noiseSource();
    if (!n) return;
    const hp = c.createBiquadFilter(), g = c.createGain();
    hp.type = 'highpass'; hp.frequency.value = 7000;
    n.connect(hp); hp.connect(g);
    hit(g, t, 0.002, o.open ? 0.22 : 0.05, (o.peak || 0.07) * v);
    route(S, g, o, 'perc', 0.1);
    n.start(t); n.stop(t + 0.3);
  }

  function tom(S, t, f, dur, v, o = {}) {
    const c = S.ctx;
    if (!S.alloc(2, t + 0.5, o.pri)) return;
    const fr = o.f || f || 120;
    const g = c.createGain();
    const a = osc(c, 'triangle', fr * 1.2, t);
    a.frequency.exponentialRampToValueAtTime(fr * 0.6, t + 0.25);
    a.connect(g);
    const end = hit(g, t, 0.004, 0.35, (o.peak || 0.3) * v);
    route(S, g, o, 'perc', 0.35);
    a.start(t); a.stop(end + 0.05);
  }

  function crash(S, t, f, dur, v, o = {}) {
    const c = S.ctx;
    if (!S.alloc(2, t + 3, 0)) return;
    const n = AudioBus.noiseSource();
    if (!n) return;
    const hp = c.createBiquadFilter(), g = c.createGain();
    hp.type = 'highpass'; hp.frequency.value = 3200;
    const bp = c.createBiquadFilter(), bg = c.createGain();
    bp.type = 'bandpass'; bp.frequency.value = 6800; bp.Q.value = 2;
    n.connect(hp); hp.connect(g); n.connect(bp); bp.connect(bg);
    hit(g, t, 0.006, o.len || 2.4, (o.peak || 0.13) * v);
    hit(bg, t, 0.02, (o.len || 2.4) * 1.2, 0.05 * v);
    route(S, g, o, 'perc', 0.45); route(S, bg, o, 'perc', 0.5);
    n.start(t); n.stop(t + (o.len || 2.4) * 1.3);
  }

  /* A reverse cymbal that *ends* at tEnd — which is the only way a
     swell can arrive on a downbeat instead of near one. */
  function revCymbal(S, tEnd, len, v, o = {}) {
    const c = S.ctx;
    const t = Math.max(c.currentTime + 0.01, tEnd - len);
    if (tEnd - t < 0.15) return;
    if (!S.alloc(1, tEnd + 0.1, 0)) return;
    const n = AudioBus.noiseSource();
    if (!n) return;
    const hp = c.createBiquadFilter(), g = c.createGain();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(1800, t);
    hp.frequency.exponentialRampToValueAtTime(6500, tEnd);
    n.connect(hp); hp.connect(g);
    g.gain.setValueAtTime(EPS, t);
    g.gain.exponentialRampToValueAtTime((o.peak || 0.12) * v, tEnd);
    g.gain.exponentialRampToValueAtTime(EPS, tEnd + 0.04);
    route(S, g, o, 'perc', 0.3);
    n.start(t); n.stop(tEnd + 0.1);
  }

  /* ---------------- bells, celesta, piano ----------------
     FM: a sine modulated by a sine at an inharmonic ratio, with the
     modulation dying faster than the note — so it strikes bright and
     rings pure. 3.5 is a bell; 1.4 a tolling one; 4 a music box. */
  function bell(S, t, f, dur, v, o = {}) {
    const c = S.ctx;
    const decay = o.decay || 2.6;
    if (!S.alloc(2, t + decay, o.pri)) return;
    const car = osc(c, 'sine', f, t), mod = osc(c, 'sine', f * (o.ratio || 3.5), t);
    const mg = c.createGain();
    mg.gain.setValueAtTime(f * (o.index || 2.4) * Math.min(1.4, v), t);
    mg.gain.exponentialRampToValueAtTime(Math.max(0.5, f * 0.05), t + decay * 0.45);
    mod.connect(mg); mg.connect(car.frequency);
    const g = c.createGain();
    car.connect(g);
    const end = hit(g, t, 0.002, decay, (o.peak || 0.07) * v);
    route(S, g, o, 'bell', 0.5);
    car.start(t); mod.start(t); car.stop(end + 0.05); mod.stop(end + 0.05);
  }

  function celesta(S, t, f, dur, v, o = {}) {
    bell(S, t, f, dur, v, Object.assign({ ratio: 4, index: 1.1, decay: 1.4, peak: 0.06 }, o));
  }

  /* A felt piano: four partials, each with its own decay, the top ones
     dying first. It is a lot of note for four oscillators. */
  function piano(S, t, f, dur, v, o = {}) {
    const c = S.ctx;
    const k = f < 200 ? 1.4 : 1;
    const decays = [3.2 * k, 1.8 * k, 1.0, 0.55];
    const amps = [1, 0.42, 0.2, 0.08];
    if (!S.alloc(4, t + decays[0], o.pri)) return;
    const g = c.createGain(); g.gain.value = (o.peak || 0.09) * v;
    for (let i = 0; i < 4; i++) {
      const x = osc(c, 'sine', f * (i + 1) * (1 + i * 0.0009), t, rand(2));
      const pg = c.createGain();
      hit(pg, t, 0.003, decays[i], amps[i]);
      x.connect(pg); pg.connect(g);
      x.start(t); x.stop(t + decays[i] + 0.05);
    }
    route(S, g, o, 'piano', 0.42);
  }

  /* ---------------- bass & pulse ---------------- */

  function synthBass(S, t, f, dur, v, o = {}) {
    const c = S.ctx;
    if (!S.alloc(2, t + dur + 0.15, o.pri)) return;
    const x1 = osc(c, 'sawtooth', f, t), x2 = osc(c, 'square', f / 2, t, 6);
    const g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 2;
    lp.frequency.setValueAtTime(260 + 1300 * Math.min(1.2, v), t);
    lp.frequency.exponentialRampToValueAtTime(170, t + Math.max(0.06, dur));
    x1.connect(lp); x2.connect(lp); lp.connect(g);
    const end = hit(g, t, 0.005, Math.max(0.08, dur), (o.peak || 0.16) * v);
    route(S, g, o, 'bass', 0.04);
    x1.start(t); x2.start(t); x1.stop(end + 0.05); x2.stop(end + 0.05);
  }

  /* The heartbeat, in the band now rather than on its own timer — so
     it lands on the beat the strings are counting. Lub, dub. */
  function heartbeat(S, t, f, dur, v, o = {}) {
    const c = S.ctx;
    if (!S.alloc(2, t + 0.6, o.pri)) return;
    for (const [at, amp] of [[0, 1], [0.2, 0.62]]) {
      const x = osc(c, 'sine', 80, t + at);
      x.frequency.exponentialRampToValueAtTime(34, t + at + 0.17);
      const g = c.createGain();
      x.connect(g);
      hit(g, t + at, 0.012, 0.25, (o.peak || 0.55) * v * amp);
      route(S, g, o, 'perc', 0.08);
      x.start(t + at); x.stop(t + at + 0.32);
    }
  }

  function pulse(S, t, f, dur, v, o = {}) {
    const c = S.ctx;
    if (!S.alloc(1, t + 0.4, o.pri)) return;
    const x = osc(c, 'sine', (f || 73.4) * 1.6, t);
    x.frequency.exponentialRampToValueAtTime(f || 73.4, t + 0.05);
    const g = c.createGain();
    x.connect(g);
    const end = hit(g, t, 0.004, 0.32, (o.peak || 0.4) * v);
    route(S, g, o, 'perc', 0.1);
    x.start(t); x.stop(end + 0.05);
  }

  /* ---------------- the big percussion ----------------
     What a film has that a pit band has not: drums in threes, a bass
     drum the size of a door, metal, and a floor that drops. The big
     ones ask the score to pump the pads (`S.pump`) — the strings and
     the choir step back for a quarter of a second, and the hit sounds
     larger than the room it is in. */

  // three taikos, not quite together: one player cannot make this sound
  function taikoEns(S, t, f, dur, v, o = {}) {
    const c = S.ctx;
    if (!S.alloc(4, t + 1.1, o.pri)) return;
    const g = c.createGain(); g.gain.value = 1;
    for (const [d, fr, amp] of [[0, 58, 1], [0.012, 67, 0.8], [0.027, 50, 0.9]]) {
      const x = osc(c, 'sine', fr * 2.3, t + d);
      x.frequency.exponentialRampToValueAtTime(fr, t + d + 0.08);
      const xg = c.createGain();
      x.connect(xg); xg.connect(g);
      hit(xg, t + d, 0.003, 0.9, (o.peak || 0.4) * v * amp);
      x.start(t + d); x.stop(t + d + 1);
    }
    route(S, g, o, 'perc', 0.5);
    const n = AudioBus.noiseSource();
    if (n) {
      const lp = c.createBiquadFilter(), ng = c.createGain();
      lp.type = 'lowpass'; lp.frequency.value = 1500;
      n.connect(lp); lp.connect(ng);
      hit(ng, t, 0.002, 0.17, 0.3 * v);
      route(S, ng, o, 'perc', 0.45);
      n.start(t); n.stop(t + 0.25);
    }
    if (v >= 0.8 && S.pump) S.pump(t, 0.3);
  }

  // the gran cassa: one soft enormous note, mostly felt
  function granCassa(S, t, f, dur, v, o = {}) {
    const c = S.ctx;
    const decay = o.decay || 1.8;
    if (!S.alloc(2, t + decay, o.pri)) return;
    const g = c.createGain();
    const a = osc(c, 'sine', 74, t);
    a.frequency.exponentialRampToValueAtTime(37, t + 0.22);
    const b = osc(c, 'triangle', 96, t);
    b.frequency.exponentialRampToValueAtTime(52, t + 0.15);
    const bg = c.createGain(); hit(bg, t, 0.004, 0.3, 0.3);
    a.connect(g); b.connect(bg); bg.connect(g);
    const end = hit(g, t, 0.008, decay, (o.peak || 0.6) * v);
    route(S, g, o, 'sub', 0.3);
    a.start(t); b.start(t); a.stop(end + 0.05); b.stop(end + 0.05);
    if (v >= 0.7 && S.pump) S.pump(t, 0.35, 0.3);
  }

  // an anvil: partials that do not belong to each other, and a click
  function anvil(S, t, f, dur, v, o = {}) {
    const c = S.ctx;
    if (!S.alloc(4, t + 1.0, o.pri)) return;
    const base = o.f || 540;
    const g = c.createGain(); g.gain.value = (o.peak || 0.07) * v;
    [[1, 0.9, 1], [2.76, 0.6, 0.6], [5.4, 0.35, 0.4], [8.93, 0.2, 0.25]].forEach(([m, decay, amp]) => {
      const x = osc(c, 'sine', base * m, t, rand(6));
      const xg = c.createGain();
      x.connect(xg); xg.connect(g);
      hit(xg, t, 0.001, decay, amp);
      x.start(t); x.stop(t + decay + 0.05);
    });
    route(S, g, o, 'metal', 0.45);
    const n = AudioBus.noiseSource();
    if (n) {
      const hp = c.createBiquadFilter(), ng = c.createGain();
      hp.type = 'highpass'; hp.frequency.value = 4200;
      n.connect(hp); hp.connect(ng);
      hit(ng, t, 0.001, 0.03, 0.09 * v);
      route(S, ng, o, 'metal', 0.3);
      n.start(t); n.stop(t + 0.06);
    }
  }

  // a snare roll that crescendos into nothing — the hit is the caller's
  function snareRoll(S, t, f, len, v, o = {}) {
    const n = Math.max(4, Math.floor(len * 18));
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      snare(S, t + (i / n) * len + rand(0.004), 0, 0, v * (0.2 + 0.8 * k * k), Object.assign({}, o, { pri: 0 }));
    }
  }

  /* The sub drop: the floor going out from under a reveal. A sine that
     falls two octaves, with a little of the octave above it so that a
     phone, which cannot play the note, can at least play its shadow. */
  function subDrop(S, t, f, dur, v, o = {}) {
    const c = S.ctx;
    const len = o.len || 2.6;
    if (!S.alloc(2, t + len, 0)) return;
    const g = c.createGain();
    const a = osc(c, 'sine', 98, t);
    a.frequency.exponentialRampToValueAtTime(26, t + len * 0.8);
    const b = osc(c, 'triangle', 196, t);
    b.frequency.exponentialRampToValueAtTime(52, t + len * 0.8);
    const bg = c.createGain(); bg.gain.value = 0.22;
    a.connect(g); b.connect(bg); bg.connect(g);
    const end = hit(g, t, 0.02, len, (o.peak || 0.7) * v);
    route(S, g, o, 'sub', 0.15);
    a.start(t); b.start(t); a.stop(end + 0.05); b.stop(end + 0.05);
    if (S.pump) S.pump(t, 0.4, 0.4);
  }

  // the opposite of a riser: a chord that falls away after the blow
  function downer(S, t, f, dur, v, o = {}) {
    const c = S.ctx;
    const len = o.len || 1.6;
    const base = f || 146.8;
    if (!S.alloc(3, t + len, o.pri)) return;
    const g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 1.5;
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + len);
    lp.connect(g);
    const end = hit(g, t, 0.01, len, (o.peak || 0.11) * v);
    for (const m of [1, 1.4983, 2]) {
      const x = osc(c, 'sawtooth', base * m, t, rand(5));
      x.frequency.exponentialRampToValueAtTime(base * m / 2, t + len);
      x.connect(lp);
      x.start(t); x.stop(end + 0.05);
    }
    route(S, g, o, 'synth', 0.4);
  }

  // air going past: a band of noise that sweeps up and back
  function whoosh(S, t, f, dur, v, o = {}) {
    const c = S.ctx;
    const len = o.len || 0.55;
    if (!S.alloc(1, t + len, o.pri == null ? 2 : o.pri)) return;
    const n = AudioBus.noiseSource();
    if (!n) return;
    const bp = c.createBiquadFilter(), g = c.createGain();
    bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(5200, t + len * 0.6);
    bp.frequency.exponentialRampToValueAtTime(900, t + len);
    n.connect(bp); bp.connect(g);
    g.gain.setValueAtTime(EPS, t);
    g.gain.exponentialRampToValueAtTime((o.peak || 0.12) * v, t + len * 0.6);
    g.gain.exponentialRampToValueAtTime(EPS, t + len);
    route(S, g, o, 'perc', 0.35);
    n.start(t); n.stop(t + len + 0.05);
  }

  // the clock: a woodblock, tick high and tock low
  function tick(S, t, f, dur, v, o = {}) {
    const c = S.ctx;
    if (!S.alloc(2, t + 0.12, o.pri)) return;
    const fr = o.tock ? 780 : 1060;
    const g = c.createGain();
    const a = osc(c, 'sine', fr, t), b = osc(c, 'triangle', fr * 2.4, t);
    const bg = c.createGain(); hit(bg, t, 0.001, 0.02, 0.5);
    a.connect(g); b.connect(bg); bg.connect(g);
    const end = hit(g, t, 0.001, 0.06, (o.peak || 0.16) * v);
    route(S, g, o, 'perc', 0.28);
    a.start(t); b.start(t); a.stop(end + 0.05); b.stop(end + 0.05);
  }

  /* The ticking synth: the pulse under every heist and every countdown
     of the last twenty years. A saw and a square through a filter that
     snaps shut — nearly all attack. */
  function ostSynth(S, t, f, dur, v, o = {}) {
    const c = S.ctx;
    if (!S.alloc(2, t + 0.2, o.pri)) return;
    const x1 = osc(c, 'sawtooth', f, t, -6), x2 = osc(c, 'square', f, t, 6);
    const g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 6;
    lp.frequency.setValueAtTime(Math.min(9000, f * 9 * (0.6 + 0.6 * Math.min(1.2, v))), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(120, f * 1.6), t + 0.07);
    x1.connect(lp); x2.connect(lp); lp.connect(g);
    const end = hit(g, t, 0.003, 0.11, (o.peak || 0.1) * v);
    route(S, g, o, 'synth', 0.14);
    x1.start(t); x2.start(t); x1.stop(end + 0.05); x2.stop(end + 0.05);
  }

  /* ---------------- colour ----------------
     The instruments that say where this is: a whistle and the pipes
     for Scotland, a hammered dulcimer for the castle at work, glass
     for the castle at night. */

  // a tin whistle: a sine with breath in it, scooped up to from below
  function whistle(S, t, f, dur, v, o = {}) {
    const c = S.ctx;
    const a = 0.035, rel = 0.1;
    if (!S.alloc(2, t + a + dur + rel, o.pri)) return;
    const g = c.createGain();
    const x = osc(c, 'sine', f * 0.94, t), x2 = osc(c, 'sine', f * 2 * 0.94, t);
    x.frequency.exponentialRampToValueAtTime(f, t + 0.045);
    x2.frequency.exponentialRampToValueAtTime(f * 2, t + 0.045);
    const hg = c.createGain(); hg.gain.value = 0.13;
    x.connect(g); x2.connect(hg); hg.connect(g);
    const end = ahr(g, t, a, dur, rel, (o.peak || 0.075) * v, 0.9);
    const vib = vibrato(c, t, f, a + dur, 0.006, 5.6, [x]);
    route(S, g, o, 'wind', 0.4);
    x.start(t); x2.start(t); x.stop(end + 0.05); x2.stop(end + 0.05);
    if (vib) vib.stop(end + 0.05);
    const n = AudioBus.noiseSource();
    if (n) {
      const bp = c.createBiquadFilter(), ng = c.createGain();
      bp.type = 'bandpass'; bp.frequency.value = Math.min(9000, f * 2.2); bp.Q.value = 3;
      n.connect(bp); bp.connect(ng);
      ahr(ng, t, 0.01, dur, 0.06, 0.02 * v, 0.6);
      route(S, ng, o, 'wind', 0.3);
      n.start(t); n.stop(end + 0.05);
    }
  }

  /* The chanter of the pipes: a reed, so no attack to speak of, no
     vibrato, and a grace note cut in at the front of every note because
     a piper cannot stop the air to separate two of them. The family
     chain is the nose. */
  function pipes(S, t, f, dur, v, o = {}) {
    const c = S.ctx;
    const a = 0.02, rel = 0.05;
    if (!S.alloc(2, t + a + dur + rel, o.pri)) return;
    const g = c.createGain();
    const x1 = osc(c, 'sawtooth', f * 1.335, t), x2 = osc(c, 'square', f * 1.335, t, 5);
    x1.frequency.setValueAtTime(f, t + 0.03); x2.frequency.setValueAtTime(f, t + 0.03);
    const sg = c.createGain(); sg.gain.value = 0.45;
    x1.connect(g); x2.connect(sg); sg.connect(g);
    const end = ahr(g, t, a, dur, rel, (o.peak || 0.045) * v, 1);
    route(S, g, o, 'pipes', 0.3);
    x1.start(t); x2.start(t); x1.stop(end + 0.05); x2.stop(end + 0.05);
  }

  // the drones: the key, its octave and the fifth above that, for as long as asked
  function pipeDrone(S, t, f, dur, v, o = {}) {
    const c = S.ctx;
    const a = 0.6, rel = 0.9;
    if (!S.alloc(3, t + a + dur + rel, o.pri)) return;
    const g = c.createGain();
    const end = ahr(g, t, a, dur, rel, (o.peak || 0.028) * v, 1);
    [[1, 1, -3], [2, 0.6, 4], [3, 0.35, 0]].forEach(([m, amp, det]) => {
      const x = osc(c, 'sawtooth', f * m, t, det);
      const xg = c.createGain(); xg.gain.value = amp;
      x.connect(xg); xg.connect(g);
      x.start(t); x.stop(end + 0.05);
    });
    route(S, g, o, 'pipes', 0.35);
  }

  // a hammered dulcimer: two strings a hair apart, struck, left to ring
  function dulcimer(S, t, f, dur, v, o = {}) {
    const c = S.ctx;
    const decay = o.decay || 1.0;
    if (!S.alloc(3, t + decay, o.pri)) return;
    const g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 0.8;
    lp.frequency.setValueAtTime(Math.min(12000, f * 12), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 3), t + 0.28);
    lp.connect(g);
    const end = hit(g, t, 0.002, decay, (o.peak || 0.1) * v);
    [['triangle', 1, 1, 0], ['triangle', 1.003, 0.8, 0], ['sine', 3.004, 0.14, 0]].forEach(([type, m, amp]) => {
      const x = osc(c, type, f * m, t, rand(2));
      const xg = c.createGain(); xg.gain.value = amp;
      x.connect(xg); xg.connect(lp);
      x.start(t); x.stop(end + 0.05);
    });
    route(S, g, o, 'harp', 0.38);
  }

  /* Glass: a wet finger on the rim. Two sines that beat against each
     other, a slow way in and a long way out. `bend` lets the pitch sag
     as it rings, which is a waterphone, and nobody has ever heard one
     of those in a scene where something good was about to happen. */
  function glass(S, t, f, dur, v, o = {}) {
    const c = S.ctx;
    const a = o.a || 0.5, rel = o.rel || 1.6;
    if (!S.alloc(3, t + a + dur + rel, o.pri)) return;
    const g = c.createGain();
    const end = ahr(g, t, a, dur, rel, (o.peak || 0.045) * v, 1);
    [[1, 1], [1.004, 0.8], [2.01, 0.09]].forEach(([m, amp]) => {
      const x = osc(c, 'sine', f * m, t);
      if (o.bend) x.frequency.exponentialRampToValueAtTime(f * m * 0.975, end);
      const xg = c.createGain(); xg.gain.value = amp;
      x.connect(xg); xg.connect(g);
      x.start(t); x.stop(end + 0.05);
    });
    route(S, g, o, 'glass', 0.7);
  }

  // the trailer piano: one low note, its octave under it, and the whole room
  function pianoLow(S, t, f, dur, v, o = {}) {
    const q = Object.assign({ wet: 0.75 }, o);
    piano(S, t, f, dur, v, q);
    piano(S, t, f / 2, dur, v * 0.9, q);
  }

  /* ---------------- the riser ----------------
     Three voices an octave apart, all gliding up an octave: the bottom
     one fades in, the top one fades out, so the ear hears it climb
     without ever hearing where it started — Shepard's trick, which is
     the sound of something that is not going to stop on its own. A
     noise sweep rides over it. Returns a handle, because the riser is
     not resolved: it is *cut*. */
  function shepard(S, t, f, dur, v, o = {}) {
    const c = S.ctx;
    const base = f || 73.42;
    S.alloc(5, t + dur + 0.3, 0);
    const out = c.createGain();
    out.gain.setValueAtTime(EPS, t);
    out.gain.exponentialRampToValueAtTime(0.1 * v, t + dur * 0.55);
    out.gain.exponentialRampToValueAtTime(0.24 * v, t + dur);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 2;
    lp.frequency.setValueAtTime(500, t);
    lp.frequency.exponentialRampToValueAtTime(5200, t + dur);
    lp.connect(out);
    const srcs = [];
    [[1, 'in'], [2, 'flat'], [4, 'out']].forEach(([m, shape]) => {
      const x = osc(c, 'sawtooth', base * m, t, rand(4));
      x.frequency.exponentialRampToValueAtTime(base * m * 2, t + dur);
      const g = c.createGain();
      if (shape === 'in') { g.gain.setValueAtTime(EPS, t); g.gain.exponentialRampToValueAtTime(0.5, t + dur); }
      else if (shape === 'out') { g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.02, t + dur); }
      else g.gain.value = 0.5;
      x.connect(g); g.connect(lp);
      x.start(t); x.stop(t + dur + 0.6);
      srcs.push(x);
    });
    const n = AudioBus.noiseSource();
    if (n) {
      const bp = c.createBiquadFilter(), ng = c.createGain();
      bp.type = 'bandpass'; bp.Q.value = 5;
      bp.frequency.setValueAtTime(300, t);
      bp.frequency.exponentialRampToValueAtTime(7200, t + dur);
      ng.gain.value = 0.9;
      n.connect(bp); bp.connect(ng); ng.connect(out);
      n.start(t); n.stop(t + dur + 0.6);
      srcs.push(n);
    }
    out.connect(S.fam('synth'));
    out.connect(S.wet(0.35));
    return {
      stop(fade = 0.05) {
        const tt = c.currentTime;
        const f = Math.max(0.03, fade);
        out.gain.cancelScheduledValues(tt);
        out.gain.setValueAtTime(Math.max(EPS, out.gain.value), tt);
        out.gain.exponentialRampToValueAtTime(EPS, tt + f);
        for (const s of srcs) { try { s.stop(tt + f + 0.05); } catch (e) {} }
      },
    };
  }

  return {
    strings, pizz, harp, brass, horn, lowBrass, braam, choir, chant,
    timpani, timpaniRoll, taiko, taikoEns, granCassa, anvil, boom, subDrop, downer, whoosh,
    kick, snare, snareRoll, hat, tom, tick, crash, revCymbal,
    bell, celesta, piano, pianoLow, dulcimer, glass, whistle, pipes, pipeDrone,
    synthBass, ostSynth, heartbeat, pulse, shepard,
  };
})();

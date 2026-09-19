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
       spic      short, off the string: the ostinato  */
  function strings(S, t, f, dur, v, o = {}) {
    const art = o.art || 'sustain';
    const n = o.voices || (art === 'spic' ? 2 : 3);
    const c = S.ctx;
    const long = art !== 'spic';
    let a, rel, sus = 1;
    if (art === 'spic') { a = 0.006; rel = 0.09; dur = Math.min(dur, 0.12); }
    else if (art === 'swell') { a = Math.max(0.2, dur * 0.8); rel = 0.5; dur = Math.max(0.05, dur - a); }
    else if (art === 'tremolo') { a = 0.12; rel = 0.35; }
    else { a = o.a || 0.22; rel = o.rel || 0.55; sus = 0.85; }
    if (!S.alloc(n + (long ? 2 : 0), t + a + dur + rel, o.pri)) return;

    const g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 0.6;
    const bright = o.bright || 1;
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
    const peak = (o.peak || 0.05) * v / Math.sqrt(n);
    const end = ahr(g, t, a, dur, rel, peak, sus);

    const spread = (o.spread || 1) * 9;
    const oscs = [];
    for (let i = 0; i < n; i++) {
      const det = (n === 1 ? 0 : (i / (n - 1) * 2 - 1) * spread) + rand(3);
      const x = osc(c, 'sawtooth', f, t, det);
      if (long) {
        // each desk drifts a little on its own
        x.detune.linearRampToValueAtTime(det + rand(5), end);
      }
      x.connect(lp); oscs.push(x);
    }
    let tail = g;
    lp.connect(g);
    let trem = null;
    if (art === 'tremolo') {
      const tg = c.createGain(); tg.gain.value = 0.55;
      trem = osc(c, 'sine', (o.rate || 12) + rand(0.8), t);
      const tdepth = c.createGain(); tdepth.gain.value = 0.45;
      trem.connect(tdepth); tdepth.connect(tg.gain);
      g.connect(tg); tail = tg;
      trem.start(t); trem.stop(end + 0.05);
    }
    const vib = long && art !== 'tremolo' ? vibrato(c, t, f, a + dur, 0.0045, 5.2, oscs) : null;
    route(S, tail, o, f < 180 ? 'cello' : 'hiStr', 0.35);
    for (const x of oscs) { x.start(t); x.stop(end + 0.05); }
    if (vib) vib.stop(end + 0.05);
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
     The family chain puts a waveshaper after it, which is the rasp. */
  function brass(S, t, f, dur, v, o = {}) {
    const c = S.ctx;
    const slow = !!o.slow;
    const a = o.a || (slow ? 0.35 : 0.045 + 0.04 * (1.2 - Math.min(1.2, v)));
    const rel = o.rel || (slow ? 0.9 : 0.28);
    if (!S.alloc(3, t + a + dur + rel, o.pri)) return;
    const g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = slow ? 3 : 1.4;
    const top = Math.min(11000, f * (2.4 + 5.5 * Math.min(1.3, v)));
    lp.frequency.setValueAtTime(Math.max(120, f * 1.1), t);
    lp.frequency.exponentialRampToValueAtTime(top, t + a + (slow ? 0.3 : 0.03));
    lp.frequency.exponentialRampToValueAtTime(Math.max(160, top * 0.55), t + a + dur);
    const x1 = osc(c, 'sawtooth', f, t, -5 + rand(2)), x2 = osc(c, 'sawtooth', f, t, 5 + rand(2));
    x1.connect(lp); x2.connect(lp); lp.connect(g);
    const end = ahr(g, t, a, dur, rel, (o.peak || 0.06) * v, 0.8);
    const vib = vibrato(c, t, f, a + dur, 0.0035, 5.0, [x1, x2]);
    route(S, g, o, 'brass', 0.3);
    x1.start(t); x2.start(t); x1.stop(end + 0.05); x2.stop(end + 0.05);
    if (vib) vib.stop(end + 0.05);
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
     vowel. The bank is one per score per vowel; a note is just its
     sources and an envelope. */
  function choir(S, t, f, dur, v, o = {}) {
    const c = S.ctx;
    const a = o.a || 0.4, rel = o.rel || 0.9;
    if (!S.alloc(3, t + a + dur + rel, o.pri)) return;
    const g = c.createGain();
    const x1 = osc(c, 'sawtooth', f, t, -7 + rand(3)), x2 = osc(c, 'sawtooth', f, t, 7 + rand(3));
    x1.connect(g); x2.connect(g);
    const end = ahr(g, t, a, dur, rel, (o.peak || 0.07) * v, 0.9);
    const vib = vibrato(c, t, f, a + dur, 0.005, 4.7, [x1, x2]);
    g.connect(S.choirIn(o.vowel || 'ah'));
    const wet = o.wet != null ? o.wet : 0.55;
    if (wet > 0.01) g.connect(S.wet(wet));
    x1.start(t); x2.start(t); x1.stop(end + 0.05); x2.stop(end + 0.05);
    if (vib) vib.stop(end + 0.05);
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
    route(S, g, o, 'perc', 0.2);
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
      stop() {
        const tt = c.currentTime;
        out.gain.cancelScheduledValues(tt);
        out.gain.setValueAtTime(Math.max(EPS, out.gain.value), tt);
        out.gain.exponentialRampToValueAtTime(EPS, tt + 0.05);
        for (const s of srcs) { try { s.stop(tt + 0.1); } catch (e) {} }
      },
    };
  }

  return {
    strings, pizz, harp, brass, braam, choir, timpani, timpaniRoll, taiko, boom,
    kick, snare, hat, tom, crash, revCymbal, bell, celesta, piano, synthBass,
    heartbeat, pulse, shepard,
  };
})();

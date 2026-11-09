/* ------------------------------------------------------------------
   music/mix.js — the room the orchestra sits in, and the desk after it.

   The old score had one feedback delay standing in for reverb, and
   everything went straight to the bus. That is most of why it sounded
   like a toy: a string section with no room around it is a buzz, and
   nine layers summed with nothing holding them together is a pile.

   So this file owns three things, all built once per audio context:

     rooms     a real ConvolverNode, with an impulse response written
               here out of decaying stereo noise — no files, still
     master    gentle saturation, then a compressor as glue, then a
               limiter, between every score and the music bus
     families  a small EQ + pan chain per section of the orchestra, so
               celli sit left, violins right and brass in the middle,
               and a note only has to be a source and an envelope; the
               sub has its own limiter, and the pads a gain that ducks
               them under a big drum

   The families are built per *score* (they hang off its output), but
   their specs are data and live here.
------------------------------------------------------------------ */
const MusicMix = (() => {

  const PER_CTX = new WeakMap();

  function state(ctx) {
    let s = PER_CTX.get(ctx);
    if (!s) { s = { irs: {}, masters: new Map() }; PER_CTX.set(ctx, s); }
    return s;
  }

  /* Three rooms. `len` is the tail, `decay` the curve of it, `tone`
     how bright the first reflections are before the air eats the top.
     A cathedral is long and dark; a small room is short and bright. */
  const ROOMS = {
    small:     { len: 1.2, decay: 3.4, pre: 0.006, tone: 6000, early: 5 },
    hall:      { len: 2.8, decay: 2.7, pre: 0.018, tone: 4600, early: 8 },
    cathedral: { len: 4.8, decay: 2.2, pre: 0.032, tone: 3400, early: 10 },
    // a scoring stage: long like the cathedral, but the top survives —
    // the room a film orchestra is recorded in, for the fire and the table
    epic:      { len: 3.9, decay: 1.9, pre: 0.026, tone: 5400, early: 12 },
  };

  /* Stereo noise with an exponential envelope, darkened as it goes by
     a one-pole lowpass whose corner falls through the tail — which is
     what real rooms do, and the difference between "reverb" and "hiss
     that gets quieter". A handful of early reflections on the front
     give it walls. */
  function impulse(ctx, name) {
    const st = state(ctx);
    const key = ROOMS[name] ? name : 'hall';
    if (st.irs[key]) return st.irs[key];
    const R = ROOMS[key];
    const sr = ctx.sampleRate;
    const n = Math.max(1, Math.floor(R.len * sr));
    const pre = Math.floor(R.pre * sr);
    const buf = ctx.createBuffer(2, n, sr);
    let seed = 0x2f6b1a3 ^ key.length * 7919;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296 * 2 - 1;
    };
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let y = 0;
      for (let i = 0; i < n; i++) {
        if (i < pre) { d[i] = 0; continue; }
        const x = (i - pre) / (n - pre);
        const fc = R.tone * (1 - 0.72 * x);
        const a = 1 - Math.exp(-2 * Math.PI * fc / sr);
        y += a * (rnd() - y);
        d[i] = y * Math.pow(1 - x, R.decay) * 1.6;
      }
      // early reflections: a few hard taps, different per ear
      for (let k = 0; k < R.early; k++) {
        const at = pre + Math.floor((0.006 + 0.011 * k + 0.004 * (ch ? 1 : 0) * (k % 3)) * sr);
        if (at < n) d[at] += (0.55 - k * 0.04) * (k % 2 ? -1 : 1);
      }
    }
    st.irs[key] = buf;
    return buf;
  }

  /* The desk. Saturation first — a tanh curve so gentle that it only
     does anything to the peaks, which is exactly where synthesis
     sounds cheapest — then the glue compressor, then a brick wall so
     a reveal with everything in it cannot clip the bus. One per
     destination, shared by every score that plays into it. */
  function master(ctx, dest) {
    const st = state(ctx);
    if (st.masters.has(dest)) return st.masters.get(dest);
    const input = ctx.createGain();
    input.gain.value = 1;

    const shaper = ctx.createWaveShaper();
    const N = 2048, k = 1.25;
    const curve = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = i / (N - 1) * 2 - 1;
      curve[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    shaper.curve = curve;
    shaper.oversample = '2x';

    /* Weight and air. The orchestra is made of sawtooths, which have
       plenty of middle and not much else: a shelf under it for the
       drums and the basses, a little one on top for the room. Bigger
       comes from here and from the writing, never from the fader. */
    const low = ctx.createBiquadFilter();
    low.type = 'lowshelf'; low.frequency.value = 95; low.gain.value = 2.5;
    const air = ctx.createBiquadFilter();
    air.type = 'highshelf'; air.frequency.value = 7200; air.gain.value = 1.5;

    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -20; glue.knee.value = 12; glue.ratio.value = 2.6;
    glue.attack.value = 0.02; glue.release.value = 0.3;

    const wall = ctx.createDynamicsCompressor();
    wall.threshold.value = -3.5; wall.knee.value = 0; wall.ratio.value = 20;
    wall.attack.value = 0.002; wall.release.value = 0.12;

    const makeup = ctx.createGain();
    makeup.gain.value = 1.35;

    input.connect(shaper); shaper.connect(low); low.connect(air); air.connect(glue); glue.connect(makeup);
    makeup.connect(wall); wall.connect(dest);
    st.masters.set(dest, input);
    return input;
  }

  /* The orchestra's seating. `eq` is a list of [type, freq, gain, Q];
     `bite` is a waveshaper drive for the brass, which is what makes a
     sawtooth a horn instead of a sawtooth. */
  const FAMILIES = {
    cello:  { pan: -0.34, eq: [['peaking', 220, 2.5, 0.9], ['highshelf', 2600, -7, 0.7]] },
    hiStr:  { pan: 0.34,  eq: [['peaking', 1400, 1.5, 0.8], ['highshelf', 4800, -6, 0.7], ['highpass', 180, 0, 0.7]], pad: true },
    // the second desk: half of every long string chord sits here, on the
    // other side of the conductor, which is what makes a section wide
    vln2:   { pan: -0.16, eq: [['peaking', 1100, 1.5, 0.8], ['highshelf', 4400, -6, 0.7], ['highpass', 160, 0, 0.7]], pad: true },
    pizz:   { pan: -0.12, eq: [['peaking', 900, 2, 1.0]] },
    harp:   { pan: 0.38,  eq: [['highshelf', 5000, -3, 0.7]] },
    brass:  { pan: 0.08,  eq: [['peaking', 650, 2.5, 0.8], ['highshelf', 3200, -5, 0.7]], bite: 2.2 },
    // horns: round, behind the band, no rasp
    horn:   { pan: -0.22, eq: [['peaking', 420, 2.5, 0.8], ['highshelf', 2200, -8, 0.7]], pad: true },
    // trombones and tuba: the rasp turned up
    lowBrass: { pan: 0.2, eq: [['peaking', 300, 3, 0.8], ['highshelf', 2800, -4, 0.7]], bite: 3.2 },
    choir:  { pan: 0,     eq: [['highpass', 160, 0, 0.7]], pad: true },
    perc:   { pan: 0,     eq: [] },
    bell:   { pan: 0.22,  eq: [['highpass', 220, 0, 0.7]] },
    piano:  { pan: -0.18, eq: [['peaking', 2400, 1.5, 1.0]] },
    bass:   { pan: 0,     eq: [['lowpass', 2400, 0, 0.7]] },
    synth:  { pan: 0.05,  eq: [['highshelf', 5000, -4, 0.7]] },
    wind:   { pan: 0.14,  eq: [['highpass', 300, 0, 0.7], ['highshelf', 6000, -3, 0.7]] },
    // the pipes: all nose
    pipes:  { pan: -0.08, eq: [['peaking', 1150, 7, 2.2], ['peaking', 2500, 4, 2.5], ['highpass', 140, 0, 0.7], ['highshelf', 5200, -8, 0.7]] },
    metal:  { pan: 0.26,  eq: [['highpass', 400, 0, 0.7]] },
    glass:  { pan: -0.26, eq: [['highpass', 260, 0, 0.7], ['highshelf', 7000, -4, 0.7]] },
    /* Everything under a hundred hertz that is not a note: the floor
       dropping, the big drum. It has a limiter of its own, so the sub
       can be as big as it likes without the master pumping the strings
       out of the way to make room for it. */
    sub:    { pan: 0,     eq: [['lowpass', 150, 0, 0.7]], limit: true },
  };

  /* Build one family's chain, ending at `out`. Returns its input. */
  function family(ctx, name, out) {
    const F = FAMILIES[name] || FAMILIES.perc;
    let head = ctx.createGain(), tail = head;
    if (F.bite) {
      const sh = ctx.createWaveShaper();
      const N = 1024, curve = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const x = i / (N - 1) * 2 - 1;
        curve[i] = Math.tanh(F.bite * x) / Math.tanh(F.bite);
      }
      sh.curve = curve;
      tail.connect(sh); tail = sh;
    }
    for (const [type, freq, gain, q] of F.eq) {
      const f = ctx.createBiquadFilter();
      f.type = type; f.frequency.value = freq; f.gain.value = gain; f.Q.value = q;
      tail.connect(f); tail = f;
    }
    if (F.limit) {
      const lim = ctx.createDynamicsCompressor();
      lim.threshold.value = -12; lim.knee.value = 4; lim.ratio.value = 12;
      lim.attack.value = 0.004; lim.release.value = 0.2;
      tail.connect(lim); tail = lim;
    }
    /* The pads step back for a moment when the big drums land — the
       trick that makes a hit sound larger than the mix it is in. The
       gain that does it lives here; `Score.pump` plays it. */
    if (F.pad) {
      const d = ctx.createGain();
      d.gain.value = 1;
      tail.connect(d); tail = d;
      head.padDuck = d;
    }
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = F.pan;
      tail.connect(p); tail = p;
    }
    tail.connect(out);
    return head;
  }

  /* Vowels for the choir, as three formants with relative levels. A
     sawtooth through these is not a human voice, but it is the part of
     one the ear checks first. */
  const VOWELS = {
    ah: [[760, 1, 7], [1180, 0.55, 8], [2700, 0.22, 10]],
    oh: [[520, 1, 7], [880, 0.45, 8], [2500, 0.16, 10]],
    oo: [[340, 1, 6], [720, 0.30, 8], [2400, 0.10, 10]],
    eh: [[560, 1, 7], [1750, 0.5, 9], [2550, 0.2, 10]],
    mm: [[260, 1, 4], [900, 0.10, 6], [2200, 0.04, 8]],
  };

  /* A bank of formants for one vowel. `o.scale` moves the whole throat
     (men's formants sit lower than women's), and `o.pan` seats the
     bank: the men on one side of the stalls, the women on the other. */
  function formant(ctx, vowel, out, o = {}) {
    const V = VOWELS[vowel] || VOWELS.ah;
    const k = o.scale || 1;
    const input = ctx.createGain();
    let dest = out;
    if (o.pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = o.pan;
      p.connect(out);
      dest = p;
    }
    for (const [freq, lvl, q] of V) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = freq * k; bp.Q.value = q;
      const g = ctx.createGain(); g.gain.value = lvl * 3.2;
      input.connect(bp); bp.connect(g); g.connect(dest);
    }
    // a little of the body under the formants, or it is all throat
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 700 * k;
    const lg = ctx.createGain(); lg.gain.value = 0.35;
    input.connect(lp); lp.connect(lg); lg.connect(dest);
    return input;
  }

  return { ROOMS, FAMILIES, VOWELS, impulse, master, family, formant };
})();

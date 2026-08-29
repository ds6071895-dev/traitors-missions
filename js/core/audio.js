/* ------------------------------------------------------------------
   audio.js — fully procedural Web Audio (no asset files).

   Sounds are registered recipes, so a new mission adds its own with
   AudioBus.define('name', fn) and plays it with AudioBus.play('name').
------------------------------------------------------------------ */
const AudioBus = (() => {

  let ctx = null, ready = false;
  let master, busses = {}, noiseBuf = null;
  let muted = false;
  const recipes = {};
  const VOL = { master: 0.85, sfx: 0.9, music: 0.5, ambience: 0.6 };

  function init() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = VOL.master;
    master.connect(ctx.destination);
    for (const k of ['sfx', 'music', 'ambience']) {
      const g = ctx.createGain();
      g.gain.value = VOL[k];
      g.connect(master);
      busses[k] = g;
    }
    // 2s of white noise, reused by every noise-based sound
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    ready = true;
    return ctx;
  }

  function resume() {
    init();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  const now = () => (ctx ? ctx.currentTime : 0);

  function noise() {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf; s.loop = true;
    return s;
  }

  function env(node, t0, a, d, peak = 1, sustain = 0, hold = 0) {
    const g = node.gain;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0001), t0 + a);
    if (hold) g.setValueAtTime(Math.max(peak, 0.0001), t0 + a + hold);
    g.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t0 + a + hold + d);
  }

  function define(name, fn) { recipes[name] = fn; }

  function play(name, opts = {}) {
    if (!ready || muted || !recipes[name]) return null;
    if (ctx.state === 'suspended') ctx.resume();
    try { return recipes[name](ctx, busses[opts.bus || 'sfx'], opts); }
    catch (e) { return null; }
  }

  /* ------------------------------------------------------------------
     Built-in recipes
  ------------------------------------------------------------------ */

  const tone = (type, f, t0, dur, peak, dest, detune = 0) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0); o.detune.value = detune;
    o.connect(g); g.connect(dest);
    env(g, t0, 0.006, dur, peak);
    o.start(t0); o.stop(t0 + dur + 0.1);
    return { o, g };
  };

  define('ui-hover', (c, d) => { tone('sine', 620, now(), 0.09, 0.06, d); });
  define('ui-click', (c, d) => {
    const t = now();
    tone('triangle', 440, t, 0.10, 0.14, d);
    tone('triangle', 880, t + 0.03, 0.14, 0.08, d);
  });

  // ring pass — pitch climbs with the combo so a streak literally rises
  define('hoop', (c, d, o) => {
    const t = now();
    const step = Math.min(o.combo || 0, 12);
    const base = 523.25 * Math.pow(2, step / 12);
    tone('sine', base, t, 0.30, 0.22, d);
    tone('sine', base * 1.5, t + 0.02, 0.36, 0.13, d);
    tone('triangle', base * 2, t + 0.04, 0.24, 0.07, d);
  });

  define('perfect', (c, d, o) => {
    const t = now();
    const step = Math.min(o.combo || 0, 12);
    const base = 659.25 * Math.pow(2, step / 12);
    [1, 1.25, 1.5, 2].forEach((m, i) => tone('sine', base * m, t + i * 0.035, 0.42, 0.16, d));
  });

  define('miss', (c, d) => {
    const t = now();
    tone('sawtooth', 190, t, 0.28, 0.10, d);
    tone('sawtooth', 140, t + 0.06, 0.32, 0.08, d);
  });

  define('boost', (c, d) => {
    const t = now();
    const n = noise(), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass'; f.Q.value = 1.4;
    f.frequency.setValueAtTime(320, t);
    f.frequency.exponentialRampToValueAtTime(4200, t + 0.42);
    n.connect(f); f.connect(g); g.connect(d);
    env(g, t, 0.02, 0.5, 0.5);
    n.start(t); n.stop(t + 0.75);
  });

  define('splash', (c, d, o) => {
    const t = now(), amt = U.clamp(o.amount ?? 1, 0.2, 1.6);
    const n = noise(), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(5200 * amt, t);
    f.frequency.exponentialRampToValueAtTime(420, t + 0.42);
    n.connect(f); f.connect(g); g.connect(d);
    env(g, t, 0.008, 0.45, 0.42 * amt);
    n.start(t); n.stop(t + 0.7);
  });

  define('crash', (c, d, o) => {
    const t = now(), amt = U.clamp(o.amount ?? 1, 0.3, 1.5);
    const n = noise(), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass'; f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(120, t + 0.5);
    n.connect(f); f.connect(g); g.connect(d);
    env(g, t, 0.004, 0.55, 0.7 * amt);
    n.start(t); n.stop(t + 0.8);
    const o1 = c.createOscillator(), g1 = c.createGain();
    o1.type = 'sine'; o1.frequency.setValueAtTime(120, t);
    o1.frequency.exponentialRampToValueAtTime(42, t + 0.35);
    o1.connect(g1); g1.connect(d); env(g1, t, 0.005, 0.4, 0.5 * amt);
    o1.start(t); o1.stop(t + 0.6);
  });

  define('countdown', (c, d, o) => {
    const t = now();
    tone(o.go ? 'triangle' : 'sine', o.go ? 880 : 440, t, o.go ? 0.7 : 0.28, 0.3, d);
    if (o.go) tone('triangle', 1320, t + 0.05, 0.8, 0.2, d);
  });

  define('finish', (c, d) => {
    const t = now();
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      tone('triangle', f, t + i * 0.11, 0.9, 0.22, d);
      tone('sine', f * 2, t + i * 0.11, 0.7, 0.1, d);
    });
  });

  define('money', (c, d, o) => {
    const t = now();
    const n = o.index || 0;
    tone('sine', 880 * Math.pow(2, (n % 6) / 12), t, 0.16, 0.10, d);
  });

  // air rush as the hull punches through a ring
  define('whoosh', (c, d, o) => {
    const t = now(), amt = U.clamp(o.amount ?? 1, 0.2, 1.5);
    const n = noise(), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass'; f.Q.value = 0.9;
    f.frequency.setValueAtTime(500, t);
    f.frequency.exponentialRampToValueAtTime(2600 * amt, t + 0.10);
    f.frequency.exponentialRampToValueAtTime(380, t + 0.38);
    n.connect(f); f.connect(g); g.connect(d);
    env(g, t, 0.02, 0.34, 0.30 * amt);
    n.start(t); n.stop(t + 0.55);
  });

  // the thump when the afterburner lights
  define('boostpop', (c, d) => {
    const t = now();
    const o1 = c.createOscillator(), g1 = c.createGain();
    o1.type = 'sine';
    o1.frequency.setValueAtTime(180, t);
    o1.frequency.exponentialRampToValueAtTime(46, t + 0.26);
    o1.connect(g1); g1.connect(d); env(g1, t, 0.004, 0.30, 0.5);
    o1.start(t); o1.stop(t + 0.4);
    const n = noise(), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'highpass'; f.frequency.setValueAtTime(600, t);
    n.connect(f); f.connect(g); g.connect(d);
    env(g, t, 0.006, 0.30, 0.26);
    n.start(t); n.stop(t + 0.45);
  });

  // rising tone while the boat is in the air
  define('air', (c, d, o) => {
    const t = now(), amt = U.clamp(o.amount ?? 1, 0.3, 2);
    const os = c.createOscillator(), g = c.createGain();
    os.type = 'triangle';
    os.frequency.setValueAtTime(420, t);
    os.frequency.exponentialRampToValueAtTime(420 * (1 + amt * 0.9), t + 0.5);
    os.connect(g); g.connect(d);
    env(g, t, 0.03, 0.5, 0.14);
    os.start(t); os.stop(t + 0.7);
  });

  /* ---------------- continuous sources ---------------- */

  // Engine: a detuned saw pair through a lowpass, plus water rush noise.
  function engine() {
    if (!ready) return { set() {}, stop() {} };
    const t = now();
    const out = c_gain(0.0);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const oscs = [];
    for (const det of [-9, 6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = 60; o.detune.value = det;
      o.connect(lp); o.start(t); oscs.push(o);
    }
    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 30;
    const subG = c_gain(0.5); sub.connect(subG); subG.connect(lp); sub.start(t);
    lp.connect(out);

    const rush = noise();
    const rf = ctx.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 900; rf.Q.value = 0.6;
    const rg = c_gain(0.0);
    rush.connect(rf); rf.connect(rg); rg.connect(busses.sfx); rush.start(t);

    out.connect(busses.sfx);

    function c_gain(v) { const g = ctx.createGain(); g.gain.value = v; return g; }

    return {
      // speed01 = 0..1, load = throttle 0..1, air = 0..1
      set(speed01, load, air = 0) {
        if (!ready) return;
        const tt = now();
        const f = 46 + speed01 * 120 + load * 26;
        for (const o of oscs) o.frequency.setTargetAtTime(f, tt, 0.08);
        sub.frequency.setTargetAtTime(f * 0.5, tt, 0.1);
        lp.frequency.setTargetAtTime(520 + speed01 * 2400 + load * 500, tt, 0.09);
        out.gain.setTargetAtTime((0.055 + speed01 * 0.085) * (1 - air * 0.45), tt, 0.08);
        rg.gain.setTargetAtTime(0.10 * speed01 * speed01 * (1 - air), tt, 0.12);
        rf.frequency.setTargetAtTime(500 + speed01 * 2600, tt, 0.12);
      },
      stop() {
        if (!ready) return;
        const tt = now();
        out.gain.setTargetAtTime(0.0001, tt, 0.12);
        rg.gain.setTargetAtTime(0.0001, tt, 0.12);
        setTimeout(() => {
          try { oscs.forEach(o => o.stop()); sub.stop(); rush.stop(); } catch (e) {}
        }, 600);
      },
    };
  }

  // Sea ambience: slow LFO-swept filtered noise
  function ambience() {
    if (!ready) return { stop() {}, set() {} };
    const t = now();
    const n = noise();
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 480; f.Q.value = 0.4;
    const g = ctx.createGain(); g.gain.value = 0.0;
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.09;
    const lfoG = ctx.createGain(); lfoG.gain.value = 260;
    lfo.connect(lfoG); lfoG.connect(f.frequency);
    n.connect(f); f.connect(g); g.connect(busses.ambience);
    n.start(t); lfo.start(t);
    g.gain.setTargetAtTime(0.35, t, 1.2);
    return {
      set(v) { g.gain.setTargetAtTime(v, now(), 0.5); },
      stop() {
        g.gain.setTargetAtTime(0.0001, now(), 0.6);
        setTimeout(() => { try { n.stop(); lfo.stop(); } catch (e) {} }, 1500);
      },
    };
  }

  function setMuted(v) {
    muted = v;
    if (master) master.gain.setTargetAtTime(v ? 0.0001 : VOL.master, now(), 0.05);
  }
  function toggleMute() { setMuted(!muted); return muted; }
  function setVolume(bus, v) {
    VOL[bus] = v;
    if (bus === 'master' && master) master.gain.value = muted ? 0.0001 : v;
    else if (busses[bus]) busses[bus].gain.value = v;
  }

  return { init, resume, define, play, engine, ambience, setMuted, toggleMute,
           setVolume, get muted() { return muted; }, get ready() { return ready; } };
})();

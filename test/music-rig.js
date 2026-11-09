/* ------------------------------------------------------------------
   music-rig.js — the score, played into a recording AudioContext.

   Shared by the music tests. Nobody can listen to a test, so the
   context here records instead of sounding: every source that starts,
   and when. It also enforces the rules a real browser throws on and a
   test would otherwise never see — an exponential ramp to zero, a
   start time that is not a finite number, a connection to nothing.
------------------------------------------------------------------ */
const H = require('./harness');

/* ---------------- a recording AudioContext ---------------- */

function makeCtx() {
  const log = { starts: [], nodes: 0 };
  const ctx = { currentTime: 0, sampleRate: 8000, log };

  function param(v = 0) {
    const p = {
      value: v,
      setValueAtTime(x, t) { chk(t); fin(x); p.value = x; },
      linearRampToValueAtTime(x, t) { chk(t); fin(x); p.value = x; },
      exponentialRampToValueAtTime(x, t) {
        chk(t); fin(x);
        if (!(x > 0)) throw new Error('exponential ramp to ' + x);
        p.value = x;
      },
      setTargetAtTime(x, t, k) { chk(t); fin(x); fin(k); p.value = x; },
      cancelScheduledValues(t) { chk(t); },
    };
    return p;
  }
  const fin = (x) => { if (!Number.isFinite(x)) throw new Error('non-finite value ' + x); };
  const chk = (t) => { if (!Number.isFinite(t) || t < 0) throw new Error('bad time ' + t); };

  function node(extra = {}) {
    log.nodes++;
    return Object.assign({
      connect(x) { if (!x) throw new Error('connect to nothing'); return x; },
      disconnect() {},
    }, extra);
  }
  function source(kind) {
    const n = node({
      kind, frequency: param(440), detune: param(0), started: null,
      start(t = 0) { chk(t); n.started = t; log.starts.push({ kind, t, n }); },
      stop(t = 0) { chk(t); n.stopped = t; },
    });
    return n;
  }

  Object.assign(ctx, {
    createGain: () => node({ gain: param(1) }),
    createOscillator: () => Object.assign(source('osc'), { type: 'sine' }),
    createBufferSource: () => Object.assign(source('noise'), { buffer: null, loop: false }),
    createBiquadFilter: () => node({ type: 'lowpass', frequency: param(350), Q: param(1), gain: param(0) }),
    createConvolver: () => node({ buffer: null }),
    createWaveShaper: () => node({ curve: null, oversample: 'none' }),
    createStereoPanner: () => node({ pan: param(0) }),
    createDelay: () => node({ delayTime: param(0) }),
    createDynamicsCompressor: () => node({
      threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(),
    }),
    createBuffer: (ch, n) => {
      const data = Array.from({ length: ch }, () => new Float32Array(n));
      return { numberOfChannels: ch, length: n, getChannelData: (i) => data[i] };
    },
  });
  return ctx;
}

function load(voiceChat, extra = {}) {
  const ac = makeCtx();
  const dest = { connect() {}, disconnect() {} };
  const AudioBus = {
    get ctx() { return ac; }, ready: true,
    bus: () => dest,
    noiseSource: () => ac.createBufferSource(),
  };
  const noop = () => 0;
  const G = H.load(['js/core/util.js', 'js/core/music/mix.js', 'js/core/music/instruments.js',
                    'js/core/music/build.js', 'js/core/music/mood.js',
                    'js/core/music/themes.js', 'js/core/music/stingers.js', 'js/core/music/cues.js', 'js/core/music.js'],
                   { AudioBus, setInterval: noop, clearInterval: noop, setTimeout: noop,
                     VoiceChat: voiceChat, ...extra });
  return { G, ac, Music: G.Music };
}

// advance the audio clock, pumping the scheduler as the real timer would
function run(M, ac, seconds, each) {
  const end = ac.currentTime + seconds;
  while (ac.currentTime < end) {
    ac.currentTime += 0.04;
    M.forEach(m => m._pump());
    if (each) each();
  }
}

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

module.exports = { makeCtx, load, run, near };

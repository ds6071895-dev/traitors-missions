/* ------------------------------------------------------------------
   util.js — small maths / random helpers shared across the game
------------------------------------------------------------------ */
const U = (() => {

  // deterministic PRNG so every player races the same course
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeRng(seed) {
    const r = mulberry32(seed);
    r.range = (a, b) => a + (b - a) * r();
    r.int = (a, b) => Math.floor(a + (b - a + 1) * r());
    r.pick = (arr) => arr[Math.floor(r() * arr.length) % arr.length];
    r.sign = () => (r() < 0.5 ? -1 : 1);
    return r;
  }

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  // frame-rate independent exponential smoothing
  const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
  const angLerp = (a, b, t) => {
    let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  };

  // cheap value noise, good enough for shaping terrain silhouettes
  function noise1(x, seed = 0) {
    const i = Math.floor(x), f = x - i;
    const h = (n) => {
      let t = Math.sin((n * 127.1 + seed * 311.7)) * 43758.5453;
      return t - Math.floor(t);
    };
    const u = f * f * (3 - 2 * f);
    return lerp(h(i), h(i + 1), u) * 2 - 1;
  }
  function fbm1(x, oct = 4, seed = 0) {
    let a = 0.5, s = 0, f = 1;
    for (let i = 0; i < oct; i++) { s += a * noise1(x * f, seed + i * 13); a *= 0.5; f *= 2.03; }
    return s;
  }


  const TAU = Math.PI * 2;
  // fold any angle into [-PI, PI] — needed to ask "how level is this boat"
  // of a hull that has just rolled through three full turns
  const wrapAngle = (a) => {
    let x = (a + Math.PI) % TAU;
    if (x < 0) x += TAU;
    return x - Math.PI;
  };

  const money = (n) => '£' + Math.round(n).toLocaleString('en-GB');

  // 1:03.480 — the shape a time-trial player reads at a glance
  function clockTime(sec) {
    const s = Math.max(0, sec);
    const m = Math.floor(s / 60);
    const r = s - m * 60;
    return m + ':' + (r < 10 ? '0' : '') + r.toFixed(2);
  }

  /* ---------------- seeds ---------------- */

  // today's channel, the same for everyone, rolling over at local midnight
  function dailySeed(d = new Date()) {
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }
  const randomSeed = () => 1 + Math.floor(Math.random() * 0x7ffffe);

  // seeds are shared out loud, so they need a name you can say
  const NAME_A = ['Black', 'Cold', 'Glass', 'Iron', 'Storm', 'Silver', 'Bitter',
                  'Red', 'Hollow', 'Broken', 'Salt', 'Winter', 'Grey', 'Thunder',
                  'Quiet', 'Wild', 'Sunken', 'Crooked', 'Wicked', 'Frozen',
                  'Long', 'Bright', 'Drowned', 'Old'];
  const NAME_B = ['Kraken', 'Gannet', 'Selkie', 'Tide', 'Reach', 'Sound', 'Narrows',
                  'Firth', 'Kyle', 'Skerry', 'Cauldron', 'Gully', 'Crossing',
                  'Passage', 'Strand', 'Basin', 'Channel', 'Run', 'Race', 'Gauntlet',
                  'Mile', 'Shoals', 'Teeth', 'Ladder'];
  function courseName(seed) {
    const r = makeRng((seed ^ 0x9e3779b9) >>> 0);
    return r.pick(NAME_A) + ' ' + r.pick(NAME_B);
  }

  return { makeRng, clamp, lerp, smoothstep, damp, angLerp, noise1, fbm1,
           money, clockTime, wrapAngle, TAU, dailySeed, randomSeed, courseName };
})();

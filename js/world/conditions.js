/* ------------------------------------------------------------------
   conditions.js — weather for the world kit.

   Two independent dials, both reusable by any mission that builds a
   sea: what time it is (`TIMES`) and how big the water is (`SEAS`).
   A seed picks a pair; a mission can override either.

   `apply()` has to run *before* Sky.build(), because the mountain haze
   is baked into vertex colours against the fog colour of the day.
------------------------------------------------------------------ */
const Conditions = (() => {

  /* ---------------- time of day ---------------- */

  const TIMES = [
    {
      id: 'noon', name: 'Midday', weight: 3, payout: 1,
      sky: {
        id: 'noon',
        zenith: '#1668d4', middle: '#79cdf4', horizon: '#dff2ff',
        glow: '#ffe4a8', fog: '#c8ebff', sunDir: [0.42, 0.36, -0.83],
      },
      water: { deep: '#04304d', shallow: '#12a6c6', crest: '#8df3e2', sky: '#95dfff', sunCol: '#fff0c4' },
      fog: { near: 460, far: 3200 }, waterFog: { near: 340, far: 3600 },
      lights: {
        sun: ['#fff6de', 1.60], rim: ['#bfe6ff', 0.55],
        hemi: ['#d9f4ff', '#4e9fb4', 1.20], amb: ['#b6e4ff', 0.40],
      },
    },
    {
      id: 'dawn', name: 'First light', weight: 2, payout: 1.05,
      sky: {
        id: 'dawn',
        zenith: '#2a4a86', middle: '#7fa8d8', horizon: '#ffd9b0',
        glow: '#ffbb7a', fog: '#ffd7bd', sunDir: [0.88, 0.12, -0.46],
        sunInner: 'rgba(255,242,218,1)', sunOuter: 'rgba(255,158,88,0.50)', sunScale: 1950,
        cloud: '#ffe2cc', cloudEmissive: '#ffb185', cloudIntensity: 0.52, cloudOpacity: 0.95,
        bird: '#2b2340',
        peakRock: '#4c5c7e', peakGrass: '#2d6b64', peakHaze: 0.50,
        nearRock: '#4a5568', nearGrass: '#2c7a60', nearHaze: 0.30,
        ridgeA: '#6e6faa', ridgeB: '#e6a89c',
      },
      water: { deep: '#0f283f', shallow: '#2f7fa8', crest: '#ffd3ad', sky: '#bcd2ea', sunCol: '#ffd0a0' },
      fog: { near: 420, far: 3000 }, waterFog: { near: 300, far: 3300 },
      lights: {
        sun: ['#ffd6a8', 1.38], rim: ['#8fb6e8', 0.50],
        hemi: ['#cfe0ff', '#3f6d84', 0.98], amb: ['#a6bcda', 0.40],
      },
    },
    {
      id: 'dusk', name: 'Last light', weight: 2, payout: 1.08,
      sky: {
        id: 'dusk',
        zenith: '#24356e', middle: '#7d7ec0', horizon: '#ffb27a',
        glow: '#ff9b52', fog: '#f3b995', sunDir: [-0.82, 0.13, -0.56],
        sunInner: 'rgba(255,236,200,1)', sunOuter: 'rgba(255,120,60,0.52)', sunScale: 2100,
        cloud: '#ffd0bb', cloudEmissive: '#e0794f', cloudIntensity: 0.48, cloudOpacity: 0.96,
        bird: '#241c33',
        peakRock: '#414f74', peakGrass: '#2a5f63', peakHaze: 0.52,
        nearRock: '#414a63', nearGrass: '#286d5c', nearHaze: 0.32,
        ridgeA: '#5f5f9e', ridgeB: '#e79a86',
      },
      water: { deep: '#0a1f34', shallow: '#2a6f9c', crest: '#ffc08a', sky: '#adb8de', sunCol: '#ffb070' },
      fog: { near: 400, far: 2900 }, waterFog: { near: 290, far: 3200 },
      lights: {
        sun: ['#ffc089', 1.34], rim: ['#93a8e0', 0.52],
        hemi: ['#c8d4ff', '#3c5f7c', 0.94], amb: ['#a2b0d6', 0.40],
      },
    },
    {
      id: 'squall', name: 'Squall', weight: 2, payout: 1.15,
      sky: {
        id: 'squall',
        zenith: '#3f5470', middle: '#7f95ab', horizon: '#bcc8d4',
        glow: '#d3dee8', fog: '#b2c0cd', sunDir: [0.30, 0.42, -0.86],
        sunInner: 'rgba(226,238,248,0.75)', sunOuter: 'rgba(180,200,220,0.28)', sunScale: 1500,
        cloud: '#8f9fb0', cloudEmissive: '#4d5f74', cloudIntensity: 0.42, cloudOpacity: 1,
        bird: '#1b2635',
        peakRock: '#4c586c', peakGrass: '#2f6a58', peakHaze: 0.58,
        nearRock: '#4a5464', nearGrass: '#2e7057', nearHaze: 0.38,
        ridgeA: '#6b7c99', ridgeB: '#96a3b6',
      },
      water: { deep: '#0a2532', shallow: '#2c6f80', crest: '#d3e8ec', sky: '#9db1c0', sunCol: '#d8e6f2' },
      fog: { near: 300, far: 2200 }, waterFog: { near: 220, far: 2400 },
      lights: {
        sun: ['#d9e6f2', 1.10], rim: ['#9fb6cc', 0.45],
        hemi: ['#c2d4e2', '#3f5d6c', 0.95], amb: ['#a8bccc', 0.46],
      },
    },
    {
      id: 'night', name: 'Moonlight', weight: 1, payout: 1.25,
      sky: {
        id: 'night',
        zenith: '#050d24', middle: '#0f2450', horizon: '#26456e',
        glow: '#cfe0ff', fog: '#16263f', sunDir: [0.36, 0.54, -0.76],
        sunInner: 'rgba(238,246,255,1)', sunOuter: 'rgba(150,190,255,0.38)', sunScale: 620,
        cloud: '#3b5170', cloudEmissive: '#1e3550', cloudIntensity: 0.5, cloudOpacity: 0.9,
        bird: '#0b1526',
        peakRock: '#2a3650', peakGrass: '#1c3f45', peakHaze: 0.55,
        nearRock: '#26303f', nearGrass: '#1b4440', nearHaze: 0.35,
        ridgeA: '#243459', ridgeB: '#3d4a75',
        starCount: 900,
      },
      water: { deep: '#010f1c', shallow: '#0a4560', crest: '#9fd8ff', sky: '#33547c', sunCol: '#cfe2ff' },
      fog: { near: 260, far: 2000 }, waterFog: { near: 190, far: 2200 },
      lights: {
        sun: ['#b9d2ff', 0.78], rim: ['#6f8ec9', 0.38],
        hemi: ['#4d70a4', '#0d2032', 0.62], amb: ['#6f8ab8', 0.36],
      },
    },
  ];

  /* ---------------- sea state ----------------
     `swell` scales the long waves you surf; `chop` scales the short stuff
     that only rattles the hull. They are separate because a glassy heavy
     swell and a windblown slop are completely different things to drive. */

  const SEAS = [
    { id: 'glass',    name: 'Glass',        weight: 2, swell: 0.34, chop: 0.45, payout: 0.92,
      blurb: 'Flat and fast. Nothing to surf and nothing to launch off.' },
    { id: 'slight',   name: 'Slight swell', weight: 3, swell: 0.68, chop: 0.85, payout: 0.97,
      blurb: 'Gentle rollers. The odd crest worth taking.' },
    { id: 'moderate', name: 'Moderate sea', weight: 3, swell: 1.00, chop: 1.00, payout: 1,
      blurb: 'Proper wave faces. Surf down them and you gain real speed.' },
    { id: 'heavy',    name: 'Heavy swell',  weight: 2, swell: 1.55, chop: 1.20, payout: 1.12,
      blurb: 'Big faces, big air, and rings that move a long way up and down.' },
    { id: 'storm',    name: 'Storm sea',    weight: 1, swell: 2.10, chop: 1.60, payout: 1.28,
      blurb: 'Barely drivable. The channel is trying to throw you out of it.' },
  ];

  const byId = (list, id) => list.find(x => x.id === id) || null;

  function weightedPick(list, rng) {
    let total = 0;
    for (const x of list) total += x.weight;
    let r = rng() * total;
    for (const x of list) { r -= x.weight; if (r <= 0) return x; }
    return list[list.length - 1];
  }

  /* A channel's weather is part of the channel: the same seed always gets
     the same sky and the same sea, so a shared seed is a shared race. */
  function forSeed(seed) {
    const rng = U.makeRng((seed ^ 0x5bf03635) >>> 0);
    return {
      time: weightedPick(TIMES, rng).id,
      sea: weightedPick(SEAS, rng).id,
      wind: rng() * Math.PI * 2,      // which way the whole wave field runs
    };
  }

  function resolve(cond) {
    const c = cond || {};
    return {
      time: byId(TIMES, c.time) || TIMES[0],
      sea: byId(SEAS, c.sea) || SEAS[2],
      wind: c.wind || 0,
    };
  }

  // must run before Sky.build(); returns the group of lights to add
  function apply(cond) {
    const r = resolve(cond);
    Sky.setPreset(r.time.sky);
    Water.setSeaState({ swell: r.sea.swell, chop: r.sea.chop, wind: r.wind });
    Water.setPalette(r.time.water);
    return r;
  }

  function lights(cond) {
    const r = resolve(cond);
    const L = r.time.lights;
    const g = new THREE.Group();
    const sun = new THREE.DirectionalLight(L.sun[0], L.sun[1]);
    sun.position.copy(Sky.SUN_DIR).multiplyScalar(300);
    // a cool rim from behind picks the hull out against the water
    const rim = new THREE.DirectionalLight(L.rim[0], L.rim[1]);
    rim.position.set(-Sky.SUN_DIR.x * 240, 120, -Sky.SUN_DIR.z * 240);
    g.add(sun, rim,
      new THREE.HemisphereLight(L.hemi[0], L.hemi[1], L.hemi[2]),
      new THREE.AmbientLight(L.amb[0], L.amb[1]));
    return g;
  }

  const describe = (cond) => {
    const r = resolve(cond);
    return r.sea.name + ' · ' + r.time.name;
  };
  // conditions are a difficulty choice as much as a look, so they pay
  const payout = (cond) => {
    const r = resolve(cond);
    return r.sea.payout * r.time.payout;
  };

  return { TIMES, SEAS, forSeed, resolve, apply, lights, describe, payout };
})();

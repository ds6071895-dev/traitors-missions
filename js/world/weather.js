/* ------------------------------------------------------------------
   weather.js — what the sky over the castle is doing today.

   One word a day — clear, overcast, rain, fog or storm — drawn from the
   run seed and the day alone, so every browser in the room has the same
   weather without a byte of it on the wire, and so it says nothing about
   anybody. The first day is never a storm; the later the game, the more
   likely one is. The fire is outside and burns only under a clear sky
   or a fog.

   It is dressing, never a rule: the interlude paints it, the windows
   tint by it, and a storm puts thunder under the castle. None of the
   game reads it.
------------------------------------------------------------------ */
const Weather = (() => {

  const KINDS = ['clear', 'overcast', 'rain', 'fog', 'storm'];

  /* Weights by how far into the game it is (0 is the first day). */
  function weights(day) {
    const d = Math.max(0, day | 0);
    if (d === 0) return { clear: 6, overcast: 3, rain: 1, fog: 1, storm: 0 };
    if (d === 1) return { clear: 4, overcast: 3, rain: 2, fog: 2, storm: 1 };
    if (d === 2) return { clear: 3, overcast: 2, rain: 3, fog: 2, storm: 2 };
    return { clear: 2, overcast: 2, rain: 3, fog: 2, storm: 3 };
  }

  function hash(seed, day, salt) {
    let h = Math.imul(((seed | 0) ^ 0x77ea7e5) >>> 0, 0x85ebca6b) ^ Math.imul((day | 0) + 1, 0x9e3779b1) ^ salt;
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
  }

  function draw(w, x) {
    let total = 0;
    for (const k of KINDS) total += w[k] || 0;
    let at = x * total;
    for (const k of KINDS) { at -= w[k] || 0; if (at < 0) return k; }
    return 'clear';
  }

  /* Today's weather. Two days running are allowed the same word, but a
     storm never follows a storm: the second day of one is just rain. */
  function forDay(seed, day) {
    const k = draw(weights(day), hash(seed, day, 0x51));
    if (k === 'storm' && day > 0 && draw(weights(day - 1), hash(seed, day - 1, 0x51)) === 'storm') return 'rain';
    return k;
  }

  /* The night of the fire: clear or a fog off the loch. */
  function forFinale(seed, day) { return hash(seed, day, 0xf1) < 0.3 ? 'fog' : 'clear'; }

  const WORDS = { clear: 'Clear skies', overcast: 'Grey skies', rain: 'Rain', fog: 'Fog on the loch', storm: 'A storm coming' };
  const word = (k) => WORDS[k] || '';

  /* How much a day's weather dims the house, for the interior lights and
     the window panoramas: 1 is a clear day. */
  const LIGHT = { clear: 1, overcast: 0.88, rain: 0.8, fog: 0.85, storm: 0.7 };
  const light = (k) => LIGHT[k] || 1;

  /* The weather in a room: rain on the windows as a low bed under
     everything, and in a storm a flash through the windows every
     quarter to half a minute with the thunder a second or three behind
     it. `step(dt)` from the scene's update, `stop()` from its dispose.
     The flashes are the room's own random, not the seed's: they are
     weather, and nobody needs to see the same one. */
  function fx(stage, kind) {
    const wet = kind === 'rain' || kind === 'storm';
    let bed = null;
    if (wet && typeof AudioBus !== 'undefined' && AudioBus.ready && AudioBus.ctx) {
      try {
        const c = AudioBus.ctx, t = c.currentTime;
        const n = AudioBus.noiseSource();
        const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1100;
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = kind === 'storm' ? 5000 : 3800;
        const g = c.createGain(); g.gain.value = 0.0001;
        g.gain.setTargetAtTime(kind === 'storm' ? 0.07 : 0.045, t, 1.5);
        n.connect(hp); hp.connect(lp); lp.connect(g); g.connect(AudioBus.bus('ambience'));
        n.start(t);
        bed = { n, g, c };
      } catch (e) { bed = null; }
    }
    let next = kind === 'storm' ? 6 + Math.random() * 10 : Infinity;
    const pending = [];
    return {
      kind,
      step(dt) {
        next -= dt;
        if (next > 0) return;
        next = 15 + Math.random() * 18;
        const land = stage && stage.land;
        if (land && land.flash) {
          land.flash(1);
          pending.push(setTimeout(() => land.flash(0.6), 140));
        }
        const el = typeof document !== 'undefined' && document.getElementById('screen-flash');
        if (el && el.style) {
          el.style.transition = 'none'; el.style.background = '#dfe8ff'; el.style.opacity = '0.22';
          pending.push(setTimeout(() => { el.style.transition = 'opacity .5s ease-out'; el.style.opacity = '0'; }, 70));
        }
        if (typeof AudioBus !== 'undefined') {
          pending.push(setTimeout(() => AudioBus.play('il-thunder', { bus: 'ambience', gain: 0.45 + Math.random() * 0.3 }),
                                  900 + Math.random() * 2200));
        }
      },
      stop() {
        pending.forEach(clearTimeout);
        pending.length = 0;
        if (bed) {
          try {
            const t = bed.c.currentTime;
            bed.g.gain.cancelScheduledValues(t);
            bed.g.gain.setTargetAtTime(0.0001, t, 0.4);
            bed.n.stop(t + 2);
          } catch (e) {}
          bed = null;
        }
      },
    };
  }

  return { KINDS, forDay, forFinale, word, light, weights, fx };
})();

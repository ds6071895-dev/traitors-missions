/* ------------------------------------------------------------------
   music/build.js — the crescendo before an answer.

   A drumroll that loops is not a build: it starts again every bar, and
   the ear hears it start again. A build is one gesture that knows where
   it is going — a pulse that doubles and doubles until it is a roll, a
   line that climbs the scale and stops on the note *before* home, a
   choir whose mouth opens, horns that swell under it, a riser on top —
   and then nothing at all for a breath, and then the hit.

   This file is that gesture. A build plays on a side bus of the score
   it belongs to (same key, same room, same budget), so it can be cut
   without touching the band and the band can be cut with it.

       const b = score.build({ shape: 'banish' });        // open-ended
       const b = score.build({ shape: 'pouch', secs: 3 }); // a known length
       const wait = b.release('reveal-traitor', { then: 'banishTraitor' });
       // …`wait` seconds of true silence, then the stinger and the new
       // section land together; the scene puts its flash on that frame
       b.cancel();                                         // never mind

   An open build climbs for `ramp` seconds and then holds at the top —
   the roll going, the leading tone trembling, unresolved — until it is
   released, because the answer it is waiting for comes off the network
   and nobody knows when. A timed build is the same thing with its top
   at `secs`, and a reverse cymbal that ends exactly there.
------------------------------------------------------------------ */
const MusicBuild = (() => {

  const LOOKAHEAD = 0.34;
  const EPS = 0.0001;
  const HOLD_MAX = 14;         // seconds a build may sit at the top before it lets itself go

  /* The shapes. `ladder` is the climb, in semitones above the key: it
     ends on the leading tone (11) or another note that wants to move,
     and the hit is what resolves it. `stages` are the points in the
     climb where the pulse doubles: quarters, eighths, sixteenths, roll.
     `v` is the velocity at the bottom and at the top. */
  const SHAPES = {
    // "I am…" — the round table. Timpani, the whole choir, the horns.
    banish: { ramp: 5.2, breath: 0.42, bpm: 92, pulse: 'timpani', accent: 'taiko', snare: 0.5,
              ladder: [0, 2, 3, 5, 7, 8, 10, 11], stages: [0.28, 0.52, 0.76], v: [0.3, 1.05],
              choir: 0.75, brass: 0.8, brassAt: 0.45, riser: 0.9, tone: [600, 15000] },
    // the pouch in her hand: a heart that runs away with itself
    pouch:  { ramp: 3.2, breath: 0.0, bpm: 76, pulse: 'heartbeat', accent: 'timpani',
              ladder: [0, 3, 5, 7, 8, 10, 11], stages: [0.4, 0.68, 0.88], v: [0.45, 1.0],
              choir: 0.6, brass: 0, riser: 1.0, tone: [500, 12000] },
    // the last slate: short, dry, a clock that trips over itself
    slate:  { ramp: 1.6, breath: 0.25, bpm: 100, pulse: 'tom', accent: 'timpani',
              ladder: [7, 8, 10, 11], stages: [0.3, 0.6, 0.85], v: [0.4, 0.9],
              choir: 0, brass: 0, riser: 0.6, tone: [900, 12000] },
    // the Wise One: bells in it, and the climb is brighter
    wise:   { ramp: 3.4, breath: 0.35, bpm: 88, pulse: 'timpani', accent: 'bell', horns: true,
              ladder: [0, 2, 5, 7, 9, 10, 11], stages: [0.3, 0.55, 0.8], v: [0.3, 1.0],
              choir: 0.7, brass: 0.5, brassAt: 0.6, riser: 0.8, tone: [700, 15000] },
    // the last seconds of the day: one tick a second, then two, then all of them
    countdown: { ramp: 10, breath: 0.0, bpm: 60, pulse: 'tick', accent: 'taiko', snare: 0.4,
              ladder: [0, 2, 3, 5, 7, 8, 10, 11], stages: [0.5, 0.75, 0.9], v: [0.5, 1.0],
              choir: 0.4, brass: 0.6, brassAt: 0.7, riser: 0.7, tone: [1200, 15000] },
    // a letter under the door: low, slow, and it never gets loud
    letter: { ramp: 3.0, breath: 0.5, bpm: 66, pulse: 'heartbeat', accent: 'tom',
              ladder: [0, 1, 3, 5, 6, 7, 8], stages: [0.45, 0.75, 0.95], v: [0.35, 0.8],
              choir: 0.5, brass: 0, riser: 0.45, tone: [400, 5000], vowel: 'mm' },
  };

  const DEAD = {
    live: false, p: 0, shape: null,
    release() { return 0; }, cancel() {},
  };

  function start(S, o = {}) {
    const shape = SHAPES[o.shape] || SHAPES.banish;
    const I = MusicInst;
    const c = S.ctx;
    const now = c.currentTime;
    const B = S._side({ tone: shape.tone[0] });

    const timed = o.secs > 0;
    const len = Math.max(0.6, timed ? o.secs : (o.ramp || shape.ramp));
    const t0 = o.at === 'beat' ? S._gridTime(4, true) : now + 0.03;
    const tTop = t0 + len;
    // the pulse rides the band's tempo when there is one worth riding
    const bpm = U.clamp(o.bpm || shape.bpm || S.bpm, 56, 132);
    const spb = 60 / bpm;
    const tick = spb / 8;                       // the finest subdivision: a roll
    const [v0, v1] = shape.v;
    const gain = o.gain != null ? o.gain : 1;

    // the filter opens as it climbs
    if (B.tone) {
      B.tone.frequency.setValueAtTime(shape.tone[0], t0);
      B.tone.frequency.exponentialRampToValueAtTime(shape.tone[1], tTop);
    }

    // the riser and the reverse cymbal, which ends on the top
    let riser = shape.riser ? I.shepard(B, t0, B.hz(12), len, shape.riser * gain) : null;
    if (timed) I.revCymbal(B, tTop, Math.min(2.6, len * 0.8), 0.8 * gain);

    const prog = (t) => U.clamp((t - t0) / len, 0, 1);
    const curve = (p) => v0 + (v1 - v0) * Math.pow(p, 1.6);
    const div = (p) => p < shape.stages[0] ? 1 : p < shape.stages[1] ? 2 : p < shape.stages[2] ? 4 : 8;

    /* How many rungs the climb has time for, and which rung a moment is
       on. The last rung is always the top of the ladder, however short
       the build: a short build starts further up. */
    const stepLen = Math.max(spb, len / shape.ladder.length);
    const rungs = Math.max(1, Math.ceil(len / stepLen));
    const rung = (i) => shape.ladder[U.clamp(shape.ladder.length - rungs + i, 0, shape.ladder.length - 1)];

    let k = 0;                 // pulse position, in ticks
    let step = 0;              // ladder position
    let dead = false;
    const H = {
      live: true, shape: o.shape || 'banish', t0, tTop, timed,
      get p() { return prog(c.currentTime); },
      get holding() { return c.currentTime >= tTop; },

      pump(tNow) {
        if (dead) return;
        // a build nobody released lets go of itself, and the band is still there
        if (tNow > tTop + HOLD_MAX) { H.cancel(1.5); return; }

        // ---- the pulse ----
        let guard = 0;
        while (t0 + k * tick < tNow + LOOKAHEAD && guard++ < 64) {
          const t = t0 + k * tick;
          const p = prog(t);
          const d = div(p);
          const every = 8 / d;
          if (k % every !== 0) { k += every - (k % every); continue; }
          const onBeat = k % 8 === 0;
          // at the top it breathes rather than sitting on one level
          const top = t > tTop ? 0.92 + 0.08 * Math.sin((t - tTop) * 3.1) : 1;
          const v = curve(p) * (onBeat ? 1 : 0.8) * top * gain;
          if (o.trace) o.trace.push({ t, v: curve(p), div: d, p });
          pulse(t, v, d, onBeat);
          k += every;
        }

        // ---- the climb ----
        guard = 0;
        while (t0 + step * stepLen < tNow + LOOKAHEAD && guard++ < 8) {
          const t = t0 + step * stepLen;
          const p = prog(t + stepLen * 0.5);
          climb(t, p, rung(step), step);
          step++;
        }
      },

      /* The answer. Everything stops — the build, the band, the room —
         for `breath` seconds, and then the stinger and the next section
         land on the same instant. Returns the length of the breath, so
         whoever is staging the moment can put the picture on it. */
      release(sting, r = {}) {
        if (dead) {
          // nothing to cut: just the hit, now
          if (sting) S.stinger(sting, r);
          if (r.then) S.section(r.then, { at: 'now', glide: r.glide != null ? r.glide : 0.3 });
          return 0;
        }
        kill(0.04);
        return S.strike(sting, Object.assign({ breath: shape.breath }, r));
      },

      // never mind: the build fades and the band carries on underneath
      cancel(fade = 0.3) {
        if (dead) return;
        kill(fade);
      },
    };

    function kill(fade) {
      dead = true;
      H.live = false;
      if (S._build === H) S._build = null;
      const t = c.currentTime;
      if (riser) { try { riser.stop(fade); } catch (e) {} riser = null; }
      B.exit.gain.cancelScheduledValues(t);
      B.exit.gain.setValueAtTime(Math.max(EPS, B.exit.gain.value), t);
      B.exit.gain.exponentialRampToValueAtTime(EPS, t + Math.max(0.03, fade));
      // and its share of the room, which does not go through `exit`
      B.send.gain.cancelScheduledValues(t);
      B.send.gain.setValueAtTime(B.send.gain.value, t);
      B.send.gain.linearRampToValueAtTime(0, t + Math.max(0.03, fade));
      setTimeout(() => {
        try { B.exit.disconnect(); } catch (e) {}
        try { B.send.disconnect(); } catch (e) {}
      }, (fade + 4) * 1000);
    }

    function pulse(t, v, d, onBeat) {
      const root = B.hz(12);                                  // D2
      const roll = d >= 8;
      const kind = shape.pulse;
      if (kind === 'timpani') I.timpani(B, t, root, 0, v, { pri: 0, decay: roll ? 0.3 : d >= 4 ? 0.6 : 1.4 });
      else if (kind === 'heartbeat') {
        // a heart cannot roll: past sixteenths it hands over to the drum
        if (roll) I.timpani(B, t, root, 0, v * 0.9, { pri: 0, decay: 0.3 });
        else I.heartbeat(B, t, 0, 0, v, { pri: 0 });
      }
      else if (kind === 'tom') I.tom(B, t, 0, 0, v, { pri: 0, f: roll ? 150 : 120 });
      else if (kind === 'tick') {
        // tick on the beat, tock off it; and when it rolls, a drum under it
        I.tick(B, t, 0, 0, v, { pri: 0, tock: !onBeat && d < 4 });
        if (roll) I.timpani(B, t, root, 0, v * 0.7, { pri: 0, decay: 0.3 });
      }
      // the side drum comes in with the roll
      if (roll && shape.snare) I.snare(B, t, 0, 0, v * shape.snare, { pri: 0 });
      if (!onBeat) return;
      const a = shape.accent;
      const av = v * (0.5 + 0.5 * prog(t));
      if (a === 'taiko') I.taiko(B, t, 0, 0, av, { pri: 0 });
      else if (a === 'timpani' && kind !== 'timpani') I.timpani(B, t, root, 0, av, { pri: 0, decay: 1.2 });
      else if (a === 'tom') I.tom(B, t, 0, 0, av, { pri: 0, f: 90 });
      else if (a === 'bell') I.bell(B, t, B.hz(36 + 7), 0, av * 0.6, { pri: 0, decay: 1.6 });
    }

    function climb(t, p, semi, i) {
      const dur = stepLen * 0.98;
      const lvl = (0.35 + 0.65 * p) * gain;
      // the pedal: the key, held under everything
      I.strings(B, t, B.hz(12), dur, 0.7 * lvl, { art: 'sustain', a: 0.1, rel: 0.2, fam: 'cello', pri: 0, voices: 2 });
      // the line, in octaves, trembling
      I.strings(B, t, B.hz(36 + semi), dur, 0.9 * lvl, { art: 'tremolo', fam: 'hiStr', pri: 0, voices: 3, rate: 11 + 4 * p });
      if (p > 0.35) I.strings(B, t, B.hz(48 + semi), dur, 0.55 * lvl, { art: 'tremolo', fam: 'hiStr', pri: 0, voices: 2, rate: 12 + 4 * p });
      /* The choir's mouth opens as it climbs: oo, then oh, then ah, and
         across the rung where it changes the vowel moves with the note
         rather than jumping. Men an octave under the women. */
      if (shape.choir) {
        const at = (q) => shape.vowel || (q < 0.4 ? 'oo' : q < 0.72 ? 'oh' : 'ah');
        const from = at(prog(t)), to = at(prog(t + stepLen));
        const how = { pri: 0, a: Math.min(0.3, dur * 0.4), rel: 0.25 };
        if (from !== to) how.morph = [from, to]; else how.vowel = to;
        for (const s of [0, 7]) I.choir(B, t, B.hz(36 + s), dur, shape.choir * lvl, how);
        I.choir(B, t, B.hz(24), dur, shape.choir * lvl * 0.8, how);
        if (p > 0.6) I.choir(B, t, B.hz(36 + semi), dur, shape.choir * lvl * 0.8, Object.assign({}, how, { a: 0.15 }));
      }
      // the brass arrives late, and every note of it grows
      if (shape.brass && p >= (shape.brassAt || 0.5)) {
        const blow = shape.horns ? I.horn : I.brass;
        blow(B, t, B.hz(24), dur, shape.brass * lvl, { pri: 0, art: 'swell', rel: 0.2 });
        blow(B, t, B.hz(24 + semi % 12), dur, shape.brass * lvl * 0.7, { pri: 0, art: 'swell', rel: 0.2 });
      }
      // every other rung at the top, the biggest drum in the room says so
      if (t >= tTop && i % 2 === 0) I.granCassa(B, t, 0, 0, 0.85 * gain, { pri: 0 });
    }

    return H;
  }

  return { SHAPES, DEAD, start, HOLD_MAX };
})();

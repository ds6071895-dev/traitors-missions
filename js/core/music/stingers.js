/* ------------------------------------------------------------------
   music/stingers.js — the hits.

   A stinger is a function of the score it plays in and the time it
   lands: `(S, t, o)`. They are played on top of whatever the band is
   doing (`score.stinger`), or as the blow at the end of a build
   (`score.strike`, `build.release`). They are kept apart from the
   arrangements because they are a different kind of thing: one
   gesture each, with no bars in them.
------------------------------------------------------------------ */
const MusicStingers = (() => {

  /* ---------------- stingers ----------------
     Played on top of whatever the loop is doing, now or on the next
     beat. `S.hz(semi)` is key-aware, so a sting after a modulation is
     still in the key the band is in. `o.n` is a counter where one
     makes sense (the third vote, the second name). */
  const I = MusicInst;
  const oct = (semi, o) => semi + 12 * o;
  /* Which voicing of a stinger with several. Drawn from the run's seed
     and how many have been drawn before, and never the one that kind
     played last — so the second banishment of a night is not a
     recording of the first, which picking by the day used to make it.
     `o.v` asks for one by number. */
  const lastPick = {};
  let drawn = 0;
  function pickFresh(S, o, kind, k) {
    if (o && o.v != null) return ((o.v | 0) % k + k) % k;
    let i = (Math.imul((S.seed | 0) ^ Math.imul(++drawn, 0x9e3779b1), 0x85ebca6b) >>> 9) % k;
    if (k > 1 && i === lastPick[kind]) i = (i + 1) % k;
    lastPick[kind] = i;
    return i;
  }

  const STINGERS = {

    /* ---- the fire ---- */

    warn(S, t) {
      I.timpaniRoll(S, t, S.hz(oct(0, 1)), 1.5, 1);
      I.granCassa(S, t + 1.5, 0, 0, 0.9, { pri: 0 });
      I.timpani(S, t + 1.5, S.hz(oct(0, 1)), 0, 1.1, { pri: 0 });
      I.braam(S, t + 1.5, S.hz(oct(0, 1)), 1.8, 0.7);
      I.crash(S, t + 1.5, 0, 0, 0.6);
    },

    // the banished turn for the door
    walkout(S, t) {
      I.crash(S, t, 0, 0, 0.7);
      I.braam(S, t, S.hz(oct(0, 1)), 1.6, 0.6);
      I.taikoEns(S, t, 0, 0, 1.0, { pri: 0 });
      I.granCassa(S, t, 0, 0, 0.8, { pri: 0 });
      I.timpani(S, t, S.hz(oct(0, 1)), 0, 0.9, { pri: 0 });
    },

    // the house bell: thirty seconds left in the day
    bell(S, t) {
      for (let k = 0; k < 3; k++) {
        I.bell(S, t + k * 0.42, S.hz(oct(k === 1 ? 7 : 0, 3)), 0, 0.55, { ratio: 1.4, decay: 3.2, pri: 0 });
      }
      I.timpani(S, t, S.hz(oct(0, 1)), 0, 0.6, { pri: 0 });
    },

    'floor-next'(S, t) {
      I.bell(S, t, S.hz(oct(0, 3)), 0, 0.35, { ratio: 1.4, decay: 3, pri: 0 });
      I.timpani(S, t, S.hz(oct(0, 1)), 0, 0.5, { pri: 0 });
    },

    // a string stab per vote, one chord tone higher each time
    vote(S, t, o = {}) {
      const ch = S.chordNow();
      const n = o.n | 0;
      const semi = ch[n % 3] + 12 * Math.floor(n / 3);
      I.strings(S, t, S.hz(oct(semi, 3)), 0.1, 1.1, { art: 'spic', fam: 'hiStr', pri: 0, voices: 3 });
      I.strings(S, t, S.hz(oct(semi, 2)), 0.1, 0.9, { art: 'spic', fam: 'cello', pri: 0, voices: 2 });
      I.taiko(S, t, 0, 0, 0.55, { pri: 0 });
    },

    // a name, said aloud: the lower the name, the lower the hit
    name(S, t, o = {}) {
      const steps = [0, 3, 5, 7, 8, 10];
      const semi = steps[(o.n | 0) % steps.length];
      I.timpani(S, t, S.hz(oct(semi, 1)), 0, 1.1, { pri: 0 });
      I.lowBrass(S, t, S.hz(oct(semi, 2)), 0.9, 0.8, { pri: 0, art: 'sfz' });
      I.granCassa(S, t, 0, 0, 0.6, { pri: 0, decay: 1.4 });
    },

    // a tie: nobody knows, and the harmony does not either
    tie(S, t) {
      [0, 1, 6].forEach((s, i) => I.brass(S, t + i * 0.02, S.hz(oct(s, 2)), 1.6, 0.8, { pri: 0, slow: true }));
      I.choir(S, t, S.hz(oct(0, 3)), 1.8, 0.9, { pri: 0, a: 0.2 });
      I.choir(S, t, S.hz(oct(1, 3)), 1.8, 0.7, { pri: 0, a: 0.2 });
      I.taiko(S, t, 0, 0, 1, { pri: 0 });
      I.taiko(S, t + 0.16, 0, 0, 0.8, { pri: 0 });
    },

    /* The reveals. Everything at once, on the frame the colour lands:
       the crash, the floor dropping, three drums, and a chord that is
       still ringing while she says the name. */
    'reveal-traitor'(S, t) {
      I.crash(S, t, 0, 0, 1.2);
      // the floor goes, the metal rings, and the drums land in threes
      I.subDrop(S, t, 0, 0, 1.0, { len: 3.4 });
      I.anvil(S, t, 0, 0, 1.0, { pri: 0 });
      I.taikoEns(S, t, 0, 0, 1.2, { pri: 0 });
      I.taiko(S, t + 0.13, 0, 0, 1.0, { pri: 0 });
      I.taikoEns(S, t + 0.26, 0, 0, 1.05, { pri: 0 });
      I.downer(S, t + 0.04, S.hz(oct(0, 3)), 0, 0.9, { len: 2.2, pri: 0 });
      I.braam(S, t, S.hz(oct(0, 1)), 3.2, 1.2);
      [0, 1, 7, 12].forEach((s, i) =>
        I.choir(S, t + i * 0.03, S.hz(oct(s, 3)), 3.4, 1.05, { pri: 0, a: 0.08, vowel: 'ah' }));
      [0, 3, 7].forEach(s =>
        I.strings(S, t, S.hz(oct(s, 4)), 2.8, 0.9, { art: 'tremolo', pri: 0, fam: 'hiStr' }));
    },

    'reveal-faithful'(S, t) {
      I.crash(S, t, 0, 0, 0.9);
      I.boom(S, t, 0, 0, 0.75, { len: 2.6 });
      I.timpani(S, t, S.hz(oct(0, 1)), 0, 1.1, { pri: 0 });
      [0, 4, 7, 12].forEach((s, i) =>
        I.choir(S, t + i * 0.04, S.hz(oct(s, 3)), 3.6, 0.95, { pri: 0, a: 0.25, vowel: 'ah' }));
      [0, 4, 7].forEach(s =>
        I.strings(S, t, S.hz(oct(s, 4)), 3.2, 1.0, { art: 'sustain', a: 0.12, pri: 0, fam: 'hiStr' }));
      [12, 16, 19, 24].forEach((s, i) =>
        I.bell(S, t + 0.1 + i * 0.075, S.hz(oct(s, 3)), 0, 0.7, { pri: 0 }));
      // horns, not trumpets: it is a relief, or a grief, and either way it is not a fanfare
      [0, 7, 12].forEach(s => I.horn(S, t, S.hz(oct(s, 2)), 2.2, 0.85, { pri: 0 }));
      I.granCassa(S, t, 0, 0, 0.7, { pri: 0 });
    },

    // the old name, still called by anything that does not know a role
    reveal(S, t) { STINGERS['reveal-traitor'](S, t); },

    win(S, t) {
      I.crash(S, t, 0, 0, 0.9);
      I.timpani(S, t, S.hz(oct(0, 1)), 0, 1.1, { pri: 0 });
      I.taikoEns(S, t, 0, 0, 0.9, { pri: 0 });
      I.boom(S, t, 0, 0, 0.6, { len: 2.4 });
      [0, 4, 7, 12].forEach((s, i) => I.brass(S, t + i * 0.05, S.hz(oct(s, 2)), 2.4, 0.9, { pri: 0 }));
      [0, 7].forEach(s => I.horn(S, t, S.hz(oct(s, 2)), 2.6, 0.7, { pri: 0 }));
    },

    lose(S, t) {
      I.boom(S, t, 0, 0, 0.8, { len: 3 });
      I.strings(S, t, S.hz(oct(0, 1)), 3.5, 1.0, { art: 'sustain', a: 0.1, pri: 0, fam: 'cello' });
      [0, 3, 7].forEach(s => I.choir(S, t, S.hz(oct(s, 3)), 3.4, 0.7, { pri: 0, vowel: 'oo' }));
    },

    'traitor-win'(S, t) {
      [0, 1.1, 2.2].forEach(at =>
        I.bell(S, t + at, S.hz(oct(0, 2)), 0, 1, { ratio: 1.4, decay: 4, pri: 0, peak: 0.1 }));
      I.braam(S, t, S.hz(oct(0, 1)), 3.4, 1.1);
      I.boom(S, t, 0, 0, 0.9, { len: 3.4 });
    },

    /* The hill: the card that only you see. Anybody else in the room
       with your speakers hears that there was a sting; so the two are
       the same length, the same weight and built the same way — a low
       drum, a held low note, a choir chord, four strikes on top — and
       differ only in what the notes are. */
    'role-traitor'(S, t) {
      I.timpani(S, t, S.hz(oct(0, 1)), 0, 0.7, { pri: 0 });
      I.strings(S, t, S.hz(oct(0, 1)), 2.4, 0.6, { art: 'sustain', a: 0.1, fam: 'cello', pri: 0, voices: 2 });
      [0, 1, 7].forEach(s => I.choir(S, t, S.hz(oct(s, 3)), 2.6, 0.55, { pri: 0, vowel: 'oo' }));
      [0, 1, 6, 7].forEach((s, i) => I.bell(S, t + i * 0.09, S.hz(oct(s, 3)), 0, 0.5, { pri: 0, ratio: 1.4 }));
    },
    'role-faithful'(S, t) {
      I.timpani(S, t, S.hz(oct(0, 1)), 0, 0.7, { pri: 0 });
      I.strings(S, t, S.hz(oct(0, 1)), 2.4, 0.6, { art: 'sustain', a: 0.1, fam: 'cello', pri: 0, voices: 2 });
      [0, 4, 7].forEach(s => I.choir(S, t, S.hz(oct(s, 3)), 2.6, 0.55, { pri: 0, vowel: 'ah' }));
      [0, 4, 7, 12].forEach((s, i) => I.bell(S, t + i * 0.09, S.hz(oct(s, 3)), 0, 0.5, { pri: 0 }));
    },

    // any mission card
    title(S, t) {
      I.timpani(S, t, S.hz(oct(0, 1)), 0, 0.9, { pri: 0 });
      [0, 7, 12].forEach(s => I.brass(S, t, S.hz(oct(s, 2)), 1.2, 0.7, { pri: 0 }));
      I.crash(S, t, 0, 0, 0.5);
    },

    /* ---- the shootout ---- */

    phase(S, t) {
      I.braam(S, t, S.hz(oct(0, 1)), 1.4, 1);
      I.taiko(S, t, 0, 0, 1.1, { pri: 0 });
      I.taiko(S, t + 0.16, 0, 0, 0.9, { pri: 0 });
      I.crash(S, t, 0, 0, 0.6);
    },

    stagger(S, t) {
      // the fight stops for a beat and so does the score
      S.duck(0.22, 1.5);
      I.taiko(S, t, 0, 0, 1.1, { pri: 0 });
      I.crash(S, t, 0, 0, 0.7);
      [0, 7].forEach(s => I.choir(S, t + 0.03, S.hz(oct(s, 3)), 1.6, 1.1, { pri: 0, a: 0.1 }));
    },

    summon(S, t) {
      // a flat second under the root
      I.choir(S, t, S.hz(oct(-1, 3)), 1.3, 1.0, { pri: 0, a: 0.1, vowel: 'oo' });
      I.choir(S, t, S.hz(oct(0, 3)), 1.3, 0.7, { pri: 0, a: 0.1, vowel: 'oo' });
      I.taiko(S, t, 0, 0, 0.9, { pri: 0 });
      I.taiko(S, t + 0.12, 0, 0, 0.7, { pri: 0 });
    },

    boon(S, t) {
      [0, 7, 12, 16].forEach((s, i) => I.bell(S, t + i * 0.07, S.hz(oct(s, 3)), 0, 0.6, { pri: 0 }));
      I.choir(S, t, S.hz(oct(12, 3)), 1, 0.5, { pri: 0, a: 0.1 });
    },

    hurt(S, t) { I.taiko(S, t, 0, 0, 0.9, { pri: 0, f: 80 }); },

    down(S, t) {
      // the one place the mode turns: D major, everything, long
      I.crash(S, t, 0, 0, 1.1);
      I.boom(S, t, 0, 0, 0.9, { len: 3 });
      I.timpani(S, t, S.hz(oct(0, 1)), 0, 1.2, { pri: 0 });
      [0, 4, 7, 12].forEach((s, i) => {
        I.brass(S, t + i * 0.09, S.hz(oct(s, 2)), 2.6, 1.05, { pri: 0 });
        I.choir(S, t + i * 0.09, S.hz(oct(s, 3)), 2.8, 0.95, { pri: 0, a: 0.15 });
      });
      I.strings(S, t, S.hz(oct(0, 1)), 2.6, 1, { art: 'sustain', a: 0.1, pri: 0, fam: 'cello' });
    },

    round(S, t) {
      I.taiko(S, t, 0, 0, 0.6, { pri: 0 });
      I.brass(S, t, S.hz(oct(0, 2)), 0.45, 0.6, { pri: 0 });
      I.brass(S, t + 0.22, S.hz(oct(7, 2)), 0.5, 0.65, { pri: 0 });
    },

    'bonus-round'(S, t) {
      [0, 4, 7, 12].forEach((s, i) => I.brass(S, t + i * 0.08, S.hz(oct(s, 2)), 0.55, 0.6, { pri: 0 }));
      I.taiko(S, t, 0, 0, 0.55, { pri: 0 });
      I.bell(S, t + 0.3, S.hz(oct(12, 3)), 0, 0.4, { pri: 0 });
    },

    'riser-end'(S, t) {
      I.taiko(S, t, 0, 0, 0.9, { pri: 0 });
      I.crash(S, t, 0, 0, 0.5);
    },

    /* ---- the dive ---- */

    chain(S, t) {
      // a rising figure in fifths — not a fanfare: it lands inside a bar
      // the player is still swimming to, four or five times a run
      [0, 7, 12, 19].forEach((s, i) => I.celesta(S, t + i * 0.055, S.hz(oct(s, 3)), 0, 0.7, { pri: 0 }));
      I.hat(S, t, 0, 0, 0.6, { pri: 0 });
    },

    /* ---- the boat ---- */

    count(S, t) {
      I.timpani(S, t, S.hz(oct(7, 0)), 0, 0.9, { pri: 0 });
      I.strings(S, t, S.hz(oct(7, 2)), 0.1, 0.8, { art: 'spic', pri: 0, fam: 'cello' });
    },

    go(S, t) {
      I.crash(S, t, 0, 0, 0.8);
      I.timpani(S, t, S.hz(oct(0, 1)), 0, 1.1, { pri: 0 });
      I.taiko(S, t, 0, 0, 1, { pri: 0 });
      [0, 7, 12].forEach(s => I.brass(S, t, S.hz(oct(s, 2)), 0.8, 0.9, { pri: 0 }));
    },

    perfect(S, t) {
      I.bell(S, t, S.hz(oct(12, 3)), 0, 0.45, { pri: 0, decay: 1.2 });
      I.bell(S, t + 0.07, S.hz(oct(19, 3)), 0, 0.4, { pri: 0, decay: 1.2 });
    },

    boost(S, t) {
      I.taiko(S, t, 0, 0, 0.8, { pri: 0 });
      I.brass(S, t, S.hz(oct(7, 2)), 0.35, 0.6, { pri: 0 });
    },

    finish(S, t) {
      I.crash(S, t, 0, 0, 1);
      I.timpani(S, t, S.hz(oct(0, 1)), 0, 1.1, { pri: 0 });
      [0, 4, 7, 12].forEach((s, i) => {
        I.brass(S, t + i * 0.1, S.hz(oct(s, 2)), 1.8 - i * 0.2, 0.95, { pri: 0 });
        I.choir(S, t + i * 0.1, S.hz(oct(s, 3)), 2, 0.7, { pri: 0, a: 0.1 });
      });
    },

    'finish-low'(S, t) {
      I.timpani(S, t, S.hz(oct(0, 1)), 0, 0.8, { pri: 0 });
      [0, 3, 7].forEach(s => I.brass(S, t, S.hz(oct(s, 2)), 1.4, 0.6, { pri: 0 }));
    },

    fail(S, t) {
      I.boom(S, t, 0, 0, 0.8, { len: 2.2 });
      I.brass(S, t, S.hz(oct(7, 1)), 0.5, 0.8, { pri: 0 });
      I.brass(S, t + 0.45, S.hz(oct(1, 1)), 1.4, 0.8, { pri: 0 });
    },

    /* ---- the castle ---- */

    // a slate turned over: a dry knock and a low string stab
    'slate-turn'(S, t, o = {}) {
      const steps = [0, 3, 5, 7, 8, 10, 12, 15];
      const semi = steps[(o.n | 0) % steps.length];
      I.tom(S, t, 0, 0, 0.7, { pri: 0 });
      I.strings(S, t, S.hz(oct(semi, 2)), 0.25, 1.0, { art: 'spic', fam: 'cello', pri: 0, voices: 2 });
      I.timpani(S, t, S.hz(oct(semi, 1)), 0, 0.7, { pri: 0 });
    },

    /* The name the table has settled on. Three voicings, one a day, so
       the third banishment of a run is not a recording of the first:
       the roll into a braam, a double hit on the flat second, and a
       choir that cuts in with nothing in front of it. */
    banish(S, t, o = {}) {
      const v = pickFresh(S, o, 'banish', 3);
      if (v === 1) {
        [0, 0.36].forEach((d, i) => {
          I.taikoEns(S, t + d, 0, 0, 1, { pri: 0 });
          I.braam(S, t + d, S.hz(oct(i ? 0 : 1, 1)), i ? 2.8 : 0.3, 1);
        });
        I.boom(S, t + 0.36, 0, 0, 0.9, { len: 2.6 });
        [0, 1, 7].forEach((s, i) => I.choir(S, t + 0.4 + i * 0.04, S.hz(oct(s, 3)), 2.6, 0.7, { pri: 0, vowel: 'oh' }));
        return;
      }
      if (v === 2) {
        [0, 3, 7, 12, 13].forEach((s, i) => I.choir(S, t + i * 0.03, S.hz(oct(s, 3)), 3.2, 0.8, { pri: 0, vowel: 'ah' }));
        I.timpani(S, t, S.hz(oct(0, 1)), 0, 1.1, { pri: 0 });
        I.granCassa(S, t, 0, 0, 0.9, { pri: 0 });
        I.crash(S, t, 0, 0, 0.7);
        I.strings(S, t, S.hz(oct(0, 1)), 3, 1, { art: 'sustain', fam: 'cello', pri: 0, voices: 3 });
        return;
      }
      I.timpaniRoll(S, t, S.hz(oct(0, 1)), 1.2, 1);
      I.braam(S, t + 1.2, S.hz(oct(0, 1)), 2.4, 0.9);
      I.granCassa(S, t + 1.2, 0, 0, 0.9, { pri: 0 });
      I.crash(S, t + 1.2, 0, 0, 0.8);
      [0, 3, 7, 12].forEach((s, i) => I.choir(S, t + 1.2 + i * 0.05, S.hz(oct(s, 3)), 2.6, 0.75, { pri: 0, vowel: 'ah' }));
    },

    // the moment the turret agrees, heard only there; and the letter
    'murder-hit'(S, t, o = {}) {
      const v = pickFresh(S, o, 'murder-hit', 2);
      I.boom(S, t, 0, 0, 1, { len: 3 });
      I.braam(S, t, S.hz(oct(v ? 1 : 0, 1)), 3.2, 1);
      I.strings(S, t, S.hz(oct(1, 3)), 2.4, 0.7, { art: 'tremolo', fam: 'hiStr', pri: 0, voices: 3 });
      I.glass(S, t + 0.1, S.hz(oct(13, 3)), 1.6, 0.8, { pri: 0, a: 0.3, bend: true });
      if (v) {
        // a heart that stops: two beats, then nothing
        I.heartbeat(S, t + 0.9, 0, 0, 0.9, { pri: 0 });
        I.heartbeat(S, t + 1.7, 0, 0, 0.6, { pri: 0 });
      } else {
        I.bell(S, t + 0.05, S.hz(oct(1, 3)), 0, 0.5, { ratio: 1.4, decay: 4, pri: 0 });
      }
    },

    // the empty chair, found
    'breakfast-absent'(S, t, o = {}) {
      const v = pickFresh(S, o, 'breakfast-absent', 2);
      I.bell(S, t, S.hz(oct(0, 3)), 0, 0.6, { ratio: 1.4, decay: 5, pri: 0 });
      I.timpani(S, t, S.hz(oct(0, 1)), 0, 1.0, { pri: 0 });
      I.pianoLow(S, t, S.hz(oct(0, 2)), 0, 0.9, { pri: 0 });
      I.glass(S, t + 0.2, S.hz(oct(15, 3)), 2, 0.7, { pri: 0, a: 0.4, bend: true });
      I.strings(S, t, S.hz(oct(0, 1)), 3, 0.9, { art: 'sustain', fam: 'cello', pri: 0, voices: 2 });
      if (v) {
        I.braam(S, t, S.hz(oct(0, 1)), 2.6, 0.75);
        [1, 5].forEach((s, i) => I.choir(S, t + 0.15 + i * 0.05, S.hz(oct(s, 3)), 3, 0.5, { pri: 0, vowel: 'oo' }));
      } else {
        I.choir(S, t + 0.2, S.hz(oct(3, 3)), 3, 0.5, { pri: 0, vowel: 'oo' });
      }
    },

    // the castle opens for the day: one hit, and the band goes
    'castle-open'(S, t) {
      I.braam(S, t, S.hz(oct(0, 1)), 1.8, 0.8);
      I.taikoEns(S, t, 0, 0, 1, { pri: 0 });
      I.taiko(S, t + 0.22, 0, 0, 0.7, { pri: 0 });
      I.crash(S, t, 0, 0, 0.55);
    },

    // today's twist is revealed: the floor drops, the brass and choir swell, and the bells toll
    twist(S, t) {
      I.crash(S, t, 0, 0, 1.2);
      I.boom(S, t, 0, 0, 1.05, { len: 3.4 });
      I.downer(S, t + 0.04, S.hz(oct(0, 3)), 0, 0.85, { len: 2.2, pri: 0 });
      I.taikoEns(S, t, 0, 0, 1.2, { pri: 0 });
      I.taiko(S, t + 0.14, 0, 0, 1.0, { pri: 0 });
      I.timpani(S, t, S.hz(oct(0, 1)), 0, 1.2, { pri: 0 });
      I.braam(S, t, S.hz(oct(0, 1)), 3.2, 1.2);
      [0, 7, 12, 15].forEach((s, i) => {
        I.brass(S, t + i * 0.035, S.hz(oct(s, 2)), 2.8, 0.95, { pri: 0 });
        I.choir(S, t + i * 0.035, S.hz(oct(s, 3)), 3.2, 0.9, { pri: 0, a: 0.06, vowel: 'ah' });
      });
      [0, 7, 12].forEach((s, i) =>
        I.bell(S, t + 0.08 + i * 0.09, S.hz(oct(s, 3)), 0, 0.6, { ratio: 1.4, decay: 3.8, pri: 0 }));
    },

    // the bedroom door, locked for the night
    'door-lock'(S, t) {
      I.tom(S, t, 0, 0, 0.8, { pri: 0 });
      I.boom(S, t, 0, 0, 0.55, { len: 2 });
      I.bell(S, t + 0.04, S.hz(oct(1, 2)), 0, 0.4, { ratio: 1.4, decay: 3, pri: 0 });
      I.strings(S, t, S.hz(oct(0, 1)), 2.2, 0.6, { art: 'sustain', fam: 'cello', pri: 0, voices: 2 });
    },

    /* A group through the breakfast door: one more note on a chord with
       no third in it — the key, the fifth, the ninth, the eleventh, the
       seventh — so the more of them come down the more it hangs. It
       cannot know whether a chair will stay empty, and so it never
       settles; the reveal settles it. */
    arrive(S, t, o = {}) {
      const LADDER = [0, 7, 14, 17, 10, 21, 19];
      const n = Math.min(LADDER.length - 1, o.n | 0);
      I.harp(S, t, S.hz(oct(LADDER[n], 3)), 1.5, 0.75, { pri: 0 });
      I.bell(S, t + 0.04, S.hz(oct(LADDER[n] + 12, 3)), 0, 0.22, { pri: 0, decay: 2.2 });
      for (let k = 0; k <= n; k++) {
        I.strings(S, t, S.hz(oct(LADDER[k], 3)), 2.8, 0.32, { art: 'swell', pri: 0, voices: 2, fam: 'hiStr' });
      }
    },

    // everybody came down: nobody died
    'all-here'(S, t) {
      [0, 4, 7, 12, 16].forEach((s, i) => I.harp(S, t + i * 0.07, S.hz(oct(s, 3)), 1.5, 0.6, { pri: 0 }));
      I.bell(S, t + 0.3, S.hz(oct(7, 4)), 0, 0.35, { pri: 0 });
    },

    // the day's hardest worker is named: a bright horn call, and a bell
    shield(S, t) {
      I.taiko(S, t, 0, 0, 0.8, { pri: 0 });
      I.crash(S, t, 0, 0, 0.45);
      [0, 7, 12].forEach((s, i) => I.horn(S, t + i * 0.09, S.hz(oct(s, 2)), 1.8, 0.95, { pri: 0 }));
      I.bell(S, t + 0.3, S.hz(oct(12, 3)), 0, 0.45, { ratio: 1.4, decay: 4, pri: 0 });
    },

    // breakfast: the poison was in them, and the shield held
    'shield-held'(S, t) {
      I.boom(S, t, 0, 0, 0.8, { len: 2.4 });
      I.timpani(S, t, S.hz(oct(0, 1)), 0, 1, { pri: 0 });
      [0, 4, 7, 12].forEach((s, i) => I.brass(S, t + i * 0.05, S.hz(oct(s, 2)), 2.4, 0.85, { pri: 0 }));
      [12, 16, 19].forEach((s, i) => I.bell(S, t + 0.2 + i * 0.09, S.hz(oct(s, 3)), 0, 0.5, { pri: 0 }));
    },

    /* The end of the day, off the top of the countdown: the drums, the
       bell three times, and the horns on the key, left to ring into the
       night. */
    'day-end'(S, t) {
      I.crash(S, t, 0, 0, 0.9);
      I.taikoEns(S, t, 0, 0, 1.0, { pri: 0 });
      I.granCassa(S, t, 0, 0, 0.8, { pri: 0 });
      I.braam(S, t, S.hz(oct(0, 1)), 2.4, 0.8);
      [0, 7, 12].forEach(s => I.brass(S, t, S.hz(oct(s, 2)), 2.2, 0.75, { pri: 0 }));
      [0, 0.55, 1.1].forEach(d => I.bell(S, t + d, S.hz(oct(0, 3)), 0, 0.5, { ratio: 1.4, decay: 3.2, pri: 0 }));
    },

    /* It is in them. Heard by the one who did it and nobody else, and
       quiet: a music-box note on the flat second over a low string. */
    'poison-done'(S, t) {
      I.celesta(S, t, S.hz(oct(13, 3)), 0, 0.5, { pri: 0 });
      I.celesta(S, t + 0.18, S.hz(oct(12, 3)), 0, 0.35, { pri: 0 });
      I.strings(S, t, S.hz(oct(0, 1)), 1.8, 0.5, { art: 'sustain', fam: 'cello', pri: 0, voices: 2 });
    },

    // a Faithful turned, heard only by the turret and the turned
    recruited(S, t) {
      I.braam(S, t, S.hz(oct(0, 1)), 2.2, 0.8);
      [0, 3, 6].forEach((s, i) => I.brass(S, t + i * 0.12, S.hz(oct(s, 2)), 1.6, 0.8, { pri: 0 }));
    },

    /* ---- the Wise One ---- */

    // the band turns: Claudia has one more thing to say
    'wise-call'(S, t) {
      I.crash(S, t, 0, 0, 0.6);
      I.braam(S, t, S.hz(oct(1, 1)), 2.4, 0.9);
      I.boom(S, t, 0, 0, 0.8, { len: 2.6 });
      I.taiko(S, t, 0, 0, 1.0, { pri: 0 });
      I.taiko(S, t + 0.18, 0, 0, 0.8, { pri: 0 });
      I.bell(S, t + 0.05, S.hz(oct(0, 3)), 0, 0.5, { ratio: 1.4, decay: 4, pri: 0 });
    },

    // the ten seconds are up: a roll and a reverse cymbal into the name
    'wise-rise'(S, t) {
      I.timpaniRoll(S, t, S.hz(oct(0, 1)), 2.8, 1);
      I.revCymbal(S, t + 2.8, 2.6, 0.8);
      [0, 7].forEach(s => I.choir(S, t, S.hz(oct(s, 3)), 2.9, 0.6, { pri: 0, a: 1.6, vowel: 'ah' }));
    },

    // the name, on the screens allowed to see it
    'wise-reveal'(S, t) {
      I.crash(S, t, 0, 0, 1.1);
      I.boom(S, t, 0, 0, 1, { len: 3.2 });
      I.timpani(S, t, S.hz(oct(0, 1)), 0, 1.2, { pri: 0 });
      I.taikoEns(S, t, 0, 0, 1.1, { pri: 0 });
      I.taiko(S, t + 0.14, 0, 0, 0.9, { pri: 0 });
      [0, 7, 12, 15, 19].forEach((s, i) => {
        I.brass(S, t + i * 0.04, S.hz(oct(s, 2)), 2.6, 0.9, { pri: 0 });
        I.choir(S, t + i * 0.04, S.hz(oct(s, 3)), 3, 0.75, { pri: 0, vowel: 'ah' });
      });
      [12, 15, 19, 24].forEach((s, i) => I.bell(S, t + 0.1 + i * 0.08, S.hz(oct(s, 3)), 0, 0.55, { pri: 0 }));
    },

    // the room is told one slate outranks the rest
    'overrule-warn'(S, t) {
      I.boom(S, t, 0, 0, 0.9, { len: 2.8 });
      [0, 1, 6].forEach((s, i) => I.brass(S, t + i * 0.03, S.hz(oct(s, 1)), 2.2, 0.85, { pri: 0, slow: true }));
      I.bell(S, t, S.hz(oct(0, 2)), 0, 0.8, { ratio: 1.4, decay: 5, pri: 0, peak: 0.1 });
      I.taiko(S, t, 0, 0, 1, { pri: 0 });
    },

    /* The Wise One overrules the table. The biggest hit in the game:
       three drums, the floor dropping, a crash, a braam, the whole choir
       and the horns on a chord that opens upward, and the bells. */
    overrule(S, t) {
      I.crash(S, t, 0, 0, 1.3);
      I.subDrop(S, t, 0, 0, 1.1, { len: 4 });
      I.anvil(S, t, 0, 0, 1.1, { pri: 0 });
      I.anvil(S, t + 0.5, 0, 0, 0.9, { pri: 0, f: 720 });
      [0, 0.12, 0.24, 0.5].forEach((d, i) => (i % 3 ? I.taiko : I.taikoEns)(S, t + d, 0, 0, i === 3 ? 1.2 : 1.05, { pri: 0 }));
      [0, 0.25, 0.5].forEach(d => [0, 7, 12].forEach(s => I.chant(S, t + d, S.hz(oct(s, 3)), 0.2, 0.9, { pri: 0 })));
      I.timpani(S, t, S.hz(oct(0, 1)), 0, 1.3, { pri: 0 });
      I.braam(S, t, S.hz(oct(0, 1)), 3.6, 1.2);
      [0, 7, 12, 15, 19, 24].forEach((s, i) => {
        I.brass(S, t + i * 0.035, S.hz(oct(s, 2)), 3.2, 0.95, { pri: 0 });
        I.choir(S, t + i * 0.035, S.hz(oct(s, 3)), 3.6, 0.85, { pri: 0, a: 0.06, vowel: 'ah' });
      });
      [0, 3, 7].forEach(s => I.strings(S, t, S.hz(oct(s, 4)), 3, 0.9, { art: 'tremolo', pri: 0, fam: 'hiStr' }));
      [12, 15, 19, 24, 27].forEach((s, i) => I.bell(S, t + 0.15 + i * 0.07, S.hz(oct(s, 3)), 0, 0.6, { pri: 0 }));
    },

    /* The last pouch of the night, on top of its colour: the biggest
       hit in the game, and the only place the fire uses everything the
       band has at once. */
    'last-pouch'(S, t) {
      I.subDrop(S, t, 0, 0, 1.1, { len: 4 });
      I.granCassa(S, t, 0, 0, 1.1, { pri: 0, decay: 2.4 });
      I.anvil(S, t, 0, 0, 1.0, { pri: 0 });
      I.anvil(S, t + 0.38, 0, 0, 0.8, { pri: 0, f: 720 });
      [0, 0.38].forEach(d => [0, 7, 12].forEach(s => I.chant(S, t + d, S.hz(oct(s, 3)), 0.22, 0.9, { pri: 0 })));
      [0, 7, 12].forEach((s, i) => I.lowBrass(S, t + i * 0.02, S.hz(oct(s, 2)), 3.2, 0.75, { pri: 0, art: 'sfz' }));
      [0, 0.38].forEach((d, i) => I.taikoEns(S, t + d, 0, 0, i ? 1.1 : 0.95, { pri: 0 }));
      I.timpani(S, t, S.hz(oct(0, 1)), 0, 1.2, { pri: 0 });
      [0, 7, 12].forEach(s => I.choir(S, t + 0.4, S.hz(oct(s, 3)), 3.2, 0.85, { pri: 0, a: 0.08, vowel: 'ah' }));
      I.crash(S, t, 0, 0, 1.0, { len: 3.4 });
    },

    // the walk to the fire reaches the fire
    'prefinale-arrive'(S, t) {
      I.timpaniRoll(S, t, S.hz(oct(0, 1)), 1.8, 1);
      I.crash(S, t + 1.8, 0, 0, 1);
      [0, 7, 12, 15, 19].forEach((s, i) => {
        I.brass(S, t + 1.8 + i * 0.04, S.hz(oct(s, 2)), 2.6, 0.9, { pri: 0 });
        I.choir(S, t + 1.8 + i * 0.04, S.hz(oct(s, 3)), 3, 0.7, { pri: 0, vowel: 'ah' });
      });
    },
  };

  return { STINGERS, pickFresh };
})();

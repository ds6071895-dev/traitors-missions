/* ------------------------------------------------------------------
   music/cues.js — the score itself, as data.

   One theme runs through the whole night. Four bars in D minor: a
   rise to the minor sixth that leans on it and falls back, a descent
   to the leading tone, a climb up the triad, and the old lament walk
   from the octave down to the dominant — so it never finishes, and
   every loop of it wants the next one. It is stated on a piano on the
   loch, answered by a cello, snarled by horns over the owl, played as
   a music box when the Traitor wins and turned to D major for the
   Faithful. The player never has to notice that it is one tune.

   A cue is a list of **sections**. A section is an arrangement: a
   tempo, a chord loop, and layers, each of which is an instrument, a
   one-bar pattern of velocities and a rule for which note to play.
   The engine in `music.js` plays whichever section it is told to and
   switches on a beat or a bar line. Old code that says `setGear(i)`
   gets `sections[gears[i]]`.

   Patterns are strings, one character a sixteenth:

     vel   '.' rest, '1'..'9' ninths of full, 'X' full
     pick  '.' rest, '0'..'5' chord tone (3 = root up an octave),
           'a' the fifth an octave down

   Octaves count from D1 (36.7 Hz): `oct: 2` puts the root at D3.
------------------------------------------------------------------ */
const MusicCues = (() => {

  /* ---------------- chords ---------------- */
  const Dm = [0, 3, 7], D = [0, 4, 7], Gm = [5, 8, 12], G = [5, 9, 12],
        A = [7, 11, 14], Bb = [8, 12, 15], C = [10, 14, 17], F = [3, 7, 10],
        Bm = [9, 12, 16], Am = [7, 10, 14],
        // the dark ones: the flat second (Phrygian, the sound of a knife)
        // and the diminished second degree
        Eb = [1, 5, 8], Edim = [4, 7, 10];

  /* A bar is a chord, or two chords for a half bar each. */
  const PROGRESSIONS = {
    // kept by name: reveal.js asks for these
    dread:   [Dm, Dm, Bb, Gm, Dm, C, Bb, A],
    hymn:    [Bb, F, Gm, C, Bb, Dm, C, Gm],
    tide:    [[0, 7, 14], [0, 7, 14], [8, 12, 19], [3, 7, 10],
              [5, 12, 17], [10, 14, 21], [8, 12, 15], [3, 10, 14]],
    descent: [[0, 7, 12], [0, 7, 12], Bb, C, Gm, C, Bb, [10, 14, 19]],
    verdict: [Dm, Dm, D, Dm, Bb, Bb, A, A],

    // the theme's own harmony, four bars and eight
    fire:    [Dm, [Gm, A], Dm, [Bb, A]],
    fate:    [Dm, [Gm, A], Dm, [Bb, A], Bb, Gm, A, Dm],
    victory: [D, [G, A], D, [Bm, A], Bm, G, A, D],

    // the fire's underscore
    floor:   [Dm, Dm, Bb, A, Gm, Gm, Bb, A],
    ballot:  [Dm, Dm, Bb, Bb, Gm, Gm, A, A],
    hold:    [Dm, Dm, Bb, A],
    pouch:   [Dm, Bb, Gm, A],

    // the day in the castle: a jig in D minor, driving and dark — the
    // G major it used to have was the light in it, and it has gone out;
    // the A major is the dominant, pulling back to D every eight bars
    jig:     [Dm, C, Gm, Dm, F, C, A, Dm],
    // the reel: the same run, Phrygian, with the flat second leaning in
    jigDark: [Dm, Eb, Dm, C, Bb, Gm, A, A],
    // the hunt: two bars a chord, the flat second, a long dominant
    hunt:    [Dm, Dm, Eb, Eb, Bb, Bb, [Gm, A], A],
    // four bars of dread, for a breakdown or a turn in the room
    omen:    [Dm, Eb, Dm, [Bb, A]],
    abyss:   [Dm, Bb, Gm, [Eb, A]],
    knife:   [Gm, Eb, [Edim, A], Dm],
    // the heroic minor: i, VI, III, VII — the sound of a trailer
    epic:    [Dm, Bb, F, C, Dm, Bb, C, A],

    // the castle: the turret's whisper, the vigil before the fire
    conclave: [Dm, [Dm, Bb], Gm, A, Dm, [Bb, Gm], [Gm, A], Dm],
    vigil:   [Dm, Bb, F, C, Gm, Bb, [Gm, A], A],
    table:   [Dm, Dm, Gm, Gm, Bb, Bb, A, A],
  };

  /* ---------------- the theme ---------------- */

  // [start sixteenth, semitone above D, length in sixteenths, velocity]
  const THEME_MINOR = [
    [0, 0, 4], [4, 7, 4], [8, 8, 6, 1.1], [14, 7, 2, 0.8],
    [16, 5, 4], [20, 3, 4], [24, 2, 4], [28, -1, 4, 0.9],
    [32, 0, 4], [36, 3, 4], [40, 7, 4], [44, 12, 4, 1.1],
    [48, 12, 4, 1.05], [52, 10, 2, 0.85], [54, 8, 2, 0.9], [56, 7, 8],
  ];
  const ANSWER_MINOR = [
    [64, 12, 6, 1.1], [70, 10, 2, 0.8], [72, 8, 4], [76, 7, 4],
    [80, 5, 4], [84, 3, 4], [88, 2, 4], [92, 3, 4, 0.85],
    [96, 7, 6, 1.05], [102, 5, 2, 0.8], [104, 3, 4], [108, 2, 4],
    [112, 0, 16, 1],
  ];
  const THEME_MAJOR = [
    [0, 0, 4], [4, 7, 4], [8, 9, 6, 1.1], [14, 7, 2, 0.8],
    [16, 5, 4], [20, 4, 4], [24, 2, 4], [28, -1, 4, 0.9],
    [32, 0, 4], [36, 4, 4], [40, 7, 4], [44, 12, 4, 1.1],
    [48, 12, 4, 1.05], [52, 11, 2, 0.85], [54, 9, 2, 0.9], [56, 7, 8],
  ];
  const ANSWER_MAJOR = [
    [64, 12, 6, 1.1], [70, 11, 2, 0.8], [72, 9, 4], [76, 7, 4],
    [80, 5, 4], [84, 4, 4], [88, 2, 4], [92, 4, 4, 0.85],
    [96, 7, 6, 1.05], [102, 5, 2, 0.8], [104, 4, 4], [108, 2, 4],
    [112, 0, 16, 1],
  ];
  /* The jig the castle works to: eight bars of six-eight in D Dorian,
     quavers on the fiddle, the first of each three leaned on. Minor
     enough to have somebody in the house with poison in their pocket,
     quick enough to make you run. [step, semitone above D, length] */
  function sixEight(bars) {
    const out = [];
    bars.forEach((bar, b) => bar.forEach((semi, q) => {
      if (semi === null) return;
      let len = 2;
      while (q + len / 2 < 6 && bar[q + len / 2] === null) len += 2;
      out.push([b * 12 + q * 2, semi, len, q % 3 === 0 ? 1.05 : 0.78]);
    }));
    return out;
  }
  const JIG = sixEight([
    [0, 3, 7, 12, 7, 3], [-2, 2, 5, 10, 5, 2], [5, 8, 12, 8, 5, 2], [3, 2, 0, null, 0, null],
    [10, 12, 15, 12, 10, 7], [5, 10, 5, 2, 5, 7], [7, 11, 14, 12, 11, 7], [12, null, null, 0, null, null],
  ]);
  /* The reel: the same quick six-eight, on the Phrygian run — up the
     triad, onto the flat second, and a chromatic slide down onto the
     dominant at the end that sounds like somebody on the stairs. */
  const REEL = sixEight([
    [7, 3, 0, 3, 7, 12], [8, 5, 1, 5, 8, 13], [12, 10, 7, 3, 2, 0], [-2, 2, 5, 10, 5, 2],
    [3, 5, 8, 12, 8, 5], [5, 8, 12, 10, 8, 5], [7, 11, 14, 11, 7, 2], [14, 13, 11, 7, null, null],
  ]);
  /* The hunt: a horn line for four-four, eight bars over `hunt`. Up the
     minor triad, onto the flat second and back, and a long climb
     through the dominant. Short, hard notes: a riff, not a song. */
  const HUNT = [
    [0, 0, 3, 1.1], [3, 3, 3], [6, 7, 2], [8, 5, 4], [12, 3, 4],
    [16, 3, 4], [20, 2, 4], [24, 0, 8, 1.05],
    [32, 1, 3, 1.1], [35, 5, 3], [38, 8, 2], [40, 7, 4], [44, 5, 4],
    [48, 5, 4], [52, 3, 4], [56, 1, 8, 1.05],
    [64, 8, 3, 1.1], [67, 10, 3], [70, 12, 2], [72, 10, 4], [76, 8, 4],
    [80, 8, 8], [88, 10, 4], [92, 12, 4, 1.1],
    [96, 12, 4, 1.1], [100, 8, 4], [104, 11, 4], [108, 7, 4],
    [112, 7, 10, 1.05], [124, 11, 4, 0.9],
  ];

  // the horn call: the theme's first bar, alone, as a signal
  const CALL = [[0, 0, 3, 1], [4, 7, 3, 1], [8, 8, 5, 1.1], [14, 7, 2, 0.8]];

  function motif(len, notes) {
    const at = {};
    for (const [s, semi, d, v] of notes) at[s] = { s: semi, d, v: v == null ? 1 : v };
    return { len, at };
  }

  // the same tune in 6/8: every bar squeezed from sixteen steps to twelve
  function compound(len, notes) {
    return motif(len / 16 * 12, notes.map(([s, semi, d, v]) => {
      const bar = Math.floor(s / 16), pos = s % 16;
      return [bar * 12 + Math.round(pos * 12 / 16), semi, Math.max(1, Math.round(d * 12 / 16)), v];
    }));
  }

  const MOTIFS = {
    theme:   motif(64, THEME_MINOR),
    fate:    motif(128, THEME_MINOR.concat(ANSWER_MINOR)),
    hymn:    motif(128, THEME_MAJOR.concat(ANSWER_MAJOR)),
    call:    motif(32, CALL),
    call16:  motif(16, CALL),
    theme68: compound(64, THEME_MINOR),
    jig:     motif(96, JIG),
    reel:    motif(96, REEL),
    hunt:    motif(128, HUNT),
    hymn68:  compound(128, THEME_MAJOR.concat(ANSWER_MAJOR)),
  };

  /* ---------------- pattern helpers ---------------- */

  const vel = (s) => s.split('').map(ch => ch === '.' ? 0 : ch === 'X' ? 1 : (+ch) / 9);
  const pick = (s) => s.split('').map(ch => ch === '.' ? null : ch === 'a' ? -1 : +ch);

  // one hit on the downbeat
  const BAR1 = vel('X...............');
  const HALF = vel('X.......X.......');
  const BEATS = vel('X...X...X...X...');

  // The ostinato. The cello does this under every vote the show has
  // ever had, and it is the one sound the fire could not do without.
  const OST16_V = vel('X3637363X3637686');
  const OST16_P = pick('0020302010203212');
  const OST8_V = vel('X.6.8.6.X.6.8.6.');
  const OST8_P = pick('0.2.3.2.0.2.1.2.');
  const ARP8_P = pick('0.1.2.3.4.3.2.1.');
  // the hunt's riff: root-root-fifth-below, pushed off the beat
  const HUNT16_V = vel('X.7.X7.7X.7.X7.8');
  const HUNT16_P = pick('0.0.0a.00.0.0a.1');
  // eights in the low synth, the modern part of the orchestra
  const PULSE8 = vel('X.6.7.6.X.6.7.6.');

  const L = (id, inst, spec) => Object.assign({ id, inst, gain: 1 }, spec);

  /* ---------------- the fire ----------------
     Every section is named after the moment it scores; `fireplace.js`
     calls them by name, in order, and the table in the plan is the
     order they arrive in. */

  const FINALE = {
    level: 0.84, room: 'hall', reverb: 0.34,
    gears: ['arrival', 'floor', 'ballot', 'afterTraitor'],
    sections: {

      /* The loch. A fifth on the low strings, the theme on a piano
         and then a cello, no drums at all. It is the only part of the
         fire that is allowed to be beautiful. */
      arrival: { bpm: 60, prog: 'fire', duckLift: 0.3, layers: [
        L('drone', 'strings', { pat: vel('X...............'), abs: 0, oct: 1, len: 32,
          art: 'sustain', gain: 0.9, when: b => b % 2 === 0, voices: 3 }),
        L('drone5', 'strings', { pat: BAR1, abs: 7, oct: 1, len: 32,
          art: 'sustain', gain: 0.55, when: b => b % 2 === 0, voices: 2 }),
        L('piano', 'piano', { motif: 'theme', oct: 3, gain: 0.9, when: b => b % 8 < 4 }),
        L('cello', 'strings', { motif: 'theme', oct: 2, gain: 1.05, art: 'sustain',
          fam: 'cello', when: b => b % 8 >= 4, peak: 0.07 }),
        L('air', 'choir', { pat: BAR1, pick: 'chord', oct: 3, len: 16, vowel: 'oo',
          gain: 0.35, a: 1.2 }),
      ]},

      /* The rules and the warning: the same, with the upper strings
         swelling in and a heartbeat under it. */
      warn: { bpm: 60, prog: 'fire', duckLift: 0.2, layers: [
        L('drone', 'strings', { pat: BAR1, abs: 0, oct: 1, len: 32, art: 'sustain',
          gain: 0.9, when: b => b % 2 === 0 }),
        L('swell', 'strings', { pat: HALF, pick: 'chord', oct: 3, len: 8, art: 'swell',
          gain: 0.5 }),
        L('cello', 'strings', { motif: 'theme', oct: 2, gain: 0.9, art: 'sustain', fam: 'cello' }),
        L('heart', 'heartbeat', { pat: HALF, gain: 0.55 }),
        L('air', 'choir', { pat: BAR1, pick: 'chord', oct: 3, len: 16, vowel: 'oo', gain: 0.4 }),
      ]},

      /* Thirty seconds each, with a microphone open. The music is
         underneath a conversation, so it is plucked, low and never
         melodic — and it ducks further whenever anybody talks. Each
         speaker who takes the floor pushes the intensity up a notch,
         and the layers gated on `minInt` arrive with them. */
      floor: { bpm: 72, prog: 'floor', form: ['AAB AAC', 'ABA ACC'], progs: { B: 'omen', C: 'abyss' },
        talkDuck: 0.32, duckLift: 0, layers: [
        L('pizz', 'pizz', { pat: OST8_V, pick: OST8_P, oct: 2, gain: 0.75, int: true }),
        L('heart', 'heartbeat', { pat: HALF, gain: 0.45 }),
        L('low', 'strings', { pat: BAR1, pick: 'root', oct: 1, len: 16, art: 'sustain',
          gain: 0.55, voices: 2 }),
        L('trem', 'strings', { pat: BAR1, pick: 'top', oct: 4, len: 16, art: 'tremolo',
          gain: 0.3, minInt: 0.85 }),
        L('timp', 'timpani', { pat: BAR1, pick: 'root', oct: 1, gain: 0.5, minInt: 1.0 }),
        L('pizz2', 'pizz', { pat: vel('...5...5...5...5'), pick: pick('...4...3...4...2'),
          oct: 2, gain: 0.5, minInt: 1.1 }),
        L('pulse', 'synthBass', { pat: PULSE8, pick: 'root', oct: 1, len: 2, gain: 0.4, parts: 'C' }),
        L('mm', 'choir', { pat: BAR1, pick: 'chord', oct: 2, len: 16, vowel: 'mm', gain: 0.3, parts: 'B' }),
      ]},

      /* The ballot. The cello goes to sixteenths, the drums arrive,
         and the horns quote the theme every other phrase. This is the
         cue the whole game has been waiting to play. */
      ballot: { bpm: 96, prog: 'ballot', form: 'AAAB', progs: { B: 'knife' }, layers: [
        L('ost', 'strings', { pat: OST16_V, pick: OST16_P, oct: 1, art: 'spic',
          gain: 1.05, int: true, fam: 'cello' }),
        L('ost2', 'strings', { pat: OST16_V, pick: OST16_P, oct: 2, art: 'spic',
          gain: 0.5, int: true, fam: 'hiStr', minInt: 0.9 }),
        L('taiko', 'taiko', { pat: vel('X.......X.....6.'), gain: 0.8, int: true }),
        L('pad', 'strings', { pat: BAR1, pick: 'chord', oct: 3, len: 16, art: 'swell',
          gain: 0.4 }),
        L('horn', 'brass', { motif: 'theme', oct: 2, gain: 0.7, when: b => b % 8 >= 4, parts: 'A' }),
        L('choir', 'choir', { pat: BAR1, pick: 'chord', oct: 3, len: 16, vowel: 'oh',
          gain: 0.4, minInt: 1.05 }),
        L('braam', 'braam', { pat: BAR1, pick: 'root', oct: 1, len: 24, gain: 0.55, parts: 'B',
          when: b => b % 2 === 0 }),
        L('bass', 'synthBass', { pat: PULSE8, pick: 'root', oct: 1, len: 2, gain: 0.5, parts: 'B' }),
      ]},

      /* Each name, said out loud. Stop-time: a tremolo and a heart,
         and the hits are stingers, one per name, climbing. */
      names: { bpm: 60, prog: 'hold', layers: [
        L('trem', 'strings', { pat: BAR1, pick: 'chord', oct: 2, len: 16, art: 'tremolo',
          gain: 0.45 }),
        L('low', 'strings', { pat: BAR1, pick: 'root', oct: 1, len: 16, art: 'sustain',
          gain: 0.6, voices: 2 }),
        L('heart', 'heartbeat', { pat: BAR1, gain: 0.45 }),
      ]},

      /* She asks for the pouch: strings trembling upwards, and the
         choir comes in on "oo". */
      pouch: { bpm: 60, prog: 'pouch', duckLift: 0.15, layers: [
        L('trem', 'strings', { pat: BAR1, pick: 'chord', oct: 3, len: 16, art: 'tremolo',
          gain: 0.55 }),
        L('choir', 'choir', { pat: BAR1, pick: 'chord', oct: 3, len: 16, vowel: 'oo',
          gain: 0.55, a: 0.9 }),
        L('low', 'strings', { pat: BAR1, pick: 'root', oct: 1, len: 16, art: 'sustain',
          gain: 0.7 }),
        L('timp', 'timpani', { pat: BAR1, pick: 'root', oct: 1, gain: 0.45,
          when: b => b % 2 === 1 }),
        L('heart', 'heartbeat', { pat: HALF, gain: 0.4 }),
      ]},

      /* The held beat. A heart at 57 — about one a second, which is
         what the old timer did — and a low D. Nothing else. The riser
         is started separately so it can be cut. */
      held: { bpm: 57, prog: 'hold', duckLift: 0, layers: [
        L('heart', 'heartbeat', { pat: BEATS, gain: 0.85, wet: 0.05 }),
        L('sub', 'strings', { pat: BAR1, abs: 0, oct: 1, len: 16, art: 'sustain',
          gain: 0.45, voices: 2 }),
      ]},

      /* After a Traitor burns: the ostinato again, faster and with
         everything on it. The room just got something right. */
      afterTraitor: { bpm: 104, prog: 'fire', layers: [
        L('ost', 'strings', { pat: OST16_V, pick: OST16_P, oct: 1, art: 'spic',
          gain: 1, int: true, fam: 'cello' }),
        L('taiko', 'taiko', { pat: vel('X.....7.X.....8.'), gain: 0.85, int: true }),
        L('horn', 'brass', { motif: 'theme', oct: 2, gain: 0.85 }),
        L('horn8', 'brass', { motif: 'theme', oct: 1, gain: 0.5 }),
        L('choir', 'choir', { pat: HALF, pick: 'chord', oct: 3, len: 8, vowel: 'ah', gain: 0.5 }),
        L('pad', 'strings', { pat: HALF, pick: 'chord', oct: 3, len: 8, art: 'sustain',
          gain: 0.35 }),
      ]},

      /* After a Faithful burns: the theme on a solo cello, slow, over
         strings that hardly move. Somebody innocent just went into
         the fire, and the music is the only thing that says so. */
      afterFaithful: { bpm: 64, prog: 'fire', layers: [
        L('cello', 'strings', { motif: 'theme', oct: 2, gain: 1.1, art: 'sustain',
          fam: 'cello', peak: 0.07, voices: 2 }),
        L('pad', 'strings', { pat: HALF, pick: 'chord', oct: 3, len: 8, art: 'swell', gain: 0.35 }),
        L('low', 'piano', { pat: BAR1, pick: 'root', oct: 1, gain: 0.55 }),
        L('air', 'choir', { pat: BAR1, pick: 'chord', oct: 3, len: 16, vowel: 'oo', gain: 0.3 }),
      ]},

      /* The last pouches: the pouch cue with a pulse under it. The
         key rises a semitone per pouch, set by the scene. */
      lastPouches: { bpm: 72, prog: 'pouch', layers: [
        L('pizz', 'pizz', { pat: OST8_V, pick: OST8_P, oct: 2, gain: 0.7 }),
        L('trem', 'strings', { pat: BAR1, pick: 'chord', oct: 3, len: 16, art: 'tremolo',
          gain: 0.5 }),
        L('choir', 'choir', { pat: BAR1, pick: 'chord', oct: 3, len: 16, vowel: 'oo', gain: 0.5 }),
        L('low', 'strings', { pat: BAR1, pick: 'root', oct: 1, len: 16, art: 'sustain', gain: 0.65 }),
        L('heart', 'heartbeat', { pat: HALF, gain: 0.5 }),
      ]},

      /* The verdicts. Each is the whole theme, eight bars, and each is
         a different piece of music. */
      verdictWin: { bpm: 76, prog: 'victory', layers: [
        L('violins', 'strings', { motif: 'hymn', oct: 3, gain: 0.9, art: 'sustain', fam: 'hiStr' }),
        L('horn', 'brass', { motif: 'hymn', oct: 2, gain: 0.6 }),
        L('choir', 'choir', { pat: HALF, pick: 'chord', oct: 3, len: 8, vowel: 'ah', gain: 0.6 }),
        L('celli', 'strings', { pat: HALF, pick: 'root', oct: 1, len: 8, art: 'sustain',
          gain: 0.7, fam: 'cello' }),
        L('timp', 'timpani', { pat: vel('X.......6.......'), pick: 'root', oct: 1, gain: 0.55 }),
        L('bells', 'bell', { pat: BAR1, pick: 'top', oct: 4, gain: 0.35 }),
        L('harp', 'harp', { pat: vel('X.6.7.6.X.6.7.6.'), pick: ARP8_P, oct: 3, gain: 0.45 }),
      ]},

      verdictLoss: { bpm: 58, prog: 'fate', layers: [
        L('cello', 'strings', { motif: 'fate', oct: 2, gain: 1.05, art: 'sustain',
          fam: 'cello', peak: 0.07, voices: 2 }),
        L('pad', 'strings', { pat: BAR1, pick: 'chord', oct: 3, len: 16, art: 'swell', gain: 0.3 }),
        L('piano', 'piano', { pat: vel('X.......5.......'), pick: pick('0.......2.......'),
          oct: 2, gain: 0.55 }),
        L('air', 'choir', { pat: BAR1, pick: 'chord', oct: 3, len: 16, vowel: 'oo', gain: 0.3 }),
      ]},

      /* The Traitor got away with it. Minor, triumphant, with bells
         tolling — the villain's anthem, not the victim's. */
      verdictTraitor: { bpm: 72, prog: 'fate', layers: [
        L('toll', 'bell', { pat: HALF, abs: 0, oct: 3, gain: 0.55, ratio: 1.4, decay: 3.5 }),
        L('choir', 'choir', { pat: HALF, pick: 'chord', oct: 3, len: 8, vowel: 'ah', gain: 0.65 }),
        L('horn', 'brass', { motif: 'fate', oct: 2, gain: 0.7 }),
        L('ost', 'strings', { pat: OST8_V, pick: OST8_P, oct: 1, art: 'spic', gain: 0.8,
          fam: 'cello' }),
        L('taiko', 'taiko', { pat: vel('X.......X.....5.'), gain: 0.7 }),
      ]},

      /* The credits, under the verdict panel: the same three, gentler,
         so the table can sit with the result for as long as it likes. */
      creditsWin: { bpm: 76, prog: 'victory', layers: [
        L('harp', 'harp', { pat: vel('X.6.7.6.X.6.7.6.'), pick: ARP8_P, oct: 3, gain: 0.5 }),
        L('violins', 'strings', { motif: 'hymn', oct: 3, gain: 0.55, art: 'sustain', fam: 'hiStr' }),
        L('celli', 'strings', { pat: HALF, pick: 'root', oct: 1, len: 8, art: 'sustain',
          gain: 0.5, fam: 'cello' }),
        L('air', 'choir', { pat: BAR1, pick: 'chord', oct: 3, len: 16, vowel: 'oo', gain: 0.3 }),
      ]},
      creditsLoss: { bpm: 58, prog: 'fate', layers: [
        L('piano', 'piano', { motif: 'fate', oct: 3, gain: 0.75 }),
        L('low', 'strings', { pat: BAR1, pick: 'root', oct: 1, len: 16, art: 'sustain', gain: 0.45 }),
        L('pad', 'strings', { pat: BAR1, pick: 'chord', oct: 3, len: 16, art: 'swell', gain: 0.22 }),
      ]},
      creditsTraitor: { bpm: 72, prog: 'fate', layers: [
        L('box', 'celesta', { motif: 'fate', oct: 4, gain: 0.6 }),
        L('ost', 'strings', { pat: OST8_V, pick: OST8_P, oct: 1, art: 'spic', gain: 0.5,
          fam: 'cello' }),
        L('air', 'choir', { pat: BAR1, pick: 'chord', oct: 3, len: 16, vowel: 'oo', gain: 0.32 }),
      ]},
    },
  };

  /* ---------------- the hill ----------------
     The main title. The theme, warm and slow, with a harp under it
     and the whole cathedral around it. No drums: a beat under a
     welcome makes it a trailer. */
  const CEREMONY = {
    level: 0.56, room: 'cathedral', reverb: 0.4,
    sections: {
      /* The welcome: the theme on the piano over a rolling ostinato,
         the choir and the drums arriving on the second half — big
         enough to feel like the opening titles, never cheerful. */
      title: { bpm: 92, prog: 'fire', form: ['AABC', 'ABAC'], progs: { C: 'omen' },
        duckLift: 0.25, talkDuck: 0.32, layers: [
        L('piano', 'piano', { motif: 'theme', oct: 3, gain: 0.75, parts: 'AB' }),
        L('horn', 'brass', { motif: 'theme', oct: 2, gain: 0.5, parts: 'B' }),
        L('braam', 'braam', { pat: BAR1, pick: 'root', oct: 1, len: 24, gain: 0.5, parts: 'C',
          when: b => b % 2 === 0 }),
        L('bass', 'synthBass', { pat: PULSE8, pick: 'root', oct: 1, len: 2, gain: 0.45, parts: 'BC' }),
        L('ost', 'strings', { pat: OST16_V, pick: OST16_P, oct: 1, art: 'spic', gain: 0.62, fam: 'cello' }),
        L('harp', 'harp', { pat: vel('X.5.6.5.X.5.6.5.'), pick: ARP8_P, oct: 3, gain: 0.34 }),
        L('pad', 'strings', { pat: HALF, pick: 'chord', oct: 3, len: 8, art: 'swell', gain: 0.32 }),
        L('choir', 'choir', { pat: HALF, pick: 'chord', oct: 3, len: 8, vowel: 'ah', gain: 0.38,
          parts: 'BC' }),
        L('taiko', 'taiko', { pat: vel('X.......X...6...'), gain: 0.5 }),
        L('taikoC', 'taiko', { pat: vel('..6.....7.6...7.'), gain: 0.45, parts: 'C' }),
        L('timp', 'timpani', { pat: vel('X.............7.'), pick: 'root', oct: 1, gain: 0.4, when: b => b % 2 === 1 }),
      ]},

      /* The Wise One. The band turns before Claudia says a word: the
         horn call alone over the flat second, a braam every other bar,
         the drums walking in underneath. It means "something else is
         about to happen", and nobody has been told what yet. */
      wiseCall: { bpm: 96, prog: 'omen', duckLift: 0.3, talkDuck: 0.32, layers: [
        L('call', 'brass', { motif: 'call', oct: 2, gain: 0.8 }),
        L('braam', 'braam', { pat: BAR1, pick: 'root', oct: 1, len: 24, gain: 0.6, when: b => b % 2 === 0 }),
        L('ost', 'strings', { pat: OST16_V, pick: OST16_P, oct: 1, art: 'spic', gain: 0.7, fam: 'cello' }),
        L('choir', 'choir', { pat: BAR1, pick: 'chord', oct: 3, len: 16, vowel: 'oo', gain: 0.45 }),
        L('taiko', 'taiko', { pat: vel('X.....6.X.......'), gain: 0.6 }),
        L('timp', 'timpani', { pat: vel('X.......X...7.7.'), pick: 'root', oct: 1, gain: 0.45, when: b => b % 2 === 1 }),
      ]},
      /* Ten seconds while the Traitors choose: a clock, a heart, the
         strings shivering on the knife's chords. Everybody hears the
         same ten seconds, whoever is choosing. */
      wiseClock: { bpm: 120, prog: 'knife', duckLift: 0, layers: [
        L('heart', 'heartbeat', { pat: BEATS, gain: 0.7 }),
        L('clock', 'pizz', { pat: vel('X.6.X.6.X.6.X.6.'), pick: pick('3.3.3.3.3.3.3.3.'), oct: 3, gain: 0.5 }),
        L('trem', 'strings', { pat: BAR1, pick: 'chord', oct: 3, len: 16, art: 'tremolo', gain: 0.5 }),
        L('low', 'strings', { pat: BAR1, pick: 'root', oct: 1, len: 16, art: 'sustain', gain: 0.6, voices: 2 }),
        L('pulse', 'synthBass', { pat: PULSE8, pick: 'root', oct: 1, len: 2, gain: 0.45 }),
        L('taiko', 'taiko', { pat: vel('X.........7.....'), gain: 0.5 }),
      ]},
      /* The rise: the roll that keeps climbing, the choir coming up
         under it, and nothing resolving until the name lands. */
      wiseRise: { bpm: 84, prog: 'hold', duckLift: 0, layers: [
        L('roll', 'timpani', { pat: vel('3344556677889XXX'), pick: 'root', oct: 1, gain: 0.6 }),
        L('trem', 'strings', { pat: BAR1, pick: 'chord', oct: 3, len: 16, art: 'tremolo', gain: 0.6 }),
        L('choir', 'choir', { pat: BAR1, pick: 'chord', oct: 3, len: 16, vowel: 'ah', gain: 0.5 }),
        L('low', 'strings', { pat: BAR1, abs: 0, oct: 1, len: 16, art: 'sustain', gain: 0.6, voices: 2 }),
      ]},
      /* And the Wise One is named — to two screens. The theme, whole,
         on the horns, which is the first time the hill has heard it. */
      wiseReveal: { bpm: 100, prog: 'fate', duckLift: 0.25, talkDuck: 0.32, layers: [
        L('horn', 'brass', { motif: 'fate', oct: 2, gain: 0.85 }),
        L('choir', 'choir', { pat: HALF, pick: 'chord', oct: 3, len: 8, vowel: 'ah', gain: 0.55 }),
        L('ost', 'strings', { pat: OST16_V, pick: OST16_P, oct: 1, art: 'spic', gain: 0.85, fam: 'cello' }),
        L('taiko', 'taiko', { pat: vel('X.....6.X.6...7.'), gain: 0.7 }),
        L('timp', 'timpani', { pat: vel('X.......X.......'), pick: 'root', oct: 1, gain: 0.5 }),
        L('crash', 'crash', { pat: BAR1, gain: 0.4, when: b => b % 4 === 0 }),
      ]},
    },
  };

  /* ---------------- the front door ----------------
     The title. The hill states the theme; this one *announces* it, at a
     run, the way a trailer does. Same four bars, played as an overture: `gate` is the tune alone
     on a piano with a harp and the celli under it, and `anthem` is
     what happens when the horns, the choir and two drums arrive and
     the harmony opens out into the full eight bars.

     It is the first thing anybody hears, so it earns the brass rather
     than opening with it — `main.js` lifts the section a pass in, on
     a bar line, behind a reverse cymbal. It loops there; a menu is
     allowed to be a wall of sound, it is not allowed to end. */
  const TITLE = {
    level: 0.66, room: 'cathedral', reverb: 0.42,
    gears: ['gate', 'anthem'],
    sections: {
      gate: { bpm: 104, prog: 'fire', duckLift: 0.3, talkDuck: 0.3, layers: [
        L('piano', 'piano', { motif: 'theme', oct: 3, gain: 0.8 }),
        L('ost', 'strings', { pat: OST16_V, pick: OST16_P, oct: 1, art: 'spic', gain: 0.6, fam: 'cello' }),
        L('celli', 'strings', { pat: BAR1, pick: 'root', oct: 1, len: 16, art: 'sustain',
          gain: 0.5, fam: 'cello' }),
        L('pad', 'strings', { pat: HALF, pick: 'chord', oct: 3, len: 8, art: 'swell', gain: 0.3, voices: 2 }),
        L('taiko', 'taiko', { pat: vel('X.......X.......'), gain: 0.42 }),
        L('timp', 'timpani', { pat: vel('X.............7.'), pick: 'root', oct: 1, gain: 0.38,
          when: b => b % 2 === 1 }),
      ]},

      /* Eight bars, because an anthem needs somewhere to go: the
         theme over the first four and its answer over the second, the
         ostinato driving underneath, drums on every beat that matters. */
      anthem: { bpm: 104, prog: 'fate', duckLift: 0.3, talkDuck: 0.3, layers: [
        L('horn', 'brass', { motif: 'fate', oct: 2, gain: 0.85 }),
        L('violins', 'strings', { motif: 'fate', oct: 3, art: 'sustain', fam: 'hiStr', gain: 0.55 }),
        L('choir', 'choir', { pat: HALF, pick: 'chord', oct: 3, len: 8, vowel: 'ah', gain: 0.55 }),
        L('ost', 'strings', { pat: OST16_V, pick: OST16_P, oct: 1, art: 'spic', gain: 0.85, fam: 'cello' }),
        L('ost2', 'strings', { pat: OST16_V, pick: OST16_P, oct: 2, art: 'spic', gain: 0.4, fam: 'hiStr' }),
        L('celli', 'strings', { pat: BAR1, pick: 'root', oct: 1, len: 16, art: 'sustain',
          gain: 0.6, fam: 'cello' }),
        L('taiko', 'taiko', { pat: vel('X.....6.X.6...7.'), gain: 0.72 }),
        L('tom', 'tom', { pat: vel('....6.......6.7.'), gain: 0.4 }),
        L('timp', 'timpani', { pat: vel('X.......X...X.X.'), pick: 'root', oct: 1, gain: 0.48 }),
        L('crash', 'crash', { pat: BAR1, gain: 0.5, when: b => b % 4 === 0 }),
      ]},
    },
  };

  /* ---------------- the round table ----------------
     Candles, a ring of chairs, and an argument. Everything under the
     discussion is low and rhythmic and ducks hard under any voice;
     the slate is a heart and a clock; each name turned is a hit; the
     banishment is the whole hall at once, then either the hymn's
     relief or the lament. */
  const ROUNDTABLE = {
    level: 0.82, room: 'hall', reverb: 0.36,
    gears: ['gather', 'debate', 'slate', 'reveal'],
    sections: {
      gather: { bpm: 66, prog: 'table', form: 'AABC', progs: { C: 'omen' }, duckLift: 0.3, layers: [
        L('drone', 'strings', { pat: BAR1, abs: 0, oct: 1, len: 32, art: 'sustain',
          gain: 0.8, when: b => b % 2 === 0, voices: 3 }),
        L('harp', 'harp', { pat: vel('X.5.6.5.X.5.6.5.'), pick: ARP8_P, oct: 2, gain: 0.45 }),
        L('cello', 'strings', { motif: 'theme', oct: 2, gain: 0.85, art: 'sustain',
          fam: 'cello', when: b => b % 8 >= 4, parts: 'AB' }),
        L('air', 'choir', { pat: BAR1, pick: 'chord', oct: 3, len: 16, vowel: 'oo', gain: 0.32 }),
        L('pizz', 'pizz', { pat: OST8_V, pick: OST8_P, oct: 2, gain: 0.5, parts: 'BC' }),
        L('heart', 'heartbeat', { pat: HALF, gain: 0.4, parts: 'C' }),
        L('trem', 'strings', { pat: BAR1, pick: 'top', oct: 4, len: 16, art: 'tremolo', gain: 0.25, parts: 'C' }),
      ]},
      /* Under the argument: A is the pizz and the low strings, B turns
         the harmony to the flat second with a choir humming under it,
         C is the abyss chords with a pulse in the low synth and the
         drums a long way off. Never a tune: it is underneath voices. */
      debate: { bpm: 84, prog: 'table', form: ['AABA CB', 'ABAC BC', 'AACA BB'],
        progs: { B: 'omen', C: 'abyss' }, talkDuck: 0.28, duckLift: 0, layers: [
        L('pizz', 'pizz', { pat: OST8_V, pick: OST8_P, oct: 2, gain: 0.7, int: true }),
        L('low', 'strings', { pat: BAR1, pick: 'root', oct: 1, len: 16, art: 'sustain',
          gain: 0.5, voices: 2 }),
        L('heart', 'heartbeat', { pat: HALF, gain: 0.35, minInt: 0.8 }),
        L('tom', 'tom', { pat: vel('X.....6.....5...'), gain: 0.35, minInt: 0.95 }),
        L('trem', 'strings', { pat: BAR1, pick: 'top', oct: 4, len: 16, art: 'tremolo',
          gain: 0.25, minInt: 1.1 }),
        L('mm', 'choir', { pat: BAR1, pick: 'chord', oct: 2, len: 16, vowel: 'mm', gain: 0.3, parts: 'B' }),
        L('timp', 'timpani', { pat: vel('X.......6.......'), pick: 'root', oct: 1, gain: 0.35, parts: 'B',
          when: b => b % 2 === 1 }),
        L('pulse', 'synthBass', { pat: PULSE8, pick: 'root', oct: 1, len: 2, gain: 0.4, parts: 'C' }),
        L('taiko', 'taiko', { pat: vel('X.........6.....'), gain: 0.35, parts: 'C' }),
      ]},
      slate: { bpm: 60, prog: 'hold', layers: [
        L('heart', 'heartbeat', { pat: BEATS, gain: 0.7 }),
        L('clock', 'pizz', { pat: vel('X...6...X...6...'), pick: pick('0...0...0...0...'),
          oct: 3, gain: 0.45 }),
        L('trem', 'strings', { pat: BAR1, pick: 'chord', oct: 2, len: 16, art: 'tremolo', gain: 0.4 }),
        L('sub', 'strings', { pat: BAR1, abs: 0, oct: 1, len: 16, art: 'sustain', gain: 0.5 }),
      ]},
      reveal: { bpm: 60, prog: 'pouch', duckLift: 0.15, layers: [
        L('trem', 'strings', { pat: BAR1, pick: 'chord', oct: 3, len: 16, art: 'tremolo', gain: 0.55 }),
        L('choir', 'choir', { pat: BAR1, pick: 'chord', oct: 3, len: 16, vowel: 'oo', gain: 0.55 }),
        L('low', 'strings', { pat: BAR1, pick: 'root', oct: 1, len: 16, art: 'sustain', gain: 0.7 }),
        L('timp', 'timpani', { pat: BAR1, pick: 'root', oct: 1, gain: 0.5, when: b => b % 2 === 1 }),
      ]},
      /* Before they say what they are: a roll on the timpani that keeps
         getting louder, the strings shivering, a heart under it. */
      drumroll: { bpm: 76, prog: 'hold', duckLift: 0, layers: [
        L('roll', 'timpani', { pat: vel('3344556677889XXX'), pick: 'root', oct: 1, gain: 0.55 }),
        L('trem', 'strings', { pat: BAR1, pick: 'chord', oct: 3, len: 16, art: 'tremolo', gain: 0.5 }),
        L('low', 'strings', { pat: BAR1, abs: 0, oct: 1, len: 16, art: 'sustain', gain: 0.6, voices: 2 }),
        L('heart', 'heartbeat', { pat: BEATS, gain: 0.55 }),
      ]},
      /* And then they walk out. Everything the band has: the theme on
         the horns, the choir, the ostinato, the big drums. */
      walkout: { bpm: 100, prog: 'fate', duckLift: 0.2, layers: [
        L('horn', 'brass', { motif: 'fate', oct: 2, gain: 0.9 }),
        L('horn8', 'brass', { motif: 'fate', oct: 1, gain: 0.5 }),
        L('choir', 'choir', { pat: HALF, pick: 'chord', oct: 3, len: 8, vowel: 'ah', gain: 0.62 }),
        L('ost', 'strings', { pat: OST16_V, pick: OST16_P, oct: 1, art: 'spic', gain: 0.95, fam: 'cello' }),
        L('ost2', 'strings', { pat: OST16_V, pick: OST16_P, oct: 2, art: 'spic', gain: 0.45, fam: 'hiStr' }),
        L('taiko', 'taiko', { pat: vel('X.7.X.7.X.7.X.8X'), gain: 0.85 }),
        L('timp', 'timpani', { pat: vel('X.......X.......'), pick: 'root', oct: 1, gain: 0.6 }),
        L('crash', 'crash', { pat: BAR1, gain: 0.45, when: b => b % 4 === 0 }),
        L('bells', 'bell', { pat: BAR1, pick: 'top', oct: 4, gain: 0.25 }),
      ]},
      /* The Wise One's slate, last, with the room told it outranks
         theirs. The roll and the choir climb for as long as Claudia
         holds it; the riser rides on top. */
      overruleRise: { bpm: 88, prog: 'abyss', duckLift: 0.1, layers: [
        L('roll', 'timpani', { pat: vel('445566778899XXXX'), pick: 'root', oct: 1, gain: 0.65 }),
        L('trem', 'strings', { pat: BAR1, pick: 'chord', oct: 3, len: 16, art: 'tremolo', gain: 0.6 }),
        L('trem2', 'strings', { pat: BAR1, pick: 'top', oct: 4, len: 16, art: 'tremolo', gain: 0.35 }),
        L('choir', 'choir', { pat: BAR1, pick: 'chord', oct: 3, len: 16, vowel: 'ah', gain: 0.6 }),
        L('low', 'braam', { pat: BAR1, pick: 'root', oct: 1, len: 16, gain: 0.45, when: b => b % 2 === 0 }),
        L('heart', 'heartbeat', { pat: BEATS, gain: 0.6 }),
      ]},
      /* The overrule. Everything the band owns at once, faster than
         anything else at the table: the theme on two octaves of horns
         and the violins, the choir, both ostinati, the low synth, and
         the drums on every beat that will take one. */
      overrule: { bpm: 116, prog: 'epic', duckLift: 0.3, talkDuck: 0.4, layers: [
        L('horn', 'brass', { motif: 'fate', oct: 2, gain: 0.95 }),
        L('horn8', 'brass', { motif: 'fate', oct: 1, gain: 0.6 }),
        L('violins', 'strings', { motif: 'fate', oct: 3, art: 'sustain', fam: 'hiStr', gain: 0.6 }),
        L('choir', 'choir', { pat: HALF, pick: 'chord', oct: 3, len: 8, vowel: 'ah', gain: 0.7 }),
        L('ost', 'strings', { pat: OST16_V, pick: OST16_P, oct: 1, art: 'spic', gain: 1, fam: 'cello' }),
        L('ost2', 'strings', { pat: OST16_V, pick: OST16_P, oct: 2, art: 'spic', gain: 0.5, fam: 'hiStr' }),
        L('pulse', 'synthBass', { pat: PULSE8, pick: 'root', oct: 1, len: 2, gain: 0.5 }),
        L('braam', 'braam', { pat: BAR1, pick: 'root', oct: 1, len: 16, gain: 0.45, when: b => b % 4 === 0 }),
        L('taiko', 'taiko', { pat: vel('X.7.X.7.X.7.X.8X'), gain: 0.9 }),
        L('tom', 'tom', { pat: vel('....6.......6.7.'), gain: 0.45 }),
        L('timp', 'timpani', { pat: vel('X.......X...X.X.'), pick: 'root', oct: 1, gain: 0.6 }),
        L('crash', 'crash', { pat: BAR1, gain: 0.5, when: b => b % 2 === 0 }),
        L('bells', 'bell', { pat: HALF, pick: 'top', oct: 4, gain: 0.25 }),
      ]},
      banishTraitor: FINALE.sections.afterTraitor,
      banishFaithful: FINALE.sections.afterFaithful,
    },
  };

  /* ---------------- the night ----------------
     The castle going dark. A celesta over tremolo strings while the
     house goes to bed; the turret is low voices on "mm" and a taiko a
     long way off; the deed is a braam and then nothing; breakfast is
     the theme on a piano in daylight, too calm by half, and the
     absence is a single cello holding the root. */
  const MURDER = {
    level: 0.8, room: 'cathedral', reverb: 0.42,
    gears: ['nightfall', 'conclave', 'deed', 'breakfast'],
    sections: {
      nightfall: { bpm: 54, prog: 'conclave', form: ['AB', 'AABB'], progs: { B: 'omen' },
        duckLift: 0.25, layers: [
        L('box', 'celesta', { motif: 'theme', oct: 4, gain: 0.55, parts: 'A' }),
        L('toll', 'bell', { pat: HALF, abs: 0, oct: 3, gain: 0.3, ratio: 1.4, decay: 3.5, parts: 'B' }),
        L('mm', 'choir', { pat: BAR1, pick: 'chord', oct: 2, len: 16, vowel: 'mm', gain: 0.38, parts: 'B' }),
        L('trem', 'strings', { pat: BAR1, pick: 'chord', oct: 3, len: 16, art: 'tremolo', gain: 0.3 }),
        L('sub', 'strings', { pat: BAR1, abs: 0, oct: 1, len: 32, art: 'sustain', gain: 0.6,
          when: b => b % 2 === 0, voices: 2 }),
        L('air', 'choir', { pat: BAR1, pick: 'chord', oct: 3, len: 16, vowel: 'oo', gain: 0.28 }),
      ]},
      conclave: { bpm: 63, prog: 'conclave', form: 'AAB', progs: { B: 'knife' }, talkDuck: 0.3, duckLift: 0, layers: [
        L('mm', 'choir', { pat: BAR1, pick: 'chord', oct: 2, len: 16, vowel: 'mm', gain: 0.55 }),
        L('taiko', 'taiko', { pat: vel('X.......7.......'), gain: 0.55 }),
        L('low', 'strings', { pat: BAR1, pick: 'root', oct: 1, len: 16, art: 'sustain',
          gain: 0.6, fam: 'cello', voices: 2 }),
        L('pulse', 'heartbeat', { pat: HALF, gain: 0.4, minInt: 0.8 }),
        L('bell', 'bell', { pat: vel('X...............'), pick: 'top', oct: 3, gain: 0.25,
          when: b => b % 4 === 3 }),
        L('pulse', 'synthBass', { pat: vel('X.....6.X.......'), pick: 'root', oct: 1, len: 3, gain: 0.5 }),
        L('braam', 'braam', { pat: BAR1, pick: 'root', oct: 1, len: 28, gain: 0.5, parts: 'B',
          when: b => b % 2 === 0 }),
      ]},
      deed: { bpm: 50, prog: 'hold', duckLift: 0, layers: [
        L('heart', 'heartbeat', { pat: BEATS, gain: 0.85 }),
        L('sub', 'strings', { pat: BAR1, abs: 0, oct: 1, len: 16, art: 'sustain', gain: 0.55 }),
      ]},
      dawn: { bpm: 66, prog: 'vigil', duckLift: 0.3, layers: [
        L('harp', 'harp', { pat: vel('X.6.7.6.X.6.7.6.'), pick: ARP8_P, oct: 3, gain: 0.45 }),
        L('pad', 'strings', { pat: BAR1, pick: 'chord', oct: 3, len: 16, art: 'swell', gain: 0.35 }),
        L('air', 'choir', { pat: BAR1, pick: 'chord', oct: 3, len: 16, vowel: 'oo', gain: 0.25 }),
      ]},
      breakfast: { bpm: 84, prog: 'fire', form: ['AABC', 'ABAC'], progs: { B: 'omen', C: 'abyss' },
        talkDuck: 0.35, duckLift: 0.2, layers: [
        L('piano', 'piano', { motif: 'theme', oct: 3, gain: 0.7, parts: 'A' }),
        L('mm', 'choir', { pat: BAR1, pick: 'chord', oct: 2, len: 16, vowel: 'mm', gain: 0.3, parts: 'BC' }),
        L('heart', 'heartbeat', { pat: HALF, gain: 0.35, parts: 'C' }),
        L('harp', 'harp', { pat: vel('X.5.6.5.X.5.6.5.'), pick: ARP8_P, oct: 3, gain: 0.3 }),
        L('pizz', 'pizz', { pat: vel('X...6...X...6...'), pick: pick('0...2...1...2...'), oct: 2, gain: 0.5 }),
        L('low', 'strings', { pat: BAR1, pick: 'root', oct: 1, len: 16, art: 'sustain', gain: 0.4 }),
        L('tick', 'pizz', { pat: vel('..4...4...4...4.'), pick: pick('..4...4...4...4.'), oct: 3,
          gain: 0.3, minInt: 0.9 }),
      ]},
      absence: { bpm: 58, prog: 'fate', layers: [
        L('cello', 'strings', { motif: 'fate', oct: 2, gain: 1.0, art: 'sustain', fam: 'cello',
          peak: 0.07, voices: 2 }),
        L('toll', 'bell', { pat: HALF, abs: 0, oct: 3, gain: 0.4, ratio: 1.4, decay: 3.5 }),
        L('air', 'choir', { pat: BAR1, pick: 'chord', oct: 3, len: 16, vowel: 'oo', gain: 0.3 }),
      ]},
      saved: FINALE.sections.verdictWin,
    },
  };

  /* ---------------- the day ----------------
     Three minutes loose in the castle with a list of jobs, and a
     Traitor somewhere in it. Three arrangements, one a day in turn
     (`Music.dayMusic`): the jig, in D minor now, with its light put
     out; the hunt, a four-four riff on the flat second for horns and a
     low synth; and the reel, the Phrygian six-eight. Each has a form —
     A is the tune, B is the tune with everything on it, C is a
     breakdown that drops to drums, braams and a choir on the omen
     chords — so three minutes of it is not one minute three times.
     When the bell goes for the last thirty seconds it speeds up and
     the brass takes the tune. */
  const DAY_FORMS = ['AABA CABC', 'ABAC ABCC', 'AACB ACBB'];
  const TASKS = {
    level: 0.6, room: 'hall', reverb: 0.24,
    gears: ['work', 'bell'],
    sections: {
      work: { bpm: 120, steps: 12, prog: 'jig', form: DAY_FORMS, progs: { C: 'omen' },
        alt: ['workHunt', 'workReel'], talkDuck: 0.42, duckLift: 0.12, layers: [
        L('fiddle', 'strings', { motif: 'jig', oct: 3, art: 'spic', fam: 'hiStr', gain: 0.62, parts: 'AB' }),
        L('horn', 'brass', { motif: 'jig', oct: 2, gain: 0.42, parts: 'B' }),
        L('ost', 'strings', { pat: vel('X.6.7.X.6.7.'), pick: pick('0.2.3.0.2.1.'), oct: 1, art: 'spic',
          fam: 'cello', gain: 0.6 }),
        L('bass', 'synthBass', { pat: vel('X.....X.6...'), pick: 'root', oct: 1, len: 2, gain: 0.7, parts: 'BC' }),
        L('drone', 'strings', { pat: vel('X...........'), abs: 0, oct: 1, len: 24, art: 'sustain',
          gain: 0.3, when: b => b % 2 === 0, voices: 2, parts: 'A' }),
        L('choir', 'choir', { pat: vel('X...........'), pick: 'chord', oct: 3, len: 12, vowel: 'ah', gain: 0.32,
          parts: 'BC' }),
        L('bodhran', 'tom', { pat: vel('X.4.5.7.4.5.'), gain: 0.34 }),
        L('taiko', 'taiko', { pat: vel('X.....6.....'), gain: 0.45, parts: 'AB' }),
        L('taikoC', 'taiko', { pat: vel('X..6..X.7.8.'), gain: 0.7, parts: 'C' }),
        L('braam', 'braam', { pat: vel('X...........'), pick: 'root', oct: 1, len: 18, gain: 0.55,
          parts: 'C', when: b => b % 2 === 0 }),
        L('trem', 'strings', { pat: vel('X...........'), pick: 'top', oct: 4, len: 12, art: 'tremolo',
          gain: 0.22, parts: 'C' }),
        L('call', 'brass', { motif: 'call', oct: 2, gain: 0.35, when: b => b % 8 === 7, parts: 'A' }),
      ]},
      workHunt: { bpm: 128, prog: 'hunt', form: DAY_FORMS, progs: { C: 'knife' },
        talkDuck: 0.42, duckLift: 0.12, layers: [
        L('riff', 'strings', { pat: HUNT16_V, pick: HUNT16_P, oct: 1, art: 'spic', fam: 'cello', gain: 0.75 }),
        L('riff2', 'strings', { pat: HUNT16_V, pick: HUNT16_P, oct: 2, art: 'spic', fam: 'hiStr', gain: 0.35,
          parts: 'BC' }),
        L('bass', 'synthBass', { pat: PULSE8, pick: 'root', oct: 1, len: 2, gain: 0.75 }),
        L('horn', 'brass', { motif: 'hunt', oct: 2, gain: 0.6, parts: 'B' }),
        L('lead', 'strings', { motif: 'hunt', oct: 3, art: 'spic', fam: 'hiStr', gain: 0.5, parts: 'A' }),
        L('choir', 'choir', { pat: HALF, pick: 'chord', oct: 3, len: 8, vowel: 'oh', gain: 0.35, parts: 'BC' }),
        L('taiko', 'taiko', { pat: vel('X.....7.X.6...7.'), gain: 0.6 }),
        L('tom', 'tom', { pat: vel('....6.....6.7.8.'), gain: 0.32, parts: 'BC' }),
        L('braam', 'braam', { pat: BAR1, pick: 'root', oct: 1, len: 24, gain: 0.6,
          parts: 'C', when: b => b % 2 === 0 }),
        L('crash', 'crash', { pat: BAR1, gain: 0.35, when: b => b % 4 === 0, parts: 'B' }),
      ]},
      workReel: { bpm: 132, steps: 12, prog: 'jigDark', form: DAY_FORMS, progs: { C: 'abyss' },
        talkDuck: 0.42, duckLift: 0.12, layers: [
        L('fiddle', 'strings', { motif: 'reel', oct: 3, art: 'spic', fam: 'hiStr', gain: 0.6, parts: 'AB' }),
        L('box', 'celesta', { motif: 'reel', oct: 4, gain: 0.16, parts: 'A' }),
        L('horn', 'brass', { motif: 'reel', oct: 2, gain: 0.4, parts: 'B' }),
        L('ost', 'strings', { pat: vel('X6X6X6X6X6X6'), pick: pick('0a0a020a0a01'), oct: 1, art: 'spic',
          fam: 'cello', gain: 0.62 }),
        L('bass', 'synthBass', { pat: vel('X..7..X..7..'), pick: 'root', oct: 1, len: 2, gain: 0.65 }),
        L('choir', 'choir', { pat: vel('X...........'), pick: 'chord', oct: 3, len: 12, vowel: 'mm', gain: 0.34,
          parts: 'BC' }),
        L('bodhran', 'tom', { pat: vel('X.4.6.X.4.7.'), gain: 0.38 }),
        L('taiko', 'taiko', { pat: vel('X.....7.....'), gain: 0.5 }),
        L('braam', 'braam', { pat: vel('X...........'), pick: 'root', oct: 1, len: 18, gain: 0.55,
          parts: 'C', when: b => b % 2 === 0 }),
        L('toll', 'bell', { pat: vel('X...........'), abs: 0, oct: 3, gain: 0.3, ratio: 1.4, decay: 3,
          parts: 'C', when: b => b % 2 === 1 }),
      ]},
      bell: { bpm: 136, steps: 12, prog: 'jig', alt: ['bellHunt', 'bellReel'], talkDuck: 0.42, layers: [
        L('fiddle', 'strings', { motif: 'jig', oct: 3, art: 'spic', fam: 'hiStr', gain: 0.7 }),
        L('horn', 'brass', { motif: 'jig', oct: 2, gain: 0.45 }),
        L('ost', 'strings', { pat: vel('X6X6X6X6X6X6'), pick: pick('020302010203'), oct: 1, art: 'spic',
          fam: 'cello', gain: 0.7 }),
        L('bass', 'synthBass', { pat: vel('X.....X.7...'), pick: 'root', oct: 1, len: 2, gain: 0.7 }),
        L('drone', 'strings', { pat: vel('X...........'), abs: 0, oct: 1, len: 12, art: 'sustain', gain: 0.36 }),
        L('choir', 'choir', { pat: vel('X...........'), pick: 'chord', oct: 3, len: 12, vowel: 'ah', gain: 0.42 }),
        L('bodhran', 'tom', { pat: vel('X.5.6.X.5.7.'), gain: 0.48 }),
        L('taiko', 'taiko', { pat: vel('X.....7..6..'), gain: 0.6 }),
        L('bell', 'bell', { pat: vel('X.....X.....'), pick: 'top', oct: 3, gain: 0.22 }),
        L('braam', 'braam', { pat: vel('X...........'), pick: 'root', oct: 1, len: 12, gain: 0.45,
          when: b => b % 4 === 0 }),
      ]},
      bellHunt: { bpm: 144, prog: 'hunt', talkDuck: 0.42, layers: [
        L('riff', 'strings', { pat: HUNT16_V, pick: HUNT16_P, oct: 1, art: 'spic', fam: 'cello', gain: 0.8 }),
        L('riff2', 'strings', { pat: HUNT16_V, pick: HUNT16_P, oct: 2, art: 'spic', fam: 'hiStr', gain: 0.4 }),
        L('bass', 'synthBass', { pat: vel('X7X7X7X7X7X7X7X7'), pick: 'root', oct: 1, gain: 0.7 }),
        L('horn', 'brass', { motif: 'hunt', oct: 2, gain: 0.7 }),
        L('choir', 'choir', { pat: HALF, pick: 'chord', oct: 3, len: 8, vowel: 'ah', gain: 0.45 }),
        L('taiko', 'taiko', { pat: vel('X.7.X.7.X.7.X.8X'), gain: 0.7 }),
        L('bell', 'bell', { pat: HALF, pick: 'top', oct: 3, gain: 0.2 }),
        L('crash', 'crash', { pat: BAR1, gain: 0.4, when: b => b % 2 === 0 }),
      ]},
      bellReel: { bpm: 148, steps: 12, prog: 'jigDark', talkDuck: 0.42, layers: [
        L('fiddle', 'strings', { motif: 'reel', oct: 3, art: 'spic', fam: 'hiStr', gain: 0.7 }),
        L('horn', 'brass', { motif: 'reel', oct: 2, gain: 0.5 }),
        L('ost', 'strings', { pat: vel('X6X6X6X6X6X6'), pick: pick('0a0a020a0a01'), oct: 1, art: 'spic',
          fam: 'cello', gain: 0.7 }),
        L('bass', 'synthBass', { pat: vel('X.7X.7X.7X.7'), pick: 'root', oct: 1, len: 2, gain: 0.65 }),
        L('choir', 'choir', { pat: vel('X...........'), pick: 'chord', oct: 3, len: 12, vowel: 'ah', gain: 0.42 }),
        L('bodhran', 'tom', { pat: vel('X.5.6.X.5.7.'), gain: 0.5 }),
        L('taiko', 'taiko', { pat: vel('X..7..X.7.8.'), gain: 0.65 }),
        L('bell', 'bell', { pat: vel('X.....X.....'), pick: 'top', oct: 3, gain: 0.22 }),
      ]},
    },
  };

  const CUES = {
    title: TITLE, finale: FINALE, ceremony: CEREMONY, tasks: TASKS,
    roundtable: ROUNDTABLE, murder: MURDER,
  };

  /* ---------------- stingers ----------------
     Played on top of whatever the loop is doing, now or on the next
     beat. `S.hz(semi)` is key-aware, so a sting after a modulation is
     still in the key the band is in. `o.n` is a counter where one
     makes sense (the third vote, the second name). */
  const I = MusicInst;
  const oct = (semi, o) => semi + 12 * o;
  // which voicing of a stinger with several: the day's, moved on by `n`
  const pickOf = (S, o, k) => (((S.variant | 0) + (o.n | 0)) % k + k) % k;

  const STINGERS = {

    /* ---- the fire ---- */

    warn(S, t) {
      I.timpaniRoll(S, t, S.hz(oct(0, 1)), 1.5, 1);
      I.timpani(S, t + 1.5, S.hz(oct(0, 1)), 0, 1.1, { pri: 0 });
      I.braam(S, t + 1.5, S.hz(oct(0, 1)), 1.8, 0.7);
      I.crash(S, t + 1.5, 0, 0, 0.6);
    },

    // the banished turn for the door
    walkout(S, t) {
      I.crash(S, t, 0, 0, 0.7);
      I.braam(S, t, S.hz(oct(0, 1)), 1.6, 0.6);
      I.taiko(S, t, S.hz(oct(0, 1)), 0, 1.0, { pri: 0 });
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
      I.brass(S, t, S.hz(oct(semi, 1)), 0.9, 0.9, { pri: 0, peak: 0.07 });
      I.brass(S, t, S.hz(oct(semi, 2)), 0.9, 0.6, { pri: 0 });
      I.boom(S, t, 0, 0, 0.45, { len: 1.8 });
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
      I.boom(S, t, 0, 0, 1.1, { len: 3.4 });
      I.taiko(S, t, 0, 0, 1.2, { pri: 0 });
      I.taiko(S, t + 0.13, 0, 0, 1.0, { pri: 0 });
      I.taiko(S, t + 0.26, 0, 0, 1.1, { pri: 0 });
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
      [0, 7, 12].forEach(s => I.brass(S, t, S.hz(oct(s, 2)), 2.2, 0.65, { pri: 0 }));
    },

    // the old name, still called by anything that does not know a role
    reveal(S, t) { STINGERS['reveal-traitor'](S, t); },

    win(S, t) {
      I.crash(S, t, 0, 0, 0.9);
      I.timpani(S, t, S.hz(oct(0, 1)), 0, 1.1, { pri: 0 });
      I.boom(S, t, 0, 0, 0.6, { len: 2.4 });
      [0, 4, 7, 12].forEach((s, i) => I.brass(S, t + i * 0.05, S.hz(oct(s, 2)), 2.4, 0.9, { pri: 0 }));
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

    // the hill: the card that only you see
    'role-traitor'(S, t) {
      I.braam(S, t, S.hz(oct(0, 1)), 2.4, 0.6);
      [0, 1, 7].forEach(s => I.choir(S, t, S.hz(oct(s, 3)), 2.6, 0.55, { pri: 0, vowel: 'oo' }));
      I.timpani(S, t, S.hz(oct(0, 1)), 0, 0.7, { pri: 0 });
    },
    'role-faithful'(S, t) {
      [0, 4, 7, 12].forEach((s, i) => I.bell(S, t + i * 0.09, S.hz(oct(s, 3)), 0, 0.55, { pri: 0 }));
      [0, 4, 7].forEach(s => I.choir(S, t, S.hz(oct(s, 3)), 2.6, 0.5, { pri: 0, vowel: 'ah' }));
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
      const v = pickOf(S, o, 3);
      if (v === 1) {
        [0, 0.36].forEach((d, i) => {
          I.taiko(S, t + d, 0, 0, 1, { pri: 0 });
          I.braam(S, t + d, S.hz(oct(i ? 0 : 1, 1)), i ? 2.8 : 0.3, 1);
        });
        I.boom(S, t + 0.36, 0, 0, 0.9, { len: 2.6 });
        [0, 1, 7].forEach((s, i) => I.choir(S, t + 0.4 + i * 0.04, S.hz(oct(s, 3)), 2.6, 0.7, { pri: 0, vowel: 'oh' }));
        return;
      }
      if (v === 2) {
        [0, 3, 7, 12, 13].forEach((s, i) => I.choir(S, t + i * 0.03, S.hz(oct(s, 3)), 3.2, 0.8, { pri: 0, vowel: 'ah' }));
        I.timpani(S, t, S.hz(oct(0, 1)), 0, 1.1, { pri: 0 });
        I.crash(S, t, 0, 0, 0.7);
        I.strings(S, t, S.hz(oct(0, 1)), 3, 1, { art: 'sustain', fam: 'cello', pri: 0, voices: 3 });
        return;
      }
      I.timpaniRoll(S, t, S.hz(oct(0, 1)), 1.2, 1);
      I.braam(S, t + 1.2, S.hz(oct(0, 1)), 2.4, 0.9);
      I.crash(S, t + 1.2, 0, 0, 0.8);
      [0, 3, 7, 12].forEach((s, i) => I.choir(S, t + 1.2 + i * 0.05, S.hz(oct(s, 3)), 2.6, 0.75, { pri: 0, vowel: 'ah' }));
    },

    // the moment the turret agrees, heard only there; and the letter
    'murder-hit'(S, t, o = {}) {
      const v = pickOf(S, o, 2);
      I.boom(S, t, 0, 0, 1, { len: 3 });
      I.braam(S, t, S.hz(oct(v ? 1 : 0, 1)), 3.2, 1);
      I.strings(S, t, S.hz(oct(1, 3)), 2.4, 0.7, { art: 'tremolo', fam: 'hiStr', pri: 0, voices: 3 });
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
      const v = pickOf(S, o, 2);
      I.bell(S, t, S.hz(oct(0, 3)), 0, 0.6, { ratio: 1.4, decay: 5, pri: 0 });
      I.timpani(S, t, S.hz(oct(0, 1)), 0, 1.0, { pri: 0 });
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
      I.taiko(S, t, 0, 0, 1, { pri: 0 });
      I.taiko(S, t + 0.22, 0, 0, 0.7, { pri: 0 });
      I.crash(S, t, 0, 0, 0.55);
    },

    // the bedroom door, locked for the night
    'door-lock'(S, t) {
      I.tom(S, t, 0, 0, 0.8, { pri: 0 });
      I.boom(S, t, 0, 0, 0.55, { len: 2 });
      I.bell(S, t + 0.04, S.hz(oct(1, 2)), 0, 0.4, { ratio: 1.4, decay: 3, pri: 0 });
      I.strings(S, t, S.hz(oct(0, 1)), 2.2, 0.6, { art: 'sustain', fam: 'cello', pri: 0, voices: 2 });
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
      [0, 7, 12].forEach((s, i) => I.brass(S, t + i * 0.09, S.hz(oct(s, 2)), 1.8, 0.75, { pri: 0 }));
      I.bell(S, t + 0.3, S.hz(oct(12, 3)), 0, 0.45, { ratio: 1.4, decay: 4, pri: 0 });
    },

    // breakfast: the poison was in them, and the shield held
    'shield-held'(S, t) {
      I.boom(S, t, 0, 0, 0.8, { len: 2.4 });
      I.timpani(S, t, S.hz(oct(0, 1)), 0, 1, { pri: 0 });
      [0, 4, 7, 12].forEach((s, i) => I.brass(S, t + i * 0.05, S.hz(oct(s, 2)), 2.4, 0.85, { pri: 0 }));
      [12, 16, 19].forEach((s, i) => I.bell(S, t + 0.2 + i * 0.09, S.hz(oct(s, 3)), 0, 0.5, { pri: 0 }));
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
      I.taiko(S, t, 0, 0, 1.1, { pri: 0 });
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
      I.boom(S, t, 0, 0, 1.2, { len: 4 });
      [0, 0.12, 0.24, 0.5].forEach((d, i) => I.taiko(S, t + d, 0, 0, i === 3 ? 1.2 : 1.05, { pri: 0 }));
      I.timpani(S, t, S.hz(oct(0, 1)), 0, 1.3, { pri: 0 });
      I.braam(S, t, S.hz(oct(0, 1)), 3.6, 1.2);
      [0, 7, 12, 15, 19, 24].forEach((s, i) => {
        I.brass(S, t + i * 0.035, S.hz(oct(s, 2)), 3.2, 0.95, { pri: 0 });
        I.choir(S, t + i * 0.035, S.hz(oct(s, 3)), 3.6, 0.85, { pri: 0, a: 0.06, vowel: 'ah' });
      });
      [0, 3, 7].forEach(s => I.strings(S, t, S.hz(oct(s, 4)), 3, 0.9, { art: 'tremolo', pri: 0, fam: 'hiStr' }));
      [12, 15, 19, 24, 27].forEach((s, i) => I.bell(S, t + 0.15 + i * 0.07, S.hz(oct(s, 3)), 0, 0.6, { pri: 0 }));
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

  return { PROGRESSIONS, MOTIFS, CUES, STINGERS, vel, pick };
})();

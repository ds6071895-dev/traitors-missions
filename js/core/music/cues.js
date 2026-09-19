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
        Bm = [9, 12, 16];

  /* A bar is a chord, or two chords for a half bar each. */
  const PROGRESSIONS = {
    // kept by name: reveal.js and the missions ask for these
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

    // the missions
    hunt:    [Dm, Dm, Bb, C, Dm, Dm, Gm, A],
    current: [Dm, C, Bb, C, Dm, C, Gm, A],
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
      floor: { bpm: 72, prog: 'floor', talkDuck: 0.32, duckLift: 0, layers: [
        L('pizz', 'pizz', { pat: OST8_V, pick: OST8_P, oct: 2, gain: 0.75, int: true }),
        L('heart', 'heartbeat', { pat: HALF, gain: 0.45 }),
        L('low', 'strings', { pat: BAR1, pick: 'root', oct: 1, len: 16, art: 'sustain',
          gain: 0.55, voices: 2 }),
        L('trem', 'strings', { pat: BAR1, pick: 'top', oct: 4, len: 16, art: 'tremolo',
          gain: 0.3, minInt: 0.85 }),
        L('timp', 'timpani', { pat: BAR1, pick: 'root', oct: 1, gain: 0.5, minInt: 1.0 }),
        L('pizz2', 'pizz', { pat: vel('...5...5...5...5'), pick: pick('...4...3...4...2'),
          oct: 2, gain: 0.5, minInt: 1.1 }),
      ]},

      /* The ballot. The cello goes to sixteenths, the drums arrive,
         and the horns quote the theme every other phrase. This is the
         cue the whole game has been waiting to play. */
      ballot: { bpm: 96, prog: 'ballot', layers: [
        L('ost', 'strings', { pat: OST16_V, pick: OST16_P, oct: 1, art: 'spic',
          gain: 1.05, int: true, fam: 'cello' }),
        L('ost2', 'strings', { pat: OST16_V, pick: OST16_P, oct: 2, art: 'spic',
          gain: 0.5, int: true, fam: 'hiStr', minInt: 0.9 }),
        L('taiko', 'taiko', { pat: vel('X.......X.....6.'), gain: 0.8, int: true }),
        L('pad', 'strings', { pat: BAR1, pick: 'chord', oct: 3, len: 16, art: 'swell',
          gain: 0.4 }),
        L('horn', 'brass', { motif: 'theme', oct: 2, gain: 0.7, when: b => b % 8 >= 4 }),
        L('choir', 'choir', { pat: BAR1, pick: 'chord', oct: 3, len: 16, vowel: 'oh',
          gain: 0.4, minInt: 1.05 }),
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
      title: { bpm: 66, prog: 'fire', duckLift: 0.25, layers: [
        L('piano', 'piano', { motif: 'theme', oct: 3, gain: 0.75, when: b => b % 8 < 4 }),
        L('horn', 'brass', { motif: 'theme', oct: 2, gain: 0.55, when: b => b % 8 >= 4 }),
        L('harp', 'harp', { pat: vel('X.5.6.5.X.5.6.5.'), pick: ARP8_P, oct: 3, gain: 0.4 }),
        L('pad', 'strings', { pat: HALF, pick: 'chord', oct: 3, len: 8, art: 'sustain', gain: 0.4 }),
        L('celli', 'strings', { pat: BAR1, pick: 'root', oct: 1, len: 16, art: 'sustain',
          gain: 0.55, fam: 'cello' }),
        L('choir', 'choir', { pat: BAR1, pick: 'chord', oct: 3, len: 16, vowel: 'ah', gain: 0.4,
          when: b => b % 8 >= 4 }),
        L('timp', 'timpani', { pat: BAR1, pick: 'root', oct: 1, gain: 0.35, when: b => b % 4 === 0 }),
      ]},
    },
  };

  /* ---------------- the journey ----------------
     The theme in six-eight, rolling like a boat does. The way home is
     the same tune with half the players gone. */
  const JOURNEY = {
    level: 0.46, room: 'hall', reverb: 0.3,
    sections: {
      out: { bpm: 78, steps: 12, prog: 'fire', layers: [
        L('harp', 'harp', { pat: vel('X.6.7.X.6.7.'), pick: pick('0.1.2.3.2.1.'), oct: 3, gain: 0.5 }),
        L('celli', 'strings', { pat: vel('X...........'), pick: 'root', oct: 1, len: 12,
          art: 'sustain', gain: 0.5, fam: 'cello' }),
        L('horn', 'brass', { motif: 'theme68', oct: 2, gain: 0.45, when: b => b % 8 >= 4 }),
        L('violins', 'strings', { motif: 'theme68', oct: 3, gain: 0.6, art: 'sustain',
          fam: 'hiStr', when: b => b % 8 < 4 }),
        L('drum', 'taiko', { pat: vel('X.....5.....'), gain: 0.35, f: 70 }),
      ]},
      home: { bpm: 68, steps: 12, prog: 'fire', layers: [
        L('harp', 'harp', { pat: vel('X...6...7...'), pick: pick('0...2...3...'), oct: 3, gain: 0.45 }),
        L('piano', 'piano', { motif: 'theme68', oct: 3, gain: 0.55 }),
        L('celli', 'strings', { pat: vel('X...........'), pick: 'root', oct: 1, len: 12,
          art: 'sustain', gain: 0.4, fam: 'cello' }),
      ]},
    },
  };

  /* ---------------- the shootout ----------------
     The hunt is low strings and drums with a horn call from the
     woods; the owl is the whole orchestra, one layer per phase. */
  const STAGE = {
    level: 0.6, room: 'hall', reverb: 0.2,
    sections: {
      hunt0: { bpm: 96, prog: 'hunt', layers: [
        L('ost', 'strings', { pat: OST8_V, pick: OST8_P, oct: 1, art: 'spic', gain: 0.85,
          int: true, fam: 'cello' }),
        L('taiko', 'taiko', { pat: vel('X.........7.....'), gain: 0.65, int: true }),
        L('pad', 'strings', { pat: BAR1, pick: 'chord', oct: 3, len: 16, art: 'sustain', gain: 0.3 }),
        L('call', 'brass', { motif: 'call', oct: 2, gain: 0.45, when: b => b % 4 === 3 }),
      ]},
      hunt1: { bpm: 104, prog: 'hunt', layers: [
        L('ost', 'strings', { pat: OST16_V, pick: OST16_P, oct: 1, art: 'spic', gain: 0.9,
          int: true, fam: 'cello' }),
        L('taiko', 'taiko', { pat: vel('X.....6.X.....7.'), gain: 0.7, int: true }),
        L('tom', 'tom', { pat: vel('...........5..7.'), gain: 0.6, int: true, f: 140 }),
        L('pad', 'strings', { pat: HALF, pick: 'chord', oct: 3, len: 8, art: 'sustain', gain: 0.3 }),
        L('horn', 'brass', { motif: 'theme', oct: 2, gain: 0.55, when: b => b % 8 >= 4 }),
        L('call', 'brass', { motif: 'call', oct: 2, gain: 0.5, when: b => b % 8 === 1 }),
      ]},
      hunt2: { bpm: 112, prog: 'hunt', layers: [
        L('ost', 'strings', { pat: OST16_V, pick: OST16_P, oct: 1, art: 'spic', gain: 0.95,
          int: true, fam: 'cello' }),
        L('ost2', 'strings', { pat: OST16_V, pick: OST16_P, oct: 2, art: 'spic', gain: 0.45,
          int: true, fam: 'hiStr' }),
        L('taiko', 'taiko', { pat: vel('X.....6.X.6...7.'), gain: 0.75, int: true }),
        L('horn', 'brass', { motif: 'theme', oct: 2, gain: 0.65 }),
        L('pad', 'strings', { pat: HALF, pick: 'chord', oct: 3, len: 8, art: 'sustain', gain: 0.3 }),
      ]},
      hunt3: { bpm: 126, prog: 'hunt', layers: [
        L('ost', 'strings', { pat: OST16_V, pick: OST16_P, oct: 1, art: 'spic', gain: 1,
          int: true, fam: 'cello' }),
        L('ost2', 'strings', { pat: OST16_V, pick: OST16_P, oct: 2, art: 'spic', gain: 0.5,
          int: true, fam: 'hiStr' }),
        L('taiko', 'taiko', { pat: vel('X.6.X.6.X.6.X.8.'), gain: 0.75, int: true }),
        L('horn', 'brass', { motif: 'theme', oct: 2, gain: 0.7 }),
        L('choir', 'choir', { pat: HALF, pick: 'chord', oct: 3, len: 8, vowel: 'ah', gain: 0.4 }),
      ]},
    },
  };

  const BOSS = {
    level: 0.86, room: 'hall', reverb: 0.3, prog: 'dread',
    sections: {
      owl0: { bpm: 88, prog: 'dread', layers: [
        L('ost', 'strings', { pat: OST8_V, pick: OST8_P, oct: 1, art: 'spic', gain: 0.9,
          int: true, fam: 'cello' }),
        L('taiko', 'taiko', { pat: vel('X.......X.......'), gain: 0.8, int: true }),
        L('choir', 'choir', { pat: BAR1, pick: 'chord', oct: 3, len: 16, vowel: 'oo', gain: 0.5 }),
        L('braam', 'braam', { pat: BAR1, pick: 'root', oct: 1, len: 12, gain: 0.6,
          when: b => b % 4 === 0 }),
      ]},
      owl1: { bpm: 100, prog: 'dread', layers: [
        L('ost', 'strings', { pat: OST16_V, pick: OST16_P, oct: 1, art: 'spic', gain: 1,
          int: true, fam: 'cello' }),
        L('taiko', 'taiko', { pat: vel('X.....6.X.....7.'), gain: 0.85, int: true }),
        L('horn', 'brass', { motif: 'theme', oct: 2, gain: 0.8 }),
        L('choir', 'choir', { pat: BAR1, pick: 'chord', oct: 3, len: 16, vowel: 'oh', gain: 0.5 }),
        L('pad', 'strings', { pat: HALF, pick: 'chord', oct: 3, len: 8, art: 'sustain', gain: 0.3 }),
      ]},
      owl2: { bpm: 116, prog: 'dread', layers: [
        L('ost', 'strings', { pat: OST16_V, pick: OST16_P, oct: 1, art: 'spic', gain: 1,
          int: true, fam: 'cello' }),
        L('trem', 'strings', { pat: BAR1, pick: 'chord', oct: 4, len: 16, art: 'tremolo', gain: 0.4 }),
        L('taiko', 'taiko', { pat: vel('X.6...6.X.6...8.'), gain: 0.9, int: true }),
        L('timp', 'timpani', { pat: vel('X.......X.......'), pick: 'root', oct: 1, gain: 0.5 }),
        L('horn', 'brass', { motif: 'theme', oct: 2, gain: 0.85 }),
        L('choir', 'choir', { pat: HALF, pick: 'chord', oct: 3, len: 8, vowel: 'ah', gain: 0.65 }),
      ]},
      owl3: { bpm: 138, prog: 'dread', layers: [
        L('ost', 'strings', { pat: OST16_V, pick: OST16_P, oct: 1, art: 'spic', gain: 1.05,
          int: true, fam: 'cello' }),
        L('ost2', 'strings', { pat: OST16_V, pick: OST16_P, oct: 2, art: 'spic', gain: 0.55,
          int: true, fam: 'hiStr' }),
        L('taiko', 'taiko', { pat: vel('X.7.X.7.X.7.X79X'), gain: 0.9, int: true }),
        L('kick', 'kick', { pat: vel('X...8...X...8.7.'), gain: 0.8, int: true }),
        L('horn', 'brass', { motif: 'theme', oct: 2, gain: 0.95 }),
        L('horn8', 'brass', { motif: 'theme', oct: 1, gain: 0.55 }),
        L('choir', 'choir', { pat: HALF, pick: 'chord', oct: 3, len: 8, vowel: 'ah', gain: 0.8 }),
        L('trem', 'strings', { pat: BAR1, pick: 'chord', oct: 4, len: 16, art: 'tremolo', gain: 0.45 }),
      ]},
    },
  };

  /* ---------------- the dive ----------------
     Ninety-six, all night, in every section. The stroke window is a
     beat, so the tempo is part of the controls. Depth adds players. */
  const DIVE = {
    level: 0.64, room: 'cathedral', reverb: 0.48, lockTempo: true,
    sections: {
      tide0: { bpm: 96, prog: 'tide', layers: [
        L('harp', 'harp', { pat: vel('X.6.7.6.X.6.7.6.'), pick: ARP8_P, oct: 3, gain: 0.45 }),
        L('air', 'choir', { pat: BAR1, pick: 'chord', oct: 3, len: 16, vowel: 'oo', gain: 0.45 }),
        L('low', 'strings', { pat: BAR1, pick: 'root', oct: 1, len: 16, art: 'sustain', gain: 0.4,
          voices: 2 }),
      ]},
      tide1: { bpm: 96, prog: 'tide', layers: [
        L('harp', 'harp', { pat: vel('X.6.7.6.X.6.7.6.'), pick: ARP8_P, oct: 3, gain: 0.45 }),
        L('air', 'choir', { pat: BAR1, pick: 'chord', oct: 3, len: 16, vowel: 'oo', gain: 0.5 }),
        L('low', 'strings', { pat: BAR1, pick: 'root', oct: 1, len: 16, art: 'sustain', gain: 0.45 }),
        L('pulse', 'pulse', { pat: BEATS, pick: 'root', oct: 1, gain: 0.55, int: true }),
        L('box', 'celesta', { motif: 'theme', oct: 4, gain: 0.35, when: b => b % 8 >= 4 }),
        L('hat', 'hat', { pat: vel('..4...4...4...5.'), gain: 0.5, int: true }),
      ]},
      tide2: { bpm: 96, prog: 'tide', layers: [
        L('harp', 'harp', { pat: vel('X.6.7.6.X.6.7.6.'), pick: ARP8_P, oct: 3, gain: 0.4 }),
        L('air', 'choir', { pat: BAR1, pick: 'chord', oct: 3, len: 16, vowel: 'oo', gain: 0.55 }),
        L('ost', 'strings', { pat: OST8_V, pick: OST8_P, oct: 1, art: 'spic', gain: 0.6,
          int: true, fam: 'cello' }),
        L('pulse', 'pulse', { pat: BEATS, pick: 'root', oct: 1, gain: 0.6, int: true }),
        L('taiko', 'taiko', { pat: HALF, gain: 0.5, int: true }),
        L('pad', 'strings', { pat: BAR1, pick: 'chord', oct: 3, len: 16, art: 'sustain', gain: 0.3 }),
        L('box', 'celesta', { motif: 'theme', oct: 4, gain: 0.4 }),
      ]},
      tide3: { bpm: 96, prog: 'tide', layers: [
        L('ost', 'strings', { pat: OST16_V, pick: OST16_P, oct: 1, art: 'spic', gain: 0.8,
          int: true, fam: 'cello' }),
        L('pulse', 'pulse', { pat: BEATS, pick: 'root', oct: 1, gain: 0.65, int: true }),
        L('taiko', 'taiko', { pat: vel('X.....6.X.....7.'), gain: 0.7, int: true }),
        L('horn', 'brass', { motif: 'theme', oct: 2, gain: 0.55 }),
        L('choir', 'choir', { pat: HALF, pick: 'chord', oct: 3, len: 8, vowel: 'ah', gain: 0.65 }),
        L('harp', 'harp', { pat: vel('X.6.7.6.X.6.7.6.'), pick: ARP8_P, oct: 4, gain: 0.3 }),
      ]},
    },
  };

  /* ---------------- the descent ----------------
     Five gears, 92 to 148. The only cue with a kick drum in it: a
     mountain at speed wants a motor under it, and the strings ride
     on top of that motor rather than being it. */
  const DESCENT = {
    level: 0.66, room: 'hall', reverb: 0.18,
    sections: {
      ski0: { bpm: 92, prog: 'descent', layers: [
        L('pad', 'strings', { pat: BAR1, pick: 'chord', oct: 3, len: 16, art: 'sustain', gain: 0.45 }),
        L('harp', 'harp', { pat: vel('X.6.7.6.X.6.7.6.'), pick: ARP8_P, oct: 3, gain: 0.4 }),
        L('hat', 'hat', { pat: vel('..4...4...4...4.'), gain: 0.5 }),
        L('air', 'choir', { pat: BAR1, pick: 'chord', oct: 3, len: 16, vowel: 'oo', gain: 0.35 }),
      ]},
      ski1: { bpm: 104, prog: 'descent', layers: [
        L('kick', 'kick', { pat: BEATS, gain: 0.6, int: true }),
        L('bass', 'synthBass', { pat: vel('X.6.7.6.X.6.7.6.'), pick: 'root', oct: 1, len: 1.6,
          gain: 0.7, int: true }),
        L('ost', 'strings', { pat: OST8_V, pick: OST8_P, oct: 2, art: 'spic', gain: 0.6, int: true }),
        L('pad', 'strings', { pat: BAR1, pick: 'chord', oct: 3, len: 16, art: 'sustain', gain: 0.4 }),
        L('hat', 'hat', { pat: vel('..5...5...5...5.'), gain: 0.6 }),
        L('call', 'brass', { motif: 'call', oct: 2, gain: 0.35, when: b => b % 4 === 3 }),
      ]},
      ski2: { bpm: 118, prog: 'descent', layers: [
        L('kick', 'kick', { pat: BEATS, gain: 0.8, int: true }),
        L('snare', 'snare', { pat: vel('....X.......X...'), gain: 0.6, int: true }),
        L('bass', 'synthBass', { pat: vel('X.6.7.6.X.6.7.6.'), pick: 'root', oct: 1, len: 1.6,
          gain: 0.85, int: true }),
        L('ost', 'strings', { pat: OST16_V, pick: OST16_P, oct: 2, art: 'spic', gain: 0.7, int: true }),
        L('pad', 'strings', { pat: HALF, pick: 'chord', oct: 3, len: 8, art: 'sustain', gain: 0.35 }),
        L('hat', 'hat', { pat: vel('..5...5...5...5.'), gain: 0.6 }),
        L('horn', 'brass', { motif: 'theme', oct: 2, gain: 0.55, when: b => b % 8 >= 4 }),
      ]},
      ski3: { bpm: 132, prog: 'descent', layers: [
        L('kick', 'kick', { pat: BEATS, gain: 0.9, int: true }),
        L('snare', 'snare', { pat: vel('....X.......X..6'), gain: 0.65, int: true }),
        L('taiko', 'taiko', { pat: vel('X.......X.......'), gain: 0.55, int: true }),
        L('bass', 'synthBass', { pat: vel('X6X6X6X6X6X6X6X6'), pick: 'root', oct: 1, len: 0.9,
          gain: 0.8, int: true }),
        L('ost', 'strings', { pat: OST16_V, pick: OST16_P, oct: 2, art: 'spic', gain: 0.75, int: true }),
        L('horn', 'brass', { motif: 'theme', oct: 2, gain: 0.7 }),
        L('choir', 'choir', { pat: HALF, pick: 'chord', oct: 3, len: 8, vowel: 'ah', gain: 0.5 }),
        L('hat', 'hat', { pat: vel('..6...6...6...6.'), gain: 0.6 }),
      ]},
      ski4: { bpm: 148, prog: 'descent', layers: [
        L('kick', 'kick', { pat: vel('X...X...X...X.7.'), gain: 1, int: true }),
        L('snare', 'snare', { pat: vel('....X.......X.6X'), gain: 0.7, int: true }),
        L('taiko', 'taiko', { pat: vel('X.....6.X.....6.'), gain: 0.6, int: true }),
        L('bass', 'synthBass', { pat: vel('X6X6X6X6X6X6X6X6'), pick: 'root', oct: 1, len: 0.9,
          gain: 0.85, int: true }),
        L('ost', 'strings', { pat: OST16_V, pick: OST16_P, oct: 2, art: 'spic', gain: 0.8, int: true }),
        L('horn', 'brass', { motif: 'theme', oct: 2, gain: 0.8 }),
        L('choir', 'choir', { pat: HALF, pick: 'chord', oct: 3, len: 8, vowel: 'ah', gain: 0.65 }),
        L('hat', 'hat', { pat: vel('4.6.4.6.4.6.4.6.'), gain: 0.6 }),
        L('trem', 'strings', { pat: BAR1, pick: 'chord', oct: 4, len: 16, art: 'tremolo', gain: 0.35 }),
      ]},
    },
  };

  /* ---------------- the boat race ----------------
     The only mission that used to have no score at all. A driving
     minor loop with a motor under it, a count-in the band plays with
     the lights, and four gears that follow the boat's speed. */
  const BOAT = {
    level: 0.62, room: 'hall', reverb: 0.2,
    gears: ['boat0', 'boat1', 'boat2', 'boat3'],
    sections: {
      count: { bpm: 120, prog: 'current', layers: [
        L('low', 'strings', { pat: BAR1, abs: 0, oct: 1, len: 16, art: 'tremolo', gain: 0.5 }),
      ]},
      boat0: { bpm: 120, prog: 'current', layers: [
        L('kick', 'kick', { pat: BEATS, gain: 0.7, int: true }),
        L('bass', 'synthBass', { pat: vel('X.6.7.6.X.6.7.6.'), pick: 'root', oct: 1, len: 1.6,
          gain: 0.75, int: true }),
        L('hat', 'hat', { pat: vel('..5...5...5...5.'), gain: 0.55 }),
        L('pad', 'strings', { pat: BAR1, pick: 'chord', oct: 3, len: 16, art: 'sustain', gain: 0.35 }),
      ]},
      boat1: { bpm: 126, prog: 'current', layers: [
        L('kick', 'kick', { pat: BEATS, gain: 0.8, int: true }),
        L('snare', 'snare', { pat: vel('....X.......X...'), gain: 0.55, int: true }),
        L('bass', 'synthBass', { pat: vel('X.6.7.6.X.6.7.6.'), pick: 'root', oct: 1, len: 1.6,
          gain: 0.8, int: true }),
        L('ost', 'strings', { pat: OST16_V, pick: OST16_P, oct: 2, art: 'spic', gain: 0.7, int: true }),
        L('hat', 'hat', { pat: vel('..5...5...5...5.'), gain: 0.55 }),
        L('pad', 'strings', { pat: HALF, pick: 'chord', oct: 3, len: 8, art: 'sustain', gain: 0.3 }),
      ]},
      boat2: { bpm: 132, prog: 'current', layers: [
        L('kick', 'kick', { pat: BEATS, gain: 0.85, int: true }),
        L('snare', 'snare', { pat: vel('....X.......X..6'), gain: 0.6, int: true }),
        L('taiko', 'taiko', { pat: vel('X.....6.X.....6.'), gain: 0.55, int: true }),
        L('bass', 'synthBass', { pat: vel('X6X6X6X6X6X6X6X6'), pick: 'root', oct: 1, len: 0.9,
          gain: 0.8, int: true }),
        L('ost', 'strings', { pat: OST16_V, pick: OST16_P, oct: 2, art: 'spic', gain: 0.75, int: true }),
        L('horn', 'brass', { motif: 'theme', oct: 2, gain: 0.6, when: b => b % 8 >= 4 }),
        L('call', 'brass', { motif: 'call', oct: 3, gain: 0.4, when: b => b % 8 === 1 }),
        L('hat', 'hat', { pat: vel('..6...6...6...6.'), gain: 0.55 }),
      ]},
      boat3: { bpm: 140, prog: 'current', layers: [
        L('kick', 'kick', { pat: vel('X...X...X...X.7.'), gain: 0.95, int: true }),
        L('snare', 'snare', { pat: vel('....X.......X.6X'), gain: 0.65, int: true }),
        L('taiko', 'taiko', { pat: vel('X.6...6.X.6...7.'), gain: 0.6, int: true }),
        L('bass', 'synthBass', { pat: vel('X6X6X6X6X6X6X6X6'), pick: 'root', oct: 1, len: 0.9,
          gain: 0.85, int: true }),
        L('ost', 'strings', { pat: OST16_V, pick: OST16_P, oct: 2, art: 'spic', gain: 0.8, int: true }),
        L('horn', 'brass', { motif: 'theme', oct: 2, gain: 0.75 }),
        L('choir', 'choir', { pat: HALF, pick: 'chord', oct: 3, len: 8, vowel: 'ah', gain: 0.5 }),
        L('trem', 'strings', { pat: BAR1, pick: 'chord', oct: 4, len: 16, art: 'tremolo', gain: 0.3 }),
        L('hat', 'hat', { pat: vel('4.6.4.6.4.6.4.6.'), gain: 0.6 }),
      ]},
    },
  };

  const CUES = {
    finale: FINALE, ceremony: CEREMONY, journey: JOURNEY, stage: STAGE, boss: BOSS,
    dive: DIVE, descent: DESCENT, boat: BOAT,
  };

  /* ---------------- stingers ----------------
     Played on top of whatever the loop is doing, now or on the next
     beat. `S.hz(semi)` is key-aware, so a sting after a modulation is
     still in the key the band is in. `o.n` is a counter where one
     makes sense (the third vote, the second name). */
  const I = MusicInst;
  const oct = (semi, o) => semi + 12 * o;

  const STINGERS = {

    /* ---- the fire ---- */

    warn(S, t) {
      I.timpaniRoll(S, t, S.hz(oct(0, 1)), 1.5, 1);
      I.timpani(S, t + 1.5, S.hz(oct(0, 1)), 0, 1.1, { pri: 0 });
      I.braam(S, t + 1.5, S.hz(oct(0, 1)), 1.8, 0.7);
      I.crash(S, t + 1.5, 0, 0, 0.6);
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
  };

  return { PROGRESSIONS, MOTIFS, CUES, STINGERS, vel, pick };
})();

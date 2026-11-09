/* ------------------------------------------------------------------
   music/themes.js — the tunes, and the chords under them.


   One theme runs through the whole night. Four bars in D minor: a
   rise to the minor sixth that leans on it and falls back, a descent
   to the leading tone, a climb up the triad, and the old lament walk
   from the octave down to the dominant — so it never finishes, and
   every loop of it wants the next one. It is stated on a piano on the
   loch, answered by a cello, snarled by horns over the owl, played as
   a music box when the Traitor wins and turned to D major for the
   Faithful. The player never has to notice that it is one tune.


   Beside it there are five more, each with a job:

     traitors    a cell on the flat second and the tritone, heard in
                 pieces all night and stated whole only if they win
     faithful    a rising fifth and a hymn, for the end
     suspicion   the clock under an argument, in seven-eight, so it
                 never quite lands where you expect it to
     waltz       Claudia's: breakfast in three-four, too calm by half
     heist, pipes, jig, reel, hunt   the five days in the castle

   A motif is `{ len, at }`: its length in sixteenths, and the notes by
   the sixteenth they start on. `variants` works out the ways a player
   would vary one without being asked; the score picks among them.
------------------------------------------------------------------ */
const MusicThemes = (() => {

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
    // Claudia's waltz: i, iv, V, and the flat sixth on the way back
    waltz:   [Dm, Dm, Gm, A, Dm, Bb, Gm, A],
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

  /* The heist: eight bars of four-four on the vote's chords, staccato,
     on tiptoe — up the triad onto the flat sixth and back, the leading
     tone pricking out of the second bar, the last two bars sitting on
     the dominant and not getting off it. */
  const HEIST = [
    [0, 0, 2, 1.1], [3, 3, 1, 0.8], [4, 7, 2], [8, 8, 2, 1.05], [10, 7, 2], [12, 3, 2], [14, 2, 2],
    [16, 0, 2, 1.1], [19, 3, 1, 0.8], [20, 7, 2], [24, 12, 4, 1.05], [28, 11, 2], [30, 7, 2],
    [32, 8, 2, 1.1], [35, 12, 1, 0.8], [36, 15, 2], [40, 14, 2], [42, 12, 2], [44, 10, 4],
    [48, 8, 2, 1.05], [51, 10, 1, 0.8], [52, 12, 2], [56, 8, 8],
    [64, 5, 2, 1.1], [67, 8, 1, 0.8], [68, 12, 2], [72, 10, 2], [74, 8, 2], [76, 7, 4],
    [80, 5, 2, 1.05], [83, 7, 1, 0.8], [84, 8, 2], [88, 5, 8],
    [96, 7, 2, 1.1], [99, 11, 1, 0.8], [100, 14, 2], [104, 14, 2], [106, 11, 2], [108, 7, 4],
    [112, 7, 4, 1.05], [116, 11, 4], [120, 14, 4], [124, 11, 4, 0.9],
  ];
  /* The pipes: four-four with the Scots snap in every beat — a
     semiquaver leaned on, then the dotted note it was leaning towards —
     on the jig's chords, in the minor with the flat seventh, which is
     what a chanter has. */
  const PIPES = [
    [0, 0, 1, 1.15], [1, 3, 3], [4, 7, 4], [8, 10, 1, 1.1], [9, 7, 3], [12, 3, 4],
    [16, 10, 1, 1.15], [17, 14, 3], [20, 17, 4], [24, 15, 1, 1.1], [25, 14, 3], [28, 10, 4],
    [32, 12, 1, 1.15], [33, 10, 3], [36, 8, 4], [40, 7, 1, 1.1], [41, 5, 3], [44, 3, 4],
    [48, 3, 1, 1.1], [49, 0, 7, 1.05], [56, 7, 1, 1.1], [57, 3, 3], [60, 2, 4],
    [64, 3, 1, 1.15], [65, 7, 3], [68, 10, 4], [72, 12, 1, 1.1], [73, 10, 3], [76, 7, 4],
    [80, 14, 1, 1.15], [81, 10, 3], [84, 7, 4], [88, 5, 1, 1.1], [89, 7, 3], [92, 10, 4],
    [96, 7, 1, 1.15], [97, 11, 3], [100, 14, 4], [104, 12, 1, 1.1], [105, 11, 3], [108, 7, 4],
    [112, 0, 1, 1.1], [113, 3, 3], [116, 7, 4], [120, 0, 8, 1.05],
  ];

  /* The suspicion clock, in seven-eight: fourteen sixteenths a bar,
     grouped two, two and three, over `omen`. Under an argument it is
     the thing that will not settle — every bar comes round a quaver
     early. */
  const SUSPICION = [
    [0, 7, 2, 1.1], [4, 8, 2], [8, 7, 2, 1.05], [10, 3, 2, 0.85], [12, 2, 2, 0.85],
    [14, 8, 2, 1.1], [18, 5, 2], [22, 1, 4, 1.05], [26, 0, 2, 0.85],
    [28, 3, 2, 1.1], [32, 2, 2], [36, 3, 2, 1.05], [38, 7, 4],
    [42, 8, 4, 1.1], [46, 6, 3, 0.9], [49, 7, 7, 1.05],
  ];
  /* Claudia's waltz: breakfast, in three-four. The tune turns politely
     round the fifth, lands on the flat sixth like a cup on a saucer and
     walks down to the leading tone. It is a lovely morning. Somebody is
     dead. */
  const WALTZ = [
    [0, 7, 6, 1.05], [6, 8, 2, 0.8], [8, 7, 4],
    [12, 3, 6], [18, 2, 2, 0.8], [20, 3, 4],
    [24, 12, 6, 1.05], [30, 10, 2, 0.8], [32, 8, 4],
    [36, 7, 8], [44, 11, 4, 0.9],
    [48, 12, 6, 1.05], [54, 10, 2, 0.8], [56, 7, 4],
    [60, 8, 6], [66, 7, 2, 0.8], [68, 5, 4],
    [72, 5, 6, 1.05], [78, 3, 2, 0.8], [80, 2, 4],
    [84, -1, 8], [92, 2, 4, 0.85],
  ];

  // the horn call: the theme's first bar, alone, as a signal
  const CALL = [[0, 0, 3, 1], [4, 7, 3, 1], [8, 8, 5, 1.1], [14, 7, 2, 0.8]];

  /* The Traitors' motif, over `omen`. A cell, not a tune: the key, a
     slip onto the flat second and back, and a lean on the tritone that
     resolves only as far as the fifth. Heard in pieces all night — in
     the turret, in a poison-carrier's pocket — and stated whole, by
     everything, only if they get away with it. */
  const TRAITORS = [
    [0, 0, 3, 1.1], [3, 1, 1, 0.8], [4, 0, 4], [8, 6, 2, 1.05], [10, 7, 6],
    [16, 8, 4, 1.1], [20, 5, 4], [24, 1, 6], [30, 0, 2, 0.8],
    [32, 3, 3, 1.1], [35, 2, 1, 0.8], [36, 3, 4], [40, 7, 4], [44, 10, 4],
    [48, 8, 4, 1.05], [52, 6, 4], [56, 7, 8, 1.1],
  ];
  /* The Faithful's: a rising fifth and a hymn, over `victory`. The
     answer the castle theme never gets until the end. */
  const FAITHFUL = [
    [0, 0, 4], [4, 7, 8, 1.1], [12, 9, 4],
    [16, 12, 4, 1.05], [20, 11, 4], [24, 7, 8],
    [32, 4, 4], [36, 7, 4], [40, 12, 8, 1.1],
    [48, 12, 4], [52, 11, 4], [56, 7, 8, 1.05],
  ];

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

  /* A tune that comes round the same way every time is a recording.
     These are the ways a player would vary one without being asked,
     worked out once at load: a long note that gives its tail to a
     passing note on the way to the next; the answering half taken up
     an octave; and a breath — the short notes off the beat folded into
     the one before. `scale` is the pitch classes a passing note may
     use, `beat` the sixteenths in a beat (4, or 6 in six-eight). The
     first variant is always the tune as written. */
  function variants(M, scale, beat) {
    const pc = (x) => ((x % 12) + 12) % 12;
    const notes = Object.keys(M.at).map(Number).sort((x, y) => x - y)
      .map(at => [at, M.at[at].s, M.at[at].d, M.at[at].v]);
    const sig = (ns) => JSON.stringify(ns);
    const out = [M], seen = new Set([sig(notes)]);
    const push = (ns) => {
      ns.sort((x, y) => x[0] - y[0]);
      const k = sig(ns);
      if (seen.has(k)) return;
      seen.add(k);
      out.push(motif(M.len, ns));
    };

    const orn = [];
    notes.forEach((n, i) => {
      const nx = notes[i + 1];
      const [at, p, d, v] = n;
      if (!nx || d < beat || nx[0] !== at + d || Math.abs(nx[1] - p) < 3 || i % 2) { orn.push(n.slice()); return; }
      // approach the next note from the side this one is on
      const dir = nx[1] > p ? -1 : 1;
      let pass = null;
      for (let k = 1; k <= 2 && pass == null; k++) if (scale.includes(pc(nx[1] + dir * k))) pass = nx[1] + dir * k;
      if (pass == null || pass === p) { orn.push(n.slice()); return; }
      orn.push([at, p, d - 2, v], [at + d - 2, pass, 2, 0.7]);
    });
    push(orn);

    push(notes.map(n => (n[0] >= M.len / 2 ? [n[0], n[1] + 12, n[2], n[3] * 0.95] : n.slice())));

    const thin = [];
    for (const n of notes) {
      const last = thin[thin.length - 1];
      const weak = n[2] < beat && n[0] % beat !== 0;
      if (weak && last && last[0] + last[2] === n[0]) last[2] += n[2];
      else thin.push(n.slice());
    }
    push(thin);
    return out;
  }
  const SCALES = {
    minor: [0, 2, 3, 5, 7, 8, 10, 11],        // natural, and the leading tone
    major: [0, 2, 4, 5, 7, 9, 11],
    dark:  [0, 1, 2, 3, 5, 7, 8, 10, 11],     // with the flat second
  };

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
    traitors: motif(64, TRAITORS),
    faithful: motif(64, FAITHFUL),
    heist:   motif(128, HEIST),
    pipes:   motif(128, PIPES),
    suspicion: motif(56, SUSPICION),
    waltz:   motif(96, WALTZ),
  };

  return { PROGRESSIONS, MOTIFS, SCALES, motif, compound, sixEight, variants };
})();

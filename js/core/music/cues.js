/* ------------------------------------------------------------------
   music/cues.js — the score itself, as data.

   The arrangements. The tunes and the chords are in `themes.js`, the
   hits in `stingers.js`; this file is how the band plays them, scene
   by scene.

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

  const { PROGRESSIONS, MOTIFS, SCALES, motif, variants } = MusicThemes;
  const STINGERS = MusicStingers.STINGERS;

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
  /* The plucked figure under an argument, three ways: the walk, the
     walk with a held breath in it, and one that leans on the off-beat.
     A layer given a pool plays a different one each phrase. */
  const TALK_V = [OST8_V, vel('X.6...6.X.6.8...'), vel('X...6.8.X.6...7.')];
  const TALK_P = [OST8_P, pick('0.2...3.0.2.1...'), pick('0...2.3.0.1...2.')];
  // the bodhran's way into the next phrase, in six-eight
  const JIG_FILLS = [vel('X.4.5.7.8.9X'), vel('X..7..X.789X'), vel('X.5.X.5.X8X8')];
  /* Who takes the tune this phrase: the fiddles, a whistle, the
     fiddles, a hammered dulcimer. The same notes, somebody else's
     hands. */
  const PASS_TUNE = [{}, { inst: 'whistle', oct: 3, gain: 0.72, art: null, fam: null }, {},
                     { inst: 'dulcimer', oct: 3, gain: 0.8, art: null, fam: null }];

  const L = (id, inst, spec) => Object.assign({ id, inst, gain: 1 }, spec);

  /* ---------------- the fire ----------------
     Every section is named after the moment it scores; `fireplace.js`
     calls them by name, in order, and the table in the plan is the
     order they arrive in. */

  const FINALE = {
    level: 0.84, room: 'epic', reverb: 0.34,
    gears: ['arrival', 'floor', 'ballot', 'afterTraitor'],
    trans: { '*>ballot': 'fill' },
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
        L('cello', 'strings', { motif: 'theme', oct: 2, gain: 1.05, art: 'sustain', legato: true,
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
        L('cello', 'strings', { motif: 'theme', oct: 2, gain: 0.9, art: 'sustain', fam: 'cello', legato: true }),
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
        L('pizz', 'pizz', { pat: OST8_V, pick: OST8_P, pats: TALK_V, picks: TALK_P, oct: 2, gain: 0.75, int: true }),
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
        L('ens', 'taikoEns', { pat: BAR1, gain: 0.85 }),
        L('taiko', 'taiko', { pat: vel('......7.X.....8.'), gain: 0.85, int: true }),
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
        L('cello', 'strings', { motif: 'theme', oct: 2, gain: 1.1, art: 'sustain', legato: true,
          fam: 'cello', peak: 0.07, voices: 2 }),
        L('pad', 'strings', { pat: HALF, pick: 'chord', oct: 3, len: 8, art: 'swell', gain: 0.35 }),
        L('low', 'pianoLow', { pat: BAR1, pick: 'root', oct: 2, gain: 0.5, when: b => b % 2 === 0 }),
        L('air', 'choir', { pat: BAR1, pick: 'chord', oct: 3, len: 16, vowel: 'oo', gain: 0.3 }),
      ]},

      /* The last pouches: the pouch cue with a pulse under it. The
         key rises a semitone per pouch, set by the scene. */
      lastPouches: { bpm: 72, prog: 'pouch', layers: [
        L('pizz', 'pizz', { pat: OST8_V, pick: OST8_P, oct: 2, gain: 0.7 }),
        // each pouch opened winds it tighter (`setTension`, from fireplace.js)
        L('timpT', 'timpani', { pat: vel('X.......X.......'), pick: 'root', oct: 1, gain: 0.45, tens: [0.5, 1] }),
        L('ostT', 'strings', { pat: OST8_V, pick: OST8_P, oct: 1, art: 'spic', fam: 'cello', gain: 0.6, tens: [0.65, 1] }),
        L('hornT', 'horn', { pat: BAR1, pick: 'chord', oct: 2, len: 16, art: 'swell', gain: 0.5, tens: [0.8, 1],
          when: b => b % 2 === 1 }),
        L('trem', 'strings', { pat: BAR1, pick: 'chord', oct: 3, len: 16, art: 'tremolo',
          gain: 0.5 }),
        L('choir', 'choir', { pat: BAR1, pick: 'chord', oct: 3, len: 16, vowel: 'oo', gain: 0.5 }),
        L('low', 'strings', { pat: BAR1, pick: 'root', oct: 1, len: 16, art: 'sustain', gain: 0.65 }),
        L('heart', 'heartbeat', { pat: HALF, gain: 0.5 }),
      ]},

      /* A Traitor in the very last pouch. They got away with it, and the
         Traitors' motif is stated whole for the first time — by all of
         it: the horns and trombones, the violins an octave up, the
         chant, the anvils, three taikos to a beat and the floor going. */
      finalBurn: { bpm: 84, prog: 'omen', layers: [
        L('brass', 'brass', { motif: 'traitors', oct: 2, gain: 0.95 }),
        L('low', 'lowBrass', { motif: 'traitors', oct: 2, gain: 0.7 }),
        L('violins', 'strings', { motif: 'traitors', oct: 3, art: 'sustain', fam: 'hiStr', gain: 0.6, oct8: true, legato: true }),
        L('ost', 'strings', { pat: OST16_V, pick: OST16_P, oct: 1, art: 'spic', gain: 1, fam: 'cello' }),
        L('chant', 'chant', { pat: vel('X...X...X.X.X...'), pick: 'chord', oct: 3, gain: 0.6 }),
        L('ens', 'taikoEns', { pat: vel('X.......X.....7.'), gain: 0.9 }),
        L('anvil', 'anvil', { pat: vel('....X.......X...'), gain: 0.55, when: b => b % 2 === 1 }),
        L('drop', 'subDrop', { pat: BAR1, gain: 0.6, len: 16, when: b => b % 4 === 0 }),
        L('braam', 'braam', { pat: BAR1, pick: 'root', oct: 1, len: 16, gain: 0.5, when: b => b % 4 === 2 }),
        L('toll', 'bell', { pat: HALF, abs: 0, oct: 3, gain: 0.45, ratio: 1.4, decay: 3.5 }),
      ]},

      /* The verdicts. Each is the whole theme, eight bars, and each is
         a different piece of music — and each has a second arrangement,
         which the night's seed picks (`alt`), so two games do not end on
         the same recording. */
      verdictWin: { bpm: 76, prog: 'victory', alt: ['verdictWin2'], layers: [
        L('violins', 'strings', { motif: 'hymn', oct: 3, gain: 0.9, art: 'sustain', fam: 'hiStr', legato: true, oct8: true }),
        L('horn', 'horn', { motif: 'hymn', oct: 2, gain: 0.8 }),
        L('choir', 'choir', { pat: HALF, pick: 'chord', oct: 3, len: 8, vowel: 'ah', gain: 0.6 }),
        L('celli', 'strings', { pat: HALF, pick: 'root', oct: 1, len: 8, art: 'sustain',
          gain: 0.7, fam: 'cello' }),
        L('timp', 'timpani', { pat: vel('X.......6.......'), pick: 'root', oct: 1, gain: 0.55 }),
        L('bells', 'bell', { pat: BAR1, pick: 'top', oct: 4, gain: 0.35 }),
        L('harp', 'harp', { pat: vel('X.6.7.6.X.6.7.6.'), pick: ARP8_P, oct: 3, gain: 0.45 }),
      ]},

      // the Faithful's own motif, at last, on the horns, over the whole band
      verdictWin2: { bpm: 80, prog: 'victory', layers: [
        L('horn', 'horn', { motif: 'faithful', oct: 2, gain: 0.95 }),
        L('violins', 'strings', { motif: 'faithful', oct: 3, art: 'sustain', fam: 'hiStr', gain: 0.7, legato: true,
          when: b => b % 8 >= 4 }),
        L('pad', 'strings', { pat: HALF, pick: 'chord', oct: 3, len: 8, art: 'sustain', gain: 0.4 }),
        L('celli', 'strings', { pat: OST8_V, pick: OST8_P, oct: 1, art: 'spic', fam: 'cello', gain: 0.7 }),
        L('choir', 'choir', { pat: HALF, pick: 'chord', oct: 3, len: 8, vowel: 'ah', gain: 0.55 }),
        L('ens', 'taikoEns', { pat: vel('X.......X.......'), gain: 0.7 }),
        L('timp', 'timpani', { pat: vel('X.......6...6...'), pick: 'root', oct: 1, gain: 0.5 }),
        L('bells', 'bell', { pat: HALF, pick: 'top', oct: 4, gain: 0.3 }),
      ]},

      verdictLoss: { bpm: 58, prog: 'fate', alt: ['verdictLoss2'], layers: [
        L('cello', 'strings', { motif: 'fate', oct: 2, gain: 1.05, art: 'sustain', legato: true,
          fam: 'cello', peak: 0.07, voices: 2 }),
        L('pad', 'strings', { pat: BAR1, pick: 'chord', oct: 3, len: 16, art: 'swell', gain: 0.3 }),
        L('piano', 'piano', { pat: vel('X.......5.......'), pick: pick('0.......2.......'),
          oct: 2, gain: 0.55 }),
        L('air', 'choir', { pat: BAR1, pick: 'chord', oct: 3, len: 16, vowel: 'oo', gain: 0.3 }),
      ]},

      // the castle theme on a solo cello over one low piano note and glass
      verdictLoss2: { bpm: 56, prog: 'fire', layers: [
        L('cello', 'strings', { motif: 'theme', oct: 2, gain: 1.05, art: 'sustain', fam: 'cello', legato: true,
          peak: 0.07, voices: 2, vary: true }),
        L('low', 'pianoLow', { pat: BAR1, pick: 'root', oct: 2, gain: 0.45, when: b => b % 2 === 0 }),
        L('glass', 'glass', { pat: BAR1, pick: 'top', oct: 4, len: 14, gain: 0.45, when: b => b % 4 === 3 }),
        L('air', 'choir', { pat: BAR1, pick: 'chord', oct: 3, len: 16, vowel: 'oo', gain: 0.25 }),
      ]},

      /* The Traitor got away with it. Minor, triumphant, with bells
         tolling — the villain's anthem, not the victim's. */
      verdictTraitor: { bpm: 72, prog: 'fate', alt: ['verdictTraitor2'], layers: [
        L('toll', 'bell', { pat: HALF, abs: 0, oct: 3, gain: 0.55, ratio: 1.4, decay: 3.5 }),
        L('choir', 'choir', { pat: HALF, pick: 'chord', oct: 3, len: 8, vowel: 'ah', gain: 0.65 }),
        L('horn', 'brass', { motif: 'fate', oct: 2, gain: 0.7 }),
        L('ost', 'strings', { pat: OST8_V, pick: OST8_P, oct: 1, art: 'spic', gain: 0.8,
          fam: 'cello' }),
        L('taiko', 'taiko', { pat: vel('X.......X.....5.'), gain: 0.7 }),
      ]},

      // the Traitors' motif, low and slow, on the trombones, with the bells
      verdictTraitor2: { bpm: 66, prog: 'omen', layers: [
        L('low', 'lowBrass', { motif: 'traitors', oct: 2, gain: 0.8 }),
        L('choir', 'choir', { pat: HALF, pick: 'chord', oct: 3, len: 8, vowel: 'ah', gain: 0.6 }),
        L('toll', 'bell', { pat: HALF, abs: 0, oct: 3, gain: 0.5, ratio: 1.4, decay: 3.5 }),
        L('ost', 'strings', { pat: OST8_V, pick: OST8_P, oct: 1, art: 'spic', gain: 0.8, fam: 'cello' }),
        L('ens', 'taikoEns', { pat: vel('X.......X.......'), gain: 0.7 }),
        L('glass', 'glass', { pat: BAR1, abs: 13, oct: 3, len: 14, gain: 0.35, bend: true, when: b => b % 4 === 3 }),
      ]},

      /* The credits, under the verdict panel: the same three, gentler,
         so the table can sit with the result for as long as it likes.
         Each is a medley — the night's tunes in turn, one a phrase. */
      creditsWin: { bpm: 76, prog: 'victory', form: 'AABB', phrase: 8, layers: [
        L('harp', 'harp', { pat: vel('X.6.7.6.X.6.7.6.'), pick: ARP8_P, oct: 3, gain: 0.5 }),
        L('horn', 'horn', { motif: 'faithful', oct: 2, gain: 0.6, parts: 'B' }),
        L('violins', 'strings', { motif: 'hymn', oct: 3, gain: 0.55, art: 'sustain', fam: 'hiStr', parts: 'A', legato: true }),
        L('celli', 'strings', { pat: HALF, pick: 'root', oct: 1, len: 8, art: 'sustain',
          gain: 0.5, fam: 'cello' }),
        L('air', 'choir', { pat: BAR1, pick: 'chord', oct: 3, len: 16, vowel: 'oo', gain: 0.3 }),
      ]},
      creditsLoss: { bpm: 58, prog: 'fate', form: 'AABB', phrase: 8, progs: { B: 'fire' }, layers: [
        L('piano', 'piano', { motif: 'fate', oct: 3, gain: 0.75, parts: 'A' }),
        L('cello', 'strings', { motif: 'theme', oct: 2, gain: 0.8, art: 'sustain', fam: 'cello', legato: true, parts: 'B' }),
        L('low', 'strings', { pat: BAR1, pick: 'root', oct: 1, len: 16, art: 'sustain', gain: 0.45 }),
        L('pad', 'strings', { pat: BAR1, pick: 'chord', oct: 3, len: 16, art: 'swell', gain: 0.22 }),
      ]},
      creditsTraitor: { bpm: 72, prog: 'fate', form: 'AABB', phrase: 8, progs: { B: 'omen' }, layers: [
        L('box', 'celesta', { motif: 'fate', oct: 4, gain: 0.6, parts: 'A' }),
        L('box2', 'celesta', { motif: 'traitors', oct: 4, gain: 0.6, parts: 'B' }),
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
        L('piano', 'piano', { motif: 'theme', oct: 3, gain: 0.75, parts: 'AB', vary: true }),
        L('horn', 'horn', { motif: 'theme', oct: 2, gain: 0.7, parts: 'B' }),
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
        L('clock', 'tick', { pat: vel('X...X...X...X...'), gain: 0.55 }),
        L('tock', 'tick', { pat: vel('..8...8...8...8.'), tock: true, gain: 0.55 }),
        L('trem', 'strings', { pat: BAR1, pick: 'chord', oct: 3, len: 16, art: 'tremolo', gain: 0.5 }),
        L('low', 'strings', { pat: BAR1, pick: 'root', oct: 1, len: 16, art: 'sustain', gain: 0.6, voices: 2 }),
        L('pulse', 'synthBass', { pat: PULSE8, pick: 'root', oct: 1, len: 2, gain: 0.45 }),
        L('taiko', 'taiko', { pat: vel('X.........7.....'), gain: 0.5 }),
      ]},
      /* The rise: the roll that keeps climbing, the choir coming up
         under it, and nothing resolving until the name lands. */
      /* The bed under the Wise One's build (`build.js`, shape 'wise'):
         the key held low and a choir on "oo". The build does the rest. */
      wiseRise: { bpm: 84, prog: 'hold', duckLift: 0, layers: [
        L('low', 'strings', { pat: BAR1, abs: 0, oct: 1, len: 16, art: 'sustain', gain: 0.6, voices: 2 }),
        L('air', 'choir', { pat: BAR1, abs: 0, oct: 3, len: 16, vowel: 'oo', gain: 0.3 }),
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
     The title. Not the lament — that is the fire's, and on a menu it
     just sounded sad. This is the castle at a run: a riff on the
     heroic minor (i, VI, III, VII), short hard notes that climb, a
     chromatic slip onto the dominant at the end so it always wants
     to go round again. Dark because it is minor and full of knives;
     lively because nothing in it is longer than a beat.

     `gate` is the riff on a piano over the celli chopping and a light
     kit; `anthem` is the horns taking it, the choir in stabs, the
     drums all in. `main.js` lifts the section a pass in, on a bar
     line, behind a reverse cymbal. It loops there; it sits under a
     menu, so it is kept well down. */
  const OVERTURE = [
    // Dm: up the triad to the octave and back down
    [0, 0, 3, 1.1], [3, 3, 3], [6, 7, 2], [8, 12, 4, 1.05], [12, 10, 2], [14, 7, 2],
    // Bb
    [16, 8, 3, 1.1], [19, 12, 3], [22, 15, 2], [24, 12, 4], [28, 10, 2], [30, 8, 2],
    // F
    [32, 15, 3, 1.1], [35, 10, 3], [38, 7, 2], [40, 10, 4], [44, 12, 2], [46, 15, 2],
    // C: the high point
    [48, 17, 6, 1.15], [54, 15, 2], [56, 14, 4], [60, 10, 4, 0.9],
    // Dm again, the answer
    [64, 0, 3, 1.1], [67, 3, 3], [70, 7, 2], [72, 12, 4, 1.05], [76, 15, 2], [78, 12, 2],
    // Bb
    [80, 15, 3, 1.1], [83, 12, 3], [86, 8, 2], [88, 3, 4], [92, 8, 4],
    // C
    [96, 10, 3, 1.1], [99, 14, 3], [102, 17, 2], [104, 14, 4], [108, 10, 2], [110, 14, 2],
    // A: the slip down onto the dominant, and the leading tone to go round
    [112, 14, 4, 1.1], [116, 13, 2], [118, 11, 2], [120, 7, 4], [124, 11, 4, 0.9],
  ];
  MOTIFS.overture = motif(128, OVERTURE);
  // the riff's off-beat push, for the celli: root, root, the fifth below
  const RAID16_V = vel('X.7X.7X.X.7X.789');
  const RAID16_P = pick('0.0a.0a.0.0a.012');

  const TITLE = {
    level: 0.4, room: 'hall', reverb: 0.3,
    gears: ['gate', 'anthem'],
    trans: { '*>anthem': 'fill' },
    sections: {
      gate: { bpm: 132, prog: 'epic', alt: ['gate2', 'gate3'], duckLift: 0.3, talkDuck: 0.3, layers: [
        L('lead', 'piano', { motif: 'overture', oct: 3, gain: 0.62, vary: true }),
        L('riff', 'strings', { pat: RAID16_V, pick: RAID16_P, oct: 1, art: 'spic', gain: 0.6, fam: 'cello' }),
        L('pizz', 'pizz', { pat: OST8_V, pick: OST8_P, oct: 2, gain: 0.4 }),
        L('bass', 'synthBass', { pat: PULSE8, pick: 'root', oct: 1, len: 2, gain: 0.35 }),
        L('taiko', 'taiko', { pat: vel('X.....6.X.......'), gain: 0.42 }),
        L('hat', 'hat', { pat: vel('..5...5...5...56'), gain: 0.22 }),
      ]},

      /* The same eight bars with everybody in: horns on the riff, the
         violins doubling it on the second pass, the choir in short
         stabs instead of a held chord, and drums on every push. */
      /* The second visit to the front door: the riff plucked, a ticking
         synth under it and a music box an octave up. */
      gate2: { bpm: 132, prog: 'epic', duckLift: 0.3, talkDuck: 0.3, layers: [
        L('lead', 'pizz', { motif: 'overture', oct: 3, gain: 0.8, vary: true }),
        L('box', 'celesta', { motif: 'overture', oct: 4, gain: 0.25, when: b => b % 16 >= 8 }),
        L('ticker', 'ostSynth', { pat: vel('X5657565X5657565'), pick: 'root', oct: 2, gain: 0.3 }),
        L('low', 'strings', { pat: BAR1, pick: 'root', oct: 1, len: 16, art: 'sustain', gain: 0.45, voices: 2 }),
        L('bass', 'synthBass', { pat: PULSE8, pick: 'root', oct: 1, len: 2, gain: 0.35 }),
        L('taiko', 'taiko', { pat: vel('X.......X.....6.'), gain: 0.42 }),
      ]},
      // the third: the horns on the riff over the pipes' drones, and a side drum
      gate3: { bpm: 132, prog: 'epic', duckLift: 0.3, talkDuck: 0.3, layers: [
        L('lead', 'horn', { motif: 'overture', oct: 2, gain: 0.7, vary: true }),
        L('drones', 'pipeDrone', { pat: BAR1, abs: 0, oct: 2, len: 32, gain: 0.55, when: b => b % 2 === 0 }),
        L('riff', 'strings', { pat: RAID16_V, pick: RAID16_P, oct: 1, art: 'spic', gain: 0.55, fam: 'cello' }),
        L('snare', 'snare', { pat: vel('X.5.7.5.X.5.757X'), gain: 0.12 }),
        L('taiko', 'taiko', { pat: vel('X.....6.X.......'), gain: 0.42 }),
      ]},

      anthem: { bpm: 132, prog: 'epic', alt: ['anthem2', 'anthem3'], duckLift: 0.3, talkDuck: 0.3, layers: [
        L('horn', 'brass', { motif: 'overture', oct: 2, gain: 0.6, vary: true }),
        L('violins', 'strings', { motif: 'overture', oct: 3, art: 'spic', fam: 'hiStr', gain: 0.45,
          when: b => b % 16 >= 8 }),
        L('riff', 'strings', { pat: RAID16_V, pick: RAID16_P, oct: 1, art: 'spic', gain: 0.75, fam: 'cello' }),
        L('riff2', 'strings', { pat: RAID16_V, pick: RAID16_P, oct: 2, art: 'spic', gain: 0.32, fam: 'hiStr' }),
        L('stab', 'choir', { pat: vel('X.....7.....8...'), pick: 'chord', oct: 3, len: 2, vowel: 'ah', gain: 0.3 }),
        L('ticker', 'ostSynth', { pat: vel('X5657565X5657565'), pick: 'root', oct: 2, gain: 0.3, when: b => b % 16 >= 4 }),
        L('bass', 'synthBass', { pat: PULSE8, pick: 'root', oct: 1, len: 2, gain: 0.45 }),
        L('taiko', 'taiko', { pat: vel('X.....6.X.6...7.'), gain: 0.6 }),
        L('snare', 'snare', { pat: vel('....7.......7..5'), gain: 0.28 }),
        L('hat', 'hat', { pat: vel('..5...5...5...56'), gain: 0.22 }),
        L('tom', 'tom', { pat: vel('............6.78'), gain: 0.35, when: b => b % 4 === 3 }),
        L('crash', 'crash', { pat: BAR1, gain: 0.35, when: b => b % 8 === 0 }),
      ]},
    },
  };

  // the lifts of the other two arrangements, everybody in
  Object.assign(TITLE.sections, {
    anthem2: { bpm: 132, prog: 'epic', duckLift: 0.3, talkDuck: 0.3, layers: [
      L('low', 'lowBrass', { motif: 'overture', oct: 2, gain: 0.55, vary: true }),
      L('violins', 'strings', { motif: 'overture', oct: 3, art: 'spic', fam: 'hiStr', gain: 0.45, oct8: true }),
      L('riff', 'strings', { pat: RAID16_V, pick: RAID16_P, oct: 1, art: 'spic', gain: 0.75, fam: 'cello' }),
      L('stab', 'choir', { pat: vel('X.....7.....8...'), pick: 'chord', oct: 3, len: 2, vowel: 'ah', gain: 0.3 }),
      L('ticker', 'ostSynth', { pat: vel('X5657565X5657565'), pick: 'root', oct: 2, gain: 0.28 }),
      L('bass', 'synthBass', { pat: PULSE8, pick: 'root', oct: 1, len: 2, gain: 0.45 }),
      L('ens', 'taikoEns', { pat: vel('X.......X.......'), gain: 0.55 }),
      L('taiko', 'taiko', { pat: vel('......6.....6.7.'), gain: 0.5 }),
      L('snare', 'snare', { pat: vel('....7.......7..5'), gain: 0.26 }),
      L('crash', 'crash', { pat: BAR1, gain: 0.35, when: b => b % 8 === 0 }),
    ]},
    anthem3: { bpm: 132, prog: 'epic', duckLift: 0.3, talkDuck: 0.3, layers: [
      L('horn', 'brass', { motif: 'overture', oct: 2, gain: 0.55, vary: true }),
      L('chanter', 'pipes', { motif: 'overture', oct: 3, gain: 0.45, when: b => b % 16 >= 8 }),
      L('drones', 'pipeDrone', { pat: BAR1, abs: 0, oct: 2, len: 16, gain: 0.6 }),
      L('riff', 'strings', { pat: RAID16_V, pick: RAID16_P, oct: 1, art: 'spic', gain: 0.75, fam: 'cello' }),
      L('choir', 'choir', { pat: HALF, pick: 'chord', oct: 3, len: 8, vowel: 'oh', gain: 0.32 }),
      L('bass', 'synthBass', { pat: PULSE8, pick: 'root', oct: 1, len: 2, gain: 0.45 }),
      L('snare', 'snare', { pat: vel('X5X57575X5X575XX'), gain: 0.18 }),
      L('taiko', 'taiko', { pat: vel('X.....6.X.6...7.'), gain: 0.6 }),
      L('crash', 'crash', { pat: BAR1, gain: 0.35, when: b => b % 8 === 0 }),
    ]},
  });

  /* ---------------- the round table ----------------
     Candles, a ring of chairs, and an argument. Everything under the
     discussion is low and rhythmic and ducks hard under any voice;
     the slate is a heart and a clock; each name turned is a hit; the
     banishment is the whole hall at once, then either the hymn's
     relief or the lament. */
  const ROUNDTABLE = {
    level: 0.82, room: 'epic', reverb: 0.36,
    gears: ['gather', 'debate', 'slate', 'reveal'],
    // the argument stops dead before the slates; the walk out is kicked in
    trans: { 'debate>slate': 'cut', '*>walkout': 'fill' },
    sections: {
      gather: { bpm: 66, prog: 'table', form: 'AABC', progs: { C: 'omen' }, duckLift: 0.3, layers: [
        L('drone', 'strings', { pat: BAR1, abs: 0, oct: 1, len: 32, art: 'sustain',
          gain: 0.8, when: b => b % 2 === 0, voices: 3 }),
        L('harp', 'harp', { pat: vel('X.5.6.5.X.5.6.5.'), pick: ARP8_P, oct: 2, gain: 0.45 }),
        L('cello', 'strings', { motif: 'theme', oct: 2, gain: 0.85, art: 'sustain', legato: true,
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
      debate: { bpm: 84, prog: 'table', form: ['AABA CB', 'ABAC BC', 'AACA BB'], alt: ['debateClock'],
        progs: { B: 'omen', C: 'abyss' }, talkDuck: 0.28, duckLift: 0, layers: [
        L('pizz', 'pizz', { pat: OST8_V, pick: OST8_P, pats: TALK_V, picks: TALK_P, oct: 2, gain: 0.7, int: true }),
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
      /* The slates. A clock and a heart; and as each slate turns the
         tension goes up a notch (castle-scene.js), the clock doubles, a
         pulse arrives under it and the strings start to shiver. */
      /* The other day's argument: the suspicion clock, in seven-eight —
         a tick grouped two, two, three, so the bar comes round a quaver
         before you expect it, and the clock's own tune on a music box.
         Underneath voices, so still never a tune you could hum. */
      debateClock: { bpm: 84, steps: 14, prog: 'omen', form: ['AABA', 'ABAB'], progs: { B: 'abyss' },
        talkDuck: 0.28, duckLift: 0, layers: [
        L('tick', 'tick', { pat: vel('X...6...7.....'), gain: 0.45 }),
        L('tock', 'tick', { pat: vel('..5...5...5.5.'), tock: true, gain: 0.35 }),
        L('pizz', 'pizz', { pat: vel('X.6.X.6.X.6.8.'), pick: pick('0.2.3.2.0.2.1.'), oct: 2, gain: 0.6, int: true }),
        L('low', 'strings', { pat: vel('X.............'), pick: 'root', oct: 1, len: 14, art: 'sustain', gain: 0.5, voices: 2 }),
        L('box', 'celesta', { motif: 'suspicion', oct: 4, gain: 0.3, parts: 'A', vary: true }),
        L('heart', 'heartbeat', { pat: vel('X.......X.....'), gain: 0.35, minInt: 0.8 }),
        L('mm', 'choir', { pat: vel('X.............'), pick: 'chord', oct: 2, len: 14, vowel: 'mm', gain: 0.3, parts: 'B' }),
        L('pulse', 'synthBass', { pat: vel('X.6.X.6.X.6.6.'), pick: 'root', oct: 1, len: 2, gain: 0.35, minInt: 1.0 }),
        L('trem', 'strings', { pat: vel('X.............'), pick: 'top', oct: 4, len: 14, art: 'tremolo', gain: 0.22, minInt: 1.1 }),
      ]},
      slate: { bpm: 60, prog: 'hold', layers: [
        L('tick8', 'tick', { pat: vel('..6...6...6...6.'), gain: 0.4, tens: [0.55, 1] }),
        L('pulseT', 'synthBass', { pat: vel('X.......X.......'), pick: 'root', oct: 1, len: 3, gain: 0.45, tens: [0.7, 1] }),
        L('tremT', 'strings', { pat: BAR1, pick: 'top', oct: 4, len: 16, art: 'tremolo', gain: 0.3, tens: [0.82, 1] }),
        L('heart', 'heartbeat', { pat: BEATS, gain: 0.7 }),
        L('clock', 'tick', { pat: vel('X.......X.......'), gain: 0.55 }),
        L('tock', 'tick', { pat: vel('....8.......8...'), tock: true, gain: 0.55 }),
        L('trem', 'strings', { pat: BAR1, pick: 'chord', oct: 2, len: 16, art: 'tremolo', gain: 0.4 }),
        L('sub', 'strings', { pat: BAR1, abs: 0, oct: 1, len: 16, art: 'sustain', gain: 0.5 }),
      ]},
      /* The name, and the walk to stand where everybody can see: a slow
         march — two drums a bar, a snare that hardly touches it, the
         horns swelling on the chord. */
      reveal: { bpm: 60, prog: 'pouch', duckLift: 0.15, layers: [
        L('march', 'timpani', { pat: vel('X.......8.......'), pick: 'root', oct: 1, gain: 0.45 }),
        L('snare', 'snare', { pat: vel('............5.55'), gain: 0.14 }),
        L('low', 'strings', { pat: BAR1, pick: 'root', oct: 1, len: 16, art: 'sustain', gain: 0.65 }),
        L('horn', 'horn', { pat: BAR1, pick: 'chord', oct: 2, len: 16, art: 'swell', gain: 0.4, when: b => b % 2 === 0 }),
        L('choir', 'choir', { pat: BAR1, pick: 'chord', oct: 3, len: 16, vowel: 'oo', gain: 0.35 }),
      ]},
      // their last words: one held string and a heart, and nothing over their voice
      lastWords: { bpm: 60, prog: 'hold', duckLift: 0, layers: [
        L('low', 'strings', { pat: BAR1, abs: 0, oct: 1, len: 16, art: 'sustain', gain: 0.6, voices: 2 }),
        L('heart', 'heartbeat', { pat: HALF, gain: 0.45 }),
      ]},
      /* The bed under "I am…". It used to be the roll itself; the roll is
         the build's now (`build.js`, shape 'banish'), and this is only
         what is left underneath when the build is cut: the key, low. */
      drumroll: { bpm: 76, prog: 'hold', duckLift: 0, layers: [
        L('low', 'strings', { pat: BAR1, abs: 0, oct: 1, len: 16, art: 'sustain', gain: 0.55, voices: 2 }),
      ]},
      /* And then they walk out. Everything the band has: the theme on
         the horns, the choir, the ostinato, the big drums. */
      walkout: { bpm: 100, prog: 'fate', duckLift: 0.2, layers: [
        L('horn', 'brass', { motif: 'fate', oct: 2, gain: 0.9 }),
        L('horn8', 'brass', { motif: 'fate', oct: 1, gain: 0.5 }),
        L('choir', 'choir', { pat: HALF, pick: 'chord', oct: 3, len: 8, vowel: 'ah', gain: 0.62 }),
        L('ost', 'strings', { pat: OST16_V, pick: OST16_P, oct: 1, art: 'spic', gain: 0.95, fam: 'cello' }),
        L('ost2', 'strings', { pat: OST16_V, pick: OST16_P, oct: 2, art: 'spic', gain: 0.45, fam: 'hiStr' }),
        L('ens', 'taikoEns', { pat: BAR1, gain: 0.9 }),
        L('taiko', 'taiko', { pat: vel('..7.X.7.X.7.X.8X'), gain: 0.85 }),
        L('timp', 'timpani', { pat: vel('X.......X.......'), pick: 'root', oct: 1, gain: 0.6 }),
        L('crash', 'crash', { pat: BAR1, gain: 0.45, when: b => b % 4 === 0 }),
        L('bells', 'bell', { pat: BAR1, pick: 'top', oct: 4, gain: 0.25 }),
      ]},
      /* The Wise One's slate, last, with the room told it outranks
         theirs. The roll and the choir climb for as long as Claudia
         holds it; the riser rides on top. */
      /* The bed under the overrule's build: a braam every other bar on
         the abyss chords, which is what tells the room this one is not
         like the other slates. The build climbs over it. */
      overruleRise: { bpm: 88, prog: 'abyss', duckLift: 0.1, layers: [
        L('low', 'braam', { pat: BAR1, pick: 'root', oct: 1, len: 16, gain: 0.45, when: b => b % 2 === 0 }),
        L('air', 'choir', { pat: BAR1, pick: 'chord', oct: 2, len: 16, vowel: 'mm', gain: 0.35 }),
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
        L('ens', 'taikoEns', { pat: HALF, gain: 0.95 }),
        L('chant', 'chant', { pat: vel('X.7.X.7.X.7.X.8.'), pick: 'chord', oct: 3, gain: 0.6 }),
        L('anvil', 'anvil', { pat: vel('X.......7.......'), gain: 0.6, when: b => b % 2 === 1 }),
        L('taiko', 'taiko', { pat: vel('..7...7...7...8X'), gain: 0.9 }),
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
    trans: { 'dawn>breakfast': 'swell' },
    sections: {
      nightfall: { bpm: 54, prog: 'conclave', form: ['AB', 'AABB'], progs: { B: 'omen' },
        alt: ['nightGlass', 'nightBells'], duckLift: 0.25, layers: [
        L('box', 'celesta', { motif: 'theme', oct: 4, gain: 0.55, parts: 'A' }),
        L('toll', 'bell', { pat: HALF, abs: 0, oct: 3, gain: 0.3, ratio: 1.4, decay: 3.5, parts: 'B' }),
        L('mm', 'choir', { pat: BAR1, pick: 'chord', oct: 2, len: 16, vowel: 'mm', gain: 0.38, parts: 'B' }),
        L('trem', 'strings', { pat: BAR1, pick: 'chord', oct: 3, len: 16, art: 'tremolo', gain: 0.3 }),
        L('sub', 'strings', { pat: BAR1, abs: 0, oct: 1, len: 32, art: 'sustain', gain: 0.6,
          when: b => b % 2 === 0, voices: 2 }),
        L('air', 'choir', { pat: BAR1, pick: 'chord', oct: 3, len: 16, vowel: 'oo', gain: 0.28 }),
        L('glass', 'glass', { pat: BAR1, pick: 'top', oct: 4, len: 12, gain: 0.55, bend: true, when: b => b % 2 === 1 }),
      ]},
      /* The second night, and every third after: glass and nothing
         else to speak of — a wet finger on a rim, a sagging note high
         up, one low piano key every other bar. */
      nightGlass: { bpm: 50, prog: 'omen', duckLift: 0.25, layers: [
        L('glass', 'glass', { pat: BAR1, pick: 'top', oct: 4, len: 14, gain: 0.55, bend: true }),
        L('glass2', 'glass', { pat: vel('........X.......'), pick: 'third', oct: 4, len: 10, gain: 0.35, when: b => b % 2 === 1 }),
        L('low', 'pianoLow', { pat: BAR1, pick: 'root', oct: 2, gain: 0.45, when: b => b % 2 === 0 }),
        L('sub', 'strings', { pat: BAR1, abs: 0, oct: 1, len: 32, art: 'sustain', gain: 0.5, when: b => b % 2 === 0, voices: 2 }),
        L('air', 'choir', { pat: BAR1, pick: 'chord', oct: 3, len: 16, vowel: 'oo', gain: 0.22 }),
      ]},
      /* And the third: a bell a long way off, a harp counting, the
         strings so low they are mostly felt. */
      nightBells: { bpm: 56, prog: 'vigil', duckLift: 0.25, layers: [
        L('toll', 'bell', { pat: BAR1, abs: 0, oct: 3, gain: 0.35, ratio: 1.4, decay: 4, when: b => b % 2 === 0 }),
        L('harp', 'harp', { pat: vel('X...6...7...6...'), pick: pick('0...1...2...1...'), oct: 3, gain: 0.32 }),
        L('low', 'strings', { pat: BAR1, pick: 'root', oct: 1, len: 16, art: 'sustain', gain: 0.5, fam: 'cello', voices: 2 }),
        L('mm', 'choir', { pat: BAR1, pick: 'chord', oct: 2, len: 16, vowel: 'mm', gain: 0.3 }),
        L('trem', 'strings', { pat: BAR1, pick: 'top', oct: 4, len: 16, art: 'tremolo', gain: 0.18, when: b => b % 4 === 3 }),
      ]},
      /* The turret. The Traitors' motif on a cello, low; and as the
         seconds to choose run out (night.js) the tension climbs: a clock,
         then a pulse under it. */
      conclave: { bpm: 63, prog: 'conclave', form: 'AAB', progs: { B: 'knife' }, talkDuck: 0.3, duckLift: 0, layers: [
        L('motif', 'strings', { motif: 'traitors', oct: 2, art: 'sustain', fam: 'cello', gain: 0.6, legato: true,
          parts: 'A', vary: true }),
        L('tickT', 'tick', { pat: vel('X...6...X...6...'), gain: 0.4, tens: [0.5, 1] }),
        L('pulseT', 'synthBass', { pat: vel('X.6.X.6.X.6.X.6.'), pick: 'root', oct: 1, len: 1, gain: 0.32, tens: [0.75, 1] }),
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
        // something in the house, a long way up: a fifth, then the flat sixth, sagging
        L('glass', 'glass', { pat: BAR1, pats: [BAR1, vel('........X.......')], abs: 7, oct: 4, len: 10, gain: 0.4,
          bend: true, when: b => b % 4 === 2 }),
        L('glass2', 'glass', { pat: BAR1, abs: 8, oct: 4, len: 10, gain: 0.3, bend: true, when: b => b % 8 === 5 }),
      ]},
      dawn: { bpm: 66, prog: 'vigil', duckLift: 0.3, layers: [
        L('harp', 'harp', { pat: vel('X.6.7.6.X.6.7.6.'), pick: ARP8_P, oct: 3, gain: 0.45 }),
        L('pad', 'strings', { pat: BAR1, pick: 'chord', oct: 3, len: 16, art: 'swell', gain: 0.35 }),
        L('air', 'choir', { pat: BAR1, pick: 'chord', oct: 3, len: 16, vowel: 'oo', gain: 0.25 }),
      ]},
      /* Breakfast is Claudia's waltz: three-four, a bass on one and the
         chord on two and three, the tune on a music box and then a piano.
         The B and C parts turn the harmony dark under the same polite
         accompaniment, which is worse. */
      breakfast: { bpm: 112, steps: 12, prog: 'waltz', form: ['AABC', 'ABAC'], phrase: 8,
        progs: { B: 'omen', C: 'abyss' }, talkDuck: 0.35, duckLift: 0.2, layers: [
        L('tune', 'celesta', { motif: 'waltz', oct: 4, gain: 0.5, parts: 'A', vary: true,
          rotate: [{}, { inst: 'piano', oct: 3, gain: 0.65 }] }),
        L('oom', 'pizz', { pat: vel('X...........'), pick: 'root', oct: 2, gain: 0.6 }),
        L('pah', 'harp', { pat: vel('....6...6...'), pick: pick('....1...2...'), oct: 3, gain: 0.38 }),
        L('pah2', 'harp', { pat: vel('....5...5...'), pick: pick('....2...1...'), oct: 3, gain: 0.3 }),
        L('low', 'strings', { pat: vel('X...........'), pick: 'root', oct: 1, len: 12, art: 'sustain', gain: 0.35 }),
        L('mm', 'choir', { pat: vel('X...........'), pick: 'chord', oct: 2, len: 12, vowel: 'mm', gain: 0.3, parts: 'BC' }),
        L('cello', 'strings', { motif: 'waltz', oct: 2, art: 'sustain', fam: 'cello', gain: 0.55, legato: true, parts: 'B' }),
        L('heart', 'heartbeat', { pat: vel('X.....X.....'), gain: 0.35, parts: 'C' }),
        L('glass', 'glass', { pat: vel('X...........'), abs: 1, oct: 4, len: 10, gain: 0.3, bend: true, parts: 'C',
          when: b => b % 2 === 1 }),
        L('tick', 'tick', { pat: vel('..4...4...4.'), gain: 0.3, minInt: 0.9 }),
      ]},
      absence: { bpm: 58, prog: 'fate', layers: [
        L('cello', 'strings', { motif: 'fate', oct: 2, gain: 1.0, art: 'sustain', fam: 'cello', legato: true,
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
    trans: { '*>bell': 'fill', '*>bellHunt': 'fill', '*>bellReel': 'fill' },
    sections: {
      work: { bpm: 120, steps: 12, prog: 'jig', form: DAY_FORMS, progs: { C: 'omen' },
        alt: ['workHunt', 'workReel', 'workHeist', 'workPipes'], talkDuck: 0.42, duckLift: 0.12, layers: [
        L('fiddle', 'strings', { motif: 'jig', oct: 3, art: 'spic', fam: 'hiStr', gain: 0.62, parts: 'AB',
          vary: true, rotate: PASS_TUNE }),
        L('horn', 'brass', { motif: 'jig', oct: 2, gain: 0.42, parts: 'B' }),
        L('chanter', 'pipes', { motif: 'jig', oct: 3, gain: 0.55, parts: 'B' }),
        L('ost', 'strings', { pat: vel('X.6.7.X.6.7.'), pick: pick('0.2.3.0.2.1.'), oct: 1, art: 'spic',
          fam: 'cello', gain: 0.6 }),
        L('bass', 'synthBass', { pat: vel('X.....X.6...'), pick: 'root', oct: 1, len: 2, gain: 0.7, parts: 'BC' }),
        L('drone', 'strings', { pat: vel('X...........'), abs: 0, oct: 1, len: 24, art: 'sustain',
          gain: 0.3, when: b => b % 2 === 0, voices: 2, parts: 'A' }),
        L('choir', 'choir', { pat: vel('X...........'), pick: 'chord', oct: 3, len: 12, vowel: 'ah', gain: 0.32,
          parts: 'BC' }),
        L('bodhran', 'tom', { pat: vel('X.4.5.7.4.5.'), fills: JIG_FILLS, gain: 0.34 }),
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
        L('ticker', 'ostSynth', { pat: vel('X5657565X5657565'), pick: pick('0000000000000001'), oct: 2, gain: 0.3, parts: 'BC' }),
        L('horn', 'brass', { motif: 'hunt', oct: 2, gain: 0.6, parts: 'B' }),
        L('lead', 'strings', { motif: 'hunt', oct: 3, art: 'spic', fam: 'hiStr', gain: 0.5, parts: 'A',
          vary: true, rotate: PASS_TUNE }),
        L('choir', 'choir', { pat: HALF, pick: 'chord', oct: 3, len: 8, vowel: 'oh', gain: 0.35, parts: 'BC' }),
        L('taiko', 'taiko', { pat: vel('X.....7.X.6...7.'), gain: 0.6 }),
        L('tom', 'tom', { pat: vel('....6.....6.7.8.'), gain: 0.32, parts: 'BC',
          fills: [vel('....6...6.7.8.9X'), vel('..6...6.7.8.9.XX'), vel('....6.7...789XX.')] }),
        L('braam', 'braam', { pat: BAR1, pick: 'root', oct: 1, len: 24, gain: 0.6,
          parts: 'C', when: b => b % 2 === 0 }),
        L('crash', 'crash', { pat: BAR1, gain: 0.35, when: b => b % 4 === 0, parts: 'B' }),
      ]},
      workReel: { bpm: 132, steps: 12, prog: 'jigDark', form: DAY_FORMS, progs: { C: 'abyss' },
        talkDuck: 0.42, duckLift: 0.12, layers: [
        L('fiddle', 'strings', { motif: 'reel', oct: 3, art: 'spic', fam: 'hiStr', gain: 0.6, parts: 'AB',
          vary: true, rotate: PASS_TUNE }),
        L('box', 'celesta', { motif: 'reel', oct: 4, gain: 0.16, parts: 'A' }),
        L('horn', 'brass', { motif: 'reel', oct: 2, gain: 0.4, parts: 'B' }),
        L('drones', 'pipeDrone', { pat: vel('X...........'), abs: 0, oct: 2, len: 24, gain: 0.7,
          when: b => b % 2 === 0, parts: 'AB' }),
        L('ost', 'strings', { pat: vel('X6X6X6X6X6X6'), pick: pick('0a0a020a0a01'), oct: 1, art: 'spic',
          fam: 'cello', gain: 0.62 }),
        L('bass', 'synthBass', { pat: vel('X..7..X..7..'), pick: 'root', oct: 1, len: 2, gain: 0.65 }),
        L('choir', 'choir', { pat: vel('X...........'), pick: 'chord', oct: 3, len: 12, vowel: 'mm', gain: 0.34,
          parts: 'BC' }),
        L('bodhran', 'tom', { pat: vel('X.4.6.X.4.7.'), fills: JIG_FILLS, gain: 0.38 }),
        L('taiko', 'taiko', { pat: vel('X.....7.....'), gain: 0.5 }),
        L('braam', 'braam', { pat: vel('X...........'), pick: 'root', oct: 1, len: 18, gain: 0.55,
          parts: 'C', when: b => b % 2 === 0 }),
        L('toll', 'bell', { pat: vel('X...........'), abs: 0, oct: 3, gain: 0.3, ratio: 1.4, decay: 3,
          parts: 'C', when: b => b % 2 === 1 }),
      ]},
      /* The heist: a ticking synth, plucked strings and the tune on
         tiptoe, the trombones taking it when the band fills in. */
      workHeist: { bpm: 124, prog: 'ballot', form: DAY_FORMS, progs: { C: 'knife' },
        talkDuck: 0.42, duckLift: 0.12, layers: [
        L('ticker', 'ostSynth', { pat: vel('X5657565X5657565'), pick: 'root', oct: 2, gain: 0.34 }),
        L('pizz', 'pizz', { pat: OST8_V, pick: OST8_P, pats: TALK_V, picks: TALK_P, oct: 2, gain: 0.55 }),
        L('lead', 'strings', { motif: 'heist', oct: 3, art: 'spic', fam: 'hiStr', gain: 0.55, parts: 'AB', vary: true,
          rotate: [{}, { inst: 'pizz', oct: 3, gain: 0.85, art: null, fam: null }, {},
                   { inst: 'celesta', oct: 4, gain: 0.34, art: null, fam: null }] }),
        L('low', 'lowBrass', { motif: 'heist', oct: 2, gain: 0.42, parts: 'B' }),
        L('bass', 'synthBass', { pat: PULSE8, pick: 'root', oct: 1, len: 2, gain: 0.6 }),
        L('snare', 'snare', { pat: vel('....7.......7..5'), gain: 0.18, parts: 'BC' }),
        L('taiko', 'taiko', { pat: vel('X.....6.X.......'), gain: 0.5 }),
        L('braam', 'braam', { pat: BAR1, pick: 'root', oct: 1, len: 24, gain: 0.55, parts: 'C', when: b => b % 2 === 0 }),
        L('trem', 'strings', { pat: BAR1, pick: 'top', oct: 4, len: 16, art: 'tremolo', gain: 0.22, parts: 'C' }),
      ]},
      /* The pipes: the chanter over its drones, a pipe band's snare and
         bass drum, the celli under it, and a whistle taking the tune. */
      workPipes: { bpm: 112, prog: 'jig', form: DAY_FORMS, progs: { C: 'omen' },
        talkDuck: 0.42, duckLift: 0.12, layers: [
        L('chanter', 'pipes', { motif: 'pipes', oct: 3, gain: 0.55, parts: 'AB', vary: true,
          rotate: [{}, {}, { inst: 'whistle', oct: 3, gain: 0.7 }, {}] }),
        L('drones', 'pipeDrone', { pat: BAR1, abs: 0, oct: 2, len: 32, gain: 0.7, when: b => b % 2 === 0, parts: 'AB' }),
        L('horn', 'brass', { motif: 'pipes', oct: 2, gain: 0.4, parts: 'B' }),
        L('ost', 'strings', { pat: OST8_V, pick: OST8_P, oct: 1, art: 'spic', fam: 'cello', gain: 0.6 }),
        L('bass', 'synthBass', { pat: vel('X.......X...6...'), pick: 'root', oct: 1, len: 2, gain: 0.6 }),
        L('snare', 'snare', { pat: vel('X.5.7.5.X.5.757X'), gain: 0.14,
          fills: [vel('X.5.7.5.X5X5X5XX'), vel('X.5.X.5.X.X.XXXX')] }),
        L('taiko', 'taiko', { pat: vel('X.......X.......'), gain: 0.55 }),
        L('tenor', 'tom', { pat: vel('....6.......6...'), gain: 0.3 }),
        L('choir', 'choir', { pat: HALF, pick: 'chord', oct: 3, len: 8, vowel: 'oh', gain: 0.32, parts: 'BC' }),
        L('braam', 'braam', { pat: BAR1, pick: 'root', oct: 1, len: 24, gain: 0.55, parts: 'C', when: b => b % 2 === 0 }),
      ]},
      bell: { bpm: 136, steps: 12, prog: 'jig', alt: ['bellHunt', 'bellReel', 'bellHeist', 'bellPipes'], talkDuck: 0.42, layers: [
        L('fiddle', 'strings', { motif: 'jig', oct: 3, art: 'spic', fam: 'hiStr', gain: 0.7, vary: true }),
        L('horn', 'brass', { motif: 'jig', oct: 2, gain: 0.45 }),
        L('ost', 'strings', { pat: vel('X6X6X6X6X6X6'), pick: pick('020302010203'), oct: 1, art: 'spic',
          fam: 'cello', gain: 0.7 }),
        L('bass', 'synthBass', { pat: vel('X.....X.7...'), pick: 'root', oct: 1, len: 2, gain: 0.7 }),
        L('drone', 'strings', { pat: vel('X...........'), abs: 0, oct: 1, len: 12, art: 'sustain', gain: 0.36 }),
        L('choir', 'choir', { pat: vel('X...........'), pick: 'chord', oct: 3, len: 12, vowel: 'ah', gain: 0.42 }),
        L('bodhran', 'tom', { pat: vel('X.5.6.X.5.7.'), fills: JIG_FILLS, gain: 0.48 }),
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
      bellHeist: { bpm: 140, prog: 'ballot', talkDuck: 0.42, layers: [
        L('ticker', 'ostSynth', { pat: vel('X6X6X6X6X6X6X6X6'), pick: 'root', oct: 2, gain: 0.36 }),
        L('lead', 'strings', { motif: 'heist', oct: 3, art: 'spic', fam: 'hiStr', gain: 0.6, vary: true }),
        L('low', 'lowBrass', { motif: 'heist', oct: 2, gain: 0.55 }),
        L('ost', 'strings', { pat: OST16_V, pick: OST16_P, oct: 1, art: 'spic', fam: 'cello', gain: 0.8 }),
        L('bass', 'synthBass', { pat: PULSE8, pick: 'root', oct: 1, len: 2, gain: 0.65 }),
        L('snare', 'snare', { pat: vel('....7..5....7.75'), gain: 0.2 }),
        L('taiko', 'taiko', { pat: vel('X.7.X.7.X.7.X.8X'), gain: 0.65 }),
        L('crash', 'crash', { pat: BAR1, gain: 0.35, when: b => b % 2 === 0 }),
      ]},
      bellPipes: { bpm: 128, prog: 'jig', talkDuck: 0.42, layers: [
        L('chanter', 'pipes', { motif: 'pipes', oct: 3, gain: 0.6, vary: true }),
        L('drones', 'pipeDrone', { pat: BAR1, abs: 0, oct: 2, len: 16, gain: 0.75 }),
        L('horn', 'brass', { motif: 'pipes', oct: 2, gain: 0.5 }),
        L('ost', 'strings', { pat: OST16_V, pick: OST16_P, oct: 1, art: 'spic', fam: 'cello', gain: 0.75 }),
        L('bass', 'synthBass', { pat: PULSE8, pick: 'root', oct: 1, len: 2, gain: 0.6 }),
        L('snare', 'snare', { pat: vel('X5X57575X5X575XX'), gain: 0.16 }),
        L('taiko', 'taiko', { pat: vel('X.....7.X.....8.'), gain: 0.65 }),
        L('choir', 'choir', { pat: HALF, pick: 'chord', oct: 3, len: 8, vowel: 'ah', gain: 0.42 }),
      ]},
      bellReel: { bpm: 148, steps: 12, prog: 'jigDark', talkDuck: 0.42, layers: [
        L('fiddle', 'strings', { motif: 'reel', oct: 3, art: 'spic', fam: 'hiStr', gain: 0.7, vary: true }),
        L('horn', 'brass', { motif: 'reel', oct: 2, gain: 0.5 }),
        L('ost', 'strings', { pat: vel('X6X6X6X6X6X6'), pick: pick('0a0a020a0a01'), oct: 1, art: 'spic',
          fam: 'cello', gain: 0.7 }),
        L('bass', 'synthBass', { pat: vel('X.7X.7X.7X.7'), pick: 'root', oct: 1, len: 2, gain: 0.65 }),
        L('choir', 'choir', { pat: vel('X...........'), pick: 'chord', oct: 3, len: 12, vowel: 'ah', gain: 0.42 }),
        L('bodhran', 'tom', { pat: vel('X.5.6.X.5.7.'), fills: JIG_FILLS, gain: 0.5 }),
        L('taiko', 'taiko', { pat: vel('X..7..X.7.8.'), gain: 0.65 }),
        L('bell', 'bell', { pat: vel('X.....X.....'), pick: 'top', oct: 3, gain: 0.22 }),
      ]},
    },
  };

  /* ---------------- the castle, for practice ----------------
     Explore: the castle with nobody in it and nothing at stake. It used
     to borrow the round table's music, which made walking round an
     empty house sound like an accusation. Now it is light and moving:
     the theme on a harp and a whistle in the halls, the clock in the
     turret, the suspicion clock in the round room. */
  const EXPLORE = {
    level: 0.5, room: 'hall', reverb: 0.3,
    gears: ['roam', 'turret', 'round'],
    sections: {
      roam: { bpm: 96, prog: 'fire', form: 'AABA', progs: { B: 'vigil' }, duckLift: 0.25, layers: [
        L('tune', 'harp', { motif: 'theme', oct: 3, gain: 0.55, parts: 'A', vary: true,
          rotate: [{}, { inst: 'whistle', oct: 3, gain: 0.6 }, {}, { inst: 'dulcimer', oct: 3, gain: 0.6 }] }),
        L('pizz', 'pizz', { pat: OST8_V, pick: OST8_P, pats: TALK_V, picks: TALK_P, oct: 2, gain: 0.45 }),
        L('low', 'strings', { pat: BAR1, pick: 'root', oct: 1, len: 16, art: 'sustain', gain: 0.4, voices: 2 }),
        L('pad', 'strings', { pat: BAR1, pick: 'chord', oct: 3, len: 16, art: 'swell', gain: 0.25, parts: 'B' }),
        L('bodhran', 'tom', { pat: vel('X...5...X.5.6...'), gain: 0.22 }),
      ]},
      turret: { bpm: 60, prog: 'hold', layers: [
        L('clock', 'tick', { pat: vel('X.......X.......'), gain: 0.45 }),
        L('tock', 'tick', { pat: vel('....8.......8...'), tock: true, gain: 0.45 }),
        L('low', 'strings', { pat: BAR1, abs: 0, oct: 1, len: 16, art: 'sustain', gain: 0.4 }),
        L('glass', 'glass', { pat: BAR1, pick: 'top', oct: 4, len: 12, gain: 0.3, when: b => b % 4 === 2 }),
      ]},
      round: ROUNDTABLE.sections.debateClock,
    },
  };

  const CUES = {
    title: TITLE, finale: FINALE, ceremony: CEREMONY, tasks: TASKS,
    roundtable: ROUNDTABLE, murder: MURDER, explore: EXPLORE,
  };


  /* ---------------- variations ----------------
     Every tune gets its variants, in the scale it is written in. */
  for (const [name, scale, beat] of [
    ['theme', 'minor', 4], ['fate', 'minor', 4], ['overture', 'minor', 4], ['hymn', 'major', 4],
    ['hunt', 'dark', 4], ['jig', 'minor', 6], ['reel', 'dark', 6],
    ['theme68', 'minor', 6], ['hymn68', 'major', 6],
    ['traitors', 'dark', 4], ['faithful', 'major', 4],
    ['heist', 'minor', 4], ['pipes', 'minor', 4],
    ['suspicion', 'dark', 4], ['waltz', 'minor', 4],
  ]) MOTIFS[name].vars = variants(MOTIFS[name], SCALES[scale], beat);

  /* ---------------- energy ----------------
     How much is going on in a section, from 0 to 4. This is the whole
     difference between a score and a loop with the volume up: a film
     is quiet most of the time, and the loud parts are loud because of
     it.

       0  still    a held breath: a heart, a drone, one instrument.
                   Played exactly as written.
       1  tense    moving, but nothing on top of it: under an argument,
                   in the turret, at breakfast. A little quicker.
       2  moving   a light kit under it: one drum, a bass.
       3  driving  the full kit, at a run: the day, the ballot, a
                   walkout, the titles.
       4  tutti    everything the band owns. Kept for the moments the
                   night turns on.

     The last pass at this made every section a 3. That is why the
     night sounded like the day. */
  const ENERGY = {
    finale: { arrival: 0, warn: 0, floor: 1, ballot: 3, names: 0, pouch: 0, held: 0,
              afterTraitor: 3, afterFaithful: 0, lastPouches: 1, finalBurn: 4,
              verdictWin: 3, verdictLoss: 0, verdictTraitor: 2,
              verdictWin2: 3, verdictLoss2: 0, verdictTraitor2: 2,
              creditsWin: 2, creditsLoss: 0, creditsTraitor: 1 },
    ceremony: { title: 3, wiseCall: 2, wiseClock: 1, wiseRise: 0, wiseReveal: 3 },
    title: { gate: 3, anthem: 3, gate2: 3, gate3: 3, anthem2: 3, anthem3: 3 },
    explore: { roam: 1, turret: 0, round: 1 },
    roundtable: { gather: 1, debate: 1, debateClock: 1, slate: 0, reveal: 0, lastWords: 0, drumroll: 0, walkout: 3,
                  overruleRise: 0, overrule: 4 },
    murder: { nightfall: 0, nightGlass: 0, nightBells: 0, conclave: 1, deed: 0, dawn: 0, breakfast: 1, absence: 0 },
    tasks: { work: 3, workHunt: 3, workReel: 3, workHeist: 3, workPipes: 3,
             bell: 3, bellHunt: 3, bellReel: 3, bellHeist: 3, bellPipes: 3 },
  };

  /* What each room's kit is made of. The castle at work has a snare in
     it; the fire and the table are skins and horns; the night has a
     drum a long way off and nothing else. */
  const ALL = { riff: 1, taiko: 1, snare: 1, tom: 1, crash: 1, bass: 1, brass: 1 };
  const PALETTE = {
    tasks: ALL, title: ALL, ceremony: ALL,
    finale: { riff: 1, taiko: 1, tom: 1, crash: 1, bass: 1, brass: 1, timp: 1 },
    roundtable: { riff: 1, taiko: 1, tom: 1, crash: 1, bass: 1, brass: 1, timp: 1 },
    murder: { taiko: 1, bass: 1 },
  };

  const faster = (bpm) => Math.min(172, Math.round(bpm < 70 ? bpm * 1.7 : bpm < 100 ? bpm * 1.45 : bpm * 1.18));
  const tempoFor = (bpm, e) => e >= 3 ? faster(bpm)
    : e === 2 ? Math.round(bpm * 1.25)
    : e === 1 ? Math.round(bpm * (bpm < 70 ? 1.2 : 1.1))
    : bpm;

  /* Dress a section for its energy: set its tempo, and give a section
     that is meant to drive the engine it has not got — celli off the
     string, the big drums, a fill into every eighth bar, a crash on
     the downbeat, brass as the phrase builds. Each piece comes and
     goes on its own 8/16/32-bar cycle and most have more than one
     pattern to choose from (see `pats` and `fills` in music.js), so
     the same four bars do not come round twice in the same clothes. */
  function dress(sec, name, cueName) {
    if (sec._dressed) return;
    sec._dressed = true;
    const e = (ENERGY[cueName] || {})[name] || 0;
    sec.energy = e;
    sec.bpm = tempoFor(sec.bpm, e);
    if (e < 2) return;
    const P = PALETTE[cueName] || ALL;
    const full = e >= 3;
    const tri = sec.steps === 12;
    const has = (inst) => sec.layers.some(l => l.inst === inst);
    const spic = sec.layers.some(l => l.art === 'spic');
    const add = [];
    if (full && P.riff && !spic) {
      const pats = tri ? [vel('X.7X.7X.7X.8'), vel('X.7.X7X.7.X8')] : [RAID16_V, HUNT16_V, OST16_V];
      const picks = tri ? [pick('0.0a.00.0a.1'), pick('0.0.a00.0.a1')] : [RAID16_P, HUNT16_P, OST16_P];
      add.push(L('ep-riff', 'strings', { pat: pats[0], pick: picks[0], pats, picks,
        oct: 1, art: 'spic', fam: 'cello', gain: 0.4, when: b => b % 16 >= 2 }));
      add.push(L('ep-riff2', 'strings', { pat: pats[0], pick: picks[0], pats, picks,
        oct: 2, art: 'spic', fam: 'hiStr', gain: 0.2, when: b => b % 32 >= 16 }));
    }
    if (P.taiko && !has('taiko')) {
      const pats = tri ? [vel('X.....6..X..'), vel('X..6..X.....'), vel('X.....6.7.8.')]
                       : [vel('X.....6.X.6...7.'), vel('X...6...X.....7.'), vel('X.6...6.X...7.6.')];
      add.push(L('ep-taiko', 'taiko', { pat: pats[0], pats, gain: full ? 0.38 : 0.28,
        when: b => b % 8 !== 7 || b % 16 >= 8 }));
    }
    if (full && P.snare && !has('snare')) {
      const pats = tri ? [vel('...7.....7.5'), vel('...7..5..7..')] : [vel('....7.......7..5'), vel('....7..5....7...')];
      add.push(L('ep-snare', 'snare', { pat: pats[0], pats, gain: 0.17, when: b => b % 16 >= 8 }));
    }
    if (P.tom && !has('tom')) {
      // silent but for the fill into every eighth bar, and that is never the same one twice
      const rest = vel(tri ? '............' : '................');
      const fills = tri ? [vel('.......6.789'), vel('......6.7.89'), vel('...5..6..789')]
                        : [vel('............6.78'), vel('........5.6.7.89'), vel('..........6789X.')];
      add.push(L('ep-tom', 'tom', { pat: rest, fills, fillEvery: 8, gain: 0.3 }));
    }
    if (full && P.crash && !has('crash')) add.push(L('ep-crash', 'crash', { pat: BAR1, gain: 0.22, when: b => b % 8 === 0 && b > 0 }));
    if (P.bass && !has('synthBass')) add.push(L('ep-bass', 'synthBass', { pat: tri ? vel('X.6X.6X.6X.6') : PULSE8, pick: 'root', oct: 1, len: 2, gain: full ? 0.26 : 0.2 }));
    if (full && P.brass && !has('brass')) add.push(L('ep-brass', 'brass', { pat: tri ? vel('X.....7.....') : vel('X.......7.....8.'), pick: 'chord', oct: 2, len: 3, gain: 0.2,
      when: b => b % 16 >= 12 }));
    if (full && P.timp && !has('timpani')) add.push(L('ep-timp', 'timpani', { pat: tri ? vel('X.....7.....') : vel('X.......7.......'), pick: 'root', oct: 1, gain: 0.35,
      when: b => b % 16 >= 8 }));
    sec.layers = sec.layers.concat(add);
  }
  for (const [cueName, cue] of Object.entries(CUES)) {
    for (const [n, sec] of Object.entries(cue.sections || {})) dress(sec, n, cueName);
  }

  /* ---------------- the castle follows the game ----------------
     What the day's music does with `music/mood.js`. Every arrangement
     of the day gets the same treatment, in its own metre:

       the clock    the drums, the bass, the choir and the brass come in
                    in that order as the tension climbs (`tens`), so the
                    first minute is the tune and not much else
       sealed       shut in a room with one other person: the drums
                    drop out (`unless`), and a held low string, a
                    shiver up top and a heart take their place
       followed     a ticking pulse and a low drum under everything
       private      the poison in your own pocket: a low pulse and a
                    flat second on a music box; quicker when somebody
                    is in reach; a clock when the bell has gone and it
                    is still in your pocket; strings shivering on the
                    flat second while you hold F. Soft and low on
                    purpose, and off whenever your microphone is open. */
  const KIT = new Set(['taiko', 'taikoEns', 'tom', 'snare', 'crash', 'hat', 'timpani']);
  const BANDS = { synthBass: [0.28, 1], taiko: [0.22, 1], choir: [0.45, 1], brass: [0.5, 1], horn: [0.5, 1],
                  lowBrass: [0.5, 1], snare: [0.6, 1], crash: [0.6, 1] };
  function mood(sec) {
    const tri = sec.steps === 12;
    const bar = (str) => vel(tri ? str.slice(0, 12) : str);
    for (const l of sec.layers) {
      if (KIT.has(l.inst) && !l.unless) l.unless = 'sealed';
      if (!l.tens && !l.parts && BANDS[l.inst] && l.id !== 'ep-riff') l.tens = BANDS[l.inst];
      if (l.id === 'ep-brass') l.tens = [0.65, 1];
    }
    const once = vel(tri ? 'X...........' : 'X...............');
    const half = vel(tri ? 'X.....X.....' : 'X.......X.......');
    const beats = vel(tri ? 'X..X..X..X..' : 'X...X...X...X...');
    const eights = vel(tri ? 'X.6.6.X.6.6.' : 'X.6.6.6.X.6.6.6.');
    sec.layers = sec.layers.concat([
      L('md-pedal', 'strings', { pat: once, abs: 0, oct: 1, len: (sec.steps || 16) * 2, art: 'sustain', gain: 0.55,
        voices: 2, flag: 'sealed', when: b => b % 2 === 0 }),
      L('md-trem', 'strings', { pat: once, pick: 'top', oct: 4, len: sec.steps || 16, art: 'tremolo', gain: 0.26, flag: 'sealed' }),
      L('md-heart', 'heartbeat', { pat: half, gain: 0.5, flag: 'sealed' }),
      L('md-tail', 'ostSynth', { pat: eights, pick: 'root', oct: 2, gain: 0.26, flag: 'followed' }),
      L('md-tomF', 'tom', { pat: half, gain: 0.3, f: 80, flag: 'followed' }),
      // private: the poison in your own pocket
      L('md-sub', 'synthBass', { pat: beats, pick: 'root', oct: 1, len: 2, gain: 0.36, flag: 'poison', private: true }),
      L('md-subN', 'synthBass', { pat: bar('X.X.X.X.X.X.X.X.'), pick: 'root', oct: 1, len: 1, gain: 0.28,
        flag: 'poisonNear', private: true }),
      L('md-box', 'celesta', { pat: bar('......X.........'), abs: 1, oct: 4, gain: 0.32, flag: 'poison', private: true,
        when: b => b % 2 === 1 }),
      L('md-box2', 'celesta', { pat: bar('..........X.....'), abs: 6, oct: 4, gain: 0.3, flag: 'poisonNear', private: true }),
      L('md-late', 'tick', { pat: bar('X.6.X.6.X.6.X.6.'), gain: 0.32, flag: 'poisonLate', private: true }),
      L('md-hold', 'strings', { pat: once, abs: 1, oct: 3, len: sec.steps || 16, art: 'tremolo', gain: 0.36,
        voices: 2, flag: 'poisonHold', private: true }),
    ]);
  }
  for (const sec of Object.values(TASKS.sections)) mood(sec);

  return { PROGRESSIONS, MOTIFS, CUES, STINGERS, ENERGY, SCALES, vel, pick, faster, variants };
})();

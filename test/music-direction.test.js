/* ------------------------------------------------------------------
   music-direction.test.js — the parts of film scoring that are sums.

   Whether a build is exciting is a matter for ears. Whether it only
   ever gets denser and louder, whether the silence before the hit is
   really silent, whether the hit lands when it said it would, whether
   a loop comes round the same way twice and whether the quiet scenes
   are in fact quieter than the loud ones — those can be counted, and
   this counts them.
------------------------------------------------------------------ */
const H = require('./harness');
const { test, eq, ok } = H;
const { load, run, near } = require('./music-rig');

const noiseSince = (ac, from) => ac.log.starts.slice(from).filter(x => x.kind === 'noise').length;

/* ---------------- the build ---------------- */

test('a build only ever gets denser and louder, and holds at the top', () => {
  const { Music, ac } = load();
  for (const shape of Object.keys(load().G.MusicBuild.SHAPES)) {
    const s = Music.play('finale', { section: 'held', seed: 5 });
    run([s], ac, 1);
    const trace = [];
    const b = s.build({ shape, trace });
    ok(b.live, shape + ' did not start');
    run([s], ac, b.tTop - ac.currentTime + 3);
    ok(trace.length > 12, shape + ': only ' + trace.length + ' pulses');
    for (let i = 1; i < trace.length; i++) {
      ok(trace[i].t > trace[i - 1].t, shape + ': pulses out of order');
      ok(trace[i].v >= trace[i - 1].v - 1e-9, shape + ': got quieter at pulse ' + i);
      ok(trace[i].div >= trace[i - 1].div, shape + ': thinned out at pulse ' + i);
    }
    eq(trace[0].div, 1, shape + ' starts on the beat');
    eq(trace[trace.length - 1].div, 8, shape + ' ends in a roll');
    ok(b.holding && b.live, shape + ' is not holding at the top');
    b.cancel(0.1);
    s.stop(0.1);
  }
});

test('a timed build reaches its top when it was told to', () => {
  const { Music, ac } = load();
  const s = Music.play('finale', { section: 'held', seed: 5 });
  run([s], ac, 1);
  const trace = [];
  const b = s.build({ shape: 'pouch', secs: 3.1, trace });
  ok(near(b.tTop - b.t0, 3.1, 1e-6), 'length ' + (b.tTop - b.t0));
  run([s], ac, 3.3);
  const roll = trace.find(x => x.div === 8);
  ok(roll && roll.t < b.tTop, 'the roll starts before the top');
  ok(trace.some(x => x.t >= b.tTop - 0.2 && x.p > 0.93), 'and is at full height on it');
});

test('release is a breath of nothing, then the hit and the new section together', () => {
  const { Music, ac } = load({ talkers: () => [] });
  const s = Music.play('roundtable', { section: 'slate', seed: 9 });
  run([s], ac, 2);
  const b = s.build({ shape: 'banish' });
  run([s], ac, 6);
  const oldPre = s.pre, oldSend = s.send;
  const from = ac.log.starts.length;
  const at = ac.currentTime;
  const wait = b.release('reveal-traitor', { then: 'banishTraitor' });
  const T = at + wait;
  ok(wait > 0.3 && wait < 0.6, 'the breath is ' + wait);
  ok(!b.live && s._build === null, 'the build is over');
  eq(oldPre.gain.value, 0, 'everything that was sounding is cut');
  eq(oldSend.gain.value, 0, 'and its reverb send with it');
  ok(s.pre !== oldPre, 'the band has a new bus');
  eq(s.sectionName, 'banishTraitor', 'the next section is already in place');
  ok(near(s.t0, T), 'and bar one is on the hit');

  // Claudia starting a line in the breath must not open the band early
  s.duck(0.45, 0.6);
  s.silence(false);
  ok(ac.currentTime < s._holdUntil, 'still holding');

  run([s], ac, 1.5);
  const after = ac.log.starts.slice(from);
  ok(after.length > 20, 'the hit and the band: ' + after.length);
  for (const x of after) ok(x.t >= T - 1e-6, 'something was booked in the breath, at ' + (x.t - at).toFixed(3));
  ok(after.some(x => near(x.t, T, 1e-6)), 'the stinger is on the instant');
});

test('a build that is called off leaves the band playing and nothing of itself', () => {
  const { Music, ac } = load();
  // the held beat is a heart and a low string: no noise in it at all
  const s = Music.play('finale', { section: 'held', seed: 5 });
  run([s], ac, 1);
  const quiet = ac.log.starts.length;
  run([s], ac, 4);
  eq(noiseSince(ac, quiet), 0, 'the bed has no drums of its own');
  const b = s.build({ shape: 'banish' });
  const during = ac.log.starts.length;
  run([s], ac, 4);
  ok(noiseSince(ac, during) > 10, 'the build has drums');
  b.cancel(0.1);
  run([s], ac, 0.5);
  const after = ac.log.starts.length;
  run([s], ac, 5);
  eq(noiseSince(ac, after), 0, 'the build is still booking');
  ok(ac.log.starts.length > after, 'the band stopped with it');
  eq(s.sectionName, 'held');
  // releasing a dead build is just the hit
  eq(b.release('reveal-faithful', { then: 'afterFaithful' }), 0, 'no breath to hold');
  run([s], ac, 1);
  eq(s.sectionName, 'afterFaithful');
});

test('a build nobody answers stays inside the budget and lets itself go', () => {
  const { Music, ac, G } = load();
  const s = Music.play('finale', { section: 'held', seed: 5 });
  run([s], ac, 1);
  const b = s.build({ shape: 'banish' });
  let peak = 0;
  run([s], ac, 12, () => { peak = Math.max(peak, s.voices); });
  ok(b.live, 'it gave up early');
  ok(peak > 30 && peak <= 140, 'voices peaked at ' + peak);
  run([s], ac, G.MusicBuild.HOLD_MAX);
  ok(!b.live, 'it never let go');
  // the silent score hands back a build that does nothing, safely
  const d = Music.SILENT.build({ shape: 'banish' });
  eq(d.release('reveal-traitor'), 0);
  d.cancel();
});

test('a hit needs no build: strike cuts, waits and lands', () => {
  const { Music, ac } = load();
  const s = Music.play('finale', { section: 'ballot', seed: 5 });
  run([s], ac, 3);
  const at = ac.currentTime, from = ac.log.starts.length;
  const wait = s.strike('reveal-traitor', { then: 'afterTraitor', breath: 0.5 });
  ok(near(wait, 0.52), 'breath ' + wait);
  run([s], ac, 2);
  for (const x of ac.log.starts.slice(from)) ok(x.t >= at + wait - 1e-6, 'booked in the breath');
  eq(s.sectionName, 'afterTraitor');
  eq(s.bpm, Music.CUES.finale.sections.afterTraitor.bpm, 'at its own tempo from the first bar');
});

/* ---------------- tension ---------------- */

test('tension brings a layer in over a bar and takes it out over one', () => {
  const { Music, ac, G } = load();
  const { vel } = G.MusicCues;
  Music.CUES.probe = { level: 0.8, sections: { a: { bpm: 120, prog: 'hold', layers: [
    { id: 'bed', inst: 'synthBass', gain: 1, pat: vel('X...............'), pick: 'root', oct: 1 },
    { id: 'hot', inst: 'snare', gain: 1, exact: true, pat: vel('XXXXXXXXXXXXXXXX'), tens: [0.6, 1] },
  ] } } };
  // listen to how hard the layer is asked to play, which the recording cannot say
  const heard = [];
  G.MusicInst.snare = (S, t, f, dur, v) => { heard.push(v); };
  const s = Music.play('probe', { seed: 1 });
  const bar = 2;                                         // 120 bpm
  s.setTension(0.2, 0);
  run([s], ac, bar * 3);
  eq(heard.length, 0, 'the hot layer played with the tension down');

  s.setTension(0.9, 0);
  run([s], ac, bar * 2.5);
  ok(heard.length > 30, 'it never came in: ' + heard.length);
  ok(heard[0] < 0.2, 'it was switched on, not faded in: first note at ' + heard[0]);
  for (let i = 1; i < heard.length; i++) ok(heard[i] >= heard[i - 1] - 1e-9, 'the fade went backwards');
  ok(near(heard[20], 1), 'a bar later it is all there: ' + heard[20]);
  ok(heard[8] > 0.3 && heard[8] < 0.8, 'and half a bar in it is half there: ' + heard[8]);

  heard.length = 0;
  s.setTension(0.1, 0);
  run([s], ac, bar * 2.5);
  ok(heard.length > 4 && heard.length < 24, 'it was switched off, not faded out: ' + heard.length);
  for (let i = 1; i < heard.length; i++) ok(heard[i] <= heard[i - 1] + 1e-9, 'the fade out went backwards');
  heard.length = 0;
  run([s], ac, bar * 2);
  eq(heard.length, 0, 'it never went away');

  // the knob moves over time, and the old intensity is the same knob
  s.setTension(1, 4);
  run([s], ac, 2);
  ok(s.tension > 0.45 && s.tension < 0.75, 'halfway there: ' + s.tension);
  run([s], ac, 2.2);
  eq(s.tension, 1);
  ok(near(s.intensity, 1.4), 'intensity follows: ' + s.intensity);
  s.setIntensity(1);
  ok(near(s.tension, 0.5), 'and leads: ' + s.tension);
  delete Music.CUES.probe;
});

/* ---------------- variety ---------------- */

// what was played in each eight-bar phrase: which pitch, on which step
function phrases(Music, ac, cue, section, seed, count) {
  const s = Music.play(cue, { section, seed });
  const sec = s.sec;
  const sps = 60 / sec.bpm / 4;
  const len = sps * (sec.steps || 16) * 8;
  const t0 = s.t0;
  const from = ac.log.starts.length;
  run([s], ac, len * count + 1);
  const out = Array.from({ length: count }, () => []);
  for (const x of ac.log.starts.slice(from)) {
    const k = Math.floor((x.t - t0 + 1e-6) / len);
    if (k < 0 || k >= count) continue;
    const f = x.kind === 'osc' ? x.n.frequency.value : 0;
    if (x.kind === 'osc' && f < 30) continue;            // vibrato and tremolo, which are random
    out[k].push(Math.round((x.t - t0 - k * len) / sps) + ':' + (x.kind === 'osc' ? f.toFixed(1) : 'n'));
  }
  s.stop(0.1);
  return out.map(p => p.sort().join(' '));
}

const LOOPS = [['tasks', 'work'], ['tasks', 'workHunt'], ['tasks', 'workReel'], ['tasks', 'bell'],
               ['title', 'gate'], ['title', 'anthem'], ['ceremony', 'title'],
               ['roundtable', 'debate'], ['finale', 'floor']];

test('a long loop never plays the same eight bars twice running', () => {
  const { Music, ac } = load();
  for (const [cue, section] of LOOPS) {
    const P = phrases(Music, ac, cue, section, 4242, 8);
    for (let i = 1; i < P.length; i++) {
      ok(P[i].length > 0, cue + '.' + section + ' phrase ' + i + ' is empty');
      ok(P[i] !== P[i - 1], cue + '.' + section + ': phrases ' + (i - 1) + ' and ' + i + ' are the same notes');
    }
    ok(new Set(P).size >= 5, cue + '.' + section + ': only ' + new Set(P).size + ' different phrases in 8');
  }
});

test('the same seed is the same performance, and another seed is another', () => {
  for (const [cue, section] of [['tasks', 'work'], ['roundtable', 'debate']]) {
    const a = load(), b = load(), c = load();
    const A = phrases(a.Music, a.ac, cue, section, 77, 4);
    const B = phrases(b.Music, b.ac, cue, section, 77, 4);
    const C = phrases(c.Music, c.ac, cue, section, 78, 4);
    eq(JSON.stringify(A), JSON.stringify(B), cue + '.' + section + ' with the same seed');
    ok(JSON.stringify(A) !== JSON.stringify(C), cue + '.' + section + ' with another seed is identical');
  }
});

test('a tune has variants, all of them in its key and none of them longer', () => {
  const { G } = load();
  const { MOTIFS, SCALES } = G.MusicCues;
  const pc = (x) => ((x % 12) + 12) % 12;
  for (const [name, scale] of [['theme', 'minor'], ['fate', 'minor'], ['overture', 'minor'], ['hymn', 'major'],
                               ['hunt', 'dark'], ['jig', 'minor'], ['reel', 'dark'],
                               ['traitors', 'dark'], ['faithful', 'major'], ['heist', 'minor'], ['pipes', 'minor']]) {
    const M = MOTIFS[name];
    ok(M.vars && M.vars.length >= 3, name + ' has ' + (M.vars ? M.vars.length : 0) + ' variants');
    ok(M.vars[0] === M, name + ': the first is the tune as written');
    const seen = new Set();
    // a tune may have a chromatic note written into it; a variant may not add one
    const written = new Set(Object.values(M.at).map(n => pc(n.s)));
    for (const V of M.vars) {
      eq(V.len, M.len, name + ' variant length');
      seen.add(JSON.stringify(V.at));
      for (const [at, n] of Object.entries(V.at)) {
        ok(SCALES[scale].includes(pc(n.s)) || written.has(pc(n.s)), name + ': ' + n.s + ' at ' + at + ' is out of key');
        ok(+at + n.d <= M.len, name + ': a note runs off the end');
        ok(n.d >= 1 && n.v > 0, name + ': a note with no length or no weight');
      }
    }
    eq(seen.size, M.vars.length, name + ': two variants are the same');
  }
});

test('a stinger with several voicings never plays the same one twice running', () => {
  const { Music, ac } = load();
  const s = Music.play('roundtable', { seed: 31 });
  run([s], ac, 1);
  // each voicing books a different number of sources
  const sizes = [];
  for (let i = 0; i < 24; i++) {
    const from = ac.log.starts.length;
    s.stinger('banish');
    sizes.push(ac.log.starts.length - from);
  }
  for (let i = 1; i < sizes.length; i++) ok(sizes[i] !== sizes[i - 1], 'banish ' + i + ' repeated the one before');
  eq(new Set(sizes).size, 3, 'all three voicings come up');
  // and one can still be asked for by number
  const pick = (v) => { const f = ac.log.starts.length; s.stinger('banish', { v }); return ac.log.starts.length - f; };
  eq(pick(1), pick(1), 'asked for by number');
});

/* ---------------- contrast ---------------- */

test('quiet scenes are quiet, and that is what makes the loud ones loud', () => {
  const { Music, ac, G } = load();
  const density = {};
  for (const [cue, C] of Object.entries(Music.CUES)) {
    for (const [name, sec] of Object.entries(C.sections)) {
      ok(sec.energy >= 0 && sec.energy <= 4, cue + '.' + name + ' has no energy');
      const s = Music.play(cue, { section: name, seed: 7 });
      const from = ac.log.starts.length;
      run([s], ac, 24);
      (density[sec.energy] = density[sec.energy] || []).push((ac.log.starts.length - from) / 24);
      s.stop(0.1);
      // nothing still or tense has had a drum kit bolted onto it
      if (sec.energy < 2) ok(!sec.layers.some(l => /^ep-/.test(l.id)), cue + '.' + name + ' has a drive kit');
      if (sec.energy === 0) ok(sec.bpm <= 90, cue + '.' + name + ' is still, at ' + sec.bpm);
    }
  }
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  ok(density[0] && density[1] && density[3], 'every level is used');
  ok(avg(density[0]) * 3 < avg(density[3]), 'still ' + avg(density[0]).toFixed(1) + ' vs driving ' + avg(density[3]).toFixed(1));
  ok(avg(density[1]) * 2 < avg(density[3]), 'tense ' + avg(density[1]).toFixed(1) + ' vs driving ' + avg(density[3]).toFixed(1));
  // the night, the slate and the breath before an answer, by name
  const E = G.MusicCues.ENERGY;
  for (const [cue, name] of [['murder', 'nightfall'], ['murder', 'deed'], ['roundtable', 'slate'],
                             ['roundtable', 'reveal'], ['finale', 'held'], ['finale', 'pouch']]) {
    eq(E[cue][name], 0, cue + '.' + name);
  }
  for (const name of Object.keys(Music.CUES.tasks.sections)) eq(E.tasks[name], 3, 'the day still drives: ' + name);
});

/* ---------------- getting there, and ending ---------------- */

test('a fill is played into the bar it announces, and the change still lands on the bar line', () => {
  const { Music, ac } = load();
  const s = Music.tasks({ variant: 0, seed: 3 });
  const sec = s.sec;
  const bar = 60 / sec.bpm / 4 * sec.steps;
  run([s], ac, bar * 1.3);
  let landed = null;
  const orig = s._enter.bind(s);
  s._enter = (sw, t) => { landed = t; orig(sw, t); };
  const from = ac.log.starts.length;
  s.section('bell', { at: 'bar', glide: 1 });            // the cue says how: `trans`
  eq(Music.CUES.tasks.trans['*>bell'], 'fill');
  const booked = ac.log.starts.slice(from);
  ok(booked.length >= 6, 'the fill was not booked: ' + booked.length);
  run([s], ac, bar * 1.5);
  ok(landed != null, 'never changed');
  const k = (landed - s.t0) / bar;
  ok(near(k, Math.round(k), 1e-6), 'landed ' + k + ' bars in');
  for (const x of booked) ok(x.t <= landed + 1e-6, 'part of the fill is after the downbeat');
  ok(booked.some(x => near(x.t, landed, 1e-6)), 'nothing on the downbeat itself');
  ok(booked.some(x => x.t < landed - 0.05), 'nothing leading into it');
  eq(s.sectionName, 'bell');
});

test('a cut is a beat of nothing before the change, and cannot be ducked open', () => {
  const { Music, ac } = load({ talkers: () => [] });
  const s = Music.play('roundtable', { section: 'debate', seed: 3 });
  const bar = 60 / s.sec.bpm * 4;
  run([s], ac, bar * 0.4);
  s.section('slate', { at: 'bar', glide: 1.5 });
  ok(s._holdUntil > ac.currentTime, 'no hold was set');
  const T = s._holdUntil;
  ac.currentTime = T - 0.2;
  s.duck(0.4, 0.5);                                       // ignored: inside the cut
  ok(near(s.out.gain.value, s.level), 'the duck got through');
  run([s], ac, 1);
  eq(s.sectionName, 'slate');
});

test('a coda ends on the bar line and books nothing after it', () => {
  const { Music, ac } = load();
  for (const [cue, section, big] of [['roundtable', 'walkout', true], ['murder', 'breakfast', false]]) {
    const s = Music.play(cue, { section, seed: 3 });
    const bar = 60 / s.sec.bpm / 4 * (s.sec.steps || 16);
    run([s], ac, bar * 2.4);
    const at = ac.currentTime;
    const lead = s.coda();
    ok(lead > 0 && lead <= bar + 0.4, cue + ': the last chord is ' + lead + ' away');
    const T = at + lead;
    const k = (T - s.t0) / bar;
    ok(near(k, Math.round(k), 1e-6), cue + ': the coda is not on a bar line');
    eq(s.coda(), 0, cue + ': a second coda does nothing');
    const from = ac.log.starts.length;
    run([s], ac, bar * 3);
    const late = ac.log.starts.slice(from).filter(x => x.t > T + 0.5);
    eq(late.length, 0, cue + ': the band played on after its last chord');
    ok(Music.CUES[cue].sections[section].energy >= 3 === big, cue + ' energy');
    s.stop(0.1);
  }
});

test('the day carries its seed, and the orchestra is sized for a phone unless told otherwise', () => {
  const { Music } = load();
  const a = Music.dayMusic(1234, 1), b = Music.dayMusic(1234, 2);
  ok(Number.isInteger(a.seed) && a.seed !== b.seed, 'each day has its own seed');
  eq(Music.dayMusic(1234, 1).seed, a.seed, 'and it is the same for everybody in the run');
  eq(Music.tasks(a).seed, a.seed, 'the day plays with it');
  eq(Music.budget, 110, 'no navigator: the small orchestra');
  Music.setBudget(160);
  eq(Music.budget, 160);
});

/* ---------------- the orchestra ---------------- */

test('every instrument plays, in every way it can be bowed, blown or sung', () => {
  const { Music, ac, G } = load();
  const s = Music.play('finale', { section: 'held', seed: 2 });
  run([s], ac, 0.5);
  const I = G.MusicInst;
  const ways = {
    strings: [{}, { art: 'spic' }, { art: 'swell' }, { art: 'tremolo' }, { from: 180 }, { oct8: true }, { fam: 'cello', voices: 4 }],
    brass: [{}, { art: 'sfz' }, { art: 'swell' }, { slow: true }, { soft: true }],
    horn: [{}, { art: 'swell' }],
    choir: [{}, { vowel: 'oo' }, { vowel: 'eh' }, { morph: ['oo', 'ah'] }],
    glass: [{}, { bend: true }],
    tick: [{}, { tock: true }],
  };
  for (const name of Object.keys(I)) {
    for (const o of ways[name] || [{}]) {
      for (const f of [73.4, 293.7, 880]) {
        const from = ac.log.starts.length;
        // (a second ahead: the reverse cymbal is booked by where it ends)
        const h = I[name](s, ac.currentTime + 1, f, 1.2, 0.9, Object.assign({ pri: 0 }, o));
        ok(ac.log.starts.length > from, name + ' ' + JSON.stringify(o) + ' at ' + f + ' played nothing');
        if (h && h.stop) h.stop(0.05);
      }
    }
    run([s], ac, 0.2);
  }
  ok(Object.keys(I).length >= 38, 'the orchestra has ' + Object.keys(I).length + ' players');
});

test('everybody in the orchestra has a seat', () => {
  const { Music, ac, G } = load();
  const asked = new Set();
  const P = Music.Score.prototype, orig = P.fam;
  P.fam = function (name) { asked.add(name); return orig.call(this, name); };
  for (const [cue, C] of Object.entries(Music.CUES)) {
    for (const name of Object.keys(C.sections)) {
      const s = Music.play(cue, { section: name, seed: 2 });
      s.setTension(1, 0);
      run([s], ac, 10);
      s.stop(0.1);
    }
  }
  const s = Music.play('roundtable', { seed: 2 });
  for (const k of Object.keys(Music.STINGERS)) for (let v = 0; v < 3; v++) s.stinger(k, { v, n: v });
  for (const shape of Object.keys(G.MusicBuild.SHAPES)) { const b = s.build({ shape }); run([s], ac, 8); b.cancel(0.1); }
  for (const name of Object.keys(G.MusicInst)) G.MusicInst[name](s, ac.currentTime + 0.1, 293.7, 1, 0.9, { pri: 0 });
  P.fam = orig;
  ok(asked.size >= 14, 'only ' + [...asked].join(', '));
  // an unknown family is seated with the percussion, silently: dead centre, no EQ
  for (const name of asked) ok(G.MusicMix.FAMILIES[name], 'no family "' + name + '"');
  for (const name of ['vln2', 'horn', 'lowBrass', 'sub', 'wind', 'pipes', 'glass', 'metal']) {
    ok(asked.has(name), 'nobody plays in "' + name + '"');
  }
});

test('a long string chord is two desks wide, and a low or a short one is not', () => {
  const { Music, ac, G } = load();
  const s = Music.play('finale', { section: 'held', seed: 2 });
  const seats = (f, o) => {
    const asked = [];
    const orig = s.fam.bind(s);
    s.fam = (name) => { asked.push(name); return orig(name); };
    G.MusicInst.strings(s, ac.currentTime + 0.1, f, 1, 0.8, Object.assign({ pri: 0 }, o));
    delete s.fam;
    return asked.sort().join('+');
  };
  eq(seats(440, { art: 'sustain' }), 'hiStr+vln2', 'a violin chord');
  eq(seats(440, { art: 'tremolo' }), 'hiStr+vln2', 'a tremolo');
  eq(seats(110, { art: 'sustain' }), 'cello', 'the celli sit together');
  eq(seats(440, { art: 'spic' }), 'hiStr', 'a short note is one desk');
  eq(seats(440, { art: 'sustain', fam: 'hiStr' }), 'hiStr', 'and a line that names its seat keeps it');
});

test('a legato line slides onto its note from the one before, and only then', () => {
  const { Music, ac, G } = load();
  const froms = [];
  const real = G.MusicInst.strings;
  G.MusicInst.strings = (S, t, f, dur, v, o) => { if (o.id === 'cello') froms.push([f, o.from || 0]); return real(S, t, f, dur, v, o); };
  // the lament after a Faithful burns: the theme on a solo cello
  const s = Music.play('finale', { section: 'afterFaithful', seed: 2 });
  const bar = 60 / s.sec.bpm * 4;
  run([s], ac, bar * 4.2);
  G.MusicInst.strings = real;
  ok(froms.length >= 12, 'the cello played ' + froms.length + ' notes');
  eq(froms[0][1], 0, 'the first note has nowhere to come from');
  const slurred = froms.filter(x => x[1] > 0);
  ok(slurred.length >= froms.length * 0.6, 'only ' + slurred.length + ' of ' + froms.length + ' were slurred');
  for (let i = 1; i < froms.length; i++) {
    if (froms[i][1]) ok(near(froms[i][1], froms[i - 1][0], 1e-6), 'note ' + i + ' slides from somewhere it never was');
    ok(froms[i][1] !== froms[i][0], 'a slide from a note to itself');
  }
});

test('the men stand on the left and the women on the right', () => {
  const { Music, ac, G } = load();
  const s = Music.play('finale', { section: 'held', seed: 2 });
  G.MusicInst.choir(s, 0.2, 146.8, 1, 0.8, { pri: 0, vowel: 'ah' });
  G.MusicInst.choir(s, 0.2, 587.3, 1, 0.8, { pri: 0, vowel: 'ah' });
  eq(Object.keys(s._choirs).sort().join(' '), 'ahm ahw');
  // a chord sung at one instant is one syllable; the next instant is another
  const sung = [];
  const real = s.choirIn.bind(s);
  s.choirIn = (v, voice) => { sung.push(v); return real(v, voice); };
  for (const t of [1, 1, 1, 1.25, 1.25, 1.5]) G.MusicInst.chant(s, t, 293.7, 0.2, 0.9, { pri: 0 });
  eq(sung[0], sung[1]); eq(sung[1], sung[2]); eq(sung[3], sung[4]);
  ok(sung[2] !== sung[3] && sung[4] !== sung[5], 'the chant is stuck on one syllable: ' + sung.join(' '));
});

test('the pads step back under a big drum, and not under a small one', () => {
  const { Music, ac, G } = load();
  const s = Music.play('finale', { section: 'held', seed: 2 });
  G.MusicInst.choir(s, 0.2, 293.7, 2, 0.8, { pri: 0 });           // somebody to duck
  G.MusicInst.strings(s, 0.2, 440, 2, 0.8, { pri: 0 });
  const pads = Object.keys(s._fams).filter(k => s._fams[k].padDuck);
  ok(pads.includes('choir') && pads.includes('hiStr') && pads.includes('vln2'), 'pads: ' + pads.join(' '));
  let ducks = 0;
  for (const k of pads) {
    const g = s._fams[k].padDuck.gain, orig = g.linearRampToValueAtTime;
    g.linearRampToValueAtTime = (v, t) => { if (v < 1) ducks++; orig(v, t); };
  }
  G.MusicInst.taiko(s, 0.5, 0, 0, 1, { pri: 0 });
  G.MusicInst.taikoEns(s, 0.5, 0, 0, 0.5, { pri: 0 });
  eq(ducks, 0, 'a single drum, or a quiet one, pumped the pads');
  G.MusicInst.taikoEns(s, 0.6, 0, 0, 1, { pri: 0 });
  eq(ducks, pads.length, 'the big drum did not');
  ducks = 0;
  G.MusicInst.subDrop(s, 0.7, 0, 0, 1, {});
  eq(ducks, pads.length, 'nor the floor dropping');
  ok(!s._fams.cello || !s._fams.cello.padDuck, 'the basses are not a pad');
});

test('the biggest forces are kept for the biggest moments', () => {
  const { Music, ac, G } = load();
  const BIG = ['chant', 'anvil', 'subDrop'];
  // as layers: only where the energy is all the way up
  for (const [cue, C] of Object.entries(Music.CUES)) {
    for (const [name, sec] of Object.entries(C.sections)) {
      for (const l of sec.layers) {
        if (BIG.includes(l.inst)) ok(sec.energy >= 4, cue + '.' + name + ' (energy ' + sec.energy + ') has ' + l.inst);
      }
    }
  }
  // as hits: a Traitor found, and the overrule
  const s = Music.play('roundtable', { seed: 2 });
  const used = {};
  let now = null;
  for (const k of BIG) {
    const real = G.MusicInst[k];
    G.MusicInst[k] = (...a) => { (used[now] = used[now] || new Set()).add(k); return real(...a); };
  }
  for (const k of Object.keys(Music.STINGERS)) { now = k; for (let v = 0; v < 3; v++) s.stinger(k, { v }); }
  eq(Object.keys(used).sort().join(' '), 'last-pouch overrule reveal reveal-traitor');
  // and a build never uses them: it is the hit that is big
  now = 'build';
  for (const shape of Object.keys(G.MusicBuild.SHAPES)) { const b = s.build({ shape }); run([s], ac, 9); b.cancel(0.1); }
  ok(!used.build, 'a build used ' + [...(used.build || [])].join(' '));
});

test('a machine with room gets the scrape of the bow; a phone does not pay for it', () => {
  const { Music, ac, G } = load();
  const s = Music.play('finale', { section: 'held', seed: 2 });
  const scrape = () => {
    const from = ac.log.starts.length;
    G.MusicInst.strings(s, ac.currentTime + 0.1, 220, 0.1, 0.9, { art: 'spic', pri: 0 });
    return noiseSince(ac, from);
  };
  ok(!s.rich, 'the small orchestra is not rich');
  eq(scrape(), 0, 'bow noise on a phone');
  Music.setBudget(160);
  ok(s.rich, 'the big one is');
  eq(scrape(), 1, 'no bow noise with room for it');
});

/* ---------------- the scenes ask for what exists ---------------- */

const fs = require('fs');
const path = require('path');
function sceneSources() {
  const files = fs.readdirSync(path.join(H.ROOT, 'js/scenes')).map(f => 'js/scenes/' + f)
    .concat(['js/core/scenes.js', 'js/main.js']);
  return files.filter(f => f.endsWith('.js')).map(f => fs.readFileSync(path.join(H.ROOT, f), 'utf8')).join('\n');
}

test('every section, bed and build a scene asks for exists', () => {
  const { Music, G } = load();
  const src = sceneSources();
  const all = new Set();
  for (const C of Object.values(Music.CUES)) for (const n of Object.keys(C.sections)) all.add(n);
  const asked = new Set();
  // the calls that take a section, and the names that are sections wherever they are written
  for (const re of [/\.section\(\s*'(\w+)'/g, /_cue\(\s*'(\w+)'/g, /\bthen:\s*'(\w+)'/g, /\bbed:\s*'(\w+)'/g,
                    /'((?:after|banish)(?:Traitor|Faithful)|finalBurn|lastPouches|lastWords|drumroll|overruleRise|wiseRise|verdict(?:Win|Loss|Traitor)\d?|credits(?:Win|Loss|Traitor))'/g]) {
    for (const m of src.matchAll(re)) asked.add(m[1]);
  }
  const plain = [...asked];
  ok(plain.length >= 20, 'found only ' + plain.length + ' section names in the scenes');
  for (const n of plain) ok(all.has(n), 'no cue has a section "' + n + '"');
  // build shapes, named in the scenes
  const shapes = new Set();
  for (const m of src.matchAll(/Drama\.build\([^)]*?,\s*'(\w+)'/g)) shapes.add(m[1]);
  for (const m of src.matchAll(/shape:\s*'(\w+)'/g)) shapes.add(m[1]);
  ok(shapes.size >= 5, 'found only ' + [...shapes].join(' '));
  for (const k of shapes) ok(G.MusicBuild.SHAPES[k], 'no build shape "' + k + '"');
});

/* ---------------- a banishment, as the round table stages it ---------------- */

test('a banishment: the march, the last words, the build, the breath, the colour, the walk out, the door', () => {
  const { Music, ac } = load({ talkers: () => [] });
  const m = Music.roundtable({ variant: 2, seed: 99 });
  const seen = [];
  const orig = m._enter.bind(m);
  m._enter = (sw, t) => { seen.push(sw.name); orig(sw, t); };
  const step = (sec) => run([m], ac, sec);

  m.section('debate', { at: 'bar', glide: 3 }); step(8);
  m.section('slate', { at: 'bar', glide: 1.5 }); step(4);         // the argument stops dead first
  for (let n = 0; n < 4; n++) { m.setTension(0.3 + 0.65 * (n + 1) / 4, 1.2); m.stinger('slate-turn', { n }); step(1.5); }
  m.stinger('banish', { at: 'beat' }); m.section('reveal', { at: 'bar', glide: 2 }); step(5);
  m.section('lastWords', { at: 'bar', glide: 1 }); step(6);
  // "I am…"
  const b = m.build({ shape: 'banish', bed: 'drumroll', ramp: 3.6 });
  step(3.7);
  ok(b.holding, 'the build is at the top when the answer comes');
  const at = ac.currentTime, from = ac.log.starts.length;
  const wait = b.release('reveal-faithful', { then: 'banishFaithful' });
  step(wait + 0.2);
  for (const x of ac.log.starts.slice(from)) ok(x.t >= at + wait - 1e-6, 'something sounded in the breath');
  step(4);
  m.stinger('walkout', { at: 'beat' }); m.section('walkout', { at: 'bar', glide: 0.5 }); step(8);
  const lead = m.coda();
  ok(lead > 0, 'no coda');
  for (const name of ['debate', 'slate', 'reveal', 'lastWords', 'drumroll', 'banishFaithful', 'walkout']) {
    ok(seen.includes(name), 'never reached ' + name + ' (saw ' + seen.join(' → ') + ')');
  }
  ok(seen.indexOf('drumroll') < seen.indexOf('banishFaithful'), 'the bed is under the build, before the answer');
});

/* ---------------- the fire ---------------- */

test('the last pouch is the biggest hit in the game', () => {
  const { Music, ac } = load();
  const s = Music.finale({ seed: 5 });
  run([s], ac, 1);
  const size = (fn) => { const from = ac.log.starts.length; fn(); return ac.log.starts.length - from; };
  const last = size(() => { s.stinger('reveal-traitor'); s.stinger('last-pouch'); });
  let biggest = 0, which = '';
  for (const k of Object.keys(Music.STINGERS)) {
    if (k === 'last-pouch') continue;
    for (let v = 0; v < 3; v++) { const n = size(() => s.stinger(k, { v })); if (n > biggest) { biggest = n; which = k; } }
  }
  ok(last > biggest, 'the last pouch (' + last + ') is no bigger than ' + which + ' (' + biggest + ')');
});

test('the pouch: a build timed to the throw, silence in the air, and the answer on bar one', () => {
  const { Music, ac, G } = load({ talkers: () => [] });
  const m = Music.finale({ seed: 5 });
  run([m], ac, 2);
  m.section('pouch', { at: 'bar', glide: 2 }); run([m], ac, 4);
  m.section('held', { at: 'now', glide: 0.3 });
  const secs = 2.4 + 0.6;
  const trace = [];
  const b = m.build({ shape: 'pouch', secs, gain: 1.15, trace });
  run([m], ac, secs);
  ok(trace[trace.length - 1].div === 8, 'the throw lands on a roll');
  b.cancel(0.04); m.silence(true);                        // the pouch leaves her hand
  run([m], ac, 0.5);
  const from = ac.log.starts.length;
  run([m], ac, 0.35);
  eq(ac.log.starts.length, from, 'something played while the pouch was in the air');
  // the answer: Reveal.flare's way in, with the last pouch's extra hit
  const at = ac.currentTime;
  m.strike('reveal-traitor', { then: 'finalBurn', breath: 0 }); m.stinger('last-pouch');
  ok(!m.silent, 'the answer did not lift the silence');
  eq(m.sectionName, 'finalBurn');
  ok(near(m.t0, at + 0.02, 1e-3), 'bar one is on the hit');
  let peak = 0;
  run([m], ac, 8, () => { peak = Math.max(peak, m.voices); });
  // the biggest moment in the game is allowed past the phone budget by its hits, not by the band
  ok(peak > 60 && peak <= 165, 'the villain\'s anthem peaked at ' + peak);
});

test('each round at the fire starts hotter, and the verdict comes home', () => {
  const { Music, ac } = load({ talkers: () => [] });
  const m = Music.finale({ seed: 5 });
  // what fireplace.js does at the start of each round's floor
  for (let round = 0; round < 3; round++) {
    m.setKey(Math.min(3, round));
    m.section('floor', { at: 'bar', glide: 3 });
    m.setIntensity(0.7 + 0.08 * round);
    run([m], ac, 6);
    eq(m.key, round, 'round ' + round + ' key');
  }
  ok(m.tension > 0.2, 'the third round is no hotter: ' + m.tension);
  const V = Music.verdictCue({ won: true, role: 'faithful' });
  m.setKey(0); m.stinger(V.sting); m.section(V.section, { at: 'bar', glide: 2 });
  run([m], ac, 8);
  eq(m.key, 0, 'back in D');
});

test('every verdict has a second arrangement, and the night picks which', () => {
  const { Music } = load();
  const F = Music.CUES.finale.sections;
  for (const name of ['verdictWin', 'verdictLoss', 'verdictTraitor']) {
    ok(F[name].alt && F[name].alt.length >= 1, name + ' has no second arrangement');
    for (const a of F[name].alt) ok(F[a], name + ' → missing ' + a);
  }
  const heard = new Set();
  for (let day = 0; day < 4; day++) {
    const s = Music.finale(Music.dayMusic(4321, day));
    s.section('verdictWin', { at: 'now' });
    heard.add(s._switch.name);
    s.stop(0.1);
  }
  eq(heard.size, 2, 'four nights, ' + heard.size + ' arrangements: ' + [...heard].join(' '));
  for (const c of ['creditsWin', 'creditsLoss', 'creditsTraitor']) {
    const parts = new Set(F[c].layers.map(l => l.parts).filter(Boolean));
    ok(F[c].form && parts.size >= 2, c + ' is not a medley');
  }
});

/* ---------------- the castle follows the game ---------------- */

// a moment in the castle, as tasks.js would describe it
function castleView(o = {}) {
  const now = 1e6;
  return Object.assign({
    now, endsAt: now + 120000, seconds: 180, bellAt: 30, closed: false, dead: false,
    me: { x: 0, z: 0, h: 0, room: 'hall' },
    others: [{ id: 'a', x: 4, z: 0, room: 'hall' }, { id: 'b', x: 30, z: 5, room: 'kitchen' }],
    sealed: false, poison: null, partners: [], holding: null, micLive: false, dt: 0.25,
  }, o);
}

test('the castle\'s mood is role-blind: a Traitor without the poison hears what a Faithful hears', () => {
  const { G } = load();
  const M = G.TaskMood;
  const views = [castleView(), castleView({ sealed: true }), castleView({ endsAt: 1e6 + 8000 }),
                 castleView({ others: [{ id: 'a', x: 1, z: 0, room: 'hall' }], sealed: true, holding: 'letter' })];
  for (const v of views) {
    const faithful = M.compute(v, null);
    // a Traitor whose partner carries it: partners known, nothing in their own pocket
    const traitor = M.compute(Object.assign({}, v, { partners: ['a'], poison: { mine: false, carrier: 'a', used: false } }), null);
    eq(JSON.stringify(traitor), JSON.stringify(faithful), 'a Traitor without the poison hears something else');
    for (const k of ['private', 'poison', 'poisonNear', 'poisonLate', 'poisonHold']) eq(faithful.flags[k], false, k);
  }
  // the poison in your pocket changes the private flags and only them
  const v = castleView({ others: [{ id: 'a', x: 1.5, z: 0, room: 'hall' }] });
  const base = M.compute(v, null);
  const carrying = M.compute(Object.assign({}, v, { poison: { mine: true, used: false } }), null);
  eq(carrying.tension, base.tension, 'the poison moved the tension, which everybody hears');
  eq(carrying.flags.sealed, base.flags.sealed); eq(carrying.flags.followed, base.flags.followed);
  ok(carrying.flags.private && carrying.flags.poisonNear, 'the carrier hears nothing of their own');
  // …but not next to a partner
  const partner = M.compute(Object.assign({}, v, { poison: { mine: true, used: false }, partners: ['a'] }), null);
  ok(partner.flags.poison && !partner.flags.poisonNear, 'a partner is not a target');
  // and not with the microphone open
  const talking = M.compute(Object.assign({}, v, { poison: { mine: true, used: false }, micLive: true }), null);
  for (const k of ['private', 'poison', 'poisonNear']) eq(talking.flags[k], false, k + ' with the mic open');
  // used, or dead: nothing
  eq(M.compute(Object.assign({}, v, { poison: { mine: true, used: true } }), null).flags.private, false);
  eq(M.compute(Object.assign({}, v, { poison: { mine: true, used: false }, dead: true }), null).flags.private, false);
});

test('the clock winds the castle up, and the last ten seconds are a countdown', () => {
  const { G } = load();
  const M = G.TaskMood;
  const at = (left) => M.compute(castleView({ endsAt: 1e6 + left * 1000 }), null);
  const curve = [175, 140, 100, 60, 31, 29, 12, 9, 1].map(left => at(left));
  for (let i = 1; i < curve.length; i++) ok(curve[i].tension >= curve[i - 1].tension - 1e-9, 'it got calmer at ' + i);
  ok(curve[0].tension < 0.2, 'the start is thin: ' + curve[0].tension);
  ok(curve[5].tension >= 0.8, 'the bell is everything: ' + curve[5].tension);
  ok(!curve[6].countdown && curve[7].countdown && curve[8].countdown, 'the countdown is the last ten seconds');
  ok(!M.compute(castleView({ closed: true }), null).countdown, 'and stops when the day does');
});

test('shut in with one person tightens it; a second person, or an open door, lets it go', () => {
  const { G } = load();
  const M = G.TaskMood;
  const one = [{ id: 'a', x: 2, z: 0, room: 'hall' }];
  let st = null, out;
  for (let i = 0; i < 40; i++) { out = M.compute(castleView({ others: one, sealed: true }), st); st = out.state; }
  ok(out.flags.sealed, 'not sealed');
  const early = M.compute(castleView({ others: one, sealed: true }), null).tension;
  ok(out.tension > early, 'ten seconds in, no tighter: ' + early + ' → ' + out.tension);
  eq(M.compute(castleView({ others: one.concat([{ id: 'c', x: 3, z: 1, room: 'hall' }]), sealed: true }), st).flags.sealed, false,
     'with two others it is a meeting, not a trap');
  eq(M.compute(castleView({ others: one, sealed: false }), st).flags.sealed, false, 'the door is open');
  eq(M.compute(castleView({ others: [{ id: 'a', x: 2, z: 0, room: 'tower' }], sealed: true }), st).flags.sealed, false,
     'alone');
});

test('somebody who stays behind you while you walk is following you; somebody in front is not', () => {
  const { G } = load();
  const M = G.TaskMood;
  const walk = (dz, follower) => {
    let st = null, out;
    for (let i = 0; i < 24; i++) {             // six seconds, walking north at 2 m/s
      const z = i * 0.5;
      out = M.compute(castleView({ me: { x: 0, z, h: 0, room: 'hall' },
                                   others: [{ id: 'a', x: 0, z: z + dz, room: 'hall' }] }), st);
      st = out.state;
      if (i === 12) ok(!out.flags.followed || follower, 'followed after three seconds');
    }
    return out;
  };
  ok(walk(-3, true).flags.followed, 'three metres behind for six seconds is following');
  ok(!walk(3, false).flags.followed, 'three metres ahead is leading');
  // standing still with somebody behind you does not count
  let st = null, out;
  for (let i = 0; i < 40; i++) {
    out = M.compute(castleView({ others: [{ id: 'a', x: 0, z: -2, room: 'hall' }] }), st);
    st = out.state;
  }
  ok(!out.flags.followed, 'standing at a job is not being followed');
});

test('the private layers play only on the carrier\'s screen, and stop the instant the mic opens', () => {
  const { Music, ac, G } = load();
  const heard = [];
  const real = G.MusicInst.celesta;
  G.MusicInst.celesta = (S, t, f, dur, v, o) => { if (o && o.private) heard.push(t); return real(S, t, f, dur, v, o); };
  const s = Music.tasks({ variant: 3, seed: 8 });           // the heist, four-four
  const bar = 60 / s.sec.bpm * 4;
  s.setFlags({ poison: true });                             // the flag without the private gate
  run([s], ac, bar * 4);
  eq(heard.length, 0, 'a private layer played without the private flag');
  s.setFlags({ private: true, poison: true });
  run([s], ac, bar * 4);
  ok(heard.length >= 1, 'the carrier hears nothing');
  s.setFlags({ private: false });
  const n = heard.length, at = ac.currentTime;
  run([s], ac, bar * 4);
  ok(heard.every(t => t < at + 0.35), 'a private note was booked after the mic opened');
  eq(heard.length - n <= 1, true, 'more than the lookahead got through');
  // every private layer in the castle is soft and low
  for (const [name, sec] of Object.entries(Music.CUES.tasks.sections)) {
    for (const l of sec.layers.filter(x => x.private)) {
      ok(['synthBass', 'celesta', 'tick', 'strings'].includes(l.inst), name + '.' + l.id + ' is a ' + l.inst);
      ok(l.gain <= 0.4, name + '.' + l.id + ' is loud: ' + l.gain);
      ok(/^poison/.test(l.flag), name + '.' + l.id + ' is private but not about the poison');
    }
  }
  // and no other cue has any
  for (const [cue, C] of Object.entries(Music.CUES)) {
    if (cue === 'tasks') continue;
    for (const sec of Object.values(C.sections)) ok(!sec.layers.some(l => l.private || /^poison/.test(l.flag || '')), cue + ' has private layers');
  }
});

test('shut in, the drums stop and the heart starts', () => {
  const { Music, ac, G } = load();
  const count = {};
  for (const k of ['taiko', 'tom', 'snare', 'heartbeat']) {
    const real = G.MusicInst[k];
    G.MusicInst[k] = (...a) => { count[k] = (count[k] || 0) + 1; return real(...a); };
  }
  for (const variant of [0, 1, 2, 3, 4]) {
    const s = Music.tasks({ variant, seed: 3 });
    s.setTension(0.7, 0);
    const bar = 60 / s.sec.bpm / 4 * (s.sec.steps || 16);
    run([s], ac, bar * 4);
    for (const k in count) count[k] = 0;
    run([s], ac, bar * 4);
    ok((count.taiko || 0) > 0, s.sectionName + ' has no drums to stop');
    s.setFlags({ sealed: true });
    run([s], ac, bar * 2);                                 // a bar to fade, and the lookahead
    for (const k in count) count[k] = 0;
    run([s], ac, bar * 4);
    eq((count.taiko || 0) + (count.snare || 0), 0, s.sectionName + ': the drums kept going behind a shut door');
    ok((count.heartbeat || 0) >= 4, s.sectionName + ': no heart');
    s.stop(0.1);
  }
});

test('the role cards sound the same length to anybody else in the room', () => {
  const { Music, ac } = load();
  const s = Music.ceremony();
  run([s], ac, 1);
  const end = (kind) => {
    const from = ac.log.starts.length, t = ac.currentTime;
    s.stinger(kind);
    const mine = ac.log.starts.slice(from);
    return { n: mine.length, last: Math.max(...mine.map(x => x.n.stopped || 0)) - t };
  };
  const a = end('role-traitor'), b = end('role-faithful');
  ok(Math.abs(a.last - b.last) < 0.15, 'traitor rings ' + a.last.toFixed(2) + ' s, faithful ' + b.last.toFixed(2));
  ok(Math.abs(a.n - b.n) <= 2, 'traitor is ' + a.n + ' sources, faithful ' + b.n);
});

test('the day ends on the countdown\'s hit, and nothing plays after it', () => {
  const { Music, ac } = load();
  const s = Music.tasks({ variant: 0, seed: 3 });
  s.section('bell', { at: 'bar' });
  run([s], ac, 4);
  const b = s.build({ shape: 'countdown', secs: 10 });
  run([s], ac, 10);
  const at = ac.currentTime;
  const wait = b.release('day-end', { end: true });
  ok(wait < 0.03, 'the countdown has no breath, it lands on zero: ' + wait);
  const from = ac.log.starts.length;
  run([s], ac, 4);
  const after = ac.log.starts.slice(from);
  eq(after.length, 0, 'the band played on after the day ended');
});

/* ---------------- the rest of the score ---------------- */

test('each scene has its own key: the night a long way down, the table a fourth up, the fire home', () => {
  const { Music } = load();
  for (let day = 0; day < 6; day++) {
    const dm = Music.dayMusic(777, day);
    const at = (scene, o) => Music.sceneMusic(scene, 777, day, o).key;
    eq(at('fire'), 0, 'the fire is in D');
    eq(at('breakfast'), dm.key, 'breakfast pretends it is still the day');
    eq(at('table'), 5, 'the table is a fourth up');
    eq(at('table', { revote: 2 }), 7, 'and climbs a semitone a revote');
    const n = at('night');
    ok(n >= -7 && n <= 7, 'night key out of range: ' + n);
    ok(((n - dm.key) % 12 + 12) % 12 === 8, 'the night is not a third down from the day: ' + dm.key + ' → ' + n);
    eq(Music.sceneMusic('night', 777, day).variant, dm.variant, 'the night keeps the day\'s arrangement');
  }
  const t = Music.roundtable(Music.sceneMusic('table', 777, 1));
  eq(t.key, 5, 'the round table plays in it');
  ok(near(t.hz(0) / Music.finale().hz(0), Math.pow(2, 5 / 12)), 'a fourth up');
});

test('three nights running are three different nights, and three visits to the door three overtures', () => {
  const { Music, ac } = load();
  const nights = new Set();
  for (let day = 1; day <= 3; day++) {
    const s = Music.murder('nightfall', Music.sceneMusic('night', 31337, day));
    nights.add(s.sectionName);
    s.stop(0.1);
  }
  eq(nights.size, 3, 'three nights: ' + [...nights].join(' '));
  for (let v = 0; v < 3; v++) {
    const s = Music.title({ variant: v });
    const gate = s.sectionName;
    s.section('anthem', { at: 'bar', glide: 2.5, fill: true });
    run([s], ac, 6);
    eq(gate, ['gate', 'gate2', 'gate3'][v], 'visit ' + v);
    eq(s.sectionName, ['anthem', 'anthem2', 'anthem3'][v], 'and its own lift');
    ok(s.sec.layers.some(l => /taiko/.test(l.inst)), s.sectionName + ' has drums');
    s.stop(0.1);
  }
  // Explore has its own music now, and none of it is the round table's argument
  const x = Music.explore();
  eq(x.sectionName, 'roam');
  for (const sec of ['roam', 'turret', 'round']) ok(Music.CUES.explore.sections[sec], 'explore.' + sec);
});

test('the suspicion clock keeps seven-eight, and the waltz three-four', () => {
  const { Music, ac } = load();
  // the debate's other arrangement, on the day that gets it
  const s = Music.play('roundtable', { section: 'debate', variant: 1, seed: 4 });
  eq(s.sectionName, 'debateClock', 'the second variant is the clock');
  const sec = s.sec, sps = 60 / sec.bpm / 4;
  eq(sec.steps, 14, 'seven-eight is fourteen sixteenths');
  const t0 = s.t0, from = ac.log.starts.length;
  run([s], ac, 14 * sps * 6);
  const bars = new Set();
  for (const { t, kind, n } of ac.log.starts.slice(from)) {
    // the heart's second thump is meant to be a fifth of a second late
    if (kind === 'osc' && n.frequency.value < 60) continue;
    const k = (t - t0) / sps;
    ok(near(k, Math.round(k), 1e-4), 'off the grid at ' + k);
    bars.add(Math.round(k) % 14);
  }
  ok(bars.has(0) && bars.has(4) && bars.has(8), 'the two-two-three is not there: ' + [...bars].sort((a, b) => a - b));
  // the waltz: the bass on one, the chord on two and three, and nowhere else
  const { G } = load();
  const B = G.MusicCues.CUES.murder.sections.breakfast;
  eq(B.steps, 12, 'three beats of four');
  const oom = B.layers.find(l => l.id === 'oom'), pah = B.layers.find(l => l.id === 'pah');
  eq(oom.pat.map((v, i) => v ? i : -1).filter(i => i >= 0).join(), '0');
  eq(pah.pat.map((v, i) => v ? i : -1).filter(i => i >= 0).join(), '4,8');
});

test('every new tune sits on its chords', () => {
  const { G } = load();
  const { MOTIFS, PROGRESSIONS, SCALES } = G.MusicThemes;
  const pc = (x) => ((x % 12) + 12) % 12;
  const withTritone = new Set(SCALES.dark.concat([6]));
  for (const [motif, prog, scale, steps] of [
    ['heist', 'ballot', new Set(SCALES.minor), 16], ['pipes', 'jig', new Set(SCALES.minor), 16],
    ['traitors', 'omen', withTritone, 16], ['faithful', 'victory', new Set(SCALES.major), 16],
    ['suspicion', 'omen', withTritone, 14], ['waltz', 'waltz', new Set(SCALES.minor), 12]]) {
    const M = MOTIFS[motif], P = PROGRESSIONS[prog];
    eq(M.len % steps, 0, motif + ' is not a whole number of bars');
    for (const [at, n] of Object.entries(M.at)) {
      const s = +at;
      ok(scale.has(pc(n.s)), motif + ': ' + n.s + ' is out of key at ' + s);
      const bar = P[Math.floor(s / steps) % P.length];
      const half = Array.isArray(bar[0]);
      const onChange = s % steps === 0 || (half && s % steps === Math.floor(steps / 2));
      if (!onChange) continue;
      const chord = half ? (s % steps < steps / 2 ? bar[0] : bar[1]) : bar;
      ok(chord.map(pc).includes(pc(n.s)), motif + ': ' + n.s + ' at ' + s + ' is not in ' + JSON.stringify(chord));
    }
  }
});

/* A whole run of the game, three days and the fire, in the order the
   scenes make the calls — on a phone's budget. Anything that only
   breaks after something else (a flag left up into the next scene, a
   build nobody released, a key that never came home) breaks here. */
test('three days and the fire, start to finish, on a phone', () => {
  const { Music, ac } = load({ talkers: () => [] }, { Voice: { speaking: false } });
  eq(Music.budget, 110, 'the phone orchestra');
  const seed = 2468;
  let m = null, peak = 0, peakAt = '';
  const where = [];
  const use = (s, label) => { Music.live.forEach(x => { if (x !== s) x.stop(0.8); }); m = s; where.push(label); };
  const step = (sec, label) => run([m], ac, sec, () => { if (m.voices > peak) { peak = m.voices; peakAt = label || where[where.length - 1]; } });

  use(Music.title({ variant: 0 }), 'title'); step(6);
  use(Music.ceremony(), 'hill'); step(6);
  m.stinger('role-faithful', { at: 'beat' }); step(3);
  m.section('wiseClock', { at: 'beat' }); step(4);
  let b = m.build({ shape: 'wise', secs: 3, bed: 'wiseRise' }); step(3);
  step(b.release('wise-reveal', { then: 'wiseReveal' }) + 4, 'wise reveal');
  for (let day = 1; day <= 3; day++) {
    use(Music.tasks(Music.dayMusic(seed, day)), 'day ' + day);
    m.stinger('castle-open', { at: 'beat' });
    m.setTension(0.15, 0); step(6);
    m.setTension(0.6, 4); m.setFlags({ sealed: true }); step(6);
    m.setFlags({ sealed: false, followed: true, private: true, poison: true, poisonNear: true }); step(5);
    m.setFlags({ followed: false, private: false, poison: false, poisonNear: false });
    m.stinger('bell', { at: 'beat' }); m.section('bell', { at: 'bar', glide: 1 }); m.setTension(0.9, 2); step(5);
    b = m.build({ shape: 'countdown', secs: 10 }); step(10, 'countdown');
    b.release('day-end', { end: true }); step(2, 'day end');

    use(Music.murder('nightfall', Music.sceneMusic('night', seed, day)), 'night ' + day); step(5);
    m.section('conclave', { at: 'bar', glide: 2 }); m.setTension(1, 6); step(6);
    b = m.build({ shape: 'letter', secs: 1.8 }); step(1.8);
    step(b.release('murder-hit', { then: 'deed' }) + 3, 'letter');

    use(Music.murder('dawn', Music.sceneMusic('breakfast', seed, day)), 'breakfast ' + day);
    m.section('breakfast', { at: 'bar', glide: 3 }); step(4);
    for (let n = 0; n < 3; n++) { m.stinger('arrive', { n }); step(1.5); }
    step(m.strike('breakfast-absent', { then: 'absence', breath: 0.7 }) + 4);
    eq(m.sectionName, 'absence');

    use(Music.roundtable(Music.sceneMusic('table', seed, day)), 'table ' + day);
    eq(m.key, 5, 'the table is a fourth up');
    m.section('debate', { at: 'bar', glide: 3 }); m.setTension(0.2, 0); m.setTension(0.95, 8); step(8);
    m.section('slate', { at: 'bar', glide: 1.5 }); step(3);
    for (let n = 0; n < 3; n++) { m.setTension(0.4 + 0.2 * n, 1.2); m.stinger('slate-turn', { n }); step(1.2); }
    b = m.build({ shape: 'slate' }); step(1.6);
    step(b.release('slate-turn', { n: 3 }) + 1);
    m.stinger('banish', { at: 'beat' }); m.section('reveal', { at: 'bar', glide: 2 }); step(4);
    m.section('lastWords', { at: 'bar', glide: 1 }); step(4);
    b = m.build({ shape: 'banish', bed: 'drumroll', ramp: 3.6 }); step(3.7);
    const role = day === 2 ? 'traitor' : 'faithful';
    step(b.release('reveal-' + role, { then: role === 'traitor' ? 'banishTraitor' : 'banishFaithful' }) + 4, 'banish ' + day);
    m.stinger('walkout', { at: 'beat' }); m.section('walkout', { at: 'bar', glide: 0.5 }); step(5);
    ok(m.coda() > 0, 'day ' + day + ': no coda'); step(3);
  }
  use(Music.finale(Music.dayMusic(seed, 4)), 'fire'); step(5);
  m.section('ballot', { at: 'bar', fill: true });
  for (let n = 0; n < 4; n++) { m.stinger('vote', { at: 'beat', n }); m.setIntensity(1 + 0.07 * (n + 1)); step(1.2, 'votes'); }
  m.section('lastPouches', { at: 'bar', glide: 2 }); m.setTension(0.65, 3); step(4);
  m.setKey(2); m.section('held', { at: 'now', glide: 0.3 });
  b = m.build({ shape: 'pouch', secs: 3, gain: 1.15 }); step(3);
  b.cancel(0.04); m.silence(true); step(0.85);
  m.strike('reveal-traitor', { then: 'finalBurn', breath: 0 }); m.stinger('last-pouch'); step(6, 'last pouch');
  const V = Music.verdictCue({ won: false, role: 'faithful' });
  m.setKey(0); m.stinger(V.sting); m.section(V.section, { at: 'bar', glide: 2 }); step(8);
  eq(m.key, 0, 'home for the verdict');
  ok(/^verdictTraitor/.test(m.sectionName), 'the verdict: ' + m.sectionName);
  ok(Music.sectionAll(V.credits, { at: 'bar', glide: 3 }), 'credits'); step(6);
  ok(peak <= 175, 'the phone peaked at ' + peak + ' voices, at ' + peakAt);
  ok(where.length === 2 + 4 * 3 + 1, 'scenes: ' + where.join(' → '));
});

test('a twist builds, holds its breath, hits with brass and choir, and returns to the day\'s work', () => {
  const { Music, ac } = load({ talkers: () => [] });
  const m = Music.tasks(Music.dayMusic(1234, 2));        // non-default variant
  const daySec = m.sectionName;
  run([m], ac, 2);
  const b = m.build({ shape: 'twist', secs: 1.8 });
  ok(b.live, 'twist build started');
  run([m], ac, 1.8);
  const at = ac.currentTime, from = ac.log.starts.length;
  const wait = b.release('twist', { then: 'twist' });
  const T = at + wait;
  ok(wait > 0.3 && wait < 0.5, 'breath before the twist: ' + wait);
  eq(m.sectionName, 'twist', 'entered the twist section');
  run([m], ac, 1.5);
  const after = ac.log.starts.slice(from);
  ok(after.length > 20, 'twist stinger and section played');
  for (const x of after) ok(x.t >= T - 1e-6, 'nothing booked in the breath');
  ok(after.some(x => near(x.t, T, 1e-6)), 'stinger landed on the instant');
  m.section('work', { at: 'bar', glide: 1.8, via: 'fill' });
  run([m], ac, 4);
  eq(m.sectionName, daySec, 'returned to the day\'s own work arrangement');
  m.stop(0.1);
});

H.report();

/* ------------------------------------------------------------------
   music.test.js — the score, played into a recording AudioContext.

   Nobody can listen to a test, so this checks the parts of the music
   that are arithmetic: that notes land on the grid, that a section
   changes on a bar line, that the dive's beat does not move, that the
   orchestra stays inside its budget, that every stinger and section
   the game asks for exists, and that the theme is in the key it says
   it is in. It also enforces the rules a real browser throws on and a
   test would otherwise never see: an exponential ramp to zero, and a
   start time that is not a finite number.
------------------------------------------------------------------ */
const fs = require('fs');
const path = require('path');
const H = require('./harness');
const { test, eq, ok } = H;

/* ---------------- a recording AudioContext ---------------- */

function makeCtx() {
  const log = { starts: [], nodes: 0 };
  const ctx = { currentTime: 0, sampleRate: 8000, log };

  function param(v = 0) {
    const p = {
      value: v,
      setValueAtTime(x, t) { chk(t); fin(x); p.value = x; },
      linearRampToValueAtTime(x, t) { chk(t); fin(x); p.value = x; },
      exponentialRampToValueAtTime(x, t) {
        chk(t); fin(x);
        if (!(x > 0)) throw new Error('exponential ramp to ' + x);
        p.value = x;
      },
      setTargetAtTime(x, t, k) { chk(t); fin(x); fin(k); p.value = x; },
      cancelScheduledValues(t) { chk(t); },
    };
    return p;
  }
  const fin = (x) => { if (!Number.isFinite(x)) throw new Error('non-finite value ' + x); };
  const chk = (t) => { if (!Number.isFinite(t) || t < 0) throw new Error('bad time ' + t); };

  function node(extra = {}) {
    log.nodes++;
    return Object.assign({
      connect(x) { if (!x) throw new Error('connect to nothing'); return x; },
      disconnect() {},
    }, extra);
  }
  function source(kind) {
    const n = node({
      kind, frequency: param(440), detune: param(0), started: null,
      start(t = 0) { chk(t); n.started = t; log.starts.push({ kind, t, n }); },
      stop(t = 0) { chk(t); },
    });
    return n;
  }

  Object.assign(ctx, {
    createGain: () => node({ gain: param(1) }),
    createOscillator: () => Object.assign(source('osc'), { type: 'sine' }),
    createBufferSource: () => Object.assign(source('noise'), { buffer: null, loop: false }),
    createBiquadFilter: () => node({ type: 'lowpass', frequency: param(350), Q: param(1), gain: param(0) }),
    createConvolver: () => node({ buffer: null }),
    createWaveShaper: () => node({ curve: null, oversample: 'none' }),
    createStereoPanner: () => node({ pan: param(0) }),
    createDelay: () => node({ delayTime: param(0) }),
    createDynamicsCompressor: () => node({
      threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(),
    }),
    createBuffer: (ch, n) => {
      const data = Array.from({ length: ch }, () => new Float32Array(n));
      return { numberOfChannels: ch, length: n, getChannelData: (i) => data[i] };
    },
  });
  return ctx;
}

function load(voiceChat) {
  const ac = makeCtx();
  const dest = { connect() {}, disconnect() {} };
  const AudioBus = {
    get ctx() { return ac; }, ready: true,
    bus: () => dest,
    noiseSource: () => ac.createBufferSource(),
  };
  const noop = () => 0;
  const G = H.load(['js/core/util.js', 'js/core/music/mix.js', 'js/core/music/instruments.js',
                    'js/core/music/cues.js', 'js/core/music.js'],
                   { AudioBus, setInterval: noop, clearInterval: noop, setTimeout: noop,
                     VoiceChat: voiceChat });
  return { G, ac, Music: G.Music };
}

// advance the audio clock, pumping the scheduler as the real timer would
function run(M, ac, seconds, each) {
  const end = ac.currentTime + seconds;
  while (ac.currentTime < end) {
    ac.currentTime += 0.04;
    M.forEach(m => m._pump());
    if (each) each();
  }
}

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

/* ---------------- every cue plays ---------------- */

test('every section of every cue plays for twenty seconds without an illegal call', () => {
  const { Music, ac } = load();
  for (const [cue, C] of Object.entries(Music.CUES)) {
    for (const name of Object.keys(C.sections)) {
      const s = Music.play(cue, { section: name });
      ok(s.ok, cue + ' did not start');
      s.setIntensity(1.5);
      const before = ac.log.starts.length;
      run([s], ac, 20);
      ok(ac.log.starts.length > before, cue + '.' + name + ' played nothing');
      s.stop(0.1);
    }
  }
});

test('every stinger plays in every cue', () => {
  const { Music, ac } = load();
  for (const cue of Object.keys(Music.CUES)) {
    const s = Music.play(cue);
    run([s], ac, 1);
    for (const kind of Object.keys(Music.STINGERS)) {
      s.stinger(kind, { n: 2 });
      s.stinger(kind, { at: 'beat', n: 5 });
      s.stinger(kind, { at: 'bar' });
    }
    run([s], ac, 1);
    s.stop(0.1);
  }
});

/* ---------------- the grid ---------------- */

test('notes land on the sixteenth grid at a steady tempo', () => {
  const { Music, ac } = load();
  const s = Music.play('finale', { section: 'ballot' });
  const t0 = s.t0, sps = 60 / 96 / 4;
  const from = ac.log.starts.length;
  run([s], ac, 12);
  const starts = ac.log.starts.slice(from);
  ok(starts.length > 100, 'expected a busy ballot, got ' + starts.length);
  for (const { t } of starts) {
    const k = (t - t0) / sps;
    ok(near(k, Math.round(k), 1e-4), 'note off the grid at ' + t.toFixed(4) + ' (step ' + k + ')');
  }
});

test('a section asked for mid-bar starts on the next bar line', () => {
  const { Music, ac } = load();
  const s = Music.play('finale', { section: 'ballot' });
  const sps = 60 / 96 / 4, bar = sps * 16;
  run([s], ac, bar * 1.37);
  s.section('names', { at: 'bar' });
  let switched = null;
  const orig = s._enter.bind(s);
  s._enter = (sw, t) => { switched = t; orig(sw, t); };
  run([s], ac, bar * 2);
  ok(switched != null, 'never switched');
  const k = (switched - s.t0) / bar;
  ok(near(k, Math.round(k), 1e-6), 'switch landed ' + k + ' bars in, not on a bar line');
  eq(s.sectionName, 'names', 'section');
});

test('a stinger asked for on the beat lands on a beat you have not heard yet', () => {
  const { Music, ac } = load();
  const s = Music.play('finale', { section: 'ballot' });
  run([s], ac, 3.13);
  const T = s._gridTime(4, true);
  const spb = 60 / 96;
  ok(T >= ac.currentTime, 'beat is in the past');
  ok(T - ac.currentTime <= spb + 1e-6, 'skipped a beat: ' + (T - ac.currentTime));
  const k = (T - s.t0) / spb;
  ok(near(k, Math.round(k), 1e-6), 'not on a beat: ' + k);
});

/* ---------------- the day's jig ---------------- */

test('the day is an epic jig: six-eight, D minor, and it speeds up when the bell goes', () => {
  const { Music, ac } = load();
  const C = Music.CUES.tasks;
  eq(C.gears, ['work', 'bell']);
  for (const name of C.gears) eq(C.sections[name].steps, 12, name + ' is in six-eight');
  ok(C.sections.bell.bpm > C.sections.work.bpm, 'the bell is quicker');
  ok(C.sections.work.bpm >= 116, 'and it is not a stroll');
  eq(JSON.stringify(Music.PROGRESSIONS.jig[0]), JSON.stringify([0, 3, 7]), 'it opens on D minor');
  ok(C.sections.work.layers.some(l => l.inst === 'taiko'), 'with the big drums');
  const s = Music.tasks();
  ok(s.ok, 'it plays');
  let worst = 0;
  run([s], ac, 30, () => { worst = Math.max(worst, s.voices); });
  ok(worst > 6, 'suspiciously quiet jig: ' + worst);
  s.section('bell', { at: 'bar' });
  run([s], ac, 20, () => { worst = Math.max(worst, s.voices); });
  eq(s.sectionName, 'bell', 'the bell landed');
  ok(worst <= 140, 'live voices peaked at ' + worst);
});

test('the day has three arrangements, one a day in turn, each driving and dark', () => {
  const { Music, ac } = load();
  const C = Music.CUES.tasks.sections;
  eq(C.work.alt, ['workHunt', 'workReel'], 'work alternatives');
  eq(C.bell.alt.length, C.work.alt.length, 'a bell for each');
  const seen = new Set();
  for (let day = 1; day <= 3; day++) {
    const dm = Music.dayMusic(1234, day);
    eq(JSON.stringify(Music.dayMusic(1234, day)), JSON.stringify(dm), 'the same day is the same music');
    const s = Music.tasks(dm);
    ok(s.ok, 'day ' + day + ' plays');
    const name = s.sectionName;
    seen.add(name);
    const sec = C[name];
    ok(sec.bpm >= 116, name + ' moves');
    ok(sec.layers.some(l => l.inst === 'taiko'), name + ' has the big drums');
    let worst = 0;
    run([s], ac, 20, () => { worst = Math.max(worst, s.voices); });
    ok(worst > 6 && worst <= 140, name + ' voices ' + worst);
    s.section('bell', { at: 'bar' });
    run([s], ac, 8);
    eq(s.sectionName, sec === C.work ? 'bell' : C.bell.alt[C.work.alt.indexOf(name)],
       'the bell matches the day');
    s.stop(0.1);
  }
  eq(seen.size, 3, 'three days running, three arrangements');
  for (const p of ['jig', 'jigDark', 'hunt', 'omen', 'abyss', 'knife']) {
    const chords = Music.PROGRESSIONS[p].flatMap(c => (Array.isArray(c[0]) ? c : [c]));
    ok(!chords.some(c => JSON.stringify(c) === '[0,4,7]'), p + ' never lands on D major');
  }
});

test('a form moves through its parts, and a part can change the harmony', () => {
  const { Music, ac } = load();
  const s = Music.play('roundtable', { section: 'debate' });
  const sec = Music.CUES.roundtable.sections.debate;
  const parts = new Set(), chords = new Set();
  const bar = 60 / sec.bpm * 4;
  run([s], ac, bar * 40, () => { parts.add(s.part); chords.add(JSON.stringify(s.chordNow())); });
  ok(parts.size >= 3, 'parts heard: ' + [...parts].join(''));
  ok(chords.has(JSON.stringify([1, 5, 8])), 'the omen part brings in the flat second');
  // a layer kept to one part plays only there
  const F = Music.formAt({ form: 'AB', phrase: 2 }, 0);
  eq(F.part, 'A', 'bar 0'); eq(Music.formAt({ form: 'AB', phrase: 2 }, 2).part, 'B', 'bar 2');
  eq(Music.formAt({ form: 'AAB', phrase: 4 }, 6).local, 6, 'a run of the same part counts on');
  eq(Music.formAt({ form: 'AAB', phrase: 4 }, 9).local, 1, 'and a new part starts at the top');
  eq(Music.formAt({ form: ['AB', 'BA'], phrase: 4 }, 0, 1).part, 'B', 'a variant picks its own form');
  s.stop(0.1);
});

test('the front of house is epic, not cheerful: minor, driving, with drums', () => {
  const { Music } = load();
  const T = Music.CUES.title.sections;
  for (const [name, sec] of [['gate', T.gate], ['anthem', T.anthem], ['welcome', Music.CUES.ceremony.sections.title]]) {
    ok(sec.prog !== 'victory' && sec.prog !== 'hymn', name + ' is not in the major');
    ok(sec.bpm >= 90, name + ' moves');
    ok(sec.layers.some(l => l.inst === 'taiko'), name + ' has drums');
  }
});

test('a banishment has a drumroll and a walk out', () => {
  const { Music, ac } = load();
  const R = Music.CUES.roundtable.sections;
  ok(R.drumroll && R.walkout, 'both sections exist');
  ok(Music.STINGERS.walkout, 'and the hit that starts the walk');
  const s = Music.roundtable();
  s.section('drumroll', { at: 'beat' });
  run([s], ac, 4);
  s.stinger('walkout', { at: 'beat' });
  s.section('walkout', { at: 'bar' });
  let loud = 0;
  run([s], ac, 12, () => { loud = Math.max(loud, s.voices); });
  eq(s.sectionName, 'walkout');
  ok(loud > 20 && loud <= 140, 'big, and inside the budget: ' + loud);
});

/* ---------------- the budget ---------------- */

test('the title overture lifts into its anthem and stays inside the budget', () => {
  const { Music, ac } = load();
  const s = Music.play('title', { section: 'gate' });
  ok(s.ok, 'the overture did not start');
  let quiet = 0;
  run([s], ac, 12, () => { quiet = Math.max(quiet, s.voices); });
  eq(s.sectionName, 'gate', 'the overture does not promote itself');
  ok(quiet > 4, 'suspiciously empty gate: ' + quiet);

  // what `main.js` does a pass in
  s.section('anthem', { at: 'bar', glide: 2.5, fill: true });
  let loud = 0;
  run([s], ac, 60, () => { loud = Math.max(loud, s.voices); });
  eq(s.sectionName, 'anthem', 'the lift never landed');
  ok(loud > quiet, 'the anthem is no bigger than the gate: ' + loud + ' vs ' + quiet);
  ok(loud <= 130, 'live voices peaked at ' + loud);
});

/* ---------------- silence, keys, talk ---------------- */

test('silence books nothing, and a stinger ends it', () => {
  const { Music, ac } = load();
  const s = Music.play('finale', { section: 'held' });
  run([s], ac, 2);
  s.silence(true);
  run([s], ac, 0.5);                       // let the lookahead drain
  const from = ac.log.starts.length;
  run([s], ac, 3);
  eq(ac.log.starts.length, from, 'notes booked while silent');
  ok(s.out.gain.value < 0.01, 'still audible');
  s.stinger('reveal-traitor');
  ok(!s.silent, 'stinger did not lift the silence');
  ok(s.out.gain.value > 0.5, 'band did not come back');
});

test('a key change lands on the next bar and moves every note', () => {
  const { Music, ac } = load();
  const s = Music.play('finale', { section: 'lastPouches' });
  run([s], ac, 1);
  const a = s.hz(0);
  s.setKey(2);
  eq(s.key, 0, 'key changed before the bar');
  run([s], ac, 60 / 72 * 4 + 0.5);
  eq(s.key, 2, 'key');
  ok(near(s.hz(0) / a, Math.pow(2, 2 / 12)), 'transposition');
});

test('the band steps back when a player talks', () => {
  let loud = false;
  const { Music, ac } = load({ loudest: () => loud });
  const s = Music.play('finale', { section: 'floor' });
  s.speakerDuck(true);
  run([s], ac, 0.5);
  eq(s.talk.gain.value, 1, 'ducked for nobody');
  loud = true;
  run([s], ac, 0.2);
  ok(near(s.talk.gain.value, Music.CUES.finale.sections.floor.talkDuck), 'did not duck under a voice');
  s.speakerDuck(false);
  eq(s.talk.gain.value, 1, 'duck left on');
});

/* ---------------- a night at the fire ----------------
   The calls fireplace.js, reveal.js and show.js make, in the order a
   night makes them, against one score — so a transition that only
   breaks after another one (a key change surviving into the verdict,
   a silence nobody lifts) shows up here. */

test('a whole night at the fire, in order', () => {
  const { Music, ac } = load({ loudest: () => false });
  const m = Music.finale();
  const seen = [];
  const orig = m._enter.bind(m);
  m._enter = (sw, t) => { seen.push(sw.name); orig(sw, t); };
  const step = (sec) => run([m], ac, sec);

  step(4);                                             // the loch
  m.section('warn', { glide: 3 }); step(3);
  m.stinger('warn', { at: 'beat' }); step(3);
  m.section('floor', { at: 'bar', glide: 3 }); m.setIntensity(0.7); m.speakerDuck(true);
  for (let n = 1; n <= 3; n++) {
    m.setIntensity(0.7 + 0.2 * (n - 1));
    if (n > 1) m.stinger('floor-next', { at: 'bar' });
    step(6);
  }
  m.speakerDuck(false);
  m.section('ballot', { at: 'bar', fill: true }); m.setIntensity(1);
  for (let n = 0; n < 3; n++) { m.stinger('vote', { at: 'beat', n }); step(1.2); }
  step(4);
  m.section('names', { at: 'beat', glide: 0.6 });
  for (let n = 0; n < 3; n++) { step(1.5); m.stinger('name', { n }); }
  step(1);

  // the last pouches: two of them, climbing
  m.section('lastPouches', { at: 'bar', glide: 2 }); step(3);
  for (let k = 0; k < 2; k++) {
    m.setKey(k);
    m.section('lastPouches', { at: 'bar', glide: 2 }); step(4);
    m.section('held', { at: 'now', glide: 0.3 });
    const r = m.riser(2.1); step(2.1);
    r.stop(); m.silence(true); step(0.9);
    ok(m.silent, 'silent before the answer');
    const role = k ? 'traitor' : 'faithful';
    m.stinger('reveal-' + role);
    m.section(k ? 'afterTraitor' : 'lastPouches', { at: 'now', glide: 2.5 });
    ok(!m.silent, 'the answer lifted the silence');
    step(4);
  }
  eq(m.key, 1, 'climbed a semitone');

  const V = Music.verdictCue({ won: true, role: 'faithful' });
  m.setKey(0); m.stinger(V.sting); m.section(V.section, { at: 'bar', glide: 2 });
  step(8);
  eq(m.key, 0, 'back in D for the verdict');
  ok(Music.sectionAll(V.credits, { at: 'bar', glide: 3 }), 'credits');
  step(6);
  eq(m.sectionName, 'creditsWin', 'the credits are playing');
  for (const name of ['warn', 'floor', 'ballot', 'names', 'lastPouches', 'held',
                      'afterTraitor', 'verdictWin', 'creditsWin']) {
    ok(seen.includes(name), 'never reached ' + name + ' (saw ' + seen.join(' → ') + ')');
  }
  ok(seen.indexOf('verdictWin') < seen.indexOf('creditsWin'), 'verdict before credits');
});

/* ---------------- what the game asks for exists ---------------- */

function sources(dir = 'js') {
  const out = [];
  const walk = (d) => {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (f.endsWith('.js')) out.push(fs.readFileSync(p, 'utf8'));
    }
  };
  walk(path.join(H.ROOT, dir));
  return out.join('\n');
}

test('every stinger the game calls by name exists', () => {
  const { Music } = load();
  const src = sources();
  const asked = new Set();
  for (const m of src.matchAll(/stinger\(\s*'([\w-]*\w)'(?!\s*\+)/g)) asked.add(m[1]);
  for (const m of src.matchAll(/sting:\s*'([\w-]+)'/g)) asked.add(m[1]);
  // built by concatenation
  for (const k of ['reveal-traitor', 'reveal-faithful', 'role-traitor', 'role-faithful']) asked.add(k);
  ok(asked.size > 15, 'found only ' + asked.size + ' stinger calls');
  for (const k of asked) ok(Music.STINGERS[k], 'no stinger "' + k + '"');
});

test('every section the fire and the verdict ask for exists', () => {
  const { Music } = load();
  // the rooms that play the fire's score; the missions have cues of their own
  const src = sources('js/scenes');
  const F = Music.CUES.finale.sections;
  const asked = new Set();
  for (const m of src.matchAll(/_cue\(\s*'(\w+)'/g)) asked.add(m[1]);
  for (const m of src.matchAll(/(?:section|credits|after):\s*'(\w+)'/g)) asked.add(m[1]);
  for (const m of src.matchAll(/'(after\w+|lastPouches|verdict\w+|credits\w+)'/g)) asked.add(m[1]);
  ok(asked.size >= 8, 'found only ' + asked.size + ' section names');
  for (const k of asked) ok(F[k], 'finale has no section "' + k + '"');
  for (const o of [{ won: true, role: 'traitor' }, { won: true, role: 'faithful' },
                   { won: false, role: 'faithful' }, { won: false, role: 'traitor' },
                   { won: false, role: 'faithful', reason: 'you-burned' }]) {
    const V = Music.verdictCue(o);
    ok(F[V.section] && F[V.credits] && Music.STINGERS[V.sting], 'verdict cue ' + JSON.stringify(o));
  }
});

test('the silent score answers everything a real one does', () => {
  const { Music } = load();
  const methods = Object.getOwnPropertyNames(Music.Score.prototype)
    .filter(k => k !== 'constructor' && !k.startsWith('_')
            && typeof Object.getOwnPropertyDescriptor(Music.Score.prototype, k).value === 'function')
    .filter(k => !['fam', 'choirIn', 'wet', 'alloc', 'hz'].includes(k));
  for (const k of methods) ok(typeof Music.SILENT[k] === 'function', 'SILENT has no ' + k + '()');
  eq(Music.SILENT.section('ballot'), false, 'SILENT.section');
});

/* ---------------- the theme is in its key ---------------- */

test('the theme sits on its chords', () => {
  const { G } = load();
  const { MOTIFS, PROGRESSIONS } = G.MusicCues;
  const pc = (x) => ((x % 12) + 12) % 12;
  const MINOR = new Set([0, 2, 3, 5, 7, 8, 10, 11]);       // natural + the leading tone
  const MAJOR = new Set([0, 2, 4, 5, 7, 9, 11]);
  const DARK = new Set([0, 1, 2, 3, 5, 7, 8, 10, 11]);       // with the flat second
  for (const [motif, prog, scale, steps = 16] of [['theme', 'fire', MINOR], ['fate', 'fate', MINOR],
                                      ['hymn', 'victory', MAJOR], ['hunt', 'hunt', DARK],
                                      ['jig', 'jig', MINOR, 12], ['reel', 'jigDark', DARK, 12]]) {
    const M = MOTIFS[motif], P = PROGRESSIONS[prog];
    for (const [at, n] of Object.entries(M.at)) {
      const s = +at;
      ok(scale.has(pc(n.s)), motif + ': ' + n.s + ' is out of key at ' + s);
      const bar = P[Math.floor(s / steps) % P.length];
      const half = Array.isArray(bar[0]);
      const onChange = s % steps === 0 || (half && s % steps === steps / 2);
      if (!onChange) continue;
      const chord = half ? (s % steps < steps / 2 ? bar[0] : bar[1]) : bar;
      ok(chord.map(pc).includes(pc(n.s)),
         motif + ': ' + n.s + ' at ' + s + ' is not in ' + JSON.stringify(chord));
    }
  }
});

H.report();

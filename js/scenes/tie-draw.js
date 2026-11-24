/* ------------------------------------------------------------------
   tie-draw.js — tied twice, and the castle draws.

   A table that ties on the revote does not get a third go: the castle
   picks one of the tied names. That used to be one line from Claudia
   and straight on to the banishment. Now it is the biggest moment the
   table has that is not a reveal:

     dead stop   the band cuts out, the letterbox, DEADLOCK on a hit
     Claudia     "Tied. Again. Now the castle chooses."
     the roll    a drumroll builds while the camera cuts from one tied
                 face to the next, fast and then slower, like a wheel
                 running down — and it stops on the wrong one, and holds
     the pick    silence, a breath, and the cut to the name it lands on

   The pick is already in the session (`finale.pending`); every screen
   runs the same wheel from the same seed and meets at a barrier before
   the name, so the hit lands on every screen together.

   Shared by the round table and the fire: both are Stage scenes with
   `_say`, `music` and `_alive`.
------------------------------------------------------------------ */
const TieDraw = (() => {

  const nameOf = (p) => (p.local ? 'YOU' : p.name.toUpperCase());

  /* The wheel: how many faces it passes and how long it rests on each.
     It starts at a flicker and runs down, and the last face before the
     pick is held long enough to make everybody think that is it. The
     list ends on the pick. Pure, so the test can read it. */
  function wheel(tied, pick, seed) {
    const k = tied.length;
    const at = Math.max(0, tied.indexOf(pick));
    const r = U.makeRng((seed >>> 0) || 1);
    const n = Math.max(k + 1, 9 + Math.floor(r() * 4));        // faces before the pick
    const start = ((at - n) % k + k) % k;
    const steps = [];
    for (let i = 0; i < n; i++) {
      const x = i / Math.max(1, n - 1);
      steps.push({ id: tied[(start + i) % k], dwell: 0.2 + 0.75 * x * x });
    }
    // the near miss: the face before the pick stays up
    steps[steps.length - 1].dwell = 1.5;
    return { steps, pick };
  }

  async function play(scene, o = {}) {
    const s = Session.state;
    const f = s.finale;
    const st = scene.stage;
    const music = scene.music;
    const pick = Session.playerById(f.pending);
    const between = ((f.lastTally && f.lastTally.between) || [f.pending])
      .map(id => Session.playerById(id)).filter(Boolean)
      .sort((a, b) => a.seat - b.seat);
    if (!pick || !scene._alive) return;
    const alive = () => scene._alive && Session.state.finale && Session.state.finale.pending === pick.id;
    const key = (o.key || 'tie') + '-' + s.day + '-' + (f.round || 0);

    // dead stop: the band goes, the bars come in, and the word lands
    if (music && music.silence) music.silence(true);
    await Scenes.Drama.hush(st, null, o.claudiaShot || 'claudia', { hold: 1.1, silent: false, cut: true, push: 0.1, speed: 0.4 });
    if (!alive()) return;
    if (music && music.stinger) { music.silence(false); music.stinger('tie'); }
    Scenes.Drama.hit(st, null, null, { shake: 0.7, flash: 'rgba(200,16,30,.65)', haptic: 80 });
    Scenes.Cine.card({ kicker: 'Tied twice', title: 'DEADLOCK', tone: 'bad', cls: 'last heat-3',
                       sub: o.sub || 'The table cannot choose.' });
    between.forEach((p) => { if (st && st.setMood) st.setMood(p.id, 'nervous'); });
    await Scenes.wait(1.4);
    if (!alive()) return;
    await scene._say('tableLot', {}, null);
    if (!alive()) return;
    Scenes.Cine.card(null);

    // the roll starts under her, on the first tied face
    const t0 = Date.now();
    const build = Scenes.Drama.build(st, music, 'banish', { camera: false, bed: 'drumroll', ramp: 6 });
    if (st && st.act) between.forEach((p, i) => setTimeout(() => {
      if (scene._alive && scene.stage) scene.stage.act(p.id, i % 2 ? 'handChest' : 'gasp');
    }, 250 * i));
    const names = between.map(p => (p.local ? 'you' : p.name));
    await scene._say('tieDrawRoll', { names: names.length > 1
      ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names.join('') }, null);
    if (!alive()) { build.cancel(); return; }

    // the wheel: cut, cut, cut… and it runs down
    const w = wheel(between.map(p => p.id), pick.id, (s.seed ^ (s.day * 7919) ^ ((f.round || 0) * 104729)) >>> 0);
    for (let i = 0; i < w.steps.length; i++) {
      const step = w.steps[i];
      const p = Session.playerById(step.id);
      if (!p) continue;
      if (!p.local) Scenes.Drama.shot(st, 'on:' + p.id, { cut: true, push: 0.05 + 0.1 * (i / w.steps.length), speed: 0.6 });
      Scenes.Cine.card({ kicker: 'The castle draws…', title: nameOf(p), tone: 'slate',
                         cls: 'heat-' + Math.min(3, Math.floor(4 * i / w.steps.length)) });
      if (typeof Input !== 'undefined' && Input.haptic) Input.haptic(12);
      await Scenes.wait(step.dwell);
      if (!alive()) { build.cancel(); return; }
    }

    // everybody meets here; then the top, the breath, and the name
    await Scenes.barrier(key + '-draw');
    if (!alive()) { build.cancel(); return; }
    Scenes.Cine.card(null);
    await scene._say('tieDrawPick', {}, null);
    if (!alive()) { build.cancel(); return; }
    await Scenes.Drama.peak(build, { since: t0, min: 4, max: 9 });
    if (!alive()) { build.cancel(); return; }
    const wait = build.release('banish');
    if (wait) await Scenes.wait(wait);
    if (!scene._alive) return;
    if (!pick.local) Scenes.Drama.shot(st, 'on:' + pick.id, { cut: true, push: 0.18, speed: 0.35 });
    Scenes.Drama.hit(st, null, null, { shake: 0.9, flash: 'rgba(220,10,24,.8)', haptic: 120 });
    Scenes.Cine.card({ kicker: 'The castle has chosen', title: nameOf(pick), tone: 'bad', cls: 'last heat-3' });
    if (st && st.act) {
      st.act(pick.id, 'handsFace');
      between.forEach((p) => { if (p.id !== pick.id) { st.act(p.id, 'relief'); st.setMood(p.id, 'calm'); } });
    }
    await Scenes.wait(2.2);
    Scenes.Cine.card(null);
    // the camera goes back to the scene, which stages the walk out itself
    Scenes.Drama.end(st, music);
  }

  /* Tied once: the slates split, and the table goes again between the
     tied. That used to be one line and a key change. Now it is a
     stand-off:

     the stop    the band cuts, the bars, a red hit and A TIE
     Claudia     names them, on her
     the faces   a heartbeat drumroll, and a slow cut from one tied face
                 to the next, each with their count, each taking it
     the turn    the breath, and the revote lands on a hit

     Every screen plays it from the same state; nothing waits on it, so
     there is no barrier — the ballot after it is already open. */
  async function standoff(scene, o = {}) {
    const s = Session.state;
    const f = s.finale;
    const st = scene.stage;
    const music = scene.music;
    const round = f.nameRound;
    const tied = (f.tied || []).map(id => Session.playerById(id)).filter(Boolean)
      .sort((a, b) => a.seat - b.seat);
    if (!tied.length || !scene._alive) return;
    const alive = () => scene._alive && Session.state.finale && Session.state.finale.nameRound === round;
    const counts = (f.lastTally && f.lastTally.counts) || {};
    const each = counts[tied[0].id] || 0;
    const names = tied.map(p => (p.local ? 'you' : p.name));
    const said = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names.join('');
    let build = null;
    const done = () => { if (build) build.cancel(0.6); Scenes.Cine.card(null); Scenes.Drama.end(st, music); };

    // the stop: the band goes, and the split lands
    if (music && music.silence) music.silence(true);
    await Scenes.Drama.hush(st, null, o.claudiaShot || 'claudia', { hold: 0.8, silent: false, cut: true, push: 0.08, speed: 0.5 });
    if (!alive()) return done();
    if (music && music.stinger) { music.silence(false); music.stinger('tie'); }
    Scenes.Drama.hit(st, null, null, { shake: 0.55, flash: 'rgba(200,16,30,.5)', haptic: 70 });
    Scenes.Cine.card({ kicker: 'The slates are split', title: 'A TIE', tone: 'bad', cls: 'heat-2',
                       sub: tied.map(nameOf).join('  ·  ') + (each ? '  —  ' + each + (each === 1 ? ' vote' : ' votes') + ' each' : '') });
    tied.forEach((p, i) => {
      if (st && st.setMood) st.setMood(p.id, 'nervous');
      if (st && st.act) setTimeout(() => { if (scene._alive && scene.stage) scene.stage.act(p.id, i % 2 ? 'flinch' : 'gasp'); }, 200 + 300 * i);
    });
    await Scenes.wait(1.5);
    if (!alive()) return done();
    Scenes.Cine.card(null);
    await scene._say(o.line || 'tableTie', { names: said }, o.claudiaShot || 'claudia');
    if (!alive()) return done();

    // the faces: a heartbeat under them, and one at a time
    const t0 = Date.now();
    build = Scenes.Drama.build(st, music, 'banish', { camera: false, bed: 'drumroll', ramp: 1.4 * tied.length + 1.5 });
    for (let i = 0; i < tied.length; i++) {
      const p = tied[i];
      if (!p.local) Scenes.Drama.shot(st, 'on:' + p.id, { cut: true, push: 0.1 + 0.06 * i, speed: 0.45 });
      Scenes.Cine.card({ kicker: i === tied.length - 1 && tied.length > 1 ? '…or' : 'Tied', title: nameOf(p), tone: 'slate',
                         cls: 'heat-' + Math.min(3, 1 + i), sub: each ? each + (each === 1 ? ' vote' : ' votes') : '' });
      if (st && st.act) st.act(p.id, ['handChest', 'neckRub', 'glance', 'shake'][i % 4]);
      if (typeof Input !== 'undefined' && Input.haptic) Input.haptic(20);
      await Scenes.wait(1.4);
      if (!alive()) return done();
    }
    // the table, looking at them
    Scenes.Drama.shot(st, o.wideShot || o.claudiaShot || 'claudia', { cut: true, push: 0.05, speed: 0.4 });
    Scenes.Cine.card({ kicker: 'Revote', title: tied.map(nameOf).join(' or '), tone: 'bad', cls: 'last heat-3',
                       sub: 'Only the tied names can go.' });
    await scene._say(o.after || 'tieStandoff', { names: said }, null);
    if (!alive()) return done();
    await Scenes.Drama.peak(build, { since: t0, min: 1, max: 4 });
    if (!alive()) return done();
    const wait = build.release('name', { n: 3 });
    build = null;
    if (wait) await Scenes.wait(wait);
    Scenes.Drama.hit(st, null, null, { shake: 0.4, haptic: 50 });
    await Scenes.wait(0.6);
    done();
  }

  /* Split at the fire, in the last round: a vote for each name, and
     the money right there. The table's stand-off, made bigger and
     slower, because this is the end of the game:

     the stop     the band and the fire both die; a long, dark beat
     the split    a heavy hit, ONE VOTE EACH (or A TIE), the room flinching
     the stakes   Claudia, on what this costs
     the faces    each tied face held long, the fire rising with each,
                  a heartbeat drumroll building under them
     the face-off every name on one card, A  vs  B  vs  C, and Claudia
                  telling them to look at each other
     the turn     silence, then the revote lands on the biggest hit

     Like `standoff`, it waits on nobody: the ballot is already open. */
  async function fireStandoff(scene, o = {}) {
    const s = Session.state;
    const f = s.finale;
    const st = scene.stage;
    const music = scene.music;
    const round = f.nameRound;
    const tied = (f.tied || []).map(id => Session.playerById(id)).filter(Boolean)
      .sort((a, b) => a.seat - b.seat);
    if (!tied.length || !scene._alive) return;
    const alive = () => scene._alive && Session.state.finale && Session.state.finale.nameRound === round;
    const counts = (f.lastTally && f.lastTally.counts) || {};
    const each = counts[tied[0].id] || 0;
    const names = tied.map(p => (p.local ? 'you' : p.name));
    const said = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names.join('');
    const votes = (n) => n + (n === 1 ? ' vote' : ' votes');
    const fire = (v) => { if (st && st.flare) st.flare(v); };
    const shot = o.claudiaShot || 'claudiaSide';
    let build = null;
    const done = () => { if (build) build.cancel(0.6); Scenes.Cine.card(null); fire(1); Scenes.Drama.end(st, music); };

    // the stop: the band goes, the fire sinks, and nobody moves
    if (music && music.silence) music.silence(true);
    fire(0.25);
    await Scenes.Drama.hush(st, null, shot, { hold: 1.8, silent: false, cut: true, push: 0.06, speed: 0.3 });
    if (!alive()) return done();

    // the split
    if (music && music.stinger) { music.silence(false); music.stinger('tie'); }
    Scenes.Drama.hit(st, null, null, { shake: 1.0, flash: 'rgba(200,16,30,.7)', haptic: 140 });
    if (st && st.shake) st.shake(0.8);
    fire(1.4);
    Scenes.Cine.card({ kicker: 'The fire is split', title: each === 1 ? 'ONE VOTE EACH' : 'A TIE', tone: 'bad',
                       cls: 'last heat-3', sub: tied.map(nameOf).join('  ·  ') + (each ? '  —  ' + votes(each) + ' each' : '') });
    tied.forEach((p, i) => {
      if (st && st.setMood) st.setMood(p.id, 'nervous');
      if (st && st.act) setTimeout(() => { if (scene._alive && scene.stage) scene.stage.act(p.id, ['gasp', 'flinch', 'handsFace'][i % 3]); }, 150 + 260 * i);
    });
    await Scenes.wait(2.0);
    if (!alive()) return done();
    fire(0.5);
    Scenes.Cine.card(null);
    await scene._say(o.line || 'voteNameTie', { names: said }, shot);
    if (!alive()) return done();
    await scene._say('fireTieStakes', {}, null);
    if (!alive()) return done();

    // the faces: held long, the fire coming up behind each, the drum under them
    const t0 = Date.now();
    build = Scenes.Drama.build(st, music, 'banish', { camera: false, bed: 'drumroll', ramp: 2.6 * tied.length + 3 });
    for (let i = 0; i < tied.length; i++) {
      const p = tied[i];
      if (!p.local) Scenes.Drama.shot(st, 'on:' + p.id, { cut: true, push: 0.16 + 0.06 * i, speed: 0.22 });
      fire(0.6 + 0.3 * i);
      Scenes.Cine.card({ kicker: i === tied.length - 1 && tied.length > 1 ? '…or' : 'Facing the fire', title: nameOf(p), tone: 'slate',
                         cls: 'heat-' + Math.min(3, 1 + i), sub: each ? votes(each) : '' });
      if (st && st.act) st.act(p.id, ['handChest', 'neckRub', 'shake', 'glance'][i % 4]);
      if (typeof Input !== 'undefined' && Input.haptic) Input.haptic(30);
      await Scenes.wait(2.6);
      if (!alive()) return done();
    }

    // the face-off: every name on one card, and the room looking
    Scenes.Drama.shot(st, o.wideShot || 'players', { cut: true, push: 0.08, speed: 0.3 });
    Scenes.Cine.card({ kicker: 'Face to face', title: tied.map(nameOf).join('  vs  '), tone: 'bad', cls: 'last heat-3',
                       sub: 'One of them leaves the game. Now.' });
    if (st && st.act) tied.forEach((p, i) => setTimeout(() => {
      if (scene._alive && scene.stage) scene.stage.act(p.id, 'glance');
    }, 300 * i));
    await scene._say('fireTieFaces', {}, null);
    if (!alive()) return done();

    // the turn: everything stops, and then the revote lands
    Scenes.Drama.shot(st, shot, { cut: true, push: 0.14, speed: 0.3 });
    Scenes.Cine.card({ kicker: 'Revote', title: tied.map(nameOf).join(' or '), tone: 'bad', cls: 'last heat-3',
                       sub: 'Only the tied names can go. Split again, and the castle draws.' });
    await scene._say(o.after || 'fireTieAgain', { names: said }, null);
    if (!alive()) return done();
    await Scenes.Drama.peak(build, { since: t0, min: 2, max: 6 });
    if (!alive()) return done();
    fire(0.2);
    const wait = build.release('name', { n: 5 });
    build = null;
    if (wait) await Scenes.wait(wait);
    if (!alive()) return done();
    Scenes.Drama.hit(st, null, null, { shake: 0.9, flash: 'rgba(220,10,24,.6)', haptic: 120 });
    if (st && st.shake) st.shake(0.6);
    fire(1.5);
    await Scenes.wait(1.0);
    done();
  }

  return { play, wheel, standoff, fireStandoff };
})();

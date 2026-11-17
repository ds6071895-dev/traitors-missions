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
                       sub: 'The table cannot choose.' });
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

  return { play, wheel };
})();

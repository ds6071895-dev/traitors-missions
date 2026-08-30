/* ------------------------------------------------------------------
   show.js — the director.

   Something has to decide what is on screen, and it should not be the
   thing that is on screen. This listens for the session changing phase
   and puts up whatever that phase is: a scene, a mission, or the
   verdict. Nothing else in the codebase knows the running order, which
   means changing it is changing the table in `go()` and nothing more.

   It also owns two joins between the show and the mission engine:

   - The pot. For the duration of a run, mission winnings stop going
     into the permanent prize pot and go into the night's pot instead —
     which is only banked if the night is survived. One swapped
     function, restored on the way out.
   - The pause between a mission ending and the next scene starting.
     The result is held rather than dispatched, so you read your own
     scoreboard and press Continue; the session only learns the mission
     finished when you say so. Dispatching it the instant the mission
     ended would change phase, and the phase change would tear the
     results screen down while you were still reading it.
------------------------------------------------------------------ */
const Show = (() => {

  let running = false;
  let offNet = null, restorePot = null;

  /* ---------------- starting and stopping ---------------- */

  /* `opts.jumpTo` is the testing door: it fast-forwards the run before
     anything is attached, so the scene that comes up is the one asked
     for rather than the hill with a queue behind it. */
  function begin(seed, opts = {}) {
    if (running) end();
    Session.start(seed);
    if (opts.jumpTo) Session.jumpTo(opts.jumpTo);
    attach();
    enter(Session.state.phase, true);
  }

  function resume() {
    if (running) return true;
    if (!Session.resume()) return false;
    attach();
    enter(Session.state.phase, true);
    return true;
  }

  function attach() {
    running = true;
    Net.connect(Net.LocalTransport);
    Bots.attach();
    /* The night's takings are the night's. `Session` adds them to its
       own pot when it is told the mission finished, so the sink here is
       deliberately a hole — banking twice would be worse than not
       banking at all. */
    restorePot = Missions.setPotSink(() => {});
    offNet = Net.on((e) => { if (e.type === 'phase') enter(e.phase, false); });
    GameState.logEvent('show', 'A new night begins', { seed: Session.state.seed });
  }

  function end(opts = {}) {
    if (!running) return;
    running = false;
    if (offNet) { offNet(); offNet = null; }
    if (restorePot) { restorePot(); restorePot = null; }
    Bots.detach();
    Net.disconnect();
    Scenes.stop();
    Missions.end();
    Voice.stop();
    Music.stopAll(0.6);
    if (opts.abandon) Session.abandon();
  }

  /* ---------------- what each phase looks like ---------------- */

  function enter(phase, first) {
    if (!running) return;
    /* The verdict is not a scene. It is a panel over the fire, which is
       still burning behind it and still has Claudia standing in it — so
       this has to bail out before the swap, or the last shot of the
       night gets torn down at the moment it pays off. */
    if (phase === 'verdict') return;
    const swap = () => {
      Scenes.stop();
      Missions.end();
      Screens.hideAll();
      switch (phase) {
        case 'hill':    Scenes.play(new HillScene()); break;
        case 'table':   Scenes.play(new RoundtableScene()); break;
        case 'finale':  Scenes.play(new FinaleScene()); break;
        case 'mission': launchMission(); break;
        default: break;
      }
    };
    if (first) swap(); else Screens.transition(swap, 380);
  }

  function launchMission() {
    const s = Session.state;
    const m = s.missions[s.missionAt];
    if (!m) { Net.send({ type: 'result', earned: 0, completed: false }); return; }
    const def = Missions.get(m.id);
    if (!def || def.locked) {
      // a mission that has gone away since the run was planned must not
      // strand the night
      console.warn('mission missing from the registry:', m.id);
      Net.send({ type: 'result', earned: 0, completed: false });
      return;
    }
    Missions.launch(m.id, {
      seed: m.seed, mode: m.mode, modId: m.modId, tod: 'auto', ghost: false,
    });
  }

  /* ---------------- the join back from a mission ----------------
     The result is handed in by whoever drew the scoreboard rather than
     picked up from a listener of our own. Both would be subscribed to
     the same event, and which of them ran first would depend on the
     order they happened to subscribe in — which is exactly the kind of
     thing that works until somebody moves a line. */

  function resultsAction(result) {
    if (!running || !result) return null;
    const s = Session.state;
    const last = s.missionAt >= s.missions.length - 1;
    const earned = Math.max(0, Math.round(result.earned || 0));
    const completed = !!result.completed;
    let sent = false;
    return {
      label: last ? 'To the fire' : 'To the round table',
      go() {
        if (sent) return;
        sent = true;
        Net.send({ type: 'result', earned, completed });
      },
    };
  }

  /* ---------------- the verdict ---------------- */

  function showVerdict(o) {
    const el = (id) => document.getElementById(id);
    const won = !!o.won;
    // the fire keeps burning behind this, but the letterbox has done its
    // job and would otherwise clip the panel on a short screen
    Scenes.Cine.bars(false);
    el('verdict-title').textContent = won ? 'YOU WIN' : 'YOU LOSE';
    el('verdict-title').className = 'verdict-title ' + (won ? 'win' : 'lose');
    el('verdict-role').textContent = o.role === 'traitor' ? 'You were a Traitor'
                                                          : 'You were a Faithful';
    el('verdict-role').className = 'verdict-role ' + o.role;

    el('verdict-line').textContent =
      o.reason === 'you-burned' ? 'You were banished, and the fire told them what you were.'
      : o.role === 'traitor'
        ? (won ? 'They never found you.' : 'They found you.')
        : (won ? (o.hadTraitor ? 'The Traitor was caught.'
                               : 'There was never a Traitor here at all.')
               : 'A Traitor was still sitting there when you ended it.');

    // everyone's cards, face up at last
    el('verdict-cast').innerHTML = o.roles.map(p => {
      const you = p.id === 'you';
      return `<div class="vc ${p.role} ${p.alive ? '' : 'out'}">`
           + `<span class="vc-name">${you ? 'You' : p.name}</span>`
           + `<span class="vc-role">${p.role === 'traitor' ? 'TRAITOR' : 'FAITHFUL'}</span>`
           + `<span class="vc-fate">${p.winner ? 'won ' + U.money(p.payout)
                                      : (p.alive ? 'no share' : 'banished — £0')}</span>`
           + '</div>';
    }).join('');

    el('verdict-pot').textContent = U.money(o.pot);
    el('verdict-banked').textContent = won ? '+' + U.money(o.banked) : 'lost';
    el('verdict-banked').className = 'verdict-banked ' + (won ? 'win' : 'lose');
    el('verdict-total').textContent = U.money(GameState.prizePot);

    Screens.show('verdict');
    if (won) AudioBus.play('reveal-faithful');
  }

  return { begin, resume, end, showVerdict, resultsAction,
           get running() { return running; } };
})();

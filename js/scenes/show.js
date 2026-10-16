/* ------------------------------------------------------------------
   show.js — the director.

   Something has to decide what is on screen, and it should not be the
   thing that is on screen. This listens for the session changing phase
   and puts up whatever that phase is: a scene, or the verdict. Nothing
   else in the codebase knows the running order, which means changing
   it is changing the table in `enter()` and nothing more.
------------------------------------------------------------------ */
const Show = (() => {

  let running = false;
  let transitionAbort = null;
  let isHost = true;
  let solo = false;                 // a rehearsal night: you and two bots
  let offNet = null;
  let verdictGuard = null;      // see `armVerdictGuard`

  /* ---------------- starting and stopping ---------------- */

  /* A night belongs to a party. The host draws the seed and the
     seating and tells the other two; all three arrive here with the
     identical arguments, which is why nothing below has to care which
     kind of client it is running on.

     `opts.jumpTo` is the testing door: it fast-forwards the run before
     anything is attached, so the scene that comes up is the one asked
     for rather than the hill with a queue behind it. */
  function beginParty(opts = {}) {
    if (running) end();
    isHost = !!opts.host;
    /* `opts.solo` is `Bots` and only `Bots`: one machine, two of the
       three contestants driven from `bots.js`, and the two rehearsal
       levers — a chosen Traitor and a partial running order — which
       `Session` refuses to honour without it. Nothing on any screen can
       set it. */
    solo = !!opts.solo;
    Session.startParty({
      seed: opts.seed,
      players: opts.players || [],
      mode: isHost ? 'host' : 'guest',
      rehearsal: solo,
      parts: opts.parts,
      traitorSeat: opts.traitorSeat,
      ai: opts.ai || null,
    });
    /* With an AI Claudia in the room, every line of hers — yours alone
       as well as the room's — is read in her own voice by the room
       server, to each browser separately. See `Voice`. */
    Voice.setRemote(!!(Session.state.ai && Session.state.ai.claudia));
    if (isHost && !solo && typeof AIDirector !== 'undefined') AIDirector.start();
    if (opts.jumpTo && isHost) Session.jumpTo(opts.jumpTo);
    attach();
    enter(Session.state.phase, true);
  }

  function attach() {
    running = true;
    /* The one line that decides what kind of client this is. Above it
       nothing knows, and nothing needs to. */
    Net.connect(solo ? Transports.SoloTransport
                     : (isHost ? Transports.HostTransport : Transports.GuestTransport));
    VoiceChat.init();
    VoiceChat.listen();
    offNet = Net.on((e) => {
      if (e.type === 'phase') enter(e.phase, !!e.catchUp);
      else if (e.type === 'cue' && e.voice && e.text) caption(e);
    });
    GameState.logEvent('show', 'A new night begins', { seed: Session.state.seed });
  }

  function end(opts = {}) {
    if (!running) return;
    running = false;
    if (transitionAbort) transitionAbort.abort();
    const errorPanel=document.getElementById('destination-error');if(errorPanel)errorPanel.remove();
    clearTimeout(verdictGuard);
    verdictGuard = null;
    // a rehearsal's two bots have nothing left to act in
    if (solo && typeof Bots !== 'undefined') Bots.stop();
    solo = false;
    if (offNet) { offNet(); offNet = null; }
    RoomUI.hideAll();
    VoiceChat.openFloor();
    Net.disconnect();
    Scenes.stop();
    if (typeof ChoreGames !== 'undefined') ChoreGames.close(false);
    Voice.stop();
    Voice.setRemote(false);
    if (typeof AIDirector !== 'undefined') AIDirector.stop();
    Music.stopAll(0.6);
    if (opts.abandon) Session.abandon();
  }

  /* Live AI speech, captioned on every screen, with the speaker's name.
     Claudia's scripted lines already have their subtitle from the beat
     list, so the host marks those `quiet` and they are not shown twice. */
  let captionTimer = null;
  function caption(e) {
    if (e.quiet) return;
    // by day, a voice from the other end of the house is not on your screen
    if (Array.isArray(e.near)) {
      const me = Session.state && Session.state.players.find(p => p.local);
      if (me && me.alive && e.id !== me.id && e.near.indexOf(me.id) < 0) return;
    }
    const p = e.id && e.id !== 'claudia' ? Session.playerById(e.id) : null;
    const who = e.id === 'claudia' ? 'Claudia' : (p ? p.name : '');
    if (Voice.speaking && who === 'Claudia') return;    // a scripted line is on screen
    Voice.show(who, e.text);
    clearTimeout(captionTimer);
    captionTimer = setTimeout(() => { if (!Voice.speaking) Voice.clear(); }, Math.max(2600, e.text.length * 75));
  }

  /* ---------------- what each phase looks like ---------------- */

  function enter(phase, first) {
    if (!running) return;
    /* The verdict is not a scene. It is a panel over the fire, which is
       still burning behind it and still has Claudia standing in it — so
       this has to bail out before the swap, or the last shot of the
       night gets torn down at the moment it pays off. */
    if (phase === 'verdict') {
      /* A live finale owns its last Claudia line before opening this
         panel. A reconnect has no ceremony left to resume, so its
         catch-up snapshot opens the already-personalised verdict now. */
      if (first && Session.state.outcome) { showVerdict(Session.state.outcome); return; }
      armVerdictGuard();
      return;
    }
    if (transitionAbort) transitionAbort.abort();
    const controller = new AbortController();
    transitionAbort = controller;
    const swap = async () => {
      if (controller.signal.aborted || !running) return;
      Scenes.stop();
      Screens.hideAll();
      if (phase === 'hill') Scenes.play(new HillScene());
      else if (phase === 'tasks') Scenes.play(new TasksScene());
      else if (phase === 'finale') Scenes.play(new FinaleScene());
      else if (phase === 'night') Scenes.play(new NightScene());
      else if (phase === 'breakfast') Scenes.play(new BreakfastScene());
      else if (phase === 'table') Scenes.play(new RoundtableScene());
    };
    /* A cut, not a dissolve: a quarter of a second of black between one
       room and the next is all the show needs. */
    Screens.cover(swap, controller.signal, first ? 0 : 260).catch(showBuildError);
  }

  function showBuildError(error) {
    console.error('Scene build failed', error);
    if (!running) return;
    let panel = document.getElementById('destination-error');
    if (!panel) { panel = document.createElement('div'); panel.id = 'destination-error'; panel.className = 'destination-error'; document.body.appendChild(panel); }
    panel.innerHTML = '<p>We could not prepare the next room.</p><button>Retry</button><button>Leave the night</button>';
    panel.children[1].onclick = () => { panel.remove(); enter(Session.state.phase, true); };
    panel.children[2].onclick = () => { panel.remove(); end({ abandon: true }); Screens.show('play'); };
  }

  /* ---------------- the verdict ---------------- */

  /* The backstop, and only ever that.

     Every ordinary ending has a ceremony that opens the panel itself,
     because the room it happens in owns the last thing Claudia says and
     a director that barged in over it would cut her off. What none of
     them can promise is that the ceremony *finishes* — a scene torn
     down mid-beat, a barrier that outlived its room, a browser that
     came back from the dead half a second too late — and a night that
     is over inside the session but has never put a panel on the screen
     is a night nobody can leave.

     So the phase arms a watcher instead of a panel, and what it watches
     is whether the room is still talking. A ceremony finishing is a
     ceremony saying something every few seconds; the longest silence
     inside one is the held beat before a pouch answers, which is a
     handful of them. A stalled one is silent for as long as you leave
     it. Eighteen unbroken seconds of nothing, with the night already
     over in the session and no panel on the screen, is not a pause.

     Whoever gets there first wins: `showVerdict` cancels this, so on
     every ordinary night it costs a few timers and does nothing. */
  const GUARD_TICK = 3000, GUARD_QUIET = 6;

  function armVerdictGuard() {
    clearTimeout(verdictGuard);
    let quiet = 0;
    const tick = () => {
      verdictGuard = setTimeout(() => {
        if (!running) return;
        const s = Session.state;
        if (!s || s.phase !== 'verdict' || !s.outcome) return;
        if (Screens.current === 'verdict') return;
        const talking = typeof Voice !== 'undefined' && Voice.speaking;
        quiet = talking ? 0 : quiet + 1;
        if (quiet < GUARD_QUIET) { tick(); return; }
        console.warn('verdict panel was never opened by a ceremony — opening it');
        Voice.clear();
        showVerdict(s.outcome);
      }, GUARD_TICK);
    };
    tick();
  }

  function showVerdict(o) {
    clearTimeout(verdictGuard);
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
      /* How it ended for you, which on a night of eight is as often
         "you were not there for the end of it" as anything else. */
      o.reason === 'exposed'
        ? (o.role === 'traitor'
            ? 'You never used the poison, and Claudia exposed you.'
            : 'The last Traitor lost their nerve. You never had to name them.')
      : o.reason === 'you-burned' ? 'You were banished, and the fire told them what you were.'
      : o.fate === 'murdered' ? (o.traitorAlive ? 'You were murdered, and the Traitors got away with it.'
                                                 : 'You were murdered — but the ones who did it were caught.')
      : o.fate === 'banished' ? (o.role === 'traitor' ? 'They found you at the round table.'
                                                      : 'They banished you, and you were Faithful all along.')
      : o.fate === 'left' ? 'You left the castle before the end.'
      : o.role === 'traitor'
        ? (won ? 'They never found you.' : 'They found you.')
        : (won ? (o.hadTraitor ? (o.reason === 'all-found' ? 'Every Traitor was caught.'
                                                               : 'The Traitors were caught.')
                               : 'There was never a Traitor here at all.')
               : 'A Traitor was still sitting there when you ended it.');

    // everyone's cards, face up at last
    const me = Session.state && Session.state.players.find(p => p.local);
    el('verdict-cast').innerHTML = o.roles.map(p => {
      const you = !!(me && p.id === me.id);
      return `<div class="vc ${p.role} ${p.alive ? '' : 'out'}">`
           + `<span class="vc-name">${you ? 'You' : p.name}</span>`
           + `<span class="vc-role">${p.role === 'traitor' ? 'TRAITOR' : 'FAITHFUL'}</span>`
           + `<span class="vc-fate">${p.winner ? 'won ' + U.money(p.payout)
                                      : (p.alive ? 'no share'
                                         : (p.out === 'murdered' ? 'murdered — £0'
                                           : p.out === 'left' ? 'left — £0' : 'banished — £0'))}</span>`
           + '</div>';
    }).join('');

    el('verdict-pot').textContent = U.money(o.pot);
    el('verdict-banked').textContent = won ? '+' + U.money(o.banked) : 'lost';
    el('verdict-banked').className = 'verdict-banked ' + (won ? 'win' : 'lose');
    el('verdict-total').textContent = U.money(GameState.prizePot);

    Screens.show('verdict');
    /* The band that played the verdict carries on under the panel as
       the credits, for as long as anybody sits with it. With no band
       playing, the old chime still marks a win. */
    const V = Music.verdictCue(o);
    if (!Music.sectionAll(V.credits, { at: 'bar', glide: 3 }) && won) AudioBus.play('reveal-faithful');
  }

  return { beginParty, end, showVerdict,
           get running() { return running; },
           get solo() { return solo; },
           get isHost() { return isHost; } };
})();

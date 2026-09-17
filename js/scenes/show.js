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
  let transitionAbort = null;
  let isHost = true;
  let solo = false;                 // a rehearsal night: you and two bots
  let offNet = null, restorePot = null;
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
    /* A fresh night, a fresh card, and — this is the part that matters
       — an unmarked one with its window open again. The deck holds
       that mark on this machine and nothing else clears it. */
    if (typeof Agendas !== 'undefined') Agendas.begin();
    Session.startParty({
      seed: opts.seed,
      players: opts.players || [],
      mode: isHost ? 'host' : 'guest',
      rehearsal: solo,
      parts: opts.parts,
      traitorSeat: opts.traitorSeat,
    });
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
    /* The night's takings are the night's. `Session` adds them to its
       own pot when it is told the mission finished, so the sink here is
       deliberately a hole — banking twice would be worse than not
       banking at all. */
    restorePot = Missions.setPotSink(() => {});
    offNet = Net.on((e) => { if (e.type === 'phase') enter(e.phase, !!e.catchUp); });
    GameState.logEvent('show', 'A new night begins', { seed: Session.state.seed });
  }

  function end(opts = {}) {
    if (!running) return;
    running = false;
    if (transitionAbort) transitionAbort.abort();
    Journey.stop();
    const errorPanel=document.getElementById('destination-error');if(errorPanel)errorPanel.remove();
    clearTimeout(verdictGuard);
    verdictGuard = null;
    // a rehearsal's two bots have nothing left to act in
    if (solo && typeof Bots !== 'undefined') Bots.stop();
    solo = false;
    if (offNet) { offNet(); offNet = null; }
    if (restorePot) { restorePot(); restorePot = null; }
    MissionNet.detach();
    RoomUI.hideAll();
    VoiceChat.openFloor();
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
    if (phase === 'verdict') {
      /* A live finale owns its last Claudia line before opening this
         panel. A reconnect has no ceremony left to resume, so its
         catch-up snapshot opens the already-personalised verdict now. */
      if (first && Session.state.outcome) { showVerdict(Session.state.outcome); return; }
      armVerdictGuard();
      return;
    }
    if (transitionAbort) transitionAbort.abort();
    const controller=new AbortController();transitionAbort=controller;
    const swap=async()=>{
      if(controller.signal.aborted||!running)return;
      let prepared=null;
      if(phase==='mission'&&Journey.active)prepared=Journey.takePrepared();
      let pickup=null;
      if(phase==='travel'&&Session.state.travel.direction==='return')pickup=Missions.releaseForTravel();
      Journey.stop();Scenes.stop();
      if(!prepared&&!pickup)Missions.end();
      Screens.hideAll();
      if(phase==='hill')Scenes.play(new HillScene());
      else if(phase==='finale')Scenes.play(new FinaleScene());
      else if(phase==='travel')await Journey.start({missionOpts:missionOptions()},pickup);
      else if(phase==='mission'){
        try { if(prepared)Missions.activate(prepared);else launchMission(); }
        catch(error){showBuildError(error);}
      }
    };
    Screens.cover(swap,controller.signal,first?0:380).catch(showBuildError);
  }

  function showBuildError(error){
    console.error('Scene build failed',error);
    if(!running)return;
    let panel=document.getElementById('destination-error');
    if(!panel){panel=document.createElement('div');panel.id='destination-error';panel.className='destination-error';document.body.appendChild(panel);}
    panel.innerHTML='<p>We could not prepare the destination.</p><button>Retry</button><button>Leave the night</button>';
    panel.children[1].onclick=()=>{panel.remove();enter(Session.state.phase,true);};
    panel.children[2].onclick=()=>{panel.remove();end({abandon:true});Screens.show('play');};
  }
  function missionOptions(){
    const s=Session.state,m=s.missions[s.missionAt];
    return {seed:m.seed,mode:m.mode,modId:m.modId,tod:'auto',ghost:false,
      party:!solo&&typeof Party!=='undefined'&&Party.connected,host:isHost,
      players:s.players.map(p=>({id:p.id,name:p.name,look:p.look,local:!!p.local,alive:p.alive,seat:p.seat})),
      agenda:Session.myAgenda()};
  }
  function launchMission(){
    const m=Session.state.missions[Session.state.missionAt];
    if(!m||!Missions.get(m.id))throw new Error('Destination unavailable');
    Missions.launch(m.id,missionOptions());
  }

  /* ---------------- the join back from a mission ----------------
     The result is handed in by whoever drew the scoreboard rather than
     picked up from a listener of our own. Both would be subscribed to
     the same event, and which of them ran first would depend on the
     order they happened to subscribe in — which is exactly the kind of
     thing that works until somebody moves a line. */

  /* The board decides the money now, not your own scoreboard: three
     people played that mission and the pot is what the three of them
     managed between them. A solo fallback is kept for the case where
     the board never arrived, so a dropped peer cannot strand a night. */
  function resultsAction(result, board) {
    if (!running || !result) return null;
    RoomUI.hideAgenda();
    if (Session.isHost) Net.send({ type: 'missionFinished' });
    const s = Session.state;
    const earned = board
      ? Math.max(0, Math.round(board.earned || 0))
      : Math.max(0, Math.round(result.earned || 0));
    const completed = board ? !!board.completed : !!result.completed;
    const players = board ? (board.players || []) : [];
    let sent = false;
    return {
      label: nextRoomLabel(),
      go() {
        if (sent) return;
        sent = true;
        Net.send({ type: 'readyResult', earned, completed, players });
      },
    };
  }

  /* What the Continue button says. There is one mission and one room
     after it now, so this is nearly always "to the fire" — but a
     rehearsal can switch the fire off, and a button offering a room
     nobody is going to sit in is worse than a plain one.
     `Session.state.parts` stays the authority on what is still to
     come. */
  function nextRoomLabel() {
    const s = Session.state;
    const parts = (s && s.parts) || [];
    return parts.indexOf('finale') >= 0 ? 'Return to the castle' : 'To the verdict';
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
      /* Exposed by an unfinished task. It is its own ending and it
         needs its own sentence — "they found you" is not what
         happened, and the Traitor should be told exactly what did. */
      o.reason === 'agenda'
        ? (o.role === 'traitor'
            ? 'You left the work undone, and Claudia counted it.'
            : 'The Traitor fumbled the job. You never had to name them.')
      : o.reason === 'you-burned' ? 'You were banished, and the fire told them what you were.'
      : o.role === 'traitor'
        ? (won ? 'They never found you.' : 'They found you.')
        : (won ? (o.hadTraitor ? 'The Traitor was caught.'
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
                                      : (p.alive ? 'no share' : 'banished — £0')}</span>`
           + '</div>';
    }).join('');

    paintReckoning(o);

    el('verdict-pot').textContent = U.money(o.pot);
    el('verdict-banked').textContent = won ? '+' + U.money(o.banked) : 'lost';
    el('verdict-banked').className = 'verdict-banked ' + (won ? 'win' : 'lose');
    el('verdict-total').textContent = U.money(GameState.prizePot);

    Screens.show('verdict');
    if (won) AudioBus.play('reveal-faithful');
  }

  /* ---------------- the reckoning ----------------
     The one thing in this game that nothing in this game can check.

     The Traitor's card was a thing to say out loud on a microphone.
     Nothing on the host can hear a microphone, so the card was marked
     by the only person who knew — and there has been no way, all
     night, for anybody to find out whether that mark was honest.

     This is that way. It is printed once, here, at the end, when every
     role is already face up and there is nothing left to protect: the
     card, word for word, and whether they claimed they said it. The
     two people who were on that microphone with them read it and know
     immediately. Claudia never says a word of this — she stopped
     talking two beats ago, and a line read out by a presenter would
     make it an accusation. Printed on a board after the money has been
     paid, it is a fact, and what to do about it is theirs.

     It is deliberately not scored. Nobody wins or loses anything on
     it. It is the reason to have been honest, and that is all it needs
     to be. */
  function paintReckoning(o) {
    const box = document.getElementById('verdict-task');
    if (!box) return;
    const a = o && o.agenda;
    box.hidden = true;
    box.innerHTML = '';
    if (!a || !a.text) return;
    const me = Session.state && Session.state.players.find(p => p.local);
    const yours = !!(me && a.playerId === me.id);
    const esc = (v) => String(v === undefined || v === null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const who = yours ? 'You were' : esc(a.name || 'The Traitor') + ' was';
    box.className = 'verdict-task ' + (a.marked ? 'marked' : 'unmarked');
    box.innerHTML =
        '<div class="vt-head">The task</div>'
      + '<div class="vt-who">' + who + ' asked to do this, out loud, '
      + 'while all three of you were on the microphone.</div>'
      + '<div class="vt-text">' + esc(a.text) + '</div>'
      + '<div class="vt-mark">'
      + (a.marked ? (yours ? 'You marked it done.'
                           : 'They marked it done. You were there — decide for yourselves.')
                  : (yours ? 'You never marked it.'
                           : 'They never marked it.'))
      + '</div>';
    box.hidden = false;
  }

  return { beginParty, end, showVerdict, resultsAction,
           get running() { return running; },
           get solo() { return solo; },
           get isHost() { return isHost; } };
})();

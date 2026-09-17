/* ------------------------------------------------------------------
   roomui.js — the three overlays that only exist because there are
   other people in the room.

   None of them is a screen. They sit over whatever is showing, the
   same way the subtitle does, because all three need to be readable
   while a vote panel is up or a mission is running.

   - The floor bar: who may speak, how long is left, and whether your
     microphone is actually open. At the fire that is one name and
     thirty seconds; at the round table it is all three of you at once
     for as long as the discussion lasts. The clock is drawn from the
     host's `endsAt`, never counted locally, so all three people see
     the same number.
   - The board: everybody's numbers from the mission that just
     finished. It never accuses anyone. It is the evidence a Faithful
     argues from and the thing a Traitor has to explain.
   - The task chip: your own agenda, visible only to you, with its
     progress on it so nobody ever fails one by forgetting it existed.
------------------------------------------------------------------ */
const RoomUI = (() => {

  const el = (id) => document.getElementById(id);
  let floorEnds = 0, floorWho = null, floorTotal = 30, floorOpen = false, tick = null;

  const esc = (s) => String(s === undefined || s === null ? '' : s)
    .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------------- the floor ---------------- */

  function showFloor(e) {
    const bar = el('floor-bar');
    if (!bar) return;
    if (!e || e.done || (!e.playerId && !e.all)) { hideFloor(); return; }
    if (e.all) { showOpenFloor(e, bar); return; }

    floorOpen = false;
    floorWho = e.playerId;
    floorEnds = e.endsAt || 0;
    floorTotal = e.seconds || 30;
    const p = Session.playerById(e.playerId);
    const mine = p && p.local;

    bar.classList.add('on');
    bar.classList.remove('open');
    bar.classList.toggle('mine', !!mine);
    el('floor-who').textContent = mine ? 'YOU ARE SPEAKING'
                                       : ((p ? p.name : 'Somebody') + ' is speaking');

    /* The only thing you can press during your own thirty seconds is
       "stop". There is nothing to choose here — the thing you are
       doing with the time is talking. */
    const done = el('floor-done');
    if (done) {
      done.hidden = !mine;
      done.disabled = false;
      done.textContent = "I've said enough";
      done.onclick = mine ? () => {
        AudioBus.play('ui-click');
        Net.send({ type: 'yieldFloor', playerId: e.playerId });
      } : null;
    }

    /* The microphone follows the floor, and it is enforced where it is
       sent rather than where it is heard. */
    VoiceChat.setFloor(e.playerId);
    paintTick();
    if (!tick) tick = setInterval(paintTick, 120);
  }

  /* The round table. Nobody holds this floor, so the bar is not about
     whose turn it is — it is the clock on the discussion and a button
     that says you are done with it. Every microphone stays open the
     whole time, including while somebody else is mid-sentence. */
  function showOpenFloor(e, bar) {
    floorOpen = true;
    floorWho = null;
    floorEnds = e.endsAt || 0;
    floorTotal = e.seconds || 150;

    const me = Session.state ? Session.state.players.find(p => p.local) : null;
    const alive = Session.alive ? Session.alive() : [];
    const ready = e.ready || [];
    const mineReady = !!(me && ready.indexOf(me.id) >= 0);

    bar.classList.add('on', 'open');
    bar.classList.remove('mine');
    el('floor-who').textContent = ready.length
      ? 'ANYONE MAY SPEAK — ' + ready.length + ' of ' + alive.length + ' finished'
      : 'ANYONE MAY SPEAK — TALK OVER EACH OTHER';

    const done = el('floor-done');
    if (done) {
      done.hidden = !(me && me.alive);
      done.disabled = mineReady;
      done.textContent = mineReady ? 'Waiting for the others…' : "I've said enough";
      done.onclick = mineReady ? null : () => {
        AudioBus.play('ui-click');
        Net.send({ type: 'yieldFloor', playerId: me ? me.id : null });
      };
    }

    VoiceChat.openFloor();
    paintTick();
    if (!tick) tick = setInterval(paintTick, 120);
  }

  function hideFloor() {
    const bar = el('floor-bar');
    floorWho = null; floorEnds = 0; floorOpen = false; floorTotal = 30;
    if (tick) { clearInterval(tick); tick = null; }
    const done = el('floor-done');
    if (done) { done.hidden = true; done.disabled = false; done.onclick = null; }
    if (bar) bar.classList.remove('on', 'mine', 'open');
    VoiceChat.openFloor();
  }

  const mmss = (s) => Math.floor(s / 60) + ':'
    + (s % 60 < 10 ? '0' : '') + Math.floor(s % 60);

  function paintTick() {
    if (!floorEnds) return;
    const left = Math.max(0, (floorEnds - Date.now()) / 1000);
    el('floor-clock').textContent = mmss(left);
    const fill = el('floor-fill');
    if (fill) fill.style.transform = 'scaleX(' + U.clamp(left / floorTotal, 0, 1) + ')';
    const mic = el('floor-mic');
    if (mic) {
      const live = VoiceChat.available && !VoiceChat.gagged;
      mic.textContent = !VoiceChat.available ? 'no mic'
                      : (live ? 'mic live' : 'mic off');
      mic.className = 'fb-mic' + (live ? ' live' : '');
    }
  }

  /* ---------------- the board ---------------- */

  /* One renderer, two homes: the overlay at the round table and a
     block inside the results panel. They are the same numbers and
     should never drift into being two different tables. */
  function boardHTML(board) {
    if (!board) return '';
    const rows = board.rows || board.players || [];
    if (!rows.length) return '';
    const cols = board.columns || [];
    const head = '<div class="bd-row bd-head"><span class="bd-name"></span>'
      + cols.map(c => '<span>' + esc(c) + '</span>').join('') + '</div>';
    const body = rows.map(r => {
      /* A night knows who everybody is; a mission party has no session
         at all, so "you" falls back to the peer id — which is the same
         id either way, because a player id *is* a peer id. */
      const p = typeof Session !== 'undefined' ? Session.playerById(r.playerId) : null;
      const mine = typeof Party !== 'undefined' ? Party.selfId() : null;
      const you = p ? !!p.local : (!!mine && r.playerId === mine);
      const out = p && !p.alive;
      return '<div class="bd-row' + (you ? ' you' : '') + (out ? ' out' : '') + '">'
        + '<span class="bd-name">' + esc(you ? 'You' : (r.name || '—')) + '</span>'
        + (r.cells || []).map(c => '<span>' + esc(c) + '</span>').join('')
        + '</div>';
    }).join('');
    return head + body;
  }

  const boardCols = (board) => ((board && board.columns) || []).length;

  function showBoard(board) {
    const wrap = el('board');
    if (!wrap) return;
    const html = boardHTML(board);
    if (!html) { hideBoard(); return; }
    el('board-title').textContent = (board && board.missionName) || 'The mission';
    el('board-grid').style.setProperty('--bd-cols', String(boardCols(board)));
    el('board-grid').innerHTML = html;
    wrap.classList.add('on');
  }

  function hideBoard() {
    const wrap = el('board');
    if (wrap) wrap.classList.remove('on');
  }

  /* ---------------- the field ----------------
     Everybody's standing, live, during a mission. It is a scoreboard
     and it is also the evidence: every card in the agenda deck moves a
     row on this strip at the moment it is being performed, and half of
     them are only survivable because a very good player can move it
     back. A row is `{ playerId, name, value, meter, dim }`. */

  function showField(rows) {
    const wrap = el('field');
    if (!wrap) return;
    if (!rows || rows.length < 2) { hideField(); return; }
    wrap.innerHTML = rows.map(r => {
      const p = typeof Session !== 'undefined' ? Session.playerById(r.playerId) : null;
      const you = p && p.local;
      const meter = r.meter === undefined || r.meter === null ? ''
        : '<span class="fd-meter"><i style="transform:scaleX('
          + U.clamp(r.meter, 0, 1).toFixed(3) + ')"></i></span>';
      return '<div class="fd-row' + (you ? ' you' : '') + (r.dim ? ' dim' : '') + '">'
        + '<span class="fd-name">' + esc(you ? 'You' : r.name) + '</span>'
        + '<span class="fd-val">' + esc(r.value) + '</span>'
        + meter + '</div>';
    }).join('');
    wrap.classList.add('on');
  }

  function hideField() {
    const wrap = el('field');
    if (wrap) { wrap.classList.remove('on'); wrap.innerHTML = ''; }
  }

  /* ---------------- your task ----------------
     Only ever drawn from `Session.myAgenda()`, which returns null for
     everybody who is not a Traitor — so there is no branch here that
     could accidentally render somebody else's card.

     The deck is voice now. Nothing on this machine, or on the host, or
     anywhere else in this game, can hear a microphone, so this panel
     is not reporting a check somebody else is running — it *is* the
     check. Four lines, and a Traitor reading them at speed is asking
     four questions:

       task    the card, in full. Longer than it used to be: half the
               deck is a whole sentence you have to say word for word.
       prog    the short form, for glancing at.
       mark    the button. This is the one that matters.
       state   whether it counted, said in words rather than left to a
               colour: NOT SAID YET while the run is still going, SAID
               once you have marked it, and NOT SAID once the run is
               over and you never did — which is the state that decides
               the rest of the night.

     Two things about the button, both of them deliberate:

     - It asks twice. The first press arms it and the second commits,
       and an armed button disarms itself after a few seconds. An
       accidental mark is a lie you did not decide to tell, and the
       whole of this deck rests on the difference.
     - It dies with the run. `Agendas` latches its window shut the
       moment the numbers stop, so the last thing this panel does is go
       grey — you cannot settle up on a card once you have seen how the
       mission went.

     The card still carries its alibi and this deliberately does not
     draw it. Spelled out on the HUD it reads as a second instruction —
     say this, then do that — when it is nothing of the kind: it is the
     harder way to do the one task, and a Traitor who is handed it in
     words plays the sentence instead of the room. */

  const ARM_MS = 4000;
  let armedUntil = 0;
  let markWired = false;

  /* Every input path the game has, aimed at one button. A phone taps
     it and a keyboard presses T. The key is polled rather than bound,
     because a mission owns the frame and `pressedThisFrame` only exists
     inside one. */
  function wireMark() {
    if (markWired) return;
    const b = el('agenda-mark');
    if (!b) return;
    markWired = true;
    b.addEventListener('click', (ev) => { ev.preventDefault(); pressMark(); });
  }

  function pressMark() {
    if (!Session.state || Session.state.phase !== 'mission' || Session.state.taskClosed) return;
    const card = Session.myAgenda ? Session.myAgenda() : null;
    if (!card || typeof Agendas === 'undefined') return;
    if (Agendas.isClosed() || Agendas.isMarked(card.id)) return;
    const now = Date.now();
    if (now > armedUntil) {          // first press: arm it, commit nothing
      armedUntil = now + ARM_MS;
      AudioBus.play('ui-hover');
      showAgenda();
      return;
    }
    armedUntil = 0;
    if (!Agendas.mark(card.id)) { showAgenda(); return; }
    AudioBus.play('ui-click');
    /* The host is told separately and answers nothing. It does not go
       into the shared state and it emits no event, because a packet
       leaving this machine at the exact moment somebody says the thing
       they were told to say is a tell the other two could watch for. */
    Net.send({ type: 'taskDone' });
    showAgenda();
  }

  /* Called from inside the mission's own frame, where `pressedThisFrame`
     is meaningful. Everything else about this panel is event-driven;
     this one poll is what gives it a keyboard and a pad. */
  function pollMark() {
    if (typeof Input === 'undefined' || !Input.pressed('task')) return;
    pressMark();
  }

  function showAgenda() {
    const chip = el('agenda-chip');
    if (!chip) return;
    const card = Session.myAgenda ? Session.myAgenda() : null;
    if (!card) { hideAgenda(); return; }
    wireMark();

    const A = typeof Agendas !== 'undefined' ? Agendas : null;
    const done = !!(A && A.isMarked(card.id));
    const closed = !!(A && A.isClosed());
    const failed = closed && !done;
    const armed = !done && !closed && Date.now() < armedUntil;

    el('agenda-text').textContent = card.text || '';
    const prog = el('agenda-prog');
    if (prog) {
      prog.textContent = card.hud || '';
      prog.hidden = !prog.textContent;
    }

    const b = el('agenda-mark');
    if (b) {
      const playable=Session.state && Session.state.phase==='mission' && !Session.state.taskClosed;
      b.disabled = done || closed || !playable;
      b.classList.toggle('armed', armed);
      b.textContent = !playable && !closed ? 'Available during the mission' : done   ? 'Marked — it counted'
                    : closed ? 'Too late'
                    : armed  ? 'Press again to confirm'
                             : 'I said it';
    }

    const state = el('agenda-state');
    if (state) {
      /* No microphone is its own answer, and it is worth saying out
         loud rather than letting somebody press a button they had no
         way of earning. */
      const noMic = typeof VoiceChat !== 'undefined' && !VoiceChat.available;
      state.textContent = failed ? 'NOT SAID — you left it undone'
                        : done   ? 'SAID — and only you know'
                        : noMic  ? 'NO MICROPHONE — nobody can hear you say it'
                                 : 'NOT SAID YET';
    }

    chip.classList.toggle('done', done);
    chip.classList.toggle('failed', failed);
    chip.hidden = false;
    chip.classList.add('on');
  }

  function hideAgenda() {
    const chip = el('agenda-chip');
    if (!chip) return;
    chip.classList.remove('on');
    chip.hidden = true;
  }

  /* ---------------- the microphone button ----------------
     Always there once there is somebody to talk to, on every screen and
     inside every mission — a mute you have to leave the game to reach
     is a mute nobody uses in the moment they need it. */

  function paintMic() {
    const b = el('mic-btn');
    if (!b) return;
    const inParty = typeof Party !== 'undefined' && Party.connected;
    b.hidden = !inParty;
    if (!inParty) return;
    const off = !VoiceChat.available || VoiceChat.gagged;
    b.classList.toggle('muted', off);
    b.title = !VoiceChat.available ? 'No microphone'
            : (VoiceChat.muted ? 'Unmute microphone (V)' : 'Mute microphone (V)');
  }

  async function toggleMic() {
    if (typeof Party === 'undefined' || !Party.connected) return;
    if (!VoiceChat.available) await VoiceChat.start();
    else VoiceChat.toggleMuted();
    paintMic();
  }

  function init() {
    const b = el('mic-btn');
    if (b) b.onclick = toggleMic;
    VoiceChat.on('state', paintMic);
    /* One place polls the key and the pad button, rather than every
       mission growing its own copy of this. */
    Engine.addUpdater(() => {
      if (Input.pressed('mic')) toggleMic();
    });
    paintMic();
  }

  function hideAll() {
    hideFloor(); hideBoard(); hideAgenda(); hideField();
  }

  return { init, toggleMic, paintMic,
           showFloor, hideFloor, showBoard, hideBoard, showAgenda, hideAgenda,
           pollMark,
           hideAll, paintTick, boardHTML, boardCols, showField, hideField,
           get floorWho() { return floorWho; },
           get floorOpen() { return floorOpen; } };
})();

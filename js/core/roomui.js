/* ------------------------------------------------------------------
   roomui.js — the three overlays that only exist because there are
   other people in the room.

   None of them is a screen. They sit over whatever is showing, the
   same way the subtitle does, because they need to be readable while a
   vote panel is up.

   - The floor bar: who may speak, how long is left, and whether your
     microphone is actually open. At the fire that is one name and
     thirty seconds; at the round table it is all three of you at once
     for as long as the discussion lasts. The clock is drawn from the
     host's `endsAt`, never counted locally, so all three people see
     the same number.
   - The board: how many jobs everybody managed today. It never
     accuses anyone. It is the evidence a Faithful argues from and the
     thing a Traitor has to explain.
   - The microphone button.
   - Who is talking: the names of whoever you can hear right now.
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
      ? 'The table · ' + ready.length + ' of ' + alive.length + ' done'
      : 'The table is open';

    const done = el('floor-done');
    if (done) {
      done.hidden = !(me && me.alive);
      done.disabled = mineReady;
      done.textContent = mineReady ? 'Waiting…' : 'Done talking';
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
      /* A night knows who everybody is; with no session, "you" falls
         back to the peer id — which is the same id either way, because
         a player id *is* a peer id. */
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

  /* It starts folded: a small tab on the side that says what it is.
     Click it, or press B, and it opens; the table is for faces, not
     for reading. */
  let boardWired = false;
  function showBoard(board) {
    const wrap = el('board');
    if (!wrap) return;
    const html = boardHTML(board);
    if (!html) { hideBoard(); return; }
    el('board-title').textContent = (board && board.title) || 'The day';
    el('board-grid').style.setProperty('--bd-cols', String(boardCols(board)));
    el('board-grid').innerHTML = html;
    wrap.classList.add('on');
    wrap.classList.remove('open');
    if (!boardWired) {
      boardWired = true;
      wrap.addEventListener('click', () => { AudioBus.play('ui-click'); wrap.classList.toggle('open'); });
      window.addEventListener('keydown', (e) => {
        if (e.code === 'KeyB' && wrap.classList.contains('on') && !/INPUT|TEXTAREA/.test((e.target || {}).tagName || '')) {
          wrap.classList.toggle('open');
        }
      });
    }
  }

  /* The day's jobs, as the table argues about them: who managed how
     many. A Traitor who spent the day following somebody round the
     house has a short line here, and has to explain it. */
  function choreBoard() {
    const s = typeof Session !== 'undefined' ? Session.state : null;
    if (!s || !s.chores) return null;
    const done = s.chores.done || {};
    const rows = Session.alive().map(p => ({ playerId: p.id, name: p.name, n: done[p.id] || 0 }))
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
      .map(r => ({ playerId: r.playerId, name: r.name, cells: [String(r.n)] }));
    return { title: 'Jobs done today · pot ' + U.money(s.pot || 0), columns: ['Jobs'], rows };
  }

  function hideBoard() {
    const wrap = el('board');
    if (wrap) wrap.classList.remove('on');
  }

  /* ---------------- who is talking ----------------
     The nametag over a head lights up while that person is talking,
     but the voice is often somebody you cannot see: behind you at the
     table, in the next room, round the turret stair. So the names of
     whoever you can hear right now sit at the top of the screen too,
     loudest first, each with the dot in their colour. */

  let talkKey = '', talkAt = 0;
  function paintTalk() {
    const chip = el('talk-chip');
    if (!chip || typeof VoiceChat === 'undefined' || !VoiceChat.talkers) return;
    const s = typeof Session !== 'undefined' ? Session.state : null;
    const who = s ? VoiceChat.talkers()
      .map(id => s.players.find(p => p.id === id && !p.local))
      .filter(Boolean).slice(0, 3) : [];
    /* Two voices at once at the table: say whose turn it is, so the
       one who is being turned down (see VoiceChat's courtesy) knows to
       hold on — including you. */
    const me = s && s.players.find(p => p.local);
    const holder = VoiceChat.holder;
    const clash = !!holder && who.length + (me && VoiceChat.voiced(me.id) ? 1 : 0) > 1;
    const key = who.map(p => p.id).join(',') + (clash ? '|' + holder : '');
    if (key === talkKey) return;
    talkKey = key;
    chip.classList.toggle('on', who.length > 0);
    if (!who.length) return;              // fade out on the last names
    chip.innerHTML = who.map(p => {
      const look = p.look && typeof Look !== 'undefined' ? Look.resolve(p.look) : null;
      const accent = (look && look.accent) || '#f2c14e';
      const cls = !clash ? '' : p.id === holder ? ' hold' : ' over';
      return '<span class="tc-who' + cls + '" style="--tc:' + esc(accent) + '"><i></i>' + esc(p.name)
        + (cls === ' hold' ? '<em>has the room</em>' : '')
        + '<b class="tc-bars"><b></b><b></b><b></b></b></span>';
    }).join('');
  }

  /* ---------------- the microphone button ----------------
     Always there once there is somebody to talk to, on every screen —
     a mute you have to leave the game to reach
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
       scene growing its own copy of this. */
    Engine.addUpdater(() => {
      if (Input.pressed('mic')) toggleMic();
      const now = Date.now();
      if (now - talkAt > 100) { talkAt = now; paintTalk(); }
    });
    paintMic();
  }

  function hideAll() {
    hideFloor(); hideBoard();
  }

  return { init, toggleMic, paintMic, paintTalk,
           showFloor, hideFloor, showBoard, hideBoard, choreBoard,
           hideAll, paintTick, boardHTML, boardCols,
           get floorWho() { return floorWho; },
           get floorOpen() { return floorOpen; } };
})();

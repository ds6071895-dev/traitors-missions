/* ------------------------------------------------------------------
   roomui.js — the three overlays that only exist because there are
   other people in the room.

   None of them is a screen. They sit over whatever is showing, the
   same way the subtitle does, because all three need to be readable
   while a vote panel is up or a mission is running.

   - The floor bar: whose thirty seconds it is, how many are left, and
     whether your microphone is actually open. The clock is drawn from
     the host's `endsAt`, never counted locally, so all three people
     see the same number.
   - The board: everybody's numbers from the mission that just
     finished. It never accuses anyone. It is the evidence a Faithful
     argues from and the thing a Traitor has to explain.
   - The task chip: your own agenda, visible only to you, with its
     progress on it so nobody ever fails one by forgetting it existed.
------------------------------------------------------------------ */
const RoomUI = (() => {

  const el = (id) => document.getElementById(id);
  let floorEnds = 0, floorWho = null, tick = null;

  const esc = (s) => String(s === undefined || s === null ? '' : s)
    .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------------- the floor ---------------- */

  function showFloor(e) {
    const bar = el('floor-bar');
    if (!bar) return;
    if (!e || e.done || !e.playerId) { hideFloor(); return; }

    floorWho = e.playerId;
    floorEnds = e.endsAt || 0;
    const p = Session.playerById(e.playerId);
    const mine = p && p.local;

    bar.classList.add('on');
    bar.classList.toggle('mine', !!mine);
    el('floor-who').textContent = mine ? 'YOU ARE SPEAKING'
                                       : ((p ? p.name : 'Somebody') + ' is speaking');

    /* The only thing you can press during your own thirty seconds is
       "stop". There is nothing to choose here — the thing you are
       doing with the time is talking. */
    const done = el('floor-done');
    if (done) {
      done.hidden = !mine;
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

  function hideFloor() {
    const bar = el('floor-bar');
    floorWho = null; floorEnds = 0;
    if (tick) { clearInterval(tick); tick = null; }
    const done = el('floor-done');
    if (done) { done.hidden = true; done.onclick = null; }
    if (bar) bar.classList.remove('on', 'mine');
    VoiceChat.openFloor();
  }

  function paintTick() {
    if (!floorEnds) return;
    const left = Math.max(0, (floorEnds - Date.now()) / 1000);
    const total = 30;
    el('floor-clock').textContent = '0:' + (left < 10 ? '0' : '') + Math.floor(left);
    const fill = el('floor-fill');
    if (fill) fill.style.transform = 'scaleX(' + U.clamp(left / total, 0, 1) + ')';
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
      const p = typeof Session !== 'undefined' ? Session.playerById(r.playerId) : null;
      const you = p && p.local;
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
     and it is also evidence: three of the eight agenda cards are only
     catchable because this strip is on screen while they are being
     performed. A row is `{ playerId, name, value, meter, dim }`. */

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
     could accidentally render somebody else's card. */

  function showAgenda(progress) {
    const chip = el('agenda-chip');
    if (!chip) return;
    const card = Session.myAgenda ? Session.myAgenda() : null;
    if (!card) { hideAgenda(); return; }
    el('agenda-text').textContent = card.text || '';
    const prog = el('agenda-prog');
    if (prog) {
      prog.textContent = progress || card.hud || '';
      prog.hidden = !prog.textContent;
    }
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
           hideAll, paintTick, boardHTML, boardCols, showField, hideField,
           get floorWho() { return floorWho; } };
})();

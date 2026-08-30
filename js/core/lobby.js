/* ------------------------------------------------------------------
   lobby.js — a name, four letters, and three people.

   There is no account here and there is not going to be one. You type
   a name, you get a code or you are given one, and when the third
   person arrives the host can start. That is the entire front door.

   The code entry is four `<select>` elements rather than a text box,
   and that is a deliberate reuse rather than a shortcut: `UINav`
   already treats left and right on a `<select>` as "change this one"
   (uinav.js `cycleSelect`), so a gamepad dials a room code with no new
   input handling anywhere, a phone gets its native picker, and a
   keyboard can still type A-Z to jump. One control, three input
   methods, no code.
------------------------------------------------------------------ */
const Lobby = (() => {

  const el = (id) => document.getElementById(id);
  let slots = [];
  let msgTimer = null;
  let started = false;

  /* ---------------- the code control ---------------- */

  function buildCodeEntry() {
    const wrap = el('code-entry');
    if (!wrap || slots.length) return;
    wrap.innerHTML = '';
    slots = [];
    for (let i = 0; i < Party.CODE_LEN; i++) {
      const sel = document.createElement('select');
      sel.className = 'code-slot';
      sel.setAttribute('data-nav', '');
      sel.setAttribute('aria-label', 'Room code letter ' + (i + 1));
      for (const ch of Party.ALPHABET) {
        const o = document.createElement('option');
        o.value = ch; o.textContent = ch;
        sel.appendChild(o);
      }
      wrap.appendChild(sel);
      slots.push(sel);
    }
  }

  const readCode = () => slots.map(s => s.value).join('');

  function writeCode(code) {
    const c = Party.normaliseCode(code);
    slots.forEach((s, i) => { if (c[i]) s.value = c[i]; });
  }

  /* ---------------- messages ---------------- */

  function say(text, tone) {
    const m = el('lobby-msg');
    if (!m) return;
    m.textContent = text || '';
    m.className = 'lobby-msg' + (text ? ' on' : '') + (tone ? ' ' + tone : '');
    clearTimeout(msgTimer);
    if (text) msgTimer = setTimeout(() => say(''), 6000);
  }

  /* ---------------- painting the room ---------------- */

  function paint() {
    const inRoom = Party.connected;
    const cols = el('lobby-cols');
    const room = el('lobby-room');
    if (cols) cols.hidden = inRoom;
    if (room) room.hidden = !inRoom;

    if (inRoom) {
      el('lobby-code').textContent = Party.code || '····';
      const list = Party.roster();
      const mine = Party.selfId();
      el('lobby-roster').innerHTML = list.map(p => {
        const you = p.id === mine;
        return '<div class="lr-seat' + (you ? ' you' : '') + '">'
             + '<span class="lr-seat-n">' + (p.seat + 1) + '</span>'
             + '<span class="lr-name">' + escape(p.name || 'Player') + '</span>'
             + '<span class="lr-tag">' + (p.host ? 'host' : (you ? 'you' : '')) + '</span>'
             + '</div>';
      }).join('') + emptySeats(list.length);

      const n = list.length;
      const full = n >= Party.MAX;
      el('lobby-status').textContent = full
        ? (Party.isHost ? 'Everybody is here.' : 'Everybody is here. Waiting for the host.')
        : 'Waiting for players… ' + n + '/' + Party.MAX;

      const start = el('lobby-start');
      start.hidden = !Party.isHost;
      start.disabled = !full;
    }

    RoomUI.paintMic();
    const mic = el('lobby-mic-btn');
    if (mic) {
      mic.textContent = !VoiceChat.available
        ? 'Mic: off'
        : (VoiceChat.muted ? 'Mic: muted' : 'Mic: live');
      mic.classList.toggle('on', VoiceChat.available && !VoiceChat.muted);
    }
    UINav.scan();
  }

  function emptySeats(n) {
    let out = '';
    for (let i = n; i < Party.MAX; i++) {
      out += '<div class="lr-seat empty"><span class="lr-seat-n">' + (i + 1)
           + '</span><span class="lr-name">—</span><span class="lr-tag"></span></div>';
    }
    return out;
  }

  const escape = (s) => String(s).replace(/[&<>"]/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------------- joining ---------------- */

  function profile() {
    const name = Look.setName(el('lobby-name').value || Look.getName() || 'Player');
    el('lobby-name').value = name;
    return { name: name || 'Player', look: Look.get() };
  }

  async function host() {
    if (Party.connected) return;
    say('Opening a room…');
    try {
      const code = await Party.host(profile());
      VoiceChat.init();
      VoiceChat.listen();
      say('Room ' + code + ' is open. Read those four letters out.', 'good');
      paint();
    } catch (e) {
      say(e.message || 'Could not open a room.', 'bad');
    }
  }

  async function join() {
    if (Party.connected) return;
    const code = readCode();
    if (!Party.validCode(code)) { say('That is not a four-letter code.', 'bad'); return; }
    say('Looking for ' + code + '…');
    try {
      await Party.join(code, profile());
      VoiceChat.init();
      VoiceChat.listen();
      say('In. Waiting for the others.', 'good');
      paint();
    } catch (e) {
      say(e.message || 'Could not reach that room.', 'bad');
    }
  }

  function leave() {
    Party.leave();
    VoiceChat.stop();
    started = false;
    say('');
    paint();
  }

  /* ---------------- starting ----------------
     The host draws the seed and the seating, tells the other two, and
     then starts its own night from exactly the same message. Nobody
     gets a run the others do not have. */

  function start() {
    if (!Party.isHost || started) return;
    const list = Party.roster();
    if (list.length < Party.MAX) return;
    started = true;
    const seed = U.randomSeed();
    const players = list.map(p => ({ id: p.id, name: p.name, look: p.look }));
    Party.post('go', { seed, players });
    launch(seed, players);
  }

  function launch(seed, players) {
    const mine = Party.selfId();
    const seated = players.map(p => Object.assign({}, p, { local: p.id === mine }));
    AudioBus.resume();
    Voice.unlock();
    Screens.transition(() => {
      Game.enterShow();
      Show.beginParty({ seed, players: seated, host: Party.isHost });
    }, 420);
  }

  /* ---------------- microphone ---------------- */

  async function toggleMic() {
    if (!VoiceChat.available) {
      const ok = await VoiceChat.start();
      if (!ok) say(VoiceChat.reason || 'No microphone.', 'bad');
      else say('Microphone live.', 'good');
    } else {
      VoiceChat.toggleMuted();
    }
    paint();
  }

  /* ---------------- wiring ---------------- */

  function init() {
    buildCodeEntry();

    el('lobby-name').value = Look.getName();
    el('lobby-name').addEventListener('change', () => profile());
    el('lobby-name').addEventListener('blur', () => profile());

    el('lobby-host').onclick = host;
    el('lobby-join').onclick = join;
    el('lobby-leave').onclick = leave;
    el('lobby-start').onclick = start;
    el('lobby-mic-btn').onclick = toggleMic;
    el('lobby-dress').onclick = () => Screens.show('dressing', { from: 'lobby' });
    el('lobby-back').onclick = () => { leave(); Screens.show('play'); };

    Party.on('roster', paint);
    Party.on('left', paint);
    Party.on('error', (m) => { say(m, 'bad'); paint(); });
    Party.on('go', (data) => {
      if (Party.isHost || started || !data) return;
      started = true;
      launch(data.seed, data.players || []);
    });
    VoiceChat.on('state', paint);

    Screens.register('lobby', {
      enter(data) {
        el('lobby-name').value = Look.getName();
        if (data && data.mode === 'host' && !Party.connected) host();
        paint();
        if (data && data.mode === 'join' && slots[0]) setTimeout(() => slots[0].focus(), 40);
      },
    });
  }

  return { init, paint, leave, say, get started() { return started; } };
})();

/* ------------------------------------------------------------------
   lobby.js — a name, four letters, and three people.

   There is no account here and there is not going to be one. You type
   a name, you get a code or you are given one, and when the third
   person arrives the host can start. That is the entire front door.

   The code goes in a text field, because somebody reads four letters
   down a phone at you and typing four letters is what a person does
   next. It used to be four spinners — dialable with the arrow keys, which was
   the argument for them, and a small ordeal on every other input
   method there is. The field forgives what people actually type:
   lower case, spaces, and the I and O that are not in the alphabet but
   are the first thing anyone hears when you say J and Q out loud.
------------------------------------------------------------------ */
const Lobby = (() => {

  const el = (id) => document.getElementById(id);
  let msgTimer = null;
  let started = false;
  let seated = false;              // a guest has heard its first roster

  /* ---------------- the code control ----------------
     `Party.normaliseCode` is the whole of it: it upper-cases, drops
     anything that is not a letter, and forgives I and O by folding
     them onto the J and Q they were excluded in favour of. Running it
     on every keystroke means the field can only ever contain a code,
     so there is nothing to validate later. */

  const readCode = () => Party.normaliseCode(el('code-input').value);

  function tidyCode() {
    const f = el('code-input');
    if (!f) return '';
    const clean = Party.normaliseCode(f.value);
    if (f.value !== clean) f.value = clean;
    return clean;
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
    for (const id of ['lobby-host', 'lobby-join']) {
      const button = el(id);
      if (button) button.disabled = !!Party.connecting;
    }
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
      /* A guest with no roster yet has not been let in — it has only
         opened a door. Saying "0/3" there reads as an empty room the
         host is sitting in, which is the one thing it is not. */
      el('lobby-status').textContent = Party.reconnecting ? 'Reconnecting…' : (!Party.isHost && !n)
        ? 'Looking for the room…'
        : (full
            ? (Party.isHost ? 'Everybody is here.' : 'Everybody is here. Waiting for the host.')
            : 'Waiting for players… ' + n + '/' + Party.MAX);

      const start = el('lobby-start');
      start.hidden = !Party.isHost;
      start.disabled = !full || Party.reconnecting;
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
    if (Party.connected || Party.connecting) return;
    say('Opening a room…');
    try {
      const code = await Party.host(profile());
      VoiceChat.init();
      VoiceChat.listen();
      say('Room ' + code + ' is open. Read those four letters out.', 'good');
      paint();
    } catch (e) {
      if (e.name === 'AbortError') return;
      say(e.message || 'Could not open a room.', 'bad');
    }
  }

  async function join() {
    if (Party.connected || Party.connecting) return;
    const code = readCode();
    if (!Party.validCode(code)) { say('That is not a four-letter code.', 'bad'); return; }
    say('Looking for ' + code + '…');
    try {
      await Party.join(code, profile());
      VoiceChat.init();
      VoiceChat.listen();
      /* Not "in" — knocking. Opening a room in the swarm always works,
         including on four letters nobody is using, so the only honest
         thing to say here is that the door has been knocked on. The
         host's first roster is what turns this into "in", and the
         watchdog in `party.js` is what turns it into an apology. */
      say(Party.self() ? 'In. Waiting for the others.' : 'Knocking on ' + code + '…', Party.self() ? 'good' : '');
      paint();
    } catch (e) {
      if (e.name === 'AbortError') return;
      say(e.message || 'Could not reach that room.', 'bad');
    }
  }

  function leave() {
    Party.leave();
    VoiceChat.stop();
    started = false;
    seated = false;
    say('');
    paint();
  }

  /* ---------------- starting ----------------
     The host draws the seed and the seating, tells the other two, and
     then starts its own night from exactly the same message. Nobody
     gets a run the others do not have. */

  function start() {
    if (!Party.isHost || started || Party.reconnecting) return;
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
    const launchRoom = Party.room;
    AudioBus.resume();
    Voice.unlock();
    Screens.transition(() => {
      if (Party.room !== launchRoom || !Party.connected) return;
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
    const code = el('code-input');
    code.addEventListener('input', tidyCode);
    /* Four letters in is the end of the input, so treat it as the
       press. Enter does the same from a keyboard. */
    code.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); join(); }
    });

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

    Party.on('roster', () => {
      if (!Party.isHost && !seated && Party.roster().length) {
        seated = true;
        say('In. Waiting for the others.', 'good');
      }
      paint();
    });
    Party.on('status', paint);
    Party.on('left', paint);
    Party.on('error', (m) => {
      /* Some errors drop the room from under us — a refusal, a code
         nobody answered. If we are out, the flags that describe being
         in go with it. */
      if (!Party.connected) { seated = false; started = false; }
      say(m, 'bad');
      paint();
    });
    Party.on('go', (data) => {
      if (Party.isHost || started || !data) return;
      /* Two things start out of a room now. A `go` that names a
         mission is a mission party — `mission-party.js` owns that one,
         and a night must not be started on top of it. */
      if (data.kind === 'mission') return;
      started = true;
      launch(data.seed, data.players || []);
    });
    VoiceChat.on('state', paint);

    Screens.register('lobby', {
      enter() {
        /* `started` is a latch against double-starting one night, not a
           record that a night ever happened. Coming back to the lobby
           with the show over and the room still open has to be able to
           start another one. */
        if (typeof Show === 'undefined' || !Show.running) {
          started = false;
          Party.setLobby();
        }
        el('lobby-name').value = Look.getName();
        /* Nothing here opens a room. Arriving used to be able to, if
           you had come through a CREATE ROOM on the front door, and a
           screen that quietly hands you a four-letter code you then
           have to explain to two other people is a screen doing
           something you did not ask for. `host()` runs when the button
           marked CREATE ROOM is pressed, and at no other time. */
        paint();
      },
    });
  }

  return { init, paint, leave, say, get started() { return started; } };
})();

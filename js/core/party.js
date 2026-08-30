/* ------------------------------------------------------------------
   party.js — three people, one room, no login.

   This is the only file in the game that knows what WebRTC is. Above
   it, `transports.js` speaks the `Net` protocol and nothing else;
   below it, Trystero deals with relays and ICE and the rest of it.
   Keeping that line sharp is the whole reason multiplayer did not have
   to be threaded through every scene.

   The room code is four letters. That is not a style choice: a code
   has to be readable down a phone, typeable on a handset with no
   keyboard, and dialable on a gamepad with four spinners. I and O are
   not in the alphabet because they are 1 and 0 to anyone reading it
   out.

   The host is the authority. It is the peer that created the room, it
   owns the roster, and seats are handed out by it in arrival order —
   seat 0 is always the host. Guests learn who the host is from the
   first roster that arrives, because only a host ever sends one.
------------------------------------------------------------------ */
const Party = (() => {

  const APP_ID   = 'the-traitors-loch';
  const MAX      = 3;
  const CODE_LEN = 4;
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // no I, no O

  /* Trystero caps an action name at 12 bytes, so these are short on
     purpose rather than terse for its own sake. */
  const CHANNELS = ['hello', 'roster', 'go', 'wire', 'sync', 'mev'];

  let room = null;
  let code = null;
  let host = false;
  let hostPeer = null;              // the peer id of the authority
  let profile = null;               // { name, look }
  let seats = new Map();            // peerId -> { id, name, look, seat, host }
  let send = {};                    // channel -> fn(data, toPeer)
  let joined = false;

  const listeners = {
    roster: new Set(),   // (roster)
    peer:   new Set(),   // (peerId, entry)
    left:   new Set(),   // (peerId)
    go:     new Set(),   // ({ seed, players }) — the host has started the night
    wire:   new Set(),   // (envelope, fromPeer)
    sync:   new Set(),   // (payload, fromPeer)
    mev:    new Set(),   // (payload, fromPeer)
    error:  new Set(),   // (message)
  };

  function on(evt, fn) {
    if (!listeners[evt]) return () => {};
    listeners[evt].add(fn);
    return () => listeners[evt].delete(fn);
  }
  function emit(evt, a, b) {
    (listeners[evt] || []).forEach(fn => {
      try { fn(a, b); } catch (e) { console.warn(e); }
    });
  }

  /* ---------------- the library ----------------
     `index.html` imports Trystero as a module and hangs it on the
     window, because everything else here is a plain script and one
     module shim is cheaper than converting the whole game. */

  function ready(timeout = 12000) {
    if (window.Trystero) return Promise.resolve(window.Trystero);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        window.removeEventListener('trystero:ready', hit);
        reject(new Error('Could not load the multiplayer library. Check your connection.'));
      }, timeout);
      function hit() {
        clearTimeout(t);
        window.removeEventListener('trystero:ready', hit);
        resolve(window.Trystero);
      }
      window.addEventListener('trystero:ready', hit);
    });
  }

  /* ---------------- codes ---------------- */

  function randomCode() {
    let s = '';
    for (let i = 0; i < CODE_LEN; i++) {
      s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    return s;
  }

  function normaliseCode(raw) {
    const s = String(raw || '').toUpperCase().replace(/[^A-Z]/g, '')
      .replace(/I/g, 'J').replace(/O/g, 'Q');   // forgive the two we excluded
    return s.slice(0, CODE_LEN);
  }

  const validCode = (c) => normaliseCode(c).length === CODE_LEN;

  /* ---------------- joining ---------------- */

  async function open(theCode, theProfile, asHost) {
    if (joined) leave();
    const T = await ready();
    code = normaliseCode(theCode);
    host = !!asHost;
    profile = { name: (theProfile && theProfile.name) || 'Player',
                look: (theProfile && theProfile.look) || null };

    room = T.joinRoom({ appId: APP_ID }, 'traitors-' + code);
    joined = true;

    send = {};
    for (const name of CHANNELS) {
      const [tx, rx] = room.makeAction(name);
      send[name] = tx;
      rx((data, peerId) => receive(name, data, peerId));
    }

    const selfId = T.selfId;
    seats = new Map();
    if (host) {
      hostPeer = selfId;
      seats.set(selfId, { id: selfId, name: profile.name, look: profile.look,
                          seat: 0, host: true });
      publishRoster();
    }

    room.onPeerJoin((peerId) => {
      /* Everybody introduces themselves to everybody. The host is the
         only one that turns introductions into seats. */
      send.hello({ name: profile.name, look: profile.look }, peerId);
      if (host) admit(peerId);
    });

    room.onPeerLeave((peerId) => {
      seats.delete(peerId);
      emit('left', peerId);
      if (host) publishRoster();
      else if (peerId === hostPeer) emit('error', 'The host left the room.');
    });

    return code;
  }

  const hostRoom = (p) => open(randomCode(), p, true);
  const joinRoom = (c, p) => open(c, p, false);

  /* The host decides who is in. A fourth person is turned away rather
     than silently ignored, because a person staring at a lobby that
     never fills up has no way to tell those two apart. */
  function admit(peerId) {
    if (seats.has(peerId)) return;
    if (seats.size >= MAX) {
      send.roster({ full: true }, peerId);
      return;
    }
    const used = new Set([...seats.values()].map(e => e.seat));
    let seat = 0;
    while (used.has(seat)) seat++;
    seats.set(peerId, { id: peerId, name: 'Player', look: null, seat, host: false });
    publishRoster();
  }

  function publishRoster() {
    if (!host || !send.roster) return;
    const list = roster();
    send.roster({ list, hostId: hostPeer });
    emit('roster', list);
  }

  function receive(channel, data, peerId) {
    if (channel === 'hello') {
      if (data && data.reject) { emit('error', data.reject); return; }
      const e = seats.get(peerId);
      if (e) {
        e.name = String((data && data.name) || 'Player').slice(0, 16);
        e.look = (data && data.look) || null;
        if (host) publishRoster(); else emit('roster', roster());
      } else if (host) {
        admit(peerId);
        const q = seats.get(peerId);
        if (q) {
          q.name = String((data && data.name) || 'Player').slice(0, 16);
          q.look = (data && data.look) || null;
          publishRoster();
        }
      }
      return;
    }

    if (channel === 'roster') {
      if (!data) return;
      if (data.full) { emit('error', 'That room is already full.'); return; }
      if (host) return;                       // a guest never rewrites the roster
      hostPeer = data.hostId || peerId;
      seats = new Map((data.list || []).map(e => [e.id, e]));
      emit('roster', roster());
      return;
    }

    emit(channel, data, peerId);
  }

  function leave() {
    if (room) { try { room.leave(); } catch (e) {} }
    room = null; joined = false; host = false; hostPeer = null;
    code = null; seats = new Map(); send = {};
  }

  /* ---------------- reading the room ---------------- */

  const roster = () => [...seats.values()].sort((a, b) => a.seat - b.seat);
  const selfId = () => (window.Trystero ? window.Trystero.selfId : null);
  const self = () => seats.get(selfId()) || null;
  const peerIds = () => roster().map(e => e.id).filter(id => id !== selfId());
  const full = () => seats.size >= MAX;

  /* Everything above the wire talks in player ids, and a player id is
     the peer id — one name for a person, all the way down. */
  function post(channel, data, toPeer) {
    if (!joined || !send[channel]) return;
    try { send[channel](data, toPeer); } catch (e) { console.warn(e); }
  }

  /* The look changed in the dressing room while the lobby was open. */
  function setProfile(p) {
    if (!p) return;
    profile = { name: p.name || (profile && profile.name) || 'Player',
                look: p.look || (profile && profile.look) || null };
    const mine = self();
    if (mine) { mine.name = profile.name; mine.look = profile.look; }
    if (!joined) return;
    post('hello', { name: profile.name, look: profile.look });
    if (host) publishRoster(); else emit('roster', roster());
  }

  return {
    ready, host: hostRoom, join: joinRoom, leave, on, post, setProfile,
    roster, self, selfId, peerIds, randomCode, normaliseCode, validCode,
    publishRoster,
    MAX, CODE_LEN, ALPHABET,
    get isHost() { return host; },
    get hostId() { return hostPeer; },
    get code() { return code; },
    get connected() { return joined; },
    get room() { return room; },
  };
})();

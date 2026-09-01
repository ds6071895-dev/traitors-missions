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

  /* ---------------- reaching each other ----------------

     Trystero's defaults are four STUN servers and no TURN at all. STUN
     only tells a browser what its own public address looks like, and
     for two machines on one home network that is the whole job. It is
     not the whole job for everybody. A tablet on cellular, a laptop on
     a guest network, a household behind carrier-grade NAT, a phone
     with iCloud Private Relay or a VPN switched on — each of those
     sits behind something that will not hold a port open for a
     stranger, and two such peers can exchange offers all night and
     never find a path between them. TURN is the relay that fixes it.

     There is no free TURN server worth depending on, so the list is
     empty and this is the line to fill in. Anything with the shape
     `{ urls, username, credential }` will do — Cloudflare Calls,
     Twilio, Metered, or coturn on a five pound VPS.

     Leaving it empty is a legitimate choice for a game played in one
     living room. It is worth knowing what it costs, because the
     failure is the least readable one this game has: both people are
     in the right room, the signalling worked perfectly, and the
     screen says nobody answered. */
  const TURN = [
    // { urls: 'turn:turn.example.com:3478', username: '…', credential: '…' },
  ];
  const CODE_LEN = 4;
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // no I, no O

  /* Trystero caps an action name at 12 bytes, so these are short on
     purpose rather than terse for its own sake. */
  const CHANNELS = ['hello', 'roster', 'go', 'wire', 'sync', 'mev', 'mp'];

  let room = null;
  let code = null;
  let host = false;
  let hostPeer = null;              // the peer id of the authority
  let profile = null;               // { name, look }
  let seats = new Map();            // peerId -> { id, name, look, seat, host }
  let send = {};                    // channel -> fn(data, toPeer)
  let joined = false;
  let joinTimer = null;             // the guest's "did anyone answer?" watchdog
  let knockTimer = null;            // and the hello it repeats until one does
  let unreachable = null;           // a peer we found and could not connect to

  /* Long, on purpose. Relay discovery on a cold room genuinely takes
     five to ten seconds — a watchdog tight enough to feel responsive
     would spend its time throwing out people who were about to get in,
     which is a far worse failure than a slow one. Sixteen knocks. */
  const KNOCK_EVERY = 1100;
  const JOIN_WAIT   = 18000;

  const listeners = {
    roster: new Set(),   // (roster)
    peer:   new Set(),   // (peerId, entry)
    left:   new Set(),   // (peerId, seat) — seat is null if they never had one
    go:     new Set(),   // ({ seed, players }) — the host has started the night
    wire:   new Set(),   // (envelope, fromPeer)
    sync:   new Set(),   // (payload, fromPeer)
    mev:    new Set(),   // (payload, fromPeer)
    /* A mission party: three people in a room for one mission rather
       than a whole night. It gets its own channel because the host is
       broadcasting a *setup* — a seed, a twist, whether to skip to the
       owl — and that is neither a pose nor a mission event, and it has
       to keep arriving on a screen where no mission is running. */
    mp:     new Set(),   // (payload, fromPeer)
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

  /* ---------------- the two API shapes ----------------
     Trystero moved from callback-registering methods and `[send, recv]`
     pairs to plain assignable properties and action objects. Nothing
     above this line should have to care which one the CDN served, so
     these two helpers absorb the difference. */

  const peerIdOf = (from) =>
    (from && typeof from === 'object' ? from.peerId : from);

  function hook(target, prop, fn) {
    if (!target) return;
    if (typeof target[prop] === 'function') target[prop](fn);
    else target[prop] = fn;
  }

  /* ---------------- joining ---------------- */

  async function open(theCode, theProfile, asHost) {
    if (joined) leave();
    const T = await ready();
    code = normaliseCode(theCode);
    const theRoomCode = code;
    host = !!asHost;
    profile = { name: (theProfile && theProfile.name) || 'Player',
                look: (theProfile && theProfile.look) || null };

    /* Trystero knows the difference between "no such room" and "found
       them, could not build a pipe", and until this handler existed it
       had no way to say so: the failure arrived as silence, and the
       only thing watching silence was the watchdog below, which blamed
       the four letters for it. `joinRoom` takes the handler in a
       callbacks object in the pinned 0.25 API. */
    const onJoinError = (d) => {
      unreachable = (d && d.error) || 'could not connect';
      console.warn('[party] ' + unreachable);
      /* A guest has a watchdog and will phrase this itself in a
         moment. A host has nothing — it is sitting in front of a lobby
         that is simply not filling up — so it gets told now. */
      if (host) {
        emit('error', 'Somebody found the room but could not connect. '
                    + 'You are probably on different networks.');
      }
    };
    const callbacks = { onJoinError };

    unreachable = null;
    room = T.joinRoom({ appId: APP_ID, turnConfig: TURN },
                      'traitors-' + code, callbacks);
    joined = true;

    /* Trystero 0.25 hands back an action *object* — `{ send, onMessage }`
       — where older versions handed back a `[send, receive]` pair, and
       the receiver is now given `(payload, { peerId })` rather than a
       bare peer id. Both shapes are normalised here so the rest of the
       file keeps talking in `send.hello(data, peerId)` and
       `receive(channel, data, peerId)`. */
    send = {};
    for (const name of CHANNELS) {
      const action = room.makeAction(name);
      const hit = (data, from) => receive(name, data, peerIdOf(from));

      if (action && typeof action.send === 'function') {
        /* 0.25's send is async and rejects on a peer that went away
           mid-flight. Nothing above here can do anything about that,
           and an unhandled rejection in a game is a console full of
           noise nobody reads, so it is swallowed at the seam. */
        send[name] = (data, toPeer) => {
          const p = action.send(data, toPeer ? { target: toPeer } : {});
          if (p && p.catch) p.catch(e => console.warn(e));
          return p;
        };
        action.onMessage = hit;
      } else {
        const [tx, rx] = action;                 // pre-0.25 pair
        send[name] = tx;
        rx(hit);
      }
    }

    const selfId = T.selfId;
    seats = new Map();
    if (host) {
      hostPeer = selfId;
      seats.set(selfId, { id: selfId, name: profile.name, look: profile.look,
                          seat: 0, host: true });
      publishRoster();
    }

    /* `onPeerJoin` / `onPeerLeave` are assignable properties in 0.25 and
       were methods before it; `hook` covers both. */
    hook(room, 'onPeerJoin', (peerId) => {
      /* Everybody introduces themselves to everybody. The host is the
         only one that turns introductions into seats. */
      send.hello({ name: profile.name, look: profile.look }, peerId);
      if (host) admit(peerId);
    });

    hook(room, 'onPeerLeave', (peerId) => {
      /* The seat goes with the person, and the seat is handed to the
         listeners with them: a peer that was never seated — a fourth
         who was turned away, a guest that gave up knocking — leaving
         is not the same event as one of the three walking out, and
         only the caller can tell those apart. */
      const seat = seats.get(peerId) || null;
      seats.delete(peerId);
      emit('left', peerId, seat);
      if (host) publishRoster();
      else if (peerId === hostPeer) emit('error', 'The host left the room.');
    });

    /* A guest keeps knocking until somebody answers.

       Waiting for `onPeerJoin` alone was the third player's bug. It is
       one event, it is not replayed, and the peer it fires for is
       whichever one connected — which on a relayed swarm is often the
       other guest rather than the host. A guest that introduced itself
       to player two and to nobody else sat in a room it was genuinely
       in, holding no roster, because the only machine that hands out
       rosters had never been told it was there.

       So the hello repeats, broadcast rather than aimed, until a
       roster comes back. It is a few hundred bytes a second for at
       most nine seconds, and it turns a coin-flip into a certainty.

       Nothing in the *swarm* distinguishes a code nobody is using from
       a host that has not answered yet — joining a room that does not
       exist succeeds, because a swarm has no idea a room was supposed
       to have anybody in it. So when the knocking runs out, say so and
       let go, rather than leaving somebody watching three empty seats
       all evening.

       The ICE layer does know the difference, though, and it says so
       through `onJoinError`. If it has spoken, the four letters were
       right and the network is what is wrong, and telling somebody to
       check the code they typed correctly is worse than saying
       nothing. */
    if (!host) startKnocking(theRoomCode);

    return code;
  }

  /* The knock stops when we are in the list, not when somebody
     answers. Being told who the host is only means we now know where
     to knock. */
  const isSeated = () => seats.has(selfId());

  function startKnocking(theRoomCode) {
    stopKnocking();
    const knock = () => {
      if (host || !joined || isSeated()) { stopKnocking(); return; }
      post('hello', { name: profile.name, look: profile.look }, hostPeer || undefined);
    };
    knockTimer = setInterval(knock, KNOCK_EVERY);
    joinTimer = setTimeout(() => {
      if (host || isSeated()) { stopKnocking(); return; }
      /* `leave()` clears this, so read it while it is still there. */
      const found = unreachable;
      leave();
      emit('error', found
        ? 'Found room ' + theRoomCode + ', but could not open a '
          + 'connection to the host. You are probably on different '
          + 'networks — try the same wifi, and turn off any VPN or '
          + 'iCloud Private Relay.'
        : 'Nobody answered in room ' + theRoomCode
          + '. Check the four letters.');
    }, JOIN_WAIT);
  }

  function stopKnocking() {
    clearInterval(knockTimer); knockTimer = null;
    clearTimeout(joinTimer);   joinTimer = null;
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
      } else if (hostPeer) {
        /* A guest that already knows the roster and hears a stranger
           introduce itself answers with what it has. It is not the
           authority and the list may be a moment stale, but it carries
           `hostId`, which is the one thing the newcomer cannot work out
           on its own and the thing it needs to start talking to the
           host directly. */
        post('roster', { list: roster(), hostId: hostPeer }, peerId);
      }
      return;
    }

    if (channel === 'roster') {
      if (!data) return;
      if (data.full) {
        /* Turned away. Leave properly first: a guest still sitting in
           the swarm would be painted into a lobby holding a roster of
           three people it is not one of. */
        leave();
        emit('error', 'That room is already full.');
        return;
      }
      if (host) return;                       // a guest never rewrites the roster

      /* Only the host's roster is the roster. A relay from the other
         guest carries one thing worth having — who the authority is —
         and the right response to it is to go and knock on that door,
         not to believe the seating. */
      const fromHost = !data.hostId || data.hostId === peerId;
      hostPeer = data.hostId || peerId;
      if (!fromHost) {
        post('hello', { name: profile.name, look: profile.look }, hostPeer);
        return;
      }

      seats = new Map((data.list || []).map(e => [e.id, e]));
      if (isSeated()) stopKnocking();
      emit('roster', roster());
      return;
    }

    emit(channel, data, peerId);
  }

  function leave() {
    stopKnocking();
    if (room) { try { room.leave(); } catch (e) {} }
    room = null; joined = false; host = false; hostPeer = null;
    code = null; seats = new Map(); send = {}; unreachable = null;
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
    ready, host: hostRoom, join: joinRoom, leave, on, post, setProfile, hook,
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

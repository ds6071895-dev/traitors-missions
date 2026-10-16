/* ------------------------------------------------------------------
   transports.js — the wire, in the shape `net.js` asked for.

   `net.js` says a transport is three methods: open, send, close. Here
   are the two real ones.

   `HostTransport` is `LocalTransport` with an audience. The host owns
   `Session`, so every action — its own and both guests' — is dispatched
   here, and every event `Session` emits goes out to the room.

   `GuestTransport` owns nothing. It posts actions at the host and
   waits, exactly as a browser talking to a server would, and its
   `Session` is a mirror kept in step by whatever comes back.

   Two rules keep the secret secret:

   1. Every outbound event carries the snapshot that goes with it. A
      guest that received `phase: 'finale'` before the state that made
      it true would render the finale from the round table's data, and
      the bug would only ever show up on someone else's machine.
   2. A role is only ever sent to the person it belongs to, once, as a
      targeted message. It is never in the snapshot, because it is never
      in `state` — that is the invariant the whole show rests on.
------------------------------------------------------------------ */
const Transports = (() => {

  /* Every Session event, and how to put it on the wire. Kept as data so
     adding an event to the session is adding a line here, rather than
     remembering that this file exists. */
  const EVENTS = [
    ['change',     (s)       => ({ type: 'state',      state: s })],
    ['phase',      (p, prev) => ({ type: 'phase',      phase: p, prev })],
    ['beat',       (n)       => ({ type: 'beat',       n })],
    ['vote',       (v)       => ({ type: 'vote',       ...v })],
    ['decision',   (d)       => ({ type: 'decision',   ...d })],
    ['nameReveal', (n)       => ({ type: 'nameReveal', ...n })],
    ['tally',      (t)       => ({ type: 'tally',      ...t })],
    ['reveal',     (r)       => ({ type: 'reveal',     ...r })],
    ['floor',      (f)       => ({ type: 'floor',      ...f })],
    ['scene',      (s)       => ({ type: 'scene',      ...s })],
    ['sync',       (s)       => ({ type: 'sync',       ...s })],
    ['expose',     (x)       => ({ type: 'expose',     ...x })],
    ['chore',      (c)       => ({ type: 'chore',      ...c })],
    ['bell',       (b)       => ({ type: 'bell',       ...b })],
    ['night',      (n)       => ({ type: 'night',      ...n })],
    ['arrive',     (a)       => ({ type: 'arrive',     ...a })],
    ['murder',     (m)       => ({ type: 'murder',     ...m })],
    ['cue',        (c)       => ({ type: 'cue',        ...c })],
    ['outcome',    (o)       => ({ type: 'outcome',    outcome: o })],
  ];
  /* What a guest is allowed to say. Anything not on this list is
     dropped on arrival, which is the right default. Impersonation is not
     the reason to keep anything off: the host stamps every guest action
     with the peer it actually arrived from, so a guest can only ever
     do its own jobs, hand over its own letters, and — if it is the one
     carrying it — use its own poison. */
  const GUEST_ACTIONS = new Set([
    'vote', 'name', 'decide', 'yieldFloor', 'sceneReady', 'syncReady',
    'chore', 'handover', 'poison', 'turretPick', 'recruitAnswer',
  ]);

  /* Actions a contestant sends about themselves. On the host they are
     stamped with the host's own id — unless the contestant named is one
     of the AI seats the host plays for, which only the host can do. */
  const SELF_ACTIONS = new Set(['chore', 'handover', 'poison', 'turretPick', 'recruitAnswer']);
  const actsForSelf = (type) => SELF_ACTIONS.has(type);
  const isBotSeat = (id) => !!(id && Session.state
    && (Session.state.players.find(p => p.id === id) || {}).bot);

  /* ---------------- the private half of the night ----------------
     Everything one person may know and the others may not is one
     object, `Session.privateView(id)`. The host recomputes everybody's
     after anything moves and sends each person theirs only when it has
     changed — so a pick in the turret reaches the other Traitor and
     nobody else, and a reconnect is simply sent the whole view again. */
  function privateSync(owner, force) {
    if (!Session.state || !Session.isHost) return;
    const sent = owner._sentViews || (owner._sentViews = new Map());
    for (const p of Session.state.players) {
      const view = Session.privateView(p.id);
      if (!view) continue;
      const json = JSON.stringify(view);
      if (!force && sent.get(p.id) === json) continue;
      sent.set(p.id, json);
      if (p.local) { if (owner._emit) owner._emit({ type: 'private' }); continue; }
      if (p.bot) { if (owner._emit) owner._emit({ type: 'private', bot: p.id }); continue; }
      if (typeof Party === 'undefined' || !Party.post) continue;
      /* The role travels inside the view, and at the top as well so an
         older guest still learns what it is. */
      Party.post('wire', { ev: { type: 'private', view, role: view.role } }, p.id);
    }
  }

  /* Who may hear whom is a fact about the room, so the server enforces
     it — told by the host, which is the only client that knows. */
  function routeSync(owner) {
    if (!Session.isHost || typeof Party === 'undefined' || !Party.setVoiceRoutes) return;
    const routes = Session.voiceRoutes();
    const json = JSON.stringify(routes);
    if (owner._routes === json) return;
    owner._routes = json;
    Party.setVoiceRoutes(routes);
  }

  /* ---------------- host ---------------- */

  const HostTransport = {

    open(emit) {
      this._emit = emit;
      this._sentRoles = new Set();

      this._sentViews = new Map();
      this._routes = null;
      this._offs = EVENTS.map(([name, shape]) =>
        Session.on(name, (a, b) => {
          const ev = shape(a, b);
          emit(ev);                         // the host is a client too
          this._broadcast(ev);
          privateSync(this);
          routeSync(this);
        }));
      this._offs.push(Session.on('private', () => { privateSync(this); routeSync(this); }));

      /* A guest that arrives — or comes back — needs the world as it
         stands, not the next thing that happens in it. */
      this._offJoin = Party.on('roster', () => this._catchUp());
      this._offWire = Party.on('wire', (msg, peerId) => {
        if (!msg) return;
        /* "I am listening now." The host connects its own transport
           the instant it starts the night, which is up to a round trip
           before the two guests have finished their fade and connected
           theirs — so a catch-up sent on connect alone lands in an
           empty room. A guest says hello when it is actually ready and
           the host answers, which makes the handshake the guest's to
           complete rather than a race the host has to win. */
        if (msg.type === 'hello') {
          this._sentRoles.delete(peerId);
          if (this._sentViews) this._sentViews.delete(peerId);
          this._catchUp();
          return;
        }
        if (msg.type !== 'action' || !msg.action) return;
        if (!GUEST_ACTIONS.has(msg.action.type)) return;
        /* An action is stamped with the peer it actually arrived from.
           A client may only ever act as itself, and this is the one
           place that can be enforced. */
        const action = Object.assign({}, msg.action, { playerId: peerId, authority: false });
        Session.dispatch(action);
      });

      this._catchUp();
    },

    close() {
      (this._offs || []).forEach(off => off());
      if (this._offJoin) this._offJoin();
      if (this._offWire) this._offWire();
      this._offs = null; this._offJoin = null; this._offWire = null;
      this._emit = null;
    },

    send(action) {
      const own = Object.assign({}, action, { authority: true });
      /* These are the host speaking about itself rather than about the
         night, and the reducer checks who sent them. A guest gets
         stamped with the peer the packet arrived from; the host has to
         stamp itself — or, for an AI seat, the seat it is playing.
         `leave` names the person who left and is the host's to say. */
      if (actsForSelf(own.type) && !isBotSeat(own.playerId)) {
        own.playerId = Party.selfId();
      }
      Session.dispatch(own);
    },

    /* -------- private -------- */

    _broadcast(ev, toPeer) {
      if (!Session.state) { Party.post('wire', { ev, at: Date.now() }, toPeer); return; }
      Party.post('wire', { ev, state: Session.snapshot(), at: Date.now() }, toPeer);
    },

    _catchUp() {
      if (!Session.state) return;
      for (const p of Session.state.players) {
        if (p.local || p.bot) continue;
        this._broadcast({ type: 'state', state: Session.snapshot(), catchUp: true }, p.id);
        if (this._sentRoles.has(p.id)) continue;
        this._sentRoles.add(p.id);
        if (this._sentViews) this._sentViews.delete(p.id);
      }
      /* Only the readable half of a card crosses the wire, and the deck
         itself decides what that half is. */
      privateSync(this);
      routeSync(this);
    },
  };

  /* ---------------- one machine, three contestants ----------------

     `SoloTransport` is the wire for a night with nobody else on it:
     the loopback, with the two things a party would otherwise have
     supplied bolted on.

     - Every action is stamped `authority`, because there is nobody else
       to be the authority.
     - A contestant's own action (a job, a letter, the poison) is
       stamped with the local player id when it names nobody, for the
       same reason and in the same place the host transport stamps it.

     Nothing else is stamped, and that is load-bearing rather than
     conservative. Half the actions the fire sends are the *ceremony*
     rather than a contestant — `speakName`, `reveal`,
     `pouch` — and the reducer reads a `playerId` on those as "this is
     whose pouch I am opening". Stamping them with whoever is holding
     the mouse pointed every one of them at you, and a queue whose head
     was somebody else simply stopped moving.

     It is only ever installed by `Bots`, and `Bots` only ever runs when
     the hidden argument asked for it. */

  const SoloTransport = {

    open(emit) {
      this._emit = emit;
      this._offs = EVENTS.map(([name, shape]) =>
        Session.on(name, (a, b) => emit(shape(a, b))));
      this._offs.push(Session.on('private', () => emit({ type: 'private' })));
    },

    close() {
      (this._offs || []).forEach(off => off());
      this._offs = null;
      this._emit = null;
    },

    send(action) {
      if (!action) return;
      const own = Object.assign({}, action, { authority: true });
      if (actsForSelf(own.type) && !own.playerId) {
        const me = Session.state && Session.state.players.find(p => p.local);
        own.playerId = me ? me.id : null;
      }
      Session.dispatch(own);
    },
  };

  /* ---------------- guest ---------------- */

  const GuestTransport = {

    open(emit) {
      this._emit = emit;
      this._gotState = false;
      this._gotRole = false;

      /* Listen first, then speak. The reply to a hello can arrive on
         the same tick the hello was sent — it does on a loopback, and
         it can on a fast local network — so registering the handler
         after the send loses exactly the message the send was for. */
      this._off = Party.on('wire', (msg) => {
        if (!msg || !msg.ev) return;
        /* State first, always. See rule 1 at the top of this file. */
        const before = Session.state && Session.state.phase;
        if (msg.state) {
          /* Host absolute timestamps are meaningless if two device clocks
             differ. Preserve the remaining duration at send time and put
             it onto this device's clock. */
          if (msg.at && msg.state.floor && msg.state.floor.endsAt) {
            const left = Math.max(0, msg.state.floor.endsAt - msg.at);
            msg.state.floor.endsAt = Date.now() + left;
          }
          if (msg.at && msg.state.chores) {
            const c = msg.state.chores;
            const shift = Date.now() - msg.at;
            c.startedAt += shift;
            c.endsAt += shift;
          }
          if (msg.at && msg.state.night && msg.state.night.endsAt) {
            msg.state.night.endsAt += Date.now() - msg.at;
          }
          Session.adopt(msg.state, Party.selfId());
        }
        if (msg.ev.type === 'private') {
          if (msg.ev.view) Session.setPrivate(msg.ev.view);
          else Session.setMyRole(msg.ev.role);
          this._gotRole = true;
          emit({ type: 'private' });
          return;
        }
        if (msg.ev.type === 'role') {
          Session.setMyRole(msg.ev.role);
          this._gotRole = true;
          emit({ type: 'private' });
          return;
        }
        if (msg.ev.type === 'state') {
          this._gotState = true;
          emit({ type: 'state', state: Session.state });
          /* A catch-up snapshot is allowed to be the first news this
             client gets. Reconcile the director as well as the reducer. */
          if (before && Session.state && (before !== Session.state.phase
              || (msg.ev.catchUp && Session.state.phase === 'verdict'))) {
            emit({ type: 'phase', phase: Session.state.phase, prev: before, catchUp: true });
          }
          return;
        }
        if (msg.ev.type === 'floor' && Session.state && Session.state.floor) {
          emit(Object.assign({}, msg.ev, { endsAt: Session.state.floor.endsAt }));
          return;
        }
        if (msg.ev.type === 'outcome' && Session.state && Session.state.outcome) {
          emit({ type: 'outcome', outcome: Session.state.outcome });
          return;
        }
        emit(msg.ev);
      });

      /* Now say hello, and keep saying it until the host answers.
         Three tries over two seconds costs nothing and covers a
         dropped first packet, which is the one failure that would
         otherwise leave a guest sitting on the hill with no role and
         no state for the whole night. */
      const hello = () => {
        if (this._gotState && this._gotRole) return;
        Party.post('wire', { type: 'hello' }, Party.hostId);
      };
      hello();
      this._hellos = [setTimeout(hello, 700), setTimeout(hello, 1800)];
    },

    close() {
      if (this._off) this._off();
      (this._hellos || []).forEach(clearTimeout);
      this._hellos = null;
      this._off = null;
      this._emit = null;
    },

    send(action) {
      if (!action) return;
      Party.post('wire', { type: 'action', action }, Party.hostId);
    },
  };

  return { HostTransport, GuestTransport, SoloTransport, EVENTS, GUEST_ACTIONS, SELF_ACTIONS };
})();

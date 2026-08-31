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
    ['outcome',    (o)       => ({ type: 'outcome',    outcome: o })],
  ];
  const GUEST_ACTIONS = new Set([
    'vote', 'name', 'yieldFloor', 'sceneReady', 'syncReady', 'readyResult',
  ]);

  /* ---------------- host ---------------- */

  const HostTransport = {

    open(emit) {
      this._emit = emit;
      this._sentRoles = new Set();

      this._offs = EVENTS.map(([name, shape]) =>
        Session.on(name, (a, b) => {
          const ev = shape(a, b);
          emit(ev);                         // the host is a client too
          this._broadcast(ev);
        }));

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
      if (own.type === 'readyResult') own.playerId = Party.selfId();
      Session.dispatch(own);
    },

    /* -------- private -------- */

    _broadcast(ev, toPeer) {
      if (!Session.state) { Party.post('wire', { ev, at: Date.now() }, toPeer); return; }
      Party.post('wire', { ev, state: Session.snapshot(), at: Date.now() }, toPeer);
    },

    _catchUp() {
      if (!Session.state) return;
      const roles = Session.privateRoles();
      for (const p of Session.state.players) {
        if (p.local) continue;
        this._broadcast({ type: 'state', state: Session.snapshot(), catchUp: true }, p.id);
        if (this._sentRoles.has(p.id)) continue;
        const r = roles.find(x => x.playerId === p.id);
        if (!r) continue;
        this._sentRoles.add(p.id);
        /* Only the readable half of a card crosses the wire. The check
           itself stays on the host, because the host is the only client
           allowed to decide whether it was done. */
        const agendas = (r.agendas || []).map(c => (c
          ? { id: c.id, text: c.text, tell: c.tell, alibi: c.alibi || null,
              hud: c.hud || null }
          : null));
        Party.post('wire', { ev: { type: 'role', role: r.role,
                                   agendas: r.agendas ? agendas : null } }, p.id);
      }
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
          Session.adopt(msg.state, Party.selfId());
        }
        if (msg.ev.type === 'role') {
          Session.setMyRole(msg.ev.role, msg.ev.agendas);
          this._gotRole = true;
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

  return { HostTransport, GuestTransport, EVENTS, GUEST_ACTIONS };
})();

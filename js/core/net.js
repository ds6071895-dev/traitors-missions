/* ------------------------------------------------------------------
   net.js — the seam multiplayer arrives through.

   Everything a scene wants to *do* goes out as `Net.send(action)`, and
   everything that happens comes back through `Net.on(fn)`. Scenes read
   the public state freely — that is the client's copy of what a server
   would have sent — but they never mutate it, and the only role any of
   them may ask for is `Session.myRole()`, which is yours. Hold those
   two lines and the client already speaks the protocol.

   Today the transport is a loopback into the local `Session`. A
   `SocketTransport` implementing the same three methods — open, send,
   close — is the entire multiplayer client.

   Delivery is deferred by a microtask even locally. It costs nothing,
   and it means no scene can quietly come to depend on a reply arriving
   inside the same call stack as the request, which is the one habit
   that would not survive a network.
------------------------------------------------------------------ */
const Net = (() => {

  let transport = null;
  const inbox = new Set();

  const deliver = (event) => inbox.forEach(fn => {
    try { fn(event); } catch (e) { console.warn(e); }
  });

  const soon = (fn) => (typeof queueMicrotask === 'function'
    ? queueMicrotask(fn) : Promise.resolve().then(fn));

  function connect(t) {
    if (transport && transport.close) { try { transport.close(); } catch (e) {} }
    transport = t || null;
    if (transport && transport.open) transport.open(deliver);
    return transport;
  }

  function disconnect() {
    if (transport && transport.close) { try { transport.close(); } catch (e) {} }
    transport = null;
  }

  function send(action) {
    if (!transport || !action) return;
    soon(() => { try { transport.send(action); } catch (e) { console.warn(e); } });
  }

  function on(fn) { inbox.add(fn); return () => inbox.delete(fn); }

  /* Who can hear whom moves with people as well as with the night: a
     host scene asks for the routes to be looked at again now and then.
     Only a transport that sets routes has anything to do. */
  function refreshRoutes() {
    if (transport && transport.refreshRoutes) { try { transport.refreshRoutes(); } catch (e) { console.warn(e); } }
  }

  /* -------- the loopback -------- */

  const LocalTransport = {
    open(emit) {
      this._emit = emit;
      this._offs = [
        Session.on('change',  (s)       => emit({ type: 'state',   state: s })),
        Session.on('phase',   (p, prev) => emit({ type: 'phase',   phase: p, prev })),
        Session.on('beat',    (n)       => emit({ type: 'beat',    n })),
        Session.on('vote',    (v)       => emit({ type: 'vote',    ...v })),
        Session.on('decision',(d)       => emit({ type: 'decision',...d })),
        Session.on('nameReveal',(n)     => emit({ type: 'nameReveal',...n })),
        Session.on('tally',   (t)       => emit({ type: 'tally',   ...t })),
        Session.on('reveal',  (r)       => emit({ type: 'reveal',  ...r })),
        Session.on('floor',   (f)       => emit({ type: 'floor',   ...f })),
        Session.on('scene',   (s)       => emit({ type: 'scene',   ...s })),
        Session.on('sync',    (s)       => emit({ type: 'sync',    ...s })),
        Session.on('expose',  (x)       => emit({ type: 'expose',  ...x })),
        Session.on('chore',   (c)       => emit({ type: 'chore',   ...c })),
        Session.on('bell',    (b)       => emit({ type: 'bell',    ...b })),
        Session.on('night',   (n)       => emit({ type: 'night',   ...n })),
        Session.on('arrive',  (a)       => emit({ type: 'arrive',  ...a })),
        Session.on('murder',  (m)       => emit({ type: 'murder',  ...m })),
        Session.on('cue',     (c)       => emit({ type: 'cue',     ...c })),
        Session.on('private', ()        => emit({ type: 'private' })),
        Session.on('outcome', (o)       => emit({ type: 'outcome', outcome: o })),
      ];
    },
    close() {
      (this._offs || []).forEach(off => off());
      this._offs = null;
      this._emit = null;
    },
    send(action) { Session.dispatch(action); },
  };

  return { connect, disconnect, send, on, refreshRoutes, LocalTransport,
           get connected() { return !!transport; } };
})();

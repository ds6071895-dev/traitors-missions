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

  return { connect, disconnect, send, on, LocalTransport,
           get connected() { return !!transport; } };
})();

/* ------------------------------------------------------------------
   swarm.js — one process pretending to be three machines.

   `party.js` is the only file in the game that touches Trystero, and
   Trystero has already changed shape once: actions used to come back
   as a `[send, receive]` pair and peers used to be watched by calling
   a method, and in 0.25 both became plain objects and properties. That
   change is what "object is not iterable" was, and it happened at the
   CDN rather than in this repo — which is exactly the class of break a
   test has to catch, because nothing here moved.

   So the library is faked twice, once in each API shape, over a swarm
   that can also be told to drop packets between two particular peers.
   `party.test.js` uses it to test the room; `mission-party.test.js`
   uses it to test what gets sent across one. Neither of them should
   have to own a copy.
------------------------------------------------------------------ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

/* ---------------- the swarm ----------------
   One process pretending to be three machines. A room is a set of
   endpoints; a send walks it. Delivery is deferred, because a wire
   that answered inside the caller's stack would let a bug hide. */

function makeSwarm() {
  const rooms = new Map();          // roomId -> Map(peerId -> endpoint)
  const soon = (fn) => setImmediate(fn);

  return {
    rooms,
    open(roomId, peerId, endpoint) {
      if (!rooms.has(roomId)) rooms.set(roomId, new Map());
      const room = rooms.get(roomId);
      const others = [...room.keys()];
      room.set(peerId, endpoint);
      // everybody hears about everybody, both directions
      soon(() => {
        for (const other of others) {
          const o = room.get(other);
          if (!o || this.blocked(peerId, other)) continue;
          o.join(peerId);
          endpoint.join(other);
        }
      });
      return others;
    },
    close(roomId, peerId) {
      const room = rooms.get(roomId);
      if (!room) return;
      room.delete(peerId);
      soon(() => room.forEach(o => o.leave(peerId)));
    },
    /* A relayed swarm is not a bus: two peers can both be in a room and
       still fail to reach each other. `partition` is that, and it is
       the whole reason the third player used to get stuck. */
    partition: new Set(),
    cut(a, b) { this.partition.add(a + '|' + b); this.partition.add(b + '|' + a); },
    blocked(a, b) { return this.partition.has(a + '|' + b); },
    post(roomId, from, channel, data, target) {
      const room = rooms.get(roomId);
      if (!room) return;
      const copy = JSON.parse(JSON.stringify(data === undefined ? null : data));
      soon(() => {
        for (const [id, o] of room) {
          if (id === from) continue;
          if (target && id !== target) continue;
          if (this.blocked(from, id)) continue;
          o.message(channel, copy, from);
        }
      });
    },
  };
}

/* ---------------- Trystero, in both shapes ----------------
   `modern` is 0.25: `makeAction` hands back an object and the peer
   callbacks are assignable properties. `legacy` is what came before:
   a pair to destructure and methods to call. `party.js` is supposed to
   be indifferent. */

function makeTrystero(swarm, selfId, modern) {
  return {
    selfId,
    joinRoom(config, roomId) {
      const handlers = {};                  // channel -> fn
      const peers = { join: null, leave: null, stream: null };

      const endpoint = {
        join: (id) => peers.join && peers.join(id),
        leave: (id) => peers.leave && peers.leave(id),
        message: (channel, data, from) => {
          const fn = handlers[channel];
          if (!fn) return;
          // 0.25 hands the receiver `(payload, { peerId })`; before it,
          // a bare peer id
          fn(data, modern ? { peerId: from } : from);
        },
      };
      swarm.open(roomId, selfId, endpoint);

      const send = (channel) => (data, target) =>
        swarm.post(roomId, selfId, channel, data, target);

      const room = {
        leave() { swarm.close(roomId, selfId); },
      };

      if (modern) {
        room.makeAction = (name) => ({
          send: async (data, opts = {}) => send(name)(data, opts.target),
          get onMessage() { return handlers[name]; },
          set onMessage(fn) { handlers[name] = fn; },
        });
        Object.defineProperties(room, {
          onPeerJoin:  { set(fn) { peers.join = fn; }, get() { return peers.join; } },
          onPeerLeave: { set(fn) { peers.leave = fn; }, get() { return peers.leave; } },
          onPeerStream:{ set(fn) { peers.stream = fn; }, get() { return peers.stream; } },
        });
      } else {
        room.makeAction = (name) => [
          (data, target) => send(name)(data, target),
          (fn) => { handlers[name] = fn; },
        ];
        room.onPeerJoin  = (fn) => { peers.join = fn; };
        room.onPeerLeave = (fn) => { peers.leave = fn; };
        room.onPeerStream = (fn) => { peers.stream = fn; };
      }
      return room;
    },
  };
}
/* One machine: its own copy of the given files, its own window, and a
   Trystero of its own wired to the shared swarm. Extra globals are
   merged in, which is how a client gets the rest of the game stubbed
   around `party.js` without `party.js` knowing. */
function makeClient(swarm, selfId, modern, files = ['js/core/party.js'], extra = {}) {
  const ctx = Object.assign({
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    Promise, Date, Math, JSON,
    Object, Array, Set, Map, String, Number, Boolean, Error, isFinite,
    parseInt, parseFloat, URLSearchParams,
  }, extra);
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.Trystero = makeTrystero(swarm, selfId, modern);
  if (!ctx.addEventListener) ctx.addEventListener = () => {};
  if (!ctx.removeEventListener) ctx.removeEventListener = () => {};
  vm.createContext(ctx);
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const names = new Set();
    for (const m of src.matchAll(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/gm)) names.add(m[1]);
    const handover = [...names].map(n => 'globalThis.' + n + ' = ' + n + ';').join('\n');
    vm.runInContext(src + '\n;' + handover, ctx, { filename: f });
  }
  return ctx;
}

/* The swarm defers, `party.js` awaits, and a roster is two hops. Ten
   turns of the loop is far more than any of it needs and still
   instant. */
const flush = () => new Promise(r => setImmediate(r));
async function settle(n = 10) { for (let i = 0; i < n; i++) await flush(); }

module.exports = { makeSwarm, makeTrystero, makeClient, settle, ROOT };

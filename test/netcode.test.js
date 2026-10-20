/* ------------------------------------------------------------------
   netcode.test.js — what the game puts on the wire, and how a screen
   draws what comes off it.

   The host sends one message per tick of the session however many events
   it raised, carries the state once (and not at all when it has not
   changed), and a guest still hears every event, in order, with a phase
   change reported once. And somebody walking across the castle on a
   jittery line is drawn walking — steadily, never backwards — rather than
   lurching every time a clump of packets lands.

   `COMPARE=path/to/old/castle-net.js` also draws the same walk the old way.
------------------------------------------------------------------ */
const path = require('path');
const H = require('./harness');
const { atest, test, flush, eq, ok, section, report } = H;

const FILES = ['js/core/util.js', 'js/core/state.js', 'js/world/castle-layout.js', 'js/core/chores.js', 'js/core/session.js',
               'js/core/net.js', 'js/core/transports.js'];
const PLAYERS = [{ id: 'host', name: 'Ana' }, { id: 'gst1', name: 'Bo' }, { id: 'gst2', name: 'Cy' }];

function makeParty(selfId, bus) {
  const listeners = new Map();
  const party = {
    connected: true, isHost: selfId === 'host', hostId: 'host', MAX: 8,
    selfId: () => selfId,
    roster: () => PLAYERS.map((p, i) => ({ id: p.id, name: p.name, seat: i, host: p.id === 'host' })),
    on(evt, fn) {
      if (!listeners.has(evt)) listeners.set(evt, new Set());
      listeners.get(evt).add(fn);
      return () => listeners.get(evt).delete(fn);
    },
    post(channel, data, to) {
      bus.sent.push({ from: selfId, channel, data: JSON.parse(JSON.stringify(data)), to });
      for (const [id, deliver] of bus.ends) if (id !== selfId && (!to || to === id)) deliver(channel, JSON.parse(JSON.stringify(data)), selfId);
    },
  };
  bus.ends.set(selfId, (channel, data, from) => { (listeners.get(channel) || []).forEach(fn => fn(data, from)); });
  return party;
}

async function room(seed) {
  const bus = { ends: new Map(), sent: [] };
  const make = (id) => {
    const ctx = H.load(FILES);
    ctx.Party = makeParty(id, bus); ctx.globalThis.Party = ctx.Party;
    ctx.GameState.load();
    return ctx;
  };
  const host = make('host'), g1 = make('gst1'), g2 = make('gst2');
  const seat = (me) => PLAYERS.map(p => Object.assign({}, p, { local: p.id === me }));
  for (const [ctx, id] of [[g1, 'gst1'], [g2, 'gst2']]) {
    ctx.Session.startParty({ seed, players: seat(id), mode: 'guest' });
    ctx.Net.connect(ctx.Transports.GuestTransport);
  }
  host.Session.startParty({ seed, players: seat('host'), mode: 'host' });
  host.Session.setEyes({ reach: () => 1, witnesses: () => ({ ids: [], room: 'hall' }), presence: () => ({}) });
  host.Net.connect(host.Transports.HostTransport);
  for (let i = 0; i < 4; i++) await flush();
  return { bus, host, g1, g2 };
}
const settle = async () => { for (let i = 0; i < 4; i++) await flush(); };
const broadcasts = (bus, from) => bus.sent.filter(m => m.from === 'host' && m.channel === 'wire' && !m.to && m.data && (m.data.ev || m.data.evs)).slice(from);

(async () => {
  section('the host’s wire');

  await atest('one tick of the session is one message, with the state in it once', async () => {
    const { bus, host, g1, g2 } = await room(7);
    const phases = [];
    g1.Net.on(ev => { if (ev.type === 'phase') phases.push(ev.phase); });
    const before = broadcasts(bus).length;
    host.Net.send({ type: 'advance' });
    await settle();
    const sent = broadcasts(bus, before);
    eq(sent.length, 1, 'one broadcast for the move into the castle');
    const evs = sent[0].data.evs || [sent[0].data.ev];
    ok(evs.length >= 2, 'carrying ' + evs.length + ' events');
    ok(sent[0].data.state && sent[0].data.state.phase === 'tasks', 'and the state they left behind');
    ok(evs.every(ev => ev.type !== 'state' || ev.state === undefined), 'not a second copy inside the change event');
    eq([g1, g2].map(c => c.Session.state.phase), ['tasks', 'tasks'], 'the guests followed');
    eq(phases, ['tasks'], 'and heard the phase change once');
  });

  await atest('an event that changes nothing is sent without the state', async () => {
    const { bus, host } = await room(8);
    host.Transports.HostTransport._queue({ type: 'cue', id: 'x' });
    await settle();
    const before = broadcasts(bus).length;
    host.Transports.HostTransport._queue({ type: 'cue', id: 'y' });
    await settle();
    const sent = broadcasts(bus, before);
    eq(sent.length, 1);
    eq(sent[0].data.state, undefined, 'the guests already have this state');
  });

  await atest('a guest still understands the old one-event message, and a batch in order', async () => {
    const { bus, g1 } = await room(9);
    const heard = [];
    g1.Net.on(ev => heard.push(ev.type));
    const toGuest = (data) => bus.ends.get('gst1')('wire', data, 'host');
    toGuest({ ev: { type: 'cue', id: 'one' }, at: Date.now() });
    toGuest({ evs: [{ type: 'bell', left: 30 }, { type: 'cue', id: 'two' }, { type: 'beat', n: 2 }], at: Date.now() });
    await settle();
    eq(heard, ['cue', 'bell', 'cue', 'beat']);
  });

  section('drawing somebody else');

  /* Ana walks along x at 1.5 m/s and says where she is every 66 ms by her
     own clock, which is five seconds out from ours. Her packets take
     anywhere from 20 to 140 ms and arrive in order. We draw her every
     16 ms and look at how far she moves each frame. */
  function walk(file, seed) {
    let clock = 1e6;
    const ctx = H.load(['js/core/util.js', 'js/world/castle-layout.js', file], { Date: { now: () => clock } });
    let handler = null;
    ctx.Party = { connected: true, hostId: 'host', isHost: false, on: (ch, fn) => { handler = fn; return () => {}; }, post() {} };
    ctx.globalThis.Party = ctx.Party;
    ctx.CastleNet.start('d1');
    let r = seed;
    const rand = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296);
    const packets = [];
    let lastAt = 0;
    for (let t = 0; t < 6000; t += 66) {
      const at = Math.max(lastAt, t + 20 + rand() * 120);
      lastAt = at;
      packets.push({ at, msg: { k: 'cpose', d: 'd1', t: 1e6 + 5000 + t, p: [-10 + 1.5 * t / 1000, 12, Math.PI / 2, 0, 0] } });
    }
    const steps = [];
    let prev = null, k = 0, back = 0;
    for (let t = 0; t < 6000; t += 16) {
      clock = 1e6 + t;
      while (k < packets.length && packets[k].at <= t) handler(packets[k++].msg, 'ana');
      const q = ctx.CastleNet.now('ana');
      if (q && prev && t > 400) { steps.push(q.x - prev.x); if (q.x < prev.x - 1e-6) back++; }
      if (q) prev = q;
    }
    const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
    const sd = Math.sqrt(steps.reduce((a, b) => a + (b - mean) * (b - mean), 0) / steps.length);
    return { mean, wobble: sd / mean, back, worst: Math.max(...steps) / mean };
  }

  const NEW = 'js/core/castle-net.js';
  const runs = [11, 12, 13].map(seed => walk(NEW, seed));

  test('a steady walk is drawn as a steady walk, on a jittery line', () => {
    for (const w of runs) {
      ok(Math.abs(w.mean - 1.5 * 0.016) < 0.003, 'pace ' + (w.mean / 0.016).toFixed(2) + ' m/s');
      eq(w.back, 0, 'never drawn going backwards');
      ok(w.wobble < 0.35, 'frame-to-frame wobble ' + Math.round(w.wobble * 100) + '%');
      ok(w.worst < 2.5, 'largest single step ' + w.worst.toFixed(1) + '× the average');
    }
  });

  if (process.env.COMPARE) {
    const old = [11, 12, 13].map(seed => walk(path.relative(H.ROOT, path.resolve(process.env.COMPARE)), seed));
    console.log('\n  wobble, same walk:   old ' + old.map(w => Math.round(w.wobble * 100) + '%').join(' ')
      + '   new ' + runs.map(w => Math.round(w.wobble * 100) + '%').join(' '));
    console.log('  backwards frames:    old ' + old.map(w => w.back).join(' ') + '   new ' + runs.map(w => w.back).join(' '));
    console.log('  worst step:          old ' + old.map(w => w.worst.toFixed(1) + '×').join(' ')
      + '   new ' + runs.map(w => w.worst.toFixed(1) + '×').join(' '));
  }
  report();
})().catch(e => { console.error(e); process.exitCode = 1; });

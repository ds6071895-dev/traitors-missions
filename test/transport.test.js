/* ------------------------------------------------------------------
   transport.test.js — a host and a guest, in one process, on a fake
   wire.

   Two vm contexts, each with its own copy of the whole session layer,
   joined by a bus that does what WebRTC does and nothing else: hand a
   message to the other side. If `HostTransport` and `GuestTransport`
   are right, the guest ends up with the same night as the host, having
   never once run the reducer — and having been told exactly one role,
   which is its own.
------------------------------------------------------------------ */
const H = require('./harness');
const { atest, flush, eq, ok, section } = H;

const FILES = ['js/core/util.js', 'js/core/state.js', 'js/core/missions.js',
               'js/missions/agendas.js', 'js/core/session.js',
               'js/core/net.js', 'js/core/transports.js'];

const PLAYERS = [
  { id: 'host', name: 'Ana', look: null },
  { id: 'gst1', name: 'Bo', look: null },
  { id: 'gst2', name: 'Cy', look: null },
];

/* ---------------- the fake wire ---------------- */

function makeBus() {
  const ends = new Map();          // selfId -> deliver(channel, data, from)
  return {
    join(id, deliver) { ends.set(id, deliver); },
    post(from, channel, data, toPeer) {
      // structured-clone the way a real channel would, so nothing can
      // pass a live object reference between "machines"
      const copy = JSON.parse(JSON.stringify(data === undefined ? null : data));
      for (const [id, deliver] of ends) {
        if (id === from) continue;
        if (toPeer && id !== toPeer) continue;
        deliver(channel, copy, from);
      }
    },
  };
}

function makeParty(selfId, isHost, hostId, bus) {
  const listeners = new Map();
  const party = {
    connected: true,
    isHost,
    hostId,
    MAX: 3,
    selfId: () => selfId,
    roster: () => PLAYERS.map((p, i) => ({ id: p.id, name: p.name, seat: i,
                                           host: p.id === hostId })),
    on(evt, fn) {
      if (!listeners.has(evt)) listeners.set(evt, new Set());
      listeners.get(evt).add(fn);
      return () => listeners.get(evt).delete(fn);
    },
    post(channel, data, toPeer) { bus.post(selfId, channel, data, toPeer); },
  };
  bus.join(selfId, (channel, data, from) => {
    (listeners.get(channel) || []).forEach(fn => fn(data, from));
  });
  return party;
}

function makeClient(selfId, isHost, bus) {
  const ctx = H.load(FILES);
  ctx.Party = makeParty(selfId, isHost, 'host', bus);
  ctx.globalThis.Party = ctx.Party;
  ctx.GameState.load();
  for (const id of ['boat-race', 'shootout']) {
    ctx.Missions.register({ id, name: id, create: () => ({}) });
  }
  return ctx;
}

function seat(ctx, selfId) {
  return PLAYERS.map(p => Object.assign({}, p, { local: p.id === selfId }));
}

async function party(seed) {
  const bus = makeBus();
  const host = makeClient('host', true, bus);
  const g1 = makeClient('gst1', false, bus);
  const g2 = makeClient('gst2', false, bus);

  for (const [ctx, id] of [[g1, 'gst1'], [g2, 'gst2']]) {
    ctx.Session.startParty({ seed, players: seat(ctx, id), mode: 'guest' });
    ctx.Net.connect(ctx.Transports.GuestTransport);
  }
  // the host starts last, so its catch-up finds two guests already listening
  host.Session.startParty({ seed, players: seat(host, 'host'), mode: 'host' });
  host.Net.connect(host.Transports.HostTransport);
  await flush();
  return { host, g1, g2, bus };
}

/* ---------------- the tests ---------------- */

(async () => {

section('transport — the two clients agree');

await atest('a guest is handed the host\'s state without running the reducer', async () => {
  const { host, g1 } = await party(101);
  eq(g1.Session.state.seed, host.Session.state.seed, 'same seed');
  eq(g1.Session.state.phase, host.Session.state.phase, 'same phase');
  eq(g1.Session.state.missions.map(m => m.id),
     host.Session.state.missions.map(m => m.id), 'same running order');
  eq(g1.Session.mode, 'guest', 'and it knows what it is');
});

await atest('an action from a guest is decided by the host and comes back', async () => {
  const { host, g1, g2 } = await party(102);
  g1.Net.send({ type: 'advance' });
  await flush(); await flush();
  eq(host.Session.state.phase, 'mission', 'the host moved');
  eq(g1.Session.state.phase, 'mission', 'the guest that asked was told');
  eq(g2.Session.state.phase, 'mission', 'and so was the one that did not');
});

await atest('a whole ballot converges on all three machines', async () => {
  const { host, g1, g2 } = await party(103);
  host.Net.send({ type: 'advance' });
  await flush(); await flush();
  host.Net.send({ type: 'result', earned: 2000, completed: true, players: [] });
  await flush(); await flush();
  host.Net.send({ type: 'advance' });
  await flush(); await flush();
  host.Net.send({ type: 'result', earned: 3000, completed: true, players: [] });
  await flush(); await flush();
  eq(host.Session.state.phase, 'finale', 'the fire is lit');

  host.Net.send({ type: 'vote', playerId: 'host', choice: 'end' });
  g1.Net.send({ type: 'vote', choice: 'end' });
  g2.Net.send({ type: 'vote', choice: 'end' });
  await flush(); await flush(); await flush();

  eq(host.Session.state.finale.stage, 'decisions', 'the ballot closed on the host');
  eq(g1.Session.state.finale.stage, 'decisions', 'and on both guests');
  eq(g2.Session.state.finale.stage, 'decisions', '');
  eq(g1.Session.state.pot, 5000, 'the pot agrees too');
});

await atest('a guest that connects late still gets the whole night', async () => {
  /* The real order of events, not the convenient one. The host starts
     the moment it presses the button; both guests are a fade and a
     round trip behind it, so the host's catch-up goes out before
     either of them is listening. The guest's hello is what recovers
     it, and this is the test that would fail without one. */
  const bus = makeBus();
  const host = makeClient('host', true, bus);
  host.Session.startParty({ seed: 555, players: seat(host, 'host'), mode: 'host' });
  host.Net.connect(host.Transports.HostTransport);
  await flush(); await flush();

  const g1 = makeClient('gst1', false, bus);
  g1.Session.startParty({ seed: 0, players: seat(g1, 'gst1'), mode: 'guest' });
  g1.Net.connect(g1.Transports.GuestTransport);
  await flush(); await flush(); await flush();

  eq(g1.Session.state.seed, 555, 'the late guest was caught up');
  ok(g1.Session.myRole(), 'and told what it is');
  eq(g1.Session.state.phase, host.Session.state.phase, 'on the right phase');
});

await atest('a guest joining mid-run lands on the phase in progress', async () => {
  const bus = makeBus();
  const host = makeClient('host', true, bus);
  host.Session.startParty({ seed: 556, players: seat(host, 'host'), mode: 'host' });
  host.Net.connect(host.Transports.HostTransport);
  await flush();
  host.Net.send({ type: 'advance' });
  await flush(); await flush();
  host.Net.send({ type: 'result', earned: 1200, completed: true, players: [] });
  await flush(); await flush();
  eq(host.Session.state.phase, 'table', 'the host has moved on');

  const g2 = makeClient('gst2', false, bus);
  g2.Session.startParty({ seed: 0, players: seat(g2, 'gst2'), mode: 'guest' });
  g2.Net.connect(g2.Transports.GuestTransport);
  await flush(); await flush(); await flush();

  eq(g2.Session.state.phase, 'table', 'and the guest arrives where it actually is');
  eq(g2.Session.state.pot, 1200, 'with the pot as it stands');
});

section('transport — what a client may claim');

await atest('a guest can only ever act as itself', async () => {
  const { host, g1 } = await party(104);
  host.Net.send({ type: 'advance' });
  await flush(); await flush();
  host.Net.send({ type: 'result', earned: 1, completed: true, players: [] });
  await flush(); await flush();
  host.Net.send({ type: 'advance' });
  await flush(); await flush();
  host.Net.send({ type: 'result', earned: 1, completed: true, players: [] });
  await flush(); await flush();

  // gst1 tries to cast gst2's vote
  g1.Net.send({ type: 'vote', playerId: 'gst2', choice: 'banish' });
  await flush(); await flush();
  const votes = host.Session.state.finale.votes;
  eq(votes.gst2, undefined, 'the impersonation did not land');
  eq(votes.gst1, 'banish', 'it was recorded as the sender, as it should be');
});

section('transport — the secret');

await atest('each client is told one role, and it is its own', async () => {
  const { host, g1, g2 } = await party(105);
  const truth = host.Session.privateRoles();
  const mine = (id) => truth.find(r => r.playerId === id).role;

  eq(g1.Session.myRole(), mine('gst1'), 'guest one knows itself');
  eq(g2.Session.myRole(), mine('gst2'), 'guest two knows itself');
  eq(host.Session.myRole(), mine('host'), 'and so does the host');
});

await atest('nothing a guest holds says what anybody else is', async () => {
  /* Enough seeds to land a traitor in every seat, and no more: each one
     stands up three whole clients, and a suite nobody runs because it
     takes two minutes holds nothing down at all. The exhaustive version
     of this check lives in `privacy.test.js`, which walks a hundred and
     twenty nights inside a single context and costs nothing. */
  for (let seed = 200; seed < 214; seed++) {
    const { host, g1, g2 } = await party(seed);
    for (const [name, ctx] of [['gst1', g1], ['gst2', g2]]) {
      const snap = JSON.stringify(ctx.Session.snapshot());
      ok(!/traitor|faithful/i.test(snap),
         name + ' had a role in its state at seed ' + seed);
      eq(ctx.Session._peek(), { has: false, seat: -1 },
         name + ' drew a role table of its own at seed ' + seed);
      eq(ctx.Session.privateRoles(), [], name + ' could tell somebody else');
    }
    // and the host's own knowledge never went out as state
    ok(!/traitor|faithful/i.test(JSON.stringify(host.Session.snapshot())),
       'the host leaked at seed ' + seed);
  }
});

await atest('only a traitor is ever sent a card', async () => {
  let sawTraitor = 0, sawFaithful = 0;
  for (let seed = 300; seed < 316; seed++) {
    const { host, g1, g2 } = await party(seed);
    for (const ctx of [g1, g2]) {
      if (ctx.Session.myRole() === 'traitor') {
        sawTraitor++;
        ok(ctx.Session.myAgenda(0), 'a traitor guest was sent no card');
        ok(ctx.Session.myAgenda(0).text, 'and the card is readable');
        ok(ctx.Session.myAgenda(0).check === undefined,
           'the check function must never cross the wire');
      } else {
        sawFaithful++;
        eq(ctx.Session.myAgenda(0), null, 'a faithful guest was sent a card');
      }
    }
  }
  ok(sawTraitor > 0 && sawFaithful > 0,
     'the sweep saw both kinds (' + sawTraitor + ' / ' + sawFaithful + ')');
});

section('transport — the exposure');

await atest('a clean night answers "nobody", promptly', async () => {
  /* The bug this covers: if the host only asked when it had something
     to reveal, a clean night would send nothing — and a guest cannot
     tell "nobody" from "still in flight", so all three would sit
     through a timeout before every round table. */
  for (let seed = 600; seed < 640; seed++) {
    const { host, g1, g2 } = await party(seed);
    if (host.Session._peek().has) continue;

    const heard = { g1: 'unset', g2: 'unset' };
    g1.Net.on((e) => { if (e.type === 'expose') heard.g1 = e; });
    g2.Net.on((e) => { if (e.type === 'expose') heard.g2 = e; });

    host.Net.send({ type: 'expose' });
    await flush(); await flush();

    eq(heard.g1, { type: 'expose', playerId: null }, 'guest one got a definite answer');
    eq(heard.g2, { type: 'expose', playerId: null }, 'guest two got a definite answer');
    return;
  }
  throw new Error('no clean night in the sweep');
});

await atest('an exposure reaches both guests as an event', async () => {
  for (let seed = 400; seed < 460; seed++) {
    const { host, g1, g2 } = await party(seed);
    if (!host.Session._peek().has) continue;

    const heard = { g1: null, g2: null };
    g1.Net.on((e) => { if (e.type === 'expose') heard.g1 = e; });
    g2.Net.on((e) => { if (e.type === 'expose') heard.g2 = e; });

    host.Net.send({ type: 'advance' });
    await flush(); await flush();
    // a hand that completes nothing, so whatever card was dealt fails
    host.Net.send({ type: 'result', earned: 10, completed: true,
      players: PLAYERS.map(p => ({ playerId: p.id, name: p.name, stats: {} })) });
    await flush(); await flush();
    if (!host.Session.hasExposure()) continue;

    host.Net.send({ type: 'expose' });
    await flush(); await flush();
    ok(heard.g1 && heard.g1.playerId, 'guest one was not told');
    ok(heard.g2 && heard.g2.playerId, 'guest two was not told');
    eq(heard.g1.playerId, heard.g2.playerId, 'and they were told the same name');
    eq(heard.g1.role, 'traitor', 'with the role on it, which is the point');

    eq(g1.Session.playerById(heard.g1.playerId).alive, false,
       'the guest sees them out');

    host.Net.send({ type: 'exposeDone' });
    await flush(); await flush();
    eq(g1.Session.state.phase, 'verdict', 'and the night ends on every machine');
    eq(g1.Session.state.outcome.reason, 'agenda', 'for the right reason');
    return;
  }
  throw new Error('no seed in the sweep produced a failed agenda');
});

H.report();

})();

/* ------------------------------------------------------------------
   transport.test.js — a host and two guests, in one process, on a fake
   wire.

   Three vm contexts, each with its own copy of the whole session layer,
   joined by a bus that does what the room server does and nothing
   else: hand a message to the other side. If `HostTransport` and
   `GuestTransport` are right, the guests end up with the same game as
   the host, having never once run the reducer — and having been told
   exactly one role, which is their own, and one list of jobs, which is
   their own.
------------------------------------------------------------------ */
const H = require('./harness');
const { atest, flush, eq, ok, section } = H;

const FILES = ['js/core/util.js', 'js/core/state.js', 'js/world/castle-layout.js', 'js/core/chores.js', 'js/core/session.js',
               'js/core/net.js', 'js/core/transports.js'];

const PLAYERS = [
  { id: 'host', name: 'Ana', look: null },
  { id: 'gst1', name: 'Bo', look: null },
  { id: 'gst2', name: 'Cy', look: null },
];

/* ---------------- the fake wire ---------------- */

function makeBus() {
  const ends = new Map();
  return {
    join(id, deliver) { ends.set(id, deliver); },
    post(from, channel, data, toPeer) {
      for (const [id, deliver] of ends) {
        if (id === from) continue;
        if (toPeer && id !== toPeer) continue;
        deliver(channel, JSON.parse(JSON.stringify(data === undefined ? null : data)), from);
      }
    },
  };
}

function makeParty(selfId, isHost, hostId, bus) {
  const listeners = new Map();
  const party = {
    connected: true, isHost, hostId, MAX: 8,
    selfId: () => selfId,
    roster: () => PLAYERS.map((p, i) => ({ id: p.id, name: p.name, seat: i, host: p.id === hostId })),
    on(evt, fn) {
      if (!listeners.has(evt)) listeners.set(evt, new Set());
      listeners.get(evt).add(fn);
      return () => listeners.get(evt).delete(fn);
    },
    post(channel, data, toPeer) { bus.post(selfId, channel, data, toPeer); },
  };
  bus.join(selfId, (channel, data, from) => { (listeners.get(channel) || []).forEach(fn => fn(data, from)); });
  return party;
}

function makeClient(selfId, isHost, bus, extra) {
  const ctx = H.load(FILES, extra);
  ctx.Party = makeParty(selfId, isHost, 'host', bus);
  ctx.globalThis.Party = ctx.Party;
  ctx.GameState.load();
  return ctx;
}

const seat = (selfId) => PLAYERS.map(p => Object.assign({}, p, { local: p.id === selfId }));

async function party(seed) {
  const bus = makeBus();
  const host = makeClient('host', true, bus);
  const g1 = makeClient('gst1', false, bus);
  const g2 = makeClient('gst2', false, bus);
  for (const [ctx, id] of [[g1, 'gst1'], [g2, 'gst2']]) {
    ctx.Session.startParty({ seed, players: seat(id), mode: 'guest' });
    ctx.Net.connect(ctx.Transports.GuestTransport);
  }
  host.Session.startParty({ seed, players: seat('host'), mode: 'host' });
  host.Session.setEyes({ reach: () => 1, witnesses: (a, b) => ({ ids: ['host', 'gst1', 'gst2'].filter(x => x !== a && x !== b), room: 'hall' }),
                         presence: () => ({}) });
  host.Net.connect(host.Transports.HostTransport);
  await flush();
  return { host, g1, g2, bus, all: { host, gst1: g1, gst2: g2 } };
}

async function settle() { for (let i = 0; i < 4; i++) await flush(); }

/* ---------------- the tests ---------------- */

(async () => {

section('transport — the clients agree');

await atest('a guest is handed the host\'s state without running the reducer', async () => {
  const { host, g1 } = await party(101);
  eq(g1.Session.state.seed, host.Session.state.seed, 'same seed');
  eq(g1.Session.state.phase, host.Session.state.phase, 'same phase');
  eq(g1.Session.mode, 'guest', 'and it knows what it is');
  eq(g1.Session.state.players.find(p => p.local).id, 'gst1', 'the snapshot is localised to the receiving player');
  eq(host.Session.state.players.find(p => p.local).id, 'host', 'without changing the authority\'s point of view');
});

await atest('public scenes and private-script joins wait for every browser', async () => {
  const { host, g1, g2 } = await party(1001);
  host.Net.send({ type: 'sceneReady', phase: 'hill' });
  g1.Net.send({ type: 'sceneReady', phase: 'hill' });
  await settle();
  ok(!host.Session.state.scene.started, 'two loaded clients do not start without the third');
  g2.Net.send({ type: 'sceneReady', phase: 'hill' });
  await settle();
  ok(host.Session.state.scene.started && g1.Session.state.scene.started, 'the room starts together');
  host.Net.send({ type: 'syncReady', key: 'private-done' });
  g2.Net.send({ type: 'syncReady', key: 'private-done' });
  await settle();
  eq(host.Session.state.syncPassed, [], 'a shared line cannot outrun private material');
  g1.Net.send({ type: 'syncReady', key: 'private-done' });
  await settle();
  eq(g2.Session.state.syncPassed, ['private-done'], 'all clients cross the same barrier');
});

await atest('only the host may move the running order, and everybody goes into the castle together', async () => {
  const { host, g1, g2 } = await party(102);
  g1.Net.send({ type: 'advance' });
  await settle();
  eq(host.Session.state.phase, 'hill', 'a guest cannot skip the shared scene');
  host.Net.send({ type: 'advance' });
  await settle();
  eq([host, g1, g2].map(c => c.Session.state.phase), ['tasks', 'tasks', 'tasks'], 'into the castle, all three');
  ok(g1.Session.state.chores && g1.Session.state.chores.endsAt > Date.now(), 'with the day\'s clock running');
});

section('transport — the day, over the wire');

await atest('a guest\'s jobs are its own: it is sent its list, does them, and is paid', async () => {
  const { host, g1 } = await party(103);
  host.Net.send({ type: 'advance' });
  await settle();
  const mine = g1.Session.myPrivate().jobs;
  eq(mine, host.Session.privateView('gst1').jobs, 'the guest was sent exactly its own list');
  const job = mine.find(j => j.kind === 'station');
  g1.Net.send({ type: 'chore', jobId: job.id });
  await settle();
  eq(host.Session.state.chores.done.gst1, 1, 'the host paid the guest for it');
  eq(g1.Session.state.pot, host.Session.state.pot, 'and the pot agrees everywhere');
  ok(g1.Session.myPrivate().jobs.find(j => j.id === job.id).done, 'and it is ticked off on the guest');
});

await atest('a guest shuts a door; every screen sees it shut, and the host routes the voices', async () => {
  const { host, g1, g2 } = await party(105);
  const routes = [];
  host.Party.setVoiceRoutes = (r) => routes.push(r);
  host.Session.setEyes({ reach: () => 1, witnesses: () => ({ ids: [], room: 'study' }),
                         presence: () => ({ gst1: { room: 'study', with: [] }, host: { room: 'hall', with: [] } }),
                         nearDoor: () => true, inDoorway: () => false });
  host.Net.send({ type: 'advance' });
  await settle();
  g1.Net.send({ type: 'door', doorId: 'study', shut: true });
  await settle();
  eq(host.Session.state.doors, { study: 1 }, 'the host shut it');
  eq(g2.Session.state.doors, { study: 1 }, 'and the other guest sees it shut');
  eq(routes[routes.length - 1].rooms, [['gst1']], 'the guest in the study is in a world of its own');
});

await atest('a guest can only ever act as itself', async () => {
  const { host, g1 } = await party(104);
  host.Net.send({ type: 'advance' });
  await settle();
  const theirs = host.Session.privateView('gst2').jobs.find(j => j.kind === 'station');
  const mine = host.Session.privateView('gst1').jobs.find(j => j.id === theirs.id);
  g1.Net.send({ type: 'chore', playerId: 'gst2', jobId: theirs.id });
  await settle();
  eq(host.Session.state.chores.done.gst2, 0, 'the impersonation did not land');
  eq(host.Session.state.chores.done.gst1, mine && mine.kind === 'station' && !mine.done ? 1 : 0,
     'it was recorded as the sender, as it should be');
});

await atest('a guest carrying the poison can use it, and nothing public says so', async () => {
  let seen = 0;
  for (let seed = 400; seed < 440 && seen < 2; seed++) {
    const { host, all } = await party(seed);
    const carrier = host.Session._peek().carrier;
    if (carrier === 'host') continue;
    host.Net.send({ type: 'advance' });
    await settle();
    const g = all[carrier];
    ok(g.Session.myPrivate().poison && g.Session.myPrivate().poison.mine, 'the guest knows it carries it');
    const victim = ['host', 'gst1', 'gst2'].find(id => id !== carrier);
    const before = JSON.stringify(host.Session.snapshot());
    g.Net.send({ type: 'poison', targetId: victim });
    await settle();
    eq(host.Session._peek().poison && host.Session._peek().poison.target, victim, 'it reached the host');
    eq(JSON.stringify(host.Session.snapshot()), before, 'and no snapshot moved for it');
    ok(g.Session.myPrivate().poison.used, 'the carrier was told it worked');
    const other = all[['host', 'gst1', 'gst2'].find(id => id !== carrier && id !== victim)];
    ok(other.Session.myPrivate().notes.some(n => n.kind === 'handover' && n.a === carrier && n.b === victim),
       'and the one watching wrote down what they saw');
    seen++;
  }
  ok(seen > 0, 'the sweep found a guest carrier');
});

await atest('the day\'s clock is rebased onto a guest\'s own clock', async () => {
  const bus = makeBus();
  const skew = 3600 * 1000;
  class Skewed extends Date { static now() { return Date.now() + skew; } }
  const host = makeClient('host', true, bus);
  const g1 = makeClient('gst1', false, bus, { Date: Skewed });
  g1.Session.startParty({ seed: 5, players: seat('gst1'), mode: 'guest' });
  g1.Net.connect(g1.Transports.GuestTransport);
  host.Session.startParty({ seed: 5, players: seat('host'), mode: 'host' });
  host.Net.connect(host.Transports.HostTransport);
  host.Net.send({ type: 'advance' });
  await settle();
  const left = g1.Session.state.chores.endsAt - Skewed.now();
  ok(left > 170000 && left <= 181000, 'three minutes left on the guest\'s own clock: ' + left);
});

section('transport — the secret');

await atest('each client is told one role, and it is its own', async () => {
  const { host, g1, g2 } = await party(105);
  const truth = host.Session.privateRoles();
  const mine = (id) => truth.find(r => r.playerId === id).role;
  eq(g1.Session.myRole(), mine('gst1'));
  eq(g2.Session.myRole(), mine('gst2'));
  eq(host.Session.myRole(), mine('host'));
});

await atest('nothing a guest holds says what anybody else is, or what anybody else must do', async () => {
  for (let seed = 200; seed < 214; seed++) {
    const { host, g1, g2 } = await party(seed);
    host.Net.send({ type: 'advance' });
    await settle();
    for (const [name, ctx] of [['gst1', g1], ['gst2', g2]]) {
      const snap = JSON.stringify(ctx.Session.snapshot());
      ok(!/traitor|faithful|carrier|poison|jobs/i.test(snap), name + ' had a secret in its state at seed ' + seed);
      const pk = ctx.Session._peek();
      eq({ has: pk.has, seat: pk.seat }, { has: false, seat: -1 }, name + ' drew a role table of its own');
      eq(ctx.Session.privateRoles(), [], name + ' could tell somebody else');
      const v = ctx.Session.myPrivate();
      eq(v.poison !== null, v.role === 'traitor', 'only a Traitor is told about the poison');
    }
    ok(!/traitor|faithful|carrier|poison/i.test(JSON.stringify(host.Session.snapshot())), 'the host leaked at seed ' + seed);
  }
});

section('transport — the exposure');

await atest('an exposure reaches both guests as an event, and it is the carrier', async () => {
  const { host, g1, g2 } = await party(150);
  const carrier = host.Session._peek().carrier;
  host.Net.send({ type: 'advance' });
  await settle();
  const realNow = host.Date.now;
  const end = host.Session.state.chores.endsAt + 50;
  host.Date.now = () => end;
  host.Net.send({ type: 'tasksTick' });
  await settle();
  eq(host.Session.state.phase, 'night', 'the bell went with the poison unused');
  // the night runs out, and breakfast finds everybody
  host.Date.now = () => end + 60000;
  host.Net.send({ type: 'nightTick' });
  await settle();
  host.Date.now = realNow;
  for (let k = 0; k < 12 && !host.Session.state.breakfast.revealed; k++) {
    host.Net.send({ type: 'breakfastNext' });
    await settle();
  }
  host.Net.send({ type: 'advance' });
  await settle();
  eq(host.Session.state.phase, 'table', 'and then the round table');
  const told = [];
  for (const c of [g1, g2]) c.Net.on(e => { if (e.type === 'expose') told.push(e.playerId); });
  host.Net.send({ type: 'expose' });
  await settle();
  eq(told, [carrier, carrier], 'both guests were told who');
  ok(!g1.Session.playerById(carrier).alive, 'and their state agrees they are gone');
});

H.report();
})();

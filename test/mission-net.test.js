/* Multiplayer mission protocol: load gates, run scoping and host-owned boards. */
const H = require('./harness');
const { atest, flush, eq, ok, section } = H;

const PLAYERS = [
  { id: 'host', name: 'Ana', alive: true },
  { id: 'g1', name: 'Bo', alive: true },
  { id: 'g2', name: 'Cy', alive: true },
];

function bus() {
  const ends = new Map();
  return {
    join(id, deliver) { ends.set(id, deliver); },
    post(from, channel, data, to) {
      for (const [id, deliver] of ends) {
        if (id === from || (to && id !== to)) continue;
        deliver(channel, JSON.parse(JSON.stringify(data)), from);
      }
    },
  };
}

function client(id, isHost, wire) {
  const ctx = H.load(['js/core/util.js', 'js/core/mission-net.js'], {
    Session: { running: true, state: { players: PLAYERS } },
    MissionParty: { running: false },
  });
  const listeners = new Map();
  ctx.Party = {
    connected: true,
    isHost,
    hostId: 'host',
    selfId: () => id,
    roster: () => PLAYERS,
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
      return () => listeners.get(name).delete(fn);
    },
    post(name, data, to) { wire.post(id, name, data, to); },
  };
  ctx.globalThis.Party = ctx.Party;
  wire.join(id, (name, data, from) => {
    (listeners.get(name) || []).forEach(fn => fn(data, from));
  });
  return ctx;
}

function room() {
  const wire = bus();
  return {
    wire,
    host: client('host', true, wire),
    g1: client('g1', false, wire),
    g2: client('g2', false, wire),
  };
}

(async () => {
  section('mission net — one shared run');

  await atest('the countdown waits until every device has built the mission', async () => {
    const { host, g1, g2 } = room();
    host.MissionNet.attach('shootout');
    g1.MissionNet.attach('shootout');
    let h = false, a = false, b = false;
    host.MissionNet.waitForStart().then(() => { h = true; });
    g1.MissionNet.waitForStart().then(() => { a = true; });
    await flush();
    ok(!h && !a, 'two ready clients do not start a three-player run');
    g2.MissionNet.attach('shootout');
    g2.MissionNet.waitForStart().then(() => { b = true; });
    await flush(); await flush();
    ok(h && a && b, 'all countdowns are released by the same host event');
    host.MissionNet.detach(); g1.MissionNet.detach(); g2.MissionNet.detach();
  });

  await atest('stale mission packets and guest-authored boards are ignored', async () => {
    const { wire, host, g1, g2 } = room();
    for (const c of [host, g1, g2]) c.MissionNet.attach('boat-race');
    await flush(); await flush();
    let events = 0;
    g2.MissionNet.on('event', () => { events++; });
    wire.post('g1', 'mev', { k: 'event', m: 'shootout', data: { kind: 'finish' } });
    wire.post('g1', 'mev', { k: 'board', m: 'boat-race', board: { earned: 999999 } }, 'g2');
    await flush();
    eq(events, 0, 'traffic from the previous mission cannot enter this one');
    eq(g2.MissionNet.board, null, 'a guest cannot forge the shared result');
    host.MissionNet.detach(); g1.MissionNet.detach(); g2.MissionNet.detach();
  });

  await atest('the host stamps report identity and publishes one board', async () => {
    const { host, g1, g2 } = room();
    for (const c of [host, g1, g2]) c.MissionNet.attach('boat-race');
    await flush(); await flush();
    const hp = host.MissionNet.report({ earned: 100, completed: true });
    const ap = g1.MissionNet.report({ playerId: 'g2', earned: 200, completed: true });
    const bp = g2.MissionNet.report({ earned: 300, completed: true });
    const [board] = await Promise.all([hp, ap, bp]);
    eq(board.earned, 600, 'all three reports are counted once');
    eq(board.players.map(p => p.playerId).sort(), ['g1', 'g2', 'host'],
       'wire identity overrides a claimed player id');
    eq(g1.MissionNet.board.earned, 600, 'guests adopt the host board');
    host.MissionNet.detach(); g1.MissionNet.detach(); g2.MissionNet.detach();
  });

  H.report();
})();

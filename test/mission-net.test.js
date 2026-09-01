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

/* The straggler logic is written in seconds a test cannot afford to
   spend, so the clients under test are handed a `setTimeout` that
   counts a thousand times faster. `Date.now` is left alone on purpose:
   the "are they still playing" question is answered from real wall
   clock, and a test that ran fast enough would answer it correctly by
   accident rather than by the code being right. */
const quick = { setTimeout: (fn, ms) => setTimeout(fn, Math.ceil((ms || 0) / 1000)) };

function client(id, isHost, wire, extra) {
  const ctx = H.load(['js/core/util.js', 'js/core/mission-net.js'], Object.assign({
    Session: { running: true, state: { players: PLAYERS } },
    MissionParty: { running: false },
  }, extra || {}));
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
  /* Somebody's connection dropping is a `Party` event rather than
     anything on the wire, so a test has to be able to say it happened. */
  ctx.__left = (peerId) => {
    (listeners.get('left') || []).forEach(fn => fn(peerId, null));
  };
  return ctx;
}

function room(extra) {
  const wire = bus();
  return {
    wire,
    host: client('host', true, wire, extra),
    g1: client('g1', false, wire, extra),
    g2: client('g2', false, wire, extra),
  };
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));

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

  await atest('a player still out on the course is not timed out of the board', async () => {
    const { host, g1, g2 } = room(quick);
    for (const c of [host, g1, g2]) c.MissionNet.attach('boat-race');
    await flush(); await flush();

    let board = null;
    host.MissionNet.report({ earned: 100, completed: true }).then(b => { board = b; });
    g1.MissionNet.report({ earned: 200, completed: true });
    await flush(); await flush();

    /* Cy is thirty seconds behind and still driving. Every pose is the
       host being told so. */
    for (let i = 0; i < 6; i++) {
      g2.MissionNet.pose(1, () => ({ s: i }));
      await wait(6);
    }
    ok(!board, 'the board is not published while somebody is still racing');

    g2.MissionNet.report({ earned: 300, completed: true });
    await flush(); await flush();
    ok(board, 'and it is published the moment they cross the line');
    eq(board.earned, 600, 'the straggler is on it, and so is their money');
    host.MissionNet.detach(); g1.MissionNet.detach(); g2.MissionNet.detach();
  });

  await atest('a player who has gone quiet is not waited for forever', async () => {
    const { host, g1, g2 } = room(quick);
    for (const c of [host, g1, g2]) c.MissionNet.attach('boat-race');
    await flush(); await flush();

    let board = null;
    host.MissionNet.report({ earned: 100, completed: true }).then(b => { board = b; });
    g1.MissionNet.report({ earned: 200, completed: true });
    // g2 says nothing at all: no report, and no pose either.
    await wait(40);
    ok(board, 'a silent player does not hold the scoreboard shut');
    eq(board.earned, 300, 'and the two who finished still get their money');
    host.MissionNet.detach(); g1.MissionNet.detach(); g2.MissionNet.detach();
  });

  await atest('a host that walks out does not leave a guest waiting on a board', async () => {
    const { host, g1, g2 } = room(quick);
    for (const c of [host, g1, g2]) c.MissionNet.attach('boat-race');
    await flush(); await flush();

    let settled = 'unset';
    g1.MissionNet.report({ earned: 200, completed: true }).then(b => { settled = b; });
    await flush(); await flush();
    eq(settled, 'unset', 'the guest is waiting, as it should be');

    g1.__left('host');            // the host's tab closes
    await flush(); await flush();
    eq(settled, null, 'and is released the moment the only board-builder goes');
    g1.MissionNet.detach(); g2.MissionNet.detach();
  });

  H.report();
})();

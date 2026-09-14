/* MissionParty and MissionNet against the real Node server. Rendering and
   mission scoring are separate tests; every room/setup/start/report path here
   uses the production modules and real WebSocket connections. */
const assert = require('node:assert/strict');
const { WebSocket } = require('ws');
const { createServer } = require('../server');
const H = require('./harness');
const { atest, eq, ok, report } = H;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) {
  const end = Date.now() + 4000;
  while (!fn()) { if (Date.now() > end) throw new Error('Timed out'); await delay(5); }
}

(async () => {
  const app = createServer();
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + app.server.address().port;
  const clients = [];
  function client(name, deferTransitions = false) {
    const launched = [], sockets = [], transitions = [], elements = new Map();
    let ctx, pot = 0;
    class Socket extends WebSocket { constructor(url) { super(url); sockets.push(this); } }
    const element = id => {
      if (!elements.has(id)) elements.set(id, { addEventListener() {}, classList: { toggle() {}, add() {}, remove() {} } });
      return elements.get(id);
    };
    ctx = H.load(['js/core/util.js', 'js/core/room-socket.js', 'js/core/party.js',
      'js/core/mission-net.js', 'js/core/mission-party.js'], {
      WebSocket: Socket, URL, URLSearchParams, location: { href: origin + '/', hash: '' },
      history: { replaceState() {} }, navigator: {}, addEventListener() {}, removeEventListener() {},
      document: { getElementById: element, activeElement: null },
      Screens: { current: 'test', show() {}, register() {},
        transition: fn => deferTransitions ? transitions.push(fn) : fn() },
      Session: { state: null },
      Game: { enterShow() {}, showAttract() {}, toMenu() {} },
      Engine: { setPaused() {} },
      AudioBus: { resume() {}, play() {} }, Voice: { unlock() {} },
      VoiceChat: { init() {}, listen() {}, stop() {}, on() {} },
      Look: { getName: () => name, get: () => null },
      RoomUI: { paintMic() {} }, UINav: { scan() {} },
      GameState: { addToPot: n => { pot += n; } },
      Missions: {
        get: id => ({ id, name: id, setup: true, maxPrize: 1000, modes: { prize: { id: 'prize' } },
          quickStart: id === 'shootout' ? { opts: { bossRush: true, mode: 'prize' } } : null }),
        launch(id, opts) { launched.push({ id, opts }); ctx.MissionNet.attach(id); },
        end() {}, setPotSink: () => () => {},
      },
    });
    ctx.MissionParty.init();
    ctx.Party.on('left', (_, seat) => ctx.MissionParty.peerLeft(seat));
    ctx.Party.on('closed', () => ctx.MissionParty.leave());
    const c = { ...ctx, launched, sockets, transitions, get pot() { return pot; } };
    clients.push(c); return c;
  }
  try {
    for (const missionId of ['boat-race', 'shootout', 'dive', 'ski']) {
      await atest(missionId + ': invite, setup, start barrier, live messages, board, and replay', async () => {
        const A = client('Ana'), B = client('Bo'), C = client('Cy');
        const group = [A, B, C];
        await A.MissionParty.openFor(missionId);
        const code = A.Party.code;
        await B.MissionParty.joinCode(code, missionId);
        await C.MissionParty.joinCode(code, missionId);
        await until(() => A.Party.roster().length === 3 && C.MissionParty.setup?.seed);
        A.MissionParty.choose({ seed: 424242, modId: 'test-twist', skip: missionId === 'shootout' });
        await until(() => group.every(c => c.MissionParty.setup.seed === 424242));
        A.MissionParty.start();
        await until(() => group.every(c => c.launched.length === 1));
        await Promise.race([
          Promise.all(group.map(c => c.MissionNet.waitForStart())),
          delay(3500).then(() => { throw new Error('Start barrier stalled'); }),
        ]);
        for (const c of group) {
          eq(c.launched[0].id, missionId);
          eq(c.launched[0].opts.seed, 424242);
          eq(c.launched[0].opts.ghost, false);
          eq(c.launched[0].opts.players.filter(p => p.local).length, 1);
          if (missionId === 'shootout') eq(c.launched[0].opts.bossRush, true);
        }
        B.MissionNet.pose(1, () => ({ x: 12, z: 34 }));
        await until(() => A.MissionNet.seen(B.Party.selfId()) && C.MissionNet.seen(B.Party.selfId()));
        const received = [];
        const off = A.MissionNet.on('event', (data, id) => received.push({ data, id }));
        B.sockets.at(-1).terminate();
        await until(() => B.Party.reconnecting);
        B.MissionNet.toHost({ k: 'mission-test' });
        await until(() => !B.Party.reconnecting && received.length === 1);
        eq(received[0].id, B.Party.selfId());
        ok(group.every(c => c.MissionParty.running));
        off();
        const boards = await Promise.all(group.map((c, i) => c.MissionNet.report({ earned: (i + 1) * 100, completed: true })));
        for (let i = 0; i < group.length; i++) {
          eq(boards[i].earned, 600);
          eq(boards[i].players.length, 3);
          group[i].MissionParty.bank(boards[i], 0);
          group[i].MissionParty.bank(boards[i], 0);
          eq(group[i].pot, 600, 'shared winnings paid exactly once');
          group[i].MissionParty.backToRoom();
        }
        await until(() => group.every(c => !c.MissionParty.running));
        C.MissionParty.leave();
        await until(() => A.Party.roster().length === 2);
        // A finished mission must not leave the room permanently locked.
        const D = client('Dee');
        await D.MissionParty.joinCode(code, missionId);
        await until(() => D.Party.connected && A.Party.roster().length === 3);
        A.MissionParty.start();
        await until(() => A.launched.length === 2 && B.launched.length === 2 && D.launched.length === 1);
        await Promise.all([A, B, D].map(c => c.MissionNet.waitForStart()));
        A.MissionParty.leave();
        await until(() => !B.Party.connected && !D.Party.connected);
        ok(!B.MissionParty.running && !D.MissionParty.running);
        group.forEach(c => c.MissionParty.leave()); D.MissionParty.leave();
      });
    }
    await atest('a guest cannot reopen a running mission for new players', async () => {
      const A = client('A'), B = client('B'), C = client('C');
      await A.MissionParty.openFor('dive');
      const code = A.Party.code;
      await B.MissionParty.joinCode(code, 'dive');
      await until(() => A.Party.roster().length === 2);
      A.MissionParty.start();
      await until(() => B.MissionParty.running);
      B.Party.room.setLobby();
      await delay(20);
      await assert.rejects(C.Party.join(code, {}), /already started/);
      A.MissionParty.leave(); B.MissionParty.leave();
    });
    await atest('leaving during the mission-start fade cancels the old launch', async () => {
      const A = client('A', true), B = client('B', true);
      await A.MissionParty.openFor('boat-race');
      await B.MissionParty.joinCode(A.Party.code, 'boat-race');
      await until(() => A.Party.roster().length === 2);
      A.MissionParty.start();
      await until(() => A.transitions.length && B.transitions.length);
      A.MissionParty.leave(); B.MissionParty.leave();
      A.transitions.forEach(fn => fn()); B.transitions.forEach(fn => fn());
      eq(A.launched.length, 0); eq(B.launched.length, 0);
    });
  } finally {
    clients.forEach(c => { c.MissionNet.detach(); c.MissionParty.leave(); });
    await delay(20); await app.close();
  }
  report();
})().catch(error => { console.error(error); process.exitCode = 1; });

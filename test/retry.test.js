const { makeSwarm, makeClient, settle } = require('./swarm');
const { load, atest, eq, ok, report } = require('./harness');

(async () => {
  await atest('overlapping create attempts produce one room and leave no orphan', async () => {
    const swarm = makeSwarm();
    const { Party } = makeClient(swarm, 'A', true);
    const first = Party.host({ name: 'A' });
    const second = Party.host({ name: 'A' });
    eq(await first, await second, 'both callers share the same attempt');
    eq(swarm.rooms.size, 1);
    Party.leave();
    ok([...swarm.rooms.values()].every(room => !room.has('A')));
  });
  await atest('leaving cancels immediately and late credentials cannot reopen a room', async () => {
    const swarm = makeSwarm();
    let finish;
    const response = new Promise(resolve => { finish = resolve; });
    const { Party } = makeClient(swarm, 'A', true, ['js/core/party.js'], {
      fetch: () => response, console: { warn() {} },
    });
    const opening = Party.host({ name: 'A' });
    const rejected = opening.catch(error => error.name);
    await settle();
    Party.leave();
    eq(await rejected, 'AbortError');
    ok(!Party.connecting);
    finish({ ok: false, status: 404 });
    await settle();
    ok(!Party.connected);
    eq(swarm.rooms.size, 0);
    await Party.host({ name: 'A' });
    ok(Party.connected, 'retry succeeds');
    Party.leave();
  });
  await atest('callbacks from the old room cannot change the new room', async () => {
    const swarm = makeSwarm();
    const A = makeClient(swarm, 'A', true).Party;
    const B = makeClient(swarm, 'B', true).Party;
    const firstCode = await A.host({ name: 'A' });
    await B.join(firstCode, { name: 'B' });
    await settle();
    const oldLeave = A.room.onPeerLeave;
    const oldJoin = A.room.onPeerJoin;
    const oldMessage = swarm.rooms.get('traitors-' + firstCode).get('A').message;
    A.leave(); B.leave();
    const secondCode = await A.host({ name: 'A' });
    await B.join(secondCode, { name: 'B' });
    await settle();
    let departures = 0;
    A.on('left', () => departures++);
    oldLeave('B'); oldJoin('ghost');
    oldMessage('roster', { full: true }, 'B');
    eq(departures, 0);
    eq(A.roster().map(p => p.id), ['A', 'B']);
    ok(A.connected);
    A.leave(); B.leave();
  });
  await atest('a new connection waits for the old transport to finish leaving', async () => {
    const swarm = makeSwarm();
    const { Party } = makeClient(swarm, 'A', true);
    await Party.host({ name: 'A' });
    const old = Party.room;
    const leave = old.leave.bind(old);
    let finish;
    old.leave = () => new Promise(resolve => { finish = () => { leave(); resolve(); }; });
    Party.leave();
    const next = Party.host({ name: 'A' });
    await settle();
    eq(swarm.rooms.size, 1, 'next room has not opened yet');
    finish();
    await next;
    ok(Party.connected);
    Party.leave();
  });
  await atest('speech finishing after a scene closes cannot touch the disposed scene', async () => {
    let finish;
    const speaking = [];
    const { Scenes } = load(['js/core/scenes.js'], {
      document: { getElementById: () => null },
      Voice: { say: () => new Promise(resolve => { finish = resolve; }), stop: () => finish(), clear() {} },
      AudioBus: { define() {} }, Engine: { clearView() {} },
    });
    const run = Scenes.run([{ line: { text: 'Hello' } }], { setSpeaking: who => speaking.push(who) });
    Scenes.stop();
    eq(await run, false);
    eq(speaking, ['claudia'], 'no late callback into the disposed stage');
  });
  report();
})().catch(error => { console.error(error); process.exitCode = 1; });

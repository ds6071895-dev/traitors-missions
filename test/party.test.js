/* ------------------------------------------------------------------
   party.test.js — three browsers, one swarm, no WebRTC.

   `party.js` is the only file that touches Trystero, and Trystero has
   changed shape once already: actions used to come back as a
   `[send, receive]` pair and peers used to be watched by calling a
   method, and in 0.25 both became plain objects and properties. That
   change is what "object is not iterable" was, and it happened at the
   CDN rather than in this repo — which is exactly the class of break
   a test has to catch, because nothing here moved.

   So the swarm below is faked twice, once in each API shape, and the
   same room is opened over both. Everything above `party.js` — the
   roster, the seating, the full-room refusal, the host's authority —
   is asserted through the public surface only.
------------------------------------------------------------------ */
const H = require('./harness');
const { atest, eq, ok, section, report } = H;

/* The swarm and the two Trystero shapes live in `swarm.js` now, because
   the mission party needed to send things across one too and two
   copies of a fake network is one copy too many. */
const Swarm = require('./swarm');
const { makeSwarm, settle } = Swarm;
const makeClient = (swarm, selfId, modern) =>
  Swarm.makeClient(swarm, selfId, modern).Party;

/* ---------------- the tests ---------------- */

async function run() {

  section('party — TURN is an ICE fallback');

  await atest('temporary TURN credentials are added without replacing STUN', async () => {
    const swarm = makeSwarm();
    const fetch = async (url, options) => {
      eq(url, '/api/turn', 'credentials came from the same-origin function');
      eq(options.cache, 'no-store', 'temporary credentials are not browser-cached');
      return {
        ok: true,
        json: async () => ({ iceServers: [
          { urls: ['stun:stun.cloudflare.com:3478'] },
          { urls: ['turn:turn.cloudflare.com:3478?transport=udp',
                    'turns:turn.cloudflare.com:443?transport=tcp'],
            username: 'short-user', credential: 'short-password' },
        ] }),
      };
    };
    const A = Swarm.makeClient(swarm, 'relayA', true, ['js/core/party.js'], { fetch });
    await A.Party.host({ name: 'Ana', look: null });

    const config = A.Trystero.configs[0];
    ok(!config.rtcConfig, 'the default ICE policy and STUN list were not replaced');
    eq(config.turnConfig, [{
      urls: ['turn:turn.cloudflare.com:3478?transport=udp',
             'turns:turn.cloudflare.com:443?transport=tcp'],
      username: 'short-user', credential: 'short-password',
    }], 'only authenticated TURN entries were added');
    A.Party.leave();
  });

  await atest('a missing credential endpoint leaves direct rooms working', async () => {
    const swarm = makeSwarm();
    const quietConsole = { warn() {}, log() {}, error() {} };
    const fetch = async () => ({ ok: false, status: 404 });
    const A = Swarm.makeClient(swarm, 'directA', true, ['js/core/party.js'],
                               { fetch, console: quietConsole });
    const code = await A.Party.host({ name: 'Ana', look: null });
    ok(A.Party.validCode(code), 'the STUN-only room still opened');
    eq(A.Trystero.configs[0].turnConfig, [], 'no invalid relay config was installed');
    A.Party.leave();
  });

  for (const modern of [true, false]) {
    const shape = modern ? '0.25 (objects and properties)' : 'legacy (pairs and methods)';

    section('party — a room opens and fills — ' + shape);

    const swarm = makeSwarm();
    const A = makeClient(swarm, 'peerA', modern);
    const B = makeClient(swarm, 'peerB', modern);
    const C = makeClient(swarm, 'peerC', modern);
    const D = makeClient(swarm, 'peerD', modern);

    let code = null;
    await atest('hosting a room returns a four-letter code', async () => {
      code = await A.host({ name: 'Ana', look: { coat: 3 } });
      ok(A.validCode(code), 'code is dialable: ' + code);
      ok(A.isHost, 'the opener is the host');
      ok(A.connected, 'and is in the room');
      eq(A.roster().length, 1, 'a room of one');
    });

    await atest('a guest joins and the host seats them', async () => {
      await B.join(code, { name: 'Bo', look: null });
      await settle();
      eq(A.roster().map(p => p.name), ['Ana', 'Bo'], 'host sees both');
      eq(B.roster().map(p => p.name), ['Ana', 'Bo'], 'guest sees both');
      eq(B.hostId, 'peerA', 'the guest learned who the host is');
      ok(!B.isHost, 'and knows it is not one');
    });

    await atest('seats are handed out in arrival order', async () => {
      await C.join(code, { name: 'Cy', look: null });
      await settle();
      eq(A.roster().map(p => p.seat), [0, 1, 2], 'three seats, in order');
      eq(C.roster().map(p => p.name), ['Ana', 'Bo', 'Cy'], 'and the last one sees them all');
      eq(A.roster()[0].host, true, 'seat 0 is the host');
    });

    await atest('the look travels with the name', async () => {
      const ana = B.roster().find(p => p.name === 'Ana');
      eq(ana.look, { coat: 3 }, "the host's look reached a guest");
    });

    await atest('a fourth is turned away rather than ignored', async () => {
      let refused = null;
      D.on('error', (m) => { refused = m; });
      await D.join(code, { name: 'Dee', look: null });
      await settle();
      ok(refused && /full/i.test(refused), 'told it is full: ' + refused);
      eq(A.roster().length, 3, 'and the room did not grow');
      ok(!D.connected, 'and the refused one is put back on the front door');
    });


    await atest('a guest never rewrites the roster', async () => {
      // Bo claims a room of one. The host must ignore it entirely.
      B.post('roster', { list: [{ id: 'peerB', name: 'Bo', seat: 0, host: true }],
                         hostId: 'peerB' });
      await settle();
      eq(A.roster().length, 3, 'the host held its own roster');
      eq(A.hostId, 'peerA', 'and stayed the authority');
    });

    await atest('changing a look in the dressing room reaches the others', async () => {
      C.setProfile({ name: 'Cyrus', look: { coat: 9 } });
      await settle();
      const seen = A.roster().find(p => p.id === 'peerC');
      eq([seen.name, seen.look], ['Cyrus', { coat: 9 }], 'the host took the update');
      const echo = B.roster().find(p => p.id === 'peerC');
      eq(echo.name, 'Cyrus', 'and republished it');
    });

    await atest('the host starts the night and both guests are told', async () => {
      const got = [];
      B.on('go', (d) => got.push(['B', d.seed]));
      C.on('go', (d) => got.push(['C', d.seed]));
      A.post('go', { seed: 12345, players: A.roster() });
      await settle();
      eq(got.sort(), [['B', 12345], ['C', 12345]], 'the same seed, both machines');
    });

    /* A mission party is one mission rather than a night, and the
       host's choice of it — the wood, whether this is a
       full run or a walk up to the owl — arrives on its own channel,
       on a screen where no mission is running. A `go` that names one
       is the start of it, and the lobby must not mistake that for a
       night. */
    await atest('a mission party setup reaches the room', async () => {
      const heard = [];
      B.on('mp', (m) => heard.push(['B', m]));
      C.on('mp', (m) => heard.push(['C', m]));
      A.post('mp', { k: 'setup', missionId: 'shootout',
                     setup: { seed: 99, skip: true } });
      await settle();
      eq(heard.length, 2, 'both guests were told');
      eq(heard[0][1].setup.skip, true, 'and the owl came with it');
    });

    await atest('a guest can ask the host what the room is playing', async () => {
      let asked = null;
      A.on('mp', (m, from) => { asked = [m.k, from]; });
      B.post('mp', { k: 'want' }, A.selfId() ? A.selfId() : 'peerA');
      await settle();
      eq(asked, ['want', 'peerB'], 'the host heard the newcomer, and who it was');
    });

    await atest('a targeted message reaches only its peer', async () => {
      const heard = [];
      B.on('wire', (m) => heard.push(['B', m]));
      C.on('wire', (m) => heard.push(['C', m]));
      A.post('wire', { secret: true }, 'peerB');
      await settle();
      eq(heard, [['B', { secret: true }]], 'only Bo heard it');
    });

    await atest('leaving frees the seat', async () => {
      let left = null;
      A.on('left', (id) => { left = id; });
      C.leave();
      await settle();
      eq(left, 'peerC', 'the host noticed');
      eq(A.roster().map(p => p.name), ['Ana', 'Bo'], 'and the room shrank');
      ok(!C.connected, 'and the leaver is out');
    });

    /* The seat comes with the peer id, and the whole game hangs off it:
       one of the three walking out ends the room for everybody, and a
       stranger at the door leaving does not. Nothing above `party.js`
       can tell those apart once the seat has been deleted, so it is
       handed over rather than looked up. */
    await atest('the seat leaves with the person', async () => {
      const swarm = makeSwarm();
      const A = makeClient(swarm, 'peerA', true);
      const B = makeClient(swarm, 'peerB', true);
      const code = await A.host({ name: 'Ana', look: null });
      await B.join(code, { name: 'Bo', look: null });
      await settle();

      let seat = 'untouched';
      A.on('left', (id, s) => { seat = s; });
      B.leave();
      await settle();
      ok(seat && seat.name === 'Bo', 'the leaver arrived with their seat');
      eq(seat.seat, 1, 'and the seat they were sitting in');
    });

    await atest('a stranger at the door leaves no seat behind', async () => {
      const swarm = makeSwarm();
      const A = makeClient(swarm, 'peerA', true);
      const B = makeClient(swarm, 'peerB', true);
      const C = makeClient(swarm, 'peerC', true);
      const D = makeClient(swarm, 'peerD', true);   // the fourth

      const code = await A.host({ name: 'Ana', look: null });
      await B.join(code, { name: 'Bo', look: null });
      await C.join(code, { name: 'Cy', look: null });
      await settle();
      eq(A.roster().length, 3, 'a full room');

      /* Listening before Dee knocks, because being turned away is what
         makes her leave — by the time the room has settled she is
         already gone. */
      let saw = 0, seat = 'untouched';
      A.on('left', (id, s) => { saw++; seat = s; });

      await D.join(code, { name: 'Dee', look: null });
      await settle();

      ok(!D.connected, 'the fourth was turned away');
      eq(saw, 1, 'and the host saw her go');
      ok(seat === null, 'but nobody lost a seat over it');
    });

    await atest('a guest is told when the host walks out', async () => {
      let err = null;
      B.on('error', (m) => { err = m; });
      A.leave();
      await settle();
      ok(err && /host/i.test(err), 'said so plainly: ' + err);
    });

    await atest('rejoining after leaving works', async () => {
      const code2 = await C.host({ name: 'Cy', look: null });
      await B.join(code2, { name: 'Bo', look: null });
      await settle();
      ok(C.isHost, 'the old guest can host');
      eq(C.roster().length, 2, 'and the second room filled');
    });
  }

  /* ---------------- the third player ----------------
     Its own swarm, because the point is a peer that cannot see the
     host at the moment it arrives. */

  section('party — the third player, arriving the hard way');

  await atest('a guest that only meets the other guest still gets seated', async () => {
    const swarm = makeSwarm();
    const A = makeClient(swarm, 'peerA', true);   // host
    const B = makeClient(swarm, 'peerB', true);
    const C = makeClient(swarm, 'peerC', true);

    const code = await A.host({ name: 'Ana', look: null });
    await B.join(code, { name: 'Bo', look: null });
    await settle();
    eq(A.roster().length, 2, 'two in, to begin with');

    /* Cy's first hop lands on Bo, not on Ana. Under the old rule — one
       hello, aimed at whoever `onPeerJoin` happened to fire for — Ana
       never learns Cy exists and Cy sits in an empty lobby. */
    swarm.cut('peerC', 'peerA');
    await C.join(code, { name: 'Cy', look: null });
    await settle();
    eq(C.hostId, 'peerA', 'Bo pointed Cy at the authority');
    eq(A.roster().length, 2, 'but the cut is real: Ana still cannot hear Cy');

    // the route opens — a relay reconnects, ICE finally completes
    swarm.partition.clear();
    await new Promise(r => setTimeout(r, 1400));   // one knock
    await settle();
    eq(A.roster().map(p => p.name), ['Ana', 'Bo', 'Cy'], 'and the knock got through');
    eq(C.roster().length, 3, 'Cy has the room');
  });

  /* The watchdog is deliberately eighteen seconds — see `JOIN_WAIT` —
     so this is the one slow test in the file, and it runs once rather
     than once per API shape. It is worth its twenty seconds: the case
     it covers is somebody typing a code wrong, which is the single
     most likely thing to go wrong in the whole front door. */
  await atest('a code nobody is using does not hang forever', async () => {
    const swarm = makeSwarm();
    const E = makeClient(swarm, 'peerE', true);
    let err = null;
    E.on('error', (m) => { err = m; });
    await E.join('ZZZZ', { name: 'Eve', look: null });
    ok(E.connected, 'it looks like a join at first — nothing can tell yet');
    await new Promise(r => setTimeout(r, 18400));
    ok(err && /ZZZZ/.test(err), 'and then says so: ' + err);
    ok(!E.connected, 'and lets go of the empty room');
  });

  await atest('the knocking stops once the seat is real', async () => {
    const swarm = makeSwarm();
    const A = makeClient(swarm, 'peerA', true);
    const B = makeClient(swarm, 'peerB', true);
    const code = await A.host({ name: 'Ana', look: null });
    await B.join(code, { name: 'Bo', look: null });
    await settle();

    let hellos = 0;
    A.on('roster', () => { hellos++; });
    await new Promise(r => setTimeout(r, 2600));   // two knocks' worth
    eq(hellos, 0, 'a seated guest went quiet');
  });

  report();
}

run();

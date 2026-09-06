/* ------------------------------------------------------------------
   mission-party.test.js — the room that is one mission.

   Two things in `mission-party.js` are worth a test and neither of
   them needs a browser:

   - The link. It is the whole feature — a room nobody can reach is not
     an invitation — and it has to survive a round trip through an
     address bar, including the two letters the code alphabet does not
     contain and the ones people type in lower case anyway.
   - The setup that comes out the other side. "Straight to the owl" is
     a toggle on a screen and a bag of mission opts on the wire, and
     the mission's own shortcut has to win over whatever the host had
     dialled in before pressing it, or you get a boss rush in a mode
     that has no boss in it.

   The rest of the file is DOM, and DOM is not what these tests are
   for.
------------------------------------------------------------------ */
const H = require('./harness');
const { load, test, atest, eq, ok, section, report } = H;

/* A window with an address bar in it, and nothing else. */
function boot(href) {
  const location = { href, hash: (String(href).split('#')[1] || '') };
  const ctx = load(['js/core/party.js', 'js/core/mission-party.js'], {
    location,
    history: { replaceState(_a, _b, url) { location.href = url; location.hash = ''; } },
    navigator: {},
    URLSearchParams,
    document: { getElementById: () => null },
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  ctx.setHash = (h) => {
    location.hash = h;
    location.href = String(location.href).split('#')[0] + (h ? '#' + h : '');
  };
  return ctx;
}

const BASE = 'https://example.test/traitors/index.html';

section('mission party — the link');

test('a link carries the code and the mission', () => {
  const { MissionParty } = boot(BASE);
  eq(MissionParty.linkFor('ABCD', 'shootout'),
     BASE + '#p=ABCD&m=shootout', 'built off the page it was sent from');
});

test('a hash with no room in it is not an invitation', () => {
  const c = boot(BASE);
  eq(c.MissionParty.fromLocation(), null, 'no hash at all');
  c.setHash('m=shootout');
  eq(c.MissionParty.fromLocation(), null, 'a mission and no code');
  c.setHash('p=AB');
  eq(c.MissionParty.fromLocation(), null, 'half a code');
  c.setHash('p=ABCD1234');
  ok(c.MissionParty.fromLocation(), 'more than a code is still a code');
});

test('a link survives being typed back in by hand', () => {
  const c = boot(BASE);
  /* Lower case out of a chat window, and the I and O the alphabet
     leaves out because they are 1 and 0 when read aloud. */
  c.setHash('p=abio&m=boat-race');
  const w = c.MissionParty.fromLocation();
  eq(w, { code: 'ABJQ', missionId: 'boat-race' }, 'folded onto a dialable code');
});

test('a link round-trips through the address bar', () => {
  const c = boot(BASE);
  const link = c.MissionParty.linkFor('QRST', 'shootout');
  c.setHash(link.split('#')[1]);
  eq(c.MissionParty.fromLocation(), { code: 'QRST', missionId: 'shootout' },
     'out is what went in');
});

test('a room with no mission named is still a room', () => {
  const c = boot(BASE);
  c.setHash('p=WXYZ');
  eq(c.MissionParty.fromLocation(), { code: 'WXYZ', missionId: '' },
     'the host will say what it is');
});

section('mission party — what the mission is handed');

/* Enough of a mission def for the shortcut to mean something. This is
   the Shootout's actual quick start. */
const SHOOTOUT = {
  id: 'shootout',
  quickStart: { label: 'Fight Owl', opts: { mode: 'prize', bossRush: true, ghost: false } },
};

test('an ordinary run is the setup with the ghost turned off', () => {
  const { MissionParty } = boot(BASE);
  const o = MissionParty.optsFor(SHOOTOUT,
    { seed: 4242, mode: 'gauntlet', modId: 'gale', tod: 'auto', skip: false });
  eq(o, { seed: 4242, mode: 'gauntlet', modId: 'gale', tod: 'auto', ghost: false },
     'nothing added, nothing lost, and no ghost in a room');
  ok(!('skip' in o), 'and `skip` never reaches the mission');
});

test('the shortcut overrides the mode it makes no sense in', () => {
  const { MissionParty } = boot(BASE);
  const o = MissionParty.optsFor(SHOOTOUT,
    { seed: 4242, mode: 'gauntlet', modId: 'gale', tod: 'auto', skip: true });
  eq(o.bossRush, true, 'the owl is on');
  eq(o.mode, 'prize', "and it took the mode its shortcut needs");
  eq(o.modId, 'gale', 'the twist the host chose is untouched');
  eq(o.seed, 4242, 'and so is the wood');
});

test('a mission with no shortcut cannot be shortcut', () => {
  const { MissionParty } = boot(BASE);
  const o = MissionParty.optsFor({ id: 'boat-race' },
    { seed: 7, mode: 'prize', modId: null, tod: 'night', skip: true });
  eq(o, { seed: 7, mode: 'prize', modId: null, tod: 'night', ghost: false },
     'the toggle is inert where the mission never offered one');
});

test('a party starts cold', () => {
  const { MissionParty } = boot(BASE);
  ok(!MissionParty.running, 'no mission is live');
  ok(!MissionParty.armed, 'and no room was opened for one');
  eq(MissionParty.mission, null, 'and nothing has been chosen');
});


/* ==================================================================
   Three machines, one mission.

   Everything above is arithmetic. This is the feature: a host opens a
   room for a mission it picked, two people arrive on the link, and the
   press of one button has to put all three of them into the same wood
   with the same twist and the same owl. The wire is faked; every line
   of `party.js` and `mission-party.js` that runs across it is real.
   ================================================================== */

const Swarm = require('./swarm');
const { makeSwarm, settle } = Swarm;

/* A mission with a shortcut, and one without, registered the way the
   real ones are. */
const DEFS = {
  shootout: {
    id: 'shootout', name: 'Shootout', tagline: 'Half a second of draw.',
    icon: '02', maxPrize: 75000, setup: true,
    modes: { prize: { id: 'prize', name: 'Prize Run' },
             gauntlet: { id: 'gauntlet', name: 'Gauntlet' } },
    quickStart: { label: 'Fight Owl', icon: '◉', title: 'Jump straight to The Great Owl',
                  opts: { mode: 'prize', bossRush: true, ghost: false } },
    preview: (o) => ({ opts: o, name: 'Rowan Deep', conditionText: 'first light',
                       hand: [{ id: 'gale', name: 'Gale', icon: '≋', payout: 1.42,
                                blurb: 'A cross-wind.' }],
                       payout: 1.42 }),
  },
  'boat-race': { id: 'boat-race', name: 'Boat Race', tagline: 'Go.', icon: '01',
                 maxPrize: 40000, locked: false },
  dive: {
    id: 'dive', name: 'The Dive', tagline: 'Surface with it and it is yours.',
    icon: '03', maxPrize: 85000, locked: false, setup: true,
    modes: { prize: { id: 'prize', name: 'Prize Dive' } },
    preview: (o) => ({ opts: o, name: 'Loch', conditionText: 'slight sea',
                       hand: [], payout: 1 }),
  },
};

/* Nothing here paints. `Screens.current` is deliberately never
   `mparty`, so `paint()` returns at its first line and the whole DOM
   layer of the module is inert — which is the point: what is being
   tested is the wire, and the wire does not have a screen. */
function stubs(seedOf) {
  const launched = [];
  const menu = [];
  let pot = 0;
  const el = () => new Proxy({}, {
    get: (t, k) => (k === 'addEventListener' || k === 'select' || k === 'focus'
                     ? () => {}
                     : (k === 'classList' ? { toggle: () => {}, add: () => {}, remove: () => {} }
                                          : (k in t ? t[k] : ''))),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  return {
    launched,
    menu,
    get pot() { return pot; },
    globals: {
      document: { getElementById: el, activeElement: null },
      location: { href: 'https://example.test/index.html', hash: '' },
      history: { replaceState: () => {} },
      navigator: {},
      /* A party mission holds the permanent pot shut while it runs and
         pays the room's total once the board lands, so the stub has to
         have a sink to hold and a pot to pay into. */
      Missions: { get: (id) => DEFS[id] || null,
                  launch: (id, opts) => launched.push({ id, opts }),
                  end: () => {},
                  setPotSink: () => () => {} },
      GameState: { addToPot: (n) => { pot += n; return pot; },
                   get prizePot() { return pot; } },
      Screens: { current: 'nowhere', show: () => {}, register: () => {},
                 transition: (fn) => fn() },
      AudioBus: { resume: () => {}, play: () => {} },
      Voice: { unlock: () => {} },
      Engine: { setPaused: () => {} },
      Game: { enterShow: () => {}, showAttract: () => {}, toMenu: () => menu.push(true) },
      VoiceChat: { init: () => {}, listen: () => {}, stop: () => {},
                   on: () => {}, available: false, muted: true },
      RoomUI: { paintMic: () => {}, toggleMic: async () => {} },
      UINav: { scan: () => {} },
      MissionNet: { detach: () => {} },
      Look: { getName: () => 'Player', get: () => null },
      U: { randomSeed: () => seedOf, dailySeed: () => 7, money: (n) => '£' + n },
    },
  };
}

function machine(swarm, id, seedOf) {
  const s = stubs(seedOf);
  const ctx = Swarm.makeClient(swarm, id, true,
    ['js/core/party.js', 'js/core/mission-party.js'], s.globals);
  ctx.MissionParty.init();
  return { ctx, MP: ctx.MissionParty, Party: ctx.Party,
           launched: s.launched, menu: s.menu, get pot() { return s.pot; } };
}

async function party() {
  section('mission party — the dive');

  await atest('a dive invitation seats two players and launches the dive', async () => {
    const diveSwarm = makeSwarm();
    const host = machine(diveSwarm, 'diveHost', 8080);
    const guest = machine(diveSwarm, 'diveGuest', 9090);

    await host.MP.openFor('dive');
    await settle();
    await guest.MP.joinCode(host.Party.code, 'dive');
    await settle();

    eq(host.MP.mission.id, 'dive', 'the host opened the dive');
    eq(guest.MP.mission.id, 'dive', 'the invitation opened the dive for the guest');
    host.MP.start();
    await settle();
    eq(host.launched.map(x => x.id), ['dive'], 'the host launched the dive');
    eq(guest.launched.map(x => x.id), ['dive'], 'the guest launched the same dive');

    guest.MP.leave();
    host.MP.leave();
    await settle();
  });

  section('mission party — three machines, one mission');

  const swarm = makeSwarm();
  const A = machine(swarm, 'peerA', 5150);     // the host
  const B = machine(swarm, 'peerB', 111);
  const C = machine(swarm, 'peerC', 222);

  await atest('opening a room for a mission opens a room', async () => {
    await A.MP.openFor('shootout');
    await settle();
    ok(A.Party.connected, 'the host is in');
    ok(A.Party.isHost, 'and is the authority');
    ok(A.Party.validCode(A.Party.code), 'on a dialable code: ' + A.Party.code);
    eq(A.MP.mission.id, 'shootout', 'and the room knows what it is for');
  });

  await atest('a link is what gets sent, and it comes back whole', async () => {
    const link = A.MP.linkFor(A.Party.code, 'shootout');
    B.ctx.location.hash = link.split('#')[1];
    eq(B.MP.fromLocation(), { code: A.Party.code, missionId: 'shootout' },
       'the other machine read the invitation');
  });

  await atest('a guest arriving on the link is told what it is playing', async () => {
    await B.MP.joinCode(A.Party.code, 'shootout');
    await settle();
    eq(B.Party.roster().length, 2, 'seated');
    eq(B.MP.mission.id, 'shootout', 'and looking at the right mission');
    ok(!B.Party.isHost, 'and it is not the one choosing');
  });

  await atest("the host's choices reach the room as it makes them", async () => {
    /* The guest never asks for this after the first time. The host
       broadcasts on every change, which is what makes three people
       arguing about a seed over voice chat work at all. */
    A.MP.choose({ seed: 4242, modId: 'gale' });
    await settle();
    eq(B.MP.setup.seed, 4242, 'the guest is looking at the same wood');
    eq(B.MP.setup.modId, 'gale', 'and the same twist');
    eq(A.MP.setup.seed, 4242, 'and the host still holds its own');
  });

  await atest('a guest cannot change the run', async () => {
    B.MP.choose({ seed: 1, modId: null });
    await settle();
    eq(A.MP.setup.seed, 4242, 'the host was not overwritten');
    eq(B.MP.setup.seed, 4242, 'and the guest did not fool itself either');
  });

  await atest('a third arrives on the same link and is caught up', async () => {
    await C.MP.joinCode(A.Party.code, 'shootout');
    await settle();
    eq(A.Party.roster().map(p => p.seat), [0, 1, 2], 'three seats');
    eq(C.MP.mission.id, 'shootout', 'and the newcomer knows the mission');
    /* It arrived after every one of those choices was made and heard
       none of them. Asking once on arrival is what fixes that. */
    eq(C.MP.setup.seed, 4242, 'and the choices made before it got here');
    eq(C.MP.setup.modId, 'gale', 'all of them');
  });

  await atest('one press starts the same run on all three', async () => {
    A.MP.start();
    await settle();
    eq(A.launched.length, 1, 'the host launched');
    eq(B.launched.length, 1, 'and so did the first guest');
    eq(C.launched.length, 1, 'and the second');

    const ids = [A, B, C].map(m => m.launched[0].id);
    eq(ids, ['shootout', 'shootout', 'shootout'], 'the same mission');

    const seeds = [A, B, C].map(m => m.launched[0].opts.seed);
    eq(seeds, [4242, 4242, 4242], "everybody got the host's wood");
    eq([A, B, C].map(m => m.launched[0].opts.modId), ['gale', 'gale', 'gale'],
       'and the twist it chose');

    ok([A, B, C].every(m => m.launched[0].opts.party === true), 'all three know it is shared');
    eq([A, B, C].map(m => m.launched[0].opts.host), [true, false, false],
       'and exactly one of them is the authority');
  });

  await atest('everybody is dealt in, and each knows which one is them', async () => {
    for (const [m, id] of [[A, 'peerA'], [B, 'peerB'], [C, 'peerC']]) {
      const players = m.launched[0].opts.players;
      eq(players.length, 3, 'three players on ' + id);
      eq(players.filter(p => p.local).map(p => p.id), [id], 'and one of them is me');
      ok(players.every(p => p.alive), 'nobody is dead in a mission party');
    }
  });

  await atest('no ghost is raced in a room', async () => {
    ok([A, B, C].every(m => m.launched[0].opts.ghost === false),
       'two other boats are already there');
  });

  await atest('the owl travels with the rest of it', async () => {
    /* The shortcut is a toggle on the host's panel and a bag of the
       mission's own opts on the wire. Turning it on has to reach the
       other two as the boss fight, not as a checkbox they cannot see.
       The host had `gauntlet` dialled in, which is a mode the owl does
       not exist in — the mission's shortcut has to win. */
    const swarm2 = makeSwarm();
    const H2 = machine(swarm2, 'peerH', 909);
    const G2 = machine(swarm2, 'peerG', 3);
    await H2.MP.openFor('shootout');
    await settle();
    await G2.MP.joinCode(H2.Party.code, 'shootout');
    await settle();

    H2.MP.choose({ mode: 'gauntlet' });
    H2.MP.choose({ skip: true });
    await settle();
    eq(G2.MP.setup.skip, true, 'the guest can see the owl is on');

    H2.MP.start();
    await settle();
    for (const [m, who] of [[H2, 'host'], [G2, 'guest']]) {
      eq(m.launched.length, 1, who + ' started');
      eq(m.launched[0].opts.bossRush, true, who + ' is going straight to the owl');
      eq(m.launched[0].opts.mode, 'prize', who + ' in the mode the owl lives in');
      eq(m.launched[0].opts.seed, 909, who + " in the host's wood");
      ok(!('skip' in m.launched[0].opts), who + ' was never told about a checkbox');
    }
  });

  await atest('two is a party; one is not', async () => {
    const swarm3 = makeSwarm();
    const alone = machine(swarm3, 'peerZ', 42);
    await alone.MP.openFor('shootout');
    await settle();
    alone.MP.start();
    await settle();
    eq(alone.launched.length, 0, 'a host on its own cannot start one');
    eq(alone.MP.MIN, 2, 'because two is the floor');
  });

  await atest('a mission `go` is not a night starting', async () => {
    /* `lobby.js` and `mission-party.js` both listen on the same
       channel. The discriminator is one field, and if it ever stops
       being checked a mission party turns into an evening. */
    const swarm4 = makeSwarm();
    const h = machine(swarm4, 'peerH4', 77);
    const g = machine(swarm4, 'peerG4', 78);
    await h.MP.openFor('shootout');
    await settle();
    await g.MP.joinCode(h.Party.code, 'shootout');
    await settle();

    let night = 0;
    g.Party.on('go', (d) => { if (!d || d.kind !== 'mission') night++; });
    h.MP.start();
    await settle();
    eq(night, 0, 'nothing that looked like a night went out');
    eq(g.launched.length, 1, 'and the mission did start');
  });

  await atest('a mission nobody has cannot be launched', async () => {
    const swarm5 = makeSwarm();
    const h = machine(swarm5, 'peerH5', 5);
    const g = machine(swarm5, 'peerG5', 6);
    await h.MP.openFor('shootout');
    await settle();
    await g.MP.joinCode(h.Party.code, 'shootout');
    await settle();

    /* An older build, or a mission that has been taken out. The guest
       must not launch something it does not have. */
    g.Party.post('go', { kind: 'mission', missionId: 'lighthouse-climb',
                         opts: { seed: 1 }, players: [] });
    h.Party.post('go', { kind: 'mission', missionId: 'lighthouse-climb',
                         opts: { seed: 1 }, players: [] });
    await settle();
    eq(g.launched.length, 0, 'and it did not');
  });

  /* ==================================================================
     The money.

     Three people played one mission. What they made is one number and
     it has to be the same number on all three machines — it used to be
     each machine paying itself its own row, which is how the same run
     left the host up nine thousand and a guest up fifteen hundred.
     ================================================================== */
  section('mission party — one room, one number');

  async function room(name) {
    const sw = makeSwarm();
    const h = machine(sw, name + 'H', 60);
    const g1 = machine(sw, name + '1', 61);
    const g2 = machine(sw, name + '2', 62);
    await h.MP.openFor('shootout');
    await settle();
    await g1.MP.joinCode(h.Party.code, 'shootout');
    await g2.MP.joinCode(h.Party.code, 'shootout');
    await settle();
    h.MP.start();
    await settle();
    return [h, g1, g2];
  }

  await atest('nothing is banked while the mission is still being played', async () => {
    const all = await room('potA');
    eq(all.map(m => m.pot), [0, 0, 0], 'the sink is a hole for the length of the run');
  });

  await atest('everybody banks what the room won, not what they won', async () => {
    const all = await room('potB');
    /* What each of them would have paid itself before: its own row. */
    const mine = [4200, 9100, 1500];
    const board = { earned: mine.reduce((a, b) => a + b, 0), completed: true,
                    players: mine.map((earned, i) => ({ playerId: 'p' + i, earned })) };
    all.forEach((m, i) => m.MP.bank(board, mine[i]));
    eq(all.map(m => m.pot), [14800, 14800, 14800],
       'one figure, and it is the room\'s');
  });

  await atest('paying twice for one run is not on offer', async () => {
    const all = await room('potC');
    const board = { earned: 5000, players: [] };
    all[0].MP.bank(board, 1000);
    all[0].MP.bank(board, 1000);
    all[0].MP.bank(null, 1000);
    eq(all[0].pot, 5000, 'the room paid once');
  });

  await atest('a board that never arrives still pays you for your own run', async () => {
    const all = await room('potD');
    const g = all[1];
    g.MP.owe(2600);              // the scoreboard opened and then the tab shut
    g.MP.leave();
    await settle();
    eq(g.pot, 2600, 'your own row, rather than nothing at all');
  });

  await atest('losing the authority ends a shared run instead of freezing it', async () => {
    const swarm6 = makeSwarm();
    const h = machine(swarm6, 'peerH6', 50);
    const g = machine(swarm6, 'peerG6', 51);
    await h.MP.openFor('shootout');
    await settle();
    await g.MP.joinCode(h.Party.code, 'shootout');
    await settle();
    h.MP.start();
    await settle();
    ok(g.MP.running, 'the shared run was live');

    /* `main.js` owns this one line in the browser; this harness loads
       only Party and MissionParty, so install the same hand-off. */
    g.Party.on('left', (_id, seat) => g.MP.peerLeft(seat));
    h.MP.leave();
    await settle();
    ok(!g.Party.connected, 'the guest closed the authority-less room');
    ok(!g.MP.running, 'the run was not left waiting for host snapshots');
    eq(g.menu.length, 1, 'and it returned to a safe screen');
  });

  report();
}

party();

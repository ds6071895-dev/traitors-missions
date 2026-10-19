/* ------------------------------------------------------------------
   wise-one.test.js — the Wise One, driven through `dispatch`.

   On the hill the Traitors get ten seconds to make one Faithful the
   Wise One. Only the Traitors and the Wise One are told. Once, at a
   round table, the Wise One may overrule the vote: their slate is
   turned last and whoever it names is banished. These tests hold the
   rules and the secrecy; the ceremony is the scenes' business.
------------------------------------------------------------------ */
const H = require('./harness');
const { test, eq, ok } = H;

const FILES = ['js/core/util.js', 'js/core/state.js', 'js/core/chores.js', 'js/core/session.js'];

let clock = 1.7e12;
class FakeDate extends Date {
  constructor(...a) { if (a.length) super(...a); else super(clock); }
  static now() { return clock; }
}

function fresh() {
  const ctx = H.load(FILES, { Date: FakeDate });
  ctx.GameState.load();
  return ctx;
}

const FIVE = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, name: id.toUpperCase() + 'nn', local: i === 0 }));
const SEVEN = FIVE.concat([{ id: 'f', name: 'Fnn' }, { id: 'g', name: 'Gnn' }]);

/* A hill and a table and nothing else, with the Traitor in seat 1. */
function start(ctx, players = FIVE, opts = {}) {
  ctx.Session.startParty(Object.assign({ seed: 4242, players, mode: 'host', rehearsal: true,
                                         parts: ['intro', 'table'], traitorSeat: 1 }, opts));
  return ctx.Session;
}

const D = (S, a) => S.dispatch(a);
const open = (S) => D(S, { type: 'wiseOpen', authority: true });
const close = (S) => { clock = S.state.wise.endsAt + 10; D(S, { type: 'wiseTick', authority: true }); };
const wiseOf = (S) => S.state.players.find(p => S.privateView(p.id).wiseOne);

function toTable(S) {
  D(S, { type: 'advance', authority: true });
  eq(S.state.phase, 'table', 'the hill goes straight to the table');
}

function vote(S, names) {
  for (const [voter, target, overrule] of names) D(S, { type: 'name', playerId: voter, targetId: target, overrule });
}

function speakAll(S, seen) {
  const off = S.on('nameReveal', (e) => seen.push(e));
  let guard = 0;
  while (S.state.finale.stage === 'names' && guard++ < 20) D(S, { type: 'speakName', authority: true });
  off();
}

test('the window opens on the hill and says nothing about who', () => {
  const S = start(fresh());
  ok(!S.state.wise, 'no window until Claudia opens it');
  open(S);
  const w = S.state.wise;
  ok(w && !w.done && w.seconds === 10, 'ten seconds');
  eq(Object.keys(w).sort(), ['done', 'endsAt', 'seconds', 'used'], 'only the clock is public');
  eq(S.privateView('b').wise, { id: null, pick: null, by: null }, 'the Traitor sees an empty choice');
  eq(S.privateView('a').wise, null, 'a Faithful sees no choice at all');
});

test('only a Traitor may pick, only a Faithful may be picked, and the last pick stands', () => {
  const S = start(fresh());
  open(S);
  const before = JSON.stringify(S.state);
  D(S, { type: 'wisePick', playerId: 'a', targetId: 'c' });
  eq(S.privateView('b').wise.pick, null, 'a Faithful cannot choose');
  D(S, { type: 'wisePick', playerId: 'b', targetId: 'b' });
  eq(S.privateView('b').wise.pick, null, 'a Traitor cannot choose themselves');
  D(S, { type: 'wisePick', playerId: 'b', targetId: 'c' });
  D(S, { type: 'wisePick', playerId: 'b', targetId: 'd' });
  eq(S.privateView('b').wise.pick, 'd', 'the pick can change');
  eq(JSON.stringify(S.state), before, 'a pick moves nothing public');
  D(S, { type: 'wiseTick', authority: true });
  ok(!S.state.wise.done, 'the window runs its whole ten seconds');
  close(S);
  ok(S.state.wise.done, 'and then closes');
  eq(wiseOf(S).id, 'd', 'the last pick is the Wise One');
  eq(S.privateView('b').wise.id, 'd', 'the Traitor is told');
  ok(S.privateView('d').wiseOne, 'the Wise One is told');
  for (const id of ['a', 'c', 'e']) ok(!S.privateView(id).wiseOne && !S.privateView(id).wise, id + ' is told nothing');
  ok(JSON.stringify(S.state).indexOf('"d"') === JSON.stringify(S.state).lastIndexOf('"d"'),
     'the public state names d only in the roster');
});

test('with two Traitors, either may pick and each sees the other', () => {
  const S = start(fresh(), SEVEN, { traitorSeat: [1, 2] });
  open(S);
  D(S, { type: 'wisePick', playerId: 'b', targetId: 'c' });
  eq(S.privateView('b').wise.pick, null, 'a partner is not a Faithful');
  D(S, { type: 'wisePick', playerId: 'b', targetId: 'e' });
  eq(S.privateView('c').wise, { id: null, pick: 'e', by: 'b' }, 'the partner sees it');
  D(S, { type: 'wisePick', playerId: 'c', targetId: 'f' });
  close(S);
  eq(wiseOf(S).id, 'f', 'the last pick stands');
});

test('nobody picks: the seed picks a Faithful; no welcome: there is still one', () => {
  const S = start(fresh());
  open(S);
  close(S);
  const w = wiseOf(S);
  ok(w && S.privateView(w.id).role === 'faithful', 'a Faithful, by the seed');

  const S2 = start(fresh(), FIVE, { parts: ['table'] });
  eq(S2.state.phase, 'table', 'no welcome');
  ok(wiseOf(S2), 'a Wise One all the same');

  const S3 = start(fresh(), FIVE, { traitorSeat: -1 });
  open(S3);
  ok(!S3.state.wise, 'no Traitor, no Wise One');
});

test('the overrule: last slate, its name goes, and only then is it public', () => {
  const S = start(fresh());
  open(S);
  D(S, { type: 'wisePick', playerId: 'b', targetId: 'a' });
  close(S);
  toTable(S);
  // the table wants c; the Wise One (seat 0, a) overrules for b
  vote(S, [['a', 'b', true], ['b', 'c'], ['c', 'd'], ['d', 'c'], ['e', 'c']]);
  const f = S.state.finale;
  eq(f.stage, 'names', 'the ballot is in');
  eq(f.nameQueue[f.nameQueue.length - 1], 'a', 'the Wise One turns last');
  eq(f.overrule, { armed: true, by: null, targetId: null }, 'the room knows there is one, not whose');
  ok(!S.state.wise.used, 'not used yet');
  const seen = [];
  speakAll(S, seen);
  eq(seen.map(e => !!e.overrule), [false, false, false, false, true], 'only the last slate overrules');
  eq(S.state.finale.lastTally.result, 'b', 'the Wise One’s name goes, not the table’s');
  eq(S.state.finale.lastTally.overrule, 'a', 'the tally says so');
  eq(S.state.finale.pending, 'b', 'b is banished');
  eq(S.state.wise.used.id, 'a', 'and now everybody knows who the Wise One was');
  D(S, { type: 'reveal', authority: true });
  eq(S.state.banished.map(x => x.id), ['b'], 'out');
});

test('a slate without the overrule is just a slate, and the Wise One can take it back', () => {
  const S = start(fresh());
  open(S);
  D(S, { type: 'wisePick', playerId: 'b', targetId: 'a' });
  close(S);
  toTable(S);
  vote(S, [['c', 'd', true]]);
  ok(!S._peek().overrule, 'only the Wise One can overrule');
  vote(S, [['a', 'b', true]]);
  ok(S._peek().overrule, 'thrown');
  vote(S, [['a', 'b', false]]);
  ok(!S._peek().overrule, 'and taken back');
  vote(S, [['b', 'c'], ['d', 'c'], ['e', 'c']]);
  eq(S.state.finale.overrule, null, 'nothing armed');
  eq(S.state.finale.nameQueue, ['a', 'b', 'c', 'd', 'e'], 'seat order');
  speakAll(S, []);
  eq(S.state.finale.pending, 'c', 'the table decides');
  ok(!S.state.wise.used, 'and the overrule is still to come');
});

test('the overrule is spent once', () => {
  const S = start(fresh(), SEVEN);
  open(S);
  D(S, { type: 'wisePick', playerId: 'b', targetId: 'a' });
  close(S);
  toTable(S);
  vote(S, [['a', 'c', true], ['b', 'd'], ['c', 'd'], ['d', 'c'], ['e', 'd'], ['f', 'd'], ['g', 'd']]);
  speakAll(S, []);
  eq(S.state.finale.pending, 'c', 'overruled');
  D(S, { type: 'reveal', authority: true });
  ok(S.state.wise.used, 'spent');
  D(S, { type: 'advance', authority: true });
  eq([S.state.phase, S.state.day], ['table', 1], 'the next table');
  vote(S, [['a', 'b', true]]);
  ok(!S._peek().overrule, 'no second overrule');
});

test('the fire never takes an overrule', () => {
  const S = start(fresh(), FIVE, { parts: ['intro', 'table', 'finale'] });
  open(S);
  D(S, { type: 'wisePick', playerId: 'b', targetId: 'a' });
  close(S);
  S.jumpTo('finale');
  eq(S.state.phase, 'finale', 'at the fire');
  for (const p of S.alive()) D(S, { type: 'decide', playerId: p.id, choice: 'banish' });
  let guard = 0;
  while (S.state.finale.stage === 'decisions' && guard++ < 10) D(S, { type: 'decisionPouch', authority: true });
  eq(S.state.finale.stage, 'name', 'the fire votes');
  vote(S, [['a', 'b', true]]);
  ok(!S._peek().overrule, 'not here');
});

test('a Wise One who leaves takes the overrule with them', () => {
  const S = start(fresh());
  open(S);
  D(S, { type: 'wisePick', playerId: 'b', targetId: 'a' });
  close(S);
  toTable(S);
  vote(S, [['a', 'b', true]]);
  D(S, { type: 'leave', playerId: 'a', authority: true });
  ok(!S._peek().overrule && !S._peek().wise, 'gone with them');
  vote(S, [['b', 'c'], ['c', 'd'], ['d', 'c'], ['e', 'c']]);
  eq(S.state.finale.overrule, null, 'nothing armed');
});

/* ---------------- over the wire ----------------
   A host and two guests on a fake bus that only hands messages across,
   as the room server does. A guest Traitor chooses; the host decides;
   the Wise One's screen and the Traitor's are told, and the third is
   not. */

function makeBus() {
  const ends = new Map();
  return {
    join(id, deliver) { ends.set(id, deliver); },
    post(from, channel, data, toPeer) {
      for (const [id, deliver] of ends) {
        if (id === from || (toPeer && id !== toPeer)) continue;
        deliver(channel, JSON.parse(JSON.stringify(data === undefined ? null : data)), from);
      }
    },
  };
}

const WIRE = ['host', 'gst1', 'gst2'];
const WIRE_FILES = FILES.concat(['js/core/net.js', 'js/core/transports.js']);

function client(selfId, bus) {
  const ctx = H.load(WIRE_FILES, { Date: FakeDate });
  const listeners = new Map();
  ctx.Party = {
    connected: true, isHost: selfId === 'host', hostId: 'host', MAX: 8,
    selfId: () => selfId,
    on(evt, fn) {
      if (!listeners.has(evt)) listeners.set(evt, new Set());
      listeners.get(evt).add(fn);
      return () => listeners.get(evt).delete(fn);
    },
    post(channel, data, toPeer) { bus.post(selfId, channel, data, toPeer); },
  };
  ctx.globalThis.Party = ctx.Party;
  bus.join(selfId, (channel, data, from) => (listeners.get(channel) || []).forEach(fn => fn(data, from)));
  ctx.GameState.load();
  return ctx;
}

const wire = H.atest('a guest Traitor chooses over the wire, and only two screens are told', async () => {
  const settle = async () => { for (let i = 0; i < 6; i++) await H.flush(); };
  // a seed that deals the Traitor to a guest
  let seed = 1, probe;
  for (; seed < 400; seed++) {
    probe = fresh();
    probe.Session.startParty({ seed, players: WIRE.map(id => ({ id, name: id })), mode: 'host' });
    if (probe.Session.privateView('gst1').role === 'traitor') break;
  }
  const bus = makeBus();
  const c = { host: client('host', bus), gst1: client('gst1', bus), gst2: client('gst2', bus) };
  const seat = (me) => WIRE.map(id => ({ id, name: id, local: id === me }));
  for (const id of ['gst1', 'gst2']) {
    c[id].Session.startParty({ seed, players: seat(id), mode: 'guest' });
    c[id].Net.connect(c[id].Transports.GuestTransport);
  }
  c.host.Session.startParty({ seed, players: seat('host'), mode: 'host' });
  c.host.Net.connect(c.host.Transports.HostTransport);
  await settle();
  eq(c.gst1.Session.myRole(), 'traitor', 'the guest is the Traitor');

  c.host.Net.send({ type: 'wiseOpen' });
  await settle();
  ok(c.gst2.Session.state.wise && !c.gst2.Session.state.wise.done, 'every guest sees the window open');
  c.gst1.Net.send({ type: 'wisePick', targetId: 'gst2' });
  c.gst2.Net.send({ type: 'wisePick', targetId: 'host' });
  await settle();
  eq(c.gst1.Session.myPrivate().wise.pick, 'gst2', 'the Traitor’s pick is back on their own screen');
  ok(!c.gst2.Session.myPrivate().wise, 'a Faithful cannot pick');

  clock = c.host.Session.state.wise.endsAt + 10;
  c.host.Session.dispatch({ type: 'wiseTick', authority: true });
  await settle();
  ok(c.gst2.Session.state.wise.done, 'the window closed everywhere');
  eq(c.gst1.Session.myPrivate().wise.id, 'gst2', 'the Traitor is told');
  ok(c.gst2.Session.myPrivate().wiseOne, 'the Wise One is told');
  ok(!c.host.Session.myPrivate().wiseOne && !c.host.Session.myPrivate().wise, 'the host, a Faithful, is not');
  eq(JSON.stringify(c.gst2.Session.state).indexOf('wisePick'), -1, 'nothing of the pick in the public state');
});

wire.then(() => H.report());

/* ------------------------------------------------------------------
   interlude.test.js — the castle between rooms, and today's weather.

   The card is drawn from the public state alone. These tests play a
   game into its second day and check that nothing on the card could
   only have come from a secret: not a role the room was never told,
   not the carrier, not tonight's victim before breakfast.
------------------------------------------------------------------ */
const H = require('./harness');
const { test, eq, ok, section } = H;

const FILES = ['js/core/util.js', 'js/core/state.js', 'js/core/chores.js', 'js/core/session.js',
               'js/world/weather.js', 'js/core/interlude.js'];

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
const SEVEN = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id, i) => ({ id, name: id.toUpperCase() + 'nn', local: i === 0 }));

section('interlude — the card');

test('every room it leads into has an hour to turn from and to', () => {
  const ctx = fresh();
  for (const to of ['tasks', 'night', 'breakfast', 'table', 'finale']) {
    const h = ctx.Interlude.HOURS[to];
    ok(h && h.length === 2, to + ' has two hours');
  }
  ok(!ctx.Interlude.HOURS.hill && !ctx.Interlude.HOURS.verdict, 'the welcome and the verdict are not bridged');
});

test('the start of a day names the day, the people, the pot and nothing secret', () => {
  const ctx = fresh();
  ctx.Session.startParty({ seed: 21, players: SEVEN, mode: 'host' });
  ctx.Session.dispatch({ type: 'advance', authority: true });
  const s = ctx.Session.state;
  const card = ctx.Interlude.cardFor('tasks', s, { weather: 'rain' });
  eq(card.title, 'DAY ONE');
  eq(card.chips.length, 7, 'everybody is on it');
  ok(card.chips.every(c => !c.gone), 'nobody has gone yet');
  eq(card.pot, s.pot | 0, 'the pot');
  const text = JSON.stringify(card);
  ok(!/traitor|faithful/i.test(text), 'no role on the first day');
  const carrier = ctx.Session._peek().carrier;
  ok(!text.includes('"' + carrier + '"'), 'no ids, so not the carrier');
  ctx.Session.abandon();
});

test('the gone are shown the way the room was told', () => {
  const ctx = fresh();
  ctx.Session.startParty({ seed: 22, players: SEVEN, mode: 'host' });
  const s = ctx.Session.state;
  s.players[1].alive = false; s.players[1].out = 'murdered';
  s.players[2].alive = false; s.players[2].out = 'banished';
  s.banished.push({ id: s.players[2].id, name: s.players[2].name, day: 0, role: 'faithful' });
  s.players[3].alive = false; s.players[3].out = 'banished';
  s.banished.push({ id: s.players[3].id, name: s.players[3].name, day: 1, role: null });   // a veiled day
  const card = ctx.Interlude.cardFor('finale', s, {});
  const by = (n) => card.chips.find(c => c.name === n).gone;
  eq(by(s.players[1].name), 'poisoned');
  eq(by(s.players[2].name), 'Faithful');
  eq(by(s.players[3].name), 'banished', 'a role that was kept back stays kept back');
  eq(card.title, 'THE FIRE OF TRUTH');
  ctx.Session.abandon();
});

test('the small cards are just a caption', () => {
  const ctx = fresh();
  ctx.Session.startParty({ seed: 23, players: SEVEN, mode: 'host' });
  for (const to of ['night', 'breakfast', 'table']) {
    const c = ctx.Interlude.cardFor(to, ctx.Session.state, { weather: 'fog' });
    ok(c && c.title && !c.chips && !c.full, to + ' has a title and no roll');
  }
  ctx.Session.abandon();
});

section('weather');

test('the same seed and day is the same sky, and the first day is never a storm', () => {
  const ctx = fresh();
  const W = ctx.Weather;
  const seen = new Set();
  for (let seed = 1; seed < 400; seed++) {
    eq(W.forDay(seed, 0), W.forDay(seed, 0), 'deterministic');
    ok(W.forDay(seed, 0) !== 'storm', 'day one is no storm');
    for (let d = 1; d < 6; d++) {
      const k = W.forDay(seed, d);
      seen.add(k);
      ok(!(k === 'storm' && W.forDay(seed, d - 1) === 'storm'), 'never two storms running');
    }
    ok(['clear', 'fog'].includes(W.forFinale(seed, 3)), 'the fire burns clear or in fog');
  }
  eq(seen.size, 5, 'every kind of weather turns up');
});

H.report();

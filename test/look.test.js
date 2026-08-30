/* ------------------------------------------------------------------
   look.test.js — the dressing room's data.

   A look is three things at once: a thing in localStorage, a thing on
   the wire, and a thing `Figure.build` reads. That is three chances for
   a stale or hostile value to become a figure with no coat on, so every
   field is an index into a list here and every index is clamped.
------------------------------------------------------------------ */
const H = require('./harness');
const { test, eq, ok, section } = H;

const ctx = H.load(['js/core/util.js', 'js/core/look.js']);
const L = ctx.Look;

section('look — normalising');

test('a fresh look is valid and resolvable', () => {
  const r = L.resolve(L.fresh());
  for (const k of ['skin', 'hair', 'hairColour', 'coat', 'trim', 'accent',
                   'hat', 'scarf', 'height', 'girth']) {
    ok(r[k] !== undefined, 'resolve() produced no ' + k);
  }
  ok(/^#[0-9a-f]{6}$/i.test(r.coat), 'coat is a colour, not an index');
});

test('nonsense clamps instead of breaking', () => {
  const junk = { build: -5, skin: 999, hair: 'banana', hairColour: null,
                 coat: 1e9, accent: NaN, hat: undefined, scarf: 2.7 };
  const n = L.normalise(junk);
  for (const row of L.ROWS) {
    const v = n[row.key];
    ok(Number.isInteger(v) && v >= 0 && v < row.list.length,
       row.key + ' came out as ' + v);
  }
  const r = L.resolve(junk);
  ok(/^#[0-9a-f]{6}$/i.test(r.skin), 'and it still resolves to a person');
});

test('an empty look is still a person', () => {
  const r = L.resolve(null);
  ok(r.height > 1.4 && r.height < 2.1, 'a plausible height: ' + r.height);
  ok(r.hair && typeof r.hair === 'string', 'and a hair style');
});

test('every row points at a real list and can describe itself', () => {
  for (const row of L.ROWS) {
    ok(Array.isArray(row.list) && row.list.length, row.key + ' has no list');
    ok(row.show || row.swatch, row.key + ' can neither be named nor shown');
    for (let i = 0; i < row.list.length; i++) {
      if (row.show) ok(typeof row.show(i) === 'string', row.key + ' cannot name ' + i);
      if (row.swatch) ok(/^#[0-9a-f]{6}$/i.test(row.swatch(i)),
                         row.key + ' swatch ' + i + ' is not a colour');
    }
  }
});

test('random looks are always valid', () => {
  for (let i = 0; i < 200; i++) {
    const r = L.resolve(L.random());
    ok(/^#[0-9a-f]{6}$/i.test(r.coat) && /^#[0-9a-f]{6}$/i.test(r.accent),
       'random look ' + i + ' resolved badly');
  }
});

section('look — storage');

test('a name is trimmed, collapsed and capped', () => {
  eq(L.setName('   Bo   nnie   '), 'Bo nnie', 'whitespace tidied');
  eq(L.setName('x'.repeat(40)).length, 16, 'capped at sixteen');
  eq(L.setName(null), '', 'and nothing is a valid name to have not chosen');
});

test('a saved look comes back', () => {
  const want = L.random();
  L.save(want);
  const before = JSON.stringify(L.get());
  L.load();
  eq(JSON.stringify(L.get()), before, 'round-tripped through storage');
});

test('a corrupt store is a fresh look, not an error', () => {
  ctx.localStorage.setItem(L.KEY, '{{{not json');
  L.load();
  const r = L.resolve(L.get());
  ok(/^#[0-9a-f]{6}$/i.test(r.coat), 'still dressed');
});

test('the profile is what goes on the wire', () => {
  L.setName('Ana');
  const p = L.profile();
  eq(p.name, 'Ana', 'name');
  ok(p.look && typeof p.look === 'object', 'and a plain look object');
  eq(JSON.parse(JSON.stringify(p.look)), p.look, 'that survives serialisation');
});

if (require.main === module) H.report();

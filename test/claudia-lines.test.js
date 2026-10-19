/* ------------------------------------------------------------------
   claudia-lines.test.js — Claudia stays short.

   Every second she talks is a second nobody else is playing, so the
   line book has a length rule and this is where it lives: at most three
   sentences a take, ten words a sentence and sixteen a take, with the
   two rules sets allowed twenty-two. It also checks that she only uses
   the tokens the scenes fill, that a take is read in one breath, and
   that every set a scene asks for by name exists.
------------------------------------------------------------------ */
const fs = require('fs');
const path = require('path');
const H = require('./harness');
const { test, eq, ok } = H;

const ctx = H.load(['js/core/util.js', 'js/scenes/claudia-lines.js']);
const C = ctx.ClaudiaLines;

const LONG = new Set(['theRules', 'fireRules']);
const TOKENS = new Set(['name', 'names', 'pot', 'count', 'time', 'Time']);
const words = (s) => s.replace(/\{\w+\}/g, 'X').split(/\s+/).filter(w => /\w/.test(w)).length;

test('no take runs long', () => {
  const bad = [];
  for (const [set, takes] of Object.entries(C.SETS)) {
    takes.forEach((take, i) => {
      const total = take.reduce((a, s) => a + words(s), 0);
      const cap = LONG.has(set) ? 22 : 16;
      if (take.length > 3) bad.push(set + '[' + i + '] has ' + take.length + ' sentences');
      if (total > cap) bad.push(set + '[' + i + '] is ' + total + ' words');
      take.join(' ').split(/(?<=[.?!])\s+/).forEach((s) => {
        if (words(s) > 10) bad.push(set + '[' + i + '] "' + s + '"');
      });
    });
  }
  eq(bad, [], 'long lines');
});

test('she only uses tokens the scenes fill', () => {
  const bad = [];
  for (const [set, takes] of Object.entries(C.SETS)) {
    for (const take of takes) for (const s of take) {
      for (const m of s.matchAll(/\{(\w+)\}/g)) if (!TOKENS.has(m[1])) bad.push(set + ': {' + m[1] + '}');
    }
  }
  eq(bad, [], 'unknown tokens');
});

test('a take is one read, unless the caller asks to split it', () => {
  const one = C.beats('banishName', { name: 'Isla' }, 7);
  eq(one.length, 1, 'one beat');
  ok(/Isla/.test(one[0].text), 'filled');
  const split = C.beats('banishName', { name: 'Isla' }, 7, { split: true });
  ok(split.length >= 2, 'split into sentences');
  eq(split.map(b => b.text).join(' '), one[0].text, 'same words');
  eq(C.line('banishName', { name: 'Isla' }, 7), one[0].text, 'line agrees');
});

test('every set a scene asks for exists', () => {
  const dir = path.join(H.ROOT, 'js', 'scenes');
  const names = new Set();
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((f) => {
    const p = path.join(d, f.name);
    if (f.isDirectory()) return walk(p);
    if (!f.name.endsWith('.js') || f.name === 'claudia-lines.js') return;
    const src = fs.readFileSync(p, 'utf8');
    for (const m of src.matchAll(/(?:_say|speak|beats|ClaudiaLines\.line)\(\s*'([A-Za-z]+)'/g)) names.add(m[1]);
  });
  walk(dir);
  ok(names.size > 20, 'found the callers (' + names.size + ')');
  const missing = [...names].filter(n => !C.has(n));
  eq(missing, [], 'missing sets');
});

H.report();

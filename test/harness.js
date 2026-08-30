/* ------------------------------------------------------------------
   harness.js — enough of a browser to run the parts of the game that
   are pure logic.

   The session, the agendas and the transports have no DOM in them by
   design, so this stubs only what they touch on the way past:
   localStorage, a console that can be silenced, and a THREE that is
   never called. Anything that reaches for more than this has drifted
   out of the logic layer, and the failure is the point.
------------------------------------------------------------------ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
  };
}

/* A THREE that exists but is never meant to be used. If a test trips
   over one of these the message says which one, which is far more
   useful than `undefined is not a function`. */
function makeTHREE() {
  return new Proxy({}, {
    get(_, name) {
      if (name === 'then') return undefined;
      return function () {
        throw new Error('THREE.' + String(name) + ' called in a logic test');
      };
    },
  });
}

function load(files, extra = {}) {
  const ctx = Object.assign({
    localStorage: makeStorage(),
    THREE: makeTHREE(),
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    queueMicrotask, Promise, Date, Math, JSON, Object, Array, Set, Map,
    isFinite, parseInt, parseFloat, String, Number, Boolean, Error,
  }, extra);
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    /* A top-level `const` in a script does not become a property of the
       context's global, which is exactly how the browser behaves and
       exactly what makes these files invisible from out here. So each
       one is followed by an explicit hand-over of whatever it declared. */
    const names = new Set();
    for (const m of src.matchAll(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/gm)) names.add(m[1]);
    for (const m of src.matchAll(/^class\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
    const handover = [...names].map(n => 'globalThis.' + n + ' = ' + n + ';').join('\n');
    vm.runInContext(src + '\n;' + handover, ctx, { filename: f });
  }
  return ctx;
}

/* ---------------- a very small test runner ---------------- */

let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (e) {
    failed++;
    failures.push({ name, e });
    console.log('  FAIL ' + name + '\n       ' + (e && e.message));
  }
}

/* The wire defers by a microtask even locally — deliberately, so no
   scene can come to depend on a same-stack reply — which means a test
   of it has to be able to wait. */
async function atest(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (e) {
    failed++;
    failures.push({ name, e });
    console.log('  FAIL ' + name + '\n       ' + (e && e.message));
  }
}

const flush = () => new Promise(r => setImmediate(r));

function eq(a, b, what) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error((what || 'values differ') + ': ' + A + ' !== ' + B);
}

function ok(v, what) {
  if (!v) throw new Error(what || 'expected truthy, got ' + JSON.stringify(v));
}

function section(name) { console.log('\n' + name); }

function report() {
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  if (failed) process.exitCode = 1;
  return failed === 0;
}

module.exports = { load, test, atest, flush, eq, ok, section, report,
                   makeStorage, ROOT };

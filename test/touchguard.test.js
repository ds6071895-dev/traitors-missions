/* ------------------------------------------------------------------
   touchguard.test.js — the zoom guard, without a browser.

   This is the one file in the game whose whole job is to say no to the
   browser, and the bug it had was not in what it refused but in what it
   refused *while the page was already zoomed*: a pinch out is the only
   way back from an iPad stuck at 2x, and the guard was eating it.

   So the shape of every test here is the same: build a document big
   enough to dispatch the four or five events touchguard.js listens for,
   put the visual viewport at a chosen scale, and check which way each
   event went. Nothing here needs layout, paint or a real Safari — a
   preventDefault either happened or it did not.
------------------------------------------------------------------ */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const H = require('./harness');
const { test, eq, ok, section, report } = H;

const META = 'width=device-width, initial-scale=1, maximum-scale=1, '
           + 'viewport-fit=cover, user-scalable=no';

/* A listener table with a way to fire into it, which is all that
   `document`, `window` and `visualViewport` are to this file. */
function bus(extra) {
  const L = new Map();
  return Object.assign({
    addEventListener(t, fn) { if (!L.has(t)) L.set(t, []); L.get(t).push(fn); },
    fire(t, e) { for (const fn of L.get(t) || []) fn(e); return e; },
  }, extra);
}

function element() {
  const cls = new Set();
  return {
    id: '', textContent: '', style: {},
    classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c) },
    shown: () => cls.has('show'),
    addEventListener() {},
  };
}

/* The world, at a given pinch scale. The guard subscribes to `window`
   as it loads, so the context has to already be a listener table when
   the file runs — which is why this builds the vm context by hand
   rather than going through the harness's `load`. `flush` then runs the
   debounce timers and animation frames it defers its work onto, in
   order, until there is nothing left to run. */
function build(scale, opts = {}) {
  const meta = {
    content: META, writes: [],
    getAttribute: () => meta.content,
    setAttribute: (_, v) => { meta.content = v; meta.writes.push(v); },
  };
  const body = { children: [], appendChild(n) { this.children.push(n); return n; } };
  const doc = bus({
    querySelector: (s) => (s.indexOf('viewport') >= 0 ? meta : null),
    createElement: element,
    body,
    activeElement: opts.typing
      ? { closest: (s) => (s.indexOf('input') >= 0 ? {} : null) }
      : null,
  });
  const vv = scale === null ? null : bus({ scale });
  const frames = [], timers = [];
  const ctx = bus({
    console, Math, Date, Object, Array, Set, Map, String, Number, Boolean, Error,
    document: doc, visualViewport: vv, meta, body,
    requestAnimationFrame: (fn) => { frames.push(fn); },
    setTimeout: (fn) => { timers.push({ fn }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].dead = true; },
    scrollTo: () => {},
  });
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/core/touchguard.js'), 'utf8'),
                  ctx, { filename: 'touchguard.js' });
  ctx.flush = () => {
    for (let i = 0; i < 40; i++) {
      const due = timers.filter(t => !t.dead && !t.done);
      const rafs = frames.splice(0);
      if (!due.length && !rafs.length) break;
      for (const t of due) { t.done = true; t.fn(); }
      for (const f of rafs) f();
    }
  };
  return ctx;
}

/* An event that remembers whether it was refused. `pad` puts it on a
   thumb overlay; `field` puts it in a text field; `button` puts it on a
   real control. */
function ev(o = {}) {
  const hit = o.pad ? '#touch-shoot'
            : o.field ? 'input'
            : o.button ? 'button'
            : null;
  const e = {
    cancelable: o.cancelable !== false,
    touches: o.touches || [],
    changedTouches: o.changedTouches || [],
    ctrlKey: !!o.ctrlKey,
    defaultPrevented: false,
    target: { closest: (s) => (hit && s.indexOf(hit.replace('#', '')) >= 0 ? {} : null) },
  };
  e.preventDefault = () => { e.defaultPrevented = true; };
  return e;
}

section('at 1x, the browser is not allowed to zoom the game');

test('a pinch is refused from start to finish', () => {
  const w = build(1);
  eq(w.document.fire('gesturestart', ev()).defaultPrevented, true, 'start');
  eq(w.document.fire('gesturechange', ev()).defaultPrevented, true, 'change');
  eq(w.document.fire('gestureend', ev()).defaultPrevented, true, 'end');
});

test('two fingers dragging are refused, a trackpad pinch with them', () => {
  const w = build(1);
  eq(w.document.fire('touchmove', ev({ touches: [1, 2] })).defaultPrevented, true, 'touchmove');
  eq(w.fire('wheel', ev({ ctrlKey: true })).defaultPrevented, true, 'ctrl+wheel');
});

test('an ordinary wheel and a one-finger drag are left alone', () => {
  const w = build(1);
  eq(w.fire('wheel', ev()).defaultPrevented, false, 'plain wheel');
  eq(w.document.fire('touchmove', ev({ touches: [1] })).defaultPrevented, false, 'one finger');
});

test('two thumbs on a control sheet are play, not a pinch', () => {
  const w = build(1);
  eq(w.document.fire('touchmove', ev({ touches: [1, 2], pad: true })).defaultPrevented,
     false, 'the sticks keep working');
});

test('a field keeps every gesture the browser gives it', () => {
  const w = build(1);
  eq(w.document.fire('gesturestart', ev({ field: true })).defaultPrevented, false, 'gesture');
  eq(w.fire('wheel', ev({ ctrlKey: true, field: true })).defaultPrevented, false, 'wheel');
});

section('once it has zoomed, the way back out is never blocked');

test('a pinch is allowed while the page is not at 1x', () => {
  const w = build(2);
  eq(w.document.fire('gesturestart', ev()).defaultPrevented, false, 'start');
  eq(w.document.fire('gesturechange', ev()).defaultPrevented, false, 'change');
  eq(w.document.fire('gestureend', ev()).defaultPrevented, false, 'end');
  eq(w.document.fire('touchmove', ev({ touches: [1, 2] })).defaultPrevented, false, 'touchmove');
  eq(w.fire('wheel', ev({ ctrlKey: true })).defaultPrevented, false, 'ctrl+wheel');
});

test('the decision is latched, so a refused pinch is refused throughout', () => {
  const w = build(1);
  w.document.fire('gesturestart', ev());
  w.visualViewport.scale = 1.4;               // as if it had slipped through anyway
  eq(w.document.fire('gesturechange', ev()).defaultPrevented, true,
     'a gesture is not half-refused');
});

section('and the page tries to put itself back');

test('a zoom rewrites the viewport tag and then restores it', () => {
  const w = build(1.8);
  w.visualViewport.fire('resize', {});
  w.flush();
  ok(w.meta.writes.length >= 2, 'the tag was changed and changed back');
  ok(w.meta.writes[0].indexOf('minimum-scale=1') > 0, 'the change is a real one');
  eq(w.meta.content, META, 'and what it ends on is the document\'s own');
});

test('at 1x nothing is touched at all', () => {
  const w = build(1);
  w.visualViewport.fire('resize', {});
  w.flush();
  eq(w.meta.writes.length, 0, 'no rewrites');
  eq(w.body.children.length, 0, 'and no pill');
});

test('a keyboard-up zoom is the field\'s business, not the guard\'s', () => {
  const w = build(1.6, { typing: true });
  w.visualViewport.fire('resize', {});
  w.flush();
  eq(w.meta.writes.length, 0, 'a focused field is not fought with');
  eq(w.body.children.length, 0, 'and nothing is put over the keyboard');
});

test('when the page will not come back, the way out is on the screen', () => {
  const w = build(1.8);
  w.visualViewport.fire('resize', {});
  w.flush();
  const pill = w.body.children[0];
  ok(!!pill, 'a pill was made');
  eq(pill.shown(), true, 'and shown');
  ok(/pinch/i.test(pill.textContent), 'saying which way out is: ' + pill.textContent);

  w.visualViewport.scale = 1;                 // the player pinched out
  w.visualViewport.fire('resize', {});
  w.flush();
  eq(pill.shown(), false, 'and it clears itself the moment it is fixed');
});

section('browsers that have less than this');

test('no visualViewport: nothing throws and the pinch guard still holds', () => {
  const w = build(null);
  eq(w.document.fire('gesturestart', ev()).defaultPrevented, true, 'still refused');
  eq(w.document.fire('touchmove', ev({ touches: [1, 2] })).defaultPrevented, true, 'still refused');
  w.flush();
  eq(w.meta.writes.length, 0, 'and it never decides it is zoomed');
});

test('an uncancellable touchmove is not preventDefault-ed anyway', () => {
  const w = build(1);
  const e = w.document.fire('touchmove', ev({ touches: [1, 2], cancelable: false }));
  eq(e.defaultPrevented, false, 'passive listeners elsewhere are not lied to');
});

section('the older guards still stand');

test('a double tap in one spot is refused, two far apart are not', () => {
  const w = build(1);
  const tap = (x, y) => w.document.fire('touchend',
    ev({ changedTouches: [{ clientX: x, clientY: y }] }));
  eq(tap(100, 100).defaultPrevented, false, 'the first tap always lands');
  eq(tap(104, 102).defaultPrevented, true, 'the second, in the same place, does not');
  eq(tap(400, 400).defaultPrevented, false, 'a tap somewhere else is a first tap again');
});

/* The Traitor's task chip asks twice on purpose — one press arms it,
   the next commits — and both presses land in the same spot inside a
   second. The double-tap guard was refusing the second one, which
   cancels the click Safari would have synthesised from it, so on a
   phone the task was never actually marked. A control refuses the zoom
   itself through `touch-action`; the guard is for everything else. */
test('a control that is meant to be pressed twice keeps its second press', () => {
  const w = build(1);
  const tap = (x, y) => w.document.fire('touchend',
    ev({ button: true, changedTouches: [{ clientX: x, clientY: y }] }));
  eq(tap(100, 100).defaultPrevented, false, 'arm it');
  eq(tap(101, 100).defaultPrevented, false, 'and the press that confirms it lands too');
});

test('the long-press callout and the context menu are refused off a field', () => {
  const w = build(1);
  eq(w.document.fire('selectstart', ev()).defaultPrevented, true, 'selection');
  eq(w.document.fire('contextmenu', ev()).defaultPrevented, true, 'menu');
  eq(w.document.fire('contextmenu', ev({ field: true })).defaultPrevented, false,
     'but the invite link can still be copied');
});

report();

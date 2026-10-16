/* ------------------------------------------------------------------
   tutorial.test.js — the first-time tours.

   Two promises matter more than how the card looks: what has been seen
   survives a reload (and a broken storage never breaks the game), and
   a room screen is never blocked by a tour, because somebody has to be
   able to press start. The overlay is faked to the few properties the
   module touches; the step tables are the real ones.
------------------------------------------------------------------ */
const fs = require('fs');
const path = require('path');
const H = require('./harness');
const { test, eq, ok, section } = H;

/* ---------------- a fake overlay ---------------- */

class FakeEl {
  constructor(name) {
    this.name = name;
    this._c = new Set();
    this.style = { setProperty() {} };
    this.dataset = {};
    this.hidden = false;
    this.innerHTML = '';
    this.textContent = '';
    this.children = [];
    this.offsetWidth = 320; this.offsetHeight = 200;
    this.rect = { left: 100, top: 100, width: 80, height: 40 };
    this._L = {};
    const self = this;
    this.classList = {
      add: (...c) => c.forEach(x => self._c.add(x)),
      remove: (...c) => c.forEach(x => self._c.delete(x)),
      toggle: (c, on) => { const v = on === undefined ? !self._c.has(c) : !!on; v ? self._c.add(c) : self._c.delete(c); return v; },
      contains: (c) => self._c.has(c),
    };
  }
  set className(v) { this._c = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get className() { return [...this._c].join(' '); }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(t, fn) { (this._L[t] = this._L[t] || []).push(fn); }
  removeEventListener(t, fn) { this._L[t] = (this._L[t] || []).filter(f => f !== fn); }
  fire(t) { (this._L[t] || []).slice().forEach(fn => fn({ preventDefault() {}, stopPropagation() {} })); }
  getBoundingClientRect() { return this.rect; }
}

function world(opts = {}) {
  const parts = {};
  const part = (sel) => parts[sel] || (parts[sel] = new FakeEl(sel));
  const root = new FakeEl('#tutorial');
  root.querySelector = (sel) => {
    const e = part(sel);
    if (sel === '.tut-meter i') e.parentElement = part('.tut-meter');
    return e;
  };
  root.querySelectorAll = () => [0, 1, 2, 3].map(i => part('block' + i));
  const targets = {};
  const target = (sel) => targets[sel] || (targets[sel] = new FakeEl(sel));
  const chip = new FakeEl('#agenda-chip');

  const document = {
    getElementById: (id) => (id === 'tutorial' ? root : id === 'agenda-chip' ? chip : null),
    querySelector: (sel) => target(sel),
    createElement: (tag) => new FakeEl(tag),
  };

  // a clock nobody but the test advances
  const timers = [];
  const rafs = [];
  const winL = {};

  const input = {
    _held: new Set(), _throttle: 0, _steer: 0, isTouch: false,
    aimReady: true, pointerLocked: true,
    held(a) { return this._held.has(a); },
    pressed() { return false; }, released() { return false; },
    throttle() { return this._throttle; }, steer() { return this._steer; },
    moveAxes() { return { x: 0, y: 0 }; },
  };
  const net = { live: false };
  const screenFns = [];
  const screens = { current: 'hud', onShow(fn) { screenFns.push(fn); } };

  const storage = opts.storage || H.makeStorage();
  const ctx = H.load(['js/core/tutorial-steps.js', 'js/core/tutorial.js'], {
    localStorage: storage,
    document,
    innerWidth: 1280, innerHeight: 720,
    requestAnimationFrame: (fn) => { rafs.push(fn); return rafs.length; },
    setTimeout: (fn, ms) => { timers.push(fn); return timers.length; },
    clearTimeout: () => {},
    addEventListener: (t, fn) => { (winL[t] = winL[t] || []).push(fn); },
    Input: input,
    MissionNet: net,
    Screens: screens,
    Engine: { isPaused: () => false },
  });
  ctx.addEventListener = (t, fn) => { (winL[t] = winL[t] || []).push(fn); };
  ctx.Tutorial.init();

  return {
    T: ctx.Tutorial, S: ctx.TutorialSteps, input, net, screens, root, chip, storage,
    part, target, winL,
    runTimers() { while (timers.length) timers.shift()(); },
    raf(n = 1) { for (let i = 0; i < n; i++) { const q = rafs.splice(0); q.forEach(f => f(i * 16 + 16)); } },
    screen(id) { screens.current = id; screenFns.forEach(fn => fn(id)); },
    frames(m, n, dt = 1 / 60) { for (let i = 0; i < n; i++) ctx.Tutorial.frame(m, dt); },
  };
}

/* ---------------- storage ---------------- */

section('tutorial — what has been seen');

test('a fresh profile has seen nothing', () => {
  const w = world();
  ok(!w.T.seen('menu:play'));
  ok(!w.T.seen('mission:boat-race'));
  ok(!w.T.off);
});

test('seen survives a reload, and only in its own key', () => {
  const storage = H.makeStorage();
  const a = world({ storage });
  a.T.markSeen('mission:dive');
  a.T.setOff(true);
  ok(storage.getItem('traitors.save.v1') === null, 'the save is not touched');
  const b = world({ storage });
  ok(b.T.seen('mission:dive'), 'still seen after a reload');
  ok(b.T.off, 'still off after a reload');
  b.T.forget('mission:dive');
  ok(!world({ storage }).T.seen('mission:dive'), 'forget is written too');
});

test('reset forgets every tour and turns them back on', () => {
  const storage = H.makeStorage();
  const a = world({ storage });
  a.T.markSeen('menu:play'); a.T.markSeen('mission:ski'); a.T.setOff(true);
  a.T.reset();
  const b = world({ storage });
  ok(!b.T.seen('menu:play') && !b.T.seen('mission:ski') && !b.T.off);
});

test('corrupt storage starts fresh', () => {
  const storage = H.makeStorage();
  storage.setItem('traitors.tutorial.v1', '{not json');
  const w = world({ storage });
  ok(!w.T.seen('menu:play'));
  w.T.markSeen('menu:play');
  ok(w.T.seen('menu:play'));
});

test('storage that throws never breaks anything', () => {
  const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); } };
  const w = world({ storage: bad });
  ok(!w.T.seen('mission:shootout'));
  w.T.markSeen('mission:shootout');
  ok(w.T.seen('mission:shootout'), 'remembered for the session at least');
});

/* ---------------- the clock ---------------- */

/* ---------------- menus ---------------- */

section('tutorial — the menus');

test('the front door runs its tour once, after the screen settles', () => {
  const w = world();
  w.screen('play');
  ok(!w.T.active, 'not before the screen has drawn');
  w.runTimers();
  ok(w.T.active);
  eq(w.T.current.kind, 'menu');
  ok(w.root.classList.contains('blocking'), 'a solo menu tour holds the pointer');
  w.screen('lobby');
  ok(!w.T.active, 'leaving the screen ends it');
  ok(w.T.seen('menu:play'));
  w.runTimers();
  eq(w.T.current && w.T.current.id, 'menu:lobby', 'and the next screen has its own');
});

test('room screens never block the pointer', () => {
  const w = world();
  w.screen('lobby'); w.runTimers();
  ok(w.T.active);
  ok(!w.root.classList.contains('blocking'), 'the host can always press start');
});

test('walking to the end of a tour with Next finishes it', () => {
  const w = world();
  w.screen('play'); w.runTimers();
  const n = w.S.menus.play.length;
  for (let i = 0; i < n; i++) w.part('.tut-next').fire('click');
  ok(!w.T.active && w.T.seen('menu:play'), 'seen, and gone');
});

/* ---------------- the tables themselves ---------------- */

section('tutorial — every step points at something real');

test('every target in the step tables exists in index.html', () => {
  const html = fs.readFileSync(path.join(H.ROOT, 'index.html'), 'utf8');
  const w = world();
  const all = [...Object.values(w.S.menus), ...Object.values(w.S.missions), w.S.traitorTask].flat();
  const missing = [];
  for (const s of all) {
    for (const sel of [s.target, s.touchTarget]) {
      if (typeof sel !== 'string') continue;
      for (const part of sel.split(/\s+/)) {
        for (const tok of part.match(/[#.][\w-]+/g) || []) {
          const name = tok.slice(1);
          const src = tok[0] === '#' ? html : html + fs.readFileSync(path.join(H.ROOT, 'js/main.js'), 'utf8');
          const re = tok[0] === '#' ? new RegExp('id="' + name + '"')
                                    : new RegExp('["\\s\'.]' + name + '["\\s\']');
          if (!re.test(src)) missing.push(sel);
        }
      }
    }
  }
  eq(missing, [], 'selectors with nothing to point at');
});

test('there are no mission tours left to run', () => {
  const w = world();
  eq(Object.keys(w.S.missions), [], 'the missions are gone, and so are their tours');
  eq(Object.keys(w.S.menus).sort(), ['lobby', 'play']);
});

H.report();

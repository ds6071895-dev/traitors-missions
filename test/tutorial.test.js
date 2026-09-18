/* ------------------------------------------------------------------
   tutorial.test.js — the first-time tours.

   Three promises matter more than how the card looks: what has been
   seen survives a reload (and a broken storage never breaks the game),
   a solo tour holds the mission clock only until the controls are
   learnt, and nothing about it ever holds a clock that two other
   people are sharing. The overlay is faked to the few properties the
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

section('tutorial — the mission clock');

function boat() { return { state: 'countdown', gatesHit: 0 }; }

function playBoatTour(w, m) {
  w.T.missionStarted('boat-race', m);
  ok(w.T.active, 'the tour started');
  w.frames(m, 30);
  eq(w.T.current.step, 0, 'the first card waits out the countdown');
  m.state = 'racing';
  w.frames(m, 50);                              // tick, then the next card
  eq(w.T.current.step, 1, 'on to the throttle');
  w.input._throttle = 1; w.frames(m, 120); w.input._throttle = 0;
  eq(w.T.current.step, 2, 'on to steering');
  w.input._steer = -1; w.frames(m, 120); w.input._steer = 0;
  eq(w.T.current.step, 3, 'on to boost');
  w.input._held.add('boost'); w.frames(m, 90); w.input._held.delete('boost');
  eq(w.T.current.step, 4, 'on to the first gate');
}

test('a solo first run holds the clock until the controls are learnt', () => {
  const w = world();
  const m = boat();
  w.T.missionStarted('boat-race', m);
  ok(w.T.holdsClock(), 'held from the start');
  w.T.missionEnded();
  const w2 = world();
  playBoatTour(w2, m);
  ok(w2.T.holdsClock(), 'still held until a gate is threaded');
  m.gatesHit = 1; w2.frames(m, 50);
  eq(w2.T.current.step, 5, 'on to the go card');
  ok(!w2.T.holdsClock(), 'the go card lets the clock run');
  w2.frames(m, 60 * 4);
  ok(!w2.T.active, 'and the tour ends on its own');
  ok(w2.T.seen('mission:boat-race'), 'seen');
});

test('a holding step does not finish on a tap', () => {
  const w = world();
  const m = boat();
  w.T.missionStarted('boat-race', m);
  m.state = 'racing'; w.frames(m, 50);
  w.input._throttle = 1; w.frames(m, 5); w.input._throttle = 0; w.frames(m, 5);
  eq(w.T.current.step, 1, 'a twelfth of a second of W is not learning W');
});

test('a second run of the same mission has no tour', () => {
  const w = world();
  w.T.markSeen('mission:boat-race');
  w.T.missionStarted('boat-race', boat());
  ok(!w.T.active && !w.T.holdsClock());
});

test('turned off means no tours at all', () => {
  const w = world();
  w.T.setOff(true);
  w.T.missionStarted('dive', { state: 'countdown' });
  ok(!w.T.active);
});

test('skip releases the clock and counts as seen', () => {
  const w = world();
  w.T.missionStarted('ski', { state: 'countdown' });
  ok(w.T.holdsClock());
  w.T.skip();
  ok(!w.T.holdsClock() && !w.T.active);
  ok(w.T.seen('mission:ski'));
});

test('quitting mid-tour is not seen, and the clock is not left held', () => {
  const w = world();
  w.T.missionStarted('shootout', { state: 'countdown' });
  w.T.missionEnded();
  ok(!w.T.holdsClock() && !w.T.active);
  ok(!w.T.seen('mission:shootout'), 'it runs again next time');
});

test('finishing the mission before the tour ends it quietly', () => {
  const w = world();
  const m = { state: 'countdown', carry: [] };
  w.T.missionStarted('dive', m);
  m.state = 'finished'; w.frames(m, 1);
  ok(!w.T.active && !w.T.holdsClock() && w.T.seen('mission:dive'));
});

test('a tour for a different instance is not driven by this one', () => {
  const w = world();
  const a = boat(), b = boat();
  w.T.missionStarted('boat-race', a);
  b.state = 'racing'; w.frames(b, 60);
  eq(w.T.current.step, 0);
});

/* ---------------- multiplayer ---------------- */

section('tutorial — multiplayer never holds a shared clock');

test('in a room the mission tour is hints and never holds the clock', () => {
  const w = world();
  w.net.live = true;
  w.T.missionStarted('boat-race', boat());
  ok(w.T.active, 'hints still show');
  eq(w.T.current.mode, 'hints');
  ok(!w.T.holdsClock());
});

test('a room arriving mid-tour lets go of the clock at once', () => {
  const w = world();
  w.T.missionStarted('boat-race', boat());
  ok(w.T.holdsClock());
  w.net.live = true;
  ok(!w.T.holdsClock());
});

test('hints leave by themselves', () => {
  const w = world();
  w.net.live = true;
  const m = boat();
  m.state = 'racing';
  w.T.missionStarted('boat-race', m);
  w.frames(m, 60 * 80);              // nobody touches anything for 80 s
  ok(!w.T.active, 'every hint timed out');
  ok(w.T.seen('mission:boat-race'));
});

test('the task hint needs a room and a task chip on this screen', () => {
  const w = world();
  const m = { state: 'racing' };
  w.T.markSeen('mission:boat-race');
  w.frames(m, 5);
  ok(!w.T.active, 'solo: nothing');
  w.net.live = true;
  w.frames(m, 5);
  ok(!w.T.active, 'no chip showing: not the Traitor, nothing');
  w.chip.classList.add('on');
  w.frames(m, 1);
  ok(w.T.active, 'the Traitor gets it');
  eq(w.T.current.id, 'traitor-task');
  ok(!w.T.holdsClock());
});

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
  w.screen('title');
  ok(!w.T.active, 'leaving the screen ends it');
  ok(w.T.seen('menu:play'));
  w.runTimers();
  eq(w.T.current && w.T.current.id, 'menu:title', 'and the next screen has its own');
});

test('room screens never block the pointer', () => {
  const w = world();
  w.screen('mparty'); w.runTimers();
  ok(w.T.active);
  ok(!w.root.classList.contains('blocking'), 'the host can always press start');
});

test('a click step finishes when its button is clicked', () => {
  const w = world();
  w.screen('brief'); w.runTimers();
  const last = w.S.menus.brief.length - 1;
  // walk to the last card with Next
  for (let i = 0; i < last; i++) w.part('.tut-next').fire('click');
  eq(w.T.current.step, last);
  w.target('#brief-go').fire('click');
  ok(!w.T.active && w.T.seen('menu:brief'));
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
          // the mission list is drawn by main.js rather than written in the page
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

test('every playable mission has a tour ending in a go card', () => {
  const w = world();
  for (const id of ['boat-race', 'shootout', 'dive', 'ski']) {
    const t = w.S.missions[id];
    ok(t && t.length >= 3, id + ' has a tour');
    ok(t[t.length - 1].go, id + ' ends by letting the clock run');
    ok(t.filter(s => s.go).length === 1, id + ' releases the clock once');
  }
});

H.report();

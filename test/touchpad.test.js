/* ------------------------------------------------------------------
   touchpad.test.js — the thumb overlays, and the machines they have to
   appear on.

   Two halves, because this file has had two different bugs in it.

   The first half is still static. The pad is not part of the screen
   stack; it is a sibling of it, so it has to be told separately which
   screens count as gameplay: `blocked` means "there is a panel up, get
   out of the way", and the list of screens that are *not* a panel is a
   hand-written array in input.js. Every mission that has ever shipped
   has had to remember to add its own HUD to that array, and the
   mountain did not — its overlay was `visible` and `blocked` at the
   same time, which resolves to `display:none`, so the ski mission had
   no touch controls at all on any phone and nothing on screen said why.

   The second half is new, and it is there because the Dive had no
   controls on an iPad while every static check in this file passed.
   Nothing was misnamed and nothing was missing: `isTouch` was decided
   once, at load, by `(hover: none) and (pointer: coarse)`, and an iPad
   with a keyboard case does not match that. The sheet stayed hidden and
   the mission it was the only controls for became unplayable.

   So the second half builds the actual markup out of index.html, runs
   input.js against it, and presses things — on a phone, on an iPad with
   a keyboard, on a laptop with a touchscreen and on a plain desktop.
   The question it answers is the only one that matters: does a finger
   landing there do the thing.
------------------------------------------------------------------ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const H = require('./harness');
const MiniDOM = require('./minidom');
const { test, eq, ok, section, report } = H;

const read = (f) => fs.readFileSync(path.join(H.ROOT, f), 'utf8');
const INPUT = read('js/core/input.js');
const UINAV = read('js/core/uinav.js');
const HTML = read('index.html');
const CSS = read('css/style.css');

const MISSIONS = ['boat-race', 'ski', 'shootout', 'dive'];

const thumbsOk = () => {
  const m = INPUT.match(/const THUMBS_OK\s*=\s*\[([^\]]*)\]/);
  if (!m) throw new Error('THUMBS_OK is no longer an array literal');
  return m[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
};

/* Every HUD the page declares, which is the list both THUMBS_OK and
   UINav's PLAYING have to agree with. Reading it out of the markup is
   what makes adding a fifth mission fail here rather than in a hand. */
const pageHuds = () =>
  [...HTML.matchAll(/data-screen="(hud[\w-]*)"/g)].map(m => m[1]);

section('touch — the pad is allowed under every mission');

test('every HUD a mission opens is a screen the pad may sit under', () => {
  const allowed = thumbsOk();
  for (const id of MISSIONS) {
    const src = read('js/missions/' + id + '.js');
    const huds = [...src.matchAll(/Screens\.show\('(hud[\w-]*)'\)/g)].map(m => m[1]);
    ok(huds.length, id + ' opens no HUD at all');
    for (const h of huds) {
      ok(allowed.indexOf(h) >= 0,
         id + ' plays on "' + h + '", which the thumb overlay is blocked from');
    }
  }
});

test('every screen the pad may sit under is a screen that exists', () => {
  for (const id of thumbsOk()) {
    ok(HTML.indexOf('data-screen="' + id + '"') >= 0,
       'THUMBS_OK names "' + id + '", which is not in the page');
  }
});

/* The mountain's HUD was in THUMBS_OK and missing from UINav's list of
   screens that are gameplay, so during a ski run every arrow key was
   being taken by a menu focus ring that had nothing to focus. */
test('no mission HUD is mistaken for a menu by the focus ring', () => {
  const m = UINAV.match(/const PLAYING\s*=\s*new Set\(\[([^\]]*)\]\)/);
  ok(m, 'PLAYING is still a Set of screen ids');
  const playing = m[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
  for (const h of pageHuds()) {
    ok(playing.indexOf(h) >= 0,
       '"' + h + '" is a HUD the menu walker thinks is a menu');
  }
});

section('touch — the driving pad');

test('the pad has both its buttons, and both are bound', () => {
  ok(HTML.indexOf('class="boost-btn"') >= 0, 'the round button is in the page');
  ok(HTML.indexOf('class="aux-btn"') >= 0, 'and so is the second one');
  ok(INPUT.indexOf(".querySelector('.boost-btn')") >= 0, 'the round one is wired');
  ok(INPUT.indexOf(".querySelector('.aux-btn')") >= 0, 'and so is the second one');
});

test('the second button drives an action rather than a field of its own', () => {
  const m = INPUT.match(/throttle:\s*\[([^\]]*)\]/);
  ok(m, 'throttle is still a binding');
  ok(m[1].indexOf('Touch5') >= 0,
     'the aux pad presses a code nothing reads: it must be bound to throttle');
});

test('the pad goes back to its own labels when a mission lets go of it', () => {
  ok(/function setDrivePad/.test(INPUT), 'there is one place that labels it');
  const body = INPUT.slice(INPUT.indexOf('function setDrivePad'));
  ok(body.indexOf("'BOOST'") >= 0, 'and passing nothing restores the default');
  ok(body.indexOf("pressCode('Touch5', false)") >= 0,
     'hiding the second button must release whatever it was holding');
});

test('the mountain asks for contextual grabs and gives them back', () => {
  const ski = read('js/missions/ski.js');
  ok(/Input\.setDrivePad\(\{[^}]*grabs:\s*true/.test(ski), 'the ski asks for contextual grabs');
  ok(ski.indexOf('Input.setDrivePad(null)') >= 0, 'and puts the pad back on the way out');
});

/* ==================================================================
   The live half: input.js, the real markup, and a finger.
   ================================================================== */

/* A machine, described the way a media query describes one. `pointer`
   and `hover` are the *primary* input; `anyPointer` and `anyHover` are
   everything attached. An iPad with a keyboard case is the interesting
   row: its primary pointer is the trackpad and its finger is still
   there, which is precisely the case the old one-line query missed. */
const MACHINES = {
  phone:    { hover: 'none',  pointer: 'coarse', anyPointer: ['coarse'], touchPoints: 5 },
  ipadBare: { hover: 'none',  pointer: 'coarse', anyPointer: ['coarse'], touchPoints: 5 },
  ipadKeys: { hover: 'hover', pointer: 'fine',   anyPointer: ['fine', 'coarse'], touchPoints: 5 },
  laptopTouch: { hover: 'hover', pointer: 'fine', anyPointer: ['fine', 'coarse'], touchPoints: 10 },
  desktop:  { hover: 'hover', pointer: 'fine',   anyPointer: ['fine'], touchPoints: 0 },
};

/* Just enough of a media query to answer the three this file asks:
   `(feature: value)` terms joined by "and". Written as an evaluator
   rather than a lookup table of exact strings so that rewording a
   query in input.js does not quietly turn these tests green. */
function matchMediaFor(machine) {
  return (query) => {
    const terms = [...String(query).matchAll(/\(\s*([\w-]+)\s*:\s*([\w-]+)\s*\)/g)];
    if (!terms.length) return { matches: false };
    const matches = terms.every(([, feature, value]) => {
      if (feature === 'hover') return machine.hover === value;
      if (feature === 'pointer') return machine.pointer === value;
      if (feature === 'any-pointer') return machine.anyPointer.indexOf(value) >= 0;
      if (feature === 'any-hover') return (machine.anyHover || [machine.hover]).indexOf(value) >= 0;
      throw new Error('the machine model has no answer for "' + feature + '"');
    });
    return { matches, addEventListener() {}, removeEventListener() {} };
  };
}

/* input.js, loaded against the page's own touch markup. `pointerLock`
   says whether the canvas offers `requestPointerLock` at all — Safari
   on iPadOS does not, and that is a mission you cannot look around in
   rather than a mission with a cursor in it. */
function boot(machineName, opts = {}) {
  return bootOn(MiniDOM.build(
    ['touch-controls', 'touch-shoot', 'touch-dive', 'agenda-chip'], ['gl']),
    machineName, opts);
}

function bootOn(dom, machineName, opts = {}) {
  const machine = MACHINES[machineName];
  if (!machine) throw new Error('no such machine: ' + machineName);

  const canvas = dom.el('gl');
  if (opts.pointerLock !== false) {
    canvas.requestPointerLock = () => { dom.doc.pointerLockElement = canvas; };
  }

  const winL = new Map();
  const ctx = {
    console, Math, Date, Set, Map, Object, Array, JSON, String, Number, Boolean, Error,
    setTimeout, clearTimeout, performance,
    document: dom.doc,
    navigator: { maxTouchPoints: machine.touchPoints, vibrate: () => true },
    matchMedia: matchMediaFor(machine),
    addEventListener(type, fn) {
      if (!winL.has(type)) winL.set(type, []);
      winL.get(type).push(fn);
    },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['js/core/util.js', 'js/core/input.js']) {
    const src = read(f);
    const names = new Set();
    for (const m of src.matchAll(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/gm)) names.add(m[1]);
    vm.runInContext(src + '\n;' + [...names].map(n => `globalThis.${n}=${n};`).join('\n'),
                    ctx, { filename: f });
  }
  const fireWindow = (type, ev) => {
    const e = Object.assign({ type, preventDefault() {} }, ev || {});
    for (const fn of winL.get(type) || []) fn(e);
    return e;
  };
  ctx.Input.init();
  return { Input: ctx.Input, dom, fireWindow, canvas };
}

// a press and a release on one of the round pads
function tap(el, id = 1, at = { clientX: 400, clientY: 400 }) {
  el.fire('pointerdown', Object.assign({ pointerId: id }, at));
  el.fire('pointerup', { pointerId: id });
}
const vis = (el) => el.classList.contains('visible');

section('touch — which machine is this');
test('desktop buttons never capture the pointer or fire a weapon', () => {
  const { Input, fireWindow, canvas, dom } = boot('desktop');
  Input.setMouseAim(true);
  const button = dom.doc.createElement('button');
  fireWindow('mousedown', { target: button, button: 0 });
  eq(dom.doc.pointerLockElement, null); eq(Input.held('fire'), false);
  fireWindow('mousedown', { target: canvas, button: 0 });
  ok(dom.doc.pointerLockElement === canvas);
  dom.doc.fire('pointerlockchange');
  let released = false;
  dom.doc.exitPointerLock = () => { released = true; dom.doc.pointerLockElement = null; dom.doc.fire('pointerlockchange'); };
  fireWindow('keydown', { code: 'Tab' });
  eq(released, true); eq(Input.pointerLocked, false);
  fireWindow('mousedown', { target: button, button: 0 });
  eq(dom.doc.pointerLockElement, null);
});

test('a phone is a touchscreen', () => {
  eq(boot('phone').Input.isTouch, true, 'a phone');
});

/* The Dive bug, in one line. Everything else in this file passed while
   this was wrong, because nothing else in this file asked. */
test('an iPad with a keyboard case is still a touchscreen', () => {
  eq(boot('ipadKeys').Input.isTouch, true,
     'a tablet with something plugged into it reports hover:hover, and it is '
     + 'still the machine whose only controls are the thumb sheets');
});

test('a desktop with no touchscreen is not', () => {
  eq(boot('desktop').Input.isTouch, false, 'a mouse and nothing else');
});

test('a thumb turns the controls on, a mouse turns them off, either way round', () => {
  const { Input, fireWindow } = boot('laptopTouch');
  eq(Input.isTouch, true, 'a laptop with a touchscreen starts ready for a thumb');
  fireWindow('pointermove', { pointerType: 'mouse' });
  eq(Input.isTouch, false, 'and hands the screen back the moment the mouse moves');
  fireWindow('pointerdown', { pointerType: 'touch' });
  eq(Input.isTouch, true, 'and takes it again on the next tap');
});

/* Some Android browsers label a real finger 'mouse'. Losing the
   controls to that is the bug this whole section exists to prevent, so
   a machine with no fine pointer on it never believes the label. */
test('a machine with no mouse on it cannot be talked out of being a touchscreen', () => {
  const { Input, fireWindow } = boot('phone');
  fireWindow('pointerdown', { pointerType: 'mouse' });
  eq(Input.isTouch, true, 'there is no fine pointer on this device to switch to');
});

test('the sheets follow the answer changing mid-mission', () => {
  const { Input, dom, fireWindow } = boot('ipadKeys');
  Input.setTouchMode('swim');
  eq(vis(dom.el('touch-dive')), true, 'the dive sheet is up for a thumb');
  fireWindow('pointermove', { pointerType: 'mouse' });
  eq(vis(dom.el('touch-dive')), false, 'and gone once the trackpad is being used');
  fireWindow('pointerdown', { pointerType: 'touch' });
  eq(vis(dom.el('touch-dive')), true, 'and back on the next thumb, without a reload');
});

section('touch — the sheets, pressed');

test('exactly one sheet is up per control scheme', () => {
  const { Input, dom } = boot('phone');
  const [drive, shoot, swim] = ['touch-controls', 'touch-shoot', 'touch-dive'].map(dom.el);
  const up = () => [drive, shoot, swim].filter(vis).map(e => e.id);

  Input.setTouchMode('drive'); eq(up(), ['touch-controls'], 'driving');
  Input.setTouchMode('aim');   eq(up(), ['touch-shoot'], 'the wood');
  Input.setTouchMode('walk');  eq(up(), ['touch-shoot'], 'walking, on the shooter’s sheet');
  Input.setTouchMode('swim');  eq(up(), ['touch-dive'], 'the water');
  Input.setTouchMode('off');   eq(up(), [], 'and nothing during a scene');
});

test('the dive: KICK strokes, the sheet looks, the stick sculls', () => {
  const { Input, dom } = boot('phone');
  Input.setTouchMode('swim');
  const sheet = dom.el('touch-dive');

  const kick = sheet.querySelector('.kick-pad');
  kick.fire('pointerdown', { pointerId: 1, clientX: 700, clientY: 500 });
  eq(Input.held('fire'), true, 'a thumb on KICK is a stroke');
  kick.fire('pointerup', { pointerId: 1 });
  eq(Input.held('fire'), false, 'and letting go is the end of it');

  sheet.fire('pointerdown', { pointerId: 2, clientX: 400, clientY: 300 });
  sheet.fire('pointermove', { pointerId: 2, clientX: 440, clientY: 290 });
  const look = Input.aimDelta();
  ok(look.x > 0 && look.y < 0, 'dragging the sheet turns you, up being up');
  eq(Input.aimDelta(), { x: 0, y: 0 }, 'and a look is consumed exactly once');

  const stick = sheet.querySelector('.scull-zone');
  stick.fire('pointerdown', { pointerId: 3, clientX: 100, clientY: 600 });
  stick.fire('pointermove', { pointerId: 3, clientX: 148, clientY: 552 });
  const mv = Input.moveAxes();
  ok(mv.x > 0.6 && mv.y > 0.6, 'and the corner stick sculls: ' + JSON.stringify(mv));
});

test('the wood: three pads, and each of them presses its own action', () => {
  const { Input, dom } = boot('phone');
  Input.setTouchMode('aim');
  const sheet = dom.el('touch-shoot');
  for (const [sel, action] of [['.draw-pad', 'fire'], ['.focus-pad', 'focus'],
                               ['.sprint-pad', 'sprint']]) {
    const pad = sheet.querySelector(sel);
    ok(pad, sel + ' is in the page');
    pad.fire('pointerdown', { pointerId: 4, clientX: 700, clientY: 500 });
    eq(Input.held(action), true, sel + ' presses ' + action);
    pad.fire('pointerup', { pointerId: 4 });
    eq(Input.held(action), false, sel + ' releases ' + action);
  }
});

test('the boat: the stick steers and throttles, and both buttons press', () => {
  const { Input, dom } = boot('phone');
  Input.setTouchMode('drive');
  const pad = dom.el('touch-controls');

  const stick = pad.querySelector('.stick-zone');
  stick.fire('pointerdown', { pointerId: 5, clientX: 200, clientY: 600 });
  stick.fire('pointermove', { pointerId: 5, clientX: 252, clientY: 548 });
  ok(Input.steer() > 0.9, 'hard right');
  ok(Input.throttle() > 0.9, 'and full ahead');

  const boost = pad.querySelector('.boost-btn');
  boost.fire('pointerdown', { pointerId: 6, clientX: 700, clientY: 600 });
  eq(Input.held('boost'), true, 'BOOST boosts');
  boost.fire('pointerup', { pointerId: 6 });

  Input.setDrivePad({ main: 'POP', aux: 'TUCK' });
  const aux = pad.querySelector('.aux-btn');
  eq(aux.hidden, false, 'asking for a second button shows it');
  aux.fire('pointerdown', { pointerId: 7, clientX: 700, clientY: 500 });
  eq(Input.held('throttle'), true, 'and it holds the throttle down');
  aux.fire('pointerup', { pointerId: 7 });

  Input.setDrivePad(null);
  eq(aux.hidden, true, 'and putting the pad back hides it again');
  eq(Input.held('throttle'), false, 'without leaving the throttle held');
});

/* One missing element in the markup used to look exactly like the iPad
   bug — a mission with no controls and nothing saying why — because the
   whole of initTouch() gave up if the *driving* pad was not in the
   page. The dive's sheet does not depend on the boat's. */
test('a sheet that is missing from the page does not take the others with it', () => {
  const dom = MiniDOM.build(['touch-shoot', 'touch-dive'], ['gl']);   // no touch-controls
  const { Input } = bootOn(dom, 'phone');
  Input.setTouchMode('swim');
  eq(vis(dom.el('touch-dive')), true, 'the dive still has its sheet');
  const kick = dom.el('touch-dive').querySelector('.kick-pad');
  kick.fire('pointerdown', { pointerId: 9, clientX: 700, clientY: 500 });
  eq(Input.held('fire'), true, 'and the pad on it still presses');
});

test('leaving the driving pad lets go of everything it was holding', () => {
  const { Input, dom } = boot('phone');
  Input.setTouchMode('drive');
  const pad = dom.el('touch-controls');
  pad.querySelector('.boost-btn').fire('pointerdown', { pointerId: 8 });
  eq(Input.held('boost'), true, 'held');
  Input.setTouchMode('swim');
  eq(Input.held('boost'), false, 'a button that went off screen is not still down');
});

section('touch — looking around without a pointer lock');

/* Safari on iPadOS has no pointer lock at all. The click that was
   meant to take the pointer took nothing, `locked` stayed false, and
   the mousemove handler returned on its first line — so the Dive and
   the shootout were missions you could not turn round in. */
test('a browser with no pointer lock aims with the pointer itself', () => {
  const { Input, fireWindow } = boot('desktop', { pointerLock: false });
  Input.setMouseAim(true);
  fireWindow('mousemove', { clientX: 500, clientY: 400 });   // seeds the origin
  fireWindow('mousemove', { clientX: 530, clientY: 380 });
  const d = Input.aimDelta();
  eq(d, { x: 30, y: -20 }, 'the movement of the cursor is the look');
});

test('lifting the mouse and putting it down again does not whip the camera', () => {
  const { Input, fireWindow } = boot('desktop', { pointerLock: false });
  Input.setMouseAim(true);
  fireWindow('mousemove', { clientX: 500, clientY: 400 });
  fireWindow('mousemove', { clientX: 900, clientY: 400 });   // ran out of screen
  eq(Input.aimDelta(), { x: 0, y: 0 }, 'a jump that big is a hand, not a look');
  fireWindow('mousemove', { clientX: 930, clientY: 400 });
  eq(Input.aimDelta(), { x: 30, y: 0 }, 'and it carries on from where it landed');
});

test('a browser that does have pointer lock still waits for the click', () => {
  const { Input, fireWindow } = boot('desktop');
  Input.setMouseAim(true);
  fireWindow('mousemove', { clientX: 500, clientY: 400 });
  fireWindow('mousemove', { clientX: 560, clientY: 400 });
  eq(Input.aimDelta(), { x: 0, y: 0 },
     'unlocked movement is not a look on a machine that can lock');
});

test('"click to aim" is only offered where there is a pointer to take', () => {
  eq(boot('desktop').Input.aimReady, false,
     'a desktop that has not been clicked yet has something to say');
  eq(boot('desktop', { pointerLock: false }).Input.aimReady, true,
     'a browser with no lock to give has nothing to ask for');
  eq(boot('phone').Input.aimReady, true, 'and a thumb never needed one');
});

section('the pad is gone');

/* Controller support was scrapped: it cost a polled read inside every
   query in input.js, a second set of hint strings in four missions and
   a menu walker with no way to test it. Gone means gone — a stray
   `Input.rumble` left behind is a TypeError at the exact moment a boat
   hits a rock. */
test('nothing anywhere reaches for a gamepad any more', () => {
  const sources = [];
  (function walk(dir) {
    for (const name of fs.readdirSync(path.join(H.ROOT, dir))) {
      const rel = dir + '/' + name;
      const full = path.join(H.ROOT, rel);
      if (fs.statSync(full).isDirectory()) walk(rel);
      else if (name.endsWith('.js')) sources.push(rel);
    }
  })('js');
  ok(sources.length > 30, 'found the source tree: ' + sources.length + ' files');

  for (const f of sources) {
    const src = read(f);
    for (const bad of ['getGamepads', 'Input.rumble', 'padPresent', 'navAxis',
                       'vibrationActuator', 'hapticActuators']) {
      ok(src.indexOf(bad) < 0, f + ' still mentions ' + bad);
    }
  }
});

test('the buzz that is left is the one a phone can give', () => {
  ok(/function haptic/.test(INPUT), 'haptic survived the pad');
  ok(/navigator\.vibrate/.test(INPUT), 'and it is the phone vibrator it drives');
  const { Input } = boot('desktop');
  Input.haptic(20);              // nothing to buzz: must be a silent no-op
  ok(true, 'a machine with nothing to buzz is not an exception');
});

section('the Traitor’s button, on a phone');

/* The chip is the one control in the game that decides whether a
   Traitor got away with it, and in two of the four missions it was
   underneath a transparent full-screen sheet that ate every tap. */
function zOf(selector) {
  const re = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                        + '\\s*\\{[^}]*?z-index:\\s*(\\d+)', 'm');
  const m = re.exec(CSS);
  if (!m) throw new Error('no z-index found for ' + selector);
  return +m[1];
}

test('the task button sits above the sheets that would swallow it', () => {
  const chip = zOf('#agenda-chip');
  for (const sheet of ['#touch-shoot', '#touch-dive']) {
    ok(chip > zOf(sheet),
       '#agenda-chip (' + chip + ') must be above ' + sheet + ' (' + zOf(sheet)
       + '), which covers the whole screen and takes every pointer event on it');
  }
  ok(chip < zOf('.screen'),
     'and below the panels, so a results screen is never pressed through');
});

test('the chip passes taps through and only the button catches them', () => {
  const chipBlock = /#agenda-chip\{[^}]*\}/.exec(CSS)[0];
  ok(/pointer-events:\s*none/.test(chipBlock),
     'the chip must not eat a drag meant for the mission underneath it');
  const markBlock = /\.ac-mark\{[^}]*\}/.exec(CSS)[0];
  ok(/pointer-events:\s*auto/.test(markBlock), 'and the button must catch its own');
  ok(/touch-action:\s*manipulation/.test(markBlock),
     'a button that is pressed twice in a row must refuse the double-tap zoom '
     + 'itself, or the guard has to swallow the press that confirms it');
});

test('the button is a real button, which is the only reason a phone can press it', () => {
  const dom = MiniDOM.build(['agenda-chip']);
  const b = dom.el('agenda-mark');
  ok(b, 'the chip still has its mark button');
  eq(b.tagName, 'BUTTON', 'and it is a <button>, not a styled div');
  const RU = read('js/core/roomui.js');
  ok(/addEventListener\('click'/.test(RU.slice(RU.indexOf('function wireMark'))),
     'wired on click, which is what a tap produces');
});

report();

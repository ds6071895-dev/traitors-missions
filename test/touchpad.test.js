/* ------------------------------------------------------------------
   touchpad.test.js — the thumb overlay and the HUDs it lies under.

   The pad is not part of the screen stack. It is a sibling of it, so it
   has to be told separately which screens count as gameplay: `blocked`
   means "there is a panel up, get out of the way", and the list of
   screens that are *not* a panel is a hand-written array in input.js.

   Every mission that has ever shipped has had to remember to add its
   own HUD to that array, and the mountain did not. Its overlay was
   `visible` and `blocked` at the same time, which resolves to
   `display:none` — so the ski mission had no touch controls at all, on
   any phone, and there was nothing on screen to say why.

   That is not a bug you can see from either file alone, so this reads
   both: every HUD a mission opens must be a HUD the pad is allowed to
   sit under, and every button the pad offers must be bound to
   something.
------------------------------------------------------------------ */
const fs = require('fs');
const path = require('path');
const H = require('./harness');
const { test, eq, ok, section, report } = H;

const read = (f) => fs.readFileSync(path.join(H.ROOT, f), 'utf8');
const INPUT = read('js/core/input.js');
const HTML = read('index.html');

const MISSIONS = ['boat-race', 'ski', 'shootout', 'dive'];

const thumbsOk = () => {
  const m = INPUT.match(/const THUMBS_OK\s*=\s*\[([^\]]*)\]/);
  if (!m) throw new Error('THUMBS_OK is no longer an array literal');
  return m[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
};

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

test('the mountain asks for both buttons and gives them back', () => {
  const ski = read('js/missions/ski.js');
  ok(/Input\.setDrivePad\(\{[^}]*aux:\s*'TUCK'/.test(ski), 'the ski asks for a tuck button');
  ok(ski.indexOf('Input.setDrivePad(null)') >= 0, 'and puts the pad back on the way out');
});

report();

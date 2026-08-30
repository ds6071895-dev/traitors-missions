/* ------------------------------------------------------------------
   input.js — action-based input.

   Missions ask for named actions ("throttle", "steer", "boost"), never
   for raw keys, so rebinding, gamepads and touch all stay in one place
   and every future mission gets them for free.
------------------------------------------------------------------ */
const Input = (() => {

  // action -> list of KeyboardEvent.code values
  const BINDINGS = {
    throttle:  ['KeyW', 'ArrowUp'],
    brake:     ['KeyS', 'ArrowDown'],
    left:      ['KeyA', 'ArrowLeft'],
    right:     ['KeyD', 'ArrowRight'],
    boost:     ['Space', 'ShiftLeft', 'ShiftRight'],
    // a bow needs its own two: draw/loose, and hold-your-breath
    fire:      ['Space', 'Mouse0', 'Touch0'],
    sprint:    ['KeyQ', 'Touch3'],
    // arrows look, WASD walks — they cannot share a binding once you can
    // do both at the same time
    lookLeft:  ['ArrowLeft'],
    lookRight: ['ArrowRight'],
    lookUp:    ['ArrowUp'],
    lookDown:  ['ArrowDown'],
    focus:     ['ShiftLeft', 'ShiftRight', 'Mouse2', 'Touch2'],
    pause:     ['Escape', 'KeyP'],
    restart:   ['KeyR'],
    confirm:   ['Enter', 'NumpadEnter'],
    back:      ['Escape', 'Backspace'],
    camera:    ['KeyC'],
    mute:      ['KeyM'],
  };

  const down = new Set();          // codes currently held
  const active = new Set();        // actions currently active
  const pressedThisFrame = new Set();
  const releasedThisFrame = new Set();

  // touch state
  const touch = { active: false, steer: 0, throttle: 0, boost: false };
  // free-look state: mouse deltas accumulate between frames and are consumed
  // by whoever reads them, so a 200 Hz mouse still turns you exactly once
  const look = { dx: 0, dy: 0 };
  const touchMove = { active: false, x: 0, y: 0 };
  let mouseAim = false, locked = false, touchMode = 'drive';
  const lockListeners = new Set();
  let enabled = true;
  const isTouch = matchMedia('(hover: none) and (pointer: coarse)').matches;

  function actionsFor(code) {
    const out = [];
    for (const a in BINDINGS) if (BINDINGS[a].includes(code)) out.push(a);
    return out;
  }

  /* One path for every button on the machine: a keyboard code, or the
     synthetic 'Mouse0' / 'Mouse2' codes the pointer handlers push in. */
  function pressCode(code, isDown) {
    if (!enabled) return;
    if (isDown && down.has(code)) return;        // ignore auto-repeat
    if (isDown) down.add(code); else down.delete(code);
    for (const a of actionsFor(code)) {
      if (isDown) {
        if (!active.has(a)) { active.add(a); pressedThisFrame.add(a); }
      } else {
        // only clear if no other bound key for that action is still held
        if (!BINDINGS[a].some(c => down.has(c))) {
          active.delete(a); releasedThisFrame.add(a);
        }
      }
    }
  }

  function onKey(e, isDown) {
    if (!enabled) return;
    if (actionsFor(e.code).length && e.code === 'Space') e.preventDefault();
    pressCode(e.code, isDown);
  }

  function clearAll() {
    // release every action, or a held button survives an alt-tab
    for (const a of active) releasedThisFrame.add(a);
    down.clear(); active.clear();
    look.dx = look.dy = 0;
  }

  function init() {
    window.addEventListener('keydown', e => onKey(e, true));
    window.addEventListener('keyup', e => onKey(e, false));
    window.addEventListener('blur', clearAll);
    initMouse();
    initTouch();
  }

  /* -------- mouse look --------
     Only live while a mission asks for it, so nothing here can disturb a
     mission that is driven entirely with the keyboard. */

  function initMouse() {
    const canvas = document.getElementById('gl');
    window.addEventListener('mousemove', (e) => {
      if (!mouseAim || !locked) return;
      look.dx += e.movementX || 0;
      look.dy += e.movementY || 0;
    });
    window.addEventListener('mousedown', (e) => {
      if (!mouseAim) return;
      if (!locked) { requestLock(); return; }   // first click only takes the pointer
      e.preventDefault();
      pressCode('Mouse' + e.button, true);
    });
    window.addEventListener('mouseup', (e) => {
      if (!mouseAim) return;
      pressCode('Mouse' + e.button, false);
    });
    window.addEventListener('contextmenu', (e) => { if (mouseAim) e.preventDefault(); });
    document.addEventListener('pointerlockchange', () => {
      locked = document.pointerLockElement === canvas;
      if (!locked) {
        // dropping the pointer must not leave the string drawn
        pressCode('Mouse0', false); pressCode('Mouse2', false);
      }
      lockListeners.forEach(fn => fn(locked));
    });
  }

  function requestLock() {
    const canvas = document.getElementById('gl');
    if (!canvas || locked) return;
    try { canvas.requestPointerLock(); } catch (e) {}
  }
  function releaseLock() {
    if (document.pointerLockElement) { try { document.exitPointerLock(); } catch (e) {} }
  }

  // a mission turns free-look on in build() and off in dispose()
  function setMouseAim(on) {
    mouseAim = !!on;
    if (!on) { releaseLock(); look.dx = look.dy = 0; }
  }
  function onLockChange(fn) { lockListeners.add(fn); return () => lockListeners.delete(fn); }

  function initTouch() {
    const pad = document.getElementById('touch-controls');
    if (!pad) return;
    if (isTouch) pad.classList.add('visible');

    const stick = pad.querySelector('.stick-zone');
    const knob = pad.querySelector('.stick-knob');
    let id = null, ox = 0, oy = 0;

    const setKnob = (dx, dy) => { knob.style.transform = `translate(${dx}px, ${dy}px)`; };

    stick.addEventListener('pointerdown', e => {
      id = e.pointerId; ox = e.clientX; oy = e.clientY;
      stick.setPointerCapture(id); touch.active = true;
    });
    stick.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return;
      const dx = U.clamp(e.clientX - ox, -52, 52);
      const dy = U.clamp(e.clientY - oy, -52, 52);
      touch.steer = dx / 52;
      touch.throttle = U.clamp(-dy / 52, -1, 1);
      setKnob(dx, dy);
    });
    const end = e => {
      if (e.pointerId !== id) return;
      id = null; touch.steer = 0; touch.throttle = 0; touch.active = false; setKnob(0, 0);
    };
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);

    const bBtn = pad.querySelector('.boost-btn');
    bBtn.addEventListener('pointerdown', e => { e.preventDefault(); touch.boost = true; });
    bBtn.addEventListener('pointerup', () => { touch.boost = false; });
    bBtn.addEventListener('pointercancel', () => { touch.boost = false; });

    initTouchAim();
  }

  /* Aiming by thumb: drag anywhere on the sheet to look, hold DRAW to pull
     the string, hold FOCUS to steady it. Two pads and the whole screen. */
  function initTouchAim() {
    const pad = document.getElementById('touch-shoot');
    if (!pad) return;

    let id = null, lx = 0, ly = 0;
    pad.addEventListener('pointerdown', e => {
      if (e.target !== pad || id !== null) return;     // the pads handle themselves
      id = e.pointerId; lx = e.clientX; ly = e.clientY;
      pad.setPointerCapture(id);
    });
    pad.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return;
      look.dx += (e.clientX - lx) * 1.65;              // a thumb travels less than a mouse
      look.dy += (e.clientY - ly) * 1.65;
      lx = e.clientX; ly = e.clientY;
    });
    const end = e => { if (e.pointerId === id) id = null; };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);

    const bind = (sel, code) => {
      const b = pad.querySelector(sel);
      if (!b) return;
      b.addEventListener('pointerdown', e => { e.preventDefault(); pressCode(code, true); });
      b.addEventListener('pointerup', () => pressCode(code, false));
      b.addEventListener('pointercancel', () => pressCode(code, false));
    };
    bind('.draw-pad', 'Touch0');
    bind('.focus-pad', 'Touch2');
    bind('.sprint-pad', 'Touch3');

    // a walking stick in the bottom-left corner
    const stick = pad.querySelector('.move-zone');
    if (stick) {
      const knob = stick.querySelector('.move-knob');
      let mid = null, mx = 0, my = 0;
      stick.addEventListener('pointerdown', e => {
        mid = e.pointerId; mx = e.clientX; my = e.clientY;
        stick.setPointerCapture(mid); touchMove.active = true;
      });
      stick.addEventListener('pointermove', e => {
        if (e.pointerId !== mid) return;
        const dx = U.clamp(e.clientX - mx, -48, 48), dy = U.clamp(e.clientY - my, -48, 48);
        touchMove.x = dx / 48; touchMove.y = -dy / 48;
        if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
      });
      const mend = e => {
        if (e.pointerId !== mid) return;
        mid = null; touchMove.active = false; touchMove.x = touchMove.y = 0;
        if (knob) knob.style.transform = 'translate(0,0)';
      };
      stick.addEventListener('pointerup', mend);
      stick.addEventListener('pointercancel', mend);
    }
  }

  // which touch overlay is live — a mission picks one in build()
  function setTouchMode(mode) {
    touchMode = mode === 'aim' || mode === 'walk' || mode === 'off' ? mode : 'drive';
    const drive = document.getElementById('touch-controls');
    const shoot = document.getElementById('touch-shoot');
    if (drive) drive.classList.toggle('visible', isTouch && touchMode === 'drive');
    if (shoot) {
      shoot.classList.toggle('visible', isTouch && (touchMode === 'aim' || touchMode === 'walk'));
      shoot.classList.toggle('walk-only', touchMode === 'walk');
    }
  }

  function gamepad() {
    if (!navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    // the first *connected* pad, not the first slot: unplugging one and
    // plugging in another leaves a hole at index 0 on some browsers
    for (let i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) return pads[i];
    return null;
  }

  /* One button can mean more than one thing — south is "shoot" in a
     mission and "yes" in a menu, and only the reader knows which it is
     standing in front of. */
  const PAD = {
    0:  ['fire', 'boost', 'confirm'],
    1:  ['back'],
    4:  ['focus'],
    6:  ['focus'],
    7:  ['fire', 'boost'],
    9:  ['pause'],
    10: ['sprint'],
    12: ['navUp'], 13: ['navDown'], 14: ['navLeft'], 15: ['navRight'],
  };

  const dz = (v, d = 0.16) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));

  /* -------- public queries -------- */

  function held(action) {
    if (active.has(action)) return true;
    if (action === 'boost' && touch.boost) return true;
    const gp = gamepad();
    if (gp) {
      if (action === 'boost' && (gp.buttons[0]?.pressed || gp.buttons[7]?.pressed)) return true;
      if (action === 'fire' && (gp.buttons[7]?.pressed || gp.buttons[0]?.pressed)) return true;
      if (action === 'focus' && (gp.buttons[6]?.pressed || gp.buttons[4]?.pressed)) return true;
      if (action === 'sprint' && gp.buttons[10]?.pressed) return true;
      if (action === 'pause' && gp.buttons[9]?.pressed) return true;
      if (action === 'confirm' && gp.buttons[0]?.pressed) return true;
      if (action === 'back' && gp.buttons[1]?.pressed) return true;
    }
    return false;
  }

  /* -------- free look --------
     Two halves, because they are different animals: `aimDelta` is a
     *displacement* that has already happened (mouse, thumb) and must be
     consumed exactly once; `aimStick` is a *rate* that the caller
     integrates over its own dt (pad stick, arrow keys). */

  function aimDelta() {
    const d = { x: look.dx, y: look.dy };
    look.dx = 0; look.dy = 0;
    return d;
  }

  function aimStick() {
    const gp = gamepad();
    let x = 0, y = 0;
    if (gp) { x = dz(gp.axes[2] || 0); y = dz(gp.axes[3] || 0); }
    if (x === 0 && y === 0) {
      // keyboard-only players still have to be able to play
      x = (held('lookRight') ? 1 : 0) - (held('lookLeft') ? 1 : 0);
      y = (held('lookDown') ? 1 : 0) - (held('lookUp') ? 1 : 0);
    }
    return { x, y };
  }

  /* Walking, as its own axis pair: WASD and the left stick only. It has to
     stay clear of `throttle()`, which reads the triggers — and the right
     trigger is the one you are drawing the bow with. */
  function moveAxes() {
    let x = (down.has('KeyD') ? 1 : 0) - (down.has('KeyA') ? 1 : 0);
    let y = (down.has('KeyW') ? 1 : 0) - (down.has('KeyS') ? 1 : 0);
    const gp = gamepad();
    if (gp) {
      if (x === 0) x = dz(gp.axes[0] || 0);
      if (y === 0) y = -dz(gp.axes[1] || 0);
    }
    if (touchMove.active) { x = touchMove.x; y = touchMove.y; }
    const len = Math.hypot(x, y);
    return len > 1 ? { x: x / len, y: y / len } : { x, y };
  }

  // gamepad buttons have no keydown, so edges have to be found by diffing
  const padPrev = new Set();
  function scanPad() {
    const gp = gamepad();
    if (!gp) { padPrev.clear(); return; }
    for (const key in PAD) {
      const i = +key;
      const on = !!gp.buttons[i]?.pressed;
      const was = padPrev.has(i);
      if (on === was) continue;
      if (on) { padPrev.add(i); for (const a of PAD[i]) pressedThisFrame.add(a); }
      else { padPrev.delete(i); for (const a of PAD[i]) releasedThisFrame.add(a); }
    }
  }

  /* -------- menu navigation --------
     A d-pad held down has to walk a list, not sprint through it, so this
     is edge-plus-repeat rather than a raw read: one step immediately,
     nothing for a third of a second, then a steady tick. Returns
     {x, y} of -1/0/1, and zero on every frame in between. */

  const nav = { x: 0, y: 0, next: 0 };
  function navAxis() {
    const gp = gamepad();
    let x = 0, y = 0;
    if (gp) {
      if (gp.buttons[14]?.pressed) x = -1; else if (gp.buttons[15]?.pressed) x = 1;
      if (gp.buttons[12]?.pressed) y = -1; else if (gp.buttons[13]?.pressed) y = 1;
      if (!x) { const ax = gp.axes[0] || 0; if (Math.abs(ax) > 0.55) x = Math.sign(ax); }
      if (!y) { const ay = gp.axes[1] || 0; if (Math.abs(ay) > 0.55) y = Math.sign(ay); }
    }
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (!x && !y) { nav.x = 0; nav.y = 0; nav.next = 0; return { x: 0, y: 0 }; }
    if (x !== nav.x || y !== nav.y) { nav.x = x; nav.y = y; nav.next = now + 380; return { x, y }; }
    if (now >= nav.next) { nav.next = now + 150; return { x, y }; }
    return { x: 0, y: 0 };
  }

  const padPresent = () => !!gamepad();

  function pressed(action) { return pressedThisFrame.has(action); }
  function released(action) { return releasedThisFrame.has(action); }

  // -1 .. 1
  function steer() {
    let v = (held('right') ? 1 : 0) - (held('left') ? 1 : 0);
    if (v === 0 && touch.active) v = touch.steer;
    const gp = gamepad();
    if (v === 0 && gp) v = dz(gp.axes[0] || 0);
    return U.clamp(v, -1, 1);
  }

  // -1 .. 1  (negative = braking / reverse)
  function throttle() {
    let v = (held('throttle') ? 1 : 0) - (held('brake') ? 1 : 0);
    if (v === 0 && touch.active) v = touch.throttle;
    const gp = gamepad();
    if (v === 0 && gp) {
      const rt = gp.buttons[7]?.value || 0, lt = gp.buttons[6]?.value || 0;
      v = rt - lt;
      if (Math.abs(v) < 0.05) v = -dz(gp.axes[1] || 0);
    }
    return U.clamp(v, -1, 1);
  }

  // Force feedback, where the pad supports it. Silently a no-op everywhere
  // else, so callers can just fire and forget.
  function rumble(strength = 0.5, ms = 120, weak = null) {
    const gp = gamepad();
    const act = gp && (gp.vibrationActuator || (gp.hapticActuators && gp.hapticActuators[0]));
    if (!act) return;
    const s = U.clamp(strength, 0, 1);
    try {
      if (act.playEffect) {
        act.playEffect('dual-rumble', {
          startDelay: 0, duration: ms,
          strongMagnitude: s, weakMagnitude: weak === null ? s * 0.7 : U.clamp(weak, 0, 1),
        });
      } else if (act.pulse) act.pulse(s, ms);
    } catch (e) { /* pads lie about what they support; never let this throw */ }
  }

  // Touch players get the phone's vibrator instead.
  function haptic(ms = 12) {
    if (navigator.vibrate && isTouch) { try { navigator.vibrate(ms); } catch (e) {} }
  }

  function endFrame() { pressedThisFrame.clear(); releasedThisFrame.clear(); scanPad(); }
  function setEnabled(v) { enabled = v; if (!v) clearAll(); }
  function rebind(action, codes) { BINDINGS[action] = codes.slice(); }

  return { init, held, pressed, released, steer, throttle, endFrame,
           aimDelta, aimStick, moveAxes, setMouseAim, setTouchMode, requestLock, onLockChange,
           rumble, haptic, setEnabled, rebind, BINDINGS, isTouch,
           navAxis, padPresent,
           get pointerLocked() { return locked; } };
})();

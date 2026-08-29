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
    pause:     ['Escape', 'KeyP'],
    restart:   ['KeyR'],
    confirm:   ['Enter', 'NumpadEnter'],
    camera:    ['KeyC'],
    mute:      ['KeyM'],
  };

  const down = new Set();          // codes currently held
  const active = new Set();        // actions currently active
  const pressedThisFrame = new Set();
  const releasedThisFrame = new Set();

  // touch state
  const touch = { active: false, steer: 0, throttle: 0, boost: false };
  let enabled = true;
  const isTouch = matchMedia('(hover: none) and (pointer: coarse)').matches;

  function actionsFor(code) {
    const out = [];
    for (const a in BINDINGS) if (BINDINGS[a].includes(code)) out.push(a);
    return out;
  }

  function onKey(e, isDown) {
    if (!enabled) return;
    const acts = actionsFor(e.code);
    if (acts.length && e.code === 'Space') e.preventDefault();
    if (isDown && down.has(e.code)) return;      // ignore auto-repeat
    if (isDown) down.add(e.code); else down.delete(e.code);
    for (const a of acts) {
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

  function init() {
    window.addEventListener('keydown', e => onKey(e, true));
    window.addEventListener('keyup', e => onKey(e, false));
    window.addEventListener('blur', () => { down.clear(); active.clear(); });
    initTouch();
  }

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
  }

  function gamepad() {
    const gp = navigator.getGamepads ? navigator.getGamepads()[0] : null;
    return gp && gp.connected ? gp : null;
  }

  const dz = (v, d = 0.16) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));

  /* -------- public queries -------- */

  function held(action) {
    if (active.has(action)) return true;
    if (action === 'boost' && touch.boost) return true;
    const gp = gamepad();
    if (gp) {
      if (action === 'boost' && (gp.buttons[0]?.pressed || gp.buttons[7]?.pressed)) return true;
      if (action === 'pause' && gp.buttons[9]?.pressed) return true;
    }
    return false;
  }

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

  function endFrame() { pressedThisFrame.clear(); releasedThisFrame.clear(); }
  function setEnabled(v) { enabled = v; if (!v) { down.clear(); active.clear(); } }
  function rebind(action, codes) { BINDINGS[action] = codes.slice(); }

  return { init, held, pressed, released, steer, throttle, endFrame,
           rumble, haptic, setEnabled, rebind, BINDINGS, isTouch };
})();

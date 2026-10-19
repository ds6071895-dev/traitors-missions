/* ------------------------------------------------------------------
   input.js — action-based input.

   Missions ask for named actions ("throttle", "steer", "boost"), never
   for raw keys, so rebinding and touch stay in one place and every
   future mission gets them for free.

   Two devices, and only two: a keyboard with a mouse, and a
   touchscreen. There was a third — a gamepad — and it is gone. It cost
   a polled read in every query on this file, a second set of hint
   strings in four missions and a menu walker nobody could test, and
   the machines it was for are not the machines this is played on.

   Which of the two you are on is not a fact about the browser, it is a
   fact about the last thing you touched. An iPad with a keyboard case
   is a touchscreen when a thumb is on it and a desktop when the
   trackpad is, and a media query answers that question once, at load,
   for a device that changes its mind. So `isTouch` is live: the query
   is the opening guess and every pointer event afterwards is the
   answer. That is the whole of the iPad fix — the sheet of thumb
   controls a mission puts up is hidden by `isTouch`, so a wrong answer
   there is a mission with no controls at all on it.
------------------------------------------------------------------ */
const Input = (() => {

  // action -> list of KeyboardEvent.code values
  const BINDINGS = {
    throttle:  ['KeyW', 'ArrowUp', 'Touch5'],
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
    confirm:   ['Enter', 'NumpadEnter'],
    back:      ['Escape', 'Backspace'],
    camera:    ['KeyC'],
    mute:      ['KeyM'],
    // your own microphone, which is a different thing from game sound
    mic:       ['KeyV'],
    /* Marking the Traitor's task done, mid-mission, without letting go
       of anything. Nobody who is not carrying a card can do anything
       with this, so it costs one key and nothing else. The chip on the
       HUD is a real button, which is how a phone presses it. */
    task:      ['KeyT'],
    // the castle by day: use a station or hand a letter, the poison, your notebook
    interact:  ['KeyE'],
    run:       ['ShiftLeft', 'ShiftRight'],
    poison:    ['KeyF'],
    notes:     ['KeyN', 'Tab'],
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
  let mouseAim = false, locked = false, mouseBlocked = false, touchMode = 'drive';
  // a menu with text boxes and dropdowns on it is up: give the real pointer back
  let menuUp = false, inPlay = false;
  const lockListeners = new Set();
  let enabled = true;

  /* -------- which machine is this --------

     The opening guess, and it is only a guess. `(hover: none) and
     (pointer: coarse)` describes a phone exactly and describes an iPad
     only while nothing is plugged into it: attach a keyboard case and
     Safari starts answering `hover: hover, pointer: fine`, the thumb
     sheets stay `display:none`, and a mission whose only controls are
     on one of those sheets has no controls at all. That is what the
     Dive was on an iPad.

     So the guess is the wider question — is there a finger on this
     machine *at all* — and `sawPointer()` below narrows it from there
     using the only evidence that cannot be wrong: what the player is
     actually touching the screen with. */
  const mq = (q) => { try { return matchMedia(q).matches; } catch (e) { return false; } };
  const hasFine = () => mq('(any-pointer: fine)');
  function guessTouch() {
    if (mq('(hover: none) and (pointer: coarse)')) return true;    // a phone
    // a tablet, with or without something plugged into it
    return mq('(any-pointer: coarse)') && (navigator.maxTouchPoints || 0) > 0;
  }
  let isTouch = guessTouch();

  /* Every pointer event says what made it, and that answer beats every
     media query on the machine. A thumb turns the sheets on, a mouse or
     a trackpad turns them off, and swapping hands mid-run swaps them
     back — which is the behaviour an iPad in a keyboard case needs and
     a laptop with a touchscreen needs just as much.

     A mouse only ever wins on a machine that has a fine pointer to
     begin with: some Android browsers label a genuine touch 'mouse',
     and losing the controls to that is the bug this exists to fix. */
  function sawPointer(type) {
    const t = type === 'touch' || type === 'pen' ? true
            : type === 'mouse' && hasFine() ? false
            : null;
    if (t === null || t === isTouch) return;
    isTouch = t;
    applyTouchKind();
  }

  /* Everything on screen that `isTouch` decides, in one place, so the
     answer changing halfway through a mission is a repaint rather than
     a reload. */
  function applyTouchKind() {
    /* The stylesheet stacks the bottom-left corner off one number, and
       on a touchscreen a thumbstick is sitting in it. */
    if (document.body) document.body.classList.toggle('touch', isTouch);
    setTouchMode(touchMode);
  }

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
    if (isDown && e.code === 'Tab' && locked) { e.preventDefault(); releaseLock(); return; }
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
    /* Capture phase and the whole window, because this has to be true
       before anything downstream reads `isTouch` off the same gesture —
       a mission's first frame after a tap included. */
    window.addEventListener('pointerdown', e => sawPointer(e.pointerType), true);
    window.addEventListener('pointermove', e => sawPointer(e.pointerType), true);
    initMouse();
    initTouch();
  }

  /* -------- mouse look --------
     Only live while a mission asks for it, so nothing here can disturb a
     mission that is driven entirely with the keyboard.

     Two ways round, because one browser refuses the first. Pointer lock
     is the good one: the cursor disappears, the deltas never run out
     and you can turn for ever. Safari on iPadOS does not implement it
     at all — so on an iPad driven by a trackpad the click that was
     supposed to take the pointer took nothing, no mousemove was ever
     read, and the Dive was a mission you could not look around in.

     Where there is no lock to take, the pointer itself is the aim: the
     cursor stays visible, moving it turns you, and clicks stay free for
     firing. Running out of screen is answered the way it is on a
     trackpad anyway — lift, put it down somewhere else — so a jump
     bigger than a hand-sized move is read as exactly that and thrown
     away rather than whipping the camera round. */

  const REPLACE_PX = 80;          // a jump this big is a lift, not a look
  let freeX = 0, freeY = 0, freeSeen = false;

  const lockable = () => {
    const canvas = document.getElementById('gl');
    return !!(canvas && canvas.requestPointerLock);
  };

  function initMouse() {
    const canvas = document.getElementById('gl');
    window.addEventListener('mousemove', (e) => {
      if (!mouseAim || mouseBlocked) return;
      if (locked) {
        look.dx += e.movementX || 0;
        look.dy += e.movementY || 0;
        return;
      }
      if (lockable()) return;              // waiting on the click that takes it
      const dx = e.clientX - freeX, dy = e.clientY - freeY;
      freeX = e.clientX; freeY = e.clientY;
      if (!freeSeen) { freeSeen = true; return; }
      if (Math.abs(dx) > REPLACE_PX || Math.abs(dy) > REPLACE_PX) return;
      look.dx += dx; look.dy += dy;
    });
    window.addEventListener('mousedown', (e) => {
      // Only the world owns mouse look. Buttons must keep their normal click.
      if (!mouseAim || mouseBlocked || !enabled || e.target !== canvas) return;
      // first click only takes the pointer — where there is one to take
      if (!locked && lockable()) { requestLock(); return; }
      e.preventDefault();
      pressCode('Mouse' + e.button, true);
    });
    window.addEventListener('mouseup', (e) => {
      if (!mouseAim) return;
      pressCode('Mouse' + e.button, false);
    });
    window.addEventListener('contextmenu', (e) => { if (mouseAim && !mouseBlocked && e.target === canvas) e.preventDefault(); });
    document.addEventListener('pointerlockchange', () => {
      locked = document.pointerLockElement === canvas;
      // A menu can open while the browser is still granting an earlier request.
      if (locked && menuUp) { releaseLock(); return; }
      if (!locked) {
        // dropping the pointer must not leave the string drawn
        pressCode('Mouse0', false); pressCode('Mouse2', false);
      }
      syncCursor();
      // a click that took the pointer for looking round has no spot to keep
      if (!cur.on) cur.placed = false;
      lockListeners.forEach(fn => fn(locked));
    });
    initCursor();
  }

  function requestLock() {
    if (!mouseAim || mouseBlocked || !enabled) return;
    takeLock();
  }
  function takeLock() {
    const canvas = document.getElementById('gl');
    if (!canvas || locked || menuUp || !canvas.requestPointerLock) return;
    try {
      const pending = canvas.requestPointerLock();
      if (pending && pending.catch) pending.catch(() => {});
    } catch (e) {}
  }
  function releaseLock() {
    if (document.pointerLockElement) { try { document.exitPointerLock(); } catch (e) {} }
  }

  // a mission turns free-look on in build() and off in dispose()
  /* Turning it off no longer lets go of the pointer. A job, a vote or a
     cutscene used to drop the lock, and every one of them ended with a
     click on the world to take it back; now the lock is kept and the
     cursor below is drawn inside it instead. */
  function setMouseAim(on) {
    mouseAim = !!on;
    freeSeen = false;
    if (on) inPlay = true;
    if (!on) { look.dx = look.dy = 0; }
    syncCursor();
  }
  function onLockChange(fn) { lockListeners.add(fn); return () => lockListeners.delete(fn); }

  /* Can this player look around right now? A thumb always can, a locked
     pointer can, and a browser with no lock to offer can — it is only
     the machine that *has* pointer lock and has not been given it yet
     that cannot, which is the one case worth a "click to aim" on the
     HUD. Missions ask this rather than `pointerLocked` so that the hint
     is not left burning on a device that will never lock anything. */
  function aimReady() { return isTouch || locked || !lockable(); }

  /* -------- the drawn cursor --------

     While the pointer is held and the world is not the thing being
     pointed at — a job is open, the votes are up, a cutscene is
     running — the game draws its own cursor and moves it with the same
     raw deltas mouse look reads. Every press and release is handed on
     to whatever is under it as the browser would have: pointer, then
     mouse, then click, with enter and leave as it crosses things and
     the wheel scrolling whatever it is over. So a job's buttons, a
     wire dragged across a panel and the slider on the harp all work
     with the pointer still held, and closing them puts you straight
     back into looking round without a click to take the mouse again.

     It is real while the pointer is not held too: the stylesheet draws
     the same dart as the system cursor, so letting go with Esc changes
     nothing you can see. Clicking anywhere in play afterwards takes the
     pointer back, at the spot you clicked. */

  const cur = { x: 0, y: 0, on: false, el: null, hover: null, down: null, range: null,
                buttons: 0, dirty: false, idle: 0, lastClick: 0, lastAt: null, placed: false, sentX: NaN, sentY: NaN };
  const IDLE_MS = 2200;              // a cutscene does not need a dart parked in the middle of it

  const cursorWanted = () => locked && (!mouseAim || mouseBlocked);

  function cursorEl() {
    if (cur.el || !document.body) return cur.el;
    const n = document.createElement('div');
    n.id = 'vcursor';
    n.setAttribute('aria-hidden', 'true');
    n.innerHTML = '<svg class="vc-ring" viewBox="0 0 40 40"><circle cx="20" cy="20" r="15"/></svg>'
      + '<svg class="vc-dart" viewBox="0 0 24 24"><defs><linearGradient id="vc-gold" x1="0" y1="0" x2="1" y2="1">'
      + '<stop offset="0" stop-color="#fff4cc"/><stop offset=".5" stop-color="#f2c14e"/><stop offset="1" stop-color="#9a6a14"/>'
      + '</linearGradient><linearGradient id="vc-ember" x1="0" y1="0" x2="1" y2="1">'
      + '<stop offset="0" stop-color="#ffe2c0"/><stop offset=".5" stop-color="#ff8a4c"/><stop offset="1" stop-color="#a8321a"/>'
      + '</linearGradient></defs><path class="vc-body" d="M2 2 5.2 20.5 9.4 12.9 18.6 12.6Z"/>'
      + '<path class="vc-edge" d="M3.3 4.6 8.4 12.4"/></svg>';
    document.body.appendChild(n);
    cur.el = n;
    return n;
  }

  function syncCursor() {
    const want = cursorWanted();
    if (want === cur.on) return;
    cur.on = want;
    const n = cursorEl();
    if (want) {
      // out of looking round, the dart starts where the crosshair was
      if (!cur.placed) { cur.x = window.innerWidth / 2; cur.y = window.innerHeight / 2; }
      cur.placed = false;
      cur.sentX = cur.sentY = NaN;
      cur.idle = performance.now();
      if (n) n.classList.remove('idle');
      flushCursor();
    } else {
      // whatever it was holding is let go of where it is
      if (cur.buttons) release(0);
      setHover(null);
      cur.down = cur.range = null;
    }
    if (n) n.classList.toggle('on', want);
  }

  const targetAt = () => {
    const t = document.elementFromPoint ? document.elementFromPoint(cur.x, cur.y) : null;
    return t || document.body;
  };

  function synth(type, target, opt = {}) {
    if (!target) return true;
    const quiet = /enter|leave/.test(type);
    const init = {
      bubbles: !quiet, cancelable: !quiet, composed: true, view: window,
      clientX: cur.x, clientY: cur.y, screenX: cur.x, screenY: cur.y,
      button: opt.button || 0, buttons: cur.buttons, detail: opt.detail || 0,
      relatedTarget: opt.related || null,
      ctrlKey: !!opt.ctrlKey, shiftKey: !!opt.shiftKey, altKey: !!opt.altKey, metaKey: !!opt.metaKey,
    };
    let ev;
    if (type.startsWith('pointer') && typeof PointerEvent === 'function') {
      ev = new PointerEvent(type, Object.assign(init, {
        pointerId: 1, pointerType: 'mouse', isPrimary: true, width: 1, height: 1,
        pressure: cur.buttons ? 0.5 : 0 }));
    } else if (type === 'wheel' && typeof WheelEvent === 'function') {
      ev = new WheelEvent(type, Object.assign(init, opt.wheel));
    } else {
      ev = new MouseEvent(type, init);
    }
    return target.dispatchEvent(ev);
  }

  const ancestry = (n) => { const out = []; for (; n; n = n.parentNode) if (n.nodeType === 1) out.push(n); return out; };

  // over, out, enter, leave: the four the browser sends as a pointer crosses things
  function setHover(t) {
    const was = cur.hover;
    if (t === was) return;
    cur.hover = t;
    if (was && was.isConnected) {
      synth('pointerout', was, { related: t }); synth('mouseout', was, { related: t });
      for (const n of ancestry(was)) {
        if (t && n.contains(t)) break;
        synth('pointerleave', n, { related: t }); synth('mouseleave', n, { related: t });
      }
    }
    if (t) {
      synth('pointerover', t, { related: was }); synth('mouseover', t, { related: was });
      const enter = [];
      for (const n of ancestry(t)) { if (was && was.isConnected && n.contains(was)) break; enter.push(n); }
      for (const n of enter.reverse()) { synth('pointerenter', n, { related: was }); synth('mouseenter', n, { related: was }); }
    }
    if (cur.el) cur.el.classList.toggle('hot', isHot(t));
  }

  const HOT = 'button, a[href], [role="button"], label, summary, select, input, textarea, [onclick]';
  function isHot(t) {
    if (!t || t === document.body || t.id === 'gl') return false;
    const h = t.closest ? t.closest(HOT) : null;
    if (h) return !h.disabled;
    try { return getComputedStyle(t).cursor === 'pointer'; } catch (e) { return false; }
  }

  // moves arrive at the mouse's rate; the page hears about them once a frame
  function moveCursor(dx, dy) {
    cur.x = U.clamp(cur.x + dx, 0, Math.max(0, window.innerWidth - 1));
    cur.y = U.clamp(cur.y + dy, 0, Math.max(0, window.innerHeight - 1));
    cur.idle = performance.now();
    if (cur.el) cur.el.classList.remove('idle');
    if (!cur.dirty) { cur.dirty = true; requestAnimationFrame(flushCursor); }
  }

  function flushCursor() {
    cur.dirty = false;
    if (!cur.on) return;
    if (cur.el) cur.el.style.transform = 'translate3d(' + cur.x.toFixed(1) + 'px,' + cur.y.toFixed(1) + 'px,0)';
    const t = targetAt();
    setHover(t);
    // a press flushes first, and a press that did not move is not a move
    if (cur.x === cur.sentX && cur.y === cur.sentY) return;
    cur.sentX = cur.x; cur.sentY = cur.y;
    synth('pointermove', t);
    synth('mousemove', t);
    if (cur.range) slideRange(cur.range);
  }

  function slideRange(r) {
    const box = r.getBoundingClientRect();
    if (!box.width) return;
    const attr = (k, d) => { const v = r.getAttribute(k); return v === null || v === '' || isNaN(v) ? d : Number(v); };
    const min = attr('min', 0), max = attr('max', 100);
    const stepAttr = r.getAttribute('step') === 'any' ? 0 : attr('step', 1);
    let v = min + U.clamp((cur.x - box.left) / box.width, 0, 1) * (max - min);
    if (stepAttr) v = min + Math.round((v - min) / stepAttr) * stepAttr;
    const next = String(U.clamp(v, min, max));
    if (r.value === next) return;
    r.value = next;
    r.dispatchEvent(new Event('input', { bubbles: true }));
  }

  const FIELD = 'input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, [contenteditable=""], [contenteditable="true"]';

  function press(e) {
    flushCursor();
    const t = targetAt();
    // a dropdown opens only for a real pointer, so it is given one
    if (t.closest && t.closest('select')) { releaseLock(); return; }
    cur.buttons |= (1 << e.button);
    if (cur.el) cur.el.classList.add('down');
    cur.down = t;
    const opts = { button: e.button, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey };
    // a cancelled pointerdown keeps the mouse events back, as it does natively
    cur.quiet = !synth('pointerdown', t, opts);
    if (!cur.quiet) synth('mousedown', t, opts);
    const field = t.closest && t.closest(FIELD);
    const range = t.closest && t.closest('input[type=range]');
    if (field) { try { field.focus({ preventScroll: true }); } catch (err) {} }
    else {
      const a = document.activeElement;
      if (a && a !== document.body && a.matches && a.matches(FIELD)) a.blur();
    }
    if (range && !range.disabled && e.button === 0) { cur.range = range; slideRange(range); }
  }

  function release(button, e = {}) {
    flushCursor();
    const t = targetAt();
    cur.buttons &= ~(1 << button);
    if (!cur.buttons && cur.el) cur.el.classList.remove('down');
    const opts = { button, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey };
    synth('pointerup', t, opts);
    if (!cur.quiet) synth('mouseup', t, opts);
    if (cur.range && button === 0) { cur.range.dispatchEvent(new Event('change', { bubbles: true })); cur.range = null; }
    // the click goes to the nearest thing both ends of the press were inside
    let both = cur.down;
    while (both && !(both.contains && both.contains(t))) both = both.parentNode;
    cur.down = null;
    if (!both || both.nodeType !== 1) return;
    if (both.closest && both.closest('button:disabled, input:disabled, textarea:disabled, fieldset:disabled')) return;
    if (button === 0) {
      ping();
      const now = performance.now();
      const twice = now - cur.lastClick < 380 && cur.lastAt === both;
      cur.lastClick = twice ? 0 : now; cur.lastAt = both;
      synth('click', both, Object.assign({ detail: twice ? 2 : 1 }, opts));
      if (twice) synth('dblclick', both, Object.assign({ detail: 2 }, opts));
    } else if (button === 1) {
      synth('auxclick', both, opts);
    }
  }

  // a ring off the tip, so a click on nothing still says it was heard
  function ping() {
    if (!document.body) return;
    const r = document.createElement('i');
    r.className = 'vc-ping';
    r.style.transform = 'translate3d(' + cur.x.toFixed(1) + 'px,' + cur.y.toFixed(1) + 'px,0)';
    document.body.appendChild(r);
    setTimeout(() => r.remove(), 450);
  }

  // the wheel scrolls whatever scrollable thing it is over, unless that thing wants the wheel itself
  function scrollAt(e) {
    const t = targetAt();
    const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
    const dx = e.deltaX * scale, dy = e.deltaY * scale;
    const handled = !synth('wheel', t, { wheel: { deltaX: dx, deltaY: dy, deltaZ: 0, deltaMode: 0 } });
    if (handled) return;
    for (let n = t; n && n.nodeType === 1; n = n.parentNode) {
      let st;
      try { st = getComputedStyle(n); } catch (err) { break; }
      const canY = /(auto|scroll)/.test(st.overflowY) && n.scrollHeight > n.clientHeight + 1;
      const canX = /(auto|scroll)/.test(st.overflowX) && n.scrollWidth > n.clientWidth + 1;
      if ((canY && dy) || (canX && dx)) { n.scrollBy({ left: canX ? dx : 0, top: canY ? dy : 0 }); return; }
    }
  }

  function initCursor() {
    /* Capture on the window, ahead of everything else on the page: under
       a held pointer every real event is aimed at the canvas, and the
       puzzles listen for pointermove on the window, so the real ones
       have to stop here and only the handed-on ones go further. */
    const stop = (e) => {
      if (!e.isTrusted || !cur.on) return false;
      e.stopImmediatePropagation();
      if (e.cancelable && e.type !== 'mousemove' && e.type !== 'pointermove') e.preventDefault();
      return true;
    };
    for (const type of ['pointerdown', 'pointerup', 'pointermove', 'click', 'dblclick', 'auxclick', 'contextmenu']) {
      window.addEventListener(type, stop, true);
    }
    window.addEventListener('mousemove', (e) => { if (stop(e)) moveCursor(e.movementX || 0, e.movementY || 0); }, true);
    window.addEventListener('mousedown', (e) => { if (stop(e)) press(e); }, true);
    window.addEventListener('mouseup', (e) => { if (stop(e)) release(e.button, e); }, true);
    window.addEventListener('wheel', (e) => { if (stop(e)) scrollAt(e); }, { capture: true, passive: false });

    /* Let go with Esc and the next click in play takes the pointer back,
       with the dart put down where that click was. It is the click and
       not the press that does it, so the press and release both land on
       the same button and the click itself still happens. */
    window.addEventListener('click', (e) => {
      if (!e.isTrusted || locked || !inPlay || menuUp || isTouch || !lockable()) return;
      if (e.target && e.target.closest && e.target.closest(FIELD + ', select')) return;
      cur.x = e.clientX; cur.y = e.clientY; cur.placed = true;
      takeLock();
    });

    window.addEventListener('resize', () => { if (cur.on) moveCursor(0, 0); });
    setInterval(() => {
      if (cur.on && cur.el && !cur.buttons && !isHot(cur.hover) && performance.now() - cur.idle > IDLE_MS) cur.el.classList.add('idle');
    }, 500);
  }

  function initTouch() {
    /* `drive` is the startup mode, so putting the kind on now is the
       same as showing that sheet — and re-doing it whenever the kind
       changes is what makes a thumb on a keyboard-cased iPad bring the
       controls back mid-mission. */
    applyTouchKind();

    /* The three sheets are wired independently on purpose. This used to
       give up on all of them if the driving pad was not in the page,
       which makes one missing element in the markup look exactly like
       the iPad bug: a mission with no controls and nothing on screen
       saying why. */
    initDrivePad();
    initTouchAim('touch-shoot', {
      pads: [['.draw-pad', 'Touch0'], ['.focus-pad', 'Touch2'], ['.sprint-pad', 'Touch3']],
      stick: '.move-zone', knob: '.move-knob',
    });
    watchScreens();
  }

  /* The boat's and the mountain's: a stick you push, and one or two
     buttons beside it. */
  function initDrivePad() {
    const pad = document.getElementById('touch-controls');
    if (!pad) return;

    // the stick and the buttons are wired separately for the same
    // reason the three sheets are: one of them missing is not the
    // others' problem
    const stick = pad.querySelector('.stick-zone');
    const knob = pad.querySelector('.stick-knob');
    if (stick && knob) {
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
    }

    const bBtn = pad.querySelector('.boost-btn');
    if (bBtn) {
      bBtn.addEventListener('pointerdown', e => { e.preventDefault(); bBtn.setPointerCapture(e.pointerId); touch.boost = true; });
      bBtn.addEventListener('pointerup', () => { touch.boost = false; });
      bBtn.addEventListener('pointercancel', () => { touch.boost = false; });
    }

    /* The optional second button, hidden until a mission asks for it.
       It is bound like any other key rather than to a field on `touch`,
       so `Input.throttle()` reads it without knowing it exists. */
    for (const [selector, code] of [['.ski-mute', 'Touch6'], ['.ski-tail', 'Touch7']]) {
      const button = pad.querySelector(selector);
      if (!button) continue;
      button.addEventListener('pointerdown', e => { e.preventDefault(); button.setPointerCapture(e.pointerId); pressCode(code, true); });
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, () => pressCode(code, false));
    }
    const aBtn = pad.querySelector('.aux-btn');
    if (aBtn) {
      aBtn.addEventListener('pointerdown', e => { e.preventDefault(); pressCode('Touch5', true); });
      aBtn.addEventListener('pointerup', () => pressCode('Touch5', false));
      aBtn.addEventListener('pointercancel', () => pressCode('Touch5', false));
    }
  }

  /* Which screens the thumb overlay may sit under.

     `hud`, `hud-ski`, `hud-shoot` and `hud-dive` are the four missions;
     `null` is a scene, and a scene is played over the world with no
     screen up at all. `vote` is the fire's ballot, whose own container
     deliberately passes taps through so you can still look around
     while the pouches burn.

     Everything else is a panel with buttons on it, and a transparent
     full-screen sheet over one of those is the reason a tablet could
     watch a scoreboard it was unable to dismiss. */
  const THUMBS_OK = ['hud', 'hud-ski', 'hud-shoot', 'hud-dive', 'vote'];
  /* The screens a game is played through, which keep the pointer held
     and point with the drawn cursor. The rest are the title, the lobby
     and the dressing room, all text boxes and dropdowns that only a
     real pointer can work, so showing one lets go. */
  const KEEP_LOCK = THUMBS_OK.concat(['verdict']);

  function watchScreens() {
    if (typeof Screens === 'undefined') return;
    const paint = (id) => {
      const blocked = !!id && THUMBS_OK.indexOf(id) < 0;
      mouseBlocked = blocked || id === 'vote';
      menuUp = !!id && KEEP_LOCK.indexOf(id) < 0;
      if (menuUp) { inPlay = false; releaseLock(); }
      if (mouseBlocked) clearAll();
      syncCursor();
      /* All three overlays are siblings of the screen stack. Leaving the
         driving pad out of this list made its BOOST button sit above the
         title, briefing and results screens whenever touch mode was drive
         (which is also the startup default). */
      for (const n of ['touch-controls', 'touch-shoot', 'touch-dive']) {
        const el = document.getElementById(n);
        if (el) el.classList.toggle('blocked', blocked);
      }
    };
    Screens.onShow(paint);
    paint(Screens.current);
  }

  /* Aiming by thumb: drag anywhere on the sheet to look, hold a pad on
     it to act. The shooter has three pads and a walking stick; the dive
     has one pad and a sculling stick. Everything about the *drag* is
     identical, so it is one function with a table of buttons rather
     than two sheets that will quietly drift apart. */
  function initTouchAim(sheetId, buttons) {
    const pad = document.getElementById(sheetId);
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
    for (const b of buttons.pads) bind(b[0], b[1]);

    // a stick in the bottom-left corner: walking in the wood, sculling
    // in the water
    const stick = pad.querySelector(buttons.stick);
    if (stick) {
      const knob = stick.querySelector(buttons.knob);
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
    touchMode = mode === 'aim' || mode === 'walk' || mode === 'swim' || mode === 'off'
      ? mode : 'drive';
    const drive = document.getElementById('touch-controls');
    const shoot = document.getElementById('touch-shoot');
    /* The dive gets its own sheet rather than borrowing the shooter's:
       it has one pad instead of three and the labels on them are what
       a touch player is reading, so relabelling somebody else's is not
       an option. Everything else — drag anywhere to steer, a stick in
       the corner — is the same machinery underneath. */
    const swim = document.getElementById('touch-dive');
    if (drive) drive.classList.toggle('visible', isTouch && touchMode === 'drive');
    if (shoot) {
      shoot.classList.toggle('visible', isTouch && (touchMode === 'aim' || touchMode === 'walk'));
      shoot.classList.toggle('walk-only', touchMode === 'walk');
    }
    if (swim) swim.classList.toggle('visible', isTouch && touchMode === 'swim');
    /* A button that goes off screen never gets its pointerup, so leaving
       the driving pad has to let go of everything it was holding. */
    if (touchMode !== 'drive') { touch.boost = false; pressCode('Touch5', false); pressCode('Touch6', false); pressCode('Touch7', false); }
  }

  /* What the driving pad's buttons say, and whether it has two of them.
     A mission calls this in `build()` and clears it in `dispose()`;
     passing nothing puts the pad back to the boat's BOOST and one
     button, which is what every screen that is not a mission expects
     to find there. */
  function setDrivePad(spec) {
    const pad = document.getElementById('touch-controls');
    if (!pad) return;
    const main = pad.querySelector('.boost-btn');
    const aux = pad.querySelector('.aux-btn');
    if (main) main.textContent = (spec && spec.main) || 'BOOST';
    for (const selector of ['.ski-mute', '.ski-tail']) {
      const b = pad.querySelector(selector); if (b) b.hidden = !(spec && spec.grabs);
    }
    if (!(spec && spec.grabs)) { pressCode('Touch6', false); pressCode('Touch7', false); }
    if (aux) {
      const label = spec && spec.aux;
      aux.textContent = label || 'TUCK';
      aux.hidden = !label;
      // a hidden button must not leave its action held down
      if (!label) pressCode('Touch5', false);
    }
  }

  /* -------- public queries -------- */

  function held(action) {
    if (active.has(action)) return true;
    if (action === 'boost' && touch.boost) return true;
    return false;
  }

  /* -------- free look --------
     Two halves, because they are different animals: `aimDelta` is a
     *displacement* that has already happened (mouse, thumb) and must be
     consumed exactly once; `aimStick` is a *rate* that the caller
     integrates over its own dt (the arrow keys). */

  function aimDelta() {
    const d = { x: look.dx, y: look.dy };
    look.dx = 0; look.dy = 0;
    return d;
  }

  function aimStick() {
    // the arrow keys, which are how a player with no mouse looks around
    return {
      x: (held('lookRight') ? 1 : 0) - (held('lookLeft') ? 1 : 0),
      y: (held('lookDown') ? 1 : 0) - (held('lookUp') ? 1 : 0),
    };
  }

  /* Walking, as its own axis pair: WASD and the thumbstick only. It has
     to stay clear of `throttle()`, which is the boat's forward-and-back
     and means something else entirely. */
  function moveAxes() {
    let x = (down.has('KeyD') ? 1 : 0) - (down.has('KeyA') ? 1 : 0);
    let y = (down.has('KeyW') ? 1 : 0) - (down.has('KeyS') ? 1 : 0);
    if (touchMove.active) { x = touchMove.x; y = touchMove.y; }
    const len = Math.hypot(x, y);
    return len > 1 ? { x: x / len, y: y / len } : { x, y };
  }

  function pressed(action) { return pressedThisFrame.has(action); }
  function released(action) { return releasedThisFrame.has(action); }

  // -1 .. 1
  function steer() {
    let v = (held('right') ? 1 : 0) - (held('left') ? 1 : 0);
    if (v === 0 && touch.active) v = touch.steer;
    return U.clamp(v, -1, 1);
  }

  // -1 .. 1  (negative = braking / reverse)
  function throttle() {
    let v = (held('throttle') ? 1 : 0) - (held('brake') ? 1 : 0);
    if (v === 0 && touch.active) v = touch.throttle;
    return U.clamp(v, -1, 1);
  }

  /* The one piece of feedback the game can give a hand rather than an
     eye. It used to have a bigger sibling that drove a pad's motors;
     that went with the pad, and every hit, crash and near miss that
     used to shake one now buzzes a phone instead. A machine with
     nothing to buzz gets silence, so callers fire and forget. */
  function haptic(ms = 12) {
    if (navigator.vibrate && isTouch) { try { navigator.vibrate(ms); } catch (e) {} }
  }

  function endFrame() { pressedThisFrame.clear(); releasedThisFrame.clear(); }
  function setEnabled(v) { enabled = v; if (!v) clearAll(); }
  function rebind(action, codes) { BINDINGS[action] = codes.slice(); }

  return { init, held, pressed, released, steer, throttle, endFrame,
           aimDelta, aimStick, moveAxes, setMouseAim, setTouchMode, setDrivePad,
           requestLock, releaseLock, onLockChange,
           haptic, setEnabled, rebind, BINDINGS,
           get isTouch() { return isTouch; },
           get aimReady() { return aimReady(); },
           get pointerLocked() { return locked; } };
})();

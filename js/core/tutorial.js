/* ------------------------------------------------------------------
   tutorial.js — the first time you see anything, somebody points at it.

   Coach marks over the real game: a gold ring round the real button, a
   card that says what it does, and — inside a mission — a big keycap
   that lights up while you are actually holding it. Each tour runs
   once, and "once" is written to its own storage key, kept apart from
   the save for the same reason the ghosts are: a quota failure here
   must never cost anybody the prize pot.

   Two ways of running:

   - guided: solo. Menu tours dim the screen; mission tours hold the
     mission's clock (`holdsClock`) until the controls are learnt, so
     the world runs and you can move but nothing is being charged.
   - hints: anybody else is in the room. The clock is theirs as much
     as yours, so it is never held, nothing dims, and every card leaves
     on its own after a few seconds. Nothing here ever goes over the
     wire, and nothing here ever pauses the engine.

   The step tables themselves are data, in `tutorial-steps.js`.
------------------------------------------------------------------ */
const Tutorial = (() => {

  const KEY = 'traitors.tutorial.v1';
  const HINT_TIME = 7;           // seconds a hint stays up when nobody does it
  const OK_TIME = 0.6;           // how long the tick is shown before the next card

  /* ---------------- what has been seen ---------------- */

  let store = null;

  function fresh() { return { v: 1, off: false, seen: {} }; }

  function load() {
    if (store) return store;
    try {
      const p = JSON.parse(localStorage.getItem(KEY));
      if (p && p.v === 1 && p.seen && typeof p.seen === 'object') {
        store = { v: 1, off: !!p.off, seen: Object.assign({}, p.seen) };
      }
    } catch (e) { /* corrupt or unavailable — everything is new again */ }
    if (!store) store = fresh();
    return store;
  }

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(load())); } catch (e) {}
  }

  const seen = (id) => !!load().seen[id];
  function markSeen(id) { load().seen[id] = Date.now(); persist(); }
  function forget(id) { delete load().seen[id]; persist(); }
  function reset() { store = fresh(); persist(); }
  function setOff(v) { load().off = !!v; persist(); if (v) stop(false); }
  const isOff = () => load().off;

  /* Anybody else here? A mission party, a night, or a mission that has
     attached to the room's channel. Any one of them makes the clock
     shared, and a shared clock is not ours to hold. */
  function multiplayer() {
    return (typeof MissionNet !== 'undefined' && !!MissionNet.live)
        || (typeof MissionParty !== 'undefined' && !!MissionParty.running)
        || (typeof Show !== 'undefined' && !!Show.running);
  }

  /* ---------------- the running tour ---------------- */

  let ui = null;            // built by init(); nothing runs without it
  let cur = null;           // { id, steps, i, mode, kind, screen, ... }
  let raf = 0;
  let lastT = 0;
  let toastT = 0;

  const touch = () => typeof Input !== 'undefined' && Input.isTouch;
  const pick = (step, a, b) => (touch() && step[b] !== undefined ? step[b] : step[a]);

  function resolveEl(t) {
    if (!t) return null;
    let el = null;
    try { el = typeof t === 'function' ? t() : document.querySelector(t); } catch (e) {}
    if (!el || !el.getBoundingClientRect) return null;
    const r = el.getBoundingClientRect();
    if (!(r.width || r.height)) return null;       // hidden: point at nothing
    return el;
  }

  function play(name) {
    try { if (typeof AudioBus !== 'undefined') AudioBus.play(name); } catch (e) {}
  }

  /* ---------------- building the overlay ---------------- */

  function h(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function init() {
    if (ui || typeof document === 'undefined') return;
    const root = document.getElementById('tutorial');
    if (!root) return;
    ui = {
      root,
      shade: root.querySelector('.tut-shade'),
      blocks: [...root.querySelectorAll('.tut-block')],
      ring: root.querySelector('.tut-ring'),
      card: root.querySelector('.tut-card'),
      kicker: root.querySelector('.tut-kicker'),
      pips: root.querySelector('.tut-pips'),
      keys: root.querySelector('.tut-keys'),
      title: root.querySelector('.tut-title'),
      text: root.querySelector('.tut-text'),
      meter: root.querySelector('.tut-meter i'),
      meterBox: root.querySelector('.tut-meter'),
      next: root.querySelector('.tut-next'),
      skip: root.querySelector('.tut-skip'),
      off: root.querySelector('.tut-off'),
      foot: root.querySelector('.tut-foot'),
      clock: root.querySelector('.tut-clock'),
      toast: root.querySelector('.tut-toast'),
    };
    ui.next.addEventListener('click', () => { play('ui-click'); advance(true); });
    ui.skip.addEventListener('click', () => { play('ui-click'); skip(); });
    ui.off.addEventListener('click', () => { play('ui-click'); setOff(true); });
    // a click on the dimmed part of a tour nudges the card rather than
    // silently doing nothing
    for (const b of ui.blocks) b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation(); nudge();
    });

    /* Keys, captured on the way in so the menus' own Escape does not
       also go back a screen. Inside a mission Escape is left alone: it
       is the pause menu, and the pause menu has a skip of its own. */
    window.addEventListener('keydown', (e) => {
      if (!cur || !ui.root.classList.contains('on')) return;
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Enter' && !ui.next.hidden) {
        e.preventDefault(); e.stopImmediatePropagation(); play('ui-click'); advance(true);
      } else if (e.key === 'Escape' && cur.kind === 'menu') {
        e.preventDefault(); e.stopImmediatePropagation(); play('ui-click'); stop(true);
      }
    }, true);

    window.addEventListener('resize', () => { if (cur) layout(); });

    if (typeof Screens !== 'undefined') Screens.onShow((id) => onScreen(id));
  }

  /* ---------------- starting and stopping ---------------- */

  /* opts.kind: 'menu' | 'mission'; opts.mode: 'guided' | 'hints';
     opts.screen: the screen a menu tour belongs to — leaving it ends it. */
  function run(id, steps, opts = {}) {
    if (!ui || !steps || !steps.length) return false;
    if (cur) stop(false);
    cur = {
      id, steps, i: -1, kind: opts.kind || 'menu',
      mode: opts.mode || 'guided', screen: opts.screen || null,
      instance: opts.instance || null, released: false, block: !!opts.block,
    };
    ui.root.className = 'on ' + cur.kind + ' ' + cur.mode;
    show(0);
    if (!raf) { lastT = 0; raf = requestAnimationFrame(tick); }
    return true;
  }

  /* `finished` means the player saw it through or skipped it: either
     way it has been seen. An interrupted tour — the mission was quit
     from under it — is not written down and runs again next time. */
  function stop(finished, quiet) {
    if (!cur) return;
    const was = cur;
    if (finished) markSeen(was.id);
    cur = null;
    unhookClick();
    if (ui) {
      ui.root.classList.remove('on');
      ui.card.classList.remove('show', 'ok', 'nudge');
    }
    if (finished && !quiet && was.kind === 'mission' && was.mode === 'guided') {
      toast(was.skipped ? 'Tutorial skipped — the clock is running' : 'You’re ready — the clock is running!');
    }
  }

  function toast(text) {
    if (!ui) return;
    ui.toast.textContent = text;
    ui.toast.classList.add('show');
    toastT = 2.4;
    if (!raf) { lastT = 0; raf = requestAnimationFrame(tick); }
  }

  /* ---------------- one step ---------------- */

  function show(i) {
    if (!cur) return;
    if (i >= cur.steps.length) {
      play('round-clear');
      stop(true);
      return;
    }
    const s = cur.steps[i];
    cur.i = i;
    cur.held = 0; cur.age = 0; cur.okT = 0; cur.count = 0; cur.prev = false;
    if (s.go) cur.released = true;

    const guided = cur.mode === 'guided';
    const total = cur.steps.filter(x => !x.silent).length;
    const num = cur.steps.slice(0, i + 1).filter(x => !x.silent).length;

    ui.kicker.textContent = s.kicker || (cur.kind === 'mission'
      ? (guided ? 'Training' : 'Quick controls') : 'How to play');
    ui.pips.innerHTML = '';
    for (let n = 0; n < total; n++) {
      ui.pips.appendChild(h('i', n < num - 1 ? 'done' : (n === num - 1 ? 'now' : '')));
    }
    const hints = cur.mode === 'hints';
    ui.title.innerHTML = (hints && s.hintTitle) || pick(s, 'title', 'touchTitle') || '';
    ui.text.innerHTML = (hints && s.hintText) || pick(s, 'text', 'touchText') || '';

    // big keycaps, or a thumb on a touchscreen
    ui.keys.innerHTML = '';
    const keys = touch() ? (s.touchKeys || (s.touchTarget ? ['Tap'] : null)) : s.keys;
    if (keys && keys.length) {
      keys.forEach((k, n) => {
        if (k === '/') { ui.keys.appendChild(h('span', 'tut-or', 'or')); return; }
        ui.keys.appendChild(keycap(k, n));
      });
    }
    ui.keys.hidden = !(keys && keys.length);

    const needsNext = !s.done && !s.act && !s.click && !s.auto && cur.mode !== 'hints';
    ui.next.hidden = !needsNext;
    ui.next.textContent = s.nextLabel || (i === cur.steps.length - 1 ? 'Got it' : 'Next');
    ui.skip.textContent = cur.kind === 'mission' ? 'Skip tutorial' : (s.skipLabel || 'Skip tour');
    ui.off.hidden = !s.offer;
    ui.meterBox.hidden = !(s.hold && s.hold > 0.25);
    ui.meter.style.transform = 'scaleX(0)';
    ui.clock.hidden = !(cur.kind === 'mission' && guided && !cur.released);

    /* When the mouse is captured nothing on the card can be clicked, so
       it says how to reach it: Enter for Next, Esc for the pause menu,
       which carries its own Skip. */
    const locked = typeof Input !== 'undefined' && Input.pointerLocked;
    ui.foot.innerHTML = cur.kind === 'mission'
      ? (needsNext ? '<kbd>Enter</kbd> next · ' : '') + (touch() ? '' : '<kbd>Esc</kbd> pause')
      : (needsNext ? '<kbd>Enter</kbd> next · <kbd>Esc</kbd> skip' : '<kbd>Esc</kbd> skip');
    ui.foot.hidden = cur.kind === 'mission' && touch() && !locked;

    ui.card.classList.remove('show', 'ok', 'nudge');
    ui.card.classList.toggle('wide', !!s.welcome);
    ui.card.classList.toggle('welcome', !!s.welcome);
    void ui.card.offsetWidth;                         // restart the entrance
    ui.card.classList.add('show');
    ui.root.classList.toggle('blocking', cur.block && !s.pass);

    unhookClick();
    if (s.click) hookClick(s);
    layout();
    if (i > 0 || cur.kind === 'menu') play('card-in');
  }

  function keycap(k, n) {
    const special = { Space: 'space', Mouse: 'mouse', LMB: 'mouse lmb', RMB: 'mouse rmb',
                      Tap: 'thumb', Drag: 'thumb drag', Enter: 'wide', Shift: 'wide', Esc: 'wide' };
    const cls = 'tut-key ' + (special[k] || '');
    const e = h('span', cls);
    e.style.animationDelay = (n * 0.18) + 's';
    if (special[k] && special[k].startsWith('mouse')) {
      e.innerHTML = '<svg viewBox="0 0 24 34" aria-hidden="true"><rect x="1.5" y="1.5" width="21" height="31" rx="10.5"/>'
        + '<path class="l" d="M12 1.5v12H1.5V12A10.5 10.5 0 0 1 12 1.5z"/>'
        + '<path class="r" d="M12 1.5A10.5 10.5 0 0 1 22.5 12v1.5H12z"/><line x1="12" y1="1.5" x2="12" y2="13.5"/></svg>';
      e.setAttribute('aria-label', k === 'RMB' ? 'Right mouse button' : k === 'LMB' ? 'Left mouse button' : 'Mouse');
    } else if (special[k] && special[k].startsWith('thumb')) {
      e.innerHTML = '<i></i>';
      e.setAttribute('aria-label', k === 'Drag' ? 'Drag' : 'Tap');
    } else e.textContent = k;
    return e;
  }

  /* ---------------- click-to-continue steps ---------------- */

  let clickOff = null;
  function hookClick(s) {
    const el = resolveEl(s.target);
    if (!el) return;
    const fn = () => { if (cur && cur.steps[cur.i] === s) complete(); };
    el.addEventListener('click', fn, true);
    clickOff = () => el.removeEventListener('click', fn, true);
  }
  function unhookClick() { if (clickOff) { clickOff(); clickOff = null; } }

  function nudge() {
    if (!ui) return;
    ui.card.classList.remove('nudge');
    void ui.card.offsetWidth;
    ui.card.classList.add('nudge');
  }

  /* ---------------- advancing ---------------- */

  function complete() {
    if (!cur || cur.okT > 0) return;
    const s = cur.steps[cur.i];
    if (!s.done && !s.act && !s.click) { advance(false); return; }
    cur.okT = OK_TIME;
    ui.card.classList.add('ok');
    play('perfect');
    if (s.click) advance(false);        // the click is about to take us somewhere
  }

  function advance() {
    if (!cur) return;
    show(cur.i + 1);
  }

  /* ---------------- per frame ----------------
     Two clocks drive this. The mission hands its own frame to `frame`
     before `Input.endFrame`, which is the only moment `Input.pressed`
     still means anything; everything else — the ring following its
     button, hints timing out, a menu with no mission — runs off a
     requestAnimationFrame of its own. */

  function test(fn, m) {
    try { return !!fn(m, typeof Input !== 'undefined' ? Input : null); }
    catch (e) { return true; }            // a check that throws is not a wall
  }

  function frame(instance, dt) {
    if (!ui) return;
    if (!cur) { maybeTaskHint(); return; }
    if (cur.kind !== 'mission' || cur.instance !== instance) return;
    // over before the tour was: whoever got to the line has learnt it
    if (instance && (instance.state === 'finished' || instance.state === 'failed')) {
      stop(true, true);
      return;
    }
    step(Math.min(0.1, dt || 0), instance);
  }

  function step(dt, m) {
    if (!cur) return;
    const s = cur.steps[cur.i];
    if (!s) return;
    // a hidden card does not run out: it waits for the HUD to come back
    if (ui.root.classList.contains('hide')) return;
    if (cur.okT > 0) {
      cur.okT -= dt;
      if (cur.okT <= 0) advance();
      return;
    }
    cur.age += dt;

    // a live readout: the keycap glows while you are doing the thing
    let on = false;
    if (s.act) {
      on = test(s.act, m);
      if (s.count) {
        if (on && !cur.prev) cur.count++;
        if (cur.count >= s.count) { cur.prev = on; complete(); return; }
      } else {
        cur.held = on ? cur.held + dt : Math.max(0, cur.held - dt * 0.5);
        if (s.hold) ui.meter.style.transform = 'scaleX(' + Math.min(1, cur.held / s.hold) + ')';
        if (cur.held >= (s.hold || 0.05)) { complete(); return; }
      }
      cur.prev = on;
    } else if (s.glow) on = test(s.glow, m);
    ui.keys.classList.toggle('on', on);

    if (s.done && test(s.done, m)) { complete(); return; }
    const limit = cur.mode === 'hints' ? (s.hintTime || s.auto || HINT_TIME)
                : (touch() && s.touchAuto) ? s.touchAuto : s.auto;
    if (limit && cur.age >= limit) advance();
  }

  function tick(now) {
    raf = 0;
    const dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0;
    lastT = now;
    if (toastT > 0) {
      toastT -= dt;
      if (toastT <= 0 && ui) ui.toast.classList.remove('show');
    }
    if (cur) {
      // a menu has no mission frame to be driven by
      if (cur.kind === 'menu') step(dt, null);
      if (cur) {
        /* A mission tour belongs over a mission HUD. The pause menu,
           the results and a cutscene all sit on top of the same frame
           loop, and a card lying over their buttons is in the way. */
        const scr = typeof Screens !== 'undefined' ? Screens.current : null;
        const hidden = (typeof Engine !== 'undefined' && Engine.isPaused())
          || (cur.kind === 'mission' && !(scr && scr.startsWith('hud')));
        ui.root.classList.toggle('hide', hidden);
        layout();
      }
    }
    if (cur || toastT > 0) raf = requestAnimationFrame(tick);
  }

  /* ---------------- placing the ring and the card ---------------- */

  function layout() {
    if (!cur || !ui) return;
    const s = cur.steps[cur.i];
    if (!s) return;
    const el = resolveEl(touch() && s.touchTarget ? s.touchTarget : s.target);
    const W = window.innerWidth, H = window.innerHeight;
    const pad = s.pad !== undefined ? s.pad : 8;
    let r = null;
    if (el) {
      const b = el.getBoundingClientRect();
      r = { x: b.left - pad, y: b.top - pad, w: b.width + pad * 2, h: b.height + pad * 2 };
      const ring = ui.ring.style;
      ring.transform = `translate(${r.x}px, ${r.y}px)`;
      ring.width = r.w + 'px'; ring.height = r.h + 'px';
      ring.borderRadius = s.round ? '999px' : '14px';
    }
    ui.root.classList.toggle('has-target', !!r);

    // the four blockers leave a hole exactly where the target is
    const hole = r && s.click ? r : null;
    const [top, bottom, left, right] = ui.blocks;
    if (hole) {
      Object.assign(top.style, { left: '0', top: '0', width: W + 'px', height: Math.max(0, hole.y) + 'px' });
      Object.assign(bottom.style, { left: '0', top: (hole.y + hole.h) + 'px', width: W + 'px', height: Math.max(0, H - hole.y - hole.h) + 'px' });
      Object.assign(left.style, { left: '0', top: hole.y + 'px', width: Math.max(0, hole.x) + 'px', height: hole.h + 'px' });
      Object.assign(right.style, { left: (hole.x + hole.w) + 'px', top: hole.y + 'px', width: Math.max(0, W - hole.x - hole.w) + 'px', height: hole.h + 'px' });
    } else {
      Object.assign(top.style, { left: '0', top: '0', width: W + 'px', height: H + 'px' });
      for (const b of [bottom, left, right]) b.style.height = '0px';
    }

    /* The card. In a mission it sits clear of the action: under the
       crosshair on a desktop, up top on a phone where thumbs own the
       bottom. In a menu it stands beside what it is talking about,
       with a notch pointing at it. */
    const card = ui.card;
    const cw = card.offsetWidth, ch = card.offsetHeight;
    let x, y, side = 'none';
    if (cur.kind === 'mission' || !r) {
      x = (W - cw) / 2;
      // a hint shares the screen with a race, so it sits lower and smaller
      y = cur.kind === 'mission'
        ? (touch() ? Math.max(70, H * 0.14) : H * (cur.mode === 'hints' ? 0.70 : 0.60))
        : (H - ch) / 2;
      if (cur.kind === 'mission' && r && !touch()) {
        // keep out of the ring's way if it is in the middle of the screen
        if (y < r.y + r.h && y + ch > r.y) y = Math.min(H - ch - 12, r.y + r.h + 18);
      }
    } else {
      const gap = 18;
      if (r.y + r.h + gap + ch < H - 8) { side = 'top'; y = r.y + r.h + gap; }
      else if (r.y - gap - ch > 8) { side = 'bottom'; y = r.y - gap - ch; }
      else if (r.x + r.w + gap + cw < W - 8) { side = 'left'; x = r.x + r.w + gap; y = r.y + r.h / 2 - ch / 2; }
      else { side = 'right'; x = r.x - gap - cw; y = r.y + r.h / 2 - ch / 2; }
      if (side === 'top' || side === 'bottom') x = r.x + r.w / 2 - cw / 2;
    }
    x = Math.max(10, Math.min(W - cw - 10, x));
    y = Math.max(10, Math.min(H - ch - 10, y));
    card.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    card.dataset.side = side;
    if (r && side !== 'none') {
      const ax = side === 'top' || side === 'bottom'
        ? Math.max(18, Math.min(cw - 18, r.x + r.w / 2 - x)) : 0;
      const ay = side === 'left' || side === 'right'
        ? Math.max(18, Math.min(ch - 18, r.y + r.h / 2 - y)) : 0;
      card.style.setProperty('--ax', ax + 'px');
      card.style.setProperty('--ay', ay + 'px');
    }
  }

  /* ---------------- when each tour starts ---------------- */

  const steps = () => (typeof TutorialSteps !== 'undefined' ? TutorialSteps : null);

  let screenTimer = 0;
  function onScreen(id) {
    // a menu tour belongs to its screen; walking away from it ends it
    if (cur && cur.kind === 'menu' && cur.screen !== id) {
      // walking off a tour counts as having seen it: a tour that chases
      // you from screen to screen is the thing nobody finishes
      stop(true);
    }
    clearTimeout(screenTimer);
    const S = steps();
    if (!S || isOff() || !S.menus[id]) return;
    const tourId = 'menu:' + id;
    if (seen(tourId)) return;
    // let the screen draw itself and the fade lift before pointing at it
    screenTimer = setTimeout(() => {
      if (typeof Screens === 'undefined' || Screens.current !== id || cur) return;
      const table = S.menus[id].filter(x => !x.when || x.when());
      /* Only a solo screen is allowed to hold the pointer. The room
         screens are shared: somebody may press START while you are
         still reading, and a card must never be in the host's way. */
      const solo = !multiplayer() && id !== 'mparty' && id !== 'lobby';
      run(tourId, table, { kind: 'menu', screen: id, mode: 'guided', block: solo });
    }, id === 'play' ? 1100 : 650);
  }

  function missionStarted(id, instance) {
    const S = steps();
    if (!ui || !S || isOff() || !S.missions[id]) return;
    if (cur && cur.kind === 'mission') stop(false);
    if (seen('mission:' + id)) return;
    const mode = multiplayer() ? 'hints' : 'guided';
    run('mission:' + id, S.missions[id], { kind: 'mission', mode, instance });
  }

  function missionEnded() {
    if (cur && cur.kind === 'mission') stop(false);
  }

  /* The one line of the whole tutorial written for a single pair of
     eyes. It only ever shows when the task chip is already on this
     screen — which is to say, only on the Traitor's machine — and it
     changes nothing the other two could see or hear. */
  function maybeTaskHint() {
    const S = steps();
    if (!S || isOff() || seen('traitor-task') || !multiplayer()) return;
    const chip = document.getElementById('agenda-chip');
    if (!chip || chip.hidden || !chip.classList.contains('on')) return;
    run('traitor-task', S.traitorTask, { kind: 'mission', mode: 'hints', instance: null });
    if (cur) cur.instance = '*';
  }

  /* The clock is held only for a solo player, mid-tour, before the
     step that says go. Multiplayer is checked every time rather than
     remembered: a room can arrive after the tour started. */
  function holdsClock() {
    return !!cur && cur.kind === 'mission' && cur.mode === 'guided'
        && !cur.released && !multiplayer();
  }

  function skip() { if (cur) { cur.skipped = true; stop(true); } }

  /* The traitor hint runs without a mission instance of its own. */
  const _frame = frame;
  function frameAny(instance, dt) {
    if (cur && cur.instance === '*') { step(Math.min(0.1, dt || 0), instance); return; }
    _frame(instance, dt);
  }

  return {
    init, run, stop, skip, frame: frameAny, missionStarted, missionEnded, holdsClock,
    seen, markSeen, forget, reset, setOff, multiplayer, onScreen,
    get off() { return isOff(); },
    get active() { return !!cur; },
    get current() { return cur ? { id: cur.id, step: cur.i, mode: cur.mode, kind: cur.kind } : null; },
    KEY,
  };
})();

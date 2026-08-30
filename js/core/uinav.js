/* ------------------------------------------------------------------
   uinav.js — every menu, on a pad and on a thumb.

   The screens were built for a mouse. This walks them with a d-pad,
   the left stick or the arrow keys, and it does it without the screens
   knowing: it reads whatever buttons the active screen happens to
   contain and moves a focus ring between them.

   Two decisions worth keeping:

   - It uses real DOM focus rather than an index of its own, so the
     browser still handles Enter and Space, screen readers still work,
     and a phone's own focus behaviour is not fought with.
   - Movement is spatial, not list order. These layouts put a seed box
     next to two chips and a hand of three cards next to a checkbox;
     "the next one in the DOM" is the wrong answer in half of them, and
     "nearest thing that way" is right in nearly all of them.

   Backing out is declarative: whatever the screen marks `data-back`
   is what B and Escape press.
------------------------------------------------------------------ */
const UINav = (() => {

  const SEL = 'button:not([disabled]), input:not([disabled]):not([type=hidden]), '
            + 'select:not([disabled]), [data-nav]:not([disabled])';

  // screens that are the game rather than a menu
  const PLAYING = new Set(['hud', 'hud-shoot', 'cine']);

  let items = [];
  let cur = -1;
  let padMode = false;         // is the ring being driven by a pad/keys?
  let started = false;

  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

  function activeScreen() {
    const id = Screens.current;
    if (!id || PLAYING.has(id)) return null;
    return Screens.el(id);
  }

  function scan() {
    const root = activeScreen();
    items = root ? [...root.querySelectorAll(SEL)].filter(visible) : [];
    if (cur >= items.length) cur = -1;
    // keep the ring on whatever already has focus, if it survived
    const i = items.indexOf(document.activeElement);
    if (i >= 0) cur = i;
    else if (items.length && padMode) focusAt(0);
    else paint();
  }

  function paint() {
    items.forEach((el, i) => el.classList.toggle('nav-on', padMode && i === cur));
  }

  function focusAt(i) {
    if (!items.length) return;
    cur = (i + items.length) % items.length;
    const el = items[cur];
    try { el.focus({ preventScroll: false }); } catch (e) { try { el.focus(); } catch (e2) {} }
    paint();
    AudioBus.play('ui-hover');
  }

  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, r };
  };

  /* Nearest thing that way. Distance along the direction you asked for
     counts once; drifting sideways counts double, so a button directly
     below always beats one that is slightly closer but off to the left. */
  /* A <select> is the one control where left and right mean "change
     this", not "go to the next thing" — otherwise the voice picker is
     reachable on a pad and unusable on one. */
  function cycleSelect(el, dx) {
    const n = el.options.length;
    if (!n) return true;
    el.selectedIndex = (el.selectedIndex + (dx > 0 ? 1 : -1) + n) % n;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function move(dx, dy) {
    if (!items.length) return;
    if (cur < 0) { focusAt(0); return; }
    const el0 = items[cur];
    if (dx !== 0 && el0 && el0.tagName === 'SELECT' && !el0.disabled) {
      cycleSelect(el0, dx);
      return;
    }
    const from = rectOf(items[cur]);
    let best = -1, bestScore = Infinity;
    for (let i = 0; i < items.length; i++) {
      if (i === cur) continue;
      const to = rectOf(items[i]);
      const ax = to.cx - from.cx, ay = to.cy - from.cy;
      const along = ax * dx + ay * dy;
      if (along <= 2) continue;                     // not that way
      const off = Math.abs(ax * dy - ay * dx);      // perpendicular drift
      if (off > along * 3 + 90) continue;           // and not wildly that way
      const score = along + off * 2;
      if (score < bestScore) { bestScore = score; best = i; }
    }
    // running off the end of a column wraps to the other end of it
    if (best < 0) {
      let far = -1, farScore = -Infinity;
      for (let i = 0; i < items.length; i++) {
        if (i === cur) continue;
        const to = rectOf(items[i]);
        const along = (to.cx - from.cx) * -dx + (to.cy - from.cy) * -dy;
        const off = Math.abs((to.cx - from.cx) * dy - (to.cy - from.cy) * dx);
        if (along <= 2 || off > 90) continue;
        if (along > farScore) { farScore = along; far = i; }
      }
      best = far;
    }
    if (best >= 0) focusAt(best);
  }

  function activate() {
    const el = items[cur];
    if (!el) return;
    if (el.tagName === 'SELECT') { cycleSelect(el, 1); return; }
    if (el.tagName === 'INPUT' && el.type !== 'checkbox' && el.type !== 'button') {
      el.focus(); el.select && el.select();
      return;
    }
    el.click();
  }

  function back() {
    const root = activeScreen();
    const b = root && root.querySelector('[data-back]');
    if (b && visible(b)) { b.click(); return true; }
    return false;
  }

  function setPadMode(on) {
    if (padMode === on) return;
    padMode = on;
    document.body.classList.toggle('nav-mode', on);
    paint();
  }

  /* ---------------- wiring ---------------- */

  function init() {
    if (started) return;
    started = true;

    Screens.onShow(() => {
      // let the screen's own enter() finish writing its DOM first
      requestAnimationFrame(() => { cur = -1; scan(); });
    });

    window.addEventListener('keydown', (e) => {
      if (!activeScreen()) return;
      const tag = (e.target && e.target.tagName) || '';
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      const K = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
      if (K[e.key] && !typing) {
        e.preventDefault();
        setPadMode(true);
        if (!items.length) scan();
        move(K[e.key][0], K[e.key][1]);
      } else if (e.key === 'Escape') {
        if (typing) { e.target.blur(); return; }
        if (back()) e.preventDefault();
      } else if (e.key === 'Tab') {
        setPadMode(true);
        requestAnimationFrame(scan);
      }
    });

    // a mouse takes the ring away again
    window.addEventListener('pointermove', () => setPadMode(false), { passive: true });
    window.addEventListener('pointerdown', () => setPadMode(false), { passive: true });

    Engine.addUpdater(() => {
      /* Nothing else calls endFrame while there is no view — between a
         fade and a scene, say — and a pressed-flag that is never cleared
         reads as a button held down for ever. */
      if (!Engine.hasView) Input.endFrame();
      if (!activeScreen()) return;
      const gp = Input.padPresent();
      if (!gp) return;
      const a = Input.navAxis();
      if (a.x || a.y) {
        setPadMode(true);
        if (!items.length) scan();
        move(a.x, a.y);
      }
      if (Input.pressed('confirm')) { setPadMode(true); AudioBus.play('ui-click'); activate(); }
      else if (Input.pressed('back')) { setPadMode(true); AudioBus.play('ui-click'); back(); }
    });
  }

  return { init, scan, back, focusAt,
           get padMode() { return padMode; } };
})();

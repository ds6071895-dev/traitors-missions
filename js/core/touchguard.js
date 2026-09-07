/* ==================================================================
   TOUCH GUARD
   iPad Safari ignores user-scalable=no — it has since iOS 10 — so a
   pinch over the HUD zooms the game, a double-tap on a button zooms
   the game, and a long-press on a label starts a text selection with
   a copy/look-up callout over it. None of that is reachable from CSS
   alone: touch-action stops double-tap and panning, but pinch on
   Safari is delivered as WebKit's own gesture events, which only
   preventDefault() can refuse.

   Refusing them is only half a fix, and the missing half is what
   stranded an iPad at 2x: something still zooms the page — a pinch in
   the moment before this file runs, a focus on a small field, a system
   gesture — and from then on every pinch that would have undone it was
   refused too. So the guard is now conditional. While the page is at
   1x it refuses pinches; the moment the page is *not* at 1x it stands
   aside, lets the player pinch back out, and meanwhile keeps asking
   Safari to return to 1x itself by re-writing the viewport tag. If
   both of those fail there is a pill on screen saying which way out is.

   Everything else here is deliberately narrow. Gesture events are
   WebKit-only, so nothing in this file has any effect on Android or
   desktop beyond the wheel and selection guards. Fields the player
   types into or copies out of — the invite link, the name, the seed —
   are exempt, and the touch controls are untouched: gesture events are
   separate from the touch and pointer streams the sticks and buttons
   listen to, so a two-thumb grip still plays.
   ================================================================== */
(function () {
  'use strict';

  var vv = window.visualViewport || null;
  var meta = document.querySelector('meta[name="viewport"]');
  /* Whatever the document asked for is what we put back, read once so
     the tag in index.html stays the single source of truth. */
  var BASE = meta ? meta.getAttribute('content') : '';
  var NUDGE = BASE ? BASE.replace('initial-scale=1', 'initial-scale=1, minimum-scale=1') : '';

  /* Somewhere a caret, a selection or the keyboard is legitimately
     wanted. Anything inside one of these is left entirely alone. */
  function isTextish(node) {
    var el = node && node.nodeType === 3 ? node.parentNode : node;
    if (!el || !el.closest) return false;
    return !!el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
  }

  /* Things that are pressed rather than read. A real control handles
     its own double-tap through `touch-action`, and the second tap of a
     pair is often the whole point of it: the Traitor's "I said it"
     button asks twice on purpose, and the guard below was eating the
     press that confirms it — a task marked on a phone would silently
     not be marked. So the guard stands aside on anything tappable and
     lets the control's own CSS refuse the zoom. */
  function isTappable(node) {
    var el = node && node.nodeType === 3 ? node.parentNode : node;
    if (!el || !el.closest) return false;
    return !!el.closest('button, a[href], label, summary, [role="button"]');
  }

  /* The touch overlays own two-finger play: a thumb on the stick and a
     thumb dragging to look is two touches, and it is not a pinch. */
  function isPad(node) {
    var el = node && node.nodeType === 3 ? node.parentNode : node;
    if (!el || !el.closest) return false;
    return !!el.closest('#touch-controls, #touch-shoot, #touch-dive');
  }

  /* -------- is the page zoomed? --------
     visualViewport.scale is the pinch zoom specifically: it stays at 1
     through desktop browser zoom, through the keyboard coming up, and
     through a rotate, and it is the only reading that says "the player
     is stuck". A little over 1 rather than 1 exactly, because Safari
     parks at 1.0000001 often enough to matter. */
  function scale() { return vv && typeof vv.scale === 'number' ? vv.scale : 1; }
  function zoomed() { return scale() > 1.02; }
  function typing() { return isTextish(document.activeElement); }

  /* -------- asking Safari to go back to 1x ------------------------
     A page cannot set the zoom, but re-writing the viewport tag makes
     Safari lay the page out again, and it lays it out at initial-scale.
     It only reacts to a *change*, so this writes a different value and
     then writes the document's own back on the next frame. */
  function resetZoom() {
    if (!meta || !BASE) return;
    meta.setAttribute('content', NUDGE);
    try { window.scrollTo(0, 0); } catch (e) {}
    requestAnimationFrame(function () { meta.setAttribute('content', BASE); });
  }

  /* The one thing that is always true: a pinch out will fix it. Shown
     only once the automatic route has been tried and has not worked,
     and it clears itself the moment the page is back at 1x. */
  var pill = null;
  function hint(on) {
    if (!on) { if (pill) pill.classList.remove('show'); return; }
    if (!pill) {
      pill = document.createElement('div');
      pill.id = 'zoom-hint';
      pill.textContent = 'Zoomed in — pinch out to fit the screen';
      pill.addEventListener('pointerup', function () { resetZoom(); });
      (document.body || document.documentElement).appendChild(pill);
    }
    pill.classList.add('show');
  }

  /* Every reading of the scale is debounced: mid-pinch the number is
     still moving, and snapping the layout back under a live gesture is
     how a fix becomes a fight. */
  var settle = null;
  function checkZoom() {
    clearTimeout(settle);
    settle = setTimeout(function () {
      if (!zoomed()) { hint(false); return; }
      if (typing()) return;          // the keyboard is up: that zoom is theirs
      resetZoom();
      setTimeout(function () { hint(zoomed()); }, 500);
    }, 260);
  }

  if (vv) {
    vv.addEventListener('resize', checkZoom);
    vv.addEventListener('scroll', checkZoom);
  }
  window.addEventListener('orientationchange', checkZoom);
  // a field that zoomed the page on focus should un-zoom it on blur
  document.addEventListener('focusout', checkZoom);
  checkZoom();                        // and catch a page that loaded zoomed

  /* --- pinch / rotate: WebKit's gesture events ---------------------
     Fired on Safari only, once two fingers are down, regardless of
     touch-action. Refusing all three is what holds the zoom at 1x on an
     iPad — but only from 1x. The decision is latched at gesturestart so
     that a pinch which is undoing a zoom is never cut off halfway. */
  var passGesture = false;
  document.addEventListener('gesturestart', function (e) {
    passGesture = isTextish(e.target) || zoomed();
    if (!passGesture) e.preventDefault();
  }, { passive: false });

  document.addEventListener('gesturechange', function (e) {
    if (passGesture) return;
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('gestureend', function (e) {
    if (passGesture) { checkZoom(); return; }   // did they get back to 1x?
    e.preventDefault();
  }, { passive: false });

  /* --- pinch everywhere else ---------------------------------------
     Android and older WebViews zoom off the touch stream instead, and
     not all of them honour touch-action for it. Two fingers that are
     not on a thumb pad and not undoing a zoom have nothing else to be. */
  document.addEventListener('touchmove', function (e) {
    if (!e.touches || e.touches.length < 2) return;
    if (zoomed() || isTextish(e.target) || isPad(e.target)) return;
    if (e.cancelable) e.preventDefault();
  }, { passive: false });

  /* --- trackpad pinch ----------------------------------------------
     An iPad with a Magic Keyboard, and every desktop, delivers a pinch
     as a wheel with ctrl held. Blocked while the page is at 1x, allowed
     while it is not, so a pinch out is still the way back. Ctrl and the
     +/- keys are left alone: that zoom is deliberate and reversible. */
  window.addEventListener('wheel', function (e) {
    if (!e.ctrlKey) return;
    if (zoomed() || isTextish(e.target)) return;
    e.preventDefault();
  }, { passive: false });

  /* --- double-tap zoom ---------------------------------------------
     Some iPad Safari versions still recognise a rapid pair of taps even
     when the target says touch-action:none. Refuse only the second end of
     a one-finger tap in the same small patch of screen. The first tap —
     and therefore ordinary buttons — keeps its normal click, while inputs
     retain all native selection and zoom behaviour — and so does
     anything that is a control in its own right; see `isTappable`. */
  var lastTapAt = 0, lastTapX = 0, lastTapY = 0;
  document.addEventListener('touchend', function (e) {
    if (isTextish(e.target) || isTappable(e.target)) { lastTapAt = 0; return; }
    if (!e.changedTouches || e.changedTouches.length !== 1 || e.touches.length) {
      lastTapAt = 0;
      return;
    }

    var touch = e.changedTouches[0];
    var now = Date.now();
    var close = Math.abs(touch.clientX - lastTapX) < 44
             && Math.abs(touch.clientY - lastTapY) < 44;
    if (close && now - lastTapAt < 350) {
      e.preventDefault();
      lastTapAt = 0;
      return;
    }
    lastTapAt = now;
    lastTapX = touch.clientX;
    lastTapY = touch.clientY;
  }, { passive: false });

  document.addEventListener('touchcancel', function () { lastTapAt = 0; });

  /* --- long-press selection and the callout that rides on it -------
     -webkit-user-select and -webkit-touch-callout cover this in CSS,
     but a drag that begins on a canvas or an SVG can still start a
     selection in the document behind it, and on desktop a stray
     drag across the HUD selects labels. Cheap to refuse outright. */
  document.addEventListener('selectstart', function (e) {
    if (isTextish(e.target)) return;
    e.preventDefault();
  });
  document.addEventListener('dragstart', function (e) {
    if (isTextish(e.target)) return;
    e.preventDefault();
  });

  /* --- the long-press menu ------------------------------------------
     input.js already refuses this while a mission holds the mouse for
     aiming. This covers the rest: menus, the HUD, the backdrop. A
     right-click inside a field still gets its normal menu, so the
     invite link can be copied the ordinary way. */
  document.addEventListener('contextmenu', function (e) {
    if (isTextish(e.target)) return;
    e.preventDefault();
  });
})();

/* ==================================================================
   TOUCH GUARD
   iPad Safari ignores user-scalable=no — it has since iOS 10 — so a
   pinch over the HUD zooms the game, a double-tap on a button zooms
   the game, and a long-press on a label starts a text selection with
   a copy/look-up callout over it. None of that is reachable from CSS
   alone: touch-action stops double-tap and panning, but pinch on
   Safari is delivered as WebKit's own gesture events, which only
   preventDefault() can refuse.

   Everything here is deliberately narrow. Gesture events are
   WebKit-only, so nothing in this file has any effect on Android or
   desktop beyond the selection guard, which only fires where a
   selection was never wanted. Fields the player types into or copies
   out of — the invite link, the name, the seed — are exempt, and the
   touch controls are untouched: gesture events are separate from the
   touch and pointer streams the sticks and buttons listen to, so a
   two-thumb grip still plays.
   ================================================================== */
(function () {
  'use strict';

  /* Somewhere a caret, a selection or the keyboard is legitimately
     wanted. Anything inside one of these is left entirely alone. */
  function isTextish(node) {
    var el = node && node.nodeType === 3 ? node.parentNode : node;
    if (!el || !el.closest) return false;
    return !!el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
  }

  /* --- pinch / rotate: WebKit's gesture events ---------------------
     Fired on Safari only, once two fingers are down, regardless of
     touch-action. Refusing all three is what actually holds the zoom
     at 1x on an iPad. */
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (type) {
    document.addEventListener(type, function (e) {
      if (isTextish(e.target)) return;
      e.preventDefault();
    }, { passive: false });
  });

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

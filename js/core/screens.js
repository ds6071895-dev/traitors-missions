/* ------------------------------------------------------------------
   screens.js — DOM screen stack (title, briefing, HUD, results, pause).
   Screens are just elements with [data-screen]; register hooks by id.
------------------------------------------------------------------ */
const Screens = (() => {

  const hooks = {};      // id -> { enter(data), exit() }
  let current = null;

  function register(id, hook) { hooks[id] = hook || {}; }

  function el(id) { return document.querySelector(`[data-screen="${id}"]`); }

  function show(id, data) {
    if (current === id) return;
    if (current && hooks[current] && hooks[current].exit) hooks[current].exit();
    document.querySelectorAll('[data-screen]').forEach(n => {
      n.classList.toggle('active', n.dataset.screen === id);
    });
    current = id;
    if (hooks[id] && hooks[id].enter) hooks[id].enter(data);
  }

  function hideAll() {
    if (current && hooks[current] && hooks[current].exit) hooks[current].exit();
    document.querySelectorAll('[data-screen]').forEach(n => n.classList.remove('active'));
    current = null;
  }

  // full-screen colour wipe used between title <-> mission
  function transition(fn, ms = 320) {
    const fade = document.getElementById('fade');
    fade.classList.add('on');
    setTimeout(() => {
      fn();
      requestAnimationFrame(() => setTimeout(() => fade.classList.remove('on'), 40));
    }, ms);
  }

  return { register, show, hideAll, transition, el, get current() { return current; } };
})();

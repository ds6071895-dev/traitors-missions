/* ------------------------------------------------------------------
   screens.js — DOM screen stack (title, briefing, HUD, results, pause).
   Screens are just elements with [data-screen]; register hooks by id.
------------------------------------------------------------------ */
const Screens = (() => {

  const hooks = {};      // id -> { enter(data), exit() }
  const shown = new Set();   // (id, data) — fired after every change
  let current = null;
  let currentData = null;

  function register(id, hook) { hooks[id] = hook || {}; }

  // Anything that wants to react to *every* screen change without owning
  // one — the menu focus ring, mostly — listens here instead of wrapping
  // `show`, which is what used to happen.
  function onShow(fn) { shown.add(fn); return () => shown.delete(fn); }

  function el(id) { return document.querySelector(`[data-screen="${id}"]`); }

  function show(id, data) {
    if (current === id) return;
    if (current && hooks[current] && hooks[current].exit) hooks[current].exit();
    document.querySelectorAll('[data-screen]').forEach(n => {
      n.classList.toggle('active', n.dataset.screen === id);
    });
    current = id;
    currentData = data === undefined ? null : data;
    /* The overlays that are not screens — the task chip, the field —
       are siblings of all of them, so the only way they can know which
       HUD they are laid over is for the body to say. */
    document.body.dataset.screen = id || '';
    if (hooks[id] && hooks[id].enter) hooks[id].enter(data);
    shown.forEach(fn => { try { fn(id, currentData); } catch (e) { console.warn(e); } });
  }

  function hideAll() {
    if (current && hooks[current] && hooks[current].exit) hooks[current].exit();
    document.querySelectorAll('[data-screen]').forEach(n => n.classList.remove('active'));
    current = null;
    currentData = null;
    document.body.dataset.screen = '';
    shown.forEach(fn => { try { fn(null, null); } catch (e) { console.warn(e); } });
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

  let coverOwner = null;
  async function cover(work, signal, ms=380) {
    const owner={}; coverOwner=owner;
    const fade=document.getElementById('fade');
    const pause=duration=>new Promise(resolve=>{
      if(signal && signal.aborted){resolve(false);return;}
      let timer;
      const finish=()=>{clearTimeout(timer);if(signal)signal.removeEventListener('abort',finish);resolve(!(signal&&signal.aborted));};
      timer=setTimeout(finish,duration);if(signal)signal.addEventListener('abort',finish,{once:true});
    });
    if(fade)fade.classList.add('on');
    try {
      if(!await pause(ms))return false;
      if(signal&&signal.aborted)return false;
      await work();
      if(!await pause(60))return false; // one composed frame before uncovering
      return !(signal&&signal.aborted);
    } finally {
      if(coverOwner===owner){coverOwner=null;if(fade)fade.classList.remove('on');}
    }
  }

  return { register, onShow, show, hideAll, transition, cover, el,
           get current() { return current; },
           get data() { return currentData; } };
})();

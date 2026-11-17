/* ------------------------------------------------------------------
   ghost.js — making it obvious that you are out.

   A murdered or banished player keeps watching the game, and the
   hints they used to get (a line on the task list, a card at night)
   were easy to miss. People kept arguing at a table that could not
   hear them. Now the moment you are out:

     - a big "You are a ghost" title comes up and settles into a badge
       that stays at the top of the screen until the game ends;
     - a cold, slowly breathing veil sits round the edges of the screen;
     - `body.ghost` is set so any other screen can style itself.

   The veil is two gradients and an opacity animation, and no CSS
   filter on the canvas, so it costs nothing on a low-end phone.
   It watches the state on a slow poll: nothing has to call it. It
   waits for a quiet moment first — no letterbox, card, transition,
   vote or Claudia mid-line for a couple of seconds — so it never lands
   on top of the reveal that put you out (the letter under the door,
   the slate, the colour).
------------------------------------------------------------------ */
const Ghost = (() => {
  let on = false, veil = null, badge = null, title = null, timer = null, titleT = null;
  const MENUS = ['play', 'lobby', 'dressing', 'verdict', 'title', 'boot'];

  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c-4.4 0-7.5 3.3-7.5 7.6v10.6'
    + 'l2.4-1.8 2.3 1.8 2.8-1.9 2.8 1.9 2.3-1.8 2.4 1.8V10.1c0-4.3-3.1-7.6-7.5-7.6z" fill="currentColor" opacity=".9"/>'
    + '<circle cx="9.2" cy="10" r="1.5" fill="#0d1622"/><circle cx="14.8" cy="10" r="1.5" fill="#0d1622"/>'
    + '<ellipse cx="12" cy="14.3" rx="1.4" ry="1.8" fill="#0d1622"/></svg>';

  function els() {
    if (veil || typeof document === 'undefined' || !document.body || !document.createElement) return !!veil;
    veil = document.createElement('div');
    veil.id = 'ghost-veil';
    badge = document.createElement('div');
    badge.id = 'ghost-badge';
    badge.setAttribute('role', 'status');
    badge.innerHTML = ICON + '<span><b>YOU ARE A GHOST</b><i>Out of the game · the living can’t hear you</i></span>';
    title = document.createElement('div');
    title.id = 'ghost-title';
    title.innerHTML = ICON + '<b>You are a ghost</b><i>You are out of the game. Watch how it ends —<br>nobody still playing can hear you now.</i>';
    document.body.appendChild(veil);
    document.body.appendChild(title);
    document.body.appendChild(badge);
    return true;
  }

  function out() {
    if (typeof Session === 'undefined' || !Session.state) return false;
    const s = Session.state;
    if (!s.phase || s.phase === 'verdict') return false;
    if (typeof Screens !== 'undefined' && MENUS.indexOf(Screens.current) >= 0) return false;
    const me = (s.players || []).find(p => p.local);
    if (!me) return false;
    if (me.alive === false) return true;
    // the poison found you: breakfast already treats you as watching
    const mine = Session.myPrivate ? Session.myPrivate() : null;
    return !!(mine && mine.fate === 'murdered');
  }

  function set(next) {
    if (next === on) return;
    on = next;
    if (!els()) return;
    if (document.body.classList) document.body.classList.toggle('ghost', on);
    veil.classList.toggle('on', on);
    badge.classList.toggle('on', on);
    clearTimeout(titleT);
    if (on) {
      // the moment itself: big, then it goes up to the corner and stays
      title.classList.remove('on');
      void title.offsetWidth;
      title.classList.add('on');
      titleT = setTimeout(() => title.classList.remove('on'), 4200);
      if (typeof AudioBus !== 'undefined' && AudioBus.play) AudioBus.play('card-in', { tone: 'bad' });
    } else title.classList.remove('on');
  }

  const POLL = 400, QUIET_MS = 2400;
  let quietMs = 0;
  // `talk` counts Claudia mid-line too: the title waits for her, the badge does not
  function busy(talk = true) {
    if (typeof Scenes !== 'undefined') {
      if (talk && Scenes.performing) return true;
    }
    if (talk && typeof Voice !== 'undefined' && Voice.speaking) return true;
    if (typeof Scenes !== 'undefined') {
      if (Scenes.Cine && Scenes.Cine.barsOn) return true;
    }
    if (typeof Screens !== 'undefined' && Screens.current === 'vote') return true;
    if (typeof document !== 'undefined' && document.getElementById) {
      const lit = (id) => { const e = document.getElementById(id); return !!(e && e.classList && e.classList.contains('on')); };
      if (lit('interlude') || lit('cine-card')) return true;
      // a caption on screen is somebody's words: the title waits for it to go
      if (talk && lit('cine-caption')) return true;
    }
    return false;
  }

  function check() {
    try {
      const want = out();
      if (!want || on) {
        quietMs = 0; set(want);
        if (on && badge && badge.classList) badge.classList.toggle('hush', busy(false));
        // a line that starts while the title is up: the title gives way at once
        if (on && title && title.classList && title.classList.contains('on') && busy()) title.classList.remove('on');
        return;
      }
      quietMs = busy() ? 0 : quietMs + POLL;
      if (quietMs >= QUIET_MS) set(true);
    } catch (e) { /* never let the poll throw */ }
  }

  function start() {
    if (timer || typeof setInterval === 'undefined') return;
    timer = setInterval(check, POLL);
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined' && document.body) start();
  else if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('DOMContentLoaded', start);

  return { check, get on() { return on; } };
})();

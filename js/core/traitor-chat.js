/* ------------------------------------------------------------------
   traitor-chat.js — the Traitors' chat, in writing.

   It used to be a whisper: hold G and only the Traitors heard you. A
   voice nobody else in the room can hear is a voice the person next to
   you can still see you using, and the AIs answered out loud into the
   same ears as everything else, so it is a written chat now — a small
   thread in the corner that only the living Traitors can read.

     R, or the Traitors button   open it and type; Enter sends and
                                 closes it, Esc closes it
     a message arriving          the thread peeks open for a few
                                 seconds without taking the keyboard

   Typing works with the pointer held. The box takes the keyboard and
   Input ignores keys typed into a box, so W is a letter and not a
   step; the mouse still looks round, and closing the chat puts you
   straight back into play without a click to take the pointer again.
   Only key *downs* are kept from the game: a key held when the chat
   opened is still let go of properly when it comes up.

   Where the words go:
     a room on the server   to the other living Traitors and the host,
                            and nobody else (server/index.js holds that
                            line, from the host's routes)
     a game on this machine a solo night with bots: they stay here

   The host's AI director reads every message (TraitorChat.on) and a
   Traitor AI writes back with `postFor`. Without AI voices — a bots
   rehearsal — the host's bots answer from a few lines of their own.
------------------------------------------------------------------ */
const TraitorChat = (() => {
  const MAX = 280;
  const KEEP = 60;                  // messages kept on screen
  const PEEK_MS = 6500;

  const log = [];                   // { id, name, text, at, mine }
  const listeners = new Set();      // host: every message, for the AI Traitors
  let root = null, btn = null, list = null, input = null, badge = null, who = null;
  let open = false, peekTimer = null, unread = 0, seed = null, wired = false, lastPaint = '';

  const esc = (v) => String(v === undefined || v === null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const clean = (t) => String(t === undefined || t === null ? '' : t).replace(/\s+/g, ' ').trim().slice(0, MAX);

  /* ---------------- who may ---------------- */

  const S = () => (typeof Session !== 'undefined' && Session.state) || null;
  const me = () => { const s = S(); return s ? (s.players || []).find(p => p.local) || null : null; };
  function amTraitor() {
    const m = me();
    return !!m && m.alive && typeof Session !== 'undefined' && Session.myRole && Session.myRole() === 'traitor';
  }
  // not on the hill before Claudia has said it: a button turning up early gives it away
  const toldYet = () => (typeof VoiceChat !== 'undefined' && 'toldYet' in VoiceChat)
    ? !!VoiceChat.toldYet : !!(S() && S().phase !== 'hill');
  const online = () => typeof Party !== 'undefined' && !!Party.connected;
  const canSend = () => !online() || !!Party.canTraitorChat;
  const isHost = () => typeof Session !== 'undefined' && !!Session.isHost;
  function canWrite() {
    const s = S();
    return !!s && s.phase !== 'verdict' && amTraitor() && toldYet() && canSend();
  }
  const nameOf = (id) => {
    const p = typeof Session !== 'undefined' && Session.playerById ? Session.playerById(id) : null;
    return p ? p.name : 'Someone';
  };
  function partners() {
    const v = (typeof Session !== 'undefined' && Session.myPrivate && Session.myPrivate()) || {};
    return (v.partners || []).map(id => Session.playerById(id)).filter(p => p && p.alive);
  }

  /* ---------------- the thread ---------------- */

  function fresh() {
    const s = S();
    const k = s ? s.seed : null;
    if (k === seed) return;
    seed = k;
    log.length = 0;
    unread = 0;
    chatter.clear();
  }

  function add(m) {
    fresh();
    log.push(m);
    if (log.length > KEEP) log.splice(0, log.length - KEEP);
    if (!m.mine) {
      if (!open) { unread++; peek(); }
      if (typeof AudioBus !== 'undefined' && AudioBus.ready) AudioBus.play('ui-hover');
    }
    paint(true);
  }

  // the host's ears: every message, whoever wrote it
  function tell(m) {
    if (!isHost()) return;
    listeners.forEach(fn => { try { fn(m); } catch (e) { console.warn(e); } });
    scriptedReply(m);
  }

  /* You write. Shown at once; the server carries it to the others. */
  function send(text) {
    text = clean(text);
    if (!text || !canWrite()) return false;
    const m = me();
    add({ id: m.id, name: m.name, text, at: Date.now(), mine: true });
    if (online()) Party.traitorChat(text);
    tell({ id: m.id, text, at: Date.now() });
    return true;
  }

  /* The host writes for a seat it runs: an AI Traitor's reply, or a
     bot's. Online it goes round the server, which sends it back to the
     host as well, so it lands here the same way everybody else's does. */
  function postFor(id, text) {
    text = clean(text);
    if (!text || !isHost()) return false;
    const v = Session.privateView ? Session.privateView(id) || {} : {};
    const p = Session.playerById(id);
    if (!p || !p.alive || v.role !== 'traitor') return false;
    if (online()) { Party.traitorChatFor(id, text); return true; }
    arrive({ id, text, at: Date.now() });
    return true;
  }

  // a message from somebody else, off the wire or from a seat on this machine
  function arrive(m) {
    if (!m || !m.id) return;
    const text = clean(m.text);
    if (!text) return;
    const mine = me();
    if (mine && m.id === mine.id) return;
    // the host hears it for its AIs; only a Traitor's screen shows it
    if (amTraitor()) add({ id: m.id, name: nameOf(m.id), text, at: m.at || Date.now(), mine: false });
    tell({ id: m.id, text, at: m.at || Date.now() });
  }

  function on(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  /* ---------------- bots without a voice ----------------
     A rehearsal with ?bots has no AI to answer, and a chat that never
     answers is a chat nobody uses. The host's bot Traitors say a few
     plain things back, and agree to a name when they are given one. */
  const chatter = new Map();        // bot id -> Date.now() it last wrote
  const aiRuns = (id) => typeof AIDirector !== 'undefined' && AIDirector.active
    && typeof AI !== 'undefined' && AI.agent && !!AI.agent(id);
  const GENERIC = [
    'Agreed. Keep your head down today.',
    'Act normal. Nobody suspects a thing.',
    'I am with you. Do a few jobs so we look busy.',
    'Careful who sees us together.',
    'Fine by me. Say nothing at the table.',
  ];
  const NAMED = [
    '{name}? Yes. I will back you at the table.',
    'Agreed, {name} it is.',
    '{name} has been sniffing around. Good choice.',
    'Fine. {name}. Do not lead the charge, I will follow.',
  ];
  function scriptedReply(m) {
    const s = S();
    if (!s || !m || !m.id) return;
    const writer = Session.playerById(m.id);
    if (!writer || writer.bot) return;               // bots do not answer bots
    const v = Session.privateView(m.id) || {};
    const pool = (v.partners || []).map(id => Session.playerById(id))
      .filter(p => p && p.alive && p.bot && !aiRuns(p.id)
        && (Session.privateView(p.id) || {}).role === 'traitor'
        && Date.now() - (chatter.get(p.id) || 0) > 2500);
    if (!pool.length) return;
    const b = pool[Math.floor(Math.random() * pool.length)];
    const lower = m.text.toLowerCase();
    const among = Session.alive().filter(p => p.id !== m.id && p.id !== b.id && (v.partners || []).indexOf(p.id) < 0);
    const named = among.filter(p => lower.indexOf(p.name.toLowerCase()) >= 0);
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const text = named.length === 1 ? pick(NAMED).replace(/\{name\}/g, named[0].name) : pick(GENERIC);
    chatter.set(b.id, Date.now());
    setTimeout(() => postFor(b.id, text), 1400 + Math.random() * 1600);
  }

  /* ---------------- on screen ---------------- */

  function els() {
    if (root || typeof document === 'undefined' || !document.body || !document.createElement) return !!root;
    btn = document.getElementById('tchat-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'tchat-btn';
      document.body.appendChild(btn);
    }
    btn.type = 'button';
    btn.hidden = true;
    btn.setAttribute('data-kbd', 'R');
    btn.title = 'Traitors’ chat (R)';
    btn.setAttribute('aria-label', 'Open the Traitors’ chat');
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">'
      + '<path d="M4 5h16v10H9l-5 4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>'
      + '<path d="M8.5 9h7M8.5 12h4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
      + '<span>Traitors</span><b class="tch-n" hidden></b>';
    badge = btn.querySelector('.tch-n');
    btn.onclick = (e) => { e.preventDefault(); toggle(); };

    root = document.createElement('div');
    root.id = 'tchat';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'The Traitors’ chat');
    root.innerHTML = '<div class="tch-head"><span class="tch-dot"></span><b>THE TRAITORS</b>'
      + '<span class="tch-who"></span><button type="button" class="tch-x" aria-label="Close">×</button></div>'
      + '<div class="tch-log" aria-live="polite"></div>'
      + '<form class="tch-form" autocomplete="off"><input type="text" maxlength="' + MAX + '" '
      + 'spellcheck="false" autocomplete="off" enterkeyhint="send" placeholder="Only the Traitors can read this…" '
      + 'aria-label="Message the Traitors"><button type="submit" class="tch-send" aria-label="Send">'
      + '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5z" fill="currentColor"/></svg>'
      + '</button></form>'
      + '<div class="tch-hint"><span class="tch-k">Enter</span> send · empty <span class="tch-k">Enter</span> closes</div>';
    list = root.querySelector('.tch-log');
    input = root.querySelector('input');
    who = root.querySelector('.tch-who');
    root.querySelector('.tch-x').onclick = () => close();
    root.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const t = input.value;
      input.value = '';
      if (clean(t)) send(t);
      // a desktop sends and goes back to play; a phone keeps its keyboard up for the reply
      if (typeof Input === 'undefined' || !Input.isTouch) close();
    });
    /* Typing is writing, not walking. Only the downs are kept from the
       game's own listeners: the ups must reach Input, or a key held as
       the chat opened would stay held for ever. */
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Tab') { e.preventDefault(); }
    });
    input.addEventListener('blur', () => {
      // the box let go of the keyboard (a click on the world, a scene change): the chat is shut
      setTimeout(() => { if (open && document.activeElement !== input) close(true); }, 0);
    });
    document.body.appendChild(root);
    return true;
  }

  function paint(force) {
    if (!els()) return;
    fresh();
    const can = canWrite();
    const showBtn = can || (amTraitor() && toldYet() && log.length > 0);
    if (btn.hidden === showBtn) btn.hidden = !showBtn;
    if (!showBtn && (open || root.classList.contains('peek'))) {
      open = false;
      root.classList.remove('on', 'peek');
      btn.classList.remove('on');
    }
    badge.hidden = !unread || open;
    if (unread) badge.textContent = unread > 9 ? '9+' : String(unread);
    btn.classList.toggle('unread', !!unread && !open);
    const ps = partners();
    who.textContent = ps.length ? 'with ' + ps.map(p => p.name).join(', ') : 'nobody else is left';
    input.disabled = !can;
    const key = log.length + ':' + (log.length ? log[log.length - 1].at : 0);
    if (!force && key === lastPaint) return;
    lastPaint = key;
    list.innerHTML = log.length
      ? log.map(m => {
          const p = Session.playerById ? Session.playerById(m.id) : null;
          const look = p && p.look && typeof Look !== 'undefined' ? Look.resolve(p.look) : null;
          const accent = (look && look.accent) || '#ff8fa3';
          return '<div class="tch-m' + (m.mine ? ' mine' : '') + '" style="--tc:' + esc(accent) + '">'
            + (m.mine ? '' : '<i>' + esc(m.name) + '</i>') + '<span>' + esc(m.text) + '</span></div>';
        }).join('')
      : '<div class="tch-empty">Nobody else can see this. Plan the poison, pick a name, agree a story.</div>';
    list.scrollTop = list.scrollHeight;
  }

  /* A message lands while the chat is shut: show the thread, without
     the box, long enough to read it. */
  function peek() {
    if (!els() || open) return;
    root.classList.add('peek');
    clearTimeout(peekTimer);
    peekTimer = setTimeout(() => root.classList.remove('peek'), PEEK_MS);
  }

  function openChat() {
    if (!els() || !canWrite()) return false;
    open = true;
    unread = 0;
    clearTimeout(peekTimer);
    root.classList.remove('peek');
    root.classList.add('on');
    btn.classList.add('on');
    paint(true);
    // the pointer stays held: focusing a box does not let go of it
    try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
    return true;
  }

  function close(fromBlur) {
    if (!root) return;
    open = false;
    root.classList.remove('on');
    if (btn) btn.classList.remove('on');
    if (!fromBlur && input && document.activeElement === input) input.blur();
    paint(true);
  }

  function toggle() { if (open) close(); else openChat(); }

  const typingSomewhere = () => {
    const a = typeof document !== 'undefined' ? document.activeElement : null;
    if (!a || a === document.body) return false;
    return a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || !!a.isContentEditable;
  };

  function init() {
    if (wired || typeof window === 'undefined') return;
    wired = true;
    els();
    if (typeof Party !== 'undefined' && Party.on) Party.on('tchat', arrive);
    /* R opens it. Taken in the capture phase, before the game's own
       keys, and cancelled, so the R does not land in the box it opens. */
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyR' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (typingSomewhere() || !canWrite()) return;
      if (typeof Screens !== 'undefined' && ['play', 'lobby', 'dressing', 'title', 'boot'].indexOf(Screens.current) >= 0) return;
      e.preventDefault();
      e.stopPropagation();
      toggle();
    }, true);
    // a click on the world goes back to the world
    window.addEventListener('mousedown', (e) => {
      if (open && e.target && e.target.id === 'gl') close();
    }, true);
    /* With the pointer held, the browser keeps Esc for itself: it lets go
       of the pointer and the page never sees the key. So losing the lock
       while the box is up is read as that Esc, and shuts the chat; the
       next click takes the pointer back. Enter on an empty box shuts it
       without letting go. */
    if (typeof Input !== 'undefined' && Input.onLockChange) {
      Input.onLockChange((locked) => { if (!locked && open) close(); });
    }
    if (typeof Session !== 'undefined' && Session.on) {
      Session.on('private', () => paint());
      Session.on('phase', () => paint());
      Session.on('change', () => paint());
    }
    if (typeof Engine !== 'undefined' && Engine.addUpdater) {
      let at = 0;
      Engine.addUpdater(() => { const n = Date.now(); if (n - at > 400) { at = n; paint(); } });
    }
    paint(true);
  }

  return { init, send, postFor, arrive, on, open: openChat, close, toggle, canWrite,
           get log() { return log.slice(); },
           get isOpen() { return open; } };
})();

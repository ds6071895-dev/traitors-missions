/* ------------------------------------------------------------------
   notebook.js — your notebook, for the whole game.

   It used to live only in the castle, during the jobs, and closed
   with them. Now it is there from the hill to the verdict (N, or the
   button bottom-left) and it keeps everything, so a hunch at the round
   table can be checked against what you saw two days ago:

     What you saw    the castle sightings the host keeps for you alone
                     (who was where, behind which door, who handed what)
     The votes       every slate as Claudia read it out, day by day
     Who is gone     the murdered and the banished, and what they were
     Your notes      a box you write in yourself; kept on this device

   The votes and your own notes are kept in localStorage against the
   game's seed, so a reload mid-game does not lose them.
------------------------------------------------------------------ */
const Notebook = (() => {
  let root = null, btn = null, body = null, mine = null, open = false, timer = null, seed = null;
  let votes = [];
  const MENUS = ['play', 'lobby', 'dressing', 'title', 'boot'];
  const KEY = 'traitors.notebook.v1';

  const esc = (v) => String(v === undefined || v === null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function load(s) {
    if (seed === s) return;
    seed = s;
    votes = [];
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { saved = null; }
    if (saved && saved.seed === s) {
      votes = Array.isArray(saved.votes) ? saved.votes : [];
      if (mine) mine.value = saved.mine || '';
    } else if (mine) mine.value = '';
  }
  function save() {
    if (seed === null) return;
    try { localStorage.setItem(KEY, JSON.stringify({ seed, votes, mine: mine ? mine.value : '' })); } catch (e) {}
  }

  function els() {
    if (root || typeof document === 'undefined' || !document.body || !document.createElement) return !!root;
    btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'nb-btn';
    btn.innerHTML = '<b>N</b> Notebook';
    btn.onclick = () => toggle();
    root = document.createElement('div');
    root.id = 'nb-panel';
    root.innerHTML = '<div class="nb-head"><h4>YOUR NOTEBOOK</h4><button type="button" class="nb-x" aria-label="Close">×</button></div>'
      + '<div class="nb-body"></div>'
      + '<label class="nb-mine"><span>YOUR NOTES</span><textarea rows="4" maxlength="4000" spellcheck="false" '
      + 'placeholder="Hunches, alibis, who defended whom…"></textarea></label>';
    body = root.querySelector('.nb-body');
    mine = root.querySelector('textarea');
    root.querySelector('.nb-x').onclick = () => toggle(false);
    mine.addEventListener('input', save);
    // typing here is writing, not walking
    mine.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') mine.blur(); });
    mine.addEventListener('keyup', (e) => e.stopPropagation());
    document.body.appendChild(btn);
    document.body.appendChild(root);
    return true;
  }

  function inGame() {
    if (typeof Session === 'undefined' || !Session.state) return false;
    if (typeof Screens !== 'undefined' && MENUS.indexOf(Screens.current) >= 0) return false;
    return !!(Session.state.players || []).find(p => p.local);
  }

  const name = (id) => {
    const p = typeof Session !== 'undefined' && Session.playerById ? Session.playerById(id) : null;
    return p ? (p.local ? 'you' : p.name) : 'somebody';
  };
  const fmt = (t) => Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
  const roomName = (r) => (typeof Chores !== 'undefined' && Chores.roomName ? Chores.roomName(r) : r);
  const join = (list) => list.length <= 1 ? list.join('') : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];

  function sightings() {
    const v = (Session.myPrivate && Session.myPrivate()) || {};
    const notes = (v.notes || []).slice().reverse();
    if (!notes.length) return '<p class="nb-none">Nothing yet. Keep your eyes open in the castle.</p>';
    return notes.map((n) => {
      const when = '<i>Day ' + ((n.day | 0) + 1) + ' · ' + fmt(n.t | 0) + '</i>';
      const where = esc(roomName(n.room));
      if (n.kind === 'handover') return '<p class="hand">' + when + 'You saw <b>' + esc(name(n.a)) + '</b> hand something to <b>' + esc(name(n.b)) + '</b> in ' + where + '.</p>';
      if (n.kind === 'door') return '<p class="door">' + when + 'You saw <b>' + esc(name(n.who)) + '</b> ' + (n.shut ? 'shut' : 'open') + ' the door of ' + where + '.</p>';
      const who = (n.ids || []).map(id => '<b>' + esc(name(id)) + '</b>');
      return '<p' + (n.shut ? ' class="door"' : '') + '>' + when
        + (who.length ? (n.shut ? 'Behind a shut door in ' : 'In ') + where + ' with ' + join(who) : 'Alone ' + (n.shut ? 'behind a shut door ' : '') + 'in ' + where) + '.</p>';
    }).join('');
  }

  function gone() {
    const s = Session.state;
    const rows = [];
    (s.murdered || []).forEach(m => rows.push({ day: m.day, html: '<b>' + esc(m.name) + '</b> was murdered' + (m.role ? ' — ' + esc(m.role) : '') }));
    (s.banished || []).forEach(b => rows.push({ day: b.day, html: '<b>' + esc(b.name) + '</b> was ' + (b.exposed ? 'exposed' : 'banished')
      + (b.role === 'veiled' ? ' — <span class="nb-v">veiled</span>'
         : b.role ? ' — <span class="' + (b.role === 'traitor' ? 'nb-t' : 'nb-f') + '">' + (b.role === 'traitor' ? 'a Traitor' : 'a Faithful') + '</span>' : '') }));
    if (!rows.length) return '<p class="nb-none">Nobody yet.</p>';
    return rows.sort((a, b) => a.day - b.day).map(r => '<p><i>Day ' + ((r.day | 0) + 1) + '</i>' + r.html + '.</p>').join('');
  }

  function votesHtml() {
    if (!votes.length) return '<p class="nb-none">No slates turned yet.</p>';
    const byDay = new Map();
    votes.forEach(v => { if (!byDay.has(v.day)) byDay.set(v.day, []); byDay.get(v.day).push(v); });
    return [...byDay.keys()].sort((a, b) => a - b).map(d => '<p><i>Day ' + (d + 1) + '</i>'
      + byDay.get(d).map(v => '<b>' + esc(v.voter) + '</b> → ' + esc(v.target) + (v.round ? ' <small>(revote)</small>' : '')).join(' · ') + '</p>').join('');
  }

  function paint() {
    if (!body || !open || !Session.state) return;
    const keep = body.scrollTop;
    body.innerHTML = '<h5>WHAT YOU SAW</h5>' + sightings() + '<h5>THE VOTES</h5>' + votesHtml() + '<h5>WHO IS GONE</h5>' + gone();
    body.scrollTop = keep;
  }

  function toggle(on) {
    if (!els()) return;
    open = on === undefined ? !open : !!on;
    root.classList.toggle('on', open);
    btn.classList.toggle('on', open);
    if (open) paint();
    else if (mine && document.activeElement === mine) mine.blur();
  }

  /* A slate, as Claudia reads it out (castle-scene.js calls this). */
  function vote(voterId, targetId, round) {
    if (!Session.state) return;
    load(Session.state.seed);
    votes.push({ day: Session.state.day, voter: name(voterId), target: name(targetId), round: round | 0 });
    save();
    paint();
  }

  let lastPaint = 0;
  function tick() {
    try {
      const g = inGame();
      if (g && Session.state) load(Session.state.seed);
      if (!els()) return;
      btn.classList.toggle('show', g);
      if (!g && open) toggle(false);
      if (typeof Input !== 'undefined' && Input.pressed && g && Input.pressed('notes')
          && !(document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName))) toggle();
      const now = Date.now();
      if (open && now - lastPaint > 1500) { lastPaint = now; paint(); }
    } catch (e) {}
  }

  function start() {
    if (timer) return;
    if (typeof Engine !== 'undefined' && Engine.addUpdater) { Engine.addUpdater(tick); timer = true; }
    else if (typeof setInterval !== 'undefined') timer = setInterval(tick, 250);
  }
  if (typeof document !== 'undefined' && document.body) start();
  else if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('DOMContentLoaded', start);

  return { toggle, vote, paint, get open() { return open; } };
})();

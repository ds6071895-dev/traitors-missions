/* ------------------------------------------------------------------
   ai-players.js — filling the empty chairs.

   The host's lobby panel for AI contestants and AI Claudia, both voiced
   by Deepgram through the room server. A key goes in once (optionally
   remembered on this machine only); the host picks how many AI players
   join the people already in the room; and each one is given a name, a
   look and a voice of its own and woken straight away, so the lobby can
   say "ready" before anybody presses start.

   The free credit is finite, so the panel says what a night costs
   before it is spent: every AI voice bills while it is open, a little
   over seven cents a minute, and transcribing the people in the room
   costs well under a cent a minute each.
------------------------------------------------------------------ */
const AIPlayers = (() => {

  const MAX_TOTAL = 8;
  const AGENT_PER_MIN = 0.075;       // Deepgram Voice Agent, all in
  const EARS_PER_MIN = 0.0077;       // streaming transcription
  const NIGHT_MINUTES = 45;

  const FIRST = ['Morag', 'Ainsley', 'Struan', 'Isla', 'Fergus', 'Catriona', 'Hamish',
                 'Elspeth', 'Callum', 'Mhairi', 'Douglas', 'Kirsty', 'Lachlan', 'Fiona'];
  /* Voices, by build: a figure that looks like one voice should sound
     like it. Claudia gets the British one nobody else may have. */
  const VOICES_F = ['aura-2-thalia-en', 'aura-2-andromeda-en', 'aura-2-helena-en', 'aura-2-luna-en',
                    'aura-2-theia-en', 'aura-2-athena-en', 'aura-2-callista-en'];
  const VOICES_M = ['aura-2-draco-en', 'aura-2-apollo-en', 'aura-2-orion-en', 'aura-2-hyperion-en',
                    'aura-2-arcas-en', 'aura-2-zeus-en', 'aura-2-atlas-en'];
  const FEMININE = new Set(['Morag', 'Isla', 'Catriona', 'Elspeth', 'Mhairi', 'Kirsty', 'Fiona', 'Ainsley']);
  const CLAUDIA_VOICE = 'aura-2-pandora-en';

  let want = 0;                      // how many the host asked for
  let claudia = false;
  const seats = [];                  // [{ id, name, look, voice, ready, status }]
  let claudiaReady = false;
  let painted = null;
  let wired = false;

  /* ---------------- who they are ---------------- */

  function makeSeat(i) {
    const used = new Set(seats.map(s => s.name));
    const r = U.makeRng(((Date.now() ^ (i * 7919)) >>> 0) || 7);
    const pool = FIRST.filter(n => !used.has(n));
    const name = pool[r.int(0, pool.length - 1)] || ('Guest ' + (i + 1));
    const L = Look.LISTS;
    const look = Look.normalise({
      build: r.int(0, L.BUILD.length - 1), skin: r.int(0, L.SKIN.length - 1),
      hair: r.int(0, L.HAIR.length - 1), hairColour: r.int(0, L.HAIR_COLOUR.length - 1),
      coat: r.int(0, L.COAT.length - 1), accent: r.int(0, L.ACCENT.length - 1),
      hat: r.int(0, L.HAT.length - 1), scarf: r.int(0, L.SCARF.length - 1),
    });
    const usedVoices = new Set(seats.map(s => s.voice));
    const list = FEMININE.has(name) ? VOICES_F : VOICES_M;
    const voice = list.find(v => !usedVoices.has(v)) || list[i % list.length];
    return { id: AI.newId(), name, look, voice, ready: false, status: 'waking' };
  }

  /* Before the night they only need to sound like themselves: the
     director gives them the game, their role and everything they know
     the moment it starts. */
  function lobbyPrompt(seat) {
    return 'You are ' + seat.name + ', a contestant waiting in the lobby of a game of The Traitors '
      + 'in a Scottish castle. Speak only when spoken to, in one or two short, natural sentences, '
      + 'as a real person on a voice call would. Never say you are an AI.';
  }

  function sync(humans) {
    const room = Math.max(0, MAX_TOTAL - humans);
    const count = Math.min(want, room);
    while (seats.length > count) { const s = seats.pop(); AI.close(s.id); }
    if (!AI.ready) return;
    while (seats.length < count) {
      const s = makeSeat(seats.length);
      seats.push(s);
      AI.spawn({ id: s.id, name: s.name, voice: s.voice, prompt: lobbyPrompt(s),
                 functions: typeof AIDirector !== 'undefined' ? AIDirector.BOT_FUNCTIONS : [] });
    }
    if (claudia && !AI.agent(AI.CLAUDIA)) {
      claudiaReady = false;
      AI.spawn({ id: AI.CLAUDIA, name: 'Claudia', voice: CLAUDIA_VOICE,
                 prompt: 'You are Claudia, the host of The Traitors. Wait.',
                 functions: typeof AIDirector !== 'undefined' ? AIDirector.CLAUDIA_FUNCTIONS : [] });
    }
    if (!claudia && AI.agent(AI.CLAUDIA)) { AI.close(AI.CLAUDIA); claudiaReady = false; }
  }

  function wire() {
    if (wired) return;
    wired = true;
    AI.on('any', (m) => {
      const s = seats.find(x => x.id === m.id);
      if (m.op === 'ready') { if (s) { s.ready = true; s.status = 'ready'; } if (m.id === AI.CLAUDIA) claudiaReady = true; }
      if (m.op === 'error' && s) s.status = 'error: ' + String(m.message || '').slice(0, 40);
      if (m.op === 'status' && m.ok) sync(Party.roster().length);
      if (typeof Lobby !== 'undefined' && Lobby.paint) Lobby.paint();
    });
  }

  /* ---------------- the panel ---------------- */

  function paintPanel(root, humans) {
    if (!root) return;
    wire();
    if (!AI.available) {
      root.innerHTML = '<div class="ai-note">AI players need the game to be opened from its server.</div>';
      painted = null;
      return;
    }
    if (painted !== root || !root.querySelector('#ai-key')) build(root);
    sync(humans);
    const room = Math.max(0, MAX_TOTAL - humans);
    const el = (id) => root.querySelector('#' + id);
    el('ai-count').textContent = String(Math.min(want, room));
    el('ai-less').disabled = want <= 0;
    el('ai-more').disabled = want >= room || !AI.ready;
    el('ai-claudia').checked = claudia;
    el('ai-claudia').disabled = !AI.ready;
    const st = AI.status;
    el('ai-status').textContent = st === 'ready' ? (AI.error ? '● Connected · ' + AI.error : '● Connected')
      : st === 'checking' ? '● Checking…'
      : st === 'error' ? '● ' + (AI.error || 'That key did not work.')
      : '● Not connected';
    el('ai-body').classList.toggle('off', !AI.ready);
    el('ai-check').textContent = st === 'ready' ? 'Change' : 'Connect';
    // the eight chairs: the people here, the AI seats, and what is left
    const ai = Math.min(want, room);
    el('ai-chairs').innerHTML = Array.from({ length: MAX_TOTAL }, (_, i) =>
      '<i class="' + (i < humans ? 'h' : i < humans + ai ? 'a' : '') + '"></i>').join('');
    el('ai-status').className = 'ai-status ' + st;
    const voices = Math.min(want, room) + (claudia ? 1 : 0);
    const ears = voices ? humans : 0;
    const cost = NIGHT_MINUTES * (voices * AGENT_PER_MIN + ears * EARS_PER_MIN);
    el('ai-cost').textContent = voices
      ? 'About $' + cost.toFixed(2) + ' of Deepgram credit for a ' + NIGHT_MINUTES + '-minute night'
        + ' (the free $200 covers about ' + Math.max(1, Math.floor(200 / Math.max(cost, 0.01))) + ').'
      : '';
  }

  function build(root) {
    painted = root;
    root.innerHTML =
        '<div class="ai-card">'
      + '<div class="ai-head"><span class="ai-spark">✦</span><div><b>AI players</b>'
      + '<small>Voiced by Deepgram · $200 free credit, no card</small></div></div>'
      + '<div class="ai-key"><span class="ai-key-ico">🔑</span><input id="ai-key" type="password" autocomplete="off" spellcheck="false" '
      + 'placeholder="Paste a Deepgram API key" data-nav><button class="btn primary ai-connect" id="ai-check" data-nav>Connect</button></div>'
      + '<div class="ai-meta"><span class="ai-status" id="ai-status"></span>'
      + '<label class="ai-switch"><input type="checkbox" id="ai-remember" data-nav><i></i>Remember</label></div>'
      + '<div class="ai-body" id="ai-body">'
      + '<div class="ai-seats-row"><div><b>AI contestants</b><small>Fill the empty chairs</small></div>'
      + '<div class="ai-stepper"><button class="ai-round" id="ai-less" data-nav>−</button><b id="ai-count">0</b>'
      + '<button class="ai-round" id="ai-more" data-nav>+</button></div></div>'
      + '<div class="ai-chairs" id="ai-chairs"></div>'
      + '<label class="ai-switch big"><input type="checkbox" id="ai-claudia" data-nav><i></i>'
      + '<span><b>AI Claudia</b><small>A live host in her own voice, who reads the room</small></span></label>'
      + '</div>'
      + '<div class="ai-cost" id="ai-cost"></div>'
      + '</div>';
    const el = (id) => root.querySelector('#' + id);
    const stored = AI.storedKey();
    if (stored) { el('ai-key').value = stored; el('ai-remember').checked = true; }
    el('ai-check').onclick = () => {
      const key = el('ai-key').value.trim();
      AI.remember(key, el('ai-remember').checked);
      AI.configure(key);
      repaint();
    };
    el('ai-remember').onchange = () => AI.remember(el('ai-key').value.trim(), el('ai-remember').checked);
    el('ai-less').onclick = () => { want = Math.max(0, want - 1); repaint(); };
    el('ai-more').onclick = () => { want = Math.min(MAX_TOTAL - 1, want + 1); repaint(); };
    el('ai-claudia').onchange = () => { claudia = el('ai-claudia').checked; repaint(); };
    // a stored key is used without asking again
    if (stored && AI.status === 'off') AI.configure(stored);
  }

  function repaint() { if (typeof Lobby !== 'undefined' && Lobby.paint) Lobby.paint(); }

  /* The chairs, as the lobby and the start button see them. */
  function seatList(humans) {
    const room = Math.max(0, MAX_TOTAL - humans);
    return seats.slice(0, Math.min(want, room));
  }

  /* Leaving the room ends every voice it opened. */
  function reset() {
    seats.splice(0).forEach(s => AI.close(s.id));
    if (AI.agent(AI.CLAUDIA)) AI.close(AI.CLAUDIA);
    want = 0; claudia = false; claudiaReady = false;
  }

  return {
    paintPanel, seats: seatList, reset,
    get claudia() { return claudia && claudiaReady; },
    get wantsClaudia() { return claudia; },
    CLAUDIA_VOICE,
  };
})();

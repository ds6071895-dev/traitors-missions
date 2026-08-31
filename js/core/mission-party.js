/* ------------------------------------------------------------------
   mission-party.js — a room for one mission.

   The lobby opens a room for a whole night: three people, two
   missions, a round table and a fire. That is a commitment, and it is
   the only shape multiplayer had. This is the other one — you are
   looking at the Shootout, you want to shoot it with two friends, and
   you want that to be one button and a link rather than a negotiation
   about whether anybody has forty minutes.

   So a mission party is deliberately thinner than a night:

   - It is one mission, chosen before the room exists. The room is
     opened *for* it, and the link carries which one, so somebody who
     clicks it knows what they are being invited to before a single
     packet has arrived.
   - Two is enough. A night needs three because a round table with two
     chairs is not a round table; a mission needs however many turned
     up, and every mission here already says `1-3`.
   - The host owns the setup and everybody watches it change. The
     twists, the wood, the seed, and whether this is a full run or a
     walk straight up to the owl — all of it is the host's, broadcast
     on its own channel, painted read-only for everyone else. Three
     people arguing about a seed over voice chat while one of them
     drags it is the point.
   - Nobody is a Traitor. There is no session, no agenda, no vote. The
     money goes into the permanent pot exactly as practice does.

   `MissionNet` does not care which of the two put three people inside
   a mission — it only asks whether there is a room and whether the run
   in it is shared — which is why none of the missions needed a line
   changed for any of this.
------------------------------------------------------------------ */
const MissionParty = (() => {

  const el = (id) => document.getElementById(id);

  /* At least this many before the host can start. One is not a party,
     and the mission is already on the practice menu for that. */
  const MIN = 2;

  let armed   = false;   // this room was opened for a mission, not a night
  let def     = null;    // the mission
  let setup   = null;    // its run setup — the host's to choose
  let running = false;   // a party mission, or its scoreboard, is live
  let started = false;   // one launch per press
  let asked   = false;   // a guest has asked the host what it is playing
  let msgTimer = null;

  /* ---------------- messages ---------------- */

  function say(text, tone) {
    const m = el('mp-msg');
    if (!m) return;
    m.textContent = text || '';
    m.className = 'mp-msg' + (text ? ' on' : '') + (tone ? ' ' + tone : '');
    clearTimeout(msgTimer);
    if (text) msgTimer = setTimeout(() => say(''), 6000);
  }

  const esc = (s) => String(s).replace(/[&<>"]/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------------- the setup ----------------
     A party draws a fresh seed rather than the daily one. The daily is
     for comparing your run against everybody else's; a party has
     already agreed what it is playing by being in the same room. */

  function defaultSetup(d) {
    const modes = d && d.modes ? Object.keys(d.modes) : [];
    return {
      seed: U.randomSeed(),
      mode: modes[0] || 'prize',
      modId: null,
      tod: 'auto',
      skip: false,          // the mission's own shortcut, if it has one
    };
  }

  /* What actually gets handed to the mission. `skip` is not a mission
     concept — it is this screen's name for whatever the mission's own
     quick start does, which for the Shootout is "throw away the ten
     rounds and open the door on the owl". The mission's own opts win,
     because the mission is the thing that knows what its shortcut has
     to be true for: turning the owl on while `mode` still said
     `gauntlet` is exactly the run that does not exist.

     A ghost is never raced in a room. It is your own past self drawn
     alongside you, and two other boats are already there. */
  function optsFor(d, s) {
    const o = Object.assign({}, s, { ghost: false });
    delete o.skip;
    if (s && s.skip && d && d.quickStart) {
      Object.assign(o, d.quickStart.opts || {});
      o.ghost = false;
    }
    return o;
  }

  const runOpts = () => optsFor(def, setup);

  function preview() {
    if (!def || !def.preview) return null;
    try { return def.preview(runOpts()); } catch (e) { console.warn(e); return null; }
  }

  const canEdit = () => Party.isHost && !!def && !!def.setup;

  function change(patch, opts = {}) {
    if (!canEdit()) return;
    Object.assign(setup, patch);
    if (!opts.quiet) AudioBus.play('ui-click');
    broadcast();
    paint();
  }

  /* ---------------- the wire ----------------
     One message shape, sent by the host whenever anything moves and on
     demand when somebody new arrives. A guest that missed it is a
     guest staring at the wrong mission, so the ask is cheap and the
     answer is idempotent. */

  function broadcast(toPeer) {
    if (!Party.isHost || !Party.connected || !def) return;
    Party.post('mp', { k: 'setup', missionId: def.id, setup }, toPeer);
  }

  function onMp(msg, fromPeer) {
    if (!msg) return;
    if (msg.k === 'want') { broadcast(fromPeer); return; }
    if (msg.k !== 'setup' || Party.isHost) return;
    /* Only the host's word counts, and only about its own room. */
    if (Party.hostId && fromPeer !== Party.hostId) return;
    const d = Missions.get(msg.missionId);
    if (d) def = d;
    armed = true;
    setup = Object.assign(defaultSetup(d || def), msg.setup || {});
    paint();
  }

  /* ---------------- the link ----------------
     Four letters still work, and are still what you read down a phone.
     The link is for the other way people share things, which is by
     pasting them — and it carries the mission as well as the code so
     the invitation says what it is an invitation to. */

  function linkFor(code, missionId) {
    const base = String(location.href).split('#')[0];
    return base + '#p=' + encodeURIComponent(code || '')
                + '&m=' + encodeURIComponent(missionId || '');
  }

  const myLink = () => (Party.connected && def ? linkFor(Party.code, def.id) : '');

  /* What the address bar was asked to do, if anything. Read once at
     boot and again on a manual hash change, so a link pasted into a
     tab that is already running still works. */
  function fromLocation() {
    const raw = String(location.hash || '').replace(/^#/, '');
    if (!raw) return null;
    let q;
    try { q = new URLSearchParams(raw); } catch (e) { return null; }
    const code = Party.normaliseCode(q.get('p') || '');
    if (!Party.validCode(code)) return null;
    return { code, missionId: q.get('m') || '' };
  }

  function clearHash() {
    if (!location.hash) return;
    try { history.replaceState(null, '', String(location.href).split('#')[0]); }
    catch (e) { location.hash = ''; }
  }

  async function copyLink() {
    const link = myLink();
    if (!link) return;
    const field = el('mp-link-field');
    let done = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(link);
        done = true;
      }
    } catch (e) { /* a denied clipboard is not an error worth shouting */ }
    if (!done && field) {
      /* The old way, which still works everywhere the new one is
         refused — a page served off `file://`, mostly. */
      try { field.focus(); field.select(); done = document.execCommand('copy'); }
      catch (e) { done = false; }
    }
    AudioBus.play('ui-click');
    say(done ? 'Link copied. Paste it to them.'
             : 'Could not copy — select the link and copy it by hand.',
        done ? 'good' : 'bad');
  }

  async function share() {
    const link = myLink();
    if (!link || !navigator.share) return;
    try {
      await navigator.share({
        title: 'The Traitors',
        text: (def ? def.name : 'A mission') + ' — come and play it with me.',
        url: link,
      });
    } catch (e) { /* dismissing the sheet is not a failure */ }
  }

  /* ---------------- painting ---------------- */

  function paint() {
    if (Screens.current !== 'mparty') return;

    const p = preview();
    const editing = canEdit();

    el('mp-title').textContent = def ? def.name : 'Choose a mission';
    el('mp-tagline').textContent = def ? def.tagline : '';
    el('mp-icon').textContent = def ? def.icon : '·';

    /* --- the room --- */
    el('mp-code').textContent = Party.connected ? (Party.code || '····') : '····';
    const field = el('mp-link-field');
    const link = myLink();
    if (document.activeElement !== field) field.value = link;
    el('mp-copy').disabled = !link;
    const shareBtn = el('mp-share');
    shareBtn.hidden = !navigator.share || !link;

    const list = Party.connected ? Party.roster() : [];
    const mine = Party.selfId();
    el('mp-roster').innerHTML = list.map(q => {
      const you = q.id === mine;
      return '<div class="mp-seat' + (you ? ' you' : '') + '">'
           + '<span class="mp-seat-n">' + (q.seat + 1) + '</span>'
           + '<span class="mp-seat-name">' + esc(q.name || 'Player') + '</span>'
           + '<span class="mp-seat-tag">' + (q.host ? 'host' : (you ? 'you' : '')) + '</span>'
           + '</div>';
    }).join('') + emptySeats(list.length);

    const n = list.length;
    el('mp-status').textContent = !Party.connected ? 'Opening a room…'
      : (!Party.isHost && !n) ? 'Looking for the room…'
      : n < MIN ? 'Send the link. ' + n + ' of you so far.'
      : Party.isHost ? (n >= Party.MAX ? 'Everybody is here.' : 'Ready when you are.')
                     : 'Waiting for the host to start.';

    /* --- the run --- */
    const panel = el('mp-setup');
    panel.classList.toggle('watching', !editing);
    el('mp-owner').textContent = editing ? 'yours to choose' : "the host's call";

    const modeRow = el('mp-mode-row');
    modeRow.hidden = !def || !def.modes;
    if (def && def.modes) {
      const wrap = el('mp-mode');
      wrap.innerHTML = '';
      for (const m of Object.values(def.modes)) {
        const b = document.createElement('button');
        b.className = 'seg-btn' + (m.id === setup.mode ? ' on' : '');
        b.textContent = m.name;
        b.disabled = !editing || (setup.skip && !!def.quickStart);
        if (editing) b.onclick = () => change({ mode: m.id });
        wrap.appendChild(b);
      }
    }

    /* The shortcut, named by the mission rather than by this screen —
       "Fight Owl" is the Shootout's word for it and nothing here should
       have to know what an owl is. */
    const skipRow = el('mp-skip-row');
    const qs = def && def.quickStart;
    skipRow.hidden = !qs;
    if (qs) {
      const on = !!setup.skip;
      el('mp-skip').classList.toggle('on', on);
      el('mp-skip').disabled = !editing;
      el('mp-skip-icon').textContent = qs.icon || '◆';
      el('mp-skip-name').textContent = qs.label;
      el('mp-skip-note').textContent = qs.title || qs.label;
      el('mp-skip-state').textContent = on ? 'ON' : 'OFF';
    }

    const labels = (def && def.setupLabels) || {};
    el('mp-place-lbl').textContent = labels.course || 'Channel';
    el('mp-twist-lbl').textContent = labels.modifier || 'Twist';
    el('mp-place').textContent = p ? p.name : '—';
    el('mp-cond').textContent = p ? p.conditionText : '';
    const seedField = el('mp-seed');
    if (document.activeElement !== seedField) seedField.value = String(setup ? setup.seed : '');
    seedField.readOnly = !editing;
    el('mp-seed-roll').disabled = !editing;
    el('mp-seed-daily').disabled = !editing;
    el('mp-seed-daily').classList.toggle('on', !!(p && p.opts && p.opts.daily));

    const hand = el('mp-twists');
    hand.innerHTML = '';
    for (const m of (p && p.hand) || []) {
      const on = setup.modId === m.id;
      const card = document.createElement('button');
      card.className = 'mod-card' + (on ? ' on' : '');
      card.disabled = !editing;
      card.innerHTML = '<div class="mod-icon">' + esc(m.icon) + '</div>'
        + '<div class="mod-body"><div class="mod-name">' + esc(m.name)
        + '<span class="mod-pay">×' + m.payout.toFixed(2) + '</span></div>'
        + '<div class="mod-blurb">' + esc(m.blurb) + '</div></div>';
      if (editing) {
        card.onmouseenter = () => AudioBus.play('ui-hover');
        card.onclick = () => change({ modId: on ? null : m.id });
      }
      hand.appendChild(card);
    }
    el('mp-twist-row').hidden = !p || !p.hand || !p.hand.length;

    el('mp-payout').innerHTML = p && Math.abs(p.payout - 1) > 0.03
      ? '<span class="mp-pay-lbl">Everything pays</span><b>×' + p.payout.toFixed(2) + '</b>'
      : '<span class="mp-pay-lbl">Up to</span><b>'
        + (def ? U.money(def.maxPrize) : '—') + '</b>';

    /* --- the button --- */
    const go = el('mp-start');
    go.hidden = !Party.isHost;
    go.disabled = !def || n < MIN || started;
    go.textContent = n < MIN ? 'WAITING FOR ONE MORE' : 'START MISSION';

    const mic = el('mp-mic');
    mic.textContent = !VoiceChat.available ? 'Mic: off'
                    : (VoiceChat.muted ? 'Mic: muted' : 'Mic: live');
    mic.classList.toggle('on', VoiceChat.available && !VoiceChat.muted);

    RoomUI.paintMic();
    UINav.scan();
  }

  function emptySeats(n) {
    let out = '';
    for (let i = n; i < Party.MAX; i++) {
      out += '<div class="mp-seat empty"><span class="mp-seat-n">' + (i + 1)
           + '</span><span class="mp-seat-name">Empty</span>'
           + '<span class="mp-seat-tag"></span></div>';
    }
    return out;
  }

  /* ---------------- opening and joining ---------------- */

  function profile() {
    return { name: Look.getName() || 'Player', look: Look.get() };
  }

  /* The host's way in: a mission was chosen on the missions screen and
     the room is opened for it. */
  async function openFor(missionId) {
    const d = Missions.get(missionId);
    if (!d || d.locked) return;
    if (Party.connected && !Party.isHost) {
      /* Already a guest somewhere. Taking the room over is not on
         offer, so say so rather than quietly doing nothing. */
      Screens.show('mparty');
      say('You are in somebody else’s room. Leave it first.', 'bad');
      return;
    }
    def = d;
    armed = true;
    started = false;
    setup = defaultSetup(d);
    AudioBus.resume();
    Voice.unlock();
    Screens.show('mparty');
    if (!Party.connected) {
      say('Opening a room…');
      try {
        await Party.host(profile());
        VoiceChat.init();
        VoiceChat.listen();
        say('Room open. Send them the link.', 'good');
      } catch (e) {
        say((e && e.message) || 'Could not open a room.', 'bad');
      }
    }
    broadcast();
    paint();
  }

  /* The guest's way in: somebody's link. */
  async function joinCode(code, missionId) {
    armed = true;
    started = false;
    asked = false;
    const d = Missions.get(missionId);
    if (d) { def = d; setup = defaultSetup(d); }
    Screens.show('mparty');
    paint();
    if (Party.connected) return;
    say('Knocking on ' + code + '…');
    try {
      await Party.join(code, profile());
      VoiceChat.init();
      VoiceChat.listen();
      paint();
    } catch (e) {
      say((e && e.message) || 'Could not reach that room.', 'bad');
    }
  }

  function leave() {
    armed = false;
    running = false;
    started = false;
    asked = false;
    MissionNet.detach();
    Party.leave();
    VoiceChat.stop();
    clearHash();
    say('');
  }

  /* ---------------- starting ---------------- */

  function start() {
    if (!Party.isHost || started || !def) return;
    const list = Party.roster();
    if (list.length < MIN) return;
    started = true;
    const players = list.map(q => ({ id: q.id, name: q.name, look: q.look, seat: q.seat }));
    const msg = { kind: 'mission', missionId: def.id, opts: runOpts(), players };
    Party.post('go', msg);
    launch(msg);
  }

  /* Both ends come through here, from the same message, so nobody gets
     a wood the other two are not standing in. */
  function launch(msg) {
    const d = Missions.get(msg.missionId);
    if (!d || d.locked) {
      started = false;
      say('That mission is not available on this machine.', 'bad');
      return;
    }
    def = d;
    armed = true;
    running = true;
    const mine = Party.selfId();
    const players = (msg.players || []).map(q => Object.assign({}, q, {
      local: q.id === mine, alive: true,
    }));
    AudioBus.resume();
    Voice.unlock();
    Screens.transition(() => {
      Game.enterShow();
      Missions.launch(d.id, Object.assign({}, msg.opts, {
        party: true,
        host: Party.isHost,
        ghost: false,
        players,
        agenda: null,
      }));
    }, 420);
  }

  /* The scoreboard's way out. The room is still open and the same two
     or three people are still in it, so this goes back to it rather
     than to the front door. */
  function backToRoom() {
    running = false;
    started = false;
    MissionNet.detach();
    Screens.transition(() => {
      Missions.end();
      Engine.setPaused(false);
      Game.showAttract();
      Screens.show('mparty');
      if (Party.isHost) { setup.seed = U.randomSeed(); broadcast(); }
      paint();
    }, 320);
  }

  /* ---------------- somebody left ----------------
     A night dies when one of three goes, because a round table cannot
     be run with an empty chair. A mission party does not: these
     missions are all `1-3`, the wood is a pure function of the seed,
     and the two who are left are still in a room together. So this is
     a line of text and a repaint, not an ending — unless it was the
     host, which `party.js` reports as an error of its own. */
  function peerLeft(seat) {
    if (!armed) return false;
    const who = (seat && seat.name) ? seat.name : 'Somebody';

    /* The host is the exception. It owned the setup and it owned the
       start button, so a room without one is a waiting room that will
       never open — there is nothing to stay for. A run already in the
       air is a different matter and is left to finish: the wood is a
       pure function of the seed and it is all still there. */
    if (seat && seat.host && !Party.isHost) {
      if (running) { say(who + ' left. You are finishing this one alone.'); return true; }
      leave();
      Game.toMenu();
      return true;
    }

    say(who + ' left the room.');
    if (Party.isHost) broadcast();
    paint();
    return true;
  }

  /* ---------------- wiring ---------------- */

  function init() {
    el('mp-copy').onclick = copyLink;
    el('mp-share').onclick = share;
    el('mp-link-field').onclick = (e) => e.target.select();

    el('mp-seed-roll').onclick = () => change({ seed: U.randomSeed() });
    el('mp-seed-daily').onclick = () => change({ seed: U.dailySeed() });
    const seedField = el('mp-seed');
    const commitSeed = () => {
      if (!canEdit()) { paint(); return; }
      const v = parseInt(String(seedField.value).replace(/[^0-9]/g, ''), 10);
      if (Number.isFinite(v) && v > 0 && v !== setup.seed) change({ seed: v });
      else paint();
    };
    seedField.addEventListener('change', commitSeed);
    seedField.addEventListener('blur', commitSeed);
    seedField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); seedField.blur(); }
    });

    el('mp-skip').onclick = () => {
      if (!canEdit()) return;
      change({ skip: !setup.skip });
    };

    el('mp-mic').onclick = async () => {
      await RoomUI.toggleMic();
      paint();
    };

    el('mp-start').onclick = () => { AudioBus.play('ui-click'); start(); };
    el('mp-leave').onclick = () => {
      AudioBus.play('ui-click');
      leave();
      Game.toMenu();
    };

    Party.on('mp', onMp);

    Party.on('roster', () => {
      if (!armed) return;
      /* A guest that has just been seated asks the host what it is
         they have all turned up for. Once — the host's answer arrives
         on every change after that. */
      if (!Party.isHost && !asked && Party.roster().length) {
        asked = true;
        Party.post('mp', { k: 'want' }, Party.hostId || undefined);
      }
      if (Party.isHost) broadcast();
      paint();
    });

    Party.on('error', (m) => {
      if (!armed) return;
      if (!Party.connected) { armed = false; running = false; started = false; asked = false; }
      say(m, 'bad');
      paint();
    });

    /* A `go` without a `kind` is the lobby starting a night; this one
       is a mission and nothing else. It is acted on whether or not
       this client thought it was in a mission party, because the host
       has just said what the room is doing. */
    Party.on('go', (data) => {
      if (!data || data.kind !== 'mission' || started) return;
      started = true;
      launch(data);
    });

    VoiceChat.on('state', paint);

    Screens.register('mparty', { enter: () => paint() });

    /* A link in the address bar. Read after boot rather than during
       it, so the mission registry is already full and the name on the
       screen is the mission's own rather than an id. */
    window.addEventListener('hashchange', () => {
      const w = fromLocation();
      if (w && !Party.connected) joinCode(w.code, w.missionId);
    });
  }

  /* Called once by `boot`, after everything is registered. */
  function openFromLink() {
    const w = fromLocation();
    if (!w) return false;
    joinCode(w.code, w.missionId);
    return true;
  }

  return { init, openFor, joinCode, leave, start, backToRoom, paint, say,
           peerLeft, openFromLink, fromLocation, linkFor, optsFor, MIN,
           /* `choose` is what every control on the right-hand panel
              does: change one thing, tell the room, repaint. It is out
              here rather than behind the buttons so that what the host
              picked, what went on the wire and what the mission was
              handed can be checked without a browser. */
           choose: change,
           get setup() { return setup ? Object.assign({}, setup) : null; },
           get running() { return running; },
           get armed() { return armed; },
           get mission() { return def; } };
})();

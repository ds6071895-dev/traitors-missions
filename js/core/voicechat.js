/* ------------------------------------------------------------------
   voicechat.js — three people actually talking.

   The mic is open in the lobby, the dressing room, the missions and
   the round table, because half of what makes this game work is two
   people shouting at each other — about a bird that got away, or about
   which of them was nowhere near the boat when it mattered. At the
   fire, and only there, it stops being a conversation and becomes a
   floor: one person speaks for thirty seconds and everybody else is
   muted, because that is the room where names get said.

   That muting happens on the *sending* side. `track.enabled = false`
   stops the audio at the microphone, which means holding the floor is
   a fact about the room rather than a request the other two clients
   are trusted to honour. A version that muted on playback would be a
   politeness setting.

   Nothing here is required for the game to run. A refused permission,
   a machine with no microphone, an insecure origin — all of them land
   in the same place: `available` stays false, the UI says so once, and
   the night carries on in text.
------------------------------------------------------------------ */
const VoiceChat = (() => {

  let stream = null;             // our own microphone
  let available = false;
  let muted = false;             // the local mute button
  let floorId = null;            // who holds the floor, or null for open mic
  let selfId = null;
  let denied = null;             // why it is not available, for the UI

  const peers = new Map();       // peerId -> { stream, el, analyser, data }
  let meterCtx = null;
  const levels = new Map();      // peerId -> 0..1

  const listeners = { state: new Set(), level: new Set() };
  function on(evt, fn) {
    if (!listeners[evt]) return () => {};
    listeners[evt].add(fn);
    return () => listeners[evt].delete(fn);
  }
  const emit = (evt, a) => listeners[evt].forEach(fn => {
    try { fn(a); } catch (e) { console.warn(e); }
  });

  /* ---------------- starting ---------------- */

  let micGeneration = 0;
  let requesting = false;
  async function start() {
    if (available) return true;
    if (requesting) return false;
    const requestId = ++micGeneration;
    const md = navigator.mediaDevices;
    if (!md || !md.getUserMedia) {
      denied = location.protocol === 'file:'
        ? 'Voice needs the game served over http or https, not opened off disk.'
        : 'This browser will not give the game a microphone.';
      emit('state');
      return false;
    }
    requesting = true;
    try {
      const acquired = await md.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true,
                 autoGainControl: true },
        video: false,
      });
      if (requestId !== micGeneration) { acquired.getTracks().forEach(t => t.stop()); return false; }
      stream = acquired;
    } catch (e) {
      if (requestId !== micGeneration) return false;
      denied = e && e.name === 'NotAllowedError'
        ? 'Microphone blocked. The night still works without it.'
        : 'No microphone found. The night still works without it.';
      emit('state');
      return false;
    } finally { if (requestId === micGeneration) requesting = false; }
    available = true;
    denied = null;
    selfId = Party.selfId();
    applyGate();
    watchPeers();
    emit('state');
    return true;
  }

  /* Trystero hands a peer's audio over whenever it arrives, including
     well after they joined — a peer who allows their mic three minutes
     in simply turns up here then. */
  let watching = false;
  /* Called the moment a room opens, not when *we* find a microphone:
     somebody else's voice must arrive whether or not we have said yes
     to ours, or a player who declines the permission prompt spends the
     night in silence wondering why nobody is talking. */
  function listen() { watchPeers(); }

  /* `watched` is the room object we last hooked, not a flag: leaving and
     joining again hands back a *different* room, and a boolean would
     have left the second one silent. `published` is the same idea for
     the other direction. */
  let watched = null;
  let published = null;

  /* Our own microphone, into whatever room we are in.

     This used to happen in `start()` and only there, under an
     `if (Party.connected)` — which is the wrong way round, because the
     mic button on the lobby screen is reachable before there is a room
     to put a stream into. Turning your microphone on and *then*
     opening a room left you audible to nobody for the whole night, and
     the game had no way to tell you: your own meter worked, the button
     said "mic live", and the other two simply never heard a word.

     So it is a fact that gets reconciled instead of an event that has
     to happen in the right order. Either half can arrive first. */
  function publish() {
    const room = Party.room;
    if (!room || !stream || published === room) return;
    published = room;
    if (room.server) {
      ServerAudio.publish(room, stream).catch(() => {
        if (Party.room !== room) return;
        published = null;
        denied = 'Could not start the microphone connection.';
        emit('state');
      });
    } else { try { room.addStream(stream); } catch (e) { console.warn(e); } }
  }

  function watchPeers() {
    const room = Party.room;
    if (!room) return;
    if (watched !== room) {
      watched = room;
      if (room.server) {
        ServerAudio.listen(room, attach, message => { denied = message; emit('state'); });
      } else {
        Party.hook(room, 'onPeerStream', (peerStream, peerId) => attach(peerId, peerStream));
      }
    }
    publish();
    if (!watching) {
      watching = true;
      Party.on('left', peerId => {
        if (typeof ServerAudio !== 'undefined') ServerAudio.detach(peerId);
        detach(peerId);
      });
    }
  }

  /* A voice arrives as one of two things: a MediaStream (a peer
     connection), played by a hidden <audio>; or, from the room server, a
     handle on its own playback node and gain, which is played already
     and only needs its volume. The second is given the same `el` face as
     the first — `muted` and `volume` — so nothing below cares which. */
  function attach(peerId, source) {
    detach(peerId);
    const entry = source && source.gain ? nodeEntry(source) : elementEntry(source);
    peers.set(peerId, entry);
    refreshSpeechGate();
    applyVolume(peerId, entry);
    if (!entry.analyser) meter(peerId, entry);
  }

  function elementEntry(peerStream) {
    const el = document.createElement('audio');
    el.autoplay = true;
    el.playsInline = true;
    el.srcObject = peerStream;
    el.style.display = 'none';
    document.body.appendChild(el);
    /* Autoplay can be refused until the page has been touched. Every
       route into a room goes through a click, so this is a fallback
       rather than the plan. */
    const go = () => el.play().catch(() => {});
    go();
    document.addEventListener('pointerdown', go, { once: true });
    return { stream: peerStream, el, analyser: null, data: null };
  }

  function nodeEntry(handle) {
    let isMuted = false, vol = 1;
    const apply = () => {
      try { handle.gain.gain.setTargetAtTime(isMuted ? 0 : vol, handle.ctx.currentTime, 0.03); } catch (e) {}
    };
    const el = {
      get muted() { return isMuted; },
      set muted(v) { if (!!v !== isMuted) { isMuted = !!v; apply(); } },
      get volume() { return vol; },
      set volume(v) { if (v !== vol) { vol = v; apply(); } },
      srcObject: null,
      remove() {},
    };
    return { stream: null, el, analyser: handle.analyser,
             data: handle.analyser ? new Float32Array(handle.analyser.fftSize) : null };
  }

  function detach(peerId) {
    const e = peers.get(peerId);
    if (!e) return;
    try { e.el.srcObject = null; e.el.remove(); } catch (err) {}
    peers.delete(peerId);
    levels.delete(peerId);
    talkUntil.delete(peerId);
  }

  /* ---------------- who is talking ----------------
     A separate MediaStream off the same tracks, because feeding the
     element's stream to an analyser as well is unreliable in Chrome
     and the failure is silent. */

  function meter(peerId, entry) {
    try {
      const ctx = AudioBus.ctx || AudioBus.init();
      if (!ctx) return;
      meterCtx = ctx;
      const tracks = entry.stream.getAudioTracks();
      if (!tracks.length) return;
      const src = ctx.createMediaStreamSource(new MediaStream(tracks));
      const an = ctx.createAnalyser();
      an.fftSize = 2048;
      src.connect(an);                       // deliberately not to destination
      entry.analyser = an;
      entry.data = new Float32Array(an.fftSize);
    } catch (e) { /* a meter is a nicety; never let it cost the audio */ }
  }

  /* Our own voice, metered the same way, for the one client that has
     to judge the whole room: the host's moderator asks how long every
     living person has spoken, and the host is a person too. */
  let selfMeter = null, selfLevel = 0;
  function meterSelf() {
    if (!stream || (selfMeter && selfMeter.stream === stream)) return;
    try {
      const ctx = AudioBus.ctx || AudioBus.init();
      if (!ctx) return;
      const tracks = stream.getAudioTracks();
      if (!tracks.length) return;
      const src = ctx.createMediaStreamSource(new MediaStream(tracks));
      const an = ctx.createAnalyser();
      an.fftSize = 2048;
      src.connect(an);
      selfMeter = { stream, an, data: new Float32Array(an.fftSize) };
    } catch (e) { selfMeter = null; }
  }

  /* Frequency bytes are logarithmic: even barely audible microphone
     noise can look loud when their values are averaged. Use the actual
     waveform's RMS instead, with a floor for quiet room/mic noise. */
  function readLevel(analyser, data) {
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    const rms = Math.sqrt(sum / data.length);
    return rms < 0.006 ? 0 : Math.min(1, rms / 0.1);
  }

  function pump() {
    const now = Date.now();
    refreshSpeechGate();
    meterSelf();
    if (selfMeter && stream) {
      const gagged = muted || (floorId !== null && floorId !== selfId);
      selfLevel = gagged ? 0 : readLevel(selfMeter.an, selfMeter.data);
    } else selfLevel = 0;
    voice(selfId || (typeof Party !== 'undefined' && Party.selfId ? Party.selfId() : null), selfLevel, now);
    if (!peers.size) { courtesyPass(); emit('level', levels); return; }
    for (const [id, e] of peers) {
      if (!e.analyser) continue;
      const v = readLevel(e.analyser, e.data);
      levels.set(id, v);
      voice(id, v, now);
      /* Only what reaches your ears counts as talking: a voice gated
         under Claudia, or too far off down a corridor, is not. */
      if (e.el.muted || e.el.volume < 0.05) {
        e.talkSince = null;
        talkUntil.delete(id);
        continue;
      }
      const active = (talkUntil.get(id) || 0) > now;
      if (v > (active ? TALK_OFF : TALK_ON)) {
        if (e.talkSince == null) e.talkSince = now;
        if (active || now - e.talkSince >= TALK_START) talkUntil.set(id, now + TALK_HOLD);
      } else e.talkSince = null;
    }
    courtesyPass();
    emit('level', levels);
  }

  /* Whether a microphone is carrying a voice, whatever reaches your own
     ears: the same thresholds as `talking`, but before distance, Claudia
     or courtesy turn it down. This is what the AIs wait on — the
     recogniser's words arrive late and in bursts, and a gap between two
     transcripts is not a gap in the sentence. Ours is in here too. */
  const voicedUntil = new Map(), voiceSince = new Map(), voiceRun = new Map();
  function voice(id, v, now) {
    if (!id) return;
    const active = (voicedUntil.get(id) || 0) > now;
    if (v > (active ? TALK_OFF : TALK_ON)) {
      if (!voiceRun.has(id)) voiceRun.set(id, now);
      if (active || now - voiceRun.get(id) >= TALK_START) {
        if (!active) voiceSince.set(id, now);
        voicedUntil.set(id, now + TALK_HOLD);
      }
    } else voiceRun.delete(id);
  }
  const voiced = (id) => !!id && (voicedUntil.get(id) || 0) > Date.now();
  // how long this stretch of voice has run, in ms; 0 when there is none
  const voicedFor = (id) => voiced(id) ? Date.now() - (voiceSince.get(id) || Date.now()) : 0;

  /* ---------------- courtesy ----------------
     At the table everybody's microphone is open, and two people talking
     at once is two people nobody can follow. Whoever started first has
     the room: anybody talking over them — a person or an AI — is played
     at under half volume until they stop, on every screen alike, since
     every screen meters the same voices. Nobody is cut off, and the one
     who holds on keeps the room. Claudia is not a player and is never
     turned down. */
  const COURTESY = 0.4;
  let courtesy = false, holder = null;
  const humanIds = () => {
    const s = typeof Session !== 'undefined' && Session.state;
    return s ? s.players.filter(p => !p.bot && p.alive).map(p => p.id) : [];
  };
  const isPlayer = (id) => {
    const s = typeof Session !== 'undefined' && Session.state;
    return !!s && s.players.some(p => p.id === id);
  };
  function courtesyPass() {
    const was = holder;
    const st = typeof Session !== 'undefined' && Session.state;
    // a scene that ended mid-argument does not carry it into the castle
    if (!courtesy || !st || (st.phase !== 'table' && st.phase !== 'finale')) holder = null;
    else if (!voiced(holder)) {
      holder = null;
      let first = Infinity;
      for (const id of humanIds()) {
        if (voiced(id) && voiceSince.get(id) < first) { first = voiceSince.get(id); holder = id; }
      }
    }
    if (holder !== was) for (const [id, e] of peers) applyVolume(id, e);
  }
  function setCourtesy(on) {
    courtesy = !!on;
    courtesyPass();
  }
  function applyVolume(id, e) {
    if (!e || !e.el) return;
    const base = volumes.has(id) ? volumes.get(id) : 1;
    const vol = holder && id !== holder && isPlayer(id) ? base * COURTESY : base;
    if (Math.abs(e.el.volume - vol) > 0.02) e.el.volume = vol;
  }

  const level = (id) => levels.get(id) || 0;

  /* Who is audibly talking right now, as a voice rather than a meter:
     on after a sustained syllable, held through the gaps between words
     so a sentence is one stretch rather than a flicker. The AI voices
     come in here exactly like a person's, so this is the one place
     that can say which of them it is. Offline bots speak through the
     host's synthesiser instead and are folded in by name. */
  const TALK_ON = 0.15, TALK_OFF = 0.09, TALK_START = 100, TALK_HOLD = 650;
  const talkUntil = new Map();
  function talking(id) {
    if (!id) return false;
    if ((talkUntil.get(id) || 0) > Date.now()) return true;
    return typeof Bots !== 'undefined' && Bots.speaking === id;
  }
  function talkers() {
    const out = [];
    for (const id of talkUntil.keys()) if (talking(id)) out.push(id);
    if (typeof Bots !== 'undefined' && Bots.speaking && out.indexOf(Bots.speaking) < 0) out.push(Bots.speaking);
    return out.sort((a, b) => level(b) - level(a));
  }

  /* Who is actually talking, when nobody has been given a turn. The
     round table is an open microphone, so the only thing that knows
     who has the room is the room itself. Ours is not in here: the
     local player is the camera at the table, and a meter on your own
     voice would only ever be telling you what you already know. */
  function loudest(min = 0.12) {
    let best = null, top = min;
    for (const [id, v] of levels) if (v > top) { top = v; best = id; }
    return best;
  }

  /* ---------------- the gate ----------------
     One function decides whether our microphone is live, and it is the
     only thing that ever touches `track.enabled`. */

  function applyGate() {
    if (!stream) return;
    const gagged = muted || (floorId !== null && floorId !== selfId);
    stream.getAudioTracks().forEach(t => { t.enabled = !gagged; });
  }

  function setMuted(v) {
    muted = !!v;
    applyGate();
    emit('state');
    return muted;
  }
  const toggleMuted = () => setMuted(!muted);

  /* `null` is an open room. Anything else is a floor, and only that
     person's microphone is live. */
  function setFloor(playerId) {
    floorId = playerId || null;
    selfId = Party.selfId();
    applyGate();
    emit('state');
  }

  const openFloor = () => setFloor(null);

  function stop() {
    ++micGeneration; requesting = false;
    if (typeof ServerAudio !== 'undefined') ServerAudio.stop();
    if (stream) stream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
    stream = null;
    available = false;
    floorId = null;
    for (const id of [...peers.keys()]) detach(id);
    /* Forget which room we were listening to as well. The next one is a
       different object and has to be hooked again, and leaving this set
       would make a rejoined room silent. Same for the room we were
       speaking into. */
    watched = null;
    published = null;
    emit('state');
  }

  /* How loud one voice is in your ears. In the castle by day that is
     how far away they are standing, which is what makes a quiet word in
     the turret quiet. 1 everywhere else. */
  const volumes = new Map();
  function refreshSpeechGate() {
    const s = typeof Session !== 'undefined' && Session.state;
    if (!s) return;
    const blocked = (typeof Voice !== 'undefined' && (Voice.speaking || Voice.sinceSpoke < 3500))
      || (typeof Scenes !== 'undefined' && Scenes.botSpeechBlocked)
      || (typeof AI !== 'undefined' && AI.speaking(AI.CLAUDIA));
    for (const [id, e] of peers) {
      if (s.players.some(p => p.id === id && p.bot)) e.el.muted = !!blocked;
    }
  }
  function setVolume(peerId, v) {
    const vol = Math.max(0, Math.min(1, Number(v)));
    if (!Number.isFinite(vol)) return;
    if (vol >= 0.999) volumes.delete(peerId); else volumes.set(peerId, vol);
    applyVolume(peerId, peers.get(peerId));
  }
  function resetVolumes() {
    volumes.clear();
    for (const [id, e] of peers) applyVolume(id, e);
  }

  /* The meters only need to move as fast as a person can see them. */
  let pumpTimer = null;
  function init() {
    if (pumpTimer) return;
    pumpTimer = setInterval(pump, 100);
  }

  return {
    init, listen, start, stop, on, setMuted, toggleMuted, setFloor, openFloor, setVolume, resetVolumes, refreshSpeechGate,
    level, levels, loudest, talking, talkers, voiced, voicedFor, setCourtesy,
    get holder() { return holder; },
    get selfLevel() { return selfLevel; },
    get available() { return available; },
    get muted() { return muted; },
    get speaking() { return floorId; },
    get gagged() { return muted || (floorId !== null && floorId !== selfId); },
    get reason() { return denied; },
    get stream() { return stream; },
  };
})();

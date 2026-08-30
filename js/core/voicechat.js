/* ------------------------------------------------------------------
   voicechat.js — three people actually talking.

   The mic is open in the lobby, the dressing room and the missions,
   because half of what makes this game work is two people shouting at
   each other about a bird that got away. At the round table and the
   fire it stops being a conversation and becomes a floor: one person
   speaks for thirty seconds and everybody else is muted.

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

  async function start() {
    if (available) return true;
    const md = navigator.mediaDevices;
    if (!md || !md.getUserMedia) {
      denied = location.protocol === 'file:'
        ? 'Voice needs the game served over http or https, not opened off disk.'
        : 'This browser will not give the game a microphone.';
      emit('state');
      return false;
    }
    try {
      stream = await md.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true,
                 autoGainControl: true },
        video: false,
      });
    } catch (e) {
      denied = e && e.name === 'NotAllowedError'
        ? 'Microphone blocked. The night still works without it.'
        : 'No microphone found. The night still works without it.';
      emit('state');
      return false;
    }
    available = true;
    denied = null;
    selfId = Party.selfId();
    applyGate();
    if (Party.connected && Party.room) {
      try { Party.room.addStream(stream); } catch (e) { console.warn(e); }
    }
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

  function watchPeers() {
    if (watching || !Party.room) return;
    watching = true;
    Party.room.onPeerStream((peerStream, peerId) => attach(peerId, peerStream));
    Party.on('left', (peerId) => detach(peerId));
  }

  function attach(peerId, peerStream) {
    detach(peerId);
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

    const entry = { stream: peerStream, el, analyser: null, data: null };
    peers.set(peerId, entry);
    meter(peerId, entry);
  }

  function detach(peerId) {
    const e = peers.get(peerId);
    if (!e) return;
    try { e.el.srcObject = null; e.el.remove(); } catch (err) {}
    peers.delete(peerId);
    levels.delete(peerId);
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
      an.fftSize = 256;
      an.smoothingTimeConstant = 0.75;
      src.connect(an);                       // deliberately not to destination
      entry.analyser = an;
      entry.data = new Uint8Array(an.frequencyBinCount);
    } catch (e) { /* a meter is a nicety; never let it cost the audio */ }
  }

  function pump() {
    if (!peers.size) return;
    for (const [id, e] of peers) {
      if (!e.analyser) continue;
      e.analyser.getByteFrequencyData(e.data);
      let sum = 0;
      for (let i = 2; i < 40; i++) sum += e.data[i];
      const v = Math.min(1, (sum / 38) / 96);
      levels.set(id, v);
    }
    emit('level', levels);
  }

  const level = (id) => levels.get(id) || 0;

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
    if (stream) stream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
    stream = null;
    available = false;
    floorId = null;
    for (const id of [...peers.keys()]) detach(id);
    emit('state');
  }

  /* The meters only need to move as fast as a person can see them. */
  let pumpTimer = null;
  function init() {
    if (pumpTimer) return;
    pumpTimer = setInterval(pump, 100);
  }

  return {
    init, listen, start, stop, on, setMuted, toggleMuted, setFloor, openFloor,
    level, levels,
    get available() { return available; },
    get muted() { return muted; },
    get speaking() { return floorId; },
    get gagged() { return muted || (floorId !== null && floorId !== selfId); },
    get reason() { return denied; },
    get stream() { return stream; },
  };
})();

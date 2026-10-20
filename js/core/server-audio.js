/* Audio uses the room server, never a peer connection. The existing
   VoiceChat UI still owns permission, track muting, and whose turn it is.

   Where it can, voice runs in `voice-worker.js` on a socket of its own:
   this file only wires the worklets to it — the microphone's capture node
   gets a port straight to the worker, each voice in the room gets a
   playback node with a port straight from it — so a slow frame on this
   thread is never a gap in anybody's voice. Without a Worker it falls back
   to the old path: PCM over the game socket, through this thread.

   Each voice plays through its own gain into the speakers, not through an
   <audio> element: one buffer, the worklet's, rather than two. */
const ServerAudio = (() => {
  let current = null;
  /* A voice that is not a person in the room: Claudia, or an AI seat the
     night has dealt in. Anything else with no seat is dropped. */
  const CLAUDIA = 'c1a0d1a0-0000-4000-8000-00000000c1a0';
  const CLAUDIA_LINE = 'c1a0d1a0-0000-4000-8000-00000000c1a1';   // her scripted lines, read to you alone
  const aiVoice = (id) => id === CLAUDIA || id === CLAUDIA_LINE || !!(typeof Session !== 'undefined' && Session.state
    && Session.state.players.some(p => p.bot && p.id === id));
  const known = (room, id) => room.players.some(p => p.id === id) || aiVoice(id);

  function listen(room, attach, failed) {
    if (current && current.room === room) return;
    stop();
    const state = { room, attach, failed, ctx: null, source: null, capture: null, stream: null,
      remotes: new Map(), closed: false, resume: null, ready: null, worker: null,
      voice: null, caps: null };
    current = state;
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      state.ctx = new Context({ latencyHint: 'interactive' });
      if (!state.ctx.audioWorklet) throw new Error('AudioWorklet unavailable');
      state.resume = () => { if (!state.closed) state.ctx.resume().catch(() => {}); };
      document.addEventListener('pointerdown', state.resume);
      document.addEventListener('keydown', state.resume);
      state.resume();
      state.ready = state.ctx.audioWorklet.addModule('js/core/voice-worklet.js');
      state.ready.catch(() => { if (!state.closed) failed('Could not start voice audio. Please reload to retry.'); });
    } catch (e) {
      stop();
      failed('Voice needs HTTPS and a browser with AudioWorklet support.');
      return;
    }
    startWorker(state);
    room.onAudio = packet => {
      if (state.closed || packet.byteLength !== 996) return;
      // our own socket is down, so this came the old way: the worker still plays it
      if (state.worker) { state.worker.postMessage({ op: 'legacy', packet }, [packet]); return; }
      const id = String.fromCharCode(...new Uint8Array(packet, 0, 36));
      if (!known(room, id)) return;
      remote(state, id).then(peer => {
        if (!peer) return;
        peer.node.port.postMessage({ pcm: packet.slice(36), seq: null, start: null });
      }).catch(() => { if (!state.closed) failed('Voice playback could not start.'); });
    };
  }

  function startWorker(state) {
    const room = state.room;
    if (typeof Worker !== 'function' || !room.voiceUrl || !room.token) return;
    let worker;
    try { worker = new Worker('js/core/voice-worker.js'); } catch (e) { return; }
    state.worker = worker;
    worker.onmessage = (event) => {
      if (state.closed) return;
      const m = event.data || {};
      if (m.op === 'peer') {
        if (!known(room, m.id)) { worker.postMessage({ op: 'deny', id: m.id }); return; }
        remote(state, m.id).then(peer => {
          if (!peer || state.closed) return;
          const ch = new MessageChannel();
          peer.node.port.postMessage({ type: 'port', port: ch.port1 }, [ch.port1]);
          worker.postMessage({ op: 'port', id: m.id, port: ch.port2 }, [ch.port2]);
        }).catch(() => { if (!state.closed) state.failed('Voice playback could not start.'); });
      } else if (m.op === 'send' && m.pcm) {
        // the voice socket is down: say it on the game socket instead
        if (state.stream && state.stream.getAudioTracks().some(t => t.enabled && t.readyState === 'live')) room.sendAudio(m.pcm);
      } else if (m.op === 'stats') state.voice = m.stats;
      else if (m.op === 'caps') state.caps = m;
    };
    worker.onerror = () => {};
    worker.postMessage({ op: 'open', url: room.voiceUrl, token: room.token });
  }

  /* One voice's way out: its own worklet buffer, its own gain (distance,
     and the gate that holds bots under Claudia), and a meter off the side. */
  async function remote(state, id) {
    await state.ready;
    if (state.closed) return null;
    let peer = state.remotes.get(id);
    if (peer) return peer;
    const node = new AudioWorkletNode(state.ctx, 'room-voice', {
      numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1],
      processorOptions: { capture: false },
    });
    const gain = state.ctx.createGain();
    node.connect(gain);
    gain.connect(state.ctx.destination);
    const analyser = state.ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.75;
    node.connect(analyser);
    peer = { node, gain, analyser, ctx: state.ctx, stats: null };
    node.port.onmessage = (event) => { if (event.data && event.data.type === 'stats') peer.stats = event.data; };
    state.remotes.set(id, peer);
    state.attach(id, peer);
    return peer;
  }

  async function publish(room, stream) {
    const state = current;
    if (!state || state.room !== room || state.stream === stream) return;
    await state.ready;
    if (state.closed) return;
    state.resume();
    if (state.capture) { state.capture.port.postMessage('stop'); state.capture.disconnect(); }
    if (state.source) state.source.disconnect();
    state.stream = stream;
    state.source = state.ctx.createMediaStreamSource(stream);
    state.capture = new AudioWorkletNode(state.ctx, 'room-voice', {
      numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
      processorOptions: { capture: true },
    });
    if (state.worker) {
      const ch = new MessageChannel();
      state.capture.port.postMessage({ type: 'port', port: ch.port1 }, [ch.port1]);
      state.worker.postMessage({ op: 'capture', port: ch.port2 }, [ch.port2]);
    } else {
      state.capture.port.onmessage = event => {
        if (state.closed || !stream.getAudioTracks().some(t => t.enabled && t.readyState === 'live')) return;
        // A stalled main thread can receive seconds of worklet messages at once.
        // Sending that backlog makes speech crawl long after rendering recovers.
        const packet = event.data;
        if (!packet || state.ctx.currentTime - packet.at > .12) return;
        room.sendAudio(packet.pcm);
      };
    }
    state.source.connect(state.capture);
    // Capture emits silence here; connecting keeps the worklet processing.
    state.capture.connect(state.ctx.destination);
  }

  function detach(id) {
    const peer = current && current.remotes.get(id);
    if (current && current.worker) current.worker.postMessage({ op: 'detach', id });
    if (!peer) return;
    peer.node.port.postMessage('stop');
    peer.node.disconnect(); peer.gain.disconnect();
    current.remotes.delete(id);
  }

  function stop() {
    const state = current;
    if (!state) return;
    state.closed = true;
    state.room.onAudio = null;
    for (const id of [...state.remotes.keys()]) detach(id);
    if (state.worker) { state.worker.postMessage({ op: 'close' }); state.worker = null; }
    if (state.capture) { state.capture.port.postMessage('stop'); state.capture.disconnect(); }
    if (state.source) state.source.disconnect();
    if (state.resume) {
      document.removeEventListener('pointerdown', state.resume);
      document.removeEventListener('keydown', state.resume);
    }
    if (state.ctx) state.ctx.close().catch(() => {});
    current = null;
  }

  /* For the network overlay: the voice socket, and each voice's buffer. */
  function stats() {
    if (!current) return null;
    const peers = {};
    for (const [id, p] of current.remotes) if (p.stats) peers[id] = p.stats;
    return { mode: current.worker ? 'worker' : 'main', caps: current.caps, voice: current.voice, peers };
  }

  return { listen, publish, detach, stop, stats, CLAUDIA, CLAUDIA_LINE };
})();

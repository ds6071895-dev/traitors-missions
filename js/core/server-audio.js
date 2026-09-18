/* Audio uses the room's WebSocket, never a peer connection. The existing
   VoiceChat UI still owns permission, track muting, and whose turn it is. */
const ServerAudio = (() => {
  let current = null;
  function listen(room, attach, failed) {
    if (current && current.room === room) return;
    stop();
    const state = { room, ctx: null, source: null, capture: null, stream: null,
      remotes: new Map(), closed: false, resume: null, ready: null };
    current = state;
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      state.ctx = new Context();
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
    room.onAudio = async packet => {
      if (state.closed || packet.byteLength !== 996) return;
      const id = String.fromCharCode(...new Uint8Array(packet, 0, 36));
      if (!room.players.some(p => p.id === id)) return;
      try {
        await state.ready;
        if (state.closed) return;
        let peer = state.remotes.get(id);
        if (!peer) {
          const node = new AudioWorkletNode(state.ctx, 'room-voice', {
            numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1],
            processorOptions: { capture: false },
          });
          const dest = state.ctx.createMediaStreamDestination();
          node.connect(dest);
          peer = { node, dest };
          state.remotes.set(id, peer);
          attach(id, dest.stream);
        }
        const pcm = packet.slice(36);
        peer.node.port.postMessage(pcm, [pcm]);
      } catch (e) { if (!state.closed) failed('Voice playback could not start.'); }
    };
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
    state.capture.port.onmessage = event => {
      if (state.closed || !stream.getAudioTracks().some(t => t.enabled && t.readyState === 'live')) return;
      // A stalled main thread can receive seconds of worklet messages at once.
      // Sending that backlog makes speech crawl long after rendering recovers.
      const packet = event.data;
      if (!packet || state.ctx.currentTime - packet.at > .12) return;
      room.sendAudio(packet.pcm);
    };
    state.source.connect(state.capture);
    // Capture emits silence here; connecting keeps the worklet processing.
    state.capture.connect(state.ctx.destination);
  }
  function detach(id) {
    const peer = current && current.remotes.get(id);
    if (!peer) return;
    peer.node.port.postMessage('stop'); peer.node.disconnect();
    peer.dest.stream.getTracks().forEach(t => t.stop());
    current.remotes.delete(id);
  }
  function stop() {
    const state = current;
    if (!state) return;
    state.closed = true;
    state.room.onAudio = null;
    for (const id of [...state.remotes.keys()]) detach(id);
    if (state.capture) { state.capture.port.postMessage('stop'); state.capture.disconnect(); }
    if (state.source) state.source.disconnect();
    if (state.resume) {
      document.removeEventListener('pointerdown', state.resume);
      document.removeEventListener('keydown', state.resume);
    }
    if (state.ctx) state.ctx.close().catch(() => {});
    current = null;
  }
  return { listen, publish, detach, stop };
})();

const assert = require('node:assert/strict');
const H = require('./harness');
const { test, atest, report } = H;

test('slow rendering preserves movement speed, limits physics steps and reduces pixels', () => {
  let next, renders = 0, distance = 0;
  class Renderer {
    setClearColor() {} setPixelRatio(v) { this.ratio = v; } setSize() {}
    render() { renders++; }
  }
  const ctx = H.load(['js/core/engine.js'], {
    THREE: { WebGLRenderer: Renderer }, GameState: { settings: { quality: 'medium' } },
    innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 2,
    addEventListener() {}, document: { hidden: false, addEventListener() {} },
    requestAnimationFrame(fn) { next = fn; },
  });
  const E = ctx.Engine; E.init({});
  assert.ok(E.size.w * E.size.h * E.size.dpr ** 2 <= 1600001);
  const initial = E.size.dpr;
  E.setView({ scene: {} }, dt => { assert.ok(dt <= .050001); distance += dt * 3.4; });
  E.start(); next(1000);
  for (let i = 1; i <= 30; i++) next(1000 + i * 100);
  assert.ok(Math.abs(distance - 10.2) < .001, '10fps movement covers three real seconds');
  assert.equal(renders, 31, 'only one draw per animation frame');
  assert.ok(E.size.dpr < initial, 'sustained slow frames reduce GPU work');
  const before = distance; next(14000);
  assert.ok(distance - before <= .681, 'long stalls cannot teleport');
});

test('voice capture skips silence and timestamps speech for stale-packet rejection', () => {
  const packets = [];
  const ctx = H.load(['js/core/voice-worklet.js'], {
    sampleRate: 48000, currentTime: 0, registerProcessor() {},
    AudioWorkletProcessor: class { constructor() { this.port = { postMessage: p => packets.push(p) }; } },
  });
  const capture = new ctx.RoomVoiceProcessor({ processorOptions: { capture: true } });
  const output = [[new Float32Array(128)]];
  function pump(value, frames) {
    for (let i = 0; i < frames; i++) {
      ctx.currentTime += 128 / 48000;
      capture.process([[new Float32Array(128).fill(value)]], output);
    }
  }
  pump(0, 100); assert.equal(packets.length, 0);
  pump(.1, 100); assert.ok(packets.length > 5);
  assert.ok(packets.every(p => p.pcm.byteLength === 960 && Number.isFinite(p.at)));
  pump(0, 150); const count = packets.length;
  pump(0, 100); assert.equal(packets.length, count, 'quiet microphones stop using bandwidth');
});

(async () => {
  await atest('late speech callbacks cannot restart a line after its deadline', async () => {
    const timers = new Map(), spoken = [];
    let id = 0;
    const voice = { voiceURI: 'local', name: 'Kate', lang: 'en-GB' };
    const ctx = H.load(['js/core/voice.js'], {
      GameState: { settings: {} }, SpeechSynthesisUtterance: class {},
      document: { getElementById: () => null, addEventListener() {} }, addEventListener() {},
      setTimeout(fn, ms) { timers.set(++id, { fn, ms }); return id; }, clearTimeout(n) { timers.delete(n); },
      setInterval() { return 1; }, clearInterval() {},
      speechSynthesis: { getVoices: () => [voice], addEventListener() {},
        speak(u) { spoken.push(u); }, cancel() {} },
    });
    ctx.Voice.init(); timers.clear();
    const finished = ctx.Voice.say('First sentence. Second sentence.');
    assert.equal(spoken.length, 1);
    spoken[0].onend(); // queued callback gets delayed behind the deadline
    const deadline = [...timers.values()].find(timer => timer.ms > 1000);
    const nextSentence = [...timers.values()].find(timer => timer.ms === 190);
    deadline.fn(); await finished; nextSentence.fn();
    assert.equal(spoken.length, 1);
  });
  await atest('voice capture backlog is discarded after a main-thread stall', async () => {
    const nodes = [], sent = [];
    let audio;
    class Context {
      constructor() { audio = this; this.currentTime = 10; this.audioWorklet = { addModule: async () => {} }; }
      resume() { return Promise.resolve(); }
      close() { return Promise.resolve(); }
      createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    }
    class Node {
      constructor() { this.port = { postMessage() {} }; nodes.push(this); }
      connect() {} disconnect() {}
    }
    const ctx = H.load(['js/core/server-audio.js'], { AudioContext: Context, AudioWorkletNode: Node,
      document: { addEventListener() {}, removeEventListener() {} } });
    const room = { sendAudio: packet => sent.push(packet) };
    ctx.ServerAudio.listen(room, () => {}, message => { throw new Error(message); });
    await ctx.ServerAudio.publish(room, { getAudioTracks: () => [{ enabled: true, readyState: 'live' }] });
    const pcm = new ArrayBuffer(960);
    nodes[0].port.onmessage({ data: { pcm, at: audio.currentTime - 3 } });
    assert.equal(sent.length, 0);
    nodes[0].port.onmessage({ data: { pcm, at: audio.currentTime - .02 } });
    assert.equal(sent.length, 1);
    ctx.ServerAudio.stop();
  });
  report();
})().catch(error => { console.error(error); process.exitCode = 1; });

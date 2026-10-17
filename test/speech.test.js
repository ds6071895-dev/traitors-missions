/* Speech ownership: no captions over Claudia, no early local-voice handoff,
   and no bot playback while a listener is still in the castle introduction. */
const H = require('./harness');
const { atest, test, eq, ok } = H;

function world() {
  let now = 0, serial = 0;
  const timers = new Map(), utterances = [], elements = new Map();
  const element = () => ({ textContent: '', style: {}, classList: { toggle() {}, remove() {} },
    play: () => Promise.resolve(), remove() {} });
  const document = {
    getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    createElement: element, body: { appendChild() {} }, addEventListener() {},
  };
  class FakeDate extends Date { static now() { return now; } }
  const ctx = H.load(['js/core/voice.js', 'js/core/scenes.js', 'js/scenes/tasks.js', 'js/core/voicechat.js'], {
    document, Date: FakeDate,
    setTimeout(fn, ms) { const id = ++serial; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    speechSynthesis: { getVoices: () => [{ name: 'Sonia', lang: 'en-GB' }], cancel() {}, addEventListener() {},
      speak(u) { utterances.push(u); } },
    SpeechSynthesisUtterance: function (text) { this.text = text; },
    GameState: { settings: {}, save() {} },
    AudioBus: { define() {}, play() {}, init() { return null; } },
    addEventListener() {},
    Session: { state: { day: 0, phase: 'tasks', players: [{ id: 'bot', bot: true }, { id: 'human' }] },
      alive: () => [{}, {}], myPrivate: () => ({ role: 'traitor', poison: { mine: true } }) },
    Party: { room: { server: true }, on() {} },
  });
  ctx.Voice.init();
  return {
    ctx, utterances, elements,
    step(ms) {
      const end = now + ms;
      while (now < end) {
        now += Math.min(10, end - now);
        for (const [id, timer] of [...timers]) if (timer.at <= now && timers.delete(id)) timer.fn();
      }
    },
  };
}

(async () => {
  await atest('Claudia hides old captions and late bot subtitles for her whole speech', async () => {
    const W = world();
    W.ctx.Voice.show('Morag', 'Look at this castle!');
    eq(W.elements.get('cine-sub').textContent, 'Look at this castle!');
    const speech = W.ctx.Voice.say('Welcome to the castle.', { speaker: 'Claudia' });
    eq(W.elements.get('cine-sub').textContent, '', 'her own subtitle is hidden');
    W.ctx.Voice.show('Fergus', 'A delayed bot caption');
    eq(W.elements.get('cine-sub').textContent, '', 'late captions cannot cover her');
    W.utterances[0].onend();
    W.step(10000);
    await speech;
    W.ctx.Voice.show('Morag', 'Your turn!');
    eq(W.elements.get('cine-sub').textContent, 'Your turn!', 'ordinary captions return afterwards');
  });

  await atest('a slow local voice retains the room until its last sentence finishes', async () => {
    const W = world();
    let finished = false;
    const speech = W.ctx.Voice.say('Hello. Welcome.').then(() => { finished = true; });
    W.step(5000);
    ok(W.ctx.Voice.speaking, 'the text clock alone cannot release the room');
    ok(!finished);
    W.utterances[0].onend();
    W.step(200);
    eq(W.utterances.length, 2, 'the remaining sentence is still queued');
    W.utterances[1].onend();
    W.step(200);
    await speech;
    ok(finished && !W.ctx.Voice.speaking, 'handoff follows the final utterance');
  });

  test('unscripted Claudia speech reserves subtitles and playback until the room-wide end signal', () => {
    const W = world();
    W.ctx.Voice.setHostSpeaking(true);
    W.step(10000);
    W.ctx.Voice.show('Morag', 'A late caption');
    eq(W.elements.get('cine-sub').textContent, '');
    ok(W.ctx.Voice.speaking, 'a guest holds the room while the live host speaks');
    W.ctx.Voice.setHostSpeaking(false);
    ok(!W.ctx.Voice.speaking);
    eq(W.ctx.Voice.sinceSpoke, 0, 'the after-speech pause starts at the actual end');
  });

  await atest('muted speech still finishes on its reading clock without showing subtitles', async () => {
    const W = world();
    W.ctx.Voice.setMuted(true);
    const speech = W.ctx.Voice.say('Welcome.');
    eq(W.elements.get('cine-sub').textContent, '');
    W.step(5000);
    await speech;
    ok(!W.ctx.Voice.speaking);
  });

  await atest('castle introduction waits for private instructions and every listener before opening bot chat', async () => {
    const W = world();
    const scene = new W.ctx.TasksScene();
    const lines = [];
    scene._say = async set => { lines.push(set); };
    let release;
    W.ctx.Scenes.barrier = key => {
      eq(key, 'tasksIntro:0');
      return new Promise(resolve => { release = resolve; });
    };
    const intro = scene._intro();
    await H.flush();
    eq(lines, ['tasksFirst', 'poisonYou']);
    ok(scene.botIntroPending, 'the intro owns the quiet gap while another listener finishes');
    release(true);
    await intro;
    ok(!scene.botIntroPending, 'bot conversation opens only after the shared barrier');
  });

  test('local playback gates bots during Claudia and ceremonies while keeping people audible', () => {
    const W = world();
    const audios = [];
    const create = W.ctx.document.createElement;
    W.ctx.document.createElement = () => { const el = create(); audios.push(el); return el; };
    W.ctx.ServerAudio = { listen(room, attach) { attach('bot', {}); attach('human', {}); } };
    W.ctx.VoiceChat.listen();
    W.step(4000);
    W.ctx.VoiceChat.refreshSpeechGate();
    eq(audios[0].muted, false);
    W.ctx.Voice.say('Listen carefully.');
    eq(audios[0].muted, true, 'an already-buffered bot is muted immediately');
    ok(!audios[1].muted, 'human microphones are unaffected');
    W.ctx.Voice.stop();
    W.ctx.Session.state.phase = 'hill';
    W.ctx.VoiceChat.refreshSpeechGate();
    eq(audios[0].muted, true, 'the hill stays quiet between lines too');
    W.ctx.Session.state.phase = 'tasks';
    W.step(4000);
    W.ctx.VoiceChat.refreshSpeechGate();
    eq(audios[0].muted, false, 'bot playback resumes after the handoff');
  });

  H.report();
})().catch(error => { console.error(error); process.exitCode = 1; });

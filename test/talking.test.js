/* Who is talking: a voice you can hear always has a name. The meters
   feed `VoiceChat.talking`, which lights the nametag over the head,
   moves the jaw and fills the chip at the top of the screen. */
const H = require('./harness');
const { test, eq } = H;

function world() {
  let now = 1000, pump = null, attach = null;
  const loud = new Map();            // peer id -> waveform RMS, 0..1
  const made = [];                   // every <audio> made, in order
  const document = {
    getElementById: () => null,
    createElement() {
      const el = { style: {}, volume: 1, muted: false, play: () => Promise.resolve(), remove() {} };
      made.push(el);
      return el;
    },
    body: { appendChild() {} }, addEventListener() {},
  };
  class FakeDate extends Date { static now() { return now; } }
  let meterFor = null;
  const audio = {
    createMediaStreamSource: () => ({ connect() {} }),
    createAnalyser() {
      const id = meterFor;
      return { fftSize: 2048, getFloatTimeDomainData(d) {
        const amplitude = loud.get(id) || 0;
        for (let i = 0; i < d.length; i++) d[i] = i % 2 ? amplitude : -amplitude;
      } };
    },
  };
  const bots = { speaking: null };
  const scenes = { botSpeechBlocked: false };
  const c = H.load(['js/core/voicechat.js'], {
    document, Date: FakeDate,
    setInterval(fn) { pump = fn; return 1; },
    MediaStream: function (tracks) { this.tracks = tracks; },
    AudioBus: { ctx: audio, init: () => audio },
    Session: { state: { players: [{ id: 'me', local: true }, { id: 'fergus', bot: true },
                                   { id: 'isla', bot: true }, { id: 'ann' }] } },
    Party: { room: { server: true }, selfId: () => 'me', on() {} },
    ServerAudio: { listen(room, fn) { attach = fn; } },
    Bots: bots, Scenes: scenes,
  });
  const VC = c.VoiceChat;
  VC.init();
  VC.listen();
  const join = (id, node = false) => {
    meterFor = id;
    if (node) {
      attach(id, { gain: { gain: { setTargetAtTime() {} } }, ctx: { currentTime: 0 },
                   analyser: audio.createAnalyser() });
      return;
    }
    attach(id, { getAudioTracks: () => [{}] });
    return made[made.length - 1];
  };
  return {
    VC, loud, bots, scenes, join,
    step(ms) { const end = now + ms; while (now < end) { now += 100; pump(); } },
  };
}

test('a loud voice is talking, held through the gap between words, then not', () => {
  const w = world();
  w.join('fergus');
  w.step(300);
  eq(w.VC.talking('fergus'), false, 'silent is not talking');
  w.loud.set('fergus', 0.09);
  w.step(200);
  eq(w.VC.talking('fergus'), true, 'talking after a sustained syllable');
  w.loud.set('fergus', 0);
  w.step(300);
  eq(w.VC.talking('fergus'), true, 'still talking across a breath');
  w.step(800);
  eq(w.VC.talking('fergus'), false, 'stopped once the sentence is over');
});

test('the loudest of two voices is named first', () => {
  const w = world();
  w.join('fergus'); w.join('isla');
  w.loud.set('fergus', 0.04); w.loud.set('isla', 0.11);
  w.step(200);
  eq(w.VC.talkers().join(','), 'isla,fergus');
});

test('a voice you cannot hear is not talking, even though its meter moves', () => {
  const w = world();
  const el = w.join('isla');
  w.loud.set('isla', 0.11);
  w.step(200);
  eq(w.VC.talking('isla'), true, 'heard while the room is open');
  w.scenes.botSpeechBlocked = true;      // the gate, while Claudia holds the room
  w.step(1000);
  eq(el.muted, true, 'the gate muted her');
  eq(w.VC.talking('isla'), false, 'gated under Claudia');
  w.scenes.botSpeechBlocked = false;
  el.volume = 0.02;                      // the far end of the castle
  w.step(1000);
  eq(w.VC.talking('isla'), false, 'out of earshot');
  el.volume = 0.6;
  w.step(200);
  eq(w.VC.talking('isla'), true, 'in the next room');
});

test('faint background noise never lights a player, on either audio transport', () => {
  for (const node of [false, true]) {
    const w = world();
    w.join('ann', node);
    for (const noise of [0.001, 0.004, 0.01]) {
      w.loud.set('ann', noise);
      w.step(2000);
      eq(w.VC.talking('ann'), false, 'quiet noise is not speech');
      eq(w.VC.talkers().length, 0, 'no speaking chip');
      eq(w.VC.loudest(), null, 'no camera focus for background noise');
    }
    w.loud.set('ann', 0.04);
    w.step(200);
    eq(w.VC.talking('ann'), true, 'normal voice still registers');
    w.loud.set('ann', 0.004);
    w.step(1000);
    eq(w.VC.talking('ann'), false, 'room noise cannot keep speech active');
  }
});

test('a brief click does not count as speech, but quiet syllables sustain a sentence', () => {
  const w = world();
  w.join('ann');
  w.loud.set('ann', 0.09);
  w.step(100);
  eq(w.VC.talking('ann'), false, 'one noisy sample is not enough');
  w.loud.set('ann', 0);
  w.step(200);
  w.loud.set('ann', 0.04);
  w.step(200);
  eq(w.VC.talking('ann'), true);
  w.loud.set('ann', 0.012);
  w.step(1000);
  eq(w.VC.talking('ann'), true, 'quieter words do not flicker off');
  w.loud.set('ann', 0.004);
  w.step(1000);
  eq(w.VC.talking('ann'), false);
});

test('an offline bot speaking through the synthesiser is talking by name', () => {
  const w = world();
  w.bots.speaking = 'fergus';
  eq(w.VC.talking('fergus'), true, 'named while it speaks');
  eq(w.VC.talkers().join(','), 'fergus');
  w.bots.speaking = null;
  eq(w.VC.talking('fergus'), false);
});

H.report();

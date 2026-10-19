/* Who is talking: a voice you can hear always has a name. The meters
   feed `VoiceChat.talking`, which lights the nametag over the head,
   moves the jaw and fills the chip at the top of the screen. */
const H = require('./harness');
const { test, eq } = H;

function world() {
  let now = 1000, pump = null, attach = null;
  const loud = new Map();            // peer id -> 0..255 across the voice band
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
      return { frequencyBinCount: 128, getByteFrequencyData(d) { d.fill(loud.get(id) || 0); } };
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
  const join = (id) => {
    meterFor = id;
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
  w.loud.set('fergus', 90);
  w.step(200);
  eq(w.VC.talking('fergus'), true, 'talking at the first loud syllable');
  w.loud.set('fergus', 0);
  w.step(300);
  eq(w.VC.talking('fergus'), true, 'still talking across a breath');
  w.step(800);
  eq(w.VC.talking('fergus'), false, 'stopped once the sentence is over');
});

test('the loudest of two voices is named first', () => {
  const w = world();
  w.join('fergus'); w.join('isla');
  w.loud.set('fergus', 40); w.loud.set('isla', 110);
  w.step(200);
  eq(w.VC.talkers().join(','), 'isla,fergus');
});

test('a voice you cannot hear is not talking, even though its meter moves', () => {
  const w = world();
  const el = w.join('isla');
  w.loud.set('isla', 110);
  w.step(100);
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
  w.step(100);
  eq(w.VC.talking('isla'), true, 'in the next room');
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

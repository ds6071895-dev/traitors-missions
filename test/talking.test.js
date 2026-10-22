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
  const session = { state: { players: [{ id: 'me', local: true }, { id: 'fergus', bot: true },
                                         { id: 'isla', bot: true }, { id: 'ann' }] } };
  const c = H.load(['js/core/voicechat.js'], {
    document, Date: FakeDate,
    setInterval(fn) { pump = fn; return 1; },
    MediaStream: function (tracks) { this.tracks = tracks; },
    AudioBus: { ctx: audio, init: () => audio },
    Session: session,
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
    VC, loud, bots, scenes, join, session,
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

/* Courtesy: at the table, whoever started talking first has the room,
   and anybody talking over them is turned down until they stop. */
test('at the table the first voice has the room and the one talking over it is turned down', () => {
  const w = world();
  w.session.state = { phase: 'table', players: ['me', 'ann', 'bob', 'fergus'].map(id =>
    ({ id, alive: true, local: id === 'me', bot: id === 'fergus' })) };
  const ann = w.join('ann'), bob = w.join('bob'), fergus = w.join('fergus');
  w.VC.setCourtesy(true);
  w.loud.set('ann', 0.09);
  w.step(300);
  eq(w.VC.holder, 'ann', 'the first voice has the room');
  w.loud.set('bob', 0.09);
  w.loud.set('fergus', 0.09);
  w.step(300);
  eq(w.VC.holder, 'ann', 'talking over her does not take it');
  eq([ann.volume, bob.volume, fergus.volume].map(v => +v.toFixed(2)).join(' '), '1 0.4 0.4',
     'a person and an AI talking over her are both turned down');
  w.VC.setVolume('bob', 0.5);
  eq(+bob.volume.toFixed(2), 0.2, 'on top of whatever distance does');
  w.loud.set('ann', 0);
  w.step(1000);
  eq(w.VC.holder, 'bob', 'when she stops, whoever is still going has it');
  eq(+bob.volume.toFixed(2), 0.5, 'and is back to full');
  w.loud.set('bob', 0); w.loud.set('fergus', 0);
  w.step(1000);
  eq(w.VC.holder, null, 'a quiet room belongs to nobody');
  eq(+ann.volume.toFixed(2) + ' ' + +fergus.volume.toFixed(2), '1 1', 'and nobody is turned down');
});

test('courtesy is only for the argument at the table, and only while it is on', () => {
  const w = world();
  w.session.state = { phase: 'tasks', players: ['me', 'ann', 'bob'].map(id => ({ id, alive: true, local: id === 'me' })) };
  const ann = w.join('ann'), bob = w.join('bob');
  w.VC.setCourtesy(true);
  w.loud.set('ann', 0.09); w.step(300);
  w.loud.set('bob', 0.09); w.step(300);
  eq(w.VC.holder, null, 'a scene that ended mid-argument does not carry it into the castle');
  eq(bob.volume, 1);
  w.session.state.phase = 'table';
  w.step(200);
  eq(w.VC.holder, 'ann');
  w.VC.setCourtesy(false);
  eq(w.VC.holder + ' ' + bob.volume, 'null 1', 'switched off, everybody is back at once');
  void ann;
});

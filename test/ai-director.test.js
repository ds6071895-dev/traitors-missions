/* ------------------------------------------------------------------
   ai-director.test.js — the AIs talking back, the way a room does.

   Say something to the room and somebody answers; often somebody else
   picks it up, and with a crowd sometimes a third. Never two at once,
   alternate opportunities for remarks to the room, occasional assertive
   turns and a protected opening before sustained speech can interrupt.
   By day, only the AIs in earshot hear you at all.

   The bridge to Deepgram is faked to the calls the director makes; the
   session is the real one; the clock is this file's.
------------------------------------------------------------------ */
const H = require('./harness');
const { test, eq, ok, section } = H;

const FILES = ['js/core/util.js', 'js/core/state.js', 'js/world/castle-layout.js', 'js/core/chores.js',
               'js/core/session.js', 'js/scenes/claudia-lines.js', 'js/core/castle-net.js', 'js/core/ai-director.js'];

function world(opts = {}) {
  let now = 1.7e12;
  class FakeDate extends Date {
    constructor(...a) { if (a.length) super(...a); else super(now); }
    static now() { return now; }
  }
  const intervals = [];
  const timeouts = [];
  let seq = opts.random || [0.1];
  let ri = 0;
  const math = Object.create(Math);
  math.random = () => seq[(ri++) % seq.length];
  const listeners = {};
  const asked = [];                // [{ id, text, at }]
  const prompts = [];              // [{ id, text }]
  const netHandlers = [];
  const speaking = new Set();
  const AI = {
    CLAUDIA: 'claudia-id', available: true, ready: true,
    agent: () => ({}), spawn() {}, prompt(id, text) { prompts.push({ id, text }); }, listen() {}, say() {}, tool() {},
    ask(id, text) { asked.push({ id, text, at: now }); speaking.add(id); },
    hush(id) { speaking.delete(id); },
    speaking: (id) => speaking.has(id),
    on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); return () => {}; },
  };
  const ctx = H.load(FILES, {
    Date: FakeDate, Math: math,
    setInterval: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; },
    clearInterval: () => {},
    setTimeout: (fn, ms) => { timeouts.push({ fn, at: now + ms }); return timeouts.length; },
    clearTimeout: () => {},
    AI,
    Net: { on: (fn) => { netHandlers.push(fn); return () => {}; }, send() {} },
    VoiceChat: { levels: new Map(), selfLevel: 0 },
    Voice: { speaking: false },
  });
  ctx.GameState.load();
  const players = [
    { id: 'p1', name: 'Ana', local: true }, { id: 'p2', name: 'Bo' },
    { id: 'm', name: 'Morag', bot: true }, { id: 'f', name: 'Fergus', bot: true },
    { id: 'i', name: 'Isla', bot: true }, { id: 's', name: 'Struan', bot: true },
  ].slice(0, opts.n || 6);
  ctx.Session.startParty({ seed: opts.seed || 7, players, mode: 'host' });
  ctx.Session.state.phase = opts.phase || 'breakfast';
  ctx.AIDirector.start();
  function emit(evt, m) { (listeners[evt] || []).forEach(fn => fn(m)); }
  const W = {
    ctx, asked, speaking, prompts, emit,
    net(e) { netHandlers.forEach(fn => fn(e)); },
    step(sec) {
      const end = now + sec * 1000;
      while (now < end) {
        now += 100;
        for (const t of timeouts.splice(0)) { if (t.at <= now) t.fn(); else timeouts.push(t); }
        intervals.forEach(t => { if (now % t.ms < 100) t.fn(); });
      }
    },
    say(id, text) { emit('hearing', { id }); emit('heard', { id, text, final: true }); },
    /* An AI that was asked finishes speaking: the bridge says what it
       said, then that it is done. */
    reply(id, text) {
      emit('text', { id, text: text || 'Aye.' });
      speaking.delete(id);
      emit('done', { id });
    },
    set phase(p) { ctx.Session.state.phase = p; },
  };
  return W;
}

section('ai — answering the room');

test('bots stay silent throughout the hill and the first castle introduction', () => {
  const W = world({ phase: 'hill' });
  W.say('p1', 'Morag, hello!');
  W.step(10);
  eq(W.asked.length, 0, 'even a named bot waits through the welcome');
  W.phase = 'tasks';
  W.net({ type: 'phase' });
  W.ctx.Scenes = { botSpeechBlocked: true, performing: false };
  W.say('p1', 'Morag, what do you think?');
  W.step(8);
  eq(W.asked.length, 0, 'the castle intro includes its quiet gaps');
  W.ctx.Scenes.botSpeechBlocked = false;
  W.step(5);
  eq(W.asked.length, 1, 'conversation begins after the introduction and a breath');
});

test('unsolicited replies use alternate opportunities while direct questions always get answers', () => {
  const W = world({ random: [0.9] });
  W.say('p1', 'This castle is huge');
  W.step(1.5);
  eq(W.asked.length, 1);
  W.reply(W.asked[0].id);
  W.step(9);
  W.say('p1', 'The staircase is spooky');
  W.step(2);
  eq(W.asked.length, 1, 'leave the second remark to the humans');
  W.step(9);
  W.say('p1', 'I like the suits of armour');
  W.step(2);
  eq(W.asked.length, 2, 'join the third remark');
  W.reply(W.asked[1].id);
  W.say('p1', 'Morag, what do you reckon?');
  W.step(2);
  eq(W.asked.length, 3, 'a direct question bypasses the alternating rhythm');
});

test('Claudia blocks assigned turns as well as queued ballot decisions', () => {
  const W = world();
  W.phase = 'finale';
  const s = W.ctx.Session.state;
  s.floor = { playerId: 'm', done: false, endsAt: 123 };
  W.ctx.Voice.speaking = true;
  W.step(5);
  eq(W.asked.length, 0, 'an assigned floor cannot bypass Claudia');
  W.ctx.Voice.speaking = false;
  W.step(5);
  eq(W.asked.length, 1, 'the floor starts when she has finished');
  W.ctx.Voice.speaking = true;
  W.ctx.AIDirector.pauseBots();
  ok(!W.speaking.has('m'), 'even an uninterruptible floor gives way to Claudia');
  W.ctx.Voice.speaking = false;
  W.step(5);
  eq(W.asked.length, 2, 'the interrupted floor can resume');
  W.reply('m');
  s.floor = null;
  s.finale = { stage: 'name', round: 0, nameRound: 0, names: {}, votes: {} };
  W.step(1);
  const count = W.asked.length;
  W.ctx.Voice.speaking = true;
  W.ctx.AIDirector.pauseBots();
  W.step(5);
  eq(W.asked.length, count, 'already queued decisions also wait');
  s.finale.stage = 'reveal';
  W.ctx.Voice.speaking = false;
  W.step(6);
  eq(W.asked.length, count, 'stale decision requests do not play after the vote');
});

test('personalities invite human interaction and Traitors are coached to plant grounded doubts', () => {
  const W = world({ seed: 1 });
  const prompts = W.prompts.filter(p => p.id !== 'claudia-id');
  ok(prompts.every(p => /YOUR PERSONALITY:/.test(p.text) && /sometimes ask them a short question/.test(p.text)), 'personality and interactive cues');
  ok(new Set(prompts.map(p => p.text.match(/YOUR PERSONALITY: (.*)/)[1])).size > 1, 'different contestants have different personalities');
  ok(prompts.some(p => /SECRET: You are a TRAITOR/.test(p.text) && /actively plant seeds of doubt/.test(p.text)), 'Traitors have a social strategy');
  W.phase = 'table';
  W.ctx.Session.state.floor = { all: true, done: false, ready: [] };
  const traitor = W.ctx.Session.state.players.find(p => p.bot && W.ctx.Session.privateView(p.id).role === 'traitor');
  ok(traitor, 'the seeded cast has a Traitor bot');
  W.say('p1', traitor.name + ', do you believe Bo?');
  W.step(2);
  ok(/plant one believable seed of doubt/.test(W.asked[0].text), 'the actual table turn reinforces the strategy');
});

test('a remark to the room gets an answer, from one of them, after a breath', () => {
  const W = world();
  W.say('p1', 'This castle is SO cool');
  W.step(0.3);
  eq(W.asked.length, 0, 'nobody cuts in mid-breath');
  W.step(1.2);
  eq(W.asked.length, 1, 'one of them answers');
  ok(/Ana just said/.test(W.asked[0].text) && /This castle is SO cool/.test(W.asked[0].text), 'to what was said');
});

test('microphone noise cannot starve a direct reply or the open discussion', () => {
  const W = world();
  W.ctx.VoiceChat.selfLevel = 0.4;
  W.ctx.VoiceChat.levels.set('p2', 0.6);
  W.say('p1', 'Morag, what do you think?');
  W.step(0.6);
  eq(W.asked.length, 1, 'recognized words get a prompt reply despite noisy microphones');
  eq(W.asked[0].id, 'm');
  W.reply('m');
  W.phase = 'table';
  W.ctx.Session.state.floor = { all: true, done: false, ready: [] };
  W.step(6);
  ok(W.asked.length > 1, 'background noise cannot keep the open table silent either');
});

test('empty events and filler sounds neither cancel nor postpone an AI reply', () => {
  const W = world();
  W.say('p1', 'Morag, can you hear me?');
  for (let i = 0; i < 6; i++) {
    W.emit('hearing', { id: 'p2' });
    W.emit('hearing', { id: 'p2', text: 'Um...' });
    W.emit('heard', { id: 'p2', text: 'Hmm.', final: true });
    W.step(0.1);
  }
  eq(W.asked.length, 1, 'small sounds do not reset the response timer');
  eq(W.asked[0].id, 'm', 'the original question is still answered');
  ok(W.speaking.has('m'), 'small sounds do not cut the answer off');
});

test('sustained speech can interrupt after the protected opening, via either transcript event', () => {
  for (const event of ['hearing', 'heard']) {
    const W = world();
    W.say('p1', 'Morag, what do you think?');
    W.step(0.6);
    ok(W.speaking.has('m'));
    W.emit('speaking', { id: 'm' });
    W.step(2);
    W.emit(event, { id: 'p2', text: 'No!', final: true });
    ok(W.speaking.has('m'), 'one overlapping word does not cancel the turn');
    W.step(0.6);
    W.emit(event, { id: 'p2', text: 'No, I disagree with that theory.', final: true });
    ok(!W.speaking.has('m'), 'continued speech can take the room via ' + event);
  }
});

test('the protected opening starts at actual audio and is not renewed by later audio segments', () => {
  const W = world();
  W.say('p1', 'Morag, what do you think?');
  W.step(0.6);
  for (let i = 0; i < 15; i++) {
    W.emit('hearing', { id: 'p2', text: 'I have another theory about the timing' });
    W.step(0.2);
  }
  ok(W.speaking.has('m'), 'generation latency cannot use up the opening');
  W.emit('speaking', { id: 'm' });
  for (let i = 0; i < 8; i++) {
    W.emit('hearing', { id: 'p2', text: 'I have another theory about the timing' });
    W.step(0.2);
  }
  ok(W.speaking.has('m'), 'the voice gets its opening despite continuing overlap');
  W.emit('speaking', { id: 'm' });
  W.step(0.2);
  W.emit('hearing', { id: 'p2', text: 'Please listen to my explanation' });
  ok(!W.speaking.has('m'), 'later segments cannot keep renewing protection');
});

test('separate brief interjections do not accumulate into a sustained interruption', () => {
  const W = world();
  W.say('p1', 'Morag, what do you think?');
  W.step(0.6);
  W.emit('speaking', { id: 'm' });
  W.step(2);
  for (let i = 0; i < 3; i++) {
    W.emit('hearing', { id: 'p2', text: 'Yes' });
    W.emit('heard', { id: 'p2', text: 'Yes', final: true });
    W.step(1.4);
  }
  ok(W.speaking.has('m'), 'scattered acknowledgements leave the AI speaking');
});

test('repeated recognition of one phrase does not count as continued human speech', () => {
  const W = world();
  W.say('p1', 'Morag, what do you think?');
  W.step(0.6);
  W.emit('speaking', { id: 'm' });
  W.step(2);
  W.emit('hearing', { id: 'p2', text: 'I disagree with that' });
  W.step(0.6);
  W.emit('heard', { id: 'p2', text: 'I disagree with that.', final: true });
  ok(W.speaking.has('m'), 'the final result repeats the interim; it is not another spoken phrase');
  W.step(0.2);
  W.emit('hearing', { id: 'p2', text: 'I disagree with that because Bo was in the kitchen' });
  ok(!W.speaking.has('m'), 'new words still allow a genuine interruption');
});

test('short acknowledgements cannot cut off a contestant mid-sentence', () => {
  const W = world();
  W.say('p1', 'Morag, what do you think?');
  W.step(0.6);
  W.emit('speaking', { id: 'm' });
  W.step(2);
  W.emit('hearing', { id: 'p2', text: 'Yes' });
  W.step(0.6);
  W.emit('heard', { id: 'p2', text: 'Yes, right.', final: true });
  ok(W.speaking.has('m'), 'a brief acknowledgement is not taking over the room');
});

/* The words arrive a second or more after they are said, and in bursts;
   the meters are live. A reply waits on the meters, and one that took
   so long to write that the person has started again is never heard. */
function metered(W) {
  const on = new Map();                     // id -> how long this stretch has run, ms
  W.ctx.VoiceChat.voiced = (id) => on.has(id);
  W.ctx.VoiceChat.voicedFor = (id) => on.get(id) || 0;
  return on;
}

test('a person still talking between transcripts is not talked over', () => {
  const W = world();
  const voice = metered(W);
  W.say('p1', 'Morag, what do you think of');
  voice.set('p1', 800);
  W.step(3);
  eq(W.asked.length, 0, 'the meter says she is still going');
  voice.delete('p1');
  W.step(1.5);
  eq(W.asked.length, 1, 'answered once she stops');
});

test('a reply that would start over somebody is dropped, and they are answered when they stop', () => {
  const W = world();
  const voice = metered(W);
  W.say('p1', 'Morag, what do you think?');
  W.step(0.6);
  eq(W.asked.length, 1);
  voice.set('p1', 300);                     // she carries on while Morag is thinking
  W.emit('speaking', { id: 'm' });
  ok(!W.speaking.has('m'), 'Morag does not start over her');
  W.say('p1', 'About the letter, I mean.');
  W.step(3);
  eq(W.asked.length, 1, 'not while she is talking');
  voice.delete('p1');
  W.step(1.5);
  eq(W.asked.length, 2, 'then Morag answers');
  eq(W.asked[1].id, 'm');
  ok(/what do you think\?.*About the letter/.test(W.asked[1].text), 'the whole of what she said');
});

test('a noisy microphone with no words in it does not silence the AIs', () => {
  const W = world();
  const voice = metered(W);
  voice.set('p2', 6000);                    // a fan, a television
  W.say('p1', 'Morag, what do you think?');
  W.step(1.5);
  eq(W.asked.length, 1);
  W.emit('speaking', { id: 'm' });
  ok(W.speaking.has('m'), 'and the reply is spoken');
});

test('assigned AI turns hold their floor against human speech', () => {
  const W = world({ phase: 'finale' });
  W.ctx.Session.state.floor = { playerId: 'm', done: false, endsAt: 123 };
  W.step(0.4);
  W.emit('speaking', { id: 'm' });
  for (let i = 0; i < 20; i++) {
    W.say('p2', 'I would like to speak instead');
    W.step(0.2);
  }
  ok(W.speaking.has('m'), 'a dedicated floor lasts until the contestant finishes');
});

test('an AI occasionally cuts into continuing speech, with space between assertive turns', () => {
  const W = world({ random: [0.1] });
  function talking(seconds) {
    for (let i = 0; i < seconds * 5; i++) {
      W.say('p1', 'The timing of that handover does not add up');
      W.step(0.2);
    }
  }
  talking(5.8);
  eq(W.asked.length, 0, 'the human gets time to make their point first');
  talking(2.2);
  eq(W.asked.length, 1, 'the AI can join without waiting for silence');
  ok(/Briefly cut in/.test(W.asked[0].text), 'the interjection is prompted as a short relevant point');
  W.emit('speaking', { id: W.asked[0].id });
  talking(1);
  ok(W.speaking.has(W.asked[0].id), 'the interjection is not immediately cancelled by the ongoing voice');
  W.reply(W.asked[0].id, 'That handover happened before the bell.');
  talking(11);
  eq(W.asked.length, 1, 'the AI leaves space before cutting in again');
  talking(5);
  eq(W.asked.length, 2, 'another assertive turn can happen later');
});

test('cutting in is occasional and respects Claudia and human-only floors', () => {
  for (const mode of ['unlucky', 'claudia', 'floor']) {
    const W = world({ random: [mode === 'unlucky' ? 0.9 : 0.1] });
    if (mode === 'claudia') W.ctx.Voice.speaking = true;
    if (mode === 'floor') W.ctx.Session.state.floor = { playerId: 'p2', done: false };
    for (let i = 0; i < 50; i++) {
      W.say('p1', 'The timing of that handover does not add up');
      W.step(0.2);
    }
    eq(W.asked.length, 0, 'no assertive turn during ' + mode);
  }
});

test('ongoing recognized speech holds the room until a short pause', () => {
  const W = world();
  W.say('p1', 'Morag, what do you think?');
  for (let i = 0; i < 8; i++) {
    W.emit('hearing', { id: 'p1', text: 'I am still explaining my theory' });
    W.step(0.2);
  }
  eq(W.asked.length, 0, 'a continuing sentence is not talked over');
  W.step(0.4);
  eq(W.asked.length, 1, 'the answer follows a short pause');
});

test('one occasional follow-up picks it up, then leaves room for the humans', () => {
  // a low random number says "yes" to every chance of another voice
  const W = world({ random: [0.05] });
  W.say('p1', 'This castle is SO cool');
  W.step(1.5);
  eq(W.asked.length, 1, 'the first');
  W.step(3);
  eq(W.asked.length, 1, 'nobody else while the first is still talking');
  W.reply(W.asked[0].id, 'It is a bit grand, aye.');
  W.step(0.3);
  eq(W.asked.length, 1, 'a beat between them');
  W.step(1.5);
  eq(W.asked.length, 2, 'then a second');
  ok(W.asked[1].id !== W.asked[0].id, 'a different voice');
  ok(/It is a bit grand/.test(W.asked[1].text), 'that heard the first');
  W.reply(W.asked[1].id, 'Wait till you see the turret.');
  W.step(2);
  eq(W.asked.length, 2, 'two voices are enough, even with a crowd');
  eq(new Set(W.asked.map(a => a.id)).size, 2, 'two different voices');
  W.step(5);
  eq(W.asked.length, 2, 'and then it lets the room breathe');
});

test('with few AIs in the room, it stops at two', () => {
  const W = world({ random: [0.05], n: 4 });   // Ana, Bo, Morag, Fergus
  W.say('p1', 'Lovely day for it');
  W.step(1.5);
  W.reply(W.asked[0].id);
  W.step(2);
  W.reply(W.asked[1].id);
  W.step(4);
  eq(W.asked.length, 2, 'two of two');
});

test('the moment a person speaks, the follow-ups stop and the AIs listen', () => {
  const W = world({ random: [0.05] });
  W.say('p1', 'Has anybody seen the turret?');
  W.step(1.5);
  W.reply(W.asked[0].id, 'Up the stair.');
  W.step(0.2);
  W.say('p2', 'I went up, it is tiny');
  W.step(0.3);
  eq(W.asked.length, 1, 'nobody talks over Bo');
  W.step(1.5);
  eq(W.asked.length, 1, 'two people are talking to each other: the AIs keep out of it');
  W.step(4);
  eq(W.asked.length, 1, 'this is the alternate opportunity: leave it to the people');
  W.say('p2', 'Morag, did you go up there?');
  W.step(1.5);
  eq(W.asked.length, 2, 'a direct question still gets an answer');
  ok(/Bo just said/.test(W.asked[1].text));
});

test('people talking among themselves are not talked over, but are listened to', () => {
  const W = world();
  W.say('p1', 'Bo what did you make of the library?');
  W.step(0.5);
  W.say('p2', 'Honestly I thought it was creepy');
  W.step(0.5);
  eq(W.asked.length, 0, 'no AI cuts in on a conversation between people');
  W.step(3);
  ok(W.asked.length <= 1, 'at most one joins, after a real gap');
  // every word went into what they know
  W.step(25);
  ok(W.prompts.some(x => /creepy/.test(x.text)), 'they heard every word');
});

test('an AI that is named is answered even in a conversation between people', () => {
  const W = world();
  W.say('p2', 'I reckon it was the cook');
  W.step(0.2);
  W.say('p1', 'Morag, what do you think?');
  W.step(1.5);
  eq(W.asked.length, 1, 'she answers at once');
  eq(W.asked[0].id, 'm');
});

test('their own voices coming back through a microphone are not a person talking', () => {
  const W = world({ random: [0.05] });
  W.say('p1', 'Has anybody seen the turret?');
  W.step(1.5);
  const id = W.asked[0].id;
  W.emit('text', { id, text: 'It is up the long stair past the kitchen.' });
  W.emit('hearing', { id: 'p1', text: 'up the long stair past the kitchen' });
  W.emit('heard', { id: 'p1', text: 'up the long stair past the kitchen', final: true });
  ok(W.speaking.has(id), 'the speaker is not cut off by its own echo');
});

test('short echoes from the current AI line do not become human conversation', () => {
  const W = world({ random: [0.9] });
  W.say('p1', 'Morag, where was Bo?');
  W.step(0.6);
  W.emit('speaking', { id: 'm' });
  W.emit('text', { id: 'm', text: 'Bo was standing by the kitchen door before the bell.' });
  W.step(2);
  W.say('p2', 'kitchen door');
  W.reply('m');
  W.step(3);
  eq(W.asked.length, 1, 'a two-word speaker echo is not answered as a new human remark');
});

test('nobody talks over Claudia, and one already talking gives way', () => {
  const W = world();
  W.ctx.Voice.speaking = true;
  W.say('p1', 'Has anybody seen the turret?');
  W.step(3);
  eq(W.asked.length, 0, 'they wait while she speaks');
  W.ctx.Voice.speaking = false;
  W.step(1.5);
  eq(W.asked.length, 0, 'and a few seconds after she stops, not the instant she does');
  W.step(3);
  eq(W.asked.length, 1, 'then they answer');
  W.ctx.Voice.speaking = true;
  W.step(1);
  ok(!W.speaking.has(W.asked[0].id), 'and an AI mid-sentence stops for her');
});

test('the silent gaps inside her ceremony are still hers', () => {
  const W = world({ scenes: true });
  W.ctx.Scenes = { performing: true };
  W.say('p1', 'Has anybody seen the turret?');
  W.step(6);
  eq(W.asked.length, 0, 'between two of her sentences nobody cuts in');
  W.ctx.Scenes.performing = false;
  W.step(5);
  eq(W.asked.length, 1, 'they answer once the ceremony and its pause are over');
});

test('at the round table nobody starts talking before she has opened the floor', () => {
  const W = world();
  W.phase = 'table';
  W.ctx.Session.state.finale = null;          // no ballot cues to muddy the water
  W.say('p1', 'Has anybody seen the turret?');
  W.step(8);
  ok(!W.asked.some(a => /Ana just said/.test(a.text)), 'the table is not open yet');
  W.ctx.Session.state.floor = { all: true, done: false, ready: [], endsAt: Date.now() + 90000 };
  W.say('p1', 'Has anybody seen the turret?');
  W.step(6);
  ok(W.asked.some(a => /Ana just said/.test(a.text)), 'once she has opened it, they answer');
});

test('a refused turn gives the room back instead of holding it for half a minute', () => {
  const W = world({ random: [0.9] });
  W.say('p1', 'Has anybody seen the turret?');
  W.step(1.5);
  eq(W.asked.length, 1);
  W.emit('refused', { id: W.asked[0].id, final: true });
  W.say('p1', 'Fergus, hello?');
  W.step(2);
  eq(W.asked.length, 2, 'somebody else answers straight away');
});

section('ai — the open table, and what they remember');

test('at the open table, a person who speaks gets an answer', () => {
  const W = world();
  W.phase = 'table';
  W.ctx.Session.state.floor = { all: true, done: false, ready: [], endsAt: Date.now() + 90000 };
  W.say('p1', 'I think Fergus has been very quiet');
  W.step(1.5);
  eq(W.asked.length, 1, 'one of them answers');
  ok(/Ana just said/.test(W.asked[0].text), 'to what was said');
});

test('every voice is told the whole game, not just the last few lines', () => {
  const W = world();
  const pl = W.ctx.Session.state.players;
  W.net({ type: 'nameReveal', playerId: 'm', targetId: 'f' });
  W.ctx.Session.state.banished.push({ id: 'f', name: 'Fergus', day: 0, role: 'faithful' });
  W.net({ type: 'reveal', name: 'Fergus', role: 'faithful' });
  // a long argument afterwards pushes those events far out of the recent lines
  for (let k = 0; k < 120; k++) W.say('p1', 'filler talk number ' + k + ' about nothing at all');
  W.step(25);
  const last = W.prompts.filter(x => x.id === 'i').pop();
  ok(last, 'a prompt was sent');
  ok(/Morag voted for Fergus/.test(last.text), 'who voted for whom is still there');
  ok(/Fergus was banished and revealed as a Faithful/.test(last.text), 'and what the banished turned out to be');
  ok(/STRATEGY/.test(last.text), 'and how to play to win');
  ok(/YOUR READ ON THE OTHERS/.test(last.text), 'and a read on everybody');
  ok(/Morag \+3/.test(last.text), 'a vote for somebody who was Faithful counts against Morag');
});
test('whoever is named answers', () => {
  const W = world();
  W.say('p1', 'Isla, where were you just now?');
  W.step(1.5);
  eq(W.asked[0].id, 'i', 'Isla');
  ok(/to you/.test(W.asked[0].text), 'and knows it was to her');
});

test('a remark to another person by name is left to them', () => {
  const W = world();
  W.say('p1', 'Bo, come and look at this');
  W.step(3);
  eq(W.asked.length, 0, 'nobody butts in on Ana and Bo');
});

test('a name inside another word is not a name', () => {
  const W = world();
  const m = W.ctx.AIDirector.mentions;
  ok(!m('Has anybody seen the turret?', 'Bo'), 'anybody is not Bo');
  ok(!m('I will grab a coffee', 'Rab'), 'grab is not Rab');
  ok(m('Bo, come here', 'Bo'), 'but Bo is Bo');
  ok(m("That's Morag's chair", 'Morag'), 'and a possessive still counts');
  ok(m('I think Vari is lying', 'Mhairi'), 'and the transcriber\'s spelling still counts');
});

section('ai — by day, only those in earshot');

test('calling a nearby contestant by name during jobs gets an answer, including a repeated call', () => {
  const W = world({ phase: 'tasks', random: [0.9] });
  const N = W.ctx.CastleNet;
  N.start('d0');
  N.publish('p1', 0, 10, 0);
  N.publish('m', 1, 10, 0);
  for (const id of ['p2', 'f', 'i', 's']) N.publish(id, 0, -22, 0);
  W.say('p1', 'Morag!');
  W.step(1.5);
  eq(W.asked.length, 1);
  eq(W.asked[0].id, 'm');
  ok(/to you: "Morag!"/.test(W.asked[0].text), 'the short call is addressed to her');
  W.reply('m', 'Hello Ana.');
  W.say('p1', 'Morag, can you hear me?');
  W.step(1.5);
  eq(W.asked.length, 2, 'a direct call is not swallowed by a cooldown or alternate-comment rule');
  eq(W.asked[1].id, 'm');
});

test('job-time visits are occasional across the cast and do not crowd the same person', () => {
  const W = world({ phase: 'tasks' });
  const visits = [];
  W.ctx.CastleBots = { running: true, canApproach: () => true,
    approach(id, target) { visits.push({ id, target }); return true; } };
  const N = W.ctx.CastleNet;
  N.start('d0');
  N.publish('p1', 0, 10, 0);
  N.publish('p2', 0, -25, 0);
  // each at their own job, too far apart to chat among themselves
  [['m', 5, 10], ['f', 12, 10], ['i', 19, 10], ['s', 5, 17]].forEach(([id, x, z]) => N.publish(id, x, z, 0));
  W.net({ type: 'phase' });
  W.step(39);
  eq(visits.length, 0, 'no immediate rush after entering the castle');
  W.step(2);
  eq(visits.length, 1, 'one bot takes an occasional detour');
  eq(W.asked.length, 0, 'walking over does not speak from across the room');
  W.step(50);
  eq(visits.length, 1, 'the next opportunity is left quiet');
  W.step(31);
  eq(visits.length, 2, 'another visit can happen much later');
});

test('an arriving Traitor shares real observations and uses conversation as poison cover', () => {
  const W = world({ phase: 'tasks', seed: 1 });
  const N = W.ctx.CastleNet;
  N.start('d0');
  N.publish('p1', 0, 10, 0);
  N.publish('i', 6, 10, 0);
  W.step(1);
  ok(!W.ctx.AIDirector.startEncounter('i', 'p1'), 'must walk over before speaking');
  N.publish('i', 1.2, 10, 0);
  const privateView = W.ctx.Session.privateView;
  W.ctx.Session.privateView = id => {
    const v = privateView(id);
    return id === 'i' ? Object.assign({}, v, { notes: [{ kind: 'handover', day: 0, t: 25, a: 'f', b: 'm', room: 'hall' }] }) : v;
  };
  let spoken = 0;
  ok(W.ctx.AIDirector.startEncounter('i', 'p1', () => spoken++));
  const cue = W.asked[0].text;
  ok(/Fergus hand something to Morag/.test(cue), 'the actual sighting is in the prompt');
  ok(/never invent a sighting/.test(cue));
  ok(/plant a subtle seed of doubt/.test(cue), 'Traitors can steer the private chat');
  ok(/keep them chatting while you get close enough to slip the poison/.test(cue));
  eq(spoken, 0, 'an unfinished generation is not yet conversation cover');
  W.emit('text', { id: 'i', text: 'Ana, did you see Fergus with that envelope?' });
  eq(spoken, 1, 'the movement controller is told once the bot actually has words');
});

test('in the castle, an AI three rooms away never hears you', () => {
  const W = world();
  W.phase = 'tasks';
  const N = W.ctx.CastleNet;
  N.start('d0');
  N.publish('p1', 0, -22, 0);        // Ana in the turret
  N.publish('p2', 16, 13.5, 0);      // Bo in the corridor
  for (const id of ['m', 'f', 'i', 's']) N.publish(id, -16, 7, 0);   // the AIs in the great hall
  W.say('p1', 'Anybody up here?');
  W.step(3);
  eq(W.asked.length, 0, 'not a word: nobody could hear her');
  N.publish('f', 1, -22, 0);         // Fergus comes up the stair
  W.say('p1', 'Anybody up here?');
  W.step(2);
  eq(W.asked.length, 1, 'Fergus, now he is there');
  eq(W.asked[0].id, 'f');
  ok(/castle doing your jobs/.test(W.asked[0].text), 'and knows where he is');
});

test('in the castle, an AI the other side of a shut door hears nothing — until it is opened', () => {
  const W = world();
  W.phase = 'tasks';
  W.ctx.Session.state.phase = 'tasks';
  const N = W.ctx.CastleNet;
  const d = W.ctx.CastleLayout.doorById('chapel');
  N.start('d0');
  N.publish('p1', d.x, d.z - 1.2, 0);         // Ana, just inside the chapel
  N.publish('p2', 16, 13.5, 0);
  N.publish('f', d.x, d.z + 1.2, 0);          // Fergus in the library, two metres away
  for (const id of ['m', 'i', 's']) N.publish(id, -16, 7, 0);
  W.ctx.Session.state.doors = { chapel: 1 };
  W.say('p1', 'Is anybody out there?');
  W.step(3);
  eq(W.asked.length, 0, 'not a word through the door');
  W.ctx.Session.state.doors = {};
  W.say('p1', 'Is anybody out there?');
  W.step(2);
  eq(W.asked.map(a => a.id), ['f'], 'Fergus, with the door open');
});

section('ai — the dead stay dead');

function kill(W, id, how) {
  const s = W.ctx.Session.state, p = W.ctx.Session.playerById(id);
  p.alive = false;
  if (how === 'murdered') s.murdered.push({ id, name: p.name, day: s.day });
  else s.banished.push({ id, name: p.name, day: s.day, role: how });
}
const latest = (W, id) => W.prompts.filter(p => p.id === id).slice(-1)[0].text;

test('a dead AI never answers its name, and every turn says who is gone', () => {
  const W = world();
  kill(W, 'm', 'murdered');
  W.say('p1', 'Morag, are you there?');
  W.step(2);
  ok(!W.asked.some(a => a.id === 'm'), 'Morag does not answer from the grave');
  W.say('p1', 'Fergus, where were you last night?');
  W.step(2);
  const turn = W.asked.find(a => a.id === 'f');
  ok(turn, 'Fergus answers his name');
  ok(/GONE for good/.test(turn.text) && /Morag \(poisoned on day 1, a Faithful\)/.test(turn.text), 'his turn says who is gone, and how');
  ok(/Still playing: Ana, Bo, Fergus, Isla, Struan\./.test(turn.text), 'and who is still here');
  ok(/never speak to them/.test(latest(W, 'f')), 'the prompt forbids talking to the gone');
});

test('words from somebody since gone are marked, and a dead voice adds nothing new', () => {
  const W = world();
  W.say('p1', 'Morag, what do you reckon?');
  W.step(2);
  W.reply('m', 'I reckon Bo is hiding something.');
  kill(W, 'm', 'faithful');
  W.emit('text', { id: 'm', text: 'I am still right here with you all.' });
  W.say('p1', 'Fergus, thoughts?');
  W.step(2);
  const p = latest(W, 'f');
  ok(/\[Morag, since gone\]: I reckon Bo/.test(p), 'her old line is hers, from before she went');
  ok(!/still right here/.test(p), 'a late line from the dead never reaches anybody');
  ok(/Morag \(banished on day 1, a Faithful\)/.test(W.asked.slice(-1)[0].text));
});

section('ai — alliances');

test('ask an AI to team up: it shakes on it, remembers it, and will not vote you out', () => {
  const W = world();
  W.say('p1', 'Fergus, do you want to form an alliance with me?');
  W.step(2);
  eq(W.asked[0].id, 'f', 'Fergus answers');
  ok(/decided to say YES/.test(W.asked[0].text), 'his words match the deal');
  eq(W.ctx.AIDirector.allies('f'), ['p1'], 'and it is a deal');
  W.reply('f', 'Deal, Ana.');
  W.say('p2', 'I think Ana is the traitor, honestly. Vote Ana.');
  // let whoever answers Bo, and anybody chipping in, finish
  for (let k = 0; k < 6; k++) { W.step(1); for (const id of [...W.speaking]) W.reply(id, 'Hmm.'); }
  ok(/Ana: allies since day 1/.test(latest(W, 'f')), 'he remembers it');
  const sent = [];
  W.ctx.Net.send = (m) => sent.push(m);
  const s = W.ctx.Session.state;
  W.phase = 'table';
  s.finale = { stage: 'name', names: {}, votes: {}, round: 0, nameRound: 0 };
  // one voice at a time is asked for its slate; each says nothing aloud and is done
  for (let k = 0; k < 6; k++) { W.step(1); for (const id of [...W.speaking]) { W.speaking.delete(id); W.emit('done', { id }); } }
  const cue = W.asked.find(a => a.id === 'f' && /Time to vote/.test(a.text));
  ok(cue && /Do not vote for your ally Ana/.test(cue.text), 'the ballot reminds him');
  W.step(20);
  const vote = sent.find(m => m.type === 'name' && m.playerId === 'f');
  ok(vote && vote.targetId !== 'p1', 'and even his fallback leaves his ally alone');
});

test('a Faithful AI turns down an alliance with somebody it has seen do something odd', () => {
  const W = world();
  const faithful = ['m', 'f', 'i', 's'].find(id => W.ctx.Session.privateView(id).role === 'faithful');
  const name = W.ctx.Session.playerById(faithful).name;
  const pv = W.ctx.Session.privateView;
  W.ctx.Session.privateView = id => {
    const v = pv(id);
    return id === faithful ? Object.assign({}, v, { notes: [{ kind: 'handover', day: 0, t: 25, a: 'p1', b: 'p2', room: 'hall' }] }) : v;
  };
  W.say('p1', name + ', shall we team up?');
  W.step(2);
  eq(W.asked[0].id, faithful);
  ok(/not sure about Ana|NOT ally/.test(W.asked[0].text), 'it will not commit');
  eq(W.ctx.AIDirector.allies(faithful), [], 'no deal');
});

test('a vote against your ally ends the alliance, and it is remembered', () => {
  const W = world();
  W.say('p1', 'Isla, want to work together?');
  W.step(2);
  W.reply('i', 'Go on then.');
  eq(W.ctx.AIDirector.allies('i'), ['p1']);
  W.net({ type: 'nameReveal', playerId: 'p1', targetId: 'i' });
  eq(W.ctx.AIDirector.allies('i'), [], 'broken');
  W.say('p1', 'Isla, no hard feelings?');
  W.step(2);
  ok(/Ana: no longer allies — Ana broke it: voted against Isla/.test(latest(W, 'i')), 'and Isla knows who broke it');
});

test('alone behind a door, an AI offers a deal — and hears your yes', () => {
  const W = world({ phase: 'tasks' });
  const N = W.ctx.CastleNet;
  N.start('d0');
  N.publish('p1', 0, 10, 0);
  N.publish('p2', 0, -25, 0);
  N.publish('f', 1.2, 10, 0);
  for (const id of ['m', 'i', 's']) N.publish(id, -16, -20, 0);
  W.step(1);
  W.ctx.AIDirector.moved('private', 'f', 'p1');
  W.step(1);
  eq(W.asked[0].id, 'f');
  ok(/team up with you/.test(W.asked[0].text), 'Fergus, who has nothing against Ana, offers a deal');
  W.reply('f', 'So, Ana — shall we team up?');
  W.step(1);
  W.say('p1', 'Yeah, go on then.');
  W.step(2);
  eq(W.ctx.AIDirector.allies('f'), ['p1'], 'the yes sealed it');
  ok(/you are allies now/.test(W.asked.slice(-1)[0].text), 'and he shakes on it');
});

section('ai — talking to each other');

test('an AI that names another AI hands it the next turn, and a person speaking ends the chain', () => {
  const W = world();
  W.say('p1', 'Morag, what do you make of all this?');
  W.step(2);
  eq(W.asked[0].id, 'm');
  W.reply('m', 'Honestly, Isla, you went very quiet when the body came up — where were you?');
  W.step(2);
  eq(W.asked[1].id, 'i', 'Isla answers Morag');
  ok(/Morag just said to you: "Honestly, Isla/.test(W.asked[1].text), 'to what Morag said');
  W.reply('i', 'Fergus, tell her, Morag will not listen to me — I was with you all afternoon.');
  W.step(2);
  eq(W.asked[2].id, 'f', 'Fergus is brought in by name');
  W.say('p1', 'Hang on, everybody.');
  W.reply('f', 'Struan, back me up here.');
  W.step(1.5);
  ok(!W.asked.slice(3).some(a => a.id === 's'), 'a person speaking ends the AIs’ chain');
});

test('mentioning another AI is not handing it the floor; asking it something is', () => {
  const W = world();
  W.say('p1', 'Morag, what do you make of all this?');
  W.step(2);
  W.reply('m', 'I agree with Fergus about the library.');
  W.step(3);
  ok(!W.asked.some(a => a.id === 'f' && /Morag just said to you/.test(a.text)), 'a mention is not a question');
  for (const id of [...W.speaking]) W.reply(id, 'Aye.');      // anybody chipping in finishes
  W.step(1);
  W.say('p1', 'Isla, anything else?');
  W.step(2);
  eq(W.asked.slice(-1)[0].id, 'i');
  W.reply('i', 'What do you think, Fergus?');
  W.step(2);
  ok(W.asked.some(a => a.id === 'f' && /just said to you/.test(a.text)), 'a question is');
});

test('a long game trims the oldest talk, never the facts or the newest lines', () => {
  const W = world();
  for (let k = 0; k < 120; k++) W.net({ type: 'nameReveal', playerId: 'p1', targetId: 'p2' });
  for (let k = 0; k < 190; k++) W.emit('heard', { id: 'p2', text: 'Line ' + k + ' — ' + 'a long, winding remark about the library and the turret and the stair. '.repeat(3), final: true });
  W.say('p1', 'Fergus, the very latest thing I said.');
  W.step(2);
  const p = latest(W, 'f');
  ok(p.length <= 28000, 'inside the bridge’s limit: ' + p.length);
  ok(/YOUR PLAN RIGHT NOW/.test(p) && /YOUR READ ON THE OTHERS/.test(p), 'the read and the plan survive');
  ok(/the very latest thing I said/.test(p), 'and so does the newest line');
});

test('the AIs’ chain gives the room back after a few exchanges', () => {
  const W = world();
  W.say('p1', 'Morag?');
  W.step(2);
  const names = { m: 'Morag', f: 'Fergus', i: 'Isla', s: 'Struan' };
  const order = ['m', 'f', 'i', 's', 'm', 'f', 'i'];
  for (let k = 0; k < order.length - 1; k++) {
    const who = W.asked.slice(-1)[0].id;
    if (who !== order[k]) break;
    W.reply(who, names[order[k + 1]] + ', what do you think?');
    W.step(2);
  }
  ok(W.asked.length <= 5, 'one answer to Ana, then at most four AI-to-AI turns: ' + W.asked.length);
});

test('two AIs working side by side have a word you can overhear', () => {
  const W = world({ phase: 'tasks' });
  W.ctx.CastleBots = { running: true, canApproach: () => false, approach: () => false, company: () => null };
  const N = W.ctx.CastleNet;
  N.start('d0');
  N.publish('p1', 0, 10, 0);
  N.publish('p2', 0, -25, 0);
  N.publish('m', 3, 10, 0);
  N.publish('f', 4, 10, 0);
  N.publish('i', 30, -20, 0);
  N.publish('s', -30, -20, 0);
  W.net({ type: 'phase' });
  W.step(31);
  eq(W.asked.length, 1, 'one of them speaks');
  const a = W.asked[0].id, c = a === 'm' ? 'f' : 'm';
  ok(['m', 'f'].indexOf(a) >= 0 && /working right beside you/.test(W.asked[0].text), 'to the one beside them');
  W.reply(a, (c === 'm' ? 'Morag' : 'Fergus') + ', who are you watching today?');
  W.step(2);
  eq(W.asked[1].id, c, 'and the other answers');
  ok(/just said to you/.test(W.asked[1].text));
});

test('with nobody about, two AIs at work just remember the word', () => {
  const W = world({ phase: 'tasks' });
  W.ctx.CastleBots = { running: true, canApproach: () => false, approach: () => false, company: () => null };
  const ids = ['m', 'f', 'i', 's'];
  const pair = [];
  for (const x of ids) for (const y of ids) {
    if (!pair.length && x < y && !(W.ctx.Session.privateView(x).role === 'traitor' && W.ctx.Session.privateView(y).role === 'traitor')) pair.push(x, y);
  }
  const N = W.ctx.CastleNet;
  N.start('d0');
  N.publish('p1', 0, -25, 0);
  N.publish('p2', 0, -25, 0);
  N.publish(pair[0], 5, 10, 0);
  N.publish(pair[1], 6, 10, 0);
  for (const id of ids.filter(id => pair.indexOf(id) < 0)) N.publish(id, -30, -20, 0);
  W.net({ type: 'phase' });
  W.step(31);
  eq(W.asked.length, 0, 'nobody to hear it, so nothing is voiced');
  eq(W.ctx.AIDirector.allies(pair[0]), [pair[1]], 'but they did a deal between jobs');
  W.step(25);
  ok(/agreed to work together/.test(latest(W, pair[1])), 'and both remember it');
});

section('ai — playing to win');

test('the read gives reasons, and the plan names the suspect', () => {
  const W = world({ phase: 'table' });
  const faithful = ['f', 'i', 's'].find(id => W.ctx.Session.privateView(id).role === 'faithful');
  W.net({ type: 'nameReveal', playerId: 'm', targetId: 'p2' });
  kill(W, 'p2', 'faithful');
  W.net({ type: 'reveal', name: 'Bo', role: 'faithful' });
  W.step(21);
  const p = latest(W, faithful);
  ok(/Morag \+3 \(voted for Bo on day 1, who turned out Faithful\)/.test(p), 'the score comes with its reason');
  ok(/YOUR PLAN RIGHT NOW:/.test(p) && /Prime suspect: Morag/.test(p), 'and a plan to act on it');
});

test('somebody who stood up for a Traitor is suspected once the Traitor is caught', () => {
  const W = world({ phase: 'table' });
  const faithful = ['f', 'i', 's'].find(id => W.ctx.Session.privateView(id).role === 'faithful');
  W.say('p1', 'I trust Bo completely, Bo is innocent.');
  W.step(1);
  kill(W, 'p2', 'traitor');
  W.net({ type: 'reveal', name: 'Bo', role: 'traitor' });
  W.step(21);
  ok(/Ana \+2 \(stood up for Bo, who turned out a Traitor\)/.test(latest(W, faithful)), 'Ana defended a Traitor');
});

test('a Traitor carrying the poison looks for the Faithful who is getting it right', () => {
  let W, traitor;
  // a deal with an AI Traitor in it
  for (let seed = 1; !traitor && seed < 80; seed++) {
    W = world({ seed });
    traitor = ['m', 'f', 'i', 's'].find(id => W.ctx.Session.privateView(id).role === 'traitor');
  }
  ok(traitor, 'found a deal with an AI Traitor');
  // the read works from the public record: who went, and what the castle said they were
  const others = ['p1', 'p2', 'm', 'f', 'i', 's'].filter(id => id !== traitor);
  const [sharp, dull, caught, victim] = others;
  W.net({ type: 'nameReveal', playerId: sharp, targetId: caught });
  W.net({ type: 'nameReveal', playerId: dull, targetId: victim });
  kill(W, caught, 'traitor');
  kill(W, victim, 'faithful');
  const t = W.ctx.AIDirector.threats(traitor);
  ok(t.get(sharp) >= 3, 'voting out a Traitor makes you a target');
  ok(!t.get(dull), 'voting out a Faithful does not');
});

H.report();

/* ------------------------------------------------------------------
   ai-director.test.js — the AIs talking back, the way a room does.

   Say something to the room and somebody answers; often somebody else
   picks it up, and with a crowd sometimes a third. Never two at once,
   never silence for a remark to the room, and the moment a person
   speaks the AIs stop and listen. By day, only the AIs in earshot hear
   you at all.

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
  const speaking = new Set();
  const AI = {
    CLAUDIA: 'claudia-id', available: true, ready: true,
    agent: () => ({}), spawn() {}, prompt() {}, listen() {}, say() {}, tool() {},
    ask(id, text) { asked.push({ id, text, at: now }); speaking.add(id); },
    hush(id) { speaking.delete(id); },
    speaking: (id) => speaking.has(id),
    on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); return () => {}; },
  };
  const ctx = H.load(FILES, {
    Date: FakeDate, Math: math,
    setInterval: (fn) => { intervals.push(fn); return intervals.length; },
    clearInterval: () => {},
    setTimeout: (fn, ms) => { timeouts.push({ fn, at: now + ms }); return timeouts.length; },
    clearTimeout: () => {},
    AI,
    Net: { on: () => () => {}, send() {} },
    VoiceChat: { levels: new Map(), selfLevel: 0 },
    Voice: { speaking: false },
  });
  ctx.GameState.load();
  const players = [
    { id: 'p1', name: 'Ana', local: true }, { id: 'p2', name: 'Bo' },
    { id: 'm', name: 'Morag', bot: true }, { id: 'f', name: 'Fergus', bot: true },
    { id: 'i', name: 'Isla', bot: true }, { id: 's', name: 'Struan', bot: true },
  ].slice(0, opts.n || 6);
  ctx.Session.startParty({ seed: 7, players, mode: 'host' });
  ctx.AIDirector.start();
  const emit = (evt, m) => (listeners[evt] || []).forEach(fn => fn(m));
  const W = {
    ctx, asked, speaking,
    step(sec) {
      const end = now + sec * 1000;
      while (now < end) {
        now += 100;
        for (const t of timeouts.splice(0)) { if (t.at <= now) t.fn(); else timeouts.push(t); }
        if (now % 400 < 100) intervals.forEach(fn => fn());
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

test('a remark to the room gets an answer, from one of them, after a breath', () => {
  const W = world();
  W.say('p1', 'This castle is SO cool');
  W.step(0.3);
  eq(W.asked.length, 0, 'nobody cuts in mid-breath');
  W.step(1.2);
  eq(W.asked.length, 1, 'one of them answers');
  ok(/Ana just said/.test(W.asked[0].text) && /This castle is SO cool/.test(W.asked[0].text), 'to what was said');
});

test('a second and sometimes a third pick it up — one at a time, never together', () => {
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
  eq(W.asked.length, 3, 'and with four of them in the room, a third');
  eq(new Set(W.asked.map(a => a.id)).size, 3, 'three different voices');
  W.reply(W.asked[2].id, 'Creepy, mind.');
  W.step(5);
  eq(W.asked.length, 3, 'and then it lets the room breathe');
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
  eq(W.asked.length, 2, 'and the next voice answers Bo, not the old thread');
  ok(/Bo just said/.test(W.asked[1].text));
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

H.report();

/* ------------------------------------------------------------------
   company.test.js — asking an AI along, and an AI asking you.

   "Follow me" and the AI that agrees walks behind you, through the door
   and into the room, clear of the doorway so the door can shut on the
   two of you. One that wants a private word leads you to a room with
   one door and shuts it. And a Faithful who suspects you does not wait
   to be poisoned: reach for it, or shut it in with you, and it is off
   to where the people are.

   The castle half runs the real walker, rules and poses; the talking
   half runs the real director with the bridge and the walker faked to
   the calls it makes.
------------------------------------------------------------------ */
const H = require('./harness');
const { test, eq, ok, section } = H;

/* ---------------- the castle ---------------- */

function castle(opts = {}) {
  let now = 1.7e12;
  class FakeDate extends Date { static now() { return now; } }
  const told = [], actions = [];
  const director = {
    startEncounter: () => false,
    distrusts: (bot, other) => !!opts.distrust && other === 'ana',
    moved(kind, bot, other) { told.push({ kind, bot, other }); },
  };
  const ctx = H.load(['js/core/util.js', 'js/core/state.js', 'js/world/castle-layout.js', 'js/core/chores.js',
    'js/core/session.js', 'js/core/castle-net.js', 'js/core/castle-bots.js'], {
    Date: FakeDate, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    Net: { send(action) { actions.push(action); ctx.Session.dispatch(action); } },
    Scenes: { botSpeechBlocked: false },
    AIDirector: director,
  });
  ctx.GameState.load();
  ctx.Session.startParty({ seed: 1, mode: 'host', players: [
    { id: 'ana', name: 'Ana', local: true }, { id: 'bo', name: 'Bo' },
    ...['morag', 'fergus', 'isla', 'struan'].map(id => ({ id, name: id, bot: true })),
  ] });
  ctx.Session.dispatch({ type: 'advance' });
  ctx.Session.state.chores.startedAt = now;
  ctx.Session.state.chores.endsAt = now + 170000;
  ctx.CastleNet.start('d0');
  ctx.Session.setEyes(ctx.CastleNet.eyes);
  // a Faithful by default; the seeded carrier when asked for
  const id = opts.carrier ? 'isla' : 'morag';
  ctx.CastleBots.start([id], { seed: 1, spawn: () => opts.at || { x: 16, z: 13.5 } });
  const bot = ctx.CastleBots.bots[0];
  bot.stalkAfter = 999;
  let me = { x: 12, z: 13.5 }, g = 0;
  ctx.CastleNet.publish('ana', me.x, me.z, 0);
  ctx.CastleNet.publish('bo', -30, -5, 0);          // well out of the way, in the library
  ctx.CastleBots.update(0);
  const W = {
    ctx, bot, told, actions,
    get me() { return me; },
    reach(target) { g = target || 0; },
    frame() {
      now += 100;
      ctx.CastleNet.publish('ana', me.x, me.z, 0, g);
      ctx.CastleNet.publish('bo', -30, -5, 0);
      ctx.CastleBots.update(0.1);
    },
    step(seconds) { for (let i = 0; i < seconds * 10; i++) W.frame(); },
    // a person walks at 4 m/s, a frame at a time
    walk(x, z) {
      for (;;) {
        const d = Math.hypot(x - me.x, z - me.z);
        if (d < 0.01) return;
        const k = Math.min(1, 0.4 / d);
        me = { x: me.x + (x - me.x) * k, z: me.z + (z - me.z) * k };
        W.frame();
      }
    },
    door(doorId, shut) {
      return ctx.Session.dispatch({ type: 'door', playerId: 'ana', doorId, shut });
    },
    room(id) { return (ctx.CastleNet.get(id) || {}).room; },
  };
  return W;
}

section('company — an AI that comes along');

test('asked along, an AI walks behind you into a bedroom and the door shuts on the two of you', () => {
  const W = castle();
  ok(W.ctx.CastleBots.follow(W.bot.id, 'ana'), 'it agrees to come');
  eq(W.ctx.CastleBots.company(W.bot.id).kind, 'follow');
  W.step(2);
  ok(Math.hypot(W.bot.x - W.me.x, W.bot.z - W.me.z) < 2.3, 'it closes up');
  W.walk(10, 13.5);
  W.walk(10, 12);
  W.walk(10, 9.6);
  W.step(3);
  eq(W.room(W.bot.id), 'bed0', 'it came in after you');
  ok(!W.ctx.CastleNet.eyes.inDoorway('bed0'), 'and is clear of the doorway');
  W.door('bed0', true);
  ok(W.ctx.Session.state.doors.bed0, 'so the door shuts');
  ok(W.ctx.CastleLayout.sealed('bed0', W.ctx.Session.state.doors), 'the room is private');
  W.step(1);
  ok(W.told.some(t => t.kind === 'private' && t.other === 'ana'), 'the director hears they are alone together');
  ok(Math.hypot(W.bot.x - W.me.x, W.bot.z - W.me.z) < 2.3, 'it stays with you');
});

test('it follows you through a door you have shut behind you, and lets go when told', () => {
  const W = castle();
  W.ctx.CastleBots.follow(W.bot.id, 'ana');
  W.walk(10, 13.5);
  W.walk(10, 9.6);
  // you outpace it and shut the door before it is through
  W.bot.x = 13; W.bot.z = 13.5; W.bot.route = [];
  W.door('bed0', true);
  W.step(4);
  ok(!W.ctx.Session.state.doors.bed0, 'it opened the door');
  eq(W.room(W.bot.id), 'bed0');
  ok(W.ctx.CastleBots.unfollow(W.bot.id), 'you can tell it to go');
  eq(W.ctx.CastleBots.company(W.bot.id), null);
});

test('a carrier asked into a shut room by a Faithful takes its chance', () => {
  const W = castle({ carrier: true });
  ok(W.ctx.Session.privateView(W.bot.id).poison.mine, 'the seeded bot carries the poison');
  W.ctx.CastleBots.follow(W.bot.id, 'ana');
  W.walk(10, 13.5);
  W.walk(10, 9.6);
  W.step(2);
  W.door('bed0', true);
  W.step(8);
  eq(W.actions.filter(a => a.type === 'poison').length, 1, 'one hand-over, through the real action');
  eq(W.ctx.Session.privateView(W.bot.id).poison.target, 'ana');
});

section('company — an AI that wants a word');

test('it leads you to a room with one door, waits for you, and shuts it', () => {
  const W = castle({ at: { x: 18, z: 13.5 } });
  const room = W.ctx.CastleBots.lead(W.bot.id, 'ana');
  ok(room && W.ctx.CastleLayout.SEALABLE.has(room), 'a room that can be shut: ' + room);
  W.step(6);
  eq(W.room(W.bot.id), room, 'it went in first');
  ok(!W.ctx.Session.state.doors[room], 'and waits with the door open');
  const d = W.ctx.CastleLayout.doorsOf(room)[0];
  const n = W.ctx.CastleLayout.inward(d, room);
  W.walk(d.x - n.x * 1.2, d.z - n.z * 1.2);
  W.walk(d.x + n.x * 1.6, d.z + n.z * 1.6);
  W.step(5);
  ok(W.ctx.Session.state.doors[d.id], 'once you are in, it shuts the door');
  ok(W.told.some(t => t.kind === 'private'), 'and is ready to talk');
});

test('if you never come, it gives up', () => {
  const W = castle({ at: { x: 18, z: 13.5 } });
  ok(W.ctx.CastleBots.lead(W.bot.id, 'ana'));
  W.step(32);
  eq(W.ctx.CastleBots.company(W.bot.id), null);
  ok(W.told.some(t => t.kind === 'stood-up'));
});

section('company — getting away');

test('a Faithful that suspects you will not stand still while you reach for it', () => {
  const W = castle({ distrust: true, at: { x: 13.2, z: 13.5 } });
  W.step(0.2);
  W.reach(W.bot.id);
  W.step(0.3);
  eq((W.ctx.CastleBots.company(W.bot.id) || {}).kind, 'flee', 'it is off');
  ok(W.told.some(t => t.kind === 'fled' && t.other === 'ana'));
  W.step(3);
  ok(Math.hypot(W.bot.x - W.me.x, W.bot.z - W.me.z) > 6, 'well out of reach before the hand-over could finish');
  ok(W.ctx.CastleBots.wary(W.bot.id, 'ana'), 'and it remembers');
  ok(!W.ctx.CastleBots.follow(W.bot.id, 'ana'), 'it will not come along while it is running');
});

test('one that trusts you lets you hand it something', () => {
  const W = castle({ at: { x: 13.2, z: 13.5 } });
  W.bot.wait = 99;
  W.step(0.2);
  W.reach(W.bot.id);
  W.step(1);
  eq(W.ctx.CastleBots.company(W.bot.id), null);
});

test('shut in a room with somebody it suspects, it opens the door and goes', () => {
  const W = castle({ at: { x: 10.6, z: 9.6 } });
  W.walk(10, 13.5);
  W.walk(9.4, 9.6);
  W.bot.wait = 99;
  W.door('bed0', true);
  W.step(0.5);
  eq(W.ctx.CastleBots.company(W.bot.id), null, 'trusting you, it stays');
  W.ctx.AIDirector.distrusts = () => true;
  W.step(4);
  ok(!W.ctx.Session.state.doors.bed0, 'the door is open');
  ok(W.room(W.bot.id) !== 'bed0', 'and it is gone');
});

/* ---------------- the talking ---------------- */

function talk(opts = {}) {
  let now = 1.7e12;
  class FakeDate extends Date {
    constructor(...a) { if (a.length) super(...a); else super(now); }
    static now() { return now; }
  }
  const intervals = [], timeouts = [];
  const listeners = {}, asked = [], netHandlers = [], speaking = new Set(), tools = [];
  const math = Object.create(Math);
  math.random = () => (opts.random !== undefined ? opts.random : 0.1);
  const AI = {
    CLAUDIA: 'claudia-id', available: true, ready: true,
    agent: () => ({}), spawn() {}, prompt() {}, listen() {}, say() {},
    tool(id, callId, name, answer) { tools.push({ id, name, answer: JSON.parse(answer) }); },
    ask(id, text) { asked.push({ id, text }); speaking.add(id); },
    hush(id) { speaking.delete(id); },
    speaking: (id) => speaking.has(id),
    on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); return () => {}; },
  };
  const walker = {
    running: true, calls: [], c: new Map(),
    company(id) { return walker.c.get(id) || null; },
    follow(id, who) { walker.calls.push(['follow', id, who]); walker.c.set(id, { kind: 'follow', with: who }); return true; },
    unfollow(id) { walker.calls.push(['unfollow', id]); return walker.c.delete(id); },
    lead(id, who) { walker.calls.push(['lead', id, who]); walker.c.set(id, { kind: 'lead', with: who }); return 'study'; },
    flee(id, who) { walker.calls.push(['flee', id, who]); walker.c.set(id, { kind: 'flee', with: who }); return true; },
    canApproach: () => true, approach: () => true,
  };
  const ctx = H.load(['js/core/util.js', 'js/core/state.js', 'js/world/castle-layout.js', 'js/core/chores.js',
                      'js/core/session.js', 'js/scenes/claudia-lines.js', 'js/core/castle-net.js', 'js/core/ai-director.js'], {
    Date: FakeDate, Math: math,
    setInterval: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; }, clearInterval() {},
    setTimeout: (fn, ms) => { timeouts.push({ fn, at: now + ms }); return timeouts.length; }, clearTimeout() {},
    AI, CastleBots: walker,
    Net: { on: (fn) => { netHandlers.push(fn); return () => {}; }, send() {} },
    VoiceChat: { levels: new Map(), selfLevel: 0 },
    Voice: { speaking: false },
  });
  ctx.GameState.load();
  ctx.Session.startParty({ seed: 7, mode: 'host', players: [
    { id: 'p1', name: 'Ana', local: true }, { id: 'p2', name: 'Bo' },
    { id: 'm', name: 'Morag', bot: true }, { id: 'f', name: 'Fergus', bot: true },
  ] });
  ctx.Session.state.phase = 'tasks';
  ctx.CastleNet.start('d0');
  // all four in the great hall, Morag nearest to Ana
  ctx.CastleNet.publish('p1', -16, 7, 0);
  ctx.CastleNet.publish('p2', -19, 4, 0);
  ctx.CastleNet.publishBots([['m', -15, 7, 0, 0, 0], ['f', -18, 10, 0, 0, 0]]);
  ctx.AIDirector.start();
  const emit = (evt, m) => (listeners[evt] || []).forEach(fn => fn(m));
  return {
    ctx, asked, walker, tools, emit,
    step(sec) {
      const end = now + sec * 1000;
      while (now < end) {
        now += 100;
        for (const t of timeouts.splice(0)) { if (t.at <= now) t.fn(); else timeouts.push(t); }
        intervals.forEach(t => { if (now % t.ms < 100) t.fn(); });
      }
    },
    say(id, text) { emit('hearing', { id }); emit('heard', { id, text, final: true }); },
    reply(id) { emit('text', { id, text: 'Aye.' }); speaking.delete(id); emit('done', { id }); },
  };
}

section('company — what they say');

test('"follow me" to the nearest AI: it agrees, says so, and walks', () => {
  const T = talk();
  const morag = T.ctx.Session.playerById('m');
  T.say('p1', 'Follow me, I want to show you something');
  T.step(1.5);
  ok(T.walker.calls.some(c => c[0] === 'follow' && c[1] === 'm' && c[2] === 'p1'), 'the nearest one heard it and came');
  eq(T.asked.length, 1);
  eq(T.asked[0].id, 'm', 'and it is the one that answers');
  ok(/decided to go/.test(T.asked[0].text), 'its words agree with its feet');
  ok(morag, 'sanity');
});

test('by name, the named AI goes; "you can go" sends it back to its jobs', () => {
  const T = talk();
  T.say('p1', 'Fergus, come with me');
  T.step(1.5);
  ok(T.walker.calls.some(c => c[0] === 'follow' && c[1] === 'f'));
  eq(T.asked[0].id, 'f');
  T.reply('f');
  T.step(4);
  T.say('p1', 'Thanks Fergus, you can go now');
  T.step(1.5);
  ok(T.walker.calls.some(c => c[0] === 'unfollow' && c[1] === 'f'));
  ok(/goodbye/.test(T.asked[1].text));
});

test('"come with me, Bo" is for Bo, not the nearest AI', () => {
  const T = talk();
  T.say('p1', 'Bo, come with me');
  T.step(1.5);
  ok(!T.walker.calls.some(c => c[0] === 'follow'));
});

test('a Faithful that suspects you says no, and its feet agree', () => {
  const T = talk();
  const faithful = ['m', 'f'].find(id => T.ctx.Session.privateView(id).role !== 'traitor');
  const name = T.ctx.Session.playerById(faithful).name;
  T.walker.c.set(faithful, { kind: 'flee', with: 'p1' });
  T.say('p1', name + ', follow me');
  T.step(1.5);
  ok(!T.walker.calls.some(c => c[0] === 'follow'), 'it does not come');
  ok(/do not trust them/.test(T.asked[0].text), 'and makes an excuse');
});

test('an AI asks for a private word; a yes and it leads the way', () => {
  const T = talk();
  T.step(1);
  ok(T.ctx.AIDirector.startEncounter('m', 'p1', null), 'it walked over and spoke');
  ok(/word in private/.test(T.asked[0].text), 'it asked for a private word');
  T.reply('m');
  T.step(4);
  T.say('p1', 'Yeah sure, what is it?');
  T.step(1.5);
  ok(T.walker.calls.some(c => c[0] === 'lead' && c[1] === 'm' && c[2] === 'p1'), 'it leads');
  ok(/follow you/.test(T.asked[1].text), 'and tells you to follow');
  T.reply('m');
  T.step(4);
  T.ctx.AIDirector.moved('private', 'm', 'p1');
  T.step(1);
  ok(/door shut/.test(T.asked[2].text), 'behind the door, it says its piece');
  const traitor = T.ctx.Session.privateView('m').role === 'traitor';
  ok(traitor ? /seed of doubt/.test(T.asked[2].text) : /suspect/.test(T.asked[2].text), 'as a ' + (traitor ? 'Traitor' : 'Faithful') + ' would');
});

test('"no worries" is a yes; "not now" is a no', () => {
  const T = talk();
  T.step(1);
  T.ctx.AIDirector.startEncounter('m', 'p1', null);
  T.reply('m');
  T.step(4);
  T.say('p1', 'No worries, go on then');
  T.step(1.5);
  ok(T.walker.calls.some(c => c[0] === 'lead'), 'no worries means yes');
  const U2 = talk();
  U2.step(1);
  U2.ctx.AIDirector.startEncounter('m', 'p1', null);
  U2.reply('m');
  U2.step(4);
  U2.say('p1', 'Not now, I am busy');
  U2.step(1.5);
  ok(!U2.walker.calls.some(c => c[0] === 'lead'), 'not now means no');
  ok(/does not want/.test(U2.asked[1].text));
});

test('get_away: an AI that comes to suspect you in private runs, and remembers', () => {
  const T = talk();
  const faithful = ['m', 'f'].find(id => T.ctx.Session.privateView(id).role !== 'traitor');
  T.emit('tool', { id: faithful, calls: [{ name: 'get_away', callId: 'c1', arguments: JSON.stringify({ name: 'Ana' }) }] });
  ok(T.walker.calls.some(c => c[0] === 'flee' && c[1] === faithful && c[2] === 'p1'));
  ok(T.tools[0].answer.ok);
  ok(T.ctx.AIDirector.distrusts(faithful, 'p1'), 'it will not be alone with you again');
});

test('the fright is spoken: a line queued by the walker goes out in the next gap', () => {
  const T = talk();
  T.ctx.AIDirector.moved('fled', 'm', 'p1');
  T.step(1);
  eq(T.asked.length, 1);
  ok(/getting away/.test(T.asked[0].text));
});

H.report();

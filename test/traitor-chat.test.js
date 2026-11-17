/* ------------------------------------------------------------------
   traitor-chat.test.js — the Traitors' chat, in writing.

   Only a living Traitor may write in it or read it; the host hears
   every message for its AI Traitors whatever the host is; on a machine
   with no server the bots answer from their own lines; and the bridge
   drops the voice of a written AI turn so nobody can hear it.
------------------------------------------------------------------ */
const H = require('./harness');
const { test, eq, ok, section } = H;

const FILES = ['js/core/util.js', 'js/core/state.js', 'js/world/castle-layout.js', 'js/core/chores.js',
               'js/core/twists.js', 'js/core/session.js', 'js/scenes/claudia-lines.js', 'js/core/traitor-chat.js'];

function world(o = {}) {
  const timers = [];
  const sent = [];
  const ctx = H.load(FILES, {
    setTimeout: (fn, ms) => { timers.push(fn); return timers.length; },
    Party: o.online ? { connected: true, canTraitorChat: true, traitorChat: (t) => sent.push({ t }),
                        traitorChatFor: (id, t) => sent.push({ id, t }), on() { return () => {}; } } : undefined,
  });
  ctx.GameState.load();
  const players = [
    { id: 'p1', name: 'Ana', local: true }, { id: 'p2', name: 'Bo' },
    { id: 'm', name: 'Morag', bot: true }, { id: 'f', name: 'Fergus', bot: true }, { id: 'i', name: 'Isla', bot: true },
  ];
  ctx.Session.startParty({ seed: 9, players, mode: o.mode || 'host' });
  ctx.Session.state.phase = 'tasks';
  const roles = o.roles || { p1: 'traitor', m: 'traitor' };
  const base = ctx.Session.privateView.bind(ctx.Session);
  ctx.Session.privateView = (id) => {
    const role = roles[id] || 'faithful';
    const partners = role === 'traitor' ? Object.keys(roles).filter(k => k !== id && roles[k] === 'traitor') : [];
    return Object.assign({}, base(id), { role, partners });
  };
  ctx.Session.myRole = () => roles.p1 || 'faithful';
  ctx.Session.myPrivate = () => ctx.Session.privateView('p1');
  return { ctx, timers, sent, flush() { timers.splice(0).forEach(fn => fn()); } };
}

section('the Traitors\' chat');

test('a Traitor writes, and on a machine of its own a bot Traitor writes back', () => {
  const W = world();
  const C = W.ctx.TraitorChat;
  ok(C.canWrite(), 'a living Traitor may write');
  const heard = [];
  C.on((m) => heard.push(m));
  ok(C.send('  Fergus   tonight? '), 'sent');
  eq(C.log.map(m => [m.id, m.text, m.mine]), [['p1', 'Fergus tonight?', true]], 'shown at once, tidied');
  eq(heard.map(m => m.id), ['p1'], 'the host\'s AI ears hear it');
  W.flush();
  eq(C.log.length, 2, 'Morag answers');
  eq(C.log[1].id, 'm');
  ok(/Fergus/.test(C.log[1].text), 'and agrees to the name she was given: ' + C.log[1].text);
});

test('a Faithful cannot write in it, and a Faithful host never shows it', () => {
  const W = world({ roles: { p2: 'traitor', m: 'traitor' } });
  const C = W.ctx.TraitorChat;
  ok(!C.canWrite(), 'not a Faithful');
  eq(C.send('hello?'), false);
  const heard = [];
  C.on((m) => heard.push(m));
  C.arrive({ id: 'p2', text: 'Morag, poison Isla', at: 1 });
  eq(C.log.length, 0, 'nothing on a Faithful\'s screen');
  eq(heard.length, 1, 'but the host still hears it, for its AIs');
});

test('nobody writes before Claudia has said who the Traitors are, or once they are dead', () => {
  const W = world();
  const C = W.ctx.TraitorChat;
  W.ctx.Session.state.phase = 'hill';
  ok(!C.canWrite(), 'not on the hill');
  W.ctx.Session.state.phase = 'tasks';
  W.ctx.Session.state.players.find(p => p.id === 'p1').alive = false;
  ok(!C.canWrite(), 'not dead');
});

test('online, the words go to the server, and the host writes for its bots through it', () => {
  const W = world({ online: true });
  const C = W.ctx.TraitorChat;
  C.send('who do we want?');
  eq(W.sent[0], { t: 'who do we want?' }, 'to the server as yourself');
  W.flush();
  eq(W.sent[1].id, 'm', 'the bot writes back through the server');
  eq(C.log.length, 1, 'and it shows when the server sends it back, not before');
  C.arrive({ id: 'm', text: W.sent[1].t, at: 2 });
  eq(C.log.length, 2);
  ok(!C.postFor('f', 'I am a Faithful pretending'), 'the host cannot write for a Faithful');
});

section('the bridge: a written turn has no voice');

test('a muted turn\'s audio is dropped and it is done as soon as Deepgram is', () => {
  const { createAIBridge } = require('../server/ai-bridge');
  const ID = 'a1a1a1a1-0000-4000-8000-0000000000a1';
  const said = [], relayed = [];
  let sock = null;
  class FakeWS { constructor() { sock = this; this.readyState = 1; this.sent = []; this.h = {}; }
    on(e, f) { this.h[e] = f; } send(d) { this.sent.push(d); } close() {} }
  const bridge = createAIBridge({ relayAudio: (...a) => relayed.push(a), toHost: (room, m) => said.push(m), WebSocketImpl: FakeWS, fetchImpl: null });
  const room = { code: 'R', members: new Map(), hostId: 'h' };
  bridge.handle(room, { op: 'configure', key: 'k' });
  bridge.handle(room, { op: 'spawn', id: ID, name: 'Morag', voice: 'aura-2-thalia-en', prompt: 'x' });
  ok(sock, 'a voice was opened');
  sock.h.open();
  sock.h.message(Buffer.from(JSON.stringify({ type: 'SettingsApplied' })), false);
  bridge.handle(room, { op: 'ask', id: ID, text: 'write back', muted: true });
  sock.h.message(Buffer.from(JSON.stringify({ type: 'ConversationText', role: 'assistant', content: 'Agreed.' })), false);
  sock.h.message(Buffer.alloc(4800), true);
  sock.h.message(Buffer.from(JSON.stringify({ type: 'AgentAudioDone' })), false);
  eq(relayed.length, 0, 'not a frame of it reaches anybody');
  ok(said.some(m => m.op === 'text' && m.text === 'Agreed.'), 'the words come back');
  ok(said.some(m => m.op === 'done' && m.id === ID), 'and it is done');
  bridge.end(room);
});

H.report();

/* Multiple living Traitors meet in the turret (`conclave`) with a
   20-30s chat and decision timer; a solo Traitor stays in their
   bedroom like everyone else. */
const H = require('./harness');
const { test, atest, eq, ok } = H;

const FILES = ['js/core/util.js', 'js/core/state.js', 'js/core/chores.js', 'js/core/session.js'];

function toNight() {
  let clock = 1.7e12;
  class FakeDate extends Date {
    constructor(...a) { if (a.length) super(...a); else super(clock); }
    static now() { return clock; }
  }
  const ctx = H.load(FILES, { Date: FakeDate });
  ctx.GameState.load();
  const players = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id, i) => ({ id, name: id.toUpperCase() + 'nn', local: i === 0 }));
  ctx.Session.startParty({ seed: 42, players, mode: 'host' });
  ctx.Session.dispatch({ type: 'advance', authority: true }); // welcome -> tasks
  clock = ctx.Session.state.chores.endsAt + 50;
  ctx.Session.dispatch({ type: 'tasksTick', authority: true }); // tasks -> night
  return ctx;
}

function loadNightScene(sessionStub, extras = {}) {
  class CastleScene {
    constructor() { this._alive = true; }
    update() {}
    _openVote() {}
    _closeVote() {}
    _say() { return Promise.resolve(); }
    _sleep(s) { return new Promise(r => setTimeout(r, (extras.sleepScale || 1) * s * 1000)); }
    async _waitFor(pred) {
      while (this._alive && !pred()) await new Promise(r => setTimeout(r, 5));
    }
  }
  const calls = { floor: [], cards: [], sleepCalls: 0 };
  const ctx = H.load(['js/scenes/night.js'], {
    CastleScene,
    Session: sessionStub,
    AudioBus: { define() {}, play() {} },
    Scenes: {
      Cine: { card(c) { calls.cards.push(c); } },
      Drama: { build: () => ({ release: () => 0, cancel() {} }), hit() {}, end() {} },
    },
    RoomUI: extras.RoomUI || {
      showFloor(e) { calls.floor.push(['show', e]); },
      hideFloor() { calls.floor.push(['hide']); },
    },
    Music: { murder: () => ({ section() {}, stinger() {}, setTension() {} }), sceneMusic: () => null },
    Voice: { show() {}, clear() {}, speaking: false },
    document: { getElementById: () => null },
  });
  return { NightScene: ctx.NightScene, calls };
}

test('turret timer is in the 20-30s range and voice routes stay private to Traitors', () => {
  const ctx = toNight();
  const { Session } = ctx;
  ok(Session.PICK_SECONDS >= 20 && Session.PICK_SECONDS <= 30,
     'PICK_SECONDS is between 20 and 30');
  eq(Session.state.phase, 'night', 'entered night phase');
  const traitors = Session.alive().filter(p => Session.privateView(p.id).role === 'traitor');
  eq(traitors.length, 2, 'two living Traitors');
  const v = Session.privateView(traitors[0].id);
  const pickMs = v.night.endsAt - Session.state.night.startedAt;
  ok(pickMs >= 20000 && pickMs <= 30000, 'turret pick/chat window is 20-30s (' + pickMs + 'ms)');
  ok(Session.state.night.endsAt >= v.night.endsAt, 'full night covers turret window');
  const routes = Session.voiceRoutes();
  eq(routes.night.slice().sort(), traitors.map(t => t.id).sort(), 'only living Traitors share the night route');
  Session.abandon();
});

test('Stage options put multiple Traitors in the turret and a solo Traitor in a bedroom', () => {
  const players = [
    { id: 'p0', name: 'A', seat: 2, local: true, alive: true },
    { id: 'p1', name: 'B', seat: 0, local: false, alive: true },
    { id: 'p2', name: 'C', seat: 1, local: false, alive: true },
    { id: 'p3', name: 'D', seat: 3, local: false, alive: false },
  ];

  // 2 living Traitors: meet in the turret, seated at the conclave table
  const twoTraitors = loadNightScene({
    state: { seed: 10, day: 1, phase: 'night', players },
    myPrivate: () => ({ role: 'traitor', partners: ['p1'] }),
    myRole: () => 'traitor',
    playerById: id => players.find(p => p.id === id),
  });
  const sMulti = new twoTraitors.NightScene();
  const optsMulti = sMulti.stageOptions();
  eq(optsMulti.room, 'turret', 'multiple Traitors meet in the turret');
  eq(optsMulti.dress, 'conclave', 'conclave table dress in the turret');
  eq(optsMulti.seated, true, 'seated around the turret table');
  eq(optsMulti.players.map(p => p.id), ['p1', 'p0'], 'only living Traitors seated in the turret');

  // Solo living Traitor (partner banished): stays in their bedroom
  const soloDeadPartner = loadNightScene({
    state: { seed: 10, day: 2, phase: 'night', players },
    myPrivate: () => ({ role: 'traitor', partners: ['p3'] }),
    myRole: () => 'traitor',
    playerById: id => players.find(p => p.id === id),
  });
  const sSolo = new soloDeadPartner.NightScene();
  const optsSolo = sSolo.stageOptions();
  eq(optsSolo.room, 'bed2', 'solo Traitor stays in their own bedroom');
  eq(optsSolo.dress, 'bedroom', 'bedroom dress for solo Traitor');
  eq(optsSolo.players.map(p => p.id), ['p0'], 'alone in their bedroom');

  // Faithful stays in their bedroom
  const faithful = loadNightScene({
    state: { seed: 10, day: 1, phase: 'night', players },
    myPrivate: () => ({ role: 'faithful', partners: [] }),
    myRole: () => 'faithful',
    playerById: id => players.find(p => p.id === id),
  });
  const optsFaithful = new faithful.NightScene().stageOptions();
  eq(optsFaithful.room, 'bed2', 'Faithful stays in bedroom');
  eq(optsFaithful.dress, 'bedroom', 'bedroom dress for Faithful');
});

(async () => {
await atest('multiple Traitors stay chatting in the turret for the full turret timer even after early carrier lock', async () => {
  const players = [
    { id: 't1', name: 'Ada', seat: 0, local: true, alive: true },
    { id: 't2', name: 'Bo', seat: 1, local: false, alive: true },
  ];
  const pickEndsAt = Date.now() + 90;
  let nightEnd = false;
  const view = {
    role: 'traitor',
    partners: ['t2'],
    night: { choose: true, canRecruit: false, picks: {}, locked: true, offer: null, endsAt: pickEndsAt },
    poison: { carrier: 't2' },
  };
  const sessionStub = {
    state: { seed: 1, day: 1, phase: 'night', players, night: { startedAt: pickEndsAt - 25000 } },
    myPrivate: () => view,
    myRole: () => 'traitor',
    playerById: id => players.find(p => p.id === id),
    alive: () => players,
  };
  const { NightScene, calls } = loadNightScene(sessionStub, { sleepScale: 0.005 });
  const scene = new NightScene();
  scene.stageOptions();
  scene.music = { section() {}, stinger() {}, setTension() {} };
  const p = scene._choose();
  // Before pickEndsAt, they are still in the turret (sleep card has not appeared yet)
  await new Promise(r => setTimeout(r, 35));
  ok(calls.floor.some(x => x[0] === 'show' && x[1].all === true && /turret/i.test(x[1].label)),
     'turret open-floor bar shown');
  ok(!calls.cards.some(c => c && c.title === 'THE CASTLE SLEEPS'),
     'sleep card does not cover turret before turret timer ends');
  // Once pickEndsAt passes, sleep card appears until night ends
  await new Promise(r => setTimeout(r, 80));
  ok(calls.cards.some(c => c && c.title === 'THE CASTLE SLEEPS'),
     'sleep card appears after turret timer expires');
  ok(calls.floor.some(x => x[0] === 'hide'), 'turret floor bar hidden after timer ends');
  nightEnd = true;
  sessionStub.state.phase = 'breakfast';
  await p;
  ok(nightEnd);
});
})();

test('RoomUI.showFloor supports turret label without a Done talking button', () => {
  const els = {
    'floor-bar': { classList: { classes: new Set(), add(...a) { a.forEach(c => this.classes.add(c)); },
                   remove(...a) { a.forEach(c => this.classes.delete(c)); }, toggle() {} } },
    'floor-who': { textContent: '' },
    'floor-done': { hidden: false, disabled: false, textContent: '', onclick: () => {} },
    'floor-clock': { textContent: '' },
    'floor-fill': { style: { transform: '' } },
    'floor-mic': { textContent: '', className: '' },
  };
  let opened = 0;
  const ctx = H.load(['js/core/util.js', 'js/core/roomui.js'], {
    document: { getElementById: id => els[id] || null },
    Session: { state: { players: [{ id: 't1', alive: true, local: true }] }, alive: () => [{ id: 't1', alive: true }] },
    VoiceChat: { available: true, gagged: false, openFloor() { opened++; }, setFloor() {} },
    AudioBus: { play() {} },
    Net: { send() {} },
  });
  ctx.RoomUI.showFloor({ all: true, endsAt: Date.now() + 25000, seconds: 25, label: 'The turret · Talk in secret', hideDone: true });
  eq(els['floor-who'].textContent, 'The turret · Talk in secret', 'custom turret label applied');
  eq(els['floor-done'].hidden, true, 'Done talking button hidden in turret');
  ok(opened >= 1, 'VoiceChat.openFloor called');
  ctx.RoomUI.hideFloor();
});

test('NightScene turret bar labels a 1-1 with an AI Traitor partner', () => {
  const players = [
    { id: 't1', name: 'Ada', seat: 0, local: true, alive: true, bot: false },
    { id: 't2', name: 'Bo', seat: 1, local: false, alive: true, bot: true },
  ];
  const sessionStub = {
    state: { seed: 1, day: 1, phase: 'night', players, night: { startedAt: Date.now() } },
    myPrivate: () => ({ role: 'traitor', partners: ['t2'], night: { endsAt: Date.now() + 25000 } }),
    myRole: () => 'traitor',
    playerById: id => players.find(p => p.id === id),
  };
  const { NightScene, calls } = loadNightScene(sessionStub);
  const scene = new NightScene();
  scene.stageOptions();
  scene._showTurretBar(sessionStub.myPrivate());
  eq(calls.floor[0][1].label, 'The turret · 1-1 with Bo', 'shows 1-1 label when partner is an AI');
});

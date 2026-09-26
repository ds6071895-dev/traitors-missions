const assert = require('node:assert/strict');
const H = require('./harness');

const storage = H.makeStorage();
const skiBase = JSON.stringify([5, 'prize', 42, null, [['snow', 'powder']]]);
const skiTwist = JSON.stringify([5, 'prize', 42, 'avalanche', [['snow', 'powder']]]);
const missions = {};
for (const id of ['boat-race', 'shootout', 'dive', 'ski']) {
  const plain = id === 'ski' ? skiBase : 'prize:42:none';
  const twisted = id === 'ski' ? skiTwist : 'prize:42:glasscannon';
  missions[id] = {
    plays: 9, completed: 6, lastEarned: 700, best: { earned: 9000, key: twisted, modId: 'glasscannon' },
    runs: { [plain]: { plays: 3, best: { earned: 5000, key: plain }, medal: 2 },
            [twisted]: { plays: 1, best: { earned: 9000, key: twisted }, medal: 4 } },
  };
}
storage.setItem('traitors.save.v1', JSON.stringify({
  version: 1, prizePot: 12345, missions,
  settings: { setups: { ski: { seed: 42, modId: 'avalanche' }, dive: { seed: 42 } } },
}));
const ghosts = {};
for (const id of Object.keys(missions)) {
  ghosts[id + '|' + (id === 'ski' ? skiBase : 'prize:42:none')] = { at: 1, data: { safe: true } };
  ghosts[id + '|' + (id === 'ski' ? skiTwist : 'prize:42:glasscannon')] = { at: 2, data: { safe: false } };
}
storage.setItem('traitors.ghosts.v1', JSON.stringify(ghosts));
const skiUnlocks = JSON.stringify({ version: 2, done: ['carving-0'], favourites: [42], equipped: 0 });
storage.setItem('traitors.descent.progress.v2', skiUnlocks);
const { GameState } = H.load(['js/core/state.js'], { localStorage: storage });
GameState.load();
assert.equal(GameState.prizePot, 12345);
assert.equal(storage.getItem('traitors.descent.progress.v2'), skiUnlocks);
for (const id of Object.keys(missions)) {
  const rec = GameState.missionRecord(id);
  const plain = id === 'ski' ? skiBase : 'prize:42:none';
  assert.deepEqual(Object.keys(rec.runs), [plain]);
  assert.equal(rec.best.earned, 5000);
  assert.equal(rec.plays, 9);
  assert.equal(rec.completed, 6);
  assert.equal(rec.lastEarned, 700);
  assert.equal(rec.runs[plain].medal, 2);
  assert.deepEqual(GameState.getGhost(id, plain), { safe: true });
}
assert.equal(GameState.runKey('prize', 42), 'prize:42:none');
assert.equal(GameState.data.settings.setups.ski.modId, undefined);
const first = storage.getItem('traitors.save.v1');
const firstGhosts = storage.getItem('traitors.ghosts.v1');
GameState.load();
assert.equal(storage.getItem('traitors.save.v1'), first);
assert.equal(storage.getItem('traitors.ghosts.v1'), firstGhosts);
assert.equal(storage.getItem('traitors.descent.progress.v2'), skiUnlocks);
console.log('twist record and ghost cleanup passed');

let wire, left = 0, ended = 0, notice = '';
const guest = H.load(['js/core/transports.js'], {
  Session: { state: null, adopt() { throw new Error('legacy state was adopted'); } },
  Party: { on(_name, fn) { wire = fn; return () => {}; }, post() {},
           leave() { left++; }, hostId: 'host' },
  Screens: { show() {} },
  Show: { running: true, end(opts) { assert.equal(opts.abandon, true); ended++; } },
  alert(message) { notice = message; },
});
guest.Transports.GuestTransport.open(() => {});
wire({ ev: { type: 'state' }, state: { missions: [{ id: 'ski', modId: 'avalanche' }] } });
assert.equal(left, 1);
assert.equal(ended, 1);
assert.match(notice, /Refresh with the host/);
guest.Transports.GuestTransport.close();
console.log('legacy host session rejected');

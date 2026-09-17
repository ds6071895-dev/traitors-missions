/* The actual game page, with three independent browsers: lobby, private role
   handshake, returning to the lobby, and a shared mission. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createServer } = require('../server');

(async () => {
  const app = createServer();
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + app.server.address().port;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox',
    '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required',
    '--enable-unsafe-swiftshader'] });
  const pages = [], errors = [];
  try {
    for (let i = 0; i < 3; i++) {
      const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
      pages.push(page);
      page.on('pageerror', error => { errors.push(error.message); console.error('page ' + i, error.message); });
      page.on('console', message => { if (message.type() === 'error') console.error('page ' + i, message.text()); });
      await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
      if (process.env.THREE_TEST_ASSET) {
        await page.route('https://cdn.jsdelivr.net/npm/three@*/**', route =>
          route.fulfill({ path: process.env.THREE_TEST_ASSET, contentType: 'text/javascript' }));
      }
      await page.addInitScript(() => {
        window.RTCPeerConnection = function () { throw new Error('Game must not use P2P'); };
      });
      await page.goto(origin);
      await page.evaluate(() => {
        Engine.renderer.setPixelRatio(0.25);
        // This suite checks game/network lifecycle, not GPU performance. Keep
        // real scene construction and frame updates, but avoid drawing three
        // full worlds through a software GPU on the same test machine.
        Engine.renderer.render = () => {};
      });
      await page.click('#play-go');
      await page.fill('#lobby-name', ['Ana', 'Bo', 'Cy'][i]);
    }
    const [a, b, c] = pages;
    await a.click('#lobby-host');
    await a.waitForFunction(() => Party.connected);
    const code = await a.evaluate(() => Party.code);
    for (const page of [b, c]) {
      await page.fill('#code-input', code);
      await page.click('#lobby-join');
      await page.waitForFunction(() => Party.self() !== null);
    }
    await a.waitForFunction(() => Party.roster().length === 3);
    await a.click('#lobby-start');
    console.log('Waiting for night handshake');
    for (const page of pages) {
      await page.waitForFunction(() => Show.running && Session.state && Session.myRole(), null, { timeout: 30000, polling: 100 });
    }
    const states = await Promise.all(pages.map(page => page.evaluate(() => ({
      seed: Session.state.seed, players: Session.state.players.map(p => p.id),
      role: Session.myRole(), mode: Session.mode,
    }))));
    assert.equal(states[0].seed, states[1].seed);
    assert.deepEqual(states[0].players, states[2].players);
    assert.deepEqual(states.map(s => s.mode), ['host', 'guest', 'guest']);
    assert.equal(states.filter(s => s.role === 'traitor').length, 1);
    console.log('PASS: actual lobby starts a three-player night with matching state and private roles');

    // Exercise the same room after a night, without replacing the connection.
    for (const page of pages) await page.evaluate(() => {
      Show.end({ abandon: true });
      Screens.show('lobby');
    });
    await a.click('#lobby-start');
    for (const page of pages) await page.waitForFunction(() => Show.running && Session.myRole());
    console.log('PASS: another night starts in the same room');
    for (const page of pages) await page.evaluate(() => {
      Show.end({ abandon: true }); Lobby.leave();
    });
    // Let departures from the previous room drain before taking the next UI path.
    await a.waitForTimeout(400);
    for (const [missionId, skiMode] of [['boat-race'], ['shootout'], ['dive'], ['ski', 'prize'], ['ski', 'trial'], ['ski', 'freestyle']]) {
      console.log('Checking mission party: ' + missionId);
      await a.evaluate(id => MissionParty.openFor(id), missionId);
      if (skiMode) {
        assert.equal(await a.locator('#mp-mode button').filter({hasText:'Practice'}).count(),0);
        await a.locator('#mp-mode button').filter({hasText:{prize:'Prize Run',trial:'Time Trial',freestyle:'Freestyle'}[skiMode]}).click();
      }
      const missionCode = await a.evaluate(() => Party.code);
      if (missionId === 'boat-race') {
        for (const page of [b, c]) await page.evaluate(({ code, id }) => MissionParty.joinCode(code, id),
          { code: missionCode, id: missionId });
      }
      await Promise.all(pages.map(page => page.waitForFunction(id =>
        Party.roster().length === 3 && MissionParty.mission && MissionParty.mission.id === id,
        missionId, { polling: 100 })));
      const expectedSeed = await a.evaluate(() => MissionParty.setup.seed);
      await a.click('#mp-start');
      const playing = { 'boat-race': 'racing', shootout: 'live', dive: 'live', ski: 'running' };
      for (const page of pages) {
        await page.waitForFunction(({ id, state }) => Missions.activeDef && Missions.activeDef.id === id
          && Missions.active.state === state, { id: missionId, state: playing[missionId] },
          { timeout: 45000, polling: 100 });
        const opts = await page.evaluate(() => Missions.activeOpts);
        assert.equal(opts.seed, expectedSeed);
        assert.equal(opts.party, true);
        assert.equal(opts.ghost, false);
        assert.equal(opts.players.length, 3);
        if (skiMode) { assert.equal(opts.mode,skiMode); assert.equal(opts.rulesVersion,5); assert.ok(opts.conditions); }
      }
      await Promise.all(pages.map(page => page.waitForFunction(() => MissionNet.others().length === 2,
        null, { timeout: 15000, polling: 100 })));
      console.log('PASS: ' + missionId + ' builds, starts together, and exchanges live player positions');
      // End through each real mission's finish path; do not fabricate the results screen.
      for (const page of pages) await page.evaluate(() => Missions.active._finish());
      for (const page of pages) {
        await page.waitForFunction(() => Screens.current === 'results' && MissionNet.board
          && !document.getElementById('result-continue').disabled, null, { timeout: 15000, polling: 100 });
        assert.equal(await page.evaluate(() => MissionNet.board.players.length), 3);
      }
      const totals = await Promise.all(pages.map(page => page.evaluate(() => MissionNet.board.earned)));
      assert.equal(totals[0], totals[1]); assert.equal(totals[1], totals[2]);
      for (const page of pages) await page.click('#result-continue');
      await Promise.all(pages.map(page => page.waitForFunction(() => Screens.current === 'mparty'
        && !MissionParty.running && !Missions.active, null, { polling: 100 })));
      console.log('PASS: ' + missionId + ' produces a shared results board and returns everyone to the room');
    }
    assert.deepEqual(errors, []);
    console.log('PASS: all four mission parties complete their lifecycle without JavaScript errors');
  } catch (error) {
    console.error('Game states at failure:', await Promise.all(pages.map(page => page.evaluate(() => ({
      connected: Party.connected, reconnecting: Party.reconnecting,
      host: Party.isHost, players: Party.roster().length, screen: Screens.current,
      show: Show.running, phase: Session.state && Session.state.phase, role: Session.myRole(),
      mission: Missions.activeDef && Missions.activeDef.id, missionState: Missions.active && Missions.active.state,
      countdown: Missions.active && Missions.active.countdown, net: MissionNet.live,
      paused: Engine.isPaused(), hidden: document.hidden, time: Engine.time, peers: MissionNet.others(),
      message: document.getElementById('lobby-msg').textContent,
    })).catch(() => null))));
    throw error;
  } finally {
    for (const page of pages) await page.evaluate(() => {
      if (typeof Show !== 'undefined' && Show.running) Show.end({ abandon: true });
      if (typeof MissionParty !== 'undefined') MissionParty.leave();
      if (typeof Lobby !== 'undefined') Lobby.leave();
    }).catch(() => {});
    await browser.close(); await app.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

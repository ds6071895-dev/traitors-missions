/* Real lobby markup, AI seat management, and room sockets. The paid voice
   service is replaced so adding a contestant never spends API credit. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function lobbyBrowser(browser, origin, app) {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const lobby = html.match(/<section class="screen lobby"[\s\S]*?<\/section>/)[0];
  const pages = [], errors = [];
  async function client() {
    const page = await browser.newPage(); pages.push(page);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/health');
    await page.setContent('<link rel="stylesheet" href="/css/style.css">' + lobby);
    await page.evaluate(() => {
      document.querySelector('.lobby').classList.add('active');
      document.body.dataset.screen = 'lobby';
      window.Screens = { register() {} };
      window.RoomUI = { paintMic() {} };
      window.UINav = { scan() {} };
      window.VoiceChat = { on() {}, stop() {}, available: false };
      window.GameState = { settings: { taskSeconds: 180 } };
      window.Session = { TASK_MIN: 30, TASK_SECONDS: 180 };
      const agents = new Map(), listeners = [];
      window.AI = {
        ready: true, available: true, status: 'ready', error: null,
        storedKey: () => '', newId: () => crypto.randomUUID(),
        on: (event, fn) => listeners.push(fn),
        spawn: spec => agents.set(spec.id, spec),
        agent: id => agents.get(id), close: id => agents.delete(id), end() {},
        finish: id => listeners.forEach(fn => fn({ op: 'ready', id })),
      };
    });
    for (const name of ['util', 'look', 'room-socket', 'party', 'ai-players', 'lobby']) {
      await page.addScriptTag({ url: origin + '/js/core/' + name + '.js' });
    }
    await page.evaluate(() => Lobby.init());
    return page;
  }
  const aiRows = page => page.locator('#lobby-roster .lr-seat.ai');
  try {
    const host = await client(), guest = await client();
    const code = await host.evaluate(() => Party.host({ name: 'Host' }));
    const labelColour = await host.locator('.lr-task b').evaluate(el => getComputedStyle(el).color);
    assert.equal(labelColour, 'rgb(238, 244, 251)', 'Jobs time uses the light text colour');
    await guest.evaluate(code => Party.join(code, { name: 'Guest' }), code);
    await host.locator('#ai-more').click();
    await guest.waitForFunction(() => document.querySelectorAll('#lobby-roster .ai').length === 1);
    assert.equal(await aiRows(host).innerText(), await aiRows(guest).innerText());
    assert.match(await aiRows(guest).innerText(), /AI · waking/i);

    const late = await client();
    await late.evaluate(code => Party.join(code, { name: 'Late guest' }), code);
    await late.waitForFunction(() => document.querySelectorAll('#lobby-roster .ai').length === 1);
    assert.equal(await aiRows(host).innerText(), await aiRows(late).innerText());
    await host.evaluate(() => AI.finish(AIPlayers.seats(3)[0].id));
    for (const page of [guest, late]) {
      await page.waitForFunction(() => document.querySelector('#lobby-roster .ai .lr-tag').textContent === 'AI');
    }
    console.log('PASS: AI names and readiness reach existing and late-joining lobby guests');

    // A guest cannot replace the host's public seats.
    let received = 0;
    await late.exposeFunction('heardLobby', () => received++);
    await late.evaluate(() => Party.on('lobby', heardLobby));
    await guest.evaluate(() => Party.post('lobby', { seats: [{ name: 'Forged AI', ready: true }] }));
    await guest.waitForTimeout(100);
    assert.equal(received, 0);
    assert.doesNotMatch(await aiRows(late).innerText(), /Forged/);

    const guestId = await guest.evaluate(() => Party.selfId());
    app.rooms.get(code).members.get(guestId).ws.terminate();
    await guest.waitForFunction(() => Party.reconnecting);
    await host.locator('#ai-less').click();
    await guest.waitForFunction(() => !Party.reconnecting && !document.querySelector('#lobby-roster .ai'));
    await late.waitForFunction(() => !document.querySelector('#lobby-roster .ai'));
    console.log('PASS: AI removals survive reconnects and guests cannot forge the lobby roster');

    await host.locator('#ai-more').click();
    await guest.waitForFunction(() => !!document.querySelector('#lobby-roster .ai'));
    await guest.evaluate(() => Lobby.leave());
    const next = await late.evaluate(() => { Lobby.leave(); return Party.host({ name: 'New host' }); });
    await guest.evaluate(code => Party.join(code, { name: 'Returning guest' }), next);
    await guest.waitForFunction(() => Party.roster().length === 2);
    assert.equal(await aiRows(guest).count(), 0, 'old AI seats do not leak into a new room');
    assert.deepEqual(errors, []);
  } finally {
    for (const page of pages) {
      await page.evaluate(() => Lobby.leave()).catch(() => {});
      await page.close();
    }
  }
}

(async () => {
  const { chromium } = require('playwright');
  const { createServer } = require('../server');
  const app = createServer();
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH,
      args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    await lobbyBrowser(browser, 'http://127.0.0.1:' + app.server.address().port, app);
  } finally {
    if (browser) await browser.close();
    await app.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

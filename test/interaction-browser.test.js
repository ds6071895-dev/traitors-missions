/* Real pointer lock and a continuous walk along the rendered lantern route. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createServer } = require('../server');
(async () => {
  const app = createServer();
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH,
      args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
    if (process.env.THREE_TEST_ASSET) await page.route('https://cdn.jsdelivr.net/npm/three@*/**', route =>
      route.fulfill({ path: process.env.THREE_TEST_ASSET, contentType: 'text/javascript' }));
    await page.goto('http://127.0.0.1:' + app.server.address().port);
    await page.waitForFunction(() => typeof Engine !== 'undefined' && Engine.renderer);
    await page.evaluate(async () => {
      Game.enterShow(); Screens.hideAll(); GameState.settings.quality = 'low'; Engine.resize();
      await EstateMaterials.preload();
      Session.startParty({ seed: 42, mode: 'host', players: [{ id: 'a', name: 'Ana', local: true }] });
      window.stage = Stage.build({ seed: 42, hour: 'night', players: Session.state.players });
      stage.rig.pos.copy(stage.land.anchors.returnStop).add(new THREE.Vector3(3, 0, 0));
      Engine.setView(stage.view, dt => { stage.update(dt); Input.endFrame(); });
    });
    await page.locator('#gl').click({ position: { x: 100, y: 100 } });
    await page.waitForFunction(() => Input.pointerLocked);
    await page.evaluate(() => Screens.show('vote'));
    await page.waitForFunction(() => !Input.pointerLocked);
    await page.evaluate(() => {
      const button = document.createElement('button'); button.id = 'test-vote'; button.textContent = 'Vote';
      button.onclick = () => window.voteClicked = true;
      document.getElementById('vote-options').appendChild(button);
    });
    await page.locator('#test-vote').click();
    assert.equal(await page.evaluate(() => window.voteClicked && !Input.pointerLocked), true);
    await page.evaluate(() => Screens.hideAll());
    await page.locator('#gl').click({ position: { x: 100, y: 100 } });
    await page.waitForFunction(() => Input.pointerLocked);
    await page.keyboard.press('Tab');
    await page.waitForFunction(() => !Input.pointerLocked);
    console.log('PASS: vote opens with a free mouse; buttons click; Tab releases world look');

    const walk = await page.evaluate(() => {
      // Keep the real controller, collision, and render geometry; advance input deterministically.
      Engine.setView(stage.view, null);
      const result = { stuck: null, obstruction: null, distance: 0 };
      const ray = new THREE.Raycaster();
      stage.land.group.updateMatrixWorld(true);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
      // Follow the paving itself: its curve bends away from the straight lines between anchors.
      const f = EstateLayout.footpath, stops = [];
      for (let s = 3; s < f.length; s += 3) { const p = f.sample(s); stops.push([p.x, p.y, p.z]); }
      stops.push(EstateLayout.path[EstateLayout.path.length - 1]);
      for (const point of stops) {
        let frames = 0;
        while (Math.hypot(point[0] - stage.rig.pos.x, point[2] - stage.rig.pos.z) > .15 && frames++ < 500) {
          const before = stage.rig.pos.clone();
          stage.rig.yaw = Math.atan2(-(point[0] - before.x), -(point[2] - before.z));
          stage.update(1 / 30); Input.endFrame();
          const travel = stage.rig.pos.clone().sub(before), length = travel.length();
          result.distance += length;
          if (length > .0001) {
            ray.set(before.add(new THREE.Vector3(0, 1.4, 0)), travel.normalize()); ray.far = length + .1;
            const hit = ray.intersectObject(stage.land.group, true)[0];
            if (hit) { result.obstruction = { at: stage.rig.pos.toArray(), name: hit.object.name, material: hit.object.material.type }; break; }
          }
        }
        if (frames >= 500) result.stuck = stage.rig.pos.toArray();
        if (result.stuck || result.obstruction) break;
      }
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
      result.atFire = stage.rig.pos.distanceTo(stage.land.anchors.fire) < 7;
      stage.dispose(); Engine.clearView();
      return result;
    });
    assert.equal(walk.stuck, null, JSON.stringify(walk));
    assert.equal(walk.obstruction, null, JSON.stringify(walk));
    assert.equal(walk.atFire, true, JSON.stringify(walk));
    assert.ok(walk.distance > 35);
    console.log('PASS: walked from the car to the fire with no wall or terrain obstruction');
    assert.deepEqual(errors, []);
  } finally { if (browser) await browser.close(); await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

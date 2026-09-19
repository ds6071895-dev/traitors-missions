/* Real Chromium audio graphs and WebSockets. Only the microphone hardware is
   replaced with a deterministic tone; capture, playback, and mute are real. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createServer } = require('../server');

(async () => {
  const app = createServer();
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + app.server.address().port;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox',
    '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required',
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
    '--enable-unsafe-swiftshader'] });
  const pages = [], errors = [];
  try {
    for (let i = 0; i < 3; i++) {
      const page = await browser.newPage(); pages.push(page);
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
      await page.addInitScript(() => {
        window.RTCPeerConnection = function () { throw new Error('P2P must not be used'); };
      });
      await page.goto(origin + '/health');
      await page.setContent(`
        <!doctype html><html><body><button>Enable audio</button>
        ${['room-socket', 'party', 'audio', 'server-audio', 'voicechat'].map(name =>
          '<script src="/js/core/' + name + '.js"></script>').join('')}
        </body></html>`);
      await page.click('button');
      await page.evaluate(async () => {
        // Check browser permission/capture before replacing hardware with a tone.
        const real = await navigator.mediaDevices.getUserMedia({ audio: true });
        real.getTracks().forEach(track => track.stop());
        window.toneContext = new AudioContext();
        await toneContext.resume();
        const source = toneContext.createOscillator(); source.frequency.value = 1000;
        const destination = toneContext.createMediaStreamDestination();
        source.connect(destination); source.start();
        navigator.mediaDevices.getUserMedia = async () => destination.stream;
      });
    }
    const [a, b, c] = pages;
    const code = await a.evaluate(() => Party.host({ name: 'Ana' }));
    await b.evaluate(code => Party.join(code, { name: 'Bo' }), code);
    await c.evaluate(code => Party.join(code, { name: 'Cy' }), code);
    for (const page of pages) {
      // Keep Boat Race's sustained mix running while exercising real voice.
      await page.addScriptTag({url:origin+'/js/boat/feedback.js'});
      await page.evaluate(() => {
        AudioBus.resume();
        window.boatAudio=BoatFeedback.audio();
        boatAudio.set({speed:45,tune:{boostTop:70},throttleIn:1,airborne:false,boosting:true,landed:0,impact:0});
        VoiceChat.init(); VoiceChat.listen();
        window.audioFrames = 0;
        const send = Party.room.sendAudio;
        Party.room.sendAudio = data => { audioFrames++; send(data); };
      });
    }
    await a.evaluate(() => VoiceChat.start());
    const hostId = await a.evaluate(() => Party.selfId());
    for (const page of [b, c]) {
      await page.waitForFunction(id => VoiceChat.level(id) > 0.02, hostId, { timeout: 10000 });
      assert.equal(await page.evaluate(() => VoiceChat.available), false, 'receive without enabling own mic');
    }
    console.log('PASS: microphone capture and audible playback reach both guests with Boat Race engine/water/wind/boost audio playing');
    await a.evaluate(() => VoiceChat.setMuted(true));
    await a.waitForTimeout(200);
    const mutedCount = await a.evaluate(() => audioFrames);
    await a.waitForTimeout(250);
    assert.equal(await a.evaluate(() => audioFrames), mutedCount);
    await b.waitForFunction(id => VoiceChat.level(id) < 0.01, hostId);
    await a.evaluate(() => { VoiceChat.setMuted(false); VoiceChat.setFloor('someone-else'); });
    await a.waitForTimeout(200);
    assert.equal(await a.evaluate(() => audioFrames), mutedCount, 'speaking floor suppresses outbound audio');
    await a.evaluate(() => VoiceChat.openFloor());
    await b.waitForFunction(id => VoiceChat.level(id) > 0.02, hostId);
    console.log('PASS: mute and speaking-turn gates stop transmission, then resume playback');
    app.rooms.get(code).members.get(hostId).ws.terminate();
    await a.waitForFunction(() => Party.reconnecting);
    await a.waitForFunction(() => !Party.reconnecting);
    await b.waitForFunction(id => VoiceChat.level(id) > 0.02, hostId);
    console.log('PASS: live voice recovers after a dropped server connection');


    // Exercise voice in both directions and clean capture/playback on a new room.
    await b.evaluate(() => VoiceChat.start());
    const guestId = await b.evaluate(() => Party.selfId());
    await a.waitForFunction(id => VoiceChat.level(id) > 0.02, guestId);
    for (const page of pages) await page.evaluate(() => { Party.leave(); VoiceChat.stop(); });
    const next = await c.evaluate(() => Party.host({ name: 'New host' }));
    await a.evaluate(code => Party.join(code, { name: 'Ana again' }), next);
    for (const page of [a, c]) await page.evaluate(() => { VoiceChat.listen(); VoiceChat.init(); });
    await c.evaluate(() => VoiceChat.start());
    const nextId = await c.evaluate(() => Party.selfId());
    await a.waitForFunction(id => VoiceChat.level(id) > 0.02, nextId);
    console.log('PASS: reverse-direction voice and audio after leaving/rejoining');
    assert.deepEqual(errors, []);
  } finally {
    for (const page of pages) {
      await page.evaluate(() => { Party.leave(); VoiceChat.stop(); if(window.boatAudio)boatAudio.stop(); toneContext.close(); }).catch(() => {});
    }
    await browser.close();
    await app.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

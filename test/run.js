/* Every logic test, in one go. `./test/run.js` or `node test/run.js`. */
const { execFileSync } = require('child_process');
const path = require('path');

const suites = ['performance.test.js', 'travel.test.js', 'session.test.js', 'privacy.test.js', 'agendas.test.js',
                'exposure.test.js',
                'mission-stats.test.js', 'twist-removal.test.js', 'swim.test.js',
                'aim-assist.test.js', 'touchguard.test.js', 'touchpad.test.js',
                'transport.test.js', 'mission-net.test.js', 'look.test.js',
                'turn.test.js', 'party.test.js', 'retry.test.js', 'websocket.test.js',
                'mission-server.test.js', 'mission-party.test.js',
                'bots.test.js', 'tutorial.test.js', 'music.test.js'];

if (process.env.THREE_TEST_ASSET) suites.push('descent.test.js');

let bad = 0;
for (const s of suites) {
  console.log('\n──────── ' + s + ' ────────');
  try {
    process.stdout.write(execFileSync(process.execPath, [path.join(__dirname, s)],
                                      { encoding: 'utf8' }));
  } catch (e) {
    process.stdout.write(e.stdout || '');
    process.stderr.write(e.stderr || '');
    bad++;
  }
}
console.log(bad ? '\n' + bad + ' suite(s) failed' : '\nall suites passed');
process.exitCode = bad ? 1 : 0;

/* Every logic test, in one go. `./test/run.js` or `node test/run.js`. */
const { execFileSync } = require('child_process');
const path = require('path');

const suites = ['performance.test.js', 'session.test.js', 'rules.test.js', 'privacy.test.js',
                'exposure.test.js', 'castle.test.js', 'doors.test.js', 'stage.test.js', 'touchguard.test.js',
                'transport.test.js', 'look.test.js',
                'turn.test.js', 'party.test.js', 'retry.test.js', 'websocket.test.js', 'voice-socket.test.js',
                'voice-worker.test.js', 'jitter.test.js', 'netcode.test.js',
                'ai-bridge.test.js', 'claudia-stream.test.js', 'ai-director.test.js', 'speech.test.js', 'encounters.test.js', 'company.test.js',
                'bots.test.js', 'tutorial.test.js', 'music.test.js', 'claudia-lines.test.js', 'wise-one.test.js', 'shield.test.js', 'talking.test.js',
                'figure.test.js'];

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

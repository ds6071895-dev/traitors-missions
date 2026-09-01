/* The Pages Function keeps the permanent Cloudflare key server-side and
   returns only short-lived, browser-usable TURN entries. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const H = require('./harness');
const { atest, eq, ok, section, report } = H;

const source = fs.readFileSync(
  path.join(__dirname, '..', 'functions', 'api', 'turn.js'), 'utf8'
).replace('export async function onRequestGet', 'async function onRequestGet');

function load(fetch) {
  const context = { fetch, Response, JSON, encodeURIComponent };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source + '\nglobalThis.handler = onRequestGet;', context,
                  { filename: 'functions/api/turn.js' });
  return context.handler;
}

async function run() {
  section('turn credentials function');

  await atest('refuses to run without server-side secrets', async () => {
    const handler = load(async () => { throw new Error('must not be called'); });
    const response = await handler({ env: {} });
    eq(response.status, 503, 'configuration error status');
    ok(/not configured/i.test((await response.json()).error), 'clear configuration error');
  });

  await atest('exchanges the secret and returns temporary TURN servers only', async () => {
    let request = null;
    const handler = load(async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ iceServers: [
        { urls: ['stun:stun.cloudflare.com:3478'] },
        { urls: [
            'turn:turn.cloudflare.com:3478?transport=udp',
            'turn:turn.cloudflare.com:53?transport=udp',
            'turns:turn.cloudflare.com:443?transport=tcp',
          ],
          username: 'temporary-user', credential: 'temporary-password' },
      ] }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    });

    const response = await handler({ env: {
      TURN_KEY_ID: 'key/id', TURN_KEY_API_TOKEN: 'permanent-secret',
    } });
    eq(response.status, 200, 'credential response status');
    ok(request.url.endsWith('/keys/key%2Fid/credentials/generate-ice-servers'),
       'key id is safely placed in the official endpoint');
    eq(request.options.headers.Authorization, 'Bearer permanent-secret',
       'the secret is used only for the server-to-server request');
    eq(JSON.parse(request.options.body), { ttl: 14400 }, 'credentials last four hours');

    const body = await response.json();
    eq(body.iceServers, [{
      urls: ['turn:turn.cloudflare.com:3478?transport=udp',
             'turns:turn.cloudflare.com:443?transport=tcp'],
      username: 'temporary-user', credential: 'temporary-password',
    }], 'STUN and the browser-blocked port 53 are removed');
    eq(response.headers.get('Cache-Control'), 'no-store', 'credentials are not cached');
  });

  await atest('does not expose upstream failure details', async () => {
    const handler = load(async () => new Response('private error', { status: 401 }));
    const response = await handler({ env: {
      TURN_KEY_ID: 'id', TURN_KEY_API_TOKEN: 'wrong-secret',
    } });
    eq(response.status, 502, 'upstream error becomes a gateway error');
    ok(!JSON.stringify(await response.json()).includes('private error'),
       'the upstream body was not sent to the browser');
  });

  report();
}

run();

/* Cloudflare Pages Function: exchange the permanent TURN key for
   short-lived browser credentials. The two environment bindings are
   configured in the Pages dashboard; neither secret belongs in git. */

const TTL_SECONDS = 4 * 60 * 60;

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function browserTurnServers(iceServers) {
  return (Array.isArray(iceServers) ? iceServers : []).map(server => {
    const urls = (Array.isArray(server && server.urls)
      ? server.urls : [server && server.urls])
      .filter(url => typeof url === 'string' && /^turns?:/i.test(url))
      /* Browsers block the alternate port 53 in Cloudflare's response.
         The standard UDP, TCP and TLS alternatives remain. */
      .filter(url => !/:53(?:\?|$)/.test(url));
    if (!urls.length || !server || typeof server.username !== 'string'
        || typeof server.credential !== 'string') return null;
    return { urls, username: server.username, credential: server.credential };
  }).filter(Boolean);
}

export async function onRequestGet(context) {
  const keyId = context.env.TURN_KEY_ID;
  const token = context.env.TURN_KEY_API_TOKEN;
  if (!keyId || !token) {
    return json({ error: 'TURN is not configured for this deployment.' }, 503);
  }

  let upstream;
  try {
    upstream = await fetch(
      'https://rtc.live.cloudflare.com/v1/turn/keys/'
        + encodeURIComponent(keyId) + '/credentials/generate-ice-servers',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl: TTL_SECONDS }),
      }
    );
  } catch (e) {
    return json({ error: 'Could not reach the TURN credential service.' }, 502);
  }

  if (!upstream.ok) {
    return json({ error: 'Cloudflare refused the TURN credential request.' }, 502);
  }

  let data;
  try {
    data = await upstream.json();
  } catch (e) {
    return json({ error: 'Cloudflare returned an invalid TURN response.' }, 502);
  }

  const iceServers = browserTurnServers(data && data.iceServers);
  if (!iceServers.length) {
    return json({ error: 'Cloudflare returned no usable TURN servers.' }, 502);
  }
  return json({ iceServers }, 200);
}

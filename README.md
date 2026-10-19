# The Traitors

A low-poly, bright browser game of **The Traitors for five to eight people**, with voice
chat, played in a browser with no account and no install. Three ways in:

- **PLAY** opens the lobby: **CREATE ROOM**, read out the four letters, and that is the
  whole sign-up. Five seats are needed to start and the castle seats eight; empty chairs
  can be filled with **AI contestants you can actually talk to**, and Claudia herself can
  be a **live AI host** (see *AI players and AI Claudia* below — a Deepgram key, no card).
- **DRESSING ROOM** is where you decide who you are. Saved on your own machine; the
  others see exactly what you built.
- **EXPLORE THE CASTLE** walks you round the house the game happens in: the entrance
  hall, the great hall, the round table chamber, the turret, and the bedrooms.

**Multiplayer uses a Node.js WebSocket server for rooms, game messages, and voice.** Room
codes are four letters, and the host's browser runs the game's rules.

## How a game goes

| Beat | What happens |
| --- | --- |
| **The welcome** | On the hill in the Highland sun. Claudia welcomes you and tells each of you, privately, what you are. One Traitor at five or six, two at seven or eight, and two Traitors know each other. Then up to the house. |
| **The day in the castle** | Three minutes loose in the house (the host can shorten it in the lobby, down to 30 seconds). Everybody has a list of **jobs** — little puzzles at glowing stations round the castle, each worth £500 to the pot. Some lists have a **sealed letter** to hand to somebody: walk up to them and hold `E`. **One Traitor carries the poison**: walk up to a Faithful and hold `F` for a couple of seconds. It looks *exactly* like handing over a letter, and anybody looking sees it. A bell rings thirty seconds before the end (a third of the way out on a short day). |
| **The round table** | If the carrier never used the poison, Claudia exposes them on the spot — that is the day's banishment, and there is no vote. Otherwise: an open discussion, with how many jobs everybody did on the board, until Claudia calls it; then everybody writes a name, the slates are turned one at a time, a tie is voted again, and tied twice Claudia draws. The banished say what they were. |
| **The night** | Everybody to their room, and the door locks. The poison takes. The Traitors meet in the turret — with two of them, they choose who carries tomorrow; having lost one of their own, they may offer a Faithful a seat (who may refuse at no cost). The poisoned find a letter under their door. |
| **Breakfast** | One or two at a time through the great hall's door, the camera on it, the table turning to look. The empty chair is the news. |
| **Again, or the fire** | The day repeats until four or fewer are left. Then the **Fire of Truth**: everybody speaks in turn, then **End** or **Banish Again** — ending must be unanimous; one Banish and somebody else goes, down to the final two. Then every pouch is opened. |

The poison is the only way anybody dies. The murdered and the banished stay to watch;
the living cannot hear them.

### What you have to go on

- **Your notebook** (`N`). Every few seconds the house writes down who you were with and
  where, and every hand-over you could see — *"2:14, you saw Fergus hand something to
  Isla in the Great Hall."* It is yours: nobody else is told what you saw.
- **The board.** How many jobs everybody finished. A Traitor who spent the day following
  somebody round the house has a short line, and has to explain it.
- **Your ears.** Voices carry the way they would in a stone house: loud beside you, a
  murmur through a door, almost nothing from the far end of the castle. A word in the
  turret stays in the turret.
- **The minimap** shows the rooms, your jobs and the people in the room with you.

### The jobs

Twenty kinds of puzzle, each a few seconds, none of them failable for good: crack a
portrait safe from a combination glimpsed on the back of the frame; rewire the
chandelier; light the candelabra in the order scratched into the wax; pour a dram to the
line; ring the bells' tune back; sort the post by its seal; find the clan tartan; tune the
harp until its string sits on the ghost; shoo the bats; pick a lock; work the bellows;
brew the laird's tonic; turn up the matching place cards; straighten the portraits; spot
the forgery; rack the claret by its year; catch the pantry mouse; turn the cistern pipes
until the water runs; balance the scales; rub a bedroom window clean. Each panel stamps
its goal as it opens, says how in one line, and shows how far along you are in pips. Every list sends you to five different places,
at least one of them somewhere quiet — the turret, the bedroom corridor, your own room —
because a job that takes you somewhere quiet is a job that might get you killed.

### Controls

| | |
| --- | --- |
| Walk and look | **WASD** to move, **mouse** to look (click to capture it, **Tab** to free it); on a phone, the stick and a drag |
| A job | walk into its gold ring, press **E**; **Esc** walks away from the puzzle |
| A letter | face the person, hold **E** |
| The poison | face a Faithful, hold **F** — carrier only |
| Notebook | **N** |
| Your microphone | **V**, or the button in the corner |
| Voting | a panel of buttons; mouse, thumb and keyboard all drive it |

## AI players and AI Claudia

Optional, and the host's choice in the lobby. Paste a **Deepgram** API key into the AI
panel — Deepgram gives **$200 of free credit and asks for no card** — then add AI
contestants to fill the empty chairs, and tick **AI Claudia** for a live host.

- **AI contestants** are full players: dealt a role, a name, a look and a voice of their
  own. In the castle the host walks them round the house doing their jobs and handing
  over their letters; an AI Traitor carrying the poison acts normally for a while, then
  picks somebody on their own and waits until nobody is looking. They talk the way a room
  does: say something and **one** of them answers after a beat, often **another** picks it
  up, and with a crowd sometimes a third — one at a time, never together, and the moment
  a person speaks they stop and listen. By day only the ones **within earshot** hear you.
  Each one argues at the round table from what it actually saw (its own notebook), votes,
  meets in the turret, answers an offer, and takes its turn at the fire. Every decision
  is a tool call that sends the same action a button would.
- **AI Claudia** reads every one of her lines in a British Deepgram voice — the room's
  lines and the ones only you may hear — and decides when a discussion is over. Each
  browser asks the room server for its own reading of each line, so "You are a Traitor"
  is read in her voice to the Traitor and nobody else. The browser's own voice is only a
  fallback for a line the server could not read (no key, or Deepgram refused it).
- **How it is wired.** The key goes once to the room server, lives in that room's memory
  and is never sent to any player. The server opens one Deepgram Voice Agent per AI voice,
  one streaming transcription per person, and Deepgram text-to-speech for Claudia's
  lines. AI voices arrive as ordinary voice frames. Nothing is opened until the host asks,
  and everything closes when the room does. A `DEEPGRAM_API_KEY` environment variable on
  the server works instead of pasting.
- **Cost.** About $0.075 a minute per AI voice while it is open, well under a cent a
  minute per transcribed person, and a few cents of speech per player for Claudia's lines.
- **Without a key** nothing changes: Claudia uses the browser's speech voice, and the
  host's moderator still ends a discussion when everybody has spoken and the room is quiet.

## Run locally

Install Node.js 22 or newer, then run:

```sh
npm ci
npm start
```

Open `http://localhost:8080`. `./serve.sh 8080` starts the same server. `PORT` and `HOST`
can override its listening address. Solo practice also works without the server.

## Deploy the game and room server

Use a Node.js service with persistent WebSocket connections. The repository includes a
`Dockerfile`, or configure your host with:

- Install command: `npm ci --omit=dev`
- Start command: `npm start`
- Health-check path: `/health`
- A public **HTTPS** URL, with WebSocket upgrades forwarded to `/rooms`

The Node process serves the game as well as its sockets. Share that HTTPS URL with
everybody. HTTPS is required for microphone access on phones and other machines;
plain LAN HTTP can carry game messages but browsers generally block microphone capture.
No TURN credentials, Trystero, Nostr relays, or separate audio service are needed.

Run **one server instance** with one Node process. Rooms live in that process's memory;
a restart ends them. Horizontal scaling would require shared room routing/state and is
not implemented. If using a reverse proxy, enable WebSocket upgrades and an idle timeout
of at least 60 seconds. A static-only Cloudflare Pages upload does not run this server.
The old `functions/api/turn.js` is retained for legacy deployments and is not used by
the new game page.

The server compresses text assets and revalidates cached files with ETags. Rendering
runs on each player's device: new saves use Medium scenery, pixel counts are capped,
and sustained slow frames reduce render resolution automatically. Low frame rates use
bounded simulation steps so movement does not slow down with the display. After updating,
restart the Node service and reload every player's page so client and server code agree.

For a separately hosted frontend, set `window.ROOM_SERVER_URL` to the full
`wss://YOUR-NODE-HOST/rooms` URL **before** loading `room-socket.js`, and set the Node
server's `ALLOWED_ORIGINS` to the frontend's exact HTTPS origin. Multiple allowed origins
are comma-separated. Same-origin deployment needs neither setting.

## Connection and voice behaviour

- Only one join/create attempt runs at a time. Leaving cancels it; late callbacks cannot
  reopen a room or modify the next room.
- The server assigns collision-checked codes, player IDs and seats, rejects missing/full
  rooms explicitly, and stamps every message with its actual sender.
- A brief socket interruption automatically reconnects with the same identity. The server
  reserves the seat for 15 seconds after detecting disconnection and replays unacknowledged
  game messages. Sequence numbers suppress duplicates. Live positions in the castle and
  audio bypass replay queues and are dropped when the socket backs up.
  A page reload starts a new player session; it is not a saved-game
  resume. Explicit Leave removes a connected player immediately.
- Returning to the lobby reopens room admission, so a replacement player can join
  between games. Starting a game closes admission until the host returns.
- The host continues to own game state and secret roles. Targeted roles are delivered only
  to that player. The server is a room/message relay, not a new game simulation.
- Voice uses AudioWorklet capture/playback and 24 kHz mono PCM16 over the same socket.
  Permission, mute, voice meters and speaking-turn gates stay in `VoiceChat`. Playback has
  a bounded jitter buffer. Capture skips silence and discards packets older than 120 ms
  after a main-thread stall. Voice is never recorded or replayed by the server. At full
  continuous transmission, each microphone sends about 48 KB/s; a full room's server audio
  egress is about 288 KB/s. This deliberately simple format trades bandwidth for broad
  browser support; congested TCP connections can add voice latency.
- Game joining does not depend on microphone permission. Modern browsers with AudioWorklet
  support can listen without enabling their own microphone. Voice failure leaves gameplay
  connected. A player who leaves mid-game is out, as if banished; the host must remain.

## Verification

```sh
npm test
```

The logic suite plays whole games without a browser. `session.test.js` drives the day
in the castle (jobs, letters, the poison and who saw it), the night, breakfast, the
exposure and the fire through the reducer; `rules.test.js` plays thousands of seeded
games of five to eight with random legal play — including carriers who lose their nerve —
and checks the poison is the only way anybody dies, that every game ends, and that the pot
goes to the right people; `privacy.test.js` checks that no role, job list, notebook or
poison ever leaks into the shared state; `castle.test.js` checks who can see a hand-over
through walls and doorways and that the AI contestants can walk everywhere;
`ai-director.test.js` checks the AIs answer the room one at a time; and `ai-bridge.test.js`
runs the whole Deepgram path — agents, transcription and Claudia's lines — against a fake
Deepgram on localhost. `figure.test.js` builds and moves the people with the real three.js
— skin weights, heights, planted feet at changing speeds, reaches, the pouch throw,
sitting on a chair — and is skipped unless `THREE_CJS` points at a `three.cjs` (three
comes from a CDN and is not a dependency):

```sh
npm pack three@0.160.0 && tar xzf three-0.160.0.tgz
THREE_CJS=$PWD/package/build/three.cjs npm test
``` The WebSocket tests cover admission, private routing, voice routing
(the turret and the dead), reconnection and retry. Physical devices and production HTTPS
still need a smoke test after deployment.

## Under the hood

- **`Session`** (`js/core/session.js`) is the only authority: a reducer over plain actions,
  run by the host. Roles, the carrier, the poison, job lists and notebooks live in a closure
  and leave only as a per-person `privateView`. Where people stand is not its business —
  the host's castle scene answers through `Session.setEyes({ reach, witnesses, presence })`.
- **`CastleNet`** keeps everybody's position by day: ten poses a second from each browser,
  one packet of AI poses from the host, on the room's live channel. It is also the host's
  eyes: a hand-over is seen by anybody in the same room (or right by the door) who is
  facing it.
- **`CastleBots`** walks the AI contestants: an A* grid over the floor plan with the
  furniture taken out, jobs, letters, and the patient Traitor.
- **`Chores`** is the job catalogue and the deal; **`ChoreGames`** the twenty puzzles.
- **`TasksScene`**, **`RoundtableScene`**, **`NightScene`**, **`BreakfastScene`**,
  **`FinaleScene`** are the rooms; **`Show`** decides which one is on screen.
- **`AIDirector`** decides which AI speaks, when, and what each one knows.
- **`Figure`** (`js/entities/figure.js`) is every person on screen. A real-proportioned
  skeleton (`figure-skeleton.js`) carries six skinned, lofted surfaces — skin, jacket,
  trousers, hair, eyes, and one for hat and scarf — built and cached per build (`figure-body.js`).
  `figure-anim.js` moves them: feet planted by IK on a gait driven by how far the figure
  really moved, sitting down and standing up, gaze, a talking face, moods, and the acts in
  `figure-clips.js` (a nod, a shrug, a gasp, pointing at a slate's name, the hand-over).
  Scenes ask through the stage: `stage.act(id, 'gasp')`, `stage.setMood(id, 'nervous')`,
  `stage.pointAt(id, where)`.
- **`Voice`** reads Claudia's lines — through the room server's Deepgram voice when there
  is a key, through the browser otherwise — on one text-derived clock, so subtitles,
  cameras and every browser stay together.

### Rehearsing a game on your own

`bots.js` is a development door in the address bar, with no button anywhere:

```
?bots=1                     the whole game, hand dealt from the seed (five seats)
?bots=all&n=8               a table of eight
?bots=tasks,table           a day in the castle and the round table
?bots=finale                the fire and nothing else
?bots=all&traitor=you       you are a Traitor (and carry the poison)
?bots=all&traitor=none      nobody is
?bots=finale&target=you     and they all name you
```

Both rehearsal levers — choosing the Traitor and skipping parts — are refused unless the
call that started the game declared itself a rehearsal, and `Bots` is the only thing that
ever does.

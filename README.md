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
  hall, the great hall, the round table chamber, the turret and the bedrooms, and the two
  wings either side — the library, chapel, kitchen and scullery to the west; the long
  gallery, billiard and drawing rooms, the laird's study, the gun room and the
  conservatory to the east. Every door in the wings opens and shuts.

**Multiplayer uses a Node.js WebSocket server for rooms, game messages, and voice.** Room
codes are four letters, and the host's browser runs the game's rules.

## How a game goes

| Beat | What happens |
| --- | --- |
| **The welcome** | On the hill in the Highland sun. Claudia welcomes you and tells each of you, privately, what you are. One Traitor at five or six, two at seven or eight, and two Traitors know each other. Then the band turns and Claudia has one more thing: **the Traitors choose a Wise One**. They get ten seconds and a list of Faithfuls; everybody else watches the clock. A rise, a hit, and the Wise One is told, and so are the Traitors. Nobody else is. Then up to the house. |
| **The day in the castle** | Three minutes loose in the house (the host can shorten it in the lobby, down to 30 seconds). Everybody has a list of **jobs** — little puzzles at glowing stations round the castle, each worth £500 to the pot. Some lists have a **sealed letter** to hand to somebody: walk up to them and hold `E`. **One Traitor carries the poison**: walk up to a Faithful and hold `F` for a couple of seconds. It looks *exactly* like handing over a letter, and anybody looking sees it. Any **door** can be shut with `E`: a room with every door shut is private, and nobody outside sees in or hears a word — though anybody can open it again, and whoever sees you shut it remembers. A bell rings thirty seconds before the end (a third of the way out on a short day). **The shield:** whoever has done the most jobs when the day ends (a tie goes to whoever got there first) cannot be killed by the poison that night, and that night only. The HUD shows who is leading all day, so the carrier can see it too. |
| **The night** | Everybody to their room, and the door locks. Claudia names the shield holder. The poison takes, unless it went into them. The Traitors meet in the turret — with two of them, they choose who carries tomorrow; having lost one of their own, they may offer a Faithful a seat (who may refuse at no cost). The poisoned find a letter under their door. |
| **Breakfast** | One or two at a time through the great hall's door, the camera on it, the table turning to look. The empty chair is the news, and then everybody goes through to the round table. If the poison went into the shield holder, nobody is missing, and Claudia says who it was meant for. The round table then opens on that near miss. |
| **The round table** | Straight from breakfast, with the body fresh and yesterday's hand-overs in everybody's notebook. If the carrier never used the poison, Claudia exposes them on the spot — that is the day's banishment, and there is no vote. Otherwise: an open discussion, with how many jobs everybody did on the board, until Claudia calls it; then everybody writes a name, the slates are turned one at a time, a tie is voted again, and tied twice Claudia draws. **Once a game, the Wise One may overrule**: their vote panel has an *Overrule the table* switch. Claudia warns the room that one slate outranks the rest, the Wise One's slate is turned last, and whoever it names is banished whatever everybody else wrote. The banished say what they were. |
| **Again, or the fire** | After the table, the day repeats until four or fewer are left. Then the **Fire of Truth**: everybody speaks in turn, then **End** or **Banish Again** — ending must be unanimous; one Banish and somebody else goes, down to the final two. Then every pouch is opened. |

The poison is the only way anybody dies. The murdered and the banished stay to watch;
the living cannot hear them.

### What you have to go on

- **Your notebook** (`N`). Every few seconds the house writes down who you were with and
  where, and every hand-over you could see — *"2:14, you saw Fergus hand something to
  Isla in the Great Hall."* — and who you saw shut a door, and when you were behind one.
  It is yours: nobody else is told what you saw.
- **The board.** How many jobs everybody finished. A Traitor who spent the day following
  somebody round the house has a short line, and has to explain it.
- **Your ears.** Voices carry the way they would in a stone house: loud beside you, a
  murmur through a doorway, almost nothing from the far end of the castle. Behind a shut
  door, nothing at all, either way: the server only sends a voice in a shut room to the
  others in it.
- **The minimap** shows the rooms, the doors (red when shut), your jobs and the people
  in the room with you.

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
at least one of them somewhere quiet — the turret, the chapel, the study, your own room —
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
- **Company by day.** Say *"Morag, follow me"* (or just *"come with me"* to whoever is
  nearest) and the AI decides for itself: if it agrees it says so and walks behind you,
  through doors and into the room, clear of the doorway so you can shut the door on the
  two of you. *"You can go"* sends it back to its jobs. AIs come to you too: one may ask
  for **a word in private** — a Faithful with a suspicion to share, a Traitor with a seed
  to plant — and on a yes it leads you to a room with one door and shuts it. A Faithful
  will not go off alone with somebody it suspects, and if somebody it suspects reaches for
  it or shuts it in, or it comes to suspect them mid-conversation, it makes for the
  busiest room in the house — and remembers.
- **Alliances.** Say *"Isla, want to team up?"* and the AI decides from its read of you: a
  Faithful turns down somebody it suspects or who betrayed it before, a Traitor happily
  takes a Faithful as cover. AIs offer deals too — behind a shut door, between jobs, and to
  each other. An ally is told who you said you are voting for, will not vote you out, and
  remembers it if you put its name on your slate (that ends the alliance). *"Our alliance
  is over"* ends one out loud.
- **They talk to each other.** An AI that asks another a question by name gets an answer
  from that one — a few exchanges, then the room is yours again, and a person speaking
  ends it at once. Two AIs working side by side have a word you can overhear; with nobody
  about, they just remember it. At breakfast, in the lulls, they turn to each other about
  last night.
- **Playing to win.** Each AI keeps a read on everybody *with reasons* — who voted out a
  Faithful, who stood up for somebody who turned out a Traitor, who it saw hand what to
  whom, who keeps pointing at it — and a plan for the phase: whom to press, whom to
  defend, whom to ally with; a Traitor whom to frame or poison, and when to vote out its
  own partner because the room has already decided. Every turn it takes starts with who
  is still playing and who is gone, so nobody talks to the dead.
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
  the server works instead of pasting. The contestants think with OpenAI's
  `gpt-4.1-mini` through Deepgram (`DEEPGRAM_THINK_MODEL` changes it); if the account
  cannot use it, each voice falls back to `gpt-4o-mini` (`DEEPGRAM_THINK_FALLBACK`).
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
- Voice has a socket of its own: once in a room, each page opens `/rooms?voice=1` from a
  Worker (`js/core/voice-worker.js`) and proves its seat with the session token, so a
  burst of game state never queues a voice frame behind it. The worker is wired straight
  to the capture and playback AudioWorklets, so a slow frame on the page never breaks
  anybody's voice. A reverse proxy that forwards `/rooms` forwards this too, since it is
  the same path.
- The room speaks **Opus** (WebCodecs, 24 kbps) while every person in it has a voice
  socket and a browser that can decode it, and 24 kHz PCM16 otherwise. The server decides
  and tells everybody; every frame is tagged with its codec, a sequence number and a
  talkspurt-start bit. Per talker that is about 5 KB/s into each listener instead of
  50 KB/s. A page whose voice socket is down still hears PCM on the game socket and sends
  on it. The server never decodes voice: Deepgram transcription of Opus voices is fed as
  Ogg Opus.
- Playback is an adaptive jitter buffer (60–250 ms, learned per talkspurt from how late
  frames run). It fades rather than clicks on a gap, picks up again quickly after running
  dry, and steers its depth by playing a couple of percent slow or fast. It never drops
  everything to catch up. Capture skips silence, with a 400 ms hangover and the frame
  before speech sent as a lead-in. Voice is never recorded or replayed by the server.
- Claudia's lines (with an AI Claudia) are read by Deepgram once per room, however many
  people ask, and streamed: her first frame goes out while the rest is still being read,
  and a long line's first sentence is fetched on its own. Scenes ask the server to read
  her next fixed line ahead while she is speaking. Every server-made voice is paced by
  one clock that makes up lost time after a stall, and her caption and reading clock
  start when her voice does.
- The host sends one message per tick of the session, with the state in it once, and
  none when the state has not changed. Castle poses carry the sender's clock and are
  drawn 120 ms in the past, between two real poses, so a clumpy connection still shows
  a steady walk. Open the game with `?net=1` for an overlay of round trip, jitter, bytes
  each way, frame rate and each voice's buffer, to tell a slow line from a slow machine.
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
`doors.test.js` checks which rooms a door seals, who may move a door, and that a shut
room is out of sight and out of earshot;
`ai-director.test.js` checks the AIs answer the room one at a time; `company.test.js`
checks an AI asked along follows you into a room you can shut, leads you to one when it
wants a word, and runs from somebody it suspects; and `ai-bridge.test.js`
runs the whole Deepgram path — agents, transcription and Claudia's lines — against a fake
Deepgram on localhost. `figure.test.js` builds and moves the people with the real three.js
— skin weights, heights, planted feet at changing speeds, reaches, the pouch throw,
sitting on a chair — and is skipped unless `THREE_CJS` points at a `three.cjs` (three
comes from a CDN and is not a dependency):

```sh
npm pack three@0.160.0 && tar xzf three-0.160.0.tgz
THREE_CJS=$PWD/package/build/three.cjs npm test
``` The WebSocket tests cover admission, private routing, voice routing
(the turret and the dead), reconnection and retry; `voice-socket.test.js` covers the
voice socket and codec negotiation, `voice-worker.test.js` the worker against fake
WebCodecs, `jitter.test.js` the playback buffer against a simulated bad line,
`netcode.test.js` the batched wire and pose interpolation, and `claudia-stream.test.js`
Claudia's shared, streamed lines. Physical devices and production HTTPS still need a
smoke test after deployment.

## Under the hood

- **`Session`** (`js/core/session.js`) is the only authority: a reducer over plain actions,
  run by the host. Roles, the carrier, the poison, job lists and notebooks live in a closure
  and leave only as a per-person `privateView`. Where people stand is not its business —
  the host's castle scene answers through `Session.setEyes({ reach, witnesses, presence })`.
- **`CastleNet`** keeps everybody's position by day: ten poses a second from each browser,
  one packet of AI poses from the host, on the room's live channel. It is also the host's
  eyes: a hand-over is seen by anybody in the same room (or right by an open door) who is
  facing it. The floor plan (`CastleLayout`) says which doors there are and which rooms
  a shut door seals; the session keeps which are shut and turns the people in a sealed
  room into a voice route of their own.
- **`CastleBots`** walks the AI contestants: an A* grid over the floor plan with the
  furniture taken out, jobs, letters, and the patient Traitor. They open a shut door that
  is in their way, and the carrier shuts one behind it before reaching for somebody.
  They follow whoever they agreed to go with, lead somebody to a one-door room for a
  private word, and a Faithful runs from somebody it suspects (`AIDirector.distrusts`).
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

# The Traitors

A low-poly, vibrant browser game for **three real people**, with voice chat, played in
a browser with no account and no install. Three ways in:

- **PLAY / CREATE ROOM / JOIN ROOM** runs a whole night for three — a welcome on a
  Highland hill, one mission played with every microphone open, and a finale at the fire
  where one name is said and the pot is won or lost on it. You type a name, somebody
  reads out four letters, and that is the entire sign-up.

  There is always exactly one Traitor, and their secret task is a thing they have to
  *say out loud* while the other two are listening. Nothing in the game can hear a
  microphone, so the Traitor marks the card themselves during the mission — leave it
  unmarked and Claudia exposes you at the fire; mark one you never said and the verdict
  screen prints the card in front of the two people who were on the call with you.
- **MISSIONS** is solo practice on the missions themselves. Four are built: **Boat
  Race**, **Shootout**, **The Dive**, and **The Descent**.
- **DRESSING ROOM** is where you decide who you are. Saved on your own machine; the
  other two see exactly what you built.

Open `index.html` in a browser. Everything is plain `<script>` tags, so it works
straight off disk (`file://`) for solo practice and the dressing room.

**Multiplayer uses a Node.js WebSocket server for rooms, game messages, and voice.**
The browsers no longer need to discover or connect directly to each other. Room codes
remain four letters, and the host browser still runs the existing game rules.

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

The Node process serves the game as well as its sockets. Share that HTTPS URL with all
three devices. HTTPS is required for microphone access on phones and other machines;
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
  game messages. Sequence numbers suppress duplicates. Live positions, repeating world
  snapshots and audio bypass replay queues and are dropped when the socket backs up.
  A page reload starts a new player session; it is not a saved-game
  resume. Explicit Leave removes a connected player immediately.
- Returning to the lobby reopens room admission, so a replacement player can join
  between missions. Starting a mission closes admission until the host returns.
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
  connected. As before, a full night closes when a player actually leaves; a mission party
  can continue after a guest leaves, but the host must remain.

## Verification

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run test:interaction-browser
```

The logic suite includes real three-client WebSocket tests for admission, private routing,
reconnection, audio frames, and retry cancellation. The browser test uses real audio graphs
and server connections with a generated microphone tone to check audible playback, mute,
speaking turns, and leaving/rejoining. The game-page browser test exercises a full-night
handshake and all four mission parties: scene construction, start barriers, live positions,
real finish paths, shared scoreboards, and returning to the room. It skips GPU drawing to
avoid software-renderer timing noise; this is a lifecycle test, not a visual or performance
benchmark. Physical devices and production HTTPS still need a smoke test after deployment.
The interaction suite keeps rendering enabled and checks real pointer lock, clickable
votes, and a continuous walk from the returning car to the fire through the lantern path.

---

## Playing a night

| Beat | What happens |
| --- | --- |
| **The hill** | Claudia welcomes you and tells you what you are. Nobody else is told. A Traitor is also handed a task. |
| **Mission** | One of the missions, drawn from the seed, played by all three of you at once. Everything anybody earns goes into the night's pot. |
| **The board** | Everybody's numbers from that mission, side by side. It accuses nobody. |
| **The fire** | One voice at a time — thirty seconds each — then one ballot: everybody names somebody, and that person's pouch goes into the fire. |

The night is short on purpose. It used to be two missions with a round table between
them, which is the shape of the television programme and the wrong shape for three
people on a voice call: most of an evening went on missions and the discussion spent
itself re-litigating a scoreboard. What is worth playing here is the microphone, so
everything that is not traitoring has been taken out.

### The roles

Roles are drawn once, from the run's seed. **There is always exactly one Traitor**,
uniform over all three players — which makes any one of you, yourself included, the
Traitor on a third of all nights. There used to be a quarter of nights with nobody in
them, and a night whose answer turns out to be "there was never anyone here" is an
evening three people spent for no reason.

You are told your own role on the hill, and nobody else's. Everybody knows there is a
Traitor; nobody can prove which. That is the whole game.

### The Traitor's task

A Traitor is handed one piece of work on the hill, on a card only they see. It is not a
thing to *do*. It is a thing to **say out loud**, on the open microphone, while the other
two are listening.

The deck used to be telemetry — burn the boost meter before halfway, decline three gold
rings, come to a dead stop in open water — checked on the host against numbers the
mission reported. That made it unfakeable and made it, in the end, a game about driving
a boat slightly wrong. The channel is the thing all three of you are guaranteed to be
paying attention to, so that is where the task lives now.

**Every task has a public tell, and every task has a way out.** That pair is still the
whole design. A task nobody can hear being performed is not a risk — it makes the fire
unwinnable for the Faithfuls. One nobody can survive performing is not a game either. So
every card in `js/missions/agendas.js` carries both: a `tell`, naming what the other two
actually hear, and an `alibi` — a harder, better performance that leaves the same words
in the room attached to a reason nobody can argue with.

On the best cards the alibi is not damage control at all. It is a chance to say the
wisest thing anybody says all night, and have it be true.

| Family | The task | The way out |
| --- | --- | --- |
| **Aphorism** | Say a whole invented line of wisdom, word for word — *"Nobody drowns in the middle. They drown at the edge, reaching for it."* | Do not say it. Wait for it to be **true** — for somebody to overreach for something they nearly had — and it stops being a line you were carrying and becomes the best thing said all night |
| **Word** | Work one loaded word from a different evening into a sentence — *gallows*, *inheritance*, *perjury*, *eulogy* | Give it somewhere to live. Deliver a short eulogy for your own attempt, warmly, and nobody replays the word |
| **Claim** | Say something specific, personal and checkable — *"I can hear my own heartbeat."* | Say it at the tensest moment there is, when it is true for all three of you |
| **Formal** | Say something in the wrong register for three people shouting at a mission — *"I should like it noted that I said so."* | Be right about something first. A formal sentence from somebody who has just been right is a joke everybody is in on |
| **Number** | Say a number nobody asked for — *seventy-three* | Make it count something real and be right. The person keeping numbers nobody asked them to keep is the person paying most attention |
| **Question** | Ask one of them something out loud — *"What would you do with the money if the other one was not here?"* | Ask it as an obvious joke, to their face, while they are winning |
| **Move** | Not a phrase: a way of talking held for a whole mission — never say "I", go a full minute in silence, never once agree | Commit completely. A run spent talking about nobody but the other two is generosity — until one of them notices you never said what *you* were doing |

There are **224 cards**, built from a corpus rather than typed out one at a time, and
that is deliberate. Three people play this more than once. A deck of nine is a deck two
of them have memorised by the third night, and a memorised deck is not a secret task —
it is a quiz the Faithfuls already have the answers to. Two hundred phrases means the
other two can know exactly how the deck works and still have no idea what you are
carrying.

#### Nothing checks it, and that is the mechanic

No part of this game can hear a microphone. Judging one of these on the host would mean
speech recognition on three live voice streams to catch a whisper — and the cards worth
playing (silence, brevity, refusing a name, never agreeing) are invisible to it anyway.

So the task is marked by the only person who knows: the Traitor, on their own HUD,
**during the run**. Three things hold that up.

- **The window is the mission.** The mark button dies the moment the numbers stop. You
  cannot settle up on a card once you have seen how the night is going, and having to
  commit while you still have something to lose is the whole weight of an honour system.
- **Not marking it is an exposure.** Bottle the card and Claudia stops the room before
  anybody sits down at the fire, names you, and the Faithfuls take the pot on the spot.
  So the choice is between paying for it and lying about it.
- **Lying about it is answered at the end.** The verdict panel prints the card, word for
  word, and whether it was marked — next to every role, after the money is paid. The two
  people who were on that microphone with you read it and know immediately. Nobody needs
  code to check that. They were there.

The mark is deliberately silent on the wire: nothing goes into the shared state and no
event is emitted, because a packet leaving your machine at the exact moment you say the
thing you were told to say is a tell the other two could watch for.

`test/agendas.test.js` asserts every one of the 224 cards has a task, a tell and a way
out, that every generated card actually contains the phrase it is asking for, that no
family falls back to a shared alibi, that the seeded draw can reach all of it, and that
the marking window latches shut and never reopens.

### Voice, and the floor

The microphone is open in the lobby, the dressing room and the mission. The mission is
deliberately a free-for-all: all three microphones live at once, no turns, no order, cut
in whenever you like. That channel is where the Traitor's card has to be performed, and
it is the reason the night has one long mission rather than two short ones and an
argument about a scoreboard.

At the fire it is not open. There the floor goes round the seats, thirty seconds each,
and only the person holding it can be heard — that is the room where the name gets said.
Any of you may press **I've said enough** to hand it back early.

That muting happens on the **sending** side — `track.enabled = false` at the microphone
— so holding the floor is a fact about the room rather than a request the other two
clients are trusted to honour. Either way the clock belongs to the host, because a
discussion timed in a player's own browser stops when their tab is throttled, which is
exactly the moment they would rather it did not.

Nobody is announced at the open table, so the edit listens to the room: whoever has been
the loudest voice for about a second gets the camera, a quiet room widens back out to
the two faces opposite you, and every cut holds for a few seconds — an edit that chases
every interruption is unwatchable.

Nothing here is required. A refused permission, no microphone, or a `file://` origin all
land in the same place: the game says so once and the night carries on in text.

### The endgame

There is one ballot. Everybody names somebody, the whole ballot is collected before any
of it is revealed, and the names are then spoken aloud one at a time before the tally —
so the result can never jump straight from a button press to an answer. A tied tally is
voted again; it is never broken randomly. The named player's role pouch goes into the
fire, which at three contestants leaves two, and the night stops itself there.

There used to be a **Fire of Truth** in front of it — end the game, or banish again,
unanimous to stop. That is the right ballot for a table that cannot be sure anybody is
lying to them. There is always a Traitor here, so "shall we bother" was never a real
question, and asking it twice a round only gave three people a way to end the night
without playing it.

When the night stops — by reaching the final two — nobody is told
who won until every identity still in the circle is revealed. Faithfuls reveal first;
any surviving Traitor is held until last. The verdict panel comes up after that, not
before. Banished contestants receive nothing. Surviving Faithfuls split the pot only if
no Traitor remains; otherwise the surviving Traitor takes it.

You win as a **Faithful** if the night ends with you still there and no Traitor left
alive. You win as a **Traitor** if it ends with you still there. Winning banks the pot;
losing loses it. Nothing is banked until the fire goes out.

### Controls, everywhere

| | |
| --- | --- |
| Menus | mouse, touch, **arrow keys** and `Tab`, `Enter` to choose, `Esc` to go back |
| Hill and fire | first person: **WASD** to move, **mouse or arrows** to look; click once to capture the mouse, on a browser that has a pointer to capture |
| Free the mouse | **Tab** releases mouse look; menus and voting release it automatically. Click the world to look again. |
| Dialogue | Voiceover cannot be skipped; clicks capture the pointer without cutting a line short |
| Pouch reveal | The camera unlocks only for the short cinematic as the pouch is thrown into the fire |
| The fire | the vote is a panel of buttons; mouse, thumb and keyboard all drive it |
| Missions | as documented below; touch controls appear on any device with a finger on it |
| The Dive | one button: `Space` (or `LMB`) kicks, the mouse steers, `WASD` sculls |
| Your microphone | `V`, or the button in the corner. It is separate from game sound, and it is on every screen |
| Marking your task | `T`, or tapping the button on the task card. It asks twice — an accidental mark is a lie you did not decide to tell — and it dies when the run does. Traitors only; nobody else has a card |
| A room code | four `<select>`s, so left/right dials a letter, a phone gets its native picker, and a keyboard can type A–Z |

Which of those two sets of controls you get is decided live rather than once at load.
The old test was a single media query — `(hover: none) and (pointer: coarse)` — which
describes a phone exactly and describes an iPad only while nothing is plugged into it:
attach a keyboard case and Safari starts answering `hover: hover, pointer: fine`, the
thumb sheets stay `display:none`, and a mission whose only controls are on one of those
sheets has no controls at all. That is what The Dive was on an iPad. So the query is now
the opening guess — *is there a finger on this machine at all* — and every pointer event
afterwards is the answer: a thumb brings the sheets up, a mouse or a trackpad takes them
away, and swapping hands mid-run swaps them back. A machine with no fine pointer on it
never believes a pointer event that claims to be a mouse, because some Android browsers
label a real finger that way.

Looking around has a second way round for the same reason. Pointer lock is the good one —
the cursor disappears and you can turn for ever — and Safari on iPadOS does not implement
it at all, so the click that was meant to capture the pointer captured nothing and the
camera never moved. Where there is no lock to take, the pointer itself is the aim: moving
it turns you, clicks stay free for firing, and a jump bigger than a hand-sized move is
read as somebody lifting the mouse and putting it down rather than as a look. `Input.aimReady`
is the one question a HUD asks before offering "click to aim", so that hint is never left
burning on a device that will never lock anything.

On a phone or a tablet the browser's own gestures are the enemy of all of that, so
`js/core/touchguard.js` refuses pinch, double-tap zoom, the long-press callout and the
trackpad's ctrl-wheel pinch — but only while the page is at 1x. The moment anything *has*
zoomed the page, the guard stands aside so a pinch out can undo it, asks Safari to lay the
page back out at 1x by rewriting the viewport tag, and if that fails puts a pill on screen
saying which way out is. Refusing a pinch you cannot then reverse is how an iPad ends up
stuck at 2x, which is the one failure the guard used to have.

Claudia's voice comes from whatever the operating system has installed, which varies
enormously, so the front screen has a picker. If there is no synthesiser at all — or the
game is muted — the subtitles hold for a readable time instead and the pacing is
identical.

---

## Playing the Boat Race

Blast down a walled sea channel and thread every gate. Reach the finish before the clock
runs out to claim the finish bonus and a time bonus.

| Action | Keys |
| --- | --- |
| Throttle / reverse | `W` `S` (or `↑` `↓`) |
| Steer | `A` `D` (or `←` `→`) |
| Boost — **and, in the air, trick** | `Space` / `Shift` |
| Pause | `Esc` / `P` |
| Restart run | `R` |
| Mute | `M` |

Touch works: an on-screen stick and a boost pad.

### Every run is a setup, not a course

The briefing screen is where a run is chosen. Nothing about it is fixed:

- **The channel** comes from a seed. The seed draws the path, its length, its width, the
  cliffs, the rocks, the gates, the weather and the sea — so a seed is a whole race, and
  saying "Cold Kraken, 4242" is enough for someone else to drive exactly the same water.
  **Today** is the daily channel, the same for everyone until local midnight; **Random**
  draws a new one.
- **The mode** is either a **Prize Run** (the clock counts down, rings buy time, score is
  money) or a **Time Trial** (the clock counts up, every ring knocks seconds off it, score
  is the one number at the end).
- **The sea** is always a storm sea. The water is not the seed's to choose, because it is
  the only water this hull is any fun on.
- **The hour** is its own dial: **Auto**, **Day** or **Night**. On Auto the clock moves on
  an hour every run — dawn, midday, last light, moonlight, round again — so racing the
  same channel twice in a row is two different drives rather than the same afternoon
  repainted. The Night Run card still outranks the dial: it was chosen on purpose and
  paid for.
- **The modifier** is a hand of three cards dealt from the seed, of which you keep one or
  none. Fog Bank, Riptide, Glass Cannon, Closing In, Tight Rings… each one
  bends the rules and multiplies everything you earn. A shared seed deals a shared hand.
- **The ghost** is your own best run on that exact setup — same seed, same mode, same
  modifier — replayed beside you with a live split. Anything else would be lying about
  where you are.

Each setup keeps its own record and its own medal, because a storm at night with Glass
Cannon running is not comparable to anything else. Medals are worked out from par for the
channel you actually drew: **Bronze**, **Silver**, **Gold**, **Author**.

### A run has a shape

A channel is not one corridor from end to end. `CourseKit` plans two or three **stretches**
into every path — a **throat** that squeezes the water to a third of its width, an **open
bay** that opens it out and fills it with rock — and stores them as a width profile, so the
cliffs, the buoys, the shore foam and the rock field all follow the water without knowing
why. Gates come at you faster in a throat and spread right across a bay. Each one names
itself as you reach it.

The last 38% of the channel is the **home stretch**: the rings tighten, nearly every gate
grows a gold one, and every gate pays **double** — while buying you exactly the same
handful of seconds the easy ones did. That is the squeeze. The clock you arrive with is
the clock you finish on, and a fumbled gate costs three seconds, so a prize run can now
genuinely be lost by a driver who has been sloppy in the first half. A clean line finishes
with time in hand; a 60% line needs to hold about 13 m/s more average speed than a clean
one to survive, which is not a thing this hull can do in a storm.

### Five things make you fast

- **Surfing.** Point down the face of a wave and the gradient adds real acceleration.
  Climbing one costs you. The `SURFING` badge lights up when you're gaining.
- **Launching.** When a crest drops away faster than gravity can hold the hull down, the
  boat goes properly airborne. Air time refills your boost — land flat to keep it.
- **Tricking.** Off the water, `Space` becomes the trick button: throttle flips, steering
  rolls. Let go and the hull snaps to the *nearest whole turn* — that snap is the landing.
  Hold on too long and you come down on your side, which costs you the chain. Nothing
  happens unless you press it, so an ordinary jump never tumbles by accident.
- **Chaining.** Each gate raises the multiplier. A miss, a hard crash or a binned trick
  resets it — and so does the chain timer, so the correct play is to keep moving.
- **Choosing the line.** Most gates carry two rings: a safe one out in the channel, and a
  gold one tucked hard against the rocks that pays three times as much, with more boost and
  more time. You cannot take both. Shaving the wall or a rock at speed pays too, for as
  long as you can hold it.

The prize pot persists in `localStorage` between sessions.

## Playing the Shootout

You are on a hunter's stand in a wood at dusk, with a bow that draws in half a second.
Quarry comes from every side over ten short rounds — ravens, lanterns, clays, bats,
geese, moths, wasps, night messengers — and the last round is the Great Owl. Between
waves the wood itself is worth shooting: deer, foxes, rabbits, boar and pheasants live
here, and there are bottles on stumps and bells hung off branches. There is never a
moment with nothing to shoot at.

| Action | Keys |
| --- | --- |
| Look / aim | mouse (click once to lock the pointer) |
| Walk | `W` `A` `S` `D` |
| Sprint | `Q` |
| Draw and loose | hold / release `LMB` (or `Space`) |
| Hold your breath | `RMB` (or `Shift`) |
| Pause | `Esc` / `P` |
| Restart run | `R` |

Touch works: a move stick plus draw, breath and sprint pads.

### The draw is the whole game

| draw time | what you get |
| --- | --- |
| 0 → 0.5s | power ramps: arrow speed 52 → 134 m/s, so a soft loose lobs and a full one flies flat |
| **0.50 → 0.63s** | **clean loose** — gold reticle, +50%, the arrow pierces a second target, a beat of hit-stop |
| 0.63 → 1.1s | held at full, no penalty |
| beyond 1.1s | strain: the reticle sways and power bleeds back to 72% by 2.2s |

It never auto-fires. Being robbed of a shot you were still lining up is worse than any
amount of arm-burn. `Bow.TUNE` in `js/entities/bow.js` holds every one of those numbers
in a single block.

### The bow does not aim for you

Arrows are real projectiles — gravity 16 m/s², drag, and a wind that the Gale twist makes
you feel. There is no snap, magnetic cone or hidden interception correction: every arrow
leaves in the exact direction of the crosshair. Hold your breath and a small intercept
mark appears for nearby quarry only if you deliberately chose the lower-paying **Steady
Hand** card. It includes target motion, arrow drop and wind, but it is only information;
you still have to move the crosshair onto it and loose at the right time. A standard run
provides no lead solution at all.

On a touchscreen — and only on a touchscreen — the *drag* is helped, which is a different
thing from the arrow being helped. A mouse resolves about a tenth of a degree and a thumb
on glass resolves nearer a whole one, so within about four degrees of a bird your drag is
scaled down (you still do all of the moving, you just move less per millimetre) and, while
your thumb is actually travelling, up to a third of that travel is turned towards the
bird. It aims at the bird and never at the intercept, so the lead, the drop and the wind
are all still yours; it cannot move a thumb that is holding still, so sitting on a lead is
never fought; and it ignores doves. `ShootoutMission.CONFIG.assist` is the whole of it,
and `test/aim-assist.test.js` holds it to those limits.

The reticle tells you when it has locked on, and names what it locked on to. If that name
comes up red and says **DOVE — HOLD**, do not loose: a dove costs £400, two seconds and
your whole chain. Doves also carry a red no-entry sign in the world, visible long before
you can see that the bird is white, because you have to be able to decide before you draw.

### The chain is the stake

Arrows are unlimited; the multiplier is what you can lose. Every hit climbs it, and it
decays if you stop shooting, snaps on a dove, and snaps when a round runs out. That is
why the wood is stocked with residents — a bottle keeps a chain alive between waves.

### The Great Owl

The boss is four fights in one bird, and each is a different question:

1. **The lantern** — it circles out of reach carrying a light in its talons and sends
   ravens at you. Three arrows into the lantern and it drops the light (shoot that too).
2. **The eyes** — it hangs in front of you and *stares*, eyes blazing red, for five
   seconds. That is the window. Then it loses patience and comes at you, and while it is
   coming there is nothing to hit: get out of the way.
3. **The talons** — it crosses the clearing in fast attack runs. The talons are vulnerable
   only on the approach, so you have to turn, track and lead it yourself — nothing solves
   the interception for you on any device.
4. **The heart** — no more running. It circles close, every wingbeat is a gust that shoves
   you back a step, bats pour past, and you put five arrows through the pale chest.

The owl periodically climbs out of reach and summons a ring of ravens or bats. The wood
answers with rising charm waves: temporary piercing ember arrows, unlimited breath, a
wider clean-loose window, or double money. Each phase also raises a procedural boss score
from war drums and bass into horns and choir.

Between phases it is staggered and untouchable for a beat, which is what tells you —
without a line of text — that the thing you just did worked. `ShootoutMission.BOSS_PHASES`
is the whole fight as a four-entry table; its flight is spread across the boss behaviours
in `js/entities/flyers.js`, including circling, diving, crossing sweeps, summons and rage.

### Rounds and twists are data

`js/missions/shootout-rounds.js` holds sixteen round archetypes — spawn table, cadence,
arc, duration, and one rule that bends the scoring. A run always opens gently, always
gets a bonus round in the middle third, always ends with the owl, and draws the rest by
difficulty tier from the seed, so "Rowan Deep, 8812" is one specific run and not a genre.
`shootout-twists.js` is a sixteen-card deck in exactly the same declarative shape as
`modifiers.js`, so the briefing screen renders either without knowing which game it is
looking at.

---

## Playing the Dive

You are stood on the shingle of a highland sea loch with a broken trawler on the slope
below you and a trench past that. Behind you the ground goes up through machair and
pine into six hundred metres of hill. Three minutes, one breath at a time. There is one
button.

**Nothing counts until it is on the pile.** You jump off the bank, you fill your hands,
and then you have to carry it back to the beach and put it down — and the pile grows
where the other two can see it. Surfacing keeps you alive; it does not keep the gold.

Black out and every chest in your hands falls where you are and lies there, **lit, on
the floor, for anybody to take** — the other two included — and you float helplessly
for three seconds while they decide.

| Action | Keys |
| --- | --- |
| Steer | mouse (click once to lock the pointer) |
| Kick | `Space` (or `LMB`) |
| Streamline | hold `Space` — no thrust, a third of the drag |
| Brake | `S` — flare and stop hard; costs a little air |
| Scull | `W` `A` `D` — a nudge, for lining a chest up |
| Pause | `Esc` / `P` |

Touch works: a sculling stick (pull it back to brake) and one big KICK pad (hold it to
streamline).

### The whole mission is one rule

The money does not vanish when you drown. It *moves*. Three things fall out of that,
and they are the reason this mission exists:

- **Drowning looks exactly like ambition.** Every way a Traitor can lose money down
  there is also what the best diver at the table does. Coming up empty is what greed
  looks like from the outside.
- **A Traitor's loss is somebody else's gain**, so "the pot is short" stops being
  evidence of anything.
- **A run is thirty seconds long and restarts instantly**, so the loop repeats sixty
  times a night rather than twice.

And the shore is what makes all three of those *watchable*. A diver who surfaces with
four trench chests has not banked anything — they have a hundred and eighty metres of
open water to cross while holding it, on the surface, in front of everybody. The whole
mission is a journey between having it and keeping it.

### You swim on the beat

A stroke is a *shaped burst* — thrust that ramps in and out over a quarter of a second —
followed by a long, low-drag glide that you steer through. The glide is where the game
is; the good players stroke less often than you would expect.

The ring in the middle of the screen tightens to the music. Land a kick inside ±120 ms
of the beat and it **chains**:

| | off the beat | on the beat |
| --- | --- | --- |
| sustained speed | 11 m/s | 16.5 m/s |
| air per stroke | full | 70% |
| money per chest | ×1.00 | up to ×1.55 |

Three chained strokes light it; missing a beat costs 65% of it and two seconds of not
swimming costs the rest. Off-beat strokes work perfectly well and only forfeit the
bonus, so the beat is a **ceiling, not a gate** — and the `Freediver` card removes it
entirely for anybody who bounces off rhythm.

The window is ±120 ms because that is the width `Bow.TUNE.perfectWindow` already taught
your hands in the Shootout.

### Down is free, up is what costs you

Past about sixteen metres the water stops holding you up and you fall. Stop kicking and
save the air for the climb — and every chest in your hands costs drag, air, a longer
kick and a little more weight on the way back. The fourth one is the one that drowns
people.

| tier | depth | worth | round trip | comes back |
| --- | --- | --- | --- | --- |
| Shelf | 0 → 16 m | £380 | ~6 s | every 8 s |
| Wreck | 16 → 34 m | £1,450 | ~9 s | every 13 s |
| Trench | 34 m + | £3,800 | ~14 s | every 26 s |

The trench is only a round trip **if you are on the beat**. Off it, a scripted diver
that reaches the bottom does not come back — which is not a difficulty setting, it is
what the air arithmetic in `test/swim.test.js` asserts.

The round-trip figures are the dive itself. The *swim home* is on top of them, and it
is what the shore added: the trench rim sits about a hundred and eighty metres out, so
a trench trip is another fifteen to forty seconds of surface swimming before any of it
is money. That swim is where the tide comes in — see below: the surface is the slow way
home, and the fast one is along the floor.

And the surface interval is real: a shelf trip is back in the water in a second and a
half, a trench trip has to float for five, in front of everybody. It is the only thing
that stops the deep being the answer to every question.

### The way home is the mission

The surface used to be the fast, safe way home — the bar refilled, nothing could reach
you, and there was nothing to do but hold the button for thirty seconds. Now it is the
slow one. The loch runs a **chop** that adds drag and lowers the speed ceiling for anybody
with their head out, and it gets worse all run.

The fast way is along the bottom. Every seed cuts three **tide races** — lanes of water
running shoreward from the trench rim to the shelf, drawn as chevrons crawling along the
sand with silt streaming over them. The swimmer's drag works on its speed *through* the
water, so kick in one and you go faster than any stroke can take you on its own. Nothing
runs above four metres, so every trip home is a choice between the chop — slower, safe,
breathing, in front of everybody — and the floor: a fifth to a quarter quicker from the trench rim,
but loaded, on the breath you came up with, and inside shark range. (Streamlining down a
race is the *slow* way to use one: it is time under water that empties the bar.) *"I lost it on the way back"* is now the commonest sentence at the
fire.

### The tide turns twice

| | still water, 0:00–1:00 | the ebb, 1:00–2:00 | the flood, 2:00–3:00 |
| --- | --- | --- | --- |
| the races | barely running | open | stronger again |
| the chop | light | heavy | heavier |
| the caves | a roof | **air under every roof** | the air floods, whoever is in there |
| the money | as it is | as it is | a third more on every chest |
| the animals | as they are | louder water | they can taste it |

In the ebb the middle of every cave holds a pocket of air under its roof — you can see the
shimmer from the door. Come up into it and you breathe, float and gasp as if under the
sky; it does not end your trip, and it is not the shallows, so the shark on the door can
still come in. When the flood arrives the pocket goes, and the cave is what it always was.
The stages are thirds of the run, so Spring Tide's short run turns the tide faster.

### Three more ways to move

- **Streamline** — hold the kick. Arms locked, no thrust, a third of the drag and half the
  steering. It makes a glide a decision: how long do you hold the line before you break it
  for a stroke, and does that stroke land on the beat?
- **Brake** — pull back. You flare, stop in a body length or two and turn sharp, and it
  costs breath. Cave mouths and hatches are what it is for.
- **The clean sweep** — take a chest at more than seven metres a second and it pays a
  fifth more and feeds the chain. Stopping on top of one still works; it just pays less.

The chain is now fed by riding a race and by turning a shark, not only by the beat.

### The shore

One bearing, drawn off the seed, decides the whole above-water half of the mission.
`ReefKit.shoreFor` turns it into an inland normal, and every point on the map is then
one dot product away from knowing how far inland it is — which is the only input the
coast profile takes. Below zero it shelves; just above it there is a shingle bank you
jump from; behind that machair, hillside and highland, out to six hundred metres.

It is **one mesh**, not two. The seabed disc reaches half again its radius seaward and
five times it inland, so the tideline is a continuous surface rather than two sheets
arguing over the same metre of sand, and one `heightAt` is the seabed, the beach and the
mountain. The diver's own collision, every chest's depth band and every tree's treeline
all ask that same function, so nothing can be placed anywhere the geometry is not.

The reef's radial tiers are untouched by any of it: shelf in the middle, wreck on the
slope, trench at the rim, exactly as before — the land simply takes the half-turn behind
you, and `_spawnChest` draws its bearings from the seaward half so it never proposes a
chest on a mountain.

### The reef conserves what is in it

Each tier keeps a population. A chest taken off the reef comes back on that tier's own
clock; a chest **dropped** was never taken off it, so it does not. A diver who drowns in
the trench has parked the trench's money on the floor where everyone can see it, and no
new trench chest arrives until somebody picks it up. Blacking out cannot mint gold, and
"the pot is short" keeps meaning what it means.

### Where a run is won

Three minutes, and a scripted diver playing perfectly on the beat:

| what it does all run | what it comes home with |
| --- | --- |
| the shelf only | ~£15,000 |
| whatever is nearest | ~£29,000 |
| the wreck only | ~£32,000 |
| the trench only | ~£44,000 |
| the trench only, off the beat | a fraction of that, and blackouts |
| the trench with no bail-out at all | nothing |

Every one of those numbers came out of `test/swim.test.js` and a scripted run in node,
not out of a guess — and they are what the diver *earns off the reef*, before the swim
home. Par is £21,000, down from £30,000 when the shore went in: a trip is no longer over
the moment your head is out of the water, it is over when you are stood on the shingle.

---

## Playing The Descent

One face of a highland mountain, top to bottom, in about two minutes. It is the only
mission in the game with no throttle in it: the boat has an engine and the diver has a
kick, and here the hill is the engine. Every decision you make is about how much of what
gravity gave you you are prepared to hand back.

```
A/D      carve
W        tuck — less drag, more speed, almost no steering
S        check — turns hard, scrubs hard
Space    on the snow: hold to crouch, let go to pop
         in the air: hold to spin and flip, let go to land
```

### One meter runs the whole thing

`flow` is a ladder of six rungs and it is the multiplier on every pound the mountain
pays — hoops, tricks, trees, shortcuts and every metre of the descent itself. It climbs
on carving cleanly, on air, on threading a hoop and on skiing close enough to a tree to
hear it. It falls on going slowly, and a crash costs three rungs.

So the mission reduces to one sentence a player works out in about nine seconds:

> Go down fast and never stop doing things.

Everything else feeds that. The hoops buy clock. The kickers buy rungs. The shortcuts
buy both, and cost nerve.

### Turning is what costs you, and skidding is what costs you most

`slip` is how much of your velocity is not pointing where your skis are, in metres a
second. It is the single input to the spray, the hiss, the trench in the snow and the
speed the snow takes back — one number, four channels, so none of them can disagree with
you about how hard you are working.

A long clean arc holds the edge and keeps nearly all of it. A panic turn breaks the edge
and the snow charges you for the difference. A check breaks it deliberately, which is how
you survive a corner you came into too hot. That is the entire cornering game, and the
snow you drew changes it: ice is the fastest surface on the mountain and will not hold a
single turn you ask of it.

### The pop is the deepest thing in it, and nothing tells you

Hold <kbd>Space</kbd> and you crouch, storing it. Let go and you spend it, right then,
off whatever you are stood on — an ollie off flat snow, and off the last metre of a
kicker's lip, a jump about twice the size. Nothing in the game explains that. It just
pays, every time, and players find it.

In the air the same key spins and flips, and letting go of it snaps the rotation to the
nearest whole turn. That snap *is* the landing: it is the only reason a 720 is survivable,
and it is lifted directly from the boat race's roll, for the same reason.

A landing is graded on three things that are deliberately independent — how square you are
to the snow, whether the rotation came round to a whole number, and how sideways the skis
are to the way you are actually travelling. Two out of three is a wobble. One is a yard
sale.

### The shortcuts are an argument with the run

The groomed piste traverses. The line straight down the fall line does not, and the chord
across a bend is shorter than the groomed way round it — so a shortcut is not a decoration
on the mountain, it is a genuinely faster line that happens to go through the trees.

They are not placed. `MountainKit.findChutes` walks the traverse looking for bends worth
cutting, measures each one against the piste's own arc length, and cuts the best three or
four. The number on the gate — *saves 43m* — is that measurement, and the clock keeps the
promise. Every hoop inside one is gold, and getting out of the bottom of one pays again.

Bailing out of the side of one does not.

### A gate belongs to a route, and an air hoop belongs to a lip

The piste's gates do not count against you while you are in a shortcut, and the shortcut's
do not count while you are on the piste — which is what makes taking one a trade rather
than a free lunch.

Air hoops are hung in space off the end of a kicker and they are *opportunities*, not
gates: sailing past one on the snow because you did not take that jump is a line choice,
not a fumble. They are not placed by eye either. Each kicker is asked what it would throw
a skier of ordinary speed — the speed where drag balances gravity on that pitch — and the
hoop goes on the arc that produces. So a twist that makes every lip half again as big
moves every hoop with it, for free.

### The mountain is a pure function of (x, z)

The face descends along +Z. That is not a simplification, it is what makes the rest cheap:
progress is `z`, the fall line is `−dy/dz`, there is no nearest-point search anywhere in
the mission, and no point on the mountain could belong to two parts of the run.

Height is a sum and every term is somebody's job — the descent profile, the folds, the
rolls, how groomed it is, the berm along each edge, the chutes, every kicker and cliff,
and the valley sides. Nothing is a separate collision object: a kicker is not a mesh
sitting on snow, it is snow. So what you see, what you ski, what the camera avoids
clipping and what three separate clients each build from the seed are all the same eleven
lines of maths.

Two things about that are only true because they were measured, and both were silent when
they were wrong:

- **Terrain roughness scales with the local gradient.** Noise contributes gradient of its
  own, and where it exceeded the pitch it sat on, flat sections had real uphills in them.
  A skier coasted into one, stopped, and the run was over with the clock still running.
  `mission-stats.test.js` now rolls a body with momentum down ten mountains and asserts it
  reaches the bottom of every one.
- **A cliff has a bench under it.** A `drop` used to snap from its full depth back to the
  mountain at the end of its tail, which is a vertical wall across the landing of every
  cliff on the hill. You fell in and could not get out.

### Where a run is won

| line | typical |
| --- | --- |
| straight-lining it, tucked, taking nothing | the meter never leaves ×2 |
| the groomed run, most gates, no shortcuts | around par |
| shortcuts taken, meter held at ×5 or ×6 | comfortably over |
| all of that, and arriving with clock in hand | the time bonus, which is the difference |

The runout at the bottom is nearly flat and pays double. Whatever speed you are carrying
when you reach it is all you are getting, which is why the last thirty seconds of a good
run were decided ninety seconds earlier.

---

## Architecture

The engine knows nothing about gameplay, and missions know nothing about each other.
A mission hands the engine a `{ scene, camera }` and an update function; that's the
entire contract. A round-table scene and a boat race have nothing else in common — and
the scenes take exactly the same contract, which is why `js/scenes/` needed no engine
changes at all to exist.

```
index.html            script order + all screen markup
css/style.css
functions/
  api/turn.js          legacy TURN endpoint (not used by the Node.js game)
js/
  core/
    util.js           seeded RNG, damping, easing, money formatting
    engine.js         renderer, main loop, the active view, GPU disposal
    input.js          named actions (throttle/steer/boost/…), keyboard + mouse + touch
    audio.js          procedural Web Audio; sounds are registered recipes
    music.js          the conductor: look-ahead sequencer, sections, stingers, silence
    music/mix.js      the room (a generated convolution reverb), the master bus, the seating
    music/instruments.js  the orchestra: strings, pizzicato, brass, choir, drums, bells, piano
    music/cues.js     the score as data: the theme, the chords, every cue and stinger
    state.js          persistent save: prize pot, mission records, ghosts, settings
    screens.js        DOM screen stack + fade transitions
    missions.js       mission registry and lifecycle
    look.js           who you are: the dressing-room descriptor and its storage
    party.js          rooms, codes, players, and attempt cancellation
    room-socket.js    WebSocket connection, acknowledgements, and reconnect
    server-audio.js   microphone and playback graphs
    voice-worklet.js  voice framing, resampling, and jitter buffer
    session.js        the authority for a night: phases, roles, tasks, votes, pot
    net.js            the transport seam — three methods, two implementations
    transports.js     the host's reducer and the guest's mirror, on the wire
    voicechat.js      microphones, peer audio, and the thirty-second floor
    mission-net.js    three people inside one mission: poses, events, the board
    lobby.js          a name, four letters, three people
    roomui.js         the floor bar, the board, the field, your task, the mic button
    voice.js          Claudia out loud, and the subtitles that stand in for her
    uinav.js          keyboard navigation for every menu
    scenes.js         scene runner + the beat sequencer the scenes are written in
  world/
    sky.js            sky dome, sun, clouds, birds, stars, distant mountain rings
    water.js          Gerstner ocean — same wave stack on GPU and CPU
    conditions.js     time-of-day and sea-state presets; one call applies both
    course.js         path, highland cliffs, rocks, channel buoys (reusable kit)
    forest.js         heightfield wood, instanced flora, hunter's stand, weather
    highland.js       the hill, the grass, and the highlands round the edge
  entities/
    boat.js           hull mesh + arcade physics (surf, launch, trick, land, collide)
    bow.js            the half-second draw, and arrows as real projectiles
    flyers.js         every creature and prop you can shoot, and how each moves
    figure.js         a person, in primitives, on a full rig with a walk cycle
  fx/
    fx.js             particles, wake ribbon, shockwaves, floating labels
  missions/
    agendas.js        the Traitor's secret tasks, each with a public tell
                      and a way out of it
    modifiers.js      the pre-race card deck — declarative rule-benders
    boat-race.js      Mission 01
    shootout-rounds.js  the rounds a Shootout is built from, as data
    shootout-twists.js  the Shootout's own card deck
    shootout.js       Mission 02
  scenes/
    claudia-lines.js  every spoken line in the show, as data
    stage.js          the hill dressed three ways, and first-person movement
    dressing.js       the turntable, the studio light, and eight dials
    reveal.js         the moment a role stops being a secret (fire optional)
    hill.js           the welcome
    roundtable.js     the talking
    exposed.js        the task that was left undone
    fireplace.js      the endgame
    show.js           the director: which of the above is on screen
  main.js             boot, the front screens, briefing, results, attract ocean
test/
  harness.js          enough of a browser to run the logic layer in node
  minidom.js          enough of a document to press a button in, built from index.html
  run.js              every suite; `node test/run.js`
  session.test.js     a whole night driven through `dispatch`
  privacy.test.js     the invariant everything else stands on
  agendas.test.js     every card, at its own boundary
  mission-stats.test.js  the missions really do count what the cards read
  transport.test.js   a host and a guest, in one process, on a fake wire
  look.test.js        the dressing room's data
```

### Game authority stays in the host browser

The Node.js server routes messages. The host's browser remains the game authority: it owns `Session`, draws the
roles and the tasks, holds the clock, and is the only client where `dispatch` does
anything at all. The other two run the identical file in `guest` mode, where `dispatch`
is inert and `state` is a mirror installed by `adopt()` from whatever the host last
sent. Scenes cannot tell the difference, which is the point — they read `state`, they
call `Net.send`, and that is exactly what they did when this was single-player.

Transport is WebSocket through the Node.js room server. `Party` keeps the same
public interface, so missions and the session transport do not need a new game protocol.
Voice frames use the same socket, separately from JSON game messages. The server owns
room membership and reconnect tokens; the host browser owns the reducer and private roles.

Three rules make it work, and all three are load-bearing:

1. **One reducer.** Every change to a night goes through `Session.dispatch(action)`, and
   an action is a plain serialisable object — `{type:'vote', playerId, choice}` and so
   on. Nothing else may touch the state.
2. **One seam.** Scenes never call `Session`. They send through `Net.send()` and learn
   through `Net.on()`. A transport is three methods — open, send, close — and there are
   three of them: `LocalTransport` for solo practice, `HostTransport` (the reducer, plus
   an audience) and `GuestTransport` (which owns nothing and asks for everything).
   Delivery is deferred by a microtask even locally, so no scene can come to depend on a
   reply arriving inside the same call stack as the request — which is the one habit
   that would not have survived a network.

   Two details in `transports.js` are not decoration. Every outbound event carries the
   snapshot that goes with it, because a guest that received `phase:'finale'` before the
   state that made it true would render the finale from the mission's data — and
   that bug only ever appears on somebody else's machine. And an inbound action is
   re-stamped with the peer it actually arrived from, so a client may only ever act as
   itself.
3. **The client is never told another role.** `Session` keeps the role table in a
   closure and it is never in `state`. You get `Session.myRole()`, which is yours, and a
   Traitor gets `Session.myAgenda()`, which is also only ever theirs. Everything else
   leaves as an event: `reveal` when a pouch burns, `expose` when a task went
   unfinished. `privateRoles()` is the single exception, it is host-only, and its one
   caller addresses each entry to the person it belongs to.

   This used to be a rule worth nothing, because the other two clients were bots in this
   process and a leak leaked to nobody. The snapshot is now a thing the host puts on a
   wire and sends to two other people's browsers, so `test/privacy.test.js` walks it
   through every phase of a hundred and twenty nights and asserts the word never appears
   in it. (An earlier version of this README claimed that test existed. It did not.
   It does now.)

`bots.js` is gone, along with `Session._clientRole` and the twelve-person cast in
`state.js` that nothing ever read. Nothing above the seam changed when they went, which
was the point of writing it that way.

Nothing random is ever held as a live generator. Roles, the tasks, the mission plan and
every tie-break are pure functions of `(seed, purpose)` via `rngFor()`, so all three
clients deal the identical hand from the seed the host sent, and a guest that reconnects
mid-run is caught up by a snapshot rather than by replaying anything.

**The handshake is the guest's to complete.** The host connects its transport the moment
it starts the night, up to a round trip before either guest has finished its fade — so a
catch-up sent on connect alone lands in an empty room. A guest says hello when it is
actually listening, and repeats it until the host answers.

### Three people inside one mission

The world is not sent. Courses, forests, wave schedules and flock spawns are already
pure functions of the mission seed, and all three clients were handed the same one — so
`mission-net.js` synchronises only the three things a seed cannot know: where each
person is, what they just did, and what they scored.

- **Poses** go out fifteen times a second and are lossy by nature; remotes are drawn a
  tick behind and interpolated, because a boat that is a frame late and smooth beats one
  that is current and jumping.
- **Events** are anything that must not be lost — an arrow loosed, a gate taken, a bird
  killed.
- **Reports** are the end of it: everyone's numbers, collected by the host into the one
  board all three then argue over. Nobody's Continue button arms until it arrives,
  because the pot is what the three of them managed between them.

Mission loading has a host-owned ready gate as well. Shader compilation and world building
can differ by seconds between devices, so no countdown starts until every active client has
attached to that mission. Every packet is tagged with the mission id; a late packet from the
water cannot become an event in the wood.

The **boat race** needs almost none of this: hulls are visual-only off interpolated
snapshots, and boats deliberately do not collide, because three clients arbitrating
contact is a desync with a splash on it and racing wheel-to-wheel does not need one.

The **shootout** needs all of it. Birds flee from whoever is nearest, and "nearest" is a
different answer on three machines — so the flock is **host-authoritative**. The host
simulates it and broadcasts a full snapshot twenty times a second; guests run
`Flock.puppet` mode, which is why `animateParts` had to come out of `Flyer.update`. A
guest that hits something sends a claim and the host decides. That is the only contested
call in the game and the only one arbitrated.

### The dressing room

A look is eight indices into lists in `look.js` — never a raw colour — so a look saved by
an older build can never produce a figure with no coat on: an index out of range clamps.
It goes three places at once (localStorage, the wire, `Figure.build`), which is why it
is a plain object and not a class.

The figure itself was rebuilt. The old rig had four handles and two rigid cylinders for
legs, which meant a person could stand, sit and gesture but could never take a step —
and somebody who slides is worse than somebody who is still. It is now a proper chain
with knees and elbows, a face that blinks, and a walk cycle driven by one number. The
dressing room cycles idle → walk → wave on a turntable, because the thing you are
choosing is a person who moves and picking one from a mannequin is picking blind.

Every control on that screen is a `<select>`. That is reuse, not laziness: `UINav`
already cycles a select with left and right, so the whole screen is dialable on a
keyboard-navigable and tappable on a phone without one line of input code in `dressing.js`.

### The hill is one shape with one guarantee

`HighlandKit` reuses the wood's machinery — `ForestKit` exports its instancer, its wind
material and its fire — under a different palette and one different rule: nothing on the
hill is flat-shaded. Hard facets read as style on a two-metre rock and as broken geometry
on a two-hundred-metre hillside, which is the same split `CourseKit.buildCliffs` makes
when it puts its rock rows and its hills in separate material groups.

The height field is a gaussian crest plus rolling shoulders, and the rolls are *gated on
how far the crest has already fallen*:

```
height   = base + crest(r) + rolls · allow(r)
allow(r) = clamp((peak − crest(r)) / gate, 0, 1)
```

A point can only out-top the summit if `rolls > gate`, so keeping `gate` at or above the
total roll amplitude makes the summit provably the highest ground on the hill, for every
seed. That is not decoration: the camera settles on the summit and looks out, and on a
first attempt without the gate one seed in six put a lump of grass in front of the shot.

The grass is one instanced mesh of small three-blade tufts — about thirteen thousand of
them, scaled by the quality setting — over a hundred and twenty metres, thinning outward
until a blade would be a pixel. Two things stop that reading as a texture: each blade
carries a base-to-tip brightness gradient in its vertex colours, and each tuft gets a hue
of its own on top, high in lightness and on the yellow side of green. The whole field
rides the same two wind uniforms the wood's trees do, so one weather moves everything.

The loch is the sea kit, calmed right down. The hill is *raised* forty metres rather than
the water being sunk, because `Water` draws at y=0 and its shells, its sampling and its
fog all assume so — and raising the land gets a real shoreline for free wherever the
shoulders drop back through zero. The shoreline lands about 260 metres out from a summit
that stands 95 metres over it, which is what makes everything past the rim water.

### The castle is the thing you are looking at

The hill is a place you look *out* from, and for a long time what it looked out at was
weather. `CastleKit` is what it looks at now: a tower house on a rock four hundred metres
out in the loch, with a curtain wall round it, a broken causeway reaching back towards the
shore, and — after dark — windows.

It is unreachable and unenterable, and both on purpose. The stage clamps first person to
ten metres of summit, the island sits a hundred and forty metres past the near shore, and
the last two spans of its bridge are in the water. There is no interior and the gate arch
is a shadowed recess rather than an opening, which from anywhere you can ever stand reads
as a way in that is shut. A castle you can enter is a level; this is a horizon.

Everything about how it is built follows from the distance. At 400 metres a metre is about
three pixels, so merlons are a metre and a half and nothing finer than that exists. The
whole castle — five-sided ward, five towers, keep with corner bartizans, hall, gatehouse,
portcullis and causeway — is *one* merged flat-shaded vertex-coloured mesh, plus the crag
it stands on, two banners, one emissive quad soup for the windows, and, on a night build,
a single point light at the gate. Six draw calls and about three and a half thousand
triangles, which is one per cent of what the grass costs.

The windows are not lights. They are unlit, unfogged quads whose opacity is the hour:
barely there in the afternoon, half up as the mission ends, everything burning at the fire.
That one dial is most of what makes three dressings of one hill read as one evening
passing.

`stage.js` gains a shot for it — `loch`, a 28mm-equivalent from the west side of the
summit, aimed fourteen metres over the keep so the island sits in the lower third with
the far hills above it. It is deliberately the one framing in the show with nobody in it,
and all three scenes open on it: the welcome rises out of the grass into it, the round
table cuts to it with the lamps just lit, and the fire holds on it for three seconds
before Claudia says anything.

The rest of the dressing exists to give the middle distance something in it, because a
hillside with a castle on the horizon and nothing between is a matte painting. Glacial
erratics for scale, dry-stone dykes wandering over the shoulders and out of sight, copses
of Scots pine sharing the grass's wind at a fraction of its gain, a roofless broch on the
near shoulder for the castle to rhyme with, and a stone circle that now has stones of
wildly different heights, one fallen, and a trilithon with its lintel still on. All of it
is merged per kind — five extra draw calls and about twenty thousand triangles, seven per
cent on top of the grass.

### Claudia

`speechSynthesis` sounds like a robot mostly for reasons you can fix, and `voice.js` is
those fixes: score the OS voice list rather than taking the first one (and let the player
override, because what is installed varies wildly); speak one sentence per utterance, so
there are real pauses at full stops and Chrome's fifteen-second truncation never bites;
rate 0.94 and duck the score under every line.

And never depend on it. No synthesiser, muted, or a voice that fires no events: all of
them use the same text-derived subtitle clock, and the scene above cannot tell the
difference. A system voice is presentation rather than timing; `Voice.say()` resolves on
that common deadline, exactly once, whatever the browser does. Your own line at the round
table is deliberately silent — being dubbed by the host's voice in your own mouth is worse
than reading it.

That clock has to err *long*. The beat ends when it says so and the next line opens with
a `synth.cancel()`, so a deadline a word short takes that word off the end — which is
what a line that "skipped a word near the end" actually was. Installed voices run
anywhere between about fifty-five and seventy-two milliseconds a character at rate 1;
`readTime` is built on the slow end of that rather than the middle of it, and charges
separately for the wait before the first phoneme, the hand-off between sentences and the
breath the engine leaves at a full stop. Each utterance also hands off exactly once,
whichever of `onend` and `onerror` arrives, and every utterance of the line is held until
the line is over — two hand-offs from one sentence queue two more behind it and the one
in the middle is spoken over and lost.

### Scenes are beat lists

A cutscene written as control flow becomes a thicket of timers and half-finished
callbacks the moment it is interrupted. `Scenes.run()` takes a list instead:

```js
Scenes.run([
  { shot: 'grass', line: () => lines[0], hold: 0.8 },
  { card: { kicker: 'And you are', title: 'A FAITHFUL' }, wait: 1.5 },
  { then: () => Net.send({ type: 'advance' }) },
], this);
```

Cancelling and "she is still talking" are handled once, there. Dialogue is not
skippable, while every wait remains cancellable by teardown so leaving mid-sentence leaves
nothing running. `stage.js` holds the camera: every shot is a named framing the beat list
asks for, and the rig eases two damped points and a fov towards it — it never animates a
rotation, because a camera that eases its own euler angles takes the long way round
exactly once and it is always on the shot that mattered.

### The two joins between the show and the missions

`show.js` owns both, and they are the only places the mission engine had to change.

- **The pot.** `Missions.setPotSink(fn)` swaps where winnings go for the duration of a
  night: into that night's pot rather than the permanent one, and only banked if the
  night is survived. In multiplayer the server owns the pot, which is the shape this
  already has.
- **The pause after a mission.** The result is held rather than dispatched, so you read
  your own scoreboard and press Continue. Dispatching it the instant the mission ended
  would change phase, and the phase change would tear the results screen down while you
  were still reading it.

### Rehearsing a night on your own

The show needs three people and a room, which makes every part of it that is not a
mission expensive to look at: to see the fire you need two more browsers, four letters
read down a phone, and a boat race and a shootout first. `bots.js` is the door round
that, and it is a development tool rather than a game mode — there is no button, nothing
in the menus mentions it, and it exists only in the address bar.

```
?bots=1                     the whole night, hand dealt from the seed
?bots=finale                the fire and nothing else
?bots=intro,finale          no mission, all the talking
?bots=m1,finale             the mission, then the fire
?bots=all&traitor=you       you are the Traitor
?bots=all&traitor=2         the second bot is
?bots=all&traitor=none      nobody is — the rehearsal door is the only way to a
                            night with no Traitor in it now
?bots=finale&target=you     and they both name you
```

Parts are `intro`, `m1`, `finale`, with the obvious aliases (`hill`, `fire`,
`mission`, `mission1`, `all`) and in any order — they are played
in the running order whatever order you type them in. `seed`, `names`, `pace`
(`fast`/`normal`/`slow`) and `chat=off` are optional. A `#bots=…` works as well as a
`?bots=…`, because a hash is what survives being typed into a phone.

Three pieces make it work and none of them is a special case in a scene:

- **The running order is data.** `Session` holds it as a five-entry list and
  `state.parts` says which entries are being played. Walking off the end of a part is
  `goToStep(i)`, which skips forward to the next thing that is switched on — and a
  mission it steps over is *marked done*, paid at roughly what a decent run pays, and
  given a board with all three names on it. Nothing downstream can tell a skipped
  mission from a badly played one, which is why the fire still has a board to put up and
  a pot to divide.
- **`SoloTransport`.** The loopback, plus the two things a party would have supplied:
  every action is stamped `authority` (there is nobody else to be it), and `readyResult`
  is stamped with the local player id. Deliberately nothing else is stamped — half the
  actions the fire sends are the *ceremony* rather than a contestant, and a `playerId` on
  those means "whose pouch am I opening".
- **The bots are a policy, not a mind.** They take their turn at the fire and name
  somebody, and who they name is what `target` says. The point of them is to make the
  ceremony reproducible in one run, not to be beaten.

Both rehearsal levers — choosing the Traitor and skipping parts — are refused unless the
call that started the night declared itself a rehearsal, and `Bots` is the only thing in
the codebase that ever does. A night started from the lobby deals its own hand and plays
its whole running order, and there is no string it can be handed that changes that.
`test/bots.test.js` asserts exactly that, and then drives a whole bot-voted fire through
the real reducer and the real transport to a verdict.

### The water is the load-bearing part

`water.js` defines one wave stack and evaluates it twice: in the vertex shader for the
mesh, and in JavaScript for anything that needs to know where the surface actually is —
the boat, the rings, the buoys, the wake, the spray. If you change `WAVES`, both sides
change together and stay in agreement.

`sampleSurface(x, z)` gives height and analytic normal. Gerstner waves displace
horizontally as well as vertically, so it iterates to invert that displacement.

The faceted look comes from the fragment shader computing its normal with
`cross(dFdx(worldPos), dFdy(worldPos))` — flat per-triangle shading. It is blended
against the analytic Gerstner normal by distance: close in the triangles are small
and faceting reads as style, far out they are hundreds of metres across and faceting
would read as broken geometry, so distant water trusts the analytic normal instead.

The surface is three shells, not one plane: a fine square grid snapped to its own
lattice under the boat, then two polar annuli that butt up against it and carry the
sea out to the horizon. They meet edge to edge rather than stacking, so there is no
overlapping-sheet seam across the middle distance.

**It is also a ceiling.** All three shells are built in XY and rotated flat, so their
normals point up and a front-face-only ocean is culled entirely from underneath — an
underwater camera used to see straight through to the sky dome. The material is
`DoubleSide` permanently and the fragment shader flips its blended normal on
`gl_FrontFacing`, which turns the light *through* the water instead of off it and lets
the Fresnel mirror the water rather than the sky. That one change is the whole of what
the Dive needed from the engine, and it costs no fill for geometry nothing gets behind.

`Water` is a **global singleton** and `build()` resets its palette. Nothing else in the
repo restored it, so a mission that changes the water owns putting it back —
`DiveMission.dispose()` is the worked example and there is a note beside
`Water.DEFAULTS` so the next one inherits the rule.

### The boat is lofted, not assembled

`Boat.HULL` is a handful of numbers — length, beam, deck crown, where the cockpit
starts and stops. `Boat.section(f, u)` turns them into a real section curve (deep-V
bottom, hard chine, flared topside) and `buildMesh` sweeps that along the centreline.
Every fitting on top asks `Boat.deckAt(z, x)` where the deck actually is before it
places itself, so changing the hull moves the seats, the windscreen and the flag with
it and nothing is left hovering.

### The reef is lit by one patched program

`reef.js` builds the Dive's loch: a floor function with three terraces (shelf in the
middle, the wreck on the slope, the trench at the rim) plus dunes, coral heads and a
canyon cut across it from the seed, so no two runs are the same hunt — and, out in the
deep water, three **caves**.

Everything in it is lit by **one** `onBeforeCompile` patch. `ReefKit.causticMaterial`
adds two crossed noise fields at different speeds, multiplied — one field is a texture,
two moving against each other is a lens, and that difference is the entire effect — and
the seabed, the wreck, the rock and the kelp all share it, so the whole floor catches
the same moving light for the cost of one program rather than five. The same patch
carries the current's sway for the kelp, which is `ForestKit.windMaterial`'s trick
under water.

The kelp is `HighlandKit.bladeGeometry` instanced by `ForestKit.instance`; the marine
snow is `ForestKit.buildMotes` with the fall reversed so it drifts up; the shafts are
ten sprites on the sun's bearing. The **sea fans** are one more instanced draw against
that same sway uniform, tinted per instance out of a six-colour coral palette, and the
**anemones** are three draws rather than one because emissive is a material uniform and
one colour of glow over a whole loch is a light rig, not a reef. The wood on the hillside is `ForestKit.speciesGeometry`
against `ForestKit.windMaterial`, and the machair behind the beach is
`HighlandKit.tuftGeometry`. None of that is a second copy of anything — the dive supplies
a height function and a treeline and gets a Scottish hillside back, which is the whole
reason those kits export their parts.

**Every grid needs winding, and both of them were wrong.** A ring/sector floor written
out in the order it reads — `(a, c, d)` — produces a triangle whose right-hand normal
points *down*. `computeVertexNormals` then hands the material downward normals, and a
front-side surface with downward normals is culled from every position you could
possibly view it from. The reef's seabed had it, which is why the loch looked empty: the
single largest object in the mission was inside out and the renderer was skipping it.
`HighlandKit.buildGround` had the identical inversion. Both are now `(a, d, c)`, and
`test/mission-stats.test.js` asserts the tiers off the floor *function*, which is why the
bug lived in the mesh where nothing was looking.

The seabed is also **indexed** now. The header always claimed it was smooth-shaded —
"a surface this big rendered as flat facets reads as broken geometry" — but a
non-indexed grid cannot be, whatever the material says, because there is nothing for
`computeVertexNormals` to average across. Sharing the vertices bought the smooth shading
the comment was asking for, four times fewer paint calls and six times fewer vertices
from one edit.

**Depth is colour, never darkness.** The hour is always noon — the brightest light rig
in the game — and one ramp through `ReefKit.BANDS` drives the scene fog, the water's own
fog, the caustic strength and the pressure vignette together. The trench end of it is a
*saturated* cobalt whose luminance is no lower than the shelf's turquoise; what tells
you it is dangerous is the colour going cold, the FOV narrowing, the surface receding
overhead, and a cyan-white vignette closing in. A player who cannot see is not being
threatened, they are being inconvenienced.

**And the ramp does not stop at the surface.** `ReefKit.BANDS` begins with an *air*
band three metres up, so the ramp carries straight on through the waterline: break the
surface and the fog opens from twenty metres to two thousand six hundred, the turquoise
goes to sky, the caustics go out and the sea repaints itself from the aqua you see
looking *up* at a ceiling to the dark green-blue of a loch seen from above. All of it
happens in the third of a second it takes to cross the waterline, and it is the reason
a gasp now looks like one.

Three things had to move to let the camera up there at all. The chase camera used to be
nailed under the swell — "from above, the whole mission is a blue rectangle" — which
was true right up until the loch had a shore worth looking at, and which is what made
every breath a lie. The surface used to be a lid you could never leave through, so a
diver stood on the shingle was being clamped to fifty-five centimetres under a sea that
was not there; it is now lifted wherever the ground is above the tideline, and a body
out of the water is simply a body that falls. And there is a sky, which there could not
be before: `Sky.setVisible(false)` turns it off underwater, because the dome sets
`fog:false` on purpose and would otherwise paint a bright band along the top of the
fogged reef rim.

### The loch has an edge nobody can see

The floor used to stop 295 m out to sea, which clear water and every breath of air could
see past — the ground at the back of the loch simply was not there. It now reaches seven
reef radii on every bearing, falls away past the trench instead of lying flat, and carries
a skirt; and `ReefKit.maxFogFar` makes the rule arithmetic: no fog band in any water may
see further than the floor reaches from the worst place a diver can stand, and the test
suite checks every band in every water against it. Its surfaces take grain from one
16-tile atlas (`js/dive/materials.js`, prompt in `assets/dive/loch-materials.prompt.txt`)
spliced into the same caustic program, and a fill light and a shadow-only sun give the
facets something to separate on. Details in `docs/dive/IMPLEMENTATION.md`.

### A cave is a function, not a mesh

The one thing the open sea guarantees is that **up works**: stop kicking and you rise,
black out and you rise, empty the bar at forty metres and the water still hands you
back. A cave takes that away, and it is the only thing in the mission that does.

`ReefKit.buildCaves` puts three rock chambers on the slope, each one a ring of the
reef's own displaced boulders with a gap in it and a lid of flattened lumps on top —
overlapping blobs rather than a hollow shell, because a one-sided dome viewed along its
rim reads as paper, and because every rim lump is already exactly the cylinder the
swimmer's collider list wants. What actually stops you is not any of that geometry: it
is `caves.ceilingAt(x, z)`, a cosine dome the lumps are *placed against*, so the roof
is in the same place from every direction and at every frame rate. `Swimmer._collide`
gained four lines for it, and they are the whole risk — under a lid, buoyancy pins you
to rock instead of carrying you home, and the only way out is sideways on the breath
you have left. The chests in there are worth three trench chests.

The profile is a cosine rather than a hemisphere for one reason: a hemisphere comes down
to the floor at the rim, which would seal the mouth. This one still leaves getting on
for half the chamber's height out at the edge, which is a slot you swim through without
thinking about it.

**And blacking out under a roof cannot be a soft-lock.** A limp body rises half a metre,
stops, and would lie against the ceiling until the bell — a broken run, not a risk. So
`caves.escape` washes it out of the mouth instead. The first version aimed the push *at*
the mouth and stopped the moment the body crossed the rim, and the body promptly drifted
back under the lip (the roof is at its lowest exactly there), rose a metre, was slammed
down, and bobbed on the doorstep for the rest of the run. Aiming well *past* the mouth
and holding the push out to half again the radius is the difference between washing out
and getting stuck in the door. It costs about fourteen seconds, which is the point.

### Sharks are the first thing in the loch with an opinion

Every risk in the Dive used to be something *you* did; nothing down there ever
disagreed with you. `predators.js` is four animals that do, under three rules.

**They never kill you.** A run ended by an animal is a run you did not lose, and this
mission's whole social layer rests on a blackout being your fault and arguable. A strike
costs a lungful and knocks the last chest out of your hands onto the sand, lit, exactly
the way a blackout does — so a shark is not a punishment, it is a *transfer*, and the
money it took off you is money somebody else can go and pick up. What kills you is being
forty metres down afterwards, which is still a decision you made.

**They are attracted to what you are winning.** Sight is a radius times a noise number,
and noise is thrashing plus gold plus being under a roof. Working the trench with four
chests, on the beat, at full effort is the loudest a diver can be, and it is also the
best three seconds you will have all night. Those being the same three seconds is the
design.

**You can fight one off.** A kick, into it, inside touching distance turns it away.
There is no second button and there was never going to be one: the answer to a shark is
the verb you already have, aimed — so what the mission teaches is to swim *at* it, which
is a far better thing to have learned than to swim away.

They also do the fish a favour. `buildShoal` now runs four species over one flat array —
size, speed, school size and paint, sharing the whole simulation — and takes the animals
as threats, so a school empties out of the water in front of you a second before you
work out why. That tell is free: it is the same three-rule boids the shoal always had.

### The Dive is where the music became a mechanic

`Music` gained three surgical, backwards-compatible things: a score may bring its own
`gears` (so the Dive can hold 96 BPM across every phase change — a beat-locked mechanic
cannot survive an accelerando), `beat()` reads the bar's phase as exact arithmetic off
the start time (`this.next` is a third of a second into the future by design and cannot
be used as a clock), and one lowpass sits between the mix and the bus so submerging
muffles the band and every surface break is a bright release. Existing scores keep their
exact behaviour: `this.gears || GEARS`, a filter that starts wide open, and a new
progression nobody else names.

The mission runs a local metronome at the same tempo whenever the score has no clock, so
a muted player still gets the whole mechanic.

### The cliffs are one grid with two materials

`buildCliffs` emits a single indexed mesh and splits it into two groups: the rock
rows keep hard flat shading, and the hills behind them get smooth normals. A 200 m
hillside drawn as eight flat triangles reads as a bug rather than as art. Pines are
instanced on top of it wherever the ground is gentle, above the spray and below the
snow line, and foam collars ride the swell along the cliff feet and around every rock.

---

## Adding a mission

1. Write a class with four methods:

```js
class MyMission {
  build()  { /* create scene + camera, return { scene, camera } */ }
  start()  { /* countdown, music, whatever */ }
  update(dt, t) { /* one frame */ }
  dispose(){ /* free GPU + audio; Engine.disposeObject(this.scene) does the heavy work */ }
}
```

2. Register it:

```js
Missions.register({
  id: 'shield-wall',
  name: 'Shield Wall',
  tagline: 'Hold the line while the coins fall.',
  description: 'Longer text for the briefing screen.',
  icon: '04', maxPrize: 22000, players: 'Squad', duration: '~4 min', order: 3,
  create: (opts) => new ShieldWallMission(opts),
});
```

3. Add the `<script>` tag to `index.html`.

The mission list, briefing, pause, results, prize-pot banking and best-score tracking all
come for free. Call `Missions.complete({ earned, completed, ... })` when the run ends and
the rest happens on its own.

It also joins the PLAY rotation on its own. A night draws one mission from whatever is
registered and unlocked — four are, so a night is a different one of them — takes
the first of your `modes` as its money mode, and deals one card from your own
`preview().hand` as the night's twist. A mission gets announced by Claudia, twisted and
scored inside a night without knowing that any of that exists.

If it is a mission a Traitor could sabotage, give it a deck in `agendas.js` keyed by the
same `id`. `mission-stats.test.js` will then hold you to it: every field a card reads has
to be a field the mission actually writes.

`opts` is whatever the briefing screen produced, and it is remembered so "race again"
repeats the exact same run. A mission that wants no setup simply ignores it.

### Giving a mission a setup screen

Add four more fields and the briefing grows a panel:

```js
setup: true,                                  // show the panel at all
preview: (opts) => MyMission.preview(opts),   // everything the panel displays
modes: MyMission.MODES,                       // { id, name, blurb, better }
medals: MyMission.MEDALS,                     // [null, bronze, silver, gold, author]
```

`preview()` has to work without touching the GPU — it runs on every keystroke in the
seed box — so it must answer from the seed alone: the course's name, its conditions, the
hand of modifiers, the payout multiplier, the record key and whether a ghost exists.
`main.js` only ever renders what `preview()` returns, so it never learns what a sea state
is.

Only implemented missions are registered and shown in the mission series.

### Reusing the world

Three world kits, and they are three different shapes rather than three skins:
`CourseKit` builds a corridor you travel *down*, `ForestKit` builds a place you stand in
and look *around*, and `MountainKit` builds a face you fall *down*.

```js
const face   = MountainKit.makeFace(rng, { top: 1180, sections: 5 });
const chutes = MountainKit.findChutes(face, rng, { count: 5 });   // measured, not placed
MountainKit.buildRamps(face, rng, { spacing: 96 });
scene.add(MountainKit.buildTerrain(face, rng));
```

`face.heightAt(x, z)` is the whole mountain — profile, folds, groom, berms, chutes and
every kicker on it — as one pure function, and `face.frame(x, z)` answers where you are in
the run's own language with no search in it. Anything that wants to put an object on this
mountain asks those two and nothing else.

`CourseKit` is deliberately generic:

```js
const path   = CourseKit.makePath(rng, { segments: 16, segmentLength: 245, halfWidth: 66 });
const cliffs = CourseKit.buildCliffs(path, rng, { baseHeight: 30, heightVary: 52 });
const rocks  = CourseKit.buildRocks(path, rng, { count: 72, avoid });
const buoys  = CourseKit.buildBuoys(path, { spacing: 135 });
```

`path.frame(x, z, hint)` returns arc length, signed lateral offset and heading — enough
for progress bars, wall collision and "am I going the right way".

### Weather is two dials, and both are real

`Conditions` holds a list of times of day and a list of sea states. One call sets both:

```js
const applied = Conditions.apply(cond);   // cond = { time: 'dusk', sea: 'heavy', wind }
scene.add(Conditions.lights(cond));
```

It has to run **before** `Sky.build()`, because the mountain haze is baked into vertex
colours against the fog colour of the day.

The sea dial is not a filter. `Water.setSeaState({ swell, chop, wind })` rewrites the
amplitudes in the same `W` array that the vertex shader and `sampleSurface()` both read,
so a storm changes what the water looks like and what the boat does on it in the same
frame. `swell` scales the long waves you surf; `chop` scales the short stuff that only
rattles the hull; `wind` rotates the whole field. The Gerstner `q` is renormalised
against the new amplitude, so crests keep their shape and never loop back on themselves
however big the sea gets.

`Conditions.forSeed(seed)` picks a pair deterministically, which is what makes a seed a
whole race rather than just a path. `Conditions.CYCLE` is the other way round the same
problem: `nextTime(id)` walks dawn → noon → dusk → night, so a mission can move its own
clock on between runs instead of asking the seed for an hour it has already had. The boat
race keeps its place on that cycle in the save (`settings.raceTime`), which is why a
retry of the run you just finished comes back at a different hour.

The wood and the loch each **extend** this rather than forking it. `ForestConditions`
keeps `Conditions.TIMES` for the light and adds the dial the sea does not have — what
the air is doing, which really does push arrows and bend trees. `DiveConditions` does
the same with how clear the water is, and takes no time-of-day option at all: the Dive
is always noon on purpose, and the one thing that block exists to guarantee is that the
water is never dark. Both hand the light rig straight back to `Conditions.lights`, so
there is only ever one description of what noon looks like.

### Modifiers are data, not code

A card in `modifiers.js` is a bag of overrides — `config`, `tune`, `cond`, `fog`, `flags`,
`payout` — and the mission is the only thing that knows how to race. Most new cards are
four lines:

```js
{ id: 'fog', name: 'Fog Bank', icon: '≡', payout: 1.40,
  blurb: 'You will see the next gate about a second before you have to commit.',
  fog: { near: 60, far: 620 }, waterFog: { near: 40, far: 560 } },
```

`flags` is the escape hatch for behaviour that cannot be expressed as a constant
(`oneCrash`, `riptide`, `shrinkRings`, `allRisk`); the mission checks for those by name.

### Adding a sound

```js
AudioBus.define('gong', (ctx, dest, opts) => { /* build nodes, connect to dest */ });
AudioBus.play('gong', { pitch: 2 });
```

No audio files anywhere; it's all synthesised at runtime.

### The score

The music is one theme in D minor, arranged for every room in the night. There are
still no audio files: `music/instruments.js` builds a string ensemble, pizzicato, brass,
a formant choir, timpani and taiko, FM bells and a piano out of oscillators. Each score
plays into its own convolution reverb (the impulse response is generated at load) and
then through a shared saturator, compressor and limiter.

A cue in `music/cues.js` is a set of named **sections**. A section is a tempo, a chord
loop and some layers, and each layer is an instrument, a one-bar velocity pattern and a
rule for which chord tone to play. Scenes call sections by name:

```js
const m = Music.finale();                          // opens on 'arrival'
m.section('ballot', { at: 'bar', fill: true });    // switch on the next bar, cymbal into it
m.stinger('name', { at: 'beat', n: 2 });           // a hit on the next beat you will hear
m.setKey(1);                                       // up a semitone from the next bar
m.silence(true);                                   // true silence; the next stinger lifts it
m.speakerDuck(true);                               // step back whenever a microphone is loud
```

`setGear(i)` still works everywhere and means `sections[gears[i]]`, so every mission
kept its call sites. The Dive still holds 96 BPM in every section, and its grid now also
survives a pause.

The fire is scored stage by stage:

| Moment | Section |
| --- | --- |
| The loch, and Claudia opening | `arrival`: a fifth on the low strings, the theme on piano, then cello |
| The rules and the warning | `warn`, with a timpani roll into the warning |
| Thirty seconds each | `floor`: pizzicato and a heartbeat under the talking, ducked whenever anybody speaks. Each new speaker adds a layer |
| The ballot | `ballot`: the sixteenth-note cello ostinato, taiko, and horns quoting the theme |
| "My vote is for…" | `names`: stop-time, with one hit per name, each a step higher |
| She asks for the pouch | `pouch` (and `lastPouches`, a semitone higher each pouch) |
| The held beat | `held`: a heart and a low D, with a Shepard riser climbing through the wind-up |
| The throw | `silence()`: the riser and the band are cut at the release |
| The answer | the `reveal-traitor` or `reveal-faithful` stinger, then `afterTraitor` or `afterFaithful` |
| The verdict | `verdictWin`, `verdictLoss` or `verdictTraitor`: the whole theme, eight bars |
| The verdict panel | `creditsWin`, `creditsLoss` or `creditsTraitor`, for as long as anyone stays |

The boat race has a score now too: a count-in the band plays with the lights, and four
gears that follow the boat's speed.

The menus have one as well. `title` is the theme played as an overture: `gate` states it
on a piano with a harp and the celli under it, and one full pass later `main.js` lifts
the score into `anthem` — the horns, the choir, two drums and the harmony opened out to
the full eight bars — on a bar line, behind a reverse cymbal. It runs across the front
door, the lobby, the dressing room, the mission list and the briefing rather than any
one of them, because a theme that restarted every time you pressed Back would be a
jingle; anything that is not a menu stops it and starts its own.

**Listening.** Open `/jukebox.html` on the dev server. It has every cue, section and
stinger on a button, plus controls for intensity, key, muffle and speaker ducking.
**Play the fire** runs the finale's whole arc in about two minutes. `test/music.test.js`
checks the arithmetic, the grid, the budget, the key and that every name the game asks
for exists, but only a person can tell whether the result sounds good.

### Adding a line, or a beat

All the prose is in `js/scenes/claudia-lines.js`. A set is a list of takes; a take is a
list of sentences, and the sentences are the timing — `Voice` speaks one at a time and
puts a real pause at every full stop, so a line written as one long clause is a line
delivered in a rush. Takes are drawn from the run seed, so a second night is not a
recital of the first and a shared seed is still a shared night.

`{name}`, `{mission}`, `{twist}` and `{pot}` are filled by the caller.

The `TABLE` and `YOU` lists in that file are no longer read by the game. They were the
bots' script, and then briefly a menu of things you could say to each other; a list of
pre-written opinions is what you build for players who cannot talk to each other, and
there are three live microphones here. They are kept only because
`dialogue-editor.html` loads this file and edits them. If a written-dialogue mode never
comes back, delete both.

### The save file

`GameState` holds what survives between nights: the prize pot, mission records, settings
and an event log. Saves are keyed `traitors.save.v1`; bump `VERSION` in `state.js` if the
shape changes.

It used to also carry a twelve-person cast with roles and suspicion scores on it, drawn
up before there was anything to play. Nothing ever read it, and a role field in the one
file that *is* written to disk was a leak waiting for a careless line, so it went with
the bots. The version is unchanged because none of it was ever used: an older save
simply arrives carrying a few keys nobody asks for.

**A night in progress is not saved at all any more.** It used to be, under
`traitors.session.v2`, and could be resumed from the front screen. A run is now three
people being in the same room at the same time, and there is nothing on this machine
that can bring that back — so `Session` writes none of it down, and the key is gone.

Your look and your name are yours and do persist: `traitors.look.v1` and
`traitors.name.v1`, written by the dressing room. Both follow the same discipline as
everything else here — a corrupt or unavailable store is not an error, it is a fresh
look.

Per-course records live under `missions[id].runs`, keyed `mode:seed:modifier` by
`GameState.runKey()`, because that whole triple is what a time or a score is a record
*of*. `recordRun()` asks the mode's own `better()` even about the very first run — a `b`
of `null` means "nothing to beat", which is not the same as "anything beats it", or a
time trial abandoned after twelve seconds would set a twelve-second time.

Ghosts are much larger and much less precious than the save, so they live in their own
key, `traitors.ghosts.v1`, capped at twelve with the oldest evicted first. A recording is
positions at 10 Hz rounded to a decimetre, plus the arc length at each sample — which is
what lets the HUD show a real split rather than a distance. Losing the whole ghost store
to a quota error must never cost you the prize pot, which is the entire reason it is not
in the save.

### Tests

`node test/run.js`. No browser and no dependencies: the session, the transports, the
agendas and the look layer have no DOM in them by design, so `test/harness.js` stubs
only what they touch on the way past — `localStorage`, and a `THREE` that throws with a
useful message if anything reaches for it.

| Suite | What it holds down |
| --- | --- |
| `session.test.js` | A whole night through `dispatch`: both ballots, a tie and its revote, the auto-stop at two, and both endings a task can produce |
| `privacy.test.js` | The invariant everything else stands on — no role in the state, at any phase, ever, until the verdict |
| `agendas.test.js` | Every card and every alibi either side of its own threshold, plus the rules of the deck: a public tell, a way out, no free passes and no free alibis |
| `mission-stats.test.js` | The other half of the deck: the missions' own trackers, driven frame by frame, producing the numbers the cards judge |
| `transport.test.js` | A host and a guest in one process on a fake wire, including a guest that connects late and a guest that tries to vote as somebody else |
| `swim.test.js` | The Dive's feel as arithmetic: the shaped impulse, the chain against `topSpeed`/`flowTop`, frame-rate independence at 20 fps and 120, the dive profile that tuned every air constant, and the shore — a diver at rest floating, ground above the tideline being standable, the leap off the bank, and the body being pitched the way it is travelling |
| `look.test.js` | That nothing you can put in localStorage produces a figure with no coat on |
| `music.test.js` | The score, played into a recording AudioContext. It checks that notes land on the grid, sections change on bar lines, the Dive's beat survives a pause and the owl stays inside the voice budget. It walks a whole night at the fire in order, checks that every stinger and section the game names exists and that the theme sits on its chords, and refuses what a browser would throw on |
| `aim-assist.test.js` | The whole licence of the touch aim assist: it never turns a still thumb, never turns more than a third as far as the thumb did, never aims at the intercept, and never helps you onto a dove |
| `touchguard.test.js` | The zoom guard both ways round — a pinch refused at 1x, and the same pinch *allowed* once the page has zoomed, which is the only way back from an iPad stuck at 2x — plus the exemption that keeps a control's second press: the task chip asks twice, and the double-tap guard was eating the press that confirms it |
| `touchpad.test.js` | The touch controls, pressed. It builds the overlays out of `index.html` itself and runs `input.js` against them on five machines — a phone, a bare iPad, an iPad in a keyboard case, a laptop with a touchscreen and a plain desktop — then taps KICK, drags to look, pushes the sticks and checks the aim works on a browser with no pointer lock. It also holds the two stacking facts nothing else can see: that every mission HUD is a screen the thumb sheets are allowed under, and that the Traitor's task button is *above* the full-screen sheet that used to swallow every tap on it |

Two suites are the exceptions to "no DOM", and both for the same reason: what they test
*is* the browser boundary. `touchguard.test.js` builds a document out of listener tables,
because the thing under test is which events get a `preventDefault`. `touchpad.test.js`
goes further and reads the real markup — `test/minidom.js` parses the overlay blocks
straight out of `index.html` — because a test that writes its own copy of the markup goes
on passing for ever after somebody renames `.kick-pad`, and renaming `.kick-pad` is
exactly how The Dive loses its controls. Neither needs layout, paint or a real Safari.

The whole thing takes about four seconds. Six of these have already earned their keep:
`agendas.test.js` found two cards that could be passed by doing nothing at all,
`mission-stats.test.js` found a card reading a counter the boat race declared and never
once wrote,
`swim.test.js` is where the Dive's air, pressure and carry constants were *tuned* rather
than merely checked — the trench is a round trip on the beat and not off it because that
file says so and the numbers were moved until it did,
`transport.test.js` found a guest that registered its listener *after* sending the
message it was waiting for a reply to,
`touchpad.test.js` is where the iPad control bugs were caught and held — the media query
that hid the thumb sheets, the missing pointer-lock fallback, the ski HUD the menu walker
thought was a menu and the task button stacked underneath the sheet that ate it,
and the floor tests found that a speaking turn
left open really does keep ticking through every remaining seat — which is correct
behaviour, and held the suite open for a minute and a half until they learned to close
it.

---

## Tuning

Most of the feel lives in four constant blocks:

- `Swimmer.TUNE` in `js/entities/swimmer.js` — the Dive. The stroke (`kickAccel`,
  `kickTime`), the glide (`glideDrag`, `carve`), the chain (`window`, `flowGain`,
  `flowKick`) and the breath (`airDrain`, `pressureRef`, `intervalKeep`). Every number
  in it has a unit comment and most of them are asserted in `swim.test.js`, so moving
  one and running the suite tells you what you just changed about the game.
- `Boat.TUNE` in `js/entities/boat.js` — acceleration, top speed, grip, `surfGain`
  (how much free speed a wave face gives), `launchSurf` (how hard a crest has to drop
  before you fly), `hullLength` (how much chop the hull planes over), and the air-trick
  set: `airRollRate` / `airPitchRate` (how long a rotation takes, so how big a launch you
  need) and `landTolerance` (how far off level you may land before it costs you).
  `Boat.HULL` next to it is the shape of the boat itself.
- `BoatRaceMission.CONFIG` in `js/missions/boat-race.js` — gate spacing and radius, how
  often a gate gets a gold ring and what it pays, timers, the chain window, trick and
  graze payouts, multiplier cap.
- `Conditions.TIMES` and `Conditions.SEAS` in `js/world/conditions.js` — every palette and
  every sea state, with the `weight` that decides how often a seed draws each one.

Medal par is worked out per run in `_computeTargets()` from the channel that was actually
drawn — its length, its gate count and its sea — rather than from a global number, so a
short twisty gully and a long open reach are both worth a gold. If runs are coming out too
gold, the coefficients there are the dial.

Nothing is on a fixed seed any more: `CONFIG.seed` is only the fallback if a run is
launched without one.

### Where the weight comes from

The physics is arcade-simple; the response to it is what sells the hits. `hitStop`
freezes time for a few hundredths of a second on a perfect ring, a heavy landing or a
crash, and `timeScale` gives a long slow exhale over the finish line. The camera has
its own `camDip` (a drop on landing) and `camPush` (a fall-back when the boost lights),
plus a fine rattle that only appears above three quarters of top speed. Phones buzz
through `Input.haptic()`, which is a no-op on a machine with nothing to buzz.

The one place the game deliberately lies to the physics is the trick landing. Releasing
boost in the air rounds the banked rotation to the nearest whole turn instead of freezing
it wherever it happened to be, and the cosmetic air lean and nose-up arc are held right
down while a rotation is banked — at full strength they are most of a radian, which would
swallow the whole landing tolerance and make a completed roll impossible to put down. The
camera only follows a fraction of the roll, too: a horizon that spins with the hull is a
landing you cannot read.

### Boat Race Highland presentation

Boat Race opts into the presentation modules in `js/boat/`: marine material atlas,
classic speedboat details, coastal landmarks, scalable foam and spray, and layered audio.
Its simulation and course/scoring owners remain unchanged. The shared water and course
builders retain their original appearance unless the Highland profile is selected.
Both game and OS reduced-motion settings suppress cosmetic camera and flash effects.

Run `npm run test:boat-render` for the rendered regression suite. Open
[the local review gallery](docs/boat/review.html) for matching before/after views and
recordings; [implementation and validation notes](docs/boat/review.md) include asset
provenance, measurements and reproduction commands. The gallery is a local development
artifact, outside the game server's public-file allowlist. SwiftShader captures establish
correctness; physical laptop and phone FPS targets still need device measurements.

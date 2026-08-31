# The Traitors

A low-poly, vibrant browser game for **three real people**, with voice chat, played in
a browser with no account and no install. Three ways in:

- **PLAY / CREATE ROOM / JOIN ROOM** runs a whole night for three — a welcome on a
  Highland hill, a mission, a round table, a second mission, and a finale at the fire
  where the pot is won or lost on one throw. You type a name, somebody reads out four
  letters, and that is the entire sign-up.
- **MISSIONS** is solo practice on the missions themselves. Two are built: **Boat Race**
  and **Shootout**.
- **DRESSING ROOM** is where you decide who you are. Saved on your own machine; the
  other two see exactly what you built.

Open `index.html` in a browser. Everything is plain `<script>` tags, so it works
straight off disk (`file://`) for solo practice and the dressing room.

**Multiplayer needs a real origin.** Microphones and WebRTC want a secure context, so
for a night with other people the folder has to be served over http on localhost
(`./serve.sh`) or over https for people on other machines. It is still a static folder
— GitHub Pages or Netlify will do, and there is no build step and no server to run.

Dependencies are three.js and Trystero from a CDN, plus two Google fonts. Claudia is
spoken by the browser's own speech synthesiser; there are no audio files anywhere.

---

## Playing a night

| Beat | What happens |
| --- | --- |
| **The hill** | Claudia welcomes you and tells you what you are. Nobody else is told. A Traitor is also handed a task. |
| **Mission** | One of the missions, drawn from the seed, played by all three of you at once. Everything anybody earns goes into the night's pot. |
| **The board** | Everybody's numbers from that mission, side by side. It accuses nobody. |
| **The round table** | An open floor: every microphone live at once, no turns, talk over each other. **Nobody is banished here.** |
| **Mission** | The second one, with its own twist. The last chance to add to the pot. |
| **The fire** | Back to one voice at a time — thirty seconds each — then: end the game, or banish one more, and open their pouch. |

### The roles

Roles are drawn once, from the run's seed:

- **a quarter of all nights contain no Traitor at all**;
- the other three quarters have exactly one, uniform over all three players — which
  makes any one of you, yourself included, the Traitor on a quarter of all nights.

You are told your own role on the hill. Nobody is ever told whether a Traitor exists.
That is the whole game: a table where everyone may be honest and nobody can prove it.

### The Traitor's task

A Traitor is handed one small piece of work per mission, on the hill, on a card only
they see. Not hard: the deck is written so that anybody who reads their card and pays
attention will manage it. Complete it and nothing happens — nobody is told, and the
night carries on exactly as it would have.

Leave it undone and Claudia stops the room at the next gathering, before anybody has sat
down, and the Faithfuls win on the spot.

The Traitor is **not told they failed**. They walk into that room believing they got
away with it.

**Every task has a public tell, and every task has a way out.** That pair is the whole
design. A sabotage nobody can observe being performed is not a risk — it makes the round
table unwinnable for the Faithfuls. A sabotage nobody can survive performing is not a
game either — it makes the night unwinnable for the Traitor. So every card in
`js/missions/agendas.js` carries both: a `tell`, naming the thing the other two can
physically see or hear happen, and an `alibi` — a second, far harder run of play that
leaves the same number somewhere nobody can argue with.

Any Traitor can complete these. Only a very good one completes them and walks into the
round table with the board arguing on their side. The gap between those two is the
evening.

| Task | What the others see | The way out |
| --- | --- | --- |
| Cross the line last | Last is the first column on the board | Lead the field for half the race and lose it by under 1.5s. Nobody suspects the boat that was winning |
| Spend the whole boost meter before halfway, and arrive dry | The shared strip carries everybody's meter: yours flatlines early and never comes back | Win it anyway. A dry meter and a hull in front is the best drive anyone at that table will see |
| Three times, line up a gold ring and take the safe one instead | Gold is most of the money, and you come back short of two people who ran the same water | Thread everything else dead centre: eight perfect passes and nothing dropped pays the gold back |
| Stop dead in open water for a full second | Your marker stops on the strip while two boats keep going | Take the second back — finish inside two seconds of the boat ahead and it is a story about the recovery |
| Let five birds leave the clearing past you | Every escape is called out to all three of you, where it happened | Finish top of the strip anyway. Nobody counts the escapes of whoever took the most |
| Put an arrow through a dove | The fine comes off your total in front of everyone — the one number out there that can go backwards | Shoot it into the middle of a flock and be above your old total within eight seconds |
| Put ten arrows into empty air | A hole in the board, and ten whistles the other two can hear | Hold a chain of twelve while you do it. Ten misses in a hail of arrows is a style |
| Spend a whole round away from the shooting line | Your figure is missing from the line and your row stops climbing | Walk back in and clear the *next* round without a single miss |

Neither field is a comment. `test/agendas.test.js` asserts every card has a tell and an
alibi, that no card can be passed by doing nothing, and that no *alibi* can be earned by
doing nothing either. `test/mission-stats.test.js` then drives the missions' own trackers
and asserts they produce the numbers the cards read — a counter that sits in a stats
object and is never written is a card that can only ever fail, which is a bug this deck
has already had once.

A card is also never dealt into a run that has made it impossible: the twist's flags
travel with the mission plan, and Cold Engine will not hand anybody "spend your whole
boost meter". Hard is the point; impossible is a sentence.

After every mission all three players see the same **board**, and its columns are chosen
so that each card's tell *and* its alibi are both on it — place beside time spent in
front, misses beside best chain, doves beside money. It never accuses anybody. It is on
screen for the whole round table, and it is what turns "I think it was you" into an
argument with something behind it — and, on a very good night, what turns it into an
argument the Traitor wins.

### Voice, and the floor

The microphone is open in the lobby, the dressing room, the missions and the round
table. The table is deliberately a free-for-all: all three microphones live at once for
the length of the discussion, no turns, no order, cut in whenever you like. Nobody is
banished there, so there is nothing that needs protecting from an argument — and an
argument answered two turns later has stopped being one. A clock runs on the discussion
as a whole, and any of you may press **I've said enough**; when everybody has, the table
moves on early.

At the fire it is not open. There the floor goes round the seats, thirty seconds each,
and only the person holding it can be heard — that is the room where names get said.

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

Everyone still sitting votes **end it** or **banish**. Ending must be unanimous: one
**banish again** choice forces another banishment. Once every decision is locked,
Claudia burns the decision pouches one person at a time, revealing all **end game**
choices first and then every **banish again** choice. Everyone then names somebody and
those names are spoken aloud one by one before the tally. A tied tally is voted again;
it is never broken randomly. The named player's role pouch then goes into the fire.
The cycle repeats unless only two contestants remain, when the game ends automatically.

When the night stops — by a unanimous vote or by reaching the final two — nobody is told
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
| Menus | mouse, touch, **arrow keys / d-pad / left stick**, `Enter` or **A** to choose, `Esc` or **B** to go back |
| Hill, discussion and fire | first person: **WASD / left stick** to move, **mouse / right stick / arrows** to look; click once to capture the mouse |
| Dialogue | Voiceover cannot be skipped; clicks capture the pointer without cutting a line short |
| Pouch reveal | The camera unlocks only for the short cinematic as the pouch is thrown into the fire |
| The fire | the vote is a panel of buttons; the same four inputs drive it |
| Missions | as documented below, and gamepad and touch both work |
| Your microphone | `V`, the pad's **Y/triangle**, or the button in the corner. It is separate from game sound, and it is on every screen |
| A room code | four `<select>`s, so left/right on a pad dials a letter, a phone gets its native picker, and a keyboard can type A–Z |

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

Gamepad and touch (on-screen stick + boost pad) both work.

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
  none. Fog Bank, Riptide, Glass Cannon, Cold Engine, Closing In, Tight Rings… each one
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

Gamepad and touch both work; touch gets a move stick plus draw, breath and sprint pads.

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
   only on the approach, so you have to turn, track and lead it without aim assist.
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

## Architecture

The engine knows nothing about gameplay, and missions know nothing about each other.
A mission hands the engine a `{ scene, camera }` and an update function; that's the
entire contract. A round-table scene and a boat race have nothing else in common — and
the scenes take exactly the same contract, which is why `js/scenes/` needed no engine
changes at all to exist.

```
index.html            script order + all screen markup
css/style.css
js/
  core/
    util.js           seeded RNG, damping, easing, money formatting
    engine.js         renderer, main loop, the active view, GPU disposal
    input.js          named actions (throttle/steer/boost/…), keyboard + pad + touch
    audio.js          procedural Web Audio; sounds are registered recipes
    music.js          the runtime score: a step sequencer and three profiles
    state.js          persistent save: prize pot, mission records, ghosts, settings
    screens.js        DOM screen stack + fade transitions
    missions.js       mission registry and lifecycle
    look.js           who you are: the dressing-room descriptor and its storage
    party.js          the only file that knows what WebRTC is — rooms, codes, peers
    session.js        the authority for a night: phases, roles, tasks, votes, pot
    net.js            the transport seam — three methods, two implementations
    transports.js     the host's reducer and the guest's mirror, on the wire
    voicechat.js      microphones, peer audio, and the thirty-second floor
    mission-net.js    three people inside one mission: poses, events, the board
    lobby.js          a name, four letters, three people
    roomui.js         the floor bar, the board, the field, your task, the mic button
    voice.js          Claudia out loud, and the subtitles that stand in for her
    uinav.js          gamepad and keyboard navigation for every menu
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
    coming-soon.js    locked placeholders / worked example
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
  run.js              every suite; `node test/run.js`
  session.test.js     a whole night driven through `dispatch`
  privacy.test.js     the invariant everything else stands on
  agendas.test.js     every card, at its own boundary
  mission-stats.test.js  the missions really do count what the cards read
  transport.test.js   a host and a guest, in one process, on a fake wire
  look.test.js        the dressing room's data
```

### The server is one of the three browsers

There is no server. The host's browser *is* the authority: it owns `Session`, draws the
roles and the tasks, holds the clock, and is the only client where `dispatch` does
anything at all. The other two run the identical file in `guest` mode, where `dispatch`
is inert and `state` is a mirror installed by `adopt()` from whatever the host last
sent. Scenes cannot tell the difference, which is the point — they read `state`, they
call `Net.send`, and that is exactly what they did when this was single-player.

Transport is WebRTC over Trystero, which finds the other two through public relays. So
the whole thing stays a static folder: no server to run, no server to deploy, and a
four-letter room code is the entire matchmaking system.

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
   state that made it true would render the finale from the round table's data — and
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
gamepad and tappable on a phone without one line of input code in `dressing.js`.

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
shoulders drop back through zero.

### Claudia

`speechSynthesis` sounds like a robot mostly for reasons you can fix, and `voice.js` is
those fixes: score the OS voice list rather than taking the first one (and let the player
override, because what is installed varies wildly); speak one sentence per utterance, so
there are real pauses at full stops and Chrome's fifteen-second truncation never bites;
rate 0.92 and duck the score under every line.

And never depend on it. No synthesiser, muted, or a voice that fires no events: all of
them fall through to subtitles held for `1.6s + 45ms/char`, and the scene above cannot
tell the difference. `Voice.say()` always resolves, exactly once, whatever the browser
does. Your own line at the round table is deliberately silent — being dubbed by the
host's voice in your own mouth is worse than reading it.

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

### The boat is lofted, not assembled

`Boat.HULL` is a handful of numbers — length, beam, deck crown, where the cockpit
starts and stops. `Boat.section(f, u)` turns them into a real section curve (deep-V
bottom, hard chine, flared topside) and `buildMesh` sweeps that along the centreline.
Every fitting on top asks `Boat.deckAt(z, x)` where the deck actually is before it
places itself, so changing the hull moves the seats, the windscreen and the flag with
it and nothing is left hovering.

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
  icon: '03', maxPrize: 22000, players: 'Squad', duration: '~4 min', order: 2,
  create: (opts) => new ShieldWallMission(opts),
});
```

3. Add the `<script>` tag to `index.html`.

The mission list, briefing, pause, results, prize-pot banking and best-score tracking all
come for free. Call `Missions.complete({ earned, completed, ... })` when the run ends and
the rest happens on its own.

It also joins the PLAY rotation on its own. A night draws two missions from whatever is
registered and unlocked, takes the first of your `modes` as its money mode, and deals one
card from your own `preview().hand` as the night's twist — so a mission gets announced by
Claudia, twisted and scored inside a night without knowing that any of that exists.

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

`coming-soon.js` holds three locked placeholders — delete a `locked: true` and fill in
`create()` to turn one into a real mission.

### Reusing the world

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

### Adding a line, or a beat

All the prose is in `js/scenes/claudia-lines.js`. A set is a list of takes; a take is a
list of sentences, and the sentences are the timing — `Voice` speaks one at a time and
puts a real pause at every full stop, so a line written as one long clause is a line
delivered in a rush. Takes are drawn from the run seed, so a second night is not a
recital of the first and a shared seed is still a shared night.

`{name}`, `{mission}`, `{twist}` and `{pot}` are filled by the caller.

The `TABLE` and `YOU` lists in that file are no longer read by the game. They were the
bots' script, and then briefly a menu of things you could say at the round table; a list
of pre-written opinions is what you build for players who cannot talk to each other, and
there are three microphones on that table now. They are kept only because
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
| `look.test.js` | That nothing you can put in localStorage produces a figure with no coat on |

The whole thing takes about two seconds. Four of these have already earned their keep:
`agendas.test.js` found two cards that could be passed by doing nothing at all,
`mission-stats.test.js` found a card reading a counter the boat race declared and never
once wrote,
`transport.test.js` found a guest that registered its listener *after* sending the
message it was waiting for a reply to, and the floor tests found that a speaking turn
left open really does keep ticking through every remaining seat — which is correct
behaviour, and held the suite open for a minute and a half until they learned to close
it.

---

## Tuning

Most of the feel lives in three constant blocks:

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
plus a fine rattle that only appears above three quarters of top speed. Pads rumble
through `Input.rumble()` and phones buzz through `Input.haptic()`; both are no-ops
where the hardware cannot do it.

The one place the game deliberately lies to the physics is the trick landing. Releasing
boost in the air rounds the banked rotation to the nearest whole turn instead of freezing
it wherever it happened to be, and the cosmetic air lean and nose-up arc are held right
down while a rotation is banked — at full strength they are most of a radian, which would
swallow the whole landing tolerance and make a completed roll impossible to put down. The
camera only follows a fraction of the roll, too: a horizon that spins with the hull is a
landing you cannot read.

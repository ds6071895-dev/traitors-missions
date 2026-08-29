# The Traitors — Missions

A low-poly, vibrant browser game. One mission is built so far: **Boat Race**.

Open `index.html` in a browser. That's it — everything is plain `<script>` tags, so it
works straight off disk (`file://`). If you'd rather use a server, run `./serve.sh`.

Only external dependency is three.js from a CDN, plus two Google fonts.

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
- **The modifier** is a hand of three cards dealt from the seed, of which you keep one or
  none. Fog Bank, Riptide, Glass Cannon, Cold Engine, Closing In, Storm Sea… each one bends
  the rules and multiplies everything you earn. A shared seed deals a shared hand.
- **The ghost** is your own best run on that exact setup — same seed, same mode, same
  modifier — replayed beside you with a live split. Anything else would be lying about
  where you are.

Each setup keeps its own record and its own medal, because a storm at night with Glass
Cannon running is not comparable to anything else. Medals are worked out from par for the
channel you actually drew: **Bronze**, **Silver**, **Gold**, **Author**.

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

## Architecture

The engine knows nothing about gameplay, and missions know nothing about each other.
A mission hands the engine a `{ scene, camera }` and an update function; that's the
entire contract. A round-table scene and a boat race have nothing else in common.

```
index.html            script order + all screen markup
css/style.css
js/
  core/
    util.js           seeded RNG, damping, easing, money formatting
    engine.js         renderer, main loop, the active view, GPU disposal
    input.js          named actions (throttle/steer/boost/…), keyboard + pad + touch
    audio.js          procedural Web Audio; sounds are registered recipes
    state.js          persistent save: prize pot, mission records, cast/roles/rounds
    screens.js        DOM screen stack + fade transitions
    missions.js       mission registry and lifecycle
  world/
    sky.js            sky dome, sun, clouds, birds, stars, distant mountain rings
    water.js          Gerstner ocean — same wave stack on GPU and CPU
    conditions.js     time-of-day and sea-state presets; one call applies both
    course.js         path, highland cliffs, rocks, channel buoys (reusable kit)
  entities/
    boat.js           hull mesh + arcade physics (surf, launch, trick, land, collide)
  fx/
    fx.js             particles, wake ribbon, shockwaves, floating labels
  missions/
    modifiers.js      the pre-race card deck — declarative rule-benders
    boat-race.js      Mission 01
    coming-soon.js    locked placeholders / worked example
  main.js             boot, title screen, briefing, results, attract-mode ocean
```

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

The title screen, briefing, pause, results, prize-pot banking and best-score tracking
all come for free. Call `Missions.complete({ earned, completed, ... })` when the run ends
and the rest happens on its own.

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
whole race rather than just a path.

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

### The save file

`GameState` already models the whole show — cast, roles, alive/dead, round number,
phase, and an event log — even though only the prize pot and mission records are used
today. `assignTraitors()`, `alive()` and `traitors()` are there for the round table.
Saves are keyed `traitors.save.v1`; bump `VERSION` in `state.js` if the shape changes.

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

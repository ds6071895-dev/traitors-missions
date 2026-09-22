# The Dive — the loch rebuilt, and the tide

The Dive was the one mission that never had the pass the Boat Race, Shootout and
Descent all got: no material atlas, no module folder, no quality tiers, no shadows, and a
floor that ended on screen. This is that pass, plus a rework of the loop.

## What was wrong, measured

| | before | why it showed |
| --- | --- | --- |
| floor reach, seaward | 295 m (±9 % jitter, 268–321) | clear water fogged at 338 m, the air at 2600 m |
| floor reach, along the beach | ~394 m | the coast ended in mid-air on every breath |
| floor past the trench | a dead-flat −46 m plate, 198 → 295 m | nothing to look at, then nothing at all |
| props | all inside 152–186 m | a ~110 m bare annulus round the reef |
| trench dressing | no sea fans (rejected below −50 m), 6 % kelp | the richest water in the loch was bare sand |
| seabed | 12,896 triangles, no UVs, no maps | 62 m hillside facets with nothing on them |
| lighting | one `Conditions.lights` rig | no fill, no shadow: facets did not separate |

## The ground

- `ReefKit.FLOOR_REACH = 7`: the floor reaches seven reef radii (1330 m) on **every**
  bearing, rings weighted so just over half sit on the reef itself (out to 1.1 × radius)
  and the rest ease out to the rim. The rim carries no jitter and a 220 m skirt.
- `heightAt` keeps falling past the rim (`abyss`, up to −74 m more), gated off the far
  beaches. The −52 m clamp still holds everywhere a chest can be — the 2000-seed test is
  unchanged.
- **The fog is an invariant.** `ReefKit.maxFogFar(radius)` is the furthest any fog may see
  from the worst place a diver can stand and still hide the rim. `_updateDepth` clamps to
  it, and `mission-stats.test.js` asserts every band in every water sits inside it. The air
  band is now `near 110 / far 1000`.
- Fans and anemones reach 1.3 × radius and grow into the trench (to −64 m), with a
  fourth, deep-blue emissive anemone that is the trench's own light. Kelp keeps a 16 %
  floor in the deep. Rocks reach 1.5 × radius and stay in the water. The wood is sampled
  from the landward half-turn only and fills its full count.

## The atlas — `js/dive/materials.js`

One `assets/dive/loch-materials.png`, 4 × 4, prompt in
`assets/dive/loch-materials.prompt.txt`. Tiles: sand, maerl, silt, bedrock / coral,
coralline, kelp, barnacle / steel, hullPaint, timber, iron / shingle, machair, heather,
granite.

- Each cell is cropped 2 px in, into its own repeating 256 px canvas (128 px on Low), so
  mipmaps never bleed across the grid.
- **Grain, never colour.** Tiles multiply over the reef's hand-tuned vertex colours and
  are normalised by their own mean in linear light, so a textured loch has the brightness
  of the untextured one.
- **Nothing waits for it.** A tile is white until the sheet arrives; white is the identity
  of a multiply. A missing file is a loch without grain.
- The atlas is spliced into `ReefKit.causticMaterial`'s own `onBeforeCompile` via
  `DiveMaterials.chunk(recipe)` — one program per material, as before. Recipes pick tiles
  off slope, height and vertex saturation: the floor is sand / coral / bedrock / shingle /
  machair / granite in one draw; the wreck picks steel, painted plate or timber off its own
  paint. Low quality projects from above (one fetch per tile) instead of triplanar.
- Textures carry `userData.diveShared`, which `Engine.disposeObject` now respects.

## Light and cost — `js/dive/presentation.js`

A cold hemisphere fill and a 0.38-intensity shadow-only sun that follows the diver,
snapped to shadow texels. Rock, wreck and caves cast; the floor, rock, wreck and caves
receive; nothing that sways casts. Low / Medium / High set the floor grid
(84×128 / 120×168 / 150×208) and the shadow map (none / 1024 / 2048). **Quality never
changes what exists** — every client builds the same colliders from the seed. The
briefing has a Graphics choice for the Dive; party runs use the global setting.

## The loop — `js/dive/tide.js`, `js/dive/feedback.js`

**The way home is the mission.** The surface runs a chop (`world.chop`) that adds drag and
divides the speed ceiling by `1 + 0.24 × chop`. Three **tide races** per seed run shoreward
along the floor from the trench rim to the shelf. The swimmer's drag now works on its
velocity *through* the water, so a diver who kicks in a race goes faster than any stroke
can on its own. Races are zero above 4 m, and the chop fades out over the top 3 m, so
there is no band just under the surface that escapes both. The races are drawn as
scrolling chevron ribbons on the floor (the Descent's boost pads) with silt streaming
down them.

Measured with an autopilot carrying four chests home from the seaward end of a race,
starting at 0.8 air, six seeds: the surface took 14.9 s at the ebb and 16.4 s at the flood;
kicking down the race took 12.3 s (−17 %) and 12.0 s (−27 %), and ended about 0.23 of a
bar lower (0.15 against 0.38–0.44), with more blackouts. Streamlining down a race was
slower *and* cost more air than kicking it — time under water is what empties the bar —
so the in-game copy says "kick with it".

**The tide turns twice**, on thirds of `runTime`:

| | still water | the ebb | the flood |
| --- | --- | --- | --- |
| races | 0.25 | 1.0 | 1.45 |
| chop | 0.45 | 1.0 | 1.6 |
| cave air pockets | — | **yes** | — (they flood, whoever is inside) |
| chest value | ×1 | ×1 | ×1.35 |
| shark noise | +0 | +0.15 | +0.40 |

A pocket is reported to the swimmer as a *surface* (`world.surfaceAt`), so it floats,
gasps and breathes under the roof with no new physics. Breathing in one does not end a
trip, and it is not the shallows: sharks still come.

**Three more verbs.** Hold the kick to **streamline** (drag × 0.32, steering × 0.5). Pull
back to **flare** (+7.5 m/s² drag, steering × 1.7, costs breath). A chest taken above
7 m/s is a **clean sweep**: × 1.2 and +0.25 flow. Flow is now also fed by riding a race and
by fending a shark.

New stats (added, none renamed): `raceTime`, `pocketBreaths`, `sweeps`, `floodBanked`.

## Verification

- `npm test` — including new cases in `swim.test.js` (streamline, flare, currents, chop)
  and `mission-stats.test.js` (the fog invariant, the abyss, the tide's stages, races and
  pockets). The original 43 swim tests pass unchanged.
- Every patched program (13 materials × 3 tiers, shadowed and not) was resolved the way
  three r160's `WebGLProgram` does and validated as GLSL ES 3.00 with glslang.
- A headless rig (real three r160, stub DOM, no GPU) builds, runs and disposes the
  mission at every tier, and an autopilot plays full runs over both routes home.

Not verified: how it looks. Nothing here was rendered; it needs playing in a browser, and
the atlas does not exist until it is generated from the prompt.

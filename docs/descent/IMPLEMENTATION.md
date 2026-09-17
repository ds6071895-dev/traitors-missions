# The Descent — implementation and acceptance record

The mission ID remains `ski`. The redesign is playable through the existing mission menus and party lifecycle. This is an implementation build, not a claim that every acceptance item in the design plan has been met.

## Implemented

- Six sections per full run, selected from 24 named section templates in summit, glacier, forest and village order. Each full run has six geometric route decisions, main lines, technical cuts, freestyle lines, twelve rail splines including transfers, and village roof platforms.
- Course descriptors shared by scenery and contact systems. Shortcut savings are measured along sampled three-dimensional terrain paths. No guessed time-saving labels.
- Manual directional spins/flips/corks, held mute/tail grabs, half-turn switch landings, bounded alignment assistance, charged pop, lip grace and landing input buffering. Tricks and rings cannot add flight height.
- Straight, kinked and curved grinds with low ride-on entrances, an approach-steering grace period, self-centring neutral balance, charged pop exits, transfers and switch capture; indexed elevated surfaces, underside/edge handling, swept obstacle contacts and recovery with protection at the original crash progress.
- Boost pads down every technical cut: pairs of cyan speed pads (continuous push along the skis, capped by the skier's boost ceiling) and amber launch pads with lit posts, whose back half throws the skier into the air as a ramp-free lip. Chained pads escalate the feedback. Pads, and each launch's flight corridor, are kept clear of roofs, chalets, rails and ramps; Cat Track (`padSpacing: 0`) has none, and Terrain Park / Send It scale their density and strength.
- Every rock collides with the stone that is drawn. Summit granite, glacier seracs and region landmarks are resolved in the course descriptor at a fixed count, whatever the graphics quality. Each is walked outward until it is off the piste and clear of cuts, style lines, ramp landings, pads and launch flights, rails and buildings. Rock colliders are banded convex outlines built from the render geometry, so a skier meets a rock at body height and clears it only when above it. Small rocks use the same colliders and the same full-reach clearance.
- Prize, Trial, Freestyle and solo Practice. Trial uses elapsed time plus crash/reset penalties. Banked chains persist through crashes; repeated tricks diminish, progress gates prevent stationary farming, and shortcuts cannot pay from a late rejoin or repeated entry.
- Local rules-versioned records/ghosts with resolved conditions; exact retry retains those conditions and the existing party roster. Practice excludes competitive records, progression and pot earnings.
- 24 permanent mastery thresholds and 12 cosmetic rewards, favourites, three seeded daily modes, section choice/reset, Practice hints, results splits and mistake locations. Cosmetics do not modify physics.
- A locally shipped 16-material alpine atlas textures timber, stone, pitched chalet roofs, snow, ice, pine trees, equipment and metal rails. Material cells use independent repeating mipmaps to avoid atlas bleed. Irregular summit rocks, more rounded ice formations and denser tree/rock meshes retain the stylised silhouettes. Sparse entrance signs replace rectangular floor markers. Ski tracks, rail sparks, grind feedback, surface-dependent audio and a bounded chase camera support the ride. Shake, roll, speed effects and flashes can be toggled independently. Low/Medium/High scale scenery, effect capacity, shadows and resolution; static scenery is merged by material.
- Keyboard and simultaneous touch steering/pop/grabs. Party setup excludes Practice, synchronizes resolved conditions, and extends skier poses.

The new modules live in `js/ski/`: course, surfaces, tricks, scoring, progression, materials and presentation. Existing mission lifecycle and payout ownership remain in their original modules. Pre-existing unrelated workspace edits were preserved.

## Validation performed

- Full existing logic/network suite passes, including **58 mission-stat tests** (53 existing tests, superseded assertions updated, five additional regressions).
- Real `Skier` simulations over **100 fixed seeds**, 30 Hz controller input with internal physics substeps. The controller follows main lines and completes every descent. Tests also exercise 30/60/120 Hz trajectories, trick-independent flight, bounded assistance, switch landings, rail entry/exit, roof tops/undersides/edges, reward repetition, one-time progression and storage failure.
- These 100-run simulations use generated terrain/surfaces and clear main corridors; they do not populate scenery colliders. A separate 12-run matrix exercises cut/freestyle branches across six snow surfaces, with architectural solids. These are not exhaustive tests of every optional branch, landing, modifier or player input sequence.
- Rendered Chromium checks of four regions, four modes, Practice reset and actual results flow. Screenshots in this directory were inspected, including an actual course rail capture and sustained slide. Shader compilation errors are checked. The renderer was enabled for these checks.
- Real Chromium multi-touch tests cover simultaneous movement/pop/mute, tail grab, cancellation and teardown.
- Existing voice browser checks passed. The three-player game suite passes mission start, pose exchange, results and return to room for boat, shootout, dive and all three competitive ski modes.
- Twenty successive section-course rebuilds maintained stable renderer geometry and texture counts (`resources.json`). This checks GPU resource retention; it does not establish long-session JS heap stability or representative-device frame rates.

## Automated balance sample

Seed 42, fixed midday conditions, main-route gates counted separately from optional-route gates. Controller scripts are reproducible models, not human skill measurements. The competent case includes one forced crash and deliberately declines two caught gates to exercise approximately half the applicable main-route gates.

| Controller | Finish | Time | Gates | Crashes | Cuts | Prize |
|---|---:|---:|---:|---:|---:|---:|
| Novice | No, 93% progress | 148.2 s | 6/19 main | 0 | 0 | £2,833 |
| Competent | Yes, 9.6 s left | 156.4 s | 10/19 main | 1 | 0 | £11,730 |
| Expert, mixed routes | Yes | 137.6 s | 6, mixed | 0 | 3 | £30,709 |

Ordinary landing payout is capped at £800 before the condition multiplier, below 10% of the competent sample. The mission payout cap remains £88,000. Full payout sources are in `benchmarks.json`. This is calibration on one seed/condition, not evidence of universal balance.

## Remaining work for full design acceptance

- Human keyboard and touch playtests, particularly novice completion, manual trick timing, rail approaches and readability at speed. The novice benchmark still times out near the finish.
- Actual integrated-GPU laptop and phone/tablet measurements against 60/30 FPS targets; long-session heap profiling. Software-rendered Chromium cannot certify those targets.
- Broader modifier/seed balance, full branch and roof landing simulations, and more varied party input sequences.
- Art/content polish: the 24 sections have distinct authored placements, widths, warps and rail shapes but share procedural terrain construction. Landmark variety and more elaborate village architecture can be developed further.
- Building bodies and platform supports have swept collision hulls; decorative window trim and eaves do not have individual collision meshes.
- Tracks remain bounded local ribbons rather than whole-mountain permanent deformation.
- Ski simulation uses fixed 90 Hz steps; ski clocks and ghost timestamps use unclamped active wall time. Severe stalls charge elapsed time while bounding simulation catch-up; extensive background-tab competitive timing checks remain.

## Texture asset

Generated with the built-in image generation tool: `assets/descent/alpine-materials.png`. The exact prompt is preserved in `assets/descent/alpine-materials.prompt.txt`. It requests a 4×4 refined low-poly alpine material atlas: snow, ice, slate, snowy granite, timber, dark wood, shingles, plaster, pine, frosted pine, bark, masonry, steel, gunmetal, warm glass and jacket fabric. Runtime cell extraction is part of material loading; no external texture requests are needed. The generated image is 1254×1254, sampled into sixteen reusable 256×256 material maps.

Rules version is **5** (boost pads changed shortcut times); earlier rules' records remain separate history.

## Reproduce

Use the Three.js r160 browser asset already referenced in `index.html`, downloaded locally, and set `THREE_TEST_ASSET` to its absolute path. If Chromium is installed outside Playwright's default cache, set `PLAYWRIGHT_BROWSERS_PATH` too.

```sh
npm test
THREE_TEST_ASSET=/absolute/path/three.min.js node test/descent.test.js
THREE_TEST_ASSET=/absolute/path/three.min.js npm run test:browser
THREE_TEST_ASSET=/absolute/path/three.min.js node test/descent-browser.test.js
THREE_TEST_ASSET=/absolute/path/three.min.js node test/descent-touch.test.js
THREE_TEST_ASSET=/absolute/path/three.min.js node test/descent-benchmark.test.js
```

Supplying `THREE_TEST_ASSET` to `npm test` also includes the 100-seed simulator. Browser tests require local loopback socket access. Test outputs are written under `/tmp`; no external service or new backend is required by the redesign.

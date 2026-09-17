# Highland estate and full-night travel

The full night now runs welcome → outbound journey → mission → shared results → return journey → fire → verdict. Practice and mission parties still enter missions directly. The existing Descent changes are retained; its additions here are limited to presentation and preparation lifecycle hooks.

## Place and materials

`EstateLayout` is the authored source for the castle forecourt, gatehouse, road, bridge, three enclosed lakes, lantern path and fire terrace. Decoration is seeded; landmark positions and road geometry are fixed. Distance samples provide position, tangent and ground orientation to both geometry and the SUV. Terrain uses one adaptive grid to avoid overlapping road shoulders. The finale uses the same estate, translated and rotated so its existing ceremonial staging faces the loch.

`Estate` owns architecture and scenery; `EstateCar` owns the vehicle; `EstateMaterials` owns the persistent texture cache. Architecture, terrain, vegetation, vehicle and fire fuel use original raster maps in `assets/estate/`. Fourteen families include masonry, paving, slate, gravel, peat/grass, heather, rock, timber, bark, pine foliage, iron, paint, rubber and upholstery. Colour maps have companion luminance-derived bump/roughness maps. Water and translucent flames use procedural material effects. Skin retains the game's existing character materials.

The manifest records the generation prompts and source identifiers. `assets/estate/preview.html` repeats every selected colour map in a 3 × 3 grid for seam review. Assets total approximately 3.4 MB. Base colour and bump textures, including mipmaps, require approximately 53.3 MiB at high resolution; retaining the low-resolution variants adds approximately 9.3 MiB. This estimate excludes sky, water and UI allocations.

Textures return explicit loading/ready/error state and fall back to usable colours. Scene disposal releases materials and geometry but does not dispose cached shared textures. Repeated architecture is merged by material; woodland is instanced in spatial groups. Quality controls reduce vegetation, mountain detail, dynamic lantern lights and texture resolution without removing landmarks.

## Direction and ownership

The welcome starts immediately with contestants standing 2.9 metres from Claudia, facing her with walking and looking enabled. There is no opening castle camera sequence. The existing welcome/private role flow follows, with the estate car visible nearby. Boarding offers assigned passenger doors, appearance-preserving figures, a short approach and seat transition, a 30-second shared deadline, and an immediate accessibility action. Travel captions are hidden during driving and destination shots, and shown during boarding and the walk to the fire.

The road completes its forecourt turn before the low wall, runs straight through the gatehouse and causeway, and turns again beyond the parapets. Vehicle poses use the curve's continuous tangent with a dense arc-length lookup for smooth steering and even speed. The return stop and lantern path share an anchor on the road.

`Journey` owns one scene/camera and an AbortController. Outbound beats total 40 seconds; return beats total 46 seconds, excluding boarding, loading/readiness waits, existing dialogue and the final walk. Return travel crosses the same road in reverse, changes from dusk to night under cover, and opens the gates before the lantern path. The fire's dialogue and exposure checks remain blocked until everyone gathers or the 30-second gathering deadline expires.

The journey music has outbound and return arrangements, continues across visual transitions and ducks for speech. Procedural effects cover engine ambience, doors, tyres, bridge, gates and footsteps. Reduced motion is a local saved preference: stable travel shots, no bob or shake, and shared timings unchanged. A unanimous skip finishes the current beat and takes everyone through destination loading and handover.

`Screens.cover` provides awaitable, abortable fade/hold/reveal. Files may preload while a scene is visible; complete worlds are released and built sequentially because Sky and Water retain shared state. Required build failures offer Retry/Leave and never fabricate results.

## Session and mission interfaces

Travel snapshots expose journey ID, direction, destination, beat, elapsed time, readiness, boarding, gathering, cosmetic movement and skip votes. Only the host advances beats. Invalid or stale journey IDs and duplicate actions are ignored. Guest snapshots rebase elapsed duration onto the receiving clock. Same-phase state events reconcile missed beats. No role or task data is added to travel snapshots.

`Missions.prepare(id, opts)` constructs an owned, inactive handle. `activate(handle)` starts the existing gameplay/countdown path once. Disposing a prepared handle cannot record results. `launch` preserves direct callers by preparing and activating immediately. A completed mission can transfer ownership into return pickup presentation.

Each mission exposes terrain/path-derived cinematic anchors and an environment-only update. These updates animate scenery without gameplay simulation, score changes, enemies or input. Networking starts at activation. Task marking opens only in the playable mission and closes with results. Shared result reading and pot accounting retain their existing barriers.

## Verification

Commands:

```sh
npm test
npm run test:travel
npm run test:browser
npm run test:travel-browser
npm run test:estate-render
```

Set `THREE_TEST_ASSET` to a local copy of the game's pinned Three.js r160 build for offline browser runs and the Descent logic suite. Playwright Chromium must be installed. `FULL_TRAVEL=1 TRAVEL_MISSION=boat-race node test/travel-browser.test.js` exercises an unskipped night. Rendered review outputs go to `/tmp/estate-review` or `ESTATE_REVIEW_DIR` and include screenshots, WebM recordings and allocation/draw metrics.

Logic coverage includes host authority, boarding deadlines, unanimous skipping, readiness, stale journey IDs, private-state exclusion, clock rebasing, same-phase catch-up, partial rehearsals, bots, road continuity, lake/anchor relationships, and exactly-once prepared activation/result accounting. Browser cancellation coverage checks boarding, fades, delayed loading, handover and retry without fabricated results. The full-night browser suite runs three clients at different quality settings, one in portrait/reduced motion and with delayed destination readiness, through all four missions and the pouch ceremony.

The rendered suite keeps GPU drawing enabled and inspects estate views, all four prepared mission reveals, the actual held pouch, portrait layouts and repeated disposal. Chromium in this environment uses software rendering. Desktop 60 fps and representative-device mobile 30 fps remain device acceptance targets, not measured claims. Mission scene triangle counts are reported separately from the estate budget.

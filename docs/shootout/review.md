# Shootout woodland review

Open [the comparison gallery](review.html) for matching before/after views, all 23 target models and the bow, weather, and the four owl phases on a phone layout.

## Presentation

The Shootout-only forest profile adds smooth terrain shading, generated earth and moss detail, branching trees and roots, textured boughs, fern leaflets, grass, log end grain, individual stand planks, rope and fittings. Warm sunlight, canopy shade, animated dapple and weather particles keep the target lanes readable. The default forest helper remains unchanged for other missions.

The bow now has tapered flexing limbs, horn tips, a wrapped leather grip, braided string, a broadhead arrow and feather vanes, with gloved first-person hands. Local and remote bows use the same rig. Birds have distinct proportions and layered moving wings; mammals have species-specific ears, tails, legs and gait. The owl has facial plumage, articulated feathered wings and animated talons. Props have textured material detail. Confirmed hits produce pooled feather or shard bursts, surface impacts and bell resonance. The HUD uses parchment, moss and brass colours; portrait controls and boss cues no longer overlap. Reduced-motion settings suppress cosmetic camera and wind movement.

## Generated textures and ownership

[woodland-atlas.png](../../assets/shootout/woodland-atlas.png) was generated with the **built-in imagegen tool** on 17 September 2026; the [exact prompt](../../assets/shootout/woodland-atlas.prompt.txt) is saved alongside it. The delivered image is 1254 × 1254, with sixteen material cells. Runtime extraction creates isolated 256px tiles (128px on low quality), with mipmaps and no adjacent-cell bleeding. The material library reuses the estate UV/merge utilities and supplies colour fallbacks if the atlas fails to load.

ShootoutMaterials owns the bounded application-lifetime texture cache. Scene materials borrow maps, and Engine disposal skips those shared textures. Disposed materials cannot acquire a late-loading texture. Geometry and scene-owned rain textures are disposed with the mission. Decorative randomness uses a separate seed; original terrain positions, tree placement, walk heights and colliders are retained.

## Verification

Completed on Linux, Intel Core i3-1215U, Chromium 153.0.8010.12 with **SwiftShader software rendering**:

- `npm test`: existing logic/server suites and descent compatibility suite passed.
- `npm run test:browser`: audio/WebSocket and multiplayer browser suites passed, including Shootout party startup, pose exchange and shared results, plus the other missions.
- `npm run test:shootout-render`: passed terrain/collider/random-stream invariants; unchanged default forest buffers; partial and clean draws; nocking and remote rig; fixed arrow trajectory; misses, piercing and remote authority; confirmed rewards and dove penalties; all four owl weak points and closed/open damage; clear, rain, snow and low-light rendering; portrait touch HUD; reduced motion; asset failure and repeated disposal. No captured JavaScript or shader errors.
- `git diff --check`: clean.

The rendering checks use the real mission, but deliberately pause the engine and render known states. The matching composition views use seed 42 at 1100 × 740 and 390 × 844, both at full quality. Weather/phase checks use high quality on desktop and low quality on portrait. Desktop captures may show the normal click-to-aim overlay because the test does not lock the pointer. Model close-ups use a separate lit presentation stage.

| Captured scene | Draw calls | Triangles |
| --- | ---: | ---: |
| Desktop weather views | 135–136 | 563,971 |
| Low-quality portrait weather views | 101–102 | 448,242 |
| Five repeated low-quality mission entries | 129 geometries each | 52 textures each |

The repeated-entry figures include shared application resources and both texture quality caches already warmed. They remain stable across all five entries. Instancing, static model batching, simpler distant trees, reduced low-quality detail and bounded effects limit resource use. **Representative physical desktop 60 FPS and phone 30 FPS targets have not been measured or established.** SwiftShader captures establish visual correctness and resource counts only.

Raw measurements: [browser checks](checks/results.json), [before captures](before/metrics.json), [after captures](after/metrics.json).

## Reproduce

Install the repository dependencies and Playwright Chromium, then run:

```sh
npm test
npm run test:browser
npm run test:shootout-render
node scripts/shootout-stills.cjs
SHOOTOUT_BASELINE=1 SHOOTOUT_REVIEW_DIR=/tmp/shootout-before node scripts/shootout-stills.cjs
node scripts/shootout-models.cjs
```

`CHROMIUM_PATH` optionally selects an installed browser. `THREE_TEST_ASSET` optionally serves a local Three.js r160 script instead of the CDN. `SHOOTOUT_TEST_DIR` and `SHOOTOUT_REVIEW_DIR` select output directories. Baseline capture defaults to commit `d883d164f415eb48e8ed47717db2a2ea8f194338`; `SHOOTOUT_BASELINE_REF` overrides it. The atlas loads locally without an image service at runtime.

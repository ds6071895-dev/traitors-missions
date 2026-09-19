# Boat Race — cinematic Highlands

Open [the review gallery](review.html) for matched seed-42 desktop/portrait views, cockpit and landmark close-ups, weather captures, and a gameplay recording. The matching baseline was captured from commit `5d9ad9797265216000806a4f4ace29c8228ee6e8` before implementation. Both galleries use the same viewport, seed, water clock and camera compositions; the race shot exercises the revised chase camera. The seed’s default conditions are first light and storm sea. No records or save formats changed.

## Implementation

- `js/boat/materials.js`: locally bundled atlas, independent repeating cells, sRGB colour textures and linear foam/spray masks, immediate material fallback, bounded 16-cell × 2-tier texture cache, and disposal guards for delayed loads. World-space rock mapping avoids stretched seams. Shared textures survive individual scene disposal.
- `js/boat/models.js`: original hull dimensions and cockpit, smoothly shaded enamel shell, teak decking, upholstered seats, rubber sheer trim, metal fittings, instruments, framed glass, steering wheel and engine animation. Static fittings are merged by material. Competitors retain coat/accent colours and names, with simpler detail; the ghost uses a shared translucent material. The exhaust cone is replaced by small transom glows.
- `js/boat/scenery.js`: opt-in cliff materials, spatially grouped instanced branching pines, coastal plants, a seeded ruined watchtower, bay lighthouse and timber landings outside the channel. Decoration uses its own RNG. Marine gate brackets, ropes, bolts, pontoons and painted safety markings retain the original openings. Cyan safe gates and double-marked gold risk gates remain distinct in darkness.
- `js/boat/feedback.js`: bounded persistent stern turbulence, broken foam and spray masks, restrained rain, and six owned audio layers. Gate/perfect/risk/surf/landing cues have distinct note patterns. Sustained sounds stay quiet; voice tests run alongside them.
- Water’s profile changes fragment lighting and quality-dependent tessellation only. The original displacement GLSL is fingerprinted, and CPU wave samples are archived. Shore foam uses the same inverse Gerstner calculation; wake edges also sample the surface. The default profile and palette are reset on departure.
- Chase framing gives portrait screens more room, anticipates turns and reduces horizon roll, camera shake and FOV swings. Opening compositions show the boat; finish framing eases to one side. Game and OS reduced-motion preferences suppress cosmetic shake, roll, FOV pulses, flashes, burst rings, rain and spark rendering. Hit-stop and time-scale behaviour are unchanged.
- `css/boat.css`: Boat Race-only slate panels, ivory text, brass accents and cyan/gold cues, preserving HUD IDs, tutorial anchors and touch targets.

## Artwork

[Source atlas](../../assets/boat/highland-atlas.png) was generated with the built-in imagegen tool. [Exact prompt and provenance](../../assets/boat/provenance.json) are retained. No external model service, engine migration, post-processing requirement or runtime generation service was added. Lighting gradients are small scene-owned procedural textures.

## Validation and reproducibility

```sh
npm test
npm run test:boat-render
npm run test:browser
```

If the browser or CDN is unavailable, set `CHROMIUM_PATH` to an installed Chromium executable and `THREE_TEST_ASSET` to a local copy of the app’s pinned Three.js r160 browser build. The browser suites require a loopback test server.

`test:boat-render` compares 600 fixed-input physics steps, wave heights/normals, path samples, channel widths, colliders and safe/risk gate layouts against the pre-change fixture. It also checks the untouched displacement shader, gameplay RNG continuation, shared-builder defaults, payouts and clock changes in Prize Run and Time Trial, five representative modifiers, tricks, starts/restarts/pauses/finishes/failures, ghost interpolation, five time/weather palettes, boost/wakes, keyboard and simultaneous touch steering/boost, both motion preferences, three boat models and colour identity, late-load disposal, missing assets, repeat-entry resources and water-profile cleanup. Browser errors and shader failures fail the suite.

The existing multiplayer browser suite verifies actual three-player pose exchange and shared results through Boat Race and transitions to the other missions. The voice browser suite now keeps Boat Race’s sustained audio playing during real microphone capture, server relay, playback, mute, reconnect and rejoin checks. Its synthetic microphone replaces hardware, not the voice transport.

Gallery scripts:

```sh
BOAT_REVIEW_DIR=docs/boat/after node scripts/boat-stills.cjs
node scripts/boat-showcase.cjs
```

The showcase’s labelled surf, airborne, impact, finish and failure stills stage existing presentation states for visual review. The video advances the actual boat physics with fixed input steps and course-following steering; encoding playback at 30 fps is not a measured render rate.

## Measurements and limits

See [rendered-suite measurements](checks/results.json), [baseline resources](before/metrics.json), [updated resources](after/metrics.json) and [showcase measurements](showcase/metrics.json). All captures use Chromium 153 with SwiftShader on a Linux host reporting an Intel Core i3-1215U. They establish rendered correctness and resource budgets, not integrated-GPU performance.

Low quality uses 128-pixel material cells, fewer pines and particles, simpler player fittings, reduced cosmetic normal detail and a smaller near-water grid. High quality uses 256-pixel cells and denser detail. Repeated entries are checked for exact stable geometry and texture counts after cache warm-up, including both quality tiers. No physical phone or accelerated laptop GPU was available: sustained 60 fps laptop / 30 fps phone targets remain unverified and require device testing.

Measured five-palette race views:

| Quality / viewport | Draw calls | Triangles |
| --- | ---: | ---: |
| High · desktop | 224–225 | 579,432–579,432 |
| Low · portrait | 191–192 | 285,796–285,844 |

Five warmed repeat entries each reported **138 geometries / 56 textures**. These counts include the renderer’s retained resources and the warmed shared material cache, not just boat geometry. [Validation summary](validation.json).

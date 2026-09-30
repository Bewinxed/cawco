# Tabs, scroll and tab-switch: before / after

Both builds were served from this workspace against the live hub: the unmodified tree (59ad4e73, `:3101`) and the fixed tree (`:3102`), each through the real `serve.js` under `systemd-socket-activate`. Tool: the chrome-devtools MCP's headless Chromium at 1512×900 with no throttling. Each build was measured with only its own page open. The two ports are the same site (the port isn't part of the site), so with both pages open Chrome ran them in one renderer and each trace carried the other page's work. The harness is `.perf/bench.js`, loaded into the page; the trace analysers are `analyze.mjs`, `task.mjs`, `incl.mjs`, `paints.mjs` and `busy.mjs`. Raw traces are in `.perf/traces/`.

Tabs: 4 = a0ddaa1f, 6b1e124b, 23f6129d, 515e9878 (active, working). 8 = those plus e42a44e9, 5ff399e7, 1ac765b8, d6b39316.

**Scroll target.** Midway through the runs, 515e9878 and a0ddaa1f were compacted: their transcripts now open with "Compacted conversation summary" and are 2–4k px tall, on both builds. The scroll rows therefore scroll 6b1e124b (13,844px, the longest of the owner's tabs that sits in both tab sets) on both builds. Idle keeps 515e9878 active and working.

## Before / after

| | 4 tabs before | 4 tabs after | 8 tabs before | 8 tabs after |
|---|---|---|---|---|
| **Scroll: dropped frames** (6b1e124b, 13,844px, 2 passes) | 6.8% (9.4 / 4.1 per pass) | **0.6%** (1.2 / 0) | 10.9% (13.7 / 7.9) | **0.3%** (0.6 / 0) |
| Scroll: longest animation frame | 701ms | 195ms | 528ms | 316ms |
| Scroll: `Layerize` per frame | 7.32ms × 485 | 0.66ms × 504 | 7.52ms × 488 | 0.79ms × 483 |
| **Idle 5s, 515e9878 working: dropped** | 3.7% (10.3% on an earlier run) | **0%** | 0% | **0.3%** (one 33ms frame) |
| Idle: main thread busy, profiler start excluded | 73.9% | **5.1%** | 67.3% | **15.3%** (the working session's streamed text, see below) |
| Idle: `Layerize` per frame | 10.86ms × 297 | **0.00ms** × 310 | 9.14ms × 308 | **0.17ms** × 308 |
| Idle: paints | 2,127 (one per frame) | **0** | 2,175 | 29 document paints in 308 frames |
| Elements with `will-change` | 255 | 0 | 266 | 1 (a morph in flight) |
| **Switch INP** (real CDP click) | 64, 64, 56, 64 | 56, 104, 48, 56; traced repeat 59, 58 | 400 (first visit), 136, 152, 112 | 96, 72, 88, 128; traced repeat 57 |
| Switch: click task | 27–31ms (earlier benchmark) | 20–25ms, 7–8 style recalcs | 33–39ms (earlier benchmark) | 24–33ms |
| Switch into 5ff399e7: INP | 120 | 192; traced repeat 84 (30ms processing, 53ms presentation) | | |
| **Switch CLS** (no recent input) | 0 | 0 | 0.0087, 0.0175 (the delegate tray landing after the switch) | **0** |
| **Preview-switch shift** (into 5ff399e7) | Not measurable: the preview was closed during the before runs (hub `/preview` 404). The earlier benchmark: 0.127 + 0.128 + … over a 300ms `flex-grow` resize | | | 0.1287 (input-flagged, one frame): the group composer is 720px → 656px wide in the switch's first frame, because it spans the transcript's share. No `flex-grow` runs, the transcript and preview don't move, and there's 0px after the glide |
| **Glide-end movement** (max px moved by `.hosted`, any visible row, or the composer, from glide end to +300ms) | **35, 0, 0, 35** | **0, 0, 0, 0** (two runs, plus 0, 0 traced) | **0, 0, 0, 35**; into 5ff399e7: **35** | **0, 0, 0, 0**; into 5ff399e7: **0** |

"Dropped" counts whole vsync intervals missed per rAF interval (`round(dt/16.667) − 1`). My first runs used `ceil(dt/16.7) − 1`, which counts a 17ms frame as a drop. Every number in this table uses the corrected counter. Earlier runs on the then-long 515e9878 (unmodified build, old counter) gave 50.2% and 58.1%. The fixed build on the same transcript, with the corrected counter, gave 0.9% and 0.6% (5.3% on a first pass through never-rendered rows before the Content change below; 0.3% after it).

The glide-end rows exercise the tray case: the padding under the transcript differs between those tabs (137 ↔ 172px) on both builds. After the fix, in the unequal-tray switches the padding changes in the switch's first frame and nothing moves from then on.

## The shift after the glide

**Mechanism.** The composer held its published height until the switch glide landed, then published the arriving conversation's height:

1. `Composer.svelte:1212-1218` (old): `if (!holding) height = next`. `holdUntil(landing.done)` at `:775` set `holding` on every switch.
2. `landing.done` resolves from `PaneLeaf.svelte:304`, `glide.finished.then(done, done)`: at glide end.
3. `height` → `PaneLeaf.svelte:63` `groupComposerHeights` → `SessionPane.svelte:844-850` `clearance` → `:1028` `--composer-clearance` → `Transcript.svelte:2676` `.tr { padding-block-end }`.
4. The two tabs' delegate trays differ by one chip row, 35px (`.lift` 35 ↔ 0). The transcript's foot padding changed 172 ↔ 137px at glide end:
   - Padding shrinking: `scrollHeight` dropped 35px, the browser clamped `scrollTop`, and every row moved 35px down in the glide's last frame (−1 to −7ms of `finished`).
   - Padding growing: the tail sat 35px behind the composer until the pin's rAF (`Transcript.svelte:1733` box observer → `followBottom`) scrolled it, and every row moved 35px up 16–17ms after glide end.

Measured on the unmodified build with real clicks: 6b1e124b → 23f6129d, padding 172 → 137 at rel 0ms, first row y −139.9 → −104.9. 23f6129d (second visit): padding 137 → 172 at rel 0ms, rows −35px at +17ms.

What it wasn't: `.hosted` held y=60/h=840 from the first frame to +400ms. `scrollTop` didn't change at glide end apart from these clamps and pins. There was no `content-visibility` or `will-change` cleanup movement.

**Fix.**
- The composer publishes its height as soon as it's measured.
- The leaving tray fades out of the flow, anchored where it stood (`trayLeave`), so the row's height is the arriving tray's from the switch on.
- The transcript's box observer pins in its own callback, which runs after layout and before paint, instead of a frame later.

The arriving pane's first glide frame already has its final padding and scroll. Field hold and draft flight are unchanged.

## What changed, per item

1. **a** The Stop ring is deleted: its `class:working` hook, `::before`, `@property --ring-a` and `ring-turn`. **b** The thinking shimmer is the word again in `--ink-strong`, masked to the old gradient's band (35/50/65% of 3× width). The band slides by `translateX`, and the word inside it counter-slides by the same distance on the same 1.5s ease-in-out, so the letters stay still. The SMIL morph is a circle and an infinity, each its own `<svg>`, cross-fading with a slight scale on the old 6s ease-in-out rhythm. With the indicator on screen: 0 paints, `Layerize` 0ms (`traces/after-thinking-idle`). **c** `patches/torph@0.1.0.patch`: `will-change` is set under `[torph-morphing]`, which `createTextGroup` sets when a morph starts and a timer of the morph's own duration clears (checked: root `width, height`, spans `opacity, transform` while set; `auto` otherwise). **d** The board under a session uses `content-visibility: hidden`. It was added as `visibility: hidden` in 77dbbf2f to keep layout, measurements and scroll. Verified live: board scrolled to 251px, a session opened (the board computes `content-visibility: hidden`), board shown again: `scrollTop` 251, and the same row node at the same y (179px). The groups keep `visibility: hidden`. FleetBoard's `rows` and `spend` return their last value and read no `statsOf` while `active` is false.
2. Tool and subagent bodies render through `CollapsibleLazy`. Beyond the brief, for the scroll target: a tool row mounts its `Collapsible.Content` only from its first opening on (92 tool rows, 9 Contents mounted). A Content mounted by the opening grows from nothing (`entering`), so the first open plays the same fold (captured mid-fold: 424 of 477px at 83ms). `morph` takes its first size from the first ResizeObserver delivery.
3. `carrySlides` returns at once when the running-slide count is 0; `startSlide` counts every slide animation. The dock's capture listener reads nothing per event; the boxes that scrolled are read in one task after the frame. The move can't read `tail`: the old slot is already detached (the file's own comment), and the `scrollTop` getter forces layout just as `scrollHeight` does.
4. A hidden pane builds its transcript on its turn at the scheduler's slow tier (`rebuildScheduler.once`), or at once when shown.
5. Motion tokens are read once in one `getComputedStyle` pass and re-read after the root's class changes (the theme); the glide reads `ease("--ease-drawer")`. The suggestion candidates build on first read. They feed the suggestion chips, not the `/` menu (which uses `commands`), so they build when the chips ask the hub or draw an answer. The slots map holds elements only; `shownPanes` holds the shown flags and is written only on change, so a switch wakes the two panes whose flag changed.
6. `desktopPreview` no longer depends on `visible`. A split resized while its pane is off screen takes its size without a transition on the first frame it's shown (`sizedAway`).

## Proposals and findings (not changed)

- **The delegate tray's first mount after a reload** admits a delegate that isn't `entered` yet only after `SETTLE` (1.5s, per-mount `known` map, `DelegateTray.svelte:170-180`). The first visit to such a tab after a reload grows the tray about 1.3s after the switch and moves the pinned tail 35px. Proposal: admit delegates that existed at page load at the tray's mount. This changes when chips appear relative to a card on screen, so it's yours to decide.
- **WebSocket `onmessage`** runs 218–351ms tasks (wasm, likely highlighting) that drop frames whenever they land.
- **`Transcript.svelte` `onscroll`** forces 116–166ms of style per scroll run (it reads `scrollTop`, `scrollHeight` and rects).
- **INP presentation** is 38–53ms of the 56–128ms in headless software raster: the arriving pane is rasterized for the glide's first frame. Processing is 19–30ms.

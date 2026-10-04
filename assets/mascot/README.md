# Caw

Caw is CawCo's mascot: a small round fluffy crow, "earnest, a bit dopey, trying very hard". He is
already designed. `~/cawco-design-kit/05-mascot-pose-sheet.png` is his source art, and his masters
live in `~/cawco-design-kit/caw/`. Image work only cleans, upscales or adds poses in that exact
design; it never redraws him.

**Changes to Caw happen in the `.riv` files, never by redrawing him in code** (Swift, Svelte or
anything else). Apps load the file for the status they show and set its `Caw` view model, and
that is all they do with him.

## Contract

- Files: `assets/mascot/caw/<status>.riv`, one per status: `ready`, `working`, `needs-you`,
  `idle`, `done`, `trying`, `loading`, `reconnecting`, `sleeping`. Each holds only its own
  status, so an app loads and instances a few MB for what is on screen instead of everything at
  once.
- A status **waits** or **rests** (owner: "it shouldn't animate if there's nothing going on").
  A wait is something going on, so a waiting status plays its loops. A rest is one drawing,
  held, with no loop and no beats: `ready` and `sleeping`, named in
  `assets/mascot/loops/rests.json`. A runtime that draws only on change draws a rest once.
- `sleeping` is what Caw shows when nothing is going on: no session working anywhere on the
  fleet and nothing needing the operator (owner: "it should have a 'sleeping' look too"). The
  drawing is the nod in the owner's idle-nod-off take, eyes closed and head dropped
  (`assets/mascot/loops/idle-nod-off/body-11.svg`); anything that needs the sleeping Caw as a
  picture renders that SVG (its 512 × 512 box is the stills' box). With sessions
  merely working he is awake and still: `ready` (ready-attention's first drawing).
- He moves only while something needs the operator (owner: "it shouldn't animate if there's
  nothing the USER has to pay attention to"): `needs-you`, for a parked ask, a permission or a
  failure. `loading` and `reconnecting` keep their loops too: they are the page saying it
  cannot show its content yet.
- His **still** is the drawing every clip starts or lands on: a rest's drawing, or the first
  drawing of a waiting status's first loop.
- Artboard: `Caw`, 592 × 592, in every file. Caw's stills sit in the 512 × 512 box at (43, 40);
  the room around it is for his acting. Apps size that box, not the artboard, to the space they
  give Caw, and let the rest draw past it unclipped (`CawView` does).
- State machine: `CawStates`, the artboard's default, its transitions bound to the view model below
- View model `Caw` (data binding, the owner's choice: "use latest best practice on rive"):

| Property | Type | Who sets it | Meaning |
| --- | --- | --- | --- |
| `reducedMotion` | boolean | app | the system setting; on, the file holds his still |
| `dark` | boolean | app | the colour scheme; on, the cream rim |
| `from` | enum `CawFrom` | app, once | starts him. `unset` (the default): nothing is drawn. `none`: a first appearance, his enter plays. A status's file name (`loading`, `ready`, …): he arrives from that status, by that clip |
| `leave` | boolean | app | on: the clip or loop on screen plays to its end, then he holds his still and `still` fires (a rest is on its still already, so it fires at once). Off again: he carries on |
| `exit` | boolean | app | on, once he is on his still: his exit plays to an empty page and `gone` fires |
| `entered` | trigger | file | his coming in (enter or arrival) has ended and he is on his still |
| `still` | trigger | file | he is on his still because `leave` asked |
| `gone` | trigger | file | his exit has ended; nothing is drawn |

Wherever Caw appears, leaves or changes status he does it through a clip, never a fade (owner:
"use adapter for all"); the one exception is Reduce Motion, where the apps fade him over 200 ms
(`motion.dur-fade` on `motion.ease-out`) and the files hold his still. The clips are shot with
the same adapter as the loops and live in `assets/mascot/clips/`:

- `<status>-enter`: an empty page, then he lands on the status's still.
- `<status>-exit`: from his still, he leaves an empty page.
- `<from>-to-<status>`: from one status's still to another's.

Each status file carries its enter, its exit and its arrivals from the other statuses. Shot today
(`clips/takes.json`): the enters, exits and every change among `loading`, `ready` and
`reconnecting`, and `ready-to-sleeping`, `sleeping-to-ready`, `ready-to-needs-you` and
`needs-you-to-ready`. Where a way has no clip of its own it goes through `ready` in two clips,
so asleep he comes in awake and nods off, and woken by a wait he wakes first; a status with no
clip that way either (the four the apps do not show yet) is simply there.

How the apps drive it (one code path each: the dashboard's `Caw.svelte`, Apple's `CawView`):

- **Appearing.** Load the status's file, set `from` to `none`. `entered` ends his entrance;
  DESIGN.md's Real Wait Rule holds him until then.
- **Changing status.** Set `leave` on the shown file. When `still` fires, start the new status's
  file with `from` set to the old status: its arrival opens on the very drawing the old file is
  holding, so the old file goes once the new one has drawn and no frame is empty. At most two
  files are alive. The change starts when he is back on his still, as an exit-time wait, never a
  cut or a blend. Every loop ends by holding its first drawing for 6 to 28 frames, and
  the wait ends as that hold begins: at most 4.0 to 4.9 s into a loop, depending on the loop.
- **Leaving.** Set `leave` and `exit`. What replaces him lands at once under its own 200 ms
  cross-fade and is never delayed by him; he plays his exit over it and is removed on `gone`.

Apps use Rive's current runtimes, which drive state machines only through data binding
(rive.app/docs/runtimes/apple/migrating-from-legacy: "The new runtime does not expose equivalent
input APIs, and migration should move to data binding properties"); the files speak back through
view-model triggers rather than Rive events for the same reason (rive-ios 6.28's current API has
no events). On Apple: one shared `Worker`, `File(source: .data(…), worker:)` from bytes read once
per status, `Rive(file:…)`, the `Caw` view model instance, and `RiveUIView`. On the web:
`@rive-app/canvas` with `autoBind` and the file's bytes as `buffer`, its WASM served by the app
through `RuntimeLoader.setWasmUrl` (rive.app/docs/runtimes/web/preloading-wasm: "The `rive.wasm`
file version must match the `@rive-app` package version"). A place that shows him for a wait
follows DESIGN.md's Real Wait Rule: nothing for `motion.dur-wait-grace`, then Caw, kept until his
enter has played (web: SessionSurface's detail area; Apple: `CawWaiting`). The dashboard
prefetches Rive's WASM and `loading.riv` from its page head, and serves the `.riv` files
Brotli-compressed as `application/octet-stream`.

The dashboard's tab icon is Caw too (`apps/dashboard/src/lib/cawco/tab-icon/`, DESIGN.md's Tab
icon): his head, through a fixed box per state (`apps/dashboard/scripts/tab-icon-shots.ts`
names each state's loop, frames and box). Its pictures are drawn ahead by `bun run tab-icon` in
apps/dashboard, which applies a loop's own animation at each frame through the runtime's
low-level API, as `prove-viewmodel.mjs` renders a loop, and writes them to
`apps/dashboard/src/lib/assets/brand/`: a still for the two states that show him
(`tab-icon-needs-you.png` from `needs-you.riv` and `tab-icon-sleeping.png` from `sleeping.riv`;
while sessions work the icon is the plain app icon, not Caw) and `tab-icon-needs-you-wave.png`, frames 54 to 85 of `loop_needs-you-hey` side by side, seen
through a box that holds his head and his right wing so the wing-beat reads as a wave. The
icon moves in one state, while something needs the operator, by stepping through that strip; the
page itself loads no Rive and draws nothing for its icon (drawn live, his head cost 4% of the
main thread). Run `bun run tab-icon` again after `node build.mjs` changes either file,
and move the boxes in `tab-icon-shots.ts` if a retraced loop moves his head.

The state machine has no inputs. `Caw` has one instance, `Default` (every boolean off, `from`
unset), and the artboard points at `Caw`, so a runtime that auto-binds gets that instance.

## Building and proving them

The files are generated; they are never edited by hand and there is no Rive editor project behind
them (the editor cannot import `.riv` files). From `assets/mascot/scripts` (`bun install` once):

- `uv run trace.py [loop …]` traces the takes listed in `assets/mascot/loops/takes.json` (each
  status's loops, with their take and still) into `assets/mascot/loops/<loop>/` (see Pipeline).
  It needs `ffmpeg` and `curl`; uv installs its Python dependencies from the script's own header.
- `uv run trace_clip.py <clip> <take>` traces one transition clip into
  `assets/mascot/clips/<clip>/` with the same tracer, registered onto the stills it joins. It
  trims the take to the move itself (an exit opens on his first move, the holds at either end
  become one two-frame drawing), replaces a landing or a change's two ends by the stills'
  own drawings, and gates the result: a landing inked as its still on 98% of their pixels or
  more, a start within 4 px (outline p99) of its still, empty ends empty, on twos, no white
  marks, no halo, every eye intact. A clip that passes is listed in `clips/takes.json`, which is
  what `scene.mjs` builds from; one that fails is not.
- `node build.mjs` writes `caw/<status>.riv` from `scene.mjs` and the traced drawings in
  `assets/mascot/loops/`, and the same bytes to each app's copies:
  `apps/apple/Packages/CawCoKit/Sources/CawCoMascot/Resources/caw/`, which `CawView` loads, and
  `apps/dashboard/src/lib/assets/caw/`, which the dashboard's `Caw.svelte` loads. Each app keeps
  its own copy because a deploy rebuilds a service only when its own directories change
  (`changedServices` in `packages/agent/src/update.ts`). It removes any other `.riv` in those
  folders. rive-mcp-server's exported `buildScene` and
  `writeRiv` write each scene; rive-mcp-server has no view-model authoring, so `build.mjs`
  inserts those objects into its object list before writing, in the shapes Rive's own exports use
  (rive-runtime's importers in `src/file.cpp`): the `Caw` view model with its default instance
  after the Backboard, `viewModelId` and `defaultStateMachineId` on the artboard, and on every
  transition a view-model condition whose data bind reads `Caw`'s property (a boolean, or the
  `CawFrom` enum), and after a state or transition that fires, a `StateMachineFireTrigger` on
  `Caw`'s trigger. It fails if any state-machine input is left.
- `node prove-viewmodel.mjs` runs every file on Rive's official runtime
  (@rive-app/canvas-advanced, WASM, in headless Chromium). It renders every drawing of every loop,
  light and dark, by applying that loop's own animations directly, then drives the state machine
  only through the `Caw` view model:
  - every `dark` × `reducedMotion` step must render exactly a drawing of one of the file's loops
    in the scheme `dark` selects, and the first loop's first drawing (its still) under
    `reducedMotion`;
  - watched over five loop lengths, every play must show all its loop's drawings, a loop never
    follows itself, and nothing moves under `reducedMotion`;
  - every drawing stays on screen two frames or more (on twos), read back from the file;
  - load plus instancing (parse, artboard, state machine, bind, first frame) must take 100 ms or
    less, the median of five steady runs;
  - a resting file (`ready`, `sleeping`) must show its one drawing, in the scheme `dark`
    selects, and nothing else, with motion on or reduced;
  - nothing is drawn before `from` is set;
  - for a first appearance and for every status he can arrive from by a clip, on a fresh state
    machine: the way in shows its clips' drawings in order and ends on his still with `entered`,
    after as long as the clips last; `leave` brings his still and `still`; `exit` shows the
    exit's drawings in order and ends on an empty page with `gone`;
  - every arrival's first picture is, pixel for pixel, the still of the file he arrives from.

  The runtime's clocks and entropy are pinned so the random turns repeat across two runs. It
  prints one line per file, the totals (`loops animate: 7/7`, `stills rest: 2/2`, `reducedMotion holds still: 9/9`,
  `ways in and out`, `handovers on one picture`, `files proven: 9/9`) and, on success, `Caw view model drives the state machine in every status
  file`.

## What the files hold today

Caw is vector. A waiting status is a few loops that take turns: the takes the owner picked,
traced into flat-ink shapes and held on twos (12 drawings a second, longer holds where the take
holds). Each loop starts and ends on its own first drawing. A resting status is one drawing. The
clips are traced and held the same way. Every loop is one Solo group switched by
its keys, one group of ink shapes per drawing; a drawing the take comes back to is the same group,
reused rather than traced again.

- **Variant** layer: `hidden` (nothing drawn) until `from` is set, then the way in: a chain of
  clip states, or none. After it, a waiting status plays its first loop, and at the end of each
  loop one of the others (the loop states are flagged Random), so the same loop never plays
  twice in a row; a resting status sits on `rest`. `leave` takes a loop at its end, or a rest
  at once, to `still`, which fires `still`; `exit` takes `still` through the exit's clips to
  `gone`, which fires `gone`.
- **Scheme** layer: `dark` fades in the thin cream rim the owner picked (Ivory #F4F0E6, the kit's
  dark-rim-cream recipe: 5.31 px at the stills' scale) around every drawing over 200 ms. The rim
  is the silhouette's own stroke, drawn under its fill, so it costs no extra shapes. Light and
  dark share every drawing, so switching mid-loop never jumps. The kit has no light-mode line:
  light Caw has none, as in the stills.
- **Motion** layer: `full` lets the Variant layer play; `reduced` holds his still.
- The artboard is 592 square with Caw on the stills' scale and ground line, 43 px right and
  40 px down: the acting leaves the stills' 512 box, and every drawing fits whole.

## Pipeline

1. **Shoot.** Each loop is a Backlot take shot with alvdansen's H3 keyframe-animation sequence
   adapter (huggingface.co/alvdansen/h3-keyframe-animation; `h3_seq_step12000` at 1.0, both
   references the status's still so the loop returns to its pose, 124 frames at 24 fps), with the
   caption in the adapter's sequence dialect. The chosen takes are listed in `loops/takes.json`;
   Backlot film `UhDXc9y9Goj-yn2sUU9A5`.
2. **Trace.** `trace.py` reads each take's frames and holds them on twos: each frame pair shows
   its first frame's drawing, and pairs showing the same drawing are one longer hold. It cuts Caw
   from the paper, snapping every pixel to his inks as measured across the take's drawings (black,
   vermilion, eye white, yellow). Thin fringes go, closed eyes' lid lines stay, and gaps in his
   silhouette (between a raised wing and his beak) are told from eye whites from both ends of the
   take: forward from the opening still and backward from the closing one, evidence over guesses,
   and where neither end has evidence, by shape (a pupil always bites into an eye white). It
   registers drawing 00 onto the status's still and traces each ink with vtracer (spline, holes
   kept) into `body-NN.svg`, with `timing.json`. `trace.py --halo` reports yellow traced where
   the take has none, and `trace.py --eyes` reports any eye white a drawing on disk shows as
   see-through (a hole in dark); it ends "eyes: N/22 loops intact" and fails if any loop has one.
3. **Build.** `scene.mjs` imports the SVGs with rive-mcp-server's `importSvg`, one shape per ink
   per drawing, then `build.mjs` writes the files, and `prove-viewmodel.mjs` proves them.

Static art (onboarding, app icon) comes from `generate_image` with the pose sheet as reference.
Backgrounds are removed with BiRefNet
(`uvx --from "rembg[cli,cpu]" rembg i -m birefnet-general in.png out.png`). `assets/mascot/stills/`
holds each status's light and dark still. They are `trace.py`'s registration targets (drawing 00
of each loop is placed onto its status's light still: Caw's body, the largest shape, so a
separate piece such as loading's feather can sit a few px off) and nothing ships them: the apps
draw Caw only from the `.riv` files.

# Caw

Caw is CawCo's mascot: a small round fluffy crow, "earnest, a bit dopey, trying very hard". He is
already designed. `~/cawco-design-kit/05-mascot-pose-sheet.png` is his source art, and his masters
live in `~/cawco-design-kit/caw/`. Image work only cleans, upscales or adds poses in that exact
design; it never redraws him.

**Changes to Caw happen in the `.riv`, never by redrawing him in code** (Swift, Svelte or
anything else). Apps load `caw.riv` and set its `Caw` view model, and that is all they do with
him.

## Contract

- File: `assets/mascot/caw.riv`
- Artboard: `Caw`, 592 × 592
- State machine: `CawStates`, its transitions bound to the view model below
- View model `Caw` (data binding, the owner's choice: "use latest best practice on rive"):

| Property | Type | Values |
| --- | --- | --- |
| `status` | enum | ready, working, needs_you, idle, done, trying, loading, reconnecting |
| `reducedMotion` | boolean | bound to the system setting |
| `dark` | boolean | bound to the colour scheme |

Apps use Rive's current runtimes, which drive state machines only through data binding
(rive.app/docs/runtimes/apple/migrating-from-legacy: "The new runtime does not expose equivalent
input APIs, and migration should move to data binding properties"). On Apple: one shared
`Worker`, `File(source:worker:)`, `Rive(file:…)`, the `Caw` view model instance, and
`RiveUIViewRepresentable`.

The state machine has no inputs. `Caw` has one instance, `Default` (ready, both booleans off), and
the artboard points at `Caw`, so a runtime that auto-binds gets that instance.

## Building and proving it

`caw.riv` is generated; it is never edited by hand and there is no Rive editor project behind it
(the editor cannot import `.riv` files). From `assets/mascot/scripts` (`bun install` once):

- `uv run trace.py [state …]` traces the takes listed in `assets/mascot/loops/takes.json` into
  `assets/mascot/loops/<state>/` (see Pipeline). It needs `ffmpeg` and `curl`; uv installs its
  Python dependencies from the script's own header.
- `node build.mjs` writes `caw.riv` from `scene.mjs` and the traced drawings in
  `assets/mascot/loops/`, and the same bytes to the Apple package's copy
  (`apps/apple/Packages/CawCoKit/Sources/CawCoMascot/Resources/caw.riv`), which `CawView` loads.
  rive-mcp-server's exported `buildScene` and `writeRiv` write the scene; rive-mcp-server has no
  view-model authoring, so `build.mjs` inserts those objects into its object list before writing,
  in the shapes Rive's own exports use (rive-runtime `tests/unit_tests/assets/custom_property_enum.riv`,
  importers in `src/file.cpp`): the `status` enum and the `Caw` view model with its default
  instance after the Backboard, `viewModelId` and `defaultStateMachineId` on the artboard, and on every transition a
  view-model condition whose data bind reads `Caw`'s property. It fails if any state-machine
  input is left.
- `node prove-viewmodel.mjs` runs the file on Rive's official runtime (@rive-app/canvas-advanced,
  WASM, in headless Chromium). It renders every drawing of every loop, light and dark, by
  applying that loop's own animations directly, then drives the state machine only through the
  `Caw` view model:
  - every status × `dark` × `reducedMotion`, plus repeated loading and reconnecting entries, must
    each render exactly a drawing of the loop the status selects, in the scheme `dark` selects,
    and the loop's first drawing (its still) under `reducedMotion`;
  - each status watched over time must show all its loop's drawings and repeat after one loop
    length (`loops animate: 8/8`), and must not move at all under `reducedMotion`
    (`reducedMotion holds still: 8/8`).

  The runtime's clocks and entropy are pinned so the random turns repeat across two runs. It
  prints `inputs: 0` and, on success, `Caw view model drives the state machine`.

## What the file holds today

Caw is vector, and every state is a loop: the takes the owner watched, traced into flat-ink shapes
and held on twos exactly as each take holds them (12 drawings a second, longer holds where the
take holds). Each loop starts and ends on its state's still. Every loop is two Solo groups switched
in step: one group of ink shapes per drawing, and one silhouette shape per drawing carrying the
cream rim stroke.

- **Pose** layer: one state per `status` value, entered from Any State when `status` equals it.
  Its animation plays that status's loop. Changes crossfade over 200 ms (`motion.dur-fade`,
  "Fades that carry a state change in place"), so nothing pops in.
- **Turn** layer: loading and reconnecting each have three loops (loading: feather, dots, peer;
  reconnecting: reach, search, hop). Its `rest` state is flagged Random, so each time Caw enters
  loading or reconnecting he picks one of the three at random and plays it (the owner: "You can
  alternate them they're all cute").
- **Scheme** layer: `dark` fades in the thin cream rim the owner picked (Ivory #F4F0E6, the kit's
  dark-rim-cream recipe: 5.31 px at the stills' scale) around every drawing, over the same
  200 ms. Light and dark share every drawing, so switching mid-loop never jumps. The kit has no
  light-mode line: light Caw has none, as in the stills.
- **Motion** layer: `full` lets the loops play; `reduced` holds every loop on its first drawing,
  the state's still. State changes keep their fades.
- The artboard is 592 square with Caw on the stills' scale and ground line, 43 px right and
  40 px down: the acting leaves the stills' 512 box (the search turn reaches x -42, the hop lands
  at y 541), and every drawing fits whole.
- Design-time state (the bare artboard, drawn without `CawStates`) is Ready's still in light.

## Pipeline

1. **Shoot.** Each state's loop is a Backlot take shot with alvdansen's H3 keyframe-animation
   sequence adapter (huggingface.co/alvdansen/h3-keyframe-animation; `h3_seq_step12000` at 1.0,
   both references the state's still so the loop returns to its pose, 22 or 56 frames at 24 fps,
   50 steps, seed 7), with the caption written as character acting "animated on twos". The
   chosen takes are listed in `loops/takes.json`; Backlot film `UhDXc9y9Goj-yn2sUU9A5`.
2. **Trace.** `trace.py` reads each take's frames and groups the held pairs into drawings, keeping
   each drawing's start frame. It cuts Caw from the paper, snapping every pixel to one of his four
   inks as measured from his masters (black, vermilion, eye white, yellow). Thin fringes go, closed
   eyes' lid lines stay, and gaps in his silhouette (between a raised wing and his beak) are told
   from eye whites by the still. It registers drawing 00 onto the state's still and traces each
   ink and the silhouette with vtracer (spline, holes kept) into `body-NN.svg` and `rim-NN.svg`,
   with `timing.json`.
3. **Build.** `scene.mjs` imports the SVGs with rive-mcp-server's `importSvg`, one shape per ink
   per drawing, then `build.mjs` writes `caw.riv`, and `prove-viewmodel.mjs` proves it.

Static art (onboarding, app icon) comes from `generate_image` with the pose sheet as reference.
Backgrounds are removed with BiRefNet
(`uvx --from "rembg[cli,cpu]" rembg i -m birefnet-general in.png out.png`). `assets/mascot/stills/`
holds each state's light and dark still; `trace.py` registers the loops onto them, and they
serve where Rive can't run.

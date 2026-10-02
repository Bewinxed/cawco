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
- Artboard: `Caw`
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

- `node build.mjs` writes `caw.riv` from `scene.mjs` and the stills in `assets/mascot/stills/`,
  and the same bytes to the Apple package's copy
  (`apps/apple/Packages/CawCoKit/Sources/CawCoMascot/Resources/caw.riv`), which `CawView` loads.
  rive-mcp-server's exported `buildScene` and `writeRiv` write the scene; rive-mcp-server has no
  view-model authoring, so `build.mjs` inserts those objects into its object list before writing,
  in the shapes Rive's own exports use (rive-runtime `tests/unit_tests/assets/custom_property_enum.riv`,
  importers in `src/file.cpp`): the `status` enum and the `Caw` view model with its default
  instance after the Backboard, `viewModelId` and `defaultStateMachineId` on the artboard, and on every transition a
  view-model condition whose data bind reads `Caw`'s property. It fails if any state-machine
  input is left.
- `node prove-viewmodel.mjs` runs the file on Rive's official runtime (@rive-app/canvas-advanced,
  WASM, in headless Chromium). It lists `Caw`'s properties and enum values, binds the default
  instance, and sets every status × `dark` × `reducedMotion`, plus repeated loading and
  reconnecting entries. Each frame must pixel-match the same step on the last input-driven file
  (git 407a705e); the random turns are pinned the same way in both by fixing the runtime's
  clocks and entropy. It prints `inputs: 0` and, on success,
  `Caw view model drives the state machine`.

## What the file holds today

This is a skeleton that already honours the contract. Each state shows that pose's still, and
there is no motion yet; the shot loops replace the stills.

- **Pose** layer: one state per `status` value, entered from Any State when `status` equals it. Changes
  crossfade over 200 ms (`motion.dur-fade`, "Fades that carry a state change in place"), so
  nothing pops in.
- **Turn** layer: loading and reconnecting each have three stills (loading: feather, dots, peer;
  reconnecting: reach, search, hop). Its `rest` state is flagged Random, so each time Caw enters
  loading or reconnecting he picks one of the three at random (the owner: "You can alternate
  them they're all cute").
- **Scheme** layer: `dark` crossfades between the light stills and the dark stills (the thin
  cream rim the owner picked) over the same 200 ms.
- **Motion** layer: `full` and `reduced` states on `reducedMotion`. They hold no animation yet.
  When the loops land, `reduced` holds each state's still, and state changes keep their opacity
  fades.
- Design-time state (the bare artboard, drawn without `CawStates`) is Ready in light.

## Pipeline

1. **Shoot.** For each state, write the video prompt, then shoot image-to-video from that
   state's still: flat plain background, locked camera, a seamless loop. Review the takes and
   pick one per state.
2. **Vectorise with OmniLottie** (open weights `OmniLottie/OmniLottie`, CVPR 2026, about 15 GB of
   VRAM):
   `python inference_hf.py --model_path OmniLottie/OmniLottie --video take.mp4 --output take.json`
   Open owner decision: on a clip of Caw it lost his body in all 7 runs tried (default and the
   maintainers' tuned sampling), so what replaces this step is the owner's pick.
3. **Import into Rive.** `riv_lottie_import` turns each `take.json` into a scene fragment.
   Replace that state's still in `scene.mjs` with its loop, keeping every name and the view-model
   bindings above, then run `build.mjs` and `prove-viewmodel.mjs`, plus `riv_critique`. Render
   stills for widgets and Live Activities (they can't run Rive) with `riv_render_frame`.

Static art (loading states, onboarding, app icon) comes from `generate_image` with the pose sheet
as reference. Backgrounds are removed with BiRefNet
(`uvx --from "rembg[cli,cpu]" rembg i -m birefnet-general in.png out.png`). Every asset comes in a
light and a dark variant.

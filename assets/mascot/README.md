# Caw

Caw is CawCo's mascot: a small round fluffy crow, "earnest, a bit dopey, trying very hard". He is
already designed. `~/cawco-design-kit/05-mascot-pose-sheet.png` is his source art, and his masters
live in `~/cawco-design-kit/caw/`. Image work only cleans, upscales or adds poses in that exact
design; it never redraws him.

**Changes to Caw happen in the `.riv`, never by redrawing him in code** (Swift, Svelte or
anything else). Apps load `caw.riv` and set its inputs, and that is all they do with him.

## Contract

- File: `assets/mascot/caw.riv`
- Artboard: `Caw`
- State machine: `CawStates`
- Inputs:

| Input | Type | Values |
| --- | --- | --- |
| `status` | number | 0 ready, 1 working, 2 needs_you, 3 idle, 4 done, 5 trying, 6 loading, 7 reconnecting |
| `reducedMotion` | bool | bound to the system setting |
| `dark` | bool | bound to the colour scheme |

Apple apps drive these with rive-ios 6.x through `RiveViewModel` (`setInput("status", value:)`).
The 6.x package's new `Rive`/`File`/`Worker` API has no state-machine input setters
(rive.app/docs/runtimes/apple/migrating-from-legacy: "The new runtime does not expose
equivalent input APIs").

## What the file holds today

This is a skeleton that already honours the contract. Each state shows that pose's still, and
there is no motion yet; the shot loops replace the stills.

- **Pose** layer: one state per `status` value, entered from Any State on `status == n`. Changes
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
3. **Import into Rive.** `riv_lottie_import` turns each `take.json` into a scene fragment.
   Replace that state's still in the Pose layer with its loop, keeping every name and input
   above. Prove it with `riv_play_state_machine` across all 8 states with `dark` on and off,
   plus `riv_critique`. Render stills for widgets and Live Activities (they can't run Rive)
   with `riv_render_frame`.

Static art (loading states, onboarding, app icon) comes from `generate_image` with the pose sheet
as reference. Backgrounds are removed with BiRefNet
(`uvx --from "rembg[cli,cpu]" rembg i -m birefnet-general in.png out.png`). Every asset comes in a
light and a dark variant.

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
  `idle`, `done`, `trying`, `loading`, `reconnecting`. Each holds only its status's loops, so an
  app loads and instances a few MB for what is on screen instead of every loop at once.
- Artboard: `Caw`, 592 × 592, in every file. Caw's stills sit in the 512 × 512 box at (43, 40);
  the room around it is for his acting. Apps size that box, not the artboard, to the space they
  give Caw, and let the rest draw past it unclipped (`CawView` does).
- State machine: `CawStates`, the artboard's default, its transitions bound to the view model below
- View model `Caw` (data binding, the owner's choice: "use latest best practice on rive"):

| Property | Type | Values |
| --- | --- | --- |
| `reducedMotion` | boolean | bound to the system setting |
| `dark` | boolean | bound to the colour scheme |

Apps use Rive's current runtimes, which drive state machines only through data binding
(rive.app/docs/runtimes/apple/migrating-from-legacy: "The new runtime does not expose equivalent
input APIs, and migration should move to data binding properties"). On Apple: one shared
`Worker`, `File(source: .data(…), worker:)` from bytes read once per status, `Rive(file:…)`, the
`Caw` view model instance, and `RiveUIViewRepresentable`. A status change loads the new file and
fades its Caw in over the shown one in 200 ms (`motion.dur-fade` on `motion.ease-out`); the shown
one stays fully drawn underneath until the fade ends, so no frame is empty, and at most two are
alive at once.

The state machine has no inputs. `Caw` has one instance, `Default` (both booleans off), and the
artboard points at `Caw`, so a runtime that auto-binds gets that instance.

## Building and proving them

The files are generated; they are never edited by hand and there is no Rive editor project behind
them (the editor cannot import `.riv` files). From `assets/mascot/scripts` (`bun install` once):

- `uv run trace.py [loop …]` traces the takes listed in `assets/mascot/loops/takes.json` (each
  status's loops, with their take and still) into `assets/mascot/loops/<loop>/` (see Pipeline).
  It needs `ffmpeg` and `curl`; uv installs its Python dependencies from the script's own header.
- `node build.mjs` writes `caw/<status>.riv` from `scene.mjs` and the traced drawings in
  `assets/mascot/loops/`, and the same bytes to the Apple package's copies
  (`apps/apple/Packages/CawCoKit/Sources/CawCoMascot/Resources/caw/`), which `CawView` loads. It
  removes any other `.riv` in those folders. rive-mcp-server's exported `buildScene` and
  `writeRiv` write each scene; rive-mcp-server has no view-model authoring, so `build.mjs`
  inserts those objects into its object list before writing, in the shapes Rive's own exports use
  (rive-runtime's importers in `src/file.cpp`): the `Caw` view model with its default instance
  after the Backboard, `viewModelId` and `defaultStateMachineId` on the artboard, and on every
  transition a view-model condition whose data bind reads `Caw`'s property. It fails if any
  state-machine input is left.
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
    less, the median of five steady runs.

  The runtime's clocks and entropy are pinned so the random turns repeat across two runs. It
  prints one line per file, the totals (`loops animate: 8/8`, `reducedMotion holds still: 8/8`,
  `files proven: 8/8`) and, on success, `Caw view model drives the state machine in every status
  file`.

## What the files hold today

Caw is vector, and every status is a few loops that take turns: the takes the owner picked,
traced into flat-ink shapes and held on twos (12 drawings a second, longer holds where the take
holds). Each loop starts and ends on its status's still. Every loop is one Solo group switched by
its keys, one group of ink shapes per drawing; a drawing the take comes back to is the same group,
reused rather than traced again.

- **Variant** layer: its `rest` state and every loop state are flagged Random. From `rest`, Caw
  picks one of the status's loops; at the end of each loop he picks one of the others, so the same
  loop never plays twice in a row. A status with one loop simply repeats it.
- **Scheme** layer: `dark` fades in the thin cream rim the owner picked (Ivory #F4F0E6, the kit's
  dark-rim-cream recipe: 5.31 px at the stills' scale) around every drawing over 200 ms. The rim
  is the silhouette's own stroke, drawn under its fill, so it costs no extra shapes. Light and
  dark share every drawing, so switching mid-loop never jumps. The kit has no light-mode line:
  light Caw has none, as in the stills.
- **Motion** layer: `full` lets the loops play; `reduced` holds the first loop on its first
  drawing, the status's still.
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
   silhouette (between a raised wing and his beak) are told from eye whites by the still. It
   registers drawing 00 onto the status's still and traces each ink with vtracer (spline, holes
   kept) into `body-NN.svg`, with `timing.json`.
3. **Build.** `scene.mjs` imports the SVGs with rive-mcp-server's `importSvg`, one shape per ink
   per drawing, then `build.mjs` writes the files, and `prove-viewmodel.mjs` proves them.

Static art (onboarding, app icon) comes from `generate_image` with the pose sheet as reference.
Backgrounds are removed with BiRefNet
(`uvx --from "rembg[cli,cpu]" rembg i -m birefnet-general in.png out.png`). `assets/mascot/stills/`
holds each status's light and dark still; `trace.py` registers the loops onto them, and they
serve where Rive can't run.

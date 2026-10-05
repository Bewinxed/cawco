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
  `idle`, `done`, `trying`, `loading`, `reconnecting`, `sleeping`, `compacted`. Each holds only
  its own status, so an app loads and instances a few MB for what is on screen instead of
  everything at once.
- A status **waits** or **rests** (owner: "it shouldn't animate if there's nothing going on").
  A wait is something going on, so a waiting status plays its loops. A rest is one drawing,
  held, with no loop and no beats: `ready`, `sleeping` and `compacted`, named in
  `assets/mascot/loops/rests.json`. A runtime that draws only on change draws a rest once.
- `compacted` is the Caw beside "Compacted" in a transcript: his head alone, a folded note in
  his beak (the owner's pick, `assets/mascot/stills/light-compacted.png`). His head fills the
  512 box, so a place that gives him 18 px gets an 18 px head. He was never a loop, so his
  drawing is traced from that picture (`trace_still.py`) into `loops/compacted/body-00.svg`,
  and the note is an ink of its own, cream, that only he carries (`rests.json` names it under
  `inks`). He comes in once by `compacted-enter` (he rises from below with a long strip of
  paper and folds it into the note) and then rests. He is the
  one Caw drawn at 18 px, so he has a look of his own (`LOOK` in `scene.mjs`; no other file's
  bytes depend on it): his dark rim is one whole device pixel of a 1x screen at 18 CSS px,
  512 / 18 = 28.4 artboard px, where the kit's 5.31 is 0.19 CSS px and measured 1.60:1 against
  the dark page; and his note, traced in cream (1.0:1 against the light page), is filled with
  his yellow ink instead, the butter note the owner picked ("I choose butter"). It has no line
  of its own: the rim is grown from the whole silhouette, note included, so on the dark page
  one rim runs round head and note. Its edge measures 2.0:1 against the light page and 9.4:1
  (1x) and 7.4:1 (2x) against the dark page.
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
- His **still** is the drawing his enter lands on and Reduce Motion holds: a rest's drawing, or
  the first drawing of a waiting status's first loop.
- Artboard: `Caw`, 592 × 592, in every file. Caw's stills sit in the 512 × 512 box at (43, 40);
  the room around it is for his acting. Apps size that box, not the artboard, to the space they
  give Caw, and let the rest draw past it unclipped (`CawView` does).
- State machine: `CawStates`, the artboard's default, its transitions bound to the view model below
- View model `Caw` (data binding, the owner's choice: "use latest best practice on rive"):

| Property | Type | Who sets it | Meaning |
| --- | --- | --- | --- |
| `reducedMotion` | boolean | app | the system setting; on, the file holds his still |
| `dark` | boolean | app | the colour scheme; on, the cream rim |
| `entered` | trigger | file | his drawn enter has ended and he is on his still |
| `enters` | boolean | file | on in a file that carries a drawn enter; apps read it, never write it |

When Caw must leave, or must show a different status, the old Caw is gone within 200 ms from any
drawing, and a new status begins with its enter (owner: "A status that shows five seconds late
is stale status"; Material 3, Easing and duration: exit transitions are short, 200 ms; Apple
HIG, Loading: placeholders are replaced as content becomes available). So he has a drawn way in
and no drawn way out. A status's enter, `<status>-enter` in `assets/mascot/clips/`, starts on an
empty page and lands on the status's still; it is shot with the same adapter as the loops. On
every drawing of an enter he is wholly inside the safe area (see `trace_clip.py` below) or not
there at all. Shot today (`clips/takes.json`): `loading`, `ready`, `reconnecting` and
`compacted`. A status with no drawn enter is simply there when its file starts, and the apps
fade it in.

How the apps drive it (one code path each: the dashboard's `Caw.svelte`, Apple's `CawView`):

- **Appearing.** Load the status's file; it starts on its own. With `enters` on, his enter
  plays and `entered` ends it. With `enters` off the app fades him in over `motion.dur-pop` on
  `motion.ease-out`, opacity 0 to 1 and scale from `motion.leave-scale` to 1, and that fade's
  end is his entrance's end. DESIGN.md's Real Wait Rule holds him until then.
- **Leaving.** What replaces him lands at once under its own 200 ms cross-fade and is never
  delayed by him. From any drawing, his still included, the app pauses the file on the drawing
  he is on and fades him out over `motion.dur-fade` on `motion.ease-out`, opacity to 0 and
  scale to `motion.leave-scale`. A fade in that is still running is taken over from where it
  is.
- **Changing status.** The old status leaves as above; once it has gone the new status's file
  appears as above. Nothing waits for a loop to end, and one file is alive at a time.
- **Reduce Motion.** The files hold his still and the apps fade him over `motion.dur-fade` on
  `motion.ease-out`, opacity only: in, out, and from one status across to the next.

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

The state machine has no inputs. `Caw` has one instance, `Default` (every boolean off but
`enters` in a file with a drawn enter), and the artboard points at `Caw`, so a runtime that
auto-binds gets that instance.

## Building and proving them

The files are generated; they are never edited by hand and there is no Rive editor project behind
them (the editor cannot import `.riv` files). From `assets/mascot/scripts` (`bun install` once):

- `uv run trace.py [loop …]` traces the takes listed in `assets/mascot/loops/takes.json` (each
  status's loops, with their take and still) into `assets/mascot/loops/<loop>/` (see Pipeline).
  It needs `ffmpeg` and `curl`; uv installs its Python dependencies from the script's own header.
- `uv run trace_clip.py <status>-enter <take> [clips folder]` traces one enter into
  `assets/mascot/clips/<status>-enter/` (or the folder named) with the same tracer, registered
  onto the still it lands on. It trims the take to the move itself (the holds at either end
  become one two-frame drawing), replaces the landing by the still's own drawing, and gates the
  result: the landing inked as its still on 98% of their pixels or more, the first drawing
  empty or carrying 5% of the still's ink at most (he never appears at size), on twos, no white marks, no halo, every eye intact, every ink in order (no drawing shows an ink his landing does not carry, and a status's own ink, the note, shows only where his eye whites are in or his black is at 90% of what he lands with; `--inks` runs this check alone), and the safe area: on every
  drawing his ink sits inside the line 3.5% in from each edge of the tighter of the take's
  frame and the artboard, so he is wholly visible or not there at all (EBU R95 and ITU-R
  BT.1848 give the 3.5% action-safe margin; SMPTE RP 218: "all significant action shall be
  contained"). An enter that passes is listed in the folder's `takes.json`, which is what
  `scene.mjs` builds from; one that fails is not. `uv run trace_clip.py --safe [--dir <clips
  folder>] [clip …]` runs the safe-area check alone over enters already traced, names the
  drawings outside the line and exits non-zero if there are any. An enter of a status with inks
  of its own is traced in them, and its note is not a white mark. An enter that lands on a
  still traced from a picture keeps the take's whole-pixel placement: `trace.py`'s finer fit
  sizes a take by its traced outline's extent, and one tuft tip traced 1.75 units high drew
  those landings 0.5% small.
- `uv run trace_ledge.py <clip> <take>` traces a ledge clip into `assets/mascot/clips/<clip>/`:
  Caw coming up from behind a ledge and peering over it, for a page that puts its own ledge
  under him (the landing page; `site/scripts/import-caw.mjs` copies a clip folder). No app
  plays these, no status file holds them and `clips/takes.json` does not list them; each
  folder's `timing.json` names its take. Today: `climb-peer` (40 frames) and `peer-over` (22).
  The take is shot with the ledge as a flat blue block, an ink he does not carry, which the
  tracer keys out to paper, so the drawings hold only Caw: above the line everything of him
  that shows, below it only the wing tips that hang in front of the ledge. The take's frame is
  the 512 box itself, and the line sits at 56.8% of its height (`probe.ledgeLine`). Gates: the
  same safe area (only the ledge hides him, never the frame), on twos, and the landing's
  silhouette at 0.9 IoU or more with the clip's end picture, `stills/ledge-<clip>.png`.
- `uv run trace_still.py <status>` traces a resting status's picture
  (`stills/light-<status>.png`) into `loops/<status>/body-00.svg`, for a status that was never
  a loop (`compacted`). Same tracer, the status's own inks, at the takes' 1.6 px a unit.
- `node build.mjs` writes `caw/<status>.riv` from `scene.mjs` and the traced drawings in
  `assets/mascot/loops/`, and the same bytes to each app's copies:
  `apps/apple/Packages/CawCoKit/Sources/CawCoMascot/Resources/caw/`, which `CawView` loads, and
  `apps/dashboard/src/lib/assets/caw/`, which the dashboard's `Caw.svelte` loads. Each app keeps
  its own copy because each app is built from its own directories. It removes any other `.riv` in those
  folders. rive-mcp-server's exported `buildScene` and
  `writeRiv` write each scene; rive-mcp-server has no view-model authoring, so `build.mjs`
  inserts those objects into its object list before writing, in the shapes Rive's own exports use
  (rive-runtime's importers in `src/file.cpp`): the `Caw` view model with its default instance
  after the Backboard, `viewModelId` and `defaultStateMachineId` on the artboard, on every
  conditioned transition a view-model condition whose data bind reads `Caw`'s boolean, and
  after a state or transition that fires, a `StateMachineFireTrigger` on `Caw`'s trigger. It
  fails if any state-machine input is left.
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
  - a resting file (`ready`, `sleeping`, `compacted`) must show its one drawing, in the scheme `dark`
    selects, and nothing else, with motion on or reduced;
  - `enters` reads on exactly in the files with a drawn enter;
  - on a fresh state machine, a file with a drawn enter shows the enter's drawings in order,
    each two frames or more, and lands on his still with `entered`, after as long as the enter
    lasts; a file with none shows a first drawing (its rest, or a loop's) on its first frame
    and never fires `entered`.

  The runtime's clocks and entropy are pinned so the random turns repeat across two runs. It
  prints one line per file, the totals (`loops animate: 7/7`, `stills rest: 3/3`,
  `reducedMotion holds still: 10/10`, `drawn enters play and land: 4/4`, `no drawn enter, simply
  there: 6/6`, `files proven: 10/10`) and, on success, `Caw view model drives the state machine
  in every status file`.

## What the files hold today

Caw is vector. A waiting status is a few loops that take turns: the takes the owner picked,
traced into flat-ink shapes and held on twos (12 drawings a second, longer holds where the take
holds). Each loop starts and ends on its own first drawing. A resting status is one drawing. The
enters are traced and held the same way. Every loop is one Solo group switched by
its keys, one group of ink shapes per drawing; a drawing the take comes back to is the same group,
reused rather than traced again.

- **Variant** layer: `start` (nothing drawn) is left in the first advance. A file with a drawn
  enter plays `enter` and fires `entered` at its end, then a waiting status plays its first
  loop; a waiting status with none starts on any one of its loops. At the end of each loop
  comes one of the others (the loop states are flagged Random), so the same loop never plays
  twice in a row; a resting status sits on `rest`.
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
   vermilion, eye white, yellow; and cream, the note, where a status names it). Thin fringes go, closed eyes' lid lines stay, and gaps in his
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

# Caw

Caw is CawCo's mascot: a small round fluffy crow, "earnest, a bit dopey, trying very hard". He is
already designed. `~/cawco-design-kit/05-mascot-pose-sheet.png` is his source art, and his masters
live in `~/cawco-design-kit/caw/`. Image work only cleans, upscales or adds poses in that exact
design; it never redraws him.

His personality, how he acts, and how new animations are made: [PERSONALITY.md](PERSONALITY.md).

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
  paper and folds it into the note) and then rests. He has a look of his own (`LOOK` in
  `scene.mjs`; no other file's bytes depend on it): his note, traced in cream (1.0:1 against
  the light page), is filled with his yellow ink instead, the butter note the owner picked ("I
  choose butter"). It has no line of its own: the rim is grown from the whole silhouette, note
  included, so on the dark page one rim runs round head and note. Its edge measures 2.0:1
  against the light page.
- **The dark rim is at least one device pixel wide wherever he is drawn.** The kit's rim, 5.31
  artboard px, is a share of his size: at 18 CSS px it is 0.19 px, and at 14 to 48 px on a 1x
  screen (34 px on a 2x) it measured 0.11 to 0.41 device px, with a tenth or more of the first
  ring of pixels round his body bare page (1.0:1), so his near-black body read as an outline
  on the near-black page. So every file's rim is as wide as `pixel`, one device pixel in the
  still box's units, which the app sets from the size it draws him at, or the kit's where that
  is wider (his box past 96 device px). Measured with `node measure-rim.mjs` on the dark page,
  every file at 14, 18, 34, 48 and 80 CSS px, 1x and 2x: 98% to 100% of that ring at 3:1 or more
  and its tenth percentile 5.8:1 or more, as the compacted Caw's one-pixel rim measured (100%,
  7.9:1 at 18 px).
- `sleeping` is what Caw shows when nothing is going on: no session working anywhere on the
  fleet and nothing needing the operator (owner: "it should have a 'sleeping' look too"). The
  drawing is the nod in the owner's idle-nod-off take, eyes closed and head dropped
  (`assets/mascot/loops/idle-nod-off/body-11.svg`); anything that needs the sleeping Caw as a
  picture renders that SVG (its 512 × 512 box is the stills' box). With sessions
  merely working he is awake and still: `ready` (ready-attention's first drawing).
- He moves only while something needs the operator (owner: "it shouldn't animate if there's
  nothing the USER has to pay attention to"): `needs-you`, for a parked ask, a permission or a
  failure. `loading` and `reconnecting` keep their loops too: they are the page saying it
  cannot show its content yet. One exception: he smiles in reply to the operator's own pointer
  on his head in the top bar (owner, 2026-10-08: "show the smiling ^^ caw's face/animation on
  hover and on click").
- His **head in the top bar** is his compacted head, and its moves are files of their own, not
  statuses, the owner's picks from Backlot film `UeuRv6sumFzEx_Dyz9E5Y` (head only, so nothing
  of him leaves the bar's glass circle: the whole-body wave it replaced was cut at that circle's
  edge): `head-beat`, his needs-you beat (beat-b2: he blinks, stretches up into his alert face,
  holds it and settles back, 1.33 s), played once when something new needs the operator;
  `head-smile` (smile-3's in: his eyes squeeze into ^^, 0.58 s), played when the operator's
  pointer comes onto him or a press goes down, and held; `head-unsmile` (smile-3's out, 0.67 s),
  played when it leaves, or once a tap's smile has landed. Each is a rest with a drawn enter
  that opens on the drawing the bar shows before it and rests on the one it shows after
  (`rests.json`; `head-smile` rests on his ^^ drawing, traced from its picture,
  `stills/light-head-smile.png`, the others on `compacted`), with the compacted note's look. The
  beat goes first: one that comes while he smiles plays as soon as his eyes are open again.
  Under Reduce Motion nothing plays: no beat, and his face is the ^^ one while the pointer is on
  him. The apps draw a clip over his face, which stays up until the clip's first drawing (the
  face's own, held two frames) is on screen, and his face becomes the drawing it rests on in the
  frame the clip lands. Every drawing of every head file keeps two device pixels or more inside
  his item's 36 px glass circle, in light and dark, at the bar's sizes and screen scales
  (`head_circle.py`).
- His **still** is the drawing his enter lands on and Reduce Motion holds: a rest's drawing, or
  the first drawing of a waiting status's first loop.
- `assets/mascot/caw/template-<name>.riv` (`code`, `launch`, `seo`, `brand`, `design`,
  `social`) are Caw's **template poses**, files that are not statuses: each New project
  template card shows its own, Caw with the template's prop (the owner's picks, Backlot film
  `B8VeHkbHHu1urJavapTPB`). Each is a rest, the end hold of its take traced by `trace_pose.py`,
  with no drawn enter: the dashboard draws it once as a picture (`CawPosePicture`, no Rive left
  running) and fades it in as the card first shows; with Reduce Motion he is simply there. The
  Apple apps have no template cards and carry no pose. A pose is not placed on the still box: it
  keeps its take's scale (every pose the same) and is moved, centred across on his body, only as
  far as its ink must go to sit inside the artboard's action-safe area (3.5% in from each edge),
  so an app frames a pose by the artboard and every pose fits whole. The props are cream with
  tan shaded faces: two inks of the poses' own (`rests.json` `inks`). Tan, (201, 185, 157), is the
  median of the faces' core pixels in seo 1, design 4 and code 5; a tan run is a face only where a
  disk 7 take px (4.2 box units) across fits inside it, and its thinner runs, the props' outlines
  (2 px at the median, 6 at most), are traced black. Both sit inside the silhouette, so the dark
  rim runs round them; neither needs a look of its own (each borders his black or the page with
  a black outline).
- `assets/mascot/caw/peek.riv` is Caw's **ledge peek**, a file that is not a status: in a Caw
  thread he peeks over the composer's top-leading corner (the owner's pick, the `peer-over`
  ledge clip). He comes up from behind the ledge by that clip, his drawn enter (`enters` on), and
  rests on its last drawing, which Reduce Motion holds. The ledge itself is not in the file:
  below its line only the wing tips that hang in front of it are drawn. The line sits at 56.84%
  of the 512 box's height from its top (`ledgeLine` under `peek` in `loops/rests.json`, the
  clip's `probe.ledgeLine`); an app places that line on the edge Caw peeks over, so the box
  stands 0.5684 of its height above the edge and the rest of him hides behind it.
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
| `pixel` | number | app | one device pixel in the 512 still box's units: 512 ÷ (the side the app gives his box, in CSS px or points, × the display's device pixel ratio or scale); the dark rim is this wide, or the kit's 5.31 where that is wider. Set again when the size or the ratio changes. Unset (0), the rim is the kit's |

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

- **Size.** Set `pixel` from the side given his box and the display's ratio before his first
  frame, and again whenever either changes.
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
`enters` in a file with a drawn enter, `pixel` 0), and the artboard points at `Caw`, so a
runtime that auto-binds gets that instance. The rim's width is not a state: every rim stroke's
thickness is data-bound to `pixel` through the file's one converter, a range mapper that holds
it at the kit's from below and doubles it (the stroke is centred on the silhouette), so a
live Caw and a still drawn with `stageCaw` take the same width from the same property.

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
  of its own is traced in them, and its note is not a white mark (the gates read each ink from
  its own paths, not by colour off the picture). A drawing folds into the landing's two-frame
  snap only when it is inked as the still on 98% of its pixels, the landing gate's own share.
  `--opens <file>` traces a clip that opens on a still instead of an empty page (the head
  files): its opening run is snapped to that still's drawing and gated as the landing is, and
  its eye whites are told from both stills, as a loop's are. `tkA+tkB` traces two takes as one
  clip, the first ending on the drawing the second opens on. `--closed-eyes <file>` gives a
  blink the take drew as a blank head (no light inside his black at all) the closed eyes of that
  file's drawing, moved onto the blink's silhouette: his closed eye is drawn, white arcs in his
  black, never a plain blob.
- `uv run trace_ledge.py <clip> <take>` traces a ledge clip into `assets/mascot/clips/<clip>/`:
  Caw coming up from behind a ledge and peering over it, for a page that puts its own ledge
  under him (the landing page; `site/scripts/import-caw.mjs` copies a clip folder; the apps,
  through `peek.riv`). `peer-over` is `peek.riv`'s enter, named under `peek` in
  `loops/rests.json`; no status file holds a ledge clip and `clips/takes.json` does not list
  them; each folder's `timing.json` names its take. Today: `climb-peer` (40 frames) and `peer-over` (22).
  The take is shot with the ledge as a flat blue block, an ink he does not carry, which the
  tracer keys out to paper, so the drawings hold only Caw: above the line everything of him
  that shows, below it only the wing tips that hang in front of the ledge. The take's frame is
  the 512 box itself, and the line sits at 56.8% of its height (`probe.ledgeLine`). Gates: the
  same safe area (only the ledge hides him, never the frame), on twos, and the landing's
  silhouette at 0.9 IoU or more with the clip's end picture, `stills/ledge-<clip>.png`.
- `uv run trace_still.py <status>` traces a resting status's picture
  (`stills/light-<status>.png`) into `loops/<status>/body-00.svg`, for a status that was never
  a loop (`compacted`). Same tracer, the status's own inks, at the takes' 1.6 px a unit.
- `uv run trace_pose.py <pose> <take> <still the take opens on>` traces a template pose into
  `assets/mascot/loops/<pose>/body-00.svg` with the same tracer, in the inks `rests.json` names
  for it: the take's end hold, registered onto the still it opens on (no still has the pose, so
  its eye whites are told forward from that still and, past the evidence, by shape), then placed
  by its own ink (see the Contract). Gates: drawing 00 on its still (0.9 overlap or more), an end
  hold of a second or more, halo 0, no eye white see-through, no white marks, no shards (no cream
  or white region under MIN_REGION inside a tan face), and the safe area.
- `node build.mjs` writes `caw/<status>.riv`, `caw/peek.riv` and `caw/template-<name>.riv` from
  `scene.mjs` and the traced drawings in `assets/mascot/loops/` and `assets/mascot/clips/`, and the
  same bytes to each app's copy of the files that app shows:
  `apps/apple/Packages/CawCoKit/Sources/CawCoMascot/Resources/caw/` (all but the template poses),
  which `CawView` loads, and `apps/dashboard/src/lib/assets/caw/` (all of them), which the
  dashboard's `Caw.svelte` loads. Each app keeps its own copy because each app is built from its
  own directories. It removes any other `.riv` in those folders. rive-mcp-server's exported `buildScene` and
  `writeRiv` write each scene; rive-mcp-server has no view-model authoring, so `build.mjs`
  inserts those objects into its object list before writing, in the shapes Rive's own exports use
  (rive-runtime's importers in `src/file.cpp`): the `Caw` view model with its default instance
  after the Backboard, then the rim's range-mapper converter, a data bind from `pixel` right
  after every rim stroke, `viewModelId` and `defaultStateMachineId` on the artboard, on every
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
  - a resting file (`ready`, `sleeping`, `compacted`, `peek`, each template pose and head file) must show its one drawing, in the
    scheme `dark` selects, and nothing else, with motion on or reduced;
  - `enters` reads on exactly in the files with a drawn enter;
  - `pixel` sets the dark rim's width and nothing else: light renders the same at every value;
    unset, or under the kit's 5.31, the rim is the kit's; at 512 / 36 and 512 / 18 its reach
    from his body (99th percentile) is `pixel` within one canvas pixel;
  - on a fresh state machine, a file with a drawn enter shows the enter's drawings in order,
    each two frames or more, and lands on his still with `entered`, after as long as the enter
    lasts; a file with none shows a first drawing (its rest, or a loop's) on its first frame
    and never fires `entered`.
  - loaded with `dark` on, his first frame carries his rim whole (its mean alpha 90% of the
    settled still's or more): the scheme starts where the view model is, and fades only on a
    change.

  The runtime's clocks and entropy are pinned so the random turns repeat across two runs. It
  prints one line per file (the peek's names its ledge line), the totals (`loops animate: 7/7`,
  `stills rest: 14/14`, `reducedMotion holds still: 21/21`, `drawn enters play and land: 9/9`,
  `no drawn enter, simply there: 12/12`, `pixel sizes the dark rim: 21/21`, `rim whole at load:
  21/21`, `files proven: 21/21`)
  and, on success, `Caw view model drives the state machine in every file`.
- `node measure-rim.mjs [--sizes 14,18,34,48,80] [--light]` measures the dark rim as the apps
  draw him: each file's still framed as `cawStill` frames it, at each size, 1x and 2x, on the
  dark page, with `pixel` set as the apps set it. Per picture: the rim's mean width in device
  px, the share of the first ring of pixels round his body at 3:1 or more against the page,
  and that ring's tenth-percentile contrast. `--light` adds a digest of each light picture, to
  show a change left light alone.
- `uv run regress.py [--old <git ref>] [--mascot <folder>] [--only name,…]` runs every source the
  pipeline traces (the loops, the clips, the ledges, every still) through a ref's `trace.py`
  (default `origin/main`) and the working one, down to the final labels vtracer traces, and
  prints per source the pixels that differ and each ink's count before and after. A change to a
  tracing rule is run over every source this way before it ships: a rule fenced to one kind of
  take hides what it does to the rest.
- `uv run head_circle.py` draws every drawing of every head file as the bar draws his head (the
  dashboard's 20 px head at 1x and 3x, Apple's 22 pt at 2x and 3x, in each app's 36 glass
  circle), in light and in dark with his rim, and fails if any ink comes within two device
  pixels of the circle's inner edge; it prints each file's least clearance.

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
  dark-rim-cream recipe: 5.31 px at the stills' scale, or one device pixel where that is wider,
  by `pixel`) around every drawing over 200 ms when the scheme changes; a file starts in the
  scheme its view model holds, with its rim already drawn, so a clip played over a face the
  app has drawn never fades its rim in. The rim
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
   Backlot film `UhDXc9y9Goj-yn2sUU9A5`. The adapter takes exactly two subject pictures (the
   window's first drawing and its natural end), so a key drawing that lives only on this
   machine (a still, a picture made by image edit) goes into Backlot as a cast image first.
   `backlot_save_cast` takes an https or `data:` URL, which is too large to pass for a 1024 px
   picture, so create the prop with `backlot_save_cast` and upload each picture to Backlot's own
   route: `curl -X POST -H 'Origin: https://backlot.bewinxed.com' -F 'file=@key.png' -F tag=study
   https://backlot.bewinxed.com/api/cast/<entityId>/images` (the Origin header is SvelteKit's
   cross-site check; the reply carries the new imageId). The head files' keys are cast "Caw bar
   head keys", framed as compacted-enter's take (the still box at 0.6248 box units a take pixel,
   its corner at take pixel (102, 132) of a 1024 frame).
2. **Trace.** `trace.py` reads each take's frames and holds them on twos: each frame pair shows
   its first frame's drawing, and pairs showing the same drawing are one longer hold. It cuts Caw
   from the paper, snapping every pixel to his inks as measured across the take's drawings (black,
   vermilion, eye white, yellow; and cream, the note, where a status names it). Thin fringes go, closed eyes' lid lines stay, and gaps in his
   silhouette (between a raised wing and his beak) are told from eye whites from both ends of the
   take: forward from the opening still and backward from the closing one, evidence over guesses,
   and where neither end has evidence, by shape (a pupil always bites into an eye white), except
   that nothing inside an eye is a gap: a region guessed paper inside an eye's hull is its
   pupil's catchlight. Eye white stays only inside his body's black; white elsewhere (a slit's
   pinched end, a speck in his vermilion, a sliver on a prop's lit edge) takes the ink it sits
   on, so no eye white touches the page round him. A pixel is vermilion or yellow only with
   that ink's chroma (neutral greys, a soft frame's blend of black into white, sit nearer either
   than black or white), and an orange blend of the two takes whichever is nearer in Lab, as
   `--halo` judges it (in RGB it sat nearer yellow, and traced yellow over a take with none). It registers drawing 00 onto the status's still where the two overlap
   most (`register()`: scale and offset searched from the extents' whole-pixel estimate, so no
   single tip or edge pixel decides where a loop sits) and traces each ink with vtracer (spline, holes
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

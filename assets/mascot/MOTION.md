# MOTION.md: living illustrations in this project

> Caw's motion notes. Part 1 is the `rossark-motion-skill` method, copied as it is (github.com/rossark0/rossark-motion-skill); Part 2 is Caw's, and overrides it. Read [PERSONALITY.md](PERSONALITY.md) (his character) and [README.md](README.md) (the `.riv` contract) beside it.

---

## Part 1. The method

**The goal:** anything drawn (a character, a plant, a flame, a street, a logo, a chart) feels alive and calm. Nothing teleports, nothing bounces, nothing shouts.

### Principles
1. **Never teleport:** interpolate everything; never swap drawings.
2. **Calm by default:** strong curves, no bouncy overshoot.
3. **Small amplitudes:** when unsure, halve it.
4. **Arcs and pivots:** each moving part is a layer rotating around its joint (stem base, hinge, neck, hook).
5. **Overlap and follow-through:** tips and trailing parts move later and further; give each part the same wave with a growing phase delay.
6. **Variety without chaos:**
   - repeated items get a seeded phase, speed and size;
   - nothing moves in sync, and there's no random value per frame.
7. **One main action per scene, plus two or three idle loops.** Side things stay quiet.
8. **Opacity only to appear or disappear.**
9. **The layout never moves:** motion lives inside the drawing.
10. **Reduced motion:** loops freeze on a good frame 0, and one-shots show their final frame.
11. **Nothing runs unseen:** pause off screen, when hidden and in the background.
12. **Enough frames:** anything under ~100 ms flickers at 30 fps; render and export at 60 when you can. Blinks close in ~110 ms and reopen in ~190 ms.
13. **Interface rules:**
    - frequency decides how much (often seen = barely moves; rare moments get the delight);
    - every motion has a purpose;
    - shared elements travel, never teleport;
    - interface moves stay under 300 ms;
    - exits are faster than entrances;
    - nothing appears from scale 0;
    - interruptions continue from the current value.

### The engine
- **Clocks:** a loop clock for idle life, a one-shot clock for a scene that tells an action. One per character, group or scene.
- **Tracks:** keyframes `[ms, value, 'out'?]` read with `track(t, keys)`. The last key equals the first. `track` stops at every key, so use it for one move (a blink, a lid). For acting (a chain of poses), use `flow(t, keys)`, which passes through the keys without stopping and never overshoots.
- **Helpers:**
  - `wave` (−1 to 1), for sway and breathing;
  - `loop` (0 to 1), for drift and falling;
  - `bell`, to fade in and out;
  - `seg`, for one beat of a one-shot;
  - `seeded(i)`, for per-item variety.
- **Curves:**
  - travel uses ease-in-out `(0.77, 0, 0.175, 1)`;
  - open and arrive use ease-out `(0.23, 1, 0.32, 1)`;
  - leaving uses ease-in;
  - endless loops are linear.

### Quick recipes
| Subject | Recipe |
|---|---|
| Character | breathing 1–2 units over 3–5 s; a blink every 3–4 s; pupils glide; head tilt 3–6° |
| Waiting to be tapped | a jiggle every ~270 ms: squash 2%, widen 2%, the bulge trading sides |
| Floating figure | rises in from 30% of its height below, drifts 5% down and up, leaves rising |
| Tail, hair, ears | rotation around the root, phase delayed along the chain, 4–10° |
| Plant | sway 1.5–4° around the base over 3–6 s; leaves on seeded phases |
| Cloth, flag | a wave that travels along the length, growing away from the fixed edge |
| Fire | a lean of 2–4° and a 3–6% stretch on two waves of different periods |
| Smoke, steam | rises 8–14 units and fades in and out with `bell` |
| Water | ripples grow and fade; floating things bob 1–2 units and rock 2° |
| Rain, snow | seeded `loop`s; snow sways sideways |
| Sky | clouds drift over 20–60 s with parallax; sun rays take 30–60 s per turn |
| Lights | a glow of 2–5% over 2–4 s; stars twinkle at seeded times |
| Machines | gears turn linearly by ratio; a clock hand steps with ease-out |
| Phone | ±3° bursts, then a pause |
| Icon, logo | plays once on appear, then rests |
| Chart | a one-shot draw-on, with bars staggered 40–80 ms |

### Acting (a whole character)
- **Every channel:** key pose (`flow`) + idle (`wave`s, never off while on stage) + follow-through (the parent read 90–140 ms earlier) + accents (a `wave` inside a `seg` window).
- **Arms:** an upper arm and a forearm share a round elbow; the forearm points at shoulder angle + elbow bend.
- **Head turns:** slide the face toward the turn (eyes 10, nose 13 in a 100-wide head) and the ears the other way. Blink on the turn.
- **Weight:** the hips shift and carry the upper body, and the legs angle to keep the feet under it.
- **Landing:** hover, then fall with gravity and stretch; squash hard (0.8) on contact and keep the volume (`width = 1 / height^0.6`).
- **In the air:** limp feet (toes down, one knee folded, trading slowly). The shadow stays on the floor and scales with the height.
- **Props:** enter from off screen already moving and roll by distance / radius. The eyes follow them. A kick hits at the middle of the swing; the prop leaves as a throw, spinning, with a short squash.
- **Asymmetry:** the arms never mirror each other.
- **Camera:** a view from a little above is a whole build, not a tweak: the head is 40–50% of the height, the torso is short and narrower than the head, the legs are short, the feet are round from above, and the shadow is a wide oval with the feet in its lower half. Keep it in one `build` object. A flat view keeps a thin pill shadow.
- **Framing:** on a phone, as big as the screen allows, with the feet low.

### From a reference video
- Contact sheets at the full frame rate (`tools/sheet.sh`).
- Measure motion with numbers (`tools/track_edges.py`): a 2% jiggle or a 5% float doesn't show to the eye.
- Sample colors from pixels (`tools/sample_colors.py`).
- Go part by part: feet, shadow, hands, head.
- Compare proportions as ratios of one unit (head widths). "Stretched" means a ratio is far off.
- Compare your render with the reference at the same moments.
- Don't publish a copy of someone else's art.

### Performance
- Everything is a function of one clock's time.
- Draw many items in one SVG or `Canvas`.
- Reset repeating animations to 0 before starting, and cancel them on cleanup.
- Declare curves at the top of the module.

### Workflow
1. Read Part 2 and the art file's header comments.
2. List what could live in the drawing.
3. Pick one main action and two or three idle loops.
4. Split the art into layers at their pivots.
5. Put the numbers in tokens.
6. Check frame 0, the final frames and the loop seams. For a character, look at a contact sheet of every 4th frame of your own render.
7. Run the checks.
8. Hand off: what moves, and what hasn't been seen on a real device.

---

## Part 2. This project: Caw

### Where the code is
- **Platform:** web, the dashboard (SvelteKit, Svelte 5). The Apple app is on hold: no Swift rig yet.
- **The rig, as drawn:** `rig/caw-rig.svg`, one group per moving part, each naming its pivot (`data-pivot`). It is generated, never edited: `uv run rig.py` in `scripts/` cuts his open-eyed still (`stills/light-ready.png`) into parts and traces each with potrace into one closed outline, writes the SVG and the same paths as `apps/dashboard/src/lib/cawco/caw-rig/art.ts`, and measures frame 0 against the still (alpha bounds, centre of mass, silhouette overlap, mean colour gap) at 64, 96, 160, 384 and 512 px. `--debug <dir>` writes the part map and frame-0 side-by-sides.
- **Coordinate system:** the still's 512 box, y down; his feet stand on y ≈ 479. Every pivot, pose and prop is in these units.
- **Parts and pivots** (z order, back to front): tail (222, 398); legL (229, 404) and legR (301, 405), the hips; body, scaled about the ground between his feet (272, 420), with the two wing-edge lines on it; wingR, its shoulder (355, 305), holding handR, the primaries (386, 318); head, its neck (272, 258), holding the tuft (240, 122), the face (both eyes, clipped to the head) and the beak (370, 186), whose lower beak, the jaw, hinges at the corner of his mouth (370, 203); wingL (205, 305) holding handL (139, 311); then props standing on the ground. A held prop is drawn in its hand, under the primaries, so their tips curl over it. His body's top under his head is a smooth round pair of shoulders, and on his right his head runs on under the neck as the ball it is, so a tilted head lifts off a smooth shoulder on one side and lays its own round cheek over the notch on the other. L and R are the viewer's left and right: L is his near wing.
- **The engine:** `apps/dashboard/src/lib/cawco/caw-rig/motion.ts` (the skill's `track`, `flow`, `seg`, `wave`, `loop`, `bell`, `seeded`, plus `sway`, a wave that reads 0 at t = 0, and `LoopClock` on requestAnimationFrame). Its curves are the house's (`cawco/motion/curves.svelte.ts`).
- **Poses, props and idle life, as data:** `caw-rig/poses.ts`. **The solver:** `caw-rig/rig.ts` (pose + idle + follow-through + accent to each layer's matrix). **The component:** `caw-rig/CawRig.svelte` (`pose`, `idle`, `size`, `scheme`, `label`).
- **Preview and proof:** `design-previews/caw-rig/` (built by `apps/dashboard/scripts/caw-rig-preview.vite.ts`), proved by `scripts/probe-kit/specs/caw-rig-preview.ts`.
- **Existing animated pieces:** the status files `caw/*.riv`, traced from Backlot takes (README.md). They are reference for his motion only; the rig does not read them.

### The owner's rules
- 2026-10-25, on this skill: "why don't u use this to create a proper, high quality rig for cawco that you can reuse?" The brief that followed: one drawing split at its pivots, a pose is numbers on it, his anatomy can't break (rounds of raster edits gave him four wings, shrunken wings, a hidden eye, comic faces), and he breathes, blinks and glances and never freezes.
- His look never changes: "His design and proportions never change" (PERSONALITY.md). Frame 0 of the ready pose is his still, within 2% of its alpha bounds and centre of mass at 160 px.
- Eyes: "Never a lid tweening half-closed, never squinting or heavy-lidded (owner, on a squint: 'looks like he's high on weed')" (PERSONALITY.md). So a pose's `lid` is always 0: only a blink closes his lids, closing in 110 ms, held 40, reopening in 190 on ease-out, and the lower lid rises 15% to meet the upper.
- "His beak stays a clean, visible black shape, never hidden behind a prop" (PERSONALITY.md): a held prop never crosses his beak.
- Calm: "earnest, a bit dopey, trying very hard ... Calm underneath: he is never hyperactive", and "using animations randomly, too hyperactive, and looping between them, very jarring" (PERSONALITY.md). The `calm` idle is the default; `attentive` is for when the person has something to attend to.
- Props: "one flat pale cream with a thin black outline, the same pale cream as paper" (PERSONALITY.md); the rig's are paper (`--paper`) over a black shape of their own.
- Night: his rim is the house's paper rim, as wide as one device pixel or the kit's 5.31 units, whichever is wider (README.md, Contract).

### Rig limits
- **Wings are a spread wing, drawn once.** The shoulder reads from about 25 (folded at his side) to about 145 (raised); the primaries curl within ±30 from under the coverts; past that a feather's hidden root shows. A raised near wing's black merges with his head (there are no inner lines in his look), so a raised wing reads by its fan. The far wing raised goes behind his head; keep it under about 130.
- **No inner lines.** Black parts overlap black parts: a cut never shows because it always runs through his black, and every part under a neighbour runs on 4 units past the cut.
- **The face turns in 2.5D only.** `yaw` slides the beak 13% of his head's width, the eyes 10%, the tuft 9% the other way; his outline does not change. Past about ±0.4 the far eye leaves its place.
- **The beak opens by its lower half only** (`beak`, degrees, about 17 at most before the lower beak's root shows past his face). There is no ^^ smile and no closed-eye drawing other than the blink's crescent; they would be new shapes in `rig.py`.
- **Props are never faded.** A held prop comes out from under the coverts (tucked at the primaries' root at 0.6 of its size, hidden by his black) and goes back the same way; a standing prop rises from 120 units below the ground line, which clips it; the same prop in two poses travels from one place to the other as one object.
- **The body shifts and breathes; it does not lean or squash** (no hop or landing yet). The legs turn from the hips so his feet stay planted.
- **His idle loops must close.** Every period divides the loop's, and a glance ends before the loop does; the probe holds both.

### How changes are checked
- `uv run rig.py` in `assets/mascot/scripts/` after any change to the cut: it prints frame 0 against the still and fails past 2% at 160 px.
- `bun scripts/probe-kit/run.ts caw-rig-preview` after rebuilding the preview (`bun apps/dashboard/scripts/house-faces.ts`, then `bunx vite build --config scripts/caw-rig-preview.vite.ts` in `apps/dashboard`): anatomy in every pose, frame 0, loop closure, the clock scrubbed, a pose change that travels, reduced motion, nothing running unseen, the night rim, his open beak, the held phone (upright, under the primaries) and every prop's coming and going, on Chromium and WebKit. `CAW_RIG_SHOTS=<dir>` writes each pose at 64, 96 and 160 px, by day and by night, for an anatomy reader; the committed set is `rig/shots/` (`<day|night>-<pose>.png`, Chromium, frame 0).
- `bun run check` for types, lint and formatting.
- Not seen yet: a phone's Safari, and a 120 Hz screen.

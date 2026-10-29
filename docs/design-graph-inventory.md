# The design graph on main: inventory

What the parked design-graph build is once it sits on main, for the next build spec. Read from this branch's code; every claim names its `file:line`. Paths are from the repository root.

## Headline

| Primitive | State | One line |
|---|---|---|
| 1. Live stage at a CSF story | **Exists** | The canvas page mounts every story of the `.stories.ts` through the project's own toolchain and shows the kept story's frames only; the others stay mounted, hidden. |
| 2. Step slider over a sequence of states | **Missing** | The dock scrubs time inside one move; nothing steps from state to state. Main's phone step strip and J/K stepping were deleted with the old chrome. |
| 3. Overview graph of states and arrows | **Exists** | dagre-laid slabs, nodes, variation chips and arrows, derived from the stories plus the agent's `group` and `edges`. |
| 4. Data controls over real records | **Partial** | Generic dials (number, color, select, toggle) on a CSS variable or a story arg. No record source, no count, no longest-names. |
| 5. Pins anchored to a state's name | **Partial** | A pin records the kept state's path as a string beside its element anchor. It is not anchored to the state, and nothing filters pins by state. |

The build mounts the real component everywhere. The hand-drawn page (`formHtml`/`rowHtml`) exists only in the round-29 mock-up the branch carries under `.mockups/design-graph/`.

## 1. What the graph panel is

- **Artifact kind.** It is the `component` artifact (the component canvas). The pane builds a `DesignGraph` whenever `artifact.kind === "component"` (`apps/dashboard/src/lib/cawco/preview/PreviewPane.svelte:1386`, `:3464`) and draws `GraphPanel` over the page unless Map is on (`PreviewPane.svelte:4356-4362`). There is no separate kind and no route of its own. It lives in the preview pane, wherever that pane opens: beside a session or the artifact's own tab.
- **How an agent opens it.** `artifact_create({ kind: "component", name, does: "judge", ask, file, edges?, group?, dials? })`. `file` is a CSF 3 states file, or a list of them. `group` maps a story to its parent story or to a machine heading. `edges` is `[{ from, to, label? }]`. `dials` is the agent's controls (`packages/hub/src/artifacts/tools.ts:98-139`, the shape at `packages/hub/src/artifacts/component.ts:36`). The hub writes `edges`, `group` and `dials` into the canvas's spec (`component.ts:62-69`; `CanvasSpec` at `packages/core/src/stage.ts:448`). The skill's steps name the graph (`packages/hub/skills/component-canvas/SKILL.md:21-25`).
- **Where its data comes from.** The canvas page builds it from the **states files** plus the spec. It is never drawn from an artifact payload of states. The page sends `GraphModel` (`packages/core/src/design-graph.ts:48`) on `cawco:graph` (`packages/agent/src/stage-host/canvas/runtime.ts:2454-2470`). That model holds each section's stories as the loaded module has them, the interactions each story's CSS reaches, each `from`+`play` move, and the spec's `group` and `edges`. The overlay relays it (`packages/agent/src/preview-overlay/page.ts:2910`). The pane bounds it (`apps/dashboard/src/lib/cawco/preview/wire.ts:439`). `graphOf` derives machines, states, variations and links (`packages/core/src/design-graph.ts:159`). The doc comment says these are "never declared twice" (`design-graph.ts:7-9`).
- **The loop.** A hover calls `preview` (`apps/dashboard/src/lib/cawco/preview/graph/design-graph.svelte.ts:267`, from `StateGraph.svelte:446`). A press or Enter calls `keepAt` (`design-graph.svelte.ts:258`, from `StateGraph.svelte:484`). Each one posts `cawco:stage` with the kept point, the previewed point, the kept state's path in words, and the room the panel and dock take (`design-graph.svelte.ts:328-349`; `StageAsk` at `design-graph.ts:70`). The overlay passes the message on (`page.ts:2935-2958`), and the canvas runtime stands what it asks (`runtime.ts:3081-3100`). Per session, the panel keeps the kept state, the panel and dock sizes and the edits in localStorage (`design-graph.svelte.ts:66-103`, `:568`).
- **Its parts** (`apps/dashboard/src/lib/cawco/preview/graph/`):
  - `GraphPanel.svelte`: the shell. On a desk it is a floating panel at the page's inline end; on a narrow pane it is one drawer at the foot with Graph and Timeline faces (`:67`, `:755`). It holds component tabs, zoom, Hide (a tucked tab), edge resize and `ResizeHandle` arcs. It reports the room it takes to the page (`:149-160`).
  - `StateGraph.svelte`: the graph (`:2-16`). `graph-layout.ts`: dagre layout (`:1-10`).
  - `GraphDials.svelte`: the agent's dials, shown under the graph (`GraphPanel.svelte:487`).
  - `MoveDock.svelte`, `ClipControls.svelte`, `clip-words.ts`, `KindGlyph.svelte`, `CurveGlyph.svelte`: the dock.
  - `GlassGroup.svelte`, `symbol.ts`: bar items. `ResizeHandle.svelte`: the corner arc.
  - The pane's store is `design-graph.svelte.ts`; the shared model and maths are `packages/core/src/design-graph.ts`; the words are `packages/core/src/words/design-graph.ts`.
- **What it took from main.** The inspector no longer picks a story. The kept state picks it (`PreviewPane.svelte:3474-3485`), and `cawco:story-select` is gone (`apps/dashboard/src/lib/cawco/preview/sheet-inspector.svelte.ts:22-27`). The canvas's own chrome is deleted: its head, outline, J/K stepping, phone step strip, count line and DialKit timeline and dials. `canvas/chrome.ts` is now only the page's sheet (`packages/agent/src/stage-host/canvas/chrome.ts:1-9`). DialKit is no longer bundled into the stage host (`packages/agent/src/stage-host/build.ts:145-165`, `host.ts:255-262`).

## 2. The five primitives

### 1. Live stage at a CSF story: exists

- It mounts the real component. Each frame is mounted with `adapter.mountStory(body, specFor(section, name, args))` (`runtime.ts:1477-1500`). The spec comes from the states file's CSF exports (`csfOf`, `argsOf`, `specFor`, `runtime.ts:1418-1475`). The adapters are each framework's own mount (`packages/agent/src/stage-host/host.ts:789-880`). It runs in the project's own Vite/Astro/Nuxt, served by main's stage host at `CANVAS_PATH` (`packages/core/src/stage.ts:30`; `host.ts:1000`, `:1320`).
- **"The stage" is the old grid with everything else hidden.** Once a pane asks, `<html data-cawco-staged>` hides every frame not marked `data-cawco-on-stage`, along with section heads and labels (`chrome.ts:97-99`). `markStage` marks the kept point's frames, one per scheme × width column, and makes every other frame inert (`runtime.ts:2985-3021`). `stage()` loads the point's section, places the view on what it stands, washes and plays the kept move (`runtime.ts:3030-3064`). Before any ask, the page stands every frame, because the render report and the stage's own render read the grid (`runtime.ts:547-553`).
- It reads the states file's module (`SectionModule.SHEET`) and the CSF args. It reads no records and no routes. A screen is a story whose component is the screen.

### 2. Step slider over a sequence of states: missing

- What exists is the dock's ruler and playhead. They scrub time inside the one move into the kept state (`MoveDock.svelte:97`, `:481-512`; `design-graph.svelte.ts:418-430` `seek`). The page holds the move's animations at that moment (`packages/agent/src/stage-host/canvas/moves.ts:258`, `:325`).
- Nothing steps from one state to the next. Main had two pieces of state stepping in its canvas chrome: J/K stepping through frames, and a phone strip of back/ahead story buttons (`git show origin/main:packages/agent/src/stage-host/canvas/chrome.ts`, lines 471, 486 and 743). The series deleted both with the chrome.

### 3. Overview graph: exists

- `graphOf` turns the stories plus `group` and `edges` into machines (slabs), states (nodes), variations (chips: grouped stories, or an interaction the CSS reaches), and links. A link is either a move (a story's `from` with a `play`) or an agent edge. `between` lists the machines that lead into one another (`design-graph.ts:110-131`, `:159-263`).
- Layout is dagre (`@dagrejs/dagre`, already a dashboard dependency) from the moves alone, with regions led into one another (`graph-layout.ts:1-10`, `:95`, `:121`, `:276`). `StateGraph.svelte` draws it with zoom, pan and an edge fade (`:2-16`).
- Its reach is one component per tab: one states file is one tab. Page-to-page flows are not modelled. Cross-file `edges` (`file:Story`) are dropped from a section's graph (`design-graph.ts:135-142` `inSection`).

### 4. Data controls over real records: partial

- Dials are the agent's `CanvasDial` list (`packages/core/src/stage.ts:415-424`): number, color, select or toggle, aimed at `{ cssVar }` or `{ arg }`. `GraphDials.svelte` draws them under the graph (`:1-8`, `:44-84`). A change goes `design-graph.svelte.ts:558` `dial` → `cawco:dial` (`page.ts:2969`) → `runtime.ts:3175`. `applyDials` sets the CSS variable on every frame or passes the arg through every frame's `update` (`runtime.ts:3114-3144`). The values go to the artifact as `dials` (`runtime.ts:3194`).
- What's missing: a dial on an `arg` changes whatever the story does with that arg, and the agent's fixture inside the states file is its only data. Nothing reads real records. There is no count slider bound to a record set and no longest-real-names toggle.

### 5. Pins anchored to a state's name: partial

- A pin placed while a state is kept records `state`, the kept state's path in words (machine › state › variation) (`packages/core/src/comments.ts:329-334`). The pane sends the path with each ask (`design-graph.ts:291` `pathOf`). The overlay holds it (`packages/agent/src/preview-overlay/stage-path.ts:1-15`, set at `page.ts:2949`) and writes it onto new comments and pins (`page.ts:2479`, `pins.ts:1329-1334`). The pin card shows "Left on …" (`apps/dashboard/src/lib/cawco/preview/PinCard.svelte:580-588`, `words/design-graph.ts:102`). The agent reads "Left while the design graph kept …" (`packages/hub/src/presenters/artifacts.ts:689`).
- The anchor is still the element: selector, source, and `sheet: { file, story, state }` (`comments.ts:192-209`). `state` is a label, not an anchor. Pins don't hide or filter when another state is kept, and a pin can't be placed on a node.

## 3. The dock, clips, washes and pins today

- **Dock** (`MoveDock.svelte:2-17`). It shows while the move into the kept state animates (`GraphPanel.svelte:708-750`; in the drawer it is the Timeline face). The page plays the kept move in the kept frame and holds each animation it fired (`moves.ts:1-10`, `MoveStage` `:258`, created at `runtime.ts:3066`). It sends `MoveModel` on `cawco:move` (`design-graph.ts:420`; `wire.ts:514`). The head has Original | Edited, Reset, play and loop. Bars drag, snap to the page's duration tokens (⌥ frees them) and replay on drop (`MoveDock.svelte:205-240`). Edits go back as `cawco:move-ask` (`design-graph.svelte.ts:379-430`, `:546`) and are stored on the artifact as `tuned`, each value marked as a token or ad hoc (`runtime.ts:3076`; `TunedClip` `design-graph.ts:455`).
- **Clips.** One animation the move fired: element in words, property, start, length, easing, `file:line:column` source (`design-graph.ts:379-395`). Its kind (opacity, position, size, colour, text, unfold) comes from the property (`design-graph.ts:354` `kindOfClip`) and has its own glyph and hue (`KindGlyph.svelte`, tokens `c-clip-*`). `ClipControls.svelte` opens in the row with a length slider (token detents) and curves (easing tokens, Spring, Custom bézier, as written) (`:2-13`). Springs and `linear()` maths live in `design-graph.ts:492-766`.
- **Washes** (`packages/agent/src/stage-host/canvas/washes.ts:1-20`). While a hover previews a state of the same file, each previewed frame is compared with the kept frame of its own column, and a wash marks what came in, changed or went (`runtime.ts:2938-2969`; `washesBetween` `washes.ts:233`, `drawWashes` `:252`). They are drawn in the page's world layer with `--diff-add-bg` and `--diff-del-bg` (`chrome.ts:103-108`). Nothing else: no wash for agent changes or audits.
- **Pins.** Main's pins, plus `state` as in primitive 5. The skill tells the agent that a pin carries the path (`SKILL.md:24`).

## 4. What main already gives that the graph could use

- **The stage** (`.design-foundations/plans/2026-10-16-live-components.md` §2, lines 38-68). One stage per workspace, run by the project's own toolchain, serving `/@cawco/sheet` and the canvas at `/@cawco/canvas` with HMR. The graph's stage already *is* this stage's canvas page. What it doesn't use is a page that mounts a single story: it stands one story by hiding the rest of the grid (§2.1 above).
- **CSF sheets.** States files are read and written in place (`packages/agent/src/stage-host/story-file.ts:1-8`), and props come from docgen (`packages/agent/src/stage-host/docgen.ts`). The sheet inspector edits a story's args per prop and saves them back (`apps/dashboard/src/lib/cawco/preview/sheet-inspector.svelte.ts:32`; page side `runtime.ts:3221`). This is a ready, typed control surface over a story's args. Data controls (primitive 4) could drive args through it instead of free-form `dials`.
- **`design_map`** (`packages/hub/src/artifacts/tools.ts:348-362`). It lists the project's components, their states and frames drawn, what each is made of and used in, and a component's card (props, stories, moves, call sites). It is a source for which states files exist and how components relate: the tier above one component that a flow would need.
- **The component canvas** (Projects §5.10 "The component canvas"; `runtime.ts:1-20`). It provides the render report every tool answers from (`reportNow` `runtime.ts:2541`), frame pictures (`pictureOf` `:3505`), the decision page's `Preview` embeds (`by=embed`, `chrome.ts:109-126`, `runtime.ts:1522-1612`) and Map mode (`apps/dashboard/src/lib/cawco/preview/map/`). The graph sits over it and keeps all of these.

## 5. The old canvas (the grid of frames), file by file

Everything the grid is, on this branch. The graph's stage reuses frame mounting, columns and probes. The render report, pictures, embeds and Map read the grid. Those are the consumers a cutover must re-home before deleting.

- `packages/agent/src/stage-host/canvas/runtime.ts`. Sections, one per states file, lazily loaded and slept (`:1020-1240`, `showSection` `:1779`, `nearView` `:1883`, `sleepSection` `:1866`). Columns are scheme × width × interaction, laid out by interaction when staged (`slotsOf` `:1256`, `columnsOfSection` `:1376`, `heads` `:1394`). Frames (`frameFor` `:1310`, `placeFrame` `:1351`, `syncFrames` `:1723`). Stand-ins (`:1063-1190`). Pan and zoom of the world (`:2598-2868`, `go` `:2852`). The pane's view: scheme, width, motion, zoom (`setView` `:3250`, `fit` `:3300`). Probes and moves read off screen (`:1985-2384`). The report (`:2541`) and pictures (`:3401-3610`).
- `packages/agent/src/stage-host/canvas/chrome.ts`. `PAGE_CSS`: well, sections, section heads and failures, grid, frames, stand-ins, stage hiding (`:97-99`), washes, embed layout (`:109-126`). `dressPage` (`:141`).
- `packages/agent/src/stage-host/canvas/width.ts`, `viewport.ts`, `pseudo.ts`, `measure.ts`, `play.ts`, `scheme.ts`. Per-frame width, floating-layer viewport, forced interaction states, engine reads and CSF `play`. The stage needs each of them whatever replaces the grid.
- `apps/dashboard/src/lib/cawco/preview/canvas-view.svelte.ts` (`:1-9`) and `CanvasView.svelte`. The head's view menu: Map, Scheme, Width, reduced motion, Zoom to fit, Zoom to 100%, Verify (`CanvasView.svelte:52-86`). It posts `cawco:canvas-view` to the grid. The `PreviewPane.svelte` wiring is at `:3446-3460` and `:3828-3836`.
- `apps/dashboard/src/lib/cawco/preview/map/` (`CanvasMap`, `MapCard`, `MapNode`, `MapFit`, `MapThumb`). Map mode is a separate surface from the grid, but its cards draw the grid's frame thumbnails from the report.
- Words and tokens for the grid: `c-canvas-skeleton-w` and `-h`, and DESIGN.md "A component canvas's page and its design graph" (`DESIGN.md:938`).

## 6. Hand-drawn pages

- **In the build: none.** Every frame the stage stands is the story mounted through the framework adapter (`runtime.ts:1490`; adapters `host.ts:789-880`). Stand-ins (`runtime.ts:1063`) are skeletons that hold a frame's place until it mounts. They are not pages. Washes and moves read the mounted DOM (`washes.ts:56-66`, `moves.ts:89-110`).
- **In the mock-up the branch carries: yes, as the 10-29 fit study says.** `.mockups/design-graph/app.js:330` stands the page by `formHtml(...)` (`:378`) or `rowHtml(...)` (`:410`) from a fields object. The built copy is the same, at `.mockups/design-graph/page.html:6395`, `:6443` and `:6475`. `.mockups/` is excluded from lint and format (`biome.jsonc:39-41`, `.prettierignore`). It is reference material for the drawing, not product code.

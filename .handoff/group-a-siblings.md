Sibling briefs: facts per site (from main after group A lands)

Shared for every sibling:
- Grace: already done by the kit. `.kit-skeleton` holds its box unseen for --dur-wait-grace, then fades in over --dur-fade (app.css). Add no timer anywhere.
- **A timer-then-skeleton site carries its wait into the skeleton.** Any skeleton mounted after its wait has started (a timer that waited first, rows let go at the grace, a count that arrives late, a host's wait handed to a child) attaches `{@attach carriesWait(since)}` (motion/curves), `since` being that wait's real start in `performance.now()`, so it never waits the grace twice. The attachment reckons once, as the skeleton is drawn; never put the reckoning in a `style` expression that re-runs. Never hand the wait to a wrapper whose other skeletons are not part of that wait (PreviewPane takes it as `waitingSince` on its cover alone).
- Arrival: wrap the skeleton in an element with `out:crossOut`, or `crossOutWith(node, () => ({ bottom: "0" }))` when it fills a flex share. Wrap what arrives in an element with `in:crossIn`, created in the same `{#if}` switch (a local `in:` inside a child component created with its parent doesn't play). Its offset parent is `position: relative`.
- Last box: "the box it last drew in, else the box it draws in" goes through storage.ts `readJson`/`writeJson` (precedent: blocks/kept-bodies.ts, keyed per project, page and block; config/cards.ts). Where the hub can measure the shape off the request path it does (DecisionsView: `GET /api/decisions/shapes` + the `decisions.changed` frame, kept in client state, never on a hub-owned row); an unknown shape means that piece of the skeleton does not stand.
- Proof: add legs to your own spec file on scripts/probe-kit/skeleton-swap.ts (`holdRead` + `watchSwaps` + `proveSwap`, or `revisit` as in specs/web/skeleton-swaps.ts). HTTP reads are held with `holdRead(page, /regex/)`. A socket-pushed state is held with playwright's `page.routeWebSocket` (no kit helper yet; add one beside holdRead).

B: tasks (project page, ?task=<id>)
- tasks/TaskPane.svelte:580 body, :462 meta.
  - Read: readTask, GET /api/projects/:pid/tasks/:tid (HTTP).
  - Size: the pane's head band plus the details' rows. The meta line is --c-btn-h-sm. Measure the real Details layout; DESIGN's list recipe is 44px rows (--c-row-h).
- tasks/TaskOutput.svelte:142.
  - Read: readOutputText, GET the task's output url (project-tasks.ts `outputUrl`).
  - Size: unknown until read. Use the last box per task+output, else three lines of the body's type.
- tasks/TaskActivity.svelte:272.
  - Read: readHistory, GET /api/projects/:pid/tasks/:tid/history.
  - Size: rows of the activity stream (the `.stream` row recipe).
- tasks/StagesControl.svelte:196.
  - Read: readTemplates, GET /api/stage-templates.
  - Size: a template row = name in label plus chain in meta (two 1lh lines plus padding).
  - Popover: open it from the project head.
- project/FolderFile.svelte:80.
  - Read: GET /api/projects/:pid/folder/file?path=.
  - Size: last box per path, else the file body's first lines.

C: usage (/usage)
- usage/History.svelte:299.
  - Read: GET /api/usage/summary?harness=&groupBy=start&since= (two reads, claude and opencode).
  - Size: the chart body. Its height comes from the chart's token; find it in the body's CSS. Today it is h-24.
- usage/WhereItGoes.svelte:536.
  - Read: GET /api/usage/summary?harness=&groupBy=&since=.
  - Size: the list's row pitch (the `.list` rows). Today it is h-6 ×5.
- usage/ProjectSpend.svelte:222/225.
  - Read: `cawco.project(...)` read in its $effect (find the URL there).
  - Size: tiles are already --c-stat-h. The chart is h-48 today; take the real chart's token.
- usage/LimitsBlock.svelte:187.
  - Read: `usage.read && cawco.usageLimitsRead`, which is socket-pushed. Hold it with routeWebSocket.
  - Size: the rings grid and its cards.

D: config, workflows, features
- routes/(app)/config/skills/+page.svelte:456.
  - Read: versions, skillHistory, GET /api/fleet/skills/history?name=.
  - Size: PreviousVersions rows.
- routes/(app)/config/skills/+page.svelte:539.
  - Read: marketplaceCatalog (find its URL).
  - Size: listing rows. Today h-10.
- workflows/WorkflowEditor.svelte:673 and workflows/WorkflowRunView.svelte:243.
  - Read: workflowState (lib/cawco/workflow-state.svelte.ts), socket-pushed.
  - Size: the editor's tab panes and the run's 26px step rows.
- features/DirectoryPicker.svelte:213.
  - Read: `folders.list(machineId, path)` over the fleet's socket.
  - Size: rows are already 30px; only the arrival (it uses `drill`) and the grace apply.
- tool-cards/MemoryBody.svelte:189.
  - Read: memoryVersion, GET /api/fleet/memory/history/:id.
  - Size: the well (ToolProse). Last box, else its lines.
- transcript/DelegateTail.svelte:365.
  - Read: the branch's hydration (`branch.loading || branch.hydrating`), a socket backfill.
  - Size: three rows of the tail's row recipe.
- preview/SheetInspector.svelte:221.
  - Read: `inspector.sheet`, posted by the page in the frame. Hold it by holding the preview page's serve.
  - Size: rows are already at prop-row size.
- transcript/Shot.svelte:301.
  - Read: the image's own load. Hold it with page.route on the image url.
  - Size: the intrinsic frame. It already is.
- features/DiffView.svelte:165.
  - Read: the highlighter's first load. Hold it with page.route on its chunk.
  - Size: `expected` px. It already is.
  - Arrival: its own shared-cell fade over --dur-control. Prove it is equivalent, or move it to crossIn/crossOut.
- Sidebar.svelte:684 pending groups.
  - Read: each machine's group is its own read (the fleet socket).
  - Fix: a per-group skeleton at that group's size, then crossIn/crossOut when that machine answers.
- find/Finder.svelte:690.
  - Read: per machine (names ask, then the everywhere ask). The grace is now the kit's.
  - Arrival: data-flip rows. Prove or move to crossIn per section.
- home/WorkTabs.svelte:810 and routes/(app)/workflows/+page.svelte:143.
  - Already graced (the kit) and cross-faded. Add a leg each to prove it.
  - WorkTabs read: home.ready (socket). Workflows read: workflowState.loaded (socket).

E: views (agent-authored)
- Rule: "the box it last drew in, else the box it draws in". Keep through storage.ts per project and view, as blocks/kept-bodies.ts does. BlockPage `reading` already gives a view's block its kept body height on the Routines page.
- views/ViewOpenUi.svelte:88.
  - Read: OpenUiRenderer `pending` until each Query answers. Its queries run viewTool, POST /api/projects/:pid/views/... (find it in ViewOpenUi `tools`).
  - Size: the view's last drawn box, else its block's box.
- routes/(app)/project/[id]/+page.svelte, views list `awaiting`.
  - Read: viewsOf (GET the project's views).
  - Size: the named view's last box.
  - Where: "awaiting", now at the `{#if shown === "awaiting"}` branch in `viewPane` (it was :2091).
- routes/(app)/project/[id]/+page.svelte, a view tab whose view isn't found yet (was :1721).
- routes/(app)/project/[id]/+page.svelte, empty board while Caw's view is read (was :1773).
  - Read: lead.view (caw-lead.svelte.ts).
  - Size: the empty state's last box, else the block's.
- routes/(app)/project/[id]/+page.svelte, fallback (calendar before `dated`) (was :1866).
  - Read: readDated (viewTool "tasks").
  - Size: the calendar's box.
- routes/project/[id]/view/[name]/+page.svelte:88.
  - Read: the view's read in its $effect.
  - Size: last box, else the page.
- routes/(app)/project/[id]/+page.svelte `viewPane`, a slow switch to another project (`leavingFor`, then `reading` past the grace).
  - Now: on every tab (Decisions, Routines, Memory, a view) the pane stands the board's skeleton (`data-board-reading`) and says `data-view="board"`: a board's box over a tab that is not the board.
  - Read: the route's load (projects, agents, tasks, stages: `+page.ts`), which holds the page on the old project until it answers.
  - Size: the open tab's own box: its last box for this tab, else the box it draws in. This stands on the page being left (the shell mounts a new page per project, Shell `pageKey`), so it is the leaving project's tab whose box it takes. The page landed on hands the switch's start to the views drawn with the landing (`landedFrom`, from the module's `switching`; DecisionsView takes it as `waitingSince`); a tab's skeleton here carries `readingFrom` the same way (`carriesWait`).
  - Proof: a leg like skeleton-swaps 9 (the board's slow switch), on each tab, holding the switched-to project's tasks read.

Already compliant after group A: FilesList and ArtifactCards, PinList, MentionMenu, SuggestionChips. The project board-skeleton (reading) and the Finder's late skeleton waited the grace twice (a timer, then the kit) and were fixed in group A by the rule below; the PreviewPane cover carries a host's wait through its `waitingSince` prop.
Transcript veil: kept as is, and stated in DESIGN.md as the exception.

## Reveal round (transitions.dev Skeleton loader and reveal), from group A, parked mid-way

The primitive is on this branch (motion/curves `revealIn`, `revealOut`, `revealOutWith`, `revealsWhen`; tokens `--dur-skeleton-reveal` 400ms, `--skeleton-reveal-blur` 2px, `--skeleton-pulse-min` 0.5, `--ease-crossfade` reused; the kit bar's pulse in app.css). Every group's skeleton swaps adopt the pair: the skeleton block's root a layer carrying `out:revealOut`, the content block's root `in:revealIn`; crossIn/crossOut stay for swaps that are not skeletons.

- B–E: each group lists its own skeleton swaps (the skeleton handing its place to the list, its "nothing" line, the empty state or a fault line) and moves them onto the pair. A fault or empty state outside the skeleton's own if-chain never plays the skeleton's local out: flatten the chain (as DecisionsView, FilesList here).
- CanvasMap.svelte (:330, :440–451): while the map is read it shows a text line ("Reading the canvas's map"), not a skeleton at the map's size, and the map replaces it with no cross-fade (freeze review 533a4574). CanvasMap.svelte:445 `animation: kit-fade-in 1ms` is a raw duration.
- PreviewPane.svelte:2944 `.cover > * { animation: kit-fade-in 1ms … }`: a raw duration, and it overrides the kit bar's own animation, so the cover's bar never pulses. The cover → frame swap is a class-toggled CSS opacity transition at --dur-control (`.cover.ready`), not the reveal: same group.
- Jump (Finder.svelte waiting list :780–800 and find list skeleton items :696; MentionMenu.svelte:118): their skeleton rows hand over through motion/rows `reflow` (the skeleton slots carry `data-flip`), whose own cross-fade is not the reveal. Open in group A.
- `skeleton-sheen` (cawco.tokens.json:1618, cawco.dark.tokens.json:1404) stays until the SkeletonView.swift item deletes it with its last reader, `Palette.skeletonSheen` (Tokens.swift:252, SkeletonView.swift:37). The web sweeps are gone (app.css, packages/agent stage-host canvas chrome.ts).

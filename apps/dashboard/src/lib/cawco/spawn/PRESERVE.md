# New Session Preservation Record

This is a literal record of the current implementation contracts. A re-skin may change presentation only if it preserves the behavior, measurements, containment, and state transitions below.

## 1. Mounting

- `NewSessionDialog` is a controlled `bits-ui` dialog. `open` and `onclose` are required props (`NewSessionDialog.svelte:71-83`), and its root is `<Dialog onOpenChange={(value) => { if (!value) { close(); } }} {open}>` (`NewSessionDialog.svelte:609`). The local wrapper passes through to `DialogPrimitive.Root bind:open` (`components/ui/dialog/dialog.svelte:2-7`).
- Its overlay and content are portaled: `<DialogPortal>` wraps `<DialogOverlay>` and raw `<DialogPrimitive.Content>` (`NewSessionDialog.svelte:610-674`); the wrapper is a `DialogPrimitive.Portal` (`components/ui/dialog/dialog-portal.svelte:2-7`). The scrim is fixed at z-index 80 and the card at 81 (`NewSessionDialog.svelte:677-701`). The Dialog primitive remains responsible for modal focus trapping and document scroll locking; do not replace it with an in-flow conditional container.
- The dialog uses the raw primitive Content so it can retain its custom geometry and timeline-bound inline styles. It prevents automatic focus, explicitly focuses the textarea, and is inert until `timeline.interactive.started` (unless reduced motion is active) (`NewSessionDialog.svelte:615-620`).
- Composer popovers are separately portaled Bits UI popovers: `ComposerPopover` uses `<Popover>` / `<PopoverTrigger>` / `<PopoverContent>` (`ComposerPopover.svelte:51-89`), and `PopoverContent` wraps `PopoverPrimitive.Content` in `PopoverPortal` (`components/ui/popover/popover-content.svelte:19-30`; `components/ui/popover/popover-portal.svelte:2-7`). Their z-index is 90 (`ComposerPopover.svelte:129-145`).
- The authoring route creates the dial timeline and controls unconditionally, with persistent development IDs: `createDialTimeline(... { autoplay: false, id: "new-session-open-v4", persist: import.meta.env.DEV })` (`routes/motion/new-session/+page.svelte:20-50`) and `createDialKit(... { id: "new-session-params-v3", onAction: replay })` (`routes/motion/new-session/+page.svelte:51-69`).
- `DialRoot` and `DialTimeline` mount only when `desktop.current`, where `desktop = new MediaQuery("(min-width: 481px)")` (`routes/motion/new-session/+page.svelte:15-18,118-121`), each with `productionEnabled` (`routes/motion/new-session/+page.svelte:119-120`). The modal itself mounts at every viewport width.
- `replay()` always sets `open = true`, replays the timeline, and immediately seeks to the endpoint under reduced motion (`routes/motion/new-session/+page.svelte:70-77`). A subscription watches both DialKit and timeline stores, compares serialized values, and debounces `replay` by 120 ms (`routes/motion/new-session/+page.svelte:81-102`). Preserve this replay-on-any-control-or-timeline-change mechanism.
- The route is client-only: `export const ssr = false` (`routes/motion/new-session/+page.ts:1`).
- Reduced motion is respected at every layer: card/scrim/row styles use end states (`NewSessionDialog.svelte:248-259,611-620`); Spring `.set` calls pass `instant: prefersReducedMotion.current` (`ComposerBar.svelte:115-124`, `ComposerPopover.svelte:42-48`, `ComposerEffort.svelte:52-55`, `ModelPicker.svelte:167-203`, `ModePicker.svelte:38-43`, `LocationPicker.svelte:351-383`); and the route eliminates remaining animation/transition durations while a `.session-card` exists (`routes/motion/new-session/+page.svelte:123-130`).
- The root `patchedDependencies` registers `dialkit@2.0.0` at `patches/dialkit@2.0.0.patch` (`package.json:45-49`). The patch converts DialKit's panel/timeline/controller store snapshots to `$state.raw` and changes timeline metadata updates to skip identical metadata, avoiding subscriber re-entry/update loops (`patches/dialkit@2.0.0.patch:5-12,18-25,33-40,46-84`). Preserve the patch and its package registration while the route uses DialKit.

## 2. State Preservation

- Opening is a deliberate reset boundary. On every `open` transition, the dialog captures the active element as `opener`, derives prefill/project/machine/cwd, restores `harness` and `permissionMode` from `spawnPrefs`, then resets `model = ""`, `effort = null`, `prompt = ""`, `repo = undefined`, `editing = false`, `sideQuest = false`, `worktree = false`, `saveAsProject = false`, `busy = false`, `error = ""`, `popover = null`, and `verifiedLocation = ""` (`NewSessionDialog.svelte:296-336`). Close/reopen therefore does not preserve an abandoned draft.
- The open effect cleanup increments `submission` and restores focus to `opener` (`NewSessionDialog.svelte:337-340`). `close()` increments it again before calling the parent handler (`NewSessionDialog.svelte:441-444`). `start()` captures `id = submission` and its `current()` predicate requires both `open` and the unchanged generation (`NewSessionDialog.svelte:496-513`). Every async boundary uses that predicate after verification, project creation, and exit animation (`NewSessionDialog.svelte:516-537,571-595`). This is cancellation-on-close; stale requests may never spawn or navigate.
- Submission inputs are snapshotted before any async work in the `draft` object: `machineId`, trimmed `baseCwd`, `workdir`, prompt, harness, permission mode, model, effort, scratch, repo, project ID, save-as-project, and resolved `usedModel` (`NewSessionDialog.svelte:499-513`). Do not read mutable form state after the first await.
- `spawnPrefs` persists under localStorage key `cawco-spawn-prefs` (`spawnPrefs.svelte.ts:13`). Stored fields are `machineId?`, `cwd?`, `harness`, `model`, `permissionMode`, and `effort` (`spawnPrefs.svelte.ts:15-27,95-113`). Defaults are `{ harness: "claude", model: "", permissionMode: "default", effort: null }` (`spawnPrefs.svelte.ts:29-34`). It is written only after `spawnSession` is called (`NewSessionDialog.svelte:553-561`; `spawnPrefs.svelte.ts:95-111`), so cancellation teaches no preference.
- Despite being persisted, model and effort are intentionally not restored into an opening form. Open restoration destructures only `{ harness, permissionMode }` (`NewSessionDialog.svelte:311-315`). The last submitted machine/cwd is restored only without a prefill, only after both `inspectMachine` and `machineFs(..., "list", ...)` succeed, and only while the generation, initial machine, empty cwd, and no-popover conditions remain current (`NewSessionDialog.svelte:325-369`).
- Model-use history is distinct localStorage state: key `${MODEL_STORAGE_PREFIX}:use`, concretely `cawco-models:use` (`modelUse.svelte.ts:3,11-14`; `models.svelte.ts:20-22`). `recordModelUse` writes each harness's `lastSpawnAt` and, when nonempty, `lastUsedAt[id]` after the spawn call (`modelUse.svelte.ts:16-25`; `NewSessionDialog.svelte:553-554`). A mere selection or a cancelled dialog does not update it.
- Changing harness clears selected `model` and `effort` (`NewSessionDialog.svelte:260-264`). When the selected machine changes, an unavailable preferred harness falls back to its first installed harness or `claude` (`NewSessionDialog.svelte:265-278`). Invalid effort is cleared when capabilities/model support change (`NewSessionDialog.svelte:279-286`); an invalid permission mode falls back to the first enabled mode (`NewSessionDialog.svelte:287-295`).
- Bootstrap is represented by `repo !== undefined`. Enabling it sets `repo = ""`, clears project linkage, marks editing, seeds `cwd ||= "~"`, and opens the location popover; disabling returns `repo` to `undefined` (`NewSessionDialog.svelte:650`). It is not a separate persisted preference.
- Untouched model remains internal `""` and is omitted from the wire payload; untouched effort remains `null` and is omitted (`NewSessionDialog.svelte:544-545`; `SPEC.md:49`). The effort UI shows the harness-measured model default; when unmeasured, it shows high where supported or the first supported level (`NewSessionDialog.svelte`, `effortShown`).

## 3. Containers And Layout-Shift Workarounds

### Fixed desktop geometry

`NewSessionDialog.svelte:685-701` fixes the modal's visual containment:

```css
:global(.session-card) {
  position: fixed;
  z-index: 81;
  top: 50%;
  left: 50%;
  translate: -50% -50%;
  width: 640px;
  max-width: calc(100vw - var(--space-4));
  max-height: calc(100dvh - var(--space-4));
  overflow-y: auto;
  padding: var(--space-2);
  border-radius: var(--radius-modal);
  background: var(--surface-raised);
  box-shadow: var(--shadow-modal);
  outline: none;
  transform-origin: center;
}
```

- The composer remains one fixed-height row above 600px: `height: 40px; flex-wrap: nowrap; width: 100%` (`ComposerBar.svelte:278-286`); its Start slot is `flex: none; margin-left: auto` (`ComposerBar.svelte:333-336`). The button itself is 40px tall (`ComposerBar.svelte:326-332`).

```css
.composer-bar {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  height: 40px;
  gap: var(--space-1);
  width: 100%;
}
.effort-slot {
  flex: 1;
  min-width: 150px;
}
.effort-collapse {
  width: 150px;
  opacity: 1;
  transition:
    width var(--c-300) var(--e-out),
    opacity var(--c-100) var(--e-out);
}
.effort-collapse.collapsed {
  width: 0;
  opacity: 0;
  overflow: hidden;
}
.start-slot { flex: none; margin-left: auto; }
```
- The reading/error slot reserves a fixed `var(--space-5)` height, remains one line, and ellipsizes rather than changing card height (`NewSessionDialog.svelte:705-714`):

```css
.reading {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  height: var(--space-5);
}
```

- Unsupported effort collapses inside a reserved `flex: 1; min-width: 150px` slot; the inner 150px container transitions to zero width/opacity with `overflow: hidden`, preserving the bar's alignment and Start anchoring (`ComposerBar.svelte:310-325`).
- The prompt is height-clamped by actual computed line height and its own scroll height. It starts by clearing height, then sets the max of minimum rows and min of content/max rows (`PromptWell.svelte:19-31`):

```ts
element.style.height = "0px";
element.style.height = `${Math.max(minRows * line + inset, Math.min(element.scrollHeight + 2, maxRows * line + inset))}px`;
```

It reruns on `ResizeObserver` width changes (`PromptWell.svelte:35-48`) to prevent text reflow from leaving a stale height.

### Popover containment and non-shifting layout

- Popovers are portals, so opening them never inserts height into the composer. The content is constrained to the viewport with `collisionPadding={8}`, a max width, available-height cap, and internal overflow (`ComposerPopover.svelte:62-88,129-145`):

```svelte
<PopoverContent collisionPadding={8} side="top" sideOffset={7} trapFocus ...>
```

```css
:global(.composer-popover) {
  width: min(var(--popover-width), calc(100vw - var(--space-5)));
  max-height: min(440px, var(--bits-popover-content-available-height));
  overflow: hidden;
}
```

- Picker interiors establish flex/scroll containment with `min-height: 0` before `overflow: auto`: model list (`ModelPicker.svelte:369-410`) and location picker/panes (`LocationPicker.svelte:616-670`). This prevents a list from expanding the portaled panel or moving the dialog.
- Travelling selection highlights are absolutely positioned (`ModelPicker.svelte:420-438`, `ModePicker.svelte:75-87`, `LocationPicker.svelte:671-689`) and measured after `tick()`, rather than taking layout space. Initial measurement is instant and the highlight fades in only after it has a measured row (`ModelPicker.svelte:138-164`; `LocationPicker.svelte:340-387`).
- Model, location, and metadata labels must stay on one visual line in their compact rows. The trigger's span rule is `min-width: 0; overflow: hidden; text-overflow: ellipsis` (`ComposerPopover.svelte:108-112`); model names and dates explicitly use `white-space: nowrap` (`ModelPicker.svelte:475-493`), and location names/metadata do likewise (`LocationPicker.svelte:723-737`).

### Mobile bottom sheet and keyboard containment

- The document viewport opts into content resizing for virtual keyboards (`app.html:6-9`):

```html
<meta content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" name="viewport">
```

- On phones (`max-width: 640px`) the card is the kit Drawer (`#lib/components/ui/drawer`, vaul): a bottom sheet with safe-area bottom padding that follows the finger from its header and dismisses on vaul's distance (25%) or flick (0.4 px/ms) thresholds. The kit Drawer keeps it inside the visible viewport: it publishes `visualViewport`'s `offsetTop` and `height` on the sheet as `--visible-top` and `--visible-height`, and `app.css` rests the sheet on the bottom of that area, capped at the smaller of it and the sheet's `--drawer-max-height`. Above a keyboard the header and Start stay on screen and the body scrolls. vaul's `repositionInputs` is off in the kit.
- The mobile prompt may scroll within `min-height: 0`, and textarea height is capped against the measured visible viewport minus 160px and safe area (`NewSessionDialog.svelte:735-750`).
- Mobile popovers become full-viewport fixed panels in the same measured viewport. Their shell fixes top/left/right/width/height and their content has safe-area top/bottom padding and its own vertical scroll (`ComposerPopover.svelte:151-177`):

```css
.composer-popover-shell {
  position: fixed !important;
  top: var(--ns-viewport-top, 0px) !important;
  left: 0 !important;
  right: 0 !important;
  width: 100% !important;
  height: var(--ns-viewport-height, 100dvh) !important;
}
```

- At mobile widths the composer changes to two fixed 44px rows with an 8px gap (`ComposerBar.svelte:386-399`). The first row horizontally scrolls instead of truncating controls; it has no scrollbar, inline overscroll containment, 16px scroll padding, and each pill is `flex: 1 0 auto` (`ComposerBar.svelte:400-411`):

```css
.settings-row {
  overflow-x: auto;
  overscroll-behavior-inline: contain;
  scrollbar-width: none;
  scroll-padding-inline: 16px;
}
.settings-row::-webkit-scrollbar { display: none; }
.settings-row :global(.composer-pill) { flex: 1 0 auto; }
```

- Mobile labels are allowed to reach 22ch before ellipsis, rather than being reduced to icons (`ComposerBar.svelte:374-385`). All primary controls become at least 44px; effort reserves at least 160px and Start at least 96px (`ComposerBar.svelte:367-459`).

## 4. Animations

### Spring conversion

Every local Svelte `Spring` takes a visual-duration/bounce spec through the shared conversion (`motion.ts:1-13`):

```ts
export function springFromVisual(spec: SpringSpec): { stiffness: number; damping: number } {
  const frequency = (2 * Math.PI) / spec.visualDuration;
  return {
    stiffness: frequency ** 2 / 3600,
    damping: (2 * frequency * (1 - spec.bounce)) / 60,
  };
}
```

### DialKit controls and defaults

- Timeline ID `new-session-open-v4`, duration `1.1`: scrim at `0`, 0.3s opacity 0 to 1 with easing `[0.16, 1, 0.3, 1]`; card at `0.04`, 0.32s opacity 0/scale 0.96 to opacity 1/scale 1 with a zero-bounce spring; rows at `0.06`, 0.28s opacity 0/y 6 to opacity 1/y 0 with a zero-bounce spring; focus and interactivity both begin at `0.5` with zero duration (`routes/motion/new-session/+page.svelte:20-49`). The card receives timeline opacity/scale and mobile derives `--sheet-enter` from card opacity (`NewSessionDialog.svelte:615-620`); rows are staggered by the `open.rowStagger` control (`NewSessionDialog.svelte:234-259`).
- `open.rowStagger = [0.024, 0, 0.1, 0.002]`: offsets rows 1 through 6 after the prompt's row 0 (`routes/motion/new-session/+page.svelte:54`; `NewSessionDialog.svelte:248-259`; `ComposerBar.svelte:136-275`).
- `toggle.thumb = { type: "spring", visualDuration: 0.26, bounce: 0 }`: springs both Scratch and Bootstrap switch thumb positions 0 to 14px (`routes/motion/new-session/+page.svelte:55`; `ComposerBar.svelte:113-124,247-263`).
- `pop.open = { type: "spring", visualDuration: 0.2, bounce: 0 }`: animates popover progress from opacity 0/scale .96 to opacity 1/scale 1 (`routes/motion/new-session/+page.svelte:56-59`; `ComposerPopover.svelte:40-48,62-70`).
- `pop.rowStagger = [0.014, 0, 0.05, 0.002]`: delays model initial rows, location rows, and mode rows (`routes/motion/new-session/+page.svelte:56-59`; `ModelPicker.svelte:166-203`; `ModePicker.svelte:57-70`; `LocationPicker.svelte:507-529,566-585`).
- `swap.spring = { type: "spring", visualDuration: 0.24, bounce: 0 }` and `swap.stagger = [0.018, 0, 0.08, 0.002]`: on a harness change, old model rows leave left at `index * swapStagger`, then the replacement list enters from the right at `index * swapStagger`; initial normal-list arrival instead uses the pop row stagger (`routes/motion/new-session/+page.svelte:60-63`; `ModelPicker.svelte:112-133,166-203`).
- `list.highlight = { type: "spring", visualDuration: 0.22, bounce: 0 }`: drives model, location machine rail/directory, and mode travelling hover/keyboard highlights (`routes/motion/new-session/+page.svelte:64`; `ModelPicker.svelte:60,138-164`; `LocationPicker.svelte:67-69,340-387`; `ModePicker.svelte:37-43`).
- `slider.thumb = { type: "spring", visualDuration: 0.22, bounce: 0 }`: drives the effort thumb's selected detent position (`routes/motion/new-session/+page.svelte:65`; `ComposerEffort.svelte:49-55,114-120`).
- `replay = { type: "action" }`: invokes the route's `replay` action (`routes/motion/new-session/+page.svelte:66-69`).

### Other animation contracts

- The modal's exit before navigation is a Web Animations API scale `1` to `.98`, opacity `1` to `0`, lasting `--c-300` or 1ms under reduced motion, then `close()` and `goto` only if the submission generation remains current (`NewSessionDialog.svelte:571-595`).
- Model-list swap has both directional staggers. `direction = 1`, `leaving = true`, and a timer waits `swapSpring.visualDuration + min(rows.length - 1, 12) * swapStagger` before replacing `shown` (`ModelPicker.svelte:112-133`). Each row's `enter` action uses `translateX(8px)` for entry, `translateX(-8px)` for exit, staggered opacity, and zero delay/endpoints when reduced motion is set (`ModelPicker.svelte:166-203`).
- Model and location highlights measure selected row `offsetTop`/height after `tick`, snap on their first measurement (`instant: firstMeasure`), then use absolute transforms and `highlight-in` opacity (`ModelPicker.svelte:138-164,420-438`; `LocationPicker.svelte:340-387,671-689`). Mode's highlight uses the same spring along its 40/44px row rail (`ModePicker.svelte:32-51,75-87`).
- CSS-only motion that must remain: effort collapse width/opacity (`ComposerBar.svelte:314-325`); model-list opacity/transform (`ModelPicker.svelte:411-419`); mode row opacity arrival (`ModePicker.svelte:88-127`); location row opacity/y arrival (`LocationPicker.svelte:690-706,852-867`); focus/color transitions on prompt/search (`PromptWell.svelte:75-88`; `SearchField.svelte:43-57`). All have reduced-motion overrides where applicable.

## 5. Submission

- The Start button is disabled when `busy`, dialog-level `disabled` (hub unreachable, unreadable location, or unverified location), or any popover is open (`ComposerBar.svelte:266-273`; `NewSessionDialog.svelte:636-640`). `start()` repeats hard guards for busy/popover/hub state (`NewSessionDialog.svelte:487-490`), so a programmatic keyboard path cannot bypass the disabled button.
- Validation blocks an open location picker, missing machine, blank bootstrap repo, blank cwd, unreadable directory, and an unverified location (`NewSessionDialog.svelte:422-440`). It does **not** reject an empty prompt; an empty prompt starts the session but `spawnSession` sends no separate prompt frame because it checks `prompt?.trim()` (`client.svelte.ts:2833-2872`). Cmd/Ctrl+Enter routes to `start()` from the window and textarea (`NewSessionDialog.svelte:597-608`; `PromptWell.svelte:51-59`).
- Directory readability is verified before spawning with both `inspectMachine(id, path)` and `machineFs(id, "list", path)` (`NewSessionDialog.svelte:462-485,516-523`). `inspectMachine` POSTs `/api/agents/:machineId/inspect` (`fleet.ts:454-466`), while `machineFs` sends an `fs` websocket request with `{ requestId, op, path, content }` (`client.svelte.ts:3308-3319`).
- The exact `spawnSession` call is (`NewSessionDialog.svelte:538-552`):

```ts
spawnSession({
  machineId: draft.machineId,
  cwd: draft.cwd,
  prompt: draft.prompt,
  harness: draft.harness,
  permissionMode: draft.permissionMode,
  ...(draft.model ? { model: draft.model } : {}),
  ...(draft.effort ? { effort: draft.effort } : {}),
  scratch: draft.scratch,
  bootstrap: draft.repo === undefined
    ? undefined
    : { repo: draft.repo, baseDir: draft.baseCwd },
  projectId: toAttach,
});
```

- If `saveAsProject` is true and no project is attached, `createProject({ machineId, cwd, name: basename(cwd) })` completes before spawn (`NewSessionDialog.svelte:524-537`). `createProject` POSTs `/api/projects`, refreshes the registry, and returns the generated project (`client.svelte.ts:3323-3341`). Preserve this order.
- `spawnSession` generates `instanceId`, sends a `spawn` websocket frame whose payload contains the other fields, creates local session state, then sends a separate prompt `send` frame only when the prompt trims nonempty (`client.svelte.ts:2810-2829,2833-2872`).
- The headless checker blocks real hub access by routing `/ws/dashboard`, collects every outbound websocket frame in `frames`, and replies locally only to `fs`/`control` requests (`scripts/new-session-checks.mjs:41-81`). `spawns()` filters `frame.verb === "spawn"` (`scripts/new-session-checks.mjs:216`); API writes other than the simulated project endpoint are fulfilled as 403 (`scripts/new-session-checks.mjs:82-106`).

## 6. Data Sources

- `cawco.machines`, `cawco.projects`, `cawco.instances`, and `cawco.catalogOf(machineId)` are reactive getters over the dashboard client state (`client.svelte.ts:4995-5004,5018-5023,5053-5059,5050-5052`). The state is seeded by GET `/api/agents`, `/api/instances`, `/api/projects`, and related endpoints during `refresh()` (`client.svelte.ts:843-885`).
- Location picker search combines all-machine project records, recent non-scratch/non-project stored session cwd values sorted by `lastModified`, and current-machine filesystem browse results (`LocationPicker.svelte:78-125,150-178`). Repository mode reads `machineControl(id, "listRepos")`, then permits a typed repo/URL (`LocationPicker.svelte:214-252,392-425,455-465`).
- The model catalog prefers each machine's harness report (`machine.harnesses[].models`) and uses live session `supportedModels()` calls only for harnesses without a report (`models.svelte.ts:201-235`). One previously unasked live session per harness is tried in batches until one answers; results are saved under `cawco-models:by-harness` (`models.svelte.ts:47-60,105-199`). `ensureModels(harness)` starts this asynchronous refresh when a picker is used; manual refresh clears the asked-session set and retries (`models.svelte.ts:265-304`).
- Model release dates come from `ModelInfo.released`: deduplication gathers the model group's dates and keeps the latest (`model-entries.ts:76-98`). Model canonical ID is always `resolvedModel ?? value`; aliases merge into that entry (`model-entries.ts:65-100`).
- Harness installation is read from the selected machine's `harnesses` report, filtering `entry.installed`; the picker renders all harnesses but disables missing ones with a machine-specific screen-reader reason (`NewSessionDialog.svelte:137-149`; `ModelPicker.svelte:261-282`).
- Display names are canonical-ID-derived, not CLI aliases. `modelName` strips provider prefix and `claude-`, title-cases known families, merges numeric tokens, and changes `[1m]` to ` · 1M` (`model-entries.ts:23-63`). Thus `claude-opus-5[1m]` renders `Opus 5 · 1M`; aliases such as `default` and `opus` remain only searchable aliases (`model-entries.ts:84-97,152-155`; `SPEC.md:42-49`).
- Ordering is exact: entries released after a harness's last spawn are `New`; remaining used entries are `Recent` descending `lastUsedAt`; the rest are `All` descending `released` with undated entries last; remembered typed IDs are `Typed` only if not covered by catalog aliases (`model-entries.ts:102-150`). Custom IDs are persisted under `cawco-models:recent`, newest first, capped at five (`models.svelte.ts:20-28,361-378`).

## 7. Verification

- Run the dashboard dev server with `bun run dev:dashboard` from the repository root (`package.json:13-17`) or `bun run dev` from `apps/dashboard` (`apps/dashboard/package.json:6-11`). Then run `bun apps/dashboard/scripts/new-session-checks.mjs http://localhost:5173`; the script defaults to that URL when no argument is supplied (`scripts/new-session-checks.mjs:7-14`).
- The checker asserts: centered 640px desktop card; 40px bar; initial prompt focus and eight rows; canonical model naming/deduplication/default badge; all three harness logos; card and Start geometry unchanged through harness changes; two-row mobile sheet/keyboard containment at 390x844, 390x500, 600x800, and 320x568; readable-or-eight-character labels; 44px targets; 96px Start; 160px effort; full-viewport mobile panels; full-width equal agent tiles; horizontal settings-row scrolling; release metadata relative to last use; four mode rows/bypass tint/two switches; bidirectional model staggering; desktop/mobile popover containment; canonical/typed/untouched/scratch payloads; location-popover gating; invalid path block; cancellation during delayed verification; keyboard tab order; effort detent centering; Bootstrap payload and installed-harness fallback; light/dark polish geometry; reduced-motion endpoints; and optional pixel-identical desktop screenshot comparison (`scripts/new-session-checks.mjs:295-897`). Any page error increments failures and the process exits nonzero (`scripts/new-session-checks.mjs:899-907`).
- `NS_CHECK=<substring>` filters to matching check labels (`scripts/new-session-checks.mjs:204-215`). `NS_DESKTOP_BASELINE=1` captures `/tmp/ns-desktop-before.png`; `NS_DESKTOP_COMPARE=1` compares it byte-for-byte with `/tmp/ns-rest.png` before and after the complete suite (`scripts/new-session-checks.mjs:325-339,889-897`).
- Run project type checks with `bun run typecheck` (`package.json:25-27`); dashboard-only typecheck is `bun run typecheck` in `apps/dashboard` (`apps/dashboard/package.json:6-11`). Biome is provided through root `bun run lint`, while changed files can be checked with `bun run lint:changed` (`package.json:19-21,38-43`).
- The documented development deploy flow is push to `main`: `cawco deploy init` creates `~/.cawco/app`, installs dependencies, builds the dashboard, writes the deployment marker, and installs services pointing at that clone (`packages/cli/src/cli.ts:68-80`; `packages/cli/src/service.ts:1644-1652,1741-1778`). The optional developer poller runs every 60 seconds, and an eligible clone fetches, fast-forwards, reinstalls, rebuilds, and restarts (`.unlazy-liveness/gates/c1.md:5-8`; `packages/agent/src/deploy.ts:47-52`; `packages/cli/src/cli.ts:409-428`). The production dashboard service starts `~/.cawco/app/apps/dashboard/build/index.js` (`.unlazy-liveness/gates/c1.md:25-31`) and the live hub dashboard is served at `http://localhost:3000` (`.unlazy-liveness/gates/c2.md:52`). The approximately 100-second rebuild duration is operational guidance, not a timing constant in the checked source.

## Modal-Relevant Tokens

The dialog reads the root tokens in `app.css` directly; `DESIGN.md` lists them
(surfaces, ink, radius, type roles, shadows, scrim, curves, durations). Only the
dialog's own motion tunables (`--ns-*-ms`, staggers, distances) stay in
`ns-theme.css`.

## Must-Keep Checklist

- Keep the controlled Bits UI dialog, portal, overlay, raw content primitive, focus trap/scroll lock, z-indexes, and `onOpenChange -> close()` wiring. `NewSessionDialog.svelte:609-675`.
- Keep the `submission` generation increment on close/cleanup and current-generation checks after every asynchronous step. `NewSessionDialog.svelte:337-340,441-444,496-537,571-595`.
- Keep the open-reset boundary and restore only harness/permission mode plus verified saved location; do not revive an abandoned form draft. `NewSessionDialog.svelte:296-369`.
- Keep `cawco-spawn-prefs` and `cawco-models:use` as separate stores, each written only after an actual spawn. `spawnPrefs.svelte.ts:13-34,95-113`; `modelUse.svelte.ts:11-25`; `NewSessionDialog.svelte:553-561`.
- Keep empty model/effort omitted from payload while the effort UI still displays a harness default. `NewSessionDialog.svelte:544-545`; `ComposerEffort.svelte:40-48`.
- Keep fallback to an installed harness whenever a machine switch makes the current harness unavailable. `NewSessionDialog.svelte:265-278`.
- Keep the 640px centered desktop card, card viewport bounds, fixed 40px desktop composer, fixed reading slot, 150px effort reservation, and right-anchored Start. `NewSessionDialog.svelte:685-714`; `ComposerBar.svelte:278-336`.
- Keep popovers portaled and constrained by collision padding/available height; picker internals must stay scroll-contained. `ComposerPopover.svelte:51-89,129-145`; `ModelPicker.svelte:369-410`; `LocationPicker.svelte:616-670`.
- Keep the visualViewport variables, bottom-sheet geometry, safe-area padding, mobile full-viewport popovers, two 44px rows, and horizontally scrolling settings row. `NewSessionDialog.svelte:85-110,715-759`; `ComposerPopover.svelte:151-177`; `ComposerBar.svelte:367-459`.
- Keep canonical model IDs/names, `[1m] -> " · 1M"`, aliases only for search, and New -> Recent -> All -> Typed ordering. `model-entries.ts:23-63,65-155`.
- Keep machine-reported models preferred over `supportedModels()` session queries, and preserve the one-session-per-harness query walk. `models.svelte.ts:47-60,105-235,265-304`.
- Keep pre-spawn dual location verification, all Start gates, and create-project-before-spawn ordering. `NewSessionDialog.svelte:422-485,487-569`; `client.svelte.ts:3308-3341`.
- Keep the exact `spawnSession` payload shape, the separate trimmed prompt send, and post-spawn preference/model-use writes. `NewSessionDialog.svelte:499-561`; `client.svelte.ts:2810-2872`.
- Keep every DialKit default, timeline sequence, 481px DialKit panel threshold, and 120ms replay subscription. `routes/motion/new-session/+page.svelte:15-102,111-121`.
- Keep spring conversion, bidirectional model swap stagger, measured travelling highlights, effort/switch springs, and reduced-motion endpoints. `motion.ts:1-13`; `ModelPicker.svelte:112-203`; `ComposerEffort.svelte:49-55`; `ComposerBar.svelte:113-124`; `NewSessionDialog.svelte:248-259,571-595`.
- Keep the headless checker's local websocket/API interception and its desktop, mobile, payload, cancellation, containment, motion, and screenshot assertions. `scripts/new-session-checks.mjs:41-106,295-907`.

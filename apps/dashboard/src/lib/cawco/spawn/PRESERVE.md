# New Session Preservation Record

This is a literal record of the New Session form's implementation contracts as built. A re-skin may change presentation only if it preserves the behavior, measurements, containment, motion, and state transitions below. Each contract is cited by the file and the symbol, selector or prop that carries it (`File.svelte` `name`), never by line: line numbers went stale with every edit. Files are in this folder unless a path says otherwise; `Form` is `NewSessionForm.svelte`.

## 1. Mounting

- The form is one component, `NewSessionForm` (its logic and markup; its frame draws the surface), rendered by the one frame the Shell mounts for every opener and every Continue (`new-session.svelte.ts` `spawning`, `newSession`): `NewSessionPopover`. An opener passes its trigger (`newSession(prefill, anchor)`: the rail's Start session, the session strip's "+", a project's Spin off, Fork from here); one with none (the shortcut, a `?spawn=` link, Continue) hangs it from the rail's Start session (`data-start-session`), or under the bar's leading edge where the rail is a sheet. The form takes `open` and `onclose`, with optional `prefill`, `continueFrom`, `restore` and `onexitcontinue`; the frame calls its exported `close()` when dismissed, `escapeStep()` on Esc, and `focusPrompt()` as it opens.
- `NewSessionPopover`, above 640px, is the kit popover hanging from its trigger, `c-new-session-pop-w` wide (569px: the narrowest the form's own rows hold one line at), capped at the room under the trigger (the kit popover's `width="room"` and `height="room"`, the room taken a frame after floating-ui says so: glide-popover `popoverRoom`); it recesses (its `look="new-session"`, `surface-recess`) under the form's raised body. It holds nothing (DESIGN.md, The Open Page Rule): no scrim, no blur, the page live beside it. At 640px and below it is `NewSessionDialog`, the kit Drawer (vaul) bottom sheet, with the same wiring.
- The primitives own dismissal; do not replace them with an in-flow conditional container. Both prevent automatic focus: the prompt takes it as the popover opens and it goes back to whatever held it; the sheet opened with no trigger holds it itself (the keyboard waits for a tap in the prompt). The popover stands on the float layer (`--layer-float`).
- The popover's height is the kit popover's own; the phone sheet's height is the kit drawer's.
- Every chip popover in the form shares one portaled bits-ui surface, `NsPopoverGroup` (Form's `<NsPopoverGroup>`; `NsPopoverGroup.svelte`): opening a sibling glides the surface to the new trigger instead of closing one popover and opening another. `NsPopover` is the trigger and, outside a group, its own portaled popover. Popovers stand on the float layer, `--layer-float` (`components/ui/glide-popover/index.ts` `glidePopoverVariants`).
- The dialog's motion was first tuned with a dial panel (commit `07a1782a`) on an authoring route. That route and its dependency are gone: `routes/(app)/motion/new-session/+page.svelte` only opens the Shell's form (`newSession`). The tuned motion lives in CSS and root tokens (§4).

## 2. State Preservation

- Opening is a reset boundary. On every `open` transition the frame captures the active element (or its trigger) as `opener`, and the form (its `open` effect) seeds project, machines and cwd from `continueFrom`, `prefill`, the project's primary checkout or the machine it last started on (`rememberedMachine`), takes `harness` from the fork's own or `spawnPrefs.harness` (`openingHarness`), and resets the mode pick, the summariser, `estimate`, `model = ""`, `effort = null`, `account = null`, `repo = undefined`, `editing = false`, `spinOff` from `prefill.spinOff`, `clean`, `error = ""`, `popover = null`, `verifiedLocation = ""` and the move's state. Then it applies, in this order, the picks of the parked start the form shows (`parkedStart`, `applyPicks`), else the picks the form was left on when it was opened with the same `prefill` and `continueFrom` (`keptPicks`, tab storage `cawco:new-session-form`, kept as they change), else `prefill.prompt` as the first prompt. A failed start's Reopen (`reopenStart`) opens the form on that parked start's picks and prompt.
- The first prompt outlives a reload and a dismissal: it is a `ComposerDraft` (`firstMessage`) kept in the draft store by `keepDraft` under this tab's own key (`keptKey`, minted once into sessionStorage at `KEPT_KEY`), or under the parked start's `parkKey` while the form shows one, and read back as the form opens. It is discarded on Cancel (`cancel`), and once a start has begun (`start`) and left for its session (`exitTo`); `close()` keeps it.
- A start belongs to its work, not to the form: `start` parks it (`beginStart`, `spawn/parked.svelte.ts`) and runs it there, so closing the form (`close`: ×, Esc, a press outside) drops nothing, and the start goes on as its own row. `submission` is the form's read generation: the open effect's cleanup, `close`, `cancel`, `start` and `exitTo` increment it, and `loadEstimate`'s `current()` requires it unchanged (and the same `carry`), so a continuation's size read that lands after the form moved on is dropped. Only Cancel ends a running continuation (`cancelContinue`, the hub stops the job).
- Submission inputs are snapshotted before any async work in the `draft` (`SessionDraft`, built in `start` from `picks()` plus the prompt and its `extras`): machines, trimmed `baseCwd`, `workdir`, harness, permission mode, model, effort, scratch, `clean`, repo, project, summariser, `usedModel`, the account when one was picked and a move's source. Do not read mutable form state after the first await.
- `spawnPrefs` persists under localStorage key `cawco-spawn-prefs` with `harness`, `model`, `permissionMode` and `effort` (`lib/cawco/spawnPrefs.svelte.ts` `KEY`, `load`); nothing remembered is `FALLBACK`, `{ harness: "claude", model: MODEL_DEFAULT, permissionMode: null, effort: null }`: the form opens on the hub's last chosen mode for its machine and harness (AgentRow `chosenModes`, the hub's `chosen_modes`), else this one; with neither, on no mode, its permission chip reads "Choose a mode", and Start waits for one (`modeUnchosen`), saying so beside it (`startHeld`, core `spawnWords.held`). `rememberSpawn` writes it only once a spawn, fork, move or continuation has gone out (Form `remember`, called by `start`, `startMoving`, `startContinue`), so a cancelled form teaches nothing. Opening takes only the harness from them (the permission mode is the hub's, else `spawnPrefs.permissionMode`: `lastMode`): model and effort are never restored, and where a session runs is not a preference beyond the machine (`rememberMachine`).
- Model-use history is separate localStorage state, `cawco-models:use` (`modelUse.svelte.ts`, here; the key's prefix is `models.svelte.ts` `MODEL_STORAGE_PREFIX`). `recordModelUse` writes the harness's `lastSpawnAt` and, when nonempty, `lastUsedAt[id]`, from `remember` after the spawn (and a continuation's summariser model). A selection alone does not update it.
- Changing harness clears `model`, `effort` and `account` (`chooseHarness`). When the first machine changes and the current harness is not installed there, the form takes its first installed harness (the `lastMachine` effect). An effort the chosen model cannot reach is cleared (the `stops` effect). A permission mode the machine does not take is never swapped for another: its reason stands beside Start, which waits for a mode it takes (`modeRefused`). Picking a model clears effort (ModelSection's `onmodel`).
- Repository mode is `repo !== undefined`. Choosing it sets `repo = ""` (or keeps a typed one), clears the project, marks editing and seeds `cwd ||= "~"`; choosing a directory returns `repo` to `undefined` (LocationChip's `onmode`). It is not a persisted preference, but the picks the form is left on are kept with the rest (`keptPicks`).
- Untouched model stays `""` and is omitted from the payload; untouched effort stays `null` and is omitted (`spawnOne`). While effort is untouched the effort chip shows the model's measured default, or "Default" when none is known (`effortShown`; `ToolChips.svelte` `tools.effort`).

## 3. Containers And Layout-Shift Workarounds

### Desktop geometry

`NewSessionPopover`'s surface (the kit popover's content, `data-ns-popover`) hangs from its trigger on the float layer, `--pop-w` wide (`min(var(--c-new-session-pop-w), 100vw - 1.5 × --space-8)`) and capped at `--pop-max-h` (the room under the trigger, less 2px), on `bg-surface-recess` (its `look="new-session"`), the form's body raised on it.

- The head and the footer are `flex: none`; the body between them is `flex: 0 1 auto; min-height: 0; overflow: auto`, so a capped card or popover scrolls its body and keeps Close and Start in view (Form `[data-slot="body"]`; `SessionFooter.svelte`). The body's flex basis must stay `auto`: a zero basis collapsed the card to its padding in WebKit.
- The body carries the house edge fade, `.kit-edge-fade-block` (Form `[data-slot="body"]`; `app.css` `.kit-edge-fade-block`): while it scrolls, the edge with more behind it fades over `--fade-len`, and a body that fits fades neither. macOS hides overlay scrollbars, so this edge is the capped form's one sign that it scrolls.
- The model panel is ModelSection's `[data-slot="picker"]`. No global rule may style it: Config's PickerChip once styled a bare `.picker`, and once Config had loaded the panel came out 32px tall, its rail centred against the list, and pressed to `--press-scale` by any press inside it.
- Scrolling the body closes an open popover rather than leaving it detached from its chip (Form `bodyScroll`).
- The reading line under the composer (`data-slot="reading"`) is one `type-meta` line that never wraps and ellipsizes (`truncate`), and shows a non-breaking space when empty, so a message never changes the card's height. A move's line takes two (`data-two`), its height following through `readingMorph`.
- The prompt editor is a contenteditable whose height is `--c-row-h` (44px) at rest and `--c-prompt-grown-h` (120px) while engaged, filled or showing its `@`/`/` menu (`grown`), eased over `--dur-pop` on `--ease-in-out` above 640px (`PromptEditor.svelte`). On phones it is a fixed 120px with no transition.
- The composer chips are 30px and wrap; on a coarse pointer their rows open to 14px apart so every chip's touch area reaches 44px (Form `[data-slot="chips"]`).
- Start keeps `--c-btn-min-w` (96px) as its minimum width and the footer stays right-aligned (`SessionFooter.svelte`).

### Popover containment

- Popovers are portaled, so opening one never inserts height into the form. The shared surface is anchored below its trigger with `side="bottom"`, `sideOffset={6}` and a `collisionPadding` of `screenInset()`, `--space-5`, or `--c-screen-margin` on phones (`NsPopoverGroup.svelte`; `NsPopover.svelte`; `popover-group.svelte.ts`).
- The surface caps its width at `min(var(--ns-pop-width, var(--c-pop-w)), 100vw - var(--space-8))` (`--c-pop-w` 320px) and its height at `min(var(--c-pop-max-h), room)` (`--c-pop-max-h` 440px; room: `--ns-pop-room`, else `--bits-popover-content-available-height`), scrolls inside, and lays its content in one `grid-cols-1` column so a wide row shrinks rather than overflows (`components/ui/glide-popover/index.ts` `glidePopoverVariants`). While it glides between triggers its height tweens to its content's (`morph`, `--dur-pop`, `platform/motion/morph.svelte.ts`; `NsPopoverGroup.svelte`).
- On phones a popover stays anchored to its chip, wider and shorter: `100vw - 2 × --c-screen-margin` (24px) by `min(--c-pop-max-h-phone, 55dvh, room)` (`--c-pop-max-h-phone` 420px), and on a coarse pointer its buttons are `--c-nav-h` (44px) tall (`glidePopoverVariants`, `max-phone:` and `coarse:`).
- The model list is part of the form, not a popover: a list of `--c-model-list-h` (300px) that scrolls vertically only, so the swap's sideways slide (`--pop-rise`) never flashes a horizontal scrollbar (`ModelSection.svelte` `[data-slot="list"]`). Model names and metadata stay on one line and ellipsize.

### Mobile bottom sheet and keyboard containment

- The document viewport opts into content resizing for virtual keyboards: `app.html`'s head script makes the viewport meta, and on Chromium and Gecko (the engines that read the key; WebKit logs an error for it) its content is

```html
width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content
```

- On phones the card is the kit Drawer (`#lib/components/ui/drawer`, vaul): a bottom sheet with rounded top corners and safe-area bottom padding that follows the finger from its header and dismisses on vaul's distance or flick thresholds (`NewSessionDialog.svelte`'s `DrawerContent`, `data-session-card`). The kit Drawer keeps it inside the visible viewport: it publishes `visualViewport`'s `offsetTop` and `height` on the sheet as `--visible-top` and `--visible-height`, and `app.css` rests the sheet on the bottom of that area, capped at the smaller of it and the sheet's `--drawer-max-height`. Above a keyboard the header and Start stay on screen and the body scrolls (`touch-action: pan-y; overscroll-behavior: contain`). vaul's own keyboard repositioning is off in the kit.
- On phones the sheet is the kit's one bottom-sheet recipe: its surface full-bleed with the hairline on the top edge only, its foot padded `1rem` plus the safe area (`ui/drawer/drawer-content.svelte`), its head the kit sheet head (Close, then the title in the title role, floating over the body, which fades under it as it scrolls; `ui/drawer/sheet-head.ts` `sheetHeadVariants`), and the form straight on the sheet with no card of its own. The form's one title is the head's ("New session", "Continue session", "Fork session"; Form `headTitle`).

## 4. Animations

### Opening choreography and tuned values

Durations, curves and scales are root tokens (`design/tokens/cawco.tokens.json`, built into `lib/tokens/tokens.css`): `--ease-out` `cubic-bezier(0.23, 1, 0.32, 1)`, `--ease-in-out` `cubic-bezier(0.77, 0, 0.175, 1)`, `--ease-drawer` `cubic-bezier(0.32, 0.72, 0, 1)`, `--dur-ghost` 80ms, `--dur-control` 120ms, `--dur-toggle` and `--dur-exit` 160ms, `--dur-morph` 180ms, `--dur-fade` 200ms, `--dur-pop` 260ms, `--dur-panel` 280ms, `--press-scale` 0.97, `--pop-scale` 0.92, `--pop-rise` 8px. The form's own names for them are the `--ns-*-ms` in `ns-theme.css` `.ns-theme`.

- Popover (desktop): the kit popover's own (ui/popover's content, DESIGN.md's popover motion), from the trigger's side `--pop-rise` off and `--pop-scale` small, over `--dur-pop` on `--ease-drawer`, and back over `--dur-exit`.
- Card (phones): the kit Drawer's sheet, leaving over `--dur-exit` on `--ease-out` instead of vaul's 500ms slide (`app.css`, on `data-ns-dialog`'s closed state).
- Sections arrive with `ns-in` (opacity 0, `translateY(var(--pop-rise))`; `lib/tokens/theme.css` `@keyframes ns-in`, the `ns-in` utility in `ns-theme.css`) over `--dur-pop` on `--ease-out`, delayed by `--delay` (Form's sections, `animate-ns-sec`): the prompt at once, then each next section a `--dur-stagger` later (each section's `--delay`, motion `staggered`).
- Leaving for the new session: `exitTo` hands the Start button's place (`data-share="session:new"`, `SessionFooter.svelte`) to the new session's tab and closes the form before navigating, so its exit plays over the page arriving.
- Popovers: enter with `ns-pop-in` from `--pop-scale` and `--pop-rise` over `--dur-pop` on `--ease-drawer`, leave with `ns-pop-out` to `--pop-scale` over `--dur-exit`, and glide between sibling triggers on `--dur-pop`/`--ease-drawer` (`lib/tokens/theme.css` `@keyframes ns-pop-in`, `ns-pop-out`; `glidePopoverVariants`). A retargeted surface fades its new content in over `--dur-morph` after `--dur-stagger` (`NsPopoverGroup.svelte` `panelIn`).
- Popover rows enter with `ns-in` over `--ns-row-ms` (`--dur-fade`), each row's `--delay` a `--dur-stagger` after the one before and never past `--dur-cascade` (motion `staggered`): harness tabs (`ModelSection.svelte`, Rail's `stagger`), permission rows (`PermissionSection.svelte`), lifetime and context rows (`ChoiceChip.svelte`), project rows then the add row (`ProjectChip.svelte`), machine rows from the first place then the add row (`MachinesChip.svelte`), the location override at the first place (`LocationSection.svelte`).
- Model list swap on a harness change (`lib/platform/motion/list-swap.svelte.ts`, used by `ModelSection.svelte`): old rows leave together over `--dur-exit`; new rows enter over `--dur-pop`, `--dur-stagger` apart, starting once the old rows are out; staggers stop growing after row `STAGGER_CAP` 9 and at most `LEAVING` 8 old rows animate. Rows travel `--pop-rise` (`ns-in-r`, `ns-in-l`, `ns-out-l`, `ns-out-r` in `src/design.css`).
- Travelling highlights (`components/ui/highlight`, attached by `ModelSection.svelte`, `PermissionSection.svelte`, `NsPopover.svelte`, `NsPopoverGroup.svelte`): the hover ghost glides on `--dur-ghost` and `--ease-in-out`; the selected pill glides on `--dur-control` and `--ease-drawer` (`highlight.svelte.ts`, its transitions).
- Effort: bars light `--dur-stagger` apart (`EffortPips.svelte`); the fill and pip move over `--ns-fill-ms` (`--dur-toggle`) on `--ease-in-out`; the knob grows over `--dur-morph` on `--ease-out`.
- Segmented thumb (location source) moves over `--dur-pop` on `--ease-in-out` (the kit ToggleGroup's `slideThumb`, `components/ui/tabs/thumb.ts`); the prompt's height eases over `--dur-pop` on `--ease-in-out` (`PromptEditor.svelte`).

### Reduced motion

- Every `ns-*` animation runs only under `prefers-reduced-motion: no-preference`: the sections (their `motion-safe:` utilities), the `ns-in`, `ns-check` and `ns-panel` utilities (`ns-theme.css`), the popover entrance, exit and glide (`glidePopoverVariants`; `ns-theme.css` for the wrapper's glide), and the lifetime, context and project swap marks (`ChoiceChip.svelte`; `ProjectChip.svelte`). The phone sheet's own vaul transitions are cut by `prefers-reduced-motion: reduce` (the drawer's `look="new-session"`). The trigger popover runs its fade alone (ui/popover's content).
- The model swap returns `animation: none` for every row when motion is reduced (`motion/list-swap.svelte.ts`, `rowAnim`/`leaveAnim`), and a retargeted popover's content fade has zero duration (`NsPopoverGroup.svelte` `panelIn`).

## 5. Submission

- Start is disabled while `cantStart` holds: a file still uploading, a clean start the machine refuses (`cleanRefused`), a continuation that cannot fit, a Claude placement refusal, a permission mode the machine does not take (`modeRefused`) or none picked on a harness that has modes (`modeUnchosen`), the hub not connected, no machine, an offline machine, an unreadable location, a malformed repository, or a move not yet read. A location still being read does not disable it: the press waits for the check (`pressedFor`) and then goes or says why. `start()` repeats the busy and hub guards and `heldBack()` (uploads, `validate()`, `cantStart`, the folder check, a move's first step), so Cmd/Ctrl+Enter cannot bypass the button. Cmd/Ctrl+Enter starts from the window and from the prompt (Form `keydown`; `PromptEditor.svelte` `onkeydown`). An empty prompt is allowed: `spawnSession` and `forkSession` send the first message only when it has words or files (`stores/session-start.svelte.ts` `sendFirstPrompt`).
- The location is verified 600ms after it changes, and again before each spawn, with both `inspectMachine(id, path)` and `machineFs(id, "list", path)`; a missing folder (`ENOENT`) is reported as one Start creates, any other failure as unreadable (Form `inspectLocation`, `verifyBeforeSpawn`).
- `start` parks the start (`beginStart`, `spawn/parked.svelte.ts`) with the draft, the prompt's content and a stage, discards the kept prompt and picks (`keptDraft.discard()`, `FORM_KEY`), and runs it there. A start spawns on every chosen machine in order, verifying each before its spawn, and stops the batch at the first failure, which it says on its row (`failStart`). Each spawn mints its session's id before the hub is asked (`planAsks`), and is (`spawnOne`; `spawnSession` is `stores/session-start.svelte.ts`):

```ts
spawnSession({
  ...(instanceId ? { instanceId } : {}),
  machineId: target,
  cwd: draft.cwd,
  prompt: draft.prompt,
  extras: draft.extras,
  harness: draft.harness,
  ...(modeless || draft.permissionMode === null
    ? {}
    : { permissionMode: draft.permissionMode }),
  ...(shownModel(draft) ? { model: shownModel(draft) } : {}),
  ...(draft.effort ? { effort: draft.effort } : {}),
  scratch: draft.scratch,
  ...(draft.clean ? { clean: true } : {}),
  bootstrap:
    draft.repo === undefined
      ? undefined
      : { repo: draft.repo, baseDir: draft.baseCwd },
  projectId: toAttach,
  ...(draft.account ? { account: draft.account } : {}),
});
```

- A fork (`prefill.fork`: a fork its source had no mode for, opened by `new-session.svelte.ts` `startFork`) goes through `forkOne`: `forkSession` (`stores/session-start.svelte.ts`) with the source, the picked mode, model and effort, and the first message.
- A continuation (`continueFrom`) goes to the hub as one job with the summariser and the same target options, and the start follows the job's stages until it starts, fails or is cancelled (Form `startContinue`; `followJob` in `spawn/parked.svelte.ts`; the form shows them while open).
- After the spawns, model use and spawn preferences are recorded (`remember`), the start is marked started (`startedStart`), and the form, if open, leaves for the first new session (Form `exitTo`, from the effect on the shown start's `started` state).

## 6. Data Sources

- `boardStore.machines`, `boardStore.liveOn(id)`, `projectsStore` and `accountsStore` are the reactive reads over the stores (`stores/board.svelte.ts`, `stores/projects.svelte.ts`, `stores/accounts.svelte.ts`). Machine and project rows for the chips are derived in the form (`machineItems`, `projectItems`); a project is offered on every chosen machine where it has a checkout.
- The model catalog is `models.forHarness(harness, machineIds, accountId)`, filtered to what the chosen machines run and, for a harness whose catalog is the account's, what the placed account offers (`lib/cawco/models.svelte.ts` `forHarness`; Form `offered`). The account placement comes from the hub (`stores/accounts.svelte.ts` `placementFor`; Form's placement effect).
- Model entries are canonical: ID `modelRun(row)`, aliases merged, names derived by `modelNameIn` (`@cawco/core/model-names`, through `model-entries.ts` `deriveModelEntries`), so `claude-opus-5[1m]` renders `Opus 5 · 1M`. Ordering is New (released after the harness's last spawn), Recent (by last use), All (by release, undated last), then Typed custom IDs the catalog does not cover (`groupModelEntries`). Typed custom IDs persist under `cawco-models:recent-by-harness` (`lib/cawco/models.svelte.ts` `RECENT_KEY`).
- Harness installation is read from the first machine's `harnesses` report (Form `installedHarnesses`); the harness rail shows every harness and marks the missing ones (`ModelSection.svelte`).

## 7. Verification

- Check it with `bun run check` from the repository root (types and lint over what the change reaches).

## Modal-Relevant Tokens

The form reads the root tokens in `app.css` directly; `DESIGN.md` lists them
(surfaces, ink, radius, type roles, shadows, scrim, curves, durations), with
`c-new-session-pop-w` for the popover's width. Only the form's own names for
its motion durations (`--ns-*-ms`) stay in `ns-theme.css`.

## Must-Keep Checklist

- Keep the kit popover on desktop for every opener and the kit Drawer on phones, both dismissing through the form's `close()`, with no scrim on desktop. `NewSessionPopover.svelte` (`data-ns-popover`), `NewSessionDialog.svelte` (`data-session-card`).
- Keep the popover hanging from its trigger (the rail's Start session when its opener has none) `c-new-session-pop-w` wide, capped at the room under it, recessed under the raised body, the prompt taking the focus and whatever held it getting it back. `NewSessionPopover.svelte`.
- Keep a start parked as it begins and run there, whatever becomes of the form: `close` drops nothing and only Cancel ends a running continuation. Form `start`, `close`, `cancel`, `cancelContinue`; `parked.svelte.ts` `beginStart`. Keep the `submission` generation increments and the check in `loadEstimate`'s `current()`.
- Keep the open-reset boundary: take only the harness from `spawnPrefs` (the mode is the hub's, else `spawnPrefs`), apply a parked start's picks or the kept picks of the same opening, and keep the first prompt in the draft store until Cancel or a start. Form's `open` effect, `keptPicks`, `keptDraft`.
- Keep `cawco-spawn-prefs` and `cawco-models:use` as separate stores, each written only after an actual spawn. `lib/cawco/spawnPrefs.svelte.ts` `rememberSpawn`; `modelUse.svelte.ts` `recordModelUse`.
- Keep empty model and effort omitted from the payload while the effort chip shows the model's default. Form `spawnOne`, `effortShown`.
- Keep the change to an installed harness whenever the first machine changes. Form's `lastMachine` effect.
- Keep the fixed head and footer around a shrinking scrolling body, the one-line reading slot, and the 96px Start (`--c-btn-min-w`). Form `[data-slot="body"]` and its reading line; `SessionFooter.svelte`.
- Keep popovers portaled on one shared surface, constrained by collision padding, width and available height, with measured height tweens; keep the model list a fixed 300px vertical scroller. `NsPopoverGroup.svelte`; `glidePopoverVariants`; `ModelSection.svelte` `[data-slot="list"]`.
- Keep the visual-viewport sheet, safe-area padding, 44px coarse-pointer targets, and anchored phone popovers. `NewSessionDialog.svelte`; `ui/drawer/drawer-content.svelte`; `glidePopoverVariants`; `SessionFooter.svelte`.
- Keep canonical model IDs and names, `[1m] -> " · 1M"`, aliases only for search, and New -> Recent -> All -> Typed ordering. `model-entries.ts`.
- Keep pre-spawn location verification on every machine, all Start gates, and the batch stopping at the first failure. Form `cantStart`, `heldBack`, `verifyBeforeSpawn`, `start`.
- Keep the exact `spawnSession` payload shape, the separate trimmed first message, and post-spawn preference and model-use writes. Form `spawnOne`, `forkOne`, `start`, `remember`; `stores/session-start.svelte.ts` `sendFirstPrompt`.
- Keep the opening choreography and every tuned motion value in §4 "Opening choreography and tuned values": section delays, popover entrance and glide, popover row staggers, the list-swap timings, highlight glides, effort and thumb timings, and the motion tokens they read. Change a value in the token JSON or at the symbol §4 names, never as a one-off.
- Keep every `ns-*` animation behind `prefers-reduced-motion: no-preference`, and the list swap's `none` under reduced motion. §4 "Reduced motion".

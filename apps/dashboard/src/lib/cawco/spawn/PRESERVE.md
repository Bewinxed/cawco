# New Session Preservation Record

This is a literal record of the New Session form's implementation contracts as built. A re-skin may change presentation only if it preserves the behavior, measurements, containment, motion, and state transitions below. Each contract is cited by the file and the symbol, selector or prop that carries it (`File.svelte` `name`), never by line: line numbers went stale with every edit. Files are in this folder unless a path says otherwise; `Form` is `NewSessionForm.svelte`.

## 1. Mounting

- The form is one component, `NewSessionForm` (its logic and markup; its frame draws the surface), rendered by the one frame the Shell mounts for every opener and every Continue (`new-session.svelte.ts` `spawning`, `newSession`): `NewSessionPopover`. An opener passes its trigger (`newSession(prefill, anchor)`: the rail's Start session, the session strip's "+", a project's Spin off, Fork from here); one with none (the shortcut, a `?spawn=` link, Continue) hangs it from the rail's Start session (`data-start-session`), or under the bar's leading edge where the rail is a sheet. The form takes `open` and `onclose`, with optional `prefill`, `continueFrom`, `restore` and `onexitcontinue`; the frame calls its exported `close()` when dismissed, `escapeStep()` on Esc, and `focusPrompt()` as it opens.
- `NewSessionPopover`, above 640px, is the kit popover hanging from its trigger, `c-new-session-pop-w` wide (569px: the narrowest the form's own rows hold one line at, probe-kit `strip-new-session`), capped at the room under the trigger (the kit popover's `width="room"` and `height="room"`, the room taken a frame after floating-ui says so: glide-popover `popoverRoom`); it recesses (its `look="new-session"`, `surface-recess`) under the form's raised body. It holds nothing (DESIGN.md, The Open Page Rule): no scrim, no blur, the page live beside it. At 640px and below it is `NewSessionDialog`, the kit Drawer (vaul) bottom sheet, with the same wiring.
- The primitives own dismissal; do not replace them with an in-flow conditional container. Both prevent automatic focus: the prompt takes it as the popover opens and it goes back to whatever held it; the sheet opened with no trigger holds it itself (the keyboard waits for a tap in the prompt). The popover stands on the float layer (`--layer-float`).
- The popover's height is the kit popover's own; the phone sheet's height is the kit drawer's.
- Every chip popover in the form shares one portaled bits-ui surface, `NsPopoverGroup` (Form's `<NsPopoverGroup>`; `NsPopoverGroup.svelte`): opening a sibling glides the surface to the new trigger instead of closing one popover and opening another. `NsPopover` is the trigger and, outside a group, its own portaled popover. Popovers sit at z-index 90 (`ns-theme.css` `.ns-theme.ns-pop`).
- The dialog's motion was first tuned with DialKit (commit `07a1782a`) on an authoring route. That route and the `dialkit` dependency are gone: `routes/motion/new-session/+page.svelte` only opens the Shell's form (`newSession`). The tuned motion lives in CSS and root tokens (§4).

## 2. State Preservation

- Opening is a deliberate reset boundary. On every `open` transition the frame captures the active element (or its trigger) as `opener`, and the form (its `open` effect) seeds project, machines and cwd from `continueFrom`, `prefill`, the project's primary checkout or the machine it last started on (`rememberedMachine`), restores `harness` and `permissionMode` from `spawnPrefs` (a fork's own harness over it), and resets the summariser, `estimate`, `model = ""`, `effort = null`, `account = null`, `repo = undefined`, `editing = false`, `spinOff` from `prefill.spinOff`, `busy = false`, `error = ""`, `popover = null` and `verifiedLocation = ""`. A failed continuation's `restore` reopens the form exactly as it was submitted.
- The first prompt is the one field that outlives a reload: it is a `ComposerDraft` (`firstMessage`) kept in the draft store by `keepDraft` under this tab's own key (`keptKey`, minted once into sessionStorage at `KEPT_KEY`), read back as the form opens, and discarded when it closes (`close`, `keptDraft.discard()`).
- The open effect's cleanup increments `submission` and hands a running continuation to the tab (`detachContinuation`). `close()` increments it again. `start()` captures `id = submission`, and `current()` requires both `open` and the unchanged generation; every async step rechecks it after verification, each spawn, and before leaving. This is cancellation-on-close: a stale request never spawns or navigates.
- Submission inputs are snapshotted before any async work in the `draft` (`SessionDraft`, built in `start`): machines, trimmed `baseCwd`, `workdir`, prompt and its `extras`, harness, permission mode, model, effort, scratch, repo, project, summariser, `usedModel`, and the account when one was picked. Do not read mutable form state after the first await.
- `spawnPrefs` persists under localStorage key `cawco-spawn-prefs` with `harness`, `model`, `permissionMode` and `effort` (`spawnPrefs.svelte.ts` `KEY`, `load`); nothing remembered is `FALLBACK`, `{ harness: "claude", model: MODEL_DEFAULT, permissionMode: null, effort: null }`: the form opens on no mode, its permission chip reads "Choose a mode", and Start waits for one (`modeUnchosen`). `rememberSpawn` writes it only once a spawn, fork, move or continuation has gone out (Form `start`, `startMoving`, `startContinue`), so a cancelled form teaches nothing. Opening restores only `{ harness, permissionMode }`: model and effort are never restored, and where a session runs is not a preference beyond the machine (`rememberMachine`).
- Model-use history is separate localStorage state, `cawco-models:use` (`modelUse.svelte.ts`; `models.svelte.ts`). `recordModelUse` writes the harness's `lastSpawnAt` and, when nonempty, `lastUsedAt[id]` after the spawn. A selection alone does not update it.
- Changing harness clears `model`, `effort` and `account` (`chooseHarness`). When the first machine changes and the current harness is not installed there, the form takes its first installed harness (the `lastMachine` effect). An effort the chosen model cannot reach is cleared (the `stops` effect). A permission mode the machine does not take is never swapped for another: its reason stands beside Start, which waits for a mode it takes (`modeRefused`). Picking a model clears effort (ModelSection's `onmodel`).
- Repository mode is `repo !== undefined`. Choosing it sets `repo = ""` (or keeps a typed one), clears the project, marks editing and seeds `cwd ||= "~"`; choosing a directory returns `repo` to `undefined` (LocationChip's `onmode`). It is not a persisted preference.
- Untouched model stays `""` and is omitted from the payload; untouched effort stays `null` and is omitted (`spawnOne`). While effort is untouched the effort chip shows the model's measured default, or "Default" when none is known (`effortShown`; `ToolChips.svelte` `tools.effort`).

## 3. Containers And Layout-Shift Workarounds

### Desktop geometry

`NewSessionPopover`'s surface (the kit popover's content, `data-ns-popover`) hangs from its trigger on the float layer, `--pop-w` wide (`min(var(--c-new-session-pop-w), 100vw - 1.5 × --space-8)`) and capped at `--pop-max-h` (the room under the trigger, less 2px), on `bg-surface-recess` (its `look="new-session"`), the form's body raised on it.

- The head and the footer are `flex: none`; the body between them is `flex: 0 1 auto; min-height: 0; overflow: auto`, so a capped card or popover scrolls its body and keeps Close and Start in view (Form `[data-slot="body"]`; `SessionFooter.svelte`). The body's flex basis must stay `auto`: a zero basis collapsed the card to its padding in WebKit.
- The body carries the house edge fade, `.kit-edge-fade-block` (Form `[data-slot="body"]`; `app.css` `.kit-edge-fade-block`): while it scrolls, the edge with more behind it fades over `--fade-len`, and a body that fits fades neither. macOS hides overlay scrollbars, so this edge is the capped form's one sign that it scrolls.
- The model panel is ModelSection's `[data-slot="picker"]`. No global rule may style it: Config's PickerChip once styled a bare `.picker`, and once Config had loaded the panel came out 32px tall, its rail centred against the list, and pressed to `--press-scale` by any press inside it.
- Scrolling the body closes an open popover rather than leaving it detached from its chip (Form `bodyScroll`).
- The reading line under the composer reserves one line (`min-height: 16px`), never wraps, and ellipsizes, so a message never changes the card's height; it shows a non-breaking space when empty (Form's reading line). A move's line takes two (`data-two`), its height following through `readingMorph`.
- The prompt editor is a contenteditable whose height is 44px at rest and 120px while focused, filled or showing its `@`/`/` menu, eased over `--ns-prompt-ms` (`PromptEditor.svelte`). On phones it is a fixed 120px with no transition.
- The composer chips are 30px and wrap; on a coarse pointer their rows open to 14px apart so every chip's touch area reaches 44px (Form `[data-slot="chips"]`).
- Start keeps a 96px minimum width and the footer stays right-aligned (`SessionFooter.svelte`).

### Popover containment

- Popovers are portaled, so opening one never inserts height into the form. The shared surface is anchored below its trigger with `side="bottom"`, `sideOffset={6}` and `collisionPadding={8}` (`NsPopoverGroup.svelte`; `NsPopover.svelte`).
- The surface caps its width at `min(var(--ns-pop-width, 320px), calc(100vw - 32px))` and its height at `min(440px, var(--bits-popover-content-available-height))`, scrolls inside, and lays its content in one `minmax(0, 1fr)` column so a wide row shrinks rather than overflows (`ns-theme.css` `.ns-theme.ns-pop`). While it glides between triggers its content sits in a measured block whose height tweens, clipped with a 4px margin so focus rings survive (`NsPopoverGroup.svelte`; `ns-theme.css` `.ns-panel-set`).
- On phones a popover stays anchored to its chip, wider and shorter: `calc(100vw - 24px)` by `min(420px, 55dvh, available height)`, with 44px buttons (`ns-theme.css`, its 640px rule).
- The model list is part of the form, not a popover: a fixed 300px list that scrolls vertically only, so the swap's 18px sideways slide never flashes a horizontal scrollbar (`ModelSection.svelte` `[data-slot="list"]`). Model names and metadata stay on one line and ellipsize.

### Mobile bottom sheet and keyboard containment

- The document viewport opts into content resizing for virtual keyboards: `app.html`'s head script makes the viewport meta, and on Chromium and Gecko (the engines that read the key; WebKit logs an error for it) its content is

```html
width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content
```

- On phones the card is the kit Drawer (`#lib/components/ui/drawer`, vaul): a bottom sheet with rounded top corners and safe-area bottom padding that follows the finger from its header and dismisses on vaul's distance or flick thresholds (Form `:global(.session-card[data-vaul-drawer])`). The kit Drawer keeps it inside the visible viewport: it publishes `visualViewport`'s `offsetTop` and `height` on the sheet as `--visible-top` and `--visible-height`, and `app.css` rests the sheet on the bottom of that area, capped at the smaller of it and the sheet's `--drawer-max-height`. Above a keyboard the header and Start stay on screen and the body scrolls (`touch-action: pan-y; overscroll-behavior: contain`). vaul's own keyboard repositioning is off in the kit.
- On phones the sheet is the kit's one bottom-sheet recipe: its surface full-bleed with the hairline on the top edge only, its foot padded `1rem` plus the safe area (`ui/drawer/drawer-content.svelte`), its head the kit sheet head (title role, Close, the seam that comes in as the body scrolls; app.css `.kit-sheet-head`), and the form straight on the sheet with no card of its own. The form's one title is the head's ("New session", "Continue session", "Fork session"; Form `headTitle`).

## 4. Animations

### Opening choreography and tuned values

Durations, curves and scales are root tokens (`design/tokens/cawco.tokens.json`, built into `lib/tokens/tokens.css`): `--ease-out` `cubic-bezier(0.23, 1, 0.32, 1)`, `--ease-in-out` `cubic-bezier(0.77, 0, 0.175, 1)`, `--ease-drawer` `cubic-bezier(0.32, 0.72, 0, 1)`, `--dur-ghost` 80ms, `--dur-control` 120ms, `--dur-toggle` and `--dur-exit` 160ms, `--dur-morph` 180ms, `--dur-fade` 200ms, `--dur-pop` 260ms, `--dur-panel` 280ms, `--press-scale` 0.97, `--pop-scale` 0.92, `--pop-rise` 8px. The form's own names for them are the `--ns-*-ms` in `ns-theme.css` `.ns-theme`.

- Popover (desktop): the kit popover's own (ui/popover's content, DESIGN.md's popover motion), from the trigger's side `--pop-rise` off and `--pop-scale` small, over `--dur-pop` on `--ease-drawer`, and back over `--dur-exit`, scrubbed by probe-kit `strip-new-session`.
- Card (phones): the kit Drawer's sheet, leaving over `--dur-exit` on `--ease-out` instead of vaul's 500ms slide (Form, its 640px rule).
- Sections arrive with `ns-in` (opacity 0, `translateY(8px)`; `ns-theme.css` `@keyframes ns-in`) over `--dur-pop` on `--ease-out`, delayed by `--delay` (Form's sections, `animate-ns-sec`): the prompt at 0ms, then 60ms and 80ms (each section's `--delay`).
- Leaving for the new session: `exitTo` hands the Start button's place (`data-share="session:new"`, `SessionFooter.svelte`) to the new session's tab and closes the form before navigating, so its exit plays over the page arriving.
- Popovers: enter with `ns-pop-in` from `--pop-scale` and `--pop-rise` over `--dur-pop` on `--ease-drawer`, leave with `ns-pop-out` to `--pop-scale` over `--dur-exit`, and glide between sibling triggers on `--dur-pop`/`--ease-drawer` (`ns-theme.css` `@keyframes ns-pop-in`, `ns-pop-out`, `.ns-theme.ns-pop`). A retargeted surface fades its new content in over `--dur-morph` after 60ms (`NsPopoverGroup.svelte`).
- Popover rows enter with `ns-in` over `--ns-row-ms` (`--dur-fade`) at these staggers (each row's `--delay`): harness tabs `i * 30ms` (`ModelSection.svelte`); permission rows `i * 35ms` (`PermissionSection.svelte`); lifetime rows `index * 35ms` (`LifetimeChip.svelte`); project rows `index * 35ms`, then the add row at 110ms (`ProjectChip.svelte`); machine rows `80 + index * 45ms`, then the add row at 140ms (`MachinesChip.svelte`); the location override at 40ms (`LocationSection.svelte`).
- Model list swap on a harness change (`motion/list-swap.svelte.ts`, used by `ModelSection.svelte`): old rows leave over `OUT_MS` 200ms, `OUT_STAGGER` 18ms apart; new rows enter over `IN_MS` 300ms, `IN_STAGGER` 40ms apart, starting once the first old row is out (`IN_LEAD = OUT_MS`); staggers stop growing after row `STAGGER_CAP` 9 and at most `LEAVING` 8 old rows animate. Rows travel 18px (`ns-in-r`, `ns-in-l`, `ns-out-l`, `ns-out-r` in `app.css`).
- Travelling highlights (`components/ui/highlight`, attached by `ModelSection.svelte`, `PermissionSection.svelte`, `NsPopover.svelte`, `NsPopoverGroup.svelte`): the hover ghost glides on `--dur-ghost` and `--ease-in-out`; the selected pill glides on `--dur-control` and `--ease-drawer` (`app.css`, the highlight's rules).
- Effort: bars light `BAR_STEP_MS` 40ms apart (`EffortPips.svelte`); the fill and pip move over `--ns-fill-ms` (`--dur-toggle`) on `--ease-in-out`; the knob grows over `--dur-morph` on `--ease-out`.
- Segmented thumb (location source) moves over `--ns-thumb-ms` (`--dur-pop`) on `--ease-in-out` (`Segmented.svelte`); the prompt's height eases over `--ns-prompt-ms` (`--dur-pop`) on `--ease-in-out` (`PromptEditor.svelte`).

### Reduced motion

- Every `ns-*` animation runs only under `prefers-reduced-motion: no-preference`: the sections (their `motion-safe:` utilities), `.ns-in`, `.ns-check` and `.ns-panel` (`ns-theme.css`), the popover entrance, exit and glide (`ns-theme.css`), and the lifetime and project swap marks (`LifetimeChip.svelte`; `ProjectChip.svelte`). The phone sheet's own vaul transitions are cut by `prefers-reduced-motion: reduce` (the drawer's `look="new-session"`). The trigger popover runs its fade alone (ui/popover's content).
- The model swap returns `animation: none` for every row when motion is reduced (`motion/list-swap.svelte.ts`, `rowAnim`/`leaveAnim`), and a retargeted popover's content fade has zero duration (`NsPopoverGroup.svelte`).

## 5. Submission

- Start is disabled while `cantStart` holds: a file still uploading, a continuation that cannot fit, a Claude placement refusal, a permission mode the machine does not take (`modeRefused`) or none picked on a harness that has modes (`modeUnchosen`), the hub not connected, no machine, an offline machine, an unreadable location, a malformed repository, or a move not yet read. A location still being read does not disable it: the press waits for the check (`pressedFor`) and then goes or says why. `start()` repeats the busy and hub guards and `heldBack()`/`validate()` (a fork that left its session's machine, folder or harness too, `forkHeld`), so Cmd/Ctrl+Enter cannot bypass the button. Cmd/Ctrl+Enter starts from the window and from the prompt (Form `keydown`; `PromptEditor.svelte` `onkeydown`). An empty prompt is allowed: `spawnSession` and `forkSession` send the first message only when it has words or files (`client.svelte.ts` `sendFirst`).
- The location is verified 600ms after it changes, and again before each spawn, with both `inspectMachine(id, path)` and `machineFs(id, "list", path)`; a missing folder (`ENOENT`) is reported as one Start creates, any other failure as unreadable (Form `inspectLocation`, `verifyBeforeSpawn`).
- A start spawns on every chosen machine in order, verifying each before its spawn, and stops the batch at the first failure (Form `start`). Each spawn is (`spawnOne`):

```ts
spawnSession({
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
  bootstrap:
    draft.repo === undefined
      ? undefined
      : { repo: draft.repo, baseDir: draft.baseCwd },
  projectId: toAttach,
  ...(draft.account ? { account: draft.account } : {}),
});
```

- A fork (`prefill.fork`: a fork its source had no mode for, opened by `new-session.svelte.ts` `startFork`) goes through `forkOne`: `forkSession` with the source, the picked mode, model and effort, and the first message.
- A continuation (`continueFrom`) goes to the hub as one job with the summariser and the same target options, and the form follows its stages until it starts, fails or is cancelled (Form `startContinue`, the `followed` effect).
- After the spawns, model use and spawn preferences are recorded, then the form leaves for the first new session (Form `start`, `exitTo`).

## 6. Data Sources

- `cawco.machines`, `cawco.projects`, `cawco.onlineMachines`, `cawco.liveOn(id)` and `cawco.accounts` are reactive getters over the dashboard client state (`client.svelte.ts`). Machine and project rows for the chips are derived in the form (`machineItems`, `projectItems`); a project is offered on every chosen machine where it has a checkout.
- The model catalog is `models.forHarness(harness, machineIds, accountId)`, filtered to what the chosen machines run and, for Claude, what the placed account offers (`models.svelte.ts` `forHarness`; Form `offered`). The account placement comes from the hub (`client.svelte.ts` `placementFor`; Form's placement effect).
- Model entries are canonical: ID `resolvedModel ?? value`, aliases merged, names derived by `modelName` (`model-entries.ts` `modelName`, `deriveModelEntries`), so `claude-opus-5[1m]` renders `Opus 5 · 1M`. Ordering is New (released after the harness's last spawn), Recent (by last use), All (by release, undated last), then Typed custom IDs the catalog does not cover (`groupModelEntries`). Custom IDs persist under `cawco-models:recent` (`models.svelte.ts`).
- Harness installation is read from the first machine's `harnesses` report (Form `installedHarnesses`); the harness rail shows every harness and marks the missing ones (`ModelSection.svelte`).

## 7. Verification

- Type-check the dashboard with `bun run typecheck` in `apps/dashboard`; check changed files with `bun run lint:changed` from the repository root.
- The form is proved in the running dashboard by probe-kit `strip-new-session` (`bun scripts/probe-kit/run.ts web strip-new-session`): the "+"'s popover and sheet, the rail's Start session's popover, a `?spawn=` link's focus, the popover's width, depth and motion, and a fork with no mode.

## Modal-Relevant Tokens

The form reads the root tokens in `app.css` directly; `DESIGN.md` lists them
(surfaces, ink, radius, type roles, shadows, scrim, curves, durations), with
`c-new-session-pop-w` for the popover's width. Only the form's own names for
its motion durations (`--ns-*-ms`) stay in `ns-theme.css`.

## Must-Keep Checklist

- Keep the kit popover on desktop for every opener and the kit Drawer on phones, both dismissing through the form's `close()`, with no scrim on desktop. `NewSessionPopover.svelte` (`data-ns-popover`), `NewSessionDialog.svelte` (`data-session-card`).
- Keep the popover hanging from its trigger (the rail's Start session when its opener has none) `c-new-session-pop-w` wide, capped at the room under it, recessed under the raised body, the prompt taking the focus and whatever held it getting it back. `NewSessionPopover.svelte`.
- Keep the `submission` generation increment on close and cleanup, and the current-generation checks after every asynchronous step. Form `submission`, `current`, `close`.
- Keep the open-reset boundary: restore only harness and permission mode (and a failed continuation's own draft); keep the first prompt in the draft store only until close. Form's `open` effect, `keptDraft`.
- Keep `cawco-spawn-prefs` and `cawco-models:use` as separate stores, each written only after an actual spawn. `spawnPrefs.svelte.ts` `rememberSpawn`; `modelUse.svelte.ts` `recordModelUse`.
- Keep empty model and effort omitted from the payload while the effort chip shows the model's default. Form `spawnOne`, `effortShown`.
- Keep the change to an installed harness whenever the first machine changes. Form's `lastMachine` effect.
- Keep the fixed head and footer around a shrinking scrolling body, the one-line reading slot, and the 96px Start. Form `[data-slot="body"]` and its reading line; `SessionFooter.svelte`.
- Keep popovers portaled on one shared surface, constrained by collision padding, width and available height, with measured height tweens; keep the model list a fixed 300px vertical scroller. `NsPopoverGroup.svelte`; `ns-theme.css` `.ns-theme.ns-pop`; `ModelSection.svelte` `.list`.
- Keep the visual-viewport sheet, safe-area padding, 44px coarse-pointer targets, and anchored phone popovers. Form's 640px rule; `ns-theme.css`; `SessionFooter.svelte`.
- Keep canonical model IDs and names, `[1m] -> " · 1M"`, aliases only for search, and New -> Recent -> All -> Typed ordering. `model-entries.ts`.
- Keep pre-spawn location verification on every machine, all Start gates, and the batch stopping at the first failure. Form `cantStart`, `heldBack`, `verifyBeforeSpawn`, `start`.
- Keep the exact `spawnSession` payload shape, the separate trimmed first message, and post-spawn preference and model-use writes. Form `spawnOne`, `forkOne`, `start`; `client.svelte.ts` `sendFirst`.
- Keep the opening choreography and every tuned motion value in §4 "Opening choreography and tuned values": section delays, popover entrance and glide, popover row staggers, the list-swap timings, highlight glides, effort and thumb timings, and the motion tokens they read. Change a value in the token JSON or at the symbol §4 names, never as a one-off.
- Keep every `ns-*` animation behind `prefers-reduced-motion: no-preference`, and the list swap's `none` under reduced motion. §4 "Reduced motion".

# New Session Preservation Record

This is a literal record of the New Session modal's implementation contracts as built. A re-skin may change presentation only if it preserves the behavior, measurements, containment, motion, and state transitions below. Line numbers are files in this folder unless a path says otherwise.

## 1. Mounting

- `NewSessionDialog` is one controlled modal, opened from the Shell (`new-session.svelte.ts`). `open` and `onclose` are required props, with optional `prefill`, `continueFrom`, `restore` and `onexitcontinue` (`NewSessionDialog.svelte:102-122`).
- Above 640px it is a bits-ui dialog: `<Dialog onOpenChange={(value) => { if (!value) { close(); } }} {open}>` around a `DialogPortal` holding `DialogPrimitive.Overlay` (the scrim) and raw `DialogPrimitive.Content` (the card) (`NewSessionDialog.svelte:1200-1228`). At 640px and below (`mobile = new MediaQuery("(max-width: 640px)")`, `:126`) it is the kit Drawer (vaul) with the same `close()` wiring (`:1170-1198`). Both render the one `formContent` snippet (`:1231-1476`).
- The primitives own focus trapping, dismissal and scroll locking; do not replace them with an in-flow conditional container. Both prevent automatic focus, focus the card on open, and return focus to `opener` on close (`:1185-1192,1214-1221`). The scrim is fixed at z-index 80 and the card at 81 (`:1496-1503,1513-1524`).
- On desktop the card tweens to its new height whenever its body changes, through `morph()` (`:128-139`); the phone sheet's height is the kit drawer's.
- Every chip popover in the form shares one portaled bits-ui surface, `NsPopoverGroup` (`NewSessionDialog.svelte:1268-1430`; `NsPopoverGroup.svelte:85-182`): opening a sibling glides the surface to the new trigger instead of closing one popover and opening another. `NsPopover` is the trigger and, outside a group, its own portaled popover (`NsPopover.svelte:132-191`). Popovers sit at z-index 90 (`ns-theme.css:264-292`).
- The dialog's motion was first tuned with DialKit (commit `07a1782a`) on an authoring route. That route and the `dialkit` dependency are gone: `routes/motion/new-session/+page.svelte` only opens the Shell's dialog (`newSession`). The tuned motion lives in CSS and root tokens (§4).

## 2. State Preservation

- Opening is a deliberate reset boundary. On every `open` transition the dialog captures the active element as `opener`, seeds project, machines and cwd from `continueFrom`, `prefill`, the project's primary checkout or the first online machine, restores `harness` and `permissionMode` from `spawnPrefs`, and resets the summariser, `estimate`, `model = ""`, `effort = null`, `account = null`, `repo = undefined`, `editing = false`, `spinOff = false`, `busy = false`, `error = ""`, `popover = null` and `verifiedLocation = ""` (`NewSessionDialog.svelte:622-678`). A failed continuation's `restore` reopens the form exactly as it was submitted (`:658-673`).
- The first prompt is the one field that outlives a close-free reload: it is kept in sessionStorage under `cawco:new-session-prompt` as it is typed, read back on open, and removed when the dialog closes (`:124-125,650,689-700,821-825`).
- The open effect's cleanup increments `submission` and hands a running continuation to the tab (`:679-687`). `close()` increments it again (`:821-825`). `start()` captures `id = submission`, and `current()` requires both `open` and the unchanged generation (`:1021-1023`); every async step rechecks it after verification, each spawn, and before leaving (`:1052-1067,1076-1079,1144-1152`). This is cancellation-on-close: a stale request never spawns or navigates.
- Submission inputs are snapshotted before any async work in the `draft` (`SessionDraft`): machines, trimmed `baseCwd`, `workdir`, prompt, harness, permission mode, model, effort, scratch, repo, project, summariser, `usedModel`, and the account when one was picked (`:1024-1043`). Do not read mutable form state after the first await.
- `spawnPrefs` persists under localStorage key `cawco-spawn-prefs` with `harness`, `model`, `permissionMode` and `effort` (`spawnPrefs.svelte.ts:24-43`); the fallback is `{ harness: "claude", model: MODEL_DEFAULT, permissionMode: "bypassPermissions", effort: null }`. `rememberSpawn` writes it only once a spawn or continuation has gone out (`spawnPrefs.svelte.ts:129-143`; `NewSessionDialog.svelte:1069-1074,1129-1134`), so a cancelled form teaches nothing. Opening restores only `{ harness, permissionMode }` (`NewSessionDialog.svelte:642`): model and effort are never restored, and where a session runs is not a preference.
- Model-use history is separate localStorage state, `cawco-models:use` (`modelUse.svelte.ts:11-14`; `models.svelte.ts:21`). `recordModelUse` writes the harness's `lastSpawnAt` and, when nonempty, `lastUsedAt[id]` after the spawn (`modelUse.svelte.ts:16-25`; `NewSessionDialog.svelte:1068,1127-1128`). A selection alone does not update it.
- Changing harness clears `model`, `effort` and `account` (`chooseHarness`, `:575-580`). When the first machine changes and the current harness is not installed there, the form falls back to its first installed harness or `claude` (`:581-594`). An effort the chosen model cannot reach is cleared (`:595-602`); a permission mode the harness cannot honour falls back through `fallbackMode` (`:603-611`). Picking a model clears effort (`:1402-1405`).
- Repository mode is `repo !== undefined`. Choosing it sets `repo = ""` (or keeps a typed one), clears the project, marks editing and seeds `cwd ||= "~"`; choosing a directory returns `repo` to `undefined` (`:1324-1331`). It is not a persisted preference.
- Untouched model stays `""` and is omitted from the payload; untouched effort stays `null` and is omitted (`:1001-1002`). While effort is untouched the effort chip shows the model's measured default, or "Default" when none is known (`effortShown`, `:385-393`; `ToolChips.svelte:116`).

## 3. Containers And Layout-Shift Workarounds

### Desktop geometry

`NewSessionDialog.svelte:1506-1524` fixes the card:

```css
:global(.session-card:not([data-vaul-drawer])) {
  inset: 0;
  margin: auto;
  width: min(980px, 100vw - 48px);
  height: fit-content;
  max-height: calc(100dvh - 48px);
}
:global(.session-card) {
  position: fixed;
  z-index: 81;
  display: flex;
  flex-direction: column;
  background: var(--surface-recess);
  border-radius: var(--radius-lg);
  padding: var(--space-2);
  box-shadow: var(--shadow-modal);
  outline: none;
  transform-origin: center;
}
```

- The head and the footer are `flex: none`; the body between them is `flex: 0 1 auto; min-height: 0; overflow: auto`, so a capped card scrolls its body and keeps Close and Start in view (`NewSessionDialog.svelte:1539-1546,1598-1609`; `SessionFooter.svelte:67-74`). The body's flex basis must stay `auto`: a zero basis collapsed the card to its padding in WebKit.
- Scrolling the body closes an open popover rather than leaving it detached from its chip (`bodyScroll`, `NewSessionDialog.svelte:1162-1166,1263`).
- The reading line under the composer reserves one line (`min-height: 16px`), never wraps, and ellipsizes, so a message never changes the card's height; it shows a non-breaking space when empty (`:1354-1361,1649-1660`).
- The prompt editor is a contenteditable whose height is 44px at rest and 120px while focused, filled or showing its `@`/`/` menu, eased over `--ns-prompt-ms` (`PromptEditor.svelte:3-4,45,326,361-376`). On phones it is a fixed 120px with no transition (`PromptEditor.svelte:437-441`).
- The composer chips are 30px and wrap; on a coarse pointer their rows open to 14px apart so every chip's touch area reaches 44px (`NewSessionDialog.svelte:1670-1685`).
- Start keeps a 96px minimum width and the footer stays right-aligned (`SessionFooter.svelte:67-77`).

### Popover containment

- Popovers are portaled, so opening one never inserts height into the form. The shared surface is anchored below its trigger with `side="bottom"`, `sideOffset={6}` and `collisionPadding={8}` (`NsPopoverGroup.svelte:97-133`; `NsPopover.svelte:151-171`).
- The surface caps its width at `min(var(--ns-pop-width, 320px), calc(100vw - 32px))` and its height at `min(440px, var(--bits-popover-content-available-height))`, scrolls inside, and lays its content in one `minmax(0, 1fr)` column so a wide row shrinks rather than overflows (`ns-theme.css:264-292`). While it glides between triggers its content sits in a measured block whose height tweens, clipped with a 4px margin so focus rings survive (`NsPopoverGroup.svelte:156-174`; `ns-theme.css:333-362`).
- On phones a popover stays anchored to its chip, wider and shorter: `calc(100vw - 24px)` by `min(420px, 55dvh, available height)`, with 44px buttons (`ns-theme.css:363-381`).
- The model list is part of the form, not a popover: a fixed 300px list that scrolls vertically only, so the swap's 18px sideways slide never flashes a horizontal scrollbar (`ModelSection.svelte:500-510`). Model names and metadata stay on one line and ellipsize (`ModelSection.svelte:600-617`).

### Mobile bottom sheet and keyboard containment

- The document viewport opts into content resizing for virtual keyboards (`app.html:6`):

```html
<meta content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" name="viewport">
```

- On phones the card is the kit Drawer (`#lib/components/ui/drawer`, vaul): a bottom sheet with rounded top corners and safe-area bottom padding that follows the finger from its header and dismisses on vaul's distance or flick thresholds (`NewSessionDialog.svelte:1686-1723`). The kit Drawer keeps it inside the visible viewport: it publishes `visualViewport`'s `offsetTop` and `height` on the sheet as `--visible-top` and `--visible-height`, and `app.css` rests the sheet on the bottom of that area, capped at the smaller of it and the sheet's `--drawer-max-height`. Above a keyboard the header and Start stay on screen and the body scrolls (`touch-action: pan-y; overscroll-behavior: contain`). vaul's own keyboard repositioning is off in the kit.
- On phones the sheet is the kit's one bottom-sheet recipe: its surface full-bleed with the hairline on the top edge only, its foot padded `1rem` plus the safe area (`ui/drawer/drawer-content.svelte`), its head the kit sheet head (title role, Close, the seam that comes in as the body scrolls; app.css `.kit-sheet-head`), and the form straight on the sheet with no card of its own. The dialog's one title is the head's ("New session", "Continue session").

## 4. Animations

### Opening choreography and tuned values

Durations, curves and scales are root tokens (`design/tokens/cawco.tokens.json`, built into `lib/tokens/tokens.css:782-850`): `--ease-out` `cubic-bezier(0.23, 1, 0.32, 1)`, `--ease-in-out` `cubic-bezier(0.77, 0, 0.175, 1)`, `--ease-drawer` `cubic-bezier(0.32, 0.72, 0, 1)`, `--dur-ghost` 80ms, `--dur-control` 120ms, `--dur-toggle` and `--dur-exit` 160ms, `--dur-morph` 180ms, `--dur-fade` 200ms, `--dur-pop` 260ms, `--dur-panel` 280ms, `--press-scale` 0.97, `--pop-scale` 0.92, `--pop-rise` 8px. The dialog's own names for them are in `ns-theme.css:8-19`.

- Scrim: z-index 80, `--scrim` with `--scrim-blur` (`NewSessionDialog.svelte:1496-1503`); fades in with `ns-scrim` over `--dur-panel` on `--ease-out` and out with `ns-scrim-out` over `--dur-exit` (`:1525-1538,1730-1742`).
- Card (desktop): enters with `ns-panel`, opacity 0 and `translateY(6px)` to rest, over `--dur-panel` on `--ease-out` (`:1525-1538`; `ns-theme.css:127-136`); leaves with `ns-panel-out` to `translateY(6px) scale(var(--press-scale))` and opacity 0 over `--dur-exit` (`:1724-1729`).
- Card (phones): the kit Drawer's sheet (`:1170-1198`), leaving over `--dur-exit` on `--ease-out` with its scrim instead of vaul's 500ms slide (`:1702-1711`).
- Sections arrive with `ns-in` (opacity 0, `translateY(8px)`; `ns-theme.css:107-116`) over `--dur-pop` on `--ease-out`, delayed by `--delay` (`NewSessionDialog.svelte:1616-1623`): the prompt at 0ms (`:1270`), then 60ms (`:1374`) and 80ms (`:1393`).
- Leaving for the new session: `exitTo` hands the Start button's place (`data-share="session:new"`, `SessionFooter.svelte:49-50`) to the new session's tab and closes the dialog before navigating, so the dialog's exit plays over the page arriving (`NewSessionDialog.svelte:1136-1152`).
- Popovers: enter with `ns-pop-in` from `--pop-scale` and `--pop-rise` over `--dur-pop` on `--ease-drawer`, leave with `ns-pop-out` to `--pop-scale` over `--dur-exit`, and glide between sibling triggers on `--dur-pop`/`--ease-drawer` (`ns-theme.css:264-321,338-362`). A retargeted surface fades its new content in over `--dur-morph` after 60ms (`NsPopoverGroup.svelte:61-72`).
- Popover rows enter with `ns-in` over `--ns-row-ms` (`--dur-fade`) at these staggers: harness tabs `i * 30ms` (`ModelSection.svelte:202`); permission rows `i * 35ms` (`PermissionSection.svelte:95`); lifetime rows `index * 35ms` (`LifetimeChip.svelte:76`); project rows `index * 35ms`, then the add row at 110ms (`ProjectChip.svelte:176,197`); machine rows `80 + index * 45ms`, then the add row at 140ms (`MachinesChip.svelte:121,147`); the location override at 40ms (`LocationSection.svelte:211`).
- Model list swap on a harness change (`motion/list-swap.svelte.ts:26-38`, used at `ModelSection.svelte:91,118,302-349`): old rows leave over `OUT_MS` 200ms, `OUT_STAGGER` 18ms apart; new rows enter over `IN_MS` 300ms, `IN_STAGGER` 40ms apart, starting once the first old row is out (`IN_LEAD = OUT_MS`); staggers stop growing after row `STAGGER_CAP` 9 and at most `LEAVING` 8 old rows animate. Rows travel 18px (`ns-in-r`, `ns-in-l`, `ns-out-l`, `ns-out-r`: `app.css:1697-1728`).
- Travelling highlights (`components/ui/highlight`, attached at `ModelSection.svelte:283`, `PermissionSection.svelte:73`, `NsPopover.svelte:182`, `NsPopoverGroup.svelte:152-154`): the hover ghost glides on `--dur-ghost` and `--ease-in-out` (`app.css:1297-1304`); the selected pill glides on `--dur-control` and `--ease-drawer` (`app.css:1315-1321`).
- Effort: bars light `BAR_STEP_MS` 40ms apart (`EffortPips.svelte:74-82,223`); the fill and pip move over `--ns-fill-ms` (`--dur-toggle`) on `--ease-in-out` (`EffortPips.svelte:331,345-348`); the knob grows over `--dur-morph` on `--ease-out` (`EffortPips.svelte:420`).
- Segmented thumb (location source) moves over `--ns-thumb-ms` (`--dur-pop`) on `--ease-in-out` (`Segmented.svelte:96`); the prompt's height eases over `--ns-prompt-ms` (`--dur-pop`) on `--ease-in-out` (`PromptEditor.svelte:375`).

### Reduced motion

- Every `ns-*` animation runs only under `prefers-reduced-motion: no-preference`: the card and scrim (`NewSessionDialog.svelte:1525-1538`), the sections (`:1619-1622`), `.ns-in`, `.ns-check` and `.ns-panel` (`ns-theme.css:137-152`), the popover entrance, exit and glide (`ns-theme.css:286-321,354-362`), and the lifetime and project swap marks (`LifetimeChip.svelte:97-99`; `ProjectChip.svelte:238-242`). The phone sheet's own vaul transitions are cut by `prefers-reduced-motion: reduce` (`NewSessionDialog.svelte:1743-1749`).
- The model swap returns `animation: none` for every row when motion is reduced (`motion/list-swap.svelte.ts`, `rowAnim`/`leaveAnim`), and a retargeted popover's content fade has zero duration (`NsPopoverGroup.svelte:61-65`).

## 5. Submission

- Start is disabled while `cantStart` holds: a continuation that cannot fit, a Claude placement refusal, the hub not connected, no machine, an offline machine, an unreadable or unverified location, or a malformed repository (`NewSessionDialog.svelte:545-554,1462-1475`). `start()` repeats the busy and hub guards and `validate()` (`:1012-1020,806-820`), so Cmd/Ctrl+Enter cannot bypass the button. Cmd/Ctrl+Enter starts from the window and from the prompt (`:1153-1161`; `PromptEditor.svelte:230-232`). An empty prompt is allowed: `spawnSession` sends the prompt frame only when it trims nonempty (`client.svelte.ts:4413-4460`).
- The location is verified 600ms after it changes, and again before each spawn, with both `inspectMachine(id, path)` and `machineFs(id, "list", path)`; a missing folder (`ENOENT`) is reported as one Start creates, any other failure as unreadable (`NewSessionDialog.svelte:773-805,941-977`).
- A start spawns on every chosen machine in order, verifying each before its spawn, and stops the batch at the first failure (`:1052-1064`). Each spawn is (`:993-1011`):

```ts
spawnSession({
  machineId: target,
  cwd: draft.cwd,
  prompt: draft.prompt,
  harness: draft.harness,
  ...(modeless ? {} : { permissionMode: draft.permissionMode }),
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

- A continuation (`continueFrom`) goes to the hub as one job with the summariser and the same target options, and the dialog follows its stages until it starts, fails or is cancelled (`:701-723,1084-1135`).
- After the spawns, model use and spawn preferences are recorded, then the dialog leaves for the first new session (`:1065-1075`).

## 6. Data Sources

- `cawco.machines`, `cawco.projects`, `cawco.onlineMachines`, `cawco.liveOn(id)` and `cawco.accounts` are reactive getters over the dashboard client state (`client.svelte.ts`). Machine and project rows for the chips are derived in the dialog (`NewSessionDialog.svelte:441-476`); a project is offered on every chosen machine where it has a checkout.
- The model catalog is `models.forHarness(harness, machineIds, accountId)`, filtered to what the chosen machines run and, for Claude, what the placed account offers (`models.svelte.ts:298-315`; `NewSessionDialog.svelte:294-300`). The account placement comes from the hub (`placementFor`, `client.svelte.ts:2055`; `NewSessionDialog.svelte:250-287`).
- Model entries are canonical: ID `resolvedModel ?? value`, aliases merged, names derived by `modelName` (`model-entries.ts:27-107`), so `claude-opus-5[1m]` renders `Opus 5 · 1M`. Ordering is New (released after the harness's last spawn), Recent (by last use), All (by release, undated last), then Typed custom IDs the catalog does not cover (`groupModelEntries`, `model-entries.ts:109-157`). Custom IDs persist under `cawco-models:recent` (`models.svelte.ts:23`).
- Harness installation is read from the first machine's `harnesses` report (`NewSessionDialog.svelte:235-241`); the harness rail shows every harness and marks the missing ones (`ModelSection.svelte:196-233`).

## 7. Verification

- Type-check the dashboard with `bun run typecheck` in `apps/dashboard`; check changed files with `bun run lint:changed` from the repository root.
- The modal is verified in the running dashboard: open New Session at desktop and phone widths and check the geometry, containment, motion and payloads above.

## Modal-Relevant Tokens

The dialog reads the root tokens in `app.css` directly; `DESIGN.md` lists them
(surfaces, ink, radius, type roles, shadows, scrim, curves, durations). Only the
dialog's own names for its motion durations (`--ns-*-ms`) stay in
`ns-theme.css`.

## Must-Keep Checklist

- Keep the controlled bits-ui dialog on desktop and the kit Drawer on phones, both with `onOpenChange -> close()`, the portal, raw content primitive, focus handling, and the scrim/card z-indexes. `NewSessionDialog.svelte:1170-1228,1496-1524`.
- Keep the `submission` generation increment on close and cleanup, and the current-generation checks after every asynchronous step. `NewSessionDialog.svelte:679-687,821-825,1021-1083,1144-1152`.
- Keep the open-reset boundary: restore only harness and permission mode (and a failed continuation's own draft); keep the first prompt in sessionStorage only until close. `NewSessionDialog.svelte:622-700`.
- Keep `cawco-spawn-prefs` and `cawco-models:use` as separate stores, each written only after an actual spawn. `spawnPrefs.svelte.ts:24-43,129-143`; `modelUse.svelte.ts:11-25`; `NewSessionDialog.svelte:1068-1074,1127-1134`.
- Keep empty model and effort omitted from the payload while the effort chip shows the model's default. `NewSessionDialog.svelte:385-393,1001-1002`.
- Keep fallback to an installed harness whenever the first machine changes. `NewSessionDialog.svelte:581-594`.
- Keep the `min(980px, 100vw - 48px)` centred card capped at `100dvh - 48px`, the fixed head and footer around a shrinking scrolling body, the one-line reading slot, and the 96px Start. `NewSessionDialog.svelte:1506-1524,1539-1546,1598-1609,1649-1660`; `SessionFooter.svelte:67-77`.
- Keep popovers portaled on one shared surface, constrained by collision padding, width and available height, with measured height tweens; keep the model list a fixed 300px vertical scroller. `NsPopoverGroup.svelte:85-182`; `ns-theme.css:264-381`; `ModelSection.svelte:500-510`.
- Keep the visual-viewport sheet, safe-area padding, 44px coarse-pointer targets, and anchored phone popovers. `NewSessionDialog.svelte:1670-1723`; `ns-theme.css:363-381`; `SessionFooter.svelte:78-82`.
- Keep canonical model IDs and names, `[1m] -> " · 1M"`, aliases only for search, and New -> Recent -> All -> Typed ordering. `model-entries.ts:27-157`.
- Keep pre-spawn location verification on every machine, all Start gates, and the batch stopping at the first failure. `NewSessionDialog.svelte:545-554,773-820,941-977,1052-1064`.
- Keep the exact `spawnSession` payload shape, the separate trimmed prompt send, and post-spawn preference and model-use writes. `NewSessionDialog.svelte:993-1011,1065-1075`; `client.svelte.ts:4413-4460`.
- Keep the opening choreography and every tuned motion value in §4 "Opening choreography and tuned values": scrim and card enter/exit, section delays, popover entrance and glide, popover row staggers, the list-swap timings, highlight glides, effort and thumb timings, and the motion tokens they read. Change a value in the token JSON or at the line §4 names, never as a one-off. `NewSessionDialog.svelte:1270,1374,1393,1496-1538,1616-1623,1702-1749`; `ns-theme.css:8-19,107-152,264-362`; `motion/list-swap.svelte.ts:26-38`; `app.css:1297-1321,1697-1728`; `EffortPips.svelte:74,331,345-348,420`.
- Keep every `ns-*` animation behind `prefers-reduced-motion: no-preference`, and the list swap's `none` under reduced motion. §4 "Reduced motion".

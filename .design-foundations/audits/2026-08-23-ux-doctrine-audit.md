# UX + Doctrine Audit — CawCo dashboard

**Date:** 2026-08-23 · **Status:** open checklist · **Scope:** the 7 route surfaces + shared chrome
**Law:** `DESIGN.md` (Quiet Ledger) · `JOURNEY.md` (page specs, flows, IA)
**Method:** code read of every surface + live measurement of the running app at `localhost:3000`
(headless Chromium on :9222, `ui-observer/scan.mjs` plus direct DOM probes at 1440×900 and at
390×844 with `pointer: coarse` emulation).

Paths in this document are relative to `apps/dashboard/src/` unless stated otherwise.

---

## How to read this

Every line is a work item. Rank is **user-impact × doctrine-severity**, not file size.
A finding is only listed if it names a file and what to change.

**Already closed this session, not re-listed:** ThumbBar removal, header back button, always-on
green hub dot, context menus, per-session sprites, model+effort selection, SSR of transcript tail +
tab strip, grouped slash menu, radius-doctrine migration, hub-derived titles.

**Known and open, deliberately not re-derived here:** `--ease-out-expo` (a byte-clone of `--e-in`)
and `--ease-inout-soft`. Measured spread: **2 definitions at `app.css:487-488`, 28 use sites across
6 files** — `app.css` (12), `PermissionCard` (6), `TaskRing` (3), `SpawnPanel` (3), `EffortSlider`
(3), `NewProjectPopover` (1). One rename-and-delete pass.

---

## What the live app measures

Quoted verbatim so later claims can be checked against them.

**Spacing ladder is not what ships.** `ui-observer` on `/session` at 1440
(`as-is: 0 observations · scope: body — 1945 elements, 10608 text chars, 237 interactive, 1440x757px`)
returned `spacingValuesUsed`:

```
1:14  2:26  3:2  4:6  6:49  7:67  8:10  9:360  10:279  11:241  12:17  14:43  18:1  21:11  25:4  29:115  34:1
```

The doctrine ladder is `4 / 7 / 11 / 14 / 18 / 21 / 25 / 32`. On-ladder values total **373**;
off-ladder total **873** — **70% of every gap and padding painted on the fleet board is off the
`--space-*` ladder**, dominated by `9px ×360`, `10px ×279`, `29px ×115`, `6px ×49`.

**`/tools` at 1440 renders banned weights and off-ladder sizes.**

```
heavyN: 23   → h1 800/30px "Progress claims" · h2 700/20px · strong 600/14px · code 600/10.25px
oddN:   31   → 14px ×24, 30px ×5, 20px ×2 — none of the nine --text-* steps
radN:   62   → rounded-full computes to 3.35544e+07px (×49) and a bare 4px (×13)
```

`/session`, `/rules`, `/usage` at 1440 return **`heavyN: 0, oddN: 0, radN: 0`** — clean. The
violation is localised to the markdown/prose renderer, which `/tools` (Fleet memory) exercises.
The transcript shows the same leak at smaller volume: `heavyN: 4, oddN: 9` on
`/session/8905d2d3…`.

**At 390×844, `pointer: coarse` reports `true`, and target sizes do not hold.**

| surface | targets < 44px | of those, < 24px |
|---|---|---|
| `/tools` | **127** | **46** |
| `/session` | 51 | 12 |
| `/usage` | 17 | 13 |
| `/rules` | 10 | 3 |

DESIGN.md §Interaction states asserts "Target size ≥44×44 · `pointer: coarse` at **every** width".
That is true of the mocks and **false of the shipping app**. Concrete instances measured:
`/usage` range chips `7d 34×22`, `30d 41×22`, `90d 41×22`, `All 34×22`; `/rules` row title link
`NO QUICK FIXES 104×19` and its delete button `36×36`; `/tools` provider links `12×12` and
`Install 53×24`; `/session` row link `201×19`.

**Horizontal overflow at 390.** `.board` measures `scrollWidth 510 / clientWidth 390` on both
`/session` and `/session/[id]`. `/usage` carries **four** `overflow-x-auto` containers over their
box: `858/312`, `828/312`, `401/312`, `347/312`.

**Global nav at 390 is behind a drawer, not persistent.** Visible `a[href]` on `/usage` at 390 is
`["#main-content"]` — nothing else. `.rail` is `display: none` below 900px
(`aside class="rail hidden min-[900px]:flex"`, 9 378 chars of nav hidden). The four spokes are one
tap away behind the topbar's `Open navigation` button (`Shell.svelte:190`), which is a legitimate
pattern but is **not** what JOURNEY §Navigation model specifies ("surfaces all four spokes …
persistently"). Downgrade or amend the spec — do not leave the two disagreeing.

**Not verified (stated honestly):**
- `project/[id]` was only rendered in its error state (`/project/x` → 38 elements, 93 text chars).
  Every `project/[id]` finding below is a code read, not a measurement.
- No pending permission request existed on any live session during the audit, so the answer row,
  its disabled state and its coarse-pointer targets are **code reads only**.
- `connecting` / `disconnected` / `error` hub states were never forced, so the connection-band
  findings are read from source, not from a render.

---

## Ranked findings

| # | Sev | Surface | Finding | Fix | Effort |
|---|---|---|---|---|---|
| 1 | High | session | **The attention queue does not exist on the board.** `AttentionQueue.svelte` is imported by nothing in `src`; `FleetBoard.svelte` renders no queue. This is JOURNEY §1 content block 3 — the surface's reason to exist. | Mount it in `FleetBoard.svelte` above the roster; sort by wait duration. | L |
| 2 | High | session | **"Needs you 0" renders while the hub is not live.** `FleetBoard.svelte:325-330` renders the `.stats` row (incl. `stat('Needs you', cawco.blocked.length)` L327) *above* the `{#if cawco.hub === 'unreachable'}` guard at L333. JOURNEY: the count is suppressed, never shown as zero, while the connection is not live. A false all-clear is the one failure the Switch interview names. | Gate the tile on `cawco.hub === 'connected'`; render an em-dash + "unknown while reconnecting" otherwise. | S |
| 3 | High | session | **The needs-you count is not a control.** `FleetBoard.svelte:315-323` renders a non-interactive `Card.Root` — no `onclick`, no role, no keyboard path. DESIGN.md §Open questions states the rule: a KPI that names the surface's job *must* be the control that reaches it. | Make the tile a `<button aria-pressed>` that sets `stateFilter='attn'` and resets `pageNo`. | S |
| 4 | High | session | **No `connecting` branch — the board claims first-use while the socket is still opening.** `FleetBoard.svelte:333-344`: during `connecting`, `machines.length === 0` falls through to `"No machines yet"`. JOURNEY requires a Tier-3 skeleton. | Add `{:else if cawco.hub === 'connecting'}` with row-shaped `<Skeleton>` (pattern exists at `FleetAgents.svelte:218`). | M |
| 5 | High | session/[id] | **No connection band on the transcript.** `routes/session/+layout.svelte` renders only `FleetBoard` + `SessionPane`; `cawco.hub` is read in exactly two places repo-wide (`SessionPane.svelte:234`, `FleetBoard.svelte:333`). The transcript can go stale in silence. | Hoist the band from `Shell.svelte:229-239` above the pane stack, and switch it on all four `ConnectionStatus` phases. | M |
| 6 | High | session/[id] | **The answer row is live while the hub is unreachable, and answering twice is possible.** `Prompt.svelte:114` never reads `cawco.hub`; `answer()` at `:61-68` has no re-entry latch and no success state. JOURNEY: disabled with the reason stated on the card, and success confirmed on the card that asked. | `disabled={cawco.hub !== 'connected'}` + stated reason; add `let sent = $state(false)`; render a settled variant. | M |
| 7 | High | session/[id] | **The permission card shows no raw payload and no originating turn.** `Prompt.svelte:138-148` renders `summary` + `command` only; an Edit/Write/WebFetch grant shows one line and nothing else. JOURNEY §2 block 4 requires the tool, the target, the turn that led to it, and a disclosed raw payload. | Port the `<details>Raw</details>` disclosure from `PermissionCard.svelte:65-102` into `Prompt.svelte`, then delete the dead file. | M |
| 8 | High | session/[id] | **Deny sits 7px from Approve.** `Prompt.svelte:209-213` — `.choice { display:flex; gap: var(--space-2) }`. JOURNEY §Triage names this as a Fitts hazard and specifies the full row width between them with an unfillable gap. | `justify-content: space-between` on `.choice`, `flex: 0 0 auto` on the pair. | S |
| 9 | High | all | **Weight ≥600 is shipping — measured, 23 elements on `/tools`.** `h1 800/30px`, `h2 700/20px`, `strong 600/14px`, `code 600/10.25px`, out of the markdown prose renderer (`lib/prose.ts`, `lib/components/ui/markdown/markdown.svelte`, consumed by `FleetMemory`, `project/[id]:440` `prose prose-sm`). Plus five authored sites: `PermissionCard.svelte:49`, `QuestionCard.svelte:141,173`, `PeekPane.svelte:261`, `HelpMenu.svelte:76,103`. Plus `app.css:48-49` registers a `font-weight: 700` `@font-face` (`TX-02-Bold.otf`). "Weight above 500" is a binary High tell. | Override the prose scale to the `--text-*` steps and 400/450/500; swap the five `font-semibold` to `font-medium`; delete the 700 `@font-face`. | M |
| 10 | High | all | **Unmodified shadcn defaults are shipping.** 22 bare `rounded` (= 4px, shadcn's ladder) across 8 files incl. `SpawnPanel.svelte`, `transcript/SessionHeader.svelte`, `HelpMenu.svelte`, `TranscriptSearch.svelte`; measured 13 elements at 4px and 49 at `calc(infinity*1px)` on `/tools`. In the 35 live `ui/*` components: `text-sm ×90`, `text-xs ×25`, `gap-2 ×40`, `px-3 ×27`, `h-9 ×12`, `shadow-xs|sm|md|lg ×11`. Binary High tell #4. | Replace bare `rounded` with `--radius-*`; `rounded-full` → `rounded-[var(--radius-pill)]`; migrate the live `ui/*` type/spacing/shadow classes to tokens. | L |
| 11 | High | all | **Pure-black shadows.** `app.css:212-215` dark block: `--shadow-sm: 0 1px 2px oklch(0 0 0 / 0.30)` … `--shadow-xl: … 0.55`. Consumed by ~20 `shadow-md/lg/xl/2xl` sites (`AttentionQueue:73`, `FleetStatusStrip:42`, `ToolMatrix:110,139,168,172,183,193`, `rules/[id]:152,192,284,341,414`, `SpawnPanel:952,983`, `NewProjectPopover:89`, `MemoryCard:113`, `DiffModal:165` — the last resolves to stock `rgb(0 0 0 / 0.25)` because `--shadow-2xl` is never overridden). `DiffModal.svelte:152` also paints `bg-black/60`. Binary High tell #6. | Alias `--shadow-sm/md/lg/xl/2xl` to `--shadow-tile/lifted/overlay/drawer`, all of which already tint from `--neutral-12` at `app.css:483-492`. | S |
| 12 | High | all | **The `--space-*` ladder is unenforceable as configured.** `app.css` has no `@theme { --spacing }` override, so every Tailwind numeric utility resolves on the 4px ladder — `p-4`=16, `gap-3`=12, `px-2.5`=10, `gap-1.5`=6, none of which are doctrine values. Measured consequence above: 70% of painted spacing is off-ladder. Off-ladder utility instances: tools **89**, project **87**, rules **49**, usage **31**. | Map `--spacing` (or a named subset) onto the 4/7/11/14/18/21/25/32 ladder in `@theme`, then sweep. `routes/rules/+page.svelte:86` shows the correct pattern already. | L |
| 13 | High | tools, rules | **Destructive controls are hover-revealed and fire immediately.** `md:opacity-0` wrappers: `FleetMcp.svelte:162`, `FleetSkills.svelte:180,263,349`, `FleetAgents.svelte:185`, `routes/rules/+page.svelte:257`. Behind them: `FleetMcp.svelte:182 remove(row)` deletes an MCP server **from every machine** with no confirm; `FleetSkills.svelte:194 forget()` / `:353 uninstall()` same; `routes/rules/+page.svelte:260 remove(row)` same. JOURNEY §tools bans hover-reveal outright (unreachable by touch, invisible to keyboard until focused). | Move edit+delete into an always-visible `⋯` overflow menu; wrap deletes in `AlertDialog` (pattern already at `FleetAgents.svelte:272-286`). | M |
| 14 | High | usage | **The surface's whole purpose is missing: there is no alert threshold.** `grep threshold routes/usage lib/cawco/usage` → one code comment (`UsageMeter.svelte:38`). `routes/usage/+page.svelte:172-176` shows spend as a bare number with nothing to compare it to. JOURNEY §7 block 2: "the total *and* the alert threshold together, so the comparison is already made." | Add a `$X of $Y budget` tile with the threshold drawn as a marker on the bar. | M |
| 15 | High | project/[id] | **The "What will apply" block does not exist.** `routes/project/[id]/+page.svelte:249-274` — the spawn popover holds a "First prompt" input and nothing else; `grep 'rule\|tool access'` → 0 hits. `SpawnPanel.svelte:770-786` has a partial MCP-only chip row. This is the single Opportunity the Steer-or-spawn journey phase asked for. | Render the project-scoped rules + MCP/skill set above the Start button. | M |
| 16 | High | project/[id] | **The spawn control stages nothing.** `+page.svelte:164-181` reads `spawnPrefs.model / .permissionMode / .effort` silently and never surfaces them; machine and harness are not selectable. The operator cannot see what they are about to launch. Three competing top-level actions in the header (`New session :245`, `Side quest :277`, `Forget project… :287`) — including a destructive one in the primary row. | Use `SpawnPanel` (which stages harness `:808` and permissions `:844`) instead of the ad-hoc popover; demote Side quest + Forget into an overflow menu. | M |
| 17 | High | usage | **No drill-in, and the row dialog is a dead end.** `routes/usage/+page.svelte` contains zero `<Button>`; `BreakdownTable.svelte:113-116 openSession(row)` opens a stats dialog (`:223-240`) with **no link to the session**. `BreakdownTable.svelte:74` defaults `sortBy='total'` (tokens), not cost. JOURNEY §7 explicitly overrules the file's own "this surface is read, not operated" stance. | Default the session tab to `costUsd`; add `Open the top-spend session` as the primary and an `Open session` action inside the dialog. | M |
| 18 | High | rules/[id] | **Placeholder-as-label on the primary field, and one of the five sections has no heading.** `:159-163` — `<span class="sr-only">Rule name</span>` + `placeholder="Name this rule"`; JOURNEY §6 Empty bans placeholder-as-label on this page by name. `:157-190` carries no `<h2>`, so "Name it" is missing while the other four exist (`:194`, `:286`, `:343`, `:416`). | Add a persistent visible label; wrap `:157-190` in `<section><h2>Name it</h2>`. | S |
| 19 | High | rules/[id] | **The action row scrolls away and validation does not move focus.** `:449` is a plain flow `<div>` at the bottom of a ~1400px form; JOURNEY: "a row that does not scroll away with the form body". `:107-111` sets `attempted = true` and returns without focusing the first invalid field. No narrow-width accordion exists (no `md:`/`lg:` collapse in the file). | `sticky bottom-0` with surface + hairline; `document.querySelector('[aria-invalid="true"]')?.focus()`; `<details>` accordion under `md`. | M |
| 20 | High | usage | **`role="button"` on a `<tr>` flattens the table for screen readers.** `BreakdownTable.svelte:184-194` — eight cell values are announced as one button label. Separately, `:149-155` renders `Tabs.List`/`Tabs.Trigger` with **no `Tabs.Content`**, so every `aria-controls` points at a panel that does not exist. | Keep the row a row; put an `<a href="/session/{row.key}">` in the first cell (the `::after` row-link pattern is already used at `routes/rules/+page.svelte:416-420`). Wrap the table in `<Tabs.Content value={tab}>`. | S |
| 21 | High | session/[id] | **`aria-live` sits on the virtualized scroller.** `Transcript.svelte:119` — `<div class="tr" role="log" aria-live="polite" {onscroll}>`. virtua mounts and unmounts rows on scroll, so every scroll gesture re-announces transcript history. | Move `aria-live` to a visually-hidden region fed only by the streaming tail; leave `role="log"` on a non-virtualized child. | S |
| 22 | High | project/[id] | **Invalid ARIA on the document lists.** `:353-359` and `:385-391` — `<div role="listbox" tabindex="0">` whose children are `<button role="option">` (`:361`, `:393`). `option` is not a valid child of `button`, and the wrapper is the only tab stop while the options are natively focusable. The compiler warning is suppressed at `:352`/`:384` rather than fixed. `docListKeydown` (`:194-208`) handles only Up/Down, including for the horizontal variant at `:380-408`. | `role="tablist"` + `role="tab"` + `aria-controls`, roving tabindex, drop the wrapper's `tabindex`; axis-aware keys with Home/End. | M |
| 23 | High | all | **Reduced motion is declared but not honoured by Svelte transitions.** 29 `in:`/`out:`/`transition:` directives carry hardcoded durations; Svelte transitions ignore the CSS media query entirely. Sites: `HelpMenu` (95,131,186), `DiffModal` (153,154,166,167), `SpawnPanel` (607,649,673,771,867,900,911,923), `TranscriptSearch` (99,100), `McpChips` (106,279), `AgentSwarm` (88,89), `AttentionQueue` (102,103), `PermissionCard:175`, `SourcesStrip:84`. Unguarded rAF: `FlowZoomTracker.svelte`, `FlowView.svelte`, `use-auto-scroll.svelte.ts` (scroll motion is exactly what SC 2.3.3 targets). | Route all of them through `motion.svelte.ts`'s existing `flipDurationMs()`/reduced-motion helper — `rail.svelte.ts:9` is the only current consumer. | M |
| 24 | High | usage | **Narrow width scrolls sideways where the spec says reflow.** Measured at 390: four `overflow-x-auto` containers over box (`858/312`, `828/312`, `401/312`, `347/312`). JOURNEY §7 Narrow width: the by-session table "**reflows from columns to stacked rows** … rather than scrolling horizontally". | Stack to two lines (session; then cost + age) below `md`. | M |
| 25 | Med | all | **Tap targets fail SC 2.5.8 at 390 under `pointer: coarse`** — see the measured table above (`/tools` 46 targets under 24px). Root causes: 120 `size="xs"\|"sm"\|"icon-sm"\|h-6\|h-8\|h-9` instances; `Sidebar.svelte:473,511` `height: 30px` rows with no coarse block anywhere in its 400-line `<style>` — and the rail *is* the phone sheet (`Shell.svelte:176-183`); `SessionTabs.svelte:192` `.tab{height:38px}` and `:295` `.tclose{18px}` with no coarse block; `SystemLine.svelte:103-114` disclosure at ~17px; `Composer.svelte:732-743` `.att button{20px}`; `EffortSlider.svelte:190-205` bare-text stops. | Add `@media (pointer: coarse)` floors mirroring `Shell.svelte:404-418`, or a 44px hit-area pseudo-element on the small controls. | L |
| 26 | Med | session | **The board's primary CTA is the wrong action.** `FleetBoard.svelte:309-312` — the primary is `Start session`. JOURNEY §1 Primary CTA is *Review what needs you* → the longest-waiting blocked session. | Add it, shown when `cawco.blockedCount > 0`, linking to the first blocked session. | S |
| 27 | Med | all | **The connection band names two states, not four.** `Shell.svelte:229-239` branches only on `everConnected`; `connecting` and `disconnected` render identical copy and `error` is never distinguished — `ConnectionStatus` has four phases (`client.svelte.ts:70`). `Shell.svelte:150-152` makes `retryIn` fall back to `0`, so the band can read `retrying in 0s` indefinitely. | Switch on `cawco.status` with four readings; suppress the countdown when `retryAt` is null. | S |
| 28 | Med | session | **Red used as ambient.** `LiveSessionRow.svelte:134` — `bg-error/10` paints the whole row bed for `activity === 'blocked'`, while the same file's `pillStatus` correctly maps blocked → `attn` (L62). `AttentionQueue.svelte:80` — the "Needs you" count wears `bg-error/15 text-error`. Needs-you is not failure; `--error-*` is reserved for a failed session and destructive confirmation (Never #3). | `--status-attn-bg` / `--status-attn-ink` for blocked; keep `--status-fail-*` for `failed`. | S |
| 29 | Med | session/[id] | **Red painted, not marked.** `SystemLine.svelte:66-73` — `.failcard` sets red border + red fill **and** red ink on the body prose. | Keep the 3px edge and the red title; return the body to `--ink-body`. | S |
| 30 | Med | usage | **Status hue as decoration on a cost figure.** `routes/usage/+page.svelte:600-604` — `.q-table td.pace { color: var(--status-attn-ink) }` tints every projectable block amber regardless of whether anything crossed a threshold. This is Never #3's named example. | `var(--ink-muted)`; reserve `--status-attn-*` for a row that has actually crossed. | S |
| 31 | Med | session/[id] | **The decision text is behind a scroller.** `PermissionCard.svelte:69,80,100` — `max-h-[200px] overflow-auto` on the command and raw payload. It wraps rather than overflowing sideways, so Never #8's worst form is avoided, but a long `Bash` command is still clipped at the moment it must be read whole. `ToolGroup.svelte:89-97` ellipsizes the tool's target path on every row with only a `title` (unreachable on touch). | Cap the card, not the decision text; two-line clamp on `.arg` instead of a single-line ellipsis. | S |
| 32 | Med | all | **Nested cards in the banned uniform-padding form** (Never #1 — *not* the permitted inset well, since padding and radius both repeat): `routes/tools/+page.svelte:68` `p-[var(--c-card-pad)]` wrapping `:210-220` `.well { padding: var(--c-card-pad) }`; `FleetMcp.svelte:39` `--radius-panel` panel inside `routes/tools/+page.svelte:66` `--radius-panel` panel (same in `FleetSkills:40`, `FleetAgents:49`); `routes/rules/+page.svelte:82-83` vs `:333`; `RuleActivity.svelte:40` vs `:66`; `routes/usage/+page.svelte:498-517` `.q-stat`/`.q-well` both `--space-4`. | Inner surface takes `--radius-well` + `--surface-field` + `--space-2`, per the signature move. | M |
| 33 | Med | rules/[id] | **Four byte-identical sections.** `:192, 284, 341, 414` are the same `flex flex-col gap-4 rounded-[var(--radius-panel)] bg-card p-5 shadow-md` — nothing signals which section is consequential. Also `bg-card` + `shadow-md` are stock shadcn where the sibling list page uses `--surface-raised` + the tinted shadow (`routes/rules/+page.svelte:81`). Never #7. | Vary density; make "What cawco sends back" dominant; move to the project's surface tokens. | S |
| 34 | Med | rules | **Errors are toast-only and the primary never disables.** `routes/rules/+page.svelte:59,72` — `toast.error()` is the only channel for toggle and delete failures, so a missed toast leaves a deleted-looking row that still exists. `:137` `New rule` is never disabled even though `data.error` is known at `:162`. | Per-row `<p role="alert">`; `disabled={!!data.error}` with the reason stated. | S |
| 35 | Med | usage | **Raw upstream strings reach the user, and empty states are indistinguishable.** `routes/usage/+page.svelte:203` rewrites only `'not signed in'` and `'token expired'`; everything else (e.g. `"the hub answered 429"`, `BreakdownTable.svelte:48`) renders raw — and neither rewrite carries a recovery action. `:206 "No limit reading yet."`, `:309 "Nothing recorded yet."` and `BreakdownTable.svelte:214` all render in the identical `.note` treatment though they are opposite answers. `:36` computes `m.limits.stale` and then discards it — a stale reading is presented as live. | Default branch with human copy + a CTA; give the limits empty state its prerequisite sentence; add an "as of" column driven by `stale`. | M |
| 36 | Med | tools | **The fleet reading is a tile, not a sentence, and the first-use state is buried.** `routes/tools/+page.svelte:104` is the 5th of five identical stat tiles; JOURNEY §4 block 2 wants one line ("all N machines reported") above the panels. Every empty state lives *inside* a panel (`FleetMcp:122-132`, `ToolMatrix:182-191`), so a fresh operator reads "this fleet has no tools" instead of "no machine has joined". Skeletons only fire when the machine list is entirely empty (`ToolMatrix:171`, `FleetMcp:193`); a registered-but-silent machine shows `Unknown` (`ToolMatrix:148`). | One-line status `<p>` between `.head` (L97) and `.stats` (L99); hoist the first-use state above L107; skeleton per row keyed on `machine.tools === undefined`. | M |
| 37 | Med | all | **Off-doctrine motion properties.** `app.css:694` transitions `box-shadow` (banned list) with a literal `100ms`; `routes/usage/+page.svelte:635` and `UsageMeter.svelte:246` transition `width`; `EffortSlider.svelte:164,182` `transition-[width]` / `transition-[left]`; `SpawnPanel` ×7 `transition:slide` (animates height/padding) at a literal 160ms; `AttentionQueue.svelte:103` `out:slide` at 160ms with `quintOut`; `routes/rules/[id]/+page.svelte:178` `transition-all`. ~27 literal-ms sites total outside the token tier. | `transform: scaleX()` for the bars; drop the `box-shadow` leg; route durations to `--c-100/300/500` and easings to `--e-in/--e-out/--e-toggle`. | M |
| 38 | Med | session/[id] | **Two blocks of the page spec are absent.** Run progress (JOURNEY §2 block 5, determinate step-and-count) does not exist — `Transcript.svelte:111-116` documents the deliberate decision not to ship it; the interrupt (`Composer.svelte:452-460`) carries no progress reading. Loading is text, not skeleton: `Transcript.svelte:121` / `StaticTail.svelte:44` `"Loading transcript…"`, `SessionPane.svelte:464` `"Opening session…"` — not a spinner (good) but not the required Tier-3 ghost rows either. The live context reading is static text (`SessionHeader.svelte:292`) while `ContextMeter.svelte` — the real reading — is mounted only in `PeekPane.svelte:336`. | Ghost rows at the `.turn`/`.trow` rhythm; a one-line determinate step count beside Stop; mount `ContextMeter` in the header `.meta`. | L |
| 39 | Med | session/[id] | **The composer declares a combobox contract it does not fulfil.** `Composer.svelte:425-441` — `<textarea role="combobox" aria-controls="composer-menu" aria-expanded>` where `#composer-menu` is `role="presentation"` (L406), with no `listbox`/`option` and no `aria-activedescendant`. `role="combobox"` is also not valid on `<textarea>`. `Prompt.svelte:120-128` renders question options as plain `<button class:sel>` with no `role="radio"`/`aria-checked` — selection is conveyed by border alone; `cawco/QuestionCard.svelte:185-192` gets this right but is dead code. | Drop the role or build a real listbox with `aria-activedescendant`; port the radio semantics into `Prompt.svelte`. | M |
| 40 | Med | session/[id] | **No focus management when a permission arrives.** `Prompt.svelte:114` mounts inside the composer's `prompts` snippet with focus still in the textarea; no `aria-live`, no autofocus, no `role="alert"`. A keyboard or screen-reader user is never told the run has blocked. | `role="alert"` on `.hitl`; move focus to Approve on mount. | S |
| 41 | Med | all | **Bare spinners and unguarded pulses.** `DiffView.svelte:138-142` — `<IconSpinner class="animate-spin">` + `"Loading diff..."`, with no `motion-reduce:animate-none`. JOURNEY: "a bare spinner is never prescribed anywhere in this document." `ContextMeter.svelte:105,175` — `animate-pulse` ×2 unguarded (`ModelIndicator:63,102` does it correctly). | Skeleton at the diff row rhythm; add `motion-reduce:animate-none`. | S |
| 42 | Med | shell | **Two hand-typed magic heights and an unfixed a11y suppression.** `Shell.svelte:312` and `Sidebar.svelte:325` both hard-code `height: 57px` (the source comment calls it "a magic layout value"); `SessionHeader.svelte:303` repeats it. `AttentionQueue.svelte:93-101` suppresses `a11y_no_noninteractive_tabindex` on an `<li tabindex="0" onkeydown>` rather than fixing it, and offers `y`/`a`/`n`/`d` single-key permission answers (`:58-68`) with no visible hint and no confirmation. | `--c-topbar-h` token; make the row a real `<button>`/`<a>` and move the key handler onto it; surface the shortcuts in `ShortcutSheet`. | S |
| 43 | Low | all | **Dead surface area, ~1500 lines.** `AttentionQueue.svelte` (unimported), `cawco/PermissionCard.svelte` + `cawco/QuestionCard.svelte` (unimported — and they hold 3 of the 5 authored `font-semibold`, so an auditor reading JOURNEY's "Destructive separation" paragraph audits the wrong file), `features/CommandPalette.svelte` + `command-groups.ts` + `command-groups.test.ts` (see the palette verdict below), 22 of 57 `lib/components/ui/*` unimported (`accordion, aspect-ratio, avatar, breadcrumb, button-group, calendar, carousel, dropdown-menu, empty, field, form, hover-card, input-otp, item, menubar, navigation-menu, progress, radio-group, range-calendar, resizable, scroll-area, spinner`), `features/index.ts` (broken barrel — 6 of 7 exports point at files that do not exist), `.custom-scrollbar` in `app.css` (0 references). | Delete, after porting item 7. | S |
| 44 | Low | all | **Comment rot.** `Shell.svelte:388-397` says "only the transform transitions" above a rule that transitions `background` and leaves `:active`'s `transform: scale(0.96)` untransitioned. `SessionTabs.svelte:195-196` claims a concentric derivation (8px control − 6px inset = 4.6px mark) that arithmetic does not support. `Sidebar.svelte:515-516` claims a concentric radius on `.folder-h`, which just sets `--radius-tile`. `SystemLine.svelte:54-65` sets `overflow-x: auto` with `white-space: pre-wrap`, which makes it dead. `SystemLine.svelte:38` uses class `fold`, never defined. `Transcript.svelte:88-89` duplicates `--e-in`'s value as a hardcoded string fallback. | Delete or correct. | S |
| 45 | Low | all | **Off-token colour literals — only two real ones left.** `ModelIndicator.svelte:88` `#000` inside an inline mask gradient; `FolderMenu.svelte:56` `oklch(0.58 0.12 ${hue})` with hand-typed L/C. Also `app.css:135` `var(--blue-9, #7aabce)` / `var(--violet-9, #705ab0)` — the vars are never defined, so the hex fallbacks *are* the shipped values; `app.css:219` `--chart-3: #b9aee6`; `app.css:188` `background: var(--accent-9) / 0.22` is invalid CSS and dead. Everything else in `src` is token-derived. | Tokenize the mask as `--mark-bite`; derive the folder hue from `--mark-*`; define or delete the chart fallbacks. | S |
| 46 | Low | all | **Class-hell, concentrated in inherited shadcn.** 48 class strings over 120 chars; 9 of the top 15 are in `lib/components/ui/` — `native-select.svelte:34` (**736 chars**), `switch.svelte:29` (594), `slider.svelte:48` (296), `drawer-content.svelte:29` (283), `sidebar.svelte:99` (273). Authored: `FlowContextMenu.svelte:67` (320), `project/[id]:465` (279), `EffortSlider.svelte:182` (253), `DiffModal.svelte:165` (248). | Extract to named consts (`Prompt.svelte:82-111` shows the pattern); delete the 22 unused `ui/*` first, which removes most of them. | M |
| 47 | Low | session/[id] | **Heading outline is unusable.** `Who.svelte:12` emits an `<h2>` per turn — a 200-turn transcript yields 200 sibling `h2`s under one `h1`, and `Prompt.svelte:116` / `transcript/QuestionCard.svelte:43` add more at the same level. `ToolGroup.svelte:118-122` applies a 44px `pointer: coarse` floor to a **non-interactive** row, inflating the one surface pinned to `compact` density. | `role="presentation"` on the speaker label; drop the coarse floor on `.trow`. | S |
| 48 | Low | all | **Duplication.** `DiffView.svelte:22-61` and `DiffModal.svelte:27-66` carry a byte-identical 36-entry `langMap`. The `.mark` block is copied near-identically across `Sidebar:648`, `SessionTabs:287`, `LiveSessionRow:247`, `StoredSessionRow:83` and `FleetBoard:439` (which uses an inline style where the others use a class). | Hoist `langMap` to a module; extract one `@utility mark`. | S |
| 49 | Low | usage | **Chart has no text equivalent.** `DailyChart.svelte:132-156` — a `BarChart` with a tooltip only; no table fallback, no `aria-label`, no `<figcaption>`. `BreakdownTable.svelte:175` renders sort direction as a visual `↑`/`↓` with no `aria-sort` on the `<th>`. | `<details><summary>View as table</summary>` over the same `points` array; add `aria-sort`. | S |

---

## Per-surface evaluation

### 1. `session` — Fleet board · **5/10**

1. **Goal.** Answer "is anything blocked, errored, or unreachable right now?" in a glance, without opening a session to trust the answer.
2. **Friction.** The board answers a *different* question than the one the operator arrived with. It leads with `Start session`, sorts by last-active, and puts the needs-you reading in a tile you cannot click. The count also lies by omission: it renders `0` while the hub is still connecting (#2), which is precisely the "false confidence beats no confidence" failure the Switch interview names as the anxiety force.
3. **Missing.** The attention queue (#1) — the largest single gap in the product. A `connecting` skeleton (#4). The `Review what needs you` primary (#26). Wait-duration ordering (`client.svelte.ts:2768-2791` returns `Object.values` order, unsorted). A Wind-down success reading: `FleetBoard.svelte:344-351` says "N machines online, no sessions running" and offers `Start session` — the opposite intent to "you can leave this alone."
4. **Shouldn't be there.** `AttentionQueue.svelte` as unmounted dead code (#43). The fleet roster exists only as a stat tile (`:328`) and a filter select (`:361-378`) while the actual roster lives in the rail — two half-rosters, no whole one.
5. **Rating.** 5/10 — the data is all present and the table is genuinely good, but the surface's headline number is both non-interactive and capable of asserting a false all-clear, and the queue behind it was never wired up.
6. **Markup/doctrine.** Weight, size and radius render **clean at 1440** (`heavyN 0, oddN 0, radN 0`). The debt is spacing (#12 — 70% off-ladder, measured here), red-as-ambient (#28), shadows (#11), and `.board` overflowing 510px into a 390px viewport. `FleetBoard.svelte:335,341,346` use `<b>` where `<h2>` belongs.

### 2. `session/[[id]]` — Transcript · **6/10**

1. **Goal.** See what one session is doing and what it is waiting on, with enough context to answer a permission request responsibly. The journey's emotional peak.
2. **Friction.** The answer row is 7px wide between grant and refusal (#8), stays clickable when the hub is gone (#6), can be double-posted (#6), and never confirms that the answer landed. For a non-Bash tool the operator is asked to consent to a one-line summary with no payload (#7).
3. **Missing.** The connection band (#5). Determinate run progress (#38). A Tier-3 skeleton (#38). The `Already answered — Denied from Telegram` resolved-elsewhere state. A live `ContextMeter` in the header (#38).
4. **Shouldn't be there.** `cawco/PermissionCard.svelte` and `cawco/QuestionCard.svelte` — unmounted, and they are the files JOURNEY's own destructive-separation paragraph cites (#43). `SystemLine.svelte:54-65`'s contradictory `overflow-x`/`pre-wrap` pair.
5. **Rating.** 6/10 — the transcript itself (virtualization, tool grouping, subagent branches, SSR tail) is the best-built thing in the app; the *decision surface* bolted to its bottom is the weakest.
6. **Markup/doctrine.** `heavyN 4, oddN 9` at 1440, all from prose (#9). `aria-live` on the virtual scroller (#21). Combobox contract unfulfilled (#39). No focus handoff on arrival (#40). Red painted rather than marked (#29). `Who.svelte` heading spam (#47). `.trow` carries a 44px coarse floor on a non-interactive row while the real answer targets rely on an unverified `pointer-coarse:h-11` variant in `Prompt.svelte:83`.

### 3. `tools` — Fleet inventory · **4/10**

1. **Goal.** Know what capability every machine has before granting a session anything.
2. **Friction.** Five structurally identical panels with the same padding, radius and rhythm and no ranking between them (#32, Never #7). At 390 it is the worst surface in the app: 127 targets under 44px and 46 under 24 (#25), plus a `646/312` sideways scroller.
3. **Missing.** The fleet status sentence, the hoisted first-use state, per-machine skeletons (#36).
4. **Shouldn't be there.** Hover-revealed, unconfirmed, fleet-wide destructive controls (#13). `ToolMatrix.svelte:164` `border-warning/40 bg-warning/10 text-warning` — an opacity-derived tint where the `--warning-3/-9/-11` scale exists and is used correctly two files over.
5. **Rating.** 4/10 — the inventory data is rich and the "one primary per panel" discipline is actually correct here (`FleetMcp.svelte:105`, header carries zero competing primaries), but the surface fails doctrine on more axes than any other.
6. **Markup/doctrine.** The only surface rendering banned weights (**23 elements: 800/700/600**) and off-ladder sizes (**31 elements at 14/20/30px**) — all from the markdown prose renderer (#9). 62 off-ladder radii incl. 13 at shadcn's 4px (#10). 89 off-ladder spacing utilities. Nested same-radius panels (#32).

### 4. `rules` — Rules list · **6/10**

1. **Goal.** See every standing rule watching the fleet, and reach a first one fast.
2. **Friction.** Delete is one immediate, unconfirmed, unrecoverable click on a hover-revealed 36×36 button (#13), sitting next to a 19px-tall row title.
3. **Missing.** Inline per-row error (#34). Hub-down disabling on `New rule` (#34). Narrow-width two-line reflow and delete-into-overflow.
4. **Shouldn't be there.** Toast-only failure reporting (#34).
5. **Rating.** 6/10 — the empty state is genuinely the best in the product (`:124` "Nothing is watching yet" + three one-click templates) and JOURNEY holds it up as the model for the other six; the row's destructive ergonomics are what pull it down.
6. **Markup/doctrine.** Clean at 1440 on weight/size/radius. `bg-card`/`shadow-md` shadcn surfaces where the sibling page uses tokens; nested `--c-card-pad` cards (#32); a 300-char class string at `:86` (hoisted to a const, so mitigated).

### 5. `rules/[id]` — Rule detail · **5/10**

1. **Goal.** Author or change one standing rule and understand what it will do.
2. **Friction.** `Save` scrolls off the bottom of a ~1400px form (#19). A failed validation marks fields but leaves focus wherever it was (#19). Four visually identical sections give no clue which one is consequential (#33).
3. **Missing.** The "Name it" heading (#18). The narrow-width accordion and sticky action row (#19). A confirm on `remove()` (`:124-134`).
4. **Shouldn't be there.** Placeholder-as-label on the primary field (#18) — banned by name for this page. `:153` renders `data.error` in `text-warning`; an error is not a warning. `:178` `transition-all duration-240`.
5. **Rating.** 5/10 — the five-section chunking and the `Delete … Cancel … Save` order are exactly right (both spec-satisfied); everything about committing the form is not.
6. **Markup/doctrine.** Uniform section treatment (Never #7), stock shadcn surfaces, `mb-1.5` (6px) off-ladder, `ease-expo` non-canonical alias.

### 6. `project/[id]` — Project detail · **4/10**

1. **Goal.** Start and steer work against one checkout — choosing the machine, the instruction, and what the session will run under, *before* it starts.
2. **Friction.** The header offers three competing top-level actions, one of them destructive (#16). The document lists are a `role="listbox"` containing `role="option"` buttons with a suppressed compiler warning and single-axis key handling (#22).
3. **Missing.** "What will apply" (#15) — the surface's whole justification per the Steer-or-spawn journey phase. Visible staging of machine, harness, model, permission mode and effort (#16); today they are read from remembered prefs and never shown.
4. **Shouldn't be there.** The ad-hoc spawn popover at `:249-274`, duplicating a `SpawnPanel` that already stages harness and permissions properly. `Forget project…` in the primary action row.
5. **Rating.** 4/10 — the `Forget project` confirm is exemplary (`:292-303` states what it does *and* does not delete), and the doc editing is solid; the spawn path, which is the reason to be here, shows the operator nothing about what they are launching.
6. **Markup/doctrine.** **Not measured live** — only the "No such project" error state rendered. Code read: 87 off-ladder spacing utilities, `shadow-md`/`shadow-xl` black in dark, `SpawnPanel` ×7 `transition:slide` at literal 160ms, bare `rounded` at `:706,775,781`, `prose prose-sm` at `:440` importing an unaudited type scale.

### 7. `usage` — Spend and limits · **3/10**

1. **Goal.** Answer "am I about to blow the budget?" as a glance against a threshold, not as a calculation.
2. **Friction.** There is no threshold anywhere on the page (#14), so the glance is a calculation by construction. `stale` is computed and thrown away (#35), so a stale reading looks live. At 390 the tables scroll sideways where the spec demands stacked reflow (#24), and 13 targets are under 24px.
3. **Missing.** The threshold (#14). Reading age (#35). Cost-ordered default (#17). The `Open the top-spend session` drill-in (#17). A chart text equivalent (#49). Empty states that read as different answers (#35).
4. **Shouldn't be there.** `role="button"` on `<tr>` (#20). `Tabs.List` with no `Tabs.Content` (#20). Amber ambient on `.pace` (#30). Raw upstream error strings (#35).
5. **Rating.** 3/10 — the lowest score in the audit, and not because it is ugly: the numbers are accurate and well-formatted, but the surface answers "what did I spend" when the journey asks "am I about to blow the budget", and the two are not the same question.
6. **Markup/doctrine.** Clean at 1440 on weight/size/radius. `width` transitions ×3 (#37), nested `--space-4` cards (#32), `rounded-[2px]` at `DailyChart.svelte:148`, a 200-line `:global {}` block at `:448-646`.

### Shared chrome — Shell, Sidebar, SessionTabs, Composer · **6/10**

1. **Goal.** Be the persistent frame: where am I, what is the hub doing, how do I get somewhere else.
2. **Friction.** The connection band collapses four states into two and can display `retrying in 0s` forever (#27). Below 900px the rail is `display: none` and the nav goes behind a drawer, which contradicts JOURNEY's "persistently" (see measurements) — decide which document is wrong. Rail rows are 30px and tab-close is 18px with no coarse floor anywhere (#25).
3. **Missing.** A coarse-pointer pass over `Sidebar.svelte` and `SessionTabs.svelte` (`Shell.svelte:404-418` already has the pattern). An accessible name on the machine status dot (`Sidebar.svelte:198-201` — hue + a `title` on a bare `<span>`) and on `Shell.svelte:215`'s icon-only link.
4. **Shouldn't be there.** Two hard-coded `57px` heights (#42) and a third in `SessionHeader`. `app.css:56-57` defines `--radius-window: 20px` as a second name for `--radius-shell`.
5. **Rating.** 6/10 — structurally sound, keyboard skip-link present, tab semantics correct; the debt is state fidelity and touch ergonomics.
6. **Markup/doctrine.** Weight-clean. Shadows black in dark (#11). Comment rot (#44). Class-hell concentrated in unused shadcn (#46).

---

## Verdict: the Jump / ⌘K palette

**It is a legitimate command surface. Keep `JumpPalette.svelte`. Delete `features/CommandPalette.svelte`, `features/command-groups.ts` and `command-groups.test.ts`.**

Reasoning:

- **`JumpPalette` is specified.** JOURNEY §1 lists it as content block 7 and quotes its groups. `JumpPalette.svelte:27` reads `const GROUPS = ['Projects', 'Machines', 'Running sessions', 'Recent sessions']` — same names, same order as the spec, cited to the same line. Populated at `:31-39 / :40-48 / :49-57 / :58-68`; empty groups are dropped at `:72-76`, so the ordering survives partial data.
- **It is reachable both ways.** `Shell.svelte:110-113` binds ⌘/Ctrl+K (guarded by `isTyping()`), and `Shell.svelte:207` wires the topbar `Jump` button to the same state — confirmed rendering at 390 in the coarse-pointer probe (`Jump 41×32`). It is *not* keyboard-only. (Its 41×32 box is an item under #25, not a reachability problem.)
- **`CommandPalette` is a remnant, and it is not the same product.** It is imported by nothing; its only inbound reference is its own import of `command-groups`. It is a *slash-command menu* taking `commands`/`filter`/`selectedIndex`/`onSelect` as props (`CommandPalette.svelte:7-13`) — an embedded child, not a dialog, with no keybinding. `transcript/Composer.svelte` re-implemented that menu inline and independently: its own `/` and `@` parser (`:158-175`), its own grouping (`:95-113`, `:177-210`), its own `data-slot` styling (`:562-610`), its own key ownership (`:275`), importing nothing from `command-groups.ts`.
- **Merging would be wrong.** Navigate-to-a-place and insert-a-slash-command are different jobs with different mount models. `command-groups.ts` is the more insidious half: it has a passing test file, so CI stays green while nothing ships it.

Net: ~275 lines deleted, zero runtime effect.

---

## Suggested execution order

1. **Truth of the board** — #2, #3, #4, #27. Small, and they are the difference between a board you can trust and one you cannot.
2. **The decision surface** — #6, #7, #8, #40, #5. The journey's emotional peak; every item is a correctness bug, not a polish item.
3. **The binary tells** — #9, #10, #11. Three of DESIGN.md's "Never" items are shipping and each is a binary High.
4. **The missing block** — #1, then #15, #14, #17. Four page-spec blocks that were never built.
5. **Ladder + touch** — #12 then #25. #12 is the root cause of most spacing findings; do it once, at `@theme`.
6. **Sweep** — #13, #23, #37, the `--ease-out-expo` rename, #43's deletions.

Gates worth stealing from the design phase: `mocks/typecheck.mjs` already fails on any weight off the ladder, any size off the nine steps, and any element at `line-height: normal`. It runs against the mocks. **Point it at the running app** and items #9 and #10 cannot regress.

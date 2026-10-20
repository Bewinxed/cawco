# W3-loading: the kit Skeleton and Spinner

Start: 682ede2877621d672bb0b38815e7d56370494dec (cutover-integration, wave 1 + theme and tokens).

## Skills
defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, emil-design-eng, transitions-dev (the part has a sweep keyframe); before reporting interface-craft (Design Critique) and ui-observer.

## Rules followed
- better-ui, *Gate motion behind the reduced-motion preference*: the sweep's `::after` exists only under `motion-safe:`; under reduced motion it is gone (rendered check: 0 of 25 placeholders carry a `::after` or an animation). The spinner keeps turning, as DESIGN.md's Reduced Motion Rule says ("an indeterminate spinner keeps turning").
- better-ui, *Transition only what changes* / *Transitions, not keyframes, for interactive state*: the sweep is an ambient loop (keyframes are right for a loop) on `translate` only; the wait-grace reveal is a one-shot `kit-fade-in`.
- better-ui, *One SVG, recolored per state*: the Spinner stays one `currentColor` SVG; size by `box`, ink by `tone`.
- better-ui, icon sizes: the Spinner's boxes are DESIGN.md's icon steps (12 beside meta text and in a badge, 16 in controls and rows).
- better-layout, *Plan for growth and clipping* / *Hold structure*: a stand-in for text takes the line box of its type role (`h-lh` under `type-*`), so it grows with zoom and the text that replaces it moves nothing; nothing is a fixed px.
- better-layout, *Align to shared edges*: words beside a mark keep the x-height bar (Mark Line Rule), so a row's bars sit where its words' bodies will.
- defensive-css: a placeholder is a `span` drawn `block`, valid in phrasing content (a `<button>`, a `<span>` row), and `overflow:hidden` clips its own sweep.
- Tailwind v4.3.3: `@theme` `--animate-*` with its `@keyframes` (tailwindcss.com/docs/animation#customizing-your-theme), `after:` variants (content `''` added by Tailwind), `bg-linear-to-r` / `from-*` / `via-*` / `to-*` stops, `h-lh`.
- Spec for the one-clock sync: https://drafts.csswg.org/css-animations-2/ "even after calling reverse() or setting the startTime on a running animation, the animation continues to observe changes in animation-play-state." So only a running sweep is moved; a held one keeps its hold.

## Variants

| Part | Prop = value | Role | DESIGN.md line | Sites |
| --- | --- | --- | --- | --- |
| Skeleton | base | the one placeholder: `surface-fill`, 8px radius, one 60% raised band per `--dur-loop`, transform only | Skeleton: "a `surface-fill` block at exactly the size of what it stands for, with an 8px radius. One band of the raised surface at 60% crosses it every 1.2s, by transform only; without motion it sits still." | every site |
| Skeleton | `line="meta"` | one line of meta text (its line box) | Typography, Meta (400, 12px, 1.35); Claim Of Nothing: "the skeleton stands in at the real layout's size" | StagesControl.svelte:209, DelegateTail.svelte:416/422/428, WorkflowRunView.svelte:252, PinList.svelte:201 |
| Skeleton | `line="label"` | one line of label text | Typography, Label (500, 13px, 1.3) | ArtifactCards.svelte:174, SheetInspector.svelte:233, StagesControl.svelte:208, TaskPane.svelte:601, project/[id]/+page.svelte:2178, PinList.svelte:200 |
| Skeleton | `line="body"` | one line of body text | Typography, Body (400, 14px, 1.45) | DecisionPage.svelte:304, PageFrame.svelte:158, FolderFile.svelte:83/84, TaskActivity.svelte:300/301, TaskOutput.svelte:163/164/165, TaskPane.svelte:602/603/604, LimitsBlock.svelte:203, WorkflowRunView.svelte:253/254, ArtifactStage.svelte:73, artifact/[id]/+page.svelte:136, PreviewPane.svelte:2536 |
| Skeleton | `line="title"` | the title role's line (18→20px at 1.25) | Typography, Title | EditorSkeleton.svelte:41 |
| Skeleton | `height="x-height"` (+ `type`) | a word's body beside a mark | The Mark Line Rule | Sidebar.svelte:650, FilesList.svelte:706/713, TranscriptSkeleton.svelte:126/132, workflows/+page.svelte:171/180/188 |
| Skeleton | `type="meta"` (new) | the meta role's x-height and ch | Typography, Meta | FilesList.svelte:713, workflows/+page.svelte:180/188 |
| Skeleton | `height="control"` | the default 36px button, a 36px menu/finder row | Buttons: "the default 36px button" | Finder.svelte:739/836/844, MentionMenu.svelte:146, workflows/+page.svelte:196 |
| Skeleton | `height="control-sm"` | a small (30px) button or chip, a rail row | Buttons (small 30px) | Sidebar.svelte:654, TaskPane.svelte:469 |
| Skeleton | `height="field"` | a text field (`c-input-h`) | Inputs and fields | SheetInspector.svelte:234 |
| Skeleton | `height="badge"` | a badge, a run's status chip | Badges: "Badge: 20px" | workflows/+page.svelte:178 |
| Skeleton | `height="chip"` | a suggestion chip (`c-suggest-chip`) | Composer suggestion chips | SuggestionChips.svelte:317 |
| Skeleton | `height="stat"` | a stat tile (`c-stat-h`) | Layout, Density: "90px stat tiles" | ProjectSpend.svelte:225 |
| Skeleton | `height="card"` | a card on a project's board (`c-skeleton-card-h`) | Skeleton: "at exactly the size of what it stands for" | project/[id]/+page.svelte:2179/2180 |
| Skeleton | `height="reason-row"` | a finder row with its reason (`c-find-skeleton-tall`) | Find rows | Finder.svelte:739 (when `item.tall`) |
| Skeleton | `height="picture"` (existing) | a card's 16:10 picture well | Artifact panel: "the pane's 16:10 well" | ArtifactCards.svelte:173 |
| Skeleton | `cell="glyph"` (existing) | a 16px glyph's cell | Icons, Sizes: 16px in rows | FilesList.svelte:704 |
| Skeleton | `cell="mark"` | an 18px identity mark (`c-row-mark`) | Identity marks | TranscriptSkeleton.svelte:54/90/151 |
| Skeleton | `cell="pin"` + `radius="pill"` | a comment pin's disc | The Comments panel: "a pin's disc"; Shapes: round for status dots | PinList.svelte:198 |
| Skeleton | `fill="frame"` | over its whole frame until the picture loads | Skeleton | Shot.svelte:318 |
| Skeleton | `reveal="wait-grace"` | unseen until `--dur-wait-grace`, then fading up; held once its cover is ready | The Real Wait Rule; component canvas: "unseen until the wait has lasted `--dur-wait-grace` and fading up over `--dur-fade`" | PreviewPane.svelte:2536 |
| Spinner | base (16px) | the spinner in a control or a row | Spinner: "a 16px ring … turning once per 1.2s loop"; Icons: "16px in controls and rows" | StopTray.svelte:845, ToolMatrix.svelte:134, HookEditor.svelte:977, MemoryEditor.svelte:660/833, UpdateCard.svelte:231, JoinedRow.svelte:110, RelayJourney.svelte:368, OlderRows.svelte:238 |
| Spinner | `box="small"` (12px) | beside meta text, in a badge | Icons, Sizes: "12px beside meta text"; Badge: "12px icons" | ForgetProjectTray.svelte:157, SessionRow.svelte:375, RolloutChip.svelte:139, SectionRow.svelte:210, RunStatus.svelte:54, TaskColumn.svelte:162, TaskFilterPopover.svelte:142 |

Kept unchanged for callers outside this list: Skeleton `height` line/figure/item/tabs/row/block/plot/view/chart/board, `width`, `radius`, `cell="rail"`, `type="label"`; Spinner `tone`, `reveal`, `box="large"`.

The sweep keeps one clock: an `{@attach}` on the part sets each running `kit-skeleton-sweep` animation's `startTime` to 0, so every placeholder crosses in step (rendered: every sweep `kit-skeleton-sweep@0/1200/linear`).

## Kit swaps
kit-swap: apps/dashboard/src/lib/cawco/Sidebar.svelte:650 Skeleton x-height label — done
kit-swap: apps/dashboard/src/lib/cawco/Sidebar.svelte:654 Skeleton control-sm — done
kit-swap: apps/dashboard/src/lib/cawco/config/EditorSkeleton.svelte:41 Skeleton line=title — done
kit-swap: apps/dashboard/src/lib/cawco/decisions/DecisionPage.svelte:304 Skeleton line=body — done
kit-swap: apps/dashboard/src/lib/cawco/decisions/PageFrame.svelte:158 Skeleton line=body — done
kit-swap: apps/dashboard/src/lib/cawco/files/ArtifactCards.svelte:173 Skeleton picture — done
kit-swap: apps/dashboard/src/lib/cawco/files/ArtifactCards.svelte:174 Skeleton line=label — done
kit-swap: apps/dashboard/src/lib/cawco/files/FilesList.svelte:704 Skeleton cell=glyph — done
kit-swap: apps/dashboard/src/lib/cawco/files/FilesList.svelte:706 Skeleton x-height label — done
kit-swap: apps/dashboard/src/lib/cawco/files/FilesList.svelte:713 Skeleton x-height meta, width=age — done
kit-swap: apps/dashboard/src/lib/cawco/find/Finder.svelte:739 Skeleton control / reason-row — done
kit-swap: apps/dashboard/src/lib/cawco/find/Finder.svelte:836 Skeleton control — done
kit-swap: apps/dashboard/src/lib/cawco/find/Finder.svelte:844 Skeleton control — done
kit-swap: apps/dashboard/src/lib/cawco/find/MentionMenu.svelte:146 Skeleton control — done
kit-swap: apps/dashboard/src/lib/cawco/preview/SheetInspector.svelte:233 Skeleton line=label — done
kit-swap: apps/dashboard/src/lib/cawco/preview/SheetInspector.svelte:234 Skeleton field — done
kit-swap: apps/dashboard/src/lib/cawco/project/FolderFile.svelte:83 Skeleton line=body — done
kit-swap: apps/dashboard/src/lib/cawco/project/FolderFile.svelte:84 Skeleton line=body — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/StagesControl.svelte:208 Skeleton line=label — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/StagesControl.svelte:209 Skeleton line=meta — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskActivity.svelte:300 Skeleton line=body — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskActivity.svelte:301 Skeleton line=body — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskOutput.svelte:163 Skeleton line=body — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskOutput.svelte:164 Skeleton line=body — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskOutput.svelte:165 Skeleton line=body — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskPane.svelte:469 Skeleton control-sm — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskPane.svelte:601 Skeleton line=label — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskPane.svelte:602 Skeleton line=body — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskPane.svelte:603 Skeleton line=body — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskPane.svelte:604 Skeleton line=body — done
kit-swap: apps/dashboard/src/lib/cawco/transcript/DelegateTail.svelte:416 Skeleton line=meta — done
kit-swap: apps/dashboard/src/lib/cawco/transcript/DelegateTail.svelte:422 Skeleton line=meta — done
kit-swap: apps/dashboard/src/lib/cawco/transcript/DelegateTail.svelte:428 Skeleton line=meta — done
kit-swap: apps/dashboard/src/lib/cawco/transcript/SuggestionChips.svelte:317 Skeleton chip — done
kit-swap: apps/dashboard/src/lib/cawco/transcript/TranscriptSkeleton.svelte:54 Skeleton cell=mark — done
kit-swap: apps/dashboard/src/lib/cawco/transcript/TranscriptSkeleton.svelte:90 Skeleton cell=mark — done
kit-swap: apps/dashboard/src/lib/cawco/transcript/TranscriptSkeleton.svelte:126 Skeleton x-height (tool verb) — done
kit-swap: apps/dashboard/src/lib/cawco/transcript/TranscriptSkeleton.svelte:132 Skeleton x-height (tool argument) — done
kit-swap: apps/dashboard/src/lib/cawco/transcript/TranscriptSkeleton.svelte:151 Skeleton cell=mark — done
kit-swap: apps/dashboard/src/lib/cawco/usage/LimitsBlock.svelte:203 Skeleton line=body — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:225 Skeleton stat — done
kit-swap: apps/dashboard/src/lib/components/features/workflows/WorkflowRunView.svelte:252 Skeleton line=meta — done
kit-swap: apps/dashboard/src/lib/components/features/workflows/WorkflowRunView.svelte:253 Skeleton line=body — done
kit-swap: apps/dashboard/src/lib/components/features/workflows/WorkflowRunView.svelte:254 Skeleton line=body — done
kit-swap: apps/dashboard/src/routes/(app)/project/[id]/+page.svelte:2178 Skeleton line=label — done
kit-swap: apps/dashboard/src/routes/(app)/project/[id]/+page.svelte:2179 Skeleton card — done
kit-swap: apps/dashboard/src/routes/(app)/project/[id]/+page.svelte:2180 Skeleton card — done
kit-swap: apps/dashboard/src/routes/(app)/workflows/+page.svelte:171 Skeleton x-height label — done
kit-swap: apps/dashboard/src/routes/(app)/workflows/+page.svelte:178 Skeleton badge — done
kit-swap: apps/dashboard/src/routes/(app)/workflows/+page.svelte:180 Skeleton x-height meta — done
kit-swap: apps/dashboard/src/routes/(app)/workflows/+page.svelte:188 Skeleton x-height meta — done
kit-swap: apps/dashboard/src/routes/(app)/workflows/+page.svelte:196 Skeleton control — done
kit-swap: apps/dashboard/src/lib/cawco/preview/PinList.svelte:198 Skeleton cell=pin radius=pill (was a `kit-skeleton` span) — done
kit-swap: apps/dashboard/src/lib/cawco/preview/PinList.svelte:200 Skeleton line=label (was a `kit-skeleton` span) — done
kit-swap: apps/dashboard/src/lib/cawco/preview/PinList.svelte:201 Skeleton line=meta (was a `kit-skeleton` span) — done
kit-swap: apps/dashboard/src/lib/cawco/preview/PreviewPane.svelte:2536 Skeleton line=body reveal=wait-grace (was a `kit-skeleton` span) — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/stage/ArtifactStage.svelte:73 Skeleton line=body (was a `kit-skeleton` span) — done
kit-swap: apps/dashboard/src/lib/cawco/transcript/Shot.svelte:318 Skeleton fill=frame (was a `kit-skeleton` span) — done
kit-swap: apps/dashboard/src/routes/artifact/[id]/+page.svelte:136 Skeleton line=body (was a `kit-skeleton` span) — done
kit-swap: apps/dashboard/src/lib/cawco/ForgetProjectTray.svelte:157 Spinner box=small — done
kit-swap: apps/dashboard/src/lib/cawco/OlderRows.svelte:238 Spinner default — done
kit-swap: apps/dashboard/src/lib/cawco/SessionRow.svelte:375 Spinner box=small — done
kit-swap: apps/dashboard/src/lib/cawco/StopTray.svelte:845 Spinner default — done
kit-swap: apps/dashboard/src/lib/cawco/ToolMatrix.svelte:134 Spinner default — done
kit-swap: apps/dashboard/src/lib/cawco/config/RolloutChip.svelte:139 Spinner box=small — done
kit-swap: apps/dashboard/src/lib/cawco/config/SectionRow.svelte:210 Spinner box=small — done
kit-swap: apps/dashboard/src/lib/cawco/config/editors/HookEditor.svelte:977 Spinner default — done
kit-swap: apps/dashboard/src/lib/cawco/config/editors/MemoryEditor.svelte:660 Spinner default — done
kit-swap: apps/dashboard/src/lib/cawco/config/editors/MemoryEditor.svelte:833 Spinner default — done
kit-swap: apps/dashboard/src/lib/cawco/home/UpdateCard.svelte:231 Spinner default — done
kit-swap: apps/dashboard/src/lib/cawco/join/JoinedRow.svelte:110 Spinner default — done
kit-swap: apps/dashboard/src/lib/cawco/relay/RelayJourney.svelte:368 Spinner default — done
kit-swap: apps/dashboard/src/lib/cawco/routines/RunStatus.svelte:54 Spinner box=small — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskColumn.svelte:162 Spinner box=small — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskFilterPopover.svelte:142 Spinner box=small — done

Listed sites: 68 of 68 swapped (52 Skeleton, 16 Spinner), plus 8 `kit-skeleton` by-name placeholders in 5 more files.

## Removed
removed: apps/dashboard/src/lib/cawco/OlderRows.svelte:238 the 12px `size-icon-sm` on a spinner standing in a 16px icon slot — DESIGN.md Icons, Sizes: "16px in controls and rows (the default for any unsized icon)"; the slot's own glyph is `size-icon-md`.
removed: apps/dashboard/src/lib/cawco/StopTray.svelte:845, ToolMatrix.svelte:134, HookEditor.svelte:977, MemoryEditor.svelte:660/833, UpdateCard.svelte:231, JoinedRow.svelte:110, RelayJourney.svelte:368 `size-icon-md`, a second statement of the Spinner's own default — DESIGN.md Spinner: "a 16px ring".
removed: apps/dashboard/src/lib/cawco/config/EditorSkeleton.svelte:41 `style="--title-h: 29px"`, a hand-kept number — the title role's line box (`line="title"`, 25px desk / 22.5px phone) is the size of the name it stands for (DESIGN.md Title, 18→20px at 1.25).
removed: apps/dashboard/src/lib/cawco/find/Finder.svelte:739 `data-tall` with `data-tall:h-…`, a state attribute set only to pick a height — the height is the part's prop (`reason-row` / `control`).
removed: apps/dashboard/src/lib/cawco/transcript/SuggestionChips.svelte:315 the `shimmer` class and `h-c-suggest-chip` on the wrapper span — `shimmer` painted text by `background-clip: text` on a span that holds no text, so it drew nothing; the chip's height is now the placeholder's own (`height="chip"`).
removed: apps/dashboard/src/app.css `.kit-skeleton` rule (components layer) and its orphaned comment — moved into the kit's `tv()` base.
removed: apps/dashboard/src/app.css `@utility shimmer`, `@property --shimmer-angle`, `@property --shimmer-image`, `@property --shimmer-text-fill`, `@keyframes tw-shimmer`, `@media (prefers-reduced-motion: reduce) { .shimmer … }` — no user.
removed: apps/dashboard/src/app.css the standalone `@keyframes kit-skeleton-sweep` — it now lives in the theme with its `--animate-skeleton-sweep` (Tailwind v4 theme keyframes).

## Sheet classes
sheet: kit-skeleton → kit recipe — its declarations are the Skeleton `tv()` base (`relative block overflow-hidden rounded-sm bg-surface-fill` and the `motion-safe:after:*` sweep); the rule is deleted, and the 8 by-name users (PinList, PreviewPane, ArtifactStage, Shot, artifact/[id]) are on the component.
sheet: shimmer → no user — its one user (SuggestionChips.svelte:315) wrapped a placeholder with no text, so `background-clip: text` painted nothing; class and rule deleted.
Descendant trace (parent's hand-off): `.kit-skeleton` had only `&::after` (its own pseudo) and `shimmer` only `&:where([dir="rtl"], [dir="rtl"] *)` (itself under an RTL ancestor); neither selector reaches a descendant part or another component, so no file joins the list.
Proof `grep -rn "kit-skeleton\b\|\bshimmer\b"` over src (excluding `kit-skeleton-sweep`, `step-shimmer`, `suggest-shimmer`): only SuggestionChips' script variable `shimmer` (a timer) and its comments, and thinking-step's `data-shimmer` attribute; no class, no rule.

## Tokens
None added. Every value is an existing token: `c-btn-h`, `c-btn-h-sm`, `c-input-h`, `c-badge-h`, `c-suggest-chip`, `c-stat-h`, `c-skeleton-card-h`, `c-find-skeleton-tall`, `c-row-mark`, `c-pin`, `c-skeleton-x-height`, `c-skeleton-age`, `icon-sm`, `icon-md`, `radius-*`, `surface-fill`, `skeleton-sheen`, `dur-loop`, and the type roles' line boxes.

## Theme additions
theme: animate skeleton-sweep
```css
/* wave 2: W3-loading */
@theme {
  --animate-skeleton-sweep: kit-skeleton-sweep var(--dur-loop) linear infinite;

  @keyframes kit-skeleton-sweep {
    to {
      translate: 100% 0;
    }
  }
}
```
Placed at the end of app.css under `/* wave 2: W3-loading */`. theme.css is generated by `bun run tokens` (scripts/build-tokens.ts ANIMATIONS), which is outside this list, so the block stands in app.css; integration may fold it into build-tokens' ANIMATIONS map.

## Compiled check
`@tailwindcss/node` 4.3.3 `compile()` over apps/dashboard/src/app.css, `build([...])`:
- `.motion-safe\:after\:animate-skeleton-sweep::after { content: var(--tw-content); animation: var(--animate-skeleton-sweep); }` and `--animate-skeleton-sweep: kit-skeleton-sweep var(--dur-loop) linear infinite;` and `@keyframes kit-skeleton-sweep { to { translate: 100% 0; } }`
- `@media (prefers-reduced-motion: no-preference) { .motion-safe\:after\:-translate-x-full::after { content: var(--tw-content); --tw-translate-x: -100%; translate: var(--tw-translate-x) var(--tw-translate-y); }`
- `.motion-safe\:after\:bg-linear-to-r::after { … --tw-gradient-position: to right; @supports (…in lab…) { --tw-gradient-position: to right in oklab; }`, `from-30%` → `--tw-gradient-from-position: 30%`, `via-skeleton-sheen` → `--tw-gradient-via: var(--skeleton-sheen)`, `to-70%` → `--tw-gradient-to-position: 70%`
- `.h-lh { height: 1lh; }`, `.h-c-badge-h { height: var(--c-badge-h); }`, `.h-c-find-skeleton-tall { height: var(--c-find-skeleton-tall); }`, `.size-c-pin { width: var(--c-pin); height: var(--c-pin); }`
- `.group-data-ready\/cover\:after\:animation-paused:is(:where(.group\/cover)[data-ready] *)::after { content: var(--tw-content); animation-play-state: paused; }`: specificity (0,2,1) beats the sweep's `.x::after` (0,1,1), so a ready cover holds the sweep whatever the source order; the element's own `animation-paused` (0,2,0) beats `.animate-wait-grace-in` (0,1,0) the same way.
Scratch folder deleted.

## Rendered check
Dev server (`CAWCO_DEV_HUB_URL=http://127.0.0.1:59999 bunx vite dev`), one playwright-core session with cached Chromium, `waitUntil: "domcontentloaded"`, `/api/**` held open so loading states stand; 1440×900 and 390×844.
- /workflows @1440: name `x-height`+label 160×6.5 r2; last run `badge` 64×20 r8 (DESIGN.md Badge 20px); started `x-height`+meta 80×6 r2; runs `x-height`+meta 24×6; actions `control` 56×36 (the row's `wf-btn` min-height `--c-btn-h` 36). Rail: group head `x-height`+label 80×6.5; rows `control-sm` 211×30. @390: same heights; the runs cell is hidden by `workflow-cards:hidden` (0×0) as the real row is.
- /config/hooks/h1 and /config/memory/x: EditorSkeleton `line="title"` 337×25 @1440 (20px × 1.25), 108×22.5 @390 (18px × 1.25).
- Every sweep: `kit-skeleton-sweep` start 0, 1200ms, linear: one clock.
- Reduced motion (/workflows @1440): 25 placeholders, 0 with `::after` content or an animation.
- Start sha vs now, same element and state (`kit-skeleton` rail row, `h-11` tabs row, the last-run cell): rect equal (8,382,211,30 / 7,199,213,44 / 462,214.7,64,20); position relative, overflow hidden, radius 8px, background oklch(0.92 0.011 83), `::after` content `""`, inset 0, `kit-skeleton-sweep 1.2s linear infinite`: equal. The one textual difference is `::after` background-image `linear-gradient(90deg, transparent 0 30%, sheen 50%, transparent 70% 100%)` → `linear-gradient(to right, transparent 30%, sheen 50%, transparent 70%)`: the same direction and the same paint (stops before 30% and past 70% extend the transparent ends).
- ui-observer (observer.browser.js in the same session): workflows skeleton table 6 observations @1440 and @390 (3 `sibling-gaps-differ`, 3 `near-miss-alignment` between the page's own `td` boxes, unchanged from start); `horizontal-overflow` hits on placeholders are `scrollWidth` counting the sweep band mid-translate inside `overflow:hidden` (clipped, as at the start sha).
Not rendered here (needs a live hub state): Spinner `box="small"` (TaskColumn "Moving…", TaskFilterPopover "Finding…", SessionRow renaming, RunStatus on /routines while a run runs), Skeleton `cell="mark"` (a session's transcript while it loads), `cell="pin"` (an artifact's Comments panel), `fill="frame"` (a transcript shot loading), `reveal="wait-grace"` (an artifact panel's stage waiting), `height="reason-row"`/`control` (the finder while it reads), `line=*` in task panes, WorkflowRunView (a workflow run's pane).

## Critique (interface-craft Design Critique, against DESIGN.md)
fixed: apps/dashboard/src/routes/(app)/workflows/+page.svelte:196 the actions stand-in was 32px (`h-space-8`, a spacing step as a height) beside a 36px button; now `control` 36px, so the row does not grow 4px when it lands.
fixed: apps/dashboard/src/routes/(app)/workflows/+page.svelte:178 the last-run stand-in now names the badge it stands for (20px), not the 20px icon step it borrowed.
fixed: apps/dashboard/src/lib/cawco/Sidebar.svelte:650 the rail group head was a 12px block, heavier than the 13px label's body; now the label's x-height bar (6.5px), as the transcript's names are.
fixed: apps/dashboard/src/lib/cawco/files/FilesList.svelte:713 the age stand-in was 14px wide (`w-space-4`); now two characters of meta (`width="age"`, 2ch), the width of "3d".
fixed: apps/dashboard/src/lib/cawco/transcript/Shot.svelte:318, PinList.svelte:198-201 placeholders were spans styled by a global class; now the one part, so they sweep on the same clock as every other.
gap: DESIGN.md's Skeleton section names neither convention for text: block stand-ins take the line box (`line=`), words beside a mark take the x-height bar (`height="x-height"`). Both are in use and both are "the size of what it stands for"; a line in DESIGN.md naming which applies where would settle it for later lanes (DESIGN.md is outside this list).
gap: apps/dashboard/src/lib/cawco/MachineAuthStatus.svelte:64 `box="large"` is 24px (`size-6`), off DESIGN.md's 12/16/20 icon scale; the caller is outside this list.
gap: apps/dashboard/src/lib/components/ui/skeleton/skeleton.svelte `height` line/figure/item/tabs/row/block/plot/view/chart/board are numeric spacing steps (h-6 … h-64) kept for callers outside this list (WhereItGoes, SkeletonRows, WorkTabs, DecisionsView, ViewRoutines, History, MemoryBody, WorkflowEditor, config/skills, view/[name]); each should become its role's token.
gap: apps/dashboard/src/app.css:2372-2389 five `!important`s (Streamdown's inline `sd-` animation/display/white-space, virtua's inline visibility/pointer-events) override inline styles a third party writes, which only `!important` can; they fail lane-relic-check because app.css is on this list, but they are not this lane's rules (foreign DOM, owned by the markdown/transcript lanes).

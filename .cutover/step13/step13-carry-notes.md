# Step 13 carry notes: merging origin/main into the integration branch

From 484c6f7c. The integration head is `ws/484c6f7c` @ 053ec0535 (595 commits past origin/main at the time of writing).

Pick-ups from the parent's earlier hand-offs are in `step13-notes.md` beside this file. That file is the per-commit record, oldest first. This file is the rule book, plus the per-file guidance for the 88 conflicts `git merge-tree --write-tree --name-only HEAD origin/main` listed at 053ec0535 (list: `mt-now.txt` beside this file).

## The one rule

**On every conflicted dashboard file, the converted form wins, and main's change is carried into it.** Main's markup, script and text land as written. Each style change lands in that file's converted form:
- utilities in markup;
- an attribute for a state, `data-slot` for a hook;
- the residual `<style>` block only where the file already keeps one (css-scope comment, kind foreign-dom/pseudo/keyframes/svg-paint).

Never take main's side of a whole `class="…"` or `<style>` hunk.

Main's deletions win: drop the converted form with them, plus every token, utility or variant only that code used. Grep that nothing references them.

## Conversion rules settled in this phase (each compiled on the repo's tailwindcss 4.3.3)

| Source CSS | Converted form | Why |
|---|---|---|
| `transition: none` (shorthand) | `transition-off` (app.css @utility, `transition: none`) | Tailwind's `transition-none` sets only transition-property and leaves the duration and curve (88cea5a17). |
| `transition-property: a, b` with no duration | `transition-property-[a,b]` (app.css @utility `transition-property-*`) | Tailwind's `transition-[…]` also writes the theme's default duration and curve (`--default-transition-*`). The source computes 0s and `ease` (88cea5a17, Finder chips). |
| `transition: X …` (property, duration, curve) | `transition-[X] dur-<token> ease-<token>` | |
| `align-items: start` / `align-self: start` / `align-content: start` / `justify-self: start` / `justify-self: end` / `align-items: end` | `items-box-start`, `self-box-start`, `content-box-start`, `justify-self-box-start`, `justify-self-box-end`, `items-box-end` (app.css) | Tailwind's `items-start` and the rest write flex-start/flex-end, which computes differently. eslint's Trigger contract allows these (366f21016). |
| `:active` press scale or tint | `pressed:` variant (build-variants.ts, beside `dark`: `&:is(:active, [data-pressed])`) where main reads `[data-pressed]`; plain `active:` elsewhere | Main's f5082a811. The kit dropdown Trigger sets data-pressed. `.pressable` and the three press-tint selectors read it too (366f21016). |
| An unconditional `:hover` (not under `(hover:hover) and (pointer:fine)`) | `[&:hover]:` | The house `hover:` is gated by the media query. |
| `li + li { border-top … }` (sibling) | `[li+&]:border-t [li+&]:border-t-<token>` | `not-first:` doesn't match the source when other siblings sit between (AccountSetup). |
| A multi-layer `background:` shorthand | `background-(--var)` with `style:--var={"…"}` | The `background-*` utility writes the shorthand. A literal with commas can't sit in a class. |
| A winner the source picks by specificity (e.g. `.fold[data-open]` over a media `.fold`) | an arbitrary variant of the same weight, e.g. `[&[data-open]]:dur-panel` | `data-open:` compiles to `:where(…)`, weight 0. house/variant-order flags the tie (UpdateCard and MovedLogins folds, 88cea5a17). |
| `font: inherit` on a control that keeps its own numeric variant | `font-family`, `font-style` and `line-height` as longhands (SideSurface residual, e879d26f4 carried in 053ec0535) | |
| `overflow: hidden` on Mark-Line sites | `overflow: clip` / `overflow-clip` | The five DESIGN-law fixes. FindRow's phone title is `group-data-phone/row:line-clamp-std-3 group-data-phone/row:overflow-clip`. |
| A scoped class passed to a child component | never matches: give the child's element its utilities or a `data-*` hook | Svelte scopes only elements in the file itself; main's 88a9a2a84 is this bug. |

- **Generated files are never hand-merged.** For `variants.css`, `tokens.css`, `theme.css`, `tokens.ts`, Tokens.swift and the colorsets, merge the sources (`design/tokens/*.json`, `apps/dashboard/scripts/build-variants.ts`, build-tokens.ts) and regenerate with `bun run tokens` and `bun run variants`. Then `bun scripts/build-tokens.ts --check` and `bun scripts/build-variants.ts --check`.
- **`--breakpoint-desk`** is 901px on this branch (theme.css:10), and `max-desk:` compiles to `@media (width < 901px)`. Main's drawer-breakpoint change (every drawer line and DRAWER_QUERY to `width < 900px`) arrives with the batch. When it lands, follow it here as `--breakpoint-desk` 901 → 900 plus the 12 literal sites, so `max-desk:` stays equal to main's `max-width: 899px`.
- **Every new `<style>` rule on main** is converted the lanes' way: no kind-5 (`bun scripts/style-residual-check.ts` reads 0 violations), no `shadcn/no-restyle` hits, and `svelte-unused-css` at 0. A new component file main adds keeps its `<style>` only if the lanes' rule keeps it. Main's PageThumb.svelte and the decision-page host files under `host/*` stay scoped (parent).

## Per-file guidance for the conflicted files

**apps/dashboard (60 files): the rule above, plus these specifics:**
- **app.css**
  - Keep every house @utility this branch adds: `transition-off`, `transition-property-*`, the box-* alignments, `outline-off`, `pressable`, …
  - Carry main's c2f91a920 rest-rule split (app.css:861–871 is identical in both trees).
  - The press-tint and pressable selectors already read `[data-pressed]` here.
- **dropdown-menu-trigger.svelte:** ours already has main's data-pressed handlers plus the `variant`/`size` props. Keep ours.
- **AttachButton.svelte:** ours is main's 88a9a2a84 + f5082a811 + 4d3562de5 in converted form (the Trigger's classes, `motion-safe:pressed:transform-(--tpress)`, touch-hit named once). Keep ours.
- **SideSurface.svelte:** ours carries e879d26f4 (font longhands). Carry main's e4c1fae18 too: pressed `light-dark(var(--surface-fill-strong), var(--surface-fill))`, and hover excludes pressed.
- **NewSessionDialog.svelte:** the scrim is `backdrop-blur-(--scrim-blur)`. Both reduce rules are `motion-reduce:transition-off!` (the source's `transition: none !important`). Carry a4826726a, b8c6d5cb9, 5d89fb138 and 250867629 as written. For c6ba940ab, the selector becomes `body[data-session-sheet] [data-vaul-overlay][data-state="closed"]` in the converted residual.
- **PreviewPane.svelte:** keep this branch's capture gate (`connected && !captured && !expand?.moving`, the Split's `moving`: 98a28f798). Carry main's PageThumbnail shape INTO that effect, plus 7d91d2615 (`data-scheme`, iframe `color-scheme: dark` in the converted form), 1691b6842, bcbed96e9 and 210f16508. Drop c65b9bfba AND its revert 88740ac2f: bb979b5d7 supersedes both.
- **Row.svelte, Transcript.svelte:** 412633f81 and 6bd0b6d97 are already carried here (ea7cc91d2, b1c3bc2b2). Take main's, and keep the converted form at the two conflict sites: the Transcript rule on `[data-slot="listing"] :global([data-item][data-drawn])`.
- **Rings, Relay, WeekMark, LimitsBlock, RecordCard, UpdateCard, MovedLogins, AccountChip, PaneDeck, MemoryBody, pending-content, resizable-handle:** keep `transition-off` (not `transition-none`).
- **Finder.svelte:** the chips use `transition-property-[…]`. Carry main's 781e8df8 Finder change (c50fc9bef/9353bf45b) into the converted form.
- **WorkTabs.svelte:** main's 0897f7bbf Badge count replaces set 5's solid pill. Drop the pill's converted form and the `count-fill-*` tokens only it used.
- **TabItem.svelte, TabsList.svelte, PaneTabs.svelte:**
  - K2's converted forms, with main's `--pick` change (`@property --pick` inherits false; `--pick: inherit` on the six elements; PaneTabs' `@property --hang-rim`) carried in their residual form.
  - b839fcf25's ring removal: TabsList `focus-mark`, DecisionNode `node-dot`, DocThumb `progress-dial`. Drop the `ring` utility 2c kept on those three.
  - The probe folder-ride must pass.
- **ProjectDetails.svelte:** main's held-block removal wins (drop the converted held block, AskHere, `placeAsker`/`askDiscard`). The box-* utilities on its rows stay.
- **AddMachineDialog.svelte:** carry 480162831, 187c5e3c3, a268dedf0, 2f97a9fb9, 350986770 and a35b28cf1 in that order. The Password field's `.hint` takes the sibling hint's converted form.
- **ScreenEdges.svelte, Shell.svelte, hang-card.svelte, ns-theme.css:**
  - c6ba940ab's selector swaps go onto the converted rules (`:root[data-bar~=…]`, `[data-scrim~=…]`, `[data-kit-sheet~=…]`, `[data-ns-morph]`, `[data-hang]`).
  - The writers (`page-marks.ts` hold/mirror) go onto the converted kit parts unchanged.
  - Shell keeps `[&:hover]:bg-border-control` on the grip, and the hosting header's `background-(--hosting-bg)`.
- **Everything else in the 60:** carry main's markup, script and text as written, and each style hunk in converted form.

**Probe kit and scripts:**
- **scripts/probe-kit/kit.ts:** keep both sides. This branch adds the build guard: `builtOutput()`, `treeKey()` (content-only key over BUILD_DIRS plus root blobs), the stamp `.svelte-kit/output/probe-tree.txt`, the shared/exclusive flock on `.svelte-kit/probe-output.lock`, and `CLAUDE_DIR_NAME`. Main's tab-return paced stream (5d1dedb69) and its `hub` param win at their lines.
- **specs/tab-return.ts:** main's file wins whole (5d1dedb69, 83131d6bd, 1d131d579, 453505fa4). Then re-add, on main's form, the "asked for by" line for EVERY task over budget (`said(task)` plus the over list, as ours at tab-return.ts:406–426), if main lacks it.
- **frames.ts, jev-mock.ts, scratch-fleet.ts, specs/home-counts.ts, specs/folder-ride.ts:** main's logic wins. Keep this branch's converted selectors: the kit selector sweep moved class hooks to `data-slot`/attributes. A spec selector naming a class the converted tree no longer writes must keep ours; `kit-selector-sweep.ts` in `$TMPDIR/scripts` checks it. scratch-fleet.ts: keep main's side where the brief says (7dfaf7602, 11c6fd0a3).
- **scripts/fmt.ts:** take main's (82490e5b0). The pin stays 1.4.3-canary.20261014.1.
- **packages/{agent,core,hub} (6 files):** this branch carries the switch-exhaustiveness change (cawco/3f97de9c). Take main's logic, re-apply the exhaustive `switch` form, and `bun scripts/states-lint.ts` must read 0 ("every switch over a union or enum is whole").
- **package.json files:**
  - By ENTRY: main's version/range/overrides for every entry both sides have, including 4018b2e09's `@types/bun ^1.4.3`, root `bits-ui ^2.19.5`, `hoist = false`, and cad666ed7's kit/vite.
  - KEEP the cutover's dashboard additions: eslint, @shadcn/lint, svelte-eslint-parser, @typescript-eslint/eslint-plugin, @typescript-eslint/parser, postcss, postcss-selector-parser, @tailwindcss/node, the `variants` script.
  - KEEP the removal of tw-animate-css.
  - With hoist=false, an undeclared import in the cutover's tooling goes into ITS OWN package.json; the earlier sweep found none.
- **bun.lock:** never hand-merged. Drop the conflicted side and let `bun install` write it.

## Proof the leaf should quote

All on PLAIN bun 1.4.3, fresh install, no `node_modules/.bun/node_modules`:
- `bun run lint` exit 0. That includes svelte-unused-css 0, build-variants `--check`, build-tokens `--check`, eslint with house/variant-order 0, and states-lint.
- `bun run typecheck`: "24 checks passed", including `packages/hub openapi:check` (which fails before the merge: it checks against origin's nightly and TestFlight tags).
- `cd apps/dashboard && bun run build`.
- `bun scripts/style-residual-check.ts`: 0 violations.

# Integration 2: notes

The integration branch is this workspace's branch (`ws/484c6f7c`); the hub pushes it. A local `integration` ref marks its start at 1a.

## Step 0: assembly (2026-10-17)

Start: `git reset --hard origin/cawco/395b940c` (1a, 2824bba65), then `git merge --no-ff` in the brief's order. Heads as merged:

| merge | branch | head |
|---|---|---|
| b5ba1940d | K1 `cawco/fb17c485` | e13f041ff |
| ddaf20a4d | K2 `cawco/0bcf1f50` | 908c069c1 |
| 0b3a69c7a | variant order `cawco/fdd881b4` | 8571c5d0f |
| d66012690 | type-roles `cawco/180a58bc` | d1bc87e3c |
| e8e88d902 | set 1 `cawco/1afacd39` | 38e254df9 |
| a33b6bdf3 | set 2 `cawco/a31a94ff` | 7cc259958 |
| 263613187 | set 3 `cawco/4ac09f9c` | 62cd8c25a |
| f79e0f483 | set 4 `cawco/603f434a` | 974c899ad |
| e73d34416 | set 5 `cawco/29668305` | df69f8895 |
| 18cb5c78e | set 6 `cawco/0bdc3676` | 025350e90 |
| a7a1b254e | set 7 `cawco/70689612` | 5019d9837 |
| fd1fe53af | set 8 `cawco/70cc6501` | 97c0476cd |
| fed4debac | set 9 `cawco/244811c1` | 4e6f21c94 |
| 1e2e56de6 | switch `cawco/3f97de9c` | b45e9bff8 |

No backup ref (`cawco-safe/*`) was needed. `bun run tokens` after the merges changed no file (the generated outputs agree with the merged JSON).

Waiting: K2's final head c7999de2b (not on origin at 16:40), and type-roles' follow-up with `.cutover/type-roles/` site lists.

### Type-roles against the sets (step 7c)

Type-roles' site commit (d1bc87e3c) touches 44 component files; 25 of them a set also changed. Four merged with a conflict. Each keeps the set's form with type-roles' per-site change re-applied:

- `transcript/SystemLine.svelte` (set 1), both note rows: set 1's `data-code:bg-none data-code:bg-auto data-code:bg-repeat` already holds type-roles' `data-code:bg-none`, so set 1's line as is.
- `views/openui/ViewTable.svelte` (set 4): set 4 put the band heads on K1's `caps-strong`, which has no `type-label`, so the table base's tabular-nums reached them (K1.md:171 records it). T's rule is `.ledger :global(tr.band th) { font: var(--type-label) … }`. Type-roles' change is "add `type-label`"; on set 4's kit form that is `variant="caps"` (`type-label px-space-3 text-ink-muted uppercase tracking-caps`, plus a checkbox rule no ViewTable head meets).
- `UsageMeter.svelte` (set 7), the "+N" slot: type-roles' `type-meta` in place of `font-body text-size-meta font-normal`, on set 7's line (`motion-reduce:transition-off`).
- `find/MentionField.svelte` (set 9): the editor takes `type-body` in place of `font-body font-normal`, on set 9's line (`outline-none outline-current`); the tip's handle takes `type-code` (type-roles' second hunk, which `--theirs` had dropped).

Every other type-roles line is in the merged tree (`$TMPDIR/scripts/tr-check.sh`: each added line found verbatim, the four above aside).

Files waiting on type-roles' per-site lists: the four above carry `changes.md`'s swaps (3d5220be2); their re-check against `site-map.tsv`, which type-roles' README names and which comes with its ce177f8d4 (not on origin, which holds 3d5220be2), runs when that head is merged. ce177f8d4's outline list (11 sites, as the orchestrator gave it) is already applied: fix 3.

## Step 2a: static gates

Before (assembled tree, 1e2e56de6):
- typecheck: `svelte-check: 620 files, 1 errors, 1 warnings` (RecordCard.svelte:185, `"unfilled-at-rest"`; Shot.svelte:218's captions)
- eslint: crashed, `TSError: Type expected.` in `house/variant-order` (recipeClasses)
- residual: `134 files with a <style> of 610; … unmapped 0; 0 violations`
- svelte-unused-css: `610 file(s), no style rule pruned`
- states-lint: `every switch over a union or enum is whole (1414 files)`
- ratchet: `416 numeric spacing utilities (baseline 518)`
- tokens `--check`: `the token source conforms and every output matches the committed files (241 files)` (the pre-fix `--check`; main's fixed one comes in phase 2)

### Later heads merged

| merge | branch | head |
|---|---|---|
| (after the gates' first pass) | K2 `cawco/0bcf1f50` | c7999de2b (Tabs `fill="none"` → `background-none p-0`; WorkTabs and TaskPanel already pass it) |
| | type-roles `cawco/180a58bc` | 3d5220be2 (`@theme inline reference` for the 50 self-named keys; `.cutover/type-roles/` lists) |

Both clean. `bun run tokens` after them changed no file. Step 7c against `changes.md`: the four conflict files carry its token swaps; set 5's two `--title-track: normal` workarounds (ProjectHead's h1, PlacePick's h2) are gone, since `type-title` no longer adds tracking and T's rule (`font: var(--type-title)`) set none.

### Fixes, by cause

Proof for each is `bun .cutover/i2-exact.ts` (Chromium, T's page against now's; cases in `.cutover/i2-cases.ts`). Final run: `i2-exact: 54 cases, 115 element states, 0 differ`. The run before the sweep fixes (`$TMPDIR/logs/exact2.log`) read 24 differ, each a loss listed below.

1. **The variant-order rule could not read seven kit recipes** (`bunx eslint src` crashed: `TSError: Type expected.`). Its recipe reader cut a `tv(…)` call's arguments with the CSS selector walker, which reads an apostrophe as a quote and knows no comments. `callArguments` reads it as script. With the recipes read, nine hits appeared:
   - popover-trigger's `badge && badgeVariants()` was worn on every trigger (UsageMeter's strip, 2): a recipe call behind a `$props()` binding is now worn only where the tag gives the prop.
   - Split's handle (2): set 5 had stacked the kit's state onto each consumer class (k-landed step 3's fix), which the rule did not credit. A pair is settled when a third class holds exactly both chains' states, writes the same longhand and ranks no lower.
   - TaskTable's created cell: `max-phone:@max-decisions-900px:hidden` (T's container rule, (0,3,2), beat the phone `td` rule, (0,2,2)). Proof: `same … created [phone|tablet|desk]: display`.
   - table-row `picks-stacks`: `data-[state=selected]:data-picked:max-phone:bg-selected-bg` (the ledger's unlayered picked fill beat the kit's selected fill). Proof: `same … row [phone|desk]: background-color`. (Nothing in the app sets `data-state="selected"` on a row.)
   - Spinner `glyph-busy`: `not-group-glyph-busy:` (T: `[data-slot="glyph"]:not([data-glyph="busy"]) > [data-for="busy"]`). Proof: busy reads `running`, a done cell (inside an outer `.group`) `paused`, as T.
   - TableCell `between`: `[tr+tr>&]:` (T: `tr.action + tr.action > td`). Proof: first row `border-top-width 0px`, second `1px`, as T.
2. **RecordCard** passed K2's removed `expanded="unfilled-at-rest"` (typecheck error); K2.md names `unfilled`.
3. **`outline: none` → `outline-off`, 18 sites** (the orchestrator's 12, plus MentionField's editor, NewSessionDialog's drawer card in DrawerContent's `look="new-session"`, LocationSection's and ProjectChip's second inputs, SectionRow's label, Composer's recalling/grown pill, ToolGroup's artifact button). Set 1's Composer form applied its reset only under has-focus, so a recalling pill at rest kept the ring colour: it is now `data-recalling:outline-off data-grown:outline-off` plus the stacked has-focus form, which outranks `field-shell`'s (0,3,0). Composer's and ToolGroup's three-longhand forms and their `--ring-off: medium` are gone. Peer's, SideSheet's and PaneTabs' are still the shorthand in CSS. Proof: every site `same … [rest]` and `[focus-visible]` on `outline-*`.
4. **Global classes the conversion dropped from markup** (the orchestrator's sweep; `$TMPDIR/scripts/class-sweep.mjs`: per file, class tokens in markup at T against now, kept where T's design system or T's global sheets draw the name, and split by whether the file's own `<style>` also styled it):
   - `num`: NeedsYouChip's count, History's total, its spend head and cells (a `font: var(--type-label)` shorthand at T reset numerics, `num`'s `!important` restored them). MoveWait's two shares and PlanRing's count had `tabular-nums` (same value), now `num` as the map writes it.
   - `ring` (Tailwind's 1px currentcolor ring, which T's scoped rules never overrode): DecisionNode's dot, DocThumb's progress ring, TabsList's focus ring.
   - `shimmer`: thinking-indicator's word lost the whole look (its own rule set only position and display). Thinking-step's active label and description lost it under reduced motion (clip, size, repeat); they take `shimmer` when active again, plus `motion-safe:data-shimmer:bg-repeat`, since T's own rule wrote `background:` (repeat) over the utility's `no-repeat`.
   - `icon-cards`: MachinesEmpty's card grid had lost app.css's grid (display, columns at three widths, gap, position).
   - `count`: TextSection's Edit button, a direct child of `.kit-section-head` (app.css `& > .count`: margin, the meta shorthand, tabular-nums). A class on a kit Button is a no-restyle hit, so Button gains `head: { count: "count" }` and TextSection passes `head="count"`: the class itself, so T's components-layer cascade under the button's own utilities holds.
   - `font-mono` (the base rule's `font-variant-ligatures: none`): 11 sites had become `font-(family-name:--font-mono)`, R3 applied to markup that already carried the class: ModelCombobox ×2, RuleTester's preview and its Textarea (K2's `face="mono-family"`, now `mono`; the `mono-family` value is deleted), TaskPanel, PeekPane ×3, ToolMatrix ×3.
   - Checked and kept: `block`/`table`/`inline`/`hidden`/`filter`/`running`/`visible` (the scoped rule set the same property, or the value is the initial or inherited one); `pressable` (20 sites now `press="pressable"`); `rail-cell` (Skeleton `cell="rail"`); TreeMark's hooks (app.css retargeted to `data-slot`); `stop.edge`/`feFlood.near` (never matched: the sites are a `div` and a script variable); the ns-theme modifiers (every site carries the attribute ns-theme.css now selects).
   - `num` on ProjectDetails' place count (found by the widened sweep below).

   **The sweep, closed at element level.** The per-file count misses a class dropped from one element and added to another in the same file (`num`'s tree total rose 115 → 180), and it read only markup. Three passes close it (`$TMPDIR/scripts/class-sweep2.mjs`, `class-sweep4.mjs`):
   - Widened: every string token in markup, `.svelte` scripts and `.ts`/`.js` modules, 502 changed files; a drop counts when T's design system or global sheets draw the name (every `@utility` in app.css, ns-theme.css, workflows.css, shadcn-svelte's tailwind.css and tw-animate-css, every class a global sheet selects), or a Tailwind candidate that file's own `<style>` also styled. No `.ts` module dropped one; the one new site was ProjectDetails' `num`.
   - Element by element: each file's elements at T and now aligned by tag sequence (the cutover keeps every element and its order): `T element/class pairs checked: 1238; unaligned: 0; not landing: 57`. Each of the 57 has no global effect: `count` (21) never under `.kit-section-head`; the ns-theme modifiers on elements without the `.ns-*` class their selector needs; `block`/`table`/`hidden`/`grid`/`inline`/`filter`/`running`/`visible` where the scoped rule set the same property or the value is initial or inherited; `edge`/`near`/PaneDeck's `deck` never matched; TreeMark's hooks retargeted; the drawer's `ns-theme` through `look="new-session"`; MemoryEditor's and the skills page's mono notes, whose unlayered `.note { font: var(--type-meta) }` overrode both `font-mono` rules at T.

   **The harness compares every property.** Each case reads its elements from source at T and now (`element`, by an anchor in the start tag) with the ancestors and custom properties they render under; the T page also loads the sheets components imported themselves at T (ns-theme.css, workflows.css); the compare's three equality rules hold. `i2-exact: 54 cases, 115 element states, 0 differ`, every standard computed property of each.

5. **The vocab-codemod's run, value for value** (`bun .cutover/i2-codemod.ts`). The foundation's codemod (run fe99827eb) rewrote T's Tailwind defaults and shadcn bridge names in markup before any lane started. `i2-vocab.ts` re-derives its rewrite from the codemod's own tables (db864be26's `vocab-codemod.ts` exports none), each class the run took out must find that rewrite among the classes the same run put in, and `i2-bare.ts` renders each distinct pair on bare elements (T's build against this tree's), every computed property of the element, its pseudo-elements and an `<svg>`/`<span>` child, at rest and in every state its variants name: `i2-codemod: 356 hunks; 145 distinct rewrites, 253 states, 0 differ; 4 dropped twins; 0 unexplained`. The four dropped `md:` twins (HookTester's sample field, KeyValueRows' two fields, RuleTester's sample: `text-X md:text-X` at T, the twin restating its base) are i2-exact cases at 700 and 900px and focus-visible, as the kit fields stand now.
6. **The lanes' own rewrites** (1a's arbitrary-value and literal-value conversions) are proven in context by phase 2's step 6 compare, every surface's computed styles against the base of record; an isolated-element pass cannot see a kit's props (`class="pressable"` became `press="pressable"` at 1a) or the ancestors a scoped rule selects through, so it was dropped. Three sites read on the way are settled here:
   - `dropdown-menu-sub-trigger`: T carried both `data-[inset]:pl-8` and `data-inset:pl-9.5`; same specificity, and `getClassOrder` puts `data-[inset]:pl-8` after, so T drew 32px. Now `data-inset:pl-space-8`, `--space-8: 32px`.
   - Shot's skeleton: T's `rounded-[inherit]` took `.frame`'s `border-radius: inherit` from `.box`'s `var(--radius-sm)`; all three are `rounded-sm` now. i2-exact: `border-top-left-radius 8px` on both.
   - Sidebar's fleet badge: T's ternary class (attention pair while anything is blocked, else the live pair) is now `tone="live"` with `data-blocked`. i2-exact, blocked and live, at rest, row hovered, row active and dark: the same 480 properties, the attention pair `oklch(0.91 0.115 95)` on `oklch(0.35 0.075 88)` light.

7. **`bun run lint`'s style greps: CompactionDivider's chevron put `filter` in a transition list** (`motion-safe:transition-[translate,scale,filter,rotate]`, set 1's form of T's own four-line `transition:`, which the line-based grep never read). The hub's gate runs the whole lint. `safari-blurs.ts` already drives this mark on the pinned WebKit (`compactionChevron`), so it follows 1a's rule for the folds and pending content (resolved.md, "style-greps"): the source's own value under a name that says why. A root token cannot hold it (`--chev-dur` and `--chev-ease` are set per state on the divider, and would resolve at `:root`), so it is app.css's `divider-chevron-turn` beside `divider-chevron`, worn as `motion-safe:divider-chevron-turn`; the mark's `--chev-durs`/`--chev-eases` are gone. Proof: `same … [rest|focus-visible|open|hovered|reduced motion] mark: 480 properties`, rest `transition-duration 0.12s, 0.12s, 0.12s, 0.16s`, focused or open `0.16s` ×4 on `cubic-bezier(0.2, 0, 0, 1)` with the turn's `cubic-bezier(0.77, 0, 0.175, 1)`, reduced motion `all 0s`.
8. **Root typecheck: `tsc tsconfig.json` read 41 errors in the `.cutover` harnesses** (1a's include, `.cutover/*.ts`, on ESNext alone; `document`, `getComputedStyle`, `CSSTransition` inside `page.evaluate`): i2-bare, i2-exact, K1's group guard and modifiers, K2's looks. Each now opens with `/// <reference lib="dom" />`. `bunx tsc -p tsconfig.json`: exit 0; `bun run typecheck`: `1 of 24 checks failed … packages/hub openapi:check` (the wire drift the brief names).

   **tokens `--check` is sound here.** With `--focus-ring-offset` changed in tokens.css it reads `tokens: 1 output(s) unlike the committed files … src/lib/tokens/tokens.css: unlike the committed file` and exits 1, leaving the file as it was. (Step 2 below rebuilt the check to compare bytes; this held only for differences its normaliser kept.)

## Step 2: main at a7e27322c (M)

`git merge --no-ff a7e27322c` on 2a's head (d8c49e69f) and type-roles' final head (ce177f8d4, merge 63dd70709; K2's c7999de2b was already in). 260 files main changed since T, 55 of them the dashboard's; 18 conflicted.

### Type-roles' `site-map.tsv` against the four 7c files

ce177f8d4 brought `site-map.tsv` (README: "all 577 role sites … the element(s) at head with their full class string"). The four files' 15 rows, each role on its element here: UsageMeter's eight (`.noline`, `.slot.more`, `.kpi`, `.pop-empty` ×3, `.provider`, `.org`, `.nm`, `.line` ×2), MentionField's editor (`type-body`), tip (`type-meta`) and handle (`type-code`), its chip's `css` verdict (the residual `.mention-chip { font: var(--type-label) }`, chips made in script), ViewTable's cell link (`type-label text-ink-row no-underline`) and its two `unmapped` ledger rows (the head's `variant="caps"`, the cells' `view`/`view-lead`, each `type-label`). SystemLine has no font site (its conflict was the `data-code` background).

### Every dashboard file main changed since T, and how it is carried

| file | main | carried |
|---|---|---|
| scripts/build-tokens.ts | `--check` that runs `bun run tokens` and puts the outputs back | one check, rebuilt (below) |
| accounts/AtLimitBlock.svelte | 9bd22d971 | set 8's form; `.work` is `flex flex-col gap-space-2 pt-space-3 pb-space-2 text-pretty text-ink-row`, as set 8 wrote its siblings; main's script and markup as main |
| client.svelte.ts | cf4691154, 80a4d51fd, 807b06c7c, 7469f85d6 | as main; the frame switch names `taken_send` (main's new kind, which its `default` took) and no longer `user_message` (gone from main's union) |
| config/deletes.ts, config/undo.ts | 647518da7 (new) | as main |
| config/holders.ts, config/rule-delete.ts | 647518da7 (deleted) | deleted |
| config/editors/{DelegateType,Hook,Mcp,Memory,Rule,Subagent}Editor.svelte | 647518da7 (Rule also 76faafab2) | set 8's form; EditorQuestion and Asker gone as on main; no class or style change |
| delegate-types.ts, fleet.ts, hooks.ts, rules.ts, hub-auth.svelte.ts, home/home-state.svelte.ts, transcript/local.ts, workspace/warm.svelte.ts, routes/(app)/+layout.server.ts | logic | as main |
| GlassCard.svelte | 76faafab2 | `strategy="fixed"`, as main |
| home/NeedsCard.svelte | 80a4d51fd | set 5's stacked peers; the three answers by `#each UPSTREAM_POSTS`, each `edge="none"` (set 5's form of `class="peer"`) |
| home/WorkTabs.svelte | 846cf4b46, 7083786c0 | the count of top-level sessions (`topOf`) as main; the pill on set 5's span: `bg-count-fill-live data-[tab=finished]:not-data-failed:bg-count-fill-done data-failed:bg-count-fill-fail text-count-fill-ink`, `{count}` alone. `data-failed:` sorts before `data-[tab=finished]:` (getClassOrder 2, 3) where M's `.count[data-failed]` comes after `[data-tab]`, so the finished fill takes the failure's negation (V.md). Set 5's wash form (`countTone`, `--wash`, `--ink`, `--count-pick`, the `.loud` copy) is deleted |
| PairingScreen.svelte | 807b06c7c | as main |
| project/ProjectHead.svelte | 76faafab2, 80a4d51fd | set 5's form; `.places`'s `padding-inline: 0` is `px-0` (set 5's `p-0` took the mark line's block padding, as T's `padding: 0` did) |
| project/UpstreamMenu.svelte | 80a4d51fd | as main (types) |
| tasks/TaskActivity, TaskFields, TaskReview.svelte | a8ec5bf7c | set 3's files whole: set 3 carries every hunk (the dock's safe-bottom, `ms-(--add-edge)`, the chips' `gap-space-3` and target margins) |
| ThreadPane.svelte | 76faafab2 | `<AlertAction>` plain: main deleted the rule set 5 had made `place="full-height"` and `flex items-center` |
| ToolMatrix.svelte | 76faafab2 | `hover-hover:opacity-0`: main's `[@media(hover:hover)]:`, the house variant of the same query; specificity (0,1,0) under the group variants' (0,2,0), as M |
| transcript/Prompt.svelte | 807b06c7c | the comment as main, on set 1's form |
| transcript/Shot.svelte | 603d9fdbd, 318df44fc | set 1's boxes and video class; main's captions script, `captionsReady`, the conditional `<track>`, its reason comments and `missing` |
| transcript/SystemLine.svelte | 288b8b542 | `{responses.lead}` on set 1's span |
| transcript/ToolGroup.svelte | 603d9fdbd, 318df44fc, 807b06c7c | merged cleanly onto set 1's form (props, the `.vtt` row's DocThumb) |
| transcript/Transcript.svelte | 735f5aea0 | merged cleanly onto set 1's form (script) |
| workspace/PaneTabs.svelte | b8b16770b | `group-data-lifted/tab:opacity-100` on both cast boxes (set 5's c63ca4a1c form); the comment as main |
| ui/alert/alert.svelte, alert-action.svelte | 76faafab2 | main's grid on K2's form (`size-icon-md`); AlertAction is main's file: K2's `place` variant's one consumer (ThreadPane) is gone, so the variant goes |
| ui/fluid-tabs/TabItem.svelte | 5fcd46907 | `[[data-variant=folder]_[data-ride]_&]:transition-off`, main's selector in its order. The brief's `in-data-ride:in-variant-folder:transition-off` compiles to (0,1,0), the folder transition's own weight, and sorts first, so the folder transition ran on under a swipe: with it in place the case read `DIFFER … [riding] … transition-property none → color, --pick`. M's rule wins by its weight, (0,4,0) over (0,3,0); this one does too, (0,3,0) over (0,1,0) |
| tokens.css, tokens.ts (with theme.css, the Apple colour sets, the decision-page kit) | 7083786c0 | regenerated by `bun run tokens`, never hand-merged |
| routes config/connections | 647518da7 | set 9's form; the row's confirm fieldset goes (removals win) |
| routes config/{delegate-types,hooks,mcp,memory,rules,skills,subagents} | 647518da7 (rules also 76faafab2) | merged cleanly on set 9's form; no class change |
| routes config/devices, motion/delegate-tray, motion/updates | 807b06c7c | the words as main |
| design/tokens/*.json | 7083786c0 | both sides' entries (merged cleanly), outputs regenerated |

Removals checked whole: the files importing AskHere, and those naming EditorQuestion, `holders` or `rule-delete`, are the same set as main's; no `telegram` is left in the dashboard (main: none).

Outside the dashboard, main's files are as main, but for: `packages/core/src/upstream-post.ts` and `packages/agent/src/upstream-posts.ts` (`case "mcp"` for `default`, the switch branch's rule, `states-lint`), and three of main's new probe specs, which read classes the cutover made hooks (as 1a's 787ed7ec0 did for strip-layout): folder-ride (`[data-slot="stack"][data-swipe]`), home-counts (TabItem's `ff-tab`, `hit`, `fold`/`sheet` hooks and `data-tab-item-selected`), config-undo (`section[data-ask]`).

### The token check, rebuilt

Both sides had a `--check`. Ours built in memory and held each output to the committed file through a normaliser (whitespace, trailing zeros, hex case and quotes set aside), since the formatter ran after the build; it passed a change it should not: with tokens.css's `inset 0 0 0 1px` edited to `inset 0 0 01px` (three lengths, a different shadow), it read `the token source conforms and every output matches the committed files (242 files)`, exit 0. Main's ran the whole `bun run tokens` over the tree and wrote the old bytes back, exact but writing the tree mid-check and blind to theme.css. Now the build formats every output in memory as `bun fmt` writes that file (`scripts/fmt.ts` `formatText`: the pinned canary on standard input under the file's path, so its options and ignores hold; a file with no parser comes back as given), so what it writes is final: `bun run tokens` is the build alone, and `--check` compares bytes. Style Dictionary only makes the Apple module's text; the colour sets go through the same `emit`, and a set no token makes is removed (check: reported). Proof:
- the new build against the old pipeline (the old build and `fmt.ts`, in a scratch worktree at 63dd70709) over the same merged sources: `same` for tokens.css, tokens.ts, theme.css, the decision-page kit, Tokens.swift, Tokens.xcassets and design/tokens (`diff -r`);
- clean: `tokens: the token source conforms and every output is byte for byte the committed file (242 files)`, exit 0, the outputs' checksum the same before and after;
- `inset 0 0 01px`: exit 1, `tokens: 1 output(s) unlike the committed files`;
- a stray `zz-stale.colorset`: the check reports `… zz-stale.colorset: committed, and no token makes it` (exit 1), the build removes it, the check reads clean again.

### Proofs: each carried style against its own rule at M

`bun .cutover/i2-exact.ts` takes a case's `at` (i2-tree's M) for its source side: that sha's build, its components' compiled `<style>`. Every property of each element compares; the values shown are the ones each case is about.
- ToolMatrix's cell actions: rest `opacity 0`, cell hovered `1`, focus within `1`.
- AtLimitBlock's work block: `padding-top 11px; padding-bottom 7px; row-gap 7px`, its label in the move switch's ink and font (the spec's own check).
- WorkTabs' pill, light and dark: live `oklch(0.5 0.15 252)`, done `oklch(0.52 0.14 140)`, failed `oklch(0.53 0.19 22)`, numeral `oklch(0.993 0.004 85)`; dark `oklch(0.74 0.12 245)`, `oklch(0.76 0.15 135)`, `oklch(0.71 0.16 20)` on `oklch(0.184 0.004 70)`.
- ProjectHead's places: `padding-top 4.96131px; padding-bottom 4.96131px; padding-left 0px`, at rest and hovered.
- PaneTabs' cast on the strip's first tab: at rest the leading box `opacity 0`; lifted `1` both; lifted and chosen in dark, `rgba(0, 0, 0, 0)` casts.
- TabItem's folder tab: rest `color, --pick` at `0.08s, 0.4s`; riding `none`; riding under reduced motion `none`.
- ThreadPane's can't-start card: the alert's columns `577.578px 106.422px` at the desk and `197.578px 106.422px` on a phone, the words in column -2, the action in -1, `column-gap 10px`.

Whole run on the merged tree: `i2-exact: 61 cases, 146 element states, 0 differ`. The codemod's: `i2-codemod: 356 hunks; 145 distinct rewrites, 253 states, 0 differ; 4 dropped twins; 0 unexplained`.

### variants.css had drifted from its generator

The same build-then-format split, and nothing compared the committed file with what `bun run variants` makes: it lacked two variants the components' selectors now read (`slot-cell-d`, `slot-work-tabs-rows`; no markup names either, so nothing drew differently). build-variants.ts now formats its file in memory (`formatText`) and writes it final; `--check` compares bytes and names each variant it would add or drop, and `bun run lint` runs it beside the token check. Proof: the new build and the old pipeline write the same bytes (`cmp`); `variants: 466 named variants, byte for byte the committed file`; on the stale file, exit 1 with `+ @custom-variant slot-cell-d (&[data-slot="cell-d"]);` and `+ @custom-variant slot-work-tabs-rows (&[data-slot="work-tabs-rows"]);`.

### main's new specs that read the carried UI, run on this tree

`bun scripts/probe-kit/run.ts <spec>` on a scratch fleet (real hub, agent, sessiond) and the built dashboard, with the three retargeted ones among them:
- folder-ride: `ALL PASS`, 3 checks: at rest every folder tab carries `color, --pick / 0.08s, 0.4s`, mid-swipe `ride=true; none / 0s`, after it lands `--pick` again (a real touch drag through CDP);
- home-counts: `ALL PASS`, 47 checks: every Working count reads 2 with the delegates on or off, and each pill in every state (chosen or not, at rest, hovered, pressed, Finished failed) holds 3:1 on its ground and its numeral 4.5:1, light and dark, from the engine and from the pixels drawn;
- config-undo: `ALL PASS`, 44 checks: every config page and editor deletes at once with Undo in the toast, connections included;
- delegate-work-control: `ALL PASS`, 4 checks, the label `x 543`, in the move switch's font and ink;
- video-captions: `ALL PASS`, 7 checks: a sidecar `.vtt` captions its video, a lone one is a file row, a removed one says "Captions file not available".
- upstream-guard: its UI half passes on this tree (10 checks: Needs you's three peers on desk and phone, one width, height and fill, keep off first; the answer reaching the hub; the menu's four radio items). It had failed on `nothing drawn at … [data-kind="choice"] .peers button:first-of-type`: the spec read NeedsCard's `.peers`, which set 5 made `data-slot="peers"` (the spec read it so at T too, inside a template string 1a's sweep did not reach). Its part (b) delegates, and stops here with `/api/work-items: 502 … cannot run a delegate on this machine: the boundary exited … this machine's CawCo runs inside another bwrap sandbox`: the kit's README, "A spec that delegates runs on the host".

### Every probe selector against the converted tree

That miss made a sweep worth doing: every string literal and template text in `scripts/probe-kit/**/*.ts`, read with the TypeScript parser, its class selectors set against the classes the dashboard wrote at T (a `class` attribute, a `class:` directive, a `<style>` or `.css` selector) and writes now. 21 names were classes at T and are not now; read one by one, four were the cutover's, and are retargeted to the hook the converted tree writes:
- upstream-guard: `.peers` → `[data-slot="peers"]`;
- two-pane-perf's layout parts: `.session-tabs` (four rules) → `[data-session-tabs]` (on PaneTabs at M too);
- keychain-unlock: `li[data-machine] .row` → `li[data-machine] [data-slot="row"]` (MachinesList's own script reads the row so);
- (with folder-ride, home-counts and config-undo above).

The other 17 are not the dashboard's: file names and paths (`.md`, `.txt`, `.log`, `.config`, `.post.json`), property paths (`permission.answer`, `color.ink`, `tool.use`, `import.meta`), the fixture pages' own `<style>` (comments.ts' `.card`, `.band`, ink.ts' `article.card`), the comment overlay's shadow root (`cawco-overlay` `.layer`, `.label`), the canvas host's own rail (`packages/agent/src/canvas-host`, `.rail-item`), and `kit-edge-fade-block`, which every scroller still carries (in `cn` arrays). The canvas specs' other classes (`.rail-box`, `.canvas-host`, `.canvas-empty`, `.canvas-refusal` …) and ink.ts' `.ink-menu`/`.ink-word` are the canvas host's and the preview overlay's (`packages/agent/src/canvas-host`, `preview-overlay/radial.ts`), which the cutover does not touch.

### tab-return (main's 735f5aea0) on both trees: the cutover restyles more on a tab switch

main's tab-return fix is carried byte for byte (Transcript.svelte's script and warm.svelte.ts: `diff` against a7e27322c, 0 lines). The spec, run on a7e27322c and then this tree back to back (paired, the same load), fails 7 checks on both: its per-task budgets (two frames on a CPU 4x slower) and a preview's `ParseHTML` are main's own under this machine's load. But in every leg this tree restyles more (the run's `work.restyled`, M → here): 1a 1183 → 1742, 1b 1688 → 2194, 2a 478 → 879, 2b 472 → 896, 2c 467 → 724, 2d 450 → 707. On the press itself (2a's pointerup) M restyles 334 elements in 10ms through targeted rules (`Related style rule on SPAN.ff-tab 8x; … DIV.pane 7x; … A.hit 5x`); here 575 in 15ms, through three whole-subtree invalidations M does not have: `Invalidation set invalidates subtree on SPAN.relative (by :has)` (the tab), `… on DIV.ff-tabs-list (by :has)` (the list), `… on A.touch-hit (by [aria-selected])` (the hit).

The mechanism: M's rule is `.ff-tab:has(.hit:active…) .fold .sheet`, the converted one `[data-slot="ff-tab"]:has([data-slot="hit"]:active…) [data-slot="fold"] [data-slot="sheet"]`. Blink's invalidation sets keep an attribute's name, not its value, so a state change on the anchor invalidates every descendant with any `data-slot` (in the kit, nearly every element), where M's class features invalidate only `.fold`/`.sheet`. It follows from the cutover's own invariant (a hook is `data-slot`) wherever a hook sits in descendant position under a state that changes. Fixing it is choosing a hook form for those places (an attribute of its own name, as `data-session-tabs` and `data-rail-item` already are), which is phase 2's step 9 to decide and measure; it goes to the orchestrator with these numbers.

### Gates on the merged tree

Before the carries (the merge as it stood): `bun run lint` stopped at states-lint (`3 switch(es) leave a case unhandled`: client.svelte.ts `taken_send`, upstream-posts.ts and upstream-post.ts `mcp`), then svelte-check `621 files, 1 errors, 0 warnings` (the switch's stale `user_message`). After:
- `bun run lint`: exit 0. `svelte-unused-css: 610 file(s), no style rule pruned`; `spacing-ratchet: 414 numeric spacing utilities (baseline 518)`; `tokens: the token source conforms and every output is byte for byte the committed file (242 files)`; `variants: 466 named variants, byte for byte the committed file`; `Checked 2110 files in 3s. No fixes applied.`; eslint clean; `134 files with a <style> of 610; declarations by kind: keyframes 134, foreign-dom 929, pseudo 229, svg-paint 44, unmapped 0; 0 violations`; `style greps: no transition-all, no filter in a transition list, no has-[.class]`; `token contrast: all 90 pairs DESIGN.md names hold`; `switch exhaustiveness: every switch over a union or enum is whole (1420 files)`.
- `bun run typecheck`: `svelte-check: 620 files, 0 errors, 0 warnings` (main's captions fix in); `packages/hub openapi:check · … · ok`; `typecheck: 24 checks passed`.
- vite build: `✔ done`.
- `git grep -l '<style' -- 'apps/dashboard/src/**/*.svelte' | wc -l`: 134.

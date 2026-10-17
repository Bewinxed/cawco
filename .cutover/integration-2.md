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

Files waiting on type-roles' per-site lists: the four above, for a re-check against `site-map.txt`.

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

Proof for each is `bun .cutover/i2-exact.ts` (Chromium, T's page against now's; cases in `.cutover/i2-cases.ts`). Final run: `i2-exact: 53 cases, 110 element states, 0 differ`. The run before the sweep fixes (`$TMPDIR/logs/exact2.log`) read 24 differ, each a loss listed below.

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

   **The harness compares every property.** Each case reads its elements from source at T and now (`element`, by an anchor in the start tag) with the ancestors and custom properties they render under; the T page also loads the sheets components imported themselves at T (ns-theme.css, workflows.css); the compare's three equality rules hold. `i2-exact: 53 cases, 110 element states, 0 differ`, every standard computed property of each.

5. **The vocab-codemod's run, value for value** (`bun .cutover/i2-codemod.ts`). The foundation's codemod (run fe99827eb) rewrote T's Tailwind defaults and shadcn bridge names in markup before any lane started. `i2-vocab.ts` re-derives its rewrite from the codemod's own tables (db864be26's `vocab-codemod.ts` exports none), each class the run took out must find that rewrite among the classes the same run put in, and `i2-bare.ts` renders each distinct pair on bare elements (T's build against this tree's), every computed property of the element, its pseudo-elements and an `<svg>`/`<span>` child, at rest and in every state its variants name: `i2-codemod: 356 hunks; 145 distinct rewrites, 253 states, 0 differ; 4 dropped twins; 0 unexplained`. The four dropped `md:` twins (HookTester's sample field, KeyValueRows' two fields, RuleTester's sample: `text-X md:text-X` at T, the twin restating its base) are i2-exact cases at 700 and 900px and focus-visible, as the kit fields stand now.
6. **The lanes' own rewrites** (1a's arbitrary-value and literal-value conversions) are proven in context by phase 2's step 6 compare, every surface's computed styles against the base of record; an isolated-element pass cannot see a kit's props (`class="pressable"` became `press="pressable"` at 1a) or the ancestors a scoped rule selects through, so it was dropped. Three sites read on the way are settled here:
   - `dropdown-menu-sub-trigger`: T carried both `data-[inset]:pl-8` and `data-inset:pl-9.5`; same specificity, and `getClassOrder` puts `data-[inset]:pl-8` after, so T drew 32px. Now `data-inset:pl-space-8`, `--space-8: 32px`.
   - Shot's skeleton: T's `rounded-[inherit]` took `.frame`'s `border-radius: inherit` from `.box`'s `var(--radius-sm)`; all three are `rounded-sm` now. i2-exact: `border-top-left-radius 8px` on both.
   - Sidebar's fleet badge: T's ternary class (attention pair while anything is blocked, else the live pair) is now `tone="live"` with `data-blocked`. i2-exact, blocked and live, at rest, row hovered, row active and dark: the same 480 properties, the attention pair `oklch(0.91 0.115 95)` on `oklch(0.35 0.075 88)` light.

7. **`bun run lint`'s style greps: CompactionDivider's chevron put `filter` in a transition list** (`motion-safe:transition-[translate,scale,filter,rotate]`, set 1's form of T's own four-line `transition:`, which the line-based grep never read). The hub's gate runs the whole lint. `safari-blurs.ts` already drives this mark on the pinned WebKit (`compactionChevron`), so it follows 1a's rule for the folds and pending content (resolved.md, "style-greps"): the source's own value under a name that says why. A root token cannot hold it (`--chev-dur` and `--chev-ease` are set per state on the divider, and would resolve at `:root`), so it is app.css's `divider-chevron-turn` beside `divider-chevron`, worn as `motion-safe:divider-chevron-turn`; the mark's `--chev-durs`/`--chev-eases` are gone. Proof: `same … [rest|focus-visible|open|hovered|reduced motion] mark: 480 properties`, rest `transition-duration 0.12s, 0.12s, 0.12s, 0.16s`, focused or open `0.16s` ×4 on `cubic-bezier(0.2, 0, 0, 1)` with the turn's `cubic-bezier(0.77, 0, 0.175, 1)`, reduced motion `all 0s`.
8. **Root typecheck: `tsc tsconfig.json` read 41 errors in the `.cutover` harnesses** (1a's include, `.cutover/*.ts`, on ESNext alone; `document`, `getComputedStyle`, `CSSTransition` inside `page.evaluate`): i2-bare, i2-exact, K1's group guard and modifiers, K2's looks. Each now opens with `/// <reference lib="dom" />`. `bunx tsc -p tsconfig.json`: exit 0; `bun run typecheck`: `1 of 24 checks failed … packages/hub openapi:check` (the wire drift the brief names).

   **tokens `--check` is sound here.** With `--focus-ring-offset` changed in tokens.css it reads `tokens: 1 output(s) unlike the committed files … src/lib/tokens/tokens.css: unlike the committed file` and exits 1, leaving the file as it was.

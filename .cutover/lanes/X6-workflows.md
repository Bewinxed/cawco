# X6-workflows: the workflows surfaces against DESIGN.md

Start 0f64468e11d27314a553e5ed64d5df3b3734c4c8. DESIGN.md lines are this tree's (the audit's L-numbers were 682ede287's).

Reads: the catalogue's own walk on the hub tape (surfaces/walk.ts `walkTapes`, the capture's pages: desk 1440×900 fine/hover, phone 390×844 coarse/none, light and dark), with a page function per read: computed style, `getBoundingClientRect`, `elementsFromPoint`, and contrast of computed colours rasterised to sRGB on a 1px canvas over the first opaque ground under the text's centre. workflows-graph-step was read with its ready assertion's `button[aria-pressed=true]` read as `[role=radio][aria-checked=true]` (the ask below).

Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable (context loader run), svelte-foundations:coding, interface-craft (Design Critique, below). emil-design-eng and transitions-dev were not loaded: no transition, animation or motion directive was added or changed.

Sources followed: https://svelteflow.dev/learn/troubleshooting/remove-attribution ("If you're using Svelte Flow at your organization and making money from it, we rely on your support … Before you remove the attribution, see the ways you can support"; `proOptions={{ hideAttribution: true }}`). The kit's Table (ledger, `stacks="phone"`) and Drawer header, as TaskTable and FilesSheet call them.

## Findings

fixed-in-wave2: workflows-graph-step (blocking 7) W7-sheets (the kit ToggleGroup) — chosen "claude" segment `data-state=on` 30px tall, ink rgb(48,44,39) on rgb(232,228,221) 10.94:1 desk light / phone light, ink rgb(236,233,226) on rgb(20,18,17) 15.4:1 dark (unchosen 4.83 / 9.26); audit read 1.27:1. L801.
fixed-in-wave2: workflows-graph, -graph-step, -graph-branch, -launch native `<select>` (L747) W7 — every select `appearance: none` with the kit's `native-select-icon` (IconUnfold, the sort-vertical glyph) beside it, 36px tall: graph 3, step 5, branch 4, launch 3, desk and phone.
fixed-in-wave2: workflows-graph textarea resize grip (L745) W7 — Description and Notes `resize: none`.

fixed: workflows-editor / workflows-program code has no syntax colour (L561) — CodeView.svelte's HighlightStyle mapped every tag to ink-strong / ink-muted with keywords at `--weight-strong`. Now each tag takes the role Shiki's css-variables theme gives it on every other code surface, through app.css's `--code-syntax-token-*` (keyword, function, string, constant, comment, punctuation), on `--code-syntax-background` (code-bg). Before: 2 colours, weights 500/400. After, desk light: keyword oklch(0.45 0.15 33) min 6.31:1, function oklch(0.43 0.1 245) 6.81, string oklch(0.42 0.105 122) 6.51, number oklch(0.44 0.115 55) 6.86, punctuation 10.94, all weight 400, on oklch(0.944 0.01 84); dark: 6.44 / 10.53 / 9.03 / 11.76 / 11.93 on oklch(0.156 0.004 70). Every token ≥ 4.5:1 (L561).
fixed: workflows-editor code well card-in-card (L565, L750) — WorkflowProgram's `data-slot=code` was a raised `shadow-tile` card with 7px padding holding a bordered recess well. Before chain: SECTION code-view bg recess border 1px r=8 → DIV.code bg raised r=10 → field. After: SECTION code-view bg code-bg, 1px `border-well`, r=10 → field; the wrapper draws nothing (bg transparent, no shadow).
fixed: workflows-graph-step Prompt in mono (L610, L619) — TemplateInput's multiline field (Prompt, Question: sentences) drew `face="mono" text="label"`. Before: "JetBrains Mono Variable". After: "Figtree Variable" 14px desk, 16px phone (The 16px Field Rule). One-line templates (Command, Path, Over) keep the Code role.
fixed: workflows-graph-branch head "branch inspector" in lower case (WORDS.md) — the head was `{node.kind} inspector` for every kind but step. Now `inspectorTitle` (workflow-ui.ts) names it from the palette's own titles: desk heads read "Branch inspector", "Step inspector", "Workflow settings".
fixed: workflows-graph-branch / -graph-step phone sheet with no title or Close, foot cut with no fade (L817) — the drawer's title was `visible={false}` and it had no header. Now the kit's Drawer.Header: "Branch inspector" 18px/500 at x113.5, Close 28×28 at the trailing edge whose touch area takes a press 21.5px out on all four sides from its centre (coarse). The scroller (sh 1207, ch 772) carries `kit-edge-fade-block` (mask linear-gradient … calc(100% - 16px) …) and `overscroll-contain`. The inspector in the sheet draws no head of its own and takes the sheet's edges: first field at x113.5, the title's x.
fixed: workflows-launch Workspace group a recess well in the dialog body (L565) — and the same well on every repeated entry of the inspector (inputs, rules, cases, options, questions, outputs, ports, schema fields) and on the step's run settings. A well is a content well (the plan, the preview), not a field group. Repeated entries are now one rule, `ENTRY` (workflow-ui.ts): ruled off the one above by a 1px `border-hairline`, on the inspector's surface (read: bg transparent, border-top 1px, desk and phone, both themes). The two plain groups take no surface (Workspace: bg transparent, padding 0).
fixed: workflows-graph palette heads at x239, rows at x247 (L635 shared edges) — the rows bleed into the palette's padding (`-mx-space-2`). After: head x=239, row content x=239.
fixed: workflows-rest table rows 596 wide in a 1170 table; plain 12px heads with no band (L639, L609) — the page's hand-built grid table is now the kit ledger (`Table.Root layout="ledger" stacks="phone"`). Desk: table 1166, each row 1166 × 44 (the 44 pitch), head band 32px, uppercase (Column head role), name column takes what Last run 110, Started 110, Runs 60 and Actions 70 leave.
fixed: workflows-rest phone rows split into "5m ago · 2 runs" and an "Actions" disclosure with no button (L641) — the `<details>` disclosure is deleted. The card is two lines: the name across it (340 × 44), then done · 5m ago · 2 runs · Run, Run at its end (310,174 54.6 × 36). Run's touch area takes a press 21.5px above its centre (coarse).
fixed: workflows-graph attribution under the canvas tools on phone (L934 reach, L645) — attribution at 320,816 70×28 overlapped the tools bar (41.5–348.5, 785–829) by 28.5×13. Now `attributionPosition="top-right"`: 320,270 on phone, clear of the tools (overlapY −486.8); 1009.6,153 on desk.
holds: workflows-run "has no page head" (L635) — the run view is a tab on the transcript's columns (WorkflowRunView.svelte's contract: "Its tab names it … so the page opens on what the tab cannot say"; L643), as a session's tab is, and a session tab has no page head. Read: the tab's label "Chip audit" at y8 (phone) / y12 (desk), RunBlock's line naming "Chip audit" with its steps at y116.
not-mine: workflows-rest "done" pill 10px glyph (L846 at 682ede287) — status-mark size, cawco/1586c4b7. WorkflowStatus's markup unchanged.

ask: scripts/probe-kit/surfaces/catalogue.ts:152 STEP_SETTINGS `fieldset:has(> legend) button[aria-pressed=true]` never holds since W7's ToggleGroup (bits-ui single items are `role="radio" aria-checked`): `workflows-graph-step` is NotReady at every pass and `workflows-graph`'s `not:` never fires (X0-coverage fixing).
ask: workflows-run lead mark invisible (L928 Solar Duotone Rule, a status glyph holds 3:1) — app.css:1460 `[data-nest-host] [data-slot="head"] > [data-slot="mark"] svg { color: var(--mark-glyph) }`, written for a delegate's head, also matches RunBlock (data-nest-host, head > mark) and paints its SessionStatus glyph oklch(0.99 0 0) on light, 1.07:1, and oklch(0.184) on dark, 1.09:1, over the status hue it carries in the tab (oklch(0.52 0.14 140), 3.76:1). Fix outside the list: scope the rule off `[data-run-block]` (app.css, or RunBlock.svelte).
ask: workflows-graph node overlap and edges through nodes (L884 at 682ede287) — positions are authored and stored (packages/core/src/workflow.ts:222, nodes draggable); the tape's scene places 260px cards (`c-wf-node-w`) 240 apart (scene.ts GRAPH x 80 / 320 / 560), overlap 11×49 … 11×86 at fit. The editor's own `add` places them 340 apart. Fixture fix: X0's scene.ts at 340 apart. Product proposal (owner's call): lay out a stored graph whose cards collide, as task-graph.ts does with dagre.
ask: the "Svelte Flow" attribution (owner's call) — W7's app.css rule draws it on purpose on four canvas hosts; xyflow asks an organization making money from it to sponsor before removing it (URL above). Hiding it is one prop per canvas, `proOptions={{ hideAttribution: true }}`, plus the app.css rule's removal.
ask: apps/dashboard/scripts/build-variants.ts `workflow-cards` (max-width 760px) has no user left; delete it with its variants.css output.

## corrected:

corrected: workflows-rest L635 "A page pads 25px on the inline start and 21px on the end, … the groups of a page … stand 18px apart" main 21px start / 21px end, groups 21px → 25px / 21px, 18px.
corrected: workflows-editor L561 "colours code blocks … through one theme on every code surface" main monochrome by design ("a token rainbow here would make the program the loudest thing") → the syntax roles.
corrected: workflows-graph-step L610 Code role main Prompt and Question in JetBrains Mono → Figtree.
corrected: workflows-rest L641 "the actions at the end" main Run behind an "Actions" disclosure on phone → Run at the card's end.

## Tokens

ask: delete `c-workflow-name-col` and `c-workflow-row-h` from design/tokens/cawco.tokens.json at integration: the hand-built table was their only user. Removed here, `bun run tokens` rewrites Tokens.swift, which holds the lane on a Mac's iOS build (none online), so it is left to integration's one regeneration.

## Interface-craft critique (Design Critique, from the engine reads)

Context: the operator's workflow authoring and run surfaces, routine and dense (Operate).
fixed: L561 the program was the only code surface without syntax colour, and set keywords in bold over the 500 ceiling's spirit (L619). Read: five roles, all 400, all ≥ 6.31:1.
fixed: L639 / L641 the list read as an unfinished table, half its card empty on desk and a disclosure for one action on phone. Read above.
fixed: L565 eight kinds of recessed tile stacked inside the raised inspector gave every entry the same weight as the inspector itself. Read: hairline-ruled entries, no fill.
fixed: L817 the phone sheet had no visible name and no way out but a swipe. Read above.
fixed: L635 palette heads and rows on two edges. Read: one edge, x239.
gap: none found in the list's files that this lane can fix; the four asks above are outside it.

## Not run

No capture or re-audit (the brief's next round). No iOS build: the lane leaves Tokens.swift untouched.

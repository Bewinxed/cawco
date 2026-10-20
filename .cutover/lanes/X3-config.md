# X3-config — Configure pages

start: 0f64468e11d27314a553e5ed64d5df3b3734c4c8

Reads are the engine's, through the probe kit's own walk (`surfaces/walk.ts`
`walkTapes`, the catalogue's entries on the hub tape, the kit's pointer per
device: desk 1440×900 fine/hover, phone 390×844 coarse/none), dark unless said.
"before" is the base 0f64468e1 read the same way, or the audit's
`pointer-reread.md` line where it already quotes the engine.

## Findings

- fixed: Blocking 1, config-cli-tools-rest 390 — L623, L639. before (reread): `table drawn 606px wide in its 304px container (table-container 43–347, table 43–649)`. Cause: ToolMatrix drew one matrix (machines × tools) with heads holding the tool's controls, scrolling sideways. Now one ledger per tool (its head: name, homepage, N/M installed, Required switch), `Table layout="ledger" stacks="phone"`, band heads, 44px rows. after: 390 `table 43,187.5 304x144 in 43,187.5 304x144 overflowX false display block th h0 tr grid h48`; 1440 `table 521,166 876x164 overflowX false th h32 uppercase ls 0.78px bg oklch(0.214 0.006 70) fs 13px tr h44 op 1 vrule 0px`.
- fixed: Config sticky footer, edge fade — L758, L769 (house edge fade). before: commit row a sibling of the scroller on the recess, the card cut hard at the scroller's foot. Now the row is the card's own sticky foot on `surface-raised`, the house fade (`c-edge-fade-len` 40px, `-phone` 16px) above it while the fields run on under it (`data-stuck`). after: hooks-editor 1440 `footer 521,825 876x68 pos sticky bg oklch(0.248 0.006 70) stuck true fade h 40px opacity 1 bgimg linear-gradient(in srgb, rgba(0,0,0,0) 0%, oklch(0.248 …`; 390 `fade h 16px opacity 1`.
- fixed: Config sticky footer, outside the card / card height jumps — L635. after: accounts-second 1440 `card 496,51 926x842`, `footer 521,825 876x68 in card true` (list pages: `card 496,51 926x842`); memory-editor 1440 `footer 521,832 876x68` held at the page's foot (bottom 900).
- fixed: Config sticky footer, 390 overhang and button height — L635, L934. before (audit): right edge x≈382 against the card's 372. after: hooks-editor 390 `footer 43,769 304x68 in card true`, Cancel `102.5,780 73x36`, Create `183,780 164x36` (default 36 per L729; areas `up +4.5 down +3.5`, need 4/4).
- fixed: Config sticky footer, hooks editors wrap to ~100px — L934, L635. before (reread): `Cancel drawn at y754, Create at y797 under it`. The row no longer wraps: what the save reaches gives way first on one line. after: hooks-editor 390 `footer 43,769 304x68`, Cancel y780, Create y780.
- fixed: Trailing controls on 390 list rows — L934, L635. before (base, 390): hooks-rest `row 36,207 318x90 | controls 80,260 179x30` (under the text); mcp-rest `controls 80,288 313x30 [… 363,288 30x30]` (3px past 390). Cause: SectionRow's `max-phone:flex-wrap` with the text at full basis. Now on a phone the row is a grid (mark | name | cluster, the meta line under name and cluster), the cluster on the trailing edge. after (390): hooks-rest `controls 168,214 179x30 trailing gap 7`; mcp-rest `controls 168,242 179x30 trailing gap 7`; connections `250,214 97x30 gap 7`; delegate-types `317,217.5 30x30 gap 7`; memory-rest/new `214,248 133x30 gap 7`; rules `271,262 76x30 gap 7`; skills `168,265.5 179x30 gap 7`. 1440 unchanged: hooks-rest `controls 1232,155.5 165x30 trailing gap 7`.
- fixed: config-mcp-rest "Signed in for the fleet" in the trailing cluster read as a status (L590) and pushed the ⋯ off-screen. It is now the row's status beside its name (kit Badge `done`, check glyph + word); McpSignIn keeps the Sign in control only. after: mcp-rest 390 cluster `179x30`, gap 7.
- fixed: config-delegate-types-editor effort segments wrap — L801 (Segmented, one groove). before (reread): `"max" drawn on a second row at y674.5 under "Unset" at y642.5`. Choice stands the kit group at `w-max` in a sideways scroller under the house edge fade, padded into an equal negative margin (L934). after 390: `segmented Effort 43,639.5 318x36 rows 1 scroller 36,632.5 318x50 auto`.
- fixed: config-hooks-editor handler segments clipped by their scroller — L934. before (reread): `::after clipped by its scroller (overflow auto), hit at +0 up / +0 down, need 7 / 7`. after 390 coarse: `seg Handler first 81x30 up +7.5 down +6.5`; delegate Harness/Effort `up +7.5 down +6.5`.
- fixed: config-hooks-editor matcher chips (23px, no area) — L934. Raw buttons moved onto the kit option chip (`chipVariants({ variant: "option" })`, `touch-hit`, `chipsVariants()` row). after 390 coarse: `matcher chip "Bash" 52x30 up +7.5 down +6.5`.
- fixed: config-accounts-rest Routing link (60x17, no area) — L934. before (reread): `hit at +1 up / +0 down, need 12.5 / 6`. after 390 coarse: `routing link 280,132.5 60x17 hit up +14 down +13 (need 13.56)`.
- fixed: config-accounts-second Looks swatches overlap — L934 (`--hit-gap-x`). before (reread): `each area meets its right neighbour's 0.5px past its edge, not at the 5.5px midpoint`. after 390 coarse: `swatch 43,321 25x25 next 79,321 midpoint 73.5: at mid-0.5 -> first at mid+0.5 -> second`.
- fixed: Inputs drawn at 30 against L252's 36 — accounts-second "Stop placing new work past", accounts-sign-in Code (and the same `size="sm"` on the at-limit, setup code and env rows). after: `input reserve 704,433 64x36`; `input Code from the sign-in page 1065,292 239.5x36` (390 `23,299 265.5x36`); `input c23-wait 64x36`, `c23-over 64x36`.
- fixed: config-memory-filtered filter field 256px on 390 (layout). after 390: `input Filter memory files 43,187 304x36` (the page's width; `phone:max-w-64` beside the rows wider).
- fixed: Page head action ~8px above the pair's centre — L635. before (audit): action y≈89 against the pair's y≈97. SectionFrame's head now centres (`items-center`), and the pair keeps 9rem beside the actions so its line wraps first. after 1440: hooks/mcp/updates `head pair centre 96.5 actions centre 96.5`; accounts `90 / 90`. after 390: hooks `pair 176w c116 actions x230-347 c116`, accounts `c90 / c90`, mcp `c106 / c106`, skills `c106 / c106`; actions wider than the room left (memory's two, subagents' two) go under the pair (`memory pair 304w c95 actions c148`).
- fixed: Destructive actions drawn neutral — L734, L729. EditorFooter's Delete (Remove account, Delete everywhere, Delete hook, Delete rule) and Models' Remove key take `variant="destructive"`. after: `"Remove account" color oklch(0.86 0.07 12) edge oklch(0.58 0.17 15)` (error-11 / error-9, dark); `"Delete everywhere"` same; `"Remove key"` same. On a phone Delete is the header ⋯ menu's only (the footer's is hidden there, as EditorFooter's doc said).
- fixed: Mono outside the Code role — L607, L610, L171–176. Titles: TitleInput's `mono` removed (explore, Name this server), MemoryEditor and SubagentEditor titles. after: `title "Figtree Variable" 20px` (1440), 18px (390). Inputs: Skills, Tools denied, Package, Source, skill/marketplace name, Matcher, phrase (regex keeps mono), sample texts, timeout → Figtree. after: `input type-skills h 36 font "Figtree Variable" 14px`, `input hook-matcher … Figtree 14px`, `hook-timeout … Figtree`. Code runs (hash, path, version, method) take `type-code` (12px). Prose error sentences in ToolMatrix's popovers → `type-body`.
- fixed: Tables aren't the ledger — L370–381, L609, L639. ToolMatrix (above) and UpdateTable: `layout="ledger"`, band heads, `ledger-stacks` cells, no outer bordered frame, no `inactive` 50% row (offline said in words). after updates 1440: `table 521,550 876x164 th h32 uppercase ls 0.78px bg oklch(0.214 0.006 70) fs 13px tr h44 op 1 vrule 0px`; 390 `display block tr grid h68`.
- fixed: Blue outside status — L578, L580. Models' connected/held disc, route dots, Phone's ok dot and the channel card's "fleet follows" tick took `status-live-*` (info blue): now `status-done-*`. after: models `check disc fill oklab(0.40208 -0.0469337 0.0761345)` (status-done-bg, dark).
- fixed: Card-in-card — L674. Matcher well (HookTester) and Try it (RuleTester) stand on the section's surface (no recess, no `p-3` off the ladder); AccountSetup's step box and "How it shows" frame dropped; Routing's at-limit well is a hairline-topped group; strategy cards take the channel card's edge (`border-control`, transparent). after: `step-box bg rgba(0,0,0,0) border 0px`; `strategy card … edge oklch(0.76 0.12 34)` (picked).
- fixed: Raw markdown backticks — L604, WORDS.md. ReadingWell renders the sentence through Coded (code face) on the kit Alert's default row; the hooks list's meta drops the marks. after: hooks-editor `well bg oklch(0.222 0.006 70) radius 10px pad 10px 12px text "When after a tool call succeeds, run … on every ma"` (no backtick).
- fixed: Empty states as plain meta — L840, L844. Phone, Skills (skills, marketplaces, plugins), Subagents (action "Write a subagent"), and Memory's no-match now the kit EmptyState (20px mark, title, line). after: `empty 43,236.5 304x143 "No phones yet …"`, `empty 43,448.5 … "No marketplaces yet …"`, `empty 43,207 304x193 "No subagents yet …"`.
- holds: Focus drawn as a border-colour change (memory filter, skills Source) — L743 sets the field's focus as "the focus ring drawn over the field's own border (inset offset), so the border becomes the ring"; the kit Input draws that recipe. Not a site defect; X1 owns the Input recipe.
- holds: Alert slab, memory "edited its own copy" — L837. FleetFault's row is the Alert recipe's warning pair: `rounded-md` (10px), `p-space-3`, `type-body`, `status-attn-bg`/`-ink`, as `ui/alert` `warning`.
- fixed-in-wave2: Disabled controls read in an enabled state (key-sent Continue, sign-in Done, skills-fetch Fetch skill, subagents Push to machines): each is the kit Button (`touch-hit` in its base). An enabled kit Button in the same layout, 390 coarse: `footer "Cancel" 73x36 up +4.5 down +3.5` (need 4/4).
- kit-swap: apps/dashboard/src/lib/components/ui/input/input.svelte — text inputs carry no `.touch-hit` (reread: hooks-editor inputs and the memory filter, `no ::after … need 4 / 4`). X1's Input part.
- kit-swap: apps/dashboard/src/lib/components/ui/toggle-group/toggle-group.svelte — the group's `flex-wrap` contradicts L801; Choice holds it at `w-max` in a scroller meanwhile. X1's ToggleGroup.
- ask: `scripts/probe-kit/surfaces/catalogue.ts` config-memory/filtered asserts `p[data-slot=note]` says /no-such-file/; the no-match line is now the kit EmptyState, so the assertion is `[data-slot=empty]` (X0's catalogue). Read today: `NotReady: … nothing visible matches p[data-slot=note]`.
- ask: bench-traffic (`routes/(app)/motion/traffic`) is outside this lane's list; its empty state is left as found.

## My calls (no DESIGN.md line settles them)

- StrategyFigure keeps its recessed stage: it is a drawn figure on the stat well's footing (L674, L507), not a nested card.
- Hook command, script, arguments, condition, URL, server and tool fields keep the mono face: what is typed there is code (L610).
- ToolMatrix's installed state is the check glyph and version in ink, no chip (L586, a quiet row).

## corrected

- corrected: config-cli-tools-rest L639 main: one sideways-scrolling matrix → one ledger per tool, a card per machine under 640px.
- corrected: config editors L635/L769 main: commit row on the recess outside the card → the card's own sticky foot with the house fade.
- corrected: Configure rows L934 main: phone cluster wrapped under the text → held on the trailing edge.
- corrected: updates L370–381 main: matrix table in a bordered frame → the ledger on the page's card.

## interface-craft critique (Design Critique, from the reads above)

- fixed: L635 page head on 390 dropped every action under the pair (`pair c 105.5 actions c 168`); the pair now keeps 9rem beside its actions (hooks 390 `c116 / c116`).
- fixed: L934 footer buttons and segments reach their areas at 390 coarse (`Cancel up +4.5 down +3.5`, `Handler up +7.5 down +6.5`).
- gap: none open that a DESIGN.md line names. On 390 a row with a three-control cluster leaves its name 77px (`name 80,220.5 77x17`); L625 settles it ("the name gives way first"), so it stands as designed.

## Gates

See the report (finish_item) for the gate tails.

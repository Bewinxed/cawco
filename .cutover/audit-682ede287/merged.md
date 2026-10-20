# Cutover audit of 682ede287 against DESIGN.md: merged defect list

Four Sonnet reviews (clearshot + interface-craft), 182 entries, 1440 light and 390 dark of each. Per-entry tables with capture, region and DESIGN.md line are in group-00.md … group-03.md (each report's own X/S ids are local to it). Sizes and contrast are by eye; every item needs an engine read before and after its fix.

## How to read this
- **Spacing:** DESIGN.md's spacing ladder (4, 7, 11, 14, 18, 21, 25, 32; L469, L635) is not a 4px grid. My brief said "4px grid". That was wrong, and every reviewer audited against the ladder instead.
- **Status marks:** the solid ≥16px status-mark rule lives on the parked branch cawco/1586c4b7 (plus its 12px→16px sweep), not in main's DESIGN.md. Findings about status-mark size or duotone are **not the cutover's to fix**. They land with that branch after the cutover. Keep any status glyph's markup recognisable so the branch rebases cleanly.
- **Scope:** every departure is in scope. The owner's test is DESIGN.md, not likeness to the old screens ("There were many gaps in the old system layout and style wise", "So I hope ur jot bringing over scar tissue").

## Blocking
1. **config-cli-tools-rest, 390:** the table overflows the card. Text is cut without an ellipsis and the last column is off-screen. Below 640px each row becomes a card (L623, L639). [g1]
2. **new-session-machines-pair, 390:** the first-prompt box overflows the sheet's right edge, and its chips are gone (L645, L812). [g2]
3. **pairing-start-failed, 390:** the dialog overflows the right edge. Its text is cut, the buttons and ✕ are off-screen, and it should be a bottom sheet under 640 (L645, L812). [g2]
4. **region-failed-tabs, 390:** the error banner overlaps the top bar and burger, and Caw's glass overlaps it (L755, L832). [g2]
5. **views-decision-page, 390:** the project bottom bar covers the decision composer ("Add a note…", "I'm done picking") (L643). [g3]
6. **views-routines, 390:** the header band stops at x≈197 and the rows are cut to about 65px (L639, L645). [g3]
7. **workflows-graph-step, 1440 light:** the chosen harness chip has near-white text on light grey, about 1.3:1 (L933, L407). [g3]

## Captures that don't show their state (fix the catalogue, then re-audit)
- config-memory-delete-ask, config-skills-remove-ask: the ask is never reached; the capture is the plain list or empty page. [g1]
- session-attach-menu: the captures are 637×28 and 345×27 crops with no menu, and MANIFEST says "matches", so the baseline is broken too. [g2]
- session-diff phone: shows the rail sheet, not the diff. [g3]
- bench-seed-tabs-rest: a blank page in both captures. [g0]
- bench-delegate-tray-rest (desk-dark and phone-dark), bench-session-limit-rest phone-dark and bench-usage-limits-rest phone-dark: the "dark" files render the light palette. Either the fixture ignores the theme or the theme doesn't apply. [g0]
- config-rules-index 390 shows the Configure stack root, and its desk image is pixel-identical to rules-rest. caw-on-rest desk is identical to caw-on-panel. [g1, g0]

## Cross-cutting (fix once in the kit or recipe)
- **Top bar's trailing group** draws as a square-cornered white slab, not the concentric capsule of panel glass (L755). [g0, g2] This is the bar-glass lane's area: check W-bar-glass against it. Its 1440-light compare also showed 404px across the whole glass.
- **Rail Working/Finished tabs** truncate to "Worki…"/"Finish…" at the 228px rail but are whole at 293 (L623, L752). There's also a coral hairline under them (L580). [g0, g2, g3]
- **Review / Needs you column, row and bar** washed in pink or coral, with a coral head. Needs you is spark yellow, and coral is never a status (L552, L578, L580). Board, week, week page, pipeline and task captures. [g0, g2, g3]
- **Board column subtitles** ("to do", "active", "needs you") are in JetBrains Mono. Column heads aren't in the Column head role (L609, L610, L619). [g0, g3]
- **Review column** squeezed to about 125px, with its card clipped without an ellipsis (L623). The phone board's next-column peek is cut mid-letter with no edge fade (L691). [g0, g3]
- **Config sticky footer:**
  - the page card's content is cut hard behind the footer with no edge fade (L758, L769);
  - the footer sits outside the card, and the card height jumps between screens;
  - on 390 its right edge overhangs the card by about 10px and its buttons are about 36px;
  - on the hooks editors it wraps to about 100px (L929, L633). [g0, g1]
- **Trailing controls on 390 list rows** (chip, switch, ⋯) drop under the text, left-aligned. The ⋯ is about 14px with no 44px area (L929). Hooks, rules, skills, memory, delegate types, connections, MCP. [g1]
- **Page head:** the action sits about 8px above the title/description pair's centre (L633). Some pages (Usage, workflow run) have no page head at all. [g1, g3]
- **Destructive actions** drawn neutral: Remove account, Delete everywhere, Delete hook, Delete rule, Remove key (L234–237, L729). Conversely, project-forget's "Stop 17 and forget" is a solid coral fill (L580, L729, L805). [g1, g2]
- **Mono outside the Code role:** titles set in mono at 20–22px ("explore", "new-subagent", "~/.claude/CLAUDE.md", "Name this server"), inputs set in mono (Skills, Package, Source, Matcher, Prompt), prose error sentences, paths at about 16px (L171–176, L607, L610, L619). [g1, g2, g3]
- **Tables aren't the ledger:** plain 12px headers with no surface-band, no uppercase or tracking, about 49px rows, outline plus vertical rules, and grey-on-grey offline rows (L370–381, L609, L637). CLI tools, Updates, bench-updates. [g0, g1]
- **Control heights** under the recipe: inputs at 28–30px, selects at about 30px, segmented controls at 30–32px, small buttons at about 28px. All are under 44 on 390 (L246–252, L724, L929). [all]
- **Blue outside status:** native browser-blue sliders, a blue-filled checkbox, a blue dot, blue tick discs on channel cards (L463, L578, L580). [g0, g1]
- **Native `<select>`** with the browser caret: board label, workflows graph, step, branch and launch (L742). [g0, g3]
- **Card-in-card:** recess wells and bordered panels inside the raised page card (L669). Provider panels, routing option cards, Try it, matcher wells, usage account cards, workflow code well, task preview well. [g0, g1, g3]
- **Stat tiles with no recessed well:** usage project, views week, week page (L746). [g3]
- **"Jump to latest" floating tag** sits mid-transcript, not by the composer. On phone it has no solid fill and text shows through (L862). [g2, g3]
- **Tool-row verb cut first:** "R..", "Au…", "Ran …" while the muted path or argument stays whole. The name must not give way before the meta (L623, L860). Tool glyphs draw neutral grey, not their family hue (L575, L860). [g0, g2, g3]
- **Dialogs on phone not bottom sheets:** project-caw-note, pairing-start-failed. Sheets with no title or Close: new-session-move, project-caw-settings, workflows-graph-branch. The sheet-inspect inspector is a right-hand panel where DESIGN.md calls for a bottom sheet (L645, L809–812, L882). [g2, g3]
- **Hatched tick dividers** in the New session dialog. Hatching is only for the relay bar (L683, L772). Dashed outlines on thread rows and notice rows, and a dashed Dropped rule (L683). [g0, g2, g3]
- **Alerts drawn as full-bleed saturated slabs** (spark yellow, pink), not the compact tinted 10px-radius row: memory "edited its own copy", home-connecting banner, region-failed-tabs composer error, caw-panel-peek ask band (L832, L837). [g1, g2, g0]
- **Scrim** blur and darkening far beyond 2px at 72%: caw-panel-peek, session-plan phone, mac-readiness (L505, L664). [g0, g3]
- **Raw markdown backticks** in sentences ("run \`bunx biome check\`") (L604, WORDS.md). [g1]
- **Empty states** that are plain meta lines with no 20px mark, title or start action: phone, subagents, skills, routines event sources, traffic, caw-on (L835, L839). [g1, g3, g0]
- **Coral used as data:** context and 5-hour bars filled coral, the session card's context bar coral at 1%, a coral-wash project select (L580, L559, L790, L539). [g0, g3]
- **"Svelte Flow" attribution** printed on views-canvas and workflows-graph. The floating bottom bar covers the zoom controls on phone (L645). [g3, g2]
- **Copy and trash glyphs** drawn solid black next to duotone neighbours (L923). These are not status marks, so they are the cutover's. [g2, g3]
- **Composer docking:** bench-recall sits 2–3px above the bottom (dock is 14px). bench-finder phone is inset 46px (should be full width with 11px margins under 900) (L643). [g0]
- **Workflow code** has no syntax colour (L561, L617). [g3]
- **Graph layouts:** nodes overlap and edges cross nodes in workflows-graph and views-canvas phone (L884). The decisions-graph fit is at 34%, so node text is about 4px (L602). [g3, g2]
- **Focus drawn as a border-colour change** on the memory filter and skills Source (L927, L969). [g1]

## Clean, beyond the shared items
home-machines, board-filter, config-devices-rest, config-spend-rest, bench-echo-rest, bench-lift-rest, bench-overlays-rest, session-thinking, session-memory-tool.

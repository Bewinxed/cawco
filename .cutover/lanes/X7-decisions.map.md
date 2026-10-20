# X7-decisions: the decision page's map (step A)

Read on main at `ae4476dac` (DESIGN.md read whole; page.css, the host's components, the overlay's pick, the motion helpers).
Captures and engine reads come from one Chromium session against the workspace's own decision stage (probe kit `decision-embeds.ts`).

**The bar.** The owner's words: "aim for general ui aeshtetic and correctness, not byte identical and image diff-identical".
A row whose recipe makes the page look different from today says so ("differs today"). That is expected, not avoided.

**How to read a row.**
- **Now**: the `.dp-*` rules (page.css lines) or the component's own scoped rules.
- **Recipe**: the DESIGN.md line, quoted, or the kit part that draws it; or `none`.
- **Alignment**: the DESIGN.md line that settles its alignment and centring; or `none`.
- **Undecided**: one sentence for each `none`, for the design advisor and then the owner.

Line numbers are DESIGN.md on main; `page.css` is `packages/hub/skills/decision-page/kit/page.css`.

---

## The page

### P1. The page's frame: width, centring, padding, ground
- **Now:** page.css L5-19 (`:root` scheme, `body` on `--surface-page`, body size at 1.55 leading); L54-62 `.dp` (max 920px, `margin: 0 auto`, padding `--space-6` / `--space-4`, foot `--space-8`×2 plus the composer's inset, column gap `--space-6`). Engine: at 1440 `.dp` is x=260, w=920 (centred); padding `21px 14px 64px`.
- **Recipe:** the ground is mapped.
  - L649: "The frame (app field, top bar sheet, dialog tray, header band, segmented groove) recesses. Content (cards, rows, menus, the dialog body, a segmented thumb) sits raised on it."
  - L669: "The frame recesses and content never does."
  - The page ground is the recess and the cards are raised on it. Differs today: `--surface-page` is `--background`, not `surface-recess`.
  - Width, centring and padding: `none`.
- **Alignment:** `none`. L633 ("A page pads 25px on the inline start and 21px on the end") is the shell's page on the recessed field beside the rail. A decision page is its own document in the artifact panel, a tab or the app's web view, so that line does not cover it.
- **Undecided:**
  - (a) The decision page's measure: one centred column (920px today), or the panel's full width at the shell's 25/21 insets.
  - (b) The rhythm between hero, cards and footer: `--space-6` (21px) today, against the `group` spacing (18px) the shell uses between a page's groups.

### P2. Base type: body, links, code
- **Now:** page.css L11-37 (`body` at `--text-body`/1.55; h1-h3 at 1.2 leading, weight strong, balance; `code` mono at 0.9em; `a` in `--link-ink`).
- **Recipe:** mapped.
  - L604: "**Body** (400, 14px, 1.45): sentences, descriptions, alert text, prose." The page's running text is body, at 1.45 not 1.55; 1.55 is Prose (L606, "transcript prose and rendered markdown"). Differs today.
  - L610: "**Code** (JetBrains Mono 400, 12px, 1.6, ligatures off): code, commands, paths, tool names, keycaps." Differs today: 0.9em, ligatures not off.
  - L538: "Links … Links measure 6.34 / 8.28:1 on raised" (`link-ink`).
  - L629: "Headings use `text-wrap: balance`. Paragraphs and list items use `pretty`."
- **Alignment:** n/a (type).

## Decisions (the root)

### D1. Hero: Caw, the title
- **Now:** page.css L64-78, L112-120 (grid `auto minmax(0,1fr) auto`, Caw | title | meter, centred on the block axis; under 640px the meter drops under). Decisions.svelte L56-73 and its scoped L92-111 (the Caw pair by theme). Engine: h1 `500 20px/24px` Figtree at 1440, 18px at 390, `text-align: start`; Caw 72×79 at the frame's start.
- **Recipe:**
  - Title: mapped. L607: "**Title** (500, 18→20px, 1.25, −0.01em): page titles, dialog titles, empty-state titles." Differs today: leading 1.2 from the h1 rule, no −0.01em.
  - Caw beside the title: `none`. L547 keeps Caw ("the crow mascot and brand art") out of product chrome's colours but names no place for him on a page.
- **Alignment:** `none`. L633's page head ("the title over its one-line description and the actions centred on the pair") is the shell's page head and does not cover this document. This is the owner's "all left alignment".
- **Undecided:**
  - (a) Whether Caw stands in the hero at all, and at what size.
  - (b) Whether the hero is start-aligned like the shell's page head or centred over the column.

### D2. Meter: "N of M picked" and its bar
- **Now:** page.css L79-105 (column, end-aligned; the count `b` at title size; bar 120×4px, `radius-xs`, track `--surface-recess`, fill `--brand-solid`, width transition over `--dur-control`), L112-120, L363-369.
- **Recipe:** mapped (fill, track, figure).
  - L537: "`brand-solid` fills marks and icon tiles that carry no text (… the progress bar …)": the fill.
  - L565: "`surface-recess-deep` (the groove of a segmented control or progress track)": the track. Differs today (`surface-recess`).
  - L621: "A figure that changes (a count, a price, an age, a percentage) carries `.num`." Differs today: the count is a bold `b` at title size; it should be `.num` at weight ≤ 500 (L617).
  - The bar's size and the figure's role: `none`. The Limit bar (L790) is the usage meter's own recipe and is not this one.
- **Alignment:** `none`.
- **Undecided:**
  - (a) The count's role: a title-size figure, the KPI role (L608 names only the stat tile), or label/meta beside the bar.
  - (b) The bar's length and thickness, and whether it stands at the hero's end or under the title.

### D3. Offline notice
- **Now:** page.css L106-111 (`status-attn` pair, `radius-md`, `--space-2`/`--space-3`). Decisions.svelte L74-79.
- **Recipe:** mapped. L832: "**Alert** … A compact tinted row, never a slab: 10px radius, 10×12px padding, body type, an optional 16px glyph … Variants: default (recess), destructive, warning, success and info." The kit part is `components/ui/alert`, warning variant. Differs today: attn pair rather than warning, and no glyph.
- **Alignment:** `none` (it stands in the page's column; no line places it).
- **Undecided:** Where the notice stands: under the hero, or over the first card.

### D4. Footer row and its "Sent." line
- **Now:** page.css L400-407 `.dp-done` (flex, end-justified, `--space-3`, muted ink). Decisions.svelte L81-89.
- **Recipe:** `none` for the row. The sent line is covered by Send's own Pending recipe (D5): "On success the check holds for 1.2s" (L731). The separate line is then not drawn by any recipe.
- **Alignment:** `none`.
- **Undecided:**
  - (a) Whether the footer is a trailing-edge row (today) or sticks at the page's foot over the composer inset.
  - (b) Whether "Sent. Change anything and send again." stays as words or becomes the button's own pending → check.

### D5. Send picks
- **Now:** page.css L408-435 (`action-solid` flat fill, `radius-md`, `--c-btn-h`, `--c-btn-h-lg` under a finger, hover `action-hover`, disabled 0.5, focus outline offset 2px).
- **Recipe:** mapped. Kit part `components/ui/button`, primary.
  - L726: "**Primary:** the coral `action-surface` gradient over `action-solid`, with no border and `on-action` text; hover runs `action-surface-hover` over `action-hover`."
  - L724: "Default 36px tall with 14px padding, an 8px gap and 16px icons. … `lg` is 44px."
  - L731: the Pending recipe ("its label cross-fades to its pending wording … On success the check holds for 1.2s").
  - L734: The Press Rule (0.97 over 160ms).
  - L929: The 44 Touch Rule.
  - Differs today: a flat fill with no `action-surface` gradient, no press, no pending state.
- **Alignment:** `none` (no line places the page's one action).
- **Undecided:** Covered by D4 (a).

### D6. Note
- **Now:** page.css L371-398 (label column muted at label size; textarea on `--surface-page`, `border-control`, `radius-md`, `resize: vertical`; 16px and `--c-btn-h-lg` under a finger). Decision.svelte L206-216.
- **Recipe:** mapped. Kit part `components/ui/textarea`.
  - L737: "36px tall, 10px radius, raised surface, 1px control edge, the extra-small shadow, body text, `ink-strong` text, muted placeholder, coral caret (`brand-solid`)."
  - L740: "**Textarea:** grows a line at a time, measured on a hidden twin and set in pixels so a 120ms height transition carries each new line."
  - L627: "every text field renders at 16px" under a finger.
  - The word "Note" is a label (L602, "names, group headings …").
  - Differs today: page ground instead of raised, no xs shadow, manual resize instead of growth, no coral caret.
- **Alignment:** `none`.
- **Undecided:** Whether the note stands full width under the options (today) or folds behind an "Add a note" control until asked for.

## Decision

### C1. Card
- **Now:** page.css L122-134 (`surface-raised`, 1px `border-hairline`, `radius-panel`, `shadow-raised`, padding `--space-5`, column gap `--space-4`, `scroll-margin-top`), L157-159 (`[data-decided]`: block padding `--space-3`). Engine: 16px radius; shadow `oklch(0.295 0.01 70 / 0.09) 0 1px 3px …` by day.
- **Recipe:** mapped.
  - L681: "A panel keeps the measured 16px shell (`--radius-panel`: the paywall's hero, a decision page's panels)."
  - L745: "**Card:** 12px radius, raised surface, the tile shadow, 18px vertical rhythm (12px for `sm`), no border." The radius gives way to L681's measured exception.
  - L652: "**Tile** (…): cards …".
  - Differs today: the card wears `shadow-raised` (L655: "a thumb in a groove") and a hairline border; the recipe is the tile shadow and no border.
- **Alignment:** `none` (cards stand one under another at the column's width; no line says otherwise).
- **Undecided:** The decided card's rhythm (the `sm` 12px of L745, or `--space-3` today) once it is one line.

### C2. Head: the question and the state line
- **Now:** page.css L135-153 (header flex, baseline, wrap; `h2` at `--text-title`, `flex: 1 1 240px`; `.dp-state` meta, muted, `overflow-wrap: anywhere`; `.on` in `--brand-ink`). Decision.svelte L177-194.
- **Recipe:**
  - Question: `none`. L607's title role names "page titles, dialog titles, empty-state titles"; L602's label names "group headings"; a card's question is neither.
  - State line ("Not picked", "Picked", "2 picked"): mapped to meta. L603: "**Meta** (400, 12px, 1.35): timestamps, counts, units, hints". Its coral `.on` is `none`: L580 gives coral to "the chosen option", not to a word saying something was picked.
- **Alignment:** `none`.
- **Undecided:**
  - (a) The question's role: title (today) or label.
  - (b) Whether "Picked" in brand ink is a sanctioned use of coral, or stays muted ink.
  - (c) Whether the state line sits on the question's baseline at the head's end (today it wraps after the question).

### C3. Change and Done
- **Now:** page.css L166-198 (text-only button, label size, muted, no padding but `--space-1`, `radius-sm`, focus outline outside, 44px `::after` under a finger).
- **Recipe:** mapped. Kit part `components/ui/button`, ghost, `sm`.
  - L728: "**Ghost:** transparent until hovered or expanded."
  - L724: "`sm` is 30px at the label size with 11px padding."
  - L929: The 44 Touch Rule.
  - L927: The One Ring Rule.
  - Differs today: a bare text button with no ghost fill on hover and no 30px box.
- **Alignment:** `none`.
- **Undecided:** Change's place: at the head's trailing edge, or right after the decided words.

### C4. Why line
- **Now:** page.css L199-202 (muted, `max-width: 72ch`).
- **Recipe:** mapped. L604: "**Body** … sentences, descriptions … Running text measures 60 to 72ch." L629 `pretty`. Differs today: no `text-wrap: pretty`.
- **Alignment:** `none`. L604 sets its measure only.
- **Undecided:** Whether the why line stands on the question's start edge at its measure (today), or is set apart under it.

### C5. Card media grid
- **Now:** page.css L203-219 `.dp-show`: two media in `1.2fr 1fr`; one, or three and more, `.solo` in one column; one column under a 900px *viewport*. Engine at 1440: the two diagrams' panels are 460 and 383 wide.
- **Recipe:** `none`.
- **Alignment:** `none`. The 900px is L645's breakpoint ("the rail becomes a burger sheet"), which is the shell's, not a card's.
- **Undecided:**
  - (a) Two ways compared side by side: equal columns (prior art a73319b2d) or 1.2 : 1.
  - (b) Whether the split follows the card's width (a container query) rather than the window's.

### C6. Decided line
- **Now:** Decision.svelte L179-181 (`<span class="dp-state on">Decided: {labels}</span>` and Change); page.css L151-159; the body hidden (`.dp-body[hidden]{display:none}`, L163-165).
- **Recipe:** `none`. No line names a decided card. L485 (The One Object Rule) bears on how the chosen option reaches it; see the pick flow below.
- **Alignment:** `none`.
- **Undecided:**
  - (a) What the decided line shows of the pick: the chosen chip itself (its keycap filled, L905) or its words in coral ink.
  - (b) Whether the turned-down options leave the page or stay folded under it.

## Option

### O1. Options grid and cell
- **Now:** page.css L236-259 (`.dp-opts` auto-fit `minmax(min(100%,190px),1fr)`, gap `--space-2`; `.dp-optcell` a 2-row subgrid; `.dp-optmedia`). Engine at 1440, first card: the two labels' tops at 449 and 423. Recommended pushes its option's label 26px down, which is the owner's "why are these not aligned".
- **Recipe:** `none`. L905 says a question card "answers with option chips" and names no grid. app.css's `.kit-chips` is a flex row of 30px chips, a kit class with no DESIGN.md line.
- **Alignment:** `none`. Prior art 656e8ce5c (each part on its own subgrid row) has no DESIGN.md line behind it. The nearest is the usage wall's subgrid (L773: "Every cell is one row on its column's five tracks (a subgrid)"), which is that component's rule.
- **Undecided:** Whether options side by side share rows, so every label, line and cost starts on one line (656e8ce5c), or each chip stands at its own height.

### O2. Chip
- **Now:** page.css L260-299, L352-362 (raised, `border-control`, `radius-sm`, min 30px, padding `--space-2`/`--space-3`, column of parts with 2px gaps, hover fill under a fine pointer, focus outline 2px outside; picked: `brand-solid` edge, recess fill), L363-369.
- **Recipe:** mapped.
  - Frontmatter L407-412: `option-chip`, `surface-recess` … `rounded.sm`, `height: 30px`.
  - L905: "A question card answers with option chips (30px, 8px radius, keycap digits). A picked option takes the coral edge (`brand-solid`), a recessed fill and a keycap filled vermillion … instead of a focus ring, never the attn hue, because selection is not a warning."
  - L580: "Coral marks … the chosen option."
  - L734: The Press Rule. A chip "about 44px tall at most" scales to 0.97; anything larger tints to `surface-fill`. These chips are 60px and more, so they tint.
  - L927: options "carry the ring inset on their own border box". Differs today: the ring is outside, 2px offset.
  - Kit recipe: app.css `.kit-chip` L607-640 (`.sel`).
  - Differs today: no press feedback at all.
  - Frontmatter `option-chip.backgroundColor` is `surface-recess`, while app.css `.kit-chip` and 0c7c8c893 draw it raised. DESIGN.md disagrees with itself here. The JSON (`design/tokens`) wins by L451, and the frontmatter states `surface-recess`.
- **Alignment:** `none` beyond L625 (O4).
- **Undecided:** The chip's rest fill: raised (app.css, today) or recess (frontmatter L408).

### O3. Keycap
- **Now:** page.css L308-323 (17px min, `radius-xs`, recess, mono meta, line-height 1), L359-362 (chosen: `chip-chosen-bg` / `chip-chosen-ink`).
- **Recipe:** mapped.
  - Frontmatter L413-416 `option-keycap-chosen`: `chip-chosen-bg`, `chip-chosen-ink`, `rounded.xs`.
  - L540: "the keycap of a picked answer chip fills vermillion with a white digit, instead of a focus ring."
  - L610: Code role names "keycaps".
  - Kit recipe: app.css `.kit-keycap` L701-728.
- **Alignment:** L625, The Mark Line Rule: "Words set beside a mark (… a keycap) have their x-height's middle on the mark's middle, within half a pixel."

### O4. Label
- **Now:** page.css L294-307 (`b` flex with the keycap, weight strong; words trimmed `text-box: trim-both ex alphabetic` and padded back).
- **Recipe:** mapped. L602: "**Label** (500, 13px, 1.3): … chips". L625: The Mark Line Rule.
- **Alignment:** L625 (as above).

### O5. Recommended
- **Now:** page.css L332-351 (badge: `--c-badge-h`, `--space-1` inline padding, `radius-xs`, recess, label type; raised on a picked chip; first in the chip, over the label).
- **Recipe:** mapped as a Badge. L750: "**Badge:** 20px, 5px radius, label role, recess surface, no border, 12px icons." Kit part `components/ui/badge`. Its place inside the chip is `none`.
- **Alignment:** `none`.
- **Undecided:** Whether Recommended stands over the label inside the chip (today), after the label on its line, or outside the chip.

### O6. Line (what it gets them)
- **Now:** page.css L324-328 (label size, muted, 1.4 leading).
- **Recipe:** `none`. The chip recipe (L407-412, L905) is a 30px one-line chip of label and keycap. L619 makes a sentence body, but inside a label-type chip the role is open.
- **Alignment:** `none`.
- **Undecided:** The line's role (body, label or meta) and whether it belongs inside the pressable chip at all.

### O7. Cost
- **Now:** page.css L329-331 (meta size; "Cost: …" written by Option.svelte L66-68).
- **Recipe:** `none`, for the same reason as O6.
- **Alignment:** `none`.
- **Undecided:** The cost's role and ink, and whether "Cost:" stays as a written prefix or the cost is told apart by place and ink.

### O8. Option media
- **Now:** page.css L257-259 `.dp-optmedia`; Option.svelte L70-72 (under the chip, outside the pick).
- **Recipe:** `none`.
- **Alignment:** `none`.
- **Undecided:** Whether an option's media stands under its chip (today) or the chip stands under its media, as a picture labelled by its pick.

## Section

### S1. Section heading
- **Now:** Section.svelte L54-68 (label role, `ink-muted`, `padding-block-start: --space-4`; children in a column at `--space-4`). Engine: `500 13px/16.9px`, `oklch(0.495 0.014 74)` by day.
- **Recipe:** mapped. L602: label "group headings". L567: `ink-muted` "secondary text and labels".
- **Alignment:** `none`.
- **Undecided:** The room above a section and between its cards (`--space-4` today against the page's `--space-6`), and whether the heading leads with a glyph as section heads elsewhere do (L709 is Caw's panel's own).

## Text (each role it draws)

Text.svelte L88-106; `font: var(--type-<role>)`; `pretty`, title `balance`.

### T1. title
- **Recipe:** mapped. L607 (as D1). The program names the role.
- **Alignment:** `none`.
- **Undecided:** It stands where its Row or Column puts it (L1-L2), and shares their undecided.

### T2. label
- **Recipe:** mapped. L602.
- **Alignment:** `none`.
- **Undecided:** As T1.

### T3. body
- **Recipe:** mapped. L604 and L629.
- **Alignment:** `none`.
- **Undecided:** As T1. Its 60-72ch measure (L604) holds inside a wide card.

### T4. meta
- **Recipe:** mapped. L603; `ink-muted` L567.
- **Alignment:** `none`.
- **Undecided:** As T1.

## Row, Column, Stack

### L1. Row
- **Now:** Row.svelte → Stack.svelte L182-196 (flex row, wrap, gap `--space-3`, children `min-inline-size: 0`; justify and align from the program).
- **Recipe:** `none`. L635's ladder gives the steps, not which one.
- **Alignment:** set by the program's `justify`/`align`; DESIGN.md: `none`.
- **Undecided:** The gap step between media laid side by side.

### L2. Column
- **Now:** Column.svelte → Stack.svelte (flex column, gap `--space-3`).
- **Recipe:** `none`, as L1.
- **Alignment:** `none`.
- **Undecided:** The gap step between media laid one under another.

### L3. Stack
- **Now:** Stack.svelte L139-196. It is the shared implementation of L1 and L2 and draws nothing of its own.
- **Recipe:** `none`, as L1.
- **Alignment:** `none`.
- **Undecided:** Answered by L1 and L2.

## Badge

### B1. Badge
- **Now:** Badge.svelte L212-246 (20px, `radius-xs`, label, recess, `--space-2` inline padding, ellipsis, status pairs).
- **Recipe:** mapped. L750: "**Badge:** 20px, 5px radius, label role, recess surface, no border, 12px icons. The `live`, `attn`, `done` and `fail` variants take their status pairs." Kit part `components/ui/badge`.
  - Frontmatter L270-276 pads it `0 6px`; today it is 7px.
  - L578: The Reserved Hue Rule (status hues mean status only).
  - L590: The Glyph, Word, Hue Rule.
- **Alignment:** L625. A badge on a line takes The Mark Line Rule by its kit class.

## Media

### M1. The media well (`.dp-pane`, `figcaption`)
- **Now:** page.css L220-234 (`surface-recess`, `radius-lg`, padding `--space-3`, column gap `--space-2`; caption meta, muted, weight strong).
- **Recipe:** mapped.
  - L565: "`surface-well` with `border-well` (a content well inside a raised card: the plan and the preview beside a conversation; the recess by day, the deep recess with the control edge at night)."
  - L679: The Concentric Rule.
  - Differs today: no `border-well` edge, and at night the plain recess rather than the deep one.
  - Caption: L603 meta. Differs today: weight 500, where meta is 400.
- **Alignment:** `none`.
- **Undecided:** The well's radius. Concentric with a 16px card at an 18px inset leaves nothing, and the frontmatter's `rounded.well` is 7px.

### M2. Preview: the embed's frame
- **Now:** Preview.svelte L178-199 (frame full width, `min-block-size: 12rem`, `max-block-size: 80vb`, `radius-md`, page ground; 16:10 for a screen; a component canvas at the height it posts). Centring, scaling and the sideways scroll under the edge fade are the canvas runtime's (`fitToEmbed`, `edge-fade.css`), stated in LIBRARY.md L29, not DESIGN.md.
- **Recipe:** `none` for the frame's sizing, centring and scaling. The radius follows L679.
- **Alignment:** `none`. DESIGN.md names the house edge fade for tab strips and tracks (L691, L797: "A scrolling track fades whichever edge has more to scroll"), not for an embed.
- **Undecided:** Whether DESIGN.md takes the embed's rule as LIBRARY.md states it: "each at its own size and centred, one wider than the card scaled down to fit it, and one too wide to fit with its words still 10px scrolling sideways".

### M3. Preview: waiting, refused, gone
- **Now:** Preview.svelte L134-174 (a meta line after `--dur-wait-grace`: "Opening the …", "… isn't answering"; "can't be opened here now"; "What this card showed is gone.").
- **Recipe:** mapped (the wait).
  - L843, The Real Wait Rule: "Caw stands in for a wait … only once it has lasted `--dur-wait-grace`."
  - L841, The Claim Of Nothing Rule: "While data loads, the skeleton stands in at the real layout's size."
  - Differs today: a line of words after the grace, no skeleton and no Caw.
  - The gone and refused lines: `none`.
- **Alignment:** `none`.
- **Undecided:** The words and ink for an embed that is gone or refused. L883's "error formula" is the component canvas's own section fault.

### M4. Diagram: the drawing on the well
- **Now:** Diagram.svelte L108-139 (Pele's colours on the house tokens; `--pele-accent: --brand-solid`; `.draw` on raised, `radius-md`, `overflow-x: auto`). Engine: every diagram SVG stands at its panel's start (svg.x = panel.x + 11px), never in the middle.
- **Recipe:** colours mapped by token, with one conflict. `--pele-accent: --brand-solid` puts coral on a drawing, against L580 ("Coral marks the action, the selected nav row, the focus ring, checked controls, the chosen option and the selection tint") and L463 ("The code rejects: … hue used for decoration"). Placement: `none`.
- **Alignment:** `none`. Prior art a73319b2d centres a narrow diagram (`margin-inline: auto`) by analogy with the embed; no DESIGN.md line backs it.
- **Undecided:**
  - (a) A diagram narrower than its well: centred or at the start.
  - (b) What takes the place of Pele's accent.

### M5. Diagram: Mermaid's text
- **Now:** Pele's own sizes. Engine at 1440 and 390: flowchart node text 16px, sequence text 14px, Figtree, drawn at scale 1. That is larger than the house body (14px) and in no role.
- **Recipe:** `none`. No line names a diagram's text. L619 ("Text takes a role by what it does. Names … are label. Sentences and descriptions are body. Timestamps, counts, units and hints are meta. Nobody picks a size and finds a role for it.") binds it, so it needs roles.
  - Not settled, my proposal: a node's name is label (13px/500), an edge's or message's words are meta (12px), a sequence's participant is label.
  - DESIGN.md has no type floor for scaled content. The 10px floor is LIBRARY.md's for embeds.
- **Alignment:** n/a (type).
- **Undecided:** The roles of a diagram's text, and the floor below which a diagram stops shrinking.

### M6. A wide diagram
- **Now:** Pele `zoom: "auto"` (Diagram.svelte L50-54); `.draw` scrolls sideways with no edge fade.
  - Engine: the nine-node `flowchart LR` was laid out again by Pele to 216px wide and 894px tall at both widths, at scale 1. In this capture it was re-laid out, not shrunk.
  - The finding "Pele … shrinks a wide one below readable size" is not reproduced by this program. A diagram Pele cannot re-lay (a wide sequence, say) is the case it names.
- **Recipe:** `none`. DESIGN.md does not settle that a wide diagram keeps its size and scrolls sideways under the edge fade. The house edge fade's lines (L691, L797) name tab strips and tracks; `edge-fade.css`'s comment names "a wide embed's frame", in code only.
- **Alignment:** `none`.
- **Undecided:** Whether a wide diagram keeps its size and scrolls sideways under the house edge fade, is laid out again by Pele (today, for a flowchart), or shrinks to a floor.

### M7. "Open as canvas" / "Open to draw"
- **Now:** Diagram.svelte L151-182, Canvas.svelte L135-153 (meta type, `--space-1`/`--space-2`, `border-control`, `radius-sm`, page ground, hover edge to muted).
- **Recipe:** mapped. Kit part `components/ui/button`, outline `xs`.
  - L725: "**Outline (default kit look):** raised surface, 1px `border-button-outline` edge (3:1), strong ink, hover to `surface-hover`."
  - L724: "`xs` is 24px."
  - L929: The 44 Touch Rule (Canvas's has no 44px area today).
  - Differs today: page ground, control edge (not 3:1), meta type.
- **Alignment:** `none` (the caption at the start, the button at the end, `space-between`).
- **Undecided:** Whether the action stands in the caption's row or at the well's top-trailing corner.

### M8. Image
- **Now:** Image.svelte L38-54 (`max-inline-size: 100%`, `radius-md`, raised behind it; missing file: a meta line).
- **Recipe:** mapped for the well (M1, L565). The picture's fit and the missing line: `none`.
- **Alignment:** `none`.
- **Undecided:**
  - (a) A picture narrower than its well: centred or at the start.
  - (b) The words for a picture that is not on the page.

### M9. Canvas
- **Now:** Canvas.svelte L107-158 (frame 16:10, `radius-md`, raised, no pointer events; "gone" meta line).
- **Recipe:** mapped for the well (M1). The 16:10 frame and the gone line: `none`.
- **Alignment:** `none`.
- **Undecided:** The frame's shape: the canvas's own box, or 16:10.

### M10. Dials
- **Now:** Dials.svelte L248-300. The vendored DialKit panel (`kit/vendor/dialkit/styles.css`) floats at the page's foot. Engine: present on both legs.
- **Recipe:** the floating surface is mapped. L665: "**Panel material**: the raised surface at 72%, with a 28px blur and 1.6 saturation, for chrome that floats over content." Its controls (sliders, colour) are DialKit's own: `none`.
- **Alignment:** `none`.
- **Undecided:** Whether the dials stay DialKit's floating panel or become kit controls in the card they tune, as the sheet inspector's are (L882).

---

## Count

**41 rows:** P1-P2, D1-D6, C1-C6, O1-O8, S1, T1-T4, L1-L3, B1, M1-M10.

**Recipe column**
- **28 mapped**, wholly or in part.
  - Wholly: P2, D3, D5, D6, C1, C3, C4, O2, O3, O4, S1, T1, T2, T3, T4, B1, M1, M7.
  - In part, with the rest `none`: P1 (width and centring), D1 (Caw), D2 (bar size, figure role), C2 (question role, coral state word), O5 (place in the chip), M3 (gone and refused lines), M4 (placement, the coral accent's replacement), M8 (fit, missing line), M9 (frame shape), M10 (controls).
- **13 `none`:** D4, C5, C6, O1, O6, O7, O8, L1, L2, L3, M2, M5, M6.

**Alignment column**
- **3 settled by a line:** O3, O4 and B1, all by L625, The Mark Line Rule.
- **2 not applicable:** P2 and M5 (type only).
- **36 `none`.**

Every `none` is written in full in its row's **Undecided**.

---

## The pick flow

### As it is today (main)

1. **A press on an option** is heard by the overlay at the window, in capture (`packages/agent/src/preview-overlay/page.ts:609-635`). It writes the pick to the page's doc at once: `choose(choice, current.includes(value) ? null : value)` (page.ts:631) → `artifact.write` (artifact.ts:501-519) → `state.set(change.choice, entry)` (artifact.ts:516). The doc's observer runs `reflect()`, which marks `data-cawco-picked` (page.ts:328-342), and `told()` (page.ts:378-382), which hands the host's `picks` listener the new state (host.ts:22-24, `picks.now = next`).
2. **The card's own capture listener** on its body sets `picking = true` (Decision.svelte:104-113).
3. **In the same task's effects**, Decision.svelte:91-98 sees the change while picking (`if (picking && now !== seen) { picking = false; open = false; }`). Then `decided` becomes true (L74) and the body is hidden: `<div bind:this={body} class="dp-body" hidden={decided}>` (L195) on `.dp-body[hidden] { display: none; }` (page.css L163-165). The card takes `data-decided` (page.css L157-159), and focus moves to Change (Decision.svelte:126-132).
4. **Nothing animates.** Engine, 1440 light: the `path` card is 1199px tall before the press and 49px on the next animation frame. `getAnimations({subtree:true})` is 0 on every card before, on that frame, and 400ms after. The card under it (`look`) moves from y=5911 to y=4761 (1150px) in that one frame. The window's own scroll jumps from 5298 to 4275 in that frame too, by the browser's scroll anchoring; nothing in the page asked for it. The next-frame and 400ms captures are byte-identical (180452 bytes each). 390 dark is the same (1662px → 98px; scroll 6004 → 4661).
5. **The chosen state is never seen.** The option's `data-cawco-picked` look (coral edge, vermillion keycap; page.css L355-362) is set and its card hidden in the same frame.

### As DESIGN.md wants it, step by step

**1. The pressed option shows as chosen, in place.**
- L905 ("A picked option takes the coral edge (`brand-solid`), a recessed fill and a keycap filled vermillion"), L540 and L580.
- The colour change is the kit chip's `border-color` and `background-color` over `--dur-control` (120ms) on `--ease-out` (app.css `.kit-chip`; L732 "hover and colour changes take 120ms").
- The press is L734: these chips are taller than 44px, so they tint to `surface-fill` and do not scale.
- **Not settled:** how long the chosen state holds before the card folds. `--dur-hold` (1.2s) is the pending button's success hold (L731) and the account move's line (L699), not a pick's.

**2. The card folds to its decided line.**
- Height: `morph()` on the card (`motion/morph.svelte.ts:190`), a WAAPI tween over `--dur-morph` (180ms) on `--ease-drawer`. L479: "**Drawer** … carries … container size changes". L707 describes `motion/morph`.
- What opens and closes inside: `unfold` (`motion/fold.svelte.ts:223`), which closes over `--dur-exit` (160ms) and opens over `--dur-pop` (260ms) on `--ease-out`, fading with the height. Inside a morph, the morph reads the fold's end and runs on the fold's clock (morph.svelte.ts L50-54, `atFoldsEnd`), so the edge and the rows land together.
- L483, The Fast Exit Rule: the fold that hides the body is shorter than the one that opens it.
- L487, The Nothing Jumps Rule: the cards below "make room" on the same clock rather than jumping.
- L485, The One Object Rule: the chosen option is on both sides of the change (its chip, then its words on the decided line), so it "travels; it never vanishes on one side and appears on the other" (`motion/share.svelte.ts`, 280ms on the drawer curve, FLIP). So the chosen option stays readable on the decided line by travelling into it.
- L491-492, The Stay In Context Rule: "The thing they acted on stays in view and becomes its own result."
- **Not settled:** whether the decided line holds the chip itself or its words (C6 (a)), which decides what the flight lands on.

**3. The page brings the next undecided card into view: a scroll, and focus for the keyboard.**
- DESIGN.md has no line that advances a page to the next question. This step is **not settled**.
- What bears on it:
  - L492: the acted-on card "stays in view". A scroll that brings the next card in must keep the decided line in view.
  - L487: "A move that happens entirely off screen jumps instead of sliding".
  - L927: "A scroller brings a focused control into view with room for its ring".
  - The folder tabs' line, quoting Emil Kowalski (L690, "A choice made from the keyboard … is instant, as every keyboard action is"), and Jump's (L707) are those components' rules. They are precedent, not a rule for this page.
- Focus today goes to Change (Decision.svelte:126-132), not to the next card.
- Scroll anchoring moves the window today with no rule behind it. `overflow-anchor: none` on the page is the way to stop it; the transcript sets it (Transcript.svelte:4080).

**4. Reduced motion: a cross-fade only.**
- L517: "With reduced motion, opacity and colour fades still run … heights land at once, folds fade instead of opening … Reduced motion means stillness. It does not mean an instant swap."
- `fold()` and `unfold` already do this (fold.svelte.ts L81-86, L229-231: opacity over `--dur-control`).
- `morph()` lands at once under reduced motion (`motionOk`, morph.svelte.ts L301-308).

**5. Change reopens the card the same way, reversed.**
- L489, The Interruptible Rule: "Every transition turns back from where it is drawn … folds animate from the drawn height". `fold()` starts from `drawn(node)` (fold.svelte.ts L52) and `morph()` from the drawn size.
- L483: opening runs longer than closing (`--dur-pop` against `--dur-exit`).
- Focus returns to the picked option (Decision.svelte:135-143 already does).
- **Not settled:** whether reopening scrolls back to the card when the press came from somewhere else (Caw's panel, the graph).

### The scroll on the fold's clock (scrubbable)

- **No house helper drives a scroll from an animation's clock.** `morph()` and `fold()` run WAAPI animations (`node.animate`, so they show in `getAnimations()` and pause and seek through the Animation domain). `unfold` is a Svelte transition. A `scrollTo({ behavior: "smooth" })` is the browser's own and cannot be seeked.
- **The one place the product scrolls on an animation's clock is the folder tab strip** (`components/ui/fluid-tabs/TabsList.svelte`). Its `tab-come-forward` animation is the clock, and a rAF loop reads its progress and writes the scroll from it:
  - `progressOf(clock)` (L321-327) reads `clock.effect.getComputedTiming().progress`;
  - `track.scrollLeft = on.from + (on.to - on.from) * f;` (L514);
  - `step()` (L533-551) runs each frame while the clock runs, playing, paused or seeked.
- That is why the strip's scroll follows a seek: under `Animation.setPaused` and `Animation.seekAnimations` the loop reads the seeked time.
- **For step 3 the same pattern applies.** The card's fold (`fold()`'s returned `Animation`, or the morph's) is the clock, and a rAF loop sets `document.scrollingElement.scrollTop = from + (to - from) * progress`. Nothing generic does this yet: it is TabsList's pattern, written once for the page (or lifted into `motion/` as a helper).

---

## Alignment prior art (origin `cawco/62c4de93-host-alignment`)

- **656e8ce5c**: subgrid option rows. Each option's tag, label, line, cost and media take one of nine shared rows, so a row's labels start on one line. **DESIGN.md does not back it.** No line names how options side by side align (O1). The Mark Line Rule (L625) settles the label against its keycap inside one chip, not across chips. It fixes the measured fault (labels 26px apart at 1440), and the owner asked "why are these not aligned", but it is an owner call (O1 Undecided).
- **a73319b2d, equal columns**: two media side by side in `repeat(2, minmax(0,1fr))`. **Not backed** (C5). The nearest line is the channel cards (L819: "Two radio cards side by side at every width (`channel-card-max` wide at most, `--space-3` apart, equal height)"), which is that component's rule.
- **a73319b2d, diagram centring**: `margin-inline: auto` on Pele's SVG. **Not backed** (M4). It mirrors the embed's centring, which LIBRARY.md states and DESIGN.md does not.
- **Pele's type floor.** Mapped in M5: the roles are bound by L619 but not named, and no floor is in DESIGN.md. On a wide diagram (M6) DESIGN.md does not settle "keeps its size and scrolls sideways under the edge fade".

---

## Step B: the stylesheet pipeline (plan)

**The host's CSS becomes Tailwind 4.3.3, compiled from the dashboard's design source.**

1. **Entry:** `apps/dashboard/src/lib/cawco/decisions/host/host.css`.
   ```css
   @import "tailwindcss" source(none);
   @import "../../../tokens/tokens.css";
   @import "../../../tokens/theme.css";     /* generated by `bun run tokens` */
   @import "../../../tokens/variants.css";  /* generated by `bun run variants` */
   @import "../../../../edge-fade.css";     /* the house edge fade's one definition */
   @source "./";
   @source "../../views/openui/";
   @source "../../../components/ui/button/";
   @source "../../../components/ui/badge/";
   @source "../../../components/ui/textarea/";
   @source "../../../components/ui/alert/";
   ```
   The `@source` list is one line per kit part the host imports, and nothing else.
   Source (https://tailwindcss.com/docs/detecting-classes-in-source-files):
   - "Use `source(none)` to completely disable automatic source detection if you want to register all of your sources explicitly … This can be useful in projects that have multiple Tailwind stylesheets where you want to make sure each one only includes the classes each stylesheet needs."
   - "Use `@source` to explicitly register source paths relative to the stylesheet".

2. **The compiler:** `@tailwindcss/postcss` 4.3.3 with `postcss`, as the documented route.
   - https://tailwindcss.com/docs/installation/using-postcss: "Install `tailwindcss`, `@tailwindcss/postcss`, and `postcss` via npm."
   - Declared in `packages/core/package.json` at exact pins:
     - `"tailwindcss": "4.3.3"`
     - `"@tailwindcss/postcss": "4.3.3"`
     - `"postcss"` at the version `@tailwindcss/postcss@4.3.3` asks (`npm view`: `"postcss": "^8.5.16"`, with `"tailwindcss": "4.3.3"`, `"@tailwindcss/node": "4.3.3"`, `"@tailwindcss/oxide": "4.3.3"`).
   - Never reached through the dashboard's `@tailwindcss/vite`.
   - **What is installed now:** only `apps/dashboard`'s `tailwindcss` 4.3.3 and `@tailwindcss/vite` 4.3.3, with `@tailwindcss/node` 4.3.3 and `@tailwindcss/oxide` 4.3.3 under them (`node_modules/.bun`). No `@tailwindcss/postcss`, no `postcss` in core.
   - **Rejected:** `@tailwindcss/node`'s `compile` with oxide's `Scanner`. That is what the Vite plugin does, but it is not a route tailwindcss.com documents, and it is reachable here only through the Vite plugin.

3. **Where it runs:** in `buildDecisionHost` (`packages/core/src/decision-host.ts:147`), before `compileSheets`.
   - Call `postcss([tailwindcss({ base: HOST_DIR, optimize: false })]).process(entry, { from: <host.css path> })`. `optimize: false` leaves the minify and lowering to Lightning CSS. The plugin's options are `base`, `optimize` and `transformAssetUrls` (tailwindcss v4.3.3 `packages/@tailwindcss-postcss/src/index.ts`, `PluginOptions`).
   - Hand the result to `compileSheets` as the first sheet, the components' own styles after it, as today. It is minified and lowered at `CSS_BROWSERS` by Lightning CSS (page-css.ts L53-98) and served same-origin as `/__cawco/decision/host.css` by `pageFiles` (page-css.ts L113-130).
   - The compiler is imported lazily inside the build, as Lightning CSS is (page-css.ts L13-15). It joins `scripts/build-binary.ts`'s `external` list (L343: `["cpu-features", "lightningcss", "browserslist"]`), so the standalone binary carries the prebuilt host.css and never loads the compiler.
   - `host.ts` stops injecting `pageCss` (host.ts:10-19). `FACES` and `tokensCss` stay until the entry carries them.

4. **Where the house utilities are on main.**
   - **Generated:** `apps/dashboard/src/lib/tokens/tokens.css` (`bun run tokens`).
   - **`theme.css` and `variants.css` are not on main.** They are generated on the cutover branches: d405a1f44 "Tailwind theme from the tokens: theme.css and variants.css generated, app.css cut over", on `origin/cawco-cutover/gates` and the `cawco-lanes/L0x` branches.
   - **On main the theme bridge is `app.css`'s two `@theme inline` blocks (L152-250).** These hold colours, fonts, shadows, radius roles and the `text-<role>` sizes.
   - **Also in app.css:**
     - `@custom-variant dark` (L36) and `pressed` (L42);
     - `@utility` `identity-ink` (L2093), `material-panel` (L2099), `pressable` (L2124), `focus-inset` (L2182), `field-shell` (L2192), `num` (L2221), `mono-figure` (L2230), `no-scrollbar` (L2238);
     - in `@layer components`: `.touch-hit` (L483-490), the mark line (`.mark-line`, `.mark-cell` L537-600), `.kit-chip` (L607-640), `.kit-keycap` (L701-728), `.kit-chips` (L730).
   - **`edge-fade.css`** is its own file (`.kit-edge-fade` L49, `-block` L63-79) and the entry can import it as it is.
   - **Dependency:** the entry needs `theme.css` and `variants.css` on main. Without them it would restate app.css's `@theme inline` blocks, a second copy that drifts. Proposal, one line for the owner: step B lands after the cutover's generated `theme.css`/`variants.css` reach main, or on top of that branch.
   - The kit recipes the host needs (`kit-chip`, `kit-keycap`, mark line, `touch-hit`) are still `@layer components` classes in app.css on `origin/cawco/cutover-integration` too (app.css L572-732 there). The host's components draw them as utilities on the tokens (a class is a style, a state is an attribute, a hook is `data-slot`), or take the kit part that carries them.

5. **Kept as is until step C:** `page.css` and `kit/tokens.css`.
   - Readers: `scripts/preview.mjs:23`, `kit/page.js`, `kit/page.html` (HTML decision pages), canvas-host and the preview overlay (tokens).
   - Comments name page.css in RecordCard.svelte:365, Decision.svelte, Decisions.svelte, Option.svelte and preview-overlay/page.ts:467.

6. **Proof for B:**
   - Build, lint and type-check.
   - The decision-embed spec, and one assertion per DESIGN.md rule in this map's mapped rows, read from computed styles.
   - The pick flow by seeking its animations through the Animation domain: `Animation.setPaused` and `Animation.seekAnimations`, reading the card's height, the chip's colours and the scroll at fractions of the one clock.

---

## Captures (on main, before any change)

Taken by a scratch driver over `decision-embeds.ts` (`startDecisionStage`, `CAWCO_BRIDGE`, `capturePage`):
- one Chromium session at deviceScaleFactor 2;
- the decision-embed fixture's component canvases;
- the overlay's own pick handler (page.ts:609-635) standing in, since the probe's bridge has none.

The program has five cards in a Section plus a fifth outside it. Between them they hold Text in all four roles, five Badges, Row and Column, four Previews of component canvases (one wide), three Diagrams (a narrow flowchart, a nine-node flowchart, a sequence), an Image whose file is not on the page, a Canvas that is gone, and Dials. The engine reads behind every number above are in `captures/report.json`.

| File | State |
| --- | --- |
| `1440-light-open-1.png`, `-2.png` | 1440×900 light, the whole page as loaded: every card open, 0 of 5 picked (rows 0-4004, 4004-8060). |
| `1440-light-decided-1.png`, `-2.png` | The same after picking Astro: the first card folded to "Decided: Astro" and Change (rows 0-4691, 4691-7597). |
| `1440-light-pick-0-before.png` | The window over "Which path does a reader take to sign up?" with its options in view, before the press. |
| `1440-light-pick-1-next-frame.png` | The next animation frame after pressing "Straight to sign up": the card already one line, the card under it risen 1150px, the window scrolled 1023px by anchoring. |
| `1440-light-pick-2-after-400ms.png` | 400ms later: byte-identical to the next-frame shot, so nothing moved after the press. |
| `390-dark-open-1.png`, `-2.png` | 390×844 dark under a finger, the whole page as loaded (rows 0-5614, 5614-9124). |
| `390-dark-decided-1.png`, `-2.png` | The same after picking Astro (rows 0-6675, 6675-8511). |
| `390-dark-pick-0-before.png` | The window over the path card's options, before the press. |
| `390-dark-pick-1-next-frame.png` | The next frame after the press: the card one line (1662px → 98px), the window scrolled 1343px by anchoring. |
| `390-dark-pick-2-after-400ms.png` | 400ms later: byte-identical to the next-frame shot. |

# X1-controls — Kit controls

start: 0f64468e11d27314a553e5ed64d5df3b3734c4c8

## First item: the shared option (pushed as cawco-lanes/X1-option)

Sources followed:
- WAI-ARIA APG, Radio Group Pattern (https://www.w3.org/WAI/ARIA/apg/patterns/radio/): roles `radiogroup`/`radio`, `aria-checked`, one tab stop; the arrows follow APG's "Radio Group Contained in a Toolbar": "when navigating through a radio group in a toolbar with arrow keys, the button that is checked does not change"; "Enter (optional)" is not taken, per the owner's Continue decision.
- Base UI Radio Group (https://base-ui.com/react/components/radio-group): "Provides shared state to a series of radio buttons", `value`/`onValueChange` on the group; Checkbox Group for several (`group` of `checkbox`es).
- WCAG 2.1.4 Character Key Shortcuts: a digit is "active only when that component has focus".
- decision-page-research-spec.md B7, B8 and the owner's two decisions: arrows move, Space or a digit picks, Enter never picks, pressing the chosen option keeps it, the chosen keycap inverts (Typeform), keys stay visible on touch.

- fixed: shared option — new kit part `ui/option-group/` (Root, Item, state.svelte.ts). Root: `role="radiogroup"` (one pick) or `role="group"` (`multiple`), `layout` chips | list (chipsVariants; list = one full-width row per option). Item: `<button role="radio|checkbox" aria-checked>` on ui/chip `option` + `touch-hit` + `focus-inset`, roving tabindex (the option focus last stood on, else the first chosen, else the first), `digit` → `data-digit` + `aria-keyshortcuts`. Keys on the root: arrows/Home/End move focus only (wrapping, RTL flips ←/→); click, tap, Space or the option's digit picks (a digit is a press: `option.focus(); option.click()`, so an option's own onclick runs first and may prevent the pick, as "Other" does); Enter is prevented (never picks) and handed to the host's `onenter`; a modifier passes through (⌘/Ctrl+Enter reaches the host). Single pick: pressing the chosen option keeps it.
- fixed: chosen keycap — the keycap's chosen look moved from ui/chip's `**:data-[slot=kbd]` descendant rules onto ui/kbd's `keycap` look itself, read off the option it stands in (`group/option` on ui/chip `option`): `group-aria-checked/option:`, `group-aria-pressed/option:`, `group-data-chosen/option:` → `bg-chip-chosen-bg text-chip-chosen-ink` (DESIGN.md L910's tokens). Any density of option (X7's rich cell) that carries `group/option` and `aria-checked` gets it. DESIGN.md L910 holds as written; nothing added to it.
- fixed: question card (transcript/Prompt.svelte, moved to X1 by the parent) on ui/option-group: bits-ui ToggleGroup gone (questions and the browser ask's "Other"); the window-wide digit handler (`handleKeydown`, `claimants`, `ownsKeys`, `heard`, `OWNERS`, `MODAL`, `onButton`, `<svelte:window>`) deleted — a digit picks only while focus is in that question's group; `toggle`/`optionKey`/`otherChipKey`/`CROSS_STEPS` deleted; `setSingle` no longer clears on a re-pick; Enter = `enter()` → `submitQuestion()` once every question has an answer. The rail now marks the current question while focus is on the card's options (`choosing`).
- holds: transcript/QuestionCard.svelte (the settled record) stays on the chip: `data-chosen` spans, no input, so no group. Read: session-answered desk light keycap `oklch(0.55 0.17 33)` / ink `oklch(1 0 0)` = chip-chosen-bg / chip-chosen-ink, label 500; phone dark `oklch(0.54 0.165 33)` / `oklch(1 0 0)`, label 500.
- fixed: session-question "Other" option (X5's, moved with Prompt.svelte) — before: drawn 346x30, `::after` 344x44, hit at +3 down (Answer's area took the press: gap 11 = group foot 7 + card foot 4). After: on a coarse pointer the card's foot stands 7 (`coarse:pt-space-2`), so the gap is 14, the option rows' own coarse step (ui/chip chipsVariants `coarse:gap-y-space-4`, `hit-gap-y` 14). Read (390 dark, coarse): Other 756–786, Answer 800–830, midpoint 793; Other lands at 792.0, Answer from 792.1; Other reaches 7.5 up / 6 down, Answer 7.5 up / 6.5 down (computed `::after` ±7 each; the engine's hit test reads ~0.5–1px above layout on both).
- fixed: session-question Answer (disabled in the audit) — read enabled after a pick, same layout, 390 dark coarse: drawn 121.7x30, `::after` 44 tall (`top/bottom -8px` from the padding box, `--hit-edge` 1px), hit 44 = true, miss 45 = true.

Proof reads (scratch driver on the probe kit's tape, session-question, 1440 light fine/hover and 390 dark coarse/none):
- rest: one `radiogroup`, four `radio`s `aria-checked=false`, tab stop on 1, `aria-keyshortcuts` 1–4.
- "1" with focus on the body: nothing checked (both passes).
- ArrowRight from 1: focus on 2, nothing checked; ArrowDown then ArrowLeft: focus back on 2, nothing checked.
- Enter before a pick: nothing checked.
- Space on 2: 2 checked; its keycap `oklch(0.55 0.17 33)` light / `oklch(0.54 0.165 33)` dark = `--chip-chosen-bg`, ink `oklch(1 0 0)`; label weight 500 before and after.
- "3" inside the group: 3 checked, 2 unchecked, focus on 3.
- click on the chosen 3: 3 stays checked.
- Enter on the chosen option once answered: Answer `aria-busy="true"` (answering).

- ask: scripts/probe-kit/journeys/j4-caw-asks.ts:192 presses "2" with focus outside the card; a digit is now heard only inside the focused group (WCAG 2.1.4), so the step must first put focus in the second card's options (Tab, or focus its tab stop). Not on X1's list.

Interface-craft critique (engine reads, no picture):
- fixed: L910 chosen option — keycap fill = chip-chosen-bg (light oklch(0.55 0.17 33), dark oklch(0.54 0.165 33)), digit chip-chosen-ink oklch(1 0 0); label weight 500 before and after the pick (no reflow); the chosen chip takes no hover (`enabled:not-aria-checked:hover`).
- fixed: L929 44 Touch Rule — session-question Other / Answer areas meet at the midpoint (read above).
- holds: L910 "option chips (30px …)" — the audit's "Other ~30 vs others ~43" is the list form's descriptions under the other labels; every option's min-height is c-btn-h-sm (30).
- lint: the five .cutover/gates/*.ts files as checked out from origin/cawco-cutover/gates failed `fmt --check` and biome (useTopLevelRegex, noNestedTernary, noIncrementDecrement, useConsistentTypeDefinitions, useSortedInterfaceMembers), failing `bun run lint` and the landing gate's `lint:changed`. Fixed in place with no change to what they check: formatted, regexes hoisted to top-level constants, nested ternary verdicts written as if/else, `++` as `+= 1`, `LaneList` as an interface. `bun run lint` and `bun run lint:changed` exit 0.

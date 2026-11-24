# Design

## System
- One source of truth: `apps/dashboard/src/lib/tokens/theme.css` declares every design token once, by hand, in Tailwind's `@theme`. Hold the whole set in your head:
  - **Colour**, in two layers: the palette, raw steps named by hue and lightness (`--red-47`, `--neutral-17`) outside `@theme`, which no component names; and the roles in `@theme`, each pointing at its light and dark step. Flexoki's model (stephango.com/flexoki) on a neutral base: 8 base roles (`bg`, `bg-2` grounds; `ui`, `ui-2`, `ui-3` edges and the hover and pressed fills; `tx`, `tx-2`, `tx-3` text), 4 statuses (`danger`, `caution`, `success`, `live`), 8 labels (`label-red` … `label-magenta`), and Caw coral (`accent`, `on-accent`). A colour laid at a share is a role of its own (`highlight`, `veil`, `line`, `image-edge`, the shadow inks, a label's `-wash`), never a share a component picks. A status's fill is its own wash (a badge: its ink on a solid tint of it). Text roles and status inks hold 4.5:1 on both grounds. Plus 3 brand art pigments for Caw's art (`spark`, `paper`, `crow-ink`).
  - **Typography**: 3 house faces (Figtree, JetBrains Mono, Nunito wordmark), 2 UI weights (`normal` 400, `medium` 500 — never above 500), **4 sizes** (`sm` 12px, `base` 14px, `lg` 18px, `xl` 24px), **3 line-heights as 4px-grid lengths** (`sm` 16px, `base` 20px, `lg` 24px), and 2 trackings (`tight`, `caps`), driving **6 type roles** (`type-meta`, `type-code`, `type-body`, `type-label`, `type-title`, `type-kpi`).
  - **4px spatial grid**: one base unit (`--spacing: 0.25rem`), 6 rhythm steps (`space-1/2/3/4/6/8` = 4–32px, every step ≥33% apart), and 9 semantic sizes (`icon-sm/md/lg`, `control-sm/md/lg`, `row-compact` 28px, `row` 40px stepping to 44px on coarse/phone, `measure` 72ch) — every length derived via `calc(var(--spacing) * n)`.
  - **Shape, depth, motion & layout**: 5 radii (`xs` 4px, `sm` 8px, `lg` 12px, `xl` 16px, `pill`), one surface ladder (`surface`, `ui/elevated`: a surface stands a step above the one it opens in), 4 durations (`fast` 120ms, `base` 200ms, `slow` 320ms, `loop` 1000ms), 3 curves (`ease-out`, `ease-in-out`, `ease-drawer`), 2 breakpoints (`phone` 640px, `desk` 900px), 4 containers (`xs`, `sm`, `phone`, `desk`), 4 z-layers (`bar`, `sheet`, `float`, `top`), and 4 shared mechanics (`blur-glass`, `press-scale`, `pop-scale`, `breath-floor`).
- **Rules for choosing**: Never add feature-named tokens or component-private dimensions to `theme.css`, and never smuggle them onto `:root` in `design.css`. A value either belongs to the system above or is derived from `--spacing` / system tokens inside the component that needs it (Tailwind's numeric scale `w-*`, `h-*`, `size-*` is valid for one-off component dimensions; rhythm `p/m/gap/space` stays on `space-*`). Never write `±1px` / `±2px` spacing arithmetic.

## Flow
- A flow happens where the person's attention already is, and the thing they acted on shows its own result.
- Ask beside the thing the question is about, with the rest of the page live. Block the page only when acting elsewhere would make the open question wrong.
- Ceremony matches consequence: a light action just happens; a consequential one first states what it will really do, naming each thing it reaches.
- Work that outlives its surface belongs to the work: a reload restores it at the same step, dismissing parks it in one persistent place that shows progress and then the outcome, one press reopens it, and only its own Stop or Cancel ends it.
- A failure leaves the person where they were, with what they had, told what happened to which thing, and able to go on.
- A press that starts in a text field belongs to the field, whatever surrounds it.

## State
- Show the system's state as it changes; a thing is done when the system says so.
- Claim empty only once the data is known to be empty.
- Running work shows a live mark and names what is running.
- Live marks breathe in step; finished things are still.

## Empty states
- An empty state's one action starts the work that would fill it, with the agent already asking and the words editable. Where that cannot start, it says why and offers the way by hand.

## Colour, focus and type
- Colour appears only where it means something: the act, status, identity, focus, and data past a threshold.
- Coral (`accent`) is the act: one per view, on the act the view is for. It also marks what is selected, focused or checked. Advice wears a badge; status wears a status hue.
- Status: `danger` failed, `caution` needs you, `success` done, `live` working. A label (`label-<hue>`) is a hue picked to tell things apart (accounts, columns, charts) and means nothing else.
- Status reads by glyph, then word, then hue.
- The focus ring (`accent`) means focus. A text field shows focus by its caret and its frame's edge, with no ring.
- The option chip is the one control that picks an answer. A setting that cannot change where it is shown is the same chip, sunk.
- A count shows only above zero, unless zero is itself the reading.
- Text takes its role from what it does (`type-meta`, `type-code`, `type-body`, `type-label`, `type-title`, `type-kpi`). Emphasis is one step of weight or ink.
- Every screen is drawn and checked in both schemes, at desk and phone width.

## Motion
- What exists on both sides of a change travels between them.
- In a changing list, rows that stay slide, rows that leave close, and rows that arrive are uncovered, in one frame.
- A text swap leaves its neighbours where they are.
- Under a press, a compact control shrinks; anything wide, grouped or that opens something tints and holds still; a link dims.
- Sound and touch accompany the person's own gesture, and nothing else.
- Each kind of motion has a house helper: use it.

## Alignment
- Alignment comes from layout structure, never per-row `calc()` offsets or `±1px` nudges.
- Every line-height, spacing step, control height, and non-pill radius sits on the 4px grid (`--spacing`), so text lines and controls meet on whole steps.
- Lists of rows own their column tracks once (`ui/row`: `rows-grid` on the list, `row-cells` subgrid on each row), so lead marks, body text, controls, and `below` notes share rails across every row by construction.
- Equal-option tile grids (`OptionTiles`) use `grid-rows-subgrid` (`row-span-2`) so names and notes align across every card in a row.
- Text that is read starts on one left edge: anything longer than a title and two lines, or standing over cards, rows, chips or a field, takes the edge of what is under it.
- A short block alone in open room may be centred, as one block.
- A mark sits nearer its text than anything else. A picture is centred over what is drawn under it; a small glyph starts on its text's edge; in a row the mark sits in the row's lead column.
- A block follows its surface: on the page's edge where the page reads from one, centred only in room with no edge of its own.
- A row carries at most four kinds of text: its name, the thing itself, quieter facts about it, and an unread fact at full ink. The name gives way first when room runs short.
- A page's name is its bar's title. A bar's trailing group runs: actions on the view, More, the prominent action, Close.
- The only card inside a card is the stat tile's well.

## Permissions
- Approve and Deny are peers: the same size, type and fill, at opposite ends of their row, told apart by glyph, word and place.
- A standing grant stands apart from the answer, after a sentence saying what it would allow, as the most salient control on the card.
- The card shows who asks, what will happen to what, and the change itself, all open.

## Words
- Name the thing itself and give the number: "nixbox stopped answering (timeout)", "3 sessions".
- Say what is acted on before what happens to it.
- The product is never "we" or "I"; name the harness or the agent.
- Say when something is not known, and when an action cannot be undone.
- A button that grants says Approve.
- An error says what happened, what is safe and the next step, with its code in parentheses.
- A place the person emptied says so and names the next action.

## Skills
- Any motion: `animate`.
- Any string the product shows: `clean-copy`, then `interfaces:better-writing`.
- How text renders: `interfaces:better-typography`.
- Focus, hit areas, reduced motion, or a state shown by colour: `interfaces:better-accessibility`. On a text field the caret replaces its ring.
- Hover, press feedback, exits, nested corners: `interfaces:better-ui`.
- A bar that heads a surface: `apple-hig-toolbars`.
- A phone or a finger: `mobile-native`.

## Where the rest is
- Tokens: `apps/dashboard/src/lib/tokens/theme.css` (4px grid checked by `scripts/token-grid-check.ts`, WCAG contrast checked by `scripts/token-contrast-check.ts`).
- Components: `apps/dashboard/src/lib/components/ui` (`Row`/`RowList` subgrid rows, `OptionTiles` row-subgrid cards, `Dialog`, `FluidTabs`, `IconToggle`).
- Board: `apps/dashboard/src/lib/design-board/`, showing roles, scales, and core kit components in both schemes.
- Checks: `bun run check`.

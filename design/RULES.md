# CawCo named design rules

Generated from DESIGN.md by `bun run design:rules`; do not edit. DESIGN.md wins where they differ.

## The No Ease-In Rule

Under "Motion grammar" (DESIGN.md line 264); rule at line 275.

**The No Ease-In Rule.** No ease-in curve exists, and no run starts slow: anything that starts slow feels like the interface hesitating.

## The Frequency Rule

Under "Motion grammar" (DESIGN.md line 264); rule at line 277.

**The Frequency Rule.** How often the reader sees a motion decides whether it exists. A keyboard-initiated action never animates; the same action from a pointer keeps its motion (typing is not an action). What is seen tens of times a day (a hover, a row's highlight) gets a colour or opacity change on `--dur-control` or nothing; what is occasional (a popover, a sheet, a toast) gets the standard motion; delight belongs only to what is rare. Motion is never the only sign that something happened.

## The Fast Exit Rule

Under "Motion grammar" (DESIGN.md line 264); rule at line 279.

**The Fast Exit Rule.** Exits are shorter than entrances, and a thing leaves the way it came: in over `--dur-pop` or `--dur-panel`, out over `--dur-exit`; a grown surface in over `--dur-grow`, out over `--dur-grow-exit`. Nothing outlasts `--dur-panel` but a message lifted between its bubble and the field (`--dur-lift`), a grown surface and the two picked recipes; ambient loops are not beats.

## The Enter Rule

Under "Motion grammar" (DESIGN.md line 264); rule at line 281.

**The Enter Rule.** Nothing appears from nothing. A surface arrives from `--pop-scale` or `--pop-rise` short of its place, fading in, from its trigger's side (a dialog rises `--pop-rise`); every travel is `--pop-rise`, and a view handing its place along a strip comes `--swap-nudge` from its side. A press scales to `--press-scale`. Entrances and exits are `transform` and `opacity` (a `clip-path` where a box opens out of another, `height` only for a disclosure), and no keyframe writes a length (lint `house/no-raw-motion`). The tooltip is the one exception, because it is seen tens of times a day (The Frequency Rule): it fades in over `--dur-fade` settling `--tip-rise` toward its trigger, and leaves at once.

## The One Object Rule

Under "Motion grammar" (DESIGN.md line 264); rule at line 283.

**The One Object Rule.** What is on both sides of a change travels; it never vanishes on one side and appears on the other (`motion/share.svelte.ts`). A flight runs `--dur-panel` on the drawer curve as a transform or a clip from the source's box, the source hidden meanwhile so the screen never shows two. A surface that closes on running work travels into the place that work is parked.

## The Nothing Jumps Rule

Under "Motion grammar" (DESIGN.md line 264); rule at line 285.

**The Nothing Jumps Rule.** When a list changes, rows that stay slide, rows that leave close while fading, and rows that arrive are uncovered while what follows makes room, all from one frame (`motion/rows.svelte.ts`). A move wholly off screen jumps, so nothing drifts into view behind the reader's scroll.

## The Interruptible Rule

Under "Motion grammar" (DESIGN.md line 264); rule at line 287.

**The Interruptible Rule.** Every transition turns back from where it is drawn: a state a reader can flip twice in a second is a CSS transition on `data-state`, never a keyframe restarting from zero, and what a finger lets go of settles on the one spring with the finger's velocity (`motion/spring.ts`). Predetermined motion runs off the main thread.

## The Stay In Context Rule

Under "Motion grammar" (DESIGN.md line 264); rule at line 289.

**The Stay In Context Rule.** The reader stays where they are and knows what is true, from asking to done. Four questions shape every flow, and the weight of the decision sets its shape:
- **Where is their attention?** The flow happens there; the thing they acted on stays in view and becomes its own result.
- **What do they need to know to decide?** The consequences this action really has, before they commit, and nothing more; a light action just happens.
- **What is true right now?** The system's state as it changes; something is done when the system says so.
- **What if it doesn't go to plan?** They are where they were, with what they had, told what happened to which thing, able to carry on.

## The Open Page Rule

Under "Motion grammar" (DESIGN.md line 264); rule at line 295.

**The Open Page Rule.** Almost nothing blurs the page or stops the reader acting elsewhere. What asks or shows opens in the page beside what it concerns, and the rest stays live. The test: if they press something else now, does anything break? A scrim or a modal hold is for the rare moment when acting elsewhere would make the open question wrong.

## The Work Outlives Its Surface Rule

Under "Motion grammar" (DESIGN.md line 264); rule at line 297.

**The Work Outlives Its Surface Rule.** Work a surface starts that runs longer than the surface stays open (an install, a spawn, an upload, a sign-in, an update) belongs to the work, and nothing the reader does to the page loses it.
- **A reload keeps it**: the surface comes back at the same step with the same details, read from where the work lives; a secret is asked for again.
- **Dismissing parks it**: ×, Esc and a press outside never cancel the work (a modal's scrim takes no press). Closed while it runs, the surface travels into the work's one persistent place, which shows progress and then the outcome; only its own Stop or Cancel ends it.
- **One press brings it back**, exactly where it was; a finished job opens on its outcome.
- **A failure is told and recoverable**, in the error formula with a way on, until acted on; a toast never carries one.

## The Show Don't Tell Rule

Under "Motion grammar" (DESIGN.md line 264); rule at line 303.

**The Show Don't Tell Rule.** A fact with a shape is drawn, not written out: a schedule as times on a line, a budget as a meter, outcomes as marks in their status colours. Words are for what has no shape; a screen is designed as UI, never as a spreadsheet of its record.

## The One Loop Rule

Under "Motion grammar" (DESIGN.md line 264); rule at line 307.

**The One Loop Rule.** Anything that turns or blinks while pending runs `--dur-loop`, a rotation linear, a pulse ease-in-out; the skeleton's pulse is the one exception. Longer rhythms are multiples of the breath.

## The Steady Swap Rule

Under "Motion grammar" (DESIGN.md line 264); rule at line 309.

**The Steady Swap Rule.** A text swap never moves what stands beside it. Words change through MorphText (`components/ui/morph-text`): the box takes the larger of old and new at once and the new size once settled, so no width tweens. A label with a known second wording stands both in one cell as wide as the wider.

## The Reduced Motion Rule

Under "Motion grammar" (DESIGN.md line 264); rule at line 311.

**The Reduced Motion Rule.** Motion is opt-in: every travelling transition sits under `prefers-reduced-motion: no-preference`, and script asks `motionOk`. With reduced motion, fades still run and everything that travels lands; loops stop. Reduced motion means stillness, never an instant swap: what changed still fades.

## The House Helper Rule

Under "Motion grammar" (DESIGN.md line 264); rule at line 313.

**The House Helper Rule.** Each kind of motion has one helper, which already keeps the curves, clocks, interruption and reduced motion: `morph()` for a size change, `NsPopoverGroup` for sibling popovers, `reflow()` with `data-flip` for a list, `unfold` for a disclosure, `fluid-tabs` and the harness `Rail` for a switch, `keyed` for The Frequency Rule's keyboard half (`platform/motion/`, `cawco/spawn/NsPopoverGroup.svelte`, `components/ui/fluid-tabs`, under `apps/dashboard/src/lib`). A component takes a one-clock composite (`transition-control`, …) rather than listing properties and clocks; a new pairing is a new token.

## The Quiet Feel Rule

Under "Sound and touch" (DESIGN.md line 315); rule at line 317.

**The Quiet Feel Rule.** Sound and touch accompany a gesture the reader is making; they never announce anything, never stand in for a word or a glyph, and never play for something the reader did not do. Sound is Cuelume, synthesized, always at its `subtle` emphasis, off until the reader turns it on (the Sound switch beside the theme in the rail's footer, kept per browser, `feel.svelte.ts`). Touch is web-haptics, for a finger on a coarse pointer only, with no setting. Both load on the first press or key, never with the page, and warm up while idle so the first cue costs no frame.

## The Dark Flips Polarity Rule

Under "Neutral" (DESIGN.md line 340); rule at line 347.

**The Dark Flips Polarity Rule.** At night a groove sits below the card and a thumb above it. Dark mode is a second set of lightness decisions, never an inverted light mode.

## The Reserved Hue Rule

Under "Named Rules" (DESIGN.md line 356); rule at line 357.

**The Reserved Hue Rule.** Crimson, spark yellow, olive and blue mean status, and status only. Progress rings, identity and decoration take `currentColor` or an identity hue. A finished task ring is the one decoration that earns a state colour, because by then it is a result.

## The Coral Is Where You Act Rule

Under "Named Rules" (DESIGN.md line 356); rule at line 359.

**The Coral Is Where You Act Rule.** Coral marks the action (one per view: the act the view is for, so a view for deciding spends it on the decision), the selected nav row, the focus ring, checked controls, the chosen option, the selection tint, and the vermillion rule that parts two regions of a glass card (Files, Caw's panel). Advice is never coral: a recommended option wears the Recommended badge, and when it starts chosen it wears both, so moving the pick moves only the coral. Coral is never a status, so it never reads as an alarm and an alarm never reads as a button.

## The White On Coral Rule

Under "Named Rules" (DESIGN.md line 356); rule at line 361.

**The White On Coral Rule.** Text on coral sits on `action-solid` or `chip-chosen-bg`, never on `brand-solid`. A new coral fill under text is measured to 4.5:1, top gradient stop included, before it ships.

## The Ink Stays Ink Rule

Under "Named Rules" (DESIGN.md line 356); rule at line 363.

**The Ink Stays Ink Rule.** Tooltips and inverted tiles are `ink-solid` with `on-ink`. They are never coral.

## The Idle Has No Fill Rule

Under "Named Rules" (DESIGN.md line 356); rule at line 365.

**The Idle Has No Fill Rule.** An idle session carries no chip. A quiet row means a healthy row, so rest is drawn as nothing.

## The No Indigo Rule

Under "Named Rules" (DESIGN.md line 356); rule at line 367.

**The No Indigo Rule.** Indigo is never a brand, action or accent hue. Identity hues span the wheel for telling things apart and are never promoted to a brand role.

## The Glyph, Word, Hue Rule

Under "Named Rules" (DESIGN.md line 356); rule at line 369.

**The Glyph, Word, Hue Rule.** Status is never colour alone. It reads glyph, then word, then hue (a Solar duotone glyph, then "Working", "Needs you", "Failed", "Idle", "Sleeping", "Stopped" or "Unreachable"). A mark that changes state changes shape as well as colour, and a chip carries the word inside its tint.

## The 500 Ceiling Rule

Under "Named Rules" (DESIGN.md line 389); rule at line 390.

**The 500 Ceiling Rule.** No product text goes above 500. Emphasis is a step from 400 to 500 or an ink step, never bold.

## The Role, Not Size Rule

Under "Named Rules" (DESIGN.md line 389); rule at line 392.

**The Role, Not Size Rule.** Text takes a role by what it does: names, headings, column heads and badges are label; sentences are body; timestamps, counts, units and hints are meta. Nobody picks a size and finds a role for it.

## The Tabular Figure Rule

Under "Named Rules" (DESIGN.md line 389); rule at line 394.

**The Tabular Figure Rule.** A figure that changes carries `.num` and is set in tabular numerals, so a ticking value never moves its neighbours; tables are tabular by default.

## The Truncate Inside Rule

Under "Named Rules" (DESIGN.md line 389); rule at line 396.

**The Truncate Inside Rule.** Text truncates in an inner span, never on the control or link, so the hit area is never clipped; in a row the name gives way first.

## The Row Dress Rule

Under "Named Rules" (DESIGN.md line 389); rule at line 398.

**The Row Dress Rule.** A list row has at most four dresses: its name in label and `ink-row`; the thing itself (a comment's words, a message) in body and `ink-strong`; facts about it in meta and `ink-muted`; an unread fact in `ink-strong`. A state the row's mark draws takes no word, and the name carries the row's one weight step.

## The Mark Line Rule

Under "Named Rules" (DESIGN.md line 389); rule at line 400.

**The Mark Line Rule.** Words beside a mark (an icon, a dot, an avatar, a keycap) have their x-height's middle on the mark's middle, within half a pixel, in every engine. The mark line recipe (app.css) trims each run to its x-height band and pads the room back; the kit's rows draw it, any other row takes `.mark-line`, a box on the line says `data-box`, and a mark beside wrapping words sits in a `.mark-cell`. `apps/dashboard/scripts/mark-line-check.ts` enforces it.

## The 16px Field Rule

Under "Named Rules" (DESIGN.md line 389); rule at line 402.

**The 16px Field Rule.** On a coarse pointer every text field renders at 16px or more, because iOS Safari zooms into a smaller field.

## The Title Bars Follow Liquid Glass Rule

Under "Layout" (DESIGN.md line 406); rule at line 410.

**The Title Bars Follow Liquid Glass Rule.** Every bar that heads a surface (the top bar, a pane, a side panel, a sheet, a canvas's band) follows Apple's toolbar model as Liquid Glass revised it (HIG, Toolbars, 2025-12-16), on web and native:
- **One bar, one row.** Title and controls share one line. Facts about the surface (its place, a path, an id, a count, its ask) are content, never a second line in the bar.
- **A title only where it helps.** A panel opened by its name carries none, its actions floating over its content. A title is the view's own short name, never the app's name, an id, a path or a breadcrumb.
- **A place shown as a place.** A machine is its OS mark and name; a path is never printed in a bar.
- **No bar ground.** A bar draws no fill, hairline or shadow; content runs to the top edge and the scroll edge effect blurs it under the controls, from the first scroll.
- **Floating groups of bare symbols.** At most three groups (leading, centre, trailing), each one capsule of the panel's glass. Items are bare symbols until hovered, named in their tooltip; words only where no symbol says it. Each is a BarItem, which alone draws its hover, pressed, selected and count (The Glass Contour Rule); its count is the Badge's `corner` form, taking no room. Trailing: what acts on the view, More, the prominent action, then Close (a sheet's leads, before its title).
- **One prominent action**, trailing, on `action-surface`; colour on the glass is for it and for status alone.
- **Back and Close are symbols**, named by where they go, never the words Back or Close.

## The Row Grid Rule

Under "Layout" (DESIGN.md line 406); rule at line 423.

**The Row Grid Rule.** A row's mark is centred in a 28px lead column, its words start on one text column `space-3` after it, and its last control ends on one trailing edge `space-3` in from the list's, drawn in ink: its last painted pixel (a fill, a ghost's last letter or stroke) lands on the edge within 1px, its box hanging past by what its ink stops short, never past the row's `space-3`, so a list never scrolls sideways.

## The Frame Recesses Rule

Under "Named Rules" (DESIGN.md line 450); rule at line 451.

**The Frame Recesses Rule.** The frame recesses and content never does. The one sanctioned card-in-card is the stat tile's recessed well.

## The Warm Shadow Rule

Under "Named Rules" (DESIGN.md line 450); rule at line 453.

**The Warm Shadow Rule.** Shadows are warm ink taken from the neutral ramp, never `rgba(0,0,0,·)`. The tile's night drop is the one black, under a ring of ink.

## The Night Ring Rule

Under "Named Rules" (DESIGN.md line 450); rule at line 455.

**The Night Ring Rule.** At night a raised surface is told apart from its frame by a 1px inner ring of ink as well as its drop. The ring is part of the shadow token, so a component that takes the token gets it in both schemes.

## The Glass Contour Rule

Under "Shapes" (DESIGN.md line 457); rule at line 461.

**The Glass Contour Rule.** A control standing in a bar's glass takes the glass's contour by where it stands: its corners facing the capsule's ends take the capsule's radius less the pad, those facing a neighbour `radius-xs` (BarGlass marks each item leading, middle, trailing or only; design.css `concentric-row`). Hover, pressed, selected and focus are drawn on that one box (`concentric-at`), the ring inside it, so every state shares its contour; `state-shape` forces and reads each.

## The Concentric Rule

Under "Shapes" (DESIGN.md line 457); rule at line 463.

**The Concentric Rule.** A surface nested in another's corner takes the outer radius less the gap between their edges, the outer's edge counted. Where no radius token is the derived value, a derived token holds it (`inner-well-r`), never a literal. A container declares its outer radius and inset once (design.css `concentric-in`) and its rows and parts take the result (`concentric-<radius>`); the hover ghost, the selection pill and the focus ring take the contour of what they mark.

## The Measured Exception Rule

Under "Shapes" (DESIGN.md line 457); rule at line 465.

**The Measured Exception Rule.** The stat tile keeps the comp's radii (a card round its well), a panel its shell, and the smallest marks the hair. Each is a token.

## The Whole Pixel Border Rule

Under "Shapes" (DESIGN.md line 457); rule at line 469.

**The Whole Pixel Border Rule.** A border or outline is a whole CSS pixel; a fractional stroke is an inset ring (`inset-ring-(length:--x)`) or an SVG stroke. `scripts/border-width-check.ts` refuses a fractional width.

## The Earned Count Rule

Under "Components" (DESIGN.md line 475); rule at line 479.

**The Earned Count Rule.** A count on a control is drawn only above 0: at 0 the count element is gone and the control's name drops it too, on the web and in the app. A figure whose 0 is itself the reading (a measurement, a share, a total) is not a count.

## The Press Rule

Under "Buttons" (DESIGN.md line 481); rule at line 487.

**The Press Rule.** A compact standalone control (a button, a chip, a switch) scales to `--press-scale`; anything wide or grouped (rows, cards, tabs, segments), and any control that opens a list, menu or card, tints to `surface-pressed` and moves nothing. A link dims. The tint outranks a control's own fill by specificity, never `!important`.

## The Hold-To-Select Rule

Under "Dialog, sheet and drawer" (DESIGN.md line 529); rule at line 535.

**The Hold-To-Select Rule.** A press that starts in a text field is never captured by a drawer or gesture round it, so iOS hold-to-select and Paste reach the field. A held press on a context-menu trigger suppresses the platform callout.

## The Empty Starts Work Rule

Under "Empty, loading and skeleton states" (DESIGN.md line 543); rule at line 548.

**The Empty Starts Work Rule.** An empty state always offers to start the work that would fill it: its one action starts a session with Caw (or the screen's own agent) already asking for the thing, its words editable before they go. Where that can't start, it says why and offers the way by hand.

## The Caw Stands On The Axis Rule

Under "Empty, loading and skeleton states" (DESIGN.md line 543); rule at line 550.

**The Caw Stands On The Axis Rule.** Caw sits in the 28px lead column only on a row. Everywhere else (an empty page, a hero, a setup card, a fault at a surface's centre) he stands centred on the composition's own axis.

## The Claim Of Nothing Rule

Under "Empty, loading and skeleton states" (DESIGN.md line 543); rule at line 552.

**The Claim Of Nothing Rule.** An empty state renders only once the data is known to be empty. While it loads, the skeleton stands at the real layout's size, and the first read replaces it in the reveal. Nothing claims zero while the hub connection is down.

## The Real Wait Rule

Under "Empty, loading and skeleton states" (DESIGN.md line 543); rule at line 554.

**The Real Wait Rule.** Nothing stands in for a wait until it has lasted `--dur-wait-grace`. Caw, once he appears, finishes his enter before what arrives lands, then fades out from the drawing he is on (assets/mascot/README.md, Contract).

## The Solar Duotone Rule

Under "Icons" (DESIGN.md line 569); rule at line 570.

**The Solar Duotone Rule.** Every product icon is Solar's bold-duotone cut, imported through `$lib/icons.ts` (packages/icons); a bar's symbols, chevrons, arrows and CopyButton take Solar's linear cut (`…Linear`, house/bar-symbol-linear). The duotone's second layer is `currentColor` at 50%. A status glyph keeps its `status-*-glyph` hue and holds 3:1 as a whole on its surfaces. Close, Plus and Tick are local glyphs on Solar's 24px grid, a 1.5 stroke with round caps; the Tick is also the done glyph, in `status-done-glyph`. An icon is the glyph alone, no container round it; where Solar ships only a contained cut, a bare one is drawn in its style.
- **Sizes:** 12px beside meta text, 16px in controls and rows (the default), 20px in nav and headers.

## The Caret Rule

Under "Focus and hit areas" (DESIGN.md line 573); rule at line 574.

**The Caret Rule.** A text field's focus indicator is its caret (WCAG 2.2 Understanding 2.4.7): no field, editor or search strip draws the coral ring. A field with a frame steps that frame's edge to `border-control-strong` while its text has focus (`field-edge`); a field that is the whole surface shows its caret alone.

## The One Ring Rule

Under "Focus and hit areas" (DESIGN.md line 573); rule at line 576.

**The One Ring Rule.** Every control shows one ring on keyboard focus only (`:focus-visible`): a 2px outline in `focus-ring`, 2px outside, never a box-shadow, so it follows the radius and survives forced colours; inset on rows, tabs and anything flush or clipped. The ring is for focus alone: a selection or a mode takes the selected marks instead.

## The 44 Touch Rule

Under "Focus and hit areas" (DESIGN.md line 573); rule at line 578.

**The 44 Touch Rule.** On a coarse pointer every control's tappable area reaches 44×44 through a transparent `::after` (`.touch-hit`) while its drawn size stays; neighbours stop at the midpoint (`--hit-gap-x`, `--hit-gap-y`). A text field's area lies under it (`.hit-under`). A chip in running text takes its line's height, as a link does (WCAG 2.5.8's inline exception).

## The 24 Pointer Rule

Under "Focus and hit areas" (DESIGN.md line 573); rule at line 580.

**The 24 Pointer Rule.** On a fine pointer a control drawn under 24×24 reaches 24px through `.pointer-hit`.

## The Peer Rule

Under "Answering a permission" (DESIGN.md line 584); rule at line 585.

**The Peer Rule.** Approve and Deny are peers on every surface that answers a permission (Caw's panel, the transcript's card `transcript/Prompt.svelte`, the peek): the operator answers under time pressure, often from a phone, and a rushed thumb must not grant when it meant deny. They are the same size (`sm`, with a 44×44 hit area on every pointer), the same label type, the same `surface-recess` fill and `border-button-outline` edge, in `ink-strong`, reading apart by glyph, word and place, never by hue; no status fill or ink touches either, and neither changes under the pointer. They stand at opposite ends of their row, at least `--space-8` apart, with no third control between them.

## The Consequential Grant Rule

Under "Answering a permission" (DESIGN.md line 584); rule at line 587.

**The Consequential Grant Rule.** A standing grant ("Always allow … for …") is wider than the request, so it is kept apart: under a break and a hairline, after a sentence saying what it would allow, in the warning tint with warning ink, a shield glyph and a real edge, the most salient control on the card on purpose. Above the answer row the card says who asks, what will happen and to what, and the change itself, open (the diff, scrolling inside). Nothing is behind a disclosure: a grant is made on what it changes.

## The Should It Exist Rule

Under "Voice" (DESIGN.md line 589); rule at line 593.

**The Should It Exist Rule.** Before a string is phrased, it earns its place on the screen (the `clean-copy` skill). Walk it down in order and cut at the first that fires: a thing the person would never have wondered about, unprompted, goes, since naming it plants the question; a caption that restates its label, field or value goes; a line that rules out a failure, defends a choice or remembers a fixed bug goes (the fix is the fix). Cut whole clauses; when nothing is left, the element goes with its words, its empty hint prop and its `<p>` too.

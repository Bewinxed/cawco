# CawCo named design rules

Generated from DESIGN.md by `bun run design:rules`; do not edit. DESIGN.md wins where they differ.

## The No Ease-In Rule

Under "Motion grammar" (DESIGN.md line 473); rule at line 481.

**The No Ease-In Rule.** No ease-in curve exists. Anything that starts slow feels like the interface hesitating.

## The Fast Exit Rule

Under "Motion grammar" (DESIGN.md line 473); rule at line 483.

**The Fast Exit Rule.** Exits are shorter than entrances. A popover opens over 260ms and closes over 160ms. A dialog opens over 280ms and closes over 160ms. A toast rises over 280ms and leaves over 160ms.

## The One Object Rule

Under "Motion grammar" (DESIGN.md line 473); rule at line 485.

**The One Object Rule.** What is on both sides of a change travels; it never vanishes on one side and appears on the other (`motion/share.svelte.ts`). A sidebar row becomes the tab it opens, a section row's title flies into the editor header, a sent message flies from the composer into the transcript row it became. A flight runs 280ms on the drawer curve, as a transform (FLIP) or a clip that opens from the source's box. The source is hidden while its copy flies, so the screen never shows two. A surface that closes on work still running travels into the place that work is parked, and comes back out of it (The Work Outlives Its Surface Rule).

## The Nothing Jumps Rule

Under "Motion grammar" (DESIGN.md line 473); rule at line 487.

**The Nothing Jumps Rule.** When a list changes, rows that stay slide to their new places, rows that leave close while fading, and rows that arrive are uncovered top to bottom while what follows makes room (`motion/rows.svelte.ts`). Movement takes 280ms on ease-in-out, arrivals fade over 260ms, departures fade over 160ms, all started on the same frame. In a batch a tree's fold paces (closing over `--dur-exit`, opening at its line's speed), a row's fade runs over its own uncovering's or closing's duration, so each row is one clock. A move that happens entirely off screen jumps instead of sliding, so nothing drifts into view behind the reader's scroll.

## The Interruptible Rule

Under "Motion grammar" (DESIGN.md line 473); rule at line 489.

**The Interruptible Rule.** Every transition turns back from where it is drawn. Popovers transition on `data-state` rather than playing keyframes, folds animate from the drawn height, and a segmented thumb caught mid-glide restarts from where it stands.

## The Stay In Context Rule

Under "Motion grammar" (DESIGN.md line 473); rule at line 491.

**The Stay In Context Rule.** The reader stays where they are and knows what is true, from the moment they ask for something to the moment it is done. The owner: "This fluid ux is the bar for any part of this project. Keeps the user in context." Four questions shape every flow, and their answers decide its form:
- **Where is their attention?** The flow happens there. The thing they acted on stays in view and becomes its own result. Nothing sends them to another page, stacks a second surface on the first, or leaves a toast for them to connect back to what they did.
- **What do they need to know to decide?** The consequences this action really has, shown before they commit, and nothing more. A light, reversible action just happens where it was asked. One that reaches other things names those things where the decision is made.
- **What is true right now?** The system's state as it changes, not the state the interface hopes for. Something is done when the system says it is. An action that takes time shows its progress on the things it is changing.
- **What if it doesn't go to plan?** They are still where they were, with what they had, told what happened to which thing, and able to carry on from there. Work that runs longer than the surface that started it is kept by The Work Outlives Its Surface Rule, through a reload and a dismissal alike.

## The Open Page Rule

Under "Motion grammar" (DESIGN.md line 473); rule at line 505.

**The Open Page Rule.** Almost nothing blurs the page or stops the reader acting elsewhere. A surface that asks or shows something opens in the page, beside what it concerns, and the rest of the page stays live: the reader can scroll, read, or press something else, and the surface waits or follows. The owner: "standing rule, there should almost never be a dialog or a sheet that blurs the page or prevents the user from taking other actions". The question to ask: if they press something else now, does anything break? If nothing breaks, nothing blocks. A scrim, a blur or a modal hold is for the rare moment when acting elsewhere would make the open question wrong, and the dialog, sheet and drawer recipes below are for those moments only. Add machine is one by the owner's word ("IT'S A MODAL, AND IT'S MINIMIZEABLE TO SOMEWHERE IF IT'S DISMISSED WHILE IT'S WORKING, THEN I CAN GO BACK TO WHERE I WAS"): the kit's dialog, centred over the scrim on a desk and its bottom sheet on a phone, its two ways in as tabs (Over SSH, By a command) over the details, with no question first.

## The Work Outlives Its Surface Rule

Under "Motion grammar" (DESIGN.md line 473); rule at line 507.

**The Work Outlives Its Surface Rule.** Work started in a surface (a window, a sheet, a tray, a popover, a dialog, a drawer) that runs longer than the surface stays open (an install, a spawn, an upload, a sign-in, an update, any job of more than a few seconds) belongs to the work, not to the surface, and nothing the reader does to the page loses it. Work that is done within a second and leaves nothing behind (a rename, a toggle) is outside it: it just happens (The Stay In Context Rule).
- **A reload keeps it.** The surface comes back open, at the same step, with the same details: what was typed, what was picked, and the job's progress as it stands now. What the surface shows is read from where the work lives (the hub's job, the draft store, the tab's own storage), never from memory a reload empties. A secret (a password, a key) is the one thing never kept; the surface asks for it again and says why.
- **Dismissing parks it.** ×, Esc and a press outside close the surface; they never cancel the work or drop what it holds. A modal is the one exception to the press outside: a press on its scrim does nothing (the owner: "this stupid fucking design will dismiss the modal as soon as i click somewhere else"), and only its × and Esc close it (on a phone, a finger dragging its sheet down is its ×). Closed while its work runs, it minimizes into that work's place; closed before anything has started, it just closes, and nothing parks. Only the surface's own Stop or Cancel ends the work. It goes on in one persistent place, findable from anywhere and named for its kind of work (a machine being added among the machines, a session starting as its own row, an update in Caw's panel), where it shows its live progress and then its outcome. The surface travels into that place as it closes (The One Object Rule), so the reader sees where the work went.
- **One press brings it back.** A press on the parked place opens the surface again exactly where it was: the same step, the same details, the progress as it stands now. A finished job opens on its outcome, which stands until the reader acknowledges it.
- **A failure is told and recoverable.** It is said in words in the parked place, and in the surface while it is open, in the error formula (WORDS.md: what happened, why, how to fix it, what happens next), its details kept under Show details (RowFault), with a way to carry on from where it stopped (Retry, Reopen, the step to fix). It stands until the reader acts on it; a toast, which leaves on a timer, never carries one.

## The Show Don't Tell Rule

Under "Motion grammar" (DESIGN.md line 473); rule at line 515.

**The Show Don't Tell Rule.** A fact with a shape is drawn, not written out: a schedule as times on a line, a budget as a meter, a run of outcomes as marks in their status colours, who runs something as their mark. Words are for what has no shape (a prompt, a reason, a name), and a row of labelled text facts is a sign that something should be drawn. The owner, on a routine's detail written as label and value rows: "walls of text with no structure, many things can be told with ui or visually rather than spamming text rows".

## The One Loop Rule

Under "Motion grammar" (DESIGN.md line 473); rule at line 521.

**The One Loop Rule.** Anything that turns or blinks while something is pending runs one ambient loop, `--dur-loop` (1.2s): a spinner, the task ring's arc, and Tailwind's `animate-spin`, `animate-pulse` and `animate-ping`, which the theme points at the token. A rotation turns linearly; a pulse runs ease-in-out and a ping ease-out. The skeleton's pulse is the one exception, the owner's pick of transitions.dev's recipe exactly: `--dur-skeleton-pulse` (1s), every skeleton on its own one clock. Longer rhythms are multiples of the breath, never new numbers: the thinking indicator's words change every two breaths. Tailwind's default transition timing (`transition-colors` and its siblings) is `--dur-control` on ease-out.

## The Steady Swap Rule

Under "Motion grammar" (DESIGN.md line 473); rule at line 523.

**The Steady Swap Rule.** A text swap never moves what stands beside it, and runs on one clock. Words change in place through MorphText (`components/ui/morph-text`), the one way the product morphs words: the box takes the wider and taller of the old and new words at once, holds there while the letters cross, and takes the new words' size in one step when the morph has settled; no width or height ever tweens. Every animation of a swap (a letter gliding to its new place, one arriving from 0.95, one leaving to 0.95, a digit rolling in its slot, and their fades) shares one start, `--dur-morph` (180ms) and ease-out. With reduced motion nothing moves and the swap is still not instant: the old words fade out where they stand and the new ones fade in where they lay out, in the same held box, opacity only, over `--dur-morph`. A label with a second wording it is known to take (a button's "Answer" and "Answering…") stands both in one cell as wide as the wider, so it never changes width at all.

## The Reduced Motion Rule

Under "Motion grammar" (DESIGN.md line 473); rule at line 525.

**The Reduced Motion Rule.** Motion is opt-in. Every travelling transition and keyframe sits under `prefers-reduced-motion: no-preference`, and JavaScript motion asks the same question through `motionOk` (`motion/curves.svelte.ts`). With reduced motion, opacity and colour fades still run, pages cross-fade in place over 120ms, heights land at once, folds fade instead of opening, list changes only fade, flights do not fly, and loops stop (an indeterminate spinner keeps turning). Reduced motion means stillness. It does not mean an instant swap.

## The House Helper Rule

Under "Motion grammar" (DESIGN.md line 473); rule at line 531.

**The House Helper Rule.** Each kind of motion above has one helper, and a component takes it rather than writing its own (paths from `apps/dashboard/src/lib`). Each already keeps the curves, the clocks, interruption and reduced motion these rules ask for.
- **`morph()`** (`cawco/motion/morph.svelte.ts`, `{@attach morph()}`): a container whose content changes size tweens to its new size over `--dur-morph` on the drawer curve, instead of jumping (a popover's list arriving, an error line appearing, a card switching what it shows). The words themselves change through MorphText (The Steady Swap Rule).
- **`NsPopoverGroup`** (`cawco/spawn/NsPopoverGroup.svelte`, its state in `popover-group.svelte.ts`, its surface `components/ui/glide-popover`): sibling popovers sharing one surface, so moving from one trigger to the next glides that surface and morphs its width and height rather than closing one and opening another.
- **`reflow()` with `data-flip`** (`cawco/motion/rows.svelte.ts`): a list's reorders, arrivals and departures (The Nothing Jumps Rule). Attach `{@attach reflow()}` to the container and mark what travels: `data-flip` on a row, `"pop"` on a chip, badge or count, `"box"` on a card whose edge is drawn.
- **`unfold`** (`cawco/motion/fold.svelte.ts`): a disclosure's height, as a Svelte transition on what an `{#if}` mounts: `in:unfold` grows it from nothing to its measured height over `--dur-pop`, `out:unfold` folds it back over `--dur-exit`, fading with the height, so what sits below slides.
- **`fluid-tabs`** (`components/ui/fluid-tabs`): segmented and tab switches, their sheet sliding under the choice (Segmented controls and tabs).
- **The harness switch** (`cawco/motion/Rail.svelte`, down the New session form's harness rail in `cawco/spawn/ModelSection.svelte`, across the home's Working/Finished switch) is the reference tab switch: a thumb that slides under the chosen item and one label that travels to the item under the pointer or the keyboard and resizes to its name, rather than a tooltip per item, both gliding over `--dur-morph` on ease-in-out. A new switch is measured against it.

## The Quiet Feel Rule

Under "Sound and touch" (DESIGN.md line 539); rule at line 541.

**The Quiet Feel Rule.** Sound and touch accompany a gesture the reader is making; they never announce anything on their own, never stand in for a word or a glyph, and never play for something the reader did not do. Sound is Cuelume (synthesized live, no files), always at its `subtle` emphasis. It is off until the reader turns it on with the Sound switch beside the theme in the rail's footer, and the choice is kept in this browser (`feel.svelte.ts`). Touch is web-haptics: the Vibration API on Android, and on iOS Safari, which has none, the system tick of a switch toggled out of sight. It answers only a finger on a coarse pointer and has no setting. Both libraries load on the first press or key, never with the page, and Cuelume's audio graph is built while idle right after with an inaudible play, so the first cue costs no frame (built on the first real cue it cost the frame that cue landed in: 76ms against 4ms warm). The moments, all in the composer today:
- **Detent** (the recall wheel landing on another entry): `select`, rising toward older and falling toward newer, with a `selection` tick. Overshooting past an end is not a detent.
- **Hold** (a held press bringing the wheel up): `open`, with a `medium` tap.
- **Open and close** (the wheel brought up by a key, and put away unchosen): `open` and `close`, no touch.
- **Take and give back** (a queued message's words lifted into the composer, and given back to their bubble): `select` and `close`, each with a `light` tap.

## The Dark Flips Polarity Rule

Under "Neutral" (DESIGN.md line 579); rule at line 585.

**The Dark Flips Polarity Rule.** At night a groove sits below the card (recess-deep is neutral-1) and a lifted thumb sits above it (neutral-6). Dark mode is a second set of lightness decisions, never an inverted light mode, and neither scheme is designed first.

## The Reserved Hue Rule

Under "Named Rules" (DESIGN.md line 593); rule at line 594.

**The Reserved Hue Rule.** Crimson, spark yellow, olive and blue mean status, and status only. Progress rings, identity and decoration take `currentColor` or an identity hue. A finished task ring is the one moment a decoration earns a state colour, because by then it is a result (`TaskRing.svelte`).

## The Coral Is Where You Act Rule

Under "Named Rules" (DESIGN.md line 593); rule at line 596.

**The Coral Is Where You Act Rule.** Coral marks the action (one per view: the act the view is for, so a view for deciding spends it on the decision), the selected nav row, the focus ring, checked controls, the chosen option and the selection tint. It is never a status: failed is crimson and needs-you is spark, so coral never reads as an alarm and an alarm never reads as a button.

## The White On Coral Rule

Under "Named Rules" (DESIGN.md line 593); rule at line 598.

**The White On Coral Rule.** Text on coral sits on `action-solid` or `chip-chosen-bg`, the measured fills, never on `brand-solid`. A new coral fill under text is measured to 4.5:1, top gradient stop included, before it ships.

## The Ink Stays Ink Rule

Under "Named Rules" (DESIGN.md line 593); rule at line 600.

**The Ink Stays Ink Rule.** Tooltips and inverted tiles are `ink-solid` with `on-ink`. They are never coral.

## The Idle Has No Fill Rule

Under "Named Rules" (DESIGN.md line 593); rule at line 602.

**The Idle Has No Fill Rule.** An idle session carries no chip. A quiet row means a healthy row, so rest is drawn as nothing.

## The No Indigo Rule

Under "Named Rules" (DESIGN.md line 593); rule at line 604.

**The No Indigo Rule.** Indigo is never a brand, action or accent hue. Identity hues span the wheel for telling things apart and are never promoted to a brand role.

## The Glyph, Word, Hue Rule

Under "Named Rules" (DESIGN.md line 593); rule at line 606.

**The Glyph, Word, Hue Rule.** Status is never colour alone. The session status reads glyph, then word, then hue (a Solar duotone glyph, then "Working", "Needs you", "Failed", "Idle", "Sleeping", "Stopped" or "Unreachable"). The activity dot changes shape as well as colour: Needs you pings, Unreachable is hollow, Sleeping is a moon. A board chip carries the word inside its tint.

## The 500 Ceiling Rule

Under "Named Rules" (DESIGN.md line 634); rule at line 635.

**The 500 Ceiling Rule.** No product text goes above 500; Fredoka's 600 is brand display only. Emphasis is a weight step from 400 to 500 or an ink step, never bold. The prose plugin's 600 to 800 weights are overridden back to 500.

## The Role, Not Size Rule

Under "Named Rules" (DESIGN.md line 634); rule at line 637.

**The Role, Not Size Rule.** Text takes a role by what it does. Names, group headings, column heads and badges are label. Sentences and descriptions are body. Timestamps, counts, units and hints are meta. Nobody picks a size and finds a role for it.

## The Tabular Figure Rule

Under "Named Rules" (DESIGN.md line 634); rule at line 639.

**The Tabular Figure Rule.** A figure that changes (a count, a price, an age, a percentage) carries `.num` and is set in tabular numerals, so a ticking value never moves its neighbours. Tables get tabular numerals by default. The KPI role always carries `.num`: `type-kpi` is tabular itself, but a component rule that sets the role by the `font` shorthand resets `font-variant-numeric`.

## The Truncate Inside Rule

Under "Named Rules" (DESIGN.md line 634); rule at line 641.

**The Truncate Inside Rule.** Text truncates with an ellipsis in an inner span, never on the control or link itself, so the hit area is never clipped. In a row, the name gives way first and the meta line keeps one line.

## The Row Dress Rule

Under "Named Rules" (DESIGN.md line 634); rule at line 643.

**The Row Dress Rule.** A list row has at most four dresses, and each part takes the one for its job:
- the row's name is label in `ink-row` (`ink-subtle` when it is a state standing in for a name);
- the thing itself (a comment's words, a message) is body in `ink-strong`;
- facts about it (age, counts, place, the last reply) are meta in `ink-muted`, with a speaker's name inside such a line at 500;
- an unread fact steps to `ink-strong`, a coral word takes `brand-ink`, and a state that the row's mark already draws takes no word at all.

## The Mark Line Rule

Under "Named Rules" (DESIGN.md line 634); rule at line 651.

**The Mark Line Rule.** Words set beside a mark (an icon, a glyph, an avatar, a status dot, a keycap) have their x-height's middle on the mark's middle, within half a pixel, in every engine. Centring a line box does not do it: Figtree's ascent and descent sit unevenly about its x-height and Blink floors the half-leading, so a centred 13px label sat 0.3px below its mark in Blink and 1.25px below in WebKit and Gecko. The mark line recipe (app.css) trims each run of words to its x-height band (`text-box: trim-both ex alphabetic`) and pads back the room the trim took, half above and half below, so the run keeps its line's height and centring lands on the x-height. The kit's rows draw it by their own class (option and tray chips, menu items, segments, rail lines, and the button, badge and toggle); any other row takes `.mark-line`. Its words are elements, never bare text beside the mark. A box on the line (a mark's tile, a chevron's cell, a pill) says so with `data-box`. A control that holds nothing but marks (an icon-only button, a link that is only its glyph) is a box too and says `data-box`, centred as one, its glyph on the line's middle within half a pixel; the kit's button given an icon and no label says it on its own. The recipe never finds a box by what it holds: a `:has()` there made every element on the page a selector anchor, and every press restyled the root and the line of ancestors under it. A control's words are an element of their own, and a line that sets a mark in running text says `.mark-text`. A run that truncates clips with `overflow: clip`, never `hidden`, which Gecko does not trim. A run that stands alone, such as a pill's own words or a grid cell's label, takes `.mark-text`. A mark beside words that wrap sits in a `.mark-cell`, one line tall at the top of a flex-start row, never nudged down with a margin. A mark set in running text sits on `vertical-align: middle`, and its row says so with `<!-- mark-line: why -->` directly above it, as does any row whose mark is not beside its words. `bun run check` enforces all of this (apps/dashboard/scripts/mark-line-check.ts).

## The 16px Field Rule

Under "Named Rules" (DESIGN.md line 634); rule at line 653.

**The 16px Field Rule.** On a phone or a coarse pointer every text field renders at 16px (a floor in the last cascade layer, `overrides`, so no utility takes a field under it), because iOS Safari zooms into any field under 16px.

## The Title Bars Follow Liquid Glass Rule

Under "Layout" (DESIGN.md line 657); rule at line 661.

**The Title Bars Follow Liquid Glass Rule.** The owner: "this language for titlebars should be scrpaped from all future design, apple's HIG and liquid glass has revised the titlebar model significantly". Every bar that heads a surface (the top bar, a page, a pane, a side panel or column, a sheet, the peek, the artifact panel, a canvas's band) follows Apple's toolbar model as Liquid Glass revised it, on the web, the phone's web and the native app alike (HIG, Toolbars, updated for Liquid Glass 2025-12-16: developer.apple.com/design/human-interface-guidelines/toolbars):
- **One bar, one row.** A surface has one bar, and its title and controls share one line. Facts about the surface (its place, a path, an id, a date, a count, its ask, what it is doing) are content: drawn or said in the surface, or left out. A title stacked over a line of facts beside one row of buttons is the shape this rule retires (the owner, on a project's head: "on the left you have two rows but on the right u have 1 row of buttons").
- **A title only where it helps.** "If titling a toolbar seems redundant, you can leave the title area empty." A side panel or column the person opened by its name (Caw's column, the Comments rail, an inspector) carries no title: its title area stays empty and its actions float over its content (the owner, on Caw's column: "literally useless tiltebar that says nothing, use apple's liquid glass-style HIG floating actions"). Where a title helps, it is the view's own name, short: "Aim for a word or short phrase that distills the purpose of the window or view, and keep the title under 15 characters long so you leave enough room for other controls." It is never the app's name ("Don't title windows with your app name"), an id, a path, a breadcrumb of section names joined by `·` or `›`, or the name of a section the rail already shows chosen.
- **A place shown as a place.** Where a surface lives on one machine or in one folder and that matters to it, the place is drawn as a place: the machine as its OS mark and its name, as a control in a group or a fact in the content. A path is never printed in a bar.
- **No bar ground.** A bar draws no fill, hairline or shadow of its own: "Reduce the use of toolbar backgrounds and tinted controls. … use the content layer to inform the color and appearance of the toolbar, and use a ScrollEdgeEffectStyle when necessary to distinguish the toolbar area from the content area." The content runs to the surface's top edge, and where it scrolls under the controls the scroll edge effect parts them: the content blurs and fades under the bar ("Scroll edge effects further enhance legibility by blurring and reducing the opacity of background content", HIG, Materials), in from the first scroll and absent at rest, as the transcript's head dissolves into its tab. The folder tabs' shelf is the tab strip's own ground, not a bar's.
- **Floating groups of bare symbols.** A bar's controls stand in at most three groups, leading, centre and trailing ("Minimize the number of groups. … In general, aim for a maximum of three"). Each group is one capsule of the panel's glass floating over the content, the top bar's trailing group its recipe (Navigation, menus and floating surfaces): Liquid Glass "forms a distinct functional layer for controls and navigation elements … that floats above the content layer" (HIG, Materials). Its items are bare symbols with no border or fill of their own until hovered or pressed ("Prefer system-provided symbols without borders. … Borders (like outlined circle symbols) aren't necessary because the section provides a visible container"), each named for the screen reader and in its tooltip. A control takes words only where no symbol says it ("except for actions like edit that aren't well-represented by symbols"), in a group of its own ("Keep actions with text labels separate"). Leading holds going back and the title; centre the view's mode or switch; trailing what acts on the view, then More, then the prominent action, with Close after it where the surface closes.
- **One prominent action, trailing.** At most one control in a bar is prominent: the one act the view is for, on the coral `action-surface` (Send on a page of picks, Done on a form). A view whose purpose is deciding puts its coral on the decision; Ask Caw takes it only on a view whose purpose is asking him. "Only specify one primary action, and put it on the trailing side of the toolbar." Colour on the glass is for that action and for status alone ("reserve it for elements that truly benefit from emphasis, such as status indicators or primary actions. … Refrain from adding color to the background of multiple controls", HIG, Color › Liquid Glass color).
- **Back and Close are symbols.** Back is the chevron-left symbol alone and Close the close symbol alone, each named in its tooltip and for the screen reader by where it goes ("Back to Board"), never a button whose words say Back, Close or the page it returns to: "Prefer the standard symbols for each, and don't use a text label that says Back or Close."

## The Frame Recesses Rule

Under "Named Rules" (DESIGN.md line 706); rule at line 707.

**The Frame Recesses Rule.** The frame recesses and content never does. The one sanctioned card-in-card is the stat tile's recessed well, which the reference plan calls "a signature move of the design".

## The Warm Shadow Rule

Under "Named Rules" (DESIGN.md line 706); rule at line 709.

**The Warm Shadow Rule.** Shadows are warm ink taken from the neutral ramp, never `rgba(0,0,0,·)`. The tile's night drop is the one black, at 30%, under a ring of ink.

## The Night Ring Rule

Under "Named Rules" (DESIGN.md line 706); rule at line 711.

**The Night Ring Rule.** At night a raised surface is told apart from its frame by a 1px inner ring of ink as well as its drop. The ring is part of the shadow token, so a component that takes the token gets it in both schemes without a class.

## The Concentric Rule

Under "Shapes" (DESIGN.md line 713); rule at line 717.

**The Concentric Rule.** A surface nested in another's corner takes the outer radius less the gap between their edges, the outer's edge counted: outer = inner + gap. It binds where the inner corner stands inside the outer's curve, the same gap in from both edges and less than the outer radius. The dialog tray (18px, 6px padding, no edge) holds a 12px body. A menu (12px, 1px edge, 6px padding) holds 5px items. The segmented groove (10px, 3px padding) holds a 7px thumb. The composer shell (12px, 1px edge, 7px inset) holds 4px controls, its radius less its inset and its edge (`c-inset-composer`). A subagent's well (4px padding) holds its 5px rows, so the well is 9px (`inner-well-r`), the rows' `--radius-xs` plus its `--space-1`. Where no radius token is the derived value it is a derived token whose CSS is that sum or difference (`inner-well-r`), never a literal. A container a highlight stands in says it once (design.css `concentric-in`): it declares its outer radius and its inset, edge counted (`r-outer-lg r-inset-c-inset-floating`), and works out the inner radius, max(0, outer less inset); its rows, segments, controls and parts take it corner by corner (`concentric-<own radius>`), keeping their own radius token where no rounded container holds them. The floating surface (menus, selects, popovers, the bottom sheet's rows: `c-inset-floating`), the composer shell (`c-inset-composer`) and the segmented groove (`c-segmented-pad`) declare it. The hover ghost and the selection pill are drawn from their row's four corners and the focus ring follows the row's radius, so all three take the contour of what they mark; a run's part opened at an edge squares those corners, and the pill under it with them. A probe holds the kit, the new-session form's own popovers and the decision-page kit to it (`scripts/probe-kit/specs/concentric.ts`). The rows standing at a glide popover's own inset (12px, 1px edge, 7px padding) are 4px (`glide-row-r`). A decision page's pane pads past its radius (14px in a 12px pane), so a mockup's corners stand clear of its curve.

## The Measured Exception Rule

Under "Shapes" (DESIGN.md line 713); rule at line 719.

**The Measured Exception Rule.** The stat tile keeps the comp's measured radii (a 10px card around a 7px well, 7px in), even though a concentric well would be 3px. A panel keeps the measured 16px shell (`--radius-panel`: the paywall's hero, a decision page's panels), and the smallest marks keep a 2px hair (`--radius-hair`) rather than the 5px that would turn them into dots. Each is a token, never a literal.

## The Whole Pixel Border Rule

Under "Shapes" (DESIGN.md line 713); rule at line 723.

**The Whole Pixel Border Rule.** A border or an outline is a whole CSS pixel. A browser snaps its width to whole device pixels, so a 1.5px border draws 1px on a 1× screen and on a 3× one. A fractional stroke (the canvas's corner grip, DialKit's easing handles on a decision page, which the kit's page.css redraws over the vendored sheet's 1.5px border) is an inset ring, `inset-ring-(length:--x)`, whose spread is never snapped, or an SVG stroke. `scripts/border-width-check.ts` (in `bun run check`) refuses a fractional border or outline width in a token, a class or a declaration.

## The Earned Count Rule

Under "Components" (DESIGN.md line 757); rule at line 761.

**The Earned Count Rule.** A count on a control is drawn only above 0: a count of none says nothing. On the web and in the app alike, at 0 the count element is gone and the control's name drops it too. A figure whose 0 is itself the reading (a measurement, a share, a total the control reports rather than a number of things it opens) is not a count.

## The Press Rule

Under "Buttons" (DESIGN.md line 763); rule at line 777.

**The Press Rule.** The hand feels a control before release, in one of two ways chosen by size. A compact standalone control (a button, an icon button, a chip, a switch, about 44px tall at most) scales to 0.97 over 160ms on ease-out. Anything wide, large or grouped (rows, cards, card heads, tabs in a strip, segments) tints to `surface-pressed` and moves nothing, because a 0.97 scale pulls a 300px row's edge in by 4.5px; `surface-pressed` is the kit Toggle's on step, the step past the hover (by day the hover step is `surface-fill`'s own, so a press in `surface-fill` would read as the hover; night keeps `surface-fill`). A text link dims to 72% opacity. The scale only runs with motion allowed; the tint always runs. The tint outranks a control's own background by specificity (an id's weight through `:is()`), never by an important declaration, which keeps its fade off the compositor.

## The Hold-To-Select Rule

Under "Dialog, sheet and drawer" (DESIGN.md line 852); rule at line 859.

- **The Hold-To-Select Rule.** A press that starts inside a text field in a drawer is not captured by the drawer, so iOS hold-to-select and the Paste callout still reach the field. A held press on a context-menu trigger suppresses the platform callout, because our menu answers it.

## The Empty Starts Work Rule

Under "Empty, loading and skeleton states" (DESIGN.md line 882); rule at line 887.

**The Empty Starts Work Rule.** An empty state always offers to start the work that would fill it. Its one action starts a session with Caw that already asks him to create the thing, its words written for him and editable before they go. The owner: "all empty states should have a way to initiate a session that prompts caw to create it". Where Caw can't start, the empty state says why, and offers the way to do it by hand.

## The Caw Stands On The Axis Rule

Under "Empty, loading and skeleton states" (DESIGN.md line 882); rule at line 889.

**The Caw Stands On The Axis Rule.** Caw's mark sits in the 28px lead column only on a row: a list entry, a notice, a Needs-you row. Everywhere else (an empty page, a hero, a setup or pairing card, a panel's empty state, a fault at a surface's centre) he stands on the composition's own axis: centred over what he heads, never pushed to its leading edge. The lead column is the row grid's; carrying it into a page, a head or a hero left him at the left of an empty page. The owner: "also again, why is caw left aligned here? u seem to have left aligned him everywhere for some reason".

## The Claim Of Nothing Rule

Under "Empty, loading and skeleton states" (DESIGN.md line 882); rule at line 891.

**The Claim Of Nothing Rule.** An empty state claims there is nothing to show, so it renders only once the data is known to be empty, never while it is still being read. While data loads, the skeleton stands in at the real layout's size, and the first real read replaces it in the skeleton's reveal (a 400ms cross-fade with a 2px cross-blur) rather than as rows arriving.

## The Real Wait Rule

Under "Empty, loading and skeleton states" (DESIGN.md line 882); rule at line 893.

**The Real Wait Rule.** Caw stands in for a wait (loading, reconnecting) only once it has lasted `--dur-wait-grace` (1s; NN/g: no feedback is needed under 1.0s). Until then the area is its plain surface, with no Caw and no line. Once he appears he stays until his enter (his own clip, about 0.8 s) has played, and what arrives waits for that, so he is never cut off mid-entrance. After that what arrives lands at once under its own `--dur-fade` cross-fade and he is gone within `--dur-fade` from any drawing, his still included: he holds the drawing he is on and fades out (opacity to 0, scale to `--leave-scale`, `--ease-out`), so nothing that has arrived sits under a looping Caw. No exit is drawn. A status change is the same leave, then the new status coming in: by its drawn enter, on every drawing of which he is wholly inside the 3.5% action-safe line or not there at all, or where it has none by a fade up from `--leave-scale` over `--dur-pop` on `--ease-out`; nothing waits for a loop to end (assets/mascot/README.md, Contract). Under Reduce Motion he fades over `--dur-fade`, opacity only. Web: SessionSurface's detail area; Apple: `CawWaiting`.

## The Composer Layer Rule

Under "Composer" (DESIGN.md line 917); rule at line 922.

- **The Composer Layer Rule.** Nothing that comes out of the composer moves the transcript (owner: "WHY WOULD ANYTHING THAT COMES OUT OF THE COMPOSER EVEN MOVE THE TRANSCRIPT"). The slash and @ menu, the delegate tray's "+N" and failures shelf and its chip panel, the plan its ring opens, the recall wheel and the grown shape are layers of the composer's dock over the transcript's foot, anchored to what opened them, in no flow and never a size the transcript is told: its box, its scroll and its rows hold still to the pixel while one opens or closes, by construction (probe-kit `composer-layers`). The shelf and the plan are the menu's floating surface across the composer's width, a `space-2` step over the tray row, as tall as what they hold up to the room under the dock's top; each comes in on one `@starting-style` transition (`--dur-pop`, drawer curve, from its foot), which iOS 27.2 Safari applies to an element just added (probe-kit `ios-safari-motion`, 2026-10-23), and leaves by `popOut` over `--dur-exit`. While one stands open, the transcript's foot stands solid under it across the pane (`layer-ground`: `surface-recess`, the foot fade's own, up to the layer's foot, then dissolving over `space-8` under the layer), fading in and out on `transition-fade-show`/`-hide`: the tray row has no surface of its own, so a row scrolled behind would otherwise show as a sliver of a line in the `space-2` step, cut mid-glyph by the layer's foot. Rows pass behind the layer and the tray row as they pass behind the pill, whole or not at all.

## The Composer Touch Rule

Under "Composer" (DESIGN.md line 917); rule at line 923.

- **The Composer Touch Rule.** The textarea sits above its label's touch area, so a press on the text lands on the field itself and iOS hold-to-select and Paste reach it.

## The One Target Rule

Under "Artifact panel, canvas and ink" (DESIGN.md line 932); rule at line 946.

- **The One Target Rule.** On a page in Comment mode, coral is the target and nothing else, and no mark on the page is wider than 1px.

## The Peer Rule

Under "Permission gate" (DESIGN.md line 981); rule at line 984.

**The Peer Rule.** Approve and Deny are peers: the same size (`sm`, 30px; 44px of touch area on a coarse pointer), the same label type, the same fill, the same edge, and neither is ever made the more inviting. Why the rule exists (4ca69663): the operator answers under time pressure, often from a phone, and a rushed thumb must not grant when it meant deny. They take one form on every surface (Caw's panel, the transcript's permission card `transcript/Prompt.svelte`, the peek's answer row `PeekPane.svelte`): apart and untinted. Deny and Approve stand at opposite ends of their row, the row's full width between them and never less than `--space-8`, no third control in that gap, so distance guards the thumb. Both take the one recessed fill (`surface-recess`) and one 1px `border-button-outline` edge, and their glyphs (a cross, a tick) and labels are `ink-strong`; they read apart by glyph, word and place, never by hue. No status fill or status ink touches either (The Reserved Hue Rule; the owner, on a red and a green button under a yellow card: "yellow card on red and green buttons i'm going to VOMIT"). Neither the fill nor the edge changes under the pointer, so the hand's last move never makes one brighter. In Caw's panel the pair's row is the row's last line: Deny on the text column's start, Approve on the trailing edge.

## The Consequential Grant Rule

Under "Permission gate" (DESIGN.md line 981); rule at line 986.

**The Consequential Grant Rule.** A standing grant ("Always allow … for …") is a wider grant than the request, so it is kept apart: under a 32px break and a hairline, after a sentence saying what it would allow, and drawn in the warning tint with warning ink, a shield glyph and a real edge. It is the most salient control on the card on purpose. Above the answer row the card says who asks (its title), what will happen and to what (one strong line), and how much changes; then the change itself, open (the transcript's diff, at most `c-ask-diff-share` of the screen tall, scrolling inside), and the other input fields in a recess well, each value scrolling past 200px. Nothing is behind a disclosure: a grant is made on what it changes.

## The Solar Duotone Rule

Under "Icons" (DESIGN.md line 1007); rule at line 1008.

**The Solar Duotone Rule.** Every product icon is Solar's bold-duotone cut, imported through `$lib/icons.ts`: one face for the whole product. The duotone's second layer is the same `currentColor` at 50% opacity. A status glyph keeps its hue (`status-*-glyph`) at that 0.5 and holds 3:1 or more as a whole on the surfaces it sits on, so a row's state reads in colour at a glance (9ca3b2154). Chevrons and arrows (`alt-arrow-*`, `arrow-*`) use Solar's linear cut because they are glyphs, not marks. Close, Minus, Plus and Tick are local glyphs drawn to Solar's 24px grid with a 1.5 linear stroke and round caps, because Solar has no bare version.
- **Sizes:** 12px beside meta text, 16px in controls and rows (the default for any unsized icon), 20px in nav and headers.

## The Caret Rule

Under "Focus and hit areas" (DESIGN.md line 1011); rule at line 1012.

**The Caret Rule.** A text field's focus indicator is its caret ("When text fields receive focus, a vertical bar is displayed in the field, indicating that the user can insert text", WCAG 2.2 Understanding 2.4.7, w3.org/WAI/WCAG22/Understanding/focus-visible.html). No text field, editor or search strip ever draws the coral focus ring, by a key or by a press: a browser matches `:focus-visible` on any focus of a text field, so a ring there stands the whole time it is typed in. A field with a frame of its own steps that frame's 1px border from `border-control` to `border-control-strong` (3:1, WCAG 1.4.11) while its text has focus, on the frame's own radius (`field-edge`: on the field, or on the frame round a borderless editor). A field that is the whole surface (Find's strip, the composer) shows its caret and nothing else. Under forced colours a text field keeps a transparent outline the system paints (Tailwind's `outline-hidden`).

## The One Ring Rule

Under "Focus and hit areas" (DESIGN.md line 1011); rule at line 1014.

**The One Ring Rule.** Every control (a button, a tab, a row, an option, a handle, a select, a link) shows one ring on keyboard focus only, on `:focus-visible`: a 2px solid outline in `focus-ring`, 2px outside the element. A press on a button shows none. List rows, tabs, options, a select and anything flush against a container or inside a clipping scroller carry the ring inset on their own border box instead, so it never stacks on a border or gets cut. The ring is for focus alone: nothing that is a selection or a mode borrows its colour or its shape, which take the selected marks instead (`selected-bg` and `selected-ink`, the chosen option's `brand-solid` edge, a page mode's 1px `seam`, a selected canvas frame's label in `selected-ink` and its 1px `border-control-strong` edge). The ring's colour is set at rest, so focus only switches it on. A scroller brings a focused control into view with room for its ring. Pointer focus on a control shows nothing.

## The 44 Touch Rule

Under "Focus and hit areas" (DESIGN.md line 1011); rule at line 1016.

**The 44 Touch Rule.** On a coarse pointer every control's tappable area reaches 44×44 through a transparent `::after` (`.touch-hit`, WCAG 2.5.8), while its drawn size and the layout stay the same. Where neighbours sit closer, `--hit-gap-x` and `--hit-gap-y` stop each area at the midpoint so areas never overlap; clusters open their gap on touch (8 to 14px for a row's controls, to 16px in the top bar). A scroller that would clip the areas pads into an equal negative margin. Menu items and nav rows are 44px tall on touch. One exception: a chip set in running text (ui/chip `inline`: a session, mention or skill in the composer or the transcript) takes its line's height as its hit area, as a link does, because a 44px area there would cover the lines above and below it. WCAG 2.2 SC 2.5.8 exempts it: "Inline: The target is in a sentence or its size is otherwise constrained by the line-height of non-target text" (w3.org/WAI/WCAG22/Understanding/target-size-minimum). Every other chip keeps its 44px under a finger.

## The 24 Pointer Rule

Under "Focus and hit areas" (DESIGN.md line 1011); rule at line 1018.

**The 24 Pointer Rule.** On a fine pointer, a control drawn smaller than 24×24 reaches 24px through `.pointer-hit`, with the same midpoint stops. `--hit-scale` keeps the area at 24px on screen inside a zoomed canvas.

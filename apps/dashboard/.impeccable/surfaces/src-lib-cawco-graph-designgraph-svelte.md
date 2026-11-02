---
version: 1
slug: "src-lib-cawco-graph-designgraph-svelte"
primary_target: "src/lib/cawco/graph/DesignGraph.svelte"
related_targets: []
---

# Surface brief: the design graph

**Mode:** Operate. **Job:** a page inside the product, in the artifact panel; it keeps DESIGN.md's visual system and lays itself out for its task. **Verdict:** scrap (spec.md §5), then streamline (the critique of 2 November 2026: ten findings built through its two causes); this brief describes the surface as built.

## Who arrives, and why
The owner of the fleet, from an agent's one-line ask ("Judge the design graph on the routine form at Save failed"), for a look of a minute or two, many times a day: at a desk on a wide window with the agent's conversation beside the panel, sometimes on an iPad or a phone. He comes to see the asked state on the real component, step through its other states, compare two, see the whole set and its holes, play the move into a state and tune its timing, try a list with one, many and the longest records, and leave remarks the agent reads back. Nothing to press when done.

## The two rules every part serves
1. **The stage is the one surface.** The states, the whole set, the move and Compare annotate the stage: a row of the move rested on rings its thing on the stage; a difference named is a link to its ring, and the stage brings that ring into view; the room takes room beside or below the stage, never over it, and the stage's scroller ends at the room's edge at every stop, on a phone too.
2. **One model every face reads.** One timeline scale, from the move's start to its end; one path order for the steps (the component's, as the list shows it); one kept state and one state before it (where the move into it starts, else the one before it on the path), the same in Compare and the Move face; one close; each width named once.

## Parts (by job)
- **The bar**: one row, DESIGN.md's Liquid Glass title bar. Leading, the component's name (a menu of the others when the ask names several). Trailing, one glass group of bare symbols: Compare and the stage's view; Show states only while the room is put away. The view is a card hung from the glass (HangCard): each width once as a device glyph over its figure (390, 680, 1440), the component's own marked on the listed width it equals and standing apart only when none does; scheme as sun and moon; Reduce motion as a switch. No tooltip opens over the card. Focus a press hands back draws no ring.
- **The stage**: the real component mounted live with its states file's records, always 1:1, at its own width and height: no box wider or taller than the component (a form held to its measure takes that width, and the room takes the rest). It shows the kept state and nothing else, named at its head; it changes only on a press. Its scroll is kept across presses and moves; on open the region the kept state changed comes into view once, with room for its ring. Rings stand in a layer of the stage's own, taking no press. "Records as they stood at …" stands under the stage.
- **The room**: one secondary surface with three faces on one fluid-tabs switch: the states (the default), the whole set, the move. One close, its own, and Esc. On a desk the stage and the room are one resizable split (the kit's Resizable, paneforge, on the app's own split edge): the edge between them drags, the stage never under 600px and the room never under 400px; the stage's pane stays while the room comes and goes.
- **The states (the journey)**: every state under its machine's section head, one list row each with its name and its one-line note; a note cut at two lines reads whole in the house tooltip. The kept row's words are in selected ink with an "On stage" mark, never a wash. The list opens with the kept row in view and a machine's head whole at its top. At its foot the steps along the component's path: Previous, "9 of 11, Failed save", Next; the steps belong to the States face alone.
- **The whole set**: a map that pans and zooms (Svelte Flow, dagre): the room's raised surface, each machine a recessed group, each state a raised card with its name, marks and note. Every move is an arrow routed round the cards, the moves between machines included, labelled by its act where no card stands; solid when the states file plays it, dashed when the agent only named it. It opens fitted to every card by Svelte Flow's own fitView with the house's fit (flow/fit.ts `FIT`), fitting again in place as the cards are measured or the room resizes while the view is still a fit; the Fit tool frames the same way; no zoom floor and no zoom figure. The kept card wears the On stage face; error and hole marks are glyphs in their status ink with their words in the house tooltip.
- **The difference**: Compare, a switch that stays on and leaves the room open. It compares with the state before the kept one; a press on another state compares with that one. Each difference is one line at the stage's head and a link to its ring; turning on brings the first ring into view.
- **The move**: one row per thing that moves on the stage, named as he sees it at the move's end ("Form failure unfolds, 260 ms"). The ruler, the bars and the playhead share one lane from the move's start to its end; the playhead is a pill with its time, its hairline down the lane alone. A bar drags its row's stretch, the row's length following the drag; under a finger its handles' areas stop at their midpoint. The editor opens beside its row (to its leading side on a desk; over the rows above it in the phone's drawer): length as a figure with a stepper over Quick 150, Standard 250, Slow 400; curve as named shapes (Linear, Smooth, Slow down, Speed up, Spring), the chosen one drawn large as it stands, with one slider (its intensity, or a spring's bounce) the drawing follows; Advanced holds the delay, the curve's four numbers, and a spring's mass, stiffness and damping. CawCo's own token is named inside the editor only. A tuned row says so, before and after. Out-of-token clips are flagged once at the head.
- **The remarks**: every stage element, state, variant and clip row is a named comment target; no Send, no Done.

## States the surface holds
Reading/mounting (skeleton at the stage's size after the wait grace); failed to mount (error formula in the stage's place, Show details); one state, no machine; kept state with no move; the move reading or failed; playing, paused, scrubbed; comparing, a difference brought into view; a tuned row; records as of a time; reduced motion (Play draws the end with a fade and says so); the hub's link lost (the stage keeps its drawing, marked stale, dimmed).

## Widths
- **390**: where the surface cannot hold the stage at its least (600px) and the room at its least (400px) side by side with their gap and gutters (1064px of its own width), the room is the kit's bottom drawer, stops head, half, whole; the page ends at the drawer's top at each stop; the grabber steps the stops; the drawer's own Close; every control 44px to a finger.
- **680**: the same drawer; the stage never covered.
- **1064 to 1440**: stage and room in view at once, both inside the surface, the stage at its component's width (never under 600px), the room taking the rest.
- **2529**: the surface has about half the window; the stage takes its component's own width, the room the rest, no paper between.

## Untouched
The artifact panel's head, modes, Comments rail, pins, threads, delivery and To check; the canvas view; decision pages; the states file format; the agent's way of opening the surface (`edges`, `group`); the design tokens' existing values.

## Out of scope
Token dials; sashes; the component canvas's map mode; comparing two components' moves; the page's own "Clip kinds" switch; the agent's report format.

## His answers (spec.md, His answers)
A full move editor, presets first, advanced for any length, curve and spring; a tap keeps, and that is the look; the move plays once on arrival then rests at its start; one component in front, the others behind a switch; Compare is a switch that stays on; the journey opens at the asked state; records as they stood when the agent opened the surface, with that time named. Later, on the preview: the stage changes only on a press; resting never previews. On design-graph-arrangement: on a desk the states and the move stand in a room beside the stage, the one arrangement.

## Open with him
Whether group heads become column heads (a deviation from DESIGN.md); whether a width pick replays the move.

## Backlog (the critique of 2 November 2026)
P0/P1, all built: Compare hides what it names; the move's three scales; five rows in an engineer's words; half an editor; the whole set as its map; the stage scrolling against him and its empty room; the phone drawer covering the stage; two closes and stray rings; the stepper counting one machine and the kept row's wash; the phone's overlapping handles and stray stepper.

## Direction contract
direction: inherits DESIGN.md

---
version: 1
slug: "src-lib-cawco-graph-designgraph-svelte"
primary_target: "src/lib/cawco/graph/DesignGraph.svelte"
related_targets: []
---

# Surface brief: the design graph

**Mode:** Operate. **Job:** a page inside the product, in the artifact panel; it keeps DESIGN.md's visual system and lays itself out for its task. **Verdict:** scrap (spec.md §5), designed again from the spec's walk; this brief describes the surface as built.

## Who arrives, and why
The owner of the fleet, from an agent's one-line ask ("Judge the design graph on the routine form at Save failed"), for a look of a minute or two, many times a day: at a desk on a wide window with the agent's conversation beside the panel, sometimes on an iPad or a phone. He comes to see the asked state on the real component, step through its other states, compare two, see the whole set and its holes, play the move into a state and tune its timing, try a list with one, many and the longest records, and leave remarks the agent reads back. Nothing to press when done.

## Parts (by job)
- **The bar**: one row, DESIGN.md's Liquid Glass title bar. Leading, the component's name (a menu of the others when the ask names several: one in front, the rest behind it). Trailing, one glass group of bare symbols: Compare, the stage's view, the room. The view is a card hung from the glass (HangCard): widths as device glyphs (390, 680, 1440, its own), scheme as sun and moon, Reduce motion as a switch. The ask itself stays in the panel's head; the page repeats it nowhere.
- **The stage**: the real component mounted live with its states file's records, always 1:1: at its own width up to its room's, wider widths scrolling sideways, never scaled. It shows the kept state and nothing else, named at its head; it changes only on a press (a step or a press on a state). The component stands on the page's surface with its gutter. Nothing of the surface's own stands over it; the comparison's rings sit in a layer outside each element's box, under the pins, taking no press. Putting the room away never moves it.
- **The room**: one secondary surface with three faces on one fluid-tabs switch: the states (the default), the whole set, the move. Closed by Close or Esc.
- **The states (the journey)**: every state of the component in front under its machine's section head, in path order, one list row each with its name and one-line note. The kept row wears the selection wash; only it shows its record sets as a toggle group (one, many, longest). Resting lights the row and never changes the stage. At the list's foot the journey's steps: Previous, "2 of 2, Failed save", Next.
- **The whole set**: a map that pans and zooms, on the house's canvas (dots, zoom tools, fit): every machine a group round its cards, every state a card holding its name, what a person does to reach it and its note at two lines, every move an edge under the cards (solid when the states file plays it, dashed when the agent only named it), moves into other machines included. An error state, a state nothing reaches and one nothing leaves carry a glyph after the name, the words in its tooltip and description. Fitted once to frame every card, then the person's. A press keeps; the kept card takes the chosen edge.
- **The difference**: Compare, a switch that stays on. On, it compares the kept state with the one before it on its path at once ("Compared with Saving"); a press on another state compares with that one instead. The stage keeps the kept state and rings what came in or changed, a dashed ring where something went, one line of words each. The compared row wears the change ring's edge.
- **The move**: the move into the kept state as a two-column timeline (clip name and facts; its bar on the move's scale under a ruler). Its head holds Play and Play at a quarter speed; the playhead is the ruler's slider, its line down the bars alone. It plays once as the state arrives, then rests at its start. Each bar drags its start and end (10 ms on the arrows); a clip's editor offers the ladder's lengths and the house curves and spring first, Advanced any length, delay, cubic-bezier and a spring's bounce, mass, stiffness and damping. A tuned clip says so on its row, before and after. Out-of-token clips are flagged once at the head. Ink bars. A state with no move says so in one sentence.
- **The remarks**: every stage element, state, variant and clip is a named comment target the panel's Comment mode pins; no Send, no Done.
- **Records**: a list state's sets are the set as it stood when the agent opened the surface, that time named under the stage ("Records as of …").

## States the surface holds
Reading/mounting (skeleton at the stage's size after the wait grace); failed to mount (error formula in the stage's place, Show details); one state, no machine; kept state with no move; the move reading or failed; playing, paused, scrubbed; comparing; a tuned clip; records as of a time; reduced motion (Play draws the end with a fade and says so); the hub's link lost (the stage keeps its drawing, marked stale, dimmed).

## Widths
- **390**: under the desk line (900px of the surface's own width) the room is the kit's bottom drawer, stops head, half, whole; the stage whole above it at the head stop; every control 44px to a finger.
- **680**: the same drawer; the stage at its width, never covered.
- **1440**: stage and room in view at once, the room beside the stage, the stage never under 600px.
- **2529**: the surface has about half the window; the stage takes its component's own width, the room beside it, no paper between.

## Untouched
The artifact panel's head, modes, Comments rail, pins, threads, delivery and To check; the canvas view; decision pages; the states file format; the agent's way of opening the surface (`edges`, `group`); the design tokens' existing values.

## Out of scope
Token dials; sashes; the component canvas's map mode; comparing two components' moves; the page's own "Clip kinds" switch; the agent's report format.

## His answers (spec.md, His answers)
A full move editor, presets first, advanced for any length, curve and spring; a tap keeps, and that is the look; the move plays once on arrival then rests at its start; one component in front, the others behind a switch; Compare is a switch that stays on; the journey opens at the asked state; records as they stood when the agent opened the surface, with that time named. Later, on the preview: the stage changes only on a press; resting never previews.

## Direction contract
direction: inherits DESIGN.md

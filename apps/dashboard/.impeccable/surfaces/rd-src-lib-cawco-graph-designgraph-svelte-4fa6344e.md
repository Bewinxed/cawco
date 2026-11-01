---
version: 1
slug: "rd-src-lib-cawco-graph-designgraph-svelte-4fa6344e"
primary_target: "apps/dashboard/src/lib/cawco/graph/DesignGraph.svelte"
related_targets: []
---

# Surface brief: the design graph

**Mode:** Operate. **Job:** a page inside the product; it keeps DESIGN.md's visual system and lays itself out for its task. **Verdict:** scrap (spec.md §5); designed again from the spec's tasks.

## Who arrives, and why
The owner of the fleet, from an agent's one-line ask ("Judge the Create routine form at Save failed"), for a look of a minute or two, many times a day: at a desk on a wide window with the agent's conversation beside the panel, sometimes on an iPad or a phone. He comes to see the asked state on the real component, step through its other states, compare two, see the whole set and its holes, play the move into a state and nudge its timing, try the list with one, many and the longest records, and leave remarks the agent reads back. Nothing to press when done.

## Parts (by job)
- **The stage**: the real component mounted live with its states file's records, at a width he picks (390, 680, 1440, its own), in the scheme he picks, reduced motion on ask. The largest thing; nothing of the surface's chrome stands over it. Opens on the kept state, its changed region in view, the state's name at its head.
- **The states**: every story of the states file, grouped by machine (the canvas spec's `group` to a heading), variants with their state (`group` to a story), failure marked by glyph and word. Rest previews (fine pointer), press keeps; a tap keeps.
- **Two ways of seeing**: the journey (one machine's path, step previous/next, "3 of 5, Saving") and the whole set (every state and move, the moves between machines too, Svelte Flow at a readable size that scrolls, never a zoom figure, holes marked "Nothing reaches it" / "Nothing leaves it"). One segmented switch; the journey opens, standing at the asked state.
- **The difference**: a Compare switch that stays on; the stage shows the compared state with the changed ring on what came in or changed, a dashed ring where something went, and one line of words per difference.
- **The move**: the move into the kept state as clips (what moves, how, how long with its token, which curve), a playhead to scrub, Play and a quarter-speed Play; it plays once as the state arrives, then rests at its start. Out-of-token clips flagged once at the head. Ink bars. A full editor: presets first (the ladder's lengths, the house curves, the house spring), advanced for any length, any cubic-bezier, a spring's bounce, mass, stiffness and damping. A tuned clip says so on its row, before and after.
- **The remarks**: every stage element, state, variant and clip is a named element the panel's Comment mode pins; no Send, no Done.
- **Several components**: one in front at its own width, the others behind a switch; the states and move name the one in front.
- **Records**: a list state offers One, Many (up to twenty) and Longest names as variants, from the set as it stood when the agent opened the surface, that time named.

## States the surface holds
Reading/mounting (skeleton after the wait grace); failed to mount (error formula, Show details); one state, no machine; kept state with no move; move playing, paused, scrubbed; a state previewed over the kept one; comparing; a tuned clip; records as of a time; reduced motion (Play draws the end with a fade and says so); the hub's link lost (the stage keeps its drawing, marked stale).

## Widths
- **390**: the stage whole above the room's head stop; the room is the kit's drawer (vaul) with head, half and whole stops; every control 44px to a finger.
- **680**: the same drawer; the stage at its width, never covered.
- **1440**: stage and room in view at once, the stage never under 600px.
- **2529**: the surface has about half the window; the stage takes its component's own width, the room beside it, no paper between.

## Untouched
The artifact panel's head, modes, Comments rail, pins, threads, delivery and To check; the canvas view; decision pages; the states file format; the agent's way of opening the surface (`edges`, `group`); the design tokens' existing values.

## Out of scope
Token dials; sashes; the component canvas's map mode; comparing two components' moves.

## His answers (spec.md, His answers)
Full move editor, presets first; a tap keeps; the move plays once on arrival then rests at its start; one component in front, the others behind a switch; Compare is a switch that stays on; the journey opens at the asked state; records as they stood when the agent opened the surface, with that time named.

## P0/P1 backlog (spec.md §4)
P0: the asked state's evidence out of view on open; no remark on a state, variant or move. P1: the dock can't be dismissed; touch targets under 44; fine-pointer targets under 24; the graph cut at its edges; hover washes over the component; the clip control an engineer's editor (superseded by his answer: a full editor, presets first); 1200px of paper at 2529.

## Direction contract
direction: inherits DESIGN.md

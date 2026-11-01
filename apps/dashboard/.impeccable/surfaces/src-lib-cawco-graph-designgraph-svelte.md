---
version: 1
slug: "src-lib-cawco-graph-designgraph-svelte"
primary_target: "src/lib/cawco/graph/DesignGraph.svelte"
related_targets: []
---

# Design graph

**Mode:** Operate. **Lives in:** the artifact panel's well (a component artifact), its own tab at `/artifact/<id>`, the phone's drawer. Replaces the component canvas's grid of frames.

## The job, and who arrives
The owner opens it when an agent shows him a component or screen it built. He wants, in order of how often:
1. See the real component at a state, whole, 1:1, nothing over it.
2. Walk its states in order (steps bar: the picked "Pill", lands only on states).
3. See how the states connect and jump to any (the map: Svelte Flow graph, or its Outline list).
4. Judge and tune a move's motion (the dock, only while the move into the kept state animates).
5. Try the data over real records (data dials, only on states that show records).
6. Remark: the panel's Comment mode; a pin carries the kept state.

## Structure (desk, 1440 to 2529)
- Steps row on top (pill, then the state's dials), the stage under it, the map as a column at the trailing side the stage gives room to, the dock on its own row at the foot. No control covers the component.
- Map: no title bar. Floating glass capsules: leading (only with more than one component) name menu, ‹ ›, "1 of 2"; trailing Fit, Outline, Close (Hide folds it back into the Map button at the same corner).
- Map resizes by its edges only: nothing at rest, a short coral line where the pointer or focus rests, the whole edge (tapered) while held.
- Hover a state previews it with diff washes; on a stage that holds two, the preview stands beside the kept state (pair).

## Phone (390)
The component fills the well. One glass bar at the foot, in the thumb's reach: the steps pill, Data (when the state has dials), Timing (when the move animates), Map. Map and Timing open as sheets over the stage's foot; the map opens as the Outline list, each machine's name sticking at the top while its states scroll.

## Widths
390 phone layout; 680 desk layout with the map column narrower (least 280); 1440 and up desk; 2529 pair.

## Picks honoured
resize = edges, edge only; token rule = snap (⌥ frees, chip dashed); compare = Original | Edited; after edit = replay once; change marks = washes; verdict = pins carry the state; clip controls = in the row; clip kinds = own colour per kind; machine names = the region's own header only; ultrawide = pair; data sliders = now; page flows = not now; slider = pill, lands on states; map head = one row (name, ‹ ›, count, Fit, Outline, Hide); click doesn't zoom; highlight glides between nodes.

## Open with him (decision page design-graph-room)
- Desk: steps and dock in rows of their own (built) or floating over the component.
- Phone: the bar at the foot (built) or at the top.

## Untouched
The panel's head, Comment mode, pins, the stage-host's grid (until he gives his go).

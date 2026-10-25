/**
 * Where a clip's controls open: the one seam (Projects spec §5.10, the
 * owner's note on "Where do a clip's controls open?": "popover? lol..").
 * No popover: the two answers are "in the row" (the controls unfold inside
 * the clip's own row, under its facts) and "in an inspector" (beside the
 * timeline, or in its place on a dock too narrow for both). ClipControls is
 * one component, and MoveDock mounts it wherever this says.
 *
 * Both stand behind the review switch in the canvas view's menu (Clip
 * controls: In the row / In an inspector) until he picks. His pick is a
 * one-line switch: `CLIP_CONTROLS_PICKED = "row"` (or `"inspector"`) here,
 * which takes the review switch away and holds every pane to it.
 */
import { store, stored } from "../../storage";

export type ClipControlsAt = "row" | "inspector";

/** His pick once he makes it; null while both stand behind the review switch. */
export const CLIP_CONTROLS_PICKED: ClipControlsAt | null = null;

/** Where they open before anyone flips the review switch. */
const CLIP_CONTROLS_FIRST: ClipControlsAt = "row";

/** The review switch's choices, in its order, with their words' keys (core words/design-graph.ts). */
export const CLIP_CONTROLS: readonly [
  ClipControlsAt,
  "inTheRow" | "inAnInspector",
][] = [
  ["row", "inTheRow"],
  ["inspector", "inAnInspector"],
];

const KEY = "cawco-clip-controls";

/** Where a clip's controls open now; `set` flips the review switch, kept in this browser. */
export function clipControlsAt(set?: ClipControlsAt): ClipControlsAt {
  if (CLIP_CONTROLS_PICKED) {
    return CLIP_CONTROLS_PICKED;
  }
  if (set) {
    store("local", KEY, set);
    return set;
  }
  const kept = stored("local", KEY);
  return kept === "row" || kept === "inspector" ? kept : CLIP_CONTROLS_FIRST;
}

import type { Snippet } from "svelte";

/**
 * What the design graph hands the artifact panel's head, so the panel has
 * one bar (HIG, Toolbars, Item groupings): the graph draws no head of its
 * own. The title, the component's name,
 * its menu the components under review. What acts on the drawing is no part
 * of the head: it floats over the stage's foot (PreviewTools), the mode, the
 * states' group (the map, the steps, the move) and the view.
 */
export interface GraphHead {
  /** The components under review, as a group of the title's menu; null where the ask names one. */
  components: Snippet | null;
  /** What the agent wrote of the kept state, the title's description. */
  line: string;
  /** What the drawing's view keeps out of sight, as entries of the head's More (Reduce motion). */
  more: Snippet;
  /** The component's name, the head's title. */
  title: string;
}

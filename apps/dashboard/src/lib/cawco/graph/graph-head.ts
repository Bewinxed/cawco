import type { Snippet } from "svelte";
import { HEAD_PRIORITY, type HeadItem } from "../side/head";

/** One control the graph hands the head, as the head draws it, in its one-button form, and as More's entries. */
interface HeadControl {
  bar: Snippet;
  compact?: Snippet;
  menu: Snippet;
}

/**
 * What the design graph hands the artifact panel's head, so the panel has
 * one bar (HIG, Toolbars, Item groupings): the graph draws no head of its
 * own. The title, the component's name,
 * its menu the components under review. What acts on the drawing is no part
 * of the head: it floats over the stage's foot (PreviewTools), the mode, the
 * states' group (the map, the steps, the move) and the view. A design with
 * directions hands the head its switch between them, in the centre, and
 * Pick, the one prominent action: which design he judges and what he
 * decides stand apart from the states and the view at the foot.
 */
export interface GraphHead {
  /** The components under review, as a group of the title's menu; null where the ask names one, or the canvas is one design's directions. */
  components: Snippet | null;
  /** A design's directions: the switch between them, folded to the one in front opening their menu, Pick at its foot. Null with none. */
  directions: HeadControl | null;
  /** What the agent wrote of the kept state, the title's description. */
  line: string;
  /** What the drawing's view keeps out of sight, as entries of the head's More (Reduce motion); null where it keeps nothing (an HTML design). */
  more: Snippet | null;
  /** Pick, the head's one prominent action, on a design with directions; null with none. */
  pick: HeadControl | null;
  /** The component's name, the head's title. */
  title: string;
}

/** The head's controls a design's directions add, by the head's priority rule: the switch in the centre, Pick prominent. */
export const directionItems = (head: GraphHead | null): HeadItem[] => [
  ...(head?.directions
    ? [
        {
          key: "directions",
          priority: HEAD_PRIORITY.directions,
          ...head.directions,
          group: true,
          place: "centre" as const,
        },
      ]
    : []),
  ...(head?.pick
    ? [
        {
          key: "pick",
          priority: HEAD_PRIORITY.pick,
          ...head.pick,
          place: "prominent" as const,
        },
      ]
    : []),
];

/**
 * The kit's Skeleton (Component Story Format 3, live components), mounted as
 * itself in the shapes the product waits in. The meta's args are every
 * story's; a story's own args are what it changes.
 */

import Skeleton from "./skeleton.svelte";
import SkeletonOfFrame from "./skeleton-of-frame.svelte";

export default {
  title: "Kit/Skeleton",
  component: Skeleton,
  args: {},
};

/** A title's line, waiting for the session's name. */
export const TitleLine = { args: { line: "title", width: "title" } };

/** A label's line, waiting for a count. */
export const LabelLine = { args: { line: "label", width: "label" } };

/** A row's mark, waiting for its glyph. */
export const Mark = { args: { cell: "mark", radius: "tile" } };

/** A card, waiting for its session. */
export const Card = {
  args: { height: "card", width: "title", radius: "card" },
};

/** A list of rows waiting, its bones taken from the real rows. */
export const RowsWaiting = {
  component: SkeletonOfFrame,
  args: { piece: "rows" },
};

/** A session's card waiting, its bones taken from the real card. */
export const CardWaiting = {
  component: SkeletonOfFrame,
  args: { piece: "card" },
};

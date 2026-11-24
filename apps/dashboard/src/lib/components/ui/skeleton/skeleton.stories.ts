/**
 * The kit's Skeleton (Component Story Format 3, live components), mounted as
 * itself in the shapes the product waits in. The meta's args are every
 * story's; a story's own args are what it changes.
 */
import BoneyardFrame from "./boneyard-frame.svelte";
import Skeleton from "./skeleton.svelte";

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

/**
 * A trial of boneyard: a list of rows waiting, its bones taken from the
 * real rows.
 */
export const BoneyardRows = {
  component: BoneyardFrame,
  args: { piece: "rows" },
};

/** A trial of boneyard: a session's card waiting, its bones taken from the real card. */
export const BoneyardCard = {
  component: BoneyardFrame,
  args: { piece: "card" },
};

/** The same card's bones under a shimmer instead of a pulse. */
export const BoneyardCardShimmer = {
  component: BoneyardFrame,
  args: { piece: "card", animate: "shimmer" },
};

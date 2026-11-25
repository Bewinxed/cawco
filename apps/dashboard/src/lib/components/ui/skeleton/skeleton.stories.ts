/**
 * The kit's skeletons (Component Story Format 3, live components): a piece
 * waiting for its data in the shape it last showed, its bones drawn in the
 * first frame with the light already crossing it, then handing over to the
 * piece as its data lands; and the hand-drawn bars the app still places by
 * hand. The meta's args are every story's; a story's own args are what it
 * changes.
 */

import Skeleton from "./skeleton.svelte";
import SkeletonOfLive from "./skeleton-of-live.svelte";

export default {
  title: "Kit/Skeleton",
  component: SkeletonOfLive,
  args: {},
};

const waiting = (piece: "rows" | "card" | "picture", rows = 3) => ({
  piece,
  rows,
  loading: true,
});

const lands = {
  play: async ({ update }: { update: (args: object) => Promise<void> }) => {
    await update({ loading: false });
  },
};

/** Three machines waiting for the fleet to answer. */
export const ListWaiting = { args: waiting("rows") };

/** The fleet answered: the three machines sharpen in where they waited. */
export const ListLanded = {
  args: waiting("rows"),
  from: "ListWaiting",
  ...lands,
};

/** A session's card waiting for its session. */
export const CardWaiting = { args: waiting("card") };

/** The session arrived: its card sharpens in over its outline. */
export const CardLanded = {
  args: waiting("card"),
  from: "CardWaiting",
  ...lands,
};

/** A file's picture card waiting for its preview. */
export const PictureWaiting = { args: waiting("picture") };

/** The preview arrived: the picture fills the patterned well. */
export const PictureLanded = {
  args: waiting("picture"),
  from: "PictureWaiting",
  ...lands,
};

/** The fleet had no machines last time, so its empty state waits. */
export const EmptyListWaiting = { args: waiting("rows", 0) };

/** Still no machines: the empty state sharpens in. */
export const EmptyListLanded = {
  args: waiting("rows", 0),
  from: "EmptyListWaiting",
  ...lands,
};

/** Twelve machines waiting, a list longer than the window. */
export const LongListWaiting = { args: waiting("rows", 12) };

/** The twelve land, row by row from the top. */
export const LongListLanded = {
  args: waiting("rows", 12),
  from: "LongListWaiting",
  ...lands,
};

/** A title's line, waiting for the session's name. */
export const TitleLine = {
  component: Skeleton,
  args: { line: "title", width: "title" },
};

/** A label's line, waiting for a count. */
export const LabelLine = {
  component: Skeleton,
  args: { line: "label", width: "label" },
};

/** A row's mark, waiting for its glyph. */
export const Mark = {
  component: Skeleton,
  args: { cell: "mark", radius: "tile" },
};

/** A card, waiting for its session. */
export const Card = {
  component: Skeleton,
  args: { height: "card", width: "title", radius: "card" },
};

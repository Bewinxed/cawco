/**
 * One comment that can't be drawn, in the real Comments rail (Component Story
 * Format 3, live components): its row fails as one line in its place
 * (RegionBoundary), the others standing (FailedComment).
 */
import FailedComment from "./FailedComment.svelte";
import { desk, phone } from "./windows";

export default {
  title: "Failure states/One comment",
  component: FailedComment,
};

/** One comment that can't be drawn fails as one line; the others stand. */
export const OneComment = desk();
/** One comment that can't be drawn, on a phone. */
export const OneCommentPhone = phone();

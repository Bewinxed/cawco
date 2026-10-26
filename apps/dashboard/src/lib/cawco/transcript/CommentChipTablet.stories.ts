/**
 * A comment exchange as a chip, at 680: a tablet's width, or the
 * conversation beside the panel. The thread stands beside its chip where
 * the row leaves room, else pulled back over it. His real threads.
 */
import CommentCallFixture from "./preview/CommentCallFixture.svelte";
import {
  fiveReplies,
  oneReply,
  resolved,
  writing,
} from "./preview/comment-chip-cases";

export default {
  title: "Comment chip/Tablet",
  component: CommentCallFixture,
  args: { ...oneReply, pointer: "fine", height: 720 },
  parameters: { viewport: 680 },
};

/** Folded: the call's line and the chip naming his comment. */
export const TabletFolded = { args: { height: 120 } };

/** The chip pressed: his comment, its reply, and Reply. */
export const TabletThread = { args: { shown: "thread" } };

/** A thread of five replies, scrolling inside. */
export const TabletThreadFiveReplies = {
  args: { ...fiveReplies, shown: "thread" },
};

/** A resolved thread, Reply to reopen. */
export const TabletThreadResolved = { args: { ...resolved, shown: "thread" } };

/** Writing a reply in the popover. */
export const TabletWriting = { args: { ...writing, shown: "typing" } };

/** Unfolded by its chevron: the exchange inline. */
export const TabletUnfolded = { args: { shown: "expanded", height: 420 } };

/** Open where it is, in focus. */
export const TabletOpenWhereItIs = { args: { shown: "open-where" } };

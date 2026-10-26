/**
 * A comment exchange in a conversation as a chip, like any tool call: the
 * owner's ask (10-25, 10-26), a design preview of how ToolGroup will draw a
 * comment_reply or comment_resolve row, drawn from the real parts
 * (preview/CommentCallFixture). Desk, 1440 wide, a mouse: resting on the
 * chip or pressing it opens the thread beside it. His real threads.
 */
import CommentCallFixture from "./preview/CommentCallFixture.svelte";
import {
  fiveReplies,
  oneReply,
  resolved,
  writing,
} from "./preview/comment-chip-cases";

export default {
  title: "Comment chip/Desk",
  component: CommentCallFixture,
  args: { ...oneReply, pointer: "fine", height: 720 },
  parameters: { viewport: 1440 },
};

/** Folded: the call's line, and under it the chip naming his comment, answered. */
export const DeskFolded = { args: { height: 120 } };

/** Folded, resolved: the chip's pill recessed, "· resolved". */
export const DeskFoldedResolved = { args: { ...resolved, height: 120 } };

/** The chip pressed or rested on: his comment and its one reply, with Reply. */
export const DeskThread = { args: { shown: "thread" } };

/** A thread of five replies: it scrolls inside, opened at the newest entry. */
export const DeskThreadFiveReplies = {
  args: { ...fiveReplies, shown: "thread" },
};

/** A resolved thread: "Resolved … ago" with Reopen, and Reply to reopen. */
export const DeskThreadResolved = { args: { ...resolved, shown: "thread" } };

/** Writing a reply in the popover: his next words in the field, Reply on. */
export const DeskWriting = { args: { ...writing, shown: "typing" } };

/** Unfolded by its chevron, as any tool call: the exchange up to this reply. */
export const DeskUnfolded = { args: { shown: "expanded", height: 360 } };

/** Unfolded, five replies: everything up to this call, the later words left to the thread. */
export const DeskUnfoldedFiveReplies = {
  args: { ...fiveReplies, shown: "expanded", height: 900 },
};

/** Open where it is: the way to the pin on its page, preview or canvas, in focus. */
export const DeskOpenWhereItIs = { args: { shown: "open-where" } };

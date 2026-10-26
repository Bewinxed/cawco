/**
 * A comment exchange as a chip on a phone, 390 wide, a finger: a tap opens
 * the thread in the house popover under the chip, the frame's width less
 * its insets. One of the two answers to where a phone's thread opens; the
 * other is the foot sheet. His real threads.
 */
import CommentCallFixture from "./preview/CommentCallFixture.svelte";
import {
  fiveReplies,
  oneReply,
  resolved,
  writing,
} from "./preview/comment-chip-cases";

export default {
  title: "Comment chip/Phone, under the chip",
  component: CommentCallFixture,
  args: { ...oneReply, pointer: "touch", anchor: "popover", height: 760 },
  parameters: { viewport: 390 },
};

/** Folded: the call's line and the chip naming his comment. */
export const PhoneFolded = { args: { height: 140 } };

/** Tapped: the thread under the chip, Reply at its foot. */
export const PhoneThread = { args: { shown: "thread" } };

/** A thread of five replies, scrolling inside the popover. */
export const PhoneThreadFiveReplies = {
  args: { ...fiveReplies, shown: "thread" },
};

/** A resolved thread under the chip. */
export const PhoneThreadResolved = { args: { ...resolved, shown: "thread" } };

/** Writing a reply under the chip. */
export const PhoneWriting = { args: { ...writing, shown: "typing" } };

/** Unfolded by its chevron: the exchange inline. */
export const PhoneUnfolded = { args: { shown: "expanded", height: 560 } };

/** Open where it is, in focus. */
export const PhoneOpenWhereItIs = { args: { shown: "open-where" } };

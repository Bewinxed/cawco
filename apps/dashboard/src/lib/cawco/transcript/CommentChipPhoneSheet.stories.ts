/**
 * A comment exchange as a chip on a phone, 390 wide, a finger: a tap opens
 * the thread as the foot sheet, the one a preview's thread takes on a phone
 * (PinFloat `sheet`). One of the two answers to where a phone's thread
 * opens; the other is under the chip. His real threads.
 */
import CommentCallFixture from "./preview/CommentCallFixture.svelte";
import {
  fiveReplies,
  oneReply,
  resolved,
  writing,
} from "./preview/comment-chip-cases";

export default {
  title: "Comment chip/Phone, foot sheet",
  component: CommentCallFixture,
  args: { ...oneReply, pointer: "touch", anchor: "sheet", height: 760 },
  parameters: { viewport: 390 },
};

/** Tapped: the thread as the foot sheet, Reply at its foot. */
export const SheetThread = { args: { shown: "thread" } };

/** A thread of five replies, scrolling inside the sheet. */
export const SheetThreadFiveReplies = {
  args: { ...fiveReplies, shown: "thread" },
};

/** A resolved thread in the sheet. */
export const SheetThreadResolved = { args: { ...resolved, shown: "thread" } };

/** Writing a reply in the sheet. */
export const SheetWriting = { args: { ...writing, shown: "typing" } };

/** Open where it is, in focus. */
export const SheetOpenWhereItIs = { args: { shown: "open-where" } };

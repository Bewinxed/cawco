/**
 * The comment chip's cases, each one of his real threads (comment-chip-pins)
 * at the call its row is: one reply, five, a resolved thread, and a reply
 * he is writing. A states file spreads a case into its story's args.
 */
import {
  AGENT,
  askedFor,
  awayNotes,
  opening,
  SHIPPED,
  SIZING,
} from "./comment-chip-pins";

const entry = (text: string | undefined): string => text ?? "";

/** Pin 2 on comment-sizing as it stood at its first reply: his comment, one answer. */
export const oneReply = {
  pin: { ...awayNotes, thread: awayNotes.thread.slice(0, 2) },
  artifact: SIZING,
  agentName: AGENT,
  call: "reply",
  reply: entry(awayNotes.thread[1]?.text),
} as const;

/** Pin 1 on comment-sizing: his comment and five entries after it; this row is the fourth. */
export const fiveReplies = {
  pin: opening,
  artifact: SIZING,
  agentName: AGENT,
  call: "reply",
  reply: entry(opening.thread[4]?.text),
} as const;

/** Pin 1 on the keep-or-roll-back page, resolved by the agent with no words. */
export const resolved = {
  pin: askedFor,
  artifact: SHIPPED,
  agentName: AGENT,
  call: "resolve",
  reply: "",
} as const;

/** Pin 2 on comment-sizing after its second answer, his next words in the reply. */
export const writing = {
  pin: { ...awayNotes, thread: awayNotes.thread.slice(0, 3) },
  artifact: SIZING,
  agentName: AGENT,
  call: "reply",
  reply: entry(awayNotes.thread[2]?.text),
  draft: entry(awayNotes.thread[3]?.text),
} as const;

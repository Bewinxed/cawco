/**
 * What a session waits on the person for, on the session's own screen: the
 * questions its delegation tree put to him (core session-questions.ts) and
 * the asks its tree's turns are parked on (a permission, a question, a
 * sign-in). Once he answers one it leaves the list, so every word here has
 * one subject, him, in the fleet's own Needs you words (common.ts
 * `needsYou`, helpers.ts `needs`).
 */
import { commonWords } from "./common";
import { needs } from "./helpers";

export const waitingWords = {
  /** The card's title. */
  title: commonWords.needsYou,
  /** The chip's word beside its figure ("3 need you"), which folds away where the row is narrow. */
  needYouWord: (n: number) => (n === 1 ? "needs you" : "need you"),
  /** The chip, for a screen reader: "3 need you". */
  triggerLabel: (n: number) => needs(n, "you"),
  /** Each kind, its glyph's name. */
  kind: {
    card: "Decision",
    judge: "Preview",
    pin: "Pin",
    permission: "Permission",
    question: "Question",
    connect: "Sign-in",
  },
  /** Where a delegate's question comes from. */
  fromSession: (title: string) => `From ${title}`,
  /** The list could not be read. */
  readFailed: (why: string) => `The list couldn't be read: ${why}.`,
};

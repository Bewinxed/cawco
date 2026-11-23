/**
 * The words the roster's own parts say (its tiles, their hand-over, an
 * empty card, and the way on from a refused hand-over): Who decides' by
 * default, or a surface's own where it draws the roster in other words
 * (the project's work path).
 */
import { configureWords } from "@cawco/core/words/configure";
import { decidesWords } from "@cawco/core/words/decides";

export type RosterWords = Pick<
  typeof decidesWords,
  | "fleetsChoice"
  | "followsFleetTip"
  | "giveBack"
  | "handOver"
  | "handOverKind"
  | "handTo"
  | "holdsNothing"
  | "ownTip"
> & {
  /** A refused hand-over's way on, beside the hub's words. */
  tryAgain: string;
};

export const ROSTER_WORDS: RosterWords = {
  ...decidesWords,
  tryAgain: configureWords.tryAgain,
};

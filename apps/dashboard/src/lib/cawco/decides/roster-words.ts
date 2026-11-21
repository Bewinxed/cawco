/**
 * The words the roster's own parts say (its tiles, their hand-over and an
 * empty card): Who decides' by default, or a surface's own where it draws
 * the roster in other words (the project's work path).
 */
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
>;

export const ROSTER_WORDS: RosterWords = decidesWords;

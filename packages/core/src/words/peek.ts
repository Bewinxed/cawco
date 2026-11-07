/**
 * The peek's words (the peek's surface brief): the sheet's name and what it
 * is, read out; its bar's Open, which dives into the session, and its Close,
 * each a bare symbol named in its tooltip; its context menu says the same.
 */
import { commonWords } from "./common";

export const peekWords = {
  /** The sheet's name, as a screen reader names it. */
  title: "Peek",
  /** What the sheet is, read out with its name. */
  description:
    "A quick look at one session without leaving Home. Open goes into it; closing keeps your place.",
  /** The maximize symbol: dives into the session. */
  open: commonWords.openSession,
  /** Puts the peek away. */
  close: "Close peek",
};

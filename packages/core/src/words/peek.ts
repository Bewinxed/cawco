/**
 * The peek's words (DESIGN.md, Peek): its bar's Open, which dives into the
 * session, and its Close, each a bare symbol named in its tooltip; its
 * context menu says the same.
 */
import { commonWords } from "./common";

export const peekWords = {
  /** The maximize symbol: dives into the session. */
  open: commonWords.openSession,
  /** Puts the peek away. */
  close: "Close peek",
};

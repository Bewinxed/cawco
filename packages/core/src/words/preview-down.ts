/** What the proxy's own page says when a preview is down. */

import type { PreviewDown } from "../preview/protocol";
import { previewWords } from "./preview";

/**
 * What a proxy's own page says of each hop that did not answer (DESIGN.md's
 * error formula: what happened, why, the way back); a preview of a workspace
 * no boundary runs is refused in its words too. `server` is a server nothing
 * starts again by itself: a port preview with no recorded command
 * (core `PreviewSource.serve`).
 */
export const DOWN_WORDS: Record<PreviewDown, string> = {
  server:
    "The page's server stopped answering. Start it again from its session, then reload.",
  machine:
    "The machine serving this preview isn't answering. Check that it is connected, then reload.",
  hub: "The hub didn't answer its own preview server. Reload to try again.",
  workspace:
    "That workspace isn't running, so its server can't be reached. Once a session there is back, reload.",
  reach:
    "The way to this preview's server didn't open. Reload to try again; if it fails again, open its session.",
  closed:
    "This preview is closed: its session shows something else now, or has ended. Open its session to show it again.",
  gone: previewWords.gonePage,
  error: previewWords.errorPage,
  crashed: previewWords.crashedPage,
};

/**
 * `server` for a server a stage runs (a sheet's, or a port preview's
 * recorded command; agent stage.ts): it is started again by itself, and a
 * reload starts it when its restarts are spent.
 */
export const SERVER_RESTARTS_WORDS =
  "The page's server stopped answering and is starting again. Reload in a moment.";

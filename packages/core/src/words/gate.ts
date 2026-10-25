/**
 * What the dashboard's gate (apps/dashboard hooks.server.ts, core
 * `crossSiteRefusal`) says of a request it refuses: its journal line and the
 * answer the page gets. Said by the dashboard's server only: the app draws
 * none of it, so it is not written into it (scripts/words-swift.ts).
 */
export const gateWords = {
  /** Opens every journal line of a refused request. */
  refusedLog: "[cawco] refused",
  /** A refused request's journal line: why (`a request from <origin>`, `a cross-site request`), then what it asked. */
  refused: (why: string, method: string, path: string) =>
    `[cawco] refused ${why} to ${method} ${path}`,
  /** The 403's body. */
  answer:
    "The dashboard answers its own pages only: this request came from another page.",
};

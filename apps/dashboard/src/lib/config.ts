/**
 * Dashboard configuration
 */

/**
 * The hub socket's reconnects (core backoff.ts): from 1 s, doubling to 30 s.
 * It never gives up (hub/socket.svelte.ts `scheduleReconnect`).
 */
export const WS_RECONNECTS = {
  firstMs: 1000,
  mostMs: 30_000,
  giveUp: {
    never:
      "a dashboard is a window left open: the hub comes back, and a page that stopped trying shows stale rows until reloaded",
  },
} as const;

/**
 * Blocks per older transcript page, read one page at a time as the reader
 * nears the first rows on screen. The newest page is the hub's own size
 * (`TRANSCRIPT_PAGE`, @cawco/core): small, so a tab paints from its first read.
 */
export const TRANSCRIPT_OLDER_PAGE = 250;

/**
 * Blocks in the newest page a cold load of `/session/<id>` is served with:
 * a first screen, which the server paints and the store takes as its newest
 * read (`keepServedPage`); the older pages are read as the reader nears the
 * first rows, as after any read. The hub's own size (60) carried the
 * owner's longest session as 854 KB of HTML, nearly all of it tool output
 * the closed rows never draw. Sized to fill the transcript of a 1440×900
 * desk (743px of rows over its foot) even when every block is a one-line
 * tool call (26px: 32 of them stand 832px); the scale fleet's long session,
 * its tail mixed, drew 40 blocks 2564px tall in that 856px area (probe-kit
 * live-perf, its nav leg's `rowsAbovePx`).
 */
export const FIRST_SCREEN_PAGE = 32;

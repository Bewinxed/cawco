/**
 * Dashboard configuration
 */

// WebSocket reconnection settings
export const WS_RECONNECT_MAX_ATTEMPTS = 10;
export const WS_RECONNECT_BASE_DELAY = 1000;
export const WS_RECONNECT_MAX_DELAY = 30_000;

/**
 * How many stored sessions per machine to ask `listSessions` for.
 *
 * `0` means all of them, and all of them is the right answer. The machine
 * reads its whole directory either way — it scans every transcript, sorts
 * them by age, and only THEN applies this — so a limit here never saved the
 * expensive part. It threw away the answer after paying for it, and the
 * sessions it discarded became unfindable: not listed anywhere, not
 * searchable, and not reachable by any link a reader could have produced.
 *
 * What arrives instead is metadata — an id, a folder, a modified time, a
 * first line. Measured on the machine this was written on: 898 transcripts
 * spanning 1.1GB on disk, and their catalogue is a few hundred kilobytes.
 * The transcripts themselves are still read one at a time, on demand, which
 * is the part that was ever worth being careful about.
 */
export const SESSION_CATALOG_LIMIT = 0;

/** How long a control call waits for the frame that answers its `requestId`. */
export const CONTROL_TIMEOUT_MS = 15_000;

/** Discarding a spin-off removes a git worktree, which is slower disk work. */
export const DISCARD_TIMEOUT_MS = 30_000;

/** `claude update` downloads a release, so it gets far longer than a control call. */
export const UPDATE_TIMEOUT_MS = 180_000;

/** Installing a tool fetches an installer and runs it — slower still. */
export const INSTALL_TIMEOUT_MS = 300_000;

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

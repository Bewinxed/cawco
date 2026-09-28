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

/** Discarding a side quest removes a git worktree, which is slower disk work. */
export const DISCARD_TIMEOUT_MS = 30_000;

/** `claude update` downloads a release, so it gets far longer than a control call. */
export const UPDATE_TIMEOUT_MS = 180_000;

/** Installing a workflow tool fetches an installer and runs it — slower still. */
export const INSTALL_TIMEOUT_MS = 300_000;

/** Up to this many entries, a stored transcript is mapped in one pass. */
export const TRANSCRIPT_CHUNK_THRESHOLD = 300;

/** Entries per chunk beyond that, mapped one chunk per macrotask. */
export const TRANSCRIPT_CHUNK_SIZE = 250;

/**
 * Entries in the first chunk of a *streamed* transcript. Small on purpose: it
 * is the tail, the part the reader lands on, and it paints as soon as it is
 * complete rather than after the chunk behind it has finished arriving.
 */
export const TRANSCRIPT_FIRST_CHUNK = 40;

/**
 * Entries a tail-first transcript read asks the agent for. The agent answers a
 * tail request by parsing only the newest window of the file (~4ms on a 97MB
 * transcript), so this is what stands between opening a session and its first
 * paint. Also the point past which a first-chunk cut stops looking.
 */
export const TRANSCRIPT_TAIL_CEILING = TRANSCRIPT_FIRST_CHUNK * 4;

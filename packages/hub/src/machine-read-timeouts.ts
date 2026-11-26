/** Reading one file off a machine: it answers about as fast as a disk does. */
// @limit recording: hub.machine-read-ms until 2026-12-10
export const READ_TIMEOUT_MS = 10_000;

/** A busy probe is polled in a loop before a restart, so it answers fast or not at all. */
// @limit recording: hub.machine-busy-read-ms until 2026-12-03
export const BUSY_TIMEOUT_MS = 5000;

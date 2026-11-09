/** Reading one file off a machine: it answers about as fast as a disk does. */
export const READ_TIMEOUT_MS = 10_000;

/** A busy probe is polled in a loop before a restart, so it answers fast or not at all. */
export const BUSY_TIMEOUT_MS = 5000;

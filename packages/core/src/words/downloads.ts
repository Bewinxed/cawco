/**
 * What a build's download says while it runs and when it stops: how far it
 * got, in megabytes of the signed size, never "timed out" (core
 * resumable-download.ts). The hub's log and the agent's say these lines, the
 * update state carries the progress they read from (`download`), and a
 * machine's Update cell says it in these words.
 *
 * Not mirrored into the native app yet (scripts/words-swift.ts names the
 * files it writes; this is none of them).
 */

/** Bytes as megabytes, whole: "45", "118". */
export const megabytes = (bytes: number): string =>
  String(Math.round(bytes / 1_000_000));

/** Bytes as megabytes to a tenth, for the log: "45.2". */
const tenths = (bytes: number): string => (bytes / 1_000_000).toFixed(1);

export const downloadWords = {
  /** How far a download is, in a machine's Update cell: "45 of 118 MB". */
  progress: (received: number, total: number) =>
    `${megabytes(received)} of ${megabytes(total)} MB`,
  /** The hub is still fetching the build from its release host: how far it is. */
  hubFetching: (received: number, total: number) =>
    `the hub is fetching it, ${megabytes(received)} of ${megabytes(total)} MB`,
  /** No byte came for the stall window: the one way a slow link is abandoned. */
  stalled: (seconds: number) => `no byte came for ${seconds} s`,
  /** The connection went before the body was whole. */
  cut: (code: string) => `the connection was cut (${code})`,
  /** An answer that is no body: the host is busy or failing. */
  answered: (status: number) => `the host answered ${status}`,
  /** What a machine's log calls its download of `archive` from its hub. */
  fromHub: (archive: string) => `${archive} from its hub`,
  /** A log line: one attempt stopped, and the next asks for the rest. */
  retrying: (
    what: string,
    received: number,
    total: number,
    why: string,
    attempt: number,
    waitMs: number
  ) =>
    `the download of ${what} stopped at ${tenths(received)} of ${tenths(total)} MB: ${why}; attempt ${attempt} asks for the rest, from byte ${received}, in ${Math.round(waitMs / 1000)} s`,
  /** A log line: the host sent the rest from where the last attempt stopped. */
  resumed: (what: string, from: number, total: number) =>
    `the download of ${what} goes on from byte ${from} of ${total}: the host sends only the rest (206)`,
  /** A log line: the host sent the whole file again, so the partial copy is dropped. */
  startedOver: (what: string, had: number, status: number) =>
    `the download of ${what} starts over: the host answered ${status} to the ask for the rest from byte ${had}, so the ${tenths(had)} MB already here were dropped`,
  /** The progress rule gave up: attempts in a row that brought no byte. */
  gaveUp: (
    what: string,
    received: number,
    total: number,
    attempts: number,
    why: string
  ) =>
    `The download of ${what} stopped at ${tenths(received)} of ${tenths(total)} MB and made no progress in ${attempts} attempts in a row (the last: ${why}). The ${tenths(received)} MB already here are kept, and the next attempt asks for the rest`,
  /** A machine's hub refused its ask of the build (its own fetch failed, 502; a build it does not offer, 404), with the hub's words when it gave any. */
  hubRefused: (status: number, said: string) =>
    `The hub could not supply the build: ${status}${said ? ` (${said})` : ""}`,
  /** The host refused the download outright. */
  refused: (what: string, status: number) =>
    `The download of ${what} answered ${status}`,
  /** More bytes than the signed size: never kept. */
  tooLong: (what: string) =>
    `The download of ${what} is longer than the signed size; what came was deleted`,
  /** The whole file failed the signed manifest's check: never kept. */
  mismatch: (what: string) =>
    `The downloaded ${what} does not match the signed manifest; it was deleted, and the next attempt downloads it again`,
};

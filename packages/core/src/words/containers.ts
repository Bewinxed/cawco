/**
 * What is said when a session ends and the containers its work started stop
 * with it (agent session-containers.ts): the session's own notice, and what
 * the session that delegated it reads (hub server.ts `tellContainersEnded`).
 * Sent to sessions only: the app draws none of it, so it is not written into
 * it (scripts/words-swift.ts).
 */
export const containerWords = {
  /** The phrase every notice of containers ended with their session carries. */
  ended: "CawCo stopped the containers it started",
  /** Opens what the delegating session reads. */
  yourDelegate: "Your delegate",
  /**
   * One session's containers as it ended: `removed` stopped and removed,
   * `kept` stopped and kept (each was given a name as it was started),
   * `failed` each with why it could not be ended. Each names a container
   * as `` `name` (image) ``.
   */
  stopped: (
    removed: readonly string[],
    kept: readonly string[],
    failed: readonly string[]
  ): string => {
    const parts = [
      removed.length > 0 ? `stopped and removed ${removed.join(", ")}` : "",
      kept.length > 0
        ? `stopped and kept ${kept.join(", ")}, as ${kept.length === 1 ? "it was" : "each was"} given a name when started`
        : "",
      failed.length > 0 ? `could not end ${failed.join(", ")}` : "",
    ].filter(Boolean);
    return `This session ended, so ${containerWords.ended}: ${parts.join("; ")}.`;
  },
  /** The phrase every notice of containers that will not stop with their session carries. */
  untrackedPhrase: "will not stop when this session ends",
  /** The runtime endpoints a session reaches with no door of CawCo's (`tcp://`, `ssh://`): what it starts there stays. */
  untracked: (endpoints: readonly string[]): string =>
    `Containers this session starts at ${endpoints.join(" or ")} ${containerWords.untrackedPhrase}: CawCo reaches a container runtime only through a unix socket. Stop them yourself once they are done.`,
  /** The doors to the runtimes did not open as the session launched (`why`): what it starts on any runtime stays. */
  doorsShut: (why: string): string =>
    `Containers this session starts ${containerWords.untrackedPhrase}: CawCo's doors to the container runtimes did not open (${why}). Stop them yourself once they are done.`,
  /** One session's container notice, as the session that delegated it reads it. */
  delegateEnded: (title: string, item: string, notice: string): string =>
    `${containerWords.yourDelegate} ${title} (work item ${item}) ended. ${notice}`,
};

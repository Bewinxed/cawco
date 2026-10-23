/**
 * What a session is told of what it started and leaks (agent leak-watch.ts),
 * and what the session that delegated it is told when it takes no word (hub
 * server.ts `tellLeak`). Sent to sessions only: the app draws none of it, so
 * it is not written into it (scripts/words-swift.ts).
 */
export const leakWords = {
  /** The phrase every notice of a process climbing in memory carries. */
  leaking: "is leaking memory",
  /** The phrase every notice of processes left behind carries. */
  leftBehind: "still running after the process that started",
  /** Opens what the delegating session reads of an ended delegate's leak. */
  yourDelegate: "Your delegate",
  /** A process climbing in memory, past the threshold. */
  memory: (
    command: string,
    pid: number,
    where: string,
    now: string,
    before: string,
    seconds: number,
    limit: string
  ) =>
    `A process this session started ${leakWords.leaking}, and CawCo leaves it running: \`${command}\` (pid ${pid}, ${where}) holds ${now} resident, up from ${before} a minute ago and higher at every reading ${seconds} s apart, past this machine's leak threshold of ${limit}. Find what keeps taking memory and fix it.`,
  /** Processes left running after what started them ended; `named` lists them, `more` counts the rest. */
  left: (count: number, named: string, more: number, where: string) => {
    const it = count === 1 ? "it" : "them";
    return `${count === 1 ? "A process" : `${count} processes`} this session started ${count === 1 ? "is" : "are"} ${leakWords.leftBehind} ${it} ended, and CawCo leaves ${it} running: ${named}${more > 0 ? ` and ${more} more` : ""}, ${where}. End ${it} if nothing needs ${it}, and fix what started ${it} so it does not leave ${it} behind.`;
  },
  /** An ended delegate's leak, told to the session that delegated it. */
  delegateLeft: (
    title: string,
    item: string,
    state: string,
    workspace: string,
    notice: string
  ) =>
    `${leakWords.yourDelegate} ${title} (work item ${item}, ${state}) left this behind in workspace ${workspace}, and it takes no message now: ${notice}`,
};

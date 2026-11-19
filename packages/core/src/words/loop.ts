/**
 * A process's own loop, as its log says it (loop-watch.ts, and
 * loop-watch-worker.ts on a thread of its own): a stall once it ended, one
 * that lasts while it lasts, and the end of a process whose loop never came
 * back. `who` is whose loop: "agent", "hub".
 */
export const loopWords = {
  /** A stall the loop's own tick found, once it ended. */
  heldEnded: (who: string, ms: number) =>
    `[loop] the ${who}'s loop was held ${Math.round(ms)} ms`,
  /** A stall said from the watch's own thread while it lasts. */
  heldNow: (who: string, seconds: number) =>
    `the ${who}'s loop has been held ${seconds} s and still is`,
  /** A loop that runs its timers and takes in nothing, said while it lasts. */
  deafNow: (who: string, seconds: number) =>
    `the ${who}'s loop has taken in nothing for ${seconds} s (no socket, file or signal) while its timers run`,
  /** The end of a stall said while it lasted. */
  answersAgain: (who: string, seconds: number) =>
    `[loop] the ${who}'s loop answers again after ${seconds} s`,
  /** The main thread on the CPU, with its share of a core since the last look when known. */
  onCpu: (share?: number) =>
    `its main thread is on the CPU${share === undefined ? "" : ` (${share}% of a core since the last look)`}`,
  /**
   * The main thread in uninterruptible sleep (`D`): a disk's answer, or a
   * kernel lock (obelisk's of 2026-10-25 was the NVIDIA driver's, taken in
   * memory reclaim), as where it sleeps and its system call say.
   */
  uninterruptible: (where: string) =>
    `its main thread sleeps uninterruptibly in the kernel${where ? ` (${where})` : ""}`,
  /** The system call the main thread is in, and the file its first argument names. */
  inSyscall: (name: string, file: string) =>
    `in the system call ${name}${file ? ` (${file})` : ""}`,
  /** The main thread blocked in the kernel outside any system call: a page fault. */
  noSyscall: () => "outside any system call (a page fault, or memory reclaim)",
  /** A hold under the watch's own saying, said once it ended, with what the looks during it read. */
  heldSeen: (who: string, seconds: number) =>
    `[loop] the ${who}'s loop was held about ${seconds} s; its main thread, as the watch's looks found it`,
  /** The main thread asleep in the kernel. */
  asleep: (state: string, where: string, share?: number) =>
    `its main thread sleeps in the kernel (state ${state}${where ? `, ${where}` : ""}${share === undefined ? "" : `, ${share}% of a core since the last look`})`,
  /** The marked section entered last, and whether it was left. */
  lastSection: (name: string, left: boolean) =>
    `the last marked section entered: ${name}${left ? "" : " (not left)"}`,
  /** The work the loop started last, as it named it. */
  doing: (name: string) => `the work it started last: ${name}`,
  /** The named work the looks during a hold read, each with how many of the looks found it. */
  doingSeen: (seen: string) =>
    `the work it started last, as the looks found it: ${seen}`,
  /** The named work (`doing`) whose synchronous run was longest since the tick before a stall. */
  longestWork: (name: string, ms: number) =>
    `the longest named work since the tick before: ${name}, ${Math.round(ms)} ms`,
  /**
   * The loop's minute: its delay's median and 99th percentile, the CPU the
   * main thread and the whole process took as a share of one core, its
   * memory, and the names that held it longest (inclusive: a section inside
   * a request counts under both).
   */
  minute: (vitals: {
    heapMb: number;
    mainCpu: number | undefined;
    p50Ms: number;
    p99Ms: number;
    processCpu: number;
    rssMb: number;
    top: string;
    who: string;
  }) =>
    `[loop] the ${vitals.who}'s minute: delay p50 ${vitals.p50Ms} ms, p99 ${vitals.p99Ms} ms; CPU ${vitals.mainCpu === undefined ? "" : `main thread ${vitals.mainCpu}%, `}process ${vitals.processCpu}% of a core; heap ${vitals.heapMb} MB, resident ${vitals.rssMb} MB; held longest by ${vitals.top || "no named work"}`,
  /** A CPU profile of the main thread begun, and why. */
  profiling: (who: string, seconds: number, why: string) =>
    `[loop] profiling the ${who}'s main thread for ${seconds} s (${why})`,
  /** A CPU profile written, and where. */
  profiled: (who: string, path: string) =>
    `[loop] the ${who}'s CPU profile is at ${path}: open it in Chrome DevTools' Performance panel, or speedscope.app`,
  /** Why a process profiled itself: the holds its tick said within the last minute passed their budget. */
  holdsPastBudget: (ms: number) =>
    `its loop was held ${ms} ms within the last minute, in holds its tick said`,
  /**
   * A loop held past its bound, its process ended from the watch's own
   * thread so its supervisor starts it again (systemd's `Restart=`,
   * launchd's `KeepAlive`): said once, as the last line it writes.
   */
  ending: (who: string, seconds: number) =>
    `[loop] the ${who}'s loop has been held ${seconds} s, past its bound: the ${who} is ended now (SIGKILL), and its service starts it again`,
  /** What the process before this one kept as its watch ended it, said once as this one starts. */
  endedBefore: (who: string, at: string, seconds: number, read: string) =>
    `[loop] the ${who} before this one was ended by its watch at ${at}: its loop had been held ${seconds} s; ${read}`,
};

/**
 * The agent's own loop, as its log says it (agent loop-watch.ts, and
 * loop-watch-worker.ts on a thread of its own): a stall once it ended, and
 * one that lasts while it lasts.
 */
export const loopWords = {
  /** A stall the loop's own tick found, once it ended. */
  heldEnded: (ms: number) =>
    `[loop] the agent's loop was held ${Math.round(ms)} ms`,
  /** A stall said from the watch's own thread while it lasts. */
  heldNow: (seconds: number) =>
    `the agent's loop has been held ${seconds} s and still is`,
  /** A loop that runs its timers and takes in nothing, said while it lasts. */
  deafNow: (seconds: number) =>
    `the agent's loop has taken in nothing for ${seconds} s (no socket, file or signal) while its timers run`,
  /** The end of a stall said while it lasted. */
  answersAgain: (seconds: number) =>
    `[loop] the agent's loop answers again after ${seconds} s`,
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
  heldSeen: (seconds: number) =>
    `[loop] the agent's loop was held about ${seconds} s; its main thread, as the watch's looks found it`,
  /** The main thread asleep in the kernel. */
  asleep: (state: string, where: string, share?: number) =>
    `its main thread sleeps in the kernel (state ${state}${where ? `, ${where}` : ""}${share === undefined ? "" : `, ${share}% of a core since the last look`})`,
  /** The marked section entered last, and whether it was left. */
  lastSection: (name: string, left: boolean) =>
    `the last marked section entered: ${name}${left ? "" : " (not left)"}`,
};

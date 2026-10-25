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
  /** The main thread in uninterruptible sleep. */
  onDisk: (where: string) =>
    `its main thread waits on the disk${where ? ` (${where})` : ""}`,
  /** The main thread asleep in the kernel. */
  asleep: (state: string, where: string, share?: number) =>
    `its main thread sleeps in the kernel (state ${state}${where ? `, ${where}` : ""}${share === undefined ? "" : `, ${share}% of a core since the last look`})`,
  /** The marked section entered last, and whether it was left. */
  lastSection: (name: string, left: boolean) =>
    `the last marked section entered: ${name}${left ? "" : " (not left)"}`,
};

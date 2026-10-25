/**
 * What the agent's loop and its watch on a thread of its own share
 * (loop-watch.ts `startWatchdog`, loop-watch-worker.ts).
 */

/** What the loop posts its watch. */
export type WatchdogMessage =
  | { kind: "start"; beat: SharedArrayBuffer; port: number }
  | { kind: "section"; id: number; name: string }
  | { kind: "state"; flying: string; phase: string };

/** The shared memory's slots: the loop's beat (ms epoch), the last marked section's id (-1 for none), and 1 once it was left. */
export const BEAT = 0;
export const SECTION = 1;
export const LEFT = 2;

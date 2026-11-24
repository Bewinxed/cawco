/**
 * The words of turning Caw off while what his conversation started still
 * runs: the tray hung from his switch (the dashboard's StopTray, its job
 * in stop-work.svelte.ts), each row checked to stop, one confirm. Unchecked
 * rows say nothing of their own: the empty box says they keep running.
 */
import type { EndWords } from "./project-ends";

export const cawOffWords = {
  /** What still runs, unread after a reload, the hub refusing: what came of it (`hubRefusal`). */
  stillRunningUnreadThen:
    "so what still runs could not be read. Reopen it to try again.",
  /** The section's title while it asks. */
  ask: (project: string) => `Turn Caw off for ${project || "this project"}?`,
  /** Its title once he is off. */
  off: (project: string) => `Caw is off for ${project || "this project"}`,
  /** What turning him off means, under the title while it asks and stops. */
  waits: "Triggers wait on their task, routine or page until Caw wakes.",
  /** The box over the rows that checks or clears them all. */
  all: (count: number) => `All ${count} running`,
  /** The list's name, for a screen reader. */
  list: "Sessions Caw started",
  /** A row's box, for a screen reader. */
  stopOne: (title: string) => `Stop ${title}`,
  /** A row whose machine is away, unchecked. */
  away: (machine: string) => `${machine} is away`,
  /** The confirm with rows checked. */
  stop: (count: number) => `Stop ${count} and turn off`,
  /** The confirm with none checked, or nothing listed. */
  turnOff: "Turn Caw off",
  /** The confirm while he is turned off with nothing left to stop. */
  turningOff: "Turning Caw off…",
  /** The confirm while the stops land. */
  stopping: (count: number) => `Stopping ${count}…`,
  /** The confirm's word once he is off, as Forget's ends on "Forgotten". */
  isOff: "Caw is off",
  /** Puts the section away while the stops land; they go on. */
  stopWaiting: "Stop waiting",
  /** Puts the section away after a failure. */
  close: "Close",
  /**
   * The line once he is off: what stopped, and what stops when its machine
   * is back (`machine` null: more than one machine).
   */
  done: (stopped: number, away: number, machine: string | null) =>
    [
      stopped > 0 ? `Stopped ${stopped}.` : "",
      away > 0
        ? `${away} ${away === 1 ? "stops" : "stop"} when ${machine === null ? "their machines are" : `${machine} is`} back.`
        : "",
    ]
      .filter((part) => part !== "")
      .join(" "),
  /** Put away while the stops land: the line where it parked. */
  parked: (project: string, stopped: number, total: number) =>
    `Turning Caw off for ${project || "this project"}: stopped ${stopped} of ${total}…`,
  /** Parked, a failure: what was left. */
  partway: (stopped: number, total: number) =>
    `Stopped ${stopped} of ${total}; Caw is off.`,
};

/**
 * Turning Caw off for `project` as the stop tray says every end: its
 * question, then that he is off; while it asks and stops, what asleep
 * means, and once he is off what stopped (`stopped`, said by the tray).
 * He is never asked twice, so his armed press reads as his first.
 */
export const cawOffEndWords = (project: string): EndWords => ({
  title: cawOffWords.ask(project),
  titleDone: cawOffWords.off(project),
  plain: cawOffWords.turnOff,
  stop: cawOffWords.stop,
  armed: cawOffWords.stop,
  ending: cawOffWords.turningOff,
  keep: cawOffWords.stopWaiting,
  ended: cawOffWords.isOff,
  line: (step, _n, _cut, stopped) =>
    step === "done" ? stopped : cawOffWords.waits,
  parked: (stopped, total) => cawOffWords.parked(project, stopped, total),
  partway: cawOffWords.partway,
});

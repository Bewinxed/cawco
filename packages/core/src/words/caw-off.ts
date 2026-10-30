/**
 * The words of turning Caw off while what his conversation started still
 * runs: the section under his switch (the dashboard's StopTrayPick, its job
 * in stop-work.svelte.ts), each row checked to stop, one confirm. Unchecked
 * rows say nothing of their own: the empty box says they keep running.
 */
export const cawOffWords = {
  /** The section's title while it asks. */
  ask: (project: string) => `Turn Caw off for ${project || "this project"}?`,
  /** Its title once he is off. */
  off: (project: string) => `Caw is off for ${project || "this project"}`,
  /** The box over the rows that checks or clears them all. */
  all: (count: number) => `All ${count} running`,
  /** The list's name, for a screen reader. */
  list: "Sessions Caw started",
  /** A row's box, for a screen reader. */
  stopOne: (title: string) => `Stop ${title}`,
  /** Before an attempt's status on its second line. */
  task: "Task",
  /** A row whose machine is away, checked: its stop waits for the machine. */
  stopsWhenBack: (machine: string) => `Stops when ${machine} is back`,
  /** A row whose machine is away, unchecked. */
  away: (machine: string) => `${machine} is away`,
  /** A row whose stop failed. */
  couldntStop: "Couldn't stop",
  /** The confirm with rows checked. */
  stop: (count: number) => `Stop ${count} and turn off`,
  /** The confirm with none checked, or nothing listed. */
  turnOff: "Turn Caw off",
  /** The confirm while the stops land. */
  stopping: (count: number) => `Stopping ${count}…`,
  /** Puts the ask away; Caw stays on. */
  cancel: "Cancel",
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

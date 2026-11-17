/** What a machine's pause says: its end's clock and what it stopped. */

/**
 * A machine pause's end as the fleet says it (hub machine-pause.ts): the
 * local clock, "00:57", and the weekday too when it is not today ("Fri 08:00").
 */
export function pauseClock(at: number, now = Date.now()): string {
  const end = new Date(at);
  const time = end.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return end.toDateString() === new Date(now).toDateString()
    ? time
    : `${end.toLocaleDateString("en-GB", { weekday: "short" })} ${time}`;
}

export const machinePauseWords = {
  /**
   * What a pause stopped when the hub kept its counts and could not read
   * them (hub migration 0424): said in place of {@link stoppedWords}, after
   * a comma, until the pause ends.
   */
  stoppedUncounted: "stopped running work it no longer counts",
} as const;

/**
 * "stopped 1 running command", "stopped 2 running commands": the commands
 * a pause stopped; undefined when it stopped none.
 */
export function stoppedWords(stopped: number): string | undefined {
  return stopped > 0
    ? `stopped ${stopped} running ${stopped === 1 ? "command" : "commands"}`
    : undefined;
}

/** What a machine's pause says: its end's clock and what it stopped. */

import type { RunKind, StoppedCommands } from "../protocol";

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

const COMMAND_NOUNS: Record<RunKind, [string, string]> = {
  "merge check": ["merge check", "merge checks"],
  command: ["command", "commands"],
};

/**
 * "stopped 1 running merge check", "stopped 2 running merge checks and 1
 * running command"; undefined when the pause stopped nothing.
 */
export function stoppedWords(stopped: StoppedCommands): string | undefined {
  const parts = (Object.keys(COMMAND_NOUNS) as RunKind[]).flatMap((kind) => {
    const count = stopped[kind] ?? 0;
    const [one, many] = COMMAND_NOUNS[kind];
    return count > 0 ? [`${count} running ${count === 1 ? one : many}`] : [];
  });
  if (parts.length === 0) {
    return;
  }
  const last = parts.pop();
  return `stopped ${parts.length > 0 ? `${parts.join(", ")} and ${last}` : last}`;
}

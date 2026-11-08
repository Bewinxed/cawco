/** What a machine's fault or silence says. */

import type { MachineFault } from "../machine-names";
import { secondsOf } from "../time";

const MACHINE_FAULT_WORDS: Record<MachineFault, [string, string]> = {
  offline: ["isn't connected.", "Try again once it's back."],
  silent: ["didn't answer in time.", "Try again in a moment."],
  unknown: ["isn't on this hub any more.", "Pick another machine."],
};

/**
 * Why a machine could not take a request, as the person reads it (DESIGN.md's
 * error formula): the machine by its name, never its id; what to do. `name`
 * is its {@link machineCalled}, undefined when the hub doesn't know the machine.
 * `next: false`, the cause alone, for a reader that says its own next step
 * (a preview pane that tries again by itself).
 */
export function machineFaultWords(
  name: string | undefined,
  fault: MachineFault,
  { next = true }: { next?: boolean } = {}
): string {
  const [cause, step] = MACHINE_FAULT_WORDS[fault];
  return `${name ?? "That machine"} ${cause}${next ? ` ${step}` : ""}`;
}

/**
 * One ask a machine left unanswered, as the hub's log and an error that
 * names the read before it say it: "<machine> did not answer within 10 s",
 * or, its link gone, "<machine> is not connected". `after` is how long the
 * ask waited, in ms; undefined when the link was gone.
 */
export function machineSilenceWords(
  name: string,
  after: number | undefined
): string {
  return after === undefined
    ? `${name} is not connected`
    : `${name} did not answer within ${secondsOf(after)} s`;
}

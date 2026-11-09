/**
 * Shapes the hub's sections read of each other, away from any one section's file.
 */
import type { HarnessKind } from "@cawco/core/harness/kinds";

/**
 * A step or a read that could not finish because its machine went away. Not
 * a failure: a continuation waits, and the machine's next register carries it
 * on; a route answers it as the machine away (`awayStatus`: 503 naming it),
 * which a reader reads again once the machine is back.
 */
export class MachineAway extends Error {
  readonly machineId: string;
  /** `words`: the hub's `machineFault`, the machine by its name. */
  constructor(machineId: string, words: string) {
    super(words);
    this.name = "MachineAway";
    this.machineId = machineId;
  }
}

/**
 * Where a conversation lives, resolved from its id alone. `sessionId` is the
 * key the machine stores the transcript under — the SDK's, which for a session
 * the hub spawned is not the instance id the reader addressed it by.
 */
export interface SessionLocation {
  cwd: string;
  harness: HarnessKind;
  id: string;
  machineId: string;
  sessionId: string;
}

/**
 * What locating a conversation came to: found, on no machine (every machine
 * asked answered so), or not known because `machines` did not answer.
 */
export type Located =
  | { kind: "found"; at: SessionLocation }
  /** Kept on a machine that is away, by that machine's last catalog. */
  | { kind: "away"; machineId: string }
  | { kind: "nowhere" }
  | { kind: "unanswered"; machines: string[] };

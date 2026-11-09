/**
 * What a machine's `register` does once its key is proven, as one ordered
 * list of named steps: the order is the contract (each step's comment says
 * what it waits behind, a thing fixed by incident more than once).
 */

import type { AgentFrame } from "@cawco/core/agent-frame";
import type { Envelope, SessionCustody } from "@cawco/core/protocol";
import type { DbShape } from "../db";
import type { AuthSocket } from "../hub-shapes";

type Settled = ReturnType<DbShape["settleInstances"]>;
type Row = ReturnType<DbShape["ownedByIds"]>[number];

export interface MachineReturn {
  agentFrame: AgentFrame;
  custody: SessionCustody;
  cutoff: number;
  heldIds: Set<string>;
  heldOpencode: boolean;
  heldRows: Set<string>;
  message: Envelope;
  outlived: (orphan: Settled[number]) => boolean;
  returningRemoved: Set<string>;
  revivable: { row: Settled[number]["row"]; resumes: boolean }[];
  settled: Settled;
  toEnd: Row[];
  ws: AuthSocket & { remoteAddress: string };
}

export type MachineReturnStep = (ret: MachineReturn) => void | Promise<void>;

/**
 * Runs a machine's return through `steps` in their order. A step that does
 * not wait is not awaited, so nothing else runs between it and the next.
 */
export const runMachineReturn = async (
  steps: readonly MachineReturnStep[],
  ret: MachineReturn
): Promise<void> => {
  for (const step of steps) {
    const waits = step(ret);
    if (waits) {
      await waits;
    }
  }
};

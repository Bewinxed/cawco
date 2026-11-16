/**
 * What the hub holds in memory about each machine a register rebuilds ({@link createMachineRuntime}).
 */

import type { BinaryUpdatePhaseDropped } from "@cawco/core/agent-reads";
import type { BinaryUpdateState } from "@cawco/core/binary-updates";
import type { BuildInfo, SessionCustody } from "@cawco/core/protocol";

/** `machineName`: a machine as a sentence names it, for the log. */
export const createMachineRuntime = (
  machineName: (machineId: string) => string
) => {
  const machineCustody = new Map<string, SessionCustody>();

  /** Each connected machine's binary update state, as its daemon last said. */
  const binaryUpdateStates = new Map<string, BinaryUpdateState>();

  /**
   * Each connected machine's agent's hub ↔ agent contract, as its last
   * register said ({@link BuildInfo.protocol}); none for one that said none.
   */
  const agentProtocols = new Map<string, BuildInfo["protocol"]>();

  /** The binary update phase each machine last said that this hub does not know, as the log said it. */
  const droppedPhases = new Map<string, string>();

  /**
   * What a machine said of its binary update, read (core `binaryUpdateOf`,
   * once per frame or state it sends): a phase this hub does not know,
   * whose state was dropped, said in the log once, until the machine says
   * another phase or one this hub knows.
   */
  const heardBinaryUpdate = (
    machineId: string,
    read: {
      dropped: BinaryUpdatePhaseDropped | undefined;
      state: BinaryUpdateState | undefined;
    }
  ): void => {
    if (read.state) {
      droppedPhases.delete(machineId);
    }
    if (!read.dropped) {
      return;
    }
    const phase =
      read.dropped.phase === undefined
        ? "none"
        : JSON.stringify(read.dropped.phase);
    if (droppedPhases.get(machineId) === phase) {
      return;
    }
    droppedPhases.set(machineId, phase);
    console.warn(
      `[updates] ${machineName(machineId)} (${machineId}) said its binary update's phase is ${phase}, which this hub does not know: the state it carried is dropped, and the hub keeps the one it had`
    );
  };

  /** Forgets a machine a joining machine replaced: its update phase, what it speaks, its custody report. */
  const forget = (machineId: string): void => {
    binaryUpdateStates.delete(machineId);
    droppedPhases.delete(machineId);
    agentProtocols.delete(machineId);
    machineCustody.delete(machineId);
  };

  return {
    forget,
    heardBinaryUpdate,
    machineCustody,
    binaryUpdateStates,
    agentProtocols,
  };
};

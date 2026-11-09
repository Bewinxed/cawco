/**
 * What the hub holds in memory about each machine a register rebuilds ({@link createMachineRuntime}).
 */
import type { BinaryUpdateState } from "@cawco/core/binary-updates";
import type { BuildInfo, SessionCustody } from "@cawco/core/protocol";

export const createMachineRuntime = () => {
  const machineCustody = new Map<string, SessionCustody>();

  /** Each connected machine's binary update state, as its daemon last said. */
  const binaryUpdateStates = new Map<string, BinaryUpdateState>();

  /**
   * Each connected machine's agent's hub ↔ agent contract, as its last
   * register said ({@link BuildInfo.protocol}); none for one that said none.
   */
  const agentProtocols = new Map<string, BuildInfo["protocol"]>();

  /** Forgets a machine a joining machine replaced: its update phase, what it speaks, its custody report. */
  const forget = (machineId: string): void => {
    binaryUpdateStates.delete(machineId);
    agentProtocols.delete(machineId);
    machineCustody.delete(machineId);
  };

  return {
    forget,
    machineCustody,
    binaryUpdateStates,
    agentProtocols,
  };
};

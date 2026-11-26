/**
 * What the hub holds in memory about each machine a register rebuilds
 * (`make`), as one of its services: built once, from its layer, by
 * `createServer` (hub-layer.ts).
 */

import type { BinaryUpdatePhaseDropped } from "@cawco/core/agent-reads";
import type { BinaryUpdateState } from "@cawco/core/binary-updates";
import type { BuildInfo, SessionCustody } from "@cawco/core/protocol";
import { Context, Effect, Layer } from "effect";
import { MachineWords } from "./machine-words";
import { WatchedMap } from "./watched-map";

/** `machineName`: a machine as a sentence names it, for the log. */
const make = (machineName: (machineId: string) => string) => {
  /** Each machine's custody report: the board lays its status as it moves. */
  const machineCustody = new WatchedMap<string, SessionCustody>();

  /** Each connected machine's binary update state, as its daemon last said. */
  const binaryUpdateStates = new WatchedMap<string, BinaryUpdateState>();

  /**
   * Each connected machine's agent's hub ↔ agent contract, as its last
   * register said ({@link BuildInfo.protocol}); none for one that said none.
   */
  const agentProtocols = new WatchedMap<string, BuildInfo["protocol"]>();

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

export class MachineRuntime extends Context.Service<
  MachineRuntime,
  ReturnType<typeof make>
>()("MachineRuntime") {}

export const MachineRuntimeLayer = Layer.effect(MachineRuntime)(
  Effect.gen(function* () {
    return make((yield* MachineWords).machineName);
  })
);

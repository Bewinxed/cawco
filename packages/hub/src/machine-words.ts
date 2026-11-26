/**
 * A machine in the hub's sentences: its name, why it could not take a
 * request, and what a read it left unanswered throws. Each reads the
 * machines the hub knows (`Db`) when it is called; one of the hub's
 * services (hub-layer.ts).
 */
import { type MachineFault, machineCalled } from "@cawco/core/machine-names";
import {
  machineFaultWords,
  machineSilenceWords,
} from "@cawco/core/words/machine-names";
import { Context, Effect, Layer } from "effect";
import { Db, type DbShape } from "./db";
import { MachineAway } from "./hub-shapes";
import {
  MachineProblem,
  silentProblem,
  type Unanswered,
} from "./machine-answers";

const make = (db: DbShape) => {
  /** A machine as a sentence names it (core `machineCalled`), never by its id. */
  const machineName = (machineId: string): string =>
    machineCalled(machineId, db.namedMachines());
  /**
   * Why a machine could not take a request, as a client reads it (core
   * `machineFaultWords`): by its name, and a machine not on this hub as
   * `unknown` whatever the fault. `next: false`, the cause alone (core
   * `machineFaultWords`).
   */
  const machineFault = (
    machineId: string,
    fault: MachineFault,
    words: { next?: boolean } = {}
  ): string => {
    const agents = db.namedMachines();
    return agents.some((each) => each.machineId === machineId)
      ? machineFaultWords(machineCalled(machineId, agents), fault, words)
      : machineFaultWords(undefined, "unknown", words);
  };
  /** `machineId` away, as a step or a read that cannot finish without it throws it. */
  const awayError = (machineId: string): MachineAway =>
    new MachineAway(machineId, machineFault(machineId, "offline"));
  /** {@link machineFault} for an ask the machine did not answer: not connected, or silent. */
  const unansweredFault = (machineId: string, answer: Unanswered): string =>
    machineFault(machineId, answer.reason === "dead" ? "offline" : "silent");
  /** "<machine> did not answer within N s" (or is not connected), for an ask it left unanswered. */
  const silentWords = (machineId: string, answer: Unanswered): string =>
    machineSilenceWords(
      machineName(machineId),
      answer.reason === "dead" ? undefined : answer.after
    );
  /**
   * A read its machine left unanswered, as the read throws it: not connected
   * (or away past its deadline, machine-calls.ts `asRead`) is
   * {@link awayError}, which a route answers 503 naming the machine and a
   * continuation waits out; silent, 504 machine-silent, `what` (the read, in
   * words) followed by {@link silentWords}.
   */
  const unansweredError = (
    machineId: string,
    answer: Unanswered,
    what: string
  ): MachineProblem =>
    answer.reason === "dead"
      ? awayError(machineId)
      : new MachineProblem(
          silentProblem(`${what}: ${silentWords(machineId, answer)}`)
        );
  return {
    awayError,
    machineFault,
    machineName,
    silentWords,
    unansweredError,
    unansweredFault,
  };
};

/** What `make` makes, as one of the hub's services (hub-layer.ts). */
export class MachineWords extends Context.Service<
  MachineWords,
  ReturnType<typeof make>
>()("MachineWords") {}

export const MachineWordsLayer = Layer.effect(MachineWords)(
  Effect.gen(function* () {
    return make(yield* Db);
  })
);

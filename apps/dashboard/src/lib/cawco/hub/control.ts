/**
 * A control call to a machine through the hub: refused at once when the
 * board lists the machine away, and what to say of one that did not answer.
 */

import type { Bounded } from "@cawco/core/bounded";
import { unhandled } from "@cawco/core/unhandled";
import { machineFaultWords } from "@cawco/core/words/machine-names";
import { machineConnected, machineName } from "../stores/board.svelte";
import { type MissedRead, TRY_AGAIN, unansweredWords } from "../unanswered";
import { ask, type LeftOut } from "./socket.svelte";

/**
 * {@link ask}, of a machine: refused here, with the hub's words for it, while
 * {@link machineConnected} says the machine is not back, never sent to be
 * refused there.
 */
export function askMachine<T>(
  machineId: string,
  requestId: string,
  timeoutMs: number,
  dispatch: () => void,
  readAnswer?: (result: unknown, leftOut?: LeftOut) => T
): Promise<Bounded<T>> {
  if (!machineConnected(machineId)) {
    return Promise.reject(
      new Error(machineFaultWords(machineName(machineId), "offline"))
    );
  }
  return ask<T>(requestId, timeoutMs, dispatch, readAnswer);
}

/** A read no answer came back to in time. */
export type Unanswered = Extract<Bounded<unknown>, { kind: "unanswered" }>;

/**
 * What the person reads when a read of `machineId` didn't answer in time
 * (unanswered.ts): what didn't answer and when it is asked again while the
 * hub says the machine is online ({@link machineConnected}), "It may be
 * offline" only once it has lost it.
 */
export function didntAnswer(
  machineId: string,
  missed: Unanswered,
  words: Omit<MissedRead, "machine" | "online" | "after">
): string {
  return unansweredWords({
    machine: machineName(machineId),
    online: machineConnected(machineId),
    after: missed.after,
    ...words,
  });
}

/**
 * A read as an action the person started takes it, for the actions whose
 * one way to say something is the sentence they throw (a menu item, a
 * confirm dialog): the answer, or {@link didntAnswer}'s sentence thrown.
 * `outcome` says what is now not known, when something is.
 */
export function answeredOr<T>(
  machineId: string,
  read: Bounded<T>,
  outcome?: string
): T {
  switch (read.kind) {
    case "answered":
      return read.value;
    case "unanswered":
      throw new Error(
        didntAnswer(machineId, read, { outcome, again: TRY_AGAIN })
      );
    default:
      unhandled("read", read);
  }
}

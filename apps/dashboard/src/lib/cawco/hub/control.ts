/**
 * A control call to a machine through the hub: refused at once when the
 * board lists the machine away, and what to say of one that did not answer.
 */

import type { Bounded } from "@cawco/core/bounded";
import {
  CONTROL_REPLIES,
  type ControlReply,
} from "@cawco/core/control-replies";
import type { ControlArgs, ControlName } from "@cawco/core/control-table";
import type { HarnessKind } from "@cawco/core/harness/kinds";
import type { ControlPayload } from "@cawco/core/protocol";
import { unhandled } from "@cawco/core/unhandled";
import { controlWords } from "@cawco/core/words/controls";
import { machineFaultWords } from "@cawco/core/words/machine-names";
import type { z } from "zod";
import { newId } from "#lib/platform/id.js";
import { machineConnected, machineName } from "../stores/board.svelte";
import { type MissedRead, TRY_AGAIN, unansweredWords } from "../unanswered";
import { ask, type LeftOut, send } from "./socket.svelte";

/**
 * `result`, a machine's answer to `call`, read by `schema` (core
 * control-replies.ts, the hub's own reading of it): its value, or thrown in
 * words when it is not one.
 */
export const readReply = <T>(
  schema: z.ZodType<T>,
  call: string,
  result: unknown
): T => {
  const read = schema.safeParse(result);
  if (!read.success) {
    throw new Error(
      controlWords.replyMalformed(
        call,
        read.error.issues
          .map((issue) => issue.path.join(".") || issue.message)
          .join(", ")
      )
    );
  }
  return read.data;
};

/**
 * {@link ask}, of a machine: refused here, with the hub's words for it, while
 * {@link machineConnected} says the machine is not back, never sent to be
 * refused there. `send` sends what is answered at `requestId`; `readAnswer`
 * reads the answer.
 */
export function askOf<T>(
  machineId: string,
  requestId: string,
  dispatch: () => void,
  readAnswer: (result: unknown, leftOut?: LeftOut) => T
): Promise<Bounded<T>> {
  if (!machineConnected(machineId)) {
    return Promise.reject(
      new Error(machineFaultWords(machineName(machineId), "offline"))
    );
  }
  return ask(requestId, dispatch, readAnswer);
}

/**
 * Control `method` of machine `machineId` (of its session `instanceId`'s
 * process there, when it names one) called with its own arguments (core
 * control-table.ts), its answer read by the control's reply's schema (core
 * control-replies.ts): what it answered, as its type, or unanswered.
 */
export function askMachine<K extends ControlName>(
  machineId: string,
  method: K,
  args: ControlArgs<K>,
  { harness, instanceId }: { harness?: HarnessKind; instanceId?: string } = {}
): Promise<Bounded<ControlReply<K>>> {
  const requestId = newId();
  const payload: ControlPayload = {
    requestId,
    method,
    args,
    ...(harness ? { harness } : {}),
    ...(instanceId ? { instanceId } : {}),
  };
  return askOf(
    machineId,
    requestId,
    () =>
      send({
        verb: "control",
        machineId,
        ...(instanceId ? { instanceId } : {}),
        requestId,
        payload,
      }),
    (result) => readReply(CONTROL_REPLIES[method], method, result)
  );
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

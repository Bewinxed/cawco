import { problem } from "elysia";
import { awayProblem, silentProblem } from "./machine-answers";
import type { RelayCall } from "./stream-relay";

/** Machine `machineId`'s answer to a browser call, or its refusal in the person's words (`machine`, its name). */
export const answered = <T>(
  read: Awaited<ReturnType<RelayCall>>,
  machineId: string,
  machine: string,
  what: string
) => {
  if (read.kind === "unanswered") {
    return read.reason === "dead"
      ? awayProblem(
          machineId,
          `${machine} is not connected, so its browser could not ${what}. Try again once it is back.`
        )
      : silentProblem(
          `${machine}'s browser did not ${what} in time; it may still be at it there.`
        );
  }
  if (!read.value.ok) {
    return problem(502, {
      code: "browser-machine-refused",
      detail: read.value.error ?? `${machine}'s browser did not ${what}.`,
    });
  }
  return read.value.result as T;
};

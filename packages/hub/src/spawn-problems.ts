import type { problem } from "elysia";
import type { AwayProblem, SilentProblem } from "./machine-answers";

/** A problem of this status and code, its words a string. */
type Problem<Status extends number, Code extends string> = ReturnType<
  typeof problem<Status, { code: Code; detail: string }>
>;

/**
 * Why a session the hub starts did not start (spawns.ts `spawnSession`): a
 * payload that names no session, a session key another row holds, a machine
 * that is away, a default it cannot name, a start not settled or placed, a
 * project deleted, an account that cannot take it, or the machine's own
 * answer (none in time, or its failure). `spawnSession` is declared to
 * answer these, so the compiler holds this list to it; moves.ts, caw.ts and
 * fleet-watch.ts read it from here, as spawns.ts reaches each of them.
 */
export type SpawnProblem =
  | Problem<400, "spawn-payload-unnamed">
  | Problem<409, "spawn-session-key-held">
  | AwayProblem
  | Problem<502, "spawn-default-unnamed">
  | Problem<400, "spawn-not-settled">
  | Problem<404, "spawn-project-deleted">
  | Problem<400, "spawn-not-placed">
  | Problem<409, "launch-account-unavailable">
  | SilentProblem
  | Problem<502, "spawn-start-failed">;

/**
 * A routine's run as the trigger engine (routines.ts) asks dispatch to start
 * it (dispatch.ts `startRun`), and what dispatch answers: the one shape
 * both read, below them both.
 */
import type { SessionRole } from "@cawco/core/delegate-types";
import { lookUntil } from "@cawco/core/effect/poll";
import { Effect } from "effect";
import type { WorkItemRow } from "./db/project-work";

/**
 * How long a run waits for a machine to run on before it goes without one:
 * a hub that just started fires its catch-up before its machines are back.
 */
const PLACE_WAIT_MS = 60_000;
/** How often a run waiting for a machine looks again. */
const PLACE_POLL_MS = 1000;

/**
 * A run's place, waited for: `look` now, and again every
 * {@link PLACE_POLL_MS} until `found` holds of its answer or
 * {@link PLACE_WAIT_MS} pass; its last answer either way. Run on the hub's
 * lifetime, its waits stop when the hub closes.
 */
export const placeWithin = <A>(
  look: () => A,
  found: (answer: A) => boolean
): Effect.Effect<A> =>
  lookUntil(
    { every: PLACE_POLL_MS, deadlineMs: PLACE_WAIT_MS, until: found },
    Effect.sync(look)
  ).pipe(
    Effect.map((looked) =>
      looked.kind === "found" ? looked.value : looked.last
    )
  );

/** A run a session does, as the engine asks dispatch to start it (dispatch.ts `startRun`). */
export interface RunStart {
  /** Comments on the task since this time are carried (a question the person answered). */
  commentsSince?: number;
  /** The run's contract, after the task file and the input. */
  contract: string;
  /** What the run reads after the task file: an event, or the hub's findings. */
  input: string;
  /** The brief's first line: the routine, its slot and its attempt. */
  lead: string;
  /** A session that may delegate, with host scope, landing nothing itself. */
  orchestrator: boolean;
  /** Its work item's parent: the routine, at the place dispatch cut it. */
  parent: { id: string; name: string };
  /** In place of the task's description: the hub's own prompt (the curator's). */
  prompt?: string;
  /** The role it runs in (`curator`, `trimmer`); its type's otherwise. */
  role?: SessionRole;
  runId: string;
}

/** What dispatch answers a run's start: its item, or why it was turned down, or a refusal that failed it. */
export type RunStarted =
  { item: WorkItemRow; kind: "started" } | { kind: "skipped"; why: string };

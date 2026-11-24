/**
 * A routine's run as the trigger engine (routines.ts) asks dispatch to start
 * it (dispatch.ts `startRun`), and what dispatch answers: the one shape
 * both read, below them both.
 */
import type { SessionRole } from "@cawco/core/delegate-types";
import type { WorkItemRow } from "./db/project-work";

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

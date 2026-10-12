/**
 * Approved actions (Projects spec §3, §5.5): one exact tool call on a
 * connection, proposed by a session, approved by you, run once by the hub at
 * its time (packages/hub/src/actions.ts). What the hub answers about one,
 * and the frame that keeps a dashboard's Needs you in step.
 */

/** Where an approved action is. */
export const ACTION_STATES = [
  "proposed",
  "approved",
  "denied",
  "running",
  "done",
  "failed",
  "unknown",
  "cancelled",
] as const;
export type ActionState = (typeof ACTION_STATES)[number];

/** One approved action as the hub answers it (times in ms epoch). */
export interface ApprovedActionView {
  /** The service's account the connection signed in as when it was proposed. */
  account: string;
  approvedAt: number | null;
  /** The call's arguments, JSON, exactly as it will be sent. */
  args: string;
  /** SHA-256 of `args`, hex: what an approval names. */
  argsHash: string;
  /** When you put a failed or unknown one away. */
  checkedAt: number | null;
  connection: string;
  createdAt: number;
  endedAt: number | null;
  /** Why it failed, was refused, or is unknown. */
  error: string | null;
  id: string;
  projectId: string;
  /** The project's name, as the board names it. */
  projectName: string | null;
  /** The session that proposed it, and its title while the hub holds it. */
  proposedBy: string;
  proposerTitle: string | null;
  /** The proposer's one sentence: why. */
  reason: string;
  /** What the service answered, JSON, cut at 16 KB. */
  result: string | null;
  /** When it runs, at the earliest; null: as soon as it is approved. */
  runAt: number | null;
  service: string;
  /** What its stage move came to, once it tried. */
  stageResult: string | null;
  startedAt: number | null;
  state: ActionState;
  taskId: string | null;
  taskTitle: string | null;
  /** The task stage it moves to once done. */
  thenStage: string | null;
  tool: string;
}

/**
 * Hub-originated: every approved action waiting on you, whole, on each
 * change: those proposed, and those that failed or whose outcome is unknown,
 * until you put them away.
 */
export interface ActionsFrame {
  actions: ApprovedActionView[];
  instanceId?: undefined;
  kind: "actions";
}

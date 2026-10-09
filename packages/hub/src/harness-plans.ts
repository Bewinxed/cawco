/**
 * Each harness's own to-do list, read where the harness keeps it and mapped
 * into one shape, a session's plan steps (`PlanStep`, core plan.ts). The
 * session's machine answers {@link CONTROL_GET_TODOS} for its harness:
 * - Claude Code: its task list, `tasks/<session>/` in the session's own dir
 *   (core paths.ts `sessionConfigDir`, the dir of the account its row runs
 *   on), so the row's account goes with the ask;
 * - OpenCode: its todo list;
 * - pi: none.
 * Nothing here is stored: the harness's list is the truth.
 */
import {
  CONTROL_GET_TODOS,
  type HarnessKind,
  type InstanceRow,
  type NeutralTask,
  type PlanStep,
} from "@cawco/core";

export interface HarnessPlanDeps {
  /** A machine control, answered by the session's harness (server.ts `callAgent`). */
  control: (
    machineId: string,
    method: string,
    args: unknown[],
    harness: HarnessKind
  ) => Promise<unknown>;
  online: (machineId: string) => boolean;
}

type Row = Pick<
  InstanceRow,
  "accountId" | "cwd" | "harness" | "machineId" | "sessionId"
>;

/** The session's list as its harness keeps it, in its own order; none when its machine is away. */
export const harnessTasks = async (
  deps: HarnessPlanDeps,
  row: Row
): Promise<NeutralTask[]> => {
  const harness = (row.harness ?? "claude") as HarnessKind;
  if (harness === "pi" || !(row.sessionId && deps.online(row.machineId))) {
    return [];
  }
  const answer = await deps.control(
    row.machineId,
    CONTROL_GET_TODOS,
    [row.sessionId, row.cwd || undefined, row.accountId ?? null],
    harness
  );
  return Array.isArray(answer) ? (answer as NeutralTask[]) : [];
};

/** The session's steps from its harness's own list; pi keeps none. */
export const harnessSteps = async (
  deps: HarnessPlanDeps,
  row: Row
): Promise<PlanStep[]> =>
  (await harnessTasks(deps, row)).map((task) => ({
    id: task.id,
    content: task.subject,
    status: task.status,
    depth: 0,
    ...(task.priority ? { priority: task.priority } : {}),
  }));

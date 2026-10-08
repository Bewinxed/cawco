/**
 * A workflow run, outside the editor, is a session like any other: one row in
 * Working, Finished and its project, nested under the session that started
 * it, with its steps nested under it, opened as a tab. This is the one place
 * that says how a run reads as a session row.
 *
 * A run is addressed as `run:<run id>`. Run ids and session ids are both
 * UUIDs, so the prefix is what tells a tab, a row or a link which one it is.
 */
import type {
  InstanceRow,
  InstanceStatus,
  WorkflowRun,
  WorkflowRunStatus,
  WorkflowStep,
} from "@cawco/core";

const PREFIX = "run:";

/** The session-shaped id a run is listed, opened and linked by. */
export const runTabId = (runId: string): string => `${PREFIX}${runId}`;

/** The run an id names, or `null` for a session's id. */
export const runIdOf = (id: string): string | null =>
  id.startsWith(PREFIX) ? id.slice(PREFIX.length) : null;

/** Where a run opens: its tab, the way `/session/<id>` opens a session's. */
export const runHref = (runId: string): string => `/session/${runTabId(runId)}`;

/**
 * Where a run's status stands among a session's: still going is running, a
 * failure is a failure, and a run that ended any other way has stopped.
 */
const STATUS: Record<WorkflowRunStatus, InstanceStatus> = {
  running: "running",
  waiting: "running",
  failed: "error",
  done: "stopped",
  cancelled: "stopped",
};

const ms = (value: Date | string | null | undefined): number | undefined => {
  if (!value) {
    return;
  }
  const at = new Date(value).getTime();
  return Number.isNaN(at) ? undefined : at;
};

/** When a run last moved: its end, else its newest step's, else its start. */
export function runMovedAt(
  run: WorkflowRun,
  steps: WorkflowStep[] = []
): number | undefined {
  const ended = ms(run.endedAt);
  if (ended !== undefined) {
    return ended;
  }
  let latest = ms(run.startedAt);
  for (const step of steps) {
    const at = ms(step.endedAt) ?? ms(step.startedAt);
    if (at !== undefined && (latest === undefined || at > latest)) {
      latest = at;
    }
  }
  return latest;
}

/** When a run that is still going began; `undefined` once it has ended. */
export const runSince = (run: WorkflowRun): number | undefined =>
  run.status === "running" || run.status === "waiting"
    ? ms(run.startedAt)
    : undefined;

/**
 * How long a run that has ended stays on the board: the hub's own window for
 * a session that stopped moving (`STALE_AFTER_MS`, hub db/index.ts), so an
 * ended run leaves the lists when a session that ended with it would.
 */
const BOARD_MS = 24 * 60 * 60 * 1000;

/** Whether a run row is one the board lists: still going, or ended within the window. */
export const onBoard = (row: InstanceRow, now: number): boolean =>
  row.status === "running" ||
  now - new Date(row.updatedAt ?? 0).getTime() < BOARD_MS;

/**
 * A run as a session row. Its parent is the run it is a child of, else the
 * session that supervises it; its folder is the workspace it runs in.
 */
export function runRowOf(run: WorkflowRun, name: string): InstanceRow {
  return {
    id: runTabId(run.id),
    machineId: run.machineId,
    cwd: run.workspace,
    launchDir: "known",
    sessionId: null,
    status: STATUS[run.status],
    title: name,
    parentInstanceId: run.parentRunId
      ? runTabId(run.parentRunId)
      : run.supervisorInstanceId,
    lastError: run.failure,
    updatedAt: run.endedAt ?? run.startedAt,
    seenAt: run.seenAt ?? null,
  };
}

/**
 * What a step is called: its node's title in a drawn workflow, else what its
 * call named it (a program's `w.run({ title })`, an ask's question, the
 * workflow it started; the hub reads it off the call), else its node.
 */
export const stepTitle = (
  run: Pick<WorkflowRun, "graph">,
  step: WorkflowStep
): string =>
  run.graph?.nodes.find((node) => node.id === step.nodeId)?.title ??
  step.title ??
  step.nodeId;

/**
 * A step's session hangs under its run, not beside it under the run's
 * supervisor: the run is the step's parent wherever sessions nest. The hub
 * titles it `<workflow> · <step>`; under its run, which is already called
 * by the workflow, it is called by the step alone.
 */
export function stepUnderRun(
  row: InstanceRow,
  workflowName: string | undefined
): InstanceRow {
  const runId = row.workflowRunId;
  if (!runId) {
    return row;
  }
  const prefix = workflowName ? `${workflowName} · ` : null;
  return {
    ...row,
    parentInstanceId: runTabId(runId),
    ...(prefix && row.title?.startsWith(prefix)
      ? { title: row.title.slice(prefix.length) }
      : {}),
  };
}

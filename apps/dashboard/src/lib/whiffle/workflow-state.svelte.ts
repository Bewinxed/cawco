import type {
  Workflow,
  WorkflowEffect,
  WorkflowFrame,
  WorkflowRun,
} from "@whiffle/core";
import {
  loadWorkflowEffects,
  loadWorkflowRun,
  loadWorkflowRuns,
  loadWorkflows,
  type WorkflowRunDetail,
} from "./workflows";

export const workflowState = $state({
  workflows: [] as Workflow[],
  runs: {} as Record<string, WorkflowRun>,
  details: {} as Record<string, WorkflowRunDetail>,
  /** The effect journal per run: the code-origin graph, checkpoints and log. */
  effects: {} as Record<string, WorkflowEffect[]>,
  error: "",
  /** The first read of every workflow and its runs has come back, or failed. */
  loaded: false,
});
const revisions = new Map<string, number>();
export function acceptWorkflowFrame(frame: WorkflowFrame) {
  revisions.set(frame.runId, (revisions.get(frame.runId) ?? 0) + 1);
  workflowState.runs[frame.runId] = frame.run;
  const detail = workflowState.details[frame.runId];
  if (!detail) {
    return;
  }
  // A frame without `ask` means the run is no longer parked on a question.
  const { ask: _answered, ...rest } = detail;
  workflowState.details[frame.runId] = {
    ...rest,
    ...frame.run,
    ...(frame.ask ? { ask: frame.ask } : {}),
    steps: frame.step
      ? [
          ...detail.steps.filter((step) => step.id !== frame.step?.id),
          frame.step,
        ]
      : detail.steps,
    attempts: frame.attempt
      ? [
          ...detail.attempts.filter(
            (attempt) => attempt.id !== frame.attempt?.id
          ),
          frame.attempt,
        ]
      : detail.attempts,
  };
}
export async function refreshWorkflowRun(runId: string) {
  const revision = revisions.get(runId) ?? 0;
  const detail = await loadWorkflowRun(runId);
  if ((revisions.get(runId) ?? 0) !== revision) {
    return refreshWorkflowRun(runId);
  }
  workflowState.details[runId] = detail;
  workflowState.runs[runId] = detail;
  return detail;
}
export async function refreshWorkflowEffects(runId: string) {
  const { effects } = await loadWorkflowEffects(runId);
  workflowState.effects[runId] = effects;
  return effects;
}
export async function refreshWorkflows() {
  // A read under way answers for itself: an error left by a read that failed
  // while the hub was away must not stand while the fresh one is out.
  workflowState.error = "";
  try {
    const { workflows } = await loadWorkflows();
    workflowState.workflows = workflows;
    const batches = await Promise.all(
      workflows.map((workflow) => loadWorkflowRuns(workflow.id))
    );
    // Every run's read is waited on and every failure is kept: with
    // Promise.all the first failure ends the wait and the rest reject with
    // nobody listening (a navigation away aborts all of them at once).
    const reads = await Promise.allSettled(
      batches
        .flatMap((batch) => batch.runs)
        .map((run) => refreshWorkflowRun(run.id))
    );
    const failed = reads.find(
      (read): read is PromiseRejectedResult => read.status === "rejected"
    );
    if (failed) {
      throw failed.reason;
    }
    workflowState.error = "";
  } catch (error) {
    workflowState.error =
      error instanceof Error ? error.message : String(error);
  } finally {
    workflowState.loaded = true;
  }
}

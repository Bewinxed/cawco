import type {
  Problem,
  Workflow,
  WorkflowAction,
  WorkflowAsk,
  WorkflowAttempt,
  WorkflowGraph,
  WorkflowLogEntry,
  WorkflowRun,
  WorkflowStep,
} from "@whiffle/core";

export type WorkflowDetail = Workflow & { problems: Problem[] };

/**
 * A save the hub refused with diagnostics rather than a sentence: a compile or
 * typecheck failure, whose problems carry the node or the line they belong to.
 * They are pinned on the canvas and listed under Problems, so the refusal is
 * readable where the mistake is rather than only in a banner.
 */
export class WorkflowProblems extends Error {
  readonly problems: Problem[];
  constructor(problems: Problem[]) {
    super(
      problems[0]?.message ?? "The hub refused the save without saying why."
    );
    this.name = "WorkflowProblems";
    this.problems = problems;
  }
}
export type WorkflowRunDetail = WorkflowRun & {
  steps: WorkflowStep[];
  attempts: WorkflowAttempt[];
  /** Present while the run is `waiting`: the question it is parked on. */
  ask?: WorkflowAsk;
};
export interface WorkflowLaunch {
  inputs: Record<string, unknown>;
  supervisor: { delegateType: string } | { instanceId: string } | null;
  workspace: { path: string; machineId: string };
}

async function request<T>(
  path: string,
  method = "GET",
  body?: unknown
): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  if (!response.ok) {
    const text = await response.text();
    const problems = diagnostics(text);
    if (problems) {
      throw new WorkflowProblems(problems);
    }
    throw new Error(text || `The hub answered ${response.status}.`);
  }
  return response.json() as Promise<T>;
}
/** The `{ problems }` body a refused compile or typecheck answers with. */
function diagnostics(text: string): Problem[] | undefined {
  try {
    const body = JSON.parse(text) as { problems?: Problem[] };
    return Array.isArray(body.problems) && body.problems.length
      ? body.problems
      : undefined;
  } catch {
    return undefined;
  }
}
const id = encodeURIComponent;

/** A workflow is authored either as a graph or as a program, never both. */
export type WorkflowSource = { graph: WorkflowGraph } | { program: string };
export const loadWorkflows = () =>
  request<{ workflows: Workflow[] }>("workflows");
export const loadWorkflow = (key: string) =>
  request<WorkflowDetail>(`workflows/${id(key)}`);
export const createWorkflow = (body: { name: string } & WorkflowSource) =>
  request<WorkflowDetail>("workflows", "POST", body);
export const saveWorkflow = (
  key: string,
  body: { name: string; description: string } & WorkflowSource
) => request<WorkflowDetail>(`workflows/${id(key)}`, "PUT", body);
export const deleteWorkflow = (key: string) =>
  request<{ ok: boolean }>(`workflows/${id(key)}`, "DELETE");
export const loadWorkflowRuns = (key: string) =>
  request<{ runs: WorkflowRun[] }>(`workflows/${id(key)}/runs`);
export const launchWorkflow = (key: string, body: WorkflowLaunch) =>
  request<{ runId: string }>(`workflows/${id(key)}/runs`, "POST", body);
export const loadWorkflowLog = (key: string) =>
  request<{ log: WorkflowLogEntry[] }>(`workflow-runs/${id(key)}/log`);
export const loadWorkflowRun = (key: string) =>
  request<WorkflowRunDetail>(`workflow-runs/${id(key)}`);
export const cancelWorkflowRun = (key: string) =>
  request<unknown>(`workflow-runs/${id(key)}/cancel`, "POST");
/**
 * Starts the run again with the inputs it had: from its start, or from one of
 * its steps, the calls before it answered with what this run got there.
 */
export const rerunWorkflow = (key: string, fromStepId?: string) =>
  request<{ runId: string }>(`workflow-runs/${id(key)}/rerun`, "POST", {
    fromStepId,
  });
export const answerWorkflow = (
  key: string,
  stepId: string,
  answer: { choice?: string; note?: string; value?: unknown }
) =>
  request<{ ok: boolean }>(`workflow-runs/${id(key)}/answer`, "POST", {
    stepId,
    ...answer,
  });
export const steerWorkflow = (key: string, action: WorkflowAction) =>
  request<unknown>(`workflow-runs/${id(key)}/steer`, "POST", { action });
export const submitWorkflowResult = (
  key: string,
  instanceId: string,
  result: unknown
) =>
  request<unknown>(`workflow-steps/${id(key)}/result`, "POST", {
    instanceId,
    result,
  });

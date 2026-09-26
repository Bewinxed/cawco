/**
 * The program runtime (proposal §13.3). One Bun `Worker` per active run
 * executes the stored program; every `w.*` call crosses back here as an
 * effect, is answered from `workflow_effects` on replay or executed live and
 * journaled. Steps, attempts and sessions are exactly what §3.1/§5 already
 * described — what changed is who decides the order: the program, not a
 * scheduler.
 */
import type {
  EffortLevel,
  Envelope,
  PermissionResult,
  Problem,
  SpawnPayload,
  WorkflowAction,
  WorkflowAsk,
  WorkflowEffectKind,
  WorkflowFailure,
  WorkflowGraph,
  WorkflowRun,
} from "@whiffle/core";
import { workflowNoticeMarker, workflowStepMarker } from "@whiffle/core";
import { stepIdFor } from "@whiffle/core/workflow-program";
import { writeProgram } from "@whiffle/core/workflow-sandbox";
import type { WorkerOut, WorkerStart } from "@whiffle/core/workflow-worker";
import Ajv from "ajv";
import type {
  DbShape,
  WorkflowAttemptRow,
  WorkflowEffectRow,
  WorkflowRunRow,
  WorkflowStepRow,
} from "../db";

export interface WorkflowRuntimeDeps {
  broadcast: (frame: {
    ask?: WorkflowAsk;
    attempt?: WorkflowAttemptRow;
    checkpoint?: { data: unknown; label: string };
    run: PublicRun;
    runId: string;
    step?: WorkflowStepRow;
  }) => void;
  command: (
    machineId: string,
    cwd: string,
    cmd: string,
    timeoutMs?: number
  ) => Promise<{ exitCode: number; output: string }>;
  db: DbShape;
  emit: (envelope: Envelope) => void;
  halt: (machineId: string, instanceId: string) => Promise<void>;
  notifyUser: (text: string) => void;
  online: (machineId: string) => boolean;
  park: (envelope: Envelope) => void;
  /** The graph's authoring problems: a workflow with any cannot run (§9.3). */
  problems: (graph: WorkflowGraph, workflowId: string) => Problem[];
  settle: (requestId: string) => void;
  spawn: (machineId: string, payload: SpawnPayload) => Promise<void>;
  supervisor: (
    type: string,
    workspace: string,
    machineId: string,
    prompt: string
  ) => Promise<string>;
}

export type PublicRun = WorkflowRunRow & Pick<WorkflowRun, "edges" | "loops">;

/** The spec a `run` / `spawn` effect carries, already reduced to JSON. */
interface StepArgs {
  continueFrom?: string;
  denyTools?: string[];
  effort?: EffortLevel;
  harness: "claude" | "opencode" | "pi";
  model: string;
  node?: string;
  outputSchema: Record<string, unknown>;
  prompt: string;
  retries?: number;
  skills?: string[];
  timeoutMinutes?: number;
  title: string;
}

const active = (run: WorkflowRunRow) =>
  run.status === "running" || run.status === "waiting";
const reason = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** Stable JSON so an argument object always hashes the same way. */
const canonical = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
    .join(",")}}`;
};
/** What a settled effect keeps: a step keeps its spec beside its value. */
const journalResult = (
  kind: WorkflowEffectKind,
  stored: WorkflowEffectRow | undefined,
  outcome: { failure?: WorkflowFailure; result?: unknown }
) => {
  if (outcome.failure) {
    return stored?.result ?? null;
  }
  if (kind === "run" || kind === "spawn") {
    return { ...(stored?.result as object), value: outcome.result };
  }
  return outcome.result;
};

/**
 * What a settled effect keeps of its *arguments*. The run view has to say
 * what was asked, run, stored or slept on; `argsHash` can only say whether
 * two calls matched. `run`/`spawn` already keep their whole spec under
 * `result.spec`, and the schemas a `state` call carries are the program's
 * business, not the reader's — everything else is journaled verbatim.
 */
const journalArgs = (
  kind: WorkflowEffectKind,
  args: Record<string, unknown>
): Record<string, unknown> | null => {
  const keep = (...names: string[]) =>
    Object.fromEntries(
      names.filter((name) => args[name] !== undefined).map((n) => [n, args[n]])
    );
  switch (kind) {
    case "ask":
      return keep("question", "options", "allowOther", "answeredBy", "waitFor");
    case "exec":
      return keep("cmd", "timeoutMinutes");
    case "exists":
      return keep("path");
    case "notify":
    case "log":
      return keep("text");
    case "state-get":
      return keep("name");
    case "state-set":
      return keep("name", "value");
    case "checkpoint":
      return keep("label", "data");
    case "workflow":
      return keep("slug", "inputs");
    case "sleep":
      return keep("ms");
    default:
      return null;
  }
};

const hashArgs = (args: unknown) =>
  new Bun.CryptoHasher("sha256").update(canonical(args)).digest("hex");

/**
 * `run.edges` / `run.loops` (§7.2a), now read off the `trace` effects the
 * compiled program emits. A code-origin run traces nothing, so both are empty
 * and the dashboard lays its graph out from the journal instead.
 */
export function publicRun(
  run: WorkflowRunRow,
  effects: WorkflowEffectRow[]
): PublicRun {
  const edges: Record<string, Record<string, "fired" | "skipped">> = {};
  const loops: Record<string, Record<string, number>> = {};
  for (const effect of effects) {
    if (effect.kind !== "trace") {
      continue;
    }
    const { edgeId, scope } = (effect.result ?? {}) as {
      edgeId?: string;
      scope?: string;
    };
    if (!(edgeId && scope)) {
      continue;
    }
    edges[scope] ??= {};
    edges[scope][edgeId] = "fired";
    const bounded = run.graph?.edges.find(
      (edge) => edge.id === edgeId && edge.maxIterations !== undefined
    );
    if (bounded) {
      loops[scope] ??= {};
      loops[scope][edgeId] = (loops[scope][edgeId] ?? 0) + 1;
    }
  }
  for (const scope of Object.keys(edges)) {
    for (const edge of run.graph?.edges ?? []) {
      edges[scope][edge.id] ??= "skipped";
    }
  }
  if (run.graph && !edges.root) {
    edges.root = Object.fromEntries(
      run.graph.edges.map((edge) => [edge.id, "skipped" as const])
    );
  }
  return { ...run, edges, loops };
}

export function createWorkflowRuntime(deps: WorkflowRuntimeDeps) {
  const { db } = deps;
  const ajv = new Ajv({ allErrors: true, strict: false });
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const locks = new Map<string, Promise<unknown>>();
  /** Effects still waiting on the world: step id, child run id, or sleep key. */
  const waiters = new Map<
    string,
    {
      reject: (failure: WorkflowFailure) => void;
      resolve: (value: unknown) => void;
      runId: string;
    }
  >();
  const workers = new Map<string, { worker: Worker }>();

  const runOf = (id: string): WorkflowRunRow => {
    const run = db.getWorkflowRun(id);
    if (!run) {
      throw new Error(`No workflow run ${id}.`);
    }
    return run;
  };
  const stepOf = (id: string) => {
    const step = db.getWorkflowStep(id);
    if (!step) {
      throw new Error(`No workflow step ${id}.`);
    }
    return step;
  };
  const latest = (step: WorkflowStepRow) =>
    db.listWorkflowAttempts(step.id).at(-1);
  const clearTimer = (id: string) => {
    clearTimeout(timers.get(id));
    timers.delete(id);
  };
  /**
   * The question a waiting run is parked on, read off the rows: the waiting
   * `ask` step plus the arguments its effect journaled. A code-origin run has
   * no graph to read the question from, so this is the only source, and both
   * the detail route and the `workflow` frame use it.
   */
  const askOf = (run: WorkflowRunRow): WorkflowAsk | undefined => {
    if (run.status !== "waiting") {
      return undefined;
    }
    const step = db
      .listWorkflowSteps(run.id)
      .find((row) => row.kind === "ask" && row.status === "waiting");
    if (!step) {
      return undefined;
    }
    const args = (db.getWorkflowEffect(run.id, step.seq)?.args ??
      {}) as Partial<WorkflowAsk>;
    return {
      stepId: step.id,
      question: args.question ?? "",
      options: args.options ?? [],
      allowOther: args.allowOther ?? false,
      answeredBy: args.answeredBy ?? "operator",
      parkedAt: step.startedAt ?? run.startedAt,
    };
  };
  const write = (
    run: WorkflowRunRow,
    step?: WorkflowStepRow,
    attempt?: WorkflowAttemptRow,
    checkpoint?: { data: unknown; label: string }
  ) => {
    db.workflowTransition(run, step, attempt);
    deps.broadcast({
      runId: run.id,
      run: publicRun(run, db.listWorkflowEffects(run.id)),
      step,
      attempt,
      checkpoint,
      ask: askOf(run),
    });
  };
  const serial = <T>(
    runId: string,
    action: () => T | Promise<T>
  ): Promise<T> => {
    const previous = locks.get(runId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(action);
    locks.set(runId, next);
    return next.finally(() => {
      if (locks.get(runId) === next) {
        locks.delete(runId);
      }
    });
  };
  const send = (
    run: WorkflowRunRow,
    instanceId: string,
    body: string,
    queued = false
  ) => {
    const [instance] = db.getInstancesByIds([instanceId]);
    if (!instance) {
      throw new Error(`No instance ${instanceId} to receive the message.`);
    }
    deps.emit({
      verb: "send",
      machineId: instance.machineId,
      instanceId,
      payload: {
        instanceId,
        message: {
          type: "user",
          message: { role: "user", content: body },
          parent_tool_use_id: null,
          origin: {
            kind: "peer",
            from: run.id,
            name: db.getWorkflow(run.workflowId)?.name ?? run.workflowId,
            fromSession: run.supervisorInstanceId ?? run.id,
          },
          ...(queued ? { shouldQuery: false } : {}),
        },
      },
    });
  };
  const notify = (run: WorkflowRunRow, body: string) => {
    if (!run.supervisorInstanceId) {
      return;
    }
    const [supervisor] = db.getInstancesByIds([run.supervisorInstanceId]);
    if (
      supervisor &&
      deps.online(supervisor.machineId) &&
      ["running", "starting"].includes(supervisor.status)
    ) {
      send(run, supervisor.id, body, true);
    }
  };
  const nameOf = (run: WorkflowRunRow) =>
    db.getWorkflow(run.workflowId)?.name ?? run.workflowId;

  const stopStep = (run: WorkflowRunRow, step: WorkflowStepRow) => {
    clearTimer(step.id);
    deps.settle(step.id);
    if (step.instanceId && deps.online(run.machineId)) {
      deps.emit({
        verb: "stop",
        machineId: run.machineId,
        instanceId: step.instanceId,
        payload: { instanceId: step.instanceId },
      });
    }
  };

  const killWorker = (runId: string) => {
    const live = workers.get(runId);
    if (live) {
      live.worker.terminate();
      workers.delete(runId);
    }
    for (const [key, waiter] of waiters) {
      if (waiter.runId === runId) {
        waiters.delete(key);
      }
    }
  };

  const finish = (
    run: WorkflowRunRow,
    status: "done" | "failed" | "cancelled",
    failure: string | null = null,
    result: unknown = null

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: a terminal transition stops sessions, cascades to children, settles waiters and reports in one sweep
  ) => {
    run.status = status;
    run.failure = failure;
    run.result = result;
    run.endedAt = new Date();
    killWorker(run.id);
    for (const child of db
      .listWorkflowRuns()
      .filter((entry) => entry.parentRunId === run.id && active(entry))) {
      finish(child, "cancelled");
    }
    for (const step of db.listWorkflowSteps(run.id)) {
      if (!["pending", "running", "waiting"].includes(step.status)) {
        continue;
      }
      stopStep(run, step);
      step.status = step.status === "pending" ? "skipped" : "cancelled";
      step.endedAt = new Date();
      const attempt = latest(step);
      if (attempt && !attempt.endedAt) {
        attempt.endedAt = new Date();
        attempt.failure = status;
      }
      write(run, step, attempt);
    }
    write(run);
    notify(
      run,
      `${workflowNoticeMarker(nameOf(run), run.status)}${run.failure ?? JSON.stringify(run.result, null, 2)}`
    );
    if (run.parentRunId && run.parentStepId) {
      const waiter = waiters.get(run.id);
      if (waiter) {
        waiters.delete(run.id);
        if (status === "done") {
          waiter.resolve(run.result);
        } else {
          waiter.reject({
            name: "ChildError",
            kind: status === "cancelled" ? "cancelled" : "failed",
            childRunId: run.id,
            message: run.failure ?? status,
          });
        }
      }
    }
  };

  // ---------------------------------------------------------------- steps

  const attemptStep = async (
    run: WorkflowRunRow,
    step: WorkflowStepRow,
    spec: StepArgs,
    previousError = ""

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one dispatch builds the contract, decides spawn-or-resume, persists the attempt and arms the timeout
  ) => {
    const number = (latest(step)?.number ?? 0) + 1;
    const notes = (run.state.__notes as string[] | undefined) ?? [];
    run.state = { ...run.state, __notes: [] };
    const body = `${workflowStepMarker(nameOf(run), spec.title)}${spec.prompt}\n\nWhen the work is done, call submit_result exactly once with an object matching this schema, then end your turn. Do not describe the result in prose instead of calling it.\n${JSON.stringify(spec.outputSchema, null, 2)}${run.supervisorInstanceId ? "" : "\nThere is nobody to ask. Decide, and record any assumption in your result."}${notes.length ? `\nSupervisor note: ${notes.join("\n")}` : ""}${previousError ? `\nPrevious attempt: ${previousError}\n${previousError === "no-result" ? "You ended without calling submit_result. Call it now with an object matching the schema." : "Correct the error and call submit_result."}` : ""}`;
    let resume: SpawnPayload["resume"];
    const instance = step.instanceId
      ? db.getInstancesByIds([step.instanceId])[0]
      : undefined;
    const needsSpawn = !(
      instance && ["running", "starting"].includes(instance.status)
    );
    if (step.instanceId && needsSpawn) {
      if (!instance?.sessionId) {
        throw new Error(
          `${previousError}\nThe step has no session key to resume; a retry cannot start a fresh session.`
        );
      }
      resume = { sessionKey: instance.sessionId };
    } else if (!step.instanceId && spec.continueFrom) {
      const source = stepOf(spec.continueFrom);
      const sourceInstance = source.instanceId
        ? db.getInstancesByIds([source.instanceId])[0]
        : undefined;
      if (!sourceInstance?.sessionId) {
        throw new Error("The upstream step has no session key to fork.");
      }
      resume = { sessionKey: sourceInstance.sessionId, fork: true };
    }
    step.instanceId ??= crypto.randomUUID();
    step.status = "running";
    step.startedAt ??= new Date();
    step.endedAt = null;
    const attempt: WorkflowAttemptRow = {
      id: crypto.randomUUID(),
      stepId: step.id,
      number,
      renderedPrompt: body,
      result: null,
      failure: null,
      startedAt: new Date(),
      endedAt: null,
    };
    write(run, step, attempt);
    if (needsSpawn) {
      await deps.spawn(run.machineId, {
        instanceId: step.instanceId,
        cwd: run.workspace,
        harness: spec.harness,
        model: spec.model,
        effort: spec.effort,
        skills: spec.skills,
        denyTools:
          spec.harness === "claude"
            ? [
                ...(spec.denyTools ?? []),
                ...(run.supervisorInstanceId ? [] : ["AskUserQuestion"]),
              ]
            : undefined,
        resume,
        permissionMode: "bypassPermissions",
        canDelegate: false,
        title: `${nameOf(run)} · ${spec.title}`,
        ...(run.supervisorInstanceId
          ? { parent: { instanceId: run.supervisorInstanceId } }
          : {}),
        workflowRunId: run.id,
        workflowStepId: step.id,
      });
    }
    if (!active(runOf(run.id))) {
      stopStep(run, step);
      return;
    }
    send(run, step.instanceId, body);
    arm(run, step, Date.now() + (spec.timeoutMinutes ?? 60) * 60_000);
  };

  const arm = (
    run: WorkflowRunRow,
    step: WorkflowStepRow,
    deadline: number,
    ask = false
  ) => {
    clearTimer(step.id);
    timers.set(
      step.id,
      setTimeout(
        () => {
          serial(run.id, async () => {
            const current = runOf(run.id);
            const currentStep = stepOf(step.id);
            if (
              !(
                active(current) &&
                ["running", "waiting"].includes(currentStep.status)
              )
            ) {
              return;
            }
            if (ask) {
              settleAsk(current, currentStep, {
                name: "AskError",
                kind: "timeout",
                message: "ask-timeout",
              });
              return;
            }
            if (currentStep.instanceId) {
              await deps.halt(current.machineId, currentStep.instanceId);
            }
            await ended(current, currentStep, "attempt-timeout");
          }).catch((error) => {
            const current = runOf(run.id);
            if (active(current)) {
              finish(current, "failed", reason(error));
            }
          });
        },
        Math.max(1, deadline - Date.now())
      )
    );
  };

  const specOf = (step: WorkflowStepRow): StepArgs => {
    const effect = db.getWorkflowEffect(step.runId, step.seq);
    if (!effect?.result) {
      throw new Error(`Workflow step ${step.id} has no recorded spec.`);
    }
    return (effect.result as { spec: StepArgs }).spec;
  };

  const settleStep = (
    step: WorkflowStepRow,
    outcome: { result?: unknown; failure?: WorkflowFailure }
  ) => {
    const waiter = waiters.get(step.id);
    if (!waiter) {
      return;
    }
    waiters.delete(step.id);
    if (outcome.failure) {
      waiter.reject(outcome.failure);
    } else {
      waiter.resolve(outcome.result);
    }
  };

  /** A step's turn ended: record, retry on the same session, or fail. */
  const ended = async (
    run: WorkflowRunRow,
    step: WorkflowStepRow,
    error?: string
  ) => {
    if (!active(run) || step.status !== "running") {
      return;
    }
    const attempt = latest(step);
    if (!attempt || attempt.endedAt) {
      return;
    }
    const spec = specOf(step);
    clearTimer(step.id);
    attempt.endedAt = new Date();
    if (!error && attempt.result !== null) {
      step.status = "passed";
      step.result = attempt.result;
      step.endedAt = new Date();
      write(run, step, attempt);
      notify(
        run,
        `${workflowNoticeMarker(nameOf(run), `step ${spec.title} passed`)}${JSON.stringify(step.result, null, 2)}`
      );
      settleStep(step, { result: attempt.result });
      return;
    }
    attempt.failure = error ?? "no-result";
    if (attempt.number <= (spec.retries ?? 2)) {
      write(run, step, attempt);
      try {
        await attemptStep(run, step, spec, attempt.failure);
      } catch (failure) {
        await ended(run, step, reason(failure));
      }
      return;
    }
    step.status = "failed";
    step.failure = attempt.failure;
    step.endedAt = new Date();
    write(run, step, attempt);
    notify(
      run,
      `${workflowNoticeMarker(nameOf(run), `step ${spec.title} failed`)}${step.failure}`
    );
    settleStep(step, {
      failure: {
        name: "StepError",
        kind:
          attempt.failure === "no-result" ||
          attempt.failure === "attempt-timeout"
            ? attempt.failure
            : "harness-error",
        stepId: step.id,
        attempts: attempt.number,
        message: attempt.failure,
      },
    });
  };

  // ----------------------------------------------------------------- ask

  const parkAsk = (
    run: WorkflowRunRow,
    step: WorkflowStepRow,
    spec: {
      allowOther?: boolean;
      answeredBy?: "operator" | "supervisor";
      options: { description?: string; label: string }[];
      question: string;
      waitFor?: number;
    }
  ) => {
    deps.park({
      verb: "frames",
      machineId: run.machineId,
      instanceId: step.id,
      requestId: step.id,
      payload: {
        kind: "permission_request",
        instanceId: step.id,
        requestId: step.id,
        workflowRunId: run.id,
        workflowStepId: step.id,
        requestKind: "question",
        toolName: "AskUserQuestion",
        input: {
          questions: [
            {
              question: spec.question,
              header: spec.question.slice(0, 30),
              options: spec.options,
              multiSelect: false,
              allowOther: spec.allowOther ?? false,
            },
          ],
        },
        ...(spec.answeredBy === "supervisor" ? { routedTo: "parent" } : {}),
      },
    });
    if (spec.answeredBy === "supervisor") {
      notify(
        run,
        `${workflowNoticeMarker(nameOf(run), "question")}${spec.question}\n${JSON.stringify(spec.options)}\nAnswer with steer_workflow using action {type:"answer",stepId:"${step.id}",choice:"<label>"}.`
      );
    }
    if (spec.waitFor) {
      arm(
        run,
        step,
        (step.startedAt?.getTime() ?? Date.now()) + spec.waitFor * 3_600_000,
        true
      );
    }
  };

  const settleAsk = (
    run: WorkflowRunRow,
    step: WorkflowStepRow,
    outcome: { choice: string; note?: string } | WorkflowFailure
  ) => {
    deps.settle(step.id);
    clearTimer(step.id);
    const failed = "name" in outcome;
    step.status = failed ? "failed" : "passed";
    step.result = failed ? null : outcome;
    step.failure = failed ? outcome.message : null;
    step.endedAt = new Date();
    run.status = "running";
    write(run, step);
    settleStep(step, failed ? { failure: outcome } : { result: outcome });
  };

  // ------------------------------------------------------------- effects

  const stepRow = (
    run: WorkflowRunRow,
    seq: number,
    id: string,
    kind: "step" | "ask" | "workflow",
    nodeId: string
  ): WorkflowStepRow =>
    db.getWorkflowStep(id) ?? {
      id,
      runId: run.id,
      seq,
      nodeId,
      kind,
      status: "pending",
      instanceId: null,
      childRunId: null,
      result: null,
      failure: null,
      mapIndex: null,
      startedAt: null,
      endedAt: null,
    };

  /** Executes one effect for real and answers with its journaled outcome. */
  const execute = async (
    run: WorkflowRunRow,
    seq: number,
    kind: WorkflowEffectKind,
    args: Record<string, unknown>

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the effect kinds are one dispatch table sharing the run, journal and waiter tables
  ): Promise<{ result?: unknown; failure?: WorkflowFailure }> => {
    switch (kind) {
      case "run":
      case "spawn": {
        const spec = args as unknown as StepArgs;
        const id = stepIdOf(run.id, seq);
        const step = stepRow(run, seq, id, "step", spec.node ?? `seq-${seq}`);
        db.putWorkflowEffect({
          runId: run.id,
          seq,
          kind,
          argsHash: hashArgs(args),
          args: null,
          result: { spec },
          failure: null,
          at: new Date(),
        });
        const settled = new Promise<{
          result?: unknown;
          failure?: WorkflowFailure;
        }>((resolve) => {
          waiters.set(id, {
            runId: run.id,
            resolve: (value) => resolve({ result: value }),
            reject: (failure) => resolve({ failure }),
          });
        });
        await attemptStep(run, step, spec);
        return await settled;
      }
      case "ask": {
        const spec = args as unknown as Parameters<typeof parkAsk>[2];
        const id = stepIdOf(run.id, seq);
        const step = stepRow(run, seq, id, "ask", `seq-${seq}`);
        // The question is journaled *before* it parks: a waiting run must be
        // answerable from the rows alone, with no worker and no graph.
        db.putWorkflowEffect({
          runId: run.id,
          seq,
          kind,
          argsHash: hashArgs(args),
          args: journalArgs(kind, args),
          result: null,
          failure: null,
          at: new Date(),
        });
        step.status = "waiting";
        step.startedAt ??= new Date();
        run.status = "waiting";
        write(run, step);
        const settled = new Promise<{
          result?: unknown;
          failure?: WorkflowFailure;
        }>((resolve) => {
          waiters.set(id, {
            runId: run.id,
            resolve: (value) => resolve({ result: value }),
            reject: (failure) => resolve({ failure }),
          });
        });
        parkAsk(run, step, spec);
        return await settled;
      }
      case "exec": {
        const { exitCode, output } = await deps.command(
          run.machineId,
          run.workspace,
          String(args.cmd),
          args.timeoutMinutes === undefined
            ? undefined
            : Number(args.timeoutMinutes) * 60_000
        );
        return { result: { code: exitCode, output } };
      }
      case "exists": {
        const path = String(args.path).replaceAll("'", "'\\''");
        const { exitCode } = await deps.command(
          run.machineId,
          run.workspace,
          `test -e '${path}'`
        );
        return { result: exitCode === 0 };
      }
      case "workflow": {
        const childId = stepIdOf(run.id, seq);
        const step = stepRow(
          run,
          seq,
          `step-${childId}`,
          "workflow",
          `seq-${seq}`
        );
        step.status = "running";
        step.startedAt ??= new Date();
        step.childRunId = childId;
        write(run, step);
        const settled = new Promise<{
          result?: unknown;
          failure?: WorkflowFailure;
        }>((resolve) => {
          waiters.set(childId, {
            runId: run.id,
            resolve: (value) => resolve({ result: value }),
            reject: (failure) => resolve({ failure }),
          });
        });
        await runtime.launch(String(args.slug), {
          id: childId,
          inputs: args.inputs as Record<string, unknown>,
          workspace: { path: run.workspace, machineId: run.machineId },
          supervisor: run.supervisorInstanceId
            ? { instanceId: run.supervisorInstanceId }
            : undefined,
          parentRunId: run.id,
          parentStepId: step.id,
        });
        const outcome = await settled;
        step.status = outcome.failure ? "failed" : "passed";
        step.result = outcome.result ?? null;
        step.failure = outcome.failure?.message ?? null;
        step.endedAt = new Date();
        write(run, step);
        return outcome;
      }
      case "state-get": {
        // Reading a slot declares it: the step sessions' state tools refuse a
        // name the program never named.
        run.state = {
          ...run.state,
          schemas: {
            ...((run.state.schemas ?? {}) as Record<string, unknown>),
            [String(args.name)]: args.schema,
          },
        };
        write(run);
        const slots = (run.state.slots ?? {}) as Record<string, unknown>;
        return { result: slots[String(args.name)] ?? null };
      }
      case "state-set": {
        const validate = ajv.compile(args.schema as Record<string, unknown>);
        if (!validate(args.value)) {
          throw new Error(ajv.errorsText(validate.errors));
        }
        run.state = {
          ...run.state,
          schemas: {
            ...((run.state.schemas ?? {}) as Record<string, unknown>),
            [String(args.name)]: args.schema,
          },
          slots: {
            ...((run.state.slots ?? {}) as Record<string, unknown>),
            [String(args.name)]: args.value,
          },
        };
        write(run);
        return { result: null };
      }
      case "checkpoint": {
        const checkpoint = {
          label: String(args.label),
          data: args.data ?? null,
        };
        write(run, undefined, undefined, checkpoint);
        notify(
          run,
          `${workflowNoticeMarker(nameOf(run), `checkpoint ${checkpoint.label}`)}${JSON.stringify(checkpoint.data, null, 2)}`
        );
        return { result: checkpoint };
      }
      case "sleep": {
        const due = Date.now() + Number(args.ms);
        db.putWorkflowEffect({
          runId: run.id,
          seq,
          kind,
          argsHash: hashArgs(args),
          args: journalArgs(kind, args),
          result: { due },
          failure: null,
          at: new Date(),
        });
        await sleepUntil(run.id, seq, due);
        return { result: { due } };
      }
      case "now":
        return { result: Date.now() };
      case "notify": {
        const text = `${workflowNoticeMarker(nameOf(run), "note")}${String(args.text)}`;
        if (run.supervisorInstanceId) {
          notify(run, text);
        } else {
          deps.notifyUser(text);
        }
        return { result: null };
      }
      case "notes": {
        const notes = (run.state.__notes as string[] | undefined) ?? [];
        run.state = { ...run.state, __notes: [] };
        write(run);
        return { result: notes };
      }
      case "log":
        return { result: { text: String(args.text) } };
      case "trace":
        return { result: { edgeId: args.edgeId, scope: args.scope } };
      default:
        throw new Error(`Unknown workflow effect ${kind}.`);
    }
  };

  const sleepUntil = (runId: string, seq: number, due: number) =>
    new Promise<void>((resolve) => {
      const key = `sleep:${runId}:${seq}`;
      waiters.set(key, {
        runId,
        resolve: () => resolve(),
        reject: () => resolve(),
      });
      timers.set(
        key,
        setTimeout(
          () => {
            timers.delete(key);
            waiters.delete(key);
            resolve();
          },
          Math.max(1, due - Date.now())
        )
      );
    });

  /** The step row id a `run`/`spawn`/`ask`/`workflow` effect at `seq` owns. */
  const stepIdOf = stepIdFor;

  /**
   * The replay rule (§13.3): a journaled effect answers from the journal; a
   * mismatch at a sequence fails the run; anything else runs live and is
   * journaled.
   */
  /**
   * The replay rule (§13.3): a journaled effect answers from the journal; a
   * mismatch at a sequence fails the run; anything else runs live.
   */
  const decide = (
    runId: string,
    message: Extract<WorkerOut, { type: "effect" }>,
    argsHash: string
  ): {
    reply?: { failure?: WorkflowFailure; result?: unknown };
    run?: WorkflowRunRow;
    sleepUntil?: number;
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the replay rule is one decision over journal presence, kind, hash and settledness
  } => {
    const run = runOf(runId);
    if (!active(run)) {
      return {};
    }
    const journaled = db.getWorkflowEffect(runId, message.seq);
    if (
      journaled &&
      (journaled.kind !== message.kind || journaled.argsHash !== argsHash)
    ) {
      finish(
        run,
        "failed",
        journaled.kind === message.kind
          ? `nondeterministic: effect ${message.seq} is the same ${message.kind} call with different arguments than the journal records.`
          : `nondeterministic: effect ${message.seq} was ${journaled.kind} on the first run and is ${message.kind} now.`
      );
      return {};
    }
    const settledBefore =
      journaled &&
      (journaled.failure !== null ||
        !["run", "spawn", "ask", "workflow", "sleep"].includes(journaled.kind));
    if (settledBefore) {
      return {
        reply: journaled.failure
          ? { failure: JSON.parse(journaled.failure) as WorkflowFailure }
          : {
              result:
                journaled.kind === "run" || journaled.kind === "spawn"
                  ? (journaled.result as { value: unknown }).value
                  : journaled.result,
            },
      };
    }
    if (journaled?.result && journaled.kind === "sleep") {
      const { due } = journaled.result as { due: number };
      return due <= Date.now()
        ? { reply: { result: journaled.result } }
        : { run, sleepUntil: due };
    }
    if (
      journaled &&
      ["run", "spawn"].includes(journaled.kind) &&
      db.getWorkflowStep(stepIdOf(runId, message.seq))?.status === "passed"
    ) {
      return { reply: { result: stepOf(stepIdOf(runId, message.seq)).result } };
    }
    return { run };
  };

  const onEffect = async (
    runId: string,
    message: Extract<WorkerOut, { type: "effect" }>
  ) => {
    const live = workers.get(runId);
    const reply = (payload: {
      failure?: WorkflowFailure;
      result?: unknown;
    }) => {
      if (workers.get(runId) !== live) {
        return;
      }
      live?.worker.postMessage(
        payload.failure
          ? { type: "effect-error", id: message.id, failure: payload.failure }
          : { type: "effect-result", id: message.id, result: payload.result }
      );
    };
    const argsHash = hashArgs(message.args);
    // Only the replay decision is serialised per run. Executing an effect —
    // a step that runs for an hour, an ask that waits for a person — must not
    // hold the lock, or the very frames that settle it queue behind it.
    const decided = await serial(runId, () => decide(runId, message, argsHash));
    if (decided.reply) {
      reply(decided.reply);
      return;
    }
    if (!decided.run) {
      return;
    }
    const { run } = decided;
    if (decided.sleepUntil !== undefined) {
      await sleepUntil(runId, message.seq, decided.sleepUntil);
      reply({ result: { due: decided.sleepUntil } });
      return;
    }
    const kind = message.kind as WorkflowEffectKind;
    let outcome: { failure?: WorkflowFailure; result?: unknown };
    try {
      outcome = await execute(
        run,
        message.seq,
        kind,
        (message.args ?? {}) as Record<string, unknown>
      );
    } catch (error) {
      outcome = { failure: { name: "Error", message: reason(error) } };
    }
    await serial(runId, () => {
      const stored = db.getWorkflowEffect(runId, message.seq);
      db.putWorkflowEffect({
        runId,
        seq: message.seq,
        kind,
        argsHash,
        args:
          stored?.args ??
          journalArgs(kind, (message.args ?? {}) as Record<string, unknown>),
        result: journalResult(kind, stored, outcome),
        failure: outcome.failure ? JSON.stringify(outcome.failure) : null,
        at: stored?.at ?? new Date(),
      });
    });
    reply(outcome);
  };

  /** Starts (or restarts) the worker for a run and replays its journal. */
  const startWorker = (run: WorkflowRunRow) => {
    killWorker(run.id);
    const path = writeProgram(run.program);
    const worker = new Worker(
      new URL("../../../core/src/workflow-worker.ts", import.meta.url).href,
      { type: "module" }
    );
    const live = { worker };
    workers.set(run.id, live);
    worker.addEventListener("message", (event: MessageEvent<WorkerOut>) => {
      const message = event.data;
      if (message.type === "effect") {
        onEffect(run.id, message).catch((error) => {
          const current = db.getWorkflowRun(run.id);
          if (current && active(current)) {
            finish(current, "failed", reason(error));
          }
        });
        return;
      }
      if (message.type === "done" || message.type === "failed") {
        serial(run.id, () => {
          const current = db.getWorkflowRun(run.id);
          if (!(current && active(current))) {
            return;
          }
          if (message.type === "done") {
            finish(current, "done", null, message.result);
          } else {
            finish(
              current,
              "failed",
              message.failure.kind
                ? `${message.failure.kind}: ${message.failure.message}`
                : message.failure.message
            );
          }
        }).catch(console.error);
      }
    });
    worker.addEventListener("error", (event) => {
      serial(run.id, () => {
        const current = db.getWorkflowRun(run.id);
        if (current && active(current)) {
          finish(current, "failed", String(event.message ?? event));
        }
      }).catch(console.error);
    });
    worker.postMessage({
      mode: "run",
      path,
      runId: run.id,
      inputs: run.inputs,
    } satisfies WorkerStart);
  };

  // --------------------------------------------------------------- public

  const runtime = {
    effects: (runId: string) => db.listWorkflowEffects(runId),
    instanceLive(instanceId: string) {
      const [instance] = db.getInstancesByIds([instanceId]);
      if (instance?.workflowRunId && instance.workflowStepId) {
        const run = db.getWorkflowRun(instance.workflowRunId);
        if (run && !active(run)) {
          stopStep(run, stepOf(instance.workflowStepId));
        }
      }
    },
    specFor(stepId: string) {
      const spec = specOf(stepOf(stepId));
      const run = runOf(stepOf(stepId).runId);
      return {
        skills: spec.skills,
        denyTools:
          spec.harness === "claude"
            ? [
                ...(spec.denyTools ?? []),
                ...(run.supervisorInstanceId ? [] : ["AskUserQuestion"]),
              ]
            : undefined,
      };
    },
    /** The named slots a program declared, for the step-facing state tools. */
    stateSchemas(runId: string) {
      return (db.getWorkflowRun(runId)?.state.schemas ?? {}) as Record<
        string,
        Record<string, unknown>
      >;
    },
    readState(runId: string, name: string) {
      const run = runOf(runId);
      const schemas = (run.state.schemas ?? {}) as Record<string, unknown>;
      if (!Object.hasOwn(schemas, name)) {
        throw new Error(
          `This workflow's program never declared a state slot called ${name}. Declared: ${Object.keys(schemas).join(", ") || "none"}.`
        );
      }
      return ((run.state.slots ?? {}) as Record<string, unknown>)[name];
    },
    writeState(runId: string, name: string, value: unknown) {
      return serial(runId, () => {
        const run = runOf(runId);
        const schemas = (run.state.schemas ?? {}) as Record<
          string,
          Record<string, unknown>
        >;
        const schema = schemas[name];
        if (!schema) {
          throw new Error(
            `This workflow's program never declared a state slot called ${name}. Declared: ${Object.keys(schemas).join(", ") || "none"}.`
          );
        }
        const validate = ajv.compile(schema);
        if (!validate(value)) {
          throw new Error(ajv.errorsText(validate.errors, { separator: "\n" }));
        }
        run.state = {
          ...run.state,
          slots: {
            ...((run.state.slots ?? {}) as Record<string, unknown>),
            [name]: value,
          },
        };
        write(run);
        return `Recorded ${name}.`;
      });
    },
    detail(id: string) {
      const run = runOf(id);
      const steps = db.listWorkflowSteps(id);
      const ask = askOf(run);
      return {
        ...publicRun(run, db.listWorkflowEffects(id)),
        steps,
        attempts: steps.flatMap((step) => db.listWorkflowAttempts(step.id)),
        ...(ask ? { ask } : {}),
      };
    },
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: launch refuses bad inputs, depth and supervision before pinning the program and seeding a re-run journal
    async launch(
      workflowId: string,
      options: {
        id?: string;
        inputs?: Record<string, unknown>;
        workspace?: { path: string; machineId: string };
        supervisor?: { instanceId: string } | { delegateType: string } | null;
        launchedBy?: string;
        rerunOfRunId?: string;
        /** A copied journal prefix, for a re-run (§3.9). */
        seed?: WorkflowEffectRow[];
        parentRunId?: string;
        parentStepId?: string | null;
      }
    ): Promise<{ runId: string }> {
      const workflow = db.getWorkflow(workflowId);
      if (!workflow) {
        throw new Error(`No workflow ${workflowId}.`);
      }
      if (workflow.graph) {
        const problems = deps.problems(workflow.graph, workflow.id);
        if (problems.length) {
          throw new Error(
            problems.map((problem) => problem.message).join("\n")
          );
        }
      }
      let chosen = options.supervisor;
      if (chosen === undefined && !options.parentRunId) {
        chosen = workflow.graph?.settings?.defaultSupervisor;
      }
      if (
        !(options.workspace?.path && deps.online(options.workspace.machineId))
      ) {
        throw new Error("Choose a workspace directory on a connected machine.");
      }
      const declared = workflow.inputs;
      const inputs = { ...options.inputs };
      for (const input of declared) {
        if (inputs[input.name] === undefined && input.default !== undefined) {
          inputs[input.name] = input.default;
        }
        if (
          input.required &&
          (inputs[input.name] === undefined || inputs[input.name] === "")
        ) {
          throw new Error(`Input ${input.name} is required.`);
        }
        if (
          input.type === "select" &&
          inputs[input.name] !== undefined &&
          !input.options?.includes(String(inputs[input.name]))
        ) {
          throw new Error(`Input ${input.name} must be one of its options.`);
        }
      }
      const id = options.id ?? crypto.randomUUID();
      let depth = 1;
      for (
        let ancestor = options.parentRunId;
        ancestor;
        ancestor = runOf(ancestor).parentRunId ?? undefined
      ) {
        depth += 1;
      }
      if (depth > 8) {
        throw new Error("workflow-depth");
      }
      let supervisorInstanceId: string | null = null;
      if (chosen && "instanceId" in chosen) {
        const [instance] = db.getInstancesByIds([chosen.instanceId]);
        if (
          !(
            instance &&
            deps.online(instance.machineId) &&
            ["running", "starting"].includes(instance.status)
          )
        ) {
          throw new Error("The supervisor must be a live session.");
        }
        supervisorInstanceId = instance.id;
      } else if (chosen) {
        supervisorInstanceId = await deps.supervisor(
          chosen.delegateType,
          options.workspace.path,
          options.workspace.machineId,
          `${workflowNoticeMarker(workflow.name, "supervisor brief")}Supervise workflow ${workflow.name}, run ${id}.\n${workflow.description}\nReceive its reports and answer its questions. Use steer_workflow for note, retry, answer, or cancel; the program controls routing.`
        );
      }
      const run: WorkflowRunRow = {
        id,
        workflowId: workflow.id,
        graph: workflow.graph,
        program: workflow.program,
        inputs,
        workspace: options.workspace.path,
        machineId: options.workspace.machineId,
        supervisorInstanceId,
        status: "running",
        result: null,
        failure: null,
        state: {},
        startedAt: new Date(),
        endedAt: null,
        rerunOfRunId: options.rerunOfRunId ?? null,
        parentRunId: options.parentRunId ?? null,
        parentStepId: options.parentStepId ?? null,
        launchedBy: options.launchedBy ?? "dashboard",
      };
      write(run);
      for (const effect of options.seed ?? []) {
        db.putWorkflowEffect({ ...effect, runId: id });
      }
      startWorker(run);
      return { runId: id };
    },
    /**
     * Re-run: a new run whose journal starts as a copy of the old one up to
     * the chosen step, so the program replays every earlier effect from the
     * record and executes live from there (§3.9 in the program model).
     */
    async rerun(runId: string, fromStepId?: string) {
      const old = runOf(runId);
      const until = fromStepId ? stepOf(fromStepId).seq : 0;
      const started = await runtime.launch(old.workflowId, {
        inputs: old.inputs,
        workspace: { path: old.workspace, machineId: old.machineId },
        supervisor: old.supervisorInstanceId
          ? { instanceId: old.supervisorInstanceId }
          : undefined,
        rerunOfRunId: old.id,
        seed: db
          .listWorkflowEffects(old.id)
          .filter((effect) => effect.seq < until),
      });
      return started;
    },
    submitResult(stepId: string, instanceId: string, result: unknown) {
      const step = stepOf(stepId);
      const run = runOf(step.runId);
      const [instance] = db.getInstancesByIds([instanceId]);
      if (
        !instance ||
        instance.workflowStepId !== step.id ||
        step.instanceId !== instanceId
      ) {
        throw new Error("This instance does not own the workflow step.");
      }
      if (!active(run) || step.status !== "running") {
        throw new Error("This workflow step is not running.");
      }
      const attempt = latest(step);
      if (!attempt || attempt.endedAt) {
        throw new Error("There is no active attempt.");
      }
      if (attempt.result !== null) {
        throw new Error("A result was already recorded. End your turn now.");
      }
      const validate = ajv.compile(specOf(step).outputSchema);
      if (!validate(result)) {
        throw new Error(ajv.errorsText(validate.errors, { separator: "\n" }));
      }
      attempt.result = result;
      write(run, step, attempt);
      return "Recorded. End your turn now.";
    },
    observe(instanceId: string, error?: string) {
      const [instance] = db.getInstancesByIds([instanceId]);
      if (!(instance?.workflowStepId && instance.workflowRunId)) {
        return false;
      }
      const { workflowRunId, workflowStepId } = instance;
      const observedAttempt = latest(stepOf(workflowStepId))?.id;
      serial(workflowRunId, async () => {
        const step = stepOf(workflowStepId);
        if (latest(step)?.id !== observedAttempt) {
          return;
        }
        await ended(runOf(workflowRunId), step, error);
      }).catch(console.error);
      return true;
    },
    cancel(id: string) {
      return serial(id, () => {
        const run = runOf(id);
        if (!active(run)) {
          throw new Error("This workflow run has already ended.");
        }
        finish(run, "cancelled");
        return publicRun(run, db.listWorkflowEffects(id));
      });
    },
    answer(id: string, stepId: string, choice: string, note?: string) {
      return serial(id, () => {
        const run = runOf(id);
        const step = stepOf(stepId);
        if (step.runId !== id || step.status !== "waiting" || !active(run)) {
          throw new Error("This workflow step is not waiting for an answer.");
        }
        settleAsk(run, step, { choice, ...(note ? { note } : {}) });
      });
    },
    settleQuestion(stepId: string, result: PermissionResult) {
      const step = db.getWorkflowStep(stepId);
      if (step?.kind !== "ask") {
        return false;
      }
      serial(step.runId, () => {
        const run = runOf(step.runId);
        if (!active(run)) {
          return;
        }
        if (result.behavior === "deny") {
          finish(run, "cancelled");
          return;
        }
        const answers = (
          result.updatedInput as
            | { answers?: Record<string, string> }
            | undefined
        )?.answers;
        const choice = answers && Object.values(answers)[0];
        if (!choice) {
          throw new Error("A workflow question needs a choice.");
        }
        settleAsk(run, stepOf(step.id), { choice });
      }).catch(console.error);
      return true;
    },
    steer(id: string, action: WorkflowAction, caller?: string) {
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: four bounded supervisor actions each enforce their own run and step state
      return serial(id, async () => {
        const run = runOf(id);
        if (caller && caller !== run.supervisorInstanceId) {
          throw new Error("Only this workflow run's supervisor may steer it.");
        }
        switch (action.type) {
          case "note": {
            if (!active(run)) {
              throw new Error("This workflow run has ended.");
            }
            run.state = {
              ...run.state,
              __notes: [
                ...((run.state.__notes as string[] | undefined) ?? []),
                action.text,
              ],
            };
            write(run);
            break;
          }
          case "cancel":
            if (!active(run)) {
              throw new Error("This workflow run has already ended.");
            }
            finish(run, "cancelled");
            break;
          case "answer": {
            const step = stepOf(action.stepId);
            if (step.runId !== id || step.status !== "waiting") {
              throw new Error("That step is not waiting for an answer.");
            }
            settleAsk(run, step, {
              choice: action.choice,
              ...(action.note ? { note: action.note } : {}),
            });
            break;
          }
          case "retry": {
            const step = stepOf(action.stepId);
            if (step.runId !== id || step.status !== "failed" || !active(run)) {
              throw new Error(
                "Retry requires a failed step of a live workflow run."
              );
            }
            step.status = "running";
            step.failure = null;
            step.endedAt = null;
            write(run, step);
            await attemptStep(run, step, specOf(step), "retry");
            break;
          }
          default:
            throw new Error(
              "Steering supports note, retry, answer, and cancel only."
            );
        }
        return publicRun(run, db.listWorkflowEffects(id));
      });
    },
    /**
     * A machine came back. Live attempts keep their timeout, dead ones end,
     * parked questions are re-parked, and every active run's worker is
     * re-created so the program replays to where it left off.
     */
    recover(machineId: string) {
      for (const row of db
        .listWorkflowRuns()
        .filter((run) => active(run) && run.machineId === machineId)) {
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: recovery distinguishes live attempts, dead sessions and parked questions before restarting the worker
        serial(row.id, async () => {
          const run = runOf(row.id);
          for (const step of db.listWorkflowSteps(run.id)) {
            if (step.status === "waiting" && step.kind === "ask") {
              continue;
            }
            if (step.status !== "running" || !step.instanceId) {
              continue;
            }
            const [instance] = db.getInstancesByIds([step.instanceId]);
            if (
              instance &&
              ["sleeping", "error", "stopped"].includes(instance.status)
            ) {
              // biome-ignore lint/performance/noAwaitInLoops: each dead attempt must settle before the next is examined
              await ended(
                run,
                step,
                instance.lastError ??
                  "Session stopped before the attempt completed."
              );
            }
          }
          if (!workers.has(run.id)) {
            startWorker(run);
          }
        }).catch(console.error);
      }
    },
    /** Every active run gets its worker back at hub start. */
    resumeAll() {
      for (const run of db.listWorkflowRuns().filter(active)) {
        if (!workers.has(run.id)) {
          serial(run.id, () => startWorker(runOf(run.id))).catch(console.error);
        }
      }
    },
  };
  return runtime;
}

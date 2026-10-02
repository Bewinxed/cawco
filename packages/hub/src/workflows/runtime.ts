/**
 * The workflow runtime (proposal §13.3): runs, their steps and questions, and
 * the hub side of every `w.*` call. The workflow engine (`./engine`) owns a
 * run's execution and its durability; this module is what it performs calls
 * against — commands, Jev, state, step sessions, questions, child runs — and
 * everything the dashboard and the supervisor see of a run: its rows, its
 * log, and the receipts its supervisor is sent.
 */
import type {
  CommandResult,
  Envelope,
  PermissionResult,
  Problem,
  SpawnPayload,
  WorkflowAction,
  WorkflowAsk,
  WorkflowEffectKind,
  WorkflowFailure,
  WorkflowGraph,
  WorkflowInput,
  WorkflowRun,
} from "@cawco/core";
import { workflowNoticeMarker } from "@cawco/core";
import type { StepSpecJson } from "@cawco/core/workflow-program";
import {
  failureOf,
  type JevSpec,
  stepIdFor,
} from "@cawco/core/workflow-program";
import Ajv from "ajv";
import type {
  DbShape,
  WorkflowAttemptRow,
  WorkflowLogRow,
  WorkflowRow,
  WorkflowRunRow,
  WorkflowStepRow,
} from "../db";
import { askJev } from "../jev";
import { createWorkflowEngine, type Outcome } from "./engine";
import {
  expandRefs,
  expandRefsDeep,
  failureText,
  readSlice,
  receiptOf,
  valueAt,
} from "./refs";
import { createSteps, durationText, stepError } from "./steps";

/** A workflow waits on Jev longer than a meaning rule does. */
const WORKFLOW_JEV_TIMEOUT_MS = 60_000;

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
  ) => Promise<CommandResult>;
  db: DbShape;
  /** The hub's SQLite file, which the workflow engine stores its messages in. */
  dbPath: string;
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

/** What an `ask` call carried across the worker boundary. */
interface AskArgs {
  allowOther?: boolean;
  answeredBy?: "operator" | "supervisor";
  answerSchema?: Record<string, unknown>;
  options?: { description?: string; label: string }[];
  question?: string;
  waitFor?: number;
}

/** How a run is launched: from the dashboard, a supervisor, or a parent run. */
export interface LaunchOptions {
  id?: string;
  inputs?: Record<string, unknown>;
  launchedBy?: string;
  parentRunId?: string;
  parentStepId?: string | null;
  /**
   * A re-run from a step: every call before effect `before` is answered with
   * what run `runId` got there, and the run goes live from that step on.
   */
  rerunFrom?: RerunFrom;
  rerunOfRunId?: string;
  supervisor?: { instanceId: string } | { delegateType: string } | null;
  workspace?: { path: string; machineId: string };
}

/** Where a re-run's own calls start: kept in its state as `__rerun`. */
interface RerunFrom {
  before: number;
  runId: string;
}

/** Calls whose result comes later: a step, a question, a sleep, a child run. */
const WAITS: ReadonlySet<WorkflowEffectKind> = new Set([
  "run",
  "spawn",
  "ask",
  "sleep",
  "workflow",
]);

const active = (run: WorkflowRunRow) =>
  run.status === "running" || run.status === "waiting";
const reason = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * What a run's log keeps of a call's arguments: enough for the run view to
 * say what was asked, run, stored or slept on. A step keeps its whole spec;
 * the schemas a `state` call carries are the program's business.
 */
const loggedArgs = (
  kind: WorkflowEffectKind,
  args: Record<string, unknown>
): Record<string, unknown> | null => {
  const keep = (...names: string[]) =>
    Object.fromEntries(
      names.filter((name) => args[name] !== undefined).map((n) => [n, args[n]])
    );
  switch (kind) {
    case "run":
    case "spawn":
      return args;
    case "ask":
      return keep(
        "question",
        "options",
        "allowOther",
        "answeredBy",
        "waitFor",
        "answerSchema"
      );
    case "exec":
      return keep("cmd", "timeoutMinutes");
    case "exists":
      return keep("path");
    case "jev":
      return keep("node", "state", "questions", "model");
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

/**
 * `run.edges` / `run.loops` (§7.2a), read off the `trace` calls in the run's
 * log. A code-origin run traces nothing, so both are empty and the dashboard
 * lays its graph out from the log instead.
 */
export function publicRun(
  run: WorkflowRunRow,
  log: WorkflowLogRow[]
): PublicRun {
  const edges: Record<string, Record<string, "fired" | "skipped">> = {};
  const loops: Record<string, Record<string, number>> = {};
  for (const entry of log) {
    if (entry.kind !== "trace") {
      continue;
    }
    const { edgeId, scope } = (entry.result ?? {}) as {
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

/**
 * The notice a supervisor-answered question sends: the question, its options,
 * the typed answer's schema if it has one, and the exact call that answers it.
 */
function questionNotice(
  workflow: string,
  run: WorkflowRunRow,
  step: WorkflowStepRow,
  spec: AskArgs
): string {
  const options = spec.options ?? [];
  const labels = options.map((option) => option.label).join(" | ") || "none";
  const other = spec.allowOther ? " (or any other answer)" : "";
  const schema = spec.answerSchema
    ? `\nTyped answer schema: ${JSON.stringify(spec.answerSchema)}`
    : "";
  let how = 'choice: "<label>"';
  if (spec.answerSchema) {
    how = `value: <a value matching the schema above>${options.length ? ', choice: "<label>"' : ""}`;
  }
  return `${workflowNoticeMarker(workflow, "question")}run ${run.id} · step ${step.id}\n${spec.question ?? ""}\nOptions: ${labels}${other}${schema}\nAnswer with steer_workflow {runId: "${run.id}", action: {type: "answer", stepId: "${step.id}", ${how}}}.`;
}

/** An answer to a question: the option picked, a note, a typed value. */
interface Answer {
  choice?: string;
  note?: string;
  value?: unknown;
}

/**
 * A reply in words, as the question takes it: a typed question's reply is its
 * value as JSON; any other question's is the option picked or the words given.
 */
function answerOf(spec: AskArgs, reply: string): Answer {
  if (!spec.answerSchema) {
    return { choice: reply };
  }
  try {
    return { value: JSON.parse(reply) as unknown };
  } catch (error) {
    throw new Error(
      `This question takes a JSON value matching ${JSON.stringify(spec.answerSchema)}; the reply is not JSON.`,
      { cause: error }
    );
  }
}

/** A launch's inputs: defaults filled, every required one present, selects in range. */
function resolveInputs(
  declared: WorkflowInput[],
  given: Record<string, unknown> | undefined
): Record<string, unknown> {
  const inputs = { ...given };
  for (const input of declared) {
    if (inputs[input.name] === undefined && input.default !== undefined) {
      inputs[input.name] = input.default;
    }
    const value = inputs[input.name];
    if (input.required && (value === undefined || value === "")) {
      throw new Error(`Input ${input.name} is required.`);
    }
    if (
      input.type === "select" &&
      value !== undefined &&
      !input.options?.includes(String(value))
    ) {
      throw new Error(`Input ${input.name} must be one of its options.`);
    }
  }
  return inputs;
}

export function createWorkflowRuntime(deps: WorkflowRuntimeDeps) {
  const { db } = deps;
  const ajv = new Ajv({ allErrors: true, strict: false });
  const locks = new Map<string, Promise<unknown>>();

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
  /** A step of run `runId`; any other step is refused. */
  const runStep = (runId: string, stepId: string) => {
    const step = stepOf(stepId);
    if (step.runId !== runId) {
      throw new Error("That step is not part of this workflow run.");
    }
    return step;
  };
  const nameOf = (run: WorkflowRunRow) =>
    db.getWorkflow(run.workflowId)?.name ?? run.workflowId;
  /**
   * The question a waiting run is parked on, read off the rows: the waiting
   * `ask` step and the spec it was opened with. A code-origin run has no graph
   * to read the question from, so this is the only source.
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
    const spec = (step.spec ?? {}) as AskArgs;
    return {
      stepId: step.id,
      question: spec.question ?? "",
      options: spec.options ?? [],
      allowOther: spec.allowOther ?? false,
      answeredBy: spec.answeredBy ?? "operator",
      ...(spec.answerSchema ? { answerSchema: spec.answerSchema } : {}),
      parkedAt: step.startedAt ?? run.startedAt,
    };
  };
  const announce = (
    run: WorkflowRunRow,
    step?: WorkflowStepRow,
    attempt?: WorkflowAttemptRow,
    checkpoint?: { data: unknown; label: string }
  ) =>
    deps.broadcast({
      runId: run.id,
      run: publicRun(run, db.listWorkflowLog(run.id)),
      step,
      attempt,
      checkpoint,
      ask: askOf(run),
    });
  const write = (
    run: WorkflowRunRow,
    step?: WorkflowStepRow,
    attempt?: WorkflowAttemptRow,
    checkpoint?: { data: unknown; label: string }
  ) => {
    db.workflowTransition(run, step, attempt);
    announce(run, step, attempt, checkpoint);
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
          uuid: crypto.randomUUID(),
          message: { role: "user", content: body },
          parent_tool_use_id: null,
          origin: {
            kind: "peer",
            from: run.id,
            name: nameOf(run),
            fromSession: run.supervisorInstanceId ?? run.id,
          },
          ...(queued ? { shouldQuery: false } : {}),
        },
      },
    });
  };
  /** Whether a session is live now: its process up, its machine connected. */
  const isLive = (instanceId: string) => {
    const [instance] = db.getInstancesByIds([instanceId]);
    return Boolean(
      instance &&
        deps.online(instance.machineId) &&
        ["running", "starting"].includes(instance.status)
    );
  };
  const supervisorLive = (run: WorkflowRunRow) =>
    Boolean(run.supervisorInstanceId && isLive(run.supervisorInstanceId));

  /**
   * Sends the notices kept for supervisors that were not live, oldest first,
   * to each one that now is. A notice leaves the store once it is sent.
   */
  const flushNotices = () => {
    for (const notice of db.listWorkflowNotices()) {
      const run = db.getWorkflowRun(notice.runId);
      if (!(run && isLive(notice.instanceId))) {
        continue;
      }
      try {
        send(run, notice.instanceId, notice.body, true);
      } catch (error) {
        console.error(
          `[workflows] notice ${notice.id} for ${notice.instanceId} stays kept: ${reason(error)}`
        );
        continue;
      }
      db.deleteWorkflowNotice(notice.id);
    }
  };

  /**
   * A receipt or question for the run's supervisor, queued for its next turn.
   * One that finds the supervisor not live is kept, and sent, after any kept
   * before it, when the supervisor next is.
   */
  const notify = (run: WorkflowRunRow, body: string) => {
    const supervisor = run.supervisorInstanceId;
    if (!supervisor) {
      return;
    }
    if (!db.getInstancesByIds([supervisor]).length) {
      console.error(
        `[workflows] run ${run.id}'s supervisor ${supervisor} no longer exists; this notice has nobody to reach:\n${body}`
      );
      return;
    }
    db.queueWorkflowNotice({ instanceId: supervisor, runId: run.id, body });
    flushNotices();
  };

  // -------------------------------------------------------------------- log

  /** Records a call in the run's log, settled or not. */
  const logCall = (
    runId: string,
    seq: number,
    kind: WorkflowEffectKind,
    args: Record<string, unknown>,
    outcome?: Outcome
  ) => {
    db.putWorkflowLog({
      runId,
      seq,
      kind,
      args: loggedArgs(kind, args),
      result: outcome && "result" in outcome ? (outcome.result ?? null) : null,
      failure: outcome && "failure" in outcome ? outcome.failure : null,
      at: new Date(),
    });
  };
  /** A waited-on call settled: its log row gets what it came back with. */
  const settleLog = (runId: string, seq: number, outcome: Outcome) => {
    const row = db.getWorkflowLog(runId, seq);
    if (row) {
      db.putWorkflowLog({
        ...row,
        result: "result" in outcome ? (outcome.result ?? null) : null,
        failure: "failure" in outcome ? outcome.failure : null,
      });
    }
  };
  /**
   * The value `ref` N stands for: what the run's effect N came back with, or
   * its failure. One still waiting has nothing to read yet.
   */
  const refValue = (runId: string, seq: number): unknown => {
    const row = db.getWorkflowLog(runId, seq);
    if (!row) {
      throw new Error(`This run has no effect ${seq}.`);
    }
    if (row.failure) {
      return { failure: row.failure };
    }
    if (row.result === null && WAITS.has(row.kind) && row.kind !== "sleep") {
      const step =
        db.getWorkflowStep(stepIdFor(runId, seq)) ??
        db.getWorkflowStep(`step-${stepIdFor(runId, seq)}`);
      if (
        !step ||
        ["pending", "running", "waiting", "held"].includes(step.status)
      ) {
        throw new Error(
          `Effect ${seq} (${row.kind}) has not settled yet; it has no result to read.`
        );
      }
    }
    return row.result;
  };
  const expand = (run: WorkflowRunRow, text: string) =>
    expandRefs(text, (seq) => refValue(run.id, seq));

  // ------------------------------------------------------------------- steps

  const steps = createSteps({
    db,
    expand,
    halt: deps.halt,
    hold: (run, step, hold, ms) => {
      engine.hold(run.id, step.seq, hold, ms).catch((error) => {
        finish(
          runOf(run.id),
          "failed",
          `The workflow engine could not start step ${step.id}'s hold: ${reason(error)}`
        );
      });
    },
    nameOf,
    notify,
    send,
    serial,
    spawn: deps.spawn,
    stopSession: (run, instanceId) => {
      if (deps.online(run.machineId)) {
        deps.emit({
          verb: "stop",
          machineId: run.machineId,
          instanceId,
          payload: { instanceId },
        });
      }
    },
    supervisorLive,
    write,
    settled: (run, step, outcome) => {
      settleLog(run.id, step.seq, outcome);
      announce(run, step);
      engine.settle(run.id, step.seq, "step", outcome).catch((error) => {
        finish(
          runOf(run.id),
          "failed",
          `The workflow engine could not record step ${step.id}: ${reason(error)}`
        );
      });
    },
  });

  // --------------------------------------------------------------- questions

  const parkAsk = (run: WorkflowRunRow, step: WorkflowStepRow, tell = true) => {
    const spec = (step.spec ?? {}) as AskArgs;
    // A typed question is answered in words: the reply is its JSON value, so
    // the ledger entry always takes free text and says what shape it wants.
    const question = spec.answerSchema
      ? `${spec.question ?? ""}\nReply with JSON matching ${JSON.stringify(spec.answerSchema)}`
      : (spec.question ?? "");
    const options = spec.options ?? [];
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
              question,
              header: question.slice(0, 30),
              options,
              multiSelect: false,
              allowOther:
                Boolean(spec.answerSchema) || (spec.allowOther ?? false),
            },
          ],
        },
        ...(spec.answeredBy === "supervisor" ? { routedTo: "parent" } : {}),
      },
    });
    if (tell && spec.answeredBy === "supervisor") {
      notify(run, questionNotice(nameOf(run), run, step, spec));
    }
  };

  /** Whether any other question of the run is still waiting for an answer. */
  const stillWaiting = (run: WorkflowRunRow, except: string) =>
    db
      .listWorkflowSteps(run.id)
      .some(
        (row) =>
          row.kind === "ask" && row.status === "waiting" && row.id !== except
      );

  /** Refuses an answer the question cannot take, with the reason. */
  const checkAnswer = (step: WorkflowStepRow, answer: Answer) => {
    const spec = (step.spec ?? {}) as AskArgs;
    if (spec.answerSchema) {
      if (answer.value === undefined) {
        throw new Error(
          `This question takes a typed value matching ${JSON.stringify(spec.answerSchema)}.`
        );
      }
      const validate = ajv.compile(spec.answerSchema);
      if (!validate(answer.value)) {
        throw new Error(
          `The value does not match the question's schema: ${ajv.errorsText(validate.errors, { separator: "; " })}`
        );
      }
    } else if (answer.value !== undefined) {
      throw new Error(
        "This question takes a choice; it declared no typed value."
      );
    } else if (!answer.choice) {
      throw new Error("A workflow question needs a choice.");
    }
  };

  const settleAsk = (
    run: WorkflowRunRow,
    step: WorkflowStepRow,
    answer: Answer
  ) => {
    checkAnswer(step, answer);
    deps.settle(step.id);
    const result = {
      choice: answer.choice ?? "",
      ...(answer.note ? { note: answer.note } : {}),
      ...(answer.value === undefined ? {} : { value: answer.value }),
    };
    step.status = "passed";
    step.result = result;
    step.failure = null;
    step.endedAt = new Date();
    run.status = stillWaiting(run, step.id) ? "waiting" : "running";
    settleLog(run.id, step.seq, { result });
    write(run, step);
    engine.settle(run.id, step.seq, "ask", { result }).catch((error) => {
      finish(
        runOf(run.id),
        "failed",
        `The workflow engine could not record the answer to ${step.id}: ${reason(error)}`
      );
    });
  };

  // ------------------------------------------------------------------- finish

  /** Ends a run's execution in the engine; a failure to is logged, not thrown. */
  const interrupt = (runId: string) => {
    engine.interrupt(runId).catch((error) => {
      console.error(
        `[workflows] could not interrupt run ${runId}: ${reason(error)}`
      );
    });
  };

  /** Every step still open when its run ends: its session stopped, its row closed. */
  const closeSteps = (
    run: WorkflowRunRow,
    status: WorkflowRunRow["status"]
  ) => {
    for (const step of db.listWorkflowSteps(run.id)) {
      if (!["pending", "running", "waiting", "held"].includes(step.status)) {
        continue;
      }
      steps.stop(run, step);
      if (step.kind === "ask") {
        deps.settle(step.id);
      }
      step.status = step.status === "pending" ? "skipped" : "cancelled";
      step.endedAt = new Date();
      const attempt = db.listWorkflowAttempts(step.id).at(-1);
      if (attempt && !attempt.endedAt) {
        attempt.endedAt = new Date();
        attempt.failure = status;
      }
      write(run, step, attempt);
    }
  };

  /** A child run ended: the step its parent opened on it says how. */
  const reportToParent = (run: WorkflowRunRow) => {
    const parent = run.parentRunId && db.getWorkflowRun(run.parentRunId);
    const step = run.parentStepId && db.getWorkflowStep(run.parentStepId);
    if (!(parent && step) || step.status !== "running") {
      return;
    }
    const done = run.status === "done";
    step.status = done ? "passed" : "failed";
    step.result = done ? run.result : null;
    step.failure = done ? null : (run.failure ?? run.status);
    step.endedAt = new Date();
    settleLog(
      parent.id,
      step.seq,
      done
        ? { result: run.result }
        : {
            failure: {
              name: "ChildError",
              kind: run.status === "cancelled" ? "cancelled" : "failed",
              childRunId: run.id,
              message: run.failure ?? run.status,
            },
          }
    );
    write(parent, step);
  };

  const finish = (
    run: WorkflowRunRow,
    status: "done" | "failed" | "cancelled",
    failure: string | null = null,
    result: unknown = null
  ) => {
    if (!active(run)) {
      return;
    }
    run.status = status;
    run.failure = failure;
    run.result = result;
    run.endedAt = new Date();
    closeSteps(run, status);
    write(run);
    for (const child of db
      .listWorkflowRuns()
      .filter((entry) => entry.parentRunId === run.id && active(entry))) {
      finish(child, "cancelled");
      interrupt(child.id);
    }
    const took = durationText(Date.now() - run.startedAt.getTime());
    const outcome =
      status === "done"
        ? receiptOf(result, "result")
        : failureText(failure ?? status);
    notify(
      run,
      `${workflowNoticeMarker(nameOf(run), status)}run ${run.id} · ${took} · ${outcome}`
    );
    reportToParent(run);
  };

  // ------------------------------------------------------------------ launch

  /** How many runs deep a run started under `parentRunId` would be. */
  const depthUnder = (parentRunId: string | undefined) => {
    let depth = 1;
    for (
      let ancestor = parentRunId;
      ancestor;
      ancestor = runOf(ancestor).parentRunId ?? undefined
    ) {
      depth += 1;
    }
    return depth;
  };

  /** The session that supervises a new run: a live one named, or one spawned. */
  const supervisorFor = async (
    options: LaunchOptions,
    workflow: WorkflowRow,
    workspace: { path: string; machineId: string },
    runId: string
  ): Promise<string | null> => {
    // A top-level launch that names no supervisor takes the workflow's default.
    const chosen =
      options.supervisor === undefined && !options.parentRunId
        ? workflow.graph?.settings?.defaultSupervisor
        : options.supervisor;
    if (!chosen) {
      return null;
    }
    if ("instanceId" in chosen) {
      if (!isLive(chosen.instanceId)) {
        throw new Error("The supervisor must be a live session.");
      }
      return chosen.instanceId;
    }
    return await deps.supervisor(
      chosen.delegateType,
      workspace.path,
      workspace.machineId,
      `${workflowNoticeMarker(workflow.name, "supervisor brief")}Supervise workflow ${workflow.name}, run ${runId}.\n${workflow.description}\nYou receive a receipt for each step, checkpoint and the run's end: its status, attempt, time, a \`ref\`, and the result itself when it is 1,000 characters or less. Read more of a result only when you need it, with workflow_read {runId, ref, path}. Pass a result on to a later step as {{ref:N.path}} in what you hand the program; the hub fills it in when the step starts. A step that runs out of attempts is held for your decision, up to an hour: steer_workflow retry runs another attempt on the same session, fail hands the program the failure. Answer its questions and steer it with steer_workflow (note, retry, fail, answer, cancel); the program controls routing.`
    );
  };

  /**
   * A run's row, after every refusal launch owes: problems in the graph, a
   * bad input, too deep a call chain, a supervisor that is not live. The row
   * is written; its execution is not started.
   */
  const prepare = async (
    workflowId: string,
    options: LaunchOptions
  ): Promise<WorkflowRunRow> => {
    const workflow = db.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`No workflow ${workflowId}.`);
    }
    const problems = workflow.graph
      ? deps.problems(workflow.graph, workflow.id)
      : [];
    if (problems.length) {
      throw new Error(problems.map((problem) => problem.message).join("\n"));
    }
    const { workspace } = options;
    if (!(workspace?.path && deps.online(workspace.machineId))) {
      throw new Error("Choose a workspace directory on a connected machine.");
    }
    const inputs = resolveInputs(workflow.inputs, options.inputs);
    const id = options.id ?? crypto.randomUUID();
    if (depthUnder(options.parentRunId) > 8) {
      throw new Error("workflow-depth");
    }
    const supervisorInstanceId = await supervisorFor(
      options,
      workflow,
      workspace,
      id
    );
    const run: WorkflowRunRow = {
      id,
      workflowId: workflow.id,
      graph: workflow.graph,
      program: workflow.program,
      inputs,
      workspace: workspace.path,
      machineId: workspace.machineId,
      supervisorInstanceId,
      status: "running",
      result: null,
      failure: null,
      state: options.rerunFrom ? { __rerun: options.rerunFrom } : {},
      startedAt: new Date(),
      endedAt: null,
      rerunOfRunId: options.rerunOfRunId ?? null,
      parentRunId: options.parentRunId ?? null,
      parentStepId: options.parentStepId ?? null,
      launchedBy: options.launchedBy ?? "dashboard",
      seenAt: null,
    };
    write(run);
    return run;
  };

  // ------------------------------------------------------------------ calls

  /** `w.jev`: every question over one state, its refs filled first. */
  const jev = (run: WorkflowRunRow, args: Record<string, unknown>) => {
    const connection = db.getOpenRouterConnection();
    if (!connection) {
      throw new Error("Jev needs OpenRouter connected in Settings");
    }
    const spec = args as unknown as JevSpec;
    const state = expandRefsDeep(spec.state, (seq) =>
      refValue(run.id, seq)
    ) as JevSpec["state"];
    return askJev(connection.apiKey, state, spec.questions, {
      model: spec.model,
      timeoutMs: WORKFLOW_JEV_TIMEOUT_MS,
    });
  };

  /**
   * A state slot read (`value` absent) or written. Either declares the slot:
   * the step sessions' state tools refuse a name the program never named.
   */
  const slot = (
    run: WorkflowRunRow,
    args: Record<string, unknown>,
    writing: boolean
  ) => {
    const name = String(args.name);
    const slots = (run.state.slots ?? {}) as Record<string, unknown>;
    if (writing) {
      const validate = ajv.compile(args.schema as Record<string, unknown>);
      if (!validate(args.value)) {
        throw new Error(ajv.errorsText(validate.errors));
      }
    }
    run.state = {
      ...run.state,
      schemas: {
        ...((run.state.schemas ?? {}) as Record<string, unknown>),
        [name]: args.schema,
      },
      ...(writing ? { slots: { ...slots, [name]: args.value } } : {}),
    };
    write(run);
    return writing ? null : (slots[name] ?? null);
  };

  /** A call whose answer is immediate, performed for real. */
  const perform = async (
    run: WorkflowRunRow,
    kind: WorkflowEffectKind,
    args: Record<string, unknown>
  ): Promise<unknown> => {
    switch (kind) {
      case "exec": {
        const { exitCode, stdout, stderr } = await deps.command(
          run.machineId,
          run.workspace,
          String(args.cmd),
          args.timeoutMinutes === undefined
            ? undefined
            : Number(args.timeoutMinutes) * 60_000
        );
        return { code: exitCode, stdout, stderr };
      }
      case "exists": {
        const path = String(args.path).replaceAll("'", "'\\''");
        const { exitCode } = await deps.command(
          run.machineId,
          run.workspace,
          `test -e '${path}'`
        );
        return exitCode === 0;
      }
      case "jev":
        return await jev(run, args);
      case "state-get":
        return slot(run, args, false);
      case "state-set":
        return slot(run, args, true);
      case "checkpoint":
        return { label: String(args.label), data: args.data ?? null };
      case "now":
        return Date.now();
      case "notify": {
        const text = `${workflowNoticeMarker(nameOf(run), "note")}${String(args.text)}`;
        if (run.supervisorInstanceId) {
          notify(run, text);
        } else {
          deps.notifyUser(text);
        }
        return null;
      }
      case "notes": {
        const notes = (run.state.__notes as string[] | undefined) ?? [];
        run.state = { ...run.state, __notes: [] };
        write(run);
        return notes;
      }
      case "log":
        return { text: String(args.text) };
      case "trace":
        return { edgeId: args.edgeId, scope: args.scope };
      default:
        throw new Error(`Unknown workflow effect ${kind}.`);
    }
  };

  /** A question: its step parked, its question in the ledger. */
  const openAsk = (run: WorkflowRunRow, seq: number, args: AskArgs) => {
    const id = stepIdFor(run.id, seq);
    if (db.getWorkflowStep(id)) {
      return;
    }
    const step: WorkflowStepRow = {
      id,
      runId: run.id,
      seq,
      nodeId: `seq-${seq}`,
      kind: "ask",
      spec: args as Record<string, unknown>,
      status: "waiting",
      instanceId: null,
      childRunId: null,
      result: null,
      failure: null,
      mapIndex: null,
      startedAt: new Date(),
      endedAt: null,
    };
    run.status = "waiting";
    logCall(run.id, seq, "ask", args as Record<string, unknown>);
    write(run, step);
    parkAsk(run, step);
  };

  /** A child run: its row prepared and its parent's step opened on it. */
  const openChild = async (
    run: WorkflowRunRow,
    seq: number,
    args: Record<string, unknown>
  ) => {
    const childId = stepIdFor(run.id, seq);
    const stepId = `step-${childId}`;
    const existing = db.getWorkflowStep(stepId);
    if (existing?.childRunId) {
      return { childRunId: existing.childRunId };
    }
    logCall(run.id, seq, "workflow", args);
    try {
      await prepare(String(args.slug), {
        id: childId,
        inputs: args.inputs as Record<string, unknown>,
        workspace: { path: run.workspace, machineId: run.machineId },
        supervisor: run.supervisorInstanceId
          ? { instanceId: run.supervisorInstanceId }
          : undefined,
        parentRunId: run.id,
        parentStepId: stepId,
      });
    } catch (error) {
      settleLog(run.id, seq, { failure: failureOf(error) });
      throw error;
    }
    write(run, {
      id: stepId,
      runId: run.id,
      seq,
      nodeId: `seq-${seq}`,
      kind: "workflow",
      spec: args,
      status: "running",
      instanceId: null,
      childRunId: childId,
      result: null,
      failure: null,
      mapIndex: null,
      startedAt: new Date(),
      endedAt: null,
    });
    return { childRunId: childId };
  };

  /** A child run's outcome once its row has ended; undefined while it runs. */
  const childOutcomeOf = (childRunId: string): Outcome | undefined => {
    const child = db.getWorkflowRun(childRunId);
    if (!child || active(child)) {
      return;
    }
    if (child.status === "done") {
      return { result: child.result };
    }
    return {
      failure: {
        name: "ChildError",
        kind: child.status === "cancelled" ? "cancelled" : "failed",
        childRunId,
        message: child.failure ?? child.status,
      },
    };
  };

  /**
   * What a wait at `seq` of an ended run came back with, read off its step:
   * a step's result or StepError, a question's answer or timeout, a child's
   * outcome. Throws for one that never finished there.
   */
  const waitOutcome = (
    runId: string,
    seq: number,
    kind: WorkflowEffectKind
  ): Outcome => {
    if (kind === "sleep") {
      return { result: null };
    }
    const step =
      kind === "workflow"
        ? db.getWorkflowStep(`step-${stepIdFor(runId, seq)}`)
        : db.getWorkflowStep(stepIdFor(runId, seq));
    const outcome = step && waitStepOutcome(step);
    if (!outcome) {
      throw new Error(
        `Effect ${seq} (${kind}) never finished in the run this one re-runs (${runId}); re-run it from an earlier step.`
      );
    }
    return outcome;
  };
  const waitStepOutcome = (step: WorkflowStepRow): Outcome | undefined => {
    if (step.kind === "workflow") {
      return step.childRunId ? childOutcomeOf(step.childRunId) : undefined;
    }
    if (step.status === "passed") {
      return { result: step.result };
    }
    if (step.status !== "failed") {
      return;
    }
    if (step.kind === "ask") {
      return {
        failure: { name: "AskError", kind: "timeout", message: "ask-timeout" },
      };
    }
    return {
      failure: stepError(step, db.listWorkflowAttempts(step.id).length),
    };
  };

  const engine = createWorkflowEngine(deps.dbPath, {
    run: (runId) => db.getWorkflowRun(runId),
    async perform(runId, seq, kind, args) {
      const run = runOf(runId);
      let outcome: Outcome;
      try {
        outcome = { result: await perform(run, kind, args) };
      } catch (error) {
        outcome = { failure: failureOf(error) };
      }
      logCall(runId, seq, kind, args, outcome);
      if (kind === "checkpoint" && "result" in outcome) {
        const checkpoint = outcome.result as { data: unknown; label: string };
        announce(runOf(runId), undefined, undefined, checkpoint);
        notify(
          runOf(runId),
          `${workflowNoticeMarker(nameOf(run), `checkpoint ${checkpoint.label}`)}run ${runId} · ${receiptOf(checkpoint.data, seq)}`
        );
      } else {
        announce(runOf(runId));
      }
      return outcome;
    },
    async open(runId, seq, kind, args) {
      const run = runOf(runId);
      if (!active(run)) {
        throw new Error("This workflow run has ended.");
      }
      switch (kind) {
        case "run":
        case "spawn":
          if (!db.getWorkflowLog(runId, seq)) {
            logCall(runId, seq, kind, args);
          }
          await steps.open(run, seq, stepIdFor(runId, seq), {
            ...(args as unknown as StepSpecJson),
          });
          return {};
        case "ask":
          openAsk(run, seq, args as AskArgs);
          return {};
        case "sleep":
          logCall(runId, seq, kind, args, {
            result: { due: Date.now() + Math.max(0, Number(args.ms) || 0) },
          });
          announce(run);
          return {};
        case "workflow":
          return await openChild(run, seq, args);
        default:
          throw new Error(`${kind} is not a call a run waits on.`);
      }
    },
    askTimedOut(runId, seq) {
      const run = db.getWorkflowRun(runId);
      const step = db.getWorkflowStep(stepIdFor(runId, seq));
      if (!(run && step?.status === "waiting")) {
        return;
      }
      deps.settle(step.id);
      step.status = "failed";
      step.failure = "ask-timeout";
      step.endedAt = new Date();
      if (run.status === "waiting" && !stillWaiting(run, step.id)) {
        run.status = "running";
      }
      settleLog(runId, seq, {
        failure: { name: "AskError", kind: "timeout", message: "ask-timeout" },
      });
      write(run, step);
    },
    childOutcome: childOutcomeOf,
    hold: (runId, seq) => steps.holdOf(stepIdFor(runId, seq)),
    holdExpired(runId, seq, hold) {
      const failure = steps.holdExpired(stepIdFor(runId, seq), hold);
      if (!failure) {
        return;
      }
      settleLog(runId, seq, { failure });
      announce(runOf(runId));
      return { failure };
    },
    async seed(runId, seq, kind, args, hash) {
      const run = runOf(runId);
      const from = run.state.__rerun as RerunFrom | undefined;
      if (!from || seq >= from.before) {
        return;
      }
      const recorded = await engine.recorded(from.runId, seq);
      if (!recorded) {
        throw new Error(
          `The run this one re-runs (${from.runId}) has no record of effect ${seq}; re-run it from an earlier step.`
        );
      }
      if (recorded.hash !== hash) {
        // A different call here: the driver refuses it as the workflow changed.
        return { hash: recorded.hash, outcome: { result: null } };
      }
      const outcome = recorded.outcome ?? waitOutcome(from.runId, seq, kind);
      logCall(runId, seq, kind, args, outcome);
      announce(run);
      return { hash: recorded.hash, outcome };
    },
    finished(runId, outcome) {
      const run = db.getWorkflowRun(runId);
      if (!run) {
        return;
      }
      if ("failure" in outcome) {
        const failure: WorkflowFailure = outcome.failure;
        finish(
          run,
          "failed",
          failure.kind ? `${failure.kind}: ${failure.message}` : failure.message
        );
      } else {
        finish(run, "done", null, outcome.result ?? null);
      }
    },
  });

  // --------------------------------------------------------------- public

  const runtime = {
    /** A run's log, for the run view. */
    log: (runId: string) => db.listWorkflowLog(runId),
    /**
     * A session came up. A supervisor gets the notices kept while it was
     * not live; a step session whose run has ended is stopped.
     */
    instanceLive(instanceId: string) {
      flushNotices();
      const [instance] = db.getInstancesByIds([instanceId]);
      if (instance?.workflowRunId && instance.workflowStepId) {
        const run = db.getWorkflowRun(instance.workflowRunId);
        const step = db.getWorkflowStep(instance.workflowStepId);
        if (run && step && !active(run)) {
          steps.stop(run, step);
        }
      }
    },
    specFor: (stepId: string) => steps.specFor(stepId),
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
      const rows = db.listWorkflowSteps(id);
      const ask = askOf(run);
      return {
        ...publicRun(run, db.listWorkflowLog(id)),
        steps: rows,
        attempts: rows.flatMap((step) => db.listWorkflowAttempts(step.id)),
        ...(ask ? { ask } : {}),
      };
    },
    /**
     * `workflow_read`: a window into one result of a run the caller
     * supervises — effect `ref`'s, or the run's own (`"result"`) — at `path`.
     */
    read(
      runId: string,
      request: {
        ref: number | "result";
        path?: string;
        offset?: number;
        limit?: number;
      },
      caller?: string
    ) {
      const run = runOf(runId);
      if (caller && caller !== run.supervisorInstanceId) {
        throw new Error(
          "Only this workflow run's supervisor may read its results."
        );
      }
      let value: unknown;
      if (request.ref === "result") {
        if (run.status !== "done") {
          throw new Error("This run has not returned a result.");
        }
        value = run.result;
      } else {
        value = refValue(run.id, request.ref);
      }
      return `ref ${request.ref}${request.path ? ` · path ${request.path}` : ""} · ${readSlice(valueAt(value, request.path), request)}`;
    },
    async launch(
      workflowId: string,
      options: LaunchOptions
    ): Promise<{ runId: string }> {
      await engine.ready;
      const run = await prepare(workflowId, options);
      try {
        await engine.start(run.id);
      } catch (error) {
        finish(
          runOf(run.id),
          "failed",
          `The workflow engine could not start the run: ${reason(error)}`
        );
        throw error;
      }
      return { runId: run.id };
    },
    /**
     * Starts the run again with the inputs it had, as its workflow is now:
     * from the start, or from one of its steps — every call before that step
     * is answered with what this run got there, and must be the same call.
     */
    rerun(runId: string, fromStepId?: string) {
      const old = runOf(runId);
      let rerunFrom: RerunFrom | undefined;
      if (fromStepId) {
        rerunFrom = { runId: old.id, before: runStep(old.id, fromStepId).seq };
      }
      return runtime.launch(old.workflowId, {
        inputs: old.inputs,
        workspace: { path: old.workspace, machineId: old.machineId },
        supervisor: old.supervisorInstanceId
          ? { instanceId: old.supervisorInstanceId }
          : undefined,
        rerunOfRunId: old.id,
        ...(rerunFrom ? { rerunFrom } : {}),
      });
    },
    submitResult: (stepId: string, instanceId: string, result: unknown) =>
      steps.submitResult(stepId, instanceId, result),
    observe: (instanceId: string, error?: string) =>
      steps.observe(instanceId, error),
    providerRetry: (
      instanceId: string,
      retry: { message: string; nextAttemptAt?: number }
    ) => steps.providerRetry(instanceId, retry),
    cancel(id: string) {
      return serial(id, () => {
        const run = runOf(id);
        if (!active(run)) {
          throw new Error("This workflow run has already ended.");
        }
        finish(run, "cancelled");
        interrupt(id);
        return publicRun(run, db.listWorkflowLog(id));
      });
    },
    answer(
      id: string,
      stepId: string,
      answer: { choice?: string; note?: string; value?: unknown }
    ) {
      return serial(id, () => {
        const run = runOf(id);
        const step = stepOf(stepId);
        if (step.runId !== id || step.status !== "waiting" || !active(run)) {
          throw new Error("This workflow step is not waiting for an answer.");
        }
        settleAsk(run, step, answer);
      });
    },
    /**
     * A question answered through the pending ledger — a dashboard card,
     * Telegram, or a supervisor's `answer_delegate`. An answer the question
     * cannot take throws here, before anything is settled, so whoever sent it
     * is told why and the question stays open.
     */
    settleQuestion(stepId: string, result: PermissionResult) {
      const step = db.getWorkflowStep(stepId);
      if (step?.kind !== "ask") {
        return false;
      }
      if (result.behavior === "deny") {
        serial(step.runId, () => {
          const run = runOf(step.runId);
          if (active(run)) {
            finish(run, "cancelled");
            interrupt(run.id);
          }
        }).catch(console.error);
        return true;
      }
      const answers = (
        result.updatedInput as
          | { answers?: Record<string, string | string[]> }
          | undefined
      )?.answers;
      const reply = answers && Object.values(answers)[0];
      const answer = answerOf(
        (step.spec ?? {}) as AskArgs,
        Array.isArray(reply) ? reply.join(", ") : (reply ?? "")
      );
      checkAnswer(step, answer);
      serial(step.runId, () => {
        const run = runOf(step.runId);
        const current = stepOf(step.id);
        if (active(run) && current.status === "waiting") {
          settleAsk(run, current, answer);
        }
      }).catch(console.error);
      return true;
    },
    /**
     * A supervisor's action on its run. Answers one line saying what it did;
     * the run itself is read with workflow_read or the dashboard.
     */
    steer(id: string, action: WorkflowAction, caller?: string) {
      return serial(id, async () => {
        const run = runOf(id);
        if (caller && caller !== run.supervisorInstanceId) {
          throw new Error("Only this workflow run's supervisor may steer it.");
        }
        if (!active(run)) {
          throw new Error("This workflow run has already ended.");
        }
        switch (action.type) {
          case "note":
            run.state = {
              ...run.state,
              __notes: [
                ...((run.state.__notes as string[] | undefined) ?? []),
                action.text,
              ],
            };
            write(run);
            return "Noted: the next step to start gets it in its prompt, and the program reads it with w.notes().";
          case "cancel":
            finish(run, "cancelled");
            interrupt(id);
            return `Cancelled run ${id}.`;
          case "answer": {
            const step = runStep(id, action.stepId);
            if (step.status !== "waiting") {
              throw new Error("That step is not waiting for an answer.");
            }
            settleAsk(run, step, {
              choice: action.choice,
              note: action.note,
              value: action.value,
            });
            return `Answered step ${step.id}; the run goes on.`;
          }
          case "retry": {
            const step = await steps.retry(run, runStep(id, action.stepId));
            const attempt = db.listWorkflowAttempts(step.id).at(-1);
            return step.status === "running"
              ? `Retrying step ${step.id}: attempt ${attempt?.number} started on the same session.`
              : `Step ${step.id}'s new attempt did not start (${attempt?.failure}); the step is ${step.status}.`;
          }
          case "fail":
            steps.fail(run, runStep(id, action.stepId));
            return `Step ${action.stepId} failed; the program has its StepError.`;
          default:
            throw new Error(
              "Steering takes note, retry, fail, answer, or cancel."
            );
        }
      });
    },
    /**
     * A machine came back: attempts whose session died while it was away
     * end, and its supervisors get the notices kept while it was gone.
     */
    recover(machineId: string) {
      steps.recover(machineId);
      flushNotices();
    },
    /** A run whose row changed outside the engine (seen, archived): every dashboard hears it. */
    announce: (run: WorkflowRunRow) => announce(run),
    /** A deleted workflow's ended runs: their executions leave the engine's storage too. */
    forget: (runIds: string[]) =>
      Promise.all(runIds.map((runId) => engine.forget(runId))),
    /**
     * At hub start, once the engine is up: running attempts get their timeout
     * back, parked questions go back in the ledger, and every top-level run
     * is made sure of an execution — the engine resumes the rest itself.
     */
    async resume() {
      // The engine logs its own failure to start; with it down nothing runs.
      const up = await engine.ready.then(
        () => true,
        () => false
      );
      if (!up) {
        return;
      }
      steps.resume();
      const live = db.listWorkflowRuns().filter(active);
      for (const run of live) {
        for (const step of db.listWorkflowSteps(run.id)) {
          if (step.kind === "ask" && step.status === "waiting") {
            parkAsk(run, step, false);
          }
        }
      }
      const starts = await Promise.allSettled(
        live
          .filter((run) => !run.parentRunId)
          .map((run) => engine.start(run.id))
      );
      for (const start of starts) {
        if (start.status === "rejected") {
          console.error(
            `[workflows] could not resume a run: ${reason(start.reason)}`
          );
        }
      }
    },
  };
  return runtime;
}

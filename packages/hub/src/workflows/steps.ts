/**
 * A step's attempts (§3.1/§5): the loop that puts a `run`/`spawn` call in
 * front of a session and keeps at it until the step has a validated result or
 * is out of retries. An attempt is recorded, its session spawned (or resumed)
 * and sent the prompt; `submit_result` records the result; the end of the
 * session's turn decides: passed, another attempt on the same session, or
 * out of attempts. Only the step's final outcome leaves this module —
 * `settled`, which hands it to the run's program through the workflow engine.
 *
 * Out of attempts in a run whose supervisor is live, a step is held: open,
 * its outcome not yet handed over, while the supervisor decides to retry it
 * (another attempt, same row and session) or fail it. A hold lasts
 * {@link HOLD_DEADLINE_MS} at most — a durable clock in the engine, so a
 * restart does not lose it — and a step is held {@link MAX_HOLDS} times at
 * most. A step whose program handles the failure (`onExhausted: "fail"`)
 * never holds.
 *
 * A hub restart does not reopen a step. Its session keeps running on its
 * machine, its attempt row keeps counting, and `resume` re-arms the timeout
 * the restart dropped.
 */
import type { EffortLevel, SpawnPayload, WorkflowFailure } from "@whiffle/core";
import { workflowNoticeMarker, workflowStepMarker } from "@whiffle/core";
import Ajv from "ajv";
import type {
  DbShape,
  WorkflowAttemptRow,
  WorkflowRunRow,
  WorkflowStepRow,
} from "../db";
import { failureText, receiptOf } from "./refs";

/** What `w.run` / `w.spawn` asked for, as it crossed the worker boundary. */
export interface StepSpec {
  denyTools?: string[];
  effort?: EffortLevel;
  harness: "claude" | "opencode" | "pi";
  model: string;
  node?: string;
  /** Out of attempts in a supervised run: held for the supervisor (default), or failed. */
  onExhausted?: "fail" | "hold";
  outputSchema: Record<string, unknown>;
  prompt: string;
  retries?: number;
  skills?: string[];
  timeoutMinutes?: number;
  title: string;
}

/** What the steps need from the run around them. */
export interface StepContext {
  readonly db: DbShape;
  /** Fills `{{ref:N.path}}` from this run's settled effects. */
  readonly expand: (run: WorkflowRunRow, text: string) => string;
  readonly halt: (machineId: string, instanceId: string) => Promise<void>;
  /** A step went on hold: its deadline starts, in the engine. */
  readonly hold: (
    run: WorkflowRunRow,
    step: WorkflowStepRow,
    hold: number,
    ms: number
  ) => void;
  readonly nameOf: (run: WorkflowRunRow) => string;
  readonly notify: (run: WorkflowRunRow, body: string) => void;
  readonly send: (
    run: WorkflowRunRow,
    instanceId: string,
    body: string,
    queued?: boolean
  ) => void;
  readonly serial: <T>(
    runId: string,
    action: () => T | Promise<T>
  ) => Promise<T>;
  /** The step ended for good: its outcome goes to the program. */
  readonly settled: (
    run: WorkflowRunRow,
    step: WorkflowStepRow,
    outcome: { result: unknown } | { failure: WorkflowFailure }
  ) => void;
  readonly spawn: (machineId: string, payload: SpawnPayload) => Promise<void>;
  readonly stopSession: (run: WorkflowRunRow, instanceId: string) => void;
  /** Whether the run has a supervisor, live now to take a decision. */
  readonly supervisorLive: (run: WorkflowRunRow) => boolean;
  readonly write: (
    run: WorkflowRunRow,
    step?: WorkflowStepRow,
    attempt?: WorkflowAttemptRow
  ) => void;
}

/** How long a held step waits on its supervisor before the program gets its failure. */
export const HOLD_DEADLINE_MS = 60 * 60_000;
/** How many times one step is held; out of attempts again after that, it fails. */
const MAX_HOLDS = 2;

const active = (run: WorkflowRunRow) =>
  run.status === "running" || run.status === "waiting";
const reason = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** The StepError a failed step hands its program, after `attempts` attempts. */
export function stepError(
  step: WorkflowStepRow,
  attempts: number
): WorkflowFailure {
  const failure = step.failure ?? "harness-error";
  return {
    name: "StepError",
    kind:
      failure === "no-result" || failure === "attempt-timeout"
        ? failure
        : "harness-error",
    stepId: step.id,
    attempts,
    message: failure,
  };
}

/**
 * Which hold an attempt that ran out of attempts puts its step in: the
 * attempts past the step's budget, counted from 1. The budget's last attempt
 * is hold 1; each supervisor retry adds one.
 */
const holdAfter = (spec: StepSpec, attempt: WorkflowAttemptRow) =>
  attempt.number - (spec.retries ?? 2);

/** How long something took, in the words a receipt uses. */
export function durationText(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function createSteps(ctx: StepContext) {
  const { db } = ctx;
  const ajv = new Ajv({ allErrors: true, strict: false });
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Each armed attempt's deadline (ms epoch), by step, beside its timer. */
  const deadlines = new Map<string, number>();

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
  const specOf = (step: WorkflowStepRow): StepSpec => {
    if (!step.spec) {
      throw new Error(`Workflow step ${step.id} has no recorded spec.`);
    }
    return step.spec as unknown as StepSpec;
  };
  const latest = (step: WorkflowStepRow) =>
    db.listWorkflowAttempts(step.id).at(-1);
  const clearTimer = (id: string) => {
    clearTimeout(timers.get(id));
    timers.delete(id);
    deadlines.delete(id);
  };
  const denied = (run: WorkflowRunRow, spec: StepSpec) =>
    spec.harness === "claude"
      ? [
          ...(spec.denyTools ?? []),
          ...(run.supervisorInstanceId ? [] : ["AskUserQuestion"]),
        ]
      : undefined;

  /** The prompt an attempt is handed: its refs filled, notes and retry cause added. */
  const briefOf = (
    run: WorkflowRunRow,
    spec: StepSpec,
    notes: string[],
    previousError: string
  ) => {
    const prompt = ctx.expand(run, spec.prompt);
    const noted = notes.map((note) => ctx.expand(run, note));
    let retry = "";
    if (previousError) {
      retry = `\nPrevious attempt: ${previousError}\n${previousError === "no-result" ? "You ended without calling submit_result. Call it now with an object matching the schema." : "Correct the error and call submit_result."}`;
    }
    return `${workflowStepMarker(ctx.nameOf(run), spec.title)}${prompt}\n\nWhen the work is done, call submit_result exactly once with an object matching this schema, then end your turn. Do not describe the result in prose instead of calling it.\n${JSON.stringify(spec.outputSchema, null, 2)}${run.supervisorInstanceId ? "" : "\nThere is nobody to ask. Decide, and record any assumption in your result."}${noted.length ? `\nSupervisor note: ${noted.join("\n")}` : ""}${retry}`;
  };

  /**
   * Starts the step's next attempt, inside `serial(run.id)`. The attempt is
   * recorded first; then its session is spawned (or resumed) and sent the
   * prompt. Whatever stops that start — a ref that names nothing, a spawn the
   * transport drops, a send with no session to take it — is the attempt's own
   * failure and ends it through {@link ended}, so the step's `retries` cover
   * every way an attempt fails, the first included.
   */
  const attemptStep = async (
    run: WorkflowRunRow,
    step: WorkflowStepRow,
    spec: StepSpec,
    previousError = ""
  ) => {
    const number = (latest(step)?.number ?? 0) + 1;
    const notes = (run.state.__notes as string[] | undefined) ?? [];
    run.state = { ...run.state, __notes: [] };
    let body = spec.prompt;
    let unbriefed = "";
    try {
      body = briefOf(run, spec, notes, previousError);
    } catch (error) {
      unbriefed = reason(error);
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
    ctx.write(run, step, attempt);
    try {
      if (unbriefed) {
        throw new Error(unbriefed);
      }
      await startAttempt(run, step, step.instanceId, spec, body);
    } catch (failure) {
      await ended(run, step, reason(failure));
    }
  };

  /**
   * Puts an attempt's prompt in front of the step's session. A live session
   * takes it as its next turn. One that is gone is resumed — a step that has
   * a conversation keeps it across attempts, so a retry never starts over.
   * A step whose session never came to be is spawned, as its first attempt was.
   */
  const startAttempt = async (
    run: WorkflowRunRow,
    step: WorkflowStepRow,
    instanceId: string,
    spec: StepSpec,
    body: string
  ) => {
    const [instance] = db.getInstancesByIds([instanceId]);
    if (!(instance && ["running", "starting"].includes(instance.status))) {
      await ctx.spawn(run.machineId, {
        instanceId,
        cwd: run.workspace,
        harness: spec.harness,
        model: spec.model,
        effort: spec.effort,
        skills: spec.skills,
        denyTools: denied(run, spec),
        ...(instance?.sessionId
          ? { resume: { sessionKey: instance.sessionId } }
          : {}),
        permissionMode: "bypassPermissions",
        canDelegate: false,
        title: `${ctx.nameOf(run)} · ${spec.title}`,
        ...(run.supervisorInstanceId
          ? { parent: { instanceId: run.supervisorInstanceId } }
          : {}),
        workflowRunId: run.id,
        workflowStepId: step.id,
      });
    }
    if (!active(runOf(run.id))) {
      stop(run, step);
      return;
    }
    ctx.send(run, instanceId, body);
    arm(run, step, Date.now() + (spec.timeoutMinutes ?? 60) * 60_000);
  };

  /** The attempt's deadline: past it the session is halted and the attempt ends. */
  const arm = (
    run: WorkflowRunRow,
    step: WorkflowStepRow,
    deadline: number
  ) => {
    clearTimer(step.id);
    deadlines.set(step.id, deadline);
    timers.set(
      step.id,
      setTimeout(
        () => {
          ctx
            .serial(run.id, async () => {
              const current = runOf(run.id);
              const currentStep = stepOf(step.id);
              if (!(active(current) && currentStep.status === "running")) {
                return;
              }
              if (currentStep.instanceId) {
                await ctx.halt(current.machineId, currentStep.instanceId);
              }
              await ended(current, currentStep, "attempt-timeout");
            })
            .catch((error) => {
              console.error(
                `[workflows] step ${step.id} timeout: ${reason(error)}`
              );
            });
        },
        Math.max(1, deadline - Date.now())
      )
    );
  };

  /** Stops a step's session and its timer: its run ended, or was cancelled. */
  const stop = (run: WorkflowRunRow, step: WorkflowStepRow) => {
    clearTimer(step.id);
    if (step.instanceId) {
      ctx.stopSession(run, step.instanceId);
    }
  };

  /** A run's running steps whose session is no longer alive, and why it went. */
  const deadAttempts = (run: WorkflowRunRow): [WorkflowStepRow, string][] =>
    db
      .listWorkflowSteps(run.id)
      .flatMap((step): [WorkflowStepRow, string][] => {
        if (
          step.kind !== "step" ||
          step.status !== "running" ||
          !step.instanceId
        ) {
          return [];
        }
        const [instance] = db.getInstancesByIds([step.instanceId]);
        return instance &&
          ["sleeping", "error", "stopped"].includes(instance.status)
          ? [
              [
                step,
                instance.lastError ??
                  "Session stopped before the attempt completed.",
              ],
            ]
          : [];
      });

  /** A receipt's opening: the run, the attempt out of how many, and the time. */
  const receiptHead = (
    run: WorkflowRunRow,
    step: WorkflowStepRow,
    attempt: WorkflowAttemptRow,
    spec: StepSpec
  ) => {
    const budget = (spec.retries ?? 2) + 1;
    const count =
      attempt.number <= budget
        ? `${attempt.number}/${budget}`
        : `${attempt.number} (supervisor retry)`;
    return `run ${run.id} · attempt ${count} · ${durationText(Date.now() - (step.startedAt?.getTime() ?? Date.now()))}`;
  };

  /** Ends a step as failed; answers the StepError its program is handed. */
  const closeFailed = (
    run: WorkflowRunRow,
    step: WorkflowStepRow,
    attempt: WorkflowAttemptRow
  ) => {
    step.status = "failed";
    step.failure = attempt.failure;
    step.endedAt = new Date();
    ctx.write(run, step, attempt);
    return stepError(step, attempt.number);
  };

  const failedReceipt = (
    run: WorkflowRunRow,
    step: WorkflowStepRow,
    attempt: WorkflowAttemptRow,
    spec: StepSpec,
    why: string
  ) =>
    `${workflowNoticeMarker(ctx.nameOf(run), `step ${spec.title} failed`)}${receiptHead(run, step, attempt, spec)} · ${failureText(attempt.failure ?? "no-result")}${why ? ` · ${why}` : ""}`;

  /**
   * Why a step out of attempts is not held — for the receipt, `""` when there
   * is nothing to say — or undefined when it is. A program that handles the
   * failure or a run with no supervisor never holds; a step with no hold
   * left, or a supervisor not live to decide, does not.
   */
  const holdRefusal = (
    run: WorkflowRunRow,
    spec: StepSpec,
    hold: number
  ): string | undefined => {
    if (spec.onExhausted === "fail" || !run.supervisorInstanceId) {
      return "";
    }
    if (hold > MAX_HOLDS) {
      return `held ${MAX_HOLDS} times already`;
    }
    return ctx.supervisorLive(run)
      ? undefined
      : "not held: the supervisor is not live";
  };

  /**
   * A step out of attempts: held for its supervisor, or failed with its
   * StepError handed to the program.
   */
  const exhausted = (
    run: WorkflowRunRow,
    step: WorkflowStepRow,
    attempt: WorkflowAttemptRow,
    spec: StepSpec
  ) => {
    const hold = holdAfter(spec, attempt);
    const why = holdRefusal(run, spec, hold);
    if (why !== undefined) {
      const failure = closeFailed(run, step, attempt);
      ctx.notify(run, failedReceipt(run, step, attempt, spec, why));
      ctx.settled(run, step, { failure });
      return;
    }
    step.status = "held";
    step.failure = attempt.failure;
    ctx.write(run, step, attempt);
    ctx.notify(
      run,
      `${workflowNoticeMarker(ctx.nameOf(run), `step ${spec.title} held`)}${receiptHead(run, step, attempt, spec)} · ${failureText(attempt.failure ?? "no-result")} · out of attempts, held for your decision (hold ${hold} of ${MAX_HOLDS}, ${HOLD_DEADLINE_MS / 60_000} min at most). steer_workflow {runId: "${run.id}", action: {type: "retry", stepId: "${step.id}"}} runs another attempt on the same session; {type: "fail", stepId: "${step.id}"} hands the program its StepError now. With no decision the step fails when the hold runs out.`
    );
    ctx.hold(run, step, hold, HOLD_DEADLINE_MS);
  };

  /** A step's turn ended: record, retry on the same session, or out of attempts. */
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
      ctx.write(run, step, attempt);
      ctx.notify(
        run,
        `${workflowNoticeMarker(ctx.nameOf(run), `step ${spec.title} passed`)}${receiptHead(run, step, attempt, spec)} · ${receiptOf(step.result, step.seq)}`
      );
      ctx.settled(run, step, { result: attempt.result });
      return;
    }
    attempt.failure = error ?? "no-result";
    if (attempt.number <= (spec.retries ?? 2)) {
      ctx.write(run, step, attempt);
      await attemptStep(run, step, spec, attempt.failure);
      return;
    }
    exhausted(run, step, attempt, spec);
  };

  /** A step waiting on its supervisor's decision, or refused with why not. */
  const heldStep = (step: WorkflowStepRow, action: string) => {
    const attempt = latest(step);
    if (step.kind !== "step" || step.status !== "held" || !attempt) {
      throw new Error(
        `Only a held step can be ${action}: one out of attempts, waiting on your decision. This step is ${step.status}.`
      );
    }
    return attempt;
  };

  return {
    /** Opens a `run`/`spawn` call's step once; a replay finds the row and leaves it. */
    open(run: WorkflowRunRow, seq: number, id: string, spec: StepSpec) {
      return ctx.serial(run.id, async () => {
        if (db.getWorkflowStep(id)) {
          return;
        }
        const step: WorkflowStepRow = {
          id,
          runId: run.id,
          seq,
          nodeId: spec.node ?? `seq-${seq}`,
          kind: "step",
          spec: spec as unknown as Record<string, unknown>,
          status: "pending",
          instanceId: null,
          childRunId: null,
          result: null,
          failure: null,
          mapIndex: null,
          startedAt: null,
          endedAt: null,
        };
        await attemptStep(runOf(run.id), step, spec);
      });
    },
    stop,
    specFor(stepId: string) {
      const step = stepOf(stepId);
      return {
        skills: specOf(step).skills,
        denyTools: denied(runOf(step.runId), specOf(step)),
      };
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
      ctx.write(run, step, attempt);
      return "Recorded. End your turn now.";
    },
    /** A step session's turn ended; `error` when the harness reported one. */
    observe(instanceId: string, error?: string) {
      const [instance] = db.getInstancesByIds([instanceId]);
      if (!(instance?.workflowStepId && instance.workflowRunId)) {
        return false;
      }
      const { workflowRunId, workflowStepId } = instance;
      const step = db.getWorkflowStep(workflowStepId);
      if (step?.kind !== "step") {
        return false;
      }
      const observedAttempt = latest(step)?.id;
      ctx
        .serial(workflowRunId, async () => {
          const current = stepOf(workflowStepId);
          if (latest(current)?.id !== observedAttempt) {
            return;
          }
          await ended(runOf(workflowRunId), current, error);
        })
        .catch(console.error);
      return true;
    },
    /**
     * A step session's provider refused its turn and will try again at
     * `retry.nextAttemptAt`. A retry that lands past the attempt's deadline
     * would only spend the rest of the attempt waiting for nothing, so the
     * attempt ends now: its session's turn is halted as a timeout halts it
     * (which stops the provider's retrying too), and it fails with the
     * provider's own words and when it would have tried again. The step's
     * retries, hold and StepError follow as for any failed attempt. A retry
     * within the deadline, or one with no time, is left to run.
     */
    providerRetry(
      instanceId: string,
      retry: { message: string; nextAttemptAt?: number }
    ) {
      const [instance] = db.getInstancesByIds([instanceId]);
      if (!(instance?.workflowStepId && instance.workflowRunId)) {
        return false;
      }
      const { workflowRunId, workflowStepId } = instance;
      const step = db.getWorkflowStep(workflowStepId);
      if (step?.kind !== "step") {
        return false;
      }
      const observedAttempt = latest(step)?.id;
      ctx
        .serial(workflowRunId, async () => {
          const run = runOf(workflowRunId);
          const current = stepOf(workflowStepId);
          const attempt = latest(current);
          const deadline = deadlines.get(workflowStepId);
          if (
            !(active(run) && current.status === "running" && attempt) ||
            attempt.id !== observedAttempt ||
            attempt.endedAt ||
            deadline === undefined ||
            retry.nextAttemptAt === undefined ||
            retry.nextAttemptAt <= deadline
          ) {
            return;
          }
          if (current.instanceId) {
            await ctx.halt(run.machineId, current.instanceId);
          }
          await ended(
            run,
            current,
            `${retry.message} — the provider's next attempt is at ${new Date(retry.nextAttemptAt).toISOString()}, past this attempt's deadline (${new Date(deadline).toISOString()})`
          );
        })
        .catch((error) => {
          console.error(
            `[workflows] step ${workflowStepId} provider retry: ${reason(error)}`
          );
        });
      return true;
    },
    /**
     * The supervisor's retry of a held step: another attempt on the same row
     * and session, told why the last one failed. Answers the step as it
     * stands after the attempt started.
     */
    async retry(run: WorkflowRunRow, step: WorkflowStepRow) {
      const last = heldStep(step, "retried");
      step.failure = null;
      await attemptStep(run, step, specOf(step), last.failure ?? "");
      return stepOf(step.id);
    },
    /** The supervisor's decision on a held step: the program gets its StepError now. */
    fail(run: WorkflowRunRow, step: WorkflowStepRow) {
      const attempt = heldStep(step, "failed");
      ctx.settled(run, step, { failure: closeFailed(run, step, attempt) });
    },
    /**
     * The hold a step is in, or ended in — its number, whose deadline clock
     * the engine checks — for a step held or failed past its attempt budget.
     * A number whose hold never happened has no clock, so nothing fires.
     */
    holdOf(stepId: string): number | undefined {
      const step = db.getWorkflowStep(stepId);
      const attempt = step && latest(step);
      if (
        !(step && attempt) ||
        step.kind !== "step" ||
        !(step.status === "held" || step.status === "failed")
      ) {
        return;
      }
      const hold = holdAfter(specOf(step), attempt);
      return hold >= 1 && hold <= MAX_HOLDS ? hold : undefined;
    },
    /**
     * Hold `hold`'s deadline passed. A step still in that hold fails, and its
     * supervisor is told; one that already failed there answers the same
     * StepError again. Undefined when the step has moved on — retried, or
     * held again — and there is nothing to hand over.
     */
    holdExpired(stepId: string, hold: number): WorkflowFailure | undefined {
      const step = db.getWorkflowStep(stepId);
      const attempt = step && latest(step);
      if (!(step && attempt) || holdAfter(specOf(step), attempt) !== hold) {
        return;
      }
      if (step.status === "failed") {
        return stepError(step, attempt.number);
      }
      const run = runOf(step.runId);
      if (step.status !== "held" || !active(run)) {
        return;
      }
      const failure = closeFailed(run, step, attempt);
      ctx.notify(
        run,
        failedReceipt(
          run,
          step,
          attempt,
          specOf(step),
          `held ${HOLD_DEADLINE_MS / 60_000} min; no supervisor decision`
        )
      );
      return failure;
    },
    /**
     * A machine came back: an attempt whose session died while it was away
     * ends now, and the step's retries take it from there.
     */
    recover(machineId: string) {
      for (const run of db
        .listWorkflowRuns()
        .filter((row) => active(row) && row.machineId === machineId)) {
        ctx
          .serial(run.id, async () => {
            for (const [step, why] of deadAttempts(run)) {
              // biome-ignore lint/performance/noAwaitInLoops: each dead attempt settles before the next is looked at
              await ended(runOf(run.id), step, why);
            }
          })
          .catch(console.error);
      }
    },
    /**
     * At hub start: every running attempt's timeout is armed again from when
     * the attempt began. Its session is left exactly as it is.
     */
    resume() {
      for (const run of db.listWorkflowRuns().filter(active)) {
        for (const step of db.listWorkflowSteps(run.id)) {
          const attempt = step.status === "running" ? latest(step) : undefined;
          if (step.kind !== "step" || !attempt || attempt.endedAt) {
            continue;
          }
          arm(
            run,
            step,
            attempt.startedAt.getTime() +
              (specOf(step).timeoutMinutes ?? 60) * 60_000
          );
        }
      }
    },
  };
}

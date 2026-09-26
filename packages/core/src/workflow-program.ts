/**
 * The runtime a workflow program is handed (proposal §13.2). A program is a
 * TypeScript module: `export const inputs` (a zod object) and a default export
 * taking this interface. The hub executes it in a Worker where `w` and `z` are
 * the only capabilities; every method here is an *effect* that crosses back to
 * the hub thread, is journaled, and replays from the journal after a restart.
 */
import type { ZodTypeAny, z } from "zod";
import type { EffortLevel } from "./harness";
import type { WorkflowFailure } from "./workflow";

/** Captured at load: the sandbox removes `Bun` before a program runs. */
const Hasher = Bun.CryptoHasher;

/** What `w.run` / `w.spawn` are given. Mirrors the `step` node's fields. */
export interface StepSpec<Output extends ZodTypeAny = ZodTypeAny> {
  continueFrom?: StepHandle<ZodTypeAny>;
  denyTools?: string[];
  effort?: EffortLevel;
  harness: "claude" | "opencode" | "pi";
  model: string;
  /**
   * The editor node this step came from, so an editor-origin run view can
   * paint the node it belongs to. The compiler fills it; a hand-written
   * program leaves it out and the run view lays out from the journal.
   */
  node?: string;
  output: Output;
  prompt: string;
  retries?: number;
  skills?: string[];
  timeoutMinutes?: number;
  title: string;
}

/** A step started with `w.spawn`: its row id now, its result when it lands. */
export interface StepHandle<Output extends ZodTypeAny = ZodTypeAny> {
  readonly id: string;
  readonly result: Promise<z.infer<Output>>;
}

export interface AskSpec {
  allowOther?: boolean;
  answeredBy?: "operator" | "supervisor";
  options: { description?: string; label: string }[];
  question: string;
  waitFor?: number;
}

export interface AskAnswer {
  choice: string;
  note?: string;
}

/** A named, zod-typed slot shared between the program and its step sessions. */
export interface WorkflowState<Schema extends ZodTypeAny> {
  get: () => Promise<z.infer<Schema> | undefined>;
  set: (value: z.infer<Schema>) => Promise<void>;
  update: (
    change: (current: z.infer<Schema> | undefined) => z.infer<Schema>
  ) => Promise<void>;
}

export interface Workflow<Inputs extends ZodTypeAny = ZodTypeAny> {
  /** Human choice: parks in the hub's pending ledger until answered. */
  ask: (spec: AskSpec) => Promise<AskAnswer>;
  /** A progress marker: a `workflow` frame, a supervisor line, a run-view row. */
  checkpoint: (label: string, data?: unknown) => Promise<void>;
  /** Runs a command in the run's workspace on its machine. */
  exec: (
    cmd: string,
    options?: { timeoutMinutes?: number }
  ) => Promise<{ code: number; output: string }>;
  /** Whether a path exists in the run's workspace. */
  exists: (path: string) => Promise<boolean>;
  /** The launch inputs, already validated against the program's `inputs`. */
  readonly inputs: z.infer<Inputs>;
  /** One line in the run log. */
  log: (text: string) => Promise<void>;
  /** The supervisor's unconsumed notes, drained on read. */
  notes: () => Promise<string[]>;
  /** A message to the supervisor if there is one, else the operator. */
  notify: (text: string) => Promise<void>;
  /** Journaled clock: the same value on replay. */
  now: () => Promise<number>;
  /** One step, blocking until it returns a validated result. */
  run: <Output extends ZodTypeAny>(
    spec: StepSpec<Output>
  ) => Promise<z.infer<Output>>;
  /** Durable timer: survives a hub restart, resolves once. */
  sleep: (ms: number) => Promise<void>;
  /** One step, non-blocking. `Promise.all` over handles is the fan-out. */
  spawn: <Output extends ZodTypeAny>(
    spec: StepSpec<Output>
  ) => StepHandle<Output>;
  /** A named slot, validated against `schema` on every read and write. */
  state: <Schema extends ZodTypeAny>(
    name: string,
    schema: Schema
  ) => WorkflowState<Schema>;
  /** Records that an authored edge was traversed, for the run view's path. */
  trace: (edgeId: string, scope?: string) => Promise<void>;
  /** Runs another saved workflow as a child run and returns its result. */
  workflow: (slug: string, inputs: Record<string, unknown>) => Promise<unknown>;
}

export type StepErrorKind =
  | "no-result"
  | "attempt-timeout"
  | "harness-error"
  | "cancelled";

export class StepError extends Error {
  readonly attempts: number;
  readonly kind: StepErrorKind;
  readonly stepId: string;
  constructor(
    kind: StepErrorKind,
    stepId: string,
    attempts: number,
    message?: string
  ) {
    super(message ?? kind);
    this.name = "StepError";
    this.kind = kind;
    this.stepId = stepId;
    this.attempts = attempts;
  }
}

export class AskError extends Error {
  readonly kind: "timeout" | "dismissed";
  constructor(kind: "timeout" | "dismissed", message?: string) {
    super(message ?? `ask-${kind}`);
    this.name = "AskError";
    this.kind = kind;
  }
}

export class ChildError extends Error {
  readonly childRunId: string;
  readonly kind: "failed" | "cancelled";
  constructor(
    kind: "failed" | "cancelled",
    childRunId: string,
    message: string
  ) {
    super(message);
    this.name = "ChildError";
    this.kind = kind;
    this.childRunId = childRunId;
  }
}

/**
 * A step's row id, derived from the run and the effect sequence so the worker
 * can name a spawned step synchronously and a replay names the same rows.
 */
export function stepIdFor(runId: string, seq: number): string {
  const digest = new Hasher("sha256").update(`${runId}:${seq}`).digest("hex");
  // RFC 4122 pins a UUID's fourth group to 8, 9, a or b.
  const variant = "89ab"[
    Number.parseInt(digest.slice(16, 17), 16) % 4
  ] as string;
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `5${digest.slice(13, 16)}`,
    variant + digest.slice(17, 20),
    digest.slice(20, 32),
  ].join("-");
}

export function failureOf(error: unknown): WorkflowFailure {
  if (error instanceof StepError) {
    return {
      name: "StepError",
      kind: error.kind,
      stepId: error.stepId,
      attempts: error.attempts,
      message: error.message,
    };
  }
  if (error instanceof AskError) {
    return { name: "AskError", kind: error.kind, message: error.message };
  }
  if (error instanceof ChildError) {
    return {
      name: "ChildError",
      kind: error.kind,
      childRunId: error.childRunId,
      message: error.message,
    };
  }
  return {
    name: "Error",
    message: error instanceof Error ? error.message : String(error),
  };
}

export function errorOf(failure: WorkflowFailure): Error {
  if (failure.name === "StepError") {
    return new StepError(
      (failure.kind ?? "harness-error") as StepErrorKind,
      failure.stepId ?? "",
      failure.attempts ?? 0,
      failure.message
    );
  }
  if (failure.name === "AskError") {
    return new AskError(
      (failure.kind ?? "dismissed") as "timeout" | "dismissed",
      failure.message
    );
  }
  if (failure.name === "ChildError") {
    return new ChildError(
      (failure.kind ?? "failed") as "failed" | "cancelled",
      failure.childRunId ?? "",
      failure.message
    );
  }
  return new Error(failure.message);
}

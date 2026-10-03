/**
 * The workflow engine: Effect's durable workflows (`effect/workflow`)
 * on a single-process cluster runner (`SingleRunner` + `ClusterWorkflowEngine`)
 * whose message storage lives in the hub's own SQLite file.
 *
 * Every run is one execution of the `cawco-run` workflow. Its handler is the
 * driver: it starts the run's program in its sandbox Worker and performs each
 * `w.*` call the program makes as an engine primitive —
 *
 * - an immediate call (`exec`, `jev`, `now`, `state`, `log`, …) is an
 *   `Activity` named by its sequence: performed once, then answered from
 *   storage on every replay;
 * - a call the run waits on is an `Activity` that opens it (a step's row and
 *   first attempt, a parked question, a scheduled `DurableClock`, a child
 *   run) and then a wait: a step or question on a `DurableDeferred` the hub
 *   completes when it settles, a sleep or ask timeout on its clock, a held
 *   step's deadline on its clock, a child on its own `cawco-run` execution.
 *
 * A wait with no result yet parks. When the program has gone as far as it
 * can and every call it is still waiting on is parked, the handler suspends
 * and the Worker goes. When a deferred completes the engine re-runs the
 * handler: a fresh Worker replays the program, every call it made before
 * answering from storage, until it reaches the new result.
 *
 * A replay must hand the program its answers in the order the first run did,
 * or a program that fans out numbers its later calls differently and the
 * replay no longer matches its own record. So each run of the handler is a
 * turn, recorded as an `Activity` (`turn/<k>`): the parked waits it delivered
 * at its start, in order. Within a turn every immediate result is stamped when
 * it is reached and handed over in stamp order — live, a result waits for any
 * earlier-stamped one still on its way back; on a replay, each waits until
 * the program has gone idle on the last and nothing it asked for is still
 * being looked up. Both orders are the same order.
 */

import type { WorkflowEffectKind, WorkflowFailure } from "@cawco/core";
import { failureOf } from "@cawco/core/workflow-program";
import { WORKER_URL, writeProgram } from "@cawco/core/workflow-sandbox";
import type { WorkerOut, WorkerStart } from "@cawco/core/workflow-worker";
import { SqliteClient } from "@effect/sql-sqlite-bun";
import {
  Context,
  Crypto,
  Duration,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  Option,
  Scheduler,
  Schema,
  type Scope,
} from "effect";
import {
  ClusterSchema,
  ClusterWorkflowEngine,
  EntityAddress,
  EntityId,
  EntityType,
  MessageStorage,
  RunnerAddress,
  Sharding,
  SingleRunner,
} from "effect/cluster";
import {
  Activity,
  DurableClock,
  DurableDeferred,
  Workflow,
  WorkflowEngine,
} from "effect/workflow";

/** What a `w.*` call came back with, as the program is handed it. */
export type Outcome = { result: unknown } | { failure: WorkflowFailure };

/** What the engine needs from the hub around it. */
export interface EngineHost {
  /**
   * A question's wait ran out before it was answered: its step and its entry
   * in the pending ledger end as timed out.
   */
  readonly askTimedOut: (runId: string, seq: number) => void;
  /** A child run's outcome once its row has ended; undefined while it runs. */
  readonly childOutcome: (childRunId: string) => Outcome | undefined;
  /** The program returned or threw: its run ends with that outcome. */
  readonly finished: (runId: string, outcome: Outcome) => void;
  /**
   * The hold the step at `seq` is in, or ended in, when it ran out of
   * attempts and was held for its supervisor: the hold whose deadline clock
   * to look at. Undefined for a step never held.
   */
  readonly hold: (runId: string, seq: number) => number | undefined;
  /**
   * The step's hold `hold` ran out: the StepError it ends with, handed to the
   * program. Undefined when the step has moved on since — retried, or held
   * again — and there is nothing to hand over.
   */
  readonly holdExpired: (
    runId: string,
    seq: number,
    hold: number
  ) => Outcome | undefined;
  /**
   * Opens a call the run waits on: a step's row and first attempt, a parked
   * question, a sleep, a child run's row. Throws when it cannot open, and the
   * program is handed that failure.
   */
  readonly open: (
    runId: string,
    seq: number,
    kind: WorkflowEffectKind,
    args: Record<string, unknown>
  ) => Promise<{ childRunId?: string }>;
  /** Performs a call whose answer is immediate. Never rejects. */
  readonly perform: (
    runId: string,
    seq: number,
    kind: WorkflowEffectKind,
    args: Record<string, unknown>
  ) => Promise<Outcome>;
  /** The run's row: its program, inputs and where it stands. */
  readonly run: (runId: string) =>
    | {
        failure: string | null;
        inputs: Record<string, unknown>;
        program: string;
        result: unknown;
        status: string;
      }
    | undefined;
  /**
   * For a run re-run from a step: the call at `seq`, if it comes before that
   * step, answered with what the run it re-runs got there — its outcome, and
   * the hash that run recorded for the call, which must match this one's.
   * Undefined for every other call. Throws when the call cannot be answered
   * that way, and the run fails with the reason.
   */
  readonly seed: (
    runId: string,
    seq: number,
    kind: WorkflowEffectKind,
    args: Record<string, unknown>,
    hash: string
  ) => Promise<{ hash: string; outcome: Outcome } | undefined>;
}

export interface WorkflowEngineHandle {
  /** Clears an ended run's execution from the engine's storage: its row is going. */
  readonly forget: (runId: string) => Promise<void>;
  /**
   * A step went on hold: its deadline, a clock that wakes the run in `ms` to
   * hand the program the step's failure if that hold is still on then.
   */
  readonly hold: (
    runId: string,
    seq: number,
    hold: number,
    ms: number
  ) => Promise<void>;
  /** Ends a run's execution: its live driver stops, a suspended one ends. */
  readonly interrupt: (runId: string) => Promise<void>;
  /** Settles when the engine is up; rejects with why it could not start. */
  readonly ready: Promise<void>;
  /**
   * What a run's call at `seq` recorded in the engine: the hash of the call,
   * and its outcome when the call was answered at once (an immediate call, a
   * wait that could not open, a call seeded from a re-run). A wait's own
   * outcome lives with its step.
   */
  readonly recorded: (
    runId: string,
    seq: number
  ) => Promise<{ hash: string; outcome?: Outcome } | undefined>;
  /** A step or question settled: completes the deferred the run waits on. */
  readonly settle: (
    runId: string,
    seq: number,
    kind: "step" | "ask",
    outcome: Outcome
  ) => Promise<void>;
  /** Starts a top-level run's execution; a no-op for one already started. */
  readonly start: (runId: string) => Promise<void>;
}

/** How a run ended, when it did not end with a result. */
const RunFailed = Schema.Struct({
  status: Schema.Literals(["failed", "cancelled"]),
  message: Schema.String,
});
type RunFailed = typeof RunFailed.Type;

/** Every run is one execution of this workflow, keyed by its run id. */
const CawcoRun = Workflow.make("cawco-run", {
  payload: { runId: Schema.String },
  success: Schema.String,
  error: RunFailed,
  idempotencyKey: ({ runId }) => runId,
});

/** Calls the run waits on; every other kind is answered by its activity. */
const WAITS: ReadonlySet<WorkflowEffectKind> = new Set([
  "run",
  "spawn",
  "ask",
  "sleep",
  "workflow",
]);

/**
 * The shard count is part of where every stored message lives: it must never
 * change once a run has been stored under it.
 */
const SHARDS_PER_GROUP = 16;

type Via = "step" | "answer" | "timeout" | "clock" | "child" | "hold";
/** What a turn delivered at its start: the parked waits whose result had come. */
interface TurnRecord {
  deliver: { seq: number; via: Via; outcome?: Outcome }[];
  start: number;
}

/** Stable JSON so the same call always hashes the same way. */
const canonical = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return value === undefined ? "null" : JSON.stringify(value);
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
const hashCall = (kind: WorkflowEffectKind, args: unknown) =>
  new Bun.CryptoHasher("sha256")
    .update(canonical({ kind, args }))
    .digest("hex");

let lastStamp = 0;
/** When a result was reached: increasing across the process and its restarts. */
const stamp = () => {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return lastStamp;
};

/** A failure as the run's own words. */
const messageOf = (failure: WorkflowFailure) =>
  failure.kind ? `${failure.kind}: ${failure.message}` : failure.message;

/** The deadline clock of a step's hold: one per hold, since a clock fires once. */
const holdClock = (seq: number, hold: number) => `${seq}:hold/${hold}`;

const changed = (seq: number, kind: string | undefined) =>
  new Error(
    `The program changed at effect ${seq}${kind ? ` (${kind})` : ""}: a run replays the program it started with.`
  );
const changedSinceRerun = (seq: number, kind: string) =>
  new Error(
    `The workflow changed at effect ${seq} (${kind}) since the run this one re-runs: re-run it from an earlier step, or from the start.`
  );

/**
 * What a call's activity stores: its hash, and either what it opened (a wait
 * that is now parked) or the outcome the program is handed, stamped. `seeded`
 * marks an outcome taken from the run a re-run re-runs; `refused` a call that
 * could not be seeded, which fails the run.
 */
interface StoredCall {
  hash: string;
  opened?: { childRunId?: string };
  outcome?: Outcome;
  refused?: string;
  seeded?: boolean;
  stamp?: number;
}

/** The engine primitives a driver uses, bound to one handler run. */
interface DriverIO {
  /** Runs `execute` once as the activity `name`; answers what it stored. */
  readonly activity: (
    name: string,
    execute: () => Promise<string>
  ) => Promise<string>;
  /** Whether the clock `name` has fired. */
  readonly clockFired: (name: string) => Promise<boolean>;
  /** The value the deferred `name` was completed with, if it has been. */
  readonly deferred: (name: string) => Promise<string | undefined>;
  /** Schedules the clock `name` to fire in `ms`. */
  readonly scheduleClock: (name: string, ms: number) => Promise<void>;
  /** When this handler run began: a turn recorded earlier is a replay. */
  readonly start: number;
  /** Starts a child run's execution, tied to this one. */
  readonly startChild: (childRunId: string) => Promise<void>;
}

interface Call {
  args: Record<string, unknown>;
  childRunId?: string;
  id: number;
  kind: WorkflowEffectKind;
  outcome?: Outcome;
  seq: number;
  stamp: number;
  /**
   * `working` while its activity runs; `parked` on a wait with no result yet;
   * `ready` with an outcome the program has not been handed; `delivered`.
   */
  state: "working" | "parked" | "ready" | "delivered";
}

/**
 * Plays one run's program from its start to the point it next waits, or to
 * its end, in a fresh Worker — one handler run of `cawco-run`.
 */
class RunDriver {
  readonly #calls = new Map<number, Call>();
  #worker: Worker | undefined;
  /** Activities in flight. */
  #working = 0;
  /** Answers handed to the program, and how many it has gone idle after. */
  #posted = 0;
  #idle = -1;
  /** When the turn being played was recorded. */
  #turnStart = 0;
  /** Stamps given to results performed live that have not come back yet. */
  readonly #inTransit = new Map<number, number>();
  #end: { outcome: Outcome } | { error: Error } | undefined;
  #wake: (() => void) | undefined;
  readonly #runId: string;
  readonly #io: DriverIO;
  readonly #host: EngineHost;

  constructor(runId: string, io: DriverIO, host: EngineHost) {
    this.#runId = runId;
    this.#io = io;
    this.#host = host;
  }

  /** Plays to the next suspension (`"suspend"`) or to the program's outcome. */
  async play(
    program: string,
    inputs: Record<string, unknown>
  ): Promise<Outcome | "suspend"> {
    try {
      for (let turn = 0; ; turn += 1) {
        // biome-ignore lint/performance/noAwaitInLoops: each turn starts only where the last one went quiet
        const record = await this.#turn(turn);
        this.#turnStart = record.start;
        if (turn === 0) {
          this.#startWorker(program, inputs);
        }
        for (const entry of record.deliver) {
          // biome-ignore lint/performance/noAwaitInLoops: a turn's waits are handed over in the order it recorded
          await this.#deliverParked(entry);
        }
        await this.#quiet();
        const end = this.#end;
        if (end) {
          if ("error" in end) {
            throw end.error;
          }
          return end.outcome;
        }
        if (!this.#replaying()) {
          if (![...this.#calls.values()].some((c) => c.state === "parked")) {
            throw new Error(
              "The program is waiting on nothing: every w.* call it made has settled, but it has not returned."
            );
          }
          return "suspend";
        }
      }
    } finally {
      this.#worker?.terminate();
    }
  }

  /** Whether the turn being played was recorded by an earlier handler run. */
  #replaying() {
    return this.#turnStart < this.#io.start;
  }

  /** Stops the program where it is: a cancel, or the handler interrupted. */
  stop(reason = "This workflow run has ended.") {
    this.#end ??= { error: new Error(reason) };
    this.#worker?.terminate();
    this.#poke();
  }

  // ------------------------------------------------------------------ turns

  /** The record of turn `k`: read back on a replay, made now on a live one. */
  async #turn(k: number): Promise<TurnRecord> {
    const stored = await this.#io.activity(`turn/${k}`, async () => {
      const deliver: TurnRecord["deliver"] = [];
      const parked = [...this.#calls.values()]
        .filter((call) => call.state === "parked")
        .sort((a, b) => a.seq - b.seq);
      for (const call of parked) {
        // biome-ignore lint/performance/noAwaitInLoops: the record is one ordered list
        const due = await this.#due(call);
        if (due) {
          deliver.push(due);
        }
      }
      return JSON.stringify({ start: Date.now(), deliver });
    });
    return JSON.parse(stored) as TurnRecord;
  }

  /** Whether a parked wait's result has come, and by which way. */
  async #due(call: Call): Promise<TurnRecord["deliver"][number] | undefined> {
    const { seq } = call;
    switch (call.kind) {
      case "run":
      case "spawn":
        return await this.#stepDue(seq);
      case "ask":
        if ((await this.#io.deferred(`${seq}:ask`)) !== undefined) {
          return { seq, via: "answer" };
        }
        if (
          call.args.waitFor !== undefined &&
          (await this.#io.clockFired(`${seq}:ask-timeout`))
        ) {
          this.#host.askTimedOut(this.#runId, seq);
          return { seq, via: "timeout" };
        }
        return undefined;
      case "sleep":
        return (await this.#io.clockFired(`${seq}:sleep`))
          ? { seq, via: "clock" }
          : undefined;
      default: {
        // A child's reply is stored only after it wakes this run, so its
        // outcome is read off its row and kept in this record.
        const outcome = call.childRunId
          ? this.#host.childOutcome(call.childRunId)
          : undefined;
        return outcome ? { seq, via: "child", outcome } : undefined;
      }
    }
  }

  /**
   * A step's outcome has come when the hub settled it, or when a hold its
   * supervisor left undecided ran out. Nothing completes the step's deferred
   * then, so the failure is read off its row and kept in this record, as a
   * child's outcome is.
   */
  async #stepDue(
    seq: number
  ): Promise<TurnRecord["deliver"][number] | undefined> {
    if ((await this.#io.deferred(`${seq}:step`)) !== undefined) {
      return { seq, via: "step" };
    }
    const hold = this.#host.hold(this.#runId, seq);
    if (
      hold === undefined ||
      !(await this.#io.clockFired(holdClock(seq, hold)))
    ) {
      return;
    }
    const outcome = this.#host.holdExpired(this.#runId, seq, hold);
    return outcome ? { seq, via: "hold", outcome } : undefined;
  }

  async #deliverParked(entry: TurnRecord["deliver"][number]) {
    const call = this.#calls.get(entry.seq);
    if (call?.state !== "parked") {
      throw changed(entry.seq, call?.kind);
    }
    this.#post(call, entry.outcome ?? (await this.#collect(call, entry.via)));
  }

  /** A delivered wait's outcome, from the engine's storage. */
  async #collect(call: Call, via: Via): Promise<Outcome> {
    if (via === "timeout") {
      return {
        failure: { name: "AskError", kind: "timeout", message: "ask-timeout" },
      };
    }
    if (via === "clock") {
      return { result: null };
    }
    const stored = await this.#io.deferred(
      `${call.seq}:${via === "step" ? "step" : "ask"}`
    );
    if (stored === undefined) {
      throw new Error(
        `The engine lost the result of effect ${call.seq} (${call.kind}).`
      );
    }
    return JSON.parse(stored) as Outcome;
  }

  // ------------------------------------------------------------------ calls

  #startWorker(program: string, inputs: Record<string, unknown>) {
    const worker = new Worker(WORKER_URL, { type: "module" });
    this.#worker = worker;
    worker.addEventListener("message", (event: MessageEvent<WorkerOut>) =>
      this.#onMessage(event.data)
    );
    worker.addEventListener("error", (event) =>
      this.#halt(new Error(String(event.message ?? event)))
    );
    worker.postMessage({
      mode: "run",
      path: writeProgram(program),
      runId: this.#runId,
      inputs,
    } satisfies WorkerStart);
  }

  #onMessage(message: WorkerOut) {
    if (this.#end) {
      return;
    }
    switch (message.type) {
      case "effect":
        this.#onCall(message);
        return;
      case "idle":
        this.#idle = message.answered;
        break;
      case "done":
        this.#end = { outcome: { result: message.result } };
        break;
      case "failed":
        this.#end = { outcome: { failure: message.failure } };
        break;
      default:
        return;
    }
    this.#poke();
  }

  #onCall(message: Extract<WorkerOut, { type: "effect" }>) {
    const status = this.#host.run(this.#runId)?.status;
    if (status !== "running" && status !== "waiting") {
      this.stop();
      return;
    }
    const kind = message.kind as WorkflowEffectKind;
    const call: Call = {
      seq: message.seq,
      id: message.id,
      kind,
      args: (message.args ?? {}) as Record<string, unknown>,
      state: "working",
      stamp: 0,
    };
    this.#calls.set(call.seq, call);
    this.#working += 1;
    const hash = hashCall(kind, call.args);
    (WAITS.has(kind) ? this.#open(call, hash) : this.#perform(call, hash))
      .catch((error: unknown) =>
        this.#halt(error instanceof Error ? error : new Error(String(error)))
      )
      .finally(() => {
        this.#working -= 1;
        this.#poke();
      });
  }

  /** Stamps a result reached live, and notes it is on its way back. */
  #stampFor(call: Call) {
    const at = stamp();
    this.#inTransit.set(call.seq, at);
    return at;
  }

  /**
   * A call before the step a re-run starts from, answered with what the run
   * it re-runs got there; undefined for any other call.
   */
  async #seeded(call: Call, hash: string): Promise<StoredCall | undefined> {
    try {
      const seeded = await this.#host.seed(
        this.#runId,
        call.seq,
        call.kind,
        call.args,
        hash
      );
      return seeded
        ? {
            hash: seeded.hash,
            seeded: true,
            stamp: this.#stampFor(call),
            outcome: seeded.outcome,
          }
        : undefined;
    } catch (error) {
      return { hash, refused: failureOf(error).message };
    }
  }

  /** An immediate call: performed once, its outcome stamped and stored. */
  #perform(call: Call, hash: string) {
    return this.#settle(call, hash, async () => {
      const seeded = await this.#seeded(call, hash);
      if (seeded) {
        return seeded;
      }
      const outcome = await this.#host.perform(
        this.#runId,
        call.seq,
        call.kind,
        call.args
      );
      return { hash, stamp: this.#stampFor(call), outcome };
    });
  }

  /** A call the run waits on: opened once, then parked on its wait. */
  #open(call: Call, hash: string) {
    return this.#settle(call, hash, async () => {
      const seeded = await this.#seeded(call, hash);
      if (seeded) {
        return seeded;
      }
      try {
        const opened = await this.#host.open(
          this.#runId,
          call.seq,
          call.kind,
          call.args
        );
        await this.#arm(call, opened);
        return { hash, opened };
      } catch (error) {
        return {
          hash,
          stamp: this.#stampFor(call),
          outcome: { failure: failureOf(error) },
        };
      }
    });
  }

  /**
   * Runs a call's activity — `execute` once, its stored value on every replay
   * — checks the recorded hash, and leaves the call ready with its outcome or
   * parked on its wait.
   */
  async #settle(call: Call, hash: string, execute: () => Promise<StoredCall>) {
    const stored = JSON.parse(
      await this.#io.activity(String(call.seq), async () =>
        JSON.stringify(await execute())
      )
    ) as StoredCall;
    this.#inTransit.delete(call.seq);
    if (stored.refused) {
      throw new Error(stored.refused);
    }
    if (stored.hash !== hash) {
      throw stored.seeded
        ? changedSinceRerun(call.seq, call.kind)
        : changed(call.seq, call.kind);
    }
    if (stored.outcome) {
      call.outcome = stored.outcome;
      call.stamp = stored.stamp ?? 0;
      call.state = "ready";
      return;
    }
    call.childRunId = stored.opened?.childRunId;
    call.state = "parked";
  }

  /** What a wait needs from the engine besides its rows: a clock, a child. */
  async #arm(call: Call, opened: { childRunId?: string }) {
    if (call.kind === "sleep") {
      await this.#io.scheduleClock(
        `${call.seq}:sleep`,
        Math.max(0, Number(call.args.ms) || 0)
      );
    } else if (call.kind === "ask" && call.args.waitFor !== undefined) {
      await this.#io.scheduleClock(
        `${call.seq}:ask-timeout`,
        Math.max(0, Number(call.args.waitFor)) * 3_600_000
      );
    } else if (call.kind === "workflow" && opened.childRunId) {
      await this.#io.startChild(opened.childRunId);
    }
  }

  // --------------------------------------------------------------- delivery

  #post(call: Call, outcome: Outcome) {
    call.state = "delivered";
    call.outcome = outcome;
    this.#posted += 1;
    this.#worker?.postMessage(
      "failure" in outcome
        ? { type: "effect-error", id: call.id, failure: outcome.failure }
        : { type: "effect-result", id: call.id, result: outcome.result }
    );
  }

  /**
   * Hands the program what is ready, in stamp order. Live, as soon as no
   * earlier-stamped result is still on its way back; on a replay, one at a
   * time, each once the program has gone idle on the last and nothing it
   * asked for is still being looked up.
   */
  #pump() {
    const ready = () =>
      [...this.#calls.values()]
        .filter((call) => call.state === "ready")
        .sort((a, b) => a.stamp - b.stamp);
    if (!this.#replaying()) {
      const held = Math.min(
        Number.POSITIVE_INFINITY,
        ...this.#inTransit.values()
      );
      for (const call of ready()) {
        if (call.stamp > held) {
          return;
        }
        this.#post(call, call.outcome as Outcome);
      }
      return;
    }
    while (this.#idle === this.#posted && this.#working === 0) {
      const [next] = ready();
      if (!next) {
        return;
      }
      this.#post(next, next.outcome as Outcome);
    }
  }

  /** Nothing in flight, nothing to hand over, and the program idle on it all. */
  #isQuiet() {
    return (
      this.#idle === this.#posted &&
      this.#working === 0 &&
      ![...this.#calls.values()].some((call) => call.state === "ready")
    );
  }

  async #quiet() {
    this.#pump();
    while (!(this.#end || this.#isQuiet())) {
      // biome-ignore lint/performance/noAwaitInLoops: waits for the next event, then looks again
      await new Promise<void>((resolve) => {
        this.#wake = resolve;
      });
    }
  }

  #poke() {
    if (!this.#end) {
      this.#pump();
    }
    const wake = this.#wake;
    this.#wake = undefined;
    wake?.();
  }

  #halt(error: Error) {
    this.#end ??= { error };
    this.#worker?.terminate();
    this.#poke();
  }
}

/** What a `cawco-run` handler runs with: the engine and its own execution. */
type HandlerServices =
  | WorkflowEngine.WorkflowEngine
  | WorkflowEngine.WorkflowInstance
  | Scope.Scope;

/** The engine primitives a driver uses, bound to one handler run's services. */
function driverIO(
  services: Context.Context<HandlerServices>,
  signal: AbortSignal
): DriverIO {
  const engine = Context.get(services, WorkflowEngine.WorkflowEngine);
  const instance = Context.get(services, WorkflowEngine.WorkflowInstance);
  const run = <A, E>(effect: Effect.Effect<A, E, HandlerServices>) =>
    Effect.runPromiseWith(services)(effect, { signal });
  return {
    start: Date.now(),
    activity: (name, execute) =>
      run(
        Activity.make({
          name,
          success: Schema.String,
          execute: Effect.promise(execute),
        })
      ),
    deferred: async (name) => {
      const exit = await run(
        engine.deferredResult(
          DurableDeferred.make(name, { success: Schema.String })
        )
      );
      return Option.isSome(exit) && Exit.isSuccess(exit.value)
        ? exit.value.value
        : undefined;
    },
    clockFired: async (name) =>
      Option.isSome(
        await run(
          engine.deferredResult(
            DurableClock.make({ name, duration: 0 }).deferred
          )
        )
      ),
    scheduleClock: (name, ms) =>
      run(
        engine.scheduleClock(instance.workflow, {
          executionId: instance.executionId,
          clock: DurableClock.make({ name, duration: Duration.millis(ms) }),
        })
      ),
    startChild: async (childRunId) => {
      await run(CawcoRun.execute({ runId: childRunId }, { discard: true }));
    },
  };
}

/** Web Crypto as Effect's `Crypto`, which the message storage hashes long keys with. */
const CryptoLive = Layer.succeed(Crypto.Crypto)(
  Crypto.make({
    randomBytes: (size) => crypto.getRandomValues(new Uint8Array(size)),
    digest: (algorithm, data) =>
      Effect.map(
        Effect.promise(() =>
          crypto.subtle.digest(algorithm, new Uint8Array(data))
        ),
        (buffer) => new Uint8Array(buffer)
      ),
  })
);

/**
 * Starts the engine over the SQLite file at `dbPath`. It does not fall back:
 * an engine that cannot start leaves `ready` rejected with the reason, the
 * hub logs it, and no workflow runs.
 */
export function createWorkflowEngine(
  dbPath: string,
  host: EngineHost
): WorkflowEngineHandle {
  /** The driver of each run whose handler is running in this process. */
  const drivers = new Map<string, RunDriver>();

  /**
   * A run whose row has already ended answers from it without playing its
   * program: a replay after its end, or a cancel that reached the row first.
   */
  const fromRow = (
    runId: string
  ): Effect.Effect<string, RunFailed> | undefined => {
    const row = host.run(runId);
    if (!row) {
      return Effect.fail({
        status: "failed",
        message: `No workflow run ${runId}.`,
      });
    }
    if (row.status === "done") {
      return Effect.succeed(JSON.stringify(row.result ?? null));
    }
    if (row.status === "failed" || row.status === "cancelled") {
      return Effect.fail({
        status: row.status,
        message: row.failure ?? row.status,
      });
    }
    return undefined;
  };

  const handler = (payload: { readonly runId: string }) =>
    Effect.gen(function* () {
      const { runId } = payload;
      const ended = fromRow(runId);
      if (ended) {
        return yield* ended;
      }
      const row = host.run(runId) as NonNullable<ReturnType<EngineHost["run"]>>;
      const services = yield* Effect.context<HandlerServices>();
      const aborts = new AbortController();
      const played = yield* Effect.callback<Outcome | "suspend">((resume) => {
        const driver = new RunDriver(
          runId,
          driverIO(services, aborts.signal),
          host
        );
        drivers.set(runId, driver);
        driver.play(row.program, row.inputs).then(
          (value) => resume(Effect.succeed(value)),
          (error: unknown) =>
            resume(Effect.succeed({ failure: failureOf(error) }))
        );
        return Effect.sync(() => {
          driver.stop();
          aborts.abort();
        });
      }).pipe(Effect.ensuring(Effect.sync(() => drivers.delete(runId))));
      if (played === "suspend") {
        return yield* Workflow.suspend(
          Context.get(services, WorkflowEngine.WorkflowInstance)
        );
      }
      const cancelled = fromRow(runId);
      if (cancelled) {
        return yield* cancelled;
      }
      host.finished(runId, played);
      if ("failure" in played) {
        return yield* Effect.fail<RunFailed>({
          status: "failed",
          message: messageOf(played.failure),
        });
      }
      return JSON.stringify(played.result ?? null);
    });

  const layer = CawcoRun.toLayer(handler).pipe(
    Layer.provideMerge(ClusterWorkflowEngine.layer),
    Layer.provideMerge(
      SingleRunner.layer({
        // One hub process owns every shard: nothing to lock against, and no
        // lock left behind by an unclean stop to wait out on the next start.
        runnerStorage: "memory",
        shardingConfig: {
          runnerAddress: Option.some(RunnerAddress.make("localhost", 34_431)),
          shardsPerGroup: SHARDS_PER_GROUP,
          // Clocks fire from storage polls: a sleep is this late at most.
          entityMessagePollInterval: Duration.seconds(2),
        },
      })
    ),
    Layer.provide(SqliteClient.layer({ filename: dbPath })),
    Layer.provide(CryptoLive),
    // bun:sqlite is synchronous, and drizzle writes the same file on its own
    // connection. With no cooperative yields a storage transaction runs in
    // one burst, so it never holds the write lock while drizzle runs.
    Layer.provideMerge(Layer.succeed(Scheduler.PreventSchedulerYield)(true))
  );
  const runtime = ManagedRuntime.make(layer);
  const ready = runtime.runPromise(Effect.void);
  ready.catch((error: unknown) => {
    console.error("[workflows] the workflow engine did not start:", error);
  });

  const executionIdOf = (runId: string) =>
    runtime.runPromise(CawcoRun.executionId({ runId }));

  return {
    ready,
    async start(runId) {
      await ready;
      await runtime.runPromise(CawcoRun.execute({ runId }, { discard: true }));
    },
    async settle(runId, seq, kind, outcome) {
      await ready;
      const executionId = await executionIdOf(runId);
      const name = `${seq}:${kind}`;
      await runtime.runPromise(
        Effect.gen(function* () {
          const engine = yield* WorkflowEngine.WorkflowEngine;
          yield* engine.deferredDone(
            DurableDeferred.make(name, { success: Schema.String }),
            {
              workflowName: CawcoRun._tag,
              executionId,
              deferredName: name,
              exit: Exit.succeed(JSON.stringify(outcome)),
            }
          );
        })
      );
    },
    async hold(runId, seq, hold, ms) {
      await ready;
      const executionId = await executionIdOf(runId);
      await runtime.runPromise(
        Effect.gen(function* () {
          const engine = yield* WorkflowEngine.WorkflowEngine;
          yield* engine.scheduleClock(CawcoRun, {
            executionId,
            clock: DurableClock.make({
              name: holdClock(seq, hold),
              duration: Duration.millis(ms),
            }),
          });
        })
      );
    },
    async interrupt(runId) {
      drivers.get(runId)?.stop();
      await ready;
      await runtime.runPromise(CawcoRun.interrupt(await executionIdOf(runId)));
    },
    async forget(runId) {
      await ready;
      const executionId = await executionIdOf(runId);
      await runtime.runPromise(
        Effect.gen(function* () {
          const storage = yield* MessageStorage.MessageStorage;
          // The execution's own mailbox and its clocks'.
          for (const entityType of [RUN_ENTITY, CLOCK_ENTITY]) {
            yield* storage.clearAddress(
              yield* addressOf(executionId, entityType)
            );
          }
        })
      );
    },
    async recorded(runId, seq) {
      await ready;
      const executionId = await executionIdOf(runId);
      const exit = await runtime.runPromise(
        Effect.gen(function* () {
          const storage = yield* MessageStorage.MessageStorage;
          const requestId = yield* storage.requestIdForPrimaryKey({
            address: yield* addressOf(executionId, RUN_ENTITY),
            tag: "activity",
            // Every call's activity runs once, as attempt 1.
            id: `${seq}/1`,
          });
          const replies = Option.isSome(requestId)
            ? yield* storage.repliesForUnfiltered([requestId.value])
            : [];
          const last = replies.at(-1);
          return last?._tag === "WithExit" ? last.exit : null;
        })
      );
      const value = storedValue(exit);
      return value === undefined
        ? undefined
        : (JSON.parse(value) as StoredCall);
    },
  };
}

/**
 * The entity types ClusterWorkflowEngine files an execution's messages under:
 * its own mailbox (`run`, `activity`, `deferred`, `resume`), and its clocks'.
 */
const RUN_ENTITY = `Workflow/${CawcoRun._tag}`;
const CLOCK_ENTITY = "Workflow/-/DurableClock";

/** Where an execution's messages of one entity type live. */
const addressOf = (executionId: string, entityType: string) =>
  Effect.gen(function* () {
    const sharding = yield* Sharding.Sharding;
    const entityId = EntityId.make(executionId);
    return EntityAddress.make({
      entityType: EntityType.make(entityType),
      entityId,
      shardId: sharding.getShardId(
        entityId,
        Context.get(CawcoRun.annotations, ClusterSchema.ShardGroup)(entityId)
      ),
    });
  });

/**
 * The value an activity completed with, out of its stored reply: the RPC's
 * exit, holding the workflow result, holding the activity's own exit.
 */
function storedValue(exit: unknown): string | undefined {
  if (!exit || typeof exit !== "object") {
    return;
  }
  const rpc = exit as {
    _tag?: string;
    value?: { _tag?: string; exit?: { _tag?: string; value?: unknown } };
  };
  const inner = rpc.value?.exit;
  return rpc._tag === "Success" &&
    rpc.value?._tag === "Complete" &&
    inner?._tag === "Success" &&
    typeof inner.value === "string"
    ? inner.value
    : undefined;
}

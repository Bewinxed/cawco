import type { Bounded } from "@cawco/core/bounded";
import {
  CONTROL_REPLIES,
  type ControlReply,
  FS_REPLIES,
  type FsOp,
  type FsReply,
} from "@cawco/core/control-replies";
import type { ControlArgs, ControlName } from "@cawco/core/control-table";
import type {
  ControlRefusal,
  FramePayload,
  HarnessFailed,
  HarnessUnanswered,
} from "@cawco/core/frames";
import type { HarnessKind } from "@cawco/core/harness/kinds";
import type { Effect } from "effect";
import { HTTPError, problem } from "elysia";
import type { z } from "zod";
import { received } from "./stored-json";

/**
 * What a request to a machine gets when its own deadline passes with the
 * machine away: held for it all that time, and sent again each time it came
 * back (machine-calls.ts `resendHeld`), it never answered. A machine that is there
 * at the deadline and silent is unanswered instead. True of a write only: a
 * read runs nothing, and is answered as its machine being away (`asRead`).
 */
export const MACHINE_DISCONNECTED =
  "The machine was away when this request's deadline passed: the hub held the request and sent it again each time the machine came back, and no answer came in time, so whether it ran is not known. Check what it does before asking again.";

/** A machine ask that got no answer: not connected ("dead") or silent past its deadline ("timeout"). */
export type Unanswered = Extract<Bounded<unknown>, { kind: "unanswered" }>;

/**
 * The answer to a machine that is away (not connected): 503, `machine-away`,
 * in `detail`'s words, naming the machine. Wherever it is answered from, the
 * hub's one hook (machine-reads.ts `nameAwayMachine`) reads `machineId` off
 * it and sets the `X-Cawco-Machine` headers a dashboard reads it by; a tool's
 * call, which answers no headers, says its words.
 */
export const awayProblem = (machineId: string, detail: string) =>
  problem(503, { code: "machine-away", detail, machineId });

/** The answer to a machine that did not answer in time: 504, `machine-silent`, in `detail`'s words. */
export const silentProblem = (detail: string) =>
  problem(504, { code: "machine-silent", detail });

/**
 * A machine call left unanswered, answered by its cause: not connected
 * (`dead`) {@link awayProblem}, silent past its deadline
 * {@link silentProblem}, in `words`, or each its own.
 */
export const unansweredIn = (
  machineId: string,
  answer: Unanswered,
  words: string | { away: string; silent: string }
) => {
  const { away, silent } =
    typeof words === "string" ? { away: words, silent: words } : words;
  return answer.reason === "dead"
    ? awayProblem(machineId, away)
    : silentProblem(silent);
};

/** {@link awayProblem}'s answer. */
export type AwayProblem = ReturnType<typeof awayProblem>;

/** {@link silentProblem}'s answer. */
export type SilentProblem = ReturnType<typeof silentProblem>;

/** A machine that answered a call with its failure: 502, in the machine's words, at the code of what failed. */
export type MachineFailed = ReturnType<
  typeof problem<502, { code: string; detail: string }>
>;

/**
 * A machine's cause thrown where its caller throws (server.ts `callMachine`,
 * a session's context read, a hub start): Elysia's own thrown problem
 * (`HTTPError`), whose `value()` is the problem it holds, so a route it
 * reaches answers that problem, and the hub's error hook names an away
 * machine on it (machine-reads.ts `nameAwayMachine`). Its message is the problem's words, for a caller that
 * catches it and says them.
 */
export class MachineProblem extends HTTPError {
  /** As `problem()` writes it: the problem's `code` says what it is. */
  readonly type = "about:blank";
  readonly problem: AwayProblem | SilentProblem | MachineFailed;
  constructor(answer: AwayProblem | SilentProblem | MachineFailed) {
    super(answer.response.detail);
    this.name = "MachineProblem";
    this.problem = answer;
  }
  override value() {
    return this.problem;
  }
  /** The same cause in `detail`'s words: what a step says of it as it passes it up. */
  saying(detail: string): MachineProblem {
    const held = this.problem;
    if (held.status === 503) {
      return new MachineProblem(awayProblem(held.response.machineId, detail));
    }
    return new MachineProblem(
      held.status === 504
        ? silentProblem(detail)
        : problem(502, { code: held.response.code, detail })
    );
  }
}

/**
 * A thrown `error` said again in `words` by a step that passes it up: a
 * machine's cause keeps its status and code ({@link MachineProblem.saying}),
 * anything else is an Error of those words with it as its cause.
 */
export const thrownAgain = (error: unknown, words: string): Error =>
  error instanceof MachineProblem
    ? error.saying(words)
    : new Error(words, { cause: error });

/** The frame a forwarded `control` comes back as, whoever asked for it. */
export type ControlResult = Extract<FramePayload, { kind: "control_result" }>;

/** What of a {@link ControlResult} its answer is read from. */
type AnswerFrame = Pick<
  ControlResult,
  "ok" | "result" | "error" | "refusal" | "unanswered" | "failed"
>;

/**
 * The code of a machine's refusal to cut a workspace again because `origin`
 * no longer holds the commit it retired on (core frames.ts `ControlRefusal`
 * `commit-gone`, server.ts `callMachine`).
 */
export const CUT_COMMIT_GONE = "workspace-commit-gone";

/** The code a machine's answer that does not parse against its reply's schema fails at ({@link answerOf}). */
export const MALFORMED_REPLY = "machine-reply-malformed";

/**
 * A machine's answer to a call the hub made, parsed against its reply's
 * schema (core control-replies.ts): `ok`, its reply as its type; or failed,
 * in the machine's words, or, `code` {@link MALFORMED_REPLY}, a reply that
 * is not its type, in words that name what is wrong with it.
 */
export type CallAnswer<T> =
  | {
      ok: true;
      result: T;
      error?: undefined;
      /** `listSessions` only: the harnesses that did not list in time ({@link ControlResult}). */
      unanswered?: HarnessUnanswered[];
      /** `listSessions` only: the harnesses whose listing threw ({@link ControlResult}). */
      failed?: HarnessFailed[];
    }
  | {
      ok: false;
      error: string | undefined;
      result?: undefined;
      code?: typeof MALFORMED_REPLY;
      /** Why the machine's agent refused the call, typed, as its frame said ({@link ControlResult}). */
      refusal?: ControlRefusal;
    };

/** A machine's answer to control `K` ({@link CallAnswer}). */
export type ControlAnswer<K extends ControlName> = CallAnswer<ControlReply<K>>;

/**
 * An ask of a machine's agent (machine-calls.ts `askMachine`): control
 * `method`'s answer, parsed as its reply's type, or unanswered.
 */
export type AgentAsk = <K extends ControlName>(
  machineId: string,
  method: K,
  args: ControlArgs<K>,
  harness?: HarnessKind,
  instanceId?: string
) => Effect.Effect<Bounded<ControlAnswer<K>>>;

/**
 * The promise edge of an {@link AgentAsk} (machine-calls.ts `callAgent`),
 * for a caller that is promise code.
 */
export type AgentCall = <K extends ControlName>(
  machineId: string,
  method: K,
  args: ControlArgs<K>,
  harness?: HarnessKind,
  instanceId?: string
) => Promise<Bounded<ControlAnswer<K>>>;

/**
 * A machine-scoped call that answers control `method`'s reply, parsed as
 * its type, or throws its cause (server.ts `callMachine`).
 */
export type MachineCall = <K extends ControlName>(
  machineId: string,
  method: K,
  args: ControlArgs<K>
) => Promise<ControlReply<K>>;

/** A machine's answer to `fs` op `O` ({@link CallAnswer}). */
export type FsAnswer<O extends FsOp> = CallAnswer<FsReply<O>>;

/**
 * `frame`, `machine`'s answer to `what`, read as `schema`'s type: its
 * failure as it came; its reply parsed where it arrives (stored-json.ts
 * `received`), a key the type does not declare left out and said once, and
 * a reply that is not its type failed at {@link MALFORMED_REPLY}. Never
 * throws: a reply that does not parse fails its own call alone.
 */
export const parsedAs = <S extends z.ZodType>(
  schema: S,
  frame: AnswerFrame,
  machine: string,
  what: string
): CallAnswer<z.output<S>> => {
  if (!frame.ok) {
    // A failure that says nothing of why is no failure the house reads: it
    // fails at its own code, in words that say so.
    return frame.error === undefined
      ? {
          ok: false,
          code: MALFORMED_REPLY,
          error: `${machine} answered ${what} with a failure that gave no reason`,
          ...(frame.refusal ? { refusal: frame.refusal } : {}),
        }
      : {
          ok: false,
          error: frame.error,
          ...(frame.refusal ? { refusal: frame.refusal } : {}),
        };
  }
  const read = received(schema, frame.result, `${machine}'s answer to ${what}`);
  return read.ok
    ? {
        ok: true,
        result: read.value,
        ...(frame.unanswered ? { unanswered: frame.unanswered } : {}),
        ...(frame.failed ? { failed: frame.failed } : {}),
      }
    : {
        ok: false,
        code: MALFORMED_REPLY,
        error: `${machine} answered ${what} with a reply that is not its type: ${read.issue}`,
      };
};

/** `frame`, `machine`'s answer to control `method`, parsed against its reply's schema ({@link parsedAs}). */
export const answerOf = <K extends ControlName>(
  method: K,
  frame: AnswerFrame,
  machine: string
): ControlAnswer<K> =>
  parsedAs(CONTROL_REPLIES[method], frame, machine, method);

/** `frame`, `machine`'s answer to `fs` op `op`, parsed against its reply's schema ({@link parsedAs}). */
export const fsAnswerOf = <O extends FsOp>(
  op: O,
  frame: AnswerFrame,
  machine: string
): FsAnswer<O> => parsedAs(FS_REPLIES[op], frame, machine, `fs ${op}`);

/** `answer`'s reply as `read` makes it, once the machine answered it: its failure, or its silence, as it was. */
export const answerAs = <T, U>(
  answer: Bounded<CallAnswer<T>>,
  read: (reply: T) => U
): Bounded<CallAnswer<U>> => {
  if (answer.kind === "unanswered") {
    return answer;
  }
  return answer.value.ok
    ? {
        kind: "answered",
        value: { ok: true, result: read(answer.value.result) },
      }
    : { kind: "answered", value: answer.value };
};

/**
 * A machine's failed answer as the house's 502 a caller throws
 * ({@link MachineProblem}): a reply that did not parse at its own code,
 * any other failure at `code`, in the machine's words or `otherwise`.
 */
export const failedProblem = (
  answer: { error: string | undefined; code?: typeof MALFORMED_REPLY },
  code: string,
  otherwise: string
): MachineFailed =>
  problem(502, {
    code: answer.code ?? code,
    detail: answer.error ?? otherwise,
  });

/** A route's `set`: the headers it answers with. */
export interface RouteSet {
  headers: Record<string, string | number | string[]>;
}

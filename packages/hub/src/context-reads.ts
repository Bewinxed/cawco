import {
  CONTINUATION_CANCELLED,
  estimateTokens,
} from "@cawco/core/continuation";
import type { HarnessKind } from "@cawco/core/harness/kinds";
import { harnessName } from "@cawco/core/harness/kinds";
import type { PermissionMode } from "@cawco/core/harness/modes";
import { traitsOf } from "@cawco/core/harness/traits";
import { catalogHarnessOf } from "@cawco/core/model-names";
import type { InstanceRow } from "@cawco/core/protocol";
import type { GitChanges } from "@cawco/core/session/controls";
import {
  CONTROL_CONTEXT_USAGE,
  CONTROL_GET_SESSION_INFO,
  CONTROL_GET_SESSION_MESSAGES,
  CONTROL_GIT_CHANGES,
  CONTROL_MODEL_CATALOG,
  CONTROL_READ_SESSION_CONTEXT,
} from "@cawco/core/session/controls";
import type { SessionMessage } from "@cawco/core/session-messages";
import { shortId } from "@cawco/core/short-id";
import { secondsOf } from "@cawco/core/time";
import { Deferred, Effect } from "effect";
import { ElysiaStatus, problem } from "elysia";
import { machineAccount } from "./accounts";
import type { ClosureContext } from "./closure-context";
import { finishedAnswer } from "./continuation-words";
import type { ContinuationSource } from "./db/stored-types";
import type { SessionLocation } from "./hub-shapes";
import type { KeepAliveRow } from "./keep-alive";
import {
  failedProblem,
  MachineProblem,
  silentProblem,
  type Unanswered,
} from "./machine-answers";
import type { createSpawns } from "./spawns";
import { unreachable } from "./unreachable";

export type ContextReadsContext = Pick<
  ClosureContext,
  | "awayError"
  | "db"
  | "lifetime"
  | "locateSession"
  | "machineCalls"
  | "machineFault"
  | "machineName"
  | "registry"
  | "retireSession"
  | "sendFromHub"
  | "sessionName"
  | "silentWords"
  | "summarisers"
  | "turnWaiters"
  | "unansweredError"
> &
  Pick<ReturnType<typeof createSpawns>, "spawnFromHub">;

export const createContextReads = (ctx: ContextReadsContext) => {
  /**
   * The summariser, start to stop: a fresh internal session `id` on the
   * chosen harness and model in the source's directory, asked `prompt`,
   * answered with what its transcript stores for that turn, then stopped
   * whatever happened. Its transcript is tagged as scratch, so the stored
   * catalogs leave it out too. A cancel rejects the wait and stops it from
   * outside ({@link cancelContinuation}); `cancelled` keeps a spawn that was
   * still in flight from being asked anything. `mode` is the one it runs in
   * (`continuationSummary` picks it).
   */
  const summariserRun = async (
    source: ContinuationSource & { machineId: string },
    summarizer: { harness: HarnessKind; model?: string; account?: string },
    prompt: string,
    id: string,
    cancelled: () => boolean,
    mode: PermissionMode
  ) => {
    /** The summariser's turn ended, or failed: its waiter in `turnWaiters` is done by the frame that says so. */
    const answered = Deferred.makeUnsafe<void, Error>();
    ctx.turnWaiters.set(id, {
      machineId: source.machineId,
      resolve: () => Deferred.doneUnsafe(answered, Effect.void),
      reject: (error) => Deferred.doneUnsafe(answered, Effect.fail(error)),
    });
    ctx.summarisers.add(id);
    try {
      const spawned = await ctx.spawnFromHub(
        source.machineId,
        {
          instanceId: id,
          cwd: source.cwd,
          harness: summarizer.harness,
          ...(summarizer.model ? { model: summarizer.model } : {}),
          ...(summarizer.account ? { account: summarizer.account } : {}),
          title: `Summary of ${source.title}`,
          scratch: {},
          spawnedBy: { instanceId: source.instanceId },
        },
        "summariser",
        // The hub's own worker over the source's words, never a person's.
        "check",
        // The hub's own worker, which nobody watches: it never parks on a
        // permission prompt.
        mode
      );
      if (spawned instanceof ElysiaStatus) {
        return spawned;
      }
      if (cancelled()) {
        throw new Error(CONTINUATION_CANCELLED);
      }
      ctx.sendFromHub(
        source.machineId,
        id,
        prompt,
        // Its transcript was just read on its machine, in this directory.
        {
          id: source.instanceId,
          cwd: source.cwd,
          harness: source.harness,
          launchDir: "known",
        },
        crypto.randomUUID()
      );
      await ctx.lifetime.run(Deferred.await(answered));
      // The hub's own worker: the hub holds the read.
      const text = await storedAnswer(id, true, ctx.lifetime.signal);
      if (!text) {
        throw new Error(
          "the summariser's turn ended without a finished answer in its transcript"
        );
      }
      return text;
    } finally {
      ctx.turnWaiters.delete(id);
      ctx.retireSession(id);
    }
  };

  /**
   * The answer a summariser's stored transcript holds for its turn, once
   * that turn has ended ({@link finishedAnswer}; `ended` when its `result`
   * frame was seen); undefined before then, or when it never got as far as a
   * transcript.
   */
  const storedAnswer = async (
    id: string,
    ended: boolean,
    /** Its asker's: the machine's read is let go once it aborts. */
    signal: AbortSignal
  ): Promise<string | undefined> => {
    const located = await ctx.locateSession(id);
    switch (located.kind) {
      case "found":
        return finishedAnswer(
          await readMessages(located.at, false, signal),
          ended
        );
      case "nowhere":
        return undefined;
      case "away":
        throw ctx.awayError(located.machineId);
      case "unanswered":
        throw new Error(unlocatedWords(id, located.machines));
      default:
        throw unreachable(located);
    }
  };

  /** A conversation not located because `machines` did not answer, in a sentence. */
  const unlocatedWords = (id: string, machines: string[]): string =>
    `${machines.map((one) => ctx.machineName(one)).join(", ")} did not answer whether ${machines.length === 1 ? "it holds" : "they hold"} session ${id}, so where it is is not known yet`;

  /**
   * `model`'s window in the catalogs the hub keeps of `account`, or of every
   * account of `harness` signed in on `machineId` when none is named: the one
   * window they state, undefined when none states one or two differ.
   */
  const accountWindowOf = (
    machineId: string,
    harness: HarnessKind,
    model: string,
    account: string | null | undefined
  ): number | undefined => {
    const accounts = account
      ? new Set([account])
      : new Set(
          ctx.db.accounts
            .signins()
            .filter(
              (signin) =>
                signin.machineId === machineId &&
                signin.state === "signed-in" &&
                catalogHarnessOf(
                  ctx.db.accounts.get(signin.accountId)?.provider ?? ""
                ) === harness
            )
            .map((signin) => signin.accountId)
        );
    const windows = new Set(
      ctx.db.accounts
        .catalogs()
        .filter((catalog) => accounts.has(catalog.accountId))
        .flatMap((catalog) => catalog.models)
        .filter((row) => row.value === model)
        .flatMap((row) => (row.contextWindow ? [row.contextWindow] : []))
    );
    const [only] = windows;
    return windows.size === 1 ? only : undefined;
  };

  /**
   * A model's context window as the fleet knows it: claude's from the turns
   * the hub has seen (its catalog has none), a harness whose models are each
   * account's (descriptor `modelCatalog: "account"`) from the catalog the
   * hub keeps of `account`, or of every account of its signed in on
   * `machineId` when none is named, and every other harness's from the
   * machine's own model catalog. Undefined is unknown — never a guess.
   */
  const contextWindowOf = async (
    machineId: string,
    harness: HarnessKind,
    model: string | undefined,
    /** Its asker's: the machine's read is let go once it aborts. */
    signal: AbortSignal,
    account?: string | null
  ): Promise<number | undefined> => {
    if (traitsOf(harness).contextWindow === "hub") {
      // No model named: Claude Code's own default, which the machine's
      // account's catalog resolves to a model id.
      const accountId = machineAccount(ctx.db, machineId);
      const id =
        model ??
        ctx.db.accounts
          .catalogs()
          .find((one) => one.accountId === accountId)
          ?.models.find((row) => row.value === "default")?.resolvedModel;
      return id ? ctx.db.claudeContextWindows()[id] : undefined;
    }
    if (!model) {
      return undefined;
    }
    if (traitsOf(harness).modelCatalog === "account") {
      return accountWindowOf(machineId, harness, model, account);
    }
    const asked = await ctx.machineCalls.readStoppable(
      machineId,
      CONTROL_MODEL_CATALOG,
      [],
      { caller: `a ${harness} context window`, harness, signal }
    );
    switch (asked.kind) {
      case "unanswered":
        throw asked.reason === "dead"
          ? ctx.awayError(machineId)
          : new MachineProblem(
              silentProblem(
                `${ctx.machineName(machineId)} didn't list its ${harness} models within ${secondsOf(asked.after)} s. Try again in a moment.`
              )
            );
      case "answered":
        break;
      default:
        throw unreachable(asked);
    }
    const answer = asked.value;
    if (!answer.ok) {
      throw new MachineProblem(
        failedProblem(
          answer,
          "machine-call-failed",
          `${harness} could not list its models`
        )
      );
    }
    return answer.result.find((row) => row.value === model)?.contextWindow;
  };

  /**
   * The context a session's last real request sent, as it last reported it:
   * the row's `context_tokens` (every result writes it), else for a session
   * whose harness reads stored context back its stored transcript's last request, read on its machine and
   * kept on the row. A reason when it never reported one.
   */
  const reportedContextOf = async (
    row: KeepAliveRow,
    /** Its asker's: the machine's read is let go once it aborts. */
    signal: AbortSignal
  ): Promise<
    { tokens: number; readAt: number } | { reason: string } | Unanswered
  > => {
    // Written together on every result: a row with its tokens has their time.
    if (row.contextTokens !== null && row.contextReadAt !== null) {
      return {
        tokens: row.contextTokens,
        readAt: row.contextReadAt.getTime(),
      };
    }
    if (!traitsOf(row.harness).readsStoredContext) {
      return {
        reason: `${harnessName(row.harness)} keeps no context its machine can read back`,
      };
    }
    if (!row.sessionId) {
      return {
        reason: `no stored ${harnessName(row.harness)} conversation`,
      };
    }
    const answer = await ctx.machineCalls.readStoppable(
      row.machineId,
      CONTROL_READ_SESSION_CONTEXT,
      [row.sessionId, row.cwd],
      { caller: "a session's stored context", harness: row.harness, signal }
    );
    switch (answer.kind) {
      case "unanswered":
        return answer;
      case "answered":
        break;
      default:
        throw unreachable(answer);
    }
    if (!answer.value.ok) {
      return { reason: answer.value.error ?? "transcript read failed" };
    }
    const reading = answer.value.result;
    if (!("tokens" in reading)) {
      return reading;
    }
    // A live result that arrived during this read is newer than the stored transcript.
    const [current] = ctx.db.getInstancesByIds([row.id]);
    if (current.contextTokens !== null && current.contextReadAt !== null) {
      return {
        tokens: current.contextTokens,
        readAt: current.contextReadAt.getTime(),
      };
    }
    ctx.db.updateKeepAlive(row.id, {
      contextTokens: reading.tokens,
      contextReadAt: new Date(reading.readAt),
    });
    return { tokens: reading.tokens, readAt: reading.readAt };
  };

  /**
   * How many tokens a continuation's source holds: a running session's, as
   * its harness reads it now; one at rest, the context its last real request
   * sent ({@link reportedContextOf}), which holds what its transcript cannot
   * show (the system prompt, attachments, a model's encrypted thinking: 508k
   * for a session whose text estimates at 199k). The transcript's estimate
   * only for one that never reported.
   */
  const contextTokensOf = async (
    row: KeepAliveRow | undefined,
    /** The characters a model reads of its live scope (core `scopeChars`). */
    scopeChars: number,
    /** Its asker's: the machine's read is let go once it aborts. */
    signal: AbortSignal
  ): Promise<number> => {
    if (!row) {
      return estimateTokens(scopeChars);
    }
    if (row.status === "running" && ctx.registry.agent(row.machineId)) {
      return await liveContextTokensOf(row, signal);
    }
    const reported = await reportedContextOf(row, signal);
    if ("kind" in reported) {
      throw ctx.unansweredError(
        row.machineId,
        reported,
        `${ctx.sessionName(row)}'s context could not be read`
      );
    }
    return "tokens" in reported ? reported.tokens : estimateTokens(scopeChars);
  };

  /** How many tokens a running session holds right now, as its harness reads it. */
  const liveContextTokensOf = async (
    row: InstanceRow,
    signal: AbortSignal
  ): Promise<number> => {
    const answer = await ctx.machineCalls.readSessionProcess(
      row,
      CONTROL_CONTEXT_USAGE,
      [],
      { caller: "a running session's context", signal }
    );
    switch (answer.kind) {
      case "unanswered":
        throw answer.reason === "dead"
          ? ctx.awayError(row.machineId)
          : new MachineProblem(
              silentProblem(
                `session ${row.id} did not report its context within ${secondsOf(answer.after)} s`
              )
            );
      case "answered":
        if (!answer.value.ok) {
          throw new MachineProblem(
            failedProblem(
              answer.value,
              "machine-call-failed",
              "the session could not read its context"
            )
          );
        }
        return answer.value.result.totalTokens;
      default:
        throw unreachable(answer);
    }
  };

  /** When the session started, as its own harness records it. */
  const sessionStartOf = async (
    where: SessionLocation,
    signal: AbortSignal
  ): Promise<string> => {
    const answer = await ctx.machineCalls.readStoppable(
      where.machineId,
      CONTROL_GET_SESSION_INFO,
      [where.sessionId, where.cwd || undefined],
      { caller: "a session's start", harness: where.harness, signal }
    );
    switch (answer.kind) {
      case "unanswered":
        throw ctx.unansweredError(
          where.machineId,
          answer,
          `${ctx.machineName(where.machineId)} could not say when session ${where.sessionId} started`
        );
      case "answered":
        if (!answer.value.ok) {
          throw new MachineProblem(
            problem(502, {
              code: answer.value.code ?? "machine-call-failed",
              detail: `${ctx.machineName(where.machineId)} could not say when session ${where.sessionId} started: ${answer.value.error ?? "it gave no reason"}`,
            })
          );
        }
        break;
      default:
        throw unreachable(answer);
    }
    const created = answer.value.result?.createdAt;
    if (!created) {
      throw new MachineProblem(
        problem(502, {
          code: "machine-call-failed",
          detail: `${where.harness} does not report when session ${where.sessionId} started`,
        })
      );
    }
    return new Date(created).toISOString();
  };

  /** What git says changed in the session's directory since it started. */
  const gitChangesOf = async (
    where: SessionLocation,
    since: string,
    signal: AbortSignal
  ): Promise<GitChanges> => {
    const answer = await ctx.machineCalls.readStoppable(
      where.machineId,
      CONTROL_GIT_CHANGES,
      [where.cwd, since],
      { caller: "a session's git changes", signal }
    );
    switch (answer.kind) {
      case "unanswered":
        throw ctx.unansweredError(
          where.machineId,
          answer,
          `${ctx.machineName(where.machineId)} could not read git in ${where.cwd}`
        );
      case "answered":
        if (!answer.value.ok) {
          throw new MachineProblem(
            problem(502, {
              code: answer.value.code ?? "machine-call-failed",
              detail: `${ctx.machineName(where.machineId)} could not read git in ${where.cwd}: ${answer.value.error ?? "it gave no reason"}`,
            })
          );
        }
        return answer.value.result;
      default:
        throw unreachable(answer);
    }
  };

  /** One read of a session's stored messages through its own machine. */
  const readMessages = async (
    where: SessionLocation,
    whole: boolean,
    signal: AbortSignal
  ): Promise<SessionMessage[]> => {
    const answer = await ctx.machineCalls.readStoppable(
      where.machineId,
      CONTROL_GET_SESSION_MESSAGES,
      [
        where.sessionId,
        { dir: where.cwd || undefined, ...(whole ? { whole } : {}) },
      ],
      { caller: "a session's stored messages", harness: where.harness, signal }
    );
    switch (answer.kind) {
      case "unanswered":
        throw answer.reason === "dead"
          ? ctx.awayError(where.machineId)
          : new MachineProblem(
              silentProblem(ctx.machineFault(where.machineId, "silent"))
            );
      case "answered":
        if (!answer.value.ok) {
          throw new MachineProblem(
            failedProblem(
              answer.value,
              "machine-call-failed",
              "the transcript could not be read"
            )
          );
        }
        return answer.value.result;
      default:
        throw unreachable(answer);
    }
  };

  /**
   * A session's continuation inputs, extracted on the machine that stores
   * its transcript (core `CONTROL_READ_CONTINUATION`): the machine answers
   * with them alone, never the transcript, which runs to hundreds of
   * megabytes and could not cross the socket within the bound.
   */
  /**
   * The short ids whose hand-offs a session was asked (core
   * `ContinuationReadOptions.askers`): its parent's, under its id now and
   * every former one; none for a session no other started.
   */
  const askersOf = (row: InstanceRow | undefined): string[] => {
    const parent = row?.parentInstanceId;
    if (!parent) {
      return [];
    }
    const formers = Object.entries(ctx.db.formerIds()).flatMap(
      ([former, now]) => (now === parent ? [former] : [])
    );
    return [parent, ...formers].map((id) => shortId(id));
  };

  return {
    summariserRun,
    storedAnswer,
    unlocatedWords,
    contextWindowOf,
    reportedContextOf,
    contextTokensOf,
    sessionStartOf,
    gitChangesOf,
    askersOf,
  };
};

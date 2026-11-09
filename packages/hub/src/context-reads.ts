import { estimateTokens } from "@cawco/core/continuation";
import type {
  HarnessKind,
  ModelInfo,
  PermissionMode,
} from "@cawco/core/harness/kinds";
import { traitsOf } from "@cawco/core/harness/traits";
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
import type {
  NeutralSessionInfo,
  SessionMessage,
} from "@cawco/core/session-messages";
import { secondsOf } from "@cawco/core/time";
import { accountsWords } from "@cawco/core/words/accounts";
import { machineAccount } from "./accounts";
import { finishedAnswer } from "./continuation-words";
import { CONTINUATION_CANCELLED } from "./continuations";
import type { ContinuationSource } from "./db/stored-types";
import type { HubContext } from "./hub-context";
import type { SessionLocation } from "./hub-shapes";
import type { KeepAliveRow } from "./keep-alive";
import type { Unanswered } from "./machine-answers";
import { READ_TIMEOUT_MS } from "./machine-read-timeouts";
import { unreachable } from "./unreachable";

export type ContextReadsContext = Pick<
  HubContext,
  | "awayError"
  | "db"
  | "locateSession"
  | "machineFault"
  | "machineName"
  | "readAgent"
  | "readSessionProcess"
  | "registry"
  | "retireSession"
  | "sendFromHub"
  | "sessionName"
  | "silentWords"
  | "spawnFromHub"
  | "summarisers"
  | "turnWaiters"
  | "unansweredError"
>;

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
  ): Promise<string> => {
    const answered = new Promise<void>((resolve, reject) => {
      ctx.turnWaiters.set(id, { machineId: source.machineId, resolve, reject });
    });
    // Never unhandled: a spawn that fails first leaves this to be abandoned.
    answered.catch(() => undefined);
    ctx.summarisers.add(id);
    try {
      await ctx.spawnFromHub(
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
      await answered;
      const text = await storedAnswer(id, true);
      if (!text) {
        throw new Error(
          "the summariser's turn ended without a finished answer in its transcript"
        );
      }
      return text;
    } finally {
      ctx.turnWaiters.delete(id);
      ctx.retireSession(source.machineId, id);
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
    ended: boolean
  ): Promise<string | undefined> => {
    const located = await ctx.locateSession(id);
    switch (located.kind) {
      case "found":
        return finishedAnswer(await readMessages(located.at, false), ended);
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
   * A model's context window as the fleet knows it: claude's from the turns
   * the hub has seen (its catalog has none), every other harness's from the
   * machine's own model catalog. Undefined is unknown — never a guess.
   */
  const contextWindowOf = async (
    machineId: string,
    harness: HarnessKind,
    model: string | undefined
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
    const asked = await ctx.readAgent(
      machineId,
      CONTROL_MODEL_CATALOG,
      [],
      READ_TIMEOUT_MS,
      harness
    );
    switch (asked.kind) {
      case "unanswered":
        throw new Error(
          asked.reason === "dead"
            ? ctx.machineFault(machineId, "offline")
            : `${ctx.machineName(machineId)} didn't list its ${harness} models within ${secondsOf(asked.after)} s. Try again in a moment.`
        );
      case "answered":
        break;
      default:
        throw unreachable(asked);
    }
    const answer = asked.value;
    if (!answer.ok) {
      throw new Error(answer.error ?? `${harness} could not list its models`);
    }
    return (answer.result as ModelInfo[]).find((row) => row.value === model)
      ?.contextWindow;
  };

  /**
   * The context a session's last real request sent, as it last reported it:
   * the row's `context_tokens` (every result writes it), else for a session
   * whose harness reads stored context back its stored transcript's last request, read on its machine and
   * kept on the row. A reason when it never reported one.
   */
  const reportedContextOf = async (
    row: KeepAliveRow
  ): Promise<
    { tokens: number; readAt: number } | { reason: string } | Unanswered
  > => {
    if (row.contextTokens !== null) {
      return {
        tokens: row.contextTokens,
        readAt: (row.contextReadAt as Date).getTime(),
      };
    }
    if (!traitsOf(row.harness).readsStoredContext) {
      return {
        reason: `${accountsWords.harnesses[row.harness]} keeps no context its machine can read back`,
      };
    }
    if (!row.sessionId) {
      return {
        reason: `no stored ${accountsWords.harnesses[row.harness]} conversation`,
      };
    }
    const answer = await ctx.readAgent(
      row.machineId,
      CONTROL_READ_SESSION_CONTEXT,
      [row.sessionId, row.cwd],
      2000,
      row.harness
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
    const reading = answer.value.result as
      { tokens: number; readAt: number } | { reason: string } | undefined;
    if (!reading) {
      return { reason: "agent has no context reader" };
    }
    if (!("tokens" in reading)) {
      return reading;
    }
    // A live result that arrived during this read is newer than the stored transcript.
    const [current] = ctx.db.getInstancesByIds([row.id]);
    if (current.contextTokens === null) {
      ctx.db.updateKeepAlive(row.id, {
        contextTokens: reading.tokens,
        contextReadAt: new Date(reading.readAt),
      });
    }
    const [measured] = ctx.db.getInstancesByIds([row.id]);
    return {
      tokens: measured.contextTokens as number,
      readAt: (measured.contextReadAt as Date).getTime(),
    };
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
    scopeChars: number
  ): Promise<number> => {
    if (!row) {
      return estimateTokens(scopeChars);
    }
    if (row.status === "running" && ctx.registry.agent(row.machineId)) {
      return await liveContextTokensOf(row);
    }
    const reported = await reportedContextOf(row);
    if ("kind" in reported) {
      throw new Error(
        `${ctx.sessionName(row)}'s context could not be read: ${ctx.silentWords(row.machineId, reported)}`
      );
    }
    return "tokens" in reported ? reported.tokens : estimateTokens(scopeChars);
  };

  /** How many tokens a running session holds right now, as its harness reads it. */
  const liveContextTokensOf = async (row: InstanceRow): Promise<number> => {
    const answer = await ctx.readSessionProcess(row, CONTROL_CONTEXT_USAGE, []);
    switch (answer.kind) {
      case "unanswered":
        throw answer.reason === "dead"
          ? ctx.awayError(row.machineId)
          : new Error(
              `session ${row.id} did not report its context within ${secondsOf(answer.after)} s`
            );
      case "answered":
        if (!answer.value.ok) {
          throw new Error(
            answer.value.error ?? "the session could not read its context"
          );
        }
        return (answer.value.result as { totalTokens: number }).totalTokens;
      default:
        throw unreachable(answer);
    }
  };

  /** When the session started, as its own harness records it. */
  const sessionStartOf = async (where: SessionLocation): Promise<string> => {
    const answer = await ctx.readAgent(
      where.machineId,
      CONTROL_GET_SESSION_INFO,
      [where.sessionId, where.cwd || undefined],
      READ_TIMEOUT_MS,
      where.harness
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
          throw new Error(
            `${ctx.machineName(where.machineId)} could not say when session ${where.sessionId} started: ${answer.value.error ?? "it gave no reason"}`
          );
        }
        break;
      default:
        throw unreachable(answer);
    }
    const created = (answer.value.result as NeutralSessionInfo | null)
      ?.createdAt;
    if (!created) {
      throw new Error(
        `${where.harness} does not report when session ${where.sessionId} started`
      );
    }
    return new Date(created).toISOString();
  };

  /** What git says changed in the session's directory since it started. */
  const gitChangesOf = async (
    where: SessionLocation,
    since: string
  ): Promise<GitChanges> => {
    const answer = await ctx.readAgent(
      where.machineId,
      CONTROL_GIT_CHANGES,
      [where.cwd, since],
      READ_TIMEOUT_MS
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
          throw new Error(
            `${ctx.machineName(where.machineId)} could not read git in ${where.cwd}: ${answer.value.error ?? "it gave no reason"}`
          );
        }
        return answer.value.result as GitChanges;
      default:
        throw unreachable(answer);
    }
  };

  /** One read of a session's stored messages through its own machine. */
  const readMessages = async (
    where: SessionLocation,
    whole: boolean
  ): Promise<SessionMessage[]> => {
    const answer = await ctx.readAgent(
      where.machineId,
      CONTROL_GET_SESSION_MESSAGES,
      [
        where.sessionId,
        { dir: where.cwd || undefined, ...(whole ? { whole } : {}) },
      ],
      READ_TIMEOUT_MS,
      where.harness
    );
    switch (answer.kind) {
      case "unanswered":
        throw answer.reason === "dead"
          ? ctx.awayError(where.machineId)
          : new Error(ctx.machineFault(where.machineId, "silent"));
      case "answered":
        if (!answer.value.ok) {
          throw new Error(
            answer.value.error ?? "the transcript could not be read"
          );
        }
        return (
          Array.isArray(answer.value.result) ? answer.value.result : []
        ) as SessionMessage[];
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
    return [parent, ...formers].map((id) => id.slice(0, 8));
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

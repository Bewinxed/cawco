import type { AccountMove } from "@cawco/core/accounts";
import { namedAccount } from "@cawco/core/accounts";
import { RESTART_WAIT_CAP_MS, waitedOut } from "@cawco/core/binary-updates";
import {
  contextFitRefusal,
  estimateTokens,
  SUMMARISER_OUTPUT_RESERVE_TOKENS,
  SUMMARY_CAP_TOKENS,
  TARGET_HEADROOM_TOKENS,
} from "@cawco/core/continuation";
import type {
  ContinuationRead,
  ContinuationReadOptions,
} from "@cawco/core/continuation-read";
import { CONTROL_READ_CONTINUATION } from "@cawco/core/continuation-read";
import { detach } from "@cawco/core/detach";
import type { EffortLevel, HarnessKind } from "@cawco/core/harness/kinds";
import {
  COMPACTION_ORIGIN,
  CONTINUATION_ORIGIN,
} from "@cawco/core/harness/kinds";
import { doing } from "@cawco/core/loop-watch";
import type { ContinuationJob, NamedSpawn } from "@cawco/core/protocol";
import type { WorkInFlight } from "@cawco/core/session/controls";
import { CONTROL_WORK_IN_FLIGHT } from "@cawco/core/session/controls";
import { ContinuationReadSchema } from "@cawco/core/stored-shapes";
import { deriveTitleFromFirstMessage } from "@cawco/core/title";
import { ElysiaStatus } from "elysia";
import {
  asksOpening,
  gitSection,
  openingMessage,
  summariserPrompt,
} from "./continuation-words";
import type { ContinuationRow, ContinuationSlip } from "./db/continuations";
import type {
  ContinuationAsker,
  ContinuationSource,
  ContinueRequest,
  PreparedContinuation,
} from "./db/stored-types";
import type { HubContext } from "./hub-context";
import type { ContinueOutcome } from "./hub-shapes";
import { MachineAway, type SessionLocation } from "./hub-shapes";
import { leafOf, sessionLabel } from "./labels";
import { READ_TIMEOUT_MS } from "./machine-read-timeouts";
import { filingPrompt } from "./open-items";
import { askEnvelope } from "./pending";
import { UNREAD } from "./sends";
import { received } from "./stored-json";
import { unreachable } from "./unreachable";
import { unwatchedMode } from "./unwatched-mode";

/**
 * How long a settled continuation stays in the table dashboards follow. Ours:
 * five minutes lets a dashboard that was reconnecting when it settled still
 * hear how it ended, and keeps the table to the few jobs of the moment.
 */
const CONTINUATION_KEPT_MS = 5 * 60_000;
/** Who asked, as a continuation's log line says it. */
const askerWords = (by: ContinuationAsker): string => {
  switch (by.kind) {
    case "session":
      return `session ${by.id} (continue_session)`;
    case "task":
      return `your comment on ${by.id} (attach or spawn)`;
    case "move":
      return `its move to ${by.to}, as its provider's compaction policy says`;
    case "person":
      return "a person (the dashboard or the API)";
  }
};
/** The words a continuation stopped by its Cancel ends with. */
export const CONTINUATION_CANCELLED = "the continuation was cancelled";

/**
 * A start the hub's own work asked of a machine that is connected but takes
 * no start now (start-holds.ts `startHold`: paused by its owner, installing an
 * update, or on a build older than its hub's). Not the machine away: a
 * continuation waits for the hold to end (`flushOwedStarts`), never for a
 * register that is not coming.
 */
export class StartsHeld extends Error {
  readonly machineId: string;
  /** `words`: the hold, in `startHold`'s words. */
  constructor(machineId: string, words: string) {
    super(words);
    this.name = "StartsHeld";
    this.machineId = machineId;
  }
}

export type ContinuationsContext = Pick<
  HubContext,
  | "accountWords"
  | "askersOf"
  | "atLimit"
  | "awayError"
  | "callAgent"
  | "contextTokensOf"
  | "contextWindowOf"
  | "db"
  | "deliverSend"
  | "designSystem"
  | "dropCompaction"
  | "endSession"
  | "forgetPending"
  | "gitChangesOf"
  | "lifecycle"
  | "lifetime"
  | "locateSession"
  | "machineName"
  | "noteAtLimit"
  | "openItems"
  | "owedMoves"
  | "parkForPerson"
  | "pending"
  | "projectMemory"
  | "publishInstances"
  | "publishSend"
  | "readAgent"
  | "registry"
  | "releaseOwed"
  | "retireSession"
  | "saidCompactionFolded"
  | "sendFromHub"
  | "sessionIdle"
  | "sessionName"
  | "sessionStartOf"
  | "silentWords"
  | "spawnFromHub"
  | "storedAnswer"
  | "summariserRun"
  | "summarizerOf"
  | "summaryMoveFailed"
  | "transcripts"
  | "turnWaiters"
  | "unansweredError"
  | "unlocatedWords"
  | "workItems"
>;

export const createContinuations = (ctx: ContinuationsContext) => {
  const readContinuationOf = async (
    where: SessionLocation,
    askers: string[]
  ): Promise<ContinuationRead> => {
    const options: ContinuationReadOptions = {
      dir: where.cwd || undefined,
      askers,
    };
    const answer = await ctx.readAgent(
      where.machineId,
      CONTROL_READ_CONTINUATION,
      [where.sessionId, options],
      READ_TIMEOUT_MS,
      where.harness
    );
    switch (answer.kind) {
      case "unanswered":
        throw ctx.unansweredError(
          where.machineId,
          answer,
          `${ctx.machineName(where.machineId)} could not read session ${where.sessionId}'s transcript`
        );
      case "answered":
        if (!answer.value.ok) {
          throw new Error(
            `${ctx.machineName(where.machineId)} could not read session ${where.sessionId}'s transcript: ${answer.value.error ?? "it gave no reason"}`
          );
        }
        // Its read is kept in the continuation's record: taken into
        // CawCo's type as it is.
        return received(
          ContinuationReadSchema,
          answer.value.result,
          "a machine's continuation read"
        );
      default:
        throw unreachable(answer);
    }
  };

  /**
   * A continuation's inputs, read and sized: the source's live context (last
   * compaction summary on), the artifact index over its whole transcript, and
   * the token counts the pickers and the run are both held to. The source is
   * only read.
   */
  const prepareContinuation = async (
    sourceId: string,
    note?: string,
    /** From its asks alone: nothing to summarise, and the opening is {@link asksOpening}. */
    asksOnly = false
  ): Promise<PreparedContinuation> => {
    const [row] = ctx.db.getInstancesByIds([sourceId]);
    const located = await ctx.locateSession(sourceId);
    switch (located.kind) {
      case "nowhere":
        throw new Error(
          row
            ? `session ${sourceId} has no transcript yet`
            : `no session ${sourceId}`
        );
      case "away":
        throw ctx.awayError(located.machineId);
      case "unanswered":
        throw new Error(ctx.unlocatedWords(sourceId, located.machines));
      case "found":
        break;
      default:
        throw unreachable(located);
    }
    const where = located.at;
    const since = await ctx.sessionStartOf(where);
    const [read, git] = await Promise.all([
      // What it was asked: the person's words, and a delegate's parent's
      // brief and hand-offs, so a delegate's continuation knows its work.
      // A parent that was itself continued wrote some under a former id.
      readContinuationOf(where, ctx.askersOf(row)),
      ctx.gitChangesOf(where, since),
    ]);
    const { extracted } = read;
    // Named by what the person first asked in words — not the compaction
    // summary its live context starts with, nor a bare slash command
    // (`/clear`) that names nothing.
    const first = extracted.asks.find(
      (text) => !deriveTitleFromFirstMessage(text).startsWith("/")
    );
    const source: ContinuationSource & { machineId: string } = {
      instanceId: sourceId,
      machineId: where.machineId,
      cwd: where.cwd,
      harness: where.harness,
      model: row?.model ?? read.model ?? "model not recorded",
      title:
        row?.title ||
        row?.derivedTitle ||
        (first ? deriveTitleFromFirstMessage(first) : "") ||
        (row ? sessionLabel(row).name : leafOf(where.cwd)),
    };
    extracted.artifacts = `${extracted.artifacts}\n\n${gitSection(git, since)}`;
    const prompt =
      extracted.middle.length && !asksOnly
        ? summariserPrompt(extracted.middle, note)
        : undefined;
    return {
      source,
      extracted,
      prompt,
      liveContextTokens: await ctx.contextTokensOf(row, read.scopeChars),
      summariseInputTokens: prompt ? estimateTokens(prompt.length) : 0,
      openingTokens: asksOnly
        ? estimateTokens(asksOpening(source, extracted.asks, note).length)
        : estimateTokens(openingMessage(source, "", extracted, note).length) +
          SUMMARY_CAP_TOKENS,
      compacted: read.compacted,
      entries: read.entries,
    };
  };

  /**
   * A source that holds a work item has its workspace's clone there before
   * its continuation reads it (a retired one cut again), held until the
   * answered release: its new session takes the item on and starts in that
   * clone ({@link startTarget}). The caller releases once the job is filed,
   * whose record holds the workspace from then on, or once it is refused.
   * Throws why there is no clone.
   */
  const cloneForContinuation = async (
    sourceId: string
  ): Promise<() => void> => {
    const itemId = ctx.db.getInstancesByIds([sourceId])[0]?.workItemId;
    return itemId ? await ctx.workItems.continuable(itemId) : () => undefined;
  };

  /**
   * Who writes a continuation's summary: the one its asker chose, else its
   * source's provider's policy (core `Compaction.summarizer`).
   */
  const summarizerAsked = (
    request: ContinueRequest,
    sourceId: string
  ): { harness: HarnessKind; model?: string; account?: string } =>
    request.summarizer ??
    ctx.summarizerOf(ctx.db.getInstancesByIds([sourceId])[0] ?? {});

  /**
   * Whether the chosen models fit, by the same rule the dashboard's pickers
   * show, and whether a source holding a work item goes on where it runs (its
   * workspace's clone): a refusal naming why, or nothing.
   */
  const continuationRefusal = async (
    prepared: PreparedContinuation,
    request: ContinueRequest,
    askedBy: ContinuationAsker
  ): Promise<string | undefined> => {
    const misplaced = placeRefusal(prepared, request, askedBy);
    if (misplaced) {
      return misplaced;
    }
    if (prepared.prompt) {
      const { harness, model } = summarizerAsked(
        request,
        prepared.source.instanceId
      );
      const refusal = contextFitRefusal(
        await ctx.contextWindowOf(prepared.source.machineId, harness, model),
        prepared.summariseInputTokens + SUMMARISER_OUTPUT_RESERVE_TOKENS
      );
      if (refusal) {
        return `Summarise with ${model ?? "the default model"}: ${refusal}`;
      }
    }
    const { harness, model, machineId } = request.target;
    const refusal = contextFitRefusal(
      await ctx.contextWindowOf(
        machineId ?? prepared.source.machineId,
        harness,
        model
      ),
      prepared.openingTokens + TARGET_HEADROOM_TOKENS
    );
    return refusal
      ? `Continue on ${model ?? "the default model"}: ${refusal}`
      : undefined;
  };

  /**
   * Where a continuation must start, when it names somewhere else: where
   * the source's work item's workspace is, and, for one that stays one
   * session with its source ({@link foldContinued}), where the source ran,
   * whose conversation is read there.
   */
  const placeRefusal = (
    prepared: PreparedContinuation,
    request: ContinueRequest,
    askedBy: ContinuationAsker
  ): string | undefined => {
    const { cwd: at, machineId: on } = request.target;
    if (!(
      (at && at !== prepared.source.cwd) ||
      (on && on !== prepared.source.machineId)
    )) {
      return;
    }
    const where = `in ${prepared.source.cwd} on ${ctx.machineName(prepared.source.machineId)}`;
    const itemId = ctx.db.getInstancesByIds([prepared.source.instanceId])[0]
      ?.workItemId;
    if (itemId) {
      return `${prepared.source.title} holds work item ${itemId}: its new session takes the item on, so it starts where the item's workspace is, ${where}.`;
    }
    return askedBy.kind === "person"
      ? undefined
      : `${prepared.source.title} goes on as the same session, its conversation before read where it ran, so its continuation starts there, ${where}.`;
  };

  /**
   * Whether a continuation of `sourceId` ends its source's process: every
   * one does while it runs. One anything but the person asked for is folded
   * into one session ({@link foldContinued}); the person's own Continue
   * retires its source ({@link retireContinued}).
   */
  const endsSource = (sourceId: string): boolean => {
    const [row] = ctx.db.getInstancesByIds([sourceId]);
    return !!row && !["stopped", "discarded"].includes(row.status);
  };

  /**
   * What `instanceId`'s process holds for later that ending it would lose
   * (core `CONTROL_WORK_IN_FLIGHT`): null when nothing, or when no process of
   * it runs. Throws when its machine does not answer.
   */
  const workInFlightOf = async (
    instanceId: string
  ): Promise<WorkInFlight | null> => {
    const [row] = ctx.db.getInstancesByIds([instanceId]);
    if (!(row && ctx.registry.agent(row.machineId))) {
      return null;
    }
    const answer = await ctx.callAgent(
      row.machineId,
      CONTROL_WORK_IN_FLIGHT,
      [],
      READ_TIMEOUT_MS,
      row.harness,
      instanceId
    );
    switch (answer.kind) {
      case "unanswered":
        throw new Error(
          `${ctx.machineName(row.machineId)} could not say what work ${ctx.sessionName(row)} has in flight: ${ctx.silentWords(row.machineId, answer)}`
        );
      case "answered":
        if (!answer.value.ok) {
          // No process of it here: nothing in flight to end.
          return null;
        }
        return (answer.value.result as WorkInFlight | null) ?? null;
      default:
        throw unreachable(answer);
    }
  };

  /**
   * Waits until `row`'s source holds no work in flight and is between turns,
   * or until the restart bound from when the job began to wait: true then.
   * False when a Cancel landed or its machine went away meanwhile.
   */
  const untilWorkEnds = async (row: ContinuationRow): Promise<boolean> => {
    const sourceId = row.sourceInstanceId;
    const from = row.waiting?.from ?? Date.now();
    for (;;) {
      if (
        cancelledContinuation(row.id) ||
        !ctx.registry.agent(machineFor(row))
      ) {
        return false;
      }
      if (waitedOut(from)) {
        console.info(
          `[continuation] ${row.prepared.source.title}'s continuation waited ${RESTART_WAIT_CAP_MS / 60_000} minutes for its work in flight; it goes on now, and that work ends with the source's process.`
        );
        return true;
      }
      const now = await workInFlightOf(sourceId);
      const [source] = ctx.db.getInstancesByIds([sourceId]);
      if (!now && (!source || (await ctx.sessionIdle(source)))) {
        return true;
      }
      if (now && now.why !== row.waiting?.why) {
        moveContinuation(row.id, {
          waiting: { why: now.why, since: now.since, from },
        });
      }
      await ctx.lifetime.sleep(WAIT_LOOK_MS);
    }
  };

  /**
   * The work in flight a continuation of `sourceId` must wait for: none when
   * its source no longer runs ({@link endsSource}) or nothing is held;
   * a refusal in its machine's words when the machine could not say.
   */
  const inFlightFor = async (
    sourceId: string
  ): Promise<{ work?: WorkInFlight } | { refusal: string }> => {
    if (!endsSource(sourceId)) {
      return {};
    }
    try {
      return { work: (await workInFlightOf(sourceId)) ?? undefined };
    } catch (error) {
      return {
        refusal: error instanceof Error ? error.message : String(error),
      };
    }
  };

  /** How often a waiting job looks again whether its source's work in flight has ended. */
  const WAIT_LOOK_MS = 5000;

  /**
   * The `waiting` step: the source's process holds work in flight that
   * ending it would lose (a background command, a one-time wake-up), so the
   * job waits, as an account move does (`waitForLater`), until that work
   * ends and the turn its end starts is over, or until the restart bound
   * (core `waitedOut`) from when it began to wait, when the work ends with
   * the process. Then the source is read again, so what that work brought
   * is in the continuation, and the job goes on: refused, in the fit's own
   * words, when it no longer fits. The job as it then stands; nothing when a
   * Cancel landed or its machine went away.
   */
  const waitStep = async (
    row: ContinuationRow
  ): Promise<ContinuationRow | undefined> => {
    if (!(await untilWorkEnds(row))) {
      return undefined;
    }
    const sourceId = row.sourceInstanceId;
    const prepared = await prepareContinuation(
      sourceId,
      row.request.note,
      row.request.asksOnly
    );
    const refusal = await continuationRefusal(
      prepared,
      row.request,
      row.askedBy
    );
    if (refusal) {
      throw new Error(refusal);
    }
    const summarise = !!prepared.prompt;
    return moveContinuation(row.id, {
      prepared,
      summariserInstanceId:
        summarise && !row.request.asksOnly
          ? (row.summariserInstanceId ?? crypto.randomUUID())
          : null,
      stage: firstStage(filesFirst(prepared, row.askedBy), summarise),
      waiting: null,
    });
  };

  /** The stages nothing more happens after. */
  const SETTLED = new Set<ContinuationJob["stage"]>([
    "started",
    "failed",
    "cancelled",
  ]);

  /** A job as every dashboard follows it. */
  const continuationJob = (row: ContinuationSlip): ContinuationJob => ({
    id: row.id,
    sourceInstanceId: row.sourceInstanceId,
    targetInstanceId: row.targetInstanceId,
    ...(row.summariserInstanceId
      ? { summariserInstanceId: row.summariserInstanceId }
      : {}),
    stage: row.stage,
    ...(row.error ? { error: row.error } : {}),
    ...(row.stage === "waiting" && row.waiting
      ? {
          waiting: {
            why: row.waiting.why,
            since: row.waiting.since,
            until: row.waiting.from + RESTART_WAIT_CAP_MS,
          },
        }
      : {}),
  });

  /** The job table, from its one record: what dashboards are handed. */
  const continuationTable = (): ContinuationJob[] =>
    ctx.db.continuationSlips().map(continuationJob);

  /**
   * The jobs settled (`settled`) or open, each read whole: for a hub's start
   * and a machine's register, never a send ({@link ContinuationSlip}).
   */
  const continuationsWhole = (settled: boolean): ContinuationRow[] =>
    ctx.db
      .continuationSlips()
      .filter((slip) => SETTLED.has(slip.stage) === settled)
      .flatMap((slip) => ctx.db.continuationRow(slip.id) ?? []);

  /** Where a job's new session starts: the machine the caller named, or the source's. */
  const targetMachineOf = (row: ContinuationRow): string =>
    row.request.target.machineId ?? row.prepared.source.machineId;

  /** The machine a job needs for its next step. */
  const machineFor = (row: ContinuationRow): string =>
    row.stage === "waiting" ||
    row.stage === "filing" ||
    row.stage === "summarising"
      ? row.prepared.source.machineId
      : targetMachineOf(row);

  /** Who waits on a job's end — the `continue_session` tool — by job id. */
  const continuationWaiters = new Map<string, Set<() => void>>();

  /** Deletes a settled job once it has been kept {@link CONTINUATION_KEPT_MS}. */
  const forgetContinuationLater = (row: ContinuationRow): void => {
    ctx.lifetime.after(
      Math.max(0, row.updatedAt.getTime() + CONTINUATION_KEPT_MS - Date.now()),
      () => {
        ctx.db.deleteContinuation(row.id);
        ctx.publishInstances(row.prepared.source.machineId);
      }
    );
  };

  /**
   * Moves a job in its one record and tells every dashboard. A job that
   * settles wakes whoever waits on it, and is deleted a while later.
   */
  const moveContinuation = (
    id: string,
    patch: Parameters<typeof ctx.db.updateContinuation>[1]
  ): ContinuationRow | undefined => {
    const row = ctx.db.updateContinuation(id, patch);
    if (!row) {
      return undefined;
    }
    ctx.publishInstances(row.prepared.source.machineId);
    if (SETTLED.has(row.stage)) {
      for (const wake of continuationWaiters.get(id) ?? []) {
        wake();
      }
      continuationWaiters.delete(id);
      forgetContinuationLater(row);
    }
    return row;
  };

  /** Whether a Cancel has ended the job while a step of it was in flight. */
  const cancelledContinuation = (id: string): boolean =>
    ctx.db.continuationStage(id) === "cancelled";

  /**
   * The opening a job's new session is handed: the same words however often
   * it resumes, the source's open items as read once before it went
   * ({@link startTarget}).
   */
  const openingOf = (row: ContinuationRow): string =>
    row.request.asksOnly
      ? asksOpening(
          row.prepared.source,
          row.prepared.extracted.asks,
          row.request.note,
          row.openItems ?? undefined
        )
      : openingMessage(
          row.prepared.source,
          row.summary ?? undefined,
          row.prepared.extracted,
          row.request.note,
          row.openItems ?? undefined
        );

  /** A continuation's start, as the hub's log line says it. */
  const startedWords = (
    prepared: PreparedContinuation,
    request: ContinueRequest,
    askedBy: ContinuationAsker,
    steps: { files: boolean; summarise: boolean }
  ): string => {
    const { account } = request.target;
    const where = `in a new session${account ? ` on ${ctx.accountWords(account)}` : ""}, asked by ${askerWords(askedBy)}`;
    const files = steps.files
      ? " It files its open items in its records first, in a turn of its own."
      : "";
    if (request.asksOnly) {
      return `[continuation] ${prepared.source.title} restarts from the ${prepared.extracted.asks.length} message(s) it was asked ${where}.${files} Nothing is summarised; the new session opens on those messages and its open items.`;
    }
    return `[continuation] ${prepared.source.title} goes on from a summary ${where}.${files} ${steps.summarise ? "Its summary is written; the" : "The"} new session opens on it and its open items.`;
  };

  /**
   * A continuation, as a job the hub owns and records. Asked by a person, of
   * a session CawCo runs: the source first files its open items in its
   * records, in a turn whose only job that is ({@link fileStep}); a session
   * asked it of another (`continue_session`, restarting a stuck delegate)
   * reads the records as they stand, since the source may not answer. Then
   * the source's live context is summarised once with the summariser the
   * caller chose (skipped when there is nothing before the tail, and for one
   * from the person's asks), and a new session starts seeded with the
   * summary, the open items, the artifact index and the tail, or with the
   * person's own messages and the open items alone. Returns at once; the job
   * is carried to its end whatever happens to whoever asked or to this hub,
   * and its Cancel stops it in any stage before it has started. The source
   * is only read.
   */
  const startContinuation = (
    prepared: PreparedContinuation,
    request: ContinueRequest,
    /** Who asked for it, as its log line names them. */
    askedBy: ContinuationAsker,
    /** The work in flight its source holds, which ending it would lose: it waits for that first ({@link waitStep}). */
    inFlight?: WorkInFlight
  ): ContinuationRow => {
    const summarise = !!prepared.prompt;
    const files = filesFirst(prepared, askedBy);
    const row = ctx.db.insertContinuation({
      id: crypto.randomUUID(),
      sourceInstanceId: prepared.source.instanceId,
      request,
      prepared,
      summariserInstanceId:
        summarise && !request.asksOnly ? crypto.randomUUID() : null,
      targetInstanceId: crypto.randomUUID(),
      openingUuid: crypto.randomUUID(),
      summary: null,
      openItems: null,
      stage: inFlight ? "waiting" : firstStage(files, summarise),
      error: null,
      askedBy,
      waiting: inFlight
        ? { why: inFlight.why, since: inFlight.since, from: Date.now() }
        : null,
    });
    if (inFlight) {
      console.info(
        `[continuation] ${prepared.source.title} holds work in flight its continuation would end (${inFlight.why}), so the job waits for it: it goes on by itself once that ends, or in ${RESTART_WAIT_CAP_MS / 60_000} minutes at the latest, ending it.`
      );
    }
    console.info(
      startedWords(prepared, request, askedBy, { files, summarise })
    );
    ctx.publishInstances(prepared.source.machineId);
    // The job runs on its own; its record is what anyone follows.
    detach(advanceContinuation(row.id), "continuation");
    return row;
  };

  /**
   * Whether a job's source files its open items first: a person's Continue
   * of a session CawCo runs, and a move's ahead of its limit, which can still
   * take a turn there.
   */
  const filesFirst = (
    prepared: PreparedContinuation,
    askedBy: ContinuationAsker
  ): boolean =>
    (askedBy.kind === "person" ||
      (askedBy.kind === "move" && askedBy.stopped === false)) &&
    ctx.db.getInstancesByIds([prepared.source.instanceId]).length > 0;

  /** A job's first step once nothing holds it: its source's filing turn, else what follows that. */
  const firstStage = (
    files: boolean,
    summarise: boolean
  ): ContinuationJob["stage"] => (files ? "filing" : afterFiling(summarise));

  /** The stage after the source's filing turn: the summary when there is one to write, else the start. */
  const afterFiling = (summarise: boolean): ContinuationJob["stage"] =>
    summarise ? "summarising" : "starting";

  /** The jobs this process is moving right now: each advances once at a time. */
  const advancing = new Set<string>();

  /**
   * Moves a job as far as it can go — the one path every job takes, whether
   * it was just asked for or the hub restarted under it. Where it stands is
   * read from its record and from the machines, never from memory:
   * summarising takes the summary (see {@link continuationSummary}) and
   * keeps it on the record; starting starts the target and hands it the
   * opening, once. A job whose machine is away waits where it is, and the
   * machine's next register moves it on; one whose machine holds its starts
   * waits for that hold to end ({@link StartsHeld}); anything else that goes
   * wrong fails it, in the failure's own words.
   */
  const advanceContinuation = async (id: string): Promise<void> => {
    if (advancing.has(id)) {
      // Its machine came back (a register, a hold's end) while this job was
      // busy: it goes on once that run has unwound ({@link advanceAgain}).
      advanceAgain.add(id);
      return;
    }
    advancing.add(id);
    let waits = false;
    try {
      const stopped = await continuationSteps(id);
      if (stopped instanceof ElysiaStatus) {
        waits = continuationStepFailed(id, stopped.response.detail);
      }
    } catch (error) {
      waits = continuationStepFailed(id, error);
    } finally {
      advancing.delete(id);
      // ONE RULE FOR A WAITING JOB: it goes on only when its machine says it
      // can (its register, or its held starts ending), never because the
      // machine looks connected. A job that waits on a machine connected
      // throughout would advance again at once, fail the same way, and so
      // on in microtasks that never yield: the hub froze 18 minutes that
      // way (2026-11-04, a start held on a machine on an older build).
      if (advanceAgain.delete(id) && waits) {
        detach(advanceContinuation(id), "continuation");
      }
    }
  };

  /**
   * The jobs whose machine came back while they were advancing: each goes on
   * once more as its run unwinds, if that run ended waiting.
   */
  const advanceAgain = new Set<string>();

  /**
   * The jobs waiting on a machine's held starts, by job id: their machine,
   * so the hold's end moves them on ({@link startsFreed}), and their wait is
   * said once.
   */
  const heldJobs = new Map<string, string>();

  /**
   * A job's steps from where its record stands, each only while its machine
   * is here: the source's filing turn ({@link fileStep}), the summary, then
   * the new session started and handed the opening ({@link startTarget}).
   */
  const continuationSteps = async (id: string) => {
    let row = ctx.db.continuationRow(id);
    if (row) {
      doing(
        `continuation ${id.slice(0, 8)} of ${row.prepared.source.title} at ${row.stage}`
      );
    }
    if (row?.stage === "waiting") {
      row = await waitStep(row);
    }
    if (row?.stage === "filing") {
      row = await fileStep(row);
    }
    if (row?.stage === "summarising") {
      const summarised = await summaryStep(row);
      // The job as it stands; anything else is the hub's problem.
      if (summarised && !("stage" in summarised)) {
        return summarised;
      }
      row = summarised;
    }
    return row?.stage === "starting" && ctx.registry.agent(machineFor(row))
      ? await startingStep(row)
      : undefined;
  };

  /** The `starting` step, while its machine is here: the target started and handed its opening, the job then `started`; or the problem that stopped it. */
  const startingStep = async (row: ContinuationRow) => {
    const started = await startTarget(row);
    if (started instanceof ElysiaStatus) {
      return started;
    }
    if (started) {
      moveContinuation(row.id, { stage: "started" });
    }
  };

  /**
   * The `filing` step: the source takes one turn whose only job is to file
   * its open items in its records (open-items.ts), sent once under the
   * job's id as the hub's word, ahead of nothing it is owed; the job waits
   * for that turn to end. The job as it then stands; nothing when its
   * machine is away, or a Cancel landed meanwhile. A source that refused
   * the turn fails the job in the refusal's words.
   */
  const fileStep = async (
    row: ContinuationRow
  ): Promise<ContinuationRow | undefined> => {
    const sourceId = row.sourceInstanceId;
    if (!ctx.registry.agent(machineFor(row))) {
      return undefined;
    }
    if (!ctx.db.sendRecord(row.id)) {
      const sent = ctx.deliverSend({
        verb: "send",
        machineId: row.prepared.source.machineId,
        instanceId: sourceId,
        payload: {
          instanceId: sourceId,
          message: {
            type: "user",
            uuid: row.id,
            message: { role: "user", content: filingPrompt("continued") },
            parent_tool_use_id: null,
            origin: { kind: "system", name: COMPACTION_ORIGIN },
          },
        },
      });
      if (sent instanceof ElysiaStatus) {
        console.warn(
          `[continuation] the filing turn was not sent: ${sent.response.detail}`
        );
      }
    }
    if (!(await untilFiled(row))) {
      return undefined;
    }
    await untilIdle(row, sourceId);
    return cancelledContinuation(row.id)
      ? undefined
      : moveContinuation(row.id, {
          stage: afterFiling(row.summariserInstanceId !== null),
        });
  };

  /**
   * Waits until a job's filing send (under its id) is read: true then; false
   * when a Cancel landed first. Throws the source's refusal, and
   * {@link MachineAway} when its machine goes.
   */
  const untilFiled = async (row: ContinuationRow): Promise<boolean> => {
    for (;;) {
      const sent = ctx.db.sendRecord(row.id);
      if (sent?.state === "failed") {
        throw new Error(
          `it couldn't file its open items first: ${sent.reason ?? "the session refused the turn"}`
        );
      }
      if (sent?.state === "read") {
        return true;
      }
      if (cancelledContinuation(row.id)) {
        return false;
      }
      if (!ctx.registry.agent(row.prepared.source.machineId)) {
        throw ctx.awayError(row.prepared.source.machineId);
      }
      await ctx.lifetime.sleep(IDLE_LOOK_MS);
    }
  };

  /**
   * The `summarising` step, while its machine is here: the summary, when
   * there is anything before the tail to summarise, kept on the record. The
   * job as it then stands; nothing when its machine is away, or a Cancel
   * landed while the summariser answered.
   */
  const summaryStep = async (row: ContinuationRow) => {
    if (!ctx.registry.agent(machineFor(row))) {
      return;
    }
    const summary = row.prepared.prompt ? await continuationSummary(row) : null;
    if (summary !== null && typeof summary !== "string") {
      return summary;
    }
    return cancelledContinuation(row.id)
      ? undefined
      : moveContinuation(row.id, { stage: "starting", summary });
  };

  /** How often a job looks again whether its source's turn has ended: one busy read of its machine each time. */
  const IDLE_LOOK_MS = 2000;

  /**
   * Waits until `instanceId` is between turns (`sessionIdle`): nothing
   * running and nothing waiting on it. Throws {@link MachineAway} when its
   * machine goes meanwhile, and a Cancel's words when the job was cancelled.
   */
  const untilIdle = async (
    job: ContinuationRow,
    instanceId: string
  ): Promise<ReturnType<typeof ctx.db.getInstancesByIds>[number]> => {
    for (;;) {
      const [row] = ctx.db.getInstancesByIds([instanceId]);
      if (!row) {
        throw new Error(`${job.prepared.source.title} is no longer recorded`);
      }
      if (!ctx.registry.agent(row.machineId)) {
        throw ctx.awayError(row.machineId);
      }
      if (cancelledContinuation(job.id)) {
        throw new Error(CONTINUATION_CANCELLED);
      }
      if (await ctx.sessionIdle(row)) {
        return row;
      }
      await ctx.lifetime.sleep(IDLE_LOOK_MS);
    }
  };

  /**
   * A job fails in the words the hub got, all of it undone: the source was
   * only read, or its steps rolled back together ({@link oneSession}), and
   * goes on as it was, holding all it held; a new session it started is
   * removed ({@link undoStart}). One its move asked for leaves the session
   * where it is, held at its limit when it is stopped there
   * ({@link summaryMoveFailed}).
   */
  const failContinuation = (row: ContinuationRow, reason: string): void => {
    moveContinuation(row.id, { stage: "failed", error: reason });
    console.warn(
      `[continuation] ${row.prepared.source.title} couldn't continue in a new session: ${reason}.`
    );
    undoStart(row);
    if (row.askedBy.kind === "move") {
      ctx.summaryMoveFailed(row, reason);
    }
  };

  /**
   * A failed job's new session, removed: the job's steps commit with its
   * opening's going ({@link oneSession}, {@link separateSession}), so one
   * whose opening never went holds nothing of its source, and is ended and
   * deleted with its row. Nothing once the opening has gone, or when it was
   * never started.
   */
  const undoStart = (row: ContinuationRow): void => {
    if (ctx.db.sendRecord(row.openingUuid)) {
      return;
    }
    const [target] = ctx.db.getInstancesByIds([row.targetInstanceId]);
    if (!target) {
      return;
    }
    console.warn(
      `[continuation] ${row.prepared.source.title}'s new session ${row.targetInstanceId.slice(0, 8)} is removed: nothing of ${row.prepared.source.title} moved to it, and it goes on where it was.`
    );
    ctx.lifecycle.oweEndSession(target.id, "delete");
    ctx.forgetPending(target.id, UNREAD.stopped);
    ctx.publishInstances(target.machineId);
  };

  /**
   * A step that threw, or answered a problem (its detail): nothing, when the job has settled meanwhile (a
   * Cancel); a wait, when its machine went away before the job changed
   * anything that cannot wait; otherwise the job fails at its step, in the
   * error's own words. True when it waits for its machine: its register, or
   * the end of the hold on its starts ({@link StartsHeld}).
   */
  const continuationStepFailed = (id: string, error: unknown): boolean => {
    const row = ctx.db.continuationRow(id);
    if (!row || SETTLED.has(row.stage)) {
      return false;
    }
    if (error instanceof StartsHeld) {
      if (heldJobs.get(id) !== error.machineId) {
        heldJobs.set(id, error.machineId);
        console.info(
          `[continuation] ${row.prepared.source.title}'s continuation can't start a session at ${row.stage} now: ${error.message}. The job waits until it ends; it goes on by itself then.`
        );
      }
      return true;
    }
    if (error instanceof MachineAway || !ctx.registry.agent(machineFor(row))) {
      return true;
    }
    failContinuation(
      row,
      error instanceof Error ? error.message : String(error)
    );
    return false;
  };

  /**
   * The mode a continuation's sessions fall back on where none is asked:
   * that of the session that caused it, read from its row as each of them
   * starts, never as the job was asked, so a switch made meanwhile (into
   * Full Send, say) is the one they take. The cause is the session whose
   * `continue_session` asked for it, else the source itself (a comment on
   * its task, its move to another account); the person's own continuation
   * is caused by none, and names its mode.
   */
  const continuationCauseMode = (row: ContinuationRow): string | undefined => {
    const { askedBy } = row;
    let cause: string | undefined;
    switch (askedBy.kind) {
      case "person":
        cause = undefined;
        break;
      case "session":
        cause = askedBy.id;
        break;
      case "task":
      case "move":
        cause = row.sourceInstanceId;
        break;
      default:
        throw unreachable(askedBy);
    }
    return cause
      ? (ctx.db.getInstancesByIds([cause])[0]?.permissionMode ?? undefined)
      : undefined;
  };

  /**
   * A summarising job's summary. A summariser this job already started —
   * before a restart, or before its machine went away — is read first: an
   * answer its transcript holds for a turn that ended is taken as it is.
   * Otherwise that one is stopped and a fresh one, recorded on the job, is
   * asked the same prompt.
   */
  const continuationSummary = async (row: ContinuationRow) => {
    const { source, prompt } = row.prepared;
    const summarizer = summarizerAsked(row.request, row.sourceInstanceId);
    if (!(prompt && row.summariserInstanceId)) {
      throw new Error("a summarising continuation has no summariser prompt");
    }
    const cancelled = () => cancelledContinuation(row.id);
    // Caused by the session whose mode its sessions fall back on, as that
    // mode reads now; the owner's own continuation is caused by none.
    const mode = unwatchedMode(continuationCauseMode(row));
    const current = row.summariserInstanceId;
    if (ctx.db.getInstancesByIds([current]).length === 0) {
      return ctx.summariserRun(
        source,
        summarizer,
        prompt,
        current,
        cancelled,
        mode
      );
    }
    const answered = await ctx.storedAnswer(current, false);
    ctx.retireSession(source.machineId, current);
    if (answered) {
      return answered;
    }
    if (cancelled()) {
      throw new Error(CONTINUATION_CANCELLED);
    }
    const replacement = crypto.randomUUID();
    moveContinuation(row.id, { summariserInstanceId: replacement });
    return ctx.summariserRun(
      source,
      summarizer,
      prompt,
      replacement,
      cancelled,
      mode
    );
  };

  /**
   * Starts a job's new session under its minted id and hands it the opening
   * under the job's send uuid — once: a send record under that uuid is the
   * opening having gone, whatever restarted since. A target already running
   * (started before a restart, not yet handed anything) is not started again.
   * The source's open items are read from its records once, before the
   * opening goes, and kept on the job. A Cancel that landed while the target
   * started stops it: nothing is adopted and no opening goes. True once the
   * opening has gone.
   */
  const startTarget = async (row: ContinuationRow) => {
    const sent = ctx.db.sendRecord(row.openingUuid);
    if (sent) {
      if (sent.state === "failed") {
        throw new Error(
          sent.reason ?? "the opening could not be sent to the new session"
        );
      }
      return true;
    }
    const { prepared } = row;
    const [source] = ctx.db.getInstancesByIds([prepared.source.instanceId]);
    const spawned = await spawnTarget(row, source);
    if (spawned instanceof ElysiaStatus) {
      return spawned;
    }
    const open =
      row.openItems ??
      (source ? await ctx.openItems.read(prepared.source.instanceId) : null);
    if (open instanceof ElysiaStatus) {
      return open;
    }
    if (cancelledContinuation(row.id)) {
      ctx.retireSession(targetMachineOf(row), row.targetInstanceId);
      return false;
    }
    openTarget(moveContinuation(row.id, { openItems: open }) ?? row, source);
    return true;
  };

  /** The opening handed to the target, by the way its job goes on: folded already, one session, or a separate one. */
  const openTarget = (
    ready: ContinuationRow,
    source: ReturnType<typeof ctx.db.getInstancesByIds>[number] | undefined
  ): void => {
    if (
      ctx.db.instanceIdOf(ready.prepared.source.instanceId) ===
      ready.targetInstanceId
    ) {
      // Folded before a restart, its opening not yet gone: the source's row
      // may be gone with its process meanwhile.
      sendOpening(ready, "continuation");
      afterFold(ready);
    } else if (source && ready.askedBy.kind !== "person") {
      oneSession(ready, source);
    } else {
      separateSession(ready, source);
    }
  };

  /**
   * The source's own work item going on in the new session, whoever asked:
   * its opening is the item's (its row has named the item since its start,
   * {@link spawnTarget}, so it lists finish_item from its first turn). The
   * source never runs again in that workspace.
   */
  const carryItem = (
    job: ContinuationRow,
    source: ReturnType<typeof ctx.db.getInstancesByIds>[number] | undefined
  ): void => {
    if (source?.workItemId) {
      ctx.workItems.continuedIn(source.workItemId, job.targetInstanceId);
    }
  };

  /**
   * The person's own Continue: a separate session. Its item and its live
   * work move to it in one transaction ({@link DbShape.atomically}); then
   * the source, holding an item or not, points onward to it and its process
   * ends ({@link retireContinued}), the opening goes, and what the source
   * was owed goes behind it ({@link releaseOne}).
   */
  const separateSession = (
    job: ContinuationRow,
    source: ReturnType<typeof ctx.db.getInstancesByIds>[number] | undefined
  ): void => {
    const from = job.prepared.source.instanceId;
    const adopted = ctx.db.atomically(() => {
      carryItem(job, source);
      return ctx.db.adoptChildren(from, job.targetInstanceId);
    });
    retireContinued(from, job.targetInstanceId);
    saidAdopted(from, job.targetInstanceId, adopted);
    sendOpening(job, "peer");
    ctx.releaseOwed({ instanceId: from });
  };

  /**
   * ONE SESSION, ALL OR NOTHING. Anything else's continuation is its source
   * going on in the new session ({@link foldContinued}), and its steps in
   * the hub's records commit in one transaction: the source's item and live
   * work move to it ({@link carryItem}, `adoptChildren`), its line is
   * written between the two conversations ({@link noteContinued}), and the
   * source is folded into it (db `foldContinued`). Only then does the
   * opening go, under that line, and is the source's process ended. A step
   * that throws commits none of them: the new session is removed
   * ({@link undoStart}, by the job's failure) and the source goes on as it
   * was, holding all it held. One the hub restarted after its commit (the
   * source is a former id of the new session already) only sends its
   * opening ({@link startTarget}).
   */
  const oneSession = (
    job: ContinuationRow,
    source: ReturnType<typeof ctx.db.getInstancesByIds>[number]
  ): void => {
    const to = job.targetInstanceId;
    const plan = ctx.db.atLimit.compaction(source.id);
    const committed = ctx.db.atomically(() => {
      carryItem(job, source);
      const adopted = ctx.db.adoptChildren(source.id, to);
      noteContinued(job, source);
      // What it was handed and never read goes with what it was owed.
      for (const send of ctx.db.sendsIn(source.id, ["pending"])) {
        if (!send.owed && send.envelope) {
          ctx.db.holdSend(send.uuid, send.envelope);
        }
      }
      ctx.dropCompaction(source.id, plan);
      return { adopted, folded: ctx.db.foldContinued(source.id, to) };
    });
    saidAdopted(source.id, to, committed.adopted);
    foldContinued(job, source, committed.folded, plan);
    sendOpening(job, "continuation");
    afterFold(job);
  };

  /** The move a summary went on as, as its continued line says what sent it. */
  const continuedAs = (
    by: Extract<ContinuationAsker, { kind: "move" }>
  ): NonNullable<Extract<AccountMove, { kind: "continued" }>["move"]> => {
    const { move } = by;
    if (move.kind !== "moved") {
      return {
        at: by.stopped ? "limit" : "ahead",
        window: null,
        resetsAt: null,
      };
    }
    return {
      at: by.stopped ? "limit" : "ahead",
      window: move.window,
      resetsAt: move.resetsAt,
      ...(move.because ? { because: move.because } : {}),
      ...(move.asked ? { asked: true as const } : {}),
    };
  };

  /** Who asked for a continuation, as its line's detail names them. */
  const askerLine = (
    by: Exclude<ContinuationAsker, { kind: "move" }>
  ): string => {
    if (by.kind === "task") {
      return `your comment on ${by.id}`;
    }
    if (by.kind === "person") {
      return "you";
    }
    const [asker] = ctx.db.getInstancesByIds([by.id]);
    return asker ? ctx.sessionName(asker) : `session ${by.id.slice(0, 8)}`;
  };

  /**
   * The line a continuation that stays one session stands on between its
   * two conversations ({@link foldContinued}): where it went on, from what,
   * and who asked. Written on the new session before its opening goes, so
   * the opening folds under it as its brief.
   */
  const noteContinued = (
    job: ContinuationRow,
    source: ReturnType<typeof ctx.db.getInstancesByIds>[number]
  ): void => {
    const [target] = ctx.db.getInstancesByIds([job.targetInstanceId]);
    if (!target) {
      return;
    }
    const named = (accountId: string | null | undefined) => {
      const account = accountId ? ctx.db.accounts.get(accountId) : undefined;
      return account ? namedAccount(account, ctx.db.accounts.list()) : null;
    };
    const summariser = job.summariserInstanceId
      ? ctx.db.getInstancesByIds([job.summariserInstanceId])[0]
      : undefined;
    const asks = !!job.request.asksOnly;
    const by = job.askedBy;
    ctx.noteAtLimit(target, {
      kind: "continued",
      from: named(source.accountId),
      to: named(target.accountId),
      writtenOn: asks ? null : named(summariser?.accountId),
      ...(by.kind === "move"
        ? { move: continuedAs(by) }
        : { by: askerLine(by), asked: true as const }),
      ...(asks ? { asks: true as const } : {}),
      tokens: job.prepared.liveContextTokens,
      preparedAtPct: null,
    });
  };

  /**
   * THE ONE-SESSION RULE: a continuation anything but the person's own
   * Continue asked for (a session's `continue_session`, a task's comment,
   * a move at an account's limit) is the session going on in a fresh
   * conversation, never a second session. The source is folded into the
   * new session (db `foldContinued`, committed with the rest of its steps
   * by {@link oneSession}): its id is a former id of it, so a send, a
   * handoff, a tab or a link that names it reaches the new one
   * ({@link byIdNow}); its row goes, the new one taking its place, title
   * and start on the board; its conversation reads before the new one's,
   * with its line between ({@link noteContinued}). Here, once that has
   * committed: its at-limit hold, the resume at its reset, a move owed at
   * its turn's end and its compaction (`plan`, read before the commit) are
   * forgotten, and its process is ended, the wake-ups it scheduled inside it
   * with it.
   */
  const foldContinued = (
    job: ContinuationRow,
    source: ReturnType<typeof ctx.db.getInstancesByIds>[number],
    folded: ReturnType<typeof ctx.db.foldContinued>,
    plan: ReturnType<typeof ctx.db.atLimit.compaction>
  ): void => {
    const from = source.id;
    const to = job.targetInstanceId;
    ctx.atLimit.forget(from);
    ctx.owedMoves.delete(from);
    ctx.saidCompactionFolded(source, plan, to);
    ctx.forgetPending(from, UNREAD.stopped, false, "all");
    // The asks the hub owns went with its rows (db `foldContinued`): each
    // is parked again under the session it goes on in, its machine with
    // it, so its card is drawn there and its former one goes.
    const [target] = ctx.db.getInstancesByIds([to]);
    for (const ask of target ? ctx.db.asks.openOf(to) : []) {
      const parked = ctx.pending.get(ask.id);
      if (target && parked && parked.instanceId !== to) {
        ctx.parkForPerson(askEnvelope(ask, target));
      }
    }
    // Its memory and design proposals go on with it too: each names the
    // session it went on in from here, across restarts, and its card is
    // drawn there.
    detach(
      ctx.projectMemory.folded(from, to).then((done) => {
        if (done instanceof ElysiaStatus) {
          console.warn(
            `[memory proposals of a folded session] failed: ${done.response.detail}`
          );
        }
      }),
      "memory proposals of a folded session"
    );
    ctx.designSystem.folded(to);
    if (folded && folded.ending.length > 0) {
      ctx.lifecycle.oweEndSession(from, "delete");
    }
    console.info(
      `[continuation] ${ctx.sessionName(source)} (${from.slice(0, 8)}) goes on as ${to.slice(0, 8)}, one session, asked by ${askerWords(job.askedBy)}: ${from.slice(0, 8)} is a former id of it from here${folded?.ending.length ? ", its process ended" : ""}.`
    );
  };

  /**
   * A folded continuation's opening gone: it is drawn, the new session's
   * transcript is read again with its source's conversation before it, both
   * machines' boards are told, and what the source was owed goes to it.
   */
  const afterFold = (job: ContinuationRow): void => {
    const to = job.targetInstanceId;
    const opening = ctx.db.sendRecord(job.openingUuid);
    if (opening) {
      ctx.publishSend(opening);
    }
    ctx.transcripts.reread(to);
    ctx.publishInstances(job.prepared.source.machineId);
    ctx.publishInstances(targetMachineOf(job));
    ctx.releaseOwed({ instanceId: to });
  };

  /**
   * A session the person's own Continue went on in `to` (a separate
   * session; anything else's continuation is folded into one,
   * {@link foldContinued}) never runs again (its work item's workspace, when
   * it held one, has one session from here): its row names `to`
   * ({@link InstanceRow.continuedInto}), so core `relaunchOf` refuses every
   * wake of it (a send's, a revive's, a relaunch on another account) and
   * every send to it goes to `to` (`toContinuation`); its at-limit
   * hold and the resume at its reset go, and a move owed at its turn's end;
   * and its process is stopped, the wake-ups it scheduled inside it with
   * it. What it was owed goes to `to` once the opening has gone
   * ({@link releaseOne}). Idempotent: a job resumed after a restart does it
   * again to the same end.
   */
  const retireContinued = (from: string, to: string): void => {
    const [row] = ctx.db.getInstancesByIds([from]);
    if (!row || from === to) {
      return;
    }
    if (row.continuedInto !== to) {
      ctx.db.patchInstance(from, { continuedInto: to });
    }
    ctx.atLimit.forget(from);
    ctx.owedMoves.delete(from);
    const live = !["stopped", "discarded"].includes(row.status);
    console.info(
      `[continuation] ${ctx.sessionName(row)} (${from.slice(0, 8)}) was continued in ${to.slice(0, 8)}, which carries its work on: it never runs again${live ? ", and its process is stopped" : ""}. What is sent to it goes to ${to.slice(0, 8)}.`
    );
    if (live) {
      ctx.endSession(from, "stop", {
        kind: "hub",
        why: `it was continued in ${to.slice(0, 8)}`,
      });
    }
    ctx.publishInstances(row.machineId);
  };

  /**
   * Starts a job's new session, under the session that started its source
   * (`source`, when CawCo runs it) and at its effort on the same harness;
   * nothing when it runs already (started before a restart).
   */
  const spawnTarget = async (
    row: ContinuationRow,
    source: ReturnType<typeof ctx.db.getInstancesByIds>[number] | undefined
  ) => {
    const { request, prepared } = row;
    const [target] = ctx.db.getInstancesByIds([row.targetInstanceId]);
    if (target?.status === "running") {
      return;
    }
    return await ctx.spawnFromHub(
      targetMachineOf(row),
      targetSpawn(
        request,
        prepared.source,
        row.targetInstanceId,
        source?.projectId ?? request.target.projectId,
        source?.parentInstanceId,
        source?.harness === request.target.harness ? source.chosenEffort : null
      ),
      request.target.scratch ? "scratch" : "mainline",
      // It goes on with its source's work, as whoever started that.
      source?.origin ?? "person",
      continuationCauseMode(row),
      // Its row names the source's item before its process lists its tools,
      // so its first turn has finish_item; the item moves to it before its
      // opening ({@link startTarget}).
      source?.workItemId ?? undefined,
      source
    );
  };

  /**
   * The session a continuation started took on the live work of the one it
   * continues, before its opening turn: its unended delegates and their
   * items, queued delegates and starts, and the asks waiting on an answer
   * ({@link DbShape.adoptChildren}, committed with the job's other steps).
   * Said once committed, and every board those sessions are on is told.
   * Reports route by the moved rows.
   */
  const saidAdopted = (
    from: string,
    to: string,
    adopted: ReturnType<typeof ctx.db.adoptChildren>
  ): void => {
    const [source, target] = [from, to].map(
      (id) => ctx.db.getInstancesByIds([id])[0]
    );
    console.log(
      `[continuation] The new session${target ? ` ${ctx.sessionName(target)}` : ""} takes on ${source ? ctx.sessionName(source) : "its source"}'s live work: ${adopted.sessions.length} delegate(s), ${adopted.items} work item(s), ${adopted.queuedItems} queued delegate(s), ${adopted.queuedStarts} queued task start(s), ${adopted.asks} pending ask(s), ${adopted.artifacts} artifact(s). Their reports, and what is said on its artifacts, go to it from now on.`
    );
    const machines = new Set(
      ctx.db
        .getInstancesByIds([to, ...adopted.sessions])
        .map((row) => row.machineId)
    );
    for (const machineId of machines) {
      ctx.publishInstances(machineId);
    }
  };

  /**
   * Hands a job's opening under the job's send uuid, once: to its new
   * session, from the session it continues (`peer`), or, for one that is
   * that session going on ({@link oneSession}), as the opening of its fresh
   * conversation under the line before it (`continuation`).
   */
  const sendOpening = (
    row: ContinuationRow,
    as: "peer" | "continuation"
  ): void => {
    if (ctx.db.sendRecord(row.openingUuid)) {
      return;
    }
    ctx.sendFromHub(
      targetMachineOf(row),
      row.targetInstanceId,
      openingOf(row),
      // Its transcript was read on its machine, in this directory.
      {
        id: row.prepared.source.instanceId,
        cwd: row.prepared.source.cwd,
        harness: row.prepared.source.harness,
        launchDir: "known",
      },
      row.openingUuid,
      // Kept on the job's record until now, so a restart in between keeps them.
      { images: row.request.images, attachments: row.request.attachments },
      as === "continuation"
        ? { kind: "system", name: CONTINUATION_ORIGIN }
        : undefined
    );
  };

  /**
   * Cancel, in any stage before the new session has its opening: the job
   * ends `cancelled` on its record first, so the step in flight sees it.
   * Filing: the source's filing turn runs to its end in the source, and
   * nothing follows it. Summarising: the summariser's wait ends and it is
   * stopped. Starting: a new session already started is stopped once its
   * start lands ({@link startTarget}), nothing adopted and no opening sent.
   */
  const cancelContinuation = (
    id: string
  ): { row: ContinuationRow } | { refused: 404 | 409; why: string } => {
    const row = ctx.db.continuationRow(id);
    if (!row) {
      return { refused: 404, why: "That continuation is not running." };
    }
    if (SETTLED.has(row.stage) || ctx.db.sendRecord(row.openingUuid)) {
      return {
        refused: 409,
        why:
          row.stage === "started" || ctx.db.sendRecord(row.openingUuid)
            ? "The new session has started: stop it as any session."
            : `That continuation already ended (${row.stage}).`,
      };
    }
    const cancelled = moveContinuation(id, { stage: "cancelled" }) ?? row;
    if (row.stage === "summarising" && row.summariserInstanceId) {
      ctx.turnWaiters
        .get(row.summariserInstanceId)
        ?.reject(new Error(CONTINUATION_CANCELLED));
      ctx.retireSession(
        row.prepared.source.machineId,
        row.summariserInstanceId
      );
    }
    console.info(
      `[continuation] ${row.prepared.source.title}: its continuation in a new session was cancelled while ${row.stage}. Nothing starts from it.`
    );
    // A move's summary cancelled: what waited for it goes to the source.
    if (row.askedBy.kind === "move") {
      ctx.releaseOwed({ instanceId: row.sourceInstanceId });
    }
    return { row: cancelled };
  };

  /** A job once it has settled; undefined once it is gone. */
  const settledContinuation = async (
    id: string
  ): Promise<ContinuationRow | undefined> => {
    let row = ctx.db.continuationRow(id);
    while (row && !SETTLED.has(row.stage)) {
      await new Promise<void>((wake) => {
        const waiters = continuationWaiters.get(id) ?? new Set();
        waiters.add(wake);
        continuationWaiters.set(id, waiters);
      });
      row = ctx.db.continuationRow(id);
    }
    return row;
  };

  /**
   * The continuation's new session, with the options the caller's form chose.
   * It takes the source's place: under the session that started the source
   * (`parent`), at the top level when a person did, and the source's own
   * children are adopted by it.
   */
  const targetSpawn = (
    { target }: ContinueRequest,
    source: ContinuationSource,
    instanceId: string,
    /** The project the source is in: the new session joins it. */
    projectId: string | null | undefined,
    /** The session that started the source, if one did. */
    parent: string | null | undefined,
    /**
     * The effort chosen for the source, on a target of its own harness (one
     * effort scale): the new session goes on at it unless the caller chose
     * another.
     */
    sourceEffort: EffortLevel | null | undefined
  ): NamedSpawn => {
    const effort = target.effort ?? sourceEffort;
    return {
      ...(parent ? { parent: { instanceId: parent } } : {}),
      instanceId,
      cwd: target.cwd ?? source.cwd,
      harness: target.harness,
      ...(target.model ? { model: target.model } : {}),
      ...(effort ? { effort } : {}),
      ...(target.permissionMode
        ? { permissionMode: target.permissionMode }
        : {}),
      ...(target.scratch ? { scratch: target.scratch } : {}),
      ...(target.bootstrap ? { bootstrap: target.bootstrap } : {}),
      ...(projectId ? { projectId } : {}),
      ...(target.account ? { account: target.account } : {}),
      title: `${source.title} (continued)`,
      spawnedBy: { instanceId: source.instanceId },
    };
  };

  /** What a started continuation reports: its sessions, and what it carried. */
  const outcomeOf = (row: ContinuationRow): ContinueOutcome => {
    const { prepared } = row;
    const { extracted } = prepared;
    return {
      summariserInstanceId: row.summariserInstanceId,
      targetInstanceId: row.targetInstanceId,
      summary: row.summary,
      opening: openingOf(row),
      liveContextTokens: prepared.liveContextTokens,
      summariseInputTokens: prepared.summariseInputTokens,
      openingTokens: prepared.openingTokens,
      compacted: prepared.compacted,
      entries: prepared.entries,
      sizes: {
        artifacts: extracted.artifacts.length,
        middle: extracted.middle.join("\n\n").length,
        tail: extracted.tail.length,
      },
    };
  };

  return {
    prepareContinuation,
    cloneForContinuation,
    continuationRefusal,
    inFlightFor,
    SETTLED,
    continuationJob,
    continuationTable,
    continuationsWhole,
    machineFor,
    forgetContinuationLater,
    startContinuation,
    advanceContinuation,
    heldJobs,
    cancelContinuation,
    settledContinuation,
    outcomeOf,
  };
};

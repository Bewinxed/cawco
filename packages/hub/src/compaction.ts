import type { AccountMove, CompactStage } from "@cawco/core/accounts";
import { accountProvidersOf, DEFAULT_COMPACTION } from "@cawco/core/accounts";
import type {
  ContextFill,
  ContextLine,
  FiledRecords,
  FilingStage,
  FilingWrote,
} from "@cawco/core/context-filing";
import { detach } from "@cawco/core/detach";
import { CONTEXT_LINE } from "@cawco/core/harness";
import type { HarnessKind } from "@cawco/core/harness/kinds";
import { COMPACTION_ORIGIN } from "@cawco/core/harness/kinds";
import { traitsOf } from "@cawco/core/harness/traits";
import type { Envelope, InstanceRow, SendPayload } from "@cawco/core/protocol";
import type { NeutralSystemMessage } from "@cawco/core/session-messages";
import { ContextLineSchema } from "@cawco/core/stored-shapes";
import { contextWords } from "@cawco/core/words/context";
import { noticeWords } from "@cawco/core/words/notices";
import { fileDue } from "./at-limit";
import type { LimitCompaction } from "./db/at-limit";
import type { HubContext } from "./hub-context";
import {
  COMPACT_FOCUS,
  filingPrompt,
  filingWrote,
  recordsOf,
} from "./open-items";
import { LIMIT_ORIGIN } from "./sends";
import { sessionWord } from "./session-word";
import { unreachable } from "./unreachable";

/** One of the hub's own lines in a session's transcript: a system frame under the line's own id. */
export type HubLineMessage = NeutralSystemMessage & { uuid: string };

/**
 * The hub's line about a session's context (core `CONTEXT_LINE`), as its row
 * keeps it (`content` the line as JSON): the same on the live stream and a
 * later transcript read.
 */
export const contextLine = (
  row: { sessionId: string | null },
  line: { at: number; id: string; content: string }
): HubLineMessage => ({
  type: "system",
  subtype: CONTEXT_LINE,
  uuid: line.id,
  session_id: row.sessionId ?? "",
  content: line.content,
  timestamp: new Date(line.at).toISOString(),
});

export type CompactionContext = Pick<
  HubContext,
  | "SETTLED"
  | "accountOf"
  | "accountWords"
  | "atLimit"
  | "carryTo"
  | "db"
  | "deliverSend"
  | "inputRefusal"
  | "lastRequestContext"
  | "noteAtLimit"
  | "openItems"
  | "owedMoves"
  | "publishStalls"
  | "registry"
  | "releaseOne"
  | "releaseOwed"
  | "reportToParent"
  | "sessionIdle"
  | "sessionName"
  | "transcripts"
  | "unnoteAtLimit"
>;

export const createCompaction = (ctx: CompactionContext) => {
  /**
   * What a session is told when it may go on, in its own process, after
   * what stopped its last turn: its account's limit, or a sign-in failure
   * (a refused credential it moved off, or a token refresh race).
   */
  const CARRY_ON: Record<"limit" | "signin", string> = {
    limit:
      "The usage limit that stopped your last turn no longer applies. Carry on from where you stopped.",
    signin:
      "The sign-in failure that stopped your last turn has been dealt with. Carry on from where you stopped.",
  };

  /** The line a failure of the at-limit controller's answer to `what` writes. */
  const limitAnswerFailed = (
    instanceId: string,
    what: string,
    error: unknown
  ): void => {
    const [row] = ctx.db.getInstancesByIds([instanceId]);
    console.error(
      `[at-limit] ${row ? ctx.sessionName(row) : "A session no longer recorded"}: the hub's answer to ${what} failed: ${error instanceof Error ? error.message : String(error)}. It stays on ${ctx.accountWords(row?.accountId)} as it was; the next look at the limit decides again.`
    );
  };

  /**
   * Has a session carry on where its account's limit, or a sign-in failure,
   * stopped it. `quiet`: a note its next turn reads, starting none (the
   * at-limit controller's `resume` of a stale hold a person's or its
   * parent's word took up, whose own turn it rides).
   */
  const carryOn = (
    row: { id: string; machineId: string },
    stopped: "limit" | "signin",
    quiet = false
  ): void => {
    ctx.deliverSend(
      sessionWord(
        row,
        CARRY_ON[stopped],
        {
          kind: "system",
          name: LIMIT_ORIGIN,
          line: noticeWords.carryOn[stopped],
        },
        quiet ? { shouldQuery: false } : {}
      )
    );
  };

  /**
   * A session compacted natively as it moves (at-limit.ts `compactionPlan`:
   * another organization, `moveWholeUnderK` or more; db
   * `limit_compactions`): its first steps on the new account after the move,
   * or on its own before it (core `AccountMove` `compactFirst`), the move
   * following their end ({@link moveCompacted}):
   *
   * 0. `carrying`, when its limit or sign-in stopped it: its carry-on, the
   *    turn that answers what the refused turn asked. Its refused message has
   *    no answer in Claude Code's transcript, so a filing prompt sent first
   *    would be read with it as one turn; the carry-on is that turn's own.
   * 1. `filing`: one turn whose only job is to file its open items in its
   *    records (open-items.ts `filingPrompt`).
   * 2. `compacting`: its harness's own `/compact`, with the hub's focus
   *    ({@link COMPACT_FOCUS}), sent once the filing turn has ended. After
   *    the move, its summary reads the whole conversation, the one uncached
   *    read the move pays anyway; before it, it reads it warm. Every harness
   *    lists the open items after it: Claude Code through the agent's
   *    SessionStart hook on the `compact` source, pi on its
   *    `compaction_end`, OpenCode through CawCo's plugin on its
   *    `session.compaction.ended` (each reads the `open_items` tool).
   *
   * A filing at the session's context threshold ({@link fileAtThreshold},
   * the plan's `fill`) is step 1 alone: no `/compact` follows it, its
   * harness compacting it later on its own.
   *
   * Each goes `ahead` of everything the session is owed, alone: every
   * other send waits at the hub until the compaction ends ({@link
   * heldAtLimit}), so Claude Code never joins one into the `/compact`, and
   * its keep-alive sends no ping meanwhile. A person's interrupt or stop of
   * either turn ends the compaction there, the conversation going on whole;
   * what waited goes then, the carry-on after what was held before it. The
   * move's line says each stage again under its id.
   */
  const compactionSend = (
    row: { id: string; machineId: string },
    uuid: string,
    content: string,
    origin: string = COMPACTION_ORIGIN
  ): void => {
    const sent = ctx.deliverSend(
      {
        verb: "send",
        machineId: row.machineId,
        instanceId: row.id,
        payload: {
          instanceId: row.id,
          message: {
            type: "user",
            uuid,
            message: { role: "user", content },
            parent_tool_use_id: null,
            origin: { kind: "system", name: origin },
          },
        },
      } satisfies Envelope<SendPayload>,
      true
    );
    // Refused as it was taken: the compaction ends now, stopped, and what
    // waited behind it goes, never held for a step that went nowhere.
    if (sent?.state === "failed") {
      queueMicrotask(() => advanceCompaction(row.id));
    }
  };

  /** A compaction's plan and its row when its session's machine is connected. */
  const compactionOnline = (instanceId: string) => {
    const plan = ctx.db.atLimit.compaction(instanceId);
    const [row] = ctx.db.getInstancesByIds([instanceId]);
    return plan && row && ctx.registry.agent(row.machineId)
      ? { plan, row }
      : undefined;
  };

  /** A compaction's own sends, by their uuids: what its hold never holds. */
  const stepUuids = (plan: LimitCompaction): string[] => [
    ...(plan.carryUuid ? [plan.carryUuid] : []),
    plan.filingUuid,
    ...(plan.compactUuid ? [plan.compactUuid] : []),
  ];

  /** A compaction step's send, by its stage. */
  const stepUuid = (plan: LimitCompaction): string => {
    switch (plan.stage) {
      case "carrying":
        return plan.carryUuid ?? plan.filingUuid;
      case "filing":
        return plan.filingUuid;
      case "compacting":
        return plan.compactUuid ?? plan.filingUuid;
    }
  };

  /** A compaction step as a line names it. */
  const stepWords = (stage: LimitCompaction["stage"]): string => {
    switch (stage) {
      case "carrying":
        return "carry-on turn";
      case "filing":
        return "filing turn";
      case "compacting":
        return "/compact";
    }
  };

  /** Sends a compaction's step at `plan`'s stage, under its uuid. */
  const sendStep = (
    row: { id: string; machineId: string },
    plan: LimitCompaction
  ): void => {
    switch (plan.stage) {
      case "carrying":
        compactionSend(
          row,
          stepUuid(plan),
          CARRY_ON[
            plan.move?.kind === "moved" && plan.move.because?.kind === "refused"
              ? "signin"
              : "limit"
          ],
          LIMIT_ORIGIN
        );
        return;
      case "filing":
        compactionSend(
          row,
          plan.filingUuid,
          filingPrompt("compacted", plan.fill ?? undefined)
        );
        return;
      case "compacting":
        if (plan.compactUuid) {
          compactionSend(row, plan.compactUuid, `/compact ${COMPACT_FOCUS}`);
        }
        return;
    }
  };

  /**
   * Starts `row`'s compaction, just relaunched on its new account: its
   * carry-on goes first when what `stopped` it is to be carried on past,
   * else its filing turn.
   */
  const startCompaction = (
    row: { id: string; machineId: string },
    line: string,
    move: AccountMove,
    stopped: false | "limit" | "signin"
  ): void => {
    const plan: LimitCompaction = {
      instanceId: row.id,
      stage: stopped ? "carrying" : "filing",
      lineId: line,
      move,
      fill: null,
      records: null,
      carryUuid: stopped ? crypto.randomUUID() : null,
      filingUuid: crypto.randomUUID(),
      compactUuid: crypto.randomUUID(),
      compacted: false,
      endedStep: null,
    };
    ctx.db.atLimit.putCompaction(plan);
    const first = move.kind === "moved" && move.compactFirst;
    console.info(
      `[at-limit] ${ctx.sessionName(row)} ${stopped ? "carries on past what stopped it, then files its open items" : "files its open items now"}, then its own /compact runs ${first ? "where it is, before its move" : "on its new account"}; everything else it is sent waits until that ends.`
    );
    sendStep(row, plan);
  };

  /** Says a compaction's move line again at `stage`, under its id and where it stands. */
  const sayCompaction = (
    plan: { instanceId: string; lineId: string; move: AccountMove | null },
    stage: CompactStage
  ): void => {
    const [row] = ctx.db.getInstancesByIds([plan.instanceId]);
    if (!(row && plan.move?.kind === "moved")) {
      return;
    }
    const at = ctx.db.atLimit
      .events([row.id])
      .find((event) => event.id === plan.lineId)?.at;
    ctx.noteAtLimit(row, { ...plan.move, compact: stage }, plan.lineId, at);
  };

  /**
   * Ends a compaction as `stage`, `why` in the hub's log, and lets what
   * waited for it go; one ahead of its move makes that move first
   * ({@link moveCompacted}), what waited going to it there. A filing at the
   * threshold ends with its turn: its line says it filed, or stopped.
   */
  const endCompaction = (
    plan: LimitCompaction,
    stage: "compacted" | "stopped",
    why: string
  ): void => {
    ctx.db.atLimit.dropCompaction(plan.instanceId);
    if (plan.move === null) {
      if (stage === "stopped") {
        sayFiling(plan, "stopped");
      } else {
        detach(sayFiled(plan), "a filing's line");
      }
      const [row] = ctx.db.getInstancesByIds([plan.instanceId]);
      console.info(
        `[context] ${row ? ctx.sessionName(row) : plan.instanceId}: ${why}. What was sent to it meanwhile goes now.`
      );
      ctx.releaseOwed({ instanceId: plan.instanceId });
      return;
    }
    if (plan.move.kind === "moved" && plan.move.compactFirst) {
      if (stage === "stopped") {
        compactFirstFailed(plan, plan.move, why);
        return;
      }
      console.info(
        `[at-limit] ${plan.instanceId.slice(0, 8)}: ${why}. It moves to ${ctx.accountWords(plan.move.to.id)} now.`
      );
      detach(moveCompacted(plan, plan.move), "move after compaction");
      return;
    }
    sayCompaction(plan, stage);
    const [row] = ctx.db.getInstancesByIds([plan.instanceId]);
    console.info(
      `[at-limit] ${row ? ctx.sessionName(row) : plan.instanceId}: ${why}. What was sent to it meanwhile goes now.`
    );
    ctx.releaseOwed({ instanceId: plan.instanceId });
  };

  /**
   * A move that compacts first (core `AccountMove` `compactFirst`) whose
   * compaction ended without compacting (`why`: refused, interrupted, or its
   * `/compact` compacted nothing). ONE PATH: it compacts and moves, or does
   * not move; it is never moved whole instead. Its move line gives way to
   * one saying it wasn't moved and why, its parent is told, and it goes on
   * where it is, with what was sent to it meanwhile; its account's limit
   * decides again when it reaches it.
   */
  const compactFirstFailed = (
    plan: LimitCompaction,
    move: Extract<AccountMove, { kind: "moved" }>,
    why: string
  ): void => {
    const [row] = ctx.db.getInstancesByIds([plan.instanceId]);
    if (!row) {
      return;
    }
    ctx.unnoteAtLimit(row, plan.lineId);
    ctx.noteAtLimit(row, {
      kind: "unmoved",
      action: "move",
      from: move.from,
      to: move.to,
      step: "start",
      reason: why,
    });
    const [listed] = ctx.db.listedInstancesByIds([row.id]);
    if (listed?.parentInstanceId) {
      ctx.reportToParent(
        listed,
        `${ctx.sessionName(row)} wasn't moved to ${move.to.name}: ${why}. It goes on where it is.`,
        false,
        { notice: true }
      );
    }
    ctx.publishStalls();
    ctx.releaseOwed({ instanceId: row.id });
  };

  /**
   * Moves `instanceId`'s compaction on: at the end of a turn of it, or as
   * its machine comes back or the hub starts (a step a restart cut: sent if
   * it never went). A step's turn has ended once its send is read and its
   * turn's end was heard (`endedStep`, stored) or no turn of it is open;
   * then the filing turn is followed by the `/compact`, and the
   * `/compact`'s end ends the compaction, compacted when Claude Code said
   * its boundary. A step its session refused ends it stopped.
   */
  const advanceCompaction = (instanceId: string): void => {
    const at = compactionOnline(instanceId);
    if (!at) {
      return;
    }
    const { plan, row } = at;
    if (stepEnded(plan, row)) {
      nextCompactionStep(plan, row);
    }
  };

  /**
   * A turn of `instanceId` ended while it compacts after a move: when the
   * current step's send was read, that step's turn is over, stored on the
   * compaction (`endedStep`) before anything moves on, so a hub that
   * restarts before the next step goes moves on from it
   * ({@link recoverCompaction}). Then the compaction goes on.
   */
  const compactionTurnEnded = (instanceId: string): void => {
    const plan = ctx.db.atLimit.compaction(instanceId);
    if (!plan) {
      return;
    }
    const step = stepUuid(plan);
    if (plan.endedStep !== step && ctx.db.sendRecord(step)?.state === "read") {
      ctx.db.atLimit.patchCompaction(instanceId, { endedStep: step });
    }
    advanceCompaction(instanceId);
  };

  /**
   * `instanceId`'s compaction as its machine registers, the hub's start
   * included: a step whose turn ended while the hub was away (its result
   * never reached a hub to end it) is over on the machine's own word that
   * the session is between turns ({@link sessionIdle}), not on a turn the
   * hub last saw open; then the next step goes. Any other state goes on as
   * at any look ({@link advanceCompaction}).
   */
  const recoverCompaction = async (instanceId: string): Promise<void> => {
    const at = compactionOnline(instanceId);
    if (!at) {
      return;
    }
    const { plan, row } = at;
    const sent = ctx.db.sendRecord(stepUuid(plan));
    // Its turn's end was heard and stored before the hub stopped: it goes
    // on from there, whatever the machine says now.
    if (sent?.state === "read" && plan.endedStep === stepUuid(plan)) {
      console.info(
        `[at-limit] ${ctx.sessionName(row)}'s ${stepWords(plan.stage)} had ended before the hub restarted, as the hub stored; the compaction goes on.`
      );
      nextCompactionStep(plan, row);
      return;
    }
    if (sent?.state === "read" && (await ctx.sessionIdle(row))) {
      const now = ctx.db.atLimit.compaction(instanceId);
      if (now?.stage === plan.stage) {
        console.info(
          `[at-limit] ${ctx.sessionName(row)}'s ${stepWords(plan.stage)} ended while the hub was away; its machine says it is between turns, so the compaction goes on.`
        );
        nextCompactionStep(now, row);
      }
      return;
    }
    advanceCompaction(instanceId);
  };

  /**
   * Whether a compaction's current step has ended: its send read and no turn
   * of it open. A step never sent (a restart cut it) is sent now; one its
   * machine handed back, owed, goes to the session's process now if it has
   * one ({@link releaseOne}, which keeps it for the next one otherwise); one
   * its session refused ends the compaction stopped.
   */
  const stepEnded = (
    plan: LimitCompaction,
    row: { id: string; machineId: string }
  ): boolean => {
    const sent = ctx.db.sendRecord(stepUuid(plan));
    if (!sent) {
      sendStep(row, plan);
      return false;
    }
    if (sent.owed && sent.state === "pending") {
      ctx.releaseOne(sent);
      return false;
    }
    if (sent.state === "failed") {
      endCompaction(
        plan,
        "stopped",
        `its ${stepWords(plan.stage)} was refused (${sent.reason ?? "no reason given"}), so it isn't compacted and goes on with its whole conversation`
      );
      return false;
    }
    const open =
      ctx.db.ownedInstance(row.id, row.machineId)?.turnOpenAt ?? null;
    return (
      sent.state === "read" &&
      (plan.endedStep === stepUuid(plan) || open === null)
    );
  };

  /**
   * A compaction's step ended: the carry-on is followed by the filing turn,
   * that by the `/compact`, whose end ends it.
   */
  const nextCompactionStep = (
    plan: LimitCompaction,
    row: ReturnType<typeof ctx.db.getInstancesByIds>[number]
  ): void => {
    const { instanceId } = plan;
    if (plan.stage === "carrying") {
      ctx.db.atLimit.patchCompaction(instanceId, { stage: "filing" });
      console.info(
        `[at-limit] ${ctx.sessionName(row)} carried on past what stopped it; it files its open items now.`
      );
      sendStep(row, { ...plan, stage: "filing" });
      return;
    }
    // A filing at the threshold is its filing turn alone: its harness
    // compacts it later, on its own.
    if (plan.stage === "filing" && plan.fill) {
      endCompaction(
        plan,
        "compacted",
        "it filed its open items at its context threshold; its harness compacts it later, on its own"
      );
      return;
    }
    if (plan.stage === "filing") {
      ctx.db.atLimit.patchCompaction(instanceId, { stage: "compacting" });
      sayCompaction(plan, "compacting");
      console.info(
        `[at-limit] ${ctx.sessionName(row)} filed its open items; its own /compact goes now.`
      );
      sendStep(row, { ...plan, stage: "compacting" });
      return;
    }
    endCompaction(
      plan,
      plan.compacted ? "compacted" : "stopped",
      plan.compacted
        ? "its own /compact compacted it"
        : "its /compact ended without compacting, so it goes on with its whole conversation"
    );
  };

  /**
   * The move a compaction ahead of it waited for (core `AccountMove`
   * `compactFirst`), made now its compaction has compacted it (one that
   * didn't is not moved, {@link compactFirstFailed}): its conversation
   * carried to the account its
   * line names and relaunched there ({@link carryTo}), its line said again
   * as it ends, and what waited goes there. One its process still keeps
   * where it is owes the move to its turn's end ({@link owedMoves}), its
   * line written as it lands.
   */
  const moveCompacted = async (
    plan: { instanceId: string; lineId: string },
    move: Extract<AccountMove, { kind: "moved" }>
  ): Promise<void> => {
    const [row] = ctx.db.getInstancesByIds([plan.instanceId]);
    if (!row) {
      return;
    }
    // It re-reads what its compaction left, once a reading smaller than the
    // one the move was weighed at says so; the cost weighed then was the
    // whole conversation's, so it is not said.
    const { cost, ...rest } = move;
    const smaller =
      row.contextTokens !== null &&
      move.tokens !== null &&
      row.contextTokens < move.tokens;
    const said: Extract<AccountMove, { kind: "moved" }> = {
      ...rest,
      compact: "compacted",
      tokens: smaller ? row.contextTokens : move.tokens,
    };
    const done = await ctx.carryTo(
      row,
      move.to.id,
      false,
      undefined,
      undefined
    );
    if ("kept" in done) {
      ctx.unnoteAtLimit(row, plan.lineId);
      ctx.owedMoves.set(row.id, {
        to: move.to.id,
        move: said,
        waits: done.kept.later ? "work" : "turn",
        ...(move.asked ? { byHand: true as const } : {}),
      });
      console.info(
        `[at-limit] ${ctx.sessionName(row)} can't move to ${ctx.accountWords(move.to.id)} yet: ${done.kept.why}. It moves when that ends.`
      );
      return;
    }
    const at = ctx.db.atLimit
      .events([row.id])
      .find((event) => event.id === plan.lineId)?.at;
    const { ended } = done;
    ctx.noteAtLimit(
      row,
      ended && (ended.tasks.length > 0 || ended.wakeups > 0)
        ? {
            ...said,
            ended: { tasks: ended.tasks.length, wakeups: ended.wakeups },
          }
        : said,
      plan.lineId,
      at
    );
    ctx.publishStalls();
    ctx.releaseOwed({ instanceId: row.id });
  };

  /**
   * A compacting session folded into its continuation ({@link oneSession}):
   * its compaction (`plan`, read before) is dropped in the fold's own
   * transaction, its line with it, and nothing moves it. The continuation
   * is its move now, and its row goes with the fold; ended as a stop
   * instead, a compaction ahead of a move would carry the row the fold is
   * deleting (2026-11-04: `[move after compaction] failed: SQLiteError:
   * FOREIGN KEY constraint failed`). Records only: its transcript and log
   * are told once the fold has committed ({@link saidCompactionFolded}).
   */
  const dropCompaction = (
    instanceId: string,
    plan: ReturnType<typeof ctx.db.atLimit.compaction>
  ): void => {
    if (!plan) {
      return;
    }
    ctx.db.atLimit.dropCompaction(instanceId);
    if (plan.move !== null) {
      ctx.db.atLimit.dropEvent(plan.lineId);
      ctx.db.unanchorLine(instanceId, `limit-${plan.lineId}`);
    }
  };

  /** A folded session's compaction dropped ({@link dropCompaction}), told: its line out of its transcript, and the log. */
  const saidCompactionFolded = (
    row: { id: string },
    plan: ReturnType<typeof ctx.db.atLimit.compaction>,
    to: string
  ): void => {
    if (!plan) {
      return;
    }
    if (plan.move !== null) {
      ctx.transcripts.removeLine(row.id, `limit-${plan.lineId}`);
    }
    console.info(
      `[at-limit] ${row.id.slice(0, 8)}: its ${stepWords(plan.stage)} ends unfinished, as it goes on as ${to.slice(0, 8)}: that continuation is its move, and nothing moves it again.`
    );
  };

  /** A person's interrupt or stop of a compacting session: the compaction ends there. */
  const stopCompaction = (instanceId: string): void => {
    const plan = ctx.db.atLimit.compaction(instanceId);
    if (plan) {
      endCompaction(
        plan,
        "stopped",
        `its ${stepWords(plan.stage)} was interrupted, so it goes on with its whole conversation`
      );
    }
  };

  /**
   * A compaction boundary or failure of a session's harness: one after a
   * move's `/compact` went is that compaction done (Claude Code's and pi's
   * at its end, OpenCode's as it starts); a failure said after it
   * (OpenCode's `compact_result: "failed"`) undoes that.
   *
   * Any boundary re-arms its context threshold ({@link fileAtThreshold})
   * for the session's next turn of its own work: its rise is taken away, and
   * no filing starts until it has answered a request of its own since, so
   * the compaction's own result never files. One no move's `/compact` asked for is its
   * harness compacting it on its own (or a person's `/compact`), said in one
   * line with whether a filing came since its compaction before. A failure
   * OpenCode says after its boundary says that line again as failed, and
   * writes the rise back when a filing had come, so a session that cannot
   * compact is not asked to file again until its next boundary.
   */
  const observeCompaction = (instanceId: string, message: unknown): void => {
    const frame = message as {
      compact_metadata?: { pre_tokens?: number; trigger?: string };
      compact_result?: string;
      subtype?: string;
      type?: string;
      uuid?: string;
    };
    if (frame.type !== "system") {
      return;
    }
    const failed = frame.compact_result === "failed";
    if (frame.subtype !== "compact_boundary" && !failed) {
      return;
    }
    const plan = ctx.db.atLimit.compaction(instanceId);
    if (plan?.stage === "compacting") {
      ctx.db.atLimit.patchCompaction(instanceId, { compacted: !failed });
    }
    const [row] = ctx.db.getInstancesByIds([instanceId]);
    if (!row) {
      return;
    }
    const byMove = plan?.stage === "compacting";
    if (!failed) {
      compactedBy(row, frame, byMove);
    } else if (
      !byMove &&
      traitsOf(row.harness).boundaryBeforeCompactionFailure
    ) {
      compactionFailedAfterBoundary(row);
    }
  };

  /**
   * Its harness said a compaction boundary ({@link observeCompaction}): its
   * rise goes, re-arming its threshold for its next turn of its own work
   * (schema `contextCompactions`), its context reading goes with what it
   * measured, and one no move's `/compact` asked for is said in its line,
   * once, with whether a filing came before it.
   */
  const compactedBy = (
    row: InstanceRow,
    frame: {
      compact_metadata?: { pre_tokens?: number; trigger?: string };
      uuid?: string;
    },
    byMove: boolean
  ): void => {
    const rise = ctx.db.atLimit.rise(row.id);
    ctx.db.atLimit.dropRise(row.id);
    // Re-armed, but not for the compaction's own turn: no filing starts
    // until the session has answered a request of its own since
    // ({@link fileMayStart}, cleared by {@link answeredSinceCompaction}).
    ctx.db.atLimit.putCompacted(row.id, Date.now());
    // What its last request sent is no longer its context: unknown until a
    // request after the compaction says it, as pi itself rules ("context
    // token count is unknown until the next LLM response", 1.4.0
    // AgentSession `getContextUsage`). Kept, a turn that sends none after it
    // (a `/compact` of its own) would leave the reading from before, and the
    // threshold just re-armed would file again on it.
    ctx.lastRequestContext.delete(row.id);
    ctx.db.updateKeepAlive(row.id, {
      contextTokens: null,
      contextReadAt: null,
    });
    // A move's `/compact`: its own line says it.
    if (byMove) {
      return;
    }
    const lineId = `compacted-${frame.uuid ?? crypto.randomUUID()}`;
    // Said once, whatever brings its frame again.
    if (ctx.db.contextLinesOf(row.id).some((line) => line.id === lineId)) {
      return;
    }
    const trigger = frame.compact_metadata?.trigger;
    noteContext(row, lineId, {
      kind: "compacted",
      filed: rise ? filedBy(row.id, rise.lineId) : null,
      harness: row.harness as HarnessKind,
      tokens: frame.compact_metadata?.pre_tokens ?? null,
      trigger: trigger === "auto" || trigger === "manual" ? trigger : null,
    });
  };

  /**
   * OpenCode's compaction failed after the boundary it said as it started
   * ({@link observeCompaction}): its line says so, and when a filing had
   * come before it, its rise is written back under that line.
   */
  const compactionFailedAfterBoundary = (row: InstanceRow): void => {
    const last = ctx.db.contextLinesOf(row.id).at(-1);
    const said = last ? contextLineOf(last.content) : null;
    if (!(last && said?.kind === "compacted") || said.failed) {
      return;
    }
    noteContext(row, last.id, { ...said, failed: true }, last.at);
    if (said.filed !== null) {
      ctx.db.atLimit.putRise({
        instanceId: row.id,
        lineId: last.id,
        at: Date.now(),
      });
    }
  };

  /** A context line as its row keeps it (JSON); null for one that reads as none. */
  const contextLineOf = (content: string): ContextLine | null => {
    try {
      const parsed = ContextLineSchema.safeParse(JSON.parse(content));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  };

  /**
   * How the filing a rise's line names ended: a filing line's stage, or the
   * one a failed compaction's line carried on; null for any other line.
   */
  const filedBy = (instanceId: string, lineId: string): FilingStage | null => {
    const kept = ctx.db
      .contextLinesOf(instanceId)
      .find((one) => one.id === lineId);
    const said = kept ? contextLineOf(kept.content) : null;
    switch (said?.kind) {
      case "filing":
        return said.stage;
      case "compacted":
        return said.filed;
      case undefined:
        return null;
      default:
        throw unreachable(said);
    }
  };

  /**
   * Writes a line about a session's context into its transcript (core
   * `CONTEXT_LINE`), kept on its row and folded into what its screens show
   * now; one already written under `id` is what it says now, where it
   * stood (`at`, when it was first said).
   */
  const noteContext = (
    row: { harness: string; id: string; sessionId: string | null },
    id: string,
    line: ContextLine,
    at: number = Date.now()
  ): void => {
    const kept = { id, at, content: JSON.stringify(line) };
    if (!ctx.db.noteContextLine(row.id, kept)) {
      return;
    }
    ctx.transcripts.line(
      row.id,
      contextLine(row, kept),
      row.harness as HarnessKind
    );
    console.info(
      `[context] ${row.id.slice(0, 8)}: ${contextWords.line(line).title}`
    );
  };

  /**
   * A session's filing at its threshold since its harness last compacted
   * it, as `delegate_list`'s Context line says it: its line's stage and
   * where its harness compacts it; none when no filing came.
   */
  const filingOf = (
    instanceId: string
  ): { filing?: { compactsAt: number; stage: FilingStage } } => {
    const rise = ctx.db.atLimit.rise(instanceId);
    const kept = rise
      ? ctx.db.contextLinesOf(instanceId).find((one) => one.id === rise.lineId)
      : undefined;
    const said = kept ? contextLineOf(kept.content) : null;
    return said?.kind === "filing"
      ? {
          filing: { stage: said.stage, compactsAt: said.fill.compactsAt },
        }
      : {};
  };

  /**
   * Says a filing's line again at `stage`, where it stood: once filed, with
   * what it wrote (`wrote`, when what its records held as it started is
   * known).
   */
  const sayFiling = (
    plan: { fill: ContextFill | null; instanceId: string; lineId: string },
    stage: FilingStage,
    wrote?: FilingWrote
  ): void => {
    const [row] = ctx.db.getInstancesByIds([plan.instanceId]);
    if (!(row && plan.fill)) {
      return;
    }
    const at = ctx.db
      .contextLinesOf(row.id)
      .find((line) => line.id === plan.lineId)?.at;
    noteContext(
      row,
      plan.lineId,
      {
        kind: "filing",
        fill: plan.fill,
        harness: row.harness as HarnessKind,
        stage,
        ...(wrote ? { wrote } : {}),
      },
      at
    );
  };

  /**
   * A filing at the threshold whose turn ended: its line says it filed, and
   * what it wrote, counted against what its records held as it started
   * (open-items.ts `filingWrote`); with those unknown, or its records
   * unreadable now, it says it filed alone.
   */
  const sayFiled = async (
    plan: Extract<LimitCompaction, { move: null }>
  ): Promise<void> => {
    const after = plan.records
      ? await ctx.openItems
          .rows(plan.instanceId)
          .then(recordsOf)
          .catch((error: unknown) => {
            console.warn(
              `[context] ${plan.instanceId.slice(0, 8)}: what its filing wrote could not be read: ${error instanceof Error ? error.message : String(error)}`
            );
            return null;
          })
      : null;
    sayFiling(
      plan,
      "filed",
      plan.records && after ? filingWrote(plan.records, after) : undefined
    );
  };

  /**
   * A session's model answered a request of its own (a top-level assistant
   * message, no compaction's summary): a compaction before it no longer
   * holds its filing back ({@link fileMayStart}). Read before it is written,
   * so most answers write nothing.
   */
  const answeredSinceCompaction = (instanceId: string): void => {
    if (ctx.db.atLimit.compactedAt(instanceId) !== undefined) {
      ctx.db.atLimit.dropCompacted(instanceId);
    }
  };

  /**
   * Whether a session's filing at its context threshold may start now, by
   * what the hub holds of it: it has not filed since its harness last
   * compacted it (its rise), it has answered a request of its own since its
   * harness last compacted it (a compaction's own turn, whose result reports
   * only what the compaction left, files nothing new: its records were just
   * listed back to it), no compaction plan of a move's or a filing's
   * runs, no continuation of it is under way, it is not held at its
   * account's limit nor handled or owed a move there, it is not ending, it
   * is no summariser, and it takes the hub's word (a finished work item's
   * session takes none).
   */
  const fileMayStart = (row: InstanceRow): boolean =>
    row.kind !== "summariser" &&
    !ctx.db.ownedInstance(row.id)?.endIntent &&
    !ctx.db.atLimit.rise(row.id) &&
    ctx.db.atLimit.compactedAt(row.id) === undefined &&
    !ctx.db.atLimit.compaction(row.id) &&
    !ctx.db.atLimit.hold(row.id) &&
    !ctx.atLimit.handling(row.id) &&
    !ctx.owedMoves.has(row.id) &&
    !ctx.db
      .continuationSlips()
      .some(
        (job) => job.sourceInstanceId === row.id && !ctx.SETTLED.has(job.stage)
      ) &&
    !ctx.inputRefusal(row.id, { kind: "system", name: COMPACTION_ORIGIN });

  /** The compaction policy's room for `row`: its account's provider's, else its model's, else the default. */
  const fileRoomOf = (row: InstanceRow): number => {
    const provider =
      (row.accountId ? ctx.accountOf(row.accountId)?.provider : undefined) ??
      accountProvidersOf(row.harness, row.model)[0];
    return provider
      ? ctx.db.accounts.routing(provider).atLimit.compaction.fileRoom
      : DEFAULT_COMPACTION.fileRoom;
  };

  /** Sessions a threshold check runs for now: two turn ends close together check once. */
  const thresholdChecks = new Set<string>();

  /**
   * A turn of `instanceId` ended with its context written, its harness
   * saying where it compacts it on its own (`compactsAt`, its result's):
   * when its reading is within its compaction policy's `fileRoom` of that
   * point (at-limit.ts `fileDue`) and its filing may start ({@link
   * fileMayStart}),
   * it is sent its filing turn, between turns only ({@link sessionIdle}): a
   * session found mid-turn is asked again at its next turn's end. One rise
   * files once ({@link startFiling}); its harness compacts it later, on its
   * own, and the boundary it says re-arms it ({@link observeCompaction}).
   */
  const fileAtThreshold = async (
    instanceId: string,
    compactsAt: number | undefined
  ): Promise<void> => {
    if (thresholdChecks.has(instanceId)) {
      return;
    }
    thresholdChecks.add(instanceId);
    try {
      const [row] = ctx.db.getInstancesByIds([instanceId]);
      if (!(row && fileMayStart(row))) {
        return;
      }
      const room = fileRoomOf(row);
      if (!fileDue({ compactsAt, reported: row.contextTokens, room })) {
        return;
      }
      // What its records hold before its filing turn, read before the idle
      // check, so the filing follows that check with no wait between.
      const records = await ctx.openItems
        .rows(instanceId)
        .then(recordsOf)
        .catch((error: unknown) => {
          console.warn(
            `[context] ${ctx.sessionName(row)}: its records could not be read before its filing, so its line will not say what it wrote: ${error instanceof Error ? error.message : String(error)}`
          );
          return null;
        });
      if (!(await ctx.sessionIdle(row))) {
        console.info(
          `[context] ${ctx.sessionName(row)} is within ${room} tokens of where its harness compacts it (${compactsAt}) but its machine says it is not between turns; it is asked again at its next turn's end.`
        );
        return;
      }
      const [now] = ctx.db.getInstancesByIds([instanceId]);
      if (
        now?.contextTokens === null ||
        now?.contextTokens === undefined ||
        compactsAt === undefined ||
        !fileMayStart(now)
      ) {
        return;
      }
      startFiling(now, { tokens: now.contextTokens, compactsAt }, records);
    } finally {
      thresholdChecks.delete(instanceId);
    }
  };

  /**
   * Starts `row`'s filing at its context threshold: its rise, so this rise
   * files once; its line; and its plan, the filing turn alone ({@link
   * compactionSend}), which goes ahead of everything it is owed while all
   * else waits until that turn ends, kept with what its records hold now
   * (`records`), which what it writes is counted against.
   */
  const startFiling = (
    row: InstanceRow,
    fill: ContextFill,
    records: FiledRecords | null
  ): void => {
    const lineId = `filing-${crypto.randomUUID()}`;
    ctx.db.atLimit.putRise({ instanceId: row.id, lineId, at: Date.now() });
    noteContext(row, lineId, {
      kind: "filing",
      fill,
      harness: row.harness as HarnessKind,
      stage: "filing",
    });
    const plan: LimitCompaction = {
      instanceId: row.id,
      stage: "filing",
      lineId,
      move: null,
      fill,
      records,
      carryUuid: null,
      filingUuid: crypto.randomUUID(),
      compactUuid: null,
      compacted: false,
      endedStep: null,
    };
    ctx.db.atLimit.putCompaction(plan);
    console.info(
      `[context] ${ctx.sessionName(row)} is at ${fill.tokens} tokens, its harness compacting it at ${fill.compactsAt}: it files its open items now; everything else it is sent waits until that turn ends, and its harness compacts it later, on its own.`
    );
    sendStep(row, plan);
  };

  return {
    limitAnswerFailed,
    carryOn,
    stepUuids,
    stepWords,
    startCompaction,
    sayCompaction,
    advanceCompaction,
    compactionTurnEnded,
    recoverCompaction,
    dropCompaction,
    saidCompactionFolded,
    stopCompaction,
    observeCompaction,
    filingOf,
    sayFiling,
    answeredSinceCompaction,
    fileAtThreshold,
  };
};

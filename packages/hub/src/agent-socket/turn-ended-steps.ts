/** What a turn's end does, one step each, listed in order by turnEndedStepsOf. */

import { type ArtifactNeed, unparked } from "@cawco/core/artifact-needs";
import { detach } from "@cawco/core/detach";
import { traitsOf } from "@cawco/core/harness/traits";
import type { InstanceRow } from "@cawco/core/protocol";
import { waitsOnItself } from "@cawco/core/session-messages";
import type { HubContext } from "../hub-context";
import { keepAliveResult } from "../keep-alive";
import type { TurnEnd } from "./turn-ended";

export type TurnEndedContext = Pick<
  HubContext,
  | "artifactLane"
  | "artifacts"
  | "atLimit"
  | "compactionTurnEnded"
  | "db"
  | "fileAtThreshold"
  | "hubAsks"
  | "interruptedTurns"
  | "keepAliveScheduler"
  | "lastRequestContext"
  | "oweMoveOff"
  | "owedMoves"
  | "projectOffers"
  | "publishInstances"
  | "push"
  | "refusedFailures"
  | "relaunchOnAccount"
  | "reportToParent"
  | "ruleEngine"
  | "sleepFinished"
  | "turnInFlight"
  | "watch"
  | "workItems"
>;

export const turnEndedStepsOf = (ctx: TurnEndedContext) => {
  // What a turn's end does, in this order (agent-socket/turn-ended.ts).
  const cacheAnswered = (turn: TurnEnd): void => {
    const { instanceId, neutral } = turn;
    const [cacheRow] = ctx.db.getInstancesByIds([instanceId]);
    turn.cacheRow = cacheRow;
    if (traitsOf(cacheRow?.harness).promptCacheMaxMs !== null) {
      ctx.db.updateKeepAlive(
        cacheRow.id,
        keepAliveResult(
          cacheRow,
          neutral,
          false,
          ctx.lastRequestContext.get(cacheRow.id)
        )
      );
      ctx.lastRequestContext.delete(cacheRow.id);
      // Real turns re-arm from their own request clock.
      detach(ctx.keepAliveScheduler.wake(), "keepalive wake");
      if (cacheRow.keepAliveEnabled) {
        ctx.publishInstances(cacheRow.machineId);
      }
      ctx.atLimit.turnEnded(cacheRow.id);
      // A compaction after a move: its next step, or its end.
      ctx.compactionTurnEnded(cacheRow.id);
    } else if (cacheRow) {
      // The context of a session whose results report no
      // prompt cache, as its harness reported its last request.
      if (neutral.contextTokens !== undefined) {
        ctx.db.updateKeepAlive(cacheRow.id, {
          contextTokens: neutral.contextTokens,
          contextReadAt: new Date(),
        });
      }
      if (cacheRow.accountId) {
        ctx.atLimit.turnEnded(cacheRow.id);
      }
      ctx.compactionTurnEnded(cacheRow.id);
    }
  };

  const owedMoveTaken = (turn: TurnEnd): void => {
    const { cacheRow } = turn;
    // Its account changed during the turn (its model crossed a
    // provider, or a person moved it): it moves now, at the
    // turn's end.
    // Its launch takes the move ({@link takeOwedMove}).
    if (cacheRow && ctx.owedMoves.has(cacheRow.id)) {
      ctx.relaunchOnAccount(cacheRow.id);
    }
  };

  const claudeWindowsKept = (turn: TurnEnd): void => {
    const { neutral, harness } = turn;
    // Claude reports each model's window only here; kept so a
    // picker can say whether a model fits (claude's catalog
    // carries no window of its own).
    if (traitsOf(harness).contextWindow === "hub") {
      const { modelUsage } = neutral as {
        modelUsage?: Record<string, { contextWindow?: number }>;
      };
      for (const [model, usage] of Object.entries(modelUsage ?? {})) {
        if (usage.contextWindow) {
          ctx.db.noteClaudeContextWindow(model, usage.contextWindow);
        }
      }
    }
  };

  const contextFiled = (turn: TurnEnd): void => {
    const { neutral, cacheRow } = turn;
    // Its context as this turn left it, against its window:
    // at its policy's threshold, it files its open items.
    if (cacheRow) {
      detach(
        ctx.fileAtThreshold(cacheRow.id, neutral.compactsAt),
        "context threshold"
      );
    }
  };

  const turnClosed = (turn: TurnEnd): void => {
    const { instanceId, neutral } = turn;
    const { text, onNoReply } = ctx.turnInFlight.ended(instanceId);
    // It ended on no_reply_needed and said nothing after: no
    // news, no push. A failed turn is news whatever it called.
    const silent = onNoReply && !text && neutral.is_error !== true;
    // Every turn's end: its own row, by its key.
    const [row] = ctx.db.listedInstancesByIds([instanceId]);
    const parentId = row?.parentInstanceId;
    // A turn an interrupt cut ({@link interruptedTurns}), on
    // any harness, or one its server's stop cut (OpenCode's
    // `serverStopped`, which the session is handed back,
    // `resumeCutTurn`): nothing is handed back for it, no rule
    // answers it, no push says it ended, and it fails no item.
    const cut =
      ctx.interruptedTurns.delete(instanceId) ||
      neutral.subtype === "aborted" ||
      neutral.serverStopped === true;
    if (row && neutral.subtype === "aborted") {
      // OpenCode's own word: its wait is over; whether it is
      // held was the interrupt's to say ({@link noteInterrupt}).
      ctx.workItems.interrupted(row.id, false);
    }
    const turnId = instanceId;
    const endedAt = new Date();
    Object.assign(turn, {
      text,
      onNoReply,
      silent,
      row,
      parentId,
      cut,
      turnId,
      endedAt,
    });
  };

  const rowNoted = (turn: TurnEnd): void => {
    const { neutral, text, silent, row, cut, turnId, endedAt } = turn;
    // The end on the hub's clock, on the row every screen reads:
    // against `seenAt`, also the hub's, it says "ended since the
    // owner last looked" without any device's clock; a silent
    // end leaves nothing unseen.
    // What this turn left waiting on the person, and what the
    // one before it asked that it moved on from (Needs you's rule 2).
    let artifactLeft: ArtifactNeed | undefined;
    if (row) {
      const before = row.turnEndedAt ? new Date(row.turnEndedAt) : null;
      ctx.db.noteTurnEnded(
        turnId,
        endedAt,
        silent,
        // A cut turn is handed back: nothing of its own waits.
        !cut && waitsOnItself(neutral.wakes)
      );
      // Its closing words answer what it read, and the person's
      // stop settles it; a server's stop is handed back to go on.
      if (
        (text && neutral.is_error !== true) ||
        (cut && neutral.serverStopped !== true)
      ) {
        ctx.db.noteAnswered(turnId, endedAt);
      }
      // An approval this turn read and didn't use lapses.
      ctx.hubAsks.turnEnded(turnId);
      ctx.publishInstances(row.machineId);
      ctx.artifacts.turnEnded(turnId, before, endedAt);
      artifactLeft = unparked(ctx.artifactLane.now().needs)
        .filter(
          (need) =>
            ctx.artifacts.askedIn(need.artifactId, turnId, before) && !cut
        )
        .at(-1);
    }
    turn.artifactLeft = artifactLeft;
  };

  const workItemCounted = (turn: TurnEnd): void => {
    const { row } = turn;
    // Every turn of a work item's session counts against its
    // budget, whatever answers it; one at the limit stops it.
    if (row?.workItemId) {
      ctx.workItems.countTurn(row);
      // The turn that called finish_item is over: what waited
      // out its end goes now, as the next turn.
      ctx.workItems.turnOver(row.id);
    }
  };

  const watchCounted = (turn: TurnEnd): void => {
    const { neutral, turnId } = turn;
    // Fleet watch counts the turn (and ends a triage run's).
    ctx.watch?.endTurn(turnId, neutral);
  };

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the turn's answer: which of rule, hand-back and push answers it is one decision, written once here.
  const turnAnswered = (turn: TurnEnd): void => {
    const {
      neutral,

      text,
      silent,
      row,
      parentId,
      cut,
      turnId,
      endedAt,
      artifactLeft,
    } = turn;
    /** Whether a rule answered the turn with a reply. */
    const answered = (): Promise<boolean> =>
      ctx.ruleEngine.endTurn(turnId, neutral);
    // Delegated work hands its turn back; a session another
    // session started (`start_session`) has a parent and no
    // item, and its turns are its own.
    const delegate =
      row?.workItemId && parentId && parentId !== turnId && !cut
        ? row
        : undefined;
    // A failed turn's report carries the harness's own error
    // words — "(no text)" once stood in for a 403 that was
    // sitting right in the result frame.
    const { errors } = neutral as { errors?: string[] };
    const harnessError =
      errors
        ?.map((each) => each.trim())
        .filter(Boolean)
        .join("\n") || undefined;
    const failed = !!neutral.is_error;
    // A turn its account's refused credential ended that the
    // hub does not carry on: its failure names the account.
    const refused = ctx.refusedFailures.get(turnId);
    ctx.refusedFailures.delete(turnId);
    // A failed turn's words, blank ones skipped: a result frame
    // can carry `result: ""`, and that is no reason.
    const said = {
      wakes: neutral.wakes,
      text: text || harnessError || "(the delegate produced no text this turn)",
      ...(failed
        ? {
            error: `${
              harnessError ||
              neutral.result?.trim() ||
              `The harness ended the turn as failed (${neutral.subtype}) and gave no words for it.`
            }${refused ? `\n${refused.words}` : ""}`,
          }
        : {}),
    };
    // What the parent hears of the turn, if anything: an item
    // with checks reports only through finish_item, or when its
    // turn failed (work-items.ts turnEnded).
    const handBack = (from: InstanceRow): void => {
      const handed = ctx.workItems.turnEnded(from, said, endedAt);
      if (handed) {
        ctx.reportToParent(from, handed.body, handed.failed, {
          completion: {
            resultId: neutral.uuid as string,
            ...(neutral.timestamp ? { completedAt: neutral.timestamp } : {}),
          },
        });
      }
      // Its item is over and its parent has the report: the
      // turn that just ended was its last word.
      ctx.sleepFinished(from.id);
    };
    if (delegate?.workItemId && !failed) {
      // A work item's turn is answered before it is handed
      // back: a rule's reply keeps the item running and wakes
      // its session into the next turn, and the parent hears
      // nothing of this one. Only a turn no standing
      // instruction answers goes back, and may end the item.
      // Meaning rules answer once Jev does; the hand-back
      // waits for them.
      answered()
        .then((replied) => {
          if (!replied) {
            handBack(delegate);
          }
        })
        .catch((error) => {
          console.error(
            `[hand-back] ${turnId}: ${error instanceof Error ? error.message : error}`
          );
        });
    } else {
      // A failed turn goes back at once and ends its item, so
      // nothing answers it; a session that is not delegated
      // work has its turn answered as it always has.
      if (delegate) {
        handBack(delegate);
      }
      if (refused) {
        ctx.oweMoveOff(turnId, refused.accountId, "refused");
      }
      // Nothing waits on whether a rule answered a turn that is
      // not held, but the owner's push does: a turn a rule
      // answered goes on, and waits on no one. A turn an
      // interrupt cut is answered by nothing.
      const owners = row && !parentId;
      if (!cut) {
        detach(
          answered().then((replied) => {
            if (owners && !replied) {
              ctx.push.turnEnded(
                turnId,
                text || harnessError,
                endedAt,
                neutral.wakes,
                silent,
                artifactLeft
              );
            }
          }),
          "rule answer"
        );
      }
    }
  };

  const projectOffered = (turn: TurnEnd): void => {
    const { row, neutral } = turn;
    // A plain session past one conversation is offered a project, once.
    if (row && !neutral.is_error) {
      ctx.projectOffers.turnEnded(row.id);
    }
  };

  return [
    cacheAnswered,
    owedMoveTaken,
    claudeWindowsKept,
    contextFiled,
    turnClosed,
    rowNoted,
    workItemCounted,
    watchCounted,
    turnAnswered,
    projectOffered,
  ];
};

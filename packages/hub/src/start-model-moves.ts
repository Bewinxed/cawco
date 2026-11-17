/**
 * A session whose model the hub chose (spawns.ts `modelFor`: its start
 * picked none, or its delegate type's `default`; schema `instances.hubModel`)
 * never pays for that choice. When its provider refuses its first turn the
 * use of the model (core `modelNotEnabled`) or for want of credit (core
 * `outOfCredit`), the refusal is marked as any is (account-marks.ts), and:
 *
 * 1. the next pick is read as its start's was, with the fresh marks
 *    (spawns.ts `startModelAfter`), never a model and account this first
 *    turn already ran on;
 * 2. the session moves there by the move a person's model pick takes
 *    (relay-control.ts `crossModel`): a relaunch owed to it on the account
 *    and the model (limit-moves.ts `relaunchOnAccount`), its conversation
 *    carried whole, the refused message in it with its words, attachments
 *    and pictures;
 * 3. it is told to answer that message there, the hub's word to its process
 *    as at its account's limit (session-word.ts `LIMIT_ORIGIN`), whose line
 *    in its transcript says which model was refused and which it tries
 *    next. The word rides with the move it owes (db/owed-moves.ts
 *    `OwedCarry`), so the move and its word never come apart.
 *
 * Its first turn is the one no turn of it ended before (`turnEndedAt`): the
 * refused turn this moves ends nothing, so each try is its first turn still.
 * With no pick left, the turn fails as any refused turn does, its words
 * each refusal it met and why no other model runs. One pass: no model and
 * account is tried twice. A model a person picked is never swapped: its
 * refusal is marked and its turn fails, as before.
 */

import type { NeutralMessage } from "@cawco/core/session-messages";
import { markWords } from "@cawco/core/words/account-lines";
import { spawnWords } from "@cawco/core/words/spawn";
import { keptOffIn, markOn } from "./account-marks";
import type { DbShape } from "./db";
import type { PublicInstanceRow } from "./db/instances";
import type { OwedMove } from "./db/owed-moves";
import type { TriedPick } from "./start-models";

/** What the rule reads of the hub (server.ts builds it), each as the hub names it. */
export interface StartModelMovesContext {
  accountWords: (accountId: string | null | undefined) => string;
  /** Sessions whose turn their account's refused credential ended: the at-limit controller's (limit-moves.ts `takeCredentialTurn`). */
  credentialTurns: ReadonlySet<string>;
  db: DbShape;
  owedMoves: { set: (instanceId: string, owed: OwedMove) => void };
  relaunchOnAccount: (instanceId: string) => void;
  resolvedModel: (
    machineId: string,
    harness: string,
    model: string | null | undefined
  ) => string | null | undefined;
  sessionName: (row: PublicInstanceRow) => string;
  /** spawns.ts `startModelAfter`. */
  startModelAfter: (
    row: PublicInstanceRow,
    tried: readonly TriedPick[]
  ) => { accountId?: string; model: string } | { refusal: string };
}

/** What a refused first turn does at its end: moves to its next pick, or fails with why none is left. */
type Decision =
  | { kind: "move"; accountId: string; line: string; model: string }
  | { kind: "stop"; words: string };

/** A first turn's pass over its picks: each model and account it ran on or went to, and each refusal it met. */
interface Pass {
  refused: string[];
  tried: TriedPick[];
}

export const createStartModelMoves = (ctx: StartModelMovesContext) => {
  /** Each session's pass while its first turn is refused ({@link Pass}); gone once a turn of it ends. */
  const passes = new Map<string, Pass>();
  /** What the turn a refusal came in does at its end, by session, from that refusal to the turn's result. */
  const decided = new Map<string, Decision>();

  /**
   * A refusal of session `instanceId`'s turn this rule answers: its model
   * the hub's choice, in its first turn (no turn of it ended yet), on an
   * account that refusal marked (turn-flow.ts `noteMarks`); its row, what
   * it ran on and the mark. None for any other, nor for a turn its
   * credential ended, which the at-limit controller answers.
   */
  const refusalOf = (instanceId: string) => {
    if (ctx.credentialTurns.has(instanceId)) {
      return;
    }
    const [row] = ctx.db.getInstancesByIds([instanceId]);
    const accountId = row?.accountId;
    const model =
      row && ctx.resolvedModel(row.machineId, row.harness, row.model);
    if (!(row?.hubModel && row.turnEndedAt === null && accountId && model)) {
      return;
    }
    const ran = { accountId, model };
    const mark = markOn(keptOffIn(ctx.db, row.harness, model), accountId);
    return mark ? { row, ran, mark } : undefined;
  };

  /**
   * A frame of a session's turn its provider refused, its marks written: a
   * refusal this rule answers ({@link refusalOf}) decides now where the turn
   * goes at its end, before anything fails what it read. Its next pick,
   * never a model and account this pass ran on or went to, or why none is
   * left, in the words of each refusal it met.
   */
  const refusedFrame = (instanceId: string): void => {
    const refusal = decided.has(instanceId) ? undefined : refusalOf(instanceId);
    if (!refusal) {
      return;
    }
    const { row, ran, mark } = refusal;
    const pass = passes.get(instanceId) ?? { refused: [], tried: [] };
    const refused = markWords(
      mark,
      ctx.accountWords(ran.accountId),
      Date.now()
    );
    pass.refused.push(refused);
    if (
      !pass.tried.some(
        (one) => one.accountId === ran.accountId && one.model === ran.model
      )
    ) {
      pass.tried.push(ran);
    }
    passes.set(instanceId, pass);
    const next = ctx.startModelAfter(row, pass.tried);
    const nextRan =
      "refusal" in next
        ? undefined
        : ctx.resolvedModel(row.machineId, row.harness, next.model);
    if ("refusal" in next || !(next.accountId && nextRan)) {
      decided.set(instanceId, {
        kind: "stop",
        words: spawnWords.startModel.noPickLeft(
          pass.refused,
          "refusal" in next
            ? next.refusal
            : spawnWords.startModel.unaccounted(null, 1)
        ),
      });
      return;
    }
    // Tried as it is chosen: a move that does not land leaves it tried.
    pass.tried.push({ accountId: next.accountId, model: nextRan });
    decided.set(instanceId, {
      kind: "move",
      accountId: next.accountId,
      model: next.model,
      line: spawnWords.startModel.nextPick(
        refused,
        next.model,
        ctx.accountWords(next.accountId)
      ),
    });
  };

  /**
   * Every frame of a session's own turn, its marks written, and whether its
   * provider refused it (`refused`): a refusal is decided
   * ({@link refusedFrame}); at the turn's result, a turn with no pick left
   * says so in its errors, which every reader of the failed turn takes its
   * words from, and any other result ends the session's pass but one that
   * moves, whose end {@link movesAtEnd} takes.
   */
  const frame = (
    instanceId: string,
    neutral: NeutralMessage,
    refused: boolean
  ): void => {
    if (refused) {
      refusedFrame(instanceId);
    }
    if (neutral.type !== "result") {
      return;
    }
    const decision = decided.get(instanceId);
    if (decision?.kind === "move") {
      return;
    }
    decided.delete(instanceId);
    passes.delete(instanceId);
    if (decision?.kind === "stop") {
      const said = neutral.errors?.length
        ? neutral.errors
        : [neutral.result?.trim() ?? ""].filter(Boolean);
      neutral.errors = [...said, decision.words];
    }
  };

  /** Whether the session's turn in flight moves to its next pick at its end: nothing it read failed. */
  const moving = (instanceId: string): boolean =>
    decided.get(instanceId)?.kind === "move";

  /**
   * The end of a turn that moves to its next pick ({@link refusedFrame}):
   * nothing ended, so no report goes up, no rule answers it and no item
   * fails. Its relaunch is owed on the pick's account and model, with its
   * word to answer there beside it (db/owed-moves.ts `OwedCarry`), and
   * carried now as a person's model pick is (relay-control.ts
   * `crossModel`): whoever lands the move tells it, a hub that restarts
   * under it included. False for any other end.
   */
  const movesAtEnd = (instanceId: string): boolean => {
    const decision = decided.get(instanceId);
    if (decision?.kind !== "move") {
      return false;
    }
    decided.delete(instanceId);
    const [row] = ctx.db.getInstancesByIds([instanceId]);
    if (!row) {
      passes.delete(instanceId);
      return false;
    }
    const to =
      decision.accountId === row.accountId ? undefined : decision.accountId;
    console.info(`[hub] ${ctx.sessionName(row)}: ${decision.line}`);
    ctx.owedMoves.set(row.id, {
      ...(to === undefined ? {} : { to }),
      model: decision.model,
      move: null,
      waits: "turn",
      carry: { kind: "model", line: decision.line },
    });
    ctx.relaunchOnAccount(row.id);
    return true;
  };

  /** The session is gone: nothing of its pass is kept. */
  const forget = (instanceId: string): void => {
    decided.delete(instanceId);
    passes.delete(instanceId);
  };

  return { frame, moving, movesAtEnd, forget };
};

import type { AccountMove } from "@cawco/core/accounts";
import type { OwedMoveWait } from "@cawco/core/protocol";
import { eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { unreachable } from "../unreachable";
import { type MOVE_OFF_WHYS, owedMoves } from "./schema";

/**
 * What a session is told once the move it owes lands (compaction.ts
 * `carryOn`), kept beside the move so a hub that restarts under it still
 * tells it: to carry on past what stopped its turn, its account's limit or
 * its refused sign-in; or to answer the first turn its provider refused on
 * the model the hub chose, on the model the move lands it on (`line`: its
 * transcript's line for the move, start-model-moves.ts).
 */
export type OwedCarry =
  { kind: "limit" } | { kind: "signin" } | { kind: "model"; line: string };

/**
 * A move a session owes to its next launch (schema `owedMoves`), read the
 * way server.ts takes it: `to` absent is a relaunch alone, its row already
 * naming the account, or, with {@link leave}, a marker that it must leave
 * its account, where it goes decided as the move is carried out (hub
 * decide.ts). A hub move is never kept with a target past the moment it is
 * carried: only a person's own move (`byHand`) waits with one.
 */
export interface OwedMove {
  /** When it was kept, epoch ms: a hub move carried later than the decision allows is decided again (decide.ts `CHOICE_FRESH_MS`). */
  at?: number;
  /** A person asked for it ({@link OwedMovesDb}): the at-limit controller only carries it out. */
  byHand?: true;
  /** What the session is told once it lands ({@link OwedCarry}); told once, by whoever lands it (limit-moves.ts). */
  carry?: OwedCarry;
  /** It must leave its account, for this (hub-shapes.ts `MoveOffWhy`): where to is decided as it is carried. */
  leave?: (typeof MOVE_OFF_WHYS)[number];
  /**
   * A model a person picked while the move waited, checked against the
   * account it lands on (limit-moves.ts `pickWithMove`): the launch that
   * lands runs it, and the row takes it as the move lands (`landOwed`). The
   * process the move leaves is never asked to change.
   */
  model?: string;
  move: AccountMove | null;
  to?: string;
  /**
   * What it waits on: the session's turn's end; the work its process holds
   * for later (a background task) ending, or the restart bound; or its
   * machine connected again.
   */
  waits: OwedMoveWait;
}

/**
 * The moves sessions owe, one per session, kept in the database so a hub
 * restart carries each out (server.ts `owedMoves`). A put replaces the
 * session's move before it: the newer ask supersedes it. Its row goes with
 * the session's row (a cascade) and with its account's.
 */
export interface OwedMovesDb {
  /** True when it owed one. */
  readonly delete: (instanceId: string) => boolean;
  readonly get: (instanceId: string) => OwedMove | undefined;
  readonly has: (instanceId: string) => boolean;
  /** Every owed move, by session. */
  readonly list: () => [string, OwedMove][];
  readonly set: (instanceId: string, owed: OwedMove) => void;
}

type Row = typeof owedMoves.$inferSelect;

/** The carry-on a row keeps ({@link OwedCarry}); none for a model's with no line, which no write makes. */
const carryOf = (row: Row): OwedCarry | undefined => {
  switch (row.carryOn) {
    case null:
      return;
    case "limit":
    case "signin":
      return { kind: row.carryOn };
    case "model":
      return row.carryLine === null
        ? undefined
        : { kind: "model", line: row.carryLine };
    default:
      throw unreachable(row.carryOn);
  }
};

const toOwed = (row: Row): OwedMove => {
  const carry = carryOf(row);
  return {
    move: row.move ?? null,
    waits: row.waits,
    ...(row.toAccountId === null ? {} : { to: row.toAccountId }),
    ...(row.byHand ? { byHand: true as const } : {}),
    ...(row.pickedModel === null ? {} : { model: row.pickedModel }),
    ...(carry ? { carry } : {}),
    ...(row.leave === null ? {} : { leave: row.leave }),
    at: row.createdAt.getTime(),
  };
};

export const owedMovesDb = (db: BunSQLiteDatabase): OwedMovesDb => {
  const get = (instanceId: string): OwedMove | undefined => {
    const row = db
      .select()
      .from(owedMoves)
      .where(eq(owedMoves.instanceId, instanceId))
      .get();
    return row ? toOwed(row) : undefined;
  };
  return {
    get,
    has: (instanceId) => get(instanceId) !== undefined,
    list: () =>
      db
        .select()
        .from(owedMoves)
        .all()
        .map((row) => [row.instanceId, toOwed(row)]),
    set: (instanceId, owed) => {
      const values = {
        toAccountId: owed.to ?? null,
        byHand: owed.byHand === true,
        move: owed.move,
        waits: owed.waits,
        pickedModel: owed.model ?? null,
        carryOn: owed.carry?.kind ?? null,
        carryLine: owed.carry?.kind === "model" ? owed.carry.line : null,
        leave: owed.leave ?? null,
        createdAt: new Date(),
      };
      db.insert(owedMoves)
        .values({ instanceId, ...values })
        .onConflictDoUpdate({ target: owedMoves.instanceId, set: values })
        .run();
    },
    delete: (instanceId) =>
      db
        .delete(owedMoves)
        .where(eq(owedMoves.instanceId, instanceId))
        .returning({ instanceId: owedMoves.instanceId })
        .all().length > 0,
  };
};

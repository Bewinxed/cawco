/**
 * The asks the hub owns (core asks.ts, hub asks.ts): every change is one
 * write, and an answer is taken in one transaction with the start of what
 * it carries (an approved call's; a question carries nothing), so a second
 * answer is refused and an approved call runs at most once.
 */

import type { AskAnswer } from "@cawco/core";
import type { AskRecord, AskResult } from "@cawco/core/asks";
import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { asks } from "./schema";

type AskRow = typeof asks.$inferSelect;

/** What an answer to an ask came to: taken, or refused since it was answered or withdrawn already. */
export type AskAnswered =
  { kind: "answered"; ask: AskRecord } | { kind: "closed"; ask: AskRecord };

export interface AsksDb {
  readonly add: (ask: AskRecord) => void;
  /**
   * The person's answer, with the start of the approved call when an approve ask allows,
   * in one transaction; undefined when no ask has `id`.
   */
  readonly answer: (
    id: string,
    answer: { at: number; by: AskAnswer; result: AskResult }
  ) => AskAnswered | undefined;
  /** How the approved call ended: what it said, or why it failed. */
  readonly carried: (
    id: string,
    end: { at: number; said?: string; failed?: string }
  ) => AskRecord | undefined;
  /** Approved calls started and never ended: the hub went while running them. */
  readonly cutShort: () => AskRecord[];
  readonly get: (id: string) => AskRecord | undefined;
  /** Every open ask, oldest first. */
  readonly open: () => AskRecord[];
  /** `instanceId`'s open asks. */
  readonly openOf: (instanceId: string) => AskRecord[];
  /** An open ask withdrawn by the hub; undefined when it was not open. */
  readonly withdraw: (
    id: string,
    at: number,
    why: string
  ) => AskRecord | undefined;
}

const recordOf = (row: AskRow): AskRecord => ({
  ...row.record,
  id: row.id,
  instanceId: row.instanceId,
  raisedAt: row.raisedAt,
  state: row.state,
});

const stored = ({
  id: _id,
  instanceId: _instanceId,
  raisedAt: _raisedAt,
  state: _state,
  ...record
}: AskRecord): AskRow["record"] => record;

export const asksDb = (db: BunSQLiteDatabase): AsksDb => {
  const read = (id: string) =>
    db.select().from(asks).where(eq(asks.id, id)).get();
  const put = (ask: AskRecord): AskRecord => {
    db.update(asks)
      .set({ state: ask.state, record: stored(ask) })
      .where(eq(asks.id, ask.id))
      .run();
    return ask;
  };
  return {
    add: (ask) => {
      db.insert(asks)
        .values({
          id: ask.id,
          instanceId: ask.instanceId,
          state: ask.state,
          raisedAt: ask.raisedAt,
          record: stored(ask),
        })
        .run();
    },
    answer: (id, answer) =>
      db.transaction(() => {
        const row = read(id);
        if (!row) {
          return;
        }
        const ask = recordOf(row);
        if (ask.state !== "open") {
          return { kind: "closed", ask };
        }
        return {
          kind: "answered",
          ask: put({
            ...ask,
            state: "answered",
            answer,
            ...(answer.result.behavior === "allow" &&
            ask.asked.kind === "approve"
              ? { carried: { startedAt: answer.at } }
              : {}),
          }),
        };
      }),
    carried: (id, { at, said, failed }) => {
      const row = read(id);
      if (!row?.record.carried) {
        return;
      }
      const ask = recordOf(row);
      return put({
        ...ask,
        carried: {
          startedAt: row.record.carried.startedAt,
          endedAt: at,
          ...(said === undefined ? {} : { said }),
          ...(failed === undefined ? {} : { failed }),
        },
      });
    },
    cutShort: () =>
      db
        .select()
        .from(asks)
        .where(
          and(
            eq(asks.state, "answered"),
            isNotNull(sql`json_extract(${asks.record}, '$.carried.startedAt')`),
            isNull(sql`json_extract(${asks.record}, '$.carried.endedAt')`)
          )
        )
        .all()
        .map(recordOf),
    get: (id) => {
      const row = read(id);
      return row && recordOf(row);
    },
    open: () =>
      db
        .select()
        .from(asks)
        .where(eq(asks.state, "open"))
        .orderBy(asc(asks.raisedAt))
        .all()
        .map(recordOf),
    openOf: (instanceId) =>
      db
        .select()
        .from(asks)
        .where(and(eq(asks.state, "open"), eq(asks.instanceId, instanceId)))
        .orderBy(asc(asks.raisedAt))
        .all()
        .map(recordOf),
    withdraw: (id, at, why) =>
      db.transaction(() => {
        const row = read(id);
        if (row?.state !== "open") {
          return;
        }
        return put({
          ...recordOf(row),
          state: "withdrawn",
          withdrawn: { at, by: "hub", why },
        });
      }),
  };
};

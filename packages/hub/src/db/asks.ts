/**
 * The asks the hub owns (core asks.ts, hub asks.ts): every change is one
 * write, and an answer is taken in one transaction with the start of what
 * it carries (an approved call's; a question carries nothing), so a second
 * answer is refused and an approved call runs at most once, and a permit's
 * grant is spent or lapsed in one write, so it allows a call at most once
 * and none after it lapsed.
 */

import type { AskAnswer, AskRecord, AskResult } from "@cawco/core/asks";
import type { Envelope } from "@cawco/core/protocol";
import { and, asc, eq, isNotNull, isNull, notInArray, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { DbCore } from "./core";
import { askPushes, asks, parkedAsks } from "./schema";

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
  /**
   * Spends `instanceId`'s first approved, unspent, unlapsed permit that
   * `matches`, in one transaction, so a grant allows one call; undefined
   * when none does.
   */
  readonly grant: (
    instanceId: string,
    matches: (ask: AskRecord) => boolean,
    at: number
  ) => AskRecord | undefined;
  /**
   * Lapses `instanceId`'s approved, unspent permits whose answer `seen`
   * says the session has read, in one transaction; answers the ones lapsed.
   */
  readonly lapse: (
    instanceId: string,
    seen: (ask: AskRecord) => boolean,
    at: number
  ) => AskRecord[];
  /** Every open ask, oldest first. */
  readonly open: () => AskRecord[];
  /** `instanceId`'s open asks. */
  readonly openOf: (instanceId: string) => AskRecord[];
  /** An ask routed to its session's parent made the person's (`routedTo` gone). */
  readonly unroute: (id: string) => void;
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
  /** `instanceId`'s approved permits neither spent nor lapsed, oldest first. */
  const grants = (instanceId: string): AskRecord[] =>
    db
      .select()
      .from(asks)
      .where(
        and(
          eq(asks.state, "answered"),
          eq(asks.instanceId, instanceId),
          eq(sql`json_extract(${asks.record}, '$.asked.kind')`, "permit"),
          eq(
            sql`json_extract(${asks.record}, '$.answer.result.behavior')`,
            "allow"
          ),
          isNull(sql`json_extract(${asks.record}, '$.used')`),
          isNull(sql`json_extract(${asks.record}, '$.lapsed')`)
        )
      )
      .orderBy(asc(asks.raisedAt))
      .all()
      .map(recordOf);
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
    grant: (instanceId, matches, at) =>
      db.transaction(() => {
        const granted = grants(instanceId).find(matches);
        return granted && put({ ...granted, used: { at } });
      }),
    lapse: (instanceId, seen, at) =>
      db.transaction(() =>
        grants(instanceId)
          .filter(seen)
          .map((ask) => put({ ...ask, lapsed: { at } }))
      ),
    unroute: (id) => {
      const row = read(id);
      if (row?.record.routedTo) {
        const { routedTo: _routedTo, ...ask } = recordOf(row);
        put(ask);
      }
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

export interface AskPartsDb {
  /**
   * The asks the push outlet took (push.ts `onAsk`), by request id, kept
   * across a restart: `take` is true only the first time, `drop` forgets
   * one whose ask settled.
   */
  readonly askPushes: {
    readonly drop: (requestId: string) => void;
    /** Drops every mark but those of `parked`; answers the request ids that went. */
    readonly keepOnly: (parked: readonly string[]) => string[];
    readonly take: (requestId: string, at: Date) => boolean;
  };
  /**
   * The asks the hub holds parked (`pending.ts`), kept across its restarts:
   * read once as it boots, written as each is parked and dropped as it ends.
   */
  readonly parkedAsks: {
    readonly drop: (requestId: string) => void;
    readonly list: () => Envelope[];
    readonly save: (requestId: string, envelope: Envelope) => void;
  };
}

export const askPartsDb = (core: DbCore): AskPartsDb => {
  const { db } = core;

  return {
    parkedAsks: {
      drop: (requestId) => {
        db.delete(parkedAsks).where(eq(parkedAsks.requestId, requestId)).run();
      },
      list: () =>
        db
          .select({ envelope: parkedAsks.envelope })
          .from(parkedAsks)
          .all()
          .map((row) => row.envelope),
      save: (requestId, envelope) => {
        const row = {
          requestId,
          instanceId: envelope.instanceId ?? null,
          machineId: envelope.machineId,
          envelope,
        };
        db.insert(parkedAsks)
          .values(row)
          .onConflictDoUpdate({ target: parkedAsks.requestId, set: row })
          .run();
      },
    },
    askPushes: {
      take: (requestId, at) =>
        db
          .insert(askPushes)
          .values({ requestId, takenAt: at })
          .onConflictDoNothing()
          .returning()
          .all().length > 0,
      drop: (requestId) => {
        db.delete(askPushes).where(eq(askPushes.requestId, requestId)).run();
      },
      keepOnly: (parked) =>
        db
          .delete(askPushes)
          .where(
            parked.length === 0
              ? undefined
              : notInArray(askPushes.requestId, [...parked])
          )
          .returning()
          .all()
          .map((row) => row.requestId),
    },
  };
};

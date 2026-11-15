/**
 * The asks the hub owns (core asks.ts, hub asks.ts): every change is one
 * write, and an answer is taken in one transaction with the start of what
 * it carries (an approved call's; a question carries nothing), so a second
 * answer is refused and an approved call runs at most once, and a permit's
 * grant is spent or lapsed in one write, so it allows a call at most once
 * and none after it lapsed. What the hub decides by is the row's columns
 * (schema.ts `asks`); a row is read as an ask only when its kept record
 * reads and agrees with them ({@link recordOf}).
 */

import type {
  AskAnswer,
  AskKept,
  AskKind,
  AskRecord,
  AskResult,
} from "@cawco/core/asks";
import type { ParkedAsk } from "@cawco/core/frames";
import { and, asc, eq, isNotNull, isNull, notInArray } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { DbCore } from "./core";
import { askPushes, asks, parkedAsks } from "./schema";

type AskRow = typeof asks.$inferSelect;

/** What an answer to an ask came to: taken, or refused since it was answered or withdrawn already. */
export type AskAnswered =
  { kind: "answered"; ask: AskRecord } | { kind: "closed"; ask: AskRecord };

/** An open ask whose row does not read as an ask: its id and the session that asked it. */
export interface UnreadAsk {
  id: string;
  instanceId: string;
}

export interface AsksDb {
  readonly add: (ask: AskRecord) => void;
  /**
   * The person's answer, with the start of the approved call when an approve ask allows,
   * in one transaction; undefined when no ask has `id`, or its row does not read as one.
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
  /** Approved calls started and never ended: the hub went while running them. A row that does not read as an ask is none. */
  readonly cutShort: () => AskRecord[];
  /** The ask `id`; undefined when there is none, or its row does not read as one. */
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
  /** Every open row that does not read as an ask (migration 0408's `record_unread`), oldest first. */
  readonly openUnread: () => UnreadAsk[];
  /** An ask routed to its session's parent made the person's (`routedTo` gone). */
  readonly unroute: (id: string) => void;
  /** An open ask withdrawn by the hub; undefined when it was not open. */
  readonly withdraw: (
    id: string,
    at: number,
    why: string
  ) => AskRecord | undefined;
  /** An open row that does not read as an ask withdrawn by the hub, its state and time alone; false when it was not open. */
  readonly withdrawUnread: (id: string, at: number) => boolean;
}

/** What was asked, the kind's from the row and the rest from what it kept; undefined when the two do not agree. */
const askedOf = (
  kind: AskKind,
  asked: AskKept["asked"]
): AskRecord["asked"] | undefined => {
  if ("questions" in asked) {
    return kind === "question" ? { kind, ...asked } : undefined;
  }
  if ("carry" in asked) {
    return kind === "approve" ? { kind, ...asked } : undefined;
  }
  return kind === "permit" ? { kind, ...asked } : undefined;
};

/** A part of an ask as its row reads: `{ value }`, absent when never set; undefined when the row's columns and its kept record do not agree. */
type Part<T> = { value: T | undefined } | undefined;

/** The answer: when and whether it allowed, the row's; who, and what they wrote, kept. */
const answerOf = (
  row: AskRow,
  kept: AskKept["answer"]
): Part<NonNullable<AskRecord["answer"]>> => {
  const { answeredAt: at, answerBehavior: behavior } = row;
  if (at === null) {
    return behavior === null && kept === undefined
      ? { value: undefined }
      : undefined;
  }
  if (behavior === null || kept === undefined) {
    return;
  }
  const { by, result } = kept;
  if (behavior === "allow") {
    return {
      value: {
        at,
        by,
        result: {
          behavior,
          ...(result.answers === undefined ? {} : { answers: result.answers }),
        },
      },
    };
  }
  return result.message === undefined
    ? undefined
    : { value: { at, by, result: { behavior, message: result.message } } };
};

/** The approved call: when it started and ended, the row's; what it said, kept. */
const carriedOf = (
  row: AskRow,
  kept: AskKept["carried"]
): Part<NonNullable<AskRecord["carried"]>> => {
  const { carriedStartedAt: startedAt, carriedEndedAt: endedAt } = row;
  if (startedAt === null) {
    return endedAt === null && kept === undefined
      ? { value: undefined }
      : undefined;
  }
  return {
    value: {
      startedAt,
      ...(endedAt === null ? {} : { endedAt }),
      ...(kept?.said === undefined ? {} : { said: kept.said }),
      ...(kept?.failed === undefined ? {} : { failed: kept.failed }),
    },
  };
};

/** The withdrawal: when, the row's; why, kept. */
const withdrawnOf = (
  row: AskRow,
  kept: AskKept["withdrawn"]
): Part<NonNullable<AskRecord["withdrawn"]>> => {
  if (row.withdrawnAt === null) {
    return kept === undefined ? { value: undefined } : undefined;
  }
  return kept === undefined
    ? undefined
    : { value: { at: row.withdrawnAt, by: "hub", why: kept.why } };
};

/**
 * A row as an ask: its columns and its kept record put together. Undefined
 * when it does not read as one: its record was kept unread (migration
 * 0408), or its columns and what it kept do not agree. Such a row is never
 * granted, answered or carried.
 */
const recordOf = (row: AskRow): AskRecord | undefined => {
  const { kept, kind } = row;
  if (kept === null || kind === null) {
    return;
  }
  const asked = askedOf(kind, kept.asked);
  const answer = answerOf(row, kept.answer);
  const carried = carriedOf(row, kept.carried);
  const withdrawn = withdrawnOf(row, kept.withdrawn);
  if (!(asked && answer && carried && withdrawn)) {
    return;
  }
  return {
    id: row.id,
    instanceId: row.instanceId,
    raisedAt: row.raisedAt,
    state: row.state,
    asked,
    ...(kept.toolUseId === undefined ? {} : { toolUseId: kept.toolUseId }),
    ...(row.routedToParent ? { routedTo: "parent" as const } : {}),
    ...(answer.value ? { answer: answer.value } : {}),
    ...(carried.value ? { carried: carried.value } : {}),
    ...(withdrawn.value ? { withdrawn: withdrawn.value } : {}),
    ...(row.usedAt === null ? {} : { used: { at: row.usedAt } }),
    ...(row.lapsedAt === null ? {} : { lapsed: { at: row.lapsedAt } }),
  };
};

/** The rows that read as asks, as asks. */
const readable = (rows: AskRow[]): AskRecord[] =>
  rows.flatMap((row) => recordOf(row) ?? []);

/** What an answer kept: a question's answers, or a denial's message. */
const resultKept = (
  result: AskResult
): NonNullable<AskKept["answer"]>["result"] => {
  if (result.behavior === "deny") {
    return { message: result.message };
  }
  return result.answers === undefined ? {} : { answers: result.answers };
};

/** What an ask keeps as JSON: what its columns do not hold. */
const keptOf = (ask: AskRecord): AskKept => {
  const { kind: _kind, ...asked } = ask.asked;
  return {
    asked,
    ...(ask.toolUseId === undefined ? {} : { toolUseId: ask.toolUseId }),
    ...(ask.answer
      ? {
          answer: {
            by: ask.answer.by,
            result: resultKept(ask.answer.result),
          },
        }
      : {}),
    ...(ask.carried
      ? {
          carried: {
            ...(ask.carried.said === undefined
              ? {}
              : { said: ask.carried.said }),
            ...(ask.carried.failed === undefined
              ? {}
              : { failed: ask.carried.failed }),
          },
        }
      : {}),
    ...(ask.withdrawn ? { withdrawn: { why: ask.withdrawn.why } } : {}),
  };
};

/** Every column an ask is written in, whole: any record kept unread goes. */
const columnsOf = (ask: AskRecord) => ({
  state: ask.state,
  kind: ask.asked.kind,
  routedToParent: ask.routedTo === "parent",
  answeredAt: ask.answer?.at ?? null,
  answerBehavior: ask.answer?.result.behavior ?? null,
  carriedStartedAt: ask.carried?.startedAt ?? null,
  carriedEndedAt: ask.carried?.endedAt ?? null,
  withdrawnAt: ask.withdrawn?.at ?? null,
  usedAt: ask.used?.at ?? null,
  lapsedAt: ask.lapsed?.at ?? null,
  kept: keptOf(ask),
  recordUnread: null,
});

export const asksDb = (db: BunSQLiteDatabase): AsksDb => {
  /** `instanceId`'s approved permits neither spent nor lapsed, oldest first, found by the row's columns. */
  const grants = (instanceId: string): AskRecord[] =>
    readable(
      db
        .select()
        .from(asks)
        .where(
          and(
            eq(asks.instanceId, instanceId),
            eq(asks.state, "answered"),
            eq(asks.kind, "permit"),
            eq(asks.answerBehavior, "allow"),
            isNull(asks.usedAt),
            isNull(asks.lapsedAt),
            isNull(asks.recordUnread)
          )
        )
        .orderBy(asc(asks.raisedAt))
        .all()
    );
  const read = (id: string) =>
    db.select().from(asks).where(eq(asks.id, id)).get();
  const put = (ask: AskRecord): AskRecord => {
    db.update(asks).set(columnsOf(ask)).where(eq(asks.id, ask.id)).run();
    return ask;
  };
  /** The open rows, oldest first, `instanceId`'s alone when given. */
  const openRows = (instanceId?: string): AskRow[] =>
    db
      .select()
      .from(asks)
      .where(
        and(
          eq(asks.state, "open"),
          instanceId === undefined ? undefined : eq(asks.instanceId, instanceId)
        )
      )
      .orderBy(asc(asks.raisedAt))
      .all();
  return {
    add: (ask) => {
      db.insert(asks)
        .values({
          id: ask.id,
          instanceId: ask.instanceId,
          raisedAt: ask.raisedAt,
          ...columnsOf(ask),
        })
        .run();
    },
    answer: (id, answer) =>
      db.transaction(() => {
        const row = read(id);
        const ask = row && recordOf(row);
        if (!ask) {
          return;
        }
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
      const ask = row && recordOf(row);
      if (!ask?.carried) {
        return;
      }
      return put({
        ...ask,
        carried: {
          startedAt: ask.carried.startedAt,
          endedAt: at,
          ...(said === undefined ? {} : { said }),
          ...(failed === undefined ? {} : { failed }),
        },
      });
    },
    cutShort: () =>
      readable(
        db
          .select()
          .from(asks)
          .where(
            and(
              eq(asks.state, "answered"),
              isNotNull(asks.carriedStartedAt),
              isNull(asks.carriedEndedAt),
              isNull(asks.recordUnread)
            )
          )
          .all()
      ),
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
      const ask = row && recordOf(row);
      if (ask?.routedTo) {
        const { routedTo: _routedTo, ...unrouted } = ask;
        put(unrouted);
      }
    },
    open: () => readable(openRows()),
    openOf: (instanceId) => readable(openRows(instanceId)),
    openUnread: () =>
      openRows().flatMap((row) =>
        recordOf(row) ? [] : [{ id: row.id, instanceId: row.instanceId }]
      ),
    withdraw: (id, at, why) =>
      db.transaction(() => {
        const row = read(id);
        const ask = row && recordOf(row);
        if (ask?.state !== "open") {
          return;
        }
        return put({
          ...ask,
          state: "withdrawn",
          withdrawn: { at, by: "hub", why },
        });
      }),
    withdrawUnread: (id, at) =>
      db
        .update(asks)
        .set({ state: "withdrawn", withdrawnAt: at })
        .where(and(eq(asks.id, id), eq(asks.state, "open")))
        .returning({ id: asks.id })
        .all().length > 0,
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
   * Each is kept as every screen reads it (`envelope`), its call's own input
   * sealed beside it (`inputSealed`, secret-box.ts), which only an Approve
   * opens (pending.ts `asAsked`).
   */
  readonly parkedAsks: {
    readonly drop: (requestId: string) => void;
    readonly list: () => { envelope: ParkedAsk; inputSealed: string }[];
    readonly save: (
      requestId: string,
      envelope: ParkedAsk,
      inputSealed: string
    ) => void;
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
          .select({
            envelope: parkedAsks.envelope,
            inputSealed: parkedAsks.inputSealed,
          })
          .from(parkedAsks)
          .all(),
      save: (requestId, envelope, inputSealed) => {
        const row = {
          requestId,
          instanceId: envelope.instanceId ?? null,
          machineId: envelope.machineId,
          envelope,
          inputSealed,
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

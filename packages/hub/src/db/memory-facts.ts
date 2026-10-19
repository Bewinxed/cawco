import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  min,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  declinedRewrites,
  factUses,
  instances,
  proseBackfills,
  sessionProse,
} from "./schema";

export type SessionProseRow = typeof sessionProse.$inferSelect;

/** The rows memory.ts and session-prose.ts keep (schema `fact_uses`, `session_prose`, `prose_backfills`, `declined_rewrites`). */
export interface MemoryFactsDb {
  /** One message of a project's session, as its prose cut keeps it. */
  readonly addProse: (row: Omit<SessionProseRow, "id">) => void;
  /**
   * A session's stored prose, cut after the fact, and its done mark, in one
   * transaction: only the rows older than the session's earliest prose kept
   * already (live, by the same clocks), so nothing is kept twice. How many
   * it kept.
   */
  readonly backfillProse: (
    instanceId: string,
    rows: Omit<SessionProseRow, "id">[]
  ) => number;
  /** The hash of a knowledge file's prose the person declined to have rewritten, if they did. */
  readonly declinedRewrite: (
    projectId: string,
    path: string
  ) => string | undefined;
  /** The person declined the rewrite of `path`'s prose that hashes to `words`. */
  readonly declineRewrite: (
    projectId: string,
    path: string,
    words: string
  ) => void;
  /** Every recorded use of a project's fact lines, by `path` and `key`. */
  readonly factUses: (projectId: string) => Map<string, Date>;
  /** `machineId`'s project sessions with no done mark, oldest first, at most `limit`: what its backfill reads. */
  readonly proseBackfillDue: (
    machineId: string,
    limit: number
  ) => { id: string; projectId: string }[];
  /**
   * A project's prose rows holding any of `words` (lower case), the newest
   * first, at most `limit`, leaving out the session `except`: the grep a
   * search ranks.
   */
  readonly proseMatching: (
    projectId: string,
    words: string[],
    limit: number,
    except: string | null
  ) => SessionProseRow[];
  /** When each message of these sessions was, oldest first: what splits them into sittings. */
  readonly proseTimes: (
    instanceIds: string[]
  ) => { at: Date; instanceId: string }[];
  /** A brief carried these lines of `path` now. */
  readonly useFacts: (
    projectId: string,
    path: string,
    keys: string[],
    at: Date
  ) => void;
}

/** `path` and `key` as one map key: a path never holds a NUL. */
export const useKey = (path: string, key: string): string => `${path}\0${key}`;

/** `%` and `_` taken as themselves inside a LIKE pattern. */
const LIKE_SPECIAL = /[\\%_]/g;

export const memoryFactsDb = (db: BunSQLiteDatabase): MemoryFactsDb => ({
  addProse: (row) => {
    db.insert(sessionProse).values(row).run();
  },
  backfillProse: (instanceId, rows) =>
    db.transaction((tx) => {
      const [first] = tx
        .select({ at: min(sessionProse.at) })
        .from(sessionProse)
        .where(eq(sessionProse.instanceId, instanceId))
        .all();
      const earliest = first?.at?.getTime();
      const older =
        earliest === undefined
          ? rows
          : rows.filter((row) => row.at.getTime() < earliest);
      if (older.length > 0) {
        tx.insert(sessionProse).values(older).run();
      }
      tx.insert(proseBackfills)
        .values({ instanceId, at: new Date(), messages: older.length })
        .onConflictDoNothing()
        .run();
      return older.length;
    }),
  proseBackfillDue: (machineId, limit) =>
    db
      .select({
        id: instances.id,
        projectId: sql<string>`${instances.projectId}`,
      })
      .from(instances)
      .where(
        and(
          eq(instances.machineId, machineId),
          isNotNull(instances.projectId),
          notExists(
            db
              .select({ one: sql`1` })
              .from(proseBackfills)
              .where(eq(proseBackfills.instanceId, instances.id))
          )
        )
      )
      .orderBy(asc(instances.spawnedAt))
      .limit(limit)
      .all(),
  declinedRewrite: (projectId, path) =>
    db
      .select({ words: declinedRewrites.words })
      .from(declinedRewrites)
      .where(
        and(
          eq(declinedRewrites.projectId, projectId),
          eq(declinedRewrites.path, path)
        )
      )
      .get()?.words,
  declineRewrite: (projectId, path, words) => {
    db.insert(declinedRewrites)
      .values({ projectId, path, words, at: new Date() })
      .onConflictDoUpdate({
        target: [declinedRewrites.projectId, declinedRewrites.path],
        set: { words, at: new Date() },
      })
      .run();
  },
  factUses: (projectId) =>
    new Map(
      db
        .select()
        .from(factUses)
        .where(eq(factUses.projectId, projectId))
        .all()
        .map((row) => [useKey(row.path, row.key), row.usedAt])
    ),
  useFacts: (projectId, path, keys, at) => {
    if (keys.length === 0) {
      return;
    }
    db.insert(factUses)
      .values(keys.map((key) => ({ projectId, path, key, usedAt: at })))
      .onConflictDoUpdate({
        target: [factUses.projectId, factUses.path, factUses.key],
        set: { usedAt: at },
      })
      .run();
  },
  proseMatching: (projectId, words, limit, except) => {
    if (words.length === 0) {
      return [];
    }
    const matches = words.map(
      (word) =>
        sql`lower(${sessionProse.text}) LIKE ${`%${word.replace(LIKE_SPECIAL, (c) => `\\${c}`)}%`} ESCAPE '\\'`
    );
    return db
      .select()
      .from(sessionProse)
      .where(
        and(
          eq(sessionProse.projectId, projectId),
          except ? sql`${sessionProse.instanceId} <> ${except}` : undefined,
          or(...matches)
        )
      )
      .orderBy(desc(sessionProse.at))
      .limit(limit)
      .all();
  },
  proseTimes: (instanceIds) =>
    instanceIds.length === 0
      ? []
      : db
          .select({ at: sessionProse.at, instanceId: sessionProse.instanceId })
          .from(sessionProse)
          .where(inArray(sessionProse.instanceId, instanceIds))
          .orderBy(asc(sessionProse.at))
          .all(),
});

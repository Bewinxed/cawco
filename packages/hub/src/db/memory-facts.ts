import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { factUses, sessionProse } from "./schema";

export type SessionProseRow = typeof sessionProse.$inferSelect;

/** The rows memory.ts and session-prose.ts keep (schema `fact_uses`, `session_prose`). */
export interface MemoryFactsDb {
  /** One message of a project's session, as its prose cut keeps it. */
  readonly addProse: (row: Omit<SessionProseRow, "id">) => void;
  /** Every recorded use of a project's fact lines, by `path` and `key`. */
  readonly factUses: (projectId: string) => Map<string, Date>;
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

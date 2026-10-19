import { and, desc, eq, gte } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { briefFactUses, declinedRewrites, factUses } from "./schema";

/** One fact line one brief carried (schema `brief_fact_uses`). */
export interface BriefUse {
  at: Date;
  chars: number;
  key: string;
  path: string;
  /** The room the brief had for fact lines: its budget less what it carried whole before them. */
  room: number;
  taskId: string;
  title: string;
}

/** The rows memory.ts keeps (schema `fact_uses`, `declined_rewrites`). */
export interface MemoryFactsDb {
  /** Every line a project's briefs carried since `from`, newest first. */
  readonly briefUses: (projectId: string, from: Date) => BriefUse[];
  /** A task's brief carried these lines at `at`: one row each. */
  readonly carried: (
    projectId: string,
    brief: { at: Date; room: number; taskId: string; title: string },
    lines: { chars: number; key: string; path: string }[]
  ) => void;
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

export const memoryFactsDb = (db: BunSQLiteDatabase): MemoryFactsDb => ({
  briefUses: (projectId, from) =>
    db
      .select({
        at: briefFactUses.at,
        chars: briefFactUses.chars,
        key: briefFactUses.key,
        path: briefFactUses.path,
        room: briefFactUses.room,
        taskId: briefFactUses.taskId,
        title: briefFactUses.title,
      })
      .from(briefFactUses)
      .where(
        and(eq(briefFactUses.projectId, projectId), gte(briefFactUses.at, from))
      )
      .orderBy(desc(briefFactUses.at))
      .all(),
  carried: (projectId, brief, lines) => {
    if (lines.length === 0) {
      return;
    }
    db.insert(briefFactUses)
      .values(lines.map((line) => ({ projectId, ...brief, ...line })))
      .onConflictDoNothing()
      .run();
  },
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
});

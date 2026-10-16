import type {
  ProjectStarter,
  StarterOutcome,
  StarterSource,
} from "@cawco/core";
import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  projectStarterSets,
  projectStarterSources,
  projectStarters,
  starterOutcomes,
} from "./schema";

/** A project's stored set: its starters in order, when and over what it was written, and why. */
export interface StarterSet {
  generatedAt: Date;
  inputHash: string;
  starters: ProjectStarter[];
  trigger: string;
}

/** A project's starters as last written, and what the person did with them (project-starters.ts). */
export interface StartersDb {
  /** The newest outcomes, newest first. */
  readonly outcomes: (
    projectId: string,
    limit: number
  ) => { at: Date; outcome: StarterOutcome; text: string }[];
  /** Records what the person did with one starter. */
  readonly record: (
    projectId: string,
    text: string,
    outcome: Exclude<StarterOutcome, "ignored">
  ) => void;
  /**
   * Writes the project's set in place of the one it had, in one
   * transaction: each starter of the old set that was neither picked nor
   * edited since it was written is recorded `ignored`.
   */
  readonly replace: (
    projectId: string,
    set: { inputHash: string; starters: ProjectStarter[]; trigger: string }
  ) => void;
  readonly set: (projectId: string) => StarterSet | undefined;
}

export const startersDb = (db: BunSQLiteDatabase): StartersDb => {
  const set = (projectId: string): StarterSet | undefined => {
    const head = db
      .select()
      .from(projectStarterSets)
      .where(eq(projectStarterSets.projectId, projectId))
      .get();
    if (!head) {
      return;
    }
    const rows = db
      .select()
      .from(projectStarters)
      .where(eq(projectStarters.projectId, projectId))
      .orderBy(asc(projectStarters.position))
      .all();
    const sources = db
      .select()
      .from(projectStarterSources)
      .where(eq(projectStarterSources.projectId, projectId))
      .orderBy(
        asc(projectStarterSources.position),
        asc(projectStarterSources.seq)
      )
      .all();
    const byPosition = new Map<number, StarterSource[]>();
    for (const source of sources) {
      const list = byPosition.get(source.position) ?? [];
      list.push({ kind: source.kind, ref: source.ref });
      byPosition.set(source.position, list);
    }
    return {
      generatedAt: head.generatedAt,
      inputHash: head.inputHash,
      trigger: head.trigger,
      starters: rows.map((row) => ({
        text: row.text,
        glyph: row.glyph,
        reason: row.reason,
        sources: byPosition.get(row.position) ?? [],
      })),
    };
  };

  return {
    set,
    outcomes: (projectId, limit) =>
      db
        .select({
          text: starterOutcomes.text,
          outcome: starterOutcomes.outcome,
          at: starterOutcomes.at,
        })
        .from(starterOutcomes)
        .where(eq(starterOutcomes.projectId, projectId))
        .orderBy(desc(starterOutcomes.at), desc(starterOutcomes.id))
        .limit(limit)
        .all(),
    record: (projectId, text, outcome) => {
      db.insert(starterOutcomes)
        .values({ projectId, text, outcome, at: new Date() })
        .run();
    },
    replace: (projectId, next) => {
      db.transaction((tx) => {
        const old = set(projectId);
        if (old && old.starters.length > 0) {
          const pressed = new Set(
            tx
              .select({ text: starterOutcomes.text })
              .from(starterOutcomes)
              .where(
                and(
                  eq(starterOutcomes.projectId, projectId),
                  gte(starterOutcomes.at, old.generatedAt),
                  inArray(starterOutcomes.outcome, ["picked", "edited"])
                )
              )
              .all()
              .map((row) => row.text)
          );
          const at = new Date();
          const ignored = old.starters.filter(
            (starter) => !pressed.has(starter.text)
          );
          if (ignored.length > 0) {
            tx.insert(starterOutcomes)
              .values(
                ignored.map((starter) => ({
                  projectId,
                  text: starter.text,
                  outcome: "ignored" as const,
                  at,
                }))
              )
              .run();
          }
        }
        // The set's row goes and comes back: its starters and their sources
        // go with it (cascade).
        tx.delete(projectStarterSets)
          .where(eq(projectStarterSets.projectId, projectId))
          .run();
        tx.insert(projectStarterSets)
          .values({
            projectId,
            generatedAt: new Date(),
            inputHash: next.inputHash,
            trigger: next.trigger,
          })
          .run();
        if (next.starters.length === 0) {
          return;
        }
        tx.insert(projectStarters)
          .values(
            next.starters.map((starter, position) => ({
              projectId,
              position,
              text: starter.text,
              glyph: starter.glyph,
              reason: starter.reason,
            }))
          )
          .run();
        const sources = next.starters.flatMap((starter, position) =>
          starter.sources.map((source, seq) => ({
            projectId,
            position,
            seq,
            kind: source.kind,
            ref: source.ref,
          }))
        );
        if (sources.length > 0) {
          tx.insert(projectStarterSources).values(sources).run();
        }
      });
    },
  };
};

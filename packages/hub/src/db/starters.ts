import {
  type ProjectStarter,
  STARTER_PLACES,
  type StarterOutcome,
  type StarterPlace,
  type StarterSource,
} from "@cawco/core";
import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  projectStarterSets,
  projectStarterSources,
  projectStarters,
  starterOutcomes,
} from "./schema";

/** A project's stored set for a place: its starters in order, when and over what it was written, and why. */
export interface StarterSet {
  generatedAt: Date;
  inputHash: string;
  starters: ProjectStarter[];
  trigger: string;
}

/** A project's starters as last written, by place, and what the person did with them (project-starters.ts). */
export interface StartersDb {
  /** The newest outcomes in every place, newest first. */
  readonly outcomes: (
    projectId: string,
    limit: number
  ) => {
    at: Date;
    outcome: StarterOutcome;
    place: StarterPlace;
    text: string;
  }[];
  /** Records what the person did with one starter of a place. */
  readonly record: (
    projectId: string,
    place: StarterPlace,
    text: string,
    outcome: Exclude<StarterOutcome, "ignored">
  ) => void;
  /**
   * Writes the project's sets for every place in place of the ones it had,
   * from one ask, in one transaction and at one moment: each starter of an
   * old set that was neither picked nor edited since it was written is
   * recorded `ignored`.
   */
  readonly replace: (
    projectId: string,
    sets: {
      inputHash: string;
      starters: Record<StarterPlace, ProjectStarter[]>;
      trigger: string;
    }
  ) => void;
  readonly set: (
    projectId: string,
    place: StarterPlace
  ) => StarterSet | undefined;
}

/** A read or a write: the database, or a transaction inside it. */
type Reader = Pick<BunSQLiteDatabase, "select" | "insert" | "delete">;

/** The set's rows for one place, read through `reader`. */
const placeOf = (
  reader: Reader,
  projectId: string,
  place: StarterPlace
): StarterSet | undefined => {
  const head = reader
    .select()
    .from(projectStarterSets)
    .where(
      and(
        eq(projectStarterSets.projectId, projectId),
        eq(projectStarterSets.place, place)
      )
    )
    .get();
  if (!head) {
    return;
  }
  const rows = reader
    .select()
    .from(projectStarters)
    .where(
      and(
        eq(projectStarters.projectId, projectId),
        eq(projectStarters.place, place)
      )
    )
    .orderBy(asc(projectStarters.position))
    .all();
  const sources = reader
    .select()
    .from(projectStarterSources)
    .where(
      and(
        eq(projectStarterSources.projectId, projectId),
        eq(projectStarterSources.place, place)
      )
    )
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

/**
 * One place's set written in place of the one it had, through `writer` (the
 * caller's transaction): each starter of the old set that was neither
 * picked nor edited since it was written is recorded `ignored`.
 */
const writePlace = (
  writer: Reader,
  projectId: string,
  place: StarterPlace,
  next: {
    at: Date;
    inputHash: string;
    starters: ProjectStarter[];
    trigger: string;
  }
): void => {
  const old = placeOf(writer, projectId, place);
  if (old && old.starters.length > 0) {
    const pressed = new Set(
      writer
        .select({ text: starterOutcomes.text })
        .from(starterOutcomes)
        .where(
          and(
            eq(starterOutcomes.projectId, projectId),
            eq(starterOutcomes.place, place),
            gte(starterOutcomes.at, old.generatedAt),
            inArray(starterOutcomes.outcome, ["picked", "edited"])
          )
        )
        .all()
        .map((row) => row.text)
    );
    const ignored = old.starters.filter(
      (starter) => !pressed.has(starter.text)
    );
    if (ignored.length > 0) {
      writer
        .insert(starterOutcomes)
        .values(
          ignored.map((starter) => ({
            projectId,
            place,
            text: starter.text,
            outcome: "ignored" as const,
            at: next.at,
          }))
        )
        .run();
    }
  }
  // The set's row goes and comes back: its starters and their sources go
  // with it (cascade).
  writer
    .delete(projectStarterSets)
    .where(
      and(
        eq(projectStarterSets.projectId, projectId),
        eq(projectStarterSets.place, place)
      )
    )
    .run();
  writer
    .insert(projectStarterSets)
    .values({
      projectId,
      place,
      generatedAt: next.at,
      inputHash: next.inputHash,
      trigger: next.trigger,
    })
    .run();
  if (next.starters.length === 0) {
    return;
  }
  writer
    .insert(projectStarters)
    .values(
      next.starters.map((starter, position) => ({
        projectId,
        place,
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
      place,
      position,
      seq,
      kind: source.kind,
      ref: source.ref,
    }))
  );
  if (sources.length > 0) {
    writer.insert(projectStarterSources).values(sources).run();
  }
};

export const startersDb = (db: BunSQLiteDatabase): StartersDb => ({
  set: (projectId, place) => placeOf(db, projectId, place),
  outcomes: (projectId, limit) =>
    db
      .select({
        text: starterOutcomes.text,
        place: starterOutcomes.place,
        outcome: starterOutcomes.outcome,
        at: starterOutcomes.at,
      })
      .from(starterOutcomes)
      .where(eq(starterOutcomes.projectId, projectId))
      .orderBy(desc(starterOutcomes.at), desc(starterOutcomes.id))
      .limit(limit)
      .all(),
  record: (projectId, place, text, outcome) => {
    db.insert(starterOutcomes)
      .values({ projectId, place, text, outcome, at: new Date() })
      .run();
  },
  replace: (projectId, next) => {
    // One ask's sets, one moment: every place's `generated_at` is the same.
    const at = new Date();
    db.transaction((tx) => {
      for (const place of STARTER_PLACES) {
        writePlace(tx, projectId, place, {
          at,
          inputHash: next.inputHash,
          trigger: next.trigger,
          starters: next.starters[place],
        });
      }
    });
  },
});

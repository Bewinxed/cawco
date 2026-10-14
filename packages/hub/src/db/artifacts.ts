import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { artifacts, artifactUpdates, shownPreviews } from "./schema";

export type ArtifactRow = typeof artifacts.$inferSelect;

/** What may change on an artifact after it is made: never its id, session, project, kind or birth. */
export type ArtifactPatch = Partial<
  Omit<ArtifactRow, "id" | "instanceId" | "projectId" | "kind" | "createdAt">
>;

/** A canvas's picks as the tables before artifacts kept them (drizzle 0144 set them aside). */
export interface LegacyCanvas {
  choices: {
    choice: string;
    note: string | null;
    options: string;
    pageHash: string;
    updatedAt: number;
    value: string | null;
  }[];
  id: string;
  instanceId: string;
  pageHash: string | null;
  sentAt: number | null;
  updatedAt: number;
}

/** The rows artifacts/ keeps: the list, and each document's update log. */
export interface ArtifactsDb {
  /**
   * Appends one update to an artifact's log at the artifact's next seq, and
   * moves the row's seq, the keys it changed (a page's `state` keys, a
   * canvas's element ids) with who changed each, and `updatedAt` with it, in
   * one transaction; the seq it was kept at.
   */
  readonly append: (
    id: string,
    update: Uint8Array,
    changed: Record<string, "person" | "agent">
  ) => number;
  readonly byName: (
    instanceId: string,
    kind: ArtifactRow["kind"],
    name: string
  ) => ArtifactRow | undefined;
  /** Replaces the log with one snapshot, at the seq the log had reached. */
  readonly compact: (id: string, snapshot: Uint8Array) => void;
  readonly create: (row: ArtifactRow) => ArtifactRow;
  /** Drops the tables the canvases were set aside in, once imported. */
  readonly dropLegacy: () => void;
  readonly get: (id: string) => ArtifactRow | undefined;
  /** The canvases set aside for import; empty once they are dropped. */
  readonly legacy: () => LegacyCanvas[];
  /** A session's artifacts, newest first. */
  readonly ofInstance: (instanceId: string) => ArtifactRow[];
  /** Removes an artifact and its log. */
  readonly remove: (id: string) => void;
  /** Keeps `artifactId` as what session `instanceId`'s panel shows, in place of any other. */
  readonly show: (instanceId: string, artifactId: string) => void;
  /** Every session's shown artifact, with its row: what the hub serves after a restart. */
  readonly shown: () => { artifact: ArtifactRow; instanceId: string }[];
  /** Session `instanceId`'s panel shows nothing. */
  readonly unshow: (instanceId: string) => void;
  readonly update: (
    id: string,
    patch: ArtifactPatch
  ) => ArtifactRow | undefined;
  /** How many updates the log holds now. */
  readonly updateCount: (id: string) => number;
  /** An artifact's log, in order: what its document is loaded from. */
  readonly updates: (id: string) => Uint8Array[];
}

export const artifactsDb = (db: BunSQLiteDatabase): ArtifactsDb => ({
  append: (id, update, changed) =>
    db.transaction((tx) => {
      const row = tx.select().from(artifacts).where(eq(artifacts.id, id)).get();
      if (!row) {
        throw new Error(`No artifact ${id}.`);
      }
      const seq = row.seq + 1;
      tx.insert(artifactUpdates).values({ artifactId: id, seq, update }).run();
      const changes = { ...row.changes };
      for (const [key, by] of Object.entries(changed)) {
        changes[key] = { seq, by };
      }
      tx.update(artifacts)
        .set({ seq, changes, updatedAt: new Date() })
        .where(eq(artifacts.id, id))
        .run();
      return seq;
    }),
  byName: (instanceId, kind, name) =>
    db
      .select()
      .from(artifacts)
      .where(
        and(
          eq(artifacts.instanceId, instanceId),
          eq(artifacts.kind, kind),
          eq(artifacts.name, name)
        )
      )
      .get(),
  compact: (id, snapshot) => {
    db.transaction((tx) => {
      const row = tx.select().from(artifacts).where(eq(artifacts.id, id)).get();
      if (!row) {
        return;
      }
      tx.delete(artifactUpdates)
        .where(eq(artifactUpdates.artifactId, id))
        .run();
      tx.insert(artifactUpdates)
        .values({ artifactId: id, seq: row.seq, update: snapshot })
        .run();
    });
  },
  create: (row) => db.insert(artifacts).values(row).returning().get(),
  dropLegacy: () => {
    db.run(sql`DROP TABLE IF EXISTS legacy_canvas_choices`);
    db.run(sql`DROP TABLE IF EXISTS legacy_canvases`);
  },
  get: (id) => db.select().from(artifacts).where(eq(artifacts.id, id)).get(),
  legacy: () => {
    const there = db.get(
      sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'legacy_canvases'`
    );
    if (!there) {
      return [];
    }
    const canvases = db.all<Omit<LegacyCanvas, "choices">>(
      sql`SELECT id, instance_id AS instanceId, page_hash AS pageHash, sent_at AS sentAt, updated_at AS updatedAt FROM legacy_canvases`
    );
    const choices = db.all<
      LegacyCanvas["choices"][number] & { canvasId: string }
    >(
      sql`SELECT canvas_id AS canvasId, choice, options, note, value, page_hash AS pageHash, updated_at AS updatedAt FROM legacy_canvas_choices`
    );
    return canvases.map((canvas) => ({
      ...canvas,
      choices: choices.filter((choice) => choice.canvasId === canvas.id),
    }));
  },
  ofInstance: (instanceId) =>
    db
      .select()
      .from(artifacts)
      .where(eq(artifacts.instanceId, instanceId))
      .orderBy(desc(artifacts.createdAt))
      .all(),
  remove: (id) => {
    db.delete(artifacts).where(eq(artifacts.id, id)).run();
  },
  show: (instanceId, artifactId) => {
    db.insert(shownPreviews)
      .values({ instanceId, artifactId })
      .onConflictDoUpdate({
        target: shownPreviews.instanceId,
        set: { artifactId },
      })
      .run();
  },
  shown: () =>
    db
      .select({ instanceId: shownPreviews.instanceId, artifact: artifacts })
      .from(shownPreviews)
      .innerJoin(artifacts, eq(artifacts.id, shownPreviews.artifactId))
      .all(),
  unshow: (instanceId) => {
    db.delete(shownPreviews)
      .where(eq(shownPreviews.instanceId, instanceId))
      .run();
  },
  update: (id, patch) =>
    db
      .update(artifacts)
      .set(patch)
      .where(eq(artifacts.id, id))
      .returning()
      .get(),
  updates: (id) =>
    db
      .select({ update: artifactUpdates.update })
      .from(artifactUpdates)
      .where(eq(artifactUpdates.artifactId, id))
      .orderBy(asc(artifactUpdates.seq))
      .all()
      .map((row) => row.update),
  updateCount: (id) =>
    db
      .select({ count: count() })
      .from(artifactUpdates)
      .where(eq(artifactUpdates.artifactId, id))
      .get()?.count ?? 0,
});

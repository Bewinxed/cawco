import { and, asc, count, desc, eq, gt, gte, or, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  artifactChanges,
  artifacts,
  artifactUpdates,
  shownPreviews,
} from "./schema";

export type ArtifactRow = typeof artifacts.$inferSelect;

/** One key's last change on an artifact: the seq it changed at, and who changed it. */
export interface ArtifactChange {
  by: "person" | "agent";
  key: string;
  seq: number;
}

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
  /** An artifact's keys' last changes: those after seq `after`, by `by`, when named. */
  readonly changes: (
    id: string,
    where?: { after?: number; by?: ArtifactChange["by"] }
  ) => ArtifactChange[];
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
  /** A project's artifacts, any of its sessions', newest first. */
  readonly ofProject: (projectId: string) => ArtifactRow[];
  /**
   * The artifacts, any session's, that show what a workspace serves: a port
   * preview naming it (`source.workspace`), or a folder preview of its clone
   * or a folder inside it on its machine. Every session's shown preview
   * (shown_previews) is one of these rows, so this covers what panels show.
   */
  readonly previewing: (workspace: {
    id: string;
    machineId: string;
    path: string;
  }) => ArtifactRow[];
  /** Removes an artifact and its log. */
  readonly remove: (id: string) => void;
  /** Keeps `artifactId` as what session `instanceId`'s panel shows, in place of any other. */
  readonly show: (instanceId: string, artifactId: string) => void;
  /** Every session's shown artifact, with its row: what the hub serves after a restart. */
  readonly shown: () => { artifact: ArtifactRow; instanceId: string }[];
  /** Every artifact whose doc took an update (or that changed) at or after `at`. */
  readonly touchedSince: (at: Date) => ArtifactRow[];
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
      for (const [key, by] of Object.entries(changed)) {
        tx.insert(artifactChanges)
          .values({ artifactId: id, key, seq, by })
          .onConflictDoUpdate({
            target: [artifactChanges.artifactId, artifactChanges.key],
            set: { seq, by },
          })
          .run();
      }
      tx.update(artifacts)
        .set({ seq, updatedAt: new Date() })
        .where(eq(artifacts.id, id))
        .run();
      return seq;
    }),
  changes: (id, { after, by } = {}) =>
    db
      .select({
        key: artifactChanges.key,
        seq: artifactChanges.seq,
        by: artifactChanges.by,
      })
      .from(artifactChanges)
      .where(
        and(
          eq(artifactChanges.artifactId, id),
          after === undefined ? undefined : gt(artifactChanges.seq, after),
          by === undefined ? undefined : eq(artifactChanges.by, by)
        )
      )
      .all(),
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
  ofProject: (projectId) =>
    db
      .select()
      .from(artifacts)
      .where(eq(artifacts.projectId, projectId))
      .orderBy(desc(artifacts.createdAt))
      .all(),
  previewing: ({ id, machineId, path }) =>
    db
      .select()
      .from(artifacts)
      .where(
        or(
          sql`json_extract(${artifacts.source}, '$.workspace') = ${id}`,
          and(
            eq(artifacts.machineId, machineId),
            or(
              sql`json_extract(${artifacts.source}, '$.dir') = ${path}`,
              sql`substr(json_extract(${artifacts.source}, '$.dir'), 1, ${path.length + 1}) = ${`${path}/`}`
            )
          )
        )
      )
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
  touchedSince: (at) =>
    db.select().from(artifacts).where(gte(artifacts.updatedAt, at)).all(),
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

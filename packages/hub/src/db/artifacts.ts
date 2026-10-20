import type { PreviewSource } from "@cawco/core";
import { isPlace } from "@cawco/core/workspace-policy";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  artifactChanges,
  artifacts,
  artifactUpdates,
  shownPreviews,
} from "./schema";

type StoredArtifact = typeof artifacts.$inferSelect;
type SourceColumn =
  | "sourcePage"
  | "sourceDir"
  | "sourcePort"
  | "sourcePath"
  | "sourceWorkspace"
  | "sourcePlace"
  | "sourceStageDir"
  | "sourceStageFile"
  | "sourceServeCommand"
  | "sourceServeCwd";

/**
 * A project's page, by its row: the project's by its name, whichever
 * session wrote it, and living as long as its source in the project's
 * folder (schema.ts `artifacts.instanceId`). A held next version is none.
 */
export const projectPage = sql`${artifacts.kind} = 'page' and ${artifacts.projectId} is not null and ${artifacts.heldFor} is null`;

/** An artifact as everything reads it: what it shows as one {@link PreviewSource}. */
export type ArtifactRow = Omit<StoredArtifact, SourceColumn> & {
  source: PreviewSource;
};

/** A port source's `workspace`: a workspace's id, kept as its key, or a place's, kept as itself ({@link isPlace}). */
const workspaceColumnsOf = (
  source: PreviewSource
): Pick<StoredArtifact, "sourcePlace" | "sourceWorkspace"> => {
  const named = "port" in source ? (source.workspace ?? null) : null;
  return named !== null && isPlace(named)
    ? { sourceWorkspace: null, sourcePlace: named }
    : { sourceWorkspace: named, sourcePlace: null };
};

/** A source as its columns keep it: one of page, dir or port set, the rest of its kind's beside it. */
export const sourceColumnsOf = (
  source: PreviewSource
): Pick<StoredArtifact, SourceColumn> => ({
  sourcePage: "page" in source ? source.page : null,
  sourceDir: "dir" in source ? source.dir : null,
  sourcePort: "port" in source ? source.port : null,
  sourcePath: "page" in source ? null : (source.path ?? null),
  ...workspaceColumnsOf(source),
  sourceStageDir: "port" in source ? (source.stage?.dir ?? null) : null,
  sourceStageFile: "port" in source ? (source.stage?.file ?? null) : null,
  sourceServeCommand: "port" in source ? (source.serve?.command ?? null) : null,
  sourceServeCwd: "port" in source ? (source.serve?.cwd ?? null) : null,
});

/** A stored artifact with its source whole again. */
export const artifactOf = ({
  sourcePage,
  sourceDir,
  sourcePort,
  sourcePath,
  sourceWorkspace,
  sourcePlace,
  sourceStageDir,
  sourceStageFile,
  sourceServeCommand,
  sourceServeCwd,
  ...row
}: StoredArtifact): ArtifactRow => {
  const path = sourcePath === null ? {} : { path: sourcePath };
  const workspace = sourceWorkspace ?? sourcePlace;
  const port = (): PreviewSource => ({
    port: sourcePort ?? 0,
    ...path,
    ...(sourceStageDir !== null && sourceStageFile !== null
      ? { stage: { dir: sourceStageDir, file: sourceStageFile } }
      : {}),
    ...(sourceServeCommand === null
      ? {}
      : { serve: { command: sourceServeCommand, cwd: sourceServeCwd ?? "." } }),
    ...(workspace === null ? {} : { workspace }),
  });
  const folder = (): PreviewSource =>
    sourceDir === null ? port() : { dir: sourceDir, ...path };
  return {
    ...row,
    source: sourcePage === null ? folder() : { page: sourcePage },
  };
};

/** One key's last change on an artifact: the seq it changed at, and who changed it. */
export interface ArtifactChange {
  by: "person" | "agent";
  key: string;
  seq: number;
}

/**
 * What may change on an artifact after it is made: never its id, project,
 * kind or birth. Its session changes only for a project's page another
 * session of the project makes again ({@link ArtifactsDb.projectPage}).
 */
export type ArtifactPatch = Partial<
  Omit<ArtifactRow, "id" | "projectId" | "kind" | "createdAt">
>;

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
  readonly get: (id: string) => ArtifactRow | undefined;
  /** The next version held for artifact `id` (`heldFor`), if one waits. */
  readonly heldOf: (id: string) => ArtifactRow | undefined;
  /** A session's artifacts, newest first; never a held next version, as no list below holds one. */
  readonly ofInstance: (instanceId: string) => ArtifactRow[];
  /** A project's artifacts, any of its sessions', newest first. */
  readonly ofProject: (projectId: string) => ArtifactRow[];
  /**
   * The artifacts, any session's, that show what a workspace serves: a port
   * preview naming it (`source.workspace`), or a folder preview of its clone
   * or a folder inside it on its machine. Every session's shown preview
   * (shown_previews) is one of these rows, so this covers what panels show.
   * A held next version is one too: a server it shows stays up for it.
   */
  readonly previewing: (workspace: {
    id: string;
    machineId: string;
    path: string;
  }) => ArtifactRow[];
  /** A project's page of a name, whichever session wrote it, or none now ({@link projectPage}). */
  readonly projectPage: (
    projectId: string,
    name: string
  ) => ArtifactRow | undefined;
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
  byName: (instanceId, kind, name) => {
    const row = db
      .select()
      .from(artifacts)
      .where(
        and(
          eq(artifacts.instanceId, instanceId),
          eq(artifacts.kind, kind),
          eq(artifacts.name, name),
          isNull(artifacts.heldFor)
        )
      )
      .get();
    return row && artifactOf(row);
  },
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
  create: ({ source, ...row }) =>
    artifactOf(
      db
        .insert(artifacts)
        .values({ ...row, ...sourceColumnsOf(source) })
        .returning()
        .get()
    ),
  get: (id) => {
    const row = db.select().from(artifacts).where(eq(artifacts.id, id)).get();
    return row && artifactOf(row);
  },
  heldOf: (id) => {
    const row = db
      .select()
      .from(artifacts)
      .where(eq(artifacts.heldFor, id))
      .get();
    return row && artifactOf(row);
  },
  ofInstance: (instanceId) =>
    db
      .select()
      .from(artifacts)
      .where(
        and(eq(artifacts.instanceId, instanceId), isNull(artifacts.heldFor))
      )
      .orderBy(desc(artifacts.createdAt))
      .all()
      .map(artifactOf),
  ofProject: (projectId) =>
    db
      .select()
      .from(artifacts)
      .where(and(eq(artifacts.projectId, projectId), isNull(artifacts.heldFor)))
      .orderBy(desc(artifacts.createdAt))
      .all()
      .map(artifactOf),
  projectPage: (projectId, name) => {
    const row = db
      .select()
      .from(artifacts)
      .where(
        and(
          projectPage,
          eq(artifacts.projectId, projectId),
          eq(artifacts.name, name)
        )
      )
      .get();
    return row && artifactOf(row);
  },
  previewing: ({ id, machineId, path }) =>
    db
      .select()
      .from(artifacts)
      .where(
        or(
          eq(artifacts.sourceWorkspace, id),
          eq(artifacts.sourcePlace, id),
          and(
            eq(artifacts.machineId, machineId),
            or(
              eq(artifacts.sourceDir, path),
              sql`substr(${artifacts.sourceDir}, 1, ${path.length + 1}) = ${`${path}/`}`
            )
          )
        )
      )
      .orderBy(desc(artifacts.createdAt))
      .all()
      .map(artifactOf),
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
      .all()
      .map(({ instanceId, artifact }) => ({
        instanceId,
        artifact: artifactOf(artifact),
      })),
  touchedSince: (at) =>
    db
      .select()
      .from(artifacts)
      .where(and(gte(artifacts.updatedAt, at), isNull(artifacts.heldFor)))
      .all()
      .map(artifactOf),
  unshow: (instanceId) => {
    db.delete(shownPreviews)
      .where(eq(shownPreviews.instanceId, instanceId))
      .run();
  },
  update: (id, { source, ...patch }) => {
    const row = db
      .update(artifacts)
      .set({ ...patch, ...(source ? sourceColumnsOf(source) : {}) })
      .where(eq(artifacts.id, id))
      .returning()
      .get();
    return row && artifactOf(row);
  },
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

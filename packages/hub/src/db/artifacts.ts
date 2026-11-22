import type { PreviewSource } from "@cawco/core/preview/protocol";
import { type SourceKey, sourceKeyOf } from "@cawco/core/preview/upstream";
import { isDesignTree } from "@cawco/core/stage";
import { isPlace } from "@cawco/core/workspace-policy";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  or,
  type SQL,
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
  | "sourceServeCwd"
  | "sourcePin";

/**
 * A project's page, by its row: the project's by its name, whichever
 * session wrote it, and living as long as its source in the project's
 * folder (schema.ts `artifacts.instanceId`). A held next version is none.
 */
export const projectPage = sql`${artifacts.kind} = 'page' and ${artifacts.projectId} is not null and ${artifacts.heldFor} is null`;

/**
 * An artifact as everything reads it: what it shows as one
 * {@link PreviewSource}. Not whether it may wait on the person
 * (`mayWait`): that is Needs you's own mark of what its read may skip,
 * written by that read and by the trigger every write of the row fires
 * (schema.ts `artifacts.mayWait`), read through {@link ArtifactsDb.mayWait}.
 */
export type ArtifactRow = Omit<StoredArtifact, SourceColumn | "mayWait"> & {
  source: PreviewSource;
};

/**
 * An artifact a session owns: every kind but a project's page, which outlives
 * its session (schema.ts `artifacts.instanceId`).
 */
export type SessionArtifact = ArtifactRow & { instanceId: string };

/** Whether `row` is a session's own ({@link SessionArtifact}). */
export const isSessionArtifact = (row: ArtifactRow): row is SessionArtifact =>
  row.instanceId !== null;

/** A port source's `workspace`: a workspace's id, kept as its key, or a place's, kept as itself ({@link isPlace}). */
const workspaceColumnsOf = (
  source: PreviewSource
): Pick<StoredArtifact, "sourcePlace" | "sourceWorkspace"> => {
  const named = "port" in source ? (source.workspace ?? null) : null;
  // A place and a design folder's tree have no workspace row to name.
  return named !== null && (isPlace(named) || isDesignTree(named))
    ? { sourceWorkspace: null, sourcePlace: named }
    : { sourceWorkspace: named, sourcePlace: null };
};

/** A source as its columns keep it: one of page, dir or port set, the rest of its kind's beside it. */
const sourceColumnsOf = (
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
  sourcePin: "page" in source ? null : (source.pin ?? null),
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
  sourcePin,
  mayWait: _mayWait,
  ...row
}: StoredArtifact): ArtifactRow => {
  const path = sourcePath === null ? {} : { path: sourcePath };
  const pin = sourcePin === null ? {} : { pin: sourcePin };
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
    ...pin,
  });
  const folder = (): PreviewSource =>
    sourceDir === null ? port() : { dir: sourceDir, ...path, ...pin };
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
 * kind, birth or origin (its origin only through {@link ArtifactsDb.handOrigin}),
 * and never what serves it (its machine and source only through
 * {@link ArtifactsDb.resource}, which tells the preview that serves it).
 * Its session changes only for a project's page another session of the
 * project makes again ({@link ArtifactsDb.projectPage}).
 */
type ArtifactPatch = Partial<
  Omit<
    ArtifactRow,
    | "id"
    | "projectId"
    | "kind"
    | "createdAt"
    | "origin"
    | "machineId"
    | "source"
  >
>;

/** What serves an artifact: the machine (none for what the hub serves) and its source. */
export type ArtifactServed = Pick<ArtifactRow, "machineId" | "source">;

/**
 * The key of what a machine serves artifact `row` from (core
 * `sourceKeyOf`); null for what the hub serves itself (a page, a canvas, a
 * browser), or a row no machine holds.
 */
const rowSourceKey = (row: ArtifactServed): SourceKey | null =>
  row.machineId && !("page" in row.source)
    ? sourceKeyOf({ machineId: row.machineId, source: row.source })
    : null;

/**
 * An artifact whose source moved to another key ({@link ArtifactsDb.resource}):
 * its id, the origin its row pointed at as it moved, what served it
 * `before`, and the keys it moved `from` and `to`.
 */
export interface SourceMoved {
  before: ArtifactServed;
  from: SourceKey | null;
  id: string;
  origin: string;
  to: SourceKey | null;
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
  /**
   * Every artifact the person may be asked on (Needs you, artifacts/needs.ts),
   * oldest first: none a held next version. A `try` preview is among them:
   * a pin on it can ask.
   */
  readonly asking: () => ArtifactRow[];
  /**
   * The session's artifact of that kind and name, not held: an agent's
   * create's, or with `composer` the person's own composer canvas of it
   * (schema.ts `artifacts.composer`). Neither finds the other's.
   */
  readonly byName: (
    instanceId: string,
    kind: ArtifactRow["kind"],
    name: string,
    composer?: boolean
  ) => ArtifactRow | undefined;
  /** The artifact whose row points at preview origin `origin` (schema.ts `artifacts.origin`). */
  readonly byOrigin: (origin: string) => ArtifactRow | undefined;
  /** An artifact's keys' last changes: those after seq `after`, by `by`, when named. */
  readonly changes: (
    id: string,
    where?: { after?: number; by?: ArtifactChange["by"] }
  ) => ArtifactChange[];
  /** Replaces the log with one snapshot, at the seq the log had reached. */
  readonly compact: (id: string, snapshot: Uint8Array) => void;
  /**
   * A new row, its preview origin minted with it (schema.ts
   * `artifacts.origin`), whatever `row` was copied from; `composer` only on
   * the person's own composer canvas (schema.ts `artifacts.composer`).
   */
  readonly create: (
    row: Omit<ArtifactRow, "composer" | "origin"> & { composer?: boolean }
  ) => ArtifactRow;
  readonly get: (id: string) => ArtifactRow | undefined;
  /**
   * Artifact `id` takes the preview origin of `held`, its next version,
   * as its parent opens it (artifacts service.ts `promote`), and `held`
   * takes the artifact's: the version's origin, where its address was
   * handed out, answers for the artifact from now on, and the artifact's
   * own ends with the version's row, which goes next
   * ({@link artifactEvents} `onArtifactsGone`). Both repointed in one write, nothing renamed.
   */
  readonly handOrigin: (held: string, id: string) => void;
  /** The next version held for artifact `id` (`heldFor`), if one waits. */
  readonly heldOf: (id: string) => ArtifactRow | undefined;
  /** Every artifact a next version is held for, in one read. */
  readonly heldTargets: () => Set<string>;
  /**
   * Of {@link asking}, those that may wait on the person (schema.ts
   * `artifacts.mayWait`), oldest first, off `artifacts_may_wait`: every
   * one that waits is among them, with those written since Needs you last
   * read them.
   */
  readonly mayWait: () => ArtifactRow[];
  /** A session's artifacts, newest first; never a held next version, as no list below holds one. */
  readonly ofInstance: (instanceId: string) => ArtifactRow[];
  /**
   * The artifacts any of `instanceIds` holds, newest first, in one read
   * however many sessions are named: a delegation tree of 1,600 sessions,
   * read one session at a time, held the hub for seconds.
   */
  readonly ofInstances: (instanceIds: readonly string[]) => ArtifactRow[];
  /** The artifacts a session made into another's panel (`madeBy`), newest first. */
  readonly ofMaker: (instanceId: string) => ArtifactRow[];
  /** A project's artifacts, any of its sessions', newest first. */
  readonly ofProject: (projectId: string) => ArtifactRow[];
  /** Every page whose `state` took a change: the docs that may hold picks. */
  readonly picked: () => ArtifactRow[];
  /**
   * The artifacts, any session's, that show what a workspace serves: a port
   * preview naming it (`source.workspace`), or a folder preview of its clone
   * or a folder inside it on its machine. Every session's shown preview
   * (shown_previews) is one of these rows, so this covers what panels show.
   * A held next version is one too: a server it shows stays up for it.
   */
  /** The artifacts served from pin `pin` (core `PreviewSource.pin`), held next versions too: the one that cut it, or one a held version was opened onto. */
  readonly pinnedBy: (pin: string) => ArtifactRow[];
  /** Every pin an artifact on machine `machineId` is served from (core `PreviewSource.pin`), held next versions' too. */
  readonly pinsOn: (machineId: string) => string[];
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
  /** Removes an artifact and its log, a next version held for it too ({@link dropArtifacts}). */
  readonly remove: (id: string) => void;
  /**
   * THE ONE WRITE OF WHAT SERVES AN ARTIFACT: its machine and source set,
   * and, when that moves it to another source key ({@link rowSourceKey}),
   * the move told once the write is done ({@link artifactEvents} `onSourceMoved`), so
   * the preview that serves its origin follows the row (hub
   * preview-service.ts). Undefined when no row has that id.
   */
  readonly resource: (
    id: string,
    served: ArtifactServed
  ) =>
    | { from: SourceKey | null; row: ArtifactRow; to: SourceKey | null }
    | undefined;
  /** Keeps `artifactId` as what session `instanceId`'s panel shows, in place of any other, as the show `revision` (`PreviewTarget.revision`). */
  readonly show: (
    instanceId: string,
    artifactId: string,
    revision: string,
    show: string
  ) => void;
  /** Every session's shown artifact, with its row, its show's revision and its show (each null on a row kept before it was): what the hub serves after a restart. */
  readonly shown: () => {
    artifact: ArtifactRow;
    instanceId: string;
    revision: string | null;
    show: string | null;
  }[];
  /** Every artifact whose doc took an update (or that changed) at or after `at`. */
  readonly touchedSince: (at: Date) => ArtifactRow[];
  /** Session `instanceId`'s panel shows nothing. */
  readonly unshow: (instanceId: string) => void;
  /** Every artifact with no title: one made before titles were kept (artifact-titles.ts). */
  readonly untitled: () => ArtifactRow[];
  readonly update: (
    id: string,
    patch: ArtifactPatch
  ) => ArtifactRow | undefined;
  /** An artifact's log, in order: what its document is loaded from. */
  readonly updates: (id: string) => Uint8Array[];
  /**
   * Artifacts `ids` may not wait on the person, as Needs you just read them
   * from their rows and docs: its read skips them until their row is
   * written again (the `artifacts_may_wait_moved` trigger). Tells no
   * listener: nothing anyone reads of the row moved.
   */
  readonly waitsNot: (ids: readonly string[]) => void;
}

/** An artifact row that went, and the preview origin it pointed at (schema.ts `artifacts.origin`). */
export interface GoneArtifact {
  id: string;
  /** The machine that served it, and the pin it was served from (core `PreviewSource.pin`): let go once no row names it. */
  machineId: string | null;
  origin: string;
  pin: string | null;
}

/** What deletes rows: the database, or a transaction of it. */
export type Deleter = Pick<BunSQLiteDatabase, "delete" | "select">;

/**
 * Every artifact `where` names deleted, and each next version held for one
 * (`heldFor`, which its foreign key cascades): their ids and preview
 * origins, every one, read before the delete, since a cascade returns
 * nothing. The one way an artifact's row goes; {@link artifactEvents} wraps
 * it (`dropArtifacts`) to tell `onArtifactsGone` of them once the write is
 * done.
 */
const dropArtifactRows = (
  tx: Deleter,
  where: SQL | undefined
): GoneArtifact[] => {
  // No condition names no row: never every artifact.
  if (!where) {
    return [];
  }
  const named = tx.select({ id: artifacts.id }).from(artifacts).where(where);
  const gone = tx
    .select({
      id: artifacts.id,
      origin: artifacts.origin,
      machineId: artifacts.machineId,
      pin: artifacts.sourcePin,
    })
    .from(artifacts)
    .where(or(where, inArray(artifacts.heldFor, named)))
    .all();
  if (gone.length > 0) {
    tx.delete(artifacts).where(where).run();
  }
  return gone;
};

export const artifactsDb = (
  db: BunSQLiteDatabase,
  {
    /** {@link dropArtifactRows}, its ids told once the write is done ({@link artifactEvents}). */
    dropArtifacts: drop,
    /** A source moved by {@link ArtifactsDb.resource}, told once the write is done ({@link artifactEvents}). */
    sourceMoved: moved,
    /** A row made or changed by {@link ArtifactsDb.create} or {@link ArtifactsDb.update} ({@link artifactEvents}). */
    artifactsWritten: written,
  }: ArtifactEvents
): ArtifactsDb => ({
  pinsOn: (machineId) =>
    db
      .selectDistinct({ pin: artifacts.sourcePin })
      .from(artifacts)
      .where(
        and(eq(artifacts.machineId, machineId), isNotNull(artifacts.sourcePin))
      )
      .all()
      .flatMap((row) => (row.pin === null ? [] : [row.pin])),
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
  // The pattern names its type: TypeScript 7.1 no longer types a defaulted
  // binding pattern from the interface (TS7031, microsoft/TypeScript#64431).
  changes: (id, { after, by }: Parameters<ArtifactsDb["changes"]>[1] = {}) =>
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
  byName: (instanceId, kind, name, composer = false) => {
    const row = db
      .select()
      .from(artifacts)
      .where(
        and(
          eq(artifacts.instanceId, instanceId),
          eq(artifacts.kind, kind),
          eq(artifacts.name, name),
          eq(artifacts.composer, composer),
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
  create: ({ source, ...row }) => {
    const made = db
      .insert(artifacts)
      .values({
        ...row,
        ...sourceColumnsOf(source),
        // Minted here, never copied: a held version's row is made from its
        // artifact's whole, and its origin is its own.
        origin: crypto.randomUUID(),
      })
      .returning()
      .get();
    written([made.id]);
    return artifactOf(made);
  },
  get: (id) => {
    const row = db.select().from(artifacts).where(eq(artifacts.id, id)).get();
    return row && artifactOf(row);
  },
  byOrigin: (origin) => {
    const row = db
      .select()
      .from(artifacts)
      .where(eq(artifacts.origin, origin))
      .get();
    return row && artifactOf(row);
  },
  handOrigin: (held, id) => {
    db.transaction((tx) => {
      const of = (one: string) =>
        tx
          .select({ origin: artifacts.origin })
          .from(artifacts)
          .where(eq(artifacts.id, one))
          .get()?.origin;
      const theirs = of(held);
      const ours = of(id);
      if (theirs === undefined || ours === undefined) {
        return;
      }
      // Each origin is one row's (`artifacts_origin`): the version's stands
      // apart for the one statement between.
      tx.update(artifacts)
        .set({ origin: crypto.randomUUID() })
        .where(eq(artifacts.id, held))
        .run();
      tx.update(artifacts)
        .set({ origin: theirs })
        .where(eq(artifacts.id, id))
        .run();
      tx.update(artifacts)
        .set({ origin: ours })
        .where(eq(artifacts.id, held))
        .run();
    });
  },
  heldOf: (id) => {
    const row = db
      .select()
      .from(artifacts)
      .where(eq(artifacts.heldFor, id))
      .get();
    return row && artifactOf(row);
  },
  heldTargets: () =>
    new Set(
      db
        .select({ heldFor: artifacts.heldFor })
        .from(artifacts)
        .where(isNotNull(artifacts.heldFor))
        .all()
        .flatMap((row) => (row.heldFor ? [row.heldFor] : []))
    ),
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
  ofMaker: (instanceId) =>
    db
      .select()
      .from(artifacts)
      .where(and(eq(artifacts.madeBy, instanceId), isNull(artifacts.heldFor)))
      .orderBy(desc(artifacts.createdAt))
      .all()
      .map(artifactOf),
  ofInstances: (instanceIds) =>
    instanceIds.length === 0
      ? []
      : db
          .select()
          .from(artifacts)
          .where(
            and(
              inArray(artifacts.instanceId, [...instanceIds]),
              isNull(artifacts.heldFor)
            )
          )
          .orderBy(desc(artifacts.createdAt))
          .all()
          .map(artifactOf),
  asking: () =>
    db
      .select()
      .from(artifacts)
      .where(isNull(artifacts.heldFor))
      .orderBy(asc(artifacts.createdAt))
      .all()
      .map(artifactOf),
  mayWait: () =>
    db
      .select()
      .from(artifacts)
      .where(and(eq(artifacts.mayWait, true), isNull(artifacts.heldFor)))
      .orderBy(asc(artifacts.createdAt))
      .all()
      .map(artifactOf),
  waitsNot: (ids) => {
    for (let at = 0; at < ids.length; at += 500) {
      db.update(artifacts)
        .set({ mayWait: false })
        .where(inArray(artifacts.id, ids.slice(at, at + 500)))
        .run();
    }
  },
  untitled: () =>
    db
      .select()
      .from(artifacts)
      .where(eq(artifacts.title, ""))
      .all()
      .map(artifactOf),
  picked: () =>
    db
      .select()
      .from(artifacts)
      .where(
        and(
          eq(artifacts.kind, "page"),
          inArray(
            artifacts.id,
            db
              .selectDistinct({ id: artifactChanges.artifactId })
              .from(artifactChanges)
          )
        )
      )
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
  pinnedBy: (pin) =>
    db
      .select()
      .from(artifacts)
      .where(eq(artifacts.sourcePin, pin))
      .all()
      .map(artifactOf),
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
    drop(db, eq(artifacts.id, id));
  },
  resource: (id, { machineId, source }) => {
    const was = db.select().from(artifacts).where(eq(artifacts.id, id)).get();
    if (!was) {
      return;
    }
    const before = artifactOf(was);
    const stored = db
      .update(artifacts)
      .set({ machineId, ...sourceColumnsOf(source) })
      .where(eq(artifacts.id, id))
      .returning()
      .get();
    if (!stored) {
      return;
    }
    const row = artifactOf(stored);
    const from = rowSourceKey(before);
    const to = rowSourceKey(row);
    if (from !== to) {
      moved({
        id,
        origin: before.origin,
        before: { machineId: before.machineId, source: before.source },
        from,
        to,
      });
    }
    return { row, from, to };
  },
  show: (instanceId, artifactId, revision, show) => {
    db.insert(shownPreviews)
      .values({ instanceId, artifactId, revision, show })
      .onConflictDoUpdate({
        target: shownPreviews.instanceId,
        set: { artifactId, revision, show },
      })
      .run();
  },
  shown: () =>
    db
      .select({
        instanceId: shownPreviews.instanceId,
        revision: shownPreviews.revision,
        show: shownPreviews.show,
        artifact: artifacts,
      })
      .from(shownPreviews)
      .innerJoin(artifacts, eq(artifacts.id, shownPreviews.artifactId))
      .all()
      .map(({ instanceId, revision, show, artifact }) => ({
        instanceId,
        revision,
        show,
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
  update: (id, patch) => {
    const row = db
      .update(artifacts)
      .set(patch)
      .where(eq(artifacts.id, id))
      .returning()
      .get();
    if (row) {
      written([row.id]);
    }
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
});

export interface ArtifactListenersDb {
  /**
   * `listener` hears the artifacts that went, each with the preview origin
   * its row pointed at, a next version held for one included, once the
   * write that deleted them is done: the service's discard, a session's
   * delete, a project's delete or fold (`dropArtifacts`, the one way an
   * artifact row goes).
   */
  readonly onArtifactsGone: (listener: (gone: GoneArtifact[]) => void) => void;
  /**
   * `listener` hears which artifact rows were made, changed or deleted,
   * as the write happens: every write of the table is one of these
   * (`artifactsDb` create and update, `dropArtifacts`). Needs you's lane
   * reads again on it (artifacts/lane.ts `moved`).
   */
  readonly onArtifactsWritten: (
    listener: (ids: readonly string[]) => void
  ) => void;
  /**
   * `listener` hears each artifact whose source moved to another key, with
   * what served it before, once the write that moved it is done: the one
   * write of an artifact's machine and source (artifacts.ts `resource`),
   * so the preview serving its origin follows the row (hub
   * preview-service.ts), as `onArtifactsGone` ends it.
   */
  readonly onSourceMoved: (listener: (move: SourceMoved) => void) => void;
}

/** What every write of an artifact row tells, and who hears it. */
export interface ArtifactEvents {
  /** What the store hands on as its own members (`onArtifactsGone` and the rest). */
  readonly artifactListeners: ArtifactListenersDb;
  /** Tells whoever hears of a row written (`onArtifactsWritten`). */
  readonly artifactsWritten: (ids: readonly string[]) => void;
  /** {@link dropArtifactRows}, its ids told once the write is done: the one way an artifact row goes. */
  readonly dropArtifacts: (tx: Deleter, where: SQL | undefined) => void;
  /** Tells whoever hears of a source moved (`onSourceMoved`). */
  readonly sourceMoved: (move: SourceMoved) => void;
}

export const artifactEvents = (db: BunSQLiteDatabase): ArtifactEvents => {
  /** Who hears of an artifact row written ({@link DbShape.onArtifactsWritten}). */
  const writtenListeners = new Set<(ids: readonly string[]) => void>();

  const artifactsWritten = (ids: readonly string[]): void => {
    for (const listener of writtenListeners) {
      listener(ids);
    }
  };

  /** Who hears of the artifacts that went ({@link DbShape.onArtifactsGone}). */
  const goneListeners = new Set<(gone: GoneArtifact[]) => void>();

  /** Artifacts a write deleted, not yet told, by id. */
  let goneNoted: Map<string, GoneArtifact> | undefined;

  /**
   * The artifacts noted gone, told once the write is done (a microtask:
   * every transaction here runs synchronously, so none is open then), and
   * only those no row answers to: a write rolled back deleted nothing.
   */
  const tellGone = (): void => {
    const noted = [...(goneNoted?.values() ?? [])];
    goneNoted = undefined;
    const kept = new Set<string>();
    for (let at = 0; at < noted.length; at += 500) {
      for (const row of db
        .select({ id: artifacts.id })
        .from(artifacts)
        .where(
          inArray(
            artifacts.id,
            noted.slice(at, at + 500).map((one) => one.id)
          )
        )
        .all()) {
        kept.add(row.id);
      }
    }
    const gone = noted.filter((one) => !kept.has(one.id));
    if (gone.length === 0) {
      return;
    }
    for (const listener of goneListeners) {
      try {
        listener(gone);
      } catch (error) {
        console.error("[artifacts] telling a delete failed", error);
      }
    }
  };

  /**
   * Every artifact `where` names deleted, its held next versions with it
   * (artifacts.ts {@link dropArtifactRows}), and noted for
   * {@link DbShape.onArtifactsGone}: the one way an artifact row goes, a
   * session's, a project's or the service's discard.
   */
  const dropArtifacts = (tx: Deleter, where: SQL | undefined): void => {
    const gone = dropArtifactRows(tx, where);
    if (gone.length === 0) {
      return;
    }
    artifactsWritten(gone.map((one) => one.id));
    if (!goneNoted) {
      goneNoted = new Map();
      queueMicrotask(tellGone);
    }
    for (const one of gone) {
      goneNoted.set(one.id, one);
    }
  };

  /** Who hears of the sources that moved ({@link DbShape.onSourceMoved}). */
  const movedListeners = new Set<(move: SourceMoved) => void>();

  /**
   * A source moved (artifacts.ts `resource`), told once the write is done:
   * a microtask, as {@link tellGone}'s, so no transaction is open then.
   */
  const sourceMoved = (move: SourceMoved): void => {
    queueMicrotask(() => {
      for (const listener of movedListeners) {
        try {
          listener(move);
        } catch (error) {
          console.error("[artifacts] telling a source move failed", error);
        }
      }
    });
  };

  return {
    artifactsWritten,
    dropArtifacts,
    sourceMoved,
    artifactListeners: {
      onArtifactsGone: (listener) => {
        goneListeners.add(listener);
      },
      onArtifactsWritten: (listener) => {
        writtenListeners.add(listener);
      },
      onSourceMoved: (listener) => {
        movedListeners.add(listener);
      },
    },
  };
};

/**
 * What the preview server reads of the hub's database: on a connection of
 * its own, opened read-only, beside the hub's writer ("readers do not block
 * writers and a writer does not block readers", sqlite.org/wal.html). Each
 * read is by key: an origin's port rows and the mode, one artifact, the
 * artifact a session's panel shows, one pass, one document.
 */
import { Database } from "bun:sqlite";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { DB_PATH } from "../config";
import { type ArtifactDocumentRow, documentOf } from "../db/artifact-documents";
import { type ArtifactRow, artifactOf } from "../db/artifacts";
import { previewPassesDb } from "../db/preview-passes";
import {
  artifactOrigin,
  originOfKey,
  previewsDb,
  projectOfOrigin,
  projectOrigin,
} from "../db/previews";
import { artifactDocuments, artifacts, shownPreviews } from "../db/schema";

/** How long a read waits out the hub's write lock, ms: a checkpoint's. Our call. */
const BUSY_MS = 2000;

export const openPreviewStore = (path = DB_PATH) => {
  const client = new Database(path, { readonly: true });
  client.run(`PRAGMA busy_timeout = ${BUSY_MS}`);
  const db = drizzle({ client });
  const previews = previewsDb(db);
  const passes = previewPassesDb(db);

  const artifact = (id: string): ArtifactRow | undefined => {
    const row = db.select().from(artifacts).where(eq(artifacts.id, id)).get();
    return row && artifactOf(row);
  };

  const byOrigin = (origin: string): ArtifactRow | undefined => {
    const row = db
      .select()
      .from(artifacts)
      .where(eq(artifacts.origin, origin))
      .get();
    return row && artifactOf(row);
  };

  /** Whether one of the pages `owner` names (a session's, a project's) shows piece `piece` (its document's `shows`). */
  const pageOfShows = (
    owner: { instanceId: string } | { projectId: string },
    piece: string
  ): boolean =>
    db
      .select({ id: artifacts.id })
      .from(artifacts)
      .innerJoin(
        artifactDocuments,
        eq(artifactDocuments.artifactId, artifacts.id)
      )
      .where(
        and(
          "instanceId" in owner
            ? eq(artifacts.instanceId, owner.instanceId)
            : eq(artifacts.projectId, owner.projectId),
          eq(artifacts.kind, "page"),
          sql`EXISTS (SELECT 1 FROM json_each(${artifactDocuments.shows}) WHERE json_each.value = ${piece})`
        )
      )
      .get() !== undefined;

  /** The project whose origin serves artifact `row` (a project's page, not a held version); undefined for anything else (hub artifact-pages.ts `pageProject`). */
  const pageProject = (row: ArtifactRow): string | undefined =>
    row.kind === "page" && row.projectId !== null && row.heldFor === null
      ? row.projectId
      : undefined;

  /** The artifact session `instanceId`'s panel shows; undefined while it shows none. */
  const shownBy = (instanceId: string): string | undefined =>
    db
      .select({ id: shownPreviews.artifactId })
      .from(shownPreviews)
      .where(eq(shownPreviews.instanceId, instanceId))
      .get()?.id;

  return {
    /** Every origin's port and the fleet's mode, as the hub keeps them (db/previews.ts). */
    ports: () => previews.ports(),
    settings: () => previews.settings(),
    /** The live pass `tokenHash` names that opens origin `key` (db/preview-passes.ts `live`). */
    live: passes.live,
    artifact,
    document: (id: string): ArtifactDocumentRow | undefined =>
      documentOf(db, id),
    /** The key of the origin that serves artifact `row` (hub artifact-pages.ts `originKeyOf`). */
    originOf: (row: ArtifactRow): string | undefined => {
      const project = pageProject(row);
      return project ? projectOrigin(project) : (row.instanceId ?? undefined);
    },
    /**
     * The artifact origin `key` shows now: a machine artifact's own
     * origin's, the row that points at it; a session's, its panel's
     * artifact (hub server.ts `rowAt`).
     */
    rowAt: (key: string): ArtifactRow | undefined => {
      const origin = originOfKey(key);
      if (origin !== null) {
        return byOrigin(origin);
      }
      const shown = shownBy(key);
      return shown === undefined ? undefined : artifact(shown);
    },
    /**
     * Whether origin `key` serves artifact `id` by its id (hub server.ts
     * `servedOn`): the origin that serves it or its own; a session's origin
     * also what its panel shows, or what one of its pages' pieces shows, a
     * project's page excepted; a project's origin also its canvases, and
     * what one of its pages' pieces shows.
     */
    servedOn: (id: string, key: string): boolean => {
      const row = artifact(id);
      if (!row) {
        return false;
      }
      const project = pageProject(row);
      const own = project
        ? projectOrigin(project)
        : (row.instanceId ?? undefined);
      if (own === key || artifactOrigin(row.origin) === key) {
        return true;
      }
      const piece = row.heldFor ?? id;
      const ofProject = projectOfOrigin(key);
      if (ofProject !== null) {
        return (
          (row.kind === "canvas" && row.projectId === ofProject) ||
          pageOfShows({ projectId: ofProject }, piece)
        );
      }
      return (
        !project &&
        originOfKey(key) === null &&
        (shownBy(key) === id || pageOfShows({ instanceId: key }, piece))
      );
    },
    close: () => client.close(),
  };
};

export type PreviewStore = ReturnType<typeof openPreviewStore>;

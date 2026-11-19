/**
 * What a page's or a canvas's document carries of the hub's state
 * (schema.ts `artifactDocuments`): the hub writes a row whenever the
 * artifact's doc, its row or what its pages show moves (artifact-documents.ts),
 * and the preview server reads it by key on its own read-only connection
 * (preview-server/store.ts), so an open is one keyed read.
 */
import { eq, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { artifactDocuments } from "./schema";

export type ArtifactDocumentRow = typeof artifactDocuments.$inferSelect;

export interface ArtifactDocumentsDb {
  /** Artifact `id`'s document as last built; undefined while none was. */
  readonly get: (id: string) => ArtifactDocumentRow | undefined;
  /** Artifact `row.artifactId`'s document built: the one it had replaced. */
  readonly keep: (row: ArtifactDocumentRow) => void;
  /** The pages whose documents name `id` among what they show: each is built again as `id` moves. */
  readonly showing: (id: string) => string[];
}

/** The pages whose documents show `id` (their `shows` JSON array names it). */
const pagesShowing = (
  db: Pick<BunSQLiteDatabase, "select">,
  id: string
): string[] =>
  db
    .select({ id: artifactDocuments.artifactId })
    .from(artifactDocuments)
    .where(
      sql`EXISTS (SELECT 1 FROM json_each(${artifactDocuments.shows}) WHERE json_each.value = ${id})`
    )
    .all()
    .map((row) => row.id);

/** Artifact `id`'s document row, on any connection (the preview server's is read-only). */
export const documentOf = (
  db: Pick<BunSQLiteDatabase, "select">,
  id: string
): ArtifactDocumentRow | undefined =>
  db
    .select()
    .from(artifactDocuments)
    .where(eq(artifactDocuments.artifactId, id))
    .get();

export const artifactDocumentsDb = (
  db: BunSQLiteDatabase
): ArtifactDocumentsDb => ({
  get: (id) => documentOf(db, id),
  keep: (row) => {
    db.insert(artifactDocuments)
      .values(row)
      .onConflictDoUpdate({ target: artifactDocuments.artifactId, set: row })
      .run();
  },
  showing: (id) => pagesShowing(db, id),
});

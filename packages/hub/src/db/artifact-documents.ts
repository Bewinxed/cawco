/**
 * What a page's or a canvas's document carries of the hub's state
 * (schema.ts `artifactDocuments`): the hub writes a row whenever the
 * artifact's row or what its pages show moves, and when the preview server
 * finds one read from a doc that moved since ({@link documentStands};
 * artifact-documents.ts), and the preview server reads it by key on its own
 * read-only connection (preview-server/store.ts).
 */
import { eq, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { z } from "zod";
import { artifactDocuments, artifacts } from "./schema";

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

const SeqsSchema = z.record(z.string(), z.number());

/**
 * Whether document `row` stands, on any connection: every doc it was read
 * from (`seqs`) is at the seq it read, by one keyed read each. One that
 * names no seq of its own (built before `seqs` was kept) never does.
 */
export const documentStands = (
  db: Pick<BunSQLiteDatabase, "select">,
  row: ArtifactDocumentRow
): boolean => {
  let seqs: Record<string, number>;
  try {
    seqs = SeqsSchema.parse(JSON.parse(row.seqs));
  } catch {
    return false;
  }
  return (
    Object.hasOwn(seqs, row.artifactId) &&
    Object.entries(seqs).every(
      ([id, seq]) =>
        db
          .select({ seq: artifacts.seq })
          .from(artifacts)
          .where(eq(artifacts.id, id))
          .get()?.seq === seq
    )
  );
};

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

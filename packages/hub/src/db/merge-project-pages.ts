/**
 * A project's page is the project's by its name (migration 0275's
 * `artifacts_project_page`): before it, each session kept its own row of a
 * name, so a project could hold one page under several rows, each with the
 * picks made on it. Before that migration runs, each such name's rows are
 * folded into its newest (the page the graph read), once: its doc takes
 * every pick and place an older row holds that it lacks, or holds earlier,
 * as one update of its own, and the older rows go with their logs.
 *
 * The picks are entries of each row's Yjs doc (artifacts/docs.ts), which
 * SQL cannot read, so this runs as code on the connection, beside the
 * migrator, with foreign keys off as the migrator has them: every row an
 * older artifact's id keys is deleted here by name.
 */
import type { Database } from "bun:sqlite";
import { applyUpdate, Doc, encodeStateAsUpdate, encodeStateVector } from "yjs";
import { z } from "zod";

interface PageRow {
  created_at: number;
  id: string;
  name: string;
  project_id: string;
  seq: number;
}

/** A page's state entry as far as the fold reads it: when it was made; every other field kept as it is. */
const EntryShape = z.looseObject({ at: z.string().optional() });
/** A page's state, each entry by its key. */
const Entries = z.record(z.string(), EntryShape);

/** An artifact's doc, loaded from its update log in order (drop-graph-places.ts reads it too). */
export const docOf = (client: Database, id: string): Doc => {
  const doc = new Doc();
  const updates = client
    .query<{ update: Uint8Array }, [string]>(
      'SELECT "update" FROM artifact_updates WHERE artifact_id = ? ORDER BY seq'
    )
    .all(id);
  for (const { update } of updates) {
    applyUpdate(doc, update);
  }
  return doc;
};

/** Whether the database has no artifacts at all: nothing to fold. Called only in a start that applies 0275 (db/migrate.ts). */
const settled = (client: Database): boolean =>
  client
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('artifacts')"
    )
    .all().length < 1;

/** An artifact's rows by its id, and its held next version's: its log, its keys' changes, the panel that shows it. */
const dropRow = (client: Database, id: string): void => {
  const held = client
    .query<{ id: string }, [string]>(
      "SELECT id FROM artifacts WHERE held_for = ?"
    )
    .all(id);
  for (const one of held) {
    dropRow(client, one.id);
  }
  client.run("DELETE FROM artifact_updates WHERE artifact_id = ?", [id]);
  client.run("DELETE FROM artifact_changes WHERE artifact_id = ?", [id]);
  client.run("DELETE FROM shown_previews WHERE artifact_id = ?", [id]);
  client.run("DELETE FROM artifacts WHERE id = ?", [id]);
};

/**
 * One name's rows folded into `newest`: every pick and place an older row
 * holds that it lacks, or holds earlier, taken in as one update of its own;
 * the older rows gone. How many picks it took in.
 */
const foldInto = (
  client: Database,
  newest: PageRow,
  older: PageRow[]
): number => {
  const doc = docOf(client, newest.id);
  const before = encodeStateVector(doc);
  const state = doc.getMap("state");
  const taken = new Set<string>();
  doc.transact(() => {
    for (const row of older) {
      const theirs = Entries.parse(
        docOf(client, row.id).getMap("state").toJSON()
      );
      for (const [key, entry] of Object.entries(theirs)) {
        const ours = EntryShape.safeParse(state.get(key)).data;
        if (!ours || (entry.at ?? "") > (ours.at ?? "")) {
          state.set(key, entry);
          taken.add(key);
        }
      }
    }
  });
  if (taken.size > 0) {
    const seq = newest.seq + 1;
    client.run(
      'INSERT INTO artifact_updates (artifact_id, seq, "update") VALUES (?, ?, ?)',
      [newest.id, seq, encodeStateAsUpdate(doc, before)]
    );
    for (const key of taken) {
      client.run(
        `INSERT INTO artifact_changes (artifact_id, key, seq, by) VALUES (?, ?, ?, 'person')
         ON CONFLICT (artifact_id, key) DO UPDATE SET seq = excluded.seq, by = excluded.by`,
        [newest.id, key, seq]
      );
    }
    client.run("UPDATE artifacts SET seq = ? WHERE id = ?", [seq, newest.id]);
  }
  for (const row of older) {
    dropRow(client, row.id);
  }
  return taken.size;
};

/**
 * Folds each project page name's rows into its newest, in one transaction;
 * how many older rows went. Nothing once 0275 is applied.
 */
export const mergeProjectPages = (client: Database): number => {
  if (settled(client)) {
    return 0;
  }
  const rows = client
    .query<PageRow, []>(
      `SELECT id, project_id, name, seq, created_at FROM artifacts
       WHERE kind = 'page' AND project_id IS NOT NULL AND held_for IS NULL
       ORDER BY project_id, name, created_at DESC`
    )
    .all();
  const groups = new Map<string, PageRow[]>();
  for (const row of rows) {
    const key = `${row.project_id}\n${row.name}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  let folded = 0;
  // Immediate, as every transaction on the hub's file (db/index.ts `make`).
  client
    .transaction(() => {
      for (const [newest, ...older] of groups.values()) {
        if (!newest || older.length === 0) {
          continue;
        }
        const picks = foldInto(client, newest, older);
        folded += older.length;
        console.info(
          `[artifacts] project ${newest.project_id}'s page ${newest.name}: ${older.length} older row${older.length === 1 ? "" : "s"} folded into ${newest.id}, ${picks} pick${picks === 1 ? "" : "s"} taken in.`
        );
      }
    })
    .immediate();
  return folded;
};

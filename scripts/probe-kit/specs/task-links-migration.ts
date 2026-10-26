/**
 * The task links cutover on a copy of the live hub (drizzle 0324 and tasks.ts
 * `migrateLinks`): the live database copied by `VACUUM INTO`, every project
 * folder cloned beside it, and this checkout's hub opened on the copy
 * (hub scripts/task-links-migration-hub.ts), its boot work rewriting the folders. The
 * live database and folders are only read. Edges by kind are counted in the
 * index and in the files, before and after.
 *
 * a. Every `after` edge is a `waits_on` edge, in the files and the index.
 * b. Every `parent` is a `part_of`.
 * c. No file carries `after`, `parent` or `related`; the index keeps no
 *    `after` or `related` edge; each task that had related links has a
 *    See also comment.
 *
 * Run on the hub's own machine: it reads the live hub's data.
 *
 *   bun scripts/probe-kit/run.ts task-links-migration
 */
import { Database } from "bun:sqlite";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { hubDbPath, hubProjectsDir } from "../../../packages/core/src/paths";
import { taskLinkWords } from "../../../packages/core/src/words/task-links";
import type { Kit, Spec } from "../kit";
import { literal } from "../words";

const KEYS = ["after", "parent", "related", "waits_on", "part_of"] as const;
type Key = (typeof KEYS)[number];

interface Counts {
  /** Edges in the board's task files, by key; archived files apart. */
  board: Record<Key, number>;
  /** Edges in every task file, by key. */
  files: Record<Key, number>;
  /** Index edges by kind, and tasks with a whole (`part_of`, or `parent` before 0324). */
  index: Partial<Record<string, number>>;
  /** Tasks whose file names related links (before), See also comments (after). */
  related: number;
  seeAlso: number;
}

const LIST_EDGES = /^[a-z_]+:\s*\[?|\]\s*$/g;
const LEGACY = /^(after|parent|related):/m;
const SEE_ALSO = new RegExp(`^${literal(taskLinkWords.seeAlso)} `, "gm");

const zero = (): Record<Key, number> => ({
  after: 0,
  parent: 0,
  related: 0,
  waits_on: 0,
  part_of: 0,
});

/** A task file's front matter lines. */
const frontOf = (text: string): string[] =>
  (text.split("\n---")[0] ?? "").split("\n");

/** One front matter key's items in a task file: a list's, or one scalar. */
const itemsOf = (front: string[], key: string): number => {
  const line = front.find((each) => each.startsWith(`${key}:`));
  return line
    ? line
        .replace(LIST_EDGES, "")
        .split(",")
        .filter((item) => item.trim()).length
    : 0;
};

/** Every task file of a folder, archived or not. */
const taskFiles = (folder: string): { archived: boolean; text: string }[] =>
  ["tasks", "tasks/archive"].flatMap((dir) => {
    const at = join(folder, dir);
    return existsSync(at)
      ? readdirSync(at)
          .filter((name) => name.endsWith(".md"))
          .map((name) => ({
            archived: dir !== "tasks",
            text: readFileSync(join(at, name), "utf8"),
          }))
      : [];
  });

/** The index's edges by kind, and its tasks with a whole. */
const indexOf = (db: string): Partial<Record<string, number>> => {
  const sql = new Database(db, { readonly: true });
  const index: Partial<Record<string, number>> = {};
  for (const row of sql
    .query<{ kind: string; n: number }, []>(
      "SELECT kind, count(*) AS n FROM project_task_edges GROUP BY kind"
    )
    .all()) {
    index[row.kind] = row.n;
  }
  const column = sql
    .query<{ name: string }, []>("PRAGMA table_info(project_tasks)")
    .all()
    .some((one) => one.name === "part_of")
    ? "part_of"
    : "parent";
  index[column] =
    sql
      .query<{ n: number }, []>(
        `SELECT count(*) AS n FROM project_tasks WHERE ${column} IS NOT NULL`
      )
      .get()?.n ?? 0;
  sql.close();
  return index;
};

const count = (db: string, folders: string[]): Counts => {
  const counts: Counts = {
    board: zero(),
    files: zero(),
    index: indexOf(db),
    related: 0,
    seeAlso: 0,
  };
  for (const { archived, text } of folders.flatMap(taskFiles)) {
    const front = frontOf(text);
    for (const key of KEYS) {
      const n = itemsOf(front, key);
      counts.files[key] += n;
      counts.board[key] += archived ? 0 : n;
    }
    counts.related += itemsOf(front, "related") > 0 ? 1 : 0;
    counts.seeAlso += (text.match(SEE_ALSO) ?? []).length;
  }
  return counts;
};

/** The live database copied, and every project folder cloned beside it. */
const copyLive = async (
  scratch: string
): Promise<{ db: string; folders: string[] }> => {
  const db = join(scratch, "cawco.db");
  const live = new Database(hubDbPath(), { readonly: true });
  live.run("VACUUM INTO ?", [db]);
  live.close();
  const ids = readdirSync(hubProjectsDir()).filter((id) =>
    existsSync(join(hubProjectsDir(), id, ".git"))
  );
  const folders = ids.map((id) => join(scratch, "projects", id));
  await Promise.all(
    ids.map((id, at) =>
      Bun.$`git clone -q ${join(hubProjectsDir(), id)} ${folders[at]}`.quiet()
    )
  );
  return { db, folders };
};

const run = async (kit: Kit) => {
  const scratch = join(kit.out, "copy");
  const home = join(scratch, "home");
  await mkdir(join(scratch, "projects"), { recursive: true });
  await mkdir(home, { recursive: true });
  const { db, folders } = await copyLive(scratch);
  const before = count(db, folders);
  kit.note(`before: ${JSON.stringify(before)}`);
  const legacy = folders.filter((folder) =>
    taskFiles(folder).some(({ text }) => LEGACY.test(frontOf(text).join("\n")))
  );
  const child = Bun.spawn(
    [
      process.execPath,
      join(
        import.meta.dir,
        "../../../packages/hub/scripts/task-links-migration-hub.ts"
      ),
      db,
      home,
      join(scratch, "projects"),
      ...legacy,
    ],
    { stdout: "ignore", stderr: "ignore" }
  );
  await child.exited;
  const after = count(db, folders);
  kit.note(`after: ${JSON.stringify(after)}`);
  kit.check(
    "a: every after edge is a waits_on edge, in the files and the index",
    after.files.after === 0 &&
      after.files.waits_on === before.files.after + before.files.waits_on &&
      (after.index.after ?? 0) === 0 &&
      after.index.waits_on === after.board.waits_on,
    `files: ${before.files.after} after → ${after.files.waits_on} waits_on; index: ${JSON.stringify(before.index)} → ${JSON.stringify(after.index)}`
  );
  kit.check(
    "b: every parent is a part_of",
    after.files.parent === 0 && after.files.part_of === before.files.parent,
    `${before.files.parent} parent → ${after.files.part_of} part_of`
  );
  kit.check(
    "c: related links are See also comments, one per task, and gone from the index",
    after.files.related === 0 &&
      (after.index.related ?? 0) === 0 &&
      after.seeAlso - before.seeAlso === before.related,
    `${before.files.related} related links in ${before.related} tasks → ${after.seeAlso - before.seeAlso} See also comments`
  );
};

export default {
  name: "task-links-migration",
  host: "it reads the live hub's database and project folders, outside every workspace",
  run,
} satisfies Spec;

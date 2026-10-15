/**
 * `bun run migrations:check` in packages/hub (part of the root typecheck):
 * every migration applies to a realistic database, and the hub opened on it
 * answers. The database is fixtures/realistic-db.sqlite.gz (fixture-db.ts):
 * a seeded scratch fleet's, at a published nightly's schema, so every
 * migration added since runs over real row shapes, as it will on a hub
 * updating from that nightly. A table the fixture had rows in must still
 * have rows: a migration that empties one is caught here.
 */
import { Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { hubInProcess } from "./hub-in-process";

const started = performance.now();
const HUB = resolve(import.meta.dir, "..");
const FIXTURE = join(HUB, "fixtures", "realistic-db.sqlite.gz");
const scratch = mkdtempSync(join(tmpdir(), "cawco-migrations-"));

/**
 * Rows in every table, and how many migrations the database records.
 * Opened read-write, on the scratch copy only: the fixture is a WAL database
 * (it was a hub's), and a read-only open of one with no -shm beside it is
 * refused (SQLITE_CANTOPEN on macOS's SQLite). Read-write also reads what
 * the hub left in the WAL after it closed, which `immutable` would not.
 */
const read = (path: string) => {
  const sqlite = new Database(path, { readwrite: true });
  const tables = sqlite
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
    )
    .all()
    .map(({ name }) => name);
  const rows = new Map(
    tables.map((name) => [
      name,
      sqlite
        .query<{ n: number }, []>(`SELECT count(*) AS n FROM "${name}"`)
        .get()?.n ?? 0,
    ])
  );
  sqlite.close();
  return { rows, migrations: rows.get("__drizzle_migrations") ?? 0 };
};

try {
  const dbPath = join(scratch, "hub.db");
  mkdirSync(join(scratch, "home"));
  await Bun.write(
    dbPath,
    Bun.gunzipSync(new Uint8Array(await Bun.file(FIXTURE).arrayBuffer()))
  );
  const before = read(dbPath);
  const { hub, lifetime } = await hubInProcess(dbPath, join(scratch, "home"));
  const answers: string[] = [];
  const answer = async (path: string): Promise<unknown> => {
    const response = await hub.handle(new Request(`http://127.0.0.1${path}`));
    const text = await response.text();
    if (!response.ok) {
      throw new Error(
        `GET ${path} answered ${response.status}: ${text.slice(0, 300)}`
      );
    }
    answers.push(path);
    return JSON.parse(text);
  };
  const projects = (await answer("/api/projects")) as { id: string }[];
  await answer("/api/instances");
  await answer("/api/agents");
  const project = projects[0]?.id;
  if (!project) {
    throw new Error("The hub lists no project from the fixture's 12");
  }
  await answer(`/api/projects/${project}/tasks`);
  await answer(`/api/projects/${project}/threads`);
  lifetime.close();
  const after = read(dbPath);
  const journal = (
    (await Bun.file(join(HUB, "drizzle/meta/_journal.json")).json()) as {
      entries: unknown[];
    }
  ).entries.length;
  if (after.migrations !== journal) {
    throw new Error(
      `The database records ${after.migrations} migrations; this commit has ${journal}`
    );
  }
  const emptied = [...before.rows]
    .filter(([name, n]) => n > 0 && (after.rows.get(name) ?? 0) === 0)
    .map(([name]) => name);
  if (emptied.length) {
    throw new Error(
      `A migration emptied ${emptied.join(", ")}, which the fixture had rows in`
    );
  }
  const seeded = [...before.rows.values()].reduce((sum, n) => sum + n, 0);
  console.log(
    `migrations:check: ${journal - before.migrations} migration${journal - before.migrations === 1 ? "" : "s"} applied over ${seeded} fixture rows; the hub answered ${answers.join(", ")}; ${((performance.now() - started) / 1000).toFixed(1)} s`
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
process.exit(0);

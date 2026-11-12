import { Database } from "bun:sqlite";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { hubDbPath } from "../../../packages/core/src/paths";
import type { Runner } from "../binary-tests";
import { alone } from "./shared";

/**
 * How long the live database's check may run: it passes in about 3 s, and
 * one whose hub never answered sat at 100% CPU for 24 minutes, holding
 * the archives and promotion (nightly 0e08f76f8, 2026-11-04). Our call: far
 * past any real database's migrations, short enough that a hang fails the
 * release while its run is still watched.
 */
const LIVE_DATABASE_LIMIT_S = 180;

/**
 * The hub's own database, migrated by this build before it ships: a copy of
 * the live one on this host (`VACUUM INTO`, a consistent snapshot, as the
 * update helper takes it, cli binary-apply.ts), checked by
 * `migrations:check --db` (hub migrations-check.ts), which never writes the
 * copy it is given. A host with no hub database has nothing to check, and
 * says so; the check's own migrations:check runs over the fixture there.
 */
export const liveDatabase = async (
  run: Runner,
  checkout: string,
  staging: string
): Promise<void> => {
  const live = hubDbPath();
  if (!(await Bun.file(live).exists())) {
    console.log(
      `No hub database on this host at ${live}: the live database's migration check does not run`
    );
    return;
  }
  await mkdir(staging, { recursive: true });
  const copy = join(staging, "live-database.sqlite");
  await rm(copy, { force: true });
  const handle = new Database(live, { readonly: true });
  try {
    handle.run(`VACUUM INTO '${copy.replaceAll("'", "''")}'`);
  } finally {
    handle.close();
  }
  try {
    await run(
      [process.execPath, "run", "migrations:check", "--db", copy],
      join(checkout, "packages/hub"),
      false,
      {},
      {
        seconds: LIVE_DATABASE_LIMIT_S,
        why: "The check's hub started on a copy of the live database and never answered: run the same check on a copy (`bun run migrations:check --db <copy>` in packages/hub) and read where it spins.",
      }
    );
  } finally {
    await rm(copy, { force: true });
  }
};

await alone(
  import.meta,
  "bun scripts/release/steps/live-database.ts --commit SHA [--staging DIR] [--checkout DIR]\n  The hub's database copied and migrated by this build's migrations:check.",
  ({ run, trees, staging }) => liveDatabase(run, trees.build, staging)
);

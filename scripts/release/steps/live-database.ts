import { Database } from "bun:sqlite";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { installedHubDbPath } from "../../../packages/cli/src/service";
import { readInstallation } from "../../../packages/core/src/binary-installation";
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
 * The database this release will migrate: the one hub of the fleet, the
 * only database that holds migrations (a joined machine keeps none). The
 * hub this host's installation names is the hub the release announces to
 * and updates (release-announce.ts); a release runs on that hub's own
 * machine, as its `Ship:` command does (hub ship.ts), since only there can
 * its database be read. Its file is the one the hub's installed unit opens
 * (cli service.ts `installedHubDbPath`, from the unit's recorded
 * environment), never this process's own `hubDbPath`: the release runs in a
 * unit of its own with only PATH and HOME set (ship.sh). Anything else is
 * refused, with why.
 */
export const liveHubDatabase = async (): Promise<
  { path: string } | { refused: string }
> => {
  const installation = await readInstallation();
  if (!installation) {
    return {
      refused:
        "this host has no CawCo installation, so it names no hub whose database the release will migrate: release from the hub's machine",
    };
  }
  if (installation.role !== "hub") {
    return {
      refused: `this host is a machine joined to the hub at ${installation.hubUrl}, and the release migrates that hub's database, which is read only on its own machine: release from there`,
    };
  }
  const path = await installedHubDbPath();
  if (!path) {
    return {
      refused:
        "this host's installation is the hub's, but no hub unit is installed to name its database",
    };
  }
  if (!(await Bun.file(path).exists())) {
    return {
      refused: `the hub's installed unit opens ${path}, and there is no database there`,
    };
  }
  return { path };
};

/**
 * The hub's own database, migrated by this build before it ships: a copy of
 * the live one ({@link liveHubDatabase}, `VACUUM INTO`, a consistent
 * snapshot, as the update helper takes it, cli binary-apply.ts), checked by
 * `migrations:check --db` (hub migrations-check.ts), which never writes the
 * copy it is given. A host that is not the hub's fails the step, saying why;
 * release.ts refuses such a run before anything is built.
 */
export const liveDatabase = async (
  run: Runner,
  checkout: string,
  staging: string
): Promise<void> => {
  const live = await liveHubDatabase();
  if ("refused" in live) {
    throw new Error(`The live database's migration check: ${live.refused}`);
  }
  await mkdir(staging, { recursive: true });
  const copy = join(staging, "live-database.sqlite");
  await rm(copy, { force: true });
  const handle = new Database(live.path, { readonly: true });
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

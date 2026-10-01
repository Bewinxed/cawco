import { existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Where every hub before C9 wrote its sqlite file: straight into the checkout,
 * next to this package's `package.json`. Found relative to this module rather
 * than to `process.cwd()` so the check is the same whether the hub was started
 * by hand, by `bun --watch`, or as a service — none of which are guaranteed to
 * be run from this directory.
 */
export const LEGACY_DB_PATH = fileURLToPath(
  new URL("../cawco.db", import.meta.url)
);

/**
 * The one-time C9 cutover. Older units (and bare `bun run hub`) left the fleet's
 * whole memory sitting inside a git checkout, where a single `git clean -fdx`
 * could delete it. If nothing has been written to the new location yet but the
 * old file is still in the tree, move it — and its `-wal`/`-shm` companions, so
 * a hub mid-checkpoint doesn't lose uncommitted writes — before anything opens
 * either path. Once a target file exists this is forever a no-op, so a legacy
 * file reappearing later (a restored backup, a stray checkout) is left alone
 * rather than clobbering a live target.
 *
 * Lives in its own module so `cawco deploy init` can run it too. The hub only
 * ever finds the legacy file relative to ITSELF, and a deployment clone is a
 * different checkout from the one that has been writing the database — so from
 * the clone the module-relative guess points at a file that was never there,
 * the migration silently no-ops, and the hub comes up on an empty database
 * beside a full one. The deploy is the only place that knows both ends.
 */
export const migrateLegacyDb = (
  target: string,
  legacy: string = LEGACY_DB_PATH
): void => {
  if (existsSync(target) || !existsSync(legacy)) {
    return;
  }
  mkdirSync(dirname(target), { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) {
    const from = `${legacy}${suffix}`;
    if (existsSync(from)) {
      renameSync(from, `${target}${suffix}`);
    }
  }
};

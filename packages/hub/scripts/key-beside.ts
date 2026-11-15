/**
 * The hub key of a database a script reads (a copy of a live hub's, or a
 * fixture unpacked), found as migrations:check `--db` finds it:
 * `secrets.key` beside the database, copied into a scratch folder this
 * removes, never written beside the database; no other place is looked in.
 * The hub's box reads its key beside CAWCO_DB_PATH (secret-box.ts), so the
 * scratch folder's is set before the script loads any of the hub's modules.
 * With no key there, `keyed` is false, and a script that opens nothing then
 * makes no key either.
 */
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

/** The database `name`'s script was given on its command line; it exits naming how to call it when none was. */
export const databaseNamed = (name: string): string => {
  const [path] = process.argv.slice(2);
  if (!path) {
    console.error(`${name}: name the database: bun run ${name} <path>`);
    process.exit(2);
  }
  return path;
};

/** The key beside `path` set up as the hub's (module): whether there was one, and the scratch folder's removal, for the script's `finally`. */
export const keyBeside = (
  path: string
): { keyed: boolean; remove: () => void } => {
  const scratch = mkdtempSync(join(tmpdir(), "cawco-key-beside-"));
  const key = join(dirname(resolve(path)), "secrets.key");
  const keyed = existsSync(key);
  if (keyed) {
    copyFileSync(key, join(scratch, "secrets.key"));
    chmodSync(join(scratch, "secrets.key"), 0o600);
  }
  process.env.CAWCO_DB_PATH = join(scratch, "hub.db");
  return {
    keyed,
    remove: () => rmSync(scratch, { recursive: true, force: true }),
  };
};

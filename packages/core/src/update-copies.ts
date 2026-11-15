/**
 * The files the update helper writes beside the hub's database (cli
 * binary-apply.ts), by their names: THE ONE MATCHER, read by the helper,
 * which keeps one of each kind, and by the hub's start, which names the copy
 * from before an update when it does not open the database (migration-state.ts).
 */
import { readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/**
 * Every file SQLite keeps beside a database: the WAL and its shared-memory
 * index (the hub's own mode, hub db/wal.ts), and the rollback journal a build
 * before WAL left, or a hub of one killed mid-write. Each belongs to the one
 * file beside it; left beside another, SQLite plays it into that one
 * ("database disk image is malformed").
 */
export const SIDECARS = ["-journal", "-wal", "-shm"] as const;

/**
 * A build's version as the release step writes it (semver: `0.1.12-nightly.
 * 7813+7237c78f0f23`, the test's `0.0.1-test.8`): the part of a file's name
 * the update helper writes.
 */
const VERSION = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?`;

/**
 * The files the update helper wrote beside the database `db`, of one kind,
 * each with the database file it belongs to (its own name, less a sidecar's
 * suffix): `pre`, the copies taken before an update (`<db>.pre-<version>.bak`);
 * `migrated`, the databases a rollback moved aside (`<db>.migrated-<version>`).
 * Matched by those names exactly: every other file in the folder (a person's
 * own copies among them) is never one of these.
 */
export const updaterFiles = (
  db: string,
  kind: "pre" | "migrated"
): { file: string; name: string }[] => {
  const base = basename(db).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const own = new RegExp(
    kind === "pre"
      ? `^${base}\\.pre-${VERSION}\\.bak$`
      : `^${base}\\.migrated-${VERSION}$`,
    "u"
  );
  const folder = dirname(db);
  const names = statSync(folder, { throwIfNoEntry: false })
    ? readdirSync(folder)
    : [];
  return names.flatMap((name) => {
    const suffix = SIDECARS.find((one) => name.endsWith(one));
    const file = suffix ? name.slice(0, -suffix.length) : name;
    return own.test(file) ? [{ file, name }] : [];
  });
};

/** The newest copy the update helper took before an update beside `db`, by its time; `undefined` when there is none. */
export const copyBeforeUpdate = (db: string): string | undefined =>
  updaterFiles(db, "pre")
    .filter(({ file, name }) => file === name)
    .map(({ name }) => join(dirname(db), name))
    .toSorted(
      (a, b) =>
        (statSync(a, { throwIfNoEntry: false })?.mtimeMs ?? 0) -
        (statSync(b, { throwIfNoEntry: false })?.mtimeMs ?? 0)
    )
    .at(-1);

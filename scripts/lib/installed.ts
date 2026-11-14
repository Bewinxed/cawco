/**
 * What `node_modules` was installed from, recorded by the install itself, so
 * `bun run check` can trust that the lockfile it keys a pass by is what is
 * installed.
 *
 * `bun install` puts in `node_modules` what `bun.lock` locks and `patches/`
 * changes ({@link INSTALL_READS}). The check keys every pass that loads or
 * runs an installed package by those files (lib/check-inputs.ts), which only
 * says what is installed while they are what the last install read. Bun keeps
 * no record of that and has no command to compare the two (pnpm's
 * `verifyDepsBeforeRun` is asked of it in oven-sh/bun#26975), so the root
 * package.json's `postinstall`, which Bun runs after it writes `bun.lock`,
 * on every install and from any workspace folder, records their key
 * ({@link recordInstall}), and the check refuses to start when the files no
 * longer match it ({@link installedOrExit}). A checkout whose `bun.lock` a
 * `git checkout`, a rebase or a `git rebase --exec` step moved is told to run
 * `bun install` instead of failing in the type check on a package it lacks,
 * or passing against the one it should no longer have.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ROOT } from "./repo-files";

/** The files an install reads, from the root: the lockfile, and every patch it applies (a folder ends `/`). */
export const INSTALL_READS = ["bun.lock", "patches/"] as const;

/** Where the install's key stands: inside the install, so a `node_modules` made afresh has none until its `postinstall`. */
const RECORD = join(ROOT, "node_modules/.cache/cawco/installed-from");

/** The files a read names, from the root: itself, or every file under a folder (none when it is gone). */
const filesUnder = (read: string): string[] => {
  if (!read.endsWith("/")) {
    return [read];
  }
  if (!existsSync(join(ROOT, read))) {
    return [];
  }
  return readdirSync(join(ROOT, read), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(ROOT.length + 1));
};

/** The key of {@link INSTALL_READS} as the checkout has them now. */
const installKey = (): string => {
  const hash = createHash("sha256");
  const paths = INSTALL_READS.flatMap(filesUnder).sort();
  for (const path of paths) {
    hash.update(path).update("\0");
    hash.update(
      existsSync(join(ROOT, path)) ? readFileSync(join(ROOT, path)) : "gone"
    );
    hash.update("\0");
  }
  return hash.digest("hex");
};

/** The root package.json's `postinstall`: records what this install read. */
export const recordInstall = async (): Promise<void> => {
  mkdirSync(dirname(RECORD), { recursive: true });
  await Bun.write(RECORD, `${installKey()}\n`);
};

/**
 * A run's first step when what it checks is keyed by the lockfile: with
 * `node_modules` installed from another `bun.lock` or `patches/` than the
 * checkout's (or before installs recorded theirs), it names the fix on
 * stderr and exits 1, starting nothing.
 */
export const installedOrExit = (what: string): void => {
  const recorded = existsSync(RECORD)
    ? readFileSync(RECORD, "utf8").trim()
    : undefined;
  if (recorded === installKey()) {
    return;
  }
  console.error(
    `${what}: node_modules was not installed from this checkout's bun.lock and patches/${
      recorded ? "" : " (no install has recorded what it read)"
    }. Run \`bun install\`, then \`${what}\` again.`
  );
  process.exit(1);
};

/**
 * The repository's files as the checks read them, and where its sources are:
 * one listing, git's, so no check walks a build, an install or anything else
 * the repository ignores, and one list of the source roots.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** The repository's root. */
export const ROOT = join(import.meta.dir, "..", "..");

/**
 * The repository's files as its checkout has them, relative to `cwd`
 * (the root by default), under `paths` when any are given: tracked ones and
 * new ones its ignore rules keep (`git ls-files --cached --others
 * --exclude-standard`), a tracked file deleted in the tree left out. Throws
 * git's words.
 */
export const repoFiles = (
  paths: readonly string[] = [],
  cwd = ROOT
): string[] => {
  const listed = Bun.spawnSync(
    [
      "git",
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      ...paths,
    ],
    { cwd, stdout: "pipe", stderr: "pipe" }
  );
  if (listed.exitCode !== 0) {
    throw new Error(
      `git ls-files in ${cwd} exited ${listed.exitCode}: ${listed.stderr.toString().trim()}`
    );
  }
  return listed.stdout
    .toString()
    .split("\0")
    .filter((file) => file && existsSync(join(cwd, file)));
};

/** Each app's and package's dir named `name` (`apps/dashboard/src`), where it has one. */
const memberDirs = (name: string): string[] =>
  ["apps", "packages"].flatMap((group) =>
    readdirSync(join(ROOT, group))
      .map((member) => `${group}/${member}/${name}`)
      .filter((dir) => existsSync(join(ROOT, dir)))
  );

/** Every app's and package's own source: what the product is built from. */
export const PRODUCT_SOURCES: readonly string[] = memberDirs("src");

/** Every source a check of the code reads: the product's, and each member's benches and scripts, and the repository's own scripts. */
export const CODE_ROOTS: readonly string[] = [
  ...PRODUCT_SOURCES,
  ...memberDirs("bench"),
  ...memberDirs("scripts"),
  "scripts",
];

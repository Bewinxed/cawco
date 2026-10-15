/**
 * What `bun run openapi:check` reads, so a check whose inputs are unchanged
 * since its last pass is skipped (it builds a hub and a TypeScript 5.9
 * program, 8–15 s, tooling-speed.md §C).
 *
 * The inputs, recorded here:
 * - every tracked or untracked-unignored file under {@link INPUT_DIRS}: the
 *   packages the hub's program reaches, and the outputs the check compares;
 * - {@link INPUT_FILES}: the lockfile (every node_modules type it reads), the
 *   shared tsconfig, the root manifest;
 * - every commit the wire is compared against: `--base` or the merge-base
 *   with origin/main, and each shipped build (shipped.ts: the tags of the
 *   newest nightly and of every TestFlight build still installable, so a new
 *   tag or an expiry changes the key).
 *
 * The list is held to the program: a run that builds it fails when one of the
 * program's files is outside these inputs and node_modules
 * ({@link outsideInputs}), so the list cannot fall behind silently.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { shippedBaselines } from "./shipped";

const HUB = resolve(import.meta.dir, "..");
const REPO = resolve(HUB, "../..");
const INPUT_DIRS = [
  "packages/auth",
  "packages/core",
  "packages/hub",
  "apps/apple/Packages/CawCoKit/Sources/CawCoAPI",
];
const INPUT_FILES = ["bun.lock", "tsconfig.base.json", "package.json"];
const STAMP = join(REPO, "node_modules/.cache/cawco/openapi-check.key");

const git = (...args: string[]): string => {
  const run = Bun.spawnSync(["git", ...args], { cwd: REPO });
  if (run.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")}: ${run.stderr.toString().trim()}`);
  }
  return run.stdout.toString().trim();
};

/** The commit the wire is compared against: `--base <ref>`, or the merge-base with origin/main. */
export const baseRefOf = (argv: string[]): string => {
  const flag = argv.indexOf("--base");
  const ref =
    flag >= 0 ? argv[flag + 1] : git("merge-base", "HEAD", "origin/main");
  if (!ref) {
    throw new Error("--base needs a git ref");
  }
  return ref;
};

/** The hash of every input's path and bytes, and of every commit the wire is compared against. */
const inputKey = async (baseRef: string): Promise<string> => {
  const bases = [
    { label: "base", commit: baseRef },
    ...shippedBaselines(HUB),
  ].map(
    ({ label, commit }) => `${label} ${git("rev-parse", `${commit}^{commit}`)}`
  );
  const paths = [
    ...git("ls-files", "-co", "--exclude-standard", "-z", "--", ...INPUT_DIRS)
      .split("\0")
      .filter(Boolean),
    ...INPUT_FILES,
  ].sort();
  // A tracked file deleted in the tree hashes as missing.
  const contents = await Promise.all(
    paths.map(async (path) => {
      const file = Bun.file(join(REPO, path));
      return (await file.exists())
        ? new Uint8Array(await file.arrayBuffer())
        : "\0missing\0";
    })
  );
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(`${bases.join("\n")}\0`);
  for (const [index, path] of paths.entries()) {
    hasher.update(`${path}\0`);
    hasher.update(contents[index]);
  }
  return hasher.digest("hex");
};

/** Whether the last passing check had these inputs, and how to record a pass. */
export const checkGate = async (
  argv: string[]
): Promise<{ fresh: boolean; record: () => Promise<void> }> => {
  const key = await inputKey(baseRefOf(argv));
  const last = await readFile(STAMP, "utf8").catch(() => "");
  return {
    fresh: last === key,
    record: async () => {
      await mkdir(dirname(STAMP), { recursive: true });
      await writeFile(STAMP, key);
    },
  };
};

/** The program's files that are neither an input nor under node_modules. */
export const outsideInputs = (fileNames: readonly string[]): string[] =>
  fileNames
    .map((file) => relative(REPO, file))
    .filter(
      (path) =>
        !(
          path.startsWith("..") ||
          path.includes("node_modules/") ||
          INPUT_DIRS.some((dir) => path.startsWith(`${dir}/`)) ||
          INPUT_FILES.includes(path)
        )
    );

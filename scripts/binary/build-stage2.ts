/**
 * Builds what prove-stage2.sh needs: a throwaway key pair, and nine real
 * linux-x64 builds of the repository's entry point with that key's public
 * half embedded as the release key. Usage:
 *   bun scripts/binary/build-stage2.ts /ABSOLUTE/OUTPUT/DIR
 *
 * Build 1, the one every proof machine is installed from, is built from
 * {@link BEFORE_SIDE_BY_SIDE}: the last commit whose machines run one session
 * keeper, `cawco-sessiond.service`, on the machine's endpoint itself, as the
 * fleet's machines were installed. Each machine's first update is then the
 * fleet's own: an older agent applies a build whose keeper runs beside its
 * own, and that build's agent hands the keeper over. Builds 2 to 9 are this
 * tree's.
 */
import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { buildBinary } from "../build-binary";

/** The commit before keepers ran side by side (packages/core/src/keepers.ts). */
const BEFORE_SIDE_BY_SIDE = "eedffee6d89def230ba998aae49f289269abab43";

const [, , output] = Bun.argv;
if (!output?.startsWith("/")) {
  throw new Error("Usage: bun scripts/binary/build-stage2.ts /absolute/output");
}
const run = async (argv: string[], cwd?: string) => {
  const child = Bun.spawn(argv, {
    stdout: "inherit",
    stderr: "inherit",
    ...(cwd ? { cwd } : {}),
  });
  if ((await child.exited) !== 0) {
    throw new Error(`${argv.join(" ")} failed`);
  }
};
const keys = join(output, "keys");
await run([
  process.execPath,
  join(import.meta.dir, "stage2-fixture.ts"),
  "keys",
  keys,
]);
const publicKey = (
  await Bun.file(join(keys, "test-release-public.pem")).text()
).trim();

// Build 1: that commit's own tree (a git worktree: its build reads git), its dependencies installed, built by its
// own build script; the worktree is removed once the build is made.
const repository = resolve(import.meta.dir, "../..");
const before = join(output, "before-side-by-side");
const removeBefore = async () => {
  await run([
    "git",
    "-C",
    repository,
    "worktree",
    "remove",
    "--force",
    before,
  ]).catch(() => undefined);
  await rm(before, { recursive: true, force: true });
  await run(["git", "-C", repository, "worktree", "prune"]);
};
await removeBefore();
await mkdir(output, { recursive: true });
await run([
  "git",
  "-C",
  repository,
  "worktree",
  "add",
  "--detach",
  before,
  BEFORE_SIDE_BY_SIDE,
]);
try {
  await run([process.execPath, "install", "--frozen-lockfile"], before);
  const { buildBinary: buildBefore } = (await import(
    join(before, "scripts/build-binary.ts")
  )) as { buildBinary: typeof buildBinary };
  await buildBefore({
    target: "linux-x64",
    outfile: join(output, "cawco-1"),
    version: "0.0.1-test.1",
    commit: "1111111111111111111111111111111111111111",
    testPublicKey: publicKey,
    stubHarness: true,
    prepare: true,
  });
} finally {
  await removeBefore();
}

const builds = [
  ["2", "0.0.1-test.2", "2222222222222222222222222222222222222222"],
  [
    "3",
    "0.0.1-nightly.3+333333333333",
    "3333333333333333333333333333333333333333",
  ],
  // Healthy builds further along the nightly channel, for the keeper checks: each full update, and the keeper handover in it, needs a build that is newer and answers as itself.
  [
    "4",
    "0.0.1-nightly.4+444444444444",
    "4444444444444444444444444444444444444444",
  ],
  [
    "5",
    "0.0.1-nightly.5+555555555555",
    "5555555555555555555555555555555555555555",
  ],
  [
    "6",
    "0.0.1-nightly.6+666666666666",
    "6666666666666666666666666666666666666666",
  ],
  [
    "7",
    "0.0.1-nightly.7+777777777777",
    "7777777777777777777777777777777777777777",
  ],
  [
    "8",
    "0.0.1-nightly.8+888888888888",
    "8888888888888888888888888888888888888888",
  ],
  [
    "9",
    "0.0.1-nightly.9+999999999999",
    "9999999999999999999999999999999999999999",
  ],
] as const;
for (const [index, [name, version, commit]] of builds.entries()) {
  // biome-ignore lint/performance/noAwaitInLoops: one compile at a time bounds memory
  await buildBinary({
    target: "linux-x64",
    outfile: join(output, `cawco-${name}`),
    version,
    commit,
    testPublicKey: publicKey,
    stubHarness: true,
    prepare: index === 0,
  });
}
console.log(
  `Built ${builds.length + 1} binaries (build 1 from ${BEFORE_SIDE_BY_SIDE.slice(0, 8)}, before keepers ran side by side) and a throwaway key pair in ${output}`
);

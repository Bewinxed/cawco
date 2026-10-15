/**
 * Builds what prove-stage2.sh needs into OUTPUT: the proof's key pair and three
 * real linux-x64 builds of the repository's entry point, each with that key's
 * public half embedded as the release key and the stub harnesses linked in
 * (and with them the proof clock, scripts/binary/proof-clock.ts). Usage:
 *   bun scripts/binary/build-stage2.ts /ABSOLUTE/OUTPUT/DIR
 *
 * - cawco-1, 0.0.1-test.1: built from {@link BEFORE_SIDE_BY_SIDE}, the last
 *   commit whose machines run one session keeper, `cawco-sessiond.service`,
 *   on the machine's endpoint itself, as the fleet's machines were installed.
 *   Only the legacy rig installs it, so the fleet's own first update runs.
 * - cawco-2, 0.0.1-test.2: this tree. Every other rig installs it.
 * - cawco-3, 0.0.1-test.3: this tree again, newer: the build each rig updates to.
 *
 * KEPT BETWEEN RUNS, in the proof cache (`CAWCO_PROOF_CACHE`, default
 * ~/.cache/cawco-proof). The key pair is made once and kept there, mode 0600:
 * it signs only the proof's fixtures, and only proof builds trust it; the
 * release key is never in reach of this script (release.ts holds it). Build 1
 * is made once per key, for its commit never changes. Builds 2 and 3 are kept
 * per tree (`git rev-parse HEAD^{tree}`) of a clean checkout, so a proof run
 * again at the same commit compiles nothing; a checkout with changes always
 * compiles them.
 *
 * A heavy run: it holds one of the machine's slots (lib/heavy-run.ts) for
 * its whole life, waiting for one when all are held.
 */
import { copyFile, mkdir, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { agentSdkVersion, buildBinary } from "../build-binary";
import { heavySlot } from "../lib/heavy-run";
import { stageNativeClaude } from "./native-tarball";

/** The commit before keepers ran side by side (packages/core/src/keepers.ts). */
const BEFORE_SIDE_BY_SIDE = "eedffee6d89def230ba998aae49f289269abab43";

const [, , output] = Bun.argv;
if (!output?.startsWith("/")) {
  throw new Error("Usage: bun scripts/binary/build-stage2.ts /absolute/output");
}
// Held until this process exits: the kernel frees it then.
await heavySlot();
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
const read = async (argv: string[], cwd: string): Promise<string> => {
  const child = Bun.spawn(argv, { cwd, stdout: "pipe", stderr: "inherit" });
  const text = await new Response(child.stdout).text();
  if ((await child.exited) !== 0) {
    throw new Error(`${argv.join(" ")} failed`);
  }
  return text.trim();
};
const exists = (path: string) => Bun.file(path).exists();
const hash = (text: string) =>
  new Bun.CryptoHasher("sha256").update(text).digest("hex").slice(0, 16);
/** A finished build put in the cache whole, by rename, so a run stopped mid-build leaves no half file there. */
const keep = async (built: string, kept: string) => {
  await mkdir(resolve(kept, ".."), { recursive: true });
  await rename(built, kept);
};

const repository = resolve(import.meta.dir, "../..");
const cache =
  process.env.CAWCO_PROOF_CACHE ?? join(homedir(), ".cache/cawco-proof");
const keys = join(cache, "keys");
await mkdir(output, { recursive: true });
if (!(await exists(join(keys, "test-release-private.pem")))) {
  await run([
    process.execPath,
    join(import.meta.dir, "stage2-fixture.ts"),
    "keys",
    keys,
  ]);
}
await mkdir(join(output, "keys"), { recursive: true });
await Promise.all(
  ["test-release-private.pem", "test-release-public.pem"].map((name) =>
    copyFile(join(keys, name), join(output, "keys", name))
  )
);
const publicKey = (
  await Bun.file(join(keys, "test-release-public.pem")).text()
).trim();
const keyId = hash(publicKey);

// Build 1: that commit's own tree (a git worktree: its build reads git), its dependencies installed, built by its
// own build script; the worktree is removed once the build is made.
const buildOne = join(
  cache,
  "build-1",
  `${BEFORE_SIDE_BY_SIDE.slice(0, 12)}-${keyId}`,
  "cawco"
);
if (!(await exists(buildOne))) {
  const before = join(cache, "before-side-by-side");
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
    // That commit's build script downloads the native binary unless it finds one
    // already extracted in its work dir; put it there from the verified cache.
    const beforeSdk = await agentSdkVersion(
      join(before, "packages/agent/package.json")
    );
    await stageNativeClaude(
      "linux-x64",
      beforeSdk,
      join(before, ".context/binary-build/native", beforeSdk, "linux-x64")
    );
    const { buildBinary: buildBefore } = (await import(
      join(before, "scripts/build-binary.ts")
    )) as {
      buildBinary: typeof buildBinary;
    };
    await buildBefore({
      target: "linux-x64",
      outfile: join(before, "cawco-1"),
      version: "0.0.1-test.1",
      commit: "1111111111111111111111111111111111111111",
      testPublicKey: publicKey,
      stubHarness: true,
      prepare: true,
    });
    await keep(join(before, "cawco-1"), buildOne);
  } finally {
    await removeBefore();
  }
}
await copyFile(buildOne, join(output, "cawco-1"));

// Builds 2 and 3: this tree, kept per tree of a clean checkout.
const clean = (await read(["git", "status", "--porcelain"], repository)) === "";
const tree = clean
  ? await read(["git", "rev-parse", "HEAD^{tree}"], repository)
  : undefined;
const builds = [
  ["2", "0.0.1-test.2", "2222222222222222222222222222222222222222"],
  ["3", "0.0.1-test.3", "3333333333333333333333333333333333333333"],
] as const;
const keptDir = tree
  ? join(cache, "builds", `${tree.slice(0, 16)}-${keyId}`)
  : undefined;
let prepared = false;
/** One of this tree's builds into the output: the kept one, or compiled (and kept, from a clean checkout). */
const provide = async (name: string, version: string, commit: string) => {
  const kept = keptDir ? join(keptDir, `cawco-${name}`) : undefined;
  if (kept && (await exists(kept))) {
    await copyFile(kept, join(output, `cawco-${name}`));
    return;
  }
  const built = join(output, `cawco-${name}.building`);
  await buildBinary({
    target: "linux-x64",
    outfile: built,
    version,
    commit,
    testPublicKey: publicKey,
    stubHarness: true,
    // The first compile prepares the assets (the dashboard, the overlay); the next reuses them.
    prepare: !prepared,
  });
  prepared = true;
  if (!kept) {
    await rename(built, join(output, `cawco-${name}`));
    return;
  }
  await keep(built, kept);
  await copyFile(kept, join(output, `cawco-${name}`));
};
for (const [name, version, commit] of builds) {
  // biome-ignore lint/performance/noAwaitInLoops: one compile at a time bounds memory
  await provide(name, version, commit);
}
console.log(
  `Built 3 binaries in ${output} (build 1 from ${BEFORE_SIDE_BY_SIDE.slice(0, 8)}, before keepers ran side by side; ${
    keptDir
      ? `builds 2 and 3 kept in ${keptDir}`
      : "builds 2 and 3 from a checkout with changes, not kept"
  }), with the proof key from ${keys}`
);

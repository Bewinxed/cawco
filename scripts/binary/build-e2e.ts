/**
 * Builds what e2e-test.sh needs into OUTPUT: the test's key pair and two real
 * linux-x64 builds of the repository's entry point, each with that key's
 * public half embedded as the release key and the stub harnesses linked in
 * (and with them the test clock, scripts/binary/test-clock.ts). Usage:
 *   bun scripts/binary/build-e2e.ts /ABSOLUTE/OUTPUT/DIR [--skip-prepare]
 *
 * `--skip-prepare`: this checkout's assets are prepared already
 * (`build-binary.ts prepare`); the binary tests pass it, having prepared them
 * once for every compile.
 *
 * - cawco-2, 0.0.1-test.2: this tree. Every rig installs it.
 * - cawco-3, 0.0.1-test.3: this tree again, newer: the build each rig updates to.
 *
 * Both compile at once.
 *
 * KEPT BETWEEN RUNS, in the test cache (`CAWCO_TEST_CACHE`, default
 * ~/.cache/cawco-test). The key pair is made once and kept there, mode 0600:
 * it signs only the test's fixtures, and only these builds trust it; the
 * release key is never in reach of this script (release.ts holds it). Builds
 * 2 and 3 are kept by the key of the test inputs at HEAD (test-inputs.ts), so a
 * commit that changes none of them (docs, the Apple app, the release script)
 * compiles nothing; a checkout with changes to them always compiles.
 * A published release leaves its own key's builds alone in the cache
 * (release.ts runs test-cache-prune.sh).
 *
 * It starts only with room on the disk (lib/disk-room.ts), and holds the
 * machine awake until it ends (lib/hold-awake.ts).
 */
import { copyFile, mkdir, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { compileBinary, prepareAssets } from "../build-binary";
import { diskRoomOrExit } from "../lib/disk-room";
import { holdAwake } from "../lib/hold-awake";
import { testInputsChanged, testInputsKey } from "./test-inputs";

const [, , output] = Bun.argv;
if (!output?.startsWith("/")) {
  throw new Error("Usage: bun scripts/binary/build-e2e.ts /absolute/output");
}
diskRoomOrExit("The end-to-end build");
holdAwake("The end-to-end build");
const run = async (argv: string[], cwd?: string) => {
  const child = Bun.spawn(argv, {
    env: process.env,
    stdout: "inherit",
    stderr: "inherit",
    ...(cwd ? { cwd } : {}),
  });
  if ((await child.exited) !== 0) {
    throw new Error(`${argv.join(" ")} failed`);
  }
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
  process.env.CAWCO_TEST_CACHE ?? join(homedir(), ".cache/cawco-test");
const keys = join(cache, "keys");
await mkdir(output, { recursive: true });
if (!(await exists(join(keys, "test-release-private.pem")))) {
  await run([
    process.execPath,
    join(import.meta.dir, "e2e-fixture.ts"),
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

// Builds 2 and 3: this tree, kept by its test inputs' key when they are committed.
const inputs = (await testInputsChanged(repository))
  ? undefined
  : await testInputsKey(repository, "HEAD");
const builds = [
  ["2", "0.0.1-test.2", "2222222222222222222222222222222222222222"],
  ["3", "0.0.1-test.3", "3333333333333333333333333333333333333333"],
] as const;
const keptDir = inputs
  ? join(cache, "builds", `${inputs.slice(0, 16)}-${keyId}`)
  : undefined;
const keptPath = (name: string) =>
  keptDir ? join(keptDir, `cawco-${name}`) : undefined;
const present = await Promise.all(
  builds.map(([name]) => {
    const path = keptPath(name);
    return path ? exists(path) : false;
  })
);
if (present.includes(false) && !Bun.argv.includes("--skip-prepare")) {
  await prepareAssets({ dashboard: true });
}
// Each of this tree's builds into the output: the kept one, or compiled (and kept, from committed inputs).
await Promise.all(
  builds.map(async ([name, version, commit], at) => {
    const path = keptPath(name);
    if (path && present[at]) {
      await copyFile(path, join(output, `cawco-${name}`));
      return;
    }
    const built = join(output, `cawco-${name}.building`);
    await compileBinary({
      target: "linux-x64",
      outfile: built,
      version,
      commit,
      testPublicKey: publicKey,
      stubHarness: true,
    });
    if (!path) {
      await rename(built, join(output, `cawco-${name}`));
      return;
    }
    await keep(built, path);
    await copyFile(path, join(output, `cawco-${name}`));
  })
);
console.log(
  `Built ${builds.length} binaries in ${output} (${
    keptDir
      ? `builds ${builds.map(([name]) => name).join(", ")} kept in ${keptDir}`
      : "from a checkout with changes to the test inputs, not kept"
  }), with the test key from ${keys}`
);

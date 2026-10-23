/**
 * Builds what prove-stage2.sh needs into OUTPUT: the proof's key pair and three
 * real linux-x64 builds of the repository's entry point, each with that key's
 * public half embedded as the release key and the stub harnesses linked in
 * (and with them the proof clock, scripts/binary/proof-clock.ts). Usage:
 *   bun scripts/binary/build-stage2.ts /ABSOLUTE/OUTPUT/DIR [--skip-prepare]
 *
 * `--skip-prepare`: this checkout's assets are prepared already
 * (`build-binary.ts prepare`); release.ts passes it, having prepared them
 * once for every compile.
 *
 * - cawco-2, 0.0.1-test.2: this tree. Every rig installs it.
 * - cawco-3, 0.0.1-test.3: this tree again, newer: the build each rig updates to.
 * - cawco-nightly, 0.0.1-nightly.30+333333333333: build 3 as the nightly
 *   channel publishes it, its version in the shape release.ts gives a nightly
 *   (`<base>-nightly.<sequence>+<commit:12>`), which `releaseTag` reads and
 *   the agent holds the binary's own version to (nightlyjoin's hub).
 *
 * All compile at once.
 *
 * KEPT BETWEEN RUNS, in the proof cache (`CAWCO_PROOF_CACHE`, default
 * ~/.cache/cawco-proof). The key pair is made once and kept there, mode 0600:
 * it signs only the proof's fixtures, and only proof builds trust it; the
 * release key is never in reach of this script (release.ts holds it). Builds
 * 2, 3 and nightly are kept by the key of the proof inputs at HEAD (proof-inputs.ts),
 * so a commit that changes none of them (docs, the Apple app, the release
 * script) compiles nothing; a checkout with changes to them always compiles.
 * A published release leaves its own key's builds alone in the cache
 * (release.ts runs proof-cache-prune.sh).
 *
 * A heavy run: it holds one of the machine's slots (lib/heavy-run.ts) for
 * its whole life, waiting for one when all are held.
 */
import { copyFile, mkdir, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { compileBinary, prepareAssets } from "../build-binary";
import { heavySlot } from "../lib/heavy-run";
import { proofInputsChanged, proofInputsKey } from "./proof-inputs";

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

// Builds 2, 3 and nightly: this tree, kept by its proof inputs' key when they are committed.
const inputs = (await proofInputsChanged(repository))
  ? undefined
  : await proofInputsKey(repository, "HEAD");
const builds = [
  ["2", "0.0.1-test.2", "2222222222222222222222222222222222222222"],
  ["3", "0.0.1-test.3", "3333333333333333333333333333333333333333"],
  [
    "nightly",
    "0.0.1-nightly.30+333333333333",
    "3333333333333333333333333333333333333333",
  ],
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
      : "from a checkout with changes to the proof inputs, not kept"
  }), with the proof key from ${keys}`
);

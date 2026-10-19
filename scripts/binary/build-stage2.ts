/**
 * Builds what prove-stage2.sh needs into OUTPUT: the proof's key pair and two
 * real linux-x64 builds of the repository's entry point, each with that key's
 * public half embedded as the release key and the stub harnesses linked in
 * (and with them the proof clock, scripts/binary/proof-clock.ts). Usage:
 *   bun scripts/binary/build-stage2.ts /ABSOLUTE/OUTPUT/DIR [--skip-prepare]
 *
 * `--skip-prepare`: this checkout's assets (the dashboard's build, the preview
 * overlay) are prepared already, as build-binary.ts's flag of that name says;
 * release.ts passes it after its own proof build prepared them.
 *
 * - cawco-2, 0.0.1-test.2: this tree. Every rig installs it.
 * - cawco-3, 0.0.1-test.3: this tree again, newer: the build each rig updates to.
 *
 * KEPT BETWEEN RUNS, in the proof cache (`CAWCO_PROOF_CACHE`, default
 * ~/.cache/cawco-proof). The key pair is made once and kept there, mode 0600:
 * it signs only the proof's fixtures, and only proof builds trust it; the
 * release key is never in reach of this script (release.ts holds it). Builds
 * 2 and 3 are kept
 * per tree (`git rev-parse HEAD^{tree}`) of a clean checkout, so a proof run
 * again at the same commit compiles nothing; a checkout with changes always
 * compiles them.
 *
 * A heavy run: it holds one of the machine's slots (lib/heavy-run.ts) for
 * its whole life, waiting for one when all are held.
 */
import { copyFile, mkdir, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { buildBinary } from "../build-binary";
import { heavySlot } from "../lib/heavy-run";

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
let prepared = Bun.argv.includes("--skip-prepare");
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
  `Built 2 binaries in ${output} (${
    keptDir
      ? `builds 2 and 3 kept in ${keptDir}`
      : "builds 2 and 3 from a checkout with changes, not kept"
  }), with the proof key from ${keys}`
);

/**
 * Builds what prove-stage2.sh needs: a throwaway key pair, and three real
 * linux-x64 builds of the repository's own entry point with that key's public
 * half embedded as the release key. Usage:
 *   bun scripts/binary/build-stage2.ts /ABSOLUTE/OUTPUT/DIR
 */
import { join } from "node:path";
import { buildBinary } from "../build-binary";

const [, , output] = Bun.argv;
if (!output?.startsWith("/")) {
  throw new Error("Usage: bun scripts/binary/build-stage2.ts /absolute/output");
}
const run = async (argv: string[]) => {
  const child = Bun.spawn(argv, { stdout: "inherit", stderr: "inherit" });
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
const publicKey = await Bun.file(join(keys, "test-release-public.pem")).text();
const builds = [
  ["1", "0.0.1-test.1", "1111111111111111111111111111111111111111"],
  ["2", "0.0.1-test.2", "2222222222222222222222222222222222222222"],
  [
    "3",
    "0.0.1-nightly.3+333333333333",
    "3333333333333333333333333333333333333333",
  ],
] as const;
for (const [index, [name, version, commit]] of builds.entries()) {
  // biome-ignore lint/performance/noAwaitInLoops: one compile at a time bounds memory
  await buildBinary({
    target: "linux-x64",
    outfile: join(output, `cawco-${name}`),
    version,
    commit,
    testPublicKey: publicKey.trim(),
    prepare: index === 0,
  });
}
console.log(
  `Built ${builds.length} binaries and a throwaway key pair in ${output}`
);

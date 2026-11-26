/**
 * The check that every binary bundles: the release's, the smoke test's
 * (`--proof`) and the end-to-end test's (stub harnesses), each through Bun's
 * bundler as build-binary.ts compiles it (its entries and `binaryBundle`),
 * held in memory and never compiled. The type check reads each module as it
 * stands; only the bundle reads the modules a build links in place of others
 * and the names each import takes from them, so a release whose bundle fails
 * stops here instead of at its compile.
 *
 * It embeds no asset: core binary-assets.ts is given empty, so it needs no
 * `prepare`.
 *
 *   bun scripts/binary-bundle-check.ts
 */
import { bundled } from "../packages/core/src/bundled";
import {
  type BinaryVariant,
  binaryBundle,
  binaryEntries,
} from "./build-binary";

// Read at run time beyond its imports: the binaries' closures, whose
// entries are paths to it (the packages, the dashboard's server and tokens,
// scripts/binary and scripts/lib), and pi's workers from the install;
// check.ts keys the check on them.
export const checkReads = [
  "apps/dashboard/",
  "packages/",
  "scripts/",
  "node_modules/",
];

const ASSETS_SOURCE =
  "export const binaryAssets = {};\nexport const publishedHashes = {};";

const VARIANTS: Record<string, BinaryVariant> = {
  release: {},
  "smoke test (--proof)": { proof: true },
  "end-to-end test (stub harnesses)": { stubHarness: true },
};

const started = performance.now();
const failed = (
  await Promise.all(
    Object.entries(VARIANTS).map(async ([name, variant]) => {
      try {
        await bundled(`The ${name} binary`, {
          entrypoints: binaryEntries(variant).map(([, module]) => module),
          target: "bun",
          ...binaryBundle({
            ...variant,
            assetsSource: ASSETS_SOURCE,
            version: "0.0.0-check",
            commit: "check",
          }),
        });
        return [];
      } catch (error) {
        return [error instanceof Error ? error.message : String(error)];
      }
    })
  )
).flat();
const seconds = ((performance.now() - started) / 1000).toFixed(1);
const count = Object.keys(VARIANTS).length;
if (failed.length > 0) {
  console.error(
    `binary-bundle-check: ${failed.length} of ${count} binaries do not bundle (${seconds}s)\n${failed.join("\n\n")}`
  );
  process.exit(1);
}
console.log(`binary-bundle-check: ${count} binaries bundle (${seconds}s)`);

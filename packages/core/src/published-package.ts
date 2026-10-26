/**
 * A third-party package the standalone binary carries as its own files, not
 * as bundled code: one that reads files beside itself at run time
 * (playwright-core its browsers.json and wasm, photon-node its wasm). The
 * binary publishes the package's whole tree as a runtime tree
 * ({@link runtimeTree}), and every import of the package in the binary
 * resolves to this loader (scripts/build-binary.ts `PUBLISHED_PACKAGES`),
 * which loads it from that tree by absolute path, so its own `__dirname` and
 * `import.meta.url` are real paths on disk. Server-only.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { runtimeTree } from "./runtime";
import { z } from "zod";

const requireFromDisk = createRequire(import.meta.url);

/** The package published as runtime tree `tree`, loaded from its `main` file (or `index.js`). */
export function publishedPackage(tree: string): unknown {
  const root = runtimeTree(tree);
  const { main = "index.js" } = z
    .object({ main: z.string().optional() })
    .parse(JSON.parse(readFileSync(join(root, "package.json"), "utf8")));
  return requireFromDisk(join(root, main));
}

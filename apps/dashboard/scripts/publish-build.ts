/**
 * adapter-node writes into `.build-next` (svelte.config.js), because it empties
 * its output directory first and the running server serves `build/`. Once the
 * build is complete it is swapped in with two renames on the same filesystem,
 * so `build/` is always a whole build: the old one or the new one.
 *
 * Before the swap, Caw's .riv files get the precompressed siblings adapter-node
 * writes only for text and WASM: brotli takes a status file to about a third
 * (loading 1.86 MB to 0.62 MB), and sirv serves the sibling the browser accepts.
 */
import { readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const root = new URL("..", import.meta.url);
const build = new URL("build", root);
const next = new URL(".build-next", root);
const old = new URL(".build-old", root);
const assets = new URL(".build-next/client/_app/immutable/assets/", root);

const rivs = (await readdir(assets)).filter((name) => name.endsWith(".riv"));
await Promise.all(
  rivs.map(async (name) => {
    const bytes = await readFile(new URL(name, assets));
    await writeFile(
      new URL(`${name}.br`, assets),
      brotliCompressSync(bytes, {
        params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
      })
    );
    await writeFile(
      new URL(`${name}.gz`, assets),
      gzipSync(bytes, { level: 9 })
    );
  })
);

await rm(old, { recursive: true, force: true });
await rename(build, old).catch((error) => {
  if (error.code !== "ENOENT") {
    throw error;
  }
});
await rename(next, build);
await rm(old, { recursive: true, force: true });

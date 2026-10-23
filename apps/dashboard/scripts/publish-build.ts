/**
 * adapter-node writes into `.build-next` (svelte.config.js), because it empties
 * its output directory first and the running server serves `build/`. Once the
 * build is complete it is swapped in with two renames on the same filesystem,
 * so `build/` is always a whole build: the old one or the new one.
 *
 * The build it replaces stays as `.build-old` until the next publish: a tab
 * still holding the old pages asks for the old hashed assets, and serve.js
 * answers them from there instead of with a 404 (a stylesheet that 404s
 * leaves the page unstyled).
 *
 * Before the swap, Caw's .riv files get the precompressed siblings adapter-node
 * writes only for text and WASM: brotli takes a status file to about a third
 * (loading 1.86 MB to 0.62 MB), and sirv serves the sibling the browser accepts.
 *
 * Each sibling is kept by its file's content hash in the user's cache
 * (`$XDG_CACHE_HOME/cawco-dashboard/riv`, else ~/.cache), so a build compresses
 * only a .riv no build compressed before: brotli at quality 11 took 13 s of
 * every dashboard build for the 21 files, the same files nearly every time.
 */
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const root = new URL("..", import.meta.url);
const build = new URL("build", root);
const next = new URL(".build-next", root);
const old = new URL(".build-old", root);
const assets = new URL(".build-next/client/_app/immutable/assets/", root);
const cache = join(
  process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"),
  "cawco-dashboard",
  "riv"
);
await mkdir(cache, { recursive: true });

/** `bytes` compressed as `kind`: the kept copy for its content hash, else made and kept, whole, by rename. */
const compressed = async (
  bytes: Buffer,
  hash: string,
  kind: "br" | "gz"
): Promise<Buffer> => {
  const kept = join(cache, `${hash}.${kind}`);
  const found = await readFile(kept).catch(() => undefined);
  if (found) {
    return found;
  }
  const made =
    kind === "br"
      ? brotliCompressSync(bytes, {
          params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
        })
      : gzipSync(bytes, { level: 9 });
  const temp = `${kept}.${process.pid}`;
  await writeFile(temp, made);
  await rename(temp, kept);
  return made;
};

const rivs = (await readdir(assets)).filter((name) => name.endsWith(".riv"));
await Promise.all(
  rivs.map(async (name) => {
    const bytes = await readFile(new URL(name, assets));
    const hash = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    await Promise.all(
      (["br", "gz"] as const).map(async (kind) =>
        writeFile(
          new URL(`${name}.${kind}`, assets),
          await compressed(bytes, hash, kind)
        )
      )
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

/**
 * adapter-node, precompressing every client file that compresses, not only
 * the text kit's `builder.compress` picks by extension (.html .js .mjs .json
 * .css .svg .xml .wasm .txt .md .mdx). Caw's .riv files are the reason: a
 * status pose is 0.3 to 2.8 MB that brotli takes to about a third.
 *
 * The siblings have to exist inside `adapt`. adapter-node 6 records each
 * client file's size and its `.br`/`.gz` variants once, there, from the list
 * `builder.compress` returns (its index.js `measure_files`), and serves only
 * what that table names: a sibling written after the build is never sent.
 * So `compress` is widened here, and the files it adds go into the list the
 * adapter measures.
 *
 * The rule is by format: every file kit skipped is compressed unless its
 * format is {@link COMPRESSED} already. mime-db's `compressible` flag cannot
 * decide it, as .riv has no media type there.
 *
 * Each sibling is kept by its file's content hash in the user's cache
 * (`$XDG_CACHE_HOME/cawco-dashboard/precompressed`, else ~/.cache), so a
 * build compresses only a file no build compressed before: brotli at quality
 * 11 took 13 s of every build for the 21 .riv files, the same nearly every
 * time.
 */
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join, relative } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import type { Adapter, Builder } from "@sveltejs/kit";

/**
 * Formats that carry their own compression: a second pass saves next to
 * nothing and costs a build's time. Images, WOFF fonts (zlib and brotli
 * inside), media, archives and the compressed siblings themselves.
 */
const COMPRESSED = new Set([
  ".avif",
  ".br",
  ".gif",
  ".gz",
  ".jpeg",
  ".jpg",
  ".mp3",
  ".mp4",
  ".ogg",
  ".png",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".zip",
  ".zst",
]);

const cache = join(
  process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"),
  "cawco-dashboard",
  "precompressed"
);

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

/** Every file under `directory`, relative to it with `/` separators, as kit's `compress` lists them. */
const filesUnder = async (directory: string): Promise<string[]> =>
  (await readdir(directory, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) =>
      relative(directory, join(entry.parentPath, entry.name)).replaceAll(
        "\\",
        "/"
      )
    );

/** Writes `.br` and `.gz` beside each file under `directory` that `done` leaves out and is not {@link COMPRESSED}; returns those files. */
const compressRest = async (
  directory: string,
  done: string[]
): Promise<string[]> => {
  const skip = new Set(done);
  const listed = await filesUnder(directory).catch(() => []);
  const files = listed.filter(
    (file) => !(skip.has(file) || COMPRESSED.has(extname(file).toLowerCase()))
  );
  await mkdir(cache, { recursive: true });
  await Promise.all(
    files.map(async (file) => {
      const path = join(directory, file);
      const bytes = await readFile(path);
      const hash = createHash("sha256").update(bytes).digest("hex");
      await Promise.all(
        (["br", "gz"] as const).map(async (kind) =>
          writeFile(`${path}.${kind}`, await compressed(bytes, hash, kind))
        )
      );
    })
  );
  return files;
};

/** `inner`, its builder's `compress` covering every file that compresses. */
export const precompressAll = (inner: Adapter): Adapter => ({
  ...inner,
  adapt: (builder) => {
    const widened: Builder = Object.create(builder);
    widened.compress = async (directory) => {
      const done = await builder.compress(directory);
      return [...done, ...(await compressRest(directory, done))];
    };
    return inner.adapt(widened);
  },
});

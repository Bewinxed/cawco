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
 * The rule is by format: every file whose format is not
 * {@link COMPRESSED} already is compressed, kit's text
 * kinds and the rest alike. mime-db's `compressible` flag cannot
 * decide it, as .riv has no media type there.
 *
 * Every sibling but a `.map`'s is kept by its file's content hash in the
 * user's cache (`$XDG_CACHE_HOME/cawco/precompress`, else ~/.cache/cawco/precompress),
 * outside the worktree so a release's fresh clone finds it. Kit's own
 * `compress` is not called: it would compress every file again. The levels are
 * kit's (brotli 11, gzip 9), so the bytes are the same. A kept file not read
 * for {@link MAX_AGE_DAYS} days is deleted.
 */
import { createHash } from "node:crypto";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join, relative } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import {
  keepLimitReadings,
  LimitReadingSchema,
  recordLimitReading,
  takeLimitReadings,
} from "@cawco/core/limit-readings";
import { DAY_MS } from "@cawco/core/time";
import type { Adapter, Builder } from "@sveltejs/kit";
import { z } from "zod";

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

// @limit recording: build.precompress-reread-age-ms until 2026-12-10
const MAX_AGE_DAYS = 30;

const cache = join(
  process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"),
  "cawco",
  "precompress"
);

const brotli = (bytes: Buffer): Buffer =>
  brotliCompressSync(bytes, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  });
const gzip = (bytes: Buffer): Buffer => gzipSync(bytes, { level: 9 });

/**
 * Where the build's readings of the bounds waiting on data wait for
 * publish-build.ts: `vite build` runs under Node, which loads nothing that
 * signs a request as this machine, and the publish that follows it under
 * Bun hands them to the hub (agent limit-readings-hand-on.ts).
 */
const READINGS_FILE = join(cache, "limit-readings.json");

/** This build's readings, added to any an earlier build left unhanded. */
const keepBuildReadings = async (): Promise<void> => {
  const readings = [...(await heldBuildReadings()), ...takeLimitReadings()];
  if (readings.length > 0) {
    await writeFile(READINGS_FILE, JSON.stringify(readings));
  }
};

/** The readings builds left for publish-build.ts, unread ones dropped. */
const heldBuildReadings = async () => {
  const text = await readFile(READINGS_FILE, "utf8").catch(() => "[]");
  const parsed = z
    .array(LimitReadingSchema)
    .safeParse(JSON.parse(text.trim() || "[]"));
  return parsed.success ? parsed.data : [];
};

/** The builds' readings, held in this process for its hand-off and gone from the file. */
export const takeBuildReadings = async (): Promise<void> => {
  keepLimitReadings(await heldBuildReadings());
  await rm(READINGS_FILE, { force: true });
};

/** Deletes kept files not read (modified: a read touches it) for {@link MAX_AGE_DAYS} days. */
const prune = async (): Promise<void> => {
  const oldest = Date.now() - MAX_AGE_DAYS * DAY_MS;
  await Promise.all(
    (await readdir(cache)).map(async (name) => {
      const path = join(cache, name);
      const info = await stat(path).catch(() => undefined);
      if (info?.isFile() && info.mtimeMs < oldest) {
        await rm(path, { force: true });
      }
    })
  );
};

/** `bytes` compressed as `kind`: the kept copy for its content hash, else made and kept, whole, by rename. */
const compressed = async (
  bytes: Buffer,
  hash: string,
  kind: "br" | "gz"
): Promise<Buffer> => {
  const kept = join(cache, `${hash}.${kind}`);
  const found = await readFile(kept).catch(() => undefined);
  if (found) {
    const read = await stat(kept).catch(() => undefined);
    if (read) {
      // A kept copy used again: how long since it was last read.
      recordLimitReading(
        "build.precompress-reread-age-ms",
        Date.now() - read.mtimeMs
      );
    }
    const now = new Date();
    await utimes(kept, now, now).catch(() => undefined);
    return found;
  }
  const made = kind === "br" ? brotli(bytes) : gzip(bytes);
  const temp = `${kept}.${process.pid}.${crypto.randomUUID()}`;
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

/** Writes `.br` and `.gz` beside each file under `directory` that is not {@link COMPRESSED}; returns those files. A `.map`'s are made, not kept. */
const compressAll = async (directory: string): Promise<string[]> => {
  const listed = await filesUnder(directory).catch(() => []);
  const files = listed.filter(
    (file) => !COMPRESSED.has(extname(file).toLowerCase())
  );
  await mkdir(cache, { recursive: true });
  await prune();
  await Promise.all(
    files.map(async (file) => {
      const path = join(directory, file);
      const bytes = await readFile(path);
      if (extname(file) === ".map") {
        await Promise.all([
          writeFile(`${path}.br`, brotli(bytes)),
          writeFile(`${path}.gz`, gzip(bytes)),
        ]);
        return;
      }
      const hash = createHash("sha256").update(bytes).digest("hex");
      await Promise.all(
        (["br", "gz"] as const).map(async (kind) =>
          writeFile(`${path}.${kind}`, await compressed(bytes, hash, kind))
        )
      );
    })
  );
  await keepBuildReadings();
  return files;
};

/** `inner`, its builder's `compress` covering every file that compresses. */
export const precompressAll = (inner: Adapter): Adapter => ({
  ...inner,
  adapt: (builder) => {
    const widened: Builder = Object.create(builder);
    widened.compress = compressAll;
    return inner.adapt(widened);
  },
});

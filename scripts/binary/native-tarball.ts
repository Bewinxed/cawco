/**
 * The Claude Agent SDK's native tarballs, fetched from npm at most once per
 * version and read from a local cache by every later build (release, proof,
 * stage 2). A cached file is used only while its SHA-512 matches npm's
 * published `dist.integrity`; a download is written beside it and renamed in
 * only once verified, so a partial file is never read as a tarball.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: download attempts and body chunks are sequential by nature.

import { mkdir, open, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const REGISTRY = "https://registry.npmjs.org";
const ATTEMPTS = 5;
/** A body that sends nothing for this long is treated as a dropped connection. */
const IDLE_MS = 30_000;
const CONTENT_RANGE_START = /^bytes (\d+)-/;

export interface NativeMetadata {
  integrity: string;
  tarball: string;
}

export const nativePackage = (target: string) =>
  `@anthropic-ai/claude-agent-sdk-${target}`;

export const nativeCacheDir = () =>
  join(
    process.env.XDG_CACHE_HOME || join(homedir(), ".cache"),
    "cawco",
    "native-tarballs"
  );

const cacheBase = (pkg: string, version: string) =>
  join(nativeCacheDir(), `${pkg.replaceAll("/", "__")}@${version}`);

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
const backoff = (attempt: number) => 1000 * 2 ** (attempt - 1);
const message = (error: unknown) =>
  error instanceof Error
    ? `${error.message}${"code" in error && error.code ? ` (${error.code})` : ""}`
    : String(error);

/** Written beside its final name and renamed in, so readers see whole files only. */
async function writeAtomic(path: string, data: string | Uint8Array) {
  const temp = `${path}.${process.pid}.tmp`;
  await Bun.write(temp, data);
  await rename(temp, path);
}

async function matchesIntegrity(path: string, integrity: string) {
  const [algorithm, expected] = integrity.split("-", 2);
  if (algorithm !== "sha512") {
    throw new Error(`Unsupported npm integrity algorithm in ${integrity}`);
  }
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return false;
  }
  const hasher = new Bun.CryptoHasher("sha512");
  for await (const chunk of file.stream()) {
    hasher.update(chunk);
  }
  return hasher.digest("base64") === expected;
}

/** A version's dist never changes on npm, so its metadata is cached beside the tarball. */
async function metadataFor(
  pkg: string,
  version: string
): Promise<NativeMetadata> {
  const path = `${cacheBase(pkg, version)}.json`;
  const cached = Bun.file(path);
  if (await cached.exists()) {
    return (await cached.json()) as NativeMetadata;
  }
  const url = `${REGISTRY}/${pkg}/${version}`;
  let last: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const { dist } = (await response.json()) as { dist: NativeMetadata };
      const metadata = { tarball: dist.tarball, integrity: dist.integrity };
      await mkdir(nativeCacheDir(), { recursive: true });
      await writeAtomic(path, JSON.stringify(metadata));
      return metadata;
    } catch (error) {
      last = error;
      if (attempt < ATTEMPTS) {
        await sleep(backoff(attempt));
      }
    }
  }
  throw new Error(
    `Cannot resolve ${pkg}@${version} from ${url} after ${ATTEMPTS} attempts: ${message(last)}`
  );
}

/**
 * Downloads `url` to `dest`, verified against `integrity`. A connection that
 * drops or stalls resumes with a Range request from the bytes already on disk
 * (appended only on a 206 that starts there, otherwise restarted from zero),
 * up to {@link ATTEMPTS} attempts with backoff.
 */
export async function downloadVerified(
  url: string,
  integrity: string,
  dest: string,
  label: string
) {
  const part = { path: `${dest}.${process.pid}.part`, received: 0 };
  await rm(part.path, { force: true });
  let last: unknown;
  try {
    for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
      try {
        await appendBody(url, part, label);
        if (await matchesIntegrity(part.path, integrity)) {
          await rename(part.path, dest);
          return;
        }
        // A whole body that hashes wrong can't be resumed into a right one.
        await rm(part.path, { force: true });
        part.received = 0;
        throw new Error("downloaded bytes do not match npm's integrity");
      } catch (error) {
        last = error;
        if (attempt < ATTEMPTS) {
          console.log(
            `${label}: attempt ${attempt} stopped at ${part.received} bytes (${message(error)}); retrying`
          );
          await sleep(backoff(attempt));
        }
      }
    }
  } finally {
    await rm(part.path, { force: true });
  }
  throw new Error(
    `Native SDK download of ${label} failed after ${ATTEMPTS} attempts with ${part.received} bytes received: ${message(last)}`
  );
}

/** One request: the rest of the body after `part.received` bytes, appended to `part.path`. */
async function appendBody(
  url: string,
  part: { path: string; received: number },
  label: string
) {
  const controller = new AbortController();
  let idle: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    clearTimeout(idle);
    idle = setTimeout(
      () =>
        controller.abort(
          new Error(`no bytes for ${IDLE_MS / 1000} s at ${part.received}`)
        ),
      IDLE_MS
    );
  };
  const handle = await open(part.path, "a");
  try {
    arm();
    const resuming = part.received > 0;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: resuming ? { Range: `bytes=${part.received}-` } : {},
    });
    if (resuming && response.status === 206) {
      const start = CONTENT_RANGE_START.exec(
        response.headers.get("content-range") ?? ""
      )?.[1];
      if (Number(start) !== part.received) {
        throw new Error(
          `range resumed at ${start ?? "?"}, expected ${part.received}`
        );
      }
    } else if (response.status === 200) {
      if (resuming) {
        console.log(`${label}: server ignored the range, restarting`);
        await handle.truncate(0);
        part.received = 0;
      }
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
    if (!response.body) {
      throw new Error("response has no body");
    }
    for await (const chunk of response.body) {
      await handle.write(chunk);
      part.received += chunk.byteLength;
      arm();
    }
  } catch (error) {
    throw controller.signal.aborted ? controller.signal.reason : error;
  } finally {
    clearTimeout(idle);
    await handle.close();
  }
}

/** The verified cached tarball for `target` at `version`, downloading it on a miss. */
export async function nativeTarball(
  target: string,
  version: string
): Promise<string> {
  const pkg = nativePackage(target);
  const label = `${pkg}@${version}`;
  const metadata = await metadataFor(pkg, version);
  const path = `${cacheBase(pkg, version)}.tgz`;
  if (await matchesIntegrity(path, metadata.integrity)) {
    return path;
  }
  if (await Bun.file(path).exists()) {
    console.log(`${label}: cached tarball fails integrity, downloading again`);
    await rm(path, { force: true });
  }
  await mkdir(nativeCacheDir(), { recursive: true });
  await downloadVerified(metadata.tarball, metadata.integrity, path, label);
  return path;
}

/** Extracts the cached tarball's `package/` into `dir` (emptied first) and returns its `claude`. */
export async function stageNativeClaude(
  target: string,
  version: string,
  dir: string
): Promise<string> {
  const archive = await nativeTarball(target, version);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const tar = Bun.spawn(["tar", "-xzf", archive, "-C", dir], {
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await tar.exited) !== 0) {
    throw new Error(`Cannot extract ${archive}`);
  }
  return join(dir, "package/claude");
}

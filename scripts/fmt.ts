/**
 * `bun scripts/fmt.ts [--check] [--changed] [paths…]`: the repository's
 * formatter, `bun fmt` from a pinned Bun canary. Biome lints; this formats.
 *
 * - The files are the ones git sees (`git ls-files -co --exclude-standard`,
 *   under the paths given, or every one): what git ignores, including
 *   `.git/info/exclude` (a cawco workspace's read-only stand-ins such as
 *   opencode.json), is never read or written. `bun fmt`'s own discovery reads
 *   only `.gitignore` and `.prettierignore`.
 * - `--changed`: only the files that differ from the merge-base with
 *   origin/main, as `bun run lint:changed` checks.
 * - `--check`: write nothing; exit 1 when a file is not formatted.
 * - The options are `.prettierrc` (site/.prettierrc under site/), what Biome
 *   formatted with before; `.prettierignore` names what is left as written.
 * - `formatText(path, text)`: the same formatter over text in memory, as it
 *   would write a file at `path` (that path's options and ignores; a file no
 *   parser reads comes back as given). A generator formats what it makes
 *   with it, so what it writes is final and its check compares bytes.
 *
 * `bun fmt` is in Bun's main branch and docs, in no stable release yet (v1.4.3
 * lacks it). The canary comes from npm, where a version is immutable:
 * `@oven/bun-<platform>@1.4.3-canary.20261014.1` is Bun
 * 1.4.4-canary.1+408c9374b266b45fe6b8260e09be73aa82a957cd. GitHub's `canary`
 * release is rewritten on every build, so it cannot be pinned. The tarball is
 * checked against the integrity npm publishes for that version before its
 * binary is unpacked into the user's cache; a mismatch stops the run. It is
 * only this formatter, never the machine's `bun`: the hub and the release
 * builds stay on the Bun they pin (PINNED_BUN in build-binary.ts).
 */
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { availableParallelism, homedir } from "node:os";
import { join, relative, resolve } from "node:path";

const VERSION = "1.4.3-canary.20261014.1";
const PINS: Record<string, { pkg: string; integrity: string }> = {
  "linux-x64": {
    pkg: "bun-linux-x64",
    integrity:
      "sha512-Ta/lGSUPoI2mOZOfD+QgO1HIUduNhTblkjbE5uWy2hDz+vGB0Lzqki3Ed78UnYnrjnznHer2a1QH9eDGFUW37Q==",
  },
  "linux-arm64": {
    pkg: "bun-linux-aarch64",
    integrity:
      "sha512-ieJlQEl+K72CG/0Ie6EWu7qwFdgt3yI++XknZ6JxpcE02Qes9ojmcLl2bzU/xmNduICxwcE5EQZOi++r5x4qEQ==",
  },
  "darwin-arm64": {
    pkg: "bun-darwin-aarch64",
    integrity:
      "sha512-hqpHQr2X0pM3iA++t/a9l6/u4M04M0LyipFMzcCUtOSlyTV7+UQEH2BaDQLWrJDxvY594d6bnlqRwoKna4RUYQ==",
  },
};
const ROOT = join(import.meta.dir, "..");

const fail = (why: string): never => {
  console.error(`fmt: ${why}`);
  process.exit(2);
};

const git = (...argv: string[]): string[] => {
  const run = Bun.spawnSync(["git", ...argv], { cwd: ROOT });
  if (run.exitCode !== 0) {
    fail(`git ${argv.join(" ")}: ${run.stderr.toString().trim()}`);
  }
  return run.stdout.toString().split("\0").filter(Boolean);
};

/** The pinned canary's binary, fetched and checked into the cache on first use. */
const canary = async (): Promise<string> => {
  const platform = `${process.platform}-${process.arch}`;
  const pin = PINS[platform];
  if (!pin) {
    return fail(
      `no pinned Bun canary for ${platform} (pinned: ${Object.keys(PINS).join(", ")})`
    );
  }
  const dir = join(
    process.env.XDG_CACHE_HOME || join(homedir(), ".cache"),
    "cawco",
    "bun-canary",
    VERSION,
    platform
  );
  const bin = join(dir, "bun");
  if (await Bun.file(bin).exists()) {
    return bin;
  }
  const url = `https://registry.npmjs.org/@oven/${pin.pkg}/-/${pin.pkg}-${VERSION}.tgz`;
  const response = await fetch(url);
  if (!response.ok) {
    return fail(`${url} answered ${response.status}`);
  }
  const tarball = new Uint8Array(await response.arrayBuffer());
  const integrity = `sha512-${createHash("sha512").update(tarball).digest("base64")}`;
  if (integrity !== pin.integrity) {
    return fail(`${url} is ${integrity}, not the pinned ${pin.integrity}`);
  }
  await mkdir(dir, { recursive: true });
  const unpack = await mkdtemp(join(dir, ".unpack-"));
  try {
    const tar = Bun.spawn(
      ["tar", "-xzf", "-", "-C", unpack, "package/bin/bun"],
      { stdin: tarball, stderr: "pipe" }
    );
    if ((await tar.exited) !== 0) {
      fail(
        `unpacking ${url}: ${(await new Response(tar.stderr).text()).trim()}`
      );
    }
    await chmod(join(unpack, "package/bin/bun"), 0o755);
    // Whole or not at all: a run cut short leaves no half-written binary.
    await rename(join(unpack, "package/bin/bun"), bin);
  } finally {
    await rm(unpack, { recursive: true, force: true });
  }
  return bin;
};

/** How `bun fmt` says a file is no language it formats. */
const NO_PARSER = "No parser could be inferred";
/** Formatter processes at once: each is short, and a generator may hand over hundreds of files. */
const AT_ONCE = Math.min(8, availableParallelism());
let running = 0;
const waiting: (() => void)[] = [];

/** One formatter run over `text` as the file at `file` (absolute). */
async function formatOne(file: string, text: string): Promise<string> {
  const child = Bun.spawn([await canary(), "fmt", `--stdin-filepath=${file}`], {
    cwd: ROOT,
    stdin: Buffer.from(text),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code === 0) {
    return out;
  }
  // A file run passes `--ignore-unknown` and leaves such a file as written;
  // on standard input that flag prints nothing at all, so it is not passed.
  if (err.includes(NO_PARSER)) {
    return text;
  }
  throw new Error(`fmt ${file}: ${err.trim() || `exited ${code}`}`);
}

/**
 * `text` as the formatter writes the file at `path` (the caller's, like the
 * command line's): its options, `.prettierignore`, and a file no parser
 * reads left as given.
 */
export async function formatText(path: string, text: string): Promise<string> {
  if (running < AT_ONCE) {
    running += 1;
  } else {
    // A run that ends hands its place straight to the next in line.
    await new Promise<void>((go) => waiting.push(go));
  }
  try {
    return await formatOne(resolve(process.cwd(), path), text);
  } finally {
    const next = waiting.shift();
    if (next) {
      next();
    } else {
      running -= 1;
    }
  }
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const changed = args.includes("--changed");
  // Paths are the caller's (a package script runs in its package); git takes them from the root.
  const paths = args
    .filter((arg) => !arg.startsWith("--"))
    .map((arg) => relative(ROOT, resolve(process.cwd(), arg)) || ".");
  const unknown = args.filter(
    (arg) => arg.startsWith("--") && arg !== "--check" && arg !== "--changed"
  );
  if (unknown.length > 0) {
    fail(`unknown flag ${unknown.join(", ")}`);
  }

  const seen = new Set(
    git("ls-files", "-z", "-co", "--exclude-standard", "--", ...paths)
  );
  const files = changed
    ? git(
        "diff",
        "-z",
        "--name-only",
        "--diff-filter=ACMR",
        git("merge-base", "HEAD", "origin/main")[0]?.trim() ?? "",
        "--",
        ...paths
      ).filter((file) => seen.has(file))
    : [...seen];
  // `bun fmt` with no paths formats the whole directory: an empty list is done.
  if (files.length === 0) {
    return 0;
  }

  const child = Bun.spawn(
    [
      await canary(),
      "fmt",
      ...(check ? ["--check"] : []),
      // The list is git's, so a file with no formatter is simply not ours to format.
      "--ignore-unknown",
      "--no-error-on-unmatched-pattern",
      ...files,
    ],
    { cwd: ROOT, stdio: ["inherit", "inherit", "inherit"] }
  );
  return await child.exited;
}

if (import.meta.main) {
  process.exit(await main());
}

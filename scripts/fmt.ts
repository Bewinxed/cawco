/**
 * `bun scripts/fmt.ts [--check] [paths…]`: the repository's
 * formatter, `bun fmt`. Biome lints; this formats.
 *
 * - The files are the ones git sees (`git ls-files -co --exclude-standard`,
 *   under the paths given, or every one): what git ignores, including
 *   `.git/info/exclude` (a cawco workspace's read-only stand-ins such as
 *   opencode.json), is never read or written. `bun fmt`'s own discovery reads
 *   only `.gitignore` and `.prettierignore`.
 * - `--check`: write nothing; exit 1 when a file is not formatted.
 * - The options are `.prettierrc` (site/.prettierrc under site/), what Biome
 *   formatted with before; `.prettierignore` names what is left as written.
 * - `formatText(path, text)`: the same formatter over text in memory, as it
 *   would write a file at `path` (that path's options and ignores; a file no
 *   parser reads comes back as given). A generator formats what it makes
 *   with it, so what it writes is final and its check compares bytes.
 *
 * It runs on the bun that runs it, the machine's own: `bun fmt` ships in
 * Bun's stable releases from 1.4.4 on, older ones lack it and are refused
 * with that.
 */
import { availableParallelism } from "node:os";
import { join, relative, resolve } from "node:path";

/** The first stable Bun with `bun fmt` (bun.com/blog/bun-v1.4.4). */
const FIRST_FMT = "1.4.4";
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

/** The bun this runs on, refused where it has no `bun fmt`. */
const bun = (): string =>
  Bun.semver.order(Bun.version, FIRST_FMT) < 0
    ? fail(
        `bun fmt ships in Bun ${FIRST_FMT} and later, and this is Bun ${Bun.version}: run \`bun upgrade\`, then again`
      )
    : process.execPath;

/** How `bun fmt` says a file is no language it formats. */
const NO_PARSER = "No parser could be inferred";
/** Formatter processes at once: each is short, and a generator may hand over hundreds of files. */
const AT_ONCE = Math.min(8, availableParallelism());
let running = 0;
const waiting: (() => void)[] = [];

/** One formatter run over `text` as the file at `file` (absolute). */
async function formatOne(file: string, text: string): Promise<string> {
  const child = Bun.spawn([bun(), "fmt", `--stdin-filepath=${file}`], {
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
  // Paths are the caller's (a package script runs in its package); git takes them from the root.
  const paths = args
    .filter((arg) => !arg.startsWith("--"))
    .map((arg) => relative(ROOT, resolve(process.cwd(), arg)) || ".");
  const unknown = args.filter(
    (arg) => arg.startsWith("--") && arg !== "--check"
  );
  if (unknown.length > 0) {
    fail(`unknown flag ${unknown.join(", ")}`);
  }

  const files = [
    ...new Set(
      git("ls-files", "-z", "-co", "--exclude-standard", "--", ...paths)
    ),
  ];
  // `bun fmt` with no paths formats the whole directory: an empty list is done.
  if (files.length === 0) {
    return 0;
  }

  const child = Bun.spawn(
    [
      bun(),
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

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
 *   with it, so what it writes is final. CSS numbers and hex colours are
 *   printed as Prettier prints them first ({@link cssCanonical}), as no Bun's printer may.
 * - `formattedAlike(path, committed, made)`: a generator's check. Both sides
 *   go through `formatText` on this machine's bun, so a file another Bun
 *   formatted reads the same as long as what it says is the same.
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

/** What {@link cssCanonical} leaves as written: a comment, or a quoted string. */
const CSS_AS_WRITTEN =
  /\/\*[\s\S]*?\*\/|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/gu;

/** A decimal number in CSS: not part of a name, an escape or a longer number. */
const CSS_DECIMAL = /(?<![\w.\\])(\d*)\.(\d+)(?![\d.])/gu;

/** A fraction's trailing zeros. */
const TRAILING_ZEROS = /0+$/u;

/** One decimal as Prettier prints it: no trailing zeros, no bare dot, a leading zero. */
const cssDecimal = (_: string, whole: string, fraction: string): string => {
  const kept = fraction.replace(TRAILING_ZEROS, "");
  return kept ? `${whole || "0"}.${kept}` : whole || "0";
};

/** A declaration's value: after its colon, up to its `;` or the block's `}` (a selector runs to a `{`). */
const CSS_VALUE = /:[^;{}]*(?=[;}])/gu;

/** A hex colour, which Prettier prints in lower case. */
const CSS_HEX = /#[\da-fA-F]{3,8}\b/gu;

/** A run of spaces or tabs between two words on a line: one space wherever CSS reads it. */
const CSS_SPACES = /(?<=\S)[ \t]{2,}(?=\S)/gu;

/** CSS outside comments and strings as Prettier prints its numbers, its values' hex colours and the spaces between its words. */
const cssPlain = (css: string): string =>
  css
    .replace(CSS_SPACES, " ")
    .replace(CSS_DECIMAL, cssDecimal)
    .replace(CSS_VALUE, (value) =>
      value.replace(CSS_HEX, (hex) => hex.toLowerCase())
    );

/**
 * `css` with every decimal outside comments and strings as Prettier prints
 * it (`0.010` is `0.01`, `1.50px` is `1.5px`, `.5em` is `0.5em`), every hex
 * colour in a value in lower case (`#F2D36B` is `#f2d36b`), and one space
 * between two words on a line (`@custom-variant a   (…)` is
 * `@custom-variant a (…)`). Bun 1.4.4's `bun fmt` prints each as written,
 * where the canary before it printed the first two as Prettier does, so a
 * generator's CSS printed differently on each Bun. Given them already
 * canonical, every Bun prints them alike.
 */
const cssCanonical = (css: string): string => {
  let out = "";
  let at = 0;
  for (const kept of css.matchAll(CSS_AS_WRITTEN)) {
    out += cssPlain(css.slice(at, kept.index));
    out += kept[0];
    at = kept.index + kept[0].length;
  }
  return out + cssPlain(css.slice(at));
};

/**
 * `text` as the formatter writes the file at `path` (the caller's, like the
 * command line's): its options, `.prettierignore`, and a file no parser
 * reads left as given; a CSS file's numbers and colours as {@link cssCanonical} prints them.
 */
export async function formatText(path: string, text: string): Promise<string> {
  const given = path.endsWith(".css") ? cssCanonical(text) : text;
  if (running < AT_ONCE) {
    running += 1;
  } else {
    // A run that ends hands its place straight to the next in line.
    await new Promise<void>((go) => waiting.push(go));
  }
  try {
    return await formatOne(resolve(process.cwd(), path), given);
  } finally {
    const next = waiting.shift();
    if (next) {
      next();
    } else {
      running -= 1;
    }
  }
}

/**
 * Whether a generator's output `made` says what the committed file at `path`
 * says: both formatted by {@link formatText} on this machine's bun, then
 * compared. A file committed from another Bun, whose printer laid it out or
 * wrote its numbers otherwise, passes; one whose content differs fails.
 */
export async function formattedAlike(
  path: string,
  committed: string,
  made: string
): Promise<boolean> {
  const [was, now] = await Promise.all([
    formatText(path, committed),
    formatText(path, made),
  ]);
  return was === now;
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

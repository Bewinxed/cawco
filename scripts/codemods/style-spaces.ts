// Rewrites the Tailwind spelling of a space (`_`) to real spaces wherever the
// text is plain CSS: a `style:` directive, a `style` attribute, a stylesheet,
// a JavaScript string that ends up in a style.
//
// theme-prune.ts (cea5d837e) wrote `calc(var(--spacing)_*_24)` everywhere it
// replaced a token read; only inside a class's `[…]` is that spelling right
// (Tailwind turns `_` into a space there). In CSS the value is invalid and the
// browser drops the declaration.
//
// A place is a class token when it sits in a whitespace- or quote-delimited
// token that wraps it in `[…]`, or in `-(…)` (`gap-(--x)`); every other place is
// plain CSS. Safe to run twice: a rewritten value holds no operator joined by
// underscores.
//
//   bun scripts/codemods/style-spaces.ts [--check]
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const DIRS = ["apps/dashboard/src", "packages", "site"];
const EXT = /\.(?:svelte|ts|css|js|mjs)$/u;
const SKIPPED = /^(?:node_modules|dist|build|\..*)$/u;
const TOKEN_EDGE = /[\s"'`]/u;

/**
 * An arithmetic operator joined by underscores between two operands: the left
 * ends a `calc()`/`var()`, a number, a percentage or a `${…}`; the right opens
 * a number, a `(` or a `var()`/`calc()`/`env()`/`min()`/`max()`.
 */
const JOINED =
  /(?<=[)\d%}])_([-+*/])_(?=[\d(.]|(?:var|calc|env|min|max|clamp)\()/gu;

/** Whether the text at `at` sits inside a class token's arbitrary value. */
function inClassToken(text: string, at: number): boolean {
  let start = at;
  while (start > 0 && !TOKEN_EDGE.test(text[start - 1] as string)) {
    start -= 1;
  }
  const before = text.slice(start, at);
  if (before.split("[").length > before.split("]").length) {
    return true;
  }
  // `gap-(--x)`: an opening parenthesis written straight after a `-`.
  let depth = 0;
  for (let i = before.length - 1; i >= 0; i -= 1) {
    if (before[i] === ")") {
      depth += 1;
    } else if (before[i] === "(") {
      if (depth === 0) {
        if (before[i - 1] === "-" || i === 0) {
          return true;
        }
      } else {
        depth -= 1;
      }
    }
  }
  return false;
}

function* files(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIPPED.test(entry.name)) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* files(full);
    } else if (EXT.test(entry.name)) {
      yield full;
    }
  }
}

const check = process.argv.includes("--check");
const changed: string[] = [];
const left: string[] = [];
for (const top of DIRS) {
  const dir = path.join(ROOT, top);
  if (!fs.existsSync(dir)) {
    continue;
  }
  for (const file of files(dir)) {
    const text = fs.readFileSync(file, "utf8");
    const rel = path.relative(ROOT, file);
    const lineOf = (at: number) => text.slice(0, at).split("\n").length;
    const plain: number[] = [];
    for (const m of text.matchAll(JOINED)) {
      const at = m.index as number;
      if (inClassToken(text, at)) {
        left.push(`${rel}:${lineOf(at)}`);
      } else {
        plain.push(at);
      }
    }
    if (plain.length === 0) {
      continue;
    }
    for (const line of new Set(plain.map(lineOf))) {
      changed.push(`${rel}:${line}`);
    }
    if (!check) {
      const set = new Set(plain);
      fs.writeFileSync(
        file,
        text.replace(JOINED, (all, op: string, at: number) =>
          set.has(at) ? ` ${op} ` : all
        )
      );
    }
  }
}
const unique = (list: string[]) => [...new Set(list)];
console.log(`${check ? "would change" : "changed"} (plain CSS):`);
for (const line of unique(changed)) {
  console.log(`  ${line}`);
}
console.log("left as class tokens:");
for (const line of unique(left)) {
  console.log(`  ${line}`);
}
console.log(
  `${unique(changed).length} lines changed, ${unique(left).length} class lines left`
);
if (check && changed.length > 0) {
  process.exit(1);
}

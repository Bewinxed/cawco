/**
 * `bun scripts/relics-check.ts` (part of `bun run lint`): nothing of the old
 * stylesheet is carried over into the Tailwind form. Each kind is a relic of
 * a hand-kept value or an override the design system has a place for, and
 * each must read 0:
 *
 *   literal       a `<!-- literal: … -->` marker: a value kept as it was,
 *                 where a token, a DESIGN.md step or a kit component belongs
 *   style-var     a numeric `style:--x="12px"`: a magic number fed in by hand
 *   important     `!important`, in markup, a stylesheet or a class string
 *   bang          a trailing-`!` utility (`p-2!`), Tailwind's important
 *   style-reason  a component `<style>` whose first line is not
 *                 `/* tailwind: <reason> — …tailwindcss.com/docs… *\/`: a
 *                 residual stays only where v4 cannot say the thing, and
 *                 says why with the page of the docs that shows it
 *
 * Dead or duplicate rules are svelte-unused-css's, and the kit's contracts
 * (no-restyle, variant-order) are ESLint's, both in the same lint.
 *
 *   bun scripts/relics-check.ts            every file under apps/dashboard/src
 *   bun scripts/relics-check.ts <file…>    those files (a lane's)
 *   bun scripts/relics-check.ts --list     also print every relic as `file:line  kind  text`
 *
 * Prints the count of each kind, then, with `--list`, each relic. Exits 1
 * when any kind is above 0.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const SOURCE = join(ROOT, "apps", "dashboard", "src");
const SKIP_DIRS = new Set(["node_modules", ".svelte-kit", "dist", "build"]);
const KINDS = [
  "literal",
  "style-var",
  "important",
  "bang",
  "style-reason",
] as const;
type Kind = (typeof KINDS)[number];

const LITERAL = /<!--\s*literal:/;
const STYLE_VAR =
  /style:--[\w-]+=["']-?\d[\d.]*(px|rem|em|ch|vh|vw|dvh|%|ms|s|deg)["']/;
const IMPORTANT = /!important/;
/** A quoted string in source: the class lists live in them. */
const STRING = /"([^"\n]*)"|'([^'\n]*)'|`([^`\n]*)`/g;
/** A utility with Tailwind's trailing `!`: a token with a `-` or `:` in it (words in copy end in `!` too). */
const BANG = /(?:^|\s)([\w:.[\]()/%#-]*[-:][\w:.[\]()/%#-]*[\w)\]])!(?=\s|$)/;
const STYLE_OPEN = /<style\b[^>]*>/;
const STYLE_REASON = /^\s*\/\*\s*tailwind:\s*\S.*tailwindcss\.com\/docs/;
/** A file the check reads: Svelte, a stylesheet or TypeScript, never a declaration file. */
const READ = /\.(svelte|css|ts)$/;
/** What stands before a `<style>`'s first line on its own line. */
const BEFORE_STYLE = /.*<style\b[^>]*>/;

const args = process.argv.slice(2);
const list = args.includes("--list");
const named = args.filter((arg) => !arg.startsWith("--"));

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) {
      continue;
    }
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path, out);
    } else if (READ.test(name) && !name.endsWith(".d.ts")) {
      out.push(path);
    }
  }
  return out;
}

const files =
  named.length > 0
    ? named.map((file) => resolve(ROOT, file))
    : walk(SOURCE, []).sort();
const counts = new Map<Kind, number>(KINDS.map((kind) => [kind, 0]));
const found: string[] = [];
const note = (file: string, line: number, kind: Kind, text: string) => {
  counts.set(kind, (counts.get(kind) ?? 0) + 1);
  found.push(
    `${relative(ROOT, file)}:${line}  ${kind}  ${text.trim().slice(0, 140)}`
  );
};

for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n");
  const svelte = file.endsWith(".svelte");
  lines.forEach((text, i) => {
    const line = i + 1;
    if (svelte && LITERAL.test(text)) {
      note(file, line, "literal", text);
    }
    if (svelte && STYLE_VAR.test(text)) {
      note(file, line, "style-var", text);
    }
    if (IMPORTANT.test(text)) {
      note(file, line, "important", text);
    }
    if (!file.endsWith(".css")) {
      for (const match of text.matchAll(STRING)) {
        const value = match[1] ?? match[2] ?? match[3] ?? "";
        if (BANG.test(value)) {
          note(file, line, "bang", text);
          break;
        }
      }
    }
    if (svelte && STYLE_OPEN.test(text)) {
      const after = text.replace(BEFORE_STYLE, "");
      const first =
        after.trim() === ""
          ? (lines.slice(i + 1).find((next) => next.trim() !== "") ?? "")
          : after;
      if (!STYLE_REASON.test(first)) {
        note(file, line, "style-reason", first || text);
      }
    }
  });
}

if (list) {
  for (const line of found) {
    console.log(line);
  }
}
const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
console.log(
  `relics: ${files.length} file(s); ${KINDS.map((kind) => `${kind} ${counts.get(kind)}`).join(", ")}`
);
if (total > 0) {
  console.log(
    "relics: each kind must read 0 (the value's token, a DESIGN.md step or a kit component; a residual <style> opens with its tailwind: docs reason)"
  );
  process.exit(1);
}

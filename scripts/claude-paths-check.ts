/**
 * `bun run claude-paths:check`: no code builds a path into a Claude Code
 * config dir but core's owner of them (`packages/core/src/paths.ts`, with its
 * browser-safe half `claude-dirs.ts`). Every string, template and regular
 * expression literal in the TypeScript, JavaScript and Svelte sources is
 * read (comments are not code), and one that names a `.claude` path fails
 * the check with its file and line, unless its file is in {@link ALLOWED}
 * with the reason it may.
 *
 * A `.claude` path is the name standing alone as a path segment or file
 * stem: `~/.claude`, `/.claude/…`, `".claude"`, `.claude.json`. A word that
 * only contains it (`code.claude.com`, `.claude-plugin`) is not one.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = join(import.meta.dir, "..");

/** Where the sources are. */
const SOURCES = [
  "apps/dashboard/src",
  "packages/agent/src",
  "packages/agent/bench",
  "packages/auth/src",
  "packages/cli/src",
  "packages/core/src",
  "packages/hub/src",
  "packages/jsonl-parser/bench",
  "packages/jsonl-parser/src",
  "packages/sessiond/src",
  "scripts",
];

/** Files that may name a Claude Code dir, each with why. */
const ALLOWED: Record<string, string> = {
  "packages/core/src/claude-dirs.ts":
    "the owner's browser-safe half: the one place the dir name is spelled",
  "packages/agent/src/boundary.ts":
    "the workspace boundary's credential deny list; another work item owns this file (hiding ~/.cawco/accounts from workspaces) and moves it onto paths.ts there",
  "scripts/claude-paths-check.ts":
    "this check, whose own examples name the paths it looks for",
  "packages/jsonl-parser/bench/bench.ts":
    "a benchmark of a package that depends on nothing in the workspace (importing core drags it into that package's stricter compile); its default corpus is the operator's own ~/.claude/projects, and any other is its first argument",
};

const EXTENSIONS = /\.(?:ts|tsx|mts|cts|js|mjs|cjs|svelte)$/;
const SKIP_DIRS = new Set(["node_modules", ".svelte-kit", "dist", "build"]);

/** `.claude` as a path segment or a file stem, not as part of a longer word. */
export const CLAUDE_PATH = /(?:^|[^\w.-])\.claude(?![\w-])/;

const walk = (dir: string, out: string[]): void => {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    const path = join(dir, name);
    if (SKIP_DIRS.has(name)) {
      continue;
    }
    if (statSync(path).isDirectory()) {
      walk(path, out);
    } else if (EXTENSIONS.test(name)) {
      out.push(path);
    }
  }
};

interface Hit {
  file: string;
  line: number;
  text: string;
}

/** The literals of one script body, each with its offset in `text`. */
const literalsOf = (
  text: string,
  name: string
): { at: number; value: string }[] => {
  const source = ts.createSourceFile(
    name,
    text,
    ts.ScriptTarget.Latest,
    true,
    name.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const found: { at: number; value: string }[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isRegularExpressionLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      found.push({ at: node.getStart(source), value: node.getText(source) });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
};

const lineAt = (text: string, offset: number): number =>
  text.slice(0, offset).split("\n").length;

const SCRIPT = /<script\b[^>]*>([\s\S]*?)<\/script>/g;
const STYLE = /<style\b[^>]*>[\s\S]*?<\/style>/g;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;

/** Every `.claude` path one file names. */
const hitsIn = (path: string): Hit[] => {
  const file = relative(ROOT, path);
  const text = readFileSync(path, "utf8");
  const hits: Hit[] = [];
  const scripts: { at: number; body: string }[] = [];
  if (path.endsWith(".svelte")) {
    for (const match of text.matchAll(SCRIPT)) {
      const body = match[1] ?? "";
      scripts.push({ at: (match.index ?? 0) + match[0].indexOf(body), body });
    }
    // The markup: what is left once scripts, styles and comments are blanked
    // out to the same length, so offsets still name lines.
    const blank = (s: string) => s.replace(/[^\n]/g, " ");
    const markup = text
      .replace(SCRIPT, blank)
      .replace(STYLE, blank)
      .replace(HTML_COMMENT, blank);
    markup.split("\n").forEach((line, index) => {
      if (CLAUDE_PATH.test(line)) {
        hits.push({ file, line: index + 1, text: line.trim() });
      }
    });
  } else {
    scripts.push({ at: 0, body: text });
  }
  for (const { at, body } of scripts) {
    for (const literal of literalsOf(body, path)) {
      if (CLAUDE_PATH.test(literal.value)) {
        hits.push({
          file,
          line: lineAt(text, at + literal.at),
          text: literal.value.split("\n")[0]?.trim() ?? "",
        });
      }
    }
  }
  return hits;
};

const files: string[] = [];
for (const dir of SOURCES) {
  walk(join(ROOT, dir), files);
}
const hits = files
  .filter((path) => !(relative(ROOT, path) in ALLOWED))
  .flatMap(hitsIn);

if (hits.length > 0) {
  console.error(
    `claude-paths:check: ${hits.length} path(s) into a Claude Code dir outside packages/core/src/paths.ts. Build them with its claudeHome / accountConfigDir / sessionConfigDir / userLayerPath / projectClaudeDir (or claude-dirs.ts's labels for a screen or a script), or add the file to ALLOWED in scripts/claude-paths-check.ts with the reason it may:`
  );
  for (const hit of hits) {
    console.error(`  ${hit.file}:${hit.line}  ${hit.text}`);
  }
  process.exit(1);
}
console.log(
  `claude-paths:check: ${files.length} files, no path into a Claude Code dir outside its owner (${Object.keys(ALLOWED).length} allowed, each with its reason).`
);

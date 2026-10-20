/**
 * `bun scripts/page-imports-check.ts` (part of `bun run lint`): a page
 * loads only what it needs. The artifact page (`/artifact/<id>`, an
 * artifact opened in a tab of its own) never reaches the conversation's
 * code: nothing under `src/lib/cawco/transcript/`, and no Composer.
 *
 * The graph is the page's static imports from source, read with
 * TypeScript's own parser, from what the page loads: its own route files,
 * the root layout and the client hooks. A type-only import is erased and
 * not followed; a dynamic `import()` loads on demand and is not followed.
 * No build: the landing gate runs none, and the static graph holds
 * everything a build's chunk for the page can hold (a bundler only drops
 * from it), so a path it finds is one to cut.
 *
 * Prints each forbidden file the page reaches with the chain that reaches
 * it; exits 1 on any.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";

const ROOT = resolve(import.meta.dir, "..");
const DASHBOARD = join(ROOT, "apps", "dashboard");
const SRC = join(DASHBOARD, "src");

/** Each page held to the rule: what it loads first, and what it must never reach. */
const PAGES: {
  entries: string[];
  forbidden: (file: string) => boolean;
  name: string;
}[] = [
  {
    name: "the artifact page (/artifact/<id>)",
    entries: [
      "routes/artifact/[id]/+page.svelte",
      "routes/artifact/[id]/+page.ts",
      "routes/+layout.svelte",
      "routes/+layout.ts",
      "hooks.client.ts",
    ],
    forbidden: (file) =>
      file.startsWith("lib/cawco/transcript/") ||
      file.endsWith("/Composer.svelte"),
  },
];

const SCRIPT = /<script\b[^>]*>([\s\S]*?)<\/script>/g;
const CODE = /\.(svelte|ts|js|mjs)$/;
/** A `.js` specifier names its `.ts` source (TypeScript's own convention). */
const JS_EXTENSION = /\.js$/;

/** The specifiers a file loads statically: type-only imports and exports left out. */
function imports(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const code = file.endsWith(".svelte")
    ? [...text.matchAll(SCRIPT)].map((m) => m[1]).join("\n")
    : text;
  const source = ts.createSourceFile(
    file,
    code,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS
  );
  const out: string[] = [];
  for (const node of source.statements) {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const clause = node.importClause;
      const typeOnly =
        clause?.isTypeOnly === true ||
        (clause !== undefined &&
          clause.name === undefined &&
          clause.namedBindings !== undefined &&
          ts.isNamedImports(clause.namedBindings) &&
          clause.namedBindings.elements.length > 0 &&
          clause.namedBindings.elements.every((e) => e.isTypeOnly));
      if (!typeOnly) {
        out.push(node.moduleSpecifier.text);
      }
    } else if (
      ts.isExportDeclaration(node) &&
      !node.isTypeOnly &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      out.push(node.moduleSpecifier.text);
    }
  }
  return out;
}

/** A specifier as a file under src, or null for a package or a non-code import. */
function resolveFrom(from: string, spec: string): string | null {
  let base: string;
  if (spec === "#lib") {
    base = join(SRC, "lib", "index");
  } else if (spec.startsWith("#lib/")) {
    base = join(SRC, "lib", spec.slice("#lib/".length));
  } else if (spec.startsWith(".")) {
    base = resolve(dirname(from), spec);
  } else {
    return null;
  }
  const stem = base.replace(JS_EXTENSION, "");
  const tries = [
    base,
    `${stem}.ts`,
    `${stem}.svelte.ts`,
    `${stem}.js`,
    join(base, "index.ts"),
    join(base, "index.js"),
  ];
  const found = tries.find((p) => existsSync(p) && CODE.test(p));
  return found ?? null;
}

let failing = 0;
for (const page of PAGES) {
  const parent = new Map<string, string | null>();
  const queue: string[] = [];
  for (const entry of page.entries) {
    const file = join(SRC, entry);
    if (existsSync(file)) {
      parent.set(file, null);
      queue.push(file);
    }
  }
  const reached: string[] = [];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    const rel = relative(SRC, file);
    if (page.forbidden(rel)) {
      reached.push(file);
      continue;
    }
    for (const spec of imports(file)) {
      const next = resolveFrom(file, spec);
      if (next && !parent.has(next)) {
        parent.set(next, file);
        queue.push(next);
      }
    }
  }
  for (const file of reached) {
    failing += 1;
    const chain: string[] = [];
    for (let at: string | null | undefined = file; at; at = parent.get(at)) {
      chain.unshift(relative(SRC, at));
    }
    console.log(
      `${page.name} reaches ${relative(SRC, file)}:\n  ${chain.join("\n  → ")}`
    );
  }
  console.log(
    reached.length === 0
      ? `${page.name}: ${parent.size} modules, none of the conversation's`
      : `${page.name}: ${parent.size} modules, ${reached.length} of the conversation's`
  );
}
process.exit(failing === 0 ? 0 : 1);

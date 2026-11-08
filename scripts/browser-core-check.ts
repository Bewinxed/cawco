/**
 * bun scripts/browser-core-check.ts
 *
 * The dashboard's browser code loads no core module that reaches a Node or
 * Bun builtin: Vite externalises `node:*` for the browser and the first
 * property read on it throws, taking the whole page down. Each value import
 * of `@cawco/core/*` in the dashboard (its server files apart) is followed
 * through core's own value imports, and one that reaches a builtin is refused
 * with the path that got there. A type-only import loads nothing.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";

const ROOT = resolve(import.meta.dir, "..");
const CORE = join(ROOT, "packages/core/src");
const CORE_PREFIX = "@cawco/core/";
const BUILTIN = /^(?:node:|bun:|bun$)/u;
const SERVER_FILE = /(?:\.server\.ts$|\/\+server\.ts$|\/lib\/server\/)/u;
const SVELTE_SCRIPT = /<script[^>]*>([\s\S]*?)<\/script>/gu;

const moduleFile = (specifier: string, from: string): string | undefined => {
  let path: string;
  if (specifier.startsWith(CORE_PREFIX)) {
    path = join(CORE, specifier.slice(CORE_PREFIX.length));
  } else if (specifier.startsWith(".")) {
    path = resolve(dirname(from), specifier);
  } else {
    return;
  }
  return [path, `${path}.ts`].find(
    (candidate) => candidate.endsWith(".ts") && existsSync(candidate)
  );
};

/** The specifiers a source loads when it runs. */
const loadedBy = (text: string): string[] => {
  const source = ts.createSourceFile(
    "m.ts",
    text,
    ts.ScriptTarget.Latest,
    true
  );
  const found: string[] = [];
  const typeOnly = (statement: ts.ImportDeclaration): boolean => {
    const clause = statement.importClause;
    const named = clause?.namedBindings;
    return (
      clause?.isTypeOnly === true ||
      (clause?.name === undefined &&
        named !== undefined &&
        ts.isNamedImports(named) &&
        named.elements.length > 0 &&
        named.elements.every((element) => element.isTypeOnly))
    );
  };
  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      !typeOnly(node)
    ) {
      found.push(node.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      !node.isTypeOnly
    ) {
      found.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node)) {
      const [argument] = node.arguments;
      if (
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        argument &&
        ts.isStringLiteral(argument)
      ) {
        found.push(argument.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
};

const walked = new Map<string, string[] | null>();
/** The chain from `file` to a builtin, or null when it reaches none. */
const toBuiltin = (file: string): string[] | null => {
  const known = walked.get(file);
  if (known !== undefined) {
    return known;
  }
  walked.set(file, null);
  const label = relative(ROOT, file);
  for (const specifier of loadedBy(readFileSync(file, "utf8"))) {
    if (BUILTIN.test(specifier)) {
      const chain = [label, specifier];
      walked.set(file, chain);
      return chain;
    }
    const next = moduleFile(specifier, file);
    const rest = next ? toBuiltin(next) : null;
    if (rest) {
      const chain = [label, ...rest];
      walked.set(file, chain);
      return chain;
    }
  }
  return null;
};

const refused: string[] = [];
const dashboardFiles = new Bun.Glob("apps/dashboard/src/**/*.{ts,svelte}");
for await (const file of dashboardFiles.scan({ cwd: ROOT })) {
  if (SERVER_FILE.test(file)) {
    continue;
  }
  const text = readFileSync(join(ROOT, file), "utf8");
  const code = file.endsWith(".svelte")
    ? [...text.matchAll(SVELTE_SCRIPT)].map((match) => match[1]).join("\n")
    : text;
  for (const specifier of loadedBy(code)) {
    if (!specifier.startsWith(CORE_PREFIX)) {
      continue;
    }
    const target = moduleFile(specifier, join(ROOT, file));
    const chain = target ? toBuiltin(target) : null;
    if (chain) {
      refused.push(`${file} loads ${chain.join(" -> ")}`);
    }
  }
}

if (refused.length > 0) {
  throw new Error(
    `browser-core:check: ${refused.length} dashboard import(s) of core reach a Node or Bun builtin, which the browser cannot load. Import the type alone, or split the browser half out:\n${refused.join("\n")}`
  );
}
console.log(
  `browser-core:check: ${walked.size} core module(s) the dashboard loads reach no builtin`
);

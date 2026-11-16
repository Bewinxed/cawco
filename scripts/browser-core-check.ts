/**
 * bun scripts/browser-core-check.ts
 *
 * The dashboard's browser code loads no workspace module that needs Node or
 * Bun: Vite externalises `node:*` for the browser and the first property read
 * on it throws, and a global only a server has (`Buffer`, `process`) is a
 * ReferenceError where it is read, taking the whole page down. Each value
 * import of a workspace package in the dashboard (its server files apart) is
 * followed through every workspace module it loads, core's and every other
 * package's (`@cawco/jsonl-parser`'s entry loads its scanner, which reads
 * `Buffer` as it loads), and one that imports a builtin or reads such a
 * global is refused with the path that got there. A type-only import loads
 * nothing, and a global named in a type, a property's name or after
 * `typeof` reads nothing.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { importGraph } from "./lib/import-graph";
import { parsed } from "./lib/parse-source";
import { ROOT, repoFiles } from "./lib/repo-files";

// Read at run time beyond its imports; check.ts keys the check on them.
export const checkReads = ["apps/dashboard/src/", "packages/"];

const DASHBOARD = "apps/dashboard/src/";
const PACKAGES = /^packages\/[^/]+\/src\//u;
const WORKSPACE_PREFIX = "@cawco/";
const CODE = /\.(?:ts|svelte)$/u;
const BUILTIN = /^(?:node:|bun:|bun$)/u;
const SERVER_FILE = /(?:\.server\.ts$|\/\+server\.ts$|\/lib\/server\/)/u;
/** The globals a server has and a browser has not. */
const SERVER_GLOBALS: ReadonlySet<string> = new Set([
  "Buffer",
  "process",
  "__dirname",
  "__filename",
  "require",
  "global",
]);

const present = repoFiles();
const graph = importGraph(
  present.filter(
    (file) =>
      CODE.test(file) && (file.startsWith(DASHBOARD) || PACKAGES.test(file))
  ),
  new Set(present)
);

/** Whether `node` names something rather than reading it: a declaration, a property, a type. */
const namesOnly = (node: ts.Identifier): boolean => {
  const { parent } = node;
  if (
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    (ts.isQualifiedName(parent) && parent.right === node) ||
    ((ts.isPropertyAssignment(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isGetAccessor(parent) ||
      ts.isSetAccessor(parent) ||
      ts.isEnumMember(parent)) &&
      parent.name === node) ||
    ts.isTypeOfExpression(parent)
  ) {
    return true;
  }
  for (let at: ts.Node = node; at.parent; at = at.parent) {
    if (ts.isTypeNode(at) && !ts.isExpressionWithTypeArguments(at)) {
      return true;
    }
  }
  return false;
};

/** The names `source` declares itself, which its reads of them read. */
const declaredIn = (source: ts.SourceFile): Set<string> => {
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (
      (ts.isVariableDeclaration(node) ||
        ts.isParameter(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isImportSpecifier(node) ||
        ts.isImportClause(node) ||
        ts.isNamespaceImport(node) ||
        ts.isBindingElement(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    ) {
      names.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return names;
};

/** The first server global `file` reads, at its line; none when it reads none. */
const serverGlobalOf = (file: string): string | undefined => {
  const text = readFileSync(join(ROOT, file), "utf8");
  const source = parsed(file, text);
  const own = declaredIn(source);
  let found: string | undefined;
  const visit = (node: ts.Node): void => {
    if (found) {
      return;
    }
    if (
      ts.isIdentifier(node) &&
      SERVER_GLOBALS.has(node.text) &&
      !own.has(node.text) &&
      !namesOnly(node)
    ) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart());
      found = `${node.text} (line ${line + 1})`;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
};

const walked = new Map<string, string[] | null>();
/** The chain from `file` to a builtin or a server global, or null when it reaches none. */
const toServer = (file: string): string[] | null => {
  const known = walked.get(file);
  if (known !== undefined) {
    return known;
  }
  walked.set(file, null);
  const read = serverGlobalOf(file);
  if (read) {
    const chain = [file, `reads ${read}`];
    walked.set(file, chain);
    return chain;
  }
  for (const { specifier, file: next, typeOnly } of graph.get(file) ?? []) {
    if (typeOnly) {
      continue;
    }
    if (BUILTIN.test(specifier)) {
      const chain = [file, specifier];
      walked.set(file, chain);
      return chain;
    }
    const rest =
      next && graph.has(next) && PACKAGES.test(next) ? toServer(next) : null;
    if (rest) {
      const chain = [file, ...rest];
      walked.set(file, chain);
      return chain;
    }
  }
  return null;
};

const refused: string[] = [];
for (const [file, edges] of graph) {
  if (!file.startsWith(DASHBOARD) || SERVER_FILE.test(file)) {
    continue;
  }
  for (const { specifier, file: target, typeOnly } of edges) {
    if (
      !typeOnly &&
      specifier.startsWith(WORKSPACE_PREFIX) &&
      target &&
      graph.has(target) &&
      PACKAGES.test(target)
    ) {
      const chain = toServer(target);
      if (chain) {
        refused.push(`${file} loads ${chain.join(" -> ")}`);
      }
    }
  }
}

if (refused.length > 0) {
  throw new Error(
    `browser-core:check: ${refused.length} dashboard import(s) of a workspace package reach a Node or Bun builtin, or a global only a server has, which the browser cannot load. Import the type alone, or split the browser half out:\n${refused.join("\n")}`
  );
}
console.log(
  `browser-core:check: ${walked.size} workspace module(s) the dashboard loads reach no builtin and read no server global`
);

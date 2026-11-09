/**
 * The repository's import graph, read off each file's syntax: every import
 * and re-export declaration (`import type` and `export type` among them), each
 * `import("x")` call or type, each `require("x")` and `import x = require()`,
 * in TypeScript and in a Svelte component's `<script>` blocks, each specifier
 * resolved through the workspace's own manifests (workspace-imports.ts).
 * Biome's noImportCycles reads no `.svelte` file, and dependency-cruiser
 * compiles a component before it reads it, losing its type imports; this
 * reads both.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { parsed } from "./parse-source";
import { ROOT } from "./repo-files";
import { fileAt, targetOf } from "./workspace-imports";

/** One import in a file. */
export interface Import {
  /** Whether it loads on demand (`import("x")`), not when its file loads. */
  dynamic: boolean;
  /** The file it lands on, when it is one of the repository's. */
  file?: string;
  /** Its 1-based line. */
  line: number;
  specifier: string;
  /** Whether it loads nothing at runtime (`import type`, `export type`, an `import("x")` type). */
  typeOnly: boolean;
}

const importIsTypeOnly = (node: ts.ImportDeclaration): boolean => {
  const clause = node.importClause;
  if (!clause) {
    return false;
  }
  if (clause.isTypeOnly) {
    return true;
  }
  const bindings = clause.namedBindings;
  return (
    clause.name === undefined &&
    bindings !== undefined &&
    ts.isNamedImports(bindings) &&
    bindings.elements.length > 0 &&
    bindings.elements.every((element) => element.isTypeOnly)
  );
};

/** The specifiers `source` names, each with whether it is a type alone or loaded on demand. */
const specifiersOf = (source: ts.SourceFile): Import[] => {
  const found: Import[] = [];
  const add = (literal: ts.Node, typeOnly: boolean, dynamic = false): void => {
    if (ts.isStringLiteralLike(literal)) {
      found.push({
        specifier: literal.text,
        typeOnly,
        dynamic,
        line:
          source.getLineAndCharacterOfPosition(literal.getStart(source)).line +
          1,
      });
    }
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      add(node.moduleSpecifier, importIsTypeOnly(node));
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      add(node.moduleSpecifier, node.isTypeOnly);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      add(node.moduleReference.expression, node.isTypeOnly);
    } else if (ts.isImportTypeNode(node)) {
      const { argument } = node;
      if (ts.isLiteralTypeNode(argument)) {
        add(argument.literal, true);
      }
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length > 0 &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    ) {
      add(
        node.arguments[0] as ts.Expression,
        false,
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
};

/** The imports of `file` (its text `text`), each resolved within `present`. */
const importsOf = (
  file: string,
  text: string,
  present: ReadonlySet<string>
): Import[] =>
  specifiersOf(parsed(file, text)).map((found) => {
    const target = targetOf(file, found.specifier);
    const landed = target === undefined ? undefined : fileAt(target, present);
    return landed === undefined ? found : { ...found, file: landed };
  });

/** Each file's imports, read from the checkout. */
export const importGraph = (
  files: readonly string[],
  present: ReadonlySet<string> = new Set(files)
): Map<string, Import[]> =>
  new Map(
    files.map((file) => [
      file,
      importsOf(file, readFileSync(join(ROOT, file), "utf8"), present),
    ])
  );

/** Tarjan's bookkeeping over one graph. */
interface Walk {
  counter: number;
  found: string[][];
  index: Map<string, number>;
  low: Map<string, number>;
  next: (file: string) => string[];
  onStack: Set<string>;
  stack: string[];
}

const open = (walk: Walk, file: string): void => {
  walk.index.set(file, walk.counter);
  walk.low.set(file, walk.counter);
  walk.counter += 1;
  walk.stack.push(file);
  walk.onStack.add(file);
};

const lower = (walk: Walk, file: string, to: number): void => {
  walk.low.set(file, Math.min(walk.low.get(file) as number, to));
};

/** Closes `file`: when it roots a component, pops the component off the stack. */
const close = (walk: Walk, file: string): void => {
  if (walk.low.get(file) !== walk.index.get(file)) {
    return;
  }
  const component: string[] = [];
  let popped: string;
  do {
    popped = walk.stack.pop() as string;
    walk.onStack.delete(popped);
    component.push(popped);
  } while (popped !== file);
  if (component.length > 1) {
    walk.found.push(component.sort());
  }
};

/** Tarjan's depth-first walk from `root`, iterative so a deep graph never overflows. */
const strongConnect = (walk: Walk, root: string): void => {
  open(walk, root);
  const work = [{ file: root, next: walk.next(root), at: 0 }];
  while (work.length > 0) {
    const top = work.at(-1) as (typeof work)[number];
    const to = top.next[top.at];
    if (to !== undefined) {
      top.at += 1;
      if (!walk.index.has(to)) {
        open(walk, to);
        work.push({ file: to, next: walk.next(to), at: 0 });
      } else if (walk.onStack.has(to)) {
        lower(walk, top.file, walk.index.get(to) as number);
      }
      continue;
    }
    work.pop();
    const parent = work.at(-1);
    if (parent) {
      lower(walk, parent.file, walk.low.get(top.file) as number);
    }
    close(walk, top.file);
  }
};

/**
 * The graph's strongly connected components of more than one file (Tarjan's
 * algorithm): every import from one file of a component to another of it
 * lies on a cycle. A file importing itself (a recursive Svelte component, a
 * type naming its own module) is no cycle between files.
 */
export const cycles = (graph: ReadonlyMap<string, Import[]>): string[][] => {
  const walk: Walk = {
    counter: 0,
    found: [],
    index: new Map(),
    low: new Map(),
    onStack: new Set(),
    stack: [],
    next: (file) => [
      ...new Set(
        (graph.get(file) ?? [])
          .map((edge) => edge.file)
          .filter(
            (to): to is string =>
              to !== undefined && to !== file && graph.has(to)
          )
      ),
    ],
  };
  for (const root of graph.keys()) {
    if (!walk.index.has(root)) {
      strongConnect(walk, root);
    }
  }
  return walk.found;
};

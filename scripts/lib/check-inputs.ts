/**
 * What a check reads, for check.ts to key it on: the import closure of its
 * script (every module its runtime loads, read off the syntax by
 * import-graph.ts; a type-only import loads nothing and is no input), the
 * files named by the `export const checkReads = ["…"]` of any module of that
 * closure (a file, a folder ending `/`, a glob, or `./` for every file), and the lockfile when the closure imports an installed package.
 */
import { readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { join } from "node:path";
import ts from "typescript";
import { importsOf } from "./import-graph";
import { parsed } from "./parse-source";
import { ROOT } from "./repo-files";

const CODE = /\.(?:[cm]?[jt]sx?|svelte)$/u;
const BUILTIN = new Set(builtinModules);

/** Whether `specifier` names an installed package (not a Node or Bun built-in). */
const isPackage = (specifier: string): boolean =>
  !(
    specifier.startsWith(".") ||
    specifier.startsWith("#") ||
    specifier.startsWith("node:") ||
    specifier.startsWith("bun:") ||
    specifier === "bun" ||
    BUILTIN.has(specifier.split("/")[0] as string)
  );

/** The strings of the module's top-level `export const checkReads = ["…", …]`, none when it has none. */
const declaredReads = (file: string, text: string): string[] => {
  for (const statement of parsed(file, text).statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === "checkReads"
      ) {
        const list = declaration.initializer;
        if (!(
          list &&
          ts.isArrayLiteralExpression(list) &&
          list.elements.every((element) => ts.isStringLiteralLike(element))
        )) {
          throw new Error(
            `${file}: checkReads is an array of string literals, so check.ts can read it off the syntax`
          );
        }
        return list.elements.map(
          (element) => (element as ts.StringLiteral).text
        );
      }
    }
  }
  return [];
};

/** A check's inputs: the files of its import closure, its declared reads, and whether it loads an installed package. */
export interface Inputs {
  /** The files and folders (ending `/`) and globs its modules declare. */
  declared: string[];
  /** The modules its runtime loads. */
  modules: Set<string>;
  packages: boolean;
}

/** The inputs of the script `entries`, within `present` (the repository's files). */
export const inputsOf = (
  entries: readonly string[],
  present: ReadonlySet<string>
): Inputs => {
  const inputs: Inputs = {
    modules: new Set(),
    declared: [],
    packages: false,
  };
  const queue = [...entries];
  for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
    if (inputs.modules.has(file)) {
      continue;
    }
    inputs.modules.add(file);
    if (!(CODE.test(file) && present.has(file))) {
      continue;
    }
    const text = readFileSync(join(ROOT, file), "utf8");
    inputs.declared.push(...declaredReads(file, text));
    for (const edge of importsOf(file, text, present)) {
      if (edge.typeOnly) {
        continue;
      }
      if (edge.file) {
        queue.push(edge.file);
      } else if (isPackage(edge.specifier)) {
        inputs.packages = true;
      }
    }
  }
  return inputs;
};

/** The repository's `files` that `inputs` names: its modules, and what its reads match. */
export const filesOf = (inputs: Inputs, files: readonly string[]): string[] => {
  if (inputs.declared.includes("./")) {
    return [...files];
  }
  const globs = inputs.declared
    .filter((path) => path.includes("*"))
    .map((path) => new Bun.Glob(path.endsWith("/") ? `${path}**` : path));
  const named = new Set(inputs.declared);
  const folders = inputs.declared.filter(
    (path) => path.endsWith("/") && !path.includes("*")
  );
  return files.filter(
    (path) =>
      inputs.modules.has(path) ||
      named.has(path) ||
      folders.some((folder) => path.startsWith(folder)) ||
      globs.some((glob) => glob.match(path))
  );
};

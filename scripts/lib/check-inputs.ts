/**
 * What a check reads, for check.ts to key it on: the import closure of its
 * script (every module its runtime loads, read off the syntax by
 * import-graph.ts; a type-only import loads nothing and is no input), the
 * files named by the `export const checkReads = ["…"]` of any module of that
 * closure (a file, a folder ending `/`, a glob, or `./` for every file), and
 * what the install read when the check reads installed packages.
 *
 * A check reads installed packages when its closure imports one (a load
 * that is not type-only, of a name that is no built-in), or when it declares
 * `node_modules/`: a script that runs an installed binary, opens a package by
 * path or imports one by a computed name, and a check with no script that is
 * an installed tool. `node_modules/` matches no file of the repository; it
 * stands for the files the install read (lib/installed.ts `INSTALL_READS`,
 * the lockfile and the patches), which say what is installed while the
 * install's own record matches them (check.ts stops on `installedOrExit`
 * before reading any pass). A check that greps or parses the repository's
 * own files with the platform alone reads none, and a change of package
 * leaves its pass standing.
 */
import { readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { join } from "node:path";
import ts from "typescript";
import { importsOf } from "./import-graph";
import { INSTALL_READS } from "./installed";
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

/** The read that stands for the installed packages ({@link filesOf}). */
const INSTALLED = "node_modules/";

/** A check's inputs: the files of its import closure and its declared reads. */
export interface Inputs {
  /** The files and folders (ending `/`) and globs its modules declare, {@link INSTALLED} when it loads an installed package. */
  declared: string[];
  /** The modules its runtime loads. */
  modules: Set<string>;
}

/** The inputs of the script `entries`, within `present` (the repository's files). */
export const inputsOf = (
  entries: readonly string[],
  present: ReadonlySet<string>
): Inputs => {
  const inputs: Inputs = {
    modules: new Set(),
    declared: [],
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
        inputs.declared.push(INSTALLED);
      }
    }
  }
  return inputs;
};

/** The repository's `files` that `inputs` names: its modules, what its reads match, and what the install read for {@link INSTALLED}. */
export const filesOf = (inputs: Inputs, files: readonly string[]): string[] => {
  if (inputs.declared.includes("./")) {
    return [...files];
  }
  const reads = inputs.declared.includes(INSTALLED)
    ? [...inputs.declared, ...INSTALL_READS]
    : inputs.declared;
  const globs = reads
    .filter((path) => path.includes("*"))
    .map((path) => new Bun.Glob(path.endsWith("/") ? `${path}**` : path));
  const named = new Set(reads);
  const folders = reads.filter(
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

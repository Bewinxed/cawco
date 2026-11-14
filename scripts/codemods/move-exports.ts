// Points every import of some names at the module they moved to: each import
// declaration that names one of them from `<from>` gives those specifiers to
// an import of `<to>` (beside it, or merged into one that file already has),
// keeping each specifier's `type` and alias; a declaration left naming
// nothing is deleted. The declarations themselves are moved by hand or by the
// commit that runs this; this moves their importers.
//
// Relative specifiers only (a package's own files): an import through a
// package name is left alone, for the type check to name.
//
//   bun scripts/codemods/move-exports.ts <from> <to> <name>...
//     <from>, <to>: repository paths of the modules, like packages/hub/src/at-limit.ts
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { ROOT, repoFiles } from "../lib/repo-files";

const [fromArg, toArg, ...names] = process.argv.slice(2);
if (!(fromArg && toArg) || names.length === 0) {
  throw new Error("Usage: move-exports.ts <from> <to> <name>...");
}
const from = resolve(ROOT, fromArg);
const to = resolve(ROOT, toArg);
const moved = new Set(names);
const CODE = /\.(?:[cm]?[jt]sx?|svelte)$/u;
const EXTENSION = /\.[cm]?[jt]sx?$/u;

/** The file a relative specifier of `file` names, without its extension. */
const landing = (file: string, specifier: string): string | undefined =>
  specifier.startsWith(".")
    ? resolve(dirname(file), specifier).replace(EXTENSION, "")
    : undefined;

/** The specifier `file` writes for `target`, in the house's spelling (`./x`, `../x`). */
const specifierFor = (file: string, target: string): string => {
  const path = relative(dirname(file), target).replace(EXTENSION, "");
  return path.startsWith(".") ? path : `./${path}`;
};

const fromBase = from.replace(EXTENSION, "");
const toBase = to.replace(EXTENSION, "");
let rewritten = 0;

for (const repoFile of repoFiles().filter((one) => CODE.test(one))) {
  const file = join(ROOT, repoFile);
  if (file === to) {
    continue;
  }
  const text = readFileSync(file, "utf8");
  if (!text.includes(fromBase.split("/").at(-1) ?? "")) {
    continue;
  }
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const edits: { start: number; end: number; text: string }[] = [];
  const carried: string[] = [];
  let into: ts.ImportDeclaration | undefined;
  for (const statement of source.statements) {
    if (!(
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier)
    )) {
      continue;
    }
    const target = landing(file, statement.moduleSpecifier.text);
    if (target === toBase) {
      into = statement;
    }
    const clause = statement.importClause;
    const bindings = clause?.namedBindings;
    if (
      target !== fromBase ||
      !clause ||
      !bindings ||
      !ts.isNamedImports(bindings)
    ) {
      continue;
    }
    const going = bindings.elements.filter((one) =>
      moved.has((one.propertyName ?? one.name).text)
    );
    if (going.length === 0) {
      continue;
    }
    const whole = clause.isTypeOnly ? "type " : "";
    carried.push(
      ...going.map((one) =>
        clause.isTypeOnly ? `type ${one.getText(source)}` : one.getText(source)
      )
    );
    const staying = bindings.elements.filter((one) => !going.includes(one));
    edits.push({
      start: statement.getStart(source),
      end: statement.getEnd(),
      text:
        staying.length === 0 && !clause.name
          ? ""
          : `import ${whole}${clause.name ? `${clause.name.text}, ` : ""}{ ${staying
              .map((one) => one.getText(source))
              .join(", ")} } from "${statement.moduleSpecifier.text}";`,
    });
  }
  if (carried.length === 0) {
    continue;
  }
  const intoClause = into?.importClause;
  const intoBindings = intoClause?.namedBindings;
  if (intoClause && intoBindings && ts.isNamedImports(intoBindings)) {
    // Into `import type { … }`: types stay bare there; a value turns the
    // declaration into a plain import whose types say so one by one.
    const allTypes = carried.every((one) => one.startsWith("type "));
    const kept = intoBindings.elements.map((one) =>
      intoClause.isTypeOnly && !allTypes
        ? `type ${one.getText(source)}`
        : one.getText(source)
    );
    const added = carried.map((one) =>
      intoClause.isTypeOnly && allTypes ? one.slice("type ".length) : one
    );
    edits.push({
      start: (into as ts.ImportDeclaration).getStart(source),
      end: intoBindings.getEnd(),
      text: `import ${intoClause.isTypeOnly && allTypes ? "type " : ""}{ ${[...kept, ...added].join(", ")} }`,
    });
  } else {
    const first = edits[0] as { start: number; text: string };
    first.text = `${first.text}${first.text ? "\n" : ""}import { ${carried.join(", ")} } from "${specifierFor(file, to)}";`;
  }
  let next = text;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    next = next.slice(0, edit.start) + edit.text + next.slice(edit.end);
  }
  writeFileSync(file, next);
  rewritten += 1;
}

process.stdout.write(
  `move-exports: ${rewritten} files now import ${names.length} names from ${relative(ROOT, to)}\n`
);

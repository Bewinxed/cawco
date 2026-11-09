/**
 * `bun scripts/doc-links-check.ts` (part of `bun run check`): every
 * `{@link import("<module>").<Name>}` in a doc comment names a module that
 * exports `<Name>`. The compiler reads none of these, so a name that moves
 * leaves the link behind: transcript-types.ts kept pointing
 * `CONTINUATION_ORIGIN` at harness.ts after it moved to harness/kinds.ts,
 * and openapi.json carried the stale link in a description.
 *
 * Each module is resolved as Bun resolves an import from the file (relative
 * paths and workspace packages' `exports` alike) and read with the
 * TypeScript parser for its exported names. Prints `file:line: module.Name`
 * for each link that does not resolve; exits 1 on any.
 */
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import ts from "typescript";

const ROOT = join(import.meta.dir, "..");
const SOURCES = /^(?:packages|apps\/dashboard|apps\/cawrier|scripts)\//u;
const LINK = /\{@link import\("([^"]+)"\)\.(\w+)\}/gu;

/** The names one statement exports: its declarations, or an `export { … }` list's. */
const exportedBy = (statement: ts.Statement): string[] => {
  if (ts.isExportDeclaration(statement)) {
    const clause = statement.exportClause;
    return clause && ts.isNamedExports(clause)
      ? clause.elements.map((element) => element.name.text)
      : [];
  }
  const exporting =
    ts.canHaveModifiers(statement) &&
    ts
      .getModifiers(statement)
      ?.some((one) => one.kind === ts.SyntaxKind.ExportKeyword);
  if (!exporting) {
    return [];
  }
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.flatMap((declaration) =>
      ts.isIdentifier(declaration.name) ? [declaration.name.text] : []
    );
  }
  const { name } = statement as ts.Statement & { name?: ts.Node };
  return name && ts.isIdentifier(name) ? [name.text] : [];
};

/** The names a module exports, by the parser. */
const exportsOf = new Map<string, Set<string>>();
const exported = (file: string): Set<string> => {
  const known = exportsOf.get(file);
  if (known) {
    return known;
  }
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest
  );
  const names = new Set(source.statements.flatMap(exportedBy));
  exportsOf.set(file, names);
  return names;
};

const stale: string[] = [];
const files = [...new Bun.Glob("**/*.{ts,svelte}").scanSync({ cwd: ROOT })]
  .filter((path) => SOURCES.test(path) && !path.includes("node_modules/"))
  .sort();
for (const path of files) {
  const text = readFileSync(join(ROOT, path), "utf8");
  if (!text.includes("{@link import(")) {
    continue;
  }
  for (const found of text.matchAll(LINK)) {
    const [, module = "", name = ""] = found;
    const line = text.slice(0, found.index).split("\n").length;
    let target: string | undefined;
    try {
      target = Bun.resolveSync(module, dirname(join(ROOT, path)));
    } catch {
      target = undefined;
    }
    if (!(target && exported(target).has(name))) {
      stale.push(
        `${path}:${line}: ${module}.${name}${target ? ` (${relative(ROOT, target)} exports no ${name})` : " (no such module)"}`
      );
    }
  }
}
if (stale.length) {
  console.error(
    `A doc comment links a name its module does not export; point each at the module that does:\n${stale.join("\n")}`
  );
  process.exit(1);
}
console.log(
  `doc-links-check: every {@link import()} resolves (${files.length} files)`
);

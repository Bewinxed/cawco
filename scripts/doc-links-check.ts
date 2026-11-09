/**
 * `bun scripts/doc-links-check.ts` (part of `bun run check`): every
 * `@link import("<module>").<Name>` in a doc comment names a module that
 * exports `<Name>`, with or without a member path (`.<Name>.field`) or a
 * label (`@link import("m").Name | its name`), as `@linkcode` and
 * `@linkplain` too. The compiler reads none of these, so a name that moves
 * leaves the link behind: transcript-types.ts kept pointing
 * `CONTINUATION_ORIGIN` at harness.ts after it moved to harness/kinds.ts,
 * and openapi.json carried the stale link in a description.
 *
 * Each module is resolved as Bun resolves an import from the file (relative
 * paths and workspace packages' `exports` alike) and read with the
 * TypeScript parser for its exported names, through its `export * from`s;
 * `export default` exports `default`. Prints `file:line: module.Name` for
 * each link that does not resolve, and each `@link import(` it cannot read;
 * exits 1 on any.
 */
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import ts from "typescript";

const ROOT = join(import.meta.dir, "..");
const SOURCES = /^(?:packages|apps\/dashboard|apps\/cawrier|scripts)\//u;
/** Where a link to an import starts. */
const OPENER = /\{@link(?:code|plain)?\s+import\(/gu;
/** One such link: its module, the name it exports, then any member path or label. */
const LINK =
  /\{@link(?:code|plain)?\s+import\((["'])([^"']+)\1\)\.([\w$]+)(?:\.[\w$.]+)?(?:(?:\s*\|\s*|\s+)[^}]*)?\}/gu;

/** What the check found wrong, one line each. */
const stale: string[] = [];

/**
 * The names `export * from "<specifier>"` brings in: not the other module's
 * default. One that does not resolve is a problem of its own; one that names a
 * package adds nothing, for a package's names are no link's target.
 */
const starExports = (file: string, specifier: string): string[] => {
  let target: string;
  try {
    target = Bun.resolveSync(specifier, dirname(file));
  } catch {
    stale.push(
      `${relative(ROOT, file)}: export * from "${specifier}" does not resolve`
    );
    return [];
  }
  return target.includes("/node_modules/")
    ? []
    : [...exported(target)].filter((name) => name !== "default");
};

/**
 * The names one statement of `file` exports: its declarations, an
 * `export { … }` list's, an `export * as name`'s name, everything an
 * `export * from` module exports, or `default`.
 */
const exportedBy = (file: string, statement: ts.Statement): string[] => {
  if (ts.isExportAssignment(statement)) {
    return statement.isExportEquals ? [] : ["default"];
  }
  if (ts.isExportDeclaration(statement)) {
    const clause = statement.exportClause;
    if (clause && ts.isNamedExports(clause)) {
      return clause.elements.map((element) => element.name.text);
    }
    if (clause && ts.isNamespaceExport(clause)) {
      return [clause.name.text];
    }
    const from = statement.moduleSpecifier;
    if (!(from && ts.isStringLiteral(from))) {
      return [];
    }
    return starExports(file, from.text);
  }
  const modifiers = ts.canHaveModifiers(statement)
    ? (ts.getModifiers(statement) ?? [])
    : [];
  if (!modifiers.some((one) => one.kind === ts.SyntaxKind.ExportKeyword)) {
    return [];
  }
  if (modifiers.some((one) => one.kind === ts.SyntaxKind.DefaultKeyword)) {
    return ["default"];
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
const reading = new Set<string>();
/** How many times a read met a module already being read. */
let cuts = 0;
function exported(file: string): Set<string> {
  const known = exportsOf.get(file);
  if (known) {
    return known;
  }
  const names = new Set<string>();
  if (reading.has(file)) {
    // Two modules exporting each other's `*` end here, with an empty set (the caller does not cache what it read around it).
    cuts += 1;
    return names;
  }
  reading.add(file);
  const before = cuts;
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest
  );
  for (const statement of source.statements) {
    for (const name of exportedBy(file, statement)) {
      names.add(name);
    }
  }
  reading.delete(file);
  // A read that met a cycle may hold a partial set; only the outermost one is whole.
  if (cuts === before || reading.size === 0) {
    exportsOf.set(file, names);
  }
  return names;
}

const files = [...new Bun.Glob("**/*.{ts,svelte}").scanSync({ cwd: ROOT })]
  .filter(
    (path) =>
      SOURCES.test(path) &&
      !path.includes("node_modules/") &&
      // Its own comments and messages show the syntax with no module behind it.
      path !== relative(ROOT, import.meta.path)
  )
  .sort();
for (const path of files) {
  const text = readFileSync(join(ROOT, path), "utf8");
  const read = new Set([...text.matchAll(LINK)].map((found) => found.index));
  for (const found of text.matchAll(OPENER)) {
    if (!read.has(found.index)) {
      const line = text.slice(0, found.index).split("\n").length;
      stale.push(
        `${path}:${line}: a link this check cannot read; write it {@link import("<module>").<Name>}, a member path or label after`
      );
    }
  }
  for (const found of text.matchAll(LINK)) {
    const [, , module = "", name = ""] = found;
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
    `A doc link names a module or name that does not resolve; point each at the module that exports it:\n${[...new Set(stale)].join("\n")}`
  );
  process.exit(1);
}
console.log(
  `doc-links-check: every {@link import()} resolves (${files.length} files)`
);

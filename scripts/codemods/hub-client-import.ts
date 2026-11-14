// Points every import of the agent's own Eden client (its `hub-client`
// module, by `@cawco/agent/hub-client` or a relative path), moved and gone,
// at the shared one, packages/hub/src/client.ts: `@cawco/hub/client` from a package's source,
// the relative path from a script (the scripts resolve no workspace package
// by name). Only each import's specifier changes; what it names stays, and
// `biome check --write` sorts the imports after.
//
//   bun scripts/codemods/hub-client-import.ts
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { ROOT, repoFiles } from "../lib/repo-files";

const OLD = resolve(ROOT, "packages/agent/src/hub-client");
const NEW = resolve(ROOT, "packages/hub/src/client");
const CODE = /\.[cm]?tsx?$/u;
const EXTENSION = /\.[cm]?[jt]sx?$/u;

/** Whether `specifier`, written in `file`, names the agent's client. */
const namesOld = (file: string, specifier: string): boolean =>
  specifier === "@cawco/agent/hub-client" ||
  (specifier.startsWith(".") &&
    resolve(dirname(file), specifier).replace(EXTENSION, "") === OLD);

/** What `file` writes for the shared client. */
const specifierFor = (repoFile: string, file: string): string => {
  if (repoFile.startsWith("packages/") || repoFile.startsWith("apps/")) {
    return "@cawco/hub/client";
  }
  const path = relative(dirname(file), NEW);
  return path.startsWith(".") ? path : `./${path}`;
};

let changed = 0;
for (const repoFile of repoFiles().filter((one) => CODE.test(one))) {
  const file = join(ROOT, repoFile);
  const text = readFileSync(file, "utf8");
  if (!text.includes("hub-client")) {
    continue;
  }
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const edits: { end: number; start: number }[] = [];
  for (const statement of source.statements) {
    if (
      (ts.isImportDeclaration(statement) ||
        ts.isExportDeclaration(statement)) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      namesOld(file, statement.moduleSpecifier.text)
    ) {
      // Inside the quotes.
      edits.push({
        start: statement.moduleSpecifier.getStart(source) + 1,
        end: statement.moduleSpecifier.end - 1,
      });
    }
  }
  if (edits.length === 0) {
    continue;
  }
  const to = specifierFor(repoFile, file);
  let out = text;
  for (const { start, end } of edits.reverse()) {
    out = out.slice(0, start) + to + out.slice(end);
  }
  writeFileSync(file, out);
  changed += 1;
  console.log(`${repoFile}: ${edits.length} import(s) -> ${to}`);
}
console.log(`${changed} files point at the shared client`);

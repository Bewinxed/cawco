/**
 * `bun scripts/harnesses-check.ts` (part of `bun run check`):
 * docs/harnesses.md, the checklist for adding a harness, has one row for
 * every member a harness adapter meets, and no row for one that is gone.
 *
 * It reads, with the TypeScript compiler's parser, the members of the
 * interfaces `Harness`, `HarnessSession` and `HarnessContext`
 * (packages/agent/src/harness.ts) and `SessiondAdoption`
 * (packages/agent/src/session.ts), and the keys of `FULL_CAPABILITIES`
 * (packages/agent/src/harnesses/capabilities.ts). Each has a section of the
 * page whose heading names it in backticks (`### 2.1 \`Harness\` members`);
 * a row's first cell names one member in backticks.
 *
 * Fails, naming each, on a member with no row, a row naming no member, and a
 * section the page lacks. Prints `harnesses-check: …`; exits 1 on any.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const ROOT = join(import.meta.dir, "..");
const PAGE = "docs/harnesses.md";

interface Source {
  /** The file it is declared in, from the repository's root. */
  file: string;
  /** How it is read: an interface's members, or an object literal's keys. */
  form: "interface" | "object";
  name: string;
}

const SOURCES: readonly Source[] = [
  { name: "Harness", form: "interface", file: "packages/agent/src/harness.ts" },
  {
    name: "HarnessSession",
    form: "interface",
    file: "packages/agent/src/harness.ts",
  },
  {
    name: "HarnessContext",
    form: "interface",
    file: "packages/agent/src/harness.ts",
  },
  {
    name: "SessiondAdoption",
    form: "interface",
    file: "packages/agent/src/session.ts",
  },
  {
    name: "FULL_CAPABILITIES",
    form: "object",
    file: "packages/agent/src/harnesses/capabilities.ts",
  },
];

/** A member's name as written: an identifier or a string literal. */
const nameOf = (name: ts.PropertyName | undefined): string | undefined =>
  name && (ts.isIdentifier(name) || ts.isStringLiteral(name))
    ? name.text
    : undefined;

/** The object literal `name` is declared as in `file`, through `satisfies` and `as`. */
const objectNamed = (
  file: ts.SourceFile,
  name: string
): ts.ObjectLiteralExpression | undefined => {
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      let value = declaration.initializer;
      while (
        value &&
        (ts.isSatisfiesExpression(value) || ts.isAsExpression(value))
      ) {
        value = value.expression;
      }
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === name &&
        value &&
        ts.isObjectLiteralExpression(value)
      ) {
        return value;
      }
    }
  }
  return undefined;
};

/** Each member of `source`, by name, with the line it is declared on. */
const membersOf = (source: Source): Map<string, number> | undefined => {
  const path = join(ROOT, source.file);
  const file = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true
  );
  const members =
    source.form === "interface"
      ? file.statements.find(
          (statement): statement is ts.InterfaceDeclaration =>
            ts.isInterfaceDeclaration(statement) &&
            statement.name.text === source.name
        )?.members
      : objectNamed(file, source.name)?.properties;
  if (!members) {
    return undefined;
  }
  const found = new Map<string, number>();
  for (const member of members) {
    const name = nameOf(member.name);
    if (name) {
      found.set(
        name,
        file.getLineAndCharacterOfPosition(member.getStart(file)).line + 1
      );
    }
  }
  return found;
};

/** A row's first cell: one name in backticks. */
const ROW = /^\|\s*`([^`]+)`\s*\|/u;
/** A section's heading, and the first name in backticks it holds. */
const HEADING = /^#{2,4}\s.*?`([^`]+)`/u;

/** Each section of the page, by the name its heading holds: its rows' names, with the page's line of each. */
const sectionsOf = (text: string): Map<string, Map<string, number>> => {
  const sections = new Map<string, Map<string, number>>();
  let rows: Map<string, number> | undefined;
  for (const [index, line] of text.split("\n").entries()) {
    if (line.startsWith("#")) {
      const named = HEADING.exec(line)?.[1];
      rows =
        named && SOURCES.some((one) => one.name === named)
          ? new Map()
          : undefined;
      if (named && rows) {
        sections.set(named, rows);
      }
      continue;
    }
    const row = rows && ROW.exec(line)?.[1];
    if (rows && row) {
      rows.set(row, index + 1);
    }
  }
  return sections;
};

const sections = sectionsOf(readFileSync(join(ROOT, PAGE), "utf8"));
const wrong: string[] = [];
let counted = 0;
for (const source of SOURCES) {
  const members = membersOf(source);
  if (!members) {
    wrong.push(
      `${source.file}: no ${source.name} to read; this check names where each lives`
    );
    continue;
  }
  counted += members.size;
  const rows = sections.get(source.name);
  if (!rows) {
    wrong.push(`${PAGE}: no section whose heading names \`${source.name}\``);
    continue;
  }
  for (const [member, line] of members) {
    if (!rows.has(member)) {
      wrong.push(
        `${PAGE}: no row for ${source.name}.${member} (${source.file}:${line}); add one to the \`${source.name}\` section saying how each harness meets it`
      );
    }
  }
  for (const [row, line] of rows) {
    if (!members.has(row)) {
      wrong.push(
        `${PAGE}:${line}: row \`${row}\` names no member of ${source.name} (${source.file}); remove it or name the member it is now`
      );
    }
  }
}

if (wrong.length > 0) {
  console.error(`harnesses-check: ${wrong.join("\n  ")}`);
  process.exit(1);
}
console.log(
  `harnesses-check: ${counted} members of ${SOURCES.map((one) => one.name).join(", ")}, each with its row in ${PAGE}`
);

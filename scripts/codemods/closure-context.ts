// Splits the hub's context bag so no section that reads it imports it.
//
// hub-context.ts typed some of its members from the factories of sections
// that themselves take a Pick of HubContext, so each such section and
// hub-context.ts imported each other (packages/hub's import cycle). This
// moves every member typed without those sections into closure-context.ts
// (`ClosureContext`, which imports none of them), leaves HubContext as
// ClosureContext plus a Pick of each such section's factory, and points each
// file of that cycle at what it reads: `Pick<HubContext, …>` becomes a Pick of
// ClosureContext and of each section factory it reads, `HubContext["x"]` the
// member's own type. Nothing else a file says changes.
//
//   bun scripts/codemods/closure-context.ts
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import ts from "typescript";
import { cycles, importGraph } from "../lib/import-graph";
import { ROOT, repoFiles } from "../lib/repo-files";

const SRC = "packages/hub/src";
const CONTEXT = `${SRC}/hub-context.ts`;
const CLOSURE = `${SRC}/closure-context.ts`;
const CODE = /\.(?:[cm]?[jt]sx?|svelte)$/u;
const EXTENSION = /\.ts$/u;

const read = (file: string): string => readFileSync(join(ROOT, file), "utf8");
const parse = (file: string, text: string): ts.SourceFile =>
  ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);

/* The cycle hub-context.ts stands in, from the repository's import graph. */
const present = repoFiles();
const graph = importGraph(
  present.filter((file) => CODE.test(file) && file.startsWith(`${SRC}/`)),
  new Set(present)
);
const cycle = new Set(cycles(graph).find((one) => one.includes(CONTEXT)));
if (cycle.size === 0) {
  throw new Error("hub-context.ts is in no import cycle: nothing to split.");
}

/* hub-context.ts: its imports, its interface's members, the rest. */
const contextText = read(CONTEXT);
const context = parse(CONTEXT, contextText);
/** The file a relative import of hub-context.ts lands on. */
const moduleOf = (declaration: ts.ImportDeclaration): string =>
  join(SRC, `${(declaration.moduleSpecifier as ts.StringLiteral).text}.ts`);
const imports = context.statements.filter(ts.isImportDeclaration);
const bag = context.statements.find(
  (one): one is ts.InterfaceDeclaration =>
    ts.isInterfaceDeclaration(one) && one.name.text === "HubContext"
);
if (!bag) {
  throw new Error("hub-context.ts declares no HubContext interface.");
}

/** Each identifier hub-context.ts imports from a section of its cycle, with that section's file. */
const sectionNames = new Map<string, string>();
for (const declaration of imports) {
  const file = moduleOf(declaration);
  const bindings = declaration.importClause?.namedBindings;
  if (cycle.has(file) && bindings && ts.isNamedImports(bindings)) {
    for (const element of bindings.elements) {
      sectionNames.set(element.name.text, file);
    }
  }
}

/** The members typed from a section of the cycle: `x: ReturnType<typeof createX>["x"]`, by member, with its factory. */
const fromSection = new Map<string, string>();
const MADE = /^ReturnType<\s*typeof (\w+)\s*>\["(\w+)"\]$/u;
for (const member of bag.members) {
  if (!(ts.isPropertySignature(member) && member.type)) {
    continue;
  }
  const name = member.name.getText(context);
  const type = member.type.getText(context);
  const reads = [...type.matchAll(/\b\w+\b/gu)].some(([word]) =>
    sectionNames.has(word)
  );
  if (!reads) {
    continue;
  }
  const made = MADE.exec(type.replace(/\s+/gu, " ").replace(/< /gu, "<"));
  if (!(made && made[2] === name)) {
    throw new Error(
      `HubContext.${name} reads a section of the cycle but is not its factory's own member: ${type}`
    );
  }
  fromSection.set(name, made[1] as string);
}

/* closure-context.ts: every other member, under the imports it may need. */
const closureImports = imports
  .filter((one) => !cycle.has(moduleOf(one)))
  .map((one) => one.getText(context));
const closureMembers = bag.members
  .filter((one) => !fromSection.has(one.name?.getText(context) ?? ""))
  .map((one) =>
    one.getFullText(context).replaceAll("HubContext[", "ClosureContext[")
  );
writeFileSync(
  join(ROOT, CLOSURE),
  `/**
 * What \`createServer\`'s closure makes and holds, apart from what the
 * sections that read it make: its services, its parameters, the functions it
 * defines, and what the sections that read none of it make. HubContext
 * (hub-context.ts) is this and those sections' own members.
 *
 * A section that reads the context and is one of HubContext's takes its own
 * Pick of this and of the other such sections' factories, never of
 * HubContext: hub-context.ts imports each of them to name their members, so
 * one importing it back would be an import cycle.
 */

${closureImports.join("\n")}

export interface ClosureContext {${closureMembers.join("")}
}
`
);

/* hub-context.ts: ClosureContext and a Pick of each section's factory. */
const byFactory = new Map<string, string[]>();
for (const [member, factory] of fromSection) {
  byFactory.set(factory, [...(byFactory.get(factory) ?? []), member]);
}
const picks = [...byFactory.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(
    ([factory, members]) =>
      `Pick<ReturnType<typeof ${factory}>, ${members
        .sort()
        .map((one) => `"${one}"`)
        .join(" | ")}>`
  );
const contextImports = imports
  .filter((one) => cycle.has(moduleOf(one)))
  .map((one) => one.getText(context));
const docEnd = contextText.indexOf("*/") + 2;
const contextDoc = contextText.slice(0, docEnd).replace(
  " * Built by {@link hubContextOf}",
  ` * Its members are the closure's own (closure-context.ts \`ClosureContext\`)
 * and what each section that reads the context makes, named by that
 * section's factory; those sections read ClosureContext and each other's
 * factories, never this file, which imports them.
 *
 * Built by {@link hubContextOf}`
);
writeFileSync(
  join(ROOT, CONTEXT),
  `${contextDoc}

${[...contextImports, 'import type { ClosureContext } from "./closure-context";'].join("\n")}

export interface HubContext
  extends ClosureContext,
    ${picks.join(",\n    ")} {}
${contextText.slice(bag.getEnd())}`
);

/* Each file of the cycle reads ClosureContext and the factories, not HubContext. */
const rewritten: string[] = [];
for (const file of [...cycle].filter((one) => one !== CONTEXT).sort()) {
  const text = read(file);
  const source = parse(file, text);
  const edits: { start: number; end: number; text: string }[] = [];
  const factories = new Set<string>();
  const typeOf = (member: string): string => {
    const factory = fromSection.get(member);
    if (!factory) {
      return `ClosureContext["${member}"]`;
    }
    factories.add(factory);
    return `ReturnType<typeof ${factory}>["${member}"]`;
  };
  const visit = (node: ts.Node): void => {
    if (
      ts.isTypeReferenceNode(node) &&
      node.typeName.getText(source) === "Pick" &&
      node.typeArguments?.[0]?.getText(source) === "HubContext"
    ) {
      const union = node.typeArguments[1] as ts.TypeNode;
      const members = (
        ts.isUnionTypeNode(union) ? [...union.types] : [union]
      ).map((one) => one.getText(source).slice(1, -1));
      const own = members.filter((one) => !fromSection.has(one));
      const made = new Map<string, string[]>();
      for (const member of members.filter((one) => fromSection.has(one))) {
        const factory = fromSection.get(member) as string;
        factories.add(factory);
        made.set(factory, [...(made.get(factory) ?? []), member]);
      }
      edits.push({
        start: node.getStart(source),
        end: node.getEnd(),
        text: [
          ...(own.length > 0
            ? [
                `Pick<ClosureContext, ${own.map((one) => `"${one}"`).join(" | ")}>`,
              ]
            : []),
          ...[...made.entries()].map(
            ([factory, names]) =>
              `Pick<ReturnType<typeof ${factory}>, ${names.map((one) => `"${one}"`).join(" | ")}>`
          ),
        ].join(" & "),
      });
      return;
    }
    if (
      ts.isIndexedAccessTypeNode(node) &&
      node.objectType.getText(source) === "HubContext" &&
      ts.isLiteralTypeNode(node.indexType) &&
      ts.isStringLiteral(node.indexType.literal)
    ) {
      edits.push({
        start: node.getStart(source),
        end: node.getEnd(),
        text: typeOf(node.indexType.literal.text),
      });
      return;
    }
    if (
      ts.isIdentifier(node) &&
      node.text === "HubContext" &&
      !ts.isImportSpecifier(node.parent)
    ) {
      throw new Error(
        `${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1} reads HubContext as a whole; split it by hand`
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  const importLine = source.statements.find(
    (one): one is ts.ImportDeclaration =>
      ts.isImportDeclaration(one) &&
      (one.moduleSpecifier as ts.StringLiteral).text.endsWith("/hub-context")
  );
  if (!importLine) {
    continue;
  }
  const specifier = (to: string): string => {
    const path = relative(dirname(file), to).replace(EXTENSION, "");
    return path.startsWith(".") ? path : `./${path}`;
  };
  const own = new Set(
    source.statements.flatMap((one) =>
      ts.isVariableStatement(one)
        ? one.declarationList.declarations.map((each) =>
            each.name.getText(source)
          )
        : []
    )
  );
  edits.push({
    start: importLine.getStart(source),
    end: importLine.getEnd(),
    text: [
      `import type { ClosureContext } from "${specifier(CLOSURE)}";`,
      ...[...factories]
        .filter((factory) => !own.has(factory))
        .map(
          (factory) =>
            `import type { ${factory} } from "${specifier(sectionNames.get(factory) as string)}";`
        ),
    ].join("\n"),
  });
  let next = text;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    next = next.slice(0, edit.start) + edit.text + next.slice(edit.end);
  }
  writeFileSync(join(ROOT, file), next);
  rewritten.push(file);
}

process.stdout.write(
  `closure-context: ${fromSection.size} members stay HubContext's, from ${byFactory.size} section factories; ${rewritten.length} files read ClosureContext: ${rewritten.join(", ")}\n`
);

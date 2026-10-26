/**
 * `bun run stored-shapes` in packages/hub: the zod schema of every type
 * CawCo stores as JSON, made from the TypeScript declarations themselves:
 * core's types to packages/core/src/stored-shapes.ts (`@cawco/core/
 * stored-shapes`, which the agent and the CLI read too), the hub's own to
 * packages/hub/src/db/stored-shapes.ts. `--check`: write nothing, fail when
 * either file is not what this would write.
 *
 * The TypeScript types stay the one hand-written source: the OpenAPI
 * document the Swift client is built from reads their declared names
 * (scripts/openapi.ts, typescript-json-schema), and a `z.infer` alias has no
 * name it can read. So each schema is made from its type, and the file
 * proves at compile time that each schema's output is exactly its type
 * ({@link PROOF}): a type changed without running this fails the build.
 *
 * What it makes schemas for: every `XSchema` a file in packages/ imports
 * from either file (`PlanStepSchema` for the exported type `PlanStep`), and
 * every type those reach. A type that is a zod schema's `z.infer` already (the MCP SDK's) is
 * that schema. A union of object shapes with no literal key telling them
 * apart is ordered most-required-keys first: z.union keeps the first option
 * that parses, and an object schema strips the keys it does not name.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { z } from "zod";

const HUB = resolve(import.meta.dir, "..");
const ROOT = resolve(HUB, "../..");
const SCHEMA = join(HUB, "src/db/schema.ts");
const HUB_OUT = join(HUB, "src/db/stored-shapes.ts");
const CORE_OUT = join(ROOT, "packages/core/src/stored-shapes.ts");
const AGENT_OUT = join(ROOT, "packages/agent/src/stored-shapes.ts");
const AGENT_SRC = join(ROOT, "packages/agent/src/");
/**
 * `--dashboard`: the dashboard's own stored types (what a tab keeps in its
 * browser's storage), written whole to its own file, core's types among them:
 * the page never loads `@cawco/core/stored-shapes`, which reaches the
 * machine-side modules.
 */
const DASHBOARD = process.argv.includes("--dashboard");
const DASH_SRC = join(ROOT, "apps/dashboard/src/");
const DASH_OUT = join(DASH_SRC, "lib/cawco/stored-shapes.ts");
/** Every generated file: core's first, which the others import. */
const OUTS = DASHBOARD ? [DASH_OUT] : [CORE_OUT, HUB_OUT, AGENT_OUT];
const HUB_SRC = join(HUB, "src/");
const CORE_SRC = join(ROOT, "packages/core/src/");
const SDK =
  /node_modules\/@modelcontextprotocol\/sdk\/dist\/esm\/(.+)\.d\.ts$/u;
const check = process.argv.includes("--check");
const JS = /\.js$/u;
const TS_FILE = /\.ts$/u;
const SCHEMA_SUFFIX = /(?:Schema|Shape)$/u;
const SHAPE_NAME = /\b\w+Shape\b/gu;
const SHAPES_IMPORT =
  /import\s*\{([^}]*)\}\s*from\s*"(?:@cawco\/core|#lib(?:\/[\w.-]+)*|\.{1,2}(?:\/[\w.-]+)*)\/stored-shapes(?:\.js)?"/gu;
const TEST_FILE = /\.test\.ts$/u;
const ZOD_OUTPUT = /^z\.(?:infer|output)$/u;

/** Types whose schema is written here, not made from the type: a brand only a predicate can check. */
const WRITTEN: Record<string, { schema: string; values: [string, string][] }> =
  {
    MachinePath: {
      schema:
        'z.custom<MachinePathType>((value) => typeof value === "string" && isMachinePath(value), "an absolute, normalised path")',
      values: [["isMachinePath", join(CORE_SRC, "machine-path.ts")]],
    },
    // The SDK's union lists the client information alone first; a full
    // registration parsed as that would lose every field but the id's.
    OAuthClientInformationMixed: {
      schema:
        "z.union([OAuthClientInformationFullShape, OAuthClientInformationShape])",
      values: [],
    },
    // Stored apart from its kind (delegate_events keeps that in its own
    // column): most-demanding first, as an ask's all-optional payload would
    // take, and strip, any other.
    DelegateEventPayload: {
      schema:
        "z.union([DelegateEventShape.options[2].shape.payload, DelegateEventShape.options[1].shape.payload, DelegateEventShape.options[0].shape.payload])",
      values: [],
    },
  };

type Declaration = ts.InterfaceDeclaration | ts.TypeAliasDeclaration;

const config = ts.getParsedCommandLineOfConfigFile(
  join(HUB, "tsconfig.json"),
  {},
  { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined }
);
if (!config) {
  throw new Error("stored-shapes: packages/hub/tsconfig.json does not read");
}
/** The MCP SDK's OAuth types, which no hub file need import for a column to store them. */
const SDK_TYPES = ["shared/auth.js", "client/auth.js"].map((path) =>
  Bun.resolveSync(`@modelcontextprotocol/sdk/${path}`, HUB).replace(JS, ".d.ts")
);

/* ---------------------------------------------------------- the roots */

const SCANNED = DASHBOARD ? /\.(?:ts|svelte)$/u : /\.ts$/u;
const listed = Bun.spawnSync(
  ["git", "ls-files", DASHBOARD ? "apps/dashboard/src" : "packages"],
  { cwd: ROOT }
)
  .stdout.toString()
  .split("\n")
  .filter((path) => SCANNED.test(path) && !TEST_FILE.test(path))
  .map((path) => join(ROOT, path))
  .filter((path) => !OUTS.includes(path));
const roots = new Set<string>();
/** Core's files, and every file that reads a schema: the program the types are read from. */
const programFiles: string[] = [];
for (const file of listed) {
  const matches = [...readFileSync(file, "utf8").matchAll(SHAPES_IMPORT)];
  if (
    file.endsWith(".ts") &&
    (file.startsWith(CORE_SRC) || matches.length > 0)
  ) {
    programFiles.push(file);
  }
  for (const match of matches) {
    for (const named of (match[1] ?? "").split(",")) {
      const [imported = ""] = named.trim().split(" as ");
      if (SCHEMA_SUFFIX.test(imported)) {
        roots.add(imported.replace(SCHEMA_SUFFIX, ""));
      }
    }
  }
}

const program = ts.createProgram(
  DASHBOARD ? programFiles : [SCHEMA, ...programFiles, ...SDK_TYPES],
  {
    ...config.options,
    composite: false,
    noEmit: true,
    ...(DASHBOARD
      ? {
          // The page's DOM; `#lib/*` resolves by the dashboard's package.json `imports`.
          lib: ["lib.esnext.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
        }
      : {}),
  }
);
const checker = program.getTypeChecker();

/** Every exported type declaration in the program's packages, by name; a name declared twice is refused when asked for. */
const exported = new Map<string, Declaration[]>();
const isExported = (node: ts.Node): boolean =>
  ts.canHaveModifiers(node) &&
  (ts.getModifiers(node) ?? []).some(
    (m) => m.kind === ts.SyntaxKind.ExportKeyword
  );
for (const file of program.getSourceFiles()) {
  const inPackages =
    !file.fileName.includes("node_modules") &&
    (file.fileName.startsWith(`${ROOT}/packages/`) ||
      file.fileName.startsWith(DASH_SRC));
  if (!(inPackages || SDK.test(file.fileName))) {
    continue;
  }
  for (const statement of file.statements) {
    if (
      (ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement)) &&
      isExported(statement)
    ) {
      const list = exported.get(statement.name.text) ?? [];
      list.push(statement);
      exported.set(statement.name.text, list);
    }
  }
}
const rootDeclaration = (name: string): Declaration => {
  const found = exported.get(name) ?? [];
  const own = found.filter((d) => !SDK.test(d.getSourceFile().fileName));
  const pick = own.length > 0 ? own : found;
  if (pick.length !== 1) {
    throw new Error(
      `stored-shapes: ${name}Schema names ${pick.length} exported types called ${name}; there must be one`
    );
  }
  return pick[0] as Declaration;
};

/* ---------------------------------------------------------- the reach */

/** The symbol `name` names, through any import of it. */
const symbolOf = (name: ts.Node): ts.Symbol | undefined => {
  const symbol = checker.getSymbolAtLocation(name);
  // biome-ignore lint/suspicious/noBitwiseOperators: SymbolFlags is a bit set
  return symbol && symbol.flags & ts.SymbolFlags.Alias
    ? checker.getAliasedSymbol(symbol)
    : symbol;
};

/** The type declarations a reference names. */
const declarationsOf = (name: ts.Node): Declaration[] =>
  (symbolOf(name)?.declarations ?? []).filter(
    (d): d is Declaration =>
      ts.isInterfaceDeclaration(d) || ts.isTypeAliasDeclaration(d)
  );

/** `z.infer<typeof X>` / `z.output<typeof X>`: the schema X it is the output of. */
const zodSource = (declaration: Declaration): ts.EntityName | undefined => {
  if (!ts.isTypeAliasDeclaration(declaration)) {
    return;
  }
  // `Readonly<z.infer<typeof X>>`: X's output, read-only in TypeScript alone.
  const outer = declaration.type;
  const [inner] =
    ts.isTypeReferenceNode(outer) && outer.typeName.getText() === "Readonly"
      ? (outer.typeArguments ?? [])
      : [];
  const type = inner ?? outer;
  if (
    ts.isTypeReferenceNode(type) &&
    ZOD_OUTPUT.test(type.typeName.getText()) &&
    type.typeArguments?.[0] &&
    ts.isTypeQueryNode(type.typeArguments[0])
  ) {
    return type.typeArguments[0].exprName;
  }
};

const byName = new Map<string, Declaration>();
const order: Declaration[] = [];
const visiting = new Set<Declaration>();

const claim = (declaration: Declaration): void => {
  const name = declaration.name.text;
  const held = byName.get(name);
  if (held && held !== declaration) {
    throw new Error(
      `stored-shapes: two stored types are called ${name} (${where(held)}, ${where(declaration)}); rename one`
    );
  }
  byName.set(name, declaration);
};
const where = (node: ts.Node): string => {
  const file = node.getSourceFile();
  return `${relative(ROOT, file.fileName)}:${file.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
};

/** Types a schema is written for here ({@link referenceOf}), whatever declares them (TypeScript's lib, bun's types). */
const BUILT_IN = new Set([
  "Array",
  "ReadonlyArray",
  "Record",
  "Partial",
  "Omit",
  "Pick",
  "Date",
  "Blob",
]);

/** The name a type reference, a heritage clause or an `import("…").X` names. */
const referenceName = (node: ts.Node): ts.Node | undefined => {
  if (ts.isTypeReferenceNode(node)) {
    return node.typeName;
  }
  if (ts.isExpressionWithTypeArguments(node)) {
    return node.expression;
  }
  return ts.isImportTypeNode(node) ? node.qualifier : undefined;
};

/** Each declaration after every one it reads (a schema's const reads its parts'). */
const reach = (declaration: Declaration): void => {
  if (order.includes(declaration)) {
    return;
  }
  if (visiting.has(declaration)) {
    throw new Error(
      `stored-shapes: ${declaration.name.text} reaches itself; a recursive stored type needs a hand-written schema`
    );
  }
  claim(declaration);
  visiting.add(declaration);
  if (!zodSource(declaration)) {
    const visit = (node: ts.Node): void => {
      const name = referenceName(node);
      if (name && !BUILT_IN.has(name.getText())) {
        for (const found of declarationsOf(name)) {
          // TypeScript's own (Record, Partial, Omit) are read as zod's.
          if (!program.isSourceFileDefaultLibrary(found.getSourceFile())) {
            reach(found);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(declaration);
  }
  visiting.delete(declaration);
  order.push(declaration);
};
for (const root of roots) {
  reach(rootDeclaration(root));
}

/* ---------------------------------------------------------- the schemas */

/** Which file a declaration's schema is written to: the hub's own types, and the MCP SDK's it alone depends on, to the hub's. */
const outOf = (declaration: ts.Node): string => {
  if (DASHBOARD) {
    return DASH_OUT;
  }
  const file = declaration.getSourceFile().fileName;
  if (file.startsWith(HUB_SRC) || SDK.test(file)) {
    return HUB_OUT;
  }
  return file.startsWith(AGENT_SRC) ? AGENT_OUT : CORE_OUT;
};

/** What one generated file imports: values its schemas read, and the types it proves them against, by declaring file. */
interface Needs {
  types: Map<string, Set<string>>;
  values: Map<string, Set<string>>;
}
const needs = new Map<string, Needs>(
  OUTS.map((out) => [out, { types: new Map(), values: new Map() }])
);
/** The file whose schemas are being made. */
let target = CORE_OUT;
const add = (kind: keyof Needs, file: string, name: string): void => {
  const into = needs.get(target)?.[kind];
  if (!into) {
    throw new Error(`stored-shapes: no file ${target}`);
  }
  const set = into.get(file) ?? new Set<string>();
  set.add(name);
  into.set(file, set);
};

const coreExports = Object.keys(
  z
    .object({ exports: z.record(z.string(), z.unknown()) })
    .parse(
      JSON.parse(readFileSync(join(ROOT, "packages/core/package.json"), "utf8"))
    ).exports
);
/** How the generated file `out` imports what `file` exports: core by its package from the hub, by path within itself. */
const specifierOf = (file: string, out: string): string => {
  const sdk = SDK.exec(file);
  if (sdk) {
    return `@modelcontextprotocol/sdk/${sdk[1]}.js`;
  }
  if (file.startsWith(CORE_SRC) && out !== CORE_OUT) {
    const sub = `./${file.slice(CORE_SRC.length).replace(TS_FILE, "")}`;
    return coreExports.includes(sub)
      ? `@cawco/core/${sub.slice(2)}`
      : "@cawco/core";
  }
  const path = relative(dirname(out), file).replace(TS_FILE, "");
  return path.startsWith(".") ? path : `./${path}`;
};

/** The runtime value an expression names, imported from where it is declared. */
const importedValue = (name: ts.EntityName, local?: string): string => {
  const symbol = symbolOf(name);
  const declaration = symbol?.valueDeclaration;
  if (!(symbol && declaration)) {
    throw new Error(`stored-shapes: ${name.getText()} names no value`);
  }
  add(
    "values",
    declaration.getSourceFile().fileName,
    local ? `${symbol.name} as ${local}` : symbol.name
  );
  return local ?? symbol.name;
};

const PRIMITIVE: Partial<Record<ts.SyntaxKind, string>> = {
  [ts.SyntaxKind.StringKeyword]: "z.string()",
  [ts.SyntaxKind.NumberKeyword]: "z.number()",
  [ts.SyntaxKind.BooleanKeyword]: "z.boolean()",
  [ts.SyntaxKind.UnknownKeyword]: "z.unknown()",
  [ts.SyntaxKind.AnyKeyword]: "z.any()",
  [ts.SyntaxKind.UndefinedKeyword]: "z.undefined()",
  [ts.SyntaxKind.NullKeyword]: "z.null()",
  [ts.SyntaxKind.NeverKeyword]: "z.never()",
};

const refuse = (node: ts.Node, what: string): never => {
  throw new Error(
    `stored-shapes: ${where(node)}: no schema is made from ${what} (${node.getText().slice(0, 80)})`
  );
};

const keyOf = (name: ts.PropertyName): string => {
  if (ts.isIdentifier(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return ts.isStringLiteral(name)
    ? JSON.stringify(name.text)
    : refuse(name, "a computed key");
};

const literalOf = (node: ts.LiteralTypeNode): string => {
  const { literal } = node;
  if (literal.kind === ts.SyntaxKind.NullKeyword) {
    return "z.null()";
  }
  return `z.literal(${literal.getText()})`;
};

/** A literal-keyed union's keys (`"a" | "b"`). */
const literalKeys = (node: ts.TypeNode): string[] => {
  if (ts.isUnionTypeNode(node)) {
    return node.types.flatMap(literalKeys);
  }
  return ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)
    ? [node.literal.text]
    : refuse(node, "a key that is not a string literal");
};

/** Type parameters in scope, as their defaults' schemas. */
type Scope = Map<string, string>;

const objectOf = (
  members: ts.NodeArray<ts.TypeElement>,
  scope: Scope
): string => {
  const fields: string[] = [];
  let index: string | undefined;
  for (const member of members) {
    if (ts.isPropertySignature(member) && member.type) {
      const schema = schemaOf(member.type, scope);
      fields.push(
        `${keyOf(member.name)}: ${member.questionToken ? `${schema}.optional()` : schema}`
      );
    } else if (ts.isIndexSignatureDeclaration(member)) {
      const [key] = member.parameters;
      index = `z.record(${schemaOf(key?.type ?? refuse(member, "an untyped index"), scope)}, ${schemaOf(member.type, scope)})`;
    } else {
      refuse(member, "a member that is not a property");
    }
  }
  if (index) {
    return fields.length === 0
      ? index
      : refuse(members[0] as ts.Node, "properties beside an index signature");
  }
  return `z.object({ ${fields.join(", ")} })`;
};

/** How many keys an object option requires: a union tries the most demanding first. */
const required = (node: ts.TypeNode): number => {
  if (ts.isTypeLiteralNode(node)) {
    return node.members.filter(
      (m) => ts.isPropertySignature(m) && !m.questionToken
    ).length;
  }
  if (ts.isTypeReferenceNode(node)) {
    const [found] = declarationsOf(node.typeName);
    if (found && ts.isInterfaceDeclaration(found)) {
      return found.members.filter(
        (m) => ts.isPropertySignature(m) && !m.questionToken
      ).length;
    }
    if (found && ts.isTypeAliasDeclaration(found)) {
      return required(found.type);
    }
  }
  return 0;
};

/** The members of an object type, written out or named by an interface. */
const membersOf = (node: ts.TypeNode): readonly ts.TypeElement[] => {
  if (ts.isTypeLiteralNode(node)) {
    return node.members;
  }
  return ts.isTypeReferenceNode(node)
    ? declarationsOf(node.typeName)
        .filter(ts.isInterfaceDeclaration)
        .flatMap((d) => [...d.members])
    : [];
};

/** Whether the options share a key whose literal values tell each apart. */
const discriminated = (options: ts.TypeNode[]): boolean => {
  const literalsAt = (node: ts.TypeNode): Map<string, string> => {
    const out = new Map<string, string>();
    const members = membersOf(node);
    for (const m of members) {
      if (
        ts.isPropertySignature(m) &&
        m.type &&
        ts.isLiteralTypeNode(m.type) &&
        !m.questionToken
      ) {
        out.set(m.name.getText(), m.type.getText());
      }
    }
    return out;
  };
  const all = options.map(literalsAt);
  const [first] = all;
  return [...(first?.keys() ?? [])].some((key) => {
    const seen = all.map((m) => m.get(key));
    return (
      seen.every((v) => v !== undefined) && new Set(seen).size === seen.length
    );
  });
};

const unionOf = (node: ts.UnionTypeNode, scope: Scope): string => {
  const isNull = (t: ts.TypeNode) =>
    ts.isLiteralTypeNode(t) && t.literal.kind === ts.SyntaxKind.NullKeyword;
  const isUndefined = (t: ts.TypeNode) =>
    t.kind === ts.SyntaxKind.UndefinedKeyword;
  let options = node.types.filter((t) => !(isNull(t) || isUndefined(t)));
  let schema: string;
  if (
    options.length > 1 &&
    options.every(
      (t) => ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal)
    )
  ) {
    schema = `z.enum([${options.map((t) => t.getText()).join(", ")}])`;
  } else if (options.length === 1 && options[0]) {
    schema = schemaOf(options[0], scope);
  } else {
    if (!discriminated(options)) {
      options = options.toSorted((a, b) => required(b) - required(a));
    }
    schema = `z.union([${options.map((t) => schemaOf(t, scope)).join(", ")}])`;
  }
  if (node.types.some(isNull)) {
    schema = `${schema}.nullable()`;
  }
  if (node.types.some(isUndefined)) {
    schema = `${schema}.or(z.undefined())`;
  }
  return schema;
};

const referenceOf = (
  node: ts.TypeReferenceNode | ts.ExpressionWithTypeArguments,
  scope: Scope
): string => {
  const nameNode = ts.isTypeReferenceNode(node)
    ? node.typeName
    : node.expression;
  const name = nameNode.getText();
  const args = node.typeArguments ?? [];
  const arg = (i: number): ts.TypeNode =>
    args[i] ?? refuse(node, `${name} without its type arguments`);
  const fromScope = scope.get(name);
  if (fromScope) {
    return fromScope;
  }
  switch (name) {
    case "Array":
      return `z.array(${schemaOf(arg(0), scope)})`;
    case "ReadonlyArray":
      return `z.array(${schemaOf(arg(0), scope)}).readonly()`;
    case "Record":
      return `z.record(${schemaOf(arg(0), scope)}, ${schemaOf(arg(1), scope)})`;
    case "Partial": {
      const inner = arg(0);
      if (
        ts.isTypeReferenceNode(inner) &&
        inner.typeName.getText() === "Record"
      ) {
        const [k, v] = inner.typeArguments ?? [];
        return `z.partialRecord(${schemaOf(k ?? refuse(inner, "a key"), scope)}, ${schemaOf(v ?? refuse(inner, "a value"), scope)})`;
      }
      return `${schemaOf(inner, scope)}.partial()`;
    }
    // JSON carries a date as its ISO text: read back as a Date.
    case "Date":
      return "z.coerce.date()";
    // A browser's stored record (IndexedDB) keeps a Blob as one.
    case "Blob":
      return "z.instanceof(Blob)";
    case "Omit":
    case "Pick":
      return `${schemaOf(arg(0), scope)}.${name.toLowerCase()}({ ${literalKeys(
        arg(1)
      )
        .map((k) => `${JSON.stringify(k)}: true`)
        .join(", ")} })`;
    default:
      break;
  }
  const [declaration] = declarationsOf(nameNode);
  if (!declaration) {
    return refuse(node, "a type with no declaration");
  }
  if (args.length > 0) {
    return refuse(node, "a generic type given arguments");
  }
  return `${declaration.name.text}Shape`;
};

/** `(typeof X)[number]`, a const list's members; `T["k"]`, one property of T. */
const indexedOf = (node: ts.IndexedAccessTypeNode, scope: Scope): string => {
  let object = node.objectType;
  while (ts.isParenthesizedTypeNode(object)) {
    object = object.type;
  }
  if (
    ts.isTypeQueryNode(object) &&
    node.indexType.kind === ts.SyntaxKind.NumberKeyword
  ) {
    return `z.enum(${importedValue(object.exprName)})`;
  }
  if (
    ts.isTypeReferenceNode(object) &&
    ts.isLiteralTypeNode(node.indexType) &&
    ts.isStringLiteral(node.indexType.literal)
  ) {
    return `${referenceOf(object, scope)}.shape.${node.indexType.literal.text}`;
  }
  return refuse(node, "an indexed access");
};

const templateOf = (node: ts.TemplateLiteralTypeNode, scope: Scope): string => {
  const parts: string[] = [];
  if (node.head.text) {
    parts.push(JSON.stringify(node.head.text));
  }
  for (const span of node.templateSpans) {
    parts.push(schemaOf(span.type, scope));
    if (span.literal.text) {
      parts.push(JSON.stringify(span.literal.text));
    }
  }
  return `z.templateLiteral([${parts.join(", ")}])`;
};

/** `left & { … }`: an object's shape with more keys; any keys at all (`Record<string, unknown>`) with these known. */
const extended = (left: string, right: string): string =>
  left === OPEN_RECORD
    ? `z.looseObject(${right.slice("z.object(".length, -1)})`
    : `${left}.extend(${right.slice("z.object(".length, -1)})`;
const OPEN_RECORD = "z.record(z.string(), z.unknown())";

const intersectionOf = (node: ts.IntersectionTypeNode, scope: Scope): string =>
  node.types
    .map((t) => ({ node: t, schema: schemaOf(t, scope) }))
    .reduce((left, right) => ({
      node: right.node,
      schema: ts.isTypeLiteralNode(right.node)
        ? extended(left.schema, right.schema)
        : `z.intersection(${left.schema}, ${right.schema})`,
    })).schema;

const schemaOf = (node: ts.TypeNode, scope: Scope): string => {
  const primitive = PRIMITIVE[node.kind];
  if (primitive) {
    return primitive;
  }
  if (ts.isParenthesizedTypeNode(node)) {
    return schemaOf(node.type, scope);
  }
  if (ts.isLiteralTypeNode(node)) {
    return literalOf(node);
  }
  if (ts.isArrayTypeNode(node)) {
    return `z.array(${schemaOf(node.elementType, scope)})`;
  }
  if (
    ts.isTypeOperatorNode(node) &&
    node.operator === ts.SyntaxKind.ReadonlyKeyword
  ) {
    return `${schemaOf(node.type, scope)}.readonly()`;
  }
  if (ts.isTupleTypeNode(node)) {
    return `z.tuple([${node.elements
      .map((e) => schemaOf(ts.isNamedTupleMember(e) ? e.type : e, scope))
      .join(", ")}])`;
  }
  if (ts.isTypeLiteralNode(node)) {
    return objectOf(node.members, scope);
  }
  if (ts.isUnionTypeNode(node)) {
    return unionOf(node, scope);
  }
  if (ts.isIntersectionTypeNode(node)) {
    return intersectionOf(node, scope);
  }
  if (ts.isIndexedAccessTypeNode(node)) {
    return indexedOf(node, scope);
  }
  if (ts.isTemplateLiteralTypeNode(node)) {
    return templateOf(node, scope);
  }
  if (ts.isTypeReferenceNode(node) || ts.isExpressionWithTypeArguments(node)) {
    return referenceOf(node, scope);
  }
  if (ts.isImportTypeNode(node) && node.qualifier) {
    const [declaration] = declarationsOf(node.qualifier);
    return declaration
      ? `${declaration.name.text}Shape`
      : refuse(node, "an import with no declaration");
  }
  return refuse(node, ts.SyntaxKind[node.kind]);
};

const declarationSchema = (declaration: Declaration): string => {
  const name = declaration.name.text;
  const written = WRITTEN[name];
  if (written) {
    for (const [value, from] of written.values) {
      add("values", from, value);
    }
    return written.schema;
  }
  const source = zodSource(declaration);
  if (source) {
    // The package's own schema, under a name of its own here.
    return importedValue(source, `${name}Published`);
  }
  // A generic type is stored with its defaults (`Envelope` is `Envelope<unknown>`).
  const scope: Scope = new Map(
    (declaration.typeParameters ?? []).map((p) => [
      p.name.text,
      p.default
        ? schemaOf(p.default, new Map())
        : refuse(p, "a type parameter with no default"),
    ])
  );
  if (ts.isTypeAliasDeclaration(declaration)) {
    return schemaOf(declaration.type, scope);
  }
  const own = objectOf(declaration.members, scope);
  const bases = (declaration.heritageClauses ?? []).flatMap((clause) =>
    clause.types.map((t) => schemaOf(t, scope))
  );
  const [first, ...rest] = bases;
  if (!first) {
    return own;
  }
  // `interface X extends A, B { … }`: A's shape, then B's, then its own.
  const fields = own.startsWith("z.object(")
    ? own.slice("z.object(".length, -1)
    : `${own}.shape`;
  return `${first}${rest.map((base) => `.extend(${base}.shape)`).join("")}.extend(${fields})`;
};

/** How a generated file names the declared type it proves a schema against. */
const alias = (name: string) => `${name}Type`;

/** Each file's schemas, in order, and the core schemas the others read. */
const made = new Map<string, string[]>(OUTS.map((out) => [out, []]));
const proved = new Map<string, string[]>(OUTS.map((out) => [out, []]));
const coreNames = new Set(
  order.filter((d) => outOf(d) === CORE_OUT).map((d) => `${d.name.text}Shape`)
);
for (const declaration of order) {
  const name = declaration.name.text;
  target = outOf(declaration);
  if (isExported(declaration) || roots.has(name)) {
    add("types", declaration.getSourceFile().fileName, name);
    proved.get(target)?.push(name);
  }
  const schema = declarationSchema(declaration);
  if (target !== CORE_OUT) {
    for (const [used] of schema.matchAll(SHAPE_NAME)) {
      if (coreNames.has(used)) {
        add("values", CORE_OUT, used);
      }
    }
  }
  // The shape is the schema as made, whose combinators (`.extend`, `.shape`,
  // `.partial`) other schemas use; `XSchema` is the same schema typed as `X`,
  // so a column or a read of it is typed by the declared name, which the
  // OpenAPI document reads.
  const typed = isExported(declaration) || roots.has(name);
  made
    .get(target)
    ?.push(
      `export const ${name}Shape = ${schema};${typed ? `\nexport const ${name}Schema: z.ZodType<${alias(name)}> = ${name}Shape;` : ""}`
    );
}

/* ---------------------------------------------------------- the file */

/**
 * Each schema's output is its type exactly, through every nested property:
 * a field the type has and the schema lacks would be stripped on every
 * write, and a field the schema requires and the type does not would refuse
 * rows the code writes.
 */
const PROOF = `/**
 * Each property, through every level, as a plain object type. \`readonly\`
 * goes: it says what code may do with a value, not what a record holds.
 */
type Flat<T> = T extends readonly unknown[]
  ? { -readonly [K in keyof T]: Flat<T[K]> }
  : T extends object
    ? { -readonly [K in keyof T]: Flat<T[K]> }
    : T;
/** Whether A and B are the same type, once flattened. */
type Same<A, B> =
  (<T>() => T extends Flat<A> ? 1 : 2) extends <T>() => T extends Flat<B> ? 1 : 2
    ? true
    : false;`;

/** Biome's import order: packages, then `../`, then `./`; a module's types before its values. */
const rank = (from: string): number => {
  if (from.startsWith("./")) {
    return 2;
  }
  return from.startsWith("../") ? 1 : 0;
};
const byLocalName = (a: string, b: string): number => {
  const [x = a, y = b] = [a.split(" as ")[1], b.split(" as ")[1]];
  return x < y ? -1 : Number(x > y);
};

/** `out`'s import lines: zod, then each module's types and values. */
const importsOf = (out: string, { types, values }: Needs): string[] => {
  const bySpecifier = new Map<string, { named: string[]; typed: string[] }>([
    ["zod", { named: ["z"], typed: [] }],
  ]);
  const at = (file: string) => {
    const from = specifierOf(file, out);
    const entry = bySpecifier.get(from) ?? { named: [], typed: [] };
    bySpecifier.set(from, entry);
    return entry;
  };
  for (const [file, names] of values) {
    at(file).named.push(...names);
  }
  for (const [file, names] of types) {
    at(file).typed.push(
      ...[...names].map((name) => `${name} as ${alias(name)}`)
    );
  }
  return [...bySpecifier]
    .toSorted(([a], [b]) => rank(a) - rank(b) || (a < b ? -1 : Number(a > b)))
    .flatMap(([from, { named, typed }]) => [
      // A module only types come from is imported as types alone, so loading
      // a generated file never loads it (schema.ts and moves.ts read these).
      // Biome sorts a renamed import by the name it is given here.
      ...(typed.length > 0
        ? [
            `import type { ${typed.toSorted(byLocalName).join(", ")} } from "${from}";`,
          ]
        : []),
      ...(named.length > 0
        ? [
            `import { ${[...new Set(named)].toSorted(byLocalName).join(", ")} } from "${from}";`,
          ]
        : []),
    ]);
};

const textOf = (out: string): string => {
  const own = needs.get(out) ?? { types: new Map(), values: new Map() };
  const names = proved.get(out) ?? [];
  return `/**
 * Generated by \`bun run stored-shapes\` (packages/hub/scripts/stored-shapes.ts)
 * from the types CawCo stores as JSON: never edited by hand. Each schema's
 * output is proved below to be its type exactly.
 */
${importsOf(out, own).join("\n")}

${(made.get(out) ?? []).join("\n\n")}

${PROOF}

/** Every schema of an exported type, proved against that type. */
export const proved: [${names.map((name) => `Same<z.output<typeof ${name}Shape>, ${alias(name)}>`).join(", ")}] = [${names.map(() => "true").join(", ")}];
`;
};

// The repository's formatter (scripts/fmt.ts), outside this package's
// project, so loaded by its path at run time.
const fmt: unknown = await import(join(ROOT, "scripts/fmt.ts"));
if (!(
  typeof fmt === "object" &&
  fmt !== null &&
  "formatText" in fmt &&
  typeof fmt.formatText === "function"
)) {
  throw new Error("stored-shapes: scripts/fmt.ts has no formatText");
}
const { formatText } = fmt;
const outputs = await Promise.all(
  OUTS.map(async (out) => {
    const formatted: unknown = await formatText(out, textOf(out));
    if (typeof formatted !== "string") {
      throw new Error("stored-shapes: formatText answered no text");
    }
    return { out, formatted };
  })
);
let stale = false;
for (const { out, formatted } of outputs) {
  let current = "";
  try {
    current = readFileSync(out, "utf8");
  } catch {
    // Not written yet.
  }
  if (current === formatted) {
    continue;
  }
  if (check) {
    stale = true;
    console.error(
      `stored-shapes: ${relative(ROOT, out)} is not what the stored types make; run \`bun run stored-shapes\` in packages/hub`
    );
  } else {
    writeFileSync(out, formatted);
    console.log(`stored-shapes: wrote ${relative(ROOT, out)}`);
  }
}
if (stale) {
  process.exit(1);
}
console.log(
  `stored-shapes: ${order.length} schemas from ${roots.size} stored types${check ? ", as written" : ""}`
);

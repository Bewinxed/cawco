/**
 * `boundary/` (packages/agent/src/boundary/) stays readable one file at a time:
 *
 * - a file's module-level state is its own: no file exports a mutable value,
 *   and what another file needs of one goes through a function its owner
 *   exports. A value is read by its type: a primitive, a function, a read-only
 *   object or array (`as const`, `Readonly<...>`, an interface of readonly
 *   fields of those) is fine; anything else exported (a `let`, a `Map`, a
 *   class's instance, a mutable object or array, a Promise) is not. A regex
 *   literal without `g` or `y`, which holds no `lastIndex`, is fine too;
 * - its files' imports, static and dynamic, run one way: the calls that must
 *   go up are passed down as a value (`UnaskedCalls`, `boundary/state.ts`);
 * - a `{@link name}` resolves in its own file, a name another file holds
 *   written with that file's name instead.
 *
 * Run by `bun run check`.
 */
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";

const BOUNDARY = new URL("../packages/agent/src/boundary/", import.meta.url)
  .pathname;
const TSCONFIG = new URL("../packages/agent/tsconfig.json", import.meta.url)
  .pathname;

const paths = readdirSync(BOUNDARY)
  .filter((file) => file.endsWith(".ts"))
  .map((file) => join(BOUNDARY, file));

const stem = (path: string): string =>
  path.slice(BOUNDARY.length, -".ts".length);

const config = ts.parseJsonConfigFileContent(
  ts.readConfigFile(TSCONFIG, ts.sys.readFile).config,
  ts.sys,
  dirname(TSCONFIG)
);
const program = ts.createProgram(paths, config.options);
const checker = program.getTypeChecker();

/** Whether the bit set `flags` holds any of `mask`. */
const hasFlag = (flags: number, mask: number): boolean =>
  // biome-ignore lint/suspicious/noBitwiseOperators: the compiler's flags are bit sets
  (flags & mask) !== 0;

const PRIMITIVES = [
  ts.TypeFlags.StringLike,
  ts.TypeFlags.NumberLike,
  ts.TypeFlags.BooleanLike,
  ts.TypeFlags.BigIntLike,
  ts.TypeFlags.ESSymbolLike,
  ts.TypeFlags.Null,
  ts.TypeFlags.Undefined,
  ts.TypeFlags.Void,
];

const isReadonlyProperty = (property: ts.Symbol): boolean =>
  (property.declarations ?? []).every((declaration) =>
    hasFlag(ts.getCombinedModifierFlags(declaration), ts.ModifierFlags.Readonly)
  );

/** Whether a value of `type` can never change once it is read: see the file's doc. */
const immutable = (type: ts.Type, seen = new Set<ts.Type>()): boolean => {
  if (seen.has(type)) {
    return true;
  }
  seen.add(type);
  if (PRIMITIVES.some((flag) => hasFlag(type.flags, flag))) {
    return true;
  }
  if (type.isUnionOrIntersection()) {
    return type.types.every((one) => immutable(one, seen));
  }
  if (
    type.getCallSignatures().length > 0 ||
    type.getConstructSignatures().length > 0
  ) {
    return true;
  }
  if (checker.isArrayType(type) || checker.isTupleType(type)) {
    const name = type.symbol?.name;
    return (
      (name === "ReadonlyArray" ||
        (checker.isTupleType(type) &&
          (type as ts.TupleTypeReference).target.readonly)) &&
      checker
        .getTypeArguments(type as ts.TypeReference)
        .every((one) => immutable(one, seen))
    );
  }
  if (type.aliasSymbol?.name === "Readonly") {
    return checker
      .getPropertiesOfType(type)
      .every((property) => immutable(checker.getTypeOfSymbol(property), seen));
  }
  if (hasFlag(type.symbol?.flags ?? 0, ts.SymbolFlags.Class)) {
    return false;
  }
  const properties = checker.getPropertiesOfType(type);
  return (
    properties.length > 0 &&
    properties.every(
      (property) =>
        isReadonlyProperty(property) &&
        immutable(checker.getTypeOfSymbol(property), seen)
    )
  );
};

const REGEX_MUTATING_FLAGS = /[gy]/u;

const isStateless = (declaration: ts.VariableDeclaration): boolean => {
  if (!hasFlag(declaration.parent.flags, ts.NodeFlags.Const)) {
    return false;
  }
  const { initializer } = declaration;
  if (!initializer) {
    return false;
  }
  if (
    ts.isAsExpression(initializer) &&
    ts.isConstTypeReference(initializer.type)
  ) {
    return true;
  }
  if (ts.isRegularExpressionLiteral(initializer)) {
    const flags = initializer.text.slice(initializer.text.lastIndexOf("/") + 1);
    return !REGEX_MUTATING_FLAGS.test(flags);
  }
  return immutable(checker.getTypeAtLocation(declaration));
};

/** Each file's exports, resolved through a re-export: what it hands other files. */
const exportsOf = (source: ts.SourceFile): ts.Symbol[] => {
  const module = checker.getSymbolAtLocation(source);
  if (!module) {
    return [];
  }
  return checker
    .getExportsOfModule(module)
    .map((symbol) =>
      hasFlag(symbol.flags, ts.SymbolFlags.Alias)
        ? checker.getAliasedSymbol(symbol)
        : symbol
    );
};

const exportedState: string[] = [];

/** Any file's imports; a specifier that does not resolve to one of boundary's files is left out. */
const imports = new Map<string, string[]>();

const LINK = /\{@link\s*(?:\n\s*\*\s*)?([\w$.]+)/gu;

/** The names an `import` clause brings in. */
const importedNames = (clause: ts.ImportClause): ts.Identifier[] => {
  const names = clause.name ? [clause.name] : [];
  const bindings = clause.namedBindings;
  if (bindings) {
    names.push(
      ...(ts.isNamedImports(bindings)
        ? bindings.elements.map((element) => element.name)
        : [bindings.name])
    );
  }
  return names;
};

/** The names `node` itself declares, a `{@link}` to one is a link to it. */
const declaredNames = (node: ts.Node): (ts.Node | undefined)[] => {
  if (ts.isImportClause(node)) {
    return importedNames(node);
  }
  if (
    ts.isVariableDeclaration(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isParameter(node) ||
    ts.isMethodDeclaration(node)
  ) {
    return [
      node.name,
      ...(ts.isClassLike(node) || ts.isInterfaceDeclaration(node)
        ? node.members.map((member) => member.name)
        : []),
    ];
  }
  return ts.isTypeLiteralNode(node)
    ? node.members.map((member) => member.name)
    : [];
};

/** Every name a `{@link}` in `source` can reach: its declarations and what it imports. */
const namesIn = (source: ts.SourceFile): Set<string> => {
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    for (const name of declaredNames(node)) {
      if (name && ts.isIdentifier(name)) {
        names.add(name.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return names;
};

const links: string[] = [];

/** The boundary file `specifier`, from `from`, names, if any. */
const importedFile = (from: string, specifier: string): string | undefined => {
  if (!specifier.startsWith(".")) {
    return;
  }
  const target = `${resolve(dirname(from), specifier)}.ts`;
  return target.startsWith(BOUNDARY) ? stem(target) : undefined;
};

for (const path of paths) {
  const source = program.getSourceFile(path);
  if (!source) {
    throw new Error(`${path} is not in the program`);
  }
  for (const symbol of exportsOf(source)) {
    const declaration = symbol.valueDeclaration;
    if (
      declaration &&
      ts.isVariableDeclaration(declaration) &&
      !isStateless(declaration)
    ) {
      const line =
        source.getLineAndCharacterOfPosition(declaration.getStart()).line + 1;
      exportedState.push(
        `${stem(path)}.ts:${line} exports its state: ${symbol.name}`
      );
    }
  }
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const target = importedFile(path, node.moduleSpecifier.text);
      if (target) {
        found.push(target);
      }
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const [argument] = node.arguments;
      if (argument && ts.isStringLiteralLike(argument)) {
        const target = importedFile(path, argument.text);
        if (target) {
          found.push(target);
        }
      } else {
        const line =
          source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        exportedState.push(
          `${stem(path)}.ts:${line} imports a module only known as it runs, so its one-way imports cannot be checked`
        );
      }
    }
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      const target = importedFile(path, node.argument.literal.text);
      if (target) {
        found.push(target);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  imports.set(stem(path), found);
  const names = namesIn(source);
  for (const match of source.text.matchAll(LINK)) {
    const [name] = (match[1] ?? "").split(".");
    if (name && !names.has(name)) {
      const line = source.getLineAndCharacterOfPosition(match.index).line + 1;
      links.push(
        `${stem(path)}.ts:${line} links to ${match[1]}, which is no name in that file`
      );
    }
  }
}

const cycles: string[] = [];
const done = new Set<string>();
const visit = (file: string, path: readonly string[]): void => {
  const at = path.indexOf(file);
  if (at >= 0) {
    cycles.push(
      `an import cycle: ${[...path.slice(at), file].map((one) => `${one}.ts`).join(" -> ")}`
    );
    return;
  }
  if (done.has(file)) {
    return;
  }
  done.add(file);
  for (const next of imports.get(file) ?? []) {
    visit(next, [...path, file]);
  }
};
for (const file of imports.keys()) {
  visit(file, []);
}

const problems = [...exportedState, ...cycles, ...links];
if (problems.length > 0) {
  console.error(problems.join("\n"));
  console.error(
    "boundary: its files keep their own state, import one way and link what they can reach (scripts/boundary-check.ts)"
  );
  process.exit(1);
}
console.log(
  `boundary: ${paths.length} files export no state, import one way and link what they can reach`
);

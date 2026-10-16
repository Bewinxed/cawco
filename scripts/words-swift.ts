/**
 * `bun run words`: the words the dashboard and the native app share, written
 * into the app as Swift. packages/core/src/words/*.ts is the one source (and
 * core's `ACCOUNT_RULES`, the rules the Accounts screens are shaped by); this
 * writes apps/apple/Packages/CawCoKit/Sources/CawCoCore/Words.generated.swift
 * from it: a string as a `static let`, an object of words as a nested enum
 * (with `byKey` where every value is a string, for a lookup by data value),
 * an array of records as a struct and its array, and a word that takes
 * values as a `static func` with the same parameter names, its body the same
 * expression in Swift.
 *
 *   bun scripts/words-swift.ts          write the file
 *   bun scripts/words-swift.ts --check  fail when the file is stale, or when
 *                                       a file that must read the shared
 *                                       words (CHECKED_* below) spells one
 *
 * A word's body may use template literals, `?:`, `===`/`!==`/`<`/`>`/`<=`/
 * `>=`, `&&`/`||`/`!`, `??`, `+`/`-`, `.length`, `.join(sep)` and the
 * helpers in packages/core/src/words/helpers.ts (HELPERS: each has its Swift
 * twin here). Parameters are `string`, `number` (an `Int`), `boolean`,
 * `string | null` or a string array. Anything else is refused by name, so a
 * word never means one thing on the web and another in the app.
 *
 * Both modes also fail when a Configure section names a glyph or a hue the
 * app cannot draw (`Glyph(rawValue:)`, `Palette.named` would trap at launch).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = join(import.meta.dir, "..");
const CORE = join(ROOT, "packages/core/src");
const APPLE = join(ROOT, "apps/apple/Packages/CawCoKit/Sources");
const OUT = join(APPLE, "CawCoCore/Words.generated.swift");
const DASHBOARD = join(ROOT, "apps/dashboard/src");

/** One export of a core module, as the member it becomes ("" lays its members in the enum itself). */
interface Member {
  as: string;
  export: string;
  file: string;
  /** Data the screens are shaped by (ids, thresholds), not words: never read as words by the scan. */
  rules?: true;
}

/** Each enum, and what it is made of. */
const ENUMS: { members: Member[]; swift: string }[] = [
  {
    swift: "Configure",
    members: [
      { file: "words/configure.ts", export: "configureWords", as: "" },
      { file: "words/configure.ts", export: "CONFIG_GROUPS", as: "groups" },
      { file: "words/configure.ts", export: "CONFIG_SECTIONS", as: "sections" },
    ],
  },
  {
    swift: "Accounts",
    members: [
      { file: "words/accounts.ts", export: "accountsWords", as: "" },
      {
        file: "accounts.ts",
        export: "ACCOUNT_RULES",
        as: "rules",
        rules: true,
      },
    ],
  },
  {
    swift: "Sidebar",
    members: [{ file: "words/sidebar.ts", export: "sidebarWords", as: "" }],
  },
  {
    // The upstream choice: its card in Needs you and a project's ⋯ menu.
    swift: "Upstream",
    members: [{ file: "upstream-guard.ts", export: "UPSTREAM_WORDS", as: "" }],
  },
  {
    swift: "Catalog",
    members: [{ file: "words/catalog.ts", export: "catalogWords", as: "" }],
  },
  {
    swift: "Preview",
    members: [{ file: "words/preview.ts", export: "previewWords", as: "" }],
  },
  {
    // A device asking to pair: its Needs you card and its push.
    swift: "Pairing",
    members: [{ file: "words/pairing.ts", export: "pairingWords", as: "" }],
  },
  {
    swift: "Sheet",
    members: [{ file: "words/sheet.ts", export: "sheetWords", as: "" }],
  },
];

/** The helpers a word may call, and their Swift twins. */
const HELPERS: Record<string, string> = {
  andList: [
    '    /// "obelisk", "obelisk and mac", "a, b and c": names as a sentence lists them.',
    "    public static func andList(_ names: [String]) -> String {",
    '        names.count < 2 ? (names.first ?? "") : names.dropLast().joined(separator: ", ") + " and " + names[names.count - 1]',
    "    }",
  ].join("\n"),
  pad2: [
    '    /// A whole number in two figures: 5 → "05".',
    "    public static func pad2(_ n: Int) -> String {",
    '        n < 10 && n >= 0 ? "0\\(n)" : "\\(n)"',
    "    }",
  ].join("\n"),
};

/**
 * The files that read the shared words and must spell none themselves:
 * Configure's nav and frame and the Accounts section, on both sides.
 */
const CHECKED_SWIFT = [
  "CawCoCore/Accounts.swift",
  "CawCoScreens/Configure/ConfigureController.swift",
  "CawCoScreens/Configure/ConfigureSections.swift",
  "CawCoScreens/Configure/SectionFrame.swift",
  "CawCoScreens/Configure/EditorFrame.swift",
  "CawCoScreens/Configure/AccountsSection.swift",
  "CawCoScreens/Configure/AccountParts.swift",
  "CawCoScreens/Configure/AccountMachines.swift",
  "CawCoScreens/Configure/AccountSetup.swift",
  "CawCoScreens/Configure/RoutingEditor.swift",
  "CawCoScreens/Configure/StrategyFigure.swift",
];
const CHECKED_WEB = [
  "lib/cawco/config/sections.ts",
  "lib/cawco/config/ConfigRail.svelte",
  "lib/cawco/config/counts.svelte.ts",
  "lib/cawco/config/hub.svelte.ts",
  "lib/cawco/config/SectionFrame.svelte",
  "lib/cawco/config/EditorFrame.svelte",
  "lib/cawco/config/EditorFooter.svelte",
  "lib/cawco/config/Missing.svelte",
  "lib/cawco/config/RowMenu.svelte",
  "lib/cawco/accounts/AccountEditor.svelte",
  "lib/cawco/accounts/AccountListRow.svelte",
  "lib/cawco/accounts/AccountMachines.svelte",
  "lib/cawco/accounts/AccountName.svelte",
  "lib/cawco/accounts/AccountSetup.svelte",
  "lib/cawco/accounts/AtLimitBlock.svelte",
  "lib/cawco/accounts/DevicePanel.svelte",
  "lib/cawco/accounts/KeyPanel.svelte",
  "lib/cawco/accounts/OrderList.svelte",
  "lib/cawco/accounts/RoutingEditor.svelte",
  "lib/cawco/accounts/SigninPanel.svelte",
  "lib/cawco/accounts/StrategyPicker.svelte",
  "lib/cawco/accounts/Swatches.svelte",
  "lib/cawco/accounts/device.svelte.ts",
  "lib/cawco/accounts/figure.ts",
  "lib/cawco/accounts/model.svelte.ts",
  "lib/cawco/accounts/signin.svelte.ts",
  "routes/(app)/config/accounts/+page.svelte",
  "routes/(app)/config/accounts/new/+page.svelte",
  "routes/(app)/config/accounts/[id]/+page.svelte",
  "routes/(app)/config/accounts/[provider]/routing/+page.svelte",
];

// ── Patterns ────────────────────────────────────────────────────────────

const SEPARATED = /[-_ ]+([a-zA-Z0-9])/g;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ES_PLURAL = /(ch|sh|x)es$/;
const WHITESPACE = /\s+/g;
const SPACES = /\s+/;
const LETTER = /[A-Za-z]/;
const TWO_LETTERS = /[A-Za-z]{2}/;
const HEADER_NAME = /^[A-Z][a-z]+(-[A-Z][a-z]+)+$/;
const TYPOGRAPHY = /[…’“”→·]/;
const CAPITALISED = /^[A-Z][a-z]/;
/** A record field every value of which is a lowercase id (a slug, a hue, a Solar name) holds no words. */
const RECORD_ID = /^[a-z0-9][a-z0-9-]*$/;
/** A bare lowercase token: a word that is also how code names a state ("waiting"). */
const ID_LIKE = /^[a-z][a-z-]*$/;
/** A trap's message is for whoever reads the crash, not for a person using the app. */
const TRAP = /(fatalError|preconditionFailure|assertionFailure)\(\s*$/;
const GLYPH_CASE = /case \w+ = "([^"]+)"/g;
const SCRIPT = /<script[^>]*>([\s\S]*?)<\/script>/g;
const STYLE = /<style[^>]*>[\s\S]*?<\/style>/g;
const COMMENT = /<!--[\s\S]*?-->/g;
const BRACES = /\{([^{}]*)\}/g;
const TAG = /<[^>]*>/g;
const TEXT_RUN = /[^\s][^\n]*/g;
const NOT_NEWLINE = /[^\n]/g;
/** Markup attributes whose values a person reads. */
const WORD_ATTRS =
  /\s(label|title|placeholder|aria-label|aria-roledescription|pendingLabel|saveLabel|deleteLabel|confirmLabel|line|what|text)="([^"]*)"/g;

/** Where a template's values go, in a shape: not a space, so a path's slots don't read as words between them. */
const HOLE = "\u0000";

const fail = (message: string): never => {
  throw new Error(message);
};

// ── Swift spelling ──────────────────────────────────────────────────────

const SWIFT_KEYWORDS = new Set(
  "associatedtype class deinit enum extension func import init inout internal let operator private protocol public static struct subscript typealias var break case continue default defer do else fallthrough for guard if in repeat return switch where while as false is nil self Self super throw throws true try Type".split(
    " "
  )
);
/** `signed-out` → `signedOut`; a keyword in backticks. */
const member = (key: string): string => {
  const camel = key.replace(SEPARATED, (_, c: string) => c.toUpperCase());
  if (!IDENTIFIER.test(camel)) {
    fail(`"${key}" makes no Swift name`);
  }
  return SWIFT_KEYWORDS.has(camel) ? `\`${camel}\`` : camel;
};
const typeName = (key: string): string => {
  const name = member(key).replaceAll("`", "");
  return name.charAt(0).toUpperCase() + name.slice(1);
};
/** "sections" → "Section", "strategies" → "Strategy": an array's element. */
const singular = (key: string): string => {
  const name = typeName(key);
  if (name.endsWith("ies")) {
    return `${name.slice(0, -3)}y`;
  }
  if (ES_PLURAL.test(name)) {
    return name.slice(0, -2);
  }
  return name.endsWith("s") ? name.slice(0, -1) : `${name}Item`;
};
const escapeText = (text: string): string =>
  text
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\n")
    .replaceAll("\t", "\\t");
const literal = (text: string): string => `"${escapeText(text)}"`;
const indent = (lines: string[], by: string): string[] =>
  lines.map((one) => (one ? `${by}${one}` : one));
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const keyOf = (name: ts.PropertyName, source: ts.SourceFile): string =>
  ts.isStringLiteral(name) ? name.text : name.getText(source);

// ── Reading a module ────────────────────────────────────────────────────

/** Unwraps `x as T`, `x satisfies T` and parentheses down to the value. */
const bare = (node: ts.Expression): ts.Expression => {
  let at = node;
  while (
    ts.isAsExpression(at) ||
    ts.isSatisfiesExpression(at) ||
    ts.isParenthesizedExpression(at)
  ) {
    at = at.expression;
  }
  return at;
};

/** The declaration of `exportName`, and its statement (where its doc stands). */
function declarationOf(
  source: ts.SourceFile,
  exportName: string
): { initializer: ts.Expression; statement: ts.VariableStatement } | undefined {
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === exportName &&
        declaration.initializer
      ) {
        return { initializer: declaration.initializer, statement };
      }
    }
  }
  return undefined;
}

/** Every property under `exportName`, by its path ("editor.removeTitle"). */
function propertiesOf(
  source: ts.SourceFile,
  exportName: string
): Map<string, ts.PropertyAssignment> {
  const found = new Map<string, ts.PropertyAssignment>();
  const visit = (node: ts.Expression, path: string): void => {
    const value = bare(node);
    if (!ts.isObjectLiteralExpression(value)) {
      return;
    }
    for (const property of value.properties) {
      if (!ts.isPropertyAssignment(property)) {
        fail(`${path || exportName}: only plain properties are words`);
      }
      const assignment = property as ts.PropertyAssignment;
      const key = keyOf(assignment.name, source);
      const at = path ? `${path}.${key}` : key;
      found.set(at, assignment);
      visit(assignment.initializer, at);
    }
  };
  const declared = declarationOf(source, exportName);
  if (declared) {
    visit(declared.initializer, "");
  }
  return found;
}

/** A node's JSDoc as one Swift doc line, or none. */
function docLines(node: ts.Node | undefined): string[] {
  if (!node) {
    return [];
  }
  const text = ts
    .getJSDocCommentsAndTags(node)
    .filter(ts.isJSDoc)
    .map((one) => ts.getTextOfJSDocComment(one.comment) ?? "")
    .join(" ")
    .replace(WHITESPACE, " ")
    .trim();
  return text ? [`/// ${text}`] : [];
}

// ── A word that takes values, in Swift ──────────────────────────────────

type SwiftType = "String" | "Int" | "Bool" | "String?" | "[String]";
interface Typed {
  code: string;
  type: SwiftType;
}

const PARAM_TYPES: Record<string, SwiftType> = {
  string: "String",
  number: "Int",
  boolean: "Bool",
  "string | null": "String?",
  "null | string": "String?",
  "string[]": "[String]",
  "readonly string[]": "[String]",
};

const BINARY: Partial<Record<ts.SyntaxKind, string>> = {
  [ts.SyntaxKind.EqualsEqualsEqualsToken]: "==",
  [ts.SyntaxKind.ExclamationEqualsEqualsToken]: "!=",
  [ts.SyntaxKind.LessThanToken]: "<",
  [ts.SyntaxKind.GreaterThanToken]: ">",
  [ts.SyntaxKind.LessThanEqualsToken]: "<=",
  [ts.SyntaxKind.GreaterThanEqualsToken]: ">=",
  [ts.SyntaxKind.AmpersandAmpersandToken]: "&&",
  [ts.SyntaxKind.BarBarToken]: "||",
  [ts.SyntaxKind.PlusToken]: "+",
  [ts.SyntaxKind.MinusToken]: "-",
  [ts.SyntaxKind.QuestionQuestionToken]: "??",
};

/** What translating one word's body needs: its parameters, and how to refuse. */
class Translation {
  readonly params: Map<string, SwiftType>;
  readonly source: ts.SourceFile;
  readonly where: string;

  constructor(
    params: Map<string, SwiftType>,
    where: string,
    source: ts.SourceFile
  ) {
    this.params = params;
    this.where = where;
    this.source = source;
  }

  refuse(node: ts.Node, what: string): never {
    return fail(
      `${this.where}: ${what} is not in the words' subset: ${node.getText(this.source)}`
    );
  }

  /** The expression in Swift, and the type it has there. */
  of(node: ts.Expression): Typed {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      return { code: literal(node.text), type: "String" };
    }
    if (ts.isNumericLiteral(node)) {
      return Number.isInteger(Number(node.text))
        ? { code: node.text, type: "Int" }
        : this.refuse(node, "a fraction");
    }
    if (
      node.kind === ts.SyntaxKind.TrueKeyword ||
      node.kind === ts.SyntaxKind.FalseKeyword
    ) {
      return { code: node.getText(this.source), type: "Bool" };
    }
    if (ts.isTemplateExpression(node)) {
      return this.template(node);
    }
    if (ts.isIdentifier(node)) {
      const type = this.params.get(node.text);
      return type
        ? { code: member(node.text), type }
        : this.refuse(node, `the name ${node.text}`);
    }
    if (ts.isParenthesizedExpression(node)) {
      const inner = this.of(node.expression);
      return { code: `(${inner.code})`, type: inner.type };
    }
    if (ts.isConditionalExpression(node)) {
      return this.conditional(node);
    }
    if (ts.isPrefixUnaryExpression(node)) {
      return this.not(node);
    }
    if (ts.isBinaryExpression(node)) {
      return this.binary(node);
    }
    if (ts.isPropertyAccessExpression(node)) {
      return this.length(node);
    }
    if (ts.isCallExpression(node)) {
      return this.call(node);
    }
    return this.refuse(node, ts.SyntaxKind[node.kind]);
  }

  private template(node: ts.TemplateExpression): Typed {
    let code = `"${escapeText(node.head.text)}`;
    for (const span of node.templateSpans) {
      const inner = this.of(span.expression);
      if (inner.type === "String?" || inner.type === "[String]") {
        this.refuse(span.expression, `a ${inner.type} interpolated`);
      }
      code += `\\(${inner.code})${escapeText(span.literal.text)}`;
    }
    return { code: `${code}"`, type: "String" };
  }

  private conditional(node: ts.ConditionalExpression): Typed {
    const test = this.of(node.condition);
    const yes = this.of(node.whenTrue);
    const no = this.of(node.whenFalse);
    if (test.type !== "Bool" || yes.type !== no.type) {
      this.refuse(
        node,
        "a condition that is not Bool, or branches of two types"
      );
    }
    return { code: `${test.code} ? ${yes.code} : ${no.code}`, type: yes.type };
  }

  private not(node: ts.PrefixUnaryExpression): Typed {
    const inner = this.of(node.operand);
    if (node.operator !== ts.SyntaxKind.ExclamationToken) {
      return this.refuse(node, "a prefix other than !");
    }
    return inner.type === "Bool"
      ? { code: `!${inner.code}`, type: "Bool" }
      : this.refuse(node, "! of a value that is not Bool");
  }

  private binary(node: ts.BinaryExpression): Typed {
    const op =
      BINARY[node.operatorToken.kind] ?? this.refuse(node, "the operator");
    const left = this.of(node.left);
    const right = this.of(node.right);
    const code = `${left.code} ${op} ${right.code}`;
    if (op === "??") {
      return left.type === "String?" && right.type === "String"
        ? { code, type: "String" }
        : this.refuse(node, "?? on what is not a String?");
    }
    if (op === "&&" || op === "||") {
      return left.type === "Bool" && right.type === "Bool"
        ? { code, type: "Bool" }
        : this.refuse(node, `${op} of values that are not Bool`);
    }
    if (left.type !== right.type) {
      this.refuse(node, `${op} between a ${left.type} and a ${right.type}`);
    }
    if (op === "-" && left.type !== "Int") {
      this.refuse(node, "- of what is not a number");
    }
    return { code, type: op === "+" || op === "-" ? left.type : "Bool" };
  }

  private length(node: ts.PropertyAccessExpression): Typed {
    const of = this.of(node.expression);
    if (node.name.text !== "length") {
      return this.refuse(node, `.${node.name.text}`);
    }
    return of.type === "String" || of.type === "[String]"
      ? { code: `${of.code}.count`, type: "Int" }
      : this.refuse(node, ".length of what is neither a String nor a list");
  }

  private call(node: ts.CallExpression): Typed {
    const callee = node.expression;
    if (ts.isIdentifier(callee) && HELPERS[callee.text]) {
      const args = node.arguments.map((arg) => this.of(arg).code);
      return {
        code: `Words.${callee.text}(${args.join(", ")})`,
        type: "String",
      };
    }
    if (
      ts.isPropertyAccessExpression(callee) &&
      callee.name.text === "join" &&
      node.arguments.length === 1
    ) {
      const list = this.of(callee.expression);
      const separator = this.of(node.arguments[0]);
      return list.type === "[String]" && separator.type === "String"
        ? {
            code: `${list.code}.joined(separator: ${separator.code})`,
            type: "String",
          }
        : this.refuse(node, ".join on what is not a list of strings");
    }
    return this.refuse(node, "the call");
  }
}

function swiftFunction(
  name: string,
  arrow: ts.ArrowFunction,
  where: string,
  source: ts.SourceFile,
  doc: string[]
): string[] {
  const params = new Map<string, SwiftType>();
  const signature = arrow.parameters.map((parameter) => {
    const id = parameter.name.getText(source);
    const written = parameter.type?.getText(source).replace(WHITESPACE, " ");
    const type =
      (written ? PARAM_TYPES[written] : undefined) ??
      fail(`${where}: parameter ${id} is a ${written ?? "type not written"}`);
    params.set(id, type);
    return `${member(id)}: ${type}`;
  });
  if (ts.isBlock(arrow.body)) {
    fail(`${where}: a word is one expression, not a block`);
  }
  const body = new Translation(params, where, source).of(
    arrow.body as ts.Expression
  );
  if (body.type !== "String") {
    fail(`${where}: a word answers a String, not a ${body.type}`);
  }
  return [
    ...doc,
    `public static func ${member(name)}(${signature.join(", ")}) -> String {`,
    `    ${body.code}`,
    "}",
  ];
}

// ── Values ──────────────────────────────────────────────────────────────

interface Emitting {
  exportName: string;
  module: string;
  properties: Map<string, ts.PropertyAssignment>;
  source: ts.SourceFile;
  statement: ts.VariableStatement | undefined;
}

const SCALAR_TYPES: Record<string, string> = {
  string: "String",
  boolean: "Bool",
};

function fieldType(values: unknown[], where: string): string {
  const kinds = new Set(
    values.map((value) => (value === null ? "null" : typeof value))
  );
  const optional = kinds.delete("null");
  const [kind] = [...kinds];
  if (kinds.size !== 1) {
    fail(`${where}: a field of mixed kinds`);
  }
  let base = SCALAR_TYPES[kind];
  if (kind === "number") {
    base = values.every((v) => v === null || Number.isInteger(v))
      ? "Int"
      : "Double";
  }
  if (!base) {
    fail(`${where}: a field that is a ${kind}`);
  }
  return optional ? `${base}?` : base;
}

const scalar = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "nil";
  }
  return typeof value === "string" ? literal(value) : String(value);
};

/** An array of records: a struct for them, and the array. */
function emitRecords(
  key: string,
  records: Record<string, unknown>[],
  doc: string[],
  where: string
): string[] {
  const fields: string[] = [];
  for (const record of records) {
    for (const field of Object.keys(record)) {
      if (!fields.includes(field)) {
        fields.push(field);
      }
    }
  }
  const struct = singular(key);
  const types = fields.map((field) =>
    fieldType(
      records.map((record) => record[field] ?? null),
      `${where}.${field}`
    )
  );
  return [
    `public struct ${struct}: Sendable, Equatable {`,
    ...fields.map((field, i) => `    public let ${member(field)}: ${types[i]}`),
    "}",
    "",
    ...doc,
    `public static let ${member(key)}: [${struct}] = [`,
    ...records.map(
      (record) =>
        `    ${struct}(${fields.map((field) => `${member(field)}: ${scalar(record[field])}`).join(", ")}),`
    ),
    "]",
  ];
}

/** An object of words: a nested enum, with `byKey` where every value is a string. */
function emitEnum(
  key: string,
  value: Record<string, unknown>,
  path: string,
  doc: string[],
  at: Emitting
): string[] {
  const entries = Object.entries(value);
  const body = entries.flatMap(([name, item], index) => [
    ...(index > 0 ? [""] : []),
    ...emit(name, item, path ? `${path}.${name}` : name, at),
  ]);
  const byKey = entries.every(([, item]) => typeof item === "string")
    ? [
        "",
        "/// Each word by the key it stands under, for a lookup by data value.",
        `public static let byKey: [String: String] = [${entries.map(([name]) => `${literal(name)}: ${member(name)}`).join(", ")}]`,
      ]
    : [];
  return [
    ...doc,
    `public enum ${typeName(key)} {`,
    ...indent([...body, ...byKey], "    "),
    "}",
  ];
}

/** One member of an enum: a word, a function, a nested enum, a list or records. */
function emit(
  key: string,
  value: unknown,
  path: string,
  at: Emitting
): string[] {
  const property = path === "" ? at.statement : at.properties.get(path);
  const doc = docLines(property);
  const where = `${at.module}: ${path || at.exportName}`;
  if (typeof value === "function") {
    const initializer =
      property && "initializer" in property
        ? bare(property.initializer)
        : undefined;
    if (!(initializer && ts.isArrowFunction(initializer))) {
      return fail(`${where}: no arrow function found`);
    }
    return swiftFunction(key, initializer, where, at.source, doc);
  }
  if (typeof value === "string") {
    return [...doc, `public static let ${member(key)} = ${literal(value)}`];
  }
  if (typeof value === "boolean" || typeof value === "number") {
    if (!Number.isInteger(Number(value))) {
      fail(`${where}: a fraction`);
    }
    return [...doc, `public static let ${member(key)} = ${String(value)}`];
  }
  if (Array.isArray(value) && value.every((one) => typeof one === "string")) {
    return [
      ...doc,
      `public static let ${member(key)}: [String] = [${value.map(scalar).join(", ")}]`,
    ];
  }
  if (Array.isArray(value) && value.every(isRecord)) {
    return emitRecords(key, value, doc, where);
  }
  if (isRecord(value)) {
    return emitEnum(key, value, path, doc, at);
  }
  return fail(`${where}: a ${typeof value} is not a word`);
}

// ── What the words are, for the scan ────────────────────────────────────

/** A template literal's text with a hole for each value: `${a} on ${b}` → "\0 on \0". */
const templateShape = (node: ts.TemplateExpression): string =>
  node.head.text +
  node.templateSpans.map((span) => HOLE + span.literal.text).join("");

/** What the scan knows the words by: their own text, and each template's shape. */
interface Vocabulary {
  known: string[];
  shapes: string[];
}

/** The fields of a list of records that hold ids, not words. */
const idFields = (records: Record<string, unknown>[]): Set<string> =>
  new Set(
    Object.keys(records[0] ?? {}).filter((field) =>
      records.every(
        (record) =>
          typeof record[field] === "string" &&
          RECORD_ID.test(record[field] as string)
      )
    )
  );

/** Every string under `value` that is a word: a record's id fields are not. */
function collectWords(value: unknown, into: string[]): void {
  if (typeof value === "string") {
    into.push(value);
    return;
  }
  if (Array.isArray(value)) {
    const ids = idFields(value.filter(isRecord));
    for (const item of value) {
      const kept = isRecord(item)
        ? Object.entries(item)
            .filter(([field]) => !ids.has(field))
            .map(([, inner]) => inner)
        : [item];
      for (const inner of kept) {
        collectWords(inner, into);
      }
    }
    return;
  }
  if (isRecord(value)) {
    for (const inner of Object.values(value)) {
      collectWords(inner, into);
    }
  }
}

/** A word's own static text: every literal and template part in its body, and each template's shape. */
function collectParts(node: ts.Node, into: Vocabulary): void {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    into.known.push(node.text);
  } else if (ts.isTemplateExpression(node)) {
    into.known.push(
      node.head.text,
      ...node.templateSpans.map((span) => span.literal.text)
    );
    into.shapes.push(templateShape(node));
  }
  node.forEachChild((child) => collectParts(child, into));
}

// ── Generating ──────────────────────────────────────────────────────────

/** One member's lines, and what it adds to the vocabulary. */
function emitMember(
  one: Member,
  value: unknown,
  source: ts.SourceFile,
  vocabulary: Vocabulary
): string[] {
  const properties = propertiesOf(source, one.export);
  const at: Emitting = {
    exportName: one.export,
    module: one.file,
    properties,
    source,
    statement: declarationOf(source, one.export)?.statement,
  };
  if (!one.rules) {
    collectWords(value, vocabulary.known);
    for (const property of properties.values()) {
      const initializer = bare(property.initializer);
      if (ts.isArrowFunction(initializer)) {
        collectParts(initializer.body, vocabulary);
      }
    }
  }
  if (one.as !== "") {
    return emit(one.as, value, "", at);
  }
  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, item], index) => [
      ...(index > 0 ? [""] : []),
      ...emit(key, item, key, at),
    ]
  );
}

async function generate(): Promise<{ swift: string; vocabulary: Vocabulary }> {
  const vocabulary: Vocabulary = { known: [], shapes: [] };
  const files = [
    ...new Set(ENUMS.flatMap((entry) => entry.members.map((m) => m.file))),
  ];
  const modules = new Map(
    await Promise.all(
      files.map(
        async (file) =>
          [
            file,
            {
              loaded: (await import(join(CORE, file))) as Record<
                string,
                unknown
              >,
              source: ts.createSourceFile(
                file,
                readFileSync(join(CORE, file), "utf8"),
                ts.ScriptTarget.Latest,
                true
              ),
            },
          ] as const
      )
    )
  );
  const enums = ENUMS.map((entry) => {
    const members = entry.members.flatMap((one, index) => {
      const read = modules.get(one.file) ?? fail(`no module ${one.file}`);
      const value =
        read.loaded[one.export] ?? fail(`${one.file}: no export ${one.export}`);
      return [
        ...(index > 0 ? [""] : []),
        `// packages/core/src/${one.file} \`${one.export}\``,
        ...emitMember(one, value, read.source, vocabulary),
      ];
    });
    return [
      `    public enum ${entry.swift} {`,
      ...indent(members, "        "),
      "    }",
    ].join("\n");
  });
  const swift = [
    "// Generated by `bun run words` from packages/core (src/words, ACCOUNT_RULES); do not edit.",
    "// The words the dashboard and this app share: change one there, then run it.",
    "",
    "public enum Words {",
    ...Object.values(HELPERS).map((body) => `${body}\n`),
    enums.join("\n\n"),
    "}",
    "",
  ].join("\n");
  return { swift, vocabulary };
}

// ── The scan: no file that reads the shared words spells one itself ─────

/** A word's static text long enough to be told apart from an id or a fragment. */
const telling = (words: string[]): string[] =>
  [...new Set(words.map((one) => one.trim()))].filter(
    (one) => one.length >= 4 && LETTER.test(one)
  );

/** A Swift file without what `#if DEBUG` keeps out of a release build. */
function releaseOnly(text: string): string {
  let depth = 0;
  return text
    .split("\n")
    .map((row) => {
      const trimmed = row.trim();
      if (
        trimmed.startsWith("#if DEBUG") ||
        (depth > 0 && trimmed.startsWith("#if"))
      ) {
        depth += 1;
        return "";
      }
      if (depth > 0 && trimmed.startsWith("#endif")) {
        depth -= 1;
        return "";
      }
      return depth > 0 ? "" : row;
    })
    .join("\n");
}

/** Reads a Swift file's string literals, each its static text, holes where values go. */
class SwiftLiterals {
  readonly found: { line: number; text: string }[] = [];
  private readonly code: string;
  private row = 1;

  constructor(text: string) {
    this.code = releaseOnly(text);
  }

  read(): { line: number; text: string }[] {
    let i = 0;
    while (i < this.code.length) {
      i = this.step(i);
    }
    return this.found;
  }

  /** One step of the walk from `i`: past a line, a comment or a literal. */
  private step(i: number): number {
    const c = this.code[i];
    if (c === "\n") {
      this.row += 1;
      return i + 1;
    }
    if (c === "/" && this.code[i + 1] === "/") {
      const end = this.code.indexOf("\n", i);
      return end === -1 ? this.code.length : end;
    }
    if (c === "/" && this.code[i + 1] === "*") {
      const end = this.code.indexOf("*/", i + 2);
      this.row += this.code.slice(i, end).split("\n").length - 1;
      return end + 2;
    }
    if (c !== '"') {
      return i + 1;
    }
    const literalAt = this.literal(i);
    if (!TRAP.test(this.code.slice(Math.max(0, i - 24), i))) {
      this.found.push({ line: this.row, text: literalAt.text });
    }
    return literalAt.end + 1;
  }

  /** A literal from its opening quote: its static text and where it ends. */
  private literal(start: number): { end: number; text: string } {
    let at = start + 1;
    let text = "";
    while (at < this.code.length && this.code[at] !== '"') {
      if (this.code[at] === "\\" && this.code[at + 1] === "(") {
        at = this.interpolation(at + 2);
        text += HOLE;
      } else if (this.code[at] === "\\") {
        text += this.code[at + 1] ?? "";
        at += 2;
      } else {
        text += this.code[at];
        at += 1;
      }
    }
    return { end: at, text };
  }

  /** An interpolation's code, read for its own literals; where it closes. */
  private interpolation(from: number): number {
    let at = from;
    let depth = 1;
    while (at < this.code.length && depth > 0) {
      const c = this.code[at];
      if (c === '"') {
        const inner = this.literal(at);
        this.found.push({ line: this.row, text: inner.text });
        at = inner.end + 1;
        continue;
      }
      if (c === "(") {
        depth += 1;
      } else if (c === ")") {
        depth -= 1;
      }
      at += 1;
    }
    return at;
  }
}

/**
 * Text a person reads: a word's template spelled again, typography, a
 * capitalised word, a phrase, a word's own text, or a sentence of one.
 */
function spells(text: string, { known, shapes }: Vocabulary): boolean {
  if (LETTER.test(text) && shapes.includes(text)) {
    return true;
  }
  const trimmed = text.replaceAll(HOLE, "").trim();
  // An HTTP header's name ("Content-Type") is the protocol's, not a word.
  if (!LETTER.test(trimmed) || HEADER_NAME.test(trimmed)) {
    return false;
  }
  if (TYPOGRAPHY.test(trimmed) || CAPITALISED.test(trimmed)) {
    return true;
  }
  // A phrase: two or more tokens with letters ("resets 4h 25m"); a hole is
  // no break, so a path's slots don't make one.
  const lettered = text
    .trim()
    .split(SPACES)
    .filter((token) => LETTER.test(token));
  if (lettered.length > 1) {
    return true;
  }
  return known.some(
    (word) => word === trimmed || (word.includes(" ") && trimmed.includes(word))
  );
}

/** A TS file's literals that are a word's own text, hold a sentence of one, or spell a word's template again. */
function tsFindings(
  text: string,
  { known, shapes }: Vocabulary
): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  const source = ts.createSourceFile(
    "scan.ts",
    text,
    ts.ScriptTarget.Latest,
    true
  );
  // A script's ids are strings too (a phase is "waiting"): only a word that
  // could not be an id is matched whole, and a sentence's within a literal.
  const whole = known.filter((word) => !ID_LIKE.test(word));
  const sentences = known.filter(
    (word) => word.includes(" ") && word.length >= 8
  );
  const lineOf = (node: ts.Node) =>
    source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const piecesOf = (node: ts.Node): string[] => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      return [node.text];
    }
    if (ts.isTemplateExpression(node)) {
      return [
        node.head.text,
        ...node.templateSpans.map((span) => span.literal.text),
      ];
    }
    return [];
  };
  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) ||
      ts.isExportDeclaration(node) ||
      ts.isImportTypeNode(node)
    ) {
      return;
    }
    if (ts.isTemplateExpression(node)) {
      const shape = templateShape(node);
      if (LETTER.test(shape) && shapes.includes(shape)) {
        out.push({ line: lineOf(node), text: node.getText(source) });
      }
    }
    for (const piece of piecesOf(node)) {
      const trimmed = piece.trim();
      if (
        trimmed &&
        (whole.includes(trimmed) ||
          sentences.some((word) => trimmed.includes(word)))
      ) {
        out.push({ line: lineOf(node), text: piece });
      }
    }
    node.forEachChild(visit);
  };
  visit(source);
  return out;
}

/** Markup text a person reads in a Svelte file, the word-bearing attributes' values, and its scripts' and expressions' literals. */
function svelteFindings(
  text: string,
  vocabulary: Vocabulary
): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  const lineAt = (index: number) => text.slice(0, index).split("\n").length;
  const blank = (match: string) => match.replace(NOT_NEWLINE, " ");
  for (const script of text.matchAll(SCRIPT)) {
    const offset = (script.index ?? 0) + script[0].indexOf(script[1]);
    for (const found of tsFindings(script[1], vocabulary)) {
      out.push({ line: lineAt(offset) + found.line - 1, text: found.text });
    }
  }
  let markup = text
    .replace(SCRIPT, blank)
    .replace(STYLE, blank)
    .replace(COMMENT, blank);
  // Expressions in braces, innermost first: their literals, as a script's;
  // then each is blanked, so what is left is attributes and text.
  while (markup.match(BRACES)) {
    for (const match of markup.matchAll(BRACES)) {
      for (const found of tsFindings(match[1], vocabulary)) {
        out.push({ line: lineAt(match.index ?? 0), text: found.text });
      }
    }
    markup = markup.replace(BRACES, blank);
  }
  for (const match of markup.matchAll(WORD_ATTRS)) {
    if (LETTER.test(match[2])) {
      out.push({ line: lineAt(match.index ?? 0), text: match[0].trim() });
    }
  }
  const outside = markup.replace(TAG, blank);
  for (const match of outside.matchAll(TEXT_RUN)) {
    if (TWO_LETTERS.test(match[0])) {
      out.push({ line: lineAt(match.index ?? 0), text: match[0].trim() });
    }
  }
  return out;
}

function scan(vocabulary: Vocabulary): string[] {
  const told: Vocabulary = {
    known: telling(vocabulary.known),
    shapes: vocabulary.shapes,
  };
  const problems: string[] = [];
  for (const file of CHECKED_SWIFT) {
    const path = join(APPLE, file);
    for (const found of new SwiftLiterals(readFileSync(path, "utf8")).read()) {
      if (spells(found.text, told)) {
        problems.push(
          `${relative(ROOT, path)}:${found.line}: "${found.text.replaceAll(HOLE, "…").trim()}"`
        );
      }
    }
  }
  for (const file of CHECKED_WEB) {
    const path = join(DASHBOARD, file);
    const text = readFileSync(path, "utf8");
    const findings = file.endsWith(".svelte")
      ? svelteFindings(text, told)
      : tsFindings(text, told);
    for (const found of findings) {
      problems.push(`${relative(ROOT, path)}:${found.line}: ${found.text}`);
    }
  }
  return problems;
}

/**
 * Every section names a glyph the app has (a `Glyph` case's raw value, a
 * Solar name) and a hue it has a colour set for (`Palette.named` traps on
 * any other): said here, at `bun run words`, rather than at launch.
 */
async function drawable(): Promise<string[]> {
  const { CONFIG_SECTIONS } = (await import(
    join(CORE, "words/configure.ts")
  )) as typeof import("../packages/core/src/words/configure");
  const glyphs = new Set(
    [
      ...readFileSync(join(APPLE, "CawCoDesign/Glyph.swift"), "utf8").matchAll(
        GLYPH_CASE
      ),
    ].map((match) => match[1])
  );
  const colours = join(APPLE, "CawCoDesign/Resources/Tokens.xcassets");
  const problems: string[] = [];
  for (const section of CONFIG_SECTIONS) {
    if (!glyphs.has(section.icon)) {
      problems.push(
        `${section.slug}: the app has no Glyph "${section.icon}" (apps/apple/scripts/icons.ts)`
      );
    }
    if (!existsSync(join(colours, `${section.hue}.colorset`))) {
      problems.push(
        `${section.slug}: the app has no colour set ${section.hue} (bun run tokens)`
      );
    }
  }
  return problems;
}

const undrawable = await drawable();
if (undrawable.length) {
  console.error(
    `Configure names what the app cannot draw:\n${undrawable.map((one) => `  ${one}`).join("\n")}`
  );
  process.exit(1);
}
const generated = await generate();
if (process.argv.includes("--check")) {
  const stale = readFileSync(OUT, "utf8") !== generated.swift;
  const spelled = scan(generated.vocabulary);
  if (stale) {
    console.error(
      `${relative(ROOT, OUT)} is out of date — run \`bun run words\``
    );
  }
  if (spelled.length) {
    console.error(
      `Words spelled outside packages/core/src/words (read them from there):\n${spelled.map((one) => `  ${one}`).join("\n")}`
    );
  }
  if (stale || spelled.length) {
    process.exit(1);
  }
  console.log(
    `${relative(ROOT, OUT)} is up to date, and ${CHECKED_SWIFT.length + CHECKED_WEB.length} files read their words from core`
  );
} else {
  writeFileSync(OUT, generated.swift);
  console.log(`wrote ${relative(ROOT, OUT)}`);
}

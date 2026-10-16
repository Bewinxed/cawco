/**
 * A CSF 3 story file, read and written in place (live components spec §5):
 * each story's `args` and the meta's, read off the file's syntax with
 * Babel's parser (as Storybook's CSF tooling reads it); a story's args
 * written back the way Storybook's "save from controls" does ("This feature
 * only works with stories defined in CSF3!", storybookjs/storybook#26827),
 * and story exports added, duplicated, removed and moved. CawCo writes only
 * these; everything else in a sheet is a pin the agent acts on.
 *
 * A write changes the fewest characters it can: a changed arg is its value's
 * text replaced, a new one a property added after the last, a dropped one
 * its property taken out with its comma; the rest of the file, its quote
 * style, indent and trailing commas, stays as it was. Values are written
 * as JSON literals in the file's own quote; an arg whose value is code (a
 * fixture import, a function) is never touched.
 */
import { parse } from "@babel/parser";
import type { Story, StoryOp } from "@cawco/core/stage";

/** A node of Babel's syntax tree, as far as a story file is read. */
interface Node {
  end?: number | null;
  loc?: { start: { column: number; line: number } } | null;
  start?: number | null;
  type: string;
  [field: string]: unknown;
}

/** What a story file says, before the stage resolves its components. */
export interface StaticSheet {
  /** Each component import by local name: its source as the file writes it. */
  imports: Map<string, string>;
  meta: {
    args: Record<string, unknown>;
    code: Record<string, string>;
    component: string | null;
  };
  /** Each story, its `component` its local name when it names its own. */
  stories: Story[];
}

/** Why a write was not made, in one sentence the person and the agent read. */
export class StoryRefusal extends Error {}

const TSX = /\.tsx$/;
const TS = /\.[cm]?ts$/;

/** A story file's syntax plugins, by its extension: JSX only where the file may hold it, so a `.ts` file's `<T>() =>` stays a generic. */
const syntaxOf = (file: string): ("jsx" | "typescript")[] => {
  if (TSX.test(file)) {
    return ["typescript", "jsx"];
  }
  return TS.test(file) ? ["typescript"] : ["jsx"];
};

const parsed = (file: string, text: string): Node[] =>
  parse(text, {
    sourceType: "module",
    plugins: syntaxOf(file),
    tokens: false,
  }).program.body as unknown as Node[];

const child = (node: Node, field: string): Node | null =>
  (node[field] as Node | null | undefined) ?? null;
const children = (node: Node, field: string): Node[] =>
  (node[field] as Node[] | undefined) ?? [];

/** An expression under its TypeScript wrappers (`as const`, `satisfies Story`, `!`, parentheses). */
const bare = (node: Node | null): Node | null => {
  let at = node;
  while (
    at &&
    (at.type === "TSAsExpression" ||
      at.type === "TSSatisfiesExpression" ||
      at.type === "TSNonNullExpression" ||
      at.type === "ParenthesizedExpression")
  ) {
    at = child(at, "expression");
  }
  return at;
};

/** A property's key as a name: `a`, `"a"`, never a computed one. */
const keyOf = (property: Node): string | null => {
  if (property.computed) {
    return null;
  }
  const key = child(property, "key");
  if (key?.type === "Identifier") {
    return key.name as string;
  }
  return key?.type === "StringLiteral" ? (key.value as string) : null;
};

/** Whether an expression is a literal the inspector writes: its value, else undefined. */
function literal(node: Node | null): { value: unknown } | undefined {
  const at = bare(node);
  switch (at?.type) {
    case "StringLiteral":
    case "NumericLiteral":
    case "BooleanLiteral":
      return { value: at.value };
    case "NullLiteral":
      return { value: null };
    case "TemplateLiteral":
      return children(at, "expressions").length === 0
        ? {
            value: children(at, "quasis")
              .map((quasi) => (quasi.value as { cooked: string }).cooked)
              .join(""),
          }
        : undefined;
    case "UnaryExpression": {
      const inner = literal(child(at, "argument"));
      return at.operator === "-" && typeof inner?.value === "number"
        ? { value: -inner.value }
        : undefined;
    }
    case "ArrayExpression":
      return arrayLiteral(at);
    case "ObjectExpression":
      return objectLiteral(at);
    default:
      return;
  }
}

/** An array of literals: its values; undefined at the first element that is code. */
function arrayLiteral(at: Node): { value: unknown[] } | undefined {
  const values: unknown[] = [];
  for (const element of children(at, "elements")) {
    const one = literal(element);
    if (!one) {
      return;
    }
    values.push(one.value);
  }
  return { value: values };
}

/** An object of literals under plain keys: its value; undefined at the first property that is code. */
function objectLiteral(
  at: Node
): { value: Record<string, unknown> } | undefined {
  const value: Record<string, unknown> = {};
  for (const property of children(at, "properties")) {
    const key = property.type === "ObjectProperty" ? keyOf(property) : null;
    const one = key === null ? undefined : literal(child(property, "value"));
    if (key === null || !one) {
      return;
    }
    value[key] = one.value;
  }
  return { value };
}

/** An object literal's args: each literal one's value, and the source of each that is code (a spread under its own text). */
function argsOf(
  text: string,
  object: Node | null
): { args: Record<string, unknown>; code: Record<string, string> } {
  const args: Record<string, unknown> = {};
  const code: Record<string, string> = {};
  for (const property of children(object ?? { type: "" }, "properties")) {
    const source = text.slice(property.start ?? 0, property.end ?? 0);
    const key = property.type === "ObjectProperty" ? keyOf(property) : null;
    if (key === null) {
      code[source] = source;
      continue;
    }
    const one = literal(child(property, "value"));
    if (one) {
      args[key] = one.value;
    } else {
      const value = child(property, "value");
      code[key] = text.slice(value?.start ?? 0, value?.end ?? 0);
    }
  }
  return { args, code };
}

/** A property of an object literal by its key. */
const propertyOf = (object: Node | null, key: string): Node | undefined =>
  children(object ?? { type: "" }, "properties").find(
    (property) => property.type === "ObjectProperty" && keyOf(property) === key
  );

/** An identifier's name, when the expression is one. */
const identifier = (node: Node | null): string | null => {
  const at = bare(node);
  return at?.type === "Identifier" ? (at.name as string) : null;
};

/** One story export: its name, the statement it stands in, its object literal (null for a function story), its name's place. */
interface Export {
  name: string;
  object: Node | null;
  place: Node;
  statement: Node;
}

/** The default export's object literal, followed through a local `const meta = {…}; export default meta`. */
function metaObject(body: Node[]): Node | null {
  const declared = new Map<string, Node | null>();
  for (const node of body) {
    const declaration =
      node.type === "ExportNamedDeclaration"
        ? child(node, "declaration")
        : node;
    if (declaration?.type === "VariableDeclaration") {
      for (const one of children(declaration, "declarations")) {
        const name = identifier(child(one, "id"));
        if (name) {
          declared.set(name, bare(child(one, "init")));
        }
      }
    }
  }
  const exported = body.find(
    (node) => node.type === "ExportDefaultDeclaration"
  );
  const value = bare(exported ? child(exported, "declaration") : null);
  if (value?.type === "ObjectExpression") {
    return value;
  }
  if (value?.type === "CallExpression") {
    // `export default defineMeta({…})`-style helpers take the object as their first argument.
    const first = bare(children(value, "arguments")[0] ?? null);
    return first?.type === "ObjectExpression" ? first : null;
  }
  const name = identifier(value);
  return name ? (declared.get(name) ?? null) : null;
}

/** A variable declaration's names, each with its object literal (null when its value is none), its place and `statement`. */
const declaredIn = (declaration: Node, statement: Node): Export[] =>
  children(declaration, "declarations").flatMap((one) => {
    const id = child(one, "id");
    const name = identifier(id);
    if (!(name && id)) {
      return [];
    }
    const init = bare(child(one, "init"));
    return [
      {
        name,
        object: init?.type === "ObjectExpression" ? init : null,
        place: id,
        statement,
      },
    ];
  });

/** What one `export …` statement exports as stories: its declarations, or its specifiers of the file's own declarations. */
function exportedBy(node: Node, local: Map<string, Export>): Export[] {
  const declaration = child(node, "declaration");
  const found: Export[] = [];
  if (declaration?.type === "VariableDeclaration") {
    found.push(...declaredIn(declaration, node));
  } else if (declaration?.type === "FunctionDeclaration") {
    const id = child(declaration, "id");
    const name = identifier(id);
    if (name && id) {
      found.push({ name, object: null, place: id, statement: node });
    }
  }
  for (const specifier of children(node, "specifiers")) {
    const exported = child(specifier, "exported");
    const name = (exported?.name ?? exported?.value) as string | undefined;
    if (
      specifier.type === "ExportSpecifier" &&
      specifier.exportKind !== "type" &&
      name &&
      exported
    ) {
      const from = local.get(identifier(child(specifier, "local")) ?? "");
      found.push({
        name,
        object: from?.object ?? null,
        place: exported,
        statement: from?.statement ?? node,
      });
    }
  }
  return found;
}

/** Each story export, in the file's order: `export const A = {…}`, or `export { A }` of a local one. */
function exportsOf(body: Node[]): Export[] {
  const local = new Map(
    body
      .filter((node) => node.type === "VariableDeclaration")
      .flatMap((node) => declaredIn(node, node))
      .map((one) => [one.name, one] as const)
  );
  return body
    .filter(
      (node) =>
        node.type === "ExportNamedDeclaration" && node.exportKind !== "type"
    )
    .flatMap((node) => exportedBy(node, local))
    .filter((one) => one.name !== "__namedExportsOrder");
}

/** The file's component imports, by local name: `import Card from "./Card.svelte"`, `import { Card } from "./Card"`. */
function importsOf(body: Node[]): Map<string, string> {
  const found = new Map<string, string>();
  for (const node of body) {
    if (node.type !== "ImportDeclaration" || node.importKind === "type") {
      continue;
    }
    const source = (child(node, "source")?.value as string | undefined) ?? "";
    for (const specifier of children(node, "specifiers")) {
      const name = identifier(child(specifier, "local"));
      if (name) {
        found.set(name, source);
      }
    }
  }
  return found;
}

/**
 * What story file `file` (absolute) says: each story by its export's name
 * and 1-based place, with its args; the meta's args and component. The
 * default export is the meta, a type is no story, and Storybook's
 * `__namedExportsOrder` is no story either.
 */
export function readStoryFile(file: string, text: string): StaticSheet {
  const body = parsed(file, text);
  const meta = metaObject(body);
  const stories = exportsOf(body).map(({ name, object, place }): Story => {
    const args = argsOf(
      text,
      bare(child(propertyOf(object, "args") ?? { type: "" }, "value"))
    );
    return {
      name,
      line: place.loc?.start.line ?? 1,
      column: (place.loc?.start.column ?? 0) + 1,
      ...args,
      component: identifier(
        child(propertyOf(object, "component") ?? { type: "" }, "value")
      ),
    };
  });
  return {
    imports: importsOf(body),
    meta: {
      ...argsOf(
        text,
        bare(child(propertyOf(meta, "args") ?? { type: "" }, "value"))
      ),
      component: identifier(
        child(propertyOf(meta, "component") ?? { type: "" }, "value")
      ),
    },
    stories,
  };
}

/* --- Writing ---------------------------------------------------------- */

/** How the file writes: its strings' quote, its indent step, and whether a multi-line literal ends on a comma. */
interface Style {
  indent: string;
  quote: '"' | "'";
  trailing: boolean;
}

const LEADING = /^([ \t]+)\S/m;
const DOUBLE = /"(?:[^"\\\n]|\\.)*"/g;
const SINGLE = /'(?:[^'\\\n]|\\.)*'/g;
const TRAILING_COMMA = /,\s*[}\]]/;

function styleOf(text: string): Style {
  const doubles = text.match(DOUBLE)?.length ?? 0;
  const singles = text.match(SINGLE)?.length ?? 0;
  return {
    quote: singles > doubles ? "'" : '"',
    indent: text.match(LEADING)?.[1] ?? "  ",
    trailing: TRAILING_COMMA.test(text),
  };
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const STORY_NAME = /^[A-Z][A-Za-z0-9_]*$/;

/** A string in the file's quote. */
const quoted = (value: string, quote: Style["quote"]): string => {
  const json = JSON.stringify(value);
  return quote === '"'
    ? json
    : `'${json.slice(1, -1).replaceAll('\\"', '"').replaceAll("'", "\\'")}'`;
};

/** A key as the file would write it: bare when it can be. */
const keyText = (key: string, style: Style): string =>
  IDENTIFIER.test(key) ? key : quoted(key, style.quote);

/** A JSON value as a literal in the file's style, on one line. */
function printed(value: unknown, style: Style): string {
  if (typeof value === "string") {
    return quoted(value, style.quote);
  }
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((one) => printed(one, style)).join(", ")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return entries.length === 0
      ? "{}"
      : `{ ${entries.map(([key, one]) => `${keyText(key, style)}: ${printed(one, style)}`).join(", ")} }`;
  }
  throw new StoryRefusal(
    `${String(value)} is no JSON value, so it can't be written as an arg.`
  );
}

/** One replacement of `[from, to)` in the file's text. */
interface Splice {
  from: number;
  text: string;
  to: number;
}

/** The text after its splices, applied from the last, and the 1-based lines they changed in it. */
function applied(
  text: string,
  splices: Splice[]
): { lines: { from: number; to: number }; text: string } {
  const ordered = [...splices].sort((a, b) => b.from - a.from);
  let out = text;
  for (const one of ordered) {
    out = out.slice(0, one.from) + one.text + out.slice(one.to);
  }
  const first = Math.min(...splices.map((one) => one.from));
  // Where the last splice ends in the new text: every earlier one's growth moves it.
  const growth = splices.reduce(
    (sum, one) => sum + one.text.length - (one.to - one.from),
    0
  );
  const last = Math.max(...splices.map((one) => one.to)) + growth;
  const lineAt = (offset: number) =>
    out.slice(0, Math.max(0, offset)).split("\n").length;
  return {
    text: out,
    lines: { from: lineAt(first), to: Math.max(lineAt(first), lineAt(last)) },
  };
}

/** The indent of the line `offset` stands on. */
const lineIndent = (text: string, offset: number): string => {
  const start = text.lastIndexOf("\n", offset - 1) + 1;
  return text.slice(start).match(INDENT)?.[0] ?? "";
};
const INDENT = /^[ \t]*/;

/** Whether an object literal stands on more than one line. */
const multiline = (text: string, object: Node): boolean =>
  text.slice(object.start ?? 0, object.end ?? 0).includes("\n");

/**
 * The splices that add `entries` (`key: value` texts) to an object literal
 * after its last property, in its layout: a line each in a multi-line one,
 * inline in a one-line one; `{}` becomes `{ a: 1 }`.
 */
function added(
  text: string,
  object: Node,
  entries: string[],
  style: Style
): Splice[] {
  if (entries.length === 0) {
    return [];
  }
  const properties = children(object, "properties");
  const close = (object.end ?? 0) - 1;
  const last = properties.at(-1);
  if (!last) {
    return [
      {
        from: (object.start ?? 0) + 1,
        to: close,
        text: ` ${entries.join(", ")} `,
      },
    ];
  }
  const after = text.slice(last.end ?? 0, close);
  const comma = after.trimStart().startsWith(",");
  const at = (last.end ?? 0) + (comma ? after.indexOf(",") + 1 : 0);
  if (!multiline(text, object)) {
    return [
      {
        from: at - (comma ? 1 : 0),
        to: at,
        text: `, ${entries.join(", ")}${comma ? "," : ""}`,
      },
    ];
  }
  const indent = lineIndent(text, last.start ?? 0);
  const lines = entries.map((entry) => `\n${indent}${entry}`).join(",");
  return [
    {
      from: at,
      to: at,
      text: `${comma ? "" : ","}${lines}${comma || style.trailing ? "," : ""}`,
    },
  ];
}

/** The splice that takes a property out of its object literal with its comma, and its line when it stood on one of its own. */
function removed(text: string, object: Node, property: Node): Splice {
  const properties = children(object, "properties");
  const index = properties.indexOf(property);
  const next = properties[index + 1];
  const previous = properties[index - 1];
  if (multiline(text, object)) {
    const lineStart = text.lastIndexOf("\n", (property.start ?? 0) - 1);
    let end = property.end ?? 0;
    const rest = text.slice(end);
    const comma = rest.match(COMMA_AFTER);
    end += comma ? comma[0].length : 0;
    return { from: lineStart, to: end, text: "" };
  }
  if (next) {
    return { from: property.start ?? 0, to: next.start ?? 0, text: "" };
  }
  return previous
    ? { from: previous.end ?? 0, to: property.end ?? 0, text: "" }
    : { from: (object.start ?? 0) + 1, to: (object.end ?? 0) - 1, text: "" };
}
const COMMA_AFTER = /^[ \t]*,?/;

/** The story `name` of the file, refused by name when it has none or it is no object literal. */
function storyNamed(
  file: string,
  exports: Export[],
  name: string
): Export & { object: Node } {
  const story = exports.find((one) => one.name === name);
  if (!story) {
    throw new StoryRefusal(
      `${file} has no story ${name}; its stories are ${exports.map((one) => one.name).join(", ") || "none"}.`
    );
  }
  if (!story.object) {
    throw new StoryRefusal(
      `${name} in ${file} is a function (CSF 2) or no object literal, so its args can't be written: make it \`export const ${name} = { args: {…} }\`.`
    );
  }
  return story as Export & { object: Node };
}

/**
 * Story `story`'s args in file `file` with `values` set and `unset`
 * dropped: each changed value's text replaced, new ones added after the
 * last, dropped ones taken out. A story with no `args` gets one. Answers
 * the new text and the lines it changed.
 */
export function writeArgs(
  file: string,
  text: string,
  story: string,
  values: Record<string, unknown>,
  unset: string[] = []
): { lines: { from: number; to: number }; text: string } {
  const style = styleOf(text);
  const exports = exportsOf(parsed(file, text));
  const { object } = storyNamed(file, exports, story);
  const argsProperty = propertyOf(object, "args");
  const args = bare(argsProperty ? child(argsProperty, "value") : null);
  if (argsProperty && args?.type !== "ObjectExpression") {
    throw new StoryRefusal(
      `${story}'s args in ${file} are \`${text.slice(args?.start ?? 0, args?.end ?? 0)}\`, no object literal, so they can't be written: make them one.`
    );
  }
  const keys = Object.keys(values);
  if (keys.length === 0 && unset.length === 0) {
    throw new StoryRefusal(
      "Nothing to write: give values to set or args to unset."
    );
  }
  if (!args) {
    const entries = keys.map(
      (key) => `${keyText(key, style)}: ${printed(values[key], style)}`
    );
    if (entries.length === 0) {
      throw new StoryRefusal(`${story} has no args of its own to unset.`);
    }
    return applied(
      text,
      added(text, object, [`args: { ${entries.join(", ")} }`], style)
    );
  }
  const splices = argsSplices(text, args, story, values, unset, style);
  if (splices.length === 0) {
    throw new StoryRefusal(
      `${story} has none of ${unset.join(", ")} to unset.`
    );
  }
  return applied(text, splices);
}

/** The splices that set `values` and drop `unset` in a story's `args` literal: each set value's text replaced, new ones added, dropped ones taken out. */
function argsSplices(
  text: string,
  args: Node,
  story: string,
  values: Record<string, unknown>,
  unset: string[],
  style: Style
): Splice[] {
  const splices: Splice[] = [];
  const fresh: string[] = [];
  for (const [key, next] of Object.entries(values)) {
    const property = propertyOf(args, key);
    const value = property ? child(property, "value") : null;
    if (!value) {
      fresh.push(`${keyText(key, style)}: ${printed(next, style)}`);
      continue;
    }
    if (!literal(value)) {
      throw new StoryRefusal(
        `${story}'s ${key} is code (\`${text.slice(value.start ?? 0, value.end ?? 0)}\`), which CawCo leaves to the agent: edit it in the file.`
      );
    }
    splices.push({
      from: value.start ?? 0,
      to: value.end ?? 0,
      text: printed(next, style),
    });
  }
  for (const key of unset) {
    const property = propertyOf(args, key);
    if (property && !(key in values)) {
      splices.push(removed(text, args, property));
    }
  }
  splices.push(...added(text, args, fresh, style));
  return splices;
}

/** A statement's whole text from the start of its first line, with the comments right above it, to the end of its line. */
function block(text: string, statement: Node): { from: number; to: number } {
  const comments = (statement.leadingComments as Node[] | undefined) ?? [];
  const first = comments[0]?.start ?? statement.start ?? 0;
  const from = text.lastIndexOf("\n", first - 1) + 1;
  const lineEnd = text.indexOf("\n", statement.end ?? 0);
  return { from, to: lineEnd === -1 ? text.length : lineEnd + 1 };
}

/** A statement's block as it is taken out: with the blank line that set it apart, the one after it, or the one before it when it ends the file. */
function cutOf(text: string, statement: Node): { from: number; to: number } {
  const { from, to } = block(text, statement);
  const after = text.slice(to).match(BLANK)?.[0].length ?? 0;
  if (after > 0 || to < text.length) {
    return { from, to: to + after };
  }
  return { from: text.slice(0, from).endsWith("\n\n") ? from - 1 : from, to };
}

/** A new story's statement in the shape of `like`'s: its keyword, type and `satisfies`, with `name` and its own object literal. */
function storyLike(
  text: string,
  like: Export,
  name: string,
  object: string
): string {
  const statement = text.slice(
    like.statement.start ?? 0,
    like.statement.end ?? 0
  );
  if (!like.object || like.statement.type !== "ExportNamedDeclaration") {
    return `export const ${name} = ${object};`;
  }
  const base = like.statement.start ?? 0;
  const head = text.slice(base, like.place.start ?? 0);
  const between = text.slice(like.place.end ?? 0, like.object.start ?? 0);
  const tail = statement.slice((like.object.end ?? 0) - base);
  return `${head}${name}${between}${object}${tail}`;
}

/** A story's name the file can take: an identifier starting with a capital, and no other story's. */
function freshName(file: string, exports: Export[], name: string): void {
  if (!STORY_NAME.test(name)) {
    throw new StoryRefusal(
      `${name} can't name a story: a story's export is a name like Roomy, starting with a capital, letters, digits and _ only.`
    );
  }
  if (exports.some((one) => one.name === name)) {
    throw new StoryRefusal(`${file} has a story ${name} already.`);
  }
}

/** Story file `file` with `op` made: a story added after the last, duplicated after its original, removed, or moved before another. */
export function writeStoryOp(
  file: string,
  text: string,
  op: StoryOp
): { lines: { from: number; to: number }; text: string } {
  const exports = exportsOf(parsed(file, text));
  if ("add" in op) {
    return addStory(file, text, exports, op);
  }
  if ("duplicate" in op) {
    const original = storyNamed(file, exports, op.duplicate);
    freshName(file, exports, op.as);
    const object = text.slice(
      original.object.start ?? 0,
      original.object.end ?? 0
    );
    const at = block(text, original.statement).to;
    return applied(text, [
      {
        from: at,
        to: at,
        text: `\n${storyLike(text, original, op.as, object)}\n`,
      },
    ]);
  }
  if ("remove" in op) {
    const story = exports.find((one) => one.name === op.remove);
    if (!story) {
      throw new StoryRefusal(`${file} has no story ${op.remove}.`);
    }
    return applied(text, [{ ...cutOf(text, story.statement), text: "" }]);
  }
  return moveStory(file, text, exports, op);
}

/** A story added after the last, in its statement's shape, with `op.args`. */
function addStory(
  file: string,
  text: string,
  exports: Export[],
  op: { add: string; args?: Record<string, unknown> }
): { lines: { from: number; to: number }; text: string } {
  const style = styleOf(text);
  const last = exports.at(-1);
  freshName(file, exports, op.add);
  const entries = Object.entries(op.args ?? {}).map(
    ([key, value]) => `${keyText(key, style)}: ${printed(value, style)}`
  );
  const object =
    entries.length > 0 ? `{ args: { ${entries.join(", ")} } }` : "{ args: {} }";
  const statement = last
    ? storyLike(text, last, op.add, object)
    : `export const ${op.add} = ${object};`;
  const at = last ? block(text, last.statement).to : text.length;
  const before = text.slice(0, at).endsWith("\n") ? "" : "\n";
  return applied(text, [
    { from: at, to: at, text: `${before}\n${statement}\n` },
  ]);
}

/** A story moved before another, or to the end; refused when it stands there already. */
function moveStory(
  file: string,
  text: string,
  exports: Export[],
  op: { before: string | null; move: string }
): { lines: { from: number; to: number }; text: string } {
  const last = exports.at(-1);
  const moving = exports.find((one) => one.name === op.move);
  if (!moving) {
    throw new StoryRefusal(`${file} has no story ${op.move}.`);
  }
  const target =
    op.before === null ? null : exports.find((one) => one.name === op.before);
  if (op.before !== null && !target) {
    throw new StoryRefusal(
      `${file} has no story ${op.before} to move ${op.move} before.`
    );
  }
  const index = exports.indexOf(moving);
  if (
    target === moving ||
    (target
      ? exports.indexOf(target) === index + 1
      : index === exports.length - 1)
  ) {
    throw new StoryRefusal(`${op.move} stands there already.`);
  }
  const own = block(text, moving.statement);
  const piece = text.slice(own.from, own.to);
  const at = target
    ? block(text, target.statement).from
    : block(text, last?.statement ?? moving.statement).to;
  return applied(text, [
    { ...cutOf(text, moving.statement), text: "" },
    { from: at, to: at, text: target ? `${piece}\n` : `\n${piece}` },
  ]);
}
const BLANK = /^[ \t]*\n/;

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
 * fixture import, a function) is never touched. The stage then formats the
 * one statement a write printed into ({@link storyStatement}) with the
 * project's own formatter (host.ts `inProjectStyle`).
 */

import { parse } from "@babel/parser";
import {
  FORMS,
  type Form,
  type FormName,
  formNamed,
  formNameOf,
  STORY_NAME,
  type Story,
  type StoryOp,
} from "@cawco/core/stage";
import { type NamedStory, shownName } from "@cawco/core/stage-graph";
import { cutShort } from "@cawco/core/words/helpers";
import { storyReadWords as reasons } from "@cawco/core/words/story-read";

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
    title: string | null;
  };
  /**
   * Each story's own modules, by its export's name: the modules its
   * `beforeEach` (and the meta's) imports with `import(…)`, as the file
   * writes them (a literal's value; a template's or a call's source). A
   * story with none shares the page's modules; one with any is evaluated in
   * a runner of its own (host.ts `ownSet`).
   */
  standIns: Map<string, string[]>;
  /** Each story, its `component` its local name when it names its own. */
  stories: Story[];
  /** Stories that differ in nothing but their `parameters.viewport`, each group by export name, in the file's order ({@link drawnApartFromWidth}). */
  widthOnly: string[][];
}

/** Why a write was not made, in one sentence the person and the agent read. */
export class StoryRefusal extends Error {}

const TSX = /\.tsx$/u;
const TS = /\.[cm]?ts$/u;

/** A story file's syntax plugins, by its extension: JSX only where the file may hold it, so a `.ts` file's `<T>() =>` stays a generic. */
const syntaxOf = (file: string): ("jsx" | "typescript")[] => {
  if (TSX.test(file)) {
    return ["typescript", "jsx"];
  }
  return TS.test(file) ? ["typescript"] : ["jsx"];
};

/** Whether `value` is a node of Babel's tree: an object with a type. */
const isNode = (value: unknown): value is Node =>
  typeof value === "object" &&
  value !== null &&
  "type" in value &&
  typeof value.type === "string";

const parsed = (file: string, text: string): Node[] =>
  parse(text, {
    sourceType: "module",
    plugins: syntaxOf(file),
    tokens: false,
  }).program.body.flatMap((statement) =>
    isNode(statement) ? [statement] : []
  );

const child = (node: Node, field: string): Node | null => {
  const found = node[field];
  return isNode(found) ? found : null;
};
const children = (node: Node, field: string): Node[] => {
  const found = node[field];
  return Array.isArray(found) ? found.filter(isNode) : [];
};
/** A node's string field (a name, a literal's value); undefined where it holds none. */
const textOf = (node: Node | null | undefined, field: string) => {
  const found = node?.[field];
  return typeof found === "string" ? found : undefined;
};

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
    return textOf(key, "name") ?? null;
  }
  return key?.type === "StringLiteral" ? (textOf(key, "value") ?? null) : null;
};

/**
 * What a name stands for inside a local helper a story is built by: each
 * parameter bound to the call's argument, each local `const` to its value,
 * each in the scope it is read in. A story's own object reads in an empty one.
 */
type Env = Map<string, Bound>;

/** An expression and the names it reads in. */
interface Bound {
  env: Env;
  node: Node;
}

const NO_ENV: Env = new Map();

/** The file's top-level names a story may be built from: each `const`'s value, each function declaration. */
type Scope = Map<string, Node>;

function scopeOf(body: Node[]): Scope {
  const scope: Scope = new Map();
  for (const node of body) {
    const declaration =
      node.type === "ExportNamedDeclaration"
        ? child(node, "declaration")
        : node;
    if (declaration?.type === "VariableDeclaration") {
      for (const one of children(declaration, "declarations")) {
        const name = identifier(child(one, "id"));
        const init = child(one, "init");
        if (name && init) {
          scope.set(name, init);
        }
      }
    } else if (declaration?.type === "FunctionDeclaration") {
      const name = identifier(child(declaration, "id"));
      if (name) {
        scope.set(name, declaration);
      }
    }
  }
  return scope;
}

/** An expression followed through the helper parameters and locals it names, to what they were given. */
function deref(at: Bound): Bound {
  let now = at;
  for (let hops = 0; hops < MAX_DEPTH; hops += 1) {
    const name = identifier(now.node);
    const next = name ? now.env.get(name) : undefined;
    if (!next) {
      return now;
    }
    now = next;
  }
  return now;
}

/** How many spreads, names and calls deep the reader follows a story before it gives up. */
const MAX_DEPTH = 12;

/** Whether an expression is a literal the inspector writes: its value, else undefined. A helper's parameter reads as what its call gave it. */
function literal(
  node: Node | null,
  env: Env = NO_ENV
): { value: unknown } | undefined {
  const found = node ? deref({ node: bare(node) ?? node, env }) : null;
  const at = bare(found?.node ?? null);
  const scope = found?.env ?? env;
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
              .map((quasi) => {
                const { value } = quasi;
                return typeof value === "object" &&
                  value !== null &&
                  "cooked" in value
                  ? value.cooked
                  : "";
              })
              .join(""),
          }
        : undefined;
    case "UnaryExpression": {
      const inner = literal(child(at, "argument"), scope);
      return at.operator === "-" && typeof inner?.value === "number"
        ? { value: -inner.value }
        : undefined;
    }
    case "ArrayExpression":
      return arrayLiteral(at, scope);
    case "ObjectExpression":
      return objectLiteral(at, scope);
    case undefined:
      return;
  }
}

/** An array of literals: its values; undefined at the first element that is code. */
function arrayLiteral(at: Node, env: Env): { value: unknown[] } | undefined {
  const values: unknown[] = [];
  for (const element of children(at, "elements")) {
    const one = literal(element, env);
    if (!one) {
      return;
    }
    values.push(one.value);
  }
  return { value: values };
}

/** An object of literals under plain keys: its value; undefined at the first property that is code. */
function objectLiteral(
  at: Node,
  env: Env
): { value: Record<string, unknown> } | undefined {
  const value: Record<string, unknown> = {};
  for (const property of children(at, "properties")) {
    const key = property.type === "ObjectProperty" ? keyOf(property) : null;
    const one =
      key === null ? undefined : literal(child(property, "value"), env);
    if (key === null || !one) {
      return;
    }
    value[key] = one.value;
  }
  return { value };
}

/** A node's source text. */
const sourceOf = (text: string, node: Node): string =>
  text.slice(node.start ?? 0, node.end ?? 0);

/** One key an object built by a story ends up with: its value, the names it reads in, and the top-level spread it came through (null for the story's own property). */
interface Entry {
  env: Env;
  key: string;
  value: Node;
  via: Node | null;
}

/** An object's keys in order, its spreads, names and local helper calls followed; or why the reader can't follow them. */
type Flat = { entries: Entry[] } | { why: string };

/** What the reader can see of a story file to follow a story: its text, its top-level names and its imports. */
interface Reading {
  imports: Map<string, string>;
  scope: Scope;
  text: string;
}

/** A node's own code, as the reason lines set it: in backticks. */
const codeOf = (reading: Reading, node: Node): string =>
  `\`${sourceOf(reading.text, node)}\``;

/** Why name `name` leads nowhere this file says: it is imported, or not declared here. */
const elsewhere = (reading: Reading, name: string): string => {
  const source = reading.imports.get(name);
  return source ? reasons.imported(name, source) : reasons.undeclared(name);
};

/**
 * Expression `at` followed to the object literal it stands for, flattened to
 * its keys in order (a later one wins): a spread of a local object or a call
 * of a local function returning one is read from that literal, its
 * parameters bound to the call's arguments. `via` is the top-level spread an
 * entry came through.
 */
function flatten(
  reading: Reading,
  at: Bound,
  via: Node | null = null,
  depth = 0
): Flat {
  const { node, env } = deref(at);
  const expr = bare(node);
  if (!expr) {
    return { why: reasons.noValue };
  }
  if (depth > MAX_DEPTH) {
    return {
      why: reasons.tooDeep(codeOf(reading, expr)),
    };
  }
  switch (expr.type) {
    case "ObjectExpression":
      return flattenObject(reading, expr, env, via, depth);
    case "Identifier": {
      const name = textOf(expr, "name") ?? "";
      const declared = reading.scope.get(name);
      return declared && declared.type !== "FunctionDeclaration"
        ? flatten(reading, { node: declared, env: NO_ENV }, via, depth + 1)
        : { why: elsewhere(reading, name) };
    }
    case "MemberExpression": {
      const key = expr.computed ? null : identifier(child(expr, "property"));
      const object = child(expr, "object");
      if (!(key && object)) {
        return { why: reasons.computed(codeOf(reading, expr)) };
      }
      const flat = flatten(reading, { node: object, env }, via, depth + 1);
      if ("why" in flat) {
        return flat;
      }
      const entry = flat.entries.findLast((one) => one.key === key);
      return entry
        ? flatten(
            reading,
            { node: entry.value, env: entry.env },
            via,
            depth + 1
          )
        : { why: reasons.noSuchKey(codeOf(reading, expr)) };
    }
    case "CallExpression":
      return flattenCall(reading, expr, env, via, depth);
    default:
      return {
        why: reasons.notAnObject(codeOf(reading, expr)),
      };
  }
}

function flattenObject(
  reading: Reading,
  object: Node,
  env: Env,
  via: Node | null,
  depth: number
): Flat {
  const entries: Entry[] = [];
  for (const property of children(object, "properties")) {
    if (property.type === "SpreadElement") {
      const flat = flatten(
        reading,
        { node: child(property, "argument") ?? property, env },
        via ?? property,
        depth + 1
      );
      if ("why" in flat) {
        return flat;
      }
      entries.push(...flat.entries);
      continue;
    }
    const key = keyOf(property);
    if (key === null) {
      return {
        why: reasons.computedKey(codeOf(reading, property)),
      };
    }
    // A method (`render() {…}`) is code under its key.
    const value =
      property.type === "ObjectProperty" ? child(property, "value") : property;
    entries.push({ key, value: value ?? property, env, via });
  }
  return { entries };
}

/** A local function's call followed to the object literal it returns: its parameters bound to the call's arguments, its `const`s to their values. */
function flattenCall(
  reading: Reading,
  call: Node,
  env: Env,
  via: Node | null,
  depth: number
): Flat {
  const said = sourceOf(reading.text, call);
  const name = identifier(child(call, "callee"));
  if (!name) {
    return { why: reasons.noNamedCall(`\`${said}\``) };
  }
  const fn = bare(reading.scope.get(name) ?? null);
  if (!fn) {
    return { why: elsewhere(reading, name) };
  }
  if (!(
    fn.type === "FunctionDeclaration" ||
    fn.type === "ArrowFunctionExpression" ||
    fn.type === "FunctionExpression"
  )) {
    return { why: reasons.notAFunction(name) };
  }
  const inner = bindings(call, fn, env);
  if (typeof inner === "function") {
    return { why: inner(name) };
  }
  const body = child(fn, "body");
  if (body && body.type !== "BlockStatement") {
    return flatten(reading, { node: body, env: inner }, via, depth + 1);
  }
  const returned = returnedBy(children(body ?? { type: "" }, "body"), inner);
  return returned
    ? flatten(reading, { node: returned, env: inner }, via, depth + 1)
    : { why: reasons.doesMore(name) };
}

/** Function `fn`'s parameters bound to `call`'s arguments (read in `env`), a default read in the function's own; or why not, said of the function's name. */
function bindings(
  call: Node,
  fn: Node,
  env: Env
): Env | ((name: string) => string) {
  const inner: Env = new Map();
  const given = children(call, "arguments");
  for (const [at, param] of children(fn, "params").entries()) {
    const arg = given[at];
    if (arg?.type === "SpreadElement") {
      return reasons.spreadsArguments;
    }
    const left =
      param.type === "AssignmentPattern" ? child(param, "left") : param;
    if (left?.type !== "Identifier") {
      return reasons.patternArguments;
    }
    const fallback =
      param.type === "AssignmentPattern" ? child(param, "right") : null;
    inner.set(textOf(left, "name") ?? "", {
      node: arg ?? fallback ?? { type: "Identifier", name: "undefined" },
      env: arg || !fallback ? env : inner,
    });
  }
  return inner;
}

/** A function body's returned expression, its `const`s bound in `inner` first; null when it does anything else. */
function returnedBy(statements: Node[], inner: Env): Node | null {
  const last = statements.at(-1);
  for (const statement of statements.slice(0, -1)) {
    if (statement.type !== "VariableDeclaration") {
      return null;
    }
    for (const one of children(statement, "declarations")) {
      const local = identifier(child(one, "id"));
      const init = child(one, "init");
      if (!(local && init)) {
        return null;
      }
      inner.set(local, { node: init, env: inner });
    }
  }
  return last?.type === "ReturnStatement" ? child(last, "argument") : null;
}

/**
 * An args object's args: each literal one's value, and the source of each
 * that is code. A spread the reader follows adds its keys; one it can't
 * stays code under its own text. Args the reader can't follow at all (an
 * imported object) answer why.
 */
function argsOf(
  reading: Reading,
  at: Bound | null
):
  | { args: Record<string, unknown>; code: Record<string, string> }
  | { why: string } {
  const args: Record<string, unknown> = {};
  const code: Record<string, string> = {};
  if (!at) {
    return { args, code };
  }
  const found = deref(at);
  const object = bare(found.node);
  const entries: Entry[] = [];
  if (object?.type === "ObjectExpression") {
    for (const property of children(object, "properties")) {
      const one = flattenObject(
        reading,
        { type: "ObjectExpression", properties: [property] },
        found.env,
        null,
        0
      );
      if ("why" in one) {
        const source = sourceOf(reading.text, property);
        code[source] = source;
      } else {
        entries.push(...one.entries);
      }
    }
  } else {
    const flat = flatten(reading, found);
    if ("why" in flat) {
      return flat;
    }
    entries.push(...flat.entries);
  }
  for (const { key, value, env } of entries) {
    delete args[key];
    delete code[key];
    const one = literal(value, env);
    if (one) {
      args[key] = one.value;
    } else {
      code[key] = sourceOf(reading.text, deref({ node: value, env }).node);
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
  return at?.type === "Identifier" ? (textOf(at, "name") ?? null) : null;
};

/** One story export: its name, the statement it stands in, its value (null for a function story), its object literal when its value is one, its name's place. */
interface Export {
  init: Node | null;
  name: string;
  object: Node | null;
  place: Node;
  statement: Node;
}

/** The default export's object literal, followed through a local `const meta = {…}; export default meta`. */
function metaObject(body: Node[], scope: Scope): Node | null {
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
  const declared = bare(name ? (scope.get(name) ?? null) : null);
  return declared?.type === "ObjectExpression" ? declared : null;
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
        init,
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
      found.push({
        init: null,
        name,
        object: null,
        place: id,
        statement: node,
      });
    }
  }
  for (const specifier of children(node, "specifiers")) {
    const exported = child(specifier, "exported");
    const name = textOf(exported, "name") ?? textOf(exported, "value");
    if (
      specifier.type === "ExportSpecifier" &&
      specifier.exportKind !== "type" &&
      name &&
      exported
    ) {
      const from = local.get(identifier(child(specifier, "local")) ?? "");
      found.push({
        init: from?.init ?? null,
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
    const source = textOf(child(node, "source"), "value") ?? "";
    for (const specifier of children(node, "specifiers")) {
      const name = identifier(child(specifier, "local"));
      if (name) {
        found.set(name, source);
      }
    }
  }
  return found;
}

/** A comment's words: a JSDoc block's lines without their stars, a line comment's text; blank lines and tags (`@param`) left out. */
const commentWords = (comment: Node): string =>
  String(comment.value ?? "")
    .split("\n")
    .map((line) => line.replace(COMMENT_STAR, "").trim())
    .filter((line) => line && !line.startsWith("@"))
    .join(" ")
    .trim();
const COMMENT_STAR = /^\s*\*+\s?/u;

/**
 * A story's label: its doc comment in plain words, the comments right
 * above its statement (a `/** … *\/` block, or a run of `//` lines), the
 * last block when several stand apart. Null when it has none.
 */
function labelOf(text: string, statement: Node): string | null {
  const comments = children(statement, "leadingComments");
  // The comments that touch the statement: a blank line ends the run.
  const run: Node[] = [];
  let next = statement.start ?? 0;
  for (const comment of comments.toReversed()) {
    const between = text.slice(comment.end ?? 0, next);
    if (BLANK_BETWEEN.test(between)) {
      break;
    }
    run.unshift(comment);
    next = comment.start ?? 0;
  }
  const words = run.map(commentWords).filter(Boolean).join(" ");
  return words ? cutShort(words, LABEL_LIMIT) : null;
}
const BLANK_BETWEEN = /\n[ \t]*\n/u;
/** A label's longest. Ours: a frame's caption, one line. */
const LABEL_LIMIT = 160;

/** The shapes of a word of code in a label: a backticked span, `snake_case`, `camelCase`, `key=value`, a call `name()`. */
const CODE_WORDS = [
  /`[^`]*[A-Za-z_][^`]*`/u,
  /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/u,
  /\b[a-z]{2,}(?:[A-Z][a-z0-9]+)+\b/u,
  /\b\w+=[^\s=]/u,
  /\b\w+\(\)/u,
];
/** An export name of two capitalised words or more (`NothingYet`), which a label saying it says in code. */
const HUMPED = /^[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)+$/u;
const NOT_A_NAME = /[^\w$]+/u;

/**
 * The first word of code label `label` holds (core `RenderReport`
 * `codeNamed`): one of {@link CODE_WORDS}, or one of `names` (the file's
 * story exports and the components it imports) of two words or more, said
 * whole; null when it holds none. A brand's own capitals (`iPhone`,
 * `macOS`, `GitHub`) are none of these.
 */
export function codeWordOf(
  label: string,
  names: readonly string[]
): string | null {
  for (const shape of CODE_WORDS) {
    const found = label.match(shape)?.[0];
    if (found) {
      return found;
    }
  }
  const words = new Set(label.split(NOT_A_NAME));
  return names.find((name) => HUMPED.test(name) && words.has(name)) ?? null;
}

/** A form as read, or why the reader can't read it. */
type FormRead = { form: Form | null } | { why: string };

/**
 * A story's form from its `parameters.viewport`: a width (`390`), a
 * preset's name (`"phone"`, `"tablet"`, `"desk"`), `{ width }`, or
 * Storybook's `{ defaultViewport }` with its own preset names. `parameters`
 * is followed as a story is (a local const, a spread, a local helper's
 * return), and the viewport through the file's own consts. Null when it
 * names none; why, when what it names is not in this file (an imported
 * const) or is computed: the frame says so, never a width it guessed.
 */
function formOf(reading: Reading, parameters: Bound | null): FormRead {
  if (!parameters) {
    return { form: null };
  }
  const viewport = ownViewport(parameters) ?? lastViewport(reading, parameters);
  if (viewport && "why" in viewport) {
    return viewport;
  }
  if (!viewport) {
    return { form: null };
  }
  const read = constOf(reading, { node: viewport.value, env: viewport.env });
  if ("why" in read) {
    return read;
  }
  const { value } = read;
  const width = (n: unknown): Form | null =>
    typeof n === "number" && n > 0 ? presetOf(n) : null;
  if (typeof value === "number") {
    return { form: width(value) };
  }
  if (typeof value === "string") {
    return { form: namedForm(value) };
  }
  if (value && typeof value === "object") {
    const wide = "width" in value ? value.width : undefined;
    if (typeof wide === "number") {
      return { form: width(wide) };
    }
    const preset =
      "defaultViewport" in value ? value.defaultViewport : undefined;
    if (typeof preset === "string") {
      return { form: namedForm(preset) };
    }
  }
  return { form: null };
}

/** The `viewport` an object literal writes itself after every spread in it: read whatever the spreads hold. */
function ownViewport(parameters: Bound): Entry | null {
  const { node, env } = deref(parameters);
  const object = bare(node);
  if (object?.type !== "ObjectExpression") {
    return null;
  }
  const properties = children(object, "properties");
  const at = properties.findLastIndex(
    (one) => one.type === "ObjectProperty" && keyOf(one) === "viewport"
  );
  const written = properties[at];
  const value = written ? child(written, "value") : null;
  return value &&
    !properties.slice(at + 1).some((one) => one.type === "SpreadElement")
    ? { key: "viewport", value, env, via: null }
    : null;
}

/** The `viewport` an object ends up with, its spreads, names and local helpers followed; null when it has none, or why the reader can't follow it. */
function lastViewport(
  reading: Reading,
  parameters: Bound
): Entry | { why: string } | null {
  const flat = flatten(reading, parameters);
  if ("why" in flat) {
    return flat;
  }
  return flat.entries.findLast((one) => one.key === "viewport") ?? null;
}

/** An expression's literal value, followed through the helper parameters and the file's top-level consts it names; or why it has none here. */
function constOf(
  reading: Reading,
  at: Bound,
  depth = 0
): { value: unknown } | { why: string } {
  const found = deref(at);
  const name = identifier(found.node);
  if (name) {
    const declared = reading.scope.get(name);
    if (!declared || declared.type === "FunctionDeclaration") {
      return { why: elsewhere(reading, name) };
    }
    return depth > MAX_DEPTH
      ? { why: reasons.tooDeep(name) }
      : constOf(reading, { node: declared, env: NO_ENV }, depth + 1);
  }
  return (
    literal(found.node, found.env) ?? {
      why: reasons.notAValue(codeOf(reading, found.node)),
    }
  );
}

/** Storybook's own viewport preset names (`MINIMAL_VIEWPORTS`), as the canvas's forms. */
const STORYBOOK_VIEWPORTS: Record<string, FormName> = {
  mobile1: "phone",
  mobile2: "phone",
  tablet: "tablet",
  desktop: "desk",
};

const namedForm = (name: string): Form | null => {
  const preset = formNameOf(name) ?? STORYBOOK_VIEWPORTS[name];
  return preset ? { name: preset, width: FORMS[preset] } : null;
};

/** A width as its preset when it is one, else its own. */
const presetOf = (width: number): Form => ({
  name: formNamed(width) ?? "custom",
  width,
});

/**
 * What `node` imports when it is an `import(…)`, as the file writes it: a
 * string literal's value, or the source of any other argument (a template,
 * a call), which names its module only as it runs. Babel 7 writes the
 * import as a call of `Import`, with `createImportExpressions` as an
 * `ImportExpression`.
 */
function importedBy(node: Node, text: string): string | undefined {
  let source: Node | null = null;
  if (node.type === "ImportExpression") {
    source = child(node, "source");
  } else if (
    node.type === "CallExpression" &&
    child(node, "callee")?.type === "Import"
  ) {
    source = children(node, "arguments")[0] ?? null;
  }
  if (!source) {
    return undefined;
  }
  return source.type === "StringLiteral"
    ? textOf(source, "value")
    : sourceOf(text, source);
}

/** The fields of a node of Babel's tree that hold no syntax under it. */
const NOT_SYNTAX = new Set(["loc", "leadingComments", "trailingComments"]);

/** A node's children in Babel's tree, every field's. */
const nodesUnder = (node: Node): Node[] =>
  Object.entries(node).flatMap(([field, value]) => {
    if (NOT_SYNTAX.has(field)) {
      return [];
    }
    if (Array.isArray(value)) {
      return value.filter(isNode);
    }
    return isNode(value) ? [value] : [];
  });

/** Every `import(…)` anywhere under `node`, as it is written ({@link importedBy}): a `beforeEach`'s stand-ins. */
function dynamicImportsIn(
  node: Node | null | undefined,
  text: string
): string[] {
  const found: string[] = [];
  const queue = node ? [node] : [];
  for (let at = queue.pop(); at; at = queue.pop()) {
    const source = importedBy(at, text);
    if (source) {
      found.push(source);
    }
    queue.push(...nodesUnder(at));
  }
  return found;
}

/** An object literal's `beforeEach`, as a property (`beforeEach: () => …`) or a method (`beforeEach() { … }`). */
const beforeEachOf = (object: Node | null): Node | undefined =>
  children(object ?? { type: "" }, "properties").find(
    (property) =>
      (property.type === "ObjectProperty" ||
        property.type === "ObjectMethod") &&
      keyOf(property) === "beforeEach"
  );

/** `Story.play = …` and `Story.from = …` assignments at the top of the file, by story. */
function assignedOf(body: Node[]): Map<string, Map<string, Node>> {
  const found = new Map<string, Map<string, Node>>();
  for (const node of body) {
    const expression =
      node.type === "ExpressionStatement" ? child(node, "expression") : null;
    const target =
      expression?.type === "AssignmentExpression"
        ? child(expression, "left")
        : null;
    if (target?.type !== "MemberExpression" || target.computed) {
      continue;
    }
    const story = identifier(child(target, "object"));
    const field = identifier(child(target, "property"));
    const right = expression ? child(expression, "right") : null;
    if (story && field && right) {
      const fields = found.get(story) ?? new Map<string, Node>();
      fields.set(field, right);
      found.set(story, fields);
    }
  }
  return found;
}

/**
 * What story file `file` (absolute) says: each story by its export's name
 * and 1-based place, with its args, its label (its doc comment), its form,
 * and its flow move (`from` and `play`); the meta's args, component and
 * title. The default export is the meta, a type is no story, and
 * Storybook's `__namedExportsOrder` is no story either.
 */
export function readStoryFile(file: string, text: string): StaticSheet {
  const body = parsed(file, text);
  const scope = scopeOf(body);
  const reading: Reading = { imports: importsOf(body), scope, text };
  const exports = exportsOf(body);
  const named = namedOf(reading, exports);
  const meta = metaObject(body, scope);
  const metaArgs = child(propertyOf(meta, "args") ?? { type: "" }, "value");
  const metaRead = argsOf(
    reading,
    metaArgs ? { node: metaArgs, env: NO_ENV } : null
  );
  const assigned = assignedOf(body);
  const metaParametersNode = child(
    propertyOf(meta, "parameters") ?? { type: "" },
    "value"
  );
  const metaParameters = metaParametersNode
    ? { node: metaParametersNode, env: NO_ENV }
    : null;
  const title = literal(
    child(propertyOf(meta, "title") ?? { type: "" }, "value")
  )?.value;
  /** A story's canvas fields: its label (doc comment), form, flow move, the name it is shown by, its record sets' list and its tags. */
  const canvasOf = (
    one: Export
  ): Pick<
    Story,
    | "display"
    | "form"
    | "formUnread"
    | "from"
    | "label"
    | "play"
    | "records"
    | "tags"
  > => {
    const later = assigned.get(one.name);
    const from = literal(
      later?.get("from") ??
        child(propertyOf(one.object, "from") ?? { type: "" }, "value")
    )?.value;
    const own = formOf(reading, parametersOf(reading, one));
    const read =
      "why" in own || own.form ? own : formOf(reading, metaParameters);
    return {
      label: labelOf(text, one.statement),
      form: "why" in read ? null : read.form,
      formUnread:
        "why" in read
          ? `${one.name}'s viewport can't be read here: ${read.why}. Write it in the states file, as \`parameters: { viewport: 390 }\`.`
          : null,
      from: typeof from === "string" ? from : null,
      play: Boolean(propertyOf(one.object, "play") || later?.has("play")),
      ...shownBy(reading, one),
    };
  };
  const apart = new Map<string, string[]>();
  for (const one of exports) {
    const key = drawnApartFromWidth(reading, one, assigned.get(one.name));
    if (key !== null) {
      apart.set(key, [...(apart.get(key) ?? []), one.name]);
    }
  }
  const metaStandIns = dynamicImportsIn(beforeEachOf(meta), text);
  const standIns = new Map(
    exports.flatMap((one): [string, string[]][] => {
      const own = dynamicImportsIn(
        assigned.get(one.name)?.get("beforeEach") ?? beforeEachOf(one.object),
        text
      );
      const all = [...new Set([...metaStandIns, ...own])];
      return all.length > 0 ? [[one.name, all]] : [];
    })
  );
  return {
    widthOnly: [...apart.values()].filter((names) => names.length > 1),
    imports: reading.imports,
    standIns,
    meta: {
      ...("why" in metaRead
        ? {
            args: {},
            code: metaArgs
              ? { [sourceOf(text, metaArgs)]: sourceOf(text, metaArgs) }
              : {},
          }
        : metaRead),
      component: identifier(
        child(propertyOf(meta, "component") ?? { type: "" }, "value")
      ),
      title: typeof title === "string" ? title : null,
    },
    stories: exports.map((one): Story => ({
      name: one.name,
      line: one.place.loc?.start.line ?? 1,
      column: (one.place.loc?.start.column ?? 0) + 1,
      ...storyRead(reading, one, named),
      ...canvasOf(one),
    })),
  };
}

/** A value as JSON with its keys in order, so two equal values write one string. */
const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, one: unknown) =>
    one && typeof one === "object" && !Array.isArray(one)
      ? Object.fromEntries(
          Object.entries(one).toSorted(([a], [b]) => a.localeCompare(b))
        )
      : one
  );

/**
 * An object's keys (the last of each), in name order, each as `key:value`
 * by `read`: undefined leaves the key out, null makes the whole null.
 */
function keyedOf(
  entries: readonly Entry[],
  read: (key: string, one: Entry) => string | null | undefined
): string[] | null {
  const keys = new Map(entries.map((one) => [one.key, one] as const));
  const said: string[] = [];
  for (const [key, one] of [...keys].toSorted(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const value = read(key, one);
    if (value === null) {
      return null;
    }
    if (value !== undefined) {
      said.push(`${key}:${value}`);
    }
  }
  return said;
}

/**
 * What a value draws, as one string two equal values share: an object's
 * keys (spreads and local helpers followed, `drop` left out) each so, a
 * literal its value, any other code its source where it reads none of a
 * helper's names. Null when it reads one, or can't be followed: such a
 * value is never said to equal another.
 */
function drawnOf(
  reading: Reading,
  at: Bound,
  drop: ReadonlySet<string> = new Set(),
  depth = 0
): string | null {
  const found = deref(at);
  const expr = bare(found.node);
  if (!expr || depth > MAX_DEPTH) {
    return null;
  }
  const flat =
    expr.type === "ObjectExpression" ||
    expr.type === "Identifier" ||
    expr.type === "CallExpression" ||
    expr.type === "MemberExpression"
      ? flatten(reading, found)
      : null;
  if (flat && !("why" in flat)) {
    const said = keyedOf(flat.entries, (key, one) =>
      drop.has(key)
        ? undefined
        : drawnOf(
            reading,
            { node: one.value, env: one.env },
            new Set(),
            depth + 1
          )
    );
    return said === null ? null : `{${said.join(",")}}`;
  }
  const value = literal(expr, found.env);
  if (value) {
    return `=${stable(value.value)}`;
  }
  return found.env.size === 0 ? `\`${sourceOf(reading.text, expr)}` : null;
}

/**
 * What story `story` draws apart from its width: every key its object
 * builds but its CSF `name` (the name it is shown by), its `parameters`
 * without `viewport`, and its `Story.x = …` assignments (`later`). Null for
 * a function story, or one the reader can't follow whole.
 */
function drawnApartFromWidth(
  reading: Reading,
  story: Export,
  later: Map<string, Node> | undefined
): string | null {
  if (
    !story.init ||
    story.init.type === "ArrowFunctionExpression" ||
    story.init.type === "FunctionExpression"
  ) {
    return null;
  }
  const flat = flatten(reading, { node: story.init, env: NO_ENV });
  if ("why" in flat) {
    return null;
  }
  const said = keyedOf(flat.entries, (key, one) =>
    key === "name"
      ? undefined
      : drawnOf(
          reading,
          { node: one.value, env: one.env },
          key === "parameters" ? new Set(["viewport"]) : new Set()
        )
  );
  if (said === null) {
    return null;
  }
  for (const [key, node] of [...(later ?? [])].toSorted(([a], [b]) =>
    a.localeCompare(b)
  )) {
    said.push(`later ${key}:${sourceOf(reading.text, node)}`);
  }
  return said.join(";");
}

/**
 * The value `key` ends up with in the object `at` builds (its spreads,
 * names and local helpers followed), as a literal the file writes;
 * undefined when it writes none, or the reader can't follow it.
 */
function valueAt(reading: Reading, at: Bound | null, key: string): unknown {
  if (!at) {
    return;
  }
  const flat = flatten(reading, at);
  const entry =
    "why" in flat ? undefined : flat.entries.findLast((one) => one.key === key);
  if (!entry) {
    return;
  }
  const read = constOf(reading, { node: entry.value, env: entry.env });
  return "why" in read ? undefined : read.value;
}

/** Each story of `exports` by what names it: its export, and its CSF `name` (core `NamedStory`). */
const namedOf = (reading: Reading, exports: Export[]): NamedStory[] =>
  exports.map((one) => ({
    name: one.name,
    display: shownBy(reading, one).display,
  }));

/**
 * What the design graph reads of a story besides its frame: the name it is
 * shown by (CSF `name`), the list arg its record sets are cut from
 * (`parameters.records`) and its CSF `tags`.
 */
function shownBy(
  reading: Reading,
  story: Export
): Pick<Story, "display" | "records" | "tags"> {
  const own = story.init ? { node: story.init, env: NO_ENV } : null;
  const display = valueAt(reading, own, "name");
  const records = valueAt(reading, parametersOf(reading, story), "records");
  const tags = valueAt(reading, own, "tags");
  return {
    display: typeof display === "string" ? display : null,
    records: typeof records === "string" ? records : null,
    tags: Array.isArray(tags)
      ? tags.filter((one): one is string => typeof one === "string")
      : [],
  };
}

/** A story's `parameters` as its object builds them (its own key, or one a spread or helper gives it); null when it has none. */
function parametersOf(reading: Reading, story: Export): Bound | null {
  if (!story.init) {
    return null;
  }
  const flat = flatten(reading, { node: story.init, env: NO_ENV });
  if (!("why" in flat)) {
    const entry = flat.entries.findLast((one) => one.key === "parameters");
    return entry ? { node: entry.value, env: entry.env } : null;
  }
  // Built of what the reader can't follow: its own key, where it writes one.
  const own = child(
    propertyOf(story.object, "parameters") ?? { type: "" },
    "value"
  );
  return own ? { node: own, env: NO_ENV } : null;
}

/** A story whose component and args the reader can't follow: it mounts all the same, and the inspector shows it read-only with `reason`. */
const unread = (
  name: string,
  reason: string
): Pick<Story, "args" | "code" | "component" | "readOnly"> => ({
  args: {},
  code: {},
  component: null,
  readOnly: {
    read: false,
    reason: reasons.unread(name, reason),
  },
});

/**
 * Story `story`'s component and args as its file builds them: its own
 * object literal, its spreads of local objects and its calls of local
 * functions followed to the literals they return. `readOnly` says why the
 * inspector can't write its args: they come from shared code (a spread,
 * a helper, another story), or the reader couldn't follow them at all.
 */
function storyRead(
  reading: Reading,
  story: Export,
  named: readonly NamedStory[]
): Pick<Story, "args" | "code" | "component" | "readOnly"> {
  const { init } = story;
  // The story as the inspector and the states list name it, so one state has one name on the panel.
  const name = shownName(
    named.find((one) => one.name === story.name) ?? {
      name: story.name,
      display: null,
    },
    named
  );
  if (
    !init ||
    init.type === "ArrowFunctionExpression" ||
    init.type === "FunctionExpression"
  ) {
    return unread(name, reasons.aFunction);
  }
  const flat = flatten(reading, { node: init, env: NO_ENV });
  if ("why" in flat) {
    return unread(name, flat.why);
  }
  const argsEntry = flat.entries.findLast((one) => one.key === "args");
  const componentEntry = flat.entries.findLast(
    (one) => one.key === "component"
  );
  const read = argsOf(
    reading,
    argsEntry ? { node: argsEntry.value, env: argsEntry.env } : null
  );
  if ("why" in read) {
    return unread(name, read.why);
  }
  const component = componentEntry
    ? identifier(
        deref({ node: componentEntry.value, env: componentEntry.env }).node
      )
    : null;
  return {
    ...read,
    component,
    readOnly: writeBlock(reading, story, argsEntry, name),
  };
}

/** Why the inspector can't write readable story `story`'s args, whose last `args` key is `argsEntry`, said of it as `name`; null when it can. */
function writeBlock(
  reading: Reading,
  story: Export,
  argsEntry: Entry | undefined,
  name: string
): Story["readOnly"] {
  const { init, object } = story;
  if (!object) {
    return {
      read: true,
      reason: reasons.builtBy(name, codeOf(reading, init ?? story.place)),
    };
  }
  if (argsEntry?.via) {
    return {
      read: true,
      reason: reasons.propsFrom(name, codeOf(reading, argsEntry.via)),
    };
  }
  const value = bare(argsEntry?.value ?? null);
  if (value && value.type !== "ObjectExpression") {
    return {
      read: true,
      reason: reasons.propsAre(name, codeOf(reading, value)),
    };
  }
  return null;
}

/* --- Writing ---------------------------------------------------------- */

/** How the file writes: its strings' quote, its indent step, and whether a multi-line literal ends on a comma. */
interface Style {
  indent: string;
  quote: '"' | "'";
  trailing: boolean;
}

const LEADING = /^([ \t]+)\S/mu;
const DOUBLE = /"(?:[^"\\\n]|\\.)*"/gu;
const SINGLE = /'(?:[^'\\\n]|\\.)*'/gu;
const TRAILING_COMMA = /,\s*[}\]]/u;

function styleOf(text: string): Style {
  const doubles = text.match(DOUBLE)?.length ?? 0;
  const singles = text.match(SINGLE)?.length ?? 0;
  return {
    quote: singles > doubles ? "'" : '"',
    indent: text.match(LEADING)?.[1] ?? "  ",
    trailing: TRAILING_COMMA.test(text),
  };
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/u;

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
    const entries = Object.entries(value);
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
const INDENT = /^[ \t]*/u;

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
const COMMA_AFTER = /^[ \t]*,?/u;

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
    throw new StoryRefusal(reasons.notWritable(name, file));
  }
  return { ...story, object: story.object };
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
  const body = parsed(file, text);
  const exports = exportsOf(body);
  const named = storyNamed(file, exports, story);
  const reading = { imports: importsOf(body), scope: scopeOf(body), text };
  const { readOnly } = storyRead(reading, named, namedOf(reading, exports));
  if (readOnly) {
    throw new StoryRefusal(readOnly.reason);
  }
  const { object } = named;
  const argsProperty = propertyOf(object, "args");
  const args = bare(argsProperty ? child(argsProperty, "value") : null);
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
  const comments = children(statement, "leadingComments");
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

/**
 * Where story `name`'s statement stands in `text`, from its first character
 * to its last: what the stage formats in the project's style after a write
 * printed values into it (host.ts `inProjectStyle`).
 */
export function storyStatement(
  file: string,
  text: string,
  name: string
): { from: number; to: number } {
  const story = exportsOf(parsed(file, text)).find((one) => one.name === name);
  if (!story) {
    throw new StoryRefusal(`${file} has no story ${name}.`);
  }
  return { from: story.statement.start ?? 0, to: story.statement.end ?? 0 };
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
const BLANK = /^[ \t]*\n/u;

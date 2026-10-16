/**
 * Knowing a component's props (live components spec §6), from its source
 * inside the stage, with the tool each framework's Storybook uses, in
 * Storybook's argTypes shape (core `PropMeta`):
 *
 * - Svelte 5: svelte2tsx turns the component into TypeScript and the
 *   project's own TypeScript checker reads its `$props()` type off the
 *   render function, imported types and all, and the destructured defaults
 *   (Storybook svelte-vite's `generateDocgen.ts`, the method ported here);
 * - Vue 3: vue-component-meta, the Vue team's, over the project's tsconfig;
 * - React, Preact, Solid: react-docgen, and react-docgen-typescript for a
 *   file whose prop types react-docgen can't follow.
 *
 * These are CawCo's, bundled into the host; `typescript`, `svelte` and
 * `vue` are the project's own (their peers), required from the toolchain root
 * as the host runs there, and only when a file of theirs is read: a
 * project without TypeScript reads React props from their source alone
 * and says so, and Svelte's and Vue's not at all, saying why.
 *
 * Each file's props are kept by its content's hash: a read of a file that
 * has not changed costs a hash; an HMR update of it reads it again.
 */
// biome-ignore-all lint/suspicious/noBitwiseOperators: TypeScript's checker says what a type and a symbol are in bit flags (`ts.TypeFlags`, `ts.SymbolFlags`), read with `&`.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, sep } from "node:path";
import {
  type ComponentDoc,
  type PropKind,
  type PropMeta,
  TOKEN_TYPES,
  type TokenKind,
  type TokenType,
} from "@cawco/core/stage";
import type TS from "typescript";

/** svelte2tsx's shims for the code it writes, read beside it at build time (build.ts). */
declare const __SVELTE_SHIMS__: string;

type Ts = typeof TS;

const root = process.cwd();
/** The project's own packages, from the toolchain root up, as Node resolves them. */
const project = createRequire(join(root, "package.json"));

/** A peer of the docgen tools, the project's; null when it has none. */
const peer = <T>(name: string): T | null => {
  try {
    return project(name) as T;
  } catch {
    return null;
  }
};

/** TypeScript, the project's: the checker every typed read runs on. */
const typescript = (): Ts | null => peer<Ts>("typescript");

const NO_TS =
  "Types unknown: add TypeScript to the project (or type the props with JSDoc and add TypeScript), and its checker reads them.";

/**
 * The token kind a declared type is: one of the design system's generated
 * aliases ({@link TOKEN_TYPES}, `TokenColor`), alone or optional, as each
 * framework's reader prints the type. A qualified name (`import("…").TokenColor`)
 * is the same alias. Any other type is none.
 */
function tokenKindOf(text: string): TokenKind | undefined {
  const members = text
    .split("|")
    .map((one) => one.trim())
    .filter((one) => one !== "undefined" && one !== "null");
  const name = members.length === 1 ? members[0]?.replace(QUALIFIED, "") : "";
  return name && Object.hasOwn(TOKEN_TYPES, name)
    ? TOKEN_TYPES[name as TokenType]
    : undefined;
}
const QUALIFIED = /^(?:import\(["'][^"']*["']\)|[A-Za-z_$][\w$]*)\./;

/** A prop typed with a token alias, its names its options; an enum otherwise. */
const enumOf = (
  declared: string,
  raw: string,
  options: (string | number)[]
): { kind: PropKind; options: (string | number)[]; raw: string } => {
  const token = tokenKindOf(declared);
  return token
    ? {
        kind: token,
        raw: declared
          .split("|")
          .map((one) => one.trim())
          .filter((one) => one !== "undefined" && one !== "null")
          .join(" | "),
        options,
      }
    : { kind: "enum", raw, options };
};

/** One prop. */
const prop = (
  name: string,
  kind: PropKind,
  raw: string,
  rest: {
    defaultValue?: string | null;
    description?: string | null;
    options?: (string | number)[];
    required: boolean;
  }
): PropMeta => ({
  name,
  type: { name: kind, raw },
  required: rest.required,
  defaultValue: rest.defaultValue ?? null,
  description: rest.description?.trim() || null,
  ...(rest.options ? { options: rest.options } : {}),
});

/** A literal union's members, as values; null when any member is no string or number literal. */
const literals = (members: string[]): (string | number)[] | null => {
  const values: (string | number)[] = [];
  for (const member of members) {
    const text = member.trim();
    if (QUOTED.test(text)) {
      values.push(text.slice(1, -1));
    } else if (NUMBER.test(text)) {
      values.push(Number(text));
    } else {
      return null;
    }
  }
  return values.length > 0 ? values : null;
};
const QUOTED = /^(["'`]).*\1$/s;
const NUMBER = /^-?\d+(?:\.\d+)?$/;
/** Types a framework's content goes by: a slot, never an arg. */
const SLOT_TYPE = /^(?:Snippet|ReactNode|ReactElement|JSX\.Element|VNode)\b/;

/* --- Svelte: svelte2tsx and TypeScript's checker --------------------- */

interface SvelteCache {
  files: Map<string, { at: number; source: TS.SourceFile }>;
  options?: TS.CompilerOptions;
  program?: TS.Program;
}
const svelteCache: SvelteCache = { files: new Map() };
/** svelte2tsx's shims, as a file the program reads beside the host. */
const SHIMS = join(root, ".cawco", "stage", "svelte-shims-v4.d.ts");

/** A `.svelte` file as TypeScript, through svelte2tsx: named `<file>.tsx`, as Storybook names it. */
const SVELTE_TSX = /\.svelte\.[jt]sx$/;
const TS_SCRIPT = /<script\s[^>]*?lang=(["'])(ts|typescript)\1/;

/** The project's compiler options for `file`, its tsconfig's, with docgen's own forced over them (Storybook's). */
function svelteOptions(ts: Ts, file: string): TS.CompilerOptions {
  const forced: TS.CompilerOptions = {
    sourceMap: false,
    noEmit: true,
    strict: true,
    allowJs: true,
    checkJs: true,
    skipLibCheck: true,
    skipDefaultLibCheck: true,
  };
  const config =
    ts.findConfigFile(dirname(file), ts.sys.fileExists) ??
    ts.findConfigFile(dirname(file), ts.sys.fileExists, "jsconfig.json");
  if (!config) {
    return forced;
  }
  const read = ts.readConfigFile(config, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    dirname(config),
    undefined,
    config
  );
  return { ...parsed.options, ...forced };
}

/** The compiler host: a `.svelte.tsx` is its `.svelte` through svelte2tsx; every source kept by its file's time. */
function svelteHost(
  ts: Ts,
  options: TS.CompilerOptions,
  toTsx: (text: string, isTs: boolean) => string
): TS.CompilerHost {
  const base = ts.createCompilerHost(options);
  const kept = (
    name: string,
    real: string,
    make: () => TS.SourceFile | undefined
  ) => {
    const at = ts.sys.getModifiedTime?.(real)?.getTime() ?? 0;
    const hit = svelteCache.files.get(name);
    if (hit && (hit.at === at || name.includes(`${sep}node_modules${sep}`))) {
      return hit.source;
    }
    const source = make();
    if (source) {
      svelteCache.files.set(name, { at, source });
    }
    return source;
  };
  return {
    ...base,
    fileExists: (name) =>
      name === SHIMS ||
      base.fileExists(name) ||
      (SVELTE_TSX.test(name) && base.fileExists(name.slice(0, -4))),
    readFile: (name) =>
      name === SHIMS ? __SVELTE_SHIMS__ : base.readFile(name),
    getSourceFile: (name, version) => {
      if (name === SHIMS) {
        return kept(name, name, () =>
          ts.createSourceFile(name, __SVELTE_SHIMS__, version, true)
        );
      }
      if (SVELTE_TSX.test(name)) {
        const real = name.slice(0, -4);
        return kept(name, real, () => {
          const text = base.readFile(real);
          if (text === undefined) {
            return;
          }
          const isTs = TS_SCRIPT.test(text);
          // JS for a JS component, so the checker reads its JSDoc types.
          return ts.createSourceFile(
            name,
            toTsx(text, isTs),
            version,
            true,
            isTs ? ts.ScriptKind.TS : ts.ScriptKind.JS
          );
        });
      }
      return kept(name, name, () => {
        const text = base.readFile(name);
        return text === undefined
          ? undefined
          : ts.createSourceFile(name, text, version, true);
      });
    },
    writeFile: () => undefined,
  };
}

/** A checked type as one of the kinds, its raw text, and an enum's values. */
function svelteKind(
  ts: Ts,
  checker: TS.TypeChecker,
  type: TS.Type
): { kind: PropKind; options?: (string | number)[]; raw: string } {
  const members = (type.isUnion() ? type.types : [type]).filter(
    (one) => !(one.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void))
  );
  const raw = members.map((one) => checker.typeToString(one)).join(" | ");
  const named = type.aliasSymbol?.getName() ?? checker.typeToString(type);
  if (
    SLOT_TYPE.test(named) ||
    members.some((one) => SLOT_TYPE.test(checker.typeToString(one)))
  ) {
    return { kind: "slot", raw };
  }
  const flags = members.reduce((all, one) => all | one.flags, 0);
  if (members.every((one) => one.flags & ts.TypeFlags.BooleanLike)) {
    return { kind: "boolean", raw: "boolean" };
  }
  if (members.every((one) => one.isStringLiteral() || one.isNumberLiteral())) {
    // The type as declared (`TokenColor | undefined`): TypeScript keeps an
    // alias's name in a union it is part of.
    return enumOf(
      checker.typeToString(type),
      raw,
      members.map((one) => (one as TS.LiteralType).value as string | number)
    );
  }
  if (members.some((one) => one.getCallSignatures().length > 0)) {
    return { kind: "function", raw };
  }
  const scalar = ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike;
  if (members.every((one) => one.flags & scalar)) {
    return { kind: flags & ts.TypeFlags.StringLike ? "string" : "number", raw };
  }
  if (
    members.length === 1 &&
    members[0]?.flags &&
    members[0].flags & ts.TypeFlags.Object
  ) {
    const array = checker.getIndexTypeOfType(members[0], ts.IndexKind.Number);
    return { kind: array ? "array" : "object", raw };
  }
  return { kind: "other", raw };
}

/** Where a prop's declaration stands: a Svelte element's attributes are no prop of the component's (Storybook's rule). */
const fromSvelteElements = (symbol: TS.Symbol): boolean => {
  const declaration =
    symbol.valueDeclaration ??
    (symbol as { links?: { syntheticOrigin?: TS.Symbol } }).links
      ?.syntheticOrigin?.valueDeclaration;
  return (
    declaration
      ?.getSourceFile()
      .fileName.split(sep)
      .join("/")
      .includes("node_modules/svelte/elements.d.ts") ?? false
  );
};

/** The destructured defaults of `let { a = 1 }: Props = $props()` in svelte2tsx's render function, as their source. */
function svelteDefaults(
  ts: Ts,
  render: TS.FunctionDeclaration
): Map<string, string> {
  const found = new Map<string, string>();
  render.body?.forEachChild((node) => {
    if (!ts.isVariableStatement(node)) {
      return;
    }
    for (const declaration of node.declarationList.declarations) {
      const call = declaration.initializer;
      const fromProps =
        call &&
        ts.isCallExpression(call) &&
        ts.isIdentifier(call.expression) &&
        call.expression.text === "$props";
      if (fromProps && ts.isObjectBindingPattern(declaration.name)) {
        for (const element of declaration.name.elements) {
          if (element.initializer) {
            found.set(
              (element.propertyName ?? element.name).getText(),
              element.initializer.getText()
            );
          }
        }
      }
    }
  });
  return found;
}

async function svelteDoc(
  file: string
): Promise<Omit<ComponentDoc, "file" | "name">> {
  const ts = typescript();
  if (!ts) {
    return { props: [], types: "unknown", note: NO_TS };
  }
  const { svelte2tsx, internalHelpers } =
    (await import("svelte2tsx/index.js")) as typeof import("svelte2tsx");
  const target = `${file}.tsx`;
  svelteCache.options ??= svelteOptions(ts, file);
  const program = ts.createProgram({
    rootNames: [SHIMS, target],
    options: svelteCache.options,
    host: svelteHost(
      ts,
      svelteCache.options,
      (text, isTsFile) => svelte2tsx(text, { isTsFile, mode: "dts" }).code
    ),
    oldProgram: svelteCache.program,
  });
  svelteCache.program = program;
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(target);
  const render = source?.statements.find(
    (statement): statement is TS.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === internalHelpers.renderName
  );
  const signature = render && checker.getSignatureFromDeclaration(render);
  const declaration = signature?.getDeclaration();
  const returned = signature && checker.getReturnTypeOfSignature(signature);
  const propsSymbol = returned?.getProperty("props");
  if (!(render && declaration && propsSymbol)) {
    return { props: [], types: "checked" };
  }
  const defaults = svelteDefaults(ts, render);
  const propsType = checker.getTypeOfSymbolAtLocation(propsSymbol, declaration);
  const props = propsType
    .getProperties()
    .filter((symbol) => !fromSvelteElements(symbol))
    .map((symbol) => {
      const name = symbol.getName();
      const { kind, raw, options } = svelteKind(
        ts,
        checker,
        checker.getTypeOfSymbolAtLocation(symbol, declaration)
      );
      return prop(name, kind, raw, {
        required: (symbol.flags & ts.SymbolFlags.Optional) === 0,
        defaultValue: defaults.get(name) ?? null,
        description: ts.displayPartsToString(
          symbol.getDocumentationComment(checker)
        ),
        ...(options ? { options } : {}),
      });
    });
  return { props, types: "checked" };
}

/* --- Vue: vue-component-meta --------------------------------------- */

type Checker = ReturnType<typeof import("vue-component-meta").createChecker>;
const vueCheckers = new Map<string, Checker>();

/** An enum schema's literal members (vue-component-meta's `PropertyMetaSchema`), `undefined` left out; null when it is no enum of literals. */
function vueEnum(schema: unknown): (string | number)[] | null {
  const read = schema as { kind?: string; schema?: unknown[] } | undefined;
  if (!(read && read.kind === "enum" && Array.isArray(read.schema))) {
    return null;
  }
  return literals(
    read.schema
      .map((one) =>
        typeof one === "string"
          ? one
          : String((one as { value?: unknown }).value ?? "\0")
      )
      .filter((one) => one !== "undefined" && one !== "null")
  );
}

/** A Vue prop's schema as one of the kinds: its enum's string and number members, never `undefined`. */
function vueKind(
  type: string,
  schema: unknown
): { kind: PropKind; options?: (string | number)[]; raw: string } {
  const members = type
    .split("|")
    .map((one) => one.trim())
    .filter((one) => one !== "undefined");
  const raw = members.join(" | ");
  if (SLOT_TYPE.test(raw)) {
    return { kind: "slot", raw };
  }
  if (
    members.every(
      (one) => one === "boolean" || one === "true" || one === "false"
    )
  ) {
    return { kind: "boolean", raw: "boolean" };
  }
  const options = literals(members);
  if (options) {
    return { kind: "enum", raw, options };
  }
  const kind = (schema as { kind?: string } | string | undefined) ?? "";
  // An alias prints as its name; its members are the schema's.
  const named = vueEnum(schema);
  if (named && tokenKindOf(raw)) {
    return enumOf(raw, raw, named);
  }
  if (members.every((one) => one === "string" || one === "number")) {
    return { kind: members.includes("string") ? "string" : "number", raw };
  }
  if (typeof kind === "object" && kind.kind === "event") {
    return { kind: "function", raw };
  }
  if (typeof kind === "object" && kind.kind === "array") {
    return { kind: "array", raw };
  }
  if (typeof kind === "object" && kind.kind === "object") {
    return { kind: "object", raw };
  }
  return { kind: raw.includes("=>") ? "function" : "other", raw };
}

async function vueDoc(
  file: string,
  text: string
): Promise<Omit<ComponentDoc, "file" | "name">> {
  const ts = typescript();
  if (!ts) {
    return { props: [], types: "unknown", note: NO_TS };
  }
  const meta =
    (await import("vue-component-meta")) as typeof import("vue-component-meta");
  const config = ts.findConfigFile(dirname(file), ts.sys.fileExists);
  const key = config ?? root;
  let checker = vueCheckers.get(key);
  if (!checker) {
    checker = config
      ? meta.createChecker(config, { schema: true })
      : meta.createCheckerByJson(
          root,
          { include: ["**/*.vue"] },
          { schema: true }
        );
    vueCheckers.set(key, checker);
  }
  checker.updateFile(file, text);
  const read = checker.getComponentMeta(file);
  const props = read.props
    .filter((one) => !one.global)
    .map((one) => {
      const { kind, raw, options } = vueKind(one.type, one.schema);
      return prop(one.name, kind, raw, {
        required: one.required,
        defaultValue: one.default ?? null,
        description: one.description,
        ...(options ? { options } : {}),
      });
    });
  const slots = read.slots.map((one) =>
    prop(one.name, "slot", one.type, {
      required: false,
      description: one.description,
    })
  );
  return { props: [...props, ...slots], types: "checked" };
}

/* --- React: react-docgen, then react-docgen-typescript --------------- */

interface DocgenType {
  elements?: DocgenType[];
  name: string;
  raw?: string;
  value?: unknown;
}
interface DocgenProp {
  defaultValue?: { value: string };
  description?: string;
  flowType?: DocgenType;
  required?: boolean;
  tsType?: DocgenType;
  type?: DocgenType;
}
interface DocgenDoc {
  displayName?: string;
  props?: Record<string, DocgenProp>;
}

/** The type names react-docgen writes when it has read a type through. Any other bare name is one it could not follow. */
const RESOLVED = new Set([
  "string",
  "number",
  "boolean",
  "bool",
  "union",
  "literal",
  "signature",
  "Array",
  "tuple",
  "intersection",
  "any",
  "unknown",
  "null",
  "undefined",
  "void",
  "Function",
  "object",
  "Object",
  "Record",
  "enum",
  "node",
  "element",
  "elementType",
  "func",
  "shape",
  "exact",
  "arrayOf",
  "objectOf",
  "instanceOf",
  "oneOfType",
  "array",
  "symbol",
  "custom",
  "ReactNode",
  "ReactElement",
  "JSX.Element",
]);

/** A react-docgen type (TypeScript's, Flow's or PropTypes') as one of the kinds. */
function reactKind(type: DocgenType): {
  kind: PropKind;
  options?: (string | number)[];
  raw: string;
} {
  const raw = type.raw ?? type.name;
  const members =
    type.name === "union" || type.name === "enum"
      ? (type.elements ??
        (Array.isArray(type.value) ? (type.value as DocgenType[]) : []))
      : [type];
  const real = members.filter(
    (one) => !(one.name === "undefined" || one.name === "null")
  );
  if (SLOT_TYPE.test(raw) || type.name === "node" || type.name === "element") {
    return { kind: "slot", raw };
  }
  if (real.every((one) => one.name === "boolean" || one.name === "bool")) {
    return { kind: "boolean", raw: "boolean" };
  }
  const options = literals(
    real.map((one) =>
      one.name === "literal" || type.name === "enum"
        ? String(one.value ?? "")
        : "\0"
    )
  );
  if (options) {
    // react-docgen-typescript's `raw` is the type as declared (`TokenColor`).
    return enumOf(raw, raw, options);
  }
  if (real.every((one) => one.name === "string" || one.name === "number")) {
    return {
      kind: real.some((one) => one.name === "string") ? "string" : "number",
      raw,
    };
  }
  return { kind: structuralKind(type, raw), raw };
}

/** The kinds react-docgen's structural type names are. */
const STRUCTURAL: Record<string, PropKind> = {
  func: "function",
  Array: "array",
  arrayOf: "array",
  array: "array",
  shape: "object",
  object: "object",
  signature: "object",
};

/** A type that is no scalar, enum or slot: a function (a signature of one, or an arrow), an array, an object, or other. */
const structuralKind = (type: DocgenType, raw: string): PropKind => {
  const signature = (type as { type?: string }).type;
  if (
    (type.name === "signature" && signature === "function") ||
    raw.includes("=>")
  ) {
    return "function";
  }
  return STRUCTURAL[type.name] ?? "other";
};

/** Whether react-docgen stopped at a type it could not follow: a bare name it has not read through. */
const unfollowed = (doc: DocgenDoc): boolean =>
  Object.values(doc.props ?? {}).some((one) => {
    const type = one.tsType ?? one.flowType;
    return !!type && !type.raw && !RESOLVED.has(type.name);
  });

/** The doc of the component the story imports: by its name, else the file's default, else its first. */
const pick = <T extends { displayName?: string }>(
  docs: T[],
  name: string
): T | undefined => docs.find((one) => one.displayName === name) ?? docs[0];

async function reactDoc(
  file: string,
  text: string,
  name: string
): Promise<Omit<ComponentDoc, "file" | "name">> {
  const docgen =
    (await import("react-docgen")) as typeof import("react-docgen");
  let docs: DocgenDoc[] = [];
  try {
    docs = docgen.parse(text, {
      filename: file,
      babelOptions: { babelrc: false, configFile: false, root },
    }) as DocgenDoc[];
  } catch {
    docs = [];
  }
  const doc = pick(docs, name);
  const ts = typescript();
  if (ts && (!doc || unfollowed(doc))) {
    const typed =
      (await import("react-docgen-typescript")) as typeof import("react-docgen-typescript");
    const config = ts.findConfigFile(dirname(file), ts.sys.fileExists);
    const parser = config
      ? typed.withCustomConfig(config, TYPED_OPTIONS)
      : typed.withDefaultConfig(TYPED_OPTIONS);
    const found = pick(parser.parse(file), name);
    if (found) {
      return {
        types: "checked",
        props: Object.values(found.props).map((one) => {
          const { kind, raw, options } = reactKind({
            name: one.type.name,
            raw: one.type.raw ?? one.type.name,
            value: one.type.value,
          });
          return prop(one.name, kind, raw, {
            required: one.required,
            defaultValue:
              one.defaultValue?.value === undefined
                ? null
                : String(one.defaultValue.value),
            description: one.description,
            ...(options ? { options } : {}),
          });
        }),
      };
    }
  }
  if (!doc) {
    return {
      props: [],
      types: "unknown",
      note: `No component react-docgen recognises is exported from ${relative(root, file)}.`,
    };
  }
  return {
    types: ts ? "checked" : "jsdoc",
    ...(ts
      ? {}
      : {
          note: "Types read from the source alone: add TypeScript to follow imported types.",
        }),
    props: Object.entries(doc.props ?? {}).map(([key, one]) => {
      const type = one.tsType ?? one.flowType ?? one.type ?? { name: "other" };
      const { kind, raw, options } = reactKind(type);
      return prop(key, kind, raw, {
        required: one.required ?? false,
        defaultValue: one.defaultValue?.value ?? null,
        description: one.description ?? null,
        ...(options ? { options } : {}),
      });
    }),
  };
}

/** react-docgen-typescript's options: unions of literals as enums, the component's own props only (none of the DOM's). */
const TYPED_OPTIONS = {
  shouldExtractLiteralValuesFromEnum: true,
  shouldRemoveUndefinedFromOptional: true,
  savePropValueAsString: true,
  propFilter: (one: { parent?: { fileName: string } }) =>
    !one.parent?.fileName.includes("node_modules"),
};

/* --- The one door ---------------------------------------------------- */

const kept = new Map<string, { doc: ComponentDoc; hash: string }>();

const SVELTE = /\.svelte$/;
const VUE = /\.vue$/;

/** A component's name by its file: `StatTile.svelte` is StatTile. */
const nameOf = (file: string): string =>
  (file.split(sep).at(-1) ?? file).replace(EXTENSION, "");
const EXTENSION = /\.[^.]+$/;

/**
 * Component `file`'s props (absolute; `name` the export a story imports,
 * for a file of several), read again only when its content changed. A read
 * that fails says why in `note`, never thrown: a sheet still mounts.
 */
export async function propsOf(
  file: string,
  name = nameOf(file)
): Promise<ComponentDoc> {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    return {
      file: relative(root, file),
      name,
      props: [],
      types: "unknown",
      note: `${relative(root, file)} could not be read: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const hash = createHash("sha1").update(text).digest("hex");
  const hit = kept.get(`${file}#${name}`);
  if (hit?.hash === hash) {
    return hit.doc;
  }
  let read: Omit<ComponentDoc, "file" | "name">;
  try {
    if (SVELTE.test(file)) {
      read = await svelteDoc(file);
    } else if (VUE.test(file)) {
      read = await vueDoc(file, text);
    } else {
      read = await reactDoc(file, text, name);
    }
  } catch (error) {
    read = {
      props: [],
      types: "unknown",
      note: `Its props could not be read: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`,
    };
  }
  const doc: ComponentDoc = { file: relative(root, file), name, ...read };
  kept.set(`${file}#${name}`, { doc, hash });
  return doc;
}

/** The names `file`'s props are kept under: an HMR update of it reads each again. */
export const propsNames = (file: string): string[] =>
  [...kept.keys()]
    .filter((key) => key.startsWith(`${file}#`))
    .map((key) => key.slice(file.length + 1));

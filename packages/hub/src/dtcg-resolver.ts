/**
 * A token system as the W3C Design Tokens Resolver Module 2025.10 lays it
 * out (https://www.designtokens.org/tr/2025.10/resolver/): a resolver
 * document whose `sets` and `modifiers` name token files, and whose
 * `resolutionOrder` says how they stack. Light and dark, a coarse pointer,
 * any other theme, is a modifier's context; nothing about a theme lives in a
 * token's `$extensions`.
 *
 * Style Dictionary 5 has no resolver yet (its maintainer, style-dictionary
 * #1590, 2026-03-20: "resolver will be some work to create a parser … nothing
 * … is blocking folks from just taking care of it themselves in an
 * abstraction layer on top of SD"), so this is that layer, kept thin: it
 * reads the document, enforces the spec's guards, and hands Style Dictionary
 * one merged tree per context.
 *
 * What CawCo's stylesheet writes for a context is the modifier's
 * `$extensions["dev.cawco"].contexts[<name>]`: `{ "scheme": "dark",
 * "selector": ":root.dark" }` (colours as `light-dark()`, any other token
 * under the selector) or `{ "media": "(pointer: coarse)" }`. Every set comes
 * before the modifiers in `resolutionOrder` (the spec calls sets after
 * modifiers "likely a smell").
 *
 * Both files are checked against the DTCG's published JSON Schemas
 * (https://www.designtokens.org/schemas/2025.10/format.json and
 * …/resolver.json, kept in packages/hub/schemas/dtcg-2025.10/).
 */
import { posix } from "node:path";
import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import type { DesignTokens } from "style-dictionary/types";
import formatSchema from "../schemas/dtcg-2025.10/format.json" with { type: "json" };
import resolverSchema from "../schemas/dtcg-2025.10/resolver.json" with { type: "json" };
import { valueProblems } from "./dtcg-validate";
import { TOKENS_EXTENSION } from "./dtcg-values";

const VERSION = "2025.10";
/** A resolution-order reference: `#/sets/<name>` or `#/modifiers/<name>`. */
const ORDER_REF = /^#\/(sets|modifiers)\/(.+)$/;

/** Where a context's tokens go in the stylesheet. */
export type ContextCondition =
  { scheme: "dark"; selector?: string } | { media: string };

export interface TokenContext {
  condition: ContextCondition;
  /** The file new overrides of this context are written to (a settled value), relative to the resolver. */
  file: string | undefined;
  modifier: string;
  name: string;
  /** Its overrides, merged in source order. */
  tree: DesignTokens;
}

/** A token node, where it sits, and the file that holds it. */
export interface Owned {
  file: string | undefined;
  key: string;
  node: Record<string, unknown>;
  parent: Record<string, unknown>;
}

export interface TokenSystem {
  /** Every set and every modifier's default context, merged. */
  base: DesignTokens;
  /** Who holds each base token, by path. */
  baseOwners: Map<string, Owned>;
  /** Who holds each context's override, by context then path. */
  contextOwners: Map<string, Map<string, Owned>>;
  /** Each non-default context, in resolution order. */
  contexts: TokenContext[];
  /** Every file read, by path relative to the resolver, as parsed (settle writes into these). */
  files: Map<string, unknown>;
  /** The resolver document's own path. */
  resolver: string;
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json =>
  !!v && typeof v === "object" && !Array.isArray(v);
const isToken = (v: unknown): v is Json => isObject(v) && "$value" in v;

/** Every token in a tree with its path, its group and its key there. */
export function* tokensIn(
  tree: unknown,
  at: string[] = []
): Generator<{ key: string; node: Json; parent: Json; path: string }> {
  if (!isObject(tree) || isToken(tree)) {
    return;
  }
  for (const [key, value] of Object.entries(tree)) {
    if (key.startsWith("$") && key !== "$root") {
      continue;
    }
    if (isToken(value)) {
      yield { key, node: value, parent: tree, path: [...at, key].join(".") };
    } else {
      yield* tokensIn(value, [...at, key]);
    }
  }
}

/** Deep merge for token trees: a token replaces whole, groups merge. */
function mergeInto(target: Json, source: Json): void {
  for (const [key, value] of Object.entries(source)) {
    const before = target[key];
    if (
      isObject(value) &&
      !isToken(value) &&
      isObject(before) &&
      !isToken(before)
    ) {
      mergeInto(before, value);
    } else {
      target[key] = structuredClone(value);
    }
  }
}

function owners(
  tree: unknown,
  file: string | undefined,
  into: Map<string, Owned>
): void {
  for (const { path, node, parent, key } of tokensIn(tree)) {
    into.set(path, { file, key, node, parent });
  }
}

let validators:
  { format: ValidateFunction; resolver: ValidateFunction } | undefined;
const validatorsOf = () => {
  if (!validators) {
    // One instance each: both bundles carry the same inner $ids.
    const compile = (schema: object) =>
      addFormats(new Ajv({ strict: false, allErrors: true })).compile(schema);
    validators = {
      format: compile(formatSchema),
      resolver: compile(resolverSchema),
    };
  }
  return validators;
};

const errorsOf = (validate: ValidateFunction, where: string): string[] =>
  (validate.errors ?? [])
    .slice(0, 8)
    .map(
      (e) => `${where}${e.instancePath || "/"} ${e.message ?? "is invalid"}`
    );

/** What the DTCG schemas say is wrong with a system's files; none when every file conforms. */
export function schemaProblems(system: TokenSystem): string[] {
  const { format, resolver } = validatorsOf();
  return [...system.files].flatMap(([path, json]) => {
    const validate = path === system.resolver ? resolver : format;
    return validate(json) ? [] : errorsOf(validate, path);
  });
}

interface Source {
  file: string | undefined;
  tree: Json;
}

/**
 * Reads a resolver document and every file it names. `read` takes a path
 * relative to the resolver's folder and answers the parsed JSON. Throws,
 * with the spec's reason, on a document the spec refuses.
 */
export async function loadTokenSystem(
  resolverPath: string,
  read: (path: string) => Promise<unknown>
): Promise<TokenSystem> {
  const files = new Map<string, unknown>();
  const doc = (await read(resolverPath)) as Json;
  files.set(resolverPath, doc);
  if (doc.version !== VERSION) {
    throw new Error(
      `${resolverPath}: "version" must be "${VERSION}" (Resolver Module §4.1.2)`
    );
  }
  const order = doc.resolutionOrder;
  if (!Array.isArray(order) || order.length === 0) {
    throw new Error(`${resolverPath}: "resolutionOrder" is required`);
  }
  const loader = new Loader(doc, resolverPath, files, read);
  const names = new Set<string>();
  let modifiersBegan = false;
  for (const [index, raw] of order.entries()) {
    const where = `${resolverPath} resolutionOrder[${index}]`;
    const item = resolved(doc, raw, where, names);
    if (item.type === "set" && modifiersBegan) {
      throw new Error(
        `${where}: put every set before the modifiers; a set after them overrides their contexts`
      );
    }
    modifiersBegan ||= item.type === "modifier";
    // biome-ignore lint/performance/noAwaitInLoops: the order is the meaning
    await (item.type === "set"
      ? loader.set(item.body, where)
      : loader.modifier(item.name, item.body, where));
  }
  // Every value against its type before anything evaluates one: a string
  // dimension once reached the serialiser as `undefined.toPrecision`.
  const problems = valueProblems(files, resolverPath);
  if (problems.length > 0) {
    throw new Error(`not DTCG 2025.10:\n  ${problems.join("\n  ")}`);
  }
  return {
    base: loader.base as DesignTokens,
    baseOwners: loader.baseOwners,
    contexts: loader.contexts,
    contextOwners: loader.contextOwners,
    files,
    resolver: resolverPath,
  };
}

/** A modifier's CSS conditions, by context, from its `$extensions`. */
const conditionsOf = (
  body: Json
): Record<string, ContextCondition> | undefined =>
  (
    (body.$extensions as Json | undefined)?.[TOKENS_EXTENSION] as
      { contexts?: Record<string, ContextCondition> } | undefined
  )?.contexts;

/** Checks a modifier as the spec does: two or more contexts, a default among them. */
function contextsOf(body: Json, where: string): [string, unknown][] {
  const { contexts } = body;
  if (!isObject(contexts) || Object.keys(contexts).length === 0) {
    throw new Error(`${where}: a modifier must have contexts (§4.1.5.1)`);
  }
  if (Object.keys(contexts).length === 1) {
    throw new Error(
      `${where}: a modifier with one context is a set (§4.1.5.1)`
    );
  }
  if (typeof body.default !== "string" || !(body.default in contexts)) {
    throw new Error(
      `${where}: "default" must name one of its contexts; CawCo's stylesheet draws the default as the base`
    );
  }
  return Object.entries(contexts);
}

/**
 * One resolver document read: its sources fetched, the base merged, each
 * context's overrides merged. Owners point at the files' own nodes, so a
 * settled value lands in its file.
 */
class Loader {
  readonly base: Json = {};
  readonly baseOwners = new Map<string, Owned>();
  readonly contexts: TokenContext[] = [];
  readonly contextOwners = new Map<string, Map<string, Owned>>();
  private readonly doc: Json;
  private readonly files: Map<string, unknown>;
  private readonly folder: string;
  private readonly read: (path: string) => Promise<unknown>;

  constructor(
    doc: Json,
    resolverPath: string,
    files: Map<string, unknown>,
    read: (path: string) => Promise<unknown>
  ) {
    this.doc = doc;
    this.files = files;
    this.folder = posix.dirname(resolverPath);
    this.read = read;
  }

  async set(body: Json, where: string): Promise<void> {
    this.take(
      await this.sources(body.sources, where),
      this.base,
      this.baseOwners
    );
  }

  async modifier(name: string, body: Json, where: string): Promise<void> {
    const conditions = conditionsOf(body);
    for (const [context, list] of contextsOf(body, where)) {
      // biome-ignore lint/performance/noAwaitInLoops: contexts merge in order
      const sources = await this.sources(list, `${where} ${context}`);
      if (context === body.default) {
        this.take(sources, this.base, this.baseOwners);
        continue;
      }
      const condition = conditions?.[context];
      if (!(condition && ("scheme" in condition || "media" in condition))) {
        throw new Error(
          `${where}: context "${context}" needs its CSS condition in the modifier's $extensions["${TOKENS_EXTENSION}"].contexts.${context}: { "scheme": "dark" } or { "media": "…" }`
        );
      }
      const tree: Json = {};
      const own = new Map<string, Owned>();
      this.take(sources, tree, own);
      this.contextOwners.set(context, own);
      this.contexts.push({
        condition,
        file: sources.find((source) => source.file)?.file,
        modifier: name,
        name: context,
        tree: tree as DesignTokens,
      });
    }
  }

  private take(sources: Source[], tree: Json, into: Map<string, Owned>) {
    for (const source of sources) {
      mergeInto(tree, source.tree);
      owners(source.tree, source.file, into);
    }
  }

  private async sources(list: unknown, where: string): Promise<Source[]> {
    if (!Array.isArray(list)) {
      throw new Error(`${where}: sources must be an array`);
    }
    const out: Source[] = [];
    for (const entry of list) {
      // biome-ignore lint/performance/noAwaitInLoops: sources merge in order
      out.push(...(await this.source(entry, where)));
    }
    return out;
  }

  private async source(entry: unknown, where: string): Promise<Source[]> {
    const ref = isObject(entry) ? entry.$ref : undefined;
    if (typeof ref === "string" && ref.startsWith("#")) {
      if (
        ref.startsWith("#/modifiers") ||
        ref.startsWith("#/resolutionOrder")
      ) {
        throw new Error(
          `${where}: ${ref} may not be referenced here (Resolver Module §4.2.1)`
        );
      }
      return await this.sources(pointer(this.doc, ref, where).sources, ref);
    }
    if (typeof ref === "string") {
      const path = posix.normalize(posix.join(this.folder, ref));
      const json = this.files.get(path) ?? (await this.read(path));
      this.files.set(path, json);
      return [{ file: path, tree: json as Json }];
    }
    if (isObject(entry)) {
      return [{ file: undefined, tree: entry }];
    }
    throw new Error(`${where}: a source is a $ref or inline tokens`);
  }
}

function pointer(doc: Json, ref: string, where: string): Json {
  let at: unknown = doc;
  for (const part of ref.slice(2).split("/")) {
    at = isObject(at)
      ? at[part.replaceAll("~1", "/").replaceAll("~0", "~")]
      : undefined;
  }
  if (!isObject(at)) {
    throw new Error(`${where}: ${ref} points at nothing`);
  }
  return at;
}

/** A resolution-order item as `{ type, name, body }`: a reference to a set or modifier, or one inline. */
function resolved(
  doc: Json,
  raw: unknown,
  where: string,
  names: Set<string>
): { body: Json; name: string; type: "set" | "modifier" } {
  if (!isObject(raw)) {
    throw new Error(`${where}: an item is a $ref or an inline set or modifier`);
  }
  const ref = raw.$ref;
  let item: { body: Json; name: string; type: "set" | "modifier" };
  if (typeof ref === "string") {
    const match = ORDER_REF.exec(ref);
    if (!match) {
      throw new Error(`${where}: ${ref} names no set or modifier`);
    }
    item = {
      body: pointer(doc, ref, where),
      name: match[2] ?? "",
      type: match[1] === "sets" ? "set" : "modifier",
    };
  } else if (
    typeof raw.name === "string" &&
    (raw.type === "set" || raw.type === "modifier")
  ) {
    item = { body: raw, name: raw.name, type: raw.type };
  } else {
    throw new Error(
      `${where}: an inline set or modifier needs "name" and "type" (§4.1.6.1)`
    );
  }
  if (names.has(item.name)) {
    throw new Error(`${where}: "${item.name}" appears twice`);
  }
  names.add(item.name);
  return item;
}

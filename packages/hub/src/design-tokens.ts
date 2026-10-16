/**
 * The one tokens.css generator: a W3C Design Tokens (DTCG 2025.10) token
 * system in, a stylesheet of custom properties out. CawCo builds its own
 * dashboard with it (`apps/dashboard/scripts/build-tokens.ts`, `bun run
 * tokens`) and every project's `design/tokens.css` (design-system.ts).
 *
 * The system is a resolver document and the token files it names
 * (dtcg-resolver.ts); every value is a DTCG value (dtcg-values.ts). Style
 * Dictionary parses the base tree (group `$type`s, references, names). Each
 * token's CSS is its recipe, else its value serialised; a context (dark, a
 * coarse pointer) adds its own CSS where it differs. Colours with a dark
 * value are emitted as `light-dark(light, dark)`, any other token's dark
 * value under the scheme's selector, a media context's under its `@media`.
 * References (`{group.name}`) are emitted as `var(--name)`, so the cascade
 * keeps resolving them at runtime. A custom property is named for its
 * token's last path segment, so two tokens may not end in the same name.
 *
 * {@link settle} keeps the static values honest: a token with a recipe has
 * its `$value` computed from it in the base and in every context, and a
 * context whose computed value differs gets that value as an override, so a
 * tool reading any permutation reads a correct value.
 *
 * Beside the stylesheet it writes a typed module, {@link tokenTypes}: the
 * system's names as `TokenColor`, `TokenSize` and `TokenFont`, which a
 * component's props take to be offered them in the sheet inspector.
 */
import { TOKEN_TYPES, type TokenType } from "@cawco/core/stage";
import StyleDictionary from "style-dictionary";
import type { DesignTokens, TransformedToken } from "style-dictionary/types";
import { CssEvaluator, type CssToken } from "./design-css";
import {
  loadTokenSystem,
  type Owned,
  schemaProblems,
  type TokenContext,
  type TokenSystem,
  tokensIn,
} from "./dtcg-resolver";
import { fromCss, sameValue, TOKENS_EXTENSION, toCss } from "./dtcg-values";

const REFS = /\{([^}]+)\}/g;

export interface ViewToken extends CssToken {
  description?: string;
  /** The token as Style Dictionary parsed it from the base tree. */
  original: TransformedToken;
  path: string;
  type: string;
}

/** A token system as CSS: every base token's CSS form and each context's own. */
export interface TokenView {
  byPath: Map<string, ViewToken>;
  contexts: TokenContext[];
  darkContexts: Set<string>;
  tokens: ViewToken[];
}

export interface TokensCssOptions {
  /** Declares `color-scheme: light dark` on `:root`, so `light-dark()` follows the person's scheme. */
  colorScheme?: boolean;
  /** The comment the file opens with, whole: where it came from and how to change it. */
  header: string;
  /** Which tokens the stylesheet carries; every one when left out. */
  include?: (token: TransformedToken) => boolean;
  /** The cascade layer the custom properties sit in. */
  layer: string;
}

/** The custom property's name: the token's last path segment. */
export const cssLeafName = (token: TransformedToken): string =>
  token.path.at(-1) ?? token.name;

type Json = Record<string, unknown>;

/** A token's recipe: the CSS it keeps in `$extensions`. */
export const recipeOf = (node: Json): string | undefined => {
  const css = (
    (node.$extensions as Json | undefined)?.[TOKENS_EXTENSION] as
      Json | undefined
  )?.css;
  return typeof css === "string" ? css : undefined;
};

/** A token's CSS: its recipe, else its value serialised. */
export function cssOfNode(type: string, node: Json, where: string): string {
  const css = recipeOf(node) ?? toCss(type, node.$value);
  if (css === undefined) {
    throw new Error(
      `${where}: a ${type} has no plain CSS form; give it one in $extensions["${TOKENS_EXTENSION}"].css`
    );
  }
  return css;
}

/** The base tree's tokens as Style Dictionary parses them, in order. */
async function parsed(tree: DesignTokens): Promise<TransformedToken[]> {
  const sd = new StyleDictionary({
    tokens: tree,
    usesDtcg: true,
    log: { verbosity: "silent", warnings: "error" },
    hooks: {
      transforms: {
        "name/css-leaf": { type: "name", transform: cssLeafName },
      },
    },
    platforms: { css: { transforms: ["name/css-leaf"] } },
  });
  return (await sd.getPlatformTokens("css")).allTokens;
}

/** The CSS view of a system: Style Dictionary over the base, each context's overrides over it. */
export async function tokenView(system: TokenSystem): Promise<TokenView> {
  const tokens: ViewToken[] = (await parsed(system.base)).map((original) => {
    const path = original.path.join(".");
    const type = String(original.$type ?? original.original.$type ?? "");
    return {
      css: cssOfNode(type, original.original as Json, path),
      ...(original.$description ? { description: original.$description } : {}),
      name: original.name,
      original,
      path,
      type,
      variants: {},
    };
  });
  const byPath = new Map(tokens.map((token) => [token.path, token]));
  for (const context of system.contexts) {
    for (const { path, node } of tokensIn(context.tree)) {
      const token = byPath.get(path);
      if (!token) {
        throw new Error(
          `${context.name}: overrides ${path}, which the base does not have`
        );
      }
      const css = cssOfNode(
        String(node.$type ?? token.type),
        node,
        `${path} (${context.name})`
      );
      // An override settle added repeats the base recipe and draws nothing;
      // one the file states is drawn, even when it says what the base says.
      const added = recipeOf(node) !== undefined && css === token.css;
      if (!added) {
        token.variants[context.name] = css;
      }
    }
  }
  return {
    byPath,
    contexts: system.contexts,
    darkContexts: new Set(
      system.contexts
        .filter((context) => "scheme" in context.condition)
        .map((context) => context.name)
    ),
    tokens,
  };
}

/** The evaluator over a view: what any token's CSS comes to, under any context. */
export const evaluatorOf = (view: TokenView): CssEvaluator =>
  new CssEvaluator((path) => view.byPath.get(path), view.darkContexts);

/** Sets a token's group path in `tree`, making groups as needed. */
function place(tree: Json, path: string, node: Json): void {
  const parts = path.split(".");
  let at = tree;
  for (const part of parts.slice(0, -1)) {
    at[part] = (at[part] as Json | undefined) ?? {};
    at = at[part] as Json;
  }
  at[parts.at(-1) ?? path] = node;
}

/** A computed value, keeping what the CSS form does not carry (a type role's letter-spacing). */
function computed(type: string, value: unknown, before: unknown): unknown {
  if (type === "typography" && before && typeof before === "object") {
    return {
      ...(value as Json),
      letterSpacing: (before as Json).letterSpacing,
    };
  }
  return value;
}

/**
 * Computes every recipe's static value into the system's files: in the
 * base, in each context's own overrides, and as a new override in a context
 * where the base recipe comes to something else. An override that only
 * repeated the base is taken out. Answers the files it changed.
 */
export function settle(system: TokenSystem, view: TokenView): Set<string> {
  const ev = evaluatorOf(view);
  const changed = new Set<string>();
  const write = (owned: Owned, value: unknown) => {
    if (!sameValue(owned.node.$value, value)) {
      owned.node.$value = value;
      changed.add(owned.file ?? system.resolver);
    }
  };
  for (const token of view.tokens) {
    const base = system.baseOwners.get(token.path);
    if (!base) {
      continue;
    }
    const recipe = recipeOf(base.node);
    if (recipe) {
      write(
        base,
        computed(
          token.type,
          fromCss(token.type, recipe, ev, "base", token.path),
          base.node.$value
        )
      );
    }
    for (const context of system.contexts) {
      settleContext(system, context, token, base, recipe, ev, write, changed);
    }
  }
  return changed;
}

function settleContext(
  system: TokenSystem,
  context: TokenContext,
  token: ViewToken,
  base: Owned,
  recipe: string | undefined,
  ev: CssEvaluator,
  write: (owned: Owned, value: unknown) => void,
  changed: Set<string>
): void {
  const where = `${token.path} (${context.name})`;
  const own = system.contextOwners.get(context.name)?.get(token.path);
  const ownRecipe = own ? recipeOf(own.node) : undefined;
  if (own && ownRecipe && ownRecipe !== recipe) {
    write(
      own,
      computed(
        token.type,
        fromCss(token.type, ownRecipe, ev, context.name, where),
        own.node.$value
      )
    );
    return;
  }
  if (own && !ownRecipe) {
    return;
  }
  if (!recipe) {
    return;
  }
  const value = computed(
    token.type,
    fromCss(token.type, recipe, ev, context.name, where),
    base.node.$value
  );
  if (sameValue(value, base.node.$value)) {
    if (own) {
      // An override that only repeated the base.
      delete own.parent[own.key];
      changed.add(own.file ?? system.resolver);
    }
    return;
  }
  if (own) {
    write(own, value);
    return;
  }
  const { file } = context;
  const json = file ? (system.files.get(file) as Json | undefined) : undefined;
  if (!(file && json)) {
    throw new Error(
      `${where}: its value differs in ${context.name}, and that context names no token file to hold it`
    );
  }
  place(json, token.path, {
    $type: token.type,
    $value: value,
    $extensions: { [TOKENS_EXTENSION]: { css: recipe } },
  });
  changed.add(file);
}

function cssValue(raw: string, names: Set<string>, where: string): string {
  return raw.replace(REFS, (_, ref: string) => {
    const name = ref.split(".").at(-1) ?? ref;
    if (!names.has(name)) {
      throw new Error(`${where}: unknown reference {${ref}}`);
    }
    return `var(--${name})`;
  });
}

/** Refuses two tokens that would declare the same custom property. */
function uniqueNames(tokens: ViewToken[]): Set<string> {
  const seen = new Map<string, string>();
  for (const token of tokens) {
    const before = seen.get(token.name);
    if (before) {
      throw new Error(
        `${before} and ${token.path} both make --${token.name}: rename one, a custom property is named for its token's last segment`
      );
    }
    seen.set(token.name, token.path);
  }
  return new Set(seen.keys());
}

const isColour = (token: ViewToken): boolean => token.type === "color";

/** A block of one context's declarations under `opening`; none when no token has one. */
function variantBlock(
  tokens: ViewToken[],
  names: Set<string>,
  context: string,
  opening: string[]
): string[] {
  if (tokens.length === 0) {
    return [];
  }
  const indent = "  ".repeat(opening.length + 1);
  const closing = opening.map((_, i) => `${"  ".repeat(opening.length - i)}}`);
  return [
    "",
    ...opening,
    ...tokens.map(
      (token) =>
        `${indent}--${token.name}: ${cssValue(token.variants[context] ?? "", names, token.name)};`
    ),
    ...closing,
  ];
}

/** The stylesheet a token view makes. */
export function tokensCss(view: TokenView, options: TokensCssOptions): string {
  const tokens = view.tokens.filter((token) =>
    options.include ? options.include(token.original) : true
  );
  const names = uniqueNames(tokens);
  const scheme = view.contexts.filter((c) => "scheme" in c.condition);
  if (scheme.length > 1) {
    throw new Error(
      `the stylesheet draws one dark scheme; ${scheme.map((c) => c.name).join(" and ")} are two`
    );
  }
  const [dark] = scheme;
  const root = ["  :root {"];
  if (options.colorScheme) {
    root.push("    color-scheme: light dark;");
  }
  for (const token of tokens) {
    if (token.description) {
      root.push(`    /* ${token.description} */`);
    }
    const light = cssValue(token.css, names, token.name);
    const night =
      dark && isColour(token) ? token.variants[dark.name] : undefined;
    root.push(
      night === undefined
        ? `    --${token.name}: ${light};`
        : `    --${token.name}: light-dark(${light}, ${cssValue(night, names, token.name)});`
    );
  }
  root.push("  }");
  const blocks: string[] = [];
  if (dark) {
    const others = tokens.filter(
      (t) => !isColour(t) && t.variants[dark.name] !== undefined
    );
    const { selector } = dark.condition as { selector?: string };
    if (others.length > 0 && !selector) {
      throw new Error(
        `${others.map((t) => t.path).join(", ")} change in ${dark.name} and are not colours: give the context a "selector" to set them under`
      );
    }
    blocks.push(...variantBlock(others, names, dark.name, [`  ${selector} {`]));
  }
  for (const context of view.contexts) {
    if ("media" in context.condition) {
      blocks.push(
        ...variantBlock(
          tokens.filter((t) => t.variants[context.name] !== undefined),
          names,
          context.name,
          [`  @media ${context.condition.media} {`, "    :root {"]
        )
      );
    }
  }
  return [
    options.header,
    `@layer ${options.layer} {`,
    ...root,
    ...blocks,
    "}",
    "",
  ].join("\n");
}

/** A typography token's family is its own when it is no reference to a fontFamily token (which the font type names already). */
const ownFamily = (token: ViewToken): boolean => {
  const family = ((token.original.original as Json).$value as Json | undefined)
    ?.fontFamily;
  return !(typeof family === "string" && family.startsWith("{"));
};

/** Which tokens each generated type names: by `$type`, a font a fontFamily or a typography role with its own family. */
const TYPE_MEMBERS: Record<TokenType, (token: ViewToken) => boolean> = {
  TokenColor: (token) => token.type === "color",
  TokenSize: (token) => token.type === "dimension",
  TokenFont: (token) =>
    token.type === "fontFamily" ||
    (token.type === "typography" && ownFamily(token)),
};

/**
 * The typed module beside the stylesheet (`tokens.ts`): one string-literal
 * union of the system's token names (their dotted DTCG paths) per
 * {@link TOKEN_TYPES} alias. A component types a prop with one, and the
 * inspector offers that prop the system's names (the owner, 2026-10-16); no
 * other prop is offered any. A type with no tokens is `never`.
 */
export function tokenTypes(
  view: TokenView,
  options: Pick<TokensCssOptions, "header" | "include">
): string {
  const tokens = view.tokens.filter((token) =>
    options.include ? options.include(token.original) : true
  );
  const types = (Object.keys(TOKEN_TYPES) as TokenType[]).map((name) => {
    const members = tokens
      .filter(TYPE_MEMBERS[name])
      .map((token) => `  | ${JSON.stringify(token.path)}`);
    return members.length === 0
      ? `export type ${name} = never;`
      : `export type ${name} =\n${members.join("\n")};`;
  });
  return [options.header, "", ...types.flatMap((one) => [one, ""])].join("\n");
}

/** A system built: its files settled and checked against the DTCG schemas, its view, its stylesheet and its typed module. */
export interface BuiltTokens {
  /** The files settle changed, by path, with their new JSON. */
  changed: Map<string, unknown>;
  css: string;
  system: TokenSystem;
  /** The typed module ({@link tokenTypes}). */
  types: string;
  view: TokenView;
}

/**
 * Loads, settles, checks and draws a token system. Throws with every schema
 * problem when a file does not conform once settled.
 */
export async function buildTokens(
  resolverPath: string,
  read: (path: string) => Promise<unknown>,
  options: TokensCssOptions
): Promise<BuiltTokens> {
  const system = await loadTokenSystem(resolverPath, read);
  const view = await tokenView(system);
  const changedFiles = settle(system, view);
  const problems = schemaProblems(system);
  if (problems.length > 0) {
    throw new Error(`not DTCG 2025.10: ${problems.join("; ")}`);
  }
  if (changedFiles.size === 0) {
    return {
      changed: new Map(),
      css: tokensCss(view, options),
      system,
      types: tokenTypes(view, options),
      view,
    };
  }
  // Settling changes values, never CSS; the merged trees are read again so
  // the system handed on carries the settled values.
  const settled = await loadTokenSystem(
    resolverPath,
    async (path) => system.files.get(path) ?? read(path)
  );
  const settledView = await tokenView(settled);
  return {
    changed: new Map(
      [...changedFiles].map((path) => [path, system.files.get(path)])
    ),
    css: tokensCss(settledView, options),
    system: settled,
    types: tokenTypes(settledView, options),
    view: settledView,
  };
}

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
 */
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

// MARK: - The Tailwind theme over the tokens

/**
 * What a Tailwind theme carries beyond the tokens themselves: the literals
 * Tailwind reads at build time, the keys a platform default needs, and the
 * names a product has retired.
 */
export interface TailwindThemeOptions {
  /** Media-query widths by name (`desk:`, `max-desk:`). Literals: a media query cannot read `var()`. Written as containers too. */
  breakpoints: Readonly<Record<string, string>>;
  /** Container-query widths by name (`@max-leaf/leaf:`), one per width a container query uses. Literals, as breakpoints. */
  containers: Readonly<Record<string, string>>;
  /** Keys no token makes, in CSS over the tokens: Tailwind's `--default-*` and `--animate-*`. */
  defaults: Readonly<Record<string, string>>;
  /** Shadow tokens drawn as a filter's `drop-shadow()`, not a box's: `--drop-shadow-*` keys. */
  dropShadows: ReadonlySet<string>;
  /** The comment the file opens with, whole. */
  header: string;
  /** Which tokens the theme carries; every one when left out. */
  include?: (token: TransformedToken) => boolean;
  /** The keyframes the defaults name, by name, as their CSS body. */
  keyframes: Readonly<Record<string, string>>;
  /** Font weights no token carries, by key: a face that ships only that weight. */
  literalWeights: Readonly<Record<string, string>>;
  /**
   * The type roles markup names as `text-<role>`: the role's size, with its
   * leading, weight and tracking as fallbacks under `--tw-leading`,
   * `--tw-font-weight` and `--tw-tracking`, so a `leading-*`, `font-*` or
   * `tracking-*` beside it wins whatever the order (Tailwind's own type
   * scale utilities, written from the role's token).
   */
  markupRoles: readonly string[];
  /** Tokens markup no longer names: no key and no utility is made for them. */
  retired: ReadonlySet<string>;
  /** Declarations a type role's utility adds after the role's own. */
  roleExtras: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** Tailwind's numeric spacing step (`p-2`): the one key no token gives. */
  spacing: string;
  /** Which `size` tokens are also spacing keys (`h-c-btn-h`, `size-icon-md`), by name. */
  spacingSizes: RegExp;
  /** Font-weight tokens by the key each makes (`weight-strong` → `medium`). */
  weights: Readonly<Record<string, string>>;
}

/** One key of the theme and the token it reads. */
export interface ThemeKey {
  key: string;
  token: ViewToken;
}

/** The theme a token view makes, with what it holds, for a reader that lists it. */
export interface TailwindTheme {
  css: string;
  /** Every key a token makes, by namespace (`spacing`, `radius`, `color` …). */
  keys: Map<string, ThemeKey[]>;
  /** Literal keys, by namespace, with their values. */
  literals: Map<string, [string, string][]>;
  /** Tokens whose value switches under a media context, and every token that reads one. */
  switched: Set<string>;
  /** Every utility the file declares. */
  utilities: string[];
}

/** A `@utility` rule: its name and its body's lines. */
type ThemeUtility = [string, string[]];

const strip = (leaf: string, prefix: string): string =>
  leaf.startsWith(prefix) ? leaf.slice(prefix.length) : leaf;
const RADIUS_SUFFIX = /-r$/;

/** Tokens whose value a media context switches, and every token whose CSS reads one of them. */
function switchedTokens(
  tokens: ViewToken[],
  contexts: TokenContext[]
): Set<string> {
  const media = contexts
    .filter((c) => "media" in c.condition)
    .map((c) => c.name);
  const switched = new Set(
    tokens
      .filter((t) => media.some((name) => t.variants[name] !== undefined))
      .map((t) => t.name)
  );
  for (let grew = true; grew;) {
    grew = false;
    for (const token of tokens) {
      if (switched.has(token.name)) {
        continue;
      }
      const reads = [...token.css.matchAll(REFS)].map(
        ([, ref]) => ref.split(".").at(-1) ?? ref
      );
      if (reads.some((name) => switched.has(name))) {
        switched.add(token.name);
        grew = true;
      }
    }
  }
  return switched;
}

/** A radius token's key: `radius-md` → `md`, `row-mark-r` → `row-mark`; its whole name where that would repeat another's. */
function radiusKeys(tokens: ViewToken[]): Map<string, string> {
  const short = (name: string) =>
    strip(name, "radius-").replace(RADIUS_SUFFIX, "");
  const taken = new Map<string, number>();
  for (const t of tokens) {
    taken.set(short(t.name), (taken.get(short(t.name)) ?? 0) + 1);
  }
  return new Map(
    tokens.map((t) => {
      const key = short(t.name);
      const own = t.name.startsWith("radius-") || (taken.get(key) ?? 0) === 1;
      return [t.name, own ? key : t.name];
    })
  );
}

/** A type role's longhands, from its DTCG composite: never the `font` shorthand, which resets font-variant. */
function roleLonghands(token: ViewToken, names: Set<string>): string[] {
  const value = (token.original.original as Json).$value as Json;
  const css = (type: string, v: unknown) =>
    cssValue(toCss(type, v) ?? "", names, token.name);
  const lines = [
    `font-family: ${css("fontFamily", value.fontFamily)};`,
    `font-size: ${css("dimension", value.fontSize)};`,
    `font-weight: ${css("fontWeight", value.fontWeight)};`,
    `line-height: ${css("number", value.lineHeight)};`,
  ];
  const tracking = value.letterSpacing;
  const zero =
    tracking &&
    typeof tracking === "object" &&
    (tracking as { value: number }).value === 0;
  if (tracking !== undefined && !zero) {
    lines.push(`letter-spacing: ${css("dimension", tracking)};`);
  }
  return lines;
}

/**
 * A type role as markup names it (`text-meta`): its size, and its leading,
 * weight and tracking as fallbacks a utility beside it overrides. Each
 * value is read from the token of the role's own name (`leading-meta`), or
 * from the one token of its group with the role's value (`leading-ui` for
 * the title's 1.25), so the utility follows the tokens.
 */
function markupRoleLonghands(
  role: ViewToken,
  tokens: ViewToken[],
  names: Set<string>
): string[] {
  const value = (role.original.original as Json).$value as Json;
  const short = strip(role.name, "type-");
  const named = (prefix: string, type: string, v: unknown): string => {
    if (typeof v === "string") {
      return cssValue(v, names, role.name);
    }
    const same = tokens.filter(
      (t) =>
        t.name.startsWith(prefix) &&
        t.type === type &&
        sameValue((t.original.original as Json).$value, v)
    );
    const own = same.find((t) => t.name === `${prefix}${short}`);
    const pick = own ?? (same.length === 1 ? same[0] : undefined);
    if (!pick) {
      throw new Error(
        `${role.path}: its ${prefix}* value ${JSON.stringify(v)} is ${same.length === 0 ? "no" : "more than one"} token's; name one ${prefix}${short}`
      );
    }
    return `var(--${pick.name})`;
  };
  const lines = [
    `font-size: ${cssValue(toCss("dimension", value.fontSize) ?? "", names, role.name)};`,
    `line-height: var(--tw-leading, ${named("leading-", "number", value.lineHeight)});`,
  ];
  const tracking = value.letterSpacing;
  const zero =
    tracking &&
    typeof tracking === "object" &&
    (tracking as { value: number }).value === 0;
  if (tracking !== undefined && !zero) {
    lines.push(
      `letter-spacing: var(--tw-tracking, ${named("track-", "dimension", tracking)});`
    );
  }
  lines.push(
    `font-weight: var(--tw-font-weight, ${named("weight-", "fontWeight", value.fontWeight)});`
  );
  return lines;
}

/** A token's theme key, by its group and type: the namespace and the name after it. */
type KeyRule = (
  leaf: string,
  options: TailwindThemeOptions,
  radii: Map<string, string>
) => [string, string] | undefined;

const KEY_RULES: Record<string, KeyRule> = {
  "color/color": (leaf) => ["color", leaf],
  "shadow/shadow": (leaf, options) => [
    options.dropShadows.has(leaf) ? "drop-shadow" : "shadow",
    strip(leaf, "shadow-"),
  ],
  "font/fontFamily": (leaf) => ["font", strip(leaf, "font-")],
  "type/fontWeight": (leaf, options) => {
    const key = options.weights[leaf];
    if (!key) {
      throw new Error(
        `${leaf}: a font weight with no key; name it in the theme's weights`
      );
    }
    return ["font-weight", key];
  },
  "type/dimension": (leaf) =>
    leaf.startsWith("track-") ? ["tracking", strip(leaf, "track-")] : undefined,
  "type/number": (leaf) =>
    leaf.startsWith("leading-")
      ? ["leading", strip(leaf, "leading-")]
      : undefined,
  "space/dimension": (leaf) => ["spacing", leaf],
  "radius/dimension": (leaf, _options, radii) => [
    "radius",
    radii.get(leaf) ?? leaf,
  ],
  "size/dimension": (leaf, options) =>
    options.spacingSizes.test(leaf) ? ["spacing", leaf] : undefined,
  "motion/cubicBezier": (leaf) => {
    const key = strip(leaf, "ease-");
    if (key === "in") {
      throw new Error(`${leaf}: no ease-in (DESIGN.md, the No Ease-In Rule)`);
    }
    return ["ease", key];
  },
  "motion/duration": (leaf) => ["duration", strip(leaf, "dur-")],
};

const groupOf = (token: ViewToken): string => token.path.split(".")[0] ?? "";
const kindOf = (token: ViewToken): string => `${groupOf(token)}/${token.type}`;

/** Every key the tokens make, by namespace, in token order. */
function themeKeys(
  tokens: ViewToken[],
  options: TailwindThemeOptions
): Map<string, ThemeKey[]> {
  const radii = radiusKeys(tokens.filter((t) => groupOf(t) === "radius"));
  const keys = new Map<string, ThemeKey[]>();
  for (const token of tokens) {
    const entry = KEY_RULES[kindOf(token)]?.(token.name, options, radii);
    if (entry) {
      const [ns, key] = entry;
      keys.set(ns, [...(keys.get(ns) ?? []), { key, token }]);
    }
  }
  return keys;
}

const DURATION_UTILITIES: ThemeUtility[] = [
  ["dur-*", ["transition-duration: --value(--duration-*);"]],
  ["anim-dur-*", ["animation-duration: --value(--duration-*);"]],
];

/** Every utility the tokens make: the composites, each type role's three forms, and the theme's own few. */
function themeUtilities(
  tokens: ViewToken[],
  options: TailwindThemeOptions,
  names: Set<string>
): ThemeUtility[] {
  const of = (kind: string) => tokens.filter((t) => kindOf(t) === kind);
  const roles = of("type/typography");
  const markup = options.markupRoles.map((role) => {
    const token = roles.find((t) => t.name === `type-${role}`);
    if (!token) {
      throw new Error(`markup role ${role}: no type-${role} token`);
    }
    return token;
  });
  const extras = (t: ViewToken) =>
    Object.entries(options.roleExtras[t.name] ?? {}).map(
      ([property, value]) => `${property}: ${value};`
    );
  return [
    ...of("color/gradient").map((t): ThemeUtility => [
      `bg-${t.name}`,
      [`background-image: var(--${t.name});`],
    ]),
    ...roles.map((t): ThemeUtility => [
      `type-${strip(t.name, "type-")}`,
      [...roleLonghands(t, names), ...extras(t)],
    ]),
    ...of("type/dimension")
      .filter((t) => t.name.startsWith("text-"))
      .map((t): ThemeUtility => [
        `text-size-${strip(t.name, "text-")}`,
        [`font-size: var(--${t.name});`],
      ]),
    ...markup.map((t): ThemeUtility => [
      `text-${strip(t.name, "type-")}`,
      markupRoleLonghands(t, tokens, names),
    ]),
    ...of("motion/transition").map((t): ThemeUtility => [
      t.name,
      [`transition: var(--${t.name});`],
    ]),
    ["liga-none", ["font-variant-ligatures: none;"]],
    [
      "no-scrollbar",
      [
        "scrollbar-width: none;",
        "&::-webkit-scrollbar {",
        "  display: none;",
        "}",
      ],
    ],
    ...(of("motion/duration").length > 0 ? DURATION_UTILITIES : []),
  ];
}

/**
 * The inline block: a key per token, then the literal weights, the defaults
 * and the keyframes they name. A key named as a token must read that token:
 * Tailwind writes the key into :root as well, before tokens.css, whose own
 * declaration must stay the one that holds.
 */
function inlineLines(
  keys: Map<string, ThemeKey[]>,
  switched: Set<string>,
  names: Set<string>,
  options: TailwindThemeOptions
): string[] {
  const inline: string[] = [];
  for (const [ns, list] of keys) {
    inline.push("");
    for (const { key, token } of list) {
      const name = `${ns}-${key}`;
      if (names.has(name) && name !== token.name) {
        throw new Error(
          `--${name} would read --${token.name}, but a token is named --${name}`
        );
      }
      if (switched.has(token.name)) {
        inline.push(
          "  /* Switches with its context: no literal maps to it. */"
        );
      }
      inline.push(`  --${name}: var(--${token.name});`);
    }
  }
  const literalWeights = Object.entries(options.literalWeights);
  if (literalWeights.length > 0) {
    inline.push("");
    for (const [key, value] of literalWeights) {
      inline.push(`  --font-weight-${key}: ${value};`);
    }
  }
  inline.push("");
  for (const [key, value] of Object.entries(options.defaults)) {
    inline.push(`  --${key}: ${value};`);
  }
  for (const [name, body] of Object.entries(options.keyframes)) {
    inline.push(
      `  @keyframes ${name} {`,
      ...body.split("\n").map((l) => `    ${l}`),
      "  }"
    );
  }
  return inline.slice(1);
}

/** The literals Tailwind reads at build time, by namespace: the numeric step, the breakpoints, the container widths. */
function themeLiterals(
  options: TailwindThemeOptions
): Map<string, [string, string][]> {
  return new Map([
    ["spacing", [["spacing", options.spacing]]],
    ["breakpoint", Object.entries(options.breakpoints)],
    [
      "container",
      [
        ...Object.entries(options.breakpoints),
        ...Object.entries(options.containers),
      ],
    ],
  ]);
}

/** The plain block: every namespace reset, then the literals. */
function plainLines(literals: Map<string, [string, string][]>): string[] {
  const plain = ["  --*: initial;"];
  for (const [ns, list] of literals) {
    plain.push("");
    for (const [key, value] of list) {
      plain.push(
        ns === "spacing"
          ? `  --${key}: ${value};`
          : `  --${ns}-${key}: ${value};`
      );
    }
  }
  return plain;
}

/**
 * The Tailwind v4 theme a token view makes: every Tailwind namespace reset
 * (`--*: initial`), then one `@theme inline` key per token that has a
 * utility (`--color-surface-raised: var(--surface-raised)`), so a utility
 * compiles to the token's own custom property and its contexts (dark, a
 * coarse pointer) switch it where tokens.css does. What a media or
 * container query reads is a literal in a plain `@theme`. Composite tokens
 * become `@utility` rules: a type role as longhands, a gradient as a
 * background image, a transition as itself. A key that shares a token's
 * name reads that token (Tailwind writes the key into `:root` too, and the
 * token's own declaration, later in the theme layer, must stay the one
 * that holds).
 */
export function tailwindThemeCss(
  view: TokenView,
  options: TailwindThemeOptions
): TailwindTheme {
  const tokens = view.tokens.filter(
    (token) =>
      (options.include ? options.include(token.original) : true) &&
      !options.retired.has(token.name)
  );
  const names = new Set(view.tokens.map((t) => t.name));
  const keys = themeKeys(tokens, options);
  const utilities = themeUtilities(tokens, options, names);
  const switched = switchedTokens(tokens, view.contexts);
  const literals = themeLiterals(options);
  const css = [
    options.header,
    "@theme {",
    ...plainLines(literals),
    "}",
    "",
    "@theme inline {",
    ...inlineLines(keys, switched, names, options),
    "}",
    ...utilities.flatMap(([name, body]) => [
      "",
      `@utility ${name} {`,
      ...body.map((line) => `  ${line}`),
      "}",
    ]),
    "",
  ].join("\n");
  return {
    css,
    keys,
    literals,
    switched,
    utilities: utilities.map(([name]) => name),
  };
}

/** A system built: its files settled and checked against the DTCG schemas, its view, its stylesheet. */
export interface BuiltTokens {
  /** The files settle changed, by path, with their new JSON. */
  changed: Map<string, unknown>;
  css: string;
  system: TokenSystem;
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
    return { changed: new Map(), css: tokensCss(view, options), system, view };
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
    view: settledView,
  };
}

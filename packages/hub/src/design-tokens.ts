/**
 * The one tokens.css generator: a DTCG token file (W3C Design Tokens Format
 * Module 2025.10, https://www.designtokens.org/tr/2025.10/format/) in, a
 * stylesheet of custom properties out, through Style Dictionary (one of the
 * spec's named translation tools). CawCo builds its own dashboard with it
 * (`apps/dashboard/scripts/build-tokens.ts`, `bun run tokens`) and every
 * project's `design/tokens.css` (design-system.ts), so both are made the
 * same way.
 *
 * A token's `$value` is its CSS value as written (`oklch(…)`, `clamp(…)`,
 * `color-mix(…)`), its light (or only) value. `$extensions["dev.cawco"]`
 * carries the scheme and media variants:
 *   dark     the dark value; a colour is emitted as light-dark(light, dark),
 *            any other token's dark value under the theme class (:root.dark)
 *   coarse   the value under (pointer: coarse)
 *   compact  the value under (pointer: coarse), (width < 640px)
 * References (`{group.name}`) are emitted as `var(--name)`, so the cascade
 * keeps resolving them at runtime under the active colour scheme. A custom
 * property is named for its token's last path segment, so two tokens may not
 * end in the same name.
 */
import StyleDictionary from "style-dictionary";
import type {
  DesignTokens,
  Dictionary,
  TransformedToken,
} from "style-dictionary/types";

/** The `$extensions` key CawCo reads its variants from (reverse domain, as the spec recommends). */
export const TOKENS_EXTENSION = "dev.cawco";

const MEDIA = {
  coarse: "(pointer: coarse)",
  compact: "(pointer: coarse), (width < 640px)",
} as const;

interface Variants {
  coarse?: string;
  compact?: string;
  dark?: string;
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

function cssValue(raw: string, names: Set<string>, where: string): string {
  return raw.replace(/\{([^}]+)\}/g, (_, ref: string) => {
    const name = ref.split(".").at(-1) ?? ref;
    if (!names.has(name)) {
      throw new Error(`${where}: unknown reference {${ref}}`);
    }
    return `var(--${name})`;
  });
}

/** The authored variants: Style Dictionary resolves references inside
    `$extensions` too, and a resolved value would freeze the light scheme. */
function variantsOf(token: TransformedToken): Variants {
  return (token.original.$extensions?.[TOKENS_EXTENSION] ?? {}) as Variants;
}

/** light-dark() takes colours only: any other token's dark value is set
    under the theme class (`:root.dark`). */
const isColour = (token: TransformedToken): boolean =>
  (token.$type ?? token.original.$type) === "color";

/** A token's authored `$value`, which must be the CSS text itself. */
function authored(token: TransformedToken): string {
  const value = token.original.$value;
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error(
      `${token.path.join(".")}: $value must be the CSS value as a string (oklch(…), clamp(…), 1rem), not ${JSON.stringify(value)}`
    );
  }
  return String(value);
}

function declaration(token: TransformedToken, names: Set<string>): string {
  const light = cssValue(authored(token), names, token.name);
  const { dark } = variantsOf(token);
  if (dark === undefined || !isColour(token)) {
    return `    --${token.name}: ${light};`;
  }
  return `    --${token.name}: light-dark(${light}, ${cssValue(dark, names, token.name)});`;
}

/** Refuses two tokens that would declare the same custom property. */
function uniqueNames(tokens: TransformedToken[]): Set<string> {
  const seen = new Map<string, string>();
  for (const token of tokens) {
    const path = token.path.join(".");
    const before = seen.get(token.name);
    if (before) {
      throw new Error(
        `${before} and ${path} both make --${token.name}: rename one, a custom property is named for its token's last segment`
      );
    }
    seen.set(token.name, path);
  }
  return new Set(seen.keys());
}

/** The `:root` block: every token's light (or only) value, colours as light-dark(). */
function rootBlock(
  tokens: TransformedToken[],
  names: Set<string>,
  colorScheme: boolean
): string[] {
  const lines = ["  :root {"];
  if (colorScheme) {
    lines.push("    color-scheme: light dark;");
  }
  for (const token of tokens) {
    if (token.$description) {
      lines.push(`    /* ${token.$description} */`);
    }
    lines.push(declaration(token, names));
  }
  lines.push("  }");
  return lines;
}

/** The blocks for one variant's tokens, under `opening`; none when no token has it. */
function variantBlock(
  tokens: TransformedToken[],
  names: Set<string>,
  key: keyof Variants,
  opening: string[],
  indent: string
): string[] {
  if (tokens.length === 0) {
    return [];
  }
  const closing = opening.map((_, i) => `${"  ".repeat(opening.length - i)}}`);
  return [
    "",
    ...opening,
    ...tokens.map(
      (token) =>
        `${indent}--${token.name}: ${cssValue(String(variantsOf(token)[key]), names, token.name)};`
    ),
    ...closing,
  ];
}

/** The Style Dictionary format that writes the stylesheet. */
export const tokensCssFormat =
  (options: TokensCssOptions) =>
  ({ dictionary }: { dictionary: Dictionary }): string => {
    const tokens = dictionary.allTokens.filter(options.include ?? (() => true));
    const names = uniqueNames(tokens);
    const darkOnly = tokens.filter(
      (t) => !isColour(t) && variantsOf(t).dark !== undefined
    );
    const media = (
      Object.entries(MEDIA) as [keyof typeof MEDIA, string][]
    ).flatMap(([key, query]) =>
      variantBlock(
        tokens.filter((t) => variantsOf(t)[key] !== undefined),
        names,
        key,
        [`  @media ${query} {`, "    :root {"],
        "      "
      )
    );
    return [
      options.header,
      `@layer ${options.layer} {`,
      ...rootBlock(tokens, names, options.colorScheme ?? false),
      ...variantBlock(darkOnly, names, "dark", ["  :root.dark {"], "    "),
      ...media,
      "}",
      "",
    ].join("\n");
  };

/**
 * The stylesheet a DTCG token tree makes, in memory. Throws, with Style
 * Dictionary's or the format's sentence, on a tree that is not DTCG, a
 * reference to no token, a `$value` that is not CSS text, or two tokens
 * making one custom property.
 */
export async function tokensCss(
  tokens: DesignTokens,
  options: TokensCssOptions
): Promise<string> {
  const sd = new StyleDictionary({
    tokens,
    usesDtcg: true,
    log: { verbosity: "silent", warnings: "error" },
    hooks: {
      transforms: {
        "name/css-leaf": { type: "name", transform: cssLeafName },
      },
      formats: { "css/cawco-tokens": tokensCssFormat(options) },
    },
    platforms: {
      css: {
        transforms: ["name/css-leaf"],
        files: [{ destination: "tokens.css", format: "css/cawco-tokens" }],
      },
    },
  });
  const [file] = await sd.formatPlatform("css");
  if (typeof file?.output !== "string") {
    throw new Error("the token file made no stylesheet");
  }
  return file.output;
}

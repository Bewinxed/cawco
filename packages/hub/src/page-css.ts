/**
 * The stylesheet of a page the hub builds at runtime (the canvas host, the
 * decision host): its sheets, in cascade order, compiled into one by
 * Lightning CSS at the product's one CSS floor (css-target.ts), the floor
 * the dashboard's Vite build minifies at. What those browsers draw natively
 * (`light-dark()`, `oklch()`, nesting, range media queries) stays as written.
 *
 * Bun bundles these pages' JS only. Its CSS bundler takes no browser
 * targets (oven-sh/bun#40361, open: "Bun.build has no way to set CSS
 * browser targets … there is no way to opt out"), so a sheet that reached it
 * came out lowered to Bun's own browser default (bundle-css-guard.ts).
 *
 * Lightning CSS is loaded on the first compile, never when this module is
 * imported: the standalone binary carries every page prebuilt and never
 * compiles one, so it never loads it (build-binary.ts leaves it out).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { CSS_BROWSERS } from "@cawco/core/css-target";

/**
 * One sheet of a page: a file by its absolute path, or text a compiler hands
 * over (a Svelte component's styles) under a name of its own.
 */
export type Sheet = string | { name: string; css: string };

/** The compile's entry: one `@import` per sheet, in cascade order. */
const ENTRY = "cawco:page.css";

const nameOf = (sheet: Sheet) =>
  typeof sheet === "string" ? sheet : sheet.name;

/** The media types of the files a sheet may inline (`inline` below). */
const INLINE_TYPES: Record<string, string> = { woff2: "font/woff2" };

/** `file` as a `data:` URL of its own type. */
const dataUrl = (file: string): string => {
  const type = INLINE_TYPES[file.slice(file.lastIndexOf(".") + 1)];
  if (!type) {
    throw new Error(`${file}: no media type to inline it as`);
  }
  return `data:${type};base64,${readFileSync(file).toString("base64")}`;
};

/**
 * `sheets` compiled into one stylesheet, minified, in their order: each
 * `@import`ed in turn by Lightning CSS's bundler, so a sheet's own
 * `@import`s are inlined where they stand. Each `url()` written exactly as a
 * key of `inline` becomes its file (the key's value, an absolute path) as a
 * `data:` URL; every other `url()` stays as written. Throws on a sheet
 * Lightning CSS can't parse, and on a key of `inline` no sheet wrote.
 */
export async function compileSheets(
  sheets: readonly Sheet[],
  inline: ReadonlyMap<string, string> = new Map()
): Promise<string> {
  const [{ bundleAsync, browserslistToTargets }, { default: browserslist }] =
    await Promise.all([import("lightningcss"), import("browserslist")]);
  const inlined = new Set<string>();
  const texts = new Map(
    sheets.flatMap((sheet) =>
      typeof sheet === "string" ? [] : [[sheet.name, sheet.css] as const]
    )
  );
  const entry = sheets
    .map((sheet) => `@import ${JSON.stringify(nameOf(sheet))};`)
    .join("\n");
  const { code } = await bundleAsync({
    filename: ENTRY,
    minify: true,
    targets: browserslistToTargets(browserslist(CSS_BROWSERS)),
    resolver: {
      read: (path) =>
        path === ENTRY
          ? entry
          : (texts.get(path) ?? readFileSync(path, "utf8")),
      resolve: (specifier, from) =>
        from === ENTRY ? specifier : resolve(dirname(from), specifier),
    },
    visitor: {
      Url(url) {
        const file = inline.get(url.url);
        if (!file) {
          return;
        }
        inlined.add(url.url);
        return { ...url, url: dataUrl(file) };
      },
    },
  });
  const unseen = [...inline.keys()].filter((url) => !inlined.has(url));
  if (unseen.length > 0) {
    throw new Error(
      `No sheet writes these url()s to inline, so they would be fetched: ${unseen.join(", ")}`
    );
  }
  return new TextDecoder().decode(code);
}

/** A selector's component, as Lightning CSS's visitor hands it over. */
type SelectorPart = import("lightningcss").Selector[number];

/** `part`, and every selector inside it (`:is()`, `:where()`, `:not()`, `:has()`), with each `:root` made `[root]`. */
function rootedPart(part: SelectorPart, root: string): SelectorPart {
  if (part.type !== "pseudo-class") {
    return part;
  }
  if (part.kind === "root") {
    return { type: "attribute", name: root };
  }
  if (
    (part.kind === "is" ||
      part.kind === "where" ||
      part.kind === "not" ||
      part.kind === "has") &&
    part.selectors
  ) {
    return {
      ...part,
      selectors: part.selectors.map((one) =>
        one.map((inner) => rootedPart(inner, root))
      ),
    };
  }
  return part;
}

/**
 * A `rem` length in a minified sheet's declaration values: a number after
 * a value's `:`, a space, a comma, an open parenthesis or an operator.
 * Never one after `=`, `<` or `>` (a media or container query's prelude,
 * which takes no `var()`), nor after `[` (an escaped class name).
 */
const REM_LENGTH = /(?<=[:\s,(*/+])(-?(?:\d+\.?\d*|\.\d+))rem(?![\w-])/gu;

/**
 * Compiled sheet `css` for a shadow root whose document root is the element
 * carrying attribute `root` (the decision host's dials, core dials-root.ts):
 * every `:root` in its selectors becomes `[root]`, so the house's tokens,
 * scheme and `dark`/`light` variants stand on that element and none on the
 * page's own root; and its registered properties' initial values stand as
 * declarations, Tailwind's own fallback for a browser without `@property`
 * (its `properties` layer's `@supports`) taken unconditionally, as a shadow
 * root's `@property` rules register nothing (Chromium 156 reads an
 * `@property --x` in a shadow root's sheet as unset: tailwindlabs/tailwindcss
 * #15005, open, "@property isn't supported in shadow roots"). The
 * `@property` rules themselves are dropped. A `rem` is the page's root's
 * font size, which no shadow root has its own of: each length in rem
 * becomes that many of custom property `rem` (core dials-root.ts
 * `DIALS_REM`), which the shadow's host sets.
 */
export async function shadowSheet(
  css: string,
  root: string,
  rem: string
): Promise<string> {
  const [{ transform, browserslistToTargets }, { default: browserslist }] =
    await Promise.all([import("lightningcss"), import("browserslist")]);
  const { code } = transform({
    filename: "shadow.css",
    code: new TextEncoder().encode(css),
    minify: true,
    targets: browserslistToTargets(browserslist(CSS_BROWSERS)),
    visitor: {
      Rule: {
        property: () => [],
        // Every other layer left as it stands: a layer handed back whole fails to deserialize in Lightning CSS 1.33.0 ("expected an object-like struct named Specifier").
        "layer-block": (rule) =>
          rule.value.name?.join(".") === "properties"
            ? {
                ...rule,
                value: {
                  ...rule.value,
                  rules: rule.value.rules.flatMap((one) =>
                    one.type === "supports" ? one.value.rules : [one]
                  ),
                },
              }
            : undefined,
      },
      Selector: (selector) => selector.map((part) => rootedPart(part, root)),
    },
  });
  return new TextDecoder()
    .decode(code)
    .replace(REM_LENGTH, (_, figure: string) => `calc(${figure}*var(${rem}))`);
}

/** A bundle's emitted file: a `Bun.BuildArtifact`. */
interface Emitted extends Blob {
  path: string;
}

const DOT_SLASH = /^\.\//u;

/**
 * A page's files by name: what Bun emitted (its JS, chunks and files) and
 * the page's stylesheet as `host.css`. Throws when Bun emitted a stylesheet
 * of its own: a sheet reached its CSS bundler (an `import "x.css"` in the
 * page's code), and goes in the page's sheet list instead.
 */
export function pageFiles(
  page: string,
  outputs: readonly Emitted[],
  css: string
): Map<string, Blob> {
  const files = new Map<string, Blob>();
  for (const output of outputs) {
    const name = output.path.replace(DOT_SLASH, "");
    if (name.endsWith(".css")) {
      throw new Error(
        `${page}: Bun's CSS bundler emitted ${name}; a stylesheet imported from the page's code goes in its sheet list (Lightning CSS, hub page-css.ts) instead`
      );
    }
    files.set(name, output);
  }
  files.set("host.css", new Blob([css], { type: "text/css" }));
  return files;
}

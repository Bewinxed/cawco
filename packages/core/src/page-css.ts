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
import { CSS_BROWSERS } from "./css-target";

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
        `${page}: Bun's CSS bundler emitted ${name}; a stylesheet imported from the page's code goes in its sheet list (Lightning CSS, core page-css.ts) instead`
      );
    }
    files.set(name, output);
  }
  files.set("host.css", new Blob([css], { type: "text/css" }));
  return files;
}

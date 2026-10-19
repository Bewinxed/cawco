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

/**
 * `sheets` compiled into one stylesheet, minified, in their order: each
 * `@import`ed in turn by Lightning CSS's bundler, so a sheet's own
 * `@import`s are inlined where they stand. Throws on a sheet Lightning CSS
 * can't parse, naming it.
 */
export async function compileSheets(sheets: readonly Sheet[]): Promise<string> {
  const [{ bundleAsync, browserslistToTargets }, { default: browserslist }] =
    await Promise.all([import("lightningcss"), import("browserslist")]);
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
  });
  return new TextDecoder().decode(code);
}

/** A bundle's emitted file: a `Bun.BuildArtifact`. */
interface Emitted extends Blob {
  path: string;
}

const DOT_SLASH = /^\.\//;

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

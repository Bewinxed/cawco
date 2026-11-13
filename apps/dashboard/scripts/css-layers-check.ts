/**
 * `bun run check`'s copy of the production build's layers guard (vite.config.ts
 * `vendorComponentSheets`, core css-layers.ts `layerFaults`): every style rule
 * the house writes stands in a cascade layer, and every layer it names is one
 * app.html's order states. The build stops on the same faults, only at
 * release (6286c7a37 passed every merge check and failed the release build on
 * two `:global` rules in glide-tip.svelte).
 *
 * It reads the house's sheets as they enter the bundle, without bundling:
 * - each `.svelte` under src/ with a `<style>`, compiled by Svelte as the
 *   build compiles it (its CSS apart), so `:global(…)` comes out as the bare
 *   rule the bundle holds;
 * - each `.css` under src/ a component or module imports, compiled by
 *   Tailwind with its `@import`s inlined, as `@tailwindcss/vite` compiles it.
 * The libraries' sheets are not read: they enter through the build's own
 * transform, which puts them in `vendor`, and only the build sees them.
 */
import { readFileSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import {
  documentLayers,
  layerFaults,
  type NamedSheet,
} from "@cawco/core/css-layers";
import { compile as compileTailwind } from "@tailwindcss/node";
import { compile as compileSvelte } from "svelte/compiler";
import { repoFiles } from "../../../scripts/lib/repo-files";

// Read at run time beyond its imports; check.ts keys the check on them.
export const checkReads = ["apps/dashboard/src/"];

const ROOT = join(import.meta.dir, "..");
const SRC = join(ROOT, "src");
const STYLE = /<style\b/u;
const CODE = /\.(?:[cm]?[jt]s|svelte)$/u;
/** A static or dynamic import of a stylesheet: `import "x.css"`, `import("x.css")`. */
const CSS_IMPORT = /\bimport\s*\(?\s*["']([^"'\n?]+\.css)["']/gu;
/** The dashboard's `imports` (package.json): `#lib/*` is `./src/lib/*`. */
const LIB = "#lib/";

const files = repoFiles(["src"], ROOT);

/** The house stylesheet a module's import names, or none for a library's. */
const houseSheet = (file: string, specifier: string): string | undefined => {
  if (specifier.startsWith(LIB)) {
    return join("src/lib", specifier.slice(LIB.length));
  }
  if (specifier.startsWith(".")) {
    return normalize(join(dirname(file), specifier));
  }
};

const sources = files.filter((file) => CODE.test(file));
const components: NamedSheet[] = [];
const entries = new Set<string>();
for (const file of sources) {
  const source = readFileSync(join(ROOT, file), "utf8");
  for (const [, specifier] of source.matchAll(CSS_IMPORT)) {
    const sheet = houseSheet(file, specifier as string);
    if (sheet) {
      entries.add(sheet);
    }
  }
  if (file.endsWith(".svelte") && STYLE.test(source)) {
    const { css } = compileSvelte(source, {
      filename: join(ROOT, file),
      generate: "client",
      css: "external",
      dev: false,
      experimental: { async: true },
    });
    if (css) {
      components.push({ name: file, css: css.code });
    }
  }
}

const stylesheets: NamedSheet[] = await Promise.all(
  [...entries].sort().map(async (file) => {
    const path = join(ROOT, file);
    const compiler = await compileTailwind(readFileSync(path, "utf8"), {
      base: dirname(path),
      from: path,
      onDependency: () => undefined,
    });
    return { name: file, css: compiler.build([]) };
  })
);

const fault = await layerFaults(
  [...stylesheets, ...components],
  documentLayers(readFileSync(join(SRC, "app.html"), "utf8"))
);
if (fault) {
  console.error(fault);
  process.exit(1);
}
console.log(
  `css layers: ${stylesheets.length} stylesheets (${stylesheets.map((s) => relative("src", s.name)).join(", ")}) and ${components.length} component style(s), 0 unlayered rules, every layer in app.html's order`
);

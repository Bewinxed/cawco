/**
 * Serves an import written `with { type: "text" }` as the file's text, the
 * way Bun does: the import is rewritten to Vite's own `?raw`. A module the
 * binary and the browser both load (the theme reader,
 * `@cawco/design-tokens/tailwind-theme`) embeds a stylesheet's text this way,
 * and Bun reads no `?raw`.
 *
 * Vite's dev server hands plugins no import attributes (its import analysis
 * resolves a specifier alone), so the attribute is read off the module's own
 * imports by `es-module-lexer`, the lexer Vite reads imports with. Delete
 * this file, and its line in vite.config.ts, once Vite serves
 * `type: "text"` itself (Rolldown's RFC, rolldown/rolldown discussion #11217).
 */
import { init, parse } from "es-module-lexer";
import MagicString from "magic-string";
import type { Plugin } from "vite";

const SCRIPT = /\.[cm]?[jt]sx?$/u;

/** Whether a static import's attributes are exactly `{ type: "text" }`. */
const isText = (
  attributes: readonly (readonly [string, string])[] | null
): boolean =>
  attributes?.length === 1 &&
  attributes[0]?.[0] === "type" &&
  attributes[0][1] === "text";

export function textImports(): Plugin {
  return {
    name: "cawco:text-imports",
    enforce: "pre",
    async transform(code, id) {
      const file = id.split("?")[0] ?? id;
      if (!(SCRIPT.test(file) && code.includes("with"))) {
        return;
      }
      await init;
      const [imports] = parse(code, file);
      const out = new MagicString(code);
      for (const one of imports) {
        if (
          one.type !== "static" ||
          one.specifier === undefined ||
          !isText(one.attributes)
        ) {
          continue;
        }
        const joiner = one.specifier.includes("?") ? "&" : "?";
        out.overwrite(one.start, one.end, `${one.specifier}${joiner}raw`);
        // The attributes and the `with` before them go: Vite reads a plain import.
        out.remove(
          code.lastIndexOf("with", one.attributesStart),
          one.importEnd
        );
      }
      return out.hasChanged()
        ? { code: out.toString(), map: out.generateMap({ hires: "boundary" }) }
        : undefined;
    },
  };
}

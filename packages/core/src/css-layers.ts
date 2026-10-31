/**
 * The one guard every sheet built over the house's cascade layers is held
 * to: the dashboard's assets (vite.config.ts `vendorComponentSheets`) and
 * the decision host's (decision-host.ts). A module of its own with no
 * relative imports, so the dashboard's Vite config loads it under Node as
 * written. PostCSS is loaded on the first check, so the standalone binary
 * never loads it.
 */

/**
 * The house's cascade layers, in order: Tailwind's `properties` (its
 * fallbacks for `@property`, which it emits ahead of everything), then the
 * ones app.css states. A layer's place is where a document first
 * names it, so the order holds only if the first sheet a page parses says
 * it whole: {@link withLayerOrder} heads every built sheet with it.
 */
const HOUSE_LAYERS =
  "properties, theme, base, vendor, components, utilities, overrides";

const ORDER_STATEMENT = `@layer ${HOUSE_LAYERS};`;

/**
 * `css` headed by the house's layer order. A page links its route's sheets
 * in whatever order its chunks fall: one that opens on `@layer vendor { … }`
 * (svelte-sonner's) parsed first put `vendor` under `base`, and Tailwind's
 * preflight took every toast's padding and its buttons' fill. Every sheet
 * saying the order first, any one of them can come first.
 */
export const withLayerOrder = (css: string): string =>
  css.startsWith(ORDER_STATEMENT) ? css : `${ORDER_STATEMENT}${css}`;

/**
 * Each style rule in `css` that no `@layer` holds, as its selector: one
 * would outrank every rule of the house whatever its weight. `@font-face`,
 * `@property` and `@keyframes` hold no style rules, and a keyframe's blocks
 * are not style rules either.
 */
export async function unlayeredRules(css: string): Promise<string[]> {
  const { default: postcss } = await import("postcss");
  const found: string[] = [];
  postcss.parse(css).walkRules((rule) => {
    for (let at = rule.parent; at && at.type !== "root"; at = at.parent) {
      if (
        at.type === "atrule" &&
        "name" in at &&
        (at.name === "layer" || String(at.name).endsWith("keyframes"))
      ) {
        return;
      }
    }
    found.push(rule.selector.replace(/\s+/gu, " "));
  });
  return found;
}

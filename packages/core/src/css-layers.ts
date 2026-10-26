/**
 * The one guard every sheet built over the house's cascade layers is held
 * to: the dashboard's assets (vite.config.ts `vendorComponentSheets`) and
 * the decision host's (decision-host.ts). A module of its own with no
 * relative imports, so the dashboard's Vite config loads it under Node as
 * written. PostCSS is loaded on the first check, so the standalone binary
 * never loads it.
 */

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

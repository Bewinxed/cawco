/**
 * The guards every sheet built over the house's cascade layers is held to:
 * no style rule outside a layer, for the dashboard's assets (vite.config.ts
 * `vendorComponentSheets`, and its house sheets before any build:
 * apps/dashboard/scripts/css-layers-check.ts) and the decision host's (decision-host.ts); and
 * for the dashboard, no layer its page template (app.html) leaves out of the
 * order it states before any sheet. A module of its own with no relative
 * imports, so the dashboard's Vite config loads it under Node as written.
 * PostCSS is loaded on the first check, so the standalone binary never loads
 * it.
 */

/** A `<style>` element's contents, from its opening tag to its closing one. */
const STYLE_ELEMENT = /<style>([^<]*)<\/style>/gu;
const LAYER_STATEMENT = /^@layer\s+([\w-]+(?:\s*,\s*[\w-]+)*)\s*;$/u;
/** Where Kit links a route's sheets in app.html. */
const KIT_HEAD = "%sveltekit.head%";

/**
 * The cascade layers a page template declares ahead of every sheet it
 * links, in order: the `@layer` statement standing alone in a `<style>` of
 * its own before Kit's head, where a route's sheets are linked. A document
 * sorts its layers "by the order in which they first are declared"
 * (https://drafts.csswg.org/css-cascade-5/#layer-ordering), reading its
 * sheets "in tree order"
 * (https://drafts.csswg.org/cssom/#documentorshadowroot-document-or-shadow-root-css-style-sheets),
 * so the order stated there holds whatever order the sheets after it are
 * linked or arrive in, and whatever any of them names first. Throws when
 * the template states none there.
 */
export function documentLayers(html: string): string[] {
  const head = html.indexOf(KIT_HEAD);
  for (const style of html.matchAll(STYLE_ELEMENT)) {
    if (head === -1 || style.index > head) {
      break;
    }
    const names = LAYER_STATEMENT.exec(style[1]?.trim() ?? "")?.[1];
    if (names) {
      return names.split(",").map((name) => name.trim());
    }
  }
  throw new Error(
    `css layers: the page template states no \`@layer\` order in a <style> of its own ahead of ${KIT_HEAD}`
  );
}

/**
 * Each cascade layer `css` names outside every other layer, in the order it
 * first names them: the layers that take a place in the document's order. A
 * nested layer (`vendor.calendar`) takes its place inside its parent's, so
 * it counts as its parent.
 */
async function layersNamed(css: string): Promise<string[]> {
  const { default: postcss } = await import("postcss");
  const named: string[] = [];
  postcss.parse(css).walkAtRules("layer", (rule) => {
    for (let at = rule.parent; at && at.type !== "root"; at = at.parent) {
      if (at.type === "atrule" && "name" in at && at.name === "layer") {
        return;
      }
    }
    for (const name of rule.params.split(",")) {
      const [outer] = name.trim().split(".");
      if (outer && !named.includes(outer)) {
        named.push(outer);
      }
    }
  });
  return named;
}

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

/** A sheet the guards read: a name its faults are reported by, and its CSS. */
export interface NamedSheet {
  css: string;
  name: string;
}

/**
 * What fails the dashboard's sheets, as the error the build and `bun run
 * check` both stop with: first each layer `order` (the page template's,
 * {@link documentLayers}) leaves out, then each style rule no layer holds,
 * every one named by its sheet. Undefined when every sheet passes.
 */
export async function layerFaults(
  sheets: NamedSheet[],
  order: string[]
): Promise<string | undefined> {
  const undeclared = (
    await Promise.all(
      sheets.map(async ({ name, css }) =>
        (await layersNamed(css))
          .filter((layer) => !order.includes(layer))
          .map((layer) => `${name}: @layer ${layer}`)
      )
    )
  ).flat();
  if (undeclared.length > 0) {
    return `css layers: ${undeclared.length} layer(s) app.html's order leaves out; a layer joins its <style> where it belongs:\n${undeclared.join("\n")}`;
  }
  const unlayered = (
    await Promise.all(
      sheets.map(async ({ name, css }) =>
        (await unlayeredRules(css)).map((selector) => `${name}: ${selector}`)
      )
    )
  ).flat();
  if (unlayered.length > 0) {
    return `css layers: ${unlayered.length} unlayered style rule(s); a library's sheet joins vendorComponentSheets' list, a house rule moves into its layer:\n${unlayered.join("\n")}`;
  }
}

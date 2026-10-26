/**
 * The CSS floor: the one target every stylesheet the product ships is
 * compiled at. The dashboard's goes through Vite (apps/dashboard
 * vite.config.ts `build.cssTarget`); the pages the hub builds at runtime go
 * through Lightning CSS (page-css.ts). Neither may lower what these
 * browsers draw natively.
 *
 * Lightning CSS lowers what a target lacks: `light-dark()` would become
 * variables keyed on a `prefers-color-scheme` media query, which ignores the
 * app's theme class and breaks every relative colour built on a token.
 * These are the releases where the stylesheets' newest features ship
 * natively: @scope (Firefox 146) and a relative colour whose origin is
 * light-dark() or currentColor (Chrome 131, Safari 18).
 */

/** The floor in esbuild's form, which Vite's `build.cssTarget` takes. */
export const CSS_TARGET = [
  "chrome131",
  "edge131",
  "firefox146",
  "safari18",
  "ios18",
];

const NAMED_VERSION = /^([a-z]+)(\d[\d.]*)$/u;

/**
 * The same floor as browserslist queries, for Lightning CSS's
 * `browserslistToTargets`: esbuild's `ios` is browserslist's `ios_saf`, as
 * Vite maps it for its own Lightning CSS minify (vite `convertTargets`).
 */
export const CSS_BROWSERS = CSS_TARGET.map((target) => {
  const [, name, version] = NAMED_VERSION.exec(target) ?? [];
  if (!(name && version)) {
    throw new Error(`CSS_TARGET's "${target}" is not a browser and version`);
  }
  return `${name === "ios" ? "ios_saf" : name} ${version}`;
});

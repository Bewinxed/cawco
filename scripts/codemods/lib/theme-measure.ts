/**
 * What a theme text measures, as scripts/token-contrast-check.ts measures it
 * (the hub's CssEvaluator over the theme's `@theme static` block and its
 * dark-scheme overrides), and a colour's OKLCH hue angle. Shared by
 * theme-unify.ts and theme-audit.ts.
 */
import Color from "colorjs.io";
import postcss from "postcss";
import {
  CssEvaluator,
  type CssToken,
} from "../../../packages/hub/src/design-css";

const refs = (value: string) => value.replace(/var\(--([\w-]+)\)/gu, "{$1}");

/** The evaluator over a theme text; `overrides` set a light value (and drop its dark one). */
export const evaluatorOver = (
  themeText: string,
  overrides: Record<string, string> = {}
) => {
  const light = new Map<string, string>();
  const dark = new Map<string, string>();
  postcss.parse(themeText).walkDecls((decl) => {
    const rule = decl.parent;
    if (!decl.prop.startsWith("--")) {
      return;
    }
    if (
      rule?.type === "atrule" &&
      rule.name === "theme" &&
      rule.params === "static"
    ) {
      light.set(decl.prop.slice(2), refs(decl.value));
    } else if (
      rule?.type === "rule" &&
      rule.selectors.includes('[data-scheme="dark"]')
    ) {
      dark.set(decl.prop.slice(2), refs(decl.value));
    }
  });
  for (const [k, v] of Object.entries(overrides)) {
    light.set(k, v);
    dark.delete(k);
  }
  const lookup = (path: string): CssToken | undefined => {
    const leaf = path.split(".").at(-1) ?? path;
    for (const name of [`color-${leaf}`, leaf]) {
      const css = light.get(name);
      if (css !== undefined) {
        const variant = dark.get(name);
        return {
          css,
          name,
          variants: variant === undefined ? {} : { dark: variant },
        };
      }
    }
  };
  return new CssEvaluator(lookup, new Set(["dark"]));
};
export const clip = (c: Color) =>
  new Color(
    "srgb",
    c
      .to("srgb")
      .coords.map((v) => Math.min(1, Math.max(0, Number(v ?? 0)))) as [
      number,
      number,
      number,
    ]
  );
/** WCAG contrast of two colour tokens (names without `--color-`) in a scheme. */
export const contrastBetween = (
  ev: CssEvaluator,
  fg: string,
  bg: string,
  mode: "base" | "dark"
) =>
  Color.contrastWCAG21(
    clip(ev.colourOf(`color.${fg}`, mode, "fg")),
    clip(ev.colourOf(`color.${bg}`, mode, "bg"))
  );

const HUE = /oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)/u;
/** The hue angle of a value's first (or second) `oklch()`. */
export const hueOf = (css: string, half: 0 | 1 = 0) =>
  Number([...css.matchAll(new RegExp(HUE, "gu"))][half]?.[3]);
export const circular = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
};

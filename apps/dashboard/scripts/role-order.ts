/**
 * Holds the type roles' place in Tailwind's utility order. A `type-<role>`
 * utility is the `font` shorthand (packages/hub/src/design-tokens.ts), so
 * every utility that writes a font longhand on the same element (`num`,
 * `font-medium`, `leading-*`, `tracking-*`, `text-size-*` …) must come after
 * it, as a declaration after the shorthand did in a component's rule.
 * Tailwind's property order has no slot for `font`; the roles take one
 * through `--tw-sort`, Tailwind's own marker, which a release could change.
 * This compiles app.css with the dashboard's Tailwind and answers each pair
 * in the wrong order. `bun scripts/build-tokens.ts --check` runs it.
 */
import { dirname, resolve } from "node:path";
import { compile } from "@tailwindcss/node";
import type { TailwindTheme } from "../../../packages/hub/src/design-tokens";

const APP_CSS = "src/app.css";
/** The font utilities no theme key names: Tailwind's family form, and app.css's own. */
const FONT_UTILITIES = [
  "font-(family-name:--font-mono)",
  "num",
  "liga-none",
  "mono-figure",
];
/** The theme namespaces whose keys make font longhand utilities, by prefix. */
const FONT_NAMESPACES: Record<string, string> = {
  font: "font-",
  "font-weight": "font-",
  leading: "leading-",
  tracking: "tracking-",
};
const NOT_IDENT = /[^a-zA-Z0-9_-]/g;
const selector = (candidate: string) =>
  `.${candidate.replace(NOT_IDENT, (ch) => `\\${ch}`)} {`;

/** Every `type-<role>` that the compiled CSS places after a font longhand utility, as "role after utility". */
export async function roleOrderDrift(theme: TailwindTheme): Promise<string[]> {
  const roles = theme.utilities.filter((u) => u.startsWith("type-"));
  const longhands = [
    ...FONT_UTILITIES,
    ...theme.utilities.filter((u) => u.startsWith("text-size-")),
    ...Object.entries(FONT_NAMESPACES).flatMap(([ns, prefix]) =>
      (theme.keys.get(ns) ?? []).map(({ key }) => `${prefix}${key}`)
    ),
  ];
  const compiler = await compile(await Bun.file(APP_CSS).text(), {
    base: resolve(dirname(APP_CSS)),
    onDependency: () => undefined,
  });
  const css = compiler.build([...roles, ...longhands]);
  const at = (candidate: string) => css.indexOf(selector(candidate));
  const missing = [...roles, ...longhands].filter((c) => at(c) < 0);
  if (missing.length > 0) {
    return [`no rule compiled for ${missing.join(", ")}`];
  }
  const firstLonghand = Math.min(...longhands.map(at));
  return roles
    .filter((role) => at(role) > firstLonghand)
    .map(
      (role) =>
        `${role} sorts after ${longhands.filter((l) => at(l) < at(role)).join(", ")}`
    );
}

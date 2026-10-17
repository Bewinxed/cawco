/**
 * Holds the `font` shorthand utilities' place in Tailwind's utility order. A
 * `type-<role>` utility is the `font` shorthand (packages/hub/src/
 * design-tokens.ts), as are app.css's `font-inherit` and `font-mono-meta`,
 * so every utility that writes a font longhand on the same element (`num`,
 * `font-medium`, `leading-*`, `tracking-*`, `text-size-*` …) must come after
 * it, as a declaration after the shorthand did in a component's rule.
 * Tailwind's property order has no slot for `font`; these take one through
 * `--tw-sort`, Tailwind's own marker, which a release could change. This
 * compiles app.css with the dashboard's Tailwind and answers each shorthand
 * placed after a longhand. `bun scripts/build-tokens.ts --check` runs it.
 */
import { dirname, resolve } from "node:path";
import { compile } from "@tailwindcss/node";
import type { TailwindTheme } from "../../../packages/hub/src/design-tokens";

const APP_CSS = "src/app.css";
/** Tailwind's own family form, which no key or `@utility` names. */
const TAILWIND_FONT_UTILITIES = ["font-(family-name:--font-mono)"];
/** The theme namespaces whose keys make font longhand utilities, by prefix. */
const FONT_NAMESPACES: Record<string, string> = {
  font: "font-",
  "font-weight": "font-",
  leading: "leading-",
  tracking: "tracking-",
};
/** A top-level `@utility` block: its name and body. */
const UTILITY = /^@utility ([\w-]+) \{\n([\s\S]*?)^\}/gm;
const SHORTHAND = /^\s*font:/m;
const LONGHAND = /^\s*(font-[a-z-]+|line-height|letter-spacing):/m;
const NOT_IDENT = /[^a-zA-Z0-9_-]/g;
const selector = (candidate: string) =>
  `.${candidate.replace(NOT_IDENT, (ch) => `\\${ch}`)} {`;

/** Every `font` shorthand utility that the compiled CSS places after a font longhand utility. */
export async function fontOrderDrift(theme: TailwindTheme): Promise<string[]> {
  const appCss = await Bun.file(APP_CSS).text();
  const own = [...appCss.matchAll(UTILITY)];
  const shorthands = [
    ...theme.utilities.filter((u) => u.startsWith("type-")),
    ...own.filter(([, , body]) => SHORTHAND.test(body)).map(([, name]) => name),
  ];
  const longhands = [
    ...TAILWIND_FONT_UTILITIES,
    ...theme.utilities.filter(
      (u) => u.startsWith("text-size-") || u === "liga-none"
    ),
    ...Object.entries(FONT_NAMESPACES).flatMap(([ns, prefix]) =>
      (theme.keys.get(ns) ?? []).map(({ key }) => `${prefix}${key}`)
    ),
    ...own
      .filter(([, , body]) => !SHORTHAND.test(body) && LONGHAND.test(body))
      .map(([, name]) => name),
  ];
  const compiler = await compile(appCss, {
    base: resolve(dirname(APP_CSS)),
    onDependency: () => undefined,
  });
  const css = compiler.build([...shorthands, ...longhands]);
  const at = (candidate: string) => css.indexOf(selector(candidate));
  const missing = [...shorthands, ...longhands].filter((c) => at(c) < 0);
  if (missing.length > 0) {
    return [`no rule compiled for ${missing.join(", ")}`];
  }
  const firstLonghand = Math.min(...longhands.map(at));
  return shorthands
    .filter((short) => at(short) > firstLonghand)
    .map(
      (short) =>
        `${short} sorts after ${longhands.filter((l) => at(l) < at(short)).join(", ")}`
    );
}

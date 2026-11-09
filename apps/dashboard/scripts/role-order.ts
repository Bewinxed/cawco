/**
 * Holds the `font` shorthand utilities' place in Tailwind's utility order. A
 * `type-<role>` utility is the `font` shorthand (packages/design-tokens/src/
 * design-tokens.ts), as are design.css's `font-inherit` and `font-mono-meta`,
 * so every utility that writes a font longhand on the same element (`num`,
 * `font-medium`, `leading-*`, `tracking-*`, `text-size-*` …) must come after
 * it, as a declaration after the shorthand did in a component's rule.
 * Tailwind's property order has no slot for `font`; these take one through
 * `--tw-sort`, Tailwind's own marker, which a release could change. This
 * compiles app.css with the dashboard's Tailwind and answers each shorthand
 * placed after a longhand, from the keys and utilities in theme.css.
 * `bun run check` runs it.
 */
import { dirname, resolve } from "node:path";
import { compile } from "@tailwindcss/node";

const APP_CSS = "src/app.css";
/** The tokens and the utilities over them. */
const THEME = "src/lib/tokens/theme.css";
/** The house's own `@utility` definitions, which app.css imports. */
const DESIGN_CSS = "src/design.css";
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
const UTILITY = /^@utility ([\w-]+) \{\n([\s\S]*?)^\}/gmu;
/**
 * A declaration on the utility's own element: the body's first level (two
 * spaces, as `bun fmt` writes it). One inside a nested rule (`& .prose {
 * font-size: inherit }`) styles a descendant, so it never meets a font
 * utility on the same element.
 */
const SHORTHAND = /^ {2}font:/mu;
const LONGHAND = /^ {2}(font-[a-z-]+|line-height|letter-spacing):/mu;
const NOT_IDENT = /[^a-zA-Z0-9_-]/gu;
const selector = (candidate: string) =>
  `.${candidate.replace(NOT_IDENT, (ch) => `\\${ch}`)} {`;

/** Every `font` shorthand utility that the compiled CSS places after a font longhand utility. */
async function fontOrderDrift(): Promise<string[]> {
  const themeCss = await Bun.file(THEME).text();
  const utilities = [...themeCss.matchAll(/^@utility ([\w-]+) \{/gmu)].map(
    ([, name]) => name as string
  );
  const keys = (ns: string) =>
    [...themeCss.matchAll(new RegExp(`^\\s*--${ns}-([\\w-]+):`, "gmu"))]
      .map(([, key]) => key as string)
      .filter((key) => ns !== "font" || !key.startsWith("weight-"));
  const appCss = await Bun.file(APP_CSS).text();
  const own = [...(await Bun.file(DESIGN_CSS).text()).matchAll(UTILITY)];
  const shorthands = [
    ...utilities.filter((u) => u.startsWith("type-")),
    ...own.filter(([, , body]) => SHORTHAND.test(body)).map(([, name]) => name),
  ];
  const longhands = [
    ...TAILWIND_FONT_UTILITIES,
    ...utilities.filter((u) => u.startsWith("text-size-") || u === "liga-none"),
    ...Object.entries(FONT_NAMESPACES).flatMap(([ns, prefix]) =>
      keys(ns).map((key) => `${prefix}${key}`)
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

const drift = await fontOrderDrift();
for (const wrong of drift) {
  console.error(`role-order: ${THEME}: ${wrong}`);
}
console.log(
  drift.length === 0
    ? "role-order: every font shorthand utility sorts before every font longhand utility"
    : `role-order: ${drift.length} font shorthand utilities sort after a longhand`
);
process.exit(drift.length === 0 ? 0 : 1);

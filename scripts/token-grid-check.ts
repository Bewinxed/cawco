/**
 * `bun scripts/token-grid-check.ts` (part of `bun run check`):
 *
 * Holds the design system's 4px spatial grid on `apps/dashboard/src/lib/tokens/theme.css`:
 *  1. `--spacing` is a length (`0.25rem` = `4px`), the base unit.
 *  2. Every `--spacing-space-*` rhythm token is written via `var(--spacing)`
 *     and resolves to a positive integer multiple of the base unit.
 *  3. Every `--spacing-*` length token (excluding character measures like `72ch`)
 *     resolves to a positive integer multiple of the base unit.
 *  4. Every `--leading-*` token is a CSS length written via `var(--spacing)`
 *     (never a unitless ratio) that resolves to a positive integer multiple of
 *     the base unit, so single-line heights and control heights share one grid.
 *  5. Every `--radius-*` length token (excluding `--radius-pill`) resolves to
 *     a positive integer multiple of the base unit.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postcss from "postcss";

export const checkReads = ["apps/dashboard/src/lib/tokens/theme.css"];

const THEME = join(
  import.meta.dir,
  "../apps/dashboard/src/lib/tokens/theme.css"
);
const ROOT_PX = 16;
const PX = /^(-?[\d.]+)px$/u;
const REM = /^(-?[\d.]+)rem$/u;
const CH = /^[\d.]+ch$/u;
const CALC_SPACING =
  /^calc\(\s*(?:var\(--spacing\)\s*\*\s*([\d.]+)|([\d.]+)\s*\*\s*var\(--spacing\))\s*\)$/u;

function parseLengthPx(raw: string, basePx: number): number | null {
  const value = raw.replace(/\s+/gu, " ").trim();
  const px = PX.exec(value);
  if (px) {
    return Number(px[1]);
  }
  const rem = REM.exec(value);
  if (rem) {
    return Number(rem[1]) * ROOT_PX;
  }
  const calc = CALC_SPACING.exec(value);
  if (calc) {
    return Number(calc[1] ?? calc[2]) * basePx;
  }
  return null;
}

const css = readFileSync(THEME, "utf8");
const root = postcss.parse(css);

const decls: { line: number; prop: string; value: string }[] = [];
root.walkDecls((decl) => {
  if (!decl.prop.startsWith("--")) {
    return;
  }
  const parent = decl.parent;
  const inStatic =
    parent?.type === "atrule" &&
    parent.name === "theme" &&
    parent.params === "static";
  const inThemeOverride =
    parent?.type === "rule" &&
    parent.selectors.includes(":root") &&
    decl.prop.startsWith("--spacing");
  if (inStatic || inThemeOverride) {
    decls.push({
      prop: decl.prop,
      value: decl.value.replace(/\s+/gu, " ").trim(),
      line: decl.source?.start?.line ?? 0,
    });
  }
});

const baseDecl = decls.find((d) => d.prop === "--spacing");
const basePx = baseDecl ? parseLengthPx(baseDecl.value, 0) : null;
const errors: string[] = [];

if (!baseDecl || basePx === null || basePx <= 0) {
  errors.push("theme.css: missing or invalid base `--spacing` length token");
}

let checked = 0;
const step = basePx ?? 4;
const isGridMultiple = (px: number): boolean =>
  px > 0 && Math.abs(px / step - Math.round(px / step)) < 1e-6;

for (const { prop, value, line } of decls) {
  if (prop === "--spacing") {
    continue;
  }
  if (prop.startsWith("--spacing-")) {
    if (CH.test(value)) {
      continue;
    }
    checked += 1;
    if (prop.startsWith("--spacing-space-") && !value.includes("var(--spacing)")) {
      errors.push(
        `theme.css:${line}: ${prop}: ${value} must be expressed in terms of var(--spacing)`
      );
      continue;
    }
    const px = parseLengthPx(value, step);
    if (px === null || !isGridMultiple(px)) {
      errors.push(
        `theme.css:${line}: ${prop}: ${value} is not a positive multiple of the ${step}px base grid`
      );
    }
  } else if (prop.startsWith("--leading-")) {
    checked += 1;
    if (!value.includes("var(--spacing)")) {
      errors.push(
        `theme.css:${line}: ${prop}: ${value} must be a length on var(--spacing), not a unitless ratio`
      );
      continue;
    }
    const px = parseLengthPx(value, step);
    if (px === null || !isGridMultiple(px)) {
      errors.push(
        `theme.css:${line}: ${prop}: ${value} is not a positive multiple of the ${step}px base grid`
      );
    }
  } else if (prop.startsWith("--radius-") && prop !== "--radius-pill") {
    checked += 1;
    const px = parseLengthPx(value, step);
    if (px === null || !isGridMultiple(px)) {
      errors.push(
        `theme.css:${line}: ${prop}: ${value} is not a positive multiple of the ${step}px base grid`
      );
    }
  }
}

if (errors.length > 0) {
  for (const err of errors) {
    console.error(`token-grid: ${err}`);
  }
  process.exit(1);
}

console.log(
  `token-grid: all ${checked} spacing, leading, and radius tokens sit on the ${step}px base grid`
);

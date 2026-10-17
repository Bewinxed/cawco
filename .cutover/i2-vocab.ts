/**
 * The foundation's vocab-codemod rewrite, re-derived from its own tables
 * (apps/dashboard/scripts/vocab-codemod.ts at db864be26, which exports none
 * of them): what one class becomes on the token theme. i2-codemod.ts checks
 * the derivation against the codemod's run and proves each rewrite in
 * Chromium.
 */
import { join, resolve } from "node:path";

const app = resolve(import.meta.dir, "../apps/dashboard");
const { SPACING_UTILITY } = await import(join(app, "scripts/class-strings.ts"));

const COLOURS: Record<string, string> = {
  background: "surface-page",
  sidebar: "surface-page",
  foreground: "ink-strong",
  "card-foreground": "ink-strong",
  "sidebar-foreground": "ink-strong",
  "muted-foreground": "ink-muted",
  muted: "neutral-2",
  destructive: "error-9",
  error: "error-9",
  success: "success-9",
  warning: "warning-9",
  info: "info-9",
  "sidebar-border": "border",
};
const RENAMED: Record<string, string> = { link: "link-ink" };
const COLOUR_UTILITY =
  /^(bg|text|border|border-[xytrblse]|ring|ring-offset|outline|fill|stroke|divide|placeholder|caret|accent|decoration|shadow|inset-shadow|inset-ring|from|via|to)-(.+)$/;
const OPACITY = /\/[\w.]+$/;
const SPACE_LADDER: Record<number, string> = {
  4: "space-1",
  7: "space-2",
  11: "space-3",
  14: "space-4",
  18: "space-5",
  21: "space-6",
  25: "space-7",
  32: "space-8",
};
const ICON_LADDER: Record<number, string> = {
  12: "icon-sm",
  16: "icon-md",
  20: "icon-lg",
};
const ICON_UTILITY = new Set(["w", "h", "size"]);
const OLD_CONTAINERS: Record<string, number> = {
  "3xs": 16,
  "2xs": 18,
  xs: 20,
  sm: 24,
  md: 28,
  lg: 32,
  xl: 36,
  "2xl": 42,
  "3xl": 48,
  "4xl": 56,
  "5xl": 64,
  "6xl": 72,
  "7xl": 80,
};
const BREAKPOINTS: Record<string, string> = { sm: "phone" };
export const LOST_BREAKPOINTS: Record<string, string> = {
  md: "48rem",
  lg: "64rem",
  xl: "80rem",
  "2xl": "96rem",
};
const DEFAULT_WIDTH = /^(w|min-w|max-w)-(3xs|2xs|xs|sm|md|lg|xl|[2-7]xl)$/;
const CONTAINER_VARIANT = /^@(max-)?([\w-]+)\/([\w-]+)$/;
export const MAX = /^max-/;

/** A class's variants and base, split at its top-level colons. */
export function parts(raw: string): { variants: string[]; base: string } {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === "[" || ch === "(") {
      depth += 1;
    } else if (ch === "]" || ch === ")") {
      depth -= 1;
    } else if (ch === ":" && depth === 0) {
      out.push(raw.slice(from, i));
      from = i + 1;
    }
  }
  return { variants: out, base: raw.slice(from) };
}

function renameVariant(v: string): string {
  const bare = v.replace(MAX, "");
  const max = v.startsWith("max-") ? "max-" : "";
  if (BREAKPOINTS[bare]) {
    return `${max}${BREAKPOINTS[bare]}`;
  }
  if (LOST_BREAKPOINTS[bare]) {
    return `${max ? "max" : "min"}-[${LOST_BREAKPOINTS[bare]}]`;
  }
  const query = CONTAINER_VARIANT.exec(v);
  if (query && OLD_CONTAINERS[query[2]] !== undefined) {
    return `@${query[1] ?? ""}${query[3]}/${query[3]}`;
  }
  return v;
}

function renameBase(base: string): string {
  const bang = base.endsWith("!") ? "!" : "";
  const b = bang ? base.slice(0, -1) : base;
  const opacity = OPACITY.exec(b)?.[0] ?? "";
  const colour = COLOUR_UTILITY.exec(b.slice(0, b.length - opacity.length));
  const target = colour && (COLOURS[colour[2]] ?? RENAMED[colour[2]]);
  if (colour && target) {
    return `${colour[1]}-${target}${opacity}${bang}`;
  }
  if (b === "font-sans") {
    return `font-body${bang}`;
  }
  if (b === "leading-normal") {
    return `leading-root${bang}`;
  }
  const width = DEFAULT_WIDTH.exec(b);
  if (width) {
    return `${width[1]}-${OLD_CONTAINERS[width[2]] * 4}${bang}`;
  }
  const spacing = SPACING_UTILITY.exec(b);
  if (spacing) {
    const [, minus, utility, n] = spacing;
    const px = Number(n) * 4;
    const icon =
      ICON_UTILITY.has(utility) && !minus ? ICON_LADDER[px] : undefined;
    const step = icon ?? SPACE_LADDER[px];
    if (step) {
      return `${minus}${utility}-${step}${bang}`;
    }
  }
  return base;
}

/** What the codemod writes for a class; the class itself when it stays. */
export function rewrite(raw: string): string {
  const { variants, base } = parts(raw);
  return [...variants.map(renameVariant), renameBase(base)].join(":");
}

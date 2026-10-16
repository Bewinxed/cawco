/**
 * Moves the dashboard's class strings onto the token theme
 * (src/lib/tokens/theme.css), value for value: a class the old theme made
 * (Tailwind's defaults, shadcn's bridge names, shadcn-svelte's variants)
 * becomes the class the token theme makes for the same computed value.
 * The class strings are the ones scripts/class-strings.ts reads with
 * Svelte's own parser: `<style>` blocks, comments and identifiers are never
 * touched.
 *
 * What it rewrites:
 * - a retired bridge colour (`text-muted-foreground`, `bg-background` …) to
 *   the house token it resolves to in both schemes, checked against
 *   tokens.css on every run, and an old key of another name (`text-link`);
 * - a numeric spacing utility at a ladder value to its token (`gap-1.75` →
 *   `gap-space-2`, `size-4` → `size-icon-md`). Every other numeric one stays:
 *   the owner's call keeps `--spacing`, and scripts/spacing-ratchet.ts holds
 *   their count;
 * - Tailwind's defaults that equal a token or a numeric step (`font-sans`,
 *   `leading-normal`, `max-w-sm`, `sm:`, `@md/field-group:`). A class under
 *   a breakpoint the theme lacks (`md:`) goes where the same class without
 *   it always stands beside it, and otherwise keeps its width
 *   (`min-[48rem]:`);
 * - shadcn-svelte's state variants to the named ones: `data-checked:`
 *   matched `[data-state="checked"]`, which is what bits-ui writes, so it
 *   becomes `state-checked:`; the sidebar's buttons write
 *   `data-active="true|false"`, so `data-active:` becomes `active-true:`.
 *
 * `text-<role>` stays as written: the theme makes it, with today's
 * declarations.
 *
 * It is re-runnable: nothing it writes matches what it reads. It prints what
 * it changed by kind, every class it has no value for, and every string it
 * rewrote outside a class attribute or class call (`--dry` changes nothing;
 * `--tokens <file>` writes every class it read, for a reader that compiles
 * them).
 *
 *   bun scripts/vocab-codemod.ts [--dry] [--tokens <file>]
 */
import { join } from "node:path";
import { Glob } from "bun";
import { parse } from "svelte/compiler";
import {
  type ClassToken,
  classTokens,
  DASHBOARD,
  dashboardSources,
  format,
  SPACING_UTILITY,
} from "./class-strings";

const DRY = process.argv.includes("--dry");
const DUMP = process.argv.indexOf("--tokens");
const TOKENS = join(DASHBOARD, "src/lib/tokens/tokens.css");
const THEME = join(DASHBOARD, "src/lib/tokens/theme.css");

const DECLARATION = /--([a-z0-9-]+):\s*([^;]+);/g;
const SPACES = /\s+/g;
const VAR = /var\(--([a-z0-9-]+)\)/g;
const STATE_VARIANT =
  /^((?:group|peer|has|not|in)-)?data-(checked|unchecked|open|closed|active)(\/[\w-]+)?$/;
const CONTAINER_VARIANT = /^@(max-)?([\w-]+)\/([\w-]+)$/;
const MAX = /^max-/;
const OPACITY = /\/[\w.]+$/;
const DEFAULT_WIDTH = /^(w|min-w|max-w)-(3xs|2xs|xs|sm|md|lg|xl|[2-7]xl)$/;

// MARK: - Tokens and the theme

const LIGHT_DARK = "light-dark(";

/** Where a light-dark() opened at `at` closes, and the comma between its two sides. */
function lightDarkBounds(
  value: string,
  at: number
): { comma: number; end: number } {
  let depth = 0;
  let comma = -1;
  for (let i = at + LIGHT_DARK.length; i < value.length; i += 1) {
    const ch = value[i];
    if (ch === "(") {
      depth += 1;
    } else if (ch === ")") {
      if (depth === 0) {
        return { comma, end: i };
      }
      depth -= 1;
    } else if (ch === "," && depth === 0 && comma < 0) {
      comma = i;
    }
  }
  throw new Error(`light-dark() never closes in ${value}`);
}

/** One side of every top-level light-dark() in a value. */
function schemeSide(value: string, which: 0 | 1): string {
  const at = value.indexOf(LIGHT_DARK);
  if (at < 0) {
    return value;
  }
  const { comma, end } = lightDarkBounds(value, at);
  const chosen =
    which === 0
      ? value.slice(at + LIGHT_DARK.length, comma)
      : value.slice(comma + 1, end);
  return `${value.slice(0, at)}${schemeSide(chosen, which).trim()}${schemeSide(value.slice(end + 1), which)}`;
}

/** Each token's CSS in light and dark, references followed to their end. */
async function tokenResolver(): Promise<(name: string) => [string, string]> {
  const css = await Bun.file(TOKENS).text();
  const root = css.slice(css.indexOf(":root {"), css.indexOf(":root.dark"));
  const decls = new Map<string, string>();
  for (const [, name, value] of root.matchAll(DECLARATION)) {
    decls.set(name, value.replace(SPACES, " ").trim());
  }
  const resolve = (value: string, which: 0 | 1, seen: string[]): string =>
    schemeSide(value, which).replace(VAR, (whole, name: string) => {
      const next = decls.get(name);
      if (next === undefined || seen.includes(name)) {
        return whole;
      }
      return resolve(next, which, [...seen, name]);
    });
  return (name) => {
    const value = decls.get(name);
    if (value === undefined) {
      throw new Error(`tokens.css has no --${name}`);
    }
    return [resolve(value, 0, [name]), resolve(value, 1, [name])];
  };
}

/** Every key a namespace of theme.css holds, with its value. */
async function themeKeys(): Promise<(ns: string) => Map<string, string>> {
  const css = await Bun.file(THEME).text();
  return (ns) =>
    new Map(
      [
        ...css.matchAll(
          new RegExp(`^\\s*--${ns}-([a-z0-9-]+):\\s*([^;]+);`, "gm")
        ),
      ].map(([, key, value]) => [key, value.trim()])
    );
}

/** The kit's bridge names and the house token each resolves to in both schemes (checked below). */
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
/** Old keys that read a token of another name: app.css's `--color-link: var(--link-ink)`. */
const RENAMED: Record<string, string> = { link: "link-ink" };
const COLOUR_UTILITY =
  /^(bg|text|border|border-[xytrblse]|ring|ring-offset|outline|fill|stroke|divide|placeholder|caret|accent|decoration|shadow|inset-shadow|inset-ring|from|via|to)-(.+)$/;

/** Refuses a bridge colour whose house token differs from it in either scheme, or that the theme does not make. */
function checkColours(
  resolve: (name: string) => [string, string],
  colours: Map<string, string>
): void {
  for (const [alias, target] of Object.entries(COLOURS)) {
    const [a, b] = [resolve(alias), resolve(target)];
    if (a[0] !== b[0] || a[1] !== b[1]) {
      throw new Error(
        `--${alias} and --${target} differ: ${a.join(" / ")} vs ${b.join(" / ")}`
      );
    }
  }
  for (const [old, target] of Object.entries({ ...COLOURS, ...RENAMED })) {
    if (!colours.has(target) || colours.has(old)) {
      throw new Error(
        `theme.css must make --color-${target} and no --color-${old}`
      );
    }
  }
}

/** The space and icon ladders, by px: the single-context tokens a numeric utility can equal. */
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

/** Tailwind's default container widths (`max-w-sm`, `@md/name:`), in rem. */
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
/** Tailwind's default breakpoints a theme breakpoint equals (`sm` is 40rem, `phone` 640px). */
const BREAKPOINTS: Record<string, string> = { sm: "phone" };
/** Tailwind's default breakpoints no theme breakpoint equals, kept at their width (`min-[48rem]:`). */
const LOST_BREAKPOINTS: Record<string, string> = {
  md: "48rem",
  lg: "64rem",
  xl: "80rem",
  "2xl": "96rem",
};
/** shadcn-svelte's state variants, by the attribute state the kit's elements carry. */
const STATE_VARIANTS: Record<string, string> = {
  checked: "state-checked",
  unchecked: "state-unchecked",
  open: "state-open",
  closed: "state-closed",
  active: "active-true",
};

/**
 * Tailwind's default scales, by the theme namespace that would give each a
 * value: a class from one whose key the theme lacks has no value, and is a
 * decision (left as written and reported).
 */
const DEFAULT_SCALES: [RegExp, string][] = [
  [/^leading-(tight|snug|normal|relaxed|loose)$/, "leading"],
  [/^tracking-(tighter|tight|normal|wide|wider|widest)$/, "tracking"],
  [
    /^font-(thin|extralight|light|semibold|bold|extrabold|black)$/,
    "font-weight",
  ],
  [/^shadow-(2xs|xs|sm|md|lg|xl|2xl)$/, "shadow"],
  [/^rounded-(xs|sm|md|lg|[2-4]?xl)$/, "radius"],
  [/^text-(xs|sm|base|lg|[2-9]?xl)$/, "text"],
];
/** Defaults no theme key can give: bare scale steps and Tailwind's in curves. */
const NO_VALUE =
  /^(rounded|blur|blur-(xs|sm|md|lg|[2-3]?xl)|container|ease-(in|linear)|animate-bounce)$/;
/** Tailwind's palette, which has a value only where a token of the same name does (the house's own `neutral-*` ramp). */
const PALETTE =
  /^(?:bg|text|border|ring|fill|stroke|outline|from|via|to|divide|placeholder|caret|accent|decoration|shadow)-(black|white|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+)(?:\/\d+)?$/;

// MARK: - Rewriting

type Rewrite = { kind: string; to: string } | { none: string } | undefined;
type VariantRewrite =
  { changed: boolean; variants: string[] } | { drop: true } | { none: string };

/** One variant as the token theme names it; undefined when it stays; a reason when it has no name. */
function renameVariant(
  v: string,
  containers: Map<string, string>
): string | { none: string } | undefined {
  const state = STATE_VARIANT.exec(v);
  if (state) {
    const [, prefix = "", name, label = ""] = state;
    return `${prefix}${STATE_VARIANTS[name]}${label}`;
  }
  const bare = v.replace(MAX, "");
  const max = v.startsWith("max-") ? "max-" : "";
  if (BREAKPOINTS[bare]) {
    return `${max}${BREAKPOINTS[bare]}`;
  }
  const query = CONTAINER_VARIANT.exec(v);
  if (query && OLD_CONTAINERS[query[2]] !== undefined) {
    const [, queryMax = "", size, name] = query;
    const width = `${OLD_CONTAINERS[size]}rem`;
    if (containers.get(name) !== width) {
      return { none: `${v}: needs --container-${name}: ${width} in theme.css` };
    }
    return `@${queryMax}${name}/${name}`;
  }
  return undefined;
}

/** A class's variants as the token theme names them; a class under a lost breakpoint that its unprefixed twin repeats is dropped. */
function renameVariants(
  token: ClassToken,
  context: ClassToken[],
  containers: Map<string, string>
): VariantRewrite {
  const { variants, base, important } = token.parsed;
  const out: string[] = [];
  let changed = false;
  for (const v of variants) {
    const lost = LOST_BREAKPOINTS[v.replace(MAX, "")];
    if (lost) {
      const twin = format(
        variants.filter((x) => x !== v),
        base,
        important
      );
      if (
        context.some(
          (t) => t !== token && !t.piece.conditional && t.raw === twin
        )
      ) {
        return { drop: true };
      }
      out.push(`${v.startsWith("max-") ? "max" : "min"}-[${lost}]`);
      changed = true;
      continue;
    }
    const renamed = renameVariant(v, containers);
    if (typeof renamed === "object") {
      return renamed;
    }
    out.push(renamed ?? v);
    changed ||= renamed !== undefined;
  }
  return { changed, variants: out };
}

interface Renamed {
  base: string;
  kind: string;
}

/** A retired bridge colour, or an old key of another name, as the house token. */
function renameColour(base: string): Renamed | undefined {
  const opacity = OPACITY.exec(base)?.[0] ?? "";
  const colour = COLOUR_UTILITY.exec(
    base.slice(0, base.length - opacity.length)
  );
  const target = colour && (COLOURS[colour[2]] ?? RENAMED[colour[2]]);
  return colour && target
    ? { base: `${colour[1]}-${target}${opacity}`, kind: "bridge colour" }
    : undefined;
}

/** A Tailwind default that equals a token or a numeric step. */
function renameDefault(base: string): Renamed | undefined {
  if (base === "font-sans") {
    return { base: "font-body", kind: "default face" };
  }
  if (base === "leading-normal") {
    return { base: "leading-root", kind: "default leading" };
  }
  const width = DEFAULT_WIDTH.exec(base);
  if (!width) {
    return undefined;
  }
  const [, utility, size] = width;
  return {
    base: `${utility}-${OLD_CONTAINERS[size] * 4}`,
    kind: "default container width",
  };
}

/** A numeric spacing utility at a ladder value, as its token. */
function renameSpacing(base: string): Renamed | undefined {
  const spacing = SPACING_UTILITY.exec(base);
  if (!spacing) {
    return undefined;
  }
  const [, minus, utility, n] = spacing;
  const px = Number(n) * 4;
  const icon =
    ICON_UTILITY.has(utility) && !minus ? ICON_LADDER[px] : undefined;
  const step = icon ?? SPACE_LADDER[px];
  return step
    ? {
        base: `${minus}${utility}-${step}`,
        kind: icon ? "icon size" : "space step",
      }
    : undefined;
}

/** Why a Tailwind default has no value in the token theme; undefined when it has one, or is no default. */
function noValue(
  base: string,
  keys: (ns: string) => Map<string, string>
): { none: string } | undefined {
  const scale = DEFAULT_SCALES.find(([pattern]) => pattern.test(base));
  if (scale && !keys(scale[1]).has(base.slice(base.indexOf("-") + 1))) {
    return { none: `no --${scale[1]}-* key in theme.css holds it` };
  }
  const palette = PALETTE.exec(base);
  if (palette && !keys("color").has(palette[1])) {
    return { none: "Tailwind's palette, which the token theme does not carry" };
  }
  return NO_VALUE.test(base)
    ? { none: "a default no theme key can give" }
    : undefined;
}

/** A utility as the token theme makes it, with what kind of rewrite it is; undefined when it stays. */
function renameUtility(
  base: string,
  keys: (ns: string) => Map<string, string>
): Renamed | { none: string } | undefined {
  return (
    renameColour(base) ??
    renameDefault(base) ??
    renameSpacing(base) ??
    noValue(base, keys)
  );
}

/** What one class becomes, given the classes of its context; undefined when it stays. */
function rewrite(
  token: ClassToken,
  context: ClassToken[],
  keys: (ns: string) => Map<string, string>
): Rewrite {
  const variants = renameVariants(token, context, keys("container"));
  if ("none" in variants) {
    return variants;
  }
  if ("drop" in variants) {
    return {
      kind: "breakpoint class its unprefixed twin repeats, dropped",
      to: "",
    };
  }
  const { base, important } = token.parsed;
  const utility = renameUtility(base, keys);
  if (utility && "none" in utility) {
    return utility;
  }
  if (utility) {
    return {
      kind: utility.kind,
      to: format(variants.variants, utility.base, important),
    };
  }
  return variants.changed
    ? { kind: "variant", to: format(variants.variants, base, important) }
    : undefined;
}

// MARK: - Run

interface Site {
  line: number;
  path: string;
  token: string;
  why: string;
}

interface Report {
  counts: Map<string, number>;
  loose: Site[];
  read: Set<string>;
  unmapped: Site[];
}

interface Edit {
  end: number;
  start: number;
  text: string;
}

/** One edit of a class: a `class:` directive is rewritten whole, one per class it becomes. */
function editOf(token: ClassToken, to: string): Edit {
  const { directive } = token.piece;
  if (!directive) {
    return { end: token.end, start: token.start, text: to };
  }
  const names = to.split(SPACES).filter(Boolean);
  return {
    end: directive.end,
    start: directive.start,
    text: names
      .map((name) => `class:${name}={${directive.expression}}`)
      .join(" "),
  };
}

/** A source with its edits made, last first; a dropped class takes one side's space with it. */
function applyEdits(source: string, edits: Edit[]): string {
  let out = source;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    let { start, end } = edit;
    if (edit.text === "" && out[end] === " ") {
      end += 1;
    } else if (edit.text === "" && out[start - 1] === " ") {
      start -= 1;
    }
    out = out.slice(0, start) + edit.text + out.slice(end);
  }
  return out;
}

/** A file's edits, each class read against its context's classes, recording what changed into `into`. */
function editsOf(
  path: string,
  source: string,
  keys: (ns: string) => Map<string, string>,
  into: Report
): Edit[] {
  const tokens = classTokens(path, source);
  const byContext = Map.groupBy(tokens, (t) => t.piece.context);
  const lineOf = (at: number) => source.slice(0, at).split("\n").length;
  const edits: Edit[] = [];
  for (const token of tokens) {
    into.read.add(token.raw);
    const result = rewrite(
      token,
      byContext.get(token.piece.context) ?? [],
      keys
    );
    if (!result) {
      continue;
    }
    const site = { line: lineOf(token.start), path, token: token.raw };
    if ("none" in result) {
      into.unmapped.push({ ...site, why: result.none });
      continue;
    }
    into.counts.set(result.kind, (into.counts.get(result.kind) ?? 0) + 1);
    if (token.piece.loose) {
      into.loose.push({ ...site, why: result.to });
    }
    edits.push(editOf(token, result.to));
  }
  return edits;
}

/**
 * A selector that names a class the markup's rewrite renames must name the
 * new one, or it stops matching what it matched (SectionRow's
 * `:not(.text-link)` kept the kit's link button out of its ghost hover):
 * every plain class a `<style>` block or a hand-written stylesheet selects
 * by goes through the same utility rename. Only the selector's class name
 * changes; no declaration does.
 */
const SELECTOR_CLASS = /(?<=\.)-?[_a-zA-Z][\w-]*(?![\w\\-])/g;
const RULE_PRELUDE = /(?<=^|[{};])([^{};]*)\{/g;
const COMMENT = /\/\*[\s\S]*?\*\//g;
/** The generated token stylesheets (`bun run tokens`, `bun run variants`): never edited by hand. */
const GENERATED_CSS = /^src\/lib\/tokens\//;

/** The selector edits a stylesheet takes, at offsets in `css`: a rule's prelude, never an at-rule's or a comment. */
function renameSelectors(
  css: string,
  keys: (ns: string) => Map<string, string>
): Edit[] {
  const masked = css.replace(COMMENT, (comment) => " ".repeat(comment.length));
  const edits: Edit[] = [];
  for (const rule of masked.matchAll(RULE_PRELUDE)) {
    const [, prelude] = rule;
    if (prelude.trim().startsWith("@")) {
      continue;
    }
    const at = rule.index ?? 0;
    for (const name of prelude.matchAll(SELECTOR_CLASS)) {
      const to = renameUtility(name[0], keys);
      if (to && "base" in to) {
        const start = at + (name.index ?? 0);
        edits.push({ end: start + name[0].length, start, text: to.base });
      }
    }
  }
  return edits;
}

/** A file's selector edits: a component's `<style>` block, or a hand-written stylesheet whole. */
function selectorEdits(
  path: string,
  source: string,
  keys: (ns: string) => Map<string, string>,
  into: Report
): Edit[] {
  if (GENERATED_CSS.test(path) || path.endsWith(".ts")) {
    return [];
  }
  const range = path.endsWith(".css")
    ? { end: source.length, start: 0 }
    : parse(source, { modern: true }).css?.content;
  if (!range) {
    return [];
  }
  const edits = renameSelectors(source.slice(range.start, range.end), keys).map(
    (edit) => ({
      ...edit,
      end: edit.end + range.start,
      start: edit.start + range.start,
    })
  );
  const lineOf = (at: number) => source.slice(0, at).split("\n").length;
  for (const edit of edits) {
    into.counts.set(
      "selector class",
      (into.counts.get("selector class") ?? 0) + 1
    );
    into.loose.push({
      line: lineOf(edit.start),
      path,
      token: source.slice(edit.start, edit.end),
      why: `.${edit.text} in a selector`,
    });
  }
  return edits;
}

/** The hand-written stylesheets beside the components (app.css …), by their path in apps/dashboard. */
async function stylesheets(): Promise<{ path: string; source: string }[]> {
  const paths = (
    await Array.fromAsync(new Glob("src/**/*.css").scan({ cwd: DASHBOARD }))
  ).filter((path) => !GENERATED_CSS.test(path));
  const sources = await Promise.all(
    paths.map((path) => Bun.file(join(DASHBOARD, path)).text())
  );
  return paths.map((path, i) => ({ path, source: sources[i] }));
}

const themeKeysOf = await themeKeys();
checkColours(await tokenResolver(), themeKeysOf("color"));

const report: Report = {
  counts: new Map(),
  loose: [],
  read: new Set(),
  unmapped: [],
};
const files = [...(await dashboardSources()), ...(await stylesheets())];
const changed = files.flatMap(({ path, source }) => {
  const edits = [
    ...(path.endsWith(".css")
      ? []
      : editsOf(path, source, themeKeysOf, report)),
    ...selectorEdits(path, source, themeKeysOf, report),
  ];
  return edits.length === 0 ? [] : [[path, applyEdits(source, edits)] as const];
});
if (!DRY && changed.length > 0) {
  await Promise.all(
    changed.map(([path, out]) => Bun.write(join(DASHBOARD, path), out))
  );
  // A renamed class sorts elsewhere in its string, and changes its line's
  // length: the files go back through Biome's class order and the
  // repository's formatter, as `bun run lint` checks them. The order of a
  // string's classes decides nothing but which of two conflicting ones
  // tailwind-merge keeps, and no string the codemod writes holds two.
  const paths = changed.map(([path]) => path);
  for (const command of [
    [
      "bunx",
      "biome",
      "lint",
      "--write",
      "--only=nursery/useSortedClasses",
      ...paths,
    ],
    ["bun", "../../scripts/fmt.ts", ...paths],
  ]) {
    const run = Bun.spawnSync(command, {
      cwd: DASHBOARD,
      stderr: "inherit",
      stdout: "ignore",
    });
    if (run.exitCode !== 0) {
      throw new Error(
        `${command.slice(0, 3).join(" ")} exited ${run.exitCode}`
      );
    }
  }
}
if (DUMP > 0) {
  await Bun.write(
    process.argv[DUMP + 1],
    JSON.stringify([...report.read].sort(), null, 1)
  );
}

const say = (s: string) => process.stdout.write(`${s}\n`);
say(`${DRY ? "would change" : "changed"} ${changed.length} files`);
for (const [kind, n] of [...report.counts].sort((a, b) => b[1] - a[1])) {
  say(`  ${String(n).padStart(4)}  ${kind}`);
}
const list = (title: string, sites: Site[]) => {
  say(`\n${title}: ${sites.length}`);
  for (const s of sites) {
    say(`  ${s.path}:${s.line}  ${s.token}  — ${s.why}`);
  }
};
list("no value in the token theme (left as written)", report.unmapped);
list(
  "rewritten outside a class attribute or class call (a loose string, a selector)",
  report.loose
);
if (report.unmapped.length > 0) {
  process.exitCode = 1;
}

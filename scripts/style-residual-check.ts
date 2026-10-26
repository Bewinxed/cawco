/**
 * `bun scripts/style-residual-check.ts` (part of `bun run check`): what may
 * stay in a component's `<style>` once its styles are theme utilities. The
 * dashboard's markup carries its styles as classes; a `<style>` keeps only
 * what a class cannot say, each rule under a comment naming why:
 *
 *     /* residual: keyframes *\/    the component's own @keyframes and the animation declarations naming them
 *     /* residual: foreign-dom *\/  rules into DOM the file does not render and cannot pass `class` to
 *     /* residual: pseudo *\/       ::before / ::after and everything belonging to them
 *     /* residual: svg-paint *\/    stop-color, flood-color, stroke-dasharray and the like on SVG children
 *     /* residual: unmapped *\/     a declaration the lane prompt does not map: counted, cleared at integration
 *
 * A comment covers every declaration after it until the next residual
 * comment (anything may follow the kind: `/* residual: foreign-dom — vaul's
 * overlay *\/`). A declaration holds only `var(--…)`, `calc()` of them, `0`,
 * `1px`, `2px`, percentages, unitless numbers and keywords: no colour literal
 * (`#…`, `rgb()`/`oklch()`… with numbers, a named colour) and no other length
 * literal. An empty `<style>` is deleted.
 *
 * Each `<style>` is read by Svelte's own compiler (`parse`, modern AST), the
 * parse the component itself goes through, comments with their offsets.
 *
 *   bun scripts/style-residual-check.ts <file…>             a lane: at most 5 unmapped declarations per file
 *   bun scripts/style-residual-check.ts --no-cap <file…>    an Opus lane: unmapped uncapped
 *   bun scripts/style-residual-check.ts                     every .svelte under apps/dashboard/src: unmapped must be 0
 *   bun scripts/style-residual-check.ts --list [file…]      also print every unmapped declaration as `file:line  property: value`
 *
 * Prints, per file with a `<style>`, its declarations by kind, then each
 * violation as `file:line  what`. Exits 1 on any violation.
 *
 * It also reads every class the markup and the recipes write (.svelte, .ts
 * and .js under apps/dashboard/src, the generated lib/tokens aside) for a
 * theme token written as an arbitrary value: `bg-[var(--surface-raised)]` or
 * `bg-(--surface-raised)`, where `--surface-raised` stands behind a theme key
 * in a namespace that utility reads (`--color-surface-raised`), so the
 * theme's own utility says it (`bg-surface-raised`). The namespaces each
 * utility reads are Tailwind v4's (https://tailwindcss.com/docs/theme:
 * "Theme variables are special CSS variables defined using the `@theme`
 * directive that influence which utility classes exist in your project"),
 * and the house `@utility name-*` blocks' `--value(--ns-*)`. A var with a
 * fallback (`var(--x, …)`) is not a theme token as written and passes, and
 * `duration-*` is exempt: Tailwind v4 makes no duration utility from a theme
 * key, so a token duration is `duration-(--dur-*)`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const DASHBOARD = join(ROOT, "apps", "dashboard");
const SOURCE = join(DASHBOARD, "src");
/** The dashboard's own Svelte, the compiler its components are built with (it is not hoisted to the root). */
const { parse } = (await import(
  Bun.resolveSync("svelte/compiler", DASHBOARD)
)) as {
  parse: (source: string, options: { modern: true }) => { css: unknown };
};
const SKIP_DIRS = new Set(["node_modules", ".svelte-kit", "dist", "build"]);
const KINDS = [
  "keyframes",
  "foreign-dom",
  "pseudo",
  "svg-paint",
  "unmapped",
] as const;
type Kind = (typeof KINDS)[number];
/** Unmapped declarations a Sonnet lane may leave in one file. */
const LANE_CAP = 5;

const RESIDUAL = /^\s*residual:\s*([a-z-]+)/u;
const LENGTH =
  /(?<![\w.#-])(-?(?:\d+\.?\d*|\.\d+))(px|em|rem|ch|ex|cap|ic|lh|rlh|vw|vh|vi|vb|vmin|vmax|svw|svh|svi|svb|lvw|lvh|dvw|dvh|dvi|dvb|cqw|cqh|cqi|cqb|cqmin|cqmax|cm|mm|q|in|pt|pc)(?![\w-])/giu;
const HEX = /#[0-9a-f]{3,8}(?![\w-])/iu;
const COLOR_FN = /(?<![\w-])(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/giu;
const DIGIT = /\d/u;
const WORD = /[a-z][a-z-]*/giu;
const STRING = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/gu;
const URL = /url\([^)]*\)/giu;
/** A custom property's name, `--x` in `var(--x)` or a declaration's own: never a colour word. */
const CUSTOM_NAME = /--[\w-]+/gu;
/** The lengths a residual may hold as they are: a hairline and its double. */
const ALLOWED_LENGTHS = new Set([0, 1, 2]);
/** CSS's named colours (css-color-4 §6.1), `transparent` and `currentcolor` aside: keywords, not literals. */
const NAMED = new Set(
  "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen".split(
    " "
  )
);

interface Css {
  block?: { children: Css[] };
  end: number;
  name?: string;
  prelude?: unknown;
  property?: string;
  start: number;
  type: string;
  value?: string;
}

interface Report {
  /** Declarations under each kind. */
  counts: Record<Kind, number>;
  file: string;
  hasStyle: boolean;
  /** Each unmapped declaration as `file:line  property: value`. */
  unmapped: string[];
  violations: string[];
}

const VAR_CALL = /var\([^)]*\)/gu;

/** A call's own arguments, from `open` (just past its `(`) to its closing parenthesis. */
function argumentsFrom(text: string, open: number): string {
  let depth = 0;
  let end = open;
  for (; end < text.length; end += 1) {
    const ch = text[end];
    if (ch === "(") {
      depth += 1;
    } else if (ch === ")") {
      if (depth === 0) {
        break;
      }
      depth -= 1;
    }
  }
  return text.slice(open, end);
}

/** The colour literals in a value: a hex, a colour function with numbers in it, a named colour. */
function colourLiterals(bare: string): string[] {
  const found: string[] = [];
  const hex = bare.match(HEX);
  if (hex) {
    found.push(`colour literal ${hex[0]}`);
  }
  for (const call of bare.matchAll(COLOR_FN)) {
    const args = argumentsFrom(bare, (call.index ?? 0) + call[0].length);
    if (DIGIT.test(args.replace(VAR_CALL, ""))) {
      found.push(`colour literal ${call[1]}(${args.trim()})`);
    }
  }
  for (const word of bare.match(WORD) ?? []) {
    if (NAMED.has(word.toLowerCase())) {
      found.push(`colour literal ${word}`);
    }
  }
  return found;
}

/** The length literals in a value other than 0, 1px and 2px. */
function lengthLiterals(bare: string): string[] {
  const found: string[] = [];
  for (const length of bare.matchAll(LENGTH)) {
    const amount = Math.abs(Number(length[1]));
    const hairline =
      length[2]?.toLowerCase() === "px" && ALLOWED_LENGTHS.has(amount);
    if (!(amount === 0 || hairline)) {
      found.push(`length literal ${length[0]}`);
    }
  }
  return found;
}

/** What in a declaration's value is a literal it may not hold. */
function literals(value: string): string[] {
  const bare = value
    .replace(STRING, '""')
    .replace(URL, "url()")
    .replace(CUSTOM_NAME, "--");
  return [...colourLiterals(bare), ...lengthLiterals(bare)];
}

function lineOf(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i += 1) {
    if (source.charCodeAt(i) === 10) {
      line += 1;
    }
  }
  return line;
}

function check(path: string): Report {
  const file = relative(ROOT, path);
  const source = readFileSync(path, "utf8");
  const counts = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<
    Kind,
    number
  >;
  const report: Report = {
    file,
    hasStyle: false,
    counts,
    unmapped: [],
    violations: [],
  };
  let ast: ReturnType<typeof parse>;
  try {
    ast = parse(source, { modern: true });
  } catch (error) {
    report.hasStyle = source.includes("<style");
    report.violations.push(
      `${file}  does not parse: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`
    );
    return report;
  }
  const css = ast.css as
    | (Css & {
        children: Css[];
        comments: { end: number; start: number; value: string }[];
        content: { end: number; start: number; styles: string };
      })
    | null;
  if (!css) {
    return report;
  }
  report.hasStyle = true;
  const at = (offset: number) => `${file}:${lineOf(source, offset)}`;
  // The residual comments in source order, each with the kind it names.
  const marks: { end: number; kind: Kind | null; start: number }[] = [];
  for (const comment of css.comments) {
    const named = comment.value.match(RESIDUAL);
    if (!named) {
      continue;
    }
    const kind = (KINDS as readonly string[]).includes(named[1] ?? "")
      ? (named[1] as Kind)
      : null;
    if (!kind) {
      report.violations.push(
        `${at(comment.start)}  /* residual: ${named[1]} */ names no kind (${KINDS.join(", ")})`
      );
    }
    marks.push({ start: comment.start, end: comment.end, kind });
  }
  const kindAt = (offset: number): Kind | null | undefined => {
    let found: Kind | null | undefined;
    for (const mark of marks) {
      if (mark.end <= offset) {
        found = mark.kind;
      }
    }
    return found;
  };
  let declarations = 0;
  /** A declaration under its kind: counted, and held to token references. */
  const declaration = (node: Css) => {
    declarations += 1;
    const kind = kindAt(node.start);
    if (kind === undefined) {
      return;
    }
    if (kind) {
      counts[kind] += 1;
    }
    if (kind === "unmapped") {
      report.unmapped.push(
        `${at(node.start)}  ${node.property}: ${(node.value ?? "").replace(/\s+/gu, " ").trim()}`
      );
    }
    for (const literal of literals(node.value ?? "")) {
      report.violations.push(
        `${at(node.start)}  ${node.property}: ${node.value}  holds a ${literal} (only var(--…), calc() of them, 0, 1px, 2px, percentages and keywords)`
      );
    }
  };
  /** A rule or at-rule's own head: `@media (…)`, or its selector as written. */
  const headOf = (node: Css): string =>
    node.type === "Atrule"
      ? `@${node.name} ${String(node.prelude ?? "")}`.trim()
      : source.slice(node.start, source.indexOf("{", node.start)).trim();
  // One line per rule that holds a declaration under no comment.
  const walk = (nodes: Css[], trail: string) => {
    for (const node of nodes) {
      if (node.type === "Declaration") {
        declaration(node);
        continue;
      }
      const head = trail ? `${trail} › ${headOf(node)}` : headOf(node);
      const children = node.block?.children ?? [];
      const uncovered = children.filter(
        (child) =>
          child.type === "Declaration" && kindAt(child.start) === undefined
      ).length;
      if (uncovered > 0) {
        report.violations.push(
          `${at(node.start)}  ${head}  holds ${uncovered} declaration${uncovered === 1 ? "" : "s"} under no /* residual: <kind> */ comment`
        );
      }
      walk(children, head);
    }
  };
  walk(css.children, "");
  if (declarations === 0 && css.children.length === 0) {
    report.violations.push(`${at(css.start)}  an empty <style>: delete it`);
  }
  return report;
}

/** The generated theme over tokens.css: its keys say which utilities exist. */
const THEME = join(SOURCE, "lib", "tokens", "theme.css");
/** The generated token outputs: they define the tokens, they write no class. */
const GENERATED = join(SOURCE, "lib", "tokens");
const SPACING = ["spacing"];
const SIZING = ["spacing", "container"];
const COLOR = ["color"];
/**
 * Tailwind v4's own utilities by the theme namespaces their value reads
 * (tailwindcss/src/utilities.ts `themeKeys`), for the namespaces this theme
 * defines.
 */
const CORE_NAMESPACES: Record<string, string[]> = {
  ...Object.fromEntries(
    [
      "p",
      "px",
      "py",
      "pt",
      "pr",
      "pb",
      "pl",
      "ps",
      "pe",
      "pbs",
      "pbe",
      "m",
      "mx",
      "my",
      "mt",
      "mr",
      "mb",
      "ml",
      "ms",
      "me",
      "mbs",
      "mbe",
      "gap",
      "gap-x",
      "gap-y",
      "h",
      "min-h",
      "max-h",
      "size",
      "inset",
      "inset-x",
      "inset-y",
      "top",
      "right",
      "bottom",
      "left",
      "start",
      "end",
      "space-x",
      "space-y",
      "translate",
      "translate-x",
      "translate-y",
      "scroll-m",
      "scroll-mx",
      "scroll-my",
      "scroll-mt",
      "scroll-mr",
      "scroll-mb",
      "scroll-ml",
      "scroll-ms",
      "scroll-me",
      "scroll-p",
      "scroll-px",
      "scroll-py",
      "scroll-pt",
      "scroll-pr",
      "scroll-pb",
      "scroll-pl",
      "scroll-ps",
      "scroll-pe",
      "indent",
      "border-spacing",
      "border-spacing-x",
      "border-spacing-y",
    ].map((u) => [u, SPACING])
  ),
  ...Object.fromEntries(
    ["w", "min-w", "max-w", "basis"].map((u) => [u, SIZING])
  ),
  ...Object.fromEntries(
    [
      "bg",
      "border",
      "border-x",
      "border-y",
      "border-t",
      "border-r",
      "border-b",
      "border-l",
      "border-s",
      "border-e",
      "outline",
      "ring",
      "ring-offset",
      "inset-ring",
      "fill",
      "stroke",
      "decoration",
      "accent",
      "caret",
      "divide",
      "from",
      "via",
      "to",
      "placeholder",
    ].map((u) => [u, COLOR])
  ),
  ...Object.fromEntries(
    [
      "rounded",
      "rounded-t",
      "rounded-r",
      "rounded-b",
      "rounded-l",
      "rounded-s",
      "rounded-e",
      "rounded-tl",
      "rounded-tr",
      "rounded-br",
      "rounded-bl",
      "rounded-ss",
      "rounded-se",
      "rounded-es",
      "rounded-ee",
    ].map((u) => [u, ["radius"]])
  ),
  text: ["color", "text"],
  shadow: ["shadow", "color"],
  "inset-shadow": ["inset-shadow", "color"],
  "drop-shadow": ["drop-shadow", "color"],
  font: ["font", "font-weight"],
  leading: ["leading", "spacing"],
  tracking: ["tracking"],
  ease: ["ease"],
  animate: ["animate"],
  blur: ["blur"],
  "backdrop-blur": ["blur"],
  perspective: ["perspective"],
  aspect: ["aspect"],
};
/** A theme key's declaration, `--color-x: var(--x);`. */
const THEME_KEY = /^\s*(--[\w-]+)\s*:\s*([^;]*);/gmu;
/** A key's value that is one token and nothing else, `var(--x)`. */
const ONE_TOKEN = /^var\((--[\w-]+)\)$/u;
/** A house functional utility, `@utility name-* { … }`. */
const HOUSE_UTILITY = /@utility\s+([\w-]+)-\*\s*\{([^}]*)\}/gu;
/** A utility's `--value(…)` call. */
const VALUE_CALL = /--value\(([^)]*)\)/gu;
/** A theme namespace `--value()` reads, `--spacing-*`. */
const VALUE_NAMESPACE = /--([\w-]+)-\*/gu;
/** The files the token rule reads. */
const CLASS_FILE = /\.(svelte|ts|js)$/u;
/** Every namespace a key can sit in, longest first, so `--font-weight-x` is `font-weight`, not `font`. */
const NAMESPACES = [
  ...new Set([...Object.values(CORE_NAMESPACES).flat(), "duration"]),
].sort((a, b) => b.length - a.length);

/** A theme key's namespace and its name in it: `--color-surface-raised` → color, surface-raised. */
function keyOf(key: string): { name: string; space: string } | null {
  for (const space of NAMESPACES) {
    if (key.startsWith(`--${space}-`)) {
      return { space, name: key.slice(space.length + 3) };
    }
  }
  return null;
}

/**
 * The theme keys each written token stands behind: a key `--color-x:
 * var(--x)` puts `--x` (and the key itself) behind `color` key `x`.
 */
function themeTokens(): Map<string, { name: string; space: string }[]> {
  const behind = new Map<string, { name: string; space: string }[]>();
  const add = (token: string, entry: { name: string; space: string }) => {
    behind.set(token, [...(behind.get(token) ?? []), entry]);
  };
  const css = readFileSync(THEME, "utf8");
  for (const line of css.matchAll(THEME_KEY)) {
    const key = line[1] ?? "";
    const entry = keyOf(key);
    if (!entry) {
      continue;
    }
    add(key, entry);
    const only = (line[2] ?? "").trim().match(ONE_TOKEN);
    if (only?.[1]) {
      add(only[1], entry);
    }
  }
  return behind;
}

/** The house `@utility name-* { … --value(--ns-*) … }` blocks, by the namespaces each reads. */
function houseNamespaces(): Record<string, string[]> {
  const found: Record<string, string[]> = {};
  const sheets = [
    THEME,
    ...readdirSync(SOURCE)
      .filter((entry) => entry.endsWith(".css"))
      .map((entry) => join(SOURCE, entry)),
  ];
  for (const sheet of sheets) {
    const css = readFileSync(sheet, "utf8");
    for (const block of css.matchAll(HOUSE_UTILITY)) {
      const spaces = [...(block[2] ?? "").matchAll(VALUE_CALL)].flatMap(
        (value) =>
          [...(value[1] ?? "").matchAll(VALUE_NAMESPACE)].map((m) => m[1] ?? "")
      );
      if (spaces.length > 0 && block[1]) {
        found[block[1]] = [...new Set(spaces)];
      }
    }
  }
  return found;
}

/** `utility-[var(--x)]` or `utility-(--x)`, a variant's `:` or a `-` sign before it; no fallback in the var. */
const TOKEN_ARBITRARY =
  /(?<![\w-])-?([a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*)-(?:\[var\((--[\w-]+)\)\]|\((--[\w-]+)\))(?![\w-])/gu;

/** Each class in `path` that writes a theme token as an arbitrary value, with the utility that says it. */
function tokenArbitraries(
  path: string,
  behind: Map<string, { name: string; space: string }[]>,
  reads: Record<string, string[]>
): string[] {
  const file = relative(ROOT, path);
  const source = readFileSync(path, "utf8");
  const found: string[] = [];
  for (const match of source.matchAll(TOKEN_ARBITRARY)) {
    const utility = match[1] ?? "";
    const token = match[2] ?? match[3] ?? "";
    if (utility === "duration") {
      continue;
    }
    const spaces = reads[utility];
    const key = spaces
      ? (behind.get(token) ?? []).find((entry) => spaces.includes(entry.space))
      : undefined;
    if (!key) {
      continue;
    }
    const sign = match[0].startsWith("-") ? "-" : "";
    found.push(
      `${file}:${lineOf(source, match.index ?? 0)}  ${match[0]} writes the theme token --${key.space}-${key.name} as an arbitrary value: write ${sign}${utility}-${key.name}`
    );
  }
  return found;
}

/** The files whose classes the token rule reads: markup and recipes. */
function classFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (SKIP_DIRS.has(entry) || path === GENERATED) {
      continue;
    }
    if (statSync(path).isDirectory()) {
      out.push(...classFiles(path));
    } else if (CLASS_FILE.test(entry)) {
      out.push(path);
    }
  }
  return out.sort();
}

function svelteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (SKIP_DIRS.has(entry)) {
      continue;
    }
    if (statSync(path).isDirectory()) {
      out.push(...svelteFiles(path));
    } else if (entry.endsWith(".svelte")) {
      out.push(path);
    }
  }
  return out.sort();
}

const args = process.argv.slice(2);
const noCap = args.includes("--no-cap");
const list = args.includes("--list");
const named = args.filter((arg) => arg !== "--no-cap" && arg !== "--list");
const whole = named.length === 0;
const files = whole
  ? svelteFiles(SOURCE)
  : named.map((arg) => {
      const here = resolve(arg);
      return existsSync(here) ? here : resolve(ROOT, arg);
    });
const missing = files.filter((file) => !existsSync(file));
if (missing.length > 0) {
  console.error(`no such file: ${missing.join(", ")}`);
  process.exit(2);
}
/** Unmapped declarations allowed per file: 0 over the whole tree, 5 in a lane, none counted with --no-cap. */
const laneCap = noCap ? Number.POSITIVE_INFINITY : LANE_CAP;
const cap = whole ? 0 : laneCap;
const totals = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<
  Kind,
  number
>;
let styled = 0;
let violations = 0;
for (const path of files) {
  const report = check(path);
  if (report.hasStyle && report.counts.unmapped > cap) {
    report.violations.push(
      `${report.file}  ${report.counts.unmapped} unmapped declarations (at most ${cap}${whole ? ": the whole tree clears them at integration" : " in a lane: STOP"})`
    );
  }
  if (report.hasStyle) {
    styled += 1;
    for (const kind of KINDS) {
      totals[kind] += report.counts[kind];
    }
    console.log(
      `${report.file}: ${KINDS.map((k) => `${k} ${report.counts[k]}`).join(", ")}${report.violations.length > 0 ? ` · ${report.violations.length} violation${report.violations.length === 1 ? "" : "s"}` : ""}`
    );
  } else if (!whole) {
    console.log(`${report.file}: no <style>`);
  }
  if (list) {
    for (const line of report.unmapped) {
      console.log(`  unmapped ${line}`);
    }
  }
  for (const line of report.violations) {
    console.log(`  ${line}`);
  }
  violations += report.violations.length;
}
const themeBehind = themeTokens();
const utilityReads = { ...CORE_NAMESPACES, ...houseNamespaces() };
const classed = whole
  ? classFiles(SOURCE)
  : files.filter((path) => !path.startsWith(GENERATED));
let arbitraries = 0;
for (const path of classed) {
  for (const line of tokenArbitraries(path, themeBehind, utilityReads)) {
    console.log(`  ${line}`);
    arbitraries += 1;
  }
}
violations += arbitraries;
console.log(
  `${classed.length} file${classed.length === 1 ? "" : "s"} read for theme tokens written as arbitrary values: ${arbitraries}`
);
console.log(
  `${whole ? "apps/dashboard/src: " : ""}${styled} file${styled === 1 ? "" : "s"} with a <style> of ${files.length}; declarations by kind: ${KINDS.map((k) => `${k} ${totals[k]}`).join(", ")}; ${violations} violation${violations === 1 ? "" : "s"}`
);
process.exit(violations === 0 ? 0 : 1);

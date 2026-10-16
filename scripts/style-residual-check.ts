/**
 * `bun scripts/style-residual-check.ts` (part of `bun run lint`): what may
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
 *
 * Prints, per file with a `<style>`, its declarations by kind, then each
 * violation as `file:line  what`. Exits 1 on any violation.
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

const RESIDUAL = /^\s*residual:\s*([a-z-]+)/;
const LENGTH =
  /(?<![\w.#-])(-?(?:\d+\.?\d*|\.\d+))(px|em|rem|ch|ex|cap|ic|lh|rlh|vw|vh|vi|vb|vmin|vmax|svw|svh|svi|svb|lvw|lvh|dvw|dvh|dvi|dvb|cqw|cqh|cqi|cqb|cqmin|cqmax|cm|mm|q|in|pt|pc)(?![\w-])/gi;
const HEX = /#[0-9a-f]{3,8}(?![\w-])/i;
const COLOR_FN = /(?<![\w-])(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi;
const DIGIT = /\d/;
const WORD = /[a-z][a-z-]*/gi;
const STRING = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;
const URL = /url\([^)]*\)/gi;
/** A custom property's name, `--x` in `var(--x)` or a declaration's own: never a colour word. */
const CUSTOM_NAME = /--[\w-]+/g;
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
  violations: string[];
}

const VAR_CALL = /var\([^)]*\)/g;

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
  const report: Report = { file, hasStyle: false, counts, violations: [] };
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

function svelteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) {
      continue;
    }
    const path = join(dir, entry);
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
const named = args.filter((arg) => arg !== "--no-cap");
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
  for (const line of report.violations) {
    console.log(`  ${line}`);
  }
  violations += report.violations.length;
}
console.log(
  `${whole ? "apps/dashboard/src: " : ""}${styled} file${styled === 1 ? "" : "s"} with a <style> of ${files.length}; declarations by kind: ${KINDS.map((k) => `${k} ${totals[k]}`).join(", ")}; ${violations} violation${violations === 1 ? "" : "s"}`
);
process.exit(violations === 0 ? 0 : 1);

/**
 * `bun scripts/codemods/tokens-to-theme.ts`: moves the dashboard's design
 * tokens from the generated pair (`tokens.css`, plain variables; `theme.css`,
 * Tailwind's names over them) to one hand-kept `theme.css`, Tailwind's
 * `@theme`, where each token is declared once under the name Tailwind reads
 * it by. Nothing generates it any more.
 *
 * Run on a tree that still has `apps/dashboard/src/lib/tokens/tokens.css`, it
 * does everything:
 *
 *   A. builds the rename map from the old theme's `@theme inline` lines
 *      (`--T: var(--O)` renames O to T; the first T of an O is its name, the
 *      later ones stay as aliases; a token the theme already names by its own
 *      name (the `@theme inline reference` block) keeps it) and writes it to
 *      `tokens-to-theme.map.json`;
 *   B. writes the new theme.css;
 *   C. renames every use of a mapped name in the dashboard's source and
 *      scripts, the packages and the repository's scripts, then applies the
 *      explicit EDITS below (the places a name is built from parts, and the
 *      readers of the files this retires);
 *   and formats what it changed.
 *
 * Run on a tree without tokens.css (a branch written with the old names,
 * rebased onto the tree this landed in), it does the renames of C alone, from
 * the map file. A second run changes nothing.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import postcss, {
  type AtRule,
  type ChildNode,
  type Declaration,
  type Rule,
} from "postcss";
import { formatText } from "../fmt";
import { ROOT, repoFiles } from "../lib/repo-files";

const TOKENS_DIR = "apps/dashboard/src/lib/tokens";
const OLD_TOKENS = `${TOKENS_DIR}/tokens.css`;
const THEME = `${TOKENS_DIR}/theme.css`;
const MAP = "scripts/codemods/tokens-to-theme.map.json";

const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const write = (path: string, text: string) =>
  writeFileSync(join(ROOT, path), text);

/** What the map file holds. */
export interface RenameMap {
  /** A name the theme keeps a second line for: `--T2: var(--T)`. */
  aliases: Record<string, string>;
  /** Old name to new name, both with their `--`. */
  renames: Record<string, string>;
}

/** A custom property's name, whole: not part of a longer one. */
const NAME = /(?<![\w-])--[\w-]+/gu;
const renamer = (renames: Record<string, string>) => (text: string) =>
  text.replace(NAME, (name) => renames[name] ?? name);

const VAR_ONLY = /^var\((--[\w-]+)\)$/u;
const varOf = (value: string) => VAR_ONLY.exec(value.trim())?.[1];

// ---- A and B ---------------------------------------------------------------

interface Built {
  map: RenameMap;
  theme: string;
}

/** The nodes of an at-rule or rule, comments kept. */
const kids = (node: { nodes?: ChildNode[] }) => node.nodes ?? [];

const themeBlock = (root: postcss.Root, params: string): AtRule => {
  const found = root.nodes.find(
    (n): n is AtRule =>
      n.type === "atrule" && n.name === "theme" && n.params === params
  );
  if (!found) {
    throw new Error(`${THEME}: no @theme ${params}`.trim());
  }
  return found;
};

/**
 * A. The map. A name the reference block gives to itself is already the name
 * Tailwind reads it by, and stays; every `@theme inline` line over it is then
 * an alias, as is every line after the first over one name.
 */
function mapOf(inline: AtRule, reference: AtRule): RenameMap {
  const named = new Set<string>();
  for (const node of kids(reference)) {
    if (node.type === "decl" && varOf(node.value) === node.prop) {
      named.add(node.prop);
    }
  }
  const renames: Record<string, string> = {};
  const aliases: Record<string, string> = {};
  const first = new Map<string, string>(); // old name to its first new name
  for (const node of kids(inline)) {
    const old = node.type === "decl" ? varOf(node.value) : undefined;
    if (node.type !== "decl" || old === undefined) {
      continue;
    }
    const taken = named.has(old) ? old : first.get(old);
    if (taken !== undefined) {
      aliases[node.prop] = taken;
      continue;
    }
    first.set(old, node.prop);
    if (node.prop !== old) {
      renames[old] = node.prop;
    }
  }
  return { aliases, renames };
}

/** The stop conditions: a mapped name tokens.css does not declare, or a new name it already does. */
function checkMap(renames: Record<string, string>, tokens: postcss.Root) {
  const declared = new Set<string>();
  tokens.walkDecls((d) => {
    if (d.prop.startsWith("--")) {
      declared.add(d.prop);
    }
  });
  for (const [old, now] of Object.entries(renames)) {
    if (!declared.has(old)) {
      throw new Error(`${old}: mapped, but tokens.css does not declare it`);
    }
    if (declared.has(now)) {
      throw new Error(`${old} -> ${now}: tokens.css already declares ${now}`);
    }
  }
}

/**
 * The lines of a block, renamed: each declaration under the comments that
 * stood above it. A declaration `keep` refuses takes its comments with it.
 */
function linesOf(
  nodes: ChildNode[],
  rename: (text: string) => string,
  keep: (d: Declaration) => boolean = () => true
): string[] {
  const out: string[] = [];
  let comments: string[] = [];
  for (const node of nodes) {
    if (node.type === "comment") {
      comments.push(`/* ${node.text.trim()} */`);
    } else if (node.type === "decl" && !keep(node)) {
      comments = [];
    } else {
      // A declaration, or a nested at-rule (keyframes) as it stood.
      out.push(
        ...comments,
        node.type === "decl"
          ? `${rename(node.prop)}: ${rename(node.value)};`
          : rename(node.toString())
      );
      comments = [];
    }
  }
  return out;
}

const indent = (text: string, by = 2) =>
  text
    .split("\n")
    .map((l) => (l ? " ".repeat(by) + l : l))
    .join("\n");

function build(): Built {
  const oldTheme = postcss.parse(read(THEME));
  const oldTokens = postcss.parse(read(OLD_TOKENS));
  const literals = themeBlock(oldTheme, "");
  const inline = themeBlock(oldTheme, "inline");
  const map = mapOf(inline, themeBlock(oldTheme, "inline reference"));
  checkMap(map.renames, oldTokens);
  const rn = renamer(map.renames);

  // B. tokens.css: one `@layer theme`, its `:root` the tokens (each under the
  // comment that stood above it), then the overrides.
  const layer = oldTokens.nodes.find(
    (n): n is AtRule => n.type === "atrule" && n.name === "layer"
  );
  const root = kids(layer ?? { nodes: [] }).find(
    (n): n is Rule => n.type === "rule" && n.selector === ":root"
  );
  if (!(layer && root)) {
    throw new Error(`${OLD_TOKENS}: expected @layer theme { :root { … } }`);
  }
  const tokenLines = linesOf(kids(root), rn);
  const literalLines = linesOf(kids(literals), rn);
  // The `@theme inline` block's own: aliases, literals and keyframes. Its
  // lines over a variable tokens.css declares moved to `@theme static`.
  const inlineLines = linesOf(kids(inline), rn, (d) => {
    const old = varOf(d.value);
    return old === undefined || d.prop in map.aliases;
  });
  const utilities = oldTheme.nodes
    .filter((n): n is AtRule => n.type === "atrule" && n.name === "utility")
    .map((n) => rn(n.toString()));
  const overrideText = kids(layer)
    .filter((n) => n !== root)
    .map((n) => rn(n.toString()))
    .join("\n\n");

  const theme = [
    `/* The dashboard's design tokens, declared by hand: every one here once, in
   Tailwind's @theme under the name Tailwind reads it by (tailwindcss.com/docs/theme),
   so a utility exists only where a token does. A new value is added here.
   \`static\` writes every variable out, and a variable is read, not inlined, so
   the override blocks at the foot reach the utilities too. */`,
    `@theme static {\n${indent(literalLines.join("\n"))}\n\n${indent(tokenLines.join("\n"))}\n}`,
    `@theme inline {\n${indent(inlineLines.join("\n"))}\n}`,
    ...utilities,
    `@layer theme {\n${indent(overrideText)}\n}`,
  ].join("\n\n");

  return { map, theme };
}

// ---- C ---------------------------------------------------------------------

const ROOTS = [
  "apps/dashboard/src/",
  "apps/dashboard/scripts/",
  "packages/",
  "scripts/",
];
const EXTENSIONS = /\.(svelte|css|ts|tsx|js|mjs|html)$/u;
/** The decision-page skill's own words name the kit's variables too. */
const KIT_DOCS = /^packages\/hub\/skills\/decision-page\/.*\.md$/u;
/** Never renamed: other projects' tokens, the retired build, generated or kept as written. */
const SKIPPED = [
  /^design-previews\//u,
  /^apps\/apple\//u,
  /^\.design-foundations\//u,
  /(^|\/)node_modules\//u,
  /^packages\/hub\/src\/design-tokens\.ts$/u,
  /(^|\/)dtcg-[^/]*$/u,
  /^scripts\/codemods\//u,
  // Planted mistakes whose line and column the lint holds them to.
  /^scripts\/lint\/fixtures\//u,
  /^apps\/dashboard\/src\/lib\/tokens\/(theme|tokens)\.(css|ts)$/u,
  /^apps\/dashboard\/scripts\/build-tokens(-apple)?\.ts$/u,
  /^scripts\/token-alias-check\.ts$/u,
];
const eligible = (path: string) =>
  ROOTS.some((r) => path.startsWith(r)) &&
  (EXTENSIONS.test(path) || KIT_DOCS.test(path)) &&
  !SKIPPED.some((s) => s.test(path)) &&
  existsSync(join(ROOT, path));

/**
 * The places a variable name is built from parts (a template or a
 * concatenation starting `--`), and the readers of the files this retires:
 * in `file`, every `find` becomes `replace`; one that is not there stops the run.
 */
interface Edit {
  file: string;
  find: string;
  replace: string;
}
const EDITS: Edit[] = [
  {
    file: "apps/dashboard/src/lib/cawco/ProjectEnd.stories.ts",
    find: "var(--mark-$\u007b",
    replace: "var(--color-mark-$\u007b",
  },
  {
    file: "apps/dashboard/src/lib/cawco/StopTray.svelte",
    find: "var(--mark-$\u007b",
    replace: "var(--color-mark-$\u007b",
  },
  {
    file: "apps/dashboard/src/lib/cawco/StopTrayPick.svelte",
    find: "var(--mark-$\u007b",
    replace: "var(--color-mark-$\u007b",
  },
  {
    file: "apps/dashboard/src/lib/cawco/decides/KindTile.svelte",
    find: "var(--mark-$\u007b",
    replace: "var(--color-mark-$\u007b",
  },
  {
    file: "apps/dashboard/src/lib/cawco/decides/MemberFace.svelte",
    find: "var(--mark-$\u007b",
    replace: "var(--color-mark-$\u007b",
  },
  {
    file: "apps/dashboard/src/lib/cawco/home/GroupParent.svelte",
    find: "var(--mark-$\u007b",
    replace: "var(--color-mark-$\u007b",
  },
  {
    file: "apps/dashboard/src/routes/dev/project-ends/+page.svelte",
    find: "var(--mark-$\u007b",
    replace: "var(--color-mark-$\u007b",
  },
  {
    file: "apps/dashboard/src/lib/cawco/ProjectMark.svelte",
    find: "var(--mark-{",
    replace: "var(--color-mark-{",
  },
  {
    file: "apps/dashboard/src/lib/cawco/SessionCard.svelte",
    find: "var(--mark-{",
    replace: "var(--color-mark-{",
  },
  {
    file: "apps/dashboard/src/lib/cawco/SessionMark.svelte",
    find: "var(--mark-{",
    replace: "var(--color-mark-{",
  },
  {
    file: "apps/dashboard/src/lib/cawco/SessionReference.svelte",
    find: "var(--mark-{",
    replace: "var(--color-mark-{",
  },
  {
    file: "apps/dashboard/src/lib/cawco/home/NeedsCard.svelte",
    find: "var(--mark-{",
    replace: "var(--color-mark-{",
  },
  {
    file: "apps/dashboard/src/lib/cawco/transcript/Delegate.svelte",
    find: "var(--mark-{",
    replace: "var(--color-mark-{",
  },
  {
    file: "apps/dashboard/src/lib/cawco/transcript/DelegateTray.svelte",
    find: "var(--mark-{",
    replace: "var(--color-mark-{",
  },
  {
    file: "apps/dashboard/src/lib/cawco/transcript/Subagent.svelte",
    find: "var(--mark-{",
    replace: "var(--color-mark-{",
  },
  {
    file: "apps/dashboard/src/lib/cawco/workspace/PaneTabs.svelte",
    find: "var(--mark-{",
    replace: "var(--color-mark-{",
  },
  {
    file: "apps/dashboard/src/routes/(app)/motion/echo/+page.svelte",
    find: "var(--mark-{",
    replace: "var(--color-mark-{",
  },
  {
    file: "apps/dashboard/src/lib/cawco/TreeMark.svelte",
    find: "var(--status-$\u007bdot}-glyph)",
    replace: "var(--color-status-$\u007bdot}-glyph)",
  },
  {
    file: "apps/dashboard/src/lib/cawco/accounts/model.svelte.ts",
    find: "var(--account-$\u007b",
    replace: "var(--color-account-$\u007b",
  },
  {
    file: "apps/dashboard/src/lib/cawco/spawn/NewSessionForm.svelte",
    find: "var(--account-$\u007b",
    replace: "var(--color-account-$\u007b",
  },
  {
    file: "apps/dashboard/src/lib/cawco/usage/rings.ts",
    find: "var(--account-$\u007b",
    replace: "var(--color-account-$\u007b",
  },
  {
    file: "apps/dashboard/src/lib/cawco/config/sections.ts",
    find: "var(--$\u007bsection.hue})",
    replace: "var(--color-$\u007bsection.hue})",
  },
  {
    file: "apps/dashboard/src/lib/cawco/graph/DialChoice.svelte",
    find: "var(--$\u007bcolour})",
    replace: "var(--color-$\u007bcolour})",
  },
  {
    file: "apps/dashboard/src/lib/cawco/graph/bench/moves.ts",
    find: "`--dur-$\u007bstring}`",
    replace: "`--duration-$\u007bstring}`",
  },
  {
    file: "apps/dashboard/src/lib/cawco/motion/curves.svelte.ts",
    find: "`--dur-$\u007bstring}`",
    replace: "`--duration-$\u007bstring}`",
  },
  {
    file: "apps/dashboard/src/lib/cawco/motion/route.svelte.ts",
    find: "`--dur-$\u007bstring}`",
    replace: "`--duration-$\u007bstring}`",
  },
  {
    file: "apps/dashboard/src/lib/components/ui/highlight/highlight.svelte.ts",
    find: "`--dur-$\u007bstring}`",
    replace: "`--duration-$\u007bstring}`",
  },
  {
    file: "scripts/lint/design/restricted.mjs",
    find: "const DURATION_TOKEN = /^--dur-/u;",
    replace: "const DURATION_TOKEN = /^--duration-/u;",
  },
  {
    file: "packages/agent/src/stage-host/build.ts",
    find: "/** CawCo's tokens as the dashboard builds them (`bun run tokens`), for the canvas page's own style. */\nconst TOKENS = join(REPO, \"apps/dashboard/src/lib/tokens/tokens.css\");",
    replace:
      "/** CawCo's tokens as plain CSS (the decision-page kit's, the declarations of the dashboard's theme.css), for the canvas page's own style. */\nconst TOKENS = join(REPO, \"packages/hub/skills/decision-page/kit/tokens.css\");",
  },
  {
    file: "scripts/border-width-check.ts",
    find: 'const TOKENS = "apps/dashboard/src/lib/tokens/tokens.css";',
    replace: 'const TOKENS = "apps/dashboard/src/lib/tokens/theme.css";',
  },
  {
    file: "scripts/border-width-check.ts",
    find: " *  - a token (tokens.css, from design/tokens) that is a border's width (its",
    replace: " *  - a token (theme.css) that is a border's width (its",
  },
  {
    file: "scripts/border-width-check.ts",
    find: "/** Every token's value, by name, from tokens.css (each scheme's block alike). */",
    replace:
      "/** Every token's value, by name, from theme.css (each scheme's block alike). */",
  },
  {
    file: "scripts/probe-kit/rendered-checks.ts",
    find: '/** tokens.css\'s own values, each `var()` written out, for a page whose stylesheet names none of them. */\nconst TOKEN_VALUES = (() => {\n  const css = readFileSync(\n    join(ROOT, "apps", "dashboard", "src", "lib", "tokens", "tokens.css"),\n    "utf8"\n  );',
    replace:
      '/** The kit\'s tokens.css values (the declarations of the dashboard\'s theme.css), each `var()` written out, for a page whose stylesheet names none of them. A name is a colour token\'s, read as `--color-<name>`. */\nconst TOKEN_VALUES = (() => {\n  const css = readFileSync(\n    join(ROOT, "packages", "hub", "skills", "decision-page", "kit", "tokens.css"),\n    "utf8"\n  );',
  },
  {
    file: "scripts/probe-kit/rendered-checks.ts",
    find: '    names.map((name) => ({ name, value: out(raw.get(name) ?? "transparent") }));',
    replace:
      '    names.map((name) => ({\n      name: `color-$\u007bname}`,\n      value: out(raw.get(`color-$\u007bname}`) ?? "transparent"),\n    }));',
  },
  {
    file: "scripts/probe-kit/specs/canvas-cost.ts",
    find: 'readFileSync(join(APP, "src/lib/tokens/tokens.css"), "utf8")',
    replace:
      'readFileSync(\n    join(ROOT, "packages/hub/skills/decision-page/kit/tokens.css"),\n    "utf8"\n  )',
  },
  {
    file: "scripts/token-contrast-check.ts",
    find: " * The values come from the token build itself: `buildTokens` over\n * design/tokens/cawco.resolver.json and the build's own evaluator\n * (packages/hub/src/design-css.ts, on colorjs.io), which resolves",
    replace:
      " * The values are the declarations of the dashboard's theme.css (its\n * `@theme static` block, and the dark scheme's block where a value differs),\n * read by the evaluator (packages/hub/src/design-css.ts, on colorjs.io), which resolves",
  },
  {
    file: "scripts/token-contrast-check.ts",
    find: 'import { join } from "node:path";\nimport Color from "colorjs.io";\nimport { ACCOUNT_HUES } from "../packages/core/src/accounts";\nimport { STATUS_PAIRS } from "../packages/core/src/views";\nimport { buildTokens, evaluatorOf } from "../packages/hub/src/design-tokens";\n\nconst DIR = join(import.meta.dir, "../design/tokens");',
    replace:
      'import { readFileSync } from "node:fs";\nimport { join } from "node:path";\nimport Color from "colorjs.io";\nimport postcss from "postcss";\nimport { ACCOUNT_HUES } from "../packages/core/src/accounts";\nimport { STATUS_PAIRS } from "../packages/core/src/views";\nimport { CssEvaluator, type CssToken } from "../packages/hub/src/design-css";\n\nconst THEME = join(\n  import.meta.dir,\n  "../apps/dashboard/src/lib/tokens/theme.css"\n);',
  },
  {
    file: "scripts/token-contrast-check.ts",
    find: 'const built = await buildTokens(\n  "cawco.resolver.json",\n  (path) => Bun.file(join(DIR, path)).json(),\n  { header: "", layer: "theme", typesFrom: "" }\n);\nconst ev = evaluatorOf(built.view);\nconst [darkContext] = built.view.darkContexts;\nif (!darkContext) {\n  throw new Error("token-contrast: the resolver has no dark context");\n}\nconst MODE: Record<Theme, string> = { light: "base", dark: darkContext };',
    replace:
      '/** A value with each `var(--x)` written `{x}`, as the evaluator reads a reference. */\nconst refs = (value: string) => value.replace(/var\\(--([\\w-]+)\\)/gu, "{$1}");\n/** The theme\'s variables by name: the `@theme static` block\'s, and the dark scheme\'s own where it differs. */\nconst themeLight = new Map<string, string>();\nconst themeDark = new Map<string, string>();\npostcss.parse(readFileSync(THEME, "utf8")).walkDecls((decl) => {\n  const rule = decl.parent;\n  if (!decl.prop.startsWith("--")) {\n    return;\n  }\n  if (rule?.type === "atrule" && rule.name === "theme" && rule.params === "static") {\n    themeLight.set(decl.prop.slice(2), refs(decl.value));\n  } else if (rule?.type === "rule" && rule.selectors.includes(\'[data-scheme="dark"]\')) {\n    themeDark.set(decl.prop.slice(2), refs(decl.value));\n  }\n});\n/** A token path (`color.surface-page`) as the theme names it: its last segment, under `--color-` or as it stands. */\nconst lookup = (path: string): CssToken | undefined => {\n  const leaf = path.split(".").at(-1) ?? path;\n  for (const name of [`color-$\u007bleaf}`, leaf]) {\n    const css = themeLight.get(name);\n    if (css !== undefined) {\n      const variant = themeDark.get(name);\n      return {\n        css,\n        name,\n        variants: variant === undefined ? {} : { dark: variant },\n      };\n    }\n  }\n  return undefined;\n};\nconst ev = new CssEvaluator(lookup, new Set(["dark"]));\nconst MODE: Record<Theme, string> = { light: "base", dark: "dark" };',
  },
  {
    file: "apps/dashboard/scripts/role-order.ts",
    find: " * placed after a longhand. `bun scripts/build-tokens.ts --check` runs it.",
    replace:
      " * placed after a longhand, from the keys and utilities in theme.css.\n * `bun run check` runs it.",
  },
  {
    file: "apps/dashboard/scripts/role-order.ts",
    find: 'import type { TailwindTheme } from "../../../packages/hub/src/design-tokens";\n\nconst APP_CSS = "src/app.css";',
    replace:
      '\nconst APP_CSS = "src/app.css";\n/** The tokens and the utilities over them. */\nconst THEME = "src/lib/tokens/theme.css";',
  },
  {
    file: "apps/dashboard/scripts/role-order.ts",
    find: "export async function fontOrderDrift(theme: TailwindTheme): Promise<string[]> {\n  const appCss = await Bun.file(APP_CSS).text();",
    replace:
      'async function fontOrderDrift(): Promise<string[]> {\n  const themeCss = await Bun.file(THEME).text();\n  const utilities = [...themeCss.matchAll(/^@utility ([\\w-]+) \\{/gmu)].map(\n    ([, name]) => name as string\n  );\n  const keys = (ns: string) =>\n    [...themeCss.matchAll(new RegExp(`^\\\\s*--$\u007bns}-([\\\\w-]+):`, "gmu"))]\n      .map(([, key]) => key as string)\n      .filter((key) => ns !== "font" || !key.startsWith("weight-"));\n  const appCss = await Bun.file(APP_CSS).text();',
  },
  {
    file: "apps/dashboard/scripts/role-order.ts",
    find: '    ...theme.utilities.filter((u) => u.startsWith("type-")),',
    replace: '    ...utilities.filter((u) => u.startsWith("type-")),',
  },
  {
    file: "apps/dashboard/scripts/role-order.ts",
    find: '    ...theme.utilities.filter(\n      (u) => u.startsWith("text-size-") || u === "liga-none"\n    ),',
    replace:
      '    ...utilities.filter(\n      (u) => u.startsWith("text-size-") || u === "liga-none"\n    ),',
  },
  {
    file: "apps/dashboard/scripts/role-order.ts",
    find: "      (theme.keys.get(ns) ?? []).map(({ key }) => `$\u007bprefix}$\u007bkey}`)",
    replace: "      keys(ns).map((key) => `$\u007bprefix}$\u007bkey}`)",
  },
  {
    file: "apps/dashboard/scripts/role-order.ts",
    find: '        `$\u007bshort} sorts after $\u007blonghands.filter((l) => at(l) < at(short)).join(", ")}`\n    );\n}\n',
    replace:
      '        `$\u007bshort} sorts after $\u007blonghands.filter((l) => at(l) < at(short)).join(", ")}`\n    );\n}\n\nconst drift = await fontOrderDrift();\nfor (const wrong of drift) {\n  console.error(`role-order: $\u007bTHEME}: $\u007bwrong}`);\n}\nconsole.log(\n  drift.length === 0\n    ? "role-order: every font shorthand utility sorts before every font longhand utility"\n    : `role-order: $\u007bdrift.length} font shorthand utilities sort after a longhand`\n);\nprocess.exit(drift.length === 0 ? 0 : 1);\n',
  },
  {
    file: "apps/dashboard/src/design.css",
    find: '/* Every token the app reads, generated from design/tokens/cawco.tokens.json\n   (`bun run tokens`). This sheet defines none of its own. */\n@import "./lib/tokens/tokens.css";\n/* The Tailwind theme over them (`bun run tokens`): a utility exists only\n   where a token does. */\n@import "./lib/tokens/theme.css";\n/* The browser\'s selection in its tint (`bun run tokens`), the value written\n   out so no element restyles its selection with it. */',
    replace:
      "/* Every token the app reads, declared once, by hand, in Tailwind's @theme: a\n   utility exists only where a token does. */\n@import \"./lib/tokens/theme.css\";\n/* The browser's selection in its tint, the value written out so no element\n   restyles its selection with it. */",
  },
  {
    file: "apps/dashboard/src/lib/tokens/selection.css",
    find: "/* Generated by `bun run tokens` from design/tokens/cawco.tokens.json.\n   Do not edit: change the token source and rebuild. The browser's\n   selection in the selection tint (color.selection), its value written\n   out: a var() here restyles every element that declares a custom\n   property of its own (scripts/build-tokens.ts SELECTION_OUT). */",
    replace:
      "/* The browser's selection in the selection tint (--color-selection in\n   theme.css), its value written out by hand: a var() here restyles every\n   element that declares a custom property of its own. Change it with the\n   token. */",
  },
  {
    file: "apps/apple/Packages/CawCoKit/Sources/CawCoDesign/Generated/Tokens.swift",
    find: "// Generated by `bun run tokens` (apps/dashboard) from design/tokens/cawco.tokens.json.\n// Do not edit: change the token source and rebuild.",
    replace:
      "// Last taken from the dashboard's tokens (apps/dashboard/src/lib/tokens/theme.css) on 2026-11-12.\n// Nothing regenerates this file; the app is on hold.",
  },
  {
    file: "biome.jsonc",
    find: '      // generated by apps/dashboard/scripts/build-tokens.ts, held to it by its --check, and\n      // compiled by Tailwind there and in vite build. Its `@theme inline reference` block is\n      // Tailwind 4 syntax Biome 2.5.15\'s parser rejects ("expected `{` but instead found\n      // `reference`"); `@theme reference` alone parses but adds self-fallbacks to every utility.',
    replace:
      "      // Tailwind 4 syntax (`@theme static`, `@theme inline`), compiled by Tailwind in vite build;\n      // Biome 2.5.15's parser does not read it.",
  },
  {
    file: ".jscpd.json",
    find: '    "apps/dashboard/src/lib/tokens/tokens.ts",\n',
    replace: "",
  },
  {
    file: "scripts/lint/no-raw-css-values.grit",
    find: "add it to design/tokens/cawco.tokens.json first (then bun run tokens)",
    replace: "add it to apps/dashboard/src/lib/tokens/theme.css first",
  },
  {
    file: "scripts/lint/no-raw-motion.grit",
    find: "add it to design/tokens/cawco.tokens.json first (then bun run tokens)",
    replace: "add it to apps/dashboard/src/lib/tokens/theme.css first",
  },
  {
    file: "scripts/lint/no-raw-motion.grit",
    find: "write var(--dur-…), and",
    replace: "write var(--duration-…), and",
  },
  {
    file: "scripts/lint/design/raw-motion.mjs",
    find: 'write var(--dur-…), dur("--dur-…") in a script',
    replace: 'write var(--duration-…), dur("--duration-…") in a script',
  },
  {
    file: "apps/dashboard/scripts/tab-icon-art.ts",
    find: '/** A token\'s CSS (its base value), wherever its group is. */\nfunction token(name: string): string {\n  const find = (node: unknown): string | undefined => {\n    if (!node || typeof node !== "object") {\n      return;\n    }\n    const group = node as Record<string, unknown>;\n    const hit = group[name] as Record<string, unknown> | undefined;\n    if (hit && "$value" in hit) {\n      return cssOfNode(String(hit.$type), hit, name);\n    }\n    for (const child of Object.values(group)) {\n      const found = find(child);\n      if (found) {\n        return found;\n      }\n    }\n  };\n  const value = find(\n    JSON.parse(\n      readFileSync(here("../../design/tokens/cawco.tokens.json"), "utf8")\n    )\n  );\n  if (!value) {\n    throw new Error(`No token named $\u007bname}`);\n  }\n  return value;\n}\n',
    replace:
      '/** A token\'s CSS, from its declaration in theme.css: `--color-spark`, `--radius-tab-icon`. */\nfunction token(name: string): string {\n  const css = readFileSync(here("src/lib/tokens/theme.css"), "utf8");\n  const value = new RegExp(`^\\\\s*$\u007bname}:\\\\s*([^;]+);`, "mu").exec(css)?.[1];\n  if (!value) {\n    throw new Error(`No token named $\u007bname}`);\n  }\n  return value.replace(/\\s+/gu, " ").trim();\n}\n',
  },
  {
    file: "apps/dashboard/scripts/tab-icon-art.ts",
    find: 'import { cssOfNode } from "../../../packages/hub/src/design-tokens";\n',
    replace: "",
  },
  {
    file: "apps/dashboard/scripts/tab-icon-art.ts",
    find: 'token("tab-icon-r")',
    replace: 'token("--radius-tab-icon")',
  },
  {
    file: "apps/dashboard/scripts/tab-icon-art.ts",
    find: 'token("spark")',
    replace: 'token("--color-spark")',
  },
  {
    file: "site/vite.config.ts",
    find: "const PAPER = (\n  require('../design/tokens/cawco.tokens.json') as {\n    color: { paper: { $value: { hex: string } } };\n  }\n).color.paper.$value.hex.toLowerCase();",
    replace:
      "const PAPER = (\n  readFileSync(\n    new URL('../apps/dashboard/src/lib/tokens/theme.css', import.meta.url),\n    'utf8',\n  ).match(/--color-paper:\\s*(#[0-9a-f]{6})/iu)?.[1] ?? ''\n).toLowerCase();",
  },
  {
    file: "site/vite.config.ts",
    find: "the token color.paper is",
    replace: "the token --color-paper is",
  },
  {
    file: "site/src/styles.css",
    find: "Its value is `color.paper` in\n   * design/tokens/cawco.tokens.json, and the build stops if the two differ.",
    replace:
      "Its value is `--color-paper` in\n   * apps/dashboard/src/lib/tokens/theme.css, and the build stops if the two differ.",
  },
  {
    file: "site/scripts/og.mjs",
    find: "const tokens = JSON.parse(readFileSync(at('../../design/tokens/cawco.tokens.json'), 'utf8'));\n// DTCG colours: both are sRGB, written with their hex.\nconst paper = tokens.color.paper.$value.hex;\nconst ink = tokens.color['crow-ink'].$value.hex;",
    replace:
      "const theme = readFileSync(at('../../apps/dashboard/src/lib/tokens/theme.css'), 'utf8');\n// The theme's colours: both are written with their hex.\nconst hex = (name) => theme.match(new RegExp(`--color-$\u007bname}:\\\\s*(#[0-9a-f]{6})`, 'iu'))?.[1];\nconst paper = hex('paper');\nconst ink = hex('crow-ink');\nif (!(paper && ink)) throw new Error('theme.css has no --color-paper or --color-crow-ink.');",
  },
  {
    file: "scripts/probe-kit/specs/artifacts.ts",
    find: '/** The design tokens\' one source (CLAUDE.md, Design Context). */\nconst TOKENS = join(\n  import.meta.dir,\n  "../../../design/tokens/cawco.tokens.json"\n);',
    replace:
      "/** The design tokens' one source (CLAUDE.md, Design Context). */\nconst THEME = join(\n  import.meta.dir,\n  \"../../../apps/dashboard/src/lib/tokens/theme.css\"\n);\n/** The sidebar's width, as theme.css declares it. */\nconst SIDEBAR_WIDTH = /^\\s*--spacing-c-sidebar-w:\\s*([^;]+);/mu;",
  },
  {
    file: "scripts/probe-kit/specs/artifacts.ts",
    find: '  const width = (\n    (await Bun.file(TOKENS).json()) as {\n      size: { "c-sidebar-w": { $value: { value: number; unit: string } } };\n    }\n  ).size["c-sidebar-w"].$value;\n  const token = `$\u007bwidth.value}$\u007bwidth.unit}`;',
    replace:
      '  const token =\n    SIDEBAR_WIDTH.exec(await Bun.file(THEME).text())?.[1]?.trim() ?? "";',
  },
  {
    file: "scripts/probe-kit/specs/artifacts.ts",
    find: " *    design/tokens/cawco.tokens.json, as tokens.css carries it.",
    replace: " *    apps/dashboard/src/lib/tokens/theme.css.",
  },
  {
    file: "packages/hub/skills/decision-page/kit/page.css",
    find: "(tokens.css,\n   generated from design/tokens/cawco.tokens.json)",
    replace:
      "(tokens.css,\n   the declarations of apps/dashboard/src/lib/tokens/theme.css)",
  },
  {
    file: "scripts/lint/design/raw-values.mjs",
    find: "(design/tokens/cawco.tokens.json, then \\`bun run tokens\\`)",
    replace: "(apps/dashboard/src/lib/tokens/theme.css)",
  },
  {
    file: "scripts/lint/design/shadcn.mjs",
    find: "add the token to design/tokens/cawco.tokens.json first",
    replace: "add the token to apps/dashboard/src/lib/tokens/theme.css first",
  },
  {
    file: "scripts/lint/design/raw-motion.mjs",
    find: "a motion token (design/tokens/cawco.tokens.json, DESIGN.md Motion grammar)",
    replace:
      "a motion token (apps/dashboard/src/lib/tokens/theme.css, DESIGN.md Motion grammar)",
  },
  {
    file: "apps/dashboard/src/lib/cawco/project/caw-lead.svelte.ts",
    find: '  return msOf(\n    getComputedStyle(document.documentElement).getPropertyValue("--duration-breath")\n  );',
    replace: '  return dur("--duration-breath");',
  },
  {
    file: "apps/dashboard/src/lib/cawco/project/caw-lead.svelte.ts",
    find: 'import { msOf } from "../motion/time";\n',
    replace: "",
  },
  {
    file: "apps/dashboard/src/lib/cawco/project/typed-examples.svelte.ts",
    find: '  msOf(getComputedStyle(document.documentElement).getPropertyValue("--duration-breath"));',
    replace: '  dur("--duration-breath");',
  },
  {
    file: "apps/dashboard/src/lib/cawco/project/typed-examples.svelte.ts",
    find: 'import { msOf } from "#lib/cawco/motion/time.js";\n',
    replace: "",
  },
  {
    file: "scripts/lint/fixtures/design/planted.svelte",
    find: '  const wait = (node: HTMLElement): number =>\n    Number.parseFloat(getComputedStyle(node).getPropertyValue("--dur-settle"));',
    replace:
      '  const wait = (n: HTMLElement): number =>\n    Number.parseFloat(getComputedStyle(n).getPropertyValue("--duration-hold"));',
  },
  {
    file: "apps/dashboard/src/lib/cawco/usage/WhereItGoes.svelte",
    find: '          style:--share={item.share}\n          style:--fill-w="calc(var(--share) * (100% - var(--spacing-c-usage-figure-w)))"',
    replace:
      '          style:--fill-w="calc(var(--share) * (100% - var(--spacing-c-usage-figure-w)))"\n          style:--share={item.share}',
  },
  {
    file: "apps/dashboard/scripts/tab-icon-art.ts",
    find: ' */\nimport { mkdirSync, readFileSync, writeFileSync } from "node:fs";',
    replace:
      ' */\n/// <reference lib="dom" />\nimport { mkdirSync, readFileSync, writeFileSync } from "node:fs";',
  },
  {
    file: "apps/dashboard/scripts/tab-icon-tile.ts",
    find: " * the pictures made here.\n */\nimport {\n  ARTBOARD,",
    replace:
      ' * the pictures made here.\n */\n/// <reference lib="dom" />\nimport {\n  ARTBOARD,',
  },
  {
    file: "scripts/lint/fixtures/design/planted.ts",
    find: 'node.style.getPropertyValue("--dur-settle");',
    replace: 'node.style.getPropertyValue("--duration-hold");',
  },
];

function apply(edit: Edit, touched: Set<string>) {
  const text = read(edit.file);
  if (!text.includes(edit.find)) {
    throw new Error(
      `${edit.file}: ${JSON.stringify(edit.find.slice(0, 60))} not found`
    );
  }
  write(edit.file, text.split(edit.find).join(edit.replace));
  touched.add(edit.file);
}

// ---- run -------------------------------------------------------------------

const changed = new Set<string>();
const built = existsSync(join(ROOT, OLD_TOKENS)) ? build() : undefined;
const map = built?.map ?? (JSON.parse(read(MAP)) as RenameMap);
if (built) {
  write(MAP, `${JSON.stringify(map, null, 2)}\n`);
  write(THEME, await formatText(THEME, built.theme));
  changed.add(THEME);
}

const renameAll = renamer(map.renames);
let renamed = 0;
for (const path of repoFiles(ROOTS)) {
  if (!eligible(path)) {
    continue;
  }
  const text = read(path);
  const next = renameAll(text);
  if (next !== text) {
    write(path, next);
    changed.add(path);
    renamed += 1;
  }
}
// The edits are the migration's own, made once on the tree that has the old
// files; a branch rebased onto the result needs the renames alone.
if (built) {
  for (const edit of EDITS) {
    apply(edit, changed);
  }
}

const files = [...changed].filter((p) => existsSync(join(ROOT, p)));
const format = () => {
  const formatted = Bun.spawnSync(["bun", "scripts/fmt.ts", ...files], {
    cwd: ROOT,
    env: process.env,
    stderr: "inherit",
    stdout: "inherit",
  });
  if (formatted.exitCode !== 0) {
    process.exit(formatted.exitCode);
  }
};
if (files.length > 0) {
  format();
  // A longer name can push a `style:--x="…"` value past the formatter's
  // width, and it wraps the string over two lines, which a Svelte directive
  // value cannot hold. Such a value is written as an expression instead,
  // `style:--x={"…"}`, which the formatter leaves on its line.
  const WRAPPED = /(style:--[\w-]+)="([^"{}]*\n[^"{}]*)"/gu;
  let wrapped = 0;
  for (const path of files.filter((p) => p.endsWith(".svelte"))) {
    const text = read(path);
    const next = text.replace(
      WRAPPED,
      (_, name: string, value: string) =>
        `${name}={${JSON.stringify(value.replace(/\s+/gu, " ").trim())}}`
    );
    if (next !== text) {
      write(path, next);
      wrapped += 1;
    }
  }
  if (wrapped > 0) {
    format();
  }
}
console.log(
  `tokens-to-theme: ${Object.keys(map.renames).length} names renamed, ${renamed} files renamed in, ${built ? EDITS.length : 0} edits, ${files.length} files changed`
);

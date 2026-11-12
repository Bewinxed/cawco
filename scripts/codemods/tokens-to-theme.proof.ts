/**
 * `bun scripts/codemods/tokens-to-theme.proof.ts <before-dir> <after-dir>`:
 * what the move to the hand-kept theme.css (tokens-to-theme.ts) changed in
 * the dashboard's built CSS and in the variables its source reads.
 *
 *   1. `<before-dir>` holds the CSS the dashboard built on main, `<after-dir>`
 *      the CSS it builds now (`build/client/_app/immutable/assets` of each).
 *      The rename map is applied to the before CSS, then both are parsed with
 *      postcss and compared:
 *        - every custom property declared in the before CSS has the same
 *          value, under the same selector and at-rules (`:root` and
 *          `:root, :host` the same selector), under its new name;
 *        - every other rule is the same: `selector { declarations }` as a set,
 *          inside its at-rules.
 *      The number of differences is printed; the variables only the after CSS
 *      declares are named apart, as they change no rule.
 *   2. The `var(--name)` in the source that name a variable nothing declares,
 *      counted on main (`--base`, default origin/main) and now: the count must
 *      not rise.
 *
 * Exits 1 on a difference or a rise.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postcss, { type AtRule, type Rule } from "postcss";
import { ROOT, repoFiles } from "../lib/repo-files";
import type { RenameMap } from "./tokens-to-theme";

const [beforeDir, afterDir] = process.argv.slice(2);
if (!(beforeDir && afterDir)) {
  console.error("usage: bun tokens-to-theme.proof.ts <before-dir> <after-dir>");
  process.exit(2);
}
const base =
  process.argv.find((a) => a.startsWith("--base="))?.slice(7) ?? "origin/main";

const map = JSON.parse(
  readFileSync(join(ROOT, "scripts/codemods/tokens-to-theme.map.json"), "utf8")
) as RenameMap;
const NAME = /(?<![\w-])--[\w-]+/gu;
const rename = (text: string) =>
  text.replace(NAME, (name) => map.renames[name] ?? name);

// ---- 1. the built CSS -------------------------------------------------------

interface Shape {
  /** The same, every declaration kept under the at-rules it stands in: the fallbacks too. */
  declared: Map<string, string>;
  /** `at-rules › selector { declarations }`, the rules' other declarations. */
  rules: Map<string, number>;
  /**
   * `at-rules › selector › property` to value, for custom properties, as a
   * browser that supports the colour features reads them: a `@supports
   * (color: …)` branch (the enhancement a build writes after the fallback it
   * makes for browsers without it) replaces the declaration before it.
   */
  variables: Map<string, string>;
}

const squash = (text: string) => text.replace(/\s+/gu, " ").trim();
/** A rule's selectors, `:root, :host` as `:root`. */
const selectorsOf = (rule: Rule) => {
  const list = rule.selectors.map(squash);
  return list.length === 2 && list[0] === ":root" && list[1] === ":host"
    ? [":root"]
    : list;
};
/** A `@supports (color: …)` wrapper: the enhancement over a colour fallback. */
const COLOUR_SUPPORTS = /^\(color:/u;
const chainOf = (rule: Rule, enhanced = false) => {
  const chain: string[] = [];
  for (let at = rule.parent; at && at.type !== "root"; at = at.parent) {
    if (at.type === "atrule") {
      const { name, params } = at as AtRule;
      if (!(enhanced && name === "supports" && COLOUR_SUPPORTS.test(params))) {
        chain.unshift(`@${name} ${squash(params)}`);
      }
    }
  }
  return chain.join(" › ");
};

function shapeOf(css: string): Shape {
  const shape: Shape = {
    declared: new Map(),
    rules: new Map(),
    variables: new Map(),
  };
  postcss.parse(css).walkRules((rule) => {
    const others: string[] = [];
    const variables: [string, string][] = [];
    rule.each((node) => {
      if (node.type !== "decl") {
        return;
      }
      const value = squash(node.value) + (node.important ? " !important" : "");
      if (node.prop.startsWith("--")) {
        variables.push([node.prop, value]);
      } else {
        others.push(`${node.prop}: ${value}`);
      }
    });
    // A selector list is each of its selectors: a build may group the ones
    // that share declarations, and that is no difference.
    for (const selector of selectorsOf(rule)) {
      const where = `${chainOf(rule)} › ${selector}`;
      const effective = `${chainOf(rule, true)} › ${selector}`;
      for (const [prop, value] of variables) {
        shape.declared.set(`${where} › ${prop}`, value);
        shape.variables.set(`${effective} › ${prop}`, value);
      }
      if (others.length > 0) {
        const text = `${where} { ${others.join("; ")} }`;
        shape.rules.set(text, (shape.rules.get(text) ?? 0) + 1);
      }
    }
  });
  return shape;
}

const cssIn = (dir: string, mapped: boolean) =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".css"))
    .sort()
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .map((css) => (mapped ? rename(css) : css))
    .join("\n");

const ROOTS = [
  "apps/dashboard/src/",
  "apps/dashboard/scripts/",
  "packages/",
  "scripts/",
];
const SOURCE = /\.(svelte|css|ts|tsx|js|mjs|html)$/u;
const DTCG = /(^|\/)dtcg-[^/]*$/u;
const MODULES = /(^|\/)node_modules\//u;
const CLASS = /^\.((?:\\.|[\w-])+)/u;
const ESCAPED = /\\(.)/gu;
const SHADOW_COLOUR = /var\(--tw-(?:drop-)?shadow-color,\s*/u;
const SHADOW_TOKEN = /^(?:drop-shadow\()?var\((--[\w-]+)\)\)?$/u;
const SHADOW_KEY = /--tw-(drop-)?shadow/u;
const RULE_END = / \}$/u;
const ONE_DECLARATION = /^([\w-]+): var\((--[\w-]+)\)$/u;
const wanted = (path: string) =>
  ROOTS.some((r) => path.startsWith(r)) &&
  SOURCE.test(path) &&
  !path.startsWith("scripts/codemods/") &&
  // Planted mistakes the lint reads, not sources.
  !path.startsWith("scripts/lint/fixtures/") &&
  // Another project's tokens (a product feature): kept as written, so not counted.
  path !== "packages/hub/src/design-tokens.ts" &&
  !DTCG.test(path) &&
  !MODULES.test(path);

/** The files main has and the tree deleted. */
const deletedPaths = Bun.spawnSync(
  ["git", "diff", "--name-only", "--diff-filter=D", base],
  { cwd: ROOT, env: process.env, stdout: "pipe" }
)
  .stdout.toString()
  .split("\n")
  .filter(wanted);

/** `--x` written where it is declared: a property, a `style:--x=`, a `@property`, a quoted `setProperty`. */
const DECLARED = /(?<![\w-])(--[\w-]+)(?:\s*[:=]|["'`]\s*,)/gu;
/** A read of a name; one that ends in `-` is the front of a name built from parts (`var(--mark-${n})`), which this does not count. */
const READ = /var\(\s*(--[\w-]*[\w])(?![\w-])/gu;

function dangling(texts: Iterable<string>) {
  const declared = new Set<string>();
  const reads = new Map<string, number>();
  for (const text of texts) {
    for (const m of text.matchAll(DECLARED)) {
      declared.add(m[1] as string);
    }
    for (const m of text.matchAll(READ)) {
      reads.set(m[1] as string, (reads.get(m[1] as string) ?? 0) + 1);
    }
  }
  const names = [...reads].filter(([name]) => !declared.has(name));
  return {
    byName: new Map(names),
    names: names.map(([name]) => name),
    reads: names.reduce((sum, [, n]) => sum + n, 0),
  };
}

function* mainTexts() {
  const listed = Bun.spawnSync(["git", "ls-tree", "-r", "--name-only", base], {
    cwd: ROOT,
    env: process.env,
    stdout: "pipe",
  });
  // The deleted scripts and generated modules only mentioned names; the
  // tokens sheet is the declarations the theme now holds.
  const paths = listed.stdout
    .toString()
    .split("\n")
    .filter(
      (p) =>
        wanted(p) &&
        (!deletedPaths.includes(p) ||
          p === "apps/dashboard/src/lib/tokens/tokens.css")
    );
  const batch = Bun.spawnSync(["git", "cat-file", "--batch"], {
    cwd: ROOT,
    env: process.env,
    stdin: Buffer.from(paths.map((p) => `${base}:${p}\n`).join("")),
    stdout: "pipe",
    maxBuffer: 2 ** 30,
  });
  const out = batch.stdout;
  let at = 0;
  while (at < out.length) {
    const eol = out.indexOf(10, at);
    const [, , size] = out.subarray(at, eol).toString().split(" ");
    const start = eol + 1;
    const end = start + Number(size);
    yield out.subarray(start, end).toString("utf8");
    at = end + 1;
  }
}

function* nowTexts(except = "") {
  for (const path of repoFiles(ROOTS)) {
    if (wanted(path) && !(except && path.endsWith(except))) {
      try {
        yield readFileSync(join(ROOT, path), "utf8");
      } catch {
        // deleted in the tree
      }
    }
  }
}

const before = shapeOf(cssIn(beforeDir, true));
const after = shapeOf(cssIn(afterDir, false));

/** The text of what main has and the tree does not: what the build scanned for class names there. */
const deleted = deletedPaths
  .map((path) =>
    Bun.spawnSync(["git", "show", `${base}:${path}`], {
      cwd: ROOT,
      env: process.env,
      stdout: "pipe",
    }).stdout.toString()
  )
  .join("\n");
/** What the tree's sources say, the theme's own `@utility` definitions aside: where a class is used. */
const treeText = [...nowTexts("lib/tokens/theme.css")].join("\n");
const NAMED = /[\w-]/u;
const isNamed = (char: string | undefined) =>
  char !== undefined && NAMED.test(char);
const uses = (text: string, name: string) => {
  for (let at = text.indexOf(name); at >= 0; at = text.indexOf(name, at + 1)) {
    if (!(isNamed(text[at - 1]) || isNamed(text[at + name.length]))) {
      return true;
    }
  }
  return false;
};

/** The class a utility rule's selector names, as written in markup. */
const classOf = (rule: string) => {
  const selector = rule.split(" › ").at(-1)?.split(" {")[0] ?? "";
  return CLASS.exec(selector)?.[1]?.replace(ESCAPED, "$1");
};
/** `var(--tw-shadow-color, X)` as `X`, which is what the shadow is where no shadow colour is set. */
function unwrapShadowColour(value: string): string {
  let out = value;
  for (let m = SHADOW_COLOUR.exec(out); m; m = SHADOW_COLOUR.exec(out)) {
    let depth = 1;
    let at = m.index + m[0].length;
    while (depth > 0 && at < out.length) {
      if (out[at] === "(") {
        depth += 1;
      } else if (out[at] === ")") {
        depth -= 1;
      }
      at += 1;
    }
    out =
      out.slice(0, m.index) +
      out.slice(m.index + m[0].length, at - 1) +
      out.slice(at);
  }
  return out;
}
const tight = (value: string) => value.replace(/\s*([,()])\s*/gu, "$1");

const differences: string[] = [];
const explained = new Map<string, string[]>();
const explain = (why: string, what: string) =>
  explained.set(why, [...(explained.get(why) ?? []), what]);

for (const [key, value] of before.variables) {
  const now = after.variables.get(key);
  if (now === undefined) {
    differences.push(`variable gone: ${key} (${value})`);
  } else if (now !== value) {
    // A utility that held `var(--shadow-md)` now holds the shadow, each colour
    // behind `var(--tw-shadow-color, …)`: the same shadow until a shadow colour is set.
    const token = SHADOW_TOKEN.exec(value)?.[1];
    const held =
      token && after.variables.get(`@layer theme › :root › ${token}`);
    const wrapped = value.startsWith("drop-shadow(")
      ? `drop-shadow(${held})`
      : held;
    if (
      held &&
      SHADOW_KEY.test(key) &&
      tight(unwrapShadowColour(now)) === tight(wrapped as string)
    ) {
      explain(
        "a shadow utility holds the shadow itself, its colours behind var(--tw-shadow-color, …) (was var(--shadow-…)); the same until a shadow colour is set",
        key.split(" › ").slice(-2).join(" ")
      );
    } else {
      differences.push(
        `variable value: ${key}\n    was ${value}\n    now ${now}`
      );
    }
  }
}
const sameDecls = (rule: string) =>
  rule.split(" { ")[1]?.replace(RULE_END, "").split("; ").sort().join("; ");
const headOf = (rule: string) => rule.split(" { ")[0];
/** Whether an after rule has the declaration `prop: <the value of the variable> ` a before rule read as `var(--variable)`. */
const holdsValue = (rule: string) => {
  const one = ONE_DECLARATION.exec(sameDecls(rule) ?? "");
  const held = one && after.variables.get(`@layer theme › :root › ${one[2]}`);
  return (
    !!held &&
    [...after.rules.keys()].some(
      (other) =>
        headOf(other) === headOf(rule) &&
        tight(sameDecls(other) ?? "") === tight(`${one[1]}: ${held}`)
    )
  );
};
for (const [rule, count] of before.rules) {
  if ((after.rules.get(rule) ?? 0) === count) {
    continue;
  }
  const same = [...after.rules.keys()].some(
    (other) =>
      headOf(other) === headOf(rule) && sameDecls(other) === sameDecls(rule)
  );
  const name = classOf(rule);
  if (same) {
    explain("a rule's declarations in another order", headOf(rule) as string);
  } else if (holdsValue(rule)) {
    explain(
      "an alias utility holds the value of the token it aliases, not var() of it (the same value: that token is declared once, in :root)",
      headOf(rule) as string
    );
  } else if (name && uses(deleted, name) && !uses(treeText, name)) {
    explain(
      "a utility only a deleted file named (build-tokens.ts, tokens.ts, design/tokens): no source uses it",
      name
    );
  } else {
    differences.push(`rule gone: ${rule}`);
  }
}
for (const [rule, count] of after.rules) {
  if ((before.rules.get(rule) ?? 0) === count) {
    continue;
  }
  const mine = new Set(sameDecls(rule)?.split("; "));
  const covered = [...after.rules.keys()].some(
    (other) =>
      other !== rule &&
      headOf(other) === headOf(rule) &&
      [...mine].every((d) => sameDecls(other)?.split("; ").includes(d))
  );
  const same = [...before.rules.keys()].some(
    (other) =>
      headOf(other) === headOf(rule) && sameDecls(other) === sameDecls(rule)
  );
  if (same) {
    continue;
  }
  const counterpart = [...before.rules.keys()].some(
    (other) => headOf(other) === headOf(rule) && holdsValue(other)
  );
  if (counterpart) {
    continue;
  }
  if (covered) {
    explain(
      "a utility the theme's namespace now makes (`--text-body` → text-body) beside the house @utility of the same name: its declarations are already in that rule",
      headOf(rule) as string
    );
  } else {
    differences.push(`rule new: ${rule}`);
  }
}
/** Declarations that differ only before a `@supports (color: …)` branch overrides them. */
const fallbacks = [...before.declared].filter(
  ([key, value]) => after.declared.has(key) && after.declared.get(key) !== value
);
const added = [...after.variables.keys()].filter(
  (key) => !before.variables.has(key)
);

console.log(
  `css: ${before.variables.size} variables and ${[...before.rules.values()].reduce((a, b) => a + b, 0)} rules before, ${after.variables.size} variables and ${[...after.rules.values()].reduce((a, b) => a + b, 0)} rules after`
);
for (const [why, what] of explained) {
  console.log(`explained (${what.length}): ${why}`);
}
for (const line of differences) {
  console.log(`  ${line}`);
}
console.log(`css differences: ${differences.length}`);
console.log(
  `colour fallbacks (a declaration a @supports (color: …) branch overrides in every browser that has the feature) that differ: ${fallbacks.length}`
);
console.log(
  `css variables only the after build declares (no rule reads them): ${added.length}`
);
for (const key of added) {
  console.log(`  ${key.split(" › ").at(-1)}`);
}

// ---- 2. the variables the source reads and nothing declares ----------------

const was = dangling(mainTexts());
const is = dangling(nowTexts());
console.log(
  `var() reads of a name nothing declares: ${was.reads} reads of ${was.names.length} names on ${base}, ${is.reads} reads of ${is.names.length} names now`
);
const rose = is.reads > was.reads;
if (process.argv.includes("--names")) {
  for (const name of new Set([...was.names, ...is.names])) {
    console.log(
      `  ${name}: ${was.byName.get(name) ?? 0} before, ${is.byName.get(name) ?? 0} now`
    );
  }
}
if (rose) {
  const old = new Set(was.names.map((n) => map.renames[n] ?? n));
  console.log(
    `  new: ${is.names.filter((n) => !old.has(n)).join(" ") || "(none new by name)"}`
  );
}
console.log(rose ? "dangling reads: ROSE" : "dangling reads: did not rise");
process.exit(differences.length > 0 || rose ? 1 : 0);

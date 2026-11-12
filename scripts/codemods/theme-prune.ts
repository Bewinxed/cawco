// biome-ignore-all lint/performance/useTopLevelRegex: a one-shot script, run by hand, never on a hot path.
// biome-ignore-all lint/suspicious/noBitwiseOperators: Tailwind's theme options are bit flags (INLINE), read and cleared as it does.
/**
 * `bun scripts/codemods/theme-prune.ts`: keeps the dashboard's theme.css to
 * what is shared. Safe to run twice (the second run changes nothing).
 *
 *   3. A `var(--name)` read of a name nothing declares, where the migration's
 *      map (`tokens-to-theme.map.json`) renames the name: the read takes the
 *      new name. The rest is listed (the names are inputs a caller sets, a
 *      placeholder in a template, Tailwind's own `--tw-*`), not guessed.
 *   1. Every variable nothing uses is deleted from theme.css, with its comment
 *      and its overrides in the blocks after `@theme`.
 *   2. A `--spacing-*` token whose value is one whole-pixel length and whose
 *      uses are all in one file is written in that file on Tailwind's number
 *      scale (`w-c-card-w` is `w-104`, `var(--spacing-c-card-w)` is
 *      `calc(var(--spacing) * 104)`) and deleted. Each class is checked
 *      with Tailwind: the old and the new class write the same declarations
 *      once lengths are worked out.
 *
 * What counts as a use: the name as `--name` anywhere in the dashboard's
 * source and scripts, the packages' source and the hub's skills, `site/` and
 * `scripts/`; a class Tailwind compiles to a rule that reads it (found by the
 * theme's own used-flag, as scripts/lint/design/tailwind.mjs loads Tailwind,
 * and for a container-query variant by its name); a token another kept token,
 * a house utility or a keyframe in theme.css reads; and a name the code builds
 * from parts (`--color-…`, `--duration-…`: see tokens-to-theme.ts's EDITS).
 * Kept even when unused: colour-ramp steps, `--spacing`, `--breakpoint-*`,
 * `--default-*`.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import postcss, {
  type ChildNode,
  type Container,
  type Declaration,
  type Root,
} from "postcss";
import { ROOT, repoFiles } from "../lib/repo-files";

const THEME = "apps/dashboard/src/lib/tokens/theme.css";
const MAP = "scripts/codemods/tokens-to-theme.map.json";
const SCAN = [
  "apps/dashboard/src",
  "apps/dashboard/scripts",
  ...readdirSync(join(ROOT, "packages"))
    .map((member) => `packages/${member}/src`)
    .filter((dir) => existsSync(join(ROOT, dir))),
  "packages/hub/skills",
  "site",
  "scripts",
];
const SKIP = (path: string) =>
  path === THEME ||
  path.startsWith("scripts/codemods/") ||
  /(^|\/)node_modules\//u.test(path);

const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const write = (path: string, text: string) =>
  writeFileSync(join(ROOT, path), text);

// ---- the tree ---------------------------------------------------------------

/** Every text file in the scan roots (a file with a NUL byte is binary). */
const texts = new Map<string, string>();
for (const path of repoFiles(SCAN)) {
  if (SKIP(path)) {
    continue;
  }
  const text = read(path);
  if (!text.includes("\0")) {
    texts.set(path, text);
  }
}

/** `--name` written whole (a trailing `-` is the front of a built name). */
const NAME = /(?<![\w-])--[\w-]*[\w]/gu;
/** A read of a name. */
const READ = /var\(\s*(--[\w-]*[\w])(?![\w-])/gu;
/** `--x` written where it is declared. */
const DECLARED = /(?<![\w-])(--[\w-]+)(?:\s*[:=]|["'`]\s*,)/gu;

// ---- 3. reads nothing declares ----------------------------------------------

interface RenameMap {
  renames: Record<string, string>;
}
const { renames } = JSON.parse(read(MAP)) as RenameMap;

const themeText = read(THEME);
const declaredAnywhere = new Set<string>();
for (const text of [...texts.values(), themeText]) {
  for (const m of text.matchAll(DECLARED)) {
    declaredAnywhere.add(m[1] as string);
  }
}

/** The files whose reads step 3 counts and fixes: the proof's (tokens-to-theme.proof.ts), not the planted mistakes the lint reads, a documentation file or another project's tokens. */
const READS_IN = (path: string) =>
  /\.(svelte|css|ts|tsx|js|mjs|html)$/u.test(path) &&
  !path.startsWith("scripts/lint/fixtures/") &&
  path !== "packages/hub/src/design-tokens.ts" &&
  !/(^|\/)dtcg-[^/]*$/u.test(path);

const changed = new Set<string>();
const step3 = { fixed: 0 };
const dangling: { name: string; where: string[] }[] = [];
{
  const byName = new Map<string, string[]>();
  for (const [path, text] of texts) {
    if (!READS_IN(path)) {
      continue;
    }
    const next = text.replace(READ, (whole, name: string) => {
      if (declaredAnywhere.has(name)) {
        return whole;
      }
      const to = renames[name];
      if (to && declaredAnywhere.has(to)) {
        step3.fixed += 1;
        return whole.replace(name, to);
      }
      return whole;
    });
    if (next !== text) {
      texts.set(path, next);
      write(path, next);
      changed.add(path);
    }
    const lines = next.split("\n");
    lines.forEach((line, i) => {
      for (const m of line.matchAll(READ)) {
        const name = m[1] as string;
        if (!declaredAnywhere.has(name)) {
          byName.set(name, [...(byName.get(name) ?? []), `${path}:${i + 1}`]);
        }
      }
    });
  }
  // The theme's own reads count too.
  themeText.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(READ)) {
      const name = m[1] as string;
      if (!declaredAnywhere.has(name)) {
        byName.set(name, [...(byName.get(name) ?? []), `${THEME}:${i + 1}`]);
      }
    }
  });
  for (const [name, where] of byName) {
    dangling.push({ name, where });
  }
}

// ---- the theme --------------------------------------------------------------

const root: Root = postcss.parse(themeText);

/** The variable declarations of the `@theme` blocks (not those inside a keyframe). */
const themeDecls: Declaration[] = [];
/** Every other custom-property declaration in the file: the overrides. */
const overrideDecls: Declaration[] = [];
/** Reads by anything that is not a theme variable: house utilities, keyframes, other rules. */
const rootReads = new Set<string>();
const refsOf = (value: string) =>
  [...value.matchAll(READ)].map((m) => m[1] as string);

for (const node of root.nodes as ChildNode[]) {
  if (node.type === "atrule" && node.name === "theme") {
    for (const child of node.nodes ?? []) {
      if (child.type === "decl" && child.prop.startsWith("--")) {
        themeDecls.push(child);
      } else if (child.type !== "comment") {
        (child as Container).walkDecls((d: Declaration) => {
          for (const r of refsOf(d.value)) {
            rootReads.add(r);
          }
        });
        for (const m of child.toString().matchAll(READ)) {
          rootReads.add(m[1] as string);
        }
      }
    }
  } else if (node.type === "atrule" && node.name === "layer") {
    node.walkDecls((d: Declaration) => {
      if (d.prop.startsWith("--")) {
        overrideDecls.push(d);
      } else {
        for (const r of refsOf(d.value)) {
          rootReads.add(r);
        }
      }
    });
  } else if (node.type !== "comment") {
    for (const m of node.toString().matchAll(READ)) {
      rootReads.add(m[1] as string);
    }
    for (const m of node.toString().matchAll(NAME)) {
      rootReads.add(m[0]);
    }
  }
}
const declsOf = (name: string) =>
  [...themeDecls, ...overrideDecls].filter((d) => d.prop === name);
const variables = new Set(themeDecls.map((d) => d.prop));
/** Tailwind's theme namespaces (tailwindcss.com/docs/theme); any other variable is the house's own. */
const NAMESPACES = new Set([
  "color",
  "font",
  "text",
  "font-weight",
  "tracking",
  "leading",
  "breakpoint",
  "container",
  "spacing",
  "radius",
  "shadow",
  "inset-shadow",
  "drop-shadow",
  "text-shadow",
  "blur",
  "perspective",
  "aspect",
  "ease",
  "animate",
  "default",
  "duration",
]);
const namespaceOf = (name: string) => {
  const parts = name.slice(2).split("-");
  return (
    [parts.slice(0, 2).join("-"), parts[0] as string].find((p) =>
      NAMESPACES.has(p)
    ) ?? "house"
  );
};

// ---- Tailwind ---------------------------------------------------------------

interface Node {
  important?: boolean;
  kind: string;
  name?: string;
  nodes?: Node[];
  params?: string;
  property?: string;
  selector?: string;
  value?: string;
}
interface Options {
  options: number;
  value: string;
}
interface DesignSystem {
  candidatesToAst: (candidates: string[]) => Node[][];
  theme: {
    values: Map<string, Options>;
    markUsedVariable: (key: string) => boolean;
    get: (themeKeys: string[]) => unknown;
    resolve: (value: string | null, themeKeys: string[]) => unknown;
    resolveValue: (value: string | null, themeKeys: string[]) => unknown;
    resolveWith: (value: string | null, themeKeys: string[]) => unknown;
  };
}
const { ds } = (await import(
  pathToFileURL(join(ROOT, "scripts/lint/design/tailwind.mjs")).href
)) as { ds: DesignSystem };

const INLINE = 1;
const entries = ds.theme.values;

/** Candidate class strings in a text, as Tailwind's scanner cuts them. */
const CANDIDATE = /(?:\[[^\]\s"'`]*\]|\(--[\w-]*\)|[^\s"'`<>(){}=,;|\\[\]])+/gu;
const TRAIL = /[.:,;]+$/u;
const LEAD = /^(?:class:|[.:]+)/u;
/** A dot in a class is a quarter step (`p-3.25`): between digits. Any other is a property access or a file name. */
/** Tailwind's classes are lower case outside a bracketed value; a camelCase word is an identifier. */
const IDENTIFIER = /[A-Z]/u;
const STRAY_DOT = /(?<!\d)\.|\.(?!\d)/u;
/** The forms a raw piece of text may be a class under. */
const formsOf = (raw: string) => {
  const forms = new Set<string>([raw]);
  const trimmed = raw.replace(TRAIL, "");
  forms.add(trimmed);
  forms.add(trimmed.replace(LEAD, ""));
  forms.add(raw.replace(LEAD, ""));
  return [...forms].filter(
    (f) =>
      f.length > 1 &&
      f.length < 120 &&
      !STRAY_DOT.test(f) &&
      !IDENTIFIER.test(f.replace(/\[[^\]]*\]/gu, ""))
  );
};

const candidateFiles = new Map<string, Set<string>>();
for (const [path, text] of texts) {
  for (const m of text.matchAll(CANDIDATE)) {
    for (const form of formsOf(m[0])) {
      let files = candidateFiles.get(form);
      if (!files) {
        files = new Set();
        candidateFiles.set(form, files);
      }
      files.add(path);
    }
  }
}

/** Per candidate: the theme keys its rules read, as Tailwind asks the theme for them (an inline key is made readable, so it is asked for by name, for this pass). */
const readsOf = new Map<string, string[]>();
const inlineKeys = [...entries].filter(([, v]) => v.options & INLINE);
for (const [, v] of inlineKeys) {
  v.options &= ~INLINE;
}
const asked: string[] = [];
const markUsed = ds.theme.markUsedVariable.bind(ds.theme);
ds.theme.markUsedVariable = (key: string) => {
  asked.push(key);
  return markUsed(key);
};
/** The key Tailwind's theme finds for a utility's value (`shadow` + `stat` is `--shadow-stat`), as its own lookup does. */
const keyFor = (value: string | null, themeKeys: string[]) => {
  for (const themeKey of themeKeys) {
    const plain = value === null ? themeKey : `${themeKey}-${value}`;
    if (entries.has(plain)) {
      return plain;
    }
    const quarter = `${themeKey}-${value?.replaceAll(".", "_")}`;
    if (value?.includes(".") && entries.has(quarter)) {
      return quarter;
    }
  }
};
// A utility that asks for a key's value inline (a shadow, whose colour it
// sets) does not mark it used: its lookups are watched as well.
const lookups = ["resolve", "resolveValue", "resolveWith"] as const;
const originals = lookups.map((name) => ds.theme[name]);
// `get` asks by whole key (a shadow's `--shadow-stat`).
const getOriginal = ds.theme.get;
ds.theme.get = (themeKeys: string[]) => {
  const key = themeKeys.find((k) => entries.has(k));
  if (key) {
    asked.push(key);
  }
  return getOriginal.call(ds.theme, themeKeys);
};
lookups.forEach((name, i) => {
  const original = originals[i] as (...args: never[]) => unknown;
  ds.theme[name] = ((
    value: string | null,
    themeKeys: string[],
    ...rest: unknown[]
  ) => {
    const key = keyFor(value, themeKeys);
    if (key) {
      asked.push(key);
    }
    return (original as (...a: unknown[]) => unknown).call(
      ds.theme,
      value,
      themeKeys,
      ...rest
    );
  }) as never;
});
const CONTAINER_VARIANT = /^(?:not-)?@(?:min-|max-)?(.+?)(?:\/.*)?$/u;
for (const candidate of candidateFiles.keys()) {
  asked.length = 0;
  let nodes: Node[] = [];
  try {
    nodes = ds.candidatesToAst([candidate])[0] ?? [];
  } catch {
    nodes = [];
  }
  if (nodes.length === 0) {
    continue;
  }
  const keys = new Set(asked);
  // A container-query variant reads `--container-<name>` without asking.
  for (const segment of candidate.split(":").slice(0, -1)) {
    const m = CONTAINER_VARIANT.exec(segment);
    if (m && entries.has(`--container-${m[1]}`)) {
      keys.add(`--container-${m[1]}`);
    }
  }
  if (keys.size > 0) {
    readsOf.set(candidate, [...keys]);
  }
}
ds.theme.markUsedVariable = markUsed;
lookups.forEach((name, i) => {
  ds.theme[name] = originals[i] as never;
});
ds.theme.get = getOriginal;
for (const [, v] of inlineKeys) {
  v.options |= INLINE;
}

// ---- uses -------------------------------------------------------------------

/** Where each token is used: the files naming it as `--name`, and the files with a class that reads it. */
const usedIn = new Map<string, Set<string>>();
const addUse = (name: string, path: string) => {
  let files = usedIn.get(name);
  if (!files) {
    files = new Set();
    usedIn.set(name, files);
  }
  files.add(path);
};
for (const [path, text] of texts) {
  for (const m of text.matchAll(NAME)) {
    if (variables.has(m[0])) {
      addUse(m[0], path);
    }
  }
}
for (const [candidate, keys] of readsOf) {
  for (const key of keys) {
    for (const path of candidateFiles.get(candidate) ?? []) {
      addUse(key, path);
    }
  }
}

/** A name the code builds from parts: --color-mark-…, --color-status-…-glyph, --color-account-…, --color-${…}, --duration-…. */
const BUILT = /^--(?:color-|duration-)/u;
const KEPT =
  /^--(?:\*|color-[a-z]+-\d+|spacing|breakpoint-[\w-]+|default-[\w-]+)$/u;

const reachable = new Set<string>();
const keep = (name: string) => {
  if (reachable.has(name) || !variables.has(name)) {
    return;
  }
  reachable.add(name);
  for (const d of declsOf(name)) {
    for (const r of refsOf(d.value)) {
      keep(r);
    }
  }
};
for (const name of variables) {
  if (usedIn.has(name) || BUILT.test(name) || KEPT.test(name)) {
    keep(name);
  }
}
for (const name of rootReads) {
  keep(name);
}

const before = variables.size;
const step1 = new Map<string, number>();
const step2 = new Map<string, number>();
const bump = (map: Map<string, number>, name: string) =>
  map.set(namespaceOf(name), (map.get(namespaceOf(name)) ?? 0) + 1);

const doomed = new Set<string>();
for (const name of variables) {
  if (!reachable.has(name)) {
    doomed.add(name);
    bump(step1, name);
  }
}

// ---- 2. one-file sizes to the number scale ----------------------------------

const LENGTH = /^(\d+(?:\.\d+)?)(px|rem)$/u;
const PX = 4; // --spacing: 0.25rem
const escapeClass = (s: string) => s.replace(/[^\w-]/gu, (c) => `\\${c}`);

/** A length expression worked out in px (var(--spacing) as 4px, the old token as its value). */
const toPx = (value: string, token: string, tokenPx: number) => {
  let text = value
    .replaceAll(`var(${token})`, `${tokenPx}px`)
    .replaceAll("var(--spacing)", `${PX}px`);
  const inner = /(?:calc)?\(([^()]*)\)/u;
  const calc = (expr: string) => {
    const parts = expr
      .replace(/(\d)(px|rem)?\s*([*/+])\s*/gu, "$1$2 $3 ")
      .trim()
      .split(/\s+/u);
    const num = (s: string) => {
      const m = /^(-?[\d.]+)(px|rem)?$/u.exec(s);
      if (!m) {
        throw new Error(`not a length: ${s}`);
      }
      return {
        n: Number(m[1]) * (m[2] === "rem" ? 16 : 1),
        unit: m[2] ? 1 : 0,
      };
    };
    let acc = num(parts[0] as string);
    for (let i = 1; i < parts.length; i += 2) {
      const rhs = num(parts[i + 1] as string);
      const op = parts[i];
      if (op === "*") {
        acc = { n: acc.n * rhs.n, unit: acc.unit + rhs.unit };
      } else if (op === "/") {
        acc = { n: acc.n / rhs.n, unit: acc.unit - rhs.unit };
      } else if (op === "+") {
        acc = { n: acc.n + rhs.n, unit: acc.unit };
      } else {
        acc = { n: acc.n - rhs.n, unit: acc.unit };
      }
    }
    return `${Math.round(acc.n * 1e4) / 1e4}${acc.unit > 0 ? "px" : ""}`;
  };
  try {
    for (let guard = 0; guard < 50 && inner.test(text); guard += 1) {
      text = text.replace(inner, (_, expr: string) => calc(expr));
    }
    return /^[\d.-]+(?:px|rem)?$/u.test(text.trim()) && /[a-z]/u.test(text)
      ? calc(text.trim())
      : text.trim();
  } catch {
    // Not a length (a `--tw-content`, a keyword): compared as written.
    return value.trim();
  }
};

/** A class's rules as `at-rules | selector-with-the-class-as-& { property: value }`, lengths worked out. */
const shapeOf = (
  candidate: string,
  token: string,
  tokenPx: number
): string[] | undefined => {
  let nodes: Node[] = [];
  try {
    nodes = ds.candidatesToAst([candidate])[0] ?? [];
  } catch {
    return;
  }
  if (nodes.length === 0) {
    return;
  }
  const out: string[] = [];
  const cls = `.${escapeClass(candidate.replace(/^!|!$/gu, ""))}`;
  const visit = (list: Node[], path: string) => {
    for (const n of list) {
      if (n.kind === "declaration") {
        out.push(
          `${path} | ${n.property}: ${toPx(n.value ?? "", token, tokenPx)}${n.important ? " !important" : ""}`
        );
      } else if (n.kind === "rule") {
        visit(
          n.nodes ?? [],
          `${path} ${(n.selector ?? "").split(cls).join("&")}`
        );
      } else if (n.kind === "at-rule" && n.name !== "@property") {
        visit(n.nodes ?? [], `${path} ${n.name} ${n.params}`);
      }
    }
  };
  visit(nodes, "");
  return out.sort();
};

/** A class's rules as written, the declarations of every rule under its at-rules. */
const rawShape = (candidate: string): string[] | undefined => {
  let nodes: Node[] = [];
  try {
    nodes = ds.candidatesToAst([candidate])[0] ?? [];
  } catch {
    return;
  }
  if (nodes.length === 0) {
    return;
  }
  const out: string[] = [];
  const cls = `.${escapeClass(candidate.replace(/^!|!$/gu, ""))}`;
  const visit = (list: Node[], path: string) => {
    for (const n of list) {
      if (n.kind === "declaration") {
        out.push(
          `${path} | ${n.property}: ${n.value}${n.important ? " !important" : ""}`
        );
      } else if (n.kind === "rule") {
        visit(
          n.nodes ?? [],
          `${path} ${(n.selector ?? "").split(cls).join("&")}`
        );
      } else if (n.kind === "at-rule" && n.name !== "@property") {
        visit(n.nodes ?? [], `${path} ${n.name} ${n.params}`);
      }
    }
  };
  visit(nodes, "");
  return out.sort();
};
/** The read as it is written inside a class's bracket. */
const inClass = (number: string) => `calc(var(--spacing)_*_${number})`;

/**
 * The classes a Svelte file writes on a component (`<Table.Head class="…">`):
 * a kit part owns its look and the design lint (no-restyle) allows a caller
 * only a token's class for a size there, never a number, so such a class
 * stays a token.
 */
const ON_COMPONENT_TAG = /^<([A-Z][\w.]*)/u;
const ARROW = /[=]>/gu;
const classesOnComponents = (text: string) => {
  const out = new Set<string>();
  for (const m of text.matchAll(CANDIDATE)) {
    const head = text.slice(0, m.index).replace(ARROW, "= ");
    const open = head.lastIndexOf("<");
    if (open < 0 || head.indexOf(">", open) >= 0) {
      continue;
    }
    if (ON_COMPONENT_TAG.test(head.slice(open))) {
      for (const form of formsOf(m[0])) {
        out.add(form);
      }
    }
  }
  return out;
};
const onComponents = new Map<string, Set<string>>();

const numberOf = (px: number) => String(px / PX);
const classRewrites = new Map<string, Map<string, string>>(); // path -> old class -> new class
const varRewrites = new Map<string, Map<string, string>>(); // path -> token -> replacement
const skipped: string[] = [];
const moved = new Set<string>();

for (const decl of themeDecls) {
  const name = decl.prop;
  if (
    !name.startsWith("--spacing-") ||
    name.startsWith("--spacing-space-") ||
    doomed.has(name)
  ) {
    continue;
  }
  const m = LENGTH.exec(decl.value.trim());
  if (!m) {
    continue;
  }
  const px = Number(m[1]) * (m[2] === "rem" ? 16 : 1);
  if (Math.abs(px - Math.round(px)) > 1e-9 || declsOf(name).length > 1) {
    continue;
  }
  const files = usedIn.get(name);
  if (files?.size !== 1 || reachable.has(name) === false) {
    continue;
  }
  // A token another kept variable, utility or keyframe reads is shared.
  if (
    rootReads.has(name) ||
    themeDecls.some(
      (d) =>
        d !== decl && reachable.has(d.prop) && refsOf(d.value).includes(name)
    )
  ) {
    continue;
  }
  const path = [...files][0] as string;
  const suffix = name.slice("--spacing-".length);
  const number = numberOf(px);
  const text = texts.get(path) as string;

  // The classes in that file that read the token.
  const rewrites = new Map<string, string>();
  let ok = true;
  for (const [candidate, keys] of readsOf) {
    if (!(keys.includes(name) && candidateFiles.get(candidate)?.has(path))) {
      continue;
    }
    // A `[--x:var(--spacing-c-y)]` holds the read itself, in a bracket, where
    // a space is written `_`: the same class with the read as the number scale
    // writes it must compile to the same declarations.
    if (candidate.includes(name)) {
      const next = candidate.replaceAll(
        new RegExp(`var\\(\\s*${name}\\s*\\)`, "gu"),
        inClass(number)
      );
      const was = rawShape(candidate);
      const now = rawShape(next)?.map((line) =>
        line.replaceAll(`calc(var(--spacing) * ${number})`, `var(${name})`)
      );
      if (!(was && now && JSON.stringify(was) === JSON.stringify(now))) {
        ok = false;
        break;
      }
      continue;
    }
    const at = candidate.lastIndexOf(`-${suffix}`);
    const after = candidate.slice(at + 1 + suffix.length);
    if (at < 0 || !/^!?$/u.test(after)) {
      ok = false;
      break;
    }
    const next = `${candidate.slice(0, at)}-${number}${after}`;
    const was = shapeOf(candidate, name, px);
    const now = shapeOf(next, name, px);
    if (!(was && now && JSON.stringify(was) === JSON.stringify(now))) {
      ok = false;
      break;
    }
    if (path.endsWith(".svelte")) {
      let held = onComponents.get(path);
      if (!held) {
        held = classesOnComponents(texts.get(path) as string);
        onComponents.set(path, held);
      }
      if (held.has(candidate)) {
        ok = false;
        break;
      }
    }
    rewrites.set(candidate, next);
  }
  const replacement = `calc(var(--spacing) * ${number})`;
  const VAR = new RegExp(`var\\(\\s*${name}\\s*\\)`, "gu");
  // What is left must hold no other mention of the token.
  let rest = text.replace(VAR, "");
  if (ok) {
    rest = rest.replace(CANDIDATE, (raw) => {
      let out = raw;
      for (const form of formsOf(raw)) {
        if (rewrites.has(form)) {
          out = "";
        }
      }
      return out;
    });
    ok = !new RegExp(`(?<![\\w-])${name}(?![\\w-])`, "u").test(rest);
  }
  if (!ok) {
    skipped.push(`${name} (${path})`);
    continue;
  }
  classRewrites.set(
    path,
    new Map([...(classRewrites.get(path) ?? []), ...rewrites])
  );
  const vars = varRewrites.get(path) ?? new Map<string, string>();
  vars.set(name, replacement);
  varRewrites.set(path, vars);
  doomed.add(name);
  moved.add(name);
  bump(step2, name);
}
// A token counted by step 1 and 2 both is step 1's.

for (const [path, rewrites] of classRewrites) {
  let text = texts.get(path) as string;
  const tokens = varRewrites.get(path) ?? new Map<string, string>();
  text = text.replace(CANDIDATE, (raw) => {
    let out = raw;
    for (const form of formsOf(raw)) {
      const to = rewrites.get(form);
      if (to !== undefined) {
        out = out.replace(form, to);
        break;
      }
    }
    // A read in a bracket is a class's: its spaces are `_`.
    for (const [token, replacement] of tokens) {
      out = out.replace(
        new RegExp(`var\\(\\s*${token}\\s*\\)`, "gu"),
        replacement.replaceAll(" ", "_")
      );
    }
    return out;
  });
  for (const [token, replacement] of tokens) {
    text = text.replace(
      new RegExp(`var\\(\\s*${token}\\s*\\)`, "gu"),
      replacement
    );
  }
  texts.set(path, text);
  write(path, text);
  changed.add(path);
}

// ---- delete from the theme --------------------------------------------------

/** The comments just above a node, as one run. */
const commentsAbove = (node: ChildNode): ChildNode[] => {
  const out: ChildNode[] = [];
  for (let at = node.prev(); at?.type === "comment"; at = at.prev()) {
    out.push(at);
  }
  return out;
};
const prune = (container: Container) => {
  if (container.nodes?.length === 0 && container.parent) {
    const { parent } = container;
    container.remove();
    prune(parent as Container);
  }
};
for (const d of [...themeDecls, ...overrideDecls]) {
  if (doomed.has(d.prop)) {
    const parent = d.parent as Container;
    for (const c of commentsAbove(d)) {
      c.remove();
    }
    d.remove();
    prune(parent);
  }
}
const nextTheme = root.toString();
if (nextTheme !== themeText) {
  write(THEME, nextTheme);
  changed.add(THEME);
}

// ---- format and report ------------------------------------------------------

const files = [...changed].filter((p) => existsSync(join(ROOT, p)));
const format = () => {
  const run = Bun.spawnSync(["bun", "scripts/fmt.ts", ...files], {
    cwd: ROOT,
    env: process.env,
    stderr: "inherit",
    stdout: "inherit",
  });
  if (run.exitCode !== 0) {
    process.exit(run.exitCode);
  }
};
if (files.length > 0) {
  format();
  // A longer value can push a `style:--x="…"` past the formatter's width, and
  // it wraps the string over two lines, which a Svelte directive value
  // cannot hold: it is written as an expression instead.
  const WRAPPED = /(style:--[\w-]+)="([^"{}]*\n[^"{}]*)"/gu;
  let wrapped = 0;
  for (const path of files.filter((p) => p.endsWith(".svelte"))) {
    const text = read(path);
    const next = text.replace(
      WRAPPED,
      (_, prop: string, value: string) =>
        `${prop}={${JSON.stringify(value.replace(/\s+/gu, " ").trim())}}`
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

const byNamespace = (map: Map<string, number>) =>
  [...map].map(([ns, n]) => `${ns} ${n}`).join(", ") || "none";
const total = (map: Map<string, number>) =>
  [...map.values()].reduce((a, b) => a + b, 0);
console.log(
  `step 3: ${step3.fixed} reads fixed; ${dangling.length} names still read and nowhere declared:`
);
for (const { name, where } of dangling) {
  console.log(`  ${name}: ${where.join(" ")}`);
}
if (process.argv.includes("--list")) {
  console.log([...doomed].join("\n"));
}
console.log(
  `step 1: ${total(step1)} unused variables deleted (${byNamespace(step1)})`
);
console.log(
  `step 2: ${total(step2)} one-file sizes moved to the number scale (${byNamespace(step2)})`
);
if (skipped.length > 0) {
  console.log(
    `step 2 left alone (a mention the rewrite does not reach, or a class that did not compile to the same): ${skipped.length}`
  );
  for (const s of skipped) {
    console.log(`  ${s}`);
  }
}
console.log(
  `theme variables: ${before} before, ${before - doomed.size} after; ${files.length} files changed`
);

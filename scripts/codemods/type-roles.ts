// biome-ignore-all lint/performance/useTopLevelRegex: a one-shot codemod, run by hand, never on a hot path.
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: a one-shot codemod that walks a class list and its brackets in one pass each; run by hand.
/**
 * `bun scripts/codemods/type-roles.ts`: a text role is set one way, a
 * `type-<role>` utility (the `font` shorthand with the role's tracking), and
 * every form field frame rests on one edge. Safe to run twice (the second run
 * changes nothing).
 *
 *   0. Prints the inventory: every utility of the three families that set
 *      text roles (`type-*`; `text-size-*`; the `text-<role>` Tailwind makes
 *      from the `--text-*` tokens, with its leading, weight and tracking),
 *      the declarations Tailwind compiles it to, and its uses.
 *   1. A role takes its tracking inside its `type-*` utility where the theme
 *      has a `--tracking-<role>` token (`type-title`, `type-caps`).
 *   2. On each class list (a string literal, or an `@apply`) whose
 *      `text-size-*` / `text-<role>` classes, with the `leading-*`,
 *      `font-*` and `tracking-*` classes beside them, compile to exactly the
 *      declarations of one `type-<role>`, they are that `type-<role>`. Compared
 *      as compiled declarations, theme values worked out (`font-medium` and
 *      `500` are one value). A `tracking-*` beside a `type-<role>` that sets
 *      the same tracking goes. A list that does not add up to a role is left
 *      as it is, and counted with its reason.
 *   3. A `text-size-*` or `text-<role>` utility no class list uses any more is
 *      deleted from the theme (theme-prune.ts then deletes the `--text-*`,
 *      `--leading-*` and `--tracking-*` tokens nothing reads).
 *   4. A frame that carries `field-edge` rests on `border-row-outline`
 *      (`field-edge` sets it, and steps to `border-contrast` on focus as
 *      before); the resting `border-border-control` and
 *      `border-border-row-outline` it carried are deleted. The edge's
 *      contrast on each house surface is printed.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postcss from "postcss";
import { ROOT } from "../lib/repo-files";
import { contrastBetween, evaluatorOver } from "./lib/theme-measure";
import { format, loadTexts, read, THEME, write } from "./lib/theme-tree";

const DESIGN = "apps/dashboard/src/design.css";
const say = (line = "") => console.log(line);

// ---- Tailwind, as the design rules load it ----------------------------------

const { ds } = (await import(
  join(ROOT, "scripts/lint/design/tailwind.mjs")
)) as {
  ds: {
    candidatesToCss: (c: string[]) => (string | null)[];
    theme: { values: Map<string, { value: string }> };
  };
};
const themeValues = new Map<string, string>();
for (const [key, entry] of ds.theme.values) {
  themeValues.set(key, entry.value);
}

interface Decl {
  prop: string;
  value: string;
}
const compiled = new Map<string, Decl[] | null>();
/** A class's declarations (`@property` rules left out), or null where it is not a class. */
const compile = (cls: string): Decl[] | null => {
  const hit = compiled.get(cls);
  if (hit !== undefined) {
    return hit;
  }
  let css: string | null = null;
  try {
    css = ds.candidatesToCss([cls])[0] ?? null;
  } catch {
    css = null;
  }
  let result: Decl[] | null = null;
  if (css) {
    result = [];
    postcss.parse(css).walkDecls((d) => {
      if (d.parent?.type === "atrule" && d.parent.name === "property") {
        return;
      }
      result?.push({ prop: d.prop, value: d.value });
    });
  }
  compiled.set(cls, result);
  return result;
};

const VAR = /var\(\s*(--[\w-]+)\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/gu;
/** A value with the theme's variables worked out, and `--tw-*` read from `tw` (its fallback where unset). */
const resolve = (value: string, tw: Map<string, string>) => {
  let v = value;
  for (let i = 0; i < 24; i += 1) {
    const next = v.replace(VAR, (whole, name: string, fallback?: string) => {
      const set = tw.get(name);
      if (set !== undefined) {
        return set;
      }
      if (name.startsWith("--tw-")) {
        return fallback ?? whole;
      }
      return themeValues.get(name) ?? whole;
    });
    if (next === v) {
      break;
    }
    v = next;
  }
  return v
    .replace(/\s+/gu, " ")
    .replace(/\s*\/\s*/gu, "/")
    .trim();
};

/** A value cut at its top-level spaces. */
const splitTop = (value: string) => {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of value.trim()) {
    if (ch === "(") {
      depth += 1;
    } else if (ch === ")") {
      depth -= 1;
    }
    if (/\s/u.test(ch) && depth === 0) {
      if (cur) {
        parts.push(cur);
      }
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur) {
    parts.push(cur);
  }
  return parts;
};

const SANS = resolve("var(--font-sans)", new Map());
type Effective = Map<string, string>;
const TEXT_PROPS = new Set([
  "font-size",
  "line-height",
  "font-weight",
  "letter-spacing",
  "font-family",
  "font",
]);

/** The declarations a set of classes compile to, as one cascade: `--tw-*` set once, the rest worked out, `font` cut into its longhands. Null where two classes set a property two ways. */
const effective = (classes: string[]): Effective | "conflict" | null => {
  const tw = new Map<string, string>();
  const raw: Decl[] = [];
  for (const cls of classes) {
    const decls = compile(cls);
    if (!decls) {
      return null;
    }
    for (const d of decls) {
      if (d.prop.startsWith("--tw-")) {
        if (tw.has(d.prop) && tw.get(d.prop) !== d.value) {
          return "conflict";
        }
        tw.set(d.prop, d.value);
      } else {
        raw.push(d);
      }
    }
  }
  const out: Effective = new Map();
  const put = (prop: string, value: string) => {
    if (out.has(prop) && out.get(prop) !== value) {
      return false;
    }
    out.set(prop, value);
    return true;
  };
  for (const d of raw) {
    if (d.prop === "font") {
      // `font: var(--type-<role>)`: the token's own shorthand, cut up.
      const name = /^var\((--[\w-]+)\)$/u.exec(d.value.trim())?.[1];
      const parts = splitTop(
        (name ? themeValues.get(name) : undefined) ?? d.value
      );
      const slash = parts.indexOf("/");
      if (slash !== 2 || parts.length !== 5) {
        return null;
      }
      const [weight, size, , leading, family] = parts as [
        string,
        string,
        string,
        string,
        string,
      ];
      const ok =
        put("font-weight", resolve(weight, tw)) &&
        put("font-size", resolve(size, tw)) &&
        put("line-height", resolve(leading, tw)) &&
        put("font-family", resolve(family, tw));
      if (!ok) {
        return "conflict";
      }
    } else if (!put(d.prop, resolve(d.value, tw))) {
      return "conflict";
    }
  }
  return out;
};
/** A signature with no family set is the document's sans. */
const sign = (e: Effective) => {
  const copy = new Map(e);
  if (!copy.has("font-family") || copy.get("font-family") === SANS) {
    copy.set("font-family", "sans");
  }
  return [...copy.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
};

// ---- the utilities of the three families ------------------------------------

const themeText = read(THEME);
const designText = read(DESIGN);
const parsedUtilities = (text: string) => {
  const names: string[] = [];
  postcss.parse(text).walkAtRules("utility", (a) => {
    names.push(a.params.trim());
  });
  return names;
};
const tokenNames = (prefix: string) => {
  const names = new Set<string>();
  postcss.parse(themeText).walkDecls((d) => {
    if (
      d.prop.startsWith(`--${prefix}-`) &&
      d.parent?.type === "atrule" &&
      d.parent.name === "theme"
    ) {
      names.add(d.prop.slice(2 + prefix.length + 1));
    }
  });
  return names;
};
const textTokens = tokenNames("text");
const definedUtilities = new Set([
  ...parsedUtilities(themeText),
  ...parsedUtilities(designText),
]);
const isFamily = (name: string) =>
  name.startsWith("type-") ||
  name.startsWith("text-size-") ||
  (name.startsWith("text-") && textTokens.has(name.slice(5)));
const ROLE_NAMES = [...definedUtilities].filter((n) => n.startsWith("type-"));
const FAMILY = new Set<string>([
  ...[...definedUtilities].filter(isFamily),
  ...[...textTokens].map((t) => `text-${t}`),
]);
const SIZE_FAMILY = new Set([...FAMILY].filter((n) => !n.startsWith("type-")));

/** A class's base, its variants and importance cut off; null where it has any. */
const plain = (token: string) =>
  token.includes(":") || token.startsWith("!") || token.endsWith("!")
    ? null
    : token;
const baseOf = (token: string) =>
  token.replace(/^(?:[^\s:[]+:)*!?/u, "").replace(/!$/u, "");

// ---- inventory --------------------------------------------------------------

const texts = loadTexts();
const inventoryTexts = [...texts].filter(
  ([path]) =>
    (path.startsWith("apps/dashboard/src/") || path.startsWith("packages/")) &&
    !path.endsWith(".md")
);
const countUses = (name: string, files = inventoryTexts) => {
  const re = new RegExp(
    `(?<![\\w-])(?:[\\w-]+:)*!?${name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}!?(?![\\w-])`,
    "gu"
  );
  let n = 0;
  for (const [, text] of files) {
    n += text.match(re)?.length ?? 0;
  }
  return n;
};
const declsText = (name: string) => {
  const d = compile(name);
  return d
    ? d
        .map((x) => `${x.prop}: ${x.value}`)
        .join("; ")
        .replace(/\s+/gu, " ")
    : "(not a class)";
};
const inventory = [...FAMILY].sort().map((name) => ({
  decls: declsText(name),
  name,
  uses: countUses(name),
}));
say("## Inventory: utilities of the three families, as compiled, and uses");
say("(uses: occurrences in apps/dashboard/src and packages)");
say();
say("| utility | compiles to | uses |");
say("| --- | --- | ---: |");
for (const row of inventory) {
  say(`| ${row.name} | ${row.decls} | ${row.uses} |`);
}
say();

// ---- the role signatures, and the tracking a role gains ---------------------

const trackingTokens = tokenNames("tracking");
const gained: string[] = [];
let theme = themeText;
{
  const root = postcss.parse(theme);
  root.walkAtRules("utility", (rule) => {
    const role = /^type-(.+)$/u.exec(rule.params.trim())?.[1];
    if (
      !(role && trackingTokens.has(role)) ||
      rule.some((n) => n.type === "decl" && n.prop === "letter-spacing")
    ) {
      return;
    }
    rule.append({ prop: "letter-spacing", value: `var(--tracking-${role})` });
    gained.push(`type-${role}`);
  });
  if (gained.length > 0) {
    theme = root.toString();
  }
}
// The role utilities as they will stand: tracking in, compiled by hand.
const roleSigs = new Map<string, Effective>();
for (const role of ROLE_NAMES) {
  const e = effective([role]);
  if (e && e !== "conflict") {
    const name = role.slice(5);
    if (trackingTokens.has(name) && !e.has("letter-spacing")) {
      e.set("letter-spacing", resolve(`var(--tracking-${name})`, new Map()));
    }
    roleSigs.set(role, e);
  }
}
const roleBySig = new Map<string, string>();
for (const [role, e] of roleSigs) {
  const sig = sign(e);
  if (!roleBySig.has(sig)) {
    roleBySig.set(sig, role);
  }
}
const roleTracking = (role: string) =>
  roleSigs.get(role)?.get("letter-spacing");

// ---- class lists ------------------------------------------------------------

type Kind = "type" | "family" | "companion" | "foreign" | "other";
const COMPANION_PROPS = new Set([
  "line-height",
  "font-weight",
  "letter-spacing",
  "font-family",
]);
const kindOf = (token: string): Kind => {
  if (ROLE_NAMES.includes(token)) {
    return "type";
  }
  if (SIZE_FAMILY.has(token)) {
    return "family";
  }
  const decls = compile(token);
  if (!decls) {
    return "other";
  }
  const props = decls.map((d) => d.prop).filter((p) => !p.startsWith("--tw-"));
  if (props.length === 0 || !props.some((p) => TEXT_PROPS.has(p))) {
    return "other";
  }
  return props.every((p) => COMPANION_PROPS.has(p)) ? "companion" : "foreign";
};

const stats = {
  dedupedTracking: 0,
  folded: 0,
  left: 0,
};
const foldedFrom = new Map<string, number>();
interface Left {
  example: string;
  reason: string;
}
const lefts: Left[] = [];
let currentFile = "";
let currentText = "";
let currentOffset = 0;
const lineOf = () => {
  let line = 1;
  for (let i = 0; i < currentOffset && i < currentText.length; i += 1) {
    if (currentText.charCodeAt(i) === 10) {
      line += 1;
    }
  }
  return line;
};
const leave = (reason: string, body: string) => {
  stats.left += 1;
  lefts.push({
    example: `${currentFile}:${lineOf()}  ${body.trim().replace(/\s+/gu, " ").slice(0, 110)}`,
    reason,
  });
};

const SIZE_LABEL = (e: Effective) => {
  const parts = [
    e.has("font-size") ? "size" : "",
    e.has("line-height") ? "line height" : "",
    e.has("font-weight") ? "weight" : "",
    e.has("letter-spacing") ? "tracking" : "",
  ].filter(Boolean);
  return parts.join(" + ");
};

/** A property's value, the document's sans where no family is set. */
const normalized = (e: Effective, prop: string) => {
  const v = e.get(prop);
  return prop === "font-family" && (v === undefined || v === SANS) ? "sans" : v;
};

/** The reason a class list's effective declarations are no role. */
const whyNot = (e: Effective) => {
  const has = (p: string) => e.has(p);
  if (!(has("line-height") || has("font-weight"))) {
    return `sets size only (${e.get("font-size") === "inherit" ? "inherit" : "line height and weight come from the parent"})`;
  }
  if (!has("line-height")) {
    return `sets ${SIZE_LABEL(e)} but no line height (inherited)`;
  }
  if (!has("font-weight")) {
    return `sets ${SIZE_LABEL(e)} but no weight (inherited)`;
  }
  // Complete: the nearest role at its size, and what differs.
  let best: { diffs: string[]; role: string } | null = null;
  for (const [role, sig] of roleSigs) {
    if (sig.get("font-size") !== e.get("font-size")) {
      continue;
    }
    const diffs = [...new Set([...e.keys(), ...sig.keys()])].filter(
      (p) => normalized(e, p) !== normalized(sig, p)
    );
    if (!best || diffs.length < best.diffs.length) {
      best = { diffs, role };
    }
  }
  if (best) {
    return `complete but unlike ${best.role}: ${best.diffs.join(", ")} differ`;
  }
  return `complete, at a size no role has (${e.get("font-size")})`;
};

/** One class list (a literal's plain tokens). Returns the new text. */
const foldList = (body: string): string => {
  const parts = body.split(/(\s+)/u);
  const idx: { i: number; kind: Kind; token: string }[] = [];
  let opaque = false;
  let variantFamily = false;
  parts.forEach((token, i) => {
    if (i % 2 === 1 || !token) {
      return;
    }
    if (token.includes("\uE000")) {
      opaque = true;
      return;
    }
    const base = plain(token);
    if (base === null) {
      if (
        SIZE_FAMILY.has(baseOf(token)) ||
        ROLE_NAMES.includes(baseOf(token))
      ) {
        variantFamily = true;
      }
      return;
    }
    idx.push({ i, kind: kindOf(base), token: base });
  });
  const fam = idx.filter((x) => x.kind === "family");
  const types = idx.filter((x) => x.kind === "type");
  const companions = idx.filter((x) => x.kind === "companion");
  if (fam.length === 0 && types.length === 0) {
    if (variantFamily) {
      leave("only under a variant (md:, hover:, …)", body);
    }
    return body;
  }
  const drop = new Set<number>();
  if (fam.length === 0) {
    // A role beside a tracking it already sets.
    if (types.length === 1 && !opaque) {
      const want = roleTracking((types[0] as { token: string }).token);
      for (const c of companions) {
        const props = (compile(c.token) ?? [])
          .map((d) => d.prop)
          .filter((p) => !p.startsWith("--tw-"));
        const e = effective([c.token]);
        if (
          want !== undefined &&
          props.length === 1 &&
          props[0] === "letter-spacing" &&
          e &&
          e !== "conflict" &&
          e.get("letter-spacing") === want
        ) {
          drop.add(c.i);
          stats.dedupedTracking += 1;
        }
      }
    }
    return drop.size === 0 ? body : rebuild(parts, drop, -1, "");
  }
  if (opaque) {
    leave("class list has a dynamic part (a braced expression)", body);
    return body;
  }
  if (types.length > 0) {
    leave("a size utility beside a type-* role", body);
    return body;
  }
  if (idx.some((x) => x.kind === "foreign")) {
    leave("another utility sets the size (text-xs, text-[…px])", body);
    return body;
  }
  const set = [...fam, ...companions].map((x) => x.token);
  const e = effective(set);
  if (e === "conflict") {
    leave("two classes set one property two ways", body);
    return body;
  }
  if (!e) {
    leave("a class does not compile", body);
    return body;
  }
  const role = roleBySig.get(sign(e));
  if (!role) {
    leave(whyNot(e), body);
    return body;
  }
  stats.folded += 1;
  foldedFrom.set(role, (foldedFrom.get(role) ?? 0) + 1);
  for (const x of [...fam, ...companions]) {
    drop.add(x.i);
  }
  return rebuild(parts, drop, (fam[0] as { i: number }).i, role);
};
/** The list without the dropped tokens, `insert` standing where token `at` stood; the spacing between tokens is kept. */
const rebuild = (
  parts: string[],
  drop: Set<number>,
  at: number,
  insert: string
) => {
  const items: { sep: string; tok: string }[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const tok = parts[i] as string;
    if (!tok) {
      continue;
    }
    const sep = i > 0 ? (parts[i - 1] as string) : "";
    if (i === at) {
      items.push({ sep, tok: insert });
    } else if (!drop.has(i)) {
      items.push({ sep, tok });
    }
  }
  const firstSep =
    parts[0] === "" && parts.length > 1 ? (parts[1] as string) : "";
  const last = parts.length - 1;
  const trail =
    last > 0 && last % 2 === 0 && parts[last] === ""
      ? (parts[last - 1] as string)
      : "";
  return (
    items.map((it, k) => (k === 0 ? firstSep : it.sep) + it.tok).join("") +
    trail
  );
};

/** A literal's body: `{…}` groups (Svelte) and `${…}` become opaque tokens, and their insides are scanned as text. The body comes back as it was unless a class list in it changed. */
const foldBody = (body: string): string => {
  const groups: { dollar: boolean; text: string }[] = [];
  let masked = "";
  let depth = 0;
  let group = "";
  let dollar = false;
  for (const ch of body) {
    if (depth === 0) {
      if (ch === "{") {
        depth = 1;
        group = "";
        dollar = masked.endsWith("$");
        if (dollar) {
          masked = masked.slice(0, -1);
        }
        continue;
      }
      masked += ch;
    } else {
      if (ch === "{") {
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          groups.push({ dollar, text: group });
          masked += `\uE000${groups.length - 1}\uE000`;
          continue;
        }
      }
      group += ch;
    }
  }
  if (depth !== 0) {
    return body;
  }
  const inner = groups.map((g) => scan(g.text));
  const folded = foldList(masked);
  if (folded === masked && inner.every((t, k) => t === groups[k]?.text)) {
    return body;
  }
  return folded.replace(
    /\uE000(\d+)\uE000/gu,
    (_m, n: string) =>
      `${groups[Number(n)]?.dollar ? "$" : ""}{${inner[Number(n)]}}`
  );
};

const LITERAL = /class="([^"]*)"|"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/gu;
/** Where the text is a comment: a block, an HTML one, a line one. */
const COMMENT = /\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|(?<![:"'\w])\/\/[^\n]*/gu;
const commentRanges = (text: string) =>
  [...text.matchAll(COMMENT)].map(
    (m) => [m.index as number, (m.index as number) + m[0].length] as const
  );
let comments: (readonly [number, number])[] = [];
const scan = (text: string): string =>
  text.replace(LITERAL, (whole, a, b, c, d, offset: number) => {
    if (
      comments.some(([from, to]) => offset >= from && offset < to) &&
      text === currentText
    ) {
      return whole;
    }
    currentOffset = offset;
    if (a !== undefined) {
      return `class="${foldBody(a)}"`;
    }
    if (b !== undefined) {
      return `"${foldBody(b)}"`;
    }
    if (c !== undefined) {
      return `'${foldBody(c)}'`;
    }
    if (d !== undefined) {
      return `\`${foldBody(d)}\``;
    }
    return whole;
  });

const APPLY = /(@apply\s+)([^;}]+)/gu;
const scanApply = (text: string) =>
  text.replace(
    APPLY,
    (_m, head: string, list: string) => head + foldList(list)
  );

// ---- run over the files -----------------------------------------------------

const changed = new Set<string>();
for (const [path, text] of texts) {
  if (/\.(md|json|ya?ml)$/u.test(path) || path.startsWith("scripts/")) {
    continue;
  }
  if (
    !/(?:type-|text-size-|text-(?:meta|label|body|title|kpi|row|code|display)|field-edge)/u.test(
      text
    )
  ) {
    continue;
  }
  currentFile = path;
  currentText = text;
  comments = commentRanges(text);
  let next = scan(text);
  if (path.endsWith(".css")) {
    next = scanApply(next);
  }
  if (next !== text) {
    texts.set(path, next);
    write(path, next);
    changed.add(path);
  }
}

// ---- 4. field frames --------------------------------------------------------

const RESTING = new Set(["border-border-control", "border-border-row-outline"]);
const frames: string[] = [];
let framesCleaned = 0;
{
  const FIELD = /field-edge/u;
  for (const [path, text] of texts) {
    if (
      /\.(md|json|ya?ml)$/u.test(path) ||
      path.startsWith("scripts/") ||
      !FIELD.test(text)
    ) {
      continue;
    }
    let out = text;
    // Each literal that carries `field-edge`, taken whole, and where it stands in an argument list, the literals beside it.
    const lits = [...out.matchAll(/class="([^"]*)"|"([^"\n]*)"|'([^'\n]*)'/gu)];
    const edits: { from: number; to: number; text: string }[] = [];
    const strip = (body: string) => {
      const parts = body.split(/(\s+)/u);
      let n = 0;
      const kept = parts.filter((p, i) => {
        if (i % 2 === 0 && RESTING.has(p)) {
          n += 1;
          return false;
        }
        return true;
      });
      if (n === 0) {
        return null;
      }
      const joined = kept
        .join("")
        .replace(/(\S)\s{2,}(?=\S)/gu, (_m, c: string) => `${c} `)
        .replace(/^\s+(?=\S)/u, (m) => (body.startsWith("\n") ? m : ""));
      return { n, text: body.includes("\n") ? joined : joined.trim() };
    };
    for (const m of lits) {
      const body = (m[1] ?? m[2] ?? m[3]) as string;
      const tokens = body.split(/\s+/u);
      if (!tokens.includes("field-edge")) {
        continue;
      }
      const start = m.index as number;
      frames.push(`${path}:${out.slice(0, start).split("\n").length}`);
      const targets: [number, number][] = [[start, start + m[0].length]];
      // In a cn(…) call or an array: an unconditional literal's neighbours.
      const before = out.slice(0, start).trimEnd();
      const lead = before.at(-1);
      if (
        (lead === "," || lead === "[" || lead === "(") &&
        !m[0].startsWith("class=")
      ) {
        let depth = 0;
        let open = -1;
        for (let i = start - 1; i >= 0; i -= 1) {
          const ch = out[i];
          if (ch === ")" || ch === "]" || ch === "}") {
            depth += 1;
          } else if (ch === "(" || ch === "[" || ch === "{") {
            if (depth === 0) {
              open = i;
              break;
            }
            depth -= 1;
          }
        }
        if (open >= 0 && out[open] !== "{") {
          const closeCh = out[open] === "(" ? ")" : "]";
          let d = 0;
          let close = -1;
          for (let i = open + 1; i < out.length; i += 1) {
            const ch = out[i];
            if (ch === "(" || ch === "[" || ch === "{") {
              d += 1;
            } else if (ch === ")" || ch === "]" || ch === "}") {
              if (d === 0 && ch === closeCh) {
                close = i;
                break;
              }
              d -= 1;
            }
          }
          if (close > 0) {
            for (const n of lits) {
              const s = n.index as number;
              if (s <= open || s >= close || s === start) {
                continue;
              }
              // At the argument list's own depth, and not itself conditional.
              let dd = 0;
              for (let i = open + 1; i < s; i += 1) {
                const ch = out[i];
                if (ch === "(" || ch === "[" || ch === "{") {
                  dd += 1;
                } else if (ch === ")" || ch === "]" || ch === "}") {
                  dd -= 1;
                }
              }
              const prev = out.slice(open + 1, s).trimEnd();
              const prevCh = prev.at(-1);
              if (dd === 0 && (prevCh === "," || prevCh === undefined)) {
                targets.push([s, s + n[0].length]);
              }
            }
          }
        }
      }
      for (const [s, e] of targets) {
        const lit = out.slice(s, e);
        let quote = lit[0] === "'" ? "'" : '"';
        if (lit.startsWith("class=")) {
          quote = 'class="';
        }
        const inner = lit.startsWith("class=")
          ? lit.slice(7, -1)
          : lit.slice(1, -1);
        const res = strip(inner);
        if (res) {
          edits.push({
            from: s,
            to: e,
            text:
              quote === 'class="'
                ? `class="${res.text}"`
                : `${quote}${res.text}${quote}`,
          });
          framesCleaned += res.n;
        }
      }
    }
    if (edits.length > 0) {
      const seen = new Set<number>();
      edits.sort((a, b) => b.from - a.from);
      for (const ed of edits) {
        if (seen.has(ed.from)) {
          continue;
        }
        seen.add(ed.from);
        out = out.slice(0, ed.from) + ed.text + out.slice(ed.to);
      }
      texts.set(path, out);
      write(path, out);
      changed.add(path);
    }
  }
}

// ---- 3. utilities nothing uses ----------------------------------------------

const useTexts = [...texts].filter(
  ([path]) => !path.startsWith("scripts/lint/fixtures/")
);
const deletedUtilities: string[] = [];
{
  const dead = new Set(
    [...SIZE_FAMILY].filter(
      (n) =>
        definedUtilities.has(n) &&
        countUses(n, useTexts) === 0 &&
        !new RegExp(`@apply[^;]*\\b${n}\\b`, "u").test(theme)
    )
  );
  const root = postcss.parse(theme);
  root.walkAtRules("utility", (rule) => {
    if (dead.has(rule.params.trim())) {
      deletedUtilities.push(rule.params.trim());
      rule.remove();
    }
  });
  if (deletedUtilities.length > 0) {
    theme = root.toString();
  }
  const designRoot = postcss.parse(designText);
  let designChanged = false;
  designRoot.walkAtRules("utility", (rule) => {
    if (dead.has(rule.params.trim())) {
      deletedUtilities.push(rule.params.trim());
      rule.remove();
      designChanged = true;
    }
  });
  if (designChanged) {
    const cur = read(DESIGN);
    const next = designRoot.toString();
    if (cur === designText) {
      write(DESIGN, next);
      changed.add(DESIGN);
    }
  }
}
if (theme !== themeText) {
  write(THEME, theme);
  changed.add(THEME);
}

// ---- field-edge itself ------------------------------------------------------

{
  let cur = read(DESIGN);
  const before = cur;
  if (!/@utility field-edge \{\s*border-color:/u.test(cur)) {
    cur = cur.replace(
      "@utility field-edge {\n",
      "@utility field-edge {\n  border-color: var(--color-border-row-outline);\n"
    );
  }
  cur = cur
    .replace(
      "/* A text field with a frame of its own (DESIGN.md, The Caret Rule): while\n   its text has focus the frame's border steps up to the strong control\n   edge,",
      "/* A text field with a frame of its own (DESIGN.md, The Caret Rule): the\n   frame rests on `border-row-outline` (3:1 on the surface it stands on,\n   WCAG 1.4.11) and while its text has focus the border steps up to the\n   strong control edge,"
    )
    .replace(
      "This selector outweighs the field's own border utility\n   (`border-border-control`) on purpose",
      "This selector outweighs a border-colour utility on the field\n   on purpose"
    );
  if (cur !== before) {
    write(DESIGN, cur);
    changed.add(DESIGN);
  }
  const t = read(THEME);
  const nt = t.replace(
    "/* Set with its tracking: the web's `text-title` utility carries it (app.css @theme, `--text-title--letter-spacing`), and the native role carries the same token. */",
    "/* Set with its tracking: the `type-title` utility carries `--tracking-title`, and the native role carries the same token. */"
  );
  if (nt !== t) {
    write(THEME, nt);
    changed.add(THEME);
  }
}

// ---- report -----------------------------------------------------------------

say("## Roles that gained tracking");
say(gained.length ? gained.join(", ") : "(none this run)");
say();
say("## Class lists");
say(
  `folded to a type-<role>: ${stats.folded}; tracking beside a role that sets it, removed: ${stats.dedupedTracking}; left: ${stats.left}`
);
for (const [role, n] of [...foldedFrom].sort()) {
  say(`  ${role}: ${n}`);
}
say();
say("## Left outside type-*, by reason");
const byReason = new Map<string, Left[]>();
for (const l of lefts) {
  byReason.set(l.reason, [...(byReason.get(l.reason) ?? []), l]);
}
for (const [reason, list] of [...byReason].sort(
  (a, b) => b[1].length - a[1].length
)) {
  say(`- ${reason}: ${list.length}`);
  for (const l of list.slice(0, 3)) {
    say(`    ${l.example}`);
  }
}
say();
say(`## Utilities deleted: ${deletedUtilities.join(", ") || "(none)"}`);
say();
say("## Field frames");
say(`frames carrying field-edge: ${frames.length}`);
for (const f of frames) {
  say(`  ${f}`);
}
say(`resting border classes removed: ${framesCleaned}`);
say();
{
  const ev = evaluatorOver(readFileSync(join(ROOT, THEME), "utf8"));
  say("## border-row-outline against each surface (WCAG contrast)");
  say("| surface | day | night |");
  say("| --- | ---: | ---: |");
  const surfaces = [
    "surface-page",
    "surface-raised",
    "surface-recess",
    "surface-recess-deep",
    "surface-well",
    "surface-shelf",
    "surface-lift",
    "surface-fill",
  ];
  for (const s of surfaces) {
    try {
      const day = contrastBetween(ev, "border-row-outline", s, "base");
      const night = contrastBetween(ev, "border-row-outline", s, "dark");
      say(`| ${s} | ${day.toFixed(2)} | ${night.toFixed(2)} |`);
    } catch {
      say(`| ${s} | n/a | n/a |`);
    }
  }
}
if (changed.size > 0) {
  format([...changed]);
  say();
  say(`changed ${changed.size} files`);
}

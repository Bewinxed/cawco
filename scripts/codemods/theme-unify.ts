// biome-ignore-all lint/performance/useTopLevelRegex: a one-shot script, run by hand, never on a hot path.
/**
 * `bun scripts/codemods/theme-unify.ts`: one token for each job in the
 * dashboard's theme.css. Safe to run twice (the second run changes nothing).
 *
 *   1. Merges: every use of the left token becomes the right one, then the
 *      left is deleted. A use is the name as `--name` (every scan root of
 *      theme-prune.ts, and theme.css's own reads), a class Tailwind compiles
 *      to a rule that reads the token (its suffix becomes the right token's:
 *      `shadow-xl` is `shadow-overlay`), and the name written bare inside
 *      quotes (a list of token names). A merge whose left token is built from
 *      parts by the code (`--color-${section.hue}`) is not made but listed.
 *   2. Values: the status glyphs, the keyword colour, the code ring, the
 *      `--type-*` shorthands' line-heights, the caps size and two trackings.
 *   3. Colours nothing reads: the listed tokens that no `--name`, class,
 *      token or built name reaches are deleted.
 *
 * Reuses theme-prune.ts's reading of the tree and tokens-to-theme.ts's
 * whole-name rename (a custom property's name whole, never part of a longer
 * one); the class reading is scripts/codemods/lib/tailwind-reads.ts.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Color from "colorjs.io";
import postcss, {
  type ChildNode,
  type Container,
  type Declaration,
} from "postcss";
import { CssEvaluator, type CssToken } from "../../packages/hub/src/design-css";
import { ROOT, repoFiles } from "../lib/repo-files";
import { CANDIDATE, classReads, formsOf } from "./lib/tailwind-reads";

const THEME = "apps/dashboard/src/lib/tokens/theme.css";
const CONTRAST = "scripts/token-contrast-check.ts";
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
/** Never renamed: this migration's own files, other projects' tokens, vendored files. */
const SKIP = (path: string) =>
  path === THEME ||
  path.startsWith("scripts/codemods/") ||
  path === "packages/hub/src/design-tokens.ts" ||
  /(^|\/)dtcg-[^/]*$/u.test(path) ||
  /(^|\/)node_modules\//u.test(path);

const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const write = (path: string, text: string) =>
  writeFileSync(join(ROOT, path), text);

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
const changed = new Set<string>();
const report: string[] = [];
const say = (line: string) => {
  report.push(line);
  console.log(line);
};

/** A custom property's name, whole: not part of a longer one (tokens-to-theme.ts). */
const NAME = /(?<![\w-])--[\w-]+/gu;
const READ = /var\(\s*(--[\w-]*[\w])(?![\w-])/gu;
/** `--x` written where it is declared. */
const DECLARED = /(?<![\w-])(--[\w-]+)(?:\s*[:=]|["'`]\s*,)/gu;

// ---- the theme --------------------------------------------------------------

let themeText = read(THEME);
const themeRoot = () => postcss.parse(themeText);
const declsOf = (root: postcss.Root) => {
  const out: Declaration[] = [];
  root.walkDecls((d) => {
    if (d.prop.startsWith("--")) {
      out.push(d);
    }
  });
  return out;
};
/** The variables of the `@theme` blocks, by name. */
const themeNames = (text: string) => {
  const names = new Set<string>();
  postcss.parse(text).walkAtRules("theme", (theme) => {
    for (const n of theme.nodes ?? []) {
      if (n.type === "decl" && n.prop.startsWith("--")) {
        names.add(n.prop);
      }
    }
  });
  return names;
};
/** The `var(--x)` reads of a name nothing declares, counted as tokens-to-theme.proof.ts counts them (its `dangling`, over the sources it reads), over the tree as it stands. */
const countable = (path: string) =>
  [
    "apps/dashboard/src/",
    "apps/dashboard/scripts/",
    "packages/",
    "scripts/",
  ].some((root) => path.startsWith(root)) &&
  /\.(svelte|css|ts|tsx|js|mjs|html)$/u.test(path) &&
  !path.startsWith("scripts/lint/fixtures/");
const dangling = () => {
  const sources = [
    ...[...texts].filter(([path]) => countable(path)).map(([, text]) => text),
    themeText,
  ];
  const declared = new Set<string>();
  for (const text of sources) {
    for (const d of text.matchAll(DECLARED)) {
      declared.add(d[1] as string);
    }
  }
  const reads = new Map<string, number>();
  for (const text of sources) {
    for (const r of text.matchAll(READ)) {
      if (!declared.has(r[1] as string)) {
        reads.set(r[1] as string, (reads.get(r[1] as string) ?? 0) + 1);
      }
    }
  }
  return {
    names: reads.size,
    reads: [...reads.values()].reduce((a, b) => a + b, 0),
  };
};
const danglingBefore = dangling();
/** A value on one line, as the formatter may have wrapped it. */
const flat = (value: string) =>
  value.replace(/\s+/gu, " ").replace(/\( /gu, "(").replace(/ \)/gu, ")");
const variablesBefore = themeNames(themeText).size;
const valueFor = (name: string) =>
  declsOf(themeRoot()).find((d) => d.prop === name)?.value;
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
/** Deletes every declaration of the names (and the comments above each) from the theme text. */
const deleteDecls = (names: Set<string>) => {
  const root = themeRoot();
  for (const d of declsOf(root)) {
    if (names.has(d.prop)) {
      const parent = d.parent as Container;
      for (const c of commentsAbove(d)) {
        c.remove();
      }
      d.remove();
      prune(parent);
    }
  }
  themeText = root.toString();
};
/** Sets a declaration's value everywhere it is declared (the base and any override). */
const setValue = (name: string, value: string) => {
  const root = themeRoot();
  for (const d of declsOf(root)) {
    if (d.prop === name) {
      d.value = value;
    }
  }
  themeText = root.toString();
};

/**
 * A list entry (`"--duration-panel",` or `"--duration-panel": "Grow",`) the
 * rename made a second copy of its neighbour: it is dropped, the first stays.
 */
const ENTRY = /^\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`)(?:\s*:.*)?,?\s*$/u;
const entryKey = (line: string) => {
  const hit = ENTRY.exec(line);
  return hit ? (hit[1] ?? hit[2] ?? hit[3]) : undefined;
};
const dedupeEntries = (was: string, now: string) => {
  const a = was.split("\n");
  const b = now.split("\n");
  if (a.length !== b.length) {
    return now;
  }
  const drop = new Set<number>();
  b.forEach((line, i) => {
    const key = a[i] === line ? undefined : entryKey(line);
    if (key === undefined) {
      return;
    }
    // The run of entries this line stands in.
    let from = i;
    while (from > 0 && entryKey(b[from - 1] as string) !== undefined) {
      from -= 1;
    }
    let to = i;
    while (to < b.length - 1 && entryKey(b[to + 1] as string) !== undefined) {
      to += 1;
    }
    for (let j = from; j <= to; j += 1) {
      if (
        j !== i &&
        entryKey(b[j] as string) === key &&
        (j < i || a[j] === b[j])
      ) {
        drop.add(i);
        return;
      }
    }
  });
  return b.filter((_, i) => !drop.has(i)).join("\n");
};

/** Places a token is named that the rename cannot reach (a label, a list): in `file`, `find` becomes `replace`, where it is still there. */
interface Edit {
  file: string;
  find: string;
  replace: string;
}
const EDITS: Edit[] = [
  // The contrast check lists inks by bare name: ink-stat is ink-row now, and ink-solid ink-strong.
  {
    file: CONTRAST,
    find: '"ink-row", "ink-row"',
    replace: '"ink-row"',
  },
  {
    file: CONTRAST,
    find: "surface-band (a board column's head)",
    replace: "surface-recess (a board column's head)",
  },
  {
    file: CONTRAST,
    find: 'label: "on-ink on ink-solid"',
    replace: 'label: "on-ink on ink-strong"',
  },
  // border-button-outline is border-row-outline: its two pairs are the row-outline pairs already.
  {
    file: CONTRAST,
    find: `  {
    label: "border-button-outline on surface-raised",
    fg: "border-row-outline",
    bg: ["surface-raised"],
    floor: UI,
    source: S.outline,
  },
`,
    replace: "",
  },
  {
    file: CONTRAST,
    find: `  {
    label: "border-button-outline on surface-recess",
    fg: "border-row-outline",
    bg: ["surface-recess"],
    floor: { light: 2.95, dark: UI },
    source: S.rowOutline,
  },
`,
    replace: "",
  },
  {
    file: CONTRAST,
    find: `  outline: "DESIGN.md, Edges; token border-button-outline",
`,
    replace: "",
  },
  // The grow tokens are the panel's: its exit's label says so.
  {
    file: "packages/core/src/words/graph.ts",
    find: '"--duration-panel-exit": "Grow exit"',
    replace: '"--duration-panel-exit": "Panel exit"',
  },
];

// ---- 1. merges --------------------------------------------------------------

/** Left merged into right. `swap`: the right is deleted and the left takes its name. */
interface Merge {
  /** Only when both are declared with one value. */
  ifEqual?: boolean;
  left: string;
  right: string;
  swap?: boolean;
}
const m = (left: string, right: string, rest: Partial<Merge> = {}): Merge => ({
  left,
  right,
  ...rest,
});
const MERGES: Merge[] = [
  m("--duration-rail", "--duration-morph"),
  m("--duration-mark-hold", "--duration-fade"),
  m("--duration-grow-exit", "--duration-panel-exit"),
  m("--duration-grow", "--duration-panel"),
  m("--duration-lift", "--duration-panel"),
  m("--shadow-modal", "--shadow-overlay"),
  m("--shadow-xl", "--shadow-overlay"),
  m("--shadow-lg", "--shadow-md"),
  // The surviving token has stat's value and hairline's name.
  m("--shadow-stat", "--shadow-hairline", { swap: true }),
  m("--radius-row-mark", "--radius-xs"),
  m("--radius-tab-icon", "--radius-xs"),
  m("--radius-panel", "--radius-modal"),
  m("--color-border-card", "--color-border-control"),
  m("--color-border-control-strong", "--color-border-row-outline"),
  m("--color-border-button-outline", "--color-border-row-outline"),
  m("--color-well-edge", "--color-border-well"),
  m("--color-surface-band", "--color-surface-recess"),
  m("--color-surface-tile", "--color-surface-lift"),
  m("--color-press-fill", "--color-surface-pressed"),
  m("--color-ink-stat", "--color-ink-row"),
  m("--color-ink-solid", "--color-ink-strong"),
  m("--color-on-brand", "--color-on-action"),
  m("--color-chip-chosen-bg", "--color-action-solid", { ifEqual: true }),
  m("--font-body", "--font-sans"),
  m("--tracking-widest", "--tracking-caps"),
  m("--leading-tight", "--leading-ui"),
  m("--color-data-ok", "--color-success-9"),
  m("--color-data-warn", "--color-warning-9"),
  m("--color-data-bad", "--color-error-9"),
  m("--color-meter-near", "--color-warning-9"),
  m("--color-meter-over", "--color-error-9"),
];

/** The eight Tailwind-palette colours, each with the mark step nearest in OKLCH hue. */
const HUE = /oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)/u;
const hueOf = (css: string, half: 0 | 1 = 0) =>
  Number([...css.matchAll(new RegExp(HUE, "gu"))][half]?.[3]);
const circular = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
};
const hueMap = (() => {
  const marks = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
    name: `--color-mark-${n}`,
    hue: hueOf(valueFor(`--color-mark-${n}`) ?? ""),
  }));
  const out: { hue: string; angle: number; mark: string }[] = [];
  for (const d of declsOf(themeRoot())) {
    if (
      d.prop.startsWith("--color-hue-") &&
      !out.some((o) => o.hue === d.prop)
    ) {
      const angle = hueOf(d.value);
      const nearest = marks.reduce((a, b) =>
        circular(b.hue, angle) < circular(a.hue, angle) ? b : a
      );
      out.push({ angle, hue: d.prop, mark: nearest.name });
    }
  }
  return out;
})();

const merges: Merge[] = [];
{
  const root = themeRoot();
  const declared = new Set(declsOf(root).map((d) => d.prop));
  for (const merge of MERGES) {
    if (!declared.has(merge.left)) {
      say(`merge ${merge.left} -> ${merge.right}: already gone, skipped`);
      continue;
    }
    if (!(merge.swap || declared.has(merge.right))) {
      throw new Error(
        `${merge.right}: not declared (the target of ${merge.left})`
      );
    }
    if (merge.ifEqual) {
      const same = (name: string) =>
        declsOf(root)
          .filter((d) => d.prop === name)
          .map((d) => flat(d.value))
          .join("|");
      if (same(merge.left) !== same(merge.right)) {
        say(
          `merge ${merge.left} -> ${merge.right}: left as it is, the values differ (${same(merge.left)} against ${same(merge.right)})`
        );
        continue;
      }
    }
    merges.push(merge);
  }
}
const hueTokens = hueMap.filter((h) => themeNames(themeText).has(h.hue));
for (const h of hueTokens) {
  say(
    `hue ${h.hue} (${h.angle.toFixed(1)}deg) -> ${h.mark}: NOT merged, see the report`
  );
}

if (merges.length > 0) {
  // The classes that read a left token, with the class that reads its right.
  const { keysOf, readsOf } = await classReads(texts);
  const nsOf = (key: string) => key.slice(2).split("-")[0] as string;
  const suffixOf = (key: string) => key.slice(`--${nsOf(key)}-`.length);
  const byLeft = new Map(merges.map((x) => [x.left, x]));
  const houseUtilities = new Set(
    [themeText, ...texts.values()].flatMap((css) =>
      [...css.matchAll(/@utility\s+([\w-]+)/gu)].map((u) => u[1] as string)
    )
  );
  const classMap = new Map<string, { to: string; left: string }>();
  const unhandled: string[] = [];
  for (const [candidate, keys] of readsOf) {
    const lefts = [...keys].filter((k) => byLeft.has(k));
    if (lefts.length === 0) {
      continue;
    }
    if (lefts.length > 1) {
      unhandled.push(`${candidate} reads ${lefts.join(" and ")}`);
      continue;
    }
    const left = lefts[0] as string;
    const { right } = byLeft.get(left) as Merge;
    // A class that holds the name itself (`bg-(--color-x)`, `[--x:var(--color-y)]`) is the whole-name rename's.
    if ([...candidate.matchAll(NAME)].some((n) => n[0] === left)) {
      continue;
    }
    const sl = suffixOf(left);
    const at = new RegExp(
      `-${sl.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(?=[/!]|$)`,
      "u"
    );
    const found = [...candidate.matchAll(new RegExp(at, "gu"))].at(-1);
    if (!found || found.index === undefined) {
      // A house utility (`@utility field-edge`) reads the token through a var(): the theme's own rename moves it.
      if (houseUtilities.has(candidate)) {
        continue;
      }
      unhandled.push(`${candidate} reads ${left}, but ${sl} is not its suffix`);
      continue;
    }
    const to =
      candidate.slice(0, found.index) +
      `-${suffixOf(right)}` +
      candidate.slice(found.index + found[0].length);
    // A class compiled once is cached and asks the theme nothing the second time.
    const now = readsOf.get(to) ?? keysOf(to);
    if (!now.has(right) || now.has(left)) {
      unhandled.push(`${candidate} -> ${to} does not read ${right} alone`);
      continue;
    }
    classMap.set(candidate, { left, to });
  }
  if (unhandled.length > 0) {
    throw new Error(
      `classes the rewrite cannot move:\n  ${unhandled.join("\n  ")}`
    );
  }

  const renames: Record<string, string> = Object.fromEntries(
    merges.map((x) => [x.left, x.right])
  );
  const moved = new Map<
    string,
    { names: number; classes: number; bare: number }
  >(merges.map((x) => [x.left, { bare: 0, classes: 0, names: 0 }]));
  const tally = (left: string) =>
    moved.get(left) as { names: number; classes: number; bare: number };
  /** A color token written bare inside quotes (a list of token names): `"ink-stat"`. */
  const bare = new Map<string, string>();
  for (const x of merges) {
    if (nsOf(x.left) === "color") {
      bare.set(suffixOf(x.left), x.left);
    }
  }
  const BARE = /(?<=["'`]|color\.)([a-z][a-z0-9-]*)(?=["'`])/gu;

  for (const [path, text] of texts) {
    let next = text.replace(CANDIDATE, (raw) => {
      for (const form of formsOf(raw)) {
        const hit = classMap.get(form);
        if (hit) {
          tally(hit.left).classes += 1;
          return raw.replace(form, hit.to);
        }
      }
      return raw;
    });
    next = next.replace(NAME, (name) => {
      const to = renames[name];
      if (to) {
        tally(name).names += 1;
      }
      return to ?? name;
    });
    next = next.replace(BARE, (word) => {
      const left = bare.get(word);
      if (!left) {
        return word;
      }
      tally(left).bare += 1;
      return suffixOf((byLeft.get(left) as Merge).right);
    });
    next = dedupeEntries(text, next);
    if (next !== text) {
      texts.set(path, next);
      write(path, next);
      changed.add(path);
    }
  }

  // The theme: the left tokens go (the right of a swap too, its name taken by
  // the left), then every read of a left, in values and comments, is the right.
  const swapped = new Set(merges.filter((x) => x.swap).map((x) => x.left));
  const gone = new Set(merges.flatMap((x) => (x.swap ? [x.right] : [x.left])));
  deleteDecls(gone);
  // Reads of a left inside the theme (its own declaration aside), counted before the rename.
  const themeReads = new Map<string, number>();
  for (const n of themeText.matchAll(NAME)) {
    if (renames[n[0]]) {
      themeReads.set(n[0], (themeReads.get(n[0]) ?? 0) + 1);
    }
  }
  themeText = themeText.replace(NAME, (name) => renames[name] ?? name);

  for (const x of merges) {
    const t = tally(x.left);
    const inTheme =
      (themeReads.get(x.left) ?? 0) - (swapped.has(x.left) ? 1 : 0);
    say(
      `merge ${x.left} -> ${x.right}${x.swap ? " (stat's value under hairline's name)" : ""}: ${t.names + inTheme} uses moved (${t.names} as a name in the sources, ${inTheme} as a read in theme.css), ${t.classes} classes, ${t.bare} bare names`
    );
  }
}

// ---- 2. values --------------------------------------------------------------

/** A `light-dark(oklch(…), oklch(…))`'s two oklch colours, as written. */
const halves = (css: string) =>
  [...css.matchAll(/oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)/gu)].map(
    (h) => ({ c: h[2] as string, h: h[3] as string, l: h[1] as string })
  );
const lightDark = (a: string, b: string) => `light-dark(${a}, ${b})`;
const oklch = (h: { l: string; c: string; h: string }) =>
  `oklch(${h.l}% ${h.c} ${h.h})`;

// --color-status-fail-glyph: error-9's hue angle, its own lightness and chroma.
{
  const fail = valueFor("--color-status-fail-glyph");
  const error = valueFor("--color-error-9");
  if (fail && error) {
    const was = halves(fail);
    const hues = halves(error);
    const next = lightDark(
      oklch({
        ...(was[0] as (typeof was)[0]),
        h: (hues[0] as (typeof hues)[0]).h,
      }),
      oklch({
        ...(was[1] as (typeof was)[0]),
        h: (hues[1] as (typeof hues)[0]).h,
      })
    );
    if (next !== flat(fail)) {
      setValue("--color-status-fail-glyph", next);
      say(`--color-status-fail-glyph: ${flat(fail)} -> ${next}`);
    }
  }
}

// The measure the contrast check makes, over the theme as it stands.
const refs = (value: string) => value.replace(/var\(--([\w-]+)\)/gu, "{$1}");
const evaluatorOver = (overrides: Record<string, string>) => {
  const light = new Map<string, string>();
  const dark = new Map<string, string>();
  postcss.parse(themeText).walkDecls((decl) => {
    const rule = decl.parent;
    if (!decl.prop.startsWith("--")) {
      return;
    }
    if (
      rule?.type === "atrule" &&
      rule.name === "theme" &&
      rule.params === "static"
    ) {
      light.set(decl.prop.slice(2), refs(decl.value));
    } else if (
      rule?.type === "rule" &&
      rule.selectors.includes('[data-scheme="dark"]')
    ) {
      dark.set(decl.prop.slice(2), refs(decl.value));
    }
  });
  for (const [k, v] of Object.entries(overrides)) {
    light.set(k, v);
    dark.delete(k);
  }
  const lookup = (path: string): CssToken | undefined => {
    const leaf = path.split(".").at(-1) ?? path;
    for (const name of [`color-${leaf}`, leaf]) {
      const css = light.get(name);
      if (css !== undefined) {
        const variant = dark.get(name);
        return {
          css,
          name,
          variants: variant === undefined ? {} : { dark: variant },
        };
      }
    }
  };
  return new CssEvaluator(lookup, new Set(["dark"]));
};
const clip = (c: Color) =>
  new Color(
    "srgb",
    c
      .to("srgb")
      .coords.map((v) => Math.min(1, Math.max(0, Number(v ?? 0)))) as [
      number,
      number,
      number,
    ]
  );
const contrastOf = (glyph: string, mode: "base" | "dark") => {
  const ev = evaluatorOver({ "color-status-done-glyph": glyph });
  return Color.contrastWCAG21(
    clip(ev.colourOf("color.status-done-glyph", mode, "glyph")),
    clip(ev.colourOf("color.status-done-bg", mode, "bg"))
  );
};

// --color-status-done-glyph: darker until it holds 3:1 on status-done-bg in both schemes.
{
  const done = valueFor("--color-status-done-glyph");
  if (done) {
    const was = halves(done);
    const next = was.map((half, i) => {
      const mode = i === 0 ? "base" : "dark";
      let l = Number(half.l);
      const start = contrastOf(oklch(half), mode);
      if (start >= 3) {
        return { half, ratio: start, start };
      }
      for (; l > 0; l = Math.round((l - 0.5) * 10) / 10) {
        const ratio = contrastOf(oklch({ ...half, l: String(l) }), mode);
        if (ratio >= 3) {
          return { half: { ...half, l: String(l) }, ratio, start };
        }
      }
      throw new Error(
        `--color-status-done-glyph: no lightness holds 3:1 on status-done-bg in the ${mode} scheme (${start.toFixed(2)}:1 as it is)`
      );
    });
    const value = lightDark(
      oklch((next[0] as (typeof next)[0]).half),
      oklch((next[1] as (typeof next)[0]).half)
    );
    if (value === flat(done)) {
      say(
        `--color-status-done-glyph: already ${(next[0] as (typeof next)[0]).ratio.toFixed(2)}:1 light, ${(next[1] as (typeof next)[0]).ratio.toFixed(2)}:1 dark on status-done-bg`
      );
    } else {
      setValue("--color-status-done-glyph", value);
      say(
        `--color-status-done-glyph: ${flat(done)} (${(next[0] as (typeof next)[0]).start.toFixed(2)}:1 light, ${(next[1] as (typeof next)[0]).start.toFixed(2)}:1 dark) -> ${value} (${(next[0] as (typeof next)[0]).ratio.toFixed(2)}:1 light, ${(next[1] as (typeof next)[0]).ratio.toFixed(2)}:1 dark)`
      );
    }
  }
}

// --color-code-keyword: mark-7, not the action's coral.
{
  const keyword = valueFor("--color-code-keyword");
  // mark-7 is the violet; the lint's contrast check holds a syntax ink to 4.5:1 on a diff's tinted rows, which mark-7's own light lightness (51%) does not (3.57:1 on a removed word's wash), so by day it is mark-7's hue and chroma at the lightness that holds (45%), by night mark-7 itself.
  const target =
    "light-dark(oklch(from var(--color-mark-7) 45% c h), var(--color-mark-7))";
  if (keyword !== undefined && flat(keyword) !== target) {
    const clash = declsOf(themeRoot()).find(
      (d) =>
        d.prop.startsWith("--color-code-") &&
        d.prop !== "--color-code-keyword" &&
        d.value.trim() === "var(--color-mark-7)"
    );
    if (clash) {
      throw new Error(`${clash.prop} already holds var(--color-mark-7)`);
    }
    setValue("--color-code-keyword", target);
    say(`--color-code-keyword: ${flat(keyword)} -> ${target}`);
  }
}

// --shadow-code-ring: its coral is the control edge.
if (themeNames(themeText).has("--shadow-code-ring")) {
  const ring = valueFor("--shadow-code-ring") as string;
  say(`--shadow-code-ring is declared: ${ring}`);
} else {
  say(
    "--shadow-code-ring: not declared (deleted by theme-prune as unused), skipped"
  );
}

// The --type-* shorthands: a number line-height is the --leading token of that value.
{
  const root = themeRoot();
  const leadings = new Map<string, string[]>();
  for (const d of declsOf(root)) {
    if (d.prop.startsWith("--leading-") && /^[\d.]+$/u.test(d.value.trim())) {
      const key = String(Number(d.value));
      leadings.set(key, [...(leadings.get(key) ?? []), d.prop]);
    }
  }
  const LINE = /(\s\/\s)([\d.]+)(\s)/u;
  for (const d of declsOf(root)) {
    if (!d.prop.startsWith("--type-")) {
      continue;
    }
    const line = LINE.exec(d.value);
    if (!line) {
      continue;
    }
    const holders = leadings.get(String(Number(line[2]))) ?? [];
    if (holders.length !== 1) {
      throw new Error(
        `${d.prop}: line-height ${line[2]} has ${holders.length} --leading tokens (${holders.join(", ")})`
      );
    }
    const next = d.value.replace(LINE, `$1var(${holders[0]})$3`);
    say(`${d.prop}: ${flat(d.value)} -> ${flat(next)}`);
    d.value = next;
  }
  const caps = declsOf(root).find((d) => d.prop === "--type-caps");
  if (caps && /\s11px\s/u.test(caps.value)) {
    caps.value = caps.value.replace(/\s11px\s/u, " 0.75rem ");
    say("--type-caps: size 11px -> 0.75rem");
  }
  themeText = root.toString();
  for (const [name, value] of [
    ["--tracking-display", "-0.02em"],
    ["--tracking-caps", "0.05em"],
  ] as const) {
    const was = valueFor(name);
    if (was !== undefined && was !== value) {
      setValue(name, value);
      say(`${name}: ${was} -> ${value}`);
    }
  }
}

// ---- 3. colours nothing reads ----------------------------------------------

/** The names the code builds a colour from a variable: section.hue (core's CONFIG_SECTIONS) and DialChoice's colour (a component's TokenColor options: the bench's INK_NAMES). */
const builtValues = new Set<string>();
for (const m2 of read("packages/core/src/words/configure.ts").matchAll(
  /\bhue: "([\w-]+)"/gu
)) {
  builtValues.add(m2[1] as string);
}
{
  const fixture =
    texts.get("apps/dashboard/src/lib/cawco/graph/bench/props-fixture.ts") ??
    "";
  const list = /const INK_NAMES = \[([^\]]*)\]/u.exec(fixture)?.[1] ?? "";
  for (const m2 of list.matchAll(/"([\w-]+)"/gu)) {
    builtValues.add(m2[1] as string);
  }
}
say(`names built as --color-\${…}: ${[...builtValues].sort().join(", ")}`);

const LISTED = [
  "--color-coral-5",
  "--color-brand-hover",
  "--color-warning-3",
  "--color-warning-11",
  "--color-skeleton-sheen",
  "--color-tab-recede-1",
  "--color-tab-recede-2",
  "--color-tab-recede-3",
  "--color-crow-ink",
  "--color-c-target-tint",
  "--color-seam",
];
{
  const present = LISTED.filter((n) => themeNames(themeText).has(n));
  const { readsOf } = await classReads(texts);
  const classReaders = new Map<string, string[]>();
  for (const [candidate, keys] of readsOf) {
    for (const key of keys) {
      classReaders.set(key, [...(classReaders.get(key) ?? []), candidate]);
    }
  }
  const root = themeRoot();
  const refers = (name: string) =>
    declsOf(root)
      .filter(
        (d) =>
          d.prop !== name &&
          [...d.value.matchAll(READ)].some((r) => r[1] === name)
      )
      .map((d) => d.prop);
  /** A house rule, utility or keyframe of theme.css that reads it. */
  const readInRules = (name: string) => {
    let n = 0;
    root.walkDecls((d) => {
      if (
        !d.prop.startsWith("--") &&
        [...d.value.matchAll(READ)].some((r) => r[1] === name)
      ) {
        n += 1;
      }
    });
    return n;
  };
  const gone = new Set<string>();
  for (const name of present) {
    const reasons: string[] = [];
    for (const [path, text] of texts) {
      const named = [...text.matchAll(NAME)].filter(
        (n) => n[0] === name
      ).length;
      if (named > 0) {
        reasons.push(`${named} as --name in ${path}`);
      }
      const suffix = name.slice("--color-".length);
      const bareWord = new RegExp(
        `(?<=["'\`]|color\\.)${suffix}(?=["'\`])`,
        "u"
      );
      if (bareWord.test(text)) {
        reasons.push(
          `named bare in ${path} (a builder reads "${suffix}" as --color-${suffix})`
        );
      }
    }
    for (const c of classReaders.get(name) ?? []) {
      reasons.push(`class ${c}`);
    }
    for (const r of refers(name)) {
      reasons.push(`read by ${r}`);
    }
    if (readInRules(name) > 0) {
      reasons.push("read by a rule in theme.css");
    }
    if (builtValues.has(name.slice("--color-".length))) {
      reasons.push("a value a built name takes");
    }
    if (reasons.length === 0) {
      gone.add(name);
      say(`${name}: deleted, nothing uses it`);
    } else {
      say(`${name}: kept, ${reasons.slice(0, 4).join("; ")}`);
    }
  }
  if (gone.size > 0) {
    deleteDecls(gone);
  }
}

// ---- names the rename cannot reach ------------------------------------------

for (const edit of EDITS) {
  const path = edit.file;
  const text = texts.get(path) ?? read(path);
  if (text.includes(edit.find)) {
    const next = text.split(edit.find).join(edit.replace);
    texts.set(path, next);
    write(path, next);
    changed.add(path);
  }
}

// ---- the contrast check -----------------------------------------------------

{
  const label = "status-done-glyph on status-done-bg";
  let text = read(CONTRAST);
  if (!text.includes(`label: "${label}"`)) {
    const anchor =
      "  // Every breather at its floor, on every surface it stands on.\n";
    if (!text.includes(anchor)) {
      throw new Error(
        `${CONTRAST}: the breathers' comment is gone, no place for the pair`
      );
    }
    text = text.replace(
      anchor,
      `  {\n    label: "${label}",\n    fg: "status-done-glyph",\n    bg: ["status-done-bg"],\n    floor: UI,\n    source: S.glyphs,\n  },\n${anchor}`
    );
    write(CONTRAST, text);
    changed.add(CONTRAST);
    say(`${CONTRAST}: the pair "${label}" added at 3:1`);
  }
}

// ---- write, format, report --------------------------------------------------

if (themeText !== read(THEME)) {
  write(THEME, themeText);
  changed.add(THEME);
}

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
        `${prop}={${JSON.stringify(flat(value).trim())}}`
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
const danglingAfter = dangling();
console.log(
  `var() reads of a name nothing declares: ${danglingBefore.reads} reads of ${danglingBefore.names} names before, ${danglingAfter.reads} reads of ${danglingAfter.names} names after`
);
console.log(
  `theme variables: ${variablesBefore} before, ${themeNames(read(THEME)).size} after; ${files.length} files changed`
);

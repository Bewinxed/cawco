// biome-ignore-all lint/performance/useTopLevelRegex: a one-shot codemod helper, run by hand, never on a hot path.
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: one pass over the tree that reads every class, name and bare word a merge reaches; split by those three, it would carry the same state.
/**
 * Merging one theme token into another, shared by theme-unify.ts and
 * theme-audit.ts: every use of the left token becomes the right one, then the
 * left is deleted. A use is the name as `--name` (every scan root of
 * theme-prune.ts, and theme.css's own reads), a class Tailwind compiles to a
 * rule that reads the token (its suffix becomes the right token's:
 * `shadow-xl` is `shadow-overlay`), and the name written bare inside quotes
 * (a list of token names).
 *
 * Reuses tokens-to-theme.ts's whole-name rename (a custom property's name
 * whole, never part of a longer one); the class reading is
 * scripts/codemods/lib/tailwind-reads.ts.
 */
import postcss, {
  type ChildNode,
  type Container,
  type Declaration,
} from "postcss";
import { CANDIDATE, classReads, formsOf } from "./tailwind-reads";

/** A custom property's name, whole: not part of a longer one (tokens-to-theme.ts). */
export const NAME = /(?<![\w-])--[\w-]+/gu;

/** A value on one line, as the formatter may have wrapped it. */
export const flat = (value: string) =>
  value.replace(/\s+/gu, " ").replace(/\( /gu, "(").replace(/ \)/gu, ")");

export const declsOf = (root: postcss.Root) => {
  const out: Declaration[] = [];
  root.walkDecls((d) => {
    if (d.prop.startsWith("--")) {
      out.push(d);
    }
  });
  return out;
};
/** The value a name is first declared with. */
export const valueIn = (text: string, name: string) =>
  declsOf(postcss.parse(text)).find((d) => d.prop === name)?.value;
/** The variables of the `@theme` blocks, by name. */
export const themeNamesIn = (text: string) => {
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
/** The theme text without every declaration of the names (and the comments above each). */
export const deleteDeclsIn = (text: string, names: Set<string>) => {
  const root = postcss.parse(text);
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
  return root.toString();
};
/** The theme text with a declaration's value set everywhere it is declared (the base and any override). */
export const setValueIn = (text: string, name: string, value: string) => {
  const root = postcss.parse(text);
  for (const d of declsOf(root)) {
    if (d.prop === name) {
      d.value = value;
    }
  }
  return root.toString();
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

/** Left merged into right. `swap`: the right is deleted and the left takes its name. */
export interface Merge {
  /** Only when both are declared with one value. */
  ifEqual?: boolean;
  left: string;
  /** A colour whose name is also a string the code holds (a tool's ink id) is not renamed where it is written bare inside quotes. */
  noBare?: boolean;
  right: string;
  swap?: boolean;
}
export const m = (
  left: string,
  right: string,
  rest: Partial<Merge> = {}
): Merge => ({ left, right, ...rest });

/** The merges that still apply to the theme: a left already gone, or an `ifEqual` pair that differs, is said and dropped. */
export const planMerges = (
  themeText: string,
  all: Merge[],
  say: (line: string) => void
) => {
  const out: Merge[] = [];
  const root = postcss.parse(themeText);
  const declared = new Set(declsOf(root).map((d) => d.prop));
  for (const merge of all) {
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
    out.push(merge);
  }
  return out;
};

export interface MergeWorld {
  changed: Set<string>;
  say: (line: string) => void;
  texts: Map<string, string>;
  write: (path: string, text: string) => void;
}

/** Makes the merges over the sources in `world` and the theme text; returns the theme text. */
export const applyMerges = async (
  world: MergeWorld,
  themeIn: string,
  merges: Merge[]
) => {
  let themeText = themeIn;
  if (merges.length === 0) {
    return themeText;
  }
  const { texts, say, write, changed } = world;
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
    if (nsOf(x.left) === "color" && !x.noBare) {
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
  themeText = deleteDeclsIn(themeText, gone);
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
  return themeText;
};

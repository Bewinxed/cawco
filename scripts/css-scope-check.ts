/**
 * `bun run css-scope:check` (part of `bun run lint`): no component's styles
 * reach another component's elements. A rule in a `.svelte` file's `<style>`
 * whose selector is global all the way through (`:global(.picker)`,
 * `:global(.a .b)`, anything inside a `:global { … }` block) matches every
 * element on the page with that class, and a component's CSS, once loaded,
 * stays on the page for the rest of the visit. Config's PickerChip styled
 * `:global(.picker)`, and from the first visit to Config on, New session's
 * model panel (ModelSection's `.picker`) came out 32px tall, its rail
 * centred against the list, and pressed to --press-scale by any press inside
 * it (owner: "clicking the effort chip scales down the whole model/harness
 * selector").
 *
 * A selector passes when:
 *  - any part of it is the component's own (a class, id, element or
 *    attribute outside `:global(…)`, which Svelte scopes), or it is nested
 *    under a rule that passes: `.root :global(.x)` only reaches what sits
 *    inside the component's `.root`;
 *  - or it carries a name the component alone uses: a class, id or `data-`
 *    attribute in one of its compounds (`:global(…)` and `:has(…)`
 *    included, `:not`, `:is` and `:where` not) that no other file under
 *    apps/dashboard/src names at all. A portaled surface the component names
 *    through a child component's `class` prop (`:global(.session-card)`)
 *    passes so, and stops passing the day another file takes the name;
 *  - or it carries a name the component declares its own while another file
 *    uses it on purpose (it assigns the class, finds the element by it, or
 *    draws the component's recipe with it), anywhere in its `<style>`:
 *
 *      /* css-scope .session-details-popover: SessionDetails finds its card by it *\/
 *
 *  - or the comment directly above it says why it reaches further on
 *    purpose (a kit surface it tunes, a `body:has(…)` rule):
 *
 *      /* css-scope: tunes the kit popover only while it holds this list *\/
 *      :global(.kit-pop:has(> .x)) { … }
 *
 *    The comment covers that rule and what is nested in it.
 *
 * Every failure prints `file:line  selector`.
 *
 *   bun scripts/css-scope-check.ts [file…]   (no files: every .svelte under apps/)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SOURCES = ["apps/dashboard/src"];
/**
 * The Tailwind variants generated from the components' own attribute
 * selectors (`bun run variants`): it names every `data-` attribute a
 * component styles (`tone-fail:` is `[data-tone="fail"]`), yet styles no
 * element itself. A variant reaches only an element whose own markup writes
 * the attribute, and that file is counted.
 */
const NAMED_VARIANTS = "apps/dashboard/src/lib/tokens/variants.css";
const SKIP_DIRS = new Set(["node_modules", ".svelte-kit", "dist", "build"]);
const ALLOW = /^\/\*\s*css-scope:\s*\S/;
/** `/* css-scope .a .b: why *\/`: names this component owns though another file uses them. */
const DECLARE = /\/\*\s*css-scope\s+((?:[.#][\w-]+\s*)+):\s*\S/g;
const STYLE = /<style\b[^>]*>([\s\S]*?)<\/style>/g;
/** At-rules whose blocks hold rules (the selector context carries through). */
const GROUPING = /^@(?:media|supports|container|layer|scope|starting-style)\b/;
/** A simple selector Svelte scopes: a class, id, attribute, element or `*`. */
const OWN = /[.#[*]|^[a-zA-Z]|[\s>+~(][a-zA-Z]/;
const COMBINATOR = /[\s>+~]/;
const PSEUDO_CALL = /^::?[\w-]+\(/;
const PSEUDO = /^::?[\w-]+/;
/** Pseudo-classes whose arguments narrow nothing for certain. */
const LOOSE_CALL = /^:(?:not|is|where)\(/;
const NAME = /[.#](-?[_a-zA-Z][\w-]*)/g;
const DATA_ATTR = /\[(data-[\w-]+)/g;
const SPACES = /\s+/;
const SVELTE_FILE = /\.svelte$/;
/** Where a class or attribute name can be written: markup, scripts, styles. */
const SOURCE_FILE = /\.(?:svelte|ts|js|css|html)$/;
/** A name as CSS writes it: hyphens are part of the word. */
const WORD = /-?[_a-zA-Z][\w-]*/g;
/** Module specifiers: `from "…"`, `import "…"`, `import("…")`. */
const IMPORTED = /\b(?:from|import)\s*\(?\s*(["'])[^"'\n]*\1/g;

const walk = (dir: string, out: string[], keep: RegExp): void => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (SKIP_DIRS.has(name)) {
      continue;
    }
    if (statSync(path).isDirectory()) {
      walk(path, out, keep);
    } else if (keep.test(name)) {
      out.push(path);
    }
  }
};

/** Splits at top-level occurrences of `sep` (outside parentheses and brackets). */
function split(text: string, at: (ch: string) => boolean): string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "(" || ch === "[") {
      depth += 1;
    } else if (ch === ")" || ch === "]") {
      depth -= 1;
    } else if (depth === 0 && at(ch)) {
      parts.push(text.slice(from, i));
      from = i + 1;
    }
  }
  parts.push(text.slice(from));
  return parts.map((part) => part.trim()).filter(Boolean);
}

/** The index of the `)` that closes the `(` at `open`. */
function closing(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "(") {
      depth += 1;
    } else if (text[i] === ")") {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return text.length;
}

/** Removes every `:global(…)` group and every pseudo-class, arguments and all. */
function unglobal(compound: string): string {
  let out = "";
  for (let i = 0; i < compound.length; i += 1) {
    const rest = compound.slice(i);
    const call = PSEUDO_CALL.exec(rest);
    const plain = call ? null : PSEUDO.exec(rest);
    if (call) {
      // `:global(…)`, `:has(…)`, `:not(…)`, …: their arguments decide nothing here.
      i = closing(compound, i + call[0].length - 1);
    } else if (plain) {
      i += plain[0].length - 1;
    } else {
      out += compound[i];
    }
  }
  return out.replaceAll("&", "").trim();
}

/** Whether a complex selector names anything of the component's own. */
function owns(selector: string): boolean {
  return split(selector, (ch) => COMBINATOR.test(ch)).some((compound) =>
    OWN.test(unglobal(compound))
  );
}

/** Drops the argument lists of `:not`, `:is` and `:where`. */
function narrowing(selector: string): string {
  let out = "";
  for (let i = 0; i < selector.length; i += 1) {
    const open = LOOSE_CALL.exec(selector.slice(i));
    if (open) {
      i = closing(selector, i + open[0].length - 1);
    } else {
      out += selector[i];
    }
  }
  return out;
}

/** The classes, ids and `data-` attributes a selector requires of what it matches. */
export function names(selector: string): string[] {
  const kept = narrowing(selector);
  return [
    ...[...kept.matchAll(NAME)].map((m) => m[1] as string),
    ...[...kept.matchAll(DATA_ATTR)].map((m) => m[1] as string),
  ];
}

/** A block opening: its prelude, where it starts, and whether a comment allows it. */
interface Open {
  allowed: boolean;
  at: number;
  head: string;
}

/** Where the comment or string starting at `i` ends, or -1 when none starts there. */
function skipEnd(css: string, i: number): number {
  if (css.startsWith("/*", i)) {
    const end = css.indexOf("*/", i + 2);
    return end === -1 ? css.length : end + 2;
  }
  const ch = css[i];
  if (ch === '"' || ch === "'") {
    const end = css.indexOf(ch, i + 1);
    return end === -1 ? css.length : end + 1;
  }
  return -1;
}

/** The blocks of a stylesheet in order: an `Open` as each starts, `null` as each ends. */
function blocks(css: string): (Open | null)[] {
  const out: (Open | null)[] = [];
  let prelude = "";
  let at = 0;
  /** The last comment in the current prelude: an allow names its reason. */
  let comment = "";
  let i = 0;
  while (i < css.length) {
    const ch = css[i] as string;
    const stop = skipEnd(css, i);
    if (stop !== -1) {
      if (ch === "/") {
        comment = css.slice(i, stop);
      } else {
        prelude += css.slice(i, stop);
      }
      i = stop;
      continue;
    }
    if (ch === "{") {
      out.push({
        at,
        allowed: ALLOW.test(comment.trim()),
        head: prelude.trim(),
      });
    } else if (ch === "}") {
      out.push(null);
    } else if (ch !== ";") {
      if (!prelude.trim()) {
        at = i;
      }
      prelude += ch;
      i += 1;
      continue;
    }
    prelude = "";
    comment = "";
    i += 1;
  }
  return out;
}

interface Frame {
  /** Inside a bare `:global { … }` block: nothing in it is scoped. */
  global: boolean;
  /** Keyframes, font-face and the like: no selectors inside. */
  opaque: boolean;
  /** The rule this block belongs to reaches only the component's elements (or says why not). */
  safe: boolean;
}

/** The frame a block opens inside `top`, and the selectors in its prelude that reach too far. */
function enter(
  top: Frame,
  open: Open,
  own: (name: string) => boolean
): { bad: string[]; frame: Frame } {
  if (top.opaque) {
    return { frame: { ...top }, bad: [] };
  }
  if (open.head.startsWith("@")) {
    const opaque = !GROUPING.test(open.head);
    return { frame: { ...top, opaque }, bad: [] };
  }
  if (open.head === ":global") {
    const safe = top.safe || open.allowed;
    return { frame: { global: true, opaque: false, safe }, bad: [] };
  }
  const bad = split(open.head, (ch) => ch === ",").filter(
    (selector) =>
      !(
        open.allowed ||
        top.safe ||
        (!top.global && owns(selector)) ||
        names(selector).some(own)
      )
  );
  return {
    frame: { global: top.global, opaque: false, safe: bad.length === 0 },
    bad,
  };
}

export interface Hit {
  file: string;
  line: number;
  selector: string;
}

/**
 * Every unanchored global selector in one `.svelte` file's styles. `alone`
 * answers whether a name appears in no other file than this one.
 */
export function check(
  file: string,
  source: string,
  alone: (name: string) => boolean
): Hit[] {
  const hits: Hit[] = [];
  const declared = new Set(
    [...source.matchAll(DECLARE)].flatMap((m) =>
      (m[1] ?? "")
        .split(SPACES)
        .filter(Boolean)
        .map((name) => name.slice(1))
    )
  );
  const own = (name: string) => declared.has(name) || alone(name);
  for (const match of source.matchAll(STYLE)) {
    const css = match[1] ?? "";
    const start = (match.index ?? 0) + match[0].indexOf(">") + 1;
    const lines = source.slice(0, start).split("\n").length;
    const stack: Frame[] = [{ global: false, opaque: false, safe: false }];
    for (const open of blocks(css)) {
      if (!open) {
        stack.pop();
        continue;
      }
      const { frame, bad } = enter(stack.at(-1) as Frame, open, own);
      stack.push(frame);
      const line = lines + css.slice(0, open.at).split("\n").length - 1;
      for (const selector of bad) {
        hits.push({ file, line, selector });
      }
    }
  }
  return hits;
}

/** Every word in every dashboard source file: the files each name appears in. */
function wordIndex(): Map<string, Set<string>> {
  const files: string[] = [];
  for (const dir of SOURCES) {
    walk(join(ROOT, dir), files, SOURCE_FILE);
  }
  const index = new Map<string, Set<string>>();
  for (const file of files) {
    const at = relative(ROOT, file);
    if (at === NAMED_VARIANTS) {
      continue;
    }
    // A module's path names no element (`…/ui/thinking-steps/index.js`).
    const text = readFileSync(file, "utf8").replace(IMPORTED, "");
    for (const [word] of text.matchAll(WORD)) {
      let seen = index.get(word);
      if (!seen) {
        seen = new Set();
        index.set(word, seen);
      }
      seen.add(at);
    }
  }
  return index;
}

if (import.meta.main) {
  const named = process.argv.slice(2);
  const files =
    named.length > 0
      ? named.map((one) => join(process.cwd(), one))
      : SOURCES.flatMap((dir) => {
          const out: string[] = [];
          walk(join(ROOT, dir), out, SVELTE_FILE);
          return out;
        });
  const index = wordIndex();
  const hits = files
    .filter((file) => file.endsWith(".svelte"))
    .flatMap((file) => {
      const at = relative(ROOT, file);
      const alone = (name: string) =>
        [...(index.get(name) ?? [])].every((one) => one === at);
      return check(at, readFileSync(file, "utf8"), alone);
    });
  if (hits.length > 0) {
    for (const hit of hits) {
      console.error(`${hit.file}:${hit.line}  ${hit.selector}`);
    }
    console.error(
      `css-scope:check: ${hits.length} selector(s) global all the way through, which reach every element with that class once the component's CSS has loaded. Anchor each under the component's own scoped root (\`.root :global(.x)\`), or give the element a class no other file uses; where another file uses the name on purpose, declare it in the style block (\`/* css-scope .name: why */\`), or explain one rule with \`/* css-scope: why */\` directly above it (scripts/css-scope-check.ts).`
    );
    process.exit(1);
  }
  console.log(
    `css-scope:check: ${files.length} file(s), every global selector anchored or explained`
  );
}

/**
 * `bun .cutover/invalidation-sweep.ts <css file or folder>…`: what a state
 * coming or going on an element makes Chrome restyle under it, for every
 * rule of a built stylesheet, read as Blink's rule_invalidation_data_visitor
 * derives its invalidation sets: one feature per compound (an id over a
 * class over an attribute over a tag; a feature inside `:is()`/`:where()`
 * only where the compound has none), an attribute kept by its name alone,
 * and a subject with no feature (a universal) a whole subtree. Every
 * changing state in a compound left of the subject (an attribute other than
 * a written-once hook, or a pseudo-class whose truth changes) is listed
 * where its set gains `data-slot` (every element carrying any) or the whole
 * subtree; a complex selector inside the subject's `:is()`/`:where()`/
 * `:not()` (Tailwind's group and peer variants) is read as its own.
 *
 * Integration 2's step 9 reads it on main's build and this tree's, before
 * and after: a hook in descendant position under a changing state, and a
 * rule whose state is an ancestor's of a universal, are the two ways a
 * state restyles more here than at main.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dir, "..");
const appRequire = createRequire(join(root, "apps/dashboard/package.json"));
// Vite's own Lightning CSS: the dashboard's minifier.
const viteRequire = createRequire(appRequire.resolve("vite"));
const { transform } = await import(
  pathToFileURL(viteRequire.resolve("lightningcss")).href
);

interface Part {
  kind?: string;
  name?: string;
  operation?: { operator?: string; value?: string };
  selectors?: Part[][];
  type: string;
  value?: string;
}
interface Feature {
  kind: "id" | "class" | "attribute" | "tag";
  name: string;
}
interface Hit {
  gains: string;
  key: string;
  selector: string;
}

const RANK = { id: 4, class: 3, attribute: 2, tag: 1 } as const;
const FEATURE_OF: Record<string, Feature["kind"]> = {
  id: "id",
  class: "class",
  attribute: "attribute",
  type: "tag",
};
/** Pseudo-classes whose truth changes while the element stands. */
const STATE_PSEUDO = new Set([
  "hover",
  "active",
  "focus",
  "focus-visible",
  "focus-within",
  "checked",
  "has",
  "disabled",
  "enabled",
  "open",
  "popover-open",
  "placeholder-shown",
  "target",
  "indeterminate",
  "default",
  "user-invalid",
  "invalid",
  "valid",
  "empty",
  "first-child",
  "last-child",
  "only-child",
  "nth-child",
  "nth-last-child",
  "autofill",
  "read-only",
  "read-write",
]);
/** Attributes a component writes once, as hooks, never as state. */
const STATIC_ATTRIBUTES = new Set(["data-slot", "class", "id", "role"]);
const LISTS = new Set(["is", "where", "not"]);
const COMBINATOR: Record<string, string> = {
  descendant: " ",
  child: " > ",
  "next-sibling": " + ",
  "later-sibling": " ~ ",
};

function compoundsOf(selector: Part[]): Part[][] {
  const out: Part[][] = [[]];
  for (const part of selector) {
    if (part.type === "combinator") {
      out.push([]);
    } else {
      out.at(-1)?.push(part);
    }
  }
  return out;
}

/** The one feature Blink keeps for a compound (its NarrowTo*), or null for none. */
function narrow(compound: Part[]): Feature | null {
  let kept: Feature | null = null;
  for (const part of compound) {
    const kind = FEATURE_OF[part.type];
    if (kind && (!kept || RANK[kind] > RANK[kept.kind])) {
      kept = { kind, name: String(part.name) };
    }
  }
  if (kept) {
    return kept;
  }
  // `:is()`/`:where()`: their features replace only an empty set.
  for (const part of compound) {
    if (
      part.type === "pseudo-class" &&
      (part.kind === "is" || part.kind === "where")
    ) {
      const each = (part.selectors ?? []).map((s) =>
        narrow(compoundsOf(s).at(-1) ?? [])
      );
      if (each.length > 0 && each.every(Boolean)) {
        return each[0];
      }
    }
  }
  return null;
}

/** The changing states a compound carries, and those inside its `:is()`/`:where()`/`:not()`. */
function stateKeys(compound: Part[]): string[] {
  return compound.flatMap((part) => {
    if (part.type === "attribute") {
      return STATIC_ATTRIBUTES.has(String(part.name)) ? [] : [`[${part.name}]`];
    }
    if (part.type !== "pseudo-class") {
      return [];
    }
    const kind = String(part.kind);
    const own = STATE_PSEUDO.has(kind) ? [`:${kind}`] : [];
    const inner = LISTS.has(kind)
      ? (part.selectors ?? []).flatMap((s) => compoundsOf(s).flatMap(stateKeys))
      : [];
    return [...own, ...inner];
  });
}

function attributeText(part: Part): string {
  const op = part.operation;
  if (!op) {
    return `[${part.name}]`;
  }
  const sign = op.operator === "equal" ? "=" : `(${op.operator})=`;
  return `[${part.name}${sign}"${op.value}"]`;
}

/** A selector as CSS text, for reading. */
function text(selector: Part[]): string {
  return selector
    .map((part) => {
      switch (part.type) {
        case "combinator":
          return COMBINATOR[String(part.value)] ?? ` ${part.value} `;
        case "class":
          return `.${part.name}`;
        case "id":
          return `#${part.name}`;
        case "type":
          return String(part.name);
        case "universal":
          return "*";
        case "nesting":
          return "&";
        case "attribute":
          return attributeText(part);
        case "pseudo-class":
          return part.selectors
            ? `:${part.kind}(${part.selectors.map(text).join(", ")})`
            : `:${part.kind}`;
        case "pseudo-element":
          return `::${part.kind}`;
        default:
          return `<${part.type}>`;
      }
    })
    .join("");
}

/** One complex selector: what each changing state left of its subject adds to its set. */
function visit(selector: Part[], whole: string, hits: Hit[]): void {
  const compounds = compoundsOf(selector);
  const subject = compounds.at(-1) ?? [];
  const feature = narrow(subject);
  const broad =
    !feature || (feature.kind === "attribute" && feature.name === "data-slot");
  if (broad) {
    const gains = feature ? "data-slot" : "whole subtree";
    for (const key of compounds.slice(0, -1).flatMap(stateKeys)) {
      hits.push({ key, gains, selector: whole });
    }
  }
  for (const part of subject) {
    if (part.type === "pseudo-class" && LISTS.has(String(part.kind))) {
      for (const inner of part.selectors ?? []) {
        if (compoundsOf(inner).length > 1) {
          visit(inner, whole, hits);
        }
      }
    }
  }
}

const files = process.argv.slice(2).flatMap((path) =>
  statSync(path).isDirectory()
    ? readdirSync(path)
        .filter((f) => f.endsWith(".css"))
        .map((f) => join(path, f))
    : [path]
);
const listed: Hit[] = [];
for (const file of files) {
  transform({
    filename: file,
    code: Buffer.from(readFileSync(file, "utf8")),
    errorRecovery: true,
    visitor: {
      Rule: {
        style(rule: { value: { selectors: Part[][] } }) {
          for (const selector of rule.value.selectors) {
            visit(selector, text(selector), listed);
          }
        },
      },
    },
  });
}
for (const hit of listed) {
  console.log(`${hit.gains.padEnd(13)} ${hit.key.padEnd(24)} ${hit.selector}`);
}
const subtrees = listed.filter((hit) => hit.gains === "whole subtree");
const slots = listed.filter((hit) => hit.gains === "data-slot");
console.log(
  `${files.length} sheets: ${slots.length} rules restyle every data-slot under a changing state (${new Set(slots.map((h) => h.key)).size} states); ${subtrees.length} restyle a whole subtree (${new Set(subtrees.map((h) => h.key)).size} states)`
);

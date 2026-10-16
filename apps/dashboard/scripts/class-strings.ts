/**
 * The dashboard's class strings, read with Svelte's own parser, never by
 * searching text: a markup attribute whose name is `class` or ends in
 * `Class`, a `class:` directive, the strings a cn(), tv() or clsx() call
 * holds, and any other string that reads as a class list (a constant, a
 * lookup table). A `.ts` module is read as a component's script, so both
 * kinds of file give one tree. `<style>` blocks, comments and identifiers
 * are never read. scripts/vocab-codemod.ts rewrites what this reads;
 * scripts/spacing-ratchet.ts counts it.
 */
import { join, relative } from "node:path";
import { Glob } from "bun";
import { parse } from "svelte/compiler";

/** apps/dashboard, whatever directory a script is run from. */
export const DASHBOARD = join(import.meta.dir, "..");
const SOURCES = new Glob("src/**/*.{svelte,ts}");
/** Off limits to the class-string scripts (the landing's frozen route). */
const SKIP = /states\/caw-design\//;

const SPACES = /\s+/g;
const WORD = /\S+/g;
const UTILITY_WORD = /[a-z0-9]-[a-z0-9]|:/;
const PROSE_WORD = /['’"]|[a-z][.,;!?]$/i;

/**
 * A spacing or sizing utility on Tailwind's numeric step (`p-2`, `-mt-0.5`,
 * `size-4`): the minus, the utility, the step. A zero, a fraction or a
 * keyword (`m-0`, `w-1/2`, `w-full`) is not one.
 */
export const SPACING_UTILITY =
  /^(-?)(p|px|py|ps|pe|pt|pb|pl|pr|m|mx|my|ms|me|mt|mb|ml|mr|gap|gap-x|gap-y|w|h|size|min-w|min-h|max-w|max-h|inset|inset-x|inset-y|top|right|bottom|left|start|end|space-x|space-y|translate-x|translate-y|scroll-mx?|scroll-m[ysetblr]|scroll-px?|scroll-p[ysetblr])-(\d+(?:\.\d+)?)$/;

// MARK: - A class

export interface Parsed {
  base: string;
  important: string;
  variants: string[];
}

/** A class's variants (split at top-level colons) and its utility. */
export function parseClass(raw: string): Parsed {
  const variants: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === "[" || ch === "(") {
      depth += 1;
    } else if (ch === "]" || ch === ")") {
      depth -= 1;
    } else if (ch === ":" && depth === 0) {
      variants.push(raw.slice(from, i));
      from = i + 1;
    }
  }
  const utility = raw.slice(from);
  if (utility.endsWith("!")) {
    return { base: utility.slice(0, -1), important: "!", variants };
  }
  if (utility.startsWith("!")) {
    return { base: utility.slice(1), important: "!", variants };
  }
  return { base: utility, important: "", variants };
}

export const format = (
  variants: string[],
  base: string,
  important: string
): string => `${variants.map((v) => `${v}:`).join("")}${base}${important}`;

// MARK: - Class strings in a file

export interface Piece {
  /** May be absent while the context's other pieces stand (a ternary's branch, a `&&`'s right, a clsx key). */
  conditional: boolean;
  /** Every class string of one attribute (with its element's `class:` directives), one class call, or one loose string. */
  context: number;
  /** A `class:` directive: an edit rewrites the whole directive. */
  directive?: { end: number; expression: string; start: number };
  end: number;
  /** A string no class attribute or class call holds. */
  loose: boolean;
  start: number;
}

type Node = { end: number; start: number; type: string } & Record<
  string,
  unknown
>;

/** How a string under an expression counts: the context it joins (none: its own), whether it may be absent, whether object keys are classes. */
interface Walk {
  conditional: boolean;
  context: number | undefined;
  keysAreClasses: boolean;
}
const LOOSE: Walk = {
  conditional: false,
  context: undefined,
  keysAreClasses: false,
};

/** Svelte's own template nodes; any other node in the markup tree is a script expression. */
const TEMPLATE = new Set([
  "Fragment",
  "Text",
  "Comment",
  "ExpressionTag",
  "HtmlTag",
  "ConstTag",
  "DebugTag",
  "RenderTag",
  "AttachTag",
  "IfBlock",
  "EachBlock",
  "AwaitBlock",
  "KeyBlock",
  "SnippetBlock",
  "RegularElement",
  "Component",
  "SvelteElement",
  "SvelteComponent",
  "SvelteSelf",
  "SvelteFragment",
  "SvelteBoundary",
  "SvelteHead",
  "SvelteBody",
  "SvelteWindow",
  "SvelteDocument",
  "SvelteOptions",
  "SlotElement",
  "TitleElement",
]);
const SKIPPED_KEYS = new Set(["attributes", "metadata", "parent"]);
/** Calls whose strings are classes; tv's object keys are variant names, the others' are classes. */
const CLASS_CALLS = new Set(["cn", "clsx", "twMerge", "twJoin", "tv"]);
const CLASS_ATTRIBUTE = /^class$|Class(es|Name)?$/;

const isNode = (value: unknown): value is Node =>
  Boolean(value) &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  typeof (value as Node).type === "string";

/** Reads the class strings out of one component's tree. */
class ClassStrings {
  readonly pieces: Piece[] = [];
  readonly #source: string;
  #next = 0;

  constructor(source: string) {
    this.#source = source;
  }

  /** A context of its own. */
  #fresh(): number {
    const id = this.#next;
    this.#next += 1;
    return id;
  }

  #string(node: Node, walk: Walk): void {
    const context = walk.context ?? this.#fresh();
    const loose = walk.context === undefined;
    if (node.type === "Literal" && typeof node.value === "string") {
      this.pieces.push({
        conditional: walk.conditional,
        context,
        end: node.end - 1,
        loose,
        start: node.start + 1,
      });
    } else if (node.type === "TemplateElement") {
      this.pieces.push({
        conditional: walk.conditional,
        context,
        end: node.end,
        loose,
        start: node.start,
      });
    }
  }

  /** Every string under an expression. */
  expression(node: unknown, walk: Walk): void {
    if (Array.isArray(node)) {
      for (const child of node) {
        this.expression(child, walk);
      }
      return;
    }
    if (!isNode(node)) {
      return;
    }
    switch (node.type) {
      case "Literal":
      case "TemplateElement":
        this.#string(node, walk);
        return;
      case "ConditionalExpression":
        this.expression(node.test, LOOSE);
        this.expression(node.consequent, { ...walk, conditional: true });
        this.expression(node.alternate, { ...walk, conditional: true });
        return;
      case "LogicalExpression":
        this.expression(node.left, walk);
        this.expression(node.right, { ...walk, conditional: true });
        return;
      case "CallExpression":
        this.#call(node, walk);
        return;
      case "Property":
        if (walk.keysAreClasses) {
          // A clsx object's key is a class, present while its value is truthy.
          this.expression(node.key, { ...walk, conditional: true });
        }
        this.expression(node.value, walk);
        return;
      default:
        for (const [key, value] of Object.entries(node)) {
          if (!SKIPPED_KEYS.has(key) && value && typeof value === "object") {
            this.expression(value, walk);
          }
        }
    }
  }

  /** A class call gathers its arguments into one context; any other call's strings are loose. */
  #call(node: Node, walk: Walk): void {
    const callee = node.callee as Node;
    const name = callee.type === "Identifier" ? (callee.name as string) : "";
    if (!CLASS_CALLS.has(name)) {
      this.expression(node.callee, LOOSE);
      this.expression(node.arguments, LOOSE);
      return;
    }
    this.expression(node.arguments, {
      conditional: walk.conditional,
      context: walk.context ?? this.#fresh(),
      keysAreClasses: name !== "tv",
    });
  }

  /** One element's class attributes and `class:` directives; its other attributes' strings are loose. */
  #attributes(attributes: Node[]): void {
    const contexts = new Map<string, number>();
    const contextOf = (name: string) => {
      const known = contexts.get(name);
      if (known !== undefined) {
        return known;
      }
      const id = this.#fresh();
      contexts.set(name, id);
      return id;
    };
    for (const attr of attributes) {
      if (
        attr.type === "Attribute" &&
        CLASS_ATTRIBUTE.test(attr.name as string)
      ) {
        this.#classAttribute(attr, contextOf(attr.name as string));
      } else if (attr.type === "ClassDirective") {
        this.#directive(attr, contextOf("class"));
      } else {
        this.expression(attr, LOOSE);
      }
    }
  }

  #classAttribute(attr: Node, context: number): void {
    const values =
      attr.value === true ? [] : ([] as Node[]).concat(attr.value as Node);
    for (const value of values) {
      if (value.type === "Text") {
        this.pieces.push({
          conditional: false,
          context,
          end: value.end,
          loose: false,
          start: value.start,
        });
      } else if (value.type === "ExpressionTag") {
        this.expression(value.expression, {
          conditional: false,
          context,
          keysAreClasses: true,
        });
      }
    }
  }

  #directive(attr: Node, context: number): void {
    const start = attr.start + "class:".length;
    const expression = attr.expression as Node;
    this.pieces.push({
      conditional: true,
      context,
      directive: {
        end: attr.end,
        expression: this.#source.slice(expression.start, expression.end),
        start: attr.start,
      },
      end: start + (attr.name as string).length,
      loose: false,
      start,
    });
  }

  /** Every class string under a markup node. */
  fragment(node: unknown): void {
    if (Array.isArray(node)) {
      for (const child of node) {
        this.fragment(child);
      }
      return;
    }
    if (!isNode(node)) {
      return;
    }
    if (Array.isArray(node.attributes)) {
      this.#attributes(node.attributes as Node[]);
    }
    for (const [key, value] of Object.entries(node)) {
      if (SKIPPED_KEYS.has(key) || !value || typeof value !== "object") {
        continue;
      }
      if (isNode(value) && !TEMPLATE.has(value.type)) {
        // A script expression in the markup ({…}, a block's test, a tag's).
        this.expression(value, LOOSE);
      } else {
        this.fragment(value);
      }
    }
  }
}

/** One component's tree's class strings. */
function pieces(source: string): Piece[] {
  const ast = parse(source, { modern: true });
  const reader = new ClassStrings(source);
  reader.fragment(ast.fragment);
  for (const script of [ast.instance, ast.module]) {
    if (script) {
      reader.expression(script.content, LOOSE);
    }
  }
  return reader.pieces;
}

/**
 * A component's or a module's class strings, at their offsets in `source`.
 * A `.ts` module is read as a component's script, so both give one tree.
 */
function classPieces(path: string, source: string): Piece[] {
  if (path.endsWith(".svelte")) {
    return pieces(source);
  }
  const open = '<script lang="ts">\n';
  // A `</script` inside the module (a comment showing markup) would end the
  // script: the same number of characters, ending nothing, keeps every offset.
  const text = `${open}${source.replaceAll("</script", "<!script")}\n</script>`;
  return pieces(text).map((p) => ({
    ...p,
    end: p.end - open.length,
    start: p.start - open.length,
  }));
}

/**
 * Whether a loose string reads as classes: some word is a utility's (a
 * hyphen inside it or a variant's colon) and none is prose (an apostrophe,
 * a sentence's punctuation). An event name ("blur") or a message ("the
 * card's shadow did not draw") is not.
 */
const classList = (text: string): boolean => {
  const words = text.split(SPACES).filter(Boolean);
  return (
    words.some((w) => UTILITY_WORD.test(w)) &&
    !words.some((w) => PROSE_WORD.test(w))
  );
};

// MARK: - The classes of a file

export interface ClassToken {
  end: number;
  parsed: Parsed;
  piece: Piece;
  raw: string;
  start: number;
}

/** One file's classes, read out of its class strings (a loose string only when it reads as classes). */
export function classTokens(path: string, source: string): ClassToken[] {
  const tokens: ClassToken[] = [];
  for (const piece of classPieces(path, source)) {
    const text = source.slice(piece.start, piece.end);
    if (piece.loose && !classList(text)) {
      continue;
    }
    for (const m of text.matchAll(WORD)) {
      const start = piece.start + (m.index ?? 0);
      tokens.push({
        end: start + m[0].length,
        parsed: parseClass(m[0]),
        piece,
        raw: m[0],
        start,
      });
    }
  }
  return tokens;
}

/** Every component and module the class-string scripts read, by its path in apps/dashboard, with its source. */
export async function dashboardSources(): Promise<
  { path: string; source: string }[]
> {
  const absolute = await Array.fromAsync(
    SOURCES.scan({ absolute: true, cwd: DASHBOARD })
  );
  const paths = absolute
    .map((path) => relative(DASHBOARD, path))
    .filter((path) => !SKIP.test(path))
    .sort();
  const sources = await Promise.all(
    paths.map((path) => Bun.file(join(DASHBOARD, path)).text())
  );
  return paths.map((path, i) => ({ path, source: sources[i] }));
}

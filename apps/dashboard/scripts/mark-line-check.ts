/**
 * `bun run mark-line:check` (part of `bun run lint`): every row that sets
 * words beside a mark is a mark line (app.css, DESIGN.md The Mark Line
 * Rule), its words are elements, and its boxes say so. A mark is an icon, a
 * glyph, an avatar, a status dot or a keycap. Centring a mark beside a line
 * box puts it on the line box's middle, which is not the words' middle
 * (Figtree's ascent and descent sit unevenly about its x-height, and Blink
 * floors the half-leading: 0.3px off in Blink, 1.25px in WebKit and Gecko
 * at 13px). The mark line trims each run of words to its x-height band so
 * the centring lands on the words' middle, and that reaches only an
 * element: bare text beside a mark is an anonymous box no property reaches.
 *
 * For each element or component in a `.svelte` file whose children (through
 * `{#if}`, `{#each}` and `{#key}`) hold a mark and words:
 *  - the words are not bare text or a `{value}` beside the mark: wrap them;
 *  - the row is a mark line: it carries one of the recipe's classes
 *    (`mark-line`, `rail-line`), or a kit recipe whose base draws it
 *    (`chipVariants`, `menuItemVariants`, `sectionHeadVariants`), or it is a
 *    kit primitive that draws the recipe in its own class (PRIMITIVES), or a
 *    kit part given a look that draws it (LOOKS).
 * And on every mark line, each child is one the recipe can tell: words (an
 * element holding text, which it trims), what it leaves alone (an svg, an
 * img, an icon component, the kit's cells, and a control or cell holding
 * nothing else, such as an icon-only button), or a box that says so with
 * `data-box` (a mark's tile, a chevron's cell, a pill). A component that is
 * none of these takes `data-box` (it passes it to its root) or stands in a
 * `<span data-box>`. An unmarked box would take the words' padding and grow.
 *
 * Words the recipe trims never scroll: a run on a mark line (or marked
 * `.mark-text`) that truncates clips with `overflow: clip`, not `hidden`,
 * `auto` or Tailwind's `truncate`, because Gecko does not trim a scroll
 * container and the run would take the recipe's padding on top of its line.
 *
 * A mark component (`…Mark`, `…Face`, `…Dot`) says `data-box` on its own
 * root, or draws an svg. A kit box (BOXES: the badge) holds its words in an
 * element whether or not a mark stands beside them.
 *
 * A mark that is not beside the words (stacked above them, or the row is
 * not centred on one cross axis) is said in a comment directly above it:
 *
 *     <!-- mark-line: the glyph stands above the title -->
 *
 * Every failure prints `file:line  <tag>  what`.
 *
 *   bun apps/dashboard/scripts/mark-line-check.ts [file…]   (no files: every .svelte under src/)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "svelte/compiler";

const ROOT = join(import.meta.dir, "..");
const SOURCE = join(ROOT, "src");
const SKIP_DIRS = new Set(["node_modules", ".svelte-kit", "dist", "build"]);
const SVELTE_FILE = /\.svelte$/;
const ALLOW = /^\s*mark-line:\s*\S/;
const SPLIT = /[^\w-]+/;
const CLASS_PREFIX = /^class=/;
/** The recipe's utilities (app.css, the mark line). */
const RECIPE = /(?:^|[\s"'`{[,])(?:mark-line|rail-line)(?=$|[\s"'`},\]])/;
/** Kit recipes whose base draws the mark line (ui/chip, ui/menu-item, ui/section-header). */
const RECIPE_CALL = /\b(?:chipVariants|menuItemVariants|sectionHeadVariants)\(/;
/**
 * Kit parts that draw the mark line for some of their looks: the prop and
 * the values that do (`true`: any value).
 */
const LOOKS: Record<string, Record<string, readonly string[] | true>> = {
  "Collapsible.Trigger": { look: ["head", "note", "fold"] },
  "Dialog.Title": { lead: ["glyph"] },
  "DropdownMenu.Trigger": {
    face: ["title", "count"],
    size: true,
    variant: true,
  },
  "Popover.Trigger": { look: ["chip", "state", "meter"] },
};
/** Kit primitives whose own class draws the recipe. */
const PRIMITIVES = new Set([
  "Badge",
  "Button",
  "Command.Item",
  "ContextMenu.CheckboxItem",
  "ContextMenu.Item",
  "ContextMenu.RadioItem",
  "ContextMenu.SubTrigger",
  "DropdownMenu.CheckboxItem",
  "DropdownMenu.Item",
  "DropdownMenu.RadioItem",
  "DropdownMenu.SubTrigger",
  "Select.Item",
  "Sidebar.MenuButton",
  "Sidebar.MenuSubButton",
  "Toggle",
  "ToggleGroup.Item",
]);
/** A declaration that makes a scroll container, which Gecko does not trim. */
const SCROLLS =
  /(?:^|[;{\s])overflow(?:-x|-y|-inline|-block)?\s*:\s*(?:hidden|auto|scroll)\b/;
/** Tailwind utilities that make one. */
const SCROLL_TOKEN = /^(?:truncate|overflow(?:-[xy])?-(?:hidden|auto|scroll))$/;
const STYLE = /<style\b[^>]*>([\s\S]*?)<\/style>/;
const RULE = /([^{}]*)\{([^{}]*)\}/g;
/**
 * Kit boxes whose words are always an element, mark or none: the box
 * centres its words' x-height only when the recipe can reach them.
 */
const BOXES = new Set(["Badge"]);
/** Components that draw a mark: icons, glyphs, avatars, rings, dots. */
const MARK_COMPONENT =
  /^(?:Icon[A-Z]\w*|LiveIcon|Spinner|Sprite|TaskRing|ProviderLogo|Glyph|action\.icon|\w*(?:Mark|Face|Glyph|Avatar|Dot))$/;
/** Elements the kit and its rows use as a mark's cell. A button's icon slot
    is an `.icon-swap`; a keycap is a Kbd that says `data-box`. */
const MARK_CLASS = /^(?:rail-cell|icon-swap|mark-cell|dot|mark|glyph|icon|ic)$/;
/** What the recipe leaves alone by class (app.css). */
const LEFT_ALONE_CLASS = /^(?:rail-cell|icon-swap|mark-cell)$/;
/** Components whose root is an svg, which the recipe leaves alone. */
const SVG_COMPONENT =
  /^(?:Icon[A-Z]\w*|LiveIcon|Spinner|TaskRing|ProviderLogo|Glyph|Check|action\.icon)$/;
/** Components that say data-box on their own root (a mark line of their own). */
const BOX_COMPONENT = /^(?:AccountName)$/;
/** Components that draw only the child they are given. */
const WRAPPER_COMPONENT =
  /^(?:Tip|Tooltip\.Root|Tooltip\.Trigger|Popover\.Root|Popover\.Trigger)$/;
/** Kit controls whose root holds the children they are given (ui/button with no icon or label, ui/toggle). */
const CHILDREN_AT_ROOT = new Set(["Button", "Toggle"]);
/** Components that draw words, which the recipe trims. */
const WORDS_COMPONENT =
  /^(?:MorphText|JumpMatch|PendingContent|DropdownMenu\.Shortcut|ContextMenu\.Shortcut)$/;

interface Node {
  alternate?: { nodes: Node[] } | null;
  attributes?: Node[];
  body?: { nodes: Node[] };
  consequent?: { nodes: Node[] };
  data?: string;
  end: number;
  fragment?: { nodes: Node[] };
  name?: string;
  start: number;
  type: string;
  [key: string]: unknown;
}

export interface Hit {
  file: string;
  line: number;
  tag: string;
  what: string;
}

const walkFiles = (dir: string, out: string[]): void => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (SKIP_DIRS.has(name)) {
      continue;
    }
    if (statSync(path).isDirectory()) {
      walkFiles(path, out);
    } else if (SVELTE_FILE.test(name)) {
      out.push(path);
    }
  }
};

/** The node's children as the DOM will hold them: blocks flattened. */
function children(nodes: Node[] | undefined): Node[] {
  const out: Node[] = [];
  for (const node of nodes ?? []) {
    if (node.type === "IfBlock") {
      out.push(
        ...children(node.consequent?.nodes),
        ...children(node.alternate?.nodes)
      );
    } else if (node.type === "EachBlock" || node.type === "KeyBlock") {
      out.push(...children(node.body?.nodes));
    } else {
      out.push(node);
    }
  }
  return out;
}

/** The most child lists `rendered` reads of one node. */
const RENDERED_MAX = 64;

/**
 * Each list of children the DOM can hold at once: an `{#if}` is its
 * consequent or its alternate, never both (as `children` flattens them).
 */
function rendered(nodes: Node[] | undefined): Node[][] {
  let out: Node[][] = [[]];
  for (const node of nodes ?? []) {
    let options: Node[][];
    if (node.type === "IfBlock") {
      options = [
        ...rendered(node.consequent?.nodes),
        ...rendered(node.alternate?.nodes),
      ];
    } else if (node.type === "EachBlock" || node.type === "KeyBlock") {
      options = rendered(node.body?.nodes);
    } else {
      options = [[node]];
    }
    out = out
      .flatMap((before) => options.map((option) => [...before, ...option]))
      .slice(0, RENDERED_MAX);
  }
  return out;
}

const isElement = (node: Node): boolean =>
  node.type === "RegularElement" || node.type === "SvelteElement";
const isBare = (node: Node): boolean =>
  (node.type === "Text" && Boolean(node.data?.trim())) ||
  node.type === "ExpressionTag";
const visible = (node: Node): boolean =>
  !(node.type === "Text" && !node.data?.trim()) && node.type !== "Comment";
const hasAttribute = (node: Node, name: string): boolean =>
  (node.attributes ?? []).some(
    (a) => a.type === "Attribute" && a.name === name
  );

function classText(node: Node, source: string): string {
  return (node.attributes ?? [])
    .filter(
      (a) =>
        (a.type === "Attribute" && a.name === "class") ||
        a.type === "ClassDirective"
    )
    .map((a) =>
      a.type === "ClassDirective"
        ? ` ${a.name} `
        : source.slice(a.start, a.end).replace(CLASS_PREFIX, "")
    )
    .join(" ");
}

function classes(node: Node, source: string): string[] {
  return classText(node, source).split(SPLIT).filter(Boolean);
}

function isMark(node: Node, source: string): boolean {
  if (node.type === "Component") {
    return MARK_COMPONENT.test(node.name ?? "");
  }
  if (!isElement(node)) {
    return false;
  }
  if (node.name === "svg" || node.name === "img") {
    return true;
  }
  if (classes(node, source).some((c) => MARK_CLASS.test(c))) {
    return true;
  }
  // A cell that holds nothing but a mark is that mark.
  const inside = children(node.fragment?.nodes).filter(visible);
  return inside.length > 0 && inside.every((n) => isMark(n, source));
}

function isWords(node: Node, source: string): boolean {
  if (isBare(node)) {
    return true;
  }
  if (node.type === "Component") {
    return WORDS_COMPONENT.test(node.name ?? "");
  }
  return (
    isElement(node) &&
    !isMark(node, source) &&
    // Words a screen reader alone hears stand beside nothing.
    !classes(node, source).includes("sr-only") &&
    children(node.fragment?.nodes).some(holdsWords)
  );
}

/** A direct child that is words: bare text or a component that draws words. */
const holdsWords = (node: Node): boolean =>
  isBare(node) ||
  (node.type === "Component" && WORDS_COMPONENT.test(node.name ?? ""));

/** Whether the recipe leaves a node alone as it stands (app.css): an svg, an img, the kit's cells, a box that says so, a component drawing one. */
function leftAlone(node: Node, source: string, icons: Set<string>): boolean {
  if (hasAttribute(node, "data-box")) {
    return true;
  }
  if (node.type === "Component") {
    const name = node.name ?? "";
    return (
      icons.has(name) ||
      SVG_COMPONENT.test(name) ||
      MARK_COMPONENT.test(name) ||
      BOX_COMPONENT.test(name)
    );
  }
  return (
    isElement(node) &&
    (node.name === "svg" ||
      node.name === "img" ||
      classes(node, source).some((c) => LEFT_ALONE_CLASS.test(c)))
  );
}

/**
 * A control or cell with no words of its own (app.css): every child it
 * holds is one the recipe leaves alone, so it is centred as a box. A kit
 * button given an icon and no label holds only its icon slot.
 */
function holdsOnlyMarks(
  node: Node,
  source: string,
  icons: Set<string>
): boolean {
  const inside = children(node.fragment?.nodes).filter(visible);
  if (node.type === "Component") {
    if (node.name === "Button" && hasAttribute(node, "icon")) {
      return inside.length === 0 && !hasAttribute(node, "label");
    }
    // Only the kit's controls whose root holds their children as given.
    if (!CHILDREN_AT_ROOT.has(node.name ?? "")) {
      return false;
    }
  }
  return inside.length > 0 && inside.every((n) => leftAlone(n, source, icons));
}

/** Whether the recipe can tell what a mark line's child is (see the header). */
function told(node: Node, source: string, icons: Set<string>): boolean {
  if (!visible(node) || isBare(node)) {
    return true;
  }
  if (hasAttribute(node, "data-box") || holdsOnlyMarks(node, source, icons)) {
    return true;
  }
  if (node.type === "Component") {
    // A mark component draws an svg or says data-box on its own root; a
    // wrapper (a tooltip) draws its child, which is checked where written.
    return (
      WRAPPER_COMPONENT.test(node.name ?? "") ||
      BOX_COMPONENT.test(node.name ?? "") ||
      MARK_COMPONENT.test(node.name ?? "") ||
      SVG_COMPONENT.test(node.name ?? "") ||
      WORDS_COMPONENT.test(node.name ?? "") ||
      classes(node, source).some((c) => LEFT_ALONE_CLASS.test(c))
    );
  }
  if (!isElement(node)) {
    // `{@render …}`, `{@html …}`: what they draw is checked where it is written.
    return true;
  }
  return (
    node.name === "svg" ||
    node.name === "img" ||
    classes(node, source).some(
      (c) => LEFT_ALONE_CLASS.test(c) || c === "mark-text"
    ) ||
    children(node.fragment?.nodes).some(holdsWords)
  );
}

/** The declarations of every rule in a stylesheet whose selector names `.name`. */
function rulesFor(css: string, name: string): string[] {
  const named = new RegExp(`\\.${name.replace(/[^\w-]/g, "\\$&")}(?![\\w-])`);
  return [...css.matchAll(RULE)]
    .filter((m) => named.test(m[1] ?? ""))
    .map((m) => m[2] ?? "");
}

/** Whether an element is a scroll container by a utility or its component's styles. */
function scrolls(node: Node, source: string, css: string): boolean {
  const names = classes(node, source);
  return (
    names.some((c) => SCROLL_TOKEN.test(c)) ||
    names.some((c) => rulesFor(css, c).some((body) => SCROLLS.test(body)))
  );
}

/** Whether the comment directly above `siblings[index]` says why it is no mark line. */
function allowedAt(siblings: Node[], index: number): boolean {
  for (let i = index - 1; i >= 0; i -= 1) {
    const prev = siblings[i] as Node;
    if (prev.type === "Text" && !prev.data?.trim()) {
      continue;
    }
    return prev.type === "Comment" && ALLOW.test(prev.data ?? "");
  }
  return false;
}

/** One file's reading: its source, its styles, and where its hits go. */
interface Reading {
  css: string;
  file: string;
  hits: Hit[];
  /** Components imported from the icon barrel or the icon package (`#lib/icons.js`, `@cawco/icons`, its marks), by the name the file gives each: each renders an svg. */
  icons: Set<string>;
  source: string;
}

/** An import from the icon barrel or the icon package: its specifiers. */
const ICON_IMPORT =
  /import\s*\{([^}]*)\}\s*from\s*["'](?:#lib\/icons(?:\.js)?|\$lib\/icons(?:\.js)?|@cawco\/icons(?:\/marks)?)["']/g;
/** One specifier's local name: `A as B` is `B`. */
const LOCAL_NAME = /(?:\w+\s+as\s+)?(\w+)\s*$/;

/** The local names `source` imports from the icon barrel or the icon package. */
const iconNames = (source: string): Set<string> =>
  new Set(
    [...source.matchAll(ICON_IMPORT)].flatMap((found) =>
      (found[1] ?? "")
        .split(",")
        .map((spec) => spec.trim().match(LOCAL_NAME)?.[1] ?? "")
        .filter(Boolean)
    )
  );

const lineOf = (r: Reading, at: number): number =>
  r.source.slice(0, at).split("\n").length;
/** The text of an attribute's value as written, or null when it is absent. */
function attributeText(
  node: Node,
  name: string,
  source: string
): string | null {
  const found = (node.attributes ?? []).find(
    (a) => a.type === "Attribute" && a.name === name
  );
  if (!found) {
    return null;
  }
  return source
    .slice(found.start, found.end)
    .replace(`${name}=`, "")
    .replace(/^["'{]|["'}]$/g, "");
}

/** Whether a kit part is given a look that draws the mark line. */
function looksLine(node: Node, source: string): boolean {
  const looks = LOOKS[node.name ?? ""];
  if (node.type !== "Component" || !looks) {
    return false;
  }
  return Object.entries(looks).some(([prop, values]) => {
    const value = attributeText(node, prop, source);
    return value !== null && (values === true || values.includes(value));
  });
}

const isLine = (r: Reading, node: Node): boolean =>
  RECIPE.test(` ${classText(node, r.source)} `) ||
  RECIPE_CALL.test(classText(node, r.source)) ||
  (node.type === "Component" && PRIMITIVES.has(node.name ?? "")) ||
  looksLine(node, r.source);
const hit = (r: Reading, node: Node, what: string): void => {
  r.hits.push({
    file: r.file,
    line: lineOf(r, node.start),
    tag: `<${node.name}>`,
    what,
  });
};

/** Words beside a mark are elements, on a row that draws the recipe. */
function checkBeside(r: Reading, node: Node, kids: Node[]): void {
  if (kids.some(isBare)) {
    hit(r, node, "bare words beside a mark: wrap them in an element");
  }
  if (!isLine(r, node)) {
    hit(
      r,
      node,
      'words beside a mark on a row that is not a mark line: add class="mark-line"'
    );
  }
}

/** Every child of a mark line that the recipe cannot tell apart says data-box. */
function checkBoxes(r: Reading, kids: Node[]): void {
  for (const kid of kids.filter(
    (k) => !(told(k, r.source, r.icons) || r.icons.has(k.name ?? ""))
  )) {
    hit(r, kid, "a box on a mark line that does not say so: add data-box");
  }
  // A selector sees no text: a child whose elements are all marks is taken
  // for a box, and words written bare beside them lose their trim.
  for (const kid of kids.filter(
    (k) => isElement(k) || k.type === "Component"
  )) {
    const takenForBox = rendered(kid.fragment?.nodes).some((drawn) => {
      const inside = drawn.filter(visible);
      const elements = inside.filter((n) => !isBare(n));
      return (
        inside.some(isBare) &&
        elements.length > 0 &&
        elements.every((n) => leftAlone(n, r.source, r.icons))
      );
    });
    const saysWhich =
      hasAttribute(kid, "data-box") ||
      classes(kid, r.source).includes("mark-text");
    if (!saysWhich && takenForBox) {
      hit(
        r,
        kid,
        "words written bare beside a mark in a mark line's child: put them in an element or give the child mark-text, or the recipe takes it for a box"
      );
    }
  }
}

/** Trimmed words never scroll: Gecko does not trim a scroll container. */
function checkScroll(r: Reading, node: Node, kids: Node[]): void {
  const trimmed = isLine(r, node)
    ? kids.filter(
        (k) =>
          isElement(k) &&
          !hasAttribute(k, "data-box") &&
          children(k.fragment?.nodes).some(isBare)
      )
    : [];
  if (classes(node, r.source).includes("mark-text")) {
    trimmed.push(node);
  }
  for (const kid of trimmed.filter((k) => scrolls(k, r.source, r.css))) {
    hit(
      r,
      kid,
      "words on a mark line that scroll (overflow hidden, auto or truncate): clip them with overflow: clip, which Gecko trims"
    );
  }
}

function inspect(
  r: Reading,
  node: Node,
  siblings: Node[],
  index: number
): void {
  const kids = children(node.fragment?.nodes);
  const beside =
    kids.some((k) => isMark(k, r.source)) &&
    kids.some((k) => isWords(k, r.source));
  if (beside && !allowedAt(siblings, index)) {
    checkBeside(r, node, kids);
  }
  if (
    !beside &&
    node.type === "Component" &&
    BOXES.has(node.name ?? "") &&
    kids.some(isBare)
  ) {
    hit(
      r,
      node,
      "bare words in a box: wrap them in an element so the box centres their x-height"
    );
  }
  if (isLine(r, node)) {
    checkBoxes(r, kids);
  }
  checkScroll(r, node, kids);
}

/** A node's child nodes, each with the sibling list it sits in. */
function childLists(node: Node): Node[][] {
  const lists: Node[][] = [];
  for (const key of Object.keys(node)) {
    if (key === "parent" || key === "attributes") {
      continue;
    }
    const value = node[key] as unknown;
    if (Array.isArray(value)) {
      lists.push(
        value.filter(
          (child): child is Node =>
            Boolean(child) && typeof child === "object" && "type" in child
        )
      );
    } else if (value && typeof value === "object") {
      const { nodes, type } = value as { nodes?: Node[]; type?: string };
      if (type) {
        lists.push([value as Node]);
      } else if (Array.isArray(nodes)) {
        lists.push(nodes);
      }
    }
  }
  return lists;
}

function visit(r: Reading, node: Node, siblings: Node[], index: number): void {
  if (node.fragment?.nodes && (isElement(node) || node.type === "Component")) {
    inspect(r, node, siblings, index);
  }
  for (const list of childLists(node)) {
    list.forEach((child, i) => {
      visit(r, child, list, i);
    });
  }
}

export function check(file: string, source: string): Hit[] {
  const ast = parse(source, { modern: true }) as unknown as {
    fragment: { nodes: Node[] };
  };
  const r: Reading = {
    css: STYLE.exec(source)?.[1] ?? "",
    file,
    hits: [],
    icons: iconNames(source),
    source,
  };
  const top = ast.fragment.nodes;
  top.forEach((node, i) => {
    visit(r, node, top, i);
  });
  return r.hits;
}

if (import.meta.main) {
  const named = process.argv.slice(2);
  const files =
    named.length > 0
      ? named.map((one) => join(process.cwd(), one))
      : (() => {
          const out: string[] = [];
          walkFiles(SOURCE, out);
          return out;
        })();
  const hits = files
    .filter((file) => file.endsWith(".svelte"))
    .flatMap((file) =>
      check(relative(process.cwd(), file), readFileSync(file, "utf8"))
    );
  if (hits.length > 0) {
    for (const one of hits) {
      console.error(`${one.file}:${one.line}  ${one.tag}  ${one.what}`);
    }
    console.error(
      `mark-line:check: ${hits.length} row(s) set words beside a mark that the mark line cannot centre. Give the row the recipe (class="mark-line", or a kit primitive that draws it), put its words in elements, and mark a box on the line with data-box; where the mark is not beside the words, say so with <!-- mark-line: why --> directly above the row (apps/dashboard/scripts/mark-line-check.ts, DESIGN.md The Mark Line Rule).`
    );
    process.exit(1);
  }
  console.log(
    `mark-line:check: ${files.length} file(s), every mark line's words are elements on the recipe`
  );
}

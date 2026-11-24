/**
 * `bun scripts/style-greps.ts` (part of `bun run check`): the shapes the
 * dashboard never writes, found by grep over apps/dashboard/src
 * (tracked and untracked files):
 *  - `transition-all`: every property the element ever changes would
 *    transition; a transition names its properties.
 *  - `filter` in a transition's property list (`transition-[…filter…]`,
 *    `transition: filter …`, `transition-property: …backdrop-filter`): a
 *    transitioned blur hangs WebKit's web process (specs/web/safari-blurs).
 *  - a class-keyed `has-[.x]`: a `:has()` keyed on a class restyles its
 *    element whenever any descendant's class changes; it is keyed on an
 *    attribute the child carries (`has-data-needs:`).
 *  - a pointer cursor set on an element (`cursor-pointer`, `cursor: pointer`
 *    outside design.css): design.css's one base rule gives every enabled
 *    button and `role="button"` the hand, as Tailwind v4's upgrade guide
 *    gives it (https://tailwindcss.com/docs/upgrade-guide, "Buttons use the
 *    default cursor").
 *  - a house `dur-*` class: it set only `transition-duration`, so Tailwind's
 *    own `transition-[…]` sorted after it reset the duration to the default
 *    through `--tw-duration`. A transition's duration is Tailwind's
 *    `duration-(--dur-*)` (https://tailwindcss.com/docs/transition-duration:
 *    "`transition-duration: var(<custom-property>)`"), which sets both.
 *  - `toast.error` or `toast.warning`: a failure is said on the surface it
 *    happened on, in the error formula, with its way out (RowFault, a
 *    pane's own line, the composer's), never in a toast that leaves on a
 *    timer (DESIGN.md, The Work Outlives Its Surface Rule). The one toast
 *    the dashboard keeps is a delete's Undo (config/undo.ts), on `toast(`.
 *  - an @keyframes (a stylesheet's, a `<style>`'s) that cuts (`clip-path`)
 *    and moves (`transform`, `translate`, `scale`, `rotate`): Chromium kills
 *    the renderer once a later move displaces such an effect
 *    (scripts/lint/design/clip-move.mjs, which holds scripts to the same).
 *    Read whole, not by line: a block spans lines.
 *  - a `kit-tree-row` without its depth (`style:--line-depth`): a tree's
 *    row is set in a step a level by its depth (design.css `kit-tree-row`,
 *    tree-lines.ts); without it a child row stands flush with its parent
 *    and its lines stand at the root's. Read from each row's opening tag
 *    whole, so it may span lines.
 *  - an opening tag that reads the screen's bottom inset (`--safe-bottom`,
 *    or a `pb-safe-*` class) without carrying `data-safe-bottom`: the
 *    inset is a non-inherited property set only on the boxes that carry
 *    the attribute (design.css `@property --safe-bottom`), so anywhere
 *    else it reads 0px and what stands on the screen's bottom covers the
 *    end of what scrolls behind it on a phone with a home indicator (the
 *    transcript's last line under the composer's chips). A name the
 *    component's script declares from the inset counts as reading it
 *    where a tag draws with it (a style directive, `style`, `class`).
 *  These four colour rules hold in the design system's own files (the kit,
 *  the board, the motion helpers) until the app moves onto the roles:
 *  - a colour named by its hue (`text-red`, `--color-orange`): a component
 *    names a role (theme.css: `danger`, `caution`, `success`, `live`, the
 *    base roles, coral), or a `label-<hue>` for a hue picked to mark a
 *    thing, so the name says what the colour is for (two layers, owner's
 *    pick 2026-11-24).
 *  - a palette step (`--red-47`, `--neutral-17`, `--pigment-*`) outside the
 *    token sheets (lib/tokens/): the palette means nothing; only the roles
 *    in theme.css point at it.
 *  - a colour role at a share of its own (`bg-accent/20`, `oklch(from
 *    var(--color-tx) l c h / 0.4)`, `color-mix(… var(--color-…) …)`) outside
 *    the token sheets and design.css's recipes: a colour a surface lays at
 *    a share is a role of its own in theme.css (`highlight`, `veil`,
 *    `label-<hue>-wash`, `caution-edge`), so no component picks a share.
 * Prints `file:line: text` under the rule each match breaks; exits 1 on any.
 */
import { resolve } from "node:path";
import { type AST, parse } from "svelte/compiler";

// Read at run time beyond its imports; check.ts keys the check on them.
export const checkReads = ["apps/dashboard/src/"];

const ROOT = resolve(import.meta.dir, "..");
const RULES: {
  name: string;
  pattern: string;
  fixed?: boolean;
  exclude?: string | string[];
  /** Where it holds, when not the whole dashboard. */
  only?: string[];
}[] = [
  {
    name: "transition-all is banned: name the properties (transition-[a,b])",
    pattern: "(^|[^-[:alnum:]])transition-all([^-[:alnum:]]|$)",
  },
  {
    name: "filter is never in a transition's property list (the WebKit filter hang)",
    pattern:
      "transition-\\[[^]]*filter|transition(-property)?[[:space:]]*:[^;{}]*filter",
  },
  {
    name: "has-[.class] is banned: key :has() on an attribute (has-data-x:)",
    pattern: "has-[.",
    fixed: true,
  },
  {
    name: "a pointer cursor is never set per element: design.css's base rule gives every enabled button the hand",
    pattern:
      "(^|[^-[:alnum:]])cursor-pointer([^-[:alnum:]]|$)|cursor[[:space:]]*:[[:space:]]*pointer",
    exclude: ":!apps/dashboard/src/design.css",
  },
  {
    name: "a dur-* class is banned: a transition's duration is duration-(--dur-*), which sets --tw-duration for a transition-[…] after it",
    pattern: "(^|[^-[:alnum:]])dur-[a-z]",
  },
  {
    name: "a colour is named by its role, never its hue (theme.css: danger, caution, success, live, a label-<hue> for a hue that marks a thing)",
    pattern:
      "(^|[^-[:alnum:]])(text|bg|border(-[xytrblse])?|fill|stroke|ring|outline|decoration|inset-ring|divide|caret|shadow|from|to|via|placeholder)-(red|orange|yellow|green|cyan|blue|purple|magenta)([^-[:alnum:]]|$)|--color-(red|orange|yellow|green|cyan|blue|purple|magenta)([^-[:alnum:]]|$)",
    only: [
      "apps/dashboard/src/lib/components/ui",
      "apps/dashboard/src/lib/design-board",
      "apps/dashboard/src/lib/platform",
    ],
  },
  {
    name: "a palette step is named only in the token sheets (lib/tokens/): a component names a role",
    pattern:
      "var\\(--(neutral|base|red|orange|yellow|green|cyan|blue|purple|magenta|coral)-[0-9a-z]+\\)|var\\(--pigment-",
    only: [
      "apps/dashboard/src/lib/components/ui",
      "apps/dashboard/src/lib/design-board",
      "apps/dashboard/src/lib/platform",
    ],
  },
  {
    name: "a colour role takes no share of its own (bg-accent/20): name the role theme.css gives that share (highlight, veil, label-<hue>-wash, caution-edge), or add it there",
    pattern:
      "(^|[^-[:alnum:]])(text|bg|border(-[xytrblse])?|fill|stroke|ring|outline|decoration|inset-ring|divide|caret|shadow|from|to|via|placeholder)-(tx|tx-2|tx-3|bg|bg-2|ui|ui-2|ui-3|accent|on-accent|danger|caution|success|live|label-[a-z]+)/[0-9]+",
    only: [
      "apps/dashboard/src/lib/components/ui",
      "apps/dashboard/src/lib/design-board",
      "apps/dashboard/src/lib/platform",
    ],
  },
  {
    name: "a colour is never derived from a role outside the token sheets and design.css's recipes: name the role theme.css gives it, or add it there",
    pattern:
      "oklch\\(from var\\(--color-|color-mix\\(in [a-z]+, ?var\\(--color-",
    only: [
      "apps/dashboard/src/lib/components/ui",
      "apps/dashboard/src/lib/design-board",
      "apps/dashboard/src/lib/platform",
    ],
  },
  {
    name: "a failure is never a toast (DESIGN.md, Flow: a failure leaves the person where they were): say it where it happened, in the error formula, with its way out (RowFault, the pane's line, the composer's)",
    pattern: "(^|[^[:alnum:]_$])toast\\.(error|warning)([^[:alnum:]_$]|$)",
  },
];

const outs = await Promise.all(
  RULES.map((rule) =>
    Bun.$`git grep --untracked -n ${rule.fixed ? "-F" : "-E"} -e ${rule.pattern} -- ${rule.only ?? ["apps/dashboard/src"]} ${rule.exclude ? [rule.exclude].flat() : []}`
      .cwd(ROOT)
      .nothrow()
      .quiet()
  )
);
/** Each @keyframes in `text` that cuts and moves: its line and its head. */
const KEYFRAMES = /@(?:-webkit-)?keyframes\s+[^{]+\{/gu;
const CUT = /(?<![\w-])clip-path\s*:/u;
const MOVE = /(?<![\w-])(?:transform|translate|scale|rotate)\s*:/u;
function cutsAndMoves(text: string): { head: string; line: number }[] {
  const hits: { head: string; line: number }[] = [];
  for (const head of text.matchAll(KEYFRAMES)) {
    let depth = 1;
    let at = head.index + head[0].length;
    while (depth > 0 && at < text.length) {
      if (text[at] === "{") {
        depth += 1;
      } else if (text[at] === "}") {
        depth -= 1;
      }
      at += 1;
    }
    const body = text.slice(head.index + head[0].length, at);
    if (CUT.test(body) && MOVE.test(body)) {
      hits.push({
        head: head[0].slice(0, -1).trim(),
        line: text.slice(0, head.index).split("\n").length,
      });
    }
  }
  return hits;
}
const styled = (
  await Bun.$`git ls-files -co --exclude-standard -- apps/dashboard/src`
    .cwd(ROOT)
    .quiet()
    .text()
)
  .split("\n")
  .filter((file) => file.endsWith(".css") || file.endsWith(".svelte"));
const keyframeHits = (
  await Promise.all(
    styled.map(async (file) =>
      cutsAndMoves(await Bun.file(resolve(ROOT, file)).text()).map(
        (hit) => `${file}:${hit.line}: ${hit.head}`
      )
    )
  )
).flat();

/** Each tree row's opening tag in `text` that sets no depth. */
const CLASS_ATTR = /\bclass="([^"]*)"/gu;
const SPACES = /\s+/u;
/** Where an opening tag ends: its `>` at a line's end. */
const TAG_END = />\s*$/mu;
function flushNests(text: string): number[] {
  const lines: number[] = [];
  for (const attr of text.matchAll(CLASS_ATTR)) {
    const names = (attr[1] as string).split(SPACES);
    if (!names.includes("kit-tree-row")) {
      continue;
    }
    const start = text.lastIndexOf("<", attr.index);
    const rest = text.slice(attr.index);
    const end = rest.search(TAG_END);
    const tag = text.slice(
      start,
      attr.index + (end === -1 ? rest.length : end)
    );
    if (!tag.includes("style:--line-depth")) {
      lines.push(text.slice(0, attr.index).split("\n").length);
    }
  }
  return lines;
}
const nestHits = (
  await Promise.all(
    styled
      .filter((file) => file.endsWith(".svelte"))
      .map(async (file) =>
        flushNests(await Bun.file(resolve(ROOT, file)).text()).map(
          (line) => `${file}:${line}`
        )
      )
  )
).flat();

/** What reads the screen's bottom inset in a tag's source: the property, or the padding utility built on it. */
const READS_INSET = /--safe-bottom\b|(?<![\w-])pb-safe-/u;
interface TagAttribute {
  end: number;
  name?: string;
  start: number;
  type: string;
}
interface Tag {
  attributes: TagAttribute[];
  start: number;
}
/** A markup node that opens a tag (an element, a component, a `svelte:` one): it has attributes and a place. */
const isTag = (node: object): node is Tag =>
  "attributes" in node &&
  Array.isArray(node.attributes) &&
  "start" in node &&
  typeof node.start === "number";
/** An attribute that draws: a style directive, or the `style` or `class` attribute. */
const draws = (attribute: TagAttribute) =>
  attribute.type === "StyleDirective" ||
  attribute.name === "style" ||
  attribute.name === "class";
/**
 * The tag reads the inset and does not carry `data-safe-bottom`: the inset
 * written anywhere in its source, or a name its script built from it
 * (`named`) in what it draws with.
 */
function readsInsetUnset(
  source: string,
  tag: Tag,
  named: RegExp | null
): boolean {
  const last = tag.attributes.at(-1);
  if (
    last === undefined ||
    tag.attributes.some((attribute) => attribute.name === "data-safe-bottom")
  ) {
    return false;
  }
  return (
    READS_INSET.test(source.slice(tag.start, last.end)) ||
    (named !== null &&
      tag.attributes.some(
        (attribute) =>
          draws(attribute) &&
          named.test(source.slice(attribute.start, attribute.end))
      ))
  );
}
/** Where a node of a component's script stands in its source: svelte's parser places each one. */
const placed = (node: object): { end: number; start: number } | null =>
  "start" in node &&
  typeof node.start === "number" &&
  "end" in node &&
  typeof node.end === "number"
    ? { start: node.start, end: node.end }
    : null;
/** The names a component's script declares from the inset (`const reserved = \`calc(… var(--safe-bottom) …)\``): a tag that draws with one reads it. */
function insetNames(
  source: string,
  body: NonNullable<AST.Root["instance"]>["content"]["body"]
): string[] {
  return body.flatMap((statement) => {
    const at = placed(statement);
    if (
      statement.type !== "VariableDeclaration" ||
      at === null ||
      !READS_INSET.test(source.slice(at.start, at.end))
    ) {
      return [];
    }
    return statement.declarations.flatMap((declaration) =>
      declaration.id.type === "Identifier" ? [declaration.id.name] : []
    );
  });
}
/** Each node under `node` in the markup, attributes left out (an attribute's value holds no tag). */
function* markupNodes(node: unknown): Generator<object> {
  if (Array.isArray(node)) {
    for (const item of node) {
      yield* markupNodes(item);
    }
    return;
  }
  if (typeof node !== "object" || node === null) {
    return;
  }
  yield node;
  for (const [key, value] of Object.entries(node)) {
    if (key !== "attributes") {
      yield* markupNodes(value);
    }
  }
}
/** Each opening tag in a component's markup that reads the inset and does not carry `data-safe-bottom`: its line. */
function insetsUnset(source: string): number[] {
  const ast = parse(source, { modern: true });
  const names = insetNames(source, ast.instance?.content.body ?? []);
  const named =
    names.length > 0 ? new RegExp(`\\b(?:${names.join("|")})\\b`, "u") : null;
  const lines: number[] = [];
  for (const node of markupNodes(ast.fragment)) {
    if (isTag(node) && readsInsetUnset(source, node, named)) {
      lines.push(source.slice(0, node.start).split("\n").length);
    }
  }
  return lines;
}
const insetHits = (
  await Promise.all(
    styled
      .filter((file) => file.endsWith(".svelte"))
      .map(async (file) =>
        insetsUnset(await Bun.file(resolve(ROOT, file)).text()).map(
          (line) => `${file}:${line}`
        )
      )
  )
).flat();

let found = 0;
if (insetHits.length > 0) {
  found += insetHits.length;
  console.log(
    `a tag that reads the screen's bottom inset (--safe-bottom, pb-safe-*) carries data-safe-bottom, or the inset is 0px there (design.css @property --safe-bottom):\n${insetHits.map((hit) => `  ${hit}`).join("\n")}`
  );
}
if (nestHits.length > 0) {
  found += nestHits.length;
  console.log(
    `a kit-tree-row is set in by its depth: give it style:--line-depth={line.depth} (tree-lines.ts):\n${nestHits.map((hit) => `  ${hit}`).join("\n")}`
  );
}
if (keyframeHits.length > 0) {
  found += keyframeHits.length;
  console.log(
    `an @keyframes never cuts (clip-path) and moves (transform, translate, scale, rotate) at once: animate the cut as its own effect on the same timing:\n${keyframeHits.map((hit) => `  ${hit}`).join("\n")}`
  );
}
for (const [i, rule] of RULES.entries()) {
  const out = outs[i] as (typeof outs)[number];
  const lines = out.stdout.toString().trim();
  if (out.exitCode === 0 && lines) {
    const hits = lines.split("\n");
    found += hits.length;
    console.log(`${rule.name}:\n${hits.map((hit) => `  ${hit}`).join("\n")}`);
  } else if (out.exitCode > 1) {
    console.error(`git grep failed: ${out.stderr.toString().trim()}`);
    process.exit(2);
  }
}
console.log(
  found === 0
    ? "style greps: no transition-all, no filter in a transition list, no has-[.class], no per-element pointer cursor, no dur-* class, no failure toast, no colour named by its hue, no palette step outside the token sheets, no colour role at a share of its own, no colour derived from a role outside the system sheets, no @keyframes that cuts and moves, no kit-tree-row without its depth, no bottom inset read off a box without data-safe-bottom"
    : `style greps: ${found} match${found === 1 ? "" : "es"}`
);
process.exit(found === 0 ? 0 : 1);

// K1's base-modifier check. At ac7b79de8 (T) a consumer's unlayered scoped rule
// beat the kit bases' layered modifiers (`[&:has([role=checkbox])]:pr-0` on
// TableCell and TableHead, `[&_tr:last-child]:border-0` on TableBody); now the
// consumer's look is a utility, and the base's higher-specificity modifier
// wins unless the variant restates the value at a modifier above it.
//
//   bun .cutover/k1-modifiers.ts
//
// For each affected consumer, Chromium computes the same rows and cells three
// ways, at a desk (1440) and a phone (390):
//   T   the kit's base classes at T, the consumer's markup classes at T and its
//       `<style>` at T (unlayered, `:global()` unwrapped, the scoped class kept);
//   1a  today's consumer classes on the kit's base;
//   K1  the variant, and the classes the consumer keeps.
// T against K1 on every padding and border longhand must match; 1a against K1
// on every computed property lists exactly what K1 changes.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { plugin } from "bun";
import { chromium } from "playwright-core";

const root = resolve(import.meta.dir, "..");
const app = join(root, "apps/dashboard");
const T = "ac7b79de8";

const RAW = /\?raw$/;
const ANY = /.*/;
const SVELTE = /\.svelte$/;
const MODULE_SCRIPT = /<script lang="ts" module>([\s\S]*?)<\/script>/;
const STYLE = /<style>([\s\S]*?)<\/style>/;
/**
 * A rule's prelude: what follows a `{`, a `}` or the start, up to its `{`.
 * A lookbehind, so an at-rule's own `{` still leads its first rule.
 */
const PRELUDE = /(?<=^|[{}])()([^{}]+?)\{/g;
/** A character that separates compound selectors. */
const COMBINATOR = /[\s>+~]/;
const COMMENT = /\/\*[\s\S]*?\*\//g;
const INTERPOLATION = /\{[^}]*\}/g;
const SPACES = /\s+/g;

plugin({
  name: "k1-modifiers",
  setup(build) {
    build.onResolve({ filter: RAW }, (args) => ({
      path: resolve(dirname(args.importer), args.path.replace(RAW, "")),
      namespace: "raw",
    }));
    build.onLoad({ filter: ANY, namespace: "raw" }, (args) => ({
      contents: `export default ${JSON.stringify(readFileSync(args.path, "utf8"))};`,
      loader: "js",
    }));
    build.onLoad({ filter: SVELTE }, (args) => {
      const module = readFileSync(args.path, "utf8").match(MODULE_SCRIPT);
      if (!module) {
        throw new Error(`${args.path}: no module script`);
      }
      return { contents: module[1], loader: "ts" };
    });
  },
});

const kit = join(app, "src/lib/components/ui/table");
const { cn } = await import(join(app, "src/lib/utils.ts"));
const { tableCellVariants } = await import(join(kit, "table-cell.svelte"));
const { tableHeadVariants } = await import(join(kit, "table-head.svelte"));
const { tableRowVariants } = await import(join(kit, "table-row.svelte"));
const { tableVariants } = await import(join(kit, "table.svelte"));
const { compile } = await import(
  join(
    root,
    "node_modules/.bun/@tailwindcss+node@4.3.3/node_modules/@tailwindcss/node/dist/index.mjs"
  )
);

/** The kit's bases at T (`git show ac7b79de8:…/ui/table/*`). */
const T_BASE = {
  table: "w-full caption-bottom text-body",
  thead: "[&_tr]:border-b",
  tbody: "[&_tr:last-child]:border-0",
  tr: "border-b transition-colors data-[state=selected]:bg-muted",
  th: "h-12 whitespace-nowrap px-3 text-left align-middle text-foreground text-label [&:has([role=checkbox])]:pr-0",
  td: "whitespace-nowrap p-3 align-middle [&:has([role=checkbox])]:pr-0",
};
/** Today's bases (1a): the recipes' bases, which k1-exact holds to them. */
const BASE = {
  table: tableVariants().table() as string,
  thead: "[&_tr]:border-b",
  tbody: "[&_tr:last-child]:border-0",
  tr: tableRowVariants() as string,
  th: tableHeadVariants() as string,
  td: tableCellVariants() as string,
};

type Tag = keyof typeof BASE;
type Props = Record<string, string | boolean | undefined>;
const RECIPE: Partial<Record<Tag, (p: Props) => string>> = {
  td: tableCellVariants,
  th: tableHeadVariants,
  tr: tableRowVariants,
  table: (p) => tableVariants(p).table(),
};

/** The class string a line of today's consumer opens, `{…}` filled empty. */
function classesAt(file: string, line: number, fill = ""): string {
  const text = readFileSync(join(app, file), "utf8")
    .split("\n")
    .slice(line - 1)
    .join("\n");
  const [first] = text.split("\n");
  const start = first.includes('class="')
    ? text.indexOf('class="') + 7
    : text.indexOf('"') + 1;
  return text
    .slice(start, text.indexOf('"', start))
    .replace(INTERPOLATION, fill)
    .replace(SPACES, " ")
    .trim();
}

/** A fixture's own scoping class, as Svelte gives each file its own hash. */
/** A fixture side's own scoping class: each side's stylesheet is its own file. */
const hash = (name: string, side: Side): string =>
  `svelte-${side}-${name.toLowerCase()}`;

/** A consumer's `<style>` at T (git) or today (the tree), unlayered, scoped with the side's hash. */
function styleOf(name: string, file: string, side: Side): string {
  const source =
    side === "t"
      ? execFileSync("git", ["show", `${T}:apps/dashboard/${file}`], {
          cwd: root,
          encoding: "utf8",
          maxBuffer: 64 * 1024 * 1024,
        })
      : readFileSync(join(app, file), "utf8");
  const css = (source.match(STYLE)?.[1] ?? "").replace(COMMENT, "");
  // Every rule's selector list, after a `{`, a `}` or the start; at-rules keep theirs.
  return css.replace(PRELUDE, (_, lead: string, selectors: string) =>
    selectors.trimStart().startsWith("@")
      ? `${lead}${selectors}{`
      : `${lead}${splitTop(selectors)
          .map((selector) => scoped(selector, hash(name, side)))
          .join(", ")} {`
  );
}

/**
 * A local selector part with the file's hash on every compound selector, as
 * Svelte scopes it (`[data-slot="ledger"] .a:hover` → `[data-slot="ledger"].h
 * .a:hover.h`), before any pseudo-element.
 */
function hashCompounds(local: string, fileHash: string): string {
  let out = "";
  let compound = "";
  let depth = 0;
  const flush = () => {
    if (compound) {
      const pseudo = compound.indexOf("::");
      out +=
        pseudo === -1
          ? `${compound}.${fileHash}`
          : `${compound.slice(0, pseudo)}.${fileHash}${compound.slice(pseudo)}`;
      compound = "";
    }
  };
  for (const ch of local) {
    if (ch === "[" || ch === "(") {
      depth += 1;
    } else if (ch === "]" || ch === ")") {
      depth -= 1;
    }
    if (depth === 0 && COMBINATOR.test(ch)) {
      flush();
      out += ch;
    } else {
      compound += ch;
    }
  }
  flush();
  return out;
}

/** A selector list split on its top-level commas. */
function splitTop(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i += 1) {
    const ch = list[i];
    if (ch === "(") {
      depth += 1;
    } else if (ch === ")") {
      depth -= 1;
    } else if (ch === "," && depth === 0) {
      out.push(list.slice(start, i));
      start = i + 1;
    }
  }
  out.push(list.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

/**
 * One selector as Svelte scopes it: each compound outside `:global(…)` takes
 * the file's hash (so a local rule reaches only the file's own elements, never
 * a component's), and `:global(…)` is unwrapped as written.
 */
function scoped(selector: string, fileHash: string): string {
  let out = "";
  let i = 0;
  while (i < selector.length) {
    const at = selector.indexOf(":global(", i);
    const local = selector.slice(i, at === -1 ? undefined : at);
    out += hashCompounds(local, fileHash);
    if (at === -1) {
      break;
    }
    let depth = 1;
    let j = at + ":global(".length;
    while (j < selector.length && depth > 0) {
      if (selector[j] === "(") {
        depth += 1;
      } else if (selector[j] === ")") {
        depth -= 1;
      }
      j += 1;
    }
    out += selector.slice(at + ":global(".length, j - 1);
    i = j;
  }
  return out;
}

interface Node {
  /** Classes set 2 adds to today's site (the orchestrator's addition). */
  added?: string;
  attrs?: string;
  children?: Node[];
  content?: string;
  id?: string;
  /** On K1's side, classes the consumer passes beside the variant (its mapping in K1.md). */
  k1Adds?: string;
  /** On K1's side, consumer classes the variant replaces (the appendix lists them). */
  k1Drops?: string[];
  props?: Props;
  /** The element's inline style, every side. */
  style?: string;
  /** T's markup classes on top of T's base. */
  t?: string;
  tag: Tag;
  /** Today's consumer classes: a site (its `{…}` filled), or a literal. */
  today?: { file: string; line: number; fill?: string } | string;
}
interface Fixture {
  /** The consumer's file, for its `<style>` at T and today. */
  file: string;
  /** Rules of today's `<style>` that K1's side goes without (the set deletes them). */
  k1Without?: RegExp;
  name: string;
  table: Node;
  wrapper: { t: string; now: string; attrs?: string; style?: string };
}

const tick = '<button role="checkbox" aria-checked="false">x</button>';
const TT = "src/lib/cawco/tasks/TaskTable.svelte";
const VR = "src/lib/cawco/views/ViewRoutines.svelte";
const PS = "src/lib/cawco/usage/ProjectSpend.svelte";
const UT = "src/lib/cawco/updates/UpdateTable.svelte";
const VT = "src/lib/cawco/views/openui/ViewTable.svelte";
/** ViewRoutines' `tr.band` and `tr.band th` rules, which K1's band mapping replaces. */
const BAND_RULES = /[^{}]*tr\.band[^{}]*\{[^{}]*\}/g;

/** A generated view's row: its lead cell (the first column's branch) and another. */
const viewRow = (n: number): Node => ({
  tag: "tr",
  id: `view-row-${n}`,
  t: "row",
  today: { file: VT, line: 77 },
  attrs: 'data-view-table-row=""',
  children: [
    {
      tag: "td",
      id: `view-lead-${n}`,
      today: {
        file: VT,
        line: 81,
        fill: "min-w-(--first-min) py-space-2 whitespace-normal",
      },
      style: "--first-min: 9rem",
      props: { variant: "view-lead" },
      k1Drops: ["border-border-hairline"],
      content: "A title long enough to wrap onto a second line",
    },
    {
      tag: "td",
      id: `view-cell-${n}`,
      today: { file: VT, line: 81 },
      style: "--first-min: 9rem",
      props: { variant: "view" },
      k1Drops: ["border-border-hairline"],
      content: "value",
    },
  ],
});

/** ViewRoutines' `{rule}` for a row after the first. */
const RULE = "border-t border-t-border-hairline";

/** An event source's row: today's `{rule}` filled as given, K1's `rule="top"` with it. */
const sourceRow = (n: number, rule: string): Node => {
  const props = { variant: "list", rule: rule ? "top" : undefined };
  return {
    tag: "tr",
    id: `source-row-${n}`,
    t: "row",
    today: { file: VR, line: 990 },
    props: { variant: "unruled" },
    children: [
      {
        tag: "td",
        id: `source-state-${n}`,
        t: "col-state",
        today: { file: VR, line: 992, fill: rule },
        props,
        content: "x",
      },
      {
        tag: "td",
        id: `source-name-${n}`,
        t: "col-name",
        today: { file: VR, line: 1000, fill: rule },
        props,
        content: "A source",
      },
    ],
  };
};

/** A routines-ledger head: today's width classes, K1's `caps` and `h-c-toolbar-ctl`. */
const routinesHead = (
  col: string,
  line: number | undefined,
  content: string
): Node => ({
  tag: "th",
  id: `routines-head-${col}`,
  t: `col-${col}`,
  today: line === undefined ? "" : { file: VR, line },
  props: { variant: "caps" },
  k1Adds: "h-c-toolbar-ctl",
  content,
});

const taskRow = (n: number): Node => ({
  tag: "tr",
  id: `row-${n}`,
  t: "row",
  today: { file: TT, line: 305 },
  props: { variant: "picks-stacks" },
  attrs: 'data-task-table-row=""',
  children: [
    {
      tag: "td",
      id: `pick-${n}`,
      t: "col-pick",
      today: { file: TT, line: 313 },
      props: { variant: "ledger-picks-stacks" },
      content: tick,
    },
    {
      tag: "td",
      id: `title-${n}`,
      t: "col-title",
      today: { file: TT, line: 315 },
      props: { variant: "ledger-picks-stacks" },
      content: "A task",
    },
    {
      tag: "td",
      id: `labels-${n}`,
      t: "col-labels",
      today: { file: TT, line: 317 },
      props: { variant: "ledger-picks-stacks" },
      content: "label",
    },
    {
      tag: "td",
      id: `created-${n}`,
      t: "col-created",
      today: { file: TT, line: 319 },
      props: { variant: "ledger-picks-stacks" },
      content: "1d",
    },
  ],
});

const routineBody = (n: number): Node => ({
  tag: "tbody",
  t: "routine",
  today: "group",
  attrs: 'data-state="closed"',
  children: [
    {
      tag: "tr",
      id: `routine-row-${n}`,
      t: "row",
      today: { file: VR, line: 724 },
      props: { variant: "unruled" },
      children: [{ tag: "td", t: "col-name", content: "A routine" }],
    },
  ],
});

const spendRow = (n: number): Node => ({
  tag: "tr",
  id: `spend-row-${n}`,
  t: "row",
  today: { file: PS, line: 500 },
  added: "max-phone:border-b max-phone:border-b-border-hairline",
  props: { variant: "stacks" },
  children: [
    {
      tag: "td",
      t: "col-name",
      today: { file: PS, line: 503 },
      props: { variant: "ledger-stacks" },
      content: "A thread",
    },
  ],
});

const updateRow = (n: number): Node => ({
  tag: "tr",
  id: `update-row-${n}`,
  today: { file: UT, line: 73 },
  props: { variant: "stacks-ruled" },
  children: [
    {
      tag: "th",
      t: "machine h-auto bg-[var(--surface-raised)] px-[var(--space-4)] py-[var(--space-2)]",
      today: { file: UT, line: 80 },
      props: { variant: "matrix-row" },
      content: "machine",
    },
    {
      tag: "td",
      t: "running border-l border-border px-[var(--space-4)] py-[var(--space-2)]",
      today: { file: UT, line: 107 },
      props: { variant: "matrix-stacks" },
      content: "1.0",
    },
  ],
});

const FIXTURES: Fixture[] = [
  {
    name: "TaskTable",
    file: TT,
    wrapper: {
      t: "ledger",
      now: "group/ledger @container overflow-hidden rounded-lg bg-surface-raised shadow-tile",
      attrs: 'data-slot="ledger" data-pickable=""',
      style: "--cell-gap: 0",
    },
    table: {
      tag: "table",
      t: "tasks table-fixed",
      today: { file: TT, line: 220 },
      props: { spacing: "gap" },
      children: [
        {
          tag: "thead",
          today: "max-phone:hidden",
          children: [
            {
              tag: "tr",
              id: "band",
              t: "band border-0",
              today: { file: TT, line: 225 },
              props: { variant: "band" },
              children: [
                {
                  tag: "th",
                  id: "head-pick",
                  t: "col-pick",
                  today: { file: TT, line: 241 },
                  props: { variant: "caps" },
                  content: tick,
                },
                {
                  tag: "th",
                  id: "head-title",
                  t: "col-title",
                  today: { file: TT, line: 241 },
                  props: { variant: "caps" },
                  content: "Title",
                },
              ],
            },
          ],
        },
        {
          tag: "tbody",
          today: "max-phone:block",
          children: [taskRow(1), taskRow(2)],
        },
      ],
    },
  },
  {
    name: "ViewRoutines",
    file: VR,
    wrapper: {
      t: "ledger",
      now: "@container/routines-ledger",
      attrs: 'data-slot="ledger"',
      style:
        "--col-state: calc(var(--c-row-lead) + var(--space-3)); --col-menu: calc(var(--c-btn-h-sm) + var(--space-3) * 2)",
    },
    table: {
      tag: "table",
      t: "routines table-fixed",
      today: "table-fixed border-separate",
      children: [routineBody(1), routineBody(2)],
    },
  },
  {
    name: "ProjectSpend",
    file: PS,
    wrapper: {
      t: "ledger",
      now: "overflow-hidden rounded-lg bg-surface-raised shadow-tile",
      attrs: 'data-slot="ledger"',
      style: "--none: 0; --row-cols: 1fr auto auto",
    },
    table: {
      tag: "table",
      t: "table-fixed",
      today: { file: PS, line: 469 },
      props: { spacing: "flush" },
      children: [
        {
          tag: "tbody",
          today: "max-phone:block",
          children: [spendRow(1), spendRow(2)],
        },
      ],
    },
  },
  {
    name: "UpdateTable",
    file: UT,
    wrapper: {
      t: "matrix",
      now: "overflow-x-auto rounded-md bg-surface-raised shadow-(--matrix-ring)",
      style:
        "--phone-cols: minmax(0, 1fr) auto; --matrix-ring: inset 0 0 0 1px var(--border-hairline)",
    },
    table: {
      tag: "table",
      t: "updates border-collapse text-left",
      today: { file: UT, line: 47 },
      children: [
        {
          tag: "thead",
          today: "max-phone:hidden",
          children: [
            {
              tag: "tr",
              id: "update-head",
              t: "align-top",
              today: { file: UT, line: 50 },
              props: { variant: "stacks-ruled" },
              children: [
                {
                  tag: "th",
                  t: "h-auto px-[var(--space-4)] py-[var(--space-3)] text-meta",
                  today: { file: UT, line: 54 },
                  props: { variant: "matrix-corner" },
                  content: "Machine",
                },
              ],
            },
          ],
        },
        { tag: "tbody", children: [updateRow(1), updateRow(2)] },
      ],
    },
  },
  {
    // A generated view: its cells' hairline is the bottom side's only (R4).
    name: "ViewTable",
    file: VT,
    wrapper: {
      t: "ledger",
      now: "overflow-hidden rounded-lg bg-surface-raised shadow-tile",
      attrs: 'data-slot="ledger"',
    },
    table: {
      tag: "table",
      children: [
        {
          tag: "thead",
          children: [
            {
              tag: "tr",
              id: "view-band",
              t: "band border-0",
              today: { file: VT, line: 63 },
              props: { variant: "band" },
              children: [
                {
                  tag: "th",
                  id: "view-head",
                  today: { file: VT, line: 67 },
                  props: { variant: "caps-strong" },
                  content: "Name",
                },
              ],
            },
          ],
        },
        { tag: "tbody", children: [viewRow(1), viewRow(2)] },
      ],
    },
  },
  {
    // The routines ledger's head: today the hook `band` and this file's
    // `tr.band`/`tr.band th` rules draw it; K1's mapping is `variant="band"`
    // on the row and `caps` (with `h-c-toolbar-ctl`) on the heads, the two
    // rules gone.
    name: "ViewRoutinesHead",
    file: VR,
    k1Without: BAND_RULES,
    wrapper: {
      t: "ledger",
      now: "@container/routines-ledger",
      attrs: 'data-slot="ledger"',
      style:
        "--col-state: calc(var(--c-row-lead) + var(--space-3)); --col-menu: calc(var(--c-btn-h-sm) + var(--space-3) * 2)",
    },
    table: {
      tag: "table",
      t: "routines table-fixed",
      today: { file: VR, line: 918 },
      children: [
        {
          tag: "thead",
          children: [
            {
              tag: "tr",
              id: "routines-band",
              t: "band border-0",
              today: { file: VR, line: 922 },
              props: { variant: "band" },
              k1Drops: ["band"],
              children: [
                routinesHead(
                  "state",
                  924,
                  '<span class="sr-only">State</span>'
                ),
                routinesHead("name", undefined, "Routine"),
                routinesHead("last", 931, "Last run"),
                routinesHead(
                  "menu",
                  938,
                  '<span class="sr-only">Actions</span>'
                ),
              ],
            },
          ],
        },
        {
          tag: "tbody",
          t: "routine",
          today: "group",
          children: [
            {
              tag: "tr",
              t: "row",
              today: { file: VR, line: 724 },
              props: { variant: "unruled" },
              children: [{ tag: "td", t: "col-name", content: "A routine" }],
            },
          ],
        },
      ],
    },
  },
  {
    // The event sources' ledger: its head (the band mapping again), and two
    // rows, the second ruled above (`rule="top"`, today's `{rule}`).
    name: "ViewRoutinesSources",
    file: VR,
    k1Without: BAND_RULES,
    wrapper: {
      t: "ledger",
      now: "@container/routines-ledger",
      attrs: 'data-slot="ledger"',
      style: "--col-state: calc(var(--c-row-lead) + var(--space-3))",
    },
    table: {
      tag: "table",
      t: "quiet table-fixed",
      today: { file: VR, line: 971 },
      children: [
        {
          tag: "thead",
          children: [
            {
              tag: "tr",
              id: "sources-band",
              t: "band border-0",
              today: { file: VR, line: 974 },
              props: { variant: "band" },
              k1Drops: ["band"],
              children: [
                routinesHead(
                  "state",
                  976,
                  '<span class="sr-only">Service</span>'
                ),
                routinesHead("name", undefined, "Source"),
                routinesHead("last", 982, "Last read"),
              ],
            },
          ],
        },
        {
          tag: "tbody",
          t: "quiet",
          children: [sourceRow(1, ""), sourceRow(2, RULE)],
        },
      ],
    },
  },
];

type Side = "t" | "today" | "k1";

/** A node's classes on one side. */
function classesOf(node: Node, side: Side): string {
  if (side === "t") {
    return [T_BASE[node.tag], node.t ?? ""].join(" ").trim();
  }
  const raw =
    typeof node.today === "object"
      ? classesAt(node.today.file, node.today.line, node.today.fill)
      : (node.today ?? "");
  const consumer = [raw, node.added ?? ""].join(" ").trim();
  if (side === "today") {
    return cn(BASE[node.tag], consumer);
  }
  const recipe = RECIPE[node.tag];
  const drawn = recipe && node.props ? recipe(node.props) : BASE[node.tag];
  const own = new Set([...drawn.split(" "), ...(node.k1Drops ?? [])]);
  // The consumer keeps what the variant does not draw, and adds its mapping's own.
  const rest = [
    ...consumer.split(" ").filter((token) => token && !own.has(token)),
    node.k1Adds ?? "",
  ]
    .join(" ")
    .trim();
  return cn(drawn, rest || undefined);
}

function html(node: Node, side: Side, prefix: string): string {
  const id = node.id ? ` data-k="${prefix}:${node.id}"` : "";
  const inner =
    (node.children ?? []).map((child) => html(child, side, prefix)).join("") +
    (node.content ?? "");
  const style = node.style ? ` style="${node.style}"` : "";
  return `<${node.tag}${id} class="${classesOf(node, side)}"${style} ${node.attrs ?? ""}>${inner}</${node.tag}>`;
}

function sides(fixture: Fixture): string {
  return (["t", "today", "k1"] as const)
    .map((side) => {
      const wrap = `${side === "t" ? fixture.wrapper.t : fixture.wrapper.now} ${hash(fixture.name, side)}`;
      const table = html(fixture.table, side, `${fixture.name}:${side}`);
      return `<div class="${wrap}" ${fixture.wrapper.attrs ?? ""} style="${fixture.wrapper.style ?? ""}"><div data-slot="table-container" class="relative w-full overflow-x-auto">${table}</div></div>`;
    })
    .join("");
}

const body = FIXTURES.map(sides).join("");
const candidates = [
  ...new Set(
    body.match(/class="([^"]*)"/g)?.flatMap((c) => c.slice(7, -1).split(" ")) ??
      []
  ),
];
const compiler = await compile(readFileSync(join(app, "src/app.css"), "utf8"), {
  base: join(app, "src"),
  onDependency: () => undefined,
});
const utilities: string = compiler.build(candidates);
const sources = FIXTURES.flatMap((f) => [
  styleOf(f.name, f.file, "t"),
  styleOf(f.name, f.file, "today"),
  f.k1Without
    ? styleOf(f.name, f.file, "k1").replace(f.k1Without, "")
    : styleOf(f.name, f.file, "k1"),
]).join("\n");

/**
 * What the kit's modifiers write, and whether the box shows: padding, the
 * four sides' borders, display. Sizes are left to the 1a-against-K1 report:
 * they follow the consumer's layout (its inline `--col-w` and the like), which
 * the fixture does not carry, and no variant writes one.
 */
const BOX = /^((padding|border)-(top|right|bottom|left|inline|block)|display$)/;
const WIDTHS = [
  { name: "desk 1440", width: 1440, height: 900 },
  { name: "phone 390", width: 390, height: 844 },
];

const browser = await chromium.launch();
/** Every marked element's computed style, one page per width. */
const reads = await Promise.all(
  WIDTHS.map(async (view) => {
    const page = await browser.newPage({
      viewport: { width: view.width, height: view.height },
    });
    await page.setContent(
      `<!doctype html><html><head><style>${utilities}</style><style>${sources}</style></head><body>${body}</body></html>`,
      { waitUntil: "domcontentloaded" }
    );
    const read: Record<string, Record<string, string>> = await page.evaluate(
      () => {
        const out: Record<string, Record<string, string>> = {};
        for (const el of document.querySelectorAll("[data-k]")) {
          const style = getComputedStyle(el);
          const values: Record<string, string> = {};
          for (const name of style) {
            values[name] = style.getPropertyValue(name);
          }
          out[(el as HTMLElement).dataset.k ?? ""] = values;
        }
        return out;
      }
    );
    return { view, read };
  })
);
await browser.close();

let compared = 0;
let differ = 0;
let preexisting = 0;
/** A property K1 changes from 1a to a value that is not T's. */
const offT = new Set<string>();
const changed = new Map<string, Set<string>>();
for (const { view, read } of reads) {
  for (const key of Object.keys(read).filter((k) => k.includes(":k1:"))) {
    const [fixture, , el] = key.split(":");
    const k1 = read[key];
    const t = read[`${fixture}:t:${el}`];
    const today = read[`${fixture}:today:${el}`];
    compared += 1;
    const tDiffs = Object.keys(k1).filter((n) => BOX.test(n) && t[n] !== k1[n]);
    // K1's own: it changed the value from 1a and the value is not T's.
    const own = tDiffs.filter((n) => today[n] !== k1[n]);
    if (own.length > 0) {
      differ += 1;
      console.log(
        `DIFFER from T ${fixture} ${el} [${view.name}]: ${own.map((n) => `${n} ${t[n]} → ${k1[n]}`).join("; ")}`
      );
    }
    // 1a's already, K1 leaving it as 1a has it: the consumer's conversion.
    const before = tDiffs.filter((n) => today[n] === k1[n]);
    if (before.length > 0) {
      preexisting += 1;
      console.log(
        `as 1a (not K1's) ${fixture} ${el} [${view.name}]: ${before.map((n) => `${n} T ${t[n]}, 1a and K1 ${k1[n]}`).join("; ")}`
      );
    }
    const todayDiffs = Object.keys(k1).filter((n) => today[n] !== k1[n]);
    for (const n of todayDiffs) {
      const where = `${fixture} ${el} [${view.name}]`;
      if (!changed.has(where)) {
        changed.set(where, new Set());
      }
      changed.get(where)?.add(`${n} ${today[n]} → ${k1[n]} (T ${t[n]})`);
      // As the style snapshot measures (surfaces/read.ts PROPS): no custom
      // property, so Tailwind's own `--tw-*` plumbing is not a look.
      if (t[n] !== k1[n] && !n.startsWith("--")) {
        offT.add(`${where} ${n}: 1a ${today[n]}, K1 ${k1[n]}, T ${t[n]}`);
      }
    }
  }
}
for (const line of offT) {
  console.log(`K1 change off T, ${line}`);
}

for (const [where, props] of changed) {
  console.log(`K1 changes from 1a, ${where}: ${[...props].join("; ")}`);
}
console.log(
  `${compared} states, ${differ} differ from T on padding, border and display by K1's change; ${changed.size} states where K1 changes 1a, ${offT.size} of their changed properties not T's; ${preexisting} where 1a already differs from T and K1 keeps 1a's`
);
process.exit(differ ? 1 : 0);

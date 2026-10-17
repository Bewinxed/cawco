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
const GLOBAL = /:global\(([^)]*)\)/g;
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
function classesAt(file: string, line: number): string {
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
    .replace(INTERPOLATION, "")
    .replace(SPACES, " ")
    .trim();
}

/** A fixture's own scoping class, as Svelte gives each file its own hash. */
const hash = (name: string): string => `svelte-${name.toLowerCase()}`;

/** A consumer's `<style>` at T, unlayered, its scopes taking the file's hash. */
function tStyle(name: string, file: string, scopes: string[]): string {
  const source = execFileSync("git", ["show", `${T}:apps/dashboard/${file}`], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  let css = (source.match(STYLE)?.[1] ?? "")
    .replace(COMMENT, "")
    .replace(GLOBAL, "$1");
  for (const scope of scopes) {
    css = css.replaceAll(`.${scope}`, `.${scope}.${hash(name)}`);
  }
  return css;
}

interface Node {
  /** Classes set 2 adds to today's site (the orchestrator's addition). */
  added?: string;
  attrs?: string;
  children?: Node[];
  content?: string;
  id?: string;
  props?: Props;
  /** T's markup classes on top of T's base. */
  t?: string;
  tag: Tag;
  /** Today's consumer classes: a site, or a literal. */
  today?: { file: string; line: number } | string;
}
interface Fixture {
  /** The consumer's file, for its `<style>` at T. */
  file: string;
  name: string;
  scopes: string[];
  table: Node;
  wrapper: { t: string; now: string; attrs?: string; style?: string };
}

const tick = '<button role="checkbox" aria-checked="false">x</button>';
const TT = "src/lib/cawco/tasks/TaskTable.svelte";
const VR = "src/lib/cawco/views/ViewRoutines.svelte";
const PS = "src/lib/cawco/usage/ProjectSpend.svelte";
const UT = "src/lib/cawco/updates/UpdateTable.svelte";

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
      props: { variant: "ledger-picks" },
      content: "label",
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
    scopes: ["ledger"],
    wrapper: {
      t: "ledger",
      now: "group/ledger",
      attrs: 'data-pickable=""',
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
    scopes: ["ledger"],
    wrapper: { t: "ledger", now: "" },
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
    scopes: ["ledger"],
    wrapper: {
      t: "ledger",
      now: "",
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
    scopes: ["matrix"],
    wrapper: {
      t: "matrix",
      now: "",
      style: "--phone-cols: minmax(0, 1fr) auto",
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
];

type Side = "t" | "today" | "k1";

/** A node's classes on one side. */
function classesOf(node: Node, side: Side): string {
  if (side === "t") {
    return [T_BASE[node.tag], node.t ?? ""].join(" ").trim();
  }
  const raw =
    typeof node.today === "object"
      ? classesAt(node.today.file, node.today.line)
      : (node.today ?? "");
  const consumer = [raw, node.added ?? ""].join(" ").trim();
  if (side === "today") {
    return cn(BASE[node.tag], consumer);
  }
  const recipe = RECIPE[node.tag];
  if (!(recipe && node.props)) {
    return cn(BASE[node.tag], consumer);
  }
  const drawn = recipe(node.props);
  const own = new Set(drawn.split(" "));
  // The consumer keeps what the variant does not draw.
  const rest = consumer
    .split(" ")
    .filter((token) => token && !own.has(token))
    .join(" ");
  return cn(drawn, rest || undefined);
}

function html(node: Node, side: Side, prefix: string): string {
  const id = node.id ? ` data-k="${prefix}:${node.id}"` : "";
  const inner =
    (node.children ?? []).map((child) => html(child, side, prefix)).join("") +
    (node.content ?? "");
  return `<${node.tag}${id} class="${classesOf(node, side)}" ${node.attrs ?? ""}>${inner}</${node.tag}>`;
}

function sides(fixture: Fixture): string {
  return (["t", "today", "k1"] as const)
    .map((side) => {
      const wrap =
        side === "t"
          ? `${fixture.wrapper.t} ${hash(fixture.name)}`
          : fixture.wrapper.now;
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
const sources = FIXTURES.map((f) => tStyle(f.name, f.file, f.scopes)).join(
  "\n"
);

const BOX = /^(padding|border)-(top|right|bottom|left|inline|block)/;
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
    }
  }
}

for (const [where, props] of changed) {
  console.log(`K1 changes from 1a, ${where}: ${[...props].join("; ")}`);
}
console.log(
  `${compared} states, ${differ} differ from T on padding and border by K1's change; ${changed.size} states where K1 changes 1a; ${preexisting} where 1a already differs from T and K1 keeps 1a's`
);
process.exit(differ ? 1 : 0);

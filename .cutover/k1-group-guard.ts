// K1's group guard check: `rule="between"` draws
// `group-not-first/row:border-t group-not-first/row:border-t-border-hairline`,
// a look that needs a `group/row` ancestor. For each site that passes it
// (ActionsTable's cells), Chromium computes the cell with today's classes and
// with K1's, in every ancestor state: no `group/row`, the first `group/row`,
// a `group/row` after another. Every computed property must match.
//
//   bun .cutover/k1-group-guard.ts
//
// The stylesheet is the repo's Tailwind 4.3.3 over src/app.css, built for
// exactly the classes on the page; the class strings come from the kit's own
// `cn` and recipe, as in k1-exact.ts.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { plugin } from "bun";
import { chromium } from "playwright-core";

const root = resolve(import.meta.dir, "..");
const app = join(root, "apps/dashboard");

const RAW = /\?raw$/;
const ANY = /.*/;
const SVELTE = /\.svelte$/;
const MODULE_SCRIPT = /<script lang="ts" module>([\s\S]*?)<\/script>/;
const CLASS_ATTR = /class="([^"]*)"/;

plugin({
  name: "k1-group-guard",
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

const { cn } = await import(join(app, "src/lib/utils.ts"));
const { tableCellVariants } = await import(
  join(app, "src/lib/components/ui/table/table-cell.svelte")
);
const { compile } = await import(
  join(
    root,
    "node_modules/.bun/@tailwindcss+node@4.3.3/node_modules/@tailwindcss/node/dist/index.mjs"
  )
);

/** Today's TableCell base, before K1. */
const BASE = "whitespace-nowrap p-3 align-middle [&:has([role=checkbox])]:pr-0";
/** The classes the appendix lists for ActionsTable's cells (the variant's). */
const LISTED = new Set([
  "px-space-3",
  "py-space-2",
  "pe-0",
  "type-meta",
  "text-ink-muted",
  "group-not-first/row:border-t",
  "group-not-first/row:border-t-border-hairline",
]);

const file = "src/lib/cawco/routines/ActionsTable.svelte";
const source = readFileSync(join(app, file), "utf8").split("\n");
const sites = [
  { line: 123, props: { variant: "list-lead", rule: "between" } },
  { line: 132, props: { variant: "list", rule: "between" } },
  { line: 148, props: { variant: "list", rule: "between" } },
  { line: 154, props: { variant: "list", rule: "between" } },
].map(({ line, props }) => {
  const consumer = source[line - 1].match(CLASS_ATTR)?.[1] ?? "";
  const rest = consumer
    .split(" ")
    .filter((t) => t && !LISTED.has(t))
    .join(" ");
  return {
    site: `${file}:${line}`,
    today: cn(BASE, consumer) as string,
    k1: cn(tableCellVariants(props), rest) as string,
  };
});

const css = await compile(readFileSync(join(app, "src/app.css"), "utf8"), {
  base: join(app, "src"),
  onDependency: () => undefined,
});
const candidates = [
  ...new Set(
    sites
      .flatMap((s) => [...s.today.split(" "), ...s.k1.split(" ")])
      .concat("group/row")
  ),
];
const stylesheet: string = css.build(candidates);

/** The three ancestor states: the cell sits in the second row of each table. */
const STATES = {
  "no group/row ancestor": ["", ""],
  "first group/row": ["", "group/row"],
  "group/row after another": ["group/row", "group/row"],
} as const;

const tables = sites
  .flatMap((s, i) =>
    Object.entries(STATES).flatMap(([state, [firstRow, secondRow]], j) =>
      (["today", "k1"] as const).map(
        (side) => `
<table data-case="${i}-${j}-${side}"><tbody>
  ${state === "first group/row" ? "" : `<tr class="${firstRow}"><td>above</td></tr>`}
  <tr class="${secondRow}"><td data-target class="${s[side]}">cell</td></tr>
</tbody></table>`
      )
    )
  )
  .join("");

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(
  `<!doctype html><html><head><style>${stylesheet}</style></head><body>${tables}</body></html>`,
  { waitUntil: "domcontentloaded" }
);
const computed: Record<string, Record<string, string>> = await page.evaluate(
  () => {
    const out: Record<string, Record<string, string>> = {};
    for (const table of document.querySelectorAll("table[data-case]")) {
      const cell = table.querySelector("[data-target]");
      if (!cell) {
        continue;
      }
      const style = getComputedStyle(cell);
      const values: Record<string, string> = {};
      for (const name of style) {
        values[name] = style.getPropertyValue(name);
      }
      out[(table as HTMLElement).dataset.case ?? ""] = values;
    }
    return out;
  }
);
await browser.close();

let states = 0;
let differ = 0;
const lines: string[] = [];
sites.forEach((s, i) => {
  Object.keys(STATES).forEach((state, j) => {
    const today = computed[`${i}-${j}-today`];
    const k1 = computed[`${i}-${j}-k1`];
    states += 1;
    const diffs = Object.keys(today).filter((name) => today[name] !== k1[name]);
    if (diffs.length > 0) {
      differ += 1;
      lines.push(
        `DIFFER ${s.site} [${state}]: ${diffs.map((n) => `${n} ${today[n]} → ${k1[n]}`).join("; ")}`
      );
    }
    lines.push(
      `${s.site} [${state}]: border-top ${k1["border-top-width"]} ${k1["border-top-style"]} ${k1["border-top-color"]}, ${Object.keys(k1).length} properties`
    );
  });
});
for (const line of lines) {
  console.log(line);
}
console.log(`${states} states, ${differ} differ`);
process.exit(differ ? 1 : 0);

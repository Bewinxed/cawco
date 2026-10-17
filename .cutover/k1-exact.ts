// K1's exactness check: for every appendix site of the table parts, the part's
// class string with its variant equals today's (the part's base classes plus
// every class the consumer passes, through the kit's tailwind-merge). The
// consumer keeps the classes the appendix does not list for it.
//
//   bun .cutover/k1-exact.ts
//
// Each part's recipe is read from its own `<script module>`, and `cn` from
// src/lib/utils.ts, so the check runs the kit's code, not a copy of it. Two
// sides compare as class sets: order in the attribute draws nothing.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { plugin } from "bun";

const root = resolve(import.meta.dir, "..");
const app = join(root, "apps/dashboard");

const RAW = /\?raw$/;
const ANY = /.*/;
const SVELTE = /\.svelte$/;
const MODULE_SCRIPT = /<script lang="ts" module>([\s\S]*?)<\/script>/;
const PART_HEADING = /^### (<\w+>) \(/;
const TICKED = /`([^`]*)`/g;
const SPACES = /\s+/g;
const INTERPOLATION = /\{[^}]*\}/g;

plugin({
  name: "k1-exact",
  setup(build) {
    // Vite's `?raw` (utils.ts reads the token theme with it).
    build.onResolve({ filter: RAW }, (args) => ({
      path: resolve(dirname(args.importer), args.path.replace(RAW, "")),
      namespace: "raw",
    }));
    build.onLoad({ filter: ANY, namespace: "raw" }, (args) => ({
      contents: `export default ${JSON.stringify(readFileSync(args.path, "utf8"))};`,
      loader: "js",
    }));
    // A kit part: only its module script, where the recipe lives.
    build.onLoad({ filter: SVELTE }, (args) => {
      const source = readFileSync(args.path, "utf8");
      const module = source.match(MODULE_SCRIPT);
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

type Part = "<TableCell>" | "<TableHead>" | "<TableRow>" | "<Table>";
type Props = Record<string, string | boolean | undefined>;

/** Today's base classes, from origin's kit before K1 (the recipes' bases must equal them). */
const BASE = {
  "<TableCell>":
    "whitespace-nowrap p-3 align-middle [&:has([role=checkbox])]:pr-0",
  "<TableHead>":
    "h-12 whitespace-nowrap px-3 text-left align-middle text-ink-strong text-label [&:has([role=checkbox])]:pr-0",
  "<TableRow>": "border-b transition-colors data-[state=selected]:bg-neutral-2",
  table: "w-full caption-bottom text-body",
  container: "relative w-full overflow-x-auto",
};

// The appendix: site → part and the classes it lists.
const appendix = new Map<string, { part: Part; classes: string[] }>();
{
  let part: Part | null = null;
  for (const line of readFileSync(
    join(root, ".cutover/clearance.md"),
    "utf8"
  ).split("\n")) {
    const heading = line.match(PART_HEADING);
    if (heading) {
      part = (
        ["<TableCell>", "<TableHead>", "<TableRow>", "<Table>"] as string[]
      ).includes(heading[1])
        ? (heading[1] as Part)
        : null;
      continue;
    }
    if (part && line.startsWith("- ")) {
      const ticks = [...line.matchAll(TICKED)].map(([, t]) => t);
      appendix.set(ticks[0], { part, classes: ticks.slice(1) });
    }
  }
}

/** Classes set 2 adds to ProjectSpend's rows (the orchestrator's addition), which `stacks` draws. */
const SPEND_ROW_ADDED = [
  "max-phone:border-b",
  "max-phone:border-b-border-hairline",
];

/**
 * What a variant carries beyond its consumers' classes: the source's value
 * where, at ac7b79de8, the consumer's unlayered rule beat a kit base
 * modifier that now beats the consumer's utility (TableCell's and TableHead's
 * `[&:has([role=checkbox])]:pr-0`, TableBody's `[&_tr:last-child]:border-0`).
 * Today's side takes them too, so these are the only classes K1 adds; each is
 * proven against the source by .cutover/k1-modifiers.ts.
 */
const CARRY: Partial<Record<Part, Record<string, string>>> = {
  "<TableCell>": {
    "ledger-picks": "[&:has([role=checkbox])]:pr-space-3",
    "ledger-picks-stacks":
      "[&:has([role=checkbox])]:pr-space-3 max-phone:[&:has([role=checkbox])]:pr-0",
  },
  "<TableHead>": { caps: "[&:has([role=checkbox])]:pr-space-3" },
  "<TableRow>": {
    unruled: "[&:is(tbody>tr):last-child]:border-b-none",
    stacks: "max-phone:[&:is(tbody>tr):last-child]:border-b",
    "stacks-ruled": "max-phone:[&:is(tbody>tr):last-child]:border-b-none",
    "picks-stacks": "[&:is(tbody>tr):last-child]:border-b-none",
  },
};

/**
 * The class string at a site: the `attr="…"` value that starts on the line,
 * or the string literal the line opens (a branch of a `class={[…]}` list),
 * read across lines. `{…}` interpolations stay in it for the cases to fill.
 */
function classAt(site: string, attr = "class"): string {
  const [file, line] = site.split(":");
  const text = readFileSync(join(app, file), "utf8")
    .split("\n")
    .slice(Number(line) - 1)
    .join("\n");
  const [firstLine] = text.split("\n");
  const start = firstLine.includes(`${attr}="`)
    ? text.indexOf(`${attr}="`) + attr.length + 2
    : text.indexOf('"') + 1;
  return text.slice(start, text.indexOf('"', start)).replace(SPACES, " ");
}

/** Fills each `{…}` of a class string with the case's text, in order. */
function fill(value: string, subs: string[] = []): string {
  let i = 0;
  const out = value.replace(INTERPOLATION, () => {
    if (i >= subs.length) {
      throw new Error(`no fill for "${value}"`);
    }
    i += 1;
    return subs[i - 1];
  });
  if (i !== subs.length) {
    throw new Error(`fills left over for "${value}"`);
  }
  return out;
}

interface Case {
  props: Props;
  subs?: string[];
  value?: string;
}
interface Element {
  /** Classes the consumer adds by a later set's ruling. */
  added?: string[];
  /** The attribute the classes sit in (Table's scroller: `scrollClass`). */
  attr?: string;
  cases: Case[];
  /** Appendix rows that are fragments of this element's classes (a `{@const}`, a conditional's branch). */
  fragments?: string[];
  site: string;
}

const at = (file: string, lines: number[], props: Props): Element[] =>
  lines.map((line) => ({ site: `${file}:${line}`, cases: [{ props }] }));
const ruled = (
  file: string,
  lines: number[],
  fragment: string,
  variant: string
): Element[] =>
  lines.map((line) => ({
    site: `${file}:${line}`,
    fragments: [`${file}:${fragment}`],
    cases: [
      { subs: [""], props: { variant } },
      {
        subs: ["border-t border-t-border-hairline"],
        props: { variant, rule: "top" },
      },
    ],
  }));

const R = "src/lib/cawco/routines/ActionsTable.svelte";
const RD = "src/lib/cawco/routines/RoutineDetail.svelte";
const TT = "src/lib/cawco/tasks/TaskTable.svelte";
const TM = "src/lib/cawco/ToolMatrix.svelte";
const UT = "src/lib/cawco/updates/UpdateTable.svelte";
const PS = "src/lib/cawco/usage/ProjectSpend.svelte";
const VT = "src/lib/cawco/views/openui/ViewTable.svelte";
const VR = "src/lib/cawco/views/ViewRoutines.svelte";

const elements: Record<Part, Element[]> = {
  "<TableCell>": [
    ...at(R, [123], { variant: "list-lead", rule: "between" }),
    ...at(R, [132, 148, 154], { variant: "list", rule: "between" }),
    ...at(RD, [215, 226, 232, 238], { variant: "ledger", rule: "top" }),
    ...at(TT, [313, 315, 321, 323], { variant: "ledger-picks-stacks" }),
    ...at(TT, [317, 319], { variant: "ledger-picks" }),
    ...at(TM, [380], { variant: "matrix" }),
    ...at(UT, [107], { variant: "matrix-stacks" }),
    ...at(UT, [121], { variant: "matrix-stacks-under" }),
    ...at(
      PS,
      [
        503, 514, 520, 526, 537, 545, 549, 554, 591, 608, 616, 621, 635, 643,
        647, 652, 661, 669, 673, 678,
      ],
      { variant: "ledger-stacks" }
    ),
    {
      site: `${VT}:81`,
      fragments: [`${VT}:83`],
      cases: [
        { subs: [""], props: { variant: "view" } },
        {
          subs: ["min-w-(--first-min) py-space-2 whitespace-normal"],
          props: { variant: "view-lead" },
        },
      ],
    },
    ...ruled(VR, [726, 737, 780, 791, 803], "698", "list-opens"),
    ...ruled(VR, [992, 1000, 1017], "989", "list"),
    ...ruled(VR, [1040, 1048, 1065], "1036", "list"),
  ],
  "<TableHead>": [
    ...at(R, [93], { variant: "caps-lead" }),
    ...at(R, [97, 102, 107], { variant: "caps" }),
    ...at(RD, [186, 190, 194, 198], { variant: "caps" }),
    ...at(TT, [236, 238, 241], { variant: "caps" }),
    ...at(PS, [477, 481, 485, 490, 565, 569, 573, 578], { variant: "caps" }),
    ...at(VT, [67], { variant: "caps-strong" }),
    ...at(TM, [293], { variant: "matrix-corner-pinned" }),
    ...at(TM, [301], { variant: "matrix-column-wide-plain" }),
    ...at(TM, [352], { variant: "matrix-row-pinned" }),
    ...at(UT, [54], { variant: "matrix-corner" }),
    ...at(UT, [58], { variant: "matrix-column" }),
    ...at(UT, [62], { variant: "matrix-column-wide" }),
    ...at(UT, [80], { variant: "matrix-row" }),
  ],
  "<TableRow>": [
    ...at(R, [90], { variant: "band" }),
    ...at(RD, [182], { variant: "band" }),
    ...at(TT, [225], { variant: "band" }),
    ...at(PS, [474, 562], { variant: "band" }),
    ...at(VT, [63], { variant: "band" }),
    ...at(VR, [724, 990, 1038], { variant: "unruled" }),
    ...[500, 534, 588, 632, 658].map((line) => ({
      site: `${PS}:${line}`,
      added: SPEND_ROW_ADDED,
      cases: [{ props: { variant: "stacks" } }],
    })),
    ...at(UT, [50], { variant: "stacks-ruled" }),
    {
      site: `${UT}:73`,
      fragments: [`${UT}:75`],
      cases: [
        { subs: [""], props: { variant: "stacks-ruled" } },
        {
          subs: ["opacity-50"],
          props: { variant: "stacks-ruled", inactive: true },
        },
      ],
    },
    {
      // `class={online ? "" : "opacity-50"}`: the two branches.
      site: `${TM}:349`,
      cases: [
        { value: "", props: {} },
        { value: "opacity-50", props: { inactive: true } },
      ],
    },
    ...at(TT, [305], { variant: "picks-stacks" }),
  ],
  "<Table>": [
    ...at(TT, [220], { spacing: "gap" }),
    ...at(PS, [469], { spacing: "flush" }),
    {
      site: `${VT}:60`,
      attr: "scrollClass",
      cases: [{ props: { fadeEdges: true } }],
    },
  ],
};

const tokens = (value: string): string[] => value.split(" ").filter(Boolean);
const sameSet = (a: string, b: string): boolean =>
  [...new Set(tokens(a))].sort().join(" ") ===
  [...new Set(tokens(b))].sort().join(" ");

/** Today's and K1's class strings of one case; for Table, the slot the classes sit on. */
function render(
  part: Part,
  attr: string,
  consumer: string,
  rest: string,
  props: Props
) {
  if (part === "<Table>") {
    const slots = tableVariants(props);
    return attr === "scrollClass"
      ? {
          today: cn(BASE.container, consumer),
          k1: cn(slots.container(), rest || undefined),
        }
      : {
          today: cn(BASE.table, consumer),
          k1: cn(slots.table(), rest || undefined),
        };
  }
  const recipe = {
    "<TableCell>": tableCellVariants,
    "<TableHead>": tableHeadVariants,
    "<TableRow>": tableRowVariants,
  }[part];
  const carry = CARRY[part]?.[String(props.variant)];
  return {
    today: cn(BASE[part], consumer, carry),
    k1: cn(recipe(props), rest || undefined),
  };
}

let sites = 0;
let cases = 0;
const mismatches: string[] = [];
const covered = new Set<string>();

// The recipes' bases are today's bases.
for (const [part, recipe] of [
  ["<TableCell>", tableCellVariants],
  ["<TableHead>", tableHeadVariants],
  ["<TableRow>", tableRowVariants],
] as const) {
  if (!sameSet(recipe(), BASE[part])) {
    mismatches.push(`${part} base: "${recipe()}" ≠ "${BASE[part]}"`);
  }
}
for (const slot of ["table", "container"] as const) {
  if (!sameSet(tableVariants()[slot](), BASE[slot])) {
    mismatches.push(`<Table> ${slot} base: "${tableVariants()[slot]()}"`);
  }
}

for (const [part, list] of Object.entries(elements) as [Part, Element[]][]) {
  for (const element of list) {
    const own = appendix.get(element.site);
    if (!own || own.part !== part) {
      mismatches.push(`${element.site}: no ${part} row in the appendix`);
      continue;
    }
    covered.add(element.site);
    const listed = [...own.classes, ...(element.added ?? [])];
    for (const fragment of element.fragments ?? []) {
      const row = appendix.get(fragment);
      if (!row || row.part !== part) {
        mismatches.push(`${fragment}: no ${part} row in the appendix`);
        continue;
      }
      covered.add(fragment);
      listed.push(...row.classes);
    }
    const raw = element.cases.some((c) => c.value === undefined)
      ? classAt(element.site, element.attr)
      : "";
    const seen = new Set<string>();
    for (const c of element.cases) {
      const filled = c.value ?? fill(raw, c.subs);
      const consumer = [filled, ...(element.added ?? [])].join(" ").trim();
      const present = tokens(consumer);
      for (const t of present) {
        seen.add(t);
      }
      // The consumer keeps what the appendix does not list for it.
      const rest = present.filter((t) => !listed.includes(t)).join(" ");
      const { today, k1 } = render(
        part,
        element.attr ?? "class",
        consumer,
        rest,
        c.props
      );
      cases += 1;
      if (!sameSet(today, k1)) {
        mismatches.push(
          `${element.site} ${JSON.stringify(c.props)}\n  today: ${today}\n  k1:    ${k1}`
        );
      }
    }
    // Every listed class is one the consumer passes (a misread site would not be).
    for (const t of listed) {
      if (!seen.has(t)) {
        mismatches.push(
          `${element.site}: listed \`${t}\` is not in its classes`
        );
      }
    }
    sites += 1;
  }
}

/**
 * Rows the kit draws no variant for: `band` is ViewRoutines' own stylesheet
 * hook (`[data-slot="ledger"] :global(tr.band)`), not a class the kit may
 * carry (shadcn/no-unknown-classes). Set 4's ruling; .cutover/clearance/K1.md.
 */
const NO_VARIANT = [`${VR}:922`, `${VR}:974`];

const tableRows = [...appendix.keys()];
for (const site of tableRows) {
  if (!(covered.has(site) || NO_VARIANT.includes(site))) {
    mismatches.push(`${site}: appendix row not checked`);
  }
}

for (const m of mismatches) {
  console.log(m);
}
console.log(
  `${tableRows.length} appendix rows: ${covered.size} sites checked (${sites} elements, ${cases} cases), ${mismatches.length} mismatches; ${NO_VARIANT.length} with no kit variant (${NO_VARIANT.join(", ")})`
);
process.exit(mismatches.length ? 1 : 0);

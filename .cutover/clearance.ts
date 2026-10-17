/**
 * `bun .cutover/clearance.ts`: writes `.cutover/clearance.md`, the 1b cut.
 *
 * Reads `.cutover/ledger.md` (run `bun .cutover/ledger.ts` first): every
 * kind-5 declaration still in the tree and every `shadcn/no-restyle` message,
 * per file. Puts each file in exactly one set by its directory (SETS, first
 * match wins; a file no set takes stops the script), and prints each set's
 * files with their counts. The kit sets come first: a no-restyle hit is a
 * consumer's class on a kit part, cleared by a variant or prop the kit part
 * gains, so the appendix lists each kit part's hits by consumer site.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const LEDGER = join(ROOT, ".cutover", "ledger.md");
const OUT = join(ROOT, ".cutover", "clearance.md");
const TOKENS = join(
  ROOT,
  "apps",
  "dashboard",
  "src",
  "lib",
  "tokens",
  "tokens.css"
);

/** One 1b lane's files. */
interface LaneSet {
  id: string;
  name: string;
  /** A kit set: the kit parts whose consumer hits it makes variants for. */
  owns?: (part: string) => boolean;
  takes: (file: string) => boolean;
}

const under =
  (...dirs: string[]) =>
  (file: string) =>
    dirs.some((dir) => file.startsWith(`src/${dir}/`));
const TOP = "src/lib/cawco/";
const top =
  (...names: string[]) =>
  (file: string) =>
    names.some((name) => file === `${TOP}${name}.svelte`);
const SHELL_FAMILY = [
  "GlassCard",
  "NeedsCaw",
  "OlderRows",
  "ScreenEdges",
  "SessionHover",
  "SessionPane",
  "SessionRow",
  "SessionSurface",
  "Shell",
  "Sidebar",
  "TaskRing",
  "ThreadPane",
  "TreeCount",
  "TreeMark",
];

const SETS: LaneSet[] = [
  {
    id: "K1",
    name: "kit: the table parts",
    takes: under("lib/components/ui/table"),
    owns: (part) => part.startsWith("Table"),
  },
  {
    id: "K2",
    name: "kit: every other part",
    takes: under("lib/components/ui"),
    owns: (part) => !part.startsWith("Table"),
  },
  { id: "1", name: "transcript", takes: under("lib/cawco/transcript") },
  { id: "2", name: "usage", takes: under("lib/cawco/usage") },
  { id: "3", name: "tasks", takes: under("lib/cawco/tasks") },
  {
    id: "4",
    name: "routines and views",
    takes: under("lib/cawco/routines", "lib/cawco/views"),
  },
  {
    id: "5",
    name: "home, workspace, side, project, preview, plan",
    takes: under(
      "lib/cawco/home",
      "lib/cawco/workspace",
      "lib/cawco/side",
      "lib/cawco/project",
      "lib/cawco/preview",
      "lib/cawco/plan"
    ),
  },
  {
    id: "6",
    name: "cawco top level: the shell, sidebar and session rows",
    takes: top(...SHELL_FAMILY),
  },
  {
    id: "7",
    name: "cawco top level: everything else",
    takes: (file) =>
      file.startsWith(TOP) &&
      !file.slice(TOP.length).includes("/") &&
      !top(...SHELL_FAMILY)(file),
  },
  {
    id: "8",
    name: "config, updates, accounts, spawn",
    takes: under(
      "lib/cawco/config",
      "lib/cawco/updates",
      "lib/cawco/accounts",
      "lib/cawco/spawn"
    ),
  },
  {
    id: "9",
    name: "routes, features, decisions and the small cawco folders",
    takes: under(
      "routes",
      "lib/components/features",
      "lib/cawco/decisions",
      "lib/cawco/blocks",
      "lib/cawco/canvas",
      "lib/cawco/find",
      "lib/cawco/join",
      "lib/cawco/motion",
      "lib/cawco/move"
    ),
  },
];

interface Hit {
  line: number;
  text: string;
}
interface Restyle extends Hit {
  cls: string;
  part: string;
}

const kind5 = new Map<string, Hit[]>();
const restyle = new Map<string, Restyle[]>();
{
  let section = "";
  let file = "";
  for (const line of readFileSync(LEDGER, "utf8").split("\n")) {
    if (line.startsWith("## ")) {
      section = line;
      continue;
    }
    const head = /^### (\S+) \(\d+\)$/.exec(line);
    if (head) {
      [, file] = head;
      continue;
    }
    if (section.startsWith("## Kind-5")) {
      const m = /^- :(\d+) `(.*)`$/.exec(line);
      if (m) {
        kind5.set(file, [
          ...(kind5.get(file) ?? []),
          { line: Number(m[1]), text: m[2] },
        ]);
      }
    } else if (section.startsWith("## ESLint")) {
      const m =
        /^- :(\d+) shadcn\/no-restyle · "([^"]+)" is not allowed on <([^>]+)>/.exec(
          line
        );
      if (m) {
        restyle.set(file, [
          ...(restyle.get(file) ?? []),
          { line: Number(m[1]), text: line, cls: m[2], part: m[3] },
        ]);
      }
    }
  }
}

const files = [...new Set([...kind5.keys(), ...restyle.keys()])].sort();
const setOf = new Map<string, LaneSet>();
for (const file of files) {
  const set = SETS.find((s) => s.takes(file));
  if (!set) {
    throw new Error(`no set takes ${file}`);
  }
  setOf.set(file, set);
}

// The transition tokens, by value, for the kind-5 transitions that have one.
const tokenCss = readFileSync(TOKENS, "utf8");
const tokens = new Map<string, string>();
for (const m of tokenCss.matchAll(/(--transition-[a-z-]+):\s*([^;]+);/g)) {
  if (!tokens.has(m[1])) {
    tokens.set(m[1], m[2].replace(/\s+/g, " ").trim());
  }
}
const control = tokens.get("--transition-control") ?? "";
const norm = (v: string) =>
  v
    .replace(/var\(--transition-control\)/g, control)
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .trim();
const tokenOf = new Map(
  [...tokens].map(([name, value]) => [norm(value), name.slice(2)])
);

/** What a kind-5 transition becomes: its token, `transition-off`, or the list form the rules give. */
function utilityFor(t: { text: string; token?: string }): string {
  if (t.token) {
    return `\`${t.token}\``;
  }
  const value = t.text.slice("transition: ".length).trim();
  if (value === "none") {
    return "`transition-off`";
  }
  if (value === "var(--step-aside)") {
    return "`transition-fade-show` (the value Composer sets `--step-aside` to)";
  }
  return "no token: `transition-[…]` with `duration-(--…)`/`ease-(--…)` lists set on the element, or one duration and easing as the lane rule writes it (“Transitions” above)";
}

const count = (file: string) => [
  kind5.get(file)?.length ?? 0,
  restyle.get(file)?.length ?? 0,
];
const sum = (list: string[]) =>
  list.reduce(
    (acc, file) => {
      const [k, r] = count(file);
      return [acc[0] + k, acc[1] + r];
    },
    [0, 0]
  );

const byPart = new Map<string, { file: string; line: number; cls: string }[]>();
for (const [file, hits] of restyle) {
  for (const h of hits) {
    byPart.set(h.part, [
      ...(byPart.get(h.part) ?? []),
      { file, line: h.line, cls: h.cls },
    ]);
  }
}
const partsOf = (set: LaneSet) =>
  set.owns ? [...byPart].filter(([part]) => set.owns?.(part)) : [];
const partHits = (set: LaneSet) =>
  partsOf(set).reduce((n, [, hits]) => n + hits.length, 0);

const md: string[] = [];
const total = sum(files);
md.push("# 1b clearance cut");
md.push("");
md.push(
  `Generated by \`bun .cutover/clearance.ts\` from \`.cutover/ledger.md\`. What 1a leaves: ${total[0]} kind-5 declarations (\`bun scripts/style-residual-check.ts --list\`) and ${total[1]} \`shadcn/no-restyle\` messages (\`cd apps/dashboard && bunx eslint src\`), in ${files.length} files. Every other ESLint rule is at 0. Sites are relative to \`apps/dashboard/\`.`
);
md.push("");
md.push(
  readFileSync(join(ROOT, ".cutover", "clearance-rules.md"), "utf8").trimEnd()
);
md.push("");
md.push("## The sets");
md.push("");
md.push(
  "| set | what | files | kind-5 | no-restyle in its files | consumer hits it makes kit variants for |"
);
md.push("|---|---|---|---|---|---|");
for (const set of SETS) {
  const mine = files.filter((f) => setOf.get(f) === set);
  const [k, r] = sum(mine);
  md.push(
    `| ${set.id} | ${set.name} | ${mine.length} | ${k} | ${r} | ${set.owns ? `${partHits(set)} on ${partsOf(set).length} parts` : "—"} |`
  );
}
md.push(`| | all | ${files.length} | ${total[0]} | ${total[1]} | |`);
for (const set of SETS) {
  const mine = files.filter((f) => setOf.get(f) === set);
  const [k, r] = sum(mine);
  md.push("");
  md.push(
    `### Set ${set.id}: ${set.name} (${mine.length} files, ${k} kind-5, ${r} no-restyle)`
  );
  if (set.owns) {
    md.push("");
    md.push(
      `Kit variants for ${partHits(set)} consumer hits: ${partsOf(set)
        .sort((a, b) => b[1].length - a[1].length)
        .map(([part, hits]) => `<${part}> ${hits.length}`)
        .join(", ")} (the appendix lists each site and its classes).`
    );
  }
  if (mine.length > 0) {
    md.push("");
    md.push("| file | kind-5 | no-restyle |");
    md.push("|---|---|---|");
  }
  for (const file of mine) {
    const [fk, fr] = count(file);
    md.push(`| \`${file}\` | ${fk} | ${fr} |`);
  }
  const transitions = mine.flatMap((file) =>
    (kind5.get(file) ?? [])
      .filter((h) => h.text.startsWith("transition: "))
      .map((h) => ({
        file,
        ...h,
        token: tokenOf.get(norm(h.text.slice("transition: ".length))),
      }))
  );
  if (transitions.length > 0) {
    md.push("");
    md.push("Its kind-5 transitions:");
    md.push("");
    for (const t of transitions) {
      md.push(`- \`${t.file}:${t.line}\` → ${utilityFor(t)} (\`${t.text}\`)`);
    }
  }
}
md.push("");
md.push("## Appendix: the no-restyle hits by kit part");
md.push("");
md.push(
  "Each kit part, its hits, and each consumer site with the classes it passes that the part's recipe should own. Sites are the line ESLint reports."
);
for (const [part, hits] of [...byPart].sort(
  (a, b) => b[1].length - a[1].length
)) {
  md.push("");
  md.push(`### <${part}> (${hits.length})`);
  md.push("");
  const bySite = new Map<string, string[]>();
  for (const h of hits) {
    const site = `${h.file}:${h.line}`;
    bySite.set(site, [...(bySite.get(site) ?? []), h.cls]);
  }
  for (const [site, classes] of bySite) {
    md.push(
      `- \`${site}\` (set ${setOf.get(site.replace(/:\d+$/, ""))?.id}): ${classes.map((c) => `\`${c}\``).join(" ")}`
    );
  }
}
writeFileSync(OUT, `${md.join("\n")}\n`);
for (const set of SETS) {
  const mine = files.filter((f) => setOf.get(f) === set);
  const [k, r] = sum(mine);
  console.log(
    `${set.id.padEnd(3)} ${String(mine.length).padStart(3)} files  ${String(k).padStart(4)} kind-5  ${String(r).padStart(5)} no-restyle${set.owns ? `  (${partHits(set)} kit hits)` : ""}  ${set.name}`
  );
}
console.log(
  `all ${files.length} files  ${total[0]} kind-5  ${total[1]} no-restyle`
);
console.log(`wrote ${OUT}`);

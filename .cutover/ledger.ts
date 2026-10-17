/**
 * `bun .cutover/ledger.ts [--eslint <eslint.json>] [--baseline]`
 *
 * The cutover's one ledger: every line the lanes declared in
 * `.cutover/lanes/<lane>.md` (in the fixed line forms of deltas O–R), every
 * kind-5 (`unmapped`) declaration still in the tree, and every ESLint message
 * over apps/dashboard/src, each with its site and, for lane lines, its lane.
 * Writes `.cutover/ledger.md` and prints the counts by kind.
 *
 *   --eslint <file>   read `bunx eslint -f json src` output from a file instead of running ESLint
 *   --baseline        record these counts as the merge-time column (`.cutover/ledger-merge-counts.json`)
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const DASHBOARD = join(ROOT, "apps", "dashboard");
const LANES = join(ROOT, ".cutover", "lanes");
const OUT = join(ROOT, ".cutover", "ledger.md");
const BASELINE = join(ROOT, ".cutover", "ledger-merge-counts.json");
const NOTES = join(ROOT, ".cutover", "ledger-notes.md");

/** The lane-file line forms, in the order the ledger lists them. */
const FORMS = [
  "needs colour token",
  "needs size token",
  "needs transition token",
  "needs variant",
  "cross-file hook",
  "contract",
  "deferred-file",
  "shadcn variant",
  "important kept",
  "shadow kept residual",
  "R2 fixed",
  "R3 fixed",
] as const;
type Form = (typeof FORMS)[number];

const LINE = new RegExp(
  `^\\s*(?:[-*]\\s+)?\`?(${FORMS.map((f) => f.replace(/ /g, "\\s")).join("|")}):\\s*(.*?)\`?\\s*$`
);
/** The first source site a line names: a path (repository-relative or bare file name) and maybe a line. */
const SITE =
  /((?:[\w@+-]|\([\w-]+\)|\[[\w-]+\])(?:[\w./@+-]|\([\w-]+\)|\[[\w-]+\])*\.(?:svelte|ts|css))(?::(\d+))?/;
/** A lane's "nothing of this kind" line, which declares nothing. */
const NONE = /^\(?none\b/i;
const DASHBOARD_PREFIX = /^apps\/dashboard\//;
const SPACE = /\s/g;
const SPACES = /\s+/g;
/** `style-residual-check.ts --list`'s line for one unmapped declaration. */
const UNMAPPED_LINE = /^ {2}unmapped (\S+):(\d+) {2}(.*)$/;
/** The rule's closing reminder, the same on every message. */
const DESIGN_TAIL = / ?DESIGN\.md is law;.*$/;

interface LaneLine {
  form: Form;
  lane: string;
  laneLine: number;
  site: string;
  text: string;
}

function laneLines(): LaneLine[] {
  const out: LaneLine[] = [];
  for (const name of readdirSync(LANES).sort()) {
    if (!name.endsWith(".md")) {
      continue;
    }
    const lane = name.slice(0, -3);
    const lines = readFileSync(join(LANES, name), "utf8").split("\n");
    lines.forEach((raw, index) => {
      const match = raw.match(LINE);
      if (!match) {
        return;
      }
      const form = match[1]?.replace(SPACE, " ") as Form;
      const text = (match[2] ?? "").trim();
      if (NONE.test(text)) {
        return;
      }
      const site = text.match(SITE);
      out.push({
        form,
        lane,
        laneLine: index + 1,
        site: site
          ? `${site[1]?.replace(DASHBOARD_PREFIX, "")}${site[2] ? `:${site[2]}` : ""}`
          : "",
        text,
      });
    });
  }
  return out;
}

interface Unmapped {
  file: string;
  line: number;
  text: string;
}

function unmappedDeclarations(): Unmapped[] {
  const run = Bun.spawnSync(
    ["bun", "scripts/style-residual-check.ts", "--list"],
    { cwd: ROOT, stdout: "pipe", stderr: "pipe" }
  );
  const out: Unmapped[] = [];
  for (const line of run.stdout.toString().split("\n")) {
    const match = line.match(UNMAPPED_LINE);
    if (match) {
      out.push({
        file: (match[1] ?? "").replace(DASHBOARD_PREFIX, ""),
        line: Number(match[2]),
        text: match[3] ?? "",
      });
    }
  }
  return out;
}

interface Message {
  file: string;
  line: number;
  message: string;
  rule: string;
}

function eslintMessages(from: string | undefined): Message[] {
  let json: string;
  if (from) {
    json = readFileSync(from, "utf8");
  } else {
    const run = Bun.spawnSync(["bunx", "eslint", "-f", "json", "src"], {
      cwd: DASHBOARD,
      stdout: "pipe",
      stderr: "pipe",
    });
    json = run.stdout.toString();
  }
  const results = JSON.parse(json) as {
    filePath: string;
    messages: { line: number; message: string; ruleId: string | null }[];
  }[];
  const out: Message[] = [];
  for (const result of results) {
    for (const m of result.messages) {
      out.push({
        file: result.filePath.replace(`${DASHBOARD}/`, ""),
        line: m.line,
        message: m.message.replace(DESIGN_TAIL, "").replace(SPACES, " ").trim(),
        rule: m.ruleId ?? "fatal",
      });
    }
  }
  return out;
}

const args = process.argv.slice(2);
const eslintAt = args.indexOf("--eslint");
const eslintFile = eslintAt >= 0 ? args[eslintAt + 1] : undefined;

const lanes = laneLines();
const unmapped = unmappedDeclarations();
const messages = eslintMessages(eslintFile);

const counts: Record<string, number> = {};
for (const form of FORMS) {
  counts[`lane: ${form}`] = lanes.filter((l) => l.form === form).length;
}
counts["tree: kind-5 declarations"] = unmapped.length;
counts["tree: files with kind-5"] = new Set(unmapped.map((u) => u.file)).size;
for (const rule of [...new Set(messages.map((m) => m.rule))].sort()) {
  counts[`eslint: ${rule}`] = messages.filter((m) => m.rule === rule).length;
}
counts["eslint: files with no-restyle"] = new Set(
  messages.filter((m) => m.rule === "shadcn/no-restyle").map((m) => m.file)
).size;

if (args.includes("--baseline")) {
  writeFileSync(BASELINE, `${JSON.stringify(counts, null, 2)}\n`);
}
const merge: Record<string, number> = existsSync(BASELINE)
  ? JSON.parse(readFileSync(BASELINE, "utf8"))
  : {};

const md: string[] = [];
md.push("# Cutover ledger");
md.push("");
md.push(
  "Generated by `bun .cutover/ledger.ts`: every line the lanes declared in `.cutover/lanes/*.md`, every kind-5 declaration still in the tree (`bun scripts/style-residual-check.ts --list`), and every ESLint message over `apps/dashboard/src`. Sites are relative to `apps/dashboard/`; a lane line's own place is `<lane>:<line>` in `.cutover/lanes/`. Resolutions are recorded in `.cutover/resolved.md`."
);
md.push("");
// The notes that are no count: the base of record, what main changed, the
// rulings and the kit's insets. The base of record leads the ledger.
if (existsSync(NOTES)) {
  md.push(readFileSync(NOTES, "utf8").trimEnd());
  md.push("");
}
md.push("## Counts");
md.push("");
md.push("| kind | at merge | now |");
md.push("|---|---|---|");
for (const key of [
  ...new Set([...Object.keys(merge), ...Object.keys(counts)]),
]) {
  md.push(`| ${key} | ${merge[key] ?? "—"} | ${counts[key] ?? 0} |`);
}
md.push("");
md.push("## Lane lines, by kind");
for (const form of FORMS) {
  const rows = lanes.filter((l) => l.form === form);
  md.push("");
  md.push(`### ${form} (${rows.length})`);
  md.push("");
  for (const row of rows) {
    md.push(
      `- \`${row.site || "—"}\` · ${row.lane}:${row.laneLine} · ${row.text.replace(/\|/g, "\\|")}`
    );
  }
}
md.push("");
md.push(`## Kind-5 declarations in the tree (${unmapped.length})`);
const byFile = new Map<string, Unmapped[]>();
for (const u of unmapped) {
  byFile.set(u.file, [...(byFile.get(u.file) ?? []), u]);
}
for (const [file, rows] of [...byFile].sort((a, b) =>
  a[0].localeCompare(b[0])
)) {
  md.push("");
  md.push(`### ${file} (${rows.length})`);
  md.push("");
  for (const row of rows) {
    md.push(`- :${row.line} \`${row.text}\``);
  }
}
md.push("");
md.push(`## ESLint messages in the tree (${messages.length})`);
const msgByFile = new Map<string, Message[]>();
for (const m of messages) {
  msgByFile.set(m.file, [...(msgByFile.get(m.file) ?? []), m]);
}
for (const [file, rows] of [...msgByFile].sort((a, b) =>
  a[0].localeCompare(b[0])
)) {
  md.push("");
  md.push(`### ${file} (${rows.length})`);
  md.push("");
  for (const row of rows) {
    md.push(`- :${row.line} ${row.rule} · ${row.message}`);
  }
}
writeFileSync(OUT, `${md.join("\n")}\n`);

const width = Math.max(...Object.keys(counts).map((k) => k.length));
for (const [key, value] of Object.entries(counts)) {
  console.log(
    `${key.padEnd(width)}  ${String(merge[key] ?? "—").padStart(5)}  ${String(value).padStart(5)}`
  );
}
console.log(`wrote ${OUT}`);

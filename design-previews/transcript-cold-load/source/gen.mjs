// The demo's conversation: 720 blocks written from this repository's own
// text. Assistant prose from real commit bodies and the docs (lists, tables,
// headings), code from real source files, tool calls on real paths, the
// reader's turns from real commit subjects. Seeded: every run writes the
// same blocks. Writes src/rows.json.
//
//   node gen.mjs <repo root> [count]
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { marked } from "marked";

const REPO = process.argv[2];
const TOTAL = Number(process.argv[3] ?? 720);

let state = 0x2f6b1d93;
const rnd = () => {
  state = (state * 1103515245 + 12345) % 2147483648;
  return state / 2147483648;
};
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

const git = (...args) =>
  execFileSync("git", ["-C", REPO, ...args], {
    encoding: "utf8",
    maxBuffer: 1 << 28,
  });

const commits = git("log", "-n", "1500", "--format=%s%x1f%b%x1e", "b7b06ab9a")
  .split("\x1e")
  .map((c) => c.trim())
  .filter(Boolean)
  .map((c) => {
    const [subject, body = ""] = c.split("\x1f");
    return {
      subject: subject.trim(),
      body: body.replace(/Co-Authored-By:.*$/gim, "").trim(),
    };
  })
  .filter((c) => c.body.length > 200);

const docSections = ["DESIGN.md", "JOURNEY.md", "PRODUCT.md", "ARCHITECTURE.md", "WORDS.md"]
  .flatMap((f) => readFileSync(join(REPO, f), "utf8").split(/\n(?=##+ )/))
  .filter((s) => s.length > 300 && s.length < 6000);

const files = git("ls-files", "apps/dashboard/src", "packages/core/src", "packages/hub/src")
  .split("\n")
  .filter((f) => /\.(ts|svelte)$/.test(f));
const sources = new Map();
const sourceOf = (f) => {
  if (!sources.has(f)) {
    sources.set(f, readFileSync(join(REPO, f), "utf8").split("\n"));
  }
  return sources.get(f);
};

const WORDS = ["restore", "holdPlace", "shift", "cursor", "readOlderPage", "landing"];
const TOOLS = [
  (f) => ["Read", f],
  (f) => ["Edit", f],
  (f) => ["Search", `"${pick(WORDS)}" in ${f}`],
  (f) => ["Run", `cd ${f.split("/").slice(0, 2).join("/")} && bun run check`],
  () => ["Run", "git status --porcelain"],
];

const rows = [];
let n = 0;
/** The speaker of the row before, so a run of one speaker carries its name once. */
let speaker = null;
let railBefore = false;
const push = (row) => {
  const who = row.kind === "tool" || row.kind === "thinking" ? null : row.kind === "user" ? "you" : "agent";
  const rail = who === null;
  rows.push({
    key: `b-${n++}`,
    ...row,
    who: who !== null && who !== speaker ? who : null,
    railStart: rail && !railBefore,
  });
  if (who !== null) speaker = who;
  railBefore = rail;
};

while (rows.length < TOTAL) {
  const c = pick(commits);
  push({ kind: "user", html: marked.parseInline(c.subject) });
  const items = between(3, 16);
  for (let i = 0; i < items && rows.length < TOTAL; i++) {
    const r = rnd();
    if (r < 0.5) {
      const [verb, arg] = pick(TOOLS)(pick(files));
      push({ kind: "tool", verb, arg });
    } else if (r < 0.62) {
      push({ kind: "thinking", verb: "Thought", arg: `for ${between(2, 48)}s` });
    } else if (r < 0.85) {
      const prose = rnd() < 0.7 ? pick(commits).body : pick(docSections);
      const paras = prose.split(/\n\n/);
      const take = paras.slice(0, between(1, Math.min(paras.length, 6))).join("\n\n");
      push({ kind: "text", html: marked.parse(take) });
    } else {
      const f = pick(files);
      const lines = sourceOf(f);
      const len = between(6, 70);
      const at = between(0, Math.max(0, lines.length - len));
      const code = lines.slice(at, at + len).join("\n");
      const lang = f.endsWith(".svelte") ? "svelte" : "ts";
      push({
        kind: "text",
        html: marked.parse(`In \`${f}\`, lines ${at + 1}–${at + len}:\n\n\`\`\`${lang}\n${code}\n\`\`\``),
      });
    }
  }
}

writeFileSync(new URL("./src/rows.json", import.meta.url), JSON.stringify(rows));
const kinds = {};
for (const r of rows) kinds[r.kind] = (kinds[r.kind] ?? 0) + 1;
console.log(rows.length, "rows", JSON.stringify(kinds));

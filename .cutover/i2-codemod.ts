/**
 * `bun .cutover/i2-codemod.ts`: the foundation's vocab-codemod, proven value
 * for value against ac7b79de8. Its run (fe99827eb) rewrote T's Tailwind
 * defaults and shadcn bridge names in markup; every other step of the cutover
 * started from what it wrote. For each class the run took out of a hunk:
 * - its rewrite is re-derived from the codemod's own tables (i2-vocab.ts)
 *   and must be among the classes the same hunk put in, so the derivation is
 *   the codemod's;
 * - each distinct rewrite is compared on bare elements (i2-bare.ts).
 * A lost-breakpoint twin the run dropped is listed (each is an i2-exact.ts
 * case), and so is any class the run removed that the derivation does not
 * account for.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { compareBare } from "./i2-bare";
import { T_DIR } from "./i2-tree";
import { LOST_BREAKPOINTS, MAX, parts, rewrite } from "./i2-vocab";

const RUN = "fe99827eb";
const root = resolve(import.meta.dir, "..");
const app = join(root, "apps/dashboard");
const tApp = join(T_DIR, "apps/dashboard");
const viteRequire = createRequire(
  join(app, "node_modules/@tailwindcss/vite/package.json")
);
const tailwind = await import(
  pathToFileURL(viteRequire.resolve("@tailwindcss/node")).href
);
const TOKEN_SPLIT = /[\s"'`]+/;
const EDGES = /^[{(]+|[})>,;]+$/;

// The run's hunks: the classes each took out and put in.
const diff = execFileSync(
  "git",
  [
    "-C",
    root,
    "show",
    RUN,
    "--format=",
    "--unified=0",
    "--",
    "apps/dashboard/src",
  ],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
);
const hunks: { file: string; removed: string[]; added: Set<string> }[] = [];
let file = "";
for (const line of diff.split("\n")) {
  if (line.startsWith("+++ ")) {
    file = line.slice(6);
  } else if (line.startsWith("@@")) {
    hunks.push({ added: new Set(), file, removed: [] });
  } else if (
    hunks.length &&
    (line[0] === "-" || line[0] === "+") &&
    !line.startsWith("---")
  ) {
    const tokens = line
      .slice(1)
      .split(TOKEN_SPLIT)
      .map((t) => t.replace(EDGES, ""))
      .filter(Boolean);
    const hunk = hunks.at(-1);
    if (line[0] === "-") {
      hunk?.removed.push(...tokens);
    } else {
      for (const t of tokens) {
        hunk?.added.add(t);
      }
    }
  }
}

const tDs = await tailwind.__unstable__loadDesignSystem(
  readFileSync(join(tApp, "src/app.css"), "utf8"),
  { base: join(tApp, "src") }
);
// Classes a rewritten line kept but the formatter moved to another hunk.
const added = new Set(hunks.flatMap((h) => [...h.added]));

const pairs = new Map<string, string>();
const dropped: string[] = [];
const unexplained: string[] = [];
for (const h of hunks) {
  for (const r of h.removed) {
    if (h.added.has(r) || !tDs.candidatesToCss([r])[0]) {
      continue;
    }
    const w = rewrite(r);
    if (w !== r && (h.added.has(w) || added.has(w))) {
      pairs.set(r, w);
    } else if (
      w !== r &&
      parts(r).variants.some((v) => LOST_BREAKPOINTS[v.replace(MAX, "")])
    ) {
      dropped.push(
        `${h.file}: ${r} (its twin ${parts(r).base} stands unconditionally beside it)`
      );
    } else if (!added.has(r)) {
      unexplained.push(`${h.file}: ${r}`);
    }
  }
}

const { differ, states } = await compareBare(
  [...pairs].map(([from, to]) => ({ from, label: `${from} → ${to}`, to }))
);
for (const line of [
  ...differ,
  ...dropped.map((d) => `DROPPED ${d}`),
  ...unexplained.map((u) => `UNEXPLAINED ${u}`),
]) {
  console.log(line);
}
console.log(
  `i2-codemod: ${hunks.length} hunks; ${pairs.size} distinct rewrites, ${states} states, ${differ.length} differ; ${dropped.length} dropped twins; ${unexplained.length} unexplained`
);
process.exit(differ.length || unexplained.length ? 1 : 0);

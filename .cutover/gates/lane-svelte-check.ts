// The lanes' svelte-check gate (deltas P and Q). Run from the repository root,
// bare: it takes the shared build lock itself, so wrapping it in `flock` on the
// same lock waits forever.
//   L=<lane> bun .cutover/gates/lane-svelte-check.ts
// svelte-check runs over the whole dashboard under the shared build lock; the
// gate fails on any error, and on any "Unused CSS selector" warning, in the
// lane's own files. An unused selector is a declaration Svelte pruned, so the
// page silently loses it (a residual aimed at a child component's root).
import { loadLane, reportList } from "./lane-list.ts";

const lane = loadLane();
const listOk = reportList(lane);
const list = new Set(lane.dashboardSrc.map((path) => path.replace(/^apps\/dashboard\//, "")));
const lock = "/home/bewinxed/.cawco/workspace-cache/xdg/tailwind-landing-build.lock";

const sync = Bun.spawnSync(["flock", lock, "bunx", "svelte-kit", "sync"], {
  cwd: "apps/dashboard",
  stdout: "pipe",
  stderr: "pipe",
});
if (sync.exitCode !== 0) {
  console.log(sync.stderr.toString().slice(-1500));
  console.log("svelte-kit-sync-failed");
  process.exit(1);
}
const run = Bun.spawnSync(
  ["flock", lock, "bunx", "svelte-check", "--output", "machine", "--tsconfig", "./tsconfig.json"],
  { cwd: "apps/dashboard", stdout: "pipe", stderr: "pipe" },
);
const lines = `${run.stdout.toString()}\n${run.stderr.toString()}`.split("\n");

// Machine format: <time> ERROR|WARNING "<path>" <line>:<col> "<message>"
const findings: string[] = [];
let warnings = 0;
let errors = 0;
for (const line of lines) {
  const match = line.match(/^\d+\s+(ERROR|WARNING)\s+"([^"]+)"\s+(\d+):\d+\s+"(.*)"$/);
  if (!match) {
    continue;
  }
  const [, kind, path, row, message] = match;
  if (kind === "ERROR") {
    errors++;
  } else {
    warnings++;
  }
  const rel = path.replace(/^.*?\bsrc\//, "src/");
  if (!list.has(rel)) {
    continue;
  }
  if (kind === "ERROR" || /unused css selector/i.test(message)) {
    findings.push(`${kind} ${rel}:${row} ${message.slice(0, 160)}`);
  }
}
const summary = lines.find((line) => /\bCOMPLETED\b/.test(line));
if (!summary) {
  console.log(lines.slice(-30).join("\n"));
  console.log("svelte-check-did-not-complete");
  process.exit(1);
}
console.log(`svelte-check: ${errors} error(s), ${warnings} warning(s) over the dashboard (${summary.trim()})`);
console.log(
  findings.length
    ? `${findings.join("\n")}\nlane-svelte-problems ${findings.length}`
    : listOk
      ? "lane-svelte-clean"
      : "list-failed",
);
process.exit(findings.length || !listOk ? 1 : 0);

// The lanes' one ESLint gate. Run from the repository root:
//   L=<lane> bun .cutover/gates/lane-eslint-check.ts
// Runs the repository's own ESLint config, unmodified, over the lane's files
// under apps/dashboard/src, and passes only when it reports nothing there.
// `shadcn/no-restyle` is on, as the config sets it: wave 2 ran it off while
// other kit lanes still owned the restyle sites in a consumer's file, and the
// wave-3 base is lint-clean as a whole, so every problem in a lane's files is
// that lane's. A lane that adds a token or a theme name runs `bun run tokens`
// and lists the files it rewrites, so the config knows every class it uses.
import { loadLane, reportList } from "./lane-list.ts";

const lane = loadLane();
const listOk = reportList(lane);

// ESLint's config covers the dashboard's source: the lane's present files under
// apps/dashboard/src; a listed file its config does not match is skipped by
// --no-warn-ignored rather than reported as a fatal problem.
const files = lane.dashboardSrc.map((path) => path.replace(/^apps\/dashboard\//, ""));
if (files.length === 0) {
  console.log(listOk ? "no files under apps/dashboard/src to lint\neslint-clean" : "list-failed");
  process.exit(listOk ? 0 : 1);
}
const run = Bun.spawnSync(["bunx", "eslint", "-f", "json", "--no-warn-ignored", ...files], {
  cwd: "apps/dashboard",
  stdout: "pipe",
  stderr: "pipe",
});
const stderr = run.stderr.toString().trim();
if (stderr) {
  console.log(`eslint stderr:\n${stderr.slice(-1500)}`);
}

let results: { filePath: string; messages: { line: number; ruleId: string | null; message: string }[] }[];
try {
  results = JSON.parse(run.stdout.toString());
} catch {
  console.log("eslint-did-not-run");
  process.exit(1);
}

const problems: string[] = [];
const byRule = new Map<string, number>();
for (const file of results) {
  const path = `apps/dashboard/${file.filePath.split("/apps/dashboard/").pop()}`;
  for (const message of file.messages) {
    const rule = message.ruleId ?? "fatal";
    byRule.set(rule, (byRule.get(rule) ?? 0) + 1);
    problems.push(`${path}:${message.line} ${rule} ${message.message.slice(0, 140)}`);
  }
}

const tally = [...byRule].map(([rule, count]) => `${rule} ${count}`).join(", ");
console.log(
  problems.length
    ? `${problems.join("\n")}\neslint-problems ${problems.length} (${tally})`
    : listOk
      ? `eslint-clean (${files.length} files)`
      : "list-failed",
);
process.exit(problems.length || !listOk ? 1 : 0);

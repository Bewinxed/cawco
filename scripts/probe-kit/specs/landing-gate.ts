/**
 * No session declares what the hub runs: a delegate's work lands through
 * the hub's own landing gate (work-items.ts `gateSteps`), and its report is
 * the proof. On a scratch fleet (real hub, agent and sessiond; Claude Code
 * against the mock model). This spec delegates, so its fleet cuts
 * workspaces: it runs on the host, outside every boundary.
 *
 * The project's repository defines a `typecheck` script (`tsc --noEmit`,
 * TypeScript a dev dependency with its bun.lock), so its gate is the
 * dependency install and `bun run typecheck` on the tree about to land.
 *
 * - The hub keeps no checks on an item: `work_items` has no `checks` column.
 * - A: a delegate started with no checks commits a file that type-checks
 *   and calls finish_item. Its item is done; its report is its own summary,
 *   then "Landing gate, run by the hub:" with `bun run typecheck` passing,
 *   and "Landed on main at …"; the commit is on the hub's main.
 * - B: a delegate commits a deliberate type error and calls finish_item. The
 *   answer it reads says it did not land, that `bun run typecheck` failed,
 *   and carries tsc's error (TS2322) for the file; its item is still
 *   running, and its commit is not on main.
 *
 *   bun scripts/probe-kit/run.ts landing-gate
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const FINISH = "mcp__cawco__finish_item";
const TAG = /PROBE-GATE-([AB])/;
type Tag = "A" | "B";
/** What each delegate commits: A's type-checks, B's is a deliberate type error. */
const FILES: Record<Tag, { path: string; body: string }> = {
  A: { path: "src/a.ts", body: "export const a: number = 1;" },
  B: { path: "src/b.ts", body: 'export const b: number = "not a number";' },
};
/** tsc's words for B's error. */
const TS_ERROR = "src/b.ts(1,14): error TS2322";
/** How finish_item answers a failed gate (work-items.ts `gateFailedText`). */
const NOT_LANDED = "Not landed: the landing gate ran on";

const steps: Partial<Record<Tag, { finish?: boolean; searched?: boolean }>> =
  {};

const commitCommand = (tag: Tag) =>
  [
    `printf '%s\\n' '${FILES[tag].body}' > ${FILES[tag].path}`,
    `git add ${FILES[tag].path}`,
    `git -c user.name=Delegate -c user.email=d@probe.test commit -qm 'Delegate commit ${tag}'`,
    `echo DONE-COMMIT-${tag}`,
  ].join(" && ");

/** Each delegate commits its file, then calls finish_item once; the parent says "ok". */
const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  const tool = (name: string, input: object): Reply => ({
    everyMs: 5,
    words: [],
    tool: { name, input },
  });
  const tag = request.tools
    ? (TAG.exec(request.all)?.[1] as Tag | undefined)
    : undefined;
  if (!tag) {
    return text("ok");
  }
  steps[tag] ??= {};
  const step = steps[tag];
  if (!request.all.includes(`DONE-COMMIT-${tag}`)) {
    return tool("Bash", { command: commitCommand(tag), description: "Commit" });
  }
  if (!step.finish && request.toolNames.includes(FINISH)) {
    step.finish = true;
    return tool(FINISH, {
      headline: `Committed ${FILES[tag].path}.`,
      summary: `Committed ${FILES[tag].path}.\n\n\`git log --oneline -1\` printed: Delegate commit ${tag}\n\nNot run: none.`,
    });
  }
  if (
    !(step.finish || step.searched) &&
    request.toolNames.includes("ToolSearch")
  ) {
    step.searched = true;
    return tool("ToolSearch", { query: `select:${FINISH}`, max_results: 1 });
  }
  return text("done");
};

interface ItemRow {
  error: string | null;
  result: string | null;
  state: string;
}

const run = async (kit: Kit) => {
  const { check } = kit;
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  const columns = fleet
    .query<{ name: string }>("PRAGMA table_info(work_items)")
    .map((column) => column.name);
  check(
    "the hub keeps no checks on an item: work_items has no checks column, and landing_since marks a landing",
    !(columns.includes("checks") || columns.includes("checking_since")) &&
      columns.includes("landing_since"),
    columns.join(", ")
  );

  const home = fleet.env.HOME as string;
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  const repo = join(fleet.sandbox, "code");
  await mkdir(join(repo, "src"), { recursive: true });
  await writeFile(
    join(repo, "package.json"),
    `${JSON.stringify(
      {
        name: "landing-gate-probe",
        private: true,
        scripts: { typecheck: "tsc --noEmit -p ." },
        devDependencies: { typescript: "5.9.3" },
      },
      null,
      2
    )}\n`
  );
  await writeFile(
    join(repo, "tsconfig.json"),
    `${JSON.stringify({ compilerOptions: { strict: true, noEmit: true, module: "esnext", target: "es2022" }, include: ["src"] }, null, 2)}\n`
  );
  await writeFile(join(repo, "src", "index.ts"), "export const ok = true;\n");
  await writeFile(join(repo, ".gitignore"), "node_modules\n");
  const env = { ...process.env, HOME: home };
  await Bun.$`bun install`.cwd(repo).env(env).quiet();
  await Bun.$`git init -q -b main && git add -A && git commit -qm 'First commit'`
    .cwd(repo)
    .env(env)
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Landing gate",
    machineId: MACHINE,
    cwd: repo,
  });
  // The project's origin is the hub's own remote: main lands there.
  const bare = join(fleet.sandbox, "hub", "git", `${project.id}.git`);
  const mainLog = async () =>
    (await Bun.$`git log --format=%s main`.cwd(bare).nothrow().quiet().text())
      .trim()
      .split("\n");
  const parent = await fleet.spawn("claude", "Parent", repo, {
    projectId: project.id,
  });
  const itemOf = (id: string) =>
    fleet.query<ItemRow>(
      "SELECT state, error, result FROM work_items WHERE id = ?",
      id
    )[0];
  const delegate = (tag: Tag) =>
    fleet.api<{ workItemId: string; text: string }>("/api/work-items", {
      parentInstanceId: parent,
      title: `Commit ${tag}`,
      prompt: `PROBE-GATE-${tag}: commit a file, then finish.`,
      harness: "claude",
      model: "claude-haiku-4-5",
      cwd: repo,
    });

  // A
  const a = await delegate("A");
  check(
    "A: delegate starts with no checks, and says its report comes once its work clears the landing gate",
    a.text.includes("clears the hub's landing gate") &&
      !a.text.includes("acceptance checks"),
    a.text.slice(0, 600)
  );
  const aRow = await until(
    "A's item ended",
    () => itemOf(a.workItemId),
    (row) => ["done", "failed", "cancelled"].includes(row.state),
    600_000
  );
  const result = aRow.result ?? "";
  check(
    "A: done, its report its own summary, then the landing gate with bun run typecheck passing, then the landing",
    aRow.state === "done" &&
      result.startsWith("Committed src/a.ts.") &&
      result.includes("Landing gate, run by the hub:\n") &&
      result.includes("- bun run typecheck: pass (exit 0") &&
      result.includes("Landed on main at") &&
      !result.includes("Checks:"),
    `${aRow.state} ${aRow.error ?? ""}\n${result.slice(0, 1500)}`
  );
  const afterA = await mainLog();
  check(
    "A: its commit is on the hub's main",
    afterA[0] === "Delegate commit A",
    afterA.join(" | ")
  );

  // B
  const b = await delegate("B");
  const answer = await until(
    "B's finish_item answered",
    () =>
      fleet.seen.find(
        (one) =>
          one.afterTool &&
          one.all.includes("PROBE-GATE-B") &&
          one.all.includes(NOT_LANDED)
      )?.all,
    Boolean,
    600_000
  ).catch(() => "");
  const said = answer.slice(answer.indexOf(NOT_LANDED));
  check(
    "B: finish_item comes back saying it did not land because bun run typecheck failed, with tsc's error",
    said.includes("bun run typecheck failed") &&
      said.includes("- bun run typecheck: fail (exit ") &&
      said.includes(TS_ERROR),
    said.slice(0, 1500) || "no answer read"
  );
  const bRow = itemOf(b.workItemId);
  check(
    "B: its item is still running, nothing reported",
    bRow?.state === "running" && bRow.result === null,
    JSON.stringify(bRow)
  );
  const afterB = await mainLog();
  check(
    "B: its commit is not on main",
    !afterB.includes("Delegate commit B") && afterB[0] === "Delegate commit A",
    afterB.join(" | ")
  );
};

export default { name: "landing-gate", run } satisfies Spec;

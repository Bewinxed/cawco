/**
 * The landing gate runs exactly what the project declares, for any language
 * or toolchain, and says so when it declares nothing (hub gate-file.ts,
 * work-items.ts `gateSteps`); no session declares what the hub runs, and the
 * report is the proof. On a scratch fleet (real hub, agent and sessiond;
 * Claude Code against the mock model). This spec delegates, so its fleet
 * cuts workspaces: it runs on the host, outside every boundary.
 *
 * - The hub keeps no checks on an item: `work_items` has no `checks` column.
 * - A and B: a TypeScript project (a `typecheck` script, TypeScript a dev
 *   dependency with its bun.lock) declares CawCo's own gate shape in its
 *   gate.md: `bun install --frozen-lockfile` (on-fail: stop), `bun run
 *   lint:changed`, `bun run typecheck`.
 *   - A: a delegate started with no checks commits a file that type-checks
 *     and calls finish_item. Its item is done; its report is its own
 *     summary, then "Landing gate, run by the hub:" with those three steps
 *     passing and no other, and "Landed on main at …"; the commit is on main.
 *   - B: a delegate commits a deliberate type error. The answer it reads
 *     says it did not land, that `bun run typecheck` failed, and carries
 *     tsc's error (TS2322); its item is still running, its commit not on main.
 * - P: a Python project (pyproject.toml, pytest in its dev group, uv.lock)
 *   declares `uv sync` and `uv run pytest -q`. Its delegate adds a test and
 *   finishes: the report's gate is exactly those two steps, passing, and no
 *   bun step; it lands.
 * - N: a project with no gate.md: its delegate's work lands, and the report
 *   says "landed with no checks: this project declares none".
 *
 *   bun scripts/probe-kit/run.ts landing-gate
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { declareGate, JS_GATE } from "../gate";
import type { Kit, Spec } from "../kit";

const FINISH = "mcp__cawco__finish_item";
const TAG = /PROBE-GATE-([ABPN])/;
type Tag = "A" | "B" | "P" | "N";
/** What each delegate commits: A's type-checks, B's is a deliberate type error, P's is a passing test. */
const FILES: Record<Tag, { path: string; body: string }> = {
  A: { path: "src/a.ts", body: "export const a: number = 1;" },
  B: { path: "src/b.ts", body: 'export const b: number = "not a number";' },
  P: {
    path: "tests/test_more.py",
    body: "def test_more():\n    assert 1 + 1 == 2",
  },
  N: { path: "notes.md", body: "A note." },
};
/** tsc's words for B's error. */
const TS_ERROR = "src/b.ts(1,14): error TS2322";
/** How finish_item answers a failed gate (work-items.ts `gateFailedText`). */
const NOT_LANDED = "Not landed: the landing gate ran on";
/** P's declaration. */
const PY_GATE = "---\nuv sync\nuv run pytest -q\n---\n";
/** What a landing of a project that declares no gate says (work-items.ts `NO_CHECKS`). */
const NO_CHECKS = "landed with no checks: this project declares none";

const steps: Partial<Record<Tag, { finish?: boolean; searched?: boolean }>> =
  {};

const commitCommand = (tag: Tag) =>
  [
    `mkdir -p $(dirname ${FILES[tag].path})`,
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

/** The report's landing gate lines: every `- …` line under its heading. */
const gateLinesOf = (result: string): string[] => {
  const at = result.indexOf("Landing gate, run by the hub:\n");
  if (at < 0) {
    return [];
  }
  const lines = result.slice(at).split("\n").slice(1);
  const end = lines.findIndex((line) => !line.startsWith("- "));
  return end < 0 ? lines : lines.slice(0, end);
};

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
  const env = { ...process.env, HOME: home };
  const commitAll = (dir: string) =>
    Bun.$`git init -q -b main && git add -A && git commit -qm 'First commit'`
      .cwd(dir)
      .env(env)
      .quiet();

  /** A project of its own on `dir`, with its parent, gate.md as given (none: no file). */
  const projectOn = async (dir: string, name: string, gate?: string) => {
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name,
      machineId: MACHINE,
      cwd: dir,
    });
    if (gate !== undefined) {
      await declareGate(fleet.base, project.id, gate);
    }
    const parent = await fleet.spawn("claude", `Parent ${name}`, dir, {
      projectId: project.id,
    });
    // The project's origin is the hub's own remote: main lands there.
    const bare = join(fleet.sandbox, "hub", "git", `${project.id}.git`);
    const mainLog = async () =>
      (await Bun.$`git log --format=%s main`.cwd(bare).nothrow().quiet().text())
        .trim()
        .split("\n");
    return { id: project.id, parent, mainLog };
  };

  // The TypeScript project, declaring CawCo's own gate shape.
  const repo = join(fleet.sandbox, "code");
  await mkdir(join(repo, "src"), { recursive: true });
  await writeFile(
    join(repo, "package.json"),
    `${JSON.stringify(
      {
        name: "landing-gate-probe",
        private: true,
        scripts: {
          "lint:changed": "tsc --noEmit -p . --pretty false",
          typecheck: "tsc --noEmit -p .",
        },
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
  await Bun.$`bun install`.cwd(repo).env(env).quiet();
  await commitAll(repo);
  const ts = await projectOn(repo, "Landing gate", JS_GATE);

  const itemOf = (id: string) =>
    fleet.query<ItemRow>(
      "SELECT state, error, result FROM work_items WHERE id = ?",
      id
    )[0];
  const delegate = (tag: Tag, cwd: string, parent: string) =>
    fleet.api<{ workItemId: string; text: string }>("/api/work-items", {
      parentInstanceId: parent,
      title: `Commit ${tag}`,
      prompt: `PROBE-GATE-${tag}: commit a file, then finish.`,
      harness: "claude",
      model: "claude-haiku-4-5",
      cwd,
    });
  const ended = (tag: Tag, id: string) =>
    until(
      `${tag}'s item ended`,
      () => itemOf(id),
      (row) => ["done", "failed", "cancelled"].includes(row.state),
      600_000
    );

  // A
  const a = await delegate("A", repo, ts.parent);
  check(
    "A: delegate starts with no checks, and says its report comes once its work clears the landing gate",
    a.text.includes("clears the hub's landing gate") &&
      !a.text.includes("acceptance checks"),
    a.text.slice(0, 600)
  );
  const aRow = await ended("A", a.workItemId);
  const result = aRow.result ?? "";
  const aLines = gateLinesOf(result);
  check(
    "A: done, its report its own summary, then the landing gate with exactly the declared bun install, lint:changed and typecheck passing, then the landing",
    aRow.state === "done" &&
      result.startsWith("Committed src/a.ts.") &&
      aLines.length === 3 &&
      aLines[0]?.startsWith("- bun install --frozen-lockfile: pass (exit 0") ===
        true &&
      aLines[1]?.startsWith("- bun run lint:changed: pass (exit 0") === true &&
      aLines[2]?.startsWith("- bun run typecheck: pass (exit 0") === true &&
      result.includes("Landed on main at") &&
      !result.includes("Checks:"),
    `${aRow.state} ${aRow.error ?? ""}\n${result.slice(0, 1500)}`
  );
  const afterA = await ts.mainLog();
  check(
    "A: its commit is on the hub's main",
    afterA[0] === "Delegate commit A",
    afterA.join(" | ")
  );

  // B
  const b = await delegate("B", repo, ts.parent);
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
  const afterB = await ts.mainLog();
  check(
    "B: its commit is not on main",
    !afterB.includes("Delegate commit B") && afterB[0] === "Delegate commit A",
    afterB.join(" | ")
  );

  // P
  const py = join(fleet.sandbox, "py");
  await mkdir(join(py, "tests"), { recursive: true });
  await writeFile(
    join(py, "pyproject.toml"),
    '[project]\nname = "gate-probe"\nversion = "0.1.0"\nrequires-python = ">=3.9"\n\n[dependency-groups]\ndev = ["pytest"]\n\n[tool.uv]\npackage = false\n'
  );
  await writeFile(
    join(py, "tests", "test_ok.py"),
    "def test_ok():\n    assert True\n"
  );
  await writeFile(join(py, ".gitignore"), ".venv\n__pycache__\n");
  await Bun.$`uv lock`.cwd(py).env(env).quiet();
  await commitAll(py);
  const pyProject = await projectOn(py, "Python gate", PY_GATE);
  const p = await delegate("P", py, pyProject.parent);
  const pRow = await ended("P", p.workItemId);
  const pResult = pRow.result ?? "";
  const pLines = gateLinesOf(pResult);
  check(
    "P: the Python project's landing runs exactly its declared uv sync and uv run pytest -q, both passing, no bun step, and lands",
    pRow.state === "done" &&
      pLines.length === 2 &&
      pLines[0]?.startsWith("- uv sync: pass (exit 0") === true &&
      pLines[1]?.startsWith("- uv run pytest -q: pass (exit 0") === true &&
      !pResult.includes("bun ") &&
      pResult.includes("Landed on main at"),
    `${pRow.state} ${pRow.error ?? ""}\n${pResult.slice(0, 1500)}`
  );

  // N
  const plain = join(fleet.sandbox, "plain");
  await mkdir(plain, { recursive: true });
  await writeFile(join(plain, "README.md"), "Plain.\n");
  await commitAll(plain);
  const none = await projectOn(plain, "No gate");
  const n = await delegate("N", plain, none.parent);
  const nRow = await ended("N", n.workItemId);
  const nResult = nRow.result ?? "";
  check(
    "N: a project with no gate.md lands, its report saying it landed with no checks because it declares none",
    nRow.state === "done" &&
      nResult.includes(`Landing gate, run by the hub:\n${NO_CHECKS}`) &&
      nResult.includes("Landed on main at"),
    `${nRow.state} ${nRow.error ?? ""}\n${nResult.slice(0, 1500)}`
  );
  const afterN = await none.mainLog();
  check(
    "N: its commit is on the hub's main",
    afterN[0] === "Delegate commit N",
    afterN.join(" | ")
  );
};

export default { name: "landing-gate", run } satisfies Spec;

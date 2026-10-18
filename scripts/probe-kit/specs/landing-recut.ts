/**
 * Every cut of a workspace, its first and one again after it retired, on
 * every OS, answers with the project's dependencies installed (agent
 * seed-deps.ts `installDependencies`), so its delegate's own first
 * `bun run typecheck` passes with no install of its own, and the landing
 * gate finds them installed (core move.ts `depsScript`'s stamp). On a scratch
 * fleet (real hub, agent and sessiond; Claude Code against the mock model).
 * This spec delegates, so its fleet cuts workspaces: it runs on the host,
 * outside every boundary, on Linux or macOS.
 *
 * Two projects, each with a `typecheck` script (`tsc --noEmit`, TypeScript a
 * dev dependency) and node_modules ignored: L has a bun.lock, N has none (as
 * nightly 3981's ds-probe-sendback, a copy of `site/`, had none). For each:
 *
 * - its delegate's first command is `bun run typecheck`, and it passes; then
 *   it commits a file and calls finish_item: it lands on the first try, the
 *   gate's `bun run typecheck` passing with no install line;
 * - its workspace retires, its clone gone;
 * - the person sends it a follow-up: the clone is cut again at the same
 *   path, and the same session's first command there, `bun run typecheck`,
 *   passes (on 2026-10-18 a Mac delegate's failed with "Cannot find module
 *   'svelte/compiler'" in a clone cut again); it commits a second file and
 *   calls finish_item once, and that finish passes the gate on its first
 *   try with no install line, no "Not landed" answer in the reopened turn.
 *
 * Then S, with a bun.lock: its delegate adds a dependency to package.json
 * and leaves bun.lock as it was. The gate's frozen install refuses it, and
 * finish_item's first sentence says package.json and bun.lock disagree and
 * to run `bun install` in the workspace and commit bun.lock; the
 * workspace's bun.lock is unchanged, the item is not done, nothing lands.
 *
 *   bun scripts/probe-kit/run.ts landing-recut
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const FINISH = "mcp__cawco__finish_item";
const TAG = /PROBE-RECUT-GATE-([LNS])/;
type Tag = "L" | "N" | "S";
/** The projects that land, retire and land again; S's gate refuses its stale lockfile. */
type LegTag = Exclude<Tag, "S">;
/** S's package.json: the project's, with a dependency bun.lock does not hold. */
const STALE_MANIFEST = {
  name: "landing-recut-probe",
  private: true,
  scripts: { typecheck: "tsc --noEmit -p ." },
  devDependencies: { typescript: "5.9.3", "is-number": "7.0.0" },
};
/** How finish_item names a stale lockfile, in its first sentence (work-items.ts `failedRun`). */
const STALE_WORDS =
  "package.json and bun.lock disagree, so the dependency install refused and no other step ran: run `bun install` in the workspace and commit bun.lock. Fix it, commit, and call finish_item again.";
/** The person's follow-up to a retired delegate, and the mark of its reopened turn. */
const again = (tag: Tag) => `PROBE-RECUT-AGAIN-${tag}`;
/** How finish_item answers a failed gate (work-items.ts `gateFailedText`). */
const NOT_LANDED = "Not landed: the landing gate ran on";
/** How a gate report names an install it ran (work-items.ts): none when the cut's install stamped the clone. */
const INSTALL_LINE = "- installed dependencies:";
/** How long a workspace takes to settle once its item ends: its session's sleep, then its machine's archive. */
const SETTLE_MS = 120_000;
const COMMIT =
  "git -c user.name=Delegate -c user.email=d@probe.test commit -qm";

const steps: Partial<
  Record<
    Tag,
    {
      finish?: boolean;
      searched?: boolean;
      againFinish?: boolean;
      againSearched?: boolean;
    }
  >
> = {};

const tool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});
const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

/** A file committed in the delegate's clone, then a mark its output prints. */
const commitCommand = (name: string, mark: string) =>
  [
    `printf '%s\\n' 'export const ${name.replace(/\W/g, "_")} = 1;' > src/${name}.ts`,
    `git add src/${name}.ts`,
    `${COMMIT} 'Delegate commit ${name}'`,
    `echo ${mark}`,
  ].join(" && ");

/** The mark of the delegate's own typecheck in a cut: `-PASS` or `-FAIL: <its last lines>` follows it. */
const typecheckMark = (phase: "FIRST" | "AGAIN", tag: Tag) =>
  `DELEGATE-TYPECHECK-${phase}-${tag}`;

/**
 * The delegate's own `bun run typecheck`, first in its clone, before
 * anything installs: its output says whether it passed (`-PASS` or `-FAIL`
 * printed by `printf`, so the command's own text holds neither) and, when
 * not, its last lines.
 */
const typecheckCommand = (mark: string) =>
  `if out=$(bun run typecheck 2>&1); then echo "${mark}-$(printf PASS)"; else echo "${mark}-$(printf FAIL): $(printf '%s' "$out" | tail -3)"; fi`;

/** What the delegate's own typecheck under `mark` printed, from the model requests that read it. */
const typecheckSeen = (
  fleet: Fleet,
  mark: string
): "pass" | string | undefined => {
  if (fleet.seen.some((one) => one.all.includes(`${mark}-PASS`))) {
    return "pass";
  }
  const failed = fleet.seen.find((one) => one.all.includes(`${mark}-FAIL`));
  return failed
    ? failed.all.slice(failed.all.indexOf(`${mark}-FAIL`)).slice(0, 600)
    : undefined;
};

/** finish_item once it is offered, after a ToolSearch for it when it is not. */
const finishing = (
  request: Seen,
  state: { finished?: boolean; searched?: boolean },
  set: (key: "finished" | "searched") => void,
  words: string
): Reply => {
  if (!state.finished && request.toolNames.includes(FINISH)) {
    set("finished");
    return tool(FINISH, {
      headline: words,
      summary: `${words}\n\nNot run: none.`,
    });
  }
  if (
    !(state.finished || state.searched) &&
    request.toolNames.includes("ToolSearch")
  ) {
    set("searched");
    return tool("ToolSearch", { query: `select:${FINISH}`, max_results: 1 });
  }
  return text("done");
};

/** Each delegate commits and finishes; reopened, it commits again and finishes once more. */
const respond = (request: Seen): Reply => {
  const tag = request.tools
    ? (TAG.exec(request.all)?.[1] as Tag | undefined)
    : undefined;
  if (!tag) {
    return text("ok");
  }
  steps[tag] ??= {};
  const step = steps[tag];
  if (step.finish && request.all.includes(again(tag))) {
    if (!request.all.includes(`DONE-AGAIN-${tag}`)) {
      return tool("Bash", {
        command: `${typecheckCommand(typecheckMark("AGAIN", tag))}; ${commitCommand(`again_${tag}`, `DONE-AGAIN-${tag}`)}`,
        description: "Typecheck, then commit again",
      });
    }
    return finishing(
      request,
      { finished: step.againFinish, searched: step.againSearched },
      (key) => {
        step[key === "finished" ? "againFinish" : "againSearched"] = true;
      },
      `Committed src/again_${tag}.ts in the clone cut again.`
    );
  }
  if (!request.all.includes(`DONE-COMMIT-${tag}`)) {
    return tool("Bash", {
      command:
        tag === "S"
          ? [
              `printf '%s\\n' '${JSON.stringify(STALE_MANIFEST)}' > package.json`,
              "git add package.json",
              `${COMMIT} 'Delegate commit stale'`,
              "echo DONE-COMMIT-S",
            ].join(" && ")
          : `${typecheckCommand(typecheckMark("FIRST", tag))}; ${commitCommand(`first_${tag}`, `DONE-COMMIT-${tag}`)}`,
      description: "Commit",
    });
  }
  return finishing(
    request,
    { finished: step.finish, searched: step.searched },
    (key) => {
      step[key === "finished" ? "finish" : "searched"] = true;
    },
    tag === "S"
      ? "Added is-number to package.json."
      : `Committed src/first_${tag}.ts.`
  );
};

interface ItemRow {
  error: string | null;
  result: string | null;
  state: string;
}

type Fleet = Awaited<ReturnType<Kit["fleet"]>>;

/** A project's repository: a typecheck over src, TypeScript a dev dependency, with or without its bun.lock. */
const makeRepo = async (
  repo: string,
  home: string,
  lockfile: boolean
): Promise<void> => {
  await mkdir(join(repo, "src"), { recursive: true });
  await writeFile(
    join(repo, "package.json"),
    `${JSON.stringify(
      {
        name: "landing-recut-probe",
        private: true,
        scripts: { typecheck: "tsc --noEmit -p ." },
        devDependencies: { typescript: "5.9.3" },
      },
      null,
      2
    )}\n`
  );
  // No global types but its own: TypeScript below 6.0 includes every
  // `node_modules/@types` of any enclosing folder, and a home with its own
  // (`~/node_modules/@types/bun`) failed this project's typecheck on the Mac.
  // typescriptlang.org/tsconfig/types.html: "If `types` is specified, only
  // packages listed will be included in the global scope."
  await writeFile(
    join(repo, "tsconfig.json"),
    `${JSON.stringify({ compilerOptions: { strict: true, noEmit: true, module: "esnext", target: "es2022", types: [] }, include: ["src"] }, null, 2)}\n`
  );
  await writeFile(join(repo, "src", "index.ts"), "export const ok = true;\n");
  await writeFile(join(repo, ".gitignore"), "node_modules\n");
  const env = { ...process.env, HOME: home };
  if (lockfile) {
    await Bun.$`bun install --lockfile-only`.cwd(repo).env(env).quiet();
  }
  await Bun.$`git init -q -b main && git add -A && git commit -qm 'First commit'`
    .cwd(repo)
    .env(env)
    .quiet();
};

const itemRow = (fleet: Fleet, id: string) =>
  fleet.query<ItemRow>(
    "SELECT state, error, result FROM work_items WHERE id = ?",
    id
  )[0];

const workspaceRow = (fleet: Fleet, id: string) =>
  fleet.query<{ id: string; path: string; state: string }>(
    "SELECT id, path, state FROM workspaces WHERE id = ?",
    id
  )[0];

/** The first model request under `mark` that read a "Not landed" answer: its words. */
const notLandedSeen = (fleet: Fleet, mark: string) =>
  fleet.seen.find(
    (one) =>
      one.afterTool && one.all.includes(mark) && one.all.includes(NOT_LANDED)
  )?.all;

/** A "Not landed" answer from its first words, for a check's detail. */
const refusal = (said: string | undefined) =>
  said ? said.slice(said.lastIndexOf(NOT_LANDED)).slice(0, 1500) : "";

/** The item once it ended, or a "Not landed" answer under `mark` (a failed gate leaves the item running). */
const settled = (fleet: Fleet, label: string, id: string, mark: string) =>
  until(
    `${label}'s item ended or its gate failed`,
    () => ({ row: itemRow(fleet, id), refused: notLandedSeen(fleet, mark) }),
    ({ row, refused }) =>
      refused !== undefined ||
      ["done", "failed", "cancelled"].includes(row?.state ?? ""),
    600_000
  ).catch(() => ({
    row: itemRow(fleet, id),
    refused: notLandedSeen(fleet, mark),
  }));

/** A project of its own for `tag` (with or without its bun.lock), its parent, and the delegate it started. */
const delegated = async (fleet: Fleet, tag: Tag, lockfile: boolean) => {
  const repo = join(fleet.sandbox, `code-${tag}`);
  await makeRepo(repo, fleet.env.HOME as string, lockfile);
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: `Landing recut ${tag}`,
    machineId: MACHINE,
    cwd: repo,
  });
  const parent = await fleet.spawn("claude", `Parent ${tag}`, repo, {
    projectId: project.id,
  });
  const started = await fleet.api<{
    instanceId: string;
    workItemId: string;
    workspaceId: string;
  }>("/api/work-items", {
    parentInstanceId: parent,
    title: `Commit ${tag}`,
    prompt: `PROBE-RECUT-GATE-${tag}: commit a file, then finish.`,
    harness: "claude",
    model: "claude-haiku-4-5",
    cwd: repo,
  });
  return { project, parent, started };
};

/**
 * S: package.json gains a dependency and bun.lock is not updated. The gate's
 * frozen install refuses it, finish_item says in its first sentence to run
 * `bun install` and commit bun.lock, the workspace's bun.lock is as
 * committed, the item is not done, and nothing lands.
 */
const staleLeg = async (kit: Kit, fleet: Fleet): Promise<void> => {
  const { check } = kit;
  const { project, started } = await delegated(fleet, "S", true);
  const answer = await settled(
    fleet,
    "S (stale bun.lock)",
    started.workItemId,
    "PROBE-RECUT-GATE-S"
  );
  const said = refusal(answer.refused);
  check(
    "S (stale bun.lock): finish_item comes back not landed, saying package.json and bun.lock disagree and to run bun install and commit bun.lock",
    said.includes(STALE_WORDS) &&
      said.includes(
        "- dependencies didn't install: bun install --frozen-lockfile (a package.json or bun.lock changed since the dependencies were installed)"
      ) &&
      said.includes("error: lockfile had changes, but lockfile is frozen"),
    said || `no answer read; ${JSON.stringify(answer.row)}`
  );
  const path = workspaceRow(fleet, started.workspaceId)?.path ?? "";
  const git = (args: string[]) =>
    Bun.$`git -C ${path} ${args}`.quiet().nothrow().text();
  const status = await git(["status", "--porcelain", "--", "bun.lock"]);
  const diff = await git(["diff", "HEAD", "--", "bun.lock"]);
  const manifest = await git(["show", "HEAD:package.json"]);
  check(
    "S: the workspace's bun.lock is as committed (no change, staged or not), and its commit carries is-number in package.json",
    status.trim() === "" &&
      diff.trim() === "" &&
      manifest.includes("is-number"),
    `status: ${status.trim() || "clean"}; diff: ${diff.slice(0, 400) || "none"}; HEAD package.json: ${manifest.trim()}`
  );
  const bare = join(fleet.sandbox, "hub", "git", `${project.id}.git`);
  const main = await Bun.$`git log --format=%s main`
    .cwd(bare)
    .quiet()
    .nothrow()
    .text();
  // The scripted delegate never tries again after the refusal, so the hub's
  // quiet-turn rule may fail its item: any state but done is not landed.
  const row = itemRow(fleet, started.workItemId);
  check(
    "S: its item is not done, and its commit is not on main",
    row !== undefined &&
      row.state !== "done" &&
      !main.includes("Delegate commit stale"),
    `${JSON.stringify(row)}; main: ${main.trim().split("\n").join(" | ")}`
  );
};

/** One project's leg: typecheck and land, retire, follow up, typecheck and land again on the first try. */
const leg = async (kit: Kit, fleet: Fleet, tag: LegTag): Promise<void> => {
  const { check } = kit;
  const label = tag === "L" ? "L (bun.lock)" : "N (no lockfile)";
  const { started } = await delegated(fleet, tag, tag === "L");
  const itemOf = (id: string) => itemRow(fleet, id);
  const workspaceOf = (id: string) => workspaceRow(fleet, id);
  const notLanded = (mark: string) => notLandedSeen(fleet, mark);
  const first = await settled(
    fleet,
    label,
    started.workItemId,
    `PROBE-RECUT-GATE-${tag}`
  );
  const firstTypecheck = typecheckSeen(fleet, typecheckMark("FIRST", tag));
  check(
    `${label}: in its first cut, the delegate's own first bun run typecheck passes, no install of its own`,
    firstTypecheck === "pass",
    firstTypecheck ?? "the delegate's typecheck was never read"
  );
  const firstResult = first.row?.result ?? "";
  check(
    `${label}: the first hand-in lands on its first try, bun run typecheck passing, the gate installing nothing (the cut did)`,
    first.refused === undefined &&
      first.row?.state === "done" &&
      firstResult.includes("- bun run typecheck: pass (exit 0") &&
      firstResult.includes("Landed on main at") &&
      !firstResult.includes(INSTALL_LINE),
    `${first.row?.state} ${first.row?.error ?? ""}\n${refusal(first.refused) || firstResult.slice(0, 1500)}`
  );
  if (first.row?.state !== "done") {
    return;
  }
  const workspace = workspaceOf(started.workspaceId);

  const retired = await until(
    `${label}'s workspace retired`,
    () => workspaceOf(started.workspaceId),
    (row) => row?.state === "archived",
    SETTLE_MS
  ).catch(() => workspaceOf(started.workspaceId));
  check(
    `${label}: its workspace retires, its clone gone`,
    retired?.state === "archived" && !existsSync(workspace?.path ?? ""),
    `${retired?.state}; clone ${existsSync(workspace?.path ?? "") ? "stands" : "gone"}`
  );

  // The person's follow-up reopens the finished item as its parent's handoff
  // does (work-items.ts `reopens`): the hub keeps it while the clone is cut
  // again (`recutFor`).
  await fleet.send(
    started.instanceId,
    `${again(tag)}: commit one more file, then finish.`
  );
  const cut = await until(
    `${label}'s clone cut again`,
    () => workspaceOf(started.workspaceId),
    (row) => row?.state === "active" && existsSync(row.path),
    SETTLE_MS
  ).catch(() => workspaceOf(started.workspaceId));
  check(
    `${label}: the follow-up cuts its clone again at its own path`,
    cut?.state === "active" &&
      cut.path === workspace?.path &&
      existsSync(cut.path),
    `${cut?.state}; ${cut?.path} (was ${workspace?.path}); clone ${existsSync(cut?.path ?? "") ? "stands" : "gone"}`
  );
  const second = await until(
    `${label}'s reopened item ended or its gate failed`,
    () => ({ row: itemOf(started.workItemId), refused: notLanded(again(tag)) }),
    ({ row, refused }) =>
      refused !== undefined ||
      (steps[tag]?.againFinish === true &&
        ["done", "failed", "cancelled"].includes(row?.state ?? "")),
    600_000
  ).catch(() => ({
    row: itemOf(started.workItemId),
    refused: notLanded(again(tag)),
  }));
  const againTypecheck = typecheckSeen(fleet, typecheckMark("AGAIN", tag));
  check(
    `${label}: in the clone cut again, the delegate's own first bun run typecheck passes, no install of its own`,
    againTypecheck === "pass",
    againTypecheck ?? "the delegate's typecheck was never read"
  );
  const result = second.row?.result ?? "";
  check(
    `${label}: the follow-up's finish_item passes the gate on its first try in the clone cut again, and lands, the gate installing nothing (the cut did)`,
    second.refused === undefined &&
      second.row?.state === "done" &&
      result.includes(`Delegate commit again_${tag}`) &&
      result.includes("- bun run typecheck: pass (exit 0") &&
      result.includes("Landed on main at") &&
      !result.includes(INSTALL_LINE),
    `${second.row?.state} ${second.row?.error ?? ""}\n${refusal(second.refused) || result.slice(0, 1500)}`
  );
};

const run = async (kit: Kit) => {
  for (const tag of Object.keys(steps) as Tag[]) {
    delete steps[tag];
  }
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const home = fleet.env.HOME as string;
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  await leg(kit, fleet, "N");
  await leg(kit, fleet, "L");
  await staleLeg(kit, fleet);
};

export default { name: "landing-recut", run } satisfies Spec;

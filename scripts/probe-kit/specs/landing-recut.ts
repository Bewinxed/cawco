/**
 * A project that declares CawCo's own gate shape (gate.md: `bun install
 * --frozen-lockfile` with on-fail: stop, `bun run lint:changed`, `bun run
 * typecheck`; hub gate-file.ts) lands through exactly those steps, including
 * from a clone cut again after its workspace retired, and its declared
 * install refuses a stale lockfile in bun's own words. The hub installs
 * nothing of its own. On a scratch fleet (real hub, agent and sessiond;
 * Claude Code against the mock model). This spec delegates, so its fleet
 * cuts workspaces: it runs on the host, outside every boundary.
 *
 * Two projects, each with `lint:changed` and `typecheck` scripts (`tsc
 * --noEmit`, TypeScript a dev dependency) and node_modules ignored: L has a
 * bun.lock, N has none (as nightly 3981's ds-probe-sendback, a copy of
 * `site/`, had none). For each:
 *
 * - its delegate commits a file and calls finish_item: it lands on the first
 *   try, the declared install, `bun run lint:changed` and `bun run
 *   typecheck` passing;
 * - its workspace retires, its clone gone;
 * - its parent hands off to it: the clone is cut again at the same path, the
 *   same session commits a second file and calls finish_item once, and that
 *   finish passes the declared gate on its first try, no "Not landed"
 *   answer in the reopened turn.
 *
 * Then S, with a bun.lock: its delegate adds a dependency to package.json
 * and leaves bun.lock as it was. The declared frozen install refuses it:
 * finish_item says `bun install --frozen-lockfile` failed so lint:changed
 * and typecheck did not run, with bun's own words ("lockfile had changes,
 * but lockfile is frozen"); the workspace's bun.lock is unchanged, the item
 * is not done, nothing lands.
 *
 * Then the move line (core injected.ts `movedLine`), each with a bun.lock.
 * The line is for a session that goes on in the clone the landing moved, so
 * each landing here fails its gate and the item stays open there: a landed
 * item's session is put to sleep and its workspace retires (server.ts
 * `sleepFinished`, work-items.ts `settle`), and the next message reaches a
 * clone cut again, whose own line (the recut's) is the one it reads.
 *
 * - M: its delegate commits a file that typechecks against src/index.ts as
 *   cut; main then changes src/index.ts so that file no longer does, and the
 *   delegate finishes. The landing rebases its commit onto that newer main
 *   and the gate fails there. The next message the session reads, the hub's
 *   still-open reminder, opens with the hub's line that its checkout moved
 *   from the HEAD it committed to the HEAD the landing left, with the
 *   install to run, and no later message repeats it;
 * - K: main stays put and its delegate's commit fails typecheck on its own,
 *   so the landing leaves HEAD where it was, and nothing it reads after
 *   carries such a line.
 *
 *   bun scripts/probe-kit/run.ts landing-recut
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { movedLine } from "../../../packages/core/src/injected";
import { workWords } from "../../../packages/core/src/words/work";
import { toolWords } from "../../lib/tool-call";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { declareGate, JS_GATE } from "../gate";
import type { Kit, Spec } from "../kit";

const FINISH = "mcp__cawco__finish_item";
const TAG = /PROBE-RECUT-GATE-([LNSMK])/;
type Tag = "L" | "N" | "S" | "M" | "K";
/** The projects that land, retire and land again; S's gate refuses its stale lockfile; M and K, the move line. */
type LegTag = "L" | "N";
/** The file in M's scratch dir the spec writes once main has moved past its clone's cut: its delegate commits, then waits for it. */
const MAIN_MOVED = "main-moved";
/**
 * M's and K's first files: M's typechecks against src/index.ts as cut
 * (`ok` is `true` there) and not once main widens `ok` to boolean; K's
 * fails typecheck on its own.
 */
const MOVE_FILES = {
  M: ['import { ok } from "./index";', "export const first_M: true = ok;"],
  K: ["export const first_K: string = 1;"],
} as const;
/** src/index.ts as main changes it under M: `ok` widened, so M's file fails typecheck once rebased onto it. */
const MAIN_INDEX = "export const ok: boolean = true;\n";
/** The hub's reminder to a delegate whose turn ended quietly (work-items.ts `quietTurn`). */
const STILL_OPEN = "Your work item is still open.";
/** How the hub's line that a landing moved a checkout opens (core injected.ts `movedLine`). */
const MOVED_OPENING = movedLine({
  kind: "landing",
  branch: "",
  from: "",
  to: "",
}).split(" from ")[0] as string;
/** Each project's scripts: what its declared gate runs after the install. */
const SCRIPTS = {
  "lint:changed": "tsc --noEmit -p . --pretty false",
  typecheck: "tsc --noEmit -p .",
};
/** S's package.json: the project's, with a dependency bun.lock does not hold. */
const STALE_MANIFEST = {
  name: "landing-recut-probe",
  private: true,
  scripts: SCRIPTS,
  devDependencies: { typescript: "5.9.3", "is-number": "7.0.0" },
};
/** How finish_item names the failed install, in its first sentence (work-items.ts `failedRun`). */
const STALE_WORDS =
  "bun install --frozen-lockfile failed, so bun run lint:changed and bun run typecheck did not run. Fix it, commit, and call finish_item again.";
/** bun's own words as its frozen install refuses a lockfile package.json disagrees with. */
const BUN_REFUSAL = "error: lockfile had changes, but lockfile is frozen";
/** The parent's handoff to a retired delegate, and the mark of its reopened turn. */
const again = (tag: Tag) => `PROBE-RECUT-AGAIN-${tag}`;
/** How finish_item answers a failed gate (work-items.ts `gateFailedText`). */
const NOT_LANDED = "Not landed: the merge checks ran on";
/** How the hub says a handoff waits for a clone cut again (delegation-actions.ts). */
const RECUTTING = "cutting its clone again";
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

/** A file committed in the delegate's clone (its `lines`, else one export), then (given `waitFor`) a wait of up to 4 min for that file in its scratch dir, then a mark its output prints. */
const commitCommand = (
  name: string,
  mark: string,
  waitFor?: string,
  lines: readonly string[] = [`export const ${name.replace(/\W/g, "_")} = 1;`]
) =>
  [
    `printf '%s\\n' ${lines.map((line) => `'${line}'`).join(" ")} > src/${name}.ts`,
    `git add src/${name}.ts`,
    `${COMMIT} 'Delegate commit ${name}'`,
    ...(waitFor
      ? [
          `for i in $(seq 240); do [ -e "$TMPDIR/${waitFor}" ] && break; sleep 1; done`,
        ]
      : []),
    `echo ${mark}`,
  ].join(" && ");

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
        command: commitCommand(`again_${tag}`, `DONE-AGAIN-${tag}`),
        description: "Commit again",
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
          : commitCommand(
              `first_${tag}`,
              `DONE-COMMIT-${tag}`,
              tag === "M" ? MAIN_MOVED : undefined,
              tag === "M" || tag === "K" ? MOVE_FILES[tag] : undefined
            ),
      description: "Commit",
      timeout: 300_000,
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
        scripts: SCRIPTS,
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
  if (lockfile) {
    await Bun.$`bun install --lockfile-only`.cwd(repo).env(env).quiet();
  }
  await Bun.$`git init -q -b main && git add -A && git commit -qm 'First commit'`
    .cwd(repo)
    .env(env)
    .quiet();
};

/** Whether a report's merge checks are the declared ones, every step passing, in order. */
const declaredPassed = (result: string): boolean => {
  const at = result.indexOf(`${workWords.gateHeading}\n`);
  const lines = result.slice(at).split("\n").slice(1, 4);
  return (
    at >= 0 &&
    lines[0]?.startsWith("- bun install --frozen-lockfile: pass") === true &&
    lines[1]?.startsWith("- bun run lint:changed: pass") === true &&
    lines[2]?.startsWith("- bun run typecheck: pass") === true
  );
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
  await declareGate(fleet.base, project.id, JS_GATE);
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
 * S: package.json gains a dependency and bun.lock is not updated. The
 * declared frozen install refuses it in bun's words, finish_item says it
 * failed and left lint:changed and typecheck unrun, the workspace's bun.lock
 * is as committed, the item is not done, and nothing lands.
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
    "S (stale bun.lock): finish_item comes back not landed, the declared install failing in bun's own words and leaving lint:changed and typecheck unrun",
    said.includes(STALE_WORDS) &&
      said.includes("- bun install --frozen-lockfile: fail (exit 1") &&
      said.includes(
        "- bun run typecheck: not run (bun install --frozen-lockfile failed first)"
      ) &&
      said.includes(BUN_REFUSAL),
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

/** One project's leg: land, retire, hand off, land again on the first try. */
const leg = async (
  kit: Kit,
  fleet: Fleet,
  tag: LegTag,
  callAsParent: (
    parent: string,
    name: string,
    args: object
  ) => Promise<{ status: number; text: string }>
): Promise<void> => {
  const { check } = kit;
  const label = tag === "L" ? "L (bun.lock)" : "N (no lockfile)";
  const { parent, started } = await delegated(fleet, tag, tag === "L");
  const itemOf = (id: string) => itemRow(fleet, id);
  const workspaceOf = (id: string) => workspaceRow(fleet, id);
  const notLanded = (mark: string) => notLandedSeen(fleet, mark);
  const first = await settled(
    fleet,
    label,
    started.workItemId,
    `PROBE-RECUT-GATE-${tag}`
  );
  const firstResult = first.row?.result ?? "";
  check(
    `${label}: the first hand-in lands on its first try, the declared install, lint:changed and typecheck passing`,
    first.refused === undefined &&
      first.row?.state === "done" &&
      declaredPassed(firstResult) &&
      firstResult.includes(`${workWords.landedOn("main")} at`),
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

  const message = `${again(tag)}: commit one more file, then finish.`;
  let handed = await callAsParent(parent, "handoff", {
    target: started.instanceId,
    message,
  });
  // A cold target is refused once with the cost considerations; the repeat goes.
  if (!handed.text.includes(RECUTTING)) {
    handed = await callAsParent(parent, "handoff", {
      target: started.instanceId,
      message,
    });
  }
  check(
    `${label}: the handoff waits while its clone is cut again`,
    handed.status === 200 && handed.text.includes(RECUTTING),
    `${handed.status} ${handed.text.slice(0, 800)}`
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
  const result = second.row?.result ?? "";
  check(
    `${label}: the follow-up's finish_item passes the declared gate on its first try in the clone cut again, and lands`,
    second.refused === undefined &&
      second.row?.state === "done" &&
      result.includes(`Delegate commit again_${tag}`) &&
      declaredPassed(result) &&
      result.includes(`${workWords.landedOn("main")} at`),
    `${second.row?.state} ${second.row?.error ?? ""}\n${refusal(second.refused) || result.slice(0, 1500)}`
  );
};

/**
 * M or K: the delegate finishes and its landing's gate fails, M's on a main
 * that moved past its cut, K's on the main it was cut from; the item stays
 * open in the same clone. The next message its session reads (the hub's
 * still-open reminder) opens with the hub's move line for M, once, naming
 * the HEAD it committed and the HEAD the landing left; K's carries none.
 */
const moveLeg = async (
  kit: Kit,
  fleet: Fleet,
  tag: "M" | "K"
): Promise<void> => {
  const { check } = kit;
  const mark = `PROBE-RECUT-GATE-${tag}`;
  const { project, started } = await delegated(fleet, tag, true);
  const row = await until(
    `${tag}'s clone committed`,
    () =>
      fleet.query<{ path: string; tmp: string | null }>(
        "SELECT path, tmp FROM workspaces WHERE id = ?",
        started.workspaceId
      )[0],
    (one) =>
      Boolean(one?.path && one.tmp) &&
      Bun.spawnSync(["git", "-C", one?.path ?? "", "log", "-1", "--format=%s"])
        .stdout.toString()
        .includes(`Delegate commit first_${tag}`),
    300_000
  );
  const path = row?.path ?? "";
  const from = (await Bun.$`git -C ${path} rev-parse HEAD`.text()).trim();
  if (tag === "M") {
    const bare = join(fleet.sandbox, "hub", "git", `${project.id}.git`);
    const other = join(fleet.sandbox, "main-mover");
    const env = { ...process.env, HOME: fleet.env.HOME as string };
    await Bun.$`git clone -q ${bare} ${other}`.env(env).quiet();
    await writeFile(join(other, "src", "index.ts"), MAIN_INDEX);
    await Bun.$`git add -A && git commit -qm 'Main moves on' && git push -q origin HEAD:main`
      .cwd(other)
      .env(env)
      .quiet();
    await writeFile(join(row?.tmp ?? "", MAIN_MOVED), "");
  }
  const landed = await settled(fleet, tag, started.workItemId, mark);
  const to = (
    await Bun.$`git -C ${path} rev-parse HEAD`.quiet().nothrow().text()
  ).trim();
  check(
    `${tag}: its finish_item comes back not landed, its gate failing on ${tag === "M" ? "its commit rebased onto the main that moved past its cut" : "its own commit"}, its clone standing`,
    landed.refused !== undefined && existsSync(path),
    `${landed.row?.state} ${landed.row?.error ?? ""}\n${refusal(landed.refused) || (landed.row?.result ?? "").slice(0, 1500)}`
  );
  if (landed.refused === undefined) {
    return;
  }
  // Its quiet turns end the item; by then every message it read is seen.
  const ended = await until(
    `${tag}'s item ended by its quiet turns`,
    () => itemRow(fleet, started.workItemId)?.state,
    (state) => state !== "running",
    240_000
  ).catch(() => undefined);
  const mine = fleet.seen.filter((one) => one.tools && one.all.includes(mark));
  const refusedAt = mine.findIndex(
    (one) => one.afterTool && one.all.includes(NOT_LANDED)
  );
  const next = mine.slice(refusedAt + 1).find((one) => !one.afterTool);
  const words = next?.last ?? "";
  const told = (mine.at(-1)?.all ?? "").split(MOVED_OPENING).length - 1;
  const detail = `item ${ended}; HEAD ${from.slice(0, 9)} → ${to.slice(0, 9)}; told ${told} time(s); the next message read: ${JSON.stringify(words.slice(0, 700))}`;
  if (tag === "M") {
    const line = movedLine({ kind: "landing", branch: "main", from, to });
    check(
      "M: the first message after a landing that moved its checkout opens with the hub's move line, naming the HEAD it committed and the HEAD the landing left, and the install to run; no later message repeats it",
      to !== from &&
        words.includes(line) &&
        words.indexOf(line) < words.indexOf(STILL_OPEN) &&
        told === 1,
      detail
    );
  } else {
    check(
      "K: after a landing that left its checkout where it was, no message it reads carries the move line",
      to === from && words.includes(STILL_OPEN) && told === 0,
      detail
    );
  }
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
  const credentials = new Map<string, string>();
  const callAsParent = async (parent: string, name: string, args: object) => {
    let credential = credentials.get(parent);
    if (credential === undefined) {
      credential = await fleet.sessionCredential(parent);
      credentials.set(parent, credential);
    }
    const said = await toolWords(
      { base: fleet.base, id: parent, credential },
      name,
      args as Record<string, unknown>,
      { timeoutMs: 300_000 }
    );
    return { status: said.status, text: said.text };
  };
  await leg(kit, fleet, "N", callAsParent);
  await leg(kit, fleet, "L", callAsParent);
  await staleLeg(kit, fleet);
  await moveLeg(kit, fleet, "M");
  await moveLeg(kit, fleet, "K");
};

export default {
  group: "Workspaces and what agents may touch",
  name: "landing-recut",
  host: "it delegates, so its fleet cuts workspaces",
  run,
} satisfies Spec;

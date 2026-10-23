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
 * Then the move line (core injected.ts `movedLine`), each with a bun.lock:
 *
 * - M: after its clone is cut, main gains a commit; its delegate commits and
 *   finishes, and the landing rebases its commit onto that newer main. Its
 *   parent's handoff, read by the same session in the same clone, opens
 *   with the hub's line once: its checkout moved from the HEAD it committed
 *   to the HEAD the landing left, and the install to run;
 * - K: main stays put, so the landing leaves HEAD where it was, and the
 *   parent's handoff carries no such line.
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
const NOT_LANDED = "Not landed: the landing gate ran on";
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

/** A file committed in the delegate's clone, then (given `waitFor`) a wait of up to 4 min for that file in its scratch dir, then a mark its output prints. */
const commitCommand = (name: string, mark: string, waitFor?: string) =>
  [
    `printf '%s\\n' 'export const ${name.replace(/\W/g, "_")} = 1;' > src/${name}.ts`,
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
              tag === "M" ? MAIN_MOVED : undefined
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

/** Whether a report's landing gate is the declared one, every step passing, in order. */
const declaredPassed = (result: string): boolean => {
  const at = result.indexOf("Landing gate, run by the hub:\n");
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

/** The handoff `message` from `parent` to a delegate that just finished, repeated once when a cold target is refused ("… Nothing was sent."). */
const handOff = async (
  callAsParent: CallAsParent,
  parent: string,
  target: string,
  message: string
) => {
  const first = await callAsParent(parent, "handoff", { target, message });
  return first.status === 200 && !first.text.includes("Nothing was sent")
    ? first
    : await callAsParent(parent, "handoff", { target, message });
};

type CallAsParent = (
  parent: string,
  name: string,
  args: object
) => Promise<{ status: number; text: string }>;

/**
 * M or K: the delegate lands (M on a main that moved past its cut, K on the
 * main it was cut from), then its parent hands off to it while it still
 * stands in the same clone: M's handoff opens with the hub's move line once,
 * naming the HEAD it committed and the HEAD the landing left; K's has none.
 */
const moveLeg = async (
  kit: Kit,
  fleet: Fleet,
  tag: "M" | "K",
  callAsParent: CallAsParent
): Promise<void> => {
  const { check } = kit;
  const { project, parent, started } = await delegated(fleet, tag, true);
  let from = "";
  if (tag === "M") {
    const row = await until(
      "M's clone committed",
      () =>
        fleet.query<{ path: string; tmp: string | null }>(
          "SELECT path, tmp FROM workspaces WHERE id = ?",
          started.workspaceId
        )[0],
      (one) =>
        Boolean(one?.path && one.tmp) &&
        Bun.spawnSync([
          "git",
          "-C",
          one?.path ?? "",
          "log",
          "-1",
          "--format=%s",
        ])
          .stdout.toString()
          .includes("Delegate commit first_M"),
      300_000
    );
    from = (
      await Bun.$`git -C ${row?.path ?? ""} rev-parse HEAD`.text()
    ).trim();
    const bare = join(fleet.sandbox, "hub", "git", `${project.id}.git`);
    const other = join(fleet.sandbox, "main-mover");
    const env = { ...process.env, HOME: fleet.env.HOME as string };
    await Bun.$`git clone -q ${bare} ${other}`.env(env).quiet();
    await writeFile(
      join(other, "src", "main_moved.ts"),
      "export const moved = 1;\n"
    );
    await Bun.$`git add -A && git commit -qm 'Main moves on' && git push -q origin HEAD:main`
      .cwd(other)
      .env(env)
      .quiet();
    await writeFile(join(row?.tmp ?? "", MAIN_MOVED), "");
  }
  const landed = await settled(
    fleet,
    tag,
    started.workItemId,
    `PROBE-RECUT-GATE-${tag}`
  );
  const result = landed.row?.result ?? "";
  check(
    `${tag}: its first hand-in lands${tag === "M" ? ", rebased onto the main that moved past its cut" : ""}`,
    landed.row?.state === "done" &&
      result.includes(`${workWords.landedOn("main")} at`),
    `${landed.row?.state} ${landed.row?.error ?? ""}\n${refusal(landed.refused) || result.slice(0, 1500)}`
  );
  if (landed.row?.state !== "done") {
    return;
  }
  const path = workspaceRow(fleet, started.workspaceId)?.path ?? "";
  const to = (
    await Bun.$`git -C ${path} rev-parse HEAD`.quiet().nothrow().text()
  ).trim();
  const handed = await handOff(
    callAsParent,
    parent,
    started.instanceId,
    `${again(tag)}: commit one more file, then finish.`
  );
  const read = await until(
    `${tag}'s handoff read`,
    () => fleet.seen.find((one) => one.tools && one.last.includes(again(tag))),
    Boolean,
    240_000
  ).catch(() => undefined);
  const words = read?.last ?? "";
  const told = words.split(MOVED_OPENING).length - 1;
  const state = workspaceRow(fleet, started.workspaceId)?.state;
  if (tag === "M") {
    const named = `from ${from.slice(0, 9)} to ${to.slice(0, 9)}`;
    check(
      "M: the handoff after a landing that moved its checkout opens with the hub's move line once, naming the HEAD it committed and the HEAD the landing left, and the install to run",
      from !== "" &&
        to !== from &&
        told === 1 &&
        words.includes(named) &&
        words.includes("Run the repo's install before you build or test."),
      `handoff ${handed.status}; workspace ${state}; expected "${named}"; the session read: ${JSON.stringify(words.slice(0, 700))}`
    );
  } else {
    check(
      "K: the handoff after a landing that left its checkout where it was carries no move line",
      read !== undefined && told === 0,
      `handoff ${handed.status}; workspace ${state}; the session read: ${JSON.stringify(words.slice(0, 700))}`
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
      credential =
        (
          await Bun.file(
            `/proc/${await fleet.sessionPid(parent)}/environ`
          ).text()
        )
          .split("\0")
          .find((line) => line.startsWith("CAWCO_SESSION_CREDENTIAL="))
          ?.slice("CAWCO_SESSION_CREDENTIAL=".length) ?? "";
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
  await moveLeg(kit, fleet, "M", callAsParent);
  await moveLeg(kit, fleet, "K", callAsParent);
};

export default {
  name: "landing-recut",
  host: "it delegates, so its fleet cuts workspaces",
  run,
} satisfies Spec;

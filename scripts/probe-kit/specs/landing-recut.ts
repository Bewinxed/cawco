/**
 * The landing gate runs its steps in a clone with the project's dependencies
 * installed, every time (core move.ts `depsScript`), including a clone cut
 * again after its workspace retired. On a scratch fleet (real hub, agent and
 * sessiond; Claude Code against the mock model). This spec delegates, so its
 * fleet cuts workspaces: it runs on the host, outside every boundary.
 *
 * Two projects, each with a `typecheck` script (`tsc --noEmit`, TypeScript a
 * dev dependency) and node_modules ignored: L has a bun.lock, N has none (as
 * nightly 3981's ds-probe-sendback, a copy of `site/`, had none). For each:
 *
 * - its delegate commits a file and calls finish_item: it lands on the first
 *   try, the gate's `bun run typecheck` passing, and its install line (N's
 *   names `bun install --frozen-lockfile` and package.json) says why it ran;
 * - its workspace retires, its clone gone;
 * - its parent hands off to it: the clone is cut again at the same path, the
 *   same session commits a second file and calls finish_item once, and that
 *   finish passes the gate on its first try, no "Not landed" answer in the
 *   reopened turn. The re-cut clone's dependencies came from somewhere it
 *   names: the gate's install line ("no dependencies installed from …"), or,
 *   for L on Linux, the agent's seed of the cut (seed-deps.ts) with no
 *   install line.
 *
 * Then S, with a bun.lock: its delegate adds a dependency to package.json
 * and leaves bun.lock as it was. The gate's frozen install refuses it, and
 * finish_item's first sentence says package.json and bun.lock disagree and
 * to run `bun install` in the workspace and commit bun.lock; the
 * workspace's bun.lock is unchanged, the item still runs, nothing lands.
 *
 *   bun scripts/probe-kit/run.ts landing-recut
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readWithin } from "../../../packages/core/src/bounded";
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

/** A file committed in the delegate's clone, then a mark its output prints. */
const commitCommand = (name: string, mark: string) =>
  [
    `printf '%s\\n' 'export const ${name.replace(/\W/g, "_")} = 1;' > src/${name}.ts`,
    `git add src/${name}.ts`,
    `${COMMIT} 'Delegate commit ${name}'`,
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
          : commitCommand(`first_${tag}`, `DONE-COMMIT-${tag}`),
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

/** What each project's gate installs from (core move.ts `depsScript`), by bun's frozen install either way. */
const LOCK: Record<LegTag, string> = { L: "bun.lock", N: "package.json" };

/**
 * Whether a report names where its clone's dependencies came from: the
 * gate's install line saying none were installed from the project's
 * lockfile (or manifest), or, for L, the cut's seed (`seeded` lines in the
 * agent's log) with no install line.
 */
const depsNamed = (result: string, tag: LegTag, seeded: number): boolean =>
  result.includes(
    `- installed dependencies: bun install --frozen-lockfile (no dependencies installed from ${LOCK[tag]})`
  ) ||
  (tag === "L" &&
    seeded === 1 &&
    !result.includes("- installed dependencies:"));

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
 * committed, the item still runs, and nothing lands.
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
  check(
    "S: its item still runs, and its commit is not on main",
    answer.row?.state === "running" && !main.includes("Delegate commit stale"),
    `${JSON.stringify(answer.row)}; main: ${main.trim().split("\n").join(" | ")}`
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
    `${label}: the first hand-in lands on its first try, bun run typecheck passing`,
    first.refused === undefined &&
      first.row?.state === "done" &&
      firstResult.includes("- bun run typecheck: pass (exit 0") &&
      firstResult.includes("Landed on main at"),
    `${first.row?.state} ${first.row?.error ?? ""}\n${refusal(first.refused) || firstResult.slice(0, 1500)}`
  );
  if (first.row?.state !== "done") {
    return;
  }
  const workspace = workspaceOf(started.workspaceId);
  const seeds = async () =>
    (await fleet.logs("agent"))
      .split("\n")
      .filter(
        (line) =>
          line.includes(`[workspace] ${started.workspaceId}:`) &&
          line.includes("its dependencies linked from the workspaces' cache")
      ).length;
  const seededFirst = await seeds();
  check(
    `${label}: the first hand-in's dependencies came from the gate's install, saying why, or the cut's seed`,
    depsNamed(firstResult, tag, seededFirst),
    `seeded ${seededFirst}; ${firstResult.slice(0, 1500)}`
  );

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
  const seeded = (await seeds()) - seededFirst;
  check(
    `${label}: the follow-up's finish_item passes the gate on its first try in the clone cut again, and lands`,
    second.refused === undefined &&
      second.row?.state === "done" &&
      result.includes(`Delegate commit again_${tag}`) &&
      result.includes("- bun run typecheck: pass (exit 0") &&
      result.includes("Landed on main at"),
    `${second.row?.state} ${second.row?.error ?? ""}\n${refusal(second.refused) || result.slice(0, 1500)}`
  );
  check(
    `${label}: the re-cut clone's dependencies came from the gate's install line naming why (none installed from ${LOCK[tag]}), or the cut's seed with no install line`,
    depsNamed(result, tag, seeded),
    `seeded at the re-cut: ${seeded}; ${result.slice(0, 1500)}`
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
    const read = await readWithin(300_000, async (signal) => {
      const response = await fetch(
        `${fleet.base}/api/delegation/call/${parent}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${credential}`,
          },
          body: JSON.stringify({ name, arguments: args }),
          signal,
        }
      );
      return { status: response.status, text: await response.text() };
    });
    switch (read.kind) {
      case "answered":
        return read.value;
      case "unanswered":
        throw new Error(
          `${name} as the parent did not answer within ${read.after} ms (${read.reason})`
        );
      default: {
        const unhandled: never = read;
        throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
      }
    }
  };
  await leg(kit, fleet, "N", callAsParent);
  await leg(kit, fleet, "L", callAsParent);
  await staleLeg(kit, fleet);
};

export default { name: "landing-recut", run } satisfies Spec;

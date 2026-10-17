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
 *   bun scripts/probe-kit/run.ts landing-recut
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readWithin } from "../../../packages/core/src/bounded";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const FINISH = "mcp__cawco__finish_item";
const TAG = /PROBE-RECUT-GATE-([LN])/;
type Tag = "L" | "N";
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
      command: commitCommand(`first_${tag}`, `DONE-COMMIT-${tag}`),
      description: "Commit",
    });
  }
  return finishing(
    request,
    { finished: step.finish, searched: step.searched },
    (key) => {
      step[key === "finished" ? "finish" : "searched"] = true;
    },
    `Committed src/first_${tag}.ts.`
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

/** What each project's gate installs from, and the install it runs (core move.ts `depsScript`). */
const LOCK: Record<Tag, string> = { L: "bun.lock", N: "package.json" };
const INSTALL: Record<Tag, string> = {
  L: "bun install",
  N: "bun install --frozen-lockfile",
};

/**
 * Whether a report names where its clone's dependencies came from: the
 * gate's install line saying none were installed from the project's
 * lockfile (or manifest), or, for L, the cut's seed (`seeded` lines in the
 * agent's log) with no install line.
 */
const depsNamed = (result: string, tag: Tag, seeded: number): boolean =>
  result.includes(
    `- installed dependencies: ${INSTALL[tag]} (no dependencies installed from ${LOCK[tag]})`
  ) ||
  (tag === "L" &&
    seeded === 1 &&
    !result.includes("- installed dependencies:"));

/** One project's leg: land, retire, hand off, land again on the first try. */
const leg = async (
  kit: Kit,
  fleet: Fleet,
  tag: Tag,
  callAsParent: (
    parent: string,
    name: string,
    args: object
  ) => Promise<{ status: number; text: string }>
): Promise<void> => {
  const { check } = kit;
  const label = tag === "L" ? "L (bun.lock)" : "N (no lockfile)";
  const home = fleet.env.HOME as string;
  const repo = join(fleet.sandbox, `code-${tag}`);
  await makeRepo(repo, home, tag === "L");
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: `Landing recut ${tag}`,
    machineId: MACHINE,
    cwd: repo,
  });
  const parent = await fleet.spawn("claude", `Parent ${tag}`, repo, {
    projectId: project.id,
  });
  const itemOf = (id: string) =>
    fleet.query<ItemRow>(
      "SELECT state, error, result FROM work_items WHERE id = ?",
      id
    )[0];
  const workspaceOf = (id: string) =>
    fleet.query<{ id: string; path: string; state: string }>(
      "SELECT id, path, state FROM workspaces WHERE id = ?",
      id
    )[0];
  const notLanded = (mark: string) =>
    fleet.seen.find(
      (one) =>
        one.afterTool && one.all.includes(mark) && one.all.includes(NOT_LANDED)
    )?.all;
  /** The item once it ended, or a "Not landed" answer under `mark` (a failed gate leaves the item running). */
  const settled = (id: string, mark: string) =>
    until(
      `${label}'s item ended or its gate failed`,
      () => ({ row: itemOf(id), refused: notLanded(mark) }),
      ({ row, refused }) =>
        refused !== undefined ||
        ["done", "failed", "cancelled"].includes(row?.state ?? ""),
      600_000
    ).catch(() => ({ row: itemOf(id), refused: notLanded(mark) }));
  const refusal = (said: string | undefined) =>
    said ? said.slice(said.lastIndexOf(NOT_LANDED)).slice(0, 1500) : "";

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
  const first = await settled(started.workItemId, `PROBE-RECUT-GATE-${tag}`);
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
};

export default { name: "landing-recut", run } satisfies Spec;

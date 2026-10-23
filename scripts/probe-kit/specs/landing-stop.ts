/**
 * A landing spends no gate on a push that will be refused, and a stopped
 * item's landing ends every gate step it started (hub landing.ts
 * `pushCheck`, work-items.ts `landingStops`). On a scratch fleet (real hub, agent and
 * sessiond; Claude Code against the mock model). This spec delegates, so its
 * fleet cuts workspaces: it is `host`, run outside every boundary.
 *
 * Each leg declares its own gate.md; every step writes a line to its
 * workspace's scratch dir, `$TMPDIR/probe-gate-steps.log`: the gate's step
 * log, read on the host.
 *
 * - (a) A's clone gets a push URL (`remote.origin.pushurl`, written on the
 *   host before it finishes) that a server here answers 401 to, as GitHub
 *   answered obelisk's bad credential; its fetch URL is the hub's. The item
 *   fails at once, refused before any gate step: its error says the push
 *   check (`git push --dry-run`) was refused and quotes git, git's words
 *   naming that URL; the step log is empty; main does not hold its commit.
 * - (b) B's gate step is `sleep 7313`. Once it runs, B is stopped as
 *   stop_delegate stops one (the `stop` verb). 10 s later no process of the
 *   gate is alive (no `sleep 7313` on the host), the item reads cancelled
 *   with no error, the hub says it cancelled the gate's run, and B's clone
 *   still holds its commit.
 *
 *   bun scripts/probe-kit/run.ts landing-stop
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  isAlive,
  listedPid,
  type Pid,
  signal,
} from "../../../packages/core/src/signal";
import {
  type Fleet,
  MACHINE,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import { declareGate } from "../gate";
import type { Kit, Spec } from "../kit";

const FINISH = "mcp__cawco__finish_item";
const TAG = /PROBE-STOP-([AB])/;
type Tag = "A" | "B";
/** The gate's step log, in a workspace's scratch dir. */
const STEP_LOG = "probe-gate-steps.log";
/** B's gate step's process, found on the host by its argv. */
const SLEEP = ["sleep", "7313"];
const PID = /^\d+$/;
/** Each leg's gate.md. */
const GATES: Record<Tag, string> = {
  A: `---\nsh -c 'echo "ran A" >> "$TMPDIR/${STEP_LOG}"'\n  name: step log\n---\n`,
  B: `---\nsh -c 'echo "started B" >> "$TMPDIR/${STEP_LOG}"; exec ${SLEEP.join(" ")}'\n  name: long step\n---\n`,
};
/** How the push check's refusal reads (work-items.ts `refusedLine`). */
const CHECK_REFUSED =
  "Not landed: the push check (git push --dry-run to main, before any landing gate step) from ";
const NO_STEP = "was refused, so no gate step ran";

/** Each delegate's steps so far; `armed` is set by the spec once it may finish. */
const steps: Record<
  Tag,
  Record<"armed" | "committed" | "finished" | "searched", boolean>
> = {
  A: { armed: false, committed: false, finished: false, searched: false },
  B: { armed: true, committed: false, finished: false, searched: false },
};

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
  const step = steps[tag];
  if (!step.committed) {
    step.committed = true;
    return tool("Bash", {
      command: `printf '${tag}\\n' > ${tag.toLowerCase()}.txt && git add ${tag.toLowerCase()}.txt && git -c user.name=Delegate -c user.email=d@probe.test commit -qm 'Delegate commit ${tag}'`,
      description: "Commit",
    });
  }
  if (!step.armed) {
    return tool("Bash", { command: "sleep 1", description: "Wait" });
  }
  if (!step.finished && request.toolNames.includes(FINISH)) {
    step.finished = true;
    return tool(FINISH, {
      headline: `Committed ${tag}.`,
      summary: `Committed ${tag}.\n\nNot run: none.`,
    });
  }
  if (
    !(step.finished || step.searched) &&
    request.toolNames.includes("ToolSearch")
  ) {
    step.searched = true;
    return tool("ToolSearch", { query: `select:${FINISH}`, max_results: 1 });
  }
  return text("done");
};

/** The host pids whose argv is {@link SLEEP}. */
const sleepPids = async (): Promise<Pid[]> => {
  const wanted = `${SLEEP.join("\0")}\0`;
  const found: Pid[] = [];
  for (const pid of await readdir("/proc")) {
    if (!PID.test(pid)) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: one scan of /proc
    const argv = await readFile(`/proc/${pid}/cmdline`, "utf8").catch(() => "");
    if (argv === wanted) {
      found.push(listedPid(Number(pid)));
    }
  }
  return found;
};

/** A server that answers every request 401, as a git host does a refused credential. */
const refusingOrigin = () => {
  const asked: string[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      asked.push(`${request.method} ${new URL(request.url).pathname}`);
      return new Response("Invalid username or token.\n", {
        status: 401,
        headers: { "www-authenticate": 'Basic realm="probe"' },
      });
    },
  });
  return {
    url: `http://127.0.0.1:${server.port}/refused.git`,
    asked,
    stop: () => server.stop(true),
  };
};

interface ItemRow {
  error: string | null;
  instance_id: string;
  result: string | null;
  state: string;
  workspace_id: string;
}

/** What every leg works with: the fleet, its project, and how a leg delegates. */
interface Legs {
  check: Kit["check"];
  delegate: (tag: Tag) => Promise<Delegated>;
  env: Record<string, string | undefined>;
  fleet: Fleet;
  home: string;
  mainLog: () => Promise<string[]>;
  parent: string;
  /** B's gate's processes, killed at the end when a stop did not end them. */
  sleepers: Pid[];
}

/** A delegate started on its leg's gate.md, and how the spec reads it. */
interface Delegated {
  clone: string;
  ended: () => Promise<ItemRow>;
  row: () => ItemRow | undefined;
  stepLog: () => Promise<string>;
}

const said = (row: ItemRow | undefined) =>
  `${row?.state} ${row?.error ?? ""}\n${(row?.result ?? "").slice(0, 1500)}`;

/** The project's repository: a README. */
const projectRepo = async (
  repo: string,
  env: Record<string, string | undefined>
): Promise<void> => {
  await mkdir(repo, { recursive: true });
  await writeFile(join(repo, "README.md"), "landing stop probe\n");
  await Bun.$`git init -q -b main && git add -A && git commit -qm 'First commit'`
    .cwd(repo)
    .env(env)
    .quiet();
};

/** The fleet up, its project made on {@link projectRepo}, and its parent session. */
const standUp = async (kit: Kit): Promise<Omit<Legs, "sleepers">> => {
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
  const env = { ...process.env, HOME: home };
  const repo = join(fleet.sandbox, "code");
  await projectRepo(repo, env);
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Landing stop",
    machineId: MACHINE,
    cwd: repo,
  });
  const parent = await fleet.spawn("claude", "Parent", repo, {
    projectId: project.id,
  });
  const bare = join(fleet.sandbox, "hub", "git", `${project.id}.git`);
  const itemOf = (id: string) =>
    fleet.query<ItemRow>(
      "SELECT state, error, result, instance_id, workspace_id FROM work_items WHERE id = ?",
      id
    )[0];
  const delegate = async (tag: Tag): Promise<Delegated> => {
    await declareGate(fleet.base, project.id, GATES[tag]);
    const item = await fleet.api<{ workItemId: string }>("/api/work-items", {
      parentInstanceId: parent,
      title: `Commit and land ${tag}`,
      prompt: `PROBE-STOP-${tag}: commit, then finish.`,
      harness: "claude",
      model: "claude-haiku-4-5",
      cwd: repo,
    });
    const workspace = await until(
      `${tag}'s workspace`,
      () => itemOf(item.workItemId)?.workspace_id,
      Boolean,
      300_000
    );
    const clone =
      fleet.query<{ path: string }>(
        "SELECT path FROM workspaces WHERE id = ?",
        workspace
      )[0]?.path ?? "";
    const stepLog = join(
      home,
      ".cawco",
      "tmp",
      workspace.slice(0, 8),
      STEP_LOG
    );
    return {
      clone,
      stepLog: () => readFile(stepLog, "utf8").catch(() => ""),
      row: () => itemOf(item.workItemId),
      ended: () =>
        until(
          `${tag}'s item ended`,
          () => itemOf(item.workItemId),
          (row) => ["done", "failed", "cancelled"].includes(row?.state ?? ""),
          600_000
        ) as Promise<ItemRow>,
    };
  };
  return {
    check: kit.check,
    delegate,
    env,
    fleet,
    home,
    parent,
    mainLog: async () =>
      (await Bun.$`git log --format=%s main`.cwd(bare).nothrow().quiet().text())
        .trim()
        .split("\n"),
  };
};

/** (a) The push refused: the landing ends at once, and no gate step runs. */
const legA = async (legs: Legs, origin: ReturnType<typeof refusingOrigin>) => {
  const { check } = legs;
  const a = await legs.delegate("A");
  await until(
    "A committed",
    () => Bun.$`git log -1 --format=%s`.cwd(a.clone).nothrow().quiet().text(),
    (subject) => subject.trim() === "Delegate commit A",
    300_000
  );
  await Bun.$`git config --file ${join(a.clone, ".git", "config")} remote.origin.pushurl ${origin.url}`.quiet();
  steps.A.armed = true;
  const row = await a.ended();
  const words = `${row.error ?? ""}\n${row.result ?? ""}`;
  const log = await a.stepLog();
  check(
    "(a) a landing whose push is refused fails at once, refused before any gate step, quoting git's words, which name the push URL",
    row.state === "failed" &&
      words.includes(CHECK_REFUSED) &&
      words.includes(NO_STEP) &&
      words.includes(`127.0.0.1:${new URL(origin.url).port}`),
    `${said(row)}\nthe refusing origin was asked: ${origin.asked.join(", ") || "nothing"}`
  );
  check(
    "(a) no gate step ran: the gate's step log is empty",
    log.trim() === "",
    log || "(empty)"
  );
  const main = await legs.mainLog();
  check(
    "(a) main does not hold A's commit",
    !main.includes("Delegate commit A"),
    main.join(" | ")
  );
};

/** (b) Stopped mid-gate: no process of the gate outlives the stop. */
const legB = async (legs: Legs) => {
  const { check } = legs;
  const b = await legs.delegate("B");
  await until(
    "B's gate step runs",
    async () =>
      (await b.stepLog()).includes("started B") &&
      (await sleepPids()).length > 0,
    Boolean,
    600_000
  );
  const sleepers = await sleepPids();
  legs.sleepers.push(...sleepers);
  const instance = b.row()?.instance_id ?? "";
  await legs.fleet.post({
    verb: "stop",
    machineId: MACHINE,
    instanceId: instance,
    requestId: crypto.randomUUID(),
    payload: { instanceId: instance, from: legs.parent },
  });
  await Bun.sleep(10_000);
  const alive = sleepers.filter((pid) => isAlive(pid));
  const left = await sleepPids();
  const row = b.row();
  const cancelled = (await legs.fleet.logs("hub"))
    .split("\n")
    .filter((line) => line.includes("cancelling landing gate run"));
  check(
    "(b) 10 s after the stop, no process of the gate is alive",
    sleepers.length > 0 && alive.length === 0 && left.length === 0,
    `the gate's sleep: ${sleepers.join(", ") || "never found"}; alive after 10 s: ${alive.join(", ") || "none"}; any sleep 7313 left: ${left.join(", ") || "none"}`
  );
  check(
    "(b) the item reads cancelled, with no error, and the hub cancelled the gate's run",
    row?.state === "cancelled" && !row.error && cancelled.length > 0,
    `${said(row)}\nhub: ${cancelled.join("\n") || "no cancel said"}`
  );
  const head = await Bun.$`git log -1 --format=%s`
    .cwd(b.clone)
    .nothrow()
    .quiet()
    .text();
  check(
    "(b) the workspace keeps its checkout: B's clone still holds its commit",
    head.trim() === "Delegate commit B",
    `${b.clone}: ${head.trim() || "no clone"}`
  );
};

const run = async (kit: Kit) => {
  const origin = refusingOrigin();
  const sleepers: Pid[] = [];
  try {
    const legs: Legs = { ...(await standUp(kit)), sleepers };
    await legA(legs, origin);
    await legB(legs);
  } finally {
    // A gate a stop did not end (the defect this spec catches) ends here.
    for (const pid of sleepers) {
      if (isAlive(pid)) {
        signal(pid, "SIGKILL");
      }
    }
    origin.stop();
  }
};

export default { name: "landing-stop", run } satisfies Spec;

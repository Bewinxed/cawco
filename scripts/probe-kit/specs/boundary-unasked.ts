/**
 * A workspace's boundary that ends unasked while a delegate still runs in it
 * is started again for the delegate's next command, on Linux and on macOS
 * alike (agent boundary.ts `restartUnasked`, `watchHost`), and not in a
 * loop. On a scratch fleet (real hub, agent and sessiond; Claude Code
 * against the mock model). This spec delegates, so its fleet cuts
 * workspaces: it runs on the host, outside every boundary, on Linux (the srt
 * host's bwrap sandbox) and on a Mac (the Seatbelt runner) alike.
 *
 * A delegate starts a `sleep` in the background, then runs one short command
 * after another (`printf 'RAN-%s\n' ok`) until the spec lets it finish. The
 * spec reads its boundary's process from its record (`boundary.json`: the
 * srt host on Linux; on macOS the runner `sandbox-exec` became, under the
 * same pid), checked by its command line, and kills it with SIGKILL: nothing
 * of the agent's ended it.
 *
 * - u1. The agent records the boundary started again unasked
 *   (`restarted-unasked`, agent boundary.ts `BoundaryDecision`), its record
 *   names a new generation whose process is alive, the one the decision
 *   names.
 * - u2. The old process and the delegate's background sleep are gone within
 *   10 s of the restart (on macOS the start stops what answers to the old
 *   generation's name, which outlives its runner there).
 * - u3. The delegate's next command runs: a `RAN-ok` it printed after the
 *   restart, and no "boundary is not running" refusal since the kill (the
 *   executor waits for the new boundary, then runs through it).
 * - u4. Killed again within 60 s of that restart, the boundary is left
 *   down, as the agent records (`left-down`): its record still names the
 *   same generation and its process stays dead, not started in a loop.
 * - u5. The delegate is let finish; its item ends done (nothing to land).
 *
 *   bun scripts/probe-kit/run.ts boundary-unasked
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  isAlive,
  listedPid,
  type Pid,
  signal,
} from "../../../packages/core/src/signal";
import { readRecord } from "../../../packages/core/src/state-file";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { decisionsOf } from "../agent-records";
import type { Kit, Spec } from "../kit";

const FINISH = "mcp__cawco__finish_item";
const TAG = "PROBE-UNASKED";
/** The delegate's background command, found on the host by its argv. */
const SLEEP = ["sleep", "7315"];
/** What each of its short commands prints; the command's own text never holds it. */
const RAN = "RAN-ok";
/** The executor's refusal when no boundary runs (agent boundary.ts `stoppedLine`). */
const STOPPED = "boundary is not running";
/** A process's entry in `/proc` (Linux) — macOS is read with `ps`. */
const PID = /^\d+$/u;
/** How long an ended boundary's processes get to be gone. */
const GONE_MS = 10_000;

/** The delegate's steps: started its sleep, let finish, finished, searched for finish_item. */
const step: Record<"armed" | "background" | "finished" | "searched", boolean> =
  {
    background: false,
    armed: false,
    searched: false,
    finished: false,
  };
/** How many times `RAN-ok` and the refusal appear in what the delegate has been told. */
const seen = { ran: 0, stopped: 0 };

const count = (text: string, part: string): number =>
  text.split(part).length - 1;

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  const tool = (name: string, input: object): Reply => ({
    everyMs: 5,
    words: [],
    tool: { name, input },
  });
  if (!(request.tools && request.all.includes(TAG))) {
    return text("ok");
  }
  seen.ran = Math.max(seen.ran, count(request.all, RAN));
  seen.stopped = Math.max(seen.stopped, count(request.all, STOPPED));
  if (!step.background) {
    step.background = true;
    return tool("Bash", {
      command: SLEEP.join(" "),
      description: "Run in the background",
      run_in_background: true,
    });
  }
  if (!step.armed) {
    return tool("Bash", {
      command: "sleep 1; printf 'RAN-%s\\n' ok",
      description: "One more command",
    });
  }
  if (!step.finished && request.toolNames.includes(FINISH)) {
    step.finished = true;
    return tool(FINISH, {
      headline: "Ran the commands.",
      summary: "Ran the commands.\n\nNot run: none.",
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

/** Each running process's pid and argv joined by spaces: `/proc` on Linux, `ps` on macOS. */
const processes = async (): Promise<{ pid: number; argv: string }[]> => {
  if (process.platform !== "linux") {
    const listed = await Bun.$`ps -axo pid=,command=`.quiet().nothrow().text();
    return listed
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => ({
        pid: Number(line.slice(0, line.indexOf(" "))),
        argv: line.slice(line.indexOf(" ") + 1),
      }));
  }
  const rows = await Promise.all(
    (await readdir("/proc"))
      .filter((name) => PID.test(name))
      .map(async (name) => ({
        pid: Number(name),
        argv: (
          await readFile(`/proc/${name}/cmdline`, "utf8").catch(() => "")
        ).replaceAll("\0", " "),
      }))
  );
  return rows.filter((row) => row.argv);
};

/** The host pid of the delegate's background sleep, if it runs. */
const sleepPid = async (): Promise<Pid | undefined> => {
  const wanted = SLEEP.join(" ");
  const found = (await processes()).find((row) => row.argv.trim() === wanted);
  return found ? listedPid(found.pid) : undefined;
};

/**
 * `pid`'s command line when it is a boundary's, read for that one process:
 * on Linux the srt host (`boundary-host.ts`, a binary install's
 * `srt/host.js`); on macOS the runner, which `sandbox-exec` runs in its own
 * place once it has entered the sandbox, under the same pid: its command
 * line is then the runner's bash, named `cawco-boundary` (agent boundary.ts
 * `planFor`), no longer `sandbox-exec` (r189 on the Mac read pid 97318 as
 * no boundary for that). Undefined for any other process, or none.
 */
const isBoundaryProcess = async (pid: number): Promise<string | undefined> => {
  const argv =
    process.platform === "linux"
      ? (
          await readFile(`/proc/${pid}/cmdline`, "utf8").catch(() => "")
        ).replaceAll("\0", " ")
      : await Bun.$`ps -p ${pid} -o command=`.quiet().nothrow().text();
  return argv.includes("cawco-boundary") ||
    argv.includes("sandbox-exec") ||
    argv.includes("boundary-host") ||
    argv.includes("host.js")
    ? argv.trim()
    : undefined;
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

  const home = fleet.env.HOME as string;
  const repo = join(fleet.sandbox, "code");
  await Bun.$`mkdir -p ${repo} && cd ${repo} && git init -q -b main && printf 'unasked probe\\n' > README.md && git add -A && git -c user.name=Owner -c user.email=owner@probe.test commit -qm 'First commit'`.quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Boundary ended unasked",
    machineId: MACHINE,
    cwd: repo,
  });
  const parent = await fleet.spawn("claude", "Parent", repo, {
    projectId: project.id,
  });
  const item = await fleet.api<{ workItemId: string }>("/api/work-items", {
    parentInstanceId: parent,
    title: "Run commands while the boundary ends",
    prompt: `${TAG}: run commands, then finish.`,
    harness: "claude",
    model: "claude-haiku-4-5",
    cwd: repo,
  });
  const itemOf = () =>
    fleet.query<{ state: string; error: string | null; workspace_id: string }>(
      "SELECT state, error, workspace_id FROM work_items WHERE id = ?",
      item.workItemId
    )[0];
  const sleeping = await until(
    "the delegate's background sleep runs",
    sleepPid,
    Boolean,
    300_000
  );
  const workspace = await until(
    "the delegate's workspace",
    () => itemOf()?.workspace_id || undefined,
    Boolean,
    60_000
  );
  const held = () =>
    readRecord<{ gen: string; pid: number }>(
      join(home, ".cawco", "workspaces", workspace, "boundary.json")
    ).catch(() => undefined);
  /** The agent's decisions of the workspace's boundary since `from` (ms since the epoch). */
  const decidedSince = async (from: number) =>
    (await decisionsOf(home, workspace)).filter((one) => one.at >= from);

  // u1–u3: killed once
  const old = await until("its boundary's record", held, Boolean, 60_000);
  const oldArgv = await isBoundaryProcess(old.pid);
  if (!oldArgv) {
    check(
      "the record names a live boundary process (the srt host, or the runner sandbox-exec runs)",
      false,
      `pid ${old.pid}: ${JSON.stringify(old)}`
    );
    return;
  }
  const decidedBefore = Date.now();
  const stoppedBefore = seen.stopped;
  signal(listedPid(old.pid), "SIGKILL");
  const restarted = await until(
    "the agent starts it again",
    async () =>
      (await decidedSince(decidedBefore)).find(
        (one) => one.decision === "restarted-unasked" && one.gen === old.gen
      ),
    Boolean,
    60_000
  ).catch(() => undefined);
  const restartedAt = Date.now();
  const fresh = await held();
  check(
    "u1: killed unasked, the boundary is started again: the agent records it, and its record names the new generation the decision names, its process alive",
    restarted?.decision === "restarted-unasked" &&
      fresh !== undefined &&
      fresh.gen !== old.gen &&
      restarted.to.gen === fresh.gen &&
      isAlive(listedPid(fresh.pid)),
    `old: gen ${old.gen}, pid ${old.pid} (${oldArgv.slice(0, 120)}); new: ${JSON.stringify(fresh)}; decided since the kill: ${JSON.stringify(await decidedSince(decidedBefore))}`
  );
  const gone = await until(
    "the old boundary and the sleep gone",
    () => (isAlive(listedPid(old.pid)) || isAlive(sleeping) ? undefined : true),
    Boolean,
    GONE_MS
  ).catch(() => false);
  check(
    "u2: the old boundary process and the delegate's background sleep are gone within 10 s",
    gone,
    `old pid ${old.pid} ${isAlive(listedPid(old.pid)) ? "alive" : "gone"}, sleep ${sleeping} ${isAlive(sleeping) ? "alive" : "gone"}`
  );
  const ranAtRestart = seen.ran;
  const ranAfter = await until(
    "a command run after the restart",
    () => (seen.ran > ranAtRestart ? seen.ran : undefined),
    Boolean,
    30_000
  ).catch(() => undefined);
  check(
    "u3: the delegate's next command runs in the new boundary, and none was refused as having no boundary since the kill",
    ranAfter !== undefined && seen.stopped === stoppedBefore,
    `RAN-ok seen ${ranAtRestart} at the restart, ${seen.ran} after; refusals ${stoppedBefore} before the kill, ${seen.stopped} now`
  );

  // u4: killed again within 60 s of that restart
  const second = await held();
  const elapsed = Date.now() - restartedAt;
  if (second && (await isBoundaryProcess(second.pid)) && elapsed < 50_000) {
    const decidedAgain = Date.now();
    signal(listedPid(second.pid), "SIGKILL");
    const leftDown = await until(
      "the agent leaves it down",
      async () =>
        (await decidedSince(decidedAgain)).find(
          (one) => one.decision === "left-down" && one.gen === second.gen
        ),
      Boolean,
      20_000
    ).catch(() => undefined);
    await Bun.sleep(5000);
    const after = await held();
    const since = await decidedSince(decidedAgain);
    check(
      "u4: killed again within 60 s of its restart, the boundary is left down, as the agent records: its record names the same generation and its process stays dead",
      leftDown !== undefined &&
        after?.gen === second.gen &&
        !isAlive(listedPid(second.pid)) &&
        !since.some((one) => one.decision === "restarted-unasked"),
      `decided since the second kill: ${JSON.stringify(since)}; record ${JSON.stringify(after)}`
    );
  } else {
    check(
      "u4: the restarted boundary could be killed again within 60 s of its restart",
      false,
      `record ${JSON.stringify(second)}, ${Math.round(elapsed / 1000)} s after the restart`
    );
  }

  // u5
  step.armed = true;
  const ended = await until(
    "the delegate's item ended",
    itemOf,
    (one) => ["done", "failed", "cancelled"].includes(one.state),
    600_000
  );
  check(
    "u5: let finish, the delegate's item ends done",
    ended.state === "done",
    `${ended.state} ${ended.error ?? ""}`
  );
};

export default {
  group: "Workspaces and what agents may touch",
  name: "boundary-unasked",
  host: "it delegates, so its fleet cuts workspaces",
  run,
} satisfies Spec;

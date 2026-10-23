/**
 * What a delegate starts in its workspace and leaks, the delegate is told,
 * and nothing is stopped (agent leak-watch.ts on a workspace's boundary,
 * boundary.ts `sandboxOf`; hub server.ts `tellLeak`). leak-notice proves it
 * for a session's own processes; this is the boundary's half. On a scratch
 * fleet (real hub, agent and sessiond; Claude Code against the mock model),
 * boundaries included: it delegates, so it runs on the host, outside every
 * workspace.
 *
 * The agent's leak threshold is {@link THRESHOLD_GIB} GiB
 * (`CAWCO_LEAK_MEMORY_GIB`). The delegate runs two commands in its
 * workspace's boundary:
 *
 * - a background command whose process, named `leak-probe-W`, grows 8 MiB a
 *   second to 1.5 GiB and holds it;
 * - a foreground command that leaves `sleep 600.0961` double-forked into a
 *   session of its own (`fork and exit; setsid`), so it is the sandbox
 *   init's from its first instant, and ends at once.
 *
 * Then it rests (`wait_item`), its item live, as a delegate waiting on its
 * runs does; told of the leftover it rests again, and told of the leak it
 * ends its item blocked, the leaking process still climbing.
 *
 * - (w1) Within {@link LEFT_WAIT_MS} the delegate reads that a process it
 *   started is still running after what started it ended, naming
 *   `sleep 600.0961` and its workspace.
 * - (w2) Within {@link MEMORY_WAIT_MS} it reads that a process it started
 *   is leaking memory, naming `leak-probe-W` and its workspace.
 * - (w3) With its item ended (it takes no message now), the session that
 *   delegated it reads the leak's next height instead, naming the delegate's
 *   item and `leak-probe-W` (hub server.ts `tellLeak`).
 * - (w4) Both processes are still running.
 *
 *   bun scripts/probe-kit/run.ts leak-notice-workspace
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { commandLines } from "../../../packages/core/src/process-identity";
import {
  isAlive,
  listedPid,
  signal as signalPid,
} from "../../../packages/core/src/signal";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const THRESHOLD_GIB = 0.25;
const MEMORY_WAIT_MS = 180_000;
const LEFT_WAIT_MS = 90_000;
const TAG = "PROBE-LEAK-WS";
const LEAKER = "leak-probe-W";
const LEFTOVER = "600.0961";
const GROW = `exec -a ${LEAKER} perl -e 'my @k; for (1 .. 192) { push @k, "x" x (8 * 1024 * 1024); select(undef, undef, undef, 1); } sleep 900;'`;
const LEAVE = `perl -MPOSIX -e 'fork and exit; POSIX::setsid(); open(STDIN, "<", "/dev/null"); open(STDOUT, ">", "/dev/null"); open(STDERR, ">", "/dev/null"); exec @ARGV' sleep ${LEFTOVER}; echo LEFT-DONE`;

const WAIT = "mcp__cawco__wait_item";
const FINISH = "mcp__cawco__finish_item";
const REST = { minutes: 30, reason: "its runs in the workspace" };
const BLOCKED = {
  headline: "Stopped here for the probe.",
  summary: "Stopped here for the probe.",
  blocked: { command: "probe", error: "the probe ends this item here" },
};

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const tool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});
const bash = (command: string, background: boolean): Reply => ({
  everyMs: 5,
  words: [],
  tool: {
    name: "Bash",
    input: {
      command,
      description: background ? "Grow memory" : "Leave a process behind",
      ...(background ? { run_in_background: true } : { timeout: 120_000 }),
    },
  },
});

/** How far the delegate is into its two commands. */
let step = 0;
/** The CawCo tool asked for once ToolSearch has loaded it. */
let pending: { input: object; name: string } | undefined;
/** Whether the delegate has ended its item, told of its leak. */
let ended = false;

/** A call of `name`, through ToolSearch while it is not loaded yet. */
const want = (request: Seen, name: string, input: object): Reply => {
  if (request.toolNames.includes(name)) {
    pending = undefined;
    return tool(name, input);
  }
  pending = { name, input };
  return request.toolNames.includes("ToolSearch")
    ? tool("ToolSearch", { query: `select:${name}`, max_results: 1 })
    : text(`${name} is not offered`);
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (!request.all.includes(TAG)) {
    return text("ok");
  }
  if (step === 0) {
    step = 1;
    return bash(GROW, true);
  }
  if (step === 1 && request.afterTool) {
    step = 2;
    return bash(LEAVE, false);
  }
  if (request.afterTool) {
    if (pending) {
      return want(request, pending.name, pending.input);
    }
    if (step === 2) {
      step = 3;
      return want(request, WAIT, REST);
    }
    return text("ok");
  }
  if (!ended && request.last.includes("leaking memory")) {
    ended = true;
    return want(request, FINISH, BLOCKED);
  }
  if (!ended && request.last.includes("still running after")) {
    return want(request, WAIT, REST);
  }
  return text("ok");
};

const pidsOf = async (start: string): Promise<number[]> =>
  (await commandLines())
    .filter((line) => line.command.startsWith(start))
    .map((line) => line.pid);

const toldWith = (seen: readonly Seen[], words: readonly string[]) =>
  seen.find((request) => words.every((word) => request.last.includes(word)))
    ?.last;

const spec: Spec = {
  name: "leak-notice-workspace",
  host: "its delegate's commands run in a workspace boundary",
  run: async (kit: Kit) => {
    const { check } = kit;
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent", [], { CAWCO_LEAK_MEMORY_GIB: String(THRESHOLD_GIB) });
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const home = fleet.env.HOME as string;
    await writeFile(
      join(home, ".gitconfig"),
      "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
    );
    const repo = join(fleet.sandbox, "code");
    await Bun.$`mkdir -p ${repo} && cd ${repo} && git init -q -b main && echo leak > README.md && git add -A && git commit -qm 'First commit'`
      .env({ ...process.env, HOME: home })
      .quiet();
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "Leak notice",
      machineId: MACHINE,
      cwd: repo,
    });
    const parent = await fleet.spawn("claude", "Parent", repo, {
      projectId: project.id,
    });
    try {
      const item = await fleet.api<{ workItemId: string }>("/api/work-items", {
        parentInstanceId: parent,
        title: "Leak in a workspace",
        prompt: `${TAG}: run the commands.`,
        harness: "claude",
        model: "claude-haiku-4-5",
        cwd: repo,
      });
      const workspace = await until(
        "the delegate's workspace",
        () =>
          fleet.query<{ workspace_id: string | null }>(
            "SELECT workspace_id FROM work_items WHERE id = ?",
            item.workItemId
          )[0]?.workspace_id,
        Boolean,
        300_000
      );
      const where = `in workspace ${(workspace ?? "").slice(0, 8)}`;
      const leftTold = await until(
        "the delegate told of its leftover",
        () =>
          toldWith(fleet.seen, ["still running after", `sleep ${LEFTOVER}`]),
        Boolean,
        LEFT_WAIT_MS + 120_000
      ).catch(() => undefined);
      check(
        "(w1) the delegate reads that a process it left in its workspace is still running, naming it and the workspace",
        !!leftTold?.includes(where),
        leftTold ?? `no such message; its commands reached step ${step}`
      );
      const memoryTold = await until(
        "the delegate told of its leaking process",
        () => toldWith(fleet.seen, ["leaking memory", LEAKER]),
        Boolean,
        MEMORY_WAIT_MS
      ).catch(() => undefined);
      check(
        "(w2) the delegate reads that a process it started in its workspace is leaking memory, naming it and the workspace",
        !!memoryTold?.includes(where),
        memoryTold ?? "no such message"
      );
      const parentTold = await until(
        "the parent told of its ended delegate's leak",
        () => toldWith(fleet.seen, ["Your delegate", "leaking memory", LEAKER]),
        Boolean,
        MEMORY_WAIT_MS
      ).catch(() => undefined);
      check(
        "(w3) with the delegate's item ended, the session that delegated it reads the leak instead, naming the item and the process",
        !!parentTold?.includes(item.workItemId.slice(0, 8)),
        parentTold ??
          `no such message; the delegate ${ended ? "ended its item" : "never ended its item"}`
      );
      const [leakers, leftovers] = await Promise.all([
        pidsOf(LEAKER),
        pidsOf(`sleep ${LEFTOVER}`),
      ]);
      check(
        "(w4) both processes are still running",
        leakers.some((pid) => isAlive(listedPid(pid))) &&
          leftovers.some((pid) => isAlive(listedPid(pid))),
        `${LEAKER}: ${leakers.join(", ") || "none"}; sleep ${LEFTOVER}: ${leftovers.join(", ") || "none"}`
      );
    } finally {
      const probes = await Promise.all([
        pidsOf(LEAKER),
        pidsOf(`sleep ${LEFTOVER}`),
      ]);
      for (const pid of probes.flat()) {
        signalPid(listedPid(pid), "SIGKILL");
      }
    }
  },
};

export default spec;

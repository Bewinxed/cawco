/**
 * What a delegate starts in its workspace and leaks, the delegate is told
 * while its item is live, and nothing is stopped (agent leak-watch.ts on a
 * workspace's boundary, boundary.ts `sandboxOf`); once its item has ended,
 * what it left running there ends (hub work-items.ts `endLeftWork`, agent
 * boundary.ts `endSessionWork`) and its parent is told of no leftover (hub
 * server.ts `tellLeak`). leak-notice proves the watcher for a session's own
 * processes; this is the boundary's half. On a scratch fleet (real hub,
 * agent and sessiond; Claude Code against the mock model), boundaries
 * included: it delegates, so it runs on the host, outside every workspace.
 *
 * The agent's leak threshold is {@link THRESHOLD_GIB} GiB
 * (`CAWCO_LEAK_MEMORY_GIB`). The delegate runs three commands in its
 * workspace's boundary:
 *
 * - a background command whose process, named `leak-probe-W`, grows 8 MiB a
 *   second to 1.5 GiB and holds it;
 * - a background command that runs the machine's Chromium headless (the one
 *   the daemon's render draws with, agent capabilities.ts
 *   `browserExecutable`) {@link BROWSER_HOLD_S} s, past a leftover's grace
 *   and two looks, counting its crash handlers, then ends it and counts
 *   again. Chromium starts them in a session of their own, the sandbox
 *   init's from their first instant, and they end with it;
 * - a foreground command that leaves `sleep 600.0961` double-forked into a
 *   session of its own (`fork and exit; setsid`), so it is the sandbox
 *   init's from its first instant, and ends at once.
 *
 * Then it rests (`wait_item`), its item live, as a delegate waiting on its
 * runs does; told of the leftover it rests again, and told of the leak it
 * ends its item blocked, the leaking process still climbing and its
 * background command still running. Before it answers that notice the probe
 * reads what (w4) and (w5) name of its runs ({@link readRuns}): the leaker's
 * pids and the browser's output. Within half a second of the item's end its
 * workspace's settle has ended them, and once its session sleeps the
 * workspace retires, its scratch dir (where Claude Code writes a background
 * command's output) with it; read after the end, on round r331, the pids
 * were gone and, ten seconds on, the output too.
 *
 * - (w1) Within {@link LEFT_WAIT_MS} the delegate reads that a process it
 *   started is still running after what started it ended, naming
 *   `sleep 600.0961` and its workspace.
 * - (w2) Within {@link MEMORY_WAIT_MS} it reads that a process it started
 *   is leaking memory, naming `leak-probe-W` and its workspace.
 * - (w4) Within {@link ENDED_WAIT_MS} of its item's end, `sleep 600.0961`
 *   and `leak-probe-W` are gone while the workspace's boundary still runs on
 *   the keeper (or closed with the session's sleep, which the hub asks of a
 *   delegate whose item is over, server.ts `sleepFinished`) and the session
 *   was not stopped, and the agent's log says the session `finished`, naming
 *   the leaker's pid among those it ended.
 * - (w5) The browser ran with its crash handlers, which ended with it, and
 *   no session read a leftover naming a crash handler, nor did the agent's
 *   log say one: on main every browser launch in a workspace was told as "2
 *   processes this session started are still running after the process
 *   that started them ended".
 * - (w6) The session that delegated it read no leftover of its delegate's
 *   (on 2026-10-24 a parent was told to end three pids a done delegate
 *   left). What its parent reads of an ended delegate's climbing process
 *   (the old (w3)), and the notice row its person sees of it (the old
 *   (w3b)), are ended-item-work's (a2) and (a2b): there a preview keeps the
 *   leaking server running after its item ends, as nothing does here.
 *
 *   bun scripts/probe-kit/run.ts leak-notice-workspace
 */
import { realpathSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { browserExecutable } from "../../../packages/agent/src/capabilities";
import { isBoundaryOf } from "../../../packages/agent/src/proc-id";
import { commandLines } from "../../../packages/core/src/process-identity";
import {
  isAlive,
  listedPid,
  signal as signalPid,
} from "../../../packages/core/src/signal";
import { leakWords } from "../../../packages/core/src/words/leaks";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const THRESHOLD_GIB = 0.25;
const MEMORY_WAIT_MS = 180_000;
const LEFT_WAIT_MS = 90_000;
/** How soon after its item's end what the delegate left running is gone: the hub's settle, then its machine's SIGTERM, grace and SIGKILL (agent boundary.ts `WORK_GRACE_MS`). */
const ENDED_WAIT_MS = 15_000;
const TAG = "PROBE-LEAK-WS";
const LEAKER = "leak-probe-W";
const LEFTOVER = "600.0961";
/** How long the browser runs: a leftover's 10 s grace, two looks of 10 s, and room. */
const BROWSER_HOLD_S = 35;
/** The browser the daemon's render draws with, its links followed (`/usr/bin/google-chrome` is one into `/opt/google/chrome`). */
const FOUND = browserExecutable();
const BROWSER = FOUND ? realpathSync(FOUND) : "chromium";
/**
 * Where it is installed: its `.app` bundle on macOS, its folder elsewhere
 * (leak-watch.ts `installOf`). Its crash handlers live there, and a notice
 * naming one names it within the notice's cut of a command line (on macOS
 * the cut falls before `crashpad`). With no browser found, the handler's
 * own name.
 */
const INSTALL = (() => {
  if (!FOUND) {
    return "crashpad";
  }
  return BROWSER.includes(".app/")
    ? BROWSER.slice(0, BROWSER.indexOf(".app/") + 4)
    : dirname(BROWSER);
})();
/**
 * Its crash handlers, as a `pgrep -f` pattern: on macOS those inside its `.app`
 * bundle (beside them run any other browser's or Electron app's); elsewhere
 * every one. `handle[r]` keeps the pattern from matching the shell whose
 * command line carries it.
 */
const HANDLERS = BROWSER.includes(".app/")
  ? `${INSTALL}/.*crashpad_handle[r]`
  : "crashpad_handle[r]";
/** Chromium headless for {@link BROWSER_HOLD_S} s, its crash handlers counted while it runs and once it ended (`| wc -l`: BSD pgrep has no -c). */
const BROWSE = (executable: string) =>
  `D=$(mktemp -d); H=${JSON.stringify(HANDLERS)}; ${JSON.stringify(executable)} --headless --disable-gpu --no-sandbox --user-data-dir="$D" about:blank > /dev/null 2>&1 & P=$!; sleep ${BROWSER_HOLD_S}; echo "HANDLERS-RUNNING=$(pgrep -f "$H" | wc -l | tr -d ' ')"; kill $P; wait $P; sleep 3; echo "HANDLERS-AFTER=$(pgrep -f "$H" | wc -l | tr -d ' ')"; rm -rf "$D"; echo BROWSER-DONE`;
const HANDLERS_RUNNING = /HANDLERS-RUNNING=(\d+)/;
const HANDLERS_AFTER = /HANDLERS-AFTER=(\d+)/;
/** Where Claude Code writes a background command's output, as its tool result says. */
const OUTPUT_FILE = /Output is being written to: (\S+?\.output)/g;
/** How long the browser's output is waited on once the other legs are read. */
const BROWSER_WAIT_MS = 120_000;
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
const bash = (
  command: string,
  background: boolean,
  description: string
): Reply => ({
  everyMs: 5,
  words: [],
  tool: {
    name: "Bash",
    input: {
      command,
      description,
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
/** What the probe read of the delegate's runs as it was told of its leak, before it ended its item ({@link readRuns}). */
let runs: Runs | undefined;

interface Runs {
  /** The browser command's output, once it reached BROWSER-DONE; nothing when it did not within {@link BROWSER_WAIT_MS}. */
  browsed: string | undefined;
  /** The leaker's pids, as the agent's line names those it ended. */
  leakerPids: number[];
  /** How many background outputs the delegate's commands had. */
  outputs: number;
}

/**
 * The leaker's pids and the browser's output, read from the request that
 * tells the delegate of its leak, while its item is live: the files Claude
 * Code writes a background command's output into, as its tool results in
 * the request say, read until the browser's reaches BROWSER-DONE (it ends
 * {@link BROWSER_HOLD_S} s and a few in, a minute before a leak is told).
 */
const readRuns = async (request: Seen): Promise<Runs> => {
  const files = [
    ...new Set(
      [...request.body.matchAll(OUTPUT_FILE)].map((one) => one[1] ?? "")
    ),
  ];
  const browsed = await until(
    "the browser command's output",
    async () =>
      (await Promise.all(files.map(textOf))).find((said) =>
        said.includes("BROWSER-DONE")
      ),
    Boolean,
    BROWSER_WAIT_MS
  ).catch(() => undefined);
  return { browsed, outputs: files.length, leakerPids: await pidsOf(LEAKER) };
};

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

const respond = async (request: Seen): Promise<Reply> => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (!request.all.includes(TAG)) {
    return text("ok");
  }
  if (step === 0) {
    step = 1;
    return bash(GROW, true, "Grow memory");
  }
  if (step === 1 && request.afterTool) {
    step = 2;
    // In the background: a notice arriving while it runs (main's watcher told one for its crash handlers) backgrounds a foreground command, and its result never comes back.
    return bash(BROWSE(BROWSER), true, "Run a browser");
  }
  if (step === 2 && request.afterTool) {
    step = 3;
    return bash(LEAVE, false, "Leave a process behind");
  }
  if (request.afterTool) {
    if (pending) {
      return want(request, pending.name, pending.input);
    }
    if (step === 3) {
      step = 4;
      return want(request, WAIT, REST);
    }
    return text("ok");
  }
  if (!ended && request.last.includes(leakWords.leaking)) {
    ended = true;
    runs = await readRuns(request);
    return want(request, FINISH, BLOCKED);
  }
  if (!ended && request.last.includes(leakWords.leftBehind)) {
    return want(request, WAIT, REST);
  }
  return text("ok");
};

/** A file's text, or nothing where it is not there yet. */
const textOf = async (file: string): Promise<string> => {
  try {
    return await Bun.file(file).text();
  } catch {
    return "";
  }
};

const pidsOf = async (start: string): Promise<number[]> =>
  (await commandLines())
    .filter((line) => line.command.startsWith(start))
    .map((line) => line.pid);

const toldWith = (seen: readonly Seen[], words: readonly string[]) =>
  seen.find((request) => words.every((word) => request.last.includes(word)))
    ?.last;

/**
 * (w4) What the delegate left running, read from its item's end: gone
 * within {@link ENDED_WAIT_MS}, the boundary read as it stood when the last
 * of it went, and the agent's line that ended it.
 */
const endedCheck = async (
  kit: Kit,
  fleet: KitFleet,
  of: {
    delegate: string;
    item: string;
    leakerPids: readonly number[];
    workspace: string;
  }
): Promise<void> => {
  const endedAt = await until(
    "the delegate's item ended",
    () =>
      fleet.query<{ ended_at: number | null }>(
        "SELECT ended_at FROM work_items WHERE id = ?",
        of.item
      )[0]?.ended_at,
    (at) => typeof at === "number",
    MEMORY_WAIT_MS
  ).catch(() => undefined);
  const gone = await until(
    "the delegate's leftovers ended",
    async () => {
      const [leakers, leftovers] = await Promise.all([
        pidsOf(LEAKER),
        pidsOf(`sleep ${LEFTOVER}`),
      ]);
      return {
        running: [...leakers, ...leftovers].filter((pid) =>
          isAlive(listedPid(pid))
        ),
        boundary: (await fleet.heldProcs()).some(({ procId }) =>
          isBoundaryOf(procId, of.workspace)
        ),
        at: Date.now(),
      };
    },
    (now) => now.running.length === 0,
    ENDED_WAIT_MS + 30_000
  ).catch(() => undefined);
  const seconds =
    gone && typeof endedAt === "number"
      ? (gone.at - endedAt) / 1000
      : Number.NaN;
  const status = fleet.instance(of.delegate)?.status;
  const finishedLine = await until(
    "the agent's line that the delegate finished",
    async () =>
      (await fleet.logs("agent"))
        .split("\n")
        .find(
          (line) =>
            line.includes(
              `${of.delegate}: finished, so what it left running`
            ) && of.leakerPids.some((pid) => line.includes(String(pid)))
        ),
    (line) => line !== undefined,
    10_000
  ).catch(() => undefined);
  const left = gone
    ? `gone ${seconds.toFixed(1)} s after the item ended, the boundary ${gone.boundary ? "running" : "gone"}`
    : `still running: ${LEAKER} ${(await pidsOf(LEAKER)).join(", ") || "none"}, sleep ${LEFTOVER} ${(await pidsOf(`sleep ${LEFTOVER}`)).join(", ") || "none"}`;
  kit.check(
    "(w4) within 15 s of its item's end the delegate's leftover and leaking processes are gone, its boundary runs on unless its session's sleep closed it, its session was not stopped, and the agent's log says it finished, naming the leaker's pid",
    gone !== undefined &&
      seconds <= ENDED_WAIT_MS / 1000 &&
      // A delegate whose item is over is put to sleep once at rest (hub
      // server.ts `sleepFinished`), and its sleep closes the boundary: on a
      // Mac host run that came within the same read as the work's end. The
      // agent's line is what says the work's end took them, not the sleep.
      (gone.boundary || status === "sleeping") &&
      (status === "running" || status === "sleeping") &&
      finishedLine !== undefined,
    `${left}; session ${status}; leaker pids ${of.leakerPids.join(", ") || "none seen"}; ${finishedLine ?? "no agent line saying it finished"}`
  );
};

const spec: Spec = {
  group: "Workspaces and what agents may touch",
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
      const item = await fleet.api<{ instanceId: string; workItemId: string }>(
        "/api/work-items",
        {
          parentInstanceId: parent,
          title: "Leak in a workspace",
          prompt: `${TAG}: run the commands.`,
          harness: "claude",
          model: "claude-haiku-4-5",
          cwd: repo,
        }
      );
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
        () => toldWith(fleet.seen, [leakWords.leftBehind, `sleep ${LEFTOVER}`]),
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
        () => toldWith(fleet.seen, [leakWords.leaking, LEAKER]),
        Boolean,
        MEMORY_WAIT_MS
      ).catch(() => undefined);
      check(
        "(w2) the delegate reads that a process it started in its workspace is leaking memory, naming it and the workspace",
        !!memoryTold?.includes(where),
        memoryTold ?? "no such message"
      );
      await endedCheck(kit, fleet, {
        delegate: item.instanceId,
        item: item.workItemId,
        leakerPids: runs?.leakerPids ?? [],
        workspace: workspace ?? "",
      });
      const browsed = runs?.browsed;
      const unbrowsed = runs
        ? ` (no output reached BROWSER-DONE among ${runs.outputs} background outputs)`
        : " (its runs unread: the delegate was never told of its leak)";
      const running = Number(browsed?.match(HANDLERS_RUNNING)?.[1]);
      const after = Number(browsed?.match(HANDLERS_AFTER)?.[1]);
      const told = toldWith(fleet.seen, [leakWords.leftBehind, INSTALL]);
      // The notice itself, from where the session's message says it, not the tool result before it.
      const handlerTold = told?.slice(
        Math.max(0, told.indexOf(leakWords.leftBehind) - 60),
        told.indexOf(leakWords.leftBehind) + 400
      );
      const logged = (await fleet.logs("agent"))
        .split("\n")
        .filter((line) => line.includes("[leaks]") && line.includes(INSTALL));
      check(
        "(w5) a browser run in the workspace for 35 s had its crash handlers, they ended with it, and no session read a leftover naming one nor did the agent's log",
        running > 0 && after === 0 && !handlerTold && logged.length === 0,
        `crash handlers while it ran ${Number.isNaN(running) ? "unread" : running}, after it ended ${Number.isNaN(after) ? "unread" : after}${browsed ? "" : unbrowsed}; ${handlerTold ? `the session was told: ${handlerTold}` : "no session told of a crash handler"}; agent log: ${logged.length === 0 ? `no [leaks] line naming ${INSTALL}` : logged.join(" | ").slice(0, 400)}`
      );
      const parentLeft = fleet.seen.find(
        (request) =>
          request.last.includes(leakWords.yourDelegate) &&
          request.last.includes(leakWords.leftBehind)
      )?.last;
      check(
        "(w6) the session that delegated it read no leftover of its delegate's",
        parentLeft === undefined,
        parentLeft?.slice(0, 600) ?? "none read"
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

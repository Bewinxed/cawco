/**
 * An interrupted or stopped delegate leaves nothing it started running: its
 * foreground command, its background shell, and what one of its commands
 * moved out of reach with `setsid` and a double fork (agent session.ts
 * `#endWork`, boundary.ts `endSessionWork`). On a scratch fleet (real hub,
 * agent and sessiond; Claude Code against the mock model), boundaries
 * included: run it where a workspace boundary can start (not inside
 * another one), on Linux and on macOS alike.
 *
 * The owner paused all work but the cutover; two interrupted delegates on
 * the Mac kept running their builds and probes, and held the Mac's one
 * heavy-run slot the cutover's landing gates needed (2026-10-20).
 *
 * The parent is a Claude session that calls its CawCo tools when the probe
 * tells it to (`PROBE-CMD <n> <tool> <target> [words]`). The delegate's
 * first command runs in the background (`run_in_background`), its second in
 * the foreground; the second leaves a third behind first, double-forked
 * into a session of its own. Each is a `sleep` whose argument is its marker
 * (`sleep 600.0<leg><n>`), read off the process table.
 *
 * i1. Interrupted with interrupt_delegate: within 5 s none of its three
 *     markers is alive.
 * i2. Past the quiet-turn period it has had no new turn (nothing it left
 *     running ended to wake it), and its item is running, held.
 * i3. A handoff from its parent wakes it, and it runs the three again.
 * s1. Stopped with stop_delegate: within 8 s none of the three is alive.
 * f1. Its first foreground command also sends SIGTERM to a `sleep 600.051`
 *     the probe runs on the host, the user's own, outside every boundary:
 *     the boundary keeps its signals to itself, and that sleep runs on.
 *
 * The hub's landing push is never cut by a delegate's interrupt (on macOS a
 * sweep leaves the agent's own commands' process trees running, read by
 * lineage: agent boundary.ts `agentWork`). A second delegate commits a file,
 * leaves a `sleep 600.031` double-forked into a session of its own, and
 * finishes. The hub's repository holds every push in a `pre-receive` hook
 * for {@link PUSH_HELD_S} s; once the hook runs, its parent interrupts the
 * delegate:
 *
 * l1. 10 s after interrupt_delegate, every process whose command names the
 *     push's ref (its executor, its git) is still alive.
 * l2. The item lands: done, the hub's main holds its commit, and the push
 *     was never cut off.
 * l3. Within 15 s of the landing, the `sleep` it left is not alive.
 *
 * Nothing a sweep waits for keeps a delegate's leftover alive. The fleet's
 * heavy runs have one slot (`CAWCO_HEAVY_RUNS=1`) and every room reading of
 * both systems opened, so only the slot decides, and each takes it through
 * this checkout's own scripts/lib/heavy-run.sh, which resolves its packages
 * from this checkout's node_modules (a copy in the scratch repository has
 * none, so Bun has to auto-install them; inside a macOS boundary its
 * `heavy_run` ended with no slot). A third delegate commits, leaves a
 * `sleep 600.061` that holds the slot, which the slot's own record names
 * (`slot-*` under the workspaces' cache, core heavy-run.ts), and finishes;
 * its landing gate's step queues behind it, its gate ticket there naming it;
 * then its parent interrupts it:
 *
 * g1. Within 15 s of interrupt_delegate the leftover holding the slot is not
 *     alive.
 * g2. The gate step takes the slot and runs.
 * g3. The item lands: done, and the hub's main holds its commit.
 *
 * macOS: what a boundary started before profiles carried membership names
 * ends once its workspace is gone, at the agent's start (agent boundary.ts
 * `endPreTagLeftovers`). The probe starts two such boundaries itself, each
 * under a running boundary's own profile (`<HOME>/.cawco/workspaces/<id>/
 * boundaries/<gen>/boundary.sb`) with its membership rules taken out: a
 * runner and an escaped child, each adopted by launchd. One is the landing
 * delegate's (`sleep 600.071`, `600.072`), started while its push is held;
 * the hub retires that workspace once its work lands. The other is a fourth
 * delegate's (`600.073`, `600.074`), whose turn stays open on a
 * `sleep 600.081`, so its workspace stays. Then the agent starts again:
 *
 * p1. Within 90 s of the agent's start, the retired workspace's pair is not
 *     alive.
 * p2. The pair of the workspace still here runs on.
 *
 *   bun scripts/probe-kit/run.ts delegate-kill
 */
import {
  chmod,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  commandLines,
  seatbeltLetsLookUp,
} from "../../../packages/core/src/process-identity";
import {
  isAlive,
  listedPid,
  signal as signalPid,
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

const TOOLS = {
  interrupt: "mcp__cawco__interrupt_delegate",
  stop: "mcp__cawco__stop_delegate",
  handoff: "mcp__cawco__handoff",
} as const;
type Command = keyof typeof TOOLS;
const CMD = /PROBE-CMD (\d+) (interrupt|stop|handoff) (\S+)(?: (.*))?/g;
const BRIEF = "PROBE-KILL-D";
const WAKE = "PROBE-WAKE-D";
const LAND_BRIEF = "PROBE-LAND-L";
const FINISH = "mcp__cawco__finish_item";
/** What the landing delegate leaves running: its `sleep`'s argument. */
const LANDED_LEFT = "600.031";
/** How long the hub's repository holds a push before it takes it. */
const PUSH_HELD_S = 30;
/** The ref the landing pushes, as the push's command names it (hub landing.ts `attempt`). */
const PUSHED_REF = "HEAD:refs/heads/main";
const GATE_BRIEF = "PROBE-GATE-G";
const LIVE_BRIEF = "PROBE-LIVE-P";
/** This checkout's heavy-run, which every heavy run of the gate leg takes its slot through. */
const HEAVY_RUN = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "scripts",
  "lib",
  "heavy-run.sh"
);
/** One shell word, whatever it holds. */
const word = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;
/**
 * What a heavy run of the gate leg takes its slot with (core heavy-run.ts):
 * this probe's own bun first on `PATH` (heavy-run.sh runs `bun`, and a probe
 * started as `~/.bun/bin/bun` over ssh has none on its PATH, which its fleet
 * hands on); no slot already held (`CAWCO_HEAVY_RUN_HELD`, which this probe's
 * own admission exports); one slot; a peak far under a slot, so the memory
 * there is never what decides; no disk floor; and every room reading opened,
 * Linux's (memory and CPU stall, swap left) and the Mac's (CPU busy, swap
 * read back and swapped out) alike. Only the slot decides.
 */
const ONE_SLOT = [
  `PATH=${word(dirname(process.execPath))}:"$PATH"`,
  "CAWCO_HEAVY_RUN_HELD=",
  "CAWCO_HEAVY_RUNS=1",
  "CAWCO_HEAVY_PEAK_GIB=0.01",
  "CAWCO_MIN_FREE_GB=0",
  "CAWCO_HEAVY_RESERVE_GIB=0",
  "CAWCO_HEAVY_MEMORY_STALL_MAX=101",
  "CAWCO_HEAVY_CPU_STALL_MAX=101",
  "CAWCO_HEAVY_SWAP_FREE_MIN_PCT=0",
  "CAWCO_HEAVY_CPU_BUSY_MAX=101",
  "CAWCO_HEAVY_SWAPIN_MAX_MIB=1000000000",
  "CAWCO_HEAVY_SWAP_USED_MAX_PCT=1000000000",
].join(" ");
/** The names the gate leg's two heavy runs take their slot under, as each one's record says it. */
const LEFT_RUN = "probe-left-G";
const GATE_RUN = "probe-gate-G";
/** The gate step's log, in its workspace's scratch dir. */
const STEP_LOG = "probe-gate-steps.log";
/** The gate's one step: it takes the slot, then says so in its log. */
const GATE = `---\n${ONE_SLOT} bash -c 'source "$1" && heavy_run ${GATE_RUN} && printf "TOOK gate %s\\n" "$(date +%s)" >> "$TMPDIR/${STEP_LOG}"' heavy ${word(HEAVY_RUN)}\n  name: heavy gate step\n---\n`;
/** What the gate delegate leaves running, holding the slot. */
const SLOT_LEFT = "600.061";
/** The leftover's own words, in its workspace's scratch dir: why it took no slot, when it took none. */
const LEFT_ERR = "probe-left.err";
/** Made by the leftover once it holds the slot, in its workspace's scratch dir. */
const LEFT_HELD = "probe-left.held";
/** The host process the first delegate's command signals ({@link hostWitness}). */
const WITNESS = "600.051";
/** The pre-tag pairs the probe starts: a retired workspace's, a live one's. */
const PRE_TAG = {
  gone: { runner: "600.071", child: "600.072" },
  live: { runner: "600.073", child: "600.074" },
} as const;
/** What keeps the fourth delegate's turn, and so its workspace, open through the agent's restart. */
const LIVE_TURN = "600.081";

/** Each leg's markers: the background, foreground and escaped `sleep`'s argument. */
const markers = (leg: "1" | "2") => ({
  background: `600.0${leg}2`,
  foreground: `600.0${leg}1`,
  escaped: `600.0${leg}3`,
});
type Markers = ReturnType<typeof markers>;
const MARKER = /\bsleep (600\.0[1-8][1-4])\b/;

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const useTool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** The parent's commands: how far each has gone. */
const commands = new Map<string, "searched" | "called" | "done">();

const parentReply = (request: Seen): Reply => {
  const last = [...request.all.matchAll(CMD)].at(-1);
  if (!last) {
    return text("ok");
  }
  const [, n, verb, target, words] = last as unknown as [
    string,
    string,
    Command,
    string,
    string | undefined,
  ];
  const tool = TOOLS[verb];
  const step = commands.get(n);
  const call = (): Reply => {
    commands.set(n, "called");
    return useTool(
      tool,
      verb === "handoff" ? { target, message: words ?? "" } : { target }
    );
  };
  if (step === undefined) {
    if (request.toolNames.includes(tool)) {
      return call();
    }
    commands.set(n, "searched");
    return useTool("ToolSearch", { query: `select:${tool}`, max_results: 1 });
  }
  if (step === "searched") {
    return call();
  }
  commands.set(n, "done");
  return text("done");
};

/** The delegate's requests, in order. */
const heard: Seen[] = [];
/** The pid of the probe's own `sleep 600.051` on the host, which the first leg's command signals (f1). */
let hostWitness = 0;
/** How far the delegate is into each leg's three commands. */
const progress = { "1": 0, "2": 0 };

/** One leg's commands, one per request: the background one, then the foreground one that leaves the escaped one behind. */
const legReply = (leg: "1" | "2", mark: Markers): Reply => {
  progress[leg] += 1;
  if (progress[leg] === 1) {
    return useTool("Bash", {
      command: `sleep ${mark.background}`,
      description: "A background command",
      run_in_background: true,
    });
  }
  if (progress[leg] === 2) {
    // A double fork into a session of its own: out of the command's process
    // group and reparented, as `setsid -f` leaves one (perl's on both OSes).
    const escaped = `( perl -MPOSIX -e 'fork and exit; POSIX::setsid(); exec @ARGV' sleep ${mark.escaped} & )`;
    // f1: a process outside the boundary, the user's own, signalled from in it.
    const outside =
      leg === "1" ? `kill -TERM ${hostWitness} 2>/dev/null; ` : "";
    return useTool("Bash", {
      command: `${outside}${escaped}; sleep ${mark.foreground}`,
      description: "A long command",
      timeout: 600_000,
    });
  }
  return text(`ok ${leg}`);
};

const delegateReply = (request: Seen): Reply => {
  heard.push(request);
  return request.all.includes(WAKE)
    ? legReply("2", markers("2"))
    : legReply("1", markers("1"));
};

/** How far the landing delegate is: its commit, its finish_item found, then called. */
const landing: Record<"committed" | "finished" | "searched", boolean> = {
  committed: false,
  finished: false,
  searched: false,
};

/** The landing delegate: commits, leaves its `sleep`, then finishes. */
const landReply = (request: Seen): Reply => {
  if (!landing.committed) {
    landing.committed = true;
    return useTool("Bash", {
      command: `printf 'L\\n' > l.txt && git add l.txt && git -c user.name=Delegate -c user.email=d@probe.test commit -qm 'Delegate commit L' && ( perl -MPOSIX -e 'fork and exit; POSIX::setsid(); exec @ARGV' sleep ${LANDED_LEFT} & )`,
      description: "Commit, and leave a server running",
    });
  }
  if (!landing.finished && request.toolNames.includes(FINISH)) {
    landing.finished = true;
    return useTool(FINISH, {
      headline: "Committed L.",
      summary: "Committed L.\n\nNot run: none.",
    });
  }
  if (
    !(landing.finished || landing.searched) &&
    request.toolNames.includes("ToolSearch")
  ) {
    landing.searched = true;
    return useTool("ToolSearch", { query: `select:${FINISH}`, max_results: 1 });
  }
  return text("done");
};

/** How far the gate delegate is: its commit and slot, its finish_item found, then called. */
const gating: Record<"committed" | "finished" | "searched", boolean> = {
  committed: false,
  finished: false,
  searched: false,
};

/** What the gate delegate read last: the hub's words to it (a landing handed back, a gate that failed), for a failing leg to say. */
let gateHeard = "";

/**
 * The gate delegate: commits, leaves a `sleep` that holds the heavy-run slot,
 * double-forked into a session of its own, and waits until it holds it (its
 * own words on stderr when it took none); then finishes. The `sleep`'s
 * argument goes in as an argument, so only the `sleep` itself, once its shell
 * holds the slot and execs it, reads as `sleep 600.061`.
 */
const gateReply = (request: Seen): Reply => {
  gateHeard = request.all.slice(-1500);
  if (!gating.committed) {
    gating.committed = true;
    const holder = `( ${ONE_SLOT} perl -MPOSIX -e 'fork and exit; POSIX::setsid(); exec @ARGV' bash -c 'source "$1" && heavy_run ${LEFT_RUN} && : > "$TMPDIR/${LEFT_HELD}" && exec sleep "$2"' heavy ${word(HEAVY_RUN)} ${SLOT_LEFT} > /dev/null 2> "$TMPDIR/${LEFT_ERR}" & )`;
    const held = `for _ in $(seq 600); do [ -e "$TMPDIR/${LEFT_HELD}" ] && break; sleep 0.2; done; [ -e "$TMPDIR/${LEFT_HELD}" ] || { cat "$TMPDIR/${LEFT_ERR}" >&2; exit 1; }`;
    return useTool("Bash", {
      command: `printf 'G\\n' > g.txt && git add g.txt && git -c user.name=Delegate -c user.email=d@probe.test commit -qm 'Delegate commit G' && ${holder} && ${held}`,
      description: "Commit, and leave a build holding the heavy-run slot",
      timeout: 180_000,
    });
  }
  if (!gating.finished && request.toolNames.includes(FINISH)) {
    gating.finished = true;
    return useTool(FINISH, {
      headline: "Committed G.",
      summary: "Committed G.\n\nNot run: none.",
    });
  }
  if (
    !(gating.finished || gating.searched) &&
    request.toolNames.includes("ToolSearch")
  ) {
    gating.searched = true;
    return useTool("ToolSearch", { query: `select:${FINISH}`, max_results: 1 });
  }
  return text("done");
};

/** Whether the fourth delegate has started the command that holds its turn open. */
let liveStarted = false;

/** The fourth delegate: one foreground `sleep 600.081`, which keeps its turn, its item and so its workspace open. */
const liveReply = (): Reply => {
  if (liveStarted) {
    return text("ok");
  }
  liveStarted = true;
  return useTool("Bash", {
    command: `sleep ${LIVE_TURN}`,
    description: "A long command",
    timeout: 600_000,
  });
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (request.all.includes("PROBE-CMD")) {
    return parentReply(request);
  }
  if (request.all.includes(LAND_BRIEF)) {
    return landReply(request);
  }
  if (request.all.includes(GATE_BRIEF)) {
    return gateReply(request);
  }
  if (request.all.includes(LIVE_BRIEF)) {
    return liveReply();
  }
  return request.all.includes(BRIEF) ? delegateReply(request) : text("ok");
};

/** The processes whose command names the landing's pushed ref: its executor and its git, inside the boundary and out. */
const pushes = async (): Promise<number[]> =>
  (await commandLines())
    .filter(
      ({ pid, command }) =>
        pid !== process.pid &&
        command.includes(PUSHED_REF) &&
        !command.includes("pre-receive")
    )
    .map(({ pid }) => pid);

/** Each marker alive now, by its marker, with its pids. */
const alive = async (): Promise<Map<string, number[]>> => {
  const found = new Map<string, number[]>();
  for (const { pid, command } of await commandLines()) {
    const mark = MARKER.exec(command)?.[1];
    if (mark && pid !== process.pid) {
      found.set(mark, [...(found.get(mark) ?? []), pid]);
    }
  }
  return found;
};

const said = (found: Map<string, number[]>): string =>
  [...found]
    .map(([mark, pids]) => `${mark} (pid ${pids.join(", ")})`)
    .join("; ") || "none";

/** Which of `mark`'s three are alive in `found`. */
const of = (found: Map<string, number[]>, mark: Markers): string[] =>
  Object.values(mark).filter((one) => found.has(one));

/** One work item's row, as a leg reads its end. */
interface ItemRow {
  error: string | null;
  result: string | null;
  state: string;
}

/** What every leg works with: the fleet, the project's repository and parent, and how a leg delegates, steers and reads. */
interface Rig {
  bare: string;
  check: Kit["check"];
  /** The parent calls `verb` on `target`, and its turn ends. */
  command: (verb: Command, target: string, words?: string) => Promise<void>;
  delegate: (
    title: string,
    prompt: string
  ) => Promise<{ instanceId: string; workItemId: string }>;
  fleet: Fleet;
  home: string;
  itemEnded: (item: string) => Promise<ItemRow | undefined>;
  itemOf: (
    item: string
  ) => { held_at: number | null; state: string } | undefined;
  /** Its row now: its state, error and result. */
  itemRow: (item: string) => ItemRow | undefined;
  mainLog: () => Promise<string[]>;
  workspaceOf: (item: string) => string | undefined;
}

/** The fleet up, its project made on a repository of one file, and its parent session. */
const standUp = async (kit: Kit): Promise<Rig> => {
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
  const repo = join(fleet.sandbox, "code");
  await mkdir(repo, { recursive: true });
  await Bun.$`git init -q -b main && echo code > README.md && git add -A && git commit -qm 'First commit'`
    .cwd(repo)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Delegate kill",
    machineId: MACHINE,
    cwd: repo,
  });
  const parent = await fleet.spawn("claude", "Parent", repo, {
    projectId: project.id,
  });
  let n = 0;
  const bare = join(fleet.sandbox, "hub", "git", `${project.id}.git`);
  return {
    bare,
    check: kit.check,
    fleet,
    home,
    command: async (verb, target, words = "") => {
      n += 1;
      const id = String(n);
      await fleet.send(parent, `PROBE-CMD ${id} ${verb} ${target} ${words}`);
      await until(
        `the parent's ${verb} of ${target}`,
        () => commands.get(id),
        (step) => step === "done",
        120_000
      );
    },
    delegate: async (title, prompt) => {
      const made = await fleet.api<{
        instanceId: string | null;
        workItemId: string | null;
      }>("/api/work-items", {
        parentInstanceId: parent,
        title,
        prompt,
        harness: "claude",
        model: "claude-haiku-4-5",
        cwd: repo,
      });
      return {
        instanceId: made.instanceId as string,
        workItemId: made.workItemId as string,
      };
    },
    itemEnded: (item) =>
      until(
        "its item ended",
        () =>
          fleet.query<ItemRow>(
            "SELECT state, error, result FROM work_items WHERE id = ?",
            item
          )[0],
        (row) => ["done", "failed", "cancelled"].includes(row?.state ?? ""),
        600_000
      ),
    itemOf: (item) =>
      fleet.query<{ state: string; held_at: number | null }>(
        "SELECT state, held_at FROM work_items WHERE id = ?",
        item
      )[0],
    itemRow: (item) =>
      fleet.query<ItemRow>(
        "SELECT state, error, result FROM work_items WHERE id = ?",
        item
      )[0],
    mainLog: async () =>
      (await Bun.$`git log --format=%s main`.cwd(bare).nothrow().quiet().text())
        .trim()
        .split("\n"),
    workspaceOf: (item) =>
      fleet.query<{ workspace_id: string | null }>(
        "SELECT workspace_id FROM work_items WHERE id = ?",
        item
      )[0]?.workspace_id ?? undefined,
  };
};

/** i1, f1, i2, i3 and s1, on the first delegate. */
const firstLegs = async (rig: Rig): Promise<void> => {
  const { check, command, fleet } = rig;
  const turnOpen = (id: string) =>
    fleet.instance(id)?.turn_open_at !== null &&
    fleet.instance(id)?.turn_open_at !== undefined;
  const lasts = (seen: Seen[]) =>
    seen.map((one) => JSON.stringify(one.last.slice(0, 200))).join("; ") ||
    "none";
  /** All three of a leg's markers running, and its turn open on the foreground one. */
  const running = async (mark: Markers, instanceId: string) => {
    await until(
      `all three of ${Object.values(mark).join(", ")} running`,
      alive,
      (found) => of(found, mark).length === 3,
      180_000
    );
    await until("its turn open", () => turnOpen(instanceId), Boolean, 30_000);
  };
  /** None of a leg's markers alive within `ms`; what was alive at the end otherwise. */
  const gone = (mark: Markers, ms: number) =>
    until(
      `none of ${Object.values(mark).join(", ")} alive`,
      alive,
      (found) => of(found, mark).length === 0,
      ms
    ).catch(() => alive());

  // f1's witness: the user's own process on the host, in a session of its own.
  const witness = Bun.spawn(
    ["perl", "-MPOSIX", "-e", "POSIX::setsid(); exec @ARGV", "sleep", WITNESS],
    { stdio: ["ignore", "ignore", "ignore"] }
  );
  hostWitness = witness.pid;
  const first = await rig.delegate("Kill", `${BRIEF}: run the commands.`);
  const dId = first.instanceId;
  const legOne = markers("1");
  const legTwo = markers("2");

  // i1
  await running(legOne, dId);
  // f1: its foreground command has run its `kill -TERM` at the witness.
  const witnessLives = isAlive(listedPid(hostWitness));
  check(
    "f1: a command inside the boundary could not signal the user's own process outside it",
    witnessLives,
    `the probe's sleep ${WITNESS} on the host (pid ${hostWitness}) is ${witnessLives ? "alive" : "gone"} after the delegate's command sent it SIGTERM`
  );
  const before = await alive();
  const interruptedAt = Date.now();
  await command("interrupt", dId);
  const afterInterrupt = await gone(legOne, 5000);
  check(
    "i1: within 5 s of interrupt_delegate none of its three commands is alive",
    of(afterInterrupt, legOne).length === 0,
    `before: ${said(before)}; ${Math.round((Date.now() - interruptedAt) / 1000)} s after: ${said(afterInterrupt)}`
  );

  // i2
  await until("its turn closed", () => !turnOpen(dId), Boolean, 60_000);
  await Bun.sleep(30_000);
  const woke = heard.filter((seen) => seen.at > interruptedAt);
  const item = rig.itemOf(first.workItemId);
  check(
    "i2: the interrupted delegate has had no new turn, and its item is running, held",
    woke.length === 0 && item?.state === "running" && item.held_at !== null,
    `its requests since the interrupt, each by the end of what it read: ${woke.map((seen) => JSON.stringify(seen.all.slice(-400))).join("; ") || "none"}; its item: ${JSON.stringify(item)}`
  );

  // i3
  const handedAt = Date.now();
  await command("handoff", dId, `${WAKE} carry on`);
  await running(legTwo, dId).catch(() => undefined);
  const resumed = await alive();
  check(
    "i3: a handoff wakes it, and it runs its commands again",
    of(resumed, legTwo).length === 3 &&
      heard.some((seen) => seen.at > handedAt && seen.all.includes(WAKE)),
    `its requests since the handoff: ${lasts(heard.filter((seen) => seen.at > handedAt))}; alive: ${said(resumed)}`
  );

  // s1
  const stoppedAt = Date.now();
  await command("stop", dId);
  const afterStop = await gone(legTwo, 8000);
  check(
    "s1: within 8 s of stop_delegate none of its three commands is alive",
    of(afterStop, legTwo).length === 0,
    `${Math.round((Date.now() - stoppedAt) / 1000)} s after: ${said(afterStop)}`
  );
};

/** Whether `path` is there. */
const there = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false
  );

/** The hub's repository's hook that holds every push ({@link PUSH_HELD_S}). */
const hookOf = (rig: Rig): string => join(rig.bare, "hooks", "pre-receive");

/** The membership rules a profile carries (agent boundary-policy.ts `seatbeltProfile`), to take out: what remains is a profile as a boundary before them started under. */
const MEMBERSHIP_RULES =
  /^\(deny mach-lookup \(global-name-prefix "dev\.cawco\.boundary\."\)\)\n\(allow mach-lookup\n(?: {2}\(global-name "[^"]*"\)\n)+\)\n/m;

/** A pre-tag pair the probe started under a workspace's profile ({@link startPreTag}). */
interface PreTag {
  id: string;
  /** The workspace's folder. */
  path: string;
  /** Whether the membership rules came out of its profile and none of them is left. */
  stripped: boolean;
}

/**
 * macOS: a pre-tag runner and its escaped child (`pair`), each adopted by
 * launchd, under the profile item `workItem`'s workspace's boundary runs
 * under now (`<HOME>/.cawco/workspaces/<id>/boundaries/<gen>/boundary.sb`,
 * its generation named in `boundary.json`), its membership rules taken out;
 * why not, in words, when that boundary is not there to read. Read while the
 * boundary runs: a workspace's boundary closes, and its records go, once its
 * item ends and nothing holds it (hub workspace-retire.ts).
 */
const startPreTag = async (
  rig: Rig,
  workItem: string,
  pair: { child: string; runner: string }
): Promise<PreTag | string> => {
  const id = rig.workspaceOf(workItem) ?? "";
  const state = join(rig.home, ".cawco", "workspaces", id);
  try {
    const held = JSON.parse(
      await readFile(join(state, "boundary.json"), "utf8")
    ) as { gen: string; path: string };
    const profile = await readFile(
      join(state, "boundaries", held.gen, "boundary.sb"),
      "utf8"
    );
    const preTag = profile.replace(MEMBERSHIP_RULES, "");
    const file = join(rig.fleet.sandbox, `pre-tag-${pair.runner}.sb`);
    await writeFile(file, preTag);
    Bun.spawn(
      [
        "perl",
        "-MPOSIX",
        "-e",
        "fork and exit; POSIX::setsid(); exec @ARGV",
        "/usr/bin/sandbox-exec",
        "-f",
        file,
        "/bin/bash",
        "-c",
        `( perl -MPOSIX -e 'fork and exit; POSIX::setsid(); exec @ARGV' sleep ${pair.child} & ); exec sleep ${pair.runner}`,
      ],
      { cwd: held.path, stdio: ["ignore", "ignore", "ignore"] }
    );
    return {
      id,
      path: held.path,
      stripped: preTag !== profile && !preTag.includes("dev.cawco.boundary."),
    };
  } catch (error) {
    return `workspace ${id}'s boundary profile could not be read: ${String(error)}`;
  }
};

/**
 * l1, l2 and l3, on the landing delegate. On macOS it also starts the
 * landing delegate's pre-tag pair while its push is held and its boundary
 * runs, and answers it (p1).
 */
const landLegs = async (rig: Rig): Promise<PreTag | string | undefined> => {
  const { check, fleet } = rig;
  // l1: the hub's repository holds every push in its pre-receive hook.
  const landDir = join(fleet.sandbox, "land");
  await mkdir(landDir, { recursive: true });
  await mkdir(join(rig.bare, "hooks"), { recursive: true });
  const pushStarted = join(landDir, "push-started");
  const pushTaken = join(landDir, "push-taken");
  await writeFile(
    hookOf(rig),
    `#!/bin/sh\n: > '${pushStarted}'\nsleep ${PUSH_HELD_S}\n: > '${pushTaken}'\n`
  );
  await chmod(hookOf(rig), 0o755);
  const landed = await rig.delegate(
    "Land",
    `${LAND_BRIEF}: commit, then finish.`
  );
  await until(
    "its landing's push held by the hub's repository",
    () => there(pushStarted),
    Boolean,
    600_000
  );
  const pushing = await pushes();
  const leftAtInterrupt = (await alive()).get(LANDED_LEFT) ?? [];
  const landInterruptedAt = Date.now();
  await rig.command("interrupt", landed.instanceId);
  await Bun.sleep(Math.max(0, landInterruptedAt + 10_000 - Date.now()));
  const cut = pushing.filter((pid) => !isAlive(listedPid(pid)));
  const takenEarly = await there(pushTaken);
  check(
    "l1: 10 s after interrupt_delegate, every process of its landing's push is still alive",
    pushing.length > 0 && cut.length === 0 && !takenEarly,
    `the push: ${pushing.join(", ") || "never found"}; gone: ${cut.join(", ") || "none"}; the hub had ${takenEarly ? "already" : "not yet"} taken it; what it left running at the interrupt: ${leftAtInterrupt.join(", ") || "nothing"}`
  );
  // p1's pair, while the push is still held and the boundary runs.
  const gone =
    process.platform === "darwin"
      ? await startPreTag(rig, landed.workItemId, PRE_TAG.gone)
      : undefined;

  // l2
  const landRow = await rig.itemEnded(landed.workItemId);
  const landEndedAt = Date.now();
  const main = await rig.mainLog();
  const words = `${landRow?.error ?? ""}\n${landRow?.result ?? ""}`;
  check(
    "l2: the item lands: done, the hub's main holds its commit, and its push was never cut off",
    landRow?.state === "done" &&
      main.includes("Delegate commit L") &&
      !words.includes("cut off") &&
      (await there(pushTaken)),
    `${landRow?.state} ${words.slice(0, 1500)}\nmain: ${main.join(" | ")}`
  );

  // l3
  const afterLanding = await until(
    `${LANDED_LEFT} not alive`,
    alive,
    (found) => !found.has(LANDED_LEFT),
    15_000
  ).catch(() => alive());
  check(
    "l3: within 15 s of the landing, what it left running is not alive",
    leftAtInterrupt.length > 0 && !afterLanding.has(LANDED_LEFT),
    `at the interrupt: ${leftAtInterrupt.join(", ") || "nothing"}; ${Math.round((Date.now() - landEndedAt) / 1000)} s after the landing: ${said(afterLanding)}`
  );
  return gone;
};

/** A heavy run's record in the slots' dir (core heavy-run.ts `Written`): who holds a slot, or waits on a gate's ticket. */
interface HeavyRecord {
  command: string;
  gate?: string;
  pid: number;
}

/** A slot's file, or a gate's ticket: `slot-<i>`, `gate-<arrival>-<pid>` (core heavy-run.ts). */
const HEAVY_FILE = /^(slot-\d+|gate-\d{15}-\d+)$/;

/** The fleet's heavy-run slots and gate tickets, each with the record its run wrote, read on the host. */
const heavyFiles = async (
  dir: string
): Promise<{ name: string; record?: HeavyRecord }[]> =>
  Promise.all(
    (await readdir(dir).catch(() => [] as string[]))
      .filter((name) => HEAVY_FILE.test(name))
      .map(async (name) => ({
        name,
        record: await readFile(join(dir, name), "utf8").then(
          (raw) => JSON.parse(raw) as HeavyRecord,
          () => undefined
        ),
      }))
  );

/**
 * The run named `command` on a `slot` it holds or a `gate` ticket it waits
 * on, while that run is alive: a slot's record outlives its hold, and a
 * ticket its holder (core heavy-run.ts), so the run's pid decides.
 */
const heavyRun = async (
  dir: string,
  kind: "slot" | "gate",
  command: string
): Promise<HeavyRecord | undefined> =>
  (await heavyFiles(dir)).find(
    ({ name, record }) =>
      name.startsWith(`${kind}-`) &&
      record?.command === command &&
      isAlive(listedPid(record.pid))
  )?.record;

/** The slots' dir in words, for a failing leg to say. */
const heavySaid = async (dir: string): Promise<string> =>
  (await heavyFiles(dir))
    .map(({ name, record }) =>
      record
        ? `${name}: ${record.command} (pid ${record.pid}, ${isAlive(listedPid(record.pid)) ? "alive" : "gone"})`
        : `${name}: no record`
    )
    .join("; ") || "empty";

/** g1, g2 and g3, on the gate delegate. */
const gateLegs = async (rig: Rig): Promise<void> => {
  const { check } = rig;
  const g1 =
    "g1: within 15 s of interrupt_delegate, its leftover holding the heavy-run slot its gate step waits for is not alive";
  await rm(hookOf(rig), { force: true });
  const slots = join(rig.home, ".cawco", "workspace-cache", "heavy-runs");
  await mkdir(slots, { recursive: true });
  const project = rig.bare.slice(rig.bare.lastIndexOf("/") + 1, -".git".length);
  await declareGate(rig.fleet.base, project, GATE);
  const gated = await rig.delegate(
    "Gate",
    `${GATE_BRIEF}: commit, then finish.`
  );
  const gWorkspace =
    (await until(
      "its workspace",
      () => rig.workspaceOf(gated.workItemId),
      Boolean,
      120_000
    )) ?? "";
  const scratch = join(rig.home, ".cawco", "tmp", gWorkspace.slice(0, 8));
  const gateLog = () =>
    readFile(join(scratch, STEP_LOG), "utf8").catch(() => "");
  const leftSaid = async () =>
    (await readFile(join(scratch, LEFT_ERR), "utf8").catch(() => "")).trim() ||
    "nothing";
  const leftover = await until(
    `its ${SLOT_LEFT} holding the one heavy-run slot`,
    () => heavyRun(slots, "slot", LEFT_RUN),
    Boolean,
    300_000
  ).catch(() => undefined);
  if (!leftover) {
    check(
      g1,
      false,
      `its leftover never held the slot. The slots: ${await heavySaid(slots)}; the leftover said: ${await leftSaid()}; the delegate last read: ${JSON.stringify(gateHeard)}`
    );
    return;
  }
  const queued = await until(
    "its gate step queued on the slot",
    () => heavyRun(slots, "gate", GATE_RUN),
    Boolean,
    600_000
  ).catch(() => undefined);
  if (!queued) {
    check(
      g1,
      false,
      `its gate step never queued on the slot. The slots: ${await heavySaid(slots)}; its item: ${JSON.stringify(rig.itemRow(gated.workItemId))}; the delegate last read: ${JSON.stringify(gateHeard)}`
    );
    return;
  }
  const holding = await heavyRun(slots, "slot", LEFT_RUN);
  const gInterruptedAt = Date.now();
  await rig.command("interrupt", gated.instanceId);
  const afterGate = await until(
    `${SLOT_LEFT} not alive`,
    alive,
    (found) => !found.has(SLOT_LEFT),
    15_000
  ).catch(() => alive());
  check(
    g1,
    holding?.pid === leftover.pid &&
      !isAlive(listedPid(leftover.pid)) &&
      !afterGate.has(SLOT_LEFT),
    `the slot was held by ${LEFT_RUN} (pid ${leftover.pid}) ${holding?.pid === leftover.pid ? "at the interrupt" : "until before the interrupt"}, ${GATE_RUN} queued behind it (${queued.gate ?? "no gate named"}, pid ${queued.pid}); ${Math.round((Date.now() - gInterruptedAt) / 1000)} s after: ${said(afterGate)}; the slots: ${await heavySaid(slots)}`
  );

  // g2
  const took = await until(
    "the gate step took the slot",
    gateLog,
    (log) => log.includes("TOOK gate"),
    120_000
  ).catch(() => gateLog());
  check(
    "g2: the gate step takes the slot and runs",
    took.includes("TOOK gate"),
    took.trim() || `its step log is empty; the slots: ${await heavySaid(slots)}`
  );

  // g3: waited for only once its gate has run; a gate that never ran lands nothing.
  const gRow = took.includes("TOOK gate")
    ? await rig.itemEnded(gated.workItemId).catch(() => undefined)
    : rig.itemRow(gated.workItemId);
  const gMain = await rig.mainLog();
  check(
    "g3: the item lands: done, and the hub's main holds its commit",
    gRow?.state === "done" && gMain.includes("Delegate commit G"),
    `${gRow?.state ?? "no row"} ${`${gRow?.error ?? ""}\n${gRow?.result ?? ""}`.slice(0, 1500)}\nmain: ${gMain.join(" | ")}; the delegate last read: ${JSON.stringify(gateHeard)}`
  );
};

/**
 * p1 and p2: the landing delegate's pre-tag pair (`gone`, started while its
 * push was held, {@link landLegs}); a fourth delegate whose turn stays open
 * on a `sleep 600.081`, and a pre-tag pair under its workspace's profile
 * (`live`); the landing delegate's workspace gone, as the hub retires one
 * whose work landed (hub workspace-retire.ts), archived here when it has not
 * yet; then the agent started again.
 */
const preTagLegs = async (rig: Rig, gone: PreTag | string): Promise<void> => {
  const { check, fleet } = rig;
  const p1 =
    "p1: within 90 s of the agent's start, what a retired workspace's pre-tag boundary started is not alive";
  const kept = await rig.delegate("Live", `${LIVE_BRIEF}: run the command.`);
  const turning = await until(
    `its ${LIVE_TURN} running`,
    alive,
    (found) => found.has(LIVE_TURN),
    180_000
  ).catch(() => undefined);
  const live = turning
    ? await startPreTag(rig, kept.workItemId, PRE_TAG.live)
    : `its ${LIVE_TURN} never ran`;
  if (typeof gone === "string" || typeof live === "string") {
    check(
      p1,
      false,
      `the pre-tag boundaries could not be started: ${typeof gone === "string" ? gone : "the retired one's started"}; ${typeof live === "string" ? live : "the live one's started"}`
    );
    return;
  }
  const wanted = [
    ...Object.values(PRE_TAG.gone),
    ...Object.values(PRE_TAG.live),
  ];
  const running = await until(
    "the pre-tag pairs running",
    alive,
    (found) => wanted.every((mark) => found.has(mark)),
    30_000
  ).catch(() => alive());
  const readsPreTag = wanted
    .flatMap((mark) => running.get(mark) ?? [])
    .every(
      (pid) =>
        seatbeltLetsLookUp(pid, "dev.cawco.boundary.") === true &&
        seatbeltLetsLookUp(pid, "com.apple.SecurityServer") === false
    );
  const removed = async () => !(await there(gone.path));
  let how = "retired by the hub";
  if (
    !(await until("its workspace retired", removed, Boolean, 180_000).catch(
      () => false
    ))
  ) {
    const answer = await fleet
      .api<{ state: string }>(`/api/workspaces/${gone.id}/archive`, {})
      .then(
        (archived) => archived.state,
        (error: unknown) => String(error)
      );
    how = `archived (${answer})`;
    await until("its workspace archived", removed, Boolean, 60_000).catch(
      () => false
    );
  }
  const goneNow = await removed();
  await fleet.stop("agent");
  fleet.launch("agent");
  await fleet.agentUp();
  const startedAt = Date.now();
  const after = await until(
    "the retired workspace's pair not alive",
    alive,
    (found) =>
      !(found.has(PRE_TAG.gone.runner) || found.has(PRE_TAG.gone.child)),
    90_000
  ).catch(() => alive());
  check(
    p1,
    gone.stripped &&
      live.stripped &&
      readsPreTag &&
      wanted.every((mark) => running.has(mark)) &&
      goneNow &&
      !(after.has(PRE_TAG.gone.runner) || after.has(PRE_TAG.gone.child)),
    `membership rules taken out of both profiles: ${gone.stripped && live.stripped}; started: ${said(running)}; each reads pre-tag: ${readsPreTag}; workspace ${gone.id} ${how}, its clone ${goneNow ? "gone" : "still there"}; ${Math.round((Date.now() - startedAt) / 1000)} s after the agent's start: ${said(after)}`
  );
  check(
    "p2: the pre-tag pair of a workspace still here runs on",
    after.has(PRE_TAG.live.runner) && after.has(PRE_TAG.live.child),
    `workspace ${live.id}'s pair after the agent's start: ${said(after)}`
  );
};

const run = async (kit: Kit) => {
  const rig = await standUp(kit);
  try {
    await firstLegs(rig);
    const gone = await landLegs(rig);
    await gateLegs(rig);
    if (gone !== undefined) {
      await preTagLegs(rig, gone);
    }
  } finally {
    // What a failing leg left: the probe's own markers, and nothing else.
    const left = await alive();
    for (const pids of left.values()) {
      for (const pid of pids) {
        signalPid(listedPid(pid), "SIGKILL");
      }
    }
  }
};

export default {
  name: "delegate-kill",
  host: "its delegate cuts a workspace",
  run,
} satisfies Spec;

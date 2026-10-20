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
 * Nothing a sweep waits for keeps a delegate's leftover alive: the project's
 * gate takes the machine's one heavy-run slot (`CAWCO_HEAVY_RUNS=1`). A
 * third delegate commits, leaves a `sleep 600.061` holding that slot
 * (scripts/lib/heavy-run.sh), and finishes; its landing gate's step queues
 * for the slot; then its parent interrupts it:
 *
 * g1. Within 15 s of interrupt_delegate the leftover holding the slot is not
 *     alive.
 * g2. The gate step takes the slot and runs.
 * g3. The item lands: done, and the hub's main holds its commit.
 *
 * macOS: what a boundary started before profiles carried membership names
 * ends once its workspace is gone, at the agent's start (agent boundary.ts
 * `endPreTagLeftovers`). The probe starts two such boundaries itself: each a
 * runner (`sleep 600.071`, `600.073`) under a workspace's own profile with
 * its membership rules taken out, and an escaped child (`600.072`,
 * `600.074`), each adopted by launchd. The landing delegate's workspace is
 * then archived, and the agent started again:
 *
 * p1. Within 90 s of the agent's start, the archived workspace's pair is not
 *     alive.
 * p2. The pair of the first delegate's workspace, still here, runs on.
 *
 *   bun scripts/probe-kit/run.ts delegate-kill
 */
import {
  chmod,
  cp,
  mkdir,
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
/** This checkout: what the project's repository copies its heavy-run gate from. */
const REPO = join(import.meta.dir, "..", "..", "..");
/**
 * What a heavy run here takes its slot with: this probe's own bun first on
 * `PATH` (heavy-run.sh runs `bun`, and a probe started as `~/.bun/bin/bun`
 * over ssh has none on its PATH, which its fleet hands on), no slot already
 * held (`CAWCO_HEAVY_RUN_HELD`), one slot and the room's thresholds opened
 * wide, so only the slot decides (core heavy-run.ts `ROOM_ENV`).
 */
const ONE_SLOT = `PATH=${dirname(process.execPath)}:"$PATH" CAWCO_HEAVY_RUN_HELD= CAWCO_HEAVY_RUNS=1 CAWCO_HEAVY_MEMORY_STALL_MAX=100 CAWCO_HEAVY_CPU_STALL_MAX=100 CAWCO_HEAVY_RESERVE_GIB=0`;
/** The gate step's log, in its workspace's scratch dir. */
const STEP_LOG = "probe-gate-steps.log";
/** The gate's one step: it takes the slot, then says so in its log. */
const GATE = `---\n${ONE_SLOT} bash -c 'source scripts/lib/heavy-run.sh && heavy_run probe-gate-G && printf "TOOK gate %s\\n" "$(date +%s)" >> "$TMPDIR/${STEP_LOG}"'\n  name: heavy gate step\n---\n`;
/** What the gate delegate leaves running, holding the slot. */
const SLOT_LEFT = "600.061";
/** The host process the first delegate's command signals ({@link hostWitness}). */
const WITNESS = "600.051";
/** The pre-tag pairs the probe starts: an archived workspace's, a live one's. */
const PRE_TAG = {
  gone: { runner: "600.071", child: "600.072" },
  live: { runner: "600.073", child: "600.074" },
} as const;

/** Each leg's markers: the background, foreground and escaped `sleep`'s argument. */
const markers = (leg: "1" | "2") => ({
  background: `600.0${leg}2`,
  foreground: `600.0${leg}1`,
  escaped: `600.0${leg}3`,
});
type Markers = ReturnType<typeof markers>;
const MARKER = /\bsleep (600\.0[1-7][1-4])\b/;

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

/** The gate delegate: commits, leaves a `sleep` holding the heavy-run slot (once it holds it), then finishes. */
const gateReply = (request: Seen): Reply => {
  if (!gating.committed) {
    gating.committed = true;
    const holder = `( ${ONE_SLOT} perl -MPOSIX -e 'fork and exit; POSIX::setsid(); exec @ARGV' bash -c 'source scripts/lib/heavy-run.sh && heavy_run probe-left-G && exec sleep ${SLOT_LEFT}' > /dev/null 2>&1 & )`;
    const held = `for _ in $(seq 300); do pgrep -f '^sleep ${SLOT_LEFT}$' > /dev/null && break; sleep 0.2; done`;
    return useTool("Bash", {
      command: `printf 'G\\n' > g.txt && git add g.txt && git -c user.name=Delegate -c user.email=d@probe.test commit -qm 'Delegate commit G' && ${holder} && ${held}`,
      description: "Commit, and leave a build holding the heavy-run slot",
      timeout: 120_000,
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
  mainLog: () => Promise<string[]>;
  workspaceOf: (item: string) => string | undefined;
}

/** The fleet up, its project made on a repository carrying the heavy-run gate, and its parent session. */
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
  // The machine's heavy-run gate, copied from this checkout as CawCo's own
  // repository carries it, so the gate leg's step and leftover take real slots.
  await mkdir(join(repo, "scripts", "lib"), { recursive: true });
  for (const file of ["heavy-run.sh", "heavy-run.ts", "disk-room.sh"]) {
    // biome-ignore lint/performance/noAwaitInLoops: three small files
    await cp(
      join(REPO, "scripts", "lib", file),
      join(repo, "scripts", "lib", file)
    );
  }
  await cp(
    join(REPO, "packages", "core", "src"),
    join(repo, "packages", "core", "src"),
    { recursive: true }
  );
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

/** i1, f1, i2, i3 and s1, on the first delegate; answers its item. */
const firstLegs = async (rig: Rig): Promise<string> => {
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
  return first.workItemId;
};

/** Whether `path` is there. */
const there = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false
  );

/** The hub's repository's hook that holds every push ({@link PUSH_HELD_S}). */
const hookOf = (rig: Rig): string => join(rig.bare, "hooks", "pre-receive");

/** l1, l2 and l3, on the landing delegate; answers its item. */
const landLegs = async (rig: Rig): Promise<string> => {
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
  return landed.workItemId;
};

/** The profile each of `items`' workspace's boundary runs under now, read off its generation's dir; why not, when one cannot be read. */
const readProfiles = (
  rig: Rig,
  items: readonly string[]
): Promise<Profile[] | string> =>
  Promise.all(
    items.map(async (workItem) => {
      const id = rig.workspaceOf(workItem) ?? "";
      const state = join(rig.home, ".cawco", "workspaces", id);
      const held = JSON.parse(
        await readFile(join(state, "boundary.json"), "utf8")
      ) as { gen: string; path: string };
      return {
        id,
        path: held.path,
        profile: await readFile(
          join(state, "boundaries", held.gen, "boundary.sb"),
          "utf8"
        ),
      };
    })
  ).catch((error: unknown) => String(error));

/** g1, g2 and g3, on the gate delegate. */
const gateLegs = async (rig: Rig): Promise<void> => {
  const { check } = rig;
  await rm(hookOf(rig), { force: true });
  await mkdir(join(rig.home, ".cawco", "workspace-cache", "heavy-runs"), {
    recursive: true,
  });
  const project = rig.bare.slice(rig.bare.lastIndexOf("/") + 1, -".git".length);
  await declareGate(rig.fleet.base, project, GATE);
  const gated = await rig.delegate(
    "Gate",
    `${GATE_BRIEF}: commit, then finish.`
  );
  await until(
    `its ${SLOT_LEFT} holding the heavy-run slot`,
    alive,
    (found) => found.has(SLOT_LEFT),
    300_000
  );
  const gWorkspace = await until(
    "its workspace",
    () => rig.workspaceOf(gated.workItemId),
    Boolean,
    60_000
  );
  const stepLog = join(
    rig.home,
    ".cawco",
    "tmp",
    (gWorkspace ?? "").slice(0, 8),
    STEP_LOG
  );
  const gateLog = () => readFile(stepLog, "utf8").catch(() => "");
  await until(
    "its gate step waiting for the slot",
    async () =>
      (await commandLines()).some((line) =>
        line.command.includes("heavy_run probe-gate-G")
      ),
    Boolean,
    600_000
  );
  await Bun.sleep(3000);
  const tookFirst = (await gateLog()).includes("TOOK gate");
  const holding = (await alive()).get(SLOT_LEFT) ?? [];
  const gInterruptedAt = Date.now();
  await rig.command("interrupt", gated.instanceId);
  const afterGate = await until(
    `${SLOT_LEFT} not alive`,
    alive,
    (found) => !found.has(SLOT_LEFT),
    15_000
  ).catch(() => alive());
  check(
    "g1: within 15 s of interrupt_delegate, its leftover holding the heavy-run slot its gate step waits for is not alive",
    holding.length > 0 && !tookFirst && !afterGate.has(SLOT_LEFT),
    `holding the slot at the interrupt: ${holding.join(", ") || "nothing"}; the gate step had ${tookFirst ? "already" : "not"} taken it; ${Math.round((Date.now() - gInterruptedAt) / 1000)} s after: ${said(afterGate)}`
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
    took.trim() || "its step log is empty"
  );

  // g3
  const gRow = await rig.itemEnded(gated.workItemId).catch(() => undefined);
  const gMain = await rig.mainLog();
  check(
    "g3: the item lands: done, and the hub's main holds its commit",
    gRow?.state === "done" && gMain.includes("Delegate commit G"),
    `${gRow?.state ?? "not ended"} ${`${gRow?.error ?? ""}\n${gRow?.result ?? ""}`.slice(0, 1500)}\nmain: ${gMain.join(" | ")}`
  );
};

/** A workspace's boundary profile, as the probe read it off its generation's dir. */
interface Profile {
  id: string;
  path: string;
  profile: string;
}

/** The membership rules a profile carries (agent boundary-policy.ts `seatbeltProfile`), to take out: what remains is a profile as a boundary before them started under. */
const MEMBERSHIP_RULES =
  /^\(deny mach-lookup \(global-name-prefix "dev\.cawco\.boundary\."\)\)\n\(allow mach-lookup\n(?: {2}\(global-name "[^"]*"\)\n)+\)\n/m;

/**
 * p1 and p2: a pre-tag runner and its escaped child under each of two
 * workspaces' profiles, membership rules taken out (`live`, the first
 * delegate's; `gone`, the landing delegate's), each adopted by launchd; the
 * `gone` workspace archived; the agent started again.
 */
const preTagLegs = async (rig: Rig, profiles: readonly Profile[] | string) => {
  const { check, fleet } = rig;
  const [live, gone] = typeof profiles === "string" ? [] : profiles;
  if (!(live && gone)) {
    check(
      "p1: within 90 s of the agent's start, what an archived workspace's pre-tag boundary started is not alive",
      false,
      `its workspaces' profiles could not be read: ${String(profiles)}`
    );
    return;
  }
  const stripped = await Promise.all(
    (
      [
        [gone, PRE_TAG.gone],
        [live, PRE_TAG.live],
      ] as const
    ).map(async ([space, pair]) => {
      const preTag = space.profile.replace(MEMBERSHIP_RULES, "");
      const file = join(fleet.sandbox, `pre-tag-${pair.runner}.sb`);
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
        { cwd: space.path, stdio: ["ignore", "ignore", "ignore"] }
      );
      return (
        preTag !== space.profile && !preTag.includes("dev.cawco.boundary.")
      );
    })
  );
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
  const pids = wanted.flatMap((mark) => running.get(mark) ?? []);
  const readsPreTag = pids.every(
    (pid) =>
      seatbeltLetsLookUp(pid, "dev.cawco.boundary.") === true &&
      seatbeltLetsLookUp(pid, "com.apple.SecurityServer") === false
  );
  const archive = async (): Promise<{ state: string }> => {
    try {
      return await fleet.api<{ state: string }>(
        `/api/workspaces/${gone.id}/archive`,
        {}
      );
    } catch (error) {
      return { state: String(error) };
    }
  };
  const archived = await until(
    "the landing delegate's workspace archived",
    archive,
    (answer) => answer.state === "archived",
    120_000
  ).catch(() => archive());
  const cloneGone = await until(
    "its clone gone",
    async () => !(await there(gone.path)),
    Boolean,
    60_000
  ).catch(() => false);
  await fleet.stop("agent");
  fleet.launch("agent");
  await fleet.agentUp();
  const startedAt = Date.now();
  const after = await until(
    "the archived workspace's pair not alive",
    alive,
    (found) =>
      !(found.has(PRE_TAG.gone.runner) || found.has(PRE_TAG.gone.child)),
    90_000
  ).catch(() => alive());
  check(
    "p1: within 90 s of the agent's start, what an archived workspace's pre-tag boundary started is not alive",
    stripped.every(Boolean) &&
      readsPreTag &&
      wanted.every((mark) => running.has(mark)) &&
      archived.state === "archived" &&
      cloneGone &&
      !(after.has(PRE_TAG.gone.runner) || after.has(PRE_TAG.gone.child)),
    `membership rules taken out of both profiles: ${stripped.every(Boolean)}; started: ${said(running)}; each reads pre-tag: ${readsPreTag}; ${gone.id} ${archived.state}, its clone ${cloneGone ? "gone" : "still there"}; ${Math.round((Date.now() - startedAt) / 1000)} s after the agent's start: ${said(after)}`
  );
  check(
    "p2: the pre-tag pair of a workspace still here runs on",
    after.has(PRE_TAG.live.runner) && after.has(PRE_TAG.live.child),
    `${live.id}'s pair after the agent's start: ${said(after)}`
  );
};

const run = async (kit: Kit) => {
  const rig = await standUp(kit);
  try {
    const first = await firstLegs(rig);
    const landed = await landLegs(rig);
    // p: the profiles the first and the landing delegate's boundaries run
    // under, read now, while both run; macOS alone, where a boundary is a
    // Seatbelt profile.
    const profiles =
      process.platform === "darwin"
        ? await readProfiles(rig, [first, landed])
        : undefined;
    await gateLegs(rig);
    if (profiles !== undefined) {
      await preTagLegs(rig, profiles);
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

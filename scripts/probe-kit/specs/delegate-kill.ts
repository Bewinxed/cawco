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
 *
 * The hub's landing push is never cut by a delegate's interrupt (on macOS a
 * sweep cannot tell the push's Apple binaries from the delegate's, and
 * waits for it: agent boundary.ts `besideAgentCommands`). A second delegate
 * commits a file, leaves a `sleep 600.031` double-forked into a session of
 * its own, and finishes. The hub's repository holds every push in a
 * `pre-receive` hook for {@link PUSH_HELD_S} s; once the hook runs, its
 * parent interrupts the delegate:
 *
 * l1. 10 s after interrupt_delegate, every process whose command names the
 *     push's ref (its executor, its git) is still alive.
 * l2. The item lands: done, the hub's main holds its commit, and the push
 *     was never cut off.
 * l3. Within 15 s of the landing, the `sleep` it left is not alive.
 *
 *   bun scripts/probe-kit/run.ts delegate-kill
 */
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { commandLines } from "../../../packages/core/src/process-identity";
import {
  isAlive,
  listedPid,
  signal as signalPid,
} from "../../../packages/core/src/signal";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
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

/** Each leg's markers: the background, foreground and escaped `sleep`'s argument. */
const markers = (leg: "1" | "2") => ({
  background: `600.0${leg}2`,
  foreground: `600.0${leg}1`,
  escaped: `600.0${leg}3`,
});
type Markers = ReturnType<typeof markers>;
const MARKER = /\bsleep (600\.0[123][123])\b/;

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
    return useTool("Bash", {
      command: `${escaped}; sleep ${mark.foreground}`,
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
  const command = async (verb: Command, target: string, words = "") => {
    n += 1;
    const id = String(n);
    await fleet.send(parent, `PROBE-CMD ${id} ${verb} ${target} ${words}`);
    await until(
      `the parent's ${verb} of ${target}`,
      () => commands.get(id),
      (step) => step === "done",
      120_000
    );
  };
  const turnOpen = (id: string) =>
    fleet.instance(id)?.turn_open_at !== null &&
    fleet.instance(id)?.turn_open_at !== undefined;
  const itemOf = (id: string) =>
    fleet.query<{ state: string; held_at: number | null }>(
      "SELECT state, held_at FROM work_items WHERE id = ?",
      id
    )[0];
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

  const started = await fleet.api<{
    instanceId: string | null;
    workItemId: string | null;
  }>("/api/work-items", {
    parentInstanceId: parent,
    title: "Kill",
    prompt: `${BRIEF}: run the commands.`,
    harness: "claude",
    model: "claude-haiku-4-5",
    cwd: repo,
  });
  const dId = started.instanceId as string;
  const legOne = markers("1");
  const legTwo = markers("2");
  try {
    // i1
    await running(legOne, dId);
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
    const item = itemOf(started.workItemId as string);
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

    // l1: the hub's repository holds every push in its pre-receive hook.
    const landDir = join(fleet.sandbox, "land");
    await mkdir(landDir, { recursive: true });
    const bare = join(fleet.sandbox, "hub", "git", `${project.id}.git`);
    await mkdir(join(bare, "hooks"), { recursive: true });
    const hook = join(bare, "hooks", "pre-receive");
    const pushStarted = join(landDir, "push-started");
    const pushTaken = join(landDir, "push-taken");
    await writeFile(
      hook,
      `#!/bin/sh\n: > '${pushStarted}'\nsleep ${PUSH_HELD_S}\n: > '${pushTaken}'\n`
    );
    await chmod(hook, 0o755);
    const there = (path: string) =>
      readFile(path, "utf8").then(
        () => true,
        () => false
      );
    const landed = await fleet.api<{
      instanceId: string | null;
      workItemId: string | null;
    }>("/api/work-items", {
      parentInstanceId: parent,
      title: "Land",
      prompt: `${LAND_BRIEF}: commit, then finish.`,
      harness: "claude",
      model: "claude-haiku-4-5",
      cwd: repo,
    });
    const lId = landed.instanceId as string;
    await until(
      "its landing's push held by the hub's repository",
      () => there(pushStarted),
      Boolean,
      600_000
    );
    const pushing = await pushes();
    const leftAtInterrupt = (await alive()).get(LANDED_LEFT) ?? [];
    const landInterruptedAt = Date.now();
    await command("interrupt", lId);
    await Bun.sleep(Math.max(0, landInterruptedAt + 10_000 - Date.now()));
    const cut = pushing.filter((pid) => !isAlive(listedPid(pid)));
    const takenEarly = await there(pushTaken);
    check(
      "l1: 10 s after interrupt_delegate, every process of its landing's push is still alive",
      pushing.length > 0 && cut.length === 0 && !takenEarly,
      `the push: ${pushing.join(", ") || "never found"}; gone: ${cut.join(", ") || "none"}; the hub had ${takenEarly ? "already" : "not yet"} taken it; what it left running at the interrupt: ${leftAtInterrupt.join(", ") || "nothing"}`
    );

    // l2
    const landRow = await until(
      "its item ended",
      () =>
        fleet.query<{
          state: string;
          error: string | null;
          result: string | null;
        }>(
          "SELECT state, error, result FROM work_items WHERE id = ?",
          landed.workItemId as string
        )[0],
      (row) => ["done", "failed", "cancelled"].includes(row?.state ?? ""),
      600_000
    );
    const landEndedAt = Date.now();
    const main = (
      await Bun.$`git log --format=%s main`.cwd(bare).nothrow().quiet().text()
    )
      .trim()
      .split("\n");
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

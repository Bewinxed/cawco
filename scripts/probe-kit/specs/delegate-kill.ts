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
 *   bun scripts/probe-kit/run.ts delegate-kill
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { commandLines } from "../../../packages/core/src/process-identity";
import {
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

/** Each leg's markers: the background, foreground and escaped `sleep`'s argument. */
const markers = (leg: "1" | "2") => ({
  background: `600.0${leg}2`,
  foreground: `600.0${leg}1`,
  escaped: `600.0${leg}3`,
});
type Markers = ReturnType<typeof markers>;
const MARKER = /\bsleep (600\.0[12][123])\b/;

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

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (request.all.includes("PROBE-CMD")) {
    return parentReply(request);
  }
  return request.all.includes(BRIEF) ? delegateReply(request) : text("ok");
};

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
      `its requests since the interrupt: ${lasts(woke)}; its item: ${JSON.stringify(item)}`
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

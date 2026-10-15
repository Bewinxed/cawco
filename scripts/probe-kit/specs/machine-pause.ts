/**
 * A machine paused until a time runs nothing CawCo starts until then, and an
 * interrupted delegate stays idle until its parent or the owner sends it
 * something (hub machine-pause.ts, work-items.ts `interrupted`). On a scratch
 * fleet with two machines (real hub, agents and sessiond; Claude Code
 * against the mock model), boundaries included: run it where a workspace
 * boundary can start (not inside another one).
 *
 * The owner, on battery: "what is consuming my mac cpu? slowing me down, i'm
 * on battery rn can we pause mac work for the next 3 hours". The Mac's agent
 * was stopped by hand, and an interrupted delegate there woke a minute later
 * and ran the iOS build.
 *
 * Machine A is the fleet's own; machine B is `probe-b`. One repository is a
 * checkout of the project on both (every machine runs on this host). The
 * parent is a Claude session on A that calls its CawCo tools when the probe
 * tells it to (`PROBE-CMD <n> <tool> <target> [words]`).
 *
 * Interrupt hold, on A:
 * h1. A delegate mid-turn (a long `sleep`), interrupted with
 *     interrupt_delegate: past the quiet-turn period it has had no new turn,
 *     and its item is still running, held.
 * h2. A handoff from its parent wakes it.
 *
 * Machine pause, B paused for two minutes:
 * p1. A delegate on B mid-turn: its turn is interrupted.
 * p2. A handoff to it is queued, and its answer says B is paused and until
 *     when; nothing reaches the delegate.
 * p3. A new delegate for B waits in the tray with the reason; a delegate on
 *     A runs meanwhile.
 * p4. An acceptance check with `machine: probe-b` waits, its item's status
 *     naming the pause and its end.
 * p5. The hub restarted mid-pause, with a minute of it left, keeps the
 *     pause, and the waiting check, resumed, still says why it waits.
 * p1–p4 are read while the pause lasts; p6 once it has ended.
 * p6. At the end everything proceeds: the interrupted delegate carries on
 *     and reads the handoff, the queued delegate starts on B, the check runs
 *     and the item lands; B is no longer paused.
 * p7. A check already running on B as a second pause begins (`sleep 600`
 *     there): within 10 s its process is gone from the process table and the
 *     check says it waits for the pause; the item is not failed, its check
 *     run is the same one, and its delegate is told nothing; B's row says it
 *     stopped 1 running check. After the pause the check runs again and the
 *     item lands.
 * p8. A workflow's `w.exec` already running on B as a third pause begins:
 *     its process goes within 10 s, the run stays running and says its
 *     command waits for the pause, the answer says it stopped 1 running
 *     workflow command; after the pause the command runs again and the run
 *     ends done.
 *
 *   bun scripts/probe-kit/run.ts machine-pause
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const B = "probe-b";
const PAUSE_MS = 120_000;
const FINISH = "mcp__cawco__finish_item";
const TOOLS = {
  interrupt: "mcp__cawco__interrupt_delegate",
  handoff: "mcp__cawco__handoff",
} as const;
type Command = keyof typeof TOOLS;
/** A delegate's brief carries its tag: SLEEP runs a long command, HELLO says ok, FINISH-C finishes once B is paused. */
const SLEEP = /PROBE-SLEEP-([A-Z])/;
const HELLO = "PROBE-HELLO-Q";
const FINISH_C = "PROBE-FINISH-C";
const FINISH_D = "PROBE-FINISH-D";
/**
 * p7's check on B, run in its check workspace's clone: its first run marks
 * the clone and sleeps; the run after the pause finds the mark and ends.
 */
const LONG_CHECK =
  "if [ -e .p7-ran ]; then echo ran-p7; else touch .p7-ran; sleep 600; fi";
const P7_PAUSE_MS = 60_000;
const CMD = /PROBE-CMD (\d+) (interrupt|handoff) (\S+)(?: (.*))?/g;

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const useTool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** Each delegate's requests, by its tag: when, what started it, whether a tool's result. */
const heard = new Map<string, Seen[]>();
const slept = new Set<string>();
/** The parent's commands: how far each has gone. */
const commands = new Map<string, "searched" | "called" | "done">();
/** Set once B is paused: C then finishes its item, whose check runs on B. */
let paused = false;
let finishSearched = false;
let finishCalled = false;
let dSearched = false;
let dCalled = false;

const parentReply = (request: Seen): Reply => {
  const matches = [...request.all.matchAll(CMD)];
  const last = matches.at(-1);
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

/** What the mock answered each delegate's request with, by tag, in order: a failure's detail reads it. */
const answered = new Map<string, string[]>();

/** A reply in a word: the tool it calls, else its words. */
const replyWord = (reply: Reply): string =>
  reply.tool
    ? `${reply.tool.name} ${JSON.stringify(reply.tool.input).slice(0, 60)}`
    : reply.words.join("");

const delegateReply = (tag: string, request: Seen): Reply => {
  heard.set(tag, [...(heard.get(tag) ?? []), request]);
  const reply = delegateAnswer(tag, request);
  answered.set(tag, [...(answered.get(tag) ?? []), replyWord(reply)]);
  return reply;
};

const delegateAnswer = (tag: string, request: Seen): Reply => {
  if (tag === "D") {
    // Finishes at once: its check on B is what p7 pauses.
    if (!dCalled && request.toolNames.includes(FINISH)) {
      dCalled = true;
      return useTool(FINISH, { headline: "Checked.", summary: "Checked." });
    }
    if (!(dCalled || dSearched)) {
      dSearched = true;
      return useTool("ToolSearch", {
        query: `select:${FINISH}`,
        max_results: 1,
      });
    }
    return text("done D");
  }
  if (tag === "C") {
    // Spins on short sleeps, a delegate at work on A, until B is paused.
    if (!paused) {
      return useTool("Bash", { command: "sleep 2", description: "Work" });
    }
    if (!finishCalled && request.toolNames.includes(FINISH)) {
      finishCalled = true;
      return useTool(FINISH, { headline: "Checked.", summary: "Checked." });
    }
    if (!(finishCalled || finishSearched)) {
      finishSearched = true;
      return useTool("ToolSearch", {
        query: `select:${FINISH}`,
        max_results: 1,
      });
    }
    return text("done C");
  }
  if (tag === "Q" || slept.has(tag)) {
    return text(`ok ${tag}`);
  }
  slept.add(tag);
  return useTool("Bash", {
    command: "sleep 900",
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
  const tag =
    SLEEP.exec(request.all)?.[1] ??
    (request.all.includes(HELLO) ? "Q" : undefined) ??
    (request.all.includes(FINISH_C) ? "C" : undefined) ??
    (request.all.includes(FINISH_D) ? "D" : undefined);
  return tag ? delegateReply(tag, request) : text("ok");
};

interface Started {
  instanceId: string | null;
  queued: string | null;
  text: string;
  workItemId: string | null;
  workspaceId: string | null;
}

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
  await fleet.launchMachine(B);

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
    name: "Machine pause",
    machineId: MACHINE,
    cwd: repo,
  });
  await fleet.api(`/api/projects/${project.id}/places`, {
    machineId: B,
    path: repo,
  });
  const parent = await fleet.spawn("claude", "Parent", repo, {
    projectId: project.id,
  });

  let n = 0;
  /** Has the parent call one of its tools; answers once its call has been answered. */
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
    // The tool's answer, as the parent read it: the last request's last words.
    return (
      fleet.seen.filter((seen) => seen.all.includes(`PROBE-CMD ${id} `)).at(-1)
        ?.last ?? ""
    );
  };
  const delegate = (title: string, prompt: string, extra: object = {}) =>
    fleet.api<Started>("/api/work-items", {
      parentInstanceId: parent,
      title,
      prompt,
      harness: "claude",
      model: "claude-haiku-4-5",
      cwd: repo,
      checks: [{ name: "Probe check", command: "true" }],
      ...extra,
    });
  const turnOpen = (id: string) =>
    fleet.instance(id)?.turn_open_at !== null &&
    fleet.instance(id)?.turn_open_at !== undefined;
  const itemOf = (id: string) =>
    fleet.query<{
      state: string;
      result: string | null;
      held_at: number | null;
    }>("SELECT state, result, held_at FROM work_items WHERE id = ?", id)[0];
  /** The requests a delegate made after `at`, by what started each. */
  const since = (tag: string, at: number) =>
    (heard.get(tag) ?? []).filter((seen) => seen.at > at);
  const lasts = (seen: Seen[]) =>
    seen.map((one) => JSON.stringify(one.last.slice(0, 200))).join("; ") ||
    "none";
  /** A delegate's long command is running: its first request was answered with it. */
  const sleeping = async (tag: string, instanceId: string) => {
    await until(
      `${tag} running its long command`,
      () => slept.has(tag),
      Boolean,
      180_000
    );
    await until(
      `${tag}'s turn open`,
      () => turnOpen(instanceId),
      Boolean,
      30_000
    );
    await Bun.sleep(3000);
  };

  // h1
  const h = await delegate("Hold", "PROBE-SLEEP-H: run the long command.");
  const hId = h.instanceId as string;
  await sleeping("H", hId);
  const interruptedAt = Date.now();
  await command("interrupt", hId);
  await until("H's turn closed", () => !turnOpen(hId), Boolean, 60_000);
  // Past the quiet-turn period: a quiet turn's "still open" message went at
  // once; three of them failed an item within seconds.
  await Bun.sleep(30_000);
  const woke = since("H", interruptedAt);
  check(
    "h1: an interrupted delegate has no new turn past the quiet-turn period",
    woke.length === 0,
    `its requests since the interrupt: ${lasts(woke)}`
  );
  const hItem = itemOf(h.workItemId as string);
  check(
    "h1: its item is still running, held",
    hItem?.state === "running" && hItem.held_at !== null,
    JSON.stringify(hItem)
  );

  // h2
  const handedAt = Date.now();
  await command("handoff", hId, "PROBE-WAKE-H carry on");
  await until(
    "H woken by the handoff",
    () =>
      since("H", handedAt).find((seen) => seen.all.includes("PROBE-WAKE-H")),
    Boolean,
    120_000
  ).catch(() => undefined);
  const wokeByHandoff = since("H", handedAt).some((seen) =>
    seen.last.includes("PROBE-WAKE-H")
  );
  check(
    "h2: a handoff from its parent wakes it",
    wokeByHandoff && itemOf(h.workItemId as string)?.held_at === null,
    `its requests since the handoff: ${lasts(since("H", handedAt))}`
  );

  await pauseSection(kit, fleet, {
    command,
    delegate,
    itemOf,
    lasts,
    parent,
    repo,
    since,
    sleeping,
    turnOpen,
  });
};

interface Probe {
  command: (verb: Command, target: string, words?: string) => Promise<string>;
  delegate: (title: string, prompt: string, extra?: object) => Promise<Started>;
  itemOf: (
    id: string
  ) =>
    | { held_at: number | null; result: string | null; state: string }
    | undefined;
  lasts: (seen: Seen[]) => string;
  parent: string;
  /** The project's checkout, at the same path on both machines. */
  repo: string;
  since: (tag: string, at: number) => Seen[];
  sleeping: (tag: string, instanceId: string) => Promise<void>;
  turnOpen: (id: string) => boolean;
}

/**
 * A delegate's requests as a failure tells them: each one's time from
 * `from`, whether it carried a tool's result, the end of what it read and
 * what the mock answered.
 */
const story = (tag: string, from: number): string =>
  (heard.get(tag) ?? [])
    .map((seen, i) => {
      const at = Math.round((seen.at - from) / 1000);
      const read = JSON.stringify(seen.all.slice(-300));
      return `[${at >= 0 ? "+" : ""}${at}s${seen.afterTool ? " tool-result" : ""}] …${read} → ${answered.get(tag)?.[i] ?? "?"}`;
    })
    .join("\n  ") || "none";

/** The clock a pause's end is said in, as the hub says it. */
const clock = (at: number): string =>
  new Date(at).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

const pausedUntil = async (fleet: KitFleet): Promise<number | null> => {
  const rows =
    await fleet.api<{ machineId: string; pausedUntil?: number | null }[]>(
      "/api/agents"
    );
  return rows.find((row) => row.machineId === B)?.pausedUntil ?? null;
};

const pauseSection = async (kit: Kit, fleet: KitFleet, probe: Probe) => {
  const { check } = kit;
  // A delegate on B, mid-turn; and C on A, at work.
  const b = await probe.delegate(
    "On B",
    "PROBE-SLEEP-B: run the long command.",
    {
      machineId: B,
    }
  );
  const bId = b.instanceId as string;
  await probe.sleeping("B", bId);
  const c = await probe.delegate("Checker", `${FINISH_C}: finish once told.`, {
    checks: [{ name: "On B", command: "echo ran-on-b", machine: B }],
  });
  // C at work on A before B is paused: its turn under way, spinning.
  await until(
    "C at work on A",
    () => heard.get("C")?.length,
    (count) => count >= 2,
    180_000
  );

  // p1
  const pausedAt = Date.now();
  const until_ = pausedAt + PAUSE_MS;
  const answer = await fetch(`${fleet.base}/api/machines/${B}/pause`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ until: new Date(until_).toISOString() }),
  });
  const view = (await answer.json().catch(() => ({}))) as {
    pausedUntil?: number;
  };
  check(
    "p1: POST /api/machines/:id/pause pauses B until the time asked",
    answer.status === 200 && view.pausedUntil === until_,
    `${answer.status} ${JSON.stringify(view)}`
  );
  if (answer.status !== 200) {
    throw new Error("B could not be paused: the rest has nothing to read");
  }
  paused = true;
  await until(
    "B's turn interrupted",
    () => !probe.turnOpen(bId),
    Boolean,
    60_000
  ).catch(() => undefined);
  check(
    "p1: the delegate on B mid-turn has its turn interrupted",
    !probe.turnOpen(bId),
    JSON.stringify(fleet.instance(bId))
  );

  // p2
  const said = await probe.command("handoff", bId, "PROBE-WAKE-B carry on");
  const words = `paused until ${clock(until_)}`;
  const [owed] = fleet.query<{ state: string; owed: string | null }>(
    "SELECT state, owed FROM sent_messages WHERE instance_id = ? AND body LIKE '%PROBE-WAKE-B%'",
    bId
  );
  check(
    "p2: a handoff to it is queued, and its answer says B is paused and until when",
    said.includes(words) && owed?.state === "pending" && owed.owed !== null,
    `answer: ${said.slice(0, 400)}; record: ${JSON.stringify(owed && { state: owed.state, owed: owed.owed !== null })}`
  );

  // p3
  const q = await probe.delegate("Queued for B", `${HELLO}: say ok.`, {
    machineId: B,
  });
  check(
    "p3: a new delegate for B waits in the tray, saying B is paused until when",
    q.queued !== null && q.workItemId === null && q.text.includes(words),
    JSON.stringify(q)
  );
  // Every check of the pause reads it while it lasts: p3 and p4 by the time
  // the restart (p5) needs, with a minute of the pause still to come.
  const restartBy = until_ - 60_000;
  const before = (at: number) => Math.max(1000, at - Date.now());
  const cWorked = () =>
    (heard.get("C") ?? []).filter((seen) => seen.at > pausedAt).length;
  await until(
    "C at work on A during the pause",
    cWorked,
    (count) => count >= 1,
    before(restartBy)
  ).catch(() => undefined);
  const cRan = check(
    "p3: a delegate on A runs meanwhile",
    cWorked() >= 1,
    `C's requests since the pause: ${cWorked()}; all of C's:\n  ${story("C", pausedAt)}`
  );

  // p4
  const tray = () =>
    fleet.api<{ id: string; checkQueue: { words: string } | null }[]>(
      `/api/work-items?parent=${probe.parent}`
    );
  const checkWait = () =>
    until(
      "C's check waiting on B",
      async () =>
        (await tray()).find((item) => item.id === c.workItemId)?.checkQueue
          ?.words,
      (status) => status.includes("paused"),
      before(restartBy)
    ).catch(() => undefined);
  const cItem = () =>
    JSON.stringify(
      fleet.query(
        "SELECT state, checking_since, error FROM work_items WHERE id = ?",
        c.workItemId as string
      )[0]
    );
  const waiting = await checkWait();
  const cWaited = check(
    "p4: a check with machine: probe-b waits, its item's status naming the pause and its end",
    waiting?.includes(words) === true,
    `${waiting ?? "no wait said"}; C's item: ${cItem()}; all of C's:\n  ${story("C", pausedAt)}`
  );
  const bQuiet = check(
    "p1–p4: nothing reached the delegate on B while paused",
    Date.now() < until_ && probe.since("B", pausedAt).length === 0,
    `${Math.round((until_ - Date.now()) / 1000)}s of the pause left; B's requests since it began:\n  ${story("B", pausedAt)}`
  );
  if (!(cRan && cWaited && bQuiet)) {
    // The hub's own account of the pause and of what it sent B and C.
    const ids = [bId, c.instanceId as string].map((id) => id.slice(0, 8));
    const lines = (await fleet.logs("hub"))
      .split("\n")
      .filter(
        (line) =>
          line.includes("[pause]") ||
          line.includes("[work-items]") ||
          ids.some((id) => line.includes(id))
      )
      .slice(-60);
    kit.note(`hub log, pause and B/C lines:\n${lines.join("\n")}`);
  }

  // p5
  await fleet.stop("hub");
  fleet.launch("hub");
  await fleet.hubUp();
  const kept = await pausedUntil(fleet);
  check(
    "p5: the hub restarted mid-pause keeps the pause",
    kept === until_ && Date.now() < until_,
    `pausedUntil ${kept}, ${Math.round((until_ - Date.now()) / 1000)}s left`
  );
  // The check its finish_item started waits again under the new hub (its
  // checks resumed as A registers), still saying why.
  const resumed = await until(
    "C's check waiting again after the restart",
    async () =>
      (await tray()).find((item) => item.id === c.workItemId)?.checkQueue
        ?.words,
    (status) => status.includes("paused"),
    before(until_ - 5000)
  ).catch(() => undefined);
  check(
    "p5: after the restart the check still waits, saying so",
    resumed?.includes(words) === true,
    `${resumed ?? "no wait said"}; C's item: ${cItem()}`
  );

  // p6
  await until(
    "the pause's end",
    () => Date.now(),
    (now) => now > until_ + 2000,
    PAUSE_MS + 30_000
  );
  const carriedOn = await until(
    "B reading the handoff",
    () =>
      probe
        .since("B", pausedAt)
        .find((seen) => seen.all.includes("PROBE-WAKE-B")),
    Boolean,
    180_000
  ).catch(() => undefined);
  const early = probe.since("B", pausedAt).filter((seen) => seen.at < until_);
  check(
    "p6: the interrupted delegate carries on at the end, and reads the handoff",
    carriedOn !== undefined && early.length === 0,
    `its requests since the pause: ${probe.lasts(probe.since("B", pausedAt))}; before its end: ${early.length}`
  );
  const qStarted = await until(
    "the queued delegate starting",
    () =>
      fleet.query<{ machine_id: string }>(
        "SELECT w.machine_id FROM work_items i JOIN workspaces w ON w.id = i.workspace_id WHERE i.id = ?",
        q.queued as string
      )[0]?.machine_id,
    (machine) => machine === B,
    180_000
  ).catch(() => undefined);
  await until(
    "Q heard",
    () => heard.get("Q")?.length,
    (count) => count > 0,
    180_000
  ).catch(() => undefined);
  check(
    "p6: the queued delegate starts on B",
    qStarted === B && (heard.get("Q")?.length ?? 0) > 0,
    `workspace on ${qStarted ?? "none"}; its requests: ${heard.get("Q")?.length ?? 0}`
  );
  const cDone = await until(
    "C's item landed",
    () => probe.itemOf(c.workItemId as string),
    (row) => row.state !== "running" && row.state !== "starting",
    300_000
  ).catch(() => probe.itemOf(c.workItemId as string));
  check(
    "p6: the check on B runs and the item lands",
    cDone?.state === "done" && (cDone.result ?? "").includes("- On B: pass ("),
    `${cDone?.state}: ${(cDone?.result ?? "").slice(0, 600)}`
  );
  const after = await pausedUntil(fleet);
  check("p6: B is no longer paused", after === null, String(after));

  await runningCheck(kit, fleet, probe, tray);
  await runningExec(kit, fleet, probe.repo);
};

/** p8's workflow: one `w.exec` in B's checkout, marked like p7's check; its output is the run's result. */
const LONG_EXEC_PROGRAM = `import { z } from "zod";

export const inputs = z.object({});

export default async function (w: Workflow<typeof inputs>) {
  const out = await w.exec(
    "if [ -e .p8-ran ]; then echo ran-p8; else touch .p8-ran; sleep 600; fi",
    { timeoutMinutes: 15 }
  );
  return out.stdout.trim();
}
`;

interface RunView {
  result: unknown;
  status: string;
  waiting: string | null;
}

/** p8: a workflow's `w.exec` already running on B as a pause begins. */
const runningExec = async (kit: Kit, fleet: KitFleet, repo: string) => {
  const { check } = kit;
  const before = await longSleeps();
  const workflow = await fleet.api<{ id: string }>("/api/workflows", {
    name: "Pause probe exec",
    program: LONG_EXEC_PROGRAM,
  });
  const { runId } = await fleet.api<{ runId: string }>(
    `/api/workflows/${workflow.id}/runs`,
    { workspace: { path: repo, machineId: B } }
  );
  const runView = () => fleet.api<RunView>(`/api/workflow-runs/${runId}`);
  const ours = await until(
    "the run's w.exec sleeping on B",
    async () => [...(await longSleeps())].filter((pid) => !before.has(pid)),
    (pids) => pids.length > 0,
    120_000
  ).catch(async () => {
    throw new Error(
      `p8: the run's w.exec never started: ${JSON.stringify(await runView())}`
    );
  });
  const pausedAt = Date.now();
  const until_ = pausedAt + P7_PAUSE_MS;
  const answer = await fetch(`${fleet.base}/api/machines/${B}/pause`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ until: new Date(until_).toISOString() }),
  });
  const view = (await answer.json().catch(() => ({}))) as {
    pauseStopped?: string | null;
  };
  const gone = await until(
    "the w.exec's sleep gone",
    async () => {
      const now = await longSleeps();
      return ours.every((pid) => !now.has(pid));
    },
    Boolean,
    10_000
  ).catch(() => false);
  check(
    "p8: within 10 s of the pause the running w.exec's process is gone from B's process table",
    gone === true,
    `pids ${ours.join(" ")}`
  );
  const words = `paused until ${clock(until_)}`;
  const waiting = await until(
    "the run waiting on the pause",
    runView,
    (seen) => seen.waiting?.includes("paused") === true,
    10_000
  ).catch(runView);
  check(
    "p8: the run is still running, and says its command waits: … paused until",
    waiting.status === "running" &&
      waiting.waiting?.startsWith("waiting:") === true &&
      waiting.waiting.includes(words),
    JSON.stringify({ status: waiting.status, waiting: waiting.waiting })
  );
  check(
    "p8: the pause's answer says it stopped 1 running workflow command",
    view.pauseStopped === "stopped 1 running workflow command",
    `${answer.status} ${JSON.stringify(view)}`
  );
  const ended = await until(
    "the run's end",
    runView,
    (seen) => seen.status !== "running" && seen.status !== "waiting",
    P7_PAUSE_MS + 180_000
  ).catch(runView);
  check(
    "p8: after the pause the w.exec runs again and the run ends done, waiting on nothing",
    ended.status === "done" &&
      ended.result === "ran-p8" &&
      ended.waiting === null &&
      Date.now() > until_,
    JSON.stringify({
      status: ended.status,
      result: ended.result,
      waiting: ended.waiting,
    })
  );
};

/** Every `sleep 600` in this host's process table (every machine of the fleet runs here). */
const longSleeps = async (): Promise<Set<string>> =>
  new Set(
    (await Bun.$`pgrep -fx ${"sleep 600"}`.nothrow().quiet().text())
      .split("\n")
      .map((pid) => pid.trim())
      .filter(Boolean)
  );

/** p7: a check already running on B as a pause begins. */
const runningCheck = async (
  kit: Kit,
  fleet: KitFleet,
  probe: Probe,
  tray: () => Promise<{ id: string; checkQueue: { words: string } | null }[]>
) => {
  const { check } = kit;
  const before = await longSleeps();
  const d = await probe.delegate("Long check", `${FINISH_D}: finish now.`, {
    checks: [
      {
        name: "Long on B",
        command: LONG_CHECK,
        machine: B,
        timeoutSec: 900,
      },
    ],
  });
  const dItem = d.workItemId as string;
  const ours = await until(
    "D's check sleeping on B",
    async () => [...(await longSleeps())].filter((pid) => !before.has(pid)),
    (pids) => pids.length > 0,
    300_000
  );
  const row = () =>
    fleet.query<{ state: string; checking_since: number | null }>(
      "SELECT state, checking_since FROM work_items WHERE id = ?",
      dItem
    )[0];
  const checking = row();
  const pausedAt = Date.now();
  const until_ = pausedAt + P7_PAUSE_MS;
  const answer = await fetch(`${fleet.base}/api/machines/${B}/pause`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ until: new Date(until_).toISOString() }),
  });
  const view = (await answer.json().catch(() => ({}))) as {
    pauseStopped?: string | null;
  };
  const gone = await until(
    "D's sleep gone",
    async () => {
      const now = await longSleeps();
      return ours.every((pid) => !now.has(pid));
    },
    Boolean,
    10_000
  ).catch(() => false);
  check(
    "p7: within 10 s of the pause the running check's process is gone from B's process table",
    gone === true && Date.now() - pausedAt <= 12_000,
    `pids ${ours.join(" ")}; still there: ${[...(await longSleeps())].filter((pid) => ours.includes(pid)).join(" ") || "none"}`
  );
  const words = `paused until ${clock(until_)}`;
  const waiting = await until(
    "D's check waiting on the pause",
    async () =>
      (await tray()).find((item) => item.id === dItem)?.checkQueue?.words,
    (status) => status.includes("paused"),
    10_000
  ).catch(() => undefined);
  check(
    "p7: the stopped check reads waiting: … paused until",
    waiting?.startsWith("waiting:") === true && waiting.includes(words),
    waiting ?? "no wait said"
  );
  const during = row();
  const toldD = (heard.get("D") ?? []).filter((seen) => seen.at > pausedAt);
  check(
    "p7: the item is not failed, its check run is the same one, and its delegate is told nothing",
    during?.state === "running" &&
      during.checking_since !== null &&
      during.checking_since === checking?.checking_since &&
      toldD.length === 0,
    `before ${JSON.stringify(checking)}, during ${JSON.stringify(during)}; D's requests since the pause:\n  ${story("D", pausedAt)}`
  );
  check(
    "p7: the pause's answer says it stopped 1 running check",
    view.pauseStopped === "stopped 1 running check",
    `${answer.status} ${JSON.stringify(view)}`
  );
  const done = await until(
    "D's item landed",
    () => probe.itemOf(dItem),
    (item) => item.state !== "running" && item.state !== "starting",
    P7_PAUSE_MS + 300_000
  ).catch(() => probe.itemOf(dItem));
  check(
    "p7: after the pause the check runs again and the item lands",
    done?.state === "done" &&
      (done.result ?? "").includes("- Long on B: pass (") &&
      Date.now() > until_,
    `${done?.state}: ${(done?.result ?? "").slice(0, 600)}`
  );
};

export default { name: "machine-pause", run } satisfies Spec;

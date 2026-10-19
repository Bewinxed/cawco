/**
 * What a delegate leaves running in its boundary keeps running across its
 * turns, and stays where its next command finds it (agent boundary.ts
 * `replaceOlder`, `workLeft`). On a scratch fleet (real hub, agent and
 * sessiond; Claude Code against the mock model), boundaries included: run it
 * where a workspace boundary can start (not inside another one).
 *
 * On 2026-10-19 a delegate's `setsid nohup` loop was "gone" at its next turn
 * (workspace 9b87c52b): between its turns an agent update gave its boundary
 * an older form, and its next command's ensure handed the boundary over to a
 * new one, its own pid namespace, because the loop listened on no port. The
 * loop ran on in the older sandbox, where nothing the delegate ran could see
 * or signal it.
 *
 * H starts `setsid nohup sh -c 'while :; do date +%s >> beat; sleep 2; done'`
 * in its clone and ends its turn in a wait, its item live. Its boundary is
 * given an older form (an account added to its policy, as a session on
 * another account would) and the agent restarts. A message then gives H a
 * second turn, whose ensure meets the older form.
 *
 * 1. The heartbeat file grows across the turn boundary, and still grows after
 *    the second turn.
 * 2. In H's second turn, the loop's pid is alive and is the loop, in the pid
 *    namespace its first turn ran in.
 * 3. H's boundary is the one it had: kept as it is while its work runs, said
 *    in the agent's log, never handed over.
 *
 *   bun scripts/probe-kit/run.ts boundary-handover
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isBoundaryOf } from "../../../packages/agent/src/proc-id";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const WAIT = "mcp__cawco__wait_item";
const TAG = /PROBE-BEAT-(?:CHECK-)?H:/;
const PID_NS = /pid:\[\d+\]/g;
const STARTED = /BEAT-STARTED-(\d+):/;
const ALIVE = /BEAT-ALIVE-(\d+):/;
const BEATS = /BEAT-COUNT-(\d+):/;
const ACCOUNT_ADDED = "acct-probe-older-form";
const START_LINE = "[workspace] boundary hooks written for ";
const KEPT_LINE = "is kept as it is while its work runs";
/** H's rest after each command: longer than the spec, so its item stays live. */
const REST = { minutes: 60, reason: "its parent's word on the heartbeat" };

/** The brief's loop, its output let go so the command that starts it ends. */
const START = [
  `setsid nohup sh -c 'while :; do date +%s >> beat; sleep 2; done' > /dev/null 2>&1 < /dev/null &`,
  "echo $! > beat.pid",
  `echo "BEAT-""STARTED-$(cat beat.pid):"`,
  "readlink /proc/self/ns/pid",
].join("\n");

/** Whether the loop's pid is alive and still the loop, then the heartbeat's length and the pid namespace. */
const CHECK = [
  "pid=$(cat beat.pid)",
  `if kill -0 "$pid" 2>/dev/null && tr '\\0' ' ' < "/proc/$pid/cmdline" | grep -q 'date +%s >> beat'; then echo "BEAT-""ALIVE-$pid:"; else echo "loop $pid not found"; fi`,
  `echo "BEAT-""COUNT-$(wc -l < beat):"`,
  "readlink /proc/self/ns/pid",
].join("\n");

const state: { started?: boolean; rested: number; checked?: boolean } = {
  rested: 0,
};

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const tool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** A deferred tool is found first, then called. */
const offered = (request: Seen, name: string, input: object): Reply => {
  if (request.toolNames.includes(name)) {
    return tool(name, input);
  }
  return request.toolNames.includes("ToolSearch")
    ? tool("ToolSearch", { query: `select:${name}`, max_results: 1 })
    : text(`${name} is not offered`);
};

/** H: starts the loop, rests; asked to check, checks, rests again. */
const respond = (request: Seen): Reply => {
  if (!(request.tools && TAG.test(request.all))) {
    return text("ok");
  }
  if (!state.started) {
    state.started = true;
    return tool("Bash", { command: START, description: "Start the heartbeat" });
  }
  if (request.all.includes("PROBE-BEAT-CHECK-H:") && !state.checked) {
    state.checked = true;
    return tool("Bash", { command: CHECK, description: "Check the heartbeat" });
  }
  const rests = 1 + Number(Boolean(state.checked));
  if (state.rested < rests) {
    const reply = offered(request, WAIT, REST);
    if (reply.tool?.name === WAIT) {
      state.rested = rests;
    }
    return reply;
  }
  return text("ok");
};

type Fleet = Awaited<ReturnType<Kit["fleet"]>>;

/** The heartbeat's lines in H's clone, read on the host. */
const beats = async (clone: string): Promise<number> =>
  (await readFile(join(clone, "beat"), "utf8").catch(() => ""))
    .split("\n")
    .filter(Boolean).length;

/** H's boundary processes as the keeper holds them. */
const boundariesOf = async (fleet: Fleet, id: string): Promise<string[]> =>
  (await fleet.heldProcs())
    .filter((proc) => isBoundaryOf(proc.procId, id))
    .map((proc) => `${proc.procId}@${proc.pid}`);

/** The first answered request whose words match `marker`, from `from` on. */
const seenWith = (fleet: Fleet, marker: RegExp, from: number) =>
  until(
    `a command's output matching ${marker}`,
    () => fleet.seen.slice(from).find((one) => marker.test(one.all)),
    Boolean,
    240_000
  ).catch(() => undefined);

/** The fleet up, a project, its parent session and H delegated. */
const standUp = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  const home = fleet.env.HOME as string;
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  const src = join(fleet.sandbox, "src");
  await mkdir(src, { recursive: true });
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  await Bun.$`sh -c ${"git init -q -b main && echo beat > README.md && git add -A && git commit -qm 'First commit'"}`
    .cwd(src)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Beat",
    machineId: MACHINE,
    cwd: src,
  });
  const parent = await fleet.spawn("claude", "Parent", src, {
    projectId: project.id,
  });
  const h = await fleet.api<{
    instanceId: string;
    workItemId: string;
    workspaceId: string;
  }>("/api/work-items", {
    parentInstanceId: parent,
    title: "Beat H",
    prompt: "PROBE-BEAT-H: start the heartbeat, then wait.",
    harness: "claude",
    model: "claude-haiku-4-5",
    cwd: src,
  });
  return { fleet, home, h };
};

/** Gives workspace `id` an older form (an account added to its policy), then restarts the agent, as an update does. */
const olderFormRestart = async (
  fleet: Fleet,
  home: string,
  id: string
): Promise<void> => {
  const accounts = join(home, ".cawco", "workspaces", id, "accounts.json");
  const listed = JSON.parse(
    await readFile(accounts, "utf8").catch(() => "[]")
  ) as string[];
  await writeFile(accounts, `${JSON.stringify([...listed, ACCOUNT_ADDED])}\n`);
  const before = (await fleet.logs("agent")).split(START_LINE).length;
  await fleet.stop("agent");
  fleet.launch("agent");
  await fleet.agentUp();
  await until(
    "the restarted agent's start-up pass",
    () => fleet.logs("agent"),
    (logged) => logged.split(START_LINE).length > before,
    120_000
  );
};

const run = async (kit: Kit) => {
  const nested =
    await Bun.$`bwrap --unshare-user --unshare-net --die-with-parent --ro-bind / / --dev /dev --proc /proc true`
      .quiet()
      .nothrow();
  if (nested.exitCode !== 0) {
    kit.check(
      "0: a workspace boundary can start here (run this spec on the host, not inside a workspace)",
      false,
      nested.stderr.toString().trim()
    );
    return;
  }
  const { fleet, home, h } = await standUp(kit);
  const item = () =>
    fleet.query<{ state: string; wait_until: number | null }>(
      "SELECT state, wait_until FROM work_items WHERE id = ?",
      h.workItemId
    )[0];
  const waiting = await until(
    "H's heartbeat started and its item waiting",
    item,
    (row) => row?.state === "running" && row.wait_until !== null,
    300_000
  ).catch(item);
  const first = fleet.seen.find((one) => STARTED.test(one.all));
  const loopPid = STARTED.exec(first?.all ?? "")?.[1];
  const firstNs = first?.all.match(PID_NS)?.at(-1);
  kit.check(
    "H started its heartbeat loop and its item waits, live",
    waiting?.state === "running" &&
      waiting.wait_until !== null &&
      Boolean(loopPid && firstNs),
    `item ${waiting?.state ?? "missing"}; loop pid ${loopPid ?? "unread"}; pid namespace ${firstNs ?? "unread"}`
  );
  const clone =
    fleet.query<{ path: string }>(
      "SELECT path FROM workspaces WHERE id = ?",
      h.workspaceId
    )[0]?.path ?? "";
  const had = await boundariesOf(fleet, h.workspaceId);

  await olderFormRestart(fleet, home, h.workspaceId);
  const beatsBefore = await beats(clone);

  const from = fleet.seen.length;
  await fleet.send(
    h.instanceId,
    "PROBE-BEAT-CHECK-H: is the heartbeat still going?"
  );
  const second = await seenWith(fleet, BEATS, from);
  const secondNs = second?.all.match(PID_NS)?.at(-1);
  const alive = ALIVE.exec(second?.all ?? "")?.[1];
  const counted = Number(BEATS.exec(second?.all ?? "")?.[1] ?? 0);
  await Bun.sleep(6000);
  const beatsAfter = await beats(clone);

  kit.check(
    "1: the heartbeat file grows across the turn boundary, and still grows after H's second turn",
    beatsBefore > 0 && counted > beatsBefore && beatsAfter > counted,
    `${beatsBefore} lines after the restart; ${counted} as H's second turn read it; ${beatsAfter} six seconds on`
  );
  kit.check(
    "2: in H's second turn the loop's pid is alive and is the loop, in the pid namespace its first turn ran in",
    Boolean(second) &&
      alive !== undefined &&
      alive === loopPid &&
      secondNs === firstNs,
    `turn ran: ${Boolean(second)}; alive: ${alive ?? "no"} (started as ${loopPid ?? "unread"}); pid namespace ${secondNs ?? "unread"}, first turn's ${firstNs ?? "unread"}`
  );
  await keptAsItWas(kit, fleet, h.workspaceId, had);
};

/** 3: workspace `id`'s boundary is the one it `had`, kept while its work runs, said in the agent's log. */
const keptAsItWas = async (
  kit: Kit,
  fleet: Fleet,
  id: string,
  had: readonly string[]
): Promise<void> => {
  const now = await boundariesOf(fleet, id);
  const kept = (await fleet.logs("agent"))
    .split("\n")
    .find((line) => line.includes(id) && line.includes(KEPT_LINE));
  kit.check(
    "3: H's boundary, of an older form since the restart, is kept as it is while its work runs, said in the agent's log, never handed over",
    had.length === 1 &&
      JSON.stringify(now) === JSON.stringify(had) &&
      Boolean(kept),
    `before: ${had.join(",") || "none"}; now: ${now.join(",") || "none"}; ${kept ?? "no kept line"}`
  );
};

const spec: Spec = {
  name: "boundary-handover",
  run,
};

export default spec;

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
 * 3. H's live boundary is the one it had: kept as it is while its work runs,
 *    said in the agent's log, never handed over. An older generation beside
 *    it closes only as `closeIdle` closes one, with nothing running in it.
 * 4. The policy then narrows (the project's folder on the hub, which it read,
 *    is gone) and a message gives H a third turn: its boundary is replaced
 *    at once and the loop stopped with it (agent boundary.ts
 *    `replaceNarrowed`); H's command shows the line naming the loop by its
 *    command and pid, saying it can be started again; the heartbeat stops;
 *    the new boundary started without the folder.
 *
 *   bun scripts/probe-kit/run.ts boundary-handover
 */
import { mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isBoundaryOf } from "../../../packages/agent/src/proc-id";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const WAIT = "mcp__cawco__wait_item";
const TAG = /PROBE-BEAT-(?:CHECK-|NARROW-)?H:/;
const PID_NS = /pid:\[\d+\]/g;
const STARTED = /BEAT-STARTED-(\d+):/;
const ALIVE = /BEAT-ALIVE-(\d+):/;
const BEATS = /BEAT-COUNT-(\d+):/;
const ACCOUNT_ADDED = "acct-probe-older-form";
const START_LINE = "[workspace] boundary hooks written for ";
const KEPT_LINE = "is kept as it is while its work runs";
/** The boundary the kept line names (boundary.ts `replaceOlder`). */
const KEPT_PID = /its boundary (\d+) \(form [^)]*\) is kept as it is/;
/** How `closeIdle` says it closed an older generation with nothing in it, or found it gone. */
const OLDER_CLOSED =
  /\) (has nothing left running in it and is closed|is gone)$/;
/** The line a session's command shows once its access narrowed (agent boundary.ts `narrowedLine`). */
const NARROWED_LINE = /^cawco: this workspace's access was narrowed /;
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

const steps: {
  checked?: boolean;
  narrowed?: boolean;
  rested: number;
  started?: boolean;
} = { rested: 0 };

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
  if (!steps.started) {
    steps.started = true;
    return tool("Bash", { command: START, description: "Start the heartbeat" });
  }
  if (request.all.includes("PROBE-BEAT-CHECK-H:") && !steps.checked) {
    steps.checked = true;
    return tool("Bash", { command: CHECK, description: "Check the heartbeat" });
  }
  if (request.all.includes("PROBE-BEAT-NARROW-H:") && !steps.narrowed) {
    steps.narrowed = true;
    return tool("Bash", { command: CHECK, description: "Check it again" });
  }
  const rests =
    1 + Number(Boolean(steps.checked)) + Number(Boolean(steps.narrowed));
  if (steps.rested < rests) {
    const reply = offered(request, WAIT, REST);
    if (reply.tool?.name === WAIT) {
      steps.rested = rests;
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

/** Project `id`'s folder on the fleet's hub: `projects/` beside its database (core paths.ts `hubProjectsDir`). */
const projectFolderOf = (fleet: Fleet, id: string): string =>
  join(fleet.sandbox, "hub", "projects", id);

/** The policy workspace `id`'s current boundary started with, as its generation keeps it (agent boundary.ts `grantedOf`); none on record. */
const grantedNow = async (
  home: string,
  id: string
): Promise<{ allowRead?: string[] } | undefined> => {
  const state = join(home, ".cawco", "workspaces", id);
  const held = JSON.parse(
    await readFile(join(state, "boundary.json"), "utf8").catch(() => "{}")
  ) as { gen?: string };
  if (!held.gen) {
    return;
  }
  return JSON.parse(
    await readFile(
      join(state, "boundaries", held.gen, "policy.json"),
      "utf8"
    ).catch(() => "null")
  ) as { allowRead?: string[] } | undefined;
};

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
  // The project's folder on the hub, which its workspaces read (core
  // workspace-policy.ts `projectFolder`): the access round 4 takes away.
  await mkdir(projectFolderOf(fleet, project.id), { recursive: true });
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
  return { fleet, home, h, project: project.id };
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
  const { fleet, home, h, project } = await standUp(kit);
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
  await narrowedStops(kit, fleet, home, {
    clone,
    id: h.workspaceId,
    instanceId: h.instanceId,
    loopPid,
    project,
  });
};

/**
 * 4: the workspace's policy narrows while H's loop runs (its project's
 * folder on the hub is gone, so the policy no longer reads it), and a message
 * gives H a third turn: its boundary is replaced at once, the loop stopped
 * with it, the heartbeat stops, H's command shows the line naming the loop
 * by its command and pid and saying it can be started again, and the new
 * boundary was started without the folder.
 */
const narrowedStops = async (
  kit: Kit,
  fleet: Fleet,
  home: string,
  h: {
    clone: string;
    id: string;
    instanceId: string;
    loopPid: string | undefined;
    project: string;
  }
): Promise<void> => {
  const folder = await realpath(projectFolderOf(fleet, h.project));
  const policy = JSON.parse(
    await readFile(
      join(home, ".cawco", "workspaces", h.id, "policy.json"),
      "utf8"
    ).catch(() => "{}")
  ) as { allowRead?: string[] };
  kit.check(
    "4: before the narrowing, H's policy reads its project's folder",
    policy.allowRead?.includes(folder) === true,
    `${folder} in allowRead: ${policy.allowRead?.includes(folder) ?? "no policy"}`
  );
  const before = await boundariesOf(fleet, h.id);
  await rename(folder, `${folder}.aside`);
  const from = fleet.seen.length;
  await fleet.send(
    h.instanceId,
    "PROBE-BEAT-NARROW-H: the project folder is gone; check the heartbeat."
  );
  const third = await until(
    "H's third turn's check",
    () => fleet.seen.slice(from).find((one) => BEATS.test(one.last)),
    Boolean,
    240_000
  ).catch(() => undefined);
  const said = third?.last ?? "";
  const line = said.split("\n").find((one) => NARROWED_LINE.test(one)) ?? "";
  const beatsThen = await beats(h.clone);
  await Bun.sleep(6000);
  const beatsLater = await beats(h.clone);
  const after = await boundariesOf(fleet, h.id);
  const granted = await grantedNow(home, h.id);
  await rename(`${folder}.aside`, folder);
  kit.check(
    "4: H's third turn shows the line: its access narrowed, the loop stopped by its command and pid, to be started again",
    line.includes("date +%s >> beat") &&
      line.includes(`(pid ${h.loopPid})`) &&
      line.includes(folder) &&
      line.includes("Start it again"),
    line || `no line in: ${said.slice(0, 400)}`
  );
  kit.check(
    "4: the loop is stopped: not alive in H's third turn, and the heartbeat no longer grows",
    Boolean(third) && !ALIVE.test(said) && beatsLater === beatsThen,
    `alive: ${ALIVE.exec(said)?.[1] ?? "no"}; ${beatsThen} lines, then ${beatsLater} six seconds on`
  );
  kit.check(
    "4: H's boundary was replaced at once, the new one started without the project's folder",
    after.length === 1 &&
      !before.includes(after[0] as string) &&
      granted?.allowRead !== undefined &&
      !granted.allowRead.includes(folder),
    `before: ${before.join(",") || "none"}; after: ${after.join(",") || "none"}; the new boundary's policy ${granted?.allowRead ? `reads the folder: ${granted.allowRead.includes(folder)}` : "is not on record"}`
  );
};

/**
 * 3: workspace `id`'s live boundary, the one the agent's log says it keeps
 * while its work runs, is one it `had` before the restart and still runs.
 * An older generation still beside it before the restart (one handed over
 * before the loop started; host runs of 2026-10-19 had one on main and on
 * this build alike) may close meanwhile, but only as `closeIdle` closes one:
 * nothing left running in it, or gone already, said in the log. The agent's
 * lines for the workspace are noted, so a run says which handover made it.
 */
const keptAsItWas = async (
  kit: Kit,
  fleet: Fleet,
  id: string,
  had: readonly string[]
): Promise<void> => {
  const now = await boundariesOf(fleet, id);
  const lines = (await fleet.logs("agent"))
    .split("\n")
    .filter((line) => line.includes(id));
  kit.note(`3: the agent's lines for H's workspace:\n${lines.join("\n")}`);
  const kept = lines.find((line) => line.includes(KEPT_LINE));
  const live = KEPT_PID.exec(kept ?? "")?.[1];
  const pidOf = (entry: string) => entry.slice(entry.lastIndexOf("@") + 1);
  const ownedLive = (list: readonly string[]) =>
    list.some((entry) => pidOf(entry) === live);
  kit.check(
    "3: H's live boundary, of an older form since the restart, is kept as it is while its work runs, said in the agent's log, never handed over",
    live !== undefined && ownedLive(had) && ownedLive(now) && now.length === 1,
    `before: ${had.join(",") || "none"}; now: ${now.join(",") || "none"}; ${kept ?? "no kept line"}`
  );
  const closed = had.filter((entry) => !now.includes(entry));
  const unsaid = closed.filter(
    (entry) =>
      !lines.some(
        (line) =>
          line.includes(`its older boundary ${pidOf(entry)} (form `) &&
          OLDER_CLOSED.test(line)
      )
  );
  kit.check(
    "3: any other boundary H had before the restart closed only as an older generation with nothing left running in it, said in the agent's log",
    unsaid.length === 0 && !closed.some((entry) => pidOf(entry) === live),
    `closed: ${closed.join(",") || "none"}; closed unsaid: ${unsaid.join(",") || "none"}`
  );
};

const spec: Spec = {
  name: "boundary-handover",
  run,
};

export default spec;

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
 * 0. First, H runs a command in the foreground that listens on nothing and
 *    runs {@link FG_SECONDS} s (`sh -c 'sleep …; exit 7'`). While it runs,
 *    its boundary's record of what it started with
 *    (`boundaries/<gen>/policy.json`) is removed, as a boundary a build
 *    before the record started has none, and the agent restarts on an older
 *    form, as the upgrade does. On 2026-10-19 the install of 4343 over 4303
 *    stopped 20 such boundaries "as its access narrowed … (what its boundary
 *    started with is not on record)", leaf 3b8e7144's probe run kf-2 among
 *    them, cut off with exit 137. The command finishes with its own exit
 *    code, 7, in the boundary it started in (`FG-STATUS-7`, not the
 *    executor's "boundary stopped" line); the agent's log says it cannot
 *    compare the grant and keeps the boundary while its work runs
 *    (agent boundary.ts `compareGrant`), and no line says "not on record".
 *
 * H then starts `setsid nohup sh -c 'while :; do date +%s >> beat; sleep 2; done'`
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
 * 4. The policy then narrows with no word to H (the project's folder on the
 *    hub, which it read, is renamed aside by hand, which no event says):
 *    within 10 s the boundary is replaced by the agent's look at the
 *    boundaries in use (agent boundary.ts `recheckNarrowed`,
 *    `replaceNarrowed`), the loop stopped with it, the heartbeat stopped,
 *    the new boundary started without the folder.
 * 5. A message gives H a third turn: its command shows the line naming the
 *    loop by its command and pid, saying it can be started again.
 * 6. The hub's own move of a project's folder is an event: with the agent's
 *    look held off, H's loop started again in a boundary that reads the
 *    folder, and H and its parent asleep, the project is deleted; within 10 s
 *    the fleet sync that follows replaces H's boundary, its loop stopped and
 *    the line queued for H's next command.
 *
 *   bun scripts/probe-kit/run.ts boundary-handover
 */
import { existsSync } from "node:fs";
import {
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { isBoundaryOf } from "../../../packages/agent/src/proc-id";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const WAIT = "mcp__cawco__wait_item";
/** How long a round 0 foreground command runs: past an agent restart and its start-up pass. */
const FG_SECONDS = 90;
/** Round 0's command: a marker in the clone as it starts, then a foreground wait on no port, its status said by the shell around it. */
const FOREGROUND = [
  "touch fg.started",
  `sh -c 'sleep ${FG_SECONDS}; exit 7'`,
  `echo "FG-""STATUS-$?"`,
].join("; ");
const FG_STATUS = /FG-STATUS-(\d+)/;
/** The account round 0's restart adds, apart from round 1's, so each restart is a form change of its own. */
const FG_ACCOUNT = "acct-probe-older-form-fg";
/** The executor's line for a command cut off by its boundary's end (agent boundary.ts `execScript`). */
const CUT_OFF = "boundary stopped while this command ran";
/** How the agent says it keeps a boundary whose grant it cannot compare (boundary.ts `ensure`, `compareGrant`). */
const UNKNOWN_GRANT_LINE = "grant cannot be compared with this build's policy";
/** How main's agent said it stopped one with no record (boundary.ts `narrowing`, before `compareGrant`). */
const NOT_ON_RECORD = "not on record";
const TAG = /PROBE-BEAT-(?:CHECK-|NARROW-|AGAIN-)?H:/;
/** The loop's beat, `sleep 2`: a read of the heartbeat that must see it grow waits more than one. */
const BEAT_GAP_MS = 5000;
const PID_NS = /pid:\[\d+\]/g;
const STARTED = /BEAT-STARTED-(\d+):/;
const ALIVE = /BEAT-ALIVE-(\d+):/;
const BEATS = /BEAT-COUNT-(\d+):/;
const ACCOUNT_ADDED = "acct-probe-older-form";
/** How the agent says a fleet sync found a narrowed access (boundary.ts `recheckNow`). */
const SYNCED = "its access narrowed (the fleet's config was synced)";
const START_LINE = "[workspace] boundary hooks written for ";
const KEPT_LINE = "is kept as it is while its work";
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
  foreground?: boolean;
  narrowed?: boolean;
  restarted?: boolean;
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
  if (!steps.foreground) {
    steps.foreground = true;
    return tool("Bash", {
      command: FOREGROUND,
      description: "Run the long command",
      timeout: 300_000,
    });
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
  // Told to, it starts its stopped loop again, as the line says it can.
  if (request.all.includes("PROBE-BEAT-AGAIN-H:") && !steps.restarted) {
    steps.restarted = true;
    return tool("Bash", { command: START, description: "Start it again" });
  }
  const rests =
    1 +
    Number(Boolean(steps.checked)) +
    Number(Boolean(steps.narrowed)) +
    Number(Boolean(steps.restarted));
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
  return { fleet, home, h, parent, project: project.id };
};

/** Gives workspace `id` an older form (`account` added to its policy), then restarts the agent, as an update does. */
const olderFormRestart = async (
  fleet: Fleet,
  home: string,
  id: string,
  account = ACCOUNT_ADDED
): Promise<void> => {
  const accounts = join(home, ".cawco", "workspaces", id, "accounts.json");
  const listed = JSON.parse(
    await readFile(accounts, "utf8").catch(() => "[]")
  ) as string[];
  await writeFile(accounts, `${JSON.stringify([...listed, account])}\n`);
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
  const { fleet, home, h, parent, project } = await standUp(kit);
  await foregroundAcross(kit, fleet, home, h.workspaceId);
  const item = () =>
    fleet.query<{ state: string; wait_until: number | null }>(
      "SELECT state, wait_until FROM work_items WHERE id = ?",
      h.workItemId
    )[0];
  const waiting = await until(
    "H's heartbeat started and its item waiting",
    item,
    (row) =>
      row?.state === "running" &&
      row.wait_until !== null &&
      fleet.seen.some((one) => STARTED.test(one.all)),
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
  // More than a beat before H's turn reads it: a turn that comes back
  // within the loop's own 2 s would read the same count from a live loop
  // (3cf54d3f1's run: 1, then 1, then 5 six seconds on).
  await Bun.sleep(BEAT_GAP_MS);

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
  kit.note(
    `1: the heartbeat's beats, each its second: ${(await readFile(join(clone, "beat"), "utf8").catch(() => "")).trim().split("\n").join(" ")}`
  );

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
  await deletedStops(kit, fleet, home, {
    clone,
    id: h.workspaceId,
    instanceId: h.instanceId,
    parent,
    project,
  });
};

/** H's boundary's generation dir, where its record of what it started with lies (agent boundary.ts `grantedOf`). */
const generationOf = async (home: string, id: string): Promise<string> => {
  const state = join(home, ".cawco", "workspaces", id);
  const held = JSON.parse(
    await readFile(join(state, "boundary.json"), "utf8").catch(() => "{}")
  ) as { gen?: string };
  return join(state, "boundaries", held.gen ?? "unread");
};

/**
 * 0: H's foreground command, listening on nothing, runs across an agent
 * restart that gives its boundary an older form, its record of what it
 * started with (`policy.json` in its generation dir) removed first, as a
 * boundary a build before the record started has none; it finishes with its
 * own exit code ({@link FOREGROUND}).
 */
const foregroundAcross = async (
  kit: Kit,
  fleet: Fleet,
  home: string,
  id: string
): Promise<void> => {
  const clone = await until(
    "H's clone",
    () =>
      fleet.query<{ path: string }>(
        "SELECT path FROM workspaces WHERE id = ?",
        id
      )[0]?.path,
    Boolean,
    120_000
  ).catch(() => undefined);
  const started = await until(
    "H's foreground command started",
    () => (clone ? existsSync(join(clone, "fg.started")) : false),
    Boolean,
    240_000
  ).catch(() => false);
  const file = join(await generationOf(home, id), "policy.json");
  const record = existsSync(file) ? `removed (${file})` : `not there (${file})`;
  await rm(file, { force: true });
  const restartAt = Date.now();
  if (started) {
    await olderFormRestart(fleet, home, id, FG_ACCOUNT);
  }
  const restarted = Date.now() - restartAt;
  const result = await until(
    "H's foreground command's result",
    () =>
      fleet.seen.find(
        (one) => FG_STATUS.test(one.last) || one.last.includes(CUT_OFF)
      ),
    Boolean,
    (FG_SECONDS + 120) * 1000
  ).catch(() => undefined);
  const said = result?.last ?? "";
  const lines = (await fleet.logs("agent"))
    .split("\n")
    .filter((line) => line.includes(id));
  kit.note(`0: the agent's lines for H's workspace:\n${lines.join("\n")}`);
  kit.check(
    `0: H's foreground command, listening on nothing, ran across an agent restart that gave its boundary an older form with its record of what it started with ${record}, ${Math.round(restarted / 1000)} s into its ${FG_SECONDS} s, and finished with its own exit code`,
    started &&
      restarted < FG_SECONDS * 1000 &&
      FG_STATUS.exec(said)?.[1] === "7" &&
      !said.includes(CUT_OFF),
    `started: ${started}; ${result ? `its result: ${said.slice(0, 400)}` : "no result"}; ${lines.find((line) => line.includes(NOT_ON_RECORD)) ?? "no line says not on record"}`
  );
  kit.check(
    "0: the agent's log says it cannot compare the boundary's grant and keeps it while its work runs, and stops nothing as not on record",
    lines.some((line) => line.includes(UNKNOWN_GRANT_LINE)) &&
      !lines.some((line) => line.includes(NOT_ON_RECORD)),
    lines.find(
      (line) =>
        line.includes(UNKNOWN_GRANT_LINE) || line.includes(NOT_ON_RECORD)
    ) ?? "no such line"
  );
};

/** How soon after a narrowing no event says the look replaces a boundary in use: its {@link NARROW_LOOK_MS}, a stop and a start. */
const LOOK_BOUND_MS = 10_000;

/**
 * 4 and 5: the workspace's policy narrows while H's loop runs, with no word
 * to H: its project's folder on the hub is renamed aside, which no event
 * says (a rename by hand; the hub's own moves sync every machine), so the
 * policy no longer reads it. 4: within {@link LOOK_BOUND_MS} of the rename
 * its boundary is replaced, the loop stopped with it and the heartbeat
 * stopped, and the new boundary started without the folder. 5: a message
 * gives H a third turn, whose command shows the line naming the loop by its
 * command and pid and saying it can be started again.
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
  const had = await grantedNow(home, h.id);
  kit.check(
    "4: before the narrowing, H's boundary was started reading its project's folder",
    had?.allowRead?.includes(folder) === true,
    `${folder} in its allowRead: ${had?.allowRead ? had.allowRead.includes(folder) : "not on record"}`
  );
  const before = await boundariesOf(fleet, h.id);
  const renamed = Date.now();
  await rename(folder, `${folder}.aside`);
  const after = await until(
    "H's boundary replaced",
    () => boundariesOf(fleet, h.id),
    (now) => now.length === 1 && !before.includes(now[0] as string),
    30_000
  ).catch(() => boundariesOf(fleet, h.id));
  const took = Date.now() - renamed;
  const beatsThen = await beats(h.clone);
  await Bun.sleep(6000);
  const beatsLater = await beats(h.clone);
  const granted = await grantedNow(home, h.id);
  kit.check(
    `4: with no word to H, its boundary is replaced within ${LOOK_BOUND_MS / 1000} s of the rename, the new one started without the project's folder`,
    after.length === 1 &&
      !before.includes(after[0] as string) &&
      took <= LOOK_BOUND_MS &&
      granted?.allowRead !== undefined &&
      !granted.allowRead.includes(folder),
    `before: ${before.join(",") || "none"}; after: ${after.join(",") || "none"}, ${took} ms after the rename; the new boundary's policy ${granted?.allowRead ? `reads the folder: ${granted.allowRead.includes(folder)}` : "is not on record"}`
  );
  kit.check(
    "4: the loop is stopped with it: the heartbeat no longer grows",
    beatsLater === beatsThen,
    `${beatsThen} lines, then ${beatsLater} six seconds on`
  );

  // The folder back before H's turn. Its boundary, started without it, has
  // nothing running now, so the next ensure (round 6's agent start, or H's
  // wake) hands it over to one that reads the folder again.
  await rename(`${folder}.aside`, folder);
  const from = fleet.seen.length;
  await fleet.send(h.instanceId, "PROBE-BEAT-NARROW-H: check the heartbeat.");
  const third = await until(
    "H's third turn's check",
    () => fleet.seen.slice(from).find((one) => BEATS.test(one.last)),
    Boolean,
    240_000
  ).catch(() => undefined);
  const said = third?.last ?? "";
  const line = said.split("\n").find((one) => NARROWED_LINE.test(one)) ?? "";
  kit.check(
    "5: H's next turn shows the line: its access narrowed, the loop stopped, named by its command and pid, to be started again",
    line.includes("date +%s >> beat") &&
      line.includes(`(pid ${h.loopPid})`) &&
      line.includes(folder) &&
      line.includes("Start it again"),
    line || `no line in: ${said.slice(0, 400)}`
  );
  kit.check(
    "5: the loop is not alive in H's next turn",
    Boolean(third) && !ALIVE.test(said),
    `turn ran: ${Boolean(third)}; alive: ${ALIVE.exec(said)?.[1] ?? "no"}`
  );
};

/** Asks the dashboard's `sleep` of session `id` until it reads sleeping (again every 15 s, as a machine refuses a session not at rest); answers its status. */
const asleep = (fleet: Fleet, id: string): Promise<string | undefined> => {
  let asked = 0;
  return until(
    `${id.slice(0, 8)} asleep`,
    async () => {
      if (
        fleet.instance(id)?.status !== "sleeping" &&
        Date.now() - asked > 15_000
      ) {
        asked = Date.now();
        await fleet.control(id, "sleep");
      }
      return fleet.instance(id)?.status;
    },
    (status) => status === "sleeping",
    120_000
  ).catch(() => fleet.instance(id)?.status);
};

/**
 * 6: the hub's own move of a project's folder is an event. The agent starts
 * again with its look held off (`CAWCO_NARROW_LOOK_MS`), so only an event
 * can act; H's idle boundary, of an older form since the folder came back,
 * is handed over to one that reads it, and H starts its loop again there.
 * With H and its parent asleep (a project is deleted only once nothing of it
 * runs), the project is deleted: the hub trashes its folder and syncs every
 * machine's fleet config (server.ts `projectFolderMoved`). Within
 * {@link LOOK_BOUND_MS} of the delete H's boundary is replaced, said as the
 * sync's in the agent's log, its loop stopped, and the line naming it queued
 * for H's next command.
 */
const deletedStops = async (
  kit: Kit,
  fleet: Fleet,
  home: string,
  h: {
    clone: string;
    id: string;
    instanceId: string;
    parent: string;
    project: string;
  }
): Promise<void> => {
  const folder = await realpath(projectFolderOf(fleet, h.project));
  const before = (await fleet.logs("agent")).split(START_LINE).length;
  await fleet.stop("agent");
  fleet.launch("agent", [], { CAWCO_NARROW_LOOK_MS: "3600000" });
  await fleet.agentUp();
  await until(
    "the restarted agent's start-up pass",
    () => fleet.logs("agent"),
    (logged) => logged.split(START_LINE).length > before,
    120_000
  );
  const from = fleet.seen.length;
  await fleet.send(h.instanceId, "PROBE-BEAT-AGAIN-H: start it again.");
  const again = await until(
    "H started its loop again",
    () => fleet.seen.slice(from).find((one) => STARTED.test(one.last)),
    Boolean,
    240_000
  ).catch(() => undefined);
  const loopPid = STARTED.exec(again?.last ?? "")?.[1];
  const had = await grantedNow(home, h.id);
  kit.check(
    "6: before the delete, H's boundary was started reading its project's folder, and its loop runs there again",
    had?.allowRead?.includes(folder) === true && loopPid !== undefined,
    `${folder} in its allowRead: ${had?.allowRead ? had.allowRead.includes(folder) : "not on record"}; loop pid ${loopPid ?? "unread"}`
  );
  const sleeping = [
    await asleep(fleet, h.instanceId),
    await asleep(fleet, h.parent),
  ];
  const running = await boundariesOf(fleet, h.id);
  const asked = Date.now();
  const deleted = await fetch(`${fleet.base}/api/projects/${h.project}`, {
    method: "DELETE",
  });
  const answer = `${deleted.status} ${await deleted.text()}`;
  const after = await until(
    "H's boundary replaced",
    () => boundariesOf(fleet, h.id),
    (now) => now.length === 1 && !running.includes(now[0] as string),
    30_000
  ).catch(() => boundariesOf(fleet, h.id));
  const took = Date.now() - asked;
  const beatsThen = await beats(h.clone);
  await Bun.sleep(6000);
  const beatsLater = await beats(h.clone);
  const said = (await fleet.logs("agent"))
    .split("\n")
    .find((line) => line.includes(h.id) && line.includes(SYNCED));
  const notice = await readFile(
    join(home, ".cawco", "workspaces", h.id, "notice"),
    "utf8"
  ).catch(() => "");
  kit.check(
    `6: the project's delete trashes its folder, and within ${LOOK_BOUND_MS / 1000} s H's boundary is replaced on the fleet sync that follows, its look held off`,
    deleted.ok &&
      !existsSync(folder) &&
      after.length === 1 &&
      !running.includes(after[0] as string) &&
      took <= LOOK_BOUND_MS &&
      Boolean(said),
    `sessions ${sleeping.join(", ")}; delete: ${answer}; folder there: ${existsSync(folder)}; before: ${running.join(",") || "none"}; after: ${after.join(",") || "none"}, ${took} ms after the delete; ${said ?? "no line names the sync"}`
  );
  kit.check(
    "6: its loop is stopped with it, and the line naming it is queued for H's next command",
    beatsLater === beatsThen &&
      NARROWED_LINE.test(notice) &&
      notice.includes(`(pid ${loopPid})`) &&
      notice.includes("Start it again"),
    `${beatsThen} lines, then ${beatsLater} six seconds on; queued: ${notice.trim() || "nothing"}`
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
  // The last: round 0's restart said one too, for the boundary H had then.
  const kept = lines.findLast((line) => line.includes(KEPT_LINE));
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

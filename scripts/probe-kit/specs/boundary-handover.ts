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
 * 0. First, F, a delegate of its own with a boundary of its own, runs a
 *    command in the foreground that listens on nothing and runs
 *    {@link FG_SECONDS} s (`sh -c 'sleep …; exit 7'`). While it runs, its
 *    boundary's record of what it started with (`boundaries/<gen>/policy.json`)
 *    is removed, as a boundary a build before the record started has none,
 *    and the agent restarts on an older form, as the upgrade does. On
 *    2026-10-19 the install of 4343 over 4303 stopped 20 such boundaries "as
 *    its access narrowed … (what its boundary started with is not on
 *    record)", leaf 3b8e7144's probe run kf-2 among them, cut off with exit
 *    137. The command finishes with its own exit code, 7, in the boundary it
 *    started in (`FG-STATUS-7`, not the executor's "boundary stopped" line);
 *    the agent records that it cannot compare the grant and keeps the
 *    boundary while its command runs (agent boundary.ts `compareGrant`,
 *    `BoundaryDecision`), and stops nothing as narrowed. Once the command
 *    has ended, F resting with nothing in its boundary, the boundary is
 *    handed over, as the agent records, to one that starts with this
 *    build's record. F is not H: a boundary with no record is kept for
 *    as long as anything runs in it, and H's loop never ends, so legs 4 to 6,
 *    which narrow a boundary with a record, run on H's own.
 *
 * H, delegated next, starts `setsid nohup sh -c 'while :; do date +%s >> beat; sleep 2; done'`
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
 *    as the agent records, never handed over. An older generation beside
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
 *    folder, and H, F and their parent asleep, the project is deleted; within 10 s
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
import type { BoundaryDecision } from "../../../packages/agent/src/boundary";
import { isBoundaryOf } from "../../../packages/agent/src/proc-id";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { decisionsOf, startedSince } from "../agent-records";
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
/** F's brief: round 0's delegate, apart from H. */
const FG_TAG = "PROBE-FG-F:";
/** The account round 0's restart adds to F's policy: a form change of F's boundary alone. */
const FG_ACCOUNT = "acct-probe-older-form-fg";
/** The executor's line for a command cut off by its boundary's end (agent boundary.ts `execScript`). */
const CUT_OFF = "boundary stopped while this command ran";
/** How long after F's command ends its boundary may take to be handed over: the agent's look each 5 s (boundary.ts `STALE_LOOK_MS`), a start, and slack. */
const HANDOVER_BOUND_MS = 30_000;
const TAG = /PROBE-BEAT-(?:CHECK-|NARROW-|AGAIN-)?H:/;
/** The loop's beat, `sleep 2`: a read of the heartbeat that must see it grow waits more than one. */
const BEAT_GAP_MS = 5000;
const PID_NS = /pid:\[\d+\]/g;
const STARTED = /BEAT-STARTED-(\d+):/;
const ALIVE = /BEAT-ALIVE-(\d+):/;
const BEATS = /BEAT-COUNT-(\d+):/;
const ACCOUNT_ADDED = "acct-probe-older-form";
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

const fgSteps: { ran?: boolean; rested?: boolean } = {};

/** F: runs its foreground command, then rests, nothing left in its boundary. */
const respondF = (request: Seen): Reply => {
  if (!fgSteps.ran) {
    fgSteps.ran = true;
    return tool("Bash", {
      command: FOREGROUND,
      description: "Run the long command",
      timeout: 300_000,
    });
  }
  if (!fgSteps.rested) {
    const reply = offered(request, WAIT, {
      minutes: 60,
      reason: "its parent's word on the long command",
    });
    if (reply.tool?.name === WAIT) {
      fgSteps.rested = true;
    }
    return reply;
  }
  return text("ok");
};

/** F as {@link respondF}; H: starts the loop, rests; asked to check, checks, rests again. */
const respond = (request: Seen): Reply => {
  if (request.tools && request.all.includes(FG_TAG)) {
    return respondF(request);
  }
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

/** Workspace `id`'s state dir on the agent's machine. */
const stateOf = (home: string, id: string): string =>
  join(home, ".cawco", "workspaces", id);

/** Workspace `id`'s current boundary as the agent records it (agent boundary.ts `readHeld`): its generation and pid. */
const heldOf = async (
  home: string,
  id: string
): Promise<{ gen?: string; pid?: number }> =>
  JSON.parse(
    await readFile(join(stateOf(home, id), "boundary.json"), "utf8").catch(
      () => "{}"
    )
  ) as { gen?: string; pid?: number };

/** A decision, or several, in a check's words. */
const decisionSaid = (
  decision: BoundaryDecision | readonly BoundaryDecision[] | undefined
): string =>
  decision && !(Array.isArray(decision) && decision.length === 0)
    ? JSON.stringify(decision)
    : "no decision recorded";

/** The agent's stops of workspace `id`'s boundaries as their access narrowed (agent boundary.ts `replaceNarrowed`), oldest first. */
const stopsOf = async (home: string, id: string): Promise<BoundaryDecision[]> =>
  (await decisionsOf(home, id)).filter(
    (one) => one.decision === "narrowed-stopped"
  );

/** The policy workspace `id`'s current boundary started with, as its generation keeps it (agent boundary.ts `grantedOf`); none on record. */
const grantedNow = async (
  home: string,
  id: string
): Promise<{ allowRead?: string[] } | undefined> => {
  const { gen } = await heldOf(home, id);
  if (!gen) {
    return;
  }
  return JSON.parse(
    await readFile(
      join(stateOf(home, id), "boundaries", gen, "policy.json"),
      "utf8"
    ).catch(() => "null")
  ) as { allowRead?: string[] } | undefined;
};

/** The fleet up, a project and its parent session; each delegate is delegated by `delegate`. */
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
  /** A delegate of the parent's, in a workspace of its own. */
  const delegate = (title: string, prompt: string) =>
    fleet.api<{
      instanceId: string;
      workItemId: string;
      workspaceId: string;
    }>("/api/work-items", {
      parentInstanceId: parent,
      title,
      prompt,
      harness: "claude",
      model: "claude-haiku-4-5",
      cwd: src,
    });
  return { delegate, fleet, home, parent, project: project.id };
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
  const before = Date.now();
  await fleet.stop("agent");
  fleet.launch("agent");
  await fleet.agentUp();
  await startedSince(fleet.env, before);
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
  const { delegate, fleet, home, parent, project } = await standUp(kit);
  const f = await delegate(
    "Long command F",
    `${FG_TAG} run the long command, then wait.`
  );
  await foregroundAcross(kit, fleet, home, f.workspaceId);
  // H's boundary is its own and keeps its record throughout: legs 4 to 6
  // narrow a boundary whose grant can be compared.
  const h = await delegate(
    "Beat H",
    "PROBE-BEAT-H: start the heartbeat, then wait."
  );
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
  await keptAsItWas(kit, fleet, home, h.workspaceId, had);
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
    others: [f.instanceId, parent],
    project,
  });
};

/**
 * 0: F's foreground command, listening on nothing, runs across an agent
 * restart that gives its boundary an older form, its record of what it
 * started with (`policy.json` in its generation dir) removed first, as a
 * boundary a build before the record started has none; it finishes with its
 * own exit code ({@link FOREGROUND}), nothing is stopped as narrowed, and
 * once it has ended, F resting, the boundary is handed over to one that
 * starts with this build's record.
 */
const foregroundAcross = async (
  kit: Kit,
  fleet: Fleet,
  home: string,
  id: string
): Promise<void> => {
  const clone = await until(
    "F's clone",
    () =>
      fleet.query<{ path: string }>(
        "SELECT path FROM workspaces WHERE id = ?",
        id
      )[0]?.path,
    Boolean,
    120_000
  ).catch(() => undefined);
  const started = await until(
    "F's foreground command started",
    () => (clone ? existsSync(join(clone, "fg.started")) : false),
    Boolean,
    240_000
  ).catch(() => false);
  // The boundary the command runs in: the one the agent's record names as
  // it starts (its gen holds the record removed here).
  const ran = await heldOf(home, id);
  const file = join(
    stateOf(home, id),
    "boundaries",
    ran.gen ?? "unread",
    "policy.json"
  );
  const record = existsSync(file) ? `removed (${file})` : `not there (${file})`;
  await rm(file, { force: true });
  const restartAt = Date.now();
  if (started) {
    await olderFormRestart(fleet, home, id, FG_ACCOUNT);
  }
  const restarted = Date.now() - restartAt;
  const result = await until(
    "F's foreground command's result",
    () =>
      fleet.seen.find(
        (one) => FG_STATUS.test(one.last) || one.last.includes(CUT_OFF)
      ),
    Boolean,
    (FG_SECONDS + 120) * 1000
  ).catch(() => undefined);
  const said = result?.last ?? "";
  const stops = await stopsOf(home, id);
  const stopped = () =>
    stops.length > 0
      ? `stopped as narrowed: ${decisionSaid(stops)}`
      : "nothing stopped as narrowed";
  // What the agent decided of the boundary while the command ran.
  const keptWhile = (await decisionsOf(home, id)).findLast(
    (one) =>
      one.decision === "kept" &&
      one.pid === ran.pid &&
      one.reasons.grant !== null &&
      one.reasons.commands.length > 0
  );
  kit.check(
    `0: F's foreground command, listening on nothing, ran across an agent restart that gave its boundary ${ran.pid ?? "unread"} an older form with its record of what it started with ${record}, ${Math.round(restarted / 1000)} s into its ${FG_SECONDS} s, and finished with its own exit code`,
    started &&
      restarted < FG_SECONDS * 1000 &&
      FG_STATUS.exec(said)?.[1] === "7" &&
      !said.includes(CUT_OFF),
    `started: ${started}; ${result ? `its result: ${said.slice(0, 400)}` : "no result"}; ${stopped()}`
  );
  kit.check(
    "0: the agent records that it cannot compare the boundary's grant and keeps it while its command runs, and stops nothing as narrowed",
    ran.pid !== undefined && keptWhile !== undefined && stops.length === 0,
    `${keptWhile ? decisionSaid(keptWhile) : `no decision keeps boundary ${ran.pid ?? "unread"} for a grant not comparable while a command runs: ${decisionSaid(await decisionsOf(home, id))}`}; ${stopped()}`
  );

  // F rests now, nothing left in its boundary: the agent's look hands it
  // over, as it records, to one that starts with this build's record.
  const ended = Date.now();
  const lookAtF = async () => ({
    decided: (await decisionsOf(home, id)).find(
      (one) =>
        (one.decision === "handed-over" || one.decision === "replaced") &&
        one.pid === ran.pid
    ),
    granted: await grantedNow(home, id),
    now: await heldOf(home, id),
  });
  const handed = await until(
    "F's boundary handed over",
    lookAtF,
    ({ decided, granted, now }) =>
      decided !== undefined &&
      now.pid !== undefined &&
      now.pid !== ran.pid &&
      granted?.allowRead !== undefined,
    HANDOVER_BOUND_MS
  ).catch(lookAtF);
  const took = Date.now() - ended;
  const stopsAfter = await stopsOf(home, id);
  kit.note(
    `0: the agent's decisions of F's workspace: ${decisionSaid(await decisionsOf(home, id))}`
  );
  kit.check(
    `0: once F's command has ended, its boundary is handed over within ${HANDOVER_BOUND_MS / 1000} s to one started with this build's record, as the agent records, and nothing is stopped as narrowed`,
    handed.decided !== undefined &&
      "to" in handed.decided &&
      handed.decided.to?.pid === handed.now.pid &&
      handed.now.pid !== ran.pid &&
      handed.granted?.allowRead !== undefined &&
      stopsAfter.length === 0,
    `ran in ${ran.pid ?? "unread"}; now ${handed.now.pid ?? "unread"}, ${took} ms after the command's result; ${decisionSaid(handed.decided)}; the new boundary's record ${handed.granted?.allowRead ? "is there" : "is not"}; ${stopsAfter.length > 0 ? `stopped as narrowed: ${decisionSaid(stopsAfter)}` : "nothing stopped as narrowed"}`
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
 * With H, F and their parent asleep (a project is deleted only once nothing of it
 * runs), the project is deleted: the hub trashes its folder and syncs every
 * machine's fleet config (server.ts `projectFolderMoved`). Within
 * {@link LOOK_BOUND_MS} of the delete H's boundary is replaced, recorded as
 * the folder's move's stop, its loop stopped, and the line naming it queued
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
    /** The project's other sessions, F and the parent, asleep too before the delete. */
    others: readonly string[];
    project: string;
  }
): Promise<void> => {
  const folder = await realpath(projectFolderOf(fleet, h.project));
  const before = Date.now();
  await fleet.stop("agent");
  fleet.launch("agent", [], { CAWCO_NARROW_LOOK_MS: "3600000" });
  await fleet.agentUp();
  await startedSince(fleet.env, before);
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
  const sleeping: (string | undefined)[] = [];
  for (const session of [h.instanceId, ...h.others]) {
    // biome-ignore lint/performance/noAwaitInLoops: each session is asked to sleep in turn, as the dashboard would
    sleeping.push(await asleep(fleet, session));
  }
  // The loop runs on through the sessions' sleep: what the delete's stop
  // must find in H's boundary, read a beat apart.
  const beatsAsleep = await beats(h.clone);
  await Bun.sleep(BEAT_GAP_MS);
  const beatsBeforeDelete = await beats(h.clone);
  kit.check(
    "6: H's loop runs on with H, F and their parent asleep, before the delete",
    beatsBeforeDelete > beatsAsleep,
    `${beatsAsleep} lines once all slept, then ${beatsBeforeDelete} ${BEAT_GAP_MS / 1000} s on; H's boundaries: ${(await boundariesOf(fleet, h.id)).join(",") || "none"}; its decisions: ${decisionSaid(await decisionsOf(home, h.id))}`
  );
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
  // The stop the hub's move of the folder made, as the agent records it.
  const said = (await stopsOf(home, h.id)).find(
    (one) =>
      one.decision === "narrowed-stopped" &&
      one.cause === "folder-moved" &&
      one.at >= asked
  );
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
    `sessions ${sleeping.join(", ")}; delete: ${answer}; folder there: ${existsSync(folder)}; before: ${running.join(",") || "none"}; after: ${after.join(",") || "none"}, ${took} ms after the delete; ${said ? decisionSaid(said) : `no stop for the folder's move; its decisions since the delete: ${decisionSaid((await decisionsOf(home, h.id)).filter((one) => one.at >= asked))}`}`
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
 * 3: workspace `id`'s live boundary, the one the agent records it keeps
 * while its work runs, is one it `had` before the restart and still runs.
 * An older generation still beside it before the restart (one handed over
 * before the loop started; host runs of 2026-10-19 had one on main and on
 * this build alike) may close meanwhile, but only as `closeIdle` closes one:
 * nothing left running in it, or gone already, as the agent records. Its
 * decisions for the workspace are noted, so a run says which handover made
 * it.
 */
const keptAsItWas = async (
  kit: Kit,
  fleet: Fleet,
  home: string,
  id: string,
  had: readonly string[]
): Promise<void> => {
  const now = await boundariesOf(fleet, id);
  const decisions = await decisionsOf(home, id);
  kit.note(
    `3: the agent's decisions of H's workspace: ${decisionSaid(decisions)}`
  );
  // What round 1's restart decided of the boundary H runs in.
  const decided = decisions.findLast(
    (one) => one.decision === "kept" && one.reasons.processes.length > 0
  );
  const live = decided?.decision === "kept" ? String(decided.pid) : undefined;
  const pidOf = (entry: string) => entry.slice(entry.lastIndexOf("@") + 1);
  const ownedLive = (list: readonly string[]) =>
    list.some((entry) => pidOf(entry) === live);
  kit.check(
    "3: H's live boundary, of an older form since the restart, is kept as it is while its work runs, as the agent records, never handed over",
    live !== undefined && ownedLive(had) && ownedLive(now) && now.length === 1,
    `before: ${had.join(",") || "none"}; now: ${now.join(",") || "none"}; ${decisionSaid(decided)}`
  );
  const closed = had.filter((entry) => !now.includes(entry));
  const unsaid = closed.filter(
    (entry) =>
      !decisions.some(
        (one) =>
          one.decision === "older-closed" &&
          String(one.pid) === pidOf(entry) &&
          (one.why === "idle" || one.why === "gone")
      )
  );
  kit.check(
    "3: any other boundary H had before the restart closed only as an older generation with nothing left running in it, as the agent records",
    unsaid.length === 0 && !closed.some((entry) => pidOf(entry) === live),
    `closed: ${closed.join(",") || "none"}; closed unsaid: ${unsaid.join(",") || "none"}`
  );
};

const spec: Spec = {
  name: "boundary-handover",
  run,
};

export default spec;

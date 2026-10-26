/**
 * A fleet sync that changes nothing a workspace's boundary reads hands
 * nothing over, and a form that moved never ends a command that runs (agent
 * boundary.ts `rearmMoved`, `syncedPresence`, `stopBoundary`). On a scratch
 * fleet (real hub, agent and sessiond; Claude Code against the mock model),
 * boundaries included: run it where a workspace boundary can start.
 *
 * On 2026-10-25 obelisk's agent logged "its boundary's form moved (the fleet
 * sync wrote what a boundary reads), so it is handed over" at every one of
 * 25 syncs in 30 minutes, for the same boundaries each time: their form had
 * moved once, at a build's start, and each was kept while its commands ran,
 * yet every converge said it and ensured it again. And every stop the agent
 * made of a boundary read as a kill: "the sandbox … ended with status 137,
 * so the workspace's boundary closes", then "exited, status 137".
 *
 * D, a delegate, runs a foreground command of {@link FG_SECONDS} s that
 * listens on nothing (`sh -c 'sleep …; exit 7'`). While it runs:
 *
 * 1. A fleet change the hub syncs: a hook placed for the project, whose
 *    script the sync writes into the fleet's hooks dir, which D's boundary
 *    binds whole. The agent converges it and logs no form move and no
 *    hand-over for D's workspace; D's boundary is the one it had, and its
 *    synced form part is the one it started with.
 * 2. The hooks dir taken away and made again by the next sync (a later inode
 *    under the boundary's bind): the agent logs D's form moved once, naming
 *    the part `synced`, and keeps the boundary while the command runs, as it
 *    records.
 * 3. A third sync, quiet again: no second form-moved line for D.
 * 4. The command finishes with its own exit code, 7, in the boundary it
 *    started in (`FG-STATUS-7`, never the executor's cut-off line).
 * 5. Once it has ended, D resting, the boundary is handed over, as the agent
 *    records, and the older one closes as a stop the agent asked for: its
 *    host says no sandbox ended unasked, and exits 0.
 *
 *   bun scripts/probe-kit/run.ts fleet-sync-quiet
 */
import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BoundaryDecision } from "../../../packages/agent/src/boundary";
import { readWithin } from "../../../packages/core/src/bounded";
import { systemProgram } from "../../../packages/core/src/workspace-needs";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { decisionsOf } from "../agent-records";
import type { Kit, Spec } from "../kit";

const WAIT = "mcp__cawco__wait_item";
/** How long D's foreground command runs: three syncs and their converges fit well inside it. */
const FG_SECONDS = 180;
/** D's command: a marker in the clone as it starts, then a foreground wait on no port, its status said by the shell around it. */
const FOREGROUND = [
  "touch fg.started",
  `sh -c 'sleep ${FG_SECONDS}; exit 7'`,
  `echo "FG-""STATUS-$?"`,
].join("; ");
const FG_STATUS = /FG-STATUS-(\d+)/u;
const TAG = "PROBE-QUIET-D:";
/** The executor's line for a command cut off by its boundary's end (agent boundary.ts `execScript`). */
const CUT_OFF = "boundary stopped while this command ran";
/** How long a converge and the look after it (agent session.ts `#rearmMoved`) take to land, after the agent says the sync. */
const SETTLE_MS = 15_000;
/** How long after D's command ends its boundary may take to be handed over: the agent's look each 5 s (boundary.ts `STALE_LOOK_MS`), a start, and slack. */
const HANDOVER_BOUND_MS = 30_000;
/** The agent's line for each delta it takes (agent session.ts `FLEET_DELTA`). */
const SYNC_LINE = /\[fleet\] sync from the hub: rev (\d+)/gu;

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

const steps: { ran?: boolean; rested?: boolean } = {};

/** D: runs its foreground command, then rests, nothing left in its boundary. */
const respond = (request: Seen): Reply => {
  if (!(request.tools && request.all.includes(TAG))) {
    return text("ok");
  }
  if (!steps.ran) {
    steps.ran = true;
    return tool("Bash", {
      command: FOREGROUND,
      description: "Run the long command",
      timeout: 300_000,
    });
  }
  if (!steps.rested) {
    const reply = offered(request, WAIT, {
      minutes: 60,
      reason: "its parent's word on the long command",
    });
    if (reply.tool?.name === WAIT) {
      steps.rested = true;
    }
    return reply;
  }
  return text("ok");
};

type Fleet = Awaited<ReturnType<Kit["fleet"]>>;

/** The hub's own routes, which the admin tools call (admin-tools.ts). */
const hubCall = async (
  fleet: Fleet,
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> => {
  const read = await readWithin(30_000, async (signal) => {
    const response = await fetch(`${fleet.base}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal,
    });
    return { status: response.status, text: await response.text() };
  });
  if (read.kind === "unanswered") {
    throw new Error(`${method} ${path}: no answer within ${read.after} ms`);
  }
  if (read.value.status >= 400) {
    throw new Error(
      `${method} ${path}: ${read.value.status} ${read.value.text}`
    );
  }
  return JSON.parse(read.value.text || "null") as unknown;
};

/** Workspace `id`'s state dir on the agent's machine. */
const stateOf = (home: string, id: string): string =>
  join(home, ".cawco", "workspaces", id);

/** Workspace `id`'s current boundary as the agent records it (agent boundary.ts `readHeld`). */
const heldOf = async (
  home: string,
  id: string
): Promise<{
  form?: string;
  gen?: string;
  parts?: Record<string, string>;
  pid?: number;
}> =>
  JSON.parse(
    await readFile(join(stateOf(home, id), "boundary.json"), "utf8").catch(
      () => "{}"
    )
  ) as {
    form?: string;
    gen?: string;
    parts?: Record<string, string>;
    pid?: number;
  };

/** The fleet's hooks dir on the scratch machine (core `fleetHooksDir`). */
const hooksDirOf = (fleet: Fleet): string =>
  join(fleet.env.XDG_DATA_HOME as string, "cawco", "fleet-hooks");

/** What a bind of the hooks dir holds: its device and inode, or none. */
const inodeOf = (path: string): string | undefined => {
  const held = statSync(path, { throwIfNoEntry: false });
  return held ? `${held.dev}:${held.ino}` : undefined;
};

/** A decision, or several, in a check's words. */
const decisionSaid = (
  decision: BoundaryDecision | readonly BoundaryDecision[] | undefined
): string =>
  decision && !(Array.isArray(decision) && decision.length === 0)
    ? JSON.stringify(decision)
    : "no decision recorded";

/** The agent's line for a form move a sync made (agent boundary.ts `rearmMoved`): the workspace, and what moved. */
const MOVED_LINE =
  /\[workspace\] ([0-9a-f-]+): its boundary's form moved \(([^)]*)\)/u;
/** The agent's line for a hand-over (agent boundary.ts `handOver`): the workspace, the older boundary and the new one. */
const HANDOVER_LINE =
  /\[workspace\] ([0-9a-f-]+): its boundary (\d+) \(form \w+\) is handed over to (\d+)/u;
/** The host's line for a sandbox that ended unasked (agent boundary-host.ts), as the agent says it: the workspace, its boundary, the sandbox, its status. */
const UNASKED_LINE =
  /\[workspace\] ([0-9a-f-]+): its boundary (\d+) says: cawco: the sandbox (\d+) ended with status (\d+)/u;
/** The agent's line for a boundary's exit (agent boundary.ts `watchHost`): the workspace, its boundary, how it exited. */
const EXIT_LINE =
  /\[workspace\] ([0-9a-f-]+): its boundary (\d+) \(\S+\) exited, (status \S+|killed by \S+)/u;

/** The lines of `log` that `pattern` matches with workspace `id` as its first group, each as matched. */
const linesOf = (log: string, pattern: RegExp, id: string): RegExpExecArray[] =>
  log
    .split("\n")
    .map((line) => pattern.exec(line))
    .filter((found): found is RegExpExecArray => found?.[1] === id);

/** The agent's lines that say workspace `id`'s form moved, each by what moved. */
const movedLines = (log: string, id: string): string[] =>
  linesOf(log, MOVED_LINE, id).map((found) => found[2] ?? "");

/** The agent's lines that say workspace `id`'s boundary was handed over, each as `old → new`. */
const handOverLines = (log: string, id: string): string[] =>
  linesOf(log, HANDOVER_LINE, id).map((found) => `${found[2]} → ${found[3]}`);

/**
 * A fleet change the hub syncs to the machine (`change`), then the agent's
 * word that it took the delta and the converge's look after it: the agent's
 * log from before the change on.
 */
const synced = async (
  fleet: Fleet,
  change: () => Promise<unknown>
): Promise<{ log: string; took: boolean }> => {
  const mark = await fleet.logMark("agent");
  await change();
  const took = await until(
    "the agent took the sync",
    async () => [...(await mark.since()).matchAll(SYNC_LINE)].length,
    (count) => count > 0,
    60_000
  )
    .then(() => true)
    .catch(() => false);
  await Bun.sleep(SETTLE_MS);
  return { log: await mark.since(), took };
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
  await Bun.$`sh -c ${"git init -q -b main && echo quiet > README.md && git add -A && git commit -qm 'First commit'"}`
    .cwd(src)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Quiet",
    machineId: MACHINE,
    cwd: src,
  });
  const parent = await fleet.spawn("claude", "Parent", src, {
    projectId: project.id,
  });
  // There before D's boundary starts, as every converge makes it (agent
  // fleet.ts `syncHooks`): a dir made only after would be a form part moved.
  await mkdir(hooksDirOf(fleet), { recursive: true });
  const d = await fleet.api<{
    instanceId: string;
    workItemId: string;
    workspaceId: string;
  }>("/api/work-items", {
    parentInstanceId: parent,
    title: "Long command D",
    prompt: `${TAG} run the long command, then wait.`,
    harness: "claude",
    model: "claude-haiku-4-5",
    cwd: src,
  });
  const id = d.workspaceId;
  const clone = await until(
    "D's clone",
    () =>
      fleet.query<{ path: string }>(
        "SELECT path FROM workspaces WHERE id = ?",
        id
      )[0]?.path,
    Boolean,
    120_000
  ).catch(() => undefined);
  const started = await until(
    "D's foreground command started",
    () => (clone ? existsSync(join(clone, "fg.started")) : false),
    Boolean,
    240_000
  ).catch(() => false);
  const startedAt = Date.now();
  const ran = await heldOf(home, id);
  kit.check(
    "0: D's foreground command started in a boundary whose record names its form's parts",
    started && ran.pid !== undefined && typeof ran.parts?.synced === "string",
    `started: ${started}; its boundary ${JSON.stringify(ran)}`
  );

  // 1: a hook placed: the sync writes its script into the hooks dir the
  // boundary binds whole, and moves nothing the boundary's form reads.
  const hookId = crypto.randomUUID();
  const hook = (name: string) =>
    hubCall(fleet, "PUT", `/api/fleet/hooks/${hookId}`, {
      enabled: true,
      handler: { type: "command" },
      scope: "project",
      projectId: project.id,
      name,
      event: "Notification",
      script: `#!${systemProgram("bash")}\nexit 0`,
    });
  const quiet = await synced(fleet, () => hook("quiet probe hook"));
  const afterQuiet = await heldOf(home, id);
  kit.check(
    "1: a sync that wrote a hook script into the hooks dir, and nothing else a boundary reads: no form move and no hand-over for D, its boundary the one it had",
    quiet.took &&
      movedLines(quiet.log, id).length === 0 &&
      handOverLines(quiet.log, id).length === 0 &&
      afterQuiet.pid === ran.pid &&
      afterQuiet.gen === ran.gen,
    `sync taken: ${quiet.took}; form-moved lines: ${movedLines(quiet.log, id).join(" | ") || "none"}; hand-over lines: ${handOverLines(quiet.log, id).join(" | ") || "none"}; boundary ${ran.pid}/${ran.gen} → ${afterQuiet.pid}/${afterQuiet.gen}`
  );

  // 2: the hooks dir taken away under the boundary and made again by the
  // next sync: a later inode under its bind, a form part it reads.
  const hooksDir = hooksDirOf(fleet);
  const dirBefore = inodeOf(hooksDir);
  await rm(hooksDir, { recursive: true, force: true });
  const moved = await synced(fleet, () => hook("quiet probe hook, again"));
  const dirAfter = inodeOf(hooksDir);
  const movedSaid = movedLines(moved.log, id);
  const keptWhile = (await decisionsOf(home, id)).findLast(
    (one) =>
      one.decision === "kept" &&
      one.pid === ran.pid &&
      one.reasons.commands.length > 0
  );
  const afterMoved = await heldOf(home, id);
  kit.check(
    "2: the hooks dir made again under D's boundary: the agent says its form moved once, naming the synced part, and keeps the boundary while its command runs",
    moved.took &&
      dirAfter !== undefined &&
      dirAfter !== dirBefore &&
      movedSaid.length === 1 &&
      movedSaid[0]?.includes("synced") === true &&
      keptWhile !== undefined &&
      afterMoved.pid === ran.pid,
    `sync taken: ${moved.took}; hooks dir ${dirBefore} → ${dirAfter}; form-moved lines: ${movedSaid.join(" | ") || "none"}; ${decisionSaid(keptWhile)}; boundary ${ran.pid} → ${afterMoved.pid}`
  );

  // 3: another quiet sync while the command still runs: said once is enough.
  const again = await synced(fleet, () => hook("quiet probe hook, a third"));
  kit.check(
    "3: a third sync, quiet again, while the command runs: no second form-moved line for D and no hand-over",
    again.took &&
      movedLines(again.log, id).length === 0 &&
      handOverLines(again.log, id).length === 0,
    `sync taken: ${again.took}; form-moved lines: ${movedLines(again.log, id).join(" | ") || "none"}; hand-over lines: ${handOverLines(again.log, id).join(" | ") || "none"}`
  );
  kit.note(
    `the three syncs took ${Math.round((Date.now() - startedAt) / 1000)} s of the command's ${FG_SECONDS} s`
  );

  // 4: the command finishes with its own exit code.
  const mark = await fleet.logMark("agent");
  const result = await until(
    "D's foreground command's result",
    () =>
      fleet.seen.find(
        (one) => FG_STATUS.test(one.last) || one.last.includes(CUT_OFF)
      ),
    Boolean,
    (FG_SECONDS + 120) * 1000
  ).catch(() => undefined);
  const said = result?.last ?? "";
  kit.check(
    "4: D's command finished with its own exit code, 7, in the boundary it started in",
    FG_STATUS.exec(said)?.[1] === "7" && !said.includes(CUT_OFF),
    result ? `its result: ${said.slice(0, 400)}` : "no result"
  );

  // 5: D rests; the agent's look hands its boundary over, and the older one
  // closes as a stop the agent asked for.
  const ended = Date.now();
  const lookAtD = async () => ({
    decided: (await decisionsOf(home, id)).find(
      (one) => one.decision === "handed-over" && one.pid === ran.pid
    ),
    closed: (await decisionsOf(home, id)).find(
      (one) => one.decision === "older-closed" && one.pid === ran.pid
    ),
    now: await heldOf(home, id),
  });
  const handed = await until(
    "D's boundary handed over and its older one closed",
    lookAtD,
    ({ decided, closed, now }) =>
      decided !== undefined &&
      closed !== undefined &&
      now.pid !== undefined &&
      now.pid !== ran.pid,
    HANDOVER_BOUND_MS
  ).catch(lookAtD);
  await Bun.sleep(2000);
  const log = await mark.since();
  const old = String(ran.pid);
  const exited = linesOf(log, EXIT_LINE, id).find((found) => found[2] === old);
  const unasked = linesOf(log, UNASKED_LINE, id)
    .filter((found) => found[2] === old)
    .map((found) => `sandbox ${found[3]} status ${found[4]}`);
  kit.check(
    `5: once D's command has ended, its boundary is handed over within ${HANDOVER_BOUND_MS / 1000} s, as the agent records, and the older one closes idle`,
    handed.decided !== undefined &&
      handed.closed !== undefined &&
      "why" in handed.closed &&
      handed.closed.why === "idle" &&
      handed.now.pid !== ran.pid,
    `ran in ${ran.pid}; now ${handed.now.pid ?? "unread"}, ${Date.now() - ended} ms after the command's result; ${decisionSaid([handed.decided, handed.closed].filter((one) => one !== undefined))}`
  );
  kit.check(
    "5: the older boundary's close reads as the stop it was: no sandbox ended unasked, and its host exited 0",
    unasked.length === 0 && exited?.[3] === "status 0",
    `unasked: ${unasked.join(" | ") || "none"}; exit: ${exited?.[3] ?? "not said"}`
  );
};

const spec: Spec = {
  group: "Workspaces and what agents may touch",
  name: "fleet-sync-quiet",
  host: "it delegates, so its fleet cuts workspaces",
  run,
};

export default spec;

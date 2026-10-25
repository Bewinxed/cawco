/**
 * A `from` cut of a held workspace that a written-off session's CLI still
 * runs in never takes the machine's agent down. On a scratch fleet (real hub,
 * agent and sessiond; Claude Code against the mock model). This spec
 * delegates, so its fleet cuts workspaces: it runs on the host, outside
 * every boundary.
 *
 * What happened on obelisk on 2026-10-18 (18:31:49 and 18:32:55): a delegate
 * cut `from` workspace bb4af2c9, whose item had ended with 3 commits on no
 * remote, and the agent exited 70 both times: "[law] Law broken:
 * live-workspace-judge-answers. … Workspace bb4af2c9-… has a session's
 * process or a command in it, and its hook's judge at …/judge-….sock
 * answered "nothing (connect ECONNREFUSED …)"". The held workspace's close
 * after the cut's bundle (hub work-items.ts `bundleOf`) killed its boundary
 * and its judge, and left a Claude Code process the keeper held in its clone,
 * one whose session the hub had filed asleep; the agent's next start revived
 * the boundary and judge for it (dad89261b), and the next cut killed them
 * again.
 *
 * - (a) A delegate commits and stops blocked: its item failed, its session
 *   is put to sleep, and its workspace is held, "1 commit on no remote".
 * - (b) A process the keeper holds as a Claude Code session's, under a
 *   session id the hub has no row of, runs in that clone: the CLI the hub
 *   had written off. The agent restarts, as an update restarts it, and its
 *   start revives the held workspace's boundary and judge for that process.
 * - (c) The parent delegates with `from` that workspace. Through two of the
 *   agent's beats after it: the agent still runs, and no law line is in its
 *   log (on main it exits 70 with the line); the written-off process ended
 *   with the workspace's close, and no judge or boundary of it is left; the
 *   new workspace's HEAD is the source's commit; the source is held, its
 *   clone standing at that commit, "1 commit on no remote".
 * - (d) A process the keeper holds as a session's starts in the held clone
 *   after its close, its hook still naming the judge the close killed: law
 *   `live-workspace-judge-answers` broken under a live attached process,
 *   with the agent running. Through two beats: the agent still runs, no law
 *   line; its log says the law was broken in that workspace and its judge
 *   was started again and answers; a judge of it runs on the keeper, and the
 *   process still runs. On 0220ca1f5 (before the repair) the beat exits 70.
 *
 *   bun scripts/probe-kit/run.ts from-held-cut
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SessiondClient } from "../../../packages/agent/src/sessiond-client";
import {
  SAFE_GIT_ENV,
  SAFE_GIT_FLAGS,
} from "../../../packages/core/src/safe-git";
import { welcomed } from "../../lib/keeper-dial";
import { toolRecord, toolWords } from "../../lib/tool-call";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const AHEAD = "PROBE-FROMHELD-AHEAD";
const AHEAD_MADE = "PROBE-FROMHELD-AHEAD-MADE";
const FROM = "PROBE-FROMHELD-FROM";
const COMMIT = "Probe commit held on no remote";
const FINISH = "mcp__cawco__finish_item";
/** What finish_item answers a blocked finish (work-items.ts `finishItem`). */
const BLOCKED = "The item failed as blocked";
/** The agent's line for a broken law (core invariant.ts). */
const LAW = "[law] Law broken:";
/** The agent's beat, on which the law is checked (boundary.ts `QUIET_SWEEP_MS`). */
const BEAT_MS = 60_000;
/** A held workspace's settle: its session's sleep, then its machine's archive. */
const SETTLE_MS = 120_000;

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const useTool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});
/** A deferred tool is found first, then called. */
const found = (request: Seen, name: string, input: object): Reply => {
  if (request.toolNames.includes(name)) {
    return useTool(name, input);
  }
  return request.toolNames.includes("ToolSearch")
    ? useTool("ToolSearch", { query: `select:${name}`, max_results: 1 })
    : text(`${name} is not offered`);
};

/** Every session's answer, by the tag its brief carries. */
const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("ok");
  }
  if (request.all.includes(AHEAD)) {
    if (request.all.includes(BLOCKED)) {
      return text("Stopped.");
    }
    if (!request.all.includes(AHEAD_MADE)) {
      return useTool("Bash", {
        command: `echo ahead > held-probe.txt && git add held-probe.txt && git -c user.name=Delegate -c user.email=d@probe.test commit -qm '${COMMIT}' && echo ${AHEAD_MADE}`,
        description: "Commit",
      });
    }
    return found(request, FINISH, {
      headline: "Committed and stopped.",
      summary: "Committed and stopped.",
      blocked: { command: "probe", error: "the probe stops this item here" },
    });
  }
  if (request.all.includes(FROM)) {
    return request.afterTool
      ? text("Done.")
      : found(request, FINISH, { headline: "Done.", summary: "Done." });
  }
  return text("ok");
};

interface Workspace {
  id: string;
  path: string;
  state: string;
}

/** The parent's own credential, as its tools call the hub with it. */
const credentialOf = async (fleet: KitFleet, parent: string): Promise<string> =>
  await fleet.sessionCredential(parent);

/** A CawCo tool called as the parent, through the door its MCP server and the CLI share: its words, or with `record` the hub's record. */
const callAs = async (
  fleet: KitFleet,
  parent: string,
  name: string,
  args: Record<string, unknown>,
  form: "words" | "record" = "words"
): Promise<{
  isError: boolean;
  structured: Record<string, unknown>;
  text: string;
}> => {
  const session = {
    base: fleet.base,
    id: parent,
    credential: await credentialOf(fleet, parent),
  };
  if (form === "words") {
    const said = await toolWords(session, name, args);
    return { isError: said.refused, structured: {}, text: said.text };
  }
  const said = await toolRecord<Record<string, unknown>>(session, name, args);
  return said.refused
    ? { isError: true, structured: {}, text: said.text }
    : { isError: false, structured: said.record, text: said.text };
};

/** git on the host in `dir`, as safe-git.ts says; its stdout, trimmed. */
const gitIn = (dir: string, ...args: string[]): Promise<string> =>
  Bun.$`git ${SAFE_GIT_FLAGS} -C ${dir} ${args}`
    .env({ ...process.env, ...SAFE_GIT_ENV })
    .quiet()
    .nothrow()
    .text()
    .then((out) => out.trim());

/** The keeper's processes of workspace `id`: its boundaries and judges, by proc id. */
const ofWorkspace = async (fleet: KitFleet, id: string): Promise<string[]> =>
  (await fleet.heldProcs())
    .map(({ procId }) => procId)
    .filter(
      (procId) =>
        procId.startsWith(`boundary-${id}`) || procId.startsWith(`judge-${id}`)
    );

const workspaceOf = (fleet: KitFleet, id: string): Workspace | undefined =>
  fleet.query<Workspace>(
    "SELECT id, path, state FROM workspaces WHERE id = ?",
    id
  )[0];

/** Whether the keeper still holds the written-off CLI `procId`. */
const holds = async (fleet: KitFleet, procId: string): Promise<boolean> =>
  (await fleet.heldProcs()).some((proc) => proc.procId === procId);

/** The fleet up, a project with one commit, and its parent session. */
const scene = async (
  kit: Kit
): Promise<{ fleet: KitFleet; parent: string; src: string }> => {
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
  await Bun.$`sh -c ${"git init -q -b main && echo from-held > README.md && git add -A && git commit -qm 'First commit'"}`
    .cwd(src)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "From held",
    machineId: MACHINE,
    cwd: src,
  });
  const parent = await fleet.spawn("claude", "Parent", src, {
    projectId: project.id,
  });
  return { fleet, parent, src };
};

/** (a) A failed item's workspace, held with its commit: the row and its HEAD. */
const heldPhase = async (
  { check }: Kit,
  fleet: KitFleet,
  parent: string,
  src: string
): Promise<{ head: string; source: Workspace } | undefined> => {
  const ahead = await fleet.api<{ workItemId: string; workspaceId: string }>(
    "/api/work-items",
    {
      parentInstanceId: parent,
      title: "Commit and stop",
      prompt: `${AHEAD}: commit a file, then stop.`,
      harness: "claude",
      model: "claude-haiku-4-5",
      cwd: src,
    }
  );
  const item = await until(
    "the delegate's item failed as blocked",
    () =>
      fleet.query<{ state: string }>(
        "SELECT state FROM work_items WHERE id = ?",
        ahead.workItemId
      )[0]?.state,
    (state) => state === "failed",
    300_000
  ).catch(() => undefined);
  const source = await until(
    "its workspace held",
    () => workspaceOf(fleet, ahead.workspaceId),
    (row) => row?.state === "held",
    SETTLE_MS
  ).catch(() => workspaceOf(fleet, ahead.workspaceId));
  const head = source ? await gitIn(source.path, "rev-parse", "HEAD") : "";
  const subject = source
    ? await gitIn(source.path, "log", "-1", "--format=%s")
    : "";
  check(
    "(a) the delegate's item failed as blocked, its workspace held with its commit",
    item === "failed" && source?.state === "held" && subject === COMMIT,
    `item ${item}; workspace ${source?.state}; HEAD ${head.slice(0, 9)} "${subject}"`
  );
  return source && head ? { head, source } : undefined;
};

/** A process the keeper holds as a Claude Code session's, under a session id the hub has no row of, in `clone`: its proc id. */
const strayIn = async (fleet: KitFleet, clone: string): Promise<string> => {
  const stray = crypto.randomUUID();
  const keeper = welcomed(
    fleet.sessiondSocket,
    await SessiondClient.connect(fleet.sessiondSocket)
  );
  try {
    await keeper.spawnProc(stray, {
      command: "/bin/sh",
      args: ["-c", "exec sleep 3600"],
      cwd: clone,
    });
  } finally {
    keeper.close();
  }
  return stray;
};

/**
 * (b) A written-off CLI in the held clone, and the agent restarted, whose
 * start revives the workspace's boundary and judge for it: the CLI's proc
 * id, and the agent's process.
 */
const strayPhase = async (
  { check }: Kit,
  fleet: KitFleet,
  source: Workspace
): Promise<{ agent: ReturnType<KitFleet["launch"]>; stray: string }> => {
  // A session id the hub has no row of: nothing adopts it, as nothing
  // pumped the CLI on obelisk once its session was filed asleep.
  await fleet.stop("agent");
  const stray = await strayIn(fleet, source.path);
  const agent = fleet.launch("agent");
  await fleet.agentUp();
  const revived = await until(
    "the held workspace's judge revived for the CLI in its clone",
    () => ofWorkspace(fleet, source.id),
    (procs) => procs.some((procId) => procId.startsWith("judge-")),
    120_000
  ).catch(() => [] as string[]);
  const runs = await holds(fleet, stray);
  check(
    "(b) with a written-off CLI in its clone, the agent's start revives the held workspace's boundary and judge",
    revived.some((procId) => procId.startsWith("judge-")) &&
      revived.some((procId) => procId.startsWith("boundary-")) &&
      runs,
    `${revived.join(", ") || "none"}; the CLI ${runs ? "runs" : "is gone"}`
  );
  return { agent, stray };
};

/** (c) A delegate cut `from` the held workspace, watched through two beats. */
const cutPhase = async (
  { check }: Kit,
  fleet: KitFleet,
  parent: string,
  held: { head: string; source: Workspace },
  revived: { agent: ReturnType<KitFleet["launch"]>; stray: string }
): Promise<void> => {
  const { head, source } = held;
  const { agent, stray } = revived;
  const watched = await fleet.logMark("agent");
  const cut = await callAs(
    fleet,
    parent,
    "delegate",
    {
      prompt: `${FROM}: finish the commit you start from.`,
      title: "From held probe",
      harness: "claude",
      model: "claude-haiku-4-5",
      from: source.id,
      lands: "none",
    },
    "record"
  );
  const cutId = String(cut.structured.workspaceId ?? "");
  // Two beats: the law is checked on each, after the quiet sweep.
  const watchedUntil = Date.now() + 2 * BEAT_MS + 15_000;
  while (Date.now() < watchedUntil && agent.exitCode === null) {
    // biome-ignore lint/performance/noAwaitInLoops: watches the agent through its beats
    await Bun.sleep(1000);
  }
  const laws = (await watched.since())
    .split("\n")
    .filter((line) => line.includes(LAW));
  check(
    "(c) through two beats after the cut the agent still runs, and no law line is in its log",
    agent.exitCode === null && laws.length === 0,
    `agent ${agent.exitCode === null ? "running" : `exited ${agent.exitCode}`}; ${laws.join(" / ") || "no law line"}`
  );
  const left = await ofWorkspace(fleet, source.id);
  const runs = await holds(fleet, stray);
  check(
    "(c) the written-off CLI ended with the held workspace's close, and no boundary or judge of it is left",
    !runs && left.length === 0,
    `the CLI ${runs ? "runs" : "is gone"}; left: ${left.join(", ") || "none"}`
  );
  const made = cutId ? workspaceOf(fleet, cutId) : undefined;
  const madeHead = made ? await gitIn(made.path, "rev-parse", "HEAD") : "";
  check(
    "(c) the new workspace starts at the source's commit",
    !cut.isError &&
      made !== undefined &&
      cutId !== source.id &&
      madeHead === head,
    `${cut.text.slice(0, 300)}; HEAD ${madeHead.slice(0, 9)} against ${head.slice(0, 9)}`
  );
  const after = workspaceOf(fleet, source.id);
  const words = await fleet
    .api<{ holds: string }>(`/api/workspaces/${source.id}/held`)
    .catch((error: unknown) => ({ holds: String(error) }));
  const sourceHead = existsSync(source.path)
    ? await gitIn(source.path, "rev-parse", "HEAD")
    : "";
  check(
    "(c) the source stays held, its clone standing at its commit, 1 commit on no remote",
    after?.state === "held" &&
      sourceHead === head &&
      words.holds === "1 commit on no remote",
    `${after?.state}; HEAD ${sourceHead.slice(0, 9) || "gone"}; ${words.holds}`
  );
};

/** (d) The judge gone under a live attached process: repaired in that workspace, the agent up. */
const repairPhase = async (
  { check }: Kit,
  fleet: KitFleet,
  source: Workspace,
  agent: ReturnType<KitFleet["launch"]>
): Promise<void> => {
  const watched = await fleet.logMark("agent");
  const before = await ofWorkspace(fleet, source.id);
  const stray = await strayIn(fleet, source.path);
  const repaired = `[workspace] ${source.id}: law live-workspace-judge-answers was broken`;
  const watchedUntil = Date.now() + 2 * BEAT_MS + 15_000;
  while (Date.now() < watchedUntil && agent.exitCode === null) {
    // biome-ignore lint/performance/noAwaitInLoops: watches the agent through its beats
    await Bun.sleep(1000);
  }
  const log = await watched.since();
  const laws = log.split("\n").filter((line) => line.includes(LAW));
  const said = log.split("\n").filter((line) => line.includes(repaired));
  check(
    "(d) with its judge gone under a live process, the agent still runs through two beats and no law line is in its log",
    agent.exitCode === null && laws.length === 0,
    `agent ${agent.exitCode === null ? "running" : `exited ${agent.exitCode}`}; ${laws.join(" / ") || "no law line"}`
  );
  const after = await ofWorkspace(fleet, source.id);
  const runs = await holds(fleet, stray);
  check(
    "(d) its log names the workspace, the broken law and the repair: its judge started again, answering; a judge of it runs, and the process still runs",
    said.length > 0 &&
      said[0]?.includes("its judge was started again and answers") === true &&
      after.some((procId) => procId.startsWith("judge-")) &&
      runs,
    `before: ${before.join(", ") || "none"}; after: ${after.join(", ") || "none"}; the process ${runs ? "runs" : "is gone"}; ${said.join(" / ") || "no repair line"}`
  );
};

const spec: Spec = {
  name: "from-held-cut",
  host: "it delegates, so its fleet cuts workspaces",
  run: async (kit: Kit) => {
    const { fleet, parent, src } = await scene(kit);
    const held = await heldPhase(kit, fleet, parent, src);
    if (!held) {
      return;
    }
    const revived = await strayPhase(kit, fleet, held.source);
    await cutPhase(kit, fleet, parent, held, revived);
    if (revived.agent.exitCode === null) {
      await repairPhase(kit, fleet, held.source, revived.agent);
    }
  },
};

export default spec;

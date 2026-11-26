/**
 * What a workspace's boundary runs for its sessions: each agent command and
 * server it started, and ending a session's or a workspace's work.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { CAWCO_ENV } from "@cawco/core/cawco-env";
import { lookUntil } from "@cawco/core/effect/poll";
import { workspacesDir } from "@cawco/core/paths/workspace";
import {
  commandLines,
  type ProcessLineage,
  processArgs,
  processLineage,
} from "@cawco/core/process-identity";
import { listedPid, signal as signalPid } from "@cawco/core/signal";
import { workspaceIdKindOf } from "@cawco/core/workspace-id";
import { Effect } from "effect";
import { membershipName } from "../boundary-policy";
import { runPromise } from "../daemon-runtime";
import { fromPromise, type Rejected } from "../rejected";
import { commandsOf } from "./exec";
import type { Seen } from "./place-guard";
import {
  answering,
  executors,
  inBoundaries,
  inTree,
  KILL_WAIT_MS,
  WORK_GRACE_MS,
} from "./processes";
import { agentServersIn, counted } from "./servers";
import { type Held, readHeld, readPlace, readRetiring } from "./state";

/** One process of a workspace's work ({@link workers}). */
interface Worker {
  readonly pgid: number;
  readonly pid: number;
  readonly ppid: number;
  readonly started: string;
  readonly startSeconds: number;
}

/**
 * The executors of the agent's own commands running in each workspace now,
 * by pid (hub-command.ts `runHubCommand`: a landing's push and the
 * hub's git reads): none is
 * a session's ({@link agentWork}).
 */
const agentExecutors = new Map<string, Set<number>>();

/**
 * Counts executor `pid`, which the agent started, as one of its own commands
 * in workspace `id` ({@link agentExecutors}); answers what lets it go once
 * the command has ended.
 */
export const agentCommandStarted = (id: string, pid: number): (() => void) =>
  counted(agentExecutors, id, pid);

/**
 * macOS: what inside workspace `id`'s boundaries no session sweep takes, off
 * one reading of the process table (`rows`, `lines`) and the agent's own
 * executors as they stand after it (`agent`), so that every executor of the
 * agent's the table holds is among them. Read by lineage, which the kernel
 * shows for every process, Apple's binaries among them, where it withholds
 * their environment:
 *
 * - its runners (`generations`) and their plumbing: each runner's child (a
 *   request's subshell, which waits on its command and writes its status:
 *   killed, the command's executor would wait for that status for ever), and
 *   each child of one of those in its own process group (the `cat`s copying
 *   the command's output, and its launch before it leads a group of its own,
 *   runner.ts `LAUNCH`). Each ends with its command;
 * - THE AGENT'S OWN COMMANDS, the hub's landing among them, and its servers
 *   (a stage's, servers.ts `agentServers`), which a sweep
 *   never cuts: each by its request's dir, which its executor writes into its
 *   mark ({@link commandsOf}), where nothing inside writes, before it hands
 *   the request to the runner, and which the command's launch, a request
 *   subshell's child, names as its last argument: that launch, every process
 *   below it by parent, and every process of its group launchd adopted. What
 *   one of them moved out of its tree with `setsid` or a double fork is not
 *   among them; it was born while its command ran, and no sweep ends it before
 *   that command has ended ({@link endWorkspaceWork}). A server's runs as
 *   long as the server, so a sweep meanwhile ends it.
 */
const agentWork = async (
  id: string,
  generations: readonly Pick<Held, "gen" | "pid">[],
  rows: ReadonlyMap<number, ProcessLineage>,
  lines: readonly { command: string; pid: number }[],
  agent: readonly number[]
): Promise<Set<number>> => {
  const runners = new Set(generations.map((generation) => generation.pid));
  const spared = new Set(runners);
  const subshells = new Set<number>();
  for (const row of rows.values()) {
    if (runners.has(row.ppid)) {
      subshells.add(row.pid);
      spared.add(row.pid);
    }
  }
  for (const row of rows.values()) {
    const parent = rows.get(row.ppid);
    if (parent && subshells.has(parent.pid) && row.pgid === parent.pgid) {
      spared.add(row.pid);
    }
  }
  const requests = (
    await Promise.all(
      agent.flatMap((executor) =>
        generations.map((generation) =>
          readFile(
            join(commandsOf(id, generation.gen), String(executor)),
            "utf8"
          ).then(
            (text) => text.trim(),
            () => ""
          )
        )
      )
    )
  ).filter(Boolean);
  const leaders = new Set(
    lines
      .filter(
        (line) =>
          subshells.has(rows.get(line.pid)?.ppid ?? 0) &&
          requests.some((request) => line.command.endsWith(` ${request}`))
      )
      .map((line) => line.pid)
  );
  const tree = new Set(leaders);
  for (let grew = true; grew;) {
    grew = false;
    for (const row of rows.values()) {
      if (
        !tree.has(row.pid) &&
        (tree.has(row.ppid) || (leaders.has(row.pgid) && row.ppid === 1))
      ) {
        tree.add(row.pid);
        grew = true;
      }
    }
  }
  for (const pid of tree) {
    spared.add(pid);
  }
  return spared;
};

/** {@link workers} of workspace `id` alone, by pid, off one reading of the process table (`seen`, `rows`, `lines`); on macOS `bounded` is its processes in a boundary ({@link inBoundaries}). */
const workOf = async (
  id: string,
  seen: Seen[],
  rows: ReadonlyMap<number, ProcessLineage>,
  lines: readonly { command: string; pid: number }[],
  bounded: readonly number[]
): Promise<number[]> => {
  const held = await readHeld(id).catch(() => undefined);
  const generations = [...(held ? [held] : []), ...(await readRetiring(id))];
  if (process.platform === "linux") {
    const work = executors(lines, id);
    const places = await Promise.all(
      generations.map((generation) => readPlace(id, generation.gen))
    );
    for (const place of places) {
      const idle = new Set(place?.idle);
      work.push(
        ...inTree(seen, place?.inner)
          .map((one) => one.pid)
          .filter((pid) => !idle.has(pid))
      );
    }
    return work;
  }
  const agent = [...(agentExecutors.get(id) ?? []), ...agentServersIn(id)];
  const spared = await agentWork(id, generations, rows, lines, agent);
  return [
    ...executors(lines, id).filter((pid) => !agent.includes(pid)),
    ...answering(bounded, membershipName(id)).filter((pid) => !spared.has(pid)),
  ];
};

/**
 * Every process of the work of each delegation workspace on this machine,
 * or of the workspaces `only` names, the boundary's own reading of it
 * (processes.ts `busyOld`): on Linux everything that descends from a generation's
 * sandbox init and was not there when its runner was ready ({@link inTree}),
 * and every executor on its way into one ({@link executors}), which runs on
 * the host as its session's shell's child; on macOS everything that answers
 * to the workspace's name and every executor on its way in, but its runners,
 * their plumbing and the agent's own commands ({@link agentWork}). A place
 * (a person's own folder) is left out: its sessions are the person's own.
 */
const workers = async (
  only?: readonly string[]
): Promise<{
  rows: ReadonlyMap<number, ProcessLineage>;
  work: Map<number, Worker>;
}> => {
  const ids = (only ?? (await readdir(workspacesDir()).catch(() => []))).filter(
    (id) => workspaceIdKindOf(id) !== "place"
  );
  const [lineage, lines] = await Promise.all([
    processLineage(),
    commandLines(),
  ]);
  const rows = new Map(lineage.map((row) => [row.pid, row]));
  const seen: Seen[] = lineage.map((row) => ({
    pid: row.pid,
    ppid: row.ppid,
    command: "",
  }));
  const bounded = inBoundaries(seen);
  const work = new Set(
    (
      await Promise.all(ids.map((id) => workOf(id, seen, rows, lines, bounded)))
    ).flat()
  );
  const found = new Map<number, Worker>();
  for (const pid of work) {
    const row = rows.get(pid);
    if (row && pid !== process.pid) {
      found.set(pid, row);
    }
  }
  return { rows, work: found };
};

/**
 * Linux: what session `instanceId` left running in the work of every
 * delegation workspace on this machine ({@link workers}): each process whose
 * environment names the session (`CAWCO_INSTANCE_ID`, which every harness
 * sets in its session's shell and the executor hands every command, core
 * `CAWCO_ENV.instanceId`), the process group each of those is in, which its
 * command's launch leads (runner.ts `LAUNCH`: the command's own shell, whose
 * environment is the runner's), and everything below any of them. A
 * `setsid` or double-forked process keeps the environment it was started
 * with, and Linux lets this user read every one of its processes', so it is
 * found however far it moved. What runs there for another session, or for
 * the hub (a landing's push), is not this session's.
 */
const sessionWork = async (instanceId: string): Promise<Worker[]> => {
  const { work } = await workers();
  const mark = `${CAWCO_ENV.instanceId}=${instanceId}`;
  const named = await Promise.all(
    [...work.keys()].map(async (pid) => ({
      pid,
      marked: ((await processArgs(pid))?.env ?? []).includes(mark),
    }))
  );
  const taken = new Set(
    named.filter((one) => one.marked).map((one) => one.pid)
  );
  for (const pid of [...taken]) {
    const leader = work.get(pid)?.pgid;
    if (leader !== undefined && work.has(leader)) {
      taken.add(leader);
    }
  }
  for (let grew = true; grew;) {
    grew = false;
    for (const [pid, one] of work) {
      if (!taken.has(pid) && taken.has(one.ppid)) {
        taken.add(pid);
        grew = true;
      }
    }
  }
  return [...work.values()].filter((one) => taken.has(one.pid));
};

/**
 * macOS: what session `instanceId` left running in its workspace
 * `workspace`: all of that workspace's work ({@link workers}: every process
 * that answers to its name and every executor on its way in, but its
 * runners, their plumbing and the agent's own commands, by lineage,
 * {@link agentWork}), but a process whose environment names another
 * session. The kernel
 * withholds the environment of every Apple platform binary (`/bin/sleep`,
 * `/bin/bash`, git, xcodebuild: "env 0" read on the Mac), so the session's
 * own `CAWCO_INSTANCE_ID` cannot be what finds its work there, as it is on
 * Linux; the workspace is the session's, and what in it says it is another
 * session's is that one's. Split by birth (`now`, `later`) against the
 * earliest of the agent's own commands running there (`agents`, their
 * executors): what was born before it is none of theirs.
 */
const workspaceWork = async (
  instanceId: string,
  workspace: string
): Promise<{ agents: number[]; later: Worker[]; now: Worker[] }> => {
  const { rows, work } = await workers([workspace]);
  // Read after the process table: every executor of the agent's it holds is here.
  const agents = [...(agentExecutors.get(workspace) ?? [])].filter((pid) =>
    rows.has(pid)
  );
  const since = Math.min(
    ...agents.map(
      (pid) => rows.get(pid)?.startSeconds ?? Number.POSITIVE_INFINITY
    )
  );
  const named = `${CAWCO_ENV.instanceId}=`;
  const own = `${named}${instanceId}`;
  const others = await Promise.all(
    [...work.keys()].map(async (pid) =>
      ((await processArgs(pid))?.env ?? []).some(
        (variable) => variable.startsWith(named) && variable !== own
      )
        ? pid
        : undefined
    )
  );
  const theirs = new Set(others);
  const mine = [...work.values()].filter((one) => !theirs.has(one.pid));
  return {
    agents,
    now: mine.filter((one) => one.startSeconds < since),
    later: mine.filter((one) => one.startSeconds >= since),
  };
};

/** How often {@link endWorkspaceWork} looks whether the agent's commands it waits for have ended. */
const AGENT_LOOK_MS = 200;

/**
 * macOS: {@link endSessionWork} in workspace `workspace`. What was born
 * before the earliest of the agent's own commands running there is ended at
 * once, so a landing's command finds nothing of the session's running
 * beside it. What was born since may be one of those
 * commands' own, moved out of its tree ({@link agentWork}): it is ended once
 * the commands running then have, a landing's push run to
 * their end, and so on while the agent's commands come. Meanwhile the
 * session's lane holds its next turn (session.ts queues a session's controls
 * in order), so nothing it starts after is swept.
 */
const endWorkspaceWork = Effect.fnUntraced(function* (
  instanceId: string,
  workspace: string
) {
  const ended = new Set<number>();
  const left = new Set<number>();
  for (;;) {
    const round = yield* endWork(() =>
      workspaceWork(instanceId, workspace).then(({ now }) => now)
    );
    for (const pid of round.ended) {
      ended.add(pid);
    }
    for (const pid of round.left) {
      left.add(pid);
    }
    const { agents, later } = yield* fromPromise(() =>
      workspaceWork(instanceId, workspace)
    );
    if (later.length === 0) {
      return { ended: [...ended], left: [...left] };
    }
    yield* lookUntil(
      { every: AGENT_LOOK_MS, until: (running: boolean) => !running },
      Effect.sync(() =>
        agents.some((pid) => agentExecutors.get(workspace)?.has(pid))
      )
    );
  }
});

/** Of `ones`, those still running as the same process. */
const stillRunning = async (ones: readonly Worker[]): Promise<Worker[]> => {
  const now = new Map(
    (await processLineage()).map((row) => [row.pid, row.started])
  );
  return ones.filter((one) => now.get(one.pid) === one.started);
};

/**
 * ENDS EVERYTHING SESSION `instanceId` LEFT RUNNING IN A WORKSPACE, AND
 * NOTHING ELSE: its commands in the foreground and the background, what
 * they left behind with `&`, `nohup`, `setsid` or a double fork, and the
 * executors still on their way in: on Linux each found by the session's
 * name in its environment ({@link sessionWork}), on macOS all the work of
 * its workspace `workspace` that names no other session, the agent's own
 * commands there left running, the hub's landing among them
 * ({@link endWorkspaceWork}); a place (a person's own folder) is never
 * swept. The boundary runs on, and the session keeps its transcript, clone
 * and files, so a later message resumes it there. What an interrupt and a
 * stop of a session do (session.ts), on every harness: Claude Code ends a
 * command it cuts off by killing its own shell, which reaches the executor
 * and never the command inside the boundary, and a background command
 * outlived the interrupt that was to stop it (two delegates on the Mac,
 * 2026-10-20).
 *
 * Each is told to end (SIGTERM), so a keeper's trap frees what it holds,
 * and given {@link WORK_GRACE_MS}; then everything of the session's still
 * there, what it started meanwhile included, is killed. Answers what was
 * ended and what was still running {@link KILL_WAIT_MS} after the kill.
 */
export const endSessionWork = (
  instanceId: string,
  workspace: string | undefined
): Promise<{ ended: number[]; left: number[] }> => {
  // The promise edge of the session's work ended (session.ts).
  if (process.platform !== "darwin") {
    return runPromise(endWork(() => sessionWork(instanceId)));
  }
  if (!workspace || workspaceIdKindOf(workspace) === "place") {
    return Promise.resolve({ ended: [], left: [] });
  }
  return runPromise(endWorkspaceWork(instanceId, workspace));
};

/** {@link endSessionWork}'s ending of the work `read` reads, read again for its kill. */
const endWork = Effect.fnUntraced(function* (
  read: () => Promise<Worker[]>
): Effect.fn.Return<{ ended: number[]; left: number[] }, Rejected> {
  const first = yield* fromPromise(read);
  if (first.length === 0) {
    return { ended: [], left: [] };
  }
  for (const one of first) {
    signalPid(listedPid(one.pid), "SIGTERM");
  }
  /** `ones` looked at every 50 ms until none runs or `ms` pass: those still running. */
  const goneWithin = (ones: readonly Worker[], ms: number) => {
    let running = ones;
    return lookUntil(
      {
        every: 50,
        deadlineMs: ms,
        until: (still: readonly Worker[]) => still.length === 0,
      },
      fromPromise(async () => {
        running = await stillRunning(running);
        return running;
      })
    ).pipe(Effect.map(() => running));
  };
  yield* goneWithin(first, WORK_GRACE_MS);
  const last = yield* fromPromise(read);
  for (const one of last) {
    signalPid(listedPid(one.pid), "SIGKILL");
  }
  const left = yield* goneWithin(last, KILL_WAIT_MS);
  return {
    ended: [...new Set([...first, ...last].map((one) => one.pid))],
    left: left.map((one) => one.pid),
  };
});

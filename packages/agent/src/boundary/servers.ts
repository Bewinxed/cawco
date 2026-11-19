/**
 * The agent's own servers in a workspace's boundaries: each stage's host and
 * each preview's server (stage.ts `start`), which the agent supervises and
 * starts again wherever the boundary runs now. Their executors, what of a
 * boundary's work is theirs, and their move to the generation a handover
 * leaves current.
 *
 * WHY THEY MOVE. Work a session runs keeps its boundary as it is until it
 * ends (ensure.ts `handOverWhenIdle`): the new boundary's pid namespace and
 * network are others, where its next command would find nothing of what it
 * left running. A stage is no session's: the hub keeps a preview waiting on
 * the person up for as long as it waits (hub artifacts service
 * `keepWaitingUp`), so a boundary kept while its server ran was kept for
 * good, and with it the session keeper that held it. On obelisk the keeper of
 * nightly 8333 held no session on 19 Nov, only eight pins' boundaries, their
 * Vite servers and a headless Chromium (173 processes, 2.3 GB), and never
 * retired (binary-update.ts `#retireKeepers` keeps a keeper while it holds a
 * live child). A server is the agent's to start again: once its boundary is
 * handed over it starts in the new one ({@link moveServers}), and the older
 * one closes once nothing else runs in it.
 */

import { CAWCO_ENV } from "@cawco/core/cawco-env";
import { processArgs } from "@cawco/core/process-identity";
import type { Seen } from "./place-guard";

/**
 * The executors of the agent's own servers running in each boundary now, by
 * the boundary's workspace id and pid (stage.ts `start`: a stage's `serve`
 * command or its host, which run until the stage ends): none is a session's,
 * as none of work.ts `agentExecutors` is (work.ts `agentWork`), but a
 * session's sweep never waits for one to end (work.ts `endWorkspaceWork`),
 * as it would for ever. On the Mac a delegate's interrupt or stop, and its
 * workspace's settle, ended the hub-run preview it served until 2026-10-24.
 */
const agentServers = new Map<string, Set<number>>();

/** `pid` added to `id`'s set in `by`; answers what takes it out, and the set with it once empty. */
export const counted = (
  by: Map<string, Set<number>>,
  id: string,
  pid: number
): (() => void) => {
  const theirs = by.get(id) ?? new Set<number>();
  theirs.add(pid);
  by.set(id, theirs);
  return () => {
    theirs.delete(pid);
    if (theirs.size === 0 && by.get(id) === theirs) {
      by.delete(id);
    }
  };
};

/**
 * Counts executor `pid`, which the agent started, as one of its own servers
 * in the boundary of workspace `id` ({@link agentServers}); answers what lets
 * it go once the server has ended.
 */
export const agentServerStarted = (id: string, pid: number): (() => void) =>
  counted(agentServers, id, pid);

/** The executors of the agent's own servers in workspace `id`'s boundaries now ({@link agentServers}). */
export const agentServersIn = (id: string): readonly number[] => [
  ...(agentServers.get(id) ?? []),
];

/** Whether process `pid`'s environment carries a server's mark (core `CAWCO_ENV.stageServer`); false when it cannot be read. */
const marked = async (pid: number): Promise<boolean> =>
  ((await processArgs(pid))?.env ?? []).some((variable) =>
    variable.startsWith(`${CAWCO_ENV.stageServer}=`)
  );

/**
 * Of the work in one generation of workspace `id`'s boundary, read off
 * `seen` (`commands`, the executors its marks name, processes.ts
 * `commandsIn`; `processes`, processes.ts `workProcesses`), what is the
 * agent's own servers': each executor the agent started for one
 * ({@link agentServers}), and each request's tree of processes inside that a
 * server's mark is in. A request's tree is a process of the work whose
 * parent is not of it (a request's subshell, the runner's child; an orphan,
 * which a `setsid` or a double fork gave to the sandbox's init or launchd),
 * with everything below it: the subshell's `cat`s and the command's launch,
 * whose own environment is the runner's (runner.ts `runnerText`), are the
 * server's as much as the host they start. The mark is set in the server's
 * executor's environment (stage.ts `start`), which the command's shell
 * exports to everything it starts, a `setsid` or double-forked process among
 * them; macOS withholds the environment of its own binaries, never of the
 * Bun or Node a server runs.
 */
export const serversIn = async (
  id: string,
  seen: readonly Seen[],
  commands: readonly number[],
  processes: readonly number[]
): Promise<ReadonlySet<number>> => {
  const own = new Set(agentServersIn(id));
  const servers = new Set(commands.filter((pid) => own.has(pid)));
  if (processes.length === 0) {
    return servers;
  }
  const work = new Set(processes);
  const parents = new Map(seen.map((one) => [one.pid, one.ppid]));
  const children = new Map<number, number[]>();
  for (const pid of processes) {
    const parent = parents.get(pid) ?? 0;
    children.set(parent, [...(children.get(parent) ?? []), pid]);
  }
  const roots = processes.filter((pid) => !work.has(parents.get(pid) ?? 0));
  for (const root of roots) {
    const tree = [root];
    // Each child pushed is read in its turn: the loop walks the tree down.
    for (const pid of tree) {
      tree.push(...(children.get(pid) ?? []));
    }
    let theirs = false;
    for (const pid of tree) {
      if (await marked(pid)) {
        theirs = true;
        break;
      }
    }
    if (theirs) {
      for (const pid of tree) {
        servers.add(pid);
      }
    }
  }
  return servers;
};

/**
 * What moves the agent's servers: each stage whose executor is among those
 * given, started again in the generation its boundary runs now (stage.ts
 * `moveStages`), answering how many stages they were. Handed in by the daemon
 * as it starts ({@link moveServersWith}).
 */
type ServersMove = (executors: readonly number[]) => number;

let move: ServersMove | undefined;

/** The daemon hands in what moves its servers ({@link ServersMove}). */
export const moveServersWith = (given: ServersMove): void => {
  move = given;
};

/**
 * Moves the agent's servers among `servers` (a generation's, {@link
 * serversIn}) out of a boundary generation that is no longer current: each
 * stage whose executor is one of them is started again, in the generation its
 * boundary runs now, and its process in the older one ended. Answers how many
 * stages run there still, live ones started again and starting ones left to
 * finish first; none is a server no stage of this agent runs, which goes with
 * its generation.
 */
export const moveServers = (servers: readonly number[]): number =>
  servers.length === 0 ? 0 : (move?.(servers) ?? 0);

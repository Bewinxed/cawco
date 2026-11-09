/**
 * What holds a workspace's boundary open: its live work items, attached
 * sessions and running commands, and when it was last held.
 */

import { join } from "node:path";
import { commandLines } from "@cawco/core/process-identity";
import { isPlace } from "@cawco/core/workspace-policy";
import type { HeldProc } from "../keepers";
import { inView, overlaySync, ownFolderSync } from "../layer";
import { sessionOfProc } from "../proc-id";
import { executors } from "./processes";
import {
  closeUnderWay,
  isStarting,
  startUnderWay,
  stateDir,
  withClose,
} from "./state";

/**
 * How long a workspace's boundary runs on with nothing holding it
 * ({@link liveWhy}) before it closes (looks.ts `closeQuietly`). Our call: the hub
 * puts a finished delegate's session to sleep at once and lands its work
 * right after, each of its commands a use; a handoff that soon after finds
 * the boundary still up. Past that, a closed one costs its next command one
 * sandbox start (seconds; `WORKSPACE_BOUNDARY_START_TIMEOUT_MS` at most),
 * while an idle one holds its srt host, bwrap, socat relays, an inotify
 * instance, its judge and their memory for as long as the workspace lasts:
 * 55 of 76 on obelisk had no live work item (2026-10-15).
 */
const QUIET_CLOSE_MS = 10 * 60_000;

/**
 * When each workspace's boundary was last ensured or seen held
 * ({@link liveWhy}): its quiet time counts from there. One first seen by this
 * agent counts from that look, so a restart gives every boundary its full
 * quiet time again.
 */
const liveAt = new Map<string, number>();

/** Workspace `id`'s boundary was ensured or seen held at `at` ({@link liveAt}). */
export const sawHeld = (id: string, at: number): void => {
  liveAt.set(id, at);
};

/** When workspace `id`'s boundary was last ensured or seen held, if this agent has seen it. */
export const heldSince = (id: string): number | undefined => liveAt.get(id);

/** Workspace `id`'s boundary is closed: nothing counts its quiet time now. */
export const forgetHeld = (id: string): void => {
  liveAt.delete(id);
};

/**
 * Runs an archive's close of workspace `id` (`close`) as one step against its
 * starts: after the start under way, if any, has ended and the close before
 * it has finished, and with an ensure arriving meanwhile waiting until it is
 * done (ensure.ts `ensureNow`). A start the close did not wait for would run on
 * with its generation's dir, FIFO and state dir taken from under it, or start
 * a boundary the close has already passed.
 */
export const closedWhile = <T>(
  id: string,
  close: () => Promise<T>
): Promise<T> => {
  const before = [startUnderWay(id), closeUnderWay(id)];
  const work = Promise.allSettled(before).then(close);
  const held = work.then(
    () => undefined,
    () => undefined
  );
  return withClose(id, held, work);
};

/**
 * What the agent knows holds a workspace that this module cannot read for
 * itself, handed in by the daemon (looks.ts `watchQuietBoundaries`).
 */
export interface BoundaryHolders {
  /** The workspaces whose port a preview this agent serves names (preview.ts `servingPreviews`). */
  readonly previews: () => Iterable<string>;
  /** The workspaces a carried session's commands run in (session.ts `boundedWorkspaces`), whatever its harness. */
  readonly sessions: () => Iterable<string>;
}

/** Every process's command line, as one list and by pid: read once for every workspace a look covers. */
interface Commands {
  readonly byPid: ReadonlyMap<number, string>;
  readonly lines: readonly { command: string; pid: number }[];
}

/** What {@link liveWhy} reads, once for every workspace a look covers. */
export interface LiveFacts {
  readonly commands: Commands;
  readonly hub: ReadonlySet<string>;
  readonly previews: ReadonlySet<string>;
  /** Every live process a keeper holds. */
  readonly procs: readonly HeldProc[];
  readonly sessions: ReadonlySet<string>;
}

/** {@link Commands} as they stand now. */
export const commandsNow = async (): Promise<Commands> => {
  const lines = await commandLines();
  return {
    byPid: new Map(lines.map((line) => [line.pid, line.command])),
    lines,
  };
};

/**
 * Whether a session's process a keeper holds may run a command in workspace
 * `id`, whose folder is `path`: a Claude Code or pi process started in its
 * copy (every session there runs in its boundary), one in its view's mount
 * namespace for a Linux view (layer.ts `inView`), or, for a place (a
 * person's own folder, where the person's own sessions run on the
 * host), one launched with the place's hook. A sleeping session has no
 * process. Read off the keepers, so it holds for a CLI this agent has not
 * adopted yet.
 */
export const attachedIn = (
  id: string,
  path: string,
  procs: readonly HeldProc[],
  commands: Commands
): boolean => attachedProcs(id, path, procs, commands).length > 0;

/** The session processes {@link attachedIn} counts in workspace `id`. */
export const attachedProcs = (
  id: string,
  path: string,
  procs: readonly HeldProc[],
  commands: Commands
): HeldProc[] => {
  const hook = `'${join(stateDir(id), "hook")}'`;
  return procs.filter((proc) => {
    if (!(proc.alive && sessionOfProc(proc.procId))) {
      return false;
    }
    if (isPlace(id)) {
      return commands.byPid.get(proc.pid)?.includes(hook) ?? false;
    }
    // A Linux view's path is the person's folder, where their own sessions
    // and every other view's run too: its sessions are those in its view.
    if (overlaySync(id)) {
      return inView(id, proc.pid);
    }
    // A path that is no folder of the workspace's own names the person's
    // (a view whose layer is gone, or one never made): nothing is in it.
    return (
      ownFolderSync(id, path) &&
      proc.cwd !== undefined &&
      (proc.cwd === path || proc.cwd.startsWith(`${path}/`))
    );
  });
};

/** Whether a session's process is attached in workspace `id` or a command is on its way into it: the start's own test, before the hub or the sessions are heard (control.ts `rearmHooks`). */
export const inUse = (
  id: string,
  path: string,
  procs: readonly HeldProc[],
  commands: Commands
): boolean =>
  attachedIn(id, path, procs, commands) ||
  executors(commands.lines, id).length > 0;

/**
 * Why workspace `id`'s boundary must run now, in words; nothing when nothing
 * holds it. THE list of what holds a boundary:
 *
 *  - it is starting;
 *  - a session that may run a command there is attached: carried by this
 *    agent with its commands bounded there, or its process held by a keeper
 *    ({@link attachedIn}); a session asleep is not;
 *  - a work item there is live, as the hub says;
 *  - a preview this agent serves names a port in it;
 *  - a command is on its way in or running ({@link executors}).
 */
export const liveWhy = (
  id: string,
  path: string,
  facts: LiveFacts
): string | undefined => {
  if (isStarting(id)) {
    return "its boundary is starting";
  }
  if (
    facts.sessions.has(id) ||
    attachedIn(id, path, facts.procs, facts.commands)
  ) {
    return "a session there is attached";
  }
  if (facts.hub.has(id)) {
    return "a work item there is live";
  }
  if (facts.previews.has(id)) {
    return "a preview shows a server in it";
  }
  if (executors(facts.commands.lines, id).length > 0) {
    return "a command runs in it";
  }
};

/** Whether workspace `id`'s boundary was ensured or seen held within {@link QUIET_CLOSE_MS}. */
export const recentlyHeld = (id: string): boolean =>
  Date.now() - (liveAt.get(id) ?? 0) < QUIET_CLOSE_MS;

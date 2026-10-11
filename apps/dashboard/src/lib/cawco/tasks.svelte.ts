/**
 * What a session has planned, read off the machine it runs on.
 *
 * The machine answers for the session's harness (`getTodos`): Claude Code's
 * task list, one small JSON file per task in the session's own config dir
 * (its account's, as its row names it), and OpenCode's todo list. The
 * transcript's `TaskCreate`/`TaskUpdate` calls are not read: they say *that*
 * the plan moved, never what it now says, so they mark a view stale and the
 * disk answers the question again. Files-as-truth (NEW.md §1) — cawco stores
 * none of this.
 */
import type { HarnessKind, NeutralTask } from "@cawco/core";
import { browser } from "$app/env";
import { cawco, machineControl } from "./client.svelte";

export type SessionTask = NeutralTask;

export interface TaskSnapshot {
  /** The machine could not be asked at all. A session with no ledger is not this. */
  failed?: boolean;
  fetchedAt: number;
  loading: boolean;
  tasks: SessionTask[];
}

/**
 * The two calls that write the ledger. `TaskGet` and `TaskList` only read it,
 * so they change nothing and stay ordinary tool calls in the transcript.
 */
export const TASK_LEDGER_TOOLS = new Set(["TaskCreate", "TaskUpdate"]);

// Module scope, so the header pill, the board row and the peek pane are all
// reading one answer per session rather than each fetching their own.
const snapshots = $state<Record<string, TaskSnapshot>>({});

/** This session's ledger as it was last read, or nothing if it never was. */
export const tasksOf = (viewId: string): TaskSnapshot | null =>
  snapshots[viewId] ?? null;

/** A turn's worth of `TaskUpdate`s arrives as a burst; read the directory once. */
const DEBOUNCE_MS = 300;
/** How long a reading stands before a plain refresh asks the machine again. */
const FRESH_MS = 5000;

const scheduled = new Map<string, ReturnType<typeof setTimeout>>();
const running = new Map<string, Promise<void>>();
/** Views whose ledger is known to have moved: they skip the freshness guard. */
const stale = new Set<string>();

/** Reads the ledger, unless one read recently enough is already on screen. */
export function refreshTasks(viewId: string): void {
  if (!browser || scheduled.has(viewId)) {
    return;
  }
  scheduled.set(
    viewId,
    setTimeout(() => {
      scheduled.delete(viewId);
      // biome-ignore lint/complexity/noVoid: fire-and-forget by intent — refreshTasks is a sync scheduling API, nothing here awaits the read.
      void read(viewId);
    }, DEBOUNCE_MS)
  );
}

/** Says the ledger changed under us — the next read happens whatever its age. */
export function invalidateTasks(viewId: string): void {
  stale.add(viewId);
  refreshTasks(viewId);
}

// biome-ignore lint/suspicious/useAwait: async is load-bearing here — the early `return;`/`return inflight;`/`return work;` branches mix a bare undefined with promises, which only typechecks against Promise<void> because async auto-wraps it.
async function read(viewId: string): Promise<void> {
  // A read already out is the answer to this one too.
  const inflight = running.get(viewId);
  if (inflight) {
    return inflight;
  }

  // A board row's session has never been opened, so it has no view state — but
  // the registry already knows which machine it runs on and which SDK session
  // it is writing, which is all the ledger is filed under.
  const session = cawco.session(viewId);
  const row = cawco.instanceIndex.byId.get(viewId);
  const machineId = session?.machineId || row?.machineId;
  const sessionId = session?.sessionId || row?.sessionId;
  const harness = (session?.harness ??
    (row?.harness as HarnessKind | null | undefined) ??
    "claude") as HarnessKind;
  const cwd = session?.cwd || row?.cwd;
  const accountId = row?.accountId ?? null;
  if (!(machineId && sessionId)) {
    return;
  }

  const invalidated = stale.delete(viewId);
  const current = snapshots[viewId];
  if (!invalidated && current && Date.now() - current.fetchedAt < FRESH_MS) {
    return;
  }

  const work = fetchLedger(viewId, machineId, sessionId, harness, {
    cwd,
    accountId,
  }).finally(() => {
    running.delete(viewId);
    // An edit that landed mid-read was answered by a listing taken before it,
    // so the ledger this just published is already one revision behind.
    if (stale.has(viewId)) {
      refreshTasks(viewId);
    }
  });
  running.set(viewId, work);
  return work;
}

async function fetchLedger(
  viewId: string,
  machineId: string,
  sessionId: string,
  harness: HarnessKind,
  where: { accountId: string | null; cwd?: string }
): Promise<void> {
  snapshots[viewId] = {
    tasks: snapshots[viewId]?.tasks ?? [],
    fetchedAt: 0,
    loading: true,
  };

  // pi keeps no plan.
  if (harness === "pi") {
    publish(viewId, []);
    return;
  }
  try {
    publish(
      viewId,
      await machineControl<SessionTask[]>(
        machineId,
        "getTodos",
        [sessionId, where.cwd || undefined, where.accountId],
        undefined,
        harness
      )
    );
  } catch {
    // Nothing was answered, so nothing is known — which is not the same as
    // knowing there are no tasks, and the surface stays away either way.
    publish(viewId, [], true);
  }
}

function publish(viewId: string, tasks: SessionTask[], failed?: boolean): void {
  snapshots[viewId] = { tasks, fetchedAt: Date.now(), loading: false, failed };
}

/** How far the plan has got, and what it is on. */
export function taskProgress(snapshot: TaskSnapshot): {
  done: number;
  total: number;
  current: SessionTask | null;
} {
  return {
    done: snapshot.tasks.filter((task) => task.status === "completed").length,
    total: snapshot.tasks.length,
    current:
      snapshot.tasks.find((task) => task.status === "in_progress") ?? null,
  };
}

/**
 * The task standing in this one's way, if one still is. A blocker that has
 * left the ledger was deleted, and work nobody has to do blocks nothing.
 */
export function blockerOf(
  task: SessionTask,
  tasks: SessionTask[]
): string | null {
  if (task.status === "completed") {
    return null;
  }

  return (
    task.blockedBy.find((id) =>
      tasks.some((other) => other.id === id && other.status !== "completed")
    ) ?? null
  );
}

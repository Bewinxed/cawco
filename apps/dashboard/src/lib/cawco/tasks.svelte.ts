/**
 * What a session has planned, read off the machine it runs on.
 *
 * Claude Code keeps every session's ledger as one small JSON file per task
 * under `<home>/.claude/tasks/<sessionId>/`, and that directory is the only
 * thing parsed here. The transcript's `TaskCreate`/`TaskUpdate` calls are not:
 * they say *that* the plan moved, never what it now says, so they mark a view
 * stale and the disk answers the question again. Files-as-truth (NEW.md §1) —
 * cawco stores none of this.
 */
import type { FsEntry, HarnessKind } from "@cawco/core";
import { browser } from "$app/env";
import { cawco, machineControl, machineFs } from "./client.svelte";

export interface SessionTask {
  activeForm?: string;
  blockedBy: string[];
  blocks: string[];
  description?: string;
  id: string;
  owner?: string;
  status: "pending" | "in_progress" | "completed";
  subject: string;
}

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
  if (!(machineId && sessionId)) {
    return;
  }

  const invalidated = stale.delete(viewId);
  const current = snapshots[viewId];
  if (!invalidated && current && Date.now() - current.fetchedAt < FRESH_MS) {
    return;
  }

  const work = fetchLedger(viewId, machineId, sessionId, harness, cwd).finally(
    () => {
      running.delete(viewId);
      // An edit that landed mid-read was answered by a listing taken before it,
      // so the ledger this just published is already one revision behind.
      if (stale.has(viewId)) {
        refreshTasks(viewId);
      }
    }
  );
  running.set(viewId, work);
  return work;
}

async function fetchLedger(
  viewId: string,
  machineId: string,
  sessionId: string,
  harness: HarnessKind,
  cwd?: string
): Promise<void> {
  snapshots[viewId] = {
    tasks: snapshots[viewId]?.tasks ?? [],
    fetchedAt: 0,
    loading: true,
  };

  // opencode keeps its plan in a native `todo` list on the server; pi has none.
  if (harness === "opencode") {
    try {
      const tasks = await machineControl<SessionTask[]>(
        machineId,
        "getTodos",
        [sessionId, cwd || undefined],
        undefined,
        harness
      );
      publish(viewId, tasks);
    } catch {
      publish(viewId, []);
    }
    return;
  }
  if (harness === "pi") {
    publish(viewId, []);
    return;
  }

  const home = await homeOf(machineId);
  // Nothing was asked of the machine, so nothing is known — which is not the
  // same as knowing there are no tasks, and the surface stays away either way.
  if (!home) {
    publish(viewId, [], true);
    return;
  }

  const dir = `${home}/.claude/tasks/${sessionId}`;
  let entries: FsEntry[];
  try {
    entries = await machineFs<FsEntry[]>(machineId, "list", dir);
  } catch {
    // A session that has never written a task has no directory. The daemon
    // reports that the way it reports anything else, and both mean "no plan".
    publish(viewId, []);
    return;
  }

  const files = entries.filter(
    (entry) => entry.kind === "file" && entry.name.endsWith(".json")
  );
  const parsed = await Promise.all(
    files.map(async (file) => {
      try {
        return parseTask(
          await machineFs<string>(machineId, "read", `${dir}/${file.name}`)
        );
      } catch {
        // One unreadable or half-written file is not a reason to lose the plan.
        return null;
      }
    })
  );

  publish(
    viewId,
    parsed
      .filter((task): task is SessionTask => task !== null)
      .sort((a, b) => Number(a.id) - Number(b.id))
  );
}

function publish(viewId: string, tasks: SessionTask[], failed?: boolean): void {
  snapshots[viewId] = { tasks, fetchedAt: Date.now(), loading: false, failed };
}

function parseTask(text: string): SessionTask | null {
  const raw = JSON.parse(text) as Partial<SessionTask>;
  if (typeof raw.id !== "string" || typeof raw.subject !== "string") {
    return null;
  }
  return {
    id: raw.id,
    subject: raw.subject,
    description: raw.description,
    activeForm: raw.activeForm,
    status:
      raw.status === "in_progress" || raw.status === "completed"
        ? raw.status
        : "pending",
    owner: raw.owner,
    blocks: raw.blocks ?? [],
    blockedBy: raw.blockedBy ?? [],
  };
}

const HOME_KEY = "cawco-machine-home";

/** `/home/<user>` or `/Users/<user>` — the prefix every path on a machine shares. */
const HOME_PREFIX = /^(\/(?:home|Users)\/[^/]+)/;

/** Directories that sit beside a home in `/home` or `/Users` and are not one. */
const NOT_A_HOME = new Set(["Shared", "lost+found"]);

// debt: the daemon register payload should carry `home`; delete this heuristic then.
const homes = new Map<string, string>(Object.entries(readHomeCache()));
const probes = new Map<string, Promise<string | null>>();

function readHomeCache(): Record<string, string> {
  if (!browser) {
    return {};
  }
  try {
    const stored = JSON.parse(
      localStorage.getItem(HOME_KEY) ?? "{}"
    ) as unknown;

    return stored && typeof stored === "object"
      ? (stored as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

function remember(machineId: string, home: string): string {
  homes.set(machineId, home);
  if (browser) {
    localStorage.setItem(HOME_KEY, JSON.stringify(Object.fromEntries(homes)));
  }
  return home;
}

/**
 * Where this machine's `.claude` lives. Cheapest first: what was resolved
 * before, then the machine's own working directories — a session running in
 * `/home/x/repo` has already said what the home is — and only then a listing.
 *
 * Exported because everything that reads a machine's `.claude` needs the same
 * answer, and a second copy of this heuristic would be a second cache to go
 * stale differently.
 */
// biome-ignore lint/suspicious/useAwait: async is load-bearing here — the early `return known;`/`return remember(...)` branches return a bare value that only typechecks against Promise<string | null> because async auto-wraps it.
export async function homeOf(machineId: string): Promise<string | null> {
  const known = homes.get(machineId);
  if (known) {
    return known;
  }

  const guessed = guessHome(machineId);
  if (guessed) {
    return remember(machineId, guessed);
  }

  const probing = probes.get(machineId);
  if (probing) {
    return probing;
  }
  const probe = probeHome(machineId).finally(() => probes.delete(machineId));
  probes.set(machineId, probe);
  return probe;
}

function guessHome(machineId: string): string | null {
  const cwds = [
    ...cawco.instances
      .filter((row) => row.machineId === machineId)
      .map((row) => row.cwd),
    ...cawco.catalogOf(machineId).map((info) => info.cwd ?? ""),
  ];
  for (const cwd of cwds) {
    const match = HOME_PREFIX.exec(cwd);
    if (match) {
      return match[1];
    }
  }
  return null;
}

async function probeHome(machineId: string): Promise<string | null> {
  const os =
    cawco.machines.find((machine) => machine.machineId === machineId)?.os ?? "";
  const root = os.startsWith("darwin") ? "/Users" : "/home";
  try {
    const entries = await machineFs<FsEntry[]>(machineId, "list", root);
    const candidates = entries.filter(
      (entry) =>
        entry.kind === "dir" &&
        !entry.name.startsWith(".") &&
        !NOT_A_HOME.has(entry.name)
    );
    // Two accounts and the answer is a coin toss, so the ledger goes unread
    // rather than read out of somebody else's home.
    if (candidates.length !== 1) {
      return null;
    }
    return remember(machineId, `${root}/${candidates[0].name}`);
  } catch {
    return null;
  }
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

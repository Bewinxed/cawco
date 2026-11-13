/**
 * The board: the hub's machines and every session it knows, as its
 * snapshot and deltas hand them on, each row also held by its id and by its
 * session key so a reader of one row wakes for that row alone; and each
 * session's pulse, the daemon's now-state. What is live, listed or stale is
 * read off a row's status here.
 */

import { machineLabel } from "@cawco/core/machine-names";
import type {
  AgentRow,
  BuildInfo,
  InstanceRow,
  SessionPulse,
} from "@cawco/core/protocol";
import { page as servedPage } from "$app/state";
import { Keyed, Pulse, type PulseReading } from "../board.svelte";
import { type FleetFault, fleetFaults } from "../convergence";
import { connectionState } from "../hub/socket.svelte";
import { isLive } from "../landing";
import type { BoardRow, InstanceIndex } from "../links";
import type { ProjectRow } from "../projects";
import type { Area, MachineVerdict, ServedBoard } from "../served-board";
import { keepsLast, patchRows, reconcileRows } from "./same";

/** A machine from the hub registry (`GET /api/agents`, and `instances` frames). */
export type Machine = AgentRow;

/**
 * A session that stays on the board until the operator discards it: live work,
 * a real failure to look at, a nap to wake from, one the operator stopped, or
 * a row the hub simply cannot currently ask about — `unknown` is never dropped
 * just because its machine went quiet, the same way it is never rendered as
 * though nothing were wrong (see {@link isStale}). Only `discarded` is off
 * the board. `stopped` was left out here by omission, not by rule: a session
 * stopped from its row's menu then stood in no list at all, its menu and its
 * transcript out of reach. It has ended, so it is listed as ended sessions
 * are (Finished until seen, Recent, its project's tree). A `stopping` one has
 * ended too, its machine yet to confirm the process gone, and is listed so.
 */
const isListed = (row: BoardRow): boolean =>
  isLive(row) ||
  row.status === "error" ||
  row.status === "sleeping" ||
  row.status === "stopping" ||
  row.status === "stopped" ||
  row.status === "unknown";

/**
 * A session whose owning machine the hub cannot currently reach — the
 * presence overlay's value (`withSessionPresence`, ARCHITECTURE.md), not a
 * guess of our own. It may still be running, sleeping, or gone on that
 * machine; the hub genuinely does not know, which is a different claim from
 * every other status and must never be flattened into "idle".
 */
export const isStale = (row: BoardRow): boolean => row.status === "unknown";

/**
 * A session whose process is gone but whose conversation is not: sleeping, not
 * failed. Exactly the rows a send wakes (the hub's `wakeForSend`) — dead, with an
 * SDK session to resume from. `sleeping` is the taxonomy's own word for this
 * now (ARCHITECTURE.md's status table) — the hub never reports it any other
 * way, so this reads the status directly rather than inferring it from
 * `lastError`. A `stopped` row with a session id is the other resumable case:
 * deliberately ended, but nothing stops it being picked back up; so is a
 * `stopping` one, whose resume replaces the process its machine is ending.
 */
export const isResumable = (row: BoardRow): boolean =>
  row.status === "sleeping" ||
  ((row.status === "stopping" || row.status === "stopped") &&
    Boolean(row.sessionId));

/**
 * A session that died of something, and is not coming back by being opened.
 * `error` now means exactly that — the taxonomy requires `lastError` to be set
 * whenever the hub asserts it — so there is no longer a resumable marker to
 * carve back out of it.
 */
export const isFailed = (row: BoardRow): boolean => row.status === "error";

/**
 * Every instance the hub knows, in the hub's order, as immutable rows
 * replaced whole — never edited in place. Raw state: the fleet is ~two
 * thousand rows, and a deep proxy made every field read of every row a
 * tracked signal. A walk over the board reads this; a row asked for by its
 * id is read from {@link rowsById}, which wakes on that row alone.
 */
let hubRows = $state.raw<InstanceRow[]>([]);

/**
 * The board as this page's server load read it for its first paint
 * (first-paint.ts): the hub's rows, their pulses, the machines, the projects
 * and their areas, read in the request that rendered the page, each cut to
 * what the first paint reads. The stores draw from it until their own reads
 * land: the rows, pulses and machines until the socket's first snapshot
 * ({@link servedLive}), the projects until their first read
 * (projects.svelte.ts), the areas until theirs (home/areas.svelte.ts). So
 * the server's HTML and the hydrated page draw the same lists from the first
 * paint, and none of them waits on the socket. Read during a render on the
 * server, as `page` is: the stores' own state is the client's alone. Null
 * where the server could not read the hub whole.
 */
export function servedBoard(): ServedBoard<ProjectRow> | null {
  return (
    (servedPage.data as { board?: ServedBoard<ProjectRow> | null }).board ??
    null
  );
}

/** The served board while the socket's first snapshot is not in: its rows, pulses and machines are the ones drawn. */
const servedLive = (): ServedBoard<ProjectRow> | null =>
  boardState.liveRead ? null : servedBoard();

/** The served rows (the board's, then the older ones its stored list holds) looked up by id and by session, built once per board (on the server, once per request). */
const servedIndexes = new WeakMap<
  ServedBoard<ProjectRow>,
  InstanceIndex<InstanceRow>
>();
function servedIndex(
  board: ServedBoard<ProjectRow>
): InstanceIndex<InstanceRow> {
  const held = servedIndexes.get(board);
  if (held) {
    return held;
  }
  const rows = [...board.instances, ...board.stored.rows];
  const byId = new Map<string, InstanceRow>();
  const bySession = new Map<string, InstanceRow[]>();
  for (const row of rows) {
    byId.set(row.id, row);
    if (row.sessionId) {
      bySession.set(row.sessionId, [
        ...(bySession.get(row.sessionId) ?? []),
        row,
      ]);
    }
  }
  const index = { byId, bySession };
  servedIndexes.set(board, index);
  return index;
}

/** The hub's rows, as every walk over the rows reads them: the served board's until the socket's first snapshot ({@link servedLive}). */
const instances = $derived<InstanceRow[]>(servedLive()?.instances ?? hubRows);

/** Each hub row by its id, each key its own signal (board.svelte.ts). */
const rowsById = new Keyed<InstanceRow>();

/** Each session key's rows, by key, the same way. */
const rowsBySession = new Keyed<readonly InstanceRow[]>();

/**
 * The sessions behind the machines' stored transcripts that the board no
 * longer lists (the hub's `stored` frame, {@link holdOlderRows}): held by id
 * and by session beside the board's rows, so everything that reads a session
 * by its id reads these as it reads a listed one, and in no list of the
 * board's ({@link instances}).
 */
let olderRows = $state.raw<InstanceRow[]>([]);
/** The hub's first `stored` frame is in: until it is, the served board's older rows are drawn. */
let olderHeard = $state(false);

/**
 * The hub's rows as `next` has them: each row that moved (`moved`) and each
 * gone (`gone`) written to the keyed store, key by key, so a delta wakes
 * only the readers of the rows it carried; then the list itself.
 */
function holdRows(
  next: InstanceRow[],
  moved: readonly InstanceRow[],
  gone: readonly string[]
): void {
  for (const id of gone) {
    const was = rowsById.get(id);
    if (was) {
      leaveSession(was);
      rowsById.delete(id);
    }
  }
  for (const row of moved) {
    const was = rowsById.get(row.id);
    if (was === row) {
      continue;
    }
    if (was) {
      leaveSession(was);
    }
    rowsById.set(row.id, row);
    joinSession(row);
  }
  hubRows = next;
  // The board's word on a session is the newest: a row it lists now is no
  // older one.
  const listed = new Set(moved.map((row) => row.id));
  if (olderRows.some((row) => listed.has(row.id))) {
    olderRows = olderRows.filter((row) => !listed.has(row.id));
  }
}

/**
 * The sessions behind the stored transcripts as the hub's `stored` frame
 * has them: each older session into the index, each one it no longer holds
 * out of it. A row the board lists is the board's. The rows it moved, or
 * null when none did.
 */
export function holdOlderRows(rows: readonly InstanceRow[]): RowsMoved | null {
  olderHeard = true;
  const listed = new Set(hubRows.map((row) => row.id));
  const next = reconcileRows(
    olderRows,
    rows.filter((row) => !listed.has(row.id)),
    (row) => row.id
  );
  if (next === olderRows) {
    return null;
  }
  const kept = new Set(next);
  const gone: string[] = [];
  for (const row of olderRows) {
    if (!kept.has(row) && rowsById.get(row.id) === row) {
      leaveSession(row);
      rowsById.delete(row.id);
      gone.push(row.id);
    }
  }
  const moved: InstanceRow[] = [];
  for (const row of next) {
    if (rowsById.get(row.id) !== row) {
      rowsById.set(row.id, row);
      joinSession(row);
      moved.push(row);
    }
  }
  olderRows = next;
  return { moved, gone };
}

/** The rows a change to the board moved, and the ids of those it took off. */
export interface RowsMoved {
  gone: readonly string[];
  moved: readonly InstanceRow[];
}

/** The board's rows as the hub's snapshot has them; null when none moved. */
export function adoptRows(rows: InstanceRow[]): RowsMoved | null {
  const next = reconcileRows(hubRows, rows, (row) => row.id);
  if (next === hubRows) {
    return null;
  }
  const present = new Set(next.map((row) => row.id));
  const held = {
    moved: next,
    gone: hubRows.filter((row) => !present.has(row.id)).map((row) => row.id),
  };
  holdRows(next, held.moved, held.gone);
  return held;
}

/** The board's rows as a delta moves them; null when none moved. */
export function patchBoardRows(
  upserts: InstanceRow[],
  removed: string[]
): RowsMoved | null {
  const next = patchRows(hubRows, upserts, removed, (row) => row.id);
  if (next === hubRows) {
    return null;
  }
  // The rows as `next` holds them: an upsert equal to the row held keeps it.
  const upserted = new Set(upserts.map((row) => row.id));
  const held = {
    moved: next.filter((row) => upserted.has(row.id)),
    gone: removed,
  };
  holdRows(next, held.moved, held.gone);
  return held;
}

/** A row out of its session key's rows. */
function leaveSession(row: InstanceRow): void {
  if (!row.sessionId) {
    return;
  }
  const rest = (rowsBySession.get(row.sessionId) ?? []).filter(
    (one) => one.id !== row.id
  );
  if (rest.length > 0) {
    rowsBySession.set(row.sessionId, rest);
  } else {
    rowsBySession.delete(row.sessionId);
  }
}

/** A row into its session key's rows. */
function joinSession(row: InstanceRow): void {
  if (row.sessionId) {
    rowsBySession.set(row.sessionId, [
      ...(rowsBySession.get(row.sessionId) ?? []),
      row,
    ]);
  }
}

/**
 * The rows looked up by id and by session: one object for good, each
 * lookup a keyed read ({@link rowsById}, {@link rowsBySession}), the
 * served board's until the socket's first snapshot. Rebuilt whole on every
 * change, it woke every reader of every row.
 */
export const instanceIndex: InstanceIndex<BoardRow> = {
  get byId(): ReadonlyMap<string, BoardRow> {
    const served = servedLive();
    return served ? servedIndex(served).byId : rowsById;
  },
  get bySession(): ReadonlyMap<string, readonly BoardRow[]> {
    const served = servedLive();
    return served ? servedIndex(served).bySession : rowsBySession;
  },
};

/** One hub row by its id, as {@link instanceIndex} draws it. */
export const rowById = (id: string): InstanceRow | undefined => {
  const served = servedLive();
  return served ? servedIndex(served).byId.get(id) : rowsById.get(id);
};

/** The machines as drawn: the served board's until the socket's first snapshot. */
const machinesNow = (): Machine[] =>
  servedLive()?.machines ?? boardState.machines;

const runningInstances = $derived.by(keepsLast(() => instances.filter(isLive)));

const listedInstances = $derived.by(
  keepsLast(() => instances.filter(isListed))
);

/** `listedInstances` by id, built once per change for every list that walks their trees. */
const listedById = $derived(
  new Map(listedInstances.map((row) => [row.id, row] as const))
);

const staleInstances = $derived.by(keepsLast(() => instances.filter(isStale)));

export const boardState = $state({
  /** The board's snapshot and the first read of the projects after it are in. */
  fleetRead: false,
  machines: [] as Machine[],
  /**
   * What the hub itself is running, carried on `instances` frames (C2 reads
   * it against every machine's own {@link Machine.build} — a hub older than
   * this field simply never sends it, and the comparison has nothing to say).
   */
  hubBuild: undefined as BuildInfo | undefined,
  /**
   * The socket's first full `instances` frame has landed: the hub's own
   * now-state (pulses) for every session is in, so "nothing is working" can
   * be believed. The REST read alone cannot say what is mid-turn.
   */
  liveRead: false,
});

/** Mainline sessions the rail lists for one machine: live work and what stopped. */
const listedOn = (machineId: string): InstanceRow[] =>
  instances.filter(
    (row) =>
      row.machineId === machineId && isListed(row) && row.kind !== "scratch"
  );

/**
 * A session's pulse, the daemon's now-state: the store's, seeded by the
 * socket's first `instances` frame and moved by each `pulse` frame after.
 * Until that first frame, the served board's ({@link ServedBoard}), so the
 * server's HTML and the hydrated page draw a working session working from
 * the first paint: without them a tab the browser follows no stream of
 * read quiet until the socket answered (tab-strip's reload trace
 * `--- wqq www`).
 */
export function pulseOf(instanceId: string): PulseReading | undefined {
  return heldPulse(instanceId) ?? servedLive()?.pulses[instanceId];
}

/**
 * Each instance's coarse now-state, pushed by the daemon ~1/sec (broadcast).
 * The rail reads this for sessions it has not subscribed to — the ones whose
 * frame-fed {@link SessionState} is either absent or frozen at the last frame
 * before the tab closed. Each a {@link Pulse}, a signal per field, so a
 * pulse wakes what reads the fields it moved.
 */
export const pulses = new Map<string, Pulse>();

/**
 * Moved when a session pulses for the first time: what every read of a
 * session with no pulse yet waits on. Most of the board never pulses (it
 * sleeps), and a list ordered by when each row last moved reads them all.
 */
let pulsesAdded = $state(0);

/** The store's pulse for a session, read so its reader wakes when one first comes. */
function heldPulse(instanceId: string): Pulse | undefined {
  const held = pulses.get(instanceId);
  return held || pulsesAdded < 0 ? held : undefined;
}

/**
 * Takes a session's pulse at least as new as the one held: into its
 * {@link Pulse}, each field only when it moved, or as its first.
 */
export function takePulse(instanceId: string, pulse: SessionPulse): void {
  const held = pulses.get(instanceId);
  if (held) {
    held.take(pulse);
  } else {
    pulses.set(instanceId, new Pulse(pulse));
    pulsesAdded += 1;
  }
}

/**
 * The hub's machines as `incoming` has them, each one equal to the one held
 * kept as it was. Whether any moved.
 */
export function holdMachines(incoming: Machine[]): boolean {
  const next = reconcileRows(
    boardState.machines,
    incoming,
    (row) => row.machineId
  );
  if (next === boardState.machines) {
    return false;
  }
  boardState.machines = next;
  return true;
}

/**
 * Whether the dashboard may ask `machineId` anything now: the one presence
 * every ask to a machine goes through. The hub is reached and its board on
 * this socket is in (`hubReached`), and that board says the machine is online,
 * which the hub derives from holding the machine's socket right now (server.ts
 * `withPresence`), the same test it routes by. Across a hub restart the page
 * is back before its machines are, and nothing is asked of them until the hub
 * says each one is back.
 */
export function machineConnected(machineId: string): boolean {
  return (
    connectionState.status === "connected" &&
    boardState.machines.some(
      (machine) =>
        machine.machineId === machineId && machine.status === "online"
    )
  );
}

/** A machine as the fleet list names it (its label), else its id. */
export function machineName(machineId: string): string {
  const hostname = machinesNow().find(
    (row) => row.machineId === machineId
  )?.hostname;
  return hostname ? machineLabel(hostname) : machineId;
}

/** The board: every machine and session the hub knows, each row read on its own, and each session's pulse. */
export const boardStore = {
  /** The board's snapshot and the first read of the projects after it are in. */
  get fleetRead() {
    return boardState.fleetRead;
  },
  /** The socket's first full snapshot, pulses included, is in. */
  get liveRead() {
    return boardState.liveRead;
  },
  /**
   * The board is in hand: the rows, machines and projects as the server
   * read them for this page ({@link ServedBoard}), or the store's own first
   * read of them. What the lists draw from; it only rises.
   */
  get boardRead(): boolean {
    return boardState.fleetRead || servedBoard() !== null;
  },
  /** The areas as the server read them for this page; null where it could not. */
  get servedAreas(): Area[] | null {
    return servedBoard()?.areas ?? null;
  },
  get machines(): Machine[] {
    return machinesNow();
  },
  /** What the hub is running; `undefined` until its first frame. */
  get hubBuild() {
    return boardState.hubBuild;
  },
  /** What the served board says is wrong with a machine (machine-verdict.ts), until the socket's first snapshot; null after it. */
  servedVerdictOf(machineId: string): MachineVerdict | null {
    return (
      servedLive()?.machines.find((one) => one.machineId === machineId)
        ?.verdict ?? null
    );
  },
  /**
   * A machine's fleet items that didn't set up, as its fault lines read
   * them: the served board's until the socket's first snapshot, then its
   * row's own (`fleetItems`).
   */
  fleetFaultsOf(machineId: string): FleetFault[] {
    const served = servedLive();
    if (served) {
      return (
        served.machines.find((one) => one.machineId === machineId)
          ?.fleetFaults ?? []
      );
    }
    return fleetFaults(
      boardState.machines.find((one) => one.machineId === machineId)?.fleetItems
    );
  },
  get onlineMachines() {
    return machinesNow().filter((machine) => machine.status === "online");
  },
  get instances() {
    return instances;
  },
  /** One hub row by its id, read on its own: it wakes when that row moves, and no other. */
  rowOf: (instanceId: string): InstanceRow | undefined => rowById(instanceId),
  /** Whether the hub still reaches this session (one of `runningInstances`), read off its own row. */
  liveId: (instanceId: string): boolean => {
    const row = rowById(instanceId);
    return row !== undefined && isLive(row);
  },
  get instanceIndex() {
    return instanceIndex;
  },
  get runningInstances() {
    return runningInstances;
  },
  /** The listed rows by id: one map for every list that walks their trees (the rail's, Recent's). */
  get listedById(): ReadonlyMap<string, BoardRow> {
    return listedById;
  },
  /** Sessions the hub lost track of — shown apart, never as live work. */
  get staleInstances(): InstanceRow[] {
    return staleInstances;
  },
  /** The ones the hub can still reach: what this machine is doing right now. */
  liveOn: (machineId: string): InstanceRow[] =>
    listedOn(machineId).filter(isLive),
  /** Every session the rail lists: live work, plus what failed or fell asleep. */
  get listedInstances(): InstanceRow[] {
    return listedInstances;
  },
  /**
   * The sessions behind stored transcripts that the board no longer lists
   * (the hub's `StoredRecent`): the person's own, and what nests under
   * them. Recent lists them beside {@link listedInstances}.
   */
  get olderInstances(): InstanceRow[] {
    return olderHeard ? olderRows : (servedBoard()?.stored.rows ?? olderRows);
  },
  /**
   * When the daemon last pulsed a session, ms epoch — the freshest signal a
   * rail has for an unsubscribed session, since the pulse is broadcast for
   * every session while its transcript frames only flow to a watcher.
   */
  pulseAt: (instanceId: string): number | undefined => pulseOf(instanceId)?.at,
  /** When the session's current turn began, ms epoch; `undefined` while it is idle. */
  turnSince: (instanceId: string): number | undefined =>
    heldPulse(instanceId)?.since,
};

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
import { connectionState } from "../hub/socket.svelte";
import type { BoardRow, InstanceIndex } from "../links";
import { keepsLast, patchRows, reconcileRows } from "./same";

/** A machine from the hub registry (`GET /api/agents`, and `instances` frames). */
export type Machine = AgentRow;

/**
 * Only a session the hub can still reach is live; the rest is history. A
 * session its project is moving for (`moving`) is live work the hub carries.
 */
const isLive = (row: BoardRow): boolean =>
  row.status === "running" ||
  row.status === "starting" ||
  row.status === "moving";

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

/** The hub's rows, as every walk over the rows reads them. */
const instances = $derived(hubRows);

/** Each hub row by its id, each key its own signal (board.svelte.ts). */
export const rowsById = new Keyed<InstanceRow>();

/** Each session key's rows, by key, the same way. */
const rowsBySession = new Keyed<readonly InstanceRow[]>();

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
 * lookup a keyed read ({@link rowsById}, {@link rowsBySession}). Rebuilt
 * whole on every change, it woke every reader of every row.
 */
export const instanceIndex: InstanceIndex<BoardRow> = {
  byId: rowsById,
  bySession: rowsBySession,
};

const runningInstances = $derived.by(keepsLast(() => instances.filter(isLive)));

const listedInstances = $derived.by(
  keepsLast(() => instances.filter(isListed))
);

/** `listedInstances` by id, built once per change for every list that walks their trees. */
const listedById = $derived(
  new Map(listedInstances.map((row) => [row.id, row] as const))
);

const staleInstances = $derived.by(keepsLast(() => instances.filter(isStale)));

export const boardState = $state<{
  /** The board's snapshot and the first read of the projects after it are in. */
  fleetRead: boolean;
  machines: Machine[];

  /**
   * What the hub itself is running, carried on `instances` frames (C2 reads
   * it against every machine's own {@link Machine.build} — a hub older than
   * this field simply never sends it, and the comparison has nothing to say).
   */
  hubBuild: BuildInfo | undefined;

  /**
   * The socket's first full `instances` frame has landed: the hub's own
   * now-state (pulses) for every session is in, so "nothing is working" can
   * be believed. The REST read alone cannot say what is mid-turn.
   */
  liveRead: boolean;
}>({
  fleetRead: false,
  machines: [],
  hubBuild: undefined,
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
 * Until that first frame, the hub's pulses as the layout's server load read
 * them for this page (`/api/pulses`), so the server's HTML and the hydrated
 * page draw a working session working from the first paint: without them a
 * tab the browser follows no stream of read quiet until the socket answered
 * (tab-strip's reload trace `--- wqq www`). Read during a render on the
 * server, as `page` (`servedPage`) is: the store's own state is the
 * client's alone.
 */
export function pulseOf(instanceId: string): PulseReading | undefined {
  const held = heldPulse(instanceId);
  if (held || boardState.liveRead) {
    return held;
  }
  return servedPage.data.pulses?.[instanceId];
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
 * kept as it was. The machines online before, or null when none moved.
 */
export function holdMachines(incoming: Machine[]): ReadonlySet<string> | null {
  const next = reconcileRows(
    boardState.machines,
    incoming,
    (row) => row.machineId
  );
  if (next === boardState.machines) {
    return null;
  }
  const wasOnline = new Set(
    boardState.machines
      .filter((machine) => machine.status === "online")
      .map((machine) => machine.machineId)
  );
  boardState.machines = next;
  return wasOnline;
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
  const hostname = boardState.machines.find(
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
  get machines() {
    return boardState.machines;
  },
  /** What the hub is running; `undefined` until its first frame. */
  get hubBuild() {
    return boardState.hubBuild;
  },
  get onlineMachines() {
    return boardState.machines.filter((machine) => machine.status === "online");
  },
  get instances() {
    return instances;
  },
  /** One hub row by its id, read on its own: it wakes when that row moves, and no other. */
  rowOf: (instanceId: string): InstanceRow | undefined =>
    rowsById.get(instanceId),
  /** Whether the hub still reaches this session (one of `runningInstances`), read off its own row. */
  liveId: (instanceId: string): boolean => {
    const row = rowsById.get(instanceId);
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
   * When the daemon last pulsed a session, ms epoch — the freshest signal a
   * rail has for an unsubscribed session, since the pulse is broadcast for
   * every session while its transcript frames only flow to a watcher.
   */
  pulseAt: (instanceId: string): number | undefined => pulseOf(instanceId)?.at,
  /** When the session's current turn began, ms epoch; `undefined` while it is idle. */
  turnSince: (instanceId: string): number | undefined =>
    heldPulse(instanceId)?.since,
};

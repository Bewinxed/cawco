/**
 * The board as the first paint draws it: what the (app) layout's server load
 * reads of the hub and hands the page as `board`, cut to the fields the first
 * paint reads (the sidebar's Recent and Projects, the bar's Machines, the
 * home, the tab strip). The store draws from it until its own reads land
 * (client.svelte.ts `servedBoard`); the socket's snapshot then brings every
 * row whole. Every field left out is optional on its row's type, so a served
 * row stands as one: what reads a field the first paint does not draw reads
 * it from the snapshot a moment later, as it did before rows were served.
 *
 * Built here, on the server, by key: a field the first paint starts reading
 * is added to its list.
 */
import type {
  InstanceRow,
  SessionPulse,
  StoredRecent,
} from "@cawco/core/protocol";
import type { Machine, ProjectRow } from "./client.svelte";
import type { Area } from "./home/areas.svelte";

/**
 * A session row's fields the first paint reads: where it is, its kind and
 * status, its titles, its place in its tree, and the stamps Recent orders,
 * groups, ages and marks it by. Every required field of `InstanceRow` is
 * here (the store's `instances` is typed so, and checks it).
 */
const ROW_KEYS = [
  "id",
  "machineId",
  "projectId",
  "sessionId",
  "harness",
  "cwd",
  "launchDir",
  "kind",
  "origin",
  "status",
  "title",
  "titleSource",
  "derivedTitle",
  "parentInstanceId",
  "continuedInto",
  "createdAt",
  "updatedAt",
  "turnEndedAt",
  "wroteAt",
  "seenAt",
  "doneAt",
  "wakesItself",
  "queuedSends",
  "runningDelegates",
  "stalled",
] as const satisfies readonly (keyof InstanceRow)[];

type FirstPaintRow = Pick<InstanceRow, (typeof ROW_KEYS)[number]>;

/**
 * A machine's fields the first paint reads: who and where it is, its status
 * and build, its pause, and the faults its row says (its update, its last
 * fleet change, what a workspace there lacks). Not its harnesses, its fleet
 * report or each fleet item's converge, the most of a machine's row.
 */
const MACHINE_KEYS = [
  "machineId",
  "hostname",
  "os",
  "status",
  "auth",
  "build",
  "home",
  "hostsHub",
  "lastSeenAt",
  "lostAt",
  "reconnectingUntil",
  "pausedUntil",
  "pauseStopped",
  "binaryUpdate",
  "fleetSync",
  "machineCapabilities",
] as const satisfies readonly (keyof Machine)[];

type FirstPaintMachine = Pick<Machine, (typeof MACHINE_KEYS)[number]>;

/** Recent's stored transcripts, the older sessions among them cut as every row is. */
interface FirstPaintStored extends Omit<StoredRecent, "rows"> {
  rows: FirstPaintRow[];
}

/** The board the first paint draws (the module's head). */
export interface ServedBoard {
  areas: Area[];
  instances: FirstPaintRow[];
  machines: FirstPaintMachine[];
  projects: ProjectRow[];
  pulses: Record<string, SessionPulse>;
  /** Recent's stored transcripts as the hub keeps them, drawn until its first `stored` frame. */
  stored: FirstPaintStored;
}

/** `row` with only `keys`, each one it has. */
function cut<T extends object, K extends keyof T>(
  row: T,
  keys: readonly K[]
): Pick<T, K> {
  const out: Partial<Pick<T, K>> = {};
  for (const key of keys) {
    if (key in row) {
      out[key] = row[key];
    }
  }
  return out as Pick<T, K>;
}

const firstPaintRow = (row: InstanceRow): FirstPaintRow => cut(row, ROW_KEYS);

/** The board the first paint draws, from the hub's whole reads of it. */
export function servedBoardOf(read: {
  areas: Area[];
  instances: InstanceRow[];
  machines: Machine[];
  projects: ProjectRow[];
  pulses: Record<string, SessionPulse>;
  stored: StoredRecent;
}): ServedBoard {
  return {
    areas: read.areas,
    instances: read.instances.map(firstPaintRow),
    machines: read.machines.map((machine) => cut(machine, MACHINE_KEYS)),
    projects: read.projects,
    pulses: read.pulses,
    stored: { ...read.stored, rows: read.stored.rows.map(firstPaintRow) },
  };
}

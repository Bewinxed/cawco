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
  AgentRow,
  InstanceRow,
  SessionPulse,
  StoredRecent,
} from "@cawco/core/protocol";
import { fleetFaults } from "./convergence";
import { machineVerdict } from "./machine-verdict";
import {
  type Area,
  type FirstPaintRow,
  MACHINE_KEYS,
  ROW_KEYS,
  type ServedBoard,
} from "./served-board";

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
export function servedBoardOf<Project>(read: {
  areas: Area[];
  instances: InstanceRow[];
  machines: AgentRow[];
  projects: Project[];
  pulses: Record<string, SessionPulse>;
  stored: StoredRecent;
}): ServedBoard<Project> {
  const now = Date.now();
  return {
    areas: read.areas,
    instances: read.instances.map(firstPaintRow),
    machines: read.machines.map((machine) => ({
      ...cut(machine, MACHINE_KEYS),
      fleetFaults: fleetFaults(machine.fleetItems),
      verdict: machineVerdict(machine, now),
    })),
    projects: read.projects,
    pulses: read.pulses,
    stored: { ...read.stored, rows: read.stored.rows.map(firstPaintRow) },
  };
}

/**
 * The rail's own order: what the reader pinned, and how they keep their
 * machines. Neither is something the data can say for itself — recency and
 * hostname are the fleet's opinion, this is theirs — so both are persisted
 * here, in one document, because they are the same kind of claim.
 */

import { RailLayoutShape } from "#lib/cawco/stored-shapes.js";
import { parseJson, stored, writeJson } from "../platform/storage";
import type { Machine } from "./client.svelte";
import { drawnFrom } from "./kept.svelte";

const RAIL_LAYOUT_KEY = "cawco-rail-layout";

/** A project the reader pinned: it sorts to the top of the rail's Projects. */
interface Pin {
  id: string;
  kind: "project";
}

export interface RailLayout {
  /** Machine ids in the reader's order; anything not named here sorts after. */
  machines: string[];
  /** Pinned projects, which Projects lists first. */
  pins: Pin[];
}

const isPin = (value: Pin | undefined): value is Pin =>
  typeof value?.id === "string" && value.kind === "project";

function layoutOf(raw: string | null): RailLayout {
  const kept = parseJson(raw, RailLayoutShape.partial().nullable(), null);
  const read = kept && typeof kept === "object" ? kept : {};
  return {
    pins: Array.isArray(read.pins) ? read.pins.filter(isPin) : [],
    machines: Array.isArray(read.machines)
      ? read.machines.filter((id) => typeof id === "string")
      : [],
  };
}

// Module scope, so the drawer copy of the rail and the desktop one agree.
const layout = $state<RailLayout>(layoutOf(stored("local", RAIL_LAYOUT_KEY)));

/** The layout as drawn: the server's copy while the first paint holds (kept.svelte.ts). */
const drawn = (): RailLayout => drawnFrom(RAIL_LAYOUT_KEY, layout, layoutOf);

const save = () => writeJson(RAIL_LAYOUT_KEY, layout);

export const rail = {
  get machineOrder(): string[] {
    return drawn().machines;
  },
  isPinned: (projectId: string): boolean =>
    drawn().pins.some((pin) => pin.id === projectId),
  togglePin(projectId: string): void {
    const at = layout.pins.findIndex((pin) => pin.id === projectId);
    if (at === -1) {
      layout.pins.push({ kind: "project", id: projectId });
    } else {
      layout.pins.splice(at, 1);
    }
    save();
  },
  setMachineOrder(machines: string[]): void {
    layout.machines = machines;
    save();
  },
};

/**
 * Machines in the reader's order. A peer that showed up after they last said
 * sorts behind the ones they placed, by hostname among themselves.
 */
export function orderMachines<
  M extends Pick<Machine, "hostname" | "machineId">,
>(machines: M[]): M[] {
  const placed = new Map(drawn().machines.map((id, index) => [id, index]));
  return [...machines].sort((a, b) => {
    const left = placed.get(a.machineId);
    const right = placed.get(b.machineId);
    if (left !== undefined && right !== undefined) {
      return left - right;
    }
    if (left !== undefined) {
      return -1;
    }
    if (right !== undefined) {
      return 1;
    }
    return a.hostname.localeCompare(b.hostname);
  });
}

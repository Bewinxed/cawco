/**
 * The rail's own order: what the reader pinned, and how they keep their
 * machines. Neither is something the data can say for itself — recency and
 * hostname are the fleet's opinion, this is theirs — so both are persisted
 * here, in one document, because they are the same kind of claim.
 */
import { browser } from "$app/environment";
import type { Machine } from "./client.svelte";

export const RAIL_LAYOUT_KEY = "whiffle-rail-layout";

/**
 * What a pin points at. A side quest is a session that says it is one (NEW.md
 * §1), so keeping one never invalidates the pin that was put on it.
 */
export type PinKind = "machine" | "project" | "session" | "stored";

/**
 * How the rail orders the sessions inside a project and in its flat lists.
 * `recent` is the default because the question a rail is opened to answer is
 * "where was I", and only a timestamp answers that; `name` is for the reader
 * who navigates by memory of the title; `state` is the old behaviour, blocked
 * before working before idle, for triage rather than resumption.
 */
export type RailSort = "recent" | "name" | "state";

const SORTS: readonly string[] = ["recent", "name", "state"];

export interface Pin {
  id: string;
  kind: PinKind;
}

interface RailLayout {
  /**
   * Whether delegate sessions are listed at all. Off by default: a session that
   * fans out ten delegates puts eleven rows in the rail, ten of which are work
   * the reader handed off precisely so they would not have to watch it. Off,
   * every list in the rail shows only sessions nobody delegated; on, delegates
   * are back, nested under the session that spawned them as before.
   */
  delegates: boolean;
  /** Machine ids in the reader's order; anything not named here sorts after. */
  machines: string[];
  /** The order the Pinned group is drawn in — first pinned, first shown. */
  pins: Pin[];
  /** How session lists are ordered. See {@link RailSort}. */
  sort: RailSort;
}

const KINDS: readonly string[] = ["machine", "project", "session", "stored"];

const isPin = (value: Pin | undefined): value is Pin =>
  typeof value?.id === "string" && KINDS.includes(value.kind);

function read(): RailLayout {
  if (!browser) {
    return { pins: [], machines: [], sort: "recent", delegates: false };
  }
  try {
    const stored = JSON.parse(
      localStorage.getItem(RAIL_LAYOUT_KEY) ?? "{}"
    ) as Partial<RailLayout>;
    return {
      pins: (stored.pins ?? []).filter(isPin),
      machines: (stored.machines ?? []).filter((id) => typeof id === "string"),
      sort: SORTS.includes(stored.sort ?? "")
        ? (stored.sort as RailSort)
        : "recent",
      delegates: stored.delegates === true,
    };
  } catch {
    return { pins: [], machines: [], sort: "recent", delegates: false };
  }
}

// Module scope, so the drawer copy of the rail and the desktop one agree.
const layout = $state<RailLayout>(read());

const save = () =>
  localStorage.setItem(RAIL_LAYOUT_KEY, JSON.stringify(layout));

export const rail = {
  get pins(): Pin[] {
    return layout.pins;
  },
  get machineOrder(): string[] {
    return layout.machines;
  },
  get sort(): RailSort {
    return layout.sort;
  },
  setSort(sort: RailSort): void {
    layout.sort = sort;
    save();
  },
  get delegates(): boolean {
    return layout.delegates;
  },
  setDelegates(show: boolean): void {
    layout.delegates = show;
    save();
  },
  isPinned: (kind: PinKind, id: string): boolean =>
    layout.pins.some((pin) => pin.kind === kind && pin.id === id),
  togglePin(kind: PinKind, id: string): void {
    const at = layout.pins.findIndex(
      (pin) => pin.kind === kind && pin.id === id
    );
    if (at === -1) {
      layout.pins.push({ kind, id });
    } else {
      layout.pins.splice(at, 1);
    }
    save();
  },
  setPins(pins: Pin[]): void {
    layout.pins = pins;
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
 *
 * A pin nobody can resolve any more — a discarded quest, a deleted transcript —
 * is skipped where it is drawn rather than pruned here: on a cold load the rail
 * is empty until the hub answers, and pruning then would throw away every pin.
 */
export function orderMachines(machines: Machine[]): Machine[] {
  const placed = new Map(layout.machines.map((id, index) => [id, index]));
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

/**
 * The relay WorkTabs runs when what the list shows changes (a tab, or "N
 * more"), as data: which lines leave and when each is gone, which arrive
 * and the earliest each may start. A new row takes the place of the old
 * row at the same place in its machine, so it waits for that row (its
 * baton); a machine the new list lacks takes its header with it, and a
 * machine new to the list brings its header first. The timings are
 * motion/list-swap's.
 */
import { ListSwap } from "../motion/list-swap.svelte";

export interface RelayGroup<T> {
  machineId: string;
  rows: T[];
}

export interface RelayLine<T> {
  key: string;
  machineId: string;
  row?: T;
}

export interface Arrival {
  /** Its place in the entrance cascade. */
  i: number;
  /** The earliest it may start, in ms from the change. */
  notBefore: number;
}

export interface RelayPlan<T> {
  enter: Map<string, Arrival>;
  /** When each box's last leaving line is gone (machine id, or "more"). */
  lastOut: Map<string, number>;
  /** Machines whose old rows leave in the places the new ones take. */
  layered: Set<string>;
  /** Each leaving line's place in the exit cascade. */
  leave: Map<string, number>;
  lines: RelayLine<T>[];
}

/** The key of a machine's header line. */
export const headKey = (machineId: string): string => `head:${machineId}`;

/** The leaving half: every line `old` has that `fresh` does not, top down. */
function departures<T extends { id: string }>(
  old: RelayGroup<T>[],
  fresh: RelayGroup<T>[],
  drawn: (key: string) => boolean
) {
  const freshRows = new Set(fresh.flatMap((g) => g.rows.map((r) => r.id)));
  const freshIds = new Set(fresh.map((g) => g.machineId));
  const lines: RelayLine<T>[] = [];
  const leave = new Map<string, number>();
  const lastOut = new Map<string, number>();
  const batons = new Map<string, number[]>();
  for (const group of old) {
    const id = group.machineId;
    const out = (key: string, row?: T): number => {
      const end = ListSwap.leaveEnd(lines.length);
      leave.set(key, lines.length);
      lines.push({ key, machineId: id, row });
      lastOut.set(id, end);
      return end;
    };
    if (!freshIds.has(id) && drawn(headKey(id))) {
      out(headKey(id));
    }
    batons.set(
      id,
      group.rows
        .filter((row) => !freshRows.has(row.id))
        .map((row) => out(row.id, row))
    );
  }
  return { batons, lastOut, leave, lines };
}

/** The arriving half: every line `fresh` has that `old` does not, top down. */
function arrivals<T extends { id: string }>(
  old: RelayGroup<T>[],
  fresh: RelayGroup<T>[],
  batons: Map<string, number[]>
) {
  const oldIds = new Set(old.map((g) => g.machineId));
  const oldRows = new Set(old.flatMap((g) => g.rows.map((r) => r.id)));
  const enter = new Map<string, Arrival>();
  const layered = new Set<string>();
  const arrive = (key: string, notBefore: number) =>
    enter.set(key, { i: enter.size, notBefore });
  for (const group of fresh) {
    const id = group.machineId;
    if (!oldIds.has(id)) {
      arrive(headKey(id), 0);
    }
    const ends = oldIds.has(id) ? (batons.get(id) ?? []) : [];
    const coming = group.rows.filter((row) => !oldRows.has(row.id));
    for (const [place, row] of coming.entries()) {
      arrive(row.id, ends[place] ?? 0);
    }
    if (coming.length > 0 && ends.length > 0) {
      layered.add(id);
    }
  }
  return { enter, layered };
}

/**
 * The whole relay from `old` (what is drawn) to `fresh`, with the "N more"
 * row as the list's last line: `more` is its words before and after.
 */
export function planRelay<T extends { id: string }>(
  old: RelayGroup<T>[],
  fresh: RelayGroup<T>[],
  more: { before: string | null; after: string | null },
  drawn: (key: string) => boolean
): RelayPlan<T> {
  const { batons, lastOut, leave, lines } = departures(old, fresh, drawn);
  const { enter, layered } = arrivals(old, fresh, batons);
  if (more.before && !more.after) {
    leave.set("more", lines.length);
    lastOut.set("more", ListSwap.leaveEnd(lines.length));
  } else if (more.after && !more.before) {
    enter.set("more", { i: enter.size, notBefore: 0 });
  }
  return { enter, lastOut, layered, leave, lines };
}

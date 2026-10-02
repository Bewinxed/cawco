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
 * An "N more" line: its `key`, the `box` it is drawn in (a group's machine
 * id, or a box of its own), and its words before and after the change.
 */
export interface MoreLine {
  after: string | null;
  before: string | null;
  box: string;
  key: string;
}

/**
 * The whole relay from `old` (what is drawn) to `fresh`, with each "N more"
 * line coming or going after the rows: one that goes holds its box open
 * until it has gone.
 */
export function planRelay<T extends { id: string }>(
  old: RelayGroup<T>[],
  fresh: RelayGroup<T>[],
  more: MoreLine[],
  drawn: (key: string) => boolean
): RelayPlan<T> {
  const { batons, lastOut, leave, lines } = departures(old, fresh, drawn);
  const { enter, layered } = arrivals(old, fresh, batons);
  let leaving = lines.length;
  for (const line of more) {
    if (line.before && !line.after) {
      leave.set(line.key, leaving);
      lastOut.set(
        line.box,
        Math.max(lastOut.get(line.box) ?? 0, ListSwap.leaveEnd(leaving))
      );
      leaving += 1;
    } else if (line.after && !line.before) {
      enter.set(line.key, { i: enter.size, notBefore: 0 });
    }
  }
  return { enter, lastOut, layered, leave, lines };
}

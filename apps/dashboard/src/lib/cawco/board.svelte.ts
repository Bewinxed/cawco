/**
 * The board as keyed state: a hub message costs what it changed, never the
 * fleet's size (speed audit of 2026-10-24, 7433e2b3 mechanism 2: at 1763
 * rows a pulse took 32–45 ms and a board delta 28–74 ms, each a pass over
 * every row). Each read here is one key's, or one field of one session's
 * pulse, so a message that moves one row wakes what reads that row.
 *
 * Svelte's rules this leans on (svelte.dev/docs/svelte/$state): a `$state`
 * object's properties are each a signal, a key never held included, and
 * only plain objects and arrays are proxied, so a class instance held under
 * a key is stored as it is. `SvelteMap` is not used: its `get` of a key it
 * does not hold, and its `set` of one its readers share with no walk,
 * wake every reader of its version, which is every row a list asks about.
 */
import type { SessionPulse } from "@cawco/core/protocol";

/**
 * A value held under its key. A class, never a plain object, so the store's
 * proxy keeps the hub's row as the hub sent it, read without a proxy.
 */
class Held<T> {
  readonly value: T;
  constructor(value: T) {
    this.value = value;
  }
}

/**
 * A map whose `get` and `has` are each one key's signal: a read wakes when
 * that key's value is another, and never for another key. A walk over every
 * entry (`values`, `size`, …) wakes on any change.
 */
export class Keyed<T> implements ReadonlyMap<string, T> {
  /** Each key's value behind a signal of its own. */
  readonly #cells: Record<string, Held<T> | undefined> = $state({});
  /** The same values, unwatched: what a walk goes through. */
  readonly #plain = new Map<string, T>();
  /** Moved by every change: what a walk reads. */
  #version = $state(0);

  get(key: string): T | undefined {
    return this.#cells[key]?.value;
  }

  has(key: string): boolean {
    return this.#cells[key] !== undefined;
  }

  get size(): number {
    return this.#walked().size;
  }

  entries(): MapIterator<[string, T]> {
    return this.#walked().entries();
  }

  keys(): MapIterator<string> {
    return this.#walked().keys();
  }

  values(): MapIterator<T> {
    return this.#walked().values();
  }

  [Symbol.iterator](): MapIterator<[string, T]> {
    return this.entries();
  }

  forEach(
    each: (value: T, key: string, map: ReadonlyMap<string, T>) => void
  ): void {
    for (const [key, value] of this.#walked()) {
      each(value, key, this);
    }
  }

  /** Holds `value` under `key`; its readers wake only when it is another value. */
  set(key: string, value: T): void {
    if (this.#plain.has(key) && this.#plain.get(key) === value) {
      return;
    }
    this.#plain.set(key, value);
    this.#cells[key] = new Held(value);
    this.#version += 1;
  }

  delete(key: string): void {
    if (!this.#plain.delete(key)) {
      return;
    }
    delete this.#cells[key];
    this.#version += 1;
  }

  /** The unwatched map, read through the version so a walk wakes on every change (it never falls below 0). */
  #walked(): Map<string, T> {
    return this.#version >= 0 ? this.#plain : new Map();
  }
}

/** What a session's pulse says, field by field: the store's {@link Pulse}, or the served page's. */
export type PulseReading = Pick<
  SessionPulse,
  "activity" | "at" | "busy" | "currentTool" | "runningSubagents"
>;

/**
 * One session's pulse, split by who reads what (7433e2b3): its `activity`
 * files the session in the lists (working, waiting on you, idle) and moves
 * only at a turn's edges; the rest (when it last moved, the tool it is in,
 * its subagents) is read by its own row. A pulse writes each field only
 * when it moved, so a pulse inside a turn wakes no list.
 */
export class Pulse implements PulseReading {
  activity = $state<SessionPulse["activity"]>("idle");
  /** ms epoch of the last frame that moved the pulse, on its machine's clock. */
  at = $state(0);
  busy = $state(false);
  currentTool = $state.raw<SessionPulse["currentTool"]>(null);
  runningSubagents = $state(0);
  /**
   * When the session's current turn began, ms epoch: the `at` of the first
   * pulse after an idle one that was not idle. Unset while it is idle. The
   * fleet board orders a working session by it, so a session keeps its
   * place for as long as it works.
   */
  since = $state<number | undefined>(undefined);

  constructor(pulse: SessionPulse) {
    this.take(pulse);
  }

  /** Takes a pulse at least as new as the one held: each field written only when it moved. */
  take(pulse: SessionPulse): void {
    this.activity = pulse.activity;
    this.at = pulse.at;
    this.busy = pulse.busy;
    this.runningSubagents = pulse.runningSubagents;
    if (!sameTool(this.currentTool, pulse.currentTool)) {
      this.currentTool = pulse.currentTool;
    }
    if (pulse.activity === "idle") {
      this.since = undefined;
    } else if (this.since === undefined) {
      this.since = pulse.at;
    }
  }
}

const sameTool = (
  a: SessionPulse["currentTool"],
  b: SessionPulse["currentTool"]
): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.name === b.name &&
    a.glance === b.glance &&
    a.toolId === b.toolId);

/**
 * `next`, or `was` when it holds the same values in the same order: a
 * derived that returns the very array it returned before wakes nothing
 * downstream ("If the new value of a derived is referentially identical to
 * its previous value, downstream updates will be skipped",
 * svelte.dev/docs/svelte/$derived).
 */
export function unlessSame<T>(was: readonly T[] | undefined, next: T[]): T[] {
  if (
    was !== undefined &&
    was.length === next.length &&
    was.every((value, i) => value === next[i])
  ) {
    return was as T[];
  }
  return next;
}

/** A date the hub sent, as ms epoch: 0 for none or one that is no date. */
const epochOfValue = (
  at: string | number | Date | null | undefined
): number => {
  if (at === null || at === undefined) {
    return 0;
  }
  const ms = new Date(at).getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

/** Each row's dates, read once: a row is replaced whole, never edited in place. */
const datesOf = new WeakMap<object, Map<string, number>>();

/**
 * A date field of a row, as ms epoch (0 for none), parsed once per row:
 * sorting a thousand rows by a date read through `new Date` in the
 * comparator parsed it twenty thousand times.
 */
export function epochOf<R extends object>(row: R, field: keyof R): number {
  let dates = datesOf.get(row);
  if (!dates) {
    dates = new Map();
    datesOf.set(row, dates);
  }
  const name = String(field);
  const held = dates.get(name);
  if (held !== undefined) {
    return held;
  }
  const ms = epochOfValue(row[field] as string | number | Date | null);
  dates.set(name, ms);
  return ms;
}

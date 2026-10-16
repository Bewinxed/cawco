/**
 * A surface's snapshot as its baseline file keeps it, and the differences
 * between two: `baselines/style-snapshot/<surface>.json`.
 *
 * One file per surface: its reads (a state at a pass, `<state> · <pass>`),
 * each element a row `[parent, step, sig, x, y, w, h, flags, label, before,
 * after, hover, focus]` (trailing empties left off), every look (`sig`) in
 * one table for the file. A look is its values in `props` order.
 */
import type { Node, Read } from "./read";

export interface SnapshotRead {
  /** Why the state did not open or read: the same on two runs is no difference. */
  error?: string;
  forced?: number;
  rows?: unknown[][];
}

export interface Snapshot {
  props: string[];
  reads: Record<string, SnapshotRead>;
  sigs: string[];
  surface: string;
}

/**
 * A snapshot as its file holds it, gzipped JSON: each look as only the
 * values that differ from the file's commonest value for that property
 * (`common`), so a surface's thousands of looks take a few hundred kB.
 */
interface Stored extends Omit<Snapshot, "sigs"> {
  common: string[];
  looks: Record<string, string>[];
}

export async function saveSnapshot(
  path: string,
  snap: Snapshot
): Promise<void> {
  const columns = snap.sigs.map((sig) => sig.split("\u0001"));
  const common = snap.props.map((_, p) => {
    const tally = new Map<string, number>();
    for (const values of columns) {
      const v = values[p] ?? "";
      tally.set(v, (tally.get(v) ?? 0) + 1);
    }
    let best = "";
    let most = -1;
    for (const [v, n] of tally) {
      if (n > most) {
        best = v;
        most = n;
      }
    }
    return best;
  });
  const looks = columns.map((values) => {
    const out: Record<string, string> = {};
    for (const [p, v] of values.entries()) {
      if (v !== common[p]) {
        out[p] = v;
      }
    }
    return out;
  });
  const stored: Stored = {
    surface: snap.surface,
    props: snap.props,
    common,
    looks,
    reads: snap.reads,
  };
  await Bun.write(
    path,
    Bun.gzipSync(new TextEncoder().encode(JSON.stringify(stored)), {
      level: 9,
    })
  );
}

export async function loadSnapshot(path: string): Promise<Snapshot> {
  const stored = JSON.parse(
    new TextDecoder().decode(
      Bun.gunzipSync(new Uint8Array(await Bun.file(path).arrayBuffer()))
    )
  ) as Stored;
  const sigs = stored.looks.map((look) =>
    stored.common.map((v, p) => look[p] ?? v).join("\u0001")
  );
  return {
    surface: stored.surface,
    props: stored.props,
    sigs,
    reads: stored.reads,
  };
}

/** Builds a surface's snapshot as reads land. */
export class SnapshotWriter {
  private readonly sigIndex = new Map<string, number>();
  readonly snapshot: Snapshot;
  constructor(surface: string, props: readonly string[]) {
    this.snapshot = { surface, props: [...props], sigs: [], reads: {} };
  }

  private sig(value: string): number {
    let i = this.sigIndex.get(value);
    if (i === undefined) {
      i = this.snapshot.sigs.length;
      this.snapshot.sigs.push(value);
      this.sigIndex.set(value, i);
    }
    return i;
  }

  add(name: string, read: Read | null, error?: string): void {
    if (error !== undefined || !read) {
      this.snapshot.reads[name] = { error: error ?? "no root" };
      return;
    }
    const local = (i: number | undefined) =>
      i === undefined ? null : this.sig(read.sigs[i] as string);
    const rows = read.nodes.map((n: Node) => {
      const row: unknown[] = [
        n.parent,
        n.step,
        local(n.sig),
        ...n.rect,
        n.flags ?? null,
        n.label ?? null,
        local(n.before),
        local(n.after),
        n.hover ?? null,
        n.focus ?? null,
      ];
      while (row.length > 7 && row.at(-1) === null) {
        row.pop();
      }
      return row;
    });
    this.snapshot.reads[name] = { forced: read.forced, rows };
  }
}

interface Row {
  after: string[] | null;
  before: string[] | null;
  flags: string;
  focus: Record<string, Record<string, string>> | null;
  hover: Record<string, Record<string, string>> | null;
  key: string;
  label: string | null;
  rect: number[];
  values: string[];
}

/** A read's rows by key, every look expanded. */
function rowsOf(snap: Snapshot, read: SnapshotRead): Map<string, Row> {
  const rows = read.rows ?? [];
  const keys: string[] = [];
  const look = (i: unknown) =>
    typeof i === "number" ? (snap.sigs[i] ?? "").split("\u0001") : null;
  const out = new Map<string, Row>();
  rows.forEach((row, i) => {
    const parent = row[0] as number;
    const step = row[1] as string;
    const key = parent < 0 ? step : `${keys[parent]} > ${step}`;
    keys[i] = key;
    out.set(key, {
      key,
      values: look(row[2]) ?? [],
      rect: row.slice(3, 7) as number[],
      flags: (row[7] as string | null) ?? "",
      label: (row[8] as string | null) ?? null,
      before: look(row[9]),
      after: look(row[10]),
      hover: null,
      focus: null,
    });
  });
  // A forced state's changes, by the key of the element each lands on.
  rows.forEach((row, i) => {
    for (const [col, field] of [
      [11, "hover"],
      [12, "focus"],
    ] as const) {
      const delta = row[col] as Record<string, Record<string, string>> | null;
      if (!delta) {
        continue;
      }
      const keyed: Record<string, Record<string, string>> = {};
      for (const [at, changes] of Object.entries(delta)) {
        keyed[keys[Number(at)] ?? at] = changes;
      }
      const target = out.get(keys[i] as string);
      if (target) {
        target[field] = keyed;
      }
    }
  });
  return out;
}

/** A forced-state change's property, as a line names it. */
function forcedProp(props: string[], code: string): string {
  const n = Number(code);
  if (n === -1) {
    return "pseudo";
  }
  if (n === -2) {
    return "rect";
  }
  if (n >= 2000) {
    return `::after ${props[n - 2000]}`;
  }
  if (n >= 1000) {
    return `::before ${props[n - 1000]}`;
  }
  return props[n] ?? code;
}

const RECT = ["rect.x", "rect.y", "rect.width", "rect.height"];

/**
 * Every difference between `before` and `after` for one surface, one line
 * each: `<read> · <element key> [<data-slot>] · <property> · <before> → <after>`.
 */
export function differences(before: Snapshot, after: Snapshot): string[] {
  if (before.props.join() !== after.props.join()) {
    return [
      "(snapshot) · props · the baseline reads another property list → recapture it (--approve)",
    ];
  }
  const names = [
    ...new Set([...Object.keys(before.reads), ...Object.keys(after.reads)]),
  ];
  return names.flatMap((name) => {
    const was = before.reads[name];
    const now = after.reads[name];
    if (!(was && now)) {
      return [
        `${name} · (read) · ${was ? "read" : "not read"} → ${now ? "read" : "not read"}`,
      ];
    }
    if (was.error !== undefined || now.error !== undefined) {
      return was.error === now.error
        ? []
        : [
            `${name} · (read) · ${was.error ?? "read"} → ${now.error ?? "read"}`,
          ];
    }
    return readDifferences(
      name,
      after.props,
      rowsOf(before, was),
      rowsOf(after, now)
    );
  });
}

const labelOf = (row: Row) => `${row.key}${row.label ? ` [${row.label}]` : ""}`;

/** One read's differences, element by element, by key. */
function readDifferences(
  name: string,
  props: string[],
  a: Map<string, Row>,
  b: Map<string, Row>
): string[] {
  const lines: string[] = [];
  for (const [key, row] of a) {
    const other = b.get(key);
    const at = `${name} · ${labelOf(row)}`;
    if (other) {
      lines.push(...elementDifferences(at, props, row, other));
    } else {
      lines.push(`${at} · (element) · present → absent`);
    }
  }
  for (const [key, row] of b) {
    if (!a.has(key)) {
      lines.push(`${name} · ${labelOf(row)} · (element) · absent → present`);
    }
  }
  return lines;
}

/** Each value of `x` unlike `y`'s at the same place: `<what> · x → y`. */
const unlike = (
  at: string,
  names: readonly string[],
  x: readonly (string | number)[],
  y: readonly (string | number)[]
): string[] =>
  x.flatMap((v, p) =>
    v === y[p] ? [] : [`${at} · ${names[p]} · ${v} → ${y[p]}`]
  );

/** One element's differences: its look, its box, its overflow, its pseudo-elements and its forced states. */
function elementDifferences(
  at: string,
  props: string[],
  row: Row,
  other: Row
): string[] {
  const lines = [
    ...unlike(at, props, row.values, other.values),
    ...unlike(at, RECT, row.rect, other.rect),
  ];
  if (row.flags !== other.flags) {
    lines.push(
      `${at} · overflow · ${row.flags || "none"} → ${other.flags || "none"}`
    );
  }
  for (const which of ["before", "after"] as const) {
    lines.push(
      ...pseudoDifferences(at, props, which, row[which], other[which])
    );
  }
  for (const state of ["hover", "focus"] as const) {
    lines.push(
      ...forcedDifferences(at, props, row.key, state, row[state], other[state])
    );
  }
  return lines;
}

function pseudoDifferences(
  at: string,
  props: string[],
  which: "before" | "after",
  x: string[] | null,
  y: string[] | null
): string[] {
  if (!(x || y)) {
    return [];
  }
  if (!(x && y)) {
    return [
      `${at} · ::${which} · ${x ? "drawn" : "none"} → ${y ? "drawn" : "none"}`,
    ];
  }
  return unlike(
    at,
    props.map((p) => `::${which} ${p}`),
    x,
    y
  );
}

/** A forced state's changes against the other's, on the element or what it holds. */
function forcedDifferences(
  at: string,
  props: string[],
  key: string,
  state: "hover" | "focus",
  was: Row["hover"],
  now: Row["hover"]
): string[] {
  const x = was ?? {};
  const y = now ?? {};
  const named = state === "focus" ? ":focus-visible" : ":hover";
  const lines: string[] = [];
  for (const on of new Set([...Object.keys(x), ...Object.keys(y)])) {
    const cx = x[on] ?? {};
    const cy = y[on] ?? {};
    const where = on === key ? "" : ` on ${on.slice(key.length + 3) || on}`;
    for (const code of new Set([...Object.keys(cx), ...Object.keys(cy)])) {
      if (cx[code] !== cy[code]) {
        lines.push(
          `${at} · ${named}${where} ${forcedProp(props, code)} · ${cx[code] ?? "(as at rest)"} → ${cy[code] ?? "(as at rest)"}`
        );
      }
    }
  }
  return lines;
}

/** A read's counts for the report: elements, interactive ones read forced, ones flagged spilling or outside. */
export function counts(snap: Snapshot): {
  elements: number;
  flagged: number;
  forced: number;
  reads: number;
} {
  let elements = 0;
  let forced = 0;
  let flagged = 0;
  let reads = 0;
  for (const read of Object.values(snap.reads)) {
    reads += 1;
    elements += read.rows?.length ?? 0;
    forced += read.forced ?? 0;
    flagged += (read.rows ?? []).filter((row) => row[7]).length;
  }
  return { reads, elements, forced, flagged };
}

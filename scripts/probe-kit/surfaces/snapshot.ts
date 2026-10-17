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

/** How often the compare's equality rules held two unlike strings equal. */
export interface Tally {
  /** box-shadow values equal once their transparent zero layers are set aside. */
  shadowLayers: number;
  /** A transition's duration, timing function, delay or behavior equal once each side's list is laid against its own transition-property. */
  transitionLists: number;
  /** background-position values equal once a zero offset in one unit meets a zero offset in another. */
  zeroOffsets: number;
}

/** Each side's transition-property, where a value's element (or pseudo-element) has one. */
interface Spans {
  x: string | undefined;
  y: string | undefined;
}

/**
 * A box-shadow layer that cannot draw: transparent, no offset, no blur, no
 * spread. Tailwind's `shadow-*` writes four of them before the token's own
 * shadow (its ring and inset-ring slots), so a converted element reads
 * them where its `<style>` rule read the token's shadow alone.
 */
const BLANK_LAYER = /^rgba\(0, 0, 0, 0\) 0px 0px 0px 0px( inset)?$/;

/** A comma-separated list's items (a box-shadow's layers, a transition's values), split at its top-level commas. */
function listItems(value: string): string[] {
  const layers: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i += 1) {
    const c = value[i];
    if (c === "(") {
      depth += 1;
    } else if (c === ")") {
      depth -= 1;
    } else if (c === "," && depth === 0) {
      layers.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  layers.push(value.slice(start).trim());
  return layers;
}

/** A box-shadow with its blank layers set aside: `none` when nothing is left. */
function drawnShadow(value: string): string {
  const kept = listItems(value).filter((layer) => !BLANK_LAYER.test(layer));
  return kept.length > 0 ? kept.join(", ") : "none";
}

/**
 * A transition's lists other than its properties, compared as the
 * transition they make: "If one of the other properties doesn't have
 * enough comma-separated values to match the number of values of
 * transition-property, the user agent must calculate its used value by
 * repeating the list of values until there are enough. This truncation or
 * repetition does not affect the computed value." (CSS Transitions Level 1,
 * §2, https://drafts.csswg.org/css-transitions-1/). Tailwind's
 * `transition-[a,b] duration-200` computes `0.2s` where a `<style>`
 * shorthand computed `0.2s, 0.2s`: one transition.
 */
const TRANSITION_LISTS = new Set([
  "transition-duration",
  "transition-timing-function",
  "transition-delay",
  "transition-behavior",
]);

/** A transition list as used: repeated, or cut, to its transition-property's length. */
function laidAgainst(value: string, properties: string): string {
  const items = listItems(value);
  return Array.from(
    { length: listItems(properties).length },
    (_, i) => items[i % items.length]
  ).join(", ");
}

/**
 * An offset of nothing, in any unit: `0px`, `0%`, `0`, or the keyword that
 * computes to 0% (`left`, `top`). A background-position's offsets are "an
 * offset of the top left corner of the background image from the top left
 * corner of the background positioning area"; "A length value gives a
 * fixed length as the offset", and "with a value pair of 0% 0%, the upper
 * left corner of the image is aligned with the upper left corner of" the
 * area (CSS Backgrounds 3, §2.6,
 * https://drafts.csswg.org/css-backgrounds-3/#background-position). So a
 * zero length and 0% place the image at the same corner. Lightning CSS
 * minifies a `<style>` rule's `background: none` to `background:0 0`,
 * which computes to `0px 0px`, where a utility leaves the initial `0% 0%`.
 */
const ZERO_OFFSET = /^(?:[+-]?0+(?:\.0+)?(?:%|[a-z]+)?|left|top)$/;

/** A position list's layers, each split into its offsets at top-level spaces (a `calc()` stays whole). */
function offsetsOf(value: string): string[][] {
  return listItems(value).map((layer) => {
    const offsets: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < layer.length; i += 1) {
      const c = layer[i];
      if (c === "(") {
        depth += 1;
      } else if (c === ")") {
        depth -= 1;
      } else if (c === " " && depth === 0) {
        offsets.push(layer.slice(start, i));
        start = i + 1;
      }
    }
    offsets.push(layer.slice(start));
    return offsets.filter((offset) => offset.length > 0);
  });
}

/** Whether two background-positions place every layer at the same offsets, a zero in one unit meeting a zero in another. */
function samePlaces(x: string, y: string): boolean {
  const xs = offsetsOf(x);
  const ys = offsetsOf(y);
  return (
    xs.length === ys.length &&
    xs.every((layer, l) => {
      const other = ys[l] ?? [];
      return (
        layer.length === other.length &&
        layer.every(
          (offset, a) =>
            offset === other[a] ||
            (ZERO_OFFSET.test(offset) && ZERO_OFFSET.test(other[a] ?? ""))
        )
      );
    })
  );
}

/**
 * Whether two values of `property` read the same. Strings are equal only as
 * written, but for three rules, each hold counted in `tally`: two
 * box-shadows whose layers match once the blank ones are set aside, two
 * transition lists that match once each is laid against its own side's
 * transition-property (`spans`), and two background-positions whose
 * offsets match once a zero in one unit meets a zero in another. Nothing
 * else is normalised.
 */
function same(
  property: string,
  x: string | number | undefined,
  y: string | number | undefined,
  tally: Tally,
  spans?: Spans
): boolean {
  if (x === y) {
    return true;
  }
  if (!(typeof x === "string" && typeof y === "string")) {
    return false;
  }
  if (property.endsWith("box-shadow") && drawnShadow(x) === drawnShadow(y)) {
    tally.shadowLayers += 1;
    return true;
  }
  // A pseudo-element's property is named `::before <property>`.
  const longhand = property.slice(property.lastIndexOf(" ") + 1);
  if (
    TRANSITION_LISTS.has(longhand) &&
    spans?.x !== undefined &&
    spans.y !== undefined &&
    laidAgainst(x, spans.x) === laidAgainst(y, spans.y)
  ) {
    tally.transitionLists += 1;
    return true;
  }
  if (longhand === "background-position" && samePlaces(x, y)) {
    tally.zeroOffsets += 1;
    return true;
  }
  return false;
}

/**
 * Every difference between `before` and `after` for one surface, one line
 * each: `<read> · <element key> [<data-slot>] · <property> · <before> → <after>`.
 * `tally` counts what the equality rules (`same`) held equal.
 */
export function differences(
  before: Snapshot,
  after: Snapshot,
  tally: Tally = { shadowLayers: 0, transitionLists: 0, zeroOffsets: 0 }
): string[] {
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
      rowsOf(after, now),
      tally
    );
  });
}

const labelOf = (row: Row) => `${row.key}${row.label ? ` [${row.label}]` : ""}`;

/** One read's differences, element by element, by key. */
function readDifferences(
  name: string,
  props: string[],
  a: Map<string, Row>,
  b: Map<string, Row>,
  tally: Tally
): string[] {
  const lines: string[] = [];
  for (const [key, row] of a) {
    const other = b.get(key);
    const at = `${name} · ${labelOf(row)}`;
    if (other) {
      lines.push(...elementDifferences(at, props, row, other, tally, [a, b]));
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
  y: readonly (string | number)[],
  tally: Tally,
  spans?: Spans
): string[] =>
  x.flatMap((v, p) =>
    same(names[p] ?? "", v, y[p], tally, spans)
      ? []
      : [`${at} · ${names[p]} · ${v} → ${y[p]}`]
  );

/** Each side's transition-property in two looks read in `props` order. */
const spansOf = (
  props: readonly string[],
  x: readonly string[] | null | undefined,
  y: readonly string[] | null | undefined
): Spans => {
  const at = props.indexOf("transition-property");
  return { x: x?.[at], y: y?.[at] };
};

/** One element's differences: its look, its box, its overflow, its pseudo-elements and its forced states. */
function elementDifferences(
  at: string,
  props: string[],
  row: Row,
  other: Row,
  tally: Tally,
  sides: readonly [Map<string, Row>, Map<string, Row>]
): string[] {
  const lines = [
    ...unlike(
      at,
      props,
      row.values,
      other.values,
      tally,
      spansOf(props, row.values, other.values)
    ),
    ...unlike(at, RECT, row.rect, other.rect, tally),
  ];
  if (row.flags !== other.flags) {
    lines.push(
      `${at} · overflow · ${row.flags || "none"} → ${other.flags || "none"}`
    );
  }
  for (const which of ["before", "after"] as const) {
    lines.push(
      ...pseudoDifferences(at, props, which, row[which], other[which], tally)
    );
  }
  for (const state of ["hover", "focus"] as const) {
    lines.push(
      ...forcedDifferences(
        at,
        props,
        row.key,
        state,
        row[state],
        other[state],
        tally,
        sides
      )
    );
  }
  return lines;
}

function pseudoDifferences(
  at: string,
  props: string[],
  which: "before" | "after",
  x: string[] | null,
  y: string[] | null,
  tally: Tally
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
    y,
    tally,
    spansOf(props, x, y)
  );
}

/**
 * The transition-property a forced state's change sits under, on each
 * side: the state's own change to it, else the element's (or its
 * pseudo-element's) at rest.
 */
function forcedSpans(
  props: string[],
  on: string,
  code: string,
  changes: readonly [Record<string, string>, Record<string, string>],
  sides: readonly [Map<string, Row>, Map<string, Row>]
): Spans {
  const n = Number(code);
  const at = props.indexOf("transition-property");
  // A forced change's code: the property's place, +1000 on ::before, +2000 on ::after.
  let base = 0;
  let atRest = (row: Row | undefined) => row?.values;
  if (n >= 2000) {
    base = 2000;
    atRest = (row) => row?.after ?? undefined;
  } else if (n >= 1000) {
    base = 1000;
    atRest = (row) => row?.before ?? undefined;
  }
  const [x, y] = sides.map(
    (side, i) => changes[i]?.[base + at] ?? atRest(side.get(on))?.[at]
  );
  return { x, y };
}

/** A forced state's changes against the other's, on the element or what it holds. */
function forcedDifferences(
  at: string,
  props: string[],
  key: string,
  state: "hover" | "focus",
  was: Row["hover"],
  now: Row["hover"],
  tally: Tally,
  sides: readonly [Map<string, Row>, Map<string, Row>]
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
      const spans = forcedSpans(props, on, code, [cx, cy], sides);
      if (!same(forcedProp(props, code), cx[code], cy[code], tally, spans)) {
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

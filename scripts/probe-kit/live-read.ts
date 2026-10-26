/**
 * What live-perf (specs/live-perf.ts) reads out of the series its page
 * watcher kept (live-page.ts): frame cadence, long work, the reading
 * position's jumps, interactions, and the script behind each long frame,
 * said at its source line when the build's source maps are at hand.
 *
 * The live dashboard ships no source maps. The same commit built with
 * `vite build --sourcemap hidden` (apps/dashboard) makes the very chunks it
 * serves, each with a map beside it and no comment pointing at it, so a
 * position in a served chunk is read against that build
 * (`.svelte-kit/output/client`), its `--maps` folder.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Interaction, Loaf, Painted } from "./live-page";

/** One frame at 60 Hz, ms. */
const FRAME_MS = 1000 / 60;

const quantile = (sorted: number[], q: number): number =>
  sorted.length === 0
    ? 0
    : (sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0);

/**
 * The display's own frame interval, ms: the p10 of a still page's frame
 * gaps, rounded to a refresh rate's (a desk's 60 Hz is 16.7; the shared
 * browser's virtual display draws at 30 Hz, 33.3).
 */
export function displayFrame(rafs: number[]): number {
  const gaps = rafs
    .slice(1)
    .map((t, i) => t - (rafs[i] ?? t))
    .filter((gap) => gap > 0)
    .sort((a, b) => a - b);
  const p10 = quantile(gaps, 0.1) || FRAME_MS;
  return 1000 / Math.round(1000 / p10);
}

/**
 * Frame cadence from the frames' timestamps against the display's frame
 * interval `slot`: the interval's p50, p95 and longest, how many ran past
 * one and a half frames, and the share of the display's frames missed.
 */
export function cadence(rafs: number[], slot = FRAME_MS) {
  const gaps = rafs
    .slice(1)
    .map((t, i) => t - (rafs[i] ?? t))
    .filter((gap) => gap > 0);
  const sorted = [...gaps].sort((a, b) => a - b);
  // A gap of n frames' time is one frame drawn and n - 1 missed.
  const slots = gaps.reduce(
    (sum, gap) => sum + Math.max(1, Math.round(gap / slot)),
    0
  );
  const dropped = gaps.reduce(
    (sum, gap) => sum + Math.max(0, Math.round(gap / slot) - 1),
    0
  );
  return {
    frames: gaps.length,
    p50: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
    longest: sorted.at(-1) ?? 0,
    over: gaps.filter((gap) => gap > slot * 1.5).length,
    droppedShare: slots === 0 ? 0 : dropped / slots,
  };
}

/** Long tasks inside a span (the page's clock, ms): how many, all told, the longest. */
export function longWork(
  long: [number, number][],
  from = 0,
  to = Number.POSITIVE_INFINITY
) {
  const inside = long.filter(([at]) => at >= from && at < to);
  return {
    count: inside.length,
    totalMs: inside.reduce((sum, [, ms]) => sum + ms, 0),
    longest: Math.max(0, ...inside.map(([, ms]) => ms)),
  };
}

/** Long animation frames inside a span: how many, their time, blocking, rendering, style and layout, and forced style and layout. */
export function longFrames(
  loaf: Loaf[],
  from = 0,
  to = Number.POSITIVE_INFINITY
) {
  const inside = loaf.filter((one) => one.at >= from && one.at < to);
  const sum = (pick: (one: Loaf) => number) =>
    inside.reduce((total, one) => total + pick(one), 0);
  return {
    count: inside.length,
    totalMs: sum((one) => one.ms),
    blockingMs: sum((one) => one.blocking),
    renderMs: sum((one) => one.render),
    styleLayoutMs: sum((one) => one.styleLayout),
    forcedMs: sum((one) =>
      one.scripts.reduce((total, script) => total + script.forced, 0)
    ),
    scriptMs: sum((one) =>
      one.scripts.reduce((total, script) => total + script.ms, 0)
    ),
    longest: Math.max(0, ...inside.map((one) => one.ms)),
  };
}

/**
 * The reading position's jumps: in each painted frame, how far the row
 * read in the frame before moved, less what the driver's own scrolls moved
 * the view (a notch up moves the rows down by its size). Over 2px is a jump.
 */
export function jumps(
  painted: Painted[],
  from = 0,
  to = Number.POSITIVE_INFINITY
) {
  const found: { at: number; px: number; anchor: string }[] = [];
  let compared = 0;
  for (let i = 1; i < painted.length; i += 1) {
    const now = painted[i];
    const before = painted[i - 1];
    if (
      !(now && before) ||
      now.t < from ||
      now.t >= to ||
      now.was === null ||
      before.y === null
    ) {
      continue;
    }
    compared += 1;
    const residual = now.was - before.y + now.driven;
    if (Math.abs(residual) > 2) {
      found.push({ at: now.t, px: residual, anchor: before.anchor ?? "?" });
    }
  }
  return {
    compared,
    count: found.length,
    largest: found.reduce(
      (most, one) => (Math.abs(one.px) > Math.abs(most) ? one.px : most),
      0
    ),
    first: found.slice(0, 5),
  };
}

/** Each interaction once (its longest event), the longest first. */
export function interactions(events: Interaction[]) {
  const byId = new Map<number, Interaction>();
  for (const one of events) {
    const held = byId.get(one.id);
    if (!held || one.ms > held.ms) {
      byId.set(one.id, one);
    }
  }
  return [...byId.values()].sort((a, b) => b.ms - a.ms);
}

// ---------------------------------------------------------------------------
// Source positions

const BASE64 =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const DIGIT = new Map([...BASE64].map((c, i) => [c, i]));
/** A VLQ digit's own five bits, and the bit that says another digit follows. */
const VALUE_BITS = 32;
const MORE = 32;
/** A served chunk's address, less its origin. */
const ORIGIN = /^[a-z]+:\/\/[^/]+\//u;
/** A source's path as a map names it, less its climb to the repository. */
const CLIMB = /^(\.\.\/)+/u;
/** A package's source, said by its name. */
const PACKAGE = /^.*node_modules\/(\.bun\/[^/]+\/node_modules\/)?/u;

/**
 * One segment's numbers off its Base64 VLQ text. A digit carries five bits
 * and a sixth that says more follow; the first bit of the whole is its sign.
 * Read with arithmetic, as the format is defined in powers of two.
 */
function decodeVlq(piece: string): number[] {
  const values: number[] = [];
  let scale = 1;
  let value = 0;
  for (const c of piece) {
    const digit = DIGIT.get(c) ?? 0;
    value += (digit % VALUE_BITS) * scale;
    if (digit >= MORE) {
      scale *= VALUE_BITS;
    } else {
      const magnitude = Math.floor(value / 2);
      values.push(value % 2 === 1 ? -magnitude : magnitude);
      value = 0;
      scale = 1;
    }
  }
  return values;
}

/** A source map's `mappings`, decoded: per generated line, [column, source, line, column] segments. */
function decodeMappings(mappings: string): number[][][] {
  const lines: number[][][] = [];
  const at = { source: 0, line: 0, column: 0 };
  for (const text of mappings.split(";")) {
    const segments: number[][] = [];
    let generated = 0;
    for (const values of text.split(",").filter(Boolean).map(decodeVlq)) {
      generated += values[0] ?? 0;
      if (values.length >= 4) {
        at.source += values[1] ?? 0;
        at.line += values[2] ?? 0;
        at.column += values[3] ?? 0;
        segments.push([generated, at.source, at.line, at.column]);
      }
    }
    lines.push(segments);
  }
  return lines;
}

interface Loaded {
  code: string;
  lines: number[][][];
  sources: string[];
  /** Each generated line's first character's offset. */
  starts: number[];
}

const loaded = new Map<string, Loaded | null>();

const load = (maps: string, file: string): Loaded | null => {
  const held = loaded.get(file);
  if (held !== undefined) {
    return held;
  }
  const path = join(maps, file);
  if (!(existsSync(path) && existsSync(`${path}.map`))) {
    loaded.set(file, null);
    return null;
  }
  const code = readFileSync(path, "utf8");
  const map = JSON.parse(readFileSync(`${path}.map`, "utf8")) as {
    mappings: string;
    sources: string[];
  };
  const starts = [0];
  for (let i = 0; i < code.length; i += 1) {
    if (code.charCodeAt(i) === 10) {
      starts.push(i + 1);
    }
  }
  const one = {
    code,
    lines: decodeMappings(map.mappings),
    starts,
    sources: map.sources,
  };
  loaded.set(file, one);
  return one;
};

/** A served chunk's build output and map, by its address or its bare name (a trace's sampled frame). */
const chunkOf = (maps: string, url: string): Loaded | null => {
  const file = url.replace(ORIGIN, "").split("?")[0] ?? "";
  if (file.includes("/")) {
    return load(maps, file);
  }
  return (
    ["chunks", "nodes", "entry"]
      .map((dir) => load(maps, `_app/immutable/${dir}/${file}`))
      .find((found) => found !== null) ?? null
  );
};

/** The generated line and column (from 0) of character `pos`: the last line starting at or before it. */
const lineOf = (one: Loaded, pos: number): [number, number] => {
  let lo = 0;
  let hi = one.starts.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if ((one.starts[mid] ?? 0) <= pos) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return [lo, pos - (one.starts[lo] ?? 0)];
};

/**
 * Where a served chunk's character `pos` (or its `line`:`column`, both from
 * 1) came from: `src/…:line`, from the build's maps in `maps`
 * (`.svelte-kit/output/client`). Null when the chunk or its map is not there.
 */
export function sourceAt(
  maps: string,
  url: string,
  pos: number,
  at?: { column: number; line: number }
): string | null {
  const one = chunkOf(maps, url);
  if (!one) {
    return null;
  }
  const [line, column] = at ? [at.line - 1, at.column - 1] : lineOf(one, pos);
  const best = (one.lines[line] ?? []).findLast(
    (segment) => (segment[0] ?? 0) <= column
  );
  if (!best) {
    return null;
  }
  const source = (one.sources[best[1] ?? 0] ?? "?")
    .replace(CLIMB, "")
    .replace(PACKAGE, "npm:");
  return `${source}:${(best[2] ?? 0) + 1}`;
}

/** The scripts of long frames, by what ran them, the most time first: each its ms, forced style and layout, count and source. */
export function scriptsOf(
  loaf: Loaf[],
  maps: string | undefined,
  from = 0,
  to = Number.POSITIVE_INFINITY
) {
  const byKey = new Map<
    string,
    { count: number; forced: number; ms: number; source: string; who: string }
  >();
  for (const frame of loaf) {
    if (frame.at < from || frame.at >= to) {
      continue;
    }
    for (const script of frame.scripts) {
      const file = script.url.split("/").pop() ?? "";
      const key = `${script.type}|${script.invoker}|${file}|${script.pos}`;
      const held = byKey.get(key) ?? {
        count: 0,
        forced: 0,
        ms: 0,
        source:
          (maps && script.url && sourceAt(maps, script.url, script.pos)) ||
          `${file}@${script.pos}`,
        who: `${script.type} ${script.invoker}${script.fn ? ` (${script.fn})` : ""}`,
      };
      held.count += 1;
      held.ms += script.ms;
      held.forced += script.forced;
      byKey.set(key, held);
    }
  }
  return [...byKey.values()].sort((a, b) => b.ms - a.ms);
}

/**
 * What a bound still waiting on data records (`@limit recording: <metric>
 * until <date>`, scripts/lint/limit-has-a-reason.ts): the duration a timeout
 * bounds, the size a ring reaches where it evicts, the bytes a read takes,
 * a retry's attempt. Every process records the same way, with
 * {@link recordLimitReading}, and its host carries what it held to the hub's
 * `limit_readings` table:
 *
 * - the hub writes its own every {@link READINGS_HANDED_EVERY_MS} (hub
 *   limit-readings.ts);
 * - a machine's daemon sends its own on its 15 s beat (`HeartbeatPayload`
 *   `limitReadings`, agent daemon.ts), its sessiond's with them;
 * - the dashboard, a preview page's overlay, the CLI and a script on a
 *   machine post theirs to the hub's `POST /api/limit-readings/:machine` (hub limit-readings.ts).
 *
 * A reading costs one map update. Readings of one metric on one day are
 * held as a DDSketch holds them (Masson, Rim and Lee, "DDSketch: A Fast and
 * Fully-Mergeable Quantile Sketch with Relative-Error Guarantees", VLDB
 * 2019): each in the bucket its logarithm names, {@link STEPS_PER_DOUBLING}
 * buckets to each doubling, so a bucket spans about 4.4% of its value. A
 * bucket keeps how many readings fell in it and the largest of them, so the
 * day's largest reading is exact and a percentile is read to within its
 * bucket's span; a hot path records every event and the hub stores one row
 * per bucket a day.
 */
import { z } from "zod";

/** How often a process that holds readings hands them on: the agent's beat. */
export const READINGS_HANDED_EVERY_MS = 15_000;

/** Buckets to each doubling of a reading's value. */
const STEPS_PER_DOUBLING = 16;

/** The bucket every reading of 0 or less shares: below any a positive reading's logarithm reaches. */
const NOT_POSITIVE = Number.MIN_SAFE_INTEGER;

/** One metric's readings on one day that fell in one bucket. */
export interface LimitReading {
  /** When the last of them was taken, ms epoch. */
  at: number;
  bucket: number;
  /** How many readings fell in the bucket. */
  count: number;
  /** The UTC day they were taken, `YYYY-MM-DD`. */
  day: string;
  metric: string;
  /** The largest of them. */
  value: number;
}

export const LimitReadingSchema = z.object({
  at: z.number().int().nonnegative(),
  bucket: z.number().int(),
  count: z.number().int().positive(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  metric: z.string().min(1),
  value: z.number(),
});

/** What a page, the CLI or a script posts to the hub's `POST /api/limit-readings/:machine` (hub limit-readings.ts). */
export const LimitReadingsBodySchema = z.object({
  readings: z.array(LimitReadingSchema),
});

/** The bucket `value` falls in. */
const bucketOf = (value: number): number =>
  value > 0 ? Math.floor(Math.log2(value) * STEPS_PER_DOUBLING) : NOT_POSITIVE;

/** `reading` folded into `into`: its bucket's count added, its largest and latest kept. */
const fold = (into: Map<string, LimitReading>, reading: LimitReading): void => {
  const key = `${reading.metric}\u0000${reading.day}\u0000${reading.bucket}`;
  const one = into.get(key);
  if (one) {
    one.count += reading.count;
    one.value = Math.max(one.value, reading.value);
    one.at = Math.max(one.at, reading.at);
  } else {
    into.set(key, { ...reading });
  }
};

/** The readings this process holds and has not handed on, by metric, day and bucket. */
const held = new Map<string, LimitReading>();

/**
 * Records one reading of the bound `metric` names: a duration in ms, a size
 * in bytes or items, an attempt's number. `metric` is a string literal at
 * the call, the one the bound's tag names. A value that is no finite number
 * is no reading.
 */
export const recordLimitReading = (metric: string, value: number): void => {
  if (!Number.isFinite(value)) {
    return;
  }
  const at = Date.now();
  fold(held, {
    at,
    bucket: bucketOf(value),
    count: 1,
    day: new Date(at).toISOString().slice(0, 10),
    metric,
    value,
  });
};

/** Every reading held, which the caller now carries: this process holds none after. */
export const takeLimitReadings = (): LimitReading[] => {
  const taken = [...held.values()];
  held.clear();
  return taken;
};

/** Readings handed back after their carrier failed, held again beside any taken since. */
export const keepLimitReadings = (readings: readonly LimitReading[]): void => {
  for (const reading of readings) {
    fold(held, reading);
  }
};

/** `next`'s readings merged into `into`'s, as two hand-offs of one machine are one. */
export const mergeLimitReadings = (
  into: readonly LimitReading[],
  next: readonly LimitReading[]
): LimitReading[] => {
  const merged = new Map<string, LimitReading>();
  for (const reading of [...into, ...next]) {
    fold(merged, reading);
  }
  return [...merged.values()];
};

/** One metric's readings on one machine, read back (hub `GET /api/limit-readings`). */
export interface LimitReadingSummary {
  count: number;
  /** The first and last day it was read. */
  first: string;
  last: string;
  machine: string;
  max: number;
  metric: string;
  p50: number;
  p95: number;
  p99: number;
}

/**
 * The value at quantile `q` of buckets sorted by value, each counted as its
 * readings: the largest reading of the bucket the `q`th reading falls in.
 */
export const quantileOf = (
  sorted: readonly { count: number; value: number }[],
  q: number
): number => {
  const total = sorted.reduce((sum, one) => sum + one.count, 0);
  const rank = Math.ceil(q * total);
  let seen = 0;
  for (const one of sorted) {
    seen += one.count;
    if (seen >= rank) {
      return one.value;
    }
  }
  return sorted.at(-1)?.value ?? 0;
};

/**
 * Hands what this process holds to `send` (a post to
 * the hub's `POST /api/limit-readings/:machine` (hub limit-readings.ts), true once taken); what it could not carry is
 * held again for the next hand-off.
 */
export const handOnLimitReadings = async (
  send: (body: { readings: LimitReading[] }) => Promise<boolean>
): Promise<void> => {
  const readings = takeLimitReadings();
  if (readings.length === 0) {
    return;
  }
  const carried = await send({ readings }).catch(() => false);
  if (!carried) {
    keepLimitReadings(readings);
  }
};

/**
 * `work`'s outcome, with the ms from this call to its settling handed to
 * `took`: the duration a timeout bounds, for a recording of its metric
 * (`timed(call(…), (ms) => recordLimitReading("<metric>", ms))`).
 */
export const timed = async <T>(
  work: Promise<T>,
  took: (ms: number) => void
): Promise<T> => {
  const started = Date.now();
  try {
    return await work;
  } finally {
    took(Date.now() - started);
  }
};

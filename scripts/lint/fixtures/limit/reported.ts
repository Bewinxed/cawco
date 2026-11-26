// What house/limit-has-a-reason must refuse (expected.txt): a bound of every kind with no reason.
import { z } from "zod";

declare const items: string[];
declare const title: string;
declare const width: number;
declare const v: {
  pipe: (...steps: unknown[]) => unknown;
  string: () => unknown;
  maxLength: (most: number) => unknown;
};
declare const clamp: (value: number, low: number, high: number) => number;

const PAGE = 20;

export const card = z.object({
  title: z.string().max(80),
  tags: z.array(z.string()).min(2),
  // A minimum of 0 or 1 says "not empty": it limits nothing, and stands.
  body: z.string().min(1),
});
export const name = v.pipe(v.string(), v.maxLength(40));
export const options = {
  type: "array",
  maxItems: 12,
  minLength: 3,
  minItems: 1,
};
export const first = items.slice(0, PAGE);
export const head = title.slice(0, 2 * 60);
export const cut = items.splice(5);
export const narrow = Math.min(width, 640);
export const kept = clamp(width, 0, 1200);
export const ROW_LIMIT = 50;
export const retryCap = 3;
export const CANVAS_SPEC_LIMITS = { files: 24, stories: 1 + 1 };
// A use of a limit-named constant is reported where it is declared, not here.
export const shown = items.slice(0, ROW_LIMIT);
// A tag with no reason after it lets nothing stand: @limit
export const MAX_DEPTH = 8;
// A tag above more than one bound covers only those it names.
// @limit measured: the board's widest row, apps/dashboard/src/lib/board.ts
export const PANE_LIMITS = { width: 480, height: 320 };

declare const db: { select: () => { limit: (count: number) => unknown } };
declare const sql: (
  parts: TemplateStringsArray,
  ...values: unknown[]
) => unknown;
declare const take: (count: number) => unknown;
declare const seen: Set<string>;
declare const table: string;

export const recent = items.slice(-5);
export const rows = db.select().limit(20);
export const latest = sql`SELECT * FROM ${table} ORDER BY at DESC LIMIT 50`;
export const query = { limit: 25, maxWidth: 480, exclusiveMaximum: 99 };
export const page = (rowCap = 40): number => rowCap;
export const crowded = items.length > 10;
export const full = seen.size > 99;
export const firstFive = take(5);

// A count that cuts stays reported: `<=` and `>` always, `<` and `>=` when the code fills to N or holds at N.
declare const queue: string[];
declare const ring: Map<string, number>;
declare const samples: number[];
declare const iso: string;
declare const range: number[];
declare const ids: Iterable<string>;
export const tooMany = queue.length <= 30;
export const sampled = samples.length > 2;
export const fillWhile = (): void => {
  while (queue.length < 64) {
    queue.push("x");
  }
};
export const fillIf = (): void => {
  if (queue.length < 64) {
    queue.push("x");
  }
};
export const holdByDelete = (key: string): void => {
  if (ring.size >= 256) {
    ring.delete(key);
  }
};
export const holdByBreak = (): void => {
  for (const id of ids) {
    if (queue.length >= 500) {
      break;
    }
    queue.push(id);
  }
};
// A name that says a ring's size is a limit, whatever reads it.
export const PAGE_FAULTS_KEPT = 50;
export const DELTAS_HELD = 12;
// A timeout is a limit an agent picks.
export const PROBE_TIMEOUT_MS = 5000;
export const connectDeadline = 30;
export const probeTimeoutMs = 100;
// A date held in a variable is no date's leading fields: this is a cut.
export const day = iso.slice(0, 10);
// Arithmetic on a constant the file declares without a tag is that constant's bound.
export const half = items.slice(0, PAGE / 2);
// A guard beside a cut of other text is a bound of its own, and so is the cut.
export const brief = title.length > 120 ? title.slice(0, 120) : title;
export const other = items.length > 10 ? title.slice(0, 10) : title;
// Zero, one and the unit interval are the narrowings; these are the same shapes with a real bound.
export const second = items.slice(0, 2);
export const SERVER_LIMITS = { idleTimeout: 30, limit: 2 };
export const share = z.number().min(0).max(2);
export const unbounded = z.number().max(1);
export const schema = { minimum: 5, maximum: 1 };
export const loose = { maximum: 1 };
export const turns = { maxTurns: 1 };
export const spanOf = ([min = 1, max = 1]: number[]): number => max - min;
export const rangeOf = range.length > 3;
// A recording tag whose date has passed, and one whose metric nothing records.
declare const recordLimitReading: (metric: string, value: number) => void;
recordLimitReading("fixture.write-ms", 1);
// @limit recording: fixture.write-ms until 2026-11-01
export const WRITE_TIMEOUT_MS = 10_000;
// @limit recording: fixture.never-recorded until 2999-12-31
export const OPEN_TIMEOUT_MS = 10_000;

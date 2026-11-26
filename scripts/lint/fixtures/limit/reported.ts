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
export const full = seen.size >= 100;
export const firstFive = take(5);

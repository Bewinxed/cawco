// What house/limit-has-a-reason must let stand: each bound carries a tag in one of its three forms.
import { z } from "zod";

declare const items: string[];
declare const port: number;

export const card = z.object({
  // @limit asked: cawco:session/86084a4c-59de-486c-8b6a-bd7002ae2b7a
  title: z.string().max(80),
  body: z
    .string()
    // @limit measured: the longest body the hub's store held, 3 812 characters, packages/hub/src/db
    .max(4000),
});

/** @limit external: TCP ports are 16-bit, RFC 793 section 3.1 */
export const PORT_MAX = 65_535;
export const safe = Math.min(port, PORT_MAX);

// @limit asked: https://github.com/example/cawco/issues/12
export const PAGE = 20;
export const first = items.slice(0, PAGE);

export const SHEET_LIMITS = {
  // @limit external: Anthropic's documented image limit, https://docs.anthropic.com/en/docs/build-with-claude/vision
  images: 100,
  // @limit measured: the slowest render of a 30-row sheet, 1.9 s, scripts/sheet-bench.ts
  rows: 30,
};

// @limit measured: the panel's widest column, width and height, apps/dashboard/src/lib/panel.ts
export const PANE_MAX = { width: 480, height: 320 };

export const options = {
  type: "array",
  // @limit asked: cawco:card/1a2b3c4d
  maxItems: 12,
};

declare const clamp: (value: number, low: number, high: number) => number;
declare const width: number;
// @limit measured: the narrowest phone the dashboard is laid out for, 320 px, apps/dashboard/src/lib/tokens/theme.css
export const kept = clamp(width, 320, 1200);

// A count of 0 or less caps nothing: these stand with no tag.
export const allButLast = items.slice(0, -1);
export const drained = items.splice(0);

declare const db: { select: () => { limit: (count: number) => unknown } };
declare const take: (count: number) => unknown;
declare const progress: number;

// Unit-interval arithmetic and a selection of one thing bound nothing.
export const share = Math.min(progress, 1);
export const below = Math.min(progress, 0);
export const unitClamp = clamp(progress, 0, 1);
export const last = items.slice(-1);
export const one = db.select().limit(1);
export const head = take(1);
export const pair = items.length === 2;
export const some = items.length > 1;

// @limit asked: cawco:card/9c8d7e6f
export const recent = items.slice(-5);
// @limit measured: the slowest history read, 50 rows in 40 ms, packages/hub/src/db
export const rows = db.select().limit(50);
export const query = {
  // @limit external: the GitHub REST API's documented largest page, https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api
  limit: 100,
};

// A test for a minimum count cuts nothing.
declare const queue: string[];
declare const range: number[];
declare const iso: string;
export const needsPair = items.length < 2;
export const hasTriple = items.length >= 3;
export const inIf = (): boolean => {
  if (items.length < 2) {
    return false;
  }
  return true;
};
export const refuses = (): boolean => {
  if (items.length >= 3) {
    return true;
  }
  return false;
};

// A ring is a limit by its name, and carries its reason where it is declared.
// @limit measured: the page fault log's longest run in a week, 31 on the owner's hub, packages/core/src/page-faults.ts
export const PAGE_FAULTS_KEPT = 50;
// @limit measured: the probe's slowest run, 1.2 s, three times that, packages/agent/src/probe.ts
export const PROBE_TIMEOUT_MS = 4000;
// @limit measured: the slowest connect, 9 s, three times that, packages/agent/src/connect.ts
export const connectDeadline = 30;

// A date's leading fields are no cut.
export const today = new Date(0).toISOString().slice(0, 10);
export const minute = new Date(0).toISOString().slice(0, 16);

// Arithmetic on a tagged constant is that constant's bound, reported once.
// @limit external: the model API's title length, 64 characters
export const TITLE_MAX = 64;
export const trimmed = iso.slice(0, TITLE_MAX - 1);
export const halved = iso.slice(0, TITLE_MAX / 2);

// A guard beside the cut of the same text is one bound, the cut.
// @limit measured: the narrowest line the dashboard lays out, 120 characters
export const brief = iso.length > 120 ? iso.slice(0, 120) : iso;

// 0 turns a thing off, `limit: 1` selects one row, `.slice(0, 1)` the first.
export const SERVER_LIMITS = { idleTimeout: 0, limit: 1 };
export const retry = { maxRetries: 0 };
export const firstOnly = items.slice(0, 1);
export const offByDefault = ({ max = 0 }: { max?: number }): number => max;

// A maximum of 1 over a minimum of 0 is the unit interval.
export const unit = z.number().min(0).max(1);
export const unit2 = z.number().max(1).min(0);
export const schema = { minimum: 0, maximum: 1 };
export const bounds = { min: 0, max: 1 };
export const unitOf = ({
  min = 0,
  max = 1,
}: {
  min?: number;
  max?: number;
}): number => max - min;
export const spanOf = ([min = 0, max = 1]: number[]): number => max - min;
export const rangeFrom = range.length;

// A bound waiting on data stands while its metric is recorded and its date has not passed.
declare const recordLimitReading: (metric: string, value: number) => void;
declare const started: number;
recordLimitReading("fixture.read-ms", Date.now() - started);
// @limit recording: fixture.read-ms until 2999-12-31
export const READ_TIMEOUT_MS = 10_000;

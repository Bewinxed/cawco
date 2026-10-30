/**
 * `bun scripts/open-at-check.ts`: where a conversation opened at `?at=`
 * lands (dashboard transcript/open-at.svelte.ts `rowAt`), over rows of
 * known records and times.
 *
 * - A record id lands on the row holding it.
 * - A time inside the loaded history lands on the first row stored at or
 *   after it.
 * - A time before the loaded history asks for more (-1), and lands on the
 *   first row once the conversation's start is in hand.
 * - A time after everything lands on the last row.
 *
 * Run by `bun run check` (scripts/check.ts); it fails on any landing that
 * differs.
 */
/** The rows the check asks of, in the shape `rowAt` reads (dashboard transcript/rows.ts `Row`). */
interface Stored {
  id: string;
  timestamp: string;
}
type Row =
  | { kind: "single"; key: string; message: Stored; grouped: false }
  | { kind: "tools"; key: string; messages: Stored[] }
  | { kind: "live"; key: string };

// The module's one SvelteKit import, stood in for: these rows are read off
// the server, as `browser` false says. It is imported by its path at run
// time, so this project's types do not take in the dashboard's (it is
// type-checked in its own).
Bun.plugin({
  name: "app-env",
  setup(build) {
    build.module("$app/env", () => ({
      contents: "export const browser = false;",
      loader: "js",
    }));
  },
});
const OPEN_AT = new URL(
  "../apps/dashboard/src/lib/cawco/transcript/open-at.svelte.ts",
  import.meta.url
).pathname;
const { rowAt } = (await import(OPEN_AT)) as {
  rowAt: (rows: readonly Row[], at: string, startInHand: boolean) => number;
};

const message = (id: string, timestamp: string): Stored => ({ id, timestamp });

/** Four rows, a minute apart from 09:00 UTC; the second folds two tool records; the last is the live tail's. */
const rows: Row[] = [
  {
    kind: "single",
    key: "r0",
    message: message("u0", "2026-10-30T09:00:00.000Z"),
    grouped: false,
  },
  {
    kind: "tools",
    key: "r1",
    messages: [
      message("t1", "2026-10-30T09:01:00.000Z"),
      message("t2", "2026-10-30T09:01:30.000Z"),
    ],
  },
  {
    kind: "single",
    key: "r2",
    message: message("u2", "2026-10-30T09:02:00.000Z"),
    grouped: false,
  },
  { kind: "live", key: "r3" },
];

const cases: [string, string, boolean, number][] = [
  ["a record id", "t2", false, 1],
  [
    "a time inside history, in another zone",
    "2026-10-30T12:01:10%2B03:00",
    false,
    2,
  ],
  ["a time at a row's own", "2026-10-30T09:01:00Z", false, 1],
  ["a time before loaded history", "2026-10-30T08:00:00Z", false, -1],
  ["a time before history, its start in hand", "2026-10-30T08:00:00Z", true, 0],
  ["a time after everything", "2026-10-30T10:00:00%2B00:00", false, 2],
];

const failures: string[] = [];
for (const [name, asked, startInHand, expected] of cases) {
  // The ask as the address hands it over: `?at=` read back by URLSearchParams.
  const at = new URLSearchParams(`at=${asked}`).get("at") ?? "";
  const got = rowAt(rows, at, startInHand);
  if (got !== expected) {
    failures.push(`${name} (${at}): row ${got}, not ${expected}`);
  }
}

if (failures.length > 0) {
  console.error(
    `open-at-check: ${failures.length} wrong\n${failures.join("\n")}`
  );
  process.exit(1);
}
console.log(
  `open-at-check: ${cases.length} asks landed where they should (an id, a time inside history, before it, after everything)`
);

#!/usr/bin/env bun
/**
 * Takes another identity's limit readings out of an account's history.
 *
 *   bun scripts/repair-account-history.ts <cawco.db> \
 *     --account <account id> --identity <email> --since <ISO time> [--dry-run]
 *
 * Before CawCo's accounts were only the ones added in Configure → Accounts,
 * the hub filed whatever a machine's own `~/.claude` login read under the
 * account that login had been. On nightly 2132 obelisk's `~/.claude` switched
 * from jude@petralab.ai to bewinxed@gmail.com at 21:38 local (18:38Z), and
 * every reading it took after that went into jude's account (676d…): the
 * window series no jude row shares (the 5-hour window resetting 2026-10-08
 * 23:30Z, the week resetting 2026-10-15 18:00Z).
 *
 * The other identity's rows are the account's rows read at or after
 * `--since` whose window series (kind, scope, reset to the minute) has no row
 * before it: a series the account was already in is its own. When an account
 * signed in as `--identity` exists (matched by email), they move to it;
 * otherwise they are deleted, since no CawCo account is that login. Each
 * account they left or joined then reads its own latest row per window, and
 * an overage last read by the other identity is unknown until its own next
 * event.
 *
 * It refuses before writing when one instant holds rows of both: one event
 * reads one identity. One transaction; it prints the series it found and
 * rows per account before and after, waits on a busy hub, and a second run
 * changes nothing.
 */
import { Database } from "bun:sqlite";
import { parseArgs } from "node:util";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    account: { type: "string" },
    identity: { type: "string" },
    since: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
});
const [dbPath] = positionals;
const since = values.since ? Date.parse(values.since) : Number.NaN;
if (!(dbPath && values.account && values.identity && Number.isFinite(since))) {
  process.stderr.write(
    "usage: bun scripts/repair-account-history.ts <cawco.db> --account <id> --identity <email> --since <ISO time> [--dry-run]\n"
  );
  process.exit(2);
}
const accountId = values.account;
const identity = values.identity.toLowerCase();
const dryRun = values["dry-run"];

/** How long a write waits on the running hub's own. */
const BUSY_TIMEOUT_MS = 30_000;
const MINUTE_MS = 60_000;

interface HistoryRow {
  account_id: string;
  fetched_at: number;
  id: number;
  kind: string;
  percent: number;
  resets_at: string | null;
  scope_label: string | null;
  severity: string;
}

const fail = (why: string): never => {
  process.stderr.write(`refused: ${why}\nNothing was changed.\n`);
  process.exit(1);
};

const db = new Database(dbPath);
db.run(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);

const accounts = (
  db.query("SELECT id, identity FROM accounts").all() as {
    id: string;
    identity: string | null;
  }[]
).map((row) => ({
  id: row.id,
  email: row.identity
    ? (JSON.parse(row.identity) as { email: string }).email
    : null,
}));
const nameOf = (id: string): string => {
  const email = accounts.find((one) => one.id === id)?.email;
  return email ? `${email} (${id})` : id;
};
if (!accounts.some((one) => one.id === accountId)) {
  fail(`there is no account ${accountId}`);
}
const target = accounts.find(
  (one) => one.id !== accountId && one.email?.toLowerCase() === identity
)?.id;

const countsNow = (): Map<string, number> =>
  new Map(
    (
      db
        .query(
          "SELECT account_id, count(*) AS n FROM usage_limit_history GROUP BY account_id ORDER BY account_id"
        )
        .all() as { account_id: string; n: number }[]
    ).map((row) => [row.account_id, row.n])
  );

const printCounts = (label: string, counts: Map<string, number>): void => {
  process.stdout.write(`${label}:\n`);
  for (const [account, n] of counts) {
    process.stdout.write(`  ${nameOf(account)}: ${n}\n`);
  }
};

printCounts("rows per account before", countsNow());

/** One window series: its kind, scope and reset to the minute. */
const seriesOf = (row: HistoryRow): string =>
  [
    row.kind,
    row.scope_label ?? "",
    row.resets_at === null
      ? "none"
      : Math.round(Date.parse(row.resets_at) / MINUTE_MS),
  ].join("\u0000");

const rows = db
  .query(
    "SELECT id, account_id, kind, scope_label, percent, severity, resets_at, fetched_at FROM usage_limit_history WHERE account_id = ? ORDER BY fetched_at, id"
  )
  .all(accountId) as HistoryRow[];

const before = new Set(
  rows.filter((row) => row.fetched_at < since).map(seriesOf)
);
const foreign = rows.filter(
  (row) => row.fetched_at >= since && !before.has(seriesOf(row))
);
const foreignIds = new Set(foreign.map((row) => row.id));

// One event is one identity: an instant holding rows of both refuses.
const instants = new Map<number, { own: boolean; other: boolean }>();
for (const row of rows) {
  const at = instants.get(row.fetched_at) ?? { own: false, other: false };
  if (foreignIds.has(row.id)) {
    at.other = true;
  } else {
    at.own = true;
  }
  instants.set(row.fetched_at, at);
}
for (const [at, held] of instants) {
  if (held.own && held.other) {
    fail(
      `the reading at ${new Date(at).toISOString()} holds rows of both identities`
    );
  }
}

const found = new Map<string, HistoryRow[]>();
for (const row of foreign) {
  found.set(seriesOf(row), [...(found.get(seriesOf(row)) ?? []), row]);
}
for (const series of found.values()) {
  const [first] = series;
  const last = series.at(-1);
  if (first && last) {
    process.stdout.write(
      `${values.identity}'s series: ${first.kind}${first.scope_label ? `/${first.scope_label}` : ""} resetting ${first.resets_at}, ${series.length} rows from ${new Date(first.fetched_at).toISOString()} to ${new Date(last.fetched_at).toISOString()}\n`
    );
  }
}
process.stdout.write(
  `${foreign.length} rows of ${nameOf(accountId)} are ${values.identity}'s; ${
    target
      ? `they move to ${nameOf(target)}`
      : `no account is ${values.identity}, so they are removed`
  }\n`
);
if (dryRun) {
  process.stdout.write("dry run: nothing was changed\n");
  db.close();
  process.exit(0);
}

/** The window a history row records, as an account's reading holds it. */
const windowOf = (row: HistoryRow) => ({
  kind: row.kind,
  group: row.kind === "session" ? "session" : "weekly",
  percent: row.percent,
  severity: row.severity,
  resetsAt: row.resets_at,
  scopeLabel: row.scope_label,
  // The binding window is the only one reported above `normal`; a model's
  // own weekly window is reported only while it binds.
  isActive: row.kind === "weekly_scoped" || row.severity !== "normal",
});

/** An account's reading, rebuilt from its own latest row per window. */
const rebuild = (account: string): void => {
  const latest = db
    .query(
      `SELECT h.* FROM usage_limit_history h
       WHERE h.account_id = ?1 AND h.id = (
         SELECT id FROM usage_limit_history x
         WHERE x.account_id = ?1 AND x.kind = h.kind
           AND ifnull(x.scope_label, '') = ifnull(h.scope_label, '')
         ORDER BY x.fetched_at DESC, x.id DESC LIMIT 1)
       ORDER BY h.kind, h.scope_label`
    )
    .all(account) as HistoryRow[];
  const was = db
    .query(
      "SELECT windows, subscription, overage, last_seen_at FROM account_readings WHERE account_id = ?"
    )
    .get(account) as {
    last_seen_at: number;
    overage: string | null;
    subscription: string | null;
    windows: string;
  } | null;
  if (latest.length === 0) {
    if (was) {
      db.run("DELETE FROM account_readings WHERE account_id = ?", [account]);
      process.stdout.write(`reading of ${nameOf(account)} removed: no rows\n`);
    }
    return;
  }
  const windows = JSON.stringify(latest.map(windowOf));
  const lastRead = Math.max(...latest.map((row) => row.fetched_at));
  // The overage is from the account's last event: kept only when that event
  // is one of its own rows' (not read after them).
  const overage = was && was.last_seen_at <= lastRead ? was.overage : null;
  if (
    was &&
    was.windows === windows &&
    was.overage === overage &&
    was.last_seen_at === lastRead
  ) {
    return;
  }
  db.run(
    `INSERT INTO account_readings (account_id, windows, subscription, overage, last_seen_at)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT (account_id) DO UPDATE SET windows = ?2, overage = ?4, last_seen_at = ?5`,
    [account, windows, was?.subscription ?? null, overage, lastRead]
  );
  process.stdout.write(
    `reading of ${nameOf(account)} rebuilt: ${latest
      .map(
        (row) =>
          `${row.kind}${row.scope_label ? `/${row.scope_label}` : ""} ${row.percent}% resets ${row.resets_at}`
      )
      .join(
        ", "
      )}${overage === null && was?.overage ? "; overage unknown until its next event" : ""}\n`
  );
};

const changed = db.transaction(() => {
  let n = 0;
  const move = db.prepare(
    "UPDATE usage_limit_history SET account_id = ? WHERE id = ?"
  );
  const remove = db.prepare("DELETE FROM usage_limit_history WHERE id = ?");
  for (const row of foreign) {
    n += (target ? move.run(target, row.id) : remove.run(row.id)).changes;
  }
  rebuild(accountId);
  if (target) {
    rebuild(target);
  }
  return n;
});

const n = changed.immediate();
process.stdout.write(`rows ${target ? "moved" : "removed"}: ${n}\n`);
printCounts("rows per account after", countsNow());
db.close();

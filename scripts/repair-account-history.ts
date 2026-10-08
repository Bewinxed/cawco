#!/usr/bin/env bun
/**
 * Puts each account's limit history back on the identity that read it, after
 * nightly 2132 filed a switched login's readings under the account the
 * machine's `~/.claude` used to be.
 *
 *   bun scripts/repair-account-history.ts <live cawco.db> <pre-0100 snapshot>
 *
 * A reading belongs to the identity signed in when it was read. What the
 * hub can still tell:
 *
 * - A row that matches a snapshot row (kind, scope, percent, severity, reset,
 *   read at) is a pre-account reading that migration 0100 kept and the hub
 *   adopted onto the account its machine's login answered as then. It stays.
 *   0100 renamed the table with its ids, but adoption's `INSERT … SELECT`
 *   gave every row a new one, so rows are matched by what they say.
 * - A row written since is one session event's window. One event reads one
 *   account, and one window series (kind, scope, reset to the minute) is one
 *   account's, so rows written at the same instant, and rows of one series,
 *   go together. A group tied to a snapshot row is the account's own. A group
 *   with a window live at the same time as one of the account's own of the
 *   same kind is someone else's: an account has one such window at a time.
 *   It moves to the own-login account of the machine whose `~/.claude`
 *   switched away from this account (its home sign-in is another account now).
 *
 * Anything else stops the run before it writes: a group tied to neither, two
 * machines that switched away from one account, a group with two windows of
 * one kind live at once. The script refuses to run while a machine that has
 * history has no signed-in home account (the hub makes it on the machine's
 * next register). Each moved-to or moved-from account's reading is rebuilt
 * from its own latest row per window. It prints rows per account before and
 * after, runs in one transaction, waits on a busy hub, and a second run
 * changes nothing.
 */
import { Database } from "bun:sqlite";

const [livePath, snapshotPath] = process.argv.slice(2);
if (!(livePath && snapshotPath)) {
  process.stderr.write(
    "usage: bun scripts/repair-account-history.ts <live cawco.db> <pre-0100 snapshot>\n"
  );
  process.exit(2);
}

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

interface SnapshotRow {
  fetched_at: number;
  kind: string;
  machine_id: string;
  percent: number;
  resets_at: string | null;
  scope_label: string | null;
  severity: string;
}

interface Window {
  group: string;
  isActive: boolean;
  kind: string;
  percent: number;
  resetsAt: string | null;
  scopeLabel: string | null;
  severity: string;
}

const fail = (why: string): never => {
  process.stderr.write(`refused: ${why}\nNothing was changed.\n`);
  process.exit(1);
};

/** What a row says, the identity it is matched to the snapshot by. */
const content = (row: Omit<HistoryRow, "account_id" | "id">): string =>
  [
    row.kind,
    row.scope_label ?? "",
    row.percent,
    row.severity,
    row.resets_at ?? "",
    row.fetched_at,
  ].join("\u0000");

/** A reset to the minute: the same window reads its reset a few ms apart. */
const resetMinute = (resetsAt: string | null): number =>
  resetsAt === null
    ? Number.POSITIVE_INFINITY
    : Math.round(Date.parse(resetsAt) / MINUTE_MS);

/** One account's window: its kind, scope and reset. */
const seriesOf = (row: HistoryRow): string =>
  [
    row.account_id,
    row.kind,
    row.scope_label ?? "",
    resetMinute(row.resets_at),
  ].join("\u0000");

const snapshot = new Database(snapshotPath, { readonly: true });
const snapshotRows = snapshot
  .query(
    "SELECT machine_id, kind, scope_label, percent, severity, resets_at, fetched_at FROM usage_limit_history"
  )
  .all() as SnapshotRow[];
snapshot.close();
const originOf = new Map<string, string>();
for (const row of snapshotRows) {
  originOf.set(content(row), row.machine_id);
}

const db = new Database(livePath);
db.run(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);

const accountName = new Map(
  (
    db.query("SELECT id, identity FROM accounts").all() as {
      id: string;
      identity: string | null;
    }[]
  ).map((row) => [
    row.id,
    row.identity
      ? `${(JSON.parse(row.identity) as { email: string }).email} (${row.id})`
      : row.id,
  ])
);
const nameOf = (id: string): string => accountName.get(id) ?? id;

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

const before = countsNow();
printCounts("rows per account before", before);

const rows = db
  .query(
    "SELECT id, account_id, kind, scope_label, percent, severity, resets_at, fetched_at FROM usage_limit_history"
  )
  .all() as HistoryRow[];

// Which account each machine's pre-account rows were adopted onto.
const adoptedOnto = new Map<string, Set<string>>();
for (const row of rows) {
  const machine = originOf.get(content(row));
  if (machine) {
    const onto = adoptedOnto.get(machine) ?? new Set<string>();
    onto.add(row.account_id);
    adoptedOnto.set(machine, onto);
  }
}

// Each machine's own login now, and the accounts its login switched away from.
const homes = new Map(
  (
    db
      .query(
        "SELECT machine_id, account_id FROM account_signins WHERE home = 1 AND state = 'signed-in'"
      )
      .all() as { account_id: string; machine_id: string }[]
  ).map((row) => [row.machine_id, row.account_id])
);
const switchedTo = new Map<string, Set<string>>();
for (const [machine, onto] of adoptedOnto) {
  const home = homes.get(machine);
  if (!home) {
    fail(
      `machine ${machine} has no signed-in home account yet; the fixed hub makes it on the machine's next register, then run this again`
    );
  }
  for (const account of onto) {
    if (account !== home) {
      const to = switchedTo.get(account) ?? new Set<string>();
      to.add(home as string);
      switchedTo.set(account, to);
    }
  }
}

// Union-find over one account's window series: one event, one identity.
const parent = new Map<string, string>();
const find = (x: string): string => {
  let root = x;
  while (parent.get(root) !== root) {
    root = parent.get(root) as string;
  }
  parent.set(x, root);
  return root;
};
const union = (a: string, b: string): void => {
  parent.set(find(a), find(b));
};

interface Series {
  first: number;
  kind: string;
  rows: HistoryRow[];
  scope: string;
  until: number;
}
const series = new Map<string, Series>();
const byInstant = new Map<string, string>();
for (const row of rows) {
  const key = seriesOf(row);
  if (!parent.has(key)) {
    parent.set(key, key);
  }
  const one = series.get(key) ?? {
    kind: row.kind,
    scope: row.scope_label ?? "",
    first: row.fetched_at,
    until: resetMinute(row.resets_at) * MINUTE_MS,
    rows: [],
  };
  one.first = Math.min(one.first, row.fetched_at);
  one.rows.push(row);
  series.set(key, one);
  const instant = `${row.account_id}\u0000${row.fetched_at}`;
  const met = byInstant.get(instant);
  if (met) {
    union(met, key);
  } else {
    byInstant.set(instant, key);
  }
}

/** Two windows of one kind and scope live at the same time: two identities. */
const concurrent = (a: Series, b: Series): boolean =>
  a.kind === b.kind &&
  a.scope === b.scope &&
  a.first < b.until &&
  b.first < a.until;

const groups = new Map<string, string[]>();
for (const key of series.keys()) {
  const root = find(key);
  groups.set(root, [...(groups.get(root) ?? []), key]);
}
const anchored = (keys: string[]): boolean =>
  keys.some((key) =>
    series.get(key)?.rows.some((row) => originOf.has(content(row)))
  );
const describe = (key: string): string => {
  const one = series.get(key) as Series;
  return `${one.kind}${one.scope ? `/${one.scope}` : ""} resetting ${new Date(one.until).toISOString()} (${one.rows.length} rows from ${new Date(one.first).toISOString()})`;
};

const moves: { account: string; ids: number[]; to: string }[] = [];
for (const [account, targets] of switchedTo) {
  const mine = [...groups.values()].filter((keys) =>
    keys[0]?.startsWith(`${account}\u0000`)
  );
  const own = mine.filter(anchored).flat();
  for (const keys of mine) {
    if (anchored(keys)) {
      continue;
    }
    for (const a of keys) {
      for (const b of keys) {
        if (
          a < b &&
          concurrent(series.get(a) as Series, series.get(b) as Series)
        ) {
          fail(
            `on ${nameOf(account)}, one group of readings has two windows live at once: ${describe(a)} and ${describe(b)}`
          );
        }
      }
    }
    const elsewhere = keys.some((key) =>
      own.some(
        (mineKey) =>
          mineKey !== key &&
          concurrent(series.get(key) as Series, series.get(mineKey) as Series)
      )
    );
    if (!elsewhere) {
      fail(
        `on ${nameOf(account)}, these readings are tied to neither its own history nor another identity's: ${keys.map(describe).join("; ")}`
      );
    }
    if (targets.size !== 1) {
      fail(
        `${nameOf(account)} holds readings of someone else, and more than one machine switched away from it (${[...targets].map(nameOf).join(", ")}): which login read them is not known`
      );
    }
    const [to] = [...targets] as [string];
    moves.push({
      account,
      to,
      ids: keys.flatMap((key) =>
        (series.get(key) as Series).rows.map((row) => row.id)
      ),
    });
  }
}

/** The window a history row records, as an account's reading holds it. */
const windowOf = (row: HistoryRow): Window => ({
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

const affected = new Set(moves.flatMap((move) => [move.account, move.to]));
const moved = db.transaction(() => {
  const update = db.prepare(
    "UPDATE usage_limit_history SET account_id = ? WHERE id = ?"
  );
  let n = 0;
  for (const move of moves) {
    for (const id of move.ids) {
      n += update.run(move.to, id).changes;
    }
  }
  // Each affected account's reading: its own latest row per window. The
  // overage a reading carries is from its last event; when that event was
  // someone else's, it is unknown until the account's next.
  const readings = new Map(
    (
      db
        .query(
          "SELECT account_id, windows, subscription, overage, last_seen_at FROM account_readings"
        )
        .all() as {
        account_id: string;
        last_seen_at: number;
        overage: string | null;
        subscription: string | null;
        windows: string;
      }[]
    ).map((row) => [row.account_id, row])
  );
  for (const account of affected) {
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
    if (latest.length === 0) {
      continue;
    }
    const windows = JSON.stringify(latest.map(windowOf));
    const lastRead = Math.max(...latest.map((row) => row.fetched_at));
    const was = readings.get(account);
    const lastSeen = Math.max(was?.last_seen_at ?? 0, lastRead);
    const overage = was && was.last_seen_at <= lastRead ? was.overage : null;
    if (
      was &&
      was.windows === windows &&
      was.overage === overage &&
      was.last_seen_at === lastSeen
    ) {
      continue;
    }
    db.run(
      `INSERT INTO account_readings (account_id, windows, subscription, overage, last_seen_at)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT (account_id) DO UPDATE SET windows = ?2, overage = ?4, last_seen_at = ?5`,
      [account, windows, was?.subscription ?? null, overage, lastSeen]
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
  }
  return n;
});

const n = moved.immediate();
for (const move of moves) {
  process.stdout.write(
    `moved ${move.ids.length} rows from ${nameOf(move.account)} to ${nameOf(move.to)}\n`
  );
}
process.stdout.write(`rows moved: ${n}\n`);
printCounts("rows per account after", countsNow());
db.close();

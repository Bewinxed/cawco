/**
 * `bun run owed-notices <database>` in packages/hub: what the hub's look at
 * owed notices (src/owed-ends.ts, sends.ts `endOwedNotices`, at its start and
 * each hour after) would end on a hub database, read before a hub with it
 * runs. Opens the database read-only (a copy of a live hub's, or a fixture
 * unpacked) and counts its owed sends (`sent_messages.owed_held`, or before
 * migration 0421 a kept `owed` envelope) by age, origin, hold and their
 * session's status; then, by owed-ends.ts's own rule, what would end and
 * why (its session never runs again, or it waited past the bound), in how
 * many sessions (each gets one line), and what stays owed and why. Writes
 * nothing.
 */

import { byPerson } from "@cawco/core/harness";
import { COMPACTION_ORIGIN } from "@cawco/core/harness/kinds";
import { asLastErrorKind } from "@cawco/core/relaunch";
import type { NeutralOrigin } from "@cawco/core/session-messages";
import { DAY_MS } from "@cawco/core/time";
import { OWED_NOTICE_DAYS, owedNoticeEnd } from "../src/owed-ends";
import { countedDatabase } from "./counted-database";

interface OwedRow {
  acceptedAt: number;
  hold: string | null;
  instanceId: string;
  lastErrorKind: string | null;
  originKind: string | null;
  originName: string | null;
  status: string | null;
}

const { client, has } = countedDatabase("owed-notices");
// Before 0421 an owed send kept its envelope in `owed`; after, the flag.
const owed = has("sent_messages", "owed_held")
  ? "s.owed_held = 1"
  : "s.owed IS NOT NULL";
// A column an older hub's schema did not have yet reads as none.
const column = (table: string, name: string, as: string): string =>
  `${has(table, name) ? `${table === "instances" ? "i" : "s"}.${name}` : "NULL"} AS ${as}`;
// Every JSON function inside a CASE that has proved its column JSON
// (db/json-reads.ts): SQLite may run the right side of an AND first.
const rows = client
  .query<OwedRow, []>(
    `SELECT s.instance_id AS instanceId, s.accepted_at AS acceptedAt, ${column("sent_messages", "hold", "hold")},
      CASE WHEN json_valid(s.body) THEN json_extract(s.body, '$.origin.kind') END AS originKind,
      CASE WHEN json_valid(s.body) THEN json_extract(s.body, '$.origin.name') END AS originName,
      i.status AS status, ${column("instances", "last_error_kind", "lastErrorKind")}
    FROM sent_messages s LEFT JOIN instances i ON i.id = s.instance_id
    WHERE s.state = 'pending' AND ${owed}
    ORDER BY s.accepted_at`
  )
  .all();
client.close();

const now = Date.now();
/** Counts by key, said largest first: "error 225, stopped 18". */
const tally = (keys: string[]): string => {
  const counts = new Map<string, number>();
  for (const key of keys) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return (
    [...counts]
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => `${key} ${count}`)
      .join(", ") || "none"
  );
};
/** The origin as the rule reads it: a `system` one by its name; any other is no notice. */
const originOf = (
  row: OwedRow
): Extract<NeutralOrigin, { kind: "system" }> | undefined =>
  row.originKind === "system"
    ? { kind: "system", ...(row.originName ? { name: row.originName } : {}) }
    : undefined;
/** The session's row as the rule reads it; none when the hub holds none. */
const sessionOf = (row: OwedRow) =>
  row.status === null
    ? undefined
    : { status: row.status, lastErrorKind: asLastErrorKind(row.lastErrorKind) };

const AGES: [string, number][] = [
  ["under 1 d", DAY_MS],
  ["1-7 d", 7 * DAY_MS],
  [`7-${OWED_NOTICE_DAYS} d`, OWED_NOTICE_DAYS * DAY_MS],
  [`${OWED_NOTICE_DAYS}-30 d`, 30 * DAY_MS],
  ["30 d or more", Number.POSITIVE_INFINITY],
];
const ageOf = (row: OwedRow): string =>
  AGES.find(([, below]) => now - row.acceptedAt < below)?.[0] ?? "";
const day = (at: number | undefined): string =>
  at === undefined ? "none" : new Date(at).toISOString().slice(0, 16);

console.log(
  `owed sends: ${rows.length} (${owed.includes("owed_held") ? "owed_held" : "before 0421: owed envelope"}), oldest ${day(rows[0]?.acceptedAt)}, newest ${day(rows.at(-1)?.acceptedAt)}`
);
console.log(`  by age: ${tally(rows.map(ageOf))}`);
console.log(
  `  by origin: ${tally(rows.map((row) => `${row.originKind ?? "unread"}${row.originName ? `/${row.originName}` : ""}`))}`
);
console.log(
  `  by hold: ${tally(rows.map((row) => row.hold ?? "none written"))}`
);
console.log(
  `  by session: ${tally(rows.map((row) => row.status ?? "no row"))}`
);

const ended = rows.flatMap((row) => {
  const why = owedNoticeEnd(
    { acceptedAt: row.acceptedAt, origin: originOf(row) },
    sessionOf(row),
    now
  );
  return why ? [{ row, why }] : [];
});
const sessions = new Map<
  string,
  { count: number; status: string; why: string }
>();
for (const { row, why } of ended) {
  sessions.set(row.instanceId, {
    count: (sessions.get(row.instanceId)?.count ?? 0) + 1,
    status: row.status ?? "no row",
    why,
  });
}
console.log(
  `would end: ${ended.length} (${tally(ended.map(({ why }) => (why === "ended" ? "session never runs again" : `waited over ${OWED_NOTICE_DAYS} d`)))}) in ${sessions.size} session(s), one line each`
);
const kept = rows.filter((row) => !ended.some((one) => one.row === row));
/** Why an owed send stays: no notice, the person's own act, or a notice under the bound to a session that runs again. */
const keptWhy = (row: OwedRow): string => {
  const origin = originOf(row);
  if (!origin) {
    return `${row.originKind ?? "unread"}'s word, no notice`;
  }
  return byPerson(origin) || origin.name === COMPACTION_ORIGIN
    ? "the person's act"
    : `a notice under ${OWED_NOTICE_DAYS} d to a session that runs again`;
};
console.log(`stays owed: ${kept.length} (${tally(kept.map(keptWhy))})`);
for (const [instanceId, one] of sessions) {
  console.log(
    `  ${instanceId.slice(0, 8)} ${one.status}: ${one.count} ${one.why}`
  );
}

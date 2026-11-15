/**
 * `bun run cold-waits-heads <database>` in packages/hub: what migrations
 * 0425 to 0428 will do to a hub database's sessions' cold readings
 * (`instances.cache_cold`), work items' waits since their last delivered
 * message (`work_items.wait_history`), attempts' witnesses
 * (`work_items.waited_on`, the cards and pins an attempt was dispatched on)
 * and retired workspaces' heads (`workspaces.head`), read before they run.
 * Opens the database read-only (a copy of a live hub's, or a fixture
 * unpacked) and counts each column's rows as placed (it reads whole and
 * moves to columns or rows as it is), never set (the column's "not set": not
 * measured cold, no wait since the last delivered message, dispatched on no
 * card or pin, no head) and restrictive (it does not read whole: the session
 * reads as cold; no count is vouched for and the parent hears the waits do
 * not read; each card or pin no placed witness names counts as possibly
 * decided differently; no known head, so the workspace is not cut again),
 * with how many of those are partly readable, and names each restrictive
 * row. Read with the migrations' own predicates (db/cache-cold-unread.ts,
 * db/wait-history-unread.ts, db/waits-unread.ts,
 * db/workspace-heads-unread.ts); a table its migration has run on is said
 * so and not counted.
 */
import { cacheColdKept } from "../src/db/cache-cold-unread";
import { shown } from "../src/db/lifted-reading";
import { waitHistoryKept } from "../src/db/wait-history-unread";
import { waitsKept } from "../src/db/waits-unread";
import { workspaceHeadsKept } from "../src/db/workspace-heads-unread";
import { countedDatabase } from "./counted-database";

const { client, has, ran } = countedDatabase("cold-waits-heads");
/** How many of `rows` read as `kind`. */
const count = <Row extends { reading: { kind: string } }>(
  rows: readonly Row[],
  kind: string
): number => rows.filter((row) => row.reading.kind === kind).length;
/** One line per restrictive row: its key, its value as stored, why, and how many of its entries are placed when some may be. */
const restrictive = (
  rows: readonly {
    id: string;
    raw: string | null;
    reading: { kind: string; placed?: number; why?: string };
  }[]
): void => {
  for (const { id, raw, reading } of rows) {
    if (reading.kind === "unread" && raw !== null) {
      console.log(
        `  restrictive: ${id}: ${shown(raw)}: ${reading.why ?? ""}${reading.placed === undefined ? "" : `; ${reading.placed} placed`}`
      );
    }
  }
};

/**
 * How many restrictive values of `rows` read in part: a JSON object one of
 * whose `fields` holds the type the hub wrote (none of it is placed).
 */
const partly = (
  rows: readonly { raw: string | null; reading: { kind: string } }[],
  fields: Readonly<Record<string, "number" | "string">>
): number =>
  rows.filter(({ raw, reading }) => {
    if (reading.kind !== "unread" || raw === null) {
      return false;
    }
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      return false;
    }
    return (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      Object.entries(value).some(
        ([key, held]) => key in fields && typeof held === fields[key]
      )
    );
  }).length;

if (has("instances", "cache_cold")) {
  const sessions = cacheColdKept(client);
  console.log(
    `instances.cache_cold: ${sessions.length} read, ${count(sessions, "placed")} placed, ${count(sessions, "never")} never set (not measured cold), ${count(sessions, "unread")} restrictive (read as cold until a real turn or a ping; ${partly(sessions, { at: "number", reason: "string" })} partly readable, none of which is placed)`
  );
  restrictive(sessions);
} else {
  ran("instances.cache_cold", "0425");
}

if (has("work_items", "wait_history")) {
  const items = waitHistoryKept(client);
  const live = items.filter(
    (item) => item.reading.kind === "placed" && item.reading.live
  ).length;
  console.log(
    `work_items.wait_history: ${items.length} read, ${count(items, "placed")} placed (${live} whose last wait is the live one, its copy not placed), ${count(items, "never")} never set (no wait since the last delivered message), ${count(items, "unread")} restrictive (no count vouched for, the parent hears they do not read; ${partly(items, { count: "number", until: "number", reason: "string" })} partly readable, none of which is placed)`
  );
  restrictive(items);
} else {
  ran("work_items.wait_history", "0426");
}

if (has("work_items", "waited_on")) {
  const items = waitsKept(client);
  const placed = items.flatMap((item) =>
    item.reading.kind === "placed" ? [item.reading.placed] : []
  );
  const unread = items.flatMap((item) =>
    item.reading.kind === "unread" ? [item.reading.placed] : []
  );
  console.log(
    `work_items.waited_on: ${items.length} read, ${placed.length} placed (${placed.reduce((sum, one) => sum + one, 0)} witnesses), ${count(items, "never")} never set (dispatched on no card or pin), ${unread.length} restrictive (${unread.filter((one) => one > 0).length} partly readable, ${unread.reduce((sum, one) => sum + one, 0)} witnesses placed beside them; each card or pin no placed witness names counts as possibly decided differently)`
  );
  restrictive(items);
} else {
  ran("work_items.waited_on", "0427");
}

if (has("workspaces", "head")) {
  const workspaces = workspaceHeadsKept(client);
  const carried = workspaces.filter(
    (workspace) =>
      workspace.reading.kind === "placed" && workspace.reading.carry
  ).length;
  console.log(
    `workspaces.head: ${workspaces.length} read, ${count(workspaces, "placed")} placed (${carried} with a carry), ${count(workspaces, "never")} never set (no head), ${count(workspaces, "unread")} restrictive (no known head, not cut again; ${partly(workspaces, { branch: "string", commit: "string", carry: "string" })} partly readable, none of which is placed)`
  );
  restrictive(workspaces);
} else {
  ran("workspaces.head", "0428");
}
client.close();

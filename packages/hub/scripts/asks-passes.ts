/**
 * `bun run asks-passes <database>` in packages/hub: what migrations 0408
 * and 0409 will do to a hub database's asks (`asks.record`, each ask whole
 * as JSON) and preview passes (`preview_passes.scope`, the origins a pass
 * opens), read before they run. Opens the database read-only (a copy of a
 * live hub's, or a fixture unpacked) and counts each column's rows as
 * placed (it reads whole and moves to columns as it is), never set (the
 * column's "not set": an ask's record never is, it was NOT NULL; a pass's
 * scope null, opening every origin as today), and restrictive (it does not
 * read whole: an ask never granted, answered or carried, and withdrawn if
 * open; a pass that opens no origin), and names each restrictive row and
 * each pass that keeps a meaning its writers never give (a session's pass
 * with no scope, which opens every origin; one with no session and a list,
 * which opens that list alone). Read with the migrations' own predicates
 * (db/asks-unread.ts, db/pass-scopes-unread.ts); a table its migration has
 * run on is said so and not counted.
 */
import { Database } from "bun:sqlite";
import { asksKept } from "../src/db/asks-unread";
import { passScopesKept } from "../src/db/pass-scopes-unread";

const [path] = process.argv.slice(2);
if (!path) {
  console.error("asks-passes: name the database: bun run asks-passes <path>");
  process.exit(2);
}
const client = new Database(path, { readonly: true });
/** Whether `table` has `column`: the JSON column a migration drops is still there. */
const has = (table: string, column: string): boolean =>
  client
    .query<{ name: string }, []>(`PRAGMA table_info(${table})`)
    .all()
    .some((one) => one.name === column);

if (has("asks", "record")) {
  const kept = asksKept(client);
  const unread = kept.flatMap((ask) =>
    ask.reading.kind === "unread" ? [{ ...ask, reading: ask.reading }] : []
  );
  console.log(
    `asks.record: ${kept.length} read, ${kept.length - unread.length} placed, 0 never set (NOT NULL since its first migration), ${unread.length} restrictive (${unread.filter((ask) => ask.state === "open").length} open)`
  );
  for (const ask of unread) {
    console.log(
      `  restrictive: ${ask.id} (${ask.state}, session ${ask.instanceId}): ${JSON.stringify(ask.raw.slice(0, 160))}: ${ask.reading.why}; placed ${ask.reading.placed.join(", ") || "none"}`
    );
  }
} else {
  console.log(
    `asks.record: 0408 has run on ${path}; read a copy taken before it`
  );
}

if (has("preview_passes", "scope")) {
  const passes = passScopesKept(client);
  const every = passes.filter((pass) => pass.reading.kind === "every");
  const placed = passes.filter((pass) => pass.reading.kind === "placed");
  const unread = passes.filter((pass) => pass.reading.kind === "unread");
  const whose = (instanceId: string | null): string =>
    instanceId ? `session ${instanceId}'s` : "the person's";
  console.log(
    `preview_passes.scope: ${passes.length} read, ${placed.length} placed (${placed.filter((pass) => pass.instanceId === null).length} with no session), ${every.length} never set, opening every origin (${every.filter((pass) => pass.instanceId !== null).length} a session's), ${unread.length} restrictive, opening none`
  );
  for (const pass of every.filter((one) => one.instanceId !== null)) {
    console.log(
      `  never set, a session's: ${pass.id} (${whose(pass.instanceId)}): opens every origin, as today`
    );
  }
  for (const pass of placed.filter((one) => one.instanceId === null)) {
    console.log(
      `  placed, no session: ${pass.id}: opens its ${pass.reading.kind === "placed" ? pass.reading.origins : 0} origins alone, as today`
    );
  }
  for (const pass of unread) {
    console.log(
      `  restrictive: ${pass.id} (${whose(pass.instanceId)}): ${JSON.stringify(pass.raw)}: ${pass.reading.kind === "unread" ? pass.reading.why : ""}`
    );
  }
} else {
  console.log(
    `preview_passes.scope: 0409 has run on ${path}; read a copy taken before it`
  );
}
client.close();

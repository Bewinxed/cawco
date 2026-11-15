/**
 * `bun run queued-requests <database>` in packages/hub: what
 * migration 0405 will do to a hub database's queued starts, read before it
 * runs. Opens the database read-only (a copy of a live hub's, or a fixture
 * unpacked) and lists every queued delegate's kept call
 * (`queued_work_items.request`) and every queued attempt's kept ask
 * (`queued_task_starts.asked`): how many read and how many 0405 holds, each
 * by its id, the held ones with why. Read with 0405's own predicates
 * (db/queued-unread.ts), so it says what that migration will do; one
 * 0405 has run on is refused.
 */
import { Database } from "bun:sqlite";
import { heldWhy, queuedKept } from "../src/db/queued-unread";

const [path] = process.argv.slice(2);
if (!path) {
  console.error(
    "queued-requests: name the database: bun run queued-requests <path>"
  );
  process.exit(2);
}
const client = new Database(path, { readonly: true });
const ran = client
  .query<{ name: string }, []>("PRAGMA table_info(queued_work_items)")
  .all()
  .some((column) => column.name === "request_unread");
if (ran) {
  console.error(
    `queued-requests: 0405 has run on ${path}; read a copy taken before it`
  );
  process.exit(1);
}
const kept = queuedKept(client);
client.close();
for (const table of ["queued_work_items", "queued_task_starts"] as const) {
  const rows = kept.filter((row) => row.table === table);
  const reading = rows.filter((row) => row.reads);
  const held = rows.filter((row) => !row.reads);
  console.log(
    `${table}: ${rows.length} kept, ${reading.length} read, ${held.length} held by 0405`
  );
  for (const row of reading) {
    console.log(`  reads: ${row.id}`);
  }
  for (const row of held) {
    console.log(`  held: ${heldWhy(row)}`);
  }
}

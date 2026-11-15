/**
 * `bun run lifted-columns <database>` in packages/hub: what migrations 0410
 * to 0413 will do to a hub database's stored values they lift out of JSON
 * into columns, read before they run: limit lines' kinds and compaction
 * plans' moves (0410, `limit_events.move`, `limit_compactions.move`), where
 * workspaces were cut from (0411, `workspaces.cut_from`), work items'
 * blocks (0412, `work_items.blocked`) and sends' origins (0413,
 * `sent_messages.body`). Opens the database read-only (a copy of a live
 * hub's, or a fixture unpacked) and counts each column's values as never
 * set (read as before), placed (it reads whole and is placed as it is), or
 * restrictive (it does not read whole: kept as stored, nothing of it
 * placed, read with the meaning that never widens what the hub does), and
 * names each restrictive one. Read with each migration's own predicates
 * (db/limit-lines-unread.ts, db/cut-from-unread.ts,
 * db/item-blocks-unread.ts, db/send-origins-unread.ts), so it says what
 * that migration will do; for a migration that has already run it says
 * so, and reads nothing of its columns.
 */
import { cutFromKept } from "../src/db/cut-from-unread";
import { itemBlocksKept } from "../src/db/item-blocks-unread";
import { limitLinesKept } from "../src/db/limit-lines-unread";
import { sendOriginsKept } from "../src/db/send-origins-unread";
import { liftedReport } from "./lifted-report";

const { client, columns, report, ran } = liftedReport("lifted-columns");

if (columns.has("limit_events.kind")) {
  ran("0410", "limit_events.move, limit_compactions.move");
} else {
  const lines = limitLinesKept(client);
  report(
    "limit_events.move",
    lines.filter((row) => row.table === "limit_events")
  );
  report(
    "limit_compactions.move",
    lines.filter((row) => row.table === "limit_compactions")
  );
}
if (columns.has("workspaces.cut_from_workspace")) {
  ran("0411", "workspaces.cut_from");
} else {
  report("workspaces.cut_from", cutFromKept(client));
}
if (columns.has("work_items.blocked_kind")) {
  ran("0412", "work_items.blocked");
} else {
  report("work_items.blocked", itemBlocksKept(client));
}
if (columns.has("sent_messages.origin_kind")) {
  ran("0413", "sent_messages.body origin");
} else {
  report("sent_messages.body origin", sendOriginsKept(client));
}
client.close();

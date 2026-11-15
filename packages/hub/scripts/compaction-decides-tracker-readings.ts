/**
 * `bun run compaction-decides-tracker-readings <database>` in packages/hub:
 * what migrations 0429 to 0432 will do to a hub database's stored values
 * they lift out of JSON into columns, read before they run: compaction
 * plans' moves and readings (0429, `limit_compactions.move` and `.fill`),
 * how he hears of answers and the flock's poses (0430,
 * `decides_settings.hear` and `.pictures`), trackers' cursors (0431,
 * `tracker_bindings.cursor`) and accounts' extra usage and window sets
 * (0432, `account_readings.overage` and `.window_kinds`). Opens the
 * database read-only (a copy of a live hub's, or a fixture unpacked) and
 * counts each column's values as never set (read as before), placed (it
 * reads whole and is placed as it is), or restrictive (it does not read
 * whole: kept as stored, what of it reads placed where the migration says
 * so, read with the meaning that never widens what the hub does), and
 * names each restrictive one. Read with each migration's own predicates
 * (db/compaction-plans-unread.ts, db/decides-settings-unread.ts,
 * db/tracker-cursors-unread.ts, db/account-readings-unread.ts), so it says
 * what that migration will do; for a migration that has already run it
 * says so, and reads nothing of its columns.
 */
import { accountReadingsKept } from "../src/db/account-readings-unread";
import { compactionPlansKept } from "../src/db/compaction-plans-unread";
import { decidesSettingsKept } from "../src/db/decides-settings-unread";
import { trackerCursorsKept } from "../src/db/tracker-cursors-unread";
import { liftedReport } from "./lifted-report";

const { client, columns, report, ran } = liftedReport(
  "compaction-decides-tracker-readings"
);

if (columns.has("limit_compactions.kind")) {
  ran("0429", "limit_compactions.move, limit_compactions.fill");
} else {
  const plans = compactionPlansKept(client);
  for (const column of ["move", "fill"] as const) {
    report(
      `limit_compactions.${column}`,
      plans.filter((row) => row.column === column)
    );
  }
}
if (columns.has("decides_settings.advisor_hear")) {
  ran("0430", "decides_settings.hear, decides_settings.pictures");
} else {
  const settings = decidesSettingsKept(client);
  for (const column of ["hear", "pictures"] as const) {
    report(
      `decides_settings.${column}`,
      settings.filter((row) => row.column === column)
    );
  }
}
if (columns.has("tracker_bindings.issues_since")) {
  ran("0431", "tracker_bindings.cursor");
} else {
  report("tracker_bindings.cursor", trackerCursorsKept(client));
}
if (columns.has("account_readings.overage_in_use")) {
  ran("0432", "account_readings.overage, account_readings.window_kinds");
} else {
  const readings = accountReadingsKept(client);
  for (const column of ["overage", "window_kinds"] as const) {
    report(
      `account_readings.${column}`,
      readings.filter((row) => row.column === column)
    );
  }
}
client.close();

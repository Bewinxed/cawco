/**
 * `bun run fleet-machine-columns <database>` in packages/hub: what
 * migrations 0422, 0423 and 0424 will do to a hub database's skills' and
 * plugins' last fetch (`last_refresh`, which 0422 places in the `refresh_*`
 * columns), skills', plugins' and kept skill versions' files (`files`,
 * which the step before 0423 places as rows of `skill_files`,
 * `plugin_files` and `skill_version_files`, the trash's skills and plugins
 * with them), machines' pauses (`agents.pause_stopped`) and tools' sign-ins
 * (`agent_tools.signin`, both of which 0424 places in columns), and the
 * platform 0424 drops from machines' capabilities as a copy of `agents.os`,
 * read before they run. Opens the database read-only (a copy of a live
 * hub's, or a fixture unpacked) and counts each column's rows as placed (it
 * reads whole and moves as it is), never set (null: placed as none, as
 * before) and restrictive (it does not read whole, or in part: kept as
 * stored in its `*_unread` column, none of it placed), and names each
 * restrictive row. Read with the migrations' own predicates
 * (db/fleet-refresh-unread.ts, db/fleet-files-unread.ts,
 * db/machine-columns-unread.ts); a column its migration has run on is said
 * so and not counted.
 */
import { Database } from "bun:sqlite";
import { isUtf8 } from "node:buffer";
import { fleetFilesKept, trashRefreshKept } from "../src/db/fleet-files-unread";
import { fleetRefreshKept } from "../src/db/fleet-refresh-unread";
import type { Lifted } from "../src/db/lifted-reading";
import {
  namedPlatforms,
  osPlatform,
  pauseStoppedKept,
  signinKept,
} from "../src/db/machine-columns-unread";

const [path] = process.argv.slice(2);
if (!path) {
  console.error(
    "fleet-machine-columns: name the database: bun run fleet-machine-columns <path>"
  );
  process.exit(2);
}
const client = new Database(path, { readonly: true });
/** Each table's columns, read once: a JSON column a migration drops is there until it runs. */
const columns = new Map<string, Set<string>>();
const has = (table: string, column: string): boolean => {
  const named =
    columns.get(table) ??
    new Set(
      client
        .query<{ name: string }, [string]>(
          "SELECT name FROM pragma_table_info(?)"
        )
        .all(table)
        .map((one) => one.name)
    );
  columns.set(table, named);
  return named.has(column);
};
/** A value as this shows it, on one line, its first 120 characters. */
const shown = (raw: string | null): string =>
  JSON.stringify(raw === null ? "" : raw.slice(0, 120));
/** Says that `migration` has run on the database, so `what` is not counted. */
const ran = (what: string, migration: string): void =>
  console.log(
    `${what}: ${migration} has run on ${path}; read a copy taken before it`
  );
/** One column's counts, and each restrictive row by its key and why. */
const counted = <Row extends Lifted>(
  column: string,
  rows: Row[],
  name: (row: Row) => string = (row) => row.key
): void => {
  const of = (kind: string) => rows.filter((row) => row.reading.kind === kind);
  console.log(
    `${column}: ${rows.length} read, ${of("placed").length} placed, ${of("unset").length} never set, ${of("restrictive").length} restrictive`
  );
  for (const row of of("restrictive")) {
    console.log(
      `  restrictive: ${name(row)}: ${shown(row.raw)}: ${row.reading.kind === "restrictive" ? row.reading.why : ""}`
    );
  }
};

/** Says that `what` is not in this database's schema yet: the build it came from is older than the column. */
const notYet = (what: string): void =>
  console.log(`${what}: not in ${path}'s schema yet, nothing to move`);

/** Counts `column`, or says its migration has run (`moved`, the column it adds) or that it is not there yet. */
const each = (
  [table, column]: [string, string],
  moved: [string, string],
  migration: string,
  count: () => void
): void => {
  if (has(table, column)) {
    count();
  } else if (has(...moved)) {
    ran(`${table}.${column}`, migration);
  } else {
    notYet(`${table}.${column}`);
  }
};

each(["skills", "last_refresh"], ["skills", "refresh_unread"], "0422", () => {
  const refresh = fleetRefreshKept(client);
  const trashed = has("config_trash", "rows") ? trashRefreshKept(client) : [];
  for (const table of ["skills", "plugins"] as const) {
    counted(
      `${table}.last_refresh`,
      refresh.filter((row) => row.table === table)
    );
    counted(
      `  in the trash, ${table}.last_refresh`,
      trashed.filter((row) => row.table === table),
      (row) => `${row.key} (trash entry ${row.trash})`
    );
  }
});

each(["skills", "files"], ["skill_files", "content"], "0423", () => {
  const files = fleetFilesKept(client, has("config_trash", "rows"));
  for (const table of ["skills", "plugins", "fleet_skill_history"] as const) {
    const rows = files.filter((row) => row.table === table);
    const live = rows.filter((row) => row.trash === undefined);
    const trashed = rows.filter((row) => row.trash !== undefined);
    counted(`${table}.files`, live);
    const placed = live.flatMap((row) =>
      row.reading.kind === "placed" ? (row.reading.files ?? []) : []
    );
    console.log(
      `  placed: ${placed.length} files, ${placed.filter((file) => file.executable).length} executable, ${placed.filter((file) => !isUtf8(file.content)).length} not UTF-8, ${placed.reduce((total, file) => total + file.content.length, 0)} bytes; ${live.filter((row) => row.reading.kind === "placed" && (row.reading.files ?? []).length === 0).length} lists empty`
    );
    if (table !== "fleet_skill_history") {
      counted(
        `  in the trash, ${table}.files`,
        trashed,
        (row) => `${row.key} (trash entry ${row.trash})`
      );
    }
  }
});

each(
  ["agents", "pause_stopped"],
  ["agents", "pause_stopped_unread"],
  "0424",
  () => counted("agents.pause_stopped", pauseStoppedKept(client))
);
each(["agent_tools", "signin"], ["agent_tools", "signin_unread"], "0424", () =>
  counted("agent_tools.signin", signinKept(client))
);
each(
  ["agents", "machine_capabilities"],
  ["agents", "pause_stopped_unread"],
  "0424",
  () => {
    if (has("agents", "pause_stopped_unread")) {
      ran("agents.machine_capabilities.platform", "0424");
      return;
    }
    const machines =
      client
        .query<{ found: number }, []>("SELECT count(*) AS found FROM agents")
        .get()?.found ?? 0;
    const named = namedPlatforms(client);
    const other = named.filter((one) => one.platform !== osPlatform(one.os));
    console.log(
      `agents.machine_capabilities.platform: ${machines} machines, ${named.length} name a platform (dropped), ${named.length - other.length} the same as their os's, ${other.length} another`
    );
    for (const one of other) {
      console.log(
        `  another: ${one.machineId}: ${shown(String(one.platform))}, os ${shown(one.os)}`
      );
    }
  }
);

each(
  ["design_checks", "pick"],
  ["design_checks", "id"],
  "0396_drop_dead_columns",
  () =>
    console.log(
      `design_checks.pick: ${client.query<{ found: number }, []>("SELECT count(pick) AS found FROM design_checks").get()?.found ?? 0} set; 0396_drop_dead_columns drops it, nothing reads it`
    )
);
client.close();

/**
 * Before migration 0406's SQL runs, the hub's log names every fleet MCP
 * server whose stored platforms 0406 keeps as `platforms_unread`, every
 * trashed one it keeps the same way, and the fleet's routes when 0406 keeps
 * them as `routes_unread` (a value that is there and does not read whole),
 * with why: the journal of the day it runs records each server then sent to
 * no machine, and the routes then read as `you` for every kind. Selected
 * with 0406's own predicates (the builders below, which 0406's SQL was
 * written from), over the JSON `mcp_servers.platforms`,
 * `config_trash.rows` and `decides_settings.routes` as they stand before
 * it. {@link platformsRoutesKept} reads every such value, for the count
 * taken on a copy before 0406 runs.
 *
 * Each JSON function sits inside a CASE that has proved its argument JSON
 * of the right type: SQLite may run the right side of an AND first, so an
 * AND would not keep them off a value that is not JSON.
 */
import type { Database } from "bun:sqlite";
import { MCP_PLATFORMS } from "@cawco/core/fleet";
import { shown } from "./json-reads";
import { DECIDES_ID } from "./schema";

/** The platforms a server can be scoped to, as an SQL list. */
const PLATFORMS = MCP_PLATFORMS.map((platform) => `'${platform}'`).join(", ");

/** `value` is a JSON list. */
const platformsList = (value: string): string =>
  `CASE WHEN json_valid(${value}) THEN json_type(${value}) = 'array' ELSE 0 END`;

/** `value` reads whole as platforms: a JSON list whose every entry is one of them. */
const platformsRead = (value: string): string =>
  `CASE WHEN json_valid(${value}) THEN CASE WHEN json_type(${value}) = 'array' THEN NOT EXISTS (SELECT 1 FROM json_each(${value}) e WHERE e.type <> 'text' OR e.value NOT IN (${PLATFORMS})) ELSE 0 END ELSE 0 END`;

/** The entries of `value` that read as platforms, as rows `e` of `json_each` (filter with {@link PLATFORM_ENTRY}). */
const platformEntries = (value: string): string =>
  `json_each(CASE WHEN ${platformsList(value)} THEN ${value} ELSE '[]' END) e`;

/** A `json_each` row `e` that is a platform. */
const PLATFORM_ENTRY = `e.type = 'text' AND e.value IN (${PLATFORMS})`;

/** `value` is a JSON object. */
const routesObject = (value: string): string =>
  `CASE WHEN json_valid(${value}) THEN json_type(${value}) = 'object' ELSE 0 END`;

/** `value` reads whole as routes: a JSON object whose every member is text. */
const routesRead = (value: string): string =>
  `CASE WHEN json_valid(${value}) THEN CASE WHEN json_type(${value}) = 'object' THEN NOT EXISTS (SELECT 1 FROM json_each(${value}) e WHERE e.type <> 'text') ELSE 0 END ELSE 0 END`;

/**
 * A trash entry holding one MCP server row whose platforms 0406 converts:
 * its first part is `mcp_servers` with one row that names the server.
 */
const TRASHED_SERVER =
  "CASE WHEN json_valid(rows) THEN CASE WHEN json_type(rows) = 'array' THEN coalesce(json_extract(rows, '$[0].table') = 'mcp_servers' AND json_type(rows, '$[0].rows[0]') = 'object' AND json_type(rows, '$[0].rows[0].name') = 'text', 0) ELSE 0 END ELSE 0 END";

/** A trashed server's platforms, as its row kept them; null for none. Only inside {@link TRASHED_SERVER}. */
const TRASHED_PLATFORMS = "json_extract(rows, '$[0].rows[0].platforms')";

/** What a stored value of platforms or routes is to 0406. */
type Reading =
  /** Null: never set, read as before. */
  | { kind: "unset" }
  /** It reads whole and is placed as it is. */
  | { kind: "placed"; placed: string[] }
  /** It does not read whole: kept as stored, what reads placed, and read restrictively. */
  | { kind: "restrictive"; placed: string[]; why: string };

/** One value 0406 reads: the server's name, `trash <id>/<server>`, or the routes. */
export interface Kept {
  key: string;
  raw: string | null;
  reading: Reading;
  table: "config_trash" | "decides_settings" | "mcp_servers";
}

interface Row {
  bad: string | null;
  badCount: number | null;
  json: number;
  key: string;
  placed: string | null;
  raw: string | null;
  reads: number;
  shaped: number;
}

/** What a value's entries must be: one, and several. */
interface Wants {
  one: string;
  several: string;
}

/** Why a value does not read, in a clause. */
const whyOf = (row: Row, shape: string, wants: Wants): string => {
  if (row.json === 0) {
    return "it is not JSON";
  }
  if (row.shaped === 0) {
    return `it is not ${shape}`;
  }
  return `${row.bad ?? "an entry"} ${row.badCount === 1 ? wants.one : wants.several}`;
};

const PLATFORM_WANTS: Wants = {
  one: "is not a platform",
  several: "are not platforms",
};
const MEMBER_WANTS: Wants = {
  one: "is not a member's name",
  several: "are not members' names",
};

/** The values 0406 places of a row, as its `placed` column lists them, `,`-joined. */
const placedOf = (row: Row): string[] =>
  row.placed === null ? [] : row.placed.split(",");

const readingOf = (row: Row, shape: string, wants: Wants): Reading => {
  if (row.raw === null) {
    return { kind: "unset" };
  }
  return row.reads
    ? { kind: "placed", placed: placedOf(row) }
    : {
        kind: "restrictive",
        placed: placedOf(row),
        why: whyOf(row, shape, wants),
      };
};

/** Every server's platforms, live and trashed, as 0406 reads them. */
const platformsKept = (client: Database): Kept[] => {
  const columns = (value: string) =>
    `CAST(${value} AS TEXT) AS raw, CASE WHEN json_valid(${value}) THEN 1 ELSE 0 END AS json, ${platformsList(value)} AS shaped, ${platformsRead(value)} AS reads, (SELECT group_concat(DISTINCT e.value) FROM ${platformEntries(value)} WHERE ${PLATFORM_ENTRY}) AS placed, CASE WHEN ${platformsList(value)} THEN (SELECT group_concat(json_quote(e.value), ', ') FROM json_each(${value}) e WHERE NOT (${PLATFORM_ENTRY})) END AS bad, CASE WHEN ${platformsList(value)} THEN (SELECT count(*) FROM json_each(${value}) e WHERE NOT (${PLATFORM_ENTRY})) END AS badCount`;
  const live = client
    .query<Row, []>(
      `SELECT name AS key, ${columns("platforms")} FROM mcp_servers ORDER BY rowid`
    )
    .all()
    .map((row): Kept => ({
      table: "mcp_servers",
      key: row.key,
      raw: row.raw,
      reading: readingOf(row, "a list of platforms", PLATFORM_WANTS),
    }));
  const trashed = client
    .query<Row, []>(
      `SELECT n || ' (trash entry ' || id || ')' AS key, ${columns("p")} FROM (SELECT id, CASE WHEN ${TRASHED_SERVER} THEN json_extract(rows, '$[0].rows[0].name') END AS n, CASE WHEN ${TRASHED_SERVER} THEN ${TRASHED_PLATFORMS} END AS p FROM config_trash WHERE kind = 'mcp' AND ${TRASHED_SERVER}) ORDER BY id`
    )
    .all()
    .map((row): Kept => ({
      table: "config_trash",
      key: row.key,
      raw: row.raw,
      reading: readingOf(row, "a list of platforms", PLATFORM_WANTS),
    }));
  return [...live, ...trashed];
};

/**
 * The fleet's routes as 0406 reads them; none when it has no settings row.
 * Only the `'decides'` row's are placed (the one the hub reads); another
 * row is checked and kept the same way, and places nothing.
 */
const routesKept = (client: Database): Kept[] =>
  client
    .query<Row, []>(
      `SELECT id AS key, CAST(routes AS TEXT) AS raw, CASE WHEN json_valid(routes) THEN 1 ELSE 0 END AS json, ${routesObject("routes")} AS shaped, ${routesRead("routes")} AS reads, CASE WHEN id <> '${DECIDES_ID}' THEN NULL WHEN ${routesObject("routes")} THEN (SELECT group_concat(e.key || ' → ' || e.value) FROM json_each(routes) e WHERE e.type = 'text' AND e.key IN (SELECT id FROM decides_kinds)) END AS placed, CASE WHEN ${routesObject("routes")} THEN (SELECT group_concat(json_quote(e.key) || ': ' || coalesce(json_quote(e.value), 'null'), ', ') FROM json_each(routes) e WHERE e.type <> 'text') END AS bad, CASE WHEN ${routesObject("routes")} THEN (SELECT count(*) FROM json_each(routes) e WHERE e.type <> 'text') END AS badCount FROM decides_settings ORDER BY id`
    )
    .all()
    // `{}` sets no kind: every kind reads as core's seed, as no row does.
    .map((row) => (row.raw === "{}" ? { ...row, raw: null } : row))
    .map((row) => ({
      table: "decides_settings" as const,
      key: row.key,
      raw: row.raw,
      reading: readingOf(row, "an object of kinds", MEMBER_WANTS),
    }));

/** Every value 0406 reads, as it reads it. Run on a database 0406 has not run on. */
export const platformsRoutesKept = (client: Database): Kept[] => [
  ...platformsKept(client),
  ...routesKept(client),
];

/** Logs every value 0406 keeps as not read, one line each. Run only in a start that applies 0406 (db/migrate.ts). */
export const logPlatformsRoutesUnread = (client: Database): void => {
  for (const kept of platformsRoutesKept(client)) {
    const { reading } = kept;
    if (
      reading.kind !== "restrictive" ||
      (kept.table === "decides_settings" && kept.key !== DECIDES_ID)
    ) {
      continue;
    }
    const placed =
      reading.placed.length > 0
        ? `${reading.placed.join(", ")} placed`
        : "none of it placed";
    console.info(
      kept.table === "decides_settings"
        ? `[migrations] 0406: the fleet's routes ${shown(kept.raw ?? "")} do not read: ${reading.why}; ${placed}; every kind goes to you until the routes are saved again`
        : `[migrations] 0406: ${kept.table === "config_trash" ? "trashed " : ""}MCP server ${kept.key}: its platforms ${shown(kept.raw ?? "")} do not read: ${reading.why}; ${placed}; it is sent to no machine until its platforms are saved again`
    );
  }
};

/**
 * Migration 0423's move, run in code just before its SQL: a skill's, a
 * plugin's and a kept skill version's files (`skills.files`,
 * `plugins.files`, `fleet_skill_history.files`) were one JSON list each,
 * every file's bytes as base64 text. SQL cannot turn base64 into bytes, so
 * this step reads each list and places each file as a row of the tables
 * 0422 made (`skill_files`, `plugin_files`, `skill_version_files`), its
 * bytes exactly as the base64 says them; 0423 then drops the three
 * columns, with `last_refresh` (placed by 0422's SQL). The rows the trash
 * keeps (`config_trash.rows` of a skill or a plugin) move the same way, so
 * one put back is in the new shape, its files with it (db/trash.ts keeps a
 * file's bytes as base64 in the trash).
 *
 * A list reads when it reads whole as the hub read it ({@link FILES},
 * stored/columns.json at 0421, core `SkillFile`, frozen here and said in
 * SQL by db/json-reads.ts), each file's base64 is the one text its bytes
 * encode to (anything else is not one set of bytes, so none could be kept
 * exactly), and no two files share a path. The base64 the wire carries is
 * made from the bytes again, so a row's hash (over that text, core
 * `hashFiles`) is the one it had, and no machine syncs again.
 *
 * A list that is there and does not read, whole or in part, places no file
 * of its row: never a partial skill. It is kept as stored in
 * `files_unread` and logged by its row. A skill or plugin kept so holds no
 * files (`files_held` false): a machine is sent its hash alone, so one that
 * holds that copy keeps it and one that does not installs nothing and says
 * the bytes are missing; its listing says why (db/fleet-catalog.ts), and
 * a skill's is fetched again as the hub starts, as any skill whose last
 * fetch failed. A version kept so is not restored. A fetch that stores files
 * again replaces a skill's kept value, which goes into its history as such
 * a version, and a plugin's.
 *
 * {@link fleetFilesKept} reads every row with the same reads, for the
 * count taken on a copy before 0423 runs (scripts/fleet-machine-columns.ts).
 */
import type { Database } from "bun:sqlite";
import { REFRESH_WHY, refreshReads } from "./fleet-refresh-unread";
import { FLAG, inJson, listOf, object, readsWhole, TEXT } from "./json-reads";
import { type Reading, shown } from "./lifted-reading";
import { trashedEntries } from "./trash";

/** A row's files, as the three `files` columns held them (core `SkillFile[]`). */
const FILES = listOf(
  object({ contentBase64: TEXT, executable: FLAG, path: TEXT })
);

/** `value`, a column or a bound parameter, reads whole as a list of files. */
const filesReads = (value: string): string => readsWhole(value, FILES);

/** One file, placed: its path, its place in its list, its execute bit and its bytes. */
interface PlacedFile {
  content: Buffer;
  executable: boolean;
  path: string;
  position: number;
}

/** What a stored list is to 0423, with its files when it reads. */
type FilesReading = Reading & { files?: PlacedFile[] };

interface Entry {
  content: string;
  executable: number;
  path: string;
}

/**
 * `raw` as 0423 reads it: never set (null), placed with its files, or kept
 * as not read and why. Read with SQL over the value as stored: its shape by
 * {@link filesReads}, its entries by `json_each`, each inside a CASE that
 * proved it JSON.
 */
const readFiles = (client: Database, raw: string | null): FilesReading => {
  if (raw === null) {
    return { kind: "unset" };
  }
  const shape = client
    .query<{ json: number; reads: number }, [string]>(
      `SELECT CASE WHEN json_valid(?1) THEN 1 ELSE 0 END AS json, ${filesReads("?1")} AS reads`
    )
    .get(raw);
  if (!shape?.reads) {
    return {
      kind: "restrictive",
      why: shape?.json
        ? "it is not a list of files, each a path, an execute bit and its bytes as base64"
        : "it is not JSON",
    };
  }
  const entries = client
    .query<Entry, [string]>(
      `SELECT ${inJson("e.value", "json_extract(e.value, '$.path')")} AS path, ${inJson("e.value", "json_extract(e.value, '$.executable')")} AS executable, ${inJson("e.value", "json_extract(e.value, '$.contentBase64')")} AS content FROM json_each(CASE WHEN json_valid(?1) THEN ?1 ELSE '[]' END) e ORDER BY e.id`
    )
    .all(raw);
  const files: PlacedFile[] = [];
  const paths = new Set<string>();
  for (const entry of entries) {
    const content = Buffer.from(entry.content, "base64");
    if (content.toString("base64") !== entry.content) {
      return {
        kind: "restrictive",
        why: `the bytes of ${entry.path} are not base64 that one set of bytes encodes to`,
      };
    }
    if (paths.has(entry.path)) {
      return {
        kind: "restrictive",
        why: `two of its files are ${entry.path}`,
      };
    }
    paths.add(entry.path);
    files.push({
      path: entry.path,
      position: files.length,
      executable: entry.executable === 1,
      content,
    });
  }
  return { kind: "placed", files };
};

/** The three tables whose files move, each with its key and the table its files go to. */
const TABLES = [
  { table: "skills", key: "name", files: "skill_files", owner: "skill_name" },
  { table: "plugins", key: "id", files: "plugin_files", owner: "plugin_id" },
  {
    table: "fleet_skill_history",
    key: "id",
    files: "skill_version_files",
    owner: "version_id",
  },
] as const;

type Table = (typeof TABLES)[number]["table"];

/** One row's files as 0423 reads them: its table, its key, the value as stored, and what 0423 makes of it. */
export interface KeptFiles {
  key: string;
  raw: string | null;
  reading: FilesReading;
  table: Table;
  /** The trash entry it is kept in; absent for a live row. */
  trash?: number;
}

/**
 * Each live row's files as 0423 reads them, one row at a time, handed to
 * `each` before the next is read: the fleet's files are tens of megabytes,
 * and no more than one row's are held at once.
 */
const eachLive = (
  client: Database,
  each: (kept: KeptFiles, key: string | number) => void
): void => {
  for (const { table, key } of TABLES) {
    const read = client.query<{ raw: string | null }, [string | number]>(
      `SELECT CAST(files AS TEXT) AS raw FROM ${table} WHERE ${key} = ?`
    );
    for (const row of client
      .query<{ key: string | number }, []>(
        `SELECT ${key} AS key FROM ${table} ORDER BY ${key}`
      )
      .all()) {
      const raw = read.get(row.key)?.raw ?? null;
      each(
        { table, key: String(row.key), raw, reading: readFiles(client, raw) },
        row.key
      );
    }
  }
};

type Value = string | number | null;

/** The trash's kinds whose rows hold files. */
const TRASH_KINDS = ["skill", "plugin"] as const;

/** The trashed skill or plugin row a part holds, by its table. */
const trashedTable = (table: string) =>
  TABLES.find(
    (one) => one.table === table && one.table !== "fleet_skill_history"
  );

/** Every trashed skill's and plugin's files as 0423 reads them. */
const trashKept = (client: Database): KeptFiles[] =>
  trashedEntries(client, TRASH_KINDS).flatMap((entry) =>
    entry.rows.flatMap((part) => {
      const of = trashedTable(part.table);
      return of
        ? part.rows.map((row) => {
            const raw = typeof row.files === "string" ? row.files : null;
            return {
              table: of.table,
              key: String(row[of.key]),
              raw,
              reading: readFiles(client, raw),
              trash: entry.id,
            };
          })
        : [];
    })
  );

/** One trashed row's last fetch as the step before 0423 reads it, by 0422's predicate: its table, its key, its trash entry, the value as kept. */
export interface TrashedRefresh {
  key: string;
  raw: string | null;
  reading: Reading;
  table: "skills" | "plugins";
  trash: number;
}

/** A trashed row's last fetch as 0422's predicate reads it. */
const refreshReadingOf = (client: Database, raw: string | null): Reading => {
  if (raw === null) {
    return { kind: "unset" };
  }
  const read = client
    .query<{ json: number; reads: number }, [string]>(
      `SELECT CASE WHEN json_valid(?1) THEN 1 ELSE 0 END AS json, ${refreshReads("?1")} AS reads`
    )
    .get(raw);
  if (read?.reads) {
    return { kind: "placed" };
  }
  return {
    kind: "restrictive",
    why: read?.json ? REFRESH_WHY : "it is not JSON",
  };
};

/** Every trashed skill's and plugin's last fetch, as the step before 0423 places it. Run on a database 0423 has not run on. */
export const trashRefreshKept = (client: Database): TrashedRefresh[] =>
  trashedEntries(client, TRASH_KINDS).flatMap((entry) =>
    entry.rows.flatMap((part) => {
      const of = trashedTable(part.table);
      if (!of || of.table === "fleet_skill_history") {
        return [];
      }
      const { table } = of;
      return part.rows.map((row) => {
        const raw =
          typeof row.last_refresh === "string" ? row.last_refresh : null;
        return {
          table,
          key: String(row[of.key]),
          raw,
          reading: refreshReadingOf(client, raw),
          trash: entry.id,
        };
      });
    })
  );

/**
 * Every row's files, live and in the trash (`trash` false: a database from
 * before the trash, which has none), as 0423 reads them. Run on a database
 * 0423 has not run on.
 */
export const fleetFilesKept = (
  client: Database,
  trash: boolean
): KeptFiles[] => {
  const live: KeptFiles[] = [];
  eachLive(client, (kept) => live.push(kept));
  return [...live, ...(trash ? trashKept(client) : [])];
};

/** What a row is called in a log line. */
const NOUNS: Record<Table, string> = {
  skills: "skill",
  plugins: "plugin",
  fleet_skill_history: "kept skill version",
};

/** What a row kept as not read comes to, in a log line. */
const OUTCOMES: Record<Table, string> = {
  skills:
    "it holds no files: machines are sent its hash alone, and its listing says why until a fetch stores files again",
  plugins:
    "it holds no files: machines are sent its hash alone, and its listing says why until a fetch stores files again",
  fleet_skill_history: "it holds no files and is not restored",
};

const logUnread = (kept: KeptFiles): void => {
  if (kept.reading.kind !== "restrictive" || kept.raw === null) {
    return;
  }
  console.info(
    `[migrations] 0423: the ${NOUNS[kept.table]} ${kept.key}${kept.trash === undefined ? "" : ` (trash entry ${kept.trash})`}: its files ${shown(kept.raw)} do not read: ${kept.reading.why}; kept as not read, no file placed: ${OUTCOMES[kept.table]}`
  );
};

/** A live row's files placed as rows, or kept as not read, logged. */
const placeLive = (
  client: Database,
  one: KeptFiles,
  key: string | number
): void => {
  logUnread(one);
  const of = TABLES.find((each) => each.table === one.table);
  if (!of || one.reading.kind === "unset") {
    return;
  }
  if (one.reading.kind === "restrictive") {
    client
      .query(`UPDATE ${of.table} SET files_unread = ? WHERE ${of.key} = ?`)
      .run(one.raw, key);
    return;
  }
  const insert = client.query(
    `INSERT INTO ${of.files} (${of.owner}, path, position, executable, content) VALUES (?, ?, ?, ?, ?)`
  );
  for (const file of one.reading.files ?? []) {
    insert.run(
      key,
      file.path,
      file.position,
      file.executable ? 1 : 0,
      file.content
    );
  }
  if (of.table !== "fleet_skill_history") {
    client
      .query(`UPDATE ${of.table} SET files_held = 1 WHERE ${of.key} = ?`)
      .run(key);
  }
};

/** A trashed row's last fetch, placed as 0422 places a live one, or kept as not read. */
const movedRefresh = (
  client: Database,
  raw: Value | undefined
): Record<string, Value> => {
  const value = typeof raw === "string" ? raw : null;
  const read = client
    .query<Record<string, Value>, [string | null]>(
      `SELECT CASE WHEN ?1 IS NULL THEN NULL WHEN ${refreshReads("?1")} THEN NULL ELSE ?1 END AS refresh_unread, ${(
        [
          ["refresh_at", "at"],
          ["refresh_outcome", "outcome"],
          ["refresh_error", "error"],
          ["refresh_from_hash", "fromHash"],
          ["refresh_from_version", "fromVersion"],
          ["refresh_to_hash", "toHash"],
          ["refresh_to_version", "toVersion"],
        ] as const
      )
        .map(
          ([column, field]) =>
            `CASE WHEN json_valid(?1) THEN CASE WHEN ${refreshReads("?1")} THEN json_extract(?1, '$.${field}') END END AS ${column}`
        )
        .join(", ")}`
    )
    .get(value);
  return read ?? {};
};

/** A trashed skill's or plugin's row in the new shape, and its files' rows (each file's bytes as base64, as db/trash.ts keeps them). */
const movedTrashRow = (
  client: Database,
  row: Record<string, Value>,
  kept: KeptFiles | undefined,
  owner: string
): { files: Record<string, Value>[]; row: Record<string, Value> } => {
  const { files: _files, last_refresh: lastRefresh, ...rest } = row;
  const placed =
    kept?.reading.kind === "placed" ? kept.reading.files : undefined;
  return {
    row: {
      ...rest,
      files_held: placed ? 1 : 0,
      files_unread: kept?.reading.kind === "restrictive" ? kept.raw : null,
      ...movedRefresh(client, lastRefresh),
    },
    files: (placed ?? []).map((file) => ({
      [owner]: kept?.key ?? null,
      path: file.path,
      position: file.position,
      executable: file.executable ? 1 : 0,
      content: file.content.toString("base64"),
    })),
  };
};

/** Each trash entry of a skill or a plugin in the new shape, rewritten. */
const moveTrash = (client: Database, kept: KeptFiles[]): void => {
  const write = client.query<unknown, [string, number]>(
    "UPDATE config_trash SET rows = ? WHERE id = ?"
  );
  for (const entry of trashedEntries(client, TRASH_KINDS)) {
    const parts = entry.rows.flatMap((part) => {
      const of = trashedTable(part.table);
      if (!of) {
        return [part];
      }
      const moved = part.rows.map((row) =>
        movedTrashRow(
          client,
          row,
          kept.find(
            (one) =>
              one.trash === entry.id &&
              one.table === of.table &&
              one.key === String(row[of.key])
          ),
          of.owner
        )
      );
      const files = moved.flatMap((one) => one.files);
      return [
        { table: part.table, rows: moved.map((one) => one.row) },
        ...(files.length > 0 ? [{ table: of.files, rows: files }] : []),
      ];
    });
    write.run(JSON.stringify(parts), entry.id);
  }
};

/**
 * 0423's move (db/migrate.ts `fleet-files`): every live row's files placed
 * as rows or kept as not read, then the trash's skills and plugins
 * rewritten in the new shape (their last fetch placed by 0422's
 * predicate, {@link movedRefresh}), each value kept as not read logged.
 */
export const placeFleetFiles = (client: Database): void => {
  eachLive(client, (one, key) => placeLive(client, one, key));
  const trashed = trashKept(client);
  for (const one of trashed) {
    logUnread(one);
  }
  for (const one of trashRefreshKept(client)) {
    if (one.reading.kind === "restrictive" && one.raw !== null) {
      console.info(
        `[migrations] 0423: the ${NOUNS[one.table]} ${one.key} (trash entry ${one.trash}): its last fetch ${shown(one.raw)} does not read: ${one.reading.why}; kept as not read, no last fetch is said until the next one`
      );
    }
  }
  moveTrash(client, trashed);
};

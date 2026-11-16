/**
 * Before migration 0424's SQL runs, the hub's log names every machine whose
 * stored pause (`agents.pause_stopped`, how many merge checks and commands
 * its pause stopped as it began, as JSON) and every tool whose stored
 * sign-in (`agent_tools.signin`, whether it is signed in on a machine, as
 * JSON) 0424 keeps as not read: a value that is there and does not read
 * whole as the hub read it, with why. It names too every machine whose
 * capabilities named a platform other than the first part of its `os`,
 * which 0424 drops from them as a copy of it (core `machinePlatform`).
 *
 * What 0424 makes of a value that does not read, kept as stored in its
 * `*_unread` column:
 * - a pause's counts: none placed (both 0). The pause itself is
 *   `paused_until`, untouched, so the machine stays paused until then; its
 *   row says it stopped work it no longer counts (core words
 *   `machinePauseWords.stoppedUncounted`), until the pause ends.
 * - a sign-in: nothing placed; it reads as signed out (core words
 *   `toolWords.signinKeptUnread`), so nothing that needs the tool signed in
 *   runs on it, until the machine says its sign-in again.
 *
 * The predicates below are 0424's own: its SQL was written from them, over
 * the columns as they stand before it. {@link STOPPED} and {@link SIGNIN}
 * are the columns' shapes as the hub read them then (stored/columns.json at
 * 0421, core `StoppedCommands` and `NamedToolSignin`), frozen here.
 * {@link pauseStoppedKept} and {@link signinKept} read every row with them, for the count taken
 * on a copy before 0424 runs (scripts/fleet-machine-columns.ts).
 *
 * Every JSON function sits inside a CASE that has proved its column JSON
 * (db/json-reads.ts): SQLite may run the right side of an AND first.
 */
import type { Database } from "bun:sqlite";
import {
  inJson,
  type Lifted,
  NUMBER,
  object,
  type Reading,
  readsWhole,
  recordOf,
  shown,
  TEXT,
} from "./json-reads";

/** A pause's counts, as `agents.pause_stopped` held them (core `StoppedCommands`): a count by kind. */
const STOPPED = recordOf(NUMBER);

/** The kinds a pause counts (core `RunKind`): a key of any other name does not read. */
const STOPPED_KEYS = "('merge check', 'command')";

/** A pause's counts read whole: an object of numbers whose every key is a kind. */
const STOPPED_READ = `CASE WHEN ${readsWhole("pause_stopped", STOPPED)} THEN coalesce(${inJson("pause_stopped", `NOT EXISTS (SELECT 1 FROM json_each(pause_stopped) k WHERE k.key NOT IN ${STOPPED_KEYS})`)}, 0) ELSE 0 END`;

/** A sign-in, as `agent_tools.signin` held it (core `NamedToolSignin`). */
const SIGNIN = object({ at: NUMBER, state: TEXT }, { detail: TEXT });

/** A sign-in read whole. */
const SIGNIN_READ = readsWhole("signin", SIGNIN);

/** The platform a machine's capabilities named, when they are an object that names one. */
const NAMED_PLATFORM = inJson(
  "machine_capabilities",
  "CASE WHEN json_type(machine_capabilities) = 'object' THEN json_extract(machine_capabilities, '$.platform') END"
);

/** One value 0424 reads: its column, its row's key, the value as stored, and what 0424 makes of it. */
export interface KeptMachineValue extends Lifted {
  column: "agents.pause_stopped" | "agent_tools.signin";
}

/** A machine whose capabilities named a platform, and whether it is its `os`'s. */
export interface NamedPlatform {
  machineId: string;
  os: string;
  platform: string;
}

interface Row {
  json: number | null;
  key: string;
  raw: string | null;
  reads: number;
}

const readingOf = (row: Row, why: string): Reading => {
  if (row.raw === null) {
    return { kind: "unset" };
  }
  if (row.reads) {
    return { kind: "placed" };
  }
  return { kind: "restrictive", why: row.json ? why : "it is not JSON" };
};

/** Every machine's pause as 0424 reads it. Run on a database 0424 has not run on. */
export const pauseStoppedKept = (client: Database): KeptMachineValue[] =>
  client
    .query<Row, []>(
      `SELECT machine_id AS key, CAST(pause_stopped AS TEXT) AS raw, CASE WHEN json_valid(pause_stopped) THEN 1 ELSE 0 END AS json, ${STOPPED_READ} AS reads FROM agents ORDER BY machine_id`
    )
    .all()
    .map((row) => ({
      column: "agents.pause_stopped" as const,
      key: row.key,
      raw: row.raw,
      reading: readingOf(
        row,
        "it is not a count of merge checks and commands by kind"
      ),
    }));

/** Every tool's sign-in as 0424 reads it. Run on a database 0424 has not run on. */
export const signinKept = (client: Database): KeptMachineValue[] =>
  client
    .query<Row, []>(
      `SELECT machine_id || ' ' || tool_id AS key, CAST(signin AS TEXT) AS raw, CASE WHEN json_valid(signin) THEN 1 ELSE 0 END AS json, ${SIGNIN_READ} AS reads FROM agent_tools ORDER BY machine_id, tool_id`
    )
    .all()
    .map((row) => ({
      column: "agent_tools.signin" as const,
      key: row.key,
      raw: row.raw,
      reading: readingOf(
        row,
        "it is not a sign-in's state and when it was read"
      ),
    }));

/** Every machine whose capabilities name a platform, with its `os`. Run on a database 0424 has not run on. */
export const namedPlatforms = (client: Database): NamedPlatform[] =>
  client
    .query<NamedPlatform, []>(
      `SELECT machine_id AS machineId, os, platform FROM (SELECT machine_id, os, ${NAMED_PLATFORM} AS platform FROM agents) WHERE platform IS NOT NULL ORDER BY machine_id`
    )
    .all();

/** The platform a machine's `os` names (core `machinePlatform`). */
export const osPlatform = (os: string): string => os.split("-")[0] ?? "";

/** Logs every value 0424 keeps as not read, and every platform it drops that was not its machine's `os`'s, one line each. Run only in a start that applies 0424 (db/migrate.ts). */
export const logMachineColumnsUnread = (client: Database): void => {
  for (const row of [...pauseStoppedKept(client), ...signinKept(client)]) {
    if (row.reading.kind !== "restrictive" || row.raw === null) {
      continue;
    }
    console.info(
      row.column === "agents.pause_stopped"
        ? `[migrations] 0424: machine ${row.key}: what its pause stopped ${shown(row.raw)} does not read: ${row.reading.why}; kept as not read, none counted: it stays paused until its pause ends, and says it stopped work it no longer counts`
        : `[migrations] 0424: the tool ${row.key}: its sign-in ${shown(row.raw)} does not read: ${row.reading.why}; kept as not read: it reads as signed out until the machine says its sign-in again`
    );
  }
  for (const named of namedPlatforms(client)) {
    if (named.platform !== osPlatform(named.os)) {
      console.info(
        `[migrations] 0424: machine ${named.machineId}: its capabilities named the platform ${shown(String(named.platform))}, its os ${shown(named.os)}: dropped, its platform is read from its os`
      );
    }
  }
};

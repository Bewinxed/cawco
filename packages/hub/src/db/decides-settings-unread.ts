/**
 * Before migration 0430's SQL runs, the hub's log names every Who decides
 * settings row whose stored hearing (`decides_settings.hear`, how he hears
 * of the Advisor's and Common practice's answers) or poses
 * (`decides_settings.pictures`, the pose each of Caw's flock wears) 0430
 * keeps as not read: a value that is there and does not read whole, with
 * why. What of it reads is placed beside it.
 *
 * The predicates below are 0430's own: its SQL was written from them, over
 * the JSON columns as they stand before it. {@link HEAR} and
 * {@link PICTURES} are the columns' shapes as the hub read them then
 * (stored/columns.json), frozen here. {@link decidesSettingsKept} reads
 * every row with them, for the count taken on a copy before 0430 runs
 * (scripts/compaction-decides-tracker-readings.ts).
 *
 * Every JSON function sits inside a CASE that has proved its column JSON
 * (db/json-reads.ts): SQLite may run the right side of an AND first.
 */
import type { Database } from "bun:sqlite";
import { CAW_POSE_IDS, HEARS } from "@cawco/core/decides";
import {
  type JsonShape,
  type Lifted,
  type LiftedRow,
  liftedColumns,
  liftedRows,
  logRestrictive,
  object,
  oneOf,
  readsWhole,
  shown,
} from "./json-reads";

/** How he hears of a member's answers (core `HEARS`). */
const HEAR_VALUE = oneOf(...HEARS);

/** A pose of Caw's flock (core `CAW_POSE_IDS`). */
const POSE = oneOf(...CAW_POSE_IDS);

/** Each member's hearing, as 0430 places it: its key and its column. */
const HEAR_FIELDS = [
  ["advisor", "advisor_hear"],
  ["practice", "practice_hear"],
] as const;

/** Each flock member's pose, as 0430 places it: its key and its column. */
const POSE_FIELDS = [
  ["caw", "caw_pose"],
  ["advisor", "advisor_pose"],
  ["practice", "practice_pose"],
  ["asker", "asker_pose"],
] as const;

/** `decides_settings.hear` as the hub read it: each member's hearing, any left out. */
const HEAR = object(
  {},
  Object.fromEntries(HEAR_FIELDS.map(([key]) => [key, HEAR_VALUE]))
);

/** `decides_settings.pictures` as the hub read it: each flock member's pose, any left out. */
const PICTURES = object(
  {},
  Object.fromEntries(POSE_FIELDS.map(([key]) => [key, POSE]))
);

/** `hear` reads whole. */
const HEAR_READS = readsWhole("hear", HEAR);

/** `pictures` reads whole. */
const PICTURES_READS = readsWhole("pictures", PICTURES);

/** `column`'s `key` is there and reads as `value`: what 0430 places of a value that may not read whole. */
const fieldReads = (column: string, key: string, value: JsonShape): string =>
  readsWhole(column, object({ [key]: value }));

/** A row as 0430 reads one of its values, with what of it is placed. */
interface Row extends LiftedRow {
  placed: string | null;
}

/** Why a value that is an object does not read: which of its fields does not, what read placed. */
const fieldsOff = (row: Row): string[] => [
  `a field is not one of its values${row.placed ? `; ${row.placed} placed` : "; none placed"}`,
];

/** The fields of `column` 0430 places, named, as SQL: null when none. */
const placedNames = (
  column: string,
  fields: readonly (readonly [string, string])[],
  value: JsonShape
): string =>
  `nullif(trim(${fields.map(([key]) => `CASE WHEN ${fieldReads(column, key, value)} THEN '${key} ' ELSE '' END`).join(" || ")}), '')`;

/** One settings row's value as 0430 reads it, and which column. */
export type KeptSetting = Lifted & { column: "hear" | "pictures" };

/** Every settings row's hearing and poses as 0430 reads them. Run on a database 0430 has not run on. */
export const decidesSettingsKept = (client: Database): KeptSetting[] =>
  (
    [
      ["hear", HEAR_READS, HEAR_FIELDS, HEAR_VALUE],
      ["pictures", PICTURES_READS, POSE_FIELDS, POSE],
    ] as const
  ).flatMap(([column, reads, fields, value]) =>
    liftedRows<Row>(
      client,
      `SELECT id AS key, ${liftedColumns(column, reads)}, ${placedNames(column, fields, value)} AS placed FROM decides_settings ORDER BY id`,
      fieldsOff
    ).map((row) => ({ ...row, column }))
  );

/** Logs every hearing and poses 0430 keeps as not read, one line each. Run only in a start that applies 0430 (db/migrate.ts). */
export const logDecidesSettingsUnread = (client: Database): void => {
  const kept = decidesSettingsKept(client);
  logRestrictive(
    kept.filter((row) => row.column === "hear"),
    (row, why) =>
      `[migrations] 0430: Who decides ${row.key}: how he hears of answers ${shown(row.raw ?? "")} does not read: ${why}; kept as stored, a member it left unplaced hears each answer until he sets it`
  );
  logRestrictive(
    kept.filter((row) => row.column === "pictures"),
    (row, why) =>
      `[migrations] 0430: Who decides ${row.key}: the flock's poses ${shown(row.raw ?? "")} do not read: ${why}; kept as stored, a member it left unplaced wears its default pose`
  );
};

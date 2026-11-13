/**
 * A column that names a session, a machine or a project is declared as one
 * (`sessionColumn("parent_instance_id")`): the schema's one statement of
 * which columns name an owner, read back by migrations:check to hold each to
 * a foreign key, the owned-rows registry or a named exception
 * (db/owned-rows.ts). Each is a custom text column carrying its owner in its
 * config, as a stored JSON column carries its shape (stored-json.ts).
 */
import { is } from "drizzle-orm";
import { customType, SQLiteCustomColumn } from "drizzle-orm/sqlite-core";

/** What a marked column names. */
export type OwnerKind = "session" | "machine" | "project";

/** What a marked column's config holds. */
interface OwnerConfig {
  owner: OwnerKind;
}

const ownerText = customType<{
  data: string;
  driverData: string;
  config: OwnerConfig;
  configRequired: true;
}>({ dataType: () => "text" });

/** A text column holding a session's id (`instances.id`). */
export const sessionColumn = <Name extends string>(name: Name) =>
  ownerText(name, { owner: "session" });
/** A text column holding a machine's id (`agents.machine_id`). */
export const machineColumn = <Name extends string>(name: Name) =>
  ownerText(name, { owner: "machine" });
/** A text column holding a project's id (`projects.id`). */
export const projectColumn = <Name extends string>(name: Name) =>
  ownerText(name, { owner: "project" });

const isOwnerConfig = (value: unknown): value is OwnerConfig =>
  typeof value === "object" &&
  value !== null &&
  "owner" in value &&
  (value.owner === "session" ||
    value.owner === "machine" ||
    value.owner === "project");

/** What `column` was declared to name, if it names an owner. */
export const ownerOf = (column: unknown): OwnerKind | undefined => {
  if (!is(column, SQLiteCustomColumn)) {
    return;
  }
  // `config` is protected in Drizzle's types and public at runtime (column.js `this.config = config`).
  const config: unknown = Reflect.get(column, "config");
  const declared =
    typeof config === "object" && config !== null && "fieldConfig" in config
      ? config.fieldConfig
      : undefined;
  return isOwnerConfig(declared) ? declared.owner : undefined;
};

/**
 * A column that names a session, a machine or a project is declared as one
 * (`sessionColumn("parent_instance_id")`), whatever it is called: the mark
 * is what migrations:check reads to hold every such column to a foreign
 * key, the owned-rows registry or a named exception (db/owned-rows.ts).
 */
import type { Column } from "drizzle-orm";
import { text } from "drizzle-orm/sqlite-core";

/** What a marked column names. */
export type OwnerKind = "session" | "machine" | "project";

/** Each marked column's config, by what it names. */
const marks = new WeakMap<object, OwnerKind>();

/**
 * A builder's config, which drizzle hands on whole to the column it builds
 * (`Column.config`): one object from declaration to table, kept protected
 * in drizzle's types, so the mark set on one is read on the other.
 */
const configOf = (builderOrColumn: object): object =>
  (builderOrColumn as unknown as { config: object }).config;

const declared = (kind: OwnerKind) => (name: string) => {
  const builder = text(name);
  marks.set(configOf(builder), kind);
  return builder;
};

/** A text column holding a session's id (`instances.id`). */
export const sessionColumn = declared("session");
/** A text column holding a machine's id (`agents.machine_id`). */
export const machineColumn = declared("machine");
/** A text column holding a project's id (`projects.id`). */
export const projectColumn = declared("project");

/** What `column` was declared to name, if it names an owner. */
export const ownerOf = (column: Column): OwnerKind | undefined =>
  marks.get(configOf(column));

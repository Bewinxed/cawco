import {
  byTriggerKind,
  type Thing,
  type TriggerKind,
  type TriggerSetting,
  UNSET_TRIGGER_SETTING,
} from "@cawco/core/triggers";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  fleetTriggerSettings,
  heldTriggers,
  projectTriggerSettings,
} from "./schema";

export type HeldTriggerRow = typeof heldTriggers.$inferSelect;

/** A trigger held on its project, as the router holds it (hub triggers.ts). */
export interface HeldTrigger {
  at: Date;
  delta: string;
  kind: string;
  thing: Thing & { name: string };
  what: string;
  who: string;
}

/** The rows the trigger router keeps (hub triggers.ts, trigger-settings.ts). */
export interface TriggersDb {
  /** The fleet's own setting for each kind; unset fields null. */
  readonly fleetSettings: () => Record<TriggerKind, TriggerSetting>;
  /** Holds one trigger on its project: nothing started for it. */
  readonly hold: (projectId: string, held: HeldTrigger) => void;
  /** The project's own setting for each kind; unset fields null. */
  readonly projectSettings: (
    projectId: string
  ) => Record<TriggerKind, TriggerSetting>;
  /** Writes the fleet's setting for `kind` as given whole. */
  readonly setFleet: (kind: TriggerKind, setting: TriggerSetting) => void;
  /** Writes the project's setting for `kind` as given whole. */
  readonly setProject: (
    projectId: string,
    kind: TriggerKind,
    setting: TriggerSetting
  ) => void;
  /** Every trigger held on the project, oldest first, taken: the rows go in the same step. */
  readonly takeHeld: (projectId: string) => HeldTriggerRow[];
}

const settingOf = (row: TriggerSetting | undefined): TriggerSetting =>
  row
    ? {
        account: row.account,
        harness: row.harness,
        mode: row.mode,
        model: row.model,
      }
    : UNSET_TRIGGER_SETTING;

const byKind = (
  rows: (TriggerSetting & { kind: TriggerKind })[]
): Record<TriggerKind, TriggerSetting> => {
  const found = new Map(rows.map((row) => [row.kind, row]));
  return byTriggerKind((kind) => settingOf(found.get(kind)));
};

export const triggersDb = (db: BunSQLiteDatabase): TriggersDb => ({
  fleetSettings: () => byKind(db.select().from(fleetTriggerSettings).all()),
  projectSettings: (projectId) =>
    byKind(
      db
        .select()
        .from(projectTriggerSettings)
        .where(eq(projectTriggerSettings.projectId, projectId))
        .all()
    ),
  setFleet: (kind, setting) => {
    db.insert(fleetTriggerSettings)
      .values({ kind, ...setting })
      .onConflictDoUpdate({ target: fleetTriggerSettings.kind, set: setting })
      .run();
  },
  setProject: (projectId, kind, setting) => {
    db.insert(projectTriggerSettings)
      .values({ projectId, kind, ...setting })
      .onConflictDoUpdate({
        target: [projectTriggerSettings.projectId, projectTriggerSettings.kind],
        set: setting,
      })
      .run();
  },
  hold: (projectId, held) => {
    db.insert(heldTriggers)
      .values({
        id: crypto.randomUUID(),
        projectId,
        kind: held.kind,
        thingKind: held.thing.kind,
        thingId: held.thing.id,
        thingName: held.thing.name,
        what: held.what,
        delta: held.delta,
        who: held.who,
        at: held.at,
      })
      .run();
  },
  takeHeld: (projectId) =>
    db.transaction((tx) => {
      const rows = tx
        .select()
        .from(heldTriggers)
        .where(eq(heldTriggers.projectId, projectId))
        .orderBy(asc(heldTriggers.at))
        .all();
      if (rows.length > 0) {
        tx.delete(heldTriggers)
          .where(
            and(
              eq(heldTriggers.projectId, projectId),
              inArray(
                heldTriggers.id,
                rows.map((row) => row.id)
              )
            )
          )
          .run();
      }
      return rows;
    }),
});

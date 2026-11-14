/**
 * Delegate types (`@cawco/core`'s `DelegateType`): the fleet-wide presets a
 * `delegate` call's `type` param resolves against. A type is its
 * `delegate_types` row and its lists, each a table keyed by its name
 * (schema.ts `delegateTypeMayStart` and the rest): what its sessions may
 * start and what they load is never a value read as "anything".
 */
import type { DelegateType } from "@cawco/core/delegate-types";
import {
  ANY_TYPE,
  DEFAULT_DELEGATE_TYPES,
  startsAny,
} from "@cawco/core/delegate-types";
import { eq, inArray, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  delegateTypeConnections,
  delegateTypeDenyTools,
  delegateTypeMayStart,
  delegateTypeSkills,
  delegateTypeStartingSet,
  delegateTypes,
  delegateTypesMeta,
  type StartingSetKind,
} from "./schema";
import type { Tx } from "./tx";

export interface DelegateTypesShape {
  get: (name: string) => DelegateType | undefined;
  list: () => DelegateType[];
  put: (draft: DelegateType) => DelegateType;
}

/** The key of the one row {@link delegateTypesMeta} holds once the defaults were ever written. */
const SEEDED = "seeded";

/** Each named type's lists, in the order they were written, by its name. */
const listsOf = (db: BunSQLiteDatabase, names: readonly string[]) => {
  const byName = <Row extends { typeName: string }, Value>(
    rows: Row[],
    value: (row: Row) => Value
  ): Map<string, Value[]> => {
    const grouped = new Map<string, Value[]>();
    for (const row of rows) {
      grouped.set(row.typeName, [
        ...(grouped.get(row.typeName) ?? []),
        value(row),
      ]);
    }
    return grouped;
  };
  return {
    mayStart: byName(
      db
        .select()
        .from(delegateTypeMayStart)
        .where(inArray(delegateTypeMayStart.typeName, [...names]))
        .orderBy(sql`rowid`)
        .all(),
      (row) => row.delegateType
    ),
    skills: byName(
      db
        .select()
        .from(delegateTypeSkills)
        .where(inArray(delegateTypeSkills.typeName, [...names]))
        .orderBy(sql`rowid`)
        .all(),
      (row) => row.skill
    ),
    denyTools: byName(
      db
        .select()
        .from(delegateTypeDenyTools)
        .where(inArray(delegateTypeDenyTools.typeName, [...names]))
        .orderBy(sql`rowid`)
        .all(),
      (row) => row.tool
    ),
    connections: byName(
      db
        .select()
        .from(delegateTypeConnections)
        .where(inArray(delegateTypeConnections.typeName, [...names]))
        .orderBy(sql`rowid`)
        .all(),
      (row) => row.connection
    ),
    startingSet: byName(
      db
        .select()
        .from(delegateTypeStartingSet)
        .where(inArray(delegateTypeStartingSet.typeName, [...names]))
        .orderBy(sql`rowid`)
        .all(),
      (row) => row
    ),
  };
};

type Lists = ReturnType<typeof listsOf>;

/** One type, its row and its lists; a list it has none of is left out, as a type that names none. */
const typeOf = (
  row: typeof delegateTypes.$inferSelect,
  lists: Lists
): DelegateType => {
  const named = (list: Map<string, string[]>) => list.get(row.name) ?? [];
  const mayStart = row.mayStartAny ? [ANY_TYPE] : named(lists.mayStart);
  const skills = named(lists.skills);
  const denyTools = named(lists.denyTools);
  const connections = named(lists.connections);
  const set = lists.startingSet.get(row.name) ?? [];
  const of = (kind: StartingSetKind) =>
    set.filter((one) => one.kind === kind).map((one) => one.name);
  return {
    name: row.name,
    description: row.description,
    harness: row.harness,
    model: row.model,
    ...(row.effort ? { effort: row.effort } : {}),
    ...(skills.length > 0 ? { skills } : {}),
    ...(denyTools.length > 0 ? { denyTools } : {}),
    ...(mayStart.length > 0 ? { mayStart } : {}),
    ...(row.account ? { account: row.account } : {}),
    ...(connections.length > 0 ? { connections } : {}),
    ...(row.startsWithAll
      ? {}
      : { startingSet: { skills: of("skill"), servers: of("server") } }),
  };
};

/** The types `rows` are, each with its lists. */
const typesOf = (
  db: BunSQLiteDatabase,
  rows: (typeof delegateTypes.$inferSelect)[]
): DelegateType[] => {
  if (rows.length === 0) {
    return [];
  }
  const lists = listsOf(
    db,
    rows.map((row) => row.name)
  );
  return rows.map((row) => typeOf(row, lists));
};

/** Writes `draft`'s lists in place of the ones its type had. */
const putLists = (tx: Tx, draft: DelegateType): void => {
  const typeName = draft.name;
  for (const table of [
    delegateTypeMayStart,
    delegateTypeSkills,
    delegateTypeDenyTools,
    delegateTypeConnections,
    delegateTypeStartingSet,
  ]) {
    tx.delete(table).where(eq(table.typeName, typeName)).run();
  }
  const mayStart = startsAny(draft.mayStart ?? [])
    ? []
    : (draft.mayStart ?? []);
  if (mayStart.length > 0) {
    tx.insert(delegateTypeMayStart)
      .values(mayStart.map((delegateType) => ({ typeName, delegateType })))
      .onConflictDoNothing()
      .run();
  }
  if (draft.skills?.length) {
    tx.insert(delegateTypeSkills)
      .values(draft.skills.map((skill) => ({ typeName, skill })))
      .onConflictDoNothing()
      .run();
  }
  if (draft.denyTools?.length) {
    tx.insert(delegateTypeDenyTools)
      .values(draft.denyTools.map((tool) => ({ typeName, tool })))
      .onConflictDoNothing()
      .run();
  }
  if (draft.connections?.length) {
    tx.insert(delegateTypeConnections)
      .values(draft.connections.map((connection) => ({ typeName, connection })))
      .onConflictDoNothing()
      .run();
  }
  const set = draft.startingSet;
  const entries = set
    ? [
        ...set.skills.map((name) => ({
          typeName,
          kind: "skill" as const,
          name,
        })),
        ...set.servers.map((name) => ({
          typeName,
          kind: "server" as const,
          name,
        })),
      ]
    : [];
  if (entries.length > 0) {
    tx.insert(delegateTypeStartingSet)
      .values(entries)
      .onConflictDoNothing()
      .run();
  }
};

/**
 * Seeds the defaults on a table never seeded, and returns the CRUD surface.
 * Called once, as the hub opens its database (db/index.ts `make`).
 */
export const makeDelegateTypes = (
  db: BunSQLiteDatabase
): DelegateTypesShape => {
  const list = (): DelegateType[] =>
    typesOf(
      db,
      db.select().from(delegateTypes).orderBy(delegateTypes.name).all()
    );

  const get = (name: string): DelegateType | undefined =>
    typesOf(
      db,
      db.select().from(delegateTypes).where(eq(delegateTypes.name, name)).all()
    )[0];

  const put = (draft: DelegateType): DelegateType => {
    const row = {
      description: draft.description,
      harness: draft.harness,
      model: draft.model,
      effort: draft.effort ?? null,
      account: draft.account ?? null,
      mayStartAny: startsAny(draft.mayStart ?? []),
      // No set: its sessions start with everything installed, as the person
      // who saved it with none chose.
      startsWithAll: draft.startingSet === undefined,
    };
    db.transaction((tx) => {
      tx.insert(delegateTypes)
        .values({ name: draft.name, ...row, createdAt: new Date() })
        .onConflictDoUpdate({ target: delegateTypes.name, set: row })
        .run();
      putLists(tx, draft);
    });
    return draft;
  };

  // A sentinel independent of row count: `count() === 0` also describes "the
  // operator deleted every type on purpose", and reseeding on the next hub
  // restart would silently undo that. The meta table holds one row once
  // seeding has ever run, so an emptied table stays empty.
  const seeded =
    db
      .select()
      .from(delegateTypesMeta)
      .where(eq(delegateTypesMeta.key, SEEDED))
      .get() !== undefined;
  if (!seeded) {
    for (const type of DEFAULT_DELEGATE_TYPES) {
      put(type);
    }
    db.insert(delegateTypesMeta)
      .values({ key: SEEDED, value: String(Date.now()) })
      .onConflictDoNothing()
      .run();
  }

  return { list, get, put };
};

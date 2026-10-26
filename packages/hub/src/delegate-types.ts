/**
 * Delegate types (`@cawco/core`'s `DelegateType`): the fleet-wide presets a
 * `delegate` call's `type` param resolves against.
 *
 * Its table is outside Drizzle's migrations: it owns its schema with a plain
 * `CREATE TABLE IF NOT EXISTS` and grows its columns by hand. It reads and
 * writes through the hub's one connection (db/index.ts `make` hands it in):
 * while the hub runs, the hub's database has one writer, from one thread
 * (db/wal.ts).
 */
import type { Database } from "bun:sqlite";
import type { DelegateType } from "@cawco/core";
import {
  DEFAULT_DELEGATE_TYPES,
  delegateTypeProblem,
  EFFORT_LEVELS,
  HARNESSES,
} from "@cawco/core";
import { Elysia, t } from "elysia";
import { undoable } from "./db/trash";

interface DelegateTypeRow {
  /** The account its sessions prefer; NULL: the provider's strategy chooses. */
  account: string | null;
  /** sqlite has no boolean: 1, 0, or NULL (the column arrived after the table). */
  can_delegate: number | null;
  /** The connections its sessions may call, as a JSON array; NULL: none. */
  connections: string | null;
  deny_tools: string | null;
  description: string;
  effort: string | null;
  harness: string;
  model: string;
  name: string;
  skills: string | null;
}

const rowToType = (row: DelegateTypeRow): DelegateType => ({
  name: row.name,
  description: row.description,
  harness: row.harness as DelegateType["harness"],
  model: row.model,
  ...(row.effort ? { effort: row.effort as DelegateType["effort"] } : {}),
  ...(row.skills ? { skills: JSON.parse(row.skills) } : {}),
  ...(row.deny_tools ? { denyTools: JSON.parse(row.deny_tools) } : {}),
  ...(row.can_delegate === null ? {} : { canDelegate: row.can_delegate === 1 }),
  cawcoTodos: true,
  ...(row.account ? { account: row.account } : {}),
  ...(row.connections ? { connections: JSON.parse(row.connections) } : {}),
});

export interface DelegateTypesShape {
  get: (name: string) => DelegateType | undefined;
  list: () => DelegateType[];
  put: (draft: DelegateType) => DelegateType;
}

/**
 * Makes (or grows) the table on the hub's connection, seeds the defaults on
 * a table never seeded, and returns the CRUD surface. Called once, as the
 * hub opens its database (db/index.ts `make`).
 */
export const makeDelegateTypes = (sqlite: Database): DelegateTypesShape => {
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS delegate_types (
      name TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      harness TEXT NOT NULL,
      model TEXT NOT NULL,
      effort TEXT,
      skills TEXT,
      deny_tools TEXT,
      created_at INTEGER NOT NULL
    )
  `);
  // The table is not Drizzle-managed, so a column added after the first
  // release is grown by hand: probe the shape, ALTER when it is missing.
  const columns = (
    sqlite.query("PRAGMA table_info(delegate_types)").all() as {
      name: string;
    }[]
  ).map((column) => column.name);
  if (!columns.includes("can_delegate")) {
    sqlite.run("ALTER TABLE delegate_types ADD COLUMN can_delegate INTEGER");
  }
  // A sentinel independent of row count: `count() === 0` also describes "the
  // operator deleted every type on purpose", and reseeding on the next hub
  // restart would silently undo that. This table holds one row once seeding
  // has ever run, so an emptied table stays empty.
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS delegate_types_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // A type no longer turns "CawCo's to-dos" on: every session keeps CawCo's
  // list (core `OWN_LIST_DENIED`), so the column a type once said it in goes.
  if (columns.includes("cawco_todos")) {
    sqlite.run("ALTER TABLE delegate_types DROP COLUMN cawco_todos");
  }
  if (!columns.includes("account")) {
    sqlite.run("ALTER TABLE delegate_types ADD COLUMN account TEXT");
  }
  if (!columns.includes("connections")) {
    sqlite.run("ALTER TABLE delegate_types ADD COLUMN connections TEXT");
  }
  // `.as(Class)` maps rows onto instances of a given class — there is no such
  // class here, only the `DelegateTypeRow` shape, so `.all()`'s own plain
  // objects (bun:sqlite's default) are cast, not remapped through `.as()`.
  const list = (): DelegateType[] =>
    (
      sqlite
        .query("SELECT * FROM delegate_types ORDER BY name")
        .all() as DelegateTypeRow[]
    ).map(rowToType);

  const get = (name: string): DelegateType | undefined => {
    const row = sqlite
      .query("SELECT * FROM delegate_types WHERE name = ?")
      .get(name) as DelegateTypeRow | null;
    return row ? rowToType(row) : undefined;
  };

  const seeded = () =>
    sqlite
      .query("SELECT 1 FROM delegate_types_meta WHERE key = ?")
      .get("seeded") !== null;

  const put = (draft: DelegateType): DelegateType => {
    const canDelegate =
      draft.canDelegate === undefined ? null : Number(draft.canDelegate);
    sqlite
      .query(
        `INSERT INTO delegate_types (name, description, harness, model, effort, skills, deny_tools, can_delegate, account, connections, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET
           description = excluded.description,
           harness = excluded.harness,
           model = excluded.model,
           effort = excluded.effort,
           skills = excluded.skills,
           deny_tools = excluded.deny_tools,
           can_delegate = excluded.can_delegate,
           account = excluded.account,
           connections = excluded.connections`
      )
      .run(
        draft.name,
        draft.description,
        draft.harness,
        draft.model,
        draft.effort ?? null,
        draft.skills ? JSON.stringify(draft.skills) : null,
        draft.denyTools ? JSON.stringify(draft.denyTools) : null,
        canDelegate,
        draft.account ?? null,
        draft.connections?.length ? JSON.stringify(draft.connections) : null,
        Date.now()
      );
    return draft;
  };

  if (!seeded()) {
    for (const type of DEFAULT_DELEGATE_TYPES) {
      put(type);
    }
    sqlite
      .query(
        "INSERT OR IGNORE INTO delegate_types_meta (key, value) VALUES (?, ?)"
      )
      .run("seeded", String(Date.now()));
  }

  return { list, get, put };
};

/**
 * The three routes: `GET /api/delegate-types`, `PUT /api/delegate-types/:name`,
 * `DELETE /api/delegate-types/:name`. A standalone Elysia app so `server.ts`
 * mounts it with one `.use()` rather than growing its own route list. A
 * delete goes into the hub's trash (`trash`, db/trash.ts) for its Undo.
 */
export const delegateTypesRoutes = (
  store: DelegateTypesShape,
  trash: (name: string) => number | undefined
) =>
  new Elysia()
    .get("/api/delegate-types", () => ({ types: store.list() }))
    .put(
      "/api/delegate-types/:name",
      {
        body: t.Object({
          description: t.String(),
          harness: t.Union(HARNESSES.map((harness) => t.Literal(harness))),
          model: t.String(),
          effort: t.Optional(
            t.Union(EFFORT_LEVELS.map((level) => t.Literal(level)))
          ),
          skills: t.Optional(t.Array(t.String())),
          denyTools: t.Optional(t.Array(t.String())),
          canDelegate: t.Optional(t.Boolean()),
          account: t.Optional(t.String()),
          connections: t.Optional(t.Array(t.String())),
        }),
      },
      ({ params, body, status }) => {
        const draft = { ...(body as Partial<DelegateType>), name: params.name };
        const problem = delegateTypeProblem(draft);
        if (problem) {
          return status(400, problem);
        }
        return store.put(draft as DelegateType);
      }
    )
    .delete("/api/delegate-types/:name", ({ params, status }) => {
      const restore = trash(params.name);
      if (restore === undefined) {
        return status(404, `the fleet keeps no delegate type ${params.name}`);
      }
      return undoable(restore);
    });

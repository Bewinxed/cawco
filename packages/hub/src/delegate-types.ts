/**
 * Delegate types (`@whiffle/core`'s `DelegateType`): the fleet-wide presets a
 * `delegate` call's `type` param resolves against.
 *
 * Kept out of `db/schema.ts` and `db/index.ts` deliberately — both files are
 * mid-edit in another session's working tree right now, and this table's
 * shape is small and self-contained enough not to need Drizzle's migration
 * machinery. It opens its own connection to the same sqlite file (bun:sqlite
 * allows concurrent connections; each of the hub's own tables already does
 * exactly this for its own reads and writes) and owns its schema with a
 * plain `CREATE TABLE IF NOT EXISTS`.
 */
import { Database } from "bun:sqlite";
import type { DelegateType } from "@whiffle/core";
import { DEFAULT_DELEGATE_TYPES, delegateTypeProblem } from "@whiffle/core";
import { Elysia, t } from "elysia";
import { DB_PATH } from "./config";

interface DelegateTypeRow {
  /** sqlite has no boolean: 1, 0, or NULL (the column arrived after the table). */
  can_delegate: number | null;
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
});

export interface DelegateTypesShape {
  get: (name: string) => DelegateType | undefined;
  list: () => DelegateType[];
  put: (draft: DelegateType) => DelegateType;
  remove: (name: string) => void;
}

/**
 * Opens (or creates) the table, seeds the defaults on an empty table, and
 * returns the CRUD surface. Called once at hub start; the returned handle is
 * cheap to hold for the process lifetime, same as the rest of `db/index.ts`.
 */
export const makeDelegateTypes = (
  path: string = DB_PATH
): DelegateTypesShape => {
  const sqlite = new Database(path);
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
        `INSERT INTO delegate_types (name, description, harness, model, effort, skills, deny_tools, can_delegate, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET
           description = excluded.description,
           harness = excluded.harness,
           model = excluded.model,
           effort = excluded.effort,
           skills = excluded.skills,
           deny_tools = excluded.deny_tools,
           can_delegate = excluded.can_delegate`
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
        Date.now()
      );
    return draft;
  };

  const remove = (name: string): void => {
    sqlite.query("DELETE FROM delegate_types WHERE name = ?").run(name);
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

  return { list, get, put, remove };
};

/**
 * The three routes: `GET /api/delegate-types`, `PUT /api/delegate-types/:name`,
 * `DELETE /api/delegate-types/:name`. A standalone Elysia app so `server.ts`
 * mounts it with one `.use()` rather than growing its own route list.
 */
export const delegateTypesRoutes = (store: DelegateTypesShape) =>
  new Elysia()
    .get("/api/delegate-types", () => ({ types: store.list() }))
    .put(
      "/api/delegate-types/:name",
      {
        body: t.Object({
          description: t.String(),
          harness: t.Union([
            t.Literal("claude"),
            t.Literal("opencode"),
            t.Literal("pi"),
          ]),
          model: t.String(),
          effort: t.Optional(
            t.Union([
              t.Literal("low"),
              t.Literal("medium"),
              t.Literal("high"),
              t.Literal("xhigh"),
              t.Literal("max"),
            ])
          ),
          skills: t.Optional(t.Array(t.String())),
          denyTools: t.Optional(t.Array(t.String())),
          canDelegate: t.Optional(t.Boolean()),
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
      if (!store.get(params.name)) {
        return status(404, `the fleet keeps no delegate type ${params.name}`);
      }
      store.remove(params.name);
      return { ok: true };
    });

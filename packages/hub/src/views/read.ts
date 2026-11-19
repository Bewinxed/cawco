/**
 * What the views thread reads of the hub's database: on a connection of its
 * own, opened read-only, beside the hub's writer ("readers do not block
 * writers and a writer does not block readers", sqlite.org/wal.html), as the
 * preview server reads it (preview-server/store.ts). Every reader reads the
 * whole table once, as the thread starts, then by key what the change log
 * names (views/changes.ts).
 */
import { Database } from "bun:sqlite";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { findDb } from "../db/find";
import { keptInstances } from "../db/instances";
import { agents, instances, projectPlaces, projects } from "../db/schema";

/** How long a read waits out the hub's write lock, ms: a checkpoint's. Our call, as the preview server's. */
const BUSY_MS = 2000;

/** A machine as the views read it: its name, and when the hub last heard it. */
export interface ViewMachine {
  createdAt: number;
  hostname: string;
  lastSeenAt: number | null;
  machineId: string;
}

/** A project as the views read it: its name, and where its files are (core `MemberProject`). */
export interface ViewProject {
  createdAt: Date;
  id: string;
  name: string;
  places: { id: string; machineId: string; path: string }[];
  primaryPlaceId: string | null;
}

const wrapColumns = {
  id: instances.id,
  kind: instances.kind,
  origin: instances.origin,
  parentInstanceId: instances.parentInstanceId,
  sessionId: instances.sessionId,
  wroteAt: instances.wroteAt,
};

/** A session as Recent's stored list reads it: whose conversation it wraps, its parent, whose it is (core `personsOwn`). */
export type WrapRow = {
  [Key in keyof typeof wrapColumns]: (typeof instances.$inferSelect)[Key];
};

/** How many keys one read names: under SQLite's bound on a statement's values (macOS's system SQLite: 32,766). */
const KEYS_PER_READ = 500;

/** `read` over `keys` in bounded lists, its answers joined. */
const inParts = <Key, Row>(
  keys: readonly Key[],
  read: (part: Key[]) => Row[]
): Row[] => {
  const rows: Row[] = [];
  for (let at = 0; at < keys.length; at += KEYS_PER_READ) {
    rows.push(...read(keys.slice(at, at + KEYS_PER_READ)));
  }
  return rows;
};

export const openViewsDb = (path: string) => {
  const client = new Database(path, { readonly: true });
  client.run(`PRAGMA busy_timeout = ${BUSY_MS}`);
  // The hub's own connection's: the tables the views walk stay in memory
  // (db/index.ts).
  client.run("PRAGMA cache_size = -65536");
  client.run("PRAGMA mmap_size = 1073741824");
  const db = drizzle({ client });

  return {
    find: findDb(db),
    /** Every machine, or these ids'. */
    machines: (ids?: string[]): ViewMachine[] =>
      db
        .select({
          machineId: agents.machineId,
          hostname: agents.hostname,
          lastSeenAt: agents.lastSeenAt,
          createdAt: agents.createdAt,
        })
        .from(agents)
        .where(ids ? inArray(agents.machineId, ids) : undefined)
        // Join order, as every list of machines reads them (db machines.ts `machineFacts`).
        .orderBy(asc(agents.createdAt), asc(agents.machineId))
        .all()
        .map((row) => ({
          machineId: row.machineId,
          hostname: row.hostname,
          lastSeenAt: row.lastSeenAt?.getTime() ?? null,
          createdAt: row.createdAt.getTime(),
        })),
    /** Every project, with its places. */
    projects: (): ViewProject[] => {
      const places = Map.groupBy(
        db.select().from(projectPlaces).all(),
        (place) => place.projectId
      );
      return db
        .select({
          id: projects.id,
          name: projects.name,
          createdAt: projects.createdAt,
        })
        .from(projects)
        .all()
        .map((project) => {
          const own = places.get(project.id) ?? [];
          return {
            ...project,
            places: own.map((place) => ({
              id: place.id,
              machineId: place.machineId,
              path: place.path,
            })),
            primaryPlaceId: own.find((place) => place.isPrimary)?.id ?? null,
          };
        });
    },
    /** The kept sessions that wrap these harness session ids, a summariser's left out. */
    wrapping: (sessionIds: readonly string[]): WrapRow[] =>
      inParts(sessionIds, (part) =>
        db
          .select(wrapColumns)
          .from(instances)
          .where(
            and(
              inArray(instances.sessionId, part),
              keptInstances(),
              ne(instances.kind, "summariser")
            )
          )
          .all()
      ),
    /** These sessions, by id, when the hub keeps them. */
    wrapRows: (ids: readonly string[]): WrapRow[] =>
      inParts(ids, (part) =>
        db
          .select(wrapColumns)
          .from(instances)
          .where(and(inArray(instances.id, part), keptInstances()))
          .all()
      ),
    /** The kept session `id`'s row, as the stored list reads it. */
    wrapRow: (id: string): WrapRow | undefined =>
      db
        .select(wrapColumns)
        .from(instances)
        .where(and(eq(instances.id, id), keptInstances()))
        .get(),
    close: () => client.close(),
  };
};

export type ViewsDb = ReturnType<typeof openViewsDb>;

import { eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { instances, previewPorts, previewSettings, projects } from "./schema";

/** The fleet's preview mode as stored; no row reads as port mode. */
export interface StoredPreviewSettings {
  mode: "port" | "host";
  pattern: string | null;
}

const PROJECT_ORIGIN = "project-";

/** A project's preview origin as preview.ts keys it (a session's is its id): its pages are served there. */
export const projectOrigin = (projectId: string): string =>
  `${PROJECT_ORIGIN}${projectId}`;

/** The project a preview origin's key names; null for a session's (or an embed's). */
export const projectOfOrigin = (key: string): string | null =>
  key.startsWith(PROJECT_ORIGIN) ? key.slice(PROJECT_ORIGIN.length) : null;

/** The rows preview.ts keeps: each origin's port, and the fleet's mode. */
export interface PreviewsDb {
  /** Origin `key` (a session's id, or {@link projectOrigin}) holds no port now. */
  readonly dropPort: (key: string) => void;
  /**
   * Origin `key`'s port is `port`, kept only while its owner (the session,
   * or the project) is a row of the hub's: false, and nothing kept, when it
   * is not.
   */
  readonly keepPort: (key: string, port: number) => boolean;
  /** Whether origin `key`'s owner (the session, or the project) is a row of the hub's now. */
  readonly ownerHeld: (key: string) => boolean;
  /** Every origin's port, by its key. */
  readonly ports: () => { key: string; port: number }[];
  readonly setSettings: (settings: StoredPreviewSettings) => void;
  readonly settings: () => StoredPreviewSettings;
}

const ID = "preview";

/** The row origin `key` owns. */
const owned = (key: string) => {
  const projectId = projectOfOrigin(key);
  return projectId
    ? eq(previewPorts.projectId, projectId)
    : eq(previewPorts.instanceId, key);
};

/** Whether origin `key`'s owner is a row: its project's, else its session's. */
const ownerHeld = (
  db: Pick<BunSQLiteDatabase, "select">,
  key: string
): boolean => {
  const projectId = projectOfOrigin(key);
  return projectId
    ? db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, projectId))
        .get() !== undefined
    : db
        .select({ id: instances.id })
        .from(instances)
        .where(eq(instances.id, key))
        .get() !== undefined;
};

export const previewsDb = (db: BunSQLiteDatabase): PreviewsDb => ({
  ports: () =>
    db
      .select()
      .from(previewPorts)
      .all()
      .map((row) => ({
        key: row.projectId
          ? projectOrigin(row.projectId)
          : (row.instanceId as string),
        port: row.port,
      })),
  ownerHeld: (key) => ownerHeld(db, key),
  keepPort: (key, port) => {
    const projectId = projectOfOrigin(key);
    return db.transaction((tx) => {
      tx.delete(previewPorts).where(owned(key)).run();
      if (!ownerHeld(tx, key)) {
        return false;
      }
      tx.insert(previewPorts)
        .values(projectId ? { port, projectId } : { port, instanceId: key })
        .run();
      return true;
    });
  },
  dropPort: (key) => {
    db.delete(previewPorts).where(owned(key)).run();
  },
  settings: () => {
    const row = db
      .select()
      .from(previewSettings)
      .where(eq(previewSettings.id, ID))
      .get();
    return row
      ? { mode: row.mode, pattern: row.pattern }
      : { mode: "port", pattern: null };
  },
  setSettings: ({ mode, pattern }) => {
    db.insert(previewSettings)
      .values({ id: ID, mode, pattern })
      .onConflictDoUpdate({
        target: previewSettings.id,
        set: { mode, pattern },
      })
      .run();
  },
});

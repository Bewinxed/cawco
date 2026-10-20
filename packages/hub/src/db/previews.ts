import { eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { previewPorts, previewSettings } from "./schema";

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
  /** Origin `key`'s port is `port`. */
  readonly keepPort: (key: string, port: number) => void;
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
  keepPort: (key, port) => {
    const projectId = projectOfOrigin(key);
    db.transaction((tx) => {
      tx.delete(previewPorts).where(owned(key)).run();
      tx.insert(previewPorts)
        .values(projectId ? { port, projectId } : { port, instanceId: key })
        .run();
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

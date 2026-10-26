import { eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  artifacts,
  instances,
  previewPorts,
  previewSettings,
  projects,
} from "./schema";

/** The fleet's preview mode as stored; no row reads as port mode. */
interface StoredPreviewSettings {
  mode: "port" | "host";
  pattern: string | null;
}

const PROJECT_ORIGIN = "project-";

/** A project's preview origin as preview.ts keys it (a session's is its id): its pages are served there. */
export const projectOrigin = (projectId: string): string =>
  `${PROJECT_ORIGIN}${projectId}`;

/** The project a preview origin's key names; null for a session's or an artifact's. */
export const projectOfOrigin = (key: string): string | null =>
  key.startsWith(PROJECT_ORIGIN) ? key.slice(PROJECT_ORIGIN.length) : null;

const ARTIFACT_ORIGIN = "embed-";

/**
 * A machine artifact's own preview origin as preview.ts keys it (a dev
 * server's or a folder's preview, a sheet): the one its panel, its own tab
 * and every decision card load, and the key its machine's listener is kept
 * under.
 */
export const artifactOrigin = (artifactId: string): string =>
  `${ARTIFACT_ORIGIN}${artifactId}`;

/** The artifact a preview origin's key names; null for a session's or a project's. */
export const artifactOfOrigin = (key: string): string | null =>
  key.startsWith(ARTIFACT_ORIGIN) ? key.slice(ARTIFACT_ORIGIN.length) : null;

/** The rows preview.ts keeps: each origin's port, and the fleet's mode. */
export interface PreviewsDb {
  /** Origin `key` (a session's id, {@link projectOrigin} or {@link artifactOrigin}) holds no port now. */
  readonly dropPort: (key: string) => void;
  /**
   * Origin `key`'s port is `port`, kept only while its owner (the session,
   * the project or the artifact) is a row of the hub's: false, and nothing
   * kept, when it is not.
   */
  readonly keepPort: (key: string, port: number) => boolean;
  /** Whether origin `key`'s owner (the session, the project or the artifact) is a row of the hub's now. */
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
  if (projectId) {
    return eq(previewPorts.projectId, projectId);
  }
  const artifactId = artifactOfOrigin(key);
  return artifactId
    ? eq(previewPorts.artifactId, artifactId)
    : eq(previewPorts.instanceId, key);
};

/** Whether origin `key`'s owner is a row: its project's, its artifact's, else its session's. */
const ownerHeld = (
  db: Pick<BunSQLiteDatabase, "select">,
  key: string
): boolean => {
  const projectId = projectOfOrigin(key);
  if (projectId) {
    return (
      db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, projectId))
        .get() !== undefined
    );
  }
  const artifactId = artifactOfOrigin(key);
  if (artifactId) {
    return (
      db
        .select({ id: artifacts.id })
        .from(artifacts)
        .where(eq(artifacts.id, artifactId))
        .get() !== undefined
    );
  }
  return (
    db
      .select({ id: instances.id })
      .from(instances)
      .where(eq(instances.id, key))
      .get() !== undefined
  );
};

/** The row's owner columns for origin `key`. */
const ownerOf = (key: string) => {
  const projectId = projectOfOrigin(key);
  if (projectId) {
    return { projectId };
  }
  const artifactId = artifactOfOrigin(key);
  return artifactId ? { artifactId } : { instanceId: key };
};

export const previewsDb = (db: BunSQLiteDatabase): PreviewsDb => ({
  ports: () =>
    db
      .select()
      .from(previewPorts)
      .all()
      .map((row) => {
        if (row.projectId) {
          return { key: projectOrigin(row.projectId), port: row.port };
        }
        return {
          key: row.artifactId
            ? artifactOrigin(row.artifactId)
            : (row.instanceId as string),
          port: row.port,
        };
      }),
  ownerHeld: (key) => ownerHeld(db, key),
  keepPort: (key, port) =>
    db.transaction((tx) => {
      tx.delete(previewPorts).where(owned(key)).run();
      if (!ownerHeld(tx, key)) {
        return false;
      }
      tx.insert(previewPorts)
        .values({ port, ...ownerOf(key) })
        .run();
      return true;
    }),
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

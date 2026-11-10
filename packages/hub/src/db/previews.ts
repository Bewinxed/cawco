import { asc, eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  artifacts,
  instances,
  PREVIEW_SETTINGS_ID,
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
 * server's or a folder's preview, a sheet), by the origin its row points at
 * (schema.ts `artifacts.origin`): the one its panel, its own tab and every
 * decision card load, and the key its machine's listener, its port, its
 * host-mode label and its passes are kept under. Its listener on a port of
 * its own and its machine's listener are apart from every session's, and
 * both last as long as that origin, whichever session opened or held it
 * (preview-service.ts `end`); its port stays its own until the range is full
 * and it is the least recently used of those nothing uses (preview-ports.ts
 * `reclaimOne`). A dev server and a stage serve from their root, so no other
 * origin can show one under a path of its own.
 */
export const artifactOrigin = (origin: string): string =>
  `${ARTIFACT_ORIGIN}${origin}`;

/** The artifact origin (`artifacts.origin`) a preview origin's key names; null for a session's or a project's. */
export const originOfKey = (key: string): string | null =>
  key.startsWith(ARTIFACT_ORIGIN) ? key.slice(ARTIFACT_ORIGIN.length) : null;

/** The rows preview.ts keeps: each origin's port, and the fleet's mode. */
export interface PreviewsDb {
  /** Origin `key` (a session's id, {@link projectOrigin} or {@link artifactOrigin}) holds no port now. */
  readonly dropPort: (key: string) => void;
  /**
   * Origin `key`'s port is `port`, kept only while its owner (the session,
   * the project or the artifact) is a row of the hub's: false, and nothing
   * kept, when it is not. Taken because something asked for the origin, so
   * used as it is kept: the origin that just took a port is never the first
   * a full range takes back (`portsByUse`), whose rebinding took the next
   * back in turn.
   */
  readonly keepPort: (key: string, port: number) => boolean;
  /** Whether origin `key`'s owner (the session, the project or the artifact) is a row of the hub's now. */
  readonly ownerHeld: (key: string) => boolean;
  /** Every origin's port, by its key. */
  readonly ports: () => { key: string; port: number }[];
  /**
   * Every origin's port, by its key, the one used least recently first
   * (`used_at`, one never used before any): the order a full range takes
   * a port back in (preview.ts `reclaimOne`).
   */
  readonly portsByUse: () => { key: string; port: number }[];
  readonly setSettings: (settings: StoredPreviewSettings) => void;
  readonly settings: () => StoredPreviewSettings;
  /** Origin `key` was used at `at` (preview.ts `used`, at most once a minute). */
  readonly used: (key: string, at: Date) => void;
}

/** The row origin `key` owns. */
const owned = (key: string) => {
  const projectId = projectOfOrigin(key);
  if (projectId) {
    return eq(previewPorts.projectId, projectId);
  }
  const origin = originOfKey(key);
  return origin
    ? eq(previewPorts.origin, origin)
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
  const origin = originOfKey(key);
  if (origin) {
    return (
      db
        .select({ id: artifacts.id })
        .from(artifacts)
        .where(eq(artifacts.origin, origin))
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
  const origin = originOfKey(key);
  return origin ? { origin } : { instanceId: key };
};

/** A port row as the listeners read it: its origin's key and its port. */
const keyed = (
  row: typeof previewPorts.$inferSelect
): { key: string; port: number } => {
  if (row.projectId) {
    return { key: projectOrigin(row.projectId), port: row.port };
  }
  return {
    key: row.origin ? artifactOrigin(row.origin) : (row.instanceId as string),
    port: row.port,
  };
};

export const previewsDb = (db: BunSQLiteDatabase): PreviewsDb => ({
  ports: () => db.select().from(previewPorts).all().map(keyed),
  // SQLite sorts a null first in ascending order: one never used goes first.
  portsByUse: () =>
    db
      .select()
      .from(previewPorts)
      .orderBy(asc(previewPorts.usedAt), asc(previewPorts.port))
      .all()
      .map(keyed),
  used: (key, at) => {
    db.update(previewPorts).set({ usedAt: at }).where(owned(key)).run();
  },
  ownerHeld: (key) => ownerHeld(db, key),
  keepPort: (key, port) =>
    db.transaction((tx) => {
      tx.delete(previewPorts).where(owned(key)).run();
      if (!ownerHeld(tx, key)) {
        return false;
      }
      tx.insert(previewPorts)
        .values({ port, usedAt: new Date(), ...ownerOf(key) })
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
      .where(eq(previewSettings.id, PREVIEW_SETTINGS_ID))
      .get();
    return row
      ? { mode: row.mode, pattern: row.pattern }
      : { mode: "port", pattern: null };
  },
  setSettings: ({ mode, pattern }) => {
    db.insert(previewSettings)
      .values({ id: PREVIEW_SETTINGS_ID, mode, pattern })
      .onConflictDoUpdate({
        target: previewSettings.id,
        set: { mode, pattern },
      })
      .run();
  },
});

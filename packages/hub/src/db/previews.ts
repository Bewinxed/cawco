import { eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { previewPorts, previewSettings } from "./schema";

/** The fleet's preview mode as stored; no row reads as port mode. */
export interface StoredPreviewSettings {
  mode: "port" | "host";
  pattern: string | null;
}

/** The rows preview.ts keeps: each session's port, and the fleet's mode. */
export interface PreviewsDb {
  /** Session `instanceId` holds no port now. */
  readonly dropPort: (instanceId: string) => void;
  /** Session `instanceId`'s port is `port`. */
  readonly keepPort: (instanceId: string, port: number) => void;
  /** Every session's port. */
  readonly ports: () => { instanceId: string; port: number }[];
  readonly setSettings: (settings: StoredPreviewSettings) => void;
  readonly settings: () => StoredPreviewSettings;
}

const ID = "preview";

export const previewsDb = (db: BunSQLiteDatabase): PreviewsDb => ({
  ports: () => db.select().from(previewPorts).all(),
  keepPort: (instanceId, port) => {
    db.insert(previewPorts)
      .values({ instanceId, port })
      .onConflictDoUpdate({ target: previewPorts.instanceId, set: { port } })
      .run();
  },
  dropPort: (instanceId) => {
    db.delete(previewPorts)
      .where(eq(previewPorts.instanceId, instanceId))
      .run();
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

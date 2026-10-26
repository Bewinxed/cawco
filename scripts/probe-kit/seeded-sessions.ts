/**
 * Sessions seeded on a scratch fleet's hub: copies of a session's row, each
 * with its own conversation, and a session put to sleep. Kept from
 * no-wake-at-rest (cut on 2026-10-26) for the specs that still seed a
 * fleet's worth of stored sessions.
 */
import { Database } from "bun:sqlite";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { until } from "../scratch-fleet";
import type { KitFleet } from "./kit";

/** Asks `id` to sleep (again every 15 s: a machine refuses one not at rest) until its row reads sleeping. */
export const asleep = (fleet: KitFleet, id: string) => {
  let askedAt = 0;
  return until(
    `${id.slice(0, 8)} asleep`,
    async () => {
      const status = fleet.instance(id)?.status;
      if (status !== "sleeping" && Date.now() - askedAt > 15_000) {
        askedAt = Date.now();
        await fleet.control(id, "sleep");
      }
      return status;
    },
    (status) => status === "sleeping",
    90_000
  ).catch(() => fleet.instance(id)?.status);
};

/** The file Claude Code keeps conversation `sessionId` in, under `home`. */
export const conversationFile = (home: string, sessionId: string) => {
  const name = `${sessionId}.jsonl`;
  const found = (readdirSync(home, { recursive: true }) as string[]).find(
    (path) => path.endsWith(`/${name}`)
  );
  return found ? join(home, found) : undefined;
};

interface Column {
  name: string;
}

/**
 * Copies of row `templateId` in `instances`, each a session of its own with
 * its own conversation (`sessionIds`), as `overrides` says.
 */
export const seedRows = (
  path: string,
  templateId: string,
  rows: { id: string; overrides: Record<string, number | string | null> }[]
) => {
  const db = new Database(path);
  try {
    const names = (
      db.query("PRAGMA table_info(instances)").all() as Column[]
    ).map((column) => column.name);
    const template = db
      .query("SELECT * FROM instances WHERE id = ?")
      .get(templateId) as Record<string, unknown>;
    const insert = db.prepare(
      `INSERT INTO instances (${names.map((name) => `"${name}"`).join(", ")}) VALUES (${names.map(() => "?").join(", ")})`
    );
    db.transaction(() => {
      for (const row of rows) {
        const copy: Record<string, unknown> = {
          ...template,
          id: row.id,
          ...row.overrides,
        };
        insert.run(...(names.map((name) => copy[name] ?? null) as never[]));
      }
    })();
  } finally {
    db.close();
  }
};

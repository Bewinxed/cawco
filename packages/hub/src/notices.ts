/**
 * The notices a person has acknowledged, by notice id, kept by the hub so an
 * acknowledgement on one tab or device is one everywhere: every dashboard is
 * sent the record on the board snapshot and on every change of it
 * (`noticesSeen`), and drops the notice live. A notice id names the event the
 * notice announces, never a tab: `landed:<machineId>:<at>` for an update that
 * landed on a machine, `reload:<build>` for a dashboard build newer than an
 * open tab, `ready:…` and `installing:…` for a build that waits or installs
 * (apps/dashboard/src/lib/cawco/updates/model.ts names them).
 *
 * A record the hub finds damaged as it starts (a crash before CawCo wrote
 * every record whole) does not stop the hub: notices are off, the board says
 * so (`noticesDamaged`), every acknowledgement is refused with the same
 * words, and nothing reads the damaged file as an empty list. Reset
 * (`POST /api/notices/reset`) writes a fresh record and turns them back on.
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { type DamagedHubRecord, damagedHubRecordWords } from "@cawco/core";
import {
  DamagedRecord,
  isDamagedRecord,
  readRecordSync,
  writeStateFileSync,
} from "@cawco/core/state-file";
import { Elysia, t } from "elysia";

/**
 * Ids kept, newest last. An event's notice is over once a newer one of its
 * kind replaces it (the next landing, the next build), so the old ids only
 * have to outlive the tabs that could still show them.
 */
const KEPT = 500;

type NoticesRecord = { seen: string[] } | { damaged: DamagedHubRecord };

/** The record at `path`: its ids, none on a first run, or what is wrong with it. */
const load = (path: string): NoticesRecord => {
  try {
    const kept = readRecordSync<unknown>(path);
    if (kept === undefined) {
      return { seen: [] };
    }
    if (!(Array.isArray(kept) && kept.every((id) => typeof id === "string"))) {
      throw new DamagedRecord(path, "it is not a list of notice ids");
    }
    return { seen: kept };
  } catch (error) {
    if (!isDamagedRecord(error)) {
      throw error;
    }
    const damaged = { file: error.file, reason: error.reason };
    console.warn(`[notices] ${damagedHubRecordWords("notices", damaged)}`);
    return { damaged };
  }
};

export function createNoticesSeen(options: {
  /** Says the record changed, so every dashboard is sent it. */
  changed: () => void;
  dbPath: string;
}) {
  const path = join(dirname(options.dbPath), "notices-seen.json");
  let record = load(path);

  const save = (seen: string[]) => {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeStateFileSync(path, `${JSON.stringify(seen)}\n`, { mode: 0o600 });
    record = { seen };
    options.changed();
  };

  return {
    /** The acknowledged ids; none while the record is damaged, which `damaged` says. */
    ids: (): string[] => ("seen" in record ? record.seen : []),
    /** The damaged record, while notices are off for it; null otherwise. */
    damaged: (): DamagedHubRecord | null =>
      "damaged" in record ? record.damaged : null,
    routes: new Elysia()
      .post(
        "/api/notices/seen",
        {
          body: t.Object({
            /** The notice ids the person acknowledged, by dismissing or acting on the notice. */
            ids: t.Array(t.String({ minLength: 1 }), { minItems: 1 }),
          }),
        },
        ({ body, status }) => {
          if ("damaged" in record) {
            return status(
              409,
              damagedHubRecordWords("notices", record.damaged)
            );
          }
          const { seen } = record;
          const fresh = body.ids.filter((id) => !seen.includes(id));
          const next =
            fresh.length > 0 ? [...seen, ...fresh].slice(-KEPT) : seen;
          if (fresh.length > 0) {
            save(next);
          }
          return { seen: next };
        }
      )
      // Reset: the one way out of a damaged record. A fresh, empty record
      // written whole, and notices on again. Refused while the record reads
      // whole: it would only forget what the person acknowledged.
      .post("/api/notices/reset", ({ status }) => {
        if (!("damaged" in record)) {
          return status(
            409,
            "The notices record reads whole, so there is nothing to reset."
          );
        }
        console.info(`[notices] ${record.damaged.file} reset: notices are on`);
        const seen: string[] = [];
        save(seen);
        return { seen };
      }),
  };
}

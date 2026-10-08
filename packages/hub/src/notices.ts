/**
 * The notices a person has acknowledged, by notice id, kept by the hub so an
 * acknowledgement on one tab or device is one everywhere: every dashboard is
 * sent the record on the board snapshot and on every change of it
 * (`noticesSeen`), and drops the notice live. A notice id names the event the
 * notice announces, never a tab: `landed:<machineId>:<at>` for an update that
 * landed on a machine, `reload:<build>` for a dashboard build newer than an
 * open tab, `ready:…` and `installing:…` for a build that waits or installs
 * (apps/dashboard/src/lib/cawco/updates/model.ts names them).
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { Elysia, t } from "elysia";

/**
 * Ids kept, newest last. An event's notice is over once a newer one of its
 * kind replaces it (the next landing, the next build), so the old ids only
 * have to outlive the tabs that could still show them.
 */
const KEPT = 500;

export function createNoticesSeen(options: {
  /** Says the record changed, so every dashboard is sent it. */
  changed: () => void;
  dbPath: string;
}) {
  const path = join(dirname(options.dbPath), "notices-seen.json");
  let seen: string[] = existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as string[])
    : [];

  const save = () => {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(seen)}\n`, { mode: 0o600 });
    renameSync(temporary, path);
  };

  return {
    ids: (): string[] => seen,
    routes: new Elysia().post(
      "/api/notices/seen",
      {
        body: t.Object({
          /** The notice ids the person acknowledged, by dismissing or acting on the notice. */
          ids: t.Array(t.String({ minLength: 1 }), { minItems: 1 }),
        }),
      },
      ({ body }) => {
        const fresh = body.ids.filter((id) => !seen.includes(id));
        if (fresh.length > 0) {
          seen = [...seen, ...fresh].slice(-KEPT);
          save();
          options.changed();
        }
        return { seen };
      }
    ),
  };
}

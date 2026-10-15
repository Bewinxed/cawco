/**
 * One hub to a database. Two hubs on one sqlite file both migrate it, both
 * run the board's change log and the dispatcher, and each answers sessions
 * the other started: since the database's default became the platform data
 * dir for every hub (core paths.ts `hubDbPath`), a dev hub started without
 * `CAWCO_DB_PATH` would open the live fleet's.
 *
 * The hub takes `<db>.lock` before it opens the database: a file naming its
 * process (pid, the kernel's start time of that pid, the boot), made with
 * `link`, which fails when the name exists, so of two hubs starting together
 * one makes it. A lock whose process is gone (or a pid now another process,
 * or another boot) is stale and taken over; so every way a hub ends (SIGTERM
 * from its unit, a crash, SIGKILL) frees it with no cleanup, and the next
 * hub the service manager starts, after the old one exited, takes it. A lock
 * naming this very process is its own (`bun --watch` restarts in place).
 *
 * Not SQLite's own locking: `locking_mode=EXCLUSIVE` would also shut out
 * every reader beside a running hub (the update helper's `VACUUM INTO` copy
 * before a schema change, the probes that read a scratch hub's rows).
 */
import { link, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { markerIsLive, ownIdentity } from "@cawco/core/process-identity";

interface Holder {
  readonly bootId?: string;
  readonly pid?: number;
  readonly procStart?: string;
  readonly startedAt?: number;
}

/** How often a takeover that lost a race to another starting hub looks again. */
const TRIES = 5;

const absent = (error: unknown): boolean =>
  (error as NodeJS.ErrnoException).code === "ENOENT";

/** The lock's holder as written; an empty object for one half written or gone (stale). */
const readHolder = async (file: string): Promise<Holder> => {
  try {
    return JSON.parse(await readFile(file, "utf8")) as Holder;
  } catch {
    return {};
  }
};

const same = (a: Holder, b: Holder): boolean =>
  a.pid === b.pid && a.procStart === b.procStart && a.bootId === b.bootId;

/** Thrown when another live hub holds the database. */
export class DatabaseHeld extends Error {}

/**
 * Takes `<path>.lock` for this process, or throws {@link DatabaseHeld} naming
 * the live hub that holds it and how to start this one on another database.
 */
export const lockDatabase = async (path: string): Promise<void> => {
  const lock = `${path}.lock`;
  const mine: Holder = { ...(await ownIdentity()), startedAt: Date.now() };
  const written = `${lock}.${process.pid}`;
  // A first start: the database's dir is made here, before anything opens it.
  await mkdir(dirname(path), { recursive: true });
  await writeFile(written, `${JSON.stringify(mine)}\n`);
  try {
    for (let tries = 0; tries < TRIES; tries += 1) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: each try follows from what the last found
        await link(written, lock);
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
          throw error;
        }
      }
      const holder = await readHolder(lock);
      if (holder.pid !== process.pid && (await markerIsLive(holder))) {
        const since = holder.startedAt
          ? `, started ${new Date(holder.startedAt).toISOString()}`
          : "";
        throw new DatabaseHeld(
          `${path} is held by the hub in process ${holder.pid}${since} (${lock}), so this hub does not open it: stop that hub, or start this one on another database with CAWCO_DB_PATH (the hub package's dev and start scripts use $XDG_DATA_HOME/cawco-dev/cawco.db).`
        );
      }
      // Stale: moved aside under a name of this process's own, then checked
      // to be the lock judged stale. Another hub that took it over in
      // between made a new one, which goes back unless a third made one.
      const aside = `${lock}.${process.pid}.stale`;
      try {
        await rename(lock, aside);
      } catch (error) {
        if (!absent(error)) {
          throw error;
        }
        continue;
      }
      const moved = await readHolder(aside);
      if (!same(moved, holder)) {
        await link(aside, lock).catch(() => undefined);
      }
      await rm(aside, { force: true });
    }
    throw new Error(
      `${lock} could not be taken: other hubs kept making it while this one started. Start this hub again.`
    );
  } finally {
    await rm(written, { force: true });
  }
};

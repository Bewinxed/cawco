#!/usr/bin/env bun
/**
 * The agent's reads of OpenCode's own store, run as the agent runs them, in a
 * process of their own with the agent's loop watch on (specs/store-reads-loop.ts).
 *
 *   bun scripts/probe-kit/store-reads-child.ts <agent src> <db> <ms> <late ms>
 *
 * `XDG_DATA_HOME` names the data dir whose `opencode/opencode.db` is read.
 * For `<ms>` it reads, as each heartbeat and config tick does, OpenCode's own
 * sign-ins (`homeStoresStamp`, `opencodeOwnChanges`) and the session
 * listing of `<db>`, one round at a time, while the loop watch
 * (loop-watch.ts `watchLoop`) says each hold of `<late ms>` or more, and a
 * timer every {@link TICK_MS} takes the loop's worst lateness itself.
 *
 * `<agent src>` is the agent's source to read with: this tree's, or
 * another checkout's (main's), whose own modules are used as they stand
 * there. The listing is the stores thread's (stores/client.ts) where the
 * agent has one, and the loop's own read where it does not (main's
 * harnesses/opencode-db.ts, the SQL of opencode.ts `storedSessions`).
 *
 * Its last line is a JSON summary: rounds, reads answered and not, worst
 * lateness.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

const [agent, db, msArg, lateArg] = process.argv.slice(2);
if (!(agent && db && msArg && lateArg)) {
  throw new Error(
    "usage: store-reads-child.ts <agent src> <db> <ms> <late ms>"
  );
}
const ms = Number(msArg);
const late = Number(lateArg);

/** How often the loop's lateness is taken here. */
const TICK_MS = 10;
/** The listing's SQL, as opencode.ts `storedSessions` reads every root session. */
const SESSIONS_SQL = `SELECT id, title, directory, time_created, time_updated FROM session_v2
  WHERE (CASE WHEN ?2 IS NULL THEN parent_id IS NULL ELSE id = ?2 END)
    AND (?1 IS NULL OR directory = ?1)`;

const { watchLoop } = await import(join(agent, "loop-watch.ts"));
const accounts = await import(join(agent, "provider-accounts.ts"));
const storesClient = join(agent, "stores/client.ts");
const onTheLoop = join(agent, "harnesses/opencode-db.ts");

/** The listing of `db`: the session count, or undefined when unanswered. */
const listing: () => Promise<number | undefined> = existsSync(storesClient)
  ? await (async () => {
      const { storeRead } = await import(storesClient);
      return async () => {
        // The stores thread lists every database on the machine: here
        // `XDG_DATA_HOME`'s, which is `<db>`.
        const read = await storeRead("opencode.sessions", {}, 5000);
        return read.kind === "answered" ? read.value.length : undefined;
      };
    })()
  : await (async () => {
      const { readOpencodeDb } = await import(onTheLoop);
      const { syncSection } = await import(join(agent, "loop-watch.ts"));
      return () =>
        Promise.resolve(
          syncSection("OpenCode sessions listed (SQLite)", () =>
            readOpencodeDb(db, [], (open: import("bun:sqlite").Database) =>
              open.query(SESSIONS_SQL).all(null, null)
            )
          ).length
        );
    })();

/** A sign-ins read as either tree answers it: a value, or `{ kind }` from a bounded one. */
const answered = (value: unknown): boolean =>
  value !== undefined &&
  !(
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "unanswered"
  );

const stop = watchLoop((line: string) => console.log(line), late);
let worst = 0;
let expected = performance.now() + TICK_MS;
const ticker = setInterval(() => {
  const now = performance.now();
  worst = Math.max(worst, now - expected);
  expected = now + TICK_MS;
}, TICK_MS);

let rounds = 0;
let reads = 0;
let unanswered = 0;
const until = Date.now() + ms;
while (Date.now() < until) {
  // biome-ignore lint/performance/noAwaitInLoops: one round at a time, as each tick reads
  const round = await Promise.all([
    accounts.homeStoresStamp(),
    accounts.opencodeOwnChanges(),
    listing(),
  ]);
  rounds += 1;
  for (const one of round) {
    reads += 1;
    if (!answered(one)) {
      unanswered += 1;
    }
  }
  await Bun.sleep(100);
}
clearInterval(ticker);
stop();
console.log(
  JSON.stringify({
    rounds,
    reads,
    unanswered,
    worstLateMs: Math.round(worst),
    sessions: await listing(),
  })
);
process.exit(0);

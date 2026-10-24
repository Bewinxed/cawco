/**
 * While the hub runs, only the hub process writes its database, through one
 * connection (hub db/wal.ts: sqlite.org/wal.html §11's WAL-reset bug needs
 * two connections writing or checkpointing at once). On a scratch fleet's
 * real hub:
 *
 * 1. The running hub holds its database file open once: one connection,
 *    the delegate types' table on it (delegate-types.ts) rather than a
 *    second. A delegate type saved through the hub's route is read back
 *    through it.
 * 2. `scripts/repair-account-history.ts`, which writes the hub's database,
 *    refuses while the hub runs, naming the hub's process and why, and
 *    changes nothing; its `--dry-run` reads beside the hub.
 * 3. With the hub stopped, the same repair runs to its end (exit 0) and
 *    lets the hub's lock go: the hub starts again on its database.
 *
 * `cawco pairing off` (cli pairing.ts) still writes beside a running hub:
 * how it reaches the hub instead is the owner's pick, not made here.
 *
 *   bun scripts/probe-kit/run.ts hub-one-writer
 */
import { Database } from "bun:sqlite";
import { readdirSync, readlinkSync } from "node:fs";
import { join } from "node:path";
import type { Kit, Spec } from "../kit";

const ROOT = join(import.meta.dir, "..", "..", "..");
const REPAIR = join(ROOT, "scripts", "repair-account-history.ts");
const TYPE = "probe-one-writer";
const ACCOUNT = "probe-one-writer-account";

/** How many of `pid`'s open files are the database file itself (not its -wal, -shm or lock). */
const opensOf = (pid: number, db: string): number =>
  readdirSync(`/proc/${pid}/fd`).filter((fd) => {
    try {
      return readlinkSync(`/proc/${pid}/fd/${fd}`) === db;
    } catch {
      return false;
    }
  }).length;

/** The repair script's run on `db`: its exit and what it said. */
const repair = async (db: string, extra: string[] = []) => {
  const child = Bun.spawn(
    [
      process.execPath,
      REPAIR,
      db,
      "--account",
      ACCOUNT,
      "--identity",
      "someone-else@example.com",
      "--since",
      "2026-01-01T00:00:00Z",
      ...extra,
    ],
    { cwd: ROOT, stdout: "pipe", stderr: "pipe" }
  );
  const [code, out, err] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { code, said: `${out}${err}`.trim() };
};

const spec: Spec = {
  name: "hub-one-writer",
  run: async (kit: Kit) => {
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
    const db = fleet.env.CAWCO_DB_PATH as string;

    // 1. One connection, and the delegate types on it.
    const hub = fleet.launch("hub");
    await fleet.hubUp();
    const saved = await fetch(`${fleet.base}/api/delegate-types/${TYPE}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        description: "A type the probe saves through the hub.",
        harness: "claude",
        model: "sonnet",
      }),
    });
    const listed = (await fetch(`${fleet.base}/api/delegate-types`).then((r) =>
      r.json()
    )) as { types: { name: string }[] };
    kit.check(
      "a delegate type saved through the hub's route is read back through it",
      saved.ok && listed.types.some((type) => type.name === TYPE),
      `PUT ${saved.status}; listed ${listed.types.map((type) => type.name).join(", ")}`
    );
    const opens = opensOf(hub.pid, db);
    kit.check(
      "the running hub holds its database file open once: one connection",
      opens === 1,
      `${opens} open file(s) of ${db} in process ${hub.pid}`
    );

    // 2. The repair refuses beside the running hub; its dry run reads.
    const refused = await repair(db);
    kit.check(
      "the account-history repair refuses while the hub runs, naming the hub's process and why, before it opens the database",
      refused.code === 1 &&
        refused.said.includes(`process ${hub.pid}:`) &&
        refused.said.includes(
          "while the hub runs, only the hub writes its database"
        ),
      `exit ${refused.code}: ${refused.said}`
    );
    const dry = await repair(db, ["--dry-run"]);
    kit.check(
      "its --dry-run reads beside the running hub (no lock asked: it finds no such account and says so)",
      dry.code === 1 && dry.said.includes(`there is no account ${ACCOUNT}`),
      `exit ${dry.code}: ${dry.said}`
    );

    // 3. With the hub stopped, the repair runs and lets the lock go.
    await fleet.stop("hub");
    const seed = new Database(db);
    try {
      seed
        .query(
          "INSERT INTO accounts (id, provider, kind, hue, \"order\", created_at) VALUES (?, 'claude', 'subscription', 'blue', 99, ?)"
        )
        .run(ACCOUNT, Date.now());
    } finally {
      seed.close();
    }
    const ran = await repair(db);
    kit.check(
      "with the hub stopped, the repair runs to its end",
      ran.code === 0 && ran.said.includes("rows removed: 0"),
      `exit ${ran.code}: ${ran.said.split("\n").slice(-3).join(" | ")}`
    );
    const unseed = new Database(db);
    try {
      unseed.query("DELETE FROM accounts WHERE id = ?").run(ACCOUNT);
    } finally {
      unseed.close();
    }
    const again = fleet.launch("hub");
    await fleet.hubUp();
    kit.check(
      "the repair let the hub's lock go: the hub starts again on its database",
      opensOf(again.pid, db) === 1,
      `hub ${again.pid} up, ${opensOf(again.pid, db)} open file(s) of the database`
    );
    await fleet.stop("hub");
  },
};

export default spec;

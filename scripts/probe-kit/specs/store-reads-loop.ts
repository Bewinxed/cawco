/**
 * The agent's loop is never held while it reads OpenCode's own store: its
 * sign-ins (each heartbeat's `homeStoresStamp`, the config tick's
 * `opencodeOwnChanges`) and the session listing are read on the agent's
 * stores thread (agent stores/), and the loop only waits for the answer.
 *
 * 2026-10-25, obelisk: the live agent's loop was held 42 times from 17:39,
 * up to 105 s at 19:10, nearly every hold's last marked section "OpenCode's
 * own sign-ins read (SQLite)", read on the loop from a 12.7 GB database with
 * a 196 MB write-ahead log that OpenCode's server writes all the time, the
 * host at load 140–194 from delegates' builds and probes and short of
 * memory (its page cache gone, direct reclaim on every allocation).
 *
 * The scene, in the spec's folder:
 * - An OpenCode database of {@link DB_GB} GB (`--db-gb`), its sessions'
 *   pages scattered among its messages' as a long-lived one's are, in WAL.
 * - Another process, as OpenCode's server: {@link WAL_MB} MB committed to
 *   the write-ahead log and never checkpointed, then write transactions
 *   one after another, each holding the lock {@link HOLD_WRITE_MS} ms
 *   before it commits (WRITER).
 * - Memory pressure as the reads meet it: the database's and its log's
 *   pages dropped from the page cache every {@link EVICT_MS}
 *   (`posix_fadvise(POSIX_FADV_DONTNEED)`), so every read goes to the disk,
 *   as on a machine whose cache reclaim took. The machine's own memory is
 *   never pressed: the owner's live agent runs here.
 * - The machine loaded inside a capped scope, never uncapped:
 *   {@link SPINNERS} CPU spinners and a writer that syncs to the disk,
 *   under `systemd-run --user --scope -p CPUQuota=…% -p MemoryMax=…`.
 *   `--no-load` runs without it, said in the run, where no user manager is
 *   reachable (inside a workspace's boundary).
 *
 * In it the agent's reads run for {@link RUN_MS} (store-reads-child.ts), as
 * the agent runs them, with its loop watch saying every hold of
 * {@link HOLD_MS} ms or more:
 * (a) the scene stands: the database, its log and the held write;
 * (b) the loop watch logs no hold of {@link HOLD_MS} ms or more, and the
 *     loop's worst lateness stays under {@link HEARTBEAT_MS} ms;
 * (c) the reads answer: every round's sign-ins and listing come back.
 *
 * Main fails (b): its reads run on the loop. Run against another checkout's
 * agent with `--against <its packages/agent/src>`.
 *
 *   bun scripts/probe-kit/run.ts store-reads-loop [--db-gb 12] [--no-load] [--against <dir>]
 */
import { Database } from "bun:sqlite";
import { mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { loopWords } from "../../../packages/core/src/words/loop";
import { type Kit, ROOT, type Spec } from "../kit";

const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? undefined : args[at + 1];
};

/** The database's size: obelisk's was 12.7 GB. */
const DB_GB = Number(option("db-gb") ?? 12);
/** Its write-ahead log: obelisk's was 196 MB. */
const WAL_MB = 200;
/** Root sessions in it, and as many children. */
const SESSIONS = 10_000;
/** OpenCode's own sign-ins in it. */
const SIGN_INS = 6;
/** How long each of the writer's transactions holds its lock before it commits. */
const HOLD_WRITE_MS = 90;
/** How long the reads run. */
const RUN_MS = 30_000;
/** A hold the brief counts: the loop watch's threshold here. */
const HOLD_MS = 200;
/**
 * The loop's worst lateness allowed, and the loop watch's threshold here.
 * Measured in a workspace on obelisk (2026-10-25, unloaded, pages dropped,
 * the writer holding its lock): main's reads on the loop left it 35 and
 * 113 ms late at 12 GB and 43 ms at 1 GB, the stores thread's 5 and 9 ms.
 * Our bar, under the 50 ms a heartbeat may cost.
 */
const HEARTBEAT_MS = 20;
/** How often the database's pages are dropped from the page cache. */
const EVICT_MS = 500;
/** CPU spinners in the capped scope. */
const SPINNERS = 12;
/** The scope's CPU cap: the spinners' cores, and no more. */
const CPU_QUOTA = `${SPINNERS * 100}%`;
/** The scope's memory cap. */
const MEMORY_MAX = "4G";
/** One message row's bytes. */
const ROW_BYTES = 1024 * 1024;

const AGAINST = option("against") ?? join(ROOT, "packages/agent/src");
const LOADED = !args.includes("--no-load");

/**
 * An OpenCode 2.0 database at `path` of about `gb` GB: its sign-ins, its
 * sessions (half of them roots) and their messages, a session's rows
 * written between messages' so its pages lie scattered through the file.
 * Built without a journal, then turned to WAL as OpenCode keeps it.
 */
const buildDb = (path: string, gb: number): void => {
  const db = new Database(path, { create: true });
  db.exec(
    "PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF; PRAGMA cache_size = -65536;"
  );
  db.exec(`
    CREATE TABLE credential (id TEXT PRIMARY KEY, integration_id TEXT, value TEXT, active INTEGER, time_updated INTEGER);
    CREATE TABLE session_v2 (id TEXT PRIMARY KEY, title TEXT, directory TEXT, parent_id TEXT, project_id TEXT, model TEXT, time_created INTEGER, time_updated INTEGER);
    CREATE TABLE session_message (id TEXT PRIMARY KEY, session_id TEXT, type TEXT, time_created INTEGER, time_updated INTEGER, data BLOB);
  `);
  const credential = db.query(
    "INSERT INTO credential VALUES (?, ?, json(?), 1, ?)"
  );
  for (let at = 0; at < SIGN_INS; at += 1) {
    credential.run(
      `cred_${at}`,
      `provider${at}`,
      JSON.stringify({ type: at % 2 ? "oauth" : "key", methodID: "probe" }),
      Date.now()
    );
  }
  const session = db.query(
    "INSERT INTO session_v2 VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)"
  );
  const message = db.query(
    "INSERT INTO session_message VALUES (?, ?, 'assistant', ?, ?, zeroblob(?))"
  );
  const rows = Math.round((gb * 1024 ** 3) / ROW_BYTES);
  const sessions = SESSIONS * 2;
  const every = Math.max(1, Math.floor(rows / sessions));
  db.exec("BEGIN");
  let made = 0;
  for (let at = 0; at < Math.max(rows, sessions); at += 1) {
    if (at % every === 0 && made < sessions) {
      const id = `ses_${String(made).padStart(8, "0")}`;
      session.run(
        id,
        `Probe session ${made}`,
        `/probe/dir${made % 40}`,
        made % 2 ? `ses_${String(made - 1).padStart(8, "0")}` : null,
        Date.now(),
        Date.now()
      );
      made += 1;
    }
    if (at < rows) {
      message.run(
        `msg_${String(at).padStart(10, "0")}`,
        `ses_${String(at % Math.max(made, 1)).padStart(8, "0")}`,
        Date.now(),
        Date.now(),
        ROW_BYTES
      );
    }
  }
  db.exec("COMMIT");
  db.exec("PRAGMA journal_mode = WAL");
  db.close();
};

/**
 * OpenCode's server as the reads meet it: {@link WAL_MB} MB committed to
 * the log with checkpoints off, then, until it is killed, one write
 * transaction after another, each held open {@link HOLD_WRITE_MS} ms and
 * committed: the lock held nearly all the time, and every commit moving a
 * sign-in's row and invalidating each reader's cache, as a server with
 * hundreds of sessions writes. Says `held` once it holds the first.
 */
const WRITER = `
import { Database } from "bun:sqlite";
const db = new Database(process.argv[1]);
db.exec("PRAGMA wal_autocheckpoint = 0; PRAGMA synchronous = NORMAL;");
const put = db.query("INSERT INTO session_message VALUES (?, 'ses_00000000', 'assistant', ?, ?, zeroblob(?))");
const touch = db.query("UPDATE credential SET time_updated = ? WHERE id = 'cred_0'");
const touchSession = db.query("UPDATE session_v2 SET time_updated = ? WHERE id = ?");
for (let at = 0; at < Number(process.argv[2]); at += 1) {
  db.exec("BEGIN");
  put.run("wal_" + at, Date.now(), Date.now(), ${ROW_BYTES});
  db.exec("COMMIT");
}
let said = false;
for (let at = 0; ; at += 1) {
  db.exec("BEGIN IMMEDIATE");
  put.run("held_" + at, Date.now(), Date.now(), 4096);
  touch.run(Date.now());
  touchSession.run(Date.now(), "ses_" + String((at * 7919) % ${SESSIONS * 2}).padStart(8, "0"));
  if (!said) {
    console.log("held");
    said = true;
  }
  Bun.sleepSync(${HOLD_WRITE_MS});
  db.exec("COMMIT");
}
`;

/** The database's and its log's pages dropped from the page cache: the next read of each goes to the disk. */
const evict = (paths: string[]): Promise<number> =>
  Bun.spawn(
    [
      "python3",
      "-I",
      "-c",
      "import os,sys\nfor p in sys.argv[1:]:\n  fd=os.open(p,os.O_RDONLY)\n  os.posix_fadvise(fd,0,0,os.POSIX_FADV_DONTNEED)\n  os.close(fd)",
      ...paths,
    ],
    { stdout: "ignore", stderr: "ignore" }
  ).exited;

/** Every hold the loop watch logged, in ms: its own line once a hold ended (loop-watch.ts `stallLine`). */
const holdsIn = (lines: string[]): number[] => {
  const said = loopWords.heldEnded(0).slice(0, -"0 ms".length);
  return lines
    .filter((line) => line.startsWith(said))
    .map((line) => Number(line.slice(said.length).split(" ")[0]));
};

export default {
  group: "Speed",
  name: "store-reads-loop",
  run: async (kit: Kit) => {
    const { check } = kit;
    const data = join(kit.out, "data");
    const dir = join(data, "opencode");
    const db = join(dir, "opencode.db");
    await mkdir(dir, { recursive: true });
    const scope = `cawco-probe-store-reads-${process.pid}`;
    let writer: { kill: () => void } | undefined;
    let evicting = true;
    try {
      const began = Date.now();
      buildDb(db, DB_GB);
      kit.note(
        `an OpenCode database of ${DB_GB} GB built in ${Math.round((Date.now() - began) / 1000)} s at ${db}`
      );
      const writing = Bun.spawn(["bun", "-e", WRITER, db, String(WAL_MB)], {
        stdout: "pipe",
        stderr: "pipe",
      });
      writer = writing;
      const said = await writing.stdout.getReader().read();
      const holding =
        new TextDecoder().decode(said?.value ?? new Uint8Array()).trim() ===
        "held";
      const [dbSize, walSize] = await Promise.all([
        stat(db).then((info) => info.size),
        stat(`${db}-wal`).then(
          (info) => info.size,
          () => 0
        ),
      ]);
      check(
        `a: an OpenCode database of ${DB_GB} GB, ${WAL_MB} MB in its write-ahead log never checkpointed, and another process holding its write lock`,
        holding &&
          dbSize >= DB_GB * 0.95 * 1024 ** 3 &&
          walSize >= WAL_MB * ROW_BYTES,
        `database ${Math.round(dbSize / 2 ** 20)} MB, log ${Math.round(walSize / 2 ** 20)} MB, writer ${holding ? "holding" : "not holding"}`
      );

      const evictions = (async () => {
        while (evicting) {
          await evict([db, `${db}-wal`]);
          await Bun.sleep(EVICT_MS);
        }
      })();

      if (LOADED) {
        const load = Bun.spawn(
          [
            "systemd-run",
            "--user",
            "--scope",
            "--quiet",
            `--unit=${scope}`,
            "-p",
            `CPUQuota=${CPU_QUOTA}`,
            "-p",
            `MemoryMax=${MEMORY_MAX}`,
            "--",
            "bash",
            "-c",
            `for i in $(seq ${SPINNERS}); do (while :; do :; done) & done; while :; do head -c 268435456 /dev/zero > "$1"; sync "$1"; done`,
            "cawco-probe-load",
            join(kit.out, "load.bin"),
          ],
          { stdout: "ignore", stderr: "pipe" }
        );
        await Bun.sleep(2000);
        if (load.exitCode !== null) {
          const err = await new Response(load.stderr).text();
          check(
            `b: the machine loaded inside a capped scope (CPUQuota=${CPU_QUOTA}, MemoryMax=${MEMORY_MAX})`,
            false,
            `systemd-run exited ${load.exitCode}: ${err.trim()} (inside a workspace, run with --no-load, and on the host for the loaded run)`
          );
          return;
        }
        kit.note(
          `the machine loaded inside ${scope}.scope: ${SPINNERS} CPU spinners and a syncing writer, CPUQuota=${CPU_QUOTA}, MemoryMax=${MEMORY_MAX}`
        );
      } else {
        kit.note(
          "no load: --no-load (the database's pages are still dropped from the cache throughout)"
        );
      }

      const child = Bun.spawn(
        [
          "bun",
          join(ROOT, "scripts/probe-kit/store-reads-child.ts"),
          AGAINST,
          db,
          String(RUN_MS),
          String(HEARTBEAT_MS),
        ],
        {
          cwd: kit.out,
          env: { ...process.env, XDG_DATA_HOME: data },
          stdout: "pipe",
          stderr: "pipe",
        }
      );
      const [out, err, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      evicting = false;
      await evictions;
      const lines = out.split("\n").filter(Boolean);
      for (const line of lines.filter((one) => one.startsWith("[loop]"))) {
        kit.note(line);
      }
      const summary = JSON.parse(lines.at(-1) ?? "{}") as {
        reads?: number;
        rounds?: number;
        sessions?: number;
        unanswered?: number;
        worstLateMs?: number;
      };
      kit.note(
        `the agent's reads from ${AGAINST}: ${JSON.stringify(summary)}; exit ${code}${err.trim() ? `; stderr: ${err.trim().slice(0, 600)}` : ""}`
      );
      const holds = holdsIn(lines);
      const long = holds.filter((ms) => ms >= HOLD_MS);
      check(
        `b: through ${RUN_MS / 1000} s of the sign-ins read and the session listing, the loop watch logs no hold of ${HOLD_MS} ms or more, and the loop is never ${HEARTBEAT_MS} ms late`,
        code === 0 &&
          long.length === 0 &&
          (summary.worstLateMs ?? Number.POSITIVE_INFINITY) < HEARTBEAT_MS,
        `holds logged (ms): ${holds.join(", ") || "none"}; worst lateness ${summary.worstLateMs} ms`
      );
      check(
        "c: every round's sign-ins and listing answer, the listing with every root session",
        (summary.rounds ?? 0) > 0 &&
          summary.unanswered === 0 &&
          summary.sessions === SESSIONS,
        JSON.stringify(summary)
      );
    } finally {
      evicting = false;
      writer?.kill();
      if (LOADED) {
        await Bun.spawn(["systemctl", "--user", "stop", `${scope}.scope`], {
          stdout: "ignore",
          stderr: "ignore",
        }).exited;
      }
      await rm(data, { recursive: true, force: true });
      await rm(join(kit.out, "load.bin"), { force: true });
    }
  },
} satisfies Spec;

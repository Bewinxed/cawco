/**
 * Updates › a hub started on a copy of the live hub's database answers its
 * updater's probe through its own machine's register (hub-restart-load's
 * question, on the live rows rather than seeded ones).
 *
 * 2026-10-23 15:54, obelisk, nightly 5224: after the restart the hub logged
 * nothing for three ~45 s stretches, each one right after
 * `[hub] machine d04ca118428001f1 registered` and its `[fleet] welcome …
 * 326 item(s)`; apply.log: "does not answer" from 15.4 s to 151.8 s.
 *
 * `PROBE_HUB_DB` names the live database or a copy of it (`VACUUM INTO`,
 * read-only on the given file). Its copy, in the scratch fleet's hub folder, is made inert
 * before the hub opens it ({@link INERT}): no SSH to the fleet's machines,
 * no routine, poll, relay, event route, push or OpenRouter key, paired
 * devices not required. The hub reaches nothing past loopback: its HTTP(S)
 * goes to a proxy that answers nothing. Its secrets are sealed with a key the
 * copy does not hold: an unseal error is expected. The scratch agent joins
 * as the hub's own machine ({@link HUB_MACHINE}), so its register reads that
 * machine's rows (4,313 sessions on the live copy of 2026-10-23), and its
 * catalog lists a conversation file for each of its Claude sessions, as the
 * machine's own does, so its register carries that catalog.
 *
 * 2026-10-24 20:36–20:39, obelisk, nightly 5540: "the hub does not answer
 * (… no answer within 3003ms)" at 11.3 s, 66.1 s and 127.4 to 136.4 s of
 * the trial, rolled back at 171.4 s. Each hold came while the orchestrator
 * (1,352 direct delegates) and the person's dashboard read its artifacts:
 * every such read walked the delegates, asking each whether it takes input
 * now (server.ts `inputRefusal`), and placed the 14 that ran on no account
 * on one, each time ("[hub] … launches on … (it ran on no account; …)").
 *
 * (a) From the hub's first answer, `/health` probed once a second for
 *     {@link WATCH_MS}, through the agent's register, while dashboards
 *     reconnect and the session with the most delegates has its artifacts
 *     read as its own tools and its Files list read them
 *     ({@link driveReads}): every probe answered within {@link SLOWEST_MS},
 *     and from the hub's first answer no task held its thread
 *     {@link HELD_MS} or longer (its timer's lateness, {@link LAG_TICK_MS}
 *     apart, `lag.log`); how long opening the copy held it is noted.
 * (b) Noted: how long after its launch the hub first answered `/health`, on
 *     the copy's first open and on a second one (the next update's restart),
 *     and the one-time repairs `data_migrations` records; and how long the
 *     fleet's skill and plugin listings take on the copy before its
 *     migrations and after.
 * (c) Reading is not acting: one of the lead's delegates at rest that holds
 *     an artifact is made one a person stopped that ran on no account; every
 *     artifact read of the lead asks whether it takes input, and none places
 *     it on an account (no "launches on" line for it).
 * (d) A send is: a person's word to that same session places it on an
 *     account and starts it.
 * (e) A machine's answer that comes after its caller was told none came is
 *     dropped as it comes: a transcript of 160 pictures, its machine frozen
 *     past the read's deadline, holds the hub's thread under the bound and
 *     /health answers throughout.
 *
 * `PROBE_CPU_PROF=1` writes the hub's CPU profile (Chrome .cpuprofile) to
 * the spec's folder; the hub ends itself {@link PROFILE_MS} after it starts.
 *
 *   PROBE_HUB_DB=<database> bun scripts/probe-kit/run.ts hub-restart-live-db
 */
import { Database } from "bun:sqlite";
import { randomBytes } from "node:crypto";
import {
  mkdirSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { readWithin } from "../../../packages/core/src/bounded";
import { CLAUDE_DIR_NAME } from "../../../packages/core/src/claude-dirs";
import { CONTROL_GET_SESSION_MESSAGES } from "../../../packages/core/src/harness";
import { WIRE_PROTOCOL } from "../../../packages/core/src/stream";
import {
  WIRE_PARTS_PARAM,
  WIRE_PARTS_VALUE,
} from "../../../packages/core/src/wire";
import { machineReadWords } from "../../../packages/core/src/words/machine-reads";
import { spawnWords } from "../../../packages/core/src/words/spawn";
import type { Kit, KitFleet, Spec } from "../kit";

/** The live hub's own machine, obelisk: the register that held the hub. */
const HUB_MACHINE = "d04ca118428001f1";
const PROBE_EVERY_MS = 1000;
const PROBE_TIMEOUT_MS = 3000;
/**
 * The longest a probe may take: half the trial's 3 s. This is the live
 * database itself, so no margin for a larger one is owed, as
 * hub-restart-load's third is; half is the room left for a busier machine
 * than this scratch one. Our choice: runs on the live copy of 2026-10-23
 * answered within 529 to 1,403 ms after the fixes, and 18 of 83 probes not
 * at all on main.
 */
const SLOWEST_MS = 1500;
/** The trial's whole window, near enough: it rolls back at 3 min without 60 s held. */
const WATCH_MS = 180_000;
const PROFILE_MS = 210_000;
/**
 * The longest the hub's thread may be held by one task. Our choice: a sixth
 * of the trial's 3 s probe, the bound the hub's own work is held to (a few
 * hundred ms at most).
 */
const HELD_MS = 500;
/** How often the hub's own timer looks at the clock: its lateness is how long the thread was held. */
const LAG_TICK_MS = 20;
/** A lateness at or over this is written to `lag.log`; under it, a busy turn, not a hold. */
const LAG_NOTED_MS = 100;
/** How often the delegating session's artifacts are read: its tools and its Files list, a busy orchestrator's pace. */
const READ_EVERY_MS = 10_000;
/** How many dashboards are open, each reconnecting once a minute, as tabs and phones do after a restart. */
const DASHBOARDS = 3;
const RECONNECT_MS = 60_000;
/** The longest a driven read or a socket's first frame is waited for. Our choice: far past any hold the bound allows. */
const READ_BOUND_MS = 60_000;
const HTTP_SCHEME = /^http/u;
/** (e)'s conversation: how many pictures, and the bytes of each. Our choice: past a hundred MB of base64, as the live orchestrator's transcripts carry. */
const HEAVY_PICTURES = 160;
const PICTURE_BYTES = 768 * 1024;
/** The hub's deadline on a transcript read (server.ts `READ_TIMEOUT_MS`): (e)'s machine is frozen past it. */
const READ_DEADLINE_MS = 10_000;
/** How long after (e)'s ask its machine is frozen, and how long past the deadline it is let go. */
const FREEZE_AFTER_MS = 1000;
/** How long (e) watches in all, and how long after its late answer is said. */
const LATE_WATCH_MS = 120_000;
const LATE_SETTLE_MS = 15_000;
/** How long (d)'s send has to place and start its session. Our choice: a wake is seconds. */
const WAKE_MS = 30_000;
/** A Claude session at rest with a conversation to wake into, whose row the hub reads. */
const AT_REST_CLAUDE =
  "i.harness = 'claude' AND i.session_id IS NOT NULL AND i.status IN ('sleeping', 'error', 'stopped') AND i.machine_removed = 0 AND (i.end_intent IS NULL OR i.end_intent = 'stop') AND i.continued_into IS NULL AND (i.last_error_kind IS NULL OR i.last_error_kind != 'conversation-gone')";
/** How many times each listing is read for its timing. */
const LISTINGS = 20;

/**
 * The fleet's skill and plugin listings, as db/index.ts `listSkills` and
 * `listPlugins` select them, each read {@link LISTINGS} times: the ms they
 * took in all.
 */
const listingMs = (db: Database): number => {
  const skills = db.query(
    "SELECT name, source, enabled, hash, bytes, error, scope, project_id, version, last_refresh, latest_hash, latest_version, checked_at, check_error FROM skills"
  );
  const plugins = db.query(
    "SELECT id, enabled, hash, bytes, error, version, last_refresh, latest_hash, latest_version, checked_at, check_error FROM plugins"
  );
  const from = performance.now();
  for (let n = 0; n < LISTINGS; n += 1) {
    skills.all();
    plugins.all();
  }
  return Math.round(performance.now() - from);
};

/**
 * What the copy loses before the hub opens it, so nothing in it acts on the
 * world: each statement against a table the copy may not have is skipped.
 */
const INERT = [
  "DELETE FROM ssh_machines",
  "UPDATE pairing_settings SET required = 0",
  "UPDATE routines SET enabled = 0, disabled_reason = 'probe copy'",
  "DELETE FROM push_devices",
  "DELETE FROM openrouter_connection",
  "UPDATE jev_settings SET typesafe_key = NULL",
  "DELETE FROM relays",
  "DELETE FROM connector_polls",
  "DELETE FROM event_routes",
  "DELETE FROM github_pollers",
  "DELETE FROM tracker_bindings",
  "DELETE FROM stream_relay",
  "DELETE FROM stream_relay_journey",
];

/** How many migrations the copy's own record says are applied, and the newest's time. */
const migrationsOf = (db: Database): { count: number; newest: number } =>
  db
    .query(
      "SELECT count(*) AS count, max(created_at) AS newest FROM __drizzle_migrations"
    )
    .get() as { count: number; newest: number };

/** `url` probed as the trial probes it: its time to answer, or null for none within the bound. */
const probe = async (url: string): Promise<number | null> => {
  const from = performance.now();
  const read = await readWithin(PROBE_TIMEOUT_MS, async (signal) => {
    const response = await fetch(url, { signal });
    await response.arrayBuffer();
  }).catch(() => undefined);
  return read?.kind === "answered"
    ? Math.round(performance.now() - from)
    : null;
};

async function run(kit: Kit): Promise<void> {
  const source = process.env.PROBE_HUB_DB;
  if (!source) {
    kit.check(
      "PROBE_HUB_DB names the live hub's database or a copy of it",
      false,
      "set PROBE_HUB_DB=<the live database, or a copy of it>"
    );
    return;
  }
  const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
  const dbPath = fleet.env.CAWCO_DB_PATH ?? "";
  // SQLite's own copy, never the file's bytes: a live hub's database is in
  // WAL (hub db/wal.ts), with commits still in its `-wal`. Read-only on the
  // source, which may be the live file itself or a copy of it.
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${dbPath}${suffix}`, { force: true });
  }
  const given = new Database(source, { readonly: true });
  try {
    given.run(`VACUUM INTO '${dbPath.replaceAll("'", "''")}'`);
  } finally {
    given.close();
  }
  const db = new Database(dbPath);
  const skipped: string[] = [];
  for (const statement of INERT) {
    try {
      db.run(statement);
    } catch (error) {
      skipped.push(`${statement}: ${(error as Error).message}`);
    }
  }
  // What the machine's own agent reports in its register: a conversation
  // file for each Claude session its rows name (`resumable`, `resumableAt`,
  // agent daemon.ts `registerPayload`), each dated off its row as a real
  // catalog is (a file's mtime is never its row's time to the millisecond).
  const conversations = db
    .query(
      "SELECT session_id AS sessionId, cwd, updated_at AS updatedAt FROM instances WHERE machine_id = ? AND harness = 'claude' AND session_id IS NOT NULL"
    )
    .all(HUB_MACHINE) as {
    cwd: string;
    sessionId: string;
    updatedAt: number;
  }[];
  const sessions = (
    db
      .query("SELECT count(*) AS n FROM instances WHERE machine_id = ?")
      .get(HUB_MACHINE) as { n: number }
  ).n;
  const migrationsBefore = migrationsOf(db);
  // The session with the most delegates: the orchestrator whose reads walk them.
  const lead = db
    .query(
      "SELECT parent_instance_id AS id, count(*) AS delegates FROM instances WHERE parent_instance_id IS NOT NULL GROUP BY parent_instance_id ORDER BY delegates DESC LIMIT 1"
    )
    .get() as { delegates: number; id: string } | null;
  const asked = sessionAsked(db, lead?.id);
  const heavy = heavySession(db, [lead?.id ?? "", asked?.id ?? ""]);
  const listingBefore = listingMs(db);
  db.close();
  for (const { cwd, sessionId, updatedAt } of conversations) {
    const dir = join(
      fleet.home,
      CLAUDE_DIR_NAME,
      "projects",
      cwd.replace(/[^a-zA-Z0-9]/gu, "-")
    );
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${sessionId}.jsonl`);
    writeFileSync(
      file,
      `${JSON.stringify({ type: "user", sessionId, cwd, uuid: crypto.randomUUID(), parentUuid: null, timestamp: new Date(updatedAt).toISOString(), message: { role: "user", content: "seeded" } })}\n`
    );
    const at = new Date(updatedAt + 1234);
    utimesSync(file, at, at);
  }
  await writeHeavy(fleet.home, heavy);
  kit.note(
    `the copy is inert (${INERT.length - skipped.length} statements; skipped ${JSON.stringify(skipped)}); ${sessions} sessions on ${HUB_MACHINE}, ${conversations.length} of them Claude conversations its agent's catalog lists`
  );

  const profile = process.env.PROBE_CPU_PROF === "1";
  const ending = join(kit.out, "profile-exit.ts");
  if (profile) {
    writeFileSync(
      ending,
      `setTimeout(() => process.exit(0), ${PROFILE_MS}).unref?.();\n`
    );
  }
  // The hub's own timer, looking at the clock every LAG_TICK_MS: each
  // lateness of LAG_NOTED_MS or more is a task that held its thread that
  // long, written with when it ended (ms since the hub started).
  const lagLog = join(kit.out, "lag.log");
  const lagWatch = join(kit.out, "lag-watch.ts");
  rmSync(lagLog, { force: true });
  writeFileSync(
    lagWatch,
    `import { appendFileSync } from "node:fs";
const started = performance.now();
let last = started;
setInterval(() => {
  const now = performance.now();
  const held = now - last - ${LAG_TICK_MS};
  last = now;
  if (held >= ${LAG_NOTED_MS}) {
    appendFileSync(${JSON.stringify(lagLog)}, \`\${Math.round(now - started)} \${Math.round(held)}\\n\`);
  }
}, ${LAG_TICK_MS}).unref?.();
`
  );
  // Nothing past loopback: every HTTP(S) request goes to a port nothing
  // answers on.
  const nowhere = "http://127.0.0.1:9";
  const loopback = "localhost,127.0.0.1,::1";
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  const hubEnv = {
    HTTP_PROXY: nowhere,
    http_proxy: nowhere,
    HTTPS_PROXY: nowhere,
    https_proxy: nowhere,
    NO_PROXY: loopback,
    no_proxy: loopback,
  };
  const firstBoot = await bootHub(fleet, {
    ...hubEnv,
    BUN_OPTIONS: profile
      ? `--cpu-prof --cpu-prof-dir=${kit.out} --preload ${ending} --preload ${lagWatch}`
      : `--preload ${lagWatch}`,
  });
  kit.note(
    `first open of the copy: /health first answered ${firstBoot} ms after the hub's launch`
  );
  // What the hub said as it opened the copy (its migrations among it) and
  // its first answer, kept with the run.
  const firstHealth = await fetch(`${fleet.base}/health`).then((response) =>
    response.text()
  );
  kit.note(`first /health: ${firstHealth.slice(0, 400)}`);
  // The migrations this checkout carries, applied to the copy as it opened.
  const opened = new Database(dbPath, { readonly: true });
  const migrationsAfter = migrationsOf(opened);
  const columns = (
    opened.query("PRAGMA table_info(instances)").all() as { name: string }[]
  ).map((column) => column.name);
  const listingAfter = listingMs(opened);
  opened.close();
  kit.note(
    `the fleet's skill and plugin listings (db listSkills, listPlugins, ${LISTINGS} each) read in ${listingBefore} ms on the copy before its migrations, ${listingAfter} ms after`
  );
  kit.note(
    `migrations applied: ${migrationsBefore.count} before (newest ${migrationsBefore.newest}), ${migrationsAfter.count} after (newest ${migrationsAfter.newest}); instances has ${columns.length} columns, the last ${columns.slice(-3).join(", ")}`
  );
  // An account of the probe's own that the scratch agent reports signed in:
  // the copy's are signed out once the agent says it holds none of them,
  // and (d)'s wake is placed on one.
  fleet.fileAccount();
  fleet.launch("agent", [], { CAWCO_MACHINE_ID: HUB_MACHINE });
  const reads: { at: number; health: number | null }[] = [];
  const from = Date.now();
  // Profiled, the probes stop two probes short of the hub ending itself,
  // which it counts from its launch.
  const watch = profile
    ? Math.min(WATCH_MS, PROFILE_MS - firstBoot - 2 * PROBE_TIMEOUT_MS)
    : WATCH_MS;
  const until = from + watch;
  const driven = driveReads(fleet.base, lead?.id, until);
  while (Date.now() < until) {
    const at = Date.now() - from;
    reads.push({ at, health: await probe(`${fleet.base}/health`) });
    await Bun.sleep(Math.max(0, PROBE_EVERY_MS - (Date.now() - from - at)));
  }
  const timed = await driven;
  writeFileSync(join(kit.out, "reads.json"), JSON.stringify(timed, null, 1));
  const slowestRead = timed.reduce(
    (worst, one) => (one.ms > worst.ms ? one : worst),
    { at: 0, ms: 0, path: "none", status: 0 }
  );
  kit.note(
    `${lead?.id ?? "no session"} (${lead?.delegates ?? 0} delegates): ${timed.length} reads of its artifacts and dashboards' reconnects; slowest ${slowestRead.ms} ms (${slowestRead.path} at ${(slowestRead.at / 1000).toFixed(0)}s, HTTP ${slowestRead.status}); each in reads.json`
  );
  const log = await fleet.logs("hub");
  writeFileSync(join(kit.out, "hub.log"), log);
  const holds = await lagLines(lagLog);
  // Before its first answer the hub is opening the copy, not serving (its
  // updater reads that as not up yet, never as unanswered): its holds then
  // are noted, and those after it are held to the bound. Its clock starts
  // as it loads, after its launch, so a hold that ends by the first answer
  // on its clock ends by it on ours too.
  const worstOf = (some: typeof holds) =>
    some.reduce((worst, one) => (one.held > worst.held ? one : worst), {
      at: 0,
      held: 0,
    });
  const serving = holds.filter((one) => one.at > firstBoot);
  const longest = worstOf(serving);
  const booting = worstOf(holds.filter((one) => one.at <= firstBoot));
  kit.note(
    `opening the copy, before its first answer at ${firstBoot} ms, the hub's thread was held ${booting.held} ms at the longest (ending ${booting.at} ms after it started)`
  );
  const registered = log
    .split("\n")
    .filter((line) => line.includes(`machine ${HUB_MACHINE} registered`));
  readingPlacesNothing(kit, asked?.id, timed, log);
  if (profile) {
    // Until the hub has ended itself, PROFILE_MS after its launch, and
    // written its profile.
    await Bun.sleep(
      Math.max(0, PROFILE_MS - firstBoot - (Date.now() - from)) + 8000
    );
    kit.note(
      `profile: ${readdirSync(kit.out)
        .filter((name) => name.endsWith(".cpuprofile"))
        .join(", ")}`
    );
  }
  writeFileSync(join(kit.out, "probes.json"), JSON.stringify(reads, null, 1));
  const missed = reads.filter((one) => one.health === null);
  const slowest = Math.max(
    ...reads.map((one) => one.health ?? PROBE_TIMEOUT_MS)
  );
  kit.check(
    `a: on the live database's copy, through ${HUB_MACHINE}'s register, with ${DASHBOARDS} dashboards reconnecting and the busiest orchestrator's artifacts read every ${READ_EVERY_MS / 1000} s, every probe of /health in ${watch / 1000} s is answered within ${SLOWEST_MS} ms, and from its first answer no task holds the hub's thread ${HELD_MS} ms`,
    registered.length > 0 &&
      missed.length === 0 &&
      slowest <= SLOWEST_MS &&
      longest.held < HELD_MS,
    `${reads.length} probes, ${missed.length} unanswered (at ${missed.map((one) => `${(one.at / 1000).toFixed(0)}s`).join(", ") || "none"}), slowest ${slowest} ms; registers ${registered.length}; from its first answer the thread held ${LAG_NOTED_MS} ms or more ${serving.length} times, longest ${longest.held} ms (ending ${(longest.at / 1000).toFixed(1)} s after the hub started); each probe in probes.json, each hold in lag.log`
  );
  if (profile) {
    return;
  }

  await fleet.accountSignedIn();
  await sendPlaces(kit, fleet, asked?.id);
  await lateAnswerHolds(kit, fleet, heavy?.id, lagLog);

  // (b) The update's next restart: the same copy opened again, its
  // migrations and its one-time repairs already in it.
  await fleet.stop("hub");
  const secondBoot = await bootHub(fleet, hubEnv);
  const marked = new Database(dbPath, { readonly: true });
  const repairs = (
    marked.query("SELECT name FROM data_migrations ORDER BY name").all() as {
      name: string;
    }[]
  ).map((row) => row.name);
  marked.close();
  kit.note(
    `second open of the copy: /health first answered ${secondBoot} ms after the hub's launch (first open ${firstBoot} ms); data_migrations holds ${JSON.stringify(repairs)}`
  );
}

/**
 * (c)'s and (d)'s session: a delegate of `lead`'s holding an artifact, at
 * rest, made one a person stopped that ran on no account. Every artifact
 * read of the lead asks whether it takes input (artifacts/service.ts
 * `answerable`), and (d) sends to it.
 */
const sessionAsked = (
  db: Database,
  lead: string | undefined
): { id: string } | null => {
  const asked = lead
    ? (db
        .query(
          `SELECT i.id FROM instances i WHERE i.parent_instance_id = ? AND i.machine_id = ? AND ${AT_REST_CLAUDE} AND i.work_item_id IS NULL AND i.permission_mode IS NOT NULL AND EXISTS (SELECT 1 FROM artifacts a WHERE a.instance_id = i.id AND a.held_for IS NULL) LIMIT 1`
        )
        .get(lead, HUB_MACHINE) as { id: string } | null)
    : null;
  if (asked) {
    db.run(
      "UPDATE instances SET account_id = NULL, status = 'stopped', end_intent = 'stop', end_confirmed_at = updated_at WHERE id = ?",
      [asked.id]
    );
  }
  return asked;
};

/** (e)'s session: one at rest of no work item and no earlier conversation, whose transcript nothing reads before (e). */
interface Heavy {
  cwd: string;
  id: string;
  sessionId: string;
  updatedAt: number;
}
const heavySession = (db: Database, not: string[]): Heavy | null =>
  db
    .query(
      `SELECT i.id, i.session_id AS sessionId, i.cwd, i.updated_at AS updatedAt FROM instances i WHERE i.machine_id = ? AND ${AT_REST_CLAUDE} AND i.work_item_id IS NULL AND i.parent_instance_id IS NULL AND i.id NOT IN (?, ?) AND NOT EXISTS (SELECT 1 FROM instance_conversations c WHERE c.instance_id = i.id) ORDER BY i.updated_at DESC LIMIT 1`
    )
    .get(HUB_MACHINE, not[0] ?? "", not[1] ?? "") as Heavy | null;

/**
 * (e)'s conversation file, in place of the one-line one the catalog wrote:
 * {@link HEAVY_PICTURES} turns, each a picture of {@link PICTURE_BYTES}
 * random bytes the person pasted (base64, as Claude Code stores it) and a
 * reply, chained as a long session writes them.
 */
const writeHeavy = async (home: string, heavy: Heavy | null): Promise<void> => {
  if (!heavy) {
    return;
  }
  const file = join(
    home,
    CLAUDE_DIR_NAME,
    "projects",
    heavy.cwd.replace(/[^a-zA-Z0-9]/gu, "-"),
    `${heavy.sessionId}.jsonl`
  );
  const writer = Bun.file(file).writer();
  let parent: string | null = null;
  const line = (type: "user" | "assistant", message: object, n: number) => {
    const uuid = crypto.randomUUID();
    writer.write(
      `${JSON.stringify({ parentUuid: parent, isSidechain: false, userType: "external", cwd: heavy.cwd, sessionId: heavy.sessionId, version: "2.1.0", type, message, uuid, timestamp: new Date(heavy.updatedAt - (HEAVY_PICTURES - n) * 1000).toISOString() })}\n`
    );
    parent = uuid;
  };
  for (let n = 0; n < HEAVY_PICTURES; n += 1) {
    line(
      "user",
      {
        role: "user",
        content: [
          { type: "text", text: `Picture ${n}.` },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: randomBytes(PICTURE_BYTES).toString("base64"),
            },
          },
        ],
      },
      n
    );
    line(
      "assistant",
      { role: "assistant", content: [{ type: "text", text: `Seen ${n}.` }] },
      n
    );
  }
  await writer.end();
  const at = new Date(heavy.updatedAt + 1234);
  utimesSync(file, at, at);
};

/** The holds `lag.log` holds, in order. */
const lagLines = async (
  lagLog: string
): Promise<{ at: number; held: number }[]> =>
  (
    await Bun.file(lagLog)
      .text()
      .catch(() => "")
  )
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [at, held] = line.split(" ").map(Number);
      return { at: at ?? 0, held: held ?? 0 };
    });

/**
 * (e) A late answer is nobody's: (e)'s transcript is asked for, its machine
 * frozen past the read's deadline and let go, so its answer, every picture
 * in it, comes after its caller was told none came. /health is probed once
 * a second from the ask until {@link LATE_SETTLE_MS} after the hub says the
 * answer came late; no probe goes unanswered past {@link SLOWEST_MS}, and no
 * task holds the hub's thread {@link HELD_MS}.
 */
const lateAnswerHolds = async (
  kit: Kit,
  fleet: KitFleet,
  heavy: string | undefined,
  lagLog: string
): Promise<void> => {
  const name = `e: a transcript answer of ${HEAVY_PICTURES} pictures (${Math.round((HEAVY_PICTURES * PICTURE_BYTES * 4) / 3 / 1e6)} MB) that comes after its caller was told none came holds the hub's thread under ${HELD_MS} ms, and /health is answered within ${SLOWEST_MS} ms meanwhile`;
  if (!heavy) {
    kit.check(name, false, "the copy holds no session at rest for (e)");
    return;
  }
  const before = (await lagLines(lagLog)).length;
  const lateLine = (said: string) =>
    said
      .split("\n")
      .find(
        (line) =>
          line.includes(CONTROL_GET_SESSION_MESSAGES) &&
          line.includes(machineReadWords.pastDeadline)
      );
  const already = lateLine(await fleet.logs("hub"));
  const read = readWithin(LATE_WATCH_MS, async (signal) => {
    const response = await fetch(
      `${fleet.base}/api/instances/${encodeURIComponent(heavy)}/transcript`,
      { signal }
    );
    await response.arrayBuffer();
    return response.status;
  }).catch(() => undefined);
  const probes: (number | null)[] = [];
  const from = Date.now();
  let late: { at: number; line: string } | undefined;
  const freezing = (async () => {
    await Bun.sleep(FREEZE_AFTER_MS);
    fleet.freeze("agent", true);
    await Bun.sleep(READ_DEADLINE_MS + FREEZE_AFTER_MS);
    fleet.freeze("agent", false);
  })();
  while (
    Date.now() - from < LATE_WATCH_MS &&
    !(late && Date.now() - late.at > LATE_SETTLE_MS)
  ) {
    const at = Date.now();
    probes.push(await probe(`${fleet.base}/health`));
    const line = lateLine(await fleet.logs("hub"));
    if (!late && line && line !== already) {
      late = { at: Date.now(), line };
    }
    await Bun.sleep(Math.max(0, PROBE_EVERY_MS - (Date.now() - at)));
  }
  await freezing;
  const status = await read;
  const holds = (await lagLines(lagLog)).slice(before);
  const longest = Math.max(0, ...holds.map((one) => one.held));
  const missed = probes.filter((one) => one === null).length;
  const slowest = Math.max(0, ...probes.map((one) => one ?? PROBE_TIMEOUT_MS));
  kit.check(
    name,
    !!late && missed === 0 && slowest <= SLOWEST_MS && longest < HELD_MS,
    `${heavy}: ${late ? late.line.trim() : "no late answer was said within the watch"}; its read answered HTTP ${status?.kind === "answered" ? status.value : "none"}; ${probes.length} probes, ${missed} unanswered, slowest ${slowest} ms; the thread held ${LAG_NOTED_MS} ms or more ${holds.length} times, longest ${longest} ms`
  );
};

/** The hub's lines placing `id` on an account at its launch, in `said`. */
const placedLines = (id: string, said: string): string[] =>
  said
    .split("\n")
    .filter((line) => line.includes(`${id} ${spawnWords.launchesOn} `));

/** The artifact_list reads among a watch's reads. */
const listReads = (timed: TimedRead[]): number =>
  timed.filter((one) => one.path.endsWith("/artifacts/status")).length;

/**
 * (c) Reading is not acting: the lead's artifact reads asked of `asked`, a
 * delegate at rest that ran on no account, whether it takes input, and the
 * hub's log `log` never places it.
 */
const readingPlacesNothing = (
  kit: Kit,
  asked: string | undefined,
  timed: TimedRead[],
  log: string
): void => {
  const placed = asked ? placedLines(asked, log) : [];
  kit.check(
    `c: the lead's artifact reads place no account: its delegate at rest that ran on no account, asked whether it takes input on every read, is never placed (no \`${spawnWords.launchesOn}\` line for it)`,
    !!asked && listReads(timed) > 0 && placed.length === 0,
    asked
      ? `${asked}: ${placed.length} \`${spawnWords.launchesOn}\` line(s) over ${listReads(timed)} artifact_list reads${placed[0] ? `; ${placed[0].trim()}` : ""}`
      : "the copy holds no delegate of the lead's at rest holding an artifact"
  );
};

/**
 * (d) A send is an act: a person's word to `woken`, a stopped session that
 * ran on no account, places it on an account and starts it.
 */
const sendPlaces = async (
  kit: Kit,
  fleet: KitFleet,
  woken: string | undefined
): Promise<void> => {
  const name =
    "d: a person's send to a stopped session that ran on no account places it on an account and starts it";
  if (!woken) {
    kit.check(
      name,
      false,
      "the copy holds no delegate of the lead's at rest holding an artifact"
    );
    return;
  }
  const uuid = await fleet.send(woken, "Carry on.", HUB_MACHINE);
  const started = await readWithin(WAKE_MS, async () => {
    for (;;) {
      const said = await fleet.logs("hub");
      const status = fleet.instance(woken)?.status;
      const [line] = placedLines(woken, said);
      if (line && status !== "stopped") {
        return { line, status };
      }
      await Bun.sleep(500);
    }
  }).catch(() => undefined);
  kit.check(
    name,
    started?.kind === "answered",
    started?.kind === "answered"
      ? `${woken}: ${started.value.line.trim()}; its row ${started.value.status}`
      : `${woken}: within ${WAKE_MS / 1000} s, ${placedLines(woken, await fleet.logs("hub")).length} \`${spawnWords.launchesOn}\` line(s), its row ${fleet.instance(woken)?.status}; the send ${JSON.stringify(fleet.sendRow(uuid) ?? null)}`
  );
};

/** One timed read of {@link driveReads}: when it began (ms into the watch), its path, how long it took, its status (0: none). */
interface TimedRead {
  at: number;
  ms: number;
  path: string;
  status: number;
}

/**
 * What reaches a hub just restarted besides its updater's probe, until
 * `until`: {@link DASHBOARDS} dashboards opening their socket (the whole
 * board, sent on open), each again every {@link RECONNECT_MS}; Find asked
 * once (its index built); and, every {@link READ_EVERY_MS}, the reads of
 * session `lead`'s artifacts its own tools make (artifact_list's status,
 * waiting or not) and its Files list and panel menu, then its newest
 * transcript page. Each read and each socket's first frame, timed.
 */
const driveReads = async (
  base: string,
  lead: string | undefined,
  until: number
): Promise<TimedRead[]> => {
  const from = Date.now();
  const timed: TimedRead[] = [];
  const read = async (path: string): Promise<void> => {
    const at = Date.now();
    const answer = await readWithin(READ_BOUND_MS, async (signal) => {
      const response = await fetch(`${base}${path}`, { signal });
      await response.arrayBuffer();
      return response.status;
    }).catch(() => undefined);
    timed.push({
      at: at - from,
      path,
      ms: Date.now() - at,
      status: answer?.kind === "answered" ? answer.value : 0,
    });
  };
  const socketUrl = `${base.replace(HTTP_SCHEME, "ws")}/ws/dashboard?${WIRE_PARTS_PARAM}=${WIRE_PARTS_VALUE}&protocol=${WIRE_PROTOCOL}`;
  /** One dashboard: open, its first frame timed, closed and opened again each RECONNECT_MS. */
  const dashboard = async (index: number): Promise<void> => {
    await Bun.sleep(index * 1000);
    while (Date.now() < until) {
      const at = Date.now();
      const socket = new WebSocket(socketUrl);
      const first = await readWithin(
        READ_BOUND_MS,
        () =>
          new Promise<boolean>((resolve) => {
            socket.addEventListener("message", () => resolve(true), {
              once: true,
            });
            socket.addEventListener("close", () => resolve(false), {
              once: true,
            });
          })
      ).catch(() => undefined);
      timed.push({
        at: at - from,
        path: `dashboard ${index} socket`,
        ms: Date.now() - at,
        status: first?.kind === "answered" && first.value ? 200 : 0,
      });
      await Bun.sleep(Math.max(0, Math.min(RECONNECT_MS, until - Date.now())));
      socket.close();
    }
  };
  const tools = async (): Promise<void> => {
    if (!lead) {
      return;
    }
    const id = encodeURIComponent(lead);
    while (Date.now() < until) {
      const round = Date.now();
      for (const path of [
        `/api/instances/${id}/artifacts/status`,
        `/api/instances/${id}/artifacts/status?waiting=true`,
        `/api/instances/${id}/artifacts/files`,
        `/api/instances/${id}/artifacts`,
        `/api/instances/${id}/transcript`,
      ]) {
        await read(path);
      }
      await Bun.sleep(
        Math.max(
          0,
          Math.min(READ_EVERY_MS - (Date.now() - round), until - Date.now())
        )
      );
    }
  };
  await Promise.all([
    ...Array.from({ length: DASHBOARDS }, (_, index) => dashboard(index)),
    read("/api/find?q=hub%20stall"),
    tools(),
  ]);
  return timed;
};

/** The hub launched with `env`, and how long after its launch `/health` first answered ok. */
const bootHub = async (
  fleet: KitFleet,
  env: Record<string, string>
): Promise<number> => {
  const launched = Date.now();
  fleet.launch("hub", [], env);
  await fleet.hubUp();
  return Date.now() - launched;
};

export default {
  group: "Speed",
  name: "hub-restart-live-db",
  run,
} satisfies Spec;

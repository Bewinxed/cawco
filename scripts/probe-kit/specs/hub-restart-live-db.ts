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
 *     and the one-time repairs `data_migrations` records.
 *
 * `PROBE_CPU_PROF=1` writes the hub's CPU profile (Chrome .cpuprofile) to
 * the spec's folder; the hub ends itself {@link PROFILE_MS} after it starts.
 *
 *   PROBE_HUB_DB=<database> bun scripts/probe-kit/run.ts hub-restart-live-db
 */
import { Database } from "bun:sqlite";
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
import { WIRE_PROTOCOL } from "../../../packages/core/src/stream";
import {
  WIRE_PARTS_PARAM,
  WIRE_PARTS_VALUE,
} from "../../../packages/core/src/wire";
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
const HTTP_SCHEME = /^http/;

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
  db.close();
  for (const { cwd, sessionId, updatedAt } of conversations) {
    const dir = join(
      fleet.home,
      CLAUDE_DIR_NAME,
      "projects",
      cwd.replace(/[^a-zA-Z0-9]/g, "-")
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
  opened.close();
  kit.note(
    `migrations applied: ${migrationsBefore.count} before (newest ${migrationsBefore.newest}), ${migrationsAfter.count} after (newest ${migrationsAfter.newest}); instances has ${columns.length} columns, the last ${columns.slice(-3).join(", ")}`
  );
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
    // biome-ignore lint/performance/noAwaitInLoops: the trial probes once a second, one probe after another
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
  const holds = (
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
      // biome-ignore lint/performance/noAwaitInLoops: one socket at a time per dashboard, as a tab holds one
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
        // biome-ignore lint/performance/noAwaitInLoops: one read after another, as one session's tools make them
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

export default { name: "hub-restart-live-db", run } satisfies Spec;

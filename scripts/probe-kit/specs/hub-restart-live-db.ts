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
 * (a) From the hub's first answer, `/health` probed once a second for
 *     {@link WATCH_MS}, through the agent's register: every probe answered
 *     within {@link SLOWEST_MS}.
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
const WATCH_MS = 120_000;
const PROFILE_MS = 90_000;

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
    ...(profile
      ? {
          BUN_OPTIONS: `--cpu-prof --cpu-prof-dir=${kit.out} --preload ${ending}`,
        }
      : {}),
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
  const watch = profile ? PROFILE_MS - 2 * PROBE_TIMEOUT_MS : WATCH_MS;
  while (Date.now() - from < watch) {
    const at = Date.now() - from;
    // biome-ignore lint/performance/noAwaitInLoops: the trial probes once a second, one probe after another
    reads.push({ at, health: await probe(`${fleet.base}/health`) });
    await Bun.sleep(Math.max(0, PROBE_EVERY_MS - (Date.now() - from - at)));
  }
  const log = await fleet.logs("hub");
  writeFileSync(join(kit.out, "hub.log"), log);
  const registered = log
    .split("\n")
    .filter((line) => line.includes(`machine ${HUB_MACHINE} registered`));
  if (profile) {
    await Bun.sleep(8000);
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
    `a: on the live database's copy, through ${HUB_MACHINE}'s register, every probe of /health in ${watch / 1000} s is answered within ${SLOWEST_MS} ms`,
    registered.length > 0 && missed.length === 0 && slowest <= SLOWEST_MS,
    `${reads.length} probes, ${missed.length} unanswered (at ${missed.map((one) => `${(one.at / 1000).toFixed(0)}s`).join(", ") || "none"}), slowest ${slowest} ms; registers ${registered.length}; each probe in probes.json`
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

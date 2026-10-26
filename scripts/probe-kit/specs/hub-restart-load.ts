/**
 * Updates › after its update restarts the hub on a machine carrying the
 * fleet's load, the hub answers what the updater's trial probes, `GET
 * /health` and this machine's row, within the probe's 3 s, every second of
 * the trial (core binary-health.ts `PROBE_TIMEOUT_MS`), so a good build is
 * never rolled back.
 *
 * 2026-10-23 09:44Z, obelisk, nightly 5146: the trial went healthy at 25 s,
 * then through its confirmation window "the hub does not answer (GET
 * http://127.0.0.1:3456/health: no answer within 3003ms)" again and again,
 * and the build was rolled back at 150 s; the hub's unit "Consumed 1min
 * 34.690s CPU time over 3min 7.127s wall clock time".
 *
 * On a scratch fleet of the live one's shape ({@link SHAPE}): machines,
 * each running Claude Code sessions resumed from session files of the
 * live transcripts' sizes, the largest one conversation of thousands of
 * entries. The hub is stopped and started again, as an update does, and
 * from its first answer is probed as the trial probes it, once a second for
 * {@link WATCH_MS}.
 *
 * (a) Every probe of `/health` and of this machine's row is answered within
 *     {@link SLOWEST_MS}, a third of the trial's 3 s (the margin the live
 *     database's size needs).
 *
 * `PROBE_CPU_PROF=1` writes the restarted hub's CPU profile (Chrome .cpuprofile) to
 * the spec's folder.
 *
 *   bun scripts/probe-kit/run.ts hub-restart-load
 */
import { Database } from "bun:sqlite";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readWithin } from "../../../packages/core/src/bounded";
import { CLAUDE_DIR_NAME } from "../../../packages/core/src/claude-dirs";
import { MACHINE, MODEL } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

/** The trial's probe: once a second, each request given 3 s (core binary-health.ts). */
const PROBE_EVERY_MS = 1000;
const PROBE_TIMEOUT_MS = 3000;
/**
 * The longest any probe may take here: a third of the trial's 3 s. This
 * scratch database holds the live one's rows at a twelfth of its size (39 MB
 * of 467 MB), and the live hub went silent for over 30 s where this one was
 * held 1.2 to 6 s, so a hold this one shows at a third of the bound is past
 * it on the live fleet. Our choice, from those runs.
 */
const SLOWEST_MS = 1000;
/** How long the restarted hub is probed: the trial's confirmation is 60 s held. */
const WATCH_MS = 90_000;
/** How long a profiled hub runs before it ends itself: past the stall the live one showed in its first minute. */
const PROFILE_MS = 40_000;

/**
 * The live fleet's sessions, by machine, by their transcripts' entries
 * (obelisk's journal, 2026-10-23 12:45: 55, 5, 292, 101, 66, 70, 166,
 * 6629, 1054, 519, 767, 170, 169, 241 entries).
 */
const SHAPE: Record<string, number[]> = {
  [MACHINE]: [6629, 1054, 767, 519, 292, 241, 170, 166, 101, 70, 66, 55],
  "restart-load-b": [169, 120, 80],
  "restart-load-c": [300, 60],
  "restart-load-d": [200],
};

/**
 * The live hub's database, by rows (obelisk, 2026-10-23, read-only: 467 MB):
 * every session it ever held, by status, and its largest tables. The
 * scratch hub's own rows are copied up to these counts while it is stopped,
 * each copy a new id, tied to one of the sessions seeded.
 */
const STATUSES: Record<string, number> = {
  stopped: 2145,
  sleeping: 1971,
  error: 277,
  discarded: 121,
};
/** The end a stopped or discarded session's row owes. */
const END_INTENT: Record<string, string> = {
  stopped: "stop",
  discarded: "discard",
};
const TABLES: Record<string, number> = {
  usage_limit_history: 49_551,
  sent_messages: 33_071,
  usage_buckets: 27_069,
  completed_turns: 23_370,
  turn_usage: 18_152,
  fleet_mcp_sessions: 16_926,
  delegate_events: 7774,
};

interface Column {
  name: string;
  pk: number;
  type: string;
}

/** Copies of `table`'s rows up to `target`, `vary` giving each copy what it holds of its own. */
const multiply = (
  db: Database,
  table: string,
  target: number,
  vary: (row: Record<string, unknown>, n: number) => Record<string, unknown>
): number => {
  const columns = db.query(`PRAGMA table_info(${table})`).all() as Column[];
  const rows = db.query(`SELECT * FROM ${table}`).all() as Record<
    string,
    unknown
  >[];
  if (columns.length === 0 || rows.length === 0) {
    return rows.length;
  }
  const names = columns.map((column) => column.name);
  const insert = db.prepare(
    `INSERT OR IGNORE INTO ${table} (${names.map((name) => `"${name}"`).join(", ")}) VALUES (${names.map(() => "?").join(", ")})`
  );
  const keys = columns.filter((column) => column.pk > 0);
  db.transaction(() => {
    for (let n = rows.length; n < target; n += 1) {
      const base = rows[n % rows.length] as Record<string, unknown>;
      const copy: Record<string, unknown> = { ...base, ...vary(base, n) };
      for (const key of keys) {
        copy[key.name] = key.type.toUpperCase().includes("INT")
          ? null
          : crypto.randomUUID();
      }
      insert.run(...(names.map((name) => copy[name] ?? null) as never[]));
    }
  })();
  return (db.query(`SELECT count(*) AS n FROM ${table}`).get() as { n: number })
    .n;
};

/** A brief's worth of words: what a send to a delegate or Caw carries (the live table: 33,071 sends in a 467 MB file). */
const BRIEF =
  "Read the code path named below, fix the rule that produced it, and prove it on the owner's scenario. ".repeat(
    30
  );

/** A copied send as the live ones read: its own uuid in its body, a brief's words, and its own time. */
const sentAsLive = (
  row: Record<string, unknown>,
  n: number
): Record<string, unknown> => {
  const body = JSON.parse(String(row.body)) as {
    message?: { content?: unknown };
    uuid?: string;
  };
  body.uuid = crypto.randomUUID();
  if (body.message) {
    body.message.content = `${n}: ${BRIEF}`;
  }
  // Read long since, as nearly every live send is: none owed or pending.
  return {
    body: JSON.stringify(body),
    accepted_at: Date.now() - n * 30_000,
    state: "read",
    owed: null,
  };
};

/** The scratch hub's database grown to the live one's rows ({@link STATUSES}, {@link TABLES}): what each row count came to. */
const seedLiveRows = (path: string): Record<string, number> => {
  const db = new Database(path);
  db.exec("PRAGMA foreign_keys = OFF");
  const counts: Record<string, number> = {};
  const statuses = Object.entries(STATUSES).flatMap(([status, count]) =>
    Array.from({ length: count }, () => status)
  );
  const running = (
    db.query("SELECT count(*) AS n FROM instances").get() as { n: number }
  ).n;
  counts.instances = multiply(
    db,
    "instances",
    running + statuses.length,
    (_row, n) => {
      const status = statuses[n - running] ?? "stopped";
      // As the live rows stand: a stopped or discarded session's end is
      // owed and confirmed; a sleeping or failed one owes none.
      const ended = status === "stopped" || status === "discarded";
      return {
        status,
        session_id: crypto.randomUUID(),
        title: `seeded ${status} session ${n}`,
        end_intent: ended ? END_INTENT[status] : null,
        end_confirmed_at: ended ? Date.now() - n * 60_000 : null,
        updated_at: Date.now() - n * 60_000,
      };
    }
  );
  const ids = (
    db.query("SELECT id FROM instances").all() as { id: string }[]
  ).map((row) => row.id);
  for (const [table, target] of Object.entries(TABLES)) {
    counts[table] = multiply(db, table, target, (row, n) => ({
      ...("instance_id" in row ? { instance_id: ids[n % ids.length] } : {}),
      ...(table === "sent_messages" ? sentAsLive(row, n) : {}),
    }));
  }
  db.close();
  return counts;
};

/** A tool result's size in a resumed file: a file read's, a command's output. */
const TOOL_RESULT_CHARS = 2400;

/**
 * A Claude Code session file of `entries` lines, as a long session writes
 * them: a person's ask, then turns of text and tool calls with their
 * results, each line chained to the one before (`parentUuid`).
 */
const sessionFile = (
  entries: number,
  cwd: string,
  sessionId: string
): string => {
  let parent: string | null = null;
  const out: string[] = [];
  const add = (type: "user" | "assistant", message: object) => {
    const uuid = crypto.randomUUID();
    out.push(
      JSON.stringify({
        parentUuid: parent,
        isSidechain: false,
        userType: "external",
        cwd,
        sessionId,
        version: "2.1.0",
        type,
        message,
        uuid,
        timestamp: new Date(
          Date.now() - (entries - out.length) * 1000
        ).toISOString(),
      })
    );
    parent = uuid;
  };
  const filler = "lorem ipsum dolor sit amet consectetur ".repeat(
    Math.ceil(TOOL_RESULT_CHARS / 39)
  );
  add("user", { role: "user", content: "Carry on with the work." });
  while (out.length < entries) {
    const turn = out.length;
    if (turn % 3 === 1) {
      add("assistant", {
        role: "assistant",
        model: MODEL.claude,
        content: [
          { type: "text", text: `Step ${turn}: ${filler.slice(0, 600)}` },
        ],
      });
      continue;
    }
    const id = `toolu_${crypto.randomUUID().replaceAll("-", "")}`;
    add("assistant", {
      role: "assistant",
      model: MODEL.claude,
      content: [
        {
          type: "tool_use",
          id,
          name: "Bash",
          input: {
            command: `grep -rn step-${turn} packages`,
            description: "Look",
          },
        },
      ],
    });
    add("user", {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: id,
          content: filler.slice(0, TOOL_RESULT_CHARS),
        },
      ],
    });
  }
  return `${out.join("\n")}\n`;
};

/** Sessions on `machineId`, one per entry count, each resumed from a session file that long. */
const resumeSessions = async (
  fleet: KitFleet,
  machineId: string,
  home: string,
  counts: number[]
): Promise<string[]> => {
  const dir = join(
    home,
    CLAUDE_DIR_NAME,
    "projects",
    fleet.repo.replace(/[^a-zA-Z0-9]/gu, "-")
  );
  mkdirSync(dir, { recursive: true });
  const ids: string[] = [];
  for (const [index, entries] of counts.entries()) {
    const sessionKey = crypto.randomUUID();
    writeFileSync(
      join(dir, `${sessionKey}.jsonl`),
      sessionFile(entries, fleet.repo, sessionKey)
    );
    const id = await fleet.spawn(
      "claude",
      `restart load ${machineId} ${index} (${entries})`,
      fleet.repo,
      { resume: { sessionKey } },
      machineId
    );
    ids.push(id);
  }
  return ids;
};

/** One probe of `url`, as the trial makes it: its time to answer, or null for none within the probe's bound. */
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
  const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const others = Object.keys(SHAPE).filter((id) => id !== MACHINE);
  const homes: Record<string, string> = { [MACHINE]: fleet.home };
  for (const machineId of others) {
    const machine = await fleet.launchMachine(machineId);
    homes[machineId] = machine.home;
  }
  const ids: string[] = [];
  for (const [machineId, counts] of Object.entries(SHAPE)) {
    const started = await resumeSessions(
      fleet,
      machineId,
      homes[machineId] ?? fleet.home,
      counts
    );
    ids.push(...started);
  }
  const sessions = ids.length;
  kit.note(
    `${sessions} sessions running on ${Object.keys(SHAPE).length} machines`
  );
  // A turn each, so the tables a turn writes hold rows to copy.
  for (const id of ids) {
    await fleet.send(id, "One more step.");
  }
  await Bun.sleep(15_000);

  // The update's restart: the hub stopped, its database grown to the live
  // one's rows, and started again.
  await fleet.stop("hub");
  const seeded = seedLiveRows(fleet.env.CAWCO_DB_PATH ?? "");
  kit.note(`seeded the hub's database to ${JSON.stringify(seeded)}`);
  if (process.env.PROBE_KEEP_DB === "1") {
    // SQLite's own copy: the hub's file is in WAL (hub db/wal.ts), and a
    // copy of its bytes alone would lose what its `-wal` still holds.
    const kept = join(kit.out, "seeded.db");
    rmSync(kept, { force: true });
    const seededDb = new Database(fleet.env.CAWCO_DB_PATH ?? "");
    try {
      seededDb.run(`VACUUM INTO '${kept.replaceAll("'", "''")}'`);
    } finally {
      seededDb.close();
    }
  }
  const profile = process.env.PROBE_CPU_PROF === "1";
  // Profiled, the hub ends itself {@link PROFILE_MS} after it starts: Bun
  // writes the profile on an exit of the process's own, and the hub leaves
  // SIGTERM to the kernel (lifetime.ts), which writes none.
  const ending = join(kit.out, "profile-exit.ts");
  if (profile) {
    writeFileSync(
      ending,
      `setTimeout(() => process.exit(0), ${PROFILE_MS}).unref?.();\n`
    );
  }
  fleet.launch(
    "hub",
    [],
    profile
      ? {
          BUN_OPTIONS: `--cpu-prof --cpu-prof-dir=${kit.out} --preload ${ending}`,
        }
      : {}
  );
  await fleet.hubUp();
  const health = `${fleet.base}/health`;
  const row = `${fleet.base}/api/agents/${encodeURIComponent(MACHINE)}`;
  const reads: { at: number; health: number | null; row: number | null }[] = [];
  const from = Date.now();
  // Profiled, the probes stop a probe short of the hub ending itself.
  while (
    Date.now() - from <
    (profile ? PROFILE_MS - 2 * PROBE_TIMEOUT_MS : WATCH_MS)
  ) {
    const at = Date.now() - from;
    const [h, r] = await Promise.all([probe(health), probe(row)]);
    reads.push({ at, health: h, row: r });
    const spent = Date.now() - from - at;
    await Bun.sleep(Math.max(0, PROBE_EVERY_MS - spent));
  }
  if (profile) {
    await Bun.sleep(5000);
    const written = readdirSync(kit.out).filter((name) =>
      name.endsWith(".cpuprofile")
    );
    kit.note(
      written.length > 0
        ? `the restarted hub's CPU profile: ${written.map((name) => join(kit.out, name)).join(", ")}`
        : "the restarted hub wrote no CPU profile"
    );
  }
  const missed = reads.filter((one) => one.health === null || one.row === null);
  const slowest = Math.max(
    ...reads.map((one) =>
      Math.max(one.health ?? PROBE_TIMEOUT_MS, one.row ?? PROBE_TIMEOUT_MS)
    )
  );
  writeFileSync(join(kit.out, "probes.json"), JSON.stringify(reads, null, 1));
  kit.check(
    `a: after the restart, with ${sessions} sessions on ${Object.keys(SHAPE).length} machines and the live database's rows, every probe of /health and this machine's row in ${WATCH_MS / 1000} s is answered within ${SLOWEST_MS} ms, a third of the trial's ${PROBE_TIMEOUT_MS / 1000} s`,
    missed.length === 0 && slowest <= SLOWEST_MS,
    `${reads.length} probes, ${missed.length} unanswered (at ${missed.map((one) => `${(one.at / 1000).toFixed(0)}s`).join(", ") || "none"}), slowest ${slowest} ms; each probe in probes.json`
  );
}

export default {
  group: "Speed",
  name: "hub-restart-load",
  run,
} satisfies Spec;

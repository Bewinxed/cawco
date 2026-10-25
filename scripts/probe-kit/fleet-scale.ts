/**
 * The owner's fleet at its own size, on a scratch fleet (owner, 2026-10-24:
 * "emulate heavy multitasking setup and big transcripts from the live
 * data"). The audit of that day read the live board at 1763 rows, 1698 of
 * them asleep, and found each hub message's cost growing with it (pulse
 * 32–45 ms, instances_delta 28–74 ms): a fleet of 25 rows never shows it.
 *
 * The scene, our own call shaped after the audit's board:
 * - one project on the fleet's repository, whose sessions the rail lists,
 *   its board `TASKS` tasks long;
 * - `rows` rows in all, `asleep` of them sleeping: a template session takes
 *   one turn and is put to sleep, then, the hub and agent down, its row and
 *   conversation are copied into the rest. Most stand in trees (a session
 *   and the delegates it started, up to four deep), as the owner's
 *   orchestrators' do; a few are stopped or failed; a handful ended unseen,
 *   so Finished lists them. Each tree is in the project but one in seven.
 *   The newest asleep is an orchestrator on a long conversation of its own
 *   (`LONG_MB`, claude-transcripts.ts): the session a cold load opens;
 * - live: `STREAMS` sessions in a tool loop that never ends (a call every
 *   couple of seconds, words before each), and `TURNS` sessions that take a
 *   short turn every `TURN_EVERY_MS`, each turn moving its row between
 *   working and idle. Together they send the hub's traffic of a busy fleet:
 *   pulses, rows changing, a turn ending somewhere every few seconds.
 *
 * `up` answers the dashboard's address once all of it runs; `stop` ends the
 * turns it sends.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: the fleet's steps happen one after another
import { Database } from "bun:sqlite";
import { readdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../scratch-fleet";
import { writeClaudeTranscript } from "./claude-transcripts";
import type { Kit, KitFleet } from "./kit";

/** The live board the audit read (0d8f70d1): rows, and how many slept. */
export const LIVE_ROWS = 1763;
export const LIVE_ASLEEP = 1698;
/** Sessions in an endless tool loop, and sessions taking a turn now and then. */
const STREAMS = 3;
const TURNS = 2;
/** How often each turn-taking session is sent its next turn. */
const TURN_EVERY_MS = 8000;
/** Rows stopped by the person; the rest of the ones not asleep and not live failed. */
const STOPPED = 35;
/** Ended after the owner last looked: what Finished lists. */
const UNSEEN = 8;
/** How far back the seeded rows were started. */
const HISTORY_MS = 40 * 24 * 60 * 60 * 1000;
/** A row's chance to be a delegate of a row started shortly before it. */
const DELEGATE_SHARE = 0.7;
/** How deep a tree goes. */
const DEPTH = 4;
/** A tree outside the project, one in this many. */
const UNPLACED_EVERY = 7;

/**
 * The long session's conversation, MB: an orchestrator's that has run for
 * days, its tool results up to hundreds of kilobytes (claude-transcripts.ts).
 * The owner's longest live one, 23cb5219, served an 854 KB page cold
 * (2026-10-25). Our own call of size: its newest page is what a cold load
 * reads, and any size past a few windows reads the same.
 */
const LONG_MB = 24;

/**
 * Tasks on the project's board, each with a description, to-dos and labels:
 * a project a fleet has worked in for weeks. Our own call; the owner's
 * served a 1025 KB page cold (2026-10-25).
 */
const TASKS = 200;

const STREAM_TAG = "PROBE-SCALE-STREAM";
const TURN_TAG = "PROBE-SCALE-TURN";

/** Words streamed one by one. */
const wordsOf = (n: number, label: string): string[] =>
  Array.from({ length: n }, (_, i) => `${i === 0 ? `${label}: ` : ""}w${i} `);

/** What the mock answers: a stream's call after call, a turn's one call then its end. */
export const scaleRespond = (request: Seen): Reply => {
  if (!request.tools) {
    return { everyMs: 1, words: ["Scale"] };
  }
  if (request.all.includes(STREAM_TAG)) {
    return {
      everyMs: 30,
      words: wordsOf(20, "stream"),
      tool: {
        name: "Bash",
        input: { command: "sleep 2; echo ok", description: "Step" },
      },
    };
  }
  if (request.last.includes(TURN_TAG) && !request.afterTool) {
    return {
      everyMs: 20,
      words: wordsOf(10, "turn"),
      tool: {
        name: "Bash",
        input: { command: "sleep 1; echo ok", description: "Step" },
      },
    };
  }
  return { everyMs: 5, words: ["Done."] };
};

/** A session at rest: its first turn answered and closed. */
async function answered(
  fleet: KitFleet,
  title: string,
  projectId: string
): Promise<string> {
  const id = await fleet.spawn("claude", title, fleet.workdir, { projectId });
  const sent = Date.now();
  await fleet.send(id, "Say ok.");
  await until(
    `${title}'s first turn answered and closed`,
    () =>
      fleet.seen.some((one) => one.at >= sent) &&
      fleet.instance(id)?.turn_open_at === null
        ? true
        : undefined,
    Boolean,
    120_000
  );
  return id;
}

/** Asks `id` to sleep (again every 15 s: a machine refuses one not at rest) until its row reads sleeping. */
function asleep(fleet: KitFleet, id: string) {
  let askedAt = 0;
  return until(
    `${id.slice(0, 8)} asleep`,
    async () => {
      const status = fleet.instance(id)?.status;
      if (status !== "sleeping" && Date.now() - askedAt > 15_000) {
        askedAt = Date.now();
        await fleet.control(id, "sleep");
      }
      return status;
    },
    (status) => status === "sleeping",
    90_000
  );
}

/** The file Claude Code keeps conversation `sessionId` in, under `home`. */
const conversationFile = (home: string, sessionId: string) => {
  const name = `${sessionId}.jsonl`;
  const found = (readdirSync(home, { recursive: true }) as string[]).find(
    (path) => path.endsWith(`/${name}`)
  );
  return found ? join(home, found) : undefined;
};

/** One seeded row: the template's, with these columns its own. */
interface Seeded {
  id: string;
  overrides: Record<string, number | string | null>;
}

/** Copies of row `templateId`, each as `rows` says, in one transaction. */
function seedRows(path: string, templateId: string, rows: Seeded[]): void {
  const db = new Database(path);
  try {
    const names = (
      db.query("PRAGMA table_info(instances)").all() as { name: string }[]
    ).map((column) => column.name);
    const template = db
      .query("SELECT * FROM instances WHERE id = ?")
      .get(templateId) as Record<string, unknown>;
    const insert = db.prepare(
      `INSERT INTO instances (${names.map((name) => `"${name}"`).join(", ")}) VALUES (${names.map(() => "?").join(", ")})`
    );
    db.transaction(() => {
      for (const row of rows) {
        const copy: Record<string, unknown> = {
          ...template,
          id: row.id,
          ...row.overrides,
        };
        insert.run(...(names.map((name) => copy[name] ?? null) as never[]));
      }
    })();
  } finally {
    db.close();
  }
}

/**
 * The seeded rows: `count` copies of the template, the first `sleeping`
 * asleep, then `STOPPED` stopped and the rest failed, in trees, each with a
 * conversation of its own beside the template's.
 */
function seedBoard(
  fleet: KitFleet,
  from: {
    file: string;
    projectId: string;
    sessionId: string;
    template: string;
  },
  count: number,
  sleeping: number
): { long: string; trees: number; unseen: number } {
  const now = Date.now();
  const conversation = readFileSync(from.file, "utf8");
  // A fixed sequence, so every run seeds the same board.
  let seed = 1763;
  const random = () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return seed / 2_147_483_648;
  };
  const rows: Seeded[] = [];
  /** Each row's depth in its tree, and its tree's project. */
  const placed = new Map<string, { depth: number; projectId: string | null }>();
  let trees = 0;
  /** The newest sleeping row: the long session, a tree's top of its own. */
  const longAt = sleeping - 1;
  for (let n = 0; n < count; n += 1) {
    const id = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const status = statusOf(n, sleeping);
    // Started in order over the history, the newest last.
    const created = now - HISTORY_MS + Math.floor((HISTORY_MS * n) / count);
    const moved = created + Math.floor(random() * 2 * 60 * 60 * 1000);
    // A delegate of a row started shortly before, unless that tree is deep.
    const parentAt = n - 1 - Math.floor(random() * 50);
    const parent =
      parentAt >= 0 && random() < DELEGATE_SHARE && n !== longAt
        ? rows[parentAt]
        : undefined;
    const above = parent ? placed.get(parent.id) : undefined;
    const under = above && above.depth < DEPTH ? parent : undefined;
    const place = placeOf(above, under !== undefined, () =>
      n % UNPLACED_EVERY === 0 ? null : from.projectId
    );
    trees += place.depth === 0 ? 1 : 0;
    placed.set(id, place);
    const path = join(dirname(from.file), `${sessionId}.jsonl`);
    writeConversation(
      path,
      n === longAt
        ? { long: true, cwd: fleet.workdir, sessionId }
        : {
            long: false,
            text: conversation.replaceAll(from.sessionId, sessionId),
          }
    );
    utimesSync(path, moved / 1000, moved / 1000);
    rows.push({
      id,
      overrides: {
        session_id: sessionId,
        title: titleOf(n, n === longAt, under !== undefined),
        status,
        parent_instance_id: under?.id ?? null,
        project_id: place.projectId,
        last_error: status === "error" ? "Probe: the session failed." : null,
        created_at: created,
        updated_at: moved,
        turn_ended_at: moved,
        // The newest few ended after the owner last looked; the rest were seen.
        seen_at: n >= count - UNSEEN ? null : moved + 1000,
        spawned_at: created,
        turn_open_at: null,
      },
    });
  }
  seedRows(fleet.env.CAWCO_DB_PATH ?? "", from.template, rows);
  return { long: rows[longAt]?.id ?? "", trees, unseen: UNSEEN };
}

/** A seeded row's conversation: the template's, or the long one ({@link LONG_MB}). */
function writeConversation(
  path: string,
  as:
    | { cwd: string; long: true; sessionId: string }
    | { long: false; text: string }
): void {
  if (as.long) {
    writeClaudeTranscript(path, {
      bytes: LONG_MB * 1024 * 1024,
      compactEvery: 400,
      cwd: as.cwd,
      seed: 23,
      sessionId: as.sessionId,
    });
  } else {
    writeFileSync(path, as.text);
  }
}

/** A seeded row's title: the long session's, a delegate's or a session's. */
const titleOf = (n: number, long: boolean, delegate: boolean): string => {
  if (long) {
    return "Orchestrator";
  }
  return `${delegate ? "Delegate" : "Session"} ${n}`;
};

/** Where a row stands: under the row `above` it, a level deeper in its tree's project, or at a tree's top. */
const placeOf = (
  above: { depth: number; projectId: string | null } | undefined,
  under: boolean,
  topProject: () => string | null
): { depth: number; projectId: string | null } =>
  under && above
    ? { depth: above.depth + 1, projectId: above.projectId }
    : { depth: 0, projectId: topProject() };

/** The `n`th seeded row's status: the first `sleeping` asleep, then `STOPPED` stopped, the rest failed. */
const statusOf = (n: number, sleeping: number): string => {
  if (n < sleeping) {
    return "sleeping";
  }
  return n < sleeping + STOPPED ? "stopped" : "error";
};

export interface ScaleFleet {
  /** The built dashboard against the fleet's hub. */
  base: string;
  /** The live sessions: streaming, then turn-taking. */
  live: string[];
  /** A session asleep on a long conversation ({@link LONG_MB}): the one a cold load opens. */
  long: string;
  /** A session asleep with a conversation: the one left open at rest. */
  quiet: string;
  /** Ends the turns it sends. */
  stop: () => void;
}

/**
 * A scratch fleet at the live board's size (`rows`, `sleeping` of them
 * asleep), its live sessions running, and the dashboard served against it.
 */
export async function scaleFleet(
  kit: Kit,
  rows = LIVE_ROWS,
  sleeping = LIVE_ASLEEP
): Promise<ScaleFleet> {
  const fleet = await kit.fleet(scaleRespond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Scale",
    machineId: MACHINE,
    cwd: fleet.workdir,
  });
  for (let n = 0; n < TASKS; n += 1) {
    await fleet.api(`/api/projects/${project.id}/tasks`, {
      title: `Task ${n}: ${wordsOf(6, "probe").join("").trim()}`,
      labels: [`area-${n % 7}`, ...(n % 3 === 0 ? ["bug"] : [])],
      description: wordsOf(80, "description").join(""),
      acceptance: wordsOf(30, "acceptance").join(""),
      todos: [0, 1, 2].map((todo) => `To-do ${todo} of task ${n}`),
    });
  }
  const template = await answered(fleet, "Template", project.id);
  await asleep(fleet, template);
  const [row] = fleet.query<{ session_id: string }>(
    "SELECT session_id FROM instances WHERE id = ?",
    template
  );
  const file = row ? conversationFile(fleet.home, row.session_id) : undefined;
  if (!(row && file)) {
    throw new Error(
      `the template's conversation is not on disk under ${fleet.home}`
    );
  }
  await fleet.stop("agent");
  await fleet.stop("hub");
  const live = STREAMS + TURNS;
  const seeded = seedBoard(
    fleet,
    { file, projectId: project.id, sessionId: row.session_id, template },
    rows - 1 - live,
    sleeping - 1
  );
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.launch("agent");
  await fleet.agentUp();
  const ids: string[] = [];
  for (let n = 0; n < STREAMS; n += 1) {
    const id = await fleet.spawn("claude", `Stream ${n}`, fleet.workdir, {
      projectId: project.id,
    });
    await fleet.send(id, `${STREAM_TAG} ${n}: go.`);
    ids.push(id);
  }
  const turners: string[] = [];
  for (let n = 0; n < TURNS; n += 1) {
    turners.push(
      await fleet.spawn("claude", `Turns ${n}`, fleet.workdir, {
        projectId: project.id,
      })
    );
  }
  ids.push(...turners);
  let on = true;
  const turns = (async () => {
    let n = 0;
    while (on) {
      for (const id of turners) {
        n += 1;
        await fleet.send(id, `${TURN_TAG} ${n}: one step.`).catch(() => "");
        await Bun.sleep(TURN_EVERY_MS / turners.length);
        if (!on) {
          break;
        }
      }
    }
  })();
  const board = fleet.query<{ status: string; n: number }>(
    "SELECT status, count(*) AS n FROM instances GROUP BY status"
  );
  kit.note(
    `scale fleet: ${board.map((one) => `${one.n} ${one.status}`).join(", ")}; ${seeded.trees} trees seeded, ${seeded.unseen} ended unseen, one on a ${LONG_MB} MB conversation; ${TASKS} tasks on the project's board; ${STREAMS} sessions streaming, ${TURNS} taking a turn every ${TURN_EVERY_MS / 1000}s`
  );
  return {
    base: await fleet.dashboard(),
    live: ids,
    long: seeded.long,
    quiet: template,
    stop: () => {
      on = false;
      turns.catch(() => undefined);
    },
  };
}

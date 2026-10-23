/**
 * Nothing the hub or agent does on its own wakes a session that was not
 * live (hub server.ts `startsTurnIn`, `WAKES_AT_REST`; the register's
 * restore of a cut turn only). 2026-10-23, obelisk: 157 sessions from
 * September resumed at once (240 Claude Code processes, 157 GB of 188 GB,
 * load 394), each woken by the hub's own word: a browser take-over's notice
 * to every sleeping session of the machine, a rule's reply, a leak notice,
 * a pause's carry-on; and every row marked running after a reboot restored
 * whatever it had been doing.
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), with no workspace: it runs inside one. Two live sessions (L1,
 * L2) and, seeded while the hub and agent are down, 30 sleeping sessions
 * from September and 5 rows marked `running`, last moved a minute ago, whose
 * process is gone and whose turn was over: 35 at rest, each with a
 * conversation on disk, so any wake would start its process. From then on,
 * sessiond's processes are read every 400 ms.
 *
 * - (r1) The hub and agent start on those rows, then each restarts again:
 *   the 5 stale rows end `sleeping`.
 * - (w1) One of the September sessions is a delegate of L1's whose work
 *   item is still open: the work-item sweep holds the item (blocked, not
 *   failed), tells you in Needs you, and never wakes its session.
 * - (w2) Last, the hub restarts with that item held: its hold and notice
 *   stand (a stored row), and its parent's word then ends the hold and
 *   takes the notice down.
 * - (n1) The hub's own words reach each of the 35 as their senders send
 *   them (a browser take-over's notice, a rule's reply, a leak notice, a
 *   pause's carry-on, a containers notice): each is kept at the hub, owed.
 * - (b1) The person's presence goes active, inactive and away.
 * - (p1) A pause of the machine for a minute cuts L1's turn; once it ends
 *   L1 reads the carry-on (the owed notices of the 35 are released then
 *   too, and stay kept).
 * - (u1) A rule fires on L2's reply, and L2 reads its reply.
 * - (k1) A third session K leaves a process behind; the agent finds it while
 *   the hub is held, and K's process is killed between turns from outside
 *   (as the owner killed the old sessions' processes by pid). The leak
 *   notice reaches K asleep, is kept, and K's process is not started for it.
 *   (k2) The person's own message then wakes K, and what it was kept goes
 *   with it.
 * - (z1) Through all of it none of the 35 had a process, (z2) none was
 *   launched again (`spawned_at`), (z3) none took a turn, while (z4) L1 and
 *   L2 each did.
 *
 * On main, (r1)'s register restores the 5 stale rows (their updates within
 * the restore horizon) and (n1)'s words wake every one of the 35.
 *
 *   bun scripts/probe-kit/run.ts no-wake-at-rest
 */
// biome-ignore-all lint/performance/noAwaitInLoops: the fleet's steps happen one after another
import { Database } from "bun:sqlite";
import { readdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseProcId } from "../../../packages/agent/src/proc-id";
import { SHIELD_WORDS } from "../../../packages/core/src/browser";
import { commandLines } from "../../../packages/core/src/process-identity";
import {
  listedPid,
  signal as signalPid,
} from "../../../packages/core/src/signal";
import { leakWords } from "../../../packages/core/src/words/leaks";
import { workWords } from "../../../packages/core/src/words/work";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

/** Sessions seeded asleep, and seeded `running` with no process. */
const ASLEEP = 30;
const STALE = 5;
/** When the September sessions last moved. */
const SEPTEMBER = Date.parse("2026-09-15T10:00:00Z");
/** How long the machine is paused. */
const PAUSE_MS = 60_000;
/** How long the agent is given to find a leftover: its 10 s grace, two looks of 10 s, and room (agent leak-watch.ts). */
const LEAK_FOUND_MS = 40_000;
/** How often sessiond's processes are read. */
const SAMPLE_MS = 400;

const SLOW_TAG = "PROBE-SLOW-TURN";
const RULE_TAG = "PROBE-RULE-ASK";
const RULE_WORD = "PROBE-RULE-WORD";
const RULE_REPLY = "Probe rule reply: carry on.";
const LEFT_TAG = "PROBE-LEAVE";
const WAKE_TAG = "PROBE-WAKE-K";
const LEFTOVER = "600.0952";
const LEAVE = `setsid sleep ${LEFTOVER} < /dev/null > /dev/null 2>&1 & sleep 15; echo LEFT-DONE`;
const PAUSED = "Your machine was paused until";
/** The September delegate's open item ({@link seedOpenItem}). */
const ITEM_TITLE = "September delegate";

/** The hub's own words, as each sender sends them (server.ts `tellSession`, rules.ts `#fire`, `pauseBegan`, `tellContainers`). */
const NOTICES: { name: string; quiet?: true; words: string }[] = [
  { name: "browser", quiet: true, words: SHIELD_WORDS },
  {
    name: "rule:Leaves a known problem unfixed",
    words: "[cawco:rule name=Leaves a known problem unfixed] Fix it now.",
  },
  {
    name: "leak",
    words: `A process this session started is ${leakWords.leftBehind} it ended.`,
  },
  {
    name: "machine-pause",
    words: `${PAUSED} 20:53, which stopped your turn. The pause is over: carry on from where you stopped.`,
  },
  { name: "containers", words: "The containers this session started stopped." },
];

const ran = { slow: false, rule: false, left: false };
const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (request.afterTool) {
    return text("Done.");
  }
  if (request.last.includes(SLOW_TAG) && !ran.slow) {
    ran.slow = true;
    // Two minutes of words: the pause finds it under way.
    return { everyMs: 2000, words: Array.from({ length: 60 }, () => "step ") };
  }
  if (request.last.includes(RULE_TAG) && !ran.rule) {
    ran.rule = true;
    return text(`${RULE_WORD} said.`);
  }
  if (request.last.includes(LEFT_TAG) && !ran.left) {
    ran.left = true;
    return {
      everyMs: 5,
      words: [],
      tool: {
        name: "Bash",
        input: {
          command: LEAVE,
          description: "Leave a process behind",
          timeout: 60_000,
        },
      },
    };
  }
  return text("ok");
};

/** A session at rest: its turn answered and closed. */
const answered = async (fleet: KitFleet, title: string) => {
  const id = await fleet.spawn("claude", title);
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
};

/** Asks `id` to sleep (again every 15 s: a machine refuses one not at rest) until its row reads sleeping. */
const asleep = (fleet: KitFleet, id: string) => {
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
  ).catch(() => fleet.instance(id)?.status);
};

/** The file Claude Code keeps conversation `sessionId` in, under `home`. */
const conversationFile = (home: string, sessionId: string) => {
  const name = `${sessionId}.jsonl`;
  const found = (readdirSync(home, { recursive: true }) as string[]).find(
    (path) => path.endsWith(`/${name}`)
  );
  return found ? join(home, found) : undefined;
};

interface Column {
  name: string;
}

/**
 * Copies of row `templateId` in `instances`, each a session of its own with
 * its own conversation (`sessionIds`), as `overrides` says.
 */
const seedRows = (
  path: string,
  templateId: string,
  rows: { id: string; overrides: Record<string, number | string | null> }[]
) => {
  const db = new Database(path);
  try {
    const names = (
      db.query("PRAGMA table_info(instances)").all() as Column[]
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
};

/** Each session's completed turns, by id. */
const turnsOf = (fleet: KitFleet, ids: readonly string[]) => {
  const counts = new Map(ids.map((id) => [id, 0]));
  for (const row of fleet.query<{ instance_id: string; n: number }>(
    "SELECT instance_id, count(*) AS n FROM completed_turns GROUP BY instance_id"
  )) {
    if (counts.has(row.instance_id)) {
      counts.set(row.instance_id, row.n);
    }
  }
  return counts;
};

/** A send to `id` from the hub's own `name`, as a dashboard socket carries any sender's: its uuid. */
const notice = async (
  fleet: KitFleet,
  id: string,
  said: (typeof NOTICES)[number]
) => {
  const uuid = crypto.randomUUID();
  await fleet.post({
    type: "command",
    commandId: crypto.randomUUID(),
    kind: "send",
    machineId: MACHINE,
    sessionId: id,
    payload: {
      instanceId: id,
      message: {
        type: "user",
        uuid,
        message: { role: "user", content: said.words },
        parent_tool_use_id: null,
        origin: { kind: "system", name: said.name },
        ...(said.quiet ? { shouldQuery: false } : {}),
      },
    },
  });
  return uuid;
};

const pidsOf = async (start: string): Promise<number[]> =>
  (await commandLines())
    .filter((line) => line.command.startsWith(start))
    .map((line) => line.pid);

/** What every leg reads: the fleet, its sessions, and what sessiond held. */
interface Run {
  check: Kit["check"];
  fleet: KitFleet;
  /** Readings of sessiond in which each session had a process, by id. */
  hadProcess: Map<string, number>;
  kit: Kit;
  l1: string;
  l2: string;
  /** The 35 at rest: the template and the rows seeded beside it. */
  rest: string[];
  seeded: { id: string; spawnedAt: number; stale: boolean }[];
  /** The hub's own words sent to the 35 ({@link noticeLeg}). */
  sent: { id: string; name: string; uuid: string }[];
}

/** The sessions at rest that had a process in any reading. */
const restProcesses = (run: Run) =>
  run.rest.filter((id) => run.hadProcess.has(id));
const processWords = (run: Run) => restProcesses(run).join(", ") || "none";

/** The words sent to the 35 that are no longer kept at the hub, owed. */
const released = (run: Run) =>
  run.sent.filter((one) => {
    const row = run.fleet.sendRow(one.uuid);
    return !(row?.state === "pending" && row.owed);
  });

/** Every process sessiond holds, by session, every {@link SAMPLE_MS} until `stop`. */
const sampleProcesses = (fleet: KitFleet, into: Map<string, number>) => {
  const state: { on: boolean; samples: number } = { on: true, samples: 0 };
  const done = (async () => {
    while (state.on) {
      const procs = await fleet.heldProcs().catch(() => []);
      state.samples += 1;
      for (const proc of procs) {
        const id = parseProcId(proc.procId);
        if (id.kind === "claude" || id.kind === "pi") {
          into.set(id.instanceId, (into.get(id.instanceId) ?? 0) + 1);
        }
      }
      await Bun.sleep(SAMPLE_MS);
    }
  })();
  return {
    samples: () => state.samples,
    stop: async () => {
      state.on = false;
      await done;
    },
  };
};

/** Two live sessions and a template put to sleep; the template's conversation file. */
const liveAndTemplate = async (kit: Kit, fleet: KitFleet) => {
  const template = await answered(fleet, "September template");
  const l1 = await answered(fleet, "Live one");
  const l2 = await answered(fleet, "Live two");
  const slept = await asleep(fleet, template);
  const gone = await until(
    "the template's process gone",
    async () => ((await fleet.sessionPid(template)) ? undefined : true),
    Boolean,
    60_000
  ).catch(() => false);
  kit.check(
    "seed: the template session is asleep, its process gone",
    slept === "sleeping" && gone === true,
    JSON.stringify(fleet.instance(template))
  );
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
  return { template, l1, l2, file, sessionId: row.session_id };
};

/** With the hub and agent down: the template's row and conversation copied into 30 asleep and 5 stale. */
const seedRest = (
  kit: Kit,
  fleet: KitFleet,
  from: { file: string; sessionId: string; template: string }
) => {
  const now = Date.now();
  const seeded: Run["seeded"] = [];
  const rows: Parameters<typeof seedRows>[2] = [];
  const conversation = readFileSync(from.file, "utf8");
  for (let n = 0; n < ASLEEP - 1 + STALE; n += 1) {
    const id = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const stale = n >= ASLEEP - 1;
    const spawnedAt = stale ? now - 10 * 60_000 : SEPTEMBER;
    const path = join(dirname(from.file), `${sessionId}.jsonl`);
    writeFileSync(path, conversation.replaceAll(from.sessionId, sessionId));
    // When it last moved, as the register reads it from the file (db
    // `dateStoredSessions`): September, or a minute ago for a stale row.
    const moved = (stale ? now - 60_000 : SEPTEMBER) / 1000;
    utimesSync(path, moved, moved);
    seeded.push({ id, stale, spawnedAt });
    rows.push({
      id,
      overrides: {
        session_id: sessionId,
        title: `${stale ? "stale running" : "September asleep"} ${n}`,
        status: stale ? "running" : "sleeping",
        // A stale row moved a minute ago, inside the restore's horizon: as
        // obelisk's September rows had, woken that evening.
        updated_at: stale ? now - 60_000 : SEPTEMBER,
        // Its last turn ended when it last moved, not as the template's did.
        turn_ended_at: stale ? now - 60_000 : SEPTEMBER,
        created_at: SEPTEMBER,
        spawned_at: spawnedAt,
        turn_open_at: null,
      },
    });
  }
  seedRows(fleet.env.CAWCO_DB_PATH ?? "", from.template, rows);
  kit.note(
    `seeded ${ASLEEP - 1} September sessions asleep beside the template and ${STALE} rows marked running with no process, each with a conversation in ${dirname(from.file)}`
  );
  return seeded;
};

/**
 * The first September session made a delegate of L1's with its work item
 * still open, in a workspace of the fleet's repository: as obelisk's
 * September items stood. Its item's id.
 */
const seedOpenItem = (
  fleet: KitFleet,
  sessionId: string,
  parentId: string
): string => {
  const workspace = crypto.randomUUID();
  const item = crypto.randomUUID();
  const db = new Database(fleet.env.CAWCO_DB_PATH ?? "");
  try {
    db.query(
      "INSERT INTO workspaces (id, machine_id, repo_root, path, branch, state, created_by_instance_id, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)"
    ).run(
      workspace,
      MACHINE,
      fleet.repo,
      fleet.repo,
      "probe-september",
      parentId,
      SEPTEMBER
    );
    db.query(
      "INSERT INTO work_items (id, workspace_id, parent_instance_id, instance_id, brief, title, harness, state, created_at) VALUES (?, ?, ?, ?, ?, ?, 'claude', 'running', ?)"
    ).run(
      item,
      workspace,
      parentId,
      sessionId,
      "Carry on with the September work.",
      ITEM_TITLE,
      SEPTEMBER
    );
    db.query(
      "UPDATE instances SET work_item_id = ?, parent_instance_id = ? WHERE id = ?"
    ).run(item, parentId, sessionId);
  } finally {
    db.close();
  }
  return item;
};

/**
 * (w1) The work-item sweep finds the September delegate asleep with its item
 * open: past a day asleep, the item is held and you are told, and its
 * session is not woken (work-items.ts `blockAsleep`).
 */
const asleepItemLeg = async (run: Run, sessionId: string, item: string) => {
  const { fleet } = run;
  const held = await until(
    "the September item held",
    () =>
      fleet.query<{ held_at: number | null; state: string }>(
        "SELECT held_at, state FROM work_items WHERE id = ?",
        item
      )[0],
    (row) => row.held_at !== null,
    // Two sweeps of 30 s and room.
    90_000
  ).catch(
    () =>
      fleet.query<{ held_at: number | null; state: string }>(
        "SELECT held_at, state FROM work_items WHERE id = ?",
        item
      )[0]
  );
  const [told] = fleet.query<{ body: string; title: string }>(
    "SELECT title, body FROM fleet_watch_notices WHERE instance_id = ?",
    sessionId
  );
  await Bun.sleep(35_000);
  const [after] = fleet.query<{ held_at: number | null; state: string }>(
    "SELECT held_at, state FROM work_items WHERE id = ?",
    item
  );
  run.check(
    "w1: a September delegate's open item, its session asleep past a day, is held (still running, not failed) with a notice in Needs you naming why, and its session is not woken by the next sweeps",
    held?.held_at !== null &&
      after?.state === "running" &&
      after.held_at !== null &&
      told?.title === workWords.heldAsleepTitle(ITEM_TITLE) &&
      told.body ===
        workWords.heldAsleep("2026-09-15 10:00 UTC", workWords.aDay) &&
      !run.hadProcess.has(sessionId),
    `item: ${JSON.stringify(held)} → ${JSON.stringify(after)}; notice: ${JSON.stringify(told ?? null)}; its session had a process: ${run.hadProcess.has(sessionId)}`
  );
};

/** The September item's hold and its notice, as the hub stores them. */
const holdOf = (fleet: KitFleet, item: string, sessionId: string) => {
  const [row] = fleet.query<{
    held_asleep_at: number | null;
    held_at: number | null;
    state: string;
  }>(
    "SELECT held_at, held_asleep_at, state FROM work_items WHERE id = ?",
    item
  );
  const [told] = fleet.query<{ title: string }>(
    "SELECT title FROM fleet_watch_notices WHERE instance_id = ?",
    sessionId
  );
  return { ...row, notice: told?.title ?? null };
};

/**
 * (w2) The held September item across a hub restart: its hold is a stored
 * row (`held_asleep_at`), so after the restart its parent's word ends the
 * hold and takes its notice down.
 */
const heldAcrossRestartLeg = async (
  run: Run,
  sessionId: string,
  item: string
) => {
  const { fleet } = run;
  const before = holdOf(fleet, item, sessionId);
  await fleet.stop("hub");
  fleet.launch("hub");
  await fleet.hubUp();
  await fleet.agentUp();
  const restarted = holdOf(fleet, item, sessionId);
  // The parent's word, as its handoff carries it.
  await fleet.post({
    type: "command",
    commandId: crypto.randomUUID(),
    kind: "send",
    machineId: MACHINE,
    sessionId,
    payload: {
      instanceId: sessionId,
      message: {
        type: "user",
        uuid: crypto.randomUUID(),
        message: { role: "user", content: "Carry the September work on." },
        parent_tool_use_id: null,
        origin: { kind: "peer", fromSession: run.l1 },
      },
    },
  });
  const after = await until(
    "the parent's word ends the hold",
    () => holdOf(fleet, item, sessionId),
    (hold) => hold.held_at === null && hold.notice === null,
    30_000
  ).catch(() => holdOf(fleet, item, sessionId));
  run.check(
    "w2: held across a hub restart, the September item's hold and notice stand; after the restart its parent's word ends the hold and takes the notice down",
    before.held_asleep_at !== null &&
      before.notice !== null &&
      restarted.held_asleep_at !== null &&
      restarted.notice !== null &&
      after.held_at === null &&
      after.held_asleep_at === null &&
      after.notice === null,
    `before the restart: ${JSON.stringify(before)}; after it: ${JSON.stringify(restarted)}; after the parent's word: ${JSON.stringify(after)}`
  );
};

/** (r1) The hub and agent start on the seeded rows, then each restarts again. */
const restartLeg = async (run: Run) => {
  const { fleet } = run;
  const staleIds = run.seeded.filter((one) => one.stale).map((one) => one.id);
  const statuses = () =>
    staleIds.map((id) => fleet.instance(id)?.status ?? "gone").join(",");
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.launch("agent");
  await fleet.agentUp();
  const first = await until(
    "the stale rows settled",
    statuses,
    (read) => read.split(",").every((one) => one === "sleeping"),
    90_000
  ).catch(statuses);
  await fleet.stop("hub");
  fleet.launch("hub");
  await fleet.hubUp();
  await fleet.stop("agent");
  fleet.launch("agent");
  await fleet.agentUp();
  await Bun.sleep(20_000);
  const now = statuses();
  const started = staleIds.filter((id) => run.hadProcess.has(id));
  run.check(
    `r1: after the hub and agent start on them and restart again, the ${STALE} rows marked running with no process are settled asleep, never started`,
    now.split(",").every((one) => one === "sleeping") && started.length === 0,
    `after the first start: ${first}; now: ${now}; with a process: ${started.join(", ") || "none"}`
  );
};

/** (n1) The hub's own words to each of the 35, as their senders send them. */
const noticeLeg = async (run: Run) => {
  for (const [n, id] of run.rest.entries()) {
    const said = NOTICES[n % NOTICES.length] as (typeof NOTICES)[number];
    run.sent.push({
      id,
      name: said.name,
      uuid: await notice(run.fleet, id, said),
    });
  }
  await Bun.sleep(15_000);
  const out = released(run);
  run.check(
    `n1: the hub's own words (${NOTICES.map((one) => one.name).join(", ")}) to the ${run.rest.length} sessions at rest are each kept at the hub, owed, and start none`,
    out.length === 0 && restProcesses(run).length === 0,
    `not kept: ${
      out
        .map(
          (one) =>
            `${one.id.slice(0, 8)} ${one.name} ${JSON.stringify(run.fleet.sendRow(one.uuid))}`
        )
        .join("; ") || "none"
    }; with a process: ${processWords(run)}`
  );
};

/** (b1) The person's presence, toggled. */
const presenceLeg = async (run: Run) => {
  const clientId = crypto.randomUUID();
  const presence = (active: boolean, machine: string) =>
    run.fleet
      .api("/api/presence", {
        clientId,
        client: "web",
        sessionId: active ? run.l1 : null,
        active,
        machine,
        saidAt: Date.now(),
      })
      .then(
        () => "ok",
        (error: unknown) => String(error)
      );
  const toggles = [
    await presence(true, "active"),
    await presence(false, "idle"),
    await presence(false, "locked"),
    await presence(true, "active"),
  ];
  await Bun.sleep(5000);
  run.check(
    "b1: the person's presence goes active, idle, locked and active again, and no session at rest starts",
    toggles.every((one) => one === "ok") && restProcesses(run).length === 0,
    `${toggles.join(", ")}; with a process: ${processWords(run)}`
  );
};

/** (p1) A minute's pause cuts L1's turn; at its end L1 carries on. */
const pauseLeg = async (run: Run) => {
  const { fleet } = run;
  const slowSent = Date.now();
  await fleet.send(run.l1, `${SLOW_TAG}: take your time.`);
  await until(
    "L1's slow turn under way",
    () =>
      fleet.seen.some(
        (one) => one.at >= slowSent && one.last.includes(SLOW_TAG)
      ) && fleet.instance(run.l1)?.turn_open_at
        ? true
        : undefined,
    Boolean,
    120_000
  );
  await Bun.sleep(3000);
  const pausedAt = Date.now();
  const paused = await fleet
    .api<{ pausedUntil?: number }>(
      `/api/machines/${encodeURIComponent(MACHINE)}/pause`,
      { until: new Date(pausedAt + PAUSE_MS).toISOString() }
    )
    .catch((error: unknown) => ({ error: String(error) }));
  const carriedOn = await until(
    "L1 reads the pause's carry-on",
    () =>
      fleet.seen.find(
        (one) =>
          one.at >= pausedAt + PAUSE_MS - 1000 &&
          one.tools &&
          one.last.includes(PAUSED)
      ),
    Boolean,
    PAUSE_MS + 90_000
  ).catch(() => undefined);
  await Bun.sleep(10_000);
  const out = released(run);
  const at = carriedOn
    ? `+${Math.round((carriedOn.at - pausedAt) / 1000)} s`
    : "never";
  run.check(
    "p1: a minute's pause cuts L1's turn, and once it ends L1 reads its carry-on; the words kept for the sessions at rest stay kept, and none starts",
    !!carriedOn && out.length === 0 && restProcesses(run).length === 0,
    `pause: ${JSON.stringify(paused)}; carry-on read: ${at}; released from keeping: ${out.map((one) => `${one.id.slice(0, 8)} ${one.name}`).join(", ") || "none"}; with a process: ${processWords(run)}`
  );
};

/** (u1) A rule fires on L2's reply. */
const ruleLeg = async (run: Run) => {
  const { fleet } = run;
  const rule = await fleet
    .api<{ id: string }>("/api/rules", {
      name: "Probe nudge",
      enabled: true,
      matchKind: "phrase",
      pattern: RULE_WORD,
      caseSensitive: false,
      wholeWord: false,
      repeat: false,
      reply: RULE_REPLY,
      scope: {},
      timing: "turn",
      watch: "text",
    })
    .catch((error: unknown) => ({ error: String(error) }));
  const ruleSent = Date.now();
  await fleet.send(run.l2, `${RULE_TAG}: say the word.`);
  const nudged = await until(
    "L2 reads the rule's reply",
    () =>
      fleet.seen.find(
        (one) =>
          one.at >= ruleSent && one.tools && one.last.includes(RULE_REPLY)
      ),
    Boolean,
    120_000
  ).catch(() => undefined);
  await Bun.sleep(5000);
  run.check(
    "u1: a rule fires on L2's reply and L2 reads its reply; no session at rest starts",
    !!nudged && restProcesses(run).length === 0,
    `rule: ${JSON.stringify(rule)}; read: ${nudged ? "yes" : "never"}; with a process: ${processWords(run)}`
  );
};

/** The leak notice to `k` on record, if any. */
const leakSendTo = (fleet: KitFleet, k: string) => {
  const [row] = fleet.query<{
    owed: string | null;
    state: string;
    uuid: string;
  }>(
    "SELECT uuid, state, owed FROM sent_messages WHERE instance_id = ? AND json_extract(body, '$.origin.name') = 'leak'",
    k
  );
  return row;
};

/** (k1) A leak notice to K, put to sleep; (k2) the person's word wakes it. */
const leakLeg = async (run: Run) => {
  const { fleet, hadProcess } = run;
  const k = await answered(fleet, "Leaver");
  const leaveSent = Date.now();
  await fleet.send(k, `${LEFT_TAG}: leave a process behind.`);
  await until(
    "K's leaving turn over",
    () =>
      fleet.seen.some(
        (one) =>
          one.at >= leaveSent && one.afterTool && one.body.includes("LEFT-DONE")
      ) && fleet.instance(k)?.turn_open_at === null
        ? true
        : undefined,
    Boolean,
    120_000
  ).catch(() => undefined);
  // The agent finds the leftover while K's process lives (it reads only a
  // live keeper child); the hub, held, reads its word only once that process
  // is gone: killed from outside between turns, as the owner killed the old
  // sessions' processes by pid.
  fleet.freeze("hub", true);
  await Bun.sleep(LEAK_FOUND_MS);
  const pid = await fleet.sessionPid(k);
  if (pid !== undefined) {
    signalPid(pid, "SIGKILL");
  }
  const kGone = await until(
    "K's process gone",
    async () => ((await fleet.sessionPid(k)) ? undefined : true),
    Boolean,
    30_000
  ).catch(() => false);
  // From here K has no process unless something starts one.
  hadProcess.delete(k);
  fleet.freeze("hub", false);
  const leak = await until(
    "the leak notice to K",
    () => leakSendTo(fleet, k),
    Boolean,
    120_000
  ).catch(() => undefined);
  const kAsleep = await until(
    "K filed asleep",
    () => fleet.instance(k)?.status,
    (status) => status === "sleeping",
    60_000
  ).catch(() => fleet.instance(k)?.status);
  await Bun.sleep(20_000);
  const kept = leakSendTo(fleet, k);
  run.check(
    "k1: K leaves a process behind and its process is killed between turns; the leak notice reaches it asleep, kept, and K's process is not started for it",
    kAsleep === "sleeping" &&
      kGone === true &&
      kept?.state === "pending" &&
      !!kept.owed &&
      !hadProcess.has(k),
    `K: ${kAsleep}, process gone: ${kGone}; leak notice as found: ${JSON.stringify(leak ?? null)}, now: ${JSON.stringify(kept ?? null)}; K had a process since: ${hadProcess.has(k)}`
  );

  const wakeSent = Date.now();
  await fleet.send(k, `${WAKE_TAG}: are you there?`);
  const woke = await until(
    "K's turn on the person's word",
    () =>
      fleet.seen.find(
        (one) => one.at >= wakeSent && one.tools && one.all.includes(WAKE_TAG)
      ),
    Boolean,
    180_000
  ).catch(() => undefined);
  const carried = woke?.all.includes(leakWords.leftBehind) ?? false;
  run.check(
    "k2: the person's message wakes K, and the leak notice it was kept reaches its model with it",
    !!woke && hadProcess.has(k) && !!kept && carried,
    `K's turn: ${woke ? "read" : "never"}; K had a process: ${hadProcess.has(k)}; the notice in it: ${carried}`
  );
};

/** (z) What the whole run did to the 35, and to L1 and L2. */
const wholeRun = (run: Run, samples: number, before: Map<string, number>) => {
  const { fleet, rest } = run;
  const after = turnsOf(fleet, [...rest, run.l1, run.l2]);
  const relaunched = run.seeded.filter(
    (one) =>
      fleet.query<{ spawned_at: number | null }>(
        "SELECT spawned_at FROM instances WHERE id = ?",
        one.id
      )[0]?.spawned_at !== one.spawnedAt
  );
  const turned = rest.filter(
    (id) => (after.get(id) ?? 0) > (before.get(id) ?? 0)
  );
  run.check(
    `z1: none of the ${rest.length} sessions at rest had a process in any of ${samples} readings of sessiond`,
    restProcesses(run).length === 0,
    restProcesses(run)
      .map((id) => `${id.slice(0, 8)} in ${run.hadProcess.get(id)} readings`)
      .join(", ") || "none"
  );
  run.check(
    `z2: none of the ${run.seeded.length} seeded rows was launched again`,
    relaunched.length === 0,
    relaunched.map((one) => one.id.slice(0, 8)).join(", ") || "none"
  );
  run.check(
    `z3: none of the ${rest.length} sessions at rest took a turn`,
    turned.length === 0,
    turned.map((id) => id.slice(0, 8)).join(", ") || "none"
  );
  run.check(
    "z4: L1 and L2, live, each took turns",
    (after.get(run.l1) ?? 0) > (before.get(run.l1) ?? 0) &&
      (after.get(run.l2) ?? 0) > (before.get(run.l2) ?? 0),
    `L1 ${before.get(run.l1)} → ${after.get(run.l1)}, L2 ${before.get(run.l2)} → ${after.get(run.l2)} completed turns`
  );
};

async function runSpec(kit: Kit): Promise<void> {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  const live = await liveAndTemplate(kit, fleet);
  await fleet.stop("agent");
  await fleet.stop("hub");
  const seeded = seedRest(kit, fleet, live);
  const delegate = (seeded[0] as Run["seeded"][number]).id;
  const item = seedOpenItem(fleet, delegate, live.l1);
  const hadProcess = new Map<string, number>();
  const sampler = sampleProcesses(fleet, hadProcess);
  const state: Run = {
    check: kit.check,
    fleet,
    hadProcess,
    kit,
    l1: live.l1,
    l2: live.l2,
    rest: [live.template, ...seeded.map((one) => one.id)],
    sent: [],
    seeded,
  };
  try {
    await restartLeg(state);
    await asleepItemLeg(state, delegate, item);
    const before = turnsOf(fleet, [...state.rest, state.l1, state.l2]);
    await noticeLeg(state);
    await presenceLeg(state);
    await pauseLeg(state);
    await ruleLeg(state);
    await leakLeg(state);
    await sampler.stop();
    wholeRun(state, sampler.samples(), before);
    // Last: the parent's word wakes the delegate, which ends the 35's quiet.
    await heldAcrossRestartLeg(state, delegate, item);
  } finally {
    await sampler.stop();
    for (const pid of await pidsOf(`sleep ${LEFTOVER}`)) {
      signalPid(listedPid(pid), "SIGKILL");
    }
  }
}

export default { name: "no-wake-at-rest", run: runSpec } satisfies Spec;

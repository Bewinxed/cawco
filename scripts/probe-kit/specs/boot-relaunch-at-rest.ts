/**
 * A machine's boot starts only what was working when it went down (hub
 * server.ts: the register's restore of a cut turn; an account move's
 * relaunch only of a process that works, `processWorks`; the hub's own
 * launches one at a time, `paceSpawn`). 2026-10-23 20:16:32 on obelisk, 19 s
 * after the agent and hub started: 19 sessions from early September each
 * logged "[hub] … relaunches on …, its conversation resumed" in one second,
 * about 240 Claude Code processes, load around 143.
 *
 * On a scratch fleet (real hub, agent and sessiond; the real Claude Code CLI
 * against the mock model) with two Claude accounts signed in on its machine:
 *
 * - Three live sessions (M1–M3) are each inside a long turn when the machine
 *   goes down at once (hub, agent and sessiond killed, as a reboot does).
 * - Seeded while it is down, beside a September template put to sleep:
 *   sessions at rest since September, each with its conversation on disk,
 *   each with a state a boot path reads. Nothing more (plain); a move owed
 *   to the second account (owed); a relaunch owed by a model change
 *   (relaunch), three of each, one of each three filed `running` as a row
 *   the hub never heard end is; and three as obelisk's stood: woken earlier
 *   that day, filed `running` a minute ago, their turn over, each owing a
 *   move to the second account (woken). M3 owes that move too.
 * - The machine boots (sessiond, hub, agent); sessiond's processes are read
 *   every 200 ms for a minute and a half.
 *
 * - (m1) M1–M3 are relaunched on their conversations and each is handed its
 *   cut turn back; (m2) M3's launch takes its move: its row names the
 *   second account.
 * - (s1) Their processes start one at a time, 1.5 s apart (read within
 *   two samples).
 * - (r1) None of the sessions at rest had a process or was launched
 *   (`spawned_at`), and the hub's log has no "relaunches on" line at all.
 * - (o1) Each move owed by a session at rest is carried all the same.
 * - (w1) A person's message wakes an owed one, and (w2) a plain one.
 *
 *   bun scripts/probe-kit/run.ts boot-relaunch-at-rest
 */
// biome-ignore-all lint/performance/noAwaitInLoops: the fleet's steps happen one after another
import { readFileSync, utimesSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseProcId } from "../../../packages/agent/src/proc-id";
import { CLAUDE_JSON_NAME } from "../../../packages/core/src/claude-dirs";
import { RELAUNCHES_ON } from "../../../packages/core/src/words/relaunch";
import { ACCOUNT, type Seen, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";
import { asleep, conversationFile, seedRows } from "./no-wake-at-rest";

/** The fleet's own account. */
const FIRST = ACCOUNT;
/** A second account signed in on the same machine. */
const SECOND = "acct-boot-other";
const SECOND_TOKEN = "sk-ant-oat01-fake-scratch-fleet-boot-other";

/** When the seeded sessions last moved. */
const SEPTEMBER = Date.parse("2026-09-03T10:00:00Z");
/** A turn asked with this word streams for {@link SLOW_WORDS} × 200 ms: the boot finds it under way. */
const SLOW = "PROBE-SLOW-BOOT";
const SLOW_WORDS = 600;
/** How long the booted machine is watched. */
const WATCH_MS = 90_000;
const SAMPLE_MS = 200;
/** The hub's own launches go this far apart (server.ts `SPAWN_PACE_MS`). */
const PACE_MS = 1500;
const KINDS = ["plain", "owed", "relaunch", "woken"] as const;
type Kind = (typeof KINDS)[number];

const respond = (request: Seen) => {
  if (!request.tools) {
    return { everyMs: 5, words: ["Probe title"] };
  }
  return request.last.includes(SLOW)
    ? {
        everyMs: 200,
        words: Array.from({ length: SLOW_WORDS }, (_, n) => `w${n} `),
      }
    : { everyMs: 5, words: ["ok"] };
};

/** The fleet with both accounts signed in on its machine. */
const standUp = async (kit: Kit): Promise<KitFleet> => {
  const fleet = await kit.fleet(respond);
  const dir = join(fleet.home, ".cawco", "accounts", SECOND, "claude");
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, ".credentials.json"),
    JSON.stringify({
      claudeAiOauth: {
        accessToken: SECOND_TOKEN,
        expiresAt: Date.now() + 365 * 24 * 3_600_000,
        scopes: ["user:inference", "user:profile"],
        subscriptionType: "max",
      },
    })
  );
  await writeFile(
    join(dir, CLAUDE_JSON_NAME),
    JSON.stringify({
      hasCompletedOnboarding: true,
      oauthAccount: {
        emailAddress: "other@scratch-fleet.test",
        organizationName: "Other Org",
        accountUuid: "00000000-0000-4000-8000-000000000071",
        organizationUuid: "00000000-0000-4000-8000-000000000072",
      },
    })
  );
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.write(
    "INSERT OR IGNORE INTO accounts (id, provider, kind, label, hue, \"order\", never_backup, created_at) VALUES (?, 'anthropic', 'subscription', 'Other', 'green', 1, 0, ?)",
    SECOND,
    Date.now()
  );
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  await until(
    `${SECOND} signed in`,
    () =>
      fleet.query<{ state: string }>(
        "SELECT state FROM account_signins WHERE account_id = ?",
        SECOND
      )[0],
    (row) => row?.state === "signed-in",
    120_000
  );
  return fleet;
};

/** A session on the first account, one turn answered and closed. */
const answered = async (fleet: KitFleet, title: string) => {
  const id = await fleet.spawn("claude", title, fleet.repo, { account: FIRST });
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

/** A live session inside its slow turn. */
const midTurn = async (fleet: KitFleet, title: string) => {
  const id = await answered(fleet, title);
  const sent = Date.now();
  await fleet.send(id, `${SLOW}: talk at length.`);
  await until(
    `${title} inside its slow turn`,
    () =>
      fleet.seen.some((one) => one.at >= sent && one.last.includes(SLOW)) &&
      fleet.instance(id)?.turn_open_at
        ? true
        : undefined,
    Boolean,
    120_000
  );
  return id;
};

/** The account the hub's row names for session `id`. */
const rowAccount = (fleet: KitFleet, id: string) =>
  fleet.query<{ account_id: string | null }>(
    "SELECT account_id FROM instances WHERE id = ?",
    id
  )[0]?.account_id ?? null;

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

/** A move owed to the second account (server.ts `owedMoves`), as a person's mid-turn or a rebalance's leaves one. */
const oweMove = (fleet: KitFleet, id: string, to: string | null) =>
  fleet.write(
    "INSERT INTO owed_moves (instance_id, to_account_id, by_hand, move, waits, created_at) VALUES (?, ?, 0, NULL, ?, ?)",
    id,
    to,
    to ? "turn" : "machine",
    Date.now()
  );

interface Seeded {
  id: string;
  kind: Kind;
  status: string;
}

/** With the machine down: the template's row and conversation copied into three at rest of each kind, their state written beside them. */
const seedAtRest = (
  kit: Kit,
  fleet: KitFleet,
  from: { file: string; sessionId: string; template: string }
): Seeded[] => {
  const conversation = readFileSync(from.file, "utf8");
  const now = Date.now();
  const seeded: Seeded[] = [];
  const rows: Parameters<typeof seedRows>[2] = [];
  for (const kind of KINDS) {
    for (let n = 0; n < 3; n += 1) {
      const id = crypto.randomUUID();
      const sessionId = crypto.randomUUID();
      const path = join(dirname(from.file), `${sessionId}.jsonl`);
      writeFileSync(path, conversation.replaceAll(from.sessionId, sessionId));
      // A woken one last moved a minute ago, inside the restore's horizon.
      const moved = kind === "woken" ? now - 60_000 : SEPTEMBER;
      utimesSync(path, moved / 1000, moved / 1000);
      const status = kind === "woken" || n === 0 ? "running" : "sleeping";
      seeded.push({ id, kind, status });
      rows.push({
        id,
        overrides: {
          session_id: sessionId,
          title: `September ${kind} ${n}`,
          status,
          account_id: FIRST,
          updated_at: moved,
          turn_ended_at: moved,
          created_at: SEPTEMBER,
          spawned_at: moved,
          turn_open_at: null,
        },
      });
    }
  }
  seedRows(fleet.env.CAWCO_DB_PATH ?? "", from.template, rows);
  for (const one of seeded) {
    if (one.kind === "owed" || one.kind === "woken") {
      oweMove(fleet, one.id, SECOND);
    } else if (one.kind === "relaunch") {
      oweMove(fleet, one.id, null);
    }
  }
  kit.note(
    `seeded ${seeded.length} sessions at rest (${KINDS.join(", ")}: three each), each with a conversation in ${dirname(from.file)}`
  );
  return seeded;
};

/** Every session sessiond holds a process for, by when a reading first had one, every {@link SAMPLE_MS} until stopped. */
const sampleProcesses = (fleet: KitFleet, into: Map<string, number>) => {
  let on = true;
  const done = (async () => {
    while (on) {
      const procs = await fleet.heldProcs().catch(() => []);
      for (const proc of procs) {
        const id = parseProcId(proc.procId);
        if (id.kind === "claude") {
          into.set(id.instanceId, into.get(id.instanceId) ?? Date.now());
        }
      }
      await Bun.sleep(SAMPLE_MS);
    }
  })();
  return async () => {
    on = false;
    await done;
  };
};

/** A person's message to `id`: whether a turn of it then completes. */
const wake = async (fleet: KitFleet, id: string) => {
  const before = turnsOf(fleet, [id]).get(id) ?? 0;
  await fleet.send(id, "Say ok again.");
  return await until(
    `${id.slice(0, 8)}'s woken turn completes`,
    () => ((turnsOf(fleet, [id]).get(id) ?? 0) > before ? true : undefined),
    Boolean,
    120_000
  ).catch(() => false);
};

const run = async (kit: Kit) => {
  const fleet = await standUp(kit);
  const template = await answered(fleet, "September template");
  const slept = await asleep(fleet, template);
  const [row] = fleet.query<{ session_id: string }>(
    "SELECT session_id FROM instances WHERE id = ?",
    template
  );
  const file = row ? conversationFile(fleet.home, row.session_id) : undefined;
  if (!(row && file) || slept !== "sleeping") {
    throw new Error(
      `the template is ${slept}, its conversation ${file ?? "not on disk"}`
    );
  }
  const live = [
    await midTurn(fleet, "Mid-turn one"),
    await midTurn(fleet, "Mid-turn two"),
    await midTurn(fleet, "Mid-turn three"),
  ];
  const m3 = live[2] ?? "";

  // The machine goes down at once: nothing hears another go.
  await fleet.stop("hub", "SIGKILL");
  await fleet.stop("agent", "SIGKILL");
  await fleet.killSessiond();
  const before = new Map(
    live.map((id) => [id, fleet.instance(id)?.spawned_at ?? 0])
  );
  const turnsBefore = turnsOf(fleet, live);
  kit.check(
    "seed: the three live sessions were each inside a turn as the machine went down",
    live.every((id) => fleet.instance(id)?.turn_open_at),
    JSON.stringify(live.map((id) => fleet.instance(id)))
  );
  const seeded = seedAtRest(kit, fleet, {
    file,
    sessionId: row.session_id,
    template,
  });
  oweMove(fleet, m3, SECOND);
  const rest = [template, ...seeded.map((one) => one.id)];
  const spawnedBefore = new Map(
    rest.map((id) => [id, fleet.instance(id)?.spawned_at ?? 0])
  );

  // The boot.
  const hadProcess = new Map<string, number>();
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  const stopSampling = sampleProcesses(fleet, hadProcess);
  const hubLog = await fleet.logMark("hub");
  const bootAt = Date.now();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.launch("agent");
  await fleet.agentUp();
  // Its cut turn handed back is a turn it completes after the boot.
  const handedBack = await until(
    "the cut turns handed back",
    () => {
      const now = turnsOf(fleet, live);
      return live.every((id) => (now.get(id) ?? 0) > (turnsBefore.get(id) ?? 0))
        ? true
        : undefined;
    },
    Boolean,
    WATCH_MS
  ).catch(() => false);
  await Bun.sleep(Math.max(0, bootAt + WATCH_MS - Date.now()));
  await stopSampling();
  const log = await hubLog.since();

  // (m1, m2) The live ones came back, M3 on the account it owed.
  const relaunched = live.filter(
    (id) =>
      hadProcess.has(id) &&
      (fleet.instance(id)?.spawned_at ?? 0) > (before.get(id) ?? 0)
  );
  kit.check(
    "m1: the three sessions inside a turn as the machine went down are each relaunched on their conversation and handed their turn back",
    relaunched.length === live.length && handedBack === true,
    `relaunched: ${relaunched.length} of ${live.length}; handed back: ${handedBack}; rows: ${JSON.stringify(live.map((id) => fleet.instance(id)))}`
  );
  kit.check(
    "m2: the mid-turn session that owed a move is launched once, on the account it owed",
    rowAccount(fleet, m3) === SECOND,
    `account: ${rowAccount(fleet, m3)}`
  );

  // (s1) One at a time: when sessiond first held each one's process.
  const spawnedAt = live
    .map((id) => hadProcess.get(id) ?? 0)
    .sort((a, b) => a - b);
  const gaps = spawnedAt.slice(1).map((at, n) => at - (spawnedAt[n] ?? 0));
  kit.check(
    `s1: the boot's relaunches start one at a time, ${PACE_MS} ms apart (read to within two samples)`,
    gaps.length === live.length - 1 &&
      gaps.every((gap) => gap >= PACE_MS - 2 * SAMPLE_MS),
    `processes first held at +${spawnedAt.map((at) => at - bootAt).join(" ms, +")} ms after the boot; gaps ${gaps.join(", ")} ms`
  );

  // (r1) Nothing at rest started, and no account move relaunched anything.
  const kindOf = (id: string) =>
    seeded.find((one) => one.id === id)?.kind ?? "template";
  const named = (ids: string[]) =>
    ids.map((id) => `${id.slice(0, 8)} (${kindOf(id)})`).join(", ") || "none";
  const started = rest.filter((id) => hadProcess.has(id));
  const launched = rest.filter(
    (id) => (fleet.instance(id)?.spawned_at ?? 0) > (spawnedBefore.get(id) ?? 0)
  );
  const relaunchLines = log
    .split("\n")
    .filter((line) => line.includes(RELAUNCHES_ON));
  kit.check(
    `r1: none of the ${rest.length} sessions at rest is started at the boot, whatever it owed, and no account move relaunches anything`,
    started.length === 0 && launched.length === 0 && relaunchLines.length === 0,
    `with a process: ${named(started)}; launched: ${named(launched)}; "${RELAUNCHES_ON}" lines: ${relaunchLines.join(" | ") || "none"}`
  );

  // (o1) The owed moves are carried all the same.
  const owed = seeded.filter(
    (one) => one.kind === "owed" || one.kind === "woken"
  );
  const carried = await until(
    "the owed moves carried",
    () => owed.map((one) => rowAccount(fleet, one.id)),
    (accounts) => accounts.every((one) => one === SECOND),
    60_000
  ).catch(() => owed.map((one) => rowAccount(fleet, one.id)));
  kit.check(
    "o1: each move owed by a session at rest is carried at the boot, its row naming the second account, without starting it",
    carried.every((one) => one === SECOND) &&
      owed.every((one) => !hadProcess.has(one.id)),
    JSON.stringify(carried)
  );

  // (w1, w2) A person's message wakes them.
  const owedOne = seeded.find((one) => one.kind === "woken")?.id ?? "";
  const plainOne =
    seeded.find((one) => one.kind === "plain" && one.status === "sleeping")
      ?.id ?? "";
  kit.check(
    "w1: a person's message to a session at rest that owed a move wakes it",
    await wake(fleet, owedOne),
    JSON.stringify(fleet.instance(owedOne))
  );
  kit.check(
    "w2: a person's message to a plain session at rest wakes it",
    await wake(fleet, plainOne),
    JSON.stringify(fleet.instance(plainOne))
  );
};

export default {
  name: "boot-relaunch-at-rest",
  run,
} satisfies Spec;

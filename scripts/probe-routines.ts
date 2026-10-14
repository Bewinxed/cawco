/**
 * Probe: routines (Projects spec §5.5, P3) on a scratch fleet (real hub,
 * agent and sessiond on loopback, mock model). The invariant: a routine
 * fires exactly once per slot, across a hub restart.
 *
 * Each delegate run's mock reads its routine's prompt (`PROBE-ROUTINE-<tag>`)
 * and calls finish_item with the summary its tag says.
 *
 * 1. restart: an every-minute routine answering NO_REPLY. The hub is stopped
 *    after one slot's run ended and started again past the next slot, before
 *    the one after. Every slot has exactly one run, and the catch-up fired
 *    the slot the hub was down for, once.
 * 2. double tick: the claim transaction (db/routines.ts `claimSlot`) run twice
 *    for one slot against the hub's own database files one run; a claim
 *    whose slot was moved back (the insert alone deciding) fires nothing.
 * 3. overlap: an every-minute routine whose runs sleep 75 s: the slot after a
 *    live run is skipped, "the test run is still going".
 * 4. contract: NO_REPLY is silent; words are delivered as a note in the
 *    routine's thread; `AUTOMATION_FAILED: <why>` fails with that why as its
 *    reason, retries once (attempt 2) and
 *    then needs you (a note, and the push the hub logs).
 * 5. test run: every routine made runs once at once, slot `test:<made at>`.
 * 6. expiry: a routine a worker session made (through routine_create) whose
 *    expiry has passed turns itself off, with the reason.
 * 7. Caw off: a lead routine in a project with Caw off is skipped, "Caw is
 *    off, so only your words wake him".
 *
 * Run from the repo root:
 *   bun scripts/probe-routines.ts [--keep]
 */
import { Database } from "bun:sqlite";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
// The hub's own drizzle, which db/routines.ts runs on: not hoisted to the root.
import { drizzle } from "../packages/hub/node_modules/drizzle-orm/bun-sqlite";
import { routinesDb } from "../packages/hub/src/db/routines";
import {
  MACHINE,
  type Reply,
  type Seen,
  scratchFleet,
  until,
} from "./scratch-fleet";

const keep = process.argv.includes("--keep");
const TAG = /PROBE-ROUTINE-(\w+)/;
const SKIP_REASON = /^the \d\d:\d\d run is still going$/;
/** The log lines a failure prints. */
const LOGGED = /routines|work-items|workspace|error/i;
const FINISH = "mcp__cawco__finish_item";
const CREATE = "mcp__cawco__routine_create";

/** What each tag's run says in finish_item. */
const SAYS: Record<string, string> = {
  minute: "NO_REPLY",
  silent: "NO_REPLY",
  slow: "NO_REPLY",
  say: "Report: three new issues since yesterday.",
  fail: "AUTOMATION_FAILED: the issue tracker answered 503",
  agent: "NO_REPLY",
};

const results: Record<string, string> = {};
let failed = false;
const check = (name: string, ok: boolean, detail: string) => {
  failed ||= !ok;
  results[name] = `${ok ? "PASS" : "FAIL"} — ${detail}`;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
};

/** One proof: a failure in it is recorded and the probe goes on to the next. */
const section = async (name: string, body: () => Promise<void>) => {
  try {
    await body();
  } catch (error) {
    check(name, false, error instanceof Error ? error.message : String(error));
  }
};

const tool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});
const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

/** A session that must call `name`: loads it with ToolSearch first when it is deferred. */
const call = (request: Seen, name: string, input: object): Reply => {
  if (request.toolNames.includes(name)) {
    return tool(name, input);
  }
  return request.toolNames.includes("ToolSearch")
    ? tool("ToolSearch", { query: `select:${name}`, max_results: 1 })
    : text(`${name} is not offered`);
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  // The worker that makes a routine through its tool (6).
  if (request.all.includes("PROBE-AGENT-CREATE")) {
    if (request.last.includes('"createdBy"')) {
      return text("made");
    }
    return call(request, CREATE, {
      name: "Agent nightly sweep",
      prompt: "PROBE-ROUTINE-agent: sweep.",
      target: "delegate",
      cron: "0 0 1 1 *",
      time_zone: "UTC",
    });
  }
  const tag = TAG.exec(request.all)?.[1];
  if (!tag) {
    return text("ok");
  }
  // finish_item answered: the turn ends.
  if (
    request.last.includes("checks passed") ||
    request.last.includes("The item")
  ) {
    return text("done");
  }
  if (tag === "slow" && !request.all.includes("SLEPT-slow")) {
    return tool("Bash", {
      command: "sleep 75 && echo SLEPT-slow",
      description: "Take a while",
      timeout: 120_000,
    });
  }
  return call(request, FINISH, { summary: SAYS[tag] ?? "NO_REPLY" });
};

interface RunRow {
  attempt: number;
  ended_at: number | null;
  id: string;
  outcome: string | null;
  output: string | null;
  reason: string | null;
  slot: string;
  started_at: number;
  state: string;
  work_item_id: string | null;
}
interface RoutineRow {
  created_by: string;
  disabled_reason: string | null;
  enabled: number;
  expires_at: number | null;
  id: string;
  next_slot: number;
  thread_id: string | null;
}

const fleet = await scratchFleet({ name: "probe-routines", respond });
const home = fleet.env.HOME as string;

const runsOf = (routineId: string) =>
  fleet.query<RunRow>(
    "SELECT * FROM routine_runs WHERE routine_id = ? ORDER BY started_at, attempt",
    routineId
  );
const routineOf = (id: string) =>
  fleet.query<RoutineRow>("SELECT * FROM routines WHERE id = ?", id)[0];
const ended = (run: RunRow | undefined) =>
  run !== undefined && ["ended", "skipped"].includes(run.state);
const scheduled = (runs: RunRow[]) =>
  runs.filter(
    (run) => !(run.slot.startsWith("test:") || run.slot.startsWith("now:"))
  );
const notesIn = (threadId: string | null) =>
  threadId
    ? fleet.query<{ note_title: string | null; body: string }>(
        "SELECT note_title, body FROM thread_messages WHERE thread_id = ? ORDER BY created_at",
        threadId
      )
    : [];

const make = (body: object) =>
  fleet.api<{ id: string; createdBy: string; nextSlot: number }>(
    "/api/routines",
    body
  );
const patch = async (id: string, body: object) => {
  const response = await fetch(`${fleet.base}/api/routines/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`PATCH ${id}: ${response.status} ${await response.text()}`);
  }
};
const MINUTE = 60_000;

try {
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  const src = join(fleet.sandbox, "src");
  await mkdir(src, { recursive: true });
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  await Bun.$`git init -q -b main && echo routines > README.md && git add -A && git commit -qm 'First commit'`
    .cwd(src)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Routines",
    machineId: MACHINE,
    cwd: src,
    caw: false,
  });
  const base = { projectId: project.id, timeZone: "UTC", target: "delegate" };
  const YEARLY = "0 0 1 1 *";

  // ── 7: a lead routine with Caw off ────────────────────────────────────
  const lead = await make({
    ...base,
    target: "lead",
    name: "Lead morning brief",
    cron: YEARLY,
    prompt: "PROBE-LEAD: brief the board.",
  });
  const [leadRun] = runsOf(lead.id);
  check(
    "7: a lead routine with Caw off is skipped, Caw is off",
    leadRun?.state === "skipped" &&
      leadRun.reason === "Caw is off, so only your words wake him",
    JSON.stringify(leadRun)
  );

  // ── 4, 5: the output contract, on each routine's test run ──────────────
  const silent = await make({
    ...base,
    name: "Silent check",
    cron: YEARLY,
    prompt: "PROBE-ROUTINE-silent: look.",
  });
  const say = await make({
    ...base,
    name: "Issue report",
    cron: YEARLY,
    prompt: "PROBE-ROUTINE-say: report.",
  });
  const fail = await make({
    ...base,
    name: "Broken sync",
    cron: YEARLY,
    prompt: "PROBE-ROUTINE-fail: sync.",
  });

  // ── 3: overlap, every minute, each run 75 s ────────────────────────────
  const slow = await make({
    ...base,
    name: "Slow every minute",
    cron: "* * * * *",
    prompt: "PROBE-ROUTINE-slow: take a while.",
  });

  // ── 1: an every-minute routine across a hub restart ───────────────────
  const minute = await make({
    ...base,
    name: "Minute pulse",
    cron: "* * * * *",
    prompt: "PROBE-ROUTINE-minute: pulse.",
  });

  // 5: every routine made ran once at once as a test.
  for (const [name, made] of Object.entries({
    silent,
    say,
    fail,
    slow,
    minute,
    lead,
  })) {
    const tests = runsOf(made.id).filter((run) => run.slot.startsWith("test:"));
    check(
      `5: ${name} ran once at once as a test`,
      tests.length === 1 && tests[0]?.attempt === 1,
      tests.map((run) => `${run.slot} ${run.state}`).join("; ")
    );
  }

  await section("4: NO_REPLY is silent, and nothing is noted", async () => {
    const silentRun = await until(
      "the silent run ended",
      () => runsOf(silent.id)[0],
      ended,
      240_000
    );
    check(
      "4: NO_REPLY is silent, and nothing is noted",
      silentRun.outcome === "silent" &&
        routineOf(silent.id)?.thread_id === null,
      `${silentRun.outcome} (${silentRun.reason}), thread ${routineOf(silent.id)?.thread_id}`
    );
  });
  await section(
    "4: words are delivered as a note in the routine's thread",
    async () => {
      const sayRun = await until(
        "the say run ended",
        () => runsOf(say.id)[0],
        ended,
        240_000
      );
      const sayNotes = notesIn(routineOf(say.id)?.thread_id ?? null);
      check(
        "4: words are delivered as a note in the routine's thread",
        sayRun.outcome === "delivered" &&
          sayRun.output === SAYS.say &&
          sayNotes.some(
            (row) =>
              row.note_title === "Routine · Issue report" &&
              row.body === SAYS.say
          ),
        `${sayRun.outcome} “${sayRun.output}” (${sayRun.reason}); notes ${JSON.stringify(sayNotes)}`
      );
    }
  );
  await section("4: AUTOMATION_FAILED, its retry, needs you", async () => {
    const failRuns = await until(
      "the failing routine's retry ended",
      () => runsOf(fail.id),
      (runs) => runs.length >= 2 && runs.every(ended),
      360_000
    );
    check(
      "4: AUTOMATION_FAILED fails, and retries once on the same slot",
      failRuns.length === 2 &&
        failRuns.every(
          (run) =>
            run.outcome === "failed" &&
            run.reason === "the issue tracker answered 503"
        ) &&
        failRuns[0]?.slot === failRuns[1]?.slot &&
        failRuns.map((run) => run.attempt).join() === "1,2",
      failRuns
        .map(
          (run) => `${run.slot} #${run.attempt} ${run.outcome} (${run.reason})`
        )
        .join("; ")
    );
    const failNotes = notesIn(routineOf(fail.id)?.thread_id ?? null);
    const hubLog = await fleet.logs("hub");
    check(
      "4: the second failure needs you: a note, and a push",
      failNotes.some(
        (row) =>
          row.note_title === "Routine · Broken sync failed twice · needs you"
      ) &&
        hubLog.includes(
          `[push] routine ${fail.id} run ${failRuns[1]?.id}: needs you`
        ),
      `notes ${JSON.stringify(failNotes)}`
    );
  });

  // ── 3: the slot after the slow test run is skipped ────────────────────
  await section(
    "3: a slot while a run is live is skipped, with its reason",
    async () => {
      const skipped = await until(
        "a slow slot skipped",
        () => runsOf(slow.id).find((run) => run.state === "skipped"),
        Boolean,
        150_000
      );
      check(
        "3: a slot while a run is live is skipped, with its reason",
        skipped.reason === "the test run is still going" ||
          SKIP_REASON.test(skipped.reason ?? ""),
        `${skipped.slot}: ${skipped.reason}`
      );
    }
  );
  await patch(slow.id, { enabled: false });

  // ── 2: two claims of one slot ─────────────────────────────────────────
  const ticked = await make({
    ...base,
    name: "Ticked twice",
    cron: YEARLY,
    prompt: "PROBE-ROUTINE-silent: ticked.",
  });
  const due = new Date(routineOf(ticked.id)?.next_slot ?? 0);
  const next = new Date(due.getTime() + 365 * 24 * 60 * MINUTE);
  const sqlite = new Database(join(fleet.sandbox, "hub", "hub.db"));
  sqlite.exec("PRAGMA busy_timeout = 15000");
  const store = routinesDb(drizzle(sqlite));
  const skip = () => ({ state: "skipped" as const, reason: "probe claim" });
  const first = store.claimSlot({
    routineId: ticked.id,
    due,
    next,
    slot: due,
    decide: skip,
  });
  const second = store.claimSlot({
    routineId: ticked.id,
    due,
    next,
    slot: due,
    decide: skip,
  });
  // The slot moved back, as though a tick read it before the first claim:
  // the insert alone finds the row, and nothing fires.
  sqlite
    .query("UPDATE routines SET next_slot = ? WHERE id = ?")
    .run(due.getTime(), ticked.id);
  const third = store.claimSlot({
    routineId: ticked.id,
    due,
    next,
    slot: due,
    decide: skip,
  });
  sqlite.close();
  const atSlot = runsOf(ticked.id).filter(
    (run) => run.slot === due.toISOString()
  );
  check(
    "2: two ticks for one slot insert one row",
    first !== undefined &&
      second === undefined &&
      third === undefined &&
      atSlot.length === 1,
    `first ${first?.id ?? "none"}, second ${second?.id ?? "none"}, third ${third?.id ?? "none"}, rows at ${due.toISOString()}: ${atSlot.length}`
  );

  // ── 6: an agent's routine past its expiry turns itself off ─────────────
  await section("6: an agent's routine expires", async () => {
    const worker = await fleet.spawn("claude", "Routine maker", src, {
      projectId: project.id,
    });
    await fleet.send(
      worker,
      "PROBE-AGENT-CREATE: make a nightly sweep routine."
    );
    const agentMade = await until(
      "the worker's routine",
      () =>
        fleet.query<RoutineRow & { name: string }>(
          "SELECT * FROM routines WHERE name = 'Agent nightly sweep'"
        )[0],
      Boolean,
      180_000
    );
    const lifetime =
      (agentMade.expires_at ?? 0) -
      (fleet.query<{ created_at: number }>(
        "SELECT created_at FROM routines WHERE id = ?",
        agentMade.id
      )[0]?.created_at ?? 0);
    check(
      "6: a routine a session makes names it and expires in 7 days",
      agentMade.created_by === worker && lifetime === 7 * 24 * 60 * MINUTE,
      `created_by ${agentMade.created_by}, lifetime ${lifetime} ms`
    );
    fleet.write(
      "UPDATE routines SET expires_at = ? WHERE id = ?",
      Date.now() - 1000,
      agentMade.id
    );
    const expired = await until(
      "the agent's routine turned off",
      () => routineOf(agentMade.id),
      (row) => row?.enabled === 0,
      60_000
    );
    check(
      "6: past its expiry it turns itself off, with the reason",
      (expired.disabled_reason ?? "").startsWith(
        "It expired: a session made it on"
      ),
      expired.disabled_reason ?? "(none)"
    );
  });

  // ── 1: the restart ─────────────────────────────────────────────────────
  await section("1: once per slot across a hub restart", async () => {
    // A scheduled slot whose run has ended, with most of a minute to spare.
    const s1 = await until(
      "a minute slot run ended early in its minute",
      () => {
        const last = scheduled(runsOf(minute.id)).at(-1);
        return last &&
          ended(last) &&
          Date.now() - Date.parse(last.slot) < 40_000
          ? last
          : undefined;
      },
      Boolean,
      300_000
    );
    const s1At = Date.parse(s1.slot);
    console.log(`stopping the hub after slot ${s1.slot}`);
    await fleet.stop("hub");
    // Down across the next slot, back before the one after.
    const back = s1At + MINUTE + 15_000;
    await Bun.sleep(Math.max(0, back - Date.now()));
    const restartedAt = Date.now();
    fleet.launch("hub");
    await fleet.hubUp();
    const s2 = new Date(s1At + MINUTE).toISOString();
    const s3 = new Date(s1At + 2 * MINUTE).toISOString();
    for (const slot of [s2, s3]) {
      // biome-ignore lint/performance/noAwaitInLoops: the catch-up's slot, then the one after
      await until(
        `slot ${slot}'s run ended`,
        () => scheduled(runsOf(minute.id)).find((run) => run.slot === slot),
        (run) => ended(run),
        240_000
      );
    }
    const minuteRuns = scheduled(runsOf(minute.id)).filter(
      (run) => run.attempt === 1
    );
    const slots = minuteRuns.map((run) => run.slot);
    const counts = new Map<string, number>();
    for (const slot of slots) {
      counts.set(slot, (counts.get(slot) ?? 0) + 1);
    }
    const consecutive = slots.every(
      (slot, index) =>
        index === 0 ||
        Date.parse(slot) - Date.parse(slots[index - 1] ?? "") === MINUTE
    );
    check(
      "1: every slot has exactly one run, across the restart",
      [...counts.values()].every((n) => n === 1) && consecutive,
      slots.join(", ")
    );
    // The slot the hub was down for: filed once, by the hub that came back.
    const s2Runs = minuteRuns.filter((run) => run.slot === s2);
    check(
      "1: the catch-up fired the slot the hub was down for, once",
      s2Runs.length === 1 && (s2Runs[0]?.started_at ?? 0) >= restartedAt,
      `${s2Runs.length} run(s) for ${s2}, filed ${(s2Runs[0]?.started_at ?? 0) - restartedAt} ms after the relaunch`
    );
    check(
      "1: the catch-up's run answered NO_REPLY",
      s2Runs[0]?.outcome === "silent",
      `${s2Runs[0]?.state} ${s2Runs[0]?.outcome ?? ""} (${s2Runs[0]?.reason ?? ""})`
    );
    await patch(minute.id, { enabled: false });
  });
} catch (error) {
  failed = true;
  console.error(
    `probe failed: ${error instanceof Error ? error.stack : String(error)}`
  );
  results.error = String(error);
} finally {
  console.log(
    `routines: ${JSON.stringify(fleet.query("SELECT name, enabled, next_slot, disabled_reason FROM routines"), null, 1)}`
  );
  console.log(
    `runs: ${JSON.stringify(fleet.query("SELECT r.name, x.slot, x.attempt, x.state, x.outcome, x.reason FROM routine_runs x JOIN routines r ON r.id = x.routine_id ORDER BY x.started_at"), null, 1)}`
  );
  if (failed) {
    const logs = (await readdir(fleet.sandbox))
      .filter((name) => name.endsWith(".log") || name.endsWith(".err"))
      .sort();
    for (const name of logs) {
      // biome-ignore lint/performance/noAwaitInLoops: one log at a time, in order
      const lines = (await Bun.file(join(fleet.sandbox, name)).text())
        .split("\n")
        .filter((line) => LOGGED.test(line))
        .slice(-40);
      console.log(`── ${name}\n${lines.join("\n").slice(0, 8000)}`);
    }
  }
  await fleet.close();
  console.log(JSON.stringify(results, null, 2));
  await fleet.clean(keep || failed);
}
process.exit(failed ? 1 : 0);

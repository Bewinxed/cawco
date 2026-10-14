/**
 * A lead routine's runs end in Caw's own words (routines.ts `routine_result`),
 * on a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model) with Caw on, read from the hub's `routine_runs` and its
 * routine's thread. One lead routine; before each run its prompt steers
 * Caw's answer (`PROBE-ANSWER <how>`), and the mock calls `routine_result`
 * with the run id the wake names. In order:
 *
 * 1. Its test run, answered `NO_REPLY`: silent, no note beyond the slot's.
 * 2. Run now, answered with words: delivered, the words stored as its
 *    output and noted in the routine's thread.
 * 3. Run now, answered `NO_REPLY`: silent, no result note.
 * 4. Run now, answered `AUTOMATION_FAILED: <why>`: failed with that why as
 *    its reason, retried once (attempt 2), failed again, and the thread says
 *    it needs you. 4b: answered a bare `AUTOMATION_FAILED` after words of its
 *    own: the reason is those words, the last thing Caw said.
 * 5. Run now, Caw ends his turn without the call: failed with “Caw ended
 *    its turn without saying how the run went”, retried once, failed again.
 * 6. A thread's status (caw.ts `Turn`, read from every `thread.upsert` the
 *    hub publishes): your words start a slow turn; your second message,
 *    sent while it runs, waits in Claude's queue past that turn's end. The
 *    thread reads `working` from the first message until the turn that read
 *    the second ends, never `ready` between, then `ready`.
 *
 *   bun scripts/probe-kit/run.ts routine-results
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const CAW = "You are Caw";
const RESULT = "mcp__cawco__routine_result";
const NAME = "Probe results";
const WORDS = "PROBE-RESULT the board is calm";
const NO_RESULT = "Caw ended its turn without saying how the run went";
/** Why step 4's runs failed, in Caw's answer. */
const WHY = "the board's machine is offline";
/** What Caw says before step 4b's bare answer: its last text. */
const LAST = "The board would not load: every machine is off the tailnet.";
/** What each way of answering says to routine_result; `none` makes no call. */
const ANSWERS: Record<string, string | undefined> = {
  delivered: WORDS,
  silent: "NO_REPLY",
  failed: `AUTOMATION_FAILED: ${WHY}`,
  bare: "AUTOMATION_FAILED",
  none: undefined,
};

/** The run id a wake names, and how the prompt steers Caw to answer it. */
const RUN_ID = /routine_result with run "([^"]+)"/;
const STEER = /PROBE-ANSWER (\w+)/;

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

/** The runs Caw has answered, by id: each is answered once. */
const answered = new Set<string>();

/** Step 6's two messages, and when the mock began each one's turn. */
const FIRST = "PROBE-FIRST";
const SECOND = "PROBE-SECOND";
const began: { first?: number; second?: number } = {};
/** The first turn: four seconds of words, with no tool call to fold a send in at. */
const FIRST_MS = 4000;
const SECOND_MS = 1500;
const slow = (ms: number, word: string): Reply => ({
  everyMs: ms / 10,
  words: Array.from({ length: 10 }, () => `${word} `),
});

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (request.all.includes(CAW) && !request.afterTool) {
    if (request.last.includes(SECOND)) {
      began.second ??= Date.now();
      return slow(SECOND_MS, "second");
    }
    if (request.last.includes(FIRST)) {
      began.first ??= Date.now();
      return slow(FIRST_MS, "first");
    }
  }
  const run = request.last.match(RUN_ID)?.[1];
  const how = request.last.match(STEER)?.[1];
  if (!(request.all.includes(CAW) && run && how) || answered.has(run)) {
    return text("ok");
  }
  const result = ANSWERS[how];
  if (result === undefined) {
    return text("Looked at it; nothing more to do.");
  }
  if (request.toolNames.includes(RESULT)) {
    answered.add(run);
    return {
      everyMs: 5,
      // The bare answer comes after words of Caw's own: the run's last text.
      words: how === "bare" ? [LAST] : [],
      tool: { name: RESULT, input: { run, result } },
    };
  }
  return request.toolNames.includes("ToolSearch")
    ? {
        everyMs: 5,
        words: [],
        tool: {
          name: "ToolSearch",
          input: { query: `select:${RESULT}`, max_results: 1 },
        },
      }
    : text(`${RESULT} is not offered`);
};

interface RunRow {
  attempt: number;
  ended_at: number | null;
  id: string;
  lead_instance_id: string | null;
  outcome: string | null;
  output: string | null;
  reason: string | null;
  slot: string;
  state: string;
}

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  const home = fleet.env.HOME as string;
  const src = join(fleet.sandbox, "src");
  await mkdir(src, { recursive: true });
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  await Bun.$`git init -q -b main && echo caw > README.md && git add -A && git commit -qm 'First commit'`
    .cwd(src)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Routine results",
    machineId: MACHINE,
    cwd: src,
    caw: true,
  });

  const runs = (routineId: string) =>
    fleet.query<RunRow>(
      "SELECT id, slot, attempt, state, outcome, output, reason, lead_instance_id, ended_at FROM routine_runs WHERE routine_id = ? ORDER BY started_at, attempt",
      routineId
    );
  const notes = (title: string) =>
    fleet.query<{ body: string }>(
      "SELECT m.body FROM thread_messages m JOIN project_threads t ON t.id = m.thread_id WHERE t.project_id = ? AND m.note_title = ?",
      project.id,
      title
    );
  /** The slot's runs once none of them is live and `attempts` of them ended. */
  const settled = (routineId: string, slot: string, attempts: number) =>
    until(
      `the ${slot} run settled`,
      () => runs(routineId).filter((row) => row.slot === slot),
      (rows) =>
        rows.length === attempts && rows.every((row) => row.state === "ended"),
      180_000
    );
  const describe = (rows: RunRow[]) =>
    rows
      .map(
        (row) =>
          `#${row.attempt} ${row.state}/${row.outcome} output=${JSON.stringify(row.output)} reason=${JSON.stringify(row.reason)}`
      )
      .join("; ");

  // ── 1. the test run, answered NO_REPLY ──────────────────────────────
  const routine = await fleet.api<{ id: string }>("/api/routines", {
    projectId: project.id,
    timeZone: "UTC",
    target: "lead",
    name: NAME,
    cron: "0 0 1 1 *",
    prompt: "PROBE-ANSWER silent: look over the board.",
  });
  const [test] = await until(
    "the test run filed",
    () => runs(routine.id),
    (rows) => rows.length > 0,
    10_000
  );
  const testRows = await settled(routine.id, test?.slot ?? "", 1);
  kit.check(
    "1: the test run, answered NO_REPLY, ends silent with no output",
    testRows[0]?.outcome === "silent" &&
      testRows[0].output === null &&
      testRows[0].lead_instance_id !== null,
    describe(testRows)
  );

  /** Steers the next run's answer, runs it now, and answers its slot's runs. */
  const runNow = async (how: string, attempts: number) => {
    await fetch(`${fleet.base}/api/routines/${routine.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: `PROBE-ANSWER ${how}: look over the board.`,
      }),
    });
    const begun = await fleet.api<{ slot: string; state: string }>(
      `/api/routines/${routine.id}/run`,
      {}
    );
    if (begun.state === "skipped") {
      throw new Error(`the ${how} run was skipped`);
    }
    return settled(routine.id, begun.slot, attempts);
  };

  // ── 2. delivered ────────────────────────────────────────────────────
  const delivered = await runNow("delivered", 1);
  const resultNotes = notes(`Routine · ${NAME}`);
  kit.check(
    "2: answered with words, the run is delivered with them as its output",
    delivered[0]?.outcome === "delivered" && delivered[0].output === WORDS,
    describe(delivered)
  );
  kit.check(
    "2: the words are noted in the routine's thread",
    resultNotes.length === 1 && resultNotes[0]?.body === WORDS,
    `${resultNotes.length} note(s): ${resultNotes.map((n) => n.body).join(" | ")}`
  );

  // ── 3. silent ───────────────────────────────────────────────────────
  const silent = await runNow("silent", 1);
  kit.check(
    "3: answered NO_REPLY, the run is silent with no output",
    silent[0]?.outcome === "silent" && silent[0].output === null,
    describe(silent)
  );
  kit.check(
    "3: a silent run notes no result in the thread",
    notes(`Routine · ${NAME}`).length === 1
  );

  // ── 4. failed, retried once ─────────────────────────────────────────
  const failed = await runNow("failed", 2);
  kit.check(
    "4: answered AUTOMATION_FAILED with a reason, it fails with that reason, is retried once, and fails again",
    failed.length === 2 &&
      failed.every((row) => row.outcome === "failed" && row.reason === WHY) &&
      failed[1]?.attempt === 2,
    describe(failed)
  );
  kit.check(
    "4: the second failure is noted as needing you",
    notes(`Routine · ${NAME} failed twice · needs you`).length === 1
  );

  // ── 4b. a bare AUTOMATION_FAILED: the reason is Caw's last text ────
  const bare = await runNow("bare", 2);
  kit.check(
    "4b: answered a bare AUTOMATION_FAILED, the reason is the last thing Caw said",
    bare.length === 2 &&
      bare.every((row) => row.outcome === "failed" && row.reason === LAST),
    describe(bare)
  );

  // ── 5. no routine_result before the turn ends ───────────────────────
  const silentTurn = await runNow("none", 2);
  kit.check(
    "5: a turn that ends without routine_result fails the run, saying so, retried once",
    silentTurn.length === 2 &&
      silentTurn.every(
        (row) => row.outcome === "failed" && row.reason === NO_RESULT
      ),
    describe(silentTurn)
  );
  kit.check(
    "every run of the routine ended silent, delivered or failed",
    runs(routine.id).every((row) =>
      ["silent", "delivered", "failed"].includes(row.outcome ?? "")
    )
  );

  // ── 6. a wake sent mid-turn keeps its thread working ────────────────
  /** Every status the hub published for a thread, in order, with when. */
  const published: { at: number; status: string; thread: string }[] = [];
  const listener = new WebSocket(
    `${fleet.base.replace("http", "ws")}/ws/dashboard`
  );
  const upserts = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(upserts);
      return;
    }
    if (!value || typeof value !== "object") {
      return;
    }
    const frame = value as {
      kind?: string;
      thread?: { id: string; status: string };
    };
    if (frame.kind === "thread.upsert" && frame.thread) {
      published.push({
        at: Date.now(),
        status: frame.thread.status,
        thread: frame.thread.id,
      });
      return;
    }
    Object.values(value).forEach(upserts);
  };
  listener.onmessage = (message) => upserts(JSON.parse(String(message.data)));
  await new Promise<void>((done) => {
    listener.onopen = () => done();
  });
  const opened = await fleet.api<{ thread: { id: string } }>(
    `/api/projects/${project.id}/threads`,
    { body: `${FIRST}: walk me through the board.` }
  );
  const threadId = opened.thread.id;
  await until("the first turn begun", () => began.first, Boolean, 60_000);
  await Bun.sleep(1000);
  const secondAt = Date.now();
  await fleet.api(`/api/projects/${project.id}/threads/${threadId}/messages`, {
    body: `${SECOND}: and the tasks waiting for me?`,
  });
  await until(
    "the thread ready again",
    () => published.filter((one) => one.thread === threadId).at(-1)?.status,
    (status) => status === "ready" && began.second !== undefined,
    60_000
  );
  listener.close();
  const mine = published.filter((one) => one.thread === threadId);
  const sequence = mine
    .map((one) => one.status)
    .filter((status, i, all) => status !== all[i - 1]);
  const firstEnd = (began.first ?? 0) + FIRST_MS;
  const readyAt = mine.at(-1)?.at ?? 0;
  const timeline = mine
    .map((one) => `${one.status}@${one.at - (began.first ?? 0)}ms`)
    .join(", ");
  kit.check(
    "6: the second message waited past the first turn's end, in a turn of its own",
    began.second !== undefined && began.second >= firstEnd - 200,
    `second turn began ${(began.second ?? 0) - (began.first ?? 0)}ms after the first (which ran ${FIRST_MS}ms); sent at ${secondAt - (began.first ?? 0)}ms`
  );
  kit.check(
    "6: the thread reads working from the first message to the second turn's end, never ready between",
    sequence.join(" → ") === "working → ready" &&
      readyAt >= (began.second ?? Number.POSITIVE_INFINITY) + SECOND_MS - 500,
    timeline
  );
  kit.check(
    "6: the first turn's end republished it, still working",
    mine.some(
      (one) =>
        one.status === "working" &&
        one.at >= firstEnd - 500 &&
        one.at <= (began.second ?? 0) + 100
    ),
    timeline
  );
};

export default { name: "routine-results", run } satisfies Spec;

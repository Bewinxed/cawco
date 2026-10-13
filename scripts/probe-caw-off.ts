/**
 * Probe: you can always talk to a project's Caw, on or off (caw.ts, WORDS.md
 * Caw on / Caw off), on a scratch fleet (real hub, agent and sessiond on
 * loopback, Claude Code against the mock model). On means only that he also
 * acts on his own: events wake him.
 *
 * a. Caw off: starting a thread is answered (not 409), his session starts,
 *    he answers in the thread, and his task_create makes a task.
 * b. Caw off: a lead routine is skipped, and an attempt's report does not
 *    wake him (the attempt started while he was on, then he was turned off).
 * c. Caw on: a lead routine wakes him, and so does an attempt's report.
 * d. Turning him off cuts a turn an event started; a turn your words started
 *    runs to its end.
 * e. With no machine for him, your words are refused with the problem's
 *    sentence.
 *
 * Run from the repo root:
 *   bun scripts/probe-caw-off.ts [--keep]
 */
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  delay,
  MACHINE,
  type Reply,
  type Seen,
  scratchFleet,
  until,
} from "./scratch-fleet";

const keep = process.argv.includes("--keep");
const LOGGED = /\[caw\]|work-items|routines|error/i;
const CAW = "You are Caw";
const TASK_CREATE = "mcp__cawco__task_create";
const REPLY = "mcp__cawco__thread_reply";
const FINISH = "mcp__cawco__finish_item";
const THREAD_ID = /thread ([0-9a-f-]{36})/g;
/** Where an event Caw reads begins, in his conversation. */
const EVENT_START =
  /You started a thread|You wrote in the thread|Routine “|The attempt at|PROBE-ATTEMPT-(?:OFF|ON)/g;
const OFF_REASON = "Caw is off, so only your words wake him";
const ATTEMPT_TAG = /PROBE-ATTEMPT-(OFF|ON)/;

const results: Record<string, string> = {};
let failed = false;
const check = (name: string, ok: boolean, detail: string) => {
  failed ||= !ok;
  results[name] = `${ok ? "PASS" : "FAIL"} — ${detail}`;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
};
const section = async (name: string, body: () => Promise<void>) => {
  try {
    await body();
  } catch (error) {
    check(name, false, error instanceof Error ? error.message : String(error));
  }
};

const tool = (name: string, input: object, everyMs = 5): Reply => ({
  everyMs,
  words: [],
  tool: { name, input },
});
const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

/** Calls `name`, loading it with ToolSearch first when it is deferred. */
const call = (
  request: Seen,
  name: string,
  input: object,
  everyMs = 5
): Reply => {
  if (request.toolNames.includes(name)) {
    return tool(name, input, everyMs);
  }
  return request.toolNames.includes("ToolSearch")
    ? tool("ToolSearch", { query: `select:${name}`, max_results: 1 })
    : text(`${name} is not offered`);
};

/** When each slow reply began streaming, by its marker. */
const slowFrom: Record<string, number> = {};

/** Caw's side: what he does for the event his conversation ends with. */
const caw = (request: Seen): Reply => {
  const starts = [...request.all.matchAll(EVENT_START)];
  const event = request.all.slice(starts.at(-1)?.index ?? 0);
  const thread = [...event.matchAll(THREAD_ID)][0]?.[1] ?? "";
  // Each tool's answer since the event: the step it is on.
  const replied = event.includes('"ok":true');
  // The slow asks first: a later message in the first thread carries that
  // thread's title, PROBE-TASK's words.
  for (const marker of ["PROBE-SLOW-YOU", "PROBE-SLOW-EVENT"]) {
    if (event.includes(marker)) {
      if (replied) {
        return text("done");
      }
      const reply = call(
        request,
        REPLY,
        { thread, body: `${marker} done` },
        3000
      );
      if (reply.tool?.name === REPLY) {
        slowFrom[marker] = Date.now();
      }
      return reply;
    }
  }
  if (event.includes("PROBE-TASK")) {
    if (!event.includes("tsk-")) {
      return call(request, TASK_CREATE, { title: "Probe task from Caw" });
    }
    return replied
      ? text("done")
      : call(request, REPLY, { thread, body: "Made it" });
  }
  return text("ok");
};

/** An attempt's delegate: OFF sleeps 20 s first; both finish blocked. */
const attempt = (request: Seen, tag: string): Reply => {
  if (request.last.includes("The item")) {
    return text("done");
  }
  if (tag === "OFF" && !request.all.includes("SLEPT-OFF")) {
    return tool("Bash", {
      command: "sleep 20 && echo SLEPT-OFF",
      description: "Take a while",
      timeout: 60_000,
    });
  }
  return call(request, FINISH, {
    summary: "Probe attempt",
    blocked: { command: "probe", error: "the probe blocks it" },
  });
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (request.all.includes(CAW)) {
    return caw(request);
  }
  const tag = ATTEMPT_TAG.exec(request.all)?.[1];
  return tag ? attempt(request, tag) : text("ok");
};

const fleet = await scratchFleet({ name: "probe-caw-off", respond });
const home = fleet.env.HOME as string;

/** A request to the hub, answered with its status and body. */
const hub = async (method: string, path: string, body?: unknown) => {
  const response = await fetch(`${fleet.base}${path}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
    signal: AbortSignal.timeout(300_000),
  });
  const raw = await response.text();
  let json: unknown = raw;
  try {
    json = JSON.parse(raw);
  } catch {
    // a sentence
  }
  return { status: response.status, body: json, raw };
};
const turn = (projectId: string, on: boolean) =>
  hub("PATCH", `/api/projects/${projectId}/caw`, { on });
const cawSaid = (threadId: string) =>
  fleet
    .query<{ body: string }>(
      "SELECT body FROM thread_messages WHERE thread_id = ? AND author = 'caw' ORDER BY created_at",
      threadId
    )
    .map((row) => row.body);
const cawRequests = (since: number, words: string) =>
  fleet.seen.filter(
    (one) =>
      one.at >= since && one.all.includes(CAW) && one.last.includes(words)
  );
const runsOf = (routineId: string) =>
  fleet.query<{ state: string; reason: string | null; outcome: string | null }>(
    "SELECT state, reason, outcome FROM routine_runs WHERE routine_id = ? ORDER BY started_at",
    routineId
  );
const itemOf = (taskId: string) =>
  fleet.query<{ id: string; state: string }>(
    "SELECT id, state FROM work_items WHERE task_id = ? ORDER BY created_at DESC",
    taskId
  )[0];

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
  await Bun.$`git init -q -b main && echo caw > README.md && git add -A && git commit -qm 'First commit'`
    .cwd(src)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Caw off",
    machineId: MACHINE,
    cwd: src,
    caw: false,
  });
  const lead = () =>
    fleet.query<{ lead_instance_id: string | null; caw: number }>(
      "SELECT lead_instance_id, caw FROM projects WHERE id = ?",
      project.id
    )[0];

  // ── a: Caw off, you start a thread ─────────────────────────────────────
  let firstThread = "";
  await section("a: Caw off answers your thread", async () => {
    const started = await hub("POST", `/api/projects/${project.id}/threads`, {
      body: "PROBE-TASK: file a task for the README.",
    });
    const thread = (started.body as { thread?: { id: string } }).thread?.id;
    firstThread = thread ?? "";
    check(
      "a: starting a thread with Caw off is answered, not refused",
      started.status !== 409 && Boolean(thread) && lead()?.caw === 0,
      `HTTP ${started.status}, thread ${thread}, caw ${lead()?.caw}: ${started.raw.slice(0, 200)}`
    );
    check(
      "a: his session started",
      Boolean(lead()?.lead_instance_id),
      `lead ${lead()?.lead_instance_id}`
    );
    const said = await until(
      "Caw's answer in the thread",
      () => cawSaid(firstThread),
      (bodies) => bodies.includes("Made it"),
      180_000
    );
    const tasks = await fleet.api<{ tasks: { id: string; title: string }[] }>(
      `/api/projects/${project.id}/tasks`
    );
    const made = tasks.tasks.find(
      (task) => task.title === "Probe task from Caw"
    );
    check(
      "a: he answered in the thread, and his task_create made a task",
      said.includes("Made it") && Boolean(made),
      `said ${JSON.stringify(said)}; task ${made?.id ?? "none"}`
    );
  });

  // ── b: Caw off, a lead routine is skipped ──────────────────────────────
  await section("b: a lead routine with Caw off", async () => {
    const before = Date.now();
    const routine = await fleet.api<{ id: string }>("/api/routines", {
      projectId: project.id,
      timeZone: "UTC",
      target: "lead",
      name: "Off brief",
      cron: "0 0 1 1 *",
      prompt: "PROBE-ROUTINE-OFF: brief the board.",
    });
    const [run] = await until(
      "the off routine's test run decided",
      () => runsOf(routine.id),
      (runs) => runs.length > 0 && runs[0]?.state !== "starting"
    );
    await delay(3000);
    check(
      "b: a lead routine with Caw off is skipped, in the off state's words, and wakes no model",
      run?.state === "skipped" &&
        run.reason === OFF_REASON &&
        cawRequests(before, "PROBE-ROUTINE-OFF").length === 0,
      `${run?.state}: ${run?.reason}; Caw requests ${cawRequests(before, "PROBE-ROUTINE-OFF").length}`
    );
  });

  // ── c, d: Caw on, a lead routine wakes him; off cuts that turn ──────────
  await section("c/d: an event's turn, then off", async () => {
    const on = await turn(project.id, true);
    const before = Date.now();
    await fleet.api("/api/routines", {
      projectId: project.id,
      timeZone: "UTC",
      target: "lead",
      name: "Slow event",
      cron: "0 0 1 1 *",
      prompt: "PROBE-SLOW-EVENT: brief the board.",
    });
    await until(
      "Caw's slow reply to the routine began",
      () => slowFrom["PROBE-SLOW-EVENT"],
      (at) => at !== undefined && at >= before,
      180_000
    );
    check(
      "c: Caw on, a lead routine wakes him",
      on.status === 200 &&
        fleet.seen.some(
          (one) =>
            one.at >= before &&
            one.all.includes(CAW) &&
            one.all.includes("PROBE-SLOW-EVENT")
        ),
      `PATCH on: HTTP ${on.status}`
    );
    await delay(2000);
    const off = await turn(project.id, false);
    await delay(25_000);
    const log = await fleet.logs("hub");
    const eventThread = fleet.query<{ thread_id: string }>(
      "SELECT thread_id FROM routines WHERE name = 'Slow event'"
    )[0]?.thread_id;
    const said = eventThread ? cawSaid(eventThread) : [];
    check(
      "d: turning Caw off cuts the turn an event started",
      off.status === 200 &&
        !said.includes("PROBE-SLOW-EVENT done") &&
        log.includes("cut the turn an event started") &&
        lead()?.lead_instance_id !== null,
      `PATCH off: HTTP ${off.status}; Caw said ${JSON.stringify(said)}; cut logged ${log.includes("cut the turn an event started")}; lead kept ${lead()?.lead_instance_id}`
    );
  });

  // ── d: your turn runs to its end when he is turned off ─────────────────
  await section("d: your turn, then off", async () => {
    await turn(project.id, true);
    const before = Date.now();
    const sent = await hub(
      "POST",
      `/api/projects/${project.id}/threads/${firstThread}/messages`,
      { body: "PROBE-SLOW-YOU: take your time." }
    );
    await until(
      "Caw's slow reply to you began",
      () => slowFrom["PROBE-SLOW-YOU"],
      (at) => at !== undefined && at >= before,
      180_000
    );
    await delay(2000);
    const off = await turn(project.id, false);
    const said = await until(
      "Caw's slow reply to you landed",
      () => cawSaid(firstThread),
      (bodies) => bodies.includes("PROBE-SLOW-YOU done"),
      90_000
    );
    check(
      "d: turning Caw off lets the turn your words started run to its end",
      sent.status === 200 &&
        off.status === 200 &&
        said.includes("PROBE-SLOW-YOU done"),
      `say: HTTP ${sent.status}; PATCH off: HTTP ${off.status}; Caw said ${JSON.stringify(said)}`
    );
  });

  // ── b: an attempt that ends while Caw is off does not wake him ─────────
  await section("b: an attempt's report with Caw off", async () => {
    await turn(project.id, true);
    const task = await fleet.api<{ id: string }>(
      `/api/projects/${project.id}/tasks`,
      { title: "PROBE-ATTEMPT-OFF: take a while." }
    );
    const started = await hub(
      "POST",
      `/api/projects/${project.id}/tasks/${task.id}/attempts`,
      {}
    );
    if (started.status !== 200) {
      throw new Error(`the off attempt: HTTP ${started.status} ${started.raw}`);
    }
    await until(
      "the off attempt running",
      () => itemOf(task.id),
      (item) => item?.state === "running",
      180_000
    );
    await turn(project.id, false);
    const offAt = Date.now();
    const ended = await until(
      "the off attempt ended",
      () => itemOf(task.id),
      (item) =>
        item !== undefined && !["starting", "running"].includes(item.state),
      180_000
    );
    await delay(10_000);
    const woke = cawRequests(offAt, "PROBE-ATTEMPT-OFF");
    check(
      "b: an attempt that ends while Caw is off does not wake him",
      started.status === 200 && woke.length === 0,
      `start: HTTP ${started.status}; item ${ended.state}; Caw requests with its report since off: ${woke.length}`
    );
  });

  // ── c: an attempt's report wakes him while he is on ────────────────────
  await section("c: an attempt's report with Caw on", async () => {
    await turn(project.id, true);
    const before = Date.now();
    const task = await fleet.api<{ id: string }>(
      `/api/projects/${project.id}/tasks`,
      { title: "PROBE-ATTEMPT-ON: finish at once." }
    );
    const started = await hub(
      "POST",
      `/api/projects/${project.id}/tasks/${task.id}/attempts`,
      {}
    );
    if (started.status !== 200) {
      throw new Error(`the on attempt: HTTP ${started.status} ${started.raw}`);
    }
    const woke = await until(
      "Caw woken by the on attempt's report",
      () => cawRequests(before, "PROBE-ATTEMPT-ON"),
      (requests) => requests.length > 0,
      180_000
    );
    check(
      "c: Caw on, an attempt's report wakes him",
      started.status === 200 && woke.length > 0,
      `start: HTTP ${started.status}; Caw requests with its report: ${woke.length}`
    );
  });

  // ── e: no machine for Caw ──────────────────────────────────────────────
  await section("e: no machine for Caw", async () => {
    await fleet.stop("agent");
    await until(
      "the agent offline",
      () => fleet.api<{ machineId: string; status: string }[]>("/api/agents"),
      (rows) =>
        !rows.some(
          (row) => row.machineId === MACHINE && row.status === "online"
        ),
      60_000
    );
    const refused = await hub("POST", `/api/projects/${project.id}/threads`, {
      body: "Anyone there?",
    });
    check(
      "e: with no machine for Caw, your words are refused with the problem's sentence",
      refused.status === 409 &&
        refused.raw.startsWith("No machine is online, so Caw can't start."),
      `HTTP ${refused.status}: ${refused.raw}`
    );
  });
} catch (error) {
  failed = true;
  console.error(
    `probe failed: ${error instanceof Error ? error.stack : String(error)}`
  );
  results.error = String(error);
} finally {
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

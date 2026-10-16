/**
 * Probe: you can always talk to a project's Caw, on or off; work your words
 * began is yours whoever carries it out, and off stops only his own (caw.ts,
 * work_items.origin, WORDS.md Caw on / Caw off). On a scratch fleet (real
 * hub, agent and sessiond on loopback, Claude Code against the mock model).
 *
 * a. Caw off: starting a thread is answered (not 409), his session starts,
 *    he answers in the thread, and his task_create makes a task.
 * b. Caw off: a lead routine is skipped, in the off state's words.
 * c. Caw on: a lead routine wakes him; his turn lists as running.
 * d. Off with his own event turn in flight: without a choice it is refused
 *    (409); `stop` cuts it (a `project.stop` frame for it); `finish` lets it
 *    end. A turn your words started runs to its end with no choice asked.
 * e. With no machine for him, your words are refused with the problem's
 *    sentence.
 * Needing delegate workspaces (a nested sandbox: run on a host, outside any
 * CawCo workspace):
 * f. Caw off: an attempt he starts at your ask is yours (origin `you`): its
 *    report wakes him. An attempt the dispatcher starts is his own (`event`):
 *    turned off with `finish`, it is kept, runs to its end, its end is noted
 *    in its thread, and he is not woken.
 * g. Caw on: both wake him.
 * h. Off with a delegate he started running: without a choice, 409; `stop`
 *    ends it (its item cancelled, a `project.stop` frame); `finish` (his own
 *    delegate, from an event) lets it complete, noted in his thread, no wake;
 *    a delegate your words began stays yours under `finish`, and its report
 *    reaches him and wakes him.
 * i. A turn your words began is stored (lead_turns) as yours and under way,
 *    is read back after the hub restarts mid-turn, and is cleared at its end;
 *    with workspaces, the delegate he starts after the restart is yours.
 * j. A question from a session under him wakes him on no thread: none reads
 *    working, and his view says what he answers.
 *
 * Run from the repo root, on a host (f to h need workspaces):
 *   bun scripts/probe-caw-off.ts [--keep]
 * Inside a CawCo workspace, where no nested workspace can start, `--no-workspaces`
 * runs a to e, i and j, and reports f to h skipped. `--only a,f` runs just
 * the sections with those letters.
 */
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readWithin } from "../packages/core/src/bounded";
import { ensureDeps } from "./lib/deps";
import type { Reply, Seen } from "./scratch-fleet";

// The dependencies first (lib/deps.ts): the fleet loads after them.
await ensureDeps();
const { delay, MACHINE, scratchFleet, until, untilGone } =
  await import("./scratch-fleet");

const keep = process.argv.includes("--keep");
const LOGGED = /\[caw\]|\[dispatch\]|work-items|routines|error/i;
const CAW = "You are Caw";
const TASK_CREATE = "mcp__cawco__task_create";
const TASK_START = "mcp__cawco__task_start";
const DELEGATE = "mcp__cawco__delegate";
const REPLY = "mcp__cawco__thread_reply";
const FINISH = "mcp__cawco__finish_item";
const THREAD_ID = /thread ([0-9a-f-]{36})/g;
/** Where an event Caw reads begins, in his conversation. */
const EVENT_START =
  /You started a thread|You wrote in the thread|Routine “|The attempt at/g;
const OFF_REASON = "Caw is off, so only your words wake him";
/** Your ask that Caw start an attempt at a task: `PROBE-CAW-START tsk-4`. */
const START_ASK = /PROBE-CAW-START (tsk-\d+)/;
/** Your ask (or a routine's) that Caw delegate: `PROBE-CAW-DELEGATE-STOP`. */
const DELEGATE_ASK = /PROBE-CAW-DELEGATE-(STOP|FINISH|YOURS)/;
/** A worker's brief: an attempt's task title, or Caw's delegate's prompt. */
const WORKER_TAG = /PROBE-(?:ATTEMPT|DELEGATE)-([A-Z]+)/;
/** How long each worker sleeps before it finishes, by tag; absent: none. */
const SLEEPS: Record<string, number> = {
  DISPATCH: 25,
  STOP: 120,
  FINISH: 25,
  YOURS: 25,
};

const results: Record<string, string> = {};
let failed = false;
const check = (name: string, ok: boolean, detail: string) => {
  failed ||= !ok;
  results[name] = `${ok ? "PASS" : "FAIL"} — ${detail}`;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
};
/**
 * `--only a,f`: run just the sections with those letters (a sets the
 * project's first thread up, so keep it).
 */
const onlyAt = process.argv.indexOf("--only");
const only =
  onlyAt === -1
    ? undefined
    : new Set((process.argv[onlyAt + 1] ?? "").split(","));
const section = async (name: string, body: () => Promise<void>) => {
  if (only && !only.has(name.charAt(0))) {
    console.log(`SKIP ${name}: --only`);
    return;
  }
  try {
    await body();
  } catch (error) {
    check(name, false, error instanceof Error ? error.message : String(error));
  }
};
/** f to h start delegate workspaces: `--no-workspaces` skips them where none can start. */
const workspaces = !process.argv.includes("--no-workspaces");
const workspaceSection = (name: string, body: () => Promise<void>) => {
  if (workspaces) {
    return section(name, body);
  }
  results[name] = "SKIPPED — --no-workspaces";
  console.log(`SKIP ${name}: --no-workspaces`);
  return Promise.resolve();
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
/** The one-shot calls Caw has made, by what asked for them: each is made once. */
const made = new Set<string>();
/** What each one-shot call answered, by its key. */
const answers: Record<string, string> = {};

/**
 * One call made once for `key`: loaded first when deferred, then done.
 * `everyMs` paces its stream: a slow call keeps the turn going.
 */
const once = (
  request: Seen,
  key: string,
  name: string,
  input: object,
  everyMs = 5
) => {
  if (made.has(key)) {
    // The call's answer, as its tool result came back: a failure says why.
    answers[key] ??= request.last.slice(0, 600);
    return text("ok");
  }
  const reply = call(request, name, input, everyMs);
  if (reply.tool?.name === name) {
    made.add(key);
    slowFrom[key] = Date.now();
  }
  return reply;
};

/** The question a session under Caw asks him (j). */
const QUESTION = "PROBE-WHICH-WAY: left or right?";

/** Caw's side: what he does for the event his conversation ends with. */
const caw = (request: Seen): Reply => {
  // A question from a session under him (j): a turn no thread woke, kept
  // going for forty seconds.
  if (request.last.includes("PROBE-WHICH-WAY")) {
    slowFrom.question ??= Date.now();
    return { everyMs: 2000, words: Array.from({ length: 20 }, () => "… ") };
  }
  const starts = [...request.all.matchAll(EVENT_START)];
  const event = request.all.slice(starts.at(-1)?.index ?? 0);
  const thread = [...event.matchAll(THREAD_ID)][0]?.[1] ?? "";
  // Each tool's answer since the event: the step it is on.
  const replied = event.includes('"ok":true');
  const start = START_ASK.exec(event);
  if (start?.[1]) {
    return once(request, `start ${start[1]}`, TASK_START, { id: start[1] });
  }
  // Your ask (i): a delegate call streamed over ~50 s, so the hub can restart
  // while the turn your words began is under way, and the item it starts
  // is filed after.
  if (event.includes("PROBE-RESTART-DELEGATE")) {
    return once(
      request,
      "restart",
      DELEGATE,
      {
        title: "Probe delegate restart",
        prompt: "PROBE-DELEGATE-RESTART: finish.",
        lands: "none",
      },
      8000
    );
  }
  const delegate = DELEGATE_ASK.exec(event)?.[1];
  if (delegate) {
    return once(request, `delegate ${delegate}`, DELEGATE, {
      title: `Probe delegate ${delegate.toLowerCase()}`,
      prompt: `PROBE-DELEGATE-${delegate}: wait, then finish.`,
      lands: "none",
    });
  }
  // The slow asks before the task: a later message in the first thread
  // carries that thread's title, PROBE-TASK's words.
  for (const marker of [
    "PROBE-SLOW-YOU",
    "PROBE-SLOW-FINISH",
    "PROBE-SLOW-EVENT",
  ]) {
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

/**
 * A worker (an attempt's session, or Caw's delegate): sleeps first when its
 * tag says so; an attempt then finishes blocked, a delegate with its summary.
 */
const worker = (request: Seen, tag: string): Reply => {
  if (
    request.last.includes("The item") ||
    request.last.includes("checks passed")
  ) {
    return text("done");
  }
  const seconds = SLEEPS[tag];
  if (seconds && !request.all.includes(`SLEPT-${tag}`)) {
    return tool("Bash", {
      command: `sleep ${seconds} && echo SLEPT-${tag}`,
      description: "Take a while",
      timeout: (seconds + 30) * 1000,
    });
  }
  return call(
    request,
    FINISH,
    request.all.includes("PROBE-DELEGATE-")
      ? {
          headline: `Probe delegate ${tag} done`,
          summary: `Probe delegate ${tag} done`,
        }
      : {
          headline: "Probe attempt",
          summary: "Probe attempt",
          blocked: { command: "probe", error: "the probe blocks it" },
        }
  );
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (request.all.includes(CAW)) {
    return caw(request);
  }
  // A session under Caw (j): it asks him its question, once.
  if (request.all.includes("PROBE-ASK-CAW")) {
    return once(request, "ask", "AskUserQuestion", {
      questions: [
        {
          question: QUESTION,
          header: "Way",
          multiSelect: false,
          options: [
            { label: "Left", description: "Go left." },
            { label: "Right", description: "Go right." },
          ],
        },
      ],
    });
  }
  const tag = WORKER_TAG.exec(request.all)?.[1];
  return tag ? worker(request, tag) : text("ok");
};

const fleet = await scratchFleet({ name: "probe-caw-off", respond });
const home = fleet.env.HOME as string;

/** A request to the hub, answered with its status and body. */
const hub = async (method: string, path: string, body?: unknown) => {
  const read = await readWithin(300_000, async (signal) => {
    const response = await fetch(`${fleet.base}${path}`, {
      method,
      ...(body === undefined
        ? {}
        : {
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }),
      signal,
    });
    return { status: response.status, raw: await response.text() };
  });
  switch (read.kind) {
    case "answered": {
      const { status, raw } = read.value;
      let json: unknown = raw;
      try {
        json = JSON.parse(raw);
      } catch {
        // a sentence
      }
      return { status, body: json, raw };
    }
    case "unanswered":
      throw new Error(
        `${method} ${path}: the hub did not answer within ${read.after} ms (${read.reason})`
      );
    default: {
      const unhandled: never = read;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
};
const turn = (projectId: string, on: boolean, initiated?: "finish" | "stop") =>
  hub("PATCH", `/api/projects/${projectId}/caw`, {
    on,
    ...(initiated ? { initiated } : {}),
  });
interface Running {
  id: string;
  kind: string;
  taskId: string | null;
}
const cawView = async (projectId: string) =>
  (await hub("GET", `/api/projects/${projectId}/caw`)).body as {
    answering: string | null;
    on: boolean;
    running: Running[];
  };
/** The stored turn a lead session is in (lead_turns), or undefined. */
const leadTurn = (instanceId: string) =>
  fleet.query<{
    origin: string;
    started: number;
    thread_id: string | null;
    what: string | null;
  }>(
    "SELECT origin, started, thread_id, what FROM lead_turns WHERE instance_id = ?",
    instanceId
  )[0];
const cawSaid = (threadId: string) =>
  fleet
    .query<{ body: string }>(
      "SELECT body FROM thread_messages WHERE thread_id = ? AND author = 'caw' ORDER BY created_at",
      threadId
    )
    .map((row) => row.body);
const notes = (projectId: string, words: string) =>
  fleet.query<{ note_title: string }>(
    "SELECT m.note_title FROM thread_messages m JOIN project_threads t ON t.id = m.thread_id WHERE t.project_id = ? AND m.author = 'event' AND m.note_title LIKE ?",
    projectId,
    `%${words}%`
  );
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
interface ItemRow {
  id: string;
  instance_id: string;
  origin: string;
  state: string;
}
const itemOf = (taskId: string) =>
  fleet.query<ItemRow>(
    "SELECT id, instance_id, origin, state FROM work_items WHERE task_id = ? ORDER BY created_at DESC",
    taskId
  )[0];
const itemTitled = (title: string) =>
  fleet.query<ItemRow>(
    "SELECT id, instance_id, origin, state FROM work_items WHERE title = ? ORDER BY created_at DESC",
    title
  )[0];
const live = (item: ItemRow | undefined) => item?.state === "running";
const over = (item: ItemRow | undefined) =>
  item !== undefined && !["starting", "running"].includes(item.state);

/** Every `project.stop` frame a dashboard hears, as raw text. */
const stopFrames: string[] = [];

try {
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const listener = new WebSocket(
    `${fleet.base.replace("http", "ws")}/ws/dashboard`
  );
  listener.onmessage = (message) => {
    const raw = String(message.data);
    if (raw.includes("project.stop")) {
      stopFrames.push(raw);
    }
  };

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
  const newTask = (title: string) =>
    fleet.api<{ id: string }>(`/api/projects/${project.id}/tasks`, { title });
  const routine = (name: string, prompt: string) =>
    fleet.api<{ id: string }>("/api/routines", {
      projectId: project.id,
      timeZone: "UTC",
      target: "lead",
      name,
      cron: "0 0 1 1 *",
      prompt,
    });
  /** Your words in the first thread. */
  let firstThread = "";
  const say = (body: string) =>
    hub("POST", `/api/projects/${project.id}/threads/${firstThread}/messages`, {
      body,
    });
  /** Caw's session has no turn in flight. */
  /**
   * Caw's session is between turns: the hub holds no turn for him
   * (lead_turns, cleared at a turn's idle). Not his view's `running`, which
   * leaves out a turn your words began: a wake sent then would join its tail
   * and be yours.
   */
  const cawIdle = () =>
    untilGone(
      "Caw at rest",
      () => leadTurn(lead()?.lead_instance_id ?? ""),
      120_000
    );

  // ── a: Caw off, you start a thread ─────────────────────────────────────
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
    const task = tasks.tasks.find(
      (each) => each.title === "Probe task from Caw"
    );
    check(
      "a: he answered in the thread, and his task_create made a task",
      said.includes("Made it") && Boolean(task),
      `said ${JSON.stringify(said)}; task ${task?.id ?? "none"}`
    );
    // Off the board, so the dispatcher (f) starts only what it is given.
    if (task) {
      await hub(
        "POST",
        `/api/projects/${project.id}/tasks/${task.id}/archive`,
        {}
      );
    }
  });

  // ── b: Caw off, a lead routine is skipped ──────────────────────────────
  await section("b: a lead routine with Caw off", async () => {
    const before = Date.now();
    const offBrief = await routine(
      "Off brief",
      "PROBE-ROUTINE-OFF: brief the board."
    );
    const [run] = await until(
      "the off routine's test run decided",
      () => runsOf(offBrief.id),
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

  // ── c, d: Caw on, a lead routine wakes him; off asks, then stop cuts ────
  await section("c/d: an event's turn, then off with stop", async () => {
    const on = await turn(project.id, true);
    const before = Date.now();
    await routine("Slow event", "PROBE-SLOW-EVENT: brief the board.");
    await until(
      "Caw's slow reply to the routine began",
      () => slowFrom["PROBE-SLOW-EVENT"],
      (at) => at !== undefined && at >= before,
      180_000
    );
    await delay(2000);
    const view = await cawView(project.id);
    const leadNow = lead()?.lead_instance_id ?? "";
    check(
      "c: Caw on, a lead routine wakes him, and his turn lists as running",
      on.status === 200 &&
        view.running.some((one) => one.kind === "turn" && one.id === leadNow),
      `PATCH on: HTTP ${on.status}; running ${JSON.stringify(view.running)}`
    );
    const blind = await turn(project.id, false);
    check(
      "d: off without a choice while his event turn runs is refused",
      blind.status === 409 && blind.raw.includes("still running"),
      `HTTP ${blind.status}: ${blind.raw}`
    );
    const off = await turn(project.id, false, "stop");
    await delay(25_000);
    const log = await fleet.logs("hub");
    const eventThread = fleet.query<{ thread_id: string }>(
      "SELECT thread_id FROM routines WHERE name = 'Slow event'"
    )[0]?.thread_id;
    const said = eventThread ? cawSaid(eventThread) : [];
    const leadId = lead()?.lead_instance_id ?? "";
    check(
      "d: off with `stop` cuts the turn an event started, and says so as it stops",
      off.status === 200 &&
        !said.includes("PROBE-SLOW-EVENT done") &&
        log.includes("cut the turn an event started") &&
        stopFrames.some((frame) => frame.includes(leadId)) &&
        Boolean(leadId),
      `PATCH off: HTTP ${off.status}; Caw said ${JSON.stringify(said)}; cut logged ${log.includes("cut the turn an event started")}; stop frame ${stopFrames.some((frame) => frame.includes(leadId))}; lead kept ${leadId}`
    );
  });

  // ── d: off with `finish` lets his event turn end ───────────────────────
  await section("d: an event's turn, then off with finish", async () => {
    await turn(project.id, true);
    const before = Date.now();
    await routine("Slow finish", "PROBE-SLOW-FINISH: brief the board.");
    await until(
      "Caw's slow reply to the second routine began",
      () => slowFrom["PROBE-SLOW-FINISH"],
      (at) => at !== undefined && at >= before,
      180_000
    );
    await delay(2000);
    const off = await turn(project.id, false, "finish");
    const thread = fleet.query<{ thread_id: string }>(
      "SELECT thread_id FROM routines WHERE name = 'Slow finish'"
    )[0]?.thread_id;
    const said = await until(
      "Caw's reply to the second routine landed",
      () => (thread ? cawSaid(thread) : []),
      (bodies) => bodies.includes("PROBE-SLOW-FINISH done"),
      90_000
    );
    check(
      "d: off with `finish` lets the turn an event started run to its end",
      off.status === 200 && said.includes("PROBE-SLOW-FINISH done"),
      `PATCH off: HTTP ${off.status}; Caw said ${JSON.stringify(said)}`
    );
  });

  // ── d: your turn runs to its end, and off asks nothing ─────────────────
  await section("d: your turn, then off", async () => {
    await turn(project.id, true);
    // The kept turn before this one ends first: your words open a turn of
    // their own rather than joining its tail.
    await cawIdle();
    const before = Date.now();
    const sent = await say("PROBE-SLOW-YOU: take your time.");
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
      "d: off with your turn in flight asks nothing, and your turn runs to its end",
      sent.status === 200 &&
        off.status === 200 &&
        said.includes("PROBE-SLOW-YOU done"),
      `say: HTTP ${sent.status}; PATCH off: HTTP ${off.status}; Caw said ${JSON.stringify(said)}`
    );
  });

  // ── f: Caw off, an attempt he starts at your ask is yours ──────────────
  await workspaceSection("f: your attempt, Caw off", async () => {
    await cawIdle();
    const task = await newTask("PROBE-ATTEMPT-ASK: finish at once.");
    const before = Date.now();
    await say(`PROBE-CAW-START ${task.id}`);
    const item = await until(
      "the attempt Caw started at your ask",
      () => itemOf(task.id),
      Boolean,
      180_000
    ).catch((error: unknown) => {
      // What task_start answered him: the start's own refusal, or nothing.
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}; task_start ${made.has(`start ${task.id}`) ? `answered: ${answers[`start ${task.id}`] ?? "(no answer yet)"}` : "was never called"}`
      );
    });
    // A report reads "[Work item <id> is …]": his request with it is its wake.
    const woke = await until(
      "Caw woken by its report",
      () => cawRequests(before, `Work item ${item.id}`),
      (requests) => requests.length > 0,
      240_000
    );
    check(
      "f: Caw off, an attempt he starts at your ask is yours, and its report wakes him",
      lead()?.caw === 0 && item.origin === "you" && woke.length > 0,
      `caw ${lead()?.caw}; origin ${item.origin}; Caw requests with its report: ${woke.length}`
    );
  });

  // ── f: an attempt the dispatcher starts is his own; finish keeps it ─────
  await workspaceSection(
    "f: the dispatcher's attempt, then off with finish",
    async () => {
      await turn(project.id, true);
      const task = await newTask("PROBE-ATTEMPT-DISPATCH: take a while.");
      await hub("PATCH", `/api/projects/${project.id}/dispatch`, {
        dispatch: true,
      });
      const item = await until(
        "the dispatcher's attempt running",
        () => itemOf(task.id),
        live,
        180_000
      );
      await hub("PATCH", `/api/projects/${project.id}/dispatch`, {
        dispatch: false,
      });
      await cawIdle();
      const blind = await turn(project.id, false);
      const off = await turn(project.id, false, "finish");
      const offAt = Date.now();
      const kept = itemOf(task.id);
      const ended = await until(
        "the dispatcher's attempt ended",
        () => itemOf(task.id),
        over,
        180_000
      );
      await delay(10_000);
      const woke = cawRequests(offAt, `Work item ${item.id}`);
      const noted = notes(project.id, `Attempt · ${task.id}`);
      check(
        "f: the dispatcher's attempt is his own; off asks, `finish` keeps it, it ends noted and wakes nobody",
        item.origin === "event" &&
          blind.status === 409 &&
          off.status === 200 &&
          kept?.origin === "kept" &&
          woke.length === 0 &&
          noted.length > 0,
        `origin ${item.origin} → ${kept?.origin}; blind off HTTP ${blind.status}; off HTTP ${off.status}; item ${ended.state}; Caw requests since off ${woke.length}; notes ${JSON.stringify(noted)}`
      );
    }
  );

  // ── g: Caw on, both wake him ───────────────────────────────────────────
  await workspaceSection("g: Caw on, both attempts wake him", async () => {
    await turn(project.id, true);
    await cawIdle();
    const yours = await newTask("PROBE-ATTEMPT-ASKON: finish at once.");
    const before = Date.now();
    await say(`PROBE-CAW-START ${yours.id}`);
    const yourItem = await until(
      "your attempt",
      () => itemOf(yours.id),
      Boolean,
      180_000
    );
    const woke = await until(
      "Caw woken by your attempt's report",
      () => cawRequests(before, `Work item ${yourItem.id}`),
      (requests) => requests.length > 0,
      240_000
    );
    await cawIdle();
    const his = await newTask("PROBE-ATTEMPT-DISPATCHON: finish at once.");
    const dispatchedAt = Date.now();
    await hub("PATCH", `/api/projects/${project.id}/dispatch`, {
      dispatch: true,
    });
    const item = await until(
      "the dispatcher's second attempt",
      () => itemOf(his.id),
      Boolean,
      180_000
    );
    await hub("PATCH", `/api/projects/${project.id}/dispatch`, {
      dispatch: false,
    });
    const wokeToo = await until(
      "Caw woken by the dispatcher's attempt",
      () => cawRequests(dispatchedAt, `Work item ${item.id}`),
      (requests) => requests.length > 0,
      240_000
    );
    check(
      "g: Caw on, your attempt's report and the dispatcher's both wake him",
      woke.length > 0 && item.origin === "event" && wokeToo.length > 0,
      `yours: ${woke.length}; dispatcher's (${item.origin}): ${wokeToo.length}`
    );
  });

  // ── h: off with a delegate he started, `stop` ───────────────────────────
  await workspaceSection("h: Caw's delegate, then off with stop", async () => {
    await turn(project.id, true);
    await cawIdle();
    await say("PROBE-CAW-DELEGATE-STOP");
    const item = await until(
      "Caw's delegate running",
      () => itemTitled("Probe delegate stop"),
      live,
      180_000
    );
    await cawIdle();
    const view = await cawView(project.id);
    const blind = await turn(project.id, false);
    const off = await turn(project.id, false, "stop");
    const stopped = await until(
      "Caw's delegate cancelled",
      () => itemTitled("Probe delegate stop"),
      over,
      120_000
    );
    await until(
      "its stop frame",
      () => stopFrames.some((frame) => frame.includes(item.instance_id)),
      Boolean,
      60_000
    );
    check(
      "h: off with his delegate running asks; `stop` ends it, cancelled, its row confirmed",
      view.running.some(
        (one) => one.id === item.instance_id && one.kind === "delegate"
      ) &&
        blind.status === 409 &&
        off.status === 200 &&
        stopped.state === "cancelled",
      `listed ${view.running.map((one) => `${one.kind} ${one.id}`).join(", ")}; blind off HTTP ${blind.status}; off HTTP ${off.status}; item ${stopped.state}`
    );
  });

  // ── h: off with his own delegate (an event's), `finish` ────────────────
  await workspaceSection(
    "h: Caw's own delegate, then off with finish",
    async () => {
      await turn(project.id, true);
      await cawIdle();
      await routine(
        "Delegate finish",
        "PROBE-CAW-DELEGATE-FINISH: delegate it."
      );
      const item = await until(
        "Caw's own delegate running",
        () => itemTitled("Probe delegate finish"),
        live,
        180_000
      );
      await cawIdle();
      const off = await turn(project.id, false, "finish");
      const offAt = Date.now();
      const ended = await until(
        "Caw's own delegate ended",
        () => itemTitled("Probe delegate finish"),
        over,
        180_000
      );
      await delay(10_000);
      const woke = cawRequests(offAt, `Work item ${item.id}`);
      const noted = notes(project.id, "Delegate · Probe delegate finish");
      check(
        "h: `finish` lets his own delegate complete; its end is noted, and he is not woken",
        item.origin === "event" &&
          off.status === 200 &&
          ended.state === "done" &&
          ended.origin === "kept" &&
          woke.length === 0 &&
          noted.length > 0,
        `origin ${item.origin} → ${ended.origin}; off HTTP ${off.status}; item ${ended.state}; Caw requests since off ${woke.length}; notes ${JSON.stringify(noted)}`
      );
    }
  );

  // ── h: off with your delegate (your words began it), `finish` ──────────
  await workspaceSection("h: your delegate, then off with finish", async () => {
    await turn(project.id, true);
    await cawIdle();
    await say("PROBE-CAW-DELEGATE-YOURS");
    const item = await until(
      "your delegate running",
      () => itemTitled("Probe delegate yours"),
      live,
      180_000
    );
    await cawIdle();
    const off = await turn(project.id, false, "finish");
    const offAt = Date.now();
    const ended = await until(
      "your delegate ended",
      () => itemTitled("Probe delegate yours"),
      over,
      180_000
    );
    const woke = await until(
      "Caw woken by its report",
      () => cawRequests(offAt, `Work item ${item.id}`),
      (requests) => requests.length > 0,
      120_000
    );
    check(
      "h: your delegate is yours under `finish` too: off, its report reaches him and wakes him",
      item.origin === "you" &&
        off.status === 200 &&
        ended.origin === "you" &&
        lead()?.caw === 0 &&
        woke.length > 0,
      `origin ${item.origin} → ${ended.origin}; off HTTP ${off.status}; item ${ended.state}; caw ${lead()?.caw}; Caw requests with its report ${woke.length}`
    );
  });

  // ── i: the turn your words began outlives a hub restart ─────────────────
  await section("i: a turn's origin outlives a hub restart", async () => {
    await cawIdle();
    const leadId = lead()?.lead_instance_id ?? "";
    const before = Date.now();
    await say("PROBE-RESTART-DELEGATE: start a delegate.");
    await until(
      "his slow delegate call began",
      () => slowFrom.restart,
      (at) => at !== undefined && at >= before,
      180_000
    );
    const stored = await until(
      "his turn stored as under way",
      () => leadTurn(leadId),
      (row) => row?.started === 1,
      30_000
    );
    await fleet.stop("hub");
    fleet.launch("hub");
    await fleet.hubUp();
    const after = leadTurn(leadId);
    // Where workspaces start, the delegate he files after the restart.
    const item = workspaces
      ? await until(
          "the delegate he started after the restart",
          () => itemTitled("Probe delegate restart"),
          Boolean,
          180_000
        )
      : undefined;
    await untilGone(
      "his turn cleared at the idle after it",
      () => leadTurn(leadId),
      180_000
    );
    check(
      `i: his turn is stored as yours, read back after a hub restart, and cleared at its end${workspaces ? "; the delegate he starts after the restart is yours" : ""}`,
      stored.origin === "you" &&
        after?.origin === "you" &&
        after.started === 1 &&
        (!workspaces || item?.origin === "you"),
      `before ${JSON.stringify(stored)}; after ${JSON.stringify(after)}; item ${item ? item.origin : "(no workspaces: not filed)"}`
    );
  });

  // ── j: a question from a session under him: no thread is working ───────
  await section(
    "j: a turn no thread woke marks no thread working",
    async () => {
      await cawIdle();
      const leadId = lead()?.lead_instance_id ?? "";
      const asker = await fleet.spawn("claude", "Asker", src, {
        projectId: project.id,
        parent: { instanceId: leadId },
      });
      const before = Date.now();
      await fleet.send(asker, "PROBE-ASK-CAW: ask Caw.");
      await until(
        "Caw answering the question",
        () => slowFrom.question,
        (at) => at !== undefined && at >= before,
        180_000
      );
      await delay(3000);
      const stored = leadTurn(leadId);
      const threads = await fleet.api<{ status: string; title: string }[]>(
        `/api/projects/${project.id}/threads`
      );
      const view = await cawView(project.id);
      check(
        "j: a question wakes him on no thread: none reads working, and his panel says what he answers",
        stored !== undefined &&
          stored.thread_id === null &&
          (stored.what ?? "").startsWith("a question from") &&
          !threads.some((each) => each.status === "working") &&
          (view.answering ?? "").startsWith("Answering a question from"),
        `stored ${JSON.stringify(stored)}; threads ${threads.map((each) => `${each.title}: ${each.status}`).join(", ")}; answering “${view.answering}”`
      );
    }
  );

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
  listener.close();
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

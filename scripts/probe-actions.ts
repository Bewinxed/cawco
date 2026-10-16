/**
 * Probe: approved actions (Projects spec §5.5, P3) on a scratch fleet (real
 * hub, agent and sessiond on loopback, real Claude Code against a mock
 * model). The invariant, P3's done-criterion "an approved post runs once at
 * its time": the hub calls exactly the approved call (the same connection,
 * tool and arguments, byte for byte) at most once, at or after its time,
 * never before approval, and never through a model.
 *
 * A test MCP server runs in this process: one tool, `post`, that records
 * every call (its arguments as received, its `_meta`, when it came), and
 * can hold a call unanswered. A Claude Code session in the project proposes
 * through `action_propose`, as the mock model tells it to.
 *
 * 1. A post proposed for now+90s: nothing runs while it waits; approved, it
 *    runs once at its time (within the scheduler's wake), with the exact
 *    arguments and the idempotency key in `_meta`; done, its result kept.
 * 2. A hub restart before its time: it runs once, after the restart, at its time.
 * 3. A kill mid-call (the server holds the call; the hub is SIGKILLed):
 *    after the restart it is unknown, waiting on you, and never called again;
 *    "checked" puts it away.
 * 4. Denied and cancelled actions never run.
 * 5. An approval naming another arguments' hash is refused; the action
 *    stays proposed.
 * 6. then_stage: the done post moves its task to `posted` (by: action); the
 *    route's and a session's direct move to `posted` are refused.
 * 7. A post the service refuses (once): failed, with the service's words,
 *    waiting on you with a push; "checked" puts it away; never called again.
 * 8. The project's Caw writes a task file through folder_write, once with
 *    `stage: posted` (a `by: action` stage) and once with an ordinary
 *    stage: neither moves the task; the file gets its stage back with a
 *    note naming Caw.
 * 9. Caw writes a new task file straight into `posted`: it starts in the
 *    first stage, with a note naming Caw. Then the hub's whole task index is
 *    rebuilt from the folder: every task the hub made keeps its stage (the
 *    one an approved action moved to posted included), its file untouched.
 *
 * Run from the repo root:
 *   bun scripts/probe-actions.ts [--keep]
 */
import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { ensureDeps } from "./lib/deps";
import type { Reply, Seen } from "./scratch-fleet";

// The dependencies first (lib/deps.ts): the fleet loads after them.
await ensureDeps();
const { MACHINE, scratchFleet, until } = await import("./scratch-fleet");

const keep = process.argv.includes("--keep");
const PROPOSE = "mcp__cawco__action_propose";
const MOVE = "mcp__cawco__task_update";
const LOGGED = /actions|tasks|push|caw|error/i;
const STAGE_LINE = /^stage: .*$/m;
/** The scheduler wakes at an action's time; this is the slack a busy machine gets. */
const WAKE_SLACK_MS = 3000;

const results: Record<string, string> = {};
let failed = false;
const check = (name: string, passed: boolean, detail: string) => {
  failed ||= !passed;
  results[name] = `${passed ? "PASS" : "FAIL"} — ${detail}`;
  console.log(`${passed ? "PASS" : "FAIL"} ${name}: ${detail}`);
};
const section = async (name: string, body: () => Promise<void>) => {
  try {
    await body();
  } catch (error) {
    check(name, false, error instanceof Error ? error.message : String(error));
  }
};
const sha256 = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");

// ── The test MCP server: `post` records each call, and can hold one ─────────
interface Call {
  args: string;
  at: number;
  meta: Record<string, unknown> | undefined;
}
const calls: Call[] = [];
let holding = false;
/** The next call is answered as the service refusing it. */
let refuseNext = false;
let releaseHeld: (() => void) | undefined;
const rpc = (id: unknown, result: unknown) =>
  Response.json({ jsonrpc: "2.0", id, result });
const mcp = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  idleTimeout: 0,
  async fetch(request) {
    if (request.method !== "POST") {
      return new Response(null, { status: 405 });
    }
    const message = (await request.json()) as {
      id?: unknown;
      method?: string;
      params?: {
        _meta?: Record<string, unknown>;
        arguments?: unknown;
        name?: string;
      };
    };
    if (message.id === undefined) {
      return new Response(null, { status: 202 });
    }
    switch (message.method) {
      case "initialize":
        return rpc(message.id, {
          protocolVersion: "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "probe-poster", version: "1" },
        });
      case "tools/list":
        return rpc(message.id, {
          tools: [
            {
              name: "post",
              description: "Posts a message.",
              inputSchema: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  tags: { type: "array", items: { type: "string" } },
                },
                required: ["text"],
              },
            },
          ],
        });
      case "tools/call": {
        calls.push({
          at: Date.now(),
          args: JSON.stringify(message.params?.arguments),
          meta: message.params?._meta,
        });
        if (holding) {
          await new Promise<void>((done) => {
            releaseHeld = done;
          });
        }
        if (refuseNext) {
          refuseNext = false;
          return rpc(message.id, {
            isError: true,
            content: [{ type: "text", text: "rate limited: try in an hour" }],
          });
        }
        return rpc(message.id, {
          content: [{ type: "text", text: `posted #${calls.length}` }],
        });
      }
      default:
        return Response.json({
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32_601, message: "no such method" },
        });
    }
  },
});

// ── The mock model: each PROBE-<verb>:<n> message is one tool call ──────────
/** What each numbered message asks the session to propose or do. */
const asks = new Map<string, { input: object; name: string }>();
/** Which numbered messages the session already called its tool for. */
const issued = new Set<string>();
/** What each numbered message's tool answered: the next request's last user text. */
const answered = new Map<string, string>();
const COMMAND = /PROBE-CALL:(\d+)/g;
const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
  }
  const marker = [...request.all.matchAll(COMMAND)].at(-1)?.[1];
  const ask = marker ? asks.get(marker) : undefined;
  if (!(marker && ask)) {
    return text("ok");
  }
  if (issued.has(marker)) {
    if (!answered.has(marker)) {
      answered.set(marker, request.last);
    }
    return text("done");
  }
  if (request.toolNames.includes(ask.name)) {
    issued.add(marker);
    return { everyMs: 5, words: [], tool: ask };
  }
  return request.toolNames.includes("ToolSearch")
    ? {
        everyMs: 5,
        words: [],
        tool: {
          name: "ToolSearch",
          input: { query: `select:${ask.name}`, max_results: 1 },
        },
      }
    : text(`${ask.name} is not offered`);
};

// ── The run ──────────────────────────────────────────────────────────────────
interface ActionRow {
  approved_at: number | null;
  args: string;
  args_hash: string;
  ended_at: number | null;
  error: string | null;
  id: string;
  idempotency_key: string;
  result: string | null;
  run_at: number | null;
  stage_result: string | null;
  started_at: number | null;
  state: string;
}

const fleet = await scratchFleet({ name: "probe-actions", respond });
const send = async (method: string, path: string, body?: unknown) => {
  const response = await fetch(`${fleet.base}${path}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  return { status: response.status, text: await response.text() };
};
const ok = async <T>(method: string, path: string, body?: unknown) => {
  const answer = await send(method, path, body);
  if (answer.status >= 400) {
    throw new Error(`${method} ${path}: ${answer.status} ${answer.text}`);
  }
  return JSON.parse(answer.text) as T;
};
const rowOf = (id: string) =>
  fleet.query<ActionRow>("SELECT * FROM actions WHERE id = ?", id)[0];
const callsFor = (key: string) =>
  calls.filter((one) => one.meta?.["dev.cawco/idempotency-key"] === key);

let session = "";
let sent = 0;
/**
 * One tool call by the session (`via` sends the message: the session's own
 * composer, or a thread to the project's Caw); answers what it said back.
 */
const toolCall = async (
  name: string,
  input: object,
  via: (text: string) => Promise<unknown> = (text) => fleet.send(session, text)
): Promise<string> => {
  sent += 1;
  const marker = String(sent);
  asks.set(marker, { name, input });
  await via(`PROBE-CALL:${marker}`);
  return await until(
    `the ${name} call (${marker})`,
    () => answered.get(marker),
    Boolean,
    180_000
  );
};
const sessionCalls = (name: string, input: object) => toolCall(name, input);
/** A proposal by the session; answers the row it filed. */
const propose = async (input: object): Promise<ActionRow> => {
  const before = new Set(
    fleet
      .query<{ id: string }>("SELECT id FROM actions")
      .map((filed) => filed.id)
  );
  const said = await sessionCalls(PROPOSE, input);
  const row = fleet
    .query<ActionRow>("SELECT * FROM actions ORDER BY created_at")
    .find((one) => !before.has(one.id));
  if (!row) {
    throw new Error(`no action was filed; the tool answered: ${said}`);
  }
  return row;
};
const approve = (row: ActionRow) =>
  ok("POST", `/api/actions/${row.id}/approve`, { argsHash: row.args_hash });
const restartHub = async (signal: "SIGTERM" | "SIGKILL" = "SIGTERM") => {
  await fleet.stop("hub", signal);
  fleet.launch("hub");
  await fleet.hubUp();
};

try {
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Posts",
    machineId: MACHINE,
    cwd: fleet.repo,
    caw: false,
  });
  const projectId = project.id;
  await ok("POST", `/api/projects/${projectId}/stages/template`, {
    template: "social",
  });
  const task = await ok<{ id: string; stage: string }>(
    "POST",
    `/api/projects/${projectId}/tasks`,
    { title: "Launch post", stage: "scheduled" }
  );
  await ok("POST", "/api/connections", {
    name: "x-probe",
    service: "x",
    account: "@probe",
    transport: "http",
    url: `http://127.0.0.1:${mcp.port}/mcp`,
    auth: "none",
    projects: [projectId],
  });
  session = await fleet.spawn("claude", "Poster", fleet.repo, { projectId });

  // ── 1 and 6: a post at now+90s, approved; it moves its task ───────────────
  const first = { text: "Hello from the probe 🚀", tags: ["launch", "p3"] };
  const runAt = Date.now() + 90_000;
  let launchPost: ActionRow | undefined;
  await section("1: an approved post runs once at its time", async () => {
    launchPost = await propose({
      connection: "x-probe",
      tool: "post",
      args: first,
      run_at: new Date(runAt).toISOString(),
      reason: "The launch post, at its slot.",
      task: task.id,
      then_stage: "posted",
    });
    const proposed = launchPost;
    check(
      "1: the session's proposal is filed proposed, with the arguments as given",
      proposed.state === "proposed" &&
        proposed.args === JSON.stringify(first) &&
        proposed.args_hash === sha256(proposed.args) &&
        proposed.run_at === runAt,
      `${proposed.state}; args ${proposed.args}; run_at ${proposed.run_at}`
    );
    // Proposed, past nothing: no call while it waits for approval.
    await Bun.sleep(5000);
    check(
      "1: nothing runs before approval",
      callsFor(proposed.idempotency_key).length === 0 &&
        rowOf(proposed.id)?.state === "proposed",
      `${callsFor(proposed.idempotency_key).length} calls`
    );
    await approve(proposed);
    const done = await until(
      "the post done",
      () => rowOf(proposed.id),
      (row) => row?.state === "done",
      150_000
    );
    const made = callsFor(proposed.idempotency_key);
    const at = made[0]?.at ?? 0;
    // A while after: still the one call.
    await Bun.sleep(4000);
    check(
      "1: it ran once, at or after its time and within the scheduler's wake, with the exact arguments and the key in _meta",
      callsFor(proposed.idempotency_key).length === 1 &&
        at >= runAt &&
        at - runAt <= WAKE_SLACK_MS &&
        made[0]?.args === proposed.args &&
        made[0]?.meta?.["idempotency-key"] === proposed.idempotency_key &&
        (done.result ?? "").includes("posted #"),
      `${made.length} call(s), ${at - runAt}ms after run_at; sent ${made[0]?.args}; result ${done.result}`
    );
  });

  await section("6: then_stage moves the task by: action, once", async () => {
    const action =
      launchPost ??
      (() => {
        throw new Error("no action from 1");
      })();
    const moved = await until(
      "the task moved",
      () =>
        fleet.api<{ stage: string }>(
          `/api/projects/${projectId}/tasks/${task.id}`
        ),
      (view) => view.stage === "posted",
      60_000
    );
    check(
      "6: a done post moves its task to posted as an approved action",
      moved.stage === "posted" &&
        (rowOf(action.id)?.stage_result ?? "").startsWith("Moved"),
      `${task.stage} → ${moved.stage}; ${rowOf(action.id)?.stage_result}`
    );
  });

  // ── 6: nobody else enters a by: action stage ─────────────────────────────
  await section("6: direct moves to posted are refused", async () => {
    const other = await ok<{ id: string }>(
      "POST",
      `/api/projects/${projectId}/tasks`,
      { title: "Second post", stage: "scheduled" }
    );
    const byRoute = await send(
      "POST",
      `/api/projects/${projectId}/tasks/${other.id}/stage`,
      { stage: "posted" }
    );
    check(
      "6: your route's move to posted is refused",
      byRoute.status === 403 && byRoute.text.includes("approved action"),
      `${byRoute.status} ${byRoute.text}`
    );
    const said = await sessionCalls(MOVE, { id: other.id, stage: "posted" });
    const now = await fleet.api<{ stage: string }>(
      `/api/projects/${projectId}/tasks/${other.id}`
    );
    check(
      "6: a session's direct move to posted is refused",
      now.stage === "scheduled" && said.includes("approved action"),
      `stage ${now.stage}; the tool said: ${said.slice(0, 300)}`
    );
  });

  // ── 2: a hub restart before its time ──────────────────────────────────────
  await section("2: a restart before its time: once, at its time", async () => {
    const at = Date.now() + 45_000;
    const action = await propose({
      connection: "x-probe",
      tool: "post",
      args: { text: "Across a restart" },
      run_at: new Date(at).toISOString(),
      reason: "Proves a restart keeps the time.",
    });
    await approve(action);
    await restartHub();
    const done = await until(
      "the post done after the restart",
      () => rowOf(action.id),
      (row) => row?.state === "done",
      120_000
    );
    await Bun.sleep(4000);
    const made = callsFor(action.idempotency_key);
    check(
      "2: it runs once, after the restart, at its time",
      made.length === 1 &&
        (made[0]?.at ?? 0) >= at &&
        (made[0]?.at ?? 0) - at <= WAKE_SLACK_MS &&
        done.args === made[0]?.args,
      `${made.length} call(s), ${(made[0]?.at ?? 0) - at}ms after run_at`
    );
  });

  // ── 3: a kill mid-call ───────────────────────────────────────────────────
  await section("3: a kill mid-call: unknown, never again", async () => {
    holding = true;
    const action = await propose({
      connection: "x-probe",
      tool: "post",
      args: { text: "Held mid-call" },
      reason: "Proves at-most-once across a crash.",
    });
    await approve(action);
    await until(
      "the call to reach the server",
      () => callsFor(action.idempotency_key).length,
      (n) => n === 1,
      60_000
    );
    check(
      "3: claimed and running while the server holds the call",
      rowOf(action.id)?.state === "running",
      `${rowOf(action.id)?.state}`
    );
    await restartHub("SIGKILL");
    holding = false;
    releaseHeld?.();
    const after = await until(
      "the action unknown",
      () => rowOf(action.id),
      (row) => row?.state === "unknown",
      60_000
    );
    const waiting = await ok<{ actions: { id: string }[] }>(
      "GET",
      "/api/actions/waiting"
    );
    await Bun.sleep(20_000);
    check(
      "3: after the restart it is unknown, waits on you, says to check the service, and is never called again",
      callsFor(action.idempotency_key).length === 1 &&
        rowOf(action.id)?.state === "unknown" &&
        waiting.actions.some((one) => one.id === action.id) &&
        (after.error ?? "").includes("may or may not have happened") &&
        (after.error ?? "").includes("Check x"),
      `${callsFor(action.idempotency_key).length} call(s); ${after.error}`
    );
    await ok("POST", `/api/actions/${action.id}/checked`);
    const later = await ok<{ actions: { id: string }[] }>(
      "GET",
      "/api/actions/waiting"
    );
    check(
      "3: checked, it leaves what waits on you",
      !later.actions.some((one) => one.id === action.id),
      `${later.actions.length} waiting`
    );
  });

  // ── 4 and 5: denied, cancelled and tampered never run ─────────────────────
  await section("4/5: denied, cancelled and tampered never run", async () => {
    const soon = () => new Date(Date.now() + 15_000).toISOString();
    const denied = await propose({
      connection: "x-probe",
      tool: "post",
      args: { text: "Denied" },
      run_at: soon(),
      reason: "Proves a denial holds.",
    });
    const cancelled = await propose({
      connection: "x-probe",
      tool: "post",
      args: { text: "Cancelled" },
      run_at: soon(),
      reason: "Proves a cancel holds.",
    });
    const tampered = await propose({
      connection: "x-probe",
      tool: "post",
      args: { text: "Approved as shown" },
      reason: "Proves the hash binds the approval.",
    });
    await ok("POST", `/api/actions/${denied.id}/deny`);
    await approve(cancelled);
    await ok("POST", `/api/actions/${cancelled.id}/cancel`);
    const other = sha256(JSON.stringify({ text: "Something else" }));
    const refused = await send("POST", `/api/actions/${tampered.id}/approve`, {
      argsHash: other,
    });
    check(
      "5: an approval naming other arguments' hash is refused; it stays proposed",
      refused.status === 409 &&
        refused.text.includes("not the arguments") &&
        rowOf(tampered.id)?.state === "proposed",
      `${refused.status} ${refused.text}; state ${rowOf(tampered.id)?.state}`
    );
    const late = await send("POST", `/api/actions/${denied.id}/approve`, {
      argsHash: denied.args_hash,
    });
    await Bun.sleep(25_000);
    check(
      "4: denied and cancelled never run, past their time; a denied one cannot be approved after",
      callsFor(denied.idempotency_key).length === 0 &&
        callsFor(cancelled.idempotency_key).length === 0 &&
        callsFor(tampered.idempotency_key).length === 0 &&
        rowOf(denied.id)?.state === "denied" &&
        rowOf(cancelled.id)?.state === "cancelled" &&
        late.status === 409,
      `calls ${callsFor(denied.idempotency_key).length}/${callsFor(cancelled.idempotency_key).length}/${callsFor(tampered.idempotency_key).length}; states ${rowOf(denied.id)?.state}/${rowOf(cancelled.id)?.state}; late approve ${late.status}`
    );
  });

  // ── 7: a post the service refuses needs you ──────────────────────────────
  await section("7: a failed action reaches Needs you", async () => {
    refuseNext = true;
    const action = await propose({
      connection: "x-probe",
      tool: "post",
      args: { text: "Refused by the service" },
      reason: "Proves a failure reaches you.",
    });
    await approve(action);
    const after = await until(
      "the action failed",
      () => rowOf(action.id),
      (row) => row?.state === "failed",
      60_000
    );
    const waiting = await ok<{ actions: { id: string; state: string }[] }>(
      "GET",
      "/api/actions/waiting"
    );
    const pushed = await until(
      "the push line",
      async () =>
        (await fleet.logs("hub")).includes(
          `[push] action ${action.id}: failed`
        ),
      Boolean,
      15_000
    );
    await Bun.sleep(5000);
    check(
      "7: failed with the service's words, waiting on you, pushed, called once",
      waiting.actions.some(
        (one) => one.id === action.id && one.state === "failed"
      ) &&
        (after.error ?? "").includes("rate limited: try in an hour") &&
        pushed &&
        callsFor(action.idempotency_key).length === 1,
      `${after.error}; waiting ${waiting.actions.map((one) => one.state).join(", ")}; ${callsFor(action.idempotency_key).length} call(s)`
    );
    await ok("POST", `/api/actions/${action.id}/checked`);
    const later = await ok<{ actions: { id: string }[] }>(
      "GET",
      "/api/actions/waiting"
    );
    check(
      "7: Remove (checked) puts the failed one away",
      !later.actions.some((one) => one.id === action.id) &&
        rowOf(action.id)?.state === "failed",
      `${later.actions.length} waiting`
    );
  });

  // ── 8: a stage written into the file by Caw never moves the task ─────────
  await section("8: a task file's stage edited by Caw stays", async () => {
    const target = await ok<{ id: string; stage: string }>(
      "POST",
      `/api/projects/${projectId}/tasks`,
      { title: "Third post", stage: "scheduled" }
    );
    await send("PATCH", `/api/projects/${projectId}/caw`, { on: true });
    const listing = await ok<{ entries: { path: string }[] }>(
      "GET",
      `/api/projects/${projectId}/folder?path=tasks`
    );
    const path =
      listing.entries.find((one) => one.path.startsWith(`tasks/${target.id}-`))
        ?.path ?? "";
    const fileOf = async () =>
      (
        await ok<{ content: string }>(
          "GET",
          `/api/projects/${projectId}/folder/file?path=${encodeURIComponent(path)}`
        )
      ).content;
    const viaLead = (text: string) =>
      ok("POST", `/api/projects/${projectId}/threads`, { body: text });
    for (const written of ["posted", "draft"]) {
      // biome-ignore lint/performance/noAwaitInLoops: one edit, then its restore, then the next
      const content = (await fileOf()).replace(STAGE_LINE, `stage: ${written}`);
      const said = await toolCall(
        "mcp__cawco__folder_write",
        { path, content },
        viaLead
      );
      // A read of the task: the index keeps its stage, and the file gets it back.
      const shown = await fleet.api<{ stage: string }>(
        `/api/projects/${projectId}/tasks/${target.id}`
      );
      const restored = await until(
        "the file's stage put back",
        fileOf,
        (text) =>
          text.includes("stage: scheduled") &&
          text.includes(`Caw edited the file to say stage ${written}`),
        60_000
      );
      const now = await fleet.api<{ stage: string }>(
        `/api/projects/${projectId}/tasks/${target.id}`
      );
      check(
        `8: Caw's folder_write of stage ${written} leaves the task in scheduled, with the note`,
        shown.stage === "scheduled" &&
          now.stage === "scheduled" &&
          restored.includes(
            "stage changes go through task moves; Caw edited the file"
          ),
        `folder_write said ${said.slice(0, 120)}; read ${shown.stage}, then ${now.stage}; note: ${restored.split("\n").find((line) => line.includes("task moves"))}`
      );
    }
  });

  // ── 9: a task written straight into the folder starts where tasks start ──
  await section("9: a new task file starts where a create could", async () => {
    const fileAt = async (path: string) =>
      (
        await ok<{ content: string }>(
          "GET",
          `/api/projects/${projectId}/folder/file?path=${encodeURIComponent(path)}`
        )
      ).content;
    const pathOf = async (id: string) =>
      (
        await ok<{ entries: { path: string }[] }>(
          "GET",
          `/api/projects/${projectId}/folder?path=tasks`
        )
      ).entries.find((one) => one.path.startsWith(`tasks/${id}-`))?.path ?? "";
    const WRITTEN = "tasks/tsk-90-written-in.md";
    const said = await toolCall(
      "mcp__cawco__folder_write",
      {
        path: WRITTEN,
        content:
          "---\nstage: posted\n---\n# Written in\n\nA post Caw wrote straight into the folder.\n",
      },
      (text) => ok("POST", `/api/projects/${projectId}/threads`, { body: text })
    );
    // A read of the project's tasks finds the file; it is adopted in the turn.
    const adopted = await until(
      "the written-in task adopted",
      async () => {
        await send("GET", `/api/projects/${projectId}/tasks/tsk-90`);
        return await fileAt(WRITTEN);
      },
      (text) =>
        text.includes("stage: idea") &&
        text.includes(
          "Caw wrote this task straight into stage posted; tasks start in idea."
        ),
      60_000
    );
    const shown = await fleet.api<{ stage: string }>(
      `/api/projects/${projectId}/tasks/tsk-90`
    );
    check(
      "9: Caw's folder_write of a new task in posted lands in the first stage, with the note",
      shown.stage === "idea",
      `folder_write said ${said.slice(0, 100)}; stage ${shown.stage}; note: ${adopted.split("\n").find((line) => line.includes("straight into"))}`
    );

    // The whole index rebuilt from the folder: every task the hub made keeps
    // its stage, even one an approved action moved to posted.
    const posted = await pathOf(task.id);
    const before = await fileAt(posted);
    await fleet.stop("hub");
    // A probe's connection keeps no foreign keys: a task's lists go by hand.
    for (const table of [
      "project_task_edges",
      "project_task_labels",
      "project_task_fields",
      "project_tasks",
    ]) {
      fleet.write(`DELETE FROM ${table} WHERE project_id = ?`, projectId);
    }
    fleet.launch("hub");
    await fleet.hubUp();
    const stages = await until(
      "the rebuilt index",
      async () =>
        await Promise.all(
          [task.id, "tsk-2", "tsk-3", "tsk-90"].map(
            async (id) =>
              (
                await fleet.api<{ stage: string }>(
                  `/api/projects/${projectId}/tasks/${id}`
                )
              ).stage
          )
        ),
      (all) => all.every(Boolean),
      60_000
    );
    // Long enough for any settle a rebuild queued to have run.
    await Bun.sleep(5000);
    const after = await fileAt(posted);
    const rows = fleet.query<{ id: string; stage: string }>(
      "SELECT id, stage FROM project_tasks WHERE project_id = ? ORDER BY number",
      projectId
    );
    check(
      "9: after a full index rebuild, hub-made tasks keep their stages and their files are untouched",
      JSON.stringify(stages) ===
        JSON.stringify(["posted", "scheduled", "scheduled", "idea"]) &&
        after === before &&
        !after.includes("straight into"),
      `stages ${stages.join(", ")}; index ${rows.map((row) => `${row.id} ${row.stage}`).join(", ")}; ${task.id}'s file ${after === before ? "unchanged" : "changed"}`
    );
  });

  check(
    "every call the server saw was one approved action's, once each",
    new Set(calls.map((one) => one.meta?.["dev.cawco/idempotency-key"]))
      .size === calls.length,
    `${calls.length} calls`
  );
} catch (error) {
  failed = true;
  console.error(
    `probe failed: ${error instanceof Error ? error.stack : String(error)}`
  );
  results.error = String(error);
} finally {
  console.log(
    `actions: ${JSON.stringify(fleet.query("SELECT id, state, run_at, started_at, ended_at, error, stage_result FROM actions ORDER BY created_at"), null, 1)}`
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
  mcp.stop(true);
  console.log(JSON.stringify(results, null, 2));
  await fleet.clean(keep || failed);
}
process.exit(failed ? 1 : 0);

/**
 * Your approval goes to the agent that filed the task, and that agent does
 * what comes next (hub task-approval.ts; owner, 2026-10-16: "the agent who
 * puts the task should be the one who decides what happens to it after i
 * approve it"). Only your act travels as yours: the agent reads the result
 * itself. On a scratch fleet (real hub, agent and sessiond; Claude Code
 * against the mock model), Jev off, with an `x-probe` connection (a test
 * MCP server in this process whose `post` records its calls). Its attempt
 * cuts a workspace and Caw's turn needs his place's sandbox, so it runs
 * where a boundary can start (a `host` check), not inside another one.
 *
 * Projects "Approvals" (Caw off) and "Led" (Caw on) have a `review` stage
 * of kind `you`, then `approved` (waiting) and `posted` (done).
 *
 * a. A "Filer" session in Approvals files a task with `task_create` (an
 *    acceptance criterion, lands none) and starts an attempt with
 *    `task_start`; the attempt finishes with a headline, and with the lead
 *    off its criterion goes to you: the task waits in review, needsYou, its
 *    result the attempt's headline.
 * b. The owner approves it in the task sheet (its stage route, as the web
 *    and iOS sheets move it), with a reason: review → approved.
 * c. The filer is sent the approval as your words, and reads it: the task's
 *    id, "approved", its title and your reason, and none of the attempt's
 *    words. Its `task_read` answers the result.
 * d. Its follow-through is an `action_propose` for the task (x-probe/post,
 *    then_stage posted); approved, the call runs once and moves the task
 *    to posted.
 * e. The activity, in order: your approval (review → approved, by you,
 *    reason "approved: <yours>"), the filer's proposal (its comment), the
 *    approved action's move (approved → posted).
 * f. Caw off, the filer gone (its conversation gone, as the hub records
 *    it): approving a task it filed wakes nobody, and the task stays in
 *    approved.
 * g. Caw on, a filer gone: approving its task wakes Caw, as an event (a
 *    system send, never your words), naming the task and "approved".
 *
 *   bun scripts/probe-kit/run.ts task-approval
 */
import { Database } from "bun:sqlite";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CLAUDE_CONVERSATION_GONE } from "../../../packages/core/src/index";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const CREATE = "mcp__cawco__task_create";
const START = "mcp__cawco__task_start";
const READ = "mcp__cawco__task_read";
const PROPOSE = "mcp__cawco__action_propose";
const FINISH = "mcp__cawco__finish_item";
/** Only an attempt's brief opens this way. */
const BRIEF = "Your work item is an attempt at";
const CAW = "You are Caw";
const TITLE = "Post the launch note";
const RESULT = "Drafted the launch note PROBE-RESULT.";
const OWNER_REASON = "reads well, post it";
const NOTE = "The launch note, from the probe.";
/** How the hub's approval opens (task-approval.ts `approvalText`). */
const APPROVED = /The owner approved (tsk-\d+)/;
const STAGES =
  "---\nready      todo\nworking    active\nreview     you\napproved   waiting\nposted     done\ndropped    dropped\nmoves\n  * → *    you, session, action\nviews\n  board      by stage\n---\n";
/** What starts one of the filer's turns: a command's marker, or an approval (keyed by its task). */
const TURN = /PROBE-CMD:\w+|The owner approved (tsk-\d+)/g;
/** How long a wake that should not come is waited for. */
const QUIET_MS = 20_000;

interface Call {
  input: object;
  name: string;
}
/** By a turn's key (a command's marker, or the approval's task id): the tool calls it makes, in order. */
const scripts = new Map<string, Call[]>();
/** By a turn's key: the last tool it called (ToolSearch aside). */
const lastCalled = new Map<string, string>();
/** By an approval's task id: what the filer's `task_read` answered. */
const readAnswers = new Map<string, string>();
/** What the filer's model was asked with, each approval's words. */
const filerHeard: string[] = [];
/** What Caw's turns were asked, in order. */
const cawHeard: string[] = [];
let finishIssued = false;

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const useTool = (name: string, input: object): Reply => ({
  everyMs: 1,
  words: [],
  tool: { name, input },
});
/** A deferred tool is found first; then called. */
const found = (request: Seen, next: Call): Reply | undefined => {
  if (request.toolNames.includes(next.name)) {
    return undefined;
  }
  return request.toolNames.includes("ToolSearch")
    ? useTool("ToolSearch", { query: `select:${next.name}`, max_results: 1 })
    : text(`${next.name} is not offered`);
};

/** The text of the tool result a request answers (Anthropic messages), or nothing. */
const toolResultOf = (body: string): string => {
  try {
    const { messages } = JSON.parse(body) as {
      messages?: { content: unknown }[];
    };
    const content = messages?.at(-1)?.content;
    const block = Array.isArray(content)
      ? (content as { content?: unknown; type?: string }[]).find(
          (part) => part.type === "tool_result"
        )
      : undefined;
    const said = block?.content;
    if (typeof said === "string") {
      return said;
    }
    return Array.isArray(said)
      ? (said as { text?: string }[]).map((part) => part.text ?? "").join("")
      : "";
  } catch {
    return "";
  }
};

/** The attempt finishes once, with its headline; then it says ok. */
const attempt = (request: Seen): Reply => {
  if (finishIssued) {
    return text("ok");
  }
  const finish: Call = {
    name: FINISH,
    input: { headline: RESULT, summary: `${RESULT} It is ready to post.` },
  };
  const first = found(request, finish);
  if (first) {
    return first;
  }
  finishIssued = true;
  return useTool(finish.name, finish.input);
};

/** The next call of the turn keyed `key`, or its closing words. */
const scripted = (request: Seen, key: string | undefined): Reply => {
  if (
    key &&
    request.afterTool &&
    lastCalled.get(key) === READ &&
    !readAnswers.has(key)
  ) {
    readAnswers.set(key, toolResultOf(request.body));
  }
  const queue = key ? scripts.get(key) : undefined;
  const [next] = queue ?? [];
  if (!(key && queue && next)) {
    return text("Done.");
  }
  const first = found(request, next);
  if (first) {
    return first;
  }
  queue.shift();
  lastCalled.set(key, next.name);
  return useTool(next.name, next.input);
};

/** The filer's follow-through on an approval: it reads the result, then proposes the post. */
const followThrough = (id: string): Call[] => [
  { name: READ, input: { id } },
  {
    name: PROPOSE,
    input: {
      connection: "x-probe",
      tool: "post",
      args: { text: NOTE },
      reason: "The approved launch note, posted.",
      task: id,
      then_stage: "posted",
    },
  },
];

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (request.all.includes(BRIEF)) {
    return attempt(request);
  }
  if (request.all.includes(CAW)) {
    cawHeard.push(request.last);
    return text("ok");
  }
  const approval = APPROVED.exec(request.last)?.[1];
  if (approval && !scripts.has(approval)) {
    filerHeard.push(request.last);
    scripts.set(approval, followThrough(approval));
  }
  // A turn's later requests answer its tool calls: the newest marker in
  // everything said keys the turn.
  const newest = [...request.all.matchAll(TURN)].at(-1);
  return scripted(request, newest?.[1] ?? newest?.[0]);
};

/** The test MCP server behind `x-probe`: one tool, `post`, whose calls it keeps. */
const poster = (posted: string[]) => {
  const rpc = (id: unknown, result: unknown) =>
    Response.json({ jsonrpc: "2.0", id, result });
  return Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (request.method !== "POST") {
        return new Response(null, { status: 405 });
      }
      const message = (await request.json()) as {
        id?: unknown;
        method?: string;
        params?: { arguments?: unknown };
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
                  properties: { text: { type: "string" } },
                  required: ["text"],
                },
              },
            ],
          });
        case "tools/call":
          posted.push(JSON.stringify(message.params?.arguments));
          return rpc(message.id, {
            content: [{ type: "text", text: `posted #${posted.length}` }],
          });
        default:
          return Response.json({
            jsonrpc: "2.0",
            id: message.id,
            error: { code: -32_601, message: "no such method" },
          });
      }
    },
  });
};

interface TaskRead {
  attempts: { state: string }[];
  comments: { author: { name: string }; text: string }[];
  id: string;
  needsYou: boolean;
  result: { headline: string | null } | null;
  stage: string;
  title: string;
}
interface HistoryEvent {
  actor: { id: string | null; mover: string | null; name: string };
  kind: string;
  reason: string | null;
  stage: { from: string | null; to: string } | null;
}
interface ActionRead {
  argsHash: string;
  id: string;
  state: string;
  taskId: string | null;
}

const run = async (kit: Kit) => {
  const posted: string[] = [];
  const mcp = poster(posted);
  const fleet = await kit.fleet(respond);
  try {
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();

    const home = fleet.env.HOME as string;
    await writeFile(
      join(home, ".gitconfig"),
      "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
    );
    const repo = join(fleet.sandbox, "code");
    await mkdir(repo, { recursive: true });
    await Bun.$`git init -q -b main && echo code > README.md && git add -A && git commit -qm 'First commit'`
      .cwd(repo)
      .env({ ...process.env, HOME: home })
      .quiet();
    const approvals = await projectOf(fleet, "Approvals", repo, false);
    await fleet.api("/api/connections", {
      name: "x-probe",
      service: "x",
      account: "@probe",
      transport: "http",
      url: `http://127.0.0.1:${mcp.port}/mcp`,
      auth: "none",
      projects: [approvals],
    });
    const filer = await fleet.spawn("claude", "Filer", repo, {
      projectId: approvals,
    });
    kit.note(`project ${approvals}, filer ${filer}`);

    const read = (projectId: string, taskId: string) =>
      fleet.api<TaskRead>(`/api/projects/${projectId}/tasks/${taskId}`);
    const historyOf = async (projectId: string, taskId: string) =>
      (
        await fleet.api<{ events: HistoryEvent[] }>(
          `/api/projects/${projectId}/tasks/${taskId}/history`
        )
      ).events;
    const command = async (session: string, marker: string, calls: Call[]) => {
      scripts.set(`PROBE-CMD:${marker}`, calls);
      await fleet.send(session, `PROBE-CMD:${marker}`);
    };
    /** A session files a task through `task_create`; its id once the hub has it. */
    const filed = async (
      session: string,
      projectId: string,
      marker: string,
      input: { title: string } & Record<string, unknown>
    ): Promise<string> => {
      await command(session, marker, [{ name: CREATE, input }]);
      const task = await until(
        `${marker}: the filed task`,
        async () =>
          (
            await fleet.api<{ tasks: { id: string; title: string }[] }>(
              `/api/projects/${projectId}/tasks`
            )
          ).tasks.find((each) => each.title === input.title),
        Boolean,
        120_000
      );
      if (!task) {
        throw new Error(`${marker}: no task filed`);
      }
      return task.id;
    };
    const moveAsOwner = (
      projectId: string,
      taskId: string,
      stage: string,
      reason?: string
    ) =>
      fleet.api<{ stage: string }>(
        `/api/projects/${projectId}/tasks/${taskId}/stage`,
        reason ? { stage, reason } : { stage }
      );
    /** The approval's words for a task: its id and title, as ids repeat across projects. */
    const approvalOf = (taskId: string, title: string) =>
      `The owner approved ${taskId} “${title}”`;
    /** Every send the hub kept carrying a task's approval: to whom, as what, and its state. */
    const approvalSends = (taskId: string, title: string) =>
      fleet.query<{ instance_id: string; origin: string; state: string }>(
        "SELECT instance_id, state, json_extract(body, '$.origin.kind') AS origin FROM sent_messages WHERE body LIKE ? ORDER BY accepted_at",
        `%${approvalOf(taskId, title)}%`
      );
    /** The hub's own line for an approval it handled (task-approval.ts). */
    const approvalLog = async (projectId: string, taskId: string) =>
      (await fleet.logs("hub"))
        .split("\n")
        .filter((line) => line.includes(`${taskId} in ${projectId}: approved`))
        .join(" | ");

    // ── a. the filer files the task and starts its attempt ─────────────────
    const id = await filed(filer, approvals, "FILE", {
      title: TITLE,
      stage: "ready",
      lands: "none",
      acceptance: "- The note reads well",
    });
    await command(filer, "START", [{ name: START, input: { id } }]);
    const waiting = await until(
      `${id} waiting in review with its result`,
      () => read(approvals, id),
      (task) => task.stage === "review" && task.result !== null,
      300_000
    );
    kit.check(
      "a: the filer's task waits for you in review, its result the attempt's headline",
      waiting?.needsYou === true &&
        waiting.attempts[0]?.state === "done" &&
        waiting.result?.headline === RESULT,
      JSON.stringify({
        stage: waiting?.stage,
        needsYou: waiting?.needsYou,
        attempt: waiting?.attempts[0]?.state,
        result: waiting?.result?.headline,
      })
    );

    // ── b. the owner approves it in the task sheet ─────────────────────────
    const approved = await moveAsOwner(approvals, id, "approved", OWNER_REASON);
    kit.check(
      "b: the owner's approval goes: review → approved",
      approved.stage === "approved",
      `stage ${approved.stage}`
    );

    // ── c. the filer hears your act alone, and reads the result itself ──────
    const heard = await until(
      "the filer's model asked with the approval",
      () => filerHeard.find((words) => words.includes(`approved ${id} `)),
      Boolean,
      120_000
    );
    kit.check(
      "c: the filer is sent the approval: the task, “approved”, its title and your reason",
      Boolean(
        heard?.includes(`approved ${id} `) &&
        heard.includes(TITLE) &&
        heard.includes(OWNER_REASON)
      ),
      (heard ?? "none").slice(0, 400)
    );
    kit.check(
      "c: the approval carries none of the attempt's words",
      heard !== undefined &&
        !heard.includes("PROBE-RESULT") &&
        !heard.includes("ready to post"),
      (heard ?? "none").slice(0, 400)
    );
    const toFiler = approvalSends(id, TITLE).filter(
      (row) => row.instance_id === filer
    );
    kit.check(
      "c: it went to the filer as your words, and it read them",
      toFiler.length === 1 &&
        toFiler[0]?.origin === "human" &&
        toFiler[0].state === "read",
      JSON.stringify(toFiler)
    );
    const answer = await until(
      "the filer's task_read answer",
      () => readAnswers.get(id),
      Boolean,
      120_000
    );
    kit.check(
      "c: the filer's task_read answers the result",
      Boolean(answer?.includes(RESULT)),
      (answer ?? "none").slice(0, 300)
    );

    // ── d. its follow-through: an action it proposes, approved, lands ──────
    const proposal = await until(
      "the filer's proposal",
      async () =>
        (
          await fleet.api<{ actions: ActionRead[] }>(
            `/api/actions?projectId=${approvals}`
          )
        ).actions.find((one) => one.taskId === id),
      Boolean,
      120_000
    );
    if (!proposal) {
      throw new Error("the filer proposed nothing");
    }
    await fleet.api(`/api/actions/${proposal.id}/approve`, {
      argsHash: proposal.argsHash,
    });
    const landed = await until(
      `${id} posted by its approved action`,
      () => read(approvals, id),
      (task) => task.stage === "posted",
      120_000
    );
    kit.check(
      "d: the filer's proposal, approved, posts once and moves the task to posted",
      landed?.stage === "posted" &&
        posted.length === 1 &&
        posted[0] === JSON.stringify({ text: NOTE }),
      `stage ${landed?.stage}; posted ${JSON.stringify(posted)}`
    );

    // ── e. the activity, in order ──────────────────────────────────────────
    const events = await historyOf(approvals, id);
    const approval = events.findIndex(
      (event) =>
        event.kind === "moved" &&
        event.stage?.from === "review" &&
        event.stage.to === "approved" &&
        event.actor.mover === "you" &&
        event.reason === `approved: ${OWNER_REASON}`
    );
    const proposed = events.findIndex(
      (event) => event.kind === "commented" && event.actor.id === filer
    );
    const moved = events.findIndex(
      (event) =>
        event.kind === "moved" &&
        event.stage?.from === "approved" &&
        event.stage.to === "posted" &&
        event.actor.mover === "action"
    );
    const comment = landed?.comments.find((one) =>
      one.text.startsWith("Proposed x-probe/post")
    );
    kit.check(
      "e: the activity shows your approval, then the filer's proposal, then the action's move",
      approval >= 0 &&
        proposed > approval &&
        moved > proposed &&
        comment !== undefined,
      JSON.stringify({
        comment: comment?.text,
        events: events.map((event) => ({
          kind: event.kind,
          by: event.actor.name,
          stage: event.stage,
          reason: event.reason,
        })),
      })
    );

    // ── f. Caw off, the filer gone: nobody is woken ────────────────────────
    const offTitle = "Tidy the launch page";
    const offId = await filed(filer, approvals, "FILE_OFF", {
      title: offTitle,
      stage: "ready",
    });
    gone(fleet, filer);
    await moveAsOwner(approvals, offId, "review");
    await moveAsOwner(approvals, offId, "approved");
    await Bun.sleep(QUIET_MS);
    const offTask = await read(approvals, offId);
    const offSends = approvalSends(offId, offTitle);
    const [offProject] = fleet.query<{ lead_instance_id: string | null }>(
      "SELECT lead_instance_id FROM projects WHERE id = ?",
      approvals
    );
    kit.check(
      "f: Caw off and the filer gone: approving wakes nobody, and the task stays in approved",
      offTask.stage === "approved" &&
        offSends.length === 0 &&
        !offProject?.lead_instance_id &&
        !cawHeard.some((words) => words.includes(approvalOf(offId, offTitle))),
      JSON.stringify({
        stage: offTask.stage,
        sends: offSends,
        lead: offProject?.lead_instance_id ?? null,
        hub: await approvalLog(approvals, offId),
      })
    );

    // ── g. Caw on, the filer gone: Caw is woken, as an event ───────────────
    const led = await projectOf(fleet, "Led", repo, true);
    const ledFiler = await fleet.spawn("claude", "Led filer", repo, {
      projectId: led,
    });
    const ledTitle = "Announce the launch";
    const ledId = await filed(ledFiler, led, "FILE_LED", {
      title: ledTitle,
      stage: "ready",
    });
    gone(fleet, ledFiler);
    await moveAsOwner(led, ledId, "review");
    await moveAsOwner(led, ledId, "approved");
    const cawTurn = await until(
      "Caw's turn with the approval",
      () =>
        cawHeard.find((words) => words.includes(approvalOf(ledId, ledTitle))),
      Boolean,
      180_000
    ).catch(() => undefined);
    const [ledProject] = fleet.query<{ lead_instance_id: string | null }>(
      "SELECT lead_instance_id FROM projects WHERE id = ?",
      led
    );
    const ledSends = approvalSends(ledId, ledTitle);
    kit.check(
      "g: Caw on and the filer gone: Caw is woken with the approval, as an event and not as your words",
      Boolean(cawTurn) &&
        ledSends.length > 0 &&
        ledSends.every(
          (row) =>
            row.instance_id === ledProject?.lead_instance_id &&
            row.origin !== "human"
        ),
      JSON.stringify({
        heard: (cawTurn ?? "none").slice(0, 300),
        sends: ledSends,
        lead: ledProject?.lead_instance_id ?? null,
        hub: await approvalLog(led, ledId),
      })
    );
  } catch (error) {
    // What the fleet said, kept before it is cleaned away.
    for (const name of ["hub", "agent", "sessiond"] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: three logs, in order
      await writeFile(join(kit.out, `${name}.log`), await fleet.logs(name));
    }
    kit.note(`failure captures: ${kit.out}`);
    throw error;
  } finally {
    mcp.stop(true);
  }
};

/** A session's conversation gone, as the hub records it: it takes no input now. One write beside the running hub's. */
const gone = (fleet: KitFleet, instanceId: string): void => {
  const db = new Database(fleet.env.CAWCO_DB_PATH as string);
  try {
    db.exec("PRAGMA busy_timeout = 15000");
    db.query("UPDATE instances SET last_error = ? WHERE id = ?").run(
      CLAUDE_CONVERSATION_GONE,
      instanceId
    );
  } finally {
    db.close();
  }
};

/** A project on the fleet's machine at `repo`, with the probe's stages: its id. */
const projectOf = async (
  fleet: KitFleet,
  name: string,
  repo: string,
  caw: boolean
): Promise<string> => {
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name,
    machineId: MACHINE,
    cwd: repo,
    caw,
  });
  const put = await fetch(
    `${fleet.base}/api/projects/${project.id}/folder/file`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "stages.md", content: STAGES }),
    }
  );
  if (!put.ok) {
    throw new Error(`stages.md: ${put.status} ${await put.text()}`);
  }
  return project.id;
};

export default { name: "task-approval", run } satisfies Spec;

/**
 * What a trigger on a task wakes (the owner's card "What a trigger wakes",
 * 2026-11-07; hub handlers.ts, task-input.ts): never the project's
 * conversation, continued or not, but the task's handler, a fresh session
 * the hub starts for it, one per task while it lives, ended once it has
 * been idle with nothing open; with Caw off, nothing.
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), the hub's handlers idling out after {@link IDLE_MS}. A
 * project made with Caw; an agent of the project writes its stages and
 * files three tasks (a session's filing wakes nothing). The person's words
 * (Ask Caw for a view) start the project's conversation, which the person
 * then Continues in a new session.
 *
 * - a. The person's comment on a task starts a handler of the task: a work
 *   item that handles it, whose session reads the comment. Neither the
 *   continued conversation nor its continuation is sent it, and the task
 *   lists the handler.
 * - g1. A second comment on the task while its handler lives goes to that
 *   handler: no second handler starts.
 * - g2. The handler, idle with nothing open, ends (done) past the idle spell.
 * - g3. A handler with an ask of its own open to the person does not end,
 *   past the idle spell.
 * - h. With Caw off, the person's comment on a task starts nothing and
 *   reaches no session.
 *
 * Before handlers (2026-11-08) the comment went to the project's
 * conversation: to a continued one it was refused, and no handler existed.
 *
 *   bun scripts/probe-kit/run.ts handler-triggers
 */
import { hubRequest } from "../../../packages/core/src/hub-request";
import { handlerWords } from "../../../packages/core/src/words/handlers";
import { toolWords } from "../../lib/tool-call";
import {
  MACHINE,
  MODEL,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import { ToolCalls } from "../../tool-calls";
import type { Kit, KitFleet, Spec } from "../kit";

/** How long a handler may sit idle here (core `CAWCO_HANDLER_IDLE_MS`). */
const IDLE_MS = 30_000;
/** The idle spell, the hub's sweep (15 s) and a margin. */
const PAST_IDLE_MS = IDLE_MS + 15_000 + 20_000;
/** The hub's quiet spell over the person's writing on a task (task-input.ts), with a margin. */
const QUIET_MS = 10_000 + 5000;
/** The handler's ask to the person, on a marker its comment carries. */
const calls = new ToolCalls("HT-CALL");
calls.ask("finish-ask", {
  name: "mcp__cawco__ask",
  input: {
    questions: [
      {
        question: "Which worktop finish should the quote use?",
        header: "Finish",
        multiSelect: false,
        options: [
          { label: "Oiled", description: "Matte, re-oiled yearly." },
          { label: "Lacquered", description: "Sealed, no upkeep." },
        ],
      },
    ],
    blocks: true,
    waiting: "the quote",
  },
});

/** The mock model: a handler whose comment carries the ask's marker asks the person, else "ok". */
const respond = (request: Seen): Reply =>
  (request.tools ? calls.reply(request) : undefined) ?? {
    everyMs: 5,
    words: ["ok"],
  };

/** A task's id in task_create's answer. */
const TASK_ID = /tsk-\d+/u;

const STAGES_MD = `---
todo       todo
your-call  you
done       done
moves
  * → *    you
views
  board    by stage
---
`;

interface ItemRow {
  ended_at: number | null;
  id: string;
  instance_id: string;
  state: string;
}

/** A thing's handlers, newest first (db `handledBy`). */
const handlersOf = (fleet: KitFleet, projectId: string, task: string) =>
  fleet.query<ItemRow>(
    "SELECT id, instance_id, state, ended_at FROM work_items WHERE project_id = ? AND handles_kind = 'task' AND handles_id = ? ORDER BY created_at DESC",
    projectId,
    task
  );

/** The sends that carry `marker`, by the session each went to and how they stand. */
const sendsWith = (fleet: KitFleet, marker: string) =>
  fleet.query<{ instance_id: string; state: string }>(
    "SELECT instance_id, state FROM sent_messages WHERE body LIKE ?",
    `%${marker}%`
  );

const spec: Spec = {
  group: "The hub and machines",
  name: "handler-triggers",
  run: async (kit: Kit) => {
    const { check } = kit;
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub", [], { CAWCO_HANDLER_IDLE_MS: String(IDLE_MS) });
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();

    const project = await fleet.api<{ id: string }>(
      hubRequest("POST /api/projects", {
        body: {
          name: "Kitchen refit",
          machineId: MACHINE,
          cwd: fleet.repo,
          caw: true,
        },
      })
    );
    // Handlers and the conversation start in the mode the project names.
    await fleet.api(
      hubRequest("PATCH /api/projects/:id/caw", {
        path: { id: project.id },
        body: { mode: "bypassPermissions", model: MODEL.claude },
      })
    );
    const agentId = await fleet.spawn("claude", "Refit lead", fleet.repo, {
      projectId: project.id,
    });
    const agent = {
      base: fleet.base,
      id: agentId,
      credential: await fleet.sessionCredential(agentId),
    };
    await toolWords(agent, "folder_write", {
      path: "stages.md",
      content: STAGES_MD,
    });
    const file = async (title: string): Promise<string> => {
      const filed = await toolWords(agent, "task_create", {
        title,
        stage: "todo",
      });
      const id = filed.text.match(TASK_ID)?.[0];
      if (!id) {
        throw new Error(`no task filed: ${filed.text.slice(0, 300)}`);
      }
      return id;
    };
    const worktops = await file("Price the oak worktops");
    const finish = await file("Choose the worktop finish");
    const sink = await file("Order the sink");

    // The project's conversation, started by the person's words, then Continued.
    const asked = await fleet.api<{ instanceId: string }>(
      hubRequest("POST /api/projects/:id/view-requests", {
        path: { id: project.id },
        body: { text: "HT-VIEW: show me the tasks by stage." },
      })
    );
    const source = asked.instanceId;
    await until(
      "the conversation's first turn read",
      () => sendsWith(fleet, "HT-VIEW"),
      (rows) => rows.some((row) => row.state === "read"),
      180_000
    );
    const continued = await fleet.api<{ targetInstanceId?: string }>(
      hubRequest("POST /api/instances/:id/continue", {
        path: { id: source },
        body: {
          asksOnly: true,
          target: {
            harness: "claude",
            model: MODEL.claude,
            permissionMode: "bypassPermissions",
          },
        },
      })
    );
    const target = continued.targetInstanceId ?? "";
    await until(
      "the continuation running",
      () => fleet.instance(target)?.status,
      (status) => status === "running",
      240_000
    ).catch(() => undefined);

    const comment = (task: string, text: string) =>
      fleet.api(
        hubRequest("POST /api/projects/:id/tasks/:taskId/comments", {
          path: { id: project.id, taskId: task },
          body: { text },
        })
      );

    // a. The person's comment starts a handler of the task.
    await comment(worktops, "HT-ONE: oak or walnut, whichever ships first.");
    const first = await until(
      "the comment read by a handler of the task",
      () => {
        const [handler] = handlersOf(fleet, project.id, worktops);
        const read = sendsWith(fleet, "HT-ONE").some(
          (row) =>
            row.instance_id === handler?.instance_id && row.state === "read"
        );
        return read ? handler : undefined;
      },
      Boolean,
      180_000
    ).catch(() => undefined);
    const toConversation = sendsWith(fleet, "HT-ONE").filter(
      (row) => row.instance_id === source || row.instance_id === target
    );
    const read = await fleet.api<{ handlers?: { workItemId: string }[] }>(
      hubRequest("GET /api/projects/:id/tasks/:taskId", {
        path: { id: project.id, taskId: worktops },
      })
    );
    check(
      "a: the person's comment on a task of a project whose conversation was continued starts a handler, which reads it; neither the source nor its continuation is sent it; the task lists the handler",
      !!first &&
        toConversation.length === 0 &&
        (read.handlers ?? []).some((one) => one.workItemId === first.id),
      `handler ${JSON.stringify(first)}; to the conversation ${JSON.stringify(toConversation)} (source ${source}, continuation ${target}); task's handlers ${JSON.stringify(read.handlers)}`
    );

    // g1. A second comment while it lives goes to the same handler.
    await comment(worktops, "HT-TWO: and keep the offcuts.");
    const second = await until(
      "the second comment read",
      () => sendsWith(fleet, "HT-TWO"),
      (rows) => rows.some((row) => row.state === "read"),
      QUIET_MS + 60_000
    ).catch(() => sendsWith(fleet, "HT-TWO"));
    const handlers = handlersOf(fleet, project.id, worktops);
    check(
      "g1: a second comment on the task while its handler lives goes to that handler, and no second handler starts",
      !!first &&
        handlers.length === 1 &&
        second.some(
          (row) => row.state === "read" && row.instance_id === first.instance_id
        ),
      `handlers ${JSON.stringify(handlers)}; sends ${JSON.stringify(second)}`
    );

    // g3's handler: one that asks the person, its ask left open.
    await comment(finish, `${calls.words("finish-ask")} which finish?`);
    const asking = await until(
      "a handler of the second task asking",
      () =>
        fleet.query<{ id: string }>(
          "SELECT id FROM asks WHERE state = 'open' AND instance_id = ?",
          handlersOf(fleet, project.id, finish)[0]?.instance_id ?? ""
        ),
      (rows) => rows.length > 0,
      180_000
    ).catch(() => []);

    // g2. Idle with nothing open, the first handler ends.
    const ended = await until(
      "the first handler ended",
      () => handlersOf(fleet, project.id, worktops)[0],
      (row) => row?.state === "done",
      PAST_IDLE_MS + 60_000
    ).catch(() => handlersOf(fleet, project.id, worktops)[0]);
    check(
      "g2: the handler, idle with nothing open, ends done past the idle spell",
      ended?.state === "done",
      `handler ${JSON.stringify(ended)}`
    );

    // g3. The asking one is still live past the idle spell: the hub's sweep
    // says it holds it open (handlers.ts), and it has not ended.
    const [asker] = handlersOf(fleet, project.id, finish);
    const heldLine = await until(
      "the sweep holding the asking handler open",
      async () =>
        (await fleet.logs("hub"))
          .split("\n")
          .find(
            (line) =>
              !!asker &&
              line.includes(handlerWords.heldOpen(asker.id, "").trim())
          ),
      Boolean,
      PAST_IDLE_MS + 60_000
    ).catch(() => undefined);
    const [holding] = handlersOf(fleet, project.id, finish);
    check(
      "g3: a handler with its ask to the person open stays live past the idle spell",
      asking.length > 0 && !!heldLine && holding?.state === "running",
      `asks ${JSON.stringify(asking)}; sweep ${heldLine}; handler ${JSON.stringify(holding)}`
    );

    // h. Caw off: nothing starts.
    await fleet.api(
      hubRequest("PATCH /api/projects/:id/caw", {
        path: { id: project.id },
        body: { on: false, initiated: { stop: [] } },
      })
    );
    await comment(sink, "HT-OFF: the deep one, please.");
    // The quiet spell over, task-input.ts says no handler took it.
    await until(
      "the comment's quiet spell over",
      async () =>
        (await fleet.logs("hub"))
          .split("\n")
          .find(
            (line) =>
              line.includes(`what you wrote on ${sink}`) &&
              line.includes(handlerWords.cawOff)
          ),
      Boolean,
      QUIET_MS + 60_000
    ).catch(() => undefined);
    const offHandlers = handlersOf(fleet, project.id, sink);
    const offSends = sendsWith(fleet, "HT-OFF");
    check(
      "h: with Caw off, the person's comment on a task starts no handler and reaches no session",
      offHandlers.length === 0 && offSends.length === 0,
      `handlers ${JSON.stringify(offHandlers)}; sends ${JSON.stringify(offSends)}`
    );
  },
};

export default spec;

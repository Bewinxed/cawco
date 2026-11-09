/**
 * In a project where review is off (the code template, Review before done
 * off), a done attempt whose acceptance lines Jev does not show met lands
 * as a failed attempt does: back in the todo stage with Jev's "Not shown
 * met" comment, its work kept, and nothing reaches the person (hub
 * dispatch.ts `judgeCriteria`). Cawco-Dev, 2026-11-07: such tasks piled up
 * in its Review, a stage of kind `you`, for the owner.
 *
 * On an in-process hub (hub-in-process.ts) listening on loopback, its
 * project's checkout on a stand-in machine that registers over the hub's
 * socket and answers its calls. Jev's route is answered in this process.
 * Each attempt is a work item on a host-scope workspace (no clone to gate),
 * its session's finish_item going through its own door
 * (`/api/delegation/call/:instanceId`, its minted credential).
 *
 * - a. Jev scores every line 0.44: the task leaves working for ready (its
 *   todo stage), not review; its last comment is Jev's "Not shown met"
 *   naming both lines. On main it went to review.
 * - b. It counts as a failed attempt: the task reads its last attempt
 *   failed, saying Jev did not show its criteria met, and stands off the
 *   dispatch frontier, so the hub does not start it again on its own. On
 *   main a done attempt's task in ready was on the frontier.
 * - c. Jev failing (its route answers 500): the task stays in working,
 *   with a comment saying its work stays landed, not in a `you` stage.
 * - d. Jev off and events on, on the code template as the hub has it (a
 *   session sends a task from working back to ready): the project's
 *   conversation is woken to judge the lines and the task stays in
 *   working; its move of the task back to ready (the lead's verdict, dispatch.ts `leadSentBack`) counts the
 *   attempt failed, so the task stands off the frontier. On main the
 *   attempt still read done and the task was on the frontier, and the code
 *   template gave a session no working → ready, so the lead's move was refused.
 * - e. A project whose stages.md is the code template as it was before
 *   working → ready still reads as the code template (stages.ts
 *   `isCodeTemplate`): the hub drops the copy as it catches the project up,
 *   and the project reads today's template.
 *
 *   bun scripts/probe-kit/run.ts unmet-back-to-todo
 */
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PRESENCE_HEADER } from "../../../packages/core/src/browser-gate";
import { CAWCO_ENV } from "../../../packages/core/src/cawco-env";
import {
  fetchHub,
  type HubRequest,
  hubInit,
  hubRequest,
} from "../../../packages/core/src/hub-request";
import { machinePath } from "../../../packages/core/src/machine-path";
import { judgedWords } from "../../../packages/core/src/words/judged";
import { CONTROL_HOST_OUTPUTS } from "../../../packages/core/src/workspace/controls";
import type { hubInProcess as inProcess } from "../../../packages/hub/scripts/hub-in-process";
import type { DispatchView } from "../../../packages/hub/src/dispatch";
import type { TaskView } from "../../../packages/hub/src/tasks";
import { type ToolSession, toolWords } from "../../lib/tool-call";
import type { Kit, Spec } from "../kit";

const B = "probe-unmet-machine";
const PRESENCE = "probe-presence-9c21";
const TYPESAFE = "https://api.typesafe.ai/";
/** What Jev scores every line: under its 0.8. */
const LOW = 0.44;

const ACCEPTANCE = [
  "The tray chip never overflows its row at 390 wide",
  "The chip's label truncates with an ellipsis and keeps its full text in a tooltip",
];

type HubDb = Awaited<ReturnType<typeof inProcess>>["db"];

interface Answer {
  json: unknown;
  status: number;
  text: string;
}

interface Rig {
  base: string;
  board: (request: HubRequest) => Promise<Answer>;
  checkout: ReturnType<typeof machinePath>;
  db: HubDb;
  identities: { mint: (instanceId: string) => string };
  kit: Kit;
  parent: string;
  projectId: string;
}

/** How Jev's route answers: every line scored {@link LOW}, or a 500. */
const jev: { fails: boolean } = { fails: false };

/** Jev's route answered here, as {@link jev} says. */
const answerJev = (): void => {
  const real = globalThis.fetch;
  const fake = (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.startsWith(TYPESAFE)) {
      return real(input, init);
    }
    if (jev.fails) {
      return Promise.resolve(
        Response.json({ error: "probe: Jev is down" }, { status: 500 })
      );
    }
    const asked = JSON.parse(String(init?.body ?? "{}")) as {
      questions?: Record<string, unknown>;
    };
    const answers = Object.fromEntries(
      Object.keys(asked.questions ?? {}).map((key) => [key, { noul: LOW }])
    );
    return Promise.resolve(
      Response.json({
        answers,
        model: "jev-probe",
        usage: { input_tokens: 0, output_tokens: 0, cost: 0 },
      })
    );
  };
  globalThis.fetch = Object.assign(fake, real);
};

/** The stand-in machine: registers over the hub's socket, answers a host workspace's outputs as empty and every other call with nothing. */
const standIn = async (base: string, home: string): Promise<WebSocket> => {
  const socket = new WebSocket(`${base.replace("http", "ws")}/ws`);
  socket.addEventListener("message", (event) => {
    const frame = JSON.parse(String(event.data)) as {
      payload?: { method?: string; requestId?: string };
      verb?: string;
    };
    if (frame.verb !== "control" || !frame.payload?.method) {
      return;
    }
    const { method, requestId } = frame.payload;
    socket.send(
      JSON.stringify({
        verb: "frames",
        machineId: B,
        payload: {
          kind: "control_result",
          requestId,
          ok: true,
          result:
            method === CONTROL_HOST_OUTPUTS ? { files: [], listed: [] } : null,
        },
      })
    );
  });
  await new Promise<void>((done, fail) => {
    socket.addEventListener("open", () => done(), { once: true });
    socket.addEventListener(
      "error",
      () => fail(new Error("the stand-in's socket did not open")),
      { once: true }
    );
  });
  socket.send(
    JSON.stringify({
      verb: "register",
      machineId: B,
      payload: {
        machineId: B,
        hostname: B,
        os: "linux",
        home,
        auth: { state: "signed-out" },
      },
    })
  );
  return socket;
};

/** A session of the project on the stand-in. */
const openSession = (
  rig: Pick<Rig, "checkout" | "db" | "projectId">,
  extra: {
    parentInstanceId?: string;
    role?: "delegate";
    title: string;
    workItemId?: string;
  }
): string => {
  const id = crypto.randomUUID();
  rig.db.openInstance({
    id,
    machineId: B,
    cwd: rig.checkout,
    sessionId: crypto.randomUUID(),
    harness: "claude",
    origin: extra.role ? "delegate" : "person",
    projectId: rig.projectId,
    kind: "mainline",
    permissionMode: "bypassPermissions",
    model: "model-a",
    ...extra,
  });
  return id;
};

/**
 * A live attempt at `taskId` as a work item on a host-scope workspace (no
 * clone to gate), reporting to the rig's parent: its session, through its
 * own door.
 */
const attempt = (rig: Rig, taskId: string, title: string): ToolSession => {
  const workItemId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();
  const instanceId = openSession(rig, {
    parentInstanceId: rig.parent,
    role: "delegate",
    title,
    workItemId,
  });
  rig.db.createWorkspace({
    id: workspaceId,
    machineId: B,
    repoRoot: rig.checkout,
    path: rig.checkout,
    branch: `ws/${workspaceId.slice(0, 8)}`,
    createdByInstanceId: rig.parent,
    createdAt: new Date(),
    host: true,
  });
  rig.db.createWorkItem({
    id: workItemId,
    workspaceId,
    parentInstanceId: rig.parent,
    instanceId,
    brief: title,
    title,
    type: "medium",
    harness: "claude",
    createdAt: new Date(),
    projectId: rig.projectId,
    taskId,
    lands: "none",
    state: "running",
  });
  return {
    base: rig.base,
    id: instanceId,
    credential: rig.identities.mint(instanceId),
  };
};

const read = async (rig: Rig, id: string): Promise<TaskView> =>
  (
    await rig.board(
      hubRequest("GET /api/projects/:id/tasks/:taskId", {
        path: { id: rig.projectId, taskId: id },
      })
    )
  ).json as TaskView;

/** Until the task has left `from` or holds more than `comments` comments, up to 20 s: the task then. */
const settled = async (
  rig: Rig,
  id: string,
  from: string,
  comments: number
): Promise<TaskView> => {
  const deadline = Date.now() + 20_000;
  let task = await read(rig, id);
  while (
    task.stage === from &&
    task.comments.length <= comments &&
    Date.now() < deadline
  ) {
    await Bun.sleep(100);
    task = await read(rig, id);
  }
  // The move follows the comment in one settle: give it its moment.
  await Bun.sleep(300);
  return await read(rig, id);
};

/** A task in working with a live attempt, filed and moved as the person does; its attempt finishes, and the task once the hub settled it. */
const built = async (
  rig: Rig,
  title: string,
  /** Where the hub leaves it without a comment: read once its attempt has ended. */
  judgedElsewhere = false
): Promise<TaskView> => {
  const made = await rig.board(
    hubRequest("POST /api/projects/:id/tasks", {
      path: { id: rig.projectId },
      body: {
        title,
        acceptance: ACCEPTANCE.map((line) => `- ${line}`).join("\n"),
      },
    })
  );
  const { id } = made.json as { id: string };
  const builder = attempt(rig, id, title);
  const moved = await rig.board(
    hubRequest("POST /api/projects/:id/tasks/:taskId/stage", {
      path: { id: rig.projectId, taskId: id },
      body: { stage: "working" },
    })
  );
  if (moved.status >= 400) {
    throw new Error(`${id} did not go to working: ${moved.text}`);
  }
  const before = (await read(rig, id)).comments.length;
  const finished = await toolWords(builder, "finish_item", {
    headline: "The tray chip fits its row.",
    summary:
      "The chip's row wraps at 390 and its label truncates. See the diff.",
  });
  if (finished.refused) {
    throw new Error(
      `${id}'s attempt could not finish: ${finished.status} ${finished.text}`
    );
  }
  if (judgedElsewhere) {
    const deadline = Date.now() + 20_000;
    let task = await read(rig, id);
    while (task.attempts[0]?.state !== "done" && Date.now() < deadline) {
      await Bun.sleep(100);
      task = await read(rig, id);
    }
    await Bun.sleep(300);
    return await read(rig, id);
  }
  return await settled(rig, id, "working", before);
};

const legs = async (rig: Rig): Promise<void> => {
  const { kit } = rig;

  // (a) Jev scores the lines low: back to ready with its comment.
  const a = await built(rig, "Fix the tray chip overflow");
  const said = a.comments.at(-1)?.text ?? "";
  kit.check(
    "a: a done attempt Jev does not show met sends its task to ready, its todo stage, not review",
    a.stage === "ready" && a.kind === "todo",
    `${a.id} is in ${a.stage} (${a.kind})`
  );
  kit.check(
    "a: its last comment is Jev's, naming both lines not shown met",
    said.includes(judgedWords.notShownMetHead) &&
      ACCEPTANCE.every((line) => said.includes(line)),
    said.slice(0, 400)
  );

  // (b) It counts as a failed attempt: off the frontier.
  const view = (
    await rig.board(
      hubRequest("GET /api/projects/:id/dispatch", {
        path: { id: rig.projectId },
      })
    )
  ).json as DispatchView;
  kit.check(
    "b: the task reads its last attempt failed, saying Jev did not show its criteria met",
    a.lastAttemptFailed &&
      a.attempts[0]?.state === "done" &&
      a.attempts[0]?.endedHow === judgedWords.unmetHow,
    JSON.stringify({
      failed: a.lastAttemptFailed,
      attempt: a.attempts[0]
        ? { state: a.attempts[0].state, endedHow: a.attempts[0].endedHow }
        : null,
    })
  );
  kit.check(
    "b: it stands off the dispatch frontier, so the hub does not start it again on its own",
    !view.frontier.includes(a.id),
    `frontier ${JSON.stringify(view.frontier)}`
  );

  // (c) Jev failing: the task stays where its attempt left it.
  jev.fails = true;
  const c = await built(rig, "Fix the tray chip label");
  jev.fails = false;
  const cSaid = c.comments.at(-1)?.text ?? "";
  const named = "ATTEMPT";
  const whole = judgedWords.notJudged("Jev failed.", named, "working");
  const stays = whole.slice(whole.indexOf(named) + named.length);
  kit.check(
    "c: Jev failing leaves the task in working, not in a you stage",
    c.stage === "working",
    `${c.id} is in ${c.stage} (${c.kind})`
  );
  kit.check(
    "c: its comment says the work stays landed",
    cSaid.endsWith(stays),
    cSaid.slice(0, 400)
  );

  // (d) Jev off, events on: the lead judges, and its move back is its verdict.
  // The project reads the code template as the hub has it, nothing added.
  rig.db.setTypesafeKey(null);
  rig.db.setProjectCaw(rig.projectId, {
    eventsOn: true,
    conversationInstanceId: rig.parent,
  });
  const d = await built(rig, "Fix the tray chip tooltip", true);
  kit.check(
    "d: Jev off, events on: the task stays in working for its lead to judge",
    d.stage === "working" && d.attempts[0]?.state === "done",
    `${d.id} is in ${d.stage}, its attempt ${d.attempts[0]?.state}`
  );
  const lead: ToolSession = {
    base: rig.base,
    id: rig.parent,
    credential: rig.identities.mint(rig.parent),
  };
  const back = await toolWords(lead, "task_update", {
    id: d.id,
    stage: "ready",
    reason: "the tooltip line is not shown met",
  });
  await Bun.sleep(500);
  const dBack = await read(rig, d.id);
  const dView = (
    await rig.board(
      hubRequest("GET /api/projects/:id/dispatch", {
        path: { id: rig.projectId },
      })
    )
  ).json as DispatchView;
  kit.check(
    "d: the lead's move back to ready counts the attempt failed, and the task stands off the frontier",
    !back.refused &&
      dBack.stage === "ready" &&
      dBack.lastAttemptFailed &&
      !dView.frontier.includes(d.id),
    JSON.stringify({
      moved: back.text.slice(0, 160),
      stage: dBack.stage,
      failed: dBack.lastAttemptFailed,
      frontier: dView.frontier,
    })
  );

  // (e) A project made on the code template before working → ready.
  const { isCodeTemplate, templateText } =
    await import("../../../packages/hub/src/stages");
  const today = templateText("code");
  const before = today.replace("  working → ready      session\n", "");
  const old = crypto.randomUUID();
  rig.db.createProject({
    id: old,
    name: "Old code probe",
    checkout: { machineId: B, path: rig.checkout },
    remote: null,
  });
  const { writeFolderFile } =
    await import("../../../packages/hub/src/project-folder");
  const committed = await writeFolderFile(old, "stages.md", before, {
    author: { name: "probe" },
  });
  if (!("sha" in committed)) {
    throw new Error(committed.response.detail);
  }
  const { createTasks } = await import("../../../packages/hub/src/tasks");
  const engine = createTasks({
    project: (id) => rig.db.project(id),
    machines: () => rig.db.listAgents(),
    projectIds: () => rig.db.listProjects().map((one) => one.id),
    index: rig.db.taskIndex,
    waiters: rig.db.taskWaiters,
    put: rig.db.putTaskIndex,
    drop: rig.db.dropTaskIndex,
    links: () => [],
    carried: () => [],
    linked: () => [],
    starters: () => [],
    setTemplate: (id, template) => rig.db.setProjectTemplate(id, template),
    attempts: rig.db.projectAttempts,
    commentSaid: rig.db.taskCommentSaid,
    noteComment: rig.db.noteTaskComment,
    saveResult: () => undefined,
    resolvesType: () => false,
    waitWorld: () => ({}) as never,
    waitReader: () => ({}) as never,
  });
  await engine.catchUp(old);
  const oldStages = (
    await rig.board(
      hubRequest("GET /api/projects/:id/stages", { path: { id: old } })
    )
  ).json as { moves: { from: string; to: string }[]; source: string };
  kit.check(
    "e: a stages.md written from the code template before working → ready reads as the code template, and the project then reads today's, working → ready in it",
    before !== today &&
      isCodeTemplate(before) &&
      oldStages.source === "template" &&
      rig.db.project(old)?.template === "code" &&
      oldStages.moves.some(
        (move) => move.from === "working" && move.to === "ready"
      ),
    JSON.stringify({
      reads: isCodeTemplate(before),
      source: oldStages.source,
      template: rig.db.project(old)?.template,
    })
  );
};

export default {
  group: "The hub and machines",
  name: "unmet-back-to-todo",
  ownProcess:
    "its in-process hub (hub-in-process.ts) reads CAWCO_DB_PATH and HOME once, as the hub's modules load",
  run: async (kit: Kit) => {
    const scratch = await mkdtemp(
      join(process.env.TMPDIR ?? tmpdir(), "unmet-back-to-todo-")
    );
    let socket: WebSocket | undefined;
    try {
      answerJev();
      const { hubInProcess } =
        await import("../../../packages/hub/scripts/hub-in-process");
      const { db, hub } = await hubInProcess(
        join(scratch, "hub", "hub.db"),
        join(scratch, "home")
      );
      const { createSessionIdentities } =
        await import("../../../packages/hub/src/session-identity");
      const listening = (
        hub as unknown as {
          listen: (options: object) => { server?: { port?: number } };
        }
      ).listen({ hostname: "127.0.0.1", port: 0 });
      const base = `http://127.0.0.1:${listening.server?.port ?? 0}`;
      // A session's tool posts to the hub's own URL (hub-self.ts `hubHttpUrl`): this one.
      process.env[CAWCO_ENV.hubUrl] = `${base.replace("http", "ws")}/ws`;
      for (let tries = 0; tries < 50; tries += 1) {
        if (
          await fetchHub(fetch, base, hubRequest("GET /health")).then(
            (r) => r.ok,
            () => false
          )
        ) {
          break;
        }
        await Bun.sleep(100);
      }
      const home = join(scratch, "disk", "home");
      const path = join(home, "src", "cockpit");
      await mkdir(path, { recursive: true });
      socket = await standIn(base, home);
      for (let tries = 0; tries < 50; tries += 1) {
        if (db.listAgents().some((one) => one.machineId === B)) {
          break;
        }
        await Bun.sleep(100);
      }
      db.setTypesafeKey("probe-key");
      const checkout = machinePath(home, path, B);
      const projectId = crypto.randomUUID();
      db.createProject({
        id: projectId,
        name: "Cawco-Dev probe",
        checkout: { machineId: B, path: checkout },
        remote: null,
      });
      // The code template, its Review before done off: review is off.
      db.setProjectTemplate(projectId, "code");
      const board = async (request: HubRequest): Promise<Answer> => {
        const response = await hub.handle(
          new Request(
            `http://127.0.0.1${request.path}`,
            hubInit(request, { headers: { [PRESENCE_HEADER]: PRESENCE } })
          )
        );
        const text = await response.text();
        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {
          json = undefined;
        }
        return { json, status: response.status, text };
      };
      const shell = { checkout, db, projectId };
      const rig: Rig = {
        base,
        board,
        checkout,
        db,
        identities: createSessionIdentities(db),
        kit,
        parent: openSession(shell, { title: "Cawco-Dev's orchestrator" }),
        projectId,
      };
      await legs(rig);
    } finally {
      socket?.close();
      await rm(scratch, { recursive: true, force: true });
    }
  },
} satisfies Spec;

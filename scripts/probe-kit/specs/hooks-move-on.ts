/**
 * A stages.md with no moves section reads as `* → *  you, session`, and the
 * routine gets one move from each stage whose `after:` or `until:` holds a
 * task, on to the next stage that is not dropped (hub stages.ts `heldOn`), so
 * waits.ts moves the task as the hook says.
 *
 * On an in-process hub (hub-in-process.ts) over a scratch database, a
 * session (`task_update` on `/api/delegation/call/:instanceId`, its minted
 * credential) puts a task in a project whose `you` stage holds it
 * `after: 1m` and whose waiting stage holds it `until: post_at`:
 *
 * - a. The routine moves it on from each to the next stage. Before
 *   `heldOn`, the routine had no move, and it stayed.
 *
 *   bun scripts/probe-kit/run.ts hooks-move-on
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refusalWords } from "../../../packages/core/src/hub-refusal";
import {
  type HubRequest,
  hubInit,
  hubRequest,
} from "../../../packages/core/src/hub-request";
import { machinePath } from "../../../packages/core/src/machine-path";
import type { TaskHistory } from "../../../packages/core/src/task-views";
import type { hubInProcess as inProcess } from "../../../packages/hub/scripts/hub-in-process";
import type { TaskView } from "../../../packages/hub/src/tasks";
import { type ToolSession, toolWords } from "../../lib/tool-call";
import type { Kit, Spec } from "../kit";

const MACHINE = "probe-hooks-machine";

/** Stage lines only, two of them holding a task until a routine moves it on. */
const HOOKED = `---
inbox       todo
your-call   you       after: 1m
scheduled   waiting   until: post_at
sent        done
dropped     dropped
---
`;

interface Answer {
  status: number;
  text: string;
}

type Db = Awaited<ReturnType<typeof inProcess>>["db"];

interface Rig {
  /** A board call, as the person. */
  board: (request: HubRequest) => Promise<Answer>;
  db: Db;
  /** A `task_update` of `id`'s own fields as the project's session. */
  fields: (
    projectId: string,
    id: string,
    fields: Record<string, string>
  ) => Promise<{ refused: boolean; text: string }>;
  kit: Kit;
  /** A `task_update` of `id` to `stage` as the project's session; its answer's words. */
  session: (
    projectId: string,
    id: string,
    stage: string
  ) => Promise<{ refused: boolean; text: string }>;
}

const run = async (
  kit: Kit,
  scratch: string,
  serve: (handle: (request: Request) => Promise<Response>) => string
): Promise<void> => {
  const { check } = kit;
  const { hubInProcess } =
    await import("../../../packages/hub/scripts/hub-in-process");
  const { db, hub, lifetime } = await hubInProcess(
    join(scratch, "hub", "hub.db"),
    join(scratch, "home")
  );
  const { writeFolderFile } =
    await import("../../../packages/hub/src/project-folder");
  const { createSessionIdentities } =
    await import("../../../packages/hub/src/session-identity");
  const identities = createSessionIdentities(db);
  db.upsertAgent({
    machineId: MACHINE,
    hostname: `${MACHINE}.local`,
    os: "linux",
    auth: "unknown",
  });

  const handle = async (request: Request): Promise<Answer> => {
    const response = await hub.handle(request);
    return {
      status: response.status,
      text: response.ok
        ? await response.text()
        : refusalWords(await response.text(), response.status),
    };
  };
  // The session's door is reached as `cawco tool` reaches it: over HTTP.
  const base = serve((request) => hub.handle(request));
  /** Each project's session: the hub, its id and its credential. */
  const sessions = new Map<string, ToolSession>();
  const sessionOf = (projectId: string): ToolSession => {
    const one = sessions.get(projectId);
    if (!one) {
      throw new Error(`no session in ${projectId}`);
    }
    return one;
  };
  const rig: Rig = {
    db,
    kit,
    board: (request) =>
      handle(new Request(`http://127.0.0.1${request.path}`, hubInit(request))),
    session: (projectId, id, stage) =>
      toolWords(sessionOf(projectId), "task_update", { id, stage }),
    fields: (projectId, id, fields) =>
      toolWords(sessionOf(projectId), "task_update", { id, fields }),
  };

  /** A project with a session working in it, its stages as `stages` writes them. */
  const project = async (name: string, stages: string): Promise<string> => {
    const id = crypto.randomUUID();
    const path = `/home/probe/src/${name.toLowerCase().replace(/\W+/gu, "-")}`;
    db.createProject({
      id,
      name,
      checkout: {
        machineId: MACHINE,
        path: machinePath("/home/probe", path, MACHINE),
      },
      remote: null,
    });
    await writeFolderFile(id, "stages.md", stages, {
      author: { name: "probe" },
    });
    const session = crypto.randomUUID();
    db.openInstance({
      id: session,
      machineId: MACHINE,
      cwd: machinePath("/home/probe", path, MACHINE),
      sessionId: crypto.randomUUID(),
      harness: "claude",
      origin: "person",
      projectId: id,
      title: `${name}'s session`,
      kind: "mainline",
      permissionMode: "bypassPermissions",
      model: "model-a",
    });
    sessions.set(id, {
      base,
      id: session,
      credential: identities.mint(session),
    });
    return id;
  };

  const file = async (projectId: string, title: string): Promise<string> => {
    const made = await rig.board(
      hubRequest("POST /api/projects/:id/tasks", {
        path: { id: projectId },
        body: { title },
      })
    );
    const id = (JSON.parse(made.text) as { id?: string }).id ?? "";
    if (!id) {
      throw new Error(`the task was not filed: ${made.status} ${made.text}`);
    }
    return id;
  };
  const stageOf = async (projectId: string, id: string): Promise<string> => {
    const read = await rig.board(
      hubRequest("GET /api/projects/:id/tasks/:taskId", {
        path: { id: projectId, taskId: id },
      })
    );
    return (JSON.parse(read.text) as TaskView).stage;
  };
  /**
   * The routine as the hub runs it (waits.ts) over the hub's database and
   * folders, for one project, its clock a few minutes on so a minute's hold
   * is over: where `taskId` is once it reached `to` (or gave up), and the
   * move that took it there.
   */
  const routineRun = async (projectId: string, taskId: string, to: string) => {
    const { createWaits } = await import("../../../packages/hub/src/waits");
    const waits = createWaits({
      lifetime,
      tasks: await routineTasks(db),
      projectIds: () => [projectId],
    });
    const { now } = Date;
    Date.now = () => now() + 5 * 60_000;
    let moved = "";
    try {
      waits.start();
      for (let tries = 0; tries < 100 && moved !== to; tries += 1) {
        await Bun.sleep(100);
        moved = await stageOf(projectId, taskId);
      }
    } finally {
      Date.now = now;
    }
    const history = JSON.parse(
      (
        await rig.board(
          hubRequest("GET /api/projects/:id/tasks/:taskId/history", {
            path: { id: projectId, taskId },
          })
        )
      ).text
    ) as TaskHistory;
    return {
      moved,
      event: history.events.findLast((event) => event.stage?.to === to),
    };
  };

  // (a) With no moves section, each stage's hook moves a task on to the next stage.
  const hooked = await project("Hooked probe", HOOKED);
  const hookedTask = await file(hooked, "Post the launch note");
  await rig.session(hooked, hookedTask, "your-call");
  const afterRun = await routineRun(hooked, hookedTask, "scheduled");
  check(
    "a: no moves section: Your call's after: 1m moves it on to scheduled, as the routine",
    afterRun.moved === "scheduled" && afterRun.event?.actor.mover === "routine",
    JSON.stringify(afterRun)
  );
  const dated = await rig.fields(hooked, hookedTask, {
    post_at: "2026-01-01T09:00:00Z",
  });
  const untilRun = await routineRun(hooked, hookedTask, "sent");
  check(
    "a: no moves section: scheduled's until: post_at, passed, moves it on to sent, as the routine",
    !dated.refused &&
      untilRun.moved === "sent" &&
      untilRun.event?.actor.mover === "routine",
    JSON.stringify({ dated: dated.text.slice(0, 120), ...untilRun })
  );
};

/**
 * The hub's task engine (tasks.ts `createTasks`) over its database, for the
 * routine: what server.ts hands it, with nothing of attempts, links or waits
 * a stage move here reads.
 */
const routineTasks = async (db: Db) => {
  const { createTasks } = await import("../../../packages/hub/src/tasks");
  return createTasks({
    project: (id) => db.project(id),
    machines: () => db.listAgents(),
    projectIds: () => db.listProjects().map((one) => one.id),
    index: db.taskIndex,
    waiters: db.taskWaiters,
    put: db.putTaskIndex,
    drop: db.dropTaskIndex,
    links: () => [],
    carried: () => [],
    linked: () => [],
    starters: () => [],
    setTemplate: (id, template) => db.setProjectTemplate(id, template),
    attempts: db.projectAttempts,
    commentSaid: db.taskCommentSaid,
    noteComment: db.noteTaskComment,
    saveResult: () => undefined,
    resolvesType: () => false,
    waitWorld: () => ({}) as never,
    waitReader: () => ({}) as never,
  });
};

export default {
  group: "The hub and machines",
  name: "hooks-move-on",
  ownProcess:
    "its in-process hub (hub-in-process.ts) reads CAWCO_DB_PATH and HOME once, as the hub's modules load",
  run: async (kit: Kit) => {
    const scratch = await mkdtemp(
      join(process.env.TMPDIR ?? tmpdir(), "hooks-move-on-")
    );
    let served: ReturnType<typeof Bun.serve> | undefined;
    try {
      await run(kit, scratch, (handle) => {
        served = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: handle });
        return `http://127.0.0.1:${served.port}`;
      });
    } finally {
      served?.stop(true);
      await rm(scratch, { recursive: true, force: true });
    }
  },
} satisfies Spec;

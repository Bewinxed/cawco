/**
 * A task in a stage of kind `you` waits for the person (hub stages.ts
 * `youStageLets`): a session only sends it back, to a stage before it that
 * is not dropped; his own move, an approved action, the stage's own routine
 * or the hub takes it on or drops it. Private office, 2026-11-06: its
 * stages.md had no moves section, so it read as `* → *  you, session`, and
 * Caw moved tsk-8 from Your call on to drafting with no word from him.
 *
 * On an in-process hub (hub-in-process.ts) over a scratch database, the
 * session's moves go through its own door (`task_update` on
 * `/api/delegation/call/:instanceId`, its minted credential), his through
 * the board's (`POST /api/projects/:id/tasks/:taskId/stage`), each with a
 * task in the project's `you` stage:
 *
 * - a. An own-shaped project with no moves section (inbox, drafting, Your
 *   call, scheduled, sent, dropped): a session moving the task on to
 *   scheduled and to sent is refused with the sentence naming the stages it
 *   may send it back to; its drop is refused; its move back to inbox goes.
 *   On main, each of the three went.
 * - b. The code template, its Review before done off: a session's review →
 *   done and review → dropped are refused; review → ready goes. On main,
 *   review → done and the drop went.
 * - c. His move on from the `you` stage goes in each, its history's reason
 *   `approved`.
 * - d. The stage's own routine (waits.ts, `after: 1m`) moves a task on from
 *   a `you` stage whose moves give the routine that move, where a session's
 *   same move under `* → *  you, session` is refused. A project with no
 *   moves section gives a routine no move at all, before this and after.
 * - e. A stages.md written from the code template as it was until now (its
 *   `review → done  session` line) still reads as the code template
 *   (`isCodeTemplate`), as today's does, and today's names the code
 *   template by its moves (`templateOf`).
 *
 *   bun scripts/probe-kit/run.ts you-stage-holds
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TaskHistory } from "../../../packages/core/src";
import {
  type HubRequest,
  hubInit,
  hubRequest,
} from "../../../packages/core/src/hub-request";
import { machinePath } from "../../../packages/core/src/machine-path";
import type { hubInProcess as inProcess } from "../../../packages/hub/scripts/hub-in-process";
import type { TaskView } from "../../../packages/hub/src/tasks";
import { type ToolSession, toolWords } from "../../lib/tool-call";
import type { Kit, Spec } from "../kit";

const MACHINE = "probe-you-stage-machine";

/** Private office's shape: stage lines only, so the hub reads `* → *  you, session`. */
const OWN = `---
inbox       todo
drafting    active
your-call   you
scheduled   waiting
sent        done
dropped     dropped
---
`;

/** A `you` stage its routine moves on after a minute; sessions are given every move. */
const TIMED = `---
inbox       todo
your-call   you      after: 1m
sent        done
dropped     dropped
moves
  * → *              you, session
  your-call → sent   routine
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
  kit: Kit;
  /** A `task_update` of `id` to `stage` as the project's session; its answer's words. */
  session: (
    projectId: string,
    id: string,
    stage: string,
    reason?: string
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
    return { status: response.status, text: await response.text() };
  };
  // The session's door is reached as `cawco tool` reaches it: over HTTP.
  const base = serve((request) => hub.handle(request));
  /** Each project's session: the hub, its id and its credential. */
  const sessions = new Map<string, ToolSession>();
  const rig: Rig = {
    db,
    kit,
    board: (request) =>
      handle(new Request(`http://127.0.0.1${request.path}`, hubInit(request))),
    session: (projectId, id, stage, reason) => {
      const one = sessions.get(projectId);
      if (!one) {
        throw new Error(`no session in ${projectId}`);
      }
      return reason
        ? toolWords(one, "task_update", { id, stage, reason })
        : toolWords(one, "task_update", { id, stage });
    },
  };

  /** A project with a session working in it, its stages as `stages` writes them (none: the code template). */
  const project = async (name: string, stages?: string): Promise<string> => {
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
    if (stages) {
      await writeFolderFile(id, "stages.md", stages, {
        author: { name: "probe" },
      });
    } else {
      db.setProjectTemplate(id, "code");
    }
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
  const hisMove = async (projectId: string, id: string, stage: string) => {
    const moved = await rig.board(
      hubRequest("POST /api/projects/:id/tasks/:taskId/stage", {
        path: { id: projectId, taskId: id },
        body: { stage },
      })
    );
    const history = JSON.parse(
      (
        await rig.board(
          hubRequest("GET /api/projects/:id/tasks/:taskId/history", {
            path: { id: projectId, taskId: id },
          })
        )
      ).text
    ) as TaskHistory;
    const last = history.events.findLast((event) => event.stage?.to === stage);
    return { status: moved.status, text: moved.text, reason: last?.reason };
  };

  // (a) An own-shaped project with no moves section.
  const own = await project("Private office probe", OWN);
  const ownTask = await file(own, "Draft the quarterly letter");
  const into = await rig.session(
    own,
    ownTask,
    "your-call",
    "the draft is ready for his call"
  );
  check(
    "a: a session puts the task in Your call (a stage of kind you)",
    !into.refused && (await stageOf(own, ownTask)) === "your-call",
    into.text
  );
  const held = (from: string, to: string, open: string) =>
    `cannot go from ${from} to ${to}: it waits for the person in ${from}, and only their own move, an approved action or ${from}'s own routine takes it on or drops it. From ${from}, a session can send it back to ${open}, or ask the person to move it.`;
  for (const to of ["scheduled", "sent"]) {
    const on = await rig.session(own, ownTask, to);
    check(
      `a: no moves section: a session moving it on to ${to} is refused, naming where it can send it back`,
      on.refused &&
        on.text.includes(held("your-call", to, "inbox or drafting")) &&
        (await stageOf(own, ownTask)) === "your-call",
      on.text
    );
  }
  const drop = await rig.session(own, ownTask, "dropped", "out of scope");
  check(
    "a: no moves section: a session dropping it is refused",
    drop.refused &&
      drop.text.includes(held("your-call", "dropped", "inbox or drafting")) &&
      (await stageOf(own, ownTask)) === "your-call",
    drop.text
  );
  const back = await rig.session(own, ownTask, "inbox", "needs another pass");
  check(
    "a: no moves section: a session sending it back to inbox goes",
    !back.refused && (await stageOf(own, ownTask)) === "inbox",
    back.text
  );
  await rig.session(own, ownTask, "your-call");
  const ownHis = await hisMove(own, ownTask, "scheduled");
  check(
    "c: no moves section: his move on to scheduled goes, its reason approved",
    ownHis.status === 200 &&
      ownHis.reason === "approved" &&
      (await stageOf(own, ownTask)) === "scheduled",
    `${ownHis.status}, reason ${ownHis.reason}`
  );

  // (b) The code template, Review before done off.
  const code = await project("Code probe");
  const codeTask = await file(code, "Fix the tray chip overflow");
  await rig.session(code, codeTask, "review");
  check(
    "b: code template: a session puts the task in review",
    (await stageOf(code, codeTask)) === "review"
  );
  const done = await rig.session(code, codeTask, "done");
  check(
    "b: code template: a session's review → done is refused, naming where it can send it back",
    done.refused &&
      done.text.includes(held("review", "done", "ready or working")) &&
      (await stageOf(code, codeTask)) === "review",
    done.text
  );
  const codeDrop = await rig.session(code, codeTask, "dropped", "out of scope");
  check(
    "b: code template: a session's review → dropped is refused",
    codeDrop.refused &&
      codeDrop.text.includes(held("review", "dropped", "ready or working")) &&
      (await stageOf(code, codeTask)) === "review",
    codeDrop.text
  );
  const codeBack = await rig.session(
    code,
    codeTask,
    "ready",
    "the fix needs a test"
  );
  check(
    "b: code template: a session's review → ready goes",
    !codeBack.refused && (await stageOf(code, codeTask)) === "ready",
    codeBack.text
  );
  await rig.session(code, codeTask, "review");
  const codeHis = await hisMove(code, codeTask, "done");
  check(
    "c: code template: his review → done goes, its reason approved",
    codeHis.status === 200 &&
      codeHis.reason === "approved" &&
      (await stageOf(code, codeTask)) === "done",
    `${codeHis.status}, reason ${codeHis.reason}`
  );

  // (d) The stage's own routine, a minute on.
  const timed = await project("Timed probe", TIMED);
  const timedTask = await file(timed, "Send the invoice reminder");
  await rig.session(timed, timedTask, "your-call");
  const sessionOn = await rig.session(timed, timedTask, "sent");
  check(
    "d: under * → * you, session, a session's your-call → sent is refused",
    sessionOn.refused &&
      sessionOn.text.includes(held("your-call", "sent", "inbox")) &&
      (await stageOf(timed, timedTask)) === "your-call",
    sessionOn.text
  );
  // The routine as the hub runs it (waits.ts), over the hub's database and
  // folders, its clock a few minutes on so the minute's hold is over.
  const { createWaits } = await import("../../../packages/hub/src/waits");
  const tasks = await routineTasks(db);
  const waits = createWaits({
    lifetime,
    tasks,
    projectIds: () => [timed],
  });
  const { now } = Date;
  Date.now = () => now() + 5 * 60_000;
  let moved = "";
  try {
    waits.start();
    for (let tries = 0; tries < 100 && moved !== "sent"; tries += 1) {
      await Bun.sleep(100);
      moved = await stageOf(timed, timedTask);
    }
  } finally {
    Date.now = now;
  }
  const routineMove = (
    JSON.parse(
      (
        await rig.board(
          hubRequest("GET /api/projects/:id/tasks/:taskId/history", {
            path: { id: timed, taskId: timedTask },
          })
        )
      ).text
    ) as TaskHistory
  ).events.findLast((event) => event.stage?.to === "sent");
  check(
    "d: the stage's own routine (after: 1m) moves it on to sent",
    moved === "sent" && routineMove?.actor.mover === "routine",
    JSON.stringify({ moved, routineMove })
  );

  // (e) The code template, now and as it was until now, is still the code template.
  const { isCodeTemplate, templateOf, templateStages, templateText } =
    await import("../../../packages/hub/src/stages");
  const today = templateText("code");
  const until = today.replace(
    "  review → ready       session\n",
    "  review → ready       session\n  review → done        session\n"
  );
  const named = templateOf(templateStages("code"));
  check(
    "e: the code template as it was until now, and as it is, reads as the code template; today's moves name it",
    until !== today &&
      isCodeTemplate(until) &&
      isCodeTemplate(today) &&
      "template" in named &&
      named.template === "code",
    JSON.stringify({ until: isCodeTemplate(until), named })
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
  name: "you-stage-holds",
  ownProcess:
    "its in-process hub (hub-in-process.ts) reads CAWCO_DB_PATH and HOME once, as the hub's modules load",
  run: async (kit: Kit) => {
    const scratch = await mkdtemp(
      join(process.env.TMPDIR ?? tmpdir(), "you-stage-holds-")
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

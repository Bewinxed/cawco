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
 * - b. The code template, its Review before done off: with the task in
 *   Your call (put there by him), a session's your-call → done and
 *   your-call → dropped are refused; your-call → ready goes.
 * - c. His move on from the `you` stage goes in each, its history's reason
 *   `approved`.
 * - d. The stage's own routine (waits.ts, `after: 1m`) moves a task on from
 *   a `you` stage whose moves give the routine that move, where a session's
 *   same move under `* → *  you, session` is refused.
 * - e. A stages.md written from the code template as it was before review
 *   was the reviewer's (review of kind `you`), and the one before that (its
 *   `review → done  session` line), still read as the code template
 *   (`isCodeTemplate`), as today's does, and today's names the code
 *   template by its moves (`templateOf`).
 * - f. A project whose active stage comes after its `you` stage (brief,
 *   review, build): a session's `task_start` at a task in review is refused
 *   with the same sentence, the task left in review (dispatch.ts
 *   `startAttempt`); his own start (the board's) is not held by the stage.
 *   On main the session's start went on to look for a machine.
 * - g. An own-shaped project with no moves section whose `you` stage holds
 *   a task `after: 1m` and whose waiting stage holds it `until: post_at`:
 *   the routine moves it on from each to the next stage (stages.ts
 *   `heldOn`). On main the routine had no move, and it stayed.
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
import { stageWords } from "../../../packages/core/src/words/stages";
import type { hubInProcess as inProcess } from "../../../packages/hub/scripts/hub-in-process";
import type { TaskView } from "../../../packages/hub/src/tasks";
import { type ToolSession, toolWords } from "../../lib/tool-call";
import type { Kit, Spec } from "../kit";

const MACHINE = "probe-you-stage-machine";

/** The code template until review became the reviewer's stage: review was the person's, of kind `you`. */
const YOURS_REVIEW = `---
ready      todo
working    active
review     you
done       done
dropped    dropped
moves
  * → *                you
  ready → working      session
  ready → review       session
  ready → done         session
  working → review     session
  working → done       session
  review → working     session
  review → ready       session
  * → dropped          session
views
  board      by stage
  table      by rank
---

Stages for code.
`;

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

/** An active stage after the `you` one: what an attempt start would move a task to. */
const LATE = `---
brief       todo
review      you
build       active
shipped     done
dropped     dropped
---
`;

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
    stage: string,
    reason?: string
  ) => Promise<{ refused: boolean; text: string }>;
  /** A `task_start` of `id` as the project's session. */
  start: (
    projectId: string,
    id: string
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
    session: (projectId, id, stage, reason) => {
      const one = sessionOf(projectId);
      return reason
        ? toolWords(one, "task_update", { id, stage, reason })
        : toolWords(one, "task_update", { id, stage });
    },
    start: (projectId, id) =>
      toolWords(sessionOf(projectId), "task_start", { id }),
    fields: (projectId, id, fields) =>
      toolWords(sessionOf(projectId), "task_update", { id, fields }),
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
  /** The hub's refusal of a session's move of `task` from `from` to `to`, naming `open` to send it back to. */
  const held = (task: string, from: string, to: string, open: string) =>
    stageWords.held(
      task,
      stageWords.move(from, to),
      from,
      stageWords.instead("a session", open)
    );
  for (const to of ["scheduled", "sent"]) {
    const on = await rig.session(own, ownTask, to);
    check(
      `a: no moves section: a session moving it on to ${to} is refused, naming where it can send it back`,
      on.refused &&
        on.text.includes(held(ownTask, "your-call", to, "inbox or drafting")) &&
        (await stageOf(own, ownTask)) === "your-call",
      on.text
    );
  }
  const drop = await rig.session(own, ownTask, "dropped", "out of scope");
  check(
    "a: no moves section: a session dropping it is refused",
    drop.refused &&
      drop.text.includes(
        held(ownTask, "your-call", "dropped", "inbox or drafting")
      ) &&
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
  await hisMove(code, codeTask, "your-call");
  check(
    "b: code template: he puts the task in Your call",
    (await stageOf(code, codeTask)) === "your-call"
  );
  const done = await rig.session(code, codeTask, "done");
  check(
    "b: code template: a session's your-call → done is refused, naming where it can send it back",
    done.refused &&
      done.text.includes(
        held(codeTask, "your-call", "done", "ready or working")
      ) &&
      (await stageOf(code, codeTask)) === "your-call",
    done.text
  );
  const codeDrop = await rig.session(code, codeTask, "dropped", "out of scope");
  check(
    "b: code template: a session's your-call → dropped is refused",
    codeDrop.refused &&
      codeDrop.text.includes(
        held(codeTask, "your-call", "dropped", "ready or working")
      ) &&
      (await stageOf(code, codeTask)) === "your-call",
    codeDrop.text
  );
  const codeBack = await rig.session(
    code,
    codeTask,
    "ready",
    "the fix needs a test"
  );
  check(
    "b: code template: a session's your-call → ready goes",
    !codeBack.refused && (await stageOf(code, codeTask)) === "ready",
    codeBack.text
  );
  await hisMove(code, codeTask, "your-call");
  const codeHis = await hisMove(code, codeTask, "done");
  check(
    "c: code template: his your-call → done goes, its reason approved",
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
      sessionOn.text.includes(held(timedTask, "your-call", "sent", "inbox")) &&
      (await stageOf(timed, timedTask)) === "your-call",
    sessionOn.text
  );
  const timedRun = await routineRun(timed, timedTask, "sent");
  check(
    "d: the stage's own routine (after: 1m) moves it on to sent",
    timedRun.moved === "sent" && timedRun.event?.actor.mover === "routine",
    JSON.stringify(timedRun)
  );

  // (e) The code template, now and as it was until now, is still the code template.
  const { isCodeTemplate, templateOf, templateStages, templateText } =
    await import("../../../packages/hub/src/stages");
  const today = templateText("code");
  const until = YOURS_REVIEW;
  const before = YOURS_REVIEW.replace(
    "  review → ready       session\n",
    "  review → ready       session\n  review → done        session\n"
  );
  const named = templateOf(templateStages("code"));
  check(
    "e: the code template as it was until now and before, and as it is, reads as the code template; today's moves name it",
    before !== until &&
      isCodeTemplate(before) &&
      isCodeTemplate(until) &&
      isCodeTemplate(today) &&
      "template" in named &&
      named.template === "code",
    JSON.stringify({
      before: isCodeTemplate(before),
      until: isCodeTemplate(until),
      named,
    })
  );

  // (f) A session's attempt start does not carry a task past its `you` stage.
  const late = await project("Late build probe", LATE);
  const lateTask = await file(late, "Build the picked landing page");
  await rig.session(late, lateTask, "review");
  const start = await rig.start(late, lateTask);
  check(
    "f: an attempt a session starts at a task in review, its active stage after it, is refused, naming where it can send it back",
    start.refused &&
      start.text.includes(
        stageWords.held(
          lateTask,
          stageWords.start("build"),
          "review",
          stageWords.instead("a session", "brief")
        )
      ) &&
      (await stageOf(late, lateTask)) === "review",
    start.text
  );
  const hisStart = await rig.board(
    hubRequest("POST /api/projects/:id/tasks/:taskId/attempts", {
      path: { id: late, taskId: lateTask },
      body: { parentInstanceId: sessionOf(late).id },
    })
  );
  check(
    "f: his own start at it is not held by its stage (here refused only for want of a machine)",
    !hisStart.text.includes(stageWords.waits("review")),
    `${hisStart.status} ${hisStart.text}`
  );

  // (g) With no moves section, each stage's hook moves a task on to the next stage.
  const hooked = await project("Hooked probe", HOOKED);
  const hookedTask = await file(hooked, "Post the launch note");
  await rig.session(hooked, hookedTask, "your-call");
  const afterRun = await routineRun(hooked, hookedTask, "scheduled");
  check(
    "g: no moves section: Your call's after: 1m moves it on to scheduled, as the routine",
    afterRun.moved === "scheduled" && afterRun.event?.actor.mover === "routine",
    JSON.stringify(afterRun)
  );
  const dated = await rig.fields(hooked, hookedTask, {
    post_at: "2026-01-01T09:00:00Z",
  });
  const untilRun = await routineRun(hooked, hookedTask, "sent");
  check(
    "g: no moves section: scheduled's until: post_at, passed, moves it on to sent, as the routine",
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
    reviewsType: () => false,
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

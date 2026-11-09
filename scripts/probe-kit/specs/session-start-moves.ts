/**
 * A session's start of an attempt moves its task into the active stage as
 * the session would (hub dispatch.ts `refuseSessionMove`): the project's own
 * `moves:` decide it, and a start they do not allow is refused with their
 * own sentence (stages.ts `moveProblem`). Before, the start moved the task
 * as the hub, past moves that name `you` alone.
 *
 * On an in-process hub (hub-in-process.ts) over a scratch database, with no
 * machine online, a session (`task_start` on
 * `/api/delegation/call/:instanceId`, its minted credential) puts a task in
 * review, a stage of kind `you` before the project's active stage (brief,
 * review, build), and starts an attempt at it:
 *
 * - a. Its moves give `review → build` to `you` alone: the session's start
 *   is refused with the moves' sentence, the task left in review. On main
 *   the start went on to look for a machine.
 * - b. Its moves give the session that move too: the start is not refused
 *   by the moves (here refused only for want of a machine).
 * - c. His own start (the board's) under the first moves is not refused by
 *   them.
 *
 *   bun scripts/probe-kit/run.ts session-start-moves
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { machinePath } from "../../../packages/core/src/machine-path";
import type { hubInProcess as inProcess } from "../../../packages/hub/scripts/hub-in-process";
import type { TaskView } from "../../../packages/hub/src/tasks";
import { type ToolSession, toolWords } from "../../lib/tool-call";
import { answerText, type HubAsk, handled } from "../hub";
import type { Kit, Spec } from "../kit";

const MACHINE = "probe-start-moves-machine";

/** Its moves give a session every move but out of review, which is yours. */
const YOURS = `---
brief       todo
review      you
build       active
shipped     done
dropped     dropped
moves
  * → *              you
  brief → review     session
  review → brief     session
  build → shipped    session
---
`;

/** The same stages, a session also given review → build. */
const SHARED = YOURS.replace(
  "  review → brief     session\n",
  "  review → brief     session\n  review → build     session\n"
);

interface Answer {
  status: number;
  text: string;
}

type Db = Awaited<ReturnType<typeof inProcess>>["db"];

interface Rig {
  /** A board call, as the person. */
  board: (request: HubAsk) => Promise<Answer>;
  db: Db;
  kit: Kit;
  /** A `task_update` of `id` to `stage` as the project's session; its answer's words. */
  session: (
    projectId: string,
    id: string,
    stage: string
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
  const { db, hub } = await hubInProcess(
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
      request(handled((r) => hub.handle(r))).then((answer) => ({
        status: answer.status,
        text: answerText(answer),
      })),
    session: (projectId, id, stage) =>
      toolWords(sessionOf(projectId), "task_update", { id, stage }),
    start: (projectId, id) =>
      toolWords(sessionOf(projectId), "task_start", { id }),
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
    const committed = await writeFolderFile(id, "stages.md", stages, {
      author: { name: "probe" },
    });
    if (!("sha" in committed)) {
      throw new Error(committed.response.detail);
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
    const made = await rig.board((client) =>
      client.api.projects({ id: projectId }).tasks.post({ title })
    );
    const id = (JSON.parse(made.text) as { id?: string }).id ?? "";
    if (!id) {
      throw new Error(`the task was not filed: ${made.status} ${made.text}`);
    }
    return id;
  };
  const stageOf = async (projectId: string, id: string): Promise<string> => {
    const read = await rig.board((client) =>
      client.api.projects({ id: projectId }).tasks({ taskId: id }).get()
    );
    return (JSON.parse(read.text) as TaskView).stage;
  };
  const { moveProblem, readStages } =
    await import("../../../packages/hub/src/stages");
  /** The moves' own refusal of a session's move of `task` from review to build. */
  const refusal = (task: string): string => {
    const read = readStages(YOURS);
    if (!read.ok) {
      throw new Error(read.problems.join(" "));
    }
    return moveProblem(read.stages, task, "review", "build", "session") ?? "";
  };

  // (a) review → build is yours alone: a session's start is refused.
  const yours = await project("Yours probe", YOURS);
  const yoursTask = await file(yours, "Build the picked landing page");
  await rig.session(yours, yoursTask, "review");
  const start = await rig.start(yours, yoursTask);
  const said = refusal(yoursTask);
  check(
    "a: review → build is yours alone: a session's task_start at a task in review is refused with the moves' sentence, the task left in review",
    said !== "" &&
      start.refused &&
      start.text.includes(said) &&
      (await stageOf(yours, yoursTask)) === "review",
    `${start.text.slice(0, 300)} (expected: ${said})`
  );

  // (b) The moves give a session review → build: the moves let its start go.
  const shared = await project("Shared probe", SHARED);
  const sharedTask = await file(shared, "Build the picked pricing page");
  await rig.session(shared, sharedTask, "review");
  const sharedStart = await rig.start(shared, sharedTask);
  check(
    "b: review → build is a session's too: its task_start is not refused by the moves (here refused only for want of a machine)",
    !(
      sharedStart.text.includes(refusal(sharedTask)) ||
      sharedStart.text.includes("cannot go from review to build")
    ),
    sharedStart.text.slice(0, 300)
  );

  // (c) His own start under the first moves.
  const hisStart = await rig.board((client) =>
    client.api
      .projects({ id: yours })
      .tasks({ taskId: yoursTask })
      .attempts.post({ parentInstanceId: sessionOf(yours).id })
  );
  check(
    "c: his own start at the task in review is not refused by the moves",
    !hisStart.text.includes("cannot go from review to build"),
    `${hisStart.status} ${hisStart.text.slice(0, 300)}`
  );
};

export default {
  group: "The hub and machines",
  name: "session-start-moves",
  ownProcess:
    "its in-process hub (hub-in-process.ts) reads CAWCO_DB_PATH and HOME once, as the hub's modules load",
  run: async (kit: Kit) => {
    const scratch = await mkdtemp(
      join(process.env.TMPDIR ?? tmpdir(), "session-start-moves-")
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

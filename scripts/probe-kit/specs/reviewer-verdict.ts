/**
 * In a project whose review stage runs a reviewer, a finished attempt whose
 * acceptance lines Jev does not show met is judged by that reviewer, never
 * by the owner by default, and the reviewer's verdict is the task's move
 * (hub dispatch.ts `settleOne`, `settleReview`, `startAfter`; tasks.ts
 * `verdictChecked`). Cawco-Dev, 2026-11-07: seven delivered tasks sat in its
 * Review because Jev's one-shot read of a report scored a line low and the
 * hub sent each to the first `you` stage.
 *
 * On an in-process hub (hub-in-process.ts) listening on loopback, in a
 * project shaped as Cawco-Dev is (ready, working, review `runs: reviewer`,
 * your-call, done, dropped, and its moves) with a `reviewer` type that loads
 * review-attempt, its checkout on a stand-in machine that registers over
 * the hub's socket and answers its calls. Jev's route is answered in this
 * process, scoring every line 0.44. Each attempt is a work item on a
 * host-scope workspace (no clone to gate), its session's calls going through
 * its own door (`/api/delegation/call/:instanceId`, its minted credential).
 * The project runs its one live attempt already (another task's), so every
 * start the hub asks for waits for a slot, where the legs read it.
 *
 * - a. A builder's attempt ends done, Jev scoring its lines low: the task
 *   goes to review, not your-call, the hub's start of its reviewer waits
 *   there for a slot, and Jev's comment says the lines go to review. On
 *   main it went to your-call.
 * - b. Its reviewer's finish_item before a verdict is refused, saying the
 *   verdict is the task's move. Its verdict, every line met: the task lands
 *   in done, both lines ticked. On main its report went through Jev again
 *   and the task to your-call.
 * - c. A verdict with an unmet line: the task goes back to working, the
 *   unmet line a to-do naming what is missing, and the hub's start of its
 *   next attempt waits for a slot in working.
 * - d. A verdict with a line that is the owner's, naming its decision card:
 *   the task goes to your-call, waiting on that card, and a comment names
 *   the line.
 *
 *   bun scripts/probe-kit/run.ts reviewer-verdict
 */
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PRESENCE_HEADER } from "../../../packages/core/src/browser-gate";
import { CAWCO_ENV } from "../../../packages/core/src/cawco-env";
import {
  type AttemptResult,
  REVIEW_ROUNDS_MAX,
} from "../../../packages/core/src/deliverables";
import { CONTROL_HOST_OUTPUTS } from "../../../packages/core/src/harness";
import {
  fetchHub,
  type HubRequest,
  hubInit,
  hubRequest,
} from "../../../packages/core/src/hub-request";
import { machinePath } from "../../../packages/core/src/machine-path";
import { HOUR_MS, MINUTE_MS } from "../../../packages/core/src/time";
import { reviewWords } from "../../../packages/core/src/words/review";
import type { hubInProcess as inProcess } from "../../../packages/hub/scripts/hub-in-process";
import type { TaskView } from "../../../packages/hub/src/tasks";
import { type ToolSession, toolWords } from "../../lib/tool-call";
import type { Kit, Spec } from "../kit";

const B = "probe-reviewer-machine";
const PRESENCE = "probe-presence-5e71";
const TYPESAFE = "https://api.typesafe.ai/";
/** What Jev scores every line: under its 0.8, as tsk-253's 0.44 was. */
const LOW = 0.44;
const PAGE = "review-calls";
const CARD = "chip-notice";

/** Cawco-Dev's stages.md, as its folder holds it. */
const STAGES = `---
ready      todo
working    active
review     active    runs: reviewer
your-call  you
done       done
dropped    dropped
moves
  * → *                you
  ready → working      session
  ready → done         session
  working → done       session
  working → review     session
  review → done        session
  review → working     session
  review → ready       session
  review → your-call   session
  your-call → working  session
  your-call → ready    session
  * → dropped          session
views
  board      by stage
---

Stages for code.
`;

/** The project's reviewer: a type that loads review-attempt and lands nothing. */
const REVIEWER = `---
harness: claude
model: claude-opus-5-5
effort: high
skills: [review-attempt]
lands: none
---
Review an attempt at the task against its acceptance lines and hand in the verdict.
`;

/** The code template until review became the reviewer's stage: review was the person's. */
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
`;

const ACCEPTANCE = [
  "The tray chip never overflows its row at 390 wide",
  "The chip's label truncates with an ellipsis and keeps its full text in a tooltip",
];

/** The owner's question, on a card the reviewer puts to him. */
const PROGRAM = `root = Decisions("Review calls", [card])
card = Decision("${CARD}", "Should a new tray chip tell the person it arrived?", [tell, quiet], "The brief does not say whether a new chip is announced.", [], [], false, null, "behaviour")
tell = Option("tell", "Announce it", "A new chip is read out to a screen reader and pulses once.", true, [], "One more notice on every new chip.")
quiet = Option("quiet", "Stay quiet", "A new chip appears with no notice.", false, [], "No cue that it is new.")`;

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

/** Jev's route answered here: every noul question scored {@link LOW}. */
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
const attempt = (
  rig: Rig,
  taskId: string,
  type: string,
  title: string,
  ended?: { at: Date; taskResult?: AttemptResult }
): ToolSession & { workItemId: string } => {
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
    createdAt: ended?.at ?? new Date(),
    host: true,
    ...(ended ? { state: "archived" as const } : {}),
  });
  rig.db.createWorkItem({
    id: workItemId,
    workspaceId,
    parentInstanceId: rig.parent,
    instanceId,
    brief: title,
    title,
    type,
    harness: "claude",
    createdAt: ended?.at ?? new Date(),
    projectId: rig.projectId,
    taskId,
    lands: "none",
    ...(ended
      ? {
          state: "done" as const,
          endedAt: ended.at,
          ...(ended.taskResult ? { taskResult: ended.taskResult } : {}),
        }
      : { state: "running" as const }),
  });
  return {
    base: rig.base,
    id: instanceId,
    credential: rig.identities.mint(instanceId),
    workItemId,
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

/** Until the task has left `from`, up to 20 s: where it is then. */
const leaves = async (
  rig: Rig,
  id: string,
  from: string
): Promise<TaskView> => {
  const deadline = Date.now() + 20_000;
  let task = await read(rig, id);
  while (task.stage === from && Date.now() < deadline) {
    await Bun.sleep(100);
    task = await read(rig, id);
  }
  return task;
};

/** The stage a start the hub asked for waits in for `id`, once one does (up to 10 s). */
const queuedIn = async (rig: Rig, id: string): Promise<string | undefined> => {
  const deadline = Date.now() + 10_000;
  const stage = () =>
    rig.db.queuedTaskStarts(rig.projectId).find((row) => row.taskId === id)
      ?.stage;
  while (!stage() && Date.now() < deadline) {
    await Bun.sleep(100);
  }
  return stage();
};

/** A task in working with a builder's live attempt, filed and moved as the person does. */
const working = async (
  rig: Rig,
  title: string
): Promise<{ builder: ToolSession; id: string }> => {
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
  const builder = attempt(rig, id, "medium", title);
  const moved = await rig.board(
    hubRequest("POST /api/projects/:id/tasks/:taskId/stage", {
      path: { id: rig.projectId, taskId: id },
      body: { stage: "working" },
    })
  );
  if (moved.status >= 400) {
    throw new Error(`${id} did not go to working: ${moved.text}`);
  }
  return { builder, id };
};

/**
 * A builder's finish, Jev scoring its lines low: the task leaves working.
 * Answers it, once it has.
 */
const built = async (rig: Rig, title: string): Promise<TaskView> => {
  const { builder, id } = await working(rig, title);
  const finished = await toolWords(builder, "finish_item", {
    headline: "The tray chip fits its row.",
    summary:
      "The chip's row wraps at 390 and its label truncates. See the diff.",
  });
  if (finished.refused) {
    throw new Error(
      `${id}'s builder could not finish: ${finished.status} ${finished.text}`
    );
  }
  return await leaves(rig, id, "working");
};

/** The hub's start of a reviewer, taken: its session, as the queued start would run it. */
const reviewerOf = (rig: Rig, id: string): ToolSession => {
  rig.db.dropQueuedTaskStart(rig.projectId, id);
  return attempt(rig, id, "reviewer", `Review ${id}`);
};

const legs = async (rig: Rig): Promise<void> => {
  const { kit } = rig;

  // (a) A low-scored attempt goes to review, its reviewer's start waiting for a slot.
  const a = await built(rig, "Fix the tray chip overflow");
  const jevSaid = a.comments.at(-1)?.text ?? "";
  kit.check(
    "a: a builder's attempt Jev scores low goes to review, not your-call",
    a.stage === "review",
    `${a.id} is in ${a.stage}`
  );
  kit.check(
    "a: the hub's start of its reviewer waits in review for a slot",
    (await queuedIn(rig, a.id)) === "review",
    `queued in ${await queuedIn(rig, a.id)}`
  );
  kit.check(
    "a: Jev's comment says the lines go to review, for its reviewer",
    jevSaid.includes(reviewWords.toReview("review", "reviewer")),
    jevSaid.slice(0, 300)
  );

  // (b) The reviewer's met verdict lands it in done.
  const reviewerA = reviewerOf(rig, a.id);
  const early = await toolWords(reviewerA, "finish_item", {
    headline: "Both lines are met.",
    summary: "Both acceptance lines are met.",
  });
  kit.check(
    "b: the reviewer's finish_item before its verdict is refused, saying the verdict is the move",
    early.text.includes(reviewWords.noVerdict),
    early.text.slice(0, 300)
  );
  const metIn = await toolWords(reviewerA, "task_result", {
    summary: "Both acceptance lines are met by the change.",
    verdict: [
      {
        line: 1,
        verdict: "met",
        evidence: "TrayChip.svelte:41 wraps the row; 390 frame shows it",
      },
      {
        line: 2,
        verdict: "met",
        evidence: "TrayChip.svelte:58 truncates; title= keeps the text",
      },
    ],
  });
  kit.check(
    "b: the reviewer hands in its verdict",
    !metIn.refused,
    metIn.text.slice(0, 300)
  );
  await toolWords(reviewerA, "finish_item", {
    headline: "Both lines are met.",
    summary: "Both acceptance lines are met.",
  });
  const b = await leaves(rig, a.id, "review");
  kit.check(
    "b: its met verdict lands the task in done, both lines ticked",
    b.stage === "done" && (b.acceptance.match(/- \[x\]/gu) ?? []).length === 2,
    `${b.stage}: ${b.acceptance}`
  );

  // (c) An unmet line sends it back to working, a to-do naming what is missing.
  const c = await built(rig, "Fix the tray chip label");
  const reviewerC = reviewerOf(rig, c.id);
  const missing = "the label clips with no ellipsis at 390 (frame 2)";
  await toolWords(reviewerC, "task_result", {
    summary: "The row fits; the label does not truncate.",
    verdict: [
      { line: 1, verdict: "met", evidence: "TrayChip.svelte:41 wraps the row" },
      { line: 2, verdict: "unmet", evidence: missing },
    ],
  });
  await toolWords(reviewerC, "finish_item", {
    headline: "Line 2 is unmet.",
    summary: "The label does not truncate.",
  });
  const cBack = await leaves(rig, c.id, "review");
  kit.check(
    "c: an unmet line sends the task back to working",
    c.stage === "review" && cBack.stage === "working",
    `${c.stage} → ${cBack.stage}`
  );
  kit.check(
    "c: the unmet line is a to-do naming what is missing",
    cBack.todos.some((todo) => !todo.done && todo.text.includes(missing)),
    JSON.stringify(cBack.todos.map((todo) => todo.text))
  );
  kit.check(
    "c: the hub's start of its next attempt waits in working for a slot",
    (await queuedIn(rig, c.id)) === "working",
    `queued in ${await queuedIn(rig, c.id)}`
  );

  // (d) An owner's line sends it to your-call, waiting on its card.
  const d = await built(rig, "Fix the tray chip arrival");
  const reviewerD = reviewerOf(rig, d.id);
  const page = await rig.board(
    hubRequest("POST /api/instances/:id/artifacts", {
      path: { id: reviewerD.id },
      body: {
        kind: "page",
        does: "pick",
        name: PAGE,
        title: "Review calls",
        ask: "Pick how the tray chip arrives",
        program: PROGRAM,
      },
    })
  );
  if (page.status >= 400) {
    throw new Error(`the card's page was not made: ${page.text}`);
  }
  const ownerIn = await toolWords(reviewerD, "task_result", {
    summary: "The row fits; whether a new chip is announced is his call.",
    verdict: [
      { line: 1, verdict: "met", evidence: "TrayChip.svelte:41 wraps the row" },
      {
        line: 2,
        verdict: "owner",
        evidence: "whether a new chip is announced is a Behaviour question",
        card: `${PAGE}#${CARD}`,
      },
    ],
  });
  kit.check(
    "d: the reviewer hands in a verdict with the owner's line and its card",
    !ownerIn.refused,
    ownerIn.text.slice(0, 300)
  );
  await toolWords(reviewerD, "finish_item", {
    headline: "Line 2 is his call.",
    summary: "Whether a new chip is announced is the owner's to decide.",
  });
  const dYou = await leaves(rig, d.id, "review");
  kit.check(
    "d: an owner's line sends the task to your-call",
    d.stage === "review" && dYou.stage === "your-call",
    `${d.stage} → ${dYou.stage}`
  );
  kit.check(
    "d: it waits on the card, and a comment names the line",
    dYou.waits.some((wait) => wait.kind === "card") &&
      (dYou.comments.at(-1)?.text ?? "").includes(
        reviewWords.owner("", 1, "").trim()
      ),
    JSON.stringify({
      waits: dYou.waits.map((wait) => `${wait.kind} ${wait.label}`),
      comment: dYou.comments.at(-1)?.text.slice(0, 200),
    })
  );

  // (e) A task the template's old review held for the person: once its
  // review stage runs the reviewer, its reviewer is started for it.
  await rekinded(rig);

  // (f) Past REVIEW_ROUNDS_MAX rounds ending unmet, an unmet verdict asks the person.
  const f = await built(rig, "Fix the tray chip spacing");
  const old = Date.now() - HOUR_MS;
  for (let round = 0; round < REVIEW_ROUNDS_MAX; round += 1) {
    attempt(rig, f.id, "reviewer", `Review ${f.id}, round ${round + 1}`, {
      at: new Date(old + round * MINUTE_MS),
      taskResult: {
        summary: "Line 2 is unmet.",
        check: [],
        artifacts: [],
        at: old + round * MINUTE_MS,
        verdict: [
          { line: 1, verdict: "met", evidence: "TrayChip.svelte:41" },
          { line: 2, verdict: "unmet", evidence: "the label still clips" },
        ],
      },
    });
  }
  const reviewerF = reviewerOf(rig, f.id);
  await toolWords(reviewerF, "task_result", {
    summary: "Line 2 is still unmet.",
    verdict: [
      { line: 1, verdict: "met", evidence: "TrayChip.svelte:41 wraps the row" },
      { line: 2, verdict: "unmet", evidence: "the label still clips at 390" },
    ],
  });
  await toolWords(reviewerF, "finish_item", {
    headline: "Line 2 is unmet again.",
    summary: "The label still clips.",
  });
  const fYou = await leaves(rig, f.id, "review");
  const bounded = fYou.comments.at(-1)?.text ?? "";
  kit.check(
    `f: past ${REVIEW_ROUNDS_MAX} unmet rounds, an unmet verdict sends it to your-call, waiting on one card asking whether to keep going`,
    fYou.stage === "your-call" &&
      fYou.waits.filter((wait) => wait.kind === "card").length === 1 &&
      fYou.waits.some(
        (wait) =>
          wait.kind === "card" &&
          wait.label ===
            reviewWords.keepGoing(f.title, REVIEW_ROUNDS_MAX, "").question
      ),
    JSON.stringify({
      stage: fYou.stage,
      waits: fYou.waits.map((wait) => `${wait.kind} ${wait.label}`),
    })
  );
  kit.check(
    "f: its comment says what is still unmet, and no next attempt waits to start",
    bounded.includes("the label still clips at 390") &&
      bounded.startsWith(reviewWords.bounded(REVIEW_ROUNDS_MAX, "").trim()) &&
      rig.db
        .queuedTaskStarts(rig.projectId)
        .every((row) => row.taskId !== f.id),
    bounded.slice(0, 300)
  );
};

/**
 * (e) A project on the code template as it was, review the person's (kind
 * `you`), a delivered task waiting there; the project runs its one live
 * attempt already. The person writes the new shape (review runs the
 * reviewer): the hub starts the task's reviewer, which waits in review for
 * a slot, reporting to whoever its last attempt reported to.
 */
const rekinded = async (rig: Rig): Promise<void> => {
  const projectId = crypto.randomUUID();
  rig.db.createProject({
    id: projectId,
    name: "Old code probe",
    checkout: { machineId: B, path: rig.checkout },
    remote: null,
  });
  rig.db.setProjectDispatch(projectId, { maxAttempts: 1 });
  const { writeFolderFile } =
    await import("../../../packages/hub/src/project-folder");
  await writeFolderFile(projectId, "stages.md", YOURS_REVIEW, {
    author: { name: "probe" },
  });
  await writeFolderFile(projectId, "delegates/reviewer.md", REVIEWER, {
    author: { name: "probe" },
  });
  const shell: Rig = { ...rig, projectId };
  const old: Rig = {
    ...shell,
    parent: openSession(shell, { title: "Old code probe's orchestrator" }),
  };
  const file = async (title: string, stage: string): Promise<string> => {
    const made = await rig.board(
      hubRequest("POST /api/projects/:id/tasks", {
        path: { id: projectId },
        body: { title, stage },
      })
    );
    return (made.json as { id: string }).id;
  };
  const held = await file("Type the hub's callers", "ready");
  attempt(old, held, "medium", "Type the hub's callers");
  const waiting = await file("Fix the tray chip glow", "review");
  attempt(old, waiting, "medium", "Fix the tray chip glow", {
    at: new Date(Date.now() - 10 * MINUTE_MS),
  });
  const written = await rig.board(
    hubRequest("PUT /api/projects/:id/stages", {
      path: { id: projectId },
      body: { content: STAGES },
    })
  );
  const queued = await queuedIn(old, waiting);
  const now = await read(old, waiting);
  rig.kit.check(
    "e: a task waiting in a review stage that now runs a reviewer gets its reviewer, waiting in review for a slot",
    written.status < 400 && queued === "review" && now.stage === "review",
    `${written.status}; ${waiting} in ${now.stage}, queued in ${queued}`
  );
};

export default {
  group: "The hub and machines",
  name: "reviewer-verdict",
  ownProcess:
    "its in-process hub (hub-in-process.ts) reads CAWCO_DB_PATH and HOME once, as the hub's modules load",
  run: async (kit: Kit) => {
    const scratch = await mkdtemp(
      join(process.env.TMPDIR ?? tmpdir(), "reviewer-verdict-")
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
      const { writeFolderFile } =
        await import("../../../packages/hub/src/project-folder");
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
      db.setProjectDispatch(projectId, { maxAttempts: 1 });
      await writeFolderFile(projectId, "stages.md", STAGES, {
        author: { name: "probe" },
      });
      await writeFolderFile(projectId, "delegates/reviewer.md", REVIEWER, {
        author: { name: "probe" },
      });
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
      const parent = openSession(shell, {
        title: "Cawco-Dev's orchestrator",
      });
      const rig: Rig = {
        base,
        board,
        checkout,
        db,
        identities: createSessionIdentities(db),
        kit,
        parent,
        projectId,
      };
      // The project runs its one live attempt already: another task's.
      const held = await board(
        hubRequest("POST /api/projects/:id/tasks", {
          path: { id: projectId },
          body: { title: "Type the hub's callers against its routes" },
        })
      );
      attempt(
        rig,
        (held.json as { id: string }).id,
        "medium",
        "Type the hub's callers"
      );
      await legs(rig);
    } finally {
      socket?.close();
      await rm(scratch, { recursive: true, force: true });
    }
  },
} satisfies Spec;

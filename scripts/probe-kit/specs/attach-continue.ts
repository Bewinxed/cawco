/**
 * Attach or spawn (Projects PRD §5.3): "a new message for a task continues
 * the last attempt's session when it is idle, on the same task and its cache
 * is warm; when cold and the history matters, compress and continue
 * (`continue_session`, same workspace); otherwise a fresh session with
 * brief + last failure + batched comments". Your comment on a task whose
 * attempt has ended is placed by Jev's yes/no on whether that session's
 * history matters, and by its cache (hub jev-tasks.ts `attachOrFresh`,
 * `continueCompressed`; server.ts `continueAttempt`). On a scratch fleet
 * (real hub, agent and sessiond; Claude Code against the mock model) with
 * Jev on against the kit's mock. Attempts cut workspaces: it runs on the
 * host, outside every boundary.
 *
 * a. Cold, Jev says attach: the hub log reads that it continues compressed;
 *    a continuation job's source is the attempt's session and its new
 *    session another; the attempt's item names the new session, started in
 *    the attempt's workspace; its opening comes from the old session and
 *    carries your comment; the new session finishes the attempt itself, and
 *    the old one is sent nothing.
 * b. Warm, Jev says attach: your comment goes to the attempt's own session,
 *    which finishes it again; no continuation.
 * c. Jev says fresh: a fresh attempt starts, in another session, briefed
 *    with your comment; no continuation.
 * d. Jev off, cold, idle, same task: the Jev-off rule's log line reads that
 *    it continues compressed, the attempt's item names the new session, and
 *    the new session finishes it.
 * e. Every continuation carries its source's work item: a delegate waiting
 *    on its running item is continued through the dashboard's continue
 *    route; the item's session is the new one, which finishes it, and the
 *    old session holds no item.
 * f. Closed as criteria met (hub dispatch.ts `settle`, task-file.ts
 *    `tickCriteria`): a task with two acceptance criteria and a proposed
 *    to-do (a step an earlier end of its attempt left open) is attempted;
 *    the attempt's plan completes that step and it finishes, Jev shows both
 *    criteria met, and the task is in done with its close reason saying so,
 *    both criteria ticked, ticked by the move's own commit, and every to-do
 *    ticked. (cockpit tsk-16 in Cawco-Dev read Done, "Jev shows its 2
 *    acceptance criteria met", over unticked criteria and 0 of 2 to-dos.)
 *
 *   bun scripts/probe-kit/run.ts attach-continue
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { jevMock, jevOn } from "../jev-mock";
import type { Kit, KitFleet, Spec } from "../kit";

const FINISH = "mcp__cawco__finish_item";
const WAIT = "mcp__cawco__wait_item";
const TODO = "mcp__cawco__todo_write";
/** What wait_item answers once the wait is declared (work-items.ts `waitItem`). */
const WAITING = " is waiting until ";
/** Only leg e's delegate's brief carries this. */
const LEAF_E = "PROBE-AC-E-LEAF wait to be continued";
/** Leg e's delegate's title: its session's, which its continuation's opening names. */
const TITLE_E = "PROBE-AC-E leaf";
/** Only an attempt's brief opens this way (dispatch.ts). */
const BRIEF = "Your work item is an attempt at";
/** Only a continuation's opening opens this way (continuation.ts `openingMessage`). */
const OPENING = "Continuing session ";
/** Only the summariser is asked this (continuation.ts `summariserPrompt`). */
const SUMMARISE = "Use no tools. Reply only with the summary.";
/** How the hub's comment on a task names your comment to its attempt (jev-tasks.ts). */
const YOURS = ", your task:";

const TASKS = {
  a: "PROBE-AC-A compress me",
  b: "PROBE-AC-B attach me",
  c: "PROBE-AC-C start me fresh",
  d: "PROBE-AC-D compress me with Jev off",
  f: "PROBE-AC-F close me as criteria met",
} as const;
/** Leg f's acceptance criteria, and the step its plan completes (its proposed to-do's words). */
const CRITERIA_F = [
  "PROBE-AC-F the first criterion holds",
  "PROBE-AC-F the second criterion holds",
] as const;
const STEP_F = "PROBE-AC-F run the full check";
/** A judged check's question id: one per criterion, `c0`, `c1`. */
const CRITERION_ID = /^c\d+$/;
/** The close reason a criteria-met close writes (dispatch.ts `movedBecause`). */
const MET = `Jev shows its ${CRITERIA_F.length} acceptance criteria met`;
const COMMENT = {
  a: "PROBE-AC-COMMENT-A go on from where you stopped",
  b: "PROBE-AC-COMMENT-B go on in your own session",
  c: "PROBE-AC-COMMENT-C start this over",
  d: "PROBE-AC-COMMENT-D go on with Jev off",
} as const;
/** The headline each finish carries: who finished which item, after what. */
const HEADLINE = {
  firstA: "PROBE-AC-FIRST-A",
  firstB: "PROBE-AC-FIRST-B",
  firstC: "PROBE-AC-FIRST-C",
  firstD: "PROBE-AC-FIRST-D",
  continuedA: "PROBE-AC-CONTINUED-A",
  attachedB: "PROBE-AC-ATTACHED-B",
  freshC: "PROBE-AC-FRESH-C",
  continuedD: "PROBE-AC-CONTINUED-D",
  continuedE: "PROBE-AC-CONTINUED-E",
  metF: "PROBE-AC-MET-F",
} as const;
const STAGES =
  "---\nready      todo\nworking    active\nreview     you\ndone       done\ndropped    dropped\nmoves\n  * → *    you, session\nviews\n  board      by stage\n---\n";

/** Jev's noul for Attach or fresh: at or above 0.5, attach. */
let attachNoul = 0.05;
const finished = new Set<string>();
/** How many times each finish has looked for finish_item and not had it. */
const looked = new Map<string, number>();
/** The most looks before a session says finish_item is not offered. */
const LOOKS_MAX = 6;
let waitedE = false;

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const useTool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});
/** A deferred tool is found first, then called. */
const found = (request: Seen, name: string, input: object): Reply => {
  if (request.toolNames.includes(name)) {
    return useTool(name, input);
  }
  return request.toolNames.includes("ToolSearch")
    ? useTool("ToolSearch", { query: `select:${name}`, max_results: 1 })
    : text(`${name} is not offered`);
};

/**
 * Fails the session's item as blocked, once per headline; with `blocked`
 * false, finishes it with a report. A session whose
 * tools do not list finish_item yet (one handed its item after it listed
 * them, told again by `list_changed`) looks for it, waiting a beat between
 * looks, and after {@link LOOKS_MAX} says it is not offered.
 */
const finishOnce = (request: Seen, headline: string, blocked = true): Reply => {
  if (finished.has(headline)) {
    return text("Stopped.");
  }
  if (!request.toolNames.includes(FINISH)) {
    const looks = looked.get(headline) ?? 0;
    looked.set(headline, looks + 1);
    if (looks >= LOOKS_MAX) {
      return text(`${FINISH} is not offered`);
    }
    return looks % 2 === 0
      ? found(request, FINISH, {})
      : useTool("Bash", { command: "sleep 2", description: "Probe beat" });
  }
  finished.add(headline);
  return useTool(
    FINISH,
    blocked
      ? {
          headline,
          summary: headline,
          blocked: { command: "probe", error: "the probe ends this item here" },
        }
      : {
          headline,
          summary: `${headline}: ${CRITERIA_F.join("; ")}. Proof: PASS lines.`,
        }
  );
};

let plannedF = false;

/** Leg f's attempt: its plan completes the proposed step, then it finishes with a report. */
const attemptF = (request: Seen): Reply => {
  if (plannedF) {
    return finishOnce(request, HEADLINE.metF, false);
  }
  const reply = found(request, TODO, {
    steps: [{ id: "s1", content: STEP_F, status: "completed" }],
  });
  if (reply.tool?.name === TODO) {
    plannedF = true;
  }
  return reply;
};

/** Each first attempt's headline, by its task's title. */
const FIRST = [
  [TASKS.a, HEADLINE.firstA],
  [TASKS.b, HEADLINE.firstB],
  [TASKS.c, HEADLINE.firstC],
  [TASKS.d, HEADLINE.firstD],
] as const;

/** An attempt's session: its brief, then what your comment handed it. */
const attempt = (request: Seen): Reply => {
  if (request.all.includes(COMMENT.b)) {
    return finishOnce(request, HEADLINE.attachedB);
  }
  if (request.all.includes(COMMENT.c)) {
    return finishOnce(request, HEADLINE.freshC);
  }
  if (request.all.includes(TASKS.f)) {
    return attemptF(request);
  }
  const first = FIRST.find(([title]) => request.all.includes(title));
  return first ? finishOnce(request, first[1]) : text("ok");
};

/** Leg e's delegate: declares a wait on its item, then waits. */
const leafE = (request: Seen): Reply => {
  if (waitedE || request.all.includes(WAITING)) {
    return text("Waiting.");
  }
  const reply = found(request, WAIT, {
    minutes: 60,
    reason: "the probe continues this session",
  });
  if (reply.tool?.name === WAIT) {
    waitedE = true;
  }
  return reply;
};

/** A continuation's new session: the opening names what it goes on with. */
const continuation = (request: Seen): Reply => {
  if (request.all.includes(COMMENT.a)) {
    return finishOnce(request, HEADLINE.continuedA);
  }
  if (request.all.includes(COMMENT.d)) {
    return finishOnce(request, HEADLINE.continuedD);
  }
  // The opening's first line names the session it continues by its title.
  return request.all.includes(`${OPENING}"${TITLE_E}`)
    ? finishOnce(request, HEADLINE.continuedE)
    : text("ok");
};

const respond = (request: Seen): Reply => {
  if (request.all.includes(SUMMARISE)) {
    return text(
      "## Summary\nPROBE-AC-SUMMARY: the attempt stopped as blocked."
    );
  }
  if (!request.tools) {
    return text("Probe title");
  }
  // The opening carries the old session's last turns: read it first.
  if (request.all.includes(OPENING)) {
    return continuation(request);
  }
  if (request.all.includes(LEAF_E)) {
    return leafE(request);
  }
  return request.all.includes(BRIEF) ? attempt(request) : text("ok");
};

interface Item {
  headline: string | null;
  id: string;
  instance_id: string;
  state: string;
  workspace_id: string;
}

interface Job {
  sourceInstanceId: string;
  stage: string;
  targetInstanceId: string;
}

/** Each attempt at a task, oldest first. */
const itemsOf = (fleet: KitFleet, taskId: string): Item[] =>
  fleet.query<Item>(
    "SELECT id, instance_id, state, headline, workspace_id FROM work_items WHERE task_id = ? ORDER BY created_at",
    taskId
  );

/** A session at rest: no turn open on the hub, no busy pulse. */
const atRest = async (fleet: KitFleet, id: string): Promise<void> => {
  await until(
    `${id.slice(0, 8)} at rest`,
    async () => {
      const [row] = fleet.query<{ turn_open_at: number | null }>(
        "SELECT turn_open_at FROM instances WHERE id = ?",
        id
      );
      const pulses =
        await fleet.api<Record<string, { busy?: boolean }>>("/api/pulses");
      return row?.turn_open_at === null && !pulses[id]?.busy;
    },
    Boolean,
    120_000
  );
};

/**
 * The session's cache by the hub's own reading (keep-alive.ts
 * `promptCacheExpiresAt`): cold, its last request two hours back on a
 * 5-minute cache; warm, its last request now on a 1-hour one.
 */
const setCache = (fleet: KitFleet, id: string, cache: "cold" | "warm") => {
  fleet.write(
    "UPDATE instances SET cache_ttl = ?, last_request_at = ?, cache_cold = NULL WHERE id = ?",
    cache === "cold" ? "5m" : "1h",
    cache === "cold" ? Date.now() - 2 * 3_600_000 : Date.now(),
    id
  );
};

/** The sends to session `to`: their words, who sent them, and their state. */
const sendsTo = (fleet: KitFleet, to: string) =>
  fleet.query<{ content: string; from_session: string | null; state: string }>(
    "SELECT json_extract(body, '$.message.content') AS content, json_extract(body, '$.origin.fromSession') AS from_session, state FROM sent_messages WHERE instance_id = ? ORDER BY accepted_at",
    to
  );

const continuationsFrom = async (
  fleet: KitFleet,
  source: string
): Promise<Job[]> =>
  (await fleet.api<Job[]>("/api/continuations")).filter(
    (job) => job.sourceInstanceId === source
  );

/** A task attempted once, its item failed as blocked, its session at rest. */
const attempted = async (
  fleet: KitFleet,
  projectId: string,
  parent: string,
  title: string
): Promise<{ item: Item; task: string }> => {
  const task = await fleet.api<{ id: string }>(
    `/api/projects/${projectId}/tasks`,
    { title, stage: "ready" }
  );
  await fleet.api(`/api/projects/${projectId}/tasks/${task.id}/attempts`, {
    parentInstanceId: parent,
  });
  const item = (await until(
    `${title}: its first attempt failed as blocked`,
    () => itemsOf(fleet, task.id)[0],
    (row) => row?.state === "failed",
    300_000
  )) as Item;
  await atRest(fleet, item.instance_id);
  return { item, task: task.id };
};

/**
 * The hub's log lines naming any of `ids` (a session, its workspace, a
 * task), the last 40: what a failed check carries, as the fleet's sandbox
 * and its log go when the run ends.
 */
const trail = async (fleet: KitFleet, ...ids: string[]): Promise<string> =>
  (await fleet.logs("hub"))
    .split("\n")
    .filter((line) => ids.some((id) => line.includes(id.slice(0, 8))))
    .slice(-40)
    .join(" | ");

const comment = (
  fleet: KitFleet,
  projectId: string,
  task: string,
  words: string
): Promise<unknown> =>
  fleet.api(`/api/projects/${projectId}/tasks/${task}/comments`, {
    text: words,
  });

/** (a) Cold, Jev attach: compressed and continued in a new session in the attempt's workspace. */
const coldContinues = async (
  { check }: Kit,
  fleet: KitFleet,
  projectId: string,
  parent: string
): Promise<void> => {
  const { item, task } = await attempted(fleet, projectId, parent, TASKS.a);
  const old = item.instance_id;
  setCache(fleet, old, "cold");
  attachNoul = 0.9;
  await comment(fleet, projectId, task, COMMENT.a);
  const job = await until(
    "a: a continuation of the attempt's session started",
    () => continuationsFrom(fleet, old),
    (jobs) => jobs.some((one) => one.stage === "started"),
    300_000
  )
    .then((jobs) => jobs.find((one) => one.stage === "started"))
    .catch(() => undefined);
  const log = await fleet.logs("hub");
  check(
    "a: the hub log reads that the cold attempt continues compressed",
    log.includes(
      `[tasks] ${task} in ${projectId}: Jev says attach (0.90, cache cold): it continues compressed`
    ) && log.includes(`${task} in ${projectId}: it continues compressed:`),
    log
      .split("\n")
      .filter((line) => line.includes(task))
      .join(" | ")
      .slice(0, 1500)
  );
  check(
    "a: the hub API lists a continuation whose source is the attempt's session and whose new session is another",
    !!job && job.targetInstanceId !== old,
    `${JSON.stringify(await fleet.api<Job[]>("/api/continuations"))} ${job ? "" : await trail(fleet, old, item.workspace_id, task)}`
  );
  if (!job) {
    return;
  }
  const target = job.targetInstanceId;
  const [carried] = fleet.query<{ instance_id: string }>(
    "SELECT instance_id FROM work_items WHERE id = ?",
    item.id
  );
  const [row] = fleet.query<{ cwd: string; work_item_id: string | null }>(
    "SELECT cwd, work_item_id FROM instances WHERE id = ?",
    target
  );
  const [workspace] = fleet.query<{ path: string }>(
    "SELECT path FROM workspaces WHERE id = ?",
    item.workspace_id
  );
  check(
    "a: the attempt's item names the new session, which started in the attempt's own workspace",
    carried?.instance_id === target &&
      row?.work_item_id === item.id &&
      !!workspace &&
      row.cwd === workspace.path,
    JSON.stringify({ carried, row, workspace })
  );
  const opening = await until(
    "a: the new session read its opening",
    () => sendsTo(fleet, target)[0],
    (send) => send?.state === "read",
    120_000
  ).catch(() => undefined);
  check(
    "a: its opening comes from the old session and carries your comment",
    opening?.from_session === old &&
      (opening.content ?? "").startsWith(OPENING) &&
      (opening.content ?? "").includes(COMMENT.a),
    JSON.stringify({
      from: opening?.from_session,
      head: opening?.content?.slice(0, 200),
      state: opening?.state,
    })
  );
  const ended = await until(
    "a: the new session finished the attempt",
    () => itemsOf(fleet, task)[0],
    (one) => one?.headline === HEADLINE.continuedA,
    300_000
  ).catch(() => undefined);
  const toOld = sendsTo(fleet, old).filter((send) =>
    (send.content ?? "").includes(COMMENT.a)
  );
  check(
    "a: the new session finished the attempt itself, the only attempt at the task, and the old session was sent nothing",
    ended?.instance_id === target &&
      itemsOf(fleet, task).length === 1 &&
      toOld.length === 0,
    JSON.stringify({ ended, attempts: itemsOf(fleet, task).length, toOld })
  );
};

/** (b) Warm, Jev attach: the attempt's own session takes your comment. */
const warmAttaches = async (
  { check }: Kit,
  fleet: KitFleet,
  projectId: string,
  parent: string
): Promise<void> => {
  const { item, task } = await attempted(fleet, projectId, parent, TASKS.b);
  const old = item.instance_id;
  setCache(fleet, old, "warm");
  attachNoul = 0.9;
  await comment(fleet, projectId, task, COMMENT.b);
  const ended = await until(
    "b: the attempt's session finished it again",
    () => itemsOf(fleet, task)[0],
    (one) => one?.headline === HEADLINE.attachedB,
    300_000
  ).catch(() => undefined);
  const yours = sendsTo(fleet, old).filter((send) =>
    (send.content ?? "").includes(COMMENT.b)
  );
  const log = await fleet.logs("hub");
  check(
    "b: warm, your comment goes to the attempt's own session, which finishes it again; no continuation",
    log.includes(
      `[tasks] ${task} in ${projectId}: Jev says attach (0.90, cache warm)`
    ) &&
      ended?.instance_id === old &&
      yours.some((send) => send.content.includes(YOURS)) &&
      itemsOf(fleet, task).length === 1 &&
      (await continuationsFrom(fleet, old)).length === 0,
    `${JSON.stringify({
      ended,
      yours: yours.map((send) => send.state),
      continuations: await continuationsFrom(fleet, old),
    })} ${ended?.headline === HEADLINE.attachedB ? "" : await trail(fleet, old, item.workspace_id)}`
  );
};

/** (c) Jev fresh: a fresh attempt starts, briefed with your comment. */
const freshStarts = async (
  { check }: Kit,
  fleet: KitFleet,
  projectId: string,
  parent: string
): Promise<void> => {
  const { item, task } = await attempted(fleet, projectId, parent, TASKS.c);
  const old = item.instance_id;
  setCache(fleet, old, "cold");
  attachNoul = 0.05;
  await comment(fleet, projectId, task, COMMENT.c);
  const fresh = await until(
    "c: a fresh attempt finished",
    () => itemsOf(fleet, task)[1],
    (one) => one?.headline === HEADLINE.freshC,
    300_000
  ).catch(() => undefined);
  const log = await fleet.logs("hub");
  check(
    "c: Jev says fresh: a fresh attempt in another session, briefed with your comment; no continuation",
    log.includes(`[tasks] ${task} in ${projectId}: Jev says fresh (0.05`) &&
      !!fresh &&
      fresh.instance_id !== old &&
      (await continuationsFrom(fleet, old)).length === 0 &&
      sendsTo(fleet, old).every((send) => !send.content?.includes(COMMENT.c)),
    JSON.stringify({ fresh, attempts: itemsOf(fleet, task).length })
  );
};

interface TaskRead {
  acceptance: string;
  closeReason: string | null;
  kind: string;
  path: string;
  todos: { done: boolean; proposed: boolean; text: string }[];
}

interface HistoryRead {
  events: {
    commit: string;
    path: string;
    reason: string | null;
    stage: { from: string | null; to: string } | null;
    what: string;
  }[];
}

/** (f) Closed as criteria met: the criteria and the to-dos read ticked. */
const metTicks = async (
  { check }: Kit,
  fleet: KitFleet,
  projectId: string,
  parent: string
): Promise<void> => {
  const task = await fleet.api<{ id: string }>(
    `/api/projects/${projectId}/tasks`,
    {
      title: TASKS.f,
      stage: "ready",
      lands: "none",
      acceptance: CRITERIA_F.map((each) => `- ${each}`).join("\n"),
      todos: [`(proposed) ${STEP_F}`],
    }
  );
  const at = `/api/projects/${projectId}/tasks/${task.id}`;
  const before = await fleet.api<TaskRead>(at);
  check(
    "f: the task stands with its two criteria unticked and one proposed to-do open",
    !before.acceptance.includes("[x]") &&
      before.todos.length === 1 &&
      before.todos[0]?.proposed === true &&
      before.todos[0]?.done === false,
    JSON.stringify(before)
  );
  await fleet.api(`${at}/attempts`, { parentInstanceId: parent });
  const item = await until(
    "f: its attempt finished",
    () => itemsOf(fleet, task.id)[0],
    (row) => row?.state === "done" || row?.state === "failed",
    300_000
  ).catch(() => undefined);
  const closed = await until(
    "f: the task is in done",
    () => fleet.api<TaskRead>(at),
    (one) => one.kind === "done",
    120_000
  ).catch(() => undefined);
  const after = closed ?? (await fleet.api<TaskRead>(at));
  check(
    "f: the attempt finished done and the task closed as criteria met",
    item?.state === "done" &&
      after.kind === "done" &&
      !!after.closeReason?.includes(MET),
    `${JSON.stringify({ item, kind: after.kind, closeReason: after.closeReason })} ${after.kind === "done" ? "" : await trail(fleet, task.id, item?.id ?? task.id)}`
  );
  check(
    "f: both acceptance criteria read ticked",
    after.acceptance === CRITERIA_F.map((each) => `- [x] ${each}`).join("\n"),
    JSON.stringify(after.acceptance)
  );
  const history = await fleet.api<HistoryRead>(`${at}/history`);
  const close = history.events.find(
    (event) => event.stage?.to === "done" && event.reason?.includes(MET)
  );
  const folder = join(
    dirname(fleet.env.CAWCO_DB_PATH ?? ""),
    "projects",
    projectId
  );
  const atClose = close
    ? await Bun.$`git show ${`${close.commit}:${close.path}`}`
        .cwd(folder)
        .quiet()
        .nothrow()
        .text()
    : "";
  check(
    "f: the move into done ticked them in its own commit",
    CRITERIA_F.every((each) => atClose.includes(`- [x] ${each}`)),
    `${JSON.stringify(history.events.map((event) => [event.what, event.reason]))} ${atClose.slice(0, 600)}`
  );
  check(
    "f: every to-do reads ticked: the plan's completed step ticked the proposed one",
    after.todos.length > 0 && after.todos.every((todo) => todo.done),
    JSON.stringify(after.todos)
  );
};

/** (d) Jev off, cold, idle, same task: the rule continues it compressed. */
const offContinues = async (
  { check }: Kit,
  fleet: KitFleet,
  projectId: string,
  parent: string
): Promise<void> => {
  const off = await fetch(`${fleet.base}/api/jev/typesafe-key`, {
    method: "DELETE",
  });
  check("d: Jev is off (its TypeSafe key removed)", off.ok, `${off.status}`);
  const { item, task } = await attempted(fleet, projectId, parent, TASKS.d);
  const old = item.instance_id;
  setCache(fleet, old, "cold");
  await comment(fleet, projectId, task, COMMENT.d);
  const job = await until(
    "d: a continuation of the attempt's session started",
    () => continuationsFrom(fleet, old),
    (jobs) => jobs.some((one) => one.stage === "started"),
    300_000
  )
    .then((jobs) => jobs.find((one) => one.stage === "started"))
    .catch(() => undefined);
  const ruled = (await fleet.logs("hub"))
    .split("\n")
    .find((line) =>
      line.includes(`[jev off] Attach or fresh project=${projectId}: ${task}'s`)
    );
  const ended = job
    ? await until(
        "d: the new session finished the attempt",
        () => itemsOf(fleet, task)[0],
        (one) => one?.headline === HEADLINE.continuedD,
        300_000
      ).catch(() => undefined)
    : undefined;
  check(
    "d: Jev off, a cold attempt idle on its task continues compressed: the item names the new session, which finishes it",
    !!ruled?.includes("is cold and idle: it continues compressed") &&
      !!job &&
      job.targetInstanceId !== old &&
      ended?.instance_id === job.targetInstanceId &&
      itemsOf(fleet, task).length === 1,
    `${JSON.stringify({ ruled, job, ended, attempts: itemsOf(fleet, task).length })} ${ended ? "" : await trail(fleet, old, item.workspace_id, task)}`
  );
};

/** (e) The dashboard's continue route carries a running delegate's item. */
const routeCarries = async (
  { check }: Kit,
  fleet: KitFleet,
  parent: string,
  repo: string
): Promise<void> => {
  const leaf = await fleet.api<{ instanceId: string; workItemId: string }>(
    "/api/work-items",
    {
      parentInstanceId: parent,
      title: TITLE_E,
      prompt: `${LEAF_E}: declare a wait and wait.`,
      harness: "claude",
      model: "claude-haiku-4-5",
      cwd: repo,
      lands: "none",
    }
  );
  await until(
    "e: the delegate's wait declared",
    () =>
      fleet.query<{ wait_until: number | null }>(
        "SELECT wait_until FROM work_items WHERE id = ?",
        leaf.workItemId
      )[0]?.wait_until ?? null,
    (at) => at !== null,
    180_000
  );
  await atRest(fleet, leaf.instanceId);
  // As the dashboard's Continue in new session sends it.
  const started = await fleet.api<{ targetInstanceId: string }>(
    `/api/instances/${leaf.instanceId}/continue`,
    { summarizer: { harness: "claude" }, target: { harness: "claude" } }
  );
  const target = started.targetInstanceId;
  const finishedThere = await until(
    "e: the continuation finished the delegate's item",
    () =>
      fleet.query<{ headline: string | null; instance_id: string }>(
        "SELECT headline, instance_id FROM work_items WHERE id = ?",
        leaf.workItemId
      )[0],
    (row) => row?.headline === HEADLINE.continuedE,
    300_000
  ).catch(() => undefined);
  const [carried] = fleet.query<{ instance_id: string }>(
    "SELECT instance_id FROM work_items WHERE id = ?",
    leaf.workItemId
  );
  const rows = fleet.query<{ id: string; work_item_id: string | null }>(
    "SELECT id, work_item_id FROM instances WHERE id IN (?, ?)",
    leaf.instanceId,
    target
  );
  const of = (id: string) => rows.find((row) => row.id === id)?.work_item_id;
  check(
    "e: continued through the dashboard's route, the delegate's item names the new session, finish_item works there, and the old session holds no item",
    carried?.instance_id === target &&
      of(target) === leaf.workItemId &&
      of(leaf.instanceId) === null &&
      finishedThere?.instance_id === target,
    `${JSON.stringify({ old: leaf.instanceId, target, carried, rows, finishedThere, looked: [...looked] })} ${finishedThere ? "" : await trail(fleet, leaf.instanceId, target)}`
  );
};

const run = async (kit: Kit) => {
  const jev = jevMock(undefined, (call, id) => {
    if (id === "attach") {
      return attachNoul;
    }
    // Leg f's criteria, as judged checks ask them (jev-placement.ts `jevJudged`).
    return "attempt_report" in call.state && CRITERION_ID.test(id) ? 0.9 : 0.05;
  });
  try {
    const fleet = await kit.fleet(respond);
    fleet.standIns.typesafeUrl = jev.url;
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    await jevOn(fleet.base);
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
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "Attach or spawn",
      machineId: MACHINE,
      cwd: repo,
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
    const parent = await fleet.spawn("claude", "Parent", repo, {
      projectId: project.id,
    });
    await coldContinues(kit, fleet, project.id, parent);
    await warmAttaches(kit, fleet, project.id, parent);
    await freshStarts(kit, fleet, project.id, parent);
    await metTicks(kit, fleet, project.id, parent);
    await offContinues(kit, fleet, project.id, parent);
    await routeCarries(kit, fleet, parent, repo);
  } finally {
    jev.stop();
  }
};

export default {
  name: "attach-continue",
  host: "its attempts cut workspaces",
  run,
} satisfies Spec;

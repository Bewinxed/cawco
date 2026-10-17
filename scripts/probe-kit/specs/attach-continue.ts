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
 *
 *   bun scripts/probe-kit/run.ts attach-continue
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { jevMock, jevOn } from "../jev-mock";
import type { Kit, KitFleet, Spec } from "../kit";

const FINISH = "mcp__cawco__finish_item";
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
} as const;
const COMMENT = {
  a: "PROBE-AC-COMMENT-A go on from where you stopped",
  b: "PROBE-AC-COMMENT-B go on in your own session",
  c: "PROBE-AC-COMMENT-C start this over",
} as const;
/** The headline each finish carries: who finished which item, after what. */
const HEADLINE = {
  firstA: "PROBE-AC-FIRST-A",
  firstB: "PROBE-AC-FIRST-B",
  firstC: "PROBE-AC-FIRST-C",
  continuedA: "PROBE-AC-CONTINUED-A",
  attachedB: "PROBE-AC-ATTACHED-B",
  freshC: "PROBE-AC-FRESH-C",
} as const;
const STAGES =
  "---\nready      todo\nworking    active\nreview     you\ndone       done\ndropped    dropped\nmoves\n  * → *    you, session\nviews\n  board      by stage\n---\n";

/** Jev's noul for Attach or fresh: at or above 0.5, attach. */
let attachNoul = 0.05;
const finished = new Set<string>();

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

/** Fails the session's item as blocked, once per headline. */
const finishOnce = (request: Seen, headline: string): Reply => {
  if (finished.has(headline)) {
    return text("Stopped.");
  }
  const reply = found(request, FINISH, {
    headline,
    summary: headline,
    blocked: { command: "probe", error: "the probe ends this item here" },
  });
  if (reply.tool?.name === FINISH) {
    finished.add(headline);
  }
  return reply;
};

/** An attempt's session: its brief, then what your comment handed it. */
const attempt = (request: Seen): Reply => {
  if (request.all.includes(COMMENT.b)) {
    return finishOnce(request, HEADLINE.attachedB);
  }
  if (request.all.includes(COMMENT.c)) {
    return finishOnce(request, HEADLINE.freshC);
  }
  if (request.all.includes(TASKS.a)) {
    return finishOnce(request, HEADLINE.firstA);
  }
  if (request.all.includes(TASKS.b)) {
    return finishOnce(request, HEADLINE.firstB);
  }
  return finishOnce(request, HEADLINE.firstC);
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
    return request.all.includes(COMMENT.a)
      ? finishOnce(request, HEADLINE.continuedA)
      : text("ok");
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
    JSON.stringify(await fleet.api<Job[]>("/api/continuations"))
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
    JSON.stringify({
      ended,
      yours: yours.map((send) => send.state),
      continuations: await continuationsFrom(fleet, old),
    })
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

const run = async (kit: Kit) => {
  const jev = jevMock(undefined, (_call, id) =>
    id === "attach" ? attachNoul : 0.05
  );
  try {
    const fleet = await kit.fleet(respond);
    fleet.env.CAWCO_TYPESAFE_URL = jev.url;
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
  } finally {
    jev.stop();
  }
};

export default { name: "attach-continue", run } satisfies Spec;

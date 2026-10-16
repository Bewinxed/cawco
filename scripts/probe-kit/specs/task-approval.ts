/**
 * Your approval goes to the agent that filed the task, and that agent does
 * what comes next (hub task-approval.ts; owner, 2026-10-16: "the agent who
 * puts the task should be the one who decides what happens to it after i
 * approve it"). On a scratch fleet (real hub, agent and sessiond; Claude
 * Code against the mock model), Caw off and Jev off. Its attempt cuts a
 * workspace, so it runs where a workspace boundary can start (a `host`
 * check), not inside another one.
 *
 * Project "Approvals" has a `review` stage of kind `you`, then `approved`
 * (waiting) and `posted` (done). A "Filer" session in it:
 *
 * a. files a task with `task_create` (an acceptance criterion, lands none)
 *    and starts an attempt at it with `task_start`; the attempt finishes
 *    with a headline, and with the lead off its criterion goes to you: the
 *    task waits in review, needsYou, its result the attempt's headline;
 * b. the owner approves it in the task sheet (its stage route, as the web
 *    and iOS sheets move it): review → approved;
 * c. the filer is sent the approval: its model is asked with a message
 *    naming the task's id, "approved" and the result's headline;
 * d. its follow-through lands: it moves the task approved → posted;
 * e. the task's activity (its history) shows your approval, review →
 *    approved by you with the reason "approved", and after it the filer's
 *    move, approved → posted, by the filer's session.
 *
 *   bun scripts/probe-kit/run.ts task-approval
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const CREATE = "mcp__cawco__task_create";
const START = "mcp__cawco__task_start";
const MOVE = "mcp__cawco__task_update";
const FINISH = "mcp__cawco__finish_item";
/** Only an attempt's brief opens this way. */
const BRIEF = "Your work item is an attempt at";
const TITLE = "Post the launch note";
const RESULT = "Drafted the launch note PROBE-RESULT.";
/** How the hub's approval opens (task-approval.ts `approvalText`). */
const APPROVED = /The owner approved (tsk-\d+)/;
const FOLLOW_REASON = "posted the launch note";
const STAGES =
  "---\nready      todo\nworking    active\nreview     you\napproved   waiting\nposted     done\ndropped    dropped\nmoves\n  * → *    you, session\nviews\n  board      by stage\n---\n";
const COMMAND = /PROBE-CMD:\w+/g;

interface Call {
  input: object;
  name: string;
}
/** By a turn's key (a command's marker, or the approval's task id): the tool calls it makes, in order. */
const scripts = new Map<string, Call[]>();
/** What the filer's model was asked with, each approval's words. */
const filerHeard: string[] = [];
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
  const queue = key ? scripts.get(key) : undefined;
  const [next] = queue ?? [];
  if (!(queue && next)) {
    return text("Done.");
  }
  const first = found(request, next);
  if (first) {
    return first;
  }
  queue.shift();
  return useTool(next.name, next.input);
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (request.all.includes(BRIEF)) {
    return attempt(request);
  }
  const approval = APPROVED.exec(request.last)?.[1];
  if (approval) {
    if (!scripts.has(approval)) {
      filerHeard.push(request.last);
      // The filer's follow-through: it posts, and moves the task on.
      scripts.set(approval, [
        {
          name: MOVE,
          input: { id: approval, stage: "posted", reason: FOLLOW_REASON },
        },
      ]);
    }
    return scripted(request, approval);
  }
  return scripted(request, [...request.last.matchAll(COMMAND)].at(-1)?.[0]);
};

interface TaskRead {
  attempts: { state: string }[];
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

const run = async (kit: Kit) => {
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
    const project = await projectOf(fleet, repo);
    const filer = await fleet.spawn("claude", "Filer", repo, {
      projectId: project.id,
    });
    kit.note(`project ${project.id}, filer ${filer}`);

    const read = (taskId: string) =>
      fleet.api<TaskRead>(`/api/projects/${project.id}/tasks/${taskId}`);
    const command = async (marker: string, calls: Call[]) => {
      scripts.set(`PROBE-CMD:${marker}`, calls);
      await fleet.send(filer, `PROBE-CMD:${marker}`);
    };

    // ── a. the filer files the task and starts its attempt ─────────────────
    await command("FILE", [
      {
        name: CREATE,
        input: {
          title: TITLE,
          stage: "ready",
          lands: "none",
          acceptance: "- The note reads well",
        },
      },
    ]);
    const filed = await until(
      "the filer's task",
      async () =>
        (
          await fleet.api<{ tasks: { id: string; title: string }[] }>(
            `/api/projects/${project.id}/tasks`
          )
        ).tasks.find((task) => task.title === TITLE),
      Boolean,
      120_000
    );
    if (!filed) {
      throw new Error("the filer filed no task");
    }
    const { id } = filed;
    await command("START", [{ name: START, input: { id } }]);
    const waiting = await until(
      `${id} waiting in review with its result`,
      () => read(id),
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
    const approved = await fleet.api<{ stage: string }>(
      `/api/projects/${project.id}/tasks/${id}/stage`,
      { stage: "approved" }
    );
    kit.check(
      "b: the owner's approval goes: review → approved",
      approved.stage === "approved",
      `stage ${approved.stage}`
    );

    // ── c. the filer hears it ──────────────────────────────────────────────
    const heard = await until(
      "the filer's model asked with the approval",
      () => filerHeard.find((words) => words.includes(id)),
      Boolean,
      120_000
    );
    kit.check(
      "c: the filer is sent the approval, naming the task, “approved” and its result",
      Boolean(
        heard?.includes(`approved ${id}`) &&
        heard.includes(TITLE) &&
        heard.includes(RESULT)
      ),
      (heard ?? "none").slice(0, 400)
    );
    const [sent] = fleet.query<{ origin: string; state: string }>(
      "SELECT state, json_extract(body, '$.origin.kind') AS origin FROM sent_messages WHERE instance_id = ? AND body LIKE ? ORDER BY accepted_at",
      filer,
      `%The owner approved ${id}%`
    );
    kit.check(
      "c: it went to the filer as your words, and it read them",
      sent?.origin === "human" && sent.state === "read",
      JSON.stringify(sent ?? null)
    );

    // ── d. its follow-through lands ────────────────────────────────────────
    const posted = await until(
      `${id} posted by its filer`,
      () => read(id),
      (task) => task.stage === "posted",
      120_000
    );
    kit.check(
      "d: the filer's follow-through lands: approved → posted",
      posted?.stage === "posted",
      `stage ${posted?.stage}`
    );

    // ── e. the activity shows both ─────────────────────────────────────────
    const { events } = await fleet.api<{ events: HistoryEvent[] }>(
      `/api/projects/${project.id}/tasks/${id}/history`
    );
    const approval = events.findIndex(
      (event) =>
        event.kind === "moved" &&
        event.stage?.from === "review" &&
        event.stage.to === "approved" &&
        event.actor.mover === "you" &&
        event.reason === "approved"
    );
    const follow = events.findIndex(
      (event) =>
        event.kind === "moved" &&
        event.stage?.from === "approved" &&
        event.stage.to === "posted" &&
        event.actor.id === filer &&
        event.reason === FOLLOW_REASON
    );
    kit.check(
      "e: the activity shows your approval, then the filer's follow-through",
      approval >= 0 && follow > approval,
      JSON.stringify(
        events.map((event) => ({
          kind: event.kind,
          by: event.actor.name,
          stage: event.stage,
          reason: event.reason,
        }))
      )
    );
  } catch (error) {
    // What the fleet said, kept before it is cleaned away.
    for (const name of ["hub", "agent", "sessiond"] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: three logs, in order
      await writeFile(join(kit.out, `${name}.log`), await fleet.logs(name));
    }
    kit.note(`failure captures: ${kit.out}`);
    throw error;
  }
};

/** The project on the fleet's machine at `repo`, Caw off, with the probe's stages. */
const projectOf = async (
  fleet: KitFleet,
  repo: string
): Promise<{ id: string }> => {
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Approvals",
    machineId: MACHINE,
    cwd: repo,
    caw: false,
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
  return project;
};

export default { name: "task-approval", run } satisfies Spec;

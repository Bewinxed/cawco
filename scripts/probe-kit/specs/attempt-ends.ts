/**
 * A failed or stopped attempt is the business of whoever started it, never
 * the person's Needs you (hub tasks.ts `needsYou`, dispatch.ts, push.ts
 * `itemEnded`). On a scratch fleet (real hub, agent and sessiond; Claude Code
 * against the mock model) with Cawrier a local stand-in that records every
 * push (`CAWCO_CAWRIER_ORIGIN`) and one registered device. Run it where a
 * workspace boundary can start (not inside another one).
 *
 * Project "Ends" (Caw off) has a `review` stage of kind `you`; a "Starter"
 * session in it starts attempts with `task_start` and stops them with
 * `stop_delegate`, as the orchestrator stopped tsk-7 and tsk-15 on
 * 2026-10-15 to rerun them on the Mac. The owner has the starter open on
 * the dashboard (a web client's presence on it), so its own finished turns
 * are the gate's to drop. Project "Led" has Caw on and dispatch on.
 *
 * a. An attempt the starter started fails (finish_item blocked): the task
 *    is not needsYou, nor listed under needsYou; it reads failed, its attempt
 *    says "Attempt failed: Blocked: probe"; the starter's session read the
 *    attempt's report; nothing reaches the phone.
 * b. An attempt the starter started and then stopped: no failed flag, not
 *    needsYou, stopped, its attempt says "Stopped by <the starter>".
 * c. The dispatcher's attempt at a ready task fails: the lead (Caw) read
 *    its report, and his turn had the failure; the task is not needsYou;
 *    nothing reaches the phone; and the dispatcher does not start it again.
 * d. The starter moves a task into `review`: needsYou, and pushed.
 * e. An attempt the owner started from the dashboard fails: not needsYou,
 *    and its failure is pushed (kind `attempt`).
 * f. The owner's dashboard start queues behind a live attempt that owns the
 *    same files (`owns`); that attempt ends (its starter stops it), the
 *    queued start runs as the owner's (origin `you`, by_person), fails, and
 *    its failure is pushed.
 *
 *   bun scripts/probe-kit/run.ts attempt-ends
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const FINISH = "mcp__cawco__finish_item";
const START = "mcp__cawco__task_start";
const STOP = "mcp__cawco__stop_delegate";
const MOVE = "mcp__cawco__task_update";
/** Only an attempt's brief opens this way. */
const BRIEF = "Your work item is an attempt at";
/** A task whose attempt fails at once carries this in its title. */
const FAIL = "PROBE-FAIL";
const CAW = "You are Caw";
const STAGES =
  "---\nready      todo\nworking    active\nreview     you\ndone       done\ndropped    dropped\nmoves\n  * → *    you, session\nviews\n  board      by stage\n---\n";
/** The burst's quiet after its last arrival (push.ts `QUIET_MS`), and slack. */
const QUIET_MS = 10_000;
const SLACK_MS = 8000;
const COMMAND = /PROBE-CMD:\w+/g;

interface Call {
  input: object;
  name: string;
}
/** By a starter command's marker: the tool calls its turn makes, in order. */
const scripts = new Map<string, Call[]>();
/** What Caw's turns were asked, in order: his wake's words. */
const cawHeard: string[] = [];

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const useTool = (name: string, input: object): Reply => ({
  everyMs: 1,
  words: [],
  tool: { name, input },
});
/** A deferred tool is found first; then called. */
const call = (request: Seen, next: Call): Reply | undefined => {
  if (request.toolNames.includes(next.name)) {
    return undefined;
  }
  return request.toolNames.includes("ToolSearch")
    ? useTool("ToolSearch", { query: `select:${next.name}`, max_results: 1 })
    : text(`${next.name} is not offered`);
};

/** An attempt whose task's title says FAIL calls finish_item blocked, once. */
const failing = (request: Seen): Reply => {
  if (request.body.includes("failed as blocked")) {
    return text("ok");
  }
  const finish: Call = {
    name: FINISH,
    input: {
      headline: "Blocked on purpose.",
      summary: "Blocked on purpose.",
      blocked: { command: "probe", error: "probe blocks this attempt" },
    },
  };
  return call(request, finish) ?? useTool(finish.name, finish.input);
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  const brief = request.all.indexOf(BRIEF);
  if (brief >= 0) {
    const end = request.all.indexOf("\n", brief);
    const head = request.all.slice(brief, end < 0 ? undefined : end);
    // Any other attempt says ok and stays open until it is stopped.
    return head.includes(FAIL) ? failing(request) : text("ok");
  }
  if (request.all.includes(CAW)) {
    cawHeard.push(request.last);
    return text("ok");
  }
  const marker = [...request.last.matchAll(COMMAND)].at(-1)?.[0];
  const queue = marker ? scripts.get(marker) : undefined;
  const [next] = queue ?? [];
  if (!(queue && next)) {
    return text("Done.");
  }
  const found = call(request, next);
  if (found) {
    return found;
  }
  queue.shift();
  return useTool(next.name, next.input);
};

interface PushBody {
  collapseId?: string;
  payload: {
    aps: { alert?: { body?: string; title?: string } };
    cawco?: { count?: number; kind?: string; taskId?: string };
  };
  pushType?: string;
}
interface Pushed {
  at: number;
  body: PushBody;
}
interface TaskRead {
  attempts: {
    endedHow: string | null;
    instanceId: string;
    state: string;
    workItemId: string;
  }[];
  lastAttemptFailed: boolean;
  lastAttemptStopped: boolean;
  needsYou: boolean;
  stage: string;
}

const run = async (kit: Kit) => {
  const pushes: Pushed[] = [];
  const cawrier = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (new URL(request.url).pathname === "/v1/push") {
        const body = (await request.json()) as PushBody;
        pushes.push({ at: Date.now(), body });
        kit.note(
          `cawrier ← ${body.pushType ?? "alert"} ${body.collapseId ?? ""} ${body.payload.cawco?.kind ?? ""} "${body.payload.aps.alert?.title ?? ""}" / "${body.payload.aps.alert?.body ?? ""}"`
        );
      }
      return Response.json({ ok: true });
    },
  });
  const visible = () =>
    pushes.filter((one) => one.body.pushType !== "background");

  const fleet = await kit.fleet(respond);
  fleet.env.CAWCO_CAWRIER_ORIGIN = `http://127.0.0.1:${cawrier.port}`;
  let beating: ReturnType<typeof setInterval> | undefined;
  try {
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    await fleet.api("/api/push/register", {
      pairingId: crypto.randomUUID(),
      secret: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
        "base64url"
      ),
      key: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
        "base64"
      ),
      name: "Probe iPhone",
      platform: "ios",
    });

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
    const ends = await projectOf(fleet, "Ends", repo, false);
    const starter = await fleet.spawn("claude", "Starter", repo, {
      projectId: ends.id,
    });
    kit.note(`project ${ends.id}, starter ${starter}`);
    // The owner has the starter open: its own finished turns push nothing.
    const beat = () =>
      fleet.api("/api/presence", {
        clientId: "probe-web",
        client: "web",
        sessionId: starter,
        active: true,
        saidAt: Date.now(),
      });
    await beat();
    beating = setInterval(() => {
      beat().catch(() => undefined);
    }, 15_000);

    const read = (projectId: string, id: string) =>
      fleet.api<TaskRead>(`/api/projects/${projectId}/tasks/${id}`);
    const needing = async (projectId: string) =>
      (
        await fleet.api<{ tasks: { id: string }[] }>(
          `/api/projects/${projectId}/tasks?needsYou=1`
        )
      ).tasks.map((task) => task.id);
    /** The task's newest attempt once it reads `state`. */
    const ended = async (projectId: string, id: string, state: string) => {
      const task = await until(
        `${id}'s attempt ${state}`,
        () => read(projectId, id),
        (each) => each.attempts[0]?.state === state,
        300_000
      );
      if (!task?.attempts[0]) {
        throw new Error(`${id} has no attempt`);
      }
      return { task, attempt: task.attempts[0] };
    };
    /** The report `from` sent `to`, as the hub kept it: its state. */
    const reportTo = (to: string, from: string) =>
      until(
        `the report of ${from.slice(0, 8)} read by ${to.slice(0, 8)}`,
        () =>
          fleet.query<{ mode: string; state: string }>(
            "SELECT mode, state FROM sent_messages WHERE instance_id = ? AND json_extract(body, '$.origin.fromSession') = ? ORDER BY accepted_at",
            to,
            from
          )[0],
        (row) => row?.state === "read",
        120_000
      );
    /** Every visible push about a task: its own, an attempt's, or a burst naming its title. */
    const pushedAbout = (projectId: string, id: string, title: string) =>
      visible().filter(
        (one) =>
          one.body.collapseId === `task-${projectId}:${id}` ||
          one.body.payload.cawco?.taskId === id ||
          (one.body.payload.cawco?.kind === "needs" &&
            (one.body.payload.aps.alert?.body ?? "").includes(title))
      );
    const quiet = () => Bun.sleep(QUIET_MS + SLACK_MS);
    const file = (projectId: string, title: string, fields: object = {}) =>
      fleet
        .api<{ id: string }>(`/api/projects/${projectId}/tasks`, {
          title,
          stage: "ready",
          ...fields,
        })
        .then((task) => task.id);
    const command = async (marker: string, calls: Call[]) => {
      scripts.set(`PROBE-CMD:${marker}`, calls);
      await fleet.send(starter, `PROBE-CMD:${marker}`);
    };

    // ── a. the starter's attempt fails ────────────────────────────────────
    const aTitle = `${FAIL} build the widget`;
    const aId = await file(ends.id, aTitle);
    await command("A", [{ name: START, input: { id: aId } }]);
    const a = await ended(ends.id, aId, "failed");
    const aReport = await reportTo(starter, a.attempt.instanceId);
    kit.check(
      "a: the starter's failed attempt is not needsYou, nor listed under it",
      !(a.task.needsYou || (await needing(ends.id)).includes(aId)),
      JSON.stringify({ needsYou: a.task.needsYou, stage: a.task.stage })
    );
    kit.check(
      "a: its failure shows on the task",
      a.task.lastAttemptFailed &&
        !a.task.lastAttemptStopped &&
        (a.attempt.endedHow ?? "").startsWith("Attempt failed: Blocked: probe"),
      JSON.stringify(a.attempt)
    );
    kit.check(
      "a: the starter's session read the attempt's report",
      aReport?.state === "read",
      JSON.stringify(aReport)
    );

    // ── b. the starter stops its own attempt ──────────────────────────────
    const bTitle = "PROBE-HOLD tidy the README";
    const bId = await file(ends.id, bTitle);
    await command("B1", [{ name: START, input: { id: bId } }]);
    const bLive = await until(
      `${bId}'s attempt running`,
      () => read(ends.id, bId),
      (task) => task.attempts[0]?.state === "running",
      300_000
    );
    const bSession = bLive?.attempts[0]?.instanceId;
    if (!bSession) {
      throw new Error(`${bId}'s attempt never ran`);
    }
    await command("B2", [{ name: STOP, input: { target: bSession } }]);
    const b = await ended(ends.id, bId, "cancelled");
    kit.check(
      "b: the attempt its parent stopped is no failure and not needsYou",
      !(b.task.lastAttemptFailed || b.task.needsYou) &&
        b.task.lastAttemptStopped &&
        !(await needing(ends.id)).includes(bId),
      JSON.stringify({
        failed: b.task.lastAttemptFailed,
        stopped: b.task.lastAttemptStopped,
        needsYou: b.task.needsYou,
      })
    );
    kit.check(
      "b: it shows as stopped by the starter",
      b.attempt.endedHow === "Stopped by Starter",
      JSON.stringify(b.attempt)
    );

    // ── c. the dispatcher's attempt fails: the lead hears it ──────────────
    const led = await projectOf(fleet, "Led", repo, true);
    const cTitle = `${FAIL} wire the dispatcher`;
    const cId = await file(led.id, cTitle, { fields: { ready: "yes" } });
    await patch(fleet, `/api/projects/${led.id}/dispatch`, { dispatch: true });
    const c = await ended(led.id, cId, "failed");
    const lead = fleet.query<{ lead_instance_id: string | null }>(
      "SELECT lead_instance_id FROM projects WHERE id = ?",
      led.id
    )[0]?.lead_instance_id;
    if (!lead) {
      throw new Error("Led has no lead");
    }
    const [cParent] = fleet.query<{
      origin: string;
      parent_instance_id: string;
    }>(
      "SELECT parent_instance_id, origin FROM work_items WHERE id = ?",
      c.attempt.workItemId
    );
    const cReport = await reportTo(lead, c.attempt.instanceId);
    const cawTurn = await until(
      "Caw's turn with the failure",
      () =>
        cawHeard.find((words) => words.includes("probe blocks this attempt")),
      Boolean,
      120_000
    );
    kit.check(
      "c: the dispatcher's attempt reports to the lead, who read it",
      cParent?.parent_instance_id === lead &&
        cParent.origin === "event" &&
        cReport?.state === "read",
      JSON.stringify({ parent: cParent, lead, report: cReport })
    );
    kit.check(
      "c: the lead's turn had the failure",
      Boolean(cawTurn),
      (cawTurn ?? "none").slice(0, 200)
    );
    kit.check(
      "c: the dispatcher's failed attempt is not needsYou",
      !c.task.needsYou &&
        c.task.lastAttemptFailed &&
        !(await needing(led.id)).includes(cId),
      JSON.stringify({
        needsYou: c.task.needsYou,
        endedHow: c.attempt.endedHow,
      })
    );

    // Nothing of a, b or c reached the phone, after a burst's quiet; and
    // the dispatcher never started c again.
    await quiet();
    const silent = [
      ...pushedAbout(ends.id, aId, aTitle),
      ...pushedAbout(ends.id, bId, bTitle),
      ...pushedAbout(led.id, cId, cTitle),
    ];
    kit.check(
      "a–c: no push about a failed or stopped attempt a session or the dispatcher started",
      silent.length === 0,
      silent.map((one) => one.body.collapseId).join(", ") ||
        `${visible().length} visible pushes, none about them`
    );
    const cAttempts = (await read(led.id, cId)).attempts.length;
    kit.check(
      "c: the dispatcher does not start the failed task again",
      cAttempts === 1,
      `${cAttempts} attempts`
    );

    // ── d. a task moved into a `you` stage still needs you ────────────────
    const dTitle = "Choose the widget's colour";
    const dId = await file(ends.id, dTitle);
    const dFrom = Date.now();
    await command("D", [
      {
        name: MOVE,
        input: { id: dId, stage: "review", reason: "for your pick" },
      },
    ]);
    const d = await until(
      `${dId} in review`,
      () => read(ends.id, dId),
      (task) => task.stage === "review",
      120_000
    );
    const dPush = await until(
      "d: the review push",
      () => pushedAbout(ends.id, dId, dTitle).find((one) => one.at >= dFrom),
      Boolean,
      60_000
    );
    kit.check(
      "d: a task in a `you` stage is needsYou and listed under it",
      d?.needsYou === true && (await needing(ends.id)).includes(dId),
      JSON.stringify({ needsYou: d?.needsYou, stage: d?.stage })
    );
    kit.check(
      "d: and it is pushed",
      Boolean(dPush),
      dPush
        ? `${dPush.body.collapseId} ${dPush.body.payload.cawco?.kind}`
        : "none"
    );
    await quiet();

    // ── e. the owner's own attempt fails: pushed, still not needsYou ──────
    const eTitle = `${FAIL} ship the app`;
    const eId = await file(ends.id, eTitle);
    const eFrom = Date.now();
    await fleet.api(`/api/projects/${ends.id}/tasks/${eId}/attempts`, {
      parentInstanceId: starter,
    });
    const e = await ended(ends.id, eId, "failed");
    const ePush = await until(
      "e: the attempt push",
      () => pushedAbout(ends.id, eId, eTitle).find((one) => one.at >= eFrom),
      Boolean,
      60_000
    );
    kit.check(
      "e: the owner's failed attempt is not needsYou",
      !e.task.needsYou && e.task.lastAttemptFailed,
      JSON.stringify({
        needsYou: e.task.needsYou,
        endedHow: e.attempt.endedHow,
      })
    );
    kit.check(
      "e: its failure is pushed to the owner",
      Boolean(ePush),
      ePush
        ? `${ePush.body.collapseId} ${ePush.body.payload.cawco?.kind}`
        : "none"
    );
    await quiet();

    await queuedOwnStart(kit, fleet, {
      projectId: ends.id,
      starter,
      read,
      file,
      command,
      ended,
      pushedAbout,
    });

    await writeFile(
      join(kit.out, "pushes.json"),
      JSON.stringify(pushes, null, 2)
    );
    kit.note(`captures: ${kit.out}`);
  } catch (error) {
    // What the fleet said, kept before it is cleaned away.
    for (const name of ["hub", "agent", "sessiond"] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: three logs, in order
      await writeFile(join(kit.out, `${name}.log`), await fleet.logs(name));
    }
    await writeFile(
      join(kit.out, "work-items.json"),
      JSON.stringify(
        fleet.query(
          "SELECT id, task_id, project_id, parent_instance_id, state, error, origin, by_person, stopped_by FROM work_items"
        ),
        null,
        2
      )
    );
    kit.note(`failure captures: ${kit.out}`);
    throw error;
  } finally {
    clearInterval(beating);
    cawrier.stop(true);
  }
};

/** What case f needs of the run: its project, starter, and the run's helpers. */
interface CaseTools {
  command: (marker: string, calls: Call[]) => Promise<void>;
  ended: (
    projectId: string,
    id: string,
    state: string
  ) => Promise<{ attempt: TaskRead["attempts"][number]; task: TaskRead }>;
  file: (projectId: string, title: string, fields?: object) => Promise<string>;
  projectId: string;
  pushedAbout: (projectId: string, id: string, title: string) => Pushed[];
  read: (projectId: string, id: string) => Promise<TaskRead>;
  starter: string;
}

/**
 * f. The owner's dashboard start waits behind a live attempt that owns the
 * same files; that attempt is stopped, the queued start runs as the owner's,
 * fails, and is pushed.
 */
const queuedOwnStart = async (
  kit: Kit,
  fleet: KitFleet,
  { projectId, starter, read, file, command, ended, pushedAbout }: CaseTools
) => {
  const owns = { owns: ["src/**"] };
  const holderId = await file(projectId, "PROBE-HOLD refactor src", owns);
  await command("F1", [{ name: START, input: { id: holderId } }]);
  const holder = await until(
    `${holderId}'s attempt running`,
    () => read(projectId, holderId),
    (task) => task.attempts[0]?.state === "running",
    300_000
  );
  const holderSession = holder?.attempts[0]?.instanceId;
  if (!holderSession) {
    throw new Error(`${holderId}'s attempt never ran`);
  }
  const title = `${FAIL} rename src`;
  const id = await file(projectId, title, owns);
  const queued = await fleet.api<{ queued: boolean; text: string }>(
    `/api/projects/${projectId}/tasks/${id}/attempts`,
    { parentInstanceId: starter }
  );
  const [waiting] = fleet.query<{ origin: string | null }>(
    "SELECT origin FROM queued_task_starts WHERE project_id = ? AND task_id = ?",
    projectId,
    id
  );
  kit.check(
    "f: the owner's start waits for the files a live attempt owns",
    queued.queued && waiting?.origin === "you",
    `${queued.text} (queued origin ${waiting?.origin ?? "none"})`
  );
  const from = Date.now();
  await command("F2", [{ name: STOP, input: { target: holderSession } }]);
  const f = await ended(projectId, id, "failed");
  const [item] = fleet.query<{ by_person: number; origin: string }>(
    "SELECT origin, by_person FROM work_items WHERE id = ?",
    f.attempt.workItemId
  );
  const push = await until(
    "f: the queued start's failure push",
    () => pushedAbout(projectId, id, title).find((one) => one.at >= from),
    Boolean,
    60_000
  );
  kit.check(
    "f: the queued start ran as the owner's",
    item?.origin === "you" && item.by_person === 1 && !f.task.needsYou,
    JSON.stringify({ item, needsYou: f.task.needsYou })
  );
  kit.check(
    "f: its failure is pushed to the owner",
    Boolean(push),
    push ? `${push.body.collapseId} ${push.body.payload.cawco?.kind}` : "none"
  );
};

/** A project on the fleet's machine at `repo`, with the probe's stages. */
const projectOf = async (
  fleet: KitFleet,
  name: string,
  repo: string,
  caw: boolean
): Promise<{ id: string }> => {
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name,
    machineId: MACHINE,
    cwd: repo,
    caw,
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

const patch = async (fleet: KitFleet, path: string, body: object) => {
  const response = await fetch(`${fleet.base}${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${path}: ${response.status} ${await response.text()}`);
  }
};

export default { name: "attempt-ends", run } satisfies Spec;

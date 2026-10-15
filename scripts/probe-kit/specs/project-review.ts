/**
 * A project's board never routes work through the owner unless he chose it,
 * and its name is edited where it is shown. On a scratch fleet (real hub,
 * agent and sessiond; Claude Code against the mock model) and the built
 * dashboard against its hub:
 *
 * (a) Rename through the title: on the project's page a press on its name
 *     turns it into a field in the same type and place; an emptied name is
 *     refused under it in the hub's words; Escape puts the name back; a new
 *     name and Enter save it. The hub has it, and a second dashboard open on
 *     the same page shows it without a reload.
 * (b) A code-template project without a stages.md of its own reads the
 *     hub's code template, whose moves let a session close a task; a project
 *     whose stages.md is the code template as it was before (only you
 *     closed a task) loses the file on the hub's next start and reads the
 *     template. The rename is still there after that start.
 * (c) Review before done off (the default): a session moves a task from
 *     ready to done with `task_update`.
 * (d) Review before done on (`PATCH /api/projects/:id`): the stages the hub
 *     answers put `by: you` on done; the session's ready → done is refused
 *     and the task stays; it may still move it to review; its review → done
 *     is refused; the owner's review → done goes.
 *
 *   bun scripts/probe-kit/run.ts project-review
 */
import type { Page } from "playwright-core";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, open, type Spec, settle } from "../kit";

const UPDATE = "mcp__cawco__task_update";
const COMMAND = /PROBE-CALL:(\d+)/g;
const NEW_NAME = "Renamed probe";

/** The code template as it was before review was a project's choice. */
const FORMER_CODE = `---
ready      todo
working    active
review     you
done       done
dropped    dropped
moves
  * → *                you
  ready → working      lead, session
  ready → review       lead, session
  working → review     lead, session
  review → working     lead
  review → ready       lead, session
  * → dropped          lead
views
  board      by stage
  table      by rank
---

Stages for code: a task waits in ready, is worked on, waits for your
review, and lands.
`;

interface Stages {
  moves: { from: string; to: string; who: string[] }[];
  source: "file" | "template";
  stages: { hooks: { by?: string }; kind: string; name: string }[];
}

interface Project {
  id: string;
  name: string;
  review: boolean;
}

/** Whether `who` may move from `from` to `to` by the stages the hub answers. */
const allows = (stages: Stages, from: string, to: string, who: string) => {
  const target = stages.stages.find((stage) => stage.name === to);
  return (
    !!target &&
    (!target.hooks.by || target.hooks.by === who) &&
    stages.moves.some(
      (move) =>
        (move.from === "*" || move.from === from) &&
        (move.to === "*" || move.to === to) &&
        move.who.includes(who)
    )
  );
};

/** The project head's name box: its rect, its font and the text it shows. */
const nameBox = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector<HTMLElement>(".project-head .name");
    if (!el) {
      return null;
    }
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(),
      top: Math.round(rect.top),
      left: Math.round(rect.left),
      height: Math.round(rect.height),
      font: `${style.fontSize} ${style.fontWeight} ${style.lineHeight} ${style.fontFamily}`,
      text:
        el instanceof HTMLInputElement
          ? el.value
          : (el.textContent ?? "").trim(),
    };
  });

const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
  }
  const marker = [...request.all.matchAll(COMMAND)].at(-1)?.[1];
  const ask = marker ? asks.get(marker) : undefined;
  if (!(marker && ask)) {
    return text("ok");
  }
  if (issued.has(marker)) {
    if (!answered.has(marker)) {
      answered.set(marker, request.last);
    }
    return text("done");
  }
  if (request.toolNames.includes(ask.name)) {
    issued.add(marker);
    return { everyMs: 5, words: [], tool: ask };
  }
  return request.toolNames.includes("ToolSearch")
    ? {
        everyMs: 5,
        words: [],
        tool: {
          name: "ToolSearch",
          input: { query: `select:${ask.name}`, max_results: 1 },
        },
      }
    : text(`${ask.name} is not offered`);
};

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  const patch = async (projectId: string, body: object) => {
    const response = await fetch(`${fleet.base}/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, text: await response.text() };
  };
  const projectOf = async (id: string) =>
    (await fleet.api<Project[]>("/api/projects")).find((row) => row.id === id);
  const stagesOf = (id: string) =>
    fleet.api<Stages>(`/api/projects/${id}/stages`);
  const stageOf = async (projectId: string, taskId: string) =>
    (
      await fleet.api<{ stage: string }>(
        `/api/projects/${projectId}/tasks/${taskId}`
      )
    ).stage;

  const project = await fleet.api<Project>("/api/projects", {
    name: "Review probe",
    machineId: MACHINE,
    cwd: fleet.repo,
    caw: false,
    template: "code",
  });
  const old = await fleet.api<Project>("/api/projects", {
    name: "Old code probe",
    caw: false,
  });
  kit.check(
    "a project starts with Review before done off",
    project.review === false && old.review === false,
    `review ${project.review}, ${old.review}`
  );

  // (a) the rename, on one dashboard, seen on a second.
  const base = await fleet.dashboard();
  const one = await kit.page("desk");
  const two = await kit.page("desk");
  await open(one, `${base}/project/${project.id}`, ".project-head button.name");
  await open(two, `${base}/project/${project.id}`, ".project-head button.name");
  await two.evaluate(() => {
    (window as unknown as { probeKept: boolean }).probeKept = true;
  });
  // The head comes to rest first: Caw's slot closes once his view is read,
  // and the name slides with it.
  const before = await until(
    "the head at rest",
    async () => {
      const first = await nameBox(one);
      await settle(one, 400);
      const second = await nameBox(one);
      return JSON.stringify(first) === JSON.stringify(second)
        ? second
        : undefined;
    },
    Boolean,
    30_000
  );
  await one.click(".project-head button.name");
  await one.waitForSelector(".project-head input.name");
  const editing = await nameBox(one);
  kit.check(
    "(a) a press on the name turns it into a field holding it, in the same type and place",
    before?.tag === "button" &&
      editing?.tag === "input" &&
      editing.text === "Review probe" &&
      editing.font === before.font &&
      editing.top === before.top &&
      editing.left === before.left &&
      editing.height === before.height,
    `before ${JSON.stringify(before)}, editing ${JSON.stringify(editing)}`
  );
  await one.fill(".project-head input.name", "   ");
  await one.press(".project-head input.name", "Enter");
  const refusal = await one
    .waitForSelector(".project-head .row-fault .reason", { timeout: 10_000 })
    .then((el) => el.textContent())
    .catch(() => null);
  kit.check(
    "(a) an empty name is refused under the field in the hub's words",
    refusal?.trim() === "A project needs a name.",
    `said ${JSON.stringify(refusal)}`
  );
  await one.press(".project-head input.name", "Escape");
  const escaped = await nameBox(one);
  kit.check(
    "(a) Escape puts the name back",
    escaped?.tag === "button" && escaped.text === "Review probe",
    JSON.stringify(escaped)
  );
  await one.click(".project-head button.name");
  await one.fill(".project-head input.name", NEW_NAME);
  await one.press(".project-head input.name", "Enter");
  await one
    .waitForFunction(
      (name) =>
        document
          .querySelector(".project-head button.name")
          ?.textContent?.trim() === name,
      NEW_NAME,
      { timeout: 10_000 }
    )
    .catch(() => undefined);
  const saved = await projectOf(project.id);
  const there = await nameBox(one);
  kit.check(
    "(a) Enter saves it: the hub has the new name and the head shows it",
    saved?.name === NEW_NAME &&
      there?.tag === "button" &&
      there.text === NEW_NAME,
    `hub ${saved?.name}, head ${JSON.stringify(there)}`
  );
  const live = await two
    .waitForFunction(
      (name) =>
        document
          .querySelector(".project-head button.name")
          ?.textContent?.trim() === name,
      NEW_NAME,
      { timeout: 10_000 }
    )
    .then(() => true)
    .catch(() => false);
  const kept = await two.evaluate(
    () => (window as unknown as { probeKept?: boolean }).probeKept === true
  );
  kit.check(
    "(a) the second dashboard shows the new name, with no reload",
    live && kept,
    `shown ${live}, same document ${kept}`
  );

  // (b) the code template as the hub has it, and a former copy dropped at start.
  const fresh = await stagesOf(project.id);
  kit.check(
    "(b) a code-template project without stages.md reads the code template, where a session closes a task",
    fresh.source === "template" &&
      allows(fresh, "ready", "done", "session") &&
      allows(fresh, "working", "done", "lead") &&
      allows(fresh, "review", "done", "session"),
    `source ${fresh.source}; moves ${JSON.stringify(fresh.moves)}`
  );
  await fetch(`${fleet.base}/api/projects/${old.id}/folder/file`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "stages.md", content: FORMER_CODE }),
  });
  const planted = await stagesOf(old.id);
  await fleet.stop("hub");
  fleet.launch("hub");
  await fleet.hubUp();
  const dropped = await until(
    "the old project's stages after the hub's start",
    () => stagesOf(old.id),
    (stages) => stages.source === "template",
    60_000
  ).catch(() => undefined);
  kit.check(
    "(b) a stages.md that is the former code template goes at the hub's start, and the project reads the template",
    planted.source === "file" &&
      !allows(planted, "ready", "done", "session") &&
      dropped !== undefined &&
      allows(dropped, "ready", "done", "session"),
    `planted ${planted.source}, after ${dropped?.source ?? "still a file"}`
  );
  kit.check(
    "(b) the rename is still there after the hub's start",
    (await projectOf(project.id))?.name === NEW_NAME
  );

  // (c) review off: a session closes a task.
  await fleet.agentUp();
  const session = await fleet.spawn("claude", "Review probe", fleet.repo, {
    projectId: project.id,
  });
  let sent = 0;
  const call = async (input: object): Promise<string> => {
    sent += 1;
    const marker = String(sent);
    asks.set(marker, { name: UPDATE, input });
    await fleet.send(session, `PROBE-CALL:${marker}`);
    return await until(
      `task_update ${marker}`,
      () => answered.get(marker),
      Boolean,
      180_000
    );
  };
  const task = (title: string) =>
    fleet.api<{ id: string }>(`/api/projects/${project.id}/tasks`, { title });
  const first = await task("Closed by a session");
  const closed = await call({
    id: first.id,
    stage: "done",
    reason: "landed in a1b2c3d",
  });
  const firstStage = await stageOf(project.id, first.id);
  kit.check(
    "(c) review off: a session moves a task from ready to done",
    firstStage === "done",
    `stage ${firstStage}; the tool said ${closed.slice(0, 300)}`
  );

  // (d) review on.
  const on = await patch(project.id, { review: true });
  const ruled = await stagesOf(project.id);
  const done = ruled.stages.find((stage) => stage.kind === "done");
  kit.check(
    "(d) Review before done on: the hub keeps it and its stages put by: you on done",
    on.status === 200 &&
      (await projectOf(project.id))?.review === true &&
      done?.hooks.by === "you",
    `PATCH ${on.status} ${on.text.slice(0, 200)}; done hooks ${JSON.stringify(done?.hooks)}`
  );
  const second = await task("Waits for review");
  const refused = await call({
    id: second.id,
    stage: "done",
    reason: "landed",
  });
  const held = await stageOf(project.id, second.id);
  kit.check(
    "(d) the session's ready → done is refused, and the task stays in ready",
    held === "ready" && refused.includes("only you moves a task to done"),
    `stage ${held}; the tool said ${refused.slice(0, 300)}`
  );
  await call({ id: second.id, stage: "review", reason: "ready for a look" });
  const inReview = await stageOf(project.id, second.id);
  const again = await call({ id: second.id, stage: "done", reason: "landed" });
  const stillReview = await stageOf(project.id, second.id);
  kit.check(
    "(d) the session moves it to review, and its review → done is refused",
    inReview === "review" &&
      stillReview === "review" &&
      again.includes("only you moves a task to done"),
    `after review ${inReview}, after done ${stillReview}; the tool said ${again.slice(0, 300)}`
  );
  const yours = await fleet.api<{ stage: string }>(
    `/api/projects/${project.id}/tasks/${second.id}/stage`,
    { stage: "done", reason: "looked at it" }
  );
  kit.check(
    "(d) the owner's review → done goes",
    yours.stage === "done",
    `stage ${yours.stage}`
  );
};

const spec: Spec = { name: "project-review", run };
export default spec;

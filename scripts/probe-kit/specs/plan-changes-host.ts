/**
 * Who hears the person's change to a plan when the plan is not a plain
 * session's own (Projects spec §5.2 "The plan model", points 5 and 6; hub
 * plan-changes.ts `receiverOf`), on a scratch fleet (real hub, agent and
 * sessiond; Claude Code against the mock model) in a project of its own:
 *
 * (5) a main session plans, delegates one of its steps, and its delegate
 *     plans and keeps working. A reword of the main plan's step reaches the
 *     main session, started about 3 s after it; a reword of the delegate's
 *     own plan reaches the main session too, naming its delegate; the
 *     delegate hears neither.
 * (6) a task's attempt plans and keeps working. A reword of its plan reaches
 *     the project's Caw, naming the task, and the attempt hears nothing.
 *
 * Delegates and attempts cut workspaces, and Caw runs in his place's
 * boundary: it runs on the host, outside every boundary.
 *
 *   bun scripts/probe-kit/run.ts plan-changes-host
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const TODO = "mcp__cawco__todo_write";
const DELEGATE = "mcp__cawco__delegate";
const MAIN = "PROBE-PCH-MAIN";
const LEAF = "PROBE-PCH-LEAF";
const TASK = "PROBE-PCH-TASK carry the colour";
/** Only an attempt's brief opens this way (dispatch.ts). */
const BRIEF = "Your work item is an attempt at";
const STAGES =
  "---\nready      todo\nworking    active\nreview     you\ndone       done\ndropped    dropped\nmoves\n  * → *    you, session\nviews\n  board      by stage\n---\n";

type Who = "main" | "leaf" | "attempt" | "caw";

interface Heard {
  all: string;
  at: number;
  last: string;
}

const heard = new Map<Who, Heard[]>();
const planned = new Set<Who>();
let delegated = false;

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const call = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** A tool as Claude Code offers it: loaded, or behind ToolSearch first. */
const found = (request: Seen, name: string, input: object): Reply =>
  request.toolNames.includes(name)
    ? call(name, input)
    : call("ToolSearch", { query: `select:${name}`, max_results: 1 });

/** Whose conversation a request is. */
const whoOf = (request: Seen): Who | undefined => {
  if (request.all.includes(BRIEF)) {
    return "attempt";
  }
  if (request.all.includes(LEAF)) {
    return "leaf";
  }
  if (request.all.includes(MAIN)) {
    return "main";
  }
  return request.all.includes("The person changed the plan of")
    ? "caw"
    : undefined;
};

const steps = (who: Who) => [
  { id: `${who}-1`, content: `${who}: read the card`, status: "in_progress" },
  { id: `${who}-2`, content: `${who}: carry the colour`, status: "pending" },
];

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  const who = whoOf(request);
  if (!who) {
    return text("ok");
  }
  heard.set(who, [
    ...(heard.get(who) ?? []),
    { at: Date.now(), all: request.all, last: request.last },
  ]);
  if (who === "caw") {
    return text("Noted.");
  }
  if (!planned.has(who)) {
    const reply = found(request, TODO, { steps: steps(who) });
    if (reply.tool?.name === TODO) {
      planned.add(who);
    }
    return reply;
  }
  if (who === "main" && !delegated) {
    const reply = found(request, DELEGATE, {
      title: "Colour leaf",
      prompt: `${LEAF}: carry the colour step, then keep working.`,
      lands: "none",
    });
    if (reply.tool?.name === DELEGATE) {
      delegated = true;
    }
    return reply;
  }
  // The delegate and the attempt keep working: each turn ends, and they
  // stay idle with their items live.
  return text("Working on it.");
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
    name: "Plan changes",
    machineId: MACHINE,
    cwd: repo,
  });
  await fetch(`${fleet.base}/api/projects/${project.id}/folder/file`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "stages.md", content: STAGES }),
  });
  const edit = async (id: string, body: object) => {
    const answer = await fetch(`${fleet.base}/api/instances/${id}/plan/edits`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return `${answer.status} ${(await answer.text()).slice(0, 160)}`;
  };
  const since = (who: Who, at: number) =>
    (heard.get(who) ?? []).filter((one) => one.at >= at);
  const heardWords = (who: Who, at: number, words: string) =>
    since(who, at).some((one) => one.all.includes(words));

  // (5) A main session and its delegate.
  const main = await fleet.spawn("claude", "Main", repo, {
    projectId: project.id,
  });
  await fleet.send(main, `${MAIN}: plan, then delegate the colour step.`);
  const leaf = await until(
    "(5) the delegate plans",
    () =>
      fleet.query<{ id: string }>(
        "SELECT id FROM instances WHERE parent_instance_id = ? ORDER BY rowid DESC",
        main
      )[0]?.id,
    (id) => !!id && planned.has("leaf"),
    300_000
  ).catch(() => undefined);
  kit.check(
    "(5) the main session delegated, and its delegate planned",
    !!leaf,
    String(leaf)
  );
  if (leaf) {
    await Bun.sleep(4000);
    const at = Date.now();
    const mainWords = "main: carry the colour, amber first";
    const mainEdit = await edit(main, {
      kind: "reword",
      step: "main-2",
      content: mainWords,
    });
    const leafWords = "leaf: read the card twice";
    const leafEdit = await edit(leaf, {
      kind: "reword",
      step: "leaf-1",
      content: leafWords,
    });
    await Bun.sleep(9000);
    kit.check(
      "(5) a change to the main plan's step reaches the main session",
      heardWords("main", at, `to: “${mainWords}”`),
      mainEdit
    );
    kit.check(
      "(5) a change to the delegate's own plan reaches the main session, naming its delegate",
      since("main", at).some(
        (one) =>
          one.all.includes(`to: “${leafWords}”`) &&
          one.all.includes("your delegate")
      ),
      leafEdit
    );
    kit.check(
      "(5) the delegate hears neither change",
      !(heardWords("leaf", at, mainWords) || heardWords("leaf", at, leafWords)),
      `${since("leaf", at).length} request(s) of the delegate since`
    );
  }

  // (6) A task's attempt: its plan answers to Caw.
  const task = await fleet.api<{ id: string }>(
    `/api/projects/${project.id}/tasks`,
    { title: TASK, stage: "ready" }
  );
  await fleet.api(`/api/projects/${project.id}/tasks/${task.id}/attempts`, {
    parentInstanceId: main,
  });
  const attempt = await until(
    "(6) the attempt plans",
    () =>
      fleet.query<{ instance_id: string }>(
        "SELECT instance_id FROM work_items WHERE task_id = ? ORDER BY created_at DESC",
        task.id
      )[0]?.instance_id,
    (id) => !!id && planned.has("attempt"),
    300_000
  ).catch(() => undefined);
  kit.check("(6) the task's attempt planned", !!attempt, String(attempt));
  if (attempt) {
    await Bun.sleep(4000);
    const at = Date.now();
    const words = "attempt: carry the colour behind a flag";
    const said = await edit(attempt, {
      kind: "reword",
      step: "attempt-2",
      content: words,
    });
    const caw = await until(
      "(6) Caw hears the change",
      () =>
        since("caw", at).find(
          (one) =>
            one.all.includes(`to: “${words}”`) && one.all.includes(task.id)
        ),
      (one) => one !== undefined,
      180_000
    ).catch(() => undefined);
    kit.check(
      "(6) a change to a task attempt's plan reaches the project's Caw, naming the task",
      caw !== undefined,
      said
    );
    kit.check(
      "(6) the attempt hears nothing of it",
      !heardWords("attempt", at, words),
      `${since("attempt", at).length} request(s) of the attempt since`
    );
  }
};

export default {
  name: "plan-changes-host",
  host: "it delegates and starts a task's attempt, so its fleet cuts workspaces, and Caw runs in his place's boundary",
  run,
} satisfies Spec;

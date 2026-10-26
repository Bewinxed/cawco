/**
 * Task links (Option B on the decision page task-linking): one blocking edge
 * whose target can be a task or a decision card, parts that inherit their
 * whole's waits, coordinators, duplicates and closes, read through the one
 * resolver (hub task-waits.ts). On a scratch fleet (real hub, agent and
 * sessiond; Claude Code against the mock model), a session in a project
 * calls the task tools through the hub's REST door, and the board's own
 * read (`GET /api/projects/:id/tasks`, what the dashboard draws) is held to
 * what each answer says.
 *
 * 1. Task A; a decision page with a card; task B, waiting on A and the
 *    card; whole P with parts C and D.
 * 2. B is not ready until A is done and the card is picked.
 * 3. A cycle is refused with its path.
 * 4. A duplicate moves its waits to the survivor.
 * 5. C inherits P's wait.
 * 6. A coordinator's live attempt at P holds C and D from the hub's
 *    dispatch (the attempt is written as the hub records one; starting a
 *    real coordinator delegates, which only the host does).
 * 7. A whole nobody coordinates closes on its last part.
 * 8. A reopened card blocks a to-do dependent again, and a card answered
 *    differently flags a done one; the same answer again clears it.
 * 9. A wait on GitHub: a project with no GitHub connection is refused one
 *    where it is written; with one, the read its poll makes (hub github.ts
 *    `readGitHubWait`, here against a stand-in of GitHub's REST API on the
 *    loopback) settles a merged pull request and a green run, and flags a
 *    pull request closed unmerged and a red run.
 *
 *   bun scripts/probe-kit/run.ts task-links
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { WebsocketProvider } from "y-websocket";
import { Doc } from "yjs";
import { githubTarget } from "../../../packages/core/src/wait-targets";
import { taskLinkWords } from "../../../packages/core/src/words/task-links";
import { readGitHubWait } from "../../../packages/hub/src/github";
import { settled, type WaitWorld } from "../../../packages/hub/src/task-waits";
import { toolWords } from "../../lib/tool-call";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const respond = (request: Seen): Reply => ({
  everyMs: 5,
  words: [request.tools ? "ok" : "Links probe"],
});

/** One question, its options. */
const PROGRAM = `root = Decisions("Shape the tray", [head])
head = Decision("head", "Which tray head?", [compact, roomy], "Compact fits the phone.")
compact = Option("compact", "Compact", "One line.", true, [], "Less room for counts.")
roomy = Option("roomy", "Roomy", "Two lines.", false, [], "Taller on the phone.")`;

interface Wait {
  flag: string | null;
  kind: string;
  settled: boolean;
  state: string;
  target: string;
  via: string | null;
}

interface Row {
  builtOn: { since: string; target: string }[];
  heldBy: string | null;
  id: string;
  kind: string | null;
  parts: string[];
  ready: boolean;
  unblocks: string[];
  waits: Wait[];
}

const ONE_ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const TASK_ID = /cawco:task\/[^/]+\/(tsk-\d+)\)/;

const standUp = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const cwd = join(fleet.workdir, "links-probe");
  await mkdir(cwd, { recursive: true });
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Links probe",
    machineId: MACHINE,
    cwd,
    caw: false,
  });
  const id = await fleet.spawn("claude", "Tray planner", cwd, {
    projectId: project.id,
  });
  const credential = await fleet.sessionCredential(id);
  /** One tool call as the session, through the hub's REST door: its words. */
  const tool = async (name: string, args: Record<string, unknown>) =>
    await toolWords({ base: fleet.base, id, credential }, name, args);
  /** The board as the dashboard reads it, by task id. */
  const board = async (): Promise<Map<string, Row>> => {
    const list = await fleet.api<{ tasks: Row[] }>(
      `/api/projects/${project.id}/tasks`
    );
    return new Map(list.tasks.map((row) => [row.id, row]));
  };
  const stages = await fleet.api<{
    stages: { kind: string; name: string }[];
  }>(`/api/projects/${project.id}/stages`);
  const stageOf = (kind: string): string =>
    stages.stages.find((stage) => stage.kind === kind)?.name ?? kind;
  /** Moves a task as you, at the dashboard. */
  const move = (task: string, kind: string) =>
    fleet.api(`/api/projects/${project.id}/tasks/${task}/stage`, {
      stage: stageOf(kind),
    });
  return { fleet, project, id, tool, board, move };
};

type Probe = Awaited<ReturnType<typeof standUp>>;

/** A task filed through task_create: its id, read from its link. */
const file = async (
  probe: Probe,
  args: Record<string, unknown>
): Promise<{ id: string; text: string }> => {
  const said = await probe.tool("task_create", args);
  return { id: TASK_ID.exec(said.text)?.[1] ?? "", text: said.text };
};

/** The page's card's pick, written into its doc as the page writes one; null takes it out. */
const pick = async (
  probe: Probe,
  artifact: string,
  options: string[] | null
): Promise<void> => {
  const doc = new Doc();
  const url = `${probe.fleet.base.replace("http", "ws")}/ws/artifact/${encodeURIComponent(probe.id)}`;
  const provider = new WebsocketProvider(url, artifact, doc, {
    WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
  });
  await until("the page's doc synced", () => provider.synced, Boolean, 15_000);
  // A pick names the page it was made on: the hub keeps only one that does.
  const record = await probe.tool("artifact_read", {
    id: artifact,
    response_format: "detailed",
  });
  const { pageHash = "" } = JSON.parse(record.text) as { pageHash?: string };
  doc.transact(() => {
    const state = doc.getMap("state");
    if (options === null) {
      state.delete("head");
    } else {
      state.set("head", {
        options,
        note: null,
        value: null,
        pageHash,
        at: new Date().toISOString(),
      });
    }
  });
  // The hub keeps what it is sent, then the page's waits look again (1 s).
  await Bun.sleep(2500);
  provider.destroy();
  doc.destroy();
};

/** A work item at `task`, written as the hub records an attempt; its session the planner's when `session` says so. */
const attempt = (
  probe: Probe,
  task: string,
  state: "running" | "done",
  waitedOn: { target: string; value: string }[] = [],
  session: string = crypto.randomUUID()
): void => {
  const item = crypto.randomUUID();
  const now = Date.now();
  probe.fleet.write(
    "INSERT INTO work_items (id, workspace_id, parent_instance_id, instance_id, brief, title, project_id, task_id, harness, model, state, waited_on, created_at, ended_at) VALUES (?, ?, ?, ?, 'brief', 'attempt', ?, ?, 'claude', 'claude-opus-5-5', ?, ?, ?, ?)",
    item,
    crypto.randomUUID(),
    probe.id,
    session,
    probe.project.id,
    task,
    state,
    JSON.stringify(waitedOn),
    now,
    state === "done" ? now : null
  );
};

const PULL_PATH = /\/repos\/probe\/repo\/pulls\/(\d+)$/;
const RUN_PATH = /\/repos\/probe\/repo\/actions\/runs\/(\d+)$/;

/** The hub's words to a session about its task's waits (tasks.ts `tell`), oldest first. */
const toldTo = (probe: Probe, session: string): string[] =>
  probe.fleet
    .query<{ body: string }>(
      "SELECT body FROM sent_messages WHERE instance_id = ? AND json_extract(body, '$.origin.name') = 'task-waits' ORDER BY accepted_at",
      session
    )
    .map((row) => row.body);

/** GitHub's REST API for one repository's pulls and runs, each in the state `states` names, on the loopback. */
const githubStandIn = (
  pulls: Record<number, { merged: boolean; state: string }>,
  runs: Record<number, { conclusion: string | null; status: string }>
) =>
  Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      const pull = PULL_PATH.exec(path);
      const run = RUN_PATH.exec(path);
      const one = pull ? pulls[Number(pull[1])] : undefined;
      if (pull && one) {
        return Response.json({ ...one, title: `Pull ${pull[1]}` });
      }
      const ran = run ? runs[Number(run[1])] : undefined;
      if (run && ran) {
        return Response.json({ ...ran, name: "CI" });
      }
      return new Response("Not Found", { status: 404 });
    },
  });

/** 9b: each pull request and run read through the stand-in, then settled by the one resolver. */
const githubWaits = async (kit: Kit): Promise<void> => {
  const server = githubStandIn(
    {
      1: { merged: true, state: "closed" },
      2: { merged: false, state: "closed" },
      3: { merged: false, state: "open" },
    },
    {
      7: { status: "completed", conclusion: "success" },
      8: { status: "completed", conclusion: "failure" },
      9: { status: "in_progress", conclusion: null },
    }
  );
  try {
    const { Octokit } = (await import(
      Bun.resolveSync(
        "@octokit/rest",
        join(import.meta.dir, "../../../packages/hub/src")
      )
    )) as {
      Octokit: new (
        options: Record<string, unknown>
      ) => Parameters<typeof readGitHubWait>[0];
    };
    const octokit = new Octokit({
      auth: "probe-token",
      baseUrl: `http://127.0.0.1:${server.port}`,
      userAgent: "CawCo-hub",
    });
    const of = async (url: string) => {
      const target = githubTarget(url);
      if (!target) {
        throw new Error(`${url} is no GitHub wait`);
      }
      const read = await readGitHubWait(octokit, target);
      const world: WaitWorld = {
        projectId: "probe",
        card: () => undefined,
        pin: () => undefined,
        gone: () => false,
        session: () => undefined,
        task: () => undefined,
        github: () => read ?? { state: "checking", title: null },
      };
      return settled(target, world);
    };
    const base = "https://github.com/probe/repo";
    const merged = await of(`${base}/pull/1`);
    const closed = await of(`${base}/pull/2`);
    const open = await of(`${base}/pull/3`);
    const green = await of(`${base}/actions/runs/7`);
    const red = await of(`${base}/actions/runs/8`);
    const running = await of(`${base}/actions/runs/9`);
    kit.check(
      "9: a merged pull request settles its wait",
      merged.settled &&
        merged.state === "merged" &&
        merged.label === "PR #1 Pull 1",
      JSON.stringify(merged)
    );
    kit.check(
      "9: a pull request closed unmerged flags its wait, still unsettled",
      !closed.settled && closed.flag === taskLinkWords.closedUnmerged,
      JSON.stringify(closed)
    );
    kit.check(
      "9: an open pull request holds its wait",
      !(open.settled || open.flag) && open.state === "open",
      JSON.stringify(open)
    );
    kit.check(
      "9: a green run settles its wait, a red one flags it, a running one holds it",
      green.settled &&
        !red.settled &&
        red.flag === taskLinkWords.runFailed &&
        !running.settled &&
        running.state === "running",
      JSON.stringify([green, red, running].map((one) => one.state))
    );
  } finally {
    server.stop(true);
  }
};

const run = async (kit: Kit) => {
  const probe = await standUp(kit);
  const { tool, board, move } = probe;

  // 1. A; a page with a card; B waiting on both; P with parts C and D.
  const page = await tool("artifact_create", {
    kind: "page",
    does: "pick",
    ask: "Pick the tray head",
    name: "tray",
    program: PROGRAM,
    response_format: "detailed",
  });
  const artifact = ONE_ID.exec(page.text)?.[0] ?? "";
  const card = `${artifact}#head`;
  const a = await file(probe, { title: "Build the tray store" });
  const b = await file(probe, {
    title: "Wire the tray badges",
    waits_on: [a.id, "tray#head"],
  });
  kit.check(
    "1: task_create answers in three lines at most, its waits first unsettled",
    b.text.split("\n").length <= 3 &&
      b.text.includes(taskLinkWords.waitsOn) &&
      b.text.includes("Which tray head?") &&
      b.text.includes(taskLinkWords.ready(2)),
    b.text
  );
  const e = await file(probe, { title: "Pick the tray's shipping date" });
  const p = await file(probe, { title: "Tray", waits_on: [e.id] });
  const c = await file(probe, { title: "Tray chips", part_of: p.id });
  const d = await file(probe, { title: "Tray counts", part_of: p.id });
  kit.check(
    "1: a part's filing names its whole",
    c.text.includes("part of [Tray]"),
    c.text
  );

  // 2. B waits on A and the card.
  let now = await board();
  const waits = (id: string) => now.get(id)?.waits ?? [];
  kit.check(
    "2: the board shows B waiting on A and the card, not ready",
    now.get(b.id)?.ready === false &&
      waits(b.id).length === 2 &&
      waits(b.id).every((wait) => !wait.settled) &&
      waits(b.id).some((wait) => wait.target === card),
    JSON.stringify(waits(b.id))
  );
  kit.check(
    "2: the board shows A unblocks B",
    now.get(a.id)?.unblocks.includes(b.id) === true,
    JSON.stringify(now.get(a.id)?.unblocks)
  );
  // A live attempt whose task waits on A, its session the planner's.
  const h = await file(probe, {
    title: "Count the tray badges",
    waits_on: [a.id],
  });
  attempt(probe, h.id, "running", [], probe.id);
  await move(a.id, "done");
  await Bun.sleep(1000);
  kit.check(
    "2: A's close tells the live session whose task waited on it, once",
    toldTo(probe, probe.id).filter(
      (body) =>
        body.includes("Build the tray store") &&
        body.includes("Count the tray badges")
    ).length === 1,
    JSON.stringify(toldTo(probe, probe.id))
  );
  now = await board();
  kit.check(
    "2: with A done and the card open, B is still not ready",
    now.get(b.id)?.ready === false &&
      waits(b.id).find((wait) => wait.target === card)?.state === "open",
    JSON.stringify(waits(b.id))
  );
  await pick(probe, artifact, ["compact"]);
  now = await board();
  kit.check(
    "2: with A done and the card picked, B is ready",
    now.get(b.id)?.ready === true,
    JSON.stringify(waits(b.id))
  );
  const read = await tool("task_read", { id: b.id });
  kit.check(
    "2: task_read carries the Waits on line, each with its state",
    read.text.includes(taskLinkWords.waitsOn) &&
      read.text.includes(", picked") &&
      read.text.includes(", done"),
    read.text.split("\n").slice(0, 4).join(" | ")
  );

  // 3. A cycle is refused with its path.
  const cycle = await tool("task_link", { task: a.id, waits_on: [b.id] });
  kit.check(
    "3: a cycle is refused, naming its path, nothing changed",
    cycle.refused &&
      cycle.text.includes("Refused: [Build the tray store]") &&
      cycle.text.includes("→ [Wire the tray badges]") &&
      cycle.text.includes(taskLinkWords.cycleEnd),
    cycle.text
  );

  // 4. A duplicate moves its waits to the survivor.
  const x = await file(probe, { title: "Tray chip clipping" });
  const w = await file(probe, {
    title: "Tray badge colours",
    waits_on: [x.id],
  });
  const dup = await tool("task_link", { task: x.id, duplicate_of: c.id });
  now = await board();
  kit.check(
    "4: duplicate_of closes it and names the wait it moved",
    dup.text.includes("closed as a duplicate of [Tray chips]") &&
      dup.text.includes("1 wait moved to it: [Tray badge colours]"),
    dup.text
  );
  kit.check(
    "4: the waiter now waits on the survivor, not the duplicate",
    waits(w.id).some((wait) => wait.target === c.id) &&
      !waits(w.id).some((wait) => wait.target === x.id),
    JSON.stringify(waits(w.id))
  );

  // 5. C inherits P's wait.
  kit.check(
    "5: C inherits P's wait on E, through P, and is not ready",
    waits(c.id).some((wait) => wait.target === e.id && wait.via === p.id) &&
      now.get(c.id)?.ready === false,
    JSON.stringify(waits(c.id))
  );
  const readC = await tool("task_read", { id: c.id });
  kit.check(
    "5: task_read says the inherited wait comes through the whole",
    readC.text.includes("(through [Tray]"),
    readC.text.split("\n").slice(0, 4).join(" | ")
  );

  // 6. A coordinator's live attempt at P holds C and D.
  await move(e.id, "done");
  now = await board();
  kit.check(
    "6: with P's wait settled and no coordinator, C and D are ready",
    now.get(c.id)?.ready === true && now.get(d.id)?.ready === true,
    JSON.stringify([now.get(c.id), now.get(d.id)].map((row) => row?.ready))
  );
  attempt(probe, p.id, "running");
  now = await board();
  kit.check(
    "6: a live coordinator at P holds C and D from the hub's dispatch",
    now.get(c.id)?.heldBy === p.id &&
      now.get(d.id)?.heldBy === p.id &&
      now.get(c.id)?.ready === false &&
      now.get(d.id)?.ready === false,
    JSON.stringify([now.get(c.id)?.heldBy, now.get(d.id)?.heldBy])
  );
  const dispatch = await probe.fleet.api<{ frontier: string[] }>(
    `/api/projects/${probe.project.id}/dispatch`
  );
  kit.check(
    "6: the dispatcher's frontier holds neither part, nor the whole",
    !(
      dispatch.frontier.includes(c.id) ||
      dispatch.frontier.includes(d.id) ||
      dispatch.frontier.includes(p.id)
    ),
    JSON.stringify(dispatch.frontier)
  );

  // 7. A whole nobody coordinates closes on its last part.
  const q = await file(probe, { title: "Tray empty state" });
  const r = await file(probe, { title: "Tray empty copy", part_of: q.id });
  const s = await file(probe, { title: "Tray empty art", part_of: q.id });
  await move(r.id, "done");
  now = await board();
  kit.check(
    "7: one part done leaves the whole open",
    now.get(q.id)?.kind !== "done",
    String(now.get(q.id)?.kind)
  );
  await move(s.id, "done");
  await Bun.sleep(1000);
  now = await board();
  kit.check(
    "7: its last part done closes the whole nobody coordinates",
    now.get(q.id)?.kind === "done",
    String(now.get(q.id)?.kind)
  );

  // 8. A reopened card blocks a to-do dependent; a card answered
  //    differently flags a done one; the same answer clears it.
  const done = await file(probe, {
    title: "Ship the compact tray",
    waits_on: ["tray#head"],
  });
  attempt(probe, done.id, "done", [{ target: card, value: "compact" }]);
  await move(done.id, "done");
  // A live attempt started on the card picked "compact", its session the planner's.
  const g = await file(probe, {
    title: "Draw the compact tray",
    waits_on: ["tray#head"],
  });
  attempt(
    probe,
    g.id,
    "running",
    [{ target: card, value: "compact" }],
    probe.id
  );
  const toldBefore = toldTo(probe, probe.id).length;
  await pick(probe, artifact, null);
  now = await board();
  kit.check(
    "8: a reopened card blocks its to-do dependent again",
    now.get(b.id)?.ready === false &&
      waits(b.id).find((wait) => wait.target === card)?.state === "open",
    JSON.stringify(waits(b.id))
  );
  await pick(probe, artifact, ["roomy"]);
  now = await board();
  kit.check(
    "8: a card answered differently flags the done task built on it",
    now
      .get(done.id)
      ?.builtOn.some(
        (one) =>
          one.target === card && one.since === taskLinkWords.decidedDifferently
      ) === true,
    JSON.stringify(now.get(done.id)?.builtOn)
  );
  const readDone = await tool("task_read", { id: done.id });
  kit.check(
    "8: task_read says the done task was built on the card that moved",
    readDone.text.includes("Built on [Which tray head?]") &&
      readDone.text.includes(`${taskLinkWords.decidedDifferently} since`),
    readDone.text.split("\n").slice(0, 5).join(" | ")
  );
  await pick(probe, artifact, ["compact"]);
  now = await board();
  kit.check(
    "8: the same answer again clears the flag",
    now.get(done.id)?.builtOn.length === 0,
    JSON.stringify(now.get(done.id)?.builtOn)
  );
  const moved = toldTo(probe, probe.id).slice(toldBefore);
  kit.check(
    "8: the live attempt hears once that its card was reopened, once that it was answered differently, and nothing for the same answer again",
    moved.length === 2 &&
      moved[0]?.includes(taskLinkWords.wasReopened) === true &&
      moved[1]?.includes(taskLinkWords.wasAnsweredDifferently) === true,
    JSON.stringify(moved)
  );

  // 9. A wait on GitHub.
  const pr = await tool("task_link", {
    task: done.id,
    waits_on: ["https://github.com/probe/repo/pull/418"],
  });
  kit.check(
    "9: a project with no GitHub connection is refused a pull request wait, saying why",
    pr.refused && pr.text.includes(taskLinkWords.noGitHub),
    pr.text
  );
  await githubWaits(kit);
};

export default { name: "task-links", run } satisfies Spec;

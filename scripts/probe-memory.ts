/**
 * Probe: a project's memory (Projects spec §5.4, D8) on a scratch fleet
 * (real hub, agent and sessiond on loopback, mock model). The invariant:
 * what a project's sessions learn reaches later sessions only through tiers
 * the person controls. One run each:
 *
 * (d) "Make a note" (the route, and a Caw thread message) writes AGENTS.md
 *     directly, as the person's commit, waking no model.
 * (b) A note from a routine run is tainted: Caw woken by a lead routine, and
 *     a delegate routine's run. The curator never proposes either.
 * (c) Proposals are the person's asks with their diff: Caw's (Approve
 *     commits AGENTS.md as the person, Deny archives the cited note), then
 *     the curator run's, citing the notes it read.
 * (a) A delegate's memory_note lands in memory/inbox as a commit by it.
 * (e) An attempt's brief carries the knowledge file its task names.
 * Besides: a note written in a turn that reached a URL is tainted `web`.
 *
 * (a), (e), the delegate routine's run and the curator's run are work items:
 * each runs in a workspace boundary, which needs unprivileged user
 * namespaces. Inside a workspace (a delegate's own) those are refused, and
 * those sections fail with the boundary's words; run it from a host shell.
 *
 * Run from the repo root:
 *   CAWCO_NO_MDNS=1 bun scripts/probe-memory.ts [--keep]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  MACHINE,
  type Reply,
  type Seen,
  scratchFleet,
  until,
} from "./scratch-fleet";

const keep = process.argv.includes("--keep");
const NOTE = "mcp__cawco__memory_note";
const PROPOSE = "mcp__cawco__memory_propose";
const FINISH = "mcp__cawco__finish_item";

const ATTEMPT_NOTE = "Deploys go out with `bun run ship` from main.";
const WORKER_NOTE = "Commits follow Conventional Commits.";
const SECOND_NOTE = "The API answers in UTC, always.";
const WEB_NOTE = "The status page lives at status.example.test.";
const ROUTINE_NOTE = "The staging database is reset every night.";
const LEAD_NOTE = "Mornings are quiet on the board.";
/** Each session's opening marker: the earliest in its conversation says which it is. */
const MARKERS = [
  "PROBE-MEMORY-ATTEMPT",
  "PROBE-MEMORY-ROUTINE",
  "PROBE-MEMORY-WORKER",
  "PROBE-MEMORY-SECOND",
  "PROBE-MEMORY-WEB",
] as const;
const CURATOR = "You are this project's memory curator";
const CAW = "You are Caw, the lead of the project";
const NOTE_ID = /^(n-\d{8}-\d{6}-[0-9a-f]{6})/;
const CAW_ASK = /PROBE-MEMORY-CAW-PROPOSE (n-\d{8}-\d{6}-[0-9a-f]{6})/;
const OUTCOME = /outcome: (.*)/;
/** The hub's log lines a failure prints. */
const LOGGED = /memory|routines|caw|boundary|error/i;

const results: Record<string, string> = {};
let failed = false;
const check = (name: string, ok: boolean, detail: string) => {
  failed ||= !ok;
  results[name] = `${ok ? "PASS" : "FAIL"} — ${detail}`;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
};
const section = async (name: string, body: () => Promise<void>) => {
  try {
    await body();
  } catch (error) {
    check(name, false, error instanceof Error ? error.message : String(error));
  }
};

const tool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});
const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

/** A session that must call `name`: loads it with ToolSearch first when it is deferred. */
const call = (request: Seen, name: string, input: object): Reply => {
  if (request.toolNames.includes(name)) {
    return tool(name, input);
  }
  return request.toolNames.includes("ToolSearch")
    ? tool("ToolSearch", { query: `select:${name}`, max_results: 1 })
    : text(`${name} is not offered`);
};

const kindOf = (all: string): (typeof MARKERS)[number] | undefined =>
  MARKERS.map((marker) => ({ marker, at: all.indexOf(marker) }))
    .filter(({ at }) => at >= 0)
    .sort((a, b) => a.at - b.at)[0]?.marker;

/** Whether the session's memory_note answered already. */
const noted = (all: string): boolean => all.includes('"taint":');
const finished = (request: Seen): boolean =>
  request.last.includes("checks passed") || request.last.includes("The item");
/** The text between two markers of a message, trimmed. */
const between = (all: string, from: string, to: string): string =>
  all.split(from)[1]?.split(to)[0]?.trim() ?? "";

/** Caw: a note when a routine wakes him; two proposals when the person asks. */
const caw = (request: Seen): Reply => {
  const { all } = request;
  if (all.includes("PROBE-MEMORY-LEAD") && !noted(all)) {
    return call(request, NOTE, { text: LEAD_NOTE });
  }
  const asked = CAW_ASK.exec(all);
  if (asked && !all.includes('"path":"AGENTS.md"')) {
    const agents = between(all, "---AGENTS---", "---END---");
    return call(request, PROPOSE, {
      path: "AGENTS.md",
      content: `${agents}\n\n## About\n\n- The Memory project ships a small service.\n`,
      why: "What the project is",
    });
  }
  if (asked && !all.includes('"path":"knowledge/caw.md"')) {
    return call(request, PROPOSE, {
      path: "knowledge/caw.md",
      content: `# Commits\n\n- ${WORKER_NOTE}\n`,
      notes: [asked[1]],
      why: "The commit convention",
    });
  }
  return text("ok");
};

/** The curator: AGENTS.md from the attempt's note, knowledge/ from the second worker's, then finish. */
const curator = (request: Seen): Reply => {
  const { all } = request;
  const ids = new Map<string, string>();
  for (const part of all.split("### ")) {
    const id = NOTE_ID.exec(part)?.[1];
    if (id && part.includes(ATTEMPT_NOTE)) {
      ids.set("attempt", id);
    } else if (id && part.includes(SECOND_NOTE)) {
      ids.set("second", id);
    }
  }
  if (!all.includes('"path":"AGENTS.md"')) {
    const agents = between(
      all,
      "## AGENTS.md as it stands",
      "## knowledge/ as it stands"
    );
    return call(request, PROPOSE, {
      path: "AGENTS.md",
      content: `${agents}\n\n## Deploys\n\n- ${ATTEMPT_NOTE}\n`,
      notes: [ids.get("attempt") ?? "missing"],
      why: "How deploys go out",
    });
  }
  if (!all.includes('"path":"knowledge/time.md"')) {
    return call(request, PROPOSE, {
      path: "knowledge/time.md",
      content: `# Time\n\n- ${SECOND_NOTE}\n`,
      notes: [ids.get("second") ?? "missing"],
      why: "How the API tells time",
    });
  }
  if (finished(request)) {
    return text("done");
  }
  return call(request, FINISH, {
    summary: "Proposed AGENTS.md and knowledge/time.md.",
  });
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  const { all } = request;
  if (all.includes(CURATOR)) {
    return curator(request);
  }
  if (all.includes(CAW)) {
    return caw(request);
  }
  const kind = kindOf(all);
  if (kind === "PROBE-MEMORY-ATTEMPT" || kind === "PROBE-MEMORY-ROUTINE") {
    const routine = kind === "PROBE-MEMORY-ROUTINE";
    if (!noted(all)) {
      return call(request, NOTE, {
        text: routine ? ROUTINE_NOTE : ATTEMPT_NOTE,
      });
    }
    return finished(request)
      ? text("done")
      : call(request, FINISH, { summary: routine ? "NO_REPLY" : "noted" });
  }
  if (kind === "PROBE-MEMORY-WEB" && !all.includes("WEB-REACHED")) {
    return tool("Bash", {
      command: "curl -s -m 2 http://127.0.0.1:9/ ; echo WEB-REACHED",
      description: "Read a page",
    });
  }
  const words: Partial<Record<string, string>> = {
    "PROBE-MEMORY-WEB": WEB_NOTE,
    "PROBE-MEMORY-WORKER": WORKER_NOTE,
    "PROBE-MEMORY-SECOND": SECOND_NOTE,
  };
  const note = kind ? words[kind] : undefined;
  return note && !noted(all) ? call(request, NOTE, { text: note }) : text("ok");
};

interface Note {
  content: string;
  path: string;
}
interface Ask {
  instanceId: string;
  machineId: string;
  payload: {
    input: Record<string, unknown>;
    presentation?: {
      asker: string;
      changes: { added: number; after: string; path: string }[];
      detail?: string;
      summary: string;
    };
    toolName: string;
  };
  requestId: string;
}

const fleet = await scratchFleet({ name: "probe-memory", respond });
const home = fleet.env.HOME as string;

const http = async (method: string, path: string, body?: object) => {
  const response = await fetch(`${fleet.base}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, text: await response.text() };
};
const fileOf = (projectId: string, path: string) =>
  http(
    "GET",
    `/api/projects/${projectId}/folder/file?path=${encodeURIComponent(path)}`
  );
const wordsOf = async (projectId: string, path: string): Promise<string> => {
  const read = await fileOf(projectId, path);
  return read.status === 200
    ? (JSON.parse(read.text) as { content: string }).content
    : "";
};
const listing = async (projectId: string, path: string): Promise<string[]> => {
  const read = await http(
    "GET",
    `/api/projects/${projectId}/folder?path=${encodeURIComponent(path)}`
  );
  return read.status === 200
    ? (JSON.parse(read.text) as { entries: { path: string }[] }).entries.map(
        (entry) => entry.path
      )
    : [];
};
const history = async (projectId: string, path: string) =>
  (
    JSON.parse(
      (
        await http(
          "GET",
          `/api/projects/${projectId}/folder/history?path=${encodeURIComponent(path)}`
        )
      ).text
    ) as { commits: { author: string; message: string; sha: string }[] }
  ).commits;
const notesIn = async (projectId: string, dir: string): Promise<Note[]> =>
  Promise.all(
    (await listing(projectId, dir)).map(async (path) => ({
      path,
      content: await wordsOf(projectId, path),
    }))
  );
const noteWith = (notes: Note[], words: string) =>
  notes.find((note) => note.content.includes(words));
const idOf = (note: Note | undefined): string =>
  note?.path.split("/").at(-1)?.replace(".md", "") ?? "?";
const outcomeOf = (note: Note | undefined): string =>
  OUTCOME.exec(note?.content ?? "")?.[1] ?? "(none)";
const proposals = async (): Promise<Ask[]> =>
  (await fleet.api<Ask[]>("/api/pending")).filter(
    (ask) => ask.payload.toolName === PROPOSE
  );
/** The person's answer as the dashboard's card sends it: a `permission.answer` command naming the ask's own machine. */
const answer = (ask: Ask | undefined, result: object) =>
  fleet.post({
    type: "command",
    commandId: crypto.randomUUID(),
    kind: "permission.answer",
    machineId: ask?.machineId ?? "",
    sessionId: ask?.instanceId ?? "",
    payload: {
      instanceId: ask?.instanceId,
      requestId: ask?.requestId,
      method: "resolvePermission",
      args: [ask?.requestId, result],
    },
  });
interface RunRow {
  outcome: string | null;
  reason: string | null;
  state: string;
}
const runsOf = (routineId: string) =>
  fleet.query<RunRow>(
    "SELECT state, outcome, reason FROM routine_runs WHERE routine_id = ? ORDER BY started_at DESC",
    routineId
  );
const settled = (run: RunRow | undefined) =>
  run !== undefined && ["ended", "skipped"].includes(run.state);

try {
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  const src = join(fleet.sandbox, "src");
  await mkdir(src, { recursive: true });
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  await Bun.$`git init -q -b main && echo memory > README.md && git add -A && git commit -qm 'First commit'`
    .cwd(src)
    .env({ ...process.env, HOME: home })
    .quiet();
  const made = await fleet.api<{ id?: string; project?: { id: string } }>(
    "/api/projects",
    { name: "Memory", machineId: MACHINE, cwd: src, caw: false }
  );
  const projectId = made.project?.id ?? made.id ?? "";

  // ── (d) Make a note: the route, then a Caw thread message ──────────────
  await section("d: Make a note writes AGENTS.md directly", async () => {
    const routed = await http(
      "POST",
      `/api/projects/${projectId}/memory/notes`,
      {
        text: "Release notes are written in the present tense.",
      }
    );
    const threaded = await http("POST", `/api/projects/${projectId}/threads`, {
      body: "Make a note: Screenshots go in assets/screens.",
    });
    const agents = await wordsOf(projectId, "AGENTS.md");
    const commits = await history(projectId, "AGENTS.md");
    const thread = JSON.parse(threaded.text) as { thread: { id: string } };
    const said = await fleet.api<{
      messages: { author: string; noteTitle?: string }[];
    }>(`/api/projects/${projectId}/threads/${thread.thread.id}`);
    const leads = fleet.query<{ n: number }>(
      "SELECT count(*) AS n FROM instances WHERE role = 'lead'"
    )[0]?.n;
    check(
      "d: Make a note writes AGENTS.md directly, as the person, waking no model",
      routed.status === 200 &&
        threaded.status === 200 &&
        agents.includes(
          "## Notes\n\n- Release notes are written in the present tense.\n- Screenshots go in assets/screens."
        ) &&
        commits[0]?.author === "you" &&
        commits[1]?.author === "you" &&
        commits[0]?.message === "AGENTS.md: a note from you" &&
        said.messages.some(
          (message) => message.noteTitle === "AGENTS.md · noted"
        ) &&
        leads === 0,
      `route ${routed.status}, thread ${threaded.status}; AGENTS.md:\n${agents}\ncommits ${commits.map((c) => `${c.author}: ${c.message}`).join(" | ")}; thread ${said.messages.map((m) => m.noteTitle ?? m.author).join(", ")}; Caw sessions started: ${leads}`
    );
  });

  // The person's knowledge files.
  for (const [path, content] of [
    [
      "knowledge/deploy.md",
      "# Deploys\n\nKNOWLEDGE-DEPLOY: ship from main, never on Fridays.\n",
    ],
    [
      "knowledge/unrelated.md",
      "# Office\n\nKNOWLEDGE-UNRELATED: the plants are watered on Mondays.\n",
    ],
  ]) {
    // biome-ignore lint/performance/noAwaitInLoops: two files, in order
    const put = await http("PUT", `/api/projects/${projectId}/folder/file`, {
      path,
      content,
    });
    if (put.status !== 200) {
      throw new Error(`${path} was not written: ${put.status} ${put.text}`);
    }
  }

  // Sessions the person started in the project: two note facts, one reads a URL first.
  const worker = await fleet.spawn("claude", "Probe worker", src, {
    projectId,
  });
  await fleet.send(worker, "PROBE-MEMORY-WORKER: note the commit convention.");
  const second = await fleet.spawn("claude", "Probe second", src, {
    projectId,
  });
  await fleet.send(second, "PROBE-MEMORY-SECOND: note how the API tells time.");
  const webber = await fleet.spawn("claude", "Probe web reader", src, {
    projectId,
  });
  await fleet.send(
    webber,
    "PROBE-MEMORY-WEB: read the status page, then note where it is."
  );
  const inbox = () => notesIn(projectId, "memory/inbox");
  const workerNote = await until(
    "the worker's note",
    async () => noteWith(await inbox(), WORKER_NOTE),
    (found) => found !== undefined,
    180_000
  );
  const secondNote = await until(
    "the second worker's note",
    async () => noteWith(await inbox(), SECOND_NOTE),
    (found) => found !== undefined,
    180_000
  );
  const webNote = await until(
    "the web reader's note",
    async () => noteWith(await inbox(), WEB_NOTE),
    (found) => found !== undefined,
    180_000
  );
  check(
    "web: a session's note is untainted, one written after reaching a URL is tainted web",
    !workerNote?.content.includes("taint:") &&
      !!workerNote?.content.includes("source: session") &&
      !secondNote?.content.includes("taint:") &&
      !!webNote?.content.includes("taint: [web]"),
    `${workerNote?.content}\n${webNote?.content}`
  );

  // ── (b) Caw woken by a lead routine notes ──────────────────────────────
  await http("PATCH", `/api/projects/${projectId}/caw`, { on: true });
  const leadRoutine = await fleet.api<{ id: string }>("/api/routines", {
    projectId,
    name: "Morning look",
    cron: "0 0 1 1 *",
    timeZone: "UTC",
    target: "lead",
    prompt: "PROBE-MEMORY-LEAD: look at the board, and note what you learn.",
  });
  const leadNote = await until(
    "Caw's note in the run of a lead routine",
    async () => noteWith(await inbox(), LEAD_NOTE),
    (found) => found !== undefined,
    240_000
  );
  check(
    "b: a note Caw writes in a lead routine's run is tainted routine",
    !!leadNote?.content.includes("taint: [routine]") &&
      !!leadNote?.content.includes("source: lead") &&
      !!leadNote?.content.includes("role: lead"),
    `routine ${leadRoutine.id}, run ${JSON.stringify(runsOf(leadRoutine.id)[0])}\n${leadNote?.content}`
  );

  // ── (c) Caw's proposals: Approve commits as the person, Deny archives ──
  await section("c: Caw's proposals", async () => {
    const agentsNow = await wordsOf(projectId, "AGENTS.md");
    await http("POST", `/api/projects/${projectId}/threads`, {
      body: `PROBE-MEMORY-CAW-PROPOSE ${idOf(workerNote)}\n---AGENTS---\n${agentsNow}\n---END---`,
    });
    const asks = await until(
      "Caw's two proposals parked for the person",
      proposals,
      (found) => found.length === 2,
      240_000
    );
    const agentsAsk = asks.find(
      (ask) => ask.payload.input.path === "AGENTS.md"
    );
    const knowledgeAsk = asks.find(
      (ask) => ask.payload.input.path === "knowledge/caw.md"
    );
    const change = agentsAsk?.payload.presentation?.changes[0];
    check(
      "c: a proposal is the person's ask, drawn as its diff",
      agentsAsk?.payload.presentation?.summary === "Change AGENTS.md" &&
        change?.path === "AGENTS.md" &&
        change.added > 0 &&
        change.after.includes("The Memory project ships a small service.") &&
        knowledgeAsk?.payload.presentation?.summary ===
          "Add knowledge/caw.md" &&
        JSON.stringify(knowledgeAsk?.payload.input.notes) ===
          JSON.stringify([idOf(workerNote)]),
      asks
        .map(
          (ask) =>
            `${ask.payload.presentation?.summary} (${ask.payload.presentation?.detail}) by ${ask.payload.presentation?.asker}, notes ${JSON.stringify(ask.payload.input.notes)}`
        )
        .join("; ")
    );
    await answer(agentsAsk, { behavior: "allow", updatedInput: {} });
    await answer(knowledgeAsk, { behavior: "deny", message: "Not now" });
    await until(
      "both of Caw's proposals answered",
      proposals,
      (left) => left.length === 0,
      60_000
    );
    const agents = await wordsOf(projectId, "AGENTS.md");
    const [applied] = await history(projectId, "AGENTS.md");
    const knowledge = await fileOf(projectId, "knowledge/caw.md");
    const archive = await notesIn(projectId, "memory/archive");
    check(
      "c: Approve commits AGENTS.md as the person; Deny archives the cited note",
      agents.includes(
        "## About\n\n- The Memory project ships a small service."
      ) &&
        agents.includes("- Screenshots go in assets/screens.") &&
        applied?.author === "you" &&
        applied.message === "AGENTS.md: What the project is" &&
        knowledge.status === 404 &&
        outcomeOf(noteWith(archive, WORKER_NOTE)) === '"rejected: Not now"' &&
        (await listing(projectId, "memory/proposals")).length === 0,
      `AGENTS.md:\n${agents}\ncommit ${applied?.sha.slice(0, 9)} by ${applied?.author}: ${applied?.message}; knowledge/caw.md ${knowledge.status}; the worker's note: ${outcomeOf(noteWith(archive, WORKER_NOTE))}`
    );
  });

  // ── (e), (a): an attempt whose task names its context ──────────────────
  await section("a/e: an attempt", async () => {
    const task = await fleet.api<{ id: string }>(
      `/api/projects/${projectId}/tasks`,
      {
        title: "Ship the release",
        description:
          "PROBE-MEMORY-ATTEMPT: ship it, and note how deploys go out.",
        context: ["knowledge/deploy.md"],
        lands: "none",
      }
    );
    const attempt = await fleet.api<{ workItemId: string; instanceId: string }>(
      `/api/projects/${projectId}/tasks/${task.id}/attempts`,
      { parentInstanceId: worker }
    );
    const [item] = fleet.query<{ brief: string }>(
      "SELECT brief FROM work_items WHERE id = ?",
      attempt.workItemId
    );
    const brief = item?.brief ?? "";
    const at = brief.indexOf("## Project context");
    check(
      "e: an attempt's brief carries the knowledge file its task names",
      at >= 0 &&
        brief.includes("### AGENTS.md") &&
        brief.includes("### knowledge/deploy.md") &&
        brief.includes("KNOWLEDGE-DEPLOY: ship from main") &&
        !brief.includes("KNOWLEDGE-UNRELATED"),
      brief.slice(at, at + 900)
    );
    const note = await until(
      "the attempt's note in the inbox",
      async () => noteWith(await inbox(), ATTEMPT_NOTE),
      (found) => found !== undefined,
      240_000
    );
    const [commit] = await history(projectId, note?.path ?? "");
    const [row] = fleet.query<{ title: string }>(
      "SELECT title FROM instances WHERE id = ?",
      attempt.instanceId
    );
    check(
      "a: a delegate's memory_note lands in memory/inbox as its commit",
      !!note &&
        note.content.includes(`session: ${attempt.instanceId}`) &&
        note.content.includes("role: delegate") &&
        note.content.includes("source: attempt") &&
        note.content.includes(`task: ${task.id}`) &&
        !note.content.includes("taint:") &&
        commit?.author === row?.title &&
        (commit?.message.startsWith("memory: a note from") ?? false),
      `${note?.path}\n${note?.content}\ncommit ${commit?.sha.slice(0, 9)} by ${commit?.author}: ${commit?.message}`
    );
  });

  // ── (b) a delegate routine's run notes ─────────────────────────────────
  await section("b: a delegate routine's run", async () => {
    const routine = await fleet.api<{ id: string }>("/api/routines", {
      projectId,
      name: "Nightly look",
      cron: "0 0 1 1 *",
      timeZone: "UTC",
      target: "delegate",
      prompt: "PROBE-MEMORY-ROUTINE: look, and note what you learn.",
    });
    const run = await until(
      "the routine's run noted or ended",
      async () =>
        noteWith(await inbox(), ROUTINE_NOTE) ??
        (settled(runsOf(routine.id)[0]) ? runsOf(routine.id)[0] : undefined),
      (found) => found !== undefined,
      240_000
    );
    const note = "path" in (run ?? {}) ? (run as Note) : undefined;
    check(
      "b: a note from a delegate routine's run is tainted routine",
      !!note?.content.includes("taint: [routine]") &&
        !!note?.content.includes("source: routine"),
      note ? note.content : `no note; the run: ${JSON.stringify(run)}`
    );
  });

  // ── (c) the curator's run ──────────────────────────────────────────────
  await section("c: the curator's run", async () => {
    const [curatorRow] = fleet.query<{
      created_by: string;
      cron: string;
      id: string;
    }>(
      "SELECT id, cron, created_by FROM routines WHERE project_id = ? AND target = 'curator'",
      projectId
    );
    if (!curatorRow) {
      throw new Error("the project has no Memory curator routine");
    }
    await fleet.api(`/api/routines/${curatorRow.id}/run`, {});
    const asks = await until(
      "the curator's proposals, or its run's end",
      async () => {
        const parked = await proposals();
        return parked.length === 2 || settled(runsOf(curatorRow.id)[0])
          ? parked
          : undefined;
      },
      (found) => found !== undefined,
      300_000
    );
    const archive = await notesIn(projectId, "memory/archive");
    const tainted = [
      [ROUTINE_NOTE, '"tainted: routine"'],
      [LEAD_NOTE, '"tainted: routine"'],
      [WEB_NOTE, '"tainted: web"'],
    ].map(([words, outcome]) => ({
      words,
      ok:
        !noteWith(archive, words ?? "") ||
        outcomeOf(noteWith(archive, words ?? "")) === outcome,
      found: outcomeOf(noteWith(archive, words ?? "")),
    }));
    check(
      "b/c: the curator's run archives tainted notes; none is ever proposed",
      outcomeOf(noteWith(archive, LEAD_NOTE)) === '"tainted: routine"' &&
        outcomeOf(noteWith(archive, WEB_NOTE)) === '"tainted: web"' &&
        tainted.every((each) => each.ok) &&
        !asks.some((ask) =>
          [ROUTINE_NOTE, LEAD_NOTE, WEB_NOTE].some((words) =>
            JSON.stringify(ask.payload.input.notes).includes(
              idOf(noteWith(archive, words))
            )
          )
        ),
      `curator ${curatorRow.cron} by ${curatorRow.created_by}; archive: ${tainted.map((each) => `${each.words} → ${each.found}`).join("; ")}`
    );
    const [run] = runsOf(curatorRow.id);
    const [session] = fleet.query<{ role: string }>(
      "SELECT i.role FROM instances i JOIN work_items w ON w.instance_id = i.id WHERE w.parent_instance_id = ?",
      `routine:${curatorRow.id}`
    );
    const agentsAsk = asks.find(
      (ask) => ask.payload.input.path === "AGENTS.md"
    );
    const timeAsk = asks.find(
      (ask) => ask.payload.input.path === "knowledge/time.md"
    );
    const attemptId = idOf(noteWith(await inbox(), ATTEMPT_NOTE));
    check(
      "c: the curator run, in the curator role, proposes diffs citing the notes it read",
      session?.role === "curator" &&
        asks.length === 2 &&
        String(agentsAsk?.payload.presentation?.changes[0]?.after).includes(
          ATTEMPT_NOTE
        ) &&
        JSON.stringify(agentsAsk?.payload.input.notes) ===
          JSON.stringify([attemptId]) &&
        JSON.stringify(timeAsk?.payload.input.notes) ===
          JSON.stringify([idOf(secondNote)]),
      `its session's role ${session?.role}; its run ${JSON.stringify(run)}; asks ${asks.map((ask) => `${ask.payload.presentation?.summary} by ${ask.payload.presentation?.asker}, notes ${JSON.stringify(ask.payload.input.notes)}`).join("; ")}`
    );
    if (asks.length === 2) {
      await answer(agentsAsk, { behavior: "allow", updatedInput: {} });
      await answer(timeAsk, { behavior: "deny", message: "Later" });
      await until(
        "the curator's proposals answered",
        proposals,
        (left) => left.length === 0,
        60_000
      );
      const agents = await wordsOf(projectId, "AGENTS.md");
      const [applied] = await history(projectId, "AGENTS.md");
      const archived = await notesIn(projectId, "memory/archive");
      check(
        "c: approving the curator's proposal commits it to AGENTS.md; rejecting archives",
        agents.includes(`## Deploys\n\n- ${ATTEMPT_NOTE}`) &&
          agents.includes("- The Memory project ships a small service.") &&
          applied?.author === "you" &&
          outcomeOf(noteWith(archived, ATTEMPT_NOTE)) ===
            `"applied ${applied.sha.slice(0, 12)}"` &&
          outcomeOf(noteWith(archived, SECOND_NOTE)) === '"rejected: Later"' &&
          (await fileOf(projectId, "knowledge/time.md")).status === 404,
        `AGENTS.md:\n${agents}\ncommit by ${applied?.author}: ${applied?.message}`
      );
    }
  });
} catch (error) {
  check(
    "probe",
    false,
    error instanceof Error ? (error.stack ?? error.message) : String(error)
  );
} finally {
  if (failed) {
    console.log(
      (await fleet.logs("hub"))
        .split("\n")
        .filter((line) => LOGGED.test(line))
        .slice(-60)
        .join("\n")
    );
  }
  await fleet.close();
  await fleet.clean(keep);
}
console.log(JSON.stringify(results, null, 2));
process.exit(failed ? 1 : 0);

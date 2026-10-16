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
 * Besides: a note written in a turn that reached an outside URL is tainted
 * `web`, and (w) only content from outside the fleet is: a curl to localhost,
 * loopback, a 100.x tailnet address, *.ts.net, *.local or the fleet's own
 * host, and a browser's navigate to localhost, leave a note clean; github.com,
 * a URL in a variable, a navigate to an outside page, a claude.ai connector's
 * tool and a fleet MCP server at an outside URL taint it.
 *
 * Taint the hub keeps past a turn (memory.ts `TurnWatch`, db
 * `session_taints`), each across a hub restart:
 * (t1) A turn the hub did not deliver (a CronCreate the session set fires)
 *      is a heartbeat: its note is tainted `heartbeat`.
 * (t2) A session that read the web stays tainted `web`: a note in a later,
 *      delivered turn, after a hub restart, still carries it.
 * (t3) A background subagent outlives its turn: the parent's note in a later
 *      turn, after a hub restart, and the subagent's own note are tainted
 *      `subagent`; once the subagent ends, the parent's next note is clean.
 * (t4) A session a routine-woken Caw delegated is the routine's run: its note,
 *      after a hub restart, is tainted `routine`.
 *
 * (a), (e), (t4), the delegate routine's run and the curator's run are work
 * items: each runs in a workspace boundary, which needs unprivileged user
 * namespaces. Inside a workspace (a delegate's own) those are refused, and
 * those sections fail with the boundary's words; run it from a host shell.
 *
 * Run from the repo root:
 *   CAWCO_NO_MDNS=1 bun scripts/probe-memory.ts [--keep]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ensureDeps } from "./lib/deps";
import type { Reply, Seen } from "./scratch-fleet";

// The dependencies first (lib/deps.ts): the fleet loads after them.
await ensureDeps();
const { MACHINE, scratchFleet, until } = await import("./scratch-fleet");

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
const WEB_LATER_NOTE = "The status page refreshes every minute.";
const TIMER_NOTE = "The nightly timer checks the queue.";
const PARENT_NOTE = "The worker pool has four slots.";
const PARENT_AFTER_NOTE = "The worker pool drains before deploys.";
const CHILD_NOTE = "The cache warms in thirty seconds.";
const RCHILD_NOTE = "The morning routine rotates the logs.";
/** Each session's opening marker: the earliest in its conversation says which it is. */
const MARKERS = [
  "PROBE-MEMORY-ATTEMPT",
  "PROBE-MEMORY-ROUTINE",
  "PROBE-MEMORY-WORKER",
  "PROBE-MEMORY-SECOND",
  "PROBE-MEMORY-WEB",
  "PROBE-MEMORY-TIMER",
  "PROBE-MEMORY-PARENT",
  "PROBE-MEMORY-CHILD",
  "PROBE-MEMORY-RCHILD",
  "PROBE-MEMORY-NET",
] as const;

/** One tool call a mock answers with. */
interface NetCall {
  input: object;
  name: string;
}
const bash = (command: string): NetCall => ({
  name: "Bash",
  input: { command, description: "Reach a host" },
});

/**
 * (w) What reads the web: one session per case runs its call once, then
 * notes; `web` says whether its note must be tainted. `{host}` is the fleet
 * machine's own hostname. The MCP calls need no server: the hub judges the
 * call as its frame names it.
 */
const NET_CASES: Record<string, { call: NetCall; web: boolean }> = {
  localhost: {
    call: bash("curl -s -m 2 http://localhost:3456/health"),
    web: false,
  },
  "loopback-bare": {
    call: bash("curl -sf -m 2 127.0.0.1:9/health"),
    web: false,
  },
  "tailnet-ip": {
    call: bash("curl -s -m 2 http://100.101.102.103:4000/"),
    web: false,
  },
  "ts-net": {
    call: bash("curl -s -m 2 https://obelisk.tail1234.ts.net/"),
    web: false,
  },
  "dot-local": {
    call: bash("curl -s -m 2 http://studio.local:8080/"),
    web: false,
  },
  "fleet-host": { call: bash("curl -s -m 2 http://{host}:4000/"), web: false },
  github: {
    call: bash("curl -s -m 2 -o /dev/null https://github.com/"),
    web: true,
  },
  variable: { call: bash('curl -s -m 2 "$PROBE_TARGET"'), web: true },
  "navigate-local": {
    call: {
      name: "mcp__chrome-devtools__navigate_page",
      input: { url: "http://localhost:5173/" },
    },
    web: false,
  },
  "navigate-outside": {
    call: {
      name: "mcp__chrome-devtools__navigate_page",
      input: { url: "https://example.com/" },
    },
    web: true,
  },
  connector: {
    call: {
      name: "mcp__claude_ai_Gmail__search_threads",
      input: { query: "invoice" },
    },
    web: true,
  },
  "remote-server": {
    call: { name: "mcp__remote-probe__lookup", input: { id: "1" } },
    web: true,
  },
};
const NET_CASE = /PROBE-MEMORY-NET (\S+)(?: (\S+))?/;
const TAINT_LINE = /taint: (.*)/;
/** The prompt the timer session's CronCreate fires with: a turn no hub send started. */
const TIMED = "PROBE-MEMORY-TIMED";
/** The person's later asks to note, in order: each one more note. */
const NOTE_NOW = "NOTE-NOW";
const TAINT_FIELD = '"taint":';
/** One-shot calls, made once per run. */
const once: Record<"agent" | "cron" | "delegate", boolean> = {
  agent: false,
  cron: false,
  delegate: false,
};
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
const noted = (all: string): boolean => all.includes(TAINT_FIELD);
/** How many times `part` appears in `all`. */
const count = (all: string, part: string): number => all.split(part).length - 1;
/** A one-shot call: made the first time the tool is offered, never again. */
const callOnce = (
  request: Seen,
  key: keyof typeof once,
  name: string,
  input: object
): Reply => {
  const reply = call(request, name, input);
  if (reply.tool?.name === name) {
    once[key] = true;
  }
  return reply;
};
const finished = (request: Seen): boolean =>
  request.last.includes("checks passed") || request.last.includes("The item");
/** The text between two markers of a message, trimmed. */
const between = (all: string, from: string, to: string): string =>
  all.split(from)[1]?.split(to)[0]?.trim() ?? "";

/** Caw: a note and a delegate when a routine wakes him; two proposals when the person asks. */
const caw = (request: Seen): Reply => {
  const { all } = request;
  if (all.includes("PROBE-MEMORY-LEAD") && !noted(all)) {
    return call(request, NOTE, { text: LEAD_NOTE });
  }
  if (all.includes("PROBE-MEMORY-LEAD") && !once.delegate) {
    return callOnce(request, "delegate", "mcp__cawco__delegate", {
      title: "Note the routine fact",
      prompt:
        "PROBE-MEMORY-RCHILD: take a while, then note what the routine taught.",
      lands: "none",
    });
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
    headline: "Proposed AGENTS.md and knowledge/time.md.",
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
  switch (kind) {
    case "PROBE-MEMORY-ATTEMPT":
      return briefed(request, ATTEMPT_NOTE, "noted");
    case "PROBE-MEMORY-ROUTINE":
      return briefed(request, ROUTINE_NOTE, "NO_REPLY");
    case "PROBE-MEMORY-WEB":
      return webReader(request);
    case "PROBE-MEMORY-TIMER":
      return timer(request);
    case "PROBE-MEMORY-PARENT":
      return parent(request);
    case "PROBE-MEMORY-CHILD":
      return sleeper(request, "CHILD-SLEPT", 45, CHILD_NOTE, undefined);
    case "PROBE-MEMORY-NET":
      return netCase(request);
    case "PROBE-MEMORY-RCHILD":
      return sleeper(request, "RCHILD-SLEPT", 90, RCHILD_NOTE, "noted");
    default: {
      const words: Partial<Record<string, string>> = {
        "PROBE-MEMORY-WORKER": WORKER_NOTE,
        "PROBE-MEMORY-SECOND": SECOND_NOTE,
      };
      const note = kind ? words[kind] : undefined;
      return note && !noted(all)
        ? call(request, NOTE, { text: note })
        : text("ok");
    }
  }
};

/** A work item (an attempt, a routine's run): notes `words`, then finishes with `said` as its headline and summary. */
const briefed = (request: Seen, words: string, said: string): Reply => {
  if (!noted(request.all)) {
    return call(request, NOTE, { text: words });
  }
  return finished(request)
    ? text("done")
    : call(request, FINISH, { headline: said, summary: said });
};

/** A case of (w): its call once, on the person's message; then its note. */
const netCase = (request: Seen): Reply => {
  const [, name = "", host = ""] = NET_CASE.exec(request.all) ?? [];
  const known = NET_CASES[name];
  if (!known) {
    return text(`no case ${name}`);
  }
  if (!request.afterTool) {
    return tool(
      known.call.name,
      JSON.parse(JSON.stringify(known.call.input).replaceAll("{host}", host))
    );
  }
  return noted(request.all)
    ? text("ok")
    : call(request, NOTE, { text: `Net case ${name} noted.` });
};

/** The web reader: reaches a URL, notes; asked again later (NOTE-NOW), notes again without reading anything. */
const webReader = (request: Seen): Reply => {
  const { all } = request;
  if (!all.includes("WEB-REACHED")) {
    return tool("Bash", {
      command:
        "curl -s -m 2 -o /dev/null https://github.com/ ; echo WEB-REACHED",
      description: "Read a page",
    });
  }
  const notes = count(all, TAINT_FIELD);
  if (notes === 0) {
    return call(request, NOTE, { text: WEB_NOTE });
  }
  return count(all, NOTE_NOW) > notes - 1
    ? call(request, NOTE, { text: WEB_LATER_NOTE })
    : text("ok");
};

/** The timer: sets a one-shot CronCreate; the turn it fires (TIMED) notes. */
const timer = (request: Seen): Reply => {
  const { all } = request;
  if (all.includes(TIMED)) {
    return noted(all) ? text("ok") : call(request, NOTE, { text: TIMER_NOTE });
  }
  return once.cron
    ? text("scheduled")
    : callOnce(request, "cron", "CronCreate", {
        cron: "* * * * *",
        prompt: `${TIMED}: note what the timer checks.`,
        recurring: false,
      });
};

/** The parent: starts a background subagent, then notes once for each NOTE-NOW the person sends. */
const parent = (request: Seen): Reply => {
  const { all } = request;
  if (!once.agent) {
    const name =
      ["Agent", "Task"].find((one) => request.toolNames.includes(one)) ??
      "Agent";
    return callOnce(request, "agent", name, {
      description: "Warm the cache",
      prompt: "PROBE-MEMORY-CHILD: take a while, then note what you learned.",
      subagent_type: "general-purpose",
      run_in_background: true,
    });
  }
  const asks = count(all, NOTE_NOW);
  const notes = count(all, TAINT_FIELD);
  if (asks > notes) {
    return call(request, NOTE, {
      text: notes === 0 ? PARENT_NOTE : PARENT_AFTER_NOTE,
    });
  }
  return text("ok");
};

/** A session that sleeps `seconds`, notes `words`, then (a work item) finishes. */
const sleeper = (
  request: Seen,
  mark: string,
  seconds: number,
  words: string,
  summary: string | undefined
): Reply => {
  const { all } = request;
  if (!all.includes(mark)) {
    return tool("Bash", {
      command: `sleep ${seconds} && echo ${mark}`,
      description: "Take a while",
      timeout: (seconds + 30) * 1000,
    });
  }
  if (!noted(all)) {
    return call(request, NOTE, { text: words });
  }
  if (!summary || finished(request)) {
    return text("done");
  }
  return call(request, FINISH, { headline: summary, summary });
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
/** A session's taint as the hub stored it (db `session_taints`), its open subagents (`session_subagents`) as one JSON list. */
const taintOf = (instanceId: string) =>
  fleet.query<{ delivered: number; subagents: string; web: number }>(
    "SELECT delivered, (SELECT json_group_array(json_object('task', s.task, 'call', s.call)) FROM session_subagents s WHERE s.instance_id = session_taints.instance_id) AS subagents, web FROM session_taints WHERE instance_id = ?",
    instanceId
  )[0];
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
  // (t3) runs a harness subagent, which the fleet's default choice
  // (delegates instead of subagents) denies every session.
  const choices = await http("PUT", "/api/fleet/choices", {
    delegates: false,
  });
  if (choices.status !== 200) {
    throw new Error(`the fleet's choices were not set: ${choices.text}`);
  }

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

  // ── (w) what reads the web: content from outside the fleet ──────────────
  await section("w: what reads the web", async () => {
    // A fleet MCP server reached at an outside URL; off, so no session loads it.
    const remote = await http("PUT", "/api/fleet/mcp/remote-probe", {
      config: { type: "http", url: "https://mcp.example.invalid/mcp" },
      enabled: false,
    });
    if (remote.status !== 200) {
      throw new Error(`remote-probe was not saved: ${remote.text}`);
    }
    const [machine] = fleet.query<{ hostname: string }>(
      "SELECT hostname FROM agents"
    );
    const names = Object.keys(NET_CASES);
    await Promise.all(
      names.map(async (name) => {
        const id = await fleet.spawn("claude", `Probe net ${name}`, src, {
          projectId,
        });
        await fleet.send(
          id,
          `PROBE-MEMORY-NET ${name} ${machine?.hostname ?? ""}`
        );
      })
    );
    const notes = await until(
      "every case's note",
      async () => {
        const all = await inbox();
        const found = names.map((name) =>
          noteWith(all, `Net case ${name} noted.`)
        );
        return found.every(Boolean) ? found : undefined;
      },
      (found) => found !== undefined,
      300_000
    );
    const rows = names.map((name, at) => {
      const content = notes[at]?.content ?? "";
      const web = NET_CASES[name]?.web ?? false;
      const ok = web
        ? content.includes("taint: [web]")
        : !content.includes("taint:");
      return {
        ok,
        said: `${name}: ${TAINT_LINE.exec(content)?.[1] ?? "clean"}${ok ? "" : ` (expected ${web ? "web" : "clean"})`}`,
      };
    });
    check(
      "w: only content from outside the fleet reads the web",
      rows.every((row) => row.ok),
      `fleet host ${machine?.hostname}; ${rows.map((row) => row.said).join("; ")}`
    );
  });

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

  // ── (t1)–(t4): taint the hub keeps past a turn, across a hub restart ──
  await section("t: taint past a turn", async () => {
    // t1: a session sets a timer; the turn it fires, no one delivered.
    const timed = await fleet.spawn("claude", "Probe timer", src, {
      projectId,
    });
    await fleet.send(
      timed,
      "PROBE-MEMORY-TIMER: set a timer to check the queue."
    );
    // t3: a session starts a subagent in the background, which outlives its turn.
    const parentId = await fleet.spawn("claude", "Probe parent", src, {
      projectId,
    });
    await fleet.send(
      parentId,
      "PROBE-MEMORY-PARENT: start the helper in the background."
    );
    const before = await until(
      "the parent's background subagent, kept open by the hub",
      () => taintOf(parentId),
      (row) => row !== undefined && row.subagents !== "[]",
      120_000
    );
    // The hub restarts while the subagent, the timer and Caw's delegate (t4) wait.
    console.log("restarting the hub mid-turn");
    await fleet.stop("hub");
    fleet.launch("hub");
    await fleet.hubUp();

    await fleet.send(parentId, `${NOTE_NOW}: note the pool size.`);
    const parentNote = await until(
      "the parent's note while its subagent runs",
      async () => noteWith(await inbox(), PARENT_NOTE),
      (found) => found !== undefined,
      120_000
    );
    check(
      "t3: after a hub restart, a note in a later delivered turn while a background subagent runs is tainted subagent",
      !!parentNote?.content.includes("taint: [subagent]"),
      `open before the restart: ${before?.subagents}\n${parentNote?.content}`
    );
    await fleet.send(webber, `${NOTE_NOW}: note how often the page refreshes.`);
    const webLater = await until(
      "the web reader's later note",
      async () => noteWith(await inbox(), WEB_LATER_NOTE),
      (found) => found !== undefined,
      120_000
    );
    check(
      "t2: after a hub restart, a session that read the web earlier is still tainted web in a later delivered turn",
      !!webLater?.content.includes("taint: [web]"),
      webLater?.content ?? "(none)"
    );
    const childNote = await until(
      "the subagent's own note",
      async () => noteWith(await inbox(), CHILD_NOTE),
      (found) => found !== undefined,
      180_000
    );
    const closed = await until(
      "the subagent's end, by its own event",
      () => taintOf(parentId),
      (row) => row?.subagents === "[]",
      180_000
    );
    await fleet.send(parentId, `${NOTE_NOW}: note it again.`);
    const afterNote = await until(
      "the parent's note once its subagent ended",
      async () => noteWith(await inbox(), PARENT_AFTER_NOTE),
      (found) => found !== undefined,
      120_000
    );
    check(
      "t3: the subagent's own note is tainted subagent; once it ends, the parent's next note is clean",
      !!childNote?.content.includes("subagent") &&
        closed?.subagents === "[]" &&
        !afterNote?.content.includes("taint:"),
      `${childNote?.content}\n${afterNote?.content}`
    );
    const timerNote = await until(
      "the note of the turn the timer fired",
      async () => noteWith(await inbox(), TIMER_NOTE),
      (found) => found !== undefined,
      180_000
    );
    check(
      "t1: a turn the hub did not deliver (a CronCreate firing) is a heartbeat",
      !!timerNote?.content.includes("taint: [heartbeat]"),
      timerNote?.content ?? "(none)"
    );
  });
  await section("t4: a session a routine-woken Caw delegated", async () => {
    const [item] = await until(
      "the work item Caw's routine-woken turn delegated",
      () =>
        fleet.query<{ id: string; state: string }>(
          "SELECT id, state FROM work_items WHERE title = 'Note the routine fact'"
        ),
      (rows) => rows.length > 0,
      60_000
    );
    const note = await until(
      "the delegate's note, after the hub restarted under it",
      async () => noteWith(await inbox(), RCHILD_NOTE),
      (found) => found !== undefined,
      240_000
    );
    check(
      "t4: a session a routine-woken Caw delegated is the routine's run, across a hub restart",
      !!note?.content.includes("taint: [routine]"),
      `work item ${item?.id} (${item?.state})\n${note?.content}`
    );
  });

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

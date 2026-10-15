/**
 * The fleet's one finding engine (hub find.ts), read from its answers on a
 * scratch fleet of two machines (real hub, two agents and their sessionds,
 * Claude Code against the mock model). The hub's database is seeded with 150
 * conversations in mixed states across both machines (asleep, ended, some
 * weeks old, delegates under an orchestrator), a project with a Caw thread,
 * and each conversation's transcript on its machine; two real sessions run.
 *
 * a. A title's words in any order find the conversation, ranked first.
 * b. A phrase the person said finds its conversation, with the moment it was
 *    said attached (theirs: `owner`); with `by=me`, a conversation where the
 *    same words were only handed in (a hand-off, a reminder) is left out;
 *    `by=caw` finds Caw's words in his thread without asking a machine.
 * c. A directory's name finds its session.
 * d. A mention as a composer's chip (`@Title <dir#id8>`) reaches, through
 *    `handoff`, the session it names and not its namesake; the bare title
 *    is refused naming both; a thread's handle resolves to its thread.
 * e. An artifact waits until it is opened at its revision, and its next
 *    revision brings it back.
 * f. A machine that does not answer is named in the answer's coverage.
 * g. The names part answers in under 50 ms at the hub (p95), with the 150
 *    and again with the live fleet's row counts (2,600 more sessions, 3,000
 *    ended work items); what the transcripts part costs per call is printed,
 *    on the fleet and on an index the size of a busy machine's.
 *
 * Caw cannot start inside a CawCo workspace's boundary (caw-threads.ts), so
 * d's thread is one whose Caw is off: the hand-off resolves to it and is
 * refused naming it.
 *
 *   bun scripts/probe-kit/run.ts find-engine
 */
import { Database } from "bun:sqlite";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  FindAnswer,
  FindConversation,
  WaitingAnswer,
} from "../../../packages/core/src";
import { CLAUDE_DIR_NAME } from "../../../packages/core/src/claude-dirs";
import type { TranscriptDoc } from "../../../packages/jsonl-parser/src";
import { TranscriptIndex } from "../../../packages/jsonl-parser/src/fts5";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const OTHER = "scratch-other";
const HANDOFF = "mcp__cawco__handoff";
const CREATE = "mcp__cawco__artifact_create";
const UPDATE = "mcp__cawco__artifact_update";
const COMMAND = /PROBE-CALL:(\d+)/g;
/** The id in artifact_create's answer, as the tool result carries it. */
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** The words the person said in one conversation, and handed in another. */
const PHRASE =
  "please fold the zephyrine moments per conversation before ranking";
const LIVE_TITLE = "Orchestrate cockpit fleet";
/** The live fleet's counts the names part is measured at again (the board's 2,600 rows, 2026-10-09). */
const SCALE_SESSIONS = 2600;
const SCALE_ITEMS = 3000;
/** Documents in the index measured for the transcripts part: a busy machine's (fts5.ts's 170 MB index). */
const INDEX_DOCS = 400_000;

/** What each numbered message asks the sender to call, and what it answered. */
const asks = new Map<string, { input: object; name: string }>();
const issued = new Set<string>();
const answered = new Map<string, string>();

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

/** Calls `name` with `input`, loading it through ToolSearch first when it is deferred. */
const callTool = (request: Seen, name: string, input: object): Reply => {
  if (request.toolNames.includes(name)) {
    return { everyMs: 5, words: [], tool: { name, input } };
  }
  if (!request.toolNames.includes("ToolSearch")) {
    return text(`${name} is not offered`);
  }
  return {
    everyMs: 5,
    words: [],
    tool: {
      name: "ToolSearch",
      input: { query: `select:${name}`, max_results: 1 },
    },
  };
};

const respond = (request: Seen): Reply => {
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
  const reply = callTool(request, ask.name, ask.input);
  if (reply.tool?.name === ask.name) {
    issued.add(marker);
  }
  return reply;
};

/** A conversation the probe seeds: its row, and what its transcript says. */
interface Seeded {
  ageMs: number;
  cwd: string;
  id: string;
  kind?: "mainline" | "scratch";
  lines: { author: "user" | "assistant"; text: string }[];
  machine: string;
  parent?: string;
  sessionId: string;
  status: "sleeping" | "stopped" | "error";
  title: string;
}

const VERBS = ["Fix", "Refactor", "Probe", "Audit", "Ship", "Draft", "Tune"];
const THINGS = [
  "landing copy",
  "rail motion",
  "push relay",
  "task stages",
  "account limits",
  "preview ports",
  "routine runs",
  "memory curator",
  "composer recall",
  "usage forecast",
];
const DIRS = ["cockpit", "cawco", "baitna", "petralab", "site", "backlot"];
const STATUSES: Seeded["status"][] = [
  "sleeping",
  "stopped",
  "stopped",
  "error",
];
const hex = () => crypto.randomUUID().slice(0, 4);

const seeded = (
  machine: string,
  title: string,
  cwd: string,
  ageMs: number,
  status: Seeded["status"],
  lines: Seeded["lines"],
  extra: Partial<Seeded> = {}
): Seeded => ({
  id: crypto.randomUUID(),
  sessionId: crypto.randomUUID(),
  machine,
  title,
  cwd,
  ageMs,
  status,
  lines,
  ...extra,
});

/** The conversations the assertions name. */
const namedConversations = (): Seeded[] => [
  seeded(
    MACHINE,
    "Lead orchestration desk",
    "/work/cockpit",
    2 * DAY,
    "sleeping",
    [
      { author: "user", text: "keep the fleet moving today" },
      { author: "assistant", text: "Delegating the rail and relay work." },
    ]
  ),
  // (a) A title found by its words in any order.
  seeded(
    MACHINE,
    "Boundary quiet harness fix",
    "/work/cawco-77aa",
    9 * DAY,
    "sleeping",
    [
      { author: "user", text: "the harness keeps waking the boundary" },
      { author: "assistant", text: "Quieted it." },
    ]
  ),
  // (b) The person's words, said here, on the other machine.
  seeded(OTHER, "Ranking notes", "/work/petralab-31be", 6 * DAY, "stopped", [
    { author: "user", text: PHRASE },
    { author: "assistant", text: "Folded them per conversation." },
  ]),
  // (b) The same words, only handed in: a hand-off and a reminder.
  seeded(MACHINE, "Relay rewrite", "/work/site-90cd", 3 * DAY, "sleeping", [
    {
      author: "user",
      text: `[Hand-off from the lead#12345678 session — another agent, not the user]\n\n${PHRASE}`,
    },
    {
      author: "user",
      text: `continue the relay <system-reminder>${PHRASE}</system-reminder>`,
    },
    { author: "assistant", text: "On it." },
  ]),
  // (c) Found by its directory's name.
  seeded(
    MACHINE,
    "Settings polish",
    "/work/anbar-ios-7c1f",
    12 * DAY,
    "stopped",
    [{ author: "user", text: "tighten the settings rows" }]
  ),
  // (d) The live session's namesake, weeks old and asleep.
  seeded(MACHINE, LIVE_TITLE, "/work/cockpit", 20 * DAY, "sleeping", [
    { author: "user", text: "orchestrate the fleet from here" },
  ]),
];

/** The 150 conversations: the named ones, then a fleet's worth of others. */
const seedFleet = (): Seeded[] => {
  const named = namedConversations();
  const lead = named[0]?.id;
  const rest: Seeded[] = [];
  for (let i = 0; rest.length + named.length < 150; i += 1) {
    const verb = VERBS[i % VERBS.length] ?? "Fix";
    const thing =
      THINGS[Math.floor(i / VERBS.length) % THINGS.length] ?? "rail";
    rest.push(
      seeded(
        i % 3 === 0 ? OTHER : MACHINE,
        `${verb} ${thing} ${i}`,
        `/work/${DIRS[i % DIRS.length]}-${hex()}`,
        (i % 40) * DAY + (i % 7) * HOUR,
        STATUSES[i % STATUSES.length] ?? "stopped",
        [
          {
            author: "user",
            text: `${verb.toLowerCase()} the ${thing} for round ${i}`,
          },
          { author: "assistant", text: `Done with the ${thing}.` },
        ],
        {
          ...(i % 5 === 0 && lead ? { parent: lead } : {}),
          ...(i % 11 === 0 ? { kind: "scratch" as const } : {}),
        }
      )
    );
  }
  return [...named, ...rest];
};

/** One transcript line as Claude Code writes it. */
const line = (
  row: Seeded,
  author: "user" | "assistant",
  words: string,
  at: number
) =>
  `${JSON.stringify({
    parentUuid: null,
    isSidechain: false,
    userType: "external",
    cwd: row.cwd,
    sessionId: row.sessionId,
    version: "2.1.0",
    type: author,
    message:
      author === "user"
        ? { role: "user", content: words }
        : {
            role: "assistant",
            model: "claude-haiku-4-5",
            content: [{ type: "text", text: words }],
          },
    uuid: crypto.randomUUID(),
    timestamp: new Date(at).toISOString(),
  })}\n`;

/** Each of `rows`' transcripts, in its machine's Claude Code projects under `home`. */
const writeTranscripts = async (rows: Seeded[], home: string) => {
  const now = Date.now();
  await Promise.all(
    rows.map(async (row) => {
      const dir = join(
        home,
        CLAUDE_DIR_NAME,
        "projects",
        row.cwd.replaceAll("/", "-")
      );
      await mkdir(dir, { recursive: true });
      const at = now - row.ageMs;
      await writeFile(
        join(dir, `${row.sessionId}.jsonl`),
        row.lines
          .map((each, i) => line(row, each.author, each.text, at + i * 1000))
          .join("")
      );
    })
  );
};

/** Opens the hub's database beside a stopped hub, runs `write`, closes it. */
const withDb = <T>(dbPath: string, write: (db: Database) => T): T => {
  const db = new Database(dbPath);
  try {
    db.exec("PRAGMA busy_timeout = 15000");
    return write(db);
  } finally {
    db.close();
  }
};

/** The hub's rows for `rows`, in one transaction. */
const insertRows = (db: Database, rows: Seeded[], projectId: string | null) => {
  const now = Date.now();
  const insert = db.query(
    `INSERT INTO instances (id, machine_id, project_id, session_id, harness, parent_instance_id, cwd,
       launch_dir, title, title_source, kind, status, created_at, updated_at, turn_ended_at)
     VALUES (?, ?, ?, ?, 'claude', ?, ?, 'known', ?, 'agent', ?, ?, ?, ?, ?)`
  );
  db.transaction(() => {
    for (const row of rows) {
      const at = now - row.ageMs;
      insert.run(
        row.id,
        row.machine,
        projectId,
        row.sessionId,
        row.parent ?? null,
        row.cwd,
        row.title,
        row.kind ?? "mainline",
        row.status,
        at - DAY,
        at,
        at
      );
    }
  })();
};

/** A Caw thread of the project with your words and his; answers its id. */
const insertThread = (db: Database, projectId: string): string => {
  const now = Date.now();
  const threadId = crypto.randomUUID();
  db.query(
    "INSERT INTO project_threads (id, project_id, title, setup, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)"
  ).run(threadId, projectId, "Search rework with Caw", now - DAY, now - DAY);
  const message = db.query(
    "INSERT INTO thread_messages (id, thread_id, author, body, created_at) VALUES (?, ?, ?, ?, ?)"
  );
  message.run(
    crypto.randomUUID(),
    threadId,
    "you",
    "should the zephyrine index weigh my words",
    now - DAY
  );
  message.run(
    crypto.randomUUID(),
    threadId,
    "caw",
    "Yes: the zephyrine moments weigh your words double.",
    now - DAY + 1000
  );
  return threadId;
};

/** The live fleet's scale: more sessions, and ended work items with commits and changed files. */
const insertScale = (db: Database, under: string) => {
  const rows = Array.from({ length: SCALE_SESSIONS }, (_, i) =>
    seeded(
      i % 2 === 0 ? OTHER : MACHINE,
      `${VERBS[i % VERBS.length]} ${THINGS[i % THINGS.length]} scale ${i}`,
      `/work/${DIRS[i % DIRS.length]}-${hex()}`,
      (i % 60) * DAY,
      STATUSES[i % STATUSES.length] ?? "stopped",
      []
    )
  );
  insertRows(db, rows, null);
  const now = Date.now();
  const workspace = db.query(
    `INSERT INTO workspaces (id, machine_id, repo_root, path, branch, state, created_by_instance_id, created_at)
     VALUES (?, ?, '/work/repo', ?, ?, 'archived', ?, ?)`
  );
  const item = db.query(
    `INSERT INTO work_items (id, workspace_id, parent_instance_id, instance_id, brief, title, harness, state,
       headline, result, created_at, ended_at)
     VALUES (?, ?, ?, ?, ?, ?, 'claude', 'done', ?, ?, ?, ?)`
  );
  db.transaction(() => {
    for (let i = 0; i < SCALE_ITEMS; i += 1) {
      const id = crypto.randomUUID();
      const sha = crypto.randomUUID().replaceAll("-", "").slice(0, 9);
      const maker = rows[i % rows.length]?.id ?? under;
      workspace.run(
        id,
        MACHINE,
        `/work/ws-${i}`,
        `ws/${id.slice(0, 8)}`,
        under,
        now
      );
      item.run(
        id,
        id,
        under,
        maker,
        `Brief ${i}: ${THINGS[i % THINGS.length]} across the fleet`,
        `${VERBS[i % VERBS.length]} ${THINGS[i % THINGS.length]} item ${i}`,
        `Shipped the ${THINGS[i % THINGS.length]} change ${i}`,
        `Done.\n\nCommits:\n\`\`\`\n${sha} ${THINGS[i % THINGS.length]} change ${i}\n\`\`\`\n\nDiffstat:\n\`\`\`\n packages/hub/src/file-${i}.ts | 12 +++++---\n 1 file changed\n\`\`\``,
        now - (i % 60) * DAY - HOUR,
        now - (i % 60) * DAY
      );
    }
  })();
};

const conversations = (answer: FindAnswer): FindConversation[] =>
  answer.results.filter(
    (result): result is FindConversation => result.kind === "conversation"
  );

const p = (values: number[], at: number): number => {
  const sorted = values.toSorted((a, b) => a - b);
  return (
    sorted[Math.min(sorted.length - 1, Math.ceil(at * sorted.length) - 1)] ?? 0
  );
};

/** What every step reads: the kit, the fleet and what was seeded on it. */
interface Probe {
  find: (query: string) => Promise<FindAnswer>;
  fleet: KitFleet;
  kit: Kit;
  live: string;
  other: Awaited<ReturnType<KitFleet["launchMachine"]>>;
  rows: Seeded[];
  sender: string;
  threadId: string;
}

/** The fleet, seeded: rows and a thread under a stopped hub, every transcript before its agent reads. */
const standUp = async (kit: Kit): Promise<Probe> => {
  const fleet = await kit.fleet(respond);
  const dbPath = fleet.env.CAWCO_DB_PATH ?? "";
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Fleet Tools",
  });
  await fleet.stop("hub");
  const rows = seedFleet();
  const threadId = withDb(dbPath, (db) => {
    insertRows(db, rows, project.id);
    return insertThread(db, project.id);
  });
  await writeTranscripts(
    rows.filter((row) => row.machine === MACHINE),
    fleet.home
  );
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const other = await fleet.launchMachine(OTHER);
  await writeTranscripts(
    rows.filter((row) => row.machine === OTHER),
    other.home
  );
  const live = await fleet.spawn("claude", LIVE_TITLE, fleet.repo);
  const sender = await fleet.spawn("claude", "Probe sender", fleet.workdir);
  kit.note(
    `seeded ${rows.length} conversations; live ${live}, sender ${sender}`
  );
  return {
    kit,
    fleet,
    other,
    rows,
    live,
    sender,
    threadId,
    find: (query) => fleet.api<FindAnswer>(`/api/find?${query}`),
  };
};

/** a and c: names in any order, and a directory's name. */
const checkNames = async ({ kit, find, live }: Probe) => {
  const quiet = await find("q=harness+quiet+boundary&transcripts=0");
  kit.check(
    "a. a title's words in any order rank it first",
    quiet.results[0]?.title === "Boundary quiet harness fix",
    quiet.results
      .slice(0, 3)
      .map((each) => each.title)
      .join(" | ")
  );
  const orchestrate = await find("q=fleet+orchestrate+cockpit&transcripts=0");
  const both = conversations(orchestrate).filter(
    (each) => each.title === LIVE_TITLE
  );
  kit.check(
    "a. the running namesake ranks above the weeks-old one",
    both.length === 2 &&
      both[0]?.id === live &&
      orchestrate.results[0]?.id === live,
    both.map((each) => `${each.id.slice(0, 8)} ${each.state}`).join(", ")
  );
  const [dirTop] = (await find("q=anbar+7c1f&transcripts=0")).results;
  kit.check(
    "c. a directory's name finds its session",
    dirTop?.kind === "conversation" &&
      dirTop.title === "Settings polish" &&
      dirTop.matched.includes("dir"),
    JSON.stringify([dirTop?.title, dirTop?.matched])
  );
};

/** b: the person's words, by=me, by=caw. */
const checkSaid = async ({ kit, find, threadId }: Probe) => {
  const said = await until(
    "the phrase's conversation from the other machine's transcripts",
    () => find("q=fold+zephyrine+moments&kinds=conversation"),
    (answer) =>
      conversations(answer).some((each) => each.title === "Ranking notes"),
    90_000
  );
  const [top] = conversations(said);
  kit.check(
    "b. the person's own words rank their conversation first, its moment attached",
    top?.title === "Ranking notes" &&
      top.moments[0]?.author === "owner" &&
      top.moments[0].excerpt.includes("「zephyrine」"),
    JSON.stringify(
      conversations(said).map((each) => [
        each.title,
        each.score,
        each.moments[0]?.author,
      ])
    )
  );
  const mine = await find("q=fold+zephyrine+moments&kinds=conversation&by=me");
  kit.check(
    "b. by=me leaves out the words only handed in",
    conversations(mine).some((each) => each.title === "Ranking notes") &&
      !conversations(mine).some((each) => each.title === "Relay rewrite"),
    conversations(mine)
      .map((each) => each.title)
      .join(" | ")
  );
  const caws = await find("q=zephyrine+weigh&by=caw");
  const [first] = caws.results;
  kit.check(
    "b. by=caw finds Caw's words in his thread, asking no machine",
    first?.kind === "thread" &&
      first.id === threadId &&
      first.moments[0]?.author === "caw" &&
      !caws.coverage.asked,
    JSON.stringify(caws.results.map((each) => [each.kind, each.title]))
  );
};

/** Has the sender session call `name` with `input`; answers what the call answered. */
const callFrom = (probe: Probe) => {
  let sent = 0;
  return async (name: string, input: object): Promise<string> => {
    sent += 1;
    const marker = String(sent);
    asks.set(marker, { name, input });
    await probe.fleet.send(probe.sender, `PROBE-CALL:${marker}`);
    return (await until(
      `the ${name} call (${marker})`,
      () => answered.get(marker),
      Boolean,
      180_000
    )) as string;
  };
};

/** d: the chip reaches its session, the bare title is refused, a thread resolves. */
const checkMentions = async (
  probe: Probe,
  call: (name: string, input: object) => Promise<string>
) => {
  const { kit, find, fleet, live, threadId } = probe;
  const orchestrate = await find("q=orchestrate+cockpit+fleet&transcripts=0");
  const handle = conversations(orchestrate).find(
    (each) => each.id === live
  )?.handle;
  const handed = await call(HANDOFF, {
    target: `@${LIVE_TITLE} <${handle}>`,
    message: "PROBE-CHIP-REACHED",
  });
  const reached = fleet
    .query<{ instance_id: string }>(
      "SELECT instance_id FROM sent_messages WHERE body LIKE '%PROBE-CHIP-REACHED%'"
    )
    .map((row) => row.instance_id);
  kit.check(
    "d. the chip reaches the session it names, not its namesake",
    handed.includes(`Handed to ${handle}`) &&
      reached.length === 1 &&
      reached[0] === live,
    `${handed.slice(0, 200)} | reached ${reached.join(",")}`
  );
  const bare = await call(HANDOFF, {
    target: LIVE_TITLE,
    message: "PROBE-BARE",
  });
  const namesake = fleet.query<{ status: string; last_error: string | null }>(
    "SELECT status, last_error FROM instances WHERE title = ? AND id != ?",
    LIVE_TITLE,
    live
  );
  kit.check(
    "d. the bare title is refused, naming both",
    bare.includes(`"${LIVE_TITLE}" matches 2 sessions`),
    `${bare.slice(0, 300)} | namesake ${JSON.stringify(namesake)}`
  );
  const toThread = await call(HANDOFF, {
    target: `@Search rework with Caw <thread#${threadId.slice(0, 8)}>`,
    message: "PROBE-THREAD",
  });
  kit.check(
    "d. a thread's handle resolves to its thread",
    toThread.includes("the thread “Search rework with Caw”"),
    toThread.slice(0, 300)
  );
};

/** e: an artifact waits until opened at its revision; a new revision waits again. */
const checkWaiting = async (
  { kit, fleet }: Probe,
  call: (name: string, input: object) => Promise<string>
) => {
  const created = await call(CREATE, {
    kind: "page",
    name: "find-preview",
    html: "<h1>First</h1>",
  });
  const artifactId = created.match(ANSWERED_ID)?.[1] ?? "";
  const waiting = async () =>
    (await fleet.api<WaitingAnswer>("/api/find/waiting")).items.find(
      (item) => item.id === artifactId
    );
  const before = await waiting();
  await fleet.api("/api/find/seen", { kind: "artifact", id: artifactId });
  const opened = await waiting();
  await call(UPDATE, { id: artifactId, html: "<h1>Second</h1>" });
  const revised = await waiting();
  kit.check(
    "e. unseen, gone once opened, back at its new revision",
    before?.why === "unseen" &&
      opened === undefined &&
      revised?.why === "new revision" &&
      revised.revision === 2,
    JSON.stringify([before?.why, opened?.why, revised?.why, revised?.revision])
  );
};

/** f: a frozen machine is named in the coverage, the answering one too. */
const checkCoverage = async ({ kit, find, other }: Probe) => {
  process.kill(other.agent.pid, "SIGSTOP");
  let frozen: FindAnswer;
  try {
    frozen = await find("q=zephyrine&kinds=conversation");
  } finally {
    process.kill(other.agent.pid, "SIGCONT");
  }
  const silent = frozen.coverage.machines.find(
    (each) => each.machineId === OTHER
  );
  const answering = frozen.coverage.machines.find(
    (each) => each.machineId === MACHINE
  );
  kit.check(
    "f. coverage names the machine that didn't answer, and the one that did",
    frozen.coverage.asked &&
      silent?.answered === false &&
      (silent.reason ?? "").includes("didn't answer within 1.5 s") &&
      answering?.answered === true &&
      answering.indexAgeMs !== null,
    JSON.stringify(frozen.coverage)
  );
};

const QUERIES = [
  "fix",
  "rail",
  "push relay",
  "stages",
  "orchestrate",
  "cockpit fleet",
  "anbar",
  "probe",
  "tune usage",
  "memory",
];

/** g: the names part's time at the hub over 200 calls, asserted under 50 ms at p95. */
const timeNames = async ({ kit, find }: Probe, label: string) => {
  const names: number[] = [];
  const walls: number[] = [];
  for (let i = 0; i < 200; i += 1) {
    const q = encodeURIComponent(QUERIES[i % QUERIES.length] ?? "fix");
    const started = performance.now();
    // biome-ignore lint/performance/noAwaitInLoops: each call is timed alone
    const answer = await find(`q=${q}&transcripts=0`);
    walls.push(performance.now() - started);
    names.push(answer.timing.namesMs);
  }
  kit.note(
    `names part, ${label}: at the hub p50 ${p(names, 0.5)} ms, p95 ${p(names, 0.95)} ms, max ${Math.max(...names)} ms; round trip p95 ${p(walls, 0.95).toFixed(1)} ms`
  );
  kit.check(
    `g. the names part answers in under 50 ms at the hub (p95), ${label}`,
    p(names, 0.95) < 50,
    `${p(names, 0.95)} ms`
  );
};

/** g: the transcripts part's time over 30 calls, and each machine's. */
const timeTranscripts = async ({ kit, find }: Probe) => {
  const took: number[] = [];
  const perMachine: Record<string, number[]> = {};
  for (let i = 0; i < 30; i += 1) {
    const q = encodeURIComponent(QUERIES[i % QUERIES.length] ?? "fix");
    // biome-ignore lint/performance/noAwaitInLoops: each call is timed alone
    const answer = await find(`q=${q}`);
    took.push(answer.timing.transcriptsMs ?? 0);
    for (const machine of answer.coverage.machines) {
      perMachine[machine.machineId] = [
        ...(perMachine[machine.machineId] ?? []),
        machine.tookMs ?? 0,
      ];
    }
  }
  kit.note(
    `transcripts part on the fleet: p50 ${p(took, 0.5)} ms, p95 ${p(took, 0.95)} ms; ${Object.entries(
      perMachine
    )
      .map(
        ([machine, ms]) =>
          `${machine} p50 ${p(ms, 0.5)} / p95 ${p(ms, 0.95)} ms`
      )
      .join("; ")}`
  );
};

/** g at the live fleet's scale: more rows under a stopped hub, then the names part timed again. */
const timeAtScale = async (probe: Probe) => {
  const { fleet, live } = probe;
  await fleet.stop("hub");
  withDb(fleet.env.CAWCO_DB_PATH ?? "", (db) => insertScale(db, live));
  fleet.launch("hub");
  await fleet.hubUp();
  await fleet.agentUp();
  const answer = await probe.find("q=scale+1234&transcripts=0");
  probe.kit.check(
    "g. at scale, a seeded session is found by its title",
    answer.results.some((each) => each.title.endsWith("scale 1234")),
    answer.results
      .slice(0, 3)
      .map((each) => each.title)
      .join(" | ")
  );
  await timeNames(
    probe,
    `${probe.rows.length + SCALE_SESSIONS + 2} sessions, ${SCALE_ITEMS} work items`
  );
};

/** A word list with a long tail, as prose has: a few words everywhere, most rare. */
const vocabulary = (size: number): string[] =>
  Array.from({ length: size }, (_, i) => {
    const letters = "etaoinshrdlucmfwypvbgkjqxz";
    let word = "";
    for (let n = i + 1; n > 0; n = Math.floor(n / letters.length)) {
      word += letters[n % letters.length];
    }
    return word.length < 4 ? `${word}ing` : word;
  });

/** One document's text: 40 words drawn from `words` by rank (Zipf). */
const prose = (words: string[]): string =>
  Array.from({ length: 40 }, () => {
    const rank = Math.floor(words.length ** Math.random()) - 1;
    return words[Math.max(0, rank)];
  }).join(" ");

/**
 * g: what one machine's transcript query costs on an index the size of a
 * busy machine's ({@link INDEX_DOCS} documents), by how common the words are.
 */
const timeIndex = async ({ kit }: Probe) => {
  const dir = join(process.env.TMPDIR ?? "/tmp", `find-index-${hex()}`);
  await mkdir(dir, { recursive: true });
  const index = new TranscriptIndex(join(dir, "index.db"));
  try {
    const words = vocabulary(30_000);
    const built = performance.now();
    for (let batch = 0; batch < INDEX_DOCS / 10_000; batch += 1) {
      const docs: TranscriptDoc[] = Array.from({ length: 10_000 }, (_, i) => ({
        harness: "claude-code",
        sessionId: `session-${(batch * 10_000 + i) % 3000}`,
        id: crypto.randomUUID(),
        role: i % 2 === 0 ? "user" : "assistant",
        author: i % 2 === 0 ? "owner" : "agent",
        timestamp: new Date(
          Date.now() - (batch * 10_000 + i) * 60_000
        ).toISOString(),
        text: prose(words),
      }));
      index.indexDocs(docs);
    }
    const classes = {
      "a common word": [words[3], words[8], words[15]],
      "a mid word": [words[400], words[900], words[1500]],
      "a rare word": [words[20_000], words[25_000], words[28_000]],
      "two words": [
        `${words[40]} ${words[700]}`,
        `${words[90]} ${words[2000]}`,
      ],
      "a two-letter start": [words[5]?.slice(0, 2), words[50]?.slice(0, 2)],
    };
    const lines: string[] = [];
    let worst = 0;
    const timed = (query: string) => {
      const started = performance.now();
      index.search(query, { limit: 20 });
      return performance.now() - started;
    };
    for (const [label, queries] of Object.entries(classes)) {
      const ms = Array.from({ length: 10 }, () =>
        queries.map((query) => timed(query ?? ""))
      ).flat();
      worst = Math.max(worst, p(ms, 0.95));
      lines.push(
        `${label} p50 ${p(ms, 0.5).toFixed(1)} / p95 ${p(ms, 0.95).toFixed(1)} ms`
      );
    }
    // A query as it is typed, one keystroke at a time: a common word, then a rarer one.
    const typed = `${words[3]} ${words[1200]}`;
    const keystrokes = Array.from({ length: typed.length - 1 }, (_, i) =>
      timed(typed.slice(0, i + 2).trim())
    );
    worst = Math.max(worst, ...keystrokes);
    kit.note(
      `one machine's transcript query on ${INDEX_DOCS.toLocaleString("en-US")} documents (built in ${((performance.now() - built) / 1000).toFixed(0)} s): ${lines.join("; ")}; typing "${typed}" a keystroke at a time: max ${Math.max(...keystrokes).toFixed(1)} ms`
    );
    kit.check(
      "g. one machine's transcript query on a busy machine's index stays under 150 ms (p95, every kind of query, every keystroke)",
      worst < 150,
      `${worst.toFixed(1)} ms`
    );
  } finally {
    index.close();
    await rm(dir, { recursive: true, force: true });
  }
};

const run = async (kit: Kit) => {
  const probe = await standUp(kit);
  await checkNames(probe);
  await checkSaid(probe);
  const call = callFrom(probe);
  await checkMentions(probe, call);
  await checkWaiting(probe, call);
  await checkCoverage(probe);
  await timeNames(probe, `${probe.rows.length + 2} sessions`);
  await timeTranscripts(probe);
  await timeAtScale(probe);
  await timeIndex(probe);
};

const spec: Spec = { name: "find-engine", run };
export default spec;

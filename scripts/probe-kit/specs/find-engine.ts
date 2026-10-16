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
import { mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import type {
  FindAnswer,
  FindConversation,
  WaitingAnswer,
} from "../../../packages/core/src";
import { CLAUDE_DIR_NAME } from "../../../packages/core/src/claude-dirs";
import type { TranscriptDoc } from "../../../packages/jsonl-parser/src";
import { TranscriptIndex } from "../../../packages/jsonl-parser/src/fts5";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec } from "../kit";

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
      const file = join(dir, `${row.sessionId}.jsonl`);
      await writeFile(
        file,
        row.lines
          .map((each, i) => line(row, each.author, each.text, at + i * 1000))
          .join("")
      );
      // Last written when its last line was: the hub reads a conversation's
      // activity from its transcript's mtime as its machine registers.
      const last = new Date(at + row.lines.length * 1000);
      await utimes(file, last, last);
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

/** A routine of the project whose runs are noted in `threadId`: where it opens. */
const ROUTINE = "Weekly lantern audit";
const insertRoutine = (db: Database, projectId: string, threadId: string) => {
  const now = Date.now();
  db.query(
    "INSERT INTO routines (id, project_id, name, cron, time_zone, target, prompt, lands, enabled, created_by, keep, next_slot, thread_id, created_at) VALUES (?, ?, ?, '0 6 * * *', 'UTC', 'delegate', 'Audit the lanterns.', 'none', 1, 'owner', 0, ?, ?, ?)"
  ).run(
    crypto.randomUUID(),
    projectId,
    ROUTINE,
    now + DAY,
    threadId,
    now - DAY
  );
};

/**
 * A delegate's report an hour ago to the person's own session (the
 * orchestrator, `rows[0]`), from one of its children; answers the work
 * item's id and the session it reported to.
 */
const insertReport = (
  db: Database,
  rows: Seeded[]
): { id: string; parent: string } => {
  const parent = rows[0]?.id ?? "";
  const child = rows.find((row) => row.parent === parent)?.id ?? "";
  const id = crypto.randomUUID();
  const now = Date.now();
  db.query(
    `INSERT INTO workspaces (id, machine_id, repo_root, path, branch, state, created_by_instance_id, created_at)
     VALUES (?, ?, '/work/repo', '/work/ws-report', 'ws/report', 'archived', ?, ?)`
  ).run(id, MACHINE, parent, now - 2 * HOUR);
  db.query(
    `INSERT INTO work_items (id, workspace_id, parent_instance_id, instance_id, brief, title, harness, state,
       headline, result, created_at, ended_at)
     VALUES (?, ?, ?, ?, 'Probe the report path', 'Probe the report path', 'claude', 'done',
       'The report path holds', 'Done.', ?, ?)`
  ).run(id, id, parent, child, now - 2 * HOUR, now - HOUR);
  return { id, parent };
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
  /** A report an hour old to the person's own session, not looked at yet. */
  report: { id: string; parent: string };
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
  const { threadId, report } = withDb(dbPath, (db) => {
    insertRows(db, rows, project.id);
    const thread = insertThread(db, project.id);
    insertRoutine(db, project.id, thread);
    return { threadId: thread, report: insertReport(db, rows) };
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
    report,
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
    bare.includes(`"${LIVE_TITLE}" matches 2 sessions`) &&
      // Asleep 20 days: its age is its own, not a sign-in's carry to an account.
      bare.includes("asleep, active 20d ago"),
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

/**
 * d, with Caw on: a thread's handle hands the words to his session, for that
 * thread. Caw starts in his own place's boundary, which a CawCo workspace
 * cannot hold (caw-threads.ts): inside one this step is a NOTE, and the
 * spec is run on a host for it.
 */
const checkCawThread = async (
  probe: Probe,
  call: (name: string, input: object) => Promise<string>
) => {
  const { kit, fleet } = probe;
  if (process.env.CAWCO_WORKSPACE) {
    kit.note(
      "d. a thread's hand-off with Caw on is not run inside a CawCo workspace (Caw's boundary cannot start there); run this spec on a host for it"
    );
    return;
  }
  const home = fleet.env.HOME as string;
  const src = join(fleet.sandbox, "caw-src");
  await mkdir(src, { recursive: true });
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  await Bun.$`git init -q -b main && echo caw > README.md && git add -A && git commit -qm 'First commit'`
    .cwd(src)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Caw desk",
    machineId: MACHINE,
    cwd: src,
    caw: true,
  });
  const started = await fleet.api<{ thread: { id: string } }>(
    `/api/projects/${project.id}/threads`,
    { body: "hello" }
  );
  const lead = await until(
    "Caw's session",
    () =>
      fleet.query<{ lead_instance_id: string | null }>(
        "SELECT lead_instance_id FROM projects WHERE id = ?",
        project.id
      )[0]?.lead_instance_id ?? undefined,
    Boolean,
    180_000
  );
  const answer = await call(HANDOFF, {
    target: `@hello <thread#${started.thread.id.slice(0, 8)}>`,
    message: "PROBE-THREAD-REACHED",
  });
  const reached = await until(
    "the hand-off in Caw's session",
    () =>
      fleet.query<{ instance_id: string }>(
        "SELECT instance_id FROM sent_messages WHERE body LIKE '%PROBE-THREAD-REACHED%'"
      ),
    (rows) => rows.length > 0,
    120_000
  );
  kit.check(
    "d. with Caw on, a thread's handle hands the words to his session for that thread",
    answer.includes("Handed to Caw in the thread “hello”") &&
      reached.every((row) => row.instance_id === lead),
    `${answer.slice(0, 200)} | reached ${reached.map((row) => row.instance_id).join(",")} (lead ${lead})`
  );
};

/**
 * A session the hub never started (run from a terminal), found by name from
 * its machine's catalog, which find reads in the background.
 */
const checkStored = async ({ kit, find, fleet }: Probe) => {
  const sessionId = crypto.randomUUID();
  const terminal: Seeded = {
    id: sessionId,
    sessionId,
    machine: MACHINE,
    title: "",
    cwd: "/work/quokka-lab",
    ageMs: HOUR,
    status: "stopped",
    lines: [
      { author: "user", text: "Investigate the quokka telemetry drift" },
      { author: "assistant", text: "Looking." },
    ],
  };
  await writeTranscripts([terminal], fleet.home);
  const answer = await until(
    "the terminal session by name, from its machine's catalog",
    () => find("q=quokka+telemetry&transcripts=0"),
    (found) =>
      conversations(found).some((each) => each.sessionId === sessionId),
    150_000
  );
  const [top] = conversations(answer);
  kit.check(
    "a. a session the hub never started is found by name, with no handle to mention",
    top?.sessionId === sessionId &&
      top.instanceId === null &&
      top.handle === null &&
      top.dir === "quokka-lab",
    JSON.stringify([top?.title, top?.instanceId, top?.dir])
  );
};

/**
 * e: an artifact waits until a view has it on screen at its revision (the
 * `shown` ack every pane sends while the person looks); new HTML waits again
 * until the view says the page morphed to it. A report waits until the
 * person looks at the session it came to (`/api/seen`, the look every
 * device sends).
 */
const checkWaiting = async (
  { kit, fleet, sender, report }: Probe,
  call: (name: string, input: object) => Promise<string>
) => {
  const created = await call(CREATE, {
    kind: "page",
    name: "find-preview",
    html: "<h1>First</h1>",
  });
  const artifactId = created.match(ANSWERED_ID)?.[1] ?? "";
  const listed = async (id: string) =>
    (await fleet.api<WaitingAnswer>("/api/find/waiting")).items.find(
      (item) => item.id === id
    );
  const shown = () =>
    fleet.api(`/api/instances/${sender}/artifacts/${artifactId}/shown`, {
      client: "find-engine-probe",
      revision: "probe-frame",
      ok: true,
    });
  const before = await listed(artifactId);
  await shown();
  const opened = await listed(artifactId);
  // No view is joined to its doc, so nothing had the new HTML on screen.
  // A field in it, as the nightly's live check had (step h types in it).
  await call(UPDATE, {
    id: artifactId,
    html: '<h1>Second</h1><input id="probe-field" aria-label="Probe field">',
  });
  const revised = await listed(artifactId);
  await shown();
  const reopened = await listed(artifactId);
  kit.check(
    "e. unseen, gone once on screen, back at its new revision until a view shows it",
    before?.why === "unseen" &&
      opened === undefined &&
      revised?.why === "new revision" &&
      revised.revision === 2 &&
      reopened === undefined,
    JSON.stringify([
      before?.why,
      opened?.why,
      revised?.why,
      revised?.revision,
      reopened?.why,
    ])
  );
  const unread = await listed(report.id);
  await fleet.api("/api/seen", { ids: [report.parent], kind: "look" });
  const looked = await listed(report.id);
  kit.check(
    "e. a report waits unread until the session it came to is looked at",
    unread?.kind === "report" &&
      unread.why === "unread" &&
      looked === undefined,
    JSON.stringify([unread?.kind, unread?.why, looked?.why])
  );
};

/** The composer's field, the finder's field in the glass's card, its rows' titles in drawn order, the composer's `@` rows. */
const FIELD = "form.cin textarea";
const JUMP_FIELD = ".glass-face[data-face='jump'] input";
const JUMP_NAMES = () =>
  [
    ...document.querySelectorAll(
      ".glass-face[data-face='jump'] .slot:not([inert] *) .title"
    ),
  ].map((title) => title.textContent?.trim() ?? "");
const AT_ROWS = () =>
  [
    ...document.querySelectorAll(
      "#composer-menu [data-slot='command-item'][data-value]"
    ),
  ].map((row) => row.getAttribute("data-value") ?? "");

/** Whether the finder stands open in the glass's card with its field focused, and how many groups the workspace has. */
const SHELL_STATE = () => {
  const face = document.querySelector(".glass-face[data-face='jump']");
  const standing = !!face && face.closest("[inert]") === null;
  return {
    jump:
      standing &&
      document.activeElement?.tagName === "INPUT" &&
      !!face?.contains(document.activeElement),
    open: standing,
    groups: document.querySelectorAll("[data-leaf]").length,
  };
};

/** The frame of the panel's `title`d iframe, once it stands with `ready` in it. */
const frameOf = async (page: Page, title: string, ready: string) => {
  const handle = await page.waitForSelector(`iframe[title="${title}"]`, {
    state: "attached",
    timeout: 60_000,
  });
  const frame = await handle.contentFrame();
  if (!frame) {
    throw new Error(`the ${title} iframe has no frame`);
  }
  await frame.waitForSelector(ready, { timeout: 60_000 });
  return frame;
};

/**
 * h: the dashboard names things as the hub ranks them: Jump's first row for
 * words in any order is the hub's first, and the composer's `@` offers the
 * hub's handles in its order, never this conversation's own; choosing one
 * writes the handle a mention reaches. And the shell's shortcuts hold with
 * the keyboard inside an artifact's page (core `SHELL_SHORTCUTS`): a page
 * that leaves ⌘K alone gives Jump, a canvas keeps it (Excalidraw's link
 * editor claims it), and a combo the canvas leaves alone (⌘\) reaches the
 * shell from there.
 */
const checkScreens = async (
  { kit, fleet, sender, live, find, threadId }: Probe,
  call: (name: string, input: object) => Promise<string>
) => {
  const base = await fleet.dashboard();
  const page = await kit.page("desk");
  // Two conversations open in one group, the sender's in front: what ⌘\ splits.
  const ws = {
    v: 1,
    root: { t: "l", id: "probe-leaf", tabs: [live, sender], active: sender },
    focusedLeaf: "probe-leaf",
    ctx: {},
  };
  await page.context().addCookies([
    {
      name: "cawco-workspace",
      value: encodeURIComponent(JSON.stringify(ws)),
      url: base,
    },
  ]);
  await page.context().addInitScript((w) => {
    localStorage.setItem("cawco-workspace", JSON.stringify(w));
  }, ws);
  await open(page, `${base}/session/${sender}`, FIELD);
  const words = "harness quiet boundary";
  const hub = await find(
    `q=${encodeURIComponent(words)}&transcripts=0&kinds=project,thread,machine,conversation`
  );
  // The panel's page (the agent's page from step e), served from the agent's
  // preview port, an origin other than the dashboard's, as deployed. With the
  // keyboard in its field, which leaves the combos alone: ⌘K gives Jump and
  // ⌘⇧N the New Session dialog.
  const pageFrame = await frameOf(page, "Preview", "#probe-field");
  const origins = {
    dashboard: new URL(page.url()).origin,
    page: new URL(pageFrame.url()).origin,
  };
  const pressInField = async <T>(
    combo: string,
    label: string,
    read: () => Promise<T>,
    done: (value: T) => boolean
  ) => {
    // Clicked until the field holds the keyboard: a page still settling
    // from its morph can drop the first click's focus.
    const focused = await until(
      "the page's field focused",
      async () => {
        await pageFrame.click("#probe-field");
        return (
          (await page.evaluate(
            () => document.activeElement?.tagName === "IFRAME"
          )) &&
          (await pageFrame.evaluate(
            () => document.activeElement?.id === "probe-field"
          ))
        );
      },
      Boolean,
      10_000
    ).catch(() => false);
    await page.keyboard.press(combo);
    const after = await until(label, read, done, 10_000).catch(read);
    await page.keyboard.press("Escape");
    await until("the card shut", read, (value) => !done(value), 10_000).catch(
      read
    );
    return { focused, after };
  };
  const fieldK = await pressInField(
    "Control+k",
    "Jump from the field's ⌘K",
    () => page.evaluate(SHELL_STATE),
    (state) => state.jump
  );
  const NEW_SESSION = "[role='dialog'][aria-label='New Session']";
  const fieldN = await pressInField(
    "Control+Shift+N",
    "New Session from the field's ⌘⇧N",
    () => page.evaluate((s) => document.querySelector(s) !== null, NEW_SESSION),
    Boolean
  );
  kit.check(
    "h. in a field of an agent's page artifact on another origin, ⌘K opens Jump and ⌘⇧N New Session",
    origins.page !== origins.dashboard &&
      fieldK.focused &&
      fieldK.after.jump &&
      fieldN.focused &&
      fieldN.after,
    JSON.stringify({ origins, fieldK, fieldN })
  );
  // ⌘K with the keyboard on the page outside its field: Jump opens, its
  // field focused.
  await pageFrame.click("h1");
  const inPage = await page.evaluate(
    () => document.activeElement?.tagName === "IFRAME"
  );
  await page.keyboard.press("Control+k");
  const fromPage = await until(
    "Jump from the page's ⌘K",
    () => page.evaluate(SHELL_STATE),
    (state) => state.jump,
    10_000
  ).catch(() => page.evaluate(SHELL_STATE));
  kit.check(
    "h. ⌘K with the keyboard in an agent's page artifact opens Jump, its field focused",
    inPage && fromPage.jump,
    JSON.stringify({ inPage, after: fromPage })
  );
  await page.focus(JUMP_FIELD);
  await page.keyboard.type(words);
  const jumped = await until(
    "Jump's rows for the words",
    () => page.evaluate(JUMP_NAMES),
    (names) => names[0] === hub.results[0]?.title,
    20_000
  ).catch(() => page.evaluate(JUMP_NAMES));
  kit.check(
    "h. Jump's first row for words in any order is the hub's first",
    jumped[0] === "Boundary quiet harness fix" &&
      jumped[0] === hub.results[0]?.title,
    JSON.stringify([hub.results[0]?.title, jumped.slice(0, 3)])
  );
  await page.keyboard.press("Escape");
  const mention = await find(
    "q=boundary&transcripts=0&kinds=thread,conversation,machine"
  );
  const handles = mention.results
    .filter(
      (result) =>
        result.handle !== null &&
        !(result.kind === "conversation" && result.instanceId === sender)
    )
    .map((result) => `@${result.handle}`);
  await page.focus(FIELD);
  await page.keyboard.type("@boundary");
  const offered = await until(
    "the composer's @ rows",
    () => page.evaluate(AT_ROWS),
    (rows) => rows.length > 0 && rows[0] === handles[0],
    20_000
  ).catch(() => page.evaluate(AT_ROWS));
  await page.keyboard.press("Enter");
  const written = await page.inputValue(FIELD);
  kit.check(
    "h. the composer's @ offers the hub's handles in its order, and writes the one chosen",
    offered.length > 0 &&
      offered.every((row, i) => row === handles[i]) &&
      !offered.some((row) => row.endsWith(sender.slice(0, 8))) &&
      written === `${handles[0]} `,
    JSON.stringify([handles.slice(0, 3), offered.slice(0, 3), written])
  );
  // A canvas in the panel, with the keyboard on its drawing.
  await call(CREATE, {
    kind: "canvas",
    name: "find-sketch",
    mermaid: "flowchart LR; A --> B",
  });
  // Excalidraw draws on two canvases; the interactive one, on top, takes the pointer.
  const DRAWING = "canvas.excalidraw__canvas.interactive";
  const canvas = await frameOf(page, "Canvas", DRAWING);
  // What the canvas made of each key: heard first (Excalidraw stops a key it
  // claims from reaching any later listener) and read once its dispatch is
  // over. The overlay prevents only what the page left alone, so a combo
  // the canvas left reads as prevented too, by the overlay, and the shell
  // acting on it is what tells the two apart.
  await canvas.evaluate(() => {
    const seen: KeyboardEvent[] = [];
    (window as unknown as { probeKeys: KeyboardEvent[] }).probeKeys = seen;
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.ctrlKey && event.key !== "Control") {
          seen.push(event);
        }
      },
      true
    );
  });
  const box = await (await canvas.$(DRAWING))?.boundingBox();
  await canvas.click(DRAWING, {
    position: { x: 12, y: Math.max(12, (box?.height ?? 200) - 12) },
  });
  const before = await page.evaluate(SHELL_STATE);
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(1000);
  const afterK = await page.evaluate(SHELL_STATE);
  await page.keyboard.press("Control+\\");
  const afterSplit = await until(
    "the split from the canvas's ⌘\\",
    () => page.evaluate(SHELL_STATE),
    (state) => state.groups > before.groups,
    10_000
  ).catch(() => page.evaluate(SHELL_STATE));
  const keys = await canvas.evaluate(() =>
    (window as unknown as { probeKeys: KeyboardEvent[] }).probeKeys.map(
      (event) => `${event.key}:${event.defaultPrevented}`
    )
  );
  kit.check(
    "h. a canvas keeps ⌘K (Excalidraw claims it, Jump stays shut); its ⌘\\, left alone, splits the group",
    keys.includes("k:true") &&
      !afterK.open &&
      keys.some((key) => key.startsWith("\\:")) &&
      afterSplit.groups === before.groups + 1,
    JSON.stringify({ keys, before, afterK, afterSplit })
  );
  // A routine opens into the thread its runs are noted in.
  await page.click("[data-share='jump']");
  await page.waitForSelector(JUMP_FIELD);
  await page.fill(JUMP_FIELD, "routine lantern");
  const listed = await until(
    "the routine in Go-to",
    () => page.evaluate(JUMP_NAMES),
    (names) => names[0] === ROUTINE,
    20_000
  ).catch(() => page.evaluate(JUMP_NAMES));
  await page.press(JUMP_FIELD, "Enter");
  const landed = await until(
    "the routine's thread",
    () => new URL(page.url()).pathname,
    (path) => path === `/session/thread:${threadId}`,
    20_000
  ).catch(() => new URL(page.url()).pathname);
  kit.check(
    "h. ↵ on a routine in the finder opens the thread its runs are noted in",
    listed[0] === ROUTINE && landed === `/session/thread:${threadId}`,
    JSON.stringify({ listed: listed.slice(0, 3), landed })
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

/**
 * f: a machine whose index is catching up (a catch-up of 200 MB of new
 * transcripts, longer than a search waits) still answers, from what it holds,
 * and says it is indexing.
 */
const checkCatchUp = async ({ kit, find, other }: Probe) => {
  const filler = "the rail and the relay and the stages ".repeat(120);
  const rows = Array.from({ length: 4000 }, (_, i) =>
    seeded(OTHER, `bulk ${i}`, `/work/bulk-${i % 40}`, DAY, "stopped", [
      ...Array.from({ length: 6 }, () => ({
        author: "user" as const,
        text: filler,
      })),
    ])
  );
  await writeTranscripts(rows, other.home);
  // Past the index's freshness (search/index.ts SEARCH_FRESH_MS), so the search syncs.
  await Bun.sleep(11_000);
  const answer = await find("q=zephyrine&kinds=conversation");
  const bulk = answer.coverage.machines.find(
    (each) => each.machineId === OTHER
  );
  kit.check(
    "f. a machine catching up its index answers from what it holds, and says it is indexing",
    bulk?.answered === true && bulk.indexing === true,
    JSON.stringify(bulk)
  );
};

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
  await checkCawThread(probe, call);
  await checkStored(probe);
  await checkWaiting(probe, call);
  await checkScreens(probe, call);
  await checkCoverage(probe);
  await timeNames(probe, `${probe.rows.length + 2} sessions`);
  await timeTranscripts(probe);
  await timeAtScale(probe);
  await timeIndex(probe);
  await checkCatchUp(probe);
};

const spec: Spec = { name: "find-engine", run };
export default spec;

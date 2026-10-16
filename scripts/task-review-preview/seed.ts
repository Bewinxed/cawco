/**
 * Seeds the task-review probe's scratch fleet (TASK_REVIEW_INFO): a
 * project with a checkout on the scratch machine and the code stages
 * (ready, working, review, done), its folder's files, then a real session
 * per task whose result (results.ts) is written on its work item as
 * `task_result` keeps it:
 * - tsk-1, the Build in Public post: files only (the post's file and its
 *   plan), so its words are the stage and the files its attachments;
 * - tsk-2, the launch announcement: its session presented a page artifact
 *   drawing the post (made through the hub's artifact API, as
 *   artifact_create makes one), its primary, with a file and a link;
 * - tsk-3, launch week: six files;
 * - tsk-4, the links checked: words only;
 * - tsk-5, the changelog: two sessions, the second after your comment;
 * - tsk-6, the card image: done;
 * - tsk-7, the launch thread: its session failed (Try again);
 * - tsk-8, a session asking you (a live Bash ask); tsk-9 waiting on tsk-1;
 *   tsk-10 plain; Caw's note on tsk-1 and a Caw thread naming tsk-1.
 * What the hub's API has no way to write (the attempts' rows, the image's
 * bytes, the thread) goes into its database or folder directly. A
 * delegate's workspace cannot start in a fleet run inside a workspace (the
 * host's AppArmor `bwrap-userns-restrict` refuses a boundary inside
 * another), so the attempts' rows are written here, not started.
 */
import { Database } from "bun:sqlite";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { photo } from "../probe-kit/specs/web/oui-mockup/bytes";
import { ANNOUNCEMENT, RESULTS } from "./results";

/** The fleet's info.json, which the probe writes and TASK_REVIEW_INFO names. */
const infoPath = process.env.TASK_REVIEW_INFO;
if (!infoPath) {
  throw new Error("Name the fleet's info.json in TASK_REVIEW_INFO.");
}
const here = dirname(infoPath);
const info = (await Bun.file(infoPath).json()) as {
  base: string;
  db: string;
  home: string;
  repo: string;
  sandbox: string;
  workdir: string;
};

const api = async <T>(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST"
): Promise<T> => {
  const response = await fetch(`${info.base}${path}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path}: ${response.status} ${text}`);
  }
  return JSON.parse(text) as T;
};

const write = (sql: string, ...params: (string | number | null)[]) => {
  const db = new Database(info.db);
  try {
    db.exec("PRAGMA busy_timeout = 15000");
    db.query(sql).run(...params);
  } finally {
    db.close();
  }
};
/** A read beside the running hub's: a moment it holds the file is no reading yet. */
const read = <T>(sql: string, ...params: (string | number)[]): T[] => {
  try {
    const db = new Database(info.db, { readonly: true });
    try {
      return db.query(sql).all(...params) as T[];
    } finally {
      db.close();
    }
  } catch {
    return [];
  }
};
const waitFor = async <T>(
  label: string,
  look: () => T | undefined | Promise<T | undefined>,
  ms = 240_000
): Promise<T> => {
  const until = Date.now() + ms;
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: polling
    const value = await look();
    if (value !== undefined) {
      return value;
    }
    if (Date.now() > until) {
      throw new Error(`${label}: not within ${ms / 1000}s`);
    }
    await Bun.sleep(1000);
  }
};

// --- the project, with a checkout on the scratch machine -----------------------

const stale = (
  await api<{ id: string; name: string }[]>("/api/projects")
).filter((one) => one.name === "Caw&Co launch");
await Promise.all(
  stale.map((old) => api(`/api/projects/${old.id}`, undefined, "DELETE"))
);
const project = await api<{ id: string }>("/api/projects", {
  name: "Caw&Co launch",
  caw: false,
  template: "code",
  machineId: "scratch-fleet",
  cwd: info.repo,
});
const at = `/api/projects/${project.id}`;
console.log(`project ${project.id}`);
const put = (path: string, content: string, message?: string) =>
  api(`${at}/folder/file`, { path, content, message }, "PUT");

// --- the folder's files the attempts hand in -----------------------------------

const post = (text: string, extra: object = {}) =>
  `${JSON.stringify({ kind: "x-post", account: "@CawCoDev", text, ...extra }, null, 2)}\n`;
const T1_POST = post(
  "My coding agents used to live in a wall of terminal tabs across several machines. When one stopped on a permission prompt, I found out late.\n\nNow every session sits on one Caw&Co board, and the one that needs me says so.",
  {
    alternates: [
      "Which terminal tab had the agent waiting on me? I usually found out late.",
      "I had a terminal tab for every agent session, spread over several machines.",
    ],
    media: {
      plan: "20–30 s real capture: a wall of terminal tabs with one on a permission prompt, then /session with sessions from two machines, approve it from Caw's panel, end on a board with nothing waiting.",
      files: [],
    },
    community: "Build in Public",
  }
);
const T1_PLAN =
  "# Build in Public: one board for every agent\n\n**Goal.** One honest post about the problem Caw&Co solved for us, for the Build in Public community, from @CawCoDev.\n\n## Angle\n\n- Open on the pain everyone running agents knows: the session that stopped on a permission prompt, found an hour late.\n- Close on the board, and the one session that says it needs you.\n- No feature list. One problem, one picture.\n\n## Capture (20–30 s, real, no mock-ups)\n\n1. A wall of terminal tabs; one sits on a permission prompt.\n2. Cut to /session: sessions from obelisk and the MacBook on one board.\n3. Approve the waiting one from Caw's panel.\n4. End on the board with nothing waiting.\n\n## Timing\n\nThursday 09:00 Riyadh, after the launch thread goes out.\n";
await put("tsk-1.post.json", T1_POST);
await put("tsk-1.plan.md", T1_PLAN);
// Where the hub copies a finished attempt's outputs (work-items.ts
// `outputsFolder`), which the task's outputs route serves.
await put("assets/tsk-1/tsk-1.post.json", T1_POST);
await put("assets/tsk-1/tsk-1.plan.md", T1_PLAN);
await put(
  "kit/press-notes.md",
  "# Press notes\n\n- **Launch:** Thursday 16 October, 09:00 Riyadh.\n- **What it is:** a self-hosted board for coding agents across machines.\n- **Who it's for:** people running Claude Code, OpenCode or pi on more than one machine.\n- **Contact:** @CawCoDev.\n"
);
await put(
  "week/day-1.post.json",
  post(
    "Day 1 of launch week: the board. Every session on every machine, and the one that needs you on top."
  )
);
await put(
  "week/day-2.post.json",
  post(
    "Day 2: answering an agent from your phone. The permission prompt reaches Telegram; you approve, it carries on."
  )
);
await put(
  "week/schedule.md",
  "# Launch week\n\n| Day | What | Where |\n| --- | --- | --- |\n| Mon | The board | X, Build in Public |\n| Tue | Answer from your phone | X |\n| Wed | FAQ goes up | Site |\n| Thu | Show HN | HN |\n"
);
await put(
  "week/faq.md",
  "# FAQ\n\n**Does it run my agents in the cloud?** No: on your own machines, joined over your tailnet.\n\n**Which harnesses?** Claude Code, OpenCode and pi.\n"
);
await put(
  "changelog.md",
  "## Launch\n\n- One board for every session on every machine\n- Needs you, with the way to act\n- Answer from Telegram\n- Projects and their tasks\n- Caw, the project's lead\n"
);

// The image's bytes go onto the folder's disk: the folder API writes text.
// Drawn from bytes, not a browser: a seed needs a picture, not a renderer.
const folder = join(info.db, "..", "projects", project.id);
await writeFile(join(folder, "launch-card.png"), photo());
await Bun.$`git -C ${folder} add launch-card.png && git -C ${folder} -c user.email=you@cawco.local -c user.name=you commit -q -m "The launch card"`
  .quiet()
  .nothrow();

/** The announcement as its session drew it: the post's words, then its card image. */
const ANNOUNCEMENT_PAGE = [
  '<!doctype html><html lang="en"><head><meta charset="utf-8">',
  "<title>The announcement</title>",
  "<style>body{margin:0;padding:32px 20px;font:16px/1.5 system-ui,sans-serif}",
  "main{max-width:560px;margin:0 auto}",
  "h1{font-size:15px;margin:0 0 12px}",
  "figure{margin:16px 0 0;padding:24px;border-radius:12px;background:#16181d;color:#f3f1ec}</style>",
  "</head><body><main>",
  "<h1>@CawCoDev</h1>",
  "<p>Caw&amp;Co is out: one board for every coding agent on every machine you run them on. The session that needs you says so, and you can answer it from your phone.</p>",
  "<figure><strong>One board for every agent, on every machine.</strong></figure>",
  "</main></body></html>",
].join("");

// --- the tasks -----------------------------------------------------------------

interface Made {
  id: string;
  path: string;
  title: string;
}
const task = (body: { title: string } & Record<string, unknown>) =>
  api<Made>(`${at}/tasks`, { lands: "none", ...body });
const t1 = await task({
  title: "Build in Public post: one board for every agent",
  description:
    "A post for the Build in Public community on the problem Caw&Co solved: agents waiting on us in tabs we could not see.",
  outputs: ["tsk-1.post.json", "tsk-1.plan.md"],
  labels: ["x", "launch"],
});
const t2 = await task({
  title: ANNOUNCEMENT,
  description: "The one post that says Caw&Co is out, from @CawCoDev.",
  labels: ["x", "launch"],
});
const t3 = await task({ title: "Launch week assets", labels: ["launch"] });
const t4 = await task({ title: "Check the launch links", labels: ["launch"] });
const t5 = await task({ title: "Write the changelog entry" });
const t6 = await task({ title: "Launch card image", labels: ["launch"] });
const t7 = await task({
  title: "Launch thread: the board on a phone",
  description:
    "Five posts on running the fleet from a phone: the board, Needs you, approving from Telegram.",
  labels: ["x", "launch"],
});
const t8 = await task({
  title: "Schedule the launch posts",
  description: "Queue the launch posts for Thursday 09:00.",
  labels: ["launch"],
});
const t9 = await task({
  title: "Show HN: Caw&Co",
  after: [t1.id],
  description: "Goes out once the Build in Public post has landed.",
});
const t10 = await task({ title: "Reply to week-one comments" });
const all = [t1, t2, t3, t4, t5, t6, t7, t8, t9, t10];
console.log(all.map((t) => `${t.id} ${t.title}`).join("\n"));

// --- the sessions -----------------------------------------------------------------

const socket = new WebSocket(`${info.base.replace("http", "ws")}/ws/dashboard`);
await new Promise<void>((done, fail) => {
  socket.onopen = () => done();
  socket.onerror = () => fail(new Error("the dashboard socket did not open"));
});
const statusOf = (id: string) =>
  read<{ status: string }>("SELECT status FROM instances WHERE id = ?", id)[0]
    ?.status;
const spawn = async (
  title: string,
  permissionMode: string,
  extra: object = {}
): Promise<string> => {
  const instanceId = crypto.randomUUID();
  socket.send(
    JSON.stringify({
      verb: "spawn",
      machineId: "scratch-fleet",
      instanceId,
      requestId: crypto.randomUUID(),
      payload: {
        instanceId,
        cwd: info.workdir,
        harness: "claude",
        model: "claude-haiku-4-5",
        title,
        permissionMode,
        ...extra,
      },
    })
  );
  await waitFor(`${title} running`, () =>
    statusOf(instanceId) === "running" ? true : undefined
  );
  return instanceId;
};
const send = (instanceId: string, text: string) =>
  socket.send(
    JSON.stringify({
      type: "command",
      commandId: crypto.randomUUID(),
      kind: "send",
      machineId: "scratch-fleet",
      sessionId: instanceId,
      payload: {
        instanceId,
        message: {
          type: "user",
          uuid: crypto.randomUUID(),
          message: { role: "user", content: text },
          parent_tool_use_id: null,
          origin: { kind: "human" },
        },
      },
    })
  );

/** How many of the fleet's Claude Code session files hold `words`. */
const sessionFiles = async (words: string): Promise<number> => {
  // Interpolated, so Bun's shell does not take the pattern for a glob.
  const found =
    await Bun.$`grep -rlF ${"--include=*.jsonl"} ${words} ${info.home}`
      .quiet()
      .nothrow()
      .text();
  return found.split("\n").filter(Boolean).length;
};

/** An attempt's rows: its workspace and its work item, at a task. */
const row = (
  id: string,
  taskId: string,
  instanceId: string,
  title: string,
  state: string,
  created: number,
  ended: number | null,
  error: string | null
) => {
  write(
    "INSERT OR REPLACE INTO workspaces (id, machine_id, repo_root, path, branch, base, state, created_by_instance_id, created_at) VALUES (?, 'scratch-fleet', ?, ?, ?, 'main', 'active', 'hub', ?)",
    `ws-${id}`,
    info.workdir,
    info.workdir,
    `ws/${id}`,
    created
  );
  write(
    "INSERT OR REPLACE INTO work_items (id, workspace_id, parent_instance_id, instance_id, brief, title, task_id, project_id, origin, lands, harness, state, error, created_at, ended_at) VALUES (?, ?, 'hub', ?, ?, ?, ?, ?, 'hook', 'none', 'claude', ?, ?, ?, ?)",
    id,
    `ws-${id}`,
    instanceId,
    title,
    title,
    taskId,
    project.id,
    state,
    error,
    created,
    ended
  );
};

/**
 * One attempt: a real session whose conversation is the attempt's (the
 * brief's first line, a look around, its words), its work item's row, and
 * then the result handed in on that row as `task_result` keeps it. A
 * delegate's workspace cannot start in a fleet run inside a workspace (the
 * host's AppArmor `bwrap-userns-restrict` refuses a boundary inside
 * another), so the hub's own `task_start` cannot run here.
 */
const attempt = async (made: Made, again = false) => {
  const plan = RESULTS[made.title];
  if (!plan) {
    throw new Error(`no result planned for ${made.title}`);
  }
  const handed = again && plan.again ? plan.again : plan.first;
  const said = handed.summary.slice(0, 48);
  const before = await sessionFiles(said);
  // Titled as the hub titles a delegate: its work item's title, the task's.
  const session = await spawn(made.title, "bypassPermissions");
  const id = `wi-${made.id}-${again ? 2 : 1}`;
  const started = Date.now();
  row(id, made.id, session, made.title, "running", started, null, null);
  send(
    session,
    `Your work item is an attempt at ${made.id}, “${made.title}”, a task of the project Caw&Co launch. This brief is its task file as it stands.${again ? "\n\n## Comments since the last attempt\n\n**you**: Split it into bullets, newest first." : ""}`
  );
  // Its conversation ended on its words: Claude Code's own session file
  // holds them (the mock answers in milliseconds, under any poll of the row).
  await waitFor(`${made.id}'s words`, async () =>
    (await sessionFiles(said)) > before ? true : undefined
  );
  // The announcement's session shows its work as a page, as the brief asks
  // (artifact_create's route), and hands that page in first.
  const presented =
    made.title === ANNOUNCEMENT
      ? [
          {
            kind: "artifact" as const,
            artifactId: (
              await api<{ id: string }>(`/api/instances/${session}/artifacts`, {
                kind: "page",
                name: "launch-announcement",
                html: ANNOUNCEMENT_PAGE,
              })
            ).id,
            name: "The announcement",
            primary: true,
          },
        ]
      : [];
  const result = {
    summary: handed.summary,
    check: handed.check ?? [],
    artifacts: [...presented, ...handed.artifacts],
    at: Date.now(),
  };
  write(
    "UPDATE work_items SET state = 'done', ended_at = ?, task_result = ? WHERE id = ?",
    Date.now(),
    JSON.stringify(result),
    id
  );
  console.log(`${made.id}: attempt ${again ? 2 : 1} by ${session}, handed in`);
};
for (const one of [t1, t2, t3, t4, t5, t6]) {
  // biome-ignore lint/performance/noAwaitInLoops: one attempt at a time
  await attempt(one);
}
// The changelog's second attempt, after your comment.
await api(`${at}/tasks/${t5.id}/comments`, {
  text: "Split it into bullets, newest first.",
});
await attempt(t5, true);

// Where each stands now: in review, but the card, which is done.
const stageOf = async (id: string) =>
  (await api<{ stage: string }>(`${at}/tasks/${id}`)).stage;
for (const one of [t1, t2, t3, t4, t5]) {
  // biome-ignore lint/performance/noAwaitInLoops: one move at a time
  if ((await stageOf(one.id)) !== "review") {
    await api(`${at}/tasks/${one.id}/stage`, { stage: "review" });
  }
}
if ((await stageOf(t6.id)) !== "done") {
  await api(`${at}/tasks/${t6.id}/stage`, { stage: "done" });
}

// Caw's note on tsk-1, committed as the hub commits a lead's comment
// (task-history.ts TRAILERS) before the file on disk changes: the hub's
// scan, reading the file first, would take it as a hand edit.
const file = await api<{ content: string }>(
  `${at}/folder/file?path=${encodeURIComponent(t1.path)}`
);
const staged = join(info.sandbox, "caw-note.md");
await writeFile(
  staged,
  `${file.content.trimEnd()}\n\n## Comments\n\n### Caw · lead · ${new Date(Date.now() - 18 * 60_000).toISOString()}\n\nDrafted from the plan beside it. The first paragraph has two alternates if you want it shorter; the capture is 20–30 s of the real board, no mock-ups.\n`
);
const blob = (
  await Bun.$`git -C ${folder} hash-object -w ${staged}`.text()
).trim();
await Bun.$`git -C ${folder} update-index --cacheinfo 100644,${blob},${t1.path} && git -C ${folder} -c user.name=Caw -c user.email=noreply@cawco.invalid commit -q -m ${`task ${t1.id}: comment (by Caw)`} -m ${"CawCo-Actor: lead\nCawCo-Mover: lead\nCawCo-Change: comment"} && git -C ${folder} checkout HEAD -- ${t1.path}`.quiet();

// --- a failed attempt and an asking session, as their rows ----------------------

const failedSession = await spawn(
  "Draft the launch thread",
  "bypassPermissions"
);
send(
  failedSession,
  "Draft the launch thread: five posts on running the fleet from a phone."
);
const askingSession = await spawn("Schedule the launch posts", "default");
send(askingSession, "Schedule the launch posts for Thursday 09:00.");
await waitFor("the ask raised", () =>
  read<{ request_id: string }>(
    "SELECT request_id FROM parked_asks WHERE instance_id = ?",
    askingSession
  ).length > 0
    ? true
    : undefined
).catch(async () =>
  waitFor("the ask raised", async () =>
    JSON.stringify(await api<unknown[]>("/api/pending")).includes(askingSession)
      ? true
      : undefined
  )
);
const now = Date.now();
row(
  "wi-preview-failed",
  t7.id,
  failedSession,
  "Draft the launch thread",
  "failed",
  now - 52 * 60_000,
  now - 41 * 60_000,
  "The check `bun scripts/check-thread.ts` failed: post 3 is 312 characters, over X's 280."
);
row(
  "wi-preview-asking",
  t8.id,
  askingSession,
  "Schedule the launch posts",
  "running",
  now - 6 * 60_000,
  null,
  null
);

// --- the Caw thread ------------------------------------------------------------

const thread = crypto.randomUUID();
const youAt = now - 14 * 60_000;
const cawAt = now - 13 * 60_000;
write(
  "INSERT INTO project_threads (id, project_id, title, setup, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
  thread,
  project.id,
  "Where are we on the launch posts?",
  youAt,
  cawAt
);
write(
  "INSERT INTO thread_messages (id, thread_id, author, body, tasks, created_at) VALUES (?, ?, 'you', ?, NULL, ?)",
  crypto.randomUUID(),
  thread,
  "Where are we on the launch posts?",
  youAt
);
write(
  "INSERT INTO thread_messages (id, thread_id, author, body, tasks, created_at) VALUES (?, ?, 'caw', ?, ?, ?)",
  crypto.randomUUID(),
  thread,
  "The Build in Public post is drafted and waits on your review: the post, two alternates for its opening, and the plan for a 20–30 s capture of the real board. The launch thread's first attempt failed its length check; I'll retry it once you've read this one.",
  JSON.stringify([t1.id]),
  cawAt
);
socket.close();

const out = {
  project: project.id,
  thread,
  tasks: Object.fromEntries(all.map((t) => [t.id, t.title])),
  sessions: { failedSession, askingSession },
};
await writeFile(join(here, "seeded.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
process.exit(0);

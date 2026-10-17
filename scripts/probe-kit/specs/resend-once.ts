/**
 * A send the hub has a record of, sent again under the same id, is the same
 * send: kept once, answered with what was kept. A device sends again when
 * its request got no answer (the app's SendOutbox, id.ts `idForWords`), so
 * each of these routes takes a repeat of an id, at once or later, as one:
 *
 * 1. A project made with a setup prompt (`promptId`, server.ts
 *    `createOrJoinProject`): one project, the same answer.
 * 2. Your words starting a thread, and in it (`id`, caw.ts `once`): one
 *    message, the same thread.
 * 3. "Make a note: …" in a thread (kept after AGENTS.md is committed): one
 *    message, one note of the commit.
 * 4. A view ask (`id`, caw.ts `requestView`): one thread.
 * 5. A comment on a task (`id`, tasks.ts `comment`, task_comment_ids): one
 *    comment.
 *
 * Each is sent twice at the same moment, then once more after both
 * answered. On a scratch fleet (hub, agent and sessiond, a machine online
 * as words to Caw need); whether his own session starts does not matter
 * (the hub keeps your words either way).
 *
 * The hub-accept leg of exactly once; a send the machine's session took
 * already, handed over again, is send-once's.
 *
 *   bun scripts/probe-kit/run.ts resend-once
 */
import type { Reply } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const respond = (): Reply => ({ words: ["Done."], everyMs: 20 });

interface Said {
  message: { id: string };
  thread: { id: string };
}
interface ThreadRead {
  messages: { id: string; body: string; author: string }[];
  thread: { id: string };
}

async function run(kit: Kit): Promise<void> {
  const fleet = await kit.fleet(respond);
  // A machine online: words to Caw are refused while none is ("Caw can't start").
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  /** Sent twice at once, then once more: every answer. */
  const thrice = async <T>(path: string, body: unknown): Promise<T[]> => {
    const both = await Promise.all([
      fleet.api<T>(path, body),
      fleet.api<T>(path, body),
    ]);
    return [...both, await fleet.api<T>(path, body)];
  };

  // ── 1. A project made with its setup prompt ─────────────────────────
  const name = "Send once probe";
  const made = await thrice<{ id: string }>("/api/projects", {
    name,
    caw: true,
    template: "code",
    prompt: "Set this project up for the send-once probe.",
    promptId: crypto.randomUUID(),
  });
  const projects = (
    await fleet.api<{ id: string; name: string }[]>("/api/projects")
  ).filter((project) => project.name === name);
  const projectId = made[0]?.id ?? "";
  kit.check(
    "a setup prompt sent three times makes one project, each answer naming it",
    projects.length === 1 && made.every((each) => each.id === projectId),
    `${projects.length} project(s) named so; answers ${made.map((each) => each.id.slice(0, 8)).join(", ")}`
  );

  const read = (which: string) =>
    fleet.api<ThreadRead>(`/api/projects/${projectId}/threads/${which}`);
  const kept = (holding: ThreadRead, id: string) =>
    holding.messages.filter((message) => message.id === id).length;

  // ── 2. Your words starting a thread, then in it ─────────────────────
  const startId = crypto.randomUUID();
  const started = await thrice<Said>(`/api/projects/${projectId}/threads`, {
    body: "Send-once probe: the thread's first words.",
    id: startId,
  });
  const threadId = started[0]?.thread.id ?? "";
  const sayId = crypto.randomUUID();
  const said = await thrice<Said>(
    `/api/projects/${projectId}/threads/${threadId}/messages`,
    { body: "Send-once probe: words in the thread.", id: sayId }
  );
  const thread = await read(threadId);
  kit.check(
    "words starting a thread, sent three times, are one message in one thread",
    kept(thread, startId) === 1 &&
      started.every((each) => each.thread.id === threadId),
    `${kept(thread, startId)} message(s) under the id; threads ${[...new Set(started.map((each) => each.thread.id.slice(0, 8)))].join(", ")}`
  );
  kit.check(
    "words in a thread, sent three times, are one message",
    kept(thread, sayId) === 1 &&
      said.every((each) => each.message.id === sayId),
    `${kept(thread, sayId)} message(s) under the id`
  );

  // ── 3. "Make a note: …", kept after its commit ──────────────────────
  const noteId = crypto.randomUUID();
  await thrice<Said>(
    `/api/projects/${projectId}/threads/${threadId}/messages`,
    { body: "Make a note: the send-once probe ran here.", id: noteId }
  );
  const noted = await read(threadId);
  const notes = noted.messages.filter((message) =>
    message.body.includes("Added to AGENTS.md")
  ).length;
  kit.check(
    "a note sent three times is one message and one commit to AGENTS.md",
    kept(noted, noteId) === 1 && notes === 1,
    `${kept(noted, noteId)} message(s) under the id; ${notes} commit note(s)`
  );

  // ── 4. A view ask ───────────────────────────────────────────────────
  const viewId = crypto.randomUUID();
  const asked = await thrice<Said>(`/api/projects/${projectId}/view-requests`, {
    text: "Send-once probe: a view of the open tasks.",
    id: viewId,
  });
  const viewThreads = new Set(asked.map((each) => each.thread.id));
  const viewThread = await read(asked[0]?.thread.id ?? "");
  kit.check(
    "a view ask sent three times is one message in one thread",
    viewThreads.size === 1 && kept(viewThread, viewId) === 1,
    `${viewThreads.size} thread(s); ${kept(viewThread, viewId)} message(s) under the id`
  );

  // ── 5. A comment on a task ──────────────────────────────────────────
  const task = await fleet.api<{ id: string }>(
    `/api/projects/${projectId}/tasks`,
    { title: "Send-once probe task" }
  );
  const words = "Send-once probe: one comment, however often it is sent.";
  await thrice<{ id: string }>(
    `/api/projects/${projectId}/tasks/${task.id}/comments`,
    { text: words, id: crypto.randomUUID() }
  );
  const after = await fleet.api<{ comments: { text: string }[] }>(
    `/api/projects/${projectId}/tasks/${task.id}`
  );
  const comments = after.comments.filter(
    (comment) => comment.text === words
  ).length;
  kit.check(
    "a comment sent three times under one id is one comment on the task",
    comments === 1,
    `${comments} comment(s) with those words`
  );
}

export default { name: "resend-once", run } satisfies Spec;

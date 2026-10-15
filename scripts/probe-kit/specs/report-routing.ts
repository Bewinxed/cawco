/**
 * A delegate's report and asks reach the session that started its work, and
 * nowhere else; a project's lead hears only the work he started; a routine's
 * thread takes only its runs; a line that only reads is never asked
 * (hub work-items.ts `reportees`, db `newestConversation`, lead-gate.ts
 * `READERS`). On a scratch fleet (real hub, agent and sessiond; Claude Code
 * against the mock model). Run it where a workspace boundary can start (not
 * inside another one).
 *
 * The owner, 2026-10-15, in Caw's "Routine · Memory curator" thread: "btw i
 * still don't get wtf this thread does and why does it keep asking me for
 * permissions". Every report of the orchestrator's delegates in the project
 * (100 in a day) went to Caw as well, as the project's lead (`reportees`
 * made him a co-parent of every item in his project). Each woke him with no
 * thread, and his asks and notes went to the project's newest conversation:
 * the curator routine's own thread, where Caw and the owner had written. And
 * `ls -la .out … 2>&1 | head -20; file .out 2>/dev/null; head -c 300 .out
 * 2>/dev/null` was asked of the owner, since `file` was not a reader.
 *
 * Project "Routing", Caw on, its place a repository. An "Orchestrator"
 * session works in that same folder and is not the lead. A routine's own
 * thread, with an event note, the owner's words and Caw's, stands newest.
 *
 * a. The orchestrator delegates: its delegate's report reaches it, read, and
 *    never Caw (no send, no delegate event, nothing in his turns).
 * b. The owner starts an attempt from the dashboard: Caw starts it and its
 *    report reaches him, read.
 * c. In that report's turn Caw runs the owner's exact read-only line: it
 *    ran, recorded as a read, and no ask was parked for it.
 * d. Then a line that writes: asked, in thread "main" (the project's
 *    conversation), never the routine's.
 * e. The routine's thread took nothing: its messages are the ones it had.
 *
 *   bun scripts/probe-kit/run.ts report-routing
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const CAW = "You are Caw";
const FINISH = "mcp__cawco__finish_item";
const DELEGATE = "mcp__cawco__delegate";
/** Only an attempt's brief opens this way. */
const BRIEF = "Your work item is an attempt at";
/** Only the orchestrator's delegate's brief carries this. */
const CHILD = "PROBE-ORCH-CHILD";
/** What the orchestrator is told to do. */
const ORCH = "PROBE-ORCH delegate the check";
const ORCH_REPORTED = "PROBE-ORCH-REPORTED the orchestrator's work is done";
const LEAD_REPORTED = "PROBE-LEAD-REPORTED the attempt is done";
/** The owner's command from his screenshot, verbatim. */
const READS =
  "ls -la .out apps/dashboard/.impeccable/ 2>&1 | head -20; file .out 2>/dev/null; head -c 300 .out 2>/dev/null";
const READS_WHY = "Inspect the two untracked paths";
const WRITES = "touch probe-written.txt 2>/dev/null";
const WRITES_WHY = "Write a probe file";
const STAGES =
  "---\nready      todo\nworking    active\nreview     you\ndone       done\ndropped    dropped\nmoves\n  * → *    you, session\nviews\n  board      by stage\n---\n";

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const useTool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});
/** A deferred tool is found first, then called. */
const found = (request: Seen, name: string, input: object): Reply => {
  if (request.toolNames.includes(name)) {
    return useTool(name, input);
  }
  return request.toolNames.includes("ToolSearch")
    ? useTool("ToolSearch", { query: `select:${name}`, max_results: 1 })
    : text(`${name} is not offered`);
};

/** What has been played: the orchestrator's delegate, then Caw's two lines. */
const played: Record<"delegated" | "read" | "wrote", boolean> = {
  delegated: false,
  read: false,
  wrote: false,
};
/** Every Caw request's words: whatever reached his session. */
const cawSaw: string[] = [];
const finished = new Set<string>();
let repo = "";

const caw = (request: Seen): Reply => {
  cawSaw.push(request.all);
  if (!played.read && request.all.includes(LEAD_REPORTED)) {
    played.read = true;
    return useTool("Bash", { command: READS, description: READS_WHY });
  }
  if (played.read && !played.wrote) {
    played.wrote = true;
    return useTool("Bash", { command: WRITES, description: WRITES_WHY });
  }
  return text("ok");
};

/** A delegate: finds finish_item, calls it once with `headline`, then says ok. */
const child = (request: Seen, headline: string): Reply => {
  if (finished.has(headline)) {
    return text("ok");
  }
  const reply = found(request, FINISH, { headline, summary: headline });
  if (reply.tool?.name === FINISH) {
    finished.add(headline);
  }
  return reply;
};

const orchestrator = (request: Seen): Reply => {
  if (played.delegated || !request.all.includes(ORCH)) {
    return text("ok");
  }
  const reply = found(request, DELEGATE, {
    title: "Check the paths",
    prompt: `${CHILD}: finish your item.`,
    cwd: repo,
    checks: [{ name: "Nothing to check", command: "true" }],
    lands: "none",
  });
  if (reply.tool?.name === DELEGATE) {
    played.delegated = true;
  }
  return reply;
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (request.all.includes(CAW)) {
    return caw(request);
  }
  if (request.all.includes(BRIEF)) {
    return child(request, LEAD_REPORTED);
  }
  if (request.all.includes(CHILD)) {
    return child(request, ORCH_REPORTED);
  }
  return orchestrator(request);
};

interface Ask {
  instanceId: string;
  payload: {
    presentation: { command?: string };
    threadId?: string;
    toolName: string;
  };
  requestId: string;
}

const projectOf = async (
  fleet: KitFleet,
  name: string,
  cwd: string
): Promise<{ id: string }> => {
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name,
    machineId: MACHINE,
    cwd,
    caw: true,
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
  repo = join(fleet.sandbox, "code");
  await mkdir(repo, { recursive: true });
  await Bun.$`git init -q -b main && echo code > README.md && git add -A && git commit -qm 'First commit'`
    .cwd(repo)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await projectOf(fleet, "Routing", repo);

  // Thread "main": your words wake Caw, who answers.
  const opened = await fleet.api<{ thread: { id: string } }>(
    `/api/projects/${project.id}/threads`,
    { body: "PROBE-MAIN: hello Caw." }
  );
  const main = opened.thread.id;
  const leadId = (await until(
    "Caw's session",
    () =>
      fleet.query<{ lead_instance_id: string | null }>(
        "SELECT lead_instance_id FROM projects WHERE id = ?",
        project.id
      )[0]?.lead_instance_id ?? undefined,
    (id): id is string => Boolean(id),
    180_000
  )) as string;
  await until(
    "Caw answered in main",
    () =>
      fleet.query<{ n: number }>(
        "SELECT count(*) AS n FROM thread_messages WHERE thread_id = ? AND author = 'caw'",
        main
      )[0]?.n ?? 0,
    (n) => n > 0,
    180_000
  );

  // A routine's own thread, as the Memory curator's stood: its run's note,
  // then the owner's words and Caw's in it, newest by an hour.
  const routineThread = crypto.randomUUID();
  const later = Date.now() + 3_600_000;
  fleet.write(
    "INSERT INTO project_threads (id, project_id, title, setup, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
    routineThread,
    project.id,
    "Routine · Memory curator · 06:00",
    later,
    later
  );
  fleet.write(
    "INSERT INTO routines (id, project_id, name, cron, time_zone, target, prompt, lands, enabled, created_by, keep, next_slot, thread_id, created_at) VALUES (?, ?, 'Memory curator', '0 6 * * *', 'UTC', 'delegate', 'Curate.', 'none', 0, 'owner', 0, ?, ?, ?)",
    crypto.randomUUID(),
    project.id,
    later + 86_400_000,
    routineThread,
    later
  );
  for (const [author, body, at] of [
    ["event", "", later],
    ["caw", "tsk-7 and tsk-15 are in.", later + 1],
    ["you", "no idea what ur talking about ask the main agent", later + 2],
  ] as const) {
    fleet.write(
      "INSERT INTO thread_messages (id, thread_id, author, body, note_title, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      crypto.randomUUID(),
      routineThread,
      author,
      body,
      author === "event" ? "Routine · Memory curator · 06:00" : null,
      at
    );
  }
  const routineMessages = () =>
    fleet.query<{ n: number }>(
      "SELECT count(*) AS n FROM thread_messages WHERE thread_id = ?",
      routineThread
    )[0]?.n ?? 0;
  const routineBefore = routineMessages();

  /** The sends `from` made to `to`, as the hub kept them. */
  const sendsTo = (to: string, from: string) =>
    fleet.query<{ state: string }>(
      "SELECT state FROM sent_messages WHERE instance_id = ? AND json_extract(body, '$.origin.fromSession') = ? ORDER BY accepted_at",
      to,
      from
    );
  const reportEvents = (from: string) =>
    fleet.query<{ parent_instance_id: string }>(
      "SELECT parent_instance_id FROM delegate_events WHERE instance_id = ? AND kind = 'report'",
      from
    );

  // ── a. an orchestrator in the project's folder delegates ──────────────
  const orch = await fleet.spawn("claude", "Orchestrator", repo, {
    projectId: project.id,
  });
  await fleet.send(orch, ORCH);
  const orchChild = (await until(
    "a: the orchestrator's delegate",
    () =>
      fleet.query<{ instance_id: string; project_id: string | null }>(
        "SELECT instance_id, project_id FROM work_items WHERE parent_instance_id = ?",
        orch
      )[0],
    Boolean,
    180_000
  )) as { instance_id: string; project_id: string | null };
  await until(
    "a: its report read by the orchestrator",
    () => sendsTo(orch, orchChild.instance_id)[0],
    (row) => row?.state === "read",
    300_000
  );
  // Both deliveries go out in one pass: give any to Caw time to be read.
  await Bun.sleep(5000);
  const aEvents = reportEvents(orchChild.instance_id);
  const aToCaw = sendsTo(leadId, orchChild.instance_id);
  kit.check(
    "a: the orchestrator's delegate (in the lead's project) reports to the orchestrator and never to Caw",
    orchChild.project_id === project.id &&
      aEvents.length > 0 &&
      aEvents.every((one) => one.parent_instance_id === orch) &&
      aToCaw.length === 0 &&
      !cawSaw.some((words) => words.includes(ORCH_REPORTED)),
    JSON.stringify({
      project: orchChild.project_id,
      events: aEvents,
      toCaw: aToCaw,
      cawSaw: cawSaw.some((words) => words.includes(ORCH_REPORTED)),
    })
  );

  // ── b. the owner's attempt: Caw starts it and hears its report ─────────
  const task = await fleet.api<{ id: string }>(
    `/api/projects/${project.id}/tasks`,
    { title: "Inspect the paths", stage: "ready" }
  );
  await fleet.api(`/api/projects/${project.id}/tasks/${task.id}/attempts`, {});
  const attempt = (await until(
    "b: the attempt's item",
    () =>
      fleet.query<{ instance_id: string; parent_instance_id: string }>(
        "SELECT instance_id, parent_instance_id FROM work_items WHERE task_id = ? AND project_id = ?",
        task.id,
        project.id
      )[0],
    Boolean,
    180_000
  )) as { instance_id: string; parent_instance_id: string };
  await until(
    "b: its report read by Caw",
    () => sendsTo(leadId, attempt.instance_id)[0],
    (row) => row?.state === "read",
    300_000
  );
  const bEvents = reportEvents(attempt.instance_id);
  kit.check(
    "b: the attempt Caw started reports to Caw, its parent, alone",
    attempt.parent_instance_id === leadId &&
      bEvents.length > 0 &&
      bEvents.every((one) => one.parent_instance_id === leadId),
    JSON.stringify({ parent: attempt.parent_instance_id, events: bEvents })
  );

  // ── c. the owner's read-only line, from a report's wake: never asked ──
  let askedReads = 0;
  const pending = async (): Promise<Ask[]> =>
    (await fleet.api<Ask[]>("/api/pending")).filter(
      (one) => one.instanceId === leadId && one.payload.toolName === "Bash"
    );
  const watch = setInterval(() => {
    pending()
      .then((asks) => {
        askedReads += asks.filter(
          (one) => one.payload.presentation.command === READS
        ).length;
      })
      .catch(() => undefined);
  }, 250);
  const card = await until(
    "d: the card for the write",
    pending,
    (asks) => asks.some((one) => one.payload.presentation.command === WRITES),
    300_000
  ).then(
    (asks) =>
      asks.find((one) => one.payload.presentation.command === WRITES) as Ask
  );
  clearInterval(watch);
  const [readRow] = fleet.query<{ outcome: string; writes: number }>(
    "SELECT outcome, writes FROM lead_calls WHERE project_id = ? AND command = ?",
    project.id,
    READS
  );
  kit.check(
    "c: Caw runs the owner's read-only chain (ls 2>&1 | head; file 2>/dev/null; head -c 2>/dev/null) with no ask",
    readRow?.outcome === "ran" && readRow.writes === 0 && askedReads === 0,
    JSON.stringify({ readRow, askedReads })
  );

  // ── d. a line that writes is asked, in his conversation ───────────────
  kit.check(
    "d: the write is asked, in thread main, never the routine's thread",
    card.payload.threadId === main,
    JSON.stringify({
      thread: card.payload.threadId,
      main,
      routine: routineThread,
    })
  );
  await fleet.post({
    type: "command",
    commandId: crypto.randomUUID(),
    kind: "permission.answer",
    machineId: MACHINE,
    sessionId: card.instanceId,
    payload: {
      instanceId: card.instanceId,
      requestId: card.requestId,
      method: "resolvePermission",
      args: [card.requestId, { behavior: "deny", message: "No." }],
    },
  });
  await until(
    "d: the write's row denied",
    () =>
      fleet
        .query<{ outcome: string }>(
          "SELECT outcome FROM lead_calls WHERE project_id = ? AND command = ?",
          project.id,
          WRITES
        )
        .at(0),
    (row) => row?.outcome === "denied",
    60_000
  );

  // ── e. the routine's thread took nothing ──────────────────────────────
  const notes = fleet.query<{ author: string; note_title: string | null }>(
    "SELECT author, note_title FROM thread_messages WHERE thread_id = ? ORDER BY created_at",
    routineThread
  );
  kit.check(
    "e: the routine's thread holds only what it had: no report, note or ask of Caw's",
    routineMessages() === routineBefore,
    JSON.stringify({ before: routineBefore, now: notes })
  );
};

export default { name: "report-routing", run } satisfies Spec;

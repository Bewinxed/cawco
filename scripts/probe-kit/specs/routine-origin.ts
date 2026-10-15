/**
 * Every routine an agent makes says where and why it was made, is told to
 * the person once, and links each run to what ran it (hub routines.ts
 * `create`, `announce`; caw.ts `wireEvent`). On a scratch fleet (real hub,
 * agent and sessiond; Claude Code against the mock model) with Caw on.
 * Its delegate runs cut workspaces, so run it where a workspace boundary
 * can start (not inside another one), as workspace-retire does.
 *
 * 0. A session you started in the project says one sentence, then calls
 *    `routine_create`: `madeIn` is that session in no thread, `madeWhy` the
 *    sentence; its one notice opens the routine's own thread ("A session
 *    set up a routine: …"), and one push is logged.
 * 1. You write in a new thread; Caw's turn says one sentence, then calls
 *    `routine_create` (a delegate routine).
 * 2. The routine's `madeIn` is Caw's session and that thread; its `madeWhy`
 *    is the sentence.
 * 3. That thread holds one notice of it: "Caw set up a routine: <name> · …",
 *    `event` null and `routineMade` naming the routine (the bridge the
 *    dashboard draws Keep, Turn off and Open from); the hub logs one push.
 * 4. Its test run's delegate ends `NO_REPLY`; Run now gives a run whose
 *    `workItemId` is set in GET /api/routines/:id, a work item the hub keeps.
 * 5. Keep and Turn off, through the routes the notice's buttons call: the
 *    routine reads kept, then off.
 *
 *   bun scripts/probe-kit/run.ts routine-origin
 */
import { readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, open, type Spec } from "../kit";

const CAW = "You are Caw";
const CREATE = "mcp__cawco__routine_create";
const FINISH = "mcp__cawco__finish_item";
const NAME = "Probe origin";
const ASK = "PROBE-MAKE: keep an eye on the board every night.";
/** What Caw says before his call: the routine's why. */
const WHY =
  "The board drifts overnight, so a nightly look will catch it before you start.";
const SESSION_NAME = "Probe session origin";
const SESSION_ASK = "PROBE-SESSION-MAKE: check the tests every morning.";
/** What the session says before its call. */
const SESSION_WHY =
  "The suite breaks quietly between pushes, so a morning run will say so first.";
/** The routines' prompt: their delegates' runs are known by it. */
const RUN = "PROBE-RUN: look over the board.";
/** A delegate run's prompt line: which run of the routine it is. */
const RUN_LINE = /Routine “Probe origin”, its ([\w-]+) run/;
/** The hub's stdout files in a fleet's sandbox (scratch-fleet `launch`). */
const HUB_LOG = /^hub-\d+\.log$/;
const AGENT_LOG = /^agent-\d+\.log$/;

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const loading = (name: string): Reply => ({
  everyMs: 5,
  words: [],
  tool: {
    name: "ToolSearch",
    input: { query: `select:${name}`, max_results: 1 },
  },
});

/** Who makes which routine: asked with `ask`, saying `why` before the call. */
const MAKERS = [
  { ask: SESSION_ASK, name: SESSION_NAME, why: SESSION_WHY, caw: false },
  { ask: ASK, name: NAME, why: WHY, caw: true },
] as const;
/** The makers whose call went already, by name. */
const made = new Set<string>();
/** Delegate turns that answered already, by their prompt's run line. */
const finished = new Set<string>();

/** A maker's turn: load `routine_create`, then say why and call it, once. */
const making = (request: Seen): Reply | undefined => {
  const maker = MAKERS.find(
    (one) =>
      request.last.includes(one.ask) && request.all.includes(CAW) === one.caw
  );
  if (!maker) {
    return undefined;
  }
  if (made.has(maker.name) || request.afterTool) {
    return text("Set up.");
  }
  if (!request.toolNames.includes(CREATE)) {
    return loading(CREATE);
  }
  made.add(maker.name);
  return {
    everyMs: 5,
    words: [maker.why],
    tool: {
      name: CREATE,
      input: {
        name: maker.name,
        prompt: RUN,
        target: "delegate",
        cron: "0 0 1 1 *",
        time_zone: "UTC",
      },
    },
  };
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  const maker = making(request);
  if (maker) {
    return maker;
  }
  const run = request.all.match(RUN_LINE)?.[0];
  if (run && request.all.includes(RUN)) {
    if (finished.has(run) || request.afterTool) {
      return text("Done.");
    }
    if (!request.toolNames.includes(FINISH)) {
      return loading(FINISH);
    }
    finished.add(run);
    return {
      everyMs: 5,
      words: [],
      tool: {
        name: FINISH,
        input: { headline: "NO_REPLY", summary: "The board is calm." },
      },
    };
  }
  return text("ok");
};

interface RunView {
  id: string;
  leadInstanceId: string | null;
  slot: string;
  state: string;
  threadId: string | null;
  workItemId: string | null;
}
interface RoutineView {
  enabled: boolean;
  id: string;
  keep: boolean;
  madeIn: { by: string; instanceId: string; threadId: string | null } | null;
  madeWhy: string | null;
  name: string;
  runs: RunView[];
  threadId: string | null;
}
interface EventNote {
  author: string;
  event: unknown;
  noteTitle?: string;
  routineMade?: { by: string; routineId: string; why: string | null };
}

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

  /** What a fleet process printed: its stdout files in the sandbox (scratch-fleet `launch`). */
  const logOf = async (named: RegExp): Promise<string> => {
    const logs = readdirSync(fleet.sandbox).filter((name) => named.test(name));
    return (
      await Promise.all(
        logs.map((name) => Bun.file(join(fleet.sandbox, name)).text())
      )
    ).join("\n");
  };
  const hubLog = () => logOf(HUB_LOG);
  /** A wait that failed notes the hub's and the agent's newest lines, their account of what happened, then fails. */
  const told = async <T>(waiting: Promise<T>): Promise<T> => {
    try {
      return await waiting;
    } catch (error) {
      for (const [who, named] of [
        ["hub", HUB_LOG],
        ["agent", AGENT_LOG],
      ] as const) {
        // biome-ignore lint/performance/noAwaitInLoops: two logs, read in turn for the note
        const lines = (await logOf(named)).split("\n");
        kit.note(`${who}:\n${lines.slice(-60).join("\n")}`);
      }
      throw error;
    }
  };

  const home = fleet.env.HOME as string;
  const src = join(fleet.sandbox, "src");
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
    name: "Routine origin",
    machineId: MACHINE,
    cwd: src,
    caw: true,
  });

  // ── 0. a session you started says why, then makes one ────────────────
  const maker = await fleet.spawn("claude", "Probe maker", src, {
    projectId: project.id,
  });
  await fleet.send(maker, SESSION_ASK);
  const byMaker = (
    await told(
      until(
        "the session's routine made, its why read",
        () => fleet.api<RoutineView[]>(`/api/routines?projectId=${project.id}`),
        (rows) =>
          rows.some((row) => row.name === SESSION_NAME && row.madeWhy !== null),
        120_000
      )
    )
  ).find((row) => row.name === SESSION_NAME) as RoutineView;
  kit.check(
    "0: a session's routine: madeIn is that session, in no thread; madeWhy what it said before the call",
    byMaker.madeIn?.instanceId === maker &&
      byMaker.madeIn.by === "session" &&
      byMaker.madeIn.threadId === null &&
      byMaker.madeWhy === SESSION_WHY,
    `madeIn=${JSON.stringify(byMaker.madeIn)} madeWhy=${JSON.stringify(byMaker.madeWhy)}`
  );
  const own = byMaker.threadId;
  const ownNotices = own
    ? (
        await fleet.api<{ messages: EventNote[] }>(
          `/api/projects/${project.id}/threads/${own}`
        )
      ).messages.filter((one) => one.routineMade?.routineId === byMaker.id)
    : [];
  kit.check(
    "0: its one notice opens the routine's own thread, by a session",
    ownNotices.length === 1 &&
      ownNotices[0]?.event === null &&
      ownNotices[0].routineMade?.by === "session" &&
      (ownNotices[0].noteTitle ?? "").startsWith(
        `A session set up a routine: ${SESSION_NAME} · `
      ),
    `thread=${own} ${JSON.stringify(ownNotices)}`
  );
  const sessionPushes = (await hubLog())
    .split("\n")
    .filter((line) =>
      line.includes(`[push] routine ${byMaker.id}: made, announced`)
    );
  kit.check(
    "0: one push is logged for it",
    sessionPushes.length === 1,
    sessionPushes.join(" | ")
  );

  // ── 0b. the notice's row in the dashboard: Keep and Turn off ─────────
  const page = await kit.page("desk");
  const noticeAt = `[data-routine-made="${byMaker.id}"]`;
  await open(
    page,
    `${await fleet.dashboard()}/session/thread:${own}`,
    `${noticeAt} button`,
    90_000
  );
  const shown = () =>
    page.evaluate((at) => {
      const line = document.querySelector(at);
      return {
        controls: [...(line?.querySelectorAll("button, a") ?? [])].map(
          (each) => each.textContent?.trim() ?? ""
        ),
        lasts: line?.querySelector(".lasts")?.textContent?.trim() ?? "",
      };
    }, noticeAt);
  const before = await shown();
  kit.check(
    "0b: its row says it lasts 7 days and offers Keep and Turn off, and no Open in its own thread",
    before.lasts === "Off in 7 days unless you keep it" &&
      before.controls.join("|") === "Keep|Turn off",
    JSON.stringify(before)
  );
  await page.locator(`${noticeAt} button`, { hasText: "Keep" }).click();
  const after = await until(
    "the row reads kept",
    shown,
    (now) => now.lasts === "Kept",
    15_000
  ).catch(shown);
  const keptNow = await fleet.api<RoutineView>(`/api/routines/${byMaker.id}`);
  kit.check(
    "0b: Keep keeps it: the row reads Kept with Turn off alone, and the hub keeps it",
    after.lasts === "Kept" &&
      after.controls.join("|") === "Turn off" &&
      keptNow.keep,
    `${JSON.stringify(after)} keep=${keptNow.keep}`
  );

  // ── 1. Caw says why, then makes the routine ───────────────────────────
  const opened = await fleet.api<{ thread: { id: string } }>(
    `/api/projects/${project.id}/threads`,
    { body: ASK }
  );
  const threadId = opened.thread.id;
  const routine = (
    await told(
      until(
        "the routine made",
        () => fleet.api<RoutineView[]>(`/api/routines?projectId=${project.id}`),
        (rows) => rows.some((row) => row.name === NAME),
        120_000
      )
    )
  ).find((row) => row.name === NAME) as RoutineView;
  const caw = await fleet.api<{ leadInstanceId: string | null }>(
    `/api/projects/${project.id}/caw`
  );

  // ── 2. where and why ──────────────────────────────────────────────────
  const settled = await told(
    until(
      "its why read",
      () => fleet.api<RoutineView>(`/api/routines/${routine.id}`),
      (row) => row.madeWhy !== null,
      60_000
    )
  );
  kit.check(
    "2: madeIn is Caw's session and the thread he made it in",
    settled.madeIn?.instanceId === caw.leadInstanceId &&
      settled.madeIn.by === "caw" &&
      caw.leadInstanceId !== null &&
      settled.madeIn?.threadId === threadId,
    `madeIn=${JSON.stringify(settled.madeIn)} lead=${caw.leadInstanceId} thread=${threadId}`
  );
  kit.check(
    "2: madeWhy is what Caw said before the call",
    settled.madeWhy === WHY,
    JSON.stringify(settled.madeWhy)
  );

  // ── 3. one notice in his thread, one push ─────────────────────────────
  const notices = (
    await told(
      until(
        "the notice in the thread",
        () =>
          fleet.api<{ messages: EventNote[] }>(
            `/api/projects/${project.id}/threads/${threadId}`
          ),
        (read) => read.messages.some((one) => one.routineMade),
        30_000
      )
    )
  ).messages.filter((one) => one.routineMade);
  const [notice] = notices;
  kit.check(
    "3: one notice in Caw's thread names the routine, its event held beside a null event",
    notices.length === 1 &&
      notice?.author === "event" &&
      notice.event === null &&
      notice.routineMade?.routineId === routine.id &&
      notice.routineMade.by === "caw" &&
      notice.routineMade.why === WHY &&
      (notice.noteTitle ?? "").startsWith(`Caw set up a routine: ${NAME} · `),
    JSON.stringify(notices)
  );
  const pushes = (await hubLog())
    .split("\n")
    .filter((line) =>
      line.includes(`[push] routine ${routine.id}: made, announced`)
    );
  kit.check("3: one push is logged", pushes.length === 1, pushes.join(" | "));

  // ── 4. a run linked to its work item ──────────────────────────────────
  await told(
    until(
      "the test run ended",
      () => fleet.api<RoutineView>(`/api/routines/${routine.id}`),
      (row) =>
        row.runs.some(
          (one) => one.slot.startsWith("test:") && one.state === "ended"
        ),
      180_000
    )
  );
  const begun = await fleet.api<RunView>(`/api/routines/${routine.id}/run`, {});
  const linked = await told(
    until(
      "the run's work item",
      () => fleet.api<RoutineView>(`/api/routines/${routine.id}`),
      (row) =>
        row.runs.some((one) => one.id === begun.id && one.workItemId !== null),
      120_000
    )
  );
  const ran = linked.runs.find((one) => one.id === begun.id);
  const item = fleet.query<{ id: string }>(
    "SELECT id FROM work_items WHERE id = ?",
    ran?.workItemId ?? ""
  );
  kit.check(
    "4: Run now's run carries its work item in GET /api/routines/:id",
    !!ran?.workItemId && item.length === 1 && ran.leadInstanceId === null,
    JSON.stringify(ran)
  );

  // ── 5. Keep, then Turn off ────────────────────────────────────────────
  const patch = async (change: object): Promise<RoutineView> => {
    const response = await fetch(`${fleet.base}/api/routines/${routine.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(change),
    });
    return (await response.json()) as RoutineView;
  };
  const kept = await patch({ keep: true });
  kit.check(
    "5: Keep keeps it",
    kept.keep && kept.enabled,
    JSON.stringify(kept)
  );
  const off = await patch({ enabled: false });
  kit.check("5: Turn off turns it off", !off.enabled, JSON.stringify(off));
};

export default { name: "routine-origin", run } satisfies Spec;

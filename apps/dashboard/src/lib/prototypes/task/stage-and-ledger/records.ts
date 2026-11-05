/**
 * The task as the stage and the ledger read it, and the records it is drawn
 * from: tasks of the project Cawco-Dev (70ac3d41) on this hub, copied from
 * `task_read` (with `history`) on 5 Nov 2026. Each record keeps the hub's
 * own words, times and ids; where a story shows a task as it stood on an
 * earlier day (a live attempt, a stop since put right), its `now` is that
 * day and the record is cut at it.
 */

import type { Activity } from "@cawco/core/activity";
import type {
  SendBack,
  TaskHistoryEvent,
  TaskWait,
} from "@cawco/core/task-views";
import type { StageKind } from "@cawco/core/views";
import { taskStageLedgerWords as words } from "@cawco/core/words/task-stage-ledger";
import type { WorkItemState } from "@cawco/core/work-items";

/** One word for where the task stands, derived from its stage, attempts and waits. */
export type Liveness =
  | Activity
  | "needsYou"
  | "asking"
  | "queued"
  | "ready"
  | "stopped"
  | "failed"
  | "landing"
  | "done"
  | "dropped";

/** Where a move stands: pressed and waiting on the hub, approved and landing, landed, or refused. */
export type MoveState =
  "idle" | "passing" | "sending" | "landing" | "landed" | "refused";

/** A field's edit: written, sent to the hub, written back by it, or refused. */
export type SaveState = "idle" | "saving" | "saved" | "refused";

/** What the stage draws, chosen by the stage's kind and refined by the live state. */
export type StageShow =
  "result" | "live" | "idle" | "waits" | "outputs" | "failure" | "dropped";

/** One check under the result, from one of its three sources. */
export interface CheckLine {
  /** Jev's score when it judged a criterion not shown met. */
  score?: string;
  state: "passed" | "toCheck" | "notShown";
  text: string;
}

/** What came back: what the session presented, attached and landed, and what to check. */
export interface ResultView {
  at: number;
  checks: {
    acceptance: CheckLine[];
    merge: CheckLine[];
    session: CheckLine[];
  };
  commits: { sha: string; subject: string }[];
  /** A page the session presented, drawn whole: its title and its HTML. */
  page: { html: string; title: string } | null;
  /** How the hub knows of it: an attempt's hand-in, or only a comment naming it. */
  provenance: { by: string; kind: "handedIn" | "comment" };
}

export interface PlanStep {
  done: boolean;
  id: string;
  text: string;
}

/** The attempt running now, as its session reports it. */
export interface LiveView {
  doing: string;
  offered: PlanStep[];
  plan: PlanStep[];
  session: string;
  since: number;
}

/** A permission or question the attempting session raised. */
export interface SessionAsk {
  answered: { at: number; word: string } | null;
  at: number;
  detail: string;
  session: string;
  words: string;
}

interface AttemptRow {
  endedAt: number | null;
  how: string | null;
  id: string;
  session: string;
  startedAt: number;
  state: Extract<WorkItemState, "running" | "done" | "cancelled" | "failed">;
}

export interface UnblockRow {
  id: string;
  title: string;
}

/** A file, commit or page that landed, drawn as what it is. */
export interface OutputRow {
  kind: "commit" | "page";
  name: string;
  ref: string;
}

/** The session behind the newest attempt. */
interface WhoView {
  headline: string | null;
  session: string;
  state: "done" | "working" | "stopped";
}

/** One line of the session's transcript beside the task. */
export interface TranscriptLine {
  at: number;
  role: "you" | "agent" | "tool";
  text: string;
}

export interface TaskRead {
  acceptance: string[];
  attempts: AttemptRow[];
  description: string;
  dropped: {
    at: number;
    by: string;
    reason: string;
    reopenInto: string;
  } | null;
  failure: {
    at: number;
    how: string;
    reportedTo: string;
    session: string;
  } | null;
  fields: Record<string, string>;
  /** Who filed it, and whether that one hears an approval. */
  filer: { hears: boolean; name: string };
  history: TaskHistoryEvent[];
  id: string;
  kind: StageKind;
  labels: string[];
  live: LiveView | null;
  liveness: Liveness;
  mergeChecks: string[];
  outputs: OutputRow[];
  owns: string[];
  /** The stage Pass on takes it to, when its stage is of kind `you`. */
  passOnTo: string | null;
  result: ResultView | null;
  sendBack: SendBack | null;
  show: StageShow;
  /** When it entered the stage it is in, ms epoch. */
  since: number;
  stage: string;
  title: string;
  todos: PlanStep[];
  transcript: TranscriptLine[];
  type: string | null;
  unblocks: UnblockRow[];
  waits: TaskWait[];
  who: WhoView | null;
}

/** 5 Nov 2026, 12:00 at +03: the day these records were read. */
export const READ_AT = 1_793_869_200_000;

const at = (seconds: number) => seconds * 1000;

const hub = { mover: "hub" as const, id: null, name: "hub" };
const you = { mover: "you" as const, id: null, name: "you" };
const caw = {
  mover: null,
  id: "6448b912-e3eb-4035-935e-3fefc7e767d5",
  name: "Caw",
};

/** The page tsk-142's last attempt handed in, as it reads (artifact caw-thread-stuck-fixes). */
const STUCK_PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:system-ui,sans-serif;color:#1d1d1f;background:#fff;margin:0;padding:32px 40px;line-height:1.5}
h1{font-size:28px;margin:0 0 20px}
table{border-collapse:collapse;width:100%;font-size:15px}
th{text-align:left;font-weight:600;color:#555;padding:10px 8px;border-bottom:1px solid #ddd}
td{vertical-align:top;padding:10px 8px;border-bottom:1px solid #e5e5e5}
code{font-family:ui-monospace,monospace;font-size:13px}
p{font-size:15px}
</style></head><body>
<h1>Why your Caw thread got stuck</h1>
<table><thead><tr><th>You saw</th><th>Cause</th><th>Now</th></tr></thead><tbody>
<tr><td>3 messages stuck on “queued”</td><td>At 11:30, Caw asked to run a <code>git -C</code> command. The ask was filed in another thread, so nothing showed it where you were, and his turn waited on it.</td><td>His asks show on the composer of every thread of his, on web and iPhone. Answer it and the queue sends.</td></tr>
<tr><td>Open and More don't respond</td><td>While a list scrolls, the list library turns off clicks on every row, and Caw's live reply keeps the list scrolling.</td><td>Rows stay clickable while it scrolls. This also fixes pictures in messages.</td></tr>
<tr><td>The review page is unreadable</td><td>CawCo drew a light-only page in dark mode: dark text on a dark ground.</td><td>A page that wasn't written for dark stays light.</td></tr>
<tr><td>The card names a long id</td><td>The page was named by its id.</td><td>It's named by its title.</td></tr>
</tbody></table>
<p>Also fixed: the hub's “No session with that id” errors for threads, and Find now shows your messages in a thread.</p>
</body></html>`;

const TSK142_TITLE =
  "Make a Caw thread a target of the session send pipeline, served by the hub as a transcript";

/** tsk-142's history, oldest first, as the hub answers it. */
const TSK142_HISTORY: TaskHistoryEvent[] = [
  {
    at: at(1_793_005_769),
    commit: "3398ce538",
    actor: caw,
    kind: "created",
    path: "tasks/tsk-142.md",
    what: "create “Draw Caw's thread with the session transcript's rows, so queued messages sit where they were sent” in ready",
    stage: { from: null, to: "ready" },
    reason: null,
  },
  {
    at: at(1_793_005_770),
    commit: "529bda321",
    actor: hub,
    kind: "changed",
    path: "tasks/tsk-142.md",
    what: "update triage",
    stage: null,
    reason: "Jev triaged it ready-for-agent",
  },
  {
    at: at(1_793_007_998),
    commit: "faf061b5b",
    actor: caw,
    kind: "commented",
    path: "tasks/tsk-142.md",
    what: "comment “The trace he asked for (\"trace why caw's chats are using di…”",
    stage: null,
    reason: null,
  },
  {
    at: at(1_793_008_231),
    commit: "b41a028bb",
    actor: caw,
    kind: "edited",
    path: "tasks/tsk-142.md",
    what: "update title, description, acceptance criteria",
    stage: null,
    reason: null,
  },
  {
    at: at(1_793_010_071),
    commit: "bba887c05",
    actor: caw,
    kind: "edited",
    path: "tasks/tsk-142.md",
    what: "update title, description, acceptance criteria, checks, context",
    stage: null,
    reason: null,
  },
  {
    at: at(1_793_010_080),
    commit: "7cc818fc2",
    actor: hub,
    kind: "moved",
    path: "tasks/tsk-142.md",
    what: "stage ready → working",
    stage: { from: "ready", to: "working" },
    reason: "attempt 5b80ecec started",
  },
  {
    at: at(1_793_014_671),
    commit: "eb558b228",
    actor: hub,
    kind: "changed",
    path: "tasks/tsk-142.md",
    what: "add td-1 … td-10",
    stage: null,
    reason: "attempt 5b80ecec ended done with these left open in its plan",
  },
  {
    at: at(1_793_014_672),
    commit: "8273bb42b",
    actor: hub,
    kind: "moved",
    path: "tasks/tsk-142.md",
    what: "stage working → review",
    stage: { from: "working", to: "review" },
    reason: "attempt 5b80ecec done; its acceptance criteria wait for you",
  },
  {
    at: at(1_793_028_165),
    commit: "96dbf961b",
    actor: you,
    kind: "commented",
    path: "tasks/tsk-142.md",
    what: "comment “too many words, did this get implemented according to our d…”",
    stage: null,
    reason: null,
  },
  {
    at: at(1_793_028_165),
    commit: "c053fce8f",
    actor: you,
    kind: "moved",
    path: "tasks/tsk-142.md",
    what: "stage review → working",
    stage: { from: "review", to: "working" },
    reason: null,
  },
  {
    at: at(1_793_030_688),
    commit: "c1af1d117",
    actor: hub,
    kind: "changed",
    path: "tasks/tsk-142.md",
    what: "add td-11, td-12",
    stage: null,
    reason: "attempt fd8fbee7 ended done with these left open in its plan",
  },
  {
    at: at(1_793_030_690),
    commit: "4878e89ac",
    actor: hub,
    kind: "commented",
    path: "tasks/tsk-142.md",
    what: "comment “Jev judged the acceptance criteria against the report of it…”",
    stage: null,
    reason: "attempt fd8fbee7 judged",
  },
  {
    at: at(1_793_030_691),
    commit: "ba8e5580b",
    actor: hub,
    kind: "moved",
    path: "tasks/tsk-142.md",
    what: "stage working → review",
    stage: { from: "working", to: "review" },
    reason: "attempt fd8fbee7 done; its acceptance criteria wait for you",
  },
  {
    at: at(1_793_032_194),
    commit: "4b53d91cf",
    actor: {
      mover: "session",
      id: "12583348-fb03-4346-aa3e-df90b77dc6f0",
      name: "Orchestrate CawCo after handover",
    },
    kind: "commented",
    path: "tasks/tsk-142.md",
    what: "comment “Yes, it was built the way we discussed. What changed for yo…”",
    stage: null,
    reason: null,
  },
  {
    at: at(1_793_526_669),
    commit: "4b76461cb",
    actor: { mover: null, id: null, name: "Continue CawCo open tasks" },
    kind: "edited",
    path: "tasks/tsk-142.md",
    what: "Update tasks/tsk-142.md",
    stage: null,
    reason: null,
  },
  {
    at: at(1_793_526_670),
    commit: "ff7e42d70",
    actor: hub,
    kind: "changed",
    path: "tasks/tsk-142.md",
    what: "comments written by Continue CawCo open tasks put back",
    stage: null,
    reason: "comments are added only as task comments",
  },
];

const TSK142_ACCEPTANCE = [
  "`git grep -l threadBlockOf; git grep -l '\"thread.message\"'; git grep -l 'threads/:threadId/messages'; test -e apps/dashboard/src/lib/cawco/thread-blocks.ts` all find nothing; ThreadPane holds no `$state<SessionState>` and reads `cawco.session(viewId)`",
  "`sent_messages` has `thread_id`, `read_at` and nullable `instance_id`; `bun run --cwd packages/hub migrations:check` passes; after one boot every former thread row is a `sent_messages` row with its `thread_id`, `state='read'` and `read_at`",
  "A thread send and its wake to Caw share one uuid: the `sent_messages` row goes `pending` → `read` with `instance_id` the lead's",
  "The person's scenario, live on web and on iOS: a second message sent while Caw is thinking is its own row saying “queued” at the list's end, moves to read when his next turn takes it, and his reply lands after it. The last row scrolls clear of the bottom fade at 1440 and 390",
  "A send Caw cannot take is a failed row in the thread with the hub's sentence and Try again; Try again resends under `replaces`",
  "A Caw reply pushes once per thread and not when the thread was looked at since; `find` returns a thread send written after the cutover",
  "`bun run check`, `openapi:check`, `wire-compat.ts` and `build-both.sh ios --compile-only` pass",
];

const TSK142_SCORES = ["0.03", "0.04", "0.03", "0.02", "0.04", "0.09", "0.04"];

const TSK142_PLAN: PlanStep[] = [
  {
    id: "td-1",
    text: "Core types: SendRecord threadId/readAt/nullable instanceId, SendPayload.projectId, drop thread hearing/read/said/not-woken/frame",
    done: true,
  },
  {
    id: "td-2",
    text: "Hub schema + drizzle 0326 + data migration of you rows",
    done: true,
  },
  {
    id: "td-3",
    text: "Hub thread-transcript.ts page builder + stream events",
    done: true,
  },
  {
    id: "td-4",
    text: "Hub deliverSend thread target, caw.ts sent(), delete routes/start/say/once/personSent/wakeAgain",
    done: true,
  },
  { id: "td-5", text: "Push threadReply + find threadWords union", done: true },
  {
    id: "td-6",
    text: "Dashboard: delete thread-blocks/thread state, ThreadPane on cawco.session(viewId), thread id minting",
    done: true,
  },
  {
    id: "td-7",
    text: "Fade: FootFade publishes --fade-foot, Transcript foot room max, docked panel FootFade",
    done: false,
  },
  {
    id: "td-8",
    text: "iOS: Threads.swift / ThreadViewController on sessions store",
    done: false,
  },
  {
    id: "td-9",
    text: "Checks: bun run check, openapi:check, migrations:check, wire-compat",
    done: false,
  },
  {
    id: "td-10",
    text: "Artifact, task_result, commit, finish_item",
    done: false,
  },
];

const TSK142_DESCRIPTION =
  "The person reported (thread e9e429d6, 2026-10-26): Caw's chat does not use the same primitives as the transcript. His queued messages show below a message he already sent and Caw already answered, so the order is wrong; in Caw's chats the bottom part is faded and hides one of the messages.\n\nA thread is addressed as a session (`thread:<id>`); one table holds the person's words; the hub builds the thread's page; the dashboard and the app show a thread through the real session state. Thread-blocks, the stand-in session, the thread.message frame and the old thread routes are deleted. Nothing stays behind a fallback.";

/** tsk-142, in review after its second attempt handed in a page: the stage of kind `you`. */
export const judgeTask: TaskRead = {
  id: "tsk-142",
  title: TSK142_TITLE,
  stage: "review",
  kind: "you",
  liveness: "needsYou",
  show: "result",
  since: at(1_793_030_691),
  filer: { name: "Caw", hears: true },
  passOnTo: "done",
  sendBack: { stage: "ready", by: "nobody" },
  description: TSK142_DESCRIPTION,
  acceptance: TSK142_ACCEPTANCE,
  todos: [
    ...TSK142_PLAN.map((step) => ({ ...step, done: false })),
    {
      id: "td-11",
      text: "Review card Open/More dead: find what lies over them (live hit-test asked of orchestrator)",
      done: false,
    },
    {
      id: "td-12",
      text: "bun run check --all green, commit, finish_item with ship",
      done: false,
    },
  ],
  mergeChecks: [
    "bun run check",
    "bun run --cwd packages/hub openapi:check",
    "bun run --cwd packages/hub migrations:check",
  ],
  type: null,
  owns: [],
  labels: ["caw", "threads", "bug", "owner-ask"],
  fields: {},
  result: {
    at: at(1_793_030_510),
    provenance: { kind: "handedIn", by: TSK142_TITLE },
    page: { title: "caw-thread-stuck-fixes", html: STUCK_PAGE },
    commits: [
      {
        sha: "86fbf7f68",
        subject: "A thread shows every ask of the project's lead",
      },
      {
        sha: "50af56da2",
        subject: "Rows stay clickable while the transcript scrolls",
      },
    ],
    checks: {
      session: [
        {
          text: "In the thread, Caw's waiting ask is on the composer. Answering it sends your 3 queued messages",
          state: "toCheck",
        },
        {
          text: "Open and More on a review card in a thread respond while Caw is replying",
          state: "toCheck",
        },
        {
          text: "The tsk-142 review page reads light in dark mode",
          state: "toCheck",
        },
      ],
      acceptance: TSK142_ACCEPTANCE.map((text, place) => ({
        text,
        state: "notShown" as const,
        score: TSK142_SCORES[place],
      })),
      merge: [
        { text: "bun run check", state: "passed" },
        { text: "bun run --cwd packages/hub openapi:check", state: "passed" },
        {
          text: "bun run --cwd packages/hub migrations:check",
          state: "passed",
        },
      ],
    },
  },
  live: null,
  waits: [],
  unblocks: [],
  attempts: [
    {
      id: "fd8fbee7",
      session: TSK142_TITLE,
      startedAt: at(1_793_028_174),
      endedAt: at(1_793_030_687),
      state: "done",
      how: null,
    },
    {
      id: "5b80ecec",
      session: TSK142_TITLE,
      startedAt: at(1_793_010_080),
      endedAt: at(1_793_014_671),
      state: "done",
      how: null,
    },
  ],
  who: {
    session: TSK142_TITLE,
    state: "done",
    headline:
      "Caw's thread queue was stuck behind an ask filed in another thread. His asks now show in every thread of his, and the review card's dead buttons, the unreadable review page and the plans lookup are fixed. The full check passes.",
  },
  history: TSK142_HISTORY,
  outputs: [],
  failure: null,
  dropped: null,
  transcript: [
    {
      at: at(1_793_028_174),
      role: "you",
      text: "too many words, did this get implemented according to our discussion? i am unable to grok the evidence, and the mockup here is useless and too obvious and didn't need to be said",
    },
    {
      at: at(1_793_028_420),
      role: "tool",
      text: "Read apps/dashboard/src/lib/cawco/ThreadPane.svelte",
    },
    {
      at: at(1_793_028_900),
      role: "agent",
      text: "The line that left the sends pending: ThreadPane filters the blocked asks to `row.request.threadId === threadId`, and Caw's ask was filed under thread 253e9989. A thread now shows every ask of the project's lead as well as its own, on web and iOS.",
    },
    {
      at: at(1_793_029_640),
      role: "tool",
      text: "Ran bun run check --all · 31 checks passed in 22.1s",
    },
    {
      at: at(1_793_030_510),
      role: "agent",
      text: "Handed in caw-thread-stuck-fixes: why the thread got stuck, and the three other fixes. Two commits on the branch: 86fbf7f68 and 50af56da2.",
    },
  ],
};

/** tsk-142 after Pass on, as the hub wrote it back: in done, its commits landed on main. */
export const landedTask: TaskRead = {
  ...judgeTask,
  stage: "done",
  kind: "done",
  liveness: "done",
  show: "outputs",
  since: READ_AT + 45_000,
  passOnTo: null,
  sendBack: null,
  outputs: [
    {
      kind: "commit",
      ref: "86fbf7f68",
      name: "A thread shows every ask of the project's lead",
    },
    {
      kind: "commit",
      ref: "50af56da2",
      name: "Rows stay clickable while the transcript scrolls",
    },
    {
      kind: "page",
      ref: "caw-thread-stuck-fixes",
      name: "Why your Caw thread got stuck",
    },
  ],
  history: [
    ...TSK142_HISTORY,
    {
      at: READ_AT + 20_000,
      commit: "d41c07a2e",
      actor: you,
      kind: "moved",
      path: "tasks/tsk-142.md",
      what: "stage review → done",
      stage: { from: "review", to: "done" },
      reason: null,
    },
  ],
};

/** tsk-142 on 26 Oct at 14:02, its first attempt mid-run: the stage of kind active. */
export const workingTask: TaskRead = {
  ...judgeTask,
  stage: "working",
  kind: "active",
  liveness: "working",
  show: "live",
  since: at(1_793_010_080),
  passOnTo: null,
  sendBack: null,
  result: null,
  todos: [],
  live: {
    session: TSK142_TITLE,
    since: at(1_793_010_080),
    doing:
      "Writing packages/hub/src/thread-transcript.ts: sends at read_at, pending sends queued, replies at created_at",
    plan: TSK142_PLAN.slice(0, 7).map((step, place) => ({
      ...step,
      done: place < 3,
    })),
    offered: TSK142_PLAN.slice(7),
  },
  attempts: [
    {
      id: "5b80ecec",
      session: TSK142_TITLE,
      startedAt: at(1_793_010_080),
      endedAt: null,
      state: "running",
      how: null,
    },
  ],
  who: { session: TSK142_TITLE, state: "working", headline: null },
  history: TSK142_HISTORY.slice(0, 6),
};

/** The ask the attempting session raised: a Bash line its gate held, in its own words. */
export const gitAsk: SessionAsk = {
  session: TSK142_TITLE,
  at: at(1_793_011_856),
  words: "Run git -C on another worktree?",
  detail:
    "git -C ~/.worktrees/cockpit-e9e429d6 log --oneline -5 -- apps/dashboard/src/lib/cawco/ThreadPane.svelte",
  answered: null,
};

/** The same ask once Approve was pressed and the hub carried it. */
export const answeredAsk: SessionAsk = {
  ...gitAsk,
  answered: { word: words.approved, at: 1_793_011_920_000 },
};

/** tsk-226: in ready, waiting on two decisions and a task. */
export const waitingTask: TaskRead = {
  id: "tsk-226",
  title: "Land the Liquid Glass title bars after his two picks",
  stage: "ready",
  kind: "todo",
  liveness: "blocked",
  show: "waits",
  since: at(1_793_770_841),
  filer: { name: "Continue CawCo open tasks", hears: true },
  passOnTo: null,
  sendBack: null,
  description:
    "Every bar heading a surface is cut over to DESIGN.md's Title Bars Follow Liquid Glass Rule, checked against Apple's HIG for its kind. The work is on branches cawco/842df988 and cawco/f2b16f38 on top of it. Still open on the decision page title-bars-close: whether the phone Comments sheet's Close gets its own group, and what names the artifact at the head of its panel.",
  acceptance: [
    "His two remaining picks are applied",
    "The edited probes and the sidebar contrast read pass",
    "Both branches land on main after the design graph, and ship in a nightly",
  ],
  todos: [],
  mergeChecks: [],
  type: null,
  owns: [],
  labels: ["design", "owner-ask", "title-bars"],
  fields: { triage: "ready-for-agent" },
  result: null,
  live: null,
  waits: [
    {
      target: "109f7c53#head-name",
      kind: "card",
      href: "cawco:decision/109f7c53-44db-47c7-bc7f-7805647dd14a/head-name",
      label: "What names the artifact at the head of its panel?",
      settled: false,
      state: "open",
      flag: null,
      value: null,
      dropped: false,
      via: null,
    },
    {
      target: "109f7c53#rail-close",
      kind: "card",
      href: "cawco:decision/109f7c53-44db-47c7-bc7f-7805647dd14a/rail-close",
      label:
        "On a phone, does the Comments sheet's Close share a group with Search, Sort and Comment on the whole page?",
      settled: false,
      state: "open",
      flag: null,
      value: null,
      dropped: false,
      via: null,
    },
    {
      target: "tsk-18",
      kind: "task",
      href: "cawco:task/70ac3d41-5a28-4a31-8e9e-3be2b03d1516/tsk-18",
      label:
        "Replace the component canvas's grid of frames with the design graph",
      settled: false,
      state: "ready",
      flag: null,
      value: null,
      dropped: false,
      via: null,
    },
  ],
  unblocks: [],
  attempts: [],
  who: null,
  history: [
    {
      at: at(1_793_770_841),
      commit: "0a5c1deb5",
      actor: {
        mover: "session",
        id: "f8ff171c-d55d-4d60-9da0-230e2e5fe7fb",
        name: "Continue CawCo open tasks",
      },
      kind: "created",
      path: "tasks/tsk-226.md",
      what: "create “Land the Liquid Glass title bars after his two picks” in ready",
      stage: { from: null, to: "ready" },
      reason: null,
    },
    {
      at: at(1_793_770_842),
      commit: "92387dfb2",
      actor: hub,
      kind: "changed",
      path: "tasks/tsk-226.md",
      what: "update triage",
      stage: null,
      reason: "Jev triaged it ready-for-agent",
    },
    {
      at: at(1_793_772_771),
      commit: "4b848b7a7",
      actor: {
        mover: "session",
        id: "f8ff171c-d55d-4d60-9da0-230e2e5fe7fb",
        name: "Continue CawCo open tasks",
      },
      kind: "commented",
      path: "tasks/tsk-226.md",
      what: "comment “The DESIGN.md cut landed on main at 854292fb9 with his appr…”",
      stage: null,
      reason: null,
    },
    {
      at: at(1_793_803_341),
      commit: "8d019f915",
      actor: {
        mover: "session",
        id: "f8ff171c-d55d-4d60-9da0-230e2e5fe7fb",
        name: "Continue CawCo open tasks",
      },
      kind: "commented",
      path: "tasks/tsk-226.md",
      what: "comment “Rendered checks (triage b7f176e96, assets/460f5ac4/defects.…”",
      stage: null,
      reason: null,
    },
  ],
  outputs: [],
  failure: null,
  dropped: null,
  transcript: [],
};

/** The 29 tasks that wait on tsk-18, by id and title, as its read lists them. */
const DESIGN_GRAPH_UNBLOCKS: UnblockRow[] = [
  [
    "tsk-24",
    "Redesign the comment surfaces: card, thread popover, author row and tablet panel, with one goo-out morph",
  ],
  ["tsk-26", "Set up the cawco address as one tray led by caw the character"],
  ["tsk-28", "Pick and build the plan view (tasks and to-dos)"],
  ["tsk-31", "Settle presence across devices and the away notes"],
  [
    "tsk-47",
    "Ask for a sentence-shaped approval card when an agent edits an MCP",
  ],
  ["tsk-48", "Preview non-HTML projects by falling back to HTML elements"],
  ["tsk-62", "Give workflows a home of their own, apart from routines"],
  ["tsk-64", "Make a session at its limit read as a short wait, not a failure"],
  ["tsk-72", "Restyle Caw's suggestions from the design system up"],
  ["tsk-79", "Let comments carry pictures and attachments"],
  ["tsk-82", "Settle one error-state and one placement rule for every surface"],
  [
    "tsk-83",
    "Rebuild the design previews' state switcher to the state-machine spec",
  ],
  ["tsk-84", "Build the transcript cold load he specified"],
  ["tsk-101", "Show him the reusable Caw rig and its cheer options"],
  [
    "tsk-104",
    "Redesign the add-machine modal from scratch, minimizable while it works",
  ],
  ["tsk-156", "Design and build the decision surface"],
  [
    "tsk-163",
    "Show states of projects without stories by route (route-addressed stage)",
  ],
  ["tsk-164", "Redesign the decision page from a clean slate"],
  [
    "tsk-171",
    "Show him the layered Caw mode picker and the New conversation chip",
  ],
  ["tsk-173", "Get his look on the comment goo and measure it in real Safari"],
  ["tsk-203", "Give the project's memory inbox a screen"],
  ["tsk-210", "Start a task from the app"],
  [
    "tsk-220",
    "Pick how an account with no 5-hour window looks on the usage screens",
  ],
  ["tsk-226", "Land the Liquid Glass title bars after his two picks"],
  ["tsk-230", "Time the design graph in iPhone Safari on the Mac"],
  [
    "tsk-234",
    "Add image provider settings to Configure: agy sign-in cell and default provider block",
  ],
  [
    "tsk-235",
    "Add image provider settings to Configure: agy sign-in cell and default provider block",
  ],
  ["tsk-240", "Show the new build's release notes in the update toast"],
].map(([id, title]) => ({ id: id ?? "", title: title ?? "" }));

/** tsk-18, opened in tsk-226's place from its wait: in ready, waiting on nothing, holding 28 tasks. */
export const designGraphTask: TaskRead = {
  ...waitingTask,
  id: "tsk-18",
  title: "Replace the component canvas's grid of frames with the design graph",
  liveness: "ready",
  since: at(1_792_746_000),
  filer: { name: "Orchestrate cockpit fleet work", hears: true },
  description:
    "The component canvas's grid of frames is replaced by the design graph: the surface where the owner judges what an agent built (a real component or screen in each of its states, the moves between them and their timing) and leaves remarks the agent reads back.",
  acceptance: [],
  labels: ["canvas/artifacts", "partial", "owner-ask"],
  fields: { priority: "high", triage: "ready-for-human" },
  waits: [],
  unblocks: DESIGN_GRAPH_UNBLOCKS,
  history: [
    {
      at: at(1_792_746_000),
      commit: "0f2d7c1aa",
      actor: {
        mover: "session",
        id: "23cb5219-f410-4369-83d2-2e1d1fa3e6a7",
        name: "Orchestrate cockpit fleet work",
      },
      kind: "created",
      path: "tasks/tsk-18.md",
      what: "create “Replace the component canvas's grid of frames with the design graph” in ready",
      stage: { from: null, to: "ready" },
      reason: null,
    },
    {
      at: at(1_793_789_000),
      commit: "7c03e9b51",
      actor: {
        mover: "session",
        id: "f8ff171c-d55d-4d60-9da0-230e2e5fe7fb",
        name: "Continue CawCo open tasks",
      },
      kind: "commented",
      path: "tasks/tsk-18.md",
      what: "comment “11-04 ~15:10, state before compaction: - **Branch:** cawco/77…”",
      stage: null,
      reason: null,
    },
  ],
};

/** tsk-205: filed by hand three days ago, ready, no acceptance criteria yet: the task being shaped. */
export const shapeTask: TaskRead = {
  ...waitingTask,
  id: "tsk-205",
  title: "Keep a pin on live words found in a view whose words differ",
  liveness: "ready",
  show: "waits",
  since: at(1_793_610_000),
  filer: { name: "Continue CawCo open tasks", hears: true },
  description:
    "Core's `findAnchor` accepts a positional selector (for example `#zoomLevel > span:nth-of-type(1)`) only while the element reads the anchor's text, or starts with it. A view where an embedded preview reads “76%” therefore can't find a pin whose anchor says “81%”, and moves it aside after 2 s. This shows for elements whose words change with the view's width, such as a zoom percent or a clock. Found by the pin overlay work on 11-01, report 097f38c8.",
  acceptance: [],
  type: "high",
  labels: ["defect"],
  fields: { triage: "needs-info" },
  waits: [],
  history: [
    {
      at: at(1_793_610_000),
      commit: "a19e04c3d",
      actor: {
        mover: "session",
        id: "f8ff171c-d55d-4d60-9da0-230e2e5fe7fb",
        name: "Continue CawCo open tasks",
      },
      kind: "created",
      path: "tasks/tsk-205.md",
      what: "create “Keep a pin on live words found in a view whose words differ” in ready",
      stage: { from: null, to: "ready" },
      reason: null,
    },
    {
      at: at(1_793_610_001),
      commit: "c2f8e1b07",
      actor: hub,
      kind: "changed",
      path: "tasks/tsk-205.md",
      what: "update triage",
      stage: null,
      reason: "Jev triaged it needs-info",
    },
  ],
};

/** tsk-135: in working since you moved it back on 26 Oct, and no attempt has run since. */
export const idleTask: TaskRead = {
  ...waitingTask,
  id: "tsk-135",
  title: "Relaunch at boot only what was working",
  stage: "working",
  kind: "active",
  liveness: "idle",
  show: "idle",
  since: at(1_793_002_710),
  filer: { name: "Fix agent main-thread search hang", hears: true },
  description:
    "When the agent starts, it brings back only the sessions that were working when it went down. Conversations at rest stay asleep until their next message, and the launches it does make are spaced out, so a boot never starts dozens of claude processes at once. On 23 Oct, 19 weeks-old sessions were relaunched at 20:16:32, about 240 claude processes ran, and load reached about 143.",
  acceptance: [],
  labels: ["owner-ask", "bug", "needs-discussion"],
  fields: { triage: "ready-for-human" },
  waits: [],
  history: [
    {
      at: at(1_792_954_721),
      commit: "b7ed41372",
      actor: {
        mover: "session",
        id: "9b688791-9d48-48fa-a9ee-e36b0c7d932d",
        name: "Fix agent main-thread search hang",
      },
      kind: "created",
      path: "tasks/tsk-135.md",
      what: "create “Relaunch at boot only what was working” in review",
      stage: { from: null, to: "review" },
      reason: null,
    },
    {
      at: at(1_793_002_710),
      commit: "2755c9440",
      actor: you,
      kind: "commented",
      path: "tasks/tsk-135.md",
      what: "comment “sounds like the opened older sessions is only due to a one-…”",
      stage: null,
      reason: null,
    },
    {
      at: at(1_793_002_710),
      commit: "989b38a52",
      actor: you,
      kind: "moved",
      path: "tasks/tsk-135.md",
      what: "stage review → working",
      stage: { from: "review", to: "working" },
      reason: null,
    },
    {
      at: at(1_793_032_916),
      commit: "49e2d7ceb",
      actor: {
        mover: "session",
        id: "9b688791-9d48-48fa-a9ee-e36b0c7d932d",
        name: "Fix agent main-thread search hang",
      },
      kind: "commented",
      path: "tasks/tsk-135.md",
      what: 'comment “The owner\'s pick on overnight-calls: "Not after a day". His…”',
      stage: null,
      reason: null,
    },
    {
      at: at(1_793_033_614),
      commit: "c62482cba",
      actor: {
        mover: "session",
        id: "9b688791-9d48-48fa-a9ee-e36b0c7d932d",
        name: "Fix agent main-thread search hang",
      },
      kind: "commented",
      path: "tasks/tsk-135.md",
      what: "comment “Shipped: obelisk runs 0.1.12-nightly.5958 (903dc22e9).”",
      stage: null,
      reason: null,
    },
  ],
};

const HANG_TITLE =
  "Find why hang-cards fails “panel-to-jump held at half the size”";

/** tsk-7 on 14 Oct, its second attempt stopped and the task back in ready: the failure. */
export const stoppedTask: TaskRead = {
  ...waitingTask,
  id: "tsk-7",
  title: HANG_TITLE,
  stage: "ready",
  kind: "todo",
  liveness: "stopped",
  show: "failure",
  since: at(1_792_053_789),
  filer: { name: "we need to continue the work that is here", hears: true },
  description:
    "Found 2026-10-13 by the probe-slot leaf (cda94bb6) running scripts/probe-ios-hang-cards.ts on cockpit-1cc58017's build: 237 PASS, 1 FAIL: panel-to-jump held at half the size, h 160.0 at time 0.000 where 63.0 was expected. Decide first whether the app regressed or the probe's expectation is stale.",
  acceptance: [
    "The cause is named with the commit that introduced it and the line that produces h 160 at time 0",
    "scripts/probe-ios-hang-cards.ts passes in full on main's build",
    "scripts/probe-ios-question-keyboard.ts runs once on main's build through the slots and passes",
    "iOS builds both targets",
  ],
  mergeChecks: ["bash apps/apple/scripts/build-both.sh ios --compile-only"],
  type: "high",
  labels: ["apple", "bug"],
  fields: {},
  waits: [],
  failure: {
    how: "Stopped",
    at: at(1_792_053_789),
    session: HANG_TITLE,
    reportedTo: "the project's conversation",
  },
  attempts: [
    {
      id: "a86bb046",
      session: HANG_TITLE,
      startedAt: at(1_792_053_778),
      endedAt: at(1_792_053_789),
      state: "cancelled",
      how: "Stopped",
    },
    {
      id: "8e26ff50",
      session: HANG_TITLE,
      startedAt: at(1_791_889_367),
      endedAt: at(1_791_889_386),
      state: "cancelled",
      how: "Stopped",
    },
  ],
  who: { session: HANG_TITLE, state: "stopped", headline: null },
  history: [
    {
      at: at(1_791_888_380),
      commit: "3489f10f4",
      actor: {
        mover: null,
        id: null,
        name: "we need to continue the work that is here",
      },
      kind: "created",
      path: "tasks/tsk-7.md",
      what: "create “Find why hang-cards fails …” in ready",
      stage: { from: null, to: "ready" },
      reason: null,
    },
    {
      at: at(1_791_889_367),
      commit: "67d64eeda",
      actor: hub,
      kind: "moved",
      path: "tasks/tsk-7.md",
      what: "stage ready → working",
      stage: { from: "ready", to: "working" },
      reason: "attempt 8e26ff50 started",
    },
    {
      at: at(1_791_889_386),
      commit: "0cecae69a",
      actor: hub,
      kind: "moved",
      path: "tasks/tsk-7.md",
      what: "stage working → ready",
      stage: { from: "working", to: "ready" },
      reason: "attempt 8e26ff50 cancelled",
    },
    {
      at: at(1_792_053_778),
      commit: "c541e05bf",
      actor: hub,
      kind: "moved",
      path: "tasks/tsk-7.md",
      what: "stage ready → working",
      stage: { from: "ready", to: "working" },
      reason: "attempt a86bb046 started",
    },
    {
      at: at(1_792_053_789),
      commit: "1a9d08295",
      actor: hub,
      kind: "moved",
      path: "tasks/tsk-7.md",
      what: "stage working → ready",
      stage: { from: "working", to: "ready" },
      reason: "attempt a86bb046 cancelled",
    },
  ],
};

/** tsk-170: dropped on 31 Oct by the session running the ready tasks, its reason kept. */
export const droppedTask: TaskRead = {
  ...waitingTask,
  id: "tsk-170",
  title: "Give each design-graph preview serve its own build folder",
  stage: "dropped",
  kind: "dropped",
  liveness: "dropped",
  show: "dropped",
  since: at(1_793_445_728),
  filer: { name: "Orchestrate CawCo after handover", hears: true },
  description:
    "`scripts/design-graph-preview.ts` (branch cawco/6c1c85bc) builds into apps/dashboard's shared output folder, then serves that folder with `vite preview`. A second build in the same workspace replaces the assets the first serve's HTML names, and the first serve then shows an empty page until it restarts. It cost minutes of 503s overnight.",
  acceptance: [],
  labels: ["bug", "design-graph"],
  fields: { triage: "ready-for-agent" },
  waits: [],
  dropped: {
    reason:
      "The old design-graph preview script on cawco/7b50a066 is superseded by the clean-slate restart from main.",
    by: "Run the ready CawCo tasks",
    at: at(1_793_445_728),
    reopenInto: "ready",
  },
  history: [
    {
      at: at(1_793_424_702),
      commit: "57eb83c16",
      actor: {
        mover: "session",
        id: "12583348-fb03-4346-aa3e-df90b77dc6f0",
        name: "Orchestrate CawCo after handover",
      },
      kind: "created",
      path: "tasks/tsk-170.md",
      what: "create “Give each design-graph preview serve its own build folder” in ready",
      stage: { from: null, to: "ready" },
      reason: null,
    },
    {
      at: at(1_793_424_702),
      commit: "bc551d868",
      actor: hub,
      kind: "changed",
      path: "tasks/tsk-170.md",
      what: "update triage",
      stage: null,
      reason: "Jev triaged it ready-for-agent",
    },
    {
      at: at(1_793_424_979),
      commit: "1b20f4073",
      actor: {
        mover: "session",
        id: "12583348-fb03-4346-aa3e-df90b77dc6f0",
        name: "Run the ready CawCo tasks",
      },
      kind: "commented",
      path: "tasks/tsk-170.md",
      what: "comment “Dispatched as cockpit-7b91eb2e#9ace8f74, cut from workspace…”",
      stage: null,
      reason: null,
    },
    {
      at: at(1_793_445_728),
      commit: "ad18a1452",
      actor: {
        mover: "session",
        id: "12583348-fb03-4346-aa3e-df90b77dc6f0",
        name: "Run the ready CawCo tasks",
      },
      kind: "moved",
      path: "tasks/tsk-170.md",
      what: "stage ready → dropped",
      stage: { from: "ready", to: "dropped" },
      reason:
        "The old design-graph preview script on cawco/7b50a066 is superseded by the clean-slate restart from main.",
    },
  ],
};

/** tsk-6 on 15 Oct, in review with no attempt behind it: its result known only from a comment naming two commits. */
export const commentResultTask: TaskRead = {
  ...judgeTask,
  id: "tsk-6",
  title:
    "Share the Mac between leaves: one build and simulator slot for everyone",
  since: at(1_791_888_900),
  filer: { name: "we need to continue the work that is here", hears: true },
  sendBack: { stage: "ready", by: "nobody" },
  description:
    "Found 2026-10-13 13:05: the owner's Mac reached a load average of 675. Four Mac leaves ran at once, each booting its own iOS Simulator (236 simulator-runtime processes), plus two Xcode builds.",
  acceptance: [
    "build-both.sh from a workspace and from the orchestrator's SSH contend for one lock",
    "At most 2 simulators booted machine-wide through mac-slot.sh; a third caller waits",
    "A caller killed mid-run frees its slot and its simulator is deleted",
    "bash -n on both scripts",
  ],
  mergeChecks: [
    "bash -n apps/apple/scripts/build-both.sh",
    "bash -n apps/apple/scripts/mac-slot.sh",
  ],
  type: "medium",
  labels: ["fleet", "apple", "bug"],
  result: {
    at: at(1_792_066_100),
    provenance: { kind: "comment", by: "Orchestrate cockpit fleet work" },
    page: null,
    commits: [
      {
        sha: "c16e84512",
        subject: "Clone every slot simulator from a settled template",
      },
      {
        sha: "faace784e",
        subject: "A check's time limit stands while it queues for a Mac slot",
      },
    ],
    checks: {
      session: [],
      acceptance: [
        {
          text: "build-both.sh from a workspace and from the orchestrator's SSH contend for one lock",
          state: "toCheck",
        },
        {
          text: "At most 2 simulators booted machine-wide through mac-slot.sh; a third caller waits",
          state: "toCheck",
        },
        {
          text: "A caller killed mid-run frees its slot and its simulator is deleted",
          state: "toCheck",
        },
        { text: "bash -n on both scripts", state: "toCheck" },
      ],
      merge: [],
    },
  },
  attempts: [],
  who: null,
  history: [],
  transcript: [],
};

/** The time each story's read is set at: the day its record stood so. */
export const NOW = {
  judge: READ_AT,
  working: at(1_793_011_920),
  stopped: at(1_792_060_000),
  commentResult: at(1_792_070_000),
} as const;

/**
 * PREVIEW ONLY (not for main): a hub for /motion/caw-assistant, in the page.
 * The dev server runs against no hub, so the page's socket and its `/api`
 * reads are answered here: a socket that opens and answers every frame with
 * `{}` (the client counts the hub reached on its first message and reads
 * nothing in `{}`), and `fetch` answering the project's reads from the
 * fixtures below. The scenario the route picks decides Caw's view, the
 * threads, and which sends the hub holds without answering.
 */
import {
  type AgentRow,
  CAPABILITIES_NONE,
  type CawView,
  type HarnessReport,
  type InstanceRow,
  type ProjectCap,
  type ProjectSpend,
  type ThreadMessage,
  type ThreadSummary,
} from "@cawco/core";
import type { ProjectRow } from "#lib/cawco/client.svelte.js";
import type {
  StagesView,
  TaskList,
  TaskSummary,
} from "#lib/cawco/project-tasks.js";

export const PROJECT_ID = "6f1e2c3a-0000-4000-8000-00000000c0c0";
export const LEAD_ID = "6f1e2c3a-0000-4000-8000-0000000000ea";
const MACHINE_ID = "obelisk-of-light";
const NOW = Date.now();
const MIN = 60_000;

export const PROJECT: ProjectRow = {
  appleGate: false,
  caw: true,
  createdAt: new Date(NOW - 40 * 24 * 60 * MIN).toISOString(),
  id: PROJECT_ID,
  name: "cockpit",
  places: [
    {
      createdAt: new Date(NOW - 40 * 24 * 60 * MIN).toISOString(),
      id: "place-1",
      isPrimary: true,
      kind: "checkout",
      machineId: MACHINE_ID,
      path: "/home/bewinxed/cockpit",
      projectId: PROJECT_ID,
    },
  ],
  primaryPlaceId: "place-1",
  remote: "github.com/bewinxed/cockpit",
  review: false,
};

/** A harness this machine has, with the models it reports (the pickers' catalog). */
const report = (
  harness: HarnessReport["harness"],
  models: [string, string][]
): HarnessReport => ({
  auth: "authenticated",
  capabilities: {
    ...CAPABILITIES_NONE,
    effort: true,
    permissionModes: ["default", "acceptEdits", "plan"],
    setModel: true,
    supportedModels: true,
  },
  harness,
  installed: true,
  models: models.map(([value, displayName]) => ({
    displayName,
    supportedEffortLevels: ["low", "medium", "high"],
    supportsEffort: true,
    value,
  })),
});

export const MACHINE: AgentRow = {
  auth: "unknown",
  harnesses: [
    report("claude", [
      ["claude-opus-5-5", "Opus 5.5"],
      ["claude-sonnet-5-5", "Sonnet 5.5"],
    ]),
    report("opencode", [
      ["opencode-go/kimi-k2", "Kimi K2"],
      ["opencode-go/qwen3-coder", "Qwen3 Coder"],
    ]),
  ],
  hostname: "obelisk-of-light",
  lastSeenAt: new Date(NOW).toISOString(),
  machineId: MACHINE_ID,
  os: "linux",
  status: "online",
};

export const STAGES: StagesView = {
  moves: [],
  problems: [],
  source: "file",
  stages: [
    { name: "todo", kind: "todo", hooks: {} },
    { name: "doing", kind: "active", hooks: {} },
    { name: "review", kind: "you", hooks: {} },
    { name: "done", kind: "done", hooks: {} },
  ],
  starters: [
    { glyph: "triage", text: "Catch me up on what ran today" },
    { glyph: "search", text: "What is blocked and why" },
    { glyph: "tasks", text: "Plan the next task on the board" },
    { glyph: "bug", text: "Find what broke in the last build" },
  ],
  template: null,
  views: [],
};

const task = (
  number: number,
  title: string,
  stage: string,
  kind: TaskSummary["kind"],
  todos: [number, number] = [0, 0]
): TaskSummary => ({
  after: [],
  attempts: [],
  blockedBy: [],
  createdAt: NOW - number * 60 * MIN,
  foundIn: null,
  id: `tsk-${number}`,
  kind,
  labels: [],
  lastAttemptFailed: false,
  lastAttemptStopped: false,
  liveAttempt: false,
  needsYou: kind === "you",
  number,
  parent: null,
  path: `tasks/tsk-${number}.md`,
  problem: null,
  queuedStart: false,
  rank: null,
  related: [],
  stage,
  startProblem: null,
  title,
  todos: { done: todos[0], total: todos[1] },
  type: null,
  updatedAt: NOW - number * 10 * MIN,
});

export const TASKS: TaskList = {
  problems: [],
  stagesProblems: [],
  tracker: "cawco",
  tasks: [
    task(14, "Port the plan ring to iOS", "todo", "todo"),
    task(15, "Audit the push probe", "todo", "todo", [0, 3]),
    task(12, "Rebuild the token sheet", "doing", "active", [2, 5]),
    task(16, "Split the session card", "doing", "active"),
    task(11, "Renew the iOS signing profile", "review", "you"),
    task(9, "Fix tray chip overflow", "done", "done", [4, 4]),
  ],
};

/** The board before its first task. */
export const EMPTY_TASKS: TaskList = { ...TASKS, tasks: [] };

const SPEND = {
  attempts: [],
  budget: null,
  cap: null,
  caw: { monthUsd: 6.1, todayUsd: 0.42, unthreadedMonthUsd: 0.3 },
  fleetOnCap: "pause",
  monthStart: NOW - 14 * 24 * 60 * MIN,
  monthUsd: 23.4,
  others: { monthUsd: 9.2, todayUsd: 0.8 },
  threads: [],
  todayStart: NOW - 13 * 60 * MIN,
  todayUsd: 1.9,
} as unknown as ProjectSpend;

// --- the conversation ---------------------------------------------------------

export const ASKED = "Catch me up on what ran today and what failed";
export const REPLY =
  "Three sessions ran today. Two finished: the tray chip fix and the token build. The third, the iOS build, stopped on a signing error at 12:40: the provisioning profile expired yesterday. I filed tsk-11 for you to renew it. Want me to open that session?";
const FULL_STOP = /\.$/;
const WHY =
  "his workspace can't start on this machine: ~/cawco is not a folder.";

const thread = (
  id: string,
  title: string,
  ago: number,
  status: ThreadSummary["status"] = "ready"
): ThreadSummary => ({
  id,
  lastAt: NOW - ago,
  projectId: PROJECT_ID,
  setup: false,
  status,
  title,
});
const you = (threadId: string, ago: number, body = ASKED): ThreadMessage => ({
  author: "you",
  body,
  createdAt: NOW - ago,
  id: `${threadId}-you-${ago}`,
  threadId,
});
const caw = (threadId: string, ago: number, body = REPLY): ThreadMessage => ({
  author: "caw",
  body,
  createdAt: NOW - ago,
  id: `${threadId}-caw-${ago}`,
  threadId,
});

/** The states the route steps through. */
export const SCENARIOS = [
  { value: "first", label: "1 · First open" },
  { value: "typing", label: "2 · Starter picked" },
  { value: "sent", label: "3 · Sent, waiting" },
  { value: "thinking", label: "4 · Thinking" },
  { value: "streaming", label: "5 · Streaming" },
  { value: "replied", label: "6 · Replied" },
  { value: "failed", label: "7 · Didn't wake" },
  { value: "off", label: "8 · Caw off" },
  { value: "earlier", label: "9 · New thread, earlier threads" },
  { value: "card", label: "10 · Caw's session card" },
  { value: "board", label: "11 · Empty board" },
  { value: "view", label: "12 · Ask Caw for a view" },
  { value: "offturn", label: "13 · Turning him off mid-turn" },
  { value: "capped", label: "14 · Past the spend cap" },
] as const;
export type Scenario = (typeof SCENARIOS)[number]["value"];

export interface Seeded {
  /** The lead session is in a turn: his face works, the thread's live row stands. */
  busy: boolean;
  messages: Record<string, ThreadMessage[]>;
  threads: ThreadSummary[];
  view: CawView;
}

const T = "th-today";

/** What the hub holds for a scenario. */
export function seedOf(scenario: Scenario): Seeded {
  const view: CawView = {
    answering: null,
    harness: "claude",
    leadInstanceId: LEAD_ID,
    model: null,
    on: scenario !== "off",
    problem: null,
    running: [],
    spendUsd: 6.1,
  };
  const replied = {
    threads: [thread(T, ASKED, 2 * MIN)],
    messages: { [T]: [you(T, 3 * MIN), caw(T, 2 * MIN)] },
  };
  switch (scenario) {
    // His own turn, an event's (tsk-12's report), runs as you turn him off.
    case "offturn":
      return {
        view: {
          ...view,
          answering: "reading tsk-12's report",
          running: [
            {
              cwd: "/home/bewinxed/cockpit",
              id: LEAD_ID,
              kind: "turn",
              machineId: MACHINE_ID,
              offline: false,
              parentId: null,
              taskId: "tsk-12",
              title: "Reading tsk-12's report",
            },
          ],
        },
        busy: true,
        ...replied,
      };
    case "first":
    case "typing":
    case "sent":
    case "board":
      return { view, busy: false, threads: [], messages: {} };
    case "thinking":
    case "streaming":
      return {
        view,
        busy: true,
        threads: [thread(T, ASKED, 0.2 * MIN, "working")],
        messages: { [T]: [you(T, 0.2 * MIN)] },
      };
    case "failed":
      return {
        view,
        busy: false,
        threads: [thread(T, ASKED, 1 * MIN)],
        messages: {
          [T]: [
            you(T, 1.2 * MIN),
            {
              author: "event",
              body: `Caw hasn't read your message: ${WHY.replace(FULL_STOP, "")}. Your message is kept in this thread. Write again to wake him with it.`,
              createdAt: NOW - MIN,
              event: { kind: "caw", what: "not-woken" },
              id: `${T}-not-woken`,
              noteTitle: "Caw · not woken",
              threadId: T,
            },
          ],
        },
      };
    case "earlier":
      return {
        view,
        busy: false,
        threads: [
          thread(T, ASKED, 2 * MIN),
          thread("th-yesterday", "Plan the tray chip fix", 26 * 60 * MIN),
          thread("th-monday", "Why did the iOS build stop", 3 * 24 * 60 * MIN),
        ],
        messages: {
          ...replied.messages,
          "th-yesterday": [
            you("th-yesterday", 26 * 60 * MIN, "Plan the tray chip fix"),
            caw(
              "th-yesterday",
              26 * 60 * MIN - MIN,
              "The chips overflow because the tray row has no min width for its label. I filed tsk-9 with the fix: a max width on the label and an ellipsis. It's on the board in todo."
            ),
          ],
          "th-monday": [
            you("th-monday", 3 * 24 * 60 * MIN, "Why did the iOS build stop"),
            caw(
              "th-monday",
              3 * 24 * 60 * MIN - MIN,
              "It stopped at signing: the provisioning profile expired. Renewing it needs you in the developer portal, so I filed tsk-11 for you."
            ),
          ],
        },
      };
    default:
      return { view, busy: false, ...replied };
  }
}

// --- the hub, in the page -------------------------------------------------------

export const standIn: {
  seed: Seeded;
  /** Sends the hub takes and never answers, so their wait stays on screen. */
  holdSends: boolean;
  /** The board has no tasks yet. */
  emptyBoard: boolean;
  /** The project is past its spend cap. */
  capped: boolean;
} = {
  seed: seedOf("first"),
  holdSends: false,
  emptyBoard: false,
  capped: false,
};

/** A month cap reached, the next period four hours off. */
const CAP_REACHED: ProjectCap = {
  inherited: false,
  onCap: "pause",
  period: "month",
  reached: true,
  resetsAt: NOW + 4 * 60 * MIN,
  spentUsd: 50,
  startsAt: NOW - 14 * 24 * 60 * MIN,
  usd: 50,
};

const SAID = /\/threads(?:\/([^/]+)\/messages)?$/;
const READ = /\/threads\/([^/]+)$/;

/** A thread's reads and sends; null for any other path. */
function threadAnswer(
  path: string,
  method: string,
  body: string
): Promise<Response> | null {
  const said = SAID.exec(path);
  if (said && method === "POST") {
    if (standIn.holdSends) {
      return pending();
    }
    const { body: words, id } = JSON.parse(body) as {
      body: string;
      id: string;
    };
    const threadId = said[1] ?? T;
    const summary = thread(threadId, words, 0, "working");
    return Promise.resolve(
      json({
        thread: summary,
        message: {
          author: "you",
          body: words,
          createdAt: Date.now(),
          id,
          threadId,
        },
      })
    );
  }
  const read = READ.exec(path);
  if (read) {
    const summary = standIn.seed.threads.find((each) => each.id === read[1]);
    return Promise.resolve(
      summary
        ? json({
            thread: summary,
            messages: standIn.seed.messages[read[1]] ?? [],
          })
        : json({ error: "No such thread in this preview." }, 404)
    );
  }
  return null;
}

/** His lead session, as the hub lists it: what his session card reads. */
const leadRow = (busy: boolean): InstanceRow => ({
  cwd: "/home/bewinxed/cockpit",
  harness: "claude",
  id: LEAD_ID,
  launchDir: "known",
  machineId: MACHINE_ID,
  model: "claude-opus-5-5",
  permissionMode: "default",
  projectId: PROJECT_ID,
  role: "lead",
  sessionId: "6f1e2c3a-0000-4000-8000-0000000005e5",
  status: busy ? "running" : "sleeping",
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const pending = () => new Promise<Response>(() => undefined);

function answer(path: string, method: string, body: string): Promise<Response> {
  const base = `/api/projects/${PROJECT_ID}`;
  const { seed } = standIn;
  if (path === "/api/projects") {
    return Promise.resolve(
      json([standIn.capped ? { ...PROJECT, cap: CAP_REACHED } : PROJECT])
    );
  }
  if (path === "/api/agents") {
    return Promise.resolve(json([MACHINE]));
  }
  // The fleet's other reads on connect, empty: nothing pending, handed off,
  // limited, continued, offered, noticed or waiting.
  const empty: Record<string, unknown> = {
    "/api/instances": [leadRow(seed.busy)],
    "/api/pending": [],
    "/api/handoffs": {},
    "/api/usage/limits": { machines: [] },
    "/api/continuations": [],
    "/api/project-offers": [],
    "/api/fleet-watch/notices": { notices: [] },
    "/api/actions/waiting": { actions: [] },
  };
  if (path in empty) {
    return Promise.resolve(json(empty[path]));
  }
  if (path === "/api/threads") {
    return Promise.resolve(json({ [PROJECT_ID]: seed.threads }));
  }
  if (path === `${base}/caw`) {
    if (method === "PATCH") {
      seed.view = { ...seed.view, ...(JSON.parse(body) as Partial<CawView>) };
    }
    return Promise.resolve(json(seed.view));
  }
  if (path === `${base}/spend`) {
    return Promise.resolve(json(SPEND));
  }
  if (path === `${base}/tasks`) {
    return Promise.resolve(json(standIn.emptyBoard ? EMPTY_TASKS : TASKS));
  }
  if (path === `${base}/stages`) {
    return Promise.resolve(json(STAGES));
  }
  if (path === `${base}/views`) {
    return Promise.resolve(json([]));
  }
  if (path.startsWith(`${base}/view-tools/`)) {
    return Promise.resolve(json({ rows: [] }));
  }
  // Anything else this preview has no fixture for waits, unanswered: a read
  // the page does not need for the panel (accounts, the fleet's spend).
  return threadAnswer(path, method, body) ?? pending();
}

/** A socket that opens, says `{}`, and answers every frame with `{}`. */
class StandInSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;
  readyState = 0;
  binaryType: BinaryType = "blob";
  bufferedAmount = 0;
  extensions = "";
  protocol = "";
  readonly url: string;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string | URL) {
    super();
    this.url = String(url);
    setTimeout(() => {
      this.readyState = 1;
      this.#emit("open", new Event("open"));
      this.#say();
    }, 20);
  }
  #say() {
    this.#emit("message", new MessageEvent("message", { data: "{}" }));
  }
  #emit(type: "open" | "message" | "close", event: Event) {
    this.dispatchEvent(event);
    const handler = this[`on${type}`] as ((event: Event) => void) | null;
    handler?.call(this, event);
  }
  send(_data: unknown) {
    setTimeout(() => this.#say(), 5);
  }
  close() {
    this.readyState = 3;
    this.#emit("close", new CloseEvent("close"));
  }
}

let installed = false;
/** Puts the stand-in hub in place: before the shell connects (its onMount). */
export function install(): void {
  if (installed) {
    return;
  }
  installed = true;
  globalThis.WebSocket = StandInSocket as unknown as typeof WebSocket;
  const real = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input, init) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      location.href
    );
    if (url.origin !== location.origin || !url.pathname.startsWith("/api/")) {
      return real(input, init);
    }
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    return answer(url.pathname, method, String(init?.body ?? ""));
  };
}

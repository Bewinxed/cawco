/**
 * The made-up fleet the hero film shows: three machines (cloud, dev-vm,
 * laptop), three projects, sessions on all three harnesses, and the beats
 * the film plays on it. Every name is invented; nothing comes from a live hub.
 *
 * The film follows one session, ledger-api's "Speed up the invoices list"
 * on cloud: it asks to read a query plan (needs you), is approved, hands a
 * delegate to dev-vm, and the delegate reports back.
 *
 * `fleetAt(beats)` is the board after those beats have happened;
 * `framesSince` and `streamSince` are what a hub sends to carry a dashboard
 * from the board before a beat to the one after it.
 */
import type {
  AgentRow,
  InstanceRow,
  PermissionPresentation,
  SessionPulse,
  WorkItemSummary,
} from "../../../packages/core/src/index";
import type {
  TranscriptBlock,
  TranscriptEvent,
  TranscriptPage,
} from "../../../packages/core/src/transcript-types";

export const BEATS = [
  /** The focal session parks on a permission: needs you. */
  "ask",
  /** It is approved (the capture presses Approve): the command runs. */
  "answered",
  /** The plan comes back and the session says what it found. */
  "plan",
  /** It hands a delegate to dev-vm. */
  "delegate",
  /** The delegate is working; the focal session edits the query meanwhile. */
  "delegate-working",
  /** The delegate reports back and is done. */
  "report",
  /** The focal session says what the report means. */
  "done",
] as const;
export type Beat = (typeof BEATS)[number];

/** A fixed epoch, so every capture draws the same ages and clock times. */
export const NOW = Date.UTC(2026, 9, 15, 14, 32, 0);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const iso = (minutes: number) => new Date(NOW - minutes * MINUTE).toISOString();

const machine = (
  machineId: string,
  hostname: string,
  os: string
): AgentRow => ({
  auth: "authenticated",
  hostname,
  lastSeenAt: NOW,
  machineId,
  os,
  status: "online",
});

const MACHINES: AgentRow[] = [
  machine("m-cloud", "cloud", "linux"),
  machine("m-devvm", "dev-vm", "linux"),
  machine("m-laptop", "laptop", "darwin"),
];

const PROJECT_SEEDS = [
  {
    id: "p-ledger",
    name: "ledger-api",
    places: [
      { machineId: "m-cloud", path: "/srv/code/ledger-api" },
      { machineId: "m-devvm", path: "/home/sam/ledger-api" },
    ],
  },
  {
    id: "p-harbor",
    name: "harbor",
    places: [
      { machineId: "m-laptop", path: "/Users/sam/code/harbor" },
      { machineId: "m-cloud", path: "/srv/code/harbor" },
      { machineId: "m-devvm", path: "/home/sam/harbor" },
    ],
  },
  {
    id: "p-orbit",
    name: "orbit-ios",
    places: [{ machineId: "m-laptop", path: "/Users/sam/code/orbit-ios" }],
  },
];

const PROJECTS = PROJECT_SEEDS.map((seed) => ({
  appleGate: false,
  caw: false,
  createdAt: iso(60 * 24 * 20),
  id: seed.id,
  name: seed.name,
  places: seed.places.map((place, i) => ({
    createdAt: iso(60 * 24 * 20),
    id: `${seed.id}-place-${i}`,
    isPrimary: i === 0,
    kind: "checkout" as const,
    machineId: place.machineId,
    path: place.path,
    projectId: seed.id,
  })),
  primaryPlaceId: `${seed.id}-place-0`,
  remote: `github.com/fieldwork/${seed.name}`,
  review: false,
}));

/** The ids the beats act on. */
export const IDS = {
  ledger: "0d9e7c51-6b0a-4c3e-9f61-2a1b3c4d5e01",
  harborLead: "0d9e7c51-6b0a-4c3e-9f61-2a1b3c4d5e03",
  delegate: "7f3a2c90-1e4b-4d8a-a5c2-9b0e6f1d3a77",
} as const;

interface SessionSeed {
  harness: "claude" | "opencode" | "pi";
  id: string;
  machineId: string;
  /** Minutes since it last moved. */
  moved: number;
  parent?: string;
  project: string;
  role?: "delegate";
  started: number;
  title: string;
}

const SEEDS: SessionSeed[] = [
  {
    id: IDS.ledger,
    title: "Speed up the invoices list",
    harness: "claude",
    machineId: "m-cloud",
    project: "p-ledger",
    started: 14,
    moved: 0,
  },
  {
    id: IDS.harborLead,
    title: "Split the checkout form into steps",
    harness: "claude",
    machineId: "m-laptop",
    project: "p-harbor",
    started: 48,
    moved: 1,
  },
  {
    id: "0d9e7c51-6b0a-4c3e-9f61-2a1b3c4d5e04",
    title: "Validate the address step",
    harness: "claude",
    machineId: "m-cloud",
    project: "p-harbor",
    parent: IDS.harborLead,
    role: "delegate",
    started: 31,
    moved: 2,
  },
  {
    id: "0d9e7c51-6b0a-4c3e-9f61-2a1b3c4d5e05",
    title: "Port the payment step to the new API",
    harness: "opencode",
    machineId: "m-devvm",
    project: "p-harbor",
    parent: IDS.harborLead,
    role: "delegate",
    started: 29,
    moved: 3,
  },
  {
    id: "0d9e7c51-6b0a-4c3e-9f61-2a1b3c4d5e06",
    title: "Fix the flaky login redirect test",
    harness: "pi",
    machineId: "m-devvm",
    project: "p-harbor",
    started: 25,
    moved: 4,
  },
  {
    id: "0d9e7c51-6b0a-4c3e-9f61-2a1b3c4d5e07",
    title: "Add offline mode to the sync engine",
    harness: "claude",
    machineId: "m-laptop",
    project: "p-orbit",
    started: 64,
    moved: 5,
  },
];

const DELEGATE: SessionSeed = {
  id: IDS.delegate,
  title: "Try the invoices index on dev-vm",
  harness: "claude",
  machineId: "m-devvm",
  project: "p-ledger",
  parent: IDS.ledger,
  role: "delegate",
  started: 0,
  moved: 0,
};

const cwdOf = (seed: SessionSeed): string => {
  const project = PROJECT_SEEDS.find((one) => one.id === seed.project);
  const place = project?.places.find((one) => one.machineId === seed.machineId);
  return place?.path ?? "/srv/code";
};

const rowOf = (
  seed: SessionSeed,
  status: InstanceRow["status"],
  turnEndedAt: string | null = null
) =>
  ({
    accountId: seed.harness === "claude" ? ACCOUNT_ID : null,
    cwd: cwdOf(seed),
    harness: seed.harness,
    id: seed.id,
    launchDir: "known",
    lastRequestAt: iso(seed.moved),
    machineId: seed.machineId,
    model: seed.harness === "claude" ? "claude-opus-5-5" : null,
    parentInstanceId: seed.parent ?? null,
    projectId: seed.project,
    role: seed.role ?? null,
    // Opened when it started; the delegate, started on its own, never was.
    seenAt: seed.id === IDS.delegate ? null : iso(seed.started),
    sessionId: `sdk-${seed.id.slice(-4)}`,
    startedAt: iso(seed.started),
    status,
    title: seed.title,
    titleSource: "agent",
    turnEndedAt,
    updatedAt: iso(seed.moved),
  }) as InstanceRow;

const pulseOf = (
  instanceId: string,
  activity: SessionPulse["activity"],
  minutes = 0
): SessionPulse => ({
  activity,
  at: NOW - minutes * MINUTE,
  busy: activity === "working",
  currentTool: null,
  instanceId,
  runningSubagents: 0,
});

/* ── Usage: one invented Claude account ──────────────────────────────── */

const ACCOUNT_ID = "acc-sam";

/** As `/api/accounts` lists it. */
export const ACCOUNTS = {
  accounts: [
    {
      createdAt: NOW - 30 * 24 * HOUR,
      email: "sam@fieldwork.dev",
      hue: "amber",
      id: ACCOUNT_ID,
      identity: { email: "sam@fieldwork.dev", organization: null },
      kind: "subscription",
      label: null,
      neverBackup: false,
      order: 0,
      provider: "anthropic",
      reservePct: null,
    },
  ],
  bench: [],
  catalogs: [],
  readings: [],
  rebalances: [],
  routing: [
    {
      provider: "anthropic",
      delegates: { strategy: "spread" },
      yours: { strategy: "fill-first" },
    },
  ],
  signins: [],
};

/** Its 5-hour and weekly windows, as `/api/accounts/forecast` answers them. */
export const FORECAST = {
  provider: "anthropic",
  accounts: [
    {
      accountId: ACCOUNT_ID,
      bindingWindow: { kind: "weekly_all", scopeLabel: null },
      lastSeenAt: NOW - 2 * MINUTE,
      windows: [
        {
          kind: "session",
          pace: 9,
          resetsAt: new Date(NOW + 2.4 * HOUR).toISOString(),
          scopeLabel: null,
          utilization: 34,
        },
        {
          kind: "weekly_all",
          pace: 0.6,
          resetsAt: new Date(NOW + 70 * HOUR).toISOString(),
          scopeLabel: null,
          utilization: 41,
        },
      ],
    },
  ],
  delegates: [{ accountId: ACCOUNT_ID, from: NOW, to: NOW + HOUR }],
  yours: [{ accountId: ACCOUNT_ID, from: NOW, to: NOW + 5 * HOUR }],
};

/* ── The focal session's transcript ──────────────────────────────────── */

const LEDGER = "/srv/code/ledger-api";

const block = (
  id: string,
  type: TranscriptBlock["type"],
  content: string,
  minutes: number,
  metadata?: TranscriptBlock["metadata"],
  toolCallId?: string
): TranscriptBlock => ({
  content,
  id: `${IDS.ledger}-${id}`,
  instanceId: IDS.ledger,
  metadata,
  timestamp: iso(minutes),
  toolCallId: toolCallId ?? null,
  type,
});

const tool = (
  id: string,
  toolName: string,
  toolInput: Record<string, unknown>,
  minutes: number,
  toolResult = ""
) =>
  block(
    id,
    "tool.use",
    toolName,
    minutes,
    {
      toolId: `toolu-${id}`,
      toolInput,
      toolName,
      toolResult,
      toolStatus: "success",
    },
    `toolu-${id}`
  );

/** A pending copy of a tool block: how it arrives before its result. */
const pending = (done: TranscriptBlock): TranscriptBlock => ({
  ...done,
  metadata: { ...done.metadata, toolResult: "", toolStatus: "pending" },
});

const lines = (count: number, prefix: string) =>
  Array.from({ length: count }, (_, i) => `${prefix} ${i}`).join("\n");

const BEFORE: TranscriptBlock[] = [
  block(
    "u1",
    "user",
    "The invoices list takes about 4 seconds for our biggest accounts. Find out why and fix it.",
    14
  ),
  block("a1", "assistant", "Starting with how the list query is built.", 14),
  tool("r1", "Read", { file_path: `${LEDGER}/src/invoices/repository.ts` }, 13),
  tool(
    "g1",
    "Grep",
    { pattern: "listInvoices", path: "src" },
    13,
    "src/invoices/repository.ts\nsrc/invoices/routes.ts"
  ),
  tool("r2", "Read", { file_path: `${LEDGER}/src/db/schema.ts` }, 12),
  block(
    "a2",
    "assistant",
    "The list joins every line item before it paginates, so a large account sorts all of its lines for each page. I'll read the plan on the replica before changing anything.",
    1
  ),
];

const PLAN = [
  "Limit  (actual time=3901.877..3901.902 rows=50 loops=1)",
  "  ->  Sort  (actual time=3901.874..3901.889 rows=50 loops=1)",
  "        Sort Key: i.issued_at DESC",
  "        Sort Method: external merge  Disk: 61240kB",
  "        ->  Hash Join  (actual time=212.4..3318.6 rows=412880 loops=1)",
  "Execution Time: 3912.402 ms",
].join("\n");

const EXPLAIN = "psql $REPLICA_URL -f scripts/explain-invoices.sql";

const BASH = tool(
  "b1",
  "Bash",
  {
    command: EXPLAIN,
    description: "Read the invoices query plan on the replica",
  },
  0,
  PLAN
);

const SAYS_PLAN = block(
  "a3",
  "assistant",
  "3.9 seconds, nearly all of it a sort that spills to disk. An index on `(account_id, issued_at)` should remove it. A delegate will try that on dev-vm's copy while I rewrite the query to paginate first.",
  0
);

const BRIEF =
  "Add an index on invoices (account_id, issued_at) to dev-vm's copy of the database, run scripts/explain-invoices.sql before and after, and report both execution times.";

const HANDOFF: TranscriptBlock = block(
  "d1",
  "tool.handoff",
  "",
  0,
  {
    delegateInstanceId: IDS.delegate,
    delegateTitle: DELEGATE.title,
    handoffBrief: BRIEF,
    handoffKind: "delegate",
    toolId: "toolu-d1",
    toolInput: {
      brief: BRIEF,
      machine: "dev-vm",
      prompt: BRIEF,
      title: DELEGATE.title,
    },
    toolName: "mcp__cawco__delegate",
    toolResult: `Started ${DELEGATE.title} on dev-vm.`,
    toolStatus: "success",
  },
  "toolu-d1"
);

const EDIT = tool(
  "e1",
  "Edit",
  {
    file_path: `${LEDGER}/src/invoices/repository.ts`,
    old_string: lines(11, "old"),
    new_string: lines(18, "new"),
  },
  0
);

const HEADLINE =
  "With the index the sort is gone: 3,912 ms before, 41 ms after, on dev-vm's copy.";

/** The hub names a delegate `<checkout>#<short id>`; only the short id is stored. */
const SHORT = IDS.delegate.slice(0, 8);

const REPORT = block("p1", "user.peer", HEADLINE, 0, {
  peerName: `ledger-api#${SHORT}`,
  peerSession: SHORT,
  reportHeadline: HEADLINE,
  reportKind: "report",
});

const SAYS_DONE = block(
  "a4",
  "assistant",
  "The index takes the list from 3.9 s to 41 ms. I'll add it as a migration beside the query change.",
  0
);

/** What the transcript holds after the beats so far, oldest first. */
function blocksAt(had: (beat: Beat) => boolean): TranscriptBlock[] {
  const blocks = [...BEFORE];
  if (had("answered")) {
    blocks.push(had("plan") ? BASH : pending(BASH));
  }
  if (had("plan")) {
    blocks.push(SAYS_PLAN);
  }
  if (had("delegate")) {
    blocks.push(HANDOFF);
  }
  if (had("delegate-working")) {
    blocks.push(EDIT);
  }
  if (had("report")) {
    blocks.push(REPORT);
  }
  if (had("done")) {
    blocks.push(SAYS_DONE);
  }
  return blocks;
}

/* ── The ask ─────────────────────────────────────────────────────────── */

const REQUEST_ID = "req-ledger-explain-1";

const ASK: PermissionPresentation = {
  asker: "Speed up the invoices list",
  changes: [],
  command: EXPLAIN,
  fields: [],
  project: "ledger-api",
  summary: "Read the invoices query plan on the replica",
};

const askFrame = () => ({
  kind: "permission_request",
  harness: "claude",
  input: { command: EXPLAIN, description: ASK.summary },
  instanceId: IDS.ledger,
  presentation: ASK,
  raisedAt: NOW,
  requestId: REQUEST_ID,
  requestKind: "tool",
  toolName: "Bash",
  toolUseId: "toolu-b1",
});

/* ── The delegate's work item ────────────────────────────────────────── */

const workItem = (state: WorkItemSummary["state"]): WorkItemSummary => ({
  checkQueue: null,
  createdAt: NOW,
  dismissedAt: null,
  endedAt: state === "done" ? NOW : null,
  firstLines: {
    brief: BRIEF,
    result: state === "done" ? HEADLINE : "",
    error: "",
  },
  id: "wi-ledger-index",
  instanceId: IDS.delegate,
  leadInstanceId: null,
  parentInstanceId: IDS.ledger,
  queued: null,
  state,
  title: DELEGATE.title,
  waitReason: null,
  waitUntil: null,
});

/* ── The board ───────────────────────────────────────────────────────── */

const TAIL = {
  busy: true,
  currentTool: null,
  openBlock: null,
  streaming: "",
  streams: {},
  thinkingClosing: false,
  thinkingSince: null,
  thinkingStream: "",
};

export interface Fleet {
  blocks: TranscriptBlock[];
  framesSince: (before: Fleet, beat: Beat) => unknown[];
  instances: InstanceRow[];
  machines: AgentRow[];
  pending: unknown[];
  projects: typeof PROJECTS;
  pulses: Record<string, SessionPulse>;
  spend: Record<string, number | string>;
  /** The transcript events each session's stream carries for a beat. */
  streamSince: (before: Fleet, beat: Beat) => Record<string, TranscriptEvent[]>;
  workItems: WorkItemSummary[];
}

export function fleetAt(beats: readonly Beat[]): Fleet {
  const had = (beat: Beat) => beats.includes(beat);
  const asking = had("ask") && !had("answered");
  const seeds = had("delegate") ? [...SEEDS, DELEGATE] : SEEDS;
  const instances = seeds.map((seed) => {
    if (seed.id !== IDS.delegate) {
      return rowOf(seed, "running");
    }
    if (had("report")) {
      return rowOf(seed, "running", new Date(NOW).toISOString());
    }
    return rowOf(seed, had("delegate-working") ? "running" : "starting");
  });
  const pulses: Record<string, SessionPulse> = {};
  for (const seed of seeds) {
    let activity: SessionPulse["activity"] = "working";
    if (seed.id === IDS.ledger && asking) {
      activity = "blocked";
    }
    if (seed.id === IDS.delegate && had("report")) {
      activity = "idle";
    }
    // Each working session's turn began when it last moved, so the board
    // orders Working the same way every time it is drawn.
    pulses[seed.id] = pulseOf(seed.id, activity, seed.started);
  }
  const workItems = had("delegate")
    ? [workItem(had("report") ? "done" : "running")]
    : [];

  return {
    blocks: blocksAt(had),
    instances,
    machines: MACHINES,
    pending: asking
      ? [
          {
            verb: "frames",
            machineId: "m-cloud",
            instanceId: IDS.ledger,
            requestId: REQUEST_ID,
            payload: askFrame(),
          },
        ]
      : [],
    projects: PROJECTS,
    pulses,
    spend: {
      all: 1184.2,
      timeZone: "UTC",
      today: 38.6,
      todayStart: Date.UTC(2026, 9, 15),
      week: 212.4,
      weekStart: Date.UTC(2026, 9, 12),
    },
    workItems,
    framesSince: (before, beat) => {
      const frames: unknown[] = [];
      if (beat === "ask") {
        frames.push(askFrame());
      }
      if (beat === "answered") {
        frames.push({
          kind: "permission_settled",
          instanceId: IDS.ledger,
          outcome: "answered",
          requestId: REQUEST_ID,
          toolName: "Bash",
        });
      }
      const upserts = instances.filter(
        (row) =>
          JSON.stringify(row) !==
          JSON.stringify(before.instances.find((one) => one.id === row.id))
      );
      if (upserts.length > 0) {
        frames.push({ kind: "instances_delta", upserts, removed: [] });
      }
      for (const [id, pulse] of Object.entries(pulses)) {
        if (before.pulses[id]?.activity !== pulse.activity) {
          frames.push({
            kind: "pulse",
            instanceId: id,
            pulse: { ...pulse, at: NOW },
          });
        }
      }
      for (const item of workItems) {
        const was = before.workItems.find((one) => one.id === item.id);
        if (was?.state !== item.state) {
          frames.push({ kind: "work_item", instanceId: IDS.ledger, item });
        }
      }
      return frames;
    },
    streamSince: (_before, beat): Record<string, TranscriptEvent[]> => {
      const events: Record<Beat, TranscriptEvent[]> = {
        ask: [],
        answered: [{ type: "block.append", block: pending(BASH) }],
        plan: [
          { type: "block.update", block: BASH },
          { type: "block.append", block: SAYS_PLAN },
        ],
        delegate: [{ type: "block.append", block: HANDOFF }],
        "delegate-working": [
          { type: "block.append", block: pending(EDIT) },
          { type: "block.update", block: EDIT },
        ],
        report: [{ type: "block.append", block: REPORT }],
        done: [{ type: "block.append", block: SAYS_DONE }],
      };
      return events[beat].length > 0 ? { [IDS.ledger]: events[beat] } : {};
    },
  };
}

/** The newest page of a session's transcript, as `GET …/transcript` answers it. */
export function transcriptPage(
  fleet: Fleet,
  instanceId: string,
  seq: number
): TranscriptPage {
  const row = fleet.instances.find((one) => one.id === instanceId);
  return {
    blocks: instanceId === IDS.ledger ? fleet.blocks : [],
    branches: [],
    cursor: null,
    facts: {
      commands: { names: [], skills: [], detailed: null },
      harness: row?.harness ?? "claude",
      initialized: true,
      inits: 1,
      lastCompaction: null,
      lastTurnFailed: false,
      model: row?.model ?? null,
      permissionMode: "default",
      sdkStatus: null,
      sessionId: row?.sessionId ?? null,
      tooling: null,
      totalCost: null,
      turnsEnded: 0,
    },
    queued: [],
    seq,
    tail: { ...TAIL, busy: fleet.pulses[instanceId]?.busy ?? false },
    where: {
      cwd: row?.cwd ?? "",
      harness: row?.harness ?? "claude",
      machineId: row?.machineId ?? "",
      sessionKey: row?.sessionId ?? "",
    },
  };
}

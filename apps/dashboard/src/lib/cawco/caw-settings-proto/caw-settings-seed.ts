/**
 * The dashboard's stores as Caw's settings read them, fed through their own
 * writers for the states files (a story's `beforeEach` imports this, so its
 * frame has stores of its own): the project's machine `obelisk` with Claude
 * Code, Codex and OpenCode installed and `kestrel` away; three Claude
 * accounts signed in on obelisk, each with its catalog; what the
 * conversation started that still runs, as the hub's `initiated` lists it.
 */
import { type Account, CLAUDE_PROVIDER } from "@cawco/core/accounts";
import { CAPABILITIES_NONE } from "@cawco/core/harness";
import {
  EFFORT_LEVELS,
  type HarnessKind,
  type ModelInfo,
} from "@cawco/core/harness/kinds";
import { SHARED_MODES } from "@cawco/core/harness/modes";
import type { CawRunning } from "@cawco/core/project-conversation";
import { HOUR_MS } from "@cawco/core/time";
import { benchClaudeReport } from "../bench-reports";
import { accountsState } from "../stores/accounts.svelte";
import { holdMachines, type Machine } from "../stores/board.svelte";

export const MACHINE = { id: "obelisk", name: "obelisk" };
export const INSTALLED: HarnessKind[] = ["claude", "codex", "opencode"];

const NOW = Date.now();

/** What every account here shares: a Claude subscription, made forty days ago. */
const SUBSCRIPTION = {
  atPlanLimit: "move",
  createdAt: NOW - 40 * 24 * HOUR_MS,
  identity: null,
  kind: "subscription",
  neverBackup: false,
  provider: CLAUDE_PROVIDER,
  reservePct: null,
  sessionReservePct: null,
} as const satisfies Partial<Account>;

const ACCOUNTS: Account[] = [
  {
    ...SUBSCRIPTION,
    id: "jude",
    email: "jude@petralab.ai",
    hue: "amber",
    label: null,
    order: 0,
  },
  {
    ...SUBSCRIPTION,
    id: "research",
    email: "research-operations@petralab-industries.com",
    hue: "green",
    label: "Research ops",
    order: 1,
  },
  {
    ...SUBSCRIPTION,
    id: "design",
    email: "design-studio-shared-workspace@petralab-industries.com",
    hue: "cyan",
    label: "Design studio",
    order: 2,
  },
];

const model = (value: string, displayName: string): ModelInfo => ({
  value,
  displayName,
  supportedEffortLevels: [...EFFORT_LEVELS],
});
const CLAUDE_MODELS: ModelInfo[] = [
  model("claude-opus-5-5", "Opus 5.5"),
  model("claude-sonnet-5-5", "Sonnet 5.5"),
  model("claude-haiku-5-5", "Haiku 5.5"),
  model("claude-fable-5-2", "Fable 5.2"),
];
const CODEX_MODELS: ModelInfo[] = [
  model("gpt-5.5-codex", "GPT-5.5 Codex"),
  model("gpt-5.5-codex-mini", "GPT-5.5 Codex Mini"),
];
const OPENCODE_MODELS: ModelInfo[] = [
  model("opencode-go/deepseek-v4-pro", "DeepSeek V4 Pro"),
  model("opencode-go/kimi-k3", "Kimi K3"),
];

const report = (
  harness: HarnessKind,
  models: ModelInfo[]
): NonNullable<Machine["harnesses"]>[number] => ({
  harness,
  auth: "authenticated",
  installed: true,
  models,
  capabilities: {
    ...CAPABILITIES_NONE,
    // Codex and OpenCode have the shared modes; Auto is Claude Code's alone.
    permissionModes: SHARED_MODES.filter((mode) => mode !== "fullSend"),
    effort: true,
    setModel: true,
  },
});

const machine = (id: string, online: boolean): Machine => ({
  machineId: id,
  hostname: id,
  os: "linux-x64",
  auth: "authenticated",
  joinedAt: 0,
  pausedUntil: null,
  pauseStopped: null,
  status: online ? "online" : "offline",
  harnesses: [
    benchClaudeReport,
    report("codex", CODEX_MODELS),
    report("opencode", OPENCODE_MODELS),
  ],
});

/** What the conversation started that still runs: two attempts, a delegate under one, one on an away machine. */
export const RUNNING: CawRunning[] = [
  {
    id: "a41",
    cwd: "/home/bewinxed/.worktrees/cockpit-a41",
    kind: "attempt",
    machineId: "obelisk",
    offline: false,
    parentId: null,
    taskId: "tsk-288",
    taskTitle: "Fix the tray chip overflow on narrow screens",
    title: null,
  },
  {
    id: "d41a",
    cwd: "/home/bewinxed/.worktrees/cockpit-d41a",
    kind: "delegate",
    machineId: "obelisk",
    offline: false,
    parentId: "a41",
    taskId: null,
    taskTitle: null,
    title: "Measure chip widths at 390, 680 and 1440",
  },
  {
    id: "a47",
    cwd: "/home/bewinxed/.worktrees/cockpit-a47",
    kind: "attempt",
    machineId: "kestrel",
    offline: true,
    parentId: null,
    taskId: "tsk-301",
    taskTitle: "Name machines by hostname in the rail",
    title: null,
  },
];

/** Seeds the machines and the accounts, as the hub's snapshot would. */
export function seedCawSettings(): void {
  holdMachines([machine("obelisk", true), machine("kestrel", false)]);
  const ids = ACCOUNTS.map((one) => one.id);
  accountsState.accounts = {
    access: [],
    accounts: ACCOUNTS,
    bench: [],
    catalogFaults: [],
    catalogs: ids.map((accountId) => ({
      accountId,
      models: CLAUDE_MODELS,
      defaultEfforts: {},
      readAt: NOW - HOUR_MS,
    })),
    codexLeaving: [],
    codexSignins: [],
    credit: [],
    pending: [],
    readings: [],
    rebalances: [],
    routing: [],
    signins: ids.map((accountId) => ({
      accountId,
      machineId: MACHINE.id,
      state: "signed-in" as const,
      checkedAt: NOW,
      reason: null,
      refusalReach: null,
      movedAt: null,
      movedFrom: null,
    })),
  };
}

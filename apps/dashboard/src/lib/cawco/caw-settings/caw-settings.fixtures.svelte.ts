/**
 * What Caw's settings, his seat and the fleet's triggers are fed in their
 * states files, shaped as the hub answers them:
 *
 * - the dashboard's stores, fed through their own writers (a story's
 *   `beforeEach` imports this, so its frame has stores of its own): the
 *   project's machine `obelisk` with Claude Code, Codex and OpenCode
 *   installed and `kestrel` away; three Claude accounts signed in on
 *   obelisk, each with its catalog;
 * - what the conversation started that still runs, as the hub's
 *   `initiated` lists it;
 * - the fleet's defaults per kind and a project's own, resolved as the
 *   hub resolves them (core `triggerSettingInEffect`);
 * - the page's Caw as his switch and his seat read him ({@link FixtureCaw}).
 */
import { type Account, CLAUDE_PROVIDER } from "@cawco/core/accounts";
import { CAPABILITIES_NONE } from "@cawco/core/harness";
import {
  EFFORT_LEVELS,
  type HarnessKind,
  type ModelInfo,
} from "@cawco/core/harness/kinds";
import { SHARED_MODES } from "@cawco/core/harness/modes";
import type {
  CawRunning,
  CawStatus,
  ProjectConversationView,
} from "@cawco/core/project-conversation";
import { HOUR_MS } from "@cawco/core/time";
import {
  byTriggerKind,
  type CawFallback,
  type TriggerKind,
  type TriggerSetting,
  triggerSettingInEffect,
  UNSET_TRIGGER_SETTING as UNSET,
} from "@cawco/core/triggers";
import { cawSettingsWords } from "@cawco/core/words/caw-settings";
import { conversationWords } from "@cawco/core/words/project-conversation";
import { benchClaudeReport } from "../bench-reports";
import { accountsState } from "../stores/accounts.svelte";
import { holdMachines, type Machine } from "../stores/board.svelte";
import type { CawRunsAs, TriggerSettingsView } from "./caw-settings";

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
const RUNNING: CawRunning[] = [
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

/** What his chat runs as: Opus 5.5 on Claude Code in Accept edits, on Jude's account. */
export const CHAT: CawRunsAs = {
  account: "jude",
  harness: "claude",
  model: "claude-opus-5-5",
  mode: "acceptEdits",
};

/** The fleet's defaults per kind: comments run on Sonnet in Accept edits, routine results ask first; the rest fall to Caw's chat. */
export const FLEET: Record<TriggerKind, TriggerSetting> = {
  comments: {
    ...UNSET,
    harness: "claude",
    model: "claude-sonnet-5-5",
    mode: "acceptEdits",
  },
  "routine-results": { ...UNSET, mode: "default" },
  "task-moves": UNSET,
  "inbound-events": UNSET,
};

/** A layer setting nothing: the fleet's leaves every kind to each project's Caw, a project's inherits every field. */
export const KINDS_UNSET: Record<TriggerKind, TriggerSetting> = byTriggerKind(
  () => UNSET
);

/** Routine results set to run on Codex's mini model, the rest inherited. */
export const OWN_OVERRIDDEN: Record<TriggerKind, TriggerSetting> = {
  ...KINDS_UNSET,
  "routine-results": {
    ...UNSET,
    harness: "codex",
    model: "gpt-5.5-codex-mini",
  },
};

/** Each kind as the hub answers it: its own layer and what that puts in effect over the fleet's and his chat's. */
export function triggersOf(
  own: Record<TriggerKind, TriggerSetting>,
  chat: CawRunsAs,
  fleet: Record<TriggerKind, TriggerSetting> = FLEET
): TriggerSettingsView {
  const caw: CawFallback = {
    account: chat.account,
    harness: chat.harness,
    model: chat.model,
  };
  return {
    kinds: byTriggerKind((kind) => ({
      own: own[kind],
      inEffect: triggerSettingInEffect(own[kind], fleet[kind], caw),
    })),
  };
}

/** The hub's words as it refuses a change: the project is moving machines. */
export const REFUSED = "The project is moving to kestrel (409)";

/**
 * The page's Caw as his switch (CawLeadSwitch's `SwitchedLead`) and his
 * seat (CawSeat's `SeatedLead`) read him: on or off, his view with what he
 * started still running, and his switch's answer, taken or refused with
 * {@link REFUSED}.
 */
export class FixtureCaw {
  on = $state<boolean | null>(true);
  moving = $state(false);
  refused = $state<string | null>(null);
  flippedAt = $state<string | null>(null);
  #view = $state<ProjectConversationView | null>(null);
  readonly #running: boolean;
  readonly #refuses: boolean;
  /** His seat, as CawSeat reads it: drawn, at rest, standing nowhere else. */
  readonly anchor = null;
  readonly holds = true;
  readonly inPanel = false;
  readonly shown = true;
  open = false;
  seat(): () => void {
    return () => undefined;
  }

  constructor(options: { on: boolean; running: boolean; refuses: boolean }) {
    this.on = options.on;
    this.#running = options.running;
    this.#refuses = options.refuses;
  }

  get view(): ProjectConversationView | null {
    return this.#view;
  }
  set view(next: ProjectConversationView | null) {
    this.#view = next;
    if (next) {
      this.on = next.on;
    }
  }

  #viewOf(on: boolean): ProjectConversationView {
    return {
      attemptsHearComments: true,
      changesSettings: false,
      harness: CHAT.harness,
      hearsTasks: true,
      instanceId: "caw-cockpit",
      mode: CHAT.mode,
      model: CHAT.model,
      on,
      problem: null,
      running: this.#running ? RUNNING : [],
      spendUsd: 41.2,
      starting: false,
      startingId: null,
    };
  }

  /** His switch's ask (CawLead `configure`), answered at once. */
  configure(change: { on?: boolean }): Promise<void> {
    if (this.#refuses) {
      this.refused = cawSettingsWords.refused(
        change.on === false
          ? cawSettingsWords.stillAwake
          : cawSettingsWords.stillAsleep,
        REFUSED
      );
      return Promise.resolve();
    }
    this.refused = null;
    this.view = this.#viewOf(change.on ?? this.on ?? true);
    return Promise.resolve();
  }

  /** His view read again: what still runs (CawLead `read`). */
  read(): Promise<void> {
    this.#view = this.#viewOf(this.on ?? true);
    return Promise.resolve();
  }

  /** His face's status at his seat: asleep while off, else at rest. */
  readonly status = $derived.by((): CawStatus => {
    if (this.on === null) {
      return "loading";
    }
    return this.on ? "ready" : "sleeping";
  });

  readonly sentence = $derived(
    this.on === false
      ? conversationWords.status.off
      : conversationWords.status.ready
  );
}

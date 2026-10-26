/**
 * Usage, cost & limits types — the shared vocabulary for the usage feature
 * (USAGE-SPEC.md §4.1). Pure types only; no runtime imports.
 */

export type UsageHarness = "claude" | "opencode";

export interface UsageTokens {
  cacheCreation: number; // Claude: see cacheCreationCount() rule in tokens.ts
  /**
   * The part of `cacheCreation` written with a 1-hour lifetime, priced at its
   * own rate; absent when the source does not split it, so every write is
   * priced as a 5-minute one.
   */
  cacheCreation1h?: number;
  cacheRead: number;
  input: number;
  output: number;
  /**
   * OpenCode only, 0 for Claude: reasoning tokens, which OpenCode counts apart
   * from `output` and which bill at the output rate ("charge reasoning tokens
   * at the same rate as output tokens", OpenCode's `Session.getUsage`).
   */
  reasoning: number;
}

/**
 * One (session, model, quarter hour) bucket. The unit the agent reports and
 * the hub stores. The hub also keeps rows stored before quarters, an hour
 * long; `spanMs` says which a row is.
 */
export interface UsageBucket {
  costUsd: number;
  firstTs: number; // ms epoch of the earliest record in the bucket
  harness: UsageHarness;
  lastTs: number; // ms epoch of the latest record in the bucket
  messages: number;
  model: string;
  project: string; // Claude: dir name after `projects/`. opencode: basename of the session's worktree
  projectPath: string | null;
  provider: string | null; // opencode only
  sessionId: string;
  /** How long the bucket runs: `BUCKET_MS`, a quarter hour. */
  spanMs: number;
  /** ms epoch the bucket starts at, floored to `BUCKET_MS` (`bucketStart`). */
  start: number;
  tokens: UsageTokens;
}

/**
 * One plan window, whoever meters it. `group` names how long the window runs:
 * `session` is a 5-hour window (Claude's `five_hour`, OpenCode Go's `rolling`),
 * `weekly` runs 7 days, `monthly` runs one calendar month to `resetsAt`.
 * `percent` is the share USED, 0–100 (it can pass 100).
 */
export interface LimitWindow {
  group: "session" | "weekly" | "monthly" | string;
  isActive: boolean;
  kind: string; // 'session' | 'weekly_all' | 'weekly_scoped' | 'rolling' | 'weekly' | 'monthly'
  percent: number;
  resetsAt: string | null; // ISO
  scopeLabel: string | null; // scope.model.display_name, e.g. "Fable"
  severity: "normal" | "warning" | "critical" | string;
}

/**
 * The OpenCode Go plan's three windows, read from
 * `GET https://opencode.ai/zen/go/v1/usage` with the machine's `opencode-go`
 * key. Absent (null) on a machine with no Go key. `stale` is set when a read
 * failed and the last good windows are served with the error attached.
 */
export interface OpenCodeGoLimits {
  error: string | null;
  fetchedAt: number;
  stale?: boolean;
  windows: LimitWindow[];
}

/**
 * How long an account's reading stands as current after the last word on it:
 * a `rate_limit_event`, or a turn on the account that ended without one
 * (Claude Code emits the event whenever a window's rounded percent or reset
 * moves, so a turn with none confirms the reading). Past this it is stale:
 * use from anywhere else (claude.ai, another client) goes unseen.
 */
export const CLAUDE_READING_CURRENT_MS = 60 * 60_000;

/**
 * A Claude account's limits, as its sessions' Claude Code reported them
 * (`rate_limit_event`, `accountInfo()`). A window whose `resetsAt` has passed
 * with no newer report reads 0%.
 */
export interface ClaudeLimits {
  /**
   * Why there are no windows, in words. Kept beside {@link errorKind} for the
   * shipped app, which compares it to "not signed in"; a reader decides on
   * `errorKind`.
   */
  error: string | null;
  /**
   * Why there are no windows, typed: `not-signed-in`, the account is signed
   * in on no machine; `no-reading`, nothing on the account has reported any
   * yet. Null when there are windows.
   */
  errorKind: ClaudeLimitsGap | null;
  /** Extra usage as the last `rate_limit_event` said; null: it never said. */
  extraUsage: ClaudeExtraUsage | null;
  /**
   * When the windows were last known to be so: Claude Code's last report on
   * the account, or a later turn on it that changed nothing.
   */
  fetchedAt: number;
  /**
   * Nothing on the account has confirmed the windows for
   * {@link CLAUDE_READING_CURRENT_MS}: they are as of `fetchedAt`.
   */
  stale: boolean;
  subscription: string | null; // subscriptionType
  windows: LimitWindow[];
}

/** Why a {@link ClaudeLimits} has no windows. */
export type ClaudeLimitsGap = "not-signed-in" | "no-reading";

/** Extra usage: requests past the plan's limits, paid as they go. */
export interface ClaudeExtraUsage {
  /** Whether the account is spending extra usage now (`isUsingOverage`). */
  inUse: boolean;
  /**
   * Why it is off, in words from Claude Code's `overageDisabledReason`
   * ("out of credits"); null when on or when it gave no reason worth saying.
   */
  offReason: string | null;
  /** Whether requests past the plan may run as extra usage (`overageStatus`). */
  on: boolean;
  /** When extra usage resets, when Claude Code said. */
  resetsAt: string | null;
}

/**
 * How `/api/usage/summary` folds the buckets it returns (USAGE-SPEC.md §6.3).
 * `start` is one group per bucket start, a quarter hour (an hour for rows
 * stored before quarters): a reader folds them into hours or days on its own
 * clock, so no fold here picks a zone.
 */
export type UsageGroupBy =
  "machine" | "model" | "project" | "session" | "start";

/** The machine a summary row ran on: named, never shown by id. */
export interface UsageRowMachine {
  hostname: string;
  id: string;
  os: string;
}

/**
 * One aggregated group in a usage summary. `key` is the group's identity (a
 * session id, a machine id, an hour's epoch ms); `label` is what a reader is
 * shown. Session rows carry their machine and the instance that ran them (null
 * for a session run outside CawCo); machine rows carry the machine.
 */
export interface UsageSummaryRow {
  cacheCreation: number;
  cacheRead: number;
  costUsd: number;
  input: number;
  instanceId: string | null;
  key: string | number;
  label: string;
  machine: UsageRowMachine | null;
  messages: number;
  output: number;
  reasoning: number;
}

/** The whole-window sums a summary's groups roll up to. */
export interface UsageTotals {
  cacheCreation: number;
  cacheRead: number;
  costUsd: number;
  input: number;
  messages: number;
  output: number;
  reasoning: number;
}

/** What `/api/usage/summary` returns: the groups, their totals, and unpriced models. */
export interface UsageSummary {
  missingPricing: string[];
  rows: UsageSummaryRow[];
  totals: UsageTotals;
}

/**
 * The fleet's real spend, as the hub reckons it and serves it at
 * `/api/usage/spend` and on every `kind: 'usage'` frame: the one figure every
 * "today" in CawCo reads.
 *
 * Real money is opencode's messages, each priced by CawCo at its provider's
 * rates and its prompt's tier (`costForUsage`); Claude is a subscription
 * whose constraint is a percentage, so its API-price estimate is never added
 * in. The days are the hub's: `todayStart` is local midnight and `weekStart`
 * this Monday's midnight in `timeZone`, the hub's own zone (IANA name).
 */
export interface UsageSpend {
  all: number;
  timeZone: string;
  today: number;
  todayStart: number;
  week: number;
  weekStart: number;
}

/**
 * One machine's line in a `kind: 'usage'` frame's `limits`, a BRIDGE (hub
 * scripts/wire-compat.ts) for TestFlight ios 20261018, which reads limits
 * per machine: its OpenCode Go plan, and the limits of the first Claude
 * account signed in there. Goes once that build is no longer installable,
 * 2027-01-16.
 */
export interface UsageLimitsReading {
  fetchedAt: string | number | Date;
  machineId: string;
  openCodeGo: OpenCodeGoLimits | null;
  payload: ClaudeLimits;
}

/** One Claude account's own limits, named by its account. */
export interface AccountLimits {
  accountId: string;
  limits: ClaudeLimits;
}

/** One machine's OpenCode Go plan, read with that machine's Go key. */
export interface MachineGoLimits {
  hostname: string;
  machineId: string;
  plan: OpenCodeGoLimits;
}

/**
 * What `/api/usage/limits` returns: each Claude account's own limits, and
 * each machine's OpenCode Go plan. Claude's limits are an account's, never a
 * machine's: a machine signed in to several accounts has no one reading.
 */
export interface UsageLimitsResponse {
  claude: AccountLimits[];
  openCodeGo: MachineGoLimits[];
}

/**
 * The real transcript `message.usage` shape (USAGE-SPEC.md §2.3). Field names
 * are the on-disk snake_case, not the neutral {@link UsageTokens}.
 */
export interface RawClaudeUsage {
  cache_creation?: {
    ephemeral_5m_input_tokens?: number;
    ephemeral_1h_input_tokens?: number;
  };
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  input_tokens: number;
  output_tokens: number;
  service_tier?: string;
  speed?: string;
}

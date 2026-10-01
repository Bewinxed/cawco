/**
 * Usage, cost & limits types — the shared vocabulary for the usage feature
 * (USAGE-SPEC.md §4.1). Pure types only; no runtime imports.
 */

export type UsageHarness = "claude" | "opencode";

export interface UsageTokens {
  cacheCreation: number; // Claude: see cacheCreationCount() rule in tokens.ts
  cacheRead: number;
  input: number;
  output: number;
  reasoning: number; // opencode only; 0 for Claude
}

/** One (session, model, hour) bucket. The unit the agent reports and the hub stores. */
export interface UsageBucket {
  costUsd: number;
  firstTs: number; // ms epoch of the earliest record in the bucket
  harness: UsageHarness;
  hourStart: number; // ms epoch, floored to the UTC hour
  lastTs: number; // ms epoch of the latest record in the bucket
  messages: number;
  model: string;
  project: string; // Claude: dir name after `projects/`. opencode: basename(path.root)
  projectPath: string | null;
  provider: string | null; // opencode only
  sessionId: string;
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

export interface ClaudeLimits {
  error: string | null;
  fetchedAt: number;
  planTier: string | null; // rateLimitTier
  /**
   * Extra usage: the pay-as-you-go real money spent past the plan this month,
   * and its monthly cap, in dollars (the API's `spend.used` / `spend.limit`
   * money objects). Null when not reported; the cap is null with extra usage
   * off. `spendResetsAt` is when the cap resets (ISO), only when the API
   * says; null otherwise, never guessed.
   */
  spendLimit: number | null;
  spendResetsAt: string | null;
  spendUsed: number | null;
  /** Set when a fetch failed and the caller is served the last good reading. */
  stale?: boolean;
  subscription: string | null; // subscriptionType
  windows: LimitWindow[];
}

/**
 * One machine's latest limit reading, as the hub stores it (`usage_limits`)
 * and broadcasts it in a `kind: 'usage'` frame. `fetchedAt` is a `Date` inside
 * the hub and the ISO string it serialises to on the wire.
 */
export interface UsageLimitsReading {
  fetchedAt: string | number | Date;
  machineId: string;
  openCodeGo: OpenCodeGoLimits | null;
  payload: ClaudeLimits;
}

/** How `/api/usage/summary` folds the buckets it returns (USAGE-SPEC.md §6.3). */
export type UsageGroupBy =
  | "day"
  | "hour"
  | "machine"
  | "model"
  | "project"
  | "session";

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

/** What `/api/usage/limits` returns: every machine's latest readings. */
export interface UsageLimitsResponse {
  machines: {
    hostname: string;
    limits: ClaudeLimits;
    machineId: string;
    openCodeGo: OpenCodeGoLimits | null;
  }[];
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

/**
 * The opencode `message.data` JSON (USAGE-SPEC.md §2.3). Mind the capitalized
 * `sessionID` / `providerID` / `modelID` — they are not the neutral casing.
 */
export interface RawOpenCodeMessage {
  cost?: number;
  id: string;
  modelID?: string;
  path?: { cwd?: string; root?: string };
  providerID?: string;
  role: string;
  sessionID: string;
  time?: { created?: number };
  tokens?: {
    input?: number;
    output?: number;
    reasoning?: number;
    cache?: { read?: number; write?: number };
  };
}

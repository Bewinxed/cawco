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
  project: string; // Claude: dir name after `projects/`. opencode: basename(path.root)
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
 * A Claude account's limits, as its sessions' Claude Code reported them
 * (`rate_limit_event`, `accountInfo()`). A window whose `resetsAt` has passed
 * with no newer report reads 0%.
 */
export interface ClaudeLimits {
  /** Why there are no windows: nothing on the account has reported any yet. */
  error: string | null;
  /** When Claude Code last reported on the account. */
  fetchedAt: number;
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

/**
 * How `/api/usage/summary` folds the buckets it returns (USAGE-SPEC.md §6.3).
 * `start` is one group per bucket start, a quarter hour (an hour for rows
 * stored before quarters): a reader folds them into hours or days on its own
 * clock, so no fold here picks a zone.
 */
export type UsageGroupBy =
  | "machine"
  | "model"
  | "project"
  | "session"
  | "start";

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
 * Real money is opencode's own per-message cost; Claude is a subscription
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
 * What `/api/usage/limits` returns: every machine's latest readings. A
 * machine's Claude limits are those of the account it runs Claude Code on by
 * default (its `~/.claude` login), else of the first account signed in there.
 */
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

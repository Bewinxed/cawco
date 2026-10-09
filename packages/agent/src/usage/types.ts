import type { UsageHarness, UsageTokens } from "@cawco/core";

/**
 * One normalized usage record, harness-agnostic. The scanners reduce their
 * on-disk shapes (Claude JSONL, opencode SQLite) into this, and the
 * orchestrator dedups and folds them into {@link UsageBucket}s.
 */
export interface ScannedRecord {
  costUsd: number;
  harness: UsageHarness;
  /** Claude only; false for opencode. */
  isSidechain: boolean;
  /** Dedup identity. Claude: `message.id`. opencode: the DB `id` column. */
  messageId: string;
  model: string;
  project: string;
  projectPath: string | null;
  provider: string | null;
  /** Claude only; null for opencode. */
  requestId: string | null;
  sessionId: string;
  tokens: UsageTokens;
  ts: number; // ms epoch
}

import type { RawClaudeUsage, UsageTokens } from "./types";

/**
 * ccusage rule (types.rs:42-49): if `cache_creation` is PRESENT, the ephemeral
 * 5m+1h pair replaces `cache_creation_input_tokens` entirely — the flat field is
 * ignored, not added. Switch on presence, not on value.
 */
export const cacheCreationCount = (u: RawClaudeUsage): number =>
  u.cache_creation
    ? (u.cache_creation.ephemeral_5m_input_tokens ?? 0) +
      (u.cache_creation.ephemeral_1h_input_tokens ?? 0)
    : (u.cache_creation_input_tokens ?? 0);

export const totalTokens = (t: UsageTokens): number =>
  t.input + t.output + t.cacheCreation + t.cacheRead + t.reasoning;

const HOUR_MS = 60 * 60 * 1000;

/** The UTC hour a timestamp falls in: a usage bucket's `hourStart`. */
export const floorToHour = (ts: number): number =>
  Math.floor(ts / HOUR_MS) * HOUR_MS;

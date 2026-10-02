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

/**
 * How long one usage bucket runs: a quarter hour. Every UTC offset in use is a
 * whole number of quarter hours, so any zone's midnight falls on a bucket
 * boundary and a day's sum never has to split a bucket.
 */
export const BUCKET_MS = 15 * 60 * 1000;

/** The quarter hour a timestamp falls in: a usage bucket's `start`. */
export const bucketStart = (ts: number): number =>
  Math.floor(ts / BUCKET_MS) * BUCKET_MS;

import type {
  SessionHistory,
  SessionHistoryOptions,
  SessionMessage,
} from "@cawco/core";

export const HISTORY_LIMIT = 200;
export const historyLimit = (limit?: number): number => {
  if (
    limit !== undefined &&
    (!Number.isInteger(limit) || limit < 1 || limit > 1000)
  ) {
    throw new Error(
      "getSessionHistory limit must be an integer from 1 to 1000"
    );
  }
  return limit ?? HISTORY_LIMIT;
};

const blocksOf = (
  entry: SessionMessage
): { type: string; id?: string; tool_use_id?: string }[] => {
  const content = (entry.message as { content?: unknown } | null)?.content;
  return Array.isArray(content) ? content : [];
};

/** Widen a source seam until every result has its call and every brief its boundary. */
export function historyStart(
  entries: SessionMessage[],
  end: number,
  limit: number
): number {
  let start = Math.max(0, end - limit);
  const calls = new Map<string, number>();
  entries.slice(0, end).forEach((entry, i) => {
    for (const block of blocksOf(entry)) {
      if (block.type === "tool_use" && block.id) {
        calls.set(block.id, i);
      }
    }
  });
  for (let i = end - 1; i >= start; i -= 1) {
    if (entries[i].compactSummary && i > 0) {
      const prior = entries[i - 1];
      if (
        prior.type === "system" &&
        (prior.message as { subtype?: string }).subtype === "compact_boundary"
      ) {
        start = Math.min(start, i - 1);
      }
    }
    for (const block of blocksOf(entries[i])) {
      if (block.type === "tool_result" && block.tool_use_id) {
        start = Math.min(start, calls.get(block.tool_use_id) ?? start);
      }
    }
  }
  return start;
}

/** A normalized chain page, with no cursor derived from a count or file order. */
export function historyPage(
  entries: SessionMessage[],
  options: SessionHistoryOptions,
  complete = true,
  incomplete?: string
): SessionHistory {
  const end =
    options.before === undefined
      ? entries.length
      : entries.findIndex((entry) => entry.uuid === options.before);
  if (end < 0) {
    throw new Error(
      "getSessionHistory cursor is no longer on the conversation's line"
    );
  }
  const start = historyStart(entries, end, historyLimit(options.limit));
  return {
    entries: entries.slice(start, end),
    cursor: start > 0 || !complete ? (entries[start]?.uuid ?? null) : null,
    complete: start === 0 && complete,
    ...(incomplete ? { incomplete } : {}),
  };
}

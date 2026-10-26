/**
 * A `finish_item` report that points at the chat instead of carrying the
 * work. The parent reads only the report (work-items.ts `report`): a leaf's
 * chat messages reach no one, so "the deliverable is the previous assistant
 * message in full" hands in nothing. Three leaves did that on 2026-10-23 and
 * each had to be reopened to write its options or table to a file.
 *
 * The check is narrow by intent: it refuses a phrase that names the leaf's own
 * chat as where the result is, and lets every other use of "above",
 * "message" or "chat" pass (a report about a chat UI, "the env entry shown
 * above", "the last message from the hub").
 */

/** Words that order or count the leaf's own messages: "my last", "my two chat". */
const ORDINAL =
  "(?:previous|last|earlier|prior|preceding|final|first|second|two|three|four|\\d+|chat|assistant|own)";
const MESSAGE = "(?:messages?|repl(?:y|ies)|responses?)";

/** Each pattern is one way a report points at the chat; its match is quoted in the refusal. */
const POINTERS: readonly RegExp[] = [
  // "my previous message", "my two chat messages to you", "my last reply".
  new RegExp(`\\bmy\\s+(?:${ORDINAL}\\s+){1,3}${MESSAGE}\\b`, "iu"),
  // "my message above", "the reply above", "the messages above".
  new RegExp(
    `\\b(?:my|the)\\s+(?:${ORDINAL}\\s+){0,3}${MESSAGE}\\s+above\\b`,
    "iu"
  ),
  // "The report is the previous message", "see the last assistant message".
  new RegExp(
    `\\b(?:is|are|was|were|in|see)\\s+the\\s+(?:previous|last|earlier|prior|preceding)\\s+(?:assistant\\s+|chat\\s+)?${MESSAGE}\\b`,
    "iu"
  ),
  // "report delivered above.", "the options are above", "written above in full".
  /\b(?:delivered|posted|sent|written|given|provided|pasted|returned|is|are|was|were)\s+above(?=\s*(?:[.,;:!)]|$|in\s+full\b|in\s+(?:the|this|my)\s+(?:chat|conversation)\b))/imu,
  // "earlier in this conversation", "above in the chat", "in my chat".
  /\b(?:earlier|above)\s+in\s+(?:the|this|our)\s+(?:chat|conversation|session|thread)\b/iu,
  /\b(?:in|see)\s+(?:my|our)\s+(?:chat|conversation)\b/iu,
  /\b(?:written|posted|sent|given|delivered|answered|replied|laid\s+out|listed)\s+(?:it\s+)?in\s+(?:the\s+)?chat\b/iu,
];

/** "See above." with nothing above it in the report: it can only mean the chat. */
const BARE_ABOVE = /\b(?:see|as|is|are)\s+above\b/iu;
/** Characters of report before a bare "see above" that still count as nothing above it. */
const NOTHING_ABOVE = 40;

/**
 * Quoted words: code fences, inline code, and "…" or “…” spans. A report that
 * quotes a phrase talks about it rather than pointing with it.
 */
const QUOTED = /```[\s\S]*?```|`[^`\n]*`|"[^"\n]*"|“[^”\n]*”/gu;

/**
 * The phrase in `report` that points at the chat as where the result is, or
 * undefined when the report carries its own work. Quoted words are skipped.
 */
export const chatPointer = (report: string): string | undefined => {
  const text = report.replace(QUOTED, (quoted) => " ".repeat(quoted.length));
  for (const pattern of POINTERS) {
    const found = pattern.exec(text);
    if (found) {
      return found[0];
    }
  }
  const bare = BARE_ABOVE.exec(text);
  // Quoted words above it are still above it: measured on the report itself.
  if (
    bare &&
    report.slice(0, bare.index).replace(/\s+/gu, "").length < NOTHING_ABOVE
  ) {
    return bare[0];
  }
  return undefined;
};

/** What `finish_item` answers a report that points at the chat: why, and what to send instead. */
export const chatPointerRefusal = (phrase: string): string =>
  `Not finished: your report points at the chat for its result ("${phrase}"). Your parent reads this report and nothing else; your chat messages reach no one. Put the deliverable itself in summary, whole: the options, the table, the findings, the commands with their output. A long one goes in a file in the repository or in the item's outputs, and summary names its path. Then call finish_item again.`;

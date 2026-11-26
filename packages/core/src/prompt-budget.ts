/**
 * How much a prompt may carry, computed where it is built and never counted
 * out by hand: the model's window, less what it writes and the prompt's fixed
 * part, in characters. A list or a text cut to fit says so in the text it cuts.
 */
import { SUMMARY_CAP_TOKENS } from "./continuation";
import { keysOf } from "./keys-of";

/**
 * The characters a token holds in the prompts CawCo builds, which are mostly
 * code, JSON and logs.
 */
// @limit measured: the model's window (claude_context_windows, or its catalog entry) less its output reserve and the prompt's fixed part, at 2.45 characters a token over 22,145 tool results in the fleet's transcripts (2026-07-25 to 2026-11-26)
const CHARS_PER_TOKEN = 2.45;

/** The window of the smallest Claude model the fleet runs: what a prompt for any of them fits. */
// @limit measured: 200,000 tokens, the smallest window a Claude model reported (claude_context_windows on the hub, 2026-11-26)
export const CLAUDE_WINDOW_TOKENS = 200_000;

/** The window of Jev, the hub's small judge. */
// @limit external: Jev's context is 32,000 tokens (OpenRouter's catalog entry, .design-foundations/plans/2026-09-23-jev-typesafe.md)
export const JEV_WINDOW_TOKENS = 32_000;

/** What a prompt's text may come to, in characters: `windowTokens` less what the model writes ({@link SUMMARY_CAP_TOKENS}) and the prompt's fixed part, `fixedChars`. */
export const promptBudgetChars = (
  windowTokens: number,
  fixedChars = 0
): number =>
  Math.max(
    0,
    Math.floor((windowTokens - SUMMARY_CAP_TOKENS) * CHARS_PER_TOKEN) -
      fixedChars
  );

/** `budget` dealt to the parts named in `weights`, each in its proportion of their sum. */
export const shareOut = <Part extends string>(
  budget: number,
  weights: Record<Part, number>
): Record<Part, number> => {
  const parts = keysOf(weights);
  const whole = parts.reduce((sum, part) => sum + weights[part], 0);
  const dealt = { ...weights };
  for (const part of parts) {
    dealt[part] = Math.floor((budget * weights[part]) / whole);
  }
  return dealt;
};

/** `text` with its last `kept` characters, opening in how many of its characters were left out, or whole when it fits. */
export const cutToTail = (text: string, kept: number): string =>
  text.length > kept
    ? `… (${text.length - kept} of ${text.length} characters left out) ${text.slice(-kept)}`
    : text;

/** `text` with its first `kept` characters, closing in how many of its characters were left out, or whole when it fits. */
export const cutToHead = (text: string, kept: number): string =>
  text.length > kept
    ? `${text.slice(0, kept)} … (${text.length - kept} of ${text.length} characters left out)`
    : text;

/**
 * The first of `items` whose rendered lines fit in `kept` characters, with
 * the count of the rest said after them ("N of M"), or all of them when they fit.
 */
export const listWithin = (
  items: readonly string[],
  kept: number,
  between = "\n"
): string => {
  let used = 0;
  let count = 0;
  for (const item of items) {
    const next = used + item.length + (count > 0 ? between.length : 0);
    if (next > kept && count > 0) {
      break;
    }
    used = next;
    count += 1;
  }
  const shown = items.slice(0, count).join(between);
  return count < items.length
    ? `${shown}${between}… (${count} of ${items.length} shown)`
    : shown;
};

/** `items` kept in order while their `size` (their JSON's length) fits `kept` characters, at least the first: the rest are left out, and the caller says "N of M". */
export const fitItems = <Item>(
  items: readonly Item[],
  kept: number,
  size: (item: Item) => number = (item) => JSON.stringify(item).length
): Item[] => {
  let used = 0;
  const fitting: Item[] = [];
  for (const item of items) {
    used += size(item);
    if (used > kept && fitting.length > 0) {
      break;
    }
    fitting.push(item);
  }
  return fitting;
};

/** The most characters of a tool's answer Claude Code passes on to the model. */
// @limit measured: Claude Code holds an MCP answer to 25,000 tokens (MAX_MCP_OUTPUT_TOKENS, https://code.claude.com/docs/en/env-vars); at 2.45 characters a token, measured over 22,145 tool results (fleet transcripts, 2026-07-25 to 2026-11-26), that is 61,250 characters
const MCP_ANSWER_TOKENS = 25_000;
export const TOOL_ANSWER_CHARS = Math.floor(
  MCP_ANSWER_TOKENS * CHARS_PER_TOKEN
);

/** The part of a tool's answer that `chars` was when an answer held 60,000 characters: the same share of {@link TOOL_ANSWER_CHARS}. */
export const answerShare = (chars: number): number =>
  Math.floor((TOOL_ANSWER_CHARS * chars) / 60_000);

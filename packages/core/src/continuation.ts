/**
 * "Continue in new session": the size rules the hub enforces and the
 * dashboard's pickers show, stated once so both say the same thing.
 */

/** The words a continuation stopped by its Cancel ends with. */
export const CONTINUATION_CANCELLED = "the continuation was cancelled";

/** The summariser's answer is asked to stay under this; the opening budgets for it. */
export const SUMMARY_CAP_TOKENS = 8000;
/** Room a summariser needs beyond what it reads, for what it writes. */
export const SUMMARISER_OUTPUT_RESERVE_TOKENS = 16_000;
/** Room the new session needs beyond its opening message, to do any work. */
export const TARGET_HEADROOM_TOKENS = 32_000;

/**
 * Tokens in `chars` characters of transcript text: four characters a token,
 * plus 15% headroom for code, paths and JSON, which tokenize denser than prose.
 */
export const estimateTokens = (chars: number): number =>
  Math.ceil((chars / 4) * 1.15);

/**
 * Why a model with `window` tokens of context cannot take `needed` tokens, or
 * nothing when it can. An unknown window refuses: nothing is guessed.
 */
export function contextFitRefusal(
  window: number | undefined,
  needed: number
): string | undefined {
  if (!window) {
    return "context window unknown";
  }
  return window >= needed
    ? undefined
    : `needs ${Math.ceil(needed / 1000)}k context, has ${Math.floor(window / 1000)}k`;
}

/**
 * The effort scale the product offers, in the order the API names it: from the
 * level that thinks least to the one that thinks hardest. Unlike the permission
 * modes next door, the labels are the API's own words — a reader who moves
 * between this slider and Anthropic's docs should be reading one vocabulary,
 * and "extra high" would be our paraphrase of a name that already exists.
 *
 * The descriptions are Anthropic's guidance verbatim for the same reason. They
 * describe what a level is *for*, which is the only thing that tells someone
 * which one to pick; a shorter line of our own would be a guess dressed as
 * advice. Effort is not only thinking depth — a lower level also buys fewer and
 * more consolidated tool calls, less preamble and terser confirmations.
 */
import { EFFORT_LEVELS, type EffortLevel } from "@cawco/core/harness";

export interface EffortLevelOption {
  /** `high` is what the API answers on when nothing asks for a level. */
  apiDefault?: boolean;
  description: string;
  label: string;
  value: EffortLevel;
}

/** What each level is for, in Anthropic's words, and which one the API answers on unasked. */
const ABOUT: Record<
  EffortLevel,
  Pick<EffortLevelOption, "apiDefault" | "description">
> = {
  low: {
    description:
      "Short, scoped tasks and latency-sensitive workloads that are not intelligence-sensitive.",
  },
  medium: {
    description:
      "Cost-sensitive use cases that need to reduce token usage while trading off intelligence.",
  },
  high: {
    description:
      "Balances token usage and intelligence; the recommended minimum for most intelligence-sensitive work.",
    apiDefault: true,
  },
  xhigh: {
    description:
      "The best setting for most coding and agentic use cases; the default in Claude Code.",
  },
  max: {
    description:
      "Can deliver gains in some use cases but may show diminishing returns from increased token usage; can be prone to overthinking.",
  },
};

/** Every level as the picker offers it, in core's order (`EFFORT_LEVELS`). */
export const EFFORT_OPTIONS: EffortLevelOption[] = EFFORT_LEVELS.map(
  (value) => ({ value, label: value, ...ABOUT[value] })
);

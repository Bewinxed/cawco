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
import type { EffortLevel } from "@cawco/core";

export interface EffortLevelOption {
  /** `high` is what the API answers on when nothing asks for a level. */
  apiDefault?: boolean;
  description: string;
  label: string;
  value: EffortLevel;
}

export const EFFORT_LEVELS: EffortLevelOption[] = [
  {
    value: "low",
    label: "low",
    description:
      "Short, scoped tasks and latency-sensitive workloads that are not intelligence-sensitive.",
  },
  {
    value: "medium",
    label: "medium",
    description:
      "Cost-sensitive use cases that need to reduce token usage while trading off intelligence.",
  },
  {
    value: "high",
    label: "high",
    description:
      "Balances token usage and intelligence; the recommended minimum for most intelligence-sensitive work.",
    apiDefault: true,
  },
  {
    value: "xhigh",
    label: "xhigh",
    description:
      "The best setting for most coding and agentic use cases; the default in Claude Code.",
  },
  {
    value: "max",
    label: "max",
    description:
      "Can deliver gains in some use cases but may show diminishing returns from increased token usage; can be prone to overthinking.",
  },
];

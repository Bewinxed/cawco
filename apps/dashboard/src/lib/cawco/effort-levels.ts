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
import type { EffortLevel, ModelInfo } from "@cawco/core";

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

/** What a trigger says for a level, including one the API named and we do not offer. */
export function effortLabel(level: EffortLevel): string {
  return EFFORT_LEVELS.find((option) => option.value === level)?.label ?? level;
}

/** One stop of the scale, and whether the chosen model can actually be run at it. */
export interface EffortStop extends EffortLevelOption {
  reachable: boolean;
}

/**
 * Whether a model has an effort scale worth drawing. Both halves are required:
 * `supportsEffort` alone says a scale exists without saying where it stops, and
 * a slider drawn from that would be five stops of guesswork. Which models reach
 * `xhigh` or `max` changes with every release, so it is never our list to keep.
 */
export function hasEffortScale(model: ModelInfo | null | undefined): boolean {
  return (
    model?.supportsEffort === true &&
    (model.supportedEffortLevels?.length ?? 0) > 0
  );
}

/**
 * The scale as this model can be run at it: every stop, always, each carrying
 * whether the model reaches it. The full five are returned rather than only the
 * reachable ones so the slider stays the same scale on every model — a reader
 * moving from Opus to something shallower sees `max` go out of range instead of
 * seeing the scale silently get shorter.
 */
export function effortStops(model: ModelInfo | null | undefined): EffortStop[] {
  const offered = model?.supportedEffortLevels ?? [];
  return EFFORT_LEVELS.map((option) => ({
    ...option,
    reachable: offered.includes(option.value),
  }));
}

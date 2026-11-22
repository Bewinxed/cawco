<script lang="ts" module>
  import {
    IconError,
    IconHistory,
    IconNotYet,
    IconSuccess,
  } from "#lib/icons.js";
  import type { Answer } from "./outcomes";

  /** A line's answer as its glyph: done, not done, not known, or no longer checked. */
  export const GLYPH = {
    holds: IconSuccess,
    fails: IconError,
    unknown: IconNotYet,
    held: IconHistory,
    failed: IconHistory,
  } as const;
  export const TONE = {
    holds: "text-status-done-glyph",
    fails: "text-status-fail-glyph",
    unknown: "text-status-idle-glyph",
    held: "text-ink-subtle",
    failed: "text-status-fail-glyph",
  } as const;
  /** The finding's ink: a line that is not done reads in the failure's ink; one done, quiet. */
  export const inkOf = (answer: Answer): string => {
    if (answer.kind === "fails" || answer.kind === "failed") {
      return "text-status-fail-ink";
    }
    return answer.kind === "holds" ? "text-ink-muted" : "text-ink-row";
  };
</script>

<script lang="ts">
  /**
   * A line's answer as the card's head draws it: its glyph (DESIGN.md,
   * status reads by glyph, then word, then hue), then what the newest check
   * found, in a few words. The glyph says done, not done or not known; the
   * words say what is going on.
   */
  let { answer, found }: { answer: Answer; found: string } = $props();

  const Glyph = $derived(GLYPH[answer.kind]);
</script>

<span
  data-answer={answer.kind}
  class="mark-line inline-flex min-w-0 items-start gap-space-2 type-label"
>
  <span class="mark-cell">
    <Glyph aria-hidden="true" class="size-icon-md {TONE[answer.kind]}" />
  </span>
  <span class="min-w-0 {inkOf(answer)}">{found}</span>
</span>

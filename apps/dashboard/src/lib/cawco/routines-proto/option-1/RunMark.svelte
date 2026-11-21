<script lang="ts" module>
  import type { RunHow } from "./harbor";

  /** How a run ended, in words: the mark's name and the line beside it. */
  export const RUN_WORDS: Record<RunHow, string> = {
    delivered: "Delivered",
    nothing: "Nothing to report",
    failed: "Failed",
    running: "Running",
    notYet: "Not yet",
    met: "Met",
    couldNot: "Could not check",
  };

  const TODAY = /^Today/u;

  /** How a run ended and when, as one phrase: "Not yet, today 13:34". */
  export const endedWhen = (how: RunHow, when: string): string =>
    `${RUN_WORDS[how]}, ${when.replace(TODAY, "today")}`;
</script>

<script lang="ts">
  /**
   * How one run ended, as a glyph in its own column: shape first, then hue
   * (DESIGN.md: status reads by glyph, then word, then hue). The word is said
   * to a screen reader; a run still going breathes as the live dot.
   */
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import {
    IconError,
    IconNeutral,
    IconNotYet,
    IconSuccess,
    IconSuccessLinear,
    IconWarningTriangle,
  } from "#lib/icons.js";

  let { how }: { how: RunHow } = $props();
</script>

<span
  class="grid size-icon-md flex-none place-items-center"
  data-box
  data-how={how}
>
  <span class="sr-only">{RUN_WORDS[how]}</span>
  {#if how === "running"}
    <LiveDot />
  {:else if how === "delivered"}
    <IconSuccessLinear class="size-icon-md text-status-done-glyph" />
  {:else if how === "met"}
    <IconSuccess class="size-icon-md text-status-done-glyph" />
  {:else if how === "failed"}
    <IconError class="size-icon-md text-status-fail-glyph" />
  {:else if how === "couldNot"}
    <IconWarningTriangle class="size-icon-md text-status-attn-glyph" />
  {:else if how === "notYet"}
    <IconNotYet class="size-icon-md text-ink-muted" />
  {:else}
    <IconNeutral class="size-icon-md text-ink-muted" />
  {/if}
</span>

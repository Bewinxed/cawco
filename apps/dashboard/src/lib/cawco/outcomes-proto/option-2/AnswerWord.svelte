<script lang="ts">
  import {
    IconError,
    IconHistory,
    IconNotYet,
    IconSuccess,
  } from "#lib/icons.js";
  import { answerWord } from "../answer-word";
  /**
   * A line's answer, read by glyph, then word, then hue (DESIGN.md, Status
   * reads by glyph, then word, then hue), in quiet weight: only Needs you
   * is loud on this view. An answer nothing checks any more reads in the
   * past with its date, in muted ink.
   */
  import type { LineAnswer } from "./outcomes";

  let { answer }: { answer: LineAnswer } = $props();
</script>

<span
  class="mark-line inline-flex min-w-0 items-center gap-space-1 type-label text-ink-row"
  data-answer={answer.kind}
>
  {#if answer.kind === "holds"}
    <IconSuccess
      aria-hidden="true"
      class="size-icon-sm flex-none text-status-done-glyph"
    />
  {:else if answer.kind === "fails"}
    <IconError
      aria-hidden="true"
      class="size-icon-sm flex-none text-status-fail-glyph"
    />
  {:else if answer.kind === "unknown"}
    <IconNotYet
      aria-hidden="true"
      class="size-icon-sm flex-none text-status-idle-glyph"
    />
  {:else}
    <IconHistory
      aria-hidden="true"
      class="size-icon-sm flex-none text-ink-subtle"
    />
  {/if}
  <span
    class={[
      "whitespace-nowrap",
      (answer.kind === "held" || answer.kind === "failed") && "text-ink-muted",
    ]}>{answerWord(answer)}</span
  >
</span>

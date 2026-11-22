<script lang="ts">
  /**
   * A line's answer, read by glyph, then word, then hue (DESIGN.md, State),
   * in quiet weight: a check for Holds, a cross for Does not hold, the
   * dotted ring for Not known, and the history glyph for an answer nothing
   * checks any more, said in the past with its day. None of them is loud:
   * only the Needs you mark competes for attention.
   */
  import {
    IconError,
    IconHistory,
    IconNotYet,
    IconSuccess,
  } from "#lib/icons.js";
  import type { Answer } from "./outcomes";
  import { outcomesWords } from "./words";

  let { answer }: { answer: Answer } = $props();

  const GLYPH = {
    holds: IconSuccess,
    fails: IconError,
    unknown: IconNotYet,
    held: IconHistory,
    failed: IconHistory,
  } as const;
  const TONE = {
    holds: "text-status-done-glyph",
    fails: "text-status-fail-glyph",
    unknown: "text-status-idle-glyph",
    held: "text-ink-subtle",
    failed: "text-status-fail-glyph",
  } as const;
  const Glyph = $derived(GLYPH[answer.kind]);
</script>

<span
  data-answer={answer.kind}
  class="mark-line inline-flex min-w-0 items-start gap-space-2 type-label text-ink-muted data-[answer=fails]:text-status-fail-ink data-[answer=failed]:text-status-fail-ink"
>
  <span class="mark-cell">
    <Glyph aria-hidden="true" class="size-icon-md {TONE[answer.kind]}" />
  </span>
  <span class="min-w-0">{outcomesWords.answer(answer)}</span>
</span>

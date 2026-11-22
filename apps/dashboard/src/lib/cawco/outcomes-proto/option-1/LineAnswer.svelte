<script lang="ts">
  /**
   * A line's answer, read by glyph, then word, then hue (DESIGN.md, State),
   * in quiet weight: a check for True, a cross for False, the dotted ring
   * for Not known, and the history glyph for an answer nothing checks any
   * more, said in the past with its day. None of them is loud: only the
   * Needs you mark competes for attention.
   *
   * With `onopen` it is the line's one way in: a quiet button whose words
   * are the answer, opening the card that explains it (its name says the
   * line, the answer and "Show why").
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    IconError,
    IconHistory,
    IconNotYet,
    IconSuccess,
  } from "#lib/icons.js";
  import type { Answer } from "./outcomes";
  import { outcomesWords } from "./words";

  let {
    answer,
    sentence = "",
    open = false,
    onopen,
  }: {
    answer: Answer;
    /** The line's sentence, for the button's name. */
    sentence?: string;
    /** Its card hangs open now. */
    open?: boolean;
    onopen?: () => void;
  } = $props();

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
  const INK = $derived(
    answer.kind === "fails" || answer.kind === "failed"
      ? "text-status-fail-ink"
      : "text-ink-muted"
  );
</script>

{#snippet word()}
  <span class="mark-cell">
    <Glyph aria-hidden="true" class="size-icon-md {TONE[answer.kind]}" />
  </span>
  <span class="min-w-0 text-start {INK}">{outcomesWords.answer(answer)}</span>
{/snippet}

{#if onopen}
  <!-- The button's inset reaches past the column on either side, so its
       words start on the column's edge and keep the column's whole width. -->
  <span class="-mx-space-2 flex min-w-0">
    <Button
      aria-expanded={open}
      aria-label={outcomesWords.why(sentence, answer)}
      class="max-w-full"
      data-answer={answer.kind}
      data-line-open
      fit="word"
      onclick={onopen}
      press="pressable"
      size="xs"
      tone="muted"
      variant="ghost"
    >
      {@render word()}
    </Button>
  </span>
{:else}
  <span
    data-answer={answer.kind}
    class="mark-line inline-flex min-w-0 items-start gap-space-2 type-label"
  >
    {@render word()}
  </span>
{/if}

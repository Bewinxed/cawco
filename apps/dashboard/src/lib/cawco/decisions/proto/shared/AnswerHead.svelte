<script lang="ts">
  /**
   * An answer's head: the press that picks it and clears it, so the live
   * frame under it stays his to operate. Its keycap, its name, the marks
   * that are facts about it (Recommended, Today, Settled by, New), what it
   * gets and what it costs as two plain sentences, the questions it opens,
   * and under a fold what it builds. Picked, it takes the coral edge and its
   * keycap fills (ui/chip `option`). It is an option of the OptionGroup
   * its question stands in, so the arrows walk the answers and a digit
   * picks while focus is in them; the press on a picked head clears it.
   */
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Kbd } from "#lib/components/ui/kbd/index.js";
  import { OptionGroupItem } from "#lib/components/ui/option-group/index.js";
  import { cn } from "#lib/utils.js";
  import type { DecisionState } from "./decision.svelte";
  import type { Answer, Question } from "./request";

  let {
    dec,
    question,
    answer,
    index,
    lines = true,
    class: className,
  }: {
    dec: DecisionState;
    question: Question;
    answer: Answer;
    index: number;
    /** Its get and cost sentences, and the fold; off where the head is a segment. */
    lines?: boolean;
    class?: string;
  } = $props();

  const settled = $derived(
    dec.settledBy(question) !== null && question.settled?.answer === answer.id
  );
  const follows = $derived(dec.follows(question, answer).length);
</script>

<div class={cn("flex min-w-0 flex-col gap-space-2", className)}>
  <OptionGroupItem
    value={answer.id}
    digit={index + 1}
    data-chosen={settled || undefined}
    onclick={(event) => {
      event.preventDefault();
      dec.pick(question.id, answer.id);
    }}
  >
    <Kbd look="keycap" reach="keyboard">{index + 1}</Kbd>
    <span class="flex min-w-0 flex-col gap-space-1" data-box>
      <span
        class="flex min-w-0 flex-wrap items-center gap-x-space-2 gap-y-space-1"
      >
        <span class="type-label text-ink-strong">{answer.name}</span>
        {#if answer.recommended}
          <Badge variant="secondary"><span>Recommended</span></Badge>
        {/if}
        {#if answer.today}
          <Badge variant="secondary"><span>Today</span></Badge>
        {/if}
        {#if answer.fresh}
          <Badge><span>New</span></Badge>
        {/if}
        {#if settled && question.settled}
          <Badge variant="secondary"
            ><span>Settled by {question.settled.by}</span></Badge
          >
        {/if}
      </span>
      {#if lines}
        <span class="type-body text-ink-strong">{answer.line}</span>
        <span class="type-body text-ink-muted">{answer.cost}</span>
      {/if}
      {#if follows > 0}
        <span class="type-meta text-ink-muted">
          {follows === 1 ? "1 question follows" : `${follows} questions follow`} if
          you pick this
        </span>
      {/if}
    </span>
  </OptionGroupItem>
  {#if lines}
    <details class="type-meta text-ink-muted">
      <summary>What changes</summary>
      <p class="type-body pt-space-1 text-ink-strong">{answer.builds}</p>
    </details>
  {/if}
</div>

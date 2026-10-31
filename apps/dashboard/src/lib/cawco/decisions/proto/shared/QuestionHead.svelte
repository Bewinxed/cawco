<script lang="ts">
  /**
   * A question's own words: what changed since he sent, which pick opened
   * it, the question, the recommendation with its fact, a settlement's
   * reason and sources (or that he overruled it), and the work waiting on it.
   */
  import { Badge } from "#lib/components/ui/badge/index.js";
  import type { DecisionState } from "./decision.svelte";
  import type { Question } from "./request";

  let {
    dec,
    question,
    level = 2,
  }: {
    dec: DecisionState;
    question: Question;
    /** Its heading's level in the page. */
    level?: 2 | 3;
  } = $props();

  const parent = $derived(
    question.after
      ? dec.all.find((q) => q.id === question.after?.question)
      : undefined
  );
  const unlockedBy = $derived(
    parent?.answers.find((a) => a.id === question.after?.answer)?.name
  );
  const overruled = $derived(
    !!question.settled &&
      !!dec.picks[question.id]?.length &&
      dec.overruled[question.id]
  );
</script>

<div class="flex min-w-0 flex-col gap-space-1">
  {#if question.changed || question.fresh}
    <span class="flex">
      <Badge
        ><span>{question.fresh ? "New since you sent" : question.changed}</span
        ></Badge
      >
    </span>
  {/if}
  {#if unlockedBy}
    <span class="type-meta text-ink-muted"
      >Unlocked by your pick of {unlockedBy}</span
    >
  {/if}
  <svelte:element
    this={`h${level}`}
    class="type-title text-balance text-ink-strong"
  >
    {question.question}
  </svelte:element>
  <p class="type-body text-pretty text-ink-muted">{question.recommends}</p>
  {#if question.settled}
    {#if overruled}
      <p class="type-meta text-ink-strong">
        Yours · overruled {question.settled.by}
      </p>
    {:else if !dec.picks[question.id]?.length}
      <p class="type-meta text-ink-muted">
        Settled by {question.settled.by}: {question.settled.why} Source: {question.settled.sources.join(
          ", "
        )}.
      </p>
    {/if}
  {/if}
  {#if question.waiting?.length}
    <p class="type-meta text-ink-muted">
      Waiting on this: {question.waiting.join(" · ")}
    </p>
  {/if}
</div>

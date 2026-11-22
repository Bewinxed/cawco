<script lang="ts" module>
  import { type Outcome, unsettled } from "./outcomes";

  /** A one-line tile's trailing summary: what is unsettled, by count, or Met. */
  export const summaryOf = (outcome: Outcome): string => {
    const count = (kinds: string[]) =>
      outcome.lines.filter((line) => kinds.includes(line.answer.kind)).length;
    const parts = [
      [count(["fails"]), "does not hold"],
      [count(["unknown"]), "not known"],
      [count(["held", "failed"]), "no longer checked"],
    ] as const;
    const said = parts
      .filter(([n]) => n > 0)
      .map(([n, words]) => `${n} ${words}`);
    return said.length > 0 ? said.join(", ") : "Met";
  };
</script>

<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
  /**
   * An outcome's tile in the bento (option 2, decisions 6 and 7). `full`:
   * no lead is open, so every line is spelled out with its answer, the
   * Room rule folding them only when the frame is short (`fold`). `compact`:
   * a lead is open, so the tile stands at the Room rule's step 3 at least:
   * its unsettled lines spelled out, the rest as "and 2 that hold", or
   * "Met, still watched". `line` (under 640, beside a lead): the sentence
   * on one line and a trailing summary. The Needs you line (S2) leads the
   * tile when something under it waits on him; its control and the tile's
   * open control both make the outcome the lead.
   */
  import { IconNeedsYou } from "#lib/icons.js";
  import AnswerWord from "./AnswerWord.svelte";
  import OpenControl from "./OpenControl.svelte";
  import { met, type RunQuestion } from "./outcomes";

  let {
    outcome,
    form,
    fold,
    ask,
    onlead,
  }: {
    outcome: Outcome;
    form: "full" | "compact" | "line";
    /** The Room rule's step for the whole bento, 0 to 4. */
    fold: number;
    /** The oldest unanswered ask under it; null when nothing waits on him. */
    ask: RunQuestion | null;
    onlead: () => void;
  } = $props();

  const isMet = $derived(met(outcome));
  const holding = $derived(
    outcome.lines.filter((line) => !unsettled(line.answer))
  );
  /** The lines spelled out: all of them, or the unsettled ones from step 3, none for a met outcome from step 2. */
  const spelled = $derived.by(() => {
    if (isMet && fold >= 2) {
      return [];
    }
    return fold >= 3
      ? outcome.lines.filter((line) => unsettled(line.answer))
      : outcome.lines;
  });
  const folded = $derived.by(() => {
    if (isMet && fold >= 2) {
      return fold >= 3 ? null : `All ${outcome.lines.length} hold`;
    }
    if (fold >= 3 && holding.length > 0) {
      return `and ${holding.length} that hold${holding.length === 1 ? "s" : ""}`;
    }
    return null;
  });
</script>

{#if form === "line"}
  <article
    aria-label={outcome.sentence}
    class="mark-line flex min-w-0 items-center gap-space-2 rounded-lg bg-surface-raised py-space-1 ps-space-3 pe-space-2 shadow-tile"
    data-slot="tile"
  >
    {#if ask}
      <IconNeedsYou
        aria-label="Needs you"
        class="size-icon-sm flex-none text-status-attn-glyph"
      />
    {/if}
    <span
      class="min-w-0 flex-1 overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-strong"
      >{outcome.sentence}</span
    >
    <span
      class={[
        "type-meta whitespace-nowrap",
        isMet ? "text-ink-muted" : "text-ink-row",
      ]}>{summaryOf(outcome)}</span
    >
    <span data-box
      ><OpenControl label="Open {outcome.sentence}" onopen={onlead} /></span
    >
  </article>
{:else}
  <article
    aria-label={outcome.sentence}
    class="flex min-w-0 flex-col gap-space-3 rounded-lg bg-surface-raised p-space-4 shadow-tile"
    data-slot="tile"
  >
    {#if ask}
      <div class="flex min-w-0 flex-col gap-space-2" data-slot="needs-you">
        <!-- mark-line: the mark stands at the first of two lines of words. -->
        <p class="flex min-w-0 gap-space-2 type-label">
          <IconNeedsYou
            aria-hidden="true"
            class="mt-px size-icon-sm flex-none text-status-attn-glyph"
          />
          <span class="line-clamp-2 min-w-0">
            <span class="text-status-attn-ink">{ask.who} asks:</span>
            <span class="text-ink-strong">{ask.quote}</span>
          </span>
        </p>
        <span class="ps-space-5">
          <Button
            label="Answer the question"
            onclick={onlead}
            size="xs"
            variant="outline"
          />
        </span>
      </div>
    {/if}

    <div class="flex min-w-0 items-start gap-space-2">
      <h2
        class={[
          "min-w-0 flex-1 pt-px type-label text-ink-strong",
          form === "compact" && "line-clamp-2",
        ]}
      >
        {outcome.sentence}
      </h2>
      <span class="-my-space-1" data-box
        ><OpenControl label="Open {outcome.sentence}" onopen={onlead} /></span
      >
    </div>

    {#if isMet}
      <p class="type-meta text-ink-muted">Met, still watched</p>
    {/if}

    {#if spelled.length > 0 || folded}
      <div class="flex min-w-0 flex-col gap-space-1">
        {#if form === "full" && spelled.length === outcome.lines.length}
          <p class="type-meta text-ink-muted">Done when:</p>
        {/if}
        {#if spelled.length > 0}
          <ul class="flex min-w-0 flex-col gap-space-2">
            {#each spelled as line (line.id)}
              <li
                class="grid grid-cols-(--line-cols) items-start gap-x-space-3"
                style:--line-cols={"minmax(0, 1fr) var(--spacing-c-answer-w)"}
              >
                <span class="min-w-0 type-meta text-ink-row"
                  >{line.sentence}</span
                >
                <AnswerWord answer={line.answer} />
              </li>
            {/each}
          </ul>
        {/if}
        {#if folded}
          <p class="type-meta text-ink-muted">{folded}</p>
        {/if}
      </div>
    {/if}
  </article>
{/if}

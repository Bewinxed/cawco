<script lang="ts">
  /**
   * One outcome on the first view: his sentence, then one line of where it
   * stands, led by its glyph and state word, and its one open control
   * (designing-first-views, step 3: a name, one sentence, one mark). Its
   * lines, what checks them and the work under it wait until he opens it.
   * Where a run's question waits on him, the question is that line: the
   * Needs you glyph and word, the ask and its two answers, on the needs
   * tint, the one thing on the view in colour; where the tile has more
   * room than the ask, the ask stands at its foot, its sentence at its
   * head. Once the hub takes his
   * answer the tile keeps its place and size for the visit, and its line
   * says what his answer set going.
   */
  import AskInline from "./AskInline.svelte";
  import OpenControl from "./OpenControl.svelte";
  import {
    type AnswerState,
    type Outcome,
    type RunQuestion,
    stateOf,
  } from "./outcomes";
  import StateGlyph from "./StateGlyph.svelte";
  import { outcomeStateWord, words } from "./words";

  let {
    outcome,
    ask,
    answer,
    offline,
    onopen,
    onanswer,
  }: {
    outcome: Outcome;
    /** The run's question that waits on him, or that he answered this visit; null for none. */
    ask: RunQuestion | null;
    answer: AnswerState;
    offline: string | null;
    onopen: () => void;
    onanswer: (choice: string) => void;
  } = $props();

  const state = $derived(stateOf(outcome));
  const waiting = $derived(ask !== null && answer.kind !== "answered");
</script>

<article
  aria-label={outcome.sentence}
  class={[
    "flex h-full min-w-0 flex-col gap-space-2 rounded-lg p-space-4 shadow-tile transition-colors duration-(--duration-control) ease-out @max-phone:gap-space-1 @max-phone:px-space-3 @max-phone:py-space-2",
    waiting ? "bg-needs-ground" : "bg-surface-raised",
  ]}
  data-slot="outcome"
  data-waiting={waiting || undefined}
>
  <div class="flex min-w-0 items-start gap-space-3">
    <h2 class="min-w-0 flex-1 pt-px type-row font-medium text-ink-strong">
      {outcome.sentence}
    </h2>
    <span class="-my-px flex-none">
      <OpenControl label={words.open(outcome.sentence)} {onopen} />
    </span>
  </div>

  {#if waiting && ask}
    <!-- mark-line: the glyph stands at the first line of the ask, in a box a line tall -->
    <div class="mt-auto flex min-w-0 gap-space-2">
      <StateGlyph state="needsYou" />
      <div class="flex min-w-0 flex-1 flex-col">
        <span class="sr-only">{words.needsYou}.</span>
        <AskInline {answer} {ask} lead {offline} {onanswer} />
      </div>
    </div>
  {:else}
    <!-- mark-line: the glyph stands at the first of its sentence's lines, in a box a line tall -->
    <div class="flex min-w-0 gap-space-2">
      <StateGlyph quiet {state} />
      <p class="min-w-0 flex-1 type-body text-ink-row">
        <span class="font-medium text-ink-strong"
          >{outcomeStateWord(state)}.</span
        >
        {outcome.standing}
      </p>
    </div>
  {/if}
</article>

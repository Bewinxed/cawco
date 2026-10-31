<script lang="ts">
  /**
   * The sequence's stepper, one glass group (T2): either end, one step back
   * or on, and the place in words ("3 of 6"); what a structure adds beside
   * it (the field's "Stood on") follows inside the group. A structure that
   * steps its own way (the pair promotes Next) says so through `onprev` and
   * `onnext`.
   */
  import { designGraphWords } from "@cawco/core/words/design-graph";
  import { graphProtoWords as words } from "@cawco/core/words/graph-proto";
  import type { Snippet } from "svelte";
  import GlassGroup from "#lib/cawco/preview/graph/GlassGroup.svelte";
  import { SYMBOL } from "#lib/cawco/preview/graph/symbol.js";
  import { IconChevronLeft, IconChevronRight } from "#lib/icons.js";
  import type { Judge } from "./judge.svelte";
  import { SEQUENCE, stateOf } from "./review.svelte";

  let {
    judge,
    ends = true,
    onprev,
    onnext,
    canNext,
    class: className = "",
    children,
  }: {
    judge: Judge;
    /** The first and last step's buttons. */
    ends?: boolean;
    onprev?: () => void;
    onnext?: () => void;
    /** Whether a step on is there; the sequence's end by default. */
    canNext?: boolean;
    class?: string;
    children?: Snippet;
  } = $props();

  const last = SEQUENCE.length - 1;
  const forward = $derived(canNext ?? judge.at < last);
</script>

<GlassGroup class="mark-line {className}" label={designGraphWords.slider}>
  {#if ends}
    <button
      data-box
      aria-label={words.firstStep}
      class="{SYMBOL} grid-flow-col"
      disabled={judge.at <= 0}
      onclick={() => judge.end("first")}
      title={words.firstStep}
      type="button"
      ><IconChevronLeft /><IconChevronLeft class="-ms-space-3" /></button
    >
  {/if}
  <button
    data-box
    aria-label={designGraphWords.previousStep}
    class={SYMBOL}
    disabled={judge.at <= 0}
    onclick={() => (onprev ? onprev() : judge.step(-1))}
    title={designGraphWords.previousStep}
    type="button"><IconChevronLeft /></button
  >
  <span
    class="relative min-w-c-steps-stop-min-w px-space-1 text-center type-label tabular-nums"
    >{judge.at >= 0
      ? designGraphWords.stepOf(judge.at + 1, SEQUENCE.length)
      : stateOf(judge.kept).name}</span
  >
  <button
    data-box
    aria-label={designGraphWords.nextStep}
    class={SYMBOL}
    disabled={!forward}
    onclick={() => (onnext ? onnext() : judge.step(1))}
    title={designGraphWords.nextStep}
    type="button"><IconChevronRight /></button
  >
  {#if ends}
    <button
      data-box
      aria-label={words.lastStep}
      class="{SYMBOL} grid-flow-col"
      disabled={judge.at === last}
      onclick={() => judge.end("last")}
      title={words.lastStep}
      type="button"
      ><IconChevronRight /><IconChevronRight class="-ms-space-3" /></button
    >
  {/if}
  {@render children?.()}
</GlassGroup>

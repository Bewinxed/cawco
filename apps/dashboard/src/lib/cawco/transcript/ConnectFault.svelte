<script lang="ts">
  /**
   * A connect ask whose sign-in did not come back, in the card's centre:
   * Caw over what happened, then what is safe and the way on, in the error
   * formula (WORDS.md), and the provider's or the hub's own words folded
   * under Show details (DESIGN.md, The Work Outlives Its Surface Rule: "its
   * details kept under Show details"). The card's foot carries Try again
   * and Not now.
   *
   * Caw is drawn in his needs-you file, still: there is no failed Caw, and
   * the ask is waiting on the person again.
   */
  import { shellWords } from "@cawco/core";
  import { Button } from "#lib/components/ui/button/index.js";
  import Caw from "../home/Caw.svelte";
  import { unfold } from "../motion/fold.svelte";

  let {
    title,
    next,
    details,
  }: {
    /** What happened, the line the card is about now. */
    title: string;
    /** What is safe, and what to do. */
    next: string;
    /** Word for word, as it came back. */
    details: string;
  } = $props();

  let shown = $state(false);
  const detailsId = $props.id();
</script>

<div
  data-slot="connect-fault"
  class="flex flex-col items-center gap-space-2 py-space-3 text-center"
  role="alert"
>
  <div class="grid place-items-center" aria-hidden="true">
    <Caw size={56} status="needs-you" still />
  </div>
  <p
    class="m-0 max-w-c-measure text-size-body font-medium leading-body text-ink-strong text-balance"
  >
    {title}
  </p>
  <p
    class="m-0 max-w-c-measure text-size-label text-ink-muted text-pretty wrap-anywhere"
  >
    {next}
  </p>
  <Button
    aria-controls={detailsId}
    aria-expanded={shown}
    label={shown ? shellWords.hideDetails : shellWords.showDetails}
    onclick={() => {
      shown = !shown;
    }}
    size="xs"
    variant="ghost"
  />
  {#if shown}
    <p
      id={detailsId}
      data-slot="details"
      class="m-0 self-stretch text-start type-meta font-mono whitespace-pre-wrap wrap-anywhere text-ink-muted"
      transition:unfold
    >
      {details}
    </p>
  {/if}
</div>
